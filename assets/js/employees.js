let EMP_ROWS = [];
let EMP_FILTERED = [];
let empPage = 1;
const empPerPage = 20;
async function initEmployees() {
  APP.initHeader();
  EMP_ROWS = await APP.loadEmployees();
  fillEmployeeFilters();
  bindEmployeeFilters();
  renderEmployees();
}
function fillEmployeeFilters() {
  const centers = [...new Set(EMP_ROWS.map(e => e.center).filter(Boolean))].sort((a,b)=>Number(a)-Number(b)||a.localeCompare(b));
  const positions = [...new Set(EMP_ROWS.map(e => e.position).filter(Boolean))].sort();
  const empTypes = [...new Set(EMP_ROWS.map(e => e.employment_type).filter(Boolean))].sort();
  fillSelect('filter-center', centers, '全センター');
  fillSelect('form-center', centers, '選択');
  fillSelect('filter-position', positions, '全職種');
  fillSelect('form-position', positions, '選択');
  fillSelect('filter-employment', empTypes, 'すべて');
}
function fillSelect(id, values, first) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = `<option value="">${first}</option>` + values.map(v => `<option value="${APP.escape(v)}">${APP.escape(v)}</option>`).join('');
}
function bindEmployeeFilters() {
  ['filter-keyword','filter-center','filter-position','filter-employment','filter-promo'].forEach(id => { const el = document.getElementById(id); if (el) el.oninput = () => { empPage = 1; renderEmployees(); }; });
  const clear = document.getElementById('btn-clear-filter');
  if (clear) clear.onclick = () => { document.querySelectorAll('.filter-panel input,.filter-panel select').forEach(e => e.value = ''); empPage = 1; renderEmployees(); };
}
function renderEmployees() {
  const kw = (document.getElementById('filter-keyword')?.value || '').trim();
  const center = document.getElementById('filter-center')?.value || '';
  const position = document.getElementById('filter-position')?.value || '';
  const employment = document.getElementById('filter-employment')?.value || '';
  const promo = document.getElementById('filter-promo')?.value || '';
  EMP_FILTERED = EMP_ROWS.filter(e => (!kw || [e.employee_code, e.name, e.kana, e.center, e.position].join(' ').includes(kw)) && (!center || e.center === center) && (!position || e.position === position) && (!employment || e.employment_type === employment) && (!promo || e.promotion_target_flag === true || e.promotion_target_flag === 'true'));
  const cnt = document.getElementById('emp-count'); if (cnt) cnt.textContent = EMP_FILTERED.length;
  const tbody = document.getElementById('emp-tbody'); if (!tbody) return;
  const start = (empPage - 1) * empPerPage;
  const rows = EMP_FILTERED.slice(start, start + empPerPage);
  tbody.innerHTML = rows.length ? rows.map(e => `<tr><td><strong>${APP.escape(e.employee_code || '')}</strong></td><td><div class="name-cell"><div class="mini-avatar">${APP.escape((e.name || '?')[0])}</div><div><div class="cell-main">${APP.escape(e.name)}</div><div class="cell-sub">${APP.escape(e.kana || '')}</div></div></div></td><td>${APP.escape(e.center || '')}</td><td>${APP.escape(e.position || '')}</td><td>${APP.escape(e.employment_type || '')}</td><td>${APP.badge(e.current_grade || '未設定', 'gray')}</td><td>${(e.promotion_target_flag === true || e.promotion_target_flag === 'true') ? APP.badge('候補', 'primary') : APP.badge('—', 'gray')}</td><td><div class="row-actions"><button class="btn btn-sm btn-secondary" onclick="openEmployeeDetail('${APP.escape(e.id)}')">確認</button></div></td></tr>`).join('') : `<tr><td colspan="8" class="empty">条件に一致する社員がありません</td></tr>`;
  renderEmpPager();
}
function renderEmpPager() {
  const p = document.getElementById('emp-pagination'); if (!p) return;
  const pages = Math.max(1, Math.ceil(EMP_FILTERED.length / empPerPage));
  p.innerHTML = `<div class="row-meta">${EMP_FILTERED.length}件中 ${EMP_FILTERED.length ? ((empPage - 1) * empPerPage + 1) : 0}〜${Math.min(empPage * empPerPage, EMP_FILTERED.length)}件表示</div><div style="display:flex;gap:6px"><button class="page-btn" ${empPage <= 1 ? 'disabled' : ''} onclick="empPage--;renderEmployees()">‹</button>${Array.from({length: pages}, (_, i) => `<button class="page-btn ${i + 1 === empPage ? 'active' : ''}" onclick="empPage=${i + 1};renderEmployees()">${i + 1}</button>`).join('')}<button class="page-btn" ${empPage >= pages ? 'disabled' : ''} onclick="empPage++;renderEmployees()">›</button></div>`;
}
function openEmployeeDetail(id) { const e = EMP_ROWS.find(x => String(x.id) === String(id)); if (!e) return; window.location.href = "employee_detail.html?id=" + encodeURIComponent(e.id); }
function exportEmployeeCSV() { const header = ['employee_code','name','center','position','employment_type','current_grade','promotion_target_flag']; const csv = header.join(',') + '\n' + EMP_FILTERED.map(e => header.map(k => `"${String(e[k] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const blob = new Blob(['\ufeff' + csv], { type:'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'employees_export.csv'; a.click(); URL.revokeObjectURL(a.href); }
window.initEmployees = initEmployees; window.renderEmployees = renderEmployees; window.openEmployeeDetail = openEmployeeDetail; window.exportEmployeeCSV = exportEmployeeCSV;
