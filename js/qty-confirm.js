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

const QC = { _list: [], _filter: 'todo', _loadedAt: 0, _shop: '', _search: '', _page: 1, _pageSize: 20, _sort: 'updated_desc', _selected: new Set(), _imgCache: {} };
window.QC = QC;

// V20260620:店铺 handle → 品牌显示名(复用 SHOPIFY.STORES_META · 与销售单chip同一套)
//   qty_confirmations.shop 存的是 handle(如 vakkerlighting),映射成品牌名(Vakkerlight)
function _qcBrandName(shop) {
  if (!shop) return '';
  const s = String(shop).toLowerCase().replace('.myshopify.com', '').trim();
  try {
    const meta = (typeof SHOPIFY !== 'undefined' && SHOPIFY.STORES_META) ? SHOPIFY.STORES_META : [];
    const hit = meta.find(m => {
      const d = (m.domain || '').toLowerCase().replace('.myshopify.com', '');
      const pub = (m.public_domain || '').toLowerCase().replace(/\.(com|net|org)$/, '');
      return d === s || pub === s || (m.site_code || '').toLowerCase() === s;
    });
    if (hit && hit.display_name) return hit.display_name;
  } catch (e) {}
  // mooielight(WooCommerce)等不在表里的兜底
  if (/mooielight/i.test(s)) return 'Mooielight';
  return shop;  // 找不到就原样显示
}

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
        r.order_name, r.customer_name, r.customer_email, r.shop, _qcBrandName(r.shop), r.handler, r.note,
        ...items.map(it => (it.sku || '') + ' ' + (it.title || '')),
      ].filter(Boolean).join(' ').toLowerCase();
      // 支持多关键词(空格/逗号分隔,全部命中)
      return q.split(/[\s,，]+/).filter(Boolean).every(kw => hay.includes(kw));
    });
  }
  // 排序
  const _t = (s) => s ? new Date(s).getTime() : 0;
  const sorters = {
    updated_desc: (a, b) => _t(b.updated_at) - _t(a.updated_at),
    updated_asc:  (a, b) => _t(a.updated_at) - _t(b.updated_at),
    created_desc: (a, b) => _t(b.created_at) - _t(a.created_at),
    created_asc:  (a, b) => _t(a.created_at) - _t(b.created_at),
    deadline_asc: (a, b) => (_t(a.reply_deadline)||Infinity) - (_t(b.reply_deadline)||Infinity),
  };
  all = [...all].sort(sorters[QC._sort] || sorters.updated_desc);
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
      <select id="qcSortSel" onchange="qcOnSort(this.value)" style="margin-left:auto; padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:7px; background:var(--bg-card); cursor:pointer;">
        <option value="updated_desc" ${QC._sort==='updated_desc'?'selected':''}>最近更新</option>
        <option value="updated_asc" ${QC._sort==='updated_asc'?'selected':''}>最早更新</option>
        <option value="created_desc" ${QC._sort==='created_desc'?'selected':''}>最新创建</option>
        <option value="created_asc" ${QC._sort==='created_asc'?'selected':''}>最早创建</option>
        <option value="deadline_asc" ${QC._sort==='deadline_asc'?'selected':''}>回复截止最近</option>
      </select>
      <button class="btn small" onclick="qcExport()" title="导出当前筛选结果为Excel">📥 导出</button>
      <button class="btn small" onclick="loadQtyConfirm().then(renderQtyConfirm)">🔄 刷新</button>
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
        ${_qcShops().map(s => `<option value="${escapeHtml(s.shop)}" ${QC._shop===s.shop?'selected':''}>${escapeHtml(_qcBrandName(s.shop))} · ${s.count}</option>`).join('')}
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

  // 页码按钮:当前页附近 ±2,首尾用首页/末页按钮
  let pageBtns = '';
  if (totalPages > 1) {
    const win = 2;
    let from = Math.max(1, QC._page - win);
    let to = Math.min(totalPages, QC._page + win);
    if (QC._page <= win) to = Math.min(totalPages, 1 + win * 2);
    if (QC._page > totalPages - win) from = Math.max(1, totalPages - win * 2);
    const numBtn = (p) => `<button class="btn small" style="min-width:32px; ${p===QC._page?'background:var(--accent); color:white; font-weight:700;':''}" onclick="qcGoPage(${p})">${p}</button>`;
    if (from > 1) pageBtns += (from > 2 ? `<span style="color:var(--text-tertiary); padding:0 2px;">…</span>` : '');
    for (let p = from; p <= to; p++) pageBtns += numBtn(p);
    if (to < totalPages) pageBtns += (to < totalPages - 1 ? `<span style="color:var(--text-tertiary); padding:0 2px;">…</span>` : '');
  }

  const pager = totalPages > 1 ? `
    <div style="display:flex; align-items:center; justify-content:center; gap:5px; margin-top:16px; flex-wrap:wrap;">
      <button class="btn small" ${QC._page<=1?'disabled style="opacity:0.4;"':''} onclick="qcGoPage(1)" title="第一页">⏮ 首页</button>
      <button class="btn small" ${QC._page<=1?'disabled style="opacity:0.4;"':''} onclick="qcGoPage(${QC._page-1})">← 上一页</button>
      ${pageBtns}
      <button class="btn small" ${QC._page>=totalPages?'disabled style="opacity:0.4;"':''} onclick="qcGoPage(${QC._page+1})">下一页 →</button>
      <button class="btn small" ${QC._page>=totalPages?'disabled style="opacity:0.4;"':''} onclick="qcGoPage(${totalPages})" title="最后一页">末页 ⏭</button>
      <span style="display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--text-secondary); margin-left:8px;">
        跳至
        <input type="number" min="1" max="${totalPages}" id="qcPageJump" value="${QC._page}"
          onkeydown="if(event.key==='Enter'){qcJumpPage();event.preventDefault();}"
          style="width:54px; padding:4px 6px; font-size:12px; border:1px solid var(--border); border-radius:5px; text-align:center; background:var(--bg-card);">
        / ${totalPages} 页
        <button class="btn small" onclick="qcJumpPage()">Go</button>
      </span>
      <span style="font-size:11px; color:var(--text-tertiary); margin-left:6px;">共 ${total} 条</span>
    </div>` : `<div style="text-align:center; font-size:11px; color:var(--text-tertiary); margin-top:12px;">共 ${total} 条</div>`;

  // 批量工具栏(当前页可标完成的项)
  const closeableOnPage = paged.filter(r => r.status === 'revise' || r.status === 'confirmed');
  const selCount = QC._selected.size;
  const batchBar = closeableOnPage.length > 0 ? `
    <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--bg-elevated); border-radius:8px; margin-bottom:10px; flex-wrap:wrap;">
      <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
        <input type="checkbox" ${selCount>0 && closeableOnPage.every(r=>QC._selected.has(String(r.shopify_order_id)))?'checked':''} onchange="qcToggleAll(this.checked)">
        全选本页可处理(${closeableOnPage.length})
      </label>
      ${selCount>0 ? `<span style="font-size:12px; color:var(--accent); font-weight:600;">已选 ${selCount} 单</span>
      <button class="btn primary small" onclick="qcBatchClose()">✓ 批量标记已完成(${selCount})</button>
      <button class="btn small" onclick="qcClearSelection()">取消选择</button>` : '<span style="font-size:11px; color:var(--text-tertiary);">勾选多单可批量标记完成</span>'}
    </div>` : '';

  body.innerHTML = header + batchBar + `<div style="display:flex; flex-direction:column; gap:10px;">${paged.map(_qcCard).join('')}</div>` + pager;

  // V20260620:自动预加载当前页订单图(只加载本页未缓存的,节流避免一次请求过多)
  _qcPreloadImages(paged);
}
window.renderQtyConfirm = renderQtyConfirm;

