const sb = window.getRecruitSupabaseClient();

let currentUser=null;
let currentRole=null;
let profiles=[];
let centers=[];
let divisions=[];
let costs=[];
let targets=[];
let optionMasters=[];
let optionKindFilter="all";
let deleteTargetProfile=null;
let disableTargetProfile=null;
let optionEditTarget=null;
const AUDIT_RETENTION_DAYS=180;

function $(id){return document.getElementById(id)}
function setText(id,value){const el=$(id);if(el)el.textContent=String(value)}
function esc(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function log(message,type="info"){
  const el=$("logBox");
  if(!el)return;
  const time=new Date().toLocaleTimeString("ja-JP",{hour12:false});
  const prefix=type==="error"?"[ERROR]":type==="success"?"[OK]":"[INFO]";
  el.textContent=`${time} ${prefix} ${message}\n`+(el.textContent||"");
}

function formatErrorDetail(error){
  if(!error)return "詳細は取得できませんでした。";
  if(typeof error==="string")return error;
  const lines=[];
  if(error.message)lines.push(`message: ${error.message}`);
  if(error.code)lines.push(`code: ${error.code}`);
  if(error.details)lines.push(`details: ${error.details}`);
  if(error.hint)lines.push(`hint: ${error.hint}`);
  if(!lines.length){
    try{return JSON.stringify(error,null,2)}catch(e){return String(error)}
  }
  return lines.join("\n");
}
function showErrorPopup(title,error,context={}){
  const modal=$("errorDetailModal");
  if(!modal){
    log(`${title}: ${formatErrorDetail(error)}`,"error");
    return;
  }
  setText("errorDetailTitle",title||"処理に失敗しました");
  setText("errorDetailMessage",formatErrorDetail(error));
  const ctx=$("errorDetailContext");
  if(ctx){
    const keys=Object.keys(context||{}).filter(k=>context[k]!==undefined&&context[k]!==null&&context[k]!=="");
    ctx.textContent=keys.length?JSON.stringify(context, null, 2):"入力値・処理内容の詳細はありません。";
  }
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
}
function closeErrorPopup(){
  const modal=$("errorDetailModal");
  if(!modal)return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
}
function showValidationPopup(title,message,context={}){
  showErrorPopup(title||"入力内容を確認してください",{message},context);
}

function adminNotice(message,title="確認"){
  if(window.RecruitUI){
    window.RecruitUI.showModal({title,message,type:"info",okText:"閉じる"});
  }else{
    window.alert(message);
  }
}
function adminError(message,title="確認してください"){
  if(window.RecruitUI){
    window.RecruitUI.showError(message,title);
  }else{
    window.alert(message);
  }
}
async function adminConfirm(message,options={}){
  if(window.RecruitUI){
    return await window.RecruitUI.confirmAction(message,{
      title:options.title||"確認",
      okText:options.okText||"実行する",
      cancelText:options.cancelText||"キャンセル",
      type:options.type||"warning"
    });
  }
  return window.confirm(message);
}
function adminPrompt(message,defaultValue=""){
  return window.prompt(message,defaultValue);
}


function setMsg(id,msg,type="info"){
  const el=$(id);
  if(!el)return;
  el.textContent=msg;
  el.className="message-box message-"+type;
}
function nowIso(){return new Date().toISOString()}
function notifyRecruitMasterChanged(kind){
  if(window.RecruitMaster && typeof window.RecruitMaster.notifyUpdated === "function"){
    window.RecruitMaster.notifyUpdated({ kind, source:"admin_settings", at:nowIso() });
  }else if(window.clearRecruitMasterCache){
    window.clearRecruitMasterCache();
  }
}
function fmtDate(value){return value?String(value).slice(0,10):"-"}
function isAdmin(){
  const role=String(currentRole||"").toLowerCase();
  return role==="admin";
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
    if(window.RecruitAuth && typeof window.RecruitAuth.fetchCurrentRole === "function"){
      currentRole = await window.RecruitAuth.fetchCurrentRole(true) || "editor";
    }else{
      let profile = null;
      const byUserId = await sb.from("profiles").select("role,email,is_active,user_id").eq("user_id",userId).maybeSingle();
      profile = byUserId.data || null;
      if((!profile || byUserId.error) && currentUser?.email){
        const byEmail = await sb.from("profiles").select("role,email,is_active,user_id").eq("email",currentUser.email).maybeSingle();
        profile = byEmail.data || profile;
      }
      if(profile && profile.is_active===false){throw new Error("このアカウントは停止されています。管理者へ確認してください。")}
      currentRole=profile?.role||"editor";
    }
    if(window.RecruitOpsGuard) window.RecruitOpsGuard.setRole(currentRole);
  }catch(e){currentRole="editor"}
  try{localStorage.setItem("recruit_user_role",currentRole||"editor")}catch(e){}
  return currentRole;
}
function showAuth(msg="未ログインです",type="info"){
  $("authScreen")?.classList.remove("hidden");
  $("accessDeniedScreen")?.classList.add("hidden");
  $("appScreen")?.classList.add("hidden");
  currentUser=null;
  currentRole=null;
  setMsg("authMessage",msg,type);
  document.body.classList.remove("auth-checking");
}
function showAccessDenied(){
  $("authScreen")?.classList.add("hidden");
  $("accessDeniedScreen")?.classList.remove("hidden");
  $("appScreen")?.classList.add("hidden");
  document.body.classList.remove("auth-checking");
}
async function showApp(){
  const user=await getUser();
  if(!user){showAuth();return false}
  await getRole(user.id);
  if(!isAdmin()){
    try{localStorage.setItem("recruit_user_role",currentRole||"editor")}catch(e){}
    showAccessDenied();
    return false;
  }
  try{localStorage.setItem("recruit_user_role",currentRole||"admin")}catch(e){}
  $("authScreen")?.classList.add("hidden");
  $("accessDeniedScreen")?.classList.add("hidden");
  $("appScreen")?.classList.remove("hidden");
  setText("sideRole",currentRole||"admin");
  document.body.classList.remove("auth-checking");
  if(typeof renderDashboardSidebar==="function")renderDashboardSidebar();
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
    if(await showApp()){await writeAuditLog("login","auth",currentUser?.id,{email:currentUser?.email});await reloadAll();}
  }catch(e){setMsg("authMessage","ログイン失敗: "+(e.message||e),"error")}
}
async function logout(){
  try{await sb.auth.signOut()}catch(e){}
  try{localStorage.removeItem("recruit_user_role")}catch(e){}
  location.replace("./index.html");
}
sb.auth.onAuthStateChange((ev)=>{
  if(ev==="SIGNED_OUT"){
    try{localStorage.removeItem("recruit_user_role")}catch(e){}
    if((location.pathname.split("/").pop()||"index.html").toLowerCase()!=="index.html"){
      location.replace("./index.html");
    }
  }
});
async function authInit(){
  try{if(await showApp())await reloadAll()}
  catch(e){console.error(e);showAuth("初期化に失敗しました","error")}
  finally{document.body.classList.remove("auth-checking")}
}

const OPTION_TAB_NAMES=new Set(["job_type","owner","channel","channel_detail","status","decline_reason","reject_reason"]);
function switchTab(name){
  const targetName=OPTION_TAB_NAMES.has(name)?"options":name;
  if(OPTION_TAB_NAMES.has(name)){
    optionKindFilter=name;
    updateOptionPanelMeta();
  }
  document.querySelectorAll(".admin-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===name));
  document.querySelectorAll(".admin-panel").forEach(panel=>panel.classList.add("hidden"));
  $("tab-"+targetName)?.classList.remove("hidden");
  if(targetName==="options")renderOptionMasters();
  if(name==="audit")loadAuditLogs();
}
function isMissingMasterTableError(error){
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" ").toLowerCase();
  return text.includes("could not find the table") || text.includes("relation") || text.includes("schema cache") || text.includes("404") || text.includes("42p01") || text.includes("pgrst205");
}
async function fetchAll(table,order){
  let q=sb.from(table).select("*");
  if(order)q=q.order(order,{ascending:true});
  const {data,error}=await q;
  if(error){
    if(String(table||"").startsWith("master_") && isMissingMasterTableError(error)){
      log(`${table} は未作成のためスキップしました。必要な場合は同梱SQLで作成してください。`,"info");
      return [];
    }
    throw error;
  }
  return data||[];
}
async function reloadAll(){
  log("マスター設定を読み込んでいます");
  await Promise.all([loadProfiles(),loadCenters(),loadOptionMasters(),loadCosts(),loadTargets()]);
  log("マスター設定を更新しました","success");
}

