const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'ulgurji_savdo',
  port: parseInt(process.env.PGPORT) || 5432,
  // Neon/Render kabi managed PostgreSQL SSL talab qiladi.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function updateSchema() {
  try {
    await pool.query(`
      ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check;
      ALTER TABLE clients ALTER COLUMN client_type SET DEFAULT 'customer';
      UPDATE clients SET client_type = 'customer' WHERE client_type = 'client';
      ALTER TABLE clients ADD CONSTRAINT clients_client_type_check CHECK (client_type IN ('customer', 'supplier'));
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_id INT REFERENCES products(id) ON DELETE SET NULL;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS quantity DECIMAL(18,2) DEFAULT 0;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS price DECIMAL(18,2) DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'dona';
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'dona';
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_id VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_transactions_product_id ON transactions(product_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_group_id ON transactions(group_id);
      ALTER TABLE kassa ADD COLUMN IF NOT EXISTS group_id VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_kassa_group_id ON kassa(group_id);
    `);
    console.log("Schema updated successfully");
  } catch (err) {
    console.error("Schema update error:", err);
  } finally {
    await pool.end();
  }
}

updateSchema();
