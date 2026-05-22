const sb=window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : null;

let currentUser=null;
let currentRole=null;
let rows=[];

function $(id){return document.getElementById(id)}

function setMsg(id,msg,type="info"){
  const el=$(id);
  if(!el)return;
  el.textContent=msg;
  el.className="message-box message-"+type;
}
function rate(n,d){return !d?"0.0%":((n/d)*100).toFixed(1)+"%"}
function rateNum(n,d){return !d?0:Number(((n/d)*100).toFixed(1))}
function validDate(s){if(!s)return false;const y=Number(String(s).slice(0,4));return y>=2000}

function fiscalRange(type){
  const fy=fiscalYear();
  if(type==="previous")return {fy:fy-1,label:(fy-1)+"年度",from:(fy-1)+"-04-01",to:fy+"-03-31"};
  if(type==="all")return {fy:null,label:"全期間",from:"",to:""};
  return {fy,label:fy+"年度",from:fy+"-04-01",to:(fy+1)+"-03-31"};
}
function setText(id,value){const el=$(id);if(el)el.textContent=value}
function formatRangeText(range){
  if(!range.from&&!range.to)return "対象期間：全期間";
  return "対象期間："+range.from.replaceAll("-","/")+" ～ "+range.to.replaceAll("-","/");
}
function applyFy(){
  const r=fiscalRange($("fy").value);
  $("from").value=r.from;
  $("to").value=r.to;
  setText("yearRangeText",formatRangeText(r));
  setText("sideCondition",r.label);
}
async function getUser(){
  if(currentUser)return currentUser;
  const {data:{session}}=await sb.auth.getSession();
  currentUser=session?.user||null;
  return currentUser;
}
async function getRole(userId){
  if(currentRole)return currentRole;
  try{
    const {data}=await sb.from("profiles").select("role").eq("user_id",userId).single();
    currentRole=data?.role||"viewer";
  }catch(e){
    currentRole="viewer";
  }
  return currentRole;
}
function showAuth(msg="未ログインです",type="info"){
  const a=$("authScreen"),b=$("appScreen");
  if(a)a.classList.remove("hidden");
  if(b)b.classList.add("hidden");
  currentUser=null;
  currentRole=null;
  setMsg("authMessage",msg,type);
  document.body.classList.remove("auth-checking");
}
async function showApp(){
  const user=await getUser();
  if(!user){showAuth();return false}
  await getRole(user.id);
  $("authScreen")?.classList.add("hidden");
  $("appScreen")?.classList.remove("hidden");
  document.body.classList.remove("auth-checking");
  return true;
}
async function login(){
  const email=$("loginEmail")?.value.trim();
  const password=$("loginPassword")?.value;
  if(!email||!password){setMsg("authMessage","メールアドレスとパスワードを入力してください","error");return}
  try{
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error)throw error;
    currentUser=null;
    currentRole=null;
    if(await showApp()) await initPageAfterLogin();
  }catch(e){
    setMsg("authMessage","ログイン失敗: "+(e.message||e),"error");
  }
}
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
async function authInit(){
  try{if(await showApp()) await initPageAfterLogin();}
  catch(e){console.error(e);showAuth("初期化に失敗しました","error")}
  finally{document.body.classList.remove("auth-checking")}
}
function filtered(data){
  const f=$("from").value;
  const t=$("to").value;
  return (data||[])
    .filter(r=>!r.is_deleted)
    .filter(r=>(!f||r.applied_date>=f)&&(!t||r.applied_date<=t));
}

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
  const division=params.division||'';
  if(division)q.set('division',division);
  return './list.html?'+q.toString();
}
function listLink(label,params={},cls='analysis-link'){
  return `<a class="${cls}" href="${esc(buildListUrl(params))}">${esc(label)}</a>`;
}

