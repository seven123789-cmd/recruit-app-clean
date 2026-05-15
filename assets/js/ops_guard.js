// assets/js/ops_guard.js
(function(){

function normalize(role){
  return String(role || localStorage.getItem("recruit_user_role") || "editor").toLowerCase();
}

function currentRole(){
  return normalize(window.currentRole || localStorage.getItem("recruit_user_role") || "editor");
}

function canRead(role = currentRole()){
  return ["admin","manager","editor","viewer"].includes(normalize(role));
}

function canWrite(role = currentRole()){
  return ["admin","manager","editor"].includes(normalize(role));
}

function canImport(role = currentRole()){
  return ["admin","manager"].includes(normalize(role));
}

function canDelete(role = currentRole()){
  return ["admin","manager","editor"].includes(normalize(role));
}

function canManageMaster(role = currentRole()){
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
  return canImport(role) || deny("CSV取り込みはadminまたはmanager権限のみ実行できます。");
}

function requireDelete(role = currentRole()){
  return canDelete(role) || deny("削除できる権限がありません。");
}

function requireMaster(role = currentRole()){
  return canManageMaster(role) || deny("マスタ設定はadmin権限のみ実行できます。");
}

function setRole(role){
  const r = normalize(role);
  localStorage.setItem("recruit_user_role", r);
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

function applyToPage(role = currentRole()){
  const r = normalize(role);
  document.body.classList.toggle("role-viewer", r === "viewer");
  document.body.classList.toggle("role-editor", r === "editor");
  document.body.classList.toggle("role-manager", r === "manager");
  document.body.classList.toggle("role-admin", r === "admin");

  const page = currentRecruitPage();
  if((page === "admin_settings.html" || page === "data_backup.html" || page === "backup.html") && r !== "admin"){
    location.replace("./dashboard.html");
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
  canDelete,
  canManageMaster,
  requireWrite,
  requireImport,
  requireDelete,
  requireMaster,
  applyToPage
};

// Compatibility alias. RecruitOpsGuard is the formal permission object;
// RecruitRole remains for existing pages that still call RecruitRole.apply()/isViewer().
window.RecruitRole = Object.assign(window.RecruitOpsGuard, {
  isViewer: role => normalize(role) === "viewer",
  isAdmin: role => normalize(role) === "admin",
  isManager: role => normalize(role) === "manager",
  apply: applyToPage
});

document.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(() => applyToPage(), 100);
  window.setTimeout(() => applyToPage(), 800);
});

})();
