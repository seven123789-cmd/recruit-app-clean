const sb = window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : null;

let currentUser = null;
let currentRole = null;
let candidateId = null;
let currentCandidate = null;
let candidateIdList = [];
let currentIndex = -1;
let CENTER_MASTER = {};
let DIVISION_OPTIONS = [];
let JOB_TYPE_OPTIONS = [];
let CHANNEL_OPTIONS = [];
let CHANNEL_DETAIL_OPTIONS = [];
let STATUS_OPTIONS = [];
const STAGE_STATUS_OPTIONS = window.RECRUIT_STAGE_STATUSES || ["応募","書類選考","アポ取得","面接設定","面接実施","内定","採用"];
const HIRING_RESULT_OPTIONS = window.RECRUIT_HIRING_RESULTS || ["進行中","保留","辞退","不採用","不通","採用","入社済"];
let DECLINE_REASON_OPTIONS = [];
let REJECT_REASON_OPTIONS = [];

let isDirty = false;

function setSaveStatus(state, message) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  if (state === "unsaved") {
    el.className = "save-status-bar unsaved";
    el.innerHTML = '<span>● 未保存</span><span class="save-status-sub">保存せずに移動すると変更が失われます</span>';
  } else {
    el.className = "save-status-bar saved";
    el.innerHTML = '<span>✓ ' + escapeHtml(message || "保存済み") + '</span><span class="save-status-sub">変更すると未保存表示に変わります</span>';
  }
}

function markDirty() {
  if (!currentCandidate) return;
  isDirty = true;
  setSaveStatus("unsaved");
}

function markSaved(message = "保存済み") {
  isDirty = false;
  setSaveStatus("saved", message);
}


function showErrorModal(message, title = "保存できません") {
  return new Promise((resolve) => {
    const overlay = document.getElementById("detailModal");
    const head = document.getElementById("detailModalHead");
    const body = document.getElementById("detailModalBody");
    const okBtn = document.getElementById("detailModalOk");

    head.textContent = title;
    body.textContent = message;
    overlay.classList.add("show");

    okBtn.onclick = () => {
      overlay.classList.remove("show");
      okBtn.onclick = null;
      resolve();
    };
  });
}

// 成功ポップ（1秒で消える）
function showSuccessModal(message = "保存しました") {
  const overlay = document.getElementById("detailModal");
  const head = document.getElementById("detailModalHead");
  const body = document.getElementById("detailModalBody");
  const okBtn = document.getElementById("detailModalOk");

  head.textContent = "完了";
  head.classList.remove("error");
  head.style.background = "#dcfce7";
  head.style.color = "#166534";

  body.textContent = message;
  overlay.classList.add("show");

  // クリックでも閉じれる
  okBtn.onclick = () => {
    overlay.classList.remove("show");
    resetModal();
  };

  // 2秒後に自動で閉じる
  setTimeout(() => {
    overlay.classList.remove("show");
    resetModal();
  }, 2000);
}

// モーダル初期化
function resetModal() {
  const head = document.getElementById("detailModalHead");
  const okBtn = document.getElementById("detailModalOk");

  head.classList.add("error");
  head.style.background = "";
  head.style.color = "";
  okBtn.onclick = null;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function valueOrBlank(value) {
  return value ?? "";
}


function getStatusBadge(status) {
  const text = status || "未設定";
  const cls = status ? "badge-" + status : "badge-empty";
  return '<span class="badge ' + cls + '">' + escapeHtml(text) + '</span>';
}

function showAuth(message = "未ログインです", type = "info") {
  document.getElementById("authScreen").classList.remove("hidden");
  document.getElementById("appScreen").classList.add("hidden");
  document.getElementById("loginPassword").value = "";
  currentUser = null;
  setAuthMessage(message, type);
  document.body.classList.remove("auth-checking");
}

async function ensureUserProfile(user){
  if(!user?.id) return "editor";
  const email=user.email||"";
  const now=window.RecruitDate?.nowIso ? window.RecruitDate.nowIso() : new Date().toISOString();
  const {data,error}=await sb.from("profiles").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(data){
    if(data.is_active===false){
      showAuth("このアカウントは停止されています。管理者へ確認してください", "error");
      return "viewer";
    }
    return data.role||"editor";
  }
  if(error&&error.code!=="PGRST116") throw error;
  const payload={
    user_id:user.id,
    email,
    role:"editor",
    is_active:true,
    created_at:now,
    updated_at:now
  };
  const {error:insertError}=await sb.from("profiles").insert(payload);
  if(insertError&&insertError.code!=="23505") throw insertError;
  return "editor";
}
async function getCurrentRole(userId){
  if(currentRole) return currentRole;
  try{
    const user=await getSessionUser();
    if(user?.id&&String(user.id)===String(userId)){
      currentRole=await ensureUserProfile(user);
    }else{
      const {data,error}=await sb.from("profiles").select("role,is_active").eq("user_id",userId).maybeSingle();
      if(error&&error.code!=="PGRST116") throw error;
      if(data && data.is_active===false){
        showAuth("このアカウントは停止されています。管理者へ確認してください", "error");
        return "viewer";
      }
      currentRole=data?.role||"viewer";
    }
  }catch(e){
    currentRole="viewer";
  }
  if(window.RecruitOpsGuard) window.RecruitOpsGuard.setRole(currentRole);
  return currentRole;
}

async function showApp(user) {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appScreen").classList.remove("hidden");
  currentUser = user;
  const role = await getCurrentRole(user.id);
  if(window.RecruitRole) window.RecruitRole.apply(role);
  document.body.classList.remove("auth-checking");
}

async function getSessionUser() {
  if (currentUser) return currentUser;
  if (!sb || !sb.auth) {
    showAuth("認証クライアントを初期化できませんでした。ページを再読み込みしてください", "error");
    return null;
  }

  const { data: { session }, error } = await sb.auth.getSession();
  if (error || !session?.user) return null;

  currentUser = session.user;
  return currentUser;
}

async function refreshAuthState() {
  const user = await getSessionUser();

  if (!user) {
    showAuth("未ログインです", "info");
    return false;
  }

  await showApp(user);
  return true;
}


function isAllowedEmailDomain(email){
  return /^[A-Za-z0-9._%+-]+@sline\.co\.jp$/i.test(email);
}
function validatePassword(password){
  if (password.length < 8) return "パスワードは8文字以上にしてください";
  if (!/[A-Z]/.test(password)) return "パスワードに大文字を1文字以上含めてください";
  if (!/[a-z]/.test(password)) return "パスワードに小文字を1文字以上含めてください";
  if (!/[0-9]/.test(password)) return "パスワードに数字を1文字以上含めてください";
  return null;
}
async function signup(){
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!email || !password) {
    setAuthMessage("メールアドレスとパスワードを入力してください", "error");
    return;
  }
  if (!isAllowedEmailDomain(email)) {
    setAuthMessage("@sline.co.jp のメールアドレスのみ登録できます", "error");
    return;
  }
  const pwError = validatePassword(password);
  if (pwError) {
    setAuthMessage(pwError, "error");
    return;
  }
  try {
    if (!sb || !sb.auth) throw new Error("認証クライアントを初期化できませんでした。ページを再読み込みしてください");
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    if (data?.user) {
      try {
        await ensureUserProfile(data.user);
      } catch (profileError) {
        console.warn("プロフィール作成はログイン時に再実行します", profileError);
      }
    }
    setAuthMessage("新規登録しました。初回は editor で権限マスタへ作成されます。ログイン後に表示されない場合は、管理者へ権限確認を依頼してください。", "success");
  } catch (e) {
    setAuthMessage("新規登録失敗: " + (e.message || e), "error");
  }
}
async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    setAuthMessage("メールアドレスとパスワードを入力してください", "error");
    return;
  }

  try {
    if (!sb || !sb.auth) throw new Error("認証クライアントを初期化できませんでした。ページを再読み込みしてください");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    currentUser = null;
    const ok = await refreshAuthState();
    if (!ok) throw new Error("ログイン後の認証状態取得に失敗しました");

    setPageMessage("ログインしました", "success");
    await loadCandidate();
  } catch (e) {
    setAuthMessage("ログイン失敗: " + (e.message || e), "error");
  }
}

