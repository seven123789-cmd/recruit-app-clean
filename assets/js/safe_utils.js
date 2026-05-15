// assets/js/safe_utils.js
(function(){

function text(value, fallback = ""){
  if(value === undefined || value === null) return fallback;
  return String(value);
}

function trim(value){
  return text(value).trim();
}

function array(value){
  return Array.isArray(value) ? value : [];
}

function el(id){
  return document.getElementById(id);
}

function setText(id, value, fallback = ""){
  const node = el(id);
  if(!node) return false;
  node.textContent = text(value, fallback);
  return true;
}

function setValue(id, value, fallback = ""){
  const node = el(id);
  if(!node) return false;
  node.value = text(value, fallback);
  return true;
}

function date(value){
  if(!value) return "";
  const d = new Date(String(value));
  if(Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function number(value, fallback = 0){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeJsonParse(value, fallback = null){
  try{
    return JSON.parse(value);
  }catch(e){
    return fallback;
  }
}

function ensureRows(rows){
  return Array.isArray(rows) ? rows : [];
}

window.RecruitSafe = {
  text,
  trim,
  array,
  el,
  setText,
  setValue,
  date,
  number,
  safeJsonParse,
  ensureRows
};

})();
