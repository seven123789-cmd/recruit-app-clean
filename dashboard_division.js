async function loadMasterDivisionCenterOptions(){

  if(window.RecruitMaster && typeof window.RecruitMaster.divisionCenter === "function"){
    const master = await window.RecruitMaster.divisionCenter();
    return { divisions: master.divisions || [], centersByDivision: master.centersByDivision || {} };
  }
  return { divisions:[], centersByDivision:{} };
}
const sb = window.getRecruitSupabaseClient();

let currentUser=null;
let currentRole=null;
let rows=[];
let divisionFunnelChart=null;

function $(id){return document.getElementById(id)}

function setMsg(id,msg,type="info"){const el=$(id);if(!el)return;el.textContent=msg;el.className="message-box message-"+type}
function setText(id,value){const el=$(id);if(el)el.textContent=value}
function rate(n,d){return !d ? "0.0%" : ((n/d)*100).toFixed(1)+"%"}
function rateNum(n,d){return !d ? 0 : Number(((n/d)*100).toFixed(1))}
function validDate(s){if(!s)return false;const y=Number(String(s).slice(0,4));return y>=2000}
function hasDivision(r){return !!String(r?.division||"").trim()}

function fiscalRange(type){const fy=fiscalYear();if(type==="previous")return {fy:fy-1,label:(fy-1)+"年度",from:(fy-1)+"-04-01",to:fy+"-03-31"};if(type==="all")return {fy:null,label:"全期間",from:"",to:""};return {fy,label:fy+"年度",from:fy+"-04-01",to:(fy+1)+"-03-31"}}
function applyFy(){const range=fiscalRange($("fy").value);$("from").value=range.from;$("to").value=range.to;const period=range.from&&range.to ? `${range.from} ～ ${range.to}` : "全期間";setText("periodText","対象期間："+period);setText("sideFiscalYear",range.label);setText("sidePeriod",period)}
function handleFilterChange(){applyFy();loadAnalysis()}
async function getUser(){if(currentUser)return currentUser;const {data:{session}}=await sb.auth.getSession();currentUser=session?.user||null;return currentUser}
async function getRole(userId){if(currentRole)return currentRole;try{const {data}=await sb.from("profiles").select("role").eq("user_id",userId).single();currentRole=data?.role||"editor"}catch(e){currentRole="editor"}return currentRole}
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
function setSelectOptions(id,values,blank="すべて"){const el=$(id);if(!el)return;const current=el.value;const list=[...new Set((values||[]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"ja"));el.innerHTML=`<option value="">${blank}</option>`;list.forEach(v=>{el.innerHTML+=`<option value="${esc(v)}">${esc(v)}</option>`});if(list.includes(current))el.value=current}
function filtered(data){const f=$("from").value;const t=$("to").value;const d=$("divisionFilter").value;return (data||[]).filter(r=>!r.is_deleted).filter(r=>{if(!validDate(r.applied_date))return false;if(!hasDivision(r))return false;if(f&&r.applied_date<f)return false;if(t&&r.applied_date>t)return false;if(d&&r.division!==d)return false;return true})}

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
  if(division)q.set('division',division);
  return './list.html?'+q.toString();
}
function listLink(label,params={},cls='analysis-link'){
  return `<a class="${cls}" href="${esc(buildListUrl(params))}">${esc(label)}</a>`;
}

