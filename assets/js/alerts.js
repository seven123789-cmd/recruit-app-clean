let ALERT_ROWS = [];
let ALERT_FILTERED = [];
async function initAlerts() {
  APP.initHeader();
  ALERT_ROWS = await APP.loadAlertRows();
  fillAlertFilters();
  bindAlertFilters();
  renderAlertStats();
  renderAlerts();
}
function fillAlertFilters() {
  const centers = [...new Set(ALERT_ROWS.map(r => r.center).filter(Boolean))].sort();
  const licenses = [...new Set(ALERT_ROWS.map(r => r.license_name).filter(Boolean))].sort();
  document.getElementById('filter-center').innerHTML = '<option value="">全センター</option>' + centers.map(v => `<option>${APP.escape(v)}</option>`).join('');
  document.getElementById('filter-license').innerHTML = '<option value="">全資格</option>' + licenses.map(v => `<option>${APP.escape(v)}</option>`).join('');
}
function bindAlertFilters() { ['filter-keyword','filter-center','filter-license','filter-status'].forEach(id => { const el = document.getElementById(id); if (el) el.oninput = renderAlerts; }); }
function renderAlertStats() {
  const statuses = ALERT_ROWS.map(r => APP.normStatus(r.alert_status, r.expiration_date));
  [['alert-total', ALERT_ROWS.length], ['alert-expired', statuses.filter(s => s === '期限切れ').length], ['alert-30', statuses.filter(s => s === '30日以内').length], ['alert-90', statuses.filter(s => s === '90日以内').length]].forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.textContent = v; });
}
function renderAlerts() {
  const kw = (document.getElementById('filter-keyword')?.value || '').trim();
  const center = document.getElementById('filter-center')?.value || '';
  const license = document.getElementById('filter-license')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  ALERT_FILTERED = ALERT_ROWS.filter(r => { const st = APP.normStatus(r.alert_status, r.expiration_date); return (!kw || [r.employee_name, r.employee_code, r.license_name].join(' ').includes(kw)) && (!center || r.center === center) && (!license || r.license_name === license) && (!status || st === status); });
  const cnt = document.getElementById('alert-count'); if (cnt) cnt.textContent = ALERT_FILTERED.length;
  const tbody = document.getElementById('alert-tbody'); if (!tbody) return;
  tbody.innerHTML = ALERT_FILTERED.length ? ALERT_FILTERED.map(r => { const st = APP.normStatus(r.alert_status, r.expiration_date); const days = r.days_remaining ?? APP.daysUntil(r.expiration_date); return `<tr><td>${APP.alertBadge(st, r.expiration_date)}</td><td><div class="cell-main">${APP.escape(r.employee_name || '')}</div><div class="cell-sub">${APP.escape(r.employee_code || '')}｜${APP.escape(r.center || '')}</div></td><td>${APP.escape(r.license_name || '')}</td><td>${APP.escape(r.category_name || '')}</td><td>${APP.fmtDate(r.expiration_date)}</td><td>${days === null ? '—' : (days < 0 ? `${Math.abs(days)}日超過` : `残り${days}日`)}</td></tr>`; }).join('') : `<tr><td colspan="6" class="empty">対象のアラートはありません</td></tr>`;
}
function exportAlertCSV(){ const header=['status','employee_code','employee_name','center','license_name','expiration_date','days_remaining']; const csv=header.join(',')+'\n'+ALERT_FILTERED.map(r=>header.map(k=>`"${String(k==='status'?APP.normStatus(r.alert_status,r.expiration_date):(r[k]??'')).replace(/"/g,'""')}"`).join(',')).join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='license_alerts.csv'; a.click(); URL.revokeObjectURL(a.href); }
window.initAlerts=initAlerts; window.exportAlertCSV=exportAlertCSV;
