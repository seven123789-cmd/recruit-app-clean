async function loadMasterDivisionCenterOptions(){

  if(window.RecruitMaster && typeof window.RecruitMaster.divisionCenter === "function"){
    const master = await window.RecruitMaster.divisionCenter();
    return { divisions: master.divisions || [], centersByDivision: master.centersByDivision || {} };
  }
  return { divisions:[], centersByDivision:{} };
}
const sb=window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : null;

let currentUser=null;
let currentRole=null;
let rows=[];
let ownerFunnelChart=null;

const ACTIVE_STATUSES=["応募","書類選考","アポ取得","面接設定","面接実施","内定","採用"];

function $(id){return document.getElementById(id)}

function setMsg(id,msg,type="info"){const el=$(id);if(!el)return;el.textContent=msg;el.className="message-box message-"+type}
function setText(id,value){const el=$(id);if(el)el.textContent=value}
function rate(n,d){return !d ? "0.0%" : ((n/d)*100).toFixed(1)+"%"}
function rateNum(n,d){return !d ? 0 : Number(((n/d)*100).toFixed(1))}
function validDate(s){if(!s)return false;const t=String(s).slice(0,10);const y=Number(t.slice(0,4));return /^\d{4}-\d{2}-\d{2}$/.test(t)&&y>=2000}
function normalizeDate(s){return validDate(s)?String(s).slice(0,10):""}
function todayStr(){return window.RecruitDate?.todayJST ? window.RecruitDate.todayJST() : new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date())}
function daysBetween(a,b){if(!validDate(a)||!validDate(b))return null;return Math.floor((new Date(normalizeDate(b)+"T00:00:00+09:00")-new Date(normalizeDate(a)+"T00:00:00+09:00"))/(86400000))}
function isHired(r){return window.isRecruitHired ? window.isRecruitHired(r) : (r.hiring_result==="入社済"||validDate(r.join_date)||String(r.status||"").trim()==="入社")}
function isFinal(r){return String(r.status||"").trim()==="採用"||["不採用","辞退","不通","保留","採用","入社済"].includes(String(r.hiring_result||"").trim())||isHired(r)}
function isActionRequired(r){
  const st=String(r.status||"").trim();
  const result=String(r.hiring_result||"").trim();
  if(st === "採用")return false;
  if(["採用","入社済","不採用","辞退","不通","保留"].includes(result))return false;
  if(!ACTIVE_STATUSES.includes(st))return false;
  if(!r.next_action_date)return true;
  return daysBetween(todayStr(),r.next_action_date)<=1;
}

function fiscalRange(type){const fy=fiscalYear();if(type==="previous")return {fy:fy-1,label:(fy-1)+"年度",from:(fy-1)+"-04-01",to:fy+"-03-31"};if(type==="all")return {fy:null,label:"全期間",from:"",to:""};return {fy,label:fy+"年度",from:fy+"-04-01",to:(fy+1)+"-03-31"}}
function applyFy(){const range=fiscalRange($("fy").value);$("from").value=range.from;$("to").value=range.to;const period=range.from&&range.to ? `${range.from} ～ ${range.to}` : "全期間";setText("periodText","対象期間："+period);setText("sideFiscalYear",range.label);setText("sidePeriod",period)}
function handleFilterChange(){applyFy();loadAnalysis()}
function handleDivisionChange(){updateCenterOptions();handleFilterChange()}

