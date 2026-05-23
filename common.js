/* common.js : shared utility functions for recruit-app
   既存のSupabase処理・localStorage構造には触れない共通ユーティリティのみ配置。 */
(function(){
  "use strict";

  function normalizeDateText(value){
    if(value === null || value === undefined) return "";
    return String(value).trim().replaceAll("/","-");
  }

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function esc(str){
    return escapeHtml(str);
  }


  const RECRUIT_TIME_ZONE = "Asia/Tokyo";

  function pad2(value){
    return String(value).padStart(2,"0");
  }

  function getJSTParts(dateValue = new Date()){
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if(Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("ja-JP",{
      timeZone:RECRUIT_TIME_ZONE,
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit",
      hour12:false
    }).formatToParts(date).reduce((acc,part)=>{
      if(part.type !== "literal") acc[part.type] = part.value;
      return acc;
    },{});
    return parts;
  }

  function todayJST(){
    const parts = getJSTParts(new Date());
    if(!parts) return "";
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function nowIso(){
    return new Date().toISOString();
  }

  function formatJSTDate(value){
    if(!value) return "-";
    const raw = String(value).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parts = getJSTParts(raw);
    if(!parts) return "-";
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function formatJSTDateTime(value){
    if(!value) return "-";
    const parts = getJSTParts(value);
    if(!parts) return "-";
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  }

  function formatJSTDateTimeMinute(value){
    if(!value) return "-";
    const parts = getJSTParts(value);
    if(!parts) return "-";
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
  }

  function normalizeDateForCalc(value){
    const text = normalizeDateText(value);
    if(!text) return null;
    const date = new Date(text + "T00:00:00+09:00");
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysBetween(a,b){
    const fromText = normalizeDateText(a);
    const toText = normalizeDateText(b);
    if(!fromText || !toText) return null;
    const from = normalizeDateForCalc(fromText);
    const to = normalizeDateForCalc(toText);
    const diff = Math.floor((to - from) / 86400000);
    return Number.isNaN(diff) ? null : diff;
  }

  function fiscalYear(d = new Date()){
    if(d instanceof Date){
      const parts = getJSTParts(d);
      if(!parts) return Number(todayJST().slice(0,4)) || new Date().getFullYear();
      const year = Number(parts.year);
      const month = Number(parts.month);
      return month >= 4 ? year : year - 1;
    }
    const date = normalizeDateForCalc(d);
    if(!date || Number.isNaN(date.getTime())) return Number(todayJST().slice(0,4)) || new Date().getFullYear();
    return date.getMonth() + 1 >= 4 ? date.getFullYear() : date.getFullYear() - 1;
  }

  function getFiscalYearFromDate(d){
    return fiscalYear(d);
  }

  const RECRUIT_STATUS_MASTER_DEFAULTS = [
    { name:"応募", display_order:10, color:"#2563eb" },
    { name:"書類選考", display_order:20, color:"#0ea5e9" },
    { name:"アポ取得", display_order:30, color:"#0891b2" },
    { name:"面接設定", display_order:40, color:"#f97316" },
    { name:"面接実施", display_order:50, color:"#ca8a04" },
    { name:"内定", display_order:60, color:"#7c3aed" },
    { name:"採用", display_order:70, color:"#16a34a" }
  ];

  const RECRUIT_DEPRECATED_STATUS_NAMES = ["入社","辞退","不採用","不通","保留"];
  const RECRUIT_HIRING_RESULT_DEFAULTS = ["進行中","保留","辞退","不採用","不通","採用","入社済"];
  const RECRUIT_LEGACY_RESULT_MAP = { "合格":"採用", "進行中":"進行中", "未設定":"進行中", "":"進行中" };

  function recruitStatusDefaultNames(){
    return RECRUIT_STATUS_MASTER_DEFAULTS.map(row => row.name);
  }

  function isDeprecatedRecruitStatus(name){
    return RECRUIT_DEPRECATED_STATUS_NAMES.includes(String(name || "").trim());
  }

  function recruitHiringResultNames(){
    return RECRUIT_HIRING_RESULT_DEFAULTS.slice();
  }

  function normalizeRecruitHiringResult(value){
    const raw = String(value ?? "").trim();
    const mapped = Object.prototype.hasOwnProperty.call(RECRUIT_LEGACY_RESULT_MAP, raw) ? RECRUIT_LEGACY_RESULT_MAP[raw] : raw;
    return RECRUIT_HIRING_RESULT_DEFAULTS.includes(mapped) ? mapped : "進行中";
  }

  function normalizeRecruitStageStatus(value){
    const raw = String(value ?? "").trim();
    if(recruitStatusDefaultNames().includes(raw)) return raw;
    if(raw === "入社") return "採用";
    if(["辞退","不採用","不通","保留"].includes(raw)) return "";
    return raw;
  }

  function inferRecruitStageFromDates(row){
    const r = row || {};
    if(isValidRecruitDate(r.join_date)) return "採用";
    if(isValidRecruitDate(r.offer_date)) return "内定";
    if(isValidRecruitDate(r.interview_done_date)) return "面接実施";
    if(isValidRecruitDate(r.interview1_date) || isValidRecruitDate(r.interview_date)) return "面接設定";
    if(isValidRecruitDate(r.appointment_date)) return "アポ取得";
    if(isValidRecruitDate(r.applied_date)) return "応募";
    return "";
  }

  function normalizeRecruitCandidateState(row){
    const out = { ...(row || {}) };
    const rawStatus = String(out.status || "").trim();
    const rawResult = String(out.hiring_result || "").trim();
    let status = normalizeRecruitStageStatus(rawStatus);
    let result = normalizeRecruitHiringResult(rawResult);

    if(isValidRecruitDate(out.join_date)){
      status = "採用";
      result = "入社済";
    }else if(rawStatus === "入社"){
      status = "採用";
      result = "入社済";
    }else if(["保留","辞退","不採用","不通"].includes(rawStatus)){
      if(!rawResult || result === "進行中") result = rawStatus;
      status = inferRecruitStageFromDates(out) || status || "応募";
    }else if(result === "入社済"){
      status = "採用";
    }else if(result === "採用"){
      status = "採用";
    }else if(rawStatus === "採用" && (!rawResult || result === "進行中")){
      result = "採用";
    }

    out.status = status || rawStatus || null;
    out.hiring_result = result || "進行中";
    return out;
  }

  function mergeRecruitStatusNames(values){
    const current = [...new Set((values || []).map(v => String(v || "").trim()).filter(Boolean))].filter(name => !isDeprecatedRecruitStatus(name));
    const extras = recruitStatusDefaultNames().filter(name => !current.includes(name));
    const merged = current.concat(extras);
    const orderMap = new Map(RECRUIT_STATUS_MASTER_DEFAULTS.map(row => [row.name, Number(row.display_order || 9999)]));
    return merged.sort((a,b) => (orderMap.get(a) || 9999) - (orderMap.get(b) || 9999) || String(a).localeCompare(String(b), "ja"));
  }

  function recruitStatusDefaultColor(name){
    return RECRUIT_STATUS_MASTER_DEFAULTS.find(row => row.name === name)?.color || "#64748b";
  }

  function isValidRecruitDate(value){
    if(!value) return false;
    const text = String(value).slice(0,10);
    const y = Number(text.slice(0,4));
    return y >= 2000;
  }

  function isRecruitHired(row){
    // 実入社の判定。
    // status=採用 / hiring_result=採用 は「採用決定」であり、入社日未登録なら採用数には含めない。
    const r = normalizeRecruitCandidateState(row || {});
    return String(r.hiring_result || "").trim() === "入社済" || isValidRecruitDate(r.join_date);
  }

  function isRecruitHiringDecision(row){
    // 採用決定の判定。実入社とは分ける。
    const r = normalizeRecruitCandidateState(row || {});
    return String(r.status || "").trim() === "採用" || ["採用","入社済"].includes(String(r.hiring_result || "").trim()) || isValidRecruitDate(r.join_date);
  }

  function isRecruitInterviewDone(row){
    const r = normalizeRecruitCandidateState(row || {});
    const status = String(r.status || "").trim();
    return isValidRecruitDate(r.interview_done_date) || isValidRecruitDate(r.offer_date) || isValidRecruitDate(r.join_date) || ["面接実施","内定","採用"].includes(status) || isRecruitHiringDecision(r);
  }

  function isRecruitPendingJoin(row){
    const r = normalizeRecruitCandidateState(row || {});
    return isRecruitHiringDecision(r) && !isRecruitHired(r);
  }

  function isRecruitRejected(row){
    const r = normalizeRecruitCandidateState(row || {});
    const status = String(r.status || "").trim();
    return String(r.hiring_result || "").trim() === "不採用" || status === "不採用";
  }

  function isRecruitDeclined(row){
    const r = normalizeRecruitCandidateState(row || {});
    const status = String(r.status || "").trim();
    return String(r.hiring_result || "").trim() === "辞退" || status === "辞退" || !!String(r.decline_reason || "").trim();
  }



  function isRecruitInterviewDeclined(row){
    // 互換用。
    // ステータスは「到達地点」、選考結果は「その地点で消えた理由・現在結果」として扱う。
    // そのため、辞退をステータス段階で除外しない。
    return isRecruitDeclined(row);
  }

  function getRecruitStageStatus(row){
    return String(normalizeRecruitCandidateState(row || {}).status || "").trim();
  }

  function getRecruitHiringResult(row){
    return String(normalizeRecruitCandidateState(row || {}).hiring_result || "進行中").trim();
  }

  const RECRUIT_STAGE_ORDER = ["応募","書類選考","アポ取得","面接設定","面接実施","内定","採用"];

  function getRecruitStageRank(stageName){
    const stage = String(stageName || "").trim();
    return RECRUIT_STAGE_ORDER.indexOf(stage);
  }

  function isRecruitStage(row, stageName){
    // 現在ステータスの完全一致。滞留者を見たい時だけ使う。
    const stage = String(stageName || "").trim();
    if(!stage) return false;
    return getRecruitStageStatus(row) === stage;
  }

  function isRecruitStageReached(row, stageName){
    // 採用進行フロー・到達率用。
    // 採用決定（status=採用 / hiring_result=採用）は、内定までは到達済みとして扱う。
    // 採用数は実入社（join_dateあり / hiring_result=入社済）のみ。
    const target = getRecruitStageRank(stageName);
    if(target < 0) return false;
    const r = normalizeRecruitCandidateState(row || {});
    const stage = String(stageName || "").trim();
    if(stage === "採用") return isRecruitHired(r);

    const statusRank = getRecruitStageRank(String(r.status || "").trim());
    if(statusRank >= target) return true;

    if(stage === "応募") return isValidRecruitDate(r.applied_date) || statusRank >= 0;
    if(stage === "アポ取得") return isValidRecruitDate(r.appointment_date) || isValidRecruitDate(r.interview1_date) || isValidRecruitDate(r.interview_date) || isValidRecruitDate(r.interview_done_date) || isValidRecruitDate(r.offer_date) || isValidRecruitDate(r.join_date);
    if(stage === "面接設定") return isValidRecruitDate(r.interview1_date) || isValidRecruitDate(r.interview_date) || isValidRecruitDate(r.interview_done_date) || isValidRecruitDate(r.offer_date) || isValidRecruitDate(r.join_date);
    if(stage === "面接実施") return isValidRecruitDate(r.interview_done_date) || isValidRecruitDate(r.offer_date) || isValidRecruitDate(r.join_date) || isRecruitHiringDecision(r);
    if(stage === "内定") return isValidRecruitDate(r.offer_date) || isValidRecruitDate(r.join_date) || isRecruitHiringDecision(r);
    if(stage === "採用") return isRecruitHired(r);
    return false;
  }

  function getRecruitDropStageLabel(row){
    return getRecruitStageStatus(row) || inferRecruitStageFromDates(row || {}) || "未設定";
  }

  function isRecruitNoContact(row){
    // ステータスは「到達地点」、選考結果は「そこで消えた理由・現在結果」。
    // 連絡不通の集計・一覧抽出は、選考結果が不通の応募者だけを対象にする。
    // reject_reason / decline_reason / action_memo の文字列だけでは、不採用・辞退を誤って不通に含めるため使わない。
    const r = normalizeRecruitCandidateState(row || {});
    const status = String(r.status || "").trim();
    const result = String(r.hiring_result || "").trim();
    return result === "不通" || status === "不通";
  }

  function isRecruitDropped(row){
    const result = getRecruitHiringResult(row);
    return ["辞退","不採用","不通","保留"].includes(result) || isRecruitDeclined(row) || isRecruitRejected(row) || isRecruitNoContact(row);
  }

  function isFinal(row){
    const r = normalizeRecruitCandidateState(row || {});
    const status = String(r.status || "").trim();
    return isRecruitHired(r) || ["不採用","辞退","不通","保留","採用","入社済"].includes(String(r.hiring_result || "").trim()) || ["不採用","辞退","不通","保留","入社"].includes(status);
  }




  function getRecruitCurrentFiscalYear(){
    return fiscalYear(todayJST());
  }

  function formatRecruitFiscalYearLabel(value){
    const current = getRecruitCurrentFiscalYear();
    if(value === "current") return `${current}年度`;
    if(value === "previous") return `${current - 1}年度`;
    if(value === "all" || value === "" || value === "全期間" || value === "全期間") return "全期間";
    const match = String(value || "").match(/^(?:fy:)?(\d{4})/);
    if(match) return `${match[1]}年度`;
    return String(value || "");
  }

  function setupRecruitFiscalYearSelectLabels(root=document){
    const current = getRecruitCurrentFiscalYear();
    const selectors = [
      '#fy', '#filterYear', '#filterFiscalYear', '#exportYear', '#reportFiscalYear',
      'select[name="fiscalYear"]', 'select[data-fiscal-year-select]'
    ];
    root.querySelectorAll(selectors.join(',')).forEach(select => {
      Array.from(select.options || []).forEach(option => {
        const value = String(option.value || '').trim();
        const text = String(option.textContent || '').trim();
        if(value === 'current' || value === 'this' || text === '今年度' || text === '') option.textContent = `${current}年度`;
        if(value === 'previous' || value === 'prev' || text === '前年度') option.textContent = `${current - 1}年度`;
        if(value === 'all' || text === '全期間' || text === '全期間') option.textContent = '全期間';
        if(value === 'custom' || text === '期間指定') option.textContent = '期間指定';
      });
    });
  }

  window.normalizeDateText = window.normalizeDateText || normalizeDateText;
  window.escapeHtml = window.escapeHtml || escapeHtml;
  window.esc = window.esc || esc;
  window.daysBetween = window.daysBetween || daysBetween;
  window.fiscalYear = window.fiscalYear || fiscalYear;
  window.getFiscalYearFromDate = window.getFiscalYearFromDate || getFiscalYearFromDate;
  window.RECRUIT_STAGE_STATUSES = window.RECRUIT_STAGE_STATUSES || recruitStatusDefaultNames();
  window.RECRUIT_HIRING_RESULTS = window.RECRUIT_HIRING_RESULTS || recruitHiringResultNames();
  window.RECRUIT_FINAL_RESULTS = window.RECRUIT_FINAL_RESULTS || ["保留","辞退","不採用","不通","採用","入社済"];
  window.RECRUIT_STATUS_MASTER_DEFAULTS = window.RECRUIT_STATUS_MASTER_DEFAULTS || RECRUIT_STATUS_MASTER_DEFAULTS;
  window.recruitStatusDefaultNames = window.recruitStatusDefaultNames || recruitStatusDefaultNames;
  window.mergeRecruitStatusNames = window.mergeRecruitStatusNames || mergeRecruitStatusNames;
  window.recruitStatusDefaultColor = window.recruitStatusDefaultColor || recruitStatusDefaultColor;
  window.RECRUIT_DEPRECATED_STATUS_NAMES = window.RECRUIT_DEPRECATED_STATUS_NAMES || RECRUIT_DEPRECATED_STATUS_NAMES;
  window.isDeprecatedRecruitStatus = window.isDeprecatedRecruitStatus || isDeprecatedRecruitStatus;
  window.recruitHiringResultNames = window.recruitHiringResultNames || recruitHiringResultNames;
  window.normalizeRecruitHiringResult = window.normalizeRecruitHiringResult || normalizeRecruitHiringResult;
  window.normalizeRecruitStageStatus = window.normalizeRecruitStageStatus || normalizeRecruitStageStatus;
  window.inferRecruitStageFromDates = window.inferRecruitStageFromDates || inferRecruitStageFromDates;
  window.normalizeRecruitCandidateState = window.normalizeRecruitCandidateState || normalizeRecruitCandidateState;
  window.isValidRecruitDate = window.isValidRecruitDate || isValidRecruitDate;
  window.isRecruitHired = window.isRecruitHired || isRecruitHired;
  window.isRecruitHiringDecision = window.isRecruitHiringDecision || isRecruitHiringDecision;
  window.isRecruitInterviewDone = window.isRecruitInterviewDone || isRecruitInterviewDone;
  window.isRecruitPendingJoin = window.isRecruitPendingJoin || isRecruitPendingJoin;
  window.isRecruitRejected = window.isRecruitRejected || isRecruitRejected;
  window.isRecruitDeclined = window.isRecruitDeclined || isRecruitDeclined;
  window.isRecruitInterviewDeclined = window.isRecruitInterviewDeclined || isRecruitInterviewDeclined;
  window.getRecruitStageStatus = window.getRecruitStageStatus || getRecruitStageStatus;
  window.getRecruitHiringResult = window.getRecruitHiringResult || getRecruitHiringResult;
  window.RECRUIT_STAGE_ORDER = window.RECRUIT_STAGE_ORDER || RECRUIT_STAGE_ORDER;
  window.getRecruitStageRank = window.getRecruitStageRank || getRecruitStageRank;
  window.isRecruitStage = window.isRecruitStage || isRecruitStage;
  window.isRecruitStageReached = window.isRecruitStageReached || isRecruitStageReached;
  window.getRecruitDropStageLabel = window.getRecruitDropStageLabel || getRecruitDropStageLabel;
  window.isRecruitNoContact = window.isRecruitNoContact || isRecruitNoContact;
  window.isRecruitDropped = window.isRecruitDropped || isRecruitDropped;
  window.isFinal = window.isFinal || isFinal;
  window.getRecruitCurrentFiscalYear = window.getRecruitCurrentFiscalYear || getRecruitCurrentFiscalYear;
  window.formatRecruitFiscalYearLabel = window.formatRecruitFiscalYearLabel || formatRecruitFiscalYearLabel;
  window.setupRecruitFiscalYearSelectLabels = window.setupRecruitFiscalYearSelectLabels || setupRecruitFiscalYearSelectLabels;
  window.refreshRecruitFiscalYearSelectLabels = setupRecruitFiscalYearSelectLabels;
  if(document.readyState !== 'loading'){
    window.setTimeout(() => setupRecruitFiscalYearSelectLabels(), 0);
  }

  function getDashboardControlValue(ids){
    for(const id of ids){
      const el = document.getElementById(id);
      if(el && typeof el.value !== "undefined" && String(el.value || "").trim()) return String(el.value || "").trim();
    }
    return "";
  }

  function getDashboardFiscalYearValue(){
    const fyEl = document.getElementById("fy") || document.getElementById("filterFiscalYear") || document.getElementById("filterYear");
    const current = fiscalYear();
    const value = fyEl ? String(fyEl.value || "current").trim() : "current";
    const match = value.match(/^(?:fy:)?(\d{4})/);
    if(value === "previous" || value === "prev" || value === "前年度") return String(current - 1);
    if(value === "all" || value === "全期間" || value === "全期間") return "";
    if(match) return match[1];
    return String(current);
  }

  function buildDashboardListUrl(params){
    const q = new URLSearchParams();
    const options = params || {};
    q.set("source", "dashboard");
    q.set("filter", options.filter || "all");

    const year = getDashboardFiscalYearValue();
    const from = getDashboardControlValue(["from"]);
    const to = getDashboardControlValue(["to"]);
    const division = options.division ?? getDashboardControlValue(["divisionFilter", "division"]);
    const center = options.center ?? getDashboardControlValue(["centerFilter", "center"]);
    const owner = options.owner ?? getDashboardControlValue(["ownerFilter", "owner"]);
    const channel = options.channel ?? getDashboardControlValue(["channelFilter", "channel"]);
    const job = options.job ?? getDashboardControlValue(["jobType", "job"]);

    if(year) q.set("year", year);
    if(from) q.set("from", from);
    if(to) q.set("to", to);
    if(division) q.set("division", division);
    if(center) q.set("center", center);
    if(owner) q.set("owner", owner);
    if(channel) q.set("channel", channel);
    if(job) q.set("job", job);

    return "./list.html?" + q.toString();
  }

  function setupSummaryCardLinks(){
    const cards = document.querySelectorAll("[data-summary-filter]");
    cards.forEach(card => {
      if(card.dataset.summaryBound === "1") return;
      card.dataset.summaryBound = "1";
      card.classList.add("metric-card-link");
      card.setAttribute("role", "link");
      card.setAttribute("tabindex", "0");
      const label = card.querySelector(".label")?.textContent?.trim() || "一覧";
      card.setAttribute("aria-label", label + "の対象者一覧を開く");
      const open = () => {
        window.location.href = buildDashboardListUrl({
          filter: card.dataset.summaryFilter || "all",
          division: card.dataset.summaryDivision,
          center: card.dataset.summaryCenter,
          owner: card.dataset.summaryOwner,
          channel: card.dataset.summaryChannel,
          job: card.dataset.summaryJob
        });
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", ev => {
        if(ev.key === "Enter" || ev.key === " "){
          ev.preventDefault();
          open();
        }
      });
    });
  }

  window.getDashboardControlValue = window.getDashboardControlValue || getDashboardControlValue;
  window.buildDashboardListUrl = window.buildDashboardListUrl || buildDashboardListUrl;
  window.setupSummaryCardLinks = window.setupSummaryCardLinks || setupSummaryCardLinks;
  document.addEventListener("DOMContentLoaded", setupSummaryCardLinks);



  /* 2026-05-09 master dropdown unifier
     全画面のプルダウン候補をDBマスタ起点に統一する。 */
  const MASTER_TABLES = {
    channels: { table:"master_channels", name:"name" },
    channelDetails: { table:"master_channel_details", name:"name" },
    jobTypes: { table:"master_job_types", name:"name" },
    owners: { table:"master_owners", name:"name", fallbackName:"owner_name" },
    statuses: { table:"master_statuses", name:"name" },
    declineReasons: { table:"master_decline_reasons", name:"name" },
    rejectReasons: { table:"master_reject_reasons", name:"name" }
  };
  const MASTER_SELECT_IDS = {
    division: ["division", "divisionFilter", "filterDivision"],
    center: ["center", "centerFilter", "filterCenter", "centerName"],
    channel: ["channel", "channelFilter", "filterChannel", "costChannel"],
    jobType: ["jobType", "job", "filterJobType"],
    owner: ["owner", "ownerFilter", "filterOwner"],
    status: ["status", "filterStatus"],
    declineReason: ["declineReason", "filterDeclineReason"],
    rejectReason: ["rejectReason", "filterRejectReason"]
  };
  function getRecruitSupabaseClient(){
    if(window.sb && window.sb.auth) return window.sb;
    if(window.getRecruitSupabaseClient && window.getRecruitSupabaseClient !== getRecruitSupabaseClient){
      return window.getRecruitSupabaseClient();
    }
    return null;
  }

  window.getRecruitSupabaseClient = window.getRecruitSupabaseClient || getRecruitSupabaseClient;

  let recruitMasterClient = null;
  let recruitMasterCache = null;
  const RECRUIT_MASTER_CACHE_TTL_MS = 5 * 60 * 1000;
  let recruitMasterApplying = false;
  let recruitMasterObserver = null;

  function createRecruitMasterClient(){
    if(recruitMasterClient) return recruitMasterClient;
    recruitMasterClient = window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : getRecruitSupabaseClient();
    return recruitMasterClient;
  }

  async function selectMasterRows(client, table, columns){
    try{
      const selectColumns = columns || "*";
      const { data, error } = await client.from(table).select(selectColumns);
      if(error) throw error;
      const rows = (data || []).filter(isRecruitMasterRowActive);
      return sortRecruitMasterRows(rows);
    }catch(e){
      console.warn(table + " 読込失敗", e);
      return [];
    }
  }

  async function loadMasterNames(client, key){
    const conf = MASTER_TABLES[key];
    if(!conf) return [];
    try{
      const rows = await selectMasterRows(client, conf.table, "*");
      return uniqueClean(rows.map(r => r[conf.name] || (conf.fallbackName ? r[conf.fallbackName] : "")));
    }catch(e){
      console.warn(`${conf.table} 読込失敗`, e);
      return [];
    }
  }

  function orderedOwnerNames(values){
    const names = uniqueClean(values);
    const others = names.filter(v => v === "その他");
    const normal = names.filter(v => v !== "その他").sort((a,b) => a.localeCompare(b, "ja"));
    if(others.length || !normal.length) normal.push("その他");
    return [...new Set(normal)];
  }

  async function loadOwnerNames(client){
    // 担当者候補は master_owners を正とする。
    // テーブル未作成や未登録の場合だけ、画面を落とさないため既定値にフォールバックする。
    const masterOwners = await loadMasterNames(client, "owners");
    if(masterOwners.length) return orderedOwnerNames(masterOwners);
    return orderedOwnerNames(["三浦", "楠本", "伊藤", "その他"]);
  }

  function onclickArg(value){
    return escapeHtml(JSON.stringify(String(value || "")));
  }

  async function loadDivisionCenterMaster(client){
    const result = { divisions:[], divisionRows:[], centersByDivision:{}, centers:[] };
    try{
      const divisions = await selectMasterRows(client, "master_divisions", "id,name,color,display_order,is_active");
      result.divisionRows = (divisions || []).map(r => ({
        id: r.id,
        name: String(r.name || "").trim(),
        color: String(r.color || "").trim()
      })).filter(r => r.name);
      result.divisions = result.divisionRows.map(r => r.name);
      const byId = {};
      result.divisionRows.forEach(r => { byId[String(r.id)] = r.name; });

      const centers = await selectMasterRows(client, "master_centers", "*");
      (centers || []).forEach(r => {
        const center = String(r.center_name || r.name || "").trim();
        const division = String(byId[String(r.division_id)] || r.division || r.division_name || "").trim();
        if(!center || !division) return;
        if(!result.centersByDivision[division]) result.centersByDivision[division] = [];
        result.centersByDivision[division].push(center);
        result.centers.push({
          id: r.id || null,
          center_name:center,
          division,
          center_code: r.center_code || null,
          short_code: r.short_code || null
        });
      });
      Object.keys(result.centersByDivision).forEach(k => {
        result.centersByDivision[k] = [...new Set(result.centersByDivision[k])];
      });
      result.divisions = [...new Set(result.divisions)];
    }catch(e){
      console.warn("本部・営業所マスタ読込失敗", e);
    }
    return result;
  }

  function clearRecruitMasterCache(){
    recruitMasterCache = null;
  }

  window.clearRecruitMasterCache = window.clearRecruitMasterCache || clearRecruitMasterCache;

  async function ensureDefaultStatusMasterRows(client, currentStatuses){
    if(!client || !Array.isArray(window.RECRUIT_STATUS_MASTER_DEFAULTS)) return;
    const existing = new Set((currentStatuses || []).map(v => String(v || "").trim()).filter(Boolean));
    const missing = window.RECRUIT_STATUS_MASTER_DEFAULTS.filter(row => !existing.has(row.name));
    if(!missing.length) return;
    try{
      const { data:{ session } } = await client.auth.getSession();
      const userId = session?.user?.id || "";
      if(!userId) return;
      const { data: profile } = await client
        .from("profiles")
        .select("role,is_active")
        .eq("user_id", userId)
        .maybeSingle();
      if(String(profile?.role || "").toLowerCase() !== "admin" || profile?.is_active === false) return;

      const now = nowIso();
      const rows = missing.map(row => ({
        name: row.name,
        display_order: row.display_order,
        color: row.color,
        is_active: true,
        updated_at: now
      }));
      const { error } = await client.from("master_statuses").insert(rows);
      if(error) throw error;
    }catch(e){
      console.warn("ステータスマスタの既定値追加をスキップしました", e);
    }
  }

  async function loadRecruitMasters(force=false){
    if(recruitMasterCache && !force){
      const loadedAt = new Date(recruitMasterCache.loadedAt || 0).getTime();
      if(loadedAt && Date.now() - loadedAt < RECRUIT_MASTER_CACHE_TTL_MS){
        return recruitMasterCache;
      }
    }
    const client = createRecruitMasterClient();
    if(!client) return null;
    const [divisionCenter, channels, channelDetails, jobTypes, owners, statuses, declineReasons, rejectReasons] = await Promise.all([
      loadDivisionCenterMaster(client),
      loadMasterNames(client, "channels"),
      loadMasterNames(client, "channelDetails"),
      loadMasterNames(client, "jobTypes"),
      loadOwnerNames(client),
      loadMasterNames(client, "statuses"),
      loadMasterNames(client, "declineReasons"),
      loadMasterNames(client, "rejectReasons")
    ]);
    await ensureDefaultStatusMasterRows(client, statuses);
    const mergedStatuses = mergeRecruitStatusNames(statuses);
    recruitMasterCache = { ...divisionCenter, channels, channelDetails, jobTypes, owners, statuses: mergedStatuses, declineReasons, rejectReasons, loadedAt: nowIso() };
    return recruitMasterCache;
  }

  function uniqueClean(values){
    return [...new Set((values || []).map(v => String(v || "").trim()).filter(Boolean))];
  }

  function masterBlankLabel(select, defaultLabel){
    const first = select.querySelector("option[value='']");
    return first ? first.textContent : defaultLabel;
  }

  function setMasterSelectOptions(select, values, blankLabel){
    if(!select || select.tagName !== "SELECT") return;
    if(select.dataset.masterPopulating === "1") return;
    const current = String(select.value || "").trim();
    const list = uniqueClean(values);
    select.dataset.masterPopulating = "1";
    select.innerHTML = `<option value="">${escapeHtml(blankLabel || "すべて")}</option>` + list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    select.value = current && list.includes(current) ? current : "";
    select.dataset.masterPopulating = "0";
  }

  function pageHasAdminMasterForm(select){
    return location.pathname.endsWith("admin_settings.html") && ["centerDivisionId", "divisionActive", "centerActive", "optionActive", "costFiscalYear"].includes(select.id);
  }

  function divisionSelectFor(centerSelect){
    const id = centerSelect.id;
    if(id === "centerName") return document.getElementById("division");
    if(id === "filterCenter") return document.getElementById("filterDivision");
    if(id === "centerFilter") return document.getElementById("divisionFilter");
    if(id === "center") return document.getElementById("division");
    return document.getElementById("division") || document.getElementById("divisionFilter") || document.getElementById("filterDivision");
  }

  function applyRecruitMastersToPage(masters){
    if(!masters || recruitMasterApplying) return;
    recruitMasterApplying = true;
    try{
      document.querySelectorAll("select").forEach(select => {
        if(!select.id || pageHasAdminMasterForm(select)) return;
        if(MASTER_SELECT_IDS.division.includes(select.id)){
          setMasterSelectOptions(select, masters.divisions, masterBlankLabel(select, select.id === "filterDivision" ? "全部" : "選択"));
        }else if(MASTER_SELECT_IDS.center.includes(select.id)){
          const divSelect = divisionSelectFor(select);
          const div = divSelect ? String(divSelect.value || "").trim() : "";
          const centers = div ? (masters.centersByDivision[div] || []) : (masters.centers || []).map(r => r.center_name);
          setMasterSelectOptions(select, centers, masterBlankLabel(select, select.id === "filterCenter" ? "全営業所" : "選択"));
        }else if(MASTER_SELECT_IDS.channel.includes(select.id)){
          setMasterSelectOptions(select, masters.channels, masterBlankLabel(select, select.id === "costChannel" ? "選択してください" : "すべて"));
        }else if(MASTER_SELECT_IDS.jobType.includes(select.id)){
          setMasterSelectOptions(select, masters.jobTypes, masterBlankLabel(select, "すべて"));
        }else if(MASTER_SELECT_IDS.owner.includes(select.id)){
          setMasterSelectOptions(select, orderedOwnerNames(masters.owners), masterBlankLabel(select, "すべて"));
        }else if(MASTER_SELECT_IDS.status.includes(select.id)){
          setMasterSelectOptions(select, window.mergeRecruitStatusNames ? window.mergeRecruitStatusNames(masters.statuses) : masters.statuses, masterBlankLabel(select, "選択"));
        }else if(MASTER_SELECT_IDS.declineReason.includes(select.id)){
          setMasterSelectOptions(select, masters.declineReasons, masterBlankLabel(select, "未選択"));
        }else if(MASTER_SELECT_IDS.rejectReason.includes(select.id)){
          setMasterSelectOptions(select, masters.rejectReasons, masterBlankLabel(select, "未選択"));
        }
      });

      const detailList = document.getElementById("channelDetailList");
      if(detailList){
        const activeId = document.activeElement && document.activeElement.id;
        const channelDetailValues = uniqueClean(masters.channelDetails);
        const signature = channelDetailValues.join("||");

        // datalist は input フォーカス中に innerHTML を差し替えると、
        // Chrome 側で候補リストが「開く→閉じる」を繰り返すため、
        // 候補内容が変わった時だけ更新し、媒体詳細入力中は更新を保留する。
        if(detailList.dataset.masterSignature !== signature && activeId !== "channelDetail"){
          detailList.dataset.masterSignature = signature;
          detailList.innerHTML = channelDetailValues.map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
        }
      }

      const jobWrap = document.getElementById("jobTypeChoiceWrap");
      if(jobWrap){
        const current = document.getElementById("jobType")?.value || "";
        const activeJobTypes = uniqueClean(masters.jobTypes);
        const signature = activeJobTypes.join("||");
        if(jobWrap.dataset.masterSignature !== signature){
          jobWrap.dataset.masterSignature = signature;
          jobWrap.innerHTML = activeJobTypes.map(v => `<button class="choice-pill" type="button" data-job-type="${escapeHtml(v)}" onclick="setJobType('${String(v).replace(/'/g, "\'")}')">${escapeHtml(v)}</button>`).join("");
        }
        if(current && activeJobTypes.includes(current) && typeof window.setJobType === "function"){
          window.setJobType(current);
        }
        if(current && !activeJobTypes.includes(current)){
          const hidden = document.getElementById("jobType");
          if(hidden) hidden.value = "";
          document.querySelectorAll("#jobTypeChoiceWrap .choice-pill").forEach(btn => btn.classList.remove("is-active"));
        }
      }


      const ownerWrap = document.getElementById("ownerChoiceWrap");
      if(ownerWrap){
        const current = document.getElementById("ownerName")?.value || "";
        const activeOwners = orderedOwnerNames(masters.owners);
        const signature = activeOwners.join("||");
        if(ownerWrap.dataset.masterSignature !== signature){
          ownerWrap.dataset.masterSignature = signature;
          ownerWrap.innerHTML = activeOwners.map(v => `<button class="choice-pill" type="button" data-owner-name="${escapeHtml(v)}" onclick="setOwner(${onclickArg(v)})">${escapeHtml(v)}</button>`).join("");
        }
        if(current && activeOwners.includes(current) && typeof window.setOwner === "function"){
          window.setOwner(current);
        }
        if(current && !activeOwners.includes(current)){
          const hidden = document.getElementById("ownerName");
          if(hidden) hidden.value = "";
          document.querySelectorAll("#ownerChoiceWrap .choice-pill").forEach(btn => btn.classList.remove("is-active"));
        }
      }
    }finally{
      recruitMasterApplying = false;
    }
  }

  async function refreshRecruitMasterDropdowns(force=false){
    const masters = await loadRecruitMasters(force);
    if(masters) applyRecruitMastersToPage(masters);
    return masters;
  }

  function bindRecruitMasterDropdowns(){
    document.addEventListener("change", ev => {
      const id = ev.target && ev.target.id;
      if(["division", "divisionFilter", "filterDivision"].includes(id)){
        refreshRecruitMasterDropdowns(false);
      }
    });
    if(recruitMasterObserver) recruitMasterObserver.disconnect();
    recruitMasterObserver = new MutationObserver(() => {
      if(recruitMasterApplying) return;
      window.clearTimeout(bindRecruitMasterDropdowns._timer);
      bindRecruitMasterDropdowns._timer = window.setTimeout(() => refreshRecruitMasterDropdowns(false), 80);
    });
    recruitMasterObserver.observe(document.body, { childList:true, subtree:true });
  }

  function startRecruitMasterDropdowns(){
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if(createRecruitMasterClient()){
        window.clearInterval(timer);
        bindRecruitMasterDropdowns();
        refreshRecruitMasterDropdowns(true);
        window.setTimeout(() => refreshRecruitMasterDropdowns(false), 600);
        window.setTimeout(() => refreshRecruitMasterDropdowns(false), 1800);
        window.setTimeout(() => refreshRecruitMasterDropdowns(false), 5000);
      }else if(tries > 50){
        window.clearInterval(timer);
      }
    }, 100);
  }



  /* 2026-05-10 Phase1 master common API
     画面別に残っている load/save/render/select 処理から呼び出せる共通口を用意する。 */
  const RECRUIT_MASTER_ALIASES = {
    division:"divisions",
    divisions:"divisions",
    center:"centers",
    centers:"centers",
    channel:"channels",
    channels:"channels",
    channelDetail:"channelDetails",
    channelDetails:"channelDetails",
    jobType:"jobTypes",
    jobTypes:"jobTypes",
    status:"statuses",
    statuses:"statuses",
    declineReason:"declineReasons",
    declineReasons:"declineReasons",
    rejectReason:"rejectReasons",
    rejectReasons:"rejectReasons",
    owner:"owners",
    owners:"owners"
  };

  function normalizeRecruitMasterKey(type){
    return RECRUIT_MASTER_ALIASES[String(type || "").trim()] || String(type || "").trim();
  }

  function sortRecruitMasterRows(rows, nameKey){
    return [...(rows || [])].sort((a,b) => {
      const ao = Number(a.sort_order ?? a.display_order ?? a.order_no ?? 9999);
      const bo = Number(b.sort_order ?? b.display_order ?? b.order_no ?? 9999);
      if(ao !== bo) return ao - bo;
      const av = String((nameKey ? a[nameKey] : "") || a.name || a.center_name || a.label || a.id || "");
      const bv = String((nameKey ? b[nameKey] : "") || b.name || b.center_name || b.label || b.id || "");
      return av.localeCompare(bv, "ja");
    });
  }

  function isRecruitMasterRowActive(row){
    if(!row) return false;
    if(row.is_deleted === true) return false;
    if(row.deleted_at) return false;
    if(row.is_active === false) return false;
    return true;
  }

  async function getRecruitMasterList(type, options={}){
    const key = normalizeRecruitMasterKey(type);
    const masters = await loadRecruitMasters(Boolean(options.force));
    if(!masters) return [];
    if(key === "centers") return uniqueClean((masters.centers || []).map(r => r.center_name));
    return uniqueClean(masters[key] || []);
  }

  async function getRecruitDivisionCenterMaster(options={}){
    const masters = await loadRecruitMasters(Boolean(options.force));
    return {
      divisions: uniqueClean(masters?.divisions || []),
      divisionRows: masters?.divisionRows || [],
      centersByDivision: masters?.centersByDivision || {},
      centers: masters?.centers || []
    };
  }



  async function loadRecruitCenterMasterState(options={}){
    try{
      const master = await getRecruitDivisionCenterMaster({ force: Boolean(options.force) });
      const centersByDivision = master.centersByDivision || {};
      if(typeof options.assignCenterMaster === "function"){
        options.assignCenterMaster(centersByDivision);
      }
      if(typeof options.assignDivisions === "function"){
        options.assignDivisions(uniqueClean(master.divisions || Object.keys(centersByDivision)));
      }
      return master.centers || [];
    }catch(e){
      if(typeof options.assignCenterMaster === "function"){
        options.assignCenterMaster({});
      }
      if(typeof options.assignDivisions === "function"){
        options.assignDivisions([]);
      }
      console.warn("loadRecruitCenterMasterState failed", e);
      return [];
    }
  }

  async function getRecruitDivisionByCenter(centerName, options={}){
    const center = String(centerName || "").trim();
    if(!center) return "";
    const master = await getRecruitDivisionCenterMaster(options);
    const hit = (master.centers || []).find(r => String(r.center_name || "").trim() === center);
    if(hit && hit.division) return String(hit.division || "").trim();
    for(const [division, centers] of Object.entries(master.centersByDivision || {})){
      if((centers || []).map(v => String(v || "").trim()).includes(center)) return division;
    }
    return "";
  }

  async function normalizeRecruitCandidateMasters(row, options={}){
    const next = Object.assign({}, row || {});
    if(next.center_name && !next.division){
      next.division = await getRecruitDivisionByCenter(next.center_name, options);
    }
    return next;
  }

  async function renderRecruitMasterSelect(args){
    const opt = args || {};
    const target = typeof opt.target === "string" ? document.querySelector(opt.target) : opt.target;
    if(!target) return [];
    let values = [];
    const key = normalizeRecruitMasterKey(opt.type);
    if(key === "centers"){
      const dc = await getRecruitDivisionCenterMaster({ force: opt.force });
      const division = opt.division || "";
      values = division ? (dc.centersByDivision[division] || []) : (dc.centers || []).map(r => r.center_name);
    }else{
      values = await getRecruitMasterList(key, { force: opt.force });
    }
    setMasterSelectOptions(target, values, opt.blankLabel || masterBlankLabel(target, "すべて"));
    return values;
  }

  function notifyRecruitMasterUpdated(detail={}){
    clearRecruitMasterCache();
    window.dispatchEvent(new CustomEvent("recruit:master-updated", { detail }));
  }

  window.RecruitMaster = Object.assign(window.RecruitMaster || {}, {
    load: loadRecruitMasters,
    list: getRecruitMasterList,
    divisionCenter: getRecruitDivisionCenterMaster,
    loadCenterMaster: loadRecruitCenterMasterState,
    divisionByCenter: getRecruitDivisionByCenter,
    normalizeCandidate: normalizeRecruitCandidateMasters,
    renderSelect: renderRecruitMasterSelect,
    refreshDropdowns: refreshRecruitMasterDropdowns,
    applyToPage: applyRecruitMastersToPage,
    clearCache: clearRecruitMasterCache,
    notifyUpdated: notifyRecruitMasterUpdated,
    isActive: isRecruitMasterRowActive,
    sortRows: sortRecruitMasterRows
  });

  window.addEventListener("recruit:master-updated", () => {
    clearRecruitMasterCache();
    refreshRecruitMasterDropdowns(true);
  });

  document.addEventListener("DOMContentLoaded", startRecruitMasterDropdowns);



  /* 2026-05-14 cost master shared logic
     channel_costs の年月・費用・媒体キーを全画面で同じ解釈にする。 */
  function recruitCostMonthKey(row){
    const r = row || {};
    const rawMonth = String(r.target_month || r.cost_month || "").trim();
    if(/^\d{4}-\d{2}/.test(rawMonth)) return rawMonth.slice(0,7);

    const fy = Number(r.fiscal_year || r.year || 0);
    const monthNumber = Number(r.month || "");
    if(fy && monthNumber){
      const calendarYear = monthNumber >= 4 ? fy : fy + 1;
      return `${calendarYear}-${String(monthNumber).padStart(2,"0")}`;
    }
    return "";
  }

  function recruitCostFiscalYearFromMonth(monthKey){
    const y = Number(String(monthKey || "").slice(0,4));
    const m = Number(String(monthKey || "").slice(5,7));
    if(!y || !m) return null;
    return m >= 4 ? y : y - 1;
  }

  function recruitCostMonthKeysBetween(startDate, endDate){
    const start = String(startDate || "").slice(0,7);
    const end = String(endDate || "").slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) return [];
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    const keys = [];
    let y = sy, m = sm;
    while(y < ey || (y === ey && m <= em)){
      keys.push(`${y}-${String(m).padStart(2,"0")}`);
      m += 1;
      if(m > 12){ m = 1; y += 1; }
    }
    return keys;
  }

  function recruitCostSplitAmount(total, count, index){
    const amount = Math.round(Number(total || 0));
    const n = Number(count || 0);
    if(!n) return 0;
    const base = Math.floor(amount / n);
    const remainder = amount - base * n;
    return base + (index < remainder ? 1 : 0);
  }

  function recruitNormalizeCostChannel(value){
    const s = String(value || "").trim();
    if(!s) return "未設定";
    if(s === "Indeed") return "テンリク";
    return s;
  }

  function recruitCostAmount(row){
    return Number((row || {}).cost_amount || (row || {}).amount || (row || {}).cost || 0);
  }

  function recruitIsActiveCostRow(row){
    if(!row) return false;
    if(row.is_deleted === true || row.deleted_at) return false;
    if(row.is_active === false) return false;
    return true;
  }

  function recruitCostRowInRange(row, options){
    const opt = options || {};
    const monthKey = recruitCostMonthKey(row);
    const fy = opt.fiscalYear == null || opt.fiscalYear === "" ? null : Number(opt.fiscalYear);
    const month = opt.month == null || opt.month === "" ? null : Number(opt.month);
    const from = String(opt.from || "").slice(0,7);
    const to = String(opt.to || "").slice(0,7);

    if(monthKey){
      if(fy && recruitCostFiscalYearFromMonth(monthKey) !== fy) return false;
      if(month && Number(monthKey.slice(5,7)) !== month) return false;
      if(from && monthKey < from) return false;
      if(to && monthKey > to) return false;
      return true;
    }

    const rowFy = Number((row || {}).fiscal_year || (row || {}).year || 0);
    const rowMonth = Number((row || {}).month || 0);
    if(fy && rowFy && rowFy !== fy) return false;
    if(month && rowMonth && rowMonth !== month) return false;
    return true;
  }

  function buildRecruitCostMap(costRows, options){
    const opt = options || {};
    const map = new Map();
    (costRows || []).filter(recruitIsActiveCostRow).forEach(row => {
      if(!recruitCostRowInRange(row, opt)) return;
      const monthKey = recruitCostMonthKey(row);
      const channelKey = recruitNormalizeCostChannel(row.channel || row.media || row.channel_name);
      const parts = [];
      if(opt.byMonth) parts.push(monthKey || "");
      parts.push(channelKey);
      const key = parts.join("||");
      map.set(key, (map.get(key) || 0) + recruitCostAmount(row));
    });
    return map;
  }

  function enrichRecruitCostGroups(groups, costRows, options){
    const opt = options || {};
    const months = Array.isArray(opt.months) ? opt.months : [];
    const costMap = buildRecruitCostMap(costRows, Object.assign({}, opt, { byMonth: !!months.length }));
    return (groups || []).map(group => {
      const channelKey = recruitNormalizeCostChannel(opt.channelForGroup ? opt.channelForGroup(group) : group.key);
      let cost = 0;
      if(months.length){
        months.forEach(month => { cost += Number(costMap.get(month + "||" + channelKey) || 0); });
      }else{
        cost = Number(costMap.get(channelKey) || 0);
      }
      const applied = Number(group.applied || 0);
      const join = Number(group.join || 0);
      return Object.assign({}, group, {
        cost,
        cpa: applied ? Math.round(cost / applied) : 0,
        cph: join ? Math.round(cost / join) : 0
      });
    });
  }

  window.RecruitCost = Object.assign(window.RecruitCost || {}, {
    monthKey: recruitCostMonthKey,
    fiscalYearFromMonth: recruitCostFiscalYearFromMonth,
    monthKeysBetween: recruitCostMonthKeysBetween,
    splitAmount: recruitCostSplitAmount,
    normalizeChannel: recruitNormalizeCostChannel,
    amount: recruitCostAmount,
    isActive: recruitIsActiveCostRow,
    inRange: recruitCostRowInRange,
    buildMap: buildRecruitCostMap,
    enrichGroups: enrichRecruitCostGroups
  });

  /* role guard / viewer mode */
  function normalizeRecruitRole(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.normalize === "function"){
      return window.RecruitOpsGuard.normalize(role);
    }
    return String(role || window.currentRole || "viewer").toLowerCase();
  }

  function isRecruitViewer(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.isViewer === "function"){
      return window.RecruitOpsGuard.isViewer(role);
    }
    return normalizeRecruitRole(role) === "viewer";
  }

  function isRecruitAdmin(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.isAdmin === "function"){
      return window.RecruitOpsGuard.isAdmin(role);
    }
    return normalizeRecruitRole(role) === "admin";
  }

  function isRecruitManager(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.isManager === "function"){
      return window.RecruitOpsGuard.isManager(role);
    }
    return false;
  }

  function applyRecruitRoleGuard(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.applyToPage === "function"){
      return window.RecruitOpsGuard.applyToPage(role);
    }
    const r = normalizeRecruitRole(role);
    document.body.classList.toggle("role-viewer", r === "viewer");
    document.body.classList.toggle("role-editor", r === "editor");
    document.body.classList.toggle("role-manager", r === "manager");
    document.body.classList.toggle("role-admin", r === "admin");
  }

  async function writeRecruitAuditLog(actionType, targetType, targetId, detail){
    if(window.RecruitAudit && window.RecruitAudit.write){
      return window.RecruitAudit.write(actionType, targetType, targetId, detail);
    }
    try{
      const client = createRecruitMasterClient();
      if(!client) return false;
      const { data:{ session } } = await client.auth.getSession();
      const user = session && session.user ? session.user : null;
      const payload = {
        user_id: user?.id || null,
        user_email: user?.email || null,
        action_type: actionType,
        target_type: targetType,
        target_id: targetId == null ? null : String(targetId),
        detail_json: detail || {}
      };
      const { error } = await client.from("audit_logs").insert(payload);
      return !error;
    }catch(e){
      console.warn("audit_logs insert skipped", e);
      return false;
    }
  }

  function diffRecruitObjects(before, after, keys){
    const diff = {};
    (keys || Object.keys(after || {})).forEach(key => {
      const b = before ? before[key] : undefined;
      const a = after ? after[key] : undefined;
      if(String(b ?? "") !== String(a ?? "")) diff[key] = { before:b ?? null, after:a ?? null };
    });
    return diff;
  }

  window.RecruitDate = window.RecruitDate || {
    timeZone: RECRUIT_TIME_ZONE,
    todayJST,
    nowIso,
    formatJSTDate,
    formatJSTDateTime,
    formatJSTDateTimeMinute,
    normalizeDateForCalc
  };

  window.todayJST = window.todayJST || todayJST;
  window.nowIsoJSTSafe = window.nowIsoJSTSafe || nowIso;
  window.formatJSTDate = window.formatJSTDate || formatJSTDate;
  window.formatJSTDateTime = window.formatJSTDateTime || formatJSTDateTime;

  window.RecruitRole = window.RecruitOpsGuard || window.RecruitRole || {
    apply: applyRecruitRoleGuard,
    applyToPage: applyRecruitRoleGuard,
    isViewer: isRecruitViewer,
    isAdmin: isRecruitAdmin,
    isManager: isRecruitManager,
    normalize: normalizeRecruitRole
  };
  window.writeRecruitAuditLog = window.writeRecruitAuditLog || writeRecruitAuditLog;
  window.diffRecruitObjects = window.diffRecruitObjects || diffRecruitObjects;
  document.addEventListener("DOMContentLoaded", () => {
    setupRecruitFiscalYearSelectLabels();
    window.setTimeout(() => {
      if(window.RecruitOpsGuard) window.RecruitRole = window.RecruitOpsGuard;
      applyRecruitRoleGuard();
    }, 120);
    window.setTimeout(() => {
      if(window.RecruitOpsGuard) window.RecruitRole = window.RecruitOpsGuard;
      applyRecruitRoleGuard();
    }, 1000);
  });

})();

