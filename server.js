require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');
const { networkInterfaces } = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret           : process.env.SESSION_SECRET || 'depot-epii-rahasia-2026',
  resave           : false,
  saveUninitialized: false,
  cookie           : { maxAge: 10 * 60 * 60 * 1000, sameSite: 'lax' },
}));

// Static assets — tidak butuh auth
app.use('/css',   express.static(path.join(__dirname, 'public/css')));
app.use('/js',    express.static(path.join(__dirname, 'public/js')));
app.use('/icons', express.static(path.join(__dirname, 'public/icons')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'public/manifest.json')));
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public/sw.js'));
});

// ── Database Pool ─────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host              : process.env.DB_HOST     || 'localhost',
  port              : process.env.DB_PORT     || 3306,
  user              : process.env.DB_USER     || 'root',
  password          : process.env.DB_PASSWORD || '',
  database          : process.env.DB_NAME     || 'depot_epii',
  waitForConnections: true,
  connectionLimit   : 10,
  timezone          : '+07:00',
  dateStrings       : true,
});

function todayStr() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); }
function fmtDate(v) {
  if (!v) return null;
  return String(v).split('T')[0];
}

// ── Auth Routes (tanpa auth) ──────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session?.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  try {
    const [[user]] = await pool.execute('SELECT * FROM users WHERE username=?', [username]);
    if (!user) return res.status(401).json({ error: 'Username atau password salah' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Username atau password salah' });
    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.fullName = user.full_name;
    res.json({ ok: true, name: user.full_name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Belum login' });
  res.json({ username: req.session.username, fullName: req.session.fullName });
});

// ── Auth Middleware ───────────────────────────────────────────────────────────
const requireAuth = (req, res, next) => {
  if (req.session?.userId) return next();
  res.status(401).json({ error: 'Sesi habis, silakan login kembali' });
};
app.use('/api', requireAuth);

// ── Main App ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (!req.session?.userId) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Summary ───────────────────────────────────────────────────────────────────
app.get('/api/summary/:date', async (req, res) => {
  const { date } = req.params;
  try {
    const [[inc]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM income WHERE record_date=?', [date]);
    const [[exp]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE record_date=?', [date]);
    const [[unx]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM unexpected_expenses WHERE record_date=?', [date]);
    const [[dbt]] = await pool.execute("SELECT COALESCE(SUM(amount),0) t FROM employee_debts WHERE status='belum lunas'");
    const totalIncome = +inc.t, totalExpenses = +exp.t, totalUnexpected = +unx.t, totalDebts = +dbt.t;
    res.json({ date, totalIncome, totalExpenses, totalUnexpected, totalDebts, netIncome: totalIncome - totalExpenses - totalUnexpected });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Income ────────────────────────────────────────────────────────────────────
app.get('/api/income/:date', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM income WHERE record_date=? ORDER BY created_at DESC', [req.params.date]);
    res.json(rows.map(r => ({ ...r, record_date: fmtDate(r.record_date) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/income', async (req, res) => {
  try {
    const { description, amount, category, record_date } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi' });
    const [r] = await pool.execute(
      'INSERT INTO income (record_date, category, description, amount) VALUES (?,?,?,?)',
      [record_date || todayStr(), category || 'Penjualan Air', description, +amount]);
    await updateCSV(record_date || todayStr());
    res.json({ id: r.insertId, message: 'Pemasukan berhasil ditambahkan' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/income/:id', async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi' });
    const [[row]] = await pool.execute('SELECT record_date FROM income WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
    await pool.execute('UPDATE income SET description=?, amount=?, category=? WHERE id=?',
      [description, +amount, category || 'Penjualan Air Isi Ulang', req.params.id]);
    await updateCSV(fmtDate(row.record_date));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/income/:id', async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT record_date FROM income WHERE id=?', [req.params.id]);
    await pool.execute('DELETE FROM income WHERE id=?', [req.params.id]);
    if (row) await updateCSV(fmtDate(row.record_date));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Expenses ──────────────────────────────────────────────────────────────────
app.get('/api/expenses/:date', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM expenses WHERE record_date=? ORDER BY created_at DESC', [req.params.date]);
    res.json(rows.map(r => ({ ...r, record_date: fmtDate(r.record_date) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { description, amount, record_date } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi' });
    const [r] = await pool.execute(
      'INSERT INTO expenses (record_date, description, amount) VALUES (?,?,?)',
      [record_date || todayStr(), description, +amount]);
    await updateCSV(record_date || todayStr());
    res.json({ id: r.insertId, message: 'Pengeluaran berhasil ditambahkan' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/expenses/:id', async (req, res) => {
  try {
    const { description, amount } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi' });
    const [[row]] = await pool.execute('SELECT record_date FROM expenses WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
    await pool.execute('UPDATE expenses SET description=?, amount=? WHERE id=?',
      [description, +amount, req.params.id]);
    await updateCSV(fmtDate(row.record_date));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT record_date FROM expenses WHERE id=?', [req.params.id]);
    await pool.execute('DELETE FROM expenses WHERE id=?', [req.params.id]);
    if (row) await updateCSV(fmtDate(row.record_date));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Unexpected Expenses ───────────────────────────────────────────────────────
app.get('/api/unexpected/:date', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM unexpected_expenses WHERE record_date=? ORDER BY created_at DESC', [req.params.date]);
    res.json(rows.map(r => ({ ...r, record_date: fmtDate(r.record_date) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/unexpected', async (req, res) => {
  try {
    const { description, amount, record_date } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi' });
    const [r] = await pool.execute(
      'INSERT INTO unexpected_expenses (record_date, description, amount) VALUES (?,?,?)',
      [record_date || todayStr(), description, +amount]);
    await updateCSV(record_date || todayStr());
    res.json({ id: r.insertId, message: 'Pengeluaran tak terduga berhasil ditambahkan' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/unexpected/:id', async (req, res) => {
  try {
    const { description, amount } = req.body;
    if (!description || !amount) return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi' });
    const [[row]] = await pool.execute('SELECT record_date FROM unexpected_expenses WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
    await pool.execute('UPDATE unexpected_expenses SET description=?, amount=? WHERE id=?',
      [description, +amount, req.params.id]);
    await updateCSV(fmtDate(row.record_date));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/unexpected/:id', async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT record_date FROM unexpected_expenses WHERE id=?', [req.params.id]);
    await pool.execute('DELETE FROM unexpected_expenses WHERE id=?', [req.params.id]);
    if (row) await updateCSV(fmtDate(row.record_date));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Employee Debts ────────────────────────────────────────────────────────────
app.get('/api/debts', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM employee_debts', params = [];
    if (status && status !== 'all') { sql += ' WHERE status=?'; params.push(status); }
    sql += ' ORDER BY status ASC, debt_date DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(r => ({ ...r, debt_date: fmtDate(r.debt_date), paid_date: fmtDate(r.paid_date) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/debts', async (req, res) => {
  try {
    const { employee_name, description, amount, debt_date } = req.body;
    if (!employee_name || !amount) return res.status(400).json({ error: 'Nama karyawan dan jumlah wajib diisi' });
    const [r] = await pool.execute(
      "INSERT INTO employee_debts (employee_name, description, amount, debt_date, status) VALUES (?,?,?,?,'belum lunas')",
      [employee_name, description || '-', +amount, debt_date || todayStr()]);
    res.json({ id: r.insertId, message: 'Hutang berhasil ditambahkan' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/debts/:id/pay', async (req, res) => {
  try {
    await pool.execute("UPDATE employee_debts SET status='lunas', paid_date=? WHERE id=?", [todayStr(), req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/debts/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM employee_debts WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dates ─────────────────────────────────────────────────────────────────────
app.get('/api/dates', async (req, res) => {
  try {
    const [a] = await pool.execute('SELECT DISTINCT record_date d FROM income');
    const [b] = await pool.execute('SELECT DISTINCT record_date d FROM expenses');
    const [c] = await pool.execute('SELECT DISTINCT record_date d FROM unexpected_expenses');
    const set = new Set([...a, ...b, ...c].map(r => fmtDate(r.d)).filter(Boolean));
    res.json([...set].sort().reverse());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/history/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const prefix = `${year}-${month.padStart(2,'0')}-`;
    const startOfMonth = `${year}-${month.padStart(2,'0')}-01`;

    const [[incPrev]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM income WHERE record_date < ?', [startOfMonth]);
    const [[expPrev]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE record_date < ?', [startOfMonth]);
    const [[unxPrev]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM unexpected_expenses WHERE record_date < ?', [startOfMonth]);
    let cumulative = +incPrev.t - +expPrev.t - +unxPrev.t;

    const [dates] = await pool.execute(`
      SELECT DISTINCT record_date d FROM (
        SELECT record_date FROM income WHERE record_date LIKE ?
        UNION SELECT record_date FROM expenses WHERE record_date LIKE ?
        UNION SELECT record_date FROM unexpected_expenses WHERE record_date LIKE ?
      ) t ORDER BY d ASC`, [prefix+'%', prefix+'%', prefix+'%']);
    const results = [];
    for (const { d } of dates) {
      const dt = fmtDate(d);
      const [[inc]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM income WHERE record_date=?', [dt]);
      const [[exp]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE record_date=?', [dt]);
      const [[unx]] = await pool.execute('SELECT COALESCE(SUM(amount),0) t FROM unexpected_expenses WHERE record_date=?', [dt]);
      const net = +inc.t - +exp.t - +unx.t;
      cumulative += net;
      results.push({ date: dt, income: +inc.t, expenses: +exp.t, unexpected: +unx.t, net, cumulative });
    }
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CSV Export ────────────────────────────────────────────────────────────────
async function updateCSV(date) {
  try {
    const dir = path.join(__dirname, 'exports');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const [inc] = await pool.execute('SELECT * FROM income WHERE record_date=?', [date]);
    const [exp] = await pool.execute('SELECT * FROM expenses WHERE record_date=?', [date]);
    const [unx] = await pool.execute('SELECT * FROM unexpected_expenses WHERE record_date=?', [date]);
    const rows = [
      ...inc.map(r => [date, 'Pemasukan', r.category, r.description, r.amount]),
      ...exp.map(r => [date, 'Pengeluaran', 'Rutin', r.description, r.amount]),
      ...unx.map(r => [date, 'Pengeluaran Tak Terduga', 'Mendadak', r.description, r.amount]),
    ];
    const header = 'Tanggal,Tipe,Kategori,Keterangan,Jumlah\n';
    const body = rows.map(r => r.map((v, i) => i === 3 ? `"${v}"` : v).join(',')).join('\n');
    fs.writeFileSync(path.join(dir, `laporan_${date}.csv`), '﻿' + header + body, 'utf8');
  } catch (e) { console.error('[CSV]', e.message); }
}

app.get('/api/export/daily/:date', async (req, res) => {
  const { date } = req.params;
  await updateCSV(date);
  const file = path.join(__dirname, 'exports', `laporan_${date}.csv`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Tidak ada data' });
  res.download(file, `Laporan_DepotEpii_${date}.csv`);
});

app.get('/api/export/monthly/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const prefix = `${year}-${month.padStart(2,'0')}-`;
    const [inc] = await pool.execute("SELECT * FROM income WHERE record_date LIKE ?", [prefix+'%']);
    const [exp] = await pool.execute("SELECT * FROM expenses WHERE record_date LIKE ?", [prefix+'%']);
    const [unx] = await pool.execute("SELECT * FROM unexpected_expenses WHERE record_date LIKE ?", [prefix+'%']);
    const [dbt] = await pool.execute("SELECT * FROM employee_debts WHERE debt_date LIKE ?", [prefix+'%']);
    const rows = [
      ...inc.map(r => [fmtDate(r.record_date), 'Pemasukan', r.category, r.description, r.amount]),
      ...exp.map(r => [fmtDate(r.record_date), 'Pengeluaran', 'Rutin', r.description, r.amount]),
      ...unx.map(r => [fmtDate(r.record_date), 'Pengeluaran Tak Terduga', 'Mendadak', r.description, r.amount]),
      ...dbt.map(r => [fmtDate(r.debt_date), 'Hutang Karyawan', r.employee_name, r.description, r.amount]),
    ].sort((a, b) => a[0].localeCompare(b[0]));
    if (!rows.length) return res.status(404).json({ error: 'Tidak ada data untuk bulan ini' });
    const header = 'Tanggal,Tipe,Kategori/Nama,Keterangan,Jumlah\n';
    const body = rows.map(r => r.map((v, i) => i === 3 ? `"${v}"` : v).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan_DepotEpii_${year}-${month}.csv"`);
    res.send('﻿' + header + body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

async function initDB() {
  await pool.execute(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('admin','user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS income (
    id INT AUTO_INCREMENT PRIMARY KEY,
    record_date DATE NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Penjualan Air',
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_income_date (record_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    record_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expenses_date (record_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS unexpected_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    record_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_unexpected_date (record_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS employee_debts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_name VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    debt_date DATE NOT NULL,
    status ENUM('belum lunas','lunas') DEFAULT 'belum lunas',
    paid_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_debt_status (status),
    INDEX idx_debt_date (debt_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [[existing]] = await pool.execute('SELECT id FROM users LIMIT 1');
  if (!existing) {
    const hash = await bcrypt.hash('depot2026', 12);
    await pool.execute(
      "INSERT INTO users (username, password, full_name, role) VALUES (?,?,?,?)",
      ['admin', hash, 'Administrator', 'admin']
    );
    console.log('  Akun default dibuat: admin / depot2026');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await initDB();
  const ip = getLocalIP();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ╔══════════════════════════════════════════════════╗`);
    console.log(`  ║   Depot Epii — Sistem Keuangan                   ║`);
    console.log(`  ╠══════════════════════════════════════════════════╣`);
    console.log(`  ║   Komputer  : http://localhost:${PORT}               ║`);
    console.log(`  ║   HP/Tablet : http://${ip}:${PORT}            ║`);
    console.log(`  ╚══════════════════════════════════════════════════╝\n`);
  });
}
start();
