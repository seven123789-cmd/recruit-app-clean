// assets/js/ui_utils.js
(function(){

function getEl(id){
  return document.getElementById(id);
}

function setBoxMessage(id, message, type = "info"){
  const el = getEl(id);
  if(!el) return;

  el.textContent = message || "";
  el.className = "message-box";

  if(type === "success") el.classList.add("success");
  if(type === "error") el.classList.add("error");
  if(type === "warning") el.classList.add("warning");
  if(type === "info") el.classList.add("info");
}

function setAuthMessage(message, type = "info"){
  setBoxMessage("authMessage", message, type);
}

function setPageMessage(message, type = "info"){
  setBoxMessage("pageMessage", message, type);
}

function ensureToastRoot(){
  let root = getEl("recruitToastRoot");
  if(root) return root;

  root = document.createElement("div");
  root.id = "recruitToastRoot";
  root.className = "recruit-toast-root";
  document.body.appendChild(root);
  return root;
}

function toast(message, type = "info", timeout = 2800){
  const root = ensureToastRoot();
  const item = document.createElement("div");
  item.className = `recruit-toast ${type}`;
  item.textContent = message || "";
  root.appendChild(item);

  window.setTimeout(() => {
    item.classList.add("is-hide");
    window.setTimeout(() => item.remove(), 220);
  }, timeout);

  return item;
}

function showModal(options = {}){
  const {
    title = "確認",
    message = "",
    type = "info",
    okText = "OK",
    cancelText = "",
    onOk = null,
    onCancel = null
  } = options;

  let overlay = getEl("recruitCommonModal");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "recruitCommonModal";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-head info" id="recruitCommonModalHead">確認</div>
        <div class="modal-body" id="recruitCommonModalBody">内容</div>
        <div class="modal-actions" id="recruitCommonModalActions">
          <button class="modal-btn cancel" type="button" id="recruitCommonModalCancel">キャンセル</button>
          <button class="modal-btn ok info" type="button" id="recruitCommonModalOk">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const head = getEl("recruitCommonModalHead");
  const body = getEl("recruitCommonModalBody");
  const ok = getEl("recruitCommonModalOk");
  const cancel = getEl("recruitCommonModalCancel");

  head.className = `modal-head ${type}`;
  head.textContent = title;
  body.textContent = message;
  ok.className = `modal-btn ok ${type}`;
  ok.textContent = okText;
  cancel.textContent = cancelText || "キャンセル";
  cancel.style.display = cancelText ? "" : "none";

  const close = () => {
    overlay.classList.remove("show");
    ok.onclick = null;
    cancel.onclick = null;
  };

  ok.onclick = () => {
    close();
    if(typeof onOk === "function") onOk();
  };

  cancel.onclick = () => {
    close();
    if(typeof onCancel === "function") onCancel();
  };

  overlay.classList.add("show");
}

function showError(message, title = "エラー"){
  showModal({title, message, type:"error", okText:"閉じる"});
}

function showSuccess(message, title = "完了"){
  showModal({title, message, type:"success", okText:"閉じる"});
}

function confirmAction(message, options = {}){
  return new Promise(resolve => {
    showModal({
      title: options.title || "確認",
      message,
      type: options.type || "warning",
      okText: options.okText || "実行する",
      cancelText: options.cancelText || "キャンセル",
      onOk: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
}

function setLoading(targetId, isLoading, text = "処理中です"){
  const target = getEl(targetId);
  if(!target) return;

  target.classList.toggle("is-loading", !!isLoading);
  target.setAttribute("aria-busy", isLoading ? "true" : "false");

  let badge = target.querySelector(":scope > .recruit-loading-badge");
  if(isLoading){
    if(!badge){
      badge = document.createElement("div");
      badge.className = "recruit-loading-badge";
      target.appendChild(badge);
    }
    badge.textContent = text;
  }else if(badge){
    badge.remove();
  }
}

window.RecruitUI = {
  setBoxMessage,
  setAuthMessage,
  setPageMessage,
  toast,
  showModal,
  showError,
  showSuccess,
  confirmAction,
  setLoading
};

window.setBoxMessage = window.setBoxMessage || setBoxMessage;
window.setAuthMessage = window.setAuthMessage || setAuthMessage;
window.setPageMessage = window.setPageMessage || setPageMessage;
window.showErrorModal = window.showErrorModal || showError;
window.showSuccessModal = window.showSuccessModal || showSuccess;

})();
