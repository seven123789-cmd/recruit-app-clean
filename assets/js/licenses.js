let LIC_EMPLOYEES = [];
let LIC_MASTER = [];
let LIC_ROWS = [];
let LIC_FILTERED = [];
let licPage = 1;
const licPerPage = 20;
async function initLicenses() {
  APP.initHeader();
  [LIC_EMPLOYEES, LIC_MASTER, LIC_ROWS] = await Promise.all([APP.loadEmployees(), APP.loadLicenseMaster(), APP.loadLicenseRows()]);
  fillLicenseSelects();
  bindLicenseFilters();
  renderLicenseStats();
  renderLicenseRows();
}
function fillLicenseSelects() {
  fillSelect('license-employee', LIC_EMPLOYEES.map(e => ({ value: e.id, label: `${e.employee_code || ''} ${e.name || ''}｜${e.center || ''}` })), '社員を選択');
  fillSelect('license-master', LIC_MASTER.filter(l => l.enabled !== false).map(l => ({ value: l.id, label: `${l.license_name}｜${l.category_name || ''}` })), '資格を選択');
  fillSelect('filter-license', [...new Set(LIC_MASTER.map(l => l.license_name).filter(Boolean))].sort().map(v => ({value:v,label:v})), '全資格');
  fillSelect('filter-center', [...new Set(LIC_EMPLOYEES.map(e => e.center).filter(Boolean))].sort().map(v => ({value:v,label:v})), '全センター');
}
function fillSelect(id, items, first) { const el = document.getElementById(id); if (!el) return; el.innerHTML = `<option value="">${first}</option>` + items.map(i => `<option value="${APP.escape(i.value)}">${APP.escape(i.label)}</option>`).join(''); }
function bindLicenseFilters() {
  ['filter-keyword','filter-license','filter-center','filter-status'].forEach(id => { const el = document.getElementById(id); if (el) el.oninput = () => { licPage = 1; renderLicenseRows(); }; });
  const clear = document.getElementById('btn-clear-filter'); if (clear) clear.onclick = () => { document.querySelectorAll('.filter-panel input,.filter-panel select').forEach(e => e.value = ''); licPage = 1; renderLicenseRows(); };
  const form = document.getElementById('license-form'); if (form) form.onsubmit = saveEmployeeLicense;
}
function renderLicenseStats() {
  const statuses = LIC_ROWS.map(r => APP.normStatus(r.alert_status, r.expiration_date));
  const pairs = [['lic-total', LIC_ROWS.length], ['lic-expired', statuses.filter(s => s === '期限切れ').length], ['lic-30', statuses.filter(s => s === '30日以内').length], ['lic-90', statuses.filter(s => s === '90日以内').length]];
  pairs.forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.textContent = v; });
}
function renderLicenseRows() {
  const kw = (document.getElementById('filter-keyword')?.value || '').trim();
  const license = document.getElementById('filter-license')?.value || '';
  const center = document.getElementById('filter-center')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  LIC_FILTERED = LIC_ROWS.filter(r => {
    const st = APP.normStatus(r.alert_status, r.expiration_date);
    return (!kw || [r.employee_code, r.employee_name, r.license_name, r.center].join(' ').includes(kw)) && (!license || r.license_name === license) && (!center || r.center === center) && (!status || st === status);
  });
  const cnt = document.getElementById('license-count'); if (cnt) cnt.textContent = LIC_FILTERED.length;
  const tbody = document.getElementById('license-tbody'); if (!tbody) return;
  const start = (licPage - 1) * licPerPage;
  const rows = LIC_FILTERED.slice(start, start + licPerPage);
  tbody.innerHTML = rows.length ? rows.map(r => {
    const st = APP.normStatus(r.alert_status, r.expiration_date);
    const days = APP.daysUntil(r.expiration_date);
    return `<tr><td><div class="name-cell"><div class="mini-avatar">${APP.escape((r.employee_name || '?')[0])}</div><div><div class="cell-main">${APP.escape(r.employee_name || '')}</div><div class="cell-sub">${APP.escape(r.employee_code || '')}｜${APP.escape(r.center || '')}</div></div></div></td><td><div class="cell-main">${APP.escape(r.license_name || '')}</div><div class="cell-sub">${APP.escape(r.category_name || '')}</div></td><td>${APP.fmtDate(r.acquired_date)}</td><td>${APP.fmtDate(r.renewal_date)}</td><td>${APP.fmtDate(r.expiration_date)}</td><td>${APP.alertBadge(st, r.expiration_date)}</td><td>${days === null ? '—' : (days < 0 ? `${Math.abs(days)}日超過` : `残り${days}日`)}</td><td>${APP.escape(r.memo || '')}</td></tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">登録済み資格がありません</td></tr>`;
  renderLicPager();
}
function renderLicPager() {
  const p = document.getElementById('license-pagination'); if (!p) return;
  const pages = Math.max(1, Math.ceil(LIC_FILTERED.length / licPerPage));
  p.innerHTML = `<div class="row-meta">${LIC_FILTERED.length}件中 ${LIC_FILTERED.length ? ((licPage - 1) * licPerPage + 1) : 0}〜${Math.min(licPage * licPerPage, LIC_FILTERED.length)}件表示</div><div style="display:flex;gap:6px"><button class="page-btn" ${licPage <= 1 ? 'disabled' : ''} onclick="licPage--;renderLicenseRows()">‹</button>${Array.from({length: pages}, (_, i) => `<button class="page-btn ${i + 1 === licPage ? 'active' : ''}" onclick="licPage=${i + 1};renderLicenseRows()">${i + 1}</button>`).join('')}<button class="page-btn" ${licPage >= pages ? 'disabled' : ''} onclick="licPage++;renderLicenseRows()">›</button></div>`;
}
async function saveEmployeeLicense(ev) {
  ev.preventDefault();
  const payload = { employee_id: document.getElementById('license-employee').value, license_id: document.getElementById('license-master').value, acquired_date: valueOrNull('license-acquired'), renewal_date: valueOrNull('license-renewal'), expiration_date: valueOrNull('license-expiration'), memo: document.getElementById('license-memo').value || null };
  if (!payload.employee_id || !payload.license_id) return APP.toast('社員と資格を選択してください', 'warning');
  const res = await APP.saveEmployeeLicense(payload);
  if (res.error) return APP.toast(res.error.message || '保存できませんでした', 'error');
  APP.toast('資格を登録しました');
  document.getElementById('license-form').reset();
  LIC_ROWS = await APP.loadLicenseRows();
  renderLicenseStats();
  renderLicenseRows();
}
function valueOrNull(id) { return document.getElementById(id)?.value || null; }
window.initLicenses = initLicenses; window.renderLicenseRows = renderLicenseRows;
