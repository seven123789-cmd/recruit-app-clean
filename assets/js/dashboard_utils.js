// assets/js/dashboard_utils.js
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
  function calcRateNumber(num, den){
    const n = Number(num || 0);
    const d = Number(den || 0);
    if(!d) return 0;
    return (n / d) * 100;
  }
  function calcRateText(num, den){
    return calcRateNumber(num, den).toFixed(1) + "%";
  }
  function calcRecruitFlowMetrics(rows){
    const activeRows = (rows || []).filter(r => r && !r.is_deleted);
    const applied = activeRows.filter(r => window.isValidDate ? window.isValidDate(r.applied_date) : window.isValidRecruitDate(r.applied_date)).length;
    const reached = (row, stage) => window.isRecruitStageReached ? window.isRecruitStageReached(row, stage) : false;
    const metrics = {
      applied,
      appointment: activeRows.filter(r => reached(r, "アポ取得")).length,
      interviewSet: activeRows.filter(r => reached(r, "面接設定")).length,
      interviewDone: activeRows.filter(r => reached(r, "面接実施")).length,
      offer: activeRows.filter(r => reached(r, "内定")).length,
      hired: activeRows.filter(r => window.isRecruitHired ? window.isRecruitHired(r) : reached(r, "採用")).length
    };
    metrics.rates = {
      appointment: calcRateText(metrics.appointment, applied),
      interviewSet: calcRateText(metrics.interviewSet, applied),
      interviewDone: calcRateText(metrics.interviewDone, applied),
      offer: calcRateText(metrics.offer, applied),
      hired: calcRateText(metrics.hired, applied)
    };
    return metrics;
  }
  function applyRecruitFlowMetrics(mapOrPrefix, metrics){
    const m = metrics || {};
    const r = m.rates || {};
    const map = typeof mapOrPrefix === "object" && mapOrPrefix
      ? mapOrPrefix
      : {
        flowApplied:"flowApplied", flowAppointment:"flowAppointment", flowInterviewSet:"flowInterviewSet",
        flowInterviewDone:"flowInterviewDone", flowOffer:"flowOffer", flowHired:"flowJoin",
        rateAppointment:"rateAppointment", rateInterviewSet:"rateInterviewSet", rateInterviewDone:"rateInterviewDone",
        rateOffer:"rateOffer", rateHired:"rateJoin"
      };
    const set = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
    set(map.flowApplied, m.applied || 0);
    set(map.flowAppointment, m.appointment || 0);
    set(map.flowInterviewSet, m.interviewSet || 0);
    set(map.flowInterviewDone, m.interviewDone || 0);
    set(map.flowOffer, m.offer || 0);
    set(map.flowHired, m.hired || 0);
    set(map.rateAppointment, r.appointment || "0.0%");
    set(map.rateInterviewSet, r.interviewSet || "0.0%");
    set(map.rateInterviewDone, r.interviewDone || "0.0%");
    set(map.rateOffer, r.offer || "0.0%");
    set(map.rateHired, r.hired || "0.0%");
  }
  window.RecruitDashboard = Object.assign(window.RecruitDashboard || {}, {
    escape,
    uniqueSorted,
    setSelectOptions,
    getFiscalRange,
    readFilterValue,
    matchesBasicCandidateFilters,
    calcRateNumber,
    calcRateText,
    calcRecruitFlowMetrics,
    applyRecruitFlowMetrics
  });
})();
