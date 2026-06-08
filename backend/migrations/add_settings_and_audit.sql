-- Business sozlamalari jadvali
CREATE TABLE IF NOT EXISTS business_settings (
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

-- Audit log jadvali
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    business_id INT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_business ON audit_log(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
