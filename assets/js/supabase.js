// assets/js/supabase.js
(function(){
  "use strict";

  const SUPABASE_URL = "https://shiztjmmaozrsstjotub.supabase.co";
  const SUPABASE_KEY = "sb_publishable_1JKLDIZR9SFsi3Y2sMAgwA_Kd_tA4sS";
  const AUTH_RETRY_DELAYS = [120, 360, 720];

  let _client = null;
  let _explicitSignOutUntil = 0;

  function wait(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isExplicitSignOut(){
    return Date.now() < _explicitSignOutUntil;
  }

  function normalizeSessionResult(result){
    return result && result.data && result.data.session ? result.data.session : null;
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
      try{
        return await originalSignOut.apply(client.auth, arguments);
      }finally{
        try{ localStorage.removeItem("recruit_user_role"); }catch(e){}
        try{ sessionStorage.removeItem("recruit_user_role"); }catch(e){}
        const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
        if(file !== "index.html"){
          setTimeout(function(){ location.replace("./index.html"); }, 0);
        }
      }
    };

    window.RecruitAuth = window.RecruitAuth || {};
    window.RecruitAuth.getSession = function(){
      return client.auth.getSession();
    };
    window.RecruitAuth.getUser = async function(){
      const { data:{ session } = {} } = await client.auth.getSession();
      return session && session.user ? session.user : null;
    };
    window.RecruitAuth.fetchCurrentRole = async function(force){
      const user = await window.RecruitAuth.getUser();
      if(!user){
        try{ localStorage.removeItem("recruit_user_role"); }catch(e){}
        return "";
      }

      if(!force){
        try{
          const cached = String(localStorage.getItem("recruit_user_role") || "").toLowerCase();
          if(cached) return cached;
        }catch(e){}
      }

      let role = "editor";
      try{
        const byUserId = await client
          .from("profiles")
          .select("role,is_active,email,user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        let profile = byUserId.data || null;

        if((!profile || byUserId.error) && user.email){
          const byEmail = await client
            .from("profiles")
            .select("role,is_active,email,user_id")
            .eq("email", user.email)
            .maybeSingle();
          profile = byEmail.data || profile;
        }

        if(profile && profile.is_active === false){
          role = "viewer";
        }else if(profile && profile.role){
          role = String(profile.role).toLowerCase();
        }
      }catch(e){
        console.warn("Recruit role fetch failed", e);
      }

      try{ localStorage.setItem("recruit_user_role", role); }catch(e){}
      if(window.RecruitOpsGuard && typeof window.RecruitOpsGuard.setRole === "function"){
        try{ window.RecruitOpsGuard.setRole(role); }catch(e){}
      }
      return role;
    };
    window.RecruitAuth.markExplicitSignOut = function(){
      _explicitSignOutUntil = Date.now() + 5000;
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
