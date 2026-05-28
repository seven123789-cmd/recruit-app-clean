// assets/js/ops_guard.js
(function(){

function normalize(role){
  const r = String(role || window.currentRole || "viewer").toLowerCase().trim();
  return ["admin", "editor", "viewer"].includes(r) ? r : "viewer";
}

function currentRole(){
  return normalize(window.currentRole || "viewer");
}

function canRead(role = currentRole()){
  return ["admin","editor","viewer"].includes(normalize(role));
}

function canWrite(role = currentRole()){
  return ["admin","editor"].includes(normalize(role));
}

function canImport(role = currentRole()){
  return normalize(role) === "admin";
}

function canDelete(role = currentRole()){
  return normalize(role) === "admin";
}

function canManageMaster(role = currentRole()){
  return normalize(role) === "admin";
}

function canExport(role = currentRole()){
  return normalize(role) === "admin";
}

function deny(message){
  const msg = message || "この操作を実行する権限がありません。";
  if(window.RecruitUI){
    window.RecruitUI.showError(msg, "権限エラー");
  }else{
    alert(msg);
  }
  return false;
}

function requireWrite(role = currentRole()){
  return canWrite(role) || deny("viewer権限では登録・更新できません。");
}

function requireImport(role = currentRole()){
  return canImport(role) || deny("CSV取り込みはadmin権限のみ実行できます。");
}

function requireExport(role = currentRole()){
  return canExport(role) || deny("CSV出力・印刷はadmin権限のみ実行できます。");
}

function requireDelete(role = currentRole()){
  return canDelete(role) || deny("削除できる権限がありません。");
}

function requireMaster(role = currentRole()){
  return canManageMaster(role) || deny("マスタ設定はadmin権限のみ実行できます。");
}

function setRole(role){
  const r = normalize(role);
  window.currentRole = r;
  applyToPage(r);
  return r;
}

function currentRecruitPage(){
  return String(location.pathname.split("/").pop() || "index.html").toLowerCase();
}

function disableViewerWriteControls(page){
  document.querySelectorAll("[data-write-action]").forEach(el => {
    el.disabled = true;
    el.classList.add("viewer-disabled");
    el.setAttribute("aria-disabled","true");
  });

  const writeSelectors = [
    'button[onclick*="registerCandidate"]',
    'button[onclick*="saveCandidate"]',
    'button[onclick*="deleteCandidate"]',
    'button[onclick*="quickSetStatus"]',
    'button[onclick*="save"]',
    'button[onclick*="delete"]',
    'button[onclick*="toggle"]'
  ];
  writeSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      const text = String(el.textContent || "");
      if(text.includes("更新") && !text.includes("保存") && !text.includes("権限")) return;
      el.disabled = true;
      el.classList.add("viewer-disabled");
      el.setAttribute("aria-disabled", "true");
    });
  });

  if(page === "index.html"){
    document.querySelectorAll('#appScreen input, #appScreen select, #appScreen textarea').forEach(el => {
      el.disabled = true;
      el.classList.add("viewer-disabled");
    });
    const msg = document.getElementById("pageMessage");
    if(msg && !msg.dataset.viewerNotice){
      msg.dataset.viewerNotice = "1";
      msg.style.display = "block";
      msg.textContent = "viewer権限のため、新規登録はできません。";
      msg.className = "message-box message-info";
    }
  }

  if(page === "detail.html"){
    document.querySelectorAll('.card-main input, .card-main select, .card-main textarea').forEach(el => {
      el.disabled = true;
      el.classList.add("viewer-disabled");
    });
  }
}

function clearViewerDisabledControls(){
  document.querySelectorAll(".viewer-disabled").forEach(el => {
    el.disabled = false;
    el.classList.remove("viewer-disabled");
    el.removeAttribute("aria-disabled");
  });

  const msg = document.getElementById("pageMessage");
  if(msg && msg.dataset.viewerNotice){
    delete msg.dataset.viewerNotice;
    msg.textContent = "";
    msg.className = "message-box";
    msg.style.display = "none";
  }
}

function applyToPage(role = currentRole()){
  const r = normalize(role);
  clearViewerDisabledControls();
  document.body.classList.toggle("role-viewer", r === "viewer");
  document.body.classList.toggle("role-editor", r === "editor");
  document.body.classList.toggle("role-admin", r === "admin");

  const page = currentRecruitPage();
  if((page === "admin_settings.html" || page === "data_backup.html" || page === "backup.html") && r !== "admin"){
    if(window.__recruitRoleResolved){
      location.replace("./dashboard.html");
    }
    return;
  }

  if((page === "data_io.html" || page === "print_center.html" || page === "print_report.html") && !canExport(r)){
    if(window.__recruitRoleResolved){
      location.replace("./dashboard.html");
    }
    return;
  }

  document.querySelectorAll("[data-requires-role]").forEach(el => {
    const required = String(el.dataset.requiresRole || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if(!required.length) return;
    const allowed = required.includes(r);
    el.classList.toggle("role-hidden", !allowed);
    el.hidden = !allowed;
  });

  if(r === "viewer") disableViewerWriteControls(page);
}

window.RecruitOpsGuard = {
  normalize,
  currentRole,
  setRole,
  canRead,
  canWrite,
  canImport,
  canExport,
  canDelete,
  canManageMaster,
  requireWrite,
  requireImport,
  requireExport,
  requireDelete,
  requireMaster,
  applyToPage,
  isViewer: role => normalize(role) === "viewer",
  isEditor: role => normalize(role) === "editor",
  isAdmin: role => normalize(role) === "admin"
};

// Compatibility alias. RecruitOpsGuard is the formal permission object;
// RecruitRole remains for existing pages that still call RecruitRole.apply()/isViewer().
window.RecruitRole = Object.assign(window.RecruitOpsGuard, {
  isViewer: role => normalize(role) === "viewer",
  isEditor: role => normalize(role) === "editor",
  isAdmin: role => normalize(role) === "admin",
  isManager: role => false,
  canExport,
  requireExport,
  apply: applyToPage
});

async function resolveAndApply(){
  if(window.RecruitAuth && typeof window.RecruitAuth.getCurrentRole === "function"){
    try{
      await window.RecruitAuth.getCurrentRole();
    }catch(e){
      console.warn("role resolve failed", e);
      window.__recruitRoleResolved = true;
    }
  }else{
    window.__recruitRoleResolved = true;
  }
  applyToPage(window.currentRole || "viewer");
}

document.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(resolveAndApply, 100);
  window.setTimeout(resolveAndApply, 800);
});

window.addEventListener("recruit:role-ready", ev => {
  applyToPage(ev.detail && ev.detail.role ? ev.detail.role : window.currentRole);
});

})();
