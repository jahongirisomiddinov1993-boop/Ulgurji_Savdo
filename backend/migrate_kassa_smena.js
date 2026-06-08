/**
 * Migratsiya: kassa_smena jadvalini yaratish va kassa jadvaliga yangi ustunlar qo'shish
 * Ishlatish: node migrate_kassa_smena.js
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon/Render kabi managed PostgreSQL SSL talab qiladi.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. kassa_smena jadvalini yaratish (agar yo'q bo'lsa)
    await client.query(`
      CREATE TABLE IF NOT EXISTS kassa_smena (
        id SERIAL PRIMARY KEY,
        business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        opened_by INT REFERENCES users(id) ON DELETE SET NULL,
        closed_by INT REFERENCES users(id) ON DELETE SET NULL,
        valuta VARCHAR(3) NOT NULL DEFAULT 'UZS',
        opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMP,
        auto_closed BOOLEAN DEFAULT FALSE,
        status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        opening_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
        total_naqd_in DECIMAL(18,2) DEFAULT 0,
        total_karta_in DECIMAL(18,2) DEFAULT 0,
        total_kochirma_in DECIMAL(18,2) DEFAULT 0,
        total_naqd_out DECIMAL(18,2) DEFAULT 0,
        total_karta_out DECIMAL(18,2) DEFAULT 0,
        total_kochirma_out DECIMAL(18,2) DEFAULT 0,
        closing_balance DECIMAL(18,2),
        real_naqd DECIMAL(18,2),
        farq DECIMAL(18,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. Indekslar
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kassa_smena_business ON kassa_smena(business_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_kassa_smena_status ON kassa_smena(business_id, valuta, status);
    `);

    // 3. kassa jadvaliga smena_id ustunini qo'shish
    const col1 = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'kassa' AND column_name = 'smena_id'
    `);
    if (col1.rows.length === 0) {
      await client.query(`ALTER TABLE kassa ADD COLUMN smena_id INT REFERENCES kassa_smena(id) ON DELETE SET NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_kassa_smena_id ON kassa(smena_id)`);
      console.log('✅ kassa.smena_id ustuni qo\'shildi');
    } else {
      console.log('ℹ️ kassa.smena_id allaqachon mavjud');
    }

    // 4. kassa jadvaliga payment_method ustunini qo'shish
    const col2 = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'kassa' AND column_name = 'payment_method'
    `);
    if (col2.rows.length === 0) {
      await client.query(`ALTER TABLE kassa ADD COLUMN payment_method VARCHAR(10) DEFAULT 'naqd' CHECK (payment_method IN ('naqd', 'karta', 'kochirma'))`);
      console.log('✅ kassa.payment_method ustuni qo\'shildi');
    } else {
      console.log('ℹ️ kassa.payment_method allaqachon mavjud');
    }

    await client.query('COMMIT');
    console.log('✅ Migratsiya muvaffaqiyatli yakunlandi!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migratsiya xatosi:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