async function getUser(){if(currentUser)return currentUser;const {data:{session}}=await sb.auth.getSession();currentUser=session?.user||null;return currentUser}
async function getRole(userId){if(currentRole)return currentRole;try{const {data}=await sb.from("profiles").select("role").eq("user_id",userId).single();currentRole=data?.role||"viewer"}catch(e){currentRole="viewer"}return currentRole}
function showAuth(msg="未ログインです",type="info"){const a=$("authScreen"),b=$("appScreen");if(a)a.classList.remove("hidden");if(b)b.classList.add("hidden");currentUser=null;currentRole=null;setMsg("authMessage",msg,type);document.body.classList.remove("auth-checking")}
async function showApp(){const user=await getUser();if(!user){showAuth();return false}await getRole(user.id);$("authScreen")?.classList.add("hidden");$("appScreen")?.classList.remove("hidden");document.body.classList.remove("auth-checking");return true}
async function login(){const email=$("loginEmail")?.value.trim();const password=$("loginPassword")?.value;if(!email||!password){setMsg("authMessage","メールアドレスとパスワードを入力してください","error");return}try{const {error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;currentUser=null;currentRole=null;if(await showApp()) await initPageAfterLogin()}catch(e){setMsg("authMessage","ログイン失敗: "+(e.message||e),"error")}}
async function logout(){
  if(window.RecruitAuth && typeof window.RecruitAuth.logoutToIndex === "function"){
    await window.RecruitAuth.logoutToIndex();
    return;
  }
  try{await sb.auth.signOut()}catch(e){}
  window.location.replace("./index.html");
}
sb.auth.onAuthStateChange((ev)=>{
  if(ev==="SIGNED_OUT"){
    if(window.RecruitAuth && typeof window.RecruitAuth.isDirectLogout === "function" && window.RecruitAuth.isDirectLogout()) return;
    showAuth("ログアウトしました","success");
  }
});
async function authInit(){try{if(await showApp()) await initPageAfterLogin()}catch(e){console.error(e);showAuth("初期化に失敗しました","error")}finally{document.body.classList.remove("auth-checking")}}


function currentFiscalYearValue(){
  const fy=$('fy')?.value;
  if(fy==='previous')return fiscalYear()-1;
  if(fy==='all')return '';
  return fiscalYear();
}
function buildListUrl(params={}){
  const q=new URLSearchParams();
  q.set('source','dashboard');
  q.set('filter',params.filter||'all');
  const fy=currentFiscalYearValue();
  if(fy)q.set('year',fy);
  const from=$('from')?.value||'';
  const to=$('to')?.value||'';
  if(from)q.set('from',from);
  if(to)q.set('to',to);
  const division=params.division ?? ($('divisionFilter')?.value||'');
  const center=params.center ?? ($('centerFilter')?.value||'');
  const owner=params.owner ?? ($('ownerFilter')?.value||'');
  const channel=params.channel ?? '';
  if(division)q.set('division',division);
  if(center)q.set('center',center);
  if(owner)q.set('owner',owner);
  if(channel)q.set('channel',channel);
  return './list.html?'+q.toString();
}
function linkToList(label,params={},cls='analysis-link'){
  const text=String(label||'未設定');
  return `<a class="${cls}" href="${esc(buildListUrl(params))}">${esc(text)}</a>`;
}
function ownerLink(owner,cls='analysis-link strong'){
  return linkToList(owner,{owner:owner==='未設定'?'':owner},cls);
}
function divisionTags(text){
  const parts=String(text||'本部未設定').split('/').map(v=>v.trim()).filter(Boolean);
  if(!parts.length)return '<span class="division-tag muted">本部未設定</span>';
  return `<div class="division-tags">${parts.map(v=>linkToList(v,{division:v},'division-tag')).join('')}</div>`;
}
function referenceBadge(item){
  return item.applied>0&&item.applied<=5 ? '<span class="reference-badge">参考</span>' : '';
}

function setSelectOptions(id,values,blank="すべて"){
  const el=$(id);if(!el)return;
  const current=el.value;
  const list=[...new Set((values||[]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"ja"));
  el.innerHTML=`<option value="">${blank}</option>`;
  list.forEach(v=>{el.innerHTML+=`<option value="${esc(v)}">${esc(v)}</option>`});
  if(list.includes(current))el.value=current;
}
async function loadOwnerPageMasters(){
  try{
    const master=window.RecruitMaster?await window.RecruitMaster.divisionCenter():{divisions:[],centersByDivision:{},centers:[]};
    CENTER_MASTER=master.centersByDivision||{};
  }catch(e){
    CENTER_MASTER={};
  }
  try{
    const owners=window.RecruitMaster?await window.RecruitMaster.list("owners"):[];
    MASTER_OWNER_OPTIONS=(owners||[]).filter(Boolean);
  }catch(e){
    MASTER_OWNER_OPTIONS=[];
  }
}
function bindMasters(data){const divisions=Object.keys(CENTER_MASTER).length?Object.keys(CENTER_MASTER):data.map(r=>r.division);setSelectOptions("divisionFilter",divisions);updateCenterOptions(data);setSelectOptions("ownerFilter",MASTER_OWNER_OPTIONS.length?MASTER_OWNER_OPTIONS:data.map(r=>r.owner_name||"未設定"))}
function updateCenterOptions(sourceRows=rows){const div=$("divisionFilter")?.value||"";const centers=div&&CENTER_MASTER[div]?CENTER_MASTER[div]:(Object.keys(CENTER_MASTER).length?Object.values(CENTER_MASTER).flat():(sourceRows||[]).filter(r=>!div||r.division===div).map(r=>r.center_name));setSelectOptions("centerFilter",centers)}
function filtered(data){const f=$("from").value;const t=$("to").value;const d=$("divisionFilter").value;const c=$("centerFilter").value;const o=$("ownerFilter").value;return (data||[]).filter(r=>!r.is_deleted).filter(r=>{if(!validDate(r.applied_date))return false;if(f&&r.applied_date<f)return false;if(t&&r.applied_date>t)return false;if(d&&r.division!==d)return false;if(c&&r.center_name!==c)return false;if(o&&(r.owner_name||"未設定")!==o)return false;return true})}
function firstContactDate(r){
  const dates=[r.appointment_date,r.interview1_date,r.interview_done_date,r.offer_date,r.join_date].map(normalizeDate).filter(Boolean).sort();
  return dates[0]||"";
}
function groupByOwner(data){
  const m=new Map();
  data.forEach(r=>{
    const key=String(r.owner_name||"未設定").trim()||"未設定";
    if(!m.has(key))m.set(key,{key,divisionSet:new Set(),centerSet:new Set(),applied:0,appointment:0,set:0,interview:0,offer:0,join:0,todo:0,overdue:0,nextUnset:0,notDone:0,dormant:0,initialCount:0,initialDaysTotal:0,initialLate24:0,initialLate3:0,uncontacted:0});
    const x=m.get(key);
    if(r.division)x.divisionSet.add(r.division);
    if(r.center_name)x.centerSet.add(r.center_name);
    if(validDate(r.applied_date))x.applied++;
    if(validDate(r.appointment_date))x.appointment++;
    if(validDate(r.interview1_date))x.set++;
    if(validDate(r.interview_done_date))x.interview++;
    if(validDate(r.offer_date))x.offer++;
    if(isHired(r))x.join++;
    if(isActionRequired(r))x.todo++;
    if(ACTIVE_STATUSES.includes(String(r.status||""))&&!isFinal(r)){
      if(!validDate(r.next_action_date))x.nextUnset++;
      if(validDate(r.next_action_date)&&r.next_action_date<todayStr())x.overdue++;
    }
    if(validDate(r.interview1_date)&&!validDate(r.interview_done_date)&&!isFinal(r))x.notDone++;
    const contact=firstContactDate(r);
    const initialDays=contact ? daysBetween(r.applied_date,contact) : null;
    if(initialDays!==null&&initialDays>=0){
      x.initialCount++;
      x.initialDaysTotal+=initialDays;
      if(initialDays>=1)x.initialLate24++;
      if(initialDays>=3)x.initialLate3++;
    }else if(!isFinal(r)){
      x.uncontacted++;
    }
    if(validDate(r.applied_date)&&!contact&&!isFinal(r)){
      const days=daysBetween(r.applied_date,todayStr());
      if(days!==null&&days>=3)x.dormant++;
    }
  });
  return [...m.values()].map(x=>({
    ...x,
    avgInitial:x.initialCount?Number((x.initialDaysTotal/x.initialCount).toFixed(1)):null,
    divisionText:[...x.divisionSet].join(" / ")||"本部未設定"
  })).sort((a,b)=>b.join-a.join||b.interview-a.interview||b.applied-a.applied||String(a.key).localeCompare(String(b.key),"ja"));
}
function updateSummary(data){const applied=data.filter(r=>validDate(r.applied_date)).length;const interview=data.filter(r=>validDate(r.interview_done_date)).length;const join=data.filter(isHired).length;const interviewRate=rate(interview,applied);const joinRate=rate(join,applied);setText("sumApplied",applied);setText("sumInterview",interview);setText("sumJoin",join);setText("sumInterviewRate",interviewRate);setText("sumJoinRate",joinRate);setText("sideRows",data.length);setText("sideDivision",$("divisionFilter").value||"すべて");setText("sideOwner",$("ownerFilter").value||"すべて");setText("sideInterviewRate",interviewRate);setText("sideJoinRate",joinRate)}
function ownerLevel(item){
  if(item.applied<=5)return {label:"参考値",cls:"neutral",action:"母数が少ないため判断保留"};
  if(item.initialLate3>=10||item.overdue>=3||item.todo>=25||item.avgInitial>=3)return {label:"危険",cls:"danger",action:"初動遅れ・期限超過を優先確認"};
  if(item.initialLate3>=3||item.todo>=10||item.nextUnset>=5||rateNum(item.join,item.applied)<10)return {label:"注意",cls:"warning",action:"未対応・次回対応日の整理が必要"};
  return {label:"良好",cls:"success",action:"現行運用を維持"};
}
function calcOwnerScore(item){
  const interviewRate=rateNum(item.interview,item.applied);
  const joinRate=rateNum(item.join,item.applied);
  const volumeScore=Math.min(item.applied*3,45);
  const resultScore=item.join*8+joinRate*1.2+interviewRate*0.35;
  const penalty=Math.min(item.initialLate3*3+item.todo*1.2+item.overdue*4+item.nextUnset*0.5,45);
  return Math.max(0,Number((volumeScore+resultScore-penalty).toFixed(1)));
}
function sortByRisk(a,b){
  const rank={danger:0,warning:1,success:2,neutral:3};
  const ar=rank[ownerLevel(a).cls]??9;
  const br=rank[ownerLevel(b).cls]??9;
  if(ar!==br)return ar-br;
  if(a.initialLate3!==b.initialLate3)return b.initialLate3-a.initialLate3;
  if(a.todo!==b.todo)return b.todo-a.todo;
  return b.applied-a.applied;
}
function pill(label,cls){return `<span class="mini-status ${cls}">${esc(label)}</span>`}
function renderPerformanceCards(items){
  const box=$("performanceGrid");if(!box)return;
  const list=[...items].filter(x=>x.applied>=6).sort((a,b)=>calcOwnerScore(b)-calcOwnerScore(a)||b.join-a.join||b.applied-a.applied).slice(0,4);
  if(!list.length){box.innerHTML='<div class="empty-box">応募6件以上の担当者がいません</div>';return}
  box.innerHTML=list.map((x,i)=>{
    const lv=ownerLevel(x);
    const score=Math.round(calcOwnerScore(x));
    return `<article class="performance-card ${lv.cls}">
      <div class="performance-head"><span class="rank-no">${i+1}</span><div><h3>${ownerLink(x.key)}</h3><p>${divisionTags(x.divisionText)}</p></div><strong>${score}<small>pt</small></strong></div>
      <div class="performance-metrics"><div><span>応募</span><b>${x.applied}</b></div><div><span>面接</span><b>${x.interview}</b></div><div><span>採用</span><b>${x.join}</b></div></div>
      <div class="performance-rates"><div><span>応募→面接</span><b>${rate(x.interview,x.applied)}</b></div><div><span>応募→採用</span><b>${rate(x.join,x.applied)}</b></div></div>
      <div class="owner-extra-line"><span>平均初動 ${x.avgInitial===null?"-":x.avgInitial.toFixed(1)+"日"}</span><span>初動3日超 ${x.initialLate3}</span><span>要対応 ${x.todo}</span></div>
      <div class="performance-foot">${pill(lv.label,lv.cls)}<em>${esc(lv.action)}</em></div>
    </article>`;
  }).join("");
}
function renderCheckTables(items){
  const normal=[...items].filter(x=>x.applied>=6);
  const initialList=[...normal].sort((a,b)=>b.initialLate3-a.initialLate3||b.initialLate24-a.initialLate24||b.applied-a.applied).slice(0,4);
  const stagnationList=[...normal].sort((a,b)=>b.todo-a.todo||b.nextUnset-a.nextUnset||b.overdue-a.overdue||b.applied-a.applied).slice(0,4);
  const renderName=x=>`<strong>${ownerLink(x.key)}</strong><small>${divisionTags(x.divisionText)}</small>`;
  $("initialTableBody").innerHTML=initialList.length?initialList.map(x=>{const lv=ownerLevel(x);return `<tr><td>${renderName(x)}</td><td>${x.avgInitial===null?"-":x.avgInitial.toFixed(1)+"日"}</td><td>${x.initialLate24}</td><td>${x.initialLate3?pill(String(x.initialLate3),x.initialLate3>=10?"danger":"warning"):"0"}</td><td>${x.uncontacted}</td><td>${pill(lv.label,lv.cls)}</td></tr>`}).join(""):'<tr><td colspan="6" class="empty">対象データがありません</td></tr>';
  $("stagnationTableBody").innerHTML=stagnationList.length?stagnationList.map(x=>{const lv=ownerLevel(x);const stCls=(x.todo>=20||x.overdue>=3)?"danger":(x.todo>=8||x.nextUnset>=5?"warning":"success");return `<tr><td>${renderName(x)}</td><td>${pill(String(x.todo),stCls)}</td><td>${x.overdue}</td><td>${x.nextUnset}</td><td>${x.notDone}</td><td>${pill(lv.label,lv.cls)}</td></tr>`}).join(""):'<tr><td colspan="6" class="empty">対象データがありません</td></tr>';
}
function renderReferenceTable(items){
  const count=[...items].filter(x=>x.applied>0&&x.applied<=5).length;
  setText('referenceCount',count+'件');
}

function getBottleneck(item){
  if(item.applied<=5)return {level:"参考",label:"参考値",detail:`応募 ${item.applied}件のため率評価は保留`,action:"件数が増えてから判断",cls:"neutral"};
  if(item.initialLate3>=10)return {level:"重点",label:"初動3日超",detail:`初動3日超 ${item.initialLate3}件 / 応募 ${item.applied}・面接 ${item.interview}・採用 ${item.join}`,action:"応募後の初回連絡速度を確認",cls:"danger"};
  if(item.initialLate3>=3)return {level:"注意",label:"初動3日超",detail:`初動3日超 ${item.initialLate3}件 / 応募 ${item.applied}・面接 ${item.interview}・採用 ${item.join}`,action:"応募後の初回連絡速度を確認",cls:"warning"};
  if(item.todo>=10)return {level:"注意",label:"要対応滞留",detail:`要対応 ${item.todo}件 / 応募 ${item.applied}・面接 ${item.interview}・採用 ${item.join}`,action:"LISTで対象者を確認",cls:"warning"};
  if(rateNum(item.join,item.applied)<10&&item.applied>=10)return {level:"注意",label:"採用転換弱い",detail:`応募→採用 ${rate(item.join,item.applied)} / 応募 ${item.applied}・面接 ${item.interview}・採用 ${item.join}`,action:"面接後フォローを確認",cls:"warning"};
  return {level:"良好",label:"流れ良好",detail:`応募→採用 ${rate(item.join,item.applied)} / 応募 ${item.applied}・面接 ${item.interview}・採用 ${item.join}`,action:"現行運用を維持",cls:"success"};
}
function renderBottlenecks(items){
  const box=$("bottleneckGrid");if(!box)return;
  const list=[...items].filter(x=>x.applied>0).map(item=>({item,b:getBottleneck(item)})).sort((a,b)=>sortByRisk(a.item,b.item)).slice(0,6);
  box.innerHTML=list.length?list.map(({item,b})=>{
    const labelText=b.level===b.label?b.label:`${b.level}｜${b.label}`;
    return `<article class="bottleneck-card ${b.cls}">
      <div class="bottleneck-top">
        <strong>${ownerLink(item.key)}</strong>
        <span>${esc(labelText)}</span>
      </div>
      <p class="bottleneck-main">${esc(b.detail)}</p>
      <p class="bottleneck-sub">応募 ${item.applied}・面接 ${item.interview}・採用 ${item.join}</p>
      <small>${esc(b.action)}</small>
    </article>`;
  }).join(""):'<div class="empty-box">対象データがありません</div>';
}
const chartValueLabelPlugin={id:"chartValueLabelPlugin",afterDatasetsDraw(chart){const {ctx,chartArea}=chart;ctx.save();ctx.font="800 11px Segoe UI, Meiryo, sans-serif";ctx.textBaseline="middle";ctx.textAlign="left";chart.data.datasets.forEach((dataset,datasetIndex)=>{const meta=chart.getDatasetMeta(datasetIndex);meta.data.forEach((bar,index)=>{const value=dataset.data[index];if(!value)return;const pos=bar.tooltipPosition();const text=String(value);const textWidth=ctx.measureText(text).width;const labelX=Math.min(pos.x+10,chartArea.right-textWidth-4);ctx.fillStyle=dataset.backgroundColor||"#334155";ctx.fillText(text,labelX,pos.y)})});ctx.restore()}};
function renderOwnerFunnelChart(items){
  const box=document.querySelector("#ownerFunnelChart")?.closest(".chart-box")||document.querySelector(".chart-box");if(!box)return;
  if(ownerFunnelChart){ownerFunnelChart.destroy();ownerFunnelChart=null}
  if(!document.getElementById("ownerFunnelChart"))box.innerHTML='<canvas id="ownerFunnelChart"></canvas>';
  const list=[...items].filter(x=>x.applied>=6).sort((a,b)=>b.applied-a.applied||b.join-a.join).slice(0,5);
  if(!list.length){box.innerHTML='<div class="empty-box">応募6件以上の担当者がいません</div>';return}
  const ctx=$("ownerFunnelChart");
  ownerFunnelChart=new Chart(ctx,{type:"bar",data:{labels:list.map(x=>x.key),datasets:[{label:"応募",data:list.map(x=>x.applied),backgroundColor:"#2563eb",borderRadius:8,barThickness:14},{label:"面接実施",data:list.map(x=>x.interview),backgroundColor:"#f59e0b",borderRadius:8,barThickness:14},{label:"採用",data:list.map(x=>x.join),backgroundColor:"#16a34a",borderRadius:8,barThickness:14}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,layout:{padding:{right:28}},plugins:{legend:{position:"top",labels:{boxWidth:10,usePointStyle:true,font:{size:11,weight:"700"}}},tooltip:{enabled:true}},scales:{x:{beginAtZero:true,grid:{color:"rgba(148,163,184,.22)"},ticks:{font:{size:11,weight:"700"}}},y:{grid:{display:false},ticks:{font:{size:11,weight:"900"},color:"#0f172a"}}}},plugins:[chartValueLabelPlugin]});
}
function renderDetailTable(items){
  const head=$("tableHead"),body=$("tableBody");
  head.innerHTML='<tr><th>担当者</th><th>本部</th><th>判定</th><th>応募</th><th>平均初動</th><th>初動遅れ</th><th>初動3日超</th><th>面接実施</th><th>採用</th><th>応募→面接</th><th>応募→採用</th><th>要対応</th><th>期限超過</th><th>放置3日+</th></tr>';
  const list=[...items].filter(x=>x.applied>0).sort((a,b)=>b.applied-a.applied||b.join-a.join||String(a.key).localeCompare(String(b.key),"ja"));
  body.innerHTML=list.length?list.map(x=>{
    const late3Cls=x.initialLate3>=10?"danger":(x.initialLate3>=3?"warning":"neutral");
    const dormantCls=x.dormant>=3?"danger":(x.dormant>=1?"warning":"neutral");
    return `<tr class="${x.applied>0&&x.applied<=5?"reference-row":""}"><td><strong>${ownerLink(x.key)}</strong></td><td>${divisionTags(x.divisionText)}</td><td>${referenceBadge(x)}</td><td>${linkToList(x.applied,{owner:x.key,filter:"all"},"count-link")}</td><td>${x.avgInitial===null?"-":x.avgInitial.toFixed(1)+"日"}</td><td>${x.initialLate24}</td><td>${pill(String(x.initialLate3),late3Cls)}</td><td>${linkToList(x.interview,{owner:x.key,filter:"all"},"count-link")}</td><td>${linkToList(x.join,{owner:x.key,filter:"all"},"count-link")}</td><td>${rate(x.interview,x.applied)}</td><td>${rate(x.join,x.applied)}</td><td>${linkToList(x.todo,{owner:x.key,filter:"action"},"count-link")}</td><td>${x.overdue}</td><td>${pill(String(x.dormant),dormantCls)}</td></tr>`;
  }).join(""):'<tr><td colspan="14" class="empty">対象データがありません</td></tr>';
}
function updateInsight(items){
  const insight=$("ownerInsight");if(!insight)return;
  const normal=items.filter(x=>x.applied>=6);
  const target=[...normal].sort(sortByRisk)[0];
  if(!target){insight.className="insight-card neutral";insight.querySelector(".insight-body").textContent="確認対象の担当者データがありません";return}
  const b=getBottleneck(target);
  insight.className="insight-card "+b.cls;
  insight.querySelector(".insight-body").innerHTML=`<div class="insight-main"><strong>${ownerLink(target.key)}</strong><span>${esc(b.label)}</span></div><div class="insight-sub">${esc(b.action)}</div>`;
}

function applyInboundParamsOnce(){
  if(window.__inboundParamsApplied)return;
  window.__inboundParamsApplied=true;
  const params=new URLSearchParams(window.location.search);
  const setSelect=(id,names)=>{
    const el=$(id);
    if(!el)return;
    const keys=Array.isArray(names)?names:[names];
    const raw=keys.map(k=>params.get(k)).find(v=>v!==null&&v!=="");
    if(!raw)return;
    const value=raw.trim();
    if(!value)return;
    if(![...el.options].some(o=>o.value===value)){
      const option=document.createElement("option");
      option.value=value;
      option.textContent=value;
      el.appendChild(option);
    }
    el.value=value;
  };
  const fy=params.get("fy");
  if(fy&&$("fy"))$("fy").value=fy;
  setSelect("division",["division","divisionFilter"]);
  setSelect("divisionFilter",["division","divisionFilter"]);
  setSelect("center",["center","centerFilter"]);
  setSelect("centerFilter",["center","centerFilter"]);
  setSelect("channel",["channel","channelFilter"]);
  setSelect("ownerFilter",["owner","ownerFilter"]);
  setSelect("jobType",["job","jobType"]);
  if($("fy"))applyFy();
}

async function loadAnalysis(){
  try{
    applyFy();
    const data=filtered(rows);
    const owners=groupByOwner(data);
    updateSummary(data);
    renderPerformanceCards(owners);
    renderCheckTables(owners);
    renderOwnerFunnelChart(owners);
    renderBottlenecks(owners);
    renderDetailTable(owners);
    renderReferenceTable(owners);
    updateInsight(owners);
  }catch(e){console.error(e);setMsg("pageMessage","分析表示でエラーが発生しました: "+(e.message||e),"error");$("pageMessage")?.classList.remove("hidden")}
}
async function initPageAfterLogin(){
  applyFy();
  const {data,error}=await sb.from("candidates").select("*").order("applied_date",{ascending:false});
  if(error)throw error;
  rows=data||[];
  await loadOwnerPageMasters();
  bindMasters(rows);
  const y=fiscalYear();
  const hasCurrent=rows.some(r=>validDate(r.applied_date)&&r.applied_date>=`${y}-04-01`&&r.applied_date<=`${y+1}-03-31`);
  if(!hasCurrent){$("fy").value="previous";applyFy()}
  applyInboundParamsOnce();
  await loadAnalysis();
}

authInit();
