/* print_utils.js : data_ioの帳票出力から呼び出す印刷制御だけを担当 */
(function(){
  const STORAGE_KEY = "recruit_report_print_conditions";

  function getParam(name){
    try{ return new URLSearchParams(window.location.search || "").get(name) || ""; }
    catch(e){ return ""; }
  }
  function readConditions(){
    try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}; }
    catch(e){ return {}; }
  }
  function getScope(){
    return getParam("print_scope") || readConditions().printScope || "page";
  }
  function applyScope(){
    const scope = getScope();
    document.body.classList.remove("recruit-print-list", "recruit-print-analysis", "recruit-print-detail", "recruit-print-page");
    if(scope === "list-table"){
      document.body.classList.add("recruit-print-list");
      prepareListTitle();
      return;
    }
    if(scope === "analysis-page"){
      document.body.classList.add("recruit-print-analysis");
      return;
    }
    if(scope === "detail-sheet"){
      document.body.classList.add("recruit-print-detail");
      return;
    }
    document.body.classList.add("recruit-print-page");
  }
  function prepareListTitle(){
    const title = document.querySelector(".table-card .table-head h2");
    if(!title || title.dataset.printPrepared === "1") return;
    const countText = document.getElementById("listCount")?.textContent || "";
    const baseTitle = (title.textContent || "応募者一覧").trim();
    title.dataset.printPrepared = "1";
    title.innerHTML = `${baseTitle}<span class="print-list-count">${countText}</span>`;
  }
  function shouldPrint(){
    return getParam("recruit_print") === "1";
  }
  function printCurrentPage(){
    applyScope();
    setTimeout(() => window.print(), 250);
  }

  window.RecruitPrint = { applyScope, printCurrentPage };

  document.addEventListener("DOMContentLoaded", () => {
    if(shouldPrint()){
      applyScope();
      setTimeout(printCurrentPage, 900);
    }
  });
  window.addEventListener("beforeprint", applyScope);
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("recruit-print-list", "recruit-print-analysis", "recruit-print-detail", "recruit-print-page");
  });
})();
