/* ── Service Worker ───────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* ── Auth Check ───────────────────────────────────────────── */
(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login'; return; }
    const { fullName, username } = await res.json();
    const display = fullName || username;
    const el1 = document.getElementById('userNameDisplay');
    const el2 = document.getElementById('topbarUserName');
    if (el1) el1.textContent = display;
    if (el2) el2.textContent = display;
  } catch { window.location.href = '/login'; }
})();

/* ── Logout ───────────────────────────────────────────────── */
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  if (!confirm('Yakin ingin keluar?')) return;
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
});

/* ── Global 401 handler ───────────────────────────────────── */
const _origFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401 && !args[0].includes('/api/auth/')) {
    window.location.href = '/login';
  }
  return res;
};

/* ── State ────────────────────────────────────────────────── */
const state = {
  date        : todayISO(),
  section     : 'dashboard',
  debtFilter  : 'all',
  histYear    : new Date().getFullYear(),
  histMonth   : new Date().getMonth() + 1,
};

/* ── Helpers ──────────────────────────────────────────────── */
function todayISO() {
  return new Date().toLocaleDateString('sv-SE');
}

function formatRp(n) {
  const num = parseFloat(n) || 0;
  return 'Rp ' + num.toLocaleString('id-ID', { minimumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

/* ── Toast ────────────────────────────────────────────────── */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fas fa-${type === 'success' ? 'circle-check' : 'circle-xmark'} toast-icon"></i><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ── Clock ────────────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  document.getElementById('sidebarClock').textContent =
    now.toLocaleString('id-ID', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

/* ── Navigation ───────────────────────────────────────────── */
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    switchSection(link.dataset.section);
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  });
});

const backdrop = document.getElementById('sidebarBackdrop');

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  backdrop.classList.toggle('show');
});

backdrop?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  backdrop.classList.remove('show');
});

function switchSection(name) {
  document.querySelectorAll('.section').forEach(s => { s.classList.remove('active'); s.classList.add('hidden'); });
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const section = document.getElementById(`section-${name}`);
  if (section) { section.classList.remove('hidden'); section.classList.add('active'); }

  const link = document.querySelector(`.nav-link[data-section="${name}"]`);
  if (link) link.classList.add('active');

  state.section = name;
  loadSection(name);
}

function loadSection(name) {
  switch (name) {
    case 'dashboard':  loadDashboard(); break;
    case 'income':     loadIncome(); break;
    case 'expenses':   loadExpenses(); break;
    case 'unexpected': loadUnexpected(); break;
    case 'debts':      loadDebts(); break;
    case 'history':    loadHistory(); break;
    case 'reports':    initReports(); break;
  }
}

/* ── Date Navigation ──────────────────────────────────────── */
const datePicker = document.getElementById('datePicker');
datePicker.value = state.date;
updateDateDisplay();

datePicker.addEventListener('change', () => {
  state.date = datePicker.value;
  updateDateDisplay();
  loadSection(state.section);
});