async function logout() {
  try {
    if (sb && sb.auth) await sb.auth.signOut();
  } catch (e) {
    console.error(e);
  } finally {
    currentUser = null;
    showAuth("ログアウトしました", "success");
  }
}


async function loadCenterMaster(){
  if(window.RecruitMaster && typeof window.RecruitMaster.loadCenterMaster === "function"){
    return await window.RecruitMaster.loadCenterMaster({
      assignCenterMaster: value => { CENTER_MASTER = value || {}; },
      assignDivisions: value => { DIVISION_OPTIONS = normalizeMasterOptions(value || Object.keys(CENTER_MASTER)); }
    });
  }
  CENTER_MASTER = {};
  DIVISION_OPTIONS = [];
  return [];
}

function inferDivisionByCenterName(centerName){
  const center = String(centerName || "").trim();
  if (!center) return "";

  for (const [division, centers] of Object.entries(CENTER_MASTER || {})) {
    if ((centers || []).map(v => String(v || "").trim()).includes(center)) {
      return division;
    }
  }
  return "";
}

function ensureSelectOption(select, value, labelSuffix){
  if (!select) return;
  const normalized = String(value || "").trim();
  if (!normalized) return;

  const exists = Array.from(select.options || []).some(option => option.value === normalized);
  if (exists) return;

  const option = document.createElement("option");
  option.value = normalized;
  option.textContent = normalized + (labelSuffix || "");
  select.appendChild(option);
}


