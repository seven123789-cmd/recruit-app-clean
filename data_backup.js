/* data_backup.js : local + Supabase backup management */
(function(){
  "use strict";


  let backupSupabaseClient = null;

  const TABLES = [
    "candidates",
    "recruitment_targets",
    "channel_costs",
    "master_centers",
    "profiles"
  ];

  const LOCAL_KEY = "recruit_auto_backup_generations_v1";
  const AUTO_META_KEY = "recruit_auto_backup_meta_v1";
  const MAX_LOCAL_GENERATIONS = 30;
  const MAX_SUPABASE_GENERATIONS = 30;
  const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const GENERATION_PAGE_SIZE = 5;


  const TABLE_LABELS = {
    candidates:"候補者",
    recruitment_targets:"採用目標",
    channel_costs:"媒体費",
    master_centers:"営業所",
    profiles:"権限"
  };

  const TABLE_PRIMARY_KEYS = {
    candidates:"id",
    recruitment_targets:"id",
    channel_costs:"id",
    master_centers:"id",
    profiles:"user_id"
  };

  const PREVIEW_FIELDS = {
    candidates:["name","center_name","status","hiring_result","applied_date","owner_name"],
    recruitment_targets:["fiscal_year","division","center_name","target_count"],
    channel_costs:["fiscal_year","month","channel","cost"],
    master_centers:["division","center_name"],
    profiles:["email","role","updated_at"]
  };

  let currentUser = null;
  let currentRole = null;
  let latestBackupData = null;
  let restoreState = null;
  const generationVisibleCount = { supabase:GENERATION_PAGE_SIZE, local:GENERATION_PAGE_SIZE };


  function $(id){ return document.getElementById(id); }

  function getClient(){
    if(window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if(window.sb && window.sb.auth) return window.sb;
    if(backupSupabaseClient && backupSupabaseClient.auth) return backupSupabaseClient;

    if(window.getRecruitSupabaseClient){
      backupSupabaseClient = window.getRecruitSupabaseClient();
      if(backupSupabaseClient){
        window.supabaseClient = window.supabaseClient || backupSupabaseClient;
        return backupSupabaseClient;
      }
    }

    return null;
  }


  async function getAuditUser(){
    try{
      if(currentUser)return currentUser;
      const client=getClient();
      if(!client?.auth)return null;
      const {data:{session}}=await client.auth.getSession();
      currentUser=session?.user||null;
      return currentUser;
    }catch(e){return currentUser||null}
  }

  async function writeAuditLog(actionType,targetType,targetId,detail={}){
    try{
      const client=getClient();
      if(!client)return;
      const user=await getAuditUser();
      const payload={
        user_id:user?.id||null,
        user_email:user?.email||null,
        action_type:String(actionType||"unknown"),
        target_type:String(targetType||"system"),
        target_id:targetId===undefined||targetId===null?null:String(targetId),
        detail_json:detail||{}
      };
      const {error}=await client.from("audit_logs").insert(payload);
      if(error)console.warn("audit log skipped:",error.message);
    }catch(e){
      console.warn("audit log skipped:",e?.message||e);
    }
  }

  function setText(id, text){
    const el = $(id);
    if(el) el.textContent = text;
  }

  function setMsg(text, type="info"){
    const el = $("backupMessage");
    if(!el) return;
    el.textContent = text;
    el.className = "backup-message " + type;
  }


  function showToast(text, type="success"){
    const el = $("backupToast");
    if(!el) return;
    el.textContent = text;
    el.className = "backup-toast show " + type;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      el.className = "backup-toast " + type;
    }, 2600);
  }

  function setLoading(isLoading, text="バックアップを処理しています。"){
    const overlay = $("backupLoading");
    const label = $("backupLoadingText");
    if(label) label.textContent = text;
    if(overlay){
      overlay.classList.toggle("show", !!isLoading);
      overlay.setAttribute("aria-hidden", isLoading ? "false" : "true");
    }
    document.querySelectorAll("button, .file-preview-label").forEach(el => {
      if(isLoading){
        el.dataset.prevDisabled = el.disabled ? "1" : "0";
        if(el.tagName === "BUTTON") el.disabled = true;
        el.classList.add("is-loading-disabled");
      }else{
        if(el.tagName === "BUTTON" && el.dataset.prevDisabled !== "1") el.disabled = false;
        el.classList.remove("is-loading-disabled");
        delete el.dataset.prevDisabled;
      }
    });
  }

  function formatDateTime(value){
    if(!value) return "-";
    if(window.RecruitDate?.formatJSTDateTimeMinute) return window.RecruitDate.formatJSTDateTimeMinute(value);
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("ja-JP", {
      timeZone:"Asia/Tokyo",
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit"
    });
  }

  function nowLabel(){
    return window.RecruitDate?.formatJSTDateTimeMinute ? window.RecruitDate.formatJSTDateTimeMinute(new Date()) : new Date().toLocaleString("ja-JP", {
      timeZone:"Asia/Tokyo",
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit"
    });
  }

  function readAutoMeta(){
    try{
      return JSON.parse(localStorage.getItem(AUTO_META_KEY) || "{}");
    }catch(e){
      return {};
    }
  }

  function writeAutoMeta(meta){
    localStorage.setItem(AUTO_META_KEY, JSON.stringify(meta || {}));
    updateAutoBackupHeader(meta || readAutoMeta());
  }

  function updateAutoBackupHeader(meta=readAutoMeta()){
    setText("lastAutoBackupAtHeader", meta.lastAutoBackupLabel || "-");
    const status = $("autoBackupStatus");
    if(status){
      const label = meta.autoStatusLabel || "自動保存ON";
      status.textContent = label;
      status.title = meta.lastAutoCheckLabel ? `最終確認：${meta.lastAutoCheckLabel}` : "";
    }
  }

  function stableStringify(value){
    if(value === null || typeof value !== "object") return JSON.stringify(value);
    if(Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }

  function hashString(text){
    let hash = 2166136261;
    for(let i=0;i<text.length;i++){
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  }

  function payloadHash(payload){
    return hashString(stableStringify(payload?.tables || {}));
  }

  function payloadCountSignature(payload){
    return TABLES.map(table => `${table}:${countOf(payload, table)}`).join("|");
  }

  function fileTimestamp(){
    const d = new Date();
    const pad = n => String(n).padStart(2,"0");
    return [
      d.getFullYear(),
      pad(d.getMonth()+1),
      pad(d.getDate()),
      "_",
      pad(d.getHours()),
      pad(d.getMinutes()),
      pad(d.getSeconds())
    ].join("");
  }

  function downloadText(filename, text, mime="application/json"){
    const blob = new Blob([text], { type:mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value){
    const text = value === null || value === undefined ? "" : String(value);
    return '"' + text.replace(/"/g,'""') + '"';
  }

  function toCsv(rows){
    if(!rows || !rows.length) return "";
    const headers = Object.keys(rows[0]);
    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach(row => {
      lines.push(headers.map(h => csvEscape(row[h])).join(","));
    });
    return "\ufeff" + lines.join("\n");
  }

  async function requireAdmin(){
    const client = getClient();
    if(!client || !client.auth) throw new Error("Supabaseクライアントを確認できません。");

    const { data: userData, error: userError } = await client.auth.getUser();
    if(userError) throw userError;

    currentUser = userData && userData.user ? userData.user : null;
    if(!currentUser) throw new Error("ログイン情報を確認できません。");

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role,email,is_active")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if(profileError) throw profileError;

    if(profile && profile.is_active === false){
      document.body.classList.add("backup-forbidden");
      throw new Error("このアカウントは停止されています。管理者へ確認してください。");
    }

    currentRole = profile && profile.role ? profile.role : null;

    if(currentRole !== "admin"){
      document.body.classList.add("backup-forbidden");
      throw new Error("バックアップ画面は管理者のみ利用できます。");
    }

    setText("currentAdminEmail", currentUser.email || profile?.email || "-");
  }

  async function fetchTable(table){
    const client = getClient();
    const { data, error } = await client.from(table).select("*");
    if(error) throw new Error(`${table}: ${error.message}`);
    return data || [];
  }

  async function buildBackupPayload(type="manual", note=""){
    const tables = {};
    for(const table of TABLES){
      tables[table] = await fetchTable(table);
    }

    const payload = {
      app:"recruit-app",
      backup_version:1,
      backup_type:type,
      created_at:(window.RecruitDate?.nowIso ? window.RecruitDate.nowIso() : new Date().toISOString()),
      created_label:nowLabel(),
      user_email:currentUser?.email || null,
      user_id:currentUser?.id || null,
      role:currentRole,
      note,
      tables
    };

    latestBackupData = payload;
    updateCounts(payload);
    return payload;
  }

  function countOf(payload, table){
    return payload?.tables?.[table]?.length || 0;
  }

  function updateCounts(payload){
    setText("countCandidates", String(countOf(payload,"candidates")));
    setText("countTargets", String(countOf(payload,"recruitment_targets")));
    setText("countCosts", String(countOf(payload,"channel_costs")));
    setText("countCenters", String(countOf(payload,"master_centers")));
    setText("countProfiles", String(countOf(payload,"profiles")));
    setText("lastBackupPreview", payload?.created_label || "-");
  }

  function loadLocalGenerations(){
    try{
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    }catch(e){
      return [];
    }
  }

  function saveLocalGenerations(items){
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items.slice(0,MAX_LOCAL_GENERATIONS)));
  }

  function saveLocalGeneration(payload){
    const items = loadLocalGenerations();
    const item = {
      id:"local_" + Date.now(),
      created_at:payload.created_at,
      created_label:payload.created_label,
      backup_type:payload.backup_type || "manual",
      candidate_count:countOf(payload,"candidates"),
      recruitment_target_count:countOf(payload,"recruitment_targets"),
      channel_cost_count:countOf(payload,"channel_costs"),
      master_center_count:countOf(payload,"master_centers"),
      profile_count:countOf(payload,"profiles"),
      created_by_email:payload.user_email || currentUser?.email || null,
      data_hash:payloadHash(payload),
      payload
    };
    items.unshift(item);
    saveLocalGenerations(items);
    return item;
  }

  async function saveSupabaseBackup(payload){
    const client = getClient();
    const row = {
      backup_type:payload.backup_type || "manual",
      backup_version:payload.backup_version || 1,
      backup_label:payload.created_label,
      created_by:currentUser?.id || null,
      created_by_email:currentUser?.email || null,
      source_app:"recruit-app",
      candidate_count:countOf(payload,"candidates"),
      recruitment_target_count:countOf(payload,"recruitment_targets"),
      channel_cost_count:countOf(payload,"channel_costs"),
      master_center_count:countOf(payload,"master_centers"),
      profile_count:countOf(payload,"profiles"),
      backup_json:payload,
      note:payload.note || null
    };

    const { data, error } = await client
      .from("system_backups")
      .insert(row)
      .select("id,created_at")
      .single();

    if(error) throw error;

    await cleanupSupabaseBackups();
    await renderSupabaseGenerations();

    return data;
  }

  async function cleanupSupabaseBackups(){
    const client = getClient();
    const { data, error } = await client
      .from("system_backups")
      .select("id,created_at")
      .order("created_at", { ascending:false });

    if(error) return;

    const old = (data || []).slice(MAX_SUPABASE_GENERATIONS);
    for(const item of old){
      await client.from("system_backups").delete().eq("id", item.id);
    }
  }

  function generationTotal(item){
    return (item.candidate_count || 0)
      + (item.recruitment_target_count || 0)
      + (item.channel_cost_count || 0)
      + (item.master_center_count || 0)
      + (item.profile_count || 0);
  }

  function generationCountLabel(item){
    return `候補者 ${item.candidate_count || 0} / 目標 ${item.recruitment_target_count || 0} / 媒体費 ${item.channel_cost_count || 0} / 営業所 ${item.master_center_count || 0} / 権限 ${item.profile_count || 0}`;
  }

  function generationTypeLabel(type){
    const map = {
      auto:"AUTO",
      manual:"手動",
      manual_supabase:"手動/Supabase",
      pre_restore:"復元前退避",
      download:"DL用",
      count:"件数確認"
    };
    return map[type] || type || "-";
  }

  function generationTypeClass(type){
    if(type === "auto") return "auto";
    if(type === "pre_restore") return "restore";
    if(String(type || "").includes("manual")) return "manual";
    return "normal";
  }

  function renderGenerationTable(items, source){
    if(!items || !items.length) return "";

    const visibleCount = generationVisibleCount[source] || GENERATION_PAGE_SIZE;
    const visibleItems = items.slice(0, visibleCount);
    const hiddenCount = Math.max(items.length - visibleItems.length, 0);

    const rows = visibleItems.map((item, index) => {
      const id = escapeHtml(item.id);
      const isSupabase = source === "supabase";
      const owner = isSupabase ? (item.created_by_email || "-") : "ブラウザ保存";
      const date = item.backup_label || item.created_label || formatDateTime(item.created_at);
      const type = item.backup_type || "-";
      const latestBadge = index === 0 ? '<span class="generation-latest-badge">最新</span>' : "";
      return `
        <tr class="${index === 0 ? "is-latest" : ""}">
          <td>
            <div class="generation-date-row">
              <div class="generation-date">${escapeHtml(date)}</div>
              ${latestBadge}
            </div>
            <span class="generation-type-pill ${generationTypeClass(type)}">${escapeHtml(generationTypeLabel(type))}</span>
          </td>
          <td>
            <div class="generation-total">${generationTotal(item)}件</div>
            <details class="generation-count-details">
              <summary>内訳を見る</summary>
              <div>${escapeHtml(generationCountLabel(item))}</div>
            </details>
          </td>
          <td><span class="generation-owner">${escapeHtml(owner)}</span></td>
          <td class="generation-action-cell">
            <div class="generation-action-fixed">
              <button type="button" class="btn-sub btn-restore" data-${source}-restore="${id}">復元</button>
              <button type="button" class="btn-sub" data-${source}-download="${id}">DL</button>
              <button type="button" class="btn-sub danger" data-${source}-delete="${id}">削除</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    const moreBlock = hiddenCount > 0 ? `
      <div class="generation-more-row">
        <button type="button" class="btn-sub generation-more-button" data-generation-more="${source}">
          もっと見る（残り${hiddenCount}件）
        </button>
      </div>
    ` : "";

    return `
      <div class="generation-table-wrap">
        <table class="generation-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>件数</th>
              <th>作成者</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${moreBlock}
    `;
  }

  async function renderSupabaseGenerations(){
    const list = $("supabaseGenerationList");
    if(!list) return;

    const client = getClient();
    const { data, error } = await client
      .from("system_backups")
      .select("id,backup_type,backup_label,created_at,created_by_email,candidate_count,recruitment_target_count,channel_cost_count,master_center_count,profile_count")
      .order("created_at", { ascending:false })
      .limit(MAX_SUPABASE_GENERATIONS);

    if(error){
      list.innerHTML = `<div class="empty-state">Supabaseバックアップ未設定、またはSQL未実行です。<br>${escapeHtml(error.message)}</div>`;
      setText("supabaseGenerationCount", "0");
      return;
    }

    const rows = data || [];
    setText("supabaseGenerationCount", String(rows.length));
    if(rows.length && rows[0].backup_label) setText("lastBackupAtHeader", rows[0].backup_label);

    if(!rows.length){
      list.innerHTML = `<div class="empty-state">Supabase保存済みバックアップはまだありません。</div>`;
      return;
    }

    list.innerHTML = renderGenerationTable(rows, "supabase");

    list.querySelectorAll("[data-supabase-download]").forEach(btn => {
      btn.addEventListener("click", () => downloadSupabaseGeneration(btn.dataset.supabaseDownload));
    });

    list.querySelectorAll("[data-supabase-restore]").forEach(btn => {
      btn.addEventListener("click", () => openSupabaseRestoreModal(btn.dataset.supabaseRestore));
    });

    list.querySelectorAll("[data-supabase-delete]").forEach(btn => {
      btn.addEventListener("click", () => deleteSupabaseGeneration(btn.dataset.supabaseDelete));
    });

    list.querySelectorAll("[data-generation-more='supabase']").forEach(btn => {
      btn.addEventListener("click", () => {
        generationVisibleCount.supabase += GENERATION_PAGE_SIZE;
        renderSupabaseGenerations();
      });
    });
  }

  function renderLocalGenerations(){
    const list = $("localGenerationList");
    if(!list) return;

    const items = loadLocalGenerations();
    setText("localGenerationCount", String(items.length));
    if(items.length && items[0].created_label) setText("lastBackupAtHeader", items[0].created_label);

    if(!items.length){
      list.innerHTML = `<div class="empty-state">ブラウザ保存済みバックアップはまだありません。</div>`;
      return;
    }

    list.innerHTML = renderGenerationTable(items, "local");

    list.querySelectorAll("[data-local-download]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = loadLocalGenerations().find(x => x.id === btn.dataset.localDownload);
        if(!target) return;
        downloadText(`recruit_local_backup_${fileTimestamp()}.json`, JSON.stringify(target.payload,null,2));
        showToast("ブラウザ保存バックアップをダウンロードしました。", "success");
      });
    });

    list.querySelectorAll("[data-local-restore]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = loadLocalGenerations().find(x => x.id === btn.dataset.localRestore);
        if(!target) return;
        openRestoreModal(target.payload, "ブラウザ保存バックアップ");
      });
    });

    list.querySelectorAll("[data-local-delete]").forEach(btn => {
      btn.addEventListener("click", () => deleteLocalGeneration(btn.dataset.localDelete));
    });

    list.querySelectorAll("[data-generation-more='local']").forEach(btn => {
      btn.addEventListener("click", () => {
        generationVisibleCount.local += GENERATION_PAGE_SIZE;
        renderLocalGenerations();
      });
    });
  }

  async function deleteSupabaseGeneration(id){
    if(!confirm("このSupabaseバックアップ世代を削除します。削除後は元に戻せません。")) return;
    try{
      setLoading(true, "Supabaseバックアップを削除しています。");
      const client = getClient();
      const { error } = await client.from("system_backups").delete().eq("id", id);
      if(error) throw error;
      await writeAuditLog("backup_delete","system_backups",id,{source:"supabase"});
      await renderSupabaseGenerations();
      setMsg("Supabaseバックアップ世代を削除しました。", "success");
      showToast("バックアップ世代を削除しました。", "success");
    }catch(e){
      setMsg("Supabaseバックアップ削除に失敗しました: " + e.message, "error");
      showToast("削除に失敗しました。", "error");
    }finally{
      setLoading(false);
    }
  }

  async function deleteLocalGeneration(id){
    if(!confirm("このブラウザ保存バックアップ世代を削除します。削除後は元に戻せません。")) return;
    const items = loadLocalGenerations().filter(item => item.id !== id);
    saveLocalGenerations(items);
    await writeAuditLog("backup_delete","local_backups",id,{source:"browser"});
    renderLocalGenerations();
    setMsg("ブラウザ保存バックアップ世代を削除しました。", "success");
    showToast("ブラウザ保存世代を削除しました。", "success");
  }

  async function downloadSupabaseGeneration(id){
    try{
      setLoading(true, "Supabaseバックアップを取得しています。");
      const client = getClient();
    const { data, error } = await client
      .from("system_backups")
      .select("backup_json")
      .eq("id", id)
      .single();

      if(error) throw error;

      downloadText(`recruit_supabase_backup_${fileTimestamp()}.json`, JSON.stringify(data.backup_json,null,2));
      setMsg("Supabaseバックアップをダウンロードしました。", "success");
      showToast("バックアップをダウンロードしました。", "success");
    }catch(e){
      setMsg("Supabaseバックアップの取得に失敗しました: " + e.message, "error");
      showToast("ダウンロードに失敗しました。", "error");
    }finally{
      setLoading(false);
    }
  }

  async function previewSupabaseGeneration(id){
    const payload = await getSupabaseBackupPayload(id);
    if(!payload) return;
    showPreview(payload.backup_json, payload.backup_label || "Supabaseバックアップ");
  }

  async function getSupabaseBackupPayload(id){
    try{
      setLoading(true, "Supabaseバックアップを取得しています。");
      const client = getClient();
      const { data, error } = await client
        .from("system_backups")
        .select("backup_json,backup_label")
        .eq("id", id)
        .single();

      if(error) throw error;
      return data;
    }catch(e){
      setMsg("バックアップ取得に失敗しました: " + e.message, "error");
      showToast("バックアップ取得に失敗しました。", "error");
      return null;
    }finally{
      setLoading(false);
    }
  }

  async function openSupabaseRestoreModal(id){
    const data = await getSupabaseBackupPayload(id);
    if(!data) return;
    openRestoreModal(data.backup_json, data.backup_label || "Supabaseバックアップ");
  }

  function buildRestoreSummary(payload, title){
    const rows = TABLES.map(table => `
      <div class="restore-summary-item">
        <span>${escapeHtml(TABLE_LABELS[table] || table)}</span>
        <strong>${countOf(payload, table)}件</strong>
      </div>
    `).join("");

    return `
      <div class="restore-summary-title">${escapeHtml(title)}</div>
      <div class="restore-summary-sub">作成日時：${escapeHtml(payload.created_label || formatDateTime(payload.created_at))} / 作成者：${escapeHtml(payload.user_email || payload.created_by_email || "-")}</div>
      <div class="restore-summary-grid">${rows}</div>
    `;
  }

  function openRestoreModal(rawPayload, title="バックアップ復元"){
    const payload = normalizeBackupPayload(rawPayload);
    if(!payload){
      setMsg("復元できない形式のバックアップです。", "error");
      showToast("復元形式を確認できません。", "error");
      return;
    }

    const warnings = buildPreviewWarnings(payload);
    if(warnings.length){
      setMsg("復元前にバックアップ形式を確認してください。", "warning");
    }

    restoreState = { payload, title };
    const modal = $("restoreModal");
    const summary = $("restoreModalSummary");
    const subtitle = $("restoreModalSubtitle");
    const input = $("restoreConfirmInput");
    const execute = $("executeRestore");

    if(summary) summary.innerHTML = buildRestoreSummary(payload, title);
    if(subtitle) subtitle.textContent = "復元対象を選び、最終確認を入力してください。";
    document.querySelectorAll(".restore-table-check").forEach(check => { check.checked = true; });
    if(input) input.value = "";
    if(execute) execute.disabled = true;
    if(modal){
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeRestoreModal(){
    const modal = $("restoreModal");
    if(modal){
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
    restoreState = null;
  }

  function getSelectedRestoreTables(){
    return Array.from(document.querySelectorAll(".restore-table-check"))
      .filter(check => check.checked)
      .map(check => check.value)
      .filter(table => TABLES.includes(table));
  }

  async function fetchPrimaryKeys(table){
    const client = getClient();
    const pk = TABLE_PRIMARY_KEYS[table];
    if(!pk) throw new Error(`${TABLE_LABELS[table] || table} の主キー設定を確認できません。`);

    const { data, error } = await client.from(table).select(pk);
    if(error) throw new Error(`${TABLE_LABELS[table] || table} の現データ確認に失敗しました: ${error.message}`);
    return (data || []).map(row => row[pk]).filter(value => value !== null && value !== undefined && value !== "");
  }

  async function deleteRowsByKeys(table, keys){
    if(!keys.length) return;
    const client = getClient();
    const pk = TABLE_PRIMARY_KEYS[table];
    const size = 100;
    for(let i=0; i<keys.length; i+=size){
      const chunk = keys.slice(i, i+size);
      const { error } = await client.from(table).delete().in(pk, chunk);
      if(error) throw new Error(`${TABLE_LABELS[table] || table} の削除に失敗しました: ${error.message}`);
    }
  }

  async function upsertRows(table, rows){
    if(!rows.length) return;
    const client = getClient();
    const pk = TABLE_PRIMARY_KEYS[table];
    const size = 100;
    for(let i=0; i<rows.length; i+=size){
      const chunk = rows.slice(i, i+size);
      const { error } = await client.from(table).upsert(chunk, { onConflict:pk });
      if(error) throw new Error(`${TABLE_LABELS[table] || table} の復元に失敗しました: ${error.message}`);
    }
  }

  async function restoreTable(table, backupRows){
    const pk = TABLE_PRIMARY_KEYS[table];
    const currentKeys = await fetchPrimaryKeys(table);
    const backupKeys = (backupRows || []).map(row => row?.[pk]).filter(value => value !== null && value !== undefined && value !== "");
    const backupKeySet = new Set(backupKeys.map(String));
    const deleteKeys = currentKeys.filter(key => !backupKeySet.has(String(key)));

    await upsertRows(table, backupRows || []);
    await deleteRowsByKeys(table, deleteKeys);
  }

  async function executeRestore(){
    if(!restoreState?.payload){
      setMsg("復元対象を確認できません。", "error");
      return;
    }

    const selectedTables = getSelectedRestoreTables();
    if(!selectedTables.length){
      setMsg("復元対象を1つ以上選択してください。", "warning");
      showToast("復元対象を選択してください。", "error");
      return;
    }

    const confirmInput = $("restoreConfirmInput");
    if((confirmInput?.value || "").trim() !== "復元"){
      setMsg("最終確認欄に『復元』と入力してください。", "warning");
      return;
    }

    const targetText = selectedTables.map(table => TABLE_LABELS[table] || table).join("、");
    if(!window.confirm(`選択した対象（${targetText}）をバックアップ時点へ復元します。実行前に現在データを自動退避します。よろしいですか？`)) return;

    const activeRestore = restoreState;

    try{
      closeRestoreModal();
      setLoading(true, "復元前の現在データを退避しています。");
      setMsg("復元前バックアップを作成しています...", "info");

      const before = await createBackup("before_restore", {
        note:`復元前自動退避：${activeRestore.title || "バックアップ復元"}`,
        force:true
      });

      if(before?.error){
        throw new Error("復元前バックアップに失敗したため、復元を中止しました。");
      }

      setLoading(true, "バックアップを復元しています。");
      for(const table of selectedTables){
        setMsg(`${TABLE_LABELS[table] || table} を復元しています...`, "info");
        await restoreTable(table, getTableRows(activeRestore.payload, table));
      }

      await writeAuditLog("restore_execute","restore",activeRestore.title||"backup",{tables:selectedTables,backup_created_at:activeRestore.payload?.created_at||null,backup_label:activeRestore.title||null});
      await refreshCounts();
      await renderSupabaseGenerations();
      renderLocalGenerations();
      setMsg("復元が完了しました。必要に応じて各画面で表示を確認してください。", "success");
      showToast("復元が完了しました。", "success");
    }catch(e){
      console.error(e);
      setMsg("復元に失敗しました: " + e.message, "error");
      showToast("復元に失敗しました。", "error");
    }finally{
      setLoading(false);
    }
  }

  function normalizeBackupPayload(payload){
    if(!payload || typeof payload !== "object") return null;
    if(payload.tables && typeof payload.tables === "object") return payload;
    if(payload.backup_json && payload.backup_json.tables) return payload.backup_json;
    return null;
  }

  function getTableRows(payload, table){
    return Array.isArray(payload?.tables?.[table]) ? payload.tables[table] : [];
  }

  function summarizeRow(row, table){
    if(!row || typeof row !== "object") return "-";
    const fields = PREVIEW_FIELDS[table] || Object.keys(row).slice(0,4);
    const parts = fields
      .filter(field => row[field] !== null && row[field] !== undefined && row[field] !== "")
      .map(field => `${field}: ${row[field]}`);
    return parts.length ? parts.slice(0,4).join(" / ") : "確認できる代表項目なし";
  }

  function buildPreviewTable(payload){
    return TABLES.map(table => {
      const rows = getTableRows(payload, table);
      const fields = PREVIEW_FIELDS[table] || [];
      const sample = rows.length ? summarizeRow(rows[0], table) : "データなし";
      return `
        <tr>
          <th>${escapeHtml(TABLE_LABELS[table] || table)}</th>
          <td>${rows.length}</td>
          <td>${escapeHtml(fields.join(" / ") || "-")}</td>
          <td>${escapeHtml(sample)}</td>
        </tr>
      `;
    }).join("");
  }

  function buildPreviewWarnings(payload){
    const warnings = [];
    if(payload?.app && payload.app !== "recruit-app") warnings.push("別アプリのバックアップである可能性があります。");
    if(!payload?.backup_version) warnings.push("バックアップバージョンを確認できません。");
    TABLES.forEach(table => {
      if(!Array.isArray(payload?.tables?.[table])) warnings.push(`${TABLE_LABELS[table] || table} のデータ形式を確認できません。`);
    });
    return warnings;
  }

  function showPreview(rawPayload, title="バックアッププレビュー"){
    const box = $("restorePreview");
    if(!box) return;

    const payload = normalizeBackupPayload(rawPayload);
    if(!payload){
      box.innerHTML = `<div class="empty-state error-state">バックアップJSONの形式を確認できません。</div>`;
      setMsg("プレビューできない形式のJSONです。", "error");
      return;
    }

    const warnings = buildPreviewWarnings(payload);
    const warningHtml = warnings.length
      ? `<div class="preview-alert">${warnings.map(w => `<div>・${escapeHtml(w)}</div>`).join("")}</div>`
      : `<div class="preview-safe">形式確認は問題ありません。復元対象として内容確認できます。</div>`;

    box.innerHTML = `
      <div class="preview-title-row">
        <div>
          <div class="preview-title">${escapeHtml(title)}</div>
          <div class="preview-subtitle">作成日時：${escapeHtml(payload.created_label || formatDateTime(payload.created_at))} / 作成者：${escapeHtml(payload.user_email || payload.created_by_email || "-")}</div>
        </div>
        <span class="mini-badge">version ${escapeHtml(payload.backup_version || "-")}</span>
      </div>
      <div class="preview-grid">
        <div><span>候補者</span><strong>${countOf(payload,"candidates")}</strong></div>
        <div><span>採用目標</span><strong>${countOf(payload,"recruitment_targets")}</strong></div>
        <div><span>媒体費</span><strong>${countOf(payload,"channel_costs")}</strong></div>
        <div><span>営業所</span><strong>${countOf(payload,"master_centers")}</strong></div>
        <div><span>権限</span><strong>${countOf(payload,"profiles")}</strong></div>
      </div>
      ${payload.note ? `<div class="preview-memo"><span>メモ</span>${escapeHtml(payload.note)}</div>` : ""}
      ${warningHtml}
      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>対象</th>
              <th>件数</th>
              <th>確認項目</th>
              <th>先頭データ</th>
            </tr>
          </thead>
          <tbody>${buildPreviewTable(payload)}</tbody>
        </table>
      </div>
      <div class="preview-note">内容を確認し、世代一覧の「復元」から復元対象選択と最終確認へ進めます。</div>
    `;

    setMsg("復元プレビューを表示しました。", "success");
  }

  const escapeHtml = (value) => window.escapeHtml(value);

  async function createBackup(type="manual", options={}){
    const isAuto = type === "auto" || type.startsWith("auto_");
    try{
      setLoading(true, isAuto ? "自動バックアップを保存しています。" : "バックアップを保存しています。");
      setMsg(isAuto ? "自動バックアップを作成しています..." : "バックアップを作成しています...", "info");
      const noteInput = $("backupNote") ? $("backupNote").value.trim() : "";
      const note = options.note !== undefined ? options.note : noteInput;
      const payload = await buildBackupPayload(type, note);
      const dataHash = payloadHash(payload);
      const countSignature = payloadCountSignature(payload);
      const meta = readAutoMeta();

      if(isAuto && !options.force && meta.lastDataHash === dataHash){
        writeAutoMeta({
          ...meta,
          lastCountSignature:countSignature,
          lastAutoCheckAt:(window.RecruitDate?.nowIso ? window.RecruitDate.nowIso() : new Date().toISOString()),
          lastAutoCheckLabel:nowLabel(),
          autoStatusLabel:"自動保存確認済"
        });
        setMsg("前回と同一データのため、自動バックアップはスキップしました。", "success");
        setLoading(false);
        return { skipped:true, payload };
      }

      saveLocalGeneration(payload);

      let supabaseSaved = false;
      try{
        await saveSupabaseBackup(payload);
        supabaseSaved = true;
      }catch(e){
        console.warn("Supabase backup skipped:", e);
        setMsg("ブラウザ保存は完了。Supabase保存は未完了です。SQL未実行または権限を確認してください。", "warning");
      }

      const newMeta = {
        ...meta,
        lastDataHash:dataHash,
        lastCountSignature:countSignature,
        lastBackupAt:payload.created_at,
        lastBackupLabel:payload.created_label
      };

      if(isAuto){
        newMeta.lastAutoBackupAt = payload.created_at;
        newMeta.lastAutoBackupLabel = payload.created_label;
        newMeta.autoStatusLabel = "自動保存完了";
      }
      newMeta.lastAutoCheckAt = window.RecruitDate?.nowIso ? window.RecruitDate.nowIso() : new Date().toISOString();
      newMeta.lastAutoCheckLabel = nowLabel();
      writeAutoMeta(newMeta);

      if(supabaseSaved){
        setMsg(isAuto ? "自動バックアップが完了しました。" : "ブラウザ保存＋Supabase保存が完了しました。", "success");
        showToast(isAuto ? "自動バックアップが完了しました。" : "バックアップ保存が完了しました。", "success");
      }

      setText("lastBackupAtHeader", payload.created_label);
      await writeAuditLog("backup_create","system_backups",payload.id,{type:payload.type||type,label:payload.created_label,supabase_saved:supabaseSaved,counts:payload.counts||{}});
      return { skipped:false, payload };
    }catch(e){
      console.error(e);
      setMsg("バックアップ作成に失敗しました: " + e.message, "error");
      showToast("バックアップ保存に失敗しました。", "error");
      return { skipped:false, error:e };
    }finally{
      setLoading(false);
    }
  }

  async function createJsonDownload(){
    try{
      setLoading(true, "JSONファイルを作成しています。");
      setMsg("JSONを作成しています...", "info");
      const payload = latestBackupData || await buildBackupPayload("download");
      downloadText(`recruit_backup_${fileTimestamp()}.json`, JSON.stringify(payload,null,2));
      setMsg("JSONをダウンロードしました。", "success");
      showToast("JSONをダウンロードしました。", "success");
    }catch(e){
      setMsg("JSON出力に失敗しました: " + e.message, "error");
      showToast("JSON出力に失敗しました。", "error");
    }finally{
      setLoading(false);
    }
  }

  async function createCandidateCsv(){
    try{
      setLoading(true, "候補者CSVを作成しています。");
      const payload = latestBackupData || await buildBackupPayload("csv");
      const rows = payload.tables.candidates || [];
      downloadText(`recruit_candidates_${fileTimestamp()}.csv`, toCsv(rows), "text/csv");
      setMsg("候補者CSVをダウンロードしました。", "success");
      showToast("候補者CSVをダウンロードしました。", "success");
    }catch(e){
      setMsg("CSV出力に失敗しました: " + e.message, "error");
      showToast("CSV出力に失敗しました。", "error");
    }finally{
      setLoading(false);
    }
  }

  async function refreshCounts(){
    try{
      setLoading(true, "件数を確認しています。");
      setMsg("件数を確認しています...", "info");
      const payload = await buildBackupPayload("count");
      setMsg("件数確認が完了しました。", "success");
    }catch(e){
      setMsg("件数確認に失敗しました: " + e.message, "error");
    }finally{
      setLoading(false);
    }
  }

  async function runAutoBackupIfNeeded(reason="login"){
    try{
      const payload = latestBackupData || await buildBackupPayload("auto_check", "");
      const meta = readAutoMeta();
      const dataHash = payloadHash(payload);
      const countSignature = payloadCountSignature(payload);
      const lastAutoTime = meta.lastAutoBackupAt ? new Date(meta.lastAutoBackupAt).getTime() : 0;
      const nowTime = Date.now();
      const timeExpired = !lastAutoTime || (nowTime - lastAutoTime) >= AUTO_BACKUP_INTERVAL_MS;
      const dataChanged = meta.lastDataHash && meta.lastDataHash !== dataHash;
      const countChanged = meta.lastCountSignature && meta.lastCountSignature !== countSignature;
      const firstAuto = !meta.lastAutoBackupAt;

      if(firstAuto || timeExpired || dataChanged || countChanged){
        const reasonLabel = firstAuto ? "初回自動保存" : timeExpired ? "24時間経過" : countChanged ? "件数変化" : "データ変化";
        await createBackup("auto", { note:`自動バックアップ：${reasonLabel}（${reason}）`, force:true });
        return;
      }

      writeAutoMeta({
        ...meta,
        lastDataHash:dataHash,
        lastCountSignature:countSignature,
        lastAutoCheckAt:(window.RecruitDate?.nowIso ? window.RecruitDate.nowIso() : new Date().toISOString()),
        lastAutoCheckLabel:nowLabel(),
        autoStatusLabel:"自動保存確認済"
      });
      setMsg("バックアップ状態を確認しました。自動バックアップは最新です。", "success");
    }catch(e){
      console.warn("auto backup check failed:", e);
    }
  }

  window.requestRecruitAutoBackup = function(reason="manual_hook"){
    return runAutoBackupIfNeeded(reason);
  };

  window.addEventListener("recruit:master-updated", () => {
    runAutoBackupIfNeeded("master_updated");
  });

  function bindEvents(){
    const map = {
      createGenerationBackup: () => createBackup("manual"),
      createSupabaseBackup: () => createBackup("manual_supabase"),
      downloadFullJson: createJsonDownload,
      downloadCandidatesCsv: createCandidateCsv,
      refreshBackupCounts: refreshCounts,
      refreshSupabaseGenerations: renderSupabaseGenerations
    };

    Object.entries(map).forEach(([id, handler]) => {
      const el = $(id);
      if(el) el.addEventListener("click", handler);
    });

    const restoreJsonFile = $("restoreJsonFile");
    if(restoreJsonFile){
      restoreJsonFile.addEventListener("change", previewJsonFile);
    }

    document.querySelectorAll("[data-restore-close]").forEach(el => {
      el.addEventListener("click", closeRestoreModal);
    });

    const restoreConfirmInput = $("restoreConfirmInput");
    const executeRestoreButton = $("executeRestore");
    if(restoreConfirmInput && executeRestoreButton){
      restoreConfirmInput.addEventListener("input", () => {
        executeRestoreButton.disabled = restoreConfirmInput.value.trim() !== "復元";
      });
    }
    if(executeRestoreButton){
      executeRestoreButton.addEventListener("click", executeRestore);
    }
  }

  function previewJsonFile(event){
    const file = event?.target?.files?.[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try{
        const payload = JSON.parse(String(reader.result || ""));
        showPreview(payload, `手元JSON：${file.name}`);
      }catch(e){
        setMsg("JSONファイルの読み込みに失敗しました: " + e.message, "error");
      }finally{
        event.target.value = "";
      }
    };
    reader.onerror = () => {
      setMsg("JSONファイルを読み込めませんでした。", "error");
      event.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  }

  async function init(){
    try{
      await requireAdmin();
      bindEvents();
      updateAutoBackupHeader();
      renderLocalGenerations();
      await renderSupabaseGenerations();
      await refreshCounts();
      await runAutoBackupIfNeeded("login");
    }catch(e){
      console.error(e);
      setMsg(e.message, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
