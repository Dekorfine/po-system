// ============================================================================
// 数量核实 · 跟单处理模块 · V20260618
//   共用客服侧同一张表 qty_confirmations(本项目 pyfmuknvjqfwcqvbrsvw · sb client)
//   状态:pending(客服处理中)/ revise(客户要改·跟单核心待办)/ confirmed(按原单发)/ closed(跟单完成)
//   跟单的活:处理 revise(改数量)+ 执行 confirmed(按原单发)→ 标 closed
//   标 closed 时调 shopify-api add_order_tags 打「已处理」标签(Woo mooielight 跳过)
// ============================================================================

const QC_STATUS = {
  pending:   { label: '客服处理中', color: 'var(--text-secondary)', bg: 'rgba(136,135,128,0.08)' },
  revise:    { label: '⚠ 客户要改数量', color: '#b91c1c', bg: 'rgba(220,38,38,0.08)' },
  confirmed: { label: '按原单发货', color: '#185fa5', bg: 'rgba(37,99,235,0.08)' },
  closed:    { label: '✓ 已完成', color: '#3b6d11', bg: 'rgba(99,153,34,0.08)' },
};

const QC = { _list: [], _filter: 'todo', _loadedAt: 0 };
window.QC = QC;

async function loadQtyConfirm() {
  if (typeof sb === 'undefined') return;
  try {
    const { data, error } = await sb.from('qty_confirmations').select('*')
      .order('updated_at', { ascending: false }).limit(500);
    if (error) { if (!/qty_confirmations/.test(error.message || '')) throw error; QC._list = []; return; }
    QC._list = data || [];
    QC._loadedAt = Date.now();
  } catch (e) { console.warn('[qty-confirm] 加载失败:', e.message); }
}
window.loadQtyConfirm = loadQtyConfirm;

function _qcFilteredList() {
  const all = QC._list || [];
  switch (QC._filter) {
    case 'todo':      return all.filter(r => r.status === 'revise' || r.status === 'confirmed');
    case 'revise':    return all.filter(r => r.status === 'revise');
    case 'confirmed': return all.filter(r => r.status === 'confirmed');
    case 'pending':   return all.filter(r => r.status === 'pending');
    case 'closed':    return all.filter(r => r.status === 'closed');
    default:          return all;
  }
}

function _qcCounts() {
  const all = QC._list || [];
  const now = Date.now();
  return {
    revise:    all.filter(r => r.status === 'revise').length,
    confirmed: all.filter(r => r.status === 'confirmed').length,
    pending:   all.filter(r => r.status === 'pending').length,
    closed:    all.filter(r => r.status === 'closed').length,
    // 积压:revise 且 updated_at 超 3 天没动
    backlog:   all.filter(r => r.status === 'revise' && r.updated_at && (now - new Date(r.updated_at).getTime()) > 3*86400000).length,
  };
}

