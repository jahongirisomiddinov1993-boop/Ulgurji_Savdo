/**
 * Auth Routes — Ro'yxatdan o'tish va tizimga kirish
 * 
 * POST /api/auth/register — Yangi biznes + admin yaratish
 * POST /api/auth/login    — Tizimga kirish, JWT token olish
 * GET  /api/auth/me       — Joriy foydalanuvchi ma'lumotlari
 * POST /api/auth/users    — Admin yangi xodim qo'shadi
 * GET  /api/auth/users    — Biznes xodimlari ro'yxati
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticateToken, authorizeRoles, generateToken } = require('../middleware/authMiddleware');
const telegramBot = require('../services/telegramBot');

const router = express.Router();

// PostgreSQL pool — server.js dan uzatiladi
module.exports = function (pool) {

  // ============================================
  // POST /api/auth/register
  // Yangi biznes ro'yxatdan o'tishi
  // 1. businesses jadvaliga yangi biznes qo'shadi
  // 2. users jadvaliga role='admin' bo'lgan birinchi foydalanuvchini yaratadi
  // 3. JWT token qaytaradi
  // ============================================
  router.post('/register', async (req, res) => {
    const { business_name, username, password, full_name } = req.body;

    // Validatsiya
    if (!business_name || !username || !password) {
      return res.status(400).json({
        error: 'Majburiy maydonlar to\'ldirilmagan',
        message: 'business_name, username va password majburiy.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Parol juda qisqa',
        message: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak.'
      });
    }

    try {
      // Username allaqachon mavjudligini tekshirish
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: 'Username band',
          message: `"${username}" foydalanuvchi nomi allaqachon mavjud. Boshqa nom tanlang.`
        });
      }

      // === Tranzaksiya ichida bajaramiz (atomik operatsiya) ===
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Yangi biznes yaratish
        const biznesResult = await client.query(
          'INSERT INTO businesses (business_name) VALUES ($1) RETURNING id, business_name, created_at',
          [business_name]
        );
        const biznes = biznesResult.rows[0];

        // 2. Parolni hash qilish (bcrypt, 10 rounds)
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 3. Admin foydalanuvchi yaratish
        const userResult = await client.query(
          `INSERT INTO users (business_id, username, password_hash, role, full_name)
           VALUES ($1, $2, $3, 'admin', $4)
           RETURNING id, business_id, username, role, full_name, created_at`,
          [biznes.id, username, password_hash, full_name || username]
        );
        const user = userResult.rows[0];

        await client.query('COMMIT');

        // 4. JWT token yaratish
        const token = generateToken({
          id: user.id,
          business_id: user.business_id,
          role: user.role,
          username: user.username
        });

        // 5. Javob qaytarish
        res.status(201).json({
          message: 'Biznes muvaffaqiyatli ro\'yxatdan o\'tdi!',
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name
          },
          business: {
            id: biznes.id,
            business_name: biznes.business_name
          }
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

    } catch (err) {
      console.error('Register xatosi:', err.message);
      res.status(500).json({ error: 'Server xatosi', message: err.message });
    }
  });

  // ============================================
  // POST /api/auth/login
  // Tizimga kirish — JWT token olish
  // 1. Username bo'yicha foydalanuvchini topadi
  // 2. Parolni bcrypt.compare() bilan tekshiradi
  // 3. JWT token qaytaradi (ichida: userId, businessId, role)
  // ============================================
  router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Validatsiya
    if (!username || !password) {
      return res.status(400).json({
        error: 'Majburiy maydonlar to\'ldirilmagan',
        message: 'username va password majburiy.'
      });
    }

    try {
      // 1. Foydalanuvchini topish (biznes nomi bilan birga)
      const result = await pool.query(
        `SELECT u.id, u.business_id, u.username, u.password_hash, u.role, u.full_name,
                b.business_name
         FROM users u
         JOIN businesses b ON u.business_id = b.id
         WHERE u.username = $1`,
        [username]
      );

      // Foydalanuvchi topilmadi
      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Kirish rad etildi',
          message: 'Username yoki parol noto\'g\'ri.'
        });
      }

      const user = result.rows[0];

      // 2. Parolni tekshirish
      const parolTogri = await bcrypt.compare(password, user.password_hash);

      if (!parolTogri) {
        return res.status(401).json({
          error: 'Kirish rad etildi',
          message: 'Username yoki parol noto\'g\'ri.'
        });
      }

      // 3. JWT token yaratish
      const token = generateToken({
        id: user.id,
        business_id: user.business_id,
        role: user.role,
        username: user.username
      });

      // 4. Javob qaytarish
      res.json({
        message: 'Tizimga muvaffaqiyatli kirdingiz!',
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          full_name: user.full_name
        },
        business: {
          id: user.business_id,
          business_name: user.business_name
        }
      });

    } catch (err) {
      console.error('Login xatosi:', err.message);
      res.status(500).json({ error: 'Server xatosi', message: err.message });
    }
  });

  // ============================================
  // GET /api/auth/me
  // Joriy foydalanuvchi ma'lumotlarini olish
  // Token asosida ishlaydi
  // ============================================
  router.get('/me', authenticateToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.business_id, u.username, u.role, u.full_name, u.created_at,
                b.business_name
         FROM users u
         JOIN businesses b ON u.business_id = b.id
         WHERE u.id = $1 AND u.business_id = $2`,
        [req.user.id, req.user.business_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Foydalanuvchi topilmadi'
        });
      }

      const user = result.rows[0];
      res.json({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          full_name: user.full_name,
          created_at: user.created_at
        },
        business: {
          id: user.business_id,
          business_name: user.business_name
        }
      });

    } catch (err) {
      console.error('Me xatosi:', err.message);
      res.status(500).json({ error: 'Server xatosi', message: err.message });
    }
  });

  // ============================================
  // POST /api/auth/users
  // Admin yangi xodim qo'shadi (o'z biznesi ichida)
  // Faqat admin roli ruxsat berilgan
  // ============================================
  router.post('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    const { username, password, role, full_name } = req.body;

    // Validatsiya
    if (!username || !password || !role) {
      return res.status(400).json({
        error: 'Majburiy maydonlar to\'ldirilmagan',
        message: 'username, password va role majburiy.'
      });
    }

    const allowedRoles = ['admin', 'seller', 'supplier_agent', 'warehouse_keeper'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        error: 'Noto\'g\'ri rol',
        message: `Ruxsat berilgan rollar: ${allowedRoles.join(', ')}`
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Parol juda qisqa',
        message: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak.'
      });
    }

    try {
      // Username bandligini tekshirish
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Username band',
          message: `"${username}" allaqachon mavjud.`
        });
      }

      // Parolni hash qilish
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(password, salt);

      // Xodimni adminning business_id si bilan yaratish
      const result = await pool.query(
        `INSERT INTO users (business_id, username, password_hash, role, full_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, business_id, username, role, full_name, created_at`,
        [req.user.business_id, username, password_hash, role, full_name || username]
      );

      res.status(201).json({
        message: 'Xodim muvaffaqiyatli qo\'shildi!',
        user: result.rows[0]
      });

    } catch (err) {
      console.error('User create xatosi:', err.message);
      res.status(500).json({ error: 'Server xatosi', message: err.message });
    }
  });

  // ============================================
  // GET /api/auth/users
  // Biznes xodimlari ro'yxati
  // Faqat admin ko'ra oladi
  // ============================================
  router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, username, role, full_name, created_at
         FROM users
         WHERE business_id = $1
         ORDER BY created_at`,
        [req.user.business_id]
      );

      res.json({
        count: result.rows.length,
        users: result.rows
      });

    } catch (err) {
      console.error('Users list xatosi:', err.message);
      res.status(500).json({ error: 'Server xatosi', message: err.message });
    }
  });

  // ============================================
  // POST /api/auth/telegram/link-init
  // Joriy foydalanuvchi uchun Telegram bog'lash havolasi yaratadi
  // ============================================
  router.post('/telegram/link-init', authenticateToken, async (req, res) => {
    if (!telegramBot.isAvailable()) {
      return res.status(503).json({ error: 'Telegram bot sozlanmagan. Adminga murojaat qiling.' });
    }
    try {
      const token = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `UPDATE users SET tg_link_token = $1, tg_link_expires = NOW() + INTERVAL '15 minutes' WHERE id = $2`,
        [token, req.user.id]
      );
      const botUsername = telegramBot.getBotUsername();
      const deepLink = `https://t.me/${botUsername}?start=${token}`;
      res.json({ link: deepLink, expires_in_minutes: 15, bot_username: botUsername });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // GET /api/auth/telegram/status
  // Joriy foydalanuvchi telegramga bog'langanmi?
  // ============================================
  router.get('/telegram/status', authenticateToken, async (req, res) => {
    try {
      const r = await pool.query(`SELECT telegram_chat_id FROM users WHERE id = $1`, [req.user.id]);
      res.json({
        linked: !!r.rows[0]?.telegram_chat_id,
        bot_available: telegramBot.isAvailable(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // POST /api/auth/telegram/unlink
  // Telegram bog'lanishini o'chirish
  // ============================================
  router.post('/telegram/unlink', authenticateToken, async (req, res) => {
    try {
      await pool.query(`UPDATE users SET telegram_chat_id = NULL WHERE id = $1`, [req.user.id]);
      res.json({ message: "Bog'lanish o'chirildi" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // POST /api/auth/forgot-password
  // Username bo'yicha 6 raqamli kodni Telegramga yuboradi
  // ============================================
  router.post('/forgot-password', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username majburiy' });

    try {
      const userRes = await pool.query(
        `SELECT id, telegram_chat_id, full_name FROM users WHERE username = $1`,
        [username]
      );
      // Xavfsizlik: aniqlikni ko'rsatmaslik (timing safe)
      const genericMsg = "Agar bu username mavjud va Telegram bog'langan bo'lsa, kod yuborildi.";

      if (userRes.rows.length === 0 || !userRes.rows[0].telegram_chat_id) {
        return res.json({ message: genericMsg, can_reset: false });
      }
      const user = userRes.rows[0];

      if (!telegramBot.isAvailable()) {
        return res.status(503).json({ error: 'Telegram bot ishlamayapti. Adminga murojaat qiling.' });
      }

      // 6 raqamli kod
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await pool.query(
        `UPDATE users SET reset_code = $1, reset_code_expires = NOW() + INTERVAL '10 minutes' WHERE id = $2`,
        [code, user.id]
      );

      try {
        await telegramBot.sendMessage(
          user.telegram_chat_id,
          `🔐 Parolni tiklash kodingiz:\n\n<b>${code}</b>\n\nMuddati: 10 daqiqa\nFoydalanuvchi: ${username}\n\nAgar siz so'rov yubormagan bo'lsangiz — bu xabarni e'tiborsiz qoldiring.`.replace(/<b>(.*?)<\/b>/g, '$1')
        );
      } catch (e) {
        console.error('Telegram yuborish xatosi:', e.message);
        return res.status(500).json({ error: "Telegramga xabar yuborib bo'lmadi" });
      }

      res.json({ message: genericMsg, can_reset: true });
    } catch (err) {
      console.error('forgot-password xatosi:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // POST /api/auth/reset-password
  // Username + kod + yangi parol → parolni almashtiradi
  // ============================================
  router.post('/reset-password', async (req, res) => {
    const { username, code, new_password } = req.body;
    if (!username || !code || !new_password) {
      return res.status(400).json({ error: 'username, code va new_password majburiy' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Parol kamida 6 belgi bo\'lishi kerak' });
    }

    try {
      const r = await pool.query(
        `SELECT id, reset_code, reset_code_expires FROM users WHERE username = $1`,
        [username]
      );
      if (r.rows.length === 0) {
        return res.status(400).json({ error: "Kod yoki username noto'g'ri" });
      }
      const user = r.rows[0];
      if (!user.reset_code || user.reset_code !== code) {
        return res.status(400).json({ error: "Kod noto'g'ri" });
      }
      if (new Date(user.reset_code_expires) < new Date()) {
        return res.status(400).json({ error: "Kod muddati o'tgan. Qaytadan so'rov yuboring." });
      }

      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(new_password, salt);
      await pool.query(
        `UPDATE users SET password_hash = $1, reset_code = NULL, reset_code_expires = NULL WHERE id = $2`,
        [password_hash, user.id]
      );

      res.json({ message: 'Parol muvaffaqiyatli yangilandi. Endi tizimga kiring.' });
    } catch (err) {
      console.error('reset-password xatosi:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
