// assets/js/overdue_popup.js
(function(){
  "use strict";

  const POPUP_ID = "recruitOverdueActionModal";
  const MAX_ROWS = 50;
  const HIDE_TODAY_KEY_PREFIX = "recruit_overdue_hide_";

  function getHideTodayKey(){
    return HIDE_TODAY_KEY_PREFIX + todayText();
  }

  function isHiddenToday(){
    try{
      return localStorage.getItem(getHideTodayKey()) === "1";
    }catch(e){
      return false;
    }
  }

  function hideToday(){
    try{
      localStorage.setItem(getHideTodayKey(), "1");
    }catch(e){
      // localStorageが使えない環境では、通常の閉じる動作のみ行う
    }
  }

  function wait(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escLocal(value){
    if(window.escapeHtml) return window.escapeHtml(value);
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function todayText(){
    if(typeof window.todayJST === "function") return window.todayJST();
    const now = new Date();
    const parts = new Intl.DateTimeFormat("ja-JP",{
      timeZone:"Asia/Tokyo",
      year:"numeric",
      month:"2-digit",
      day:"2-digit"
    }).formatToParts(now).reduce((acc,part)=>{
      if(part.type !== "literal") acc[part.type] = part.value;
      return acc;
    },{});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function addDaysJST(baseText, days){
    const base = new Date(String(baseText || todayText()).slice(0,10) + "T00:00:00+09:00");
    base.setDate(base.getDate() + Number(days || 0));
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2,"0");
    const d = String(base.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  function dateDiffDays(fromText, toText){
    const from = new Date(String(fromText || "").slice(0,10) + "T00:00:00+09:00");
    const to = new Date(String(toText || "").slice(0,10) + "T00:00:00+09:00");
    if(Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return Math.floor((to - from) / 86400000);
  }

  async function getClient(){
    for(let i = 0; i < 30; i++){
      const client = window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : (window.sb || window.supabaseClient || null);
      if(client && client.auth && client.from) return client;
      await wait(120);
    }
    return null;
  }

  async function hasSession(client){
    try{
      const { data:{ session } = {} } = await client.auth.getSession();
      return !!(session && session.user);
    }catch(e){
      return false;
    }
  }

  function normalizeRow(row){
    if(window.normalizeRecruitCandidateState) return window.normalizeRecruitCandidateState(row || {});
    return row || {};
  }

  function isOverdueTarget(row, today){
    const r = normalizeRow(row);
    if(r.is_deleted === true) return false;
    if(!r.next_action_date) return false;
    if(String(r.next_action_date).slice(0,10) >= today) return false;
    if(String(r.status || "").trim() === "採用") return false;
    return String(r.hiring_result || "進行中").trim() === "進行中";
  }

  async function fetchOverdueRows(client){
    const today = todayText();
    const { data, error } = await client
      .from("candidates")
      .select("id,name,owner_name,status,hiring_result,next_action_date,is_deleted")
      .lt("next_action_date", today)
      .order("next_action_date", { ascending:true })
      .limit(150);

    if(error){
      console.warn("対応遅れの取得に失敗しました", error);
      return [];
    }

    return (data || [])
      .filter(row => isOverdueTarget(row, today))
      .slice(0, MAX_ROWS);
  }

  function removeModal(){
    const old = document.getElementById(POPUP_ID);
    if(old) old.remove();
  }

  async function updateNextActionDate(id, nextDate){
    const client = await getClient();
    if(!client) return false;
    const { error } = await client
      .from("candidates")
      .update({ next_action_date: nextDate })
      .eq("id", id);
    if(error){
      alert("次回対応日の更新に失敗しました。時間をおいて再度お試しください。");
      console.warn("next_action_date update failed", error);
      return false;
    }
    return true;
  }

  function openDetail(id){
    if(!id) return;
    window.location.href = "./detail.html?id=" + encodeURIComponent(id);
  }

  function renderModal(rows){
    removeModal();
    if(!rows.length) return;

    const today = todayText();
    const rowsHtml = rows.map(row => {
      const r = normalizeRow(row);
      const delay = Math.max(1, dateDiffDays(r.next_action_date, today) || 0);
      return `
        <tr data-candidate-id="${escLocal(r.id)}">
          <td class="overdue-name">${escLocal(r.name || "氏名未入力")}</td>
          <td>${escLocal(r.owner_name || "未設定")}</td>
          <td>${escLocal(r.status || "-")}</td>
          <td>${escLocal(r.next_action_date || "-")}</td>
          <td><span class="overdue-days">${delay}日遅れ</span></td>
          <td class="overdue-actions">
            <button type="button" class="overdue-detail-btn" data-action="detail">詳細</button>
            <button type="button" class="overdue-date-btn" data-action="today">今日</button>
            <button type="button" class="overdue-date-btn" data-action="tomorrow">明日</button>
          </td>
        </tr>
      `;
    }).join("");

    const modal = document.createElement("div");
    modal.id = POPUP_ID;
    modal.className = "overdue-modal-backdrop";
    modal.innerHTML = `
      <div class="overdue-modal" role="dialog" aria-modal="true" aria-labelledby="overdueModalTitle">
        <div class="overdue-modal-header">
          <div>
            <div class="overdue-modal-kicker">要対応</div>
            <h2 id="overdueModalTitle">次回対応日を過ぎている応募者があります</h2>
            <p>選考結果が「進行中」で、次回対応日が本日より前の応募者です。担当者ごとに確認してください。</p>
          </div>
          <button type="button" class="overdue-modal-close" data-action="close" aria-label="閉じる">×</button>
        </div>
        <div class="overdue-modal-body">
          <table class="overdue-table">
            <thead>
              <tr>
                <th>応募者</th>
                <th>担当者</th>
                <th>ステータス</th>
                <th>次回対応日</th>
                <th>遅延</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="overdue-modal-footer">
          <span>詳細確認、または次回対応日を今日・明日に再設定できます。</span>
          <div class="overdue-footer-actions">
            <label class="overdue-hide-today">
              <input type="checkbox" data-action="hide-today">
              <span>今日は表示しない</span>
            </label>
            <button type="button" class="overdue-secondary-btn" data-action="close">閉じる</button>
          </div>
        </div>
      </div>
    `;

    modal.addEventListener("click", async ev => {
      const actionEl = ev.target.closest("[data-action]");
      if(!actionEl) return;
      const action = actionEl.dataset.action;
      if(action === "close"){
        removeModal();
        return;
      }

      if(action === "hide-today"){
        if(actionEl.checked){
          hideToday();
          removeModal();
        }
        return;
      }

      const tr = actionEl.closest("tr[data-candidate-id]");
      const id = tr ? tr.dataset.candidateId : "";
      if(!id) return;

      if(action === "detail"){
        openDetail(id);
        return;
      }

      if(action === "today" || action === "tomorrow"){
        actionEl.disabled = true;
        const nextDate = action === "today" ? todayText() : addDaysJST(todayText(), 1);
        const ok = await updateNextActionDate(id, nextDate);
        if(ok){
          tr.remove();
          if(!modal.querySelector("tbody tr")) removeModal();
        }else{
          actionEl.disabled = false;
        }
      }
    });

    document.body.appendChild(modal);
  }

  async function showOverduePopup(){
    if(document.body && document.body.dataset.recruitOverduePopup === "off") return;
    if(isHiddenToday()) return;
    const client = await getClient();
    if(!client) return;
    if(!(await hasSession(client))) return;
    const rows = await fetchOverdueRows(client);
    renderModal(rows);
  }

  function scheduleOverduePopup(){
    window.setTimeout(showOverduePopup, 900);
    window.addEventListener("recruit:role-ready", () => window.setTimeout(showOverduePopup, 300), { once:true });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", scheduleOverduePopup);
  }else{
    scheduleOverduePopup();
  }

  window.RecruitOverduePopup = window.RecruitOverduePopup || {
    show: showOverduePopup,
    close: removeModal
  };
})();

