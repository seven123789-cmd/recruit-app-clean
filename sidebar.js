/* sidebar.js : unified sidebar renderer */
(function(){
  "use strict";

  const mainItems = [
    { href:"./index.html", label:"登録画面" },
    { href:"./list.html", label:"応募者一覧" },
    { href:"./detail.html", label:"応募者詳細" },
    { href:"./dashboard.html", label:"ダッシュボード" },
    { href:"./data_io.html", label:"データ連携" },
    { href:"./print_center.html", label:"帳票出力" }
  ];

  const analysisGroups = [
    {
      title:"採用推移",
      key:"trend",
      items:[
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

    logoutButton.addEventListener("click", async function(){
      if(window.RecruitAuth && typeof window.RecruitAuth.logoutToIndex === "function"){
        await window.RecruitAuth.logoutToIndex();
        return;
      }

      const client = window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : (window.supabaseClient || window.sb || window.supabase);
      if(client && client.auth && typeof client.auth.signOut === "function"){
        try{ await client.auth.signOut(); }catch(e){}
      }
      location.href = "./index.html";
    });
  }

  function getStoredRole(){
    try{
      return String(localStorage.getItem("recruit_user_role") || "").toLowerCase();
    }catch(e){
      return "";
    }
  }

  function isAdminRole(){
    return getStoredRole() === "admin";
  }

  async function refreshStoredRole(){
    const client = window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : (window.supabaseClient || window.sb);
    if(!client || !client.auth) return getStoredRole();

    try{
      const { data:{ session } = {} } = await client.auth.getSession();
      const user = session && session.user ? session.user : null;
      if(!user) return getStoredRole();

      let role = "";
      const byUserId = await client
        .from("profiles")
        .select("role,is_active,email")
        .eq("user_id", user.id)
        .maybeSingle();

      if(byUserId && byUserId.data && byUserId.data.is_active !== false){
        role = byUserId.data.role || "";
      }

      if(!role && user.email){
        const byEmail = await client
          .from("profiles")
          .select("role,is_active,email")
          .eq("email", user.email)
          .maybeSingle();
        if(byEmail && byEmail.data && byEmail.data.is_active !== false){
          role = byEmail.data.role || "";
        }
      }

      if(role){
        localStorage.setItem("recruit_user_role", String(role).toLowerCase());
        localStorage.setItem("recruit_user_email", user.email || "");
      }
      return getStoredRole();
    }catch(e){
      console.warn("sidebar role refresh failed", e);
      return getStoredRole();
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

    const systemGroup = isAdminRole() ? groupHtml("システム管理", "system", systemItems) : "";

    sidebar.innerHTML = `
      <div class="sidebar-inner">
        <div class="sidebar-brand">
          <div class="sidebar-brand-title">採用管理</div>
        </div>

        <nav class="sidebar-nav" aria-label="主要メニュー">
          ${mainItems.map(item => linkHtml(item, "sidebar-link")).join("")}
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

  async function renderSidebarWithRoleRefresh(){
    renderSidebar();
    const before = getStoredRole();
    const after = await refreshStoredRole();
    if(before !== after){
      renderSidebar();
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", renderSidebarWithRoleRefresh);
  }else{
    renderSidebarWithRoleRefresh();
  }

  window.renderDashboardSidebar = renderSidebarWithRoleRefresh;
})();
