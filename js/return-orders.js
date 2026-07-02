// ============================================================
// 跟单团队工作台 · return-orders.js
// 退货单(挂在采购单旁边)· V20260702
// ============================================================
// 依赖：core.js · utils.js · po.js(复用 PO_LIST 查原采购单)· shopify.js(复用 SHOPIFY._orders 查原订单)
// 设计:仿「自定义采购单」的 header+明细表格壳子,区别是明细从原单据自动预填,不用从空白录入
// ============================================================

const RETURN_ORDER_STATUS = {
  pending:    { label: '待处理', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
  contacting: { label: '沟通中', color: '#2563eb', bg: 'rgba(37,99,235,0.15)' },
  returning:  { label: '退货中', color: '#b45309', bg: 'rgba(180,83,9,0.15)' },
  completed:  { label: '已完成', color: '#15803d', bg: 'rgba(21,128,61,0.15)' },
  cancelled:  { label: '已取消', color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
};
const RETURN_REASONS = ['产品瑕疵', '给错货物', '功能故障', '客户取消', '协商换货', '其他'];

let RETURN_ORDERS = [];
let _roFilter = 'active';
let _roLoaded = false;

// ============================================================
// 加载 + 列表渲染
// ============================================================
async function loadReturnOrders() {
  if (typeof sb === 'undefined') return;
  try {
    const { data, error } = await sb.from('return_orders').select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }).limit(500);
    if (error) { if (!/return_orders/.test(error.message || '')) throw error; RETURN_ORDERS = []; return; }
    RETURN_ORDERS = data || [];
    _roLoaded = true;
  } catch (e) { console.warn('[return-orders] 加载失败:', e.message); }
}
window.loadReturnOrders = loadReturnOrders;

function roShowFilter(f) {
  _roFilter = f;
  document.querySelectorAll('[data-rofilter]').forEach(b => b.classList.toggle('active', b.dataset.rofilter === f));
  renderReturnOrders();
}
window.roShowFilter = roShowFilter;

function renderReturnOrders() {
  const body = document.getElementById('roListBody');
  if (!body) return;
  const q = (document.getElementById('roSearch')?.value || '').trim().toLowerCase();

  let list = RETURN_ORDERS.filter(r => {
    if (_roFilter === 'active') { if (!['pending', 'contacting', 'returning'].includes(r.status)) return false; }
    else if (_roFilter === 'pending') { if (r.status !== 'pending') return false; }
    else if (_roFilter === 'completed') { if (r.status !== 'completed') return false; }
    else if (_roFilter === 'cancelled') { if (r.status !== 'cancelled') return false; }
    if (q) {
      const t = [r.return_number, r.related_po_number, r.related_order_no, r.supplier, r.product, r.return_reason].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    return true;
  });

  // 统计角标
  ['pending', 'contacting', 'returning', 'completed', 'cancelled'].forEach(() => {});
  const cntActive = RETURN_ORDERS.filter(r => ['pending', 'contacting', 'returning'].includes(r.status)).length;
  const cntPending = RETURN_ORDERS.filter(r => r.status === 'pending').length;
  const cntCompleted = RETURN_ORDERS.filter(r => r.status === 'completed').length;
  const cntCancelled = RETURN_ORDERS.filter(r => r.status === 'cancelled').length;
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('roCntActive', cntActive); setTxt('roCntPending', cntPending);
  setTxt('roCntCompleted', cntCompleted); setTxt('roCntCancelled', cntCancelled);
  setTxt('roCntAll', RETURN_ORDERS.length);
  updateReturnOrderBadge(cntActive);

  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state"><div class="icon">↩</div><div class="text">${RETURN_ORDERS.length === 0 ? '还没有退货单,点右上角"新建退货单"开始' : '没有匹配的退货单'}</div></div>`;
    return;
  }

  body.innerHTML = list.map(r => _renderReturnOrderCard(r)).join('');
}
window.renderReturnOrders = renderReturnOrders;