document.getElementById('prevDay').addEventListener('click', () => {
  const d = new Date(state.date + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  state.date = d.toLocaleDateString('sv-SE');
  datePicker.value = state.date;
  updateDateDisplay();
  loadSection(state.section);
});

document.getElementById('nextDay').addEventListener('click', () => {
  const d = new Date(state.date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  state.date = d.toLocaleDateString('sv-SE');
  datePicker.value = state.date;
  updateDateDisplay();
  loadSection(state.section);
});

document.getElementById('todayBtn').addEventListener('click', () => {
  state.date = todayISO();
  datePicker.value = state.date;
  updateDateDisplay();
  loadSection(state.section);
});

function updateDateDisplay() {
  document.getElementById('dateDisplay').textContent = formatDate(state.date);
  const el = document.getElementById('dashDateLabel');
  if (el) el.textContent = formatDate(state.date);
}

/* ── Dashboard ────────────────────────────────────────────── */
async function loadDashboard() {
  document.getElementById('dashDateLabel').textContent = formatDate(state.date);
  try {
    const s = await api('GET', `/api/summary/${state.date}`);
    renderSummaryCards(s);
    const [inc, exp, unx] = await Promise.all([
      api('GET', `/api/income/${state.date}`),
      api('GET', `/api/expenses/${state.date}`),
      api('GET', `/api/unexpected/${state.date}`),
    ]);
    renderDashMini('dashIncomeTable', inc, 'income');
    renderDashMini('dashExpenseTable', exp, 'expense');
    renderDashMini('dashUnexpectedTable', unx, 'expense');
  } catch (e) { toast(e.message, 'error'); }
}

function renderSummaryCards(s) {
  const isToday = s.date === todayISO();
  document.getElementById('summaryCards').innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-label">Total Pemasukan</span>
        <div class="card-icon" style="background:var(--success-light);color:var(--success)"><i class="fas fa-arrow-trend-up"></i></div>
      </div>
      <div class="card-value" style="color:var(--success)">${formatRp(s.totalIncome)}</div>
      <div class="card-note">Pendapatan hari ini</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-label">Pengeluaran</span>
        <div class="card-icon" style="background:var(--danger-light);color:var(--danger)"><i class="fas fa-arrow-trend-down"></i></div>
      </div>
      <div class="card-value" style="color:var(--danger)">${formatRp(s.totalExpenses)}</div>
      <div class="card-note">Pengeluaran rutin</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-label">Tidak Terduga</span>
        <div class="card-icon" style="background:var(--warning-light);color:var(--warning)"><i class="fas fa-triangle-exclamation"></i></div>
      </div>
      <div class="card-value" style="color:var(--warning)">${formatRp(s.totalUnexpected)}</div>
      <div class="card-note">Pengeluaran mendadak</div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-label">Hutang Karyawan</span>
        <div class="card-icon" style="background:var(--purple-light);color:var(--purple)"><i class="fas fa-hand-holding-dollar"></i></div>
      </div>
      <div class="card-value" style="color:var(--purple)">${formatRp(s.totalDebts)}</div>
      <div class="card-note">Total belum lunas</div>
    </div>
    <div class="card card-net">
      <div class="card-header">
        <span class="card-label">Pendapatan Bersih</span>
        <div class="card-icon"><i class="fas fa-wallet"></i></div>
      </div>
      <div class="card-value">${formatRp(s.netIncome)}</div>
      <div class="card-note">Pemasukan - semua pengeluaran</div>
    </div>
  `;
}

function renderDashMini(containerId, rows, type) {
  const el = document.getElementById(containerId);
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Belum ada data</p></div>';
    return;
  }
  const shown = rows.slice(0, 5);
  el.innerHTML = `<table>
    <tbody>
      ${shown.map(r => `
        <tr>
          <td class="time-cell">${formatTime(r.created_at)}</td>
          <td>${r.description}</td>
          <td class="amount-cell" style="color:${type === 'income' ? 'var(--success)' : 'var(--danger)'};text-align:right">${formatRp(r.amount)}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

/* ── Income ───────────────────────────────────────────────── */
async function loadIncome() {
  document.getElementById('incomeLabel').textContent = formatDate(state.date);
  try {
    const rows = await api('GET', `/api/income/${state.date}`);
    const total = rows.reduce((s, r) => s + +r.amount, 0);
    document.getElementById('incomeTotal').innerHTML = `<span style="color:var(--success)">${formatRp(total)}</span>`;
    const wrap = document.getElementById('incomeTableWrap');
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Belum ada data pemasukan untuk tanggal ini</p></div>';
      return;
    }
    wrap.innerHTML = `<table>
      <thead><tr>
        <th>Waktu</th><th>Kategori</th><th>Keterangan</th><th>Jumlah</th><th>Aksi</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="time-cell">${formatTime(r.created_at)}</td>
            <td><span class="badge" style="background:var(--success-light);color:var(--success)">${r.category}</span></td>
            <td>${r.description}</td>
            <td class="amount-cell" style="color:var(--success)">${formatRp(r.amount)}</td>
            <td class="actions-cell">
              <button class="action-btn action-btn-delete" onclick="deleteRecord('income',${r.id})" title="Hapus">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Expenses ──────────────────────────────────────────────── */
async function loadExpenses() {
  document.getElementById('expensesLabel').textContent = formatDate(state.date);
  try {
    const rows = await api('GET', `/api/expenses/${state.date}`);
    const total = rows.reduce((s, r) => s + +r.amount, 0);
    document.getElementById('expensesTotal').innerHTML = `<span style="color:var(--danger)">${formatRp(total)}</span>`;
    const wrap = document.getElementById('expensesTableWrap');
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Belum ada data pengeluaran untuk tanggal ini</p></div>';
      return;
    }
    wrap.innerHTML = `<table>
      <thead><tr><th>Waktu</th><th>Keterangan</th><th>Jumlah</th><th>Aksi</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="time-cell">${formatTime(r.created_at)}</td>
            <td>${r.description}</td>
            <td class="amount-cell" style="color:var(--danger)">${formatRp(r.amount)}</td>
            <td class="actions-cell">
              <button class="action-btn action-btn-delete" onclick="deleteRecord('expenses',${r.id})" title="Hapus">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Unexpected ────────────────────────────────────────────── */
async function loadUnexpected() {
  document.getElementById('unexpectedLabel').textContent = formatDate(state.date);
  try {
    const rows = await api('GET', `/api/unexpected/${state.date}`);
    const total = rows.reduce((s, r) => s + +r.amount, 0);
    document.getElementById('unexpectedTotal').innerHTML = `<span style="color:var(--warning)">${formatRp(total)}</span>`;
    const wrap = document.getElementById('unexpectedTableWrap');
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Belum ada pengeluaran tak terduga untuk tanggal ini</p></div>';
      return;
    }
    wrap.innerHTML = `<table>
      <thead><tr><th>Waktu</th><th>Keterangan</th><th>Jumlah</th><th>Aksi</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="time-cell">${formatTime(r.created_at)}</td>
            <td>${r.description}</td>
            <td class="amount-cell" style="color:var(--warning)">${formatRp(r.amount)}</td>
            <td class="actions-cell">
              <button class="action-btn action-btn-delete" onclick="deleteRecord('unexpected',${r.id})" title="Hapus">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Debts ─────────────────────────────────────────────────── */
async function loadDebts() {
  try {
    const rows = await api('GET', `/api/debts?status=${state.debtFilter}`);
    const unpaid = rows.filter(r => r.status === 'belum lunas').reduce((s, r) => s + +r.amount, 0);
    document.getElementById('debtsTotal').innerHTML =
      `<span style="color:var(--danger)">Belum lunas: ${formatRp(unpaid)}</span>`;
    const wrap = document.getElementById('debtsTableWrap');
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Tidak ada data hutang</p></div>';
      return;
    }
    wrap.innerHTML = `<table>
      <thead><tr>
        <th>Tanggal</th><th>Nama Karyawan</th><th>Keterangan</th>
        <th>Jumlah</th><th>Status</th><th>Tgl Lunas</th><th>Aksi</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="time-cell">${r.debt_date}</td>
            <td><strong>${r.employee_name}</strong></td>
            <td>${r.description || '-'}</td>
            <td class="amount-cell" style="color:var(--purple)">${formatRp(r.amount)}</td>
            <td><span class="badge badge-${r.status === 'lunas' ? 'lunas' : 'belum'}">${r.status}</span></td>
            <td class="time-cell">${r.paid_date || '-'}</td>
            <td class="actions-cell">
              ${r.status === 'belum lunas' ? `
                <button class="action-btn action-btn-pay" onclick="payDebt(${r.id})" title="Tandai Lunas">
                  <i class="fas fa-check"></i>
                </button>` : ''}
              <button class="action-btn action-btn-delete" onclick="deleteRecord('debts',${r.id})" title="Hapus">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  } catch (e) { toast(e.message, 'error'); }
}

document.getElementById('debtFilter').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('#debtFilter .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.debtFilter = btn.dataset.filter;
  loadDebts();
});

async function payDebt(id) {
  if (!confirm('Tandai hutang ini sebagai lunas?')) return;
  try {
    await api('PUT', `/api/debts/${id}/pay`);
    toast('Hutang berhasil ditandai lunas');
    loadDebts();
  } catch (e) { toast(e.message, 'error'); }
}

/* ── History ──────────────────────────────────────────────── */
const MONTHS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function loadHistory() {
  updateHistLabel();
  fetchHistory();
}

function updateHistLabel() {
  document.getElementById('histMonthLabel').textContent =
    `${MONTHS_ID[state.histMonth - 1]} ${state.histYear}`;
}

document.getElementById('histPrevMonth').addEventListener('click', () => {
  state.histMonth--;
  if (state.histMonth < 1) { state.histMonth = 12; state.histYear--; }
  updateHistLabel();
  fetchHistory();
});
document.getElementById('histNextMonth').addEventListener('click', () => {
  state.histMonth++;
  if (state.histMonth > 12) { state.histMonth = 1; state.histYear++; }
  updateHistLabel();
  fetchHistory();
});

async function fetchHistory() {
  const el = document.getElementById('historyContent');
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Memuat riwayat...</div>';
  try {
    const data = await api('GET', `/api/history/${state.histYear}/${String(state.histMonth).padStart(2,'0')}`);
    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-xmark"></i><p>Tidak ada data untuk bulan ini</p></div>';
      return;
    }
    const totals = data.reduce((acc, r) => ({
      income: acc.income + r.income,
      expenses: acc.expenses + r.expenses,
      unexpected: acc.unexpected + r.unexpected,
      net: acc.net + r.net,
    }), { income: 0, expenses: 0, unexpected: 0, net: 0 });

    el.innerHTML = `
      <div class="history-table-wrap">
        <div class="hist-row header">
          <div>Tanggal</div><div>Pemasukan</div><div>Pengeluaran</div>
          <div>Tak Terduga</div><div>Bersih</div><div>Aksi</div>
        </div>
        ${data.map(r => `
          <div class="hist-row">
            <div class="hist-date" onclick="jumpToDate('${r.date}')">${r.date}</div>
            <div class="hist-income">${formatRp(r.income)}</div>
            <div class="hist-expense">${formatRp(r.expenses)}</div>
            <div class="hist-unexpected">${formatRp(r.unexpected)}</div>
            <div class="hist-net ${r.net >= 0 ? 'positive' : 'negative'}">${formatRp(r.net)}</div>
            <div>
              <button class="btn btn-outline" style="padding:5px 12px;font-size:12px" onclick="jumpToDate('${r.date}')">
                <i class="fas fa-eye"></i> Lihat
              </button>
            </div>
          </div>`).join('')}
        <div class="hist-row" style="background:#f8fafc;font-weight:700">
          <div>TOTAL</div>
          <div class="hist-income">${formatRp(totals.income)}</div>
          <div class="hist-expense">${formatRp(totals.expenses)}</div>
          <div class="hist-unexpected">${formatRp(totals.unexpected)}</div>
          <div class="hist-net ${totals.net >= 0 ? 'positive' : 'negative'}">${formatRp(totals.net)}</div>
          <div></div>
        </div>
      </div>`;
  } catch (e) { toast(e.message, 'error'); }
}

function jumpToDate(date) {
  state.date = date;
  datePicker.value = date;
  updateDateDisplay();
  switchSection('dashboard');
}

/* ── Reports ────────────────────────────────────────────────── */
function initReports() {
  document.getElementById('exportDailyDate').value = state.date;
  const now = new Date();
  document.getElementById('exportMonth').value = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('exportYear').value  = now.getFullYear();
}

function exportDaily() {
  const date = document.getElementById('exportDailyDate').value;
  if (!date) return toast('Pilih tanggal terlebih dahulu', 'error');
  window.location.href = `/api/export/daily/${date}`;
}

function exportMonthly() {
  const month = document.getElementById('exportMonth').value;
  const year  = document.getElementById('exportYear').value;
  window.location.href = `/api/export/monthly/${year}/${month}`;
}

/* ── Modal ──────────────────────────────────────────────────── */
const MODAL_CONFIG = {
  income: {
    title : 'Tambah Pemasukan',
    icon  : 'fas fa-arrow-trend-up',
    color : 'var(--success)',
    html  : () => `
      <div class="form-group">
        <label>KATEGORI</label>
        <select id="fCategory" class="form-input">
          <option>Penjualan Air Isi Ulang</option>
          <option>Penjualan Galon</option>
          <option>Penjualan Tutup/Seal</option>
          <option>Ongkos Antar</option>
          <option>Lainnya</option>
        </select>
      </div>
      <div class="form-group">
        <label>KETERANGAN</label>
        <input type="text" id="fDesc" class="form-input" placeholder="Contoh: 20 galon isi ulang">
      </div>
      <div class="form-group">
        <label>JUMLAH (Rp)</label>
        <input type="number" id="fAmount" class="form-input" placeholder="0" min="0">
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeModal()">Batal</button>
        <button class="btn btn-success" onclick="submitIncome()"><i class="fas fa-check"></i> Simpan</button>
      </div>`,
  },
  expenses: {
    title : 'Tambah Pengeluaran',
    icon  : 'fas fa-arrow-trend-down',
    color : 'var(--danger)',
    html  : () => `
      <div class="form-group">
        <label>KETERANGAN</label>
        <input type="text" id="fDesc" class="form-input" placeholder="Contoh: Beli galon kosong">
      </div>
      <div class="form-group">
        <label>JUMLAH (Rp)</label>
        <input type="number" id="fAmount" class="form-input" placeholder="0" min="0">
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeModal()">Batal</button>
        <button class="btn btn-danger" onclick="submitExpenses()"><i class="fas fa-check"></i> Simpan</button>
      </div>`,
  },
  unexpected: {
    title : 'Pengeluaran Tak Terduga',
    icon  : 'fas fa-triangle-exclamation',
    color : 'var(--warning)',
    html  : () => `
      <div class="form-group">
        <label>KETERANGAN</label>
        <input type="text" id="fDesc" class="form-input" placeholder="Contoh: Servis pompa air mendadak">
      </div>
      <div class="form-group">
        <label>JUMLAH (Rp)</label>
        <input type="number" id="fAmount" class="form-input" placeholder="0" min="0">
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeModal()">Batal</button>
        <button class="btn btn-warning" onclick="submitUnexpected()"><i class="fas fa-check"></i> Simpan</button>
      </div>`,
  },
  debts: {
    title : 'Tambah Hutang Karyawan',
    icon  : 'fas fa-hand-holding-dollar',
    color : 'var(--purple)',
    html  : () => `
      <div class="form-group">
        <label>NAMA KARYAWAN</label>
        <input type="text" id="fEmployee" class="form-input" placeholder="Nama karyawan">
      </div>
      <div class="form-group">
        <label>KETERANGAN (opsional)</label>
        <input type="text" id="fDesc" class="form-input" placeholder="Contoh: Pinjaman bulan ini">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>JUMLAH (Rp)</label>
          <input type="number" id="fAmount" class="form-input" placeholder="0" min="0">
        </div>
        <div class="form-group">
          <label>TANGGAL</label>
          <input type="date" id="fDate" class="form-input" value="${state.date}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeModal()">Batal</button>
        <button class="btn btn-purple" onclick="submitDebts()"><i class="fas fa-check"></i> Simpan</button>
      </div>`,
  },
};

function openModal(type) {
  const cfg = MODAL_CONFIG[type];
  document.getElementById('modalIcon').className    = cfg.icon;
  document.getElementById('modalIcon').style.color  = cfg.color;
  document.getElementById('modalTitleText').textContent = cfg.title;
  document.getElementById('modalBody').innerHTML    = cfg.html();
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
  const first = document.querySelector('#modalBody input, #modalBody select');
  if (first) setTimeout(() => first.focus(), 100);
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modalOverlay').classList.add('hidden');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ── Submit handlers ─────────────────────────────────────── */
async function submitIncome() {
  const desc   = document.getElementById('fDesc').value.trim();
  const amount = document.getElementById('fAmount').value;
  const cat    = document.getElementById('fCategory').value;
  if (!desc || !amount) return toast('Keterangan dan jumlah wajib diisi', 'error');
  try {
    await api('POST', '/api/income', { description: desc, amount: +amount, category: cat, record_date: state.date });
    toast('Pemasukan berhasil ditambahkan');
    closeModal();
    loadIncome();
    if (state.section === 'dashboard') loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

async function submitExpenses() {
  const desc   = document.getElementById('fDesc').value.trim();
  const amount = document.getElementById('fAmount').value;
  if (!desc || !amount) return toast('Keterangan dan jumlah wajib diisi', 'error');
  try {
    await api('POST', '/api/expenses', { description: desc, amount: +amount, record_date: state.date });
    toast('Pengeluaran berhasil ditambahkan');
    closeModal();
    loadExpenses();
  } catch (e) { toast(e.message, 'error'); }
}

async function submitUnexpected() {
  const desc   = document.getElementById('fDesc').value.trim();
  const amount = document.getElementById('fAmount').value;
  if (!desc || !amount) return toast('Keterangan dan jumlah wajib diisi', 'error');
  try {
    await api('POST', '/api/unexpected', { description: desc, amount: +amount, record_date: state.date });
    toast('Pengeluaran tak terduga berhasil ditambahkan');
    closeModal();
    loadUnexpected();
  } catch (e) { toast(e.message, 'error'); }
}

async function submitDebts() {
  const employee = document.getElementById('fEmployee').value.trim();
  const desc     = document.getElementById('fDesc').value.trim();
  const amount   = document.getElementById('fAmount').value;
  const date     = document.getElementById('fDate').value;
  if (!employee || !amount) return toast('Nama karyawan dan jumlah wajib diisi', 'error');
  try {
    await api('POST', '/api/debts', { employee_name: employee, description: desc, amount: +amount, debt_date: date || state.date });
    toast('Data hutang berhasil ditambahkan');
    closeModal();
    loadDebts();
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Delete ─────────────────────────────────────────────────── */
const ENDPOINT_MAP = {
  income: '/api/income', expenses: '/api/expenses',
  unexpected: '/api/unexpected', debts: '/api/debts',
};

async function deleteRecord(type, id) {
  if (!confirm('Hapus data ini?')) return;
  try {
    await api('DELETE', `${ENDPOINT_MAP[type]}/${id}`);
    toast('Data berhasil dihapus');
    loadSection(state.section);
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Init ───────────────────────────────────────────────────── */
loadDashboard();
