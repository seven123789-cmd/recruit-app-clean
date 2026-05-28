# セキュリティ・保守性修正レポート

## 修正① candidate_utils.js 重複削除

### 修正前
```text
/candidate_utils.js
/assets/js/candidate_utils.js
```

### 修正後
```text
/assets/js/candidate_utils.js
```

ルート直下 `/candidate_utils.js` は削除対象です。
HTML参照はすべて `assets/js/candidate_utils.js?v=20260528` へ統一済みです。

### grep確認
```bash
grep -R "candidate_utils.js" .
```

## 修正② ops_guard.js 二重タイマー廃止

### 修正前
```js
document.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(resolveAndApply, 100);
  window.setTimeout(resolveAndApply, 800);
});
```

### 修正後
```js
window.addEventListener("recruit:role-ready", ev => {
  const role = ev.detail && ev.detail.role ? ev.detail.role : window.currentRole;
  window.__recruitRoleResolved = true;
  applyToPage(role);
  document.body.classList.remove("auth-checking");
});
```

## 修正③ 権限チェックを RecruitOpsGuard に一本化

|オブジェクト|公開メソッド|状態|
|---|---|---|
|RecruitOpsGuard|normalize / normalizeRole / currentRole / setRole / hasRole / isAdmin / canRead / canWrite / canEdit / canImport / canExport / canDelete / canManageMaster / require* / applyToPage|正式版|
|RecruitRole|RecruitOpsGuard alias + isViewer / isManager / apply|後方互換|
|RecruitAuth|getSession / getUser / getCurrentProfile / refreshRole / getCurrentRole / can / isAdmin / canEdit / canExport / logoutToIndex|権限判定はRecruitOpsGuardへ委譲|
|RecruitPageAuth|getUser / getRole / showAuth / showApp / login / logoutToIndex / authInit / normalizeRole / hasRole / canEdit / canAdmin|権限判定はRecruitOpsGuardへ委譲|

## 修正④ バージョン統一

### 追加
```js
window.RECRUIT_APP_VERSION = "20260528";
```

### 一括更新コマンド
```bash
find . -name "*.html" -type f -print0 | xargs -0 sed -i -E 's/\?v=[A-Za-z0-9_\-]+/?v=20260528/g'
```

### Node.js版
```bash
node scripts/update_version.js
```

## 修正⑤ RLS SQL

`sql/10_rls_policy_reference.sql` に、profiles / candidates / master_centers / master_divisions / master_statuses のRLS方針SQLを同梱しています。
既に本番DBに同等ポリシーが入っている場合は、重複しないよう確認してから利用してください。