async function loadProfiles(){
  profiles=await fetchAll("profiles","email");
  setText("sideProfiles",profiles.length.toLocaleString());
  renderProfiles();
}
function renderProfiles(){
  const body=$("profilesBody");
  if(!body)return;
  body.innerHTML=profiles.map(p=>{
    const userId=esc(p.user_id);
    const isSelf=String(p.user_id||"")===String(currentUser?.id||"");
    const isActive=p.is_active!==false;
    const statusText=isActive?"有効":"停止中";
    const statusClass=isActive?"status-active":"status-disabled";
    return `<tr class="${isActive?"":"is-disabled-account"}">
      <td><strong>${esc(p.email)}</strong><div class="admin-muted">${esc(p.user_id)}</div></td>
      <td><span class="account-status-pill ${statusClass}">${statusText}</span>${p.disabled_at?`<div class="admin-muted">停止日：${esc(formatDateTime(p.disabled_at))}</div>`:""}${p.disabled_reason?`<div class="admin-muted">理由：${esc(p.disabled_reason)}</div>`:""}</td>
      <td>
        <select id="role_${userId}" class="admin-mini-select">
          <option value="admin" ${p.role==="admin"?"selected":""}>admin</option>
          <option value="editor" ${p.role==="editor"?"selected":""}>editor</option>
          <option value="viewer" ${p.role==="viewer"?"selected":""}>viewer</option>
        </select>
      </td>
      <td>${esc(fmtDate(p.created_at))}</td>
      <td>${esc(fmtDate(p.updated_at))}</td>
      <td>
        <div class="admin-row-actions">
          <button class="mini-btn" type="button" onclick="updateRole('${userId}')">権限更新</button>
          ${isActive?`<button class="mini-btn warning" type="button" onclick="openDisableAccountModal('${userId}')" ${isSelf?"disabled title=\"自分自身は停止できません\"":""}>停止</button>`:`<button class="mini-btn success" type="button" onclick="enableAccount('${userId}')">再開</button>`}
          <button class="mini-btn danger" type="button" onclick="openDeleteAccountModal('${userId}')" ${isSelf?"disabled title=\"自分自身は削除できません\"":""}>削除</button>
        </div>
      </td>
    </tr>`;
  }).join("")||'<tr><td class="empty" colspan="6">ユーザーがありません</td></tr>';
}
async function updateRole(userId){
  const role=$("role_"+userId)?.value;
  if(!role)return;
  if(userId===currentUser?.id && role!=="admin"){
    adminError("自分自身のadmin権限はこの画面から外せません。");
    await loadProfiles();
    return;
  }
  const before=profiles.find(p=>String(p.user_id)===String(userId));
  const {error}=await sb.from("profiles").update({role,updated_at:nowIso()}).eq("user_id",userId);
  if(error){log("権限更新に失敗: "+error.message,"error");showErrorPopup("権限更新に失敗しました",error,{処理:"権限更新",user_id:userId,role});return}
  await writeAuditLog("role_update","profiles",userId,{email:before?.email||null,before_role:before?.role||null,after_role:role});
  log("権限を更新しました","success");
  await loadProfiles();
}

function openDisableAccountModal(userId){
  const target=profiles.find(p=>String(p.user_id)===String(userId));
  if(!target){adminError("停止対象のユーザーを確認できません。");return}
  if(String(target.user_id||"")===String(currentUser?.id||"")){
    adminError("自分自身のアカウントは停止できません。別の管理者で操作してください。");
    return;
  }
  disableTargetProfile=target;
  setText("disableAccountEmail",target.email||"-");
  setText("disableAccountRole",target.role||"-");
  setText("disableAccountUserId",target.user_id||"-");
  const reason=$("disableAccountReason");
  if(reason)reason.value="";
  const modal=$("disableAccountModal");
  if(modal){
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
  }
}
function closeDisableAccountModal(){
  disableTargetProfile=null;
  const modal=$("disableAccountModal");
  if(modal){
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
  }
}
async function confirmDisableAccount(){
  const target=disableTargetProfile;
  if(!target){closeDisableAccountModal();return}
  if(String(target.user_id||"")===String(currentUser?.id||"")){
    adminError("自分自身のアカウントは停止できません。");
    closeDisableAccountModal();
    return;
  }
  const reason=String($("disableAccountReason")?.value||"").trim()||"理由未入力";
  const payload={is_active:false,disabled_at:nowIso(),disabled_by:currentUser?.id||null,disabled_reason:reason,updated_at:nowIso()};
  const {error}=await sb.from("profiles").update(payload).eq("user_id",target.user_id);
  if(error){log("アカウント停止に失敗: "+error.message,"error");showErrorPopup("アカウント停止に失敗しました",error,{処理:"アカウント停止",user_id:target.user_id,email:target.email});return}
  await writeAuditLog("account_disable","profiles",target.user_id,{email:target.email||null,role:target.role||null,reason});
  log(`${target.email||target.user_id} を停止しました`,"success");
  closeDisableAccountModal();
  await loadProfiles();
}
async function enableAccount(userId){
  const target=profiles.find(p=>String(p.user_id)===String(userId));
  if(!target){adminError("再開対象のユーザーを確認できません。");return}
  const {error}=await sb.from("profiles").update({is_active:true,disabled_at:null,disabled_by:null,disabled_reason:null,updated_at:nowIso()}).eq("user_id",userId);
  if(error){log("アカウント再開に失敗: "+error.message,"error");showErrorPopup("アカウント再開に失敗しました",error,{処理:"アカウント再開",user_id,email:target.email});return}
  await writeAuditLog("account_enable","profiles",userId,{email:target.email||null,role:target.role||null});
  log(`${target.email||userId} を再開しました`,"success");
  await loadProfiles();
}

function openDeleteAccountModal(userId){
  const target=profiles.find(p=>String(p.user_id)===String(userId));
  if(!target){adminError("削除対象のユーザーを確認できません。");return}
  if(String(target.user_id||"")===String(currentUser?.id||"")){
    adminError("自分自身のアカウントは削除できません。別の管理者で操作してください。");
    return;
  }
  deleteTargetProfile=target;
  setText("deleteAccountEmail",target.email||"-");
  setText("deleteAccountRole",target.role||"-");
  setText("deleteAccountUserId",target.user_id||"-");
  const modal=$("deleteAccountModal");
  if(modal){
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
  }
}
function closeDeleteAccountModal(){
  deleteTargetProfile=null;
  const modal=$("deleteAccountModal");
  if(modal){
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
  }
}
async function confirmDeleteAccount(){
  const target=deleteTargetProfile;
  if(!target){closeDeleteAccountModal();return}
  if(String(target.user_id||"")===String(currentUser?.id||"")){
    adminError("自分自身のアカウントは削除できません。");
    closeDeleteAccountModal();
    return;
  }
  const label=target.email||target.user_id||"対象ユーザー";
  try{
    log(`${label} のログインアカウント削除を開始します`);

    const {data,error}=await sb.functions.invoke("delete-auth-user",{
      body:{
        user_id:target.user_id,
        email:target.email||null
      }
    });
    if(error)throw error;
    if(data && data.ok===false){
      throw new Error(data.message||"ログインアカウント削除に失敗しました。");
    }

    await writeAuditLog("account_delete","profiles",target.user_id,{
      email:target.email||null,
      role:target.role||null,
      auth_deleted:true,
      deleted_by:currentUser?.id||null
    });
    log(`${label} のログインアカウントとアプリ権限情報を削除しました`,"success");
    closeDeleteAccountModal();
    await loadProfiles();
  }catch(e){
    log("アカウント削除に失敗: "+(e.message||e),"error");
    showErrorPopup("アカウント削除に失敗しました",e,{
      処理:"ログインアカウント削除",
      user_id:target?.user_id,
      email:target?.email,
      補足:"Supabase Edge Function delete-auth-user のデプロイと SUPABASE_SERVICE_ROLE_KEY の設定を確認してください。"
    });
  }
}

