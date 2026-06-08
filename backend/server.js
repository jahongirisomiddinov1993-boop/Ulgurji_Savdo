const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { createClerkClient } = require('@clerk/backend');
require('dotenv').config();

// Global xato ushlagich — server o'chib qolmasligi uchun
process.on('uncaughtException', (err) => {
  console.error('❌ uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason?.message || reason);
});

const app = express();

// 1. Xavfsizlik headerlari (XSS, clickjacking, MIME-sniffing va h.k. dan himoya)
app.use(helmet());

// 2. CORS — faqat ruxsat berilgan originlardan so'rov qabul qilish
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'http://localhost:3000')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Origin yo'q (curl, Postman, SSR) — ishlab chiqishda ruxsat
    if (!origin) return callback(null, true);
    // Localhost har qanday portda ruxsat (development)
    if (origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    if (origin && /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: ${origin} ruxsatsiz manba`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 3. JSON body parser (50MB limit — backup restore uchun)
app.use(express.json({ limit: '50mb' }));

// 4. Rate limiting — 15 daqiqada 300 so'rovdan oshmasin
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p so\'rov yuborildi. Biroz kuting.' },
});

// Login uchun qat'iyroq cheklov — 15 daqiqada 20 urinish
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda ko\'p kirish urinishi. 15 daqiqadan keyin qayta urining.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

// PostgreSQL ulanish
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'ulgurji_savdo',
  port: parseInt(process.env.PGPORT) || 5432,
});

// DB ulanishni tekshirish
pool.query('SELECT NOW()')
  .then(() => console.log('✅ PostgreSQL ga muvaffaqiyatli ulandi'))
  .catch(err => console.error('❌ PostgreSQL ulanish xatosi:', err.message));

// Clerk initialization
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// ============================================
// CLERK WEBHOOK — Clerk user yaratilganda avtomatik biznes user yaratish
// ============================================
app.post('/api/clerk/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const evt = await clerk.webhooks.verify({
      payload: req.body,
      header: req.headers,
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (evt.type === 'user.created') {
      const { id, email_addresses, first_name, last_name } = evt.data;
      const email = email_addresses[0]?.email_address;
      const fullName = `${first_name || ''} ${last_name || ''}`.trim() || email.split('@')[0];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const businessRes = await client.query(
          'INSERT INTO businesses (business_name) VALUES ($1) RETURNING id',
          [`${fullName}'s Business`]
        );
        const businessId = businessRes.rows[0].id;

        await client.query(
          `INSERT INTO users (business_id, username, password_hash, role, full_name, clerk_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [businessId, email.split('@')[0], 'clerk_auth', 'admin', fullName, id]
        );

        await client.query('COMMIT');
        console.log(`✅ Clerk user created: ${id} -> Business ID: ${businessId}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Clerk webhook error:', err.message);
        return res.status(500).json({ error: err.message });
      } finally {
        client.release();
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('❌ Clerk webhook verification error:', err.message);
    res.status(400).json({ error: 'Webhook verification failed' });
  }
});

// Telegram bot — parol tiklash uchun
const telegramBot = require('./services/telegramBot');
telegramBot.init(pool);

// Auth routes (register, login, me, users, forgot/reset-password, telegram-link)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes(pool));

// Auth middleware import
const { authenticateToken, authorizeRoles } = require('./middleware/authMiddleware');

// ============================================
// KASSA SMENA — Yordamchi funksiyalar
// ============================================

// Aktiv smenani olish (business_id + valuta bo'yicha)
async function getActiveSmena(dbClient, business_id, valuta) {
  const { rows } = await dbClient.query(
    `SELECT * FROM kassa_smena WHERE business_id = $1 AND valuta = $2 AND status = 'open' LIMIT 1`,
    [business_id, valuta]
  );
  return rows[0] || null;
}

// Yangi smena ochish (oldingi smenadan qoldiq avto-yuklanadi)
async function autoOpenSmena(dbClient, business_id, valuta, user_id) {
  // Oldingi yopilgan smenaning closing_balance ni olish
  const { rows: prev } = await dbClient.query(
    `SELECT closing_balance FROM kassa_smena
     WHERE business_id = $1 AND valuta = $2 AND status = 'closed'
     ORDER BY closed_at DESC NULLS LAST LIMIT 1`,
    [business_id, valuta]
  );
  const openingBalance = prev.length > 0 && prev[0].closing_balance != null
    ? parseFloat(prev[0].closing_balance)
    : 0;

  const { rows } = await dbClient.query(
    `INSERT INTO kassa_smena (business_id, opened_by, valuta, opened_at, status, opening_balance)
     VALUES ($1, $2, $3, NOW(), 'open', $4) RETURNING *`,
    [business_id, user_id, valuta, openingBalance]
  );
  return rows[0];
}

// Aktiv smena borligini ta'minlash (yo'q bo'lsa avto-ochadi)
async function ensureActiveSmena(dbClient, business_id, valuta, user_id) {
  let smena = await getActiveSmena(dbClient, business_id, valuta);
  if (!smena) {
    smena = await autoOpenSmena(dbClient, business_id, valuta, user_id);
  }
  return smena;
}

// Eskirgan smenalarni avto-yopish (24 soatdan oshgan)
async function autoCloseStaleSmenas(dbClient, business_id) {
  const { rows: stale } = await dbClient.query(
    `SELECT id FROM kassa_smena
     WHERE business_id = $1 AND status = 'open' AND opened_at < NOW() - INTERVAL '24 hours'`,
    [business_id]
  );
  for (const s of stale) {
    // Smena tranzaksiyalari bo'yicha jamini hisoblash
    const { rows: totals } = await dbClient.query(
      `SELECT
         COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='naqd' THEN summa ELSE 0 END), 0) AS naqd_in,
         COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='karta' THEN summa ELSE 0 END), 0) AS karta_in,
         COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='kochirma' THEN summa ELSE 0 END), 0) AS kochirma_in,
         COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='naqd' THEN summa ELSE 0 END), 0) AS naqd_out,
         COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='karta' THEN summa ELSE 0 END), 0) AS karta_out,
         COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='kochirma' THEN summa ELSE 0 END), 0) AS kochirma_out
       FROM kassa WHERE smena_id = $1`,
      [s.id]
    );
    const t = totals[0];
    const smenaData = (await dbClient.query('SELECT opening_balance FROM kassa_smena WHERE id=$1', [s.id])).rows[0];
    const opening = parseFloat(smenaData.opening_balance) || 0;
    const closingBalance = opening
      + parseFloat(t.naqd_in) + parseFloat(t.karta_in) + parseFloat(t.kochirma_in)
      - parseFloat(t.naqd_out) - parseFloat(t.karta_out) - parseFloat(t.kochirma_out);

    await dbClient.query(
      `UPDATE kassa_smena SET
         status='closed', closed_at=NOW(), auto_closed=TRUE,
         total_naqd_in=$2, total_karta_in=$3, total_kochirma_in=$4,
         total_naqd_out=$5, total_karta_out=$6, total_kochirma_out=$7,
         closing_balance=$8
       WHERE id=$1`,
      [s.id, t.naqd_in, t.karta_in, t.kochirma_in, t.naqd_out, t.karta_out, t.kochirma_out, closingBalance]
    );
  }
  return stale.length;
}

// Middleware: har request da eskirgan smenalarni avto-yopish
const autoCloseMiddleware = async (req, res, next) => {
  if (req.user && req.user.business_id) {
    try { await autoCloseStaleSmenas(pool, req.user.business_id); } catch (e) { /* silent */ }
  }
  next();
};
app.use('/api/kassa', authenticateToken, autoCloseMiddleware);
app.use('/api/kassa-smena', authenticateToken, autoCloseMiddleware);

// ============================================
// PRODUCTS (Mahsulotlar) — CRUD
// Barcha so'rovlar authenticateToken orqali himoyalangan
// Barcha querylar business_id bo'yicha filtrlangan
// ============================================