async function fetchMasterOptionRows(tableName){
  const map = {
    master_job_types:"jobTypes",
    master_channels:"channels",
    master_channel_details:"channelDetails",
    master_statuses:"statuses",
    master_decline_reasons:"declineReasons",
    master_reject_reasons:"rejectReasons",
    master_owners:"owners"
  };
  const key = map[tableName];
  if (key && window.RecruitMaster && typeof window.RecruitMaster.list === "function") {
    return await window.RecruitMaster.list(key);
  }
  // RecruitMaster がまだ起動していない時だけ既存DBへフォールバック。
  // 通常画面では直接 master_* を読まず、common.js の RecruitMaster を入口にする。
  try {
    const { data, error } = await sb
      .from(tableName)
      .select("name, display_order, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending:true })
      .order("name", { ascending:true });
    if (error) throw error;
    return (data || []).map(row => String(row.name || "").trim()).filter(Boolean);
  } catch (e) {
    console.warn(tableName + " 読込失敗", e);
    return [];
  }
}

async function loadOptionMasters(){
  const masters = window.RecruitMaster && typeof window.RecruitMaster.load === "function"
    ? await window.RecruitMaster.load(false)
    : null;

  if (masters) {
    JOB_TYPE_OPTIONS = normalizeMasterOptions(masters.jobTypes);
    CHANNEL_OPTIONS = normalizeMasterOptions(masters.channels);
    CHANNEL_DETAIL_OPTIONS = normalizeMasterOptions(masters.channelDetails);
    STATUS_OPTIONS = window.mergeRecruitStatusNames ? window.mergeRecruitStatusNames(masters.statuses) : normalizeMasterOptions(masters.statuses);
    DECLINE_REASON_OPTIONS = normalizeMasterOptions(masters.declineReasons);
    REJECT_REASON_OPTIONS = normalizeMasterOptions(masters.rejectReasons);
  } else {
    const [jobTypes, channels, channelDetails, statuses, declineReasons, rejectReasons] = await Promise.all([
      fetchMasterOptionRows("master_job_types"),
      fetchMasterOptionRows("master_channels"),
      fetchMasterOptionRows("master_channel_details"),
      fetchMasterOptionRows("master_statuses"),
      fetchMasterOptionRows("master_decline_reasons"),
      fetchMasterOptionRows("master_reject_reasons")
    ]);
    JOB_TYPE_OPTIONS = normalizeMasterOptions(jobTypes);
    CHANNEL_OPTIONS = normalizeMasterOptions(channels);
    CHANNEL_DETAIL_OPTIONS = normalizeMasterOptions(channelDetails);
    STATUS_OPTIONS = window.mergeRecruitStatusNames ? window.mergeRecruitStatusNames(statuses) : normalizeMasterOptions(statuses);
    DECLINE_REASON_OPTIONS = normalizeMasterOptions(declineReasons);
    REJECT_REASON_OPTIONS = normalizeMasterOptions(rejectReasons);
  }

  renderJobTypeOptions();
  renderChannelOptions();
  renderChannelDetailOptions();
  renderDetailMasterSelect("status", STATUS_OPTIONS, "選択");
  renderHiringResultOptions();
  renderDetailMasterSelect("declineReason", DECLINE_REASON_OPTIONS, "未選択");
  renderDetailMasterSelect("rejectReason", REJECT_REASON_OPTIONS, "未選択");
  if (window.RecruitMaster && typeof window.RecruitMaster.applyToPage === "function" && masters) {
    window.RecruitMaster.applyToPage(masters);
  }
}

function normalizeMasterOptions(values){
  return [...new Set((values || []).map(v => String(v || "").trim()).filter(Boolean))]
    .filter(name => !(window.isDeprecatedRecruitStatus && window.isDeprecatedRecruitStatus(name)));
}

function renderJobTypeOptions(){
  const wrap = document.getElementById("jobTypeChoiceWrap");
  if (!wrap) return;
  wrap.innerHTML = JOB_TYPE_OPTIONS.map(name => {
    return '<button class="choice-pill" type="button" data-job-type="' + escapeAttr(name) + '" onclick="setJobType(\'' + escapeAttr(name) + '\')">' + escapeHtml(name) + '</button>';
  }).join("");
}

function renderChannelOptions(){
  const select = document.getElementById("channel");
  if (!select) return;
  const current = select.dataset.currentValue || select.value || "";
  select.innerHTML = '<option value="">選択</option>' + CHANNEL_OPTIONS.map(name => '<option value="' + escapeAttr(name) + '">' + escapeHtml(name) + '</option>').join("");
  select.value = current && CHANNEL_OPTIONS.includes(current) ? current : "";
  delete select.dataset.currentValue;
  toggleChannelFreeInput();
}

function renderChannelDetailOptions(){
  const list = document.getElementById("channelDetailList");
  if (!list) return;
  list.innerHTML = CHANNEL_DETAIL_OPTIONS.map(name => '<option value="' + escapeAttr(name) + '">').join("");
}

function normalizeDetailStageStatus(value){
  const raw = String(value || "").trim();
  if (window.normalizeRecruitStageStatus) return window.normalizeRecruitStageStatus(raw);
  if (STAGE_STATUS_OPTIONS.includes(raw)) return raw;
  if (raw === "入社") return "採用";
  if (["辞退","不採用","不通","保留"].includes(raw)) return "";
  return raw;
}

function normalizeDetailHiringResult(value){
  const raw = String(value || "").trim();
  if (window.normalizeRecruitHiringResult) return window.normalizeRecruitHiringResult(raw);
  if (raw === "合格") return "採用";
  if (!raw || raw === "未設定" || raw === "進行中") return "進行中";
  if (raw === "合格") return "採用";
  return HIRING_RESULT_OPTIONS.includes(raw) ? raw : "進行中";
}

function normalizeDetailCandidateRow(row){
  const source = row || {};
  if (window.normalizeRecruitCandidateState) return window.normalizeRecruitCandidateState(source);

  const out = { ...source };
  const status = String(out.status || "").trim();
  const result = normalizeDetailHiringResult(out.hiring_result);

  if (out.join_date) {
    out.status = "採用";
    out.hiring_result = "入社済";
  } else if (status === "入社") {
    out.status = "採用";
    out.hiring_result = "入社済";
  } else if (["保留","辞退","不採用","不通"].includes(status)) {
    out.hiring_result = result === "進行中" ? status : result;
    if (out.interview_done_date) out.status = "面接実施";
    else if (out.interview1_date) out.status = "面接設定";
    else if (out.appointment_date) out.status = "アポ取得";
    else out.status = "応募";
  } else {
    out.status = normalizeDetailStageStatus(status);
    out.hiring_result = result;
  }
  return out;
}

function getAllowedHiringResultsForStatus(statusValue){
  const status = normalizeDetailStageStatus(statusValue || document.getElementById("status")?.value || "");
  if (window.recruitAllowedHiringResults) return window.recruitAllowedHiringResults(status);
  const map = {
    "応募": ["進行中","保留","不通","辞退"],
    "書類選考": ["進行中","保留","不採用","不通","辞退"],
    "アポ取得": ["進行中","保留","不採用","不通","辞退"],
    "面接設定": ["進行中","保留","不採用","不通","辞退"],
    "面接実施": ["進行中","保留","不採用","辞退","採用"],
    "内定": ["進行中","保留","辞退","採用"],
    "採用": ["採用","入社済","辞退"]
  };
  return (map[status] || HIRING_RESULT_OPTIONS).slice();
}

function normalizeDetailResultForStatus(statusValue, resultValue){
  const status = normalizeDetailStageStatus(statusValue || "");
  const result = normalizeDetailHiringResult(resultValue || "");
  if (window.normalizeRecruitResultForStatus) return window.normalizeRecruitResultForStatus(status, result);
  const allowed = getAllowedHiringResultsForStatus(status);
  if (allowed.includes(result)) return result;
  return status === "採用" ? "採用" : "進行中";
}

function renderHiringResultOptions(){
  const select = document.getElementById("hiringResult");
  if (!select) return;
  const status = normalizeDetailStageStatus(document.getElementById("status")?.value || "");
  const current = normalizeDetailHiringResult(select.dataset.currentValue || select.value || "");
  const list = getAllowedHiringResultsForStatus(status);
  const nextValue = list.includes(current) ? current : normalizeDetailResultForStatus(status, current);
  select.innerHTML = list.map(name => '<option value="' + escapeAttr(name) + '">' + escapeHtml(name) + '</option>').join("");
  select.value = list.includes(nextValue) ? nextValue : (list[0] || "進行中");
  delete select.dataset.currentValue;
}

function renderDetailMasterSelect(id, values, blankLabel){
  const select = document.getElementById(id);
  if (!select) return;
  let current = select.dataset.currentValue || select.value || "";
  let list = normalizeMasterOptions(values);
  if (id === "status") {
    list = window.mergeRecruitStatusNames ? window.mergeRecruitStatusNames(list) : STAGE_STATUS_OPTIONS.slice();
    current = normalizeDetailStageStatus(current);
  }
  let html = '<option value="">' + escapeHtml(blankLabel || "選択") + '</option>';
  list.forEach(name => {
    html += '<option value="' + escapeAttr(name) + '">' + escapeHtml(name) + '</option>';
  });
  if (current && !list.includes(current) && id !== "status") {
    html += '<option value="' + escapeAttr(current) + '">' + escapeHtml(current) + '（現在値）</option>';
  }
  select.innerHTML = html;
  select.value = current && list.includes(current) ? current : "";
  delete select.dataset.currentValue;
}

function setSelectValuePreserve(id, value){
  const select = document.getElementById(id);
  if (!select) return;
  let normalized = valueOrBlank(value);
  if (id === "status") normalized = normalizeDetailStageStatus(normalized);
  if (id === "hiringResult") normalized = normalizeDetailHiringResult(normalized);
  if (normalized && ![...select.options].some(option => option.value === normalized) && id !== "status" && id !== "hiringResult") {
    const option = document.createElement("option");
    option.value = normalized;
    option.textContent = normalized + "（現在値）";
    select.appendChild(option);
  }
  select.value = normalized || (id === "hiringResult" ? "進行中" : "");
  select.dataset.currentValue = normalized;
}

function syncOtherInputRow(rowId){
  const row = document.getElementById(rowId);
  if (!row) return;
  const hasVisibleInput = Array.from(row.children).some(child => !child.classList.contains("hidden"));
  row.classList.toggle("hidden", !hasVisibleInput);
}


function updateEntryCenterOptions(){
  const division = document.getElementById("division")?.value || "";
  const centerSelect = document.getElementById("centerName");
  if (!centerSelect) return;

  const currentCenter = String(centerSelect.dataset.currentValue || centerSelect.value || "").trim();

  if (!division || !CENTER_MASTER[division]) {
    centerSelect.innerHTML = '<option value="">本部を選択してください</option>';
    ensureSelectOption(centerSelect, currentCenter, "（現在値）");
    centerSelect.value = currentCenter || "";
  } else {
    centerSelect.innerHTML = '<option value="">選択</option>';
    CENTER_MASTER[division].forEach(center => {
      centerSelect.innerHTML += '<option value="' + escapeAttr(center) + '">' + escapeHtml(center) + '</option>';
    });
    ensureSelectOption(centerSelect, currentCenter, "（現在値）");
    centerSelect.value = currentCenter || "";
  }

  delete centerSelect.dataset.currentValue;
  toggleDivisionFreeInput();
  toggleEntryCenterFreeInput();
}

function toggleDivisionFreeInput(){
  const wrap = document.getElementById("divisionFreeWrap");
  if (wrap) wrap.classList.add("hidden");
  syncOtherInputRow("divisionCenterOtherRow");
}

function toggleEntryCenterFreeInput(){
  const wrap = document.getElementById("entryCenterFreeWrap");
  if (wrap) wrap.classList.add("hidden");
  syncOtherInputRow("divisionCenterOtherRow");
}

function toggleChannelFreeInput(){
  const wrap = document.getElementById("channelFreeWrap");
  if (wrap) wrap.classList.add("hidden");
  syncOtherInputRow("channelOtherRow");
}


function setDivisionAndCenterForDetail(division, centerName){
  const divisionSelect = document.getElementById("division");
  const centerSelect = document.getElementById("centerName");
  if (!divisionSelect || !centerSelect) return;

  const center = String(centerName || "").trim();
  let div = String(division || "").trim();

  if (!div && center) {
    div = inferDivisionByCenterName(center);
  }

  ensureSelectOption(divisionSelect, div, DIVISION_OPTIONS.includes(div) ? "" : "（現在値）");
  divisionSelect.value = div || "";
  centerSelect.dataset.currentValue = center;
  updateEntryCenterOptions();
}

function setChannelForDetail(channel){
  const channelSelect = document.getElementById("channel");
  if (!channelSelect) return;

  const value = String(channel || "").trim();
  const options = Array.from(channelSelect.options).map(opt => opt.value);
  channelSelect.value = value && options.includes(value) ? value : "";
  toggleChannelFreeInput();
}

function getOwnerMasterOptions(){
  return Array.from(document.querySelectorAll("#ownerChoiceWrap .choice-pill"))
    .map(btn => String(btn.dataset.ownerName || "").trim())
    .filter(Boolean);
}

function isOwnerInMasterOptions(ownerName){
  const value = String(ownerName || "").trim();
  return !!value && getOwnerMasterOptions().includes(value);
}

function setOwnerForDetail(ownerName){
  const value = ownerName || "";
  if (isOwnerInMasterOptions(value)) {
    setOwner(value);
  } else if (value) {
    setOwner("その他");
    const free = document.getElementById("ownerNameFree");
    if (free) free.value = value;
  } else {
    setOwner("");
  }
}

function setJobTypeForDetail(jobType){
  const value = jobType || "";
  if (JOB_TYPE_OPTIONS.includes(value)) {
    setJobType(value);
  } else if (value) {
    setJobType("その他");
    const free = document.getElementById("jobTypeFree");
    if (free) free.value = value;
  } else {
    setJobType("");
  }
}


function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === "SELECT") {
    setSelectValuePreserve(id, value);
    return;
  }
  el.value = valueOrBlank(value);
}

