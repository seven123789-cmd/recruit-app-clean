let MASTER_DATA = null;
let ACTIVE_MASTER = 'centers';
async function initMasters() {
  APP.initHeader();
  MASTER_DATA = await APP.loadMasters();
  bindTabs();
  renderMasterStats();
  renderMasterTable();
}
function bindTabs() { document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => { document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); ACTIVE_MASTER = btn.dataset.master; renderMasterTable(); }); }
function renderMasterStats() { [['master-centers', MASTER_DATA.centers.length], ['master-positions', MASTER_DATA.positions.length], ['master-categories', MASTER_DATA.categories.length], ['master-licenses', MASTER_DATA.licenses.length]].forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.textContent = v; }); }
function renderMasterTable() {
  const title = document.getElementById('master-title');
  const tbody = document.getElementById('master-tbody');
  const thead = document.getElementById('master-head');
  if (!tbody || !thead) return;
  const defs = {
    centers: { title:'センターマスタ', head:['センター名','本部','有効'], rows: MASTER_DATA.centers.map(r => [r.center_name, r.division_name, r.enabled]) },
    divisions: { title:'本部マスタ', head:['本部名','有効'], rows: MASTER_DATA.divisions.map(r => [r.division_name, r.enabled]) },
    positions: { title:'職種マスタ', head:['職種名','有効'], rows: MASTER_DATA.positions.map(r => [r.position_name, r.enabled]) },
    categories: { title:'資格区分マスタ', head:['区分名','並び順','有効'], rows: MASTER_DATA.categories.map(r => [r.category_name, r.sort_order ?? '', r.enabled]) },
    licenses: { title:'資格マスタ', head:['資格名','区分','期限管理','アラート日数','有効'], rows: MASTER_DATA.licenses.map(r => [r.license_name, r.category_name, r.need_expiration ? '必要' : '不要', r.alert_days ?? 90, r.enabled]) }
  };
  const def = defs[ACTIVE_MASTER];
  if (title) title.textContent = def.title;
  thead.innerHTML = `<tr>${def.head.map(h => `<th>${APP.escape(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = def.rows.length ? def.rows.map(row => `<tr>${row.map(v => `<td>${typeof v === 'boolean' ? (v ? APP.badge('有効','success') : APP.badge('無効','gray')) : APP.escape(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${def.head.length}" class="empty">データがありません</td></tr>`;
}
window.initMasters=initMasters;