function updateReturnOrderBadge(n) {
  const el = document.getElementById('badgeReturnOrder');
  if (!el) return;
  el.textContent = n;
  el.classList.toggle('zero', n === 0);
}

function _renderReturnOrderCard(r) {
  const meta = RETURN_ORDER_STATUS[r.status] || RETURN_ORDER_STATUS.pending;
  const items = Array.isArray(r.line_items) ? r.line_items : [];
  const firstImg = items.find(x => x.image_url)?.image_url || '';
  const itemsText = items.map(it => `${it.title_cn || it.sku || ''} × ${it.qty}`).join('、');
  const canProgress = !['completed', 'cancelled'].includes(r.status);
  const nextLabel = r.status === 'pending' ? '标记沟通中' : r.status === 'contacting' ? '标记退货中' : r.status === 'returning' ? '标记已完成' : '';
  const nextStatus = r.status === 'pending' ? 'contacting' : r.status === 'contacting' ? 'returning' : r.status === 'returning' ? 'completed' : '';

  return `
    <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:12px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
        <span style="font-family:monospace; font-size:13px; color:var(--accent); font-weight:600;">${escapeHtml(r.return_number || '')}</span>
        ${r.related_po_number ? `<span style="font-size:11.5px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:6px; padding:1px 8px; color:var(--text-secondary);">关联 ${escapeHtml(r.related_po_number)}</span>` : ''}
        ${(!r.related_po_number && r.related_order_no) ? `<span style="font-size:11.5px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:6px; padding:1px 8px; color:var(--text-secondary);">关联 ${escapeHtml(r.related_order_no)}</span>` : ''}
        <span style="margin-left:auto; font-size:11.5px; padding:2px 10px; border-radius:6px; background:${meta.bg}; color:${meta.color}; font-weight:600;">${meta.label}</span>
      </div>
      <div style="display:flex; align-items:center; gap:12px; padding:4px 0 12px; cursor:pointer;" onclick="openReturnOrderDetail('${r.id}')">
        ${firstImg ? `<img src="${escapeHtml(_poResizeImg(firstImg, '120x120'))}" style="width:44px; height:44px; object-fit:cover; border-radius:8px; border:1px solid var(--border); flex-shrink:0;" loading="lazy">` : `<div style="width:44px; height:44px; border-radius:8px; background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text-tertiary);">📦</div>`}
        <div style="min-width:0; flex:1;">
          <div style="font-size:13.5px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(itemsText || r.product || '(无明细)')}</div>
          <div style="font-size:11.5px; color:var(--text-tertiary); margin-top:2px;">供应商 ${escapeHtml(r.supplier || '')}${r.return_reason ? ' · 退货原因 ' + escapeHtml(r.return_reason) : ''}</div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div style="font-size:10.5px; color:var(--text-tertiary);">退款金额</div>
          <div style="font-size:14.5px; font-weight:700; color:var(--text-primary);">¥${Number(r.total_amount || 0).toFixed(2)}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px; border-top:1px solid var(--border-subtle); padding-top:10px; font-size:11.5px; color:var(--text-tertiary);">
        <span>发起 ${escapeHtml((r.created_at || '').slice(0, 10))}${r.creator_name ? ' · 跟进 ' + escapeHtml(r.creator_name) : ''}</span>
        ${r.logistics_no ? `<span>🚚 ${escapeHtml(r.logistics_no)}</span>` : ''}
        ${canProgress && nextLabel ? `<button class="btn primary small" style="margin-left:auto;" onclick="event.stopPropagation(); roQuickAdvance('${r.id}', '${nextStatus}', '${nextLabel}')">${nextLabel}</button>` : ''}
      </div>
    </div>`;
}

// ============================================================
// 新建退货单(仿 cpo 明细表格壳子,区别是明细自动预填)
// ============================================================
let RO_STATE = null;
let _roFetchTimer = null;