function getActionAdvice(row) {
  // 応募者詳細も common.js / RecruitRule の正式ルールだけを使う。
  // ここに独自判定を置くと、Dashboard・LISTと理由や件数がズレる。
  const actionAdvice = window.RecruitRule?.getActionAdvice
    ? window.RecruitRule.getActionAdvice(row)
    : (window.getRecruitActionAdvice ? window.getRecruitActionAdvice(row) : null);
  if (actionAdvice) return actionAdvice;

  const qualityAdvice = window.RecruitRule?.getDataQualityAdvice
    ? window.RecruitRule.getDataQualityAdvice(row)
    : (window.getRecruitDataQualityAdvice ? window.getRecruitDataQualityAdvice(row) : null);
  return qualityAdvice || null;
}
function updateActionPriority(level) {
  const normalized = String(level || "normal").trim() || "normal";
  const labelMap = {
    danger: "高",
    warning: "中",
    caution: "注意",
    normal: "通常"
  };
  const chip = document.getElementById("actionPriorityChip");
  const label = document.getElementById("actionPriorityLabel");
  const text = labelMap[normalized] || labelMap.normal;

  if (chip) {
    chip.classList.remove("priority-danger", "priority-warning", "priority-caution", "priority-normal");
    chip.classList.add("priority-" + (labelMap[normalized] ? normalized : "normal"));
    chip.textContent = "優先度：" + text;
  }

  if (label) {
    label.textContent = text;
  }
}

function renderActionAdvice(row) {
  const card = document.getElementById("actionAdviceCard");
  const reasonEl = document.getElementById("actionReasonText");
  const actionEl = document.getElementById("nextActionText");
  const impactEl = document.getElementById("actionImpactText");
  const inlineSummaryEl = document.getElementById("actionInlineSummary");

  if (!card || !reasonEl || !actionEl) return;

  const advice = getActionAdvice(row);

  card.classList.remove("action-danger", "action-warning", "action-caution");

  if (!advice) {
    updateActionPriority("normal");
    card.classList.add("hidden");
    reasonEl.textContent = "-";
    actionEl.textContent = "-";
    if (impactEl) impactEl.textContent = "-";
    if (inlineSummaryEl) inlineSummaryEl.textContent = "対応不要";
    return;
  }

  updateActionPriority(advice.level);

  if (advice.level === "danger") {
    card.classList.add("action-danger");
  } else if (advice.level === "warning") {
    card.classList.add("action-warning");
  } else {
    card.classList.add("action-caution");
  }

  reasonEl.textContent = advice.reason;
  actionEl.textContent = advice.action;
  if (impactEl) impactEl.textContent = advice.impact || "要対応一覧に残り続けます。";
  if (inlineSummaryEl) inlineSummaryEl.textContent = advice.reason + " ・ " + advice.action;
  card.classList.remove("hidden");
  applyActionAdviceDefaultState();
}


function applyActionAdviceDefaultState() {
  const card = document.getElementById("actionAdviceCard");
  if (!card) return;
  card.classList.remove("action-collapsed");
}

function toggleActionAdvice() {
  const card = document.getElementById("actionAdviceCard");
  if (!card || card.classList.contains("hidden")) return;
  card.classList.toggle("action-collapsed");
}

function fillCandidate(row) {
  row = normalizeDetailCandidateRow(row);
  currentCandidate = row;

  document.getElementById("pageTitle").textContent = row.name ? row.name + " さんの詳細" : "応募者詳細";

  document.getElementById("summaryName").textContent = row.name || "-";
  document.getElementById("summaryStatus").innerHTML = getStatusBadge(row.status);
 document.getElementById("summaryOwner").textContent = row.owner_name || "-";
  document.getElementById("summaryNextActionDate").textContent = formatDate(row.next_action_date);

  setFieldValue("name", row.name);
  setFieldValue("age", row.age);
  setDivisionAndCenterForDetail(row.division, row.center_name);
  setChannelForDetail(row.channel);
  setFieldValue("channelDetail", row.channel_detail);
  setOwnerForDetail(row.owner_name);
  setJobTypeForDetail(row.job_type);

  setFieldValue("appliedDate", row.applied_date);
  setFieldValue("appointmentDate", row.appointment_date);
  setFieldValue("interviewScheduledDate", row.interview1_date);
  setFieldValue("interviewDoneDate", row.interview_done_date);
  setFieldValue("offerDate", row.offer_date);
  setFieldValue("joinDate", row.join_date);
  setFieldValue("status", row.status);
  renderDetailMasterSelect("status", STATUS_OPTIONS, "選択");
  const hiringResultSelect = document.getElementById("hiringResult");
  if (hiringResultSelect) hiringResultSelect.dataset.currentValue = normalizeDetailHiringResult(row.hiring_result);
  renderHiringResultOptions();
  setFieldValue("rejectReason", row.reject_reason);
  renderDetailMasterSelect("rejectReason", REJECT_REASON_OPTIONS, "未選択");
  setFieldValue("declineReason", row.decline_reason);
  renderDetailMasterSelect("declineReason", DECLINE_REASON_OPTIONS, "未選択");
  setFieldValue("lastActionDate", row.last_action_date);
  const lastActionDateDisplay = document.getElementById("lastActionDateDisplay");
  if (lastActionDateDisplay) lastActionDateDisplay.textContent = formatDate(row.last_action_date);
  setFieldValue("nextActionDate", row.next_action_date);
  setFieldValue("evaluation", row.evaluation);
  setFieldValue("evaluationComment", row.evaluation_comment);
  setFieldValue("actionMemo", row.action_memo);

syncJoinDateAndHiringResult({ showMessage:false });
renderActionAdvice(row);
}