function renderQtyConfirm() {
  const body = document.getElementById('qtyConfirmBody');
  if (!body) return;
  const c = _qcCounts();
  const list = _qcFilteredList();

  const tab = (k, label, n, danger) => `
    <button onclick="qcSetFilter('${k}')" style="padding:6px 14px; font-size:12px; border:1px solid var(--border); border-radius:7px; cursor:pointer; background:${QC._filter===k?'var(--accent)':'var(--bg-card)'}; color:${QC._filter===k?'white':'var(--text-secondary)'}; display:inline-flex; align-items:center; gap:5px;">
      ${label}${n!==undefined?`<span style="background:${QC._filter===k?'rgba(255,255,255,0.25)':(danger&&n?'var(--danger)':'var(--bg-elevated)')}; color:${QC._filter===k?'white':(danger&&n?'white':'var(--text-tertiary)')}; padding:0 7px; border-radius:9px; font-size:11px; font-weight:600;">${n}</span>`:''}
    </button>`;

  const header = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
      <h2 style="margin:0; font-size:17px; display:flex; align-items:center; gap:8px;">
        🔢 数量核实
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">单SKU≥2自动核实 · 跟单处理客户要改/按原单发</span>
      </h2>
      <button class="btn small" style="margin-left:auto;" onclick="loadQtyConfirm().then(renderQtyConfirm)">🔄 刷新</button>
    </div>
    ${c.backlog ? `<div style="background:rgba(220,38,38,0.08); border:1px solid rgba(220,38,38,0.2); border-radius:8px; padding:8px 12px; margin-bottom:10px; font-size:12.5px; color:#b91c1c;">⚠ 有 ${c.backlog} 单客户要改数量已积压超3天没处理</div>` : ''}
    <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
      ${tab('todo', '🔥 需处理', c.revise + c.confirmed, true)}
      ${tab('revise', '⚠ 客户要改', c.revise, true)}
      ${tab('confirmed', '按原单发', c.confirmed)}
      ${tab('pending', '客服处理中', c.pending)}
      ${tab('closed', '已完成', c.closed)}
    </div>`;

  if (list.length === 0) {
    body.innerHTML = header + `<div style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:34px;">${QC._filter==='todo'?'🎉':'📭'}</div><div>${QC._filter==='todo'?'没有待处理的数量核实单':'此分类暂无记录'}</div></div>`;
    return;
  }
  body.innerHTML = header + `<div style="display:flex; flex-direction:column; gap:10px;">${list.map(_qcCard).join('')}</div>`;
}
window.renderQtyConfirm = renderQtyConfirm;

function _qcCard(r) {
  const meta = QC_STATUS[r.status] || { label: r.status, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' };
  const items = Array.isArray(r.items) ? r.items : [];
  const isRevise = r.status === 'revise';
  const canClose = r.status === 'revise' || r.status === 'confirmed';

  // 超量商品(SKU × 下单数量)
  const itemsHtml = items.map(it => `
    <div style="display:flex; align-items:center; gap:8px; font-size:12px; padding:3px 0;">
      <span style="font-family:monospace; color:var(--accent);">${escapeHtml(it.sku || '')}</span>
      <span style="color:var(--text-secondary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(it.title || '')}</span>
      <span style="font-weight:700; background:rgba(220,38,38,0.1); color:#b91c1c; padding:1px 9px; border-radius:6px;">× ${it.quantity}</span>
    </div>`).join('');

  return `
  <div style="border:1px solid ${isRevise?'rgba(220,38,38,0.3)':'var(--border)'}; border-radius:10px; padding:14px; background:var(--bg-card); ${isRevise?'box-shadow:0 0 0 1px rgba(220,38,38,0.08);':''}">
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
      <a href="${escapeHtml(r.admin_url || '#')}" target="_blank" rel="noopener" style="font-weight:700; font-size:14px; color:var(--accent); text-decoration:none;">${escapeHtml(r.order_name || '(无单号)')} ↗</a>
      <span style="font-size:11px; color:var(--text-secondary); background:var(--bg-elevated); padding:1px 8px; border-radius:8px;">${escapeHtml(r.shop || '')}</span>
      <span style="background:${meta.bg}; color:${meta.color}; padding:2px 10px; border-radius:10px; font-size:11.5px; font-weight:600;">${meta.label}</span>
      <span style="margin-left:auto; font-size:11px; color:var(--text-tertiary);">${escapeHtml(r.customer_name || '')}${r.customer_email?` · ${escapeHtml(r.customer_email)}`:''}</span>
    </div>

    <div style="background:var(--bg-elevated); border-radius:7px; padding:8px 10px; margin-bottom:8px;">
      <div style="font-size:10.5px; color:var(--text-tertiary); margin-bottom:4px;">触发核实的商品(下单数量):</div>
      ${itemsHtml || '<span style="font-size:12px; color:var(--text-tertiary);">无明细</span>'}
    </div>

    ${isRevise && r.note ? `
    <div style="background:rgba(220,38,38,0.05); border:1px dashed rgba(220,38,38,0.3); border-radius:7px; padding:8px 10px; margin-bottom:8px;">
      <div style="font-size:11px; font-weight:600; color:#b91c1c; margin-bottom:3px;">📣 客户诉求(数量怎么改):</div>
      <div style="font-size:12.5px; color:var(--text-primary); line-height:1.5; white-space:pre-wrap;">${escapeHtml(r.note)}</div>
    </div>` : (r.note ? `<div style="font-size:11.5px; color:var(--text-secondary); margin-bottom:8px;">📝 ${escapeHtml(r.note)}</div>` : '')}

    <div style="display:flex; align-items:center; gap:10px; font-size:10.5px; color:var(--text-tertiary); flex-wrap:wrap;">
      ${r.email_sent_at ? `<span>发信 ${_qcDate(r.email_sent_at)}</span>` : ''}
      ${r.reply_deadline ? `<span>截止 ${_qcDate(r.reply_deadline)}</span>` : ''}
      ${r.handler ? `<span>跟进 ${escapeHtml(r.handler)}</span>` : ''}
      ${canClose ? `<button class="btn primary small" style="margin-left:auto;" onclick="qcMarkClosed('${r.shopify_order_id}', '${escapeHtml(r.shop||'')}', '${r.status}')">✓ 标记已完成</button>` : (r.resolved_at ? `<span style="margin-left:auto;">完成 ${_qcDate(r.resolved_at)}</span>` : '')}
    </div>
  </div>`;
}

function _qcDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' }); } catch (e) { return String(s).slice(5,10); }
}

