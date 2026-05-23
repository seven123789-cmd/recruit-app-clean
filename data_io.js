/* data_io.js : standard CSV import/export page */
(function(){
  "use strict";

  const sb=window.getRecruitSupabaseClient();
  window.supabaseClient=window.supabaseClient||sb;

  const CSV_COLUMNS=[
    {label:"candidate_id",key:"id",system:true},
    {label:"応募日",key:"applied_date",required:true,type:"date"},
    {label:"氏名",key:"name",required:true},
    {label:"年齢",key:"age",type:"number"},
    {label:"本部",key:"division",master:"divisions"},
    {label:"営業所",key:"center_name",master:"centers"},
    {label:"媒体",key:"channel",master:"channels"},
    {label:"媒体詳細",key:"channel_detail",master:"channelDetails"},
    {label:"職種",key:"job_type",master:"jobTypes"},
    {label:"担当者",key:"owner_name",master:"owners"},
    {label:"ステータス",key:"status",required:true,master:"statuses"},
    {label:"選考結果",key:"hiring_result"},
    {label:"アポ日",key:"appointment_date",type:"date"},
    {label:"面接予定日",key:"interview1_date",type:"date"},
    {label:"面接実施日",key:"interview_done_date",type:"date"},
    {label:"内定日",key:"offer_date",type:"date"},
    {label:"入社日",key:"join_date",type:"date"},
    {label:"最終対応日",key:"last_action_date",type:"date"},
    {label:"次回対応日",key:"next_action_date",type:"date"},
    {label:"辞退理由",key:"decline_reason",master:"declineReasons"},
    {label:"不採用理由",key:"reject_reason",master:"rejectReasons"},
    {label:"評価",key:"evaluation"},
    {label:"評価コメント",key:"evaluation_comment"},
    {label:"対応メモ",key:"action_memo"},
    {label:"削除フラグ",key:"is_deleted",type:"boolean"}
  ];

  const STAGE_STATUS_OPTIONS = window.RECRUIT_STAGE_STATUSES || ["応募","書類選考","アポ取得","面接設定","面接実施","内定","採用"];
  const HIRING_RESULT_OPTIONS = window.RECRUIT_HIRING_RESULTS || ["進行中","保留","辞退","不採用","不通","採用","入社済"];
  const LEGACY_STATUS_TO_RESULT = {"未設定":"進行中","未判定":"進行中","合格":"採用","入社":"入社済","保留":"保留","辞退":"辞退","不採用":"不採用","不通":"不通"};

  const $=id=>document.getElementById(id);
  let currentUser=null;
  let currentRole="viewer";
  let masterSets=null;
  let previewRows=[];
  let previewErrors=[];

  function setMsg(text,type="info"){
    const el=$("pageMessage");
    if(!el)return;
    el.textContent=text;
    el.className="message-box message-"+(type==="error"?"error":type==="success"?"success":"info");
  }

  function showAuth(message,type="info"){
    document.body.classList.remove("auth-checking");
    $("authScreen")?.classList.remove("hidden");
    $("appScreen")?.classList.add("hidden");
    const el=$("authMessage");
    if(el){el.textContent=message;el.className="message-box message-"+(type==="error"?"error":"info");}
  }

  function showApp(){
    document.body.classList.remove("auth-checking");
    $("authScreen")?.classList.add("hidden");
    $("appScreen")?.classList.remove("hidden");
  }

  window.login=async function(){
    const email=$("loginEmail")?.value.trim();
    const password=$("loginPassword")?.value;
    if(!email||!password){showAuth("メールアドレスとパスワードを入力してください。","error");return;}
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){showAuth("ログイン失敗: "+error.message,"error");return;}
    await init();
  };

  window.logout=async function(){
    await sb.auth.signOut();
    location.href="./index.html";
  };

  async function getRole(user){
    const {data}=await sb.from("profiles").select("role,is_active,email").eq("user_id",user.id).maybeSingle();
    if(data?.role) window.currentRole = String(data.role).toLowerCase();
    if(data?.is_active===false)throw new Error("このアカウントは停止されています。");
    return data?.role||"viewer";
  }

  async function loadMasters(){
    if(window.RecruitMaster && typeof window.RecruitMaster.load === "function"){
      const masters = await window.RecruitMaster.load(true);
      masterSets = {
        divisions: new Set(masters?.divisions || []),
        centers: new Set((masters?.centers || []).map(r => r.center_name)),
        channels: new Set(masters?.channels || []),
        channelDetails: new Set(masters?.channelDetails || []),
        jobTypes: new Set(masters?.jobTypes || []),
        owners: new Set(masters?.owners || []),
        statuses: new Set(masters?.statuses || []),
        declineReasons: new Set(masters?.declineReasons || []),
        rejectReasons: new Set(masters?.rejectReasons || [])
      };
      return;
    }
    masterSets={divisions:new Set(),centers:new Set(),channels:new Set(),channelDetails:new Set(),jobTypes:new Set(),owners:new Set(),statuses:new Set(),declineReasons:new Set(),rejectReasons:new Set()};
  }

  function csvEscape(value){
    const text=value===null||value===undefined?"":String(value);
    if(/[",\n\r]/.test(text))return '"'+text.replace(/"/g,'""')+'"';
    return text;
  }

  function downloadText(filename,text,type="text/csv;charset=utf-8"){
    const blob=new Blob(["\ufeff"+text],{type});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  function fileTimestamp(){
    const d=new Date();
    const p=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function buildCsv(rows){
    const headers=CSV_COLUMNS.map(c=>c.label);
    const lines=[headers.map(csvEscape).join(",")];
    (rows||[]).forEach(raw=>{
      const row=normalizeStatusAndResult({...raw});
      lines.push(CSV_COLUMNS.map(col=>csvEscape(formatExportValue(row[col.key],col))).join(","));
    });
    return lines.join("\n");
  }

  function formatExportValue(value,col){
    if(col.type==="boolean")return value===true||value==="true"?"TRUE":"FALSE";
    return value??"";
  }

  function templateCsv(){
    return CSV_COLUMNS.map(c=>csvEscape(c.label)).join(",")+"\n";
  }

  function parseCsv(text){
    const rows=[];let row=[];let cell="";let q=false;
    const src=String(text||"").replace(/^\ufeff/,"");
    for(let i=0;i<src.length;i++){
      const ch=src[i];
      if(q){
        if(ch==='"'&&src[i+1]==='"'){cell+='"';i++;}
        else if(ch==='"')q=false;
        else cell+=ch;
      }else{
        if(ch==='"')q=true;
        else if(ch===","){row.push(cell);cell="";}
        else if(ch==="\n"){row.push(cell);rows.push(row);row=[];cell="";}
        else if(ch!=="\r")cell+=ch;
      }
    }
    row.push(cell);rows.push(row);
    return rows.filter(r=>r.some(v=>String(v||"").trim()!==""));
  }

  function toIsoDate(v){
    if(v===null || v===undefined) return '';
    let s=String(v).trim().replace(/^\uFEFF/, '').replace(/^['\"]|['\"]$/g, '');
    if(!s) return '';
    s=s.replace(/[年月]/g,'-').replace(/日/g,'').replace(/[./]/g,'-');
    s=s.split(/[T\s]/)[0];
    if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){
      const [y,m,d]=s.split('-');
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if(/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
  }
  function normalizePersonName(v){
    const fn=window.normalizePersonName;
    if(typeof fn==='function' && fn!==normalizePersonName) return fn(v);
    return String(v??"").replace(/[\u3000\s]+/g," ").trim();
  }
  function normalizeHeader(h){return String(h||"").trim();}
  function validDate(v){return !v||/^\d{4}-\d{2}-\d{2}$/.test(String(v));}
  function inferStageStatus(row){
    if(row.join_date) return '採用';
    if(row.offer_date) return '内定';
    if(row.interview_done_date) return '面接実施';
    if(row.interview1_date) return '面接設定';
    if(row.appointment_date) return 'アポ取得';
    return '応募';
  }
  function normalizeStatusAndResult(row){
    const r=row||{};
    let status=String(r.status||'').trim();
    let result=String(r.hiring_result||'').trim();
    if(result==='未判定'||result==='未設定') result='進行中';
    if(status==='未判定'||status==='未設定'||status==='') status='';
    if(LEGACY_STATUS_TO_RESULT[status] && !STAGE_STATUS_OPTIONS.includes(status)){
      result=LEGACY_STATUS_TO_RESULT[status];
      status=inferStageStatus(r);
    }
    if(status==='合格'){ status='採用'; result=result||'採用'; }
    if(status==='入社'){ status='採用'; result='入社済'; }
    if(r.join_date){ status='採用'; result='入社済'; }
    if(status==='採用' && (!result || result==='進行中')) result='採用';
    if(!status) status=inferStageStatus(r);
    if(!result) result='進行中';
    r.status=status; r.hiring_result=result;
    return r;
  }
  function parseBoolean(v){
    const s=String(v||"").trim().toLowerCase();
    return ["true","1","yes","y","削除","削除済み"].includes(s);
  }

  function validateRow(row,index){
    const errors=[];
    CSV_COLUMNS.forEach(col=>{
      const value=row[col.key];
      if(col.required&&!String(value||"").trim())errors.push(`${index}行目：${col.label}が未入力です`);
      if(col.type==="date"&&!validDate(value))errors.push(`${index}行目：${col.label}の日付形式が不正です（YYYY-MM-DD）`);
      if(col.type==="number"&&value!==""&&value!==null&&value!==undefined&&Number.isNaN(Number(value)))errors.push(`${index}行目：${col.label}は数値で入力してください`);
      if(col.key==="status"&&value&&!STAGE_STATUS_OPTIONS.includes(String(value).trim()))errors.push(`${index}行目：ステータスが不正です（${value}）`);
      else if(col.master&&value&&masterSets&&masterSets[col.master]&&!masterSets[col.master].has(String(value).trim()))errors.push(`${index}行目：${col.label}「${value}」は有効なマスタにありません`);
      if(col.key==="hiring_result"&&value&&!HIRING_RESULT_OPTIONS.includes(String(value).trim()))errors.push(`${index}行目：選考結果が不正です（${value}）`);
    });
    return errors;
  }

  async function normalizeImportRow(raw){
    const row={};
    CSV_COLUMNS.forEach(col=>{
      let value=raw[col.label]??"";
      if(typeof value==="string")value=value.trim();
      if(col.key==="name")value=normalizePersonName(value);
      if(col.type==="date")value=toIsoDate(value);
      if(col.type==="number")value=value===""?null:Number(value);
      if(col.type==="boolean")value=parseBoolean(value);
      if(value==="")value=null;
      row[col.key]=value;
    });
    normalizeStatusAndResult(row);
    if(window.RecruitMaster && typeof window.RecruitMaster.normalizeCandidate === "function"){
      return await window.RecruitMaster.normalizeCandidate(row);
    }
    return row;
  }

  async function previewCsv(file){
    await loadMasters();
    const text=await file.text();
    const parsed=parseCsv(text);
    if(parsed.length<2){throw new Error("CSVにデータ行がありません。");}
    const headers=parsed[0].map(normalizeHeader);
    const requiredHeaders=CSV_COLUMNS.map(c=>c.label);
    const missing=requiredHeaders.filter(h=>!headers.includes(h));
    if(missing.length)throw new Error("必須列が不足しています: "+missing.join(" / "));

    previewRows=[];previewErrors=[];
    for(const [i, cols] of parsed.slice(1).entries()){
      const raw={};
      headers.forEach((h,idx)=>raw[h]=cols[idx]??"");
      const row=await normalizeImportRow(raw);
      const errors=validateRow(row,i+2);
      previewRows.push({row,errors,line:i+2});
      previewErrors.push(...errors);
    }
    renderPreview();
  }

  function escapeHtml(v){return String(v??"").replace(/[&<>"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));}

  function renderPreview(){
    const tbody=$("previewBody");
    const summary=$("previewSummary");
    const errorBox=$("importErrors");
    const execute=$("executeImportButton");
    const total=previewRows.length;
    const errorRows=previewRows.filter(r=>r.errors.length).length;
    summary.textContent=`${total}件を確認しました。エラー ${errorRows}件。`;
    execute.disabled=!(total>0&&errorRows===0&&currentRole!=="viewer");
    if(previewErrors.length){
      errorBox.classList.remove("hidden");
      errorBox.innerHTML=previewErrors.slice(0,30).map(escapeHtml).join("<br>")+(previewErrors.length>30?`<br>ほか${previewErrors.length-30}件`:"");
    }else{
      errorBox.classList.add("hidden");
      errorBox.innerHTML="";
    }
    if(!total){
      tbody.innerHTML='<tr><td colspan="8" class="empty">プレビューはまだありません。</td></tr>';
      return;
    }
    tbody.innerHTML=previewRows.slice(0,80).map(item=>`
      <tr>
        <td class="${item.errors.length?"preview-error":"preview-ok"}">${item.errors.length?"エラー":"OK"}</td>
        <td>${escapeHtml(item.row.name)}</td>
        <td>${escapeHtml(item.row.applied_date)}</td>
        <td>${escapeHtml(item.row.division)}</td>
        <td>${escapeHtml(item.row.center_name)}</td>
        <td>${escapeHtml(item.row.channel)}</td>
        <td>${escapeHtml(item.row.job_type)}</td>
        <td>${escapeHtml(item.row.status)}</td>
      </tr>`).join("")+(total>80?`<tr><td colspan="8" class="empty">ほか${total-80}件</td></tr>`:"");
  }

  async function executeImport(){
    if(currentRole==="viewer"){setMsg("viewerはインポートできません。","error");return;}
    if(!previewRows.length||previewRows.some(r=>r.errors.length)){setMsg("エラーがあるためインポートできません。","error");return;}
    if(!window.confirm(`${previewRows.length}件をインポートします。よろしいですか？`))return;
    setMsg("インポート中です...","info");
    let inserted=0,updated=0;
    for(const item of previewRows){
      const payload={...item.row};
      const id=payload.id;
      delete payload.id;
      if(id){
        const {error}=await sb.from("candidates").update(payload).eq("id",id);
        if(error)throw error;
        updated++;
      }else{
        const {error}=await sb.from("candidates").insert(payload);
        if(error)throw error;
        inserted++;
      }
    }
    await writeAuditLog("candidate_import","candidates","csv_import",{inserted,updated,total:previewRows.length});
    setMsg(`インポート完了：追加 ${inserted}件 / 更新 ${updated}件`,"success");
    clearPreview();
  }

  async function writeAuditLog(action,targetType,targetId,detail){
    if(window.RecruitAudit && window.RecruitAudit.write){
      return window.RecruitAudit.write(action,targetType,targetId,detail);
    }
    try{
      await sb.from("audit_logs").insert({
        user_id:currentUser?.id||null,
        user_email:currentUser?.email||null,
        action_type:action,
        target_type:targetType,
        target_id:String(targetId||""),
        detail_json:detail||{}
      });
      return true;
    }catch(e){
      console.warn("audit log skipped",e);
      return false;
    }
  }

  function clearPreview(){
    previewRows=[];previewErrors=[];
    $("csvFile").value="";
    $("selectedFileName").textContent="ファイル未選択";
    $("previewSummary").textContent="CSVを選択してプレビューしてください。";
    $("importErrors").classList.add("hidden");
    $("importErrors").innerHTML="";
    $("executeImportButton").disabled=true;
    $("previewBody").innerHTML='<tr><td colspan="8" class="empty">プレビューはまだありません。</td></tr>';
  }

  function fiscalYearFromDate(dateText){
    if(!dateText)return "";
    const d=new Date(String(dateText)+"T00:00:00+09:00");
    if(Number.isNaN(d.getTime()))return "";
    const y=d.getFullYear();
    return d.getMonth()+1>=4?y:y-1;
  }

  async function fetchCandidateRows(){
    let q=sb.from("candidates").select("*").order("applied_date",{ascending:false});
    const deleted=$("exportDeleted")?.value||"active";
    if(deleted==="active")q=q.eq("is_deleted",false);
    if(deleted==="deleted")q=q.eq("is_deleted",true);
    const {data,error}=await q;
    if(error)throw error;
    const year=$("exportYear")?.value||"";
    return (data||[]).filter(r=>!year||String(fiscalYearFromDate(r.applied_date))===String(year));
  }

  async function refreshExportCount(){
    const rows=await fetchCandidateRows();
    $("exportCount").textContent=rows.length;
    return rows;
  }

  async function exportCsv(){
    const rows=await refreshExportCount();
    downloadText(`recruit_candidates_standard_${fileTimestamp()}.csv`,buildCsv(rows));
    await writeAuditLog("candidate_export","candidates","standard_csv",{count:rows.length});
    setMsg(`CSVを出力しました：${rows.length}件`,"success");
  }

  async function setupExportYears(){
    const {data}=await sb.from("candidates").select("applied_date");
    const years=[...new Set((data||[]).map(r=>fiscalYearFromDate(r.applied_date)).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
    const select=$("exportYear");
    select.innerHTML='<option value="">全期間</option>'+years.map(y=>`<option value="${escapeHtml(y)}">${escapeHtml(y)}年度</option>`).join("");
  }

  function bindEvents(){
    $("downloadTemplateButton")?.addEventListener("click",()=>downloadText("recruit_standard_template.csv",templateCsv()));
    $("chooseCsvButton")?.addEventListener("click",()=>$("csvFile")?.click());
    $("csvFile")?.addEventListener("change",()=>{
      const file=$("csvFile").files?.[0];
      $("selectedFileName").textContent=file?file.name:"ファイル未選択";
    });
    $("previewCsvButton")?.addEventListener("click",async()=>{
      const file=$("csvFile").files?.[0];
      if(!file){setMsg("CSVファイルを選択してください。","error");return;}
      try{setMsg("CSVを確認しています...","info");await previewCsv(file);setMsg("CSVプレビューを作成しました。","success");}
      catch(e){setMsg("CSV確認に失敗しました: "+(e.message||e),"error");}
    });
    $("executeImportButton")?.addEventListener("click",async()=>{try{await executeImport();}catch(e){setMsg("インポートに失敗しました: "+(e.message||e),"error");}});
    $("clearPreviewButton")?.addEventListener("click",clearPreview);
    $("exportCsvButton")?.addEventListener("click",async()=>{try{await exportCsv();}catch(e){setMsg("CSV出力に失敗しました: "+(e.message||e),"error");}});
    $("refreshExportCountButton")?.addEventListener("click",async()=>{try{await refreshExportCount();setMsg("対象件数を確認しました。","success");}catch(e){setMsg("件数確認に失敗しました: "+(e.message||e),"error");}});
    ["exportYear","exportDeleted"].forEach(id=>$(id)?.addEventListener("change",()=>refreshExportCount().catch(()=>{})));

    const zone=$("csvDropZone");
    zone?.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("dragover");});
    zone?.addEventListener("dragleave",()=>zone.classList.remove("dragover"));
    zone?.addEventListener("drop",e=>{
      e.preventDefault();zone.classList.remove("dragover");
      const file=e.dataTransfer.files?.[0];
      if(file){$("csvFile").files=e.dataTransfer.files;$("selectedFileName").textContent=file.name;}
    });
  }

  async function init(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.user){showAuth("未ログインです","info");return;}
    currentUser=session.user;
    try{currentRole=await getRole(currentUser);}catch(e){showAuth(e.message||"利用できないアカウントです。","error");return;}
    $("currentUserEmail").textContent=currentUser.email||"-";
    $("currentUserRole").textContent=currentRole;
    if(currentRole==="viewer")$("executeImportButton").disabled=true;
    showApp();
    await setupExportYears();
    await refreshExportCount();
    bindEvents();
    setMsg("標準CSVの準備ができました。","success");
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
