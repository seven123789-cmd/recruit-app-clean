// assets/js/candidate_utils.js
(function(){

function escapeAttr(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function formatDate(value){
  return value || "-";
}

function todayStr(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+day;
}

function validDate(v){
  if(!v)return false;
  const d=new Date(String(v)+"T00:00:00");
  return !Number.isNaN(d.getTime());
}

function daysBetween(from,to){
  if(!validDate(from)||!validDate(to))return null;
  const a=new Date(String(from)+"T00:00:00");
  const b=new Date(String(to)+"T00:00:00");
  return Math.floor((b-a)/86400000);
}

function isFinal(row){
  const status=String(row?.status||"");
  const result=String(row?.hiring_result||"");
  return ["入社","辞退","不通"].includes(status) || ["採用","不採用"].includes(result) || !!row?.join_date;
}

function setChoiceActive(selector, value, attrName){
  document.querySelectorAll(selector).forEach(btn => {
    btn.classList.toggle("is-active", btn.getAttribute(attrName) === value);
  });
}

function toggleOtherInput(selectId, wrapId, triggerValue, rowId){
  const select = document.getElementById(selectId);
  const wrap = document.getElementById(wrapId);
  if (!select || !wrap) return;

  const shouldShow = select.value === triggerValue;
  wrap.classList.toggle("hidden-input", !shouldShow);

  if (!shouldShow) {
    const input = wrap.querySelector("input, textarea, select");
    if (input) input.value = "";
  }

  if (rowId && window.syncOtherInputRow) {
    window.syncOtherInputRow(rowId);
  }
}

function getOtherSelectValue(selectId, freeInputId, triggerValue){
  const selected = document.getElementById(selectId)?.value || "";
  if (selected === triggerValue) {
    return document.getElementById(freeInputId)?.value.trim() || "";
  }
  return selected;
}

function getSelectedJobType(){
  const selected = document.getElementById("jobType")?.value || "";
  if (selected === "その他") return document.getElementById("jobTypeFree")?.value.trim() || "";
  return selected;
}

function getSelectedOwnerName(){
  const selected = document.getElementById("ownerName")?.value || "";
  if (selected === "その他") return document.getElementById("ownerNameFree")?.value.trim() || "";
  return selected;
}

function getSelectedDivision(){
  return document.getElementById("division")?.value || "";
}

function getSelectedCenterName(){
  return document.getElementById("centerName")?.value || "";
}

function getSelectedChannel(){
  return document.getElementById("channel")?.value || "";
}

function setJobType(value){
  const hidden = document.getElementById("jobType");
  const free = document.getElementById("jobTypeFree");
  if (!hidden || !free) return;

  hidden.value = value || "";
  free.value = "";

  setChoiceActive("#jobTypeChoiceWrap .choice-pill", hidden.value, "data-job-type");
  toggleOtherInput("jobType", "jobTypeFree", "その他", "rowJobType");
}

function setOwner(value){
  const hidden = document.getElementById("ownerName");
  const free = document.getElementById("ownerNameFree");
  if (!hidden || !free) return;

  hidden.value = value || "";
  free.value = "";

  setChoiceActive("#ownerChoiceWrap .choice-pill", hidden.value, "data-owner-name");
  toggleOtherInput("ownerName", "ownerNameFree", "その他", "rowOwner");
}

function normalizeDate(value){
  if(!value) return "";
  const d = new Date(String(value));
  if(Number.isNaN(d.getTime())) return String(value).slice(0,10);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function normalizePersonName(value){
  return String(value ?? "")
    .replace(/[\u3000\s]+/g, " ")
    .trim();
}

function normalizeCandidatePayload(payload){
  const out = {...(payload || {})};
  [
    "applied_date",
    "appointment_date",
    "interview_date",
    "interview_done_date",
    "offer_date",
    "join_date",
    "next_action_date",
    "last_contact_date"
  ].forEach(key => {
    if(key in out) out[key] = normalizeDate(out[key]);
  });
  return out;
}

function validateCandidatePayload(payload, options = {}){
  const p = payload || {};
  const errors = [];

  if(options.requireName !== false && !String(p.name || "").trim()){
    errors.push({field:"name", message:"氏名を入力してください。"});
  }

  if(p.status === "入社" && !p.join_date){
    errors.push({field:"join_date", message:"入社の場合は入社日を入力してください。"});
  }

  if(p.status === "内定" && !p.offer_date){
    errors.push({field:"offer_date", message:"内定の場合は内定日を入力してください。"});
  }

  if(p.status === "辞退" && !p.decline_reason){
    errors.push({field:"decline_reason", message:"辞退の場合は辞退理由を入力してください。"});
  }

  if(p.hiring_result === "不採用" && !p.rejection_reason){
    errors.push({field:"rejection_reason", message:"不採用の場合は不採用理由を入力してください。"});
  }

  if((p.hiring_result === "採用" || p.status === "内定" || p.status === "入社") && !p.interview_done_date){
    errors.push({field:"interview_done_date", message:"採用・内定・入社の場合は面接実施日を入力してください。"});
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

window.CandidateUtils = {
  escapeAttr,
  formatDate,
  todayStr,
  validDate,
  daysBetween,
  isFinal,
  setChoiceActive,
  toggleOtherInput,
  getOtherSelectValue,
  getSelectedJobType,
  getSelectedOwnerName,
  getSelectedDivision,
  getSelectedCenterName,
  getSelectedChannel,
  setJobType,
  setOwner,
  normalizeDate,
  normalizePersonName,
  normalizeCandidatePayload,
  validateCandidatePayload
};

// Backward compatible globals used by existing pages.
window.escapeAttr = window.escapeAttr || escapeAttr;
window.formatDate = window.formatDate || formatDate;
window.opsTodayStr = window.opsTodayStr || todayStr;
window.opsValidDate = window.opsValidDate || validDate;
window.opsDaysBetween = window.opsDaysBetween || daysBetween;
window.opsIsFinal = window.opsIsFinal || isFinal;
window.setChoiceActive = window.setChoiceActive || setChoiceActive;
window.toggleOtherInput = window.toggleOtherInput || toggleOtherInput;
window.getOtherSelectValue = window.getOtherSelectValue || getOtherSelectValue;
window.getSelectedJobType = window.getSelectedJobType || getSelectedJobType;
window.getSelectedOwnerName = window.getSelectedOwnerName || getSelectedOwnerName;
window.getSelectedDivision = window.getSelectedDivision || getSelectedDivision;
window.getSelectedCenterName = window.getSelectedCenterName || getSelectedCenterName;
window.getSelectedChannel = window.getSelectedChannel || getSelectedChannel;
window.setJobType = window.setJobType || setJobType;
window.setOwner = window.setOwner || setOwner;
window.normalizePersonName = window.normalizePersonName || normalizePersonName;

})();
