-- ============================================================
--  Database Depot Epii - Sistem Keuangan
-- ============================================================

CREATE DATABASE IF NOT EXISTS depot_epii
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE depot_epii;

-- Tabel Pemasukan Harian
CREATE TABLE IF NOT EXISTS income (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE         NOT NULL,
  category    VARCHAR(100) NOT NULL DEFAULT 'Penjualan Air',
  description VARCHAR(255) NOT NULL,
  amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_income_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel Pengeluaran Rutin
CREATE TABLE IF NOT EXISTS expenses (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE         NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expenses_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel Pengeluaran Tidak Terduga
CREATE TABLE IF NOT EXISTS unexpected_expenses (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  record_date DATE         NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_unexpected_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel Hutang Karyawan
CREATE TABLE IF NOT EXISTS employee_debts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  employee_name VARCHAR(255) NOT NULL,
  description   VARCHAR(255),
  amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  debt_date     DATE NOT NULL,
  status        ENUM('belum lunas','lunas') DEFAULT 'belum lunas',
  paid_date     DATE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_debt_status (status),
  INDEX idx_debt_date (debt_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
