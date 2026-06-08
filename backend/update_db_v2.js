const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'ulgurji_savdo',
  port: parseInt(process.env.PGPORT) || 5432,
});

async function updateSchema() {
  try {
    await pool.query(`
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_id VARCHAR(50);
      CREATE INDEX IF NOT EXISTS idx_transactions_group_id ON transactions(group_id);
    `);
    console.log("Schema updated: group_id added to transactions");
  } catch (err) {
    console.error("Schema update error:", err);
  } finally {
    await pool.end();
  }
}

updateSchema();