function updateMoveButtons() {
  const prevBtn = document.getElementById("btnPrev");
  const nextBtn = document.getElementById("btnNext");

  if (!prevBtn || !nextBtn) return;

  prevBtn.disabled = currentIndex <= 0;
  nextBtn.disabled = currentIndex >= candidateIdList.length - 1;
}

function restoreCandidateOrderFromList() {
  try {
    const raw = localStorage.getItem("recruit_list_current_order");
    if (!raw) return [];

    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids : [];
  } catch (e) {
    console.error("一覧順の読込に失敗しました", e);
    return [];
  }
}

function renderListContext() {
  const row = document.getElementById("listContextRow");
  if (!row) return;

  let state = null;
  let order = [];

  try {
    const rawState = localStorage.getItem("recruit_list_filter_state");
    state = rawState ? JSON.parse(rawState) : null;
  } catch (e) {
    state = null;
  }

  try {
    const rawOrder = localStorage.getItem("recruit_list_current_order");
    order = rawOrder ? JSON.parse(rawOrder) : [];
    if (!Array.isArray(order)) order = [];
  } catch (e) {
    order = [];
  }

  const listFilterLabel = state?.listFilter === "action" ? "要対応のみ" : "全件";
  const sortLabel = state?.sortMode === "action" ? "対応順" : "応募順";

  const yearLabel = state?.year ? state.year + "年" : "全期間";
  const monthLabel = state?.month ? Number(state.month) + "月" : "全月";
  const divisionLabel = state?.division || "全部";
  const centerLabel = state?.center || "全営業所";
  const ownerLabel = state?.owner || "全担当";
  const channelLabel = state?.channel || "全媒体";

  row.innerHTML = `
    <span class="context-pill orange">対象：${escapeHtml(listFilterLabel)}</span>
    <span class="context-pill">表示順：${escapeHtml(sortLabel)}</span>
   <span class="context-pill gray">一覧件数：${order.length}件</span>
<span class="context-pill orange">現在位置：${currentIndex >= 0 ? currentIndex + 1 : "-"} / ${order.length}件</span>
    <span class="context-pill gray">年度：${escapeHtml(yearLabel)}</span>
    <span class="context-pill gray">月：${escapeHtml(monthLabel)}</span>
    <span class="context-pill gray">本部：${escapeHtml(divisionLabel)}</span>
    <span class="context-pill gray">営業所：${escapeHtml(centerLabel)}</span>
    <span class="context-pill gray">担当：${escapeHtml(ownerLabel)}</span>
    <span class="context-pill gray">媒体：${escapeHtml(channelLabel)}</span>
  `;
}

async function moveActionCandidate(step) {
  try {
    let orderedIds = candidateIdList || [];

    if (!orderedIds.length) {
      const rawOrder = localStorage.getItem("recruit_list_current_order");
      orderedIds = rawOrder ? JSON.parse(rawOrder) : [];
    }

    orderedIds = Array.isArray(orderedIds) ? orderedIds.map(id => String(id)) : [];

    if (!orderedIds.length) {
      alert("一覧順が取得できません。一度、一覧画面から開き直してください。");
      return;
    }

    const { data, error } = await sb
      .from("candidates")
      .select("id,status,next_action_date,hiring_result,is_deleted,join_date,offer_date,decline_reason,reject_reason,action_memo")
      .eq("is_deleted", false);

    if (error) throw error;

    const rows = data || [];
    const rowMap = new Map(rows.map(row => [String(row.id), row]));

    function isActionRow(row) {
      if (!row) return false;
      return window.RecruitRule?.isActionRequired
        ? window.RecruitRule.isActionRequired(row)
        : (window.isRecruitActionRequired ? window.isRecruitActionRequired(row) : false);
    }
    const currentIdText = String(candidateId);
    const currentPos = orderedIds.indexOf(currentIdText);

    if (currentPos === -1) {
      alert("現在の応募者が一覧順の中に見つかりません。一度、一覧画面から開き直してください。");
      return;
    }

    let nextId = null;

    if (step > 0) {
      for (let i = currentPos + 1; i < orderedIds.length; i++) {
        const row = rowMap.get(orderedIds[i]);
        if (isActionRow(row)) {
          nextId = orderedIds[i];
          break;
        }
      }
    } else {
      for (let i = currentPos - 1; i >= 0; i--) {
        const row = rowMap.get(orderedIds[i]);
        if (isActionRow(row)) {
          nextId = orderedIds[i];
          break;
        }
      }
    }

    if (!nextId) {
      alert("この先に要対応の応募者はいません。");
      return;
    }

    window.location.href = "./detail.html?id=" + encodeURIComponent(nextId);
  } catch (e) {
    alert("要対応の移動に失敗しました。\n\n" + (e.message || e));
  }
}

function moveCandidate(step) {
  if (!candidateIdList.length) return;

  const nextIndex = currentIndex + step;

  if (nextIndex < 0 || nextIndex >= candidateIdList.length) {
    alert("これ以上移動できません");
    return;
  }

  const nextId = candidateIdList[nextIndex];
  window.location.href = "./detail.html?id=" + encodeURIComponent(nextId);
}

async function loadCandidate() {
  try {
    const user = await getSessionUser();

    if (!user) {
      showAuth("未ログインです", "info");
      return;
    }

    candidateId = getQueryParam("id");

    if (!candidateId) {
      setPageMessage("URLに id がありません。list.html から開いてください。", "error");
      return;
    }

    setPageMessage("詳細を読込中です", "info");

// list.htmlで表示していた順番を使用
try {
  const rawOrder = localStorage.getItem("recruit_list_current_order");
  candidateIdList = rawOrder ? JSON.parse(rawOrder) : [];
  if (!Array.isArray(candidateIdList)) candidateIdList = [];
} catch (e) {
  console.error("一覧順の読込に失敗しました", e);
  candidateIdList = [];
}

currentIndex = candidateIdList.indexOf(candidateId);

// 個別取得
const { data, error } = await sb
  .from("candidates")
  .select("*")
  .eq("id", candidateId)
  .single();

    if (error) throw error;

    if (!data) {
      setPageMessage("対象データが見つかりません", "error");
      return;
    }

  fillCandidate(data);
  loadCandidateAuditTimeline();
updateMoveButtons();
renderListContext();
initDirtyTracking();
markSaved("保存済み");
setPageMessage("詳細を読込しました", "success");
  } catch (e) {
    setPageMessage("詳細読込失敗: " + (e.message || e), "error");
  }
}

