-- ============================================
-- Ulgurji Savdo — Multi-tenant SaaS Database Schema
-- PostgreSQL uchun jadval strukturalari
-- psql -U user -d dbname -f backend/db.sql
-- ============================================

-- Mavjud jadvallarni o'chirish (tartib bilan — bog'liqlik ketma-ketligida)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS business_settings CASCADE;
DROP TABLE IF EXISTS kassa CASCADE;
DROP TABLE IF EXISTS kassa_smena CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;
-- Eski jadvallarni ham o'chirish (migratsiya uchun)
DROP TABLE IF EXISTS tranzaktsiyalar CASCADE;
DROP TABLE IF EXISTS pudratchilar CASCADE;
DROP TABLE IF EXISTS klientlar CASCADE;
DROP TABLE IF EXISTS mahsulotlar CASCADE;

-- ============================================
-- 1. BUSINESSES — Bizneslar (tenantlar)
-- Har bir tadbirkor uchun alohida yozuv
-- ============================================
CREATE TABLE businesses (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. USERS — Foydalanuvchilar (xodimlar)
-- Har bir xodim bitta biznesga tegishli
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'seller', 'supplier_agent', 'warehouse_keeper')),
    full_name VARCHAR(100),
    telegram_chat_id BIGINT,
    tg_link_token VARCHAR(40),
    tg_link_expires TIMESTAMP,
    reset_code VARCHAR(10),
    reset_code_expires TIMESTAMP,
    clerk_user_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_tg_chat ON users(telegram_chat_id);
CREATE INDEX idx_users_tg_link_token ON users(tg_link_token);

-- Tez qidiruv uchun indeks
CREATE INDEX idx_users_business_id ON users(business_id);

-- ============================================
-- 3. PRODUCTS — Mahsulotlar
-- Ikki valyutada narx (USD va UZS)
-- ============================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(18,2) DEFAULT 0,
    price_usd DECIMAL(18,2) DEFAULT 0,
    price_uzs DECIMAL(18,2) DEFAULT 0,
    unit VARCHAR(50) DEFAULT 'dona',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_business_id ON products(business_id);

-- ============================================
-- 4. CLIENTS — Klientlar va Pudratchilar
-- client_type: 'customer' yoki 'supplier'
-- Ikki valyutada balans
-- ============================================
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    client_type VARCHAR(20) DEFAULT 'customer' CHECK (client_type IN ('customer', 'supplier')),
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    balance_usd DECIMAL(18,2) DEFAULT 0,
    balance_uzs DECIMAL(18,2) DEFAULT 0,
    assigned_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_clients_business_id ON clients(business_id);
CREATE INDEX idx_clients_type ON clients(business_id, client_type);

-- ============================================
-- 5. TRANSACTIONS — Tranzaksiyalar
-- Barcha moliyaviy operatsiyalar
-- ============================================
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    client_id INT REFERENCES clients(id) ON DELETE SET NULL,
    product_id INT REFERENCES products(id) ON DELETE SET NULL,
    transaction_type VARCHAR(30) NOT NULL,
    amount_usd DECIMAL(18,2) DEFAULT 0,
    amount_uzs DECIMAL(18,2) DEFAULT 0,
    exchange_rate DECIMAL(18,4) DEFAULT 0,
    quantity DECIMAL(18,2) DEFAULT 0,
    price DECIMAL(18,2) DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'dona',
    group_id VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_business_id ON transactions(business_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_client_id ON transactions(client_id);
CREATE INDEX idx_transactions_product_id ON transactions(product_id);
CREATE INDEX idx_transactions_group_id ON transactions(group_id);

-- ============================================
-- 6a. KASSA_SMENA — Kassa smenalari (kunlik yopilish)
-- Har bir valyuta uchun alohida smena
-- ============================================
CREATE TABLE kassa_smena (
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

CREATE INDEX idx_kassa_smena_business ON kassa_smena(business_id);
CREATE INDEX idx_kassa_smena_status ON kassa_smena(business_id, valuta, status);

-- ============================================
-- 6b. KASSA — Pul oqimi (kirim/chiqim)
-- Har bir yozuv smenaga bog’lanadi
-- ============================================
CREATE TABLE kassa (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    client_id INT REFERENCES clients(id) ON DELETE SET NULL,
    smena_id INT REFERENCES kassa_smena(id) ON DELETE SET NULL,
    group_id VARCHAR(50),
    summa DECIMAL(18,2) NOT NULL,
    valuta VARCHAR(10) DEFAULT 'UZS',
    turi VARCHAR(20) NOT NULL CHECK (turi IN ('kirim', 'chiqim')),
    payment_method VARCHAR(10) DEFAULT 'naqd' CHECK (payment_method IN ('naqd', 'karta', 'kochirma')),
    izoh TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_kassa_business_id ON kassa(business_id);
CREATE INDEX idx_kassa_group_id ON kassa(group_id);
CREATE INDEX idx_kassa_smena_id ON kassa(smena_id);

-- ============================================
-- 7. BUSINESS_SETTINGS — Biznes sozlamalari
-- ============================================
CREATE TABLE business_settings (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
    company_name VARCHAR(200),
    phone VARCHAR(50),
    address TEXT,
    default_currency VARCHAR(10) DEFAULT 'UZS',
    default_exchange_rate DECIMAL(18,4) DEFAULT 0,
    low_stock_threshold INT DEFAULT 10,
    receipt_format VARCHAR(20) DEFAULT 'A4',
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 8. AUDIT_LOG — Faoliyat tarixi
-- ============================================
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_business ON audit_log(business_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================
-- BOSHLANG'ICH TEST MA'LUMOTLAR
-- ============================================

-- Test biznes
INSERT INTO businesses (business_name) VALUES
  ('Demo Savdo MChJ');

-- Admin foydalanuvchi (parol: admin123 — bcrypt hash)
-- Hash: $2a$10$... — server tomonida bcryptjs bilan hosil qilinadi
-- Bu yerda placeholder qo'yilgan, haqiqiy hash register endpointida yaratiladi
INSERT INTO users (business_id, username, password_hash, role, full_name) VALUES
  (1, 'admin', '$2a$10$rQKZL0k7xKv7v8v7v8v7v8v7v8v7v8v7v8v7v8v7v8v7v8v7v8v7ve', 'admin', 'Administrator');

-- Test mahsulotlar
INSERT INTO products (business_id, name, quantity, price_usd, price_uzs) VALUES
  (1, 'Tuxum (10 dona)', 500, 1.20, 15000),
  (1, 'Tuxum (30 dona)', 200, 3.30, 42000),
  (1, 'Tovuq go''shti (1 kg)', 150, 2.80, 35000),
  (1, 'Ozuqa (1 kg)', 1000, 0.65, 8000),
  (1, 'Parranda qafasi', 20, 20.00, 250000);

-- Test klientlar
INSERT INTO clients (business_id, client_type, full_name, phone, address) VALUES
  (1, 'customer', 'Akmal Savdo', '+998901234567', 'Toshkent, Chilonzor'),
  (1, 'customer', 'Sardor Market', '+998907654321', 'Samarqand, Registon'),
  (1, 'customer', 'Nodira Do''kon', '+998911112233', 'Buxoro, Markaz');

-- Test pudratchilar (supplier)
INSERT INTO clients (business_id, client_type, full_name, phone, address) VALUES
  (1, 'supplier', 'Yem-Xashak MChJ', '+998933334455', 'Toshkent, Sergeli'),
  (1, 'supplier', 'Parranda Farm', '+998945556677', 'Jizzax, Markaz');