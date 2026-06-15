// ============================================================
// 跟单团队工作台 · orders.js
// 催单（V3 改造）· 数据源：PO 派生（orders 表 po_number IS NOT NULL 且未发货）
// ============================================================
// 依赖：core.js · utils.js · po.js（共享 PO 状态机/审批）
// ============================================================

// 催单 tab 快速筛选模式(叠加在 status filter 之上)
// '' = 无叠加;'thismonth_arrived' = 本月到货;'overdue_or_today' = 逾期或今日要催
let _ordersQuickMode = '';

// V5-2026-05-24: "仅看 PO 派生" 独立开关(可与阈值组合 AND)
let _onlyPoSource = false;
let _onlyExpress = false;  // V20260604:仅看付运费/快速单

// ============================================================
// PO 派生催单 · 数据加载层
// ============================================================
// 加载条件：未删除 + 未发货/取消/到货的 orders
// 前端分流：CHASE_ORDERS（所有未结的，含旧手动 + PO 派生），ALL_PO_ORDERS（仅 PO 含已完成，用于绩效）
async function loadChaseOrders(force = false) {
  // V20260602-perf:60秒缓存 · 切 tab/浏览器返回键不再每次全表扫 orders(IO 主因之一)
  // 写操作(新增/删除/状态变更)都是内存同步 mutate + 单条 update,数据已是最新,无需重拉
  if (!force && typeof _chaseLastLoad !== 'undefined' && _chaseLastLoad && (Date.now() - _chaseLastLoad < 60000) && Array.isArray(CHASE_ORDERS) && typeof _chaseLoadedOnce !== 'undefined' && _chaseLoadedOnce) {
    return;
  }
  try {
    // V20260602-perf:禁止 select('*') · 只取列表/弹窗渲染实际用到的列(orders 表本身无 base64/大字段,但减少传输)
    // 列名写错会 400 → 自动回退 select('*') 兜底
    const COLS = 'id,agent_id,order_no,site,product,supplier,status,order_date,promised_date,shipped_date,arrived_date,next_follow,notes,screenshots,followups,created_at,updated_at,deleted_at,deleted_by,shopify_order_id,shopify_order_name,shopify_shop_domain,customer_name,customer_email,shipping_address,shipping_country,order_value,order_currency,shopify_financial_status,shopify_fulfillment_status,shopify_order_number,line_items,source,po_number,box_note,total_amount,freight,other_fees,creator_name,sales_order_id,note,approved_by,approval_note,finance_deposit_paid,finance_deposit_paid_at,finance_payment_completed,finance_payment_completed_at,finance_total_paid,finance_recorded,finance_order_uuid,finance_recorded_at,qty,products,is_express';
    let q = sb.from('orders').select(COLS)
      .is('deleted_at', null);
    // V20260526p: 催单完全开放 · 所有人可看 + 改所有催单(应业务需求 · 之前只看自己的)
    // if (!IS_ADMIN && CURRENT_USER_ID) q = q.eq('agent_id', CURRENT_USER_ID);
    let { data, error } = await q.order('created_at', { ascending: false });
    if (error) {
      console.warn('[催单] 精简列查询失败 · 回退 select(*) ·', error.message);
      const r2 = await sb.from('orders').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      data = r2.data; error = r2.error;
      if (error) throw error;
    }

    // userId → agent name 映射
    const userIdToName = {};
    (CONFIG.agents || []).forEach(a => { if (a._userId) userIdToName[a._userId] = a.name; });

    // 转换所有行
    const all = (data || []).map(row => _toChaseOrder(row, userIdToName));
    // 全量 PO（绩效/历史统计用）—— 仅含 po_number 非空的
    ALL_PO_ORDERS = all.filter(o => o._isPO);
    // 仅"待催"的（未发货 + 未取消/驳回/到货）—— 含旧手动 + PO 派生
    CHASE_ORDERS = all.filter(o =>
      !['cancelled', 'rejected', 'arrived'].includes(o.status) &&
      !o.shippedDate
    );
    _chaseLastLoad = Date.now();
    _chaseLoadedOnce = true;
  } catch (e) {
    console.error('loadChaseOrders 失败:', e);
    CHASE_ORDERS = [];
    ALL_PO_ORDERS = [];
    throw e;
  }
}

// 把 orders 表的一行转换成催单页期望的结构（兼容 PO 派生 + 旧手动催单）
function _toChaseOrder(row, userIdToName) {
  const isPO = !!row.po_number;
  const itemTitles = (row.line_items || []).map(li => li.title_cn || li.title_en || li.sku).filter(Boolean);
  const product = row.product || (isPO ? itemTitles.join(' / ') : '') || '(无产品)';
  return {
    _id: row.id,
    _isPO: isPO,                       // true=PO 派生, false=旧手动催单
    _po: isPO ? row : null,            // 原始 PO 引用（仅 PO 派生有）
    _agent: userIdToName[row.agent_id] || row.creator_name || '未知',
    _agent_id: row.agent_id,
    orderNo: row.order_no || (isPO ? row.po_number : ''),  // V5 修复: 优先销售单号 K1141xx,自定义 PO 没有销售单号才用 PO 号
    site: row.site || '',
    product,
    supplier: row.supplier || '',
    status: row.status || (isPO ? 'producing' : 'pending'),
    orderDate: (row.order_date || row.created_at || '').slice(0, 10),
    promisedDate: row.promised_date,
    shippedDate: row.shipped_date,
    arrivedDate: row.arrived_date,
    nextFollow: row.next_follow,
    followups: row.followups || [],
    notes: row.notes || row.note || '',  // 兼容：旧用 notes，PO 用 note
    screenshots: row.screenshots || [],
    createdAt: row.created_at,
    totalAmount: parseFloat(row.total_amount) || 0,
    orderValue: parseFloat(row.order_value) || 0,   // V20260605:客单价(销售单金额·判高客单价用)
    orderCurrency: row.order_currency || '',
    lineItems: row.line_items || [],
    qty: (row.qty != null ? row.qty : null),          // V20260602:催单数量
    products: row.products || [],                     // V20260602:多选产品 [{spec,qty,image_url,sku}]
    poNumber: row.po_number,
    salesOrderId: row.sales_order_id,
    isExpress: !!row.is_express,   // V20260604:客户付运费/快速单(开PO时自动算 或 跟单手动标)
  };
}

// 计算下单距今天数 —— 优先用 orderDate（用户填的真实下单日期），回退到 createdAt（数据库插入时间）
function chaseDaysSince(o) {
  const ts = o.orderDate || o.createdAt;
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

// ============================================================
// 催单阈值 chip 渲染 - V5 激进版
// 支持: 3/7/10/14/21/30/60/自定义 + PO 派生独立 chip + AND 组合
// ============================================================
function renderChaseThresholdChips() {
  const el = document.getElementById('chaseThresholdChips');
  if (!el) return;
  // V20260603:首次进催单页 → 套用主管设的"默认待催阈值"(只一次,之后用户可自由点 chip 覆盖,含"全部")
  if (!_chaseDefaultApplied) {
    _chaseDefaultApplied = true;
    const def = (typeof DATA !== 'undefined' && DATA.getChaseDefaultDays) ? DATA.getChaseDefaultDays() : 0;
    if (def > 0) _chaseThresholdFilter = def;
  }
  const thresholds = (typeof DATA !== 'undefined' && DATA.getChaseThresholds) ? DATA.getChaseThresholds() : [3, 7, 10, 14, 21, 30, 60];
  const total = CHASE_ORDERS.length;
  const poCnt = CHASE_ORDERS.filter(o => o._isPO).length;
  const expressCnt = CHASE_ORDERS.filter(o => _chaseUrgentInfo(o).isUrgent).length;  // V20260605:加急单(运费/高价/多品)
  const manualCnt = total - poCnt;
  
  // V5-2026-05-24: 阈值 chip 的计数 - 如果"仅 PO 派生"开了,只算 PO 派生的(AND 组合下的实时计数)
  const baseSet = _onlyPoSource ? CHASE_ORDERS.filter(o => o._isPO) : CHASE_ORDERS;
  
  // 颜色递进: 天数越大颜色越深(红色梯度)
  function chipColor(days) {
    if (days === 0) return ''; // 全部默认色
    if (days <= 3)  return '#fbbf24';  // 黄
    if (days <= 7)  return '#f59e0b';  // 橙黄
    if (days <= 10) return '#ea580c';  // 橙
    if (days <= 14) return '#dc2626';  // 红
    if (days <= 21) return '#b91c1c';  // 深红
    if (days <= 30) return '#991b1b';  // 暗红
    return '#7f1d1d';                   // 60+ 极暗红
  }
  
  function renderChip(days, label, count) {
    const isActive = _chaseThresholdFilter === days;
    const color = chipColor(days);
    const baseStyle = isActive 
      ? `background:${color || '#7c3aed'}; color:white; border-color:${color || '#7c3aed'}; box-shadow:0 2px 8px ${color || '#7c3aed'}66, 0 0 0 3px ${color || '#7c3aed'}22; font-weight:600;`
      : days > 0 ? `border-left:3px solid ${color}; color:${color};` : '';
    return `<button class="rule-chip ${isActive ? 'active' : ''}" 
                    onclick="setChaseThreshold(${days})"
                    style="${baseStyle}"
                    title="${days === 0 ? '显示全部催单' : '下单超过 ' + days + ' 天的'}">
              ${days === 0 ? '📋 全部' : '⏰ ≥' + days + '天'} 
              <span class="cnt-mini" style="${isActive ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${count}</span>
            </button>`;
  }
  
  // 自定义天数 chip(如果当前值不在标准列表里,显示"自定义 N 天")
  const isCustom = _chaseThresholdFilter > 0 && !thresholds.includes(_chaseThresholdFilter);
  let customChipHtml = '';
  if (isCustom) {
    const cnt = baseSet.filter(o => chaseDaysSince(o) >= _chaseThresholdFilter).length;
    customChipHtml = `<button class="rule-chip active" onclick="setChaseThreshold(0)"
                              style="background:#7f1d1d; color:white; border-color:#7f1d1d; box-shadow:0 2px 8px #7f1d1d66, 0 0 0 3px #7f1d1d22; font-weight:600;"
                              title="自定义阈值,点击取消">
                        🎯 自定义 ≥${_chaseThresholdFilter}天 <span class="cnt-mini" style="background:rgba(255,255,255,0.25); color:white;">${cnt}</span>
                        <span style="margin-left:6px; opacity:0.7;">✕</span>
                      </button>`;
  }
  
  el.innerHTML = `
    <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600; min-width: 64px;">催单阈值:</span>
    ${renderChip(0, '全部', baseSet.length)}
    ${thresholds.map(d => renderChip(d, '≥' + d + '天', baseSet.filter(o => chaseDaysSince(o) >= d).length)).join('')}
    ${customChipHtml}
    <button class="rule-chip" onclick="openCustomThresholdInput()"
            title="输入自定义天数(如 45 天)"
            style="border-style:dashed; color:var(--text-secondary);">
      🎯 自定义...
    </button>
    
    <span style="margin-left:6px; height:18px; width:1px; background:var(--border);"></span>
    
    <button class="rule-chip po-only-chip ${_onlyPoSource ? 'active' : ''}" 
            onclick="toggleOnlyPoSource()" 
            title="只显示从销售单开 PO 派生过来的催单(线上订单)"
            style="${_onlyPoSource ? 'background:#7c3aed; color:white; border-color:#7c3aed; box-shadow:0 2px 8px #7c3aed66, 0 0 0 3px #7c3aed22; font-weight:600;' : 'border-left:3px solid #7c3aed; color:#7c3aed;'}">
      📦 仅 PO 派生 <span class="cnt-mini" style="${_onlyPoSource ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${poCnt}</span>
    </button>

    <button class="rule-chip ${_onlyExpress ? 'active' : ''}"
            onclick="toggleOnlyExpress()"
            title="只显示加急单:客户付运费 / 高客单价 / 多产品多SKU · 优先处理"
            style="${_onlyExpress ? 'background:#dc2626; color:white; border-color:#dc2626; box-shadow:0 2px 8px #dc262666, 0 0 0 3px #dc262622; font-weight:600;' : 'border-left:3px solid #dc2626; color:#dc2626;'}">
      🔥 仅加急单 <span class="cnt-mini" style="${_onlyExpress ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${expressCnt}</span>
    </button>
    
    <span style="margin-left:auto; font-size: 11px; color: var(--text-tertiary);">
      📦 PO 派生 <b style="color:#7c3aed;">${poCnt}</b> · 📝 手动 <b style="color:#d97706;">${manualCnt}</b>
    </span>
  `;
}

// V5: 打开自定义天数输入对话框
async function openCustomThresholdInput() {
  const v = await showPrompt({
    title: '🎯 自定义催单阈值',
    message: '显示"下单超过 N 天还没回"的催单。\n常用值:7 / 10 / 14 / 21 / 30 / 45 / 60 / 90',
    field: { 
      label: '天数(下单距今 ≥)', 
      value: '', 
      type: 'number',
      placeholder: '例:45'
    },
  });
  if (v === null) return;
  const days = parseInt(v, 10);
  if (!days || days < 1 || days > 999) {
    toast('请输入 1-999 之间的天数', 'warn');
    return;
  }
  setChaseThreshold(days);
}

function setChaseThreshold(days) {
  _chaseThresholdFilter = days;
  renderOrders();
}

// V5-2026-05-24: 切换"仅看 PO 派生"
function toggleOnlyPoSource() {
  _onlyPoSource = !_onlyPoSource;
  renderOrders();
}

// V20260605:综合加急判定(付运费 / 高客单价 / 多产品多SKU 任一)· 阈值实时读主管设置
function _chaseUrgentInfo(o) {
  const hv = (typeof DATA !== 'undefined' && DATA.getChaseHighValue) ? DATA.getChaseHighValue() : 2000;
  const mi = (typeof DATA !== 'undefined' && DATA.getChaseManyItems) ? DATA.getChaseManyItems() : 10;
  const items = o.lineItems || [];
  const skuCount = items.length;
  const totalQty = items.reduce((s, li) => s + (Number(li.quantity != null ? li.quantity : li.qty) || 0), 0);
  const isExpress   = !!o.isExpress;
  const isHighValue = (Number(o.orderValue) || 0) >= hv;
  const isManyItems = skuCount >= mi || totalQty >= mi;
  return { isExpress, isHighValue, isManyItems, isUrgent: isExpress || isHighValue || isManyItems, skuCount, totalQty };
}
window._chaseUrgentInfo = _chaseUrgentInfo;

// V20260604: 切换"仅看付运费/快速单"
function toggleOnlyExpress() {
  _onlyExpress = !_onlyExpress;
  renderOrders();
}
window.toggleOnlyExpress = toggleOnlyExpress;

// V20260604: 跟单手动把某单标为/取消"快速(付运费)"· 解决客户单独下运费订单那种自动抓不到的
async function chaseToggleExpress(id, ev) {
  if (ev) ev.stopPropagation();
  const o = CHASE_ORDERS.find(x => String(x._id) === String(id));
  if (!o) return;
  const next = !o.isExpress;
  try {
    const { error } = await sb.from('orders').update({ is_express: next, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    o.isExpress = next;
    toast(next ? '🚚 已标为快速单(优先催)' : '已取消快速标记');
    await loadChaseOrders(true);
    renderOrders();
  } catch (e) {
    console.error(e); toast('操作失败:' + (e.message || e), 'err');
  }
}
window.chaseToggleExpress = chaseToggleExpress;

// MODULE 1: 催单
// ============================================================
// V20260526e: 催单日期筛选 + 今日要催
let _ordersDatePreset = 'all';
let _ordersTodayChase = false;

function ordersOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        _ordersDatePreset = customPreset;
        const el = document.getElementById('oDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        renderOrders();
      });
    }
    return;
  }
  _ordersDatePreset = preset || 'all';
  renderOrders();
}

function ordersFilterTodayChase() {
  _ordersTodayChase = !_ordersTodayChase;
  const btn = document.getElementById('oTodayChase');
  if (btn) {
    btn.classList.toggle('primary', _ordersTodayChase);
    btn.classList.toggle('ghost', !_ordersTodayChase);
  }
  renderOrders();
  if (_ordersTodayChase && typeof toast === 'function') {
    toast('✓ 已切换到「今日要催」· 显示今天 nextFollow 到期的订单');
  }
}