// 单个商品行(图 + SKU × 数量)· 供卡片渲染 + 图加载后原地更新复用
function _qcItemRow(it, imgMap) {
  const img = imgMap && imgMap[it.sku];
  return `
    <div style="display:flex; align-items:center; gap:8px; font-size:12px; padding:4px 0;">
      ${img ? `<img src="${escapeHtml(img)}" loading="lazy" onclick="openImgLightbox && openImgLightbox('${escapeHtml(img)}')" style="width:36px; height:36px; object-fit:cover; border-radius:5px; border:1px solid var(--border); cursor:zoom-in; flex-shrink:0;">` : `<span style="width:36px; height:36px; border-radius:5px; background:var(--bg-elevated); display:inline-flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0;">💡</span>`}
      <span style="font-family:monospace; color:var(--accent);">${escapeHtml(it.sku || '')}</span>
      <span style="color:var(--text-secondary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(it.title || '')}</span>
      <span style="font-weight:700; background:rgba(220,38,38,0.1); color:#b91c1c; padding:1px 9px; border-radius:6px;">× ${it.quantity}</span>
    </div>`;
}

function _qcCard(r) {
  const meta = QC_STATUS[r.status] || { label: r.status, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' };
  const items = Array.isArray(r.items) ? r.items : [];
  const isRevise = r.status === 'revise';
  const canClose = r.status === 'revise' || r.status === 'confirmed';
  const oid = String(r.shopify_order_id);
  const imgMap = QC._imgCache[oid] || null;   // { sku: imgUrl }

  // 超量商品(图 + SKU × 下单数量)
  const itemsHtml = items.map(it => _qcItemRow(it, imgMap)).join('');

  return `
  <div style="border:1px solid ${isRevise?'rgba(220,38,38,0.3)':'var(--border)'}; border-radius:10px; padding:14px; background:var(--bg-card); ${isRevise?'box-shadow:0 0 0 1px rgba(220,38,38,0.08);':''}">
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
      ${canClose ? `<input type="checkbox" ${QC._selected.has(oid)?'checked':''} onclick="event.stopPropagation(); qcToggleOne('${oid}')" style="cursor:pointer;">` : ''}
      <a href="${escapeHtml(r.admin_url || '#')}" target="_blank" rel="noopener" style="font-weight:700; font-size:14px; color:var(--accent); text-decoration:none;">${escapeHtml(r.order_name || '(无单号)')} ↗</a>
      <span style="font-size:11px; color:var(--text-secondary); background:var(--bg-elevated); padding:1px 8px; border-radius:8px;">${escapeHtml(_qcBrandName(r.shop))}</span>
      <span style="background:${meta.bg}; color:${meta.color}; padding:2px 10px; border-radius:10px; font-size:11.5px; font-weight:600;">${meta.label}</span>
      ${!imgMap ? `<button class="btn small" data-qc-imgbtn="${oid}" style="font-size:10px; padding:1px 7px;" onclick="qcLoadImg('${oid}','${escapeHtml(r.shop||'')}','${escapeHtml(r.order_name||'')}')">🖼 看图</button>` : ''}
      <span style="margin-left:auto; font-size:11px; color:var(--text-tertiary);">${escapeHtml(r.customer_name || '')}${r.customer_email?` · ${escapeHtml(r.customer_email)}`:''}</span>
    </div>

    <div style="background:var(--bg-elevated); border-radius:7px; padding:8px 10px; margin-bottom:8px;">
      <div style="font-size:10.5px; color:var(--text-tertiary); margin-bottom:4px;">触发核实的商品(下单数量):</div>
      <div data-qc-imgs="${oid}">${itemsHtml || '<span style="font-size:12px; color:var(--text-tertiary);">无明细</span>'}</div>
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

// 自定义页码跳转(读输入框 · 限制范围)
function qcJumpPage() {
  const inp = document.getElementById('qcPageJump');
  if (!inp) return;
  const total = _qcFilteredList().length;
  const totalPages = Math.max(1, Math.ceil(total / QC._pageSize));
  let p = parseInt(inp.value, 10);
  if (isNaN(p)) return;
  p = Math.min(Math.max(1, p), totalPages);
  qcGoPage(p);
}
window.qcJumpPage = qcJumpPage;

function qcOnSort(v) { QC._sort = v; QC._page = 1; renderQtyConfirm(); }
window.qcOnSort = qcOnSort;

// ── 批量选择 ──
function qcToggleOne(oid) {
  if (QC._selected.has(oid)) QC._selected.delete(oid); else QC._selected.add(oid);
  renderQtyConfirm();
}
window.qcToggleOne = qcToggleOne;

function qcToggleAll(checked) {
  // 只针对当前页可处理的项
  const list = _qcFilteredList();
  const start = (QC._page - 1) * QC._pageSize;
  const paged = list.slice(start, start + QC._pageSize);
  paged.forEach(r => {
    if (r.status === 'revise' || r.status === 'confirmed') {
      const oid = String(r.shopify_order_id);
      if (checked) QC._selected.add(oid); else QC._selected.delete(oid);
    }
  });
  renderQtyConfirm();
}
window.qcToggleAll = qcToggleAll;

function qcClearSelection() { QC._selected.clear(); renderQtyConfirm(); }
window.qcClearSelection = qcClearSelection;

// 批量标记完成
async function qcBatchClose() {
  const ids = Array.from(QC._selected);
  if (ids.length === 0) { toast('未选择任何单', 'info'); return; }
  if (!confirm(`确认把选中的 ${ids.length} 单标记为已完成?\n\n会同时给各 Shopify 订单打「已处理」标签。`)) return;
  let ok = 0, fail = 0;
  for (const oid of ids) {
    const rec = QC._list.find(x => String(x.shopify_order_id) === oid);
    if (!rec) { fail++; continue; }
    try {
      await _qcCloseOne(rec);
      ok++;
    } catch (e) { fail++; console.warn('[qty-confirm] 批量某单失败:', oid, e.message); }
  }
  QC._selected.clear();
  toast(`✓ 批量完成:成功 ${ok}${fail?` · 失败 ${fail}`:''}`, fail?'warn':'success', 3000);
  await loadQtyConfirm(); renderQtyConfirm();
  if (typeof updateBadges === 'function') updateBadges();
}
window.qcBatchClose = qcBatchClose;

// 单条关闭的核心(供单个/批量复用)
async function _qcCloseOne(rec) {
  const nowIso = new Date().toISOString();
  const me = (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : '') || '跟单';
  const newNote = ((rec.note) ? rec.note + '\n' : '') + `[跟单] 已处理 · ${me} · ${nowIso.slice(0,10)}`;
  const { error } = await sb.from('qty_confirmations')
    .update({ status: 'closed', resolved_at: rec.resolved_at || nowIso, updated_at: nowIso, note: newNote, handler: rec.handler || me })
    .eq('shopify_order_id', rec.shopify_order_id);
  if (error) throw error;
  const isWoo = /mooielight/i.test(rec.shop || '');
  if (!isWoo && rec.shop && typeof SHOPIFY !== 'undefined' && SHOPIFY.call) {
    try {
      const shopDomain = rec.shop.includes('.myshopify.com') ? rec.shop : (rec.shop + '.myshopify.com');
      await SHOPIFY.call('add_order_tags', { order_id: Number(rec.shopify_order_id), tags: ['已处理'], remove: [] }, shopDomain);
    } catch (te) { console.warn('[qty-confirm] 打标签失败(状态已更新):', te.message); }
  }
}

// ── 订单图 ──
// 核心:拉单张订单图(只写缓存,不toast不重渲)· 供手动/预加载复用
async function _qcFetchImg(oid, shop, orderName) {
  if (QC._imgCache[oid] !== undefined) return false;  // 已缓存(含空)跳过
  if (!shop || !orderName) { QC._imgCache[oid] = {}; return false; }
  // Woo mooielight 走不同 API,这里跳过自动取图
  if (/mooielight/i.test(shop)) { QC._imgCache[oid] = {}; return false; }
  try {
    const shopDomain = shop.includes('.myshopify.com') ? shop : (shop + '.myshopify.com');
    const r = await SHOPIFY.call('list_orders', { name: orderName, status: 'any', limit: 5, auto_save: false }, shopDomain);
    const orders = (r && (r.orders || r.data || (Array.isArray(r) ? r : []))) || [];
    const ord = orders.find(o => String(o.name||'').replace('#','') === String(orderName).replace('#','')) || orders[0];
    const map = {};
    if (ord && Array.isArray(ord.line_items)) {
      ord.line_items.forEach(li => {
        const sku = li.sku || (li.variant && li.variant.sku);
        const img = (li.image && (li.image.src || li.image)) || (li.variant && li.variant.image && li.variant.image.src) || li.image_url;
        if (sku && img) map[sku] = img;
      });
    }
    QC._imgCache[oid] = map;
    return Object.keys(map).length > 0;
  } catch (e) {
    QC._imgCache[oid] = {};
    console.warn('[qty-confirm] 取图失败:', oid, e.message);
    return false;
  }
}

// 手动点「看图」(单张 · 带提示)
async function qcLoadImg(oid, shop, orderName) {
  if (QC._imgCache[oid] !== undefined) { renderQtyConfirm(); return; }
  toast('🖼 加载产品图...', 'info', 1200);
  const got = await _qcFetchImg(oid, shop, orderName);
  renderQtyConfirm();
  if (!got) toast('该单未取到产品图', 'info', 2000);
}
window.qcLoadImg = qcLoadImg;

// 自动预加载当前页订单图(节流:每批3个并发,逐批跑,完成一批重渲一次)
let _qcPreloading = false;
async function _qcPreloadImages(paged) {
  if (_qcPreloading) return;
  const todo = (paged || []).filter(r => QC._imgCache[String(r.shopify_order_id)] === undefined && r.shop && r.order_name && !/mooielight/i.test(r.shop));
  if (todo.length === 0) return;
  _qcPreloading = true;
  try {
    const BATCH = 3;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      await Promise.all(batch.map(r => _qcFetchImg(String(r.shopify_order_id), r.shop, r.order_name)));
      if (CURRENT_TAB === 'qtyconfirm') _qcApplyImagesToDOM(batch);
    }
  } finally { _qcPreloading = false; }
}

// 把已缓存的图直接写进已渲染的卡片(原地更新 · 不整页重渲 · 不打断搜索/滚动)
function _qcApplyImagesToDOM(records) {
  (records || []).forEach(r => {
    const oid = String(r.shopify_order_id);
    const map = QC._imgCache[oid];
    if (!map) return;
    const holder = document.querySelector(`[data-qc-imgs="${oid}"]`);
    if (!holder) return;
    // 重渲该卡片的商品行(带图)
    const items = Array.isArray(r.items) ? r.items : [];
    holder.innerHTML = items.map(it => _qcItemRow(it, map)).join('') || '<span style="font-size:12px; color:var(--text-tertiary);">无明细</span>';
    // 去掉「看图」按钮
    const btn = document.querySelector(`[data-qc-imgbtn="${oid}"]`);
    if (btn) btn.remove();
  });
}
window._qcPreloadImages = _qcPreloadImages;

// ── 导出当前筛选结果为 Excel ──
function qcExport() {
  const list = _qcFilteredList();
  if (list.length === 0) { toast('当前没有可导出的记录', 'info'); return; }
  const STATUS_CN = { pending:'客服处理中', revise:'客户要改数量', confirmed:'按原单发货', closed:'已完成' };
  const rows = list.map(r => {
    const items = Array.isArray(r.items) ? r.items : [];
    const itemsStr = items.map(it => `${it.sku || ''} ×${it.quantity}${it.title?(' '+it.title):''}`).join(' | ');
    return {
      '订单号': r.order_name || '',
      '店铺': r.shop || '',
      '状态': STATUS_CN[r.status] || r.status || '',
      '客户': r.customer_name || '',
      '邮箱': r.customer_email || '',
      '触发商品(SKU×数量)': itemsStr,
      '超量项数': r.item_count || items.length,
      '订单金额': r.order_total || '',
      '币种': r.currency || '',
      '客户诉求/备注': r.note || '',
      '跟进人': r.handler || '',
      '发信时间': r.email_sent_at ? new Date(r.email_sent_at).toLocaleString('zh-CN') : '',
      '回复截止': r.reply_deadline ? new Date(r.reply_deadline).toLocaleString('zh-CN') : '',
      '解决时间': r.resolved_at ? new Date(r.resolved_at).toLocaleString('zh-CN') : '',
      '创建时间': r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '',
      'Shopify链接': r.admin_url || '',
    };
  });
  // 用 SheetJS(全局 XLSX,工作台已加载);没有则退回 CSV
  try {
    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '数量核实');
      const fname = `数量核实_${QC._filter}_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(wb, fname);
      toast(`📥 已导出 ${rows.length} 条`, 'success', 2000);
      return;
    }
  } catch (e) { console.warn('[qty-confirm] xlsx导出失败,转CSV:', e.message); }
  // CSV 兜底
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `数量核实_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast(`📥 已导出 ${rows.length} 条(CSV)`, 'success', 2000);
}
window.qcExport = qcExport;

// 标记已完成 → status=closed + 打 Shopify「已处理」标签
async function qcMarkClosed(shopifyOrderId, shop, fromStatus) {
  if (!shopifyOrderId) { toast('缺订单ID', 'err'); return; }
  const tip = fromStatus === 'revise' ? '确认已按客户诉求改好数量?' : '确认已按原单发货?';
  if (!confirm(`${tip}\n\n标记完成后状态变「已完成」,并给 Shopify 订单打「已处理」标签。`)) return;
  try {
    const rec = QC._list.find(x => String(x.shopify_order_id) === String(shopifyOrderId));
    if (!rec) { toast('未找到记录', 'err'); return; }
    await _qcCloseOne(rec);
    toast('✓ 已标记完成', 'success', 2000);
    QC._selected.delete(String(shopifyOrderId));
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
