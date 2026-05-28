// assets/js/supabase.js
(function(){
  "use strict";

  const SUPABASE_URL = "https://shiztjmmaozrsstjotub.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1JKLDIZR9SFsi3Y2sMAgwA_Kd_tA4sS";
  const AUTH_RETRY_DELAYS = [120, 360, 720];

  let _client = null;
  let _explicitSignOutUntil = 0;
  let _directLogoutInProgress = false;

  function wait(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isExplicitSignOut(){
    return Date.now() < _explicitSignOutUntil;
  }

  function normalizeSessionResult(result){
    return result && result.data && result.data.session ? result.data.session : null;
  }


  async function fetchRecruitProfile(client){
    try{
      const { data:{ session } = {} } = await client.auth.getSession();
      const user = session && session.user ? session.user : null;
      if(!user){
        window.currentRole = null;
        window.currentProfile = null;
        window.__recruitRoleResolved = true;
        return null;
      }

      let profile = null;
      let error = null;

      const byUserId = await client
        .from("profiles")
        .select("user_id,email,role,is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      profile = byUserId.data || null;
      error = byUserId.error || null;

      if((!profile || error) && user.email){
        const byEmail = await client
          .from("profiles")
          .select("user_id,email,role,is_active")
          .eq("email", user.email)
          .maybeSingle();
        if(byEmail.data){
          profile = byEmail.data;
          error = null;
        }else if(byEmail.error && !error){
          error = byEmail.error;
        }
      }

      if(error){
        console.warn("Recruit profile fetch failed", error);
      }

      const role = profile && profile.is_active !== false && profile.role ? String(profile.role).toLowerCase() : "viewer";
      window.currentProfile = profile || { user_id:user.id, email:user.email || null, role, is_active:true };
      window.currentRole = role;
      window.__recruitRoleResolved = true;

      try{
        sessionStorage.setItem("recruit_user_role_cache", role);
      }catch(e){}

      window.dispatchEvent(new CustomEvent("recruit:role-ready", { detail:{ role, profile:window.currentProfile } }));
      return window.currentProfile;
    }catch(e){
      console.warn("Recruit profile fetch unexpected error", e);
      window.currentRole = "viewer";
      window.currentProfile = null;
      window.__recruitRoleResolved = true;
      window.dispatchEvent(new CustomEvent("recruit:role-ready", { detail:{ role:"viewer", profile:null } }));
      return null;
    }
  }

  function roleCan(role, action){
    const r = String(role || window.currentRole || "viewer").toLowerCase();
    if(action === "admin") return r === "admin";
    if(action === "edit") return r === "admin" || r === "editor";
    if(action === "export") return r === "admin";
    if(action === "delete") return r === "admin";
    return ["admin","editor","viewer"].includes(r);
  }

  function enhanceRecruitAuthClient(client){
    if(!client || !client.auth || client.__recruitAuthEnhanced){
      return client;
    }

    const originalGetSession = client.auth.getSession.bind(client.auth);
    const originalOnAuthStateChange = client.auth.onAuthStateChange.bind(client.auth);
    const originalSignOut = client.auth.signOut.bind(client.auth);

    client.auth.getSession = async function(){
      let result = await originalGetSession();
      if(normalizeSessionResult(result) || isExplicitSignOut()){
        return result;
      }

      // Supabase の復元・自動更新中に一瞬 session=null になることがあるため、
      // すぐログイン画面へ戻さず短時間だけ再確認する。
      for(const delay of AUTH_RETRY_DELAYS){
        await wait(delay);
        const retry = await originalGetSession();
        if(normalizeSessionResult(retry) || isExplicitSignOut()){
          return retry;
        }
        result = retry;
      }
      return result;
    };

    client.auth.onAuthStateChange = function(callback){
      return originalOnAuthStateChange(async function(event, session){
        if(event !== "SIGNED_OUT"){
          callback(event, session);
          return;
        }

        if(isExplicitSignOut()){
          if(_directLogoutInProgress){
            return;
          }
          callback(event, session);
          return;
        }

        // token refresh / session restore の途中で SIGNED_OUT が先に来ても、
        // 少し待って session が戻る場合は画面をログインへ切り替えない。
        await wait(700);
        try{
          const current = await originalGetSession();
          const recoveredSession = normalizeSessionResult(current);
          if(recoveredSession){
            return;
          }
        }catch(e){
          console.warn("Recruit auth recheck failed", e);
        }
        callback(event, session);
      });
    };

    client.auth.signOut = async function(){
      _explicitSignOutUntil = Date.now() + 5000;
      return originalSignOut.apply(client.auth, arguments);
    };

    window.RecruitAuth = window.RecruitAuth || {};
    window.RecruitAuth.getSession = function(){
      return client.auth.getSession();
    };
    window.RecruitAuth.getUser = async function(){
      const { data:{ session } = {} } = await client.auth.getSession();
      return session && session.user ? session.user : null;
    };
    window.RecruitAuth.getCurrentProfile = function(){
      return fetchRecruitProfile(client);
    };
    window.RecruitAuth.refreshRole = function(){
      return fetchRecruitProfile(client);
    };
    window.RecruitAuth.getCurrentRole = async function(){
      const profile = await fetchRecruitProfile(client);
      return profile && profile.role ? String(profile.role).toLowerCase() : (window.currentRole || "viewer");
    };
    window.RecruitAuth.markExplicitSignOut = function(){
      _explicitSignOutUntil = Date.now() + 5000;
    };
    window.RecruitAuth.isDirectLogout = function(){
      return _directLogoutInProgress;
    };
    window.RecruitAuth.logoutToIndex = async function(){
      _directLogoutInProgress = true;
      _explicitSignOutUntil = Date.now() + 8000;
      try{
        await client.auth.signOut();
      }catch(e){
        console.error("logout failed", e);
      }finally{
        window.location.replace("./index.html");
      }
    };

    client.__recruitAuthEnhanced = true;
    return client;
  }

  window.getRecruitSupabaseClient = function(){
    if(_client){
      return enhanceRecruitAuthClient(_client);
    }

    if(window.sb && window.sb.auth){
      _client = enhanceRecruitAuthClient(window.sb);
      window.supabaseClient = window.supabaseClient || _client;
      return _client;
    }

    if(!window.supabase || typeof window.supabase.createClient !== "function"){
      return null;
    }

    _client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true
        }
      }
    );

    _client = enhanceRecruitAuthClient(_client);
    window.sb = _client;
    window.supabaseClient = window.supabaseClient || _client;

    return _client;
  };

  if(!window.RecruitMasterCache){
    window.RecruitMasterCache = {};
  }

  window.clearRecruitMasterCache = function(){
    window.RecruitMasterCache = {};
    window.dispatchEvent(new CustomEvent("recruit:master-updated"));
  };

})();
