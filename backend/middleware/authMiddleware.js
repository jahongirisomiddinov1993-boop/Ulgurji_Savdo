/**
 * Auth Middleware — Clerk JWT token asosida autentifikatsiya
 *
 * Vazifasi:
 * 1. Har bir API so'rovda Authorization headerdan Clerk JWT tokenni oladi
 * 2. Tokenni Clerk SDK orqali tekshiradi
 * 3. Clerk user ID orqali biznes user/business ma'lumotlarini olish
 * 4. req.user = { id, business_id, role, username, clerk_user_id }
 * 5. Keyingi barcha API so'rovlarda faqat shu business_id ga tegishli ma'lumotlar qaytariladi
 */

const { createClerkClient } = require('@clerk/backend');
const { Pool } = require('pg');

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Shared PostgreSQL pool (server.js bilan bir xil konfiguratsiya)
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'ulgurji_savdo',
  port: parseInt(process.env.PGPORT) || 5432,
  max: 5,
  idleTimeoutMillis: 30000,
  // Neon/Render kabi managed PostgreSQL SSL talab qiladi.
  // Lokal rivojlanishda (NODE_ENV !== 'production') SSL o'chiriladi.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

/**
 * authenticateToken — Asosiy middleware (Clerk JWT)
 *
 * Ishlash tartibi:
 * 1. "Authorization: Bearer <token>" headerdan tokenni ajratadi
 * 2. Clerk SDK orqali tokenni tekshiradi
 * 3. Clerk user ID orqali biznes user/business ma'lumotlarini olish
 * 4. Muvaffaqiyatli bo'lsa — req.user ga foydalanuvchi ma'lumotlarini biriktirib, next() chaqiradi
 * 5. Token yo'q yoki noto'g'ri bo'lsa — 401/403 xato qaytaradi
 *
 * Foydalanish:
 *   app.get('/api/products', authenticateToken, async (req, res) => {
 *     const businessId = req.user.business_id; // SaaS izolyatsiya
 *     const userId = req.user.id;               // Kim so'rov yuborgan
 *     const role = req.user.role;                // Foydalanuvchi roli
 *   });
 */
async function authenticateToken(req, res, next) {
  // 1. Authorization headerdan tokenni olish
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" → "TOKEN"

  // Token yo'q bo'lsa — 401 Unauthorized
  if (!token) {
    return res.status(401).json({
      error: 'Avtorizatsiya talab qilinadi',
      message: 'Token topilmadi. Iltimos, tizimga kiring.'
    });
  }

  try {
    // 2. Clerk JWT ni tekshirish
    const payload = await clerk.verifyToken(token, {
      jwtKey: process.env.CLERK_SECRET_KEY,
    });

    const clerkUserId = payload.sub;

    // 3. Clerk user ID orqali biznes user ma'lumotlarini olish
    const { rows } = await pool.query(
      `SELECT u.*, b.business_name FROM users u
       JOIN businesses b ON u.business_id = b.id
       WHERE u.clerk_user_id = $1`,
      [clerkUserId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error: 'Foydalanuvchi topilmadi',
        message: 'Clerk user ID bilan bog\'langan biznes user topilmadi.'
      });
    }

    const user = rows[0];

    // 4. Foydalanuvchi ma'lumotlarini req.user ga biriktirish
    req.user = {
      id: user.id,
      business_id: user.business_id,
      role: user.role,
      username: user.username,
      full_name: user.full_name,
      clerk_user_id: clerkUserId
    };

    // 5. Keyingi middleware/route ga o'tish
    next();
  } catch (err) {
    console.error('Clerk JWT verification error:', err.message);

    // Token noto'g'ri yoki buzilgan
    return res.status(403).json({
      error: 'Token noto\'g\'ri',
      message: 'Yaroqsiz token. Kirish rad etildi.'
    });
  }
}

/**
 * authorizeRoles — Rol asosida ruxsat tekshirish middleware
 * 
 * authenticateToken dan KEYIN ishlatiladi.
 * Faqat ruxsat berilgan rollardagi foydalanuvchilar o'tadi.
 * 
 * Foydalanish:
 *   app.delete('/api/products/:id', authenticateToken, authorizeRoles('admin'), handler);
 *   app.post('/api/products', authenticateToken, authorizeRoles('admin', 'warehouse_keeper'), handler);
 * 
 * @param  {...string} roles — Ruxsat berilgan rollar ro'yxati
 */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    // req.user allaqachon authenticateToken tomonidan o'rnatilgan bo'lishi kerak
    if (!req.user) {
      return res.status(401).json({
        error: 'Avtorizatsiya talab qilinadi',
        message: 'Avval tizimga kiring.'
      });
    }

    // Foydalanuvchi roli ruxsat berilgan rollar ichida bormi?
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Ruxsat berilmagan',
        message: `Bu amalni faqat ${roles.join(', ')} rollaridagi foydalanuvchilar bajara oladi. Sizning rolingiz: ${req.user.role}`
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles
};