function groupByDivision(data){const m=new Map();data.forEach(r=>{if(!hasDivision(r))return;const key=String(r.division).trim();if(!m.has(key))m.set(key,{key,applied:0,appointment:0,set:0,interview:0,offer:0,join:0});const x=m.get(key);if(validDate(r.applied_date))x.applied++;if(validDate(r.appointment_date))x.appointment++;if(validDate(r.interview1_date))x.set++;if(validDate(r.interview_done_date))x.interview++;if(validDate(r.offer_date))x.offer++;if(validDate(r.join_date))x.join++});return [...m.values()].sort((a,b)=>b.join-a.join||b.applied-a.applied||String(a.key).localeCompare(String(b.key),"ja"))}
function updateSummary(data){const applied=data.filter(r=>validDate(r.applied_date)).length;const interview=data.filter(r=>validDate(r.interview_done_date)).length;const join=data.filter(r=>validDate(r.join_date)).length;const interviewRate=rate(interview,applied);const joinRate=rate(join,applied);setText("sumApplied",applied);setText("sumInterview",interview);setText("sumJoin",join);setText("sumInterviewRate",interviewRate);setText("sumJoinRate",joinRate);setText("sideRows",data.length);setText("sideDivision",$("divisionFilter").value||"すべて");setText("sideInterviewRate",interviewRate);setText("sideJoinRate",joinRate)}
function calcDivisionScore(item){
  const interviewRate=rateNum(item.interview,item.applied);
  const joinRate=rateNum(item.join,item.applied);
  const volumeScore=Math.min(item.applied*4,40);
  return Number((volumeScore + interviewRate*0.3 + joinRate*0.9 + item.join*10).toFixed(1));
}
function kpiLevel(item){
  const interviewRate=rateNum(item.interview,item.applied);
  const joinRate=rateNum(item.join,item.applied);
  if(item.applied===0)return {label:"対象外",cls:"neutral",action:"対象データなし"};
  if(interviewRate<30)return {label:"要改善",cls:"danger",action:"応募後の初動対応を確認"};
  if(joinRate<10)return {label:"注意",cls:"warning",action:"面接内容・条件ミスマッチを確認"};
  return {label:"良好",cls:"success",action:"現行運用を維持"};
}
function renderPerformanceCards(items){
  const box=$("performanceGrid");
  if(!box)return;
  const list=[...items]
    .filter(x=>x.applied>0)
    .sort((a,b)=>calcDivisionScore(b)-calcDivisionScore(a)||b.join-a.join||b.applied-a.applied)
    .slice(0,8);

  if(!list.length){
    box.innerHTML='<div class="empty-box">データがありません</div>';
    return;
  }

  box.innerHTML=list.map((x,i)=>{
    const b=getBottleneckType(x);
    const level=kpiLevel(x);
    const interviewRate=rate(x.interview,x.applied);
    const joinRate=rate(x.join,x.applied);
    const score=Math.round(calcDivisionScore(x));
    const interviewCls=rateNum(x.interview,x.applied)>=50 ? "good" : "bad";
    const joinCls=rateNum(x.join,x.applied)>=10 ? "good" : "bad";

    return `
      <article class="performance-card ${level.cls}">
        <div class="performance-head">
          <span class="rank-no">${i+1}</span>
          <div>
            <h3>${listLink(x.key,{division:x.key})}</h3>
          </div>
          <strong>${score}<small>pt</small></strong>
        </div>

        <div class="performance-metrics">
          <div><span>応募</span><b>${x.applied}</b></div>
          <div><span>面接</span><b>${x.interview}</b></div>
          <div><span>採用</span><b>${x.join}</b></div>
        </div>

        <div class="performance-rates">
          <div class="${interviewCls}">
            <span>応募→面接</span>
            <b>${interviewRate}</b>
          </div>
          <div class="${joinCls}">
            <span>応募→採用</span>
            <b>${joinRate}</b>
          </div>
        </div>

        <div class="performance-foot">
          <span class="mini-status ${b.cls}">${esc(b.level)}：${esc(b.label)}</span>
          <em>${esc(b.action)}</em>
        </div>
      </article>`;
  }).join("");
}
const chartValueLabelPlugin={
  id:"chartValueLabelPlugin",
  afterDatasetsDraw(chart){
    const {ctx, chartArea}=chart;
    ctx.save();
    ctx.font="800 11px Segoe UI, Meiryo, sans-serif";
    ctx.textBaseline="middle";
    ctx.textAlign="left";

    chart.data.datasets.forEach((dataset,datasetIndex)=>{
      const meta=chart.getDatasetMeta(datasetIndex);

      meta.data.forEach((bar,index)=>{
        const value=dataset.data[index];
        if(!value)return;

        const pos=bar.tooltipPosition();
        const text=String(value);
        const textWidth=ctx.measureText(text).width;
        const labelX=Math.min(pos.x+10,chartArea.right-textWidth-4);

        ctx.fillStyle=dataset.backgroundColor || "#334155";
        ctx.fillText(text,labelX,pos.y);
      });
    });

    ctx.restore();
  }
};