function qcSetFilter(f) { QC._filter = f; renderQtyConfirm(); }
window.qcSetFilter = qcSetFilter;

// 标记已完成 → status=closed + 打 Shopify「已处理」标签
async function qcMarkClosed(shopifyOrderId, shop, fromStatus) {
  if (!shopifyOrderId) { toast('缺订单ID', 'err'); return; }
  const tip = fromStatus === 'revise' ? '确认已按客户诉求改好数量?' : '确认已按原单发货?';
  if (!confirm(`${tip}\n\n标记完成后状态变「已完成」,并给 Shopify 订单打「已处理」标签。`)) return;
  try {
    const nowIso = new Date().toISOString();
    const me = (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : '') || '跟单';
    // 取现有 note 追加
    const rec = QC._list.find(x => String(x.shopify_order_id) === String(shopifyOrderId));
    const newNote = ((rec && rec.note) ? rec.note + '\n' : '') + `[跟单] 已处理 · ${me} · ${nowIso.slice(0,10)}`;
    const { error } = await sb.from('qty_confirmations')
      .update({ status: 'closed', resolved_at: (rec && rec.resolved_at) || nowIso, updated_at: nowIso, note: newNote, handler: (rec && rec.handler) || me })
      .eq('shopify_order_id', shopifyOrderId);
    if (error) throw error;

    // 打 Shopify 标签(Woo mooielight 跳过)
    const isWoo = /mooielight/i.test(shop || '');
    if (!isWoo && shop && typeof SHOPIFY !== 'undefined' && SHOPIFY.call) {
      try {
        await SHOPIFY.call('add_order_tags', { order_id: Number(shopifyOrderId), tags: ['已处理'], remove: [] }, shop.includes('.myshopify.com') ? shop : (shop + '.myshopify.com'));
      } catch (te) { console.warn('[qty-confirm] 打标签失败(状态已更新):', te.message); }
    }
    toast('✓ 已标记完成', 'success', 2000);
    await loadQtyConfirm(); renderQtyConfirm();
    if (typeof updateBadges === 'function') updateBadges();
  } catch (e) { toast('操作失败:' + (e.message || e), 'err', 4000); }
}
window.qcMarkClosed = qcMarkClosed;

// 角标:需处理(revise + confirmed 未关闭)
function qcTodoCount() {
  return (QC._list || []).filter(r => r.status === 'revise' || r.status === 'confirmed').length;
}
window.qcTodoCount = qcTodoCount;