function openReturnOrderModal() {
  RO_STATE = {
    inputNo: '',
    supplierName: '', supplierId: null,
    relatedPoNumber: '', relatedOrderNo: '', relatedPoId: null,
    lineItems: [],   // [{sku,title_cn,variant,image_url,original_qty,qty,price,checked}]
    returnReason: '',
    logisticsNo: '', logisticsCompany: '',
    note: '',
    _state: 'empty',  // empty | ok | nomatch
  };
  document.getElementById('returnOrderModal').style.display = 'flex';
  renderReturnOrderForm();
}
window.openReturnOrderModal = openReturnOrderModal;

function closeReturnOrderModal() {
  document.getElementById('returnOrderModal').style.display = 'none';
  RO_STATE = null;
}
window.closeReturnOrderModal = closeReturnOrderModal;

// 输入订单号/PO编号 → 自动查 PO_LIST(采购单)+ SHOPIFY._orders(销售单)带出供应商+商品
function roOnNoInput(value) {
  RO_STATE.inputNo = value;
  clearTimeout(_roFetchTimer);
  _roFetchTimer = setTimeout(() => roFetchSource(), 500);
}
window.roOnNoInput = roOnNoInput;

function roFetchSource() {
  const raw = (RO_STATE.inputNo || '').trim().replace(/^#/, '');
  if (!raw) { RO_STATE._state = 'empty'; RO_STATE.lineItems = []; renderReturnOrderForm(); return; }

  // ① 优先按 PO 号精确匹配(po_number 或 order_no)
  let po = null;
  if (typeof PO_LIST !== 'undefined') {
    po = PO_LIST.find(p => String(p.po_number || '').trim() === raw || String(p.order_no || '').trim() === raw);
  }
  if (po) {
    RO_STATE.supplierName = po.supplier || '';
    RO_STATE.relatedPoNumber = po.po_number || '';
    RO_STATE.relatedOrderNo = po.order_no || '';
    RO_STATE.relatedPoId = po.id || null;
    const items = Array.isArray(po.line_items) ? po.line_items : [];
    RO_STATE.lineItems = items.map(li => ({
      sku: li.sku || '', title_cn: li.title_cn || li.title || '', variant: li.variant || '',
      image_url: li.image_url || '', original_qty: Number(li.qty || 0), qty: Number(li.qty || 0),
      price: Number(li.price || 0), checked: false,
    }));
    RO_STATE._state = RO_STATE.lineItems.length ? 'ok' : 'nomatch';
    renderReturnOrderForm();
    return;
  }

  // ② 没匹配到 PO → 按销售单号查(只能带出商品名,没有采购单价,单价留 0 手填)
  let so = null;
  if (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
    so = SHOPIFY._orders.find(x => String(x.shopify_order_number || '').replace('#', '') === raw || String(x.name || '').replace('#', '') === raw);
  }
  if (so && so.line_items && so.line_items.length) {
    RO_STATE.supplierName = '';
    RO_STATE.relatedPoNumber = '';
    RO_STATE.relatedOrderNo = raw;
    RO_STATE.relatedPoId = null;
    RO_STATE.lineItems = so.line_items.map(li => ({
      sku: li.sku || '', title_cn: li.title_cn || li.title || li.variant_title || '', variant: li.variant || li.variant_title || '',
      image_url: li.image_url || '', original_qty: Number(li.qty || li.quantity || 0), qty: Number(li.qty || li.quantity || 0),
      price: 0, checked: false,
    }));
    RO_STATE._state = RO_STATE.lineItems.length ? 'ok' : 'nomatch';
    renderReturnOrderForm();
    return;
  }

  RO_STATE._state = 'nomatch';
  RO_STATE.lineItems = [];
  renderReturnOrderForm();
}

function roToggleLine(i, checked) {
  if (!RO_STATE.lineItems[i]) return;
  RO_STATE.lineItems[i].checked = checked;
  renderReturnOrderForm();
}
window.roToggleLine = roToggleLine;

function roSetLineQty(i, val) {
  const li = RO_STATE.lineItems[i];
  if (!li) return;
  let n = parseInt(val, 10) || 0;
  if (n < 0) n = 0;
  if (n > li.original_qty) n = li.original_qty;   // 不能超过原采购数量
  li.qty = n;
  renderReturnOrderForm();
}
window.roSetLineQty = roSetLineQty;

function roSetReason(reason) {
  RO_STATE.returnReason = reason;
  renderReturnOrderForm();
}
window.roSetReason = roSetReason;

function roCalcTotal() {
  return (RO_STATE.lineItems || []).filter(li => li.checked).reduce((s, li) => s + Number(li.qty || 0) * Number(li.price || 0), 0);
}

function renderReturnOrderForm() {
  const s = RO_STATE;
  const body = document.getElementById('returnOrderBody');
  if (!body || !s) return;

  const linesHtml = s.lineItems.map((li, i) => `
    <label style="display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid var(--border-subtle); cursor:pointer; ${!li.checked ? 'opacity:0.55;' : ''}">
      <input type="checkbox" ${li.checked ? 'checked' : ''} onchange="roToggleLine(${i}, this.checked)" style="margin:0;">
      ${li.image_url ? `<img src="${escapeHtml(_poResizeImg(li.image_url, '120x120'))}" style="width:36px; height:36px; object-fit:cover; border-radius:6px; border:1px solid var(--border); flex-shrink:0;">` : `<div style="width:36px; height:36px; border-radius:6px; background:var(--bg-elevated); flex-shrink:0;"></div>`}
      <div style="flex:1; min-width:0;">
        <div style="font-size:13px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(li.title_cn || '(未命名)')} <span style="color:var(--text-tertiary); font-size:11px;">${escapeHtml(li.sku || '')}</span></div>
        ${li.variant ? `<div style="font-size:11px; color:var(--text-tertiary);">${escapeHtml(li.variant)}</div>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
        <input type="text" inputmode="numeric" pattern="[0-9]*" value="${li.qty}" oninput="this.value=this.value.replace(/[^0-9]/g,''); roSetLineQty(${i}, this.value);" style="width:48px; text-align:center; padding:4px; font-size:13px; border:1px solid var(--border); border-radius:5px;">
        <span style="font-size:11.5px; color:var(--text-tertiary);">/ ${li.original_qty}件</span>
      </div>
      <div style="width:80px; text-align:right; font-size:13px; color:var(--text-primary); flex-shrink:0;">¥${(Number(li.qty) * Number(li.price)).toFixed(2)}</div>
    </label>`).join('');

  const total = roCalcTotal();

  body.innerHTML = `
    <div style="background: rgba(37,99,235,0.06); padding: 10px 12px; border-radius: 6px; border-left: 3px solid var(--accent); font-size: 12px; color: var(--text-secondary); margin-bottom: 14px;">
      💡 输入订单号或采购单号(PO编号),自动带出供应商和商品明细,勾选要退的产品、调整数量、选原因即可。
    </div>

    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">关联订单号 / PO编号 <span style="color:var(--danger);">*</span></label>
      <input type="text" value="${escapeHtml(s.inputNo)}" placeholder="输入订单号(如 K121630)或采购单号(如 CG-20260701-0294)" oninput="roOnNoInput(this.value)" style="width:100%; padding:9px 10px; font-size:14px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
      ${s._state === 'nomatch' ? `<div style="font-size:11.5px; color:#b45309; margin-top:4px;">⚠ 没找到匹配的采购单/订单,请检查编号(可能未同步或已归档)</div>` : ''}
    </div>

    ${s._state === 'ok' ? `
    <div style="background:var(--bg-elevated); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:12px; color:var(--text-secondary);">
      🏭 供应商 <b style="color:var(--text-primary);">${escapeHtml(s.supplierName || '(未知,请手动确认)')}</b>
      <span style="margin-left:14px;">📄 已带出 ${s.lineItems.length} 个商品行</span>
    </div>

    <div style="font-size:11.5px; color:var(--text-tertiary); margin-bottom:4px;">勾选要退货的商品(可调整数量,不超过原数量)</div>
    <div style="border:1px solid var(--border-subtle); border-radius:8px; padding:0 10px; margin-bottom:14px;">${linesHtml}</div>

    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">退货原因</label>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${RETURN_REASONS.map(r => `<span onclick="roSetReason('${r}')" style="cursor:pointer; font-size:12px; padding:5px 12px; border-radius:8px; ${s.returnReason === r ? 'background:rgba(220,38,38,0.1); border:1px solid #dc2626; color:#dc2626; font-weight:600;' : 'border:1px solid var(--border); color:var(--text-secondary);'}">${escapeHtml(r)}</span>`).join('')}
      </div>
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-elevated); border-radius:8px; padding:12px 14px;">
      <span style="font-size:13px; color:var(--text-secondary);">预计退款金额</span>
      <span style="font-size:18px; font-weight:700; color:var(--text-primary);">¥${total.toFixed(2)}</span>
    </div>
    ` : ''}
  `;
}

async function saveReturnOrder() {
  const s = RO_STATE;
  if (!s) return;
  if (!(s.inputNo || '').trim()) { toast('请先输入关联订单号/PO编号', 'warn'); return; }
  const selected = (s.lineItems || []).filter(li => li.checked && li.qty > 0);
  if (selected.length === 0) { toast('请至少勾选一个要退货的商品', 'warn'); return; }
  if (!s.returnReason) { toast('请选择退货原因', 'warn'); return; }

  let agentId = CURRENT_USER_ID;
  if (!agentId) { try { const { data: { user } } = await sb.auth.getUser(); agentId = user?.id; } catch (_) {} }
  if (!agentId) { toast('未登录', 'err'); return; }

  let returnNum;
  try {
    const { data: rn, error: rnErr } = await sb.rpc('generate_return_number');
    if (rnErr) throw rnErr;
    returnNum = rn;
  } catch (e) { toast('生成退货单编号失败:' + (e.message || e), 'err'); return; }

  const liData = selected.map(li => ({
    sku: li.sku, title_cn: li.title_cn, variant: li.variant, image_url: li.image_url,
    original_qty: li.original_qty, qty: li.qty, price: li.price, subtotal: li.qty * li.price,
  }));
  const totalAmount = liData.reduce((s2, x) => s2 + x.subtotal, 0);

  const row = {
    agent_id: agentId,
    return_number: returnNum,
    related_po_number: s.relatedPoNumber || null,
    related_order_no: s.relatedOrderNo || null,
    related_po_id: s.relatedPoId || null,
    supplier: s.supplierName || '',
    product: liData.map(x => x.title_cn).join(' / '),
    line_items: liData,
    total_amount: totalAmount,
    return_reason: s.returnReason,
    status: 'pending',
    logistics_no: s.logisticsNo || null,
    logistics_company: s.logisticsCompany || null,
    note: s.note || '',
    creator_name: (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) ? CURRENT_AGENT : '未知',
    followups: [],
  };

  try {
    const { error } = await sb.from('return_orders').insert(row);
    if (error) throw error;
    toast('✅ 退货单已生成:' + returnNum, 'success');
    closeReturnOrderModal();
    await loadReturnOrders();
    renderReturnOrders();
  } catch (err) {
    console.error('保存退货单失败:', err);
    toast('保存失败:' + (err.message || err), 'err');
  }
}
window.saveReturnOrder = saveReturnOrder;

// ============================================================
// 状态推进 + 详情
// ============================================================
async function roQuickAdvance(id, nextStatus, label) {
  const r = RETURN_ORDERS.find(x => x.id === id);
  if (!r) return;
  const ok = await window.confirmDialog({
    title: label,
    message: `${r.return_number}\n将状态改为「${RETURN_ORDER_STATUS[nextStatus]?.label || nextStatus}」?`,
    okText: '确认',
    cancelText: '取消',
  });
  if (!ok) return;
  try {
    const upd = { status: nextStatus };
    if (nextStatus === 'completed') upd.resolved_date = new Date().toISOString().slice(0, 10);
    const { error } = await sb.from('return_orders').update(upd).eq('id', id);
    if (error) throw error;
    toast(`✓ 已标记「${RETURN_ORDER_STATUS[nextStatus]?.label}」`);
    await loadReturnOrders();
    renderReturnOrders();
  } catch (err) {
    toast('操作失败:' + (err.message || err), 'err');
  }
}
window.roQuickAdvance = roQuickAdvance;

function openReturnOrderDetail(id) {
  const r = RETURN_ORDERS.find(x => x.id === id);
  if (!r) return;
  const meta = RETURN_ORDER_STATUS[r.status] || RETURN_ORDER_STATUS.pending;
  const items = Array.isArray(r.line_items) ? r.line_items : [];
  document.getElementById('roDetailHeader').textContent = `↩ ${r.return_number}`;
  const body = document.getElementById('returnOrderDetailBody');
  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
      <span style="font-size:12px; padding:3px 10px; border-radius:6px; background:${meta.bg}; color:${meta.color}; font-weight:600;">${meta.label}</span>
      ${r.related_po_number ? `<span style="font-size:12px; color:var(--text-secondary);">关联采购单 ${escapeHtml(r.related_po_number)}</span>` : ''}
      ${(!r.related_po_number && r.related_order_no) ? `<span style="font-size:12px; color:var(--text-secondary);">关联订单 ${escapeHtml(r.related_order_no)}</span>` : ''}
    </div>
    <div style="font-size:13px; color:var(--text-secondary); margin-bottom:10px;">🏭 供应商 ${escapeHtml(r.supplier || '')} · ⚠ 退货原因 ${escapeHtml(r.return_reason || '')}</div>
    <div style="border:1px solid var(--border-subtle); border-radius:8px; padding:4px 12px; margin-bottom:14px;">
      ${items.map(it => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-subtle);">
          ${it.image_url ? `<img src="${escapeHtml(_poResizeImg(it.image_url, '120x120'))}" style="width:40px; height:40px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">` : ''}
          <div style="flex:1;"><div style="font-size:13px;">${escapeHtml(it.title_cn || it.sku || '')}</div><div style="font-size:11px; color:var(--text-tertiary);">${escapeHtml(it.sku || '')}</div></div>
          <div style="font-size:12.5px; color:var(--text-secondary);">退 ${it.qty} / 原${it.original_qty}</div>
          <div style="font-size:13px; font-weight:600;">¥${Number(it.subtotal || 0).toFixed(2)}</div>
        </div>`).join('')}
    </div>
    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-elevated); border-radius:8px; padding:10px 14px; margin-bottom:14px;">
      <span style="font-size:13px; color:var(--text-secondary);">退款金额合计</span>
      <span style="font-size:16px; font-weight:700;">¥${Number(r.total_amount || 0).toFixed(2)}</span>
    </div>
    ${!['completed', 'cancelled'].includes(r.status) ? `
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      ${r.status === 'pending' ? `<button class="btn small" onclick="roQuickAdvance('${r.id}','contacting','标记沟通中'); closeReturnOrderDetail();">标记沟通中</button>` : ''}
      ${r.status === 'contacting' ? `<button class="btn small" onclick="roQuickAdvance('${r.id}','returning','标记退货中'); closeReturnOrderDetail();">标记退货中</button>` : ''}
      ${r.status === 'returning' ? `<button class="btn primary small" onclick="roQuickAdvance('${r.id}','completed','标记已完成'); closeReturnOrderDetail();">标记已完成</button>` : ''}
      <button class="btn small" style="color:var(--danger);" onclick="roQuickAdvance('${r.id}','cancelled','标记已取消'); closeReturnOrderDetail();">✕ 标记已取消</button>
    </div>` : ''}
  `;
  document.getElementById('returnOrderDetailModal').style.display = 'flex';
}
window.openReturnOrderDetail = openReturnOrderDetail;

function closeReturnOrderDetail() {
  document.getElementById('returnOrderDetailModal').style.display = 'none';
}
window.closeReturnOrderDetail = closeReturnOrderDetail;