function collectPayload() {
  const payload = {
    name: (window.normalizePersonName ? window.normalizePersonName(document.getElementById("name").value) : document.getElementById("name").value.trim()) || null,
    age: (function(v){ if(!v) return null; const n = parseInt(v, 10); return (!isNaN(n) && n > 0 && n < 150) ? n : null; })(document.getElementById("age").value),
    division: getSelectedDivision() || null,
    center_name: getSelectedCenterName() || null,
    channel: getSelectedChannel() || null,
    channel_detail: document.getElementById("channelDetail").value.trim() || null,
    owner_name: getSelectedOwnerName() || null,
    job_type: getSelectedJobType() || null,

    applied_date: document.getElementById("appliedDate").value || null,
    appointment_date: document.getElementById("appointmentDate").value || null,
    interview1_date: document.getElementById("interviewScheduledDate").value || null,
    interview_done_date: document.getElementById("interviewDoneDate").value || null,
    offer_date: document.getElementById("offerDate").value || null,
    join_date: document.getElementById("joinDate").value || null,

    status: normalizeDetailStageStatus(document.getElementById("status").value) || null,
    hiring_result: normalizeDetailHiringResult(document.getElementById("hiringResult").value) || "進行中",
    reject_reason: document.getElementById("rejectReason").value || null,
    decline_reason: document.getElementById("declineReason").value || null,
    last_action_date: document.getElementById("lastActionDate").value || null,
    next_action_date: document.getElementById("nextActionDate").value || null,
    evaluation: document.getElementById("evaluation").value || null,
    evaluation_comment: document.getElementById("evaluationComment").value.trim() || null,
    action_memo: document.getElementById("actionMemo").value.trim() || null
  };

// ===== 旧ステータス互換：辞退・不採用・不通・保留・入社は選考結果へ寄せる =====
const legacyResultStatuses = ["保留","辞退","不採用","不通"];
if (legacyResultStatuses.includes(payload.status)) {
  if (!payload.hiring_result || payload.hiring_result === "進行中") payload.hiring_result = payload.status;
  if (payload.interview_done_date) payload.status = "面接実施";
  else if (payload.interview1_date) payload.status = "面接設定";
  else if (payload.appointment_date) payload.status = "アポ取得";
  else if (payload.applied_date) payload.status = "応募";
  else payload.status = null;
}
if (payload.status === "入社") {
  payload.status = "採用";
  payload.hiring_result = "入社済";
}
if (payload.hiring_result === "入社済") payload.status = "採用";
if (payload.hiring_result === "採用" && payload.status !== "採用") payload.status = "採用";

// ===== 入社日・採用・終了結果の自動連動 =====
if (payload.join_date) {
  payload.status = "採用";
  payload.hiring_result = "入社済";
}

payload.hiring_result = normalizeDetailResultForStatus(payload.status, payload.hiring_result);

// 終了・結果確定は次回対応日を自動クリア。
// 採用+採用は入社前の採用決定（内定扱い）のため、次回対応日を保持する。
const resultFixed = ["入社済","不採用","辞退","不通","保留"].includes(payload.hiring_result);

if (resultFixed) {
  payload.next_action_date = null;
}

return payload;
}

function markReturnToList(){
  try{
    const raw = sessionStorage.getItem("recruit_list_navigation_state");
    const state = raw ? JSON.parse(raw) : {};
    state.restore = true;
    state.targetId = candidateId ? String(candidateId) : String(getQueryParam("id") || "");
    state.savedAt = Date.now();
    sessionStorage.setItem("recruit_list_navigation_state", JSON.stringify(state));
  }catch(e){
    console.warn("一覧復元フラグの保存に失敗しました", e);
  }
}

function quickSetStatus(status) {
  const today = (window.RecruitDate?.todayJST ? window.RecruitDate.todayJST() : new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date()));

  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.value = status;

  if (status === "アポ取得") {
    if (!document.getElementById("appointmentDate").value) document.getElementById("appointmentDate").value = today;
  }

  if (status === "面接設定") {
    if (!document.getElementById("interviewScheduledDate").value) document.getElementById("interviewScheduledDate").value = today;
  }

  if (status === "面接実施") {
    if (!document.getElementById("interviewDoneDate").value) document.getElementById("interviewDoneDate").value = today;
  }

  if (status === "内定") {
    if (!document.getElementById("offerDate").value) document.getElementById("offerDate").value = today;
  }

  if (status === "採用") {
    if (!document.getElementById("offerDate").value) document.getElementById("offerDate").value = today;
    document.getElementById("hiringResult").value = "採用";
  }

  renderHiringResultOptions();
  document.getElementById("summaryStatus").innerHTML = getStatusBadge(status);
  document.getElementById("summaryNextActionDate").textContent = formatDate(document.getElementById("nextActionDate").value);

  handleStatusChange();
  markDirty();
  setPageMessage(status + " に変更しました。保存ボタンで確定してください。", "info");
}

function quickSetResult(result) {
  const resultEl = document.getElementById("hiringResult");
  const nextActionDate = document.getElementById("nextActionDate");
  if (resultEl) resultEl.value = result;
  if ((["入社済","不採用","辞退","不通","保留"].includes(result)) && nextActionDate) nextActionDate.value = "";
  if (result === "採用") {
    const statusEl = document.getElementById("status");
    if (statusEl && statusEl.value !== "採用") statusEl.value = "採用";
    const offerDate = document.getElementById("offerDate");
    if (offerDate && !offerDate.value) offerDate.value = (window.RecruitDate?.todayJST ? window.RecruitDate.todayJST() : new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date()));
  }
  handleStatusChange();
  markDirty();
  setPageMessage("選考結果を「" + result + "」に変更しました。保存ボタンで確定してください。", "info");
}

function syncJoinDateAndHiringResult(options = {}) {
  const joinDate = document.getElementById("joinDate");
  const statusEl = document.getElementById("status");
  const hiringResult = document.getElementById("hiringResult");
  const nextActionDate = document.getElementById("nextActionDate");
  const summaryStatus = document.getElementById("summaryStatus");
  const summaryNextActionDate = document.getElementById("summaryNextActionDate");

  if (!hiringResult) return false;

  const hasJoinDate = !!(joinDate && joinDate.value);
  let changed = false;

  if (hasJoinDate) {
    if (statusEl && statusEl.value !== "採用") {
      statusEl.value = "採用";
      changed = true;
    }
    if (hiringResult.value !== "入社済") {
      hiringResult.value = "入社済";
      changed = true;
    }
  } else if (hiringResult.value === "入社済") {
    hiringResult.value = statusEl && statusEl.value === "採用" ? "採用" : "進行中";
    changed = true;
  } else if (hiringResult.value === "採用" && statusEl && statusEl.value !== "採用") {
    statusEl.value = "採用";
    changed = true;
  }

  if (["保留","辞退","不採用","不通","入社済"].includes(hiringResult.value) && nextActionDate && nextActionDate.value) {
    nextActionDate.value = "";
    changed = true;
  }

  if (summaryStatus && statusEl) summaryStatus.innerHTML = getStatusBadge(statusEl.value);
  if (summaryNextActionDate) summaryNextActionDate.textContent = formatDate(nextActionDate?.value || "");

  if (changed && options.showMessage) {
    setPageMessage(hasJoinDate ? "入社日があるため、選考結果を入社済に同期しました。" : "入社日が空のため、選考結果を再調整しました。", "info");
  }
  return changed;
}

function handleStatusChange() {
  const status = document.getElementById("status").value;
  const today = (window.RecruitDate?.todayJST ? window.RecruitDate.todayJST() : new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date()));

  const appointmentDate = document.getElementById("appointmentDate");
  const interviewScheduledDate = document.getElementById("interviewScheduledDate");
  const interviewDoneDate = document.getElementById("interviewDoneDate");
  const offerDate = document.getElementById("offerDate");
  const joinDate = document.getElementById("joinDate");
  const hiringResult = document.getElementById("hiringResult");
  const nextActionDate = document.getElementById("nextActionDate");

  if (status === "アポ取得" && appointmentDate && !appointmentDate.value) {
    appointmentDate.value = today;
  }

  if (status === "面接設定" && interviewScheduledDate && !interviewScheduledDate.value) {
    interviewScheduledDate.value = today;
  }

  if (status === "面接実施" && interviewDoneDate && !interviewDoneDate.value) {
    interviewDoneDate.value = today;
  }

  if (status === "内定") {
    if (offerDate && !offerDate.value) offerDate.value = today;
  }

  if (status === "採用") {
    if (offerDate && !offerDate.value) offerDate.value = today;
    if (hiringResult && hiringResult.value === "進行中") hiringResult.value = "採用";
  }

  renderHiringResultOptions();
  syncJoinDateAndHiringResult({ showMessage:false });

  const fixedResult = hiringResult ? String(hiringResult.value || "").trim() : "";
  if (nextActionDate && ["保留","辞退","不採用","不通","入社済"].includes(fixedResult)) {
    nextActionDate.value = "";
  }

  const summaryStatus = document.getElementById("summaryStatus");
  const summaryNextActionDate = document.getElementById("summaryNextActionDate");

  if (summaryStatus) summaryStatus.innerHTML = getStatusBadge(status);
  if (summaryNextActionDate) summaryNextActionDate.textContent = formatDate(nextActionDate?.value || "");

  if (currentCandidate) {
    markDirty();
  }
}

