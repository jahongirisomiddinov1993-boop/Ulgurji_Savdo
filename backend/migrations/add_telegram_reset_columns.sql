-- ============================================
-- Migration: Telegram bog'lanish va parol tiklash uchun ustunlar
-- Bajarish: psql -U user -d dbname -f backend/migrations/add_telegram_reset_columns.sql
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS tg_link_token VARCHAR(40),
  ADD COLUMN IF NOT EXISTS tg_link_expires TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reset_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS reset_code_expires TIMESTAMP;

-- Tezkor qidiruv uchun
CREATE INDEX IF NOT EXISTS idx_users_tg_chat ON users(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_users_tg_link_token ON users(tg_link_token);

-- db.sql ga ham ushbu ustunlarni qo'shing (yangi o'rnatishlar uchun)