// GET — faqat o'z biznesining mahsulotlari
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE business_id = $1 ORDER BY id',
      [req.user.business_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET — bitta mahsulot (faqat o'z biznesidan)
app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND business_id = $2',
      [req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST — yangi mahsulot qo'shish (business_id avtomatik biriktiriladi)
app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, quantity, price_usd, price_uzs, unit } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Mahsulot nomi majburiy' });
    }
    const { rows } = await pool.query(
      `INSERT INTO products (business_id, name, quantity, price_usd, price_uzs, unit)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.business_id, name, quantity || 0, price_usd || 0, price_uzs || 0, unit || 'dona']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT — mahsulotni yangilash (faqat o'z biznesidagi)
app.put('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { name, quantity, price_usd, price_uzs, unit } = req.body;
    const { rows } = await pool.query(
      `UPDATE products SET name=$1, quantity=$2, price_usd=$3, price_uzs=$4, unit=$5
       WHERE id=$6 AND business_id=$7 RETURNING *`,
      [name, quantity, price_usd, price_uzs, unit || 'dona', req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — mahsulotni o'chirish (faqat o'z biznesidagi)
app.delete('/api/products/:id', authenticateToken, authorizeRoles('admin', 'warehouse_keeper'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM products WHERE id=$1 AND business_id=$2 RETURNING *',
      [req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    res.json({ message: 'Mahsulot o\'chirildi', product: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CLIENTS (Klientlar) — CRUD
// client_type = 'customer'
// ============================================

app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.full_name as assigned_user_name
       FROM clients c
       LEFT JOIN users u ON c.assigned_user_id = u.id
       WHERE c.business_id = $1 AND c.client_type = 'customer'
       ORDER BY c.id`,
      [req.user.business_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.full_name as assigned_user_name
       FROM clients c
       LEFT JOIN users u ON c.assigned_user_id = u.id
       WHERE c.id = $1 AND c.business_id = $2 AND c.client_type = 'customer'`,
      [req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Klient topilmadi' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/clients/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
  try {
    const { full_name, phone, address, balance_usd, balance_uzs, assigned_user_id } = req.body;
    if (!full_name) {
      return res.status(400).json({ error: 'Klient ismi majburiy' });
    }
    
    // Qat'iy 'customer'
    const safeClientType = 'customer';

    const { rows } = await pool.query(
      `INSERT INTO clients (business_id, client_type, full_name, phone, address, balance_usd, balance_uzs, assigned_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.business_id, safeClientType, full_name, phone || null, address || null, balance_usd || 0, balance_uzs || 0, assigned_user_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/clients error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    const { full_name, phone, address, balance_usd, balance_uzs, assigned_user_id } = req.body;
    
    // Qat'iy 'customer'
    const safeClientType = 'customer';

    const { rows } = await pool.query(
      `UPDATE clients SET full_name=$1, phone=$2, address=$3, balance_usd=$4, balance_uzs=$5, assigned_user_id=$6, client_type=$7
       WHERE id=$8 AND business_id=$9 AND client_type='customer' RETURNING *`,
      [full_name, phone, address, balance_usd, balance_uzs, assigned_user_id, safeClientType, req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Klient topilmadi' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/clients/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM clients WHERE id=$1 AND business_id=$2 AND client_type='customer' RETURNING *",
      [req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Klient topilmadi' });
    res.json({ message: 'Klient o\'chirildi', client: rows[0] });
  } catch (err) {
    console.error('DELETE /api/clients/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SUPPLIERS (Pudratchilar) — CRUD
// client_type = 'supplier' (clients jadvalida)
// ============================================

app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.full_name as assigned_user_name
       FROM clients c
       LEFT JOIN users u ON c.assigned_user_id = u.id
       WHERE c.business_id = $1 AND c.client_type = 'supplier'
       ORDER BY c.id`,
      [req.user.business_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/suppliers/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.full_name as assigned_user_name
       FROM clients c
       LEFT JOIN users u ON c.assigned_user_id = u.id
       WHERE c.id = $1 AND c.business_id = $2 AND c.client_type = 'supplier'`,
      [req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pudratchi topilmadi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    const { full_name, phone, address, balance_usd, balance_uzs, assigned_user_id } = req.body;
    if (!full_name) {
      return res.status(400).json({ error: 'Pudratchi nomi majburiy' });
    }
    const { rows } = await pool.query(
      `INSERT INTO clients (business_id, client_type, full_name, phone, address, balance_usd, balance_uzs, assigned_user_id)
       VALUES ($1, 'supplier', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.business_id, full_name, phone || null, address || null, balance_usd || 0, balance_uzs || 0, assigned_user_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suppliers/:id', authenticateToken, async (req, res) => {
  try {
    const { full_name, phone, address, balance_usd, balance_uzs, assigned_user_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE clients SET full_name=$1, phone=$2, address=$3, balance_usd=$4, balance_uzs=$5, assigned_user_id=$6
       WHERE id=$7 AND business_id=$8 AND client_type='supplier' RETURNING *`,
      [full_name, phone, address, balance_usd, balance_uzs, assigned_user_id, req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pudratchi topilmadi' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM clients WHERE id=$1 AND business_id=$2 AND client_type='supplier' RETURNING *",
      [req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Pudratchi topilmadi' });
    res.json({ message: 'Pudratchi o\'chirildi', supplier: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// TRANSACTIONS (Tranzaktsiyalar) — GET/POST
// user_id avtomatik biriktiriladi (req.user.id)
// Har bir tranzaksiyada kim (qaysi xodim) qilgani saqlanadi
// ============================================

app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { transaction_type, client_id, product_id, group_id, from, to } = req.query;

    let query = `
      SELECT t.*,
             c.full_name as client_name,
             c.client_type as client_type,
             u.full_name as user_name,
             u.username as user_username,
             u.role as user_role,
             p.name as product_name
      FROM transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN products p ON t.product_id = p.id
      WHERE t.business_id = $1
    `;
    const params = [req.user.business_id];
    let idx = 2;

    if (transaction_type) {
      query += ` AND t.transaction_type = $${idx}`;
      params.push(transaction_type); idx++;
    }
    if (client_id) {
      query += ` AND t.client_id = $${idx}`;
      params.push(parseInt(client_id)); idx++;
    }
    if (product_id) {
      query += ` AND t.product_id = $${idx}`;
      params.push(parseInt(product_id)); idx++;
    }
    if (group_id) {
      query += ` AND t.group_id = $${idx}`;
      params.push(group_id); idx++;
    }
    if (from) {
      query += ` AND t.created_at >= $${idx}`;
      params.push(new Date(from)); idx++;
    }
    if (to) {
      query += ` AND t.created_at <= $${idx}`;
      params.push(new Date(to + 'T23:59:59')); idx++;
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description } = req.body;
    if (!transaction_type) {
      return res.status(400).json({ error: 'transaction_type majburiy maydon' });
    }

    // Agar client_id berilgan bo'lsa — o'z biznesiga tegishliligini tekshirish
    if (client_id) {
      const clientCheck = await pool.query(
        'SELECT id FROM clients WHERE id = $1 AND business_id = $2',
        [client_id, req.user.business_id]
      );
      if (clientCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Klient topilmadi yoki sizning biznesingizga tegishli emas' });
      }
    }

    // Tranzaksiyani yaratish — user_id avtomatik tokendan olinadi
    const insertResult = await pool.query(
      `INSERT INTO transactions (business_id, user_id, client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.business_id, req.user.id, client_id || null, transaction_type, amount_usd || 0, amount_uzs || 0, exchange_rate || 0, description || null]
    );

    // Yaratilgan tranzaksiyani xodim va klient ma'lumotlari bilan qaytarish
    const { rows } = await pool.query(`
      SELECT t.*,
             c.full_name as client_name,
             u.full_name as user_name,
             u.username as user_username,
             u.role as user_role
      FROM transactions t
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `, [insertResult.rows[0].id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE — tranzaksiyani o'chirish
app.delete('/api/transactions/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM transactions WHERE id=$1 AND business_id=$2 RETURNING *',
      [req.params.id, req.user.business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tranzaksiya topilmadi' });
    res.json({ message: 'Tranzaksiya o\'chirildi', transaction: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// KASSA — GET/POST
// Pul oqimi (kirim/chiqim) — business_id bilan himoyalangan
// ============================================

app.get('/api/kassa', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT k.*, u.full_name as user_name, c.full_name as client_name
       FROM kassa k
       LEFT JOIN users u ON k.user_id = u.id
       LEFT JOIN clients c ON k.client_id = c.id
       WHERE k.business_id = $1
       ORDER BY k.created_at DESC`,
      [req.user.business_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/kassa', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    const { summa, valuta, turi, izoh, sana, payment_method } = req.body;
    if (!summa || !turi) {
      return res.status(400).json({ error: 'summa va turi majburiy maydonlar' });
    }
    const business_id = req.user.business_id;
    const user_id = req.user.id;
    const v = valuta || 'UZS';
    const pm = payment_method || 'naqd';
    const createdDate = sana ? new Date(sana) : new Date();

    // Aktiv smenani ta'minlash (yo'q bo'lsa avto-ochadi)
    const smena = await ensureActiveSmena(dbClient, business_id, v, user_id);

    const { rows } = await dbClient.query(
      `INSERT INTO kassa (business_id, user_id, smena_id, summa, valuta, turi, payment_method, izoh, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [business_id, user_id, smena.id, summa, v, turi, pm, izoh || null, createdDate]
    );
    await dbClient.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// ============================================
// KASSA SMENA — CRUD endpointlari
// ============================================

// GET /api/kassa-smena/active — Joriy ochiq smenalar (UZS va/yoki USD)
app.get('/api/kassa-smena/active', authenticateToken, async (req, res) => {
  try {
    const business_id = req.user.business_id;
    // Avto-yopish tekshiruvi
    await autoCloseStaleSmenas(pool, business_id);
    const { rows } = await pool.query(
      `SELECT s.*, u.full_name as opened_by_name
       FROM kassa_smena s
       LEFT JOIN users u ON s.opened_by = u.id
       WHERE s.business_id = $1 AND s.status = 'open'
       ORDER BY s.valuta`,
      [business_id]
    );
    // Har bir ochiq smena uchun joriy tranzaksiya jamilarini hisoblash
    for (const smena of rows) {
      const { rows: totals } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='naqd' THEN summa ELSE 0 END), 0) AS naqd_in,
           COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='karta' THEN summa ELSE 0 END), 0) AS karta_in,
           COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='kochirma' THEN summa ELSE 0 END), 0) AS kochirma_in,
           COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='naqd' THEN summa ELSE 0 END), 0) AS naqd_out,
           COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='karta' THEN summa ELSE 0 END), 0) AS karta_out,
           COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='kochirma' THEN summa ELSE 0 END), 0) AS kochirma_out
         FROM kassa WHERE smena_id = $1`,
        [smena.id]
      );
      const t = totals[0];
      smena.live_naqd_in = parseFloat(t.naqd_in);
      smena.live_karta_in = parseFloat(t.karta_in);
      smena.live_kochirma_in = parseFloat(t.kochirma_in);
      smena.live_naqd_out = parseFloat(t.naqd_out);
      smena.live_karta_out = parseFloat(t.karta_out);
      smena.live_kochirma_out = parseFloat(t.kochirma_out);
      const opening = parseFloat(smena.opening_balance) || 0;
      smena.live_balance = opening
        + smena.live_naqd_in + smena.live_karta_in + smena.live_kochirma_in
        - smena.live_naqd_out - smena.live_karta_out - smena.live_kochirma_out;
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kassa-smena/open — Yangi smena ochish (qo'lda)
app.post('/api/kassa-smena/open', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    const { valuta, opening_balance } = req.body;
    const business_id = req.user.business_id;
    const v = valuta || 'UZS';

    // Mavjud ochiq smena bor-yo'qligini tekshirish
    const existing = await getActiveSmena(dbClient, business_id, v);
    if (existing) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: `${v} smenasi allaqachon ochiq (ID: ${existing.id})` });
    }

    let openBal = parseFloat(opening_balance);
    if (isNaN(openBal)) {
      // Oldingi smenadan avto-yuklash
      const { rows: prev } = await dbClient.query(
        `SELECT closing_balance FROM kassa_smena
         WHERE business_id = $1 AND valuta = $2 AND status = 'closed'
         ORDER BY closed_at DESC NULLS LAST LIMIT 1`,
        [business_id, v]
      );
      openBal = prev.length > 0 && prev[0].closing_balance != null
        ? parseFloat(prev[0].closing_balance) : 0;
    }

    const { rows } = await dbClient.query(
      `INSERT INTO kassa_smena (business_id, opened_by, valuta, opened_at, status, opening_balance)
       VALUES ($1, $2, $3, NOW(), 'open', $4) RETURNING *`,
      [business_id, req.user.id, v, openBal]
    );
    await dbClient.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// POST /api/kassa-smena/:id/close — Smenani yopish (real_naqd majburiy)
app.post('/api/kassa-smena/:id/close', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    const smena_id = parseInt(req.params.id);
    const { real_naqd, notes } = req.body;
    const business_id = req.user.business_id;

    if (real_naqd == null || real_naqd === '') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Real naqd qoldiq kiritish majburiy' });
    }

    // Smenani olish
    const { rows: smenaRows } = await dbClient.query(
      `SELECT * FROM kassa_smena WHERE id = $1 AND business_id = $2 AND status = 'open'`,
      [smena_id, business_id]
    );
    if (smenaRows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Ochiq smena topilmadi' });
    }
    const smena = smenaRows[0];

    // Tranzaksiya jamilarini hisoblash
    const { rows: totals } = await dbClient.query(
      `SELECT
         COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='naqd' THEN summa ELSE 0 END), 0) AS naqd_in,
         COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='karta' THEN summa ELSE 0 END), 0) AS karta_in,
         COALESCE(SUM(CASE WHEN turi='kirim' AND payment_method='kochirma' THEN summa ELSE 0 END), 0) AS kochirma_in,
         COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='naqd' THEN summa ELSE 0 END), 0) AS naqd_out,
         COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='karta' THEN summa ELSE 0 END), 0) AS karta_out,
         COALESCE(SUM(CASE WHEN turi='chiqim' AND payment_method='kochirma' THEN summa ELSE 0 END), 0) AS kochirma_out
       FROM kassa WHERE smena_id = $1`,
      [smena_id]
    );
    const t = totals[0];
    const opening = parseFloat(smena.opening_balance) || 0;
    const closingBalance = opening
      + parseFloat(t.naqd_in) + parseFloat(t.karta_in) + parseFloat(t.kochirma_in)
      - parseFloat(t.naqd_out) - parseFloat(t.karta_out) - parseFloat(t.kochirma_out);

    // Naqd bo'yicha hisob qoldig'i
    const naqdHisob = opening + parseFloat(t.naqd_in) - parseFloat(t.naqd_out);
    const realNaqdNum = parseFloat(real_naqd);
    const farq = realNaqdNum - naqdHisob;

    await dbClient.query(
      `UPDATE kassa_smena SET
         status='closed', closed_by=$2, closed_at=NOW(), auto_closed=FALSE,
         total_naqd_in=$3, total_karta_in=$4, total_kochirma_in=$5,
         total_naqd_out=$6, total_karta_out=$7, total_kochirma_out=$8,
         closing_balance=$9, real_naqd=$10, farq=$11, notes=$12
       WHERE id=$1`,
      [smena_id, req.user.id,
       t.naqd_in, t.karta_in, t.kochirma_in,
       t.naqd_out, t.karta_out, t.kochirma_out,
       closingBalance, realNaqdNum, farq, notes || null]
    );

    await dbClient.query('COMMIT');
    const { rows: result } = await pool.query('SELECT * FROM kassa_smena WHERE id=$1', [smena_id]);
    res.json(result[0]);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// POST /api/kassa-smena/:id/reopen — Yopilgan smenani qayta ochish (admin)
app.post('/api/kassa-smena/:id/reopen', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const smena_id = parseInt(req.params.id);
    const business_id = req.user.business_id;

    const { rows } = await pool.query(
      `SELECT * FROM kassa_smena WHERE id = $1 AND business_id = $2 AND status = 'closed'`,
      [smena_id, business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Yopilgan smena topilmadi' });

    // Shu valyutada boshqa ochiq smena bor-yo'qligini tekshirish
    const existing = await getActiveSmena(pool, business_id, rows[0].valuta);
    if (existing) {
      return res.status(400).json({ error: `${rows[0].valuta} smenasi allaqachon ochiq. Avval uni yoping.` });
    }

    await pool.query(
      `UPDATE kassa_smena SET status='open', closed_at=NULL, closed_by=NULL, auto_closed=FALSE,
         total_naqd_in=0, total_karta_in=0, total_kochirma_in=0,
         total_naqd_out=0, total_karta_out=0, total_kochirma_out=0,
         closing_balance=NULL, real_naqd=NULL, farq=NULL, notes=NULL
       WHERE id=$1`,
      [smena_id]
    );

    const { rows: result } = await pool.query('SELECT * FROM kassa_smena WHERE id=$1', [smena_id]);
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kassa-smena — Yopilgan smenalar ro'yxati (arxiv)
app.get('/api/kassa-smena', authenticateToken, async (req, res) => {
  try {
    const { valuta, from, to } = req.query;
    const business_id = req.user.business_id;
    let q = `SELECT s.*, uo.full_name as opened_by_name, uc.full_name as closed_by_name
             FROM kassa_smena s
             LEFT JOIN users uo ON s.opened_by = uo.id
             LEFT JOIN users uc ON s.closed_by = uc.id
             WHERE s.business_id = $1`;
    const params = [business_id];
    let idx = 2;

    if (valuta) { q += ` AND s.valuta = $${idx}`; params.push(valuta); idx++; }
    if (from) { q += ` AND s.opened_at >= $${idx}`; params.push(new Date(from)); idx++; }
    if (to) { q += ` AND s.opened_at <= $${idx}`; params.push(new Date(to + 'T23:59:59')); idx++; }

    q += ' ORDER BY s.opened_at DESC LIMIT 200';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/kassa-smena/:id — Smenani tahrirlash (admin)
// Tahrirlash = qayta ochish, foydalanuvchi to'liq o'zgartiradi va qayta yopadi
app.put('/api/kassa-smena/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const smena_id = parseInt(req.params.id);
    const business_id = req.user.business_id;
    const { opening_balance, notes } = req.body;

    const { rows } = await pool.query(
      `SELECT * FROM kassa_smena WHERE id = $1 AND business_id = $2`,
      [smena_id, business_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Smena topilmadi' });

    const updates = [];
    const params = [smena_id];
    let idx = 2;

    if (opening_balance != null) {
      updates.push(`opening_balance = $${idx}`); params.push(parseFloat(opening_balance)); idx++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${idx}`); params.push(notes); idx++;
    }

    if (updates.length > 0) {
      await pool.query(`UPDATE kassa_smena SET ${updates.join(', ')} WHERE id = $1`, params);
    }

    const { rows: result } = await pool.query('SELECT * FROM kassa_smena WHERE id=$1', [smena_id]);
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/kassa-smena/:id — Smenani o'chirish (admin)
app.delete('/api/kassa-smena/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    const smena_id = parseInt(req.params.id);
    const business_id = req.user.business_id;

    const { rows } = await dbClient.query(
      'SELECT * FROM kassa_smena WHERE id = $1 AND business_id = $2',
      [smena_id, business_id]
    );
    if (rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Smena topilmadi' });
    }

    // Smenaga bog'langan kassa yozuvlarining smena_id sini NULL ga o'zgartirish
    await dbClient.query('UPDATE kassa SET smena_id = NULL WHERE smena_id = $1', [smena_id]);

    // Smenani o'chirish
    await dbClient.query('DELETE FROM kassa_smena WHERE id = $1', [smena_id]);

    await dbClient.query('COMMIT');
    res.json({ message: 'Smena o\'chirildi' });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// GET /api/kassa/smena/:id/transactions — Smenadagi barcha tranzaksiyalar
app.get('/api/kassa/smena/:id/transactions', authenticateToken, async (req, res) => {
  try {
    const smena_id = parseInt(req.params.id);
    const { rows } = await pool.query(
      `SELECT k.*, u.full_name as user_name, c.full_name as client_name
       FROM kassa k
       LEFT JOIN users u ON k.user_id = u.id
       LEFT JOIN clients c ON k.client_id = c.id
       WHERE k.smena_id = $1 AND k.business_id = $2
       ORDER BY k.created_at DESC`,
      [smena_id, req.user.business_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SETTLEMENTS (Qarz to'lovlari) - Yagona SQL Tranzaksiya
// ============================================
app.post('/api/kassa/settlement', authenticateToken, async (req, res) => {
  const { client_id, client_type, turi, summa, valuta, kurs, izoh, sana, payment_method } = req.body;
  if (!client_id || !summa || !turi) {
    return res.status(400).json({ error: 'Mijoz, summa va turi majburiy maydonlar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business_id = req.user.business_id;
    const user_id = req.user.id;
    const v = valuta || 'UZS';
    const pm = payment_method || 'naqd';
    const createdDate = sana ? new Date(sana) : new Date();

    // Aktiv smenani ta'minlash
    const smena = await ensureActiveSmena(client, business_id, v, user_id);

    // 1. Kassa jadvaliga yozish
    await client.query(
      `INSERT INTO kassa (business_id, user_id, client_id, smena_id, summa, valuta, turi, payment_method, izoh, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [business_id, user_id, client_id, smena.id, summa, v, turi, pm, izoh, createdDate]
    );

    // 2. Balansni yangilash
    let qarzOzgarishi = 0;
    if (client_type === 'customer') {
      qarzOzgarishi = turi === 'kirim' ? -summa : summa;
    } else if (client_type === 'supplier') {
      qarzOzgarishi = turi === 'chiqim' ? -summa : summa;
    }

    const amount_usd = valuta === 'USD' ? qarzOzgarishi : 0;
    const amount_uzs = valuta === 'UZS' ? qarzOzgarishi : 0;

    const updateClient = await client.query(
      `UPDATE clients 
       SET balance_usd = balance_usd + $1, balance_uzs = balance_uzs + $2 
       WHERE id = $3 AND business_id = $4 RETURNING id`,
      [amount_usd, amount_uzs, client_id, business_id]
    );

    if (updateClient.rows.length === 0) {
      throw new Error(`Mijoz/Pudratchi topilmadi (ID: ${client_id})`);
    }

    // 3. Tranzaksiyani yozish
    const trAmount_usd = valuta === 'USD' ? summa : 0;
    const trAmount_uzs = valuta === 'UZS' ? summa : 0;
    const tType = turi === 'kirim' ? 'tulov_kirim' : 'tulov_chiqim';

    await client.query(
      `INSERT INTO transactions (business_id, user_id, client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [business_id, user_id, client_id, tType, trAmount_usd, trAmount_uzs, kurs || 0, izoh, createdDate]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'To\'lov muvaffaqiyatli saqlandi' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================
// SALES (Sotuv) - Yagona SQL Tranzaksiya
// ============================================
app.post('/api/sales', authenticateToken, async (req, res) => {
  const { client_id, valyuta, kurs, naqd, nasiya, savatcha, sana, payment_method } = req.body;
  
  if (!savatcha || savatcha.length === 0) return res.status(400).json({ error: 'Savatcha bo\'sh' });
  if (!client_id) return res.status(400).json({ error: 'Mijoz tanlanmagan' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business_id = req.user.business_id;
    const user_id = req.user.id;
    const createdDate = sana ? new Date(sana) : new Date();
    const groupId = `S-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const pm = payment_method || 'naqd';

    // 1. Ombor qoldig'ini kamaytirish
    for (const item of savatcha) {
      const { rows } = await client.query(
        'UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND business_id = $3 AND quantity >= $1 RETURNING name',
        [item.quantity, item.product_id, business_id]
      );
      if (rows.length === 0) throw new Error(`Mahsulot topilmadi yoki omborda yetarli miqdor yo'q (ID: ${item.product_id})`);
      
      // 2. Har bir mahsulot uchun alohida tranzaksiya (sotuv)
      const amount_usd_item = valyuta === 'USD' ? item.total : 0;
      const amount_uzs_item = valyuta === 'UZS' ? item.total : 0;
      
      await client.query(
        `INSERT INTO transactions (business_id, user_id, client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description, created_at, product_id, quantity, price, group_id)
         VALUES ($1, $2, $3, 'sotuv', $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [business_id, user_id, client_id, amount_usd_item, amount_uzs_item, kurs || 0, `Sotuv: ${rows[0].name}`, createdDate, item.product_id, item.quantity, item.price, groupId]
      );
    }

    const naqdNum = parseFloat(naqd) || 0;
    const nasiyaNum = parseFloat(nasiya) || 0;

    // 3. Kassa kirim va to'lov tranzaksiyasi (Naqd)
    if (naqdNum > 0) {
      // Aktiv smenani ta'minlash
      const smena = await ensureActiveSmena(client, business_id, valyuta, user_id);

      await client.query(
        `INSERT INTO kassa (business_id, user_id, smena_id, summa, valuta, turi, payment_method, izoh, created_at, client_id, group_id)
         VALUES ($1, $2, $3, $4, $5, 'kirim', $6, $7, $8, $9, $10)`,
        [business_id, user_id, smena.id, naqdNum, valyuta, pm, `Sotuv (${pm}) - Faktura: ${groupId}`, createdDate, client_id, groupId]
      );
      
      const amount_usd_naqd = valyuta === 'USD' ? naqdNum : 0;
      const amount_uzs_naqd = valyuta === 'UZS' ? naqdNum : 0;
      await client.query(
        `INSERT INTO transactions (business_id, user_id, client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description, created_at, group_id)
         VALUES ($1, $2, $3, 'tulov_kirim', $4, $5, $6, $7, $8, $9)`,
        [business_id, user_id, client_id, amount_usd_naqd, amount_uzs_naqd, kurs || 0, `Savdo uchun ${pm} to'lov`, createdDate, groupId]
      );
    }

    // 4. Balansni Nasiya qismiga yangilash
    if (nasiyaNum !== 0) {
      const amount_usd_nasiya = valyuta === 'USD' ? nasiyaNum : 0;
      const amount_uzs_nasiya = valyuta === 'UZS' ? nasiyaNum : 0;
      await client.query(
        `UPDATE clients SET balance_usd = balance_usd + $1, balance_uzs = balance_uzs + $2 WHERE id = $3 AND business_id = $4`,
        [amount_usd_nasiya, amount_uzs_nasiya, client_id, business_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Sotuv saqlandi', group_id: groupId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/sales/:group_id — Sotuvni o'chirish va hamma narsani orqaga qaytarish
app.delete('/api/sales/:group_id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { group_id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business_id = req.user.business_id;

    // 1. Ushbu sotuvga tegishli barcha tranzaksiyalarni olish
    const { rows: txs } = await client.query(
      'SELECT * FROM transactions WHERE group_id = $1 AND business_id = $2',
      [group_id, business_id]
    );

    if (txs.length === 0) throw new Error('Sotuv topilmadi');

    for (const tx of txs) {
      // 2. Agar sotuv bo'lsa (sotuv_item) — skladni qaytarish
      if (tx.transaction_type === 'sotuv' && tx.product_id) {
        await client.query(
          'UPDATE products SET quantity = quantity + $1 WHERE id = $2 AND business_id = $3',
          [tx.quantity, tx.product_id, business_id]
        );
      }
      
      // 3. To'lov qismi bo'lsa — mijoz balansini va kassani to'g'irlash (aslida barcha summalar nasiya kabi hisoblanadi)
      // Lekin bizda naqd va nasiya alohida. 
      // Eng to'g'ri yo'li: barcha 'sotuv' summasini balansdan ayirish (nasiya kabi)
      // va 'tulov_kirim' summasini balansga qo'shish.
    }

    // Balansni qayta hisoblash: 
    // Jami sotuv summasi (USD/UZS) mijoz qarzini oshirgan edi -> endi kamaytiramiz
    // Jami to'lov summasi mijoz qarzini kamaytirgan edi -> endi oshiramiz
    const client_id = txs[0].client_id;
    let total_sotuv_usd = 0, total_sotuv_uzs = 0;
    let total_tulov_usd = 0, total_tulov_uzs = 0;

    txs.forEach(t => {
      if(t.transaction_type === 'sotuv') {
        total_sotuv_usd += parseFloat(t.amount_usd || 0);
        total_sotuv_uzs += parseFloat(t.amount_uzs || 0);
      } else if(t.transaction_type === 'tulov_kirim') {
        total_tulov_usd += parseFloat(t.amount_usd || 0);
        total_tulov_uzs += parseFloat(t.amount_uzs || 0);
      }
    });

    const net_usd = total_sotuv_usd - total_tulov_usd;
    const net_uzs = total_sotuv_uzs - total_tulov_uzs;

    // Mijoz balansini orqaga qaytarish (net summani ayiramiz)
    await client.query(
      'UPDATE clients SET balance_usd = balance_usd - $1, balance_uzs = balance_uzs - $2 WHERE id = $3 AND business_id = $4',
      [net_usd, net_uzs, client_id, business_id]
    );

    // 4. Kassa yozuvlarini o'chirish (sana va summa orqali qidirish biroz noaniq, lekin group_id bo'lsa yaxshi edi)
    // Hozircha kassa jadvaliga ham group_id qo'shish kerak edi.
    // Mayli, kassa yozuvlarini o'chirmasa ham bo'ladi (tranzaksiyalar o'chsa bo'ldi), 
    // lekin kassa balansi buziladi. Shuning uchun kassani ham tozalaymiz.
    await client.query('DELETE FROM kassa WHERE group_id = $1 AND business_id = $2', [group_id, business_id]);

    // 5. Tranzaksiyalarni o'chirish
    await client.query('DELETE FROM transactions WHERE group_id = $1 AND business_id = $2', [group_id, business_id]);

    await client.query('COMMIT');
    res.json({ message: 'Sotuv muvaffaqiyatli o\'chirildi' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/sales/:group_id — Sana va izohni yangilash
app.patch('/api/sales/:group_id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { group_id } = req.params;
  const { sana } = req.body;
  const business_id = req.user.business_id;
  try {
    if (!sana) return res.status(400).json({ error: 'Sana kiritilmagan' });
    const newDate = new Date(sana);
    const { rowCount } = await pool.query(
      'UPDATE transactions SET created_at = $1 WHERE group_id = $2 AND business_id = $3',
      [newDate, group_id, business_id]
    );
    await pool.query(
      'UPDATE kassa SET created_at = $1 WHERE group_id = $2 AND business_id = $3',
      [newDate, group_id, business_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Sotuv topilmadi' });
    res.json({ message: 'Sana yangilandi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/purchases/:group_id — Xarid sanasini yangilash
app.patch('/api/purchases/:group_id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { group_id } = req.params;
  const { sana } = req.body;
  const business_id = req.user.business_id;
  try {
    if (!sana) return res.status(400).json({ error: 'Sana kiritilmagan' });
    const newDate = new Date(sana);
    const { rowCount } = await pool.query(
      'UPDATE transactions SET created_at = $1 WHERE group_id = $2 AND business_id = $3',
      [newDate, group_id, business_id]
    );
    await pool.query(
      'UPDATE kassa SET created_at = $1 WHERE group_id = $2 AND business_id = $3',
      [newDate, group_id, business_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Xarid topilmadi' });
    res.json({ message: 'Sana yangilandi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PURCHASES (Xarid) - Yagona SQL Tranzaksiya
// ============================================
app.post('/api/purchases', authenticateToken, async (req, res) => {
  const { supplier_id, valyuta, kurs, naqd, nasiya, savatcha, sana, payment_method } = req.body;
  
  if (!savatcha || savatcha.length === 0) return res.status(400).json({ error: 'Savatcha bo\'sh' });
  if (!supplier_id) return res.status(400).json({ error: 'Pudratchi tanlanmagan' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business_id = req.user.business_id;
    const user_id = req.user.id;
    const createdDate = sana ? new Date(sana) : new Date();
    const groupId = `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const pm = payment_method || 'naqd';

    // 1. Ombor qoldig'ini ko'paytirish (Xarid)
    for (const item of savatcha) {
      await client.query(
        'UPDATE products SET quantity = quantity + $1 WHERE id = $2 AND business_id = $3',
        [item.quantity, item.product_id, business_id]
      );
      
      // 2. Har bir mahsulot uchun alohida tranzaksiya (xarid)
      const amount_usd_item = valyuta === 'USD' ? item.total : 0;
      const amount_uzs_item = valyuta === 'UZS' ? item.total : 0;
      
      await client.query(
        `INSERT INTO transactions (business_id, user_id, client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description, created_at, product_id, quantity, price, group_id)
         VALUES ($1, $2, $3, 'xarid', $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [business_id, user_id, supplier_id, amount_usd_item, amount_uzs_item, kurs || 0, `Xarid: ${item.name}`, createdDate, item.product_id, item.quantity, item.price, groupId]
      );
    }

    const naqdNum = parseFloat(naqd) || 0;
    const nasiyaNum = parseFloat(nasiya) || 0;

    // 3. Kassa chiqim va to'lov tranzaksiyasi
    if (naqdNum > 0) {
      // Aktiv smenani ta'minlash
      const smena = await ensureActiveSmena(client, business_id, valyuta, user_id);

      await client.query(
        `INSERT INTO kassa (business_id, user_id, smena_id, summa, valuta, turi, payment_method, izoh, created_at, client_id, group_id)
         VALUES ($1, $2, $3, $4, $5, 'chiqim', $6, $7, $8, $9, $10)`,
        [business_id, user_id, smena.id, naqdNum, valyuta, pm, `Xarid uchun to'lov (${pm})`, createdDate, supplier_id, groupId]
      );
      
      const amount_usd_naqd = valyuta === 'USD' ? naqdNum : 0;
      const amount_uzs_naqd = valyuta === 'UZS' ? naqdNum : 0;
      await client.query(
        `INSERT INTO transactions (business_id, user_id, client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description, created_at, group_id)
         VALUES ($1, $2, $3, 'tulov_chiqim', $4, $5, $6, $7, $8, $9)`,
        [business_id, user_id, supplier_id, amount_usd_naqd, amount_uzs_naqd, kurs || 0, `Xarid uchun naqd to'lov`, createdDate, groupId]
      );
    }

    // 4. Balansni Nasiya qismiga yangilash
    if (nasiyaNum !== 0) {
      const amount_usd_nasiya = valyuta === 'USD' ? nasiyaNum : 0;
      const amount_uzs_nasiya = valyuta === 'UZS' ? nasiyaNum : 0;
      await client.query(
        `UPDATE clients SET balance_usd = balance_usd + $1, balance_uzs = balance_uzs + $2 WHERE id = $3 AND business_id = $4`,
        [amount_usd_nasiya, amount_uzs_nasiya, supplier_id, business_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Xarid saqlandi', group_id: groupId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/purchases/:group_id — Xaridni o'chirish
app.delete('/api/purchases/:group_id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { group_id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business_id = req.user.business_id;

    const { rows: txs } = await client.query(
      'SELECT * FROM transactions WHERE group_id = $1 AND business_id = $2',
      [group_id, business_id]
    );
    if (txs.length === 0) throw new Error('Xarid topilmadi');

    for (const tx of txs) {
      if (tx.transaction_type === 'xarid' && tx.product_id) {
        await client.query(
          'UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND business_id = $3',
          [tx.quantity, tx.product_id, business_id]
        );
      }
    }

    const supplier_id = txs[0].client_id;
    let total_xarid_usd = 0, total_xarid_uzs = 0;
    let total_tulov_usd = 0, total_tulov_uzs = 0;

    txs.forEach(t => {
      if(t.transaction_type === 'xarid') {
        total_xarid_usd += parseFloat(t.amount_usd || 0);
        total_xarid_uzs += parseFloat(t.amount_uzs || 0);
      } else if(t.transaction_type === 'tulov_chiqim') {
        total_tulov_usd += parseFloat(t.amount_usd || 0);
        total_tulov_uzs += parseFloat(t.amount_uzs || 0);
      }
    });

    const net_usd = total_xarid_usd - total_tulov_usd;
    const net_uzs = total_xarid_uzs - total_tulov_uzs;

    await client.query(
      'UPDATE clients SET balance_usd = balance_usd - $1, balance_uzs = balance_uzs - $2 WHERE id = $3 AND business_id = $4',
      [net_usd, net_uzs, supplier_id, business_id]
    );

    await client.query('DELETE FROM kassa WHERE group_id = $1 AND business_id = $2', [group_id, business_id]);
    await client.query('DELETE FROM transactions WHERE group_id = $1 AND business_id = $2', [group_id, business_id]);

    await client.query('COMMIT');
    res.json({ message: 'Xarid muvaffaqiyatli o\'chirildi' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================
// AKT SVERKA (Reconciliation) - GET
// ============================================
app.get('/api/akt-sverka', authenticateToken, async (req, res) => {
  try {
    const { client_id, start_date, end_date } = req.query;
    if (!client_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'client_id, start_date, end_date majburiy' });
    }

    const start = new Date(start_date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(end_date);
    end.setHours(23, 59, 59, 999);

    const business_id = req.user.business_id;

    // 1. Klientni olish
    const clientRes = await pool.query('SELECT * FROM clients WHERE id = $1 AND business_id = $2', [client_id, business_id]);
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Klient topilmadi' });
    }
    const client = clientRes.rows[0];

    // 2. Ushbu davrdagi barcha tranzaksiyalar
    const periodTransRes = await pool.query(`
      SELECT t.*, u.full_name as user_name
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.client_id = $1 AND t.business_id = $2 
        AND t.created_at >= $3 AND t.created_at <= $4
      ORDER BY t.created_at ASC, t.id ASC
    `, [client_id, business_id, start, end]);
    
    // 3. Ushbu davrdan keyingi tranzaksiyalar (Qoldiqni orqaga qaytarish uchun)
    const afterTransRes = await pool.query(`
      SELECT transaction_type, amount_usd, amount_uzs 
      FROM transactions 
      WHERE client_id = $1 AND business_id = $2 AND created_at > $3
    `, [client_id, business_id, end]);

    // Qarz oshishi va kamayishini hisoblovchi yordamchi funksiya
    const calcNetChange = (txs, cType) => {
      let net_usd = 0;
      let net_uzs = 0;
      for (const tx of txs) {
        // opening_balance — sign already represents balance change (+=qarzlor, -=haqlor)
        if (tx.transaction_type === 'opening_balance') {
          net_usd += parseFloat(tx.amount_usd || 0); net_uzs += parseFloat(tx.amount_uzs || 0);
          continue;
        }
        if (cType === 'customer') {
          if (tx.transaction_type === 'sotuv_nasiya' || tx.transaction_type === 'sotuv') { net_usd += parseFloat(tx.amount_usd || 0); net_uzs += parseFloat(tx.amount_uzs || 0); }
          else if (tx.transaction_type === 'tulov_kirim') { net_usd -= parseFloat(tx.amount_usd || 0); net_uzs -= parseFloat(tx.amount_uzs || 0); }
        } else if (cType === 'supplier') {
          if (tx.transaction_type === 'xarid_nasiya' || tx.transaction_type === 'xarid') { net_usd += parseFloat(tx.amount_usd || 0); net_uzs += parseFloat(tx.amount_uzs || 0); }
          else if (tx.transaction_type === 'tulov_chiqim') { net_usd -= parseFloat(tx.amount_usd || 0); net_uzs -= parseFloat(tx.amount_uzs || 0); }
        }
      }
      return { net_usd, net_uzs };
    };

    const current_balance_usd = parseFloat(client.balance_usd || 0);
    const current_balance_uzs = parseFloat(client.balance_uzs || 0);

    const afterNet = calcNetChange(afterTransRes.rows, client.client_type);
    const end_balance_usd = current_balance_usd - afterNet.net_usd;
    const end_balance_uzs = current_balance_uzs - afterNet.net_uzs;

    const periodNet = calcNetChange(periodTransRes.rows, client.client_type);
    const start_balance_usd = end_balance_usd - periodNet.net_usd;
    const start_balance_uzs = end_balance_uzs - periodNet.net_uzs;

    res.json({
      client,
      start_balance_usd,
      start_balance_uzs,
      end_balance_usd,
      end_balance_uzs,
      transactions: periodTransRes.rows
    });
  } catch (err) {
    console.error('Akt Sverka xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// BOSHLANG'ICH QOLDIQLAR (Opening Balances)
// ============================================

// Mijoz/Pudratchi uchun boshlang'ich qoldiq qo'shish
app.post('/api/opening-balance/partner', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { partner_id, balance_uzs, balance_usd, sana, izoh } = req.body;
  if (!partner_id) return res.status(400).json({ error: 'partner_id majburiy' });
  const bUZS = parseFloat(balance_uzs) || 0;
  const bUSD = parseFloat(balance_usd) || 0;
  if (bUZS === 0 && bUSD === 0) return res.status(400).json({ error: 'UZS yoki USD qoldiq kiritilishi shart' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business_id = req.user.business_id;
    const createdDate = sana ? new Date(sana) : new Date();

    // Klientni topish va turi
    const partnerRes = await client.query('SELECT * FROM clients WHERE id = $1 AND business_id = $2', [partner_id, business_id]);
    if (partnerRes.rows.length === 0) throw new Error('Mijoz/Pudratchi topilmadi');
    const partner = partnerRes.rows[0];

    // Tranzaksiya yozish (opening_balance)
    const desc = izoh || `Boshlang'ich qoldiq (${partner.client_type === 'customer' ? 'mijoz' : 'pudratchi'})`;
    const insTx = await client.query(
      `INSERT INTO transactions (business_id, user_id, client_id, transaction_type, amount_usd, amount_uzs, exchange_rate, description, created_at)
       VALUES ($1, $2, $3, 'opening_balance', $4, $5, 0, $6, $7) RETURNING *`,
      [business_id, req.user.id, partner_id, bUSD, bUZS, desc, createdDate]
    );

    // Balansni yangilash (qiymat ishorasi to'g'ridan-to'g'ri qo'shiladi)
    await client.query(
      `UPDATE clients SET balance_usd = balance_usd + $1, balance_uzs = balance_uzs + $2 WHERE id = $3 AND business_id = $4`,
      [bUSD, bUZS, partner_id, business_id]
    );

    await client.query('COMMIT');
    res.status(201).json(insTx.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Mahsulot uchun boshlang'ich zaxira (qoldiq)
app.post('/api/opening-balance/product', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { product_id, quantity, izoh } = req.body;
  if (!product_id || quantity === undefined) {
    return res.status(400).json({ error: 'product_id va quantity majburiy' });
  }
  const qty = parseFloat(quantity);
  if (isNaN(qty)) return res.status(400).json({ error: "Soni noto'g'ri" });

  try {
    const business_id = req.user.business_id;
    const upd = await pool.query(
      `UPDATE products SET quantity = quantity + $1 WHERE id = $2 AND business_id = $3 RETURNING *`,
      [qty, product_id, business_id]
    );
    if (upd.rows.length === 0) return res.status(404).json({ error: 'Mahsulot topilmadi' });

    // Audit izoh sifatida transactionsga ham yozib qo'yamiz (client_id = NULL)
    await pool.query(
      `INSERT INTO transactions (business_id, user_id, transaction_type, product_id, quantity, description, amount_uzs, amount_usd, exchange_rate)
       VALUES ($1, $2, 'opening_stock', $3, $4, $5, 0, 0, 0)`,
      [business_id, req.user.id, product_id, qty, izoh || `Boshlang'ich zaxira: ${qty} dona`]
    );

    res.status(201).json(upd.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Barcha boshlang'ich qoldiqlarni ko'rish
app.get('/api/opening-balances', authenticateToken, async (req, res) => {
  try {
    const business_id = req.user.business_id;
    const partners = await pool.query(`
      SELECT t.id, t.created_at, t.amount_uzs, t.amount_usd, t.description,
             c.id as partner_id, c.full_name, c.client_type
      FROM transactions t
      JOIN clients c ON t.client_id = c.id
      WHERE t.business_id = $1 AND t.transaction_type = 'opening_balance'
      ORDER BY t.created_at DESC
    `, [business_id]);

    const products = await pool.query(`
      SELECT t.id, t.created_at, t.quantity, t.description,
             p.id as product_id, p.name as product_name
      FROM transactions t
      JOIN products p ON t.product_id = p.id
      WHERE t.business_id = $1 AND t.transaction_type = 'opening_stock'
      ORDER BY t.created_at DESC
    `, [business_id]);

    res.json({ partners: partners.rows, products: products.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Boshlang'ich qoldiqni o'chirish (orqaga qaytarish)
app.delete('/api/opening-balance/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const business_id = req.user.business_id;

    const txRes = await client.query(
      `SELECT * FROM transactions WHERE id = $1 AND business_id = $2 AND transaction_type IN ('opening_balance','opening_stock')`,
      [id, business_id]
    );
    if (txRes.rows.length === 0) throw new Error('Boshlang\'ich qoldiq topilmadi');
    const tx = txRes.rows[0];

    if (tx.transaction_type === 'opening_balance' && tx.client_id) {
      // Balansni qaytarish
      await client.query(
        `UPDATE clients SET balance_usd = balance_usd - $1, balance_uzs = balance_uzs - $2 WHERE id = $3 AND business_id = $4`,
        [parseFloat(tx.amount_usd || 0), parseFloat(tx.amount_uzs || 0), tx.client_id, business_id]
      );
    } else if (tx.transaction_type === 'opening_stock' && tx.product_id) {
      // Zaxirani qaytarish
      await client.query(
        `UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND business_id = $3`,
        [parseFloat(tx.quantity || 0), tx.product_id, business_id]
      );
    }

    await client.query(`DELETE FROM transactions WHERE id = $1 AND business_id = $2`, [id, business_id]);
    await client.query('COMMIT');
    res.json({ message: "Boshlang'ich qoldiq o'chirildi" });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================
// CBU (O'zbekiston Markaziy Banki) Valyuta Kursi
// ============================================
const https = require('https');

app.get('/api/exchange-rate', authenticateToken, async (req, res) => {
  try {
    const data = await new Promise((resolve, reject) => {
      https.get('https://cbu.uz/uz/arkhiv-kursov-valyut/json/', (response) => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('CBU javobini parse qilib bo\'lmadi')); }
        });
      }).on('error', reject);
    });
    const usd = data.find(r => r.Ccy === 'USD');
    if (!usd) return res.status(404).json({ error: 'USD kursi topilmadi' });
    res.json({ rate: parseFloat(usd.Rate), date: usd.Date, ccy: 'USD' });
  } catch (err) {
    res.status(502).json({ error: 'CBU serveriga ulanib bo\'lmadi: ' + err.message });
  }
});

// ============================================
// DASHBOARD — Rol bo'yicha asosiy oyna ma'lumotlari
// ============================================
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  const business_id = req.user.business_id;
  const user_id = req.user.id;
  const role = req.user.role;

  // Vaqt ramkalari
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const yestIso = yest.toISOString();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const thirtyIso = thirtyDaysAgo.toISOString();

  // Seller va supplier_agent uchun user filtri
  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';
  const isSupplierAgent = role === 'supplier_agent';
  const isWarehouse = role === 'warehouse_keeper';

  // Tranzaksiyalarga qo'shimcha filtr (role bo'yicha)
  const userFilter = (isSeller || isSupplierAgent) ? 'AND user_id = $2' : '';
  const userParam = (isSeller || isSupplierAgent) ? [user_id] : [];

  try {
    const result = { role, kpi: {}, alerts: {}, feed: [], chart: {}, top: {} };

    // ─── KPI: Bugungi sotuv ───
    if (isAdmin || isSeller) {
      const r1 = await pool.query(
        `SELECT
           COALESCE(SUM(amount_uzs),0) AS uzs,
           COALESCE(SUM(amount_usd),0) AS usd,
           COUNT(DISTINCT COALESCE(group_id, id::text)) AS cnt
         FROM transactions
         WHERE business_id = $1
           AND transaction_type IN ('sotuv','sotuv_nasiya')
           AND created_at >= '${todayIso}'::timestamp
           ${userFilter}`,
        [business_id, ...userParam]
      );
      result.kpi.today_sales_uzs = parseFloat(r1.rows[0].uzs);
      result.kpi.today_sales_usd = parseFloat(r1.rows[0].usd);
      result.kpi.today_sales_count = parseInt(r1.rows[0].cnt);

      const r2 = await pool.query(
        `SELECT COALESCE(SUM(amount_uzs),0) AS uzs, COALESCE(SUM(amount_usd),0) AS usd
         FROM transactions
         WHERE business_id = $1
           AND transaction_type IN ('sotuv','sotuv_nasiya')
           AND created_at >= '${yestIso}'::timestamp AND created_at < '${todayIso}'::timestamp
           ${userFilter}`,
        [business_id, ...userParam]
      );
      result.kpi.yesterday_sales_uzs = parseFloat(r2.rows[0].uzs);
      result.kpi.yesterday_sales_usd = parseFloat(r2.rows[0].usd);

      const r3 = await pool.query(
        `SELECT COALESCE(SUM(amount_uzs),0) AS uzs, COALESCE(SUM(amount_usd),0) AS usd
         FROM transactions
         WHERE business_id = $1
           AND transaction_type IN ('sotuv','sotuv_nasiya')
           AND created_at >= '${monthStart}'::timestamp
           ${userFilter}`,
        [business_id, ...userParam]
      );
      result.kpi.month_sales_uzs = parseFloat(r3.rows[0].uzs);
      result.kpi.month_sales_usd = parseFloat(r3.rows[0].usd);
    }

    // ─── KPI: Bugungi xarid ───
    if (isAdmin || isSupplierAgent) {
      const r = await pool.query(
        `SELECT COALESCE(SUM(amount_uzs),0) AS uzs, COALESCE(SUM(amount_usd),0) AS usd
         FROM transactions
         WHERE business_id = $1
           AND transaction_type IN ('xarid','xarid_nasiya')
           AND created_at >= '${todayIso}'::timestamp
           ${userFilter}`,
        [business_id, ...userParam]
      );
      result.kpi.today_purchases_uzs = parseFloat(r.rows[0].uzs);
      result.kpi.today_purchases_usd = parseFloat(r.rows[0].usd);

      const rM = await pool.query(
        `SELECT COALESCE(SUM(amount_uzs),0) AS uzs, COALESCE(SUM(amount_usd),0) AS usd
         FROM transactions
         WHERE business_id = $1
           AND transaction_type IN ('xarid','xarid_nasiya')
           AND created_at >= '${monthStart}'::timestamp
           ${userFilter}`,
        [business_id, ...userParam]
      );
      result.kpi.month_purchases_uzs = parseFloat(rM.rows[0].uzs);
      result.kpi.month_purchases_usd = parseFloat(rM.rows[0].usd);
    }

    // ─── KPI: Kassa qoldig'i (faqat admin) ───
    if (isAdmin) {
      const rK = await pool.query(
        `SELECT valuta,
                COALESCE(SUM(CASE WHEN turi='kirim' THEN summa ELSE -summa END),0) AS bal
         FROM kassa WHERE business_id = $1 GROUP BY valuta`,
        [business_id]
      );
      result.kpi.cash_uzs = 0; result.kpi.cash_usd = 0;
      rK.rows.forEach(r => {
        if (r.valuta === 'UZS') result.kpi.cash_uzs = parseFloat(r.bal);
        if (r.valuta === 'USD') result.kpi.cash_usd = parseFloat(r.bal);
      });
    }

    // ─── KPI: Ombor qiymati (admin + warehouse_keeper) ───
    if (isAdmin || isWarehouse) {
      const rP = await pool.query(
        `SELECT
           COUNT(*) AS total_products,
           COALESCE(SUM(quantity),0) AS total_qty,
           COALESCE(SUM(quantity * price_uzs),0) AS val_uzs,
           COALESCE(SUM(quantity * price_usd),0) AS val_usd
         FROM products WHERE business_id = $1`,
        [business_id]
      );
      result.kpi.total_products = parseInt(rP.rows[0].total_products);
      result.kpi.total_qty = parseFloat(rP.rows[0].total_qty);
      result.kpi.inventory_value_uzs = parseFloat(rP.rows[0].val_uzs);
      result.kpi.inventory_value_usd = parseFloat(rP.rows[0].val_usd);
    }

    // ─── KPI: Qarzdorlik (receivables/payables) ───
    if (isAdmin || isSeller || isSupplierAgent) {
      // Mijozlardan olinishi kerak (DT summalari — balance > 0)
      // Seller uchun faqat o'ziga biriktirilgan mijozlar
      const assignedFilter = isSeller ? 'AND assigned_user_id = $2' :
                             isSupplierAgent ? 'AND assigned_user_id = $2' : '';
      const assignedParam = (isSeller || isSupplierAgent) ? [user_id] : [];

      if (isAdmin || isSeller) {
        const rR = await pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN balance_uzs > 0 THEN balance_uzs ELSE 0 END),0) AS r_uzs,
             COALESCE(SUM(CASE WHEN balance_usd > 0 THEN balance_usd ELSE 0 END),0) AS r_usd,
             COALESCE(SUM(CASE WHEN balance_uzs < 0 THEN -balance_uzs ELSE 0 END),0) AS p_uzs,
             COALESCE(SUM(CASE WHEN balance_usd < 0 THEN -balance_usd ELSE 0 END),0) AS p_usd
           FROM clients
           WHERE business_id = $1 AND client_type = 'customer' ${assignedFilter}`,
          [business_id, ...assignedParam]
        );
        result.kpi.receivables_uzs = parseFloat(rR.rows[0].r_uzs);
        result.kpi.receivables_usd = parseFloat(rR.rows[0].r_usd);
        result.kpi.customer_prepaid_uzs = parseFloat(rR.rows[0].p_uzs);
      }

      if (isAdmin || isSupplierAgent) {
        const rP = await pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN balance_uzs > 0 THEN balance_uzs ELSE 0 END),0) AS p_uzs,
             COALESCE(SUM(CASE WHEN balance_usd > 0 THEN balance_usd ELSE 0 END),0) AS p_usd
           FROM clients
           WHERE business_id = $1 AND client_type = 'supplier' ${assignedFilter}`,
          [business_id, ...assignedParam]
        );
        result.kpi.payables_uzs = parseFloat(rP.rows[0].p_uzs);
        result.kpi.payables_usd = parseFloat(rP.rows[0].p_usd);
      }
    }

    // ─── ALERTS: Qarzdor mijozlar (eng katta qarz, TOP 10) ───
    if (isAdmin || isSeller) {
      const assignedFilter = isSeller ? 'AND assigned_user_id = $2' : '';
      const assignedParam = isSeller ? [user_id] : [];
      const rD = await pool.query(
        `SELECT id, full_name, balance_uzs, balance_usd
         FROM clients
         WHERE business_id = $1 AND client_type='customer'
           AND (balance_uzs > 0 OR balance_usd > 0) ${assignedFilter}
         ORDER BY balance_uzs DESC NULLS LAST LIMIT 10`,
        [business_id, ...assignedParam]
      );
      result.alerts.debtors = rD.rows;
    }

    // ─── ALERTS: Biz qarzdor pudratchilar (TOP 10) ───
    if (isAdmin || isSupplierAgent) {
      const assignedFilter = isSupplierAgent ? 'AND assigned_user_id = $2' : '';
      const assignedParam = isSupplierAgent ? [user_id] : [];
      const rP = await pool.query(
        `SELECT id, full_name, balance_uzs, balance_usd
         FROM clients
         WHERE business_id = $1 AND client_type='supplier'
           AND (balance_uzs > 0 OR balance_usd > 0) ${assignedFilter}
         ORDER BY balance_uzs DESC NULLS LAST LIMIT 10`,
        [business_id, ...assignedParam]
      );
      result.alerts.payables = rP.rows;
    }

    // ─── ALERTS: Kam qolgan mahsulotlar ───
    if (isAdmin || isWarehouse) {
      const rL = await pool.query(
        `SELECT id, name, quantity
         FROM products
         WHERE business_id = $1 AND quantity < 10
         ORDER BY quantity ASC LIMIT 15`,
        [business_id]
      );
      result.alerts.low_stock = rL.rows;
    }

    // ─── FEED: So'nggi faollik (oxirgi 15 ta) ───
    {
      const userFeedFilter = (isSeller || isSupplierAgent) ? 'AND t.user_id = $2' : '';
      const feedParam = (isSeller || isSupplierAgent) ? [user_id] : [];
      let typesFilter = '';
      if (isSeller) typesFilter = "AND t.transaction_type IN ('sotuv','sotuv_nasiya','tulov_kirim')";
      else if (isSupplierAgent) typesFilter = "AND t.transaction_type IN ('xarid','xarid_nasiya','tulov_chiqim')";
      else if (isWarehouse) typesFilter = "AND t.transaction_type IN ('sotuv','xarid')";

      const rF = await pool.query(
        `SELECT t.id, t.transaction_type, t.amount_uzs, t.amount_usd, t.created_at, t.description,
                t.quantity, u.full_name AS user_name, c.full_name AS client_name, p.name AS product_name
         FROM transactions t
         LEFT JOIN users u ON t.user_id = u.id
         LEFT JOIN clients c ON t.client_id = c.id
         LEFT JOIN products p ON t.product_id = p.id
         WHERE t.business_id = $1 ${userFeedFilter} ${typesFilter}
         ORDER BY t.created_at DESC LIMIT 15`,
        [business_id, ...feedParam]
      );
      result.feed = rF.rows;
    }

    // ─── CHART: Sotuv/Xarid dinamika (sana dan/gacha) ───
    if (isAdmin || isSeller || isSupplierAgent) {
      const typesWanted = isSeller ? "('sotuv','sotuv_nasiya')" :
                          isSupplierAgent ? "('xarid','xarid_nasiya')" :
                          "('sotuv','sotuv_nasiya','xarid','xarid_nasiya')";
      const userFilter2 = (isSeller || isSupplierAgent) ? 'AND user_id = $2' : '';
      const chartParam = (isSeller || isSupplierAgent) ? [user_id] : [];

      // Sana dan/gacha parametrlari (default: oxirgi 30 kun)
      const chartFrom = req.query.chart_from || thirtyIso.split('T')[0];
      const chartTo = req.query.chart_to || today.toISOString().split('T')[0];

      const chartParams = [business_id, ...chartParam, chartFrom, chartTo];
      const chartFromIdx = chartParam.length + 2;
      const chartToIdx = chartParam.length + 3;
      const rC = await pool.query(
        `SELECT DATE(created_at) AS day, transaction_type,
                COALESCE(SUM(amount_uzs),0) AS uzs
         FROM transactions
         WHERE business_id = $1
           AND transaction_type IN ${typesWanted}
           AND created_at >= $${chartFromIdx}::date
           AND created_at < ($${chartToIdx}::date + INTERVAL '1 day')
           ${userFilter2}
         GROUP BY day, transaction_type
         ORDER BY day`,
        chartParams
      );

      // Sanalar oralig'i bo'yicha labels generatsiyasi
      const labels = [];
      const salesMap = {};
      const purchMap = {};
      const startDate = new Date(chartFrom);
      const endDate = new Date(chartTo);
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        labels.push(key);
        salesMap[key] = 0; purchMap[key] = 0;
      }
      rC.rows.forEach(r => {
        const key = new Date(r.day).toISOString().split('T')[0];
        if (r.transaction_type === 'sotuv' || r.transaction_type === 'sotuv_nasiya') {
          salesMap[key] = (salesMap[key] || 0) + parseFloat(r.uzs);
        } else if (r.transaction_type === 'xarid' || r.transaction_type === 'xarid_nasiya') {
          purchMap[key] = (purchMap[key] || 0) + parseFloat(r.uzs);
        }
      });
      result.chart = {
        labels,
        sales_uzs: labels.map(k => salesMap[k] || 0),
        purchases_uzs: labels.map(k => purchMap[k] || 0),
        chart_from: chartFrom,
        chart_to: chartTo,
      };
    }

    // ─── TOP: Mahsulotlar (oy bo'yicha) ───
    if (isAdmin || isSeller || isWarehouse) {
      const userFilter3 = isSeller ? 'AND t.user_id = $2' : '';
      const topParam = isSeller ? [user_id] : [];
      const rTp = await pool.query(
        `SELECT p.id, p.name,
                COALESCE(SUM(t.quantity),0) AS qty_sold,
                COALESCE(SUM(t.amount_uzs),0) AS revenue_uzs
         FROM transactions t JOIN products p ON t.product_id = p.id
         WHERE t.business_id = $1 AND t.transaction_type = 'sotuv'
           AND t.created_at >= '${monthStart}'::timestamp
           ${userFilter3}
         GROUP BY p.id, p.name
         ORDER BY revenue_uzs DESC LIMIT 10`,
        [business_id, ...topParam]
      );
      result.top.products = rTp.rows;
    }

    // ─── TOP: Mijozlar (oy bo'yicha oborot) ───
    if (isAdmin || isSeller) {
      const userFilter4 = isSeller ? 'AND t.user_id = $2' : '';
      const topParam2 = isSeller ? [user_id] : [];
      const rTc = await pool.query(
        `SELECT c.id, c.full_name,
                COALESCE(SUM(t.amount_uzs),0) AS turnover_uzs
         FROM transactions t JOIN clients c ON t.client_id = c.id
         WHERE t.business_id = $1 AND c.client_type='customer'
           AND t.transaction_type IN ('sotuv','sotuv_nasiya')
           AND t.created_at >= '${monthStart}'::timestamp
           ${userFilter4}
         GROUP BY c.id, c.full_name
         ORDER BY turnover_uzs DESC LIMIT 10`,
        [business_id, ...topParam2]
      );
      result.top.clients = rTc.rows;
    }

    // ─── TOP: Pudratchilar (oy bo'yicha oborot) ───
    if (isAdmin || isSupplierAgent) {
      const userFilter5 = isSupplierAgent ? 'AND t.user_id = $2' : '';
      const topParam3 = isSupplierAgent ? [user_id] : [];
      const rTs = await pool.query(
        `SELECT c.id, c.full_name,
                COALESCE(SUM(t.amount_uzs),0) AS turnover_uzs
         FROM transactions t JOIN clients c ON t.client_id = c.id
         WHERE t.business_id = $1 AND c.client_type='supplier'
           AND t.transaction_type IN ('xarid','xarid_nasiya')
           AND t.created_at >= '${monthStart}'::timestamp
           ${userFilter5}
         GROUP BY c.id, c.full_name
         ORDER BY turnover_uzs DESC LIMIT 10`,
        [business_id, ...topParam3]
      );
      result.top.suppliers = rTs.rows;
    }

    res.json(result);
  } catch (err) {
    console.error('Dashboard xatosi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SOZLAMALAR (Settings) — CRUD
// ============================================

// GET — Biznes sozlamalarini olish
app.get('/api/settings', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const business_id = req.user.business_id;
    let { rows } = await pool.query('SELECT * FROM business_settings WHERE business_id = $1', [business_id]);
    if (rows.length === 0) {
      // Avtomatik yaratish
      const ins = await pool.query(
        'INSERT INTO business_settings (business_id) VALUES ($1) RETURNING *', [business_id]
      );
      rows = ins.rows;
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT — Biznes sozlamalarini yangilash
app.put('/api/settings', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const business_id = req.user.business_id;
    const { company_name, phone, address, default_currency, default_exchange_rate, low_stock_threshold, receipt_format } = req.body;

    // Upsert
    const { rows } = await pool.query(
      `INSERT INTO business_settings (business_id, company_name, phone, address, default_currency, default_exchange_rate, low_stock_threshold, receipt_format, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (business_id)
       DO UPDATE SET company_name=$2, phone=$3, address=$4, default_currency=$5, default_exchange_rate=$6, low_stock_threshold=$7, receipt_format=$8, updated_at=NOW()
       RETURNING *`,
      [business_id, company_name || null, phone || null, address || null, default_currency || 'UZS', default_exchange_rate || 0, low_stock_threshold || 10, receipt_format || 'A4']
    );

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [business_id, req.user.id, 'settings_update', 'Biznes sozlamalari yangilandi']
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PAROL O'ZGARTIRISH (joriy foydalanuvchi)
// ============================================
app.post('/api/settings/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Joriy va yangi parol majburiy' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Yangi parol kamida 6 belgi bo\'lishi kerak' });
  }

  try {
    const bcrypt = require('bcryptjs');
    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    const isMatch = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
    if (!isMatch) return res.status(400).json({ error: 'Joriy parol noto\'g\'ri' });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(new_password, salt);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'password_change', 'Parol o\'zgartirildi']
    );

    res.json({ message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUDIT LOG — Faoliyat tarixi
// ============================================
app.get('/api/settings/audit-log', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.full_name as user_name, u.username
       FROM audit_log a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.business_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [req.user.business_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// BACKUP — Baza eksporti (faqat admin)
// ============================================
app.get('/api/settings/backup', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const business_id = req.user.business_id;

    const [products, clients, transactions, kassa, settings] = await Promise.all([
      pool.query('SELECT * FROM products WHERE business_id = $1 ORDER BY id', [business_id]),
      pool.query('SELECT * FROM clients WHERE business_id = $1 ORDER BY id', [business_id]),
      pool.query('SELECT * FROM transactions WHERE business_id = $1 ORDER BY id', [business_id]),
      pool.query('SELECT * FROM kassa WHERE business_id = $1 ORDER BY id', [business_id]),
      pool.query('SELECT * FROM business_settings WHERE business_id = $1', [business_id]),
    ]);

    const businessRes = await pool.query('SELECT * FROM businesses WHERE id = $1', [business_id]);

    const backup = {
      version: '1.0',
      created_at: new Date().toISOString(),
      business: businessRes.rows[0] || null,
      data: {
        products: products.rows,
        clients: clients.rows,
        transactions: transactions.rows,
        kassa: kassa.rows,
        settings: settings.rows[0] || null,
      }
    };

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [business_id, req.user.id, 'backup_export', `Baza eksport qilindi (${products.rows.length} mahsulot, ${clients.rows.length} klient, ${transactions.rows.length} tranzaksiya)`]
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup_${business_id}_${new Date().toISOString().slice(0,10)}.json`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RESTORE — Baza importi (faqat admin)
// ============================================
app.post('/api/settings/restore', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { data } = req.body;
    if (!data || !data.products || !data.clients || !data.transactions || !data.kassa) {
      return res.status(400).json({ error: 'Noto\'g\'ri backup formati' });
    }

    const business_id = req.user.business_id;

    await client.query('BEGIN');

    // 1. Eski ma'lumotlarni o'chirish (tartib bilan)
    await client.query('DELETE FROM kassa WHERE business_id = $1', [business_id]);
    await client.query('DELETE FROM transactions WHERE business_id = $1', [business_id]);
    await client.query('DELETE FROM clients WHERE business_id = $1', [business_id]);
    await client.query('DELETE FROM products WHERE business_id = $1', [business_id]);

    // 2. ID mapping (eski ID → yangi ID)
    const productIdMap = {};
    const clientIdMap = {};

    // 3. Mahsulotlarni tiklash
    for (const p of data.products) {
      const ins = await client.query(
        `INSERT INTO products (business_id, name, quantity, price_usd, price_uzs, unit, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [business_id, p.name, p.quantity || 0, p.price_usd || 0, p.price_uzs || 0, p.unit || 'dona', p.created_at || new Date()]
      );
      productIdMap[p.id] = ins.rows[0].id;
    }

    // 4. Klientlarni tiklash
    for (const c of data.clients) {
      const ins = await client.query(
        `INSERT INTO clients (business_id, client_type, full_name, phone, address, balance_usd, balance_uzs, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [business_id, c.client_type || 'customer', c.full_name, c.phone, c.address, c.balance_usd || 0, c.balance_uzs || 0, c.created_at || new Date()]
      );
      clientIdMap[c.id] = ins.rows[0].id;
    }

    // 5. Tranzaksiyalarni tiklash
    for (const t of data.transactions) {
      await client.query(
        `INSERT INTO transactions (business_id, user_id, client_id, product_id, transaction_type, amount_usd, amount_uzs, exchange_rate, quantity, price, unit, group_id, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [business_id, t.user_id, clientIdMap[t.client_id] || null, productIdMap[t.product_id] || null,
         t.transaction_type, t.amount_usd || 0, t.amount_uzs || 0, t.exchange_rate || 0,
         t.quantity || 0, t.price || 0, t.unit || 'dona', t.group_id, t.description, t.created_at || new Date()]
      );
    }

    // 6. Kassa yozuvlarini tiklash
    for (const k of data.kassa) {
      await client.query(
        `INSERT INTO kassa (business_id, user_id, client_id, group_id, summa, valuta, turi, izoh, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [business_id, k.user_id, clientIdMap[k.client_id] || null, k.group_id, k.summa, k.valuta || 'UZS', k.turi, k.izoh, k.created_at || new Date()]
      );
    }

    // 7. Sozlamalarni tiklash
    if (data.settings) {
      const s = data.settings;
      await client.query(
        `INSERT INTO business_settings (business_id, company_name, phone, address, default_currency, default_exchange_rate, low_stock_threshold, receipt_format, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (business_id) DO UPDATE SET company_name=$2, phone=$3, address=$4, default_currency=$5, default_exchange_rate=$6, low_stock_threshold=$7, receipt_format=$8, updated_at=NOW()`,
        [business_id, s.company_name, s.phone, s.address, s.default_currency || 'UZS', s.default_exchange_rate || 0, s.low_stock_threshold || 10, s.receipt_format || 'A4']
      );
    }

    await client.query('COMMIT');

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [business_id, req.user.id, 'backup_restore', `Baza tiklandi (${data.products.length} mahsulot, ${data.clients.length} klient, ${data.transactions.length} tranzaksiya)`]
    );

    res.json({ message: 'Baza muvaffaqiyatli tiklandi', stats: { products: data.products.length, clients: data.clients.length, transactions: data.transactions.length, kassa: data.kassa.length } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================
// Server ishga tushirish
// ============================================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server ${PORT}-portda ishlayapti`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} band! Boshqa process ishlatmoqda.`);
    process.exit(1);
  } else {
    console.error('❌ Server xatosi:', err.message);
  }
});