function validatePayload(payload) {
  const messages = [];

  // ===== 必須 =====
  if (!payload.name) {
    messages.push("氏名を入力してください。");
  }

  if (!payload.applied_date) {
    messages.push("応募日を入力してください。");
  }

  // ===== 日付順チェック =====
  if (payload.appointment_date && payload.applied_date && payload.appointment_date < payload.applied_date) {
    messages.push("アポイント日が応募日より前です。");
  }

  if (payload.interview1_date && payload.appointment_date && payload.interview1_date < payload.appointment_date) {
    messages.push("面接予定日がアポイント日より前です。");
  }

  if (payload.interview_done_date && payload.interview1_date && payload.interview_done_date < payload.interview1_date) {
    messages.push("面接実施日が面接予定日より前です。");
  }

  if (payload.offer_date && payload.interview_done_date && payload.offer_date < payload.interview_done_date) {
    messages.push("内定日が面接実施日より前です。");
  }

  if (payload.join_date && payload.offer_date && payload.join_date < payload.offer_date) {
    messages.push("入社日が内定日より前です。");
  }

  // ===== 次回対応日の整合性チェック =====
  // 入力済みの進捗日付より前に次回対応日があると、一覧・要対応・ダッシュボード判定がズレるため保存不可。
  if (payload.next_action_date) {
    const progressDates = [
      { label:"応募日", value:payload.applied_date },
      { label:"アポイント日", value:payload.appointment_date },
      { label:"面接予定日", value:payload.interview1_date },
      { label:"面接実施日", value:payload.interview_done_date },
      { label:"内定日", value:payload.offer_date },
      { label:"入社日", value:payload.join_date }
    ].filter(item => item.value);

    if (progressDates.length > 0) {
      const latestProgress = progressDates.sort((a, b) => a.value < b.value ? 1 : -1)[0];

      if (payload.next_action_date < latestProgress.value) {
        messages.push("次回対応日が" + latestProgress.label + "より前です。次回対応日は" + latestProgress.label + "以降の日付にしてください。");
      }
    }
  }

  // ===== ステータス連動チェック =====
  // ステータスごとに選べる選考結果を制限する。
  // 採用+採用は入社前の採用決定（内定扱い）のため、次回対応日を必須にする。
  if (!getAllowedHiringResultsForStatus(payload.status).includes(payload.hiring_result)) {
    messages.push("現在のステータスでは選べない選考結果です。ステータスに応じた選考結果を選び直してください。");
  }

  if ((payload.hiring_result === "進行中" || (payload.status === "採用" && payload.hiring_result === "採用" && !payload.join_date)) && !payload.next_action_date) {
    messages.push("次回対応日を入力してください。");
  }

  if (payload.status === "アポ取得" && !payload.appointment_date) {
    messages.push("アポ取得なのにアポイント日が未入力です。");
  }

  if (payload.status === "面接設定" && !payload.interview1_date) {
    messages.push("面接設定なのに面接予定日が未入力です。");
  }

  if (payload.status === "面接実施" && !payload.interview1_date) {
    messages.push("面接実施なのに面接予定日が未入力です。");
  }

  if (payload.status === "面接実施" && !payload.interview_done_date) {
    messages.push("面接実施なのに面接実施日が未入力です。");
  }

  if (payload.status === "内定" && !payload.interview_done_date) {
    messages.push("内定なのに面接実施日が未入力です。");
  }

  if (payload.status === "内定" && !payload.offer_date) {
    messages.push("内定なのに内定日が未入力です。");
  }

  if (payload.status === "採用" && !["採用","入社済","辞退"].includes(payload.hiring_result)) {
    messages.push("採用ステータスの場合は、選考結果を採用・入社済・辞退のいずれかにしてください。");
  }

  if (["採用","入社済"].includes(payload.hiring_result) && payload.status !== "採用") {
    messages.push("選考結果が採用または入社済の場合は、ステータスも採用にしてください。");
  }

  if (payload.hiring_result === "入社済" && !payload.join_date) {
    messages.push("選考結果が入社済なのに入社日が未入力です。");
  }

  if (payload.hiring_result === "辞退" && !payload.decline_reason) {
    messages.push("選考結果が辞退なのに辞退理由が未選択です。");
  }

  if (payload.hiring_result === "不採用" && !payload.reject_reason) {
    messages.push("不採用なのに不採用理由が未選択です。");
  }

  if (payload.status === "面接実施" && payload.hiring_result === "採用" && !payload.offer_date) {
    messages.push("面接実施で選考結果が採用なのに内定日が未入力です。");
  }


  // ===== 逆流チェック（重要） =====
  if (payload.status === "応募" && payload.interview1_date) {
    messages.push("応募段階で面接予定日が入力されています。");
  }

  if (payload.status === "アポ取得" && payload.interview_done_date) {
    messages.push("アポ段階で面接実施日が入力されています。");
  }

  return messages;
}
async function deleteCandidate() {
  if(window.RecruitOpsGuard && !window.RecruitOpsGuard.requireDelete(currentRole)) return;
  if(window.RecruitRole && window.RecruitRole.isViewer(currentRole)){
    await showErrorModal("viewer権限のため、削除はできません。", "削除できません");
    return;
  }
  try {
    const user = await getSessionUser();

    if (!user) {
      showAuth("未ログインです。再度ログインしてください", "error");
      return;
    }

    if (!candidateId) {
      setPageMessage("削除対象のIDがありません", "error");
      return;
    }

    const ok = window.RecruitUI
      ? await window.RecruitUI.confirmAction("この応募者を削除しますか？\n\n※完全削除ではなく、一覧から非表示にします。", {
          title: "削除確認",
          okText: "削除する",
          cancelText: "キャンセル",
          type: "warning"
        })
      : confirm("この応募者を削除しますか？\n\n※完全削除ではなく、一覧から非表示にします。");

    if (!ok) {
      return;
    }

    setPageMessage("削除中です", "info");

    const { error } = await sb
      .from("candidates")
      .update({
        is_deleted: true,
        updated_by: user.id
      })
      .eq("id", candidateId);

    if (error) throw error;

    if(window.RecruitAudit && window.RecruitAudit.candidateDelete){
      await window.RecruitAudit.candidateDelete(candidateId, currentCandidate);
    } else if(window.writeRecruitAuditLog){
      await window.writeRecruitAuditLog("candidate_delete", "candidates", candidateId, { name: currentCandidate?.name || null, status: currentCandidate?.status || null });
    }

    if(window.RecruitUI){ window.RecruitUI.toast("削除しました。応募者一覧に戻ります。", "success"); }
    markReturnToList();
    window.location.href = "./list.html";
  } catch (e) {
    setPageMessage("削除失敗: " + (e.message || e), "error");
    if(window.RecruitUI){ window.RecruitUI.showError("削除に失敗しました。\n\n" + (e.message || e)); }
  }
}

