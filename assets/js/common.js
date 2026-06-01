const APP = (() => {
  const LS_KEY = 'license_sakuran_v1';
  const today  = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Asia/Tokyo' }).format(d);
  };
  const daysUntil = (v) => {
    if (!v) return null;
    const t = new Date(v); t.setHours(0,0,0,0);
    const n = new Date(); n.setHours(0,0,0,0);
    return Math.round((t - n) / 86400000);
  };
  const normStatus = (status, date) => {
    if (status) return status;
    const d = daysUntil(date);
    if (d === null) return '期限なし';
    if (d < 0)   return '期限切れ';
    if (d <= 30) return '30日以内';
    if (d <= 90) return '90日以内';
    return '正常';
  };
  const statusClass = (s) => {
    const v = String(s || '');
    if (v.includes('期限切れ')) return 'danger';
    if (v.includes('30'))       return 'warning';
    if (v.includes('90'))       return 'info';
    if (v.includes('正常'))     return 'success';
    return 'gray';
  };
  const escape = (v) => String(v ?? '').replace(/[&<>'"]/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const badge = (text, type = 'gray') =>
    `<span class="badge badge-${type}">${escape(text)}</span>`;
  const alertBadge = (status, date) => {
    const s = normStatus(status, date);
    return badge(s, statusClass(s));
  };
  const toast = (message, type = 'success') => {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = { success:'✦', warning:'⚠', error:'✕' }[type] || '◆';
    el.innerHTML = `<span>${icon}</span><span>${escape(message)}</span>`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0'; el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 300);
    }, 3200);
  };
  const client = () => window.getSupabaseClient?.() ?? null;
  const isSupabaseReady = () => !!client();

  const sample = {
    employees:[
      {id:'e1',employee_code:'203',name:'三浦 浩一', center:'北埼玉',division:'家電物流事業部',position:'職員',  employment_type:'正社員',current_grade:'管理職',promotion_target_flag:true, last_promotion_date:'2020-04-01'},
      {id:'e2',employee_code:'204',name:'山田 太郎', center:'戸田',  division:'家電物流事業部',position:'外商員',employment_type:'正社員',current_grade:'3級',  promotion_target_flag:false,last_promotion_date:'2021-07-01'},
      {id:'e3',employee_code:'205',name:'佐藤 花子', center:'さいたま',division:'家電物流事業部',position:'職員', employment_type:'正社員',current_grade:'2級',  promotion_target_flag:false,last_promotion_date:'2023-04-01'},
    ],
    licenses:[
      {id:'l1',license_name:'運行管理者（貨物）',        category_name:'国家資格・免許',need_expiration:false,enabled:true},
      {id:'l2',license_name:'第一種衛生管理者',          category_name:'国家資格・免許',need_expiration:false,enabled:true},
      {id:'l3',license_name:'フォークリフト運転技能講習',category_name:'技能講習',      need_expiration:false,enabled:true},
      {id:'l4',license_name:'テールゲートリフター特別教育',category_name:'特別教育',   need_expiration:false,enabled:true},
    ],
    employeeLicenses:[
      {id:'el1',employee_id:'e1',employee_code:'203',employee_name:'三浦 浩一',center:'北埼玉',position:'職員',  license_id:'l1',license_name:'運行管理者（貨物）',        category_name:'国家資格・免許',acquired_date:'2020-04-01',expiration_date:'2026-07-01',renewal_date:'2025-04-01',alert_status:null,memo:''},
      {id:'el2',employee_id:'e2',employee_code:'204',employee_name:'山田 太郎',center:'戸田',  position:'外商員',license_id:'l4',license_name:'テールゲートリフター特別教育',category_name:'特別教育',      acquired_date:'2024-02-01',expiration_date:'2026-06-20',renewal_date:null,         alert_status:null,memo:''},
    ],
    centers:   [{center_name:'北埼玉'},{center_name:'戸田'},{center_name:'さいたま'}],
    divisions: [{division_name:'家電物流事業部'}],
    positions: [{position_name:'外商員'},{position_name:'職員'},{position_name:'内務員'}],
    categories:[{category_name:'国家資格・免許'},{category_name:'技能講習'},{category_name:'特別教育'},{category_name:'管理者講習・選任前研修'}],
  };
  const getLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || sample; } catch { return sample; } };
  const setLocal = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));

  async function query(table, select='*', opts={}) {
    const sb = client(); if (!sb) return {data:null,error:null,demo:true};
    let q = sb.from(table).select(select);
    if (opts.order) q = q.order(opts.order, {ascending: opts.ascending ?? true});
    if (opts.limit) q = q.limit(opts.limit);
    return {...(await q), demo:false};
  }
  async function insert(table, payload) {
    const sb = client(); if (!sb) return {data:null,error:null,demo:true};
    return await sb.from(table).insert(payload).select();
  }
  // JSONファイルから社員マスタを読み込む（Supabase未接続時のフォールバック）
  let _employeeCache = null;
  async function loadEmployeesFromJson() {
    if (_employeeCache) return _employeeCache;
    try {
      const res = await fetch('assets/data/employee_master_2026_04.json');
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      _employeeCache = (json.employees || []).sort((a,b) => a.employee_code.localeCompare(b.employee_code));
      return _employeeCache;
    } catch(e) {
      console.warn('社員JSONの読み込みに失敗、サンプルデータを使用:', e);
      return getLocal().employees;
    }
  }
  async function loadEmployees() {
    const r = await query('employees','*',{order:'employee_code'});
    if (!r.demo && !r.error && r.data?.length > 0) return r.data;
    return loadEmployeesFromJson();
  }
  async function loadLicenseRows() {
    const r = await query('v_license_screen','*',{order:'employee_name'});
    const src = r.demo||r.error ? getLocal().employeeLicenses : r.data||[];
    return src.map(x => ({...x, alert_status: normStatus(x.alert_status, x.expiration_date)}));
  }
  async function loadAlertRows() {
    const r = await query('v_employee_license_alerts','*',{order:'days_remaining'});
    const src = r.demo||r.error ? getLocal().employeeLicenses : r.data||[];
    return src.map(x => ({...x, alert_status: normStatus(x.alert_status, x.expiration_date), days_remaining: daysUntil(x.expiration_date)}));
  }
  async function loadLicenseMaster() {
    const r = await query('license_master','*, license_categories(category_name)',{order:'license_name'});
    if (r.demo||r.error) return getLocal().licenses;
    return (r.data||[]).map(x => ({...x, category_name: x.license_categories?.category_name||x.category_name||''}));
  }
  async function loadMasters() {
    const d = getLocal();
    const [c,dv,p,cat,lics] = await Promise.all([
      query('centers','*',{order:'center_name'}), query('divisions','*',{order:'division_name'}),
      query('positions','*',{order:'position_name'}), query('license_categories','*',{order:'sort_order'}),
      loadLicenseMaster()
    ]);
    return {
      centers:   c.demo||c.error   ? d.centers   : c.data||[],
      divisions: dv.demo||dv.error ? d.divisions  : dv.data||[],
      positions: p.demo||p.error   ? d.positions  : p.data||[],
      categories:cat.demo||cat.error?d.categories : cat.data||[],
      licenses: lics
    };
  }
  async function saveEmployeeLicense(payload) {
    const sb = client();
    if (sb) return await insert('employee_licenses', payload);
    const d = getLocal();
    const emp = d.employees.find(e => e.id === payload.employee_id);
    const lic = d.licenses.find(l => l.id === payload.license_id);
    d.employeeLicenses.unshift({
      id:`local_${Date.now()}`, employee_id:payload.employee_id,
      employee_code:emp?.employee_code, employee_name:emp?.name,
      center:emp?.center, position:emp?.position,
      license_id:payload.license_id, license_name:lic?.license_name,
      category_name:lic?.category_name, acquired_date:payload.acquired_date,
      expiration_date:payload.expiration_date, renewal_date:payload.renewal_date,
      memo:payload.memo, alert_status: normStatus(null, payload.expiration_date),
    });
    setLocal(d);
    return {data:[payload], error:null, demo:true};
  }

  /* ================================================================
     ブランドマーク — 帝国劇場の紋章
     薔薇 × 桜 × 五芒星 × 剣 の大正ロマン紋章（完全オリジナル）
     ================================================================ */
  const BRAND_EMBLEM = `<svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="imperial-brand-svg">
    <defs>
      <radialGradient id="ibg" cx="48%" cy="34%" r="68%">
        <stop offset="0%" stop-color="#FFF1B8"/>
        <stop offset="48%" stop-color="#D4A830"/>
        <stop offset="100%" stop-color="#8A5D14"/>
      </radialGradient>
      <linearGradient id="ibb" x1="10" y1="8" x2="54" y2="56">
        <stop stop-color="#8D1722"/>
        <stop offset="1" stop-color="#10263A"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="29" fill="url(#ibb)" stroke="url(#ibg)" stroke-width="3"/>
    <circle cx="32" cy="32" r="23" fill="none" stroke="#F7E0A2" stroke-width="1.5" stroke-dasharray="3 3"/>
    <path d="M32 7v8M32 49v8M7 32h8M49 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6" stroke="#D4A830" stroke-width="2" stroke-linecap="round"/>
    <path d="M32 14l4.4 12.3 13.1.3-10.4 7.9 3.8 12.5L32 39.6 21.1 47l3.8-12.5-10.4-7.9 13.1-.3L32 14z"
          fill="#10263A" stroke="#F6DF9A" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="6" fill="#F2C4CF" stroke="#D4A830" stroke-width="2"/>
  </svg>`;

  /* ================================================================
     サイドバー — 宝石色アイコン（大正浪漫劇場版）
     ================================================================ */

  /* 薔薇の花（桜花） */
  const ico = {
    /* ダッシュボード — 金の羅針盤 */
    dashboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="2" x2="12" y2="6"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="6" y2="12"/>
      <line x1="18" y1="12" x2="22" y2="12"/>
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity=".4"/>
      <line x1="12" y1="12" x2="16" y2="9" stroke-width="2"/>
    </svg>`,
    /* 社員 — 瑠璃の紋章盾 */
    employees: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L3 7v5c0 5 4 9 9 10 5-1 9-5 9-10V7L12 2z"/>
      <circle cx="12" cy="10" r="3"/>
      <path d="M7 20c0-2.5 2.2-4 5-4s5 1.5 5 4"/>
    </svg>`,
    /* 資格登録 — 桜紅の証書巻物 */
    licenses: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M9 13h6M9 17h4"/>
      <circle cx="9" cy="9" r="1" fill="currentColor"/>
    </svg>`,
    /* 事業所 — 翡翠の帝国屋敷 */
    facility: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
      <line x1="12" y1="3" x2="12" y2="9"/>
    </svg>`,
    /* アラート — 朱の警鐘 */
    alerts: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      <circle cx="12" cy="8" r="1.5" fill="currentColor"/>
    </svg>`,
    /* 昇格 — 紫の翼章 */
    promotion: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2l2.5 7.5H22l-6.5 4.7 2.5 7.8L12 17.5 6 22l2.5-7.8L2 9.5h7.5L12 2z"/>
    </svg>`,
    /* マスタ — 銀の歯車 */
    masters: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>`,
  };

  /* ナビ定義 */
  const NAV = [
    { id:'index',         label:'総覧',       sub:'ダッシュボード',       href:'index.html',             icon:'dashboard', badge:false },
    { id:'employees',     label:'社員名簿',   sub:'社員一覧・検索',       href:'employees.html',         icon:'employees', badge:false },
    { id:'licenses',      label:'資格台帳',   sub:'資格・免許管理',       href:'licenses.html',          icon:'licenses', badge:false },
    { id:'facility',      label:'事業所資格', sub:'事業所別管理',         href:'facility_licenses.html', icon:'facility', badge:false },
    { id:'alerts',        label:'警鐘',       sub:'アラート一覧',         href:'alerts.html',            icon:'alerts', badge:true },
    { id:'promotion',     label:'昇格評定',   sub:'昇格・人事評価',       href:'promotion.html',         icon:'promotion', badge:false },
    { id:'masters',       label:'原簿設定',   sub:'マスタ管理',           href:'masters.html',           icon:'masters', badge:false },
    { id:'master_import', label:'社員取込',   sub:'社員マスタ初期取込',   href:'master_import.html',     icon:'import', badge:false }
  ];

  const sidebarIconSrc = (name) => {
    return `assets/img/imperial/sidebar/menu-${name}.png`;
  };

  function renderSidebar(active) {
    const sb = document.getElementById('sidebar');
    if (!sb) return;

    const rows = NAV.map(n => `
      <a class="imperial-menu-card${n.id === active ? ' active' : ''}" href="${n.href}" data-menu="${n.id}">
        <span class="imperial-medal" aria-hidden="true">
          <img src="${sidebarIconSrc(n.icon)}" alt="" loading="eager">
        </span>
        <span class="imperial-menu-copy">
          <span class="imperial-menu-title">${n.label}</span>
          <span class="imperial-menu-sub">${n.sub || ''}</span>
        </span>
        ${n.badge ? '<span class="nav-badge imperial-alert-dot" id="nav-alert-badge" style="display:none">!</span>' : ''}
      </a>`).join('');

    sb.innerHTML = `
      <div class="imperial-brand-card">
        <span class="icon-frame icon-frame-brand" aria-hidden="true">
          <img src="assets/img/imperial/icons/brand-emblem.png" alt="" loading="eager">
        </span>
        <div class="imperial-brand-copy">
          <div class="imperial-brand-title">資格・免許管理</div>
          <div class="imperial-brand-sub">License Management System</div>
        </div>
      </div>

      <nav class="imperial-nav">${rows}</nav>

      <div class="imperial-sidebar-separator"><span>管理メニュー</span></div>

      <div class="imperial-user-card">
        <div class="imperial-user-avatar"><img src="assets/img/imperial/sidebar/admin-emblem.png" alt="管理者" loading="eager"></div>
        <div>
          <div class="imperial-user-name">管理者</div>
          <div class="imperial-user-role">人事管理者</div>
        </div>
      </div>

      <div class="imperial-sidebar-future-space" aria-hidden="true"></div>`;
  }

  function initHeader() {
    const d = document.getElementById('today-date');
    if (d) d.textContent = new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium', timeZone: 'Asia/Tokyo'
    }).format(new Date());
    const m = document.getElementById('connection-status');
    if (m) m.innerHTML = isSupabaseReady()
      ? '<span class="status-dot"></span>Supabase接続'
      : '<span class="status-dot demo"></span>デモ表示';
  }

  const Auth = {
    async requireAuth() { return true; },
    async currentUser() { return { email: 'admin@example.com' }; },
    displayName() { return '管理者'; },
    logout() { toast('ログアウト処理はSupabase Auth接続後に有効化します', 'warning'); }
  };

  return {
    today, fmtDate, daysUntil, normStatus, statusClass,
    escape, badge, alertBadge, toast, client, isSupabaseReady,
    query, insert, loadEmployees, loadLicenseRows, loadAlertRows,
    loadLicenseMaster, loadMasters, saveEmployeeLicense,
    renderSidebar, initHeader, Auth, NAV
  };
})();

window.Auth          = APP.Auth;
window.renderSidebar = APP.renderSidebar;
window.Toast = { success:m=>APP.toast(m), warning:m=>APP.toast(m,'warning'), error:m=>APP.toast(m,'error') };
window.Modal = {
  open:  id => document.getElementById(id)?.classList.remove('hidden'),
  close: id => document.getElementById(id)?.classList.add('hidden'),
  setup() {
    document.querySelectorAll('[data-modal-close]').forEach(b => b.onclick = () => Modal.close(b.dataset.modalClose));
    document.querySelectorAll('.modal-backdrop').forEach(m => m.onclick = e => { if (e.target === m) Modal.close(m.id); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape')
        document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m => Modal.close(m.id));
    });
  }
};