// V20260526g: 催单视角切换 · 'list'(详细行) / 'grid'(图墙卡片)
let _ordersViewMode = (localStorage.getItem('orders_view_mode') || 'list');

function setOrdersViewMode(mode) {
  if (!['list', 'grid'].includes(mode)) return;
  _ordersViewMode = mode;
  localStorage.setItem('orders_view_mode', mode);
  document.querySelectorAll('#oViewToggle .o-view-btn').forEach(b => {
    const active = b.dataset.view === mode;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--bg-card)' : 'transparent';
    b.style.color = active ? 'var(--accent)' : 'var(--text-secondary)';
    b.style.fontWeight = active ? '600' : '400';
  });
  // 网格模式隐藏表头
  const header = document.getElementById('ordersListHeader');
  if (header) header.style.display = (mode === 'list') ? '' : 'none';
  renderOrders();
}

// V20260526g: 网格卡片渲染 · 借鉴售后/找灯
function _renderOrderCard(o, i) {
  const status = o.status || 'pending';
  const eff = (typeof getOrderEffStatus === 'function') ? getOrderEffStatus(o) : status;
  const statusMeta = {
    pending: { label: '待下采购', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
    producing: { label: '生产中', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
    shipped: { label: '已发货', color: '#2563eb', bg: 'rgba(37,99,235,0.15)' },
    arrived: { label: '已到货', color: '#16a34a', bg: 'rgba(22,163,74,0.15)' },
    cancelled: { label: '已取消', color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
    overdue: { label: '已逾期', color: '#dc2626', bg: 'rgba(220,38,38,0.2)' },
  }[eff] || { label: eff, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
  const isDone = ['arrived', 'cancelled'].includes(status);
  const days = (typeof chaseDaysSince === 'function') ? chaseDaysSince(o) : 0;
  
  // V20260526p: 紧急度分级 · 不同时间节点不同提醒颜色(用户需求)
  // 0-3 天:正常 / 3-7 天:warn 黄 / 7-15 天:danger 橙 / 15-30 天:critical 红 / 30+ 天:nuclear 暗红
  let urgentLevel = '';
  if (!isDone) {
    if (days >= 30)      urgentLevel = 'nuclear';     // 暗红 · 极严重
    else if (days >= 15) urgentLevel = 'critical';    // 红色 · 严重
    else if (days >= 7)  urgentLevel = 'danger';      // 橙色 · 警告
    else if (days >= 3)  urgentLevel = 'warn';        // 黄色 · 提醒
  }
  const urgent = urgentLevel !== '';
  
  // 收集图片(产品图 + 沟通截图)
  let productImages = (Array.isArray(o.products) && o.products.length) ? o.products.map(p => p.image_url).filter(Boolean) : [];
  if (productImages.length === 0) productImages = (typeof _getRelatedOrderImages === 'function') ? _getRelatedOrderImages(o.orderNo) : [];
  const fuScreenshots = (o.followups || []).flatMap(f => f.screenshots || []);
  const orderScreenshots = o.screenshots || [];
  // V20260602:去重 + 有产品图就只用产品图(不混入手动截图)· 避免"手动图 + 自动产品图"重复两张
  const _uniq = arr => [...new Set(arr.filter(Boolean))];
  const allImages = productImages.length > 0
    ? _uniq(productImages)
    : _uniq([...orderScreenshots, ...fuScreenshots]);
  
  // V20260526o: 多图布局 · 性能优化(lazy + async + 占位 · 解决滚动闪烁)
  // 优化点:
  // 1. loading="lazy" 让视口外图片不加载 → 减少同时请求数
  // 2. decoding="async" 异步解码 → 不阻塞滚动
  // 3. img 加 background 占位 → 加载时不留白
  // 4. onerror 兜底 → 失败显示占位符不破布局
  const _imgAttrs = 'loading="lazy" decoding="async" onerror="this.style.opacity=0.3;this.alt=\'❌\'"';
  const _imgStyle = 'background:var(--bg-elevated);';
  
  let coverHTML = '';
  let coverCls = '';
  const n = allImages.length;
  if (n === 0) {
    coverCls = 'cnt-0';
    coverHTML = '<div class="no-image">📋</div><div class="no-image-hint">无图</div>';
  } else if (n === 1) {
    coverCls = 'cnt-1';
    coverHTML = `<img src="${allImages[0]}" alt="订单图" ${_imgAttrs} style="${_imgStyle}">`;
  } else if (n === 2) {
    coverCls = 'cnt-2 multi';
    coverHTML = allImages.map(s => `<img src="${s}" ${_imgAttrs} style="${_imgStyle}">`).join('');
  } else if (n === 3) {
    coverCls = 'cnt-3 multi';
    coverHTML = allImages.map(s => `<img src="${s}" ${_imgAttrs} style="${_imgStyle}">`).join('');
  } else if (n === 4) {
    coverCls = 'cnt-4 multi';
    coverHTML = allImages.map(s => `<img src="${s}" ${_imgAttrs} style="${_imgStyle}">`).join('');
  } else {
    coverCls = 'cnt-many multi';
    const max = 9;
    if (n <= max) {
      coverHTML = allImages.map(s => `<img src="${s}" ${_imgAttrs} style="${_imgStyle}">`).join('');
    } else {
      coverHTML = allImages.slice(0, max - 1).map(s => `<img src="${s}" ${_imgAttrs} style="${_imgStyle}">`).join('');
      coverHTML += `<div class="more-overlay"><img src="${allImages[max - 1]}" ${_imgAttrs} style="${_imgStyle}"><span>+${n - (max - 1)}</span></div>`;
    }
  }
  
  const fuCount = (o.followups || []).length;
  const lastFu = fuCount > 0 ? o.followups[fuCount - 1] : null;
  
  // V20260526p: 紧急度文案 + 图标(分级显示)
  const urgentMeta = {
    warn:     { icon: '⏰', text: `${days}天`, label: '注意' },
    danger:   { icon: '⚠',  text: `${days}天`, label: '警告' },
    critical: { icon: '🔥', text: `${days}天`, label: '严重' },
    nuclear:  { icon: '🚨', text: `${days}天`, label: '紧急' },
  };
  const um = urgentMeta[urgentLevel] || null;
  
  return `
    <div class="as-card ${urgentLevel ? 'urgent urgent-' + urgentLevel : ''} ${isDone ? 'done' : ''}" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">
      <div class="cover ${coverCls}">
        ${coverHTML}
        <span class="status-badge" style="background:${statusMeta.bg}; color:${statusMeta.color};">${statusMeta.label}</span>
        ${um ? `<span class="urgent-badge urgent-badge-${urgentLevel}" title="${um.label} · 已超期 ${days} 天">${um.icon} ${um.text}</span>` : ''}
        ${o.promisedDate && !isDone ? `<span class="promised-badge">📅 ${escapeHtml(o.promisedDate)}</span>` : ''}
        ${fuCount > 0 ? `<span class="comments-badge">📞 ${fuCount}</span>` : ''}
        ${n > 0 ? `<span class="photo-count">📷 ${n}</span>` : ''}
      </div>
      <div class="body">
        <div class="order-no">${escapeHtml(o.orderNo || '(无 PO 号)')}</div>
        ${o.product ? `<div class="product">${escapeHtml(o.product)}</div>` : ''}
        ${o.supplier ? `<div class="reason" style="color:#0891b2;">🏭 ${escapeHtml(o.supplier)}</div>` : ''}
        ${lastFu ? `<div class="detail">最近沟通(${lastFu.date}): ${escapeHtml((lastFu.note || '').slice(0, 50))}${(lastFu.note || '').length > 50 ? '...' : ''}</div>` : '<div class="detail" style="color:var(--text-tertiary);">未沟通</div>'}
        <div class="meta">
          ${o.site ? `<span class="site">🌐 ${escapeHtml(o.site)}</span>` : ''}
          ${o.nextFollow ? `<span class="date" style="color:#dc2626;">⏰ 下次 ${escapeHtml(o.nextFollow)}</span>` : ''}
        </div>
        ${o.status !== 'arrived' ? `<button class="btn small" style="margin-top:8px;width:100%;font-size:12px;padding:5px;background:rgba(22,163,74,0.1);border-color:rgba(22,163,74,0.4);color:#16a34a;" title="${o.status === 'shipped' ? '已发货 → 已到货' : '标为已发货'}" onclick="event.stopPropagation(); quickCompleteOrder('${o._id}', '${escapeHtml(o._agent || '')}')">✓ ${o.status === 'shipped' ? '确认到货' : '标记发货'}</button>` : ''}
      </div>
    </div>
  `;
}

// V20260602:判断催单是否"空白草稿"(没填任何有效内容 · PO 派生的不算)
function _isOrderBlank(o) {
  if (!o || o._isPO) return false;
  const has = v => v != null && String(v).trim() !== '' && String(v).trim() !== '(无产品)' && String(v).trim() !== '(无产品描述)';
  if (has(o.orderNo) || has(o.product) || has(o.supplier) || has(o.notes)) return false;
  if ((o.products || []).length || (o.followups || []).length || (o.screenshots || []).length) return false;
  return true;
}

// 关闭催单弹窗:若是全空白草稿 → 自动软删(避免堆积空白)
function closeOrderModalSmart() {
  const o = (typeof currentOrder === 'function') ? currentOrder() : null;
  if (o && _isOrderBlank(o) && o._id && typeof sb !== 'undefined') {
    sb.from('orders').update({ deleted_at: new Date().toISOString(), deleted_by: (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : null) })
      .eq('id', o._id).then(() => {
        const idx = CHASE_ORDERS.findIndex(x => x._id === o._id);
        if (idx >= 0) CHASE_ORDERS.splice(idx, 1);
        if (typeof renderOrders === 'function') renderOrders();
      }).catch(e => console.warn('清空白草稿失败', e));
  }
  closeModal('orderModal');
}
window.closeOrderModalSmart = closeOrderModalSmart;

// 一键清理所有空白草稿(历史遗留 · 软删进回收站)
async function chaseCleanBlankOrders() {
  const blanks = (typeof CHASE_ORDERS !== 'undefined' ? CHASE_ORDERS : []).filter(o => _isOrderBlank(o));
  if (blanks.length === 0) { alert('没有空白草稿需要清理'); return; }
  if (!confirm(`发现 ${blanks.length} 条空白催单草稿(没填任何内容)。\n\n清理后移入回收站(30 天可恢复)。确定清理?`)) return;
  let done = 0;
  for (const o of blanks) {
    try {
      if (o._id && typeof sb !== 'undefined') {
        await sb.from('orders').update({ deleted_at: new Date().toISOString(), deleted_by: (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : null) }).eq('id', o._id);
      }
      const idx = CHASE_ORDERS.findIndex(x => x._id === o._id);
      if (idx >= 0) CHASE_ORDERS.splice(idx, 1);
      done++;
    } catch (e) { console.warn(e); }
  }
  if (typeof renderOrders === 'function') renderOrders();
  alert(`✅ 已清理 ${done} 条空白草稿(回收站可恢复)`);
}
window.chaseCleanBlankOrders = chaseCleanBlankOrders;

function renderOrders() {
  const body = document.getElementById('ordersBody');
  const card = document.getElementById('ordersCard');
  if (!body) return;

  // 渲染顶部阈值 chip
  renderChaseThresholdChips();
  
  // V20260526o: 关键修复 · 先填充日期 select(避免空列表时早 return 跳过)
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('oDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _ordersDatePreset || 'all');
  }

  const q = (document.getElementById('oSearch')?.value || '').trim().toLowerCase();
  const fStatus = document.getElementById('oFilterStatus')?.value || 'active';
  const fSupplier = document.getElementById('oFilterSupplier')?.value || '';
  const fSite = document.getElementById('oFilterSite')?.value || '';
  const sortBy = document.getElementById('oSortBy')?.value || 'order_no_asc';

  let list = CHASE_ORDERS.filter(o => {
    if (_isOrderBlank(o)) return false;  // V20260602:默认隐藏空白草稿(没填任何东西的)
    // V5-2026-05-24: "仅看 PO 派生" 过滤(与阈值 AND 组合)
    if (_onlyPoSource && !o._isPO) return false;
    // V20260605: 仅看加急单(付运费/高客单价/多产品多SKU)
    const _u = _chaseUrgentInfo(o);
    if (_onlyExpress && !_u.isUrgent) return false;
    // 阈值过滤 · 加急单用更激进的 freight 阈值(更早进催单)
    if (_chaseThresholdFilter > 0) {
      const _fd = (typeof DATA !== 'undefined' && DATA.getChaseFreightDays) ? DATA.getChaseFreightDays() : 3;
      const _eff = _u.isUrgent ? Math.min(_fd, _chaseThresholdFilter) : _chaseThresholdFilter;
      if (chaseDaysSince(o) < _eff) return false;
    }
    if (q) {
      const t = [o.orderNo, o.product, o.supplier, o.notes, o._agent, o.site].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fSupplier && o.supplier !== fSupplier) return false;
    if (fSite && o.site !== fSite) return false;
    if (fStatus === 'active') return !['cancelled', 'arrived'].includes(o.status);
    if (fStatus === 'completed') return ['arrived', 'cancelled'].includes(o.status);
    if (fStatus === 'overdue') return getOrderEffStatus(o) === 'overdue';
    if (fStatus === 'all') return true;
    return o.status === fStatus;
  });

  // V20260526e: 日期筛选(基于 orderDate / createdDate)
  if (_ordersDatePreset && _ordersDatePreset !== 'all' && typeof isDateInRange === 'function') {
    list = list.filter(o => isDateInRange(o.orderDate || o.createdDate || o.created_at, _ordersDatePreset));
  }
  // V20260526e: "今日要催"快捷 — 今天到 nextFollow 的(含已过的未做)
  if (_ordersTodayChase) {
    const today = new Date().toISOString().slice(0, 10);
    list = list.filter(o => o.nextFollow && o.nextFollow <= today && !['arrived', 'cancelled'].includes(o.status));
  }

  // V3 快速筛选模式叠加（来自统计卡片点击）
  if (_ordersQuickMode === 'thismonth_arrived') {
    // 注意：本月到货的 PO 通常已不在 CHASE_ORDERS（因为已 arrived 会被过滤掉）
    // 所以这里从 ALL_PO_ORDERS 取数据
    const thisMonth = new Date().toISOString().slice(0, 7);
    const arrivedThisMonth = (ALL_PO_ORDERS || []).filter(o =>
      o.status === 'arrived' && (o.arrivedDate || '').startsWith(thisMonth)
    );
    // 也包含旧手动催单中本月到货的
    const manualArrivedThisMonth = (typeof ORDERS !== 'undefined' ? ORDERS : []).filter(o =>
      !o.po_number && o.status === 'arrived' && (o.arrivedDate || '').startsWith(thisMonth)
    );
    list = [...arrivedThisMonth, ...manualArrivedThisMonth];
  } else if (_ordersQuickMode === 'overdue_or_today') {
    const today = new Date().toISOString().slice(0, 10);
    list = list.filter(o => {
      const isOverdue = getOrderEffStatus(o) === 'overdue';
      const isToday = o.nextFollow === today && !['cancelled','shipped','arrived'].includes(o.status);
      return isOverdue || isToday;
    });
  }
  
  // 排序
  if (sortBy === 'urgency') {
    list.sort((a, b) => {
      // V20260604:付运费/快速单永远置顶
      const _ua = _chaseUrgentInfo(a).isUrgent, _ub = _chaseUrgentInfo(b).isUrgent;
      if (_ua !== _ub) return _ua ? -1 : 1;   // V20260605:加急单(运费/高价/多品)置顶
      const sa = getOrderEffStatus(a), sb = getOrderEffStatus(b);
      const aIsCatch = !['cancelled','shipped','arrived'].includes(a.status);
      const bIsCatch = !['cancelled','shipped','arrived'].includes(b.status);
      if (aIsCatch !== bIsCatch) return aIsCatch ? -1 : 1;
      if (sa === 'overdue' && sb !== 'overdue') return -1;
      if (sb === 'overdue' && sa !== 'overdue') return 1;
      const da = a.nextFollow || a.promisedDate || '9999';
      const db = b.nextFollow || b.promisedDate || '9999';
      return da.localeCompare(db);
    });
  } else if (sortBy === 'order_no_asc') {
    // V20260615:按订单号统一排(手动+PO 不分开 · 去 #/空格归一化 · 自然数字 PL3531<PL3812)· 加急仍置顶
    list.sort((a, b) => {
      const _ua = _chaseUrgentInfo(a).isUrgent, _ub = _chaseUrgentInfo(b).isUrgent;
      if (_ua !== _ub) return _ua ? -1 : 1;
      const ka = String(a.orderNo || '').replace(/[#\s]/g, '');
      const kb = String(b.orderNo || '').replace(/[#\s]/g, '');
      return ka.localeCompare(kb, undefined, { numeric: true });
    });
  } else if (sortBy === 'order_no_desc') {
    list.sort((a, b) => {
      const _ua = _chaseUrgentInfo(a).isUrgent, _ub = _chaseUrgentInfo(b).isUrgent;
      if (_ua !== _ub) return _ua ? -1 : 1;
      const ka = String(a.orderNo || '').replace(/[#\s]/g, '');
      const kb = String(b.orderNo || '').replace(/[#\s]/g, '');
      return kb.localeCompare(ka, undefined, { numeric: true });
    });
  } else if (sortBy === 'order_date_desc') {
    list.sort((a, b) => (b.orderDate || '0000').localeCompare(a.orderDate || '0000'));
  }
  
  if (list.length === 0) {
    card.style.display = 'block';
    document.getElementById('ordersGroupedContainer')?.remove();
    const isEmpty = CHASE_ORDERS.length === 0;
    body.innerHTML = `<div class="empty-state"><div class="icon">📋</div><div class="text">${isEmpty ? '还没有催单（未发货的 PO 或手动催单都会在这里）' : '当前阈值或筛选下没有匹配的催单'}</div>${isEmpty ? '<button class="btn primary" onclick="addOrder()">+ 新增催单</button>' : ''}</div>`;
    return;
  }
  
  // 按供应商分组视图
  if (sortBy === 'supplier_grouped') {
    card.style.display = 'none';
    let groupedCt = document.getElementById('ordersGroupedContainer');
    if (!groupedCt) {
      groupedCt = document.createElement('div');
      groupedCt.id = 'ordersGroupedContainer';
      card.parentNode.insertBefore(groupedCt, card);
    }
    
    // 按供应商分组
    const grouped = {};
    list.forEach(o => {
      const s = o.supplier || '未填供应商';
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(o);
    });
    // 按订单数倒序
    const sortedSuppliers = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);
    
    groupedCt.innerHTML = sortedSuppliers.map(sup => {
      const items = grouped[sup];
      const canChase = items.filter(o => !['cancelled','shipped','arrived'].includes(o.status));
      const overdueCount = items.filter(o => getOrderEffStatus(o) === 'overdue').length;
      const allMine = !IS_ADMIN; // 主管视角下不显示批量催单（因为可能跨多个跟单员）
      const totalChase = canChase.reduce((s, o) => s + (o.followups || []).filter(f => f.type === 'chase').length, 0);
      // V28δ:分组视图也尊重网格/列表切换 · 不再硬编码 renderOrderRow
      const renderFn = (_ordersViewMode === 'grid') ? _renderOrderCard : renderOrderRow;
      const bodyHtml = (_ordersViewMode === 'grid')
        ? `<div class="as-grid" style="padding:10px;">${items.map((o, i) => renderFn(o, i)).join('')}</div>`
        : items.map((o, i) => renderFn(o, i)).join('');
      return `
        <div class="supplier-group">
          <div class="supplier-group-head">
            <div class="name">🏭 ${escapeHtml(sup)}
              <span class="count-badge">${items.length} 单</span>
              ${overdueCount > 0 ? `<span class="overdue-badge">🔴 ${overdueCount} 逾期</span>` : ''}
              ${canChase.length > 0 ? `<span class="count-badge" style="background: rgba(202,138,4,0.1); color: var(--warning);">${canChase.length} 待催</span>` : ''}
              ${totalChase > 0 ? `<span class="count-badge" style="background: rgba(190,24,93,0.1); color: var(--pink);">累计催 ${totalChase} 次</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              ${canChase.length > 0 ? `<button class="export-accounting-btn" onclick="exportSupplierAccounting('${sup.replace(/'/g, "\\'")}')" title="生成对账单 Excel 发给供应商">📋 导出对账单</button>` : ''}
              ${canChase.length > 0 && allMine ? `<button class="batch-chase-btn" onclick="openBatchChase('${sup.replace(/'/g, "\\'")}')">⚡ 批量催单</button>` : ''}
            </div>
          </div>
          <div class="supplier-group-body">
            ${bodyHtml}
          </div>
        </div>
      `;
    }).join('');
    return;
  }
  
  // 普通列表视图
  document.getElementById('ordersGroupedContainer')?.remove();
  card.style.display = 'block';
  
  // V4-2026-05-24: 把筛选+排序后的完整列表挂到全局,供导出函数读取
  window._lastVisibleOrders = list;
  
  // V4-2026-05-24: 分页 - 默认 50/页,localStorage 记住偏好
  if (typeof _ordersPage === 'undefined') {
    window._ordersPage = {
      size: parseInt(localStorage.getItem('orders_page_size') || '50', 10),
      current: 1,
    };
  }
  // 确保 size 合法
  if (![50, 100].includes(_ordersPage.size)) _ordersPage.size = 50;
  
  const totalPages = Math.max(1, Math.ceil(list.length / _ordersPage.size));
  // 切换数据后 current 越界 → 复位到第 1 页
  if (_ordersPage.current > totalPages) _ordersPage.current = 1;
  
  // 取当前页数据
  const startIdx = (_ordersPage.current - 1) * _ordersPage.size;
  const pageItems = list.slice(startIdx, startIdx + _ordersPage.size);
  
  // 生成分页栏(顶 + 底)
  const paginationHtml = renderPaginationBar({
    total: list.length,
    currentPage: _ordersPage.current,
    pageSize: _ordersPage.size,
    onPageChange: 'setOrdersPage(__PAGE__)',
    onSizeChange: 'setOrdersPageSize(__SIZE__)',
  });
  
  // V20260526g: 根据 view mode 切换渲染函数
  const renderFn = (_ordersViewMode === 'grid') ? _renderOrderCard : renderOrderRow;
  const itemsHtml = pageItems.map((o, i) => renderFn(o, startIdx + i)).join('');
  const wrappedHtml = (_ordersViewMode === 'grid')
    ? `<div class="as-grid">${itemsHtml}</div>`
    : itemsHtml;
  
  body.innerHTML = (list.length > _ordersPage.size ? paginationHtml : '') + 
                   wrappedHtml +
                   (list.length > _ordersPage.size ? paginationHtml : '');
  // V20260526e: 填充日期筛选下拉
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('oDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _ordersDatePreset || 'all');
  }
}

// V4-2026-05-24: 催单分页控制函数
function setOrdersPage(newPage) {
  if (typeof _ordersPage === 'undefined') window._ordersPage = { size: 50, current: 1 };
  _ordersPage.current = newPage;
  renderOrders();
  // 滚到顶部
  setTimeout(() => {
    document.getElementById('ordersCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function setOrdersPageSize(newSize) {
  const size = parseInt(newSize, 10);
  if (![50, 100].includes(size)) return;
  if (typeof _ordersPage === 'undefined') window._ordersPage = { size: 50, current: 1 };
  _ordersPage.size = size;
  _ordersPage.current = 1;
  localStorage.setItem('orders_page_size', String(size));
  renderOrders();
}

function renderOrderRow(o, i) {
  const eff = getOrderEffStatus(o);
  const fuCount = (o.followups || []).length;
  const chaseList = (o.followups || []).filter(f => f.type === 'chase');
  const chaseCount = chaseList.length;
  
  // V4：图片拼装策略 — 跟单上传的图 vs 产品图，分开显示
  // ① 跟单催单时上传的沟通截图（→ 右侧"截图"列：显示催单进度）
  const manualScreenshots = [...(o.screenshots || []), ...((o.followups || []).flatMap(f => f.screenshots || []))];
  // ② 产品图：从 PO line_items 或销售单反查（→ 左侧"状态"列下方：显示产品长啥样）
  let productImages = (Array.isArray(o.products) && o.products.length) ? o.products.map(p => p.image_url).filter(Boolean) : [];
  if (productImages.length === 0 && o._isPO && o.lineItems && o.lineItems.length > 0) {
    productImages = o.lineItems.map(li => li.image_url || li.image || '').filter(Boolean);
    // 如果 line_items 没存图，按 SKU 反查
    if (productImages.length === 0 && typeof _getRelatedOrderImages === 'function') {
      const skus = o.lineItems.map(li => li.sku).filter(Boolean);
      const map = (typeof SHOPIFY !== 'undefined' && SHOPIFY._productMap) ? SHOPIFY._productMap : {};
      productImages = skus.map(sku => {
        if (map[sku]?.image_url) return map[sku].image_url;
        if (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.effectiveBySku) {
          const p = PRODUCTS_CACHE.effectiveBySku(sku);
          if (p && p.image_url) return p.image_url;
        }
        return '';
      }).filter(Boolean);
    }
  } else if (productImages.length === 0 && !o._isPO && o.orderNo && typeof _getRelatedOrderImages === 'function') {
    productImages = _getRelatedOrderImages(o.orderNo);
  }
  // V4-2026-05-24：产品图反查不到时 → 兜底用跟单上传的沟通截图
  // 让 # 列大图位永远有内容可看（"一眼识货"的体验不被未填产品破坏）
  let productImageSource = 'product';  // 'product' = 来自产品库 | 'manual' = 来自沟通截图兜底
  if (productImages.length === 0 && manualScreenshots.length > 0) {
    productImages = manualScreenshots.slice(0, 4);
    productImageSource = 'manual';
  }
  const hasChaseSnapshots = manualScreenshots.length > 0;  // 用于区分"已催过"vs"新派生"
  
  const promisedCls = getDateClass(o.promisedDate);
  const related = hasRelatedAftersales(o);
  const siteBadge = o.site ? `<span class="site-badge s-${o.site}">${escapeHtml(o.site)}</span>` : '';
  const afterBadge = related && related.length > 0 ? `<span class="related-after-badge" title="该订单有 ${related.length} 个未解决的售后单">🔧 售后${related.length}</span>` : '';
  // V3 PO 派生标识 vs 旧手动催单
  const poBadge = o._isPO 
    ? `<span class="site-badge" style="background: rgba(124,58,237,0.12); color: #7c3aed; border: 1px solid rgba(124,58,237,0.3);" title="数据来自采购单 PO">📦 PO</span>`
    : `<span class="site-badge" style="background: rgba(245,158,11,0.12); color: #d97706; border: 1px solid rgba(245,158,11,0.3);" title="手动录入的旧催单（建议未来用 PO 流程）">📝 手动</span>`;
  const amountBadge = (o._isPO && o.totalAmount > 0) ? `<span class="site-badge" style="background: rgba(16,185,129,0.10); color: #059669; border: 1px solid rgba(16,185,129,0.3);">¥${o.totalAmount.toLocaleString('zh-CN', {maximumFractionDigits: 0})}</span>` : '';
  // V20260604:付运费/快速单徽章 · 本身即手动开关(已标=红实心"快速·优先" / 未标=虚线"标快速"可点)
  const expressBadge = `<span class="site-badge" onclick="chaseToggleExpress('${o._id}', event)" title="客户付运费的快速单需优先催 · 点击切换标记" style="cursor:pointer; ${o.isExpress ? 'background:#dc2626; color:#fff; border:1px solid #dc2626; font-weight:700;' : 'background:rgba(220,38,38,0.06); color:#dc2626; border:1px dashed rgba(220,38,38,0.45);'}">${o.isExpress ? '🚚 快速·优先' : '🚚 标快速'}</span>`;
  // V20260605:高客单价 / 多产品多SKU 加急徽章(自动判定)
  const _urg = _chaseUrgentInfo(o);
  const highValueBadge = _urg.isHighValue ? `<span class="site-badge" title="高客单价订单 · 优先催(避免大额退款)" style="background:#fef3c7; color:#b45309; border:1px solid #fcd34d; font-weight:700;">💰 高客价 ${o.orderCurrency || ''}${Math.round(o.orderValue).toLocaleString()}</span>` : '';
  const manyItemsBadge = _urg.isManyItems ? `<span class="site-badge" title="多产品/多SKU 订单(${_urg.skuCount} SKU · ${_urg.totalQty} 件)· 优先催" style="background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe; font-weight:700;">📦 多品 ${_urg.skuCount}SKU</span>` : '';
  
  // 已 N 天（下单至今）—— V3 用阈值高亮：超过最大阈值标红，超过最小阈值标黄
  const days = chaseDaysSince(o);
  const thresholds = (typeof DATA !== 'undefined' && DATA.getChaseThresholds) ? DATA.getChaseThresholds() : [3, 7, 10, 14, 21, 30, 60];
  const maxTh = thresholds[thresholds.length - 1] || 30;
  const minTh = thresholds[0] || 3;
  let daysCls = '';
  if (days >= maxTh) daysCls = 'crit';
  else if (days >= minTh) daysCls = 'warn';
  const daysHtml = days > 0 ? `<div class="days-ago ${daysCls}">${days}天</div>` : '';
  
  // V4：右侧"截图"列 → 只展示跟单上传的沟通截图（催单进度可视化）
  let thumbsHtml;
  if (manualScreenshots.length === 0) {
    thumbsHtml = '<span class="no-img">无沟通图</span>';
  } else {
    const main = manualScreenshots[0];
    const rest = manualScreenshots.slice(1, 4);
    const totalRemain = manualScreenshots.length - 1 - rest.length;
    const countBadge = manualScreenshots.length > 1
      ? `<span style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.7); color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; line-height:1.4; pointer-events:none;">📷 ${manualScreenshots.length}</span>`
      : '';
    const sourceBadge = `<span style="position:absolute; top:2px; left:2px; background:rgba(37,99,235,0.92); color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; line-height:1.4; pointer-events:none;">✓ 已催</span>`;
    const galleryData = JSON.stringify(manualScreenshots).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
    thumbsHtml = `
      <div style="display:flex; gap:4px; align-items:flex-start;">
        <div style="position:relative; width:90px; height:90px; flex-shrink:0; cursor:pointer; border-radius:6px; overflow:hidden; border:1px solid var(--border); background: var(--bg-elevated);" 
             onclick="event.stopPropagation(); viewImageGallery('${galleryData}', 0)">
          <img src="${main}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy" 
               onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--text-tertiary);font-size:11px;&quot;>加载失败</div>'">
          ${sourceBadge}
          ${countBadge}
        </div>
        ${rest.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:3px;">
            ${rest.map((s, idx) => `
              <img src="${s}" style="width:28px; height:28px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid var(--border); flex-shrink:0;" 
                   loading="lazy"
                   onclick="event.stopPropagation(); viewImageGallery('${galleryData}', ${idx + 1})"
                   onerror="this.style.display='none'">
            `).join('')}
            ${totalRemain > 0 ? `<span style="font-size:10px; color:var(--text-tertiary); width:28px; text-align:center; line-height:1.2;">+${totalRemain}</span>` : ''}
          </div>` : ''}
      </div>
    `;
  }
  
  // V4-2026-05-24：左侧"#列"内 → 紧贴行号下方显示产品大图（一眼识别产品）
  // 改动点：从状态徽章下方移到 # 列内；无图也显示灰色占位；hover 自动放大
  // 角标语义：紫色"产品"（来自产品库标准图）/ 蓝色"实拍"（兜底用沟通截图）
  let productImageHtml = '';
  if (productImages.length > 0) {
    const main = productImages[0];
    const restCount = productImages.length - 1;
    const galleryData = JSON.stringify(productImages).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
    const sourceCls = productImageSource === 'manual' ? 'src-manual' : 'src-product';
    productImageHtml = `
      <div class="row-prod-thumb has-img ${sourceCls}" 
           onclick="event.stopPropagation(); viewImageGallery('${galleryData}', 0)"
           title="${productImageSource === 'manual' ? '实拍/沟通图' : '产品图'}｜点击查看大图${restCount > 0 ? `（共 ${productImages.length} 张）` : ''}｜悬停自动放大">
        <img src="${main}" loading="lazy"
             onerror="this.style.display='none'; this.parentElement.classList.add('img-err'); this.parentElement.innerHTML='<div class=&quot;row-prod-fallback&quot;>📷</div>'">
        ${restCount > 0 ? `<span class="row-prod-badge-count">+${restCount}</span>` : ''}
      </div>
    `;
  } else {
    // V4-2026-05-24：无任何图也显示占位（保持 # 列宽度一致 + 视觉对齐）
    productImageHtml = `<div class="row-prod-thumb no-img" title="该催单暂无关联产品图/沟通图"><span class="row-prod-fallback">📷</span></div>`;
  }
  
  // 催单历史框：展示每次催单的日期 + 最近一次的备注
  let chaseBoxHtml = '';
  if (chaseCount > 0) {
    const lastChase = chaseList[chaseList.length - 1];
    const chaseDates = chaseList.map(c => formatShortDate(c.date)).join(' · ');
    const chaseLevelCls = chaseCount >= 5 ? 'critical' : chaseCount >= 3 ? 'warning' : '';
    chaseBoxHtml = `
      <div class="chase-history ${chaseLevelCls}">
        <div class="chase-counts">🔥 已催 <b>${chaseCount}</b> 次 · ${chaseDates}</div>
        ${lastChase && lastChase.note ? `<div class="chase-last">📞 ${formatShortDate(lastChase.date)}: ${escapeHtml((lastChase.note || '').slice(0, 70))}${(lastChase.note || '').length > 70 ? '...' : ''}</div>` : ''}
      </div>
    `;
  }
  
  // 备注框
  const notesHtml = o.notes ? `<div class="detail-line">📝 ${escapeHtml(o.notes.slice(0, 80))}${o.notes.length > 80 ? '...' : ''}</div>` : '';
  
  // 日期：下单 / 承诺 / 下次 / 发货 / 到货
  const datesHtml = `
    ${o.orderDate ? `<div class="date-line"><span class="lbl">📅 下单</span>${formatShortDate(o.orderDate)}</div>` : ''}
    ${o.promisedDate ? `<div class="date-line ${promisedCls}"><span class="lbl">⏰ 承诺</span>${formatShortDate(o.promisedDate)}${eff === 'overdue' ? ' ⚠' : ''}</div>` : ''}
    ${o.nextFollow ? `<div class="date-line"><span class="lbl">📞 下次</span>${formatShortDate(o.nextFollow)}</div>` : ''}
    ${o.shippedDate ? `<div class="date-line"><span class="lbl resolved">📦 发货</span>${formatShortDate(o.shippedDate)}</div>` : ''}
    ${o.arrivedDate ? `<div class="date-line"><span class="lbl resolved">✓ 到货</span>${formatShortDate(o.arrivedDate)}</div>` : ''}
  `;
  
  return `
    <div class="record-row after-row s-${eff}">
      <div class="row-num row-num-with-thumb">
        <span class="row-num-idx">${i + 1}</span>
        ${productImageHtml}
        ${IS_ADMIN && o._agent ? `<div style="font-size:9px;color:var(--text-tertiary);" title="${escapeHtml(window.getAgentDisplay ? window.getAgentDisplay(o._agent) : o._agent)}">${escapeHtml(o._agent.slice(0,2))}</div>` : ''}
        ${daysHtml}
      </div>
      <div onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')" style="cursor:pointer;"><span class="status-pill s-${eff}">${ORDER_STATUS_LABELS[o.status] || '未知'}${eff === 'overdue' ? ' ⚠' : ''}</span></div>
      <div class="cell-main" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')" style="cursor:pointer;">
        <div class="order-line">
          <span class="order-no-big">${escapeHtml(o.orderNo || '⚠ 待填订单号')}</span>
          ${poBadge}
          ${expressBadge}
          ${highValueBadge}
          ${manyItemsBadge}
          ${siteBadge}
          ${amountBadge}
          ${afterBadge}
        </div>
        <div class="product-line">📦 ${escapeHtml(o.product || '未填产品')}</div>
        <div class="supplier-line">🏭 ${escapeHtml(o.supplier || '未填供应商')}</div>
        ${notesHtml}
        ${chaseBoxHtml}
      </div>
      <div class="thumbs-cell">${thumbsHtml}</div>
      <div class="dates-cell">${datesHtml || '<span class="no-img">—</span>'}</div>
      <div class="row-actions">
        ${o.status !== 'arrived' ? `<button class="action-btn done" title="一键完成（${o.status === 'shipped' ? '已发货 → 已到货' : '标为已发货'}）" onclick="event.stopPropagation(); quickCompleteOrder('${o._id}', '${escapeHtml(o._agent || '')}')">✓</button>` : '<span style="width: 28px;"></span>'}
        <button class="followup-btn ${fuCount > 0 ? 'has-followups' : ''}" onclick="event.stopPropagation(); openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">${fuCount > 0 ? `📋${fuCount}` : '📋'}</button>
        <button class="action-btn delete" title="删除" onclick="event.stopPropagation(); delOrderRow('${o._id}', '${escapeHtml(o._agent || '')}')">🗑</button>
      </div>
    </div>
  `;
}

async function addOrder() {
  // V3 合并显示：让用户选两种入口
  const goPo = confirm(
    '催单数据有两种来源：\n\n' +
    '📦 推荐：去「采购单(PO)」tab 创建 PO，自动出现在催单\n' +
    '📝 兼容：直接新增「手动催单」（不走 PO 的临时催单）\n\n' +
    '· 点「确定」→ 去采购单 tab\n' +
    '· 点「取消」→ 新增手动催单'
  );
  
  if (goPo) {
    switchTab('po');
    return;
  }
  
  // 手动催单：直接在 orders 表插一条 po_number 为 NULL 的记录
  const me = CONFIG.agents.find(a => a.name === CURRENT_AGENT);
  const defaultSite = (me && me.sites && me.sites.length > 0) ? me.sites[0] : '';
  const newRow = {
    agent_id: CURRENT_USER_ID,
    order_no: '',
    site: defaultSite,
    product: '',
    supplier: '',
    status: 'producing',
    order_date: new Date().toISOString().slice(0, 10),
    notes: '',
    screenshots: [],
    followups: [],
  };
  try {
    const { data, error } = await sb.from('orders').insert(newRow).select().single();
    if (error) throw error;
    toast('✓ 已新增手动催单，请补充信息');
    await loadChaseOrders(true);
    renderOrders(); refreshOrdersFb(); updateOrderStats();
    // 自动打开 modal
    openOrderModal(data.id, CURRENT_AGENT);
  } catch (err) {
    console.error('新增手动催单失败:', err);
    toast('新增失败：' + (err.message || err), 'err');
  }
}

// ============================================================
// 快捷筛选：点击统计卡片自动切到对应状态
// ============================================================
function quickFilterOrders(type) {
  const filter = document.getElementById('oFilterStatus');
  if (!filter) return;

  // 先清除上次的快速模式
  _ordersQuickMode = '';

  if (type === 'arrived') {
    // 本月到货：限定本月（从 ALL_PO_ORDERS 取，因为已 arrived 不在 CHASE_ORDERS 里）
    filter.value = 'completed';
    _ordersQuickMode = 'thismonth_arrived';
    renderOrders();
    toast('已筛选：本月到货的订单');
    return;
  }
  if (type === 'overdue') {
    // 逾期或今日要催
    filter.value = 'active';
    _ordersQuickMode = 'overdue_or_today';
    renderOrders();
    toast('已筛选：逾期或今日要催');
    return;
  }
  // 常规切换：清除快速模式
  filter.value = type;
  renderOrders();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickFilterAfter(type) {
  const filter = document.getElementById('asFilterStatus');
  if (!filter) return;

  // 先清除上次的快速模式
  _aftersalesQuickMode = '';

  if (type === 'thismonth') {
    filter.value = 'all';
    _aftersalesQuickMode = 'thismonth';
    renderAftersales();
    toast('已筛选：本月新增的售后');
    return;
  }
  if (type === 'today') {
    filter.value = 'all';
    _aftersalesQuickMode = 'today';
    renderAftersales();
    toast('已筛选：今天新增的售后');
    return;
  }
  if (type === 'overdue') {
    filter.value = 'active';
    _aftersalesQuickMode = 'overdue';
    renderAftersales();
    toast('已筛选：逾期未跟进');
    return;
  }
  // 常规状态切换：清除快速模式
  filter.value = type;
  renderAftersales();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickFilterIssues(type) {
  const filter = document.getElementById('isFilterStatus');
  if (!filter) return;

  // 先清除快速模式
  _issuesQuickMode = '';

  if (type === 'stuck') {
    // 沟通 ≥ 3 次的未解决
    filter.value = 'active';
    _issuesQuickMode = 'stuck';
    renderIssues();
    toast('已筛选：沟通 3 次以上的问题');
    return;
  }
  filter.value = type;
  renderIssues();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickFilterMissing(type) {
  const filter = document.getElementById('mFilterStatus');
  const searchBox = document.getElementById('mSearch');
  if (!filter || !searchBox) return;

  // 先清除快速模式
  _missingQuickMode = '';

  if (type === 'mine') {
    filter.value = 'all';
    searchBox.value = '';
    _missingQuickMode = 'mine';
    renderMissing();
    toast('已筛选：我发起的找灯任务');
    return;
  }
  if (type === 'thismonth') {
    filter.value = 'all';
    searchBox.value = '';
    _missingQuickMode = 'thismonth';
    renderMissing();
    toast('已筛选：本月新增的找灯任务');
    return;
  }
  searchBox.value = '';
  filter.value = type;
  renderMissing();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickGotoPerfDetail(type) {
  if (type === 'leaderboard') {
    // 滚动到团队排行榜
    const el = document.getElementById('perfLeaderboard');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('查看团队排行榜');
    }
    return;
  }
  if (type === 'missing') {
    // 滚动到找灯贡献明细
    const el = document.getElementById('perfMissingDetail');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('查看我的找灯贡献明细');
    }
    return;
  }
  if (type === 'orders') {
    switchTab('orders');
    setTimeout(() => {
      const search = document.getElementById('oSearch');
      const filter = document.getElementById('oFilterStatus');
      if (search && IS_ADMIN) search.value = CURRENT_AGENT;  // 主管视角下筛选自己
      if (filter) filter.value = 'active';
      renderOrders();
    }, 50);
    toast('查看我的订单');
    return;
  }
  if (type === 'aftersales') {
    switchTab('aftersales');
    setTimeout(() => {
      const search = document.getElementById('asSearch');
      const filter = document.getElementById('asFilterStatus');
      if (search && IS_ADMIN) search.value = CURRENT_AGENT;
      if (filter) filter.value = 'all';
      renderAftersales();
    }, 50);
    toast('查看我的售后');
    return;
  }
  if (type === 'issues') {
    switchTab('issues');
    setTimeout(() => {
      const search = document.getElementById('isSearch');
      const filter = document.getElementById('isFilterStatus');
      if (search && IS_ADMIN) search.value = CURRENT_AGENT;
      if (filter) filter.value = 'all';
      renderIssues();
    }, 50);
    toast('查看我的问题');
    return;
  }
}

async function quickCompleteOrder(id, agent) {
  const o = CHASE_ORDERS.find(x => x._id === id);
  if (!o) { toast('找不到该催单记录', 'err'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const noun = o._isPO ? '采购单' : '订单';

  if (o.status === 'arrived') {
    toast('该订单已是「已到货」状态', 'warn');
    return;
  }

  let nextStatus, dateCol, dateField, nextLabel, msg;
  if (o.status === 'shipped') {
    nextStatus = 'arrived';
    dateCol = 'arrived_date';
    dateField = 'arrivedDate';
    nextLabel = '已到货';
    msg = `${noun} ${o.orderNo} 已经收到货？\n\n会标记为：✓ 已到货\n到货日期：${today}`;
  } else {
    nextStatus = 'shipped';
    dateCol = 'shipped_date';
    dateField = 'shippedDate';
    nextLabel = '已发货';
    msg = `${noun} ${o.orderNo} 已经发货？\n\n会标记为：✓ 已发货\n发货日期：${today}\n\n(发货后该单会自动从催单列表移除)`;
  }

  if (!confirm(msg)) return;

  // 直接 update orders 表（两类数据都在同一张表）
  const updates = { status: nextStatus, updated_at: new Date().toISOString() };
  if (!o[dateField]) updates[dateCol] = today;

  try {
    const { error } = await sb.from('orders').update(updates).eq('id', o._id);
    if (error) throw error;
    toast(`✓ 已标记「${nextLabel}」`);
    await loadChaseOrders(true);
    renderOrders(); refreshOrdersFb(); renderUrgentBanner(); updateOrderStats();
  } catch (err) {
    console.error('更新订单失败:', err);
    toast('操作失败：' + (err.message || err), 'err');
  }
}

function delOrderRow(id, agent) {
  const o = CHASE_ORDERS.find(x => x._id === id);
  if (!o) return;
  
  if (o._isPO) {
    // PO 派生：不能在催单页删，跳到 PO 模块
    const choice = confirm(
      `这是采购单 ${o.orderNo}，不能在催单页直接删除。\n\n` +
      `要"删除"该催单，请去「📦 采购单」tab 把 PO 状态改为「已取消」。\n\n` +
      `· 确定 → 现在去采购单 tab\n· 取消 → 留在本页`
    );
    if (choice) switchTab('po');
  } else {
    // 旧手动催单：软删除（标 deleted_at，回收站可恢复）
    if (!confirm('确定删除这个订单？\n\n（删除后会进回收站，30 天内可恢复）')) return;
    sb.from('orders').update({
      deleted_at: new Date().toISOString(),
      deleted_by: CURRENT_AGENT,
    }).eq('id', o._id).then(async ({ error }) => {
      if (error) { toast('删除失败：' + error.message, 'err'); return; }
      await loadChaseOrders(true);
      renderOrders(); updateOrderStats(); refreshOrdersFb();
      toast('已移入回收站');
    });
  }
}

function openOrderModal(id, agent) {
  // V3 改造：从 CHASE_ORDERS 找记录（PO 派生）
  const o = CHASE_ORDERS.find(x => x._id === id);
  if (!o) { toast('找不到该催单记录', 'err'); return; }

  _currentItemId = id;
  _currentItemType = 'order';
  _newScreenshots_fu = [];
  _newScreenshots_orig = [];
  _currentFuType = 'chase';
  window._currentItemAgent = o._agent;

  refreshSiteDropdowns();
  document.getElementById('omSite').value = o.site || '';
  document.getElementById('omOrderNo').value = o.orderNo || '';
  document.getElementById('omProduct').value = o.product || '';
  const _omQtyEl = document.getElementById('omQty'); if (_omQtyEl) _omQtyEl.value = (o.qty != null ? o.qty : '');
  document.getElementById('omSupplier').value = o.supplier || '';
  document.getElementById('omNotes').value = o.notes || '';
  document.getElementById('omOrderDate').value = o.orderDate || '';
  if (typeof _omUpdateOrderDateHint === 'function') _omUpdateOrderDateHint();
  document.getElementById('omPromisedDate').value = o.promisedDate || '';
  document.getElementById('omNextFollow').value = o.nextFollow || '';
  document.getElementById('omNewDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('omNewNote').value = '';
  document.getElementById('omFuThumbs').innerHTML = '';
  document.querySelectorAll('#omTypeRow .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === 'chase'));
  updateOrderNoHint('omSite', 'omOrderNo', 'omOrderNoHint');
  // PO 派生 → 编号和下单日期不可改；旧手动催单 → 可改
  const orderNoInput = document.getElementById('omOrderNo');
  const orderDateInput = document.getElementById('omOrderDate');
  if (o._isPO) {
    if (orderNoInput) { orderNoInput.readOnly = true; orderNoInput.title = 'PO 编号不可修改（由系统自动生成）'; orderNoInput.style.opacity = '0.7'; orderNoInput.style.cursor = 'not-allowed'; }
    if (orderDateInput) { orderDateInput.readOnly = true; orderDateInput.title = 'PO 下单日期不可修改（采用 PO 创建时间）'; orderDateInput.style.opacity = '0.7'; orderDateInput.style.cursor = 'not-allowed'; }
  } else {
    if (orderNoInput) { orderNoInput.readOnly = false; orderNoInput.removeAttribute('title'); orderNoInput.style.opacity = ''; orderNoInput.style.cursor = ''; }
    if (orderDateInput) { orderDateInput.readOnly = false; orderDateInput.removeAttribute('title'); orderDateInput.style.opacity = ''; orderDateInput.style.cursor = ''; }
  }

  renderOrderModalContent();
  document.getElementById('orderModal').classList.add('show');
  // V20260602:打开即自动抓取原始订单产品(先 PO 后销售单 · 过滤保险)
  if (typeof omAutoFetchProducts === 'function') omAutoFetchProducts();
  if (typeof omRenderProductLines === 'function') omRenderProductLines();
}

function renderOrderModalContent() {
  const o = currentOrder();
  if (!o) return;
  const eff = getOrderEffStatus(o);
  // V5-2026-05-24: 同时显示销售单号 + PO 号(如果是 PO 派生)
  const poBadge = o._isPO && o.poNumber && o.poNumber !== o.orderNo 
    ? `<span style="font-size:12px;background:rgba(37,99,235,0.1);color:var(--accent);padding:3px 10px;border-radius:5px;font-weight:600;font-family:monospace;margin-left:6px;" title="采购单号">📋 ${escapeHtml(o.poNumber)}</span>` 
    : '';
  document.getElementById('omHeader').innerHTML = `
    <div class="top">
      <div class="order-no">${escapeHtml(o.orderNo || '(未填订单号)')}</div>
      ${poBadge}
      ${IS_ADMIN && window._currentItemAgent ? `<span style="font-size:11px;background:rgba(124,58,237,0.1);color:var(--purple);padding:2px 8px;border-radius:4px;font-weight:600;">👤 ${escapeHtml(window._currentItemAgent)}</span>` : ''}
      <div class="top-status"><span class="status-pill s-${eff}" style="display:inline-flex;padding:5px 12px;">${ORDER_STATUS_LABELS[o.status]}${eff === 'overdue' ? ' ⚠ 已逾期' : ''}</span></div>
    </div>
    <div class="meta">
      ${o.product ? `<span>📦 ${escapeHtml(o.product)}</span>` : ''}
      ${o.supplier ? `<span>🏭 ${escapeHtml(o.supplier)}</span>` : ''}
      ${o.notes ? `<span>📝 ${escapeHtml(o.notes)}</span>` : ''}
    </div>
  `;
  document.querySelectorAll('#orderModal .status-grid .status-pill').forEach(p => p.classList.toggle('selected', p.dataset.st === o.status));
  
  // 截图
  const origs = o.screenshots || [];
  document.getElementById('omOrigCount').textContent = `${origs.length} 张`;
  document.getElementById('omOrigThumbs').innerHTML = origs.map((s, i) => `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmOrderOrig(${i})" title="移除">×</button></div>`).join('');
  
  // 时间线
  const fu = o.followups || [];
  document.getElementById('omTimelineCount').textContent = `${fu.length} 条`;
  const tl = document.getElementById('omTimeline');
  if (fu.length === 0) {
    tl.innerHTML = '<div class="timeline-empty">还没有跟进记录</div>';
  } else {
    tl.innerHTML = fu.map((f, i) => `
      <div class="timeline-item">
        <div class="timeline-dot" style="background:var(--accent);">${i + 1}</div>
        <div class="timeline-content">
          <div class="timeline-meta"><span>📅 ${f.date} ${f.time || ''}</span><span class="timeline-type">${ORDER_TYPE_LABELS[f.type] || '其他'}</span></div>
          <div class="timeline-text">${escapeHtml(f.note || '')}</div>
          ${(f.screenshots && f.screenshots.length > 0) ? `<div class="timeline-screenshots">${f.screenshots.map(s => `<img src="${s}" class="screenshot-thumb" onclick="viewImage('${s}')">`).join('')}</div>` : ''}
          <div class="actions"><button class="del-btn" onclick="delOrderFollowup(${i})">删除</button></div>
        </div>
      </div>
    `).join('');
  }
}

function currentOrder() {
  if (!_currentItemId) return null;
  // V3：从 CHASE_ORDERS 找
  return CHASE_ORDERS.find(o => o._id === _currentItemId);
}

// V3 改造：根据 _isPO 分流写入
// PO 派生 → 直接 update orders 表（用 note 字段）
// 旧手动催单 → 直接 update orders 表（用 notes 字段）
function persistCurrentOrder(updater, immediate = false) {
  const o = currentOrder();
  if (!o) return;
  updater(o);
  o.updatedAt = new Date().toISOString();
  
  // 公共字段
  const baseUpdates = {
    site: o.site || '',
    product: o.product || '',
    supplier: o.supplier || '',
    status: o.status || (o._isPO ? 'producing' : 'pending'),
    promised_date: o.promisedDate || null,
    shipped_date: o.shippedDate || null,
    arrived_date: o.arrivedDate || null,
    next_follow: o.nextFollow || null,
    screenshots: o.screenshots || [],
    followups: o.followups || [],
    qty: (o.qty != null && o.qty !== '' ? Number(o.qty) : null),   // V20260602
    products: o.products || [],                                    // V20260602
    updated_at: new Date().toISOString(),
  };
  // 备注字段分流（旧 orders 表两个字段同时存在：notes 旧手动用，note PO 用）
  const updates = o._isPO
    ? { ...baseUpdates, note: o.notes || '' }
    : { ...baseUpdates, notes: o.notes || '', order_no: o.orderNo || '', order_date: o.orderDate || null };
  
  const p = sb.from('orders').update(updates).eq('id', o._id);
  const handler = ({ error }) => {
    if (error) { console.error('保存失败:', error); toast('保存失败：' + error.message, 'err'); }
  };
  if (immediate) return p.then(handler);
  p.then(handler);
}

// ============================================================
// V20260602:催单自动抓取原始订单产品(先 PO 后销售单)· 过滤保险 · 规格标准化 · 多选
// ============================================================
let _omFetched = [];
let _omFetchTimer = null;
let _omLastSrc = '';
let _omState = 'empty';
let _omNo = '';

function omOrderNoChanged(value) {
  onOrderField('orderNo', value);
  clearTimeout(_omFetchTimer);
  _omFetchTimer = setTimeout(() => omAutoFetchProducts(), 600);
}

function omQtyChanged(value) {
  persistCurrentOrder(o => { o.qty = (value === '' ? null : Number(value)); });
}

// V20260602:灯具规格词典(英→中)· 多词优先
const _SPEC_DICT = {
  'antique gold':'复古金','aged gold':'复古金','antique brass':'复古黄铜','aged brass':'复古黄铜',
  'rose gold':'玫瑰金','champagne gold':'香槟金','brushed gold':'拉丝金','brushed brass':'拉丝黄铜',
  'brushed nickel':'拉丝镍','satin brass':'缎面黄铜','satin nickel':'缎面镍','satin black':'缎面黑',
  'matte black':'哑光黑','matte white':'哑光白','matte gold':'哑光金','smoky gray':'烟灰色','smoke gray':'烟灰色',
  'warm white':'暖光','cool white':'冷光','natural white':'中性光',
  'amethyst':'紫水晶','amber':'琥珀色','smoke':'烟灰色','smoky':'烟灰色','clear':'透明',
  'gold':'金色','black':'黑色','white':'白色','gray':'灰色','grey':'灰色','silver':'银色','bronze':'青铜色',
  'brass':'黄铜','chrome':'铬色','nickel':'镍色','copper':'红铜色','gunmetal':'枪灰色',
  'green':'绿色','blue':'蓝色','pink':'粉色','red':'红色','purple':'紫色','beige':'米色','cream':'奶油色',
  'walnut':'胡桃木色','oak':'橡木色','wood':'木色','wood grain':'木纹','frosted':'磨砂',
  'wall lamp':'壁灯','pendant':'吊灯','chandelier':'吊灯','table lamp':'台灯','floor lamp':'落地灯','ceiling lamp':'吸顶灯',
};
function _dictTranslate(v) {
  const keys = Object.keys(_SPEC_DICT).sort((a, b) => b.length - a.length);
  keys.forEach(k => {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    v = v.replace(new RegExp('(^|[^A-Za-z])' + esc + '([^A-Za-z]|$)', 'gi'), (m, a, b) => a + _SPEC_DICT[k] + b);
  });
  return v;
}

// V20260602:清洗 Shopify/PO 规格 · 去标题去SKU · 英寸→整数cm · N-tier→N层版本 · 词典翻译
function _cleanFetchedSpec(li, rawSpec) {
  let v = String(rawSpec || (li && (li.variant_title || li.variant)) || '');
  if (!v) return '';
  const title = (li && li.title ? String(li.title) : '').trim();
  const sku = (li && li.sku ? String(li.sku) : '').trim();
  if (title && title.length > 2) v = v.split(title).join(' ');
  v = v.replace(/SKU\s*[:：]\s*[A-Za-z0-9_\-\/]+/gi, ' ');
  if (sku && sku.length > 2) v = v.split(sku).join(' ');
  v = v.replace(/\b(Size|尺寸|规格|Color|颜色)\s*[:：]/gi, ' ');
  // 色温(warm/cool/natural light|white|K)
  v = v.replace(/\bwarm\s*(?:light|white)\b|\b3000\s*k\b/gi, '暖光');
  v = v.replace(/\bcool\s*(?:light|white)\b|\b6000\s*k\b|\b6500\s*k\b/gi, '冷光');
  v = v.replace(/\b(?:natural|neutral)\s*(?:light|white)\b|\b4000\s*k\b/gi, '中性光');
  // 层数
  v = v.replace(/(\d+)\s*-?\s*tier(?:\s*version)?/gi, '$1层版本');
  v = v.replace(/\bversion\b/gi, '版本');
  // 灯头数:全局只出现一次 → 抽出前置;多次(多配置)→ 就地翻译 N头
  let headPrefix = '';
  const headMatches = v.match(/(\d+)\s*-?\s*(?:heads?|lights?|bulbs?)\b/gi) || [];
  if (headMatches.length === 1) {
    const hm = headMatches[0].match(/(\d+)/);
    headPrefix = hm ? (hm[1] + '头') : '';
    v = v.replace(/(\d+)\s*-?\s*(?:heads?|lights?|bulbs?)\b/gi, ' ');
  } else if (headMatches.length > 1) {
    v = v.replace(/(\d+)\s*-?\s*(?:heads?|lights?|bulbs?)\b/gi, '$1头');
  }
  // 词典翻译(颜色/材质/灯型)
  v = _dictTranslate(v);
  v = v.replace(/\bcolor\b/gi, ' ');     // 去残留 "Color" 标签词
  v = v.replace(/\s*&\s*/g, ' + ');       // & → +
  // 分段处理(/ 和 ·)
  let segs = v.split(/\s*[\/·]\s*/).map(x => x.trim()).filter(Boolean);
  const _isInchDim = ss => /["'″]/.test(ss) && /\d/.test(ss);
  const _isCmDim = ss => /\d\s*(?:cm|mm)\b/i.test(ss);
  const hasCm = segs.some(_isCmDim);
  const seenAll = new Set();
  const out = [];
  segs.forEach(seg => {
    let ss = seg;
    if (_isInchDim(ss)) {
      if (hasCm) return;  // 有 cm 版本 → 丢英寸重复
      ss = ss.replace(/(\d+(?:\.\d+)?)\s*["'″]?/g, (m, n) => Math.round(parseFloat(n) * 2.54) + 'cm').replace(/["'″]/g, '');
    }
    ss = ss.replace(/(\d+(?:\.\d+)?)\s*cm/gi, (m, n) => Math.round(parseFloat(n)) + 'cm');
    ss = ss.replace(/[\[\]【】]/g, ' ').replace(/\s*[:：]\s*/g, ' ').replace(/\s*[-–—]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!ss) return;
    // 去重:D/∅/Dia/直径 视为同一 · 忽略灯头前缀
    const norm = ss.toLowerCase().replace(/[∅⌀φ]/g, 'd').replace(/\b(dia|diameter|直径)\b/g, 'd').replace(/\d+\s*头/g, '').replace(/\s+/g, '');
    if (seenAll.has(norm)) return;
    seenAll.add(norm);
    out.push(ss);
  });
  let result = out.join(' · ');
  if (headPrefix) result = headPrefix + ' ' + result;
  result = result.replace(/^[·\s]+|[·\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  return result;
}

// V20260602:词典翻不动的残留英文 → 异步调 Claude API(_aiTranslateSpec)兜底
async function _omTranslateRemaining() {
  if (typeof _aiTranslateSpec !== 'function') return;
  const need = _omFetched.filter(p => {
    if (!p.spec) return false;
    const en = (p.spec.match(/[A-Za-z]{3,}/g) || []).length;
    const cn = (p.spec.match(/[\u4e00-\u9fa5]/g) || []).length;
    return en > 0 && cn / Math.max(p.spec.length, 1) < 0.5;
  });
  if (need.length === 0) return;
  try {
    const numbered = need.map((p, i) => `[${i + 1}] ${p.spec}`).join('\n');
    const result = await _aiTranslateSpec(numbered);
    (result.split('\n').filter(l => l.trim())).forEach(line => {
      const m = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (m) { const idx = parseInt(m[1]) - 1; if (need[idx]) need[idx].spec = m[2].trim(); }
    });
    omCommitProducts();
    omRenderFetchPanel();
  } catch (e) { console.warn('[催单 AI 翻译兜底失败]', e.message || e); }
}

function omAutoFetchProducts() {
  const o = currentOrder(); if (!o) return;
  const rawNo = (document.getElementById('omOrderNo')?.value || o.orderNo || '').trim();
  const panel = document.getElementById('omFetchPanel');
  // V20260602:支持多个订单号(/ , 、 空格 分隔)· 同一客户多个相似订单合并到一张催单
  const nos = rawNo.split(/[\/,，、\s]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
  _omNo = nos.join(' / ');
  if (nos.length === 0) { _omFetched = []; _omState = 'empty'; if (panel) omRenderFetchPanel(); return; }

  let lineItems = [];
  const srcSet = new Set();
  let salesCreated = '';   // V20260611:销售单的客户下单日期(手动催单默认用它 · 不用手动改)
  nos.forEach(n => {
    let got = [];
    if (typeof PO_LIST !== 'undefined' && PO_LIST.length) {
      const pos = PO_LIST.filter(p => String(p.po_number||'').trim()===n || String(p.order_no||'').trim()===n);
      got = pos.flatMap(p => p.line_items || []);
      if (got.length) srcSet.add('PO');
    }
    if (got.length === 0 && typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
      const so = SHOPIFY._orders.find(s => String(s.shopify_order_number||'').replace('#','')===n || String(s.name||'').replace('#','')===n);
      if (so && so.line_items && so.line_items.length) { got = so.line_items; srcSet.add('销售单'); }
    }
    // V20260611:不管产品从 PO 还是销售单抓 · 都尝试反查销售单拿客户下单日期(取最早)
    if (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
      const so2 = SHOPIFY._orders.find(s => String(s.shopify_order_number||'').replace('#','')===n || String(s.name||'').replace('#','')===n);
      if (so2 && so2.shopify_created_at) {
        const d2 = String(so2.shopify_created_at).slice(0, 10);
        if (!salesCreated || d2 < salesCreated) salesCreated = d2;
      }
    }
    got.forEach(li => { try { li._fromOrder = n; } catch(e){} });
    lineItems = lineItems.concat(got);
  });
  const src = (nos.length > 1 ? `${nos.length}个订单·` : '') + ([...srcSet].join('/') || '');
  // 过滤保险/运费险等
  lineItems = (lineItems||[]).filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));

  const productMap = (typeof SHOPIFY !== 'undefined' && SHOPIFY._productMap) ? SHOPIFY._productMap : {};
  const canNorm = (typeof extractVariantInfo === 'function');
  _omFetched = lineItems.map(li => {
    const rawSpec = li.variant || li.variant_title || li.title_cn || li.title_en || li.title || '';
    let spec = _cleanFetchedSpec(li, rawSpec);
    
    let img = li.image_url || li.image || '';
    if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
    if (!img && li.sku && typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.effectiveBySku) {
      const pp = PRODUCTS_CACHE.effectiveBySku(li.sku); if (pp && pp.image_url) img = pp.image_url;
    }
    const checked = (o.products||[]).some(x => (x.sku && x.sku===li.sku) || (x.spec && x.spec===spec));
    return { spec, qty: li.qty || li.quantity || '', image_url: img, sku: li.sku || '', _checked: checked };
  });
  // V20260602:本地没抓到 · 但已保存过产品 → 显示已保存的(不报"没找到 · 重新拉取")
  if (_omFetched.length === 0 && (o.products || []).length > 0) {
    _omFetched = o.products.map(p => ({ spec: p.spec, qty: p.qty, image_url: p.image_url, sku: p.sku, _checked: true }));
    _omLastSrc = '已保存';
  }
  _omState = (_omFetched.length === 0) ? 'nomatch' : 'ok';
  // 单个产品且未选过 → 默认勾上
  if (_omFetched.length === 1 && (o.products||[]).length === 0) { _omFetched[0]._checked = true; omCommitProducts(); }
  _omLastSrc = src;
  // V20260602:打开时用新抓取(已清洗+数量)重建已选明细 · 彻底修"数量空/规格还是英文"
  // 只保留:手动加的行(_manual) + 手动改过数量的(_qtyEdited,按 sku 带回数量)· 其余以抓取为准
  if (_omFetched.length && _omFetched.some(p => p._checked)) {
    const fetchedSel = _omFetched.filter(p => p._checked).map(p => ({ spec: p.spec, qty: p.qty, image_url: p.image_url, sku: p.sku }));
    const oldProds = o.products || [];
    // 带回手动改过的数量(按 sku 匹配)
    fetchedSel.forEach(fp => {
      if (!fp.sku) return;
      const old = oldProds.find(pr => pr._qtyEdited && pr.sku && pr.sku === fp.sku && pr.qty !== '' && pr.qty != null);
      if (old) { fp.qty = old.qty; fp._qtyEdited = true; }
    });
    const manualRows = oldProds.filter(pr => pr._manual);
    const merged = [...fetchedSel, ...manualRows];
    const sig = arr => JSON.stringify(arr.map(p => [p.sku || '', p.spec || '', p.qty == null ? '' : p.qty, p.image_url || '']));
    if (sig(oldProds) !== sig(merged)) {
      persistCurrentOrder(oo => { oo.products = merged; oo.product = merged.map(p => p.spec).filter(Boolean).join(' / '); oo.qty = merged.reduce((sm, p) => sm + (Number(p.qty) || 0), 0); });
    }
  }
  _omSyncQtyField();
  // V20260611:手动催单 → 下单日期默认用销售单的客户下单日期(只在还是"录入当天的自动默认"或空时替换 · 用户手动改过的不动)
  if (salesCreated && !o._isPO) {
    const recDay = (o.createdAt || '').slice(0, 10);   // 催单记录创建那天(= addOrder 时的自动默认)
    if ((!o.orderDate || o.orderDate === recDay) && o.orderDate !== salesCreated) {
      persistCurrentOrder(oo => { oo.orderDate = salesCreated; });
      const _odInp = document.getElementById('omOrderDate');
      if (_odInp) _odInp.value = salesCreated;
    }
  }
  if (typeof _omUpdateOrderDateHint === 'function') _omUpdateOrderDateHint();
  if (typeof omRenderProductLines === 'function') omRenderProductLines();
  omRenderFetchPanel();
  _omTranslateRemaining();  // 残留英文异步 AI 翻译
}

// V20260611:下单日期旁显示「已下单 N 天」(7天起转橙 · 15天起转红)
function _omUpdateOrderDateHint() {
  const el = document.getElementById('omOrderDateDays');
  if (!el) return;
  const v = document.getElementById('omOrderDate')?.value || '';
  if (!v) { el.textContent = ''; return; }
  const days = Math.floor((Date.now() - new Date(v + 'T00:00:00').getTime()) / 86400000);
  if (days < 0) { el.textContent = ''; return; }
  el.textContent = `· 已下单 ${days} 天`;
  el.style.color = days >= 15 ? 'var(--danger)' : (days >= 7 ? '#b45309' : 'var(--text-tertiary)');
  el.style.fontWeight = days >= 7 ? '700' : '400';
}
window._omUpdateOrderDateHint = _omUpdateOrderDateHint;

// V20260602:手动从 Shopify 后台拉取单个订单(本地没同步到的旧单 · 兜底)
async function omManualFetch() {
  const o = currentOrder(); if (!o) return;
  const rawNo = (document.getElementById('omOrderNo')?.value || o.orderNo || '').trim();
  const nos = rawNo.split(/[\/,，、\s]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
  if (nos.length === 0) { alert('请先填订单号'); return; }
  const site = document.getElementById('omSite')?.value || o.site;
  const meta = (typeof SHOPIFY !== 'undefined' && SHOPIFY.STORES_META)
    ? SHOPIFY.STORES_META.find(m => m.site_code === site) : null;
  const shop = meta ? meta.domain : null;
  const panel = document.getElementById('omFetchPanel');
  if (!shop) { if (panel) panel.innerHTML = `<div style="font-size:12px; color:var(--danger);">⚠ 站点 ${escapeHtml(site||'')} 没有对应 Shopify 店铺,无法后台拉取</div>`; return; }
  _omNo = nos.join(' / ');
  if (panel) panel.innerHTML = `<div style="font-size:12px; color:var(--text-secondary); padding:6px 0;">⏳ 正在从 Shopify 后台拉取${nos.length>1?` ${nos.length} 个订单`:`订单「${escapeHtml(nos[0])}」`}(${shop})…</div>`;
  try {
    // V20260602:支持多个订单号 · 逐个拉取合并
    let lineItems = [];
    for (const n of nos) {
      try {
        const r = await SHOPIFY.call('list_orders', { name: n, status: 'any', limit: 10, auto_save: false }, shop, 30000);
        const orders = Array.isArray(r.orders) ? r.orders : [];
        const ord = orders.find(x => String(x.name || '').replace('#', '') === n) || orders[0];
        let lis = (ord && ord.line_items) ? ord.line_items : [];
        lis.forEach(li => { try { li._fromOrder = n; } catch(e){} });
        lineItems = lineItems.concat(lis);
      } catch (e) { console.warn('[后台拉取]', n, e.message || e); }
    }
    lineItems = lineItems.filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));
    if (lineItems.length === 0) {
      _omFetched = []; _omState = 'nomatch';
      if (panel) panel.innerHTML = `<div style="font-size:12px; color:var(--warning); padding:4px 0;">⚠ Shopify 后台也没查到「${escapeHtml(_omNo)}」的产品(可能订单号不对,或该店铺未授权)</div>`;
      return;
    }
    const productMap = (SHOPIFY._productMap) || {};
    const canNorm = (typeof extractVariantInfo === 'function');
    // 顺便补全产品图(用 sku 拉图)
    const skus = lineItems.map(li => li.sku).filter(Boolean);
    if (skus.length && typeof SHOPIFY.loadProductImageMap === 'function') {
      try { const m = await SHOPIFY.loadProductImageMap(skus); Object.assign(productMap, m || {}); SHOPIFY._productMap = productMap; } catch (e) {}
    }
    _omFetched = lineItems.map(li => {
      const rawSpec = li.variant_title || li.variant || li.title || '';
      let spec = _cleanFetchedSpec(li, rawSpec);
      
      let img = li.image_url || '';
      if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
      const checked = (o.products || []).some(x => (x.sku && x.sku === li.sku) || (x.spec && x.spec === spec));
      return { spec, qty: li.quantity || li.qty || '', image_url: img, sku: li.sku || '', _checked: checked };
    });
    _omState = 'ok'; _omLastSrc = nos.length > 1 ? `Shopify后台·${nos.length}单` : 'Shopify后台';
    if (_omFetched.length === 1 && (o.products || []).length === 0) { _omFetched[0]._checked = true; omCommitProducts(); }
    _omSyncQtyField();
    if (typeof omRenderProductLines === 'function') omRenderProductLines();
    omRenderFetchPanel();
    _omTranslateRemaining();  // 残留英文异步 AI 翻译
  } catch (e) {
    if (panel) panel.innerHTML = `<div style="font-size:12px; color:var(--danger); padding:4px 0;">❌ 后台拉取失败:${escapeHtml(e.message || String(e))}<br><span style="color:var(--text-tertiary);">（若反复失败,可能 Edge Function 不支持按订单号查询,需后台加 name 参数支持）</span></div>`;
  }
}

function omRenderFetchPanel() {
  const panel = document.getElementById('omFetchPanel'); if (!panel) return;
  // 三态:empty(没填订单号) / nomatch(查不到) / ok(抓到了)
  if (_omState === 'empty' || !_omNo) {
    panel.innerHTML = '<div style="font-size:11.5px; color:var(--text-secondary); padding:2px 0;">👆 在上方填<b>订单号</b> → 自动从 <b>PO / 销售单</b> 抓取产品供勾选,自动填入产品 / 数量 / 图片,免手输错' + `<button type="button" class="btn small" onclick="omManualFetch()" style="padding:3px 10px; font-size:11px; margin-left:8px;">📥 从 Shopify 后台拉取</button>` + '</div>';
    return;
  }
  if (_omState === 'nomatch' || !_omFetched || _omFetched.length === 0) {
    panel.innerHTML = `<div style="font-size:11.5px; color:var(--warning); padding:4px 0;">⚠ 本地没找到订单「<b>${escapeHtml(_omNo)}</b>」· 该订单可能还没同步(旧系统订单)→ 点右边直接从后台拉` + `<button type="button" class="btn small" onclick="omManualFetch()" style="padding:3px 10px; font-size:11px; margin-left:8px;">📥 从 Shopify 后台拉取</button>` + `<br><span style="color:var(--text-tertiary); font-size:11px;">或去「销售单」同步后再打开 · 也可在上方手动填产品/数量</span></div>`;
    return;
  }
  const allChecked = _omFetched.every(p => p._checked);
  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:7px;">
      <div style="font-size:11.5px; color:var(--text-secondary); font-weight:600;">📥 订单「${escapeHtml(_omNo)}」的产品(来自${_omLastSrc || '订单'})· 勾选要催的 → 自动填表(规格已标准化 · 防手输错)</div>
      <div>
        <button type="button" class="btn small" onclick="omToggleAllFetched()" style="padding:3px 10px; font-size:11px;">${allChecked ? '取消全选' : '全选'}</button>
        <button type="button" class="btn small" onclick="omManualFetch()" style="padding:3px 10px; font-size:11px; margin-left:6px;" title="从 Shopify 后台重新拉取">📥 后台重拉</button>
      </div>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${_omFetched.map((p, i) => `
        <label style="display:flex; align-items:center; gap:7px; border:1.5px solid ${p._checked ? 'var(--accent)' : 'var(--border)'}; border-radius:8px; padding:6px 9px; cursor:pointer; background:${p._checked ? 'rgba(37,99,235,0.08)' : 'var(--bg-card)'};">
          <input type="checkbox" ${p._checked ? 'checked' : ''} onchange="omToggleFetched(${i})">
          ${p.image_url ? `<img src="${p.image_url}" style="width:48px; height:48px; object-fit:cover; border-radius:5px;">` : '<span style="font-size:20px;">📷</span>'}
          <span style="font-size:12px; max-width:240px; line-height:1.35;">${escapeHtml(p.spec || '(无规格)')}${p.qty ? ` · <b style="color:#dc2626;">×${p.qty}</b>` : ''}</span>
        </label>
      `).join('')}
    </div>`;
}

function omToggleAllFetched() {
  const target = !_omFetched.every(p => p._checked);
  _omFetched.forEach(p => p._checked = target);
  omCommitProducts();
  omRenderFetchPanel();
}

function omToggleFetched(i) {
  if (!_omFetched[i]) return;
  _omFetched[i]._checked = !_omFetched[i]._checked;
  omCommitProducts();
  omRenderFetchPanel();
}

function omCommitProducts() {
  const o = currentOrder(); if (!o) return;
  const selected = _omFetched.filter(p => p._checked).map(p => ({ spec: p.spec, qty: p.qty, image_url: p.image_url, sku: p.sku }));
  persistCurrentOrder(oo => {
    oo.products = selected;
    const specs = selected.map(p => p.spec).filter(Boolean);
    if (specs.length) oo.product = specs.join(' / ');
    const totalQty = selected.reduce((s, p) => s + (Number(p.qty) || 0), 0);
    if (totalQty) oo.qty = totalQty;
  });
  const cur = currentOrder();
  const pe = document.getElementById('omProduct'); if (pe && cur.product) pe.value = cur.product;
  const qe = document.getElementById('omQty'); if (qe && cur.qty) qe.value = cur.qty;
  // V20260602:实时同步 · 不用刷新(更新弹窗头部 + 主页列表卡片/图 + SKU 明细)
  if (typeof renderOrderModalContent === 'function') renderOrderModalContent();
  if (typeof omRenderProductLines === 'function') omRenderProductLines();
  if (typeof renderOrders === 'function') renderOrders();
}

// V20260602:批量补全所有催单的产品(从 PO/销售单 · 只填空白的)
async function chaseBatchFillProducts() {
  const targets = (typeof CHASE_ORDERS !== 'undefined' ? CHASE_ORDERS : []).filter(o => (!o.products || o.products.length === 0) && o.orderNo);
  if (targets.length === 0) { alert('没有需要补全的催单(都已有产品 或 没填订单号)'); return; }
  if (!confirm(`批量从 PO/销售单补全 ${targets.length} 条催单的产品(规格/数量/图)?\n\n只填当前空白的,不覆盖已填的。\n本地查不到的会跳过(可逐个手动后台拉取)。`)) return;
  const productMap = (typeof SHOPIFY !== 'undefined' && SHOPIFY._productMap) ? SHOPIFY._productMap : {};
  let filled = 0, noMatch = 0;
  const updatedRows = [];
  for (const o of targets) {
    const no = String(o.orderNo).trim().replace(/^#/, '');
    let lineItems = [];
    if (typeof PO_LIST !== 'undefined' && PO_LIST.length) {
      const pos = PO_LIST.filter(pp => String(pp.po_number||'').trim()===no || String(pp.order_no||'').trim()===no);
      lineItems = pos.flatMap(pp => pp.line_items || []);
    }
    if (lineItems.length === 0 && typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
      const so = SHOPIFY._orders.find(s => String(s.shopify_order_number||'').replace('#','')===no || String(s.name||'').replace('#','')===no);
      if (so && so.line_items) lineItems = so.line_items;
    }
    lineItems = (lineItems||[]).filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));
    if (lineItems.length === 0) { noMatch++; continue; }
    const products = lineItems.map(li => {
      const rawSpec = li.variant || li.variant_title || li.title || '';
      let spec = (typeof _cleanFetchedSpec === 'function') ? _cleanFetchedSpec(li, rawSpec) : rawSpec;
      let img = li.image_url || li.image || '';
      if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
      return { spec, qty: li.qty || li.quantity || '', image_url: img, sku: li.sku || '' };
    });
    o.products = products;
    const specs = products.map(pp => pp.spec).filter(Boolean);
    if (specs.length) o.product = specs.join(' / ');
    const tq = products.reduce((su, pp) => su + (Number(pp.qty) || 0), 0);
    if (tq) o.qty = tq;
    updatedRows.push({ id: o._id, products: o.products, qty: o.qty || null, product: o.product });
    filled++;
  }
  if (updatedRows.length && typeof sb !== 'undefined') {
    try {
      for (const r of updatedRows) {
        await sb.from('orders').update({ products: r.products, qty: r.qty, product: r.product }).eq('id', r.id);
      }
    } catch (e) { console.error('批量补全存库失败', e); }
  }
  if (typeof renderOrders === 'function') renderOrders();
  alert(`✅ 批量补全完成\n\n已补全:${filled} 条\n本地查不到(跳过):${noMatch} 条\n\n查不到的多为旧系统订单,可逐个打开点「📥 从 Shopify 后台拉取」。`);
}
window.chaseBatchFillProducts = chaseBatchFillProducts;

// V20260602:同步数量到表单(产品已存在但表单数量为空/0 时也补上 · 修"数量没自动填")
function _omSyncQtyField() {
  const o = (typeof currentOrder === 'function') ? currentOrder() : null;
  if (!o || !(o.products || []).length) return;
  const tq = o.products.reduce((sm, p) => sm + (Number(p.qty) || 0), 0);
  if (!tq) return;
  if (Number(o.qty) !== tq) persistCurrentOrder(oo => oo.qty = tq);
  const qe = document.getElementById('omQty'); if (qe) qe.value = tq;
}

// V20260602:已选 SKU 明细列表(每个产品独立规格+数量 · 可编辑/增删 · 多 SKU 不再合并求和)
function omRenderProductLines() {
  const wrap = document.getElementById('omProductLines'); if (!wrap) return;
  const o = (typeof currentOrder === 'function') ? currentOrder() : null;
  const prods = (o && o.products) || [];
  const pe = document.getElementById('omProduct'), qe = document.getElementById('omQty');
  if (prods.length === 0) {
    wrap.innerHTML = '';
    if (pe) { pe.readOnly = false; pe.style.background = ''; }
    if (qe) { qe.readOnly = false; qe.style.background = ''; }
    return;
  }
  const total = prods.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  if (pe) { pe.value = prods.map(p => p.spec).filter(Boolean).join(' / '); pe.readOnly = true; pe.style.background = '#f5f5f4'; }
  if (qe) { qe.value = total; qe.readOnly = true; qe.style.background = '#f5f5f4'; }
  wrap.innerHTML = `
    <div style="border:1px solid var(--border); border-radius:8px; overflow:hidden;">
      <div style="display:flex; align-items:center; justify-content:space-between; padding:7px 10px; background:var(--bg-elevated); font-size:12px; font-weight:600; color:var(--text-secondary);">
        <span>📦 已选产品明细(${prods.length} 个 SKU)· 每项规格 / 数量独立 · 发供应商更清楚</span>
        <button type="button" class="btn small" onclick="omAddLine()" style="padding:2px 9px; font-size:11px;">+ 手动加一行</button>
      </div>
      ${prods.map((p, i) => `
        <div style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-top:1px solid var(--border-subtle);">
          ${p.image_url ? `<img src="${p.image_url}" style="width:42px; height:42px; object-fit:cover; border-radius:5px; flex:0 0 auto;">` : '<span style="width:42px; text-align:center; flex:0 0 auto; font-size:18px;">📷</span>'}
          <input type="text" value="${escapeHtml(p.spec || '')}" oninput="omSetLineSpec(${i}, this.value)" placeholder="规格参数" style="flex:1; padding:5px 8px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
          <span style="font-size:11px; color:var(--text-tertiary);">数量</span>
          <input type="number" min="0" value="${p.qty || ''}" oninput="omSetLineQty(${i}, this.value)" style="width:62px; padding:5px 6px; font-size:12px; border:1px solid var(--border); border-radius:5px; text-align:center;">
          <button type="button" onclick="omRemoveLine(${i})" title="移除此 SKU" style="border:none; background:transparent; color:#dc2626; cursor:pointer; font-size:17px; flex:0 0 auto; padding:0 4px;">×</button>
        </div>`).join('')}
    </div>`;
}
function omSetLineQty(i, val) {
  persistCurrentOrder(o => { if (o.products && o.products[i]) { o.products[i].qty = (val === '' ? '' : Number(val)); o.products[i]._qtyEdited = true; } o.qty = (o.products || []).reduce((s, p) => s + (Number(p.qty) || 0), 0); });
  const o = currentOrder(); const qe = document.getElementById('omQty'); if (qe && o) qe.value = o.qty;
  if (typeof renderOrders === 'function') renderOrders();
}
function omSetLineSpec(i, val) {
  persistCurrentOrder(o => { if (o.products && o.products[i]) o.products[i].spec = val; o.product = (o.products || []).map(p => p.spec).filter(Boolean).join(' / '); });
  const o = currentOrder(); const pe = document.getElementById('omProduct'); if (pe && o) pe.value = o.product;
}
function omRemoveLine(i) {
  persistCurrentOrder(o => { if (o.products) o.products.splice(i, 1); o.product = (o.products || []).map(p => p.spec).filter(Boolean).join(' / '); o.qty = (o.products || []).reduce((s, p) => s + (Number(p.qty) || 0), 0); });
  omRenderProductLines();
  if (typeof renderOrderModalContent === 'function') renderOrderModalContent();
  if (typeof renderOrders === 'function') renderOrders();
}
function omAddLine() {
  persistCurrentOrder(o => { if (!o.products) o.products = []; o.products.push({ spec: '', qty: '', image_url: '', sku: '', _manual: true }); });
  omRenderProductLines();
}
window.omRenderProductLines = omRenderProductLines;
window.omSetLineQty = omSetLineQty; window.omSetLineSpec = omSetLineSpec;
window.omRemoveLine = omRemoveLine; window.omAddLine = omAddLine;

function onOrderField(field, value) {
  persistCurrentOrder(o => {
    o[field] = value;
    if (field === 'promisedDate' && value && o.status === 'pending') o.status = 'producing';
  });
  if (field === 'site') updateOrderNoHint('omSite', 'omOrderNo', 'omOrderNoHint');
  if (field === 'orderDate' && typeof _omUpdateOrderDateHint === 'function') _omUpdateOrderDateHint();
  renderOrderModalContent();
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
}

async function setOrderStatus(st) {
  persistCurrentOrder(o => {
    o.status = st;
    if (st === 'shipped' && !o.shippedDate) {
      o.shippedDate = new Date().toISOString().slice(0, 10);
    }
    if (st === 'arrived' && !o.arrivedDate) {
      o.arrivedDate = new Date().toISOString().slice(0, 10);
    }
  }, true);
  renderOrderModalContent();
  // 状态变更可能影响 PO 是否还在催单列表（如改成 shipped/arrived/cancelled 就不在了）
  await loadChaseOrders(true);
  renderOrders(); refreshOrdersFb(); renderUrgentBanner(); updateOrderStats();
  if (['shipped', 'arrived', 'cancelled'].includes(st)) {
    toast(`✓ 状态已切到「${ORDER_STATUS_LABELS[st] || st}」，该单已从催单列表移除`);
    closeModal('orderModal');
  }
}

function deleteCurrentOrder() {
  const o = currentOrder();
  if (!o) return;
  
  if (o._isPO) {
    const choice = confirm(
      `这是采购单 ${o.orderNo}，不能在催单页删除。\n\n` +
      `如需删除，请去「📦 采购单」tab 把该 PO 取消或删除。\n\n` +
      `· 确定 → 现在去采购单 tab\n· 取消 → 留在本页`
    );
    if (choice) { closeModal('orderModal'); switchTab('po'); }
  } else {
    // 旧手动催单：软删除
    if (!confirm('确定删除这个订单？\n\n（删除后会进回收站，30 天内可恢复）')) return;
    sb.from('orders').update({
      deleted_at: new Date().toISOString(),
      deleted_by: CURRENT_AGENT,
    }).eq('id', o._id).then(async ({ error }) => {
      if (error) { toast('删除失败：' + error.message, 'err'); return; }
      closeModal('orderModal');
      await loadChaseOrders(true);
      renderOrders(); updateOrderStats(); refreshOrdersFb();
      toast('已移入回收站');
    });
  }
}

function setOmFuType(t) {
  _currentFuType = t;
  document.querySelectorAll('#omTypeRow .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === t));
}

function addOrderFollowup() {
  const note = document.getElementById('omNewNote').value.trim();
  const date = document.getElementById('omNewDate').value || new Date().toISOString().slice(0, 10);
  if (!note && _newScreenshots_fu.length === 0) { toast('请输入跟进内容或上传截图', 'warn'); return; }
  
  persistCurrentOrder(o => {
    if (!o.followups) o.followups = [];
    o.followups.push({
      type: _currentFuType, date,
      time: new Date().toTimeString().slice(0, 5),
      note, screenshots: [..._newScreenshots_fu],
    });
    if (_currentFuType === 'ship' && ['pending','producing'].includes(o.status)) {
      o.status = 'shipped';
      if (!o.shippedDate) o.shippedDate = date;
    }
    if (_currentFuType === 'arrive' && o.status === 'shipped') {
      o.status = 'arrived';
      if (!o.arrivedDate) o.arrivedDate = date;
    }
  }, true);
  
  document.getElementById('omNewNote').value = '';
  document.getElementById('omFuThumbs').innerHTML = '';
  _newScreenshots_fu = [];
  renderOrderModalContent();
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
  toast(`✓ 已记录（${ORDER_TYPE_LABELS[_currentFuType]}）`);
}

function delOrderFollowup(idx) {
  if (!confirm('删除这条跟进？')) return;
  persistCurrentOrder(o => o.followups.splice(idx, 1), true);
  renderOrderModalContent();
  renderOrders();
  refreshOrdersFb();
}

function rmOrderOrig(i) {
  persistCurrentOrder(o => o.screenshots.splice(i, 1), true);
  renderOrderModalContent();
}

// 催单统计
function updateOrderStats() {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  let active = 0, producing = 0, shipped = 0, arrivedThisMonth = 0, overdue = 0, todayCount = 0;
  CHASE_ORDERS.forEach(o => {
    const eff = getOrderEffStatus(o);
    if (!['cancelled'].includes(o.status)) {
      active++;
      if (o.status === 'producing') producing++;
      if (o.status === 'shipped') shipped++;
      if (eff === 'overdue') overdue++;
      if ((o.nextFollow === today) || (o.promisedDate === today && o.status === 'producing')) todayCount++;
    }
    if (o.arrivedDate && o.arrivedDate.startsWith(thisMonth)) arrivedThisMonth++;
  });
  document.getElementById('oActive').textContent = active;
  document.getElementById('oActiveSub').textContent = active > 0 ? '未取消' : '✓ 全部完成';
  document.getElementById('oProducing').textContent = producing;
  document.getElementById('oShipped').textContent = shipped;
  document.getElementById('oArrived').textContent = arrivedThisMonth;
  document.getElementById('oOverdue').textContent = overdue;
  document.getElementById('oToday').textContent = todayCount;
  document.getElementById('oUrgentSub').textContent = overdue > 0 ? '🔴 立即处理' : todayCount > 0 ? '🟡 今日跟进' : '✓ 无紧急';
  updateBadges();
  renderUrgentBanner();
}

// 催单 banner
function refreshOrdersFb() {
  const today = new Date().toISOString().slice(0, 10);
  const buckets = { overdue: [], today: [], upcoming: [] };
  CHASE_ORDERS.forEach(o => {
    if (['cancelled','shipped','arrived'].includes(o.status)) return;
    const triggerDate = o.nextFollow || (o.status === 'producing' ? o.promisedDate : null);
    if (triggerDate) {
      if (triggerDate < today) buckets.overdue.push(o);
      else if (triggerDate === today) buckets.today.push(o);
      else buckets.upcoming.push(o);
    }
  });
  buckets.overdue.sort((a, b) => (a.nextFollow || a.promisedDate || '').localeCompare(b.nextFollow || b.promisedDate || ''));
  buckets.upcoming.sort((a, b) => (a.nextFollow || a.promisedDate || '').localeCompare(b.nextFollow || b.promisedDate || ''));
  
  document.getElementById('ordersFbOverdue').textContent = buckets.overdue.length;
  document.getElementById('ordersFbToday').textContent = buckets.today.length;
  document.getElementById('ordersFbUpcoming').textContent = buckets.upcoming.length;
  
  const total = new Set([...buckets.overdue, ...buckets.today, ...buckets.upcoming].map(o => o._id)).size;
  document.getElementById('ordersFbTotal').textContent = `共 ${total} 单`;
  
  const card = document.getElementById('ordersFb');
  // V20260526q: 永远默认折叠 · 用户主动点开后用 localStorage 记忆
  // 之前是有数据自动展开 · 用户反馈太吵 · 改成默认折叠
  if (!card.dataset.userToggled) {
    const userPref = localStorage.getItem('orders_fb_collapsed');
    if (userPref === '0') {
      card.classList.remove('collapsed');  // 用户上次展开过
    } else {
      card.classList.add('collapsed');     // 默认折叠
    }
  }
  
  if (buckets[_ordersFbTab].length === 0) {
    for (const t of ['overdue','today','upcoming']) { if (buckets[t].length > 0) { _ordersFbTab = t; break; } }
  }
  document.querySelectorAll('#ordersFb .fb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _ordersFbTab));
  
  const list = document.getElementById('ordersFbList');
  const items = buckets[_ordersFbTab];
  if (items.length === 0) {
    list.innerHTML = `<div class="fb-empty">✓ ${_ordersFbTab === 'overdue' ? '没有逾期订单' : _ordersFbTab === 'today' ? '今天没有要跟进的' : '没有未来跟进计划'}</div>`;
    return;
  }
  list.innerHTML = items.map(o => {
    const eff = getOrderEffStatus(o);
    const td = o.nextFollow || o.promisedDate || '';
    const days = diffDays(td);
    let label = formatShortDate(td), cls = '';
    if (td) {
      if (days < 0) { label = `逾期 ${-days} 天`; cls = 'overdue'; }
      else if (days === 0) { label = '今日'; cls = 'today'; }
      else { label = `${days} 天后`; cls = 'upcoming'; }
    }
    return `
      <div class="fb-item" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">
        <div class="dot" style="background:var(--status-${eff});"></div>
        <div class="order-no">${escapeHtml(o.orderNo || '—')}</div>
        <div class="product">${escapeHtml(o.product || '(无描述)')}${IS_ADMIN && o._agent ? ` · 👤${escapeHtml(o._agent)}` : ''}</div>
        <div class="badge">${ORDER_STATUS_LABELS[o.status]}</div>
        <div class="next ${cls}">${label}</div>
        <button class="action-btn">处理</button>
      </div>
    `;
  }).join('');
}

function switchOrdersFb(t) { _ordersFbTab = t; document.getElementById('ordersFb').classList.remove('collapsed'); refreshOrdersFb(); }

// ============ 🚨 紧急告警 Banner（橙/红预警订单）============
// V20260526p: 可折叠 · localStorage 记忆状态
function toggleUrgentAlert() {
  const banner = document.getElementById('urgentAlert');
  if (!banner) return;
  banner.classList.toggle('collapsed');
  localStorage.setItem('urgent_alert_collapsed', banner.classList.contains('collapsed') ? '1' : '0');
}
window.toggleUrgentAlert = toggleUrgentAlert;

function renderUrgentBanner() {
  const banner = document.getElementById('urgentAlert');
  if (!banner) return;
  
  const urgent = CHASE_ORDERS.filter(o => {
    const lvl = getOrderUrgencyLevel(o);
    return lvl === 'red' || lvl === 'orange';
  });
  
  if (urgent.length === 0) {
    banner.style.display = 'none';
    return;
  }
  
  banner.style.display = 'block';
  // V20260526q: 默认折叠 · 只在用户主动展开过时才展开
  // 之前用 localStorage === '1' 才折叠 · 现在反向:必须 === '0' 才展开
  if (localStorage.getItem('urgent_alert_collapsed') !== '0') {
    banner.classList.add('collapsed');
  } else {
    banner.classList.remove('collapsed');
  }
  document.getElementById('urgentCount').textContent = urgent.length;
  
  const redCount = urgent.filter(o => getOrderUrgencyLevel(o) === 'red').length;
  const orangeCount = urgent.length - redCount;
  
  banner.classList.toggle('no-red', redCount === 0);
  
  let subtitle = '';
  if (redCount > 0) subtitle += `🔴 ${redCount} 严重预警 · `;
  if (orangeCount > 0) subtitle += `🟠 ${orangeCount} 警告 · `;
  subtitle += '逾期 + 多次催单未发货';
  if (IS_ADMIN) subtitle = '👑 主管视角 · ' + subtitle;
  document.getElementById('urgentSubtitle').textContent = subtitle;
  
  // 排序：红色优先，逾期天数倒序，催单次数倒序
  urgent.sort((a, b) => {
    const la = getOrderUrgencyLevel(a) === 'red' ? 0 : 1;
    const lb = getOrderUrgencyLevel(b) === 'red' ? 0 : 1;
    if (la !== lb) return la - lb;
    return (a.promisedDate || '9999').localeCompare(b.promisedDate || '9999');
  });
  
  const today = new Date().toISOString().slice(0, 10);
  const items = urgent.map(o => {
    const lvl = getOrderUrgencyLevel(o);
    const days = o.promisedDate ? Math.max(0, Math.floor((new Date(today) - new Date(o.promisedDate)) / 86400000)) : 0;
    const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
    const icon = lvl === 'red' ? '🔴' : '🟠';
    const ownerInfo = IS_ADMIN && o._agent ? ` · 👤 ${escapeHtml(o._agent)}` : '';
    return `
      <div class="urgent-item ${lvl}" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">
        <div class="level">${icon}</div>
        <div class="order">${escapeHtml(o.orderNo || '—')}</div>
        <div class="col-info">
          <div>${escapeHtml(o.product || '(无产品描述)')}</div>
          <div class="supplier">🏭 ${escapeHtml(o.supplier || '—')}${ownerInfo}</div>
        </div>
        <div class="col-date">承诺 ${formatShortDate(o.promisedDate)}</div>
        <div class="col-overdue">逾期 ${days} 天</div>
        <div class="col-chase">催 ${chaseCount} 次</div>
        <button class="escalate-btn" onclick="event.stopPropagation(); openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">处理</button>
      </div>
    `;
  }).join('');
  
  document.getElementById('urgentList').innerHTML = items;
}

// ============ 📋 导出供应商对账单 ============
// V20260605:ExcelJS 懒加载(嵌图用 · SheetJS 不支持嵌图)
function _loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    sc.onload = () => resolve(true);
    sc.onerror = () => reject(new Error('ExcelJS CDN 加载失败'));
    document.head.appendChild(sc);
    setTimeout(() => reject(new Error('ExcelJS 加载超时')), 15000);
  });
}
// V20260605:抓服务器图 → 压成小图 dataURL(不存库 · 仅导出时嵌入)· CORS 受限则返回 null 跳过
function _fetchImageSmall(url, maxPx = 56) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    img.onload = () => {
      try {
        const scale = Math.min(1, maxPx / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        fin(c.toDataURL('image/jpeg', 0.8));
      } catch (e) { fin(null); }  // 跨域污染 → 跳过
    };
    img.onerror = () => fin(null);
    setTimeout(() => fin(null), 4000);
    img.src = url;
  });
}
// V20260605:取催单订单的首张产品图 URL · products → lineItems → 按 SKU 反查产品库(pmap)
function _chaseOrderImageUrl(o, pmap) {
  if (Array.isArray(o.products) && o.products.length) {
    const u = o.products.map(p => p && p.image_url).filter(Boolean)[0];
    if (u) return u;
  }
  if (Array.isArray(o.lineItems) && o.lineItems.length) {
    const u = o.lineItems.map(li => li.image_url || li.image).filter(Boolean)[0];
    if (u) return u;
    // 兜底:用 SKU 反查产品库的图(PO 派生单 line_items 常没存图)
    if (pmap) {
      const bySku = o.lineItems.map(li => li.sku).filter(Boolean).map(sku => pmap[sku] && pmap[sku].image_url).filter(Boolean)[0];
      if (bySku) return bySku;
    }
  }
  // products 也按 sku 兜底
  if (pmap && Array.isArray(o.products)) {
    const bySku = o.products.map(p => p && p.sku).filter(Boolean).map(sku => pmap[sku] && pmap[sku].image_url).filter(Boolean)[0];
    if (bySku) return bySku;
  }
  return '';
}
// 收集一批催单订单涉及的所有 SKU(给 loadProductImageMap 反查图用)
function _chaseOrdersSkus(orders) {
  const set = new Set();
  orders.forEach(o => {
    (o.lineItems || []).forEach(li => { if (li.sku) set.add(li.sku); });
    (o.products || []).forEach(p => { if (p && p.sku) set.add(p.sku); });
  });
  return [...set];
}

async function exportSupplierAccounting(supplier) {
  // V3：从 PO 派生数据找该供应商所有未发货订单
  const orders = CHASE_ORDERS.filter(o => o.supplier === supplier && !['cancelled','shipped','arrived'].includes(o.status));
  
  if (orders.length === 0) { toast('该供应商没有待催的订单', 'warn'); return; }
  
  // 按下单日期排序（最早下单的在前，最该催）
  orders.sort((a, b) => (a.orderDate || '9999').localeCompare(b.orderDate || '9999'));
  
  const today = new Date().toISOString().slice(0, 10);
  const dateStr = today.replace(/-/g, '/');
  
  // 统计
  let totalOverdueDays = 0;
  let overdueCount = 0;
  let totalChase = 0;
  orders.forEach(o => {
    if (o.promisedDate && o.promisedDate < today) {
      const days = Math.floor((new Date(today) - new Date(o.promisedDate)) / 86400000);
      totalOverdueDays += days;
      overdueCount++;
    }
    totalChase += (o.followups || []).filter(f => f.type === 'chase').length;
  });
  const avgOverdue = overdueCount > 0 ? Math.round(totalOverdueDays / overdueCount) : 0;
  
  const headers = ['序号','订单号','产品图','产品 / SKU','下单日期','原承诺发货日','当前状态','已逾期(天)','已催次数','最后跟进','我方备注'];
  
  const rows = orders.map((o, i) => {
    const days = o.promisedDate && o.promisedDate < today ? Math.floor((new Date(today) - new Date(o.promisedDate)) / 86400000) : 0;
    const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
    const last = o.followups && o.followups.length > 0 ? o.followups[o.followups.length - 1] : null;
    return [
      i + 1, o.orderNo || '', '', o.product || '',
      o.orderDate || '', o.promisedDate || '',
      ORDER_STATUS_LABELS[o.status] || '',
      days > 0 ? days : '',
      chaseCount > 0 ? chaseCount : '',
      last ? `[${last.date}] ${last.note}` : '',
      o.notes || '',
    ];
  });
  
  // 构造工作表(ExcelJS · 嵌入小产品图)
  try { await _loadExcelJS(); }
  catch (e) { toast('Excel 组件加载失败:' + (e.message || e) + ' · 请检查网络', 'err', 6000); return; }
  toast(`正在生成对账单(含 ${orders.length} 张产品图)…`, 'info', 8000);
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((supplier || 'sheet').slice(0, 30));
  const IMG_COL = 3;   // 产品图列(第3列)

  ws.addRow([`${supplier} - 滞留订单对账清单`]);
  ws.addRow([`生成日期: ${dateStr}    共 ${orders.length} 单待发货    其中逾期 ${overdueCount} 单    平均逾期 ${avgOverdue} 天    累计催单 ${totalChase} 次`]);
  ws.addRow([]);
  ws.addRow(['请贵司核对以下订单并尽快回复发货计划：']);
  ws.addRow([]);
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell(c => { c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; });
  const dataStartRow = ws.rowCount + 1;   // 数据首行(1-based)

  // 数据行
  const dataRowRefs = [];
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.alignment = { vertical: 'middle', wrapText: true };
    dataRowRefs.push(row);
  });

  // 列宽(对应:序号/订单号/产品图/产品·SKU/下单/承诺/状态/逾期/催次/最后跟进/备注)
  const widths = [6, 16, 10, 28, 12, 12, 11, 10, 9, 36, 26];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // 贴图:先按 SKU 反查产品库图(PO 派生单 line_items 常没存图)· 再抓服务器图压小嵌入
  let pmap = {};
  try {
    const skus = _chaseOrdersSkus(orders);
    if (skus.length && SHOPIFY.loadProductImageMap) pmap = await SHOPIFY.loadProductImageMap(skus);
  } catch (e) { console.warn('[对账单] 产品图反查失败:', e); }
  const urls = orders.map(o => _chaseOrderImageUrl(o, pmap));
  const dataURLs = await Promise.all(urls.map(u => _fetchImageSmall(u, 56)));
  let embedded = 0;
  for (let i = 0; i < orders.length; i++) {
    const du = dataURLs[i];
    const rowNo = dataStartRow + i;     // 1-based
    if (du) {
      try {
        const imageId = wb.addImage({ base64: du, extension: 'jpeg' });
        ws.getRow(rowNo).height = 44;
        // 锚点用 0-based · 在产品图列居中放一张 ~52px 的小图
        ws.addImage(imageId, {
          tl: { col: (IMG_COL - 1) + 0.12, row: (rowNo - 1) + 0.08 },
          ext: { width: 52, height: 52 },
          editAs: 'oneCell',
        });
        embedded++;
      } catch (e) { /* 单张失败不影响整体 */ }
    }
  }

  // ===== 美化排版 =====
  const thin = { style: 'thin', color: { argb: 'FFD0D7DE' } };
  const allBorder = { top: thin, left: thin, bottom: thin, right: thin };
  const N2 = headers.length;
  // 表头描边 + 颜色(覆盖之前的浅色,改成主题绿)
  headerRow.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = allBorder;
  });
  headerRow.height = 24;
  // 各列对齐(序号/订单号/产品图/下单/承诺/状态/逾期/催次 居中;产品·SKU/最后跟进/备注 左对齐)
  const centerCols = [1, 2, 3, 5, 6, 7, 8, 9];
  dataRowRefs.forEach((row, idx) => {
    // 斑马纹
    if (idx % 2 === 1) {
      for (let c = 1; c <= N2; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FA' } };
    }
    for (let c = 1; c <= N2; c++) {
      const cell = row.getCell(c);
      cell.border = allBorder;
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: centerCols.includes(c) ? 'center' : 'left' };
      cell.font = cell.font || { size: 10.5 };
    }
    // 逾期天数(第7列)>0 标红加粗
    const od = row.getCell(7).value;
    if (od && Number(od) > 0) row.getCell(7).font = { bold: true, color: { argb: 'FFDC2626' } };
  });
  // 冻结表头行(及其上方标题)
  ws.views = [{ state: 'frozen', ySplit: dataStartRow - 1 }];
  // 自动筛选(表头整行)
  try { ws.autoFilter = { from: { row: dataStartRow - 1, column: 1 }, to: { row: dataStartRow - 1, column: N2 } }; } catch (e) {}

  // 说明(数据行之后)
  ws.addRow([]);
  ['说明：',
   '1. 以上订单均为我司已下采购单但贵司尚未发货的订单',
   '2. 「原承诺发货日」为贵司当初承诺的发货日期，请贵司确认',
   '3. 请于收到此表 3 个工作日内回复每单的最新发货计划',
   '4. 如有特殊情况，请及时与对接跟单员联系'].forEach(t => ws.addRow([t]));

  // 合并标题/说明行(跨所有列)
  const N = headers.length;
  ws.mergeCells(1, 1, 1, N);
  ws.mergeCells(2, 1, 2, N);
  ws.mergeCells(4, 1, 4, N);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(1).alignment = { horizontal: 'center' };

  // 导出
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${supplier}_滞留订单对账_${today}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  toast(`✓ 已导出 ${orders.length} 单对账清单 · 嵌入 ${embedded} 张产品图`);
}

// ============ 批量催单 ============
let _bcSupplier = null;
let _bcType = 'chase';
let _bcScreenshots = [];
let _bcSelectedIds = new Set();

function openBatchChase(supplier) {
  _bcSupplier = supplier;
  _bcType = 'chase';
  _bcScreenshots = [];
  _bcSelectedIds = new Set();
  
  // V3：从 PO 派生数据找该供应商所有待催 PO
  const items = CHASE_ORDERS.filter(o => o.supplier === supplier && !['cancelled','shipped','arrived'].includes(o.status));
  
  if (items.length === 0) { toast('该供应商没有待催的订单', 'warn'); return; }
  
  // 默认全选
  items.forEach(o => _bcSelectedIds.add(o._id));
  
  // 渲染
  document.getElementById('bcSupplierTitle').textContent = `供应商：${supplier} · ${items.length} 单待催`;
  document.getElementById('bcDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bcNote').value = '';
  document.getElementById('bcThumbs').innerHTML = '';
  document.querySelectorAll('#batchChaseModal .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === 'chase'));
  
  renderBcOrdersList(items);
  document.getElementById('batchChaseModal').classList.add('show');
}

function renderBcOrdersList(items) {
  const html = items.map(o => {
    const eff = getOrderEffStatus(o);
    const promisedCls = getDateClass(o.promisedDate);
    const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
    const checked = _bcSelectedIds.has(o._id);
    return `
      <div class="bc-order-item" onclick="bcToggle('${o._id}')">
        <input type="checkbox" ${checked ? 'checked' : ''} data-id="${o._id}" onclick="event.stopPropagation();" onchange="bcToggle('${o._id}')">
        <div class="order-no">${escapeHtml(o.orderNo || '—')}</div>
        <div class="product">${escapeHtml(o.product || '(无产品描述)')}</div>
        <div class="promised ${promisedCls}">${formatShortDate(o.promisedDate)}${eff === 'overdue' ? ' ⚠' : ''}</div>
        <div class="chase-count ${chaseCount >= 3 ? 'high' : ''}">已催${chaseCount}次</div>
      </div>
    `;
  }).join('');
  document.getElementById('bcOrdersList').innerHTML = html;
  updateBcCount();
}

function bcToggle(id) {
  if (_bcSelectedIds.has(id)) _bcSelectedIds.delete(id);
  else _bcSelectedIds.add(id);
  // 重新渲染（更新 checked 状态）—— V3 用 CHASE_ORDERS
  const items = CHASE_ORDERS.filter(o => o.supplier === _bcSupplier && !['cancelled','shipped','arrived'].includes(o.status));
  renderBcOrdersList(items);
}

function bcSelectAll(yes) {
  const items = CHASE_ORDERS.filter(o => o.supplier === _bcSupplier && !['cancelled','shipped','arrived'].includes(o.status));
  if (yes) items.forEach(o => _bcSelectedIds.add(o._id));
  else _bcSelectedIds.clear();
  renderBcOrdersList(items);
}

function updateBcCount() {
  document.getElementById('bcSelectedCount').textContent = `已选 ${_bcSelectedIds.size} 单`;
}

function setBcType(t) {
  _bcType = t;
  document.querySelectorAll('#batchChaseModal .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === t));
}

async function saveBatchChase() {
  if (_bcSelectedIds.size === 0) { toast('请至少选 1 单', 'warn'); return; }
  const note = document.getElementById('bcNote').value.trim();
  const date = document.getElementById('bcDate').value || new Date().toISOString().slice(0, 10);
  if (!note && _bcScreenshots.length === 0) { toast('请输入催单内容或上传截图', 'warn'); return; }
  
  // V3：每个 PO 直接调 supabase update（不再走旧 DATA.saveOrders）
  const targets = CHASE_ORDERS.filter(o => _bcSelectedIds.has(o._id));
  let count = 0;
  const errors = [];
  for (const o of targets) {
    const newFollowup = {
      type: _bcType, date,
      time: new Date().toTimeString().slice(0, 5),
      note,
      screenshots: [..._bcScreenshots],
      _batch: true,
    };
    const newFollowups = [...(o.followups || []), newFollowup];
    o.followups = newFollowups; // 同步更新本地缓存
    const updates = {
      followups: newFollowups,
      updated_at: new Date().toISOString(),
    };
    // ship/arrive 类型可能自动切状态
    if (_bcType === 'ship' && ['pending','producing'].includes(o.status)) {
      updates.status = 'shipped';
      if (!o.shippedDate) { updates.shipped_date = date; o.shippedDate = date; }
      o.status = 'shipped';
    }
    if (_bcType === 'arrive' && o.status === 'shipped') {
      updates.status = 'arrived';
      if (!o.arrivedDate) { updates.arrived_date = date; o.arrivedDate = date; }
      o.status = 'arrived';
    }
    try {
      const { error } = await sb.from('orders').update(updates).eq('id', o._id);
      if (error) throw error;
      count++;
    } catch (err) {
      errors.push(`${o.orderNo}: ${err.message || err}`);
    }
  }
  
  closeModal('batchChaseModal');
  // 重新加载 PO 派生数据
  await loadChaseOrders(true);
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
  if (errors.length > 0) {
    toast(`✓ 批量催单 ${count} 单成功，${errors.length} 单失败`, 'warn', 6000);
    console.error('批量催单失败明细:', errors);
  } else {
    toast(`✓ 已批量催单 ${count} 个订单`);
  }
}

// ============ 批量催单截图（用 _pasteTarget 复用全局粘贴）============
function setupBatchChaseScreenshot() {
  const dz = document.getElementById('bcDropZone');
  const fi = document.getElementById('bcFileInput');
  if (!dz || !fi || dz.dataset.bound) return;
  dz.dataset.bound = '1';
  dz.addEventListener('click', e => { if (e.target.tagName !== 'A') fi.click(); });
  fi.addEventListener('change', e => handleBcFiles(e.target.files));
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); _pasteTarget = 'batch_chase'; });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); handleBcFiles(e.dataTransfer.files); });
  dz.addEventListener('mouseenter', () => { _pasteTarget = 'batch_chase'; });
}

async function handleBcFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) { toast(`${file.name} 不是图片`, 'err'); continue; }
    try {
      const dataURL = await compressImage(file);
      const url = await uploadScreenshotToStorage(dataURL);
      _bcScreenshots.push(url);
      renderBcThumbs();
    } catch (err) {
      console.error(err);
      toast('图片上传失败：' + (err.message || err), 'err');
    }
  }
}

function renderBcThumbs() {
  document.getElementById('bcThumbs').innerHTML = _bcScreenshots.map((s, i) => `
    <div class="drop-zone-thumb">
      <img src="${s}" onclick="viewImage('${s}')">
      <button class="rm" onclick="rmBcThumb(${i})">×</button>
    </div>
  `).join('');
}

function rmBcThumb(i) {
  _bcScreenshots.splice(i, 1);
  renderBcThumbs();
}