function renderDivisionFunnelChart(items){
  const canvas=$("divisionFunnelChart");
  if(!canvas)return;
  const list=[...items].filter(x=>x.applied>0).sort((a,b)=>b.applied-a.applied||b.join-a.join).slice(0,8);
  const labels=list.map(x=>x.key);
  const maxValue=Math.max(...list.flatMap(x=>[x.applied,x.interview,x.join]),1);

  if(divisionFunnelChart)divisionFunnelChart.destroy();

  if(!list.length){
    const box=canvas.closest(".chart-box");
    if(box)box.innerHTML='<div class="empty-box">データがありません</div>';
    return;
  }

  divisionFunnelChart=new Chart(canvas,{
    type:"bar",
    plugins:[chartValueLabelPlugin],
    data:{
      labels,
      datasets:[
        {label:"応募",data:list.map(x=>x.applied),backgroundColor:"#2563eb",borderRadius:7,barThickness:15,maxBarThickness:15},
        {label:"面接実施",data:list.map(x=>x.interview),backgroundColor:"#f59e0b",borderRadius:7,barThickness:15,maxBarThickness:15},
        {label:"採用",data:list.map(x=>x.join),backgroundColor:"#16a34a",borderRadius:7,barThickness:15,maxBarThickness:15}
      ]
    },
    options:{
      indexAxis:"y",
      responsive:true,
      maintainAspectRatio:false,
      layout:{padding:{right:24}},
      interaction:{mode:"nearest",intersect:false},
      datasets:{
        bar:{
          grouped:true,
          categoryPercentage:0.78,
          barPercentage:0.8
        }
      },
      plugins:{
        legend:{
          position:"top",
          labels:{
            usePointStyle:true,
            pointStyle:"circle",
            boxWidth:10,
            boxHeight:10,
            color:"#334155",
            font:{size:11,weight:"700"}
          }
        },
        tooltip:{
          enabled:false
        }
      },
      scales:{
        x:{
          beginAtZero:true,
          suggestedMax:Math.ceil(maxValue*1.12),
          grid:{color:"#e2e8f0"},
          ticks:{color:"#64748b",font:{size:11,weight:"700"}}
        },
        y:{
          grid:{display:false},
          ticks:{color:"#0f172a",font:{size:11,weight:"800"}}
        }
      }
    }
  });
}

