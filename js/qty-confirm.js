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

const QC = { _list: [], _filter: 'todo', _loadedAt: 0, _shop: '', _search: '', _page: 1, _pageSize: 20 };
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
  let all = QC._list || [];
  // 状态筛选
  switch (QC._filter) {
    case 'todo':      all = all.filter(r => r.status === 'revise' || r.status === 'confirmed'); break;
    case 'revise':    all = all.filter(r => r.status === 'revise'); break;
    case 'confirmed': all = all.filter(r => r.status === 'confirmed'); break;
    case 'pending':   all = all.filter(r => r.status === 'pending'); break;
    case 'closed':    all = all.filter(r => r.status === 'closed'); break;
  }
  // 店铺筛选
  if (QC._shop) all = all.filter(r => (r.shop || '') === QC._shop);
  // 智能搜索:单号/客户名/邮箱/SKU/商品名/备注
  const q = (QC._search || '').trim().toLowerCase();
  if (q) {
    all = all.filter(r => {
      const items = Array.isArray(r.items) ? r.items : [];
      const hay = [
        r.order_name, r.customer_name, r.customer_email, r.shop, r.handler, r.note,
        ...items.map(it => (it.sku || '') + ' ' + (it.title || '')),
      ].filter(Boolean).join(' ').toLowerCase();
      // 支持多关键词(空格/逗号分隔,全部命中)
      return q.split(/[\s,，]+/).filter(Boolean).every(kw => hay.includes(kw));
    });
  }
  return all;
}

// 全部店铺(去重,做筛选下拉)
function _qcShops() {
  const m = {};
  (QC._list || []).forEach(r => { if (r.shop) m[r.shop] = (m[r.shop] || 0) + 1; });
  return Object.keys(m).sort().map(s => ({ shop: s, count: m[s] }));
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
    <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
      ${tab('todo', '🔥 需处理', c.revise + c.confirmed, true)}
      ${tab('revise', '⚠ 客户要改', c.revise, true)}
      ${tab('confirmed', '按原单发', c.confirmed)}
      ${tab('pending', '客服处理中', c.pending)}
      ${tab('closed', '已完成', c.closed)}
    </div>
    <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; align-items:center;">
      <input type="text" id="qcSearchInput" value="${escapeHtml(QC._search)}" oninput="qcOnSearch(this.value)" autocomplete="off" data-1p-ignore data-lpignore="true"
        placeholder="🔍 搜单号 / 客户 / 邮箱 / SKU / 商品名(多词空格分隔)"
        style="flex:1; min-width:240px; padding:7px 12px; font-size:12.5px; border:1px solid var(--border); border-radius:7px; background:var(--bg-card);">
      <select id="qcShopFilter" onchange="qcOnShop(this.value)" style="padding:7px 12px; font-size:12.5px; border:1px solid var(--border); border-radius:7px; background:var(--bg-card); cursor:pointer;">
        <option value="">🏪 全部网站</option>
        ${_qcShops().map(s => `<option value="${escapeHtml(s.shop)}" ${QC._shop===s.shop?'selected':''}>${escapeHtml(s.shop)} · ${s.count}</option>`).join('')}
      </select>
      ${(QC._search || QC._shop) ? `<button class="btn small" onclick="qcClearFilters()">✕ 清除筛选</button>` : ''}
    </div>`;

  if (list.length === 0) {
    body.innerHTML = header + `<div style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:34px;">${(QC._search||QC._shop)?'🔍':(QC._filter==='todo'?'🎉':'📭')}</div><div>${(QC._search||QC._shop)?'没有匹配的记录':(QC._filter==='todo'?'没有待处理的数量核实单':'此分类暂无记录')}</div></div>`;
    return;
  }

  // 分页
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / QC._pageSize));
  if (QC._page > totalPages) QC._page = totalPages;
  const start = (QC._page - 1) * QC._pageSize;
  const paged = list.slice(start, start + QC._pageSize);

  const pager = totalPages > 1 ? `
    <div style="display:flex; align-items:center; justify-content:center; gap:6px; margin-top:16px; flex-wrap:wrap;">
      <button class="btn small" ${QC._page<=1?'disabled style="opacity:0.4;"':''} onclick="qcGoPage(${QC._page-1})">← 上一页</button>
      <span style="font-size:12px; color:var(--text-secondary); padding:0 8px;">第 ${QC._page} / ${totalPages} 页 · 共 ${total} 条</span>
      <button class="btn small" ${QC._page>=totalPages?'disabled style="opacity:0.4;"':''} onclick="qcGoPage(${QC._page+1})">下一页 →</button>
    </div>` : `<div style="text-align:center; font-size:11px; color:var(--text-tertiary); margin-top:12px;">共 ${total} 条</div>`;

  body.innerHTML = header + `<div style="display:flex; flex-direction:column; gap:10px;">${paged.map(_qcCard).join('')}</div>` + pager;
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

function qcSetFilter(f) { QC._filter = f; QC._page = 1; renderQtyConfirm(); }
window.qcSetFilter = qcSetFilter;

// 搜索(防抖 · 不重渲整页只更新列表,保持输入焦点)
let _qcSearchTimer = null;
function qcOnSearch(v) {
  QC._search = v;
  QC._page = 1;
  clearTimeout(_qcSearchTimer);
  _qcSearchTimer = setTimeout(() => {
    renderQtyConfirm();
    // 重渲后恢复焦点到搜索框末尾
    const el = document.getElementById('qcSearchInput');
    if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); }
  }, 250);
}
window.qcOnSearch = qcOnSearch;

function qcOnShop(v) { QC._shop = v; QC._page = 1; renderQtyConfirm(); }
window.qcOnShop = qcOnShop;

function qcClearFilters() { QC._search = ''; QC._shop = ''; QC._page = 1; renderQtyConfirm(); }
window.qcClearFilters = qcClearFilters;

function qcGoPage(p) {
  QC._page = Math.max(1, p);
  renderQtyConfirm();
  const body = document.getElementById('qtyConfirmBody');
  if (body) body.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.qcGoPage = qcGoPage;

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