const DIVISION_COLORS=[
  {label:"青",value:"#2563eb"},
  {label:"緑",value:"#16a34a"},
  {label:"紫",value:"#7c3aed"},
  {label:"橙",value:"#f97316"},
  {label:"赤",value:"#dc2626"},
  {label:"水",value:"#0891b2"},
  {label:"紺",value:"#1e3a8a"},
  {label:"灰",value:"#64748b"}
];
function normalizeColor(value){return String(value||"#2563eb").trim()||"#2563eb"}
function renderDivisionColorChoices(selected){
  const wrap=$("divisionColorChoices");
  const hidden=$("divisionColor");
  if(!wrap)return;
  const current=normalizeColor(selected||hidden?.value);
  if(hidden)hidden.value=current;
  wrap.innerHTML=DIVISION_COLORS.map(c=>{
    const active=c.value.toLowerCase()===current.toLowerCase();
    return `<button class="color-choice color-swatch ${active?"active":""}" type="button" onclick="selectDivisionColor('${esc(c.value)}')" aria-pressed="${active?"true":"false"}" style="--swatch:${esc(c.value)}">
      <span class="swatch-circle"></span>
      <span class="swatch-label">${esc(c.label)}</span>
      <span class="swatch-check">✓</span>
      ${active?'<span class="swatch-selected">選択中</span>':''}
    </button>`;
  }).join("");
}
function selectDivisionColor(value){
  const hidden=$("divisionColor");
  if(hidden)hidden.value=normalizeColor(value);
  renderDivisionColorChoices(value);
}
async function loadDivisions(){
  try{
    divisions=await fetchAll("master_divisions","display_order");
  }catch(e){
    divisions=[];
    log("本部マスタ読込に失敗: "+(e.message||e),"error");
  }
  divisions.sort((a,b)=>(Number(a.display_order||0)-Number(b.display_order||0)) || String(a.name||"").localeCompare(String(b.name||""),"ja"));
  setText("divisionCount",divisions.length.toLocaleString());
  const select=$("centerDivisionId");
  if(select){
    const current=select.value;
    select.innerHTML='<option value="">本部を選択</option>'+divisions.filter(d=>d.is_active!==false).map(d=>`<option value="${Number(d.id)}">${esc(d.name)}</option>`).join("");
    if(current)select.value=current;
  }
  renderDivisions();
  renderDivisionColorChoices($("divisionColor")?.value||"#2563eb");
}
function divisionNameById(id){
  if(!id)return "";
  return divisions.find(d=>String(d.id)===String(id))?.name||"";
}
function renderDivisions(){
  const body=$("divisionsBody");
  if(!body)return;
  body.innerHTML=divisions.map(d=>{
    const active=d.is_active!==false;
    return `<tr>
      <td><strong>${esc(d.name)}</strong><div class="admin-muted">ID：${esc(d.id)}</div></td>
      <td><span class="division-color-preview"><span class="color-dot" style="background:${esc(normalizeColor(d.color))}"></span>${esc(normalizeColor(d.color))}</span></td>
      <td class="num">${Number(d.display_order||0).toLocaleString()}</td>
      <td>${active?'<span class="status-pill on">使用中</span>':'<span class="status-pill off">停止</span>'}</td>
      <td><div class="admin-row-actions">
        <button class="mini-btn" type="button" onclick="editDivision(${Number(d.id)})">編集</button>
        <button class="mini-btn ${active?'danger':'success'}" type="button" onclick="toggleDivision(${Number(d.id)},${active?'false':'true'})">${active?'停止':'再開'}</button>
        <button class="mini-btn danger" type="button" onclick="deleteDivision(${Number(d.id)})">削除</button>
      </div></td>
    </tr>`;
  }).join("")||'<tr><td class="empty" colspan="5">本部マスタがありません</td></tr>';
}
function clearDivisionForm(){
  ["divisionId","divisionName","divisionOrder"].forEach(id=>{const el=$(id);if(el)el.value=""});
  if($("divisionActive"))$("divisionActive").value="true";
  if($("divisionColor"))$("divisionColor").value="#2563eb";
  renderDivisionColorChoices("#2563eb");
}
function editDivision(id){
  const d=divisions.find(x=>Number(x.id)===Number(id));
  if(!d)return;
  $("divisionId").value=d.id;
  $("divisionName").value=d.name||"";
  $("divisionOrder").value=d.display_order??"";
  if($("divisionActive"))$("divisionActive").value=String(d.is_active!==false);
  if($("divisionColor"))$("divisionColor").value=normalizeColor(d.color);
  renderDivisionColorChoices(d.color);
  window.scrollTo({top:0,behavior:"smooth"});
}
async function saveDivision(){
  const id=$("divisionId")?.value||"";
  const name=($("divisionName")?.value||"").trim();
  if(!name){showValidationPopup("本部保存の入力不足","本部名を入力してください。",{name});return}
  const row={name,color:normalizeColor($("divisionColor")?.value),display_order:Number($("divisionOrder")?.value||0),is_active:$("divisionActive")?.value!=="false",updated_at:nowIso()};
  try{
    const q=id?sb.from("master_divisions").update(row).eq("id",id).select("id").maybeSingle():sb.from("master_divisions").insert({...row,created_at:nowIso()}).select("id").maybeSingle();
    const {data,error}=await q;
    if(error)throw error;
    await writeAuditLog("division_save","master_divisions",id||data?.id||name,{mode:id?"update":"insert",row});
    clearDivisionForm();
    log("本部マスタを保存しました","success");
    notifyRecruitMasterChanged("division");
    await loadDivisions();
  }catch(e){
    log("本部保存に失敗: "+(e.message||e),"error");
    showErrorPopup("本部保存に失敗しました",e,{処理:"本部マスタ保存",id:id||null,row});
  }
}
async function toggleDivision(id,nextActive){
  const d=divisions.find(x=>Number(x.id)===Number(id));
  if(!d)return;
  const label=nextActive?"再開":"停止";
  if(!await adminConfirm(`本部「${d.name}」を${label}します。`,{title:`本部${label}確認`,okText:label+"する"}))return;
  try{
    const {error}=await sb.from("master_divisions").update({is_active:!!nextActive,updated_at:nowIso()}).eq("id",id);
    if(error)throw error;
    await writeAuditLog(nextActive?"division_enable":"division_disable","master_divisions",id,{name:d.name});
    notifyRecruitMasterChanged("division");
    await loadDivisions();
  }catch(e){showErrorPopup(`本部${label}に失敗しました`,e,{id,name:d.name,nextActive});}
}
async function deleteDivision(id){
  const d=divisions.find(x=>Number(x.id)===Number(id));
  if(!d)return;
  const used=centers.some(c=>String(c.division_id)===String(id));
  if(used){showValidationPopup("本部を削除できません","この本部を使用している営業所があります。先に営業所の所属本部を変更してください。",{id,name:d.name});return}
  const confirmText=adminPrompt(`本部「${d.name}」を完全削除します。\n削除する場合は「削除」と入力してください。`);
  if(confirmText!=="削除")return;
  try{
    const {error}=await sb.from("master_divisions").delete().eq("id",id);
    if(error)throw error;
    await writeAuditLog("division_delete","master_divisions",id,{deleted:d});
    notifyRecruitMasterChanged("division");
    await loadDivisions();
  }catch(e){showErrorPopup("本部削除に失敗しました",e,{id,name:d.name});}
}
async function loadCenters(){
  await loadDivisions();
  try{
    centers=await fetchAll("master_centers","center_name");
  }catch(e){
    centers=[];
    log("営業所マスタ読込に失敗: "+(e.message||e),"error");
  }
  centers.sort((a,b)=>{
    const ad=divisionNameById(a.division_id)||a.division||"";
    const bd=divisionNameById(b.division_id)||b.division||"";
    return String(ad).localeCompare(String(bd),"ja") || (Number(a.display_order||0)-Number(b.display_order||0)) || String(a.center_name||"").localeCompare(String(b.center_name||""),"ja");
  });
  setText("sideCenters",centers.length.toLocaleString());
  setText("centerCount",centers.length.toLocaleString());
  renderCenters();
}
function renderCenters(){
  const body=$("centersBody");
  if(!body)return;
  body.innerHTML=centers.map(c=>{
    const active=c.is_active!==false;
    const divisionLabel=divisionNameById(c.division_id)||c.division||"-";
    return `<tr>
      <td>${esc(divisionLabel)}</td>
      <td><strong>${esc(c.center_name)}</strong><div class="admin-muted">ID：${esc(c.id)}</div></td>
      <td>${esc(c.center_code||"")}</td>
      <td class="num">${Number(c.display_order||0).toLocaleString()}</td>
      <td>${active?'<span class="status-pill on">使用中</span>':'<span class="status-pill off">停止</span>'}</td>
      <td><div class="admin-row-actions">
        <button class="mini-btn" type="button" onclick="editCenter(${Number(c.id)})">編集</button>
        <button class="mini-btn ${active?'danger':'success'}" type="button" onclick="toggleCenter(${Number(c.id)},${active?'false':'true'})">${active?'停止':'再開'}</button>
        <button class="mini-btn danger" type="button" onclick="deleteCenter(${Number(c.id)})">削除</button>
      </div></td>
    </tr>`;
  }).join("")||'<tr><td class="empty" colspan="6">営業所がありません</td></tr>';
}
function editCenter(id){
  const c=centers.find(x=>Number(x.id)===Number(id));
  if(!c)return;
  $("centerId").value=c.id;
  if($("centerDivisionId"))$("centerDivisionId").value=c.division_id||"";
  $("centerName").value=c.center_name||"";
  $("centerCode").value=c.center_code||"";
  if($("centerOrder"))$("centerOrder").value=c.display_order??"";
  if($("centerActive"))$("centerActive").value=String(c.is_active!==false);
  window.scrollTo({top:0,behavior:"smooth"});
}
function clearCenterForm(){["centerId","centerName","centerCode","centerOrder"].forEach(id=>{const el=$(id);if(el)el.value=""});if($("centerDivisionId"))$("centerDivisionId").value="";if($("centerActive"))$("centerActive").value="true"}
function isColumnSchemaError(error){
  const text=[error?.message,error?.details,error?.hint,error?.code].filter(Boolean).join(" ").toLowerCase();
  return text.includes("column") || text.includes("schema cache") || text.includes("pgrst204") || text.includes("42703");
}
async function runCenterSaveQuery(id,row){
  // master_centers は環境により created_at 列が存在しないため、
  // ここでは存在確認できない列を送らない。
  // insert/update ともに渡された row だけで保存する。
  const payload={...row};
  const q=id
    ? sb.from("master_centers").update(payload).eq("id",id).select("id").maybeSingle()
    : sb.from("master_centers").insert(payload).select("id").maybeSingle();
  return await q;
}
async function saveCenter(){
  const id=$("centerId")?.value||"";
  const selectedDivisionId=$("centerDivisionId")?.value||"";
  const selectedDivision=divisions.find(d=>String(d.id)===String(selectedDivisionId));
  const divisionName=(selectedDivision?.name||"").trim();
  const centerName=($("centerName")?.value||"").trim();
  const centerCode=($("centerCode")?.value||"").trim();
  if(!selectedDivisionId||!divisionName||!centerName){
    showValidationPopup("営業所保存の入力不足","所属本部と営業所名を入力してください。",{division_id:selectedDivisionId,division:divisionName,center_name:centerName});
    return;
  }
  const fullRow={
    division_id:Number(selectedDivisionId),
    division:divisionName,
    center_name:centerName,
    center_code:centerCode||null,
    display_order:Number($("centerOrder")?.value||0),
    is_active:$("centerActive")?.value!=="false",
    updated_at:nowIso()
  };
  const legacyRow={
    division:divisionName,
    center_name:centerName,
    center_code:centerCode||null
  };
  const minimalRow={
    division:divisionName,
    center_name:centerName
  };
  try{
    let row=fullRow;
    let result=await runCenterSaveQuery(id,row);
    if(result.error && isColumnSchemaError(result.error)){
      console.warn("master_centers full schema save failed. Retrying legacy payload.",result.error);
      row=legacyRow;
      result=await runCenterSaveQuery(id,row);
    }
    if(result.error && isColumnSchemaError(result.error)){
      console.warn("master_centers legacy schema save failed. Retrying minimal payload.",result.error);
      row=minimalRow;
      result=await runCenterSaveQuery(id,row);
    }
    const {data,error}=result;
    if(error)throw error;
    await writeAuditLog("center_save","master_centers",id||data?.id||centerName,{mode:id?"update":"insert",row,division_id:selectedDivisionId});
    clearCenterForm();
    log("営業所マスタを保存しました","success");
    notifyRecruitMasterChanged("center");
    await loadCenters();
  }catch(e){
    log("営業所保存に失敗: "+(e.message||e),"error");
    showErrorPopup("営業所保存に失敗しました",e,{処理:"営業所マスタ保存",id:id||null,入力値:{division_id:selectedDivisionId,division:divisionName,center_name:centerName,center_code:centerCode},保存候補:{fullRow,legacyRow,minimalRow}});
  }
}
async function toggleCenter(id,nextActive){
  const c=centers.find(x=>Number(x.id)===Number(id));
  if(!c)return;
  const label=nextActive?"再開":"停止";
  if(!await adminConfirm(`営業所「${c.center_name}」を${label}します。`,{title:`営業所${label}確認`,okText:label+"する"}))return;
  try{
    const {error}=await sb.from("master_centers").update({is_active:!!nextActive,updated_at:nowIso()}).eq("id",id);
    if(error)throw error;
    await writeAuditLog(nextActive?"center_enable":"center_disable","master_centers",id,{name:c.center_name});
    notifyRecruitMasterChanged("center");
    await loadCenters();
  }catch(e){showErrorPopup(`営業所${label}に失敗しました`,e,{id,name:c.center_name,nextActive});}
}
async function deleteCenter(id){
  const c=centers.find(x=>Number(x.id)===Number(id));
  if(!c)return;
  const confirmText=adminPrompt(`営業所「${c.center_name}」を完全削除します。\n削除する場合は「削除」と入力してください。`);
  if(confirmText!=="削除")return;
  try{
    const {error}=await sb.from("master_centers").delete().eq("id",id);
    if(error)throw error;
    await writeAuditLog("center_delete","master_centers",id,{deleted:c});
    notifyRecruitMasterChanged("center");
    await loadCenters();
  }catch(e){showErrorPopup("営業所削除に失敗しました",e,{id,name:c.center_name});}
}