function bottleneckSortScore(item,b){
  const joinRate=rateNum(item.join,item.applied);
  const interviewRate=rateNum(item.interview,item.applied);
  const levelScore=b.cls==="danger"?0:b.cls==="warning"?1:b.cls==="success"?2:3;
  return {
    levelScore,
    joinRate,
    interviewRate,
    applied:item.applied || 0
  };
}
function getBottleneckType(item){
  const interviewRate=rateNum(item.interview,item.applied);
  const joinRate=rateNum(item.join,item.applied);

  if(item.applied===0){
    return {level:"確認",label:"応募不足",detail:"応募数がありません",action:"母集団形成を確認",cls:"neutral",priority:4};
  }

  if(joinRate<10 && item.applied>=30){
    return {level:"重点",label:"採用到達が弱い",detail:`応募→採用 ${joinRate.toFixed(1)}%`,action:"面接後フォロー・条件調整を確認",cls:"danger",priority:1};
  }

  if(interviewRate<45 && item.applied>=30){
    return {level:"重点",label:"面接到達が弱い",detail:`応募→面接 ${interviewRate.toFixed(1)}%`,action:"初動連絡・日程化速度を確認",cls:"danger",priority:1};
  }

  if(joinRate<10){
    return {level:"注意",label:"採用到達が弱い",detail:`応募→採用 ${joinRate.toFixed(1)}%`,action:"面接内容・条件ミスマッチを確認",cls:"warning",priority:2};
  }

  if(interviewRate<45){
    return {level:"注意",label:"面接到達が弱い",detail:`応募→面接 ${interviewRate.toFixed(1)}%`,action:"応募後の初回対応を確認",cls:"warning",priority:3};
  }

  return {level:"良好",label:"流れ良好",detail:`応募→採用 ${joinRate.toFixed(1)}%`,action:"現行運用を維持",cls:"success",priority:9};
}
function updateInsight(items){
  const box=$("divisionInsight");
  if(!box)return;
  const problem=[...items]
    .filter(x=>x.applied>0)
    .map(x=>({item:x,b:getBottleneckType(x)}))
    .sort((a,b)=>{
      const as=bottleneckSortScore(a.item,a.b);
      const bs=bottleneckSortScore(b.item,b.b);
      if(as.levelScore!==bs.levelScore)return as.levelScore-bs.levelScore;
      if(as.joinRate!==bs.joinRate)return as.joinRate-bs.joinRate;
      if(as.interviewRate!==bs.interviewRate)return as.interviewRate-bs.interviewRate;
      return bs.applied-as.applied;
    })[0];

  if(!problem){
    box.className="insight-card neutral";
    box.innerHTML='<div class="insight-title">重点確認</div><div class="insight-body">対象データがありません。</div>';
    return;
  }

  const joinRate=rateNum(problem.item.join,problem.item.applied).toFixed(1);
  box.className="insight-card "+problem.b.cls;
  box.innerHTML=`<div class="insight-title">重点確認</div><div class="insight-body">最優先：${listLink(problem.item.key,{division:problem.item.key})}（採用率 ${joinRate}%）<span>${esc(problem.b.action)}</span></div>`;
}
function renderBottleneck(items){
  const box=$("bottleneckGrid");
  if(!box)return;
  const list=[...items]
    .filter(x=>x.applied>0)
    .map(x=>({item:x,b:getBottleneckType(x)}))
    .sort((a,b)=>{
      const as=bottleneckSortScore(a.item,a.b);
      const bs=bottleneckSortScore(b.item,b.b);
      if(as.levelScore!==bs.levelScore)return as.levelScore-bs.levelScore;
      if(as.joinRate!==bs.joinRate)return as.joinRate-bs.joinRate;
      if(as.interviewRate!==bs.interviewRate)return as.interviewRate-bs.interviewRate;
      return bs.applied-as.applied;
    })
    .slice(0,8);

  if(!list.length){
    box.innerHTML='<div class="empty-box">データがありません</div>';
    return;
  }

  box.innerHTML=list.map(({item:x,b})=>`<div class="bottleneck-card ${b.cls}"><div><strong>${listLink(x.key,{division:x.key})}</strong><span>${esc(b.level)}｜${esc(b.label)}</span></div><p>${esc(b.detail)} / 応募 ${x.applied}・面接 ${x.interview}・採用 ${x.join}</p><small>${esc(b.action)}</small></div>`).join("");
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

async function refreshDivisionMasterFilter(){
  const master = await loadMasterDivisionCenterOptions();
  setSelectOptions("divisionFilter", master.divisions || [], "すべて");
}
async function loadAnalysis(){try{const {data,error}=await sb.from("candidates").select("*").order("id",{ascending:false});if(error)throw error;rows=data||[];applyInboundParamsOnce();const data2=filtered(rows);const items=groupByDivision(data2);updateSummary(data2);renderPerformanceCards(items);updateInsight(items);renderDivisionFunnelChart(items);renderBottleneck(items)}catch(e){(window.RecruitUI ? window.RecruitUI.showError(String("本部分析の読込に失敗しました: "+(e.message||e))) : console.warn("本部分析の読込に失敗しました: "+(e.message||e)));console.error(e)}}
async function initPageAfterLogin(){applyFy();await refreshDivisionMasterFilter();await loadAnalysis()}
authInit();
