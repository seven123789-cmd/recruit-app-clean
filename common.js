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

  function daysBetween(a,b){
    const fromText = normalizeDateText(a);
    const toText = normalizeDateText(b);
    if(!fromText || !toText) return null;
    const from = new Date(fromText + "T00:00:00");
    const to = new Date(toText + "T00:00:00");
    const diff = Math.floor((to - from) / 86400000);
    return Number.isNaN(diff) ? null : diff;
  }

  function fiscalYear(d = new Date()){
    const date = d instanceof Date ? d : new Date(String(d) + "T00:00:00");
    if(Number.isNaN(date.getTime())) return new Date().getFullYear();
    return date.getMonth() + 1 >= 4 ? date.getFullYear() : date.getFullYear() - 1;
  }

  function getFiscalYearFromDate(d){
    return fiscalYear(d);
  }

  function isFinal(row){
    const r = row || {};
    return ["入社","辞退","不通"].includes(String(r.status || "")) || r.hiring_result === "不採用";
  }




  function getRecruitCurrentFiscalYear(){
    return fiscalYear(new Date());
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
    recruitMasterCache = { ...divisionCenter, channels, channelDetails, jobTypes, owners, statuses, declineReasons, rejectReasons, loadedAt: new Date().toISOString() };
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
          setMasterSelectOptions(select, masters.statuses, masterBlankLabel(select, "未設定"));
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
