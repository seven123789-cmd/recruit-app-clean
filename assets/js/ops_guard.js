// assets/js/ops_guard.js
(function(){

function normalize(role){
  const value = String(role || window.currentRole || "viewer").toLowerCase();
  return ["admin", "editor", "viewer"].includes(value) ? value : "viewer";
}

function currentRole(){
  return normalize(window.currentRole || "viewer");
}

function hasRole(role, allowed){
  const r = normalize(role);
  const list = Array.isArray(allowed) ? allowed : String(allowed || "").split(",");
  return list.map(v => String(v || "").trim().toLowerCase()).includes(r);
}

function isAdmin(role = currentRole()){
  return normalize(role) === "admin";
}

function isViewer(role = currentRole()){
  return normalize(role) === "viewer";
}

function canEdit(role = currentRole()){
  return canWrite(role);
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
  document.body.classList.toggle("role-manager", false);
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
  /**
   * role文字列を admin / editor / viewer のいずれかへ正規化する。
   * @param {string} role - 権限名。
   * @returns {string} 正規化後の権限名。
   */
  normalize,
  /**
   * 現在の画面上の権限を返す。
   * @param {void} _unused - 使用しない。
   * @returns {string} 現在の権限名。
   */
  currentRole,
  /**
   * 指定権限が許可リストに含まれるかを判定する。
   * @param {string} role - 判定する権限名。
   * @param {string|string[]} allowed - 許可する権限名または配列。
   * @returns {boolean} 許可される場合 true。
   */
  hasRole,
  /**
   * admin権限かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} adminの場合 true。
   */
  isAdmin,
  /**
   * viewer権限かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} viewerの場合 true。
   */
  isViewer,
  /**
   * 現在権限を設定し、画面へ反映する。
   * @param {string} role - 設定する権限名。
   * @returns {string} 正規化後の権限名。
   */
  setRole,
  /**
   * 読み取り可能かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 読み取り可能な場合 true。
   */
  canRead,
  /**
   * 登録・更新可能かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 登録・更新可能な場合 true。
   */
  canWrite,
  /**
   * 編集可能かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 編集可能な場合 true。
   */
  canEdit,
  /**
   * CSV取り込み可能かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 取り込み可能な場合 true。
   */
  canImport,
  /**
   * CSV出力・印刷可能かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 出力可能な場合 true。
   */
  canExport,
  /**
   * 削除可能かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 削除可能な場合 true。
   */
  canDelete,
  /**
   * マスタ管理可能かを判定する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} マスタ管理可能な場合 true。
   */
  canManageMaster,
  /**
   * 登録・更新権限を要求し、不可の場合は通知する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 実行可能な場合 true。
   */
  requireWrite,
  /**
   * CSV取り込み権限を要求し、不可の場合は通知する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 実行可能な場合 true。
   */
  requireImport,
  /**
   * CSV出力・印刷権限を要求し、不可の場合は通知する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 実行可能な場合 true。
   */
  requireExport,
  /**
   * 削除権限を要求し、不可の場合は通知する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 実行可能な場合 true。
   */
  requireDelete,
  /**
   * マスタ管理権限を要求し、不可の場合は通知する。
   * @param {string} role - 判定する権限名。
   * @returns {boolean} 実行可能な場合 true。
   */
  requireMaster,
  /**
   * 権限に応じて画面表示・操作可否を反映する。
   * @param {string} role - 反映する権限名。
   * @returns {void}
   */
  applyToPage
};

// Compatibility alias. RecruitOpsGuard is the formal permission object;
// RecruitRole remains for existing pages that still call RecruitRole.apply()/isViewer().
window.RecruitRole = Object.assign(window.RecruitOpsGuard, {
  isViewer,
  isAdmin,
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
