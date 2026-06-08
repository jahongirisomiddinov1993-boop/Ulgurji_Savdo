-- Migration: products jadvaliga unit ustunini qo'shish
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'dona';
