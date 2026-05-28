/* sidebar.js : unified sidebar renderer */
(function(){
  "use strict";

  const mainItems = [
    { href:"./index.html", label:"登録画面", roles:["admin","editor"] },
    { href:"./list.html", label:"応募者一覧", roles:["admin","editor","viewer"] },
    { href:"./detail.html", label:"応募者詳細", roles:["admin","editor","viewer"] },
    { href:"./dashboard.html", label:"ダッシュボード", roles:["admin","editor","viewer"] },
    { href:"./data_io.html", label:"データ連携", roles:["admin"] },
    { href:"./print_center.html", label:"帳票出力", roles:["admin"] }
  ];

  const analysisGroups = [
    {
      title:"採用推移",
      key:"trend",
      items:[
        { href:"./dashboard_progress.html", label:"採用進捗" },
        { href:"./dashboard_trend.html", label:"推移分析" }
      ]
    },
    {
      title:"採用比較",
      key:"compare",
      items:[
        { href:"./dashboard_compare.html", label:"比較分析" }
      ]
    },
    {
      title:"課題分析",
      key:"issue",
      items:[
        { href:"./dashboard_reason.html", label:"辞退・不通分析" },
        { href:"./dashboard_heatmap.html", label:"ヒートマップ分析" }
      ]
    }
  ];

  const systemItems = [
    { href:"./admin_settings.html", label:"マスター設定" },
    { href:"./data_backup.html", label:"バックアップ" }
  ];

  function currentFile(){
    return location.pathname.split("/").pop() || "index.html";
  }

  function cleanHref(href){
    return String(href || "").replace(/^\.\//, "");
  }

  function isActive(item){
    return cleanHref(item.href) === currentFile();
  }

  function linkHtml(item, className){
    const active = isActive(item) ? " active" : "";
    return `
      <a class="${className}${active}" href="${item.href}">
        <span class="sidebar-link-text">${item.label}</span>
      </a>
    `;
  }

  function hasActive(items){
    return items.some(isActive);
  }

  function groupHtml(title, key, items){
    const open = hasActive(items) ? " open" : "";
    const expanded = hasActive(items) ? "true" : "false";
    return `
      <section class="sidebar-group${open}" data-sidebar-group="${key}">
        <button class="sidebar-group-toggle" type="button" aria-expanded="${expanded}">
          <span>${title}</span>
          <span class="sidebar-group-mark">⌄</span>
        </button>
        <div class="sidebar-group-body">
          ${items.map(item => linkHtml(item, "sidebar-sub-link")).join("")}
        </div>
      </section>
    `;
  }

  function bindAccordion(sidebar){
    sidebar.querySelectorAll(".sidebar-group-toggle").forEach(button => {
      button.addEventListener("click", () => {
        const group = button.closest(".sidebar-group");
        if(!group) return;
        const isOpen = group.classList.toggle("open");
        button.setAttribute("aria-expanded", String(isOpen));
      });
    });
  }

  function bindLogout(sidebar){
    const logoutButton = sidebar.querySelector("#sidebarLogoutButton");
    if(!logoutButton) return;

    logoutButton.addEventListener("click", function(){
      if(window.RecruitAuth && typeof window.RecruitAuth.logoutToIndex === "function"){
        window.RecruitAuth.logoutToIndex();
        return;
      }

      const client = window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : (window.supabaseClient || window.sb || window.supabase);
      if(client && client.auth && typeof client.auth.signOut === "function"){
        client.auth.signOut().finally(function(){
          window.location.replace("./index.html");
        });
        return;
      }

      window.location.replace("./index.html");
    });
  }

  function normalizeRole(role){
    const value = String(role || "viewer").toLowerCase();
    return ["admin", "editor", "viewer"].includes(value) ? value : "viewer";
  }

  function getResolvedRole(){
    return normalizeRole(window.currentRole || "viewer");
  }

  function isAllowedForRole(item, role){
    const allowed = Array.isArray(item.roles) && item.roles.length ? item.roles : ["admin", "editor", "viewer"];
    return allowed.includes(normalizeRole(role));
  }

  function filterItemsByRole(items, role){
    return items.filter(item => isAllowedForRole(item, role));
  }

  function isAdminRole(){
    return getResolvedRole() === "admin";
  }

  async function resolveRoleBeforeRender(){
    const client = window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : null;
    if(window.RecruitAuth && typeof window.RecruitAuth.getCurrentRole === "function"){
      try{
        await window.RecruitAuth.getCurrentRole();
      }catch(e){
        console.warn("sidebar role fetch failed", e);
      }
    }else if(client && client.auth){
      try{
        const { data:{ session } = {} } = await client.auth.getSession();
        const user = session && session.user ? session.user : null;
        if(user){
          const { data } = await client.from("profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
          window.currentRole = data && data.is_active !== false && data.role ? normalizeRole(data.role) : "viewer";
        }
      }catch(e){
        console.warn("sidebar fallback role fetch failed", e);
      }
    }
  }

  function renderSidebar(){
    const sidebar =
      document.getElementById("dashboardSidebarMenu") ||
      document.querySelector("aside.sidebar") ||
      document.querySelector(".sidebar");

    if(!sidebar) return;

    sidebar.className = "sidebar";
    sidebar.setAttribute("aria-label", "採用管理メニュー");

    const role = getResolvedRole();
    const visibleMainItems = filterItemsByRole(mainItems, role);
    const visibleSystemItems = filterItemsByRole(systemItems.map(item => Object.assign({ roles:["admin"] }, item)), role);
    const systemGroup = visibleSystemItems.length ? groupHtml("システム管理", "system", visibleSystemItems) : "";

    sidebar.innerHTML = `
      <div class="sidebar-inner">
        <div class="sidebar-brand">
          <div class="sidebar-brand-title">採用管理</div>
        </div>

        <nav class="sidebar-nav" aria-label="主要メニュー">
          ${visibleMainItems.map(item => linkHtml(item, "sidebar-link")).join("")}
        </nav>

        <div class="sidebar-section-title">分析メニュー</div>
        ${analysisGroups.map(group => groupHtml(group.title, group.key, group.items)).join("")}
        ${systemGroup}

        <div class="sidebar-bottom">
          <button class="sidebar-logout" type="button" id="sidebarLogoutButton">ログアウト</button>
        </div>
      </div>
    `;

    bindAccordion(sidebar);
    bindLogout(sidebar);
  }

  async function renderSidebarWithRole(){
    await resolveRoleBeforeRender();
    renderSidebar();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", renderSidebarWithRole);
  }else{
    renderSidebarWithRole();
  }

  window.addEventListener("recruit:role-ready", renderSidebar);

  window.renderDashboardSidebar = renderSidebarWithRole;
})();
