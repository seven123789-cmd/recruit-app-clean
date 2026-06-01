let PROMO_ROWS=[];
async function initPromotion(){
  APP.initHeader();
  PROMO_ROWS=(await APP.loadEmployees()).filter(e=>e.promotion_target_flag===true||e.promotion_target_flag==='true');
  document.getElementById('promo-count').textContent=PROMO_ROWS.length;
  const tbody=document.getElementById('promo-tbody');
  tbody.innerHTML=PROMO_ROWS.length?PROMO_ROWS.map(e=>`<tr><td><div class="name-cell"><div class="mini-avatar">${APP.escape((e.name||'?')[0])}</div><div><div class="cell-main">${APP.escape(e.name)}</div><div class="cell-sub">${APP.escape(e.employee_code||'')}</div></div></div></td><td>${APP.escape(e.center||'')}</td><td>${APP.escape(e.position||'')}</td><td>${APP.badge(e.current_grade||'未設定','gray')}</td><td>${APP.badge('候補','primary')}</td><td>資格要件は次フェーズで判定</td></tr>`).join(''):`<tr><td colspan="6" class="empty">昇格候補者はありません</td></tr>`;
}
window.initPromotion=initPromotion;
