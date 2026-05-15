// assets/js/audit_utils.js
(function(){

function getClient(){
  if(window.getRecruitSupabaseClient){
    return window.getRecruitSupabaseClient();
  }
  if(window.sb){
    return window.sb;
  }
  return null;
}

function normalizeDetail(detail){
  if(detail && typeof detail === "object") return detail;
  if(detail === undefined || detail === null) return {};
  return { value: detail };
}

async function getCurrentAuditUser(client){
  try{
    if(!client || !client.auth || !client.auth.getSession) return null;
    const { data } = await client.auth.getSession();
    return data?.session?.user || null;
  }catch(e){
    return null;
  }
}

async function write(actionType, targetType, targetId, detail = {}){
  try{
    const client = getClient();
    if(!client) return false;

    const user = await getCurrentAuditUser(client);
    const payload = {
      user_id: user?.id || null,
      user_email: user?.email || null,
      action_type: String(actionType || "unknown"),
      target_type: String(targetType || "unknown"),
      target_id: targetId === undefined || targetId === null ? null : String(targetId),
      detail_json: normalizeDetail(detail)
    };

    const { error } = await client.from("audit_logs").insert(payload);
    if(error){
      console.warn("audit_logs insert skipped", error);
      return false;
    }
    return true;
  }catch(e){
    console.warn("audit_logs insert skipped", e);
    return false;
  }
}

function diff(before, after, keys){
  const result = {};
  (keys || Object.keys(after || {})).forEach(key => {
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if(String(b ?? "") !== String(a ?? "")){
      result[key] = { before:b ?? null, after:a ?? null };
    }
  });
  return result;
}

async function candidateCreate(candidate, detail = {}){
  return write("candidate_create", "candidates", candidate?.id || detail?.candidate_id || null, {
    name: candidate?.name || detail?.name || null,
    status: candidate?.status || "応募",
    source: detail?.source || "manual",
    division: candidate?.division || detail?.division || null,
    center_name: candidate?.center_name || detail?.center_name || null,
    channel: candidate?.channel || detail?.channel || null,
    channel_detail: candidate?.channel_detail || detail?.channel_detail || null,
    job_type: candidate?.job_type || detail?.job_type || null
  });
}

async function candidateUpdate(candidateId, before, after, keys){
  return write("candidate_update", "candidates", candidateId, {
    name: after?.name || before?.name || null,
    diff: diff(before, after, keys)
  });
}

async function candidateDelete(candidateId, candidate){
  return write("candidate_delete", "candidates", candidateId, {
    name: candidate?.name || null,
    status: candidate?.status || null
  });
}

async function candidateImport(summary = {}){
  return write("candidate_import", "candidates", "csv_import", {
    inserted: Number(summary.inserted || 0),
    updated: Number(summary.updated || 0),
    skipped: Number(summary.skipped || 0),
    error_count: Number(summary.error_count || 0),
    total: Number(summary.total || 0),
    mode: summary.mode || null,
    file_name: summary.file_name || null
  });
}

window.RecruitAudit = {
  write,
  diff,
  candidateCreate,
  candidateUpdate,
  candidateDelete,
  candidateImport
};

// backward compatible globals
window.writeRecruitAuditLog = write;
window.diffRecruitObjects = diff;

})();