async function saveCandidate() {
  if(window.RecruitOpsGuard && !window.RecruitOpsGuard.requireWrite(currentRole)) return;
  if(window.RecruitRole && window.RecruitRole.isViewer(currentRole)){
    await showErrorModal("viewer権限のため、保存はできません。", "保存できません");
    return;
  }
  try {
    const user = await getSessionUser();

    if (!user) {
      showAuth("未ログインです。再度ログインしてください", "error");
      return;
    }

    if (!candidateId) {
      setPageMessage("保存対象のIDがありません", "error");
      return;
    }

    const today = (window.RecruitDate?.todayJST ? window.RecruitDate.todayJST() : new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date()));
    document.getElementById("lastActionDate").value = today;

    const payload = collectPayload();
    const errors = validatePayload(payload);

    if (errors.length > 0) {
      const message = "次の内容を修正してください。\n\n・" + errors.join("\n・");
      setPageMessage(errors.join(" / "), "error");
      await showErrorModal(message, "保存できません");
      return;
    }

    payload.updated_by = user.id;

    setPageMessage("保存中です", "info");

    const beforeCandidate = currentCandidate ? {...currentCandidate} : null;

    const { data, error } = await sb
      .from("candidates")
      .update(payload)
      .eq("id", candidateId)
      .select("*")
      .single();

    if (error) throw error;

    if(window.RecruitAudit && window.RecruitAudit.candidateUpdate){
      await window.RecruitAudit.candidateUpdate(candidateId, beforeCandidate, data, Object.keys(payload));
    } else if(window.writeRecruitAuditLog){
      const diff = window.diffRecruitObjects ? window.diffRecruitObjects(beforeCandidate, data, Object.keys(payload)) : payload;
      await window.writeRecruitAuditLog("candidate_update", "candidates", candidateId, { name:data?.name||beforeCandidate?.name||null, diff });
    }

    fillCandidate(data);
    currentCandidate = data;
    try {
      sessionStorage.setItem("recruit_detail_saved_candidate", JSON.stringify({ id: candidateId, at: Date.now() }));
    } catch(e) {}
    await loadCandidateAuditTimeline();
    markSaved("保存済み");
    setPageMessage("保存しました", "success");
    showSuccessModal("保存しました");
  } catch (e) {
    const message = e && e.message ? e.message : String(e || "保存に失敗しました");
    console.error("candidate save failed", e);
    setPageMessage("保存失敗: " + message, "error");
    await showErrorModal("保存に失敗しました。\n\n" + message, "保存失敗");
  }
}


function auditActionLabelForDetail(action){
  const map={candidate_create:"登録",candidate_update:"更新",candidate_delete:"削除",candidate_restore:"復元"};
  return map[action] || action || "-";
}
function formatAuditDetailForDetail(detail){
  if(!detail) return "-";
  const diff=detail.diff || null;
  if(diff && typeof diff==="object"){
    const parts=Object.entries(diff).slice(0,8).map(([key,val])=>`${key}: ${val?.before ?? "-"} → ${val?.after ?? "-"}`);
    return parts.length ? parts.join(" / ") : "差分なし";
  }
  return Object.entries(detail).slice(0,8).map(([k,v])=>`${k}: ${typeof v==="object" ? JSON.stringify(v) : v}`).join(" / ") || "-";
}
async function loadCandidateAuditTimeline(){
  const body=document.getElementById("candidateHistoryBody");
  if(!body || !candidateId) return;
  try{
    body.textContent="履歴を読み込み中です。";
    const {data,error}=await sb.from("audit_logs")
      .select("created_at,user_email,action_type,detail_json,target_id,target_type")
      .eq("target_type","candidates")
      .eq("target_id",String(candidateId))
      .order("created_at",{ascending:false})
      .limit(30);
    if(error) throw error;
    const rows=data||[];
    if(!rows.length){body.textContent="この応募者の更新履歴はまだありません。";return;}
    body.innerHTML=rows.map(row=>`<div class="history-row">
      <div>${escapeHtml(window.RecruitDate?.formatJSTDateTimeMinute ? window.RecruitDate.formatJSTDateTimeMinute(row.created_at) : String(row.created_at||"").replace("T"," ").slice(0,16))}</div>
      <div><div class="history-action">${escapeHtml(auditActionLabelForDetail(row.action_type))}</div><div>${escapeHtml(row.user_email||"-")}</div></div>
      <div class="history-detail">${escapeHtml(formatAuditDetailForDetail(row.detail_json))}</div>
    </div>`).join("");
  }catch(e){
    body.textContent="履歴の読込に失敗しました: "+(e.message||e);
  }
}

function initDirtyTracking() {
  const app = document.getElementById("appScreen");
  if (!app) return;
  app.querySelectorAll("input, select, textarea").forEach(el => {
    if (el.dataset.dirtyWatch === "1") return;
    el.dataset.dirtyWatch = "1";
    el.addEventListener("input", markDirty);
    el.addEventListener("change", markDirty);
  });

  const joinDate = document.getElementById("joinDate");
  if (joinDate && joinDate.dataset.joinSyncWatch !== "1") {
    joinDate.dataset.joinSyncWatch = "1";
    joinDate.addEventListener("change", () => {
      syncJoinDateAndHiringResult({ showMessage:true });
      markDirty();
    });
  }

  const status = document.getElementById("status");
  if (status && status.dataset.statusResultFilterWatch !== "1") {
    status.dataset.statusResultFilterWatch = "1";
    status.addEventListener("change", () => {
      renderHiringResultOptions();
      syncJoinDateAndHiringResult({ showMessage:false });
      markDirty();
    });
  }

  const hiringResult = document.getElementById("hiringResult");
  if (hiringResult && hiringResult.dataset.resultSyncWatch !== "1") {
    hiringResult.dataset.resultSyncWatch = "1";
    hiringResult.addEventListener("change", () => {
      const changed = syncJoinDateAndHiringResult({ showMessage:false });
      if (changed) renderHiringResultOptions();
      markDirty();
    });
  }
}

function bindDetailActionButtons() {
  const saveButton = document.getElementById("saveCandidateButton");
  if (saveButton && saveButton.dataset.boundSave !== "1") {
    saveButton.dataset.boundSave = "1";
    saveButton.addEventListener("click", saveCandidate);
  }
}

window.saveCandidate = saveCandidate;
window.deleteCandidate = deleteCandidate;
window.quickSetStatus = quickSetStatus;
window.quickSetResult = quickSetResult;
window.toggleActionAdvice = toggleActionAdvice;
window.markReturnToList = markReturnToList;

window.addEventListener("beforeunload", function(e) {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

if (sb && sb.auth) {
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      showAuth("ログアウトしました", "success");
    }
  });
}

(async function init() {
  try {
    candidateId = getQueryParam("id");
    await Promise.all([loadCenterMaster(), loadOptionMasters()]);

    const ok = await refreshAuthState();
    if (ok) {
      bindDetailActionButtons();
      await loadCandidate();
    }
  } catch (e) {
    console.error(e);
    const message = e && e.message ? e.message : "初期化に失敗しました";
    showAuth("初期化に失敗しました: " + message, "error");
  } finally {
    document.body.classList.remove("auth-checking");
  }
})();