function groupBy(data,keyFn){
  const m=new Map();
  data.forEach(r=>{
    const k=keyFn(r)||"未設定";
    if(!m.has(k))m.set(k,{key:k,applied:0,appointment:0,set:0,interview:0,offer:0,join:0});
    const x=m.get(k);
    if(validDate(r.applied_date))x.applied++;
    if(validDate(r.appointment_date))x.appointment++;
    if(validDate(r.interview1_date))x.set++;
    if(validDate(r.interview_done_date))x.interview++;
    if(validDate(r.offer_date))x.offer++;
    if(window.isRecruitHired ? window.isRecruitHired(r) : (r.hiring_result==="採用"||r.hiring_result==="入社済"||validDate(r.join_date)||String(r.status||"").trim()==="採用"))x.join++;
  });
  return [...m.values()];
}
function renderRows(head,body){
  $("tableHead").innerHTML="<tr>"+head.map(h=>"<th>"+h+"</th>").join("")+"</tr>";
  $("tableBody").innerHTML=body.length?body.join(""):"<tr><td class=\"empty\" colspan=\"20\">データがありません</td></tr>";
}
function renderTargetChart(items){
  const box=$("targetChart");
  if(!box)return;
  if(!items.length){
    box.innerHTML='<div class="empty-chart">比較対象の目標データがありません</div>';
    return;
  }

  const maxShortage=Math.max(...items.map(item=>Math.max(Number(item.target||0)-Number(item.join||0),0)),0);

  box.innerHTML=items.map(item=>{
    const percent=item.target?Math.min(rateNum(item.join,item.target),100):0;
    const displayPercent=item.target?Math.max(percent,6):0;
    const shortage=Math.max(item.target-item.join,0);
    let cls="good";

    if(percent<100){
      if(maxShortage>0 && shortage>=maxShortage*0.65)cls="bad-high";
      else if(maxShortage>0 && shortage>=maxShortage*0.25)cls="bad-mid";
      else cls="bad-low";
    }

    return `
      <div class="target-row ${cls}">
        <div class="target-row-main">
          <strong>${listLink(item.key,{division:item.key})}</strong>
          <span>${item.target} → ${item.join}（-${shortage}）</span>
        </div>
        <div class="target-bar-wrap">
          <div class="target-bar ${cls}" style="width:${displayPercent}%"></div>
        </div>
        <div class="target-rate ${cls}">${item.target?rate(item.join,item.target):"対象外"}</div>
      </div>`;
  }).join("");
}
function updateSummary(data,items){
  const applied=data.filter(r=>validDate(r.applied_date)).length;
  const interview=data.filter(r=>validDate(r.interview_done_date)).length;
  const join=data.filter(r=>window.isRecruitHired ? window.isRecruitHired(r) : (r.hiring_result==="採用"||r.hiring_result==="入社済"||validDate(r.join_date)||String(r.status||"").trim()==="採用")).length;
  const targetTotal=items.reduce((sum,x)=>sum+x.target,0);
  const shortage=Math.max(targetTotal-join,0);
  const targetRate=targetTotal?rate(join,targetTotal):"対象外";
  const range=fiscalRange($("fy").value);

  setText("sumApplied",applied);
  setText("sumInterview",interview);
  setText("sumJoin",join);
  setText("sumInterviewRate",rate(interview,applied));
  setText("sumRate",rate(join,applied));

  setText("sideRows",data.length);
  setText("sideTarget",targetTotal);
  setText("sideShortage",shortage);
  setText("sideRate",targetRate);
  setText("sideCondition",range.label);
}
async function loadAnalysis(){
  try{
    const {data,error}=await sb.from("candidates").select("*").order("id",{ascending:false});
    if(error)throw error;
    rows=data||[];
    const data2=filtered(rows);
    await renderAnalysis(data2);
  }catch(e){
    console.error(e);
    const box=$("targetChart");
    if(box)box.innerHTML='<div class="empty-chart">読込に失敗しました</div>';
  }
}
async function renderAnalysis(data){
  let tg=[];
  try{
    const fy=fiscalRange($("fy").value).fy;
    let q=sb.from("recruitment_targets").select("*");
    if(fy)q=q.eq("fiscal_year",fy);
    const {data:td}=await q;
    tg=td||[];
  }catch(e){
    tg=[];
  }

  const g=groupBy(data,r=>r.division||"未設定");
  const tmap=new Map();
  tg.forEach(t=>{
    const k=t.division||"未設定";
    tmap.set(k,(tmap.get(k)||0)+Number(t.target_count||0));
  });
  const keys=[...new Set([...g.map(x=>x.key),...tmap.keys()])].sort((a,b)=>String(a).localeCompare(String(b),"ja"));
  const items=keys.map(k=>{
    const x=g.find(v=>v.key===k)||{key:k,applied:0,appointment:0,set:0,interview:0,offer:0,join:0};
    return {...x,target:tmap.get(k)||0};
  });

  // 本部別比較では、目標が入っていない「未設定」等は比較対象外にする。
  // 対象外を混ぜると、グラフと表で本来見るべき未達本部が埋もれるため。
  const comparisonItems=items
    .filter(x=>Number(x.target||0)>0)
    .sort((a,b)=>{
      const aRate=rateNum(a.join,a.target);
      const bRate=rateNum(b.join,b.target);
      if(aRate!==bRate)return aRate-bRate;
      const aShortage=Math.max(a.target-a.join,0);
      const bShortage=Math.max(b.target-b.join,0);
      if(aShortage!==bShortage)return bShortage-aShortage;
      return String(a.key).localeCompare(String(b.key),"ja");
    });

  updateSummary(data,items);
  renderTargetChart(comparisonItems);
  renderRows(
    ["本部","目標","応募","面接実施","採用","不足","達成率"],
    comparisonItems.map(x=>{
      const shortage=Math.max(x.target-x.join,0);
      return `<tr><td>${listLink(x.key,{division:x.key})}</td><td>${x.target}</td><td>${listLink(x.applied,{division:x.key,filter:"all"},"count-link")}</td><td>${listLink(x.interview,{division:x.key,filter:"all"},"count-link")}</td><td>${listLink(x.join,{division:x.key,filter:"hired"},"count-link")}</td><td>${shortage}</td><td>${rate(x.join,x.target)}</td></tr>`;
    })
  );
}
function targetEditFiscalYearDefault(){
  const fy=fiscalRange($("fy")?.value||"current").fy;
  return fy || fiscalYear();
}
function setupTargetEditFiscalYear(){
  const el=$("targetEditFiscalYear");
  if(!el)return;
  const base=fiscalYear();
  const years=[base-1,base,base+1,base+2];
  const current=String(el.value||targetEditFiscalYearDefault());
  el.innerHTML=years.map(y=>`<option value="${y}">${y}年度</option>`).join("");
  el.value=years.map(String).includes(current)?current:String(targetEditFiscalYearDefault());
}
function targetEditDivisionList(targetRows=[]){
  const fromData=(rows||[]).map(r=>r.division).filter(Boolean);
  const fromTargets=(targetRows||[]).map(r=>r.division).filter(Boolean);
  return [...new Set([...fromData,...fromTargets])].sort((a,b)=>String(a).localeCompare(String(b),"ja"));
}
function targetActualMapForYear(fy){
  const from=fy ? `${fy}-04-01` : "";
  const to=fy ? `${fy+1}-03-31` : "";
  const data=(rows||[])
    .filter(r=>!r.is_deleted)
    .filter(r=>{
      if(!validDate(r.applied_date))return false;
      if(from&&r.applied_date<from)return false;
      if(to&&r.applied_date>to)return false;
      return true;
    });
  const grouped=groupBy(data,r=>r.division||"未設定");
  const map=new Map();
  grouped.forEach(x=>map.set(x.key,x));
  return map;
}
function showTargetEditMessage(message,type="success"){
  const el=$("targetEditMessage");
  if(!el)return;
  if(!message){el.textContent="";el.className="message-box message-info hidden";return;}
  el.textContent=message;
  el.className="message-box message-"+type;
}
async function loadTargetEditRows(){
  const body=$("targetEditBody");
  if(!body)return;
  const fy=Number($("targetEditFiscalYear")?.value||targetEditFiscalYearDefault());
  body.innerHTML='<tr><td class="empty" colspan="5">読込中です</td></tr>';
  showTargetEditMessage("");
  try{
    const {data,error}=await sb.from("recruitment_targets").select("*").eq("fiscal_year",fy);
    if(error)throw error;
    const targetRows=data||[];
    const targetMap=new Map();
    targetRows.forEach(r=>{
      const key=r.division||"未設定";
      if(!targetMap.has(key))targetMap.set(key,{id:r.id,target_count:0});
      const item=targetMap.get(key);
      item.target_count+=Number(r.target_count||0);
    });
    const actualMap=targetActualMapForYear(fy);
    const divisions=targetEditDivisionList(targetRows);
    if(!divisions.length){
      body.innerHTML='<tr><td class="empty" colspan="5">本部データがありません</td></tr>';
      return;
    }
    body.innerHTML=divisions.map(div=>{
      const actual=actualMap.get(div)||{applied:0,join:0};
      const target=Number(targetMap.get(div)?.target_count||0);
      const shortage=Math.max(target-Number(actual.join||0),0);
      return `<tr>
        <td>${listLink(div,{division:div})}</td>
        <td><input class="target-count-input" type="number" min="0" step="1" value="${target}" data-division="${esc(div)}"></td>
        <td>${listLink(actual.applied||0,{division:div,filter:"all"},"count-link")}</td>
        <td>${listLink(actual.join||0,{division:div,filter:"hired"},"count-link")}</td>
        <td>${shortage}</td>
      </tr>`;
    }).join("");
  }catch(e){
    console.error(e);
    body.innerHTML='<tr><td class="empty" colspan="5">目標値の読込に失敗しました</td></tr>';
    showTargetEditMessage("目標値の読込に失敗しました: "+(e.message||e),"error");
  }
}
async function saveTargetEditRows(){
  const inputs=[...document.querySelectorAll(".target-count-input")];
  const fy=Number($("targetEditFiscalYear")?.value||targetEditFiscalYearDefault());
  if(!inputs.length)return;
  showTargetEditMessage("保存中です...","info");
  try{
    for(const input of inputs){
      const division=input.dataset.division||"未設定";
      const target_count=Math.max(0,Number(input.value||0));
      const {data:existing,error:selectError}=await sb.from("recruitment_targets").select("id").eq("fiscal_year",fy).eq("division",division).limit(1);
      if(selectError)throw selectError;
      if(existing&&existing.length){
        const {error:updateError}=await sb.from("recruitment_targets").update({target_count}).eq("id",existing[0].id);
        if(updateError)throw updateError;
      }else{
        const {error:insertError}=await sb.from("recruitment_targets").insert({fiscal_year:fy,division,target_count});
        if(insertError)throw insertError;
      }
    }
    showTargetEditMessage("目標値を保存しました。","success");
    await loadAnalysis();
    await loadTargetEditRows();
  }catch(e){
    console.error(e);
    showTargetEditMessage("目標値の保存に失敗しました: "+(e.message||e),"error");
  }
}

async function initPageAfterLogin(){
  applyFy();
  await loadAnalysis();
}
authInit();
