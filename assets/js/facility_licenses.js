async function initFacilityLicenses(){
  APP.initHeader();
  const masters=await APP.loadMasters();
  const centers=masters.centers;
  document.getElementById('facility-center-count').textContent=centers.length;
  const tbody=document.getElementById('facility-tbody');
  tbody.innerHTML=centers.length?centers.map(c=>`<tr><td><div class="cell-main">${APP.escape(c.center_name)}</div><div class="cell-sub">${APP.escape(c.division_name||'')}</div></td><td>${APP.badge('未設定','warning')}</td><td>運行管理者・整備管理者・衛生管理者</td><td>選任者登録は次フェーズ</td></tr>`).join(''):`<tr><td colspan="4" class="empty">センターマスタがありません</td></tr>`;
}
window.initFacilityLicenses=initFacilityLicenses;
