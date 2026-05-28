// assets/js/auth.js
// 共通認証UIヘルパー。画面固有の initPageAfterLogin 等は各ページに残す。
(function(){
  "use strict";

  function qs(id){ return document.getElementById(id); }
  function defaultSetMsg(id, msg, type){
    const el = qs(id || "authMessage");
    if(!el) return;
    if(typeof window.setMsg === "function"){
      window.setMsg(id || "authMessage", msg, type || "info");
      return;
    }
    el.textContent = msg || "";
    if(el.className && String(el.className).includes("message-")){
      el.className = "message-box message-" + (type || "info") + (msg ? "" : " hidden");
    }
  }

  function clientOf(opt){
    return (opt && opt.client) || window.sb || window.supabaseClient || (window.getRecruitSupabaseClient ? window.getRecruitSupabaseClient() : null);
  }

  async function getUser(opt={}){
    if(opt.currentUser) return opt.currentUser;
    const client = clientOf(opt);
    if(!client || !client.auth) return null;
    const { data:{ session } = {} } = await client.auth.getSession();
    return session && session.user ? session.user : null;
  }

  async function getRole(opt={}){
    if(opt.currentRole) return opt.currentRole;
    const client = clientOf(opt);
    if(window.RecruitAuth && typeof window.RecruitAuth.getCurrentRole === "function"){
      return await window.RecruitAuth.getCurrentRole();
    }
    const user = opt.user || (await getUser(opt));
    if(!client || !user) return "viewer";
    try{
      let res = await client.from("profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
      if((!res.data || res.error) && user.email){
        const byEmail = await client.from("profiles").select("role,is_active").eq("email", user.email).maybeSingle();
        if(byEmail.data) res = byEmail;
      }
      const row = res.data;
      const role = row && row.is_active !== false && row.role ? String(row.role).toLowerCase() : "viewer";
      window.currentUser = user;
      window.currentRole = role;
      window.currentProfile = row || window.currentProfile || null;
      window.__recruitRoleResolved = true;
      try{
        window.dispatchEvent(new CustomEvent("recruit:role-ready", { detail:{ role, profile:window.currentProfile, user } }));
      }catch(_e){}
      return role;
    }catch(e){
      console.warn("role fetch failed", e);
      window.currentRole = "viewer";
      window.__recruitRoleResolved = true;
      try{ window.dispatchEvent(new CustomEvent("recruit:role-ready", { detail:{ role:"viewer", profile:null } })); }catch(_e){}
      return "viewer";
    }
  }

  function showAuth(opt={}){
    qs(opt.authScreenId || "authScreen")?.classList.remove("hidden");
    qs(opt.appScreenId || "appScreen")?.classList.add("hidden");
    const setMsg = opt.setMsg || ((id,msg,type)=>defaultSetMsg(id,msg,type));
    setMsg(opt.authMessageId || "authMessage", opt.msg || "未ログインです", opt.type || "info");
    document.body.classList.remove("auth-checking");
  }

  function showApp(opt={}){
    qs(opt.authScreenId || "authScreen")?.classList.add("hidden");
    qs(opt.appScreenId || "appScreen")?.classList.remove("hidden");
    document.body.classList.remove("auth-checking");
  }

  async function login(opt={}){
    const client = clientOf(opt);
    const emailEl = qs(opt.emailId || "loginEmail");
    const pwEl = qs(opt.passwordId || "loginPassword");
    const email = (opt.email != null ? opt.email : emailEl?.value || "").trim();
    const password = opt.password != null ? opt.password : (pwEl?.value || "");
    const setMsg = opt.setMsg || ((id,msg,type)=>defaultSetMsg(id,msg,type));
    if(!email || !password){
      setMsg(opt.authMessageId || "authMessage", "メールアドレスとパスワードを入力してください", "error");
      return false;
    }
    try{
      const { error } = await client.auth.signInWithPassword({ email, password });
      if(error) throw error;
      if(typeof opt.afterLogin === "function") await opt.afterLogin();
      return true;
    }catch(e){
      setMsg(opt.authMessageId || "authMessage", "ログイン失敗: " + (e.message || e), "error");
      return false;
    }
  }

  async function logoutToIndex(client){
    if(window.RecruitAuth && typeof window.RecruitAuth.logoutToIndex === "function"){
      await window.RecruitAuth.logoutToIndex();
      return;
    }
    const c = clientOf({client});
    try{ await c?.auth?.signOut(); }catch(e){ console.error("logout failed", e); }
    window.location.replace("./index.html");
  }

  async function authInit(opt={}){
    try{
      const user = await getUser(opt);
      if(!user){
        if(typeof opt.onAuth === "function") opt.onAuth("未ログインです", "info");
        else showAuth(opt);
        return false;
      }
      const role = await getRole(Object.assign({}, opt, { user }));
      window.currentUser = user;
      window.currentRole = role;
      window.__recruitRoleResolved = true;
      try{ window.dispatchEvent(new CustomEvent("recruit:role-ready", { detail:{ role, profile:window.currentProfile || null, user } })); }catch(_e){}
      if(typeof opt.onRole === "function") opt.onRole(role, user);
      showApp(opt);
      if(typeof opt.afterAuth === "function") await opt.afterAuth(user, role);
      return true;
    }catch(e){
      console.error(e);
      if(typeof opt.onAuth === "function") opt.onAuth("初期化に失敗しました", "error");
      else showAuth(Object.assign({}, opt, { msg:"初期化に失敗しました", type:"error" }));
      return false;
    }finally{
      document.body.classList.remove("auth-checking");
    }
  }

  function normalizeRole(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.normalize === "function") return window.RecruitOpsGuard.normalize(role);
    if(window.RecruitRole && typeof window.RecruitRole.normalize === "function") return window.RecruitRole.normalize(role);
    const value = String(role || window.currentRole || "viewer").toLowerCase();
    return ["admin", "editor", "viewer"].includes(value) ? value : "viewer";
  }
  function hasRole(role, allowed){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.hasRole === "function") return window.RecruitOpsGuard.hasRole(role, allowed);
    const r = normalizeRole(role);
    const list = Array.isArray(allowed) ? allowed : String(allowed || "").split(",");
    return list.map(v => String(v || "").trim().toLowerCase()).includes(r);
  }
  function canEdit(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.canEdit === "function") return window.RecruitOpsGuard.canEdit(role);
    return hasRole(role, ["admin", "editor"]);
  }
  function canAdmin(role){
    if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.isAdmin === "function") return window.RecruitOpsGuard.isAdmin(role);
    return hasRole(role, ["admin"]);
  }

  window.RecruitPageAuth = Object.assign(window.RecruitPageAuth || {}, {
    getUser, getRole, showAuth, showApp, login, logoutToIndex, authInit,
    normalizeRole, hasRole, canEdit, canAdmin
  });
  window.hasRecruitRole = hasRole;
  window.canRecruitEdit = canEdit;
  window.canRecruitAdmin = canAdmin;
})();
