/* Supabase接続設定
   公開用の publishable key のみ使用しています。
   secret key / service_role key はブラウザ側に入れないでください。
*/
window.SUPABASE_URL = 'https://acxlkqlhlyzctmpmffrd.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_8ZRFizSdMmGkTs_Yk-mQCA_wf5_vSPY';

window.getSupabaseClient = function getSupabaseClient() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) return null;
  if (!window.__licenseSupabaseClient) {
    window.__licenseSupabaseClient = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY
    );
  }
  return window.__licenseSupabaseClient;
};