const OPTION_TABLES={
  job_type:{table:"master_job_types",label:"職種マスタ",shortLabel:"職種",hasColor:false},
  owner:{table:"master_owners",label:"担当者マスタ",shortLabel:"担当者",hasColor:false},
  channel:{table:"master_channels",label:"媒体マスタ",shortLabel:"媒体",hasColor:false},
  channel_detail:{table:"master_channel_details",label:"媒体詳細マスタ",shortLabel:"媒体詳細",hasColor:false},
  status:{table:"master_statuses",label:"ステータスマスタ",shortLabel:"ステータス",hasColor:true},
  decline_reason:{table:"master_decline_reasons",label:"辞退理由マスタ",shortLabel:"辞退理由",hasColor:false},
  reject_reason:{table:"master_reject_reasons",label:"不採用理由マスタ",shortLabel:"不採用理由",hasColor:false}
};
function updateOptionPanelMeta(){
  const meta=OPTION_TABLES[optionKindFilter]||OPTION_TABLES.job_type;
  setText("optionPanelEyebrow",String(meta.shortLabel||"OPTION").toUpperCase()+" MASTER");
  setText("optionPanelTitle",meta.label||"選択肢マスタ");
  setText("optionPanelLead",`${meta.shortLabel||"項目"}の名称・表示順・状態を管理します。停止した項目は新規入力候補から外れます。`);
  setText("optionFormTitle",`${meta.label||"マスタ"}を追加`);
  setText("optionFormSub",`${meta.shortLabel||"項目"}を追加・編集します。`);
  const kind=$("optionKind"); if(kind)kind.value=optionKindFilter;
  const kindLabel=$("optionKindLabel"); if(kindLabel)kindLabel.value=meta.label||"";
}
function optionKindLabel(kind){return OPTION_TABLES[kind]?.label||kind||"-"}
function optionTableName(kind){return OPTION_TABLES[kind]?.table||""}
async function loadOptionMasters(){
  const all=[];
  for(const [kind,meta] of Object.entries(OPTION_TABLES)){
    const rows=await fetchAll(meta.table,"display_order");
    rows.forEach(row=>all.push({...row,kind,kind_label:meta.label,table_name:meta.table}));
  }
  optionMasters=all.sort((a,b)=>String(a.kind_label||"").localeCompare(String(b.kind_label||""),"ja") || Number(a.display_order||0)-Number(b.display_order||0) || String(a.name||"").localeCompare(String(b.name||""),"ja"));
  updateOptionPanelMeta();
  renderOptionMasters();
  syncCostChannelSelect();
}
function costChannelTypeOf(channel){
  const value=String(channel||"").trim();
  if(!value)return "求人媒体";
  if(value.includes("ハローワーク") || value.includes("ハロワ"))return "ハローワーク";
  if(value.includes("紹介"))return "紹介";
  if(value.includes("リファラル"))return "リファラル";
  if(value.includes("その他"))return "その他";
  return "求人媒体";
}
function syncCostChannelSelect(){
  const select=$("costChannel");
  if(!select || select.tagName!=="SELECT")return;
  const current=String(select.value||"").trim();
  const channels=[...new Set(optionMasters
    .filter(row=>row.kind==="channel" && row.is_active!==false)
    .map(row=>String(row.name||"").trim())
    .filter(Boolean))];
  select.innerHTML='<option value="">媒体マスタから選択</option>' + channels.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
  if(current && channels.includes(current))select.value=current;
}
function renderOptionKindTabs(){}
function setOptionKindFilter(kind){
  switchTab(kind||"job_type");
}
function getVisibleOptionMasters(){
  return optionMasters.filter(row=>row.kind===optionKindFilter);
}
function renderOptionMasters(){
  updateOptionPanelMeta();
  const body=$("optionsBody");
  if(!body)return;
  const visibleRows=getVisibleOptionMasters();
  setText("optionCurrentCount",visibleRows.length.toLocaleString());
  if(!visibleRows.length){
    body.innerHTML='<tr><td class="empty" colspan="6">このマスタの登録がありません</td></tr>';
    return;
  }
  body.innerHTML=visibleRows.map(row=>{
    const active=row.is_active!==false;
    const actionLabel=active?"停止":"再開";
    const actionClass=active?"danger":"success";
    const color=normalizeColor(row.color||"");
    const colorCell=row.color?`<span class="division-color-preview"><span class="color-dot" style="background:${esc(color)}"></span>${esc(color)}</span>`:'<span class="admin-muted">-</span>';
    return `<tr>
      <td><strong>${esc(row.name)}</strong></td>
      <td>${colorCell}</td>
      <td class="num">${Number(row.display_order||0).toLocaleString()}</td>
      <td>${active?'<span class="status-pill on">使用中</span>':'<span class="status-pill off">停止</span>'}</td>
      <td>${esc(fmtDate(row.updated_at||row.created_at))}</td>
      <td>
        <div class="row-actions master-option-actions">
          <button class="mini-btn" type="button" onclick="editOptionMaster('${esc(row.kind)}',${Number(row.id)})">編集</button>
          <button class="mini-btn ${actionClass}" type="button" onclick="toggleOptionMaster('${esc(row.kind)}',${Number(row.id)},${active?'false':'true'})">${actionLabel}</button>
          <button class="mini-btn danger" type="button" onclick="deleteOptionMaster('${esc(row.kind)}',${Number(row.id)})">削除</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}
function clearOptionForm(resetKind=true){
  if(resetKind){optionKindFilter=optionKindFilter||"job_type";updateOptionPanelMeta()}
  ["optionId","optionName","optionOrder"].forEach(id=>{const el=$(id);if(el)el.value=""});
  const active=$("optionActive");
  if(active)active.value="true";
  optionEditTarget=null;
  updateOptionPanelMeta();
}
function openOptionModal(){
  const modal=$("optionMasterModal");
  if(!modal)return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
  setTimeout(()=>$("optionName")?.focus(),30);
}
function closeOptionModal(){
  const modal=$("optionMasterModal");
  if(!modal)return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
  optionEditTarget=null;
}
function openNewOptionMaster(){
  clearOptionForm(true);
  updateOptionPanelMeta();
  openOptionModal();
}
function editOptionMaster(kind,id){
  const row=optionMasters.find(x=>x.kind===kind&&Number(x.id)===Number(id));
  if(!row){adminError("編集対象を確認できません。");return}
  optionEditTarget={kind,id:Number(id),table:row.table_name||optionTableName(kind),before:{...row}};
  optionKindFilter=kind;
  updateOptionPanelMeta();
  $("optionKind").value=kind;
  $("optionId").value=row.id;
  $("optionName").value=row.name||"";
  $("optionOrder").value=row.display_order??"";
  $("optionActive").value=row.is_active===false?"false":"true";
  setText("optionFormTitle",`${optionKindLabel(kind)}を編集`);
  setText("optionFormSub",`${row.name||""} の名称・表示順・状態を変更します。`);
  openOptionModal();
}
async function saveOptionMaster(){
  const kind=$("optionKind")?.value||"";
  const table=optionTableName(kind);
  const name=$("optionName")?.value.trim()||"";
  if(!table){adminError("区分を確認できません。");return}
  if(!name){adminError("名称を入力してください。");return}
  const meta=OPTION_TABLES[kind]||{};
  const row={
    name,
    display_order:Number($("optionOrder")?.value||0),
    is_active:$("optionActive")?.value!=="false",
    updated_at:nowIso()
  };
  if(meta.hasColor)row.color="#2563eb";
  const id=$("optionId")?.value||"";
  try{
    const q=id?sb.from(table).update(row).eq("id",id):sb.from(table).insert(row);
    const {error}=await q;
    if(error)throw error;
    await writeAuditLog("option_master_save",table,id||name,{mode:id?"update":"insert",kind,label:optionKindLabel(kind),before:optionEditTarget?.before||null,after:row});
    clearOptionForm(false);
    closeOptionModal();
    log(`${optionKindLabel(kind)}マスタを保存しました`,"success");
    notifyRecruitMasterChanged(kind);
    await loadOptionMasters();
  }catch(e){
    log("選択肢マスタ保存に失敗: "+(e.message||e),"error");
    showErrorPopup("選択肢マスタ保存に失敗しました",e,{処理:"選択肢マスタ保存",kind,table,name,row});
  }
}
async function toggleOptionMaster(kind,id,nextActive){
  const row=optionMasters.find(x=>x.kind===kind&&Number(x.id)===Number(id));
  if(!row){adminError("対象を確認できません。");return}
  const table=optionTableName(kind);
  const label=nextActive?"再開":"停止";
  const ok=await adminConfirm(`${optionKindLabel(kind)}「${row.name}」を${label}します。\n停止した項目は新規入力候補から外れます。既存データの表示は残ります。`,{title:`${optionKindLabel(kind)}${label}確認`,okText:label+"する"});
  if(!ok)return;
  try{
    const patch={is_active:!!nextActive,updated_at:nowIso()};
    const {error}=await sb.from(table).update(patch).eq("id",id);
    if(error)throw error;
    await writeAuditLog(nextActive?"option_master_enable":"option_master_disable",table,id,{kind,label:optionKindLabel(kind),name:row.name,before:{is_active:row.is_active!==false},after:{is_active:!!nextActive}});
    log(`${optionKindLabel(kind)}「${row.name}」を${label}しました`,"success");
    notifyRecruitMasterChanged(kind);
    await loadOptionMasters();
  }catch(e){
    log(`${optionKindLabel(kind)}の${label}に失敗: `+(e.message||e),"error");
    showErrorPopup(`${optionKindLabel(kind)}の${label}に失敗しました`,e,{処理:"選択肢マスタ状態変更",kind,table,id,nextActive});
  }
}


function makeArchivedMasterName(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  const stamp=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `削除済_${stamp}`;
}

async function archiveOptionMasterAfterDeleteFailure(kind,table,id,row,deleteError){
  const archivedName=makeArchivedMasterName();
  const patch={
    name:archivedName,
    is_active:false,
    display_order:9999,
    updated_at:nowIso()
  };
  const {error}=await sb.from(table).update(patch).eq("id",id);
  if(error)throw error;
  await writeAuditLog("option_master_archive",table,id,{
    kind,
    label:optionKindLabel(kind),
    before:row,
    after:patch,
    delete_error:deleteError?formatErrorDetail(deleteError):null
  });
  log(`${optionKindLabel(kind)}「${row.name}」を削除扱いにしました`,"success");
}

async function deleteOptionMaster(kind,id){
  const row=optionMasters.find(x=>x.kind===kind&&Number(x.id)===Number(id));
  if(!row){adminError("削除対象を確認できません。");return}
  const table=optionTableName(kind);
  const ok=await adminConfirm(`${optionKindLabel(kind)}「${row.name}」を削除します。

完全削除できない場合は、同じ名称で再登録できるように「削除済み」として無効化します。
既存応募データの文字列は残りますが、新規候補には出なくなります。`,{
    title:`${optionKindLabel(kind)}削除確認`,
    okText:"削除する",
    type:"danger"
  });
  if(!ok)return;
  try{
    const {error}=await sb.from(table).delete().eq("id",id);
    if(error)throw error;
    await writeAuditLog("option_master_delete",table,id,{kind,label:optionKindLabel(kind),deleted:row});
    log(`${optionKindLabel(kind)}「${row.name}」を削除しました`,"success");
    notifyRecruitMasterChanged(kind);
    await loadOptionMasters();
  }catch(deleteError){
    try{
      await archiveOptionMasterAfterDeleteFailure(kind,table,id,row,deleteError);
      notifyRecruitMasterChanged(kind);
      await loadOptionMasters();
      adminNotice(`${optionKindLabel(kind)}「${row.name}」は完全削除できなかったため、削除済みとして無効化しました。

同じ名称で登録し直せます。`,"削除扱いにしました");
    }catch(archiveError){
      log(`${optionKindLabel(kind)}の削除に失敗: `+(archiveError.message||archiveError),"error");
      showErrorPopup(`${optionKindLabel(kind)}の削除に失敗しました`,archiveError,{処理:"選択肢マスタ削除",kind,table,id,name:row?.name,deleteError:formatErrorDetail(deleteError)});
    }
  }
}

async function loadCosts(){
  costs=await fetchAll("channel_costs","fiscal_year");
  costs.sort((a,b)=>(Number(b.fiscal_year||0)-Number(a.fiscal_year||0)) || String(b.target_month||"").localeCompare(String(a.target_month||"")) || String(a.channel||"").localeCompare(String(b.channel||""),"ja"));
  setText("sideCosts",costs.length.toLocaleString());
  renderCosts();
}
function renderCosts(){
  const body=$("costsBody");
  if(!body)return;
  body.innerHTML=costs.map(c=>{
    const active=c.is_active!==false;
    const id=Number(c.id);
    return `<tr class="${active?'':'row-inactive'}">
      <td>${esc(c.fiscal_year)}</td>
      <td>${esc(c.target_month)}</td>
      <td><strong>${esc(c.channel)}</strong></td>
      <td class="num">${Number(c.cost_amount||0).toLocaleString()}円</td>
      <td>${active?'<span class="status-pill on">使用中</span>':'<span class="status-pill off">停止</span>'}</td>
      <td class="admin-actions-cell">
        <button class="mini-btn" type="button" onclick="editCost(${id})">編集</button>
        <button class="mini-btn ${active?'danger':'success'}" type="button" onclick="toggleCost(${id},${active?'false':'true'})">${active?'停止':'再開'}</button>
        <button class="mini-btn danger" type="button" onclick="deleteCost(${id})">削除</button>
      </td>
    </tr>`;
  }).join("")||'<tr><td class="empty" colspan="6">媒体費がありません</td></tr>';
}
function fiscalYearFromMonth(month){
  return window.RecruitCost?.fiscalYearFromMonth ? window.RecruitCost.fiscalYearFromMonth(month) : null;
}
function toMonthKey(dateText){return String(dateText||"").slice(0,7)}
function monthKeysBetween(startDate,endDate){
  return window.RecruitCost?.monthKeysBetween ? window.RecruitCost.monthKeysBetween(startDate,endDate) : [];
}
function splitAmount(total,count,index){
  return window.RecruitCost?.splitAmount ? window.RecruitCost.splitAmount(total,count,index) : 0;
}
function editCost(id){
  const c=costs.find(x=>Number(x.id)===Number(id));
  if(!c)return;
  $("costId").value=c.id;
  $("costContractStart").value=(c.target_month||"")+"-01";
  $("costContractEnd").value=(c.target_month||"")+"-01";
  syncCostChannelSelect();
  $("costChannel").value=c.channel||"";
  const costChannelType=$("costChannelType");
  if(costChannelType)costChannelType.value=costChannelTypeOf(c.channel);
  $("costAmount").value=Number(c.cost_amount||0);
  ["costDivisionNote","costCenterNote","costJobNote"].forEach(id=>{const el=$(id);if(el)el.value=""});
  window.scrollTo({top:0,behavior:"smooth"});
}
function clearCostForm(){["costId","costContractStart","costContractEnd","costChannel","costAmount","costDivisionNote","costCenterNote","costJobNote"].forEach(id=>{const el=$(id);if(el)el.value=""});const costChannelType=$("costChannelType");if(costChannelType)costChannelType.value="求人媒体";}
async function saveCostContract(){
  const editingId=$("costId")?.value||"";
  const start=$("costContractStart")?.value||"";
  const end=$("costContractEnd")?.value||"";
  const channel=$("costChannel")?.value.trim()||"";
  const amount=Number($("costAmount")?.value||0);
  const months=monthKeysBetween(start,end);
  if(!start||!end||!months.length){adminError("契約開始日・契約終了日を正しく入力してください。");return}
  if(!channel){adminError("媒体名を媒体マスタから選択してください。");return}
  if(Number.isNaN(amount)||amount<0){adminError("契約総額は0以上の数字で入力してください。");return}
  try{
    if(editingId){
      const month=months[0];
      const payload={fiscal_year:fiscalYearFromMonth(month),target_month:month,channel,cost_amount:amount,updated_at:nowIso()};
      const {error}=await sb.from("channel_costs").update(payload).eq("id",editingId);
      if(error)throw error;
      log("媒体費を更新しました","success");
    }else{
      for(let i=0;i<months.length;i++){
        const month=months[i];
        const payload={fiscal_year:fiscalYearFromMonth(month),target_month:month,channel,cost_amount:splitAmount(amount,months.length,i),updated_at:nowIso()};
        const {data:existing,error:findError}=await sb.from("channel_costs").select("id").eq("target_month",month).eq("channel",channel).maybeSingle();
        if(findError)throw findError;
        if(existing?.id){
          const {error}=await sb.from("channel_costs").update(payload).eq("id",existing.id);
          if(error)throw error;
        }else{
          const {error}=await sb.from("channel_costs").insert({...payload,created_at:nowIso()});
          if(error)throw error;
        }
      }
      log(`媒体費契約を ${months.length}か月へ配賦して保存しました`,"success");
    }
    await writeAuditLog("cost_save","channel_costs",editingId||channel,{mode:editingId?"update":"upsert_contract",channel,amount,months});
    clearCostForm();
    await loadCosts();
  }catch(e){
    log("媒体費契約の保存に失敗: "+(e.message||e),"error");
  }
}
async function saveCost(){return saveCostContract()}

async function toggleCost(id,nextActive){
  const row=costs.find(x=>Number(x.id)===Number(id));
  if(!row){adminError("対象の媒体費を確認できません。");return}
  const label=nextActive?"再開":"停止";
  if(!await adminConfirm(`媒体費「${row.channel || "-"} / ${row.target_month || "-"}」を${label}しますか？`,{title:`媒体費${label}確認`,okText:label+"する"}))return;
  try{
    const payload={is_active:!!nextActive,updated_at:nowIso()};
    if(!nextActive)payload.disabled_at=nowIso();
    const {error}=await sb.from("channel_costs").update(payload).eq("id",id);
    if(error)throw error;
    await writeAuditLog(nextActive?"cost_enable":"cost_disable","channel_costs",id,{row,nextActive});
    log(`媒体費を${label}しました`,"success");
    await loadCosts();
  }catch(e){
    log(`媒体費の${label}に失敗: `+(e.message||e),"error");
    showErrorPopup(`媒体費の${label}に失敗しました`,e,{処理:`媒体費${label}`,id,row});
  }
}

async function deleteCost(id){
  const row=costs.find(x=>Number(x.id)===Number(id));
  if(!row){adminError("削除対象の媒体費を確認できません。");return}
  const confirmText=adminPrompt(`媒体費「${row.channel || "-"} / ${row.target_month || "-"}」を完全削除します。\n削除する場合は「削除」と入力してください。`);
  if(confirmText!=="削除")return;
  try{
    const {error}=await sb.from("channel_costs").delete().eq("id",id);
    if(error)throw error;
    await writeAuditLog("cost_delete","channel_costs",id,{deleted:row});
    clearCostForm();
    log("媒体費を削除しました","success");
    await loadCosts();
  }catch(e){
    log("媒体費削除に失敗: "+(e.message||e),"error");
    showErrorPopup("媒体費削除に失敗しました",e,{処理:"媒体費削除",id,row});
  }
}


async function loadTargets(){
  targets=await fetchAll("recruitment_targets","fiscal_year");
  targets.sort((a,b)=>(Number(b.fiscal_year||0)-Number(a.fiscal_year||0)) || String(a.division||"").localeCompare(String(b.division||""),"ja") || String(a.center_name||"").localeCompare(String(b.center_name||""),"ja"));
  setText("sideTargets",targets.length.toLocaleString());
  renderTargets();
}
function renderTargets(){
  const body=$("targetsBody");
  if(!body)return;
  body.innerHTML=targets.map(t=>{
    const active=t.is_active!==false;
    const id=Number(t.id);
    return `<tr class="${active?'':'row-inactive'}">
      <td>${esc(t.fiscal_year)}</td>
      <td>${esc(t.division)}</td>
      <td>${esc(t.center_name)}</td>
      <td><strong>${esc(t.job_type)}</strong></td>
      <td class="num">${Number(t.target_count||0).toLocaleString()}</td>
      <td>${active?'<span class="status-pill on">使用中</span>':'<span class="status-pill off">停止</span>'}</td>
      <td class="admin-actions-cell">
        <button class="mini-btn" type="button" onclick="editTarget(${id})">編集</button>
        <button class="mini-btn ${active?'danger':'success'}" type="button" onclick="toggleTarget(${id},${active?'false':'true'})">${active?'停止':'再開'}</button>
        <button class="mini-btn danger" type="button" onclick="deleteTarget(${id})">削除</button>
      </td>
    </tr>`;
  }).join("")||'<tr><td class="empty" colspan="7">採用目標がありません</td></tr>';
}
function editTarget(id){
  const t=targets.find(x=>Number(x.id)===Number(id));
  if(!t)return;
  $("targetId").value=t.id;$("targetFiscalYear").value=t.fiscal_year||"";$("targetDivision").value=t.division||"";$("targetCenter").value=t.center_name||"";$("targetCenterCode").value=t.center_code||"";$("targetShortCode").value=t.short_code||"";$("targetJobType").value=t.job_type||"";$("targetCount").value=t.target_count||0;
  window.scrollTo({top:0,behavior:"smooth"});
}
function clearTargetForm(){["targetId","targetFiscalYear","targetDivision","targetCenter","targetCenterCode","targetShortCode","targetJobType","targetCount"].forEach(id=>$(id).value="")}
async function saveTarget(){
  const row={
    fiscal_year:Number($("targetFiscalYear").value),division:$("targetDivision").value.trim(),center_name:$("targetCenter").value.trim(),center_code:$("targetCenterCode").value.trim()||null,short_code:$("targetShortCode").value.trim()||null,job_type:$("targetJobType").value.trim(),target_count:Number($("targetCount").value||0),updated_at:nowIso()
  };
  if(!row.fiscal_year||!row.division||!row.center_name||!row.job_type){adminError("年度・本部・営業所・職種を入力してください。");return}
  const id=$("targetId").value;
  const q=id?sb.from("recruitment_targets").update(row).eq("id",id):sb.from("recruitment_targets").insert({...row,created_at:nowIso()});
  const {error}=await q;
  if(error){log("採用目標保存に失敗: "+error.message,"error");showErrorPopup("採用目標保存に失敗しました",error,{処理:"採用目標保存",row});return}
  await writeAuditLog("target_save","recruitment_targets",id||`${row.fiscal_year}:${row.center_name}:${row.job_type}`,{mode:id?"update":"insert",row});
  clearTargetForm();
  log("採用目標を保存しました","success");
  await loadTargets();
}


async function toggleTarget(id,nextActive){
  const row=targets.find(x=>Number(x.id)===Number(id));
  if(!row){adminError("対象の採用目標を確認できません。");return}
  const label=nextActive?"再開":"停止";
  if(!await adminConfirm(`採用目標「${row.fiscal_year || "-"} / ${row.center_name || "-"} / ${row.job_type || "-"}」を${label}しますか？`,{title:`採用目標${label}確認`,okText:label+"する"}))return;
  try{
    const payload={is_active:!!nextActive,updated_at:nowIso()};
    if(!nextActive)payload.disabled_at=nowIso();
    const {error}=await sb.from("recruitment_targets").update(payload).eq("id",id);
    if(error)throw error;
    await writeAuditLog(nextActive?"target_enable":"target_disable","recruitment_targets",id,{row,nextActive});
    log(`採用目標を${label}しました`,"success");
    await loadTargets();
  }catch(e){
    log(`採用目標の${label}に失敗: `+(e.message||e),"error");
    showErrorPopup(`採用目標の${label}に失敗しました`,e,{処理:`採用目標${label}`,id,row});
  }
}

async function deleteTarget(id){
  const row=targets.find(x=>Number(x.id)===Number(id));
  if(!row){adminError("削除対象の採用目標を確認できません。");return}
  const confirmText=adminPrompt(`採用目標「${row.fiscal_year || "-"} / ${row.center_name || "-"} / ${row.job_type || "-"}」を完全削除します。\n削除する場合は「削除」と入力してください。`);
  if(confirmText!=="削除")return;
  try{
    const {error}=await sb.from("recruitment_targets").delete().eq("id",id);
    if(error)throw error;
    await writeAuditLog("target_delete","recruitment_targets",id,{deleted:row});
    clearTargetForm();
    log("採用目標を削除しました","success");
    await loadTargets();
  }catch(e){
    log("採用目標削除に失敗: "+(e.message||e),"error");
    showErrorPopup("採用目標削除に失敗しました",e,{処理:"採用目標削除",id,row});
  }
}


function auditActionLabel(type){
  const map={
    login:"ログイン",
    role_update:"権限変更",
    account_disable:"アカウント停止",
    account_enable:"アカウント再開",
    account_delete:"ユーザー削除",
    division_save:"本部保存",
    division_disable:"本部停止",
    division_enable:"本部再開",
    division_delete:"本部削除",
    center_save:"営業所保存",
    center_disable:"営業所停止",
    center_enable:"営業所再開",
    center_delete:"営業所削除",
    cost_save:"媒体費保存",
    cost_disable:"媒体費停止",
    cost_enable:"媒体費再開",
    cost_delete:"媒体費削除",
    option_master_save:"マスタ保存",
    option_master_disable:"マスタ停止",
    option_master_enable:"マスタ再開",
    option_master_delete:"マスタ削除",
    target_save:"採用目標保存",
    target_disable:"採用目標停止",
    target_enable:"採用目標再開",
    target_delete:"採用目標削除",
    backup_create:"バックアップ作成",
    backup_delete:"バックアップ削除",
    restore_execute:"復元実行",
    audit_retention_cleanup:"ログ整理",
    candidate_create:"応募者登録",
    candidate_update:"応募者更新",
    candidate_status_update:"ステータス変更",
    candidate_bulk_update:"応募者一括更新",
    candidate_delete:"応募者削除",
    candidate_bulk_delete:"応募者一括削除"
  };
  return map[type]||type||"-";
}
function auditTargetLabel(type){
  const map={
    auth:"認証",
    profiles:"権限マスタ",
    candidates:"応募者",
    master_divisions:"本部マスタ",
    master_centers:"営業所マスタ",
    master_job_types:"職種マスタ",
    master_owners:"担当者マスタ",
    master_channels:"媒体マスタ",
    master_channel_details:"媒体詳細マスタ",
    master_statuses:"ステータスマスタ",
    master_decline_reasons:"辞退理由マスタ",
    master_reject_reasons:"不採用理由マスタ",
    channel_costs:"媒体費マスタ",
    recruitment_targets:"採用目標マスタ",
    system_backups:"バックアップ",
    restore:"復元",
    audit_logs:"監査ログ"
  };
  return map[type]||type||"-";
}
function formatDateTime(value){
  if(!value)return "-";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
}
function compactValue(value){
  if(value===undefined||value===null||value==="")return "-";
  if(typeof value==="boolean")return value?"有効":"停止";
  if(typeof value==="number")return value.toLocaleString();
  if(Array.isArray(value))return value.join("、");
  if(typeof value==="object")return JSON.stringify(value);
  return String(value);
}
function roleLabel(role){
  const map={admin:"管理者",manager:"管理者補佐",editor:"編集者",viewer:"閲覧のみ"};
  return map[role]||role||"-";
}
function fieldLabel(key){
  const map={
    status:"ステータス",
    owner_name:"担当者",
    decline_reason:"辞退理由",
    reject_reason:"不採用理由",
    next_action_date:"次回対応日",
    appointment_date:"アポイント日",
    interview_date:"面接予定日",
    interview_done_date:"面接実施日",
    offer_date:"内定日",
    join_date:"入社日",
    channel:"媒体",
    channel_detail:"媒体詳細",
    division:"本部",
    center_name:"営業所",
    job_type:"職種",
    action_memo:"対応メモ",
    evaluation:"面接評価",
    evaluation_comment:"面接評価コメント"
  };
  return map[key]||key;
}
function formatChangeValue(value){
  if(value===undefined||value===null||value==="")return "未設定";
  if(typeof value==="boolean")return value?"有効":"停止";
  if(typeof value==="number")return value.toLocaleString();
  if(Array.isArray(value))return value.join("、");
  if(typeof value==="object")return JSON.stringify(value);
  return String(value);
}
function bulkSummary(detail){
  if(!detail||typeof detail!=="object")return "";
  const count=Number(detail.count||0);
  const names=Array.isArray(detail.names)?detail.names.filter(Boolean):[];
  const action=String(detail.action_type||detail.action||"");
  const after=detail.after&&typeof detail.after==="object"?detail.after:{};
  const changes=detail.changes&&typeof detail.changes==="object"?detail.changes:{};
  const changeEntries=Object.keys(after).length?Object.entries(after):Object.entries(changes).map(([k,v])=>[k,v?.after??v]);
  const changeText=changeEntries.map(([k,v])=>`${fieldLabel(k)}：${formatChangeValue(v)}`).join(" / ");
  if(action.includes("delete")||detail.deleted===true){
    return `応募者 ${count||names.length||"複数"}件を削除${names.length?`（${names.slice(0,3).join("、")}${names.length>3?" ほか":""}）`:""}`;
  }
  if(count||names.length||changeText){
    return `応募者 ${count||names.length||"複数"}件を更新${changeText?`：${changeText}`:""}`;
  }
  return "";
}
function pickDetailRows(detail){
  if(!detail||typeof detail!=="object")return [];
  const rows=[];
  const add=(label,value)=>{
    if(value!==undefined&&value!==null&&value!=="")rows.push([label,compactValue(value)]);
  };
  const names=Array.isArray(detail.names)?detail.names.filter(Boolean):[];
  const after=detail.after&&typeof detail.after==="object"?detail.after:{};
  const before=detail.before&&typeof detail.before==="object"?detail.before:{};
  const changes=detail.changes&&typeof detail.changes==="object"?detail.changes:{};

  if(detail.count!==undefined)add("件数",`${Number(detail.count||0).toLocaleString()}件`);
  if(names.length)add("対象者",`${names.slice(0,5).join("、")}${names.length>5?` ほか${names.length-5}件`:""}`);

  const afterEntries=Object.keys(after).length?Object.entries(after):[];
  afterEntries.forEach(([key,value])=>add(fieldLabel(key),formatChangeValue(value)));

  Object.entries(changes).forEach(([key,value])=>{
    if(value&&typeof value==="object"&&(value.before!==undefined||value.after!==undefined)){
      rows.push([fieldLabel(key),`${formatChangeValue(value.before)} → ${formatChangeValue(value.after)}`]);
    }else{
      add(fieldLabel(key),formatChangeValue(value));
    }
  });

  add("メール",detail.email);
  if(detail.before_role||detail.after_role)rows.push(["権限",`${roleLabel(detail.before_role)} → ${roleLabel(detail.after_role)}`]);
  if(detail.before_status||detail.after_status)rows.push(["ステータス",`${compactValue(detail.before_status)} → ${compactValue(detail.after_status)}`]);
  add("候補者",detail.candidate_name||detail.name);
  add("媒体",detail.channel);
  add("本部",detail.division||detail.division_name);
  add("営業所",detail.center||detail.center_name);
  add("職種",detail.job_type);
  add("金額",detail.amount!==undefined?`${Number(detail.amount||0).toLocaleString()}円`:undefined);
  add("月数",Array.isArray(detail.months)?`${detail.months.length}か月`:detail.months);
  add("理由",detail.reason);
  add("内容",detail.label||detail.kind);
  if(before.name||after.name)rows.push(["名称",`${compactValue(before.name)} → ${compactValue(after.name)}`]);
  if(before.is_active!==undefined||after.is_active!==undefined)rows.push(["状態",`${compactValue(before.is_active)} → ${compactValue(after.is_active)}`]);
  add("処理",detail.mode);
  add("バックアップ",detail.backup_id);
  add("削除件数",detail.deleted_count);
  return rows;
}
function detailText(detail){
  if(!detail)return "-";
  if(typeof detail==="string")return detail;
  try{
    const bulk=bulkSummary(detail);
    if(bulk)return bulk;
    const rows=pickDetailRows(detail);
    if(rows.length)return rows.slice(0,3).map(([label,value])=>`${label}：${value}`).join(" / ");
    return "詳細を開く";
  }catch(e){
    return String(detail);
  }
}
function detailReadableHtml(detail){
  if(!detail)return '<div class="audit-detail-empty">詳細なし</div>';
  if(typeof detail==="string")return `<div class="audit-detail-line">${esc(detail)}</div>`;
  const rows=pickDetailRows(detail);
  if(!rows.length)return '<div class="audit-detail-empty">詳細項目なし</div>';
  return `<dl class="audit-detail-list">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
}
function detailRawJson(detail){
  try{return JSON.stringify(detail||{},null,2)}catch(e){return String(detail||"")}
}

async function writeAuditLog(actionType,targetType,targetId,detail={}){
  try{
    const user=await getUser();
    const payload={
      user_id:user?.id||null,
      user_email:user?.email||null,
      action_type:String(actionType||"unknown"),
      target_type:String(targetType||"unknown"),
      target_id:targetId===undefined||targetId===null?null:String(targetId),
      detail_json:detail&&typeof detail==="object"?detail:{value:detail}
    };
    const {error}=await sb.from("audit_logs").insert(payload);
    if(error){
      log("監査ログ保存に失敗: "+error.message,"error");
      return false;
    }
    return true;
  }catch(e){
    log("監査ログ保存に失敗: "+(e.message||e),"error");
    return false;
  }
}
function auditBadgeClass(action){
  const text=String(action||"");
  if(text.includes("delete")||text.includes("disable"))return "audit-danger";
  if(text.includes("restore"))return "audit-warning";
  if(text.includes("backup"))return "audit-info";
  if(text.includes("role")||text.includes("enable"))return "audit-success";
  if(text.includes("candidate"))return "audit-primary";
  return "audit-muted";
}

async function loadAuditLogs(){
  const body=$("auditLogsBody");
  if(body)body.innerHTML='<tr><td class="empty" colspan="5">監査ログを読み込んでいます</td></tr>';
  setText("auditLogCount","-");
  try{
    const action=$("auditActionFilter")?.value||"";
    const target=$("auditTargetFilter")?.value||"";
    const keyword=String($("auditKeyword")?.value||"").trim().toLowerCase();
    let q=sb.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(100);
    if(action)q=q.eq("action_type",action);
    if(target)q=q.eq("target_type",target);
    const {data,error}=await q;
    if(error)throw error;
    let rows=data||[];
    if(keyword){
      rows=rows.filter(row=>{
        const hay=[row.user_email,row.action_type,row.target_type,row.target_id,JSON.stringify(row.detail_json||{})].join(" ").toLowerCase();
        return hay.includes(keyword);
      });
    }
    setText("auditLogCount",rows.length.toLocaleString());
    if(!body)return;
    if(!rows.length){
      body.innerHTML='<tr><td class="empty" colspan="5">監査ログがありません</td></tr>';
      log("監査ログは0件です");
      return;
    }
    body.innerHTML=rows.map(row=>{
      const action=String(row.action_type||"unknown");
      const target=String(row.target_type||"-");
      const badgeClass=auditBadgeClass(action);
      const rawJson=esc(detailRawJson(row.detail_json));
      return `<tr>
        <td class="audit-date-cell"><strong>${esc(formatDateTime(row.created_at))}</strong></td>
        <td class="audit-user-cell">${esc(row.user_email||"-")}<div class="admin-muted">${esc(row.user_id||"")}</div></td>
        <td><span class="audit-action-badge ${badgeClass}">${esc(auditActionLabel(action))}</span><div class="admin-muted">${esc(action)}</div></td>
        <td><span class="audit-target-badge">${esc(auditTargetLabel(target))}</span><div class="admin-muted">${esc(target)}</div></td>
        <td class="audit-detail-cell">
          <details>
            <summary>${esc(detailText(row.detail_json))}</summary>
            <div class="audit-detail-panel">
              ${detailReadableHtml(row.detail_json)}
              <div class="audit-id-row"><span>管理ID</span><code>${esc(row.target_id==="bulk"?"一括処理":(row.target_id||"-"))}</code></div>
              <details class="audit-json-detail"><summary>JSONを表示</summary><pre>${rawJson}</pre></details>
            </div>
          </details>
        </td>
      </tr>`;
    }).join("");
    log(`監査ログを${rows.length.toLocaleString()}件読み込みました`,"success");
  }catch(e){
    if(body)body.innerHTML=`<tr><td class="empty" colspan="5">監査ログの読込に失敗しました：${esc(e.message||e)}</td></tr>`;
    setText("auditLogCount","-");
    log("監査ログの読込に失敗: "+(e.message||e),"error");
  }
}

async function cleanupOldAuditLogs(){
  const cutoff=new Date(Date.now()-AUDIT_RETENTION_DAYS*24*60*60*1000).toISOString();
  if(!await adminConfirm(`${AUDIT_RETENTION_DAYS}日を超える監査ログを整理します。よろしいですか？`,{title:"監査ログ整理確認",okText:"整理する"}))return;
  try{
    const {data:oldRows,error:selectError}=await sb.from("audit_logs").select("id").lt("created_at",cutoff).limit(1000);
    if(selectError)throw selectError;
    const count=(oldRows||[]).length;
    if(count===0){log("整理対象の古い監査ログはありません","success");return}
    const ids=oldRows.map(row=>row.id);
    const {error}=await sb.from("audit_logs").delete().in("id",ids);
    if(error)throw error;
    await writeAuditLog("audit_retention_cleanup","audit_logs","retention",{days:AUDIT_RETENTION_DAYS,deleted_count:count,cutoff});
    log(`${AUDIT_RETENTION_DAYS}日超の監査ログを${count}件整理しました`,"success");
    await loadAuditLogs();
  }catch(e){
    log("監査ログ整理に失敗: "+(e.message||e),"error");
  }
}

document.addEventListener("DOMContentLoaded",authInit);
