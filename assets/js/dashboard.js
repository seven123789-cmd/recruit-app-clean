async function initDashboard() {
  APP.initHeader();
  const [employees, alerts, licenses] = await Promise.all([
    APP.loadEmployees(),
    APP.loadAlertRows(),
    APP.loadLicenseRows()
  ]);
  const expired = alerts.filter(r => APP.normStatus(r.alert_status, r.expiration_date) === '期限切れ').length;
  const critical = alerts.filter(r => APP.normStatus(r.alert_status, r.expiration_date) === '30日以内').length;
  const warning = alerts.filter(r => APP.normStatus(r.alert_status, r.expiration_date) === '90日以内').length;
  const promo = employees.filter(e => e.promotion_target_flag === true || e.promotion_target_flag === 'true').length;
  [['stat-expired', expired], ['stat-critical', critical], ['stat-warning', warning], ['stat-promo', promo], ['stat-employees', employees.length]].forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.textContent = v; });

  const alertList = document.getElementById('alert-list');
  if (alertList) {
    const rows = alerts.filter(r => ['期限切れ','30日以内','90日以内'].includes(APP.normStatus(r.alert_status, r.expiration_date))).slice(0, 8);
    alertList.innerHTML = rows.length ? rows.map(r => {
      const st = APP.normStatus(r.alert_status, r.expiration_date);
      const cls = APP.statusClass(st);
      const days = r.days_remaining ?? APP.daysUntil(r.expiration_date);
      return `<div class="alert-row"><div class="alert-mark ${cls}">${cls === 'danger' ? '!' : cls === 'warning' ? '30' : '90'}</div><div><div class="row-title">${APP.escape(r.employee_name)}｜${APP.escape(r.license_name)}</div><div class="row-meta">${APP.escape(r.center || '')}　期限：${APP.fmtDate(r.expiration_date)}</div></div><div>${APP.badge(days < 0 ? `${Math.abs(days)}日超過` : `残り${days}日`, cls)}</div></div>`;
    }).join('') : `<div class="empty">期限アラートはありません</div>`;
  }

  const promoList = document.getElementById('promo-list');
  if (promoList) {
    const rows = employees.filter(e => e.promotion_target_flag === true || e.promotion_target_flag === 'true').slice(0, 8);
    promoList.innerHTML = rows.length ? rows.map(e => `<div class="person-row"><div class="mini-avatar">${APP.escape((e.name || '?')[0])}</div><div><div class="row-title">${APP.escape(e.name)}</div><div class="row-meta">${APP.escape(e.center || '')}｜${APP.escape(e.current_grade || '等級未設定')}｜${APP.escape(e.position || '')}</div></div><a class="btn btn-sm btn-secondary" href="employees.html">確認</a></div>`).join('') : `<div class="empty">昇格候補はありません</div>`;
  }

  renderCoverage(employees, licenses);
  renderMonthly(alerts);
}
function renderCoverage(employees, licenses) {
  const el = document.getElementById('coverage-list');
  if (!el) return;
  const byCenter = new Map();
  employees.forEach(e => byCenter.set(e.center || '未設定', { total: (byCenter.get(e.center || '未設定')?.total || 0), holders: 0 }));
  licenses.forEach(r => {
    const key = r.center || '未設定';
    const v = byCenter.get(key) || { total: employees.filter(e => (e.center || '未設定') === key).length, holders: 0 };
    v.holders += 1;
    byCenter.set(key, v);
  });
  const rows = [...byCenter.entries()].map(([center, v]) => [center, Math.min(100, Math.round((v.holders / Math.max(1, v.total)) * 100))]).slice(0, 8);
  el.innerHTML = `<div class="bars">${rows.map(r => `<div class="bar-row"><div class="bar-head"><span>${APP.escape(r[0])}</span><span>${r[1]}%</span></div><div class="bar"><span style="width:${r[1]}%"></span></div></div>`).join('')}</div>`;
}
function renderMonthly(alerts) {
  const el = document.getElementById('monthly-bars');
  if (!el) return;
  const counts = {};
  alerts.filter(r => r.expiration_date).forEach(r => {
    const d = new Date(r.expiration_date);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  const rows = Object.entries(counts).sort().slice(0, 8);
  const max = Math.max(1, ...rows.map(r => r[1]));
  el.innerHTML = rows.length ? `<div class="bars">${rows.map(r => `<div class="bar-row"><div class="bar-head"><span>${APP.escape(r[0])}</span><span>${r[1]}件</span></div><div class="bar"><span style="width:${Math.max(5, r[1] / max * 100)}%"></span></div></div>`).join('')}</div>` : `<div class="empty">期限到来予定はありません</div>`;
}
window.initDashboard = initDashboard;