/* overdue next-action popup : common across screens, no sidebar badge */
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


/* RecruitRole : lightweight role helpers for front-end visibility control.
   RLS本整理の前段として、各画面の表示・操作可否判定を共通化する。 */
(function(){
  function role(){
    return String(window.currentRole || window.RecruitAuth?.currentRole || "viewer").trim().toLowerCase();
  }
  function hasRole(allowed){
    const list = Array.isArray(allowed) ? allowed : String(allowed || "").split(",");
    return list.map(v => String(v || "").trim().toLowerCase()).filter(Boolean).includes(role());
  }
  function isAdmin(){ return hasRole("admin"); }
  function isEditor(){ return hasRole(["admin","editor"]); }
  function isViewer(){ return role() === "viewer"; }
  window.RecruitRole = Object.assign(window.RecruitRole || {}, { role, hasRole, isAdmin, isEditor, isViewer });
  window.hasRole = window.hasRole || hasRole;
  window.isAdmin = window.isAdmin || isAdmin;
  window.isEditor = window.isEditor || isEditor;
  window.isViewer = window.isViewer || isViewer;
})();

/* RecruitDashboard : dashboard/list helper functions shared across analysis pages */
(function(){
  function escape(value){
    if(window.escapeHtml) return window.escapeHtml(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function uniqueSorted(values){
    return [...new Set((values || [])
      .map(v => String(v ?? "").trim())
      .filter(Boolean))]
      .sort((a,b) => a.localeCompare(b, "ja"));
  }
  function setSelectOptions(idOrEl, values, options={}){
    const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
    if(!el) return [];
    const blankLabel = options.blankLabel ?? "すべて";
    const keepValue = options.keepValue ?? el.value;
    const list = uniqueSorted(values);
    el.innerHTML = `<option value="">${escape(blankLabel)}</option>` +
      list.map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join("");
    if(list.includes(keepValue)) el.value = keepValue;
    return list;
  }
  function getFiscalRange(mode){
    if(typeof window.fiscalYear !== "function"){
      return { fy:null, label:"全期間", from:"", to:"" };
    }
    const fy = window.fiscalYear();
    if(mode === "previous") return { fy:fy - 1, label:(fy - 1) + "年度", from:(fy - 1) + "-04-01", to:fy + "-03-31" };
    if(mode === "all") return { fy:null, label:"全期間", from:"", to:"" };
    return { fy, label:fy + "年度", from:fy + "-04-01", to:(fy + 1) + "-03-31" };
  }
  function readFilterValue(id){
    const el = document.getElementById(id);
    return el ? String(el.value || "") : "";
  }
  function matchesBasicCandidateFilters(row, filters={}){
    if(!row || row.is_deleted) return false;
    const applied = String(row.applied_date || "").slice(0,10);
    if(filters.requireAppliedDate !== false && !/^\d{4}-\d{2}-\d{2}$/.test(applied)) return false;
    if(filters.from && applied < filters.from) return false;
    if(filters.to && applied > filters.to) return false;
    if(filters.division && String(row.division || "") !== filters.division) return false;
    if(filters.center && String(row.center_name || "") !== filters.center) return false;
    if(filters.owner && String(row.owner_name || "未設定") !== filters.owner) return false;
    if(filters.channel && String(row.channel || "未設定") !== filters.channel) return false;
    if(filters.job && String(row.job_type || "") !== filters.job) return false;
    return true;
  }
  function stageMetrics(rows){
    const list = (rows || []).filter(r => r && !r.is_deleted);
    return {
      applied: list.filter(r => window.isRecruitStageReached ? window.isRecruitStageReached(r, "応募") : true).length,
      appointment: list.filter(r => window.isRecruitStageReached && window.isRecruitStageReached(r, "アポ取得")).length,
      interviewSet: list.filter(r => window.isRecruitStageReached && window.isRecruitStageReached(r, "面接設定")).length,
      interviewDone: list.filter(r => window.isRecruitStageReached && window.isRecruitStageReached(r, "面接実施")).length,
      offer: list.filter(r => window.isRecruitStageReached && window.isRecruitStageReached(r, "内定")).length,
      hired: list.filter(r => window.isRecruitHired && window.isRecruitHired(r)).length,
      hiringDecision: list.filter(r => window.isRecruitHiringDecision && window.isRecruitHiringDecision(r)).length,
      pendingJoin: list.filter(r => window.isRecruitPendingJoin && window.isRecruitPendingJoin(r)).length,
      noContact: list.filter(r => window.isRecruitNoContact && window.isRecruitNoContact(r)).length,
      declined: list.filter(r => window.isRecruitDeclined && window.isRecruitDeclined(r)).length,
      rejected: list.filter(r => window.isRecruitRejected && window.isRecruitRejected(r)).length
    };
  }
  function pct(num, den, digits=1){
    const n = Number(num || 0);
    const d = Number(den || 0);
    if(!d) return 0;
    return Number(((n / d) * 100).toFixed(digits));
  }
  function renderMetricCardHTML({label, value, rate, className="", sub=""}={}){
    const rateText = rate === undefined || rate === null ? "" : `<span class="metric-rate">${escape(rate)}%</span>`;
    const subText = sub ? `<div class="metric-sub">${escape(sub)}</div>` : "";
    return `<div class="metric-card ${escape(className)}"><div class="metric-label">${escape(label || "")}</div><div class="metric-value">${escape(value ?? 0)}</div>${rateText}${subText}</div>`;
  }
  window.RecruitDashboard = Object.assign(window.RecruitDashboard || {}, {
    escape,
    uniqueSorted,
    setSelectOptions,
    getFiscalRange,
    readFilterValue,
    matchesBasicCandidateFilters,
    stageMetrics,
    pct,
    renderMetricCardHTML
  });
})();
