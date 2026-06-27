// ============================================================================
// workmain.js · 工作主线(镜像客服端 售后/补件/退款/月度汇总)
// V20260626-wm1:第一期只做【退款管理】(含「已处理退货」跟单动作),其余三个子标签占位。
// 数据源:客服 CLOUD 库 kwrajryhwyytkjkkidor · 表 refunds(复用 offline-orders 的 _getCsOffline() client)
// 边界:客服审核流 refunds.status 只读;跟单只写 return_status / return_handled_at / return_handled_by。
// ============================================================================

const WORKMAIN = {
  _sub: 'refunds',          // refunds | aftersales | refills | summary
  _refunds: [],
  _loaded: false,
  _loading: false,
  _expanded: null,          // 当前展开详情的 refund id
  // 筛选
  _search: '',
  _time: '',                // ''=全部 today/yesterday/week/month/quarter/year
  _supplier: '',
  _status: '',
  _type: '',
  _operator: '',
  _return: '',              // ''=全部 pending=待处理退货 handled=已处理退货
  // 补件追踪
  _refills: [],             // 统一形状(refills 表 + aftersales 带 refill 的行)
  _refillsLoaded: false,
  _refillsLoading: false,
  _refillScope: '',         // ''=全部 parts whole_lamp
  _refillStatus: '',        // ''=全部 pending_order ordered ...
  // 售后清单
  _aftersales: [],
  _asLoaded: false,
  _asLoading: false,
  _asStatus: '',
  _asType: '',
  _page: 0,
  _pageSize: 20,
};

// ---- 小工具 ----
function _wmEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function _wmToast(msg, type) { try { toast(msg, type); } catch (_) { /* no-op */ } }
function _wmCs() { return (typeof _getCsOffline === 'function') ? _getCsOffline() : null; }

// 枚举展示(已知的给中文,未知的把 key 人性化兜底;退款类型筛选项直接从数据里取真实值,不靠硬编码)
const _WM_STATUS = { pending: '待审核', approved: '已审核·待退', completed: '已完成', rejected: '已拒绝' };
const _WM_STATUS_CLS = { pending: 'wm-st-pending', approved: 'wm-st-approved', completed: 'wm-st-done', rejected: 'wm-st-reject' };
const _WM_TYPE = {
  customer_cancel: '客户取消', quality_issue: '质量问题', damaged: '运损/破损', wrong_item: '发错货',
  lost_in_transit: '运输丢失', missing_parts: '缺件', not_as_described: '货不对板', price_adjustment: '差价',
  late_delivery: '延误', changed_mind: '客户改主意', duplicate: '重复下单', other: '其它',
};
const _WM_PAY = {
  shopify_payments: 'Shopify Payments', paypal: 'PayPal', stripe: 'Stripe',
  credit_card: '信用卡', bank_transfer: '银行转账', other: '其它',
};
function _wmHumanize(k) { return String(k || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function _wmTypeLabel(r) { return r.refund_type_custom || _WM_TYPE[r.refund_type] || _wmHumanize(r.refund_type) || '—'; }
function _wmPayLabel(r) { return r.payment_method_custom || _WM_PAY[r.payment_method] || _wmHumanize(r.payment_method) || '—'; }

// 补件枚举
const _WM_REFILL_STATUS = { pending_order: '待下单', ordered: '已下单', producing: '生产中', shipped: '已发货', delivered: '已送达' };
const _WM_REFILL_STATUS_ORDER = ['pending_order', 'ordered', 'producing', 'shipped', 'delivered'];
const _WM_REFILL_STATUS_CLS = { pending_order: 'wm-st-pending', ordered: 'wm-st-approved', producing: 'wm-st-approved', shipped: 'wm-st-approved', delivered: 'wm-st-done' };
const _WM_SCOPE = { parts: '小配件(客服下单)', whole_lamp: '整灯(跟单下单)' };

// 售后枚举(已知给中文 · 未知人性化兜底 · 筛选项从真实数据取)
const _WM_ISSUE = {
  transport_damage: '运输破损', quality_issue: '质量问题', missing_parts: '缺件', wrong_item: '发错货',
  defective: '功能瑕疵', not_as_described: '货不对板', wrong_spec: '规格不符', color_diff: '色差',
  broken: '破损', missing_accessory: '缺配件', other: '其它',
};
const _WM_AS_STATUS = {
  pending_remind: '待提醒', reminded: '已提醒', processing: '处理中', awaiting_supplier: '待供应商',
  resolved: '已解决', closed: '已关闭', pending: '待处理',
};
const _WM_AS_STATUS_CLS = {
  pending_remind: 'wm-st-pending', pending: 'wm-st-pending', reminded: 'wm-st-approved',
  processing: 'wm-st-approved', awaiting_supplier: 'wm-st-approved', resolved: 'wm-st-done', closed: 'wm-st-done',
};
function _wmIssueLabel(r) { return r.issue_type_custom || _WM_ISSUE[r.issue_type] || _wmHumanize(r.issue_type) || '—'; }

function _wmFmtTime(s) {
  if (!s) return '';
  try { const d = new Date(s); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  catch (_) { return ''; }
}
function _wmFmtDate(s) {
  if (!s) return '';
  try { const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  catch (_) { return ''; }
}

// 时间快筛:判断某日期是否落在所选范围
function _wmInTime(dateStr, key) {
  if (!key) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr); if (isNaN(d)) return false;
  const now = new Date();
  const sod = x => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const today = sod(now);
  if (key === 'today') return sod(d).getTime() === today.getTime();
  if (key === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); return sod(d).getTime() === y.getTime(); }
  if (key === 'week') { const w = new Date(today); const dow = (w.getDay() + 6) % 7; w.setDate(w.getDate() - dow); return d >= w; }
  if (key === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (key === 'quarter') { const q = Math.floor(now.getMonth() / 3); return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q; }
  if (key === 'year') return d.getFullYear() === now.getFullYear();
  return true;
}

// ---- 加载 ----
async function loadWorkmainRefunds(force) {
  if (WORKMAIN._loading) return;
  if (WORKMAIN._loaded && !force) return;
  const cs = _wmCs();
  if (!cs) { _wmToast('客服库未连接', 'err'); return; }
  WORKMAIN._loading = true;
  try {
    const cols = 'id,record_id,order_ref,customer,product_name,refund_type,refund_type_custom,amount,currency,' +
      'payment_method,payment_method_custom,refund_reason,supplier_name,supplier_names,status,' +
      'created_by,created_by_name,approved_by_name,approved_at,approval_notes,processed_by_name,processed_at,processing_notes,' +
      'notes,attachments,flagged,deleted,archived,created_at,updated_at,return_status,return_handled_at,return_handled_by';
    const { data, error } = await cs.from('refunds')
      .select(cols).order('created_at', { ascending: false }).limit(1000);
    if (error) throw error;
    // 默认隐藏 deleted / archived(null 视为未删/未存档)
    WORKMAIN._refunds = (data || []).filter(r => !r.deleted && !r.archived);
    WORKMAIN._loaded = true;
  } catch (e) {
    const m = e.message || String(e);
    if (/permission denied|row-level security|42501/i.test(m)) {
      _wmToast('权限被拒:客服库需放行 anon 读 refunds', 'err');
    } else if (/relation .*refunds.* does not exist/i.test(m)) {
      _wmToast('客服库未找到 refunds 表', 'err');
    } else {
      _wmToast('加载退款失败:' + m, 'err');
    }
    console.warn('[工作主线] 加载 refunds 失败', e);
  } finally {
    WORKMAIN._loading = false;
  }
}

// ---- 筛选计算 ----
function _wmFilteredRefunds() {
  const kw = (WORKMAIN._search || '').trim().toLowerCase();
  return WORKMAIN._refunds.filter(r => {
    if (WORKMAIN._time && !_wmInTime(r.created_at, WORKMAIN._time)) return false;
    if (WORKMAIN._supplier && (r.supplier_name || r.supplier_names || '') !== WORKMAIN._supplier) return false;
    if (WORKMAIN._status && r.status !== WORKMAIN._status) return false;
    if (WORKMAIN._type && r.refund_type !== WORKMAIN._type) return false;
    if (WORKMAIN._operator && (r.created_by_name || '') !== WORKMAIN._operator) return false;
    if (WORKMAIN._return === 'handled' && r.return_status !== 'handled') return false;
    if (WORKMAIN._return === 'pending' && r.return_status === 'handled') return false;
    if (kw) {
      const hay = [r.order_ref, r.customer, r.product_name, r.refund_reason, r.created_by_name, r.notes]
        .map(x => String(x || '').toLowerCase()).join(' ');
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// ---- 渲染:整 tab ----
function renderWorkmain() {
  const host = document.getElementById('workmainRoot');
  if (!host) return;

  const subTabs = [
    { k: 'refunds', label: '💸 退款管理' },
    { k: 'aftersales', label: '🧰 售后清单' },
    { k: 'refills', label: '📦 补件追踪' },
    { k: 'summary', label: '📊 月度汇总' },
  ];
  const subBar = `<div class="wm-subtabs">${subTabs.map(t =>
    `<button class="wm-subtab ${WORKMAIN._sub === t.k ? 'active' : ''}" onclick="workmainSetSub('${t.k}')">${t.label}</button>`
  ).join('')}</div>`;

  let body = '';
  if (WORKMAIN._sub === 'refunds') body = _wmRenderRefunds();
  else if (WORKMAIN._sub === 'refills') body = _wmRenderRefills();
  else if (WORKMAIN._sub === 'aftersales') body = _wmRenderAftersales();
  else body = `<div class="wm-placeholder">🚧 「${subTabs.find(t => t.k === WORKMAIN._sub).label.replace(/^[^\s]+\s/, '')}」即将上线<br><span>售后/补件/退款已上线,月度汇总收尾中。</span></div>`;

  host.innerHTML = `<div class="wm-wrap">${subBar}${body}</div>`;
}

function workmainSetSub(k) {
  WORKMAIN._sub = k;
  WORKMAIN._page = 0;
  renderWorkmain();
  if (k === 'refunds' && !WORKMAIN._loaded) loadWorkmainRefunds().then(renderWorkmain);
  if (k === 'refills' && !WORKMAIN._refillsLoaded) loadWorkmainRefills().then(renderWorkmain);
  if (k === 'aftersales' && !WORKMAIN._asLoaded) loadWorkmainAftersales().then(renderWorkmain);
}

// ---- 渲染:退款管理子标签 ----
function _wmRenderRefunds() {
  if (WORKMAIN._loading && !WORKMAIN._loaded) {
    return `<div class="wm-placeholder">加载中…</div>`;
  }

  const all = WORKMAIN._refunds;
  const list = _wmFilteredRefunds();

  // 筛选项来源(从真实数据取,保证和库一致)
  const suppliers = [...new Set(all.map(r => r.supplier_name || r.supplier_names).filter(Boolean))].sort();
  const operators = [...new Set(all.map(r => r.created_by_name).filter(Boolean))].sort();
  const types = [...new Set(all.map(r => r.refund_type).filter(Boolean))].sort();

  const opt = (v, label, cur) => `<option value="${_wmEsc(v)}" ${cur === v ? 'selected' : ''}>${_wmEsc(label)}</option>`;
  const timeChips = [['', '全部'], ['today', '今天'], ['yesterday', '昨天'], ['week', '本周'], ['month', '本月'], ['quarter', '本季'], ['year', '本年']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._time === k ? 'active' : ''}" onclick="workmainSetTime('${k}')">${l}</button>`).join('');
  const returnChips = [['', '全部退货'], ['pending', '🟠 待处理退货'], ['handled', '✅ 已处理退货']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._return === k ? 'active' : ''}" onclick="workmainSetReturn('${k}')">${l}</button>`).join('');

  const filterBar = `
    <div class="wm-filters">
      <div class="wm-filter-row">
        <input class="wm-search" type="text" placeholder="搜索 订单号 / 客户 / 产品 / 原因 / 录入人…"
               value="${_wmEsc(WORKMAIN._search)}" oninput="workmainSetSearch(this.value)">
        <select class="wm-sel" onchange="workmainSetStatus(this.value)">
          <option value="">全部状态</option>
          ${['pending', 'approved', 'completed', 'rejected'].map(s => opt(s, _WM_STATUS[s], WORKMAIN._status)).join('')}
        </select>
        <select class="wm-sel" onchange="workmainSetType(this.value)">
          <option value="">全部退款类型</option>
          ${types.map(t => opt(t, _WM_TYPE[t] || _wmHumanize(t), WORKMAIN._type)).join('')}
        </select>
        <select class="wm-sel" onchange="workmainSetSupplier(this.value)">
          <option value="">全部供应商</option>
          ${suppliers.map(s => opt(s, s, WORKMAIN._supplier)).join('')}
        </select>
        <select class="wm-sel" onchange="workmainSetOperator(this.value)">
          <option value="">全部录入人</option>
          ${operators.map(s => opt(s, s, WORKMAIN._operator)).join('')}
        </select>
        <button class="wm-btn-clear" onclick="workmainClearFilters()">✕ 清除</button>
        <button class="wm-btn-refresh" onclick="loadWorkmainRefunds(true).then(renderWorkmain)">🔄 刷新</button>
      </div>
      <div class="wm-chip-row">${timeChips}<span class="wm-sep"></span>${returnChips}</div>
    </div>`;

  // 分页
  const total = list.length;
  const pageSize = WORKMAIN._pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (WORKMAIN._page >= totalPages) WORKMAIN._page = 0;
  const page = WORKMAIN._page;
  const slice = list.slice(page * pageSize, page * pageSize + pageSize);

  const pager = _wmPager(page, totalPages, total);

  const rows = slice.length
    ? slice.map(_wmRefundCard).join('')
    : `<div class="wm-empty">没有符合条件的退款记录</div>`;

  // 顶部统计
  const handledCnt = list.filter(r => r.return_status === 'handled').length;
  const stat = `<div class="wm-stat">共 <b>${total}</b> 笔 · 已处理退货 <b>${handledCnt}</b> · 待处理退货 <b>${total - handledCnt}</b></div>`;

  return `${filterBar}${stat}${pager}<div class="wm-list">${rows}</div>${total > pageSize ? pager : ''}`;
}

function _wmPager(page, totalPages, total) {
  if (totalPages <= 1) return '';
  const btn = (p, label, dis) => `<button class="wm-page-btn" ${dis ? 'disabled' : ''} onclick="workmainSetPage(${p})">${label}</button>`;
  let nums = '';
  const win = 2;
  for (let i = Math.max(0, page - win); i <= Math.min(totalPages - 1, page + win); i++) {
    nums += `<button class="wm-page-btn ${i === page ? 'active' : ''}" onclick="workmainSetPage(${i})">${i + 1}</button>`;
  }
  return `<div class="wm-pager">
    ${btn(0, '«', page === 0)}${btn(page - 1, '‹', page === 0)}
    ${nums}
    ${btn(page + 1, '›', page >= totalPages - 1)}${btn(totalPages - 1, '»', page >= totalPages - 1)}
    <span class="wm-page-info">第 ${page + 1}/${totalPages} 页 · 共 ${total} 笔</span>
    <select class="wm-sel wm-page-size" onchange="workmainSetPageSize(this.value)">
      ${[20, 50, 100].map(n => `<option value="${n}" ${WORKMAIN._pageSize === n ? 'selected' : ''}>${n}/页</option>`).join('')}
    </select>
  </div>`;
}

// ---- 单行卡片 ----
function _wmRefundCard(r) {
  const st = _WM_STATUS[r.status] || r.status || '—';
  const stCls = _WM_STATUS_CLS[r.status] || '';
  const handled = r.return_status === 'handled';
  const returnBadge = handled
    ? `<span class="wm-rb wm-rb-done" title="处理人 ${_wmEsc(r.return_handled_by || '')} · ${_wmFmtTime(r.return_handled_at)}">✅ 已处理退货</span>`
    : `<span class="wm-rb wm-rb-pending">🟠 待处理退货</span>`;
  const amount = (r.amount != null ? Number(r.amount).toFixed(2) : '—') + ' ' + (r.currency || '');
  const expanded = WORKMAIN._expanded === r.id;
  const imgCnt = Array.isArray(r.attachments) ? r.attachments.length : 0;

  const actionBtn = handled
    ? `<button class="wm-act wm-act-undo" onclick="workmainToggleReturn(${r.id}, false)">↩ 取消已处理</button>`
    : `<button class="wm-act wm-act-done" onclick="workmainToggleReturn(${r.id}, true)">✅ 标记已处理退货</button>`;

  return `
  <div class="wm-card ${expanded ? 'expanded' : ''}" data-id="${r.id}">
    <div class="wm-card-head" onclick="workmainToggleExpand(${r.id})">
      <div class="wm-card-main">
        <span class="wm-order">${_wmEsc(r.order_ref || '无单号')}</span>
        <span class="wm-cust">${_wmEsc(r.customer || '—')}</span>
        <span class="wm-prod">${_wmEsc(r.product_name || '—')}</span>
      </div>
      <div class="wm-card-meta">
        <span class="wm-type">${_wmEsc(_wmTypeLabel(r))}</span>
        <span class="wm-amount">${_wmEsc(amount)}</span>
        <span class="wm-status ${stCls}">${_wmEsc(st)}</span>
        ${returnBadge}
        <span class="wm-exp-arrow">${expanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div class="wm-card-sub">
      <span>录入 ${_wmEsc(r.created_by_name || '—')} · ${_wmFmtDate(r.created_at)}</span>
      ${r.supplier_name || r.supplier_names ? `<span>供应商 ${_wmEsc(r.supplier_name || r.supplier_names)}</span>` : ''}
      ${imgCnt ? `<span>📎 ${imgCnt} 图</span>` : ''}
      <span class="wm-card-actions">${actionBtn}</span>
    </div>
    ${expanded ? _wmRefundDetail(r) : ''}
  </div>`;
}

// ---- 详情(展开时懒渲染,图片只在这里才建 img)----
function _wmRefundDetail(r) {
  const row = (k, v) => v ? `<div class="wm-d-row"><span class="wm-d-k">${k}</span><span class="wm-d-v">${_wmEsc(v)}</span></div>` : '';
  const flow = [
    r.created_by_name ? `录入 ${r.created_by_name}（${_wmFmtTime(r.created_at)}）` : '',
    r.approved_by_name ? `审核 ${r.approved_by_name}（${_wmFmtTime(r.approved_at)}）` : '',
    r.processed_by_name ? `处理 ${r.processed_by_name}（${_wmFmtTime(r.processed_at)}）` : '',
  ].filter(Boolean).join('  →  ');

  let imgs = '';
  if (Array.isArray(r.attachments) && r.attachments.length) {
    imgs = `<div class="wm-d-imgs">${r.attachments.map(a => {
      const url = (a && (a.url || a)) || '';
      if (!url || /^data:/.test(String(url))) return '';   // 不渲染 base64
      return `<a href="${_wmEsc(url)}" target="_blank" rel="noopener"><img loading="lazy" src="${_wmEsc(url)}" alt=""></a>`;
    }).join('')}</div>`;
  }

  return `<div class="wm-detail">
    <div class="wm-d-flow">${flow || '—'}</div>
    ${row('退款类型', _wmTypeLabel(r))}
    ${row('退款原因', r.refund_reason)}
    ${row('金额', (r.amount != null ? Number(r.amount).toFixed(2) : '') + ' ' + (r.currency || ''))}
    ${row('支付方式', _wmPayLabel(r))}
    ${row('客服审核状态', _WM_STATUS[r.status] || r.status)}
    ${row('审核备注', r.approval_notes)}
    ${row('处理备注', r.processing_notes)}
    ${row('备注', r.notes)}
    ${r.return_status === 'handled' ? row('已处理退货', `${r.return_handled_by || ''} · ${_wmFmtTime(r.return_handled_at)}`) : ''}
    ${imgs}
    <div class="wm-d-note">客服审核流(状态/审核/处理)只读;跟单仅可标记「已处理退货」。</div>
  </div>`;
}

// ---- 交互 ----
function workmainToggleExpand(id) {
  WORKMAIN._expanded = (WORKMAIN._expanded === id) ? null : id;
  renderWorkmain();
}
function workmainSetSub2() { /* reserved */ }
function workmainSetSearch(v) { WORKMAIN._search = v; WORKMAIN._page = 0; _wmRerenderListOnly(); }
function workmainSetTime(k) { WORKMAIN._time = k; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetStatus(v) { WORKMAIN._status = v; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetType(v) { WORKMAIN._type = v; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetSupplier(v) { WORKMAIN._supplier = v; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetOperator(v) { WORKMAIN._operator = v; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetReturn(k) { WORKMAIN._return = k; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetPage(p) { WORKMAIN._page = p; renderWorkmain(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function workmainSetPageSize(n) { WORKMAIN._pageSize = parseInt(n) || 20; WORKMAIN._page = 0; renderWorkmain(); }
function workmainClearFilters() {
  WORKMAIN._search = ''; WORKMAIN._time = ''; WORKMAIN._supplier = '';
  WORKMAIN._status = ''; WORKMAIN._type = ''; WORKMAIN._operator = ''; WORKMAIN._return = '';
  WORKMAIN._refillScope = ''; WORKMAIN._refillStatus = '';
  WORKMAIN._asStatus = ''; WORKMAIN._asType = '';
  WORKMAIN._page = 0; renderWorkmain();
}
// 搜索时只重渲列表区(不重建输入框,避免光标跳走)
function _wmRerenderListOnly() {
  const host = document.getElementById('workmainRoot');
  if (!host) return;
  const wrap = host.querySelector('.wm-wrap');
  if (!wrap) { renderWorkmain(); return; }
  // 简化:整块重渲(输入用 oninput 已即时);为保光标,只在内容真的变时重渲
  renderWorkmain();
  const inp = host.querySelector('.wm-search');
  if (inp) { inp.focus(); const v = inp.value; inp.value = ''; inp.value = v; }
}

// ---- 跟单动作:已处理退货 ----
async function workmainToggleReturn(id, handled) {
  const cs = _wmCs();
  if (!cs) { _wmToast('客服库未连接', 'err'); return; }
  const r = WORKMAIN._refunds.find(x => x.id === id);
  if (!r) return;
  const patch = handled
    ? { return_status: 'handled', return_handled_at: new Date().toISOString(), return_handled_by: (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '' }
    : { return_status: null, return_handled_at: null, return_handled_by: null };
  try {
    const { error } = await cs.from('refunds').update(patch).eq('id', id);
    if (error) throw error;
    Object.assign(r, patch);   // 本地同步
    _wmToast(handled ? '已标记「已处理退货」' : '已取消退货标记', 'success');
    // V20260626:跟单点「已处理退货」后,自动发跨部门消息通知客服(取消不发)
    if (handled) {
      _wmNotifyCs(
        r,
        `跟单已处理退货 · ${r.order_ref || '无单号'}`,
        `订单 ${r.order_ref || '—'} · ${r.customer || ''} · ${r.product_name || ''}\n动作:已处理退货\n处理人:${patch.return_handled_by || ''}\n时间:${_wmFmtTime(patch.return_handled_at)}`,
        'refund_return_handled'
      );
    }
    renderWorkmain();
  } catch (e) {
    const m = e.message || String(e);
    if (/permission denied|row-level security|42501/i.test(m)) _wmToast('权限被拒:客服库需放行 anon 更新 refunds', 'err');
    else _wmToast('操作失败:' + m, 'err');
    console.warn('[工作主线] 退货标记失败', e);
  }
}

// ============ 补件追踪(refills 表 + aftersales 带 refill 的行)============

// 把 refills 行 / aftersales 行 归一成统一形状
function _wmNormRefill(row, src) {
  let itemsText = '';
  if (src === 'refills') {
    const items = Array.isArray(row.items) ? row.items : [];
    itemsText = items.map(it => {
      const p = it.product || it.item || '';
      const q = it.qty != null ? ` ×${it.qty}` : '';
      return (p + q).trim();
    }).filter(Boolean).join(' / ');
    if (!itemsText) itemsText = row.product_name || '';
  } else { // aftersales
    const q = row.refill_qty != null ? ` ×${row.refill_qty}` : '';
    itemsText = (row.product_name || '') + (row.sku ? ` (${row.sku})` : '') + q;
    if (row.refill_note) itemsText += ` · ${row.refill_note}`;
  }
  return {
    _src: src,
    id: row.id,
    order_ref: row.order_ref,
    customer: row.customer,
    product_name: row.product_name,
    items_text: itemsText.trim(),
    supplier_name: row.supplier_name || row.supplier_names || '',
    refill_status: row.refill_status || 'pending_order',
    refill_scope: row.refill_scope || '',
    refill_ordered_by: row.refill_ordered_by || '',
    refill_ordered_at: row.refill_ordered_at || null,
    created_by: row.created_by || null,
    created_by_name: row.created_by_name || '',
    created_at: row.created_at,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    _raw: row,
  };
}

async function loadWorkmainRefills(force) {
  if (WORKMAIN._refillsLoading) return;
  if (WORKMAIN._refillsLoaded && !force) return;
  const cs = _wmCs();
  if (!cs) { _wmToast('客服库未连接', 'err'); return; }
  WORKMAIN._refillsLoading = true;
  try {
    const merged = [];
    // 1) aftersales 中需要补件的行(refill_needed=true)· aftersales 无 archived 列,只按 deleted 过滤
    const asCols = 'id,record_id,order_ref,customer,product_name,sku,supplier_name,supplier_names,' +
      'refill_needed,refill_status,refill_qty,refill_note,refill_scope,refill_ordered_by,refill_ordered_at,' +
      'created_by,created_by_name,created_at,attachments,deleted';
    const { data: asRows, error: asErr } = await cs.from('aftersales')
      .select(asCols).eq('refill_needed', true).order('created_at', { ascending: false }).limit(1000);
    if (asErr) throw asErr;
    (asRows || []).filter(r => !r.deleted).forEach(r => merged.push(_wmNormRefill(r, 'aftersales')));

    // 2) refills 表(结构未知且通常为空 · select * 防御性读 · 客户端过滤 deleted/archived)
    try {
      const { data: rfRows, error: rfErr } = await cs.from('refills')
        .select('*').order('created_at', { ascending: false }).limit(1000);
      if (!rfErr) (rfRows || []).filter(r => !r.deleted && !r.archived).forEach(r => merged.push(_wmNormRefill(r, 'refills')));
    } catch (_) { /* refills 不存在/为空都不致命 */ }

    // 按时间倒序
    merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    WORKMAIN._refills = merged;
    WORKMAIN._refillsLoaded = true;
  } catch (e) {
    const m = e.message || String(e);
    if (/permission denied|row-level security|42501/i.test(m)) _wmToast('权限被拒:客服库需放行 anon 读 aftersales/refills', 'err');
    else _wmToast('加载补件失败:' + m, 'err');
    console.warn('[工作主线] 加载补件失败', e);
  } finally {
    WORKMAIN._refillsLoading = false;
  }
}

function _wmFilteredRefills() {
  const kw = (WORKMAIN._search || '').trim().toLowerCase();
  return WORKMAIN._refills.filter(r => {
    if (WORKMAIN._time && !_wmInTime(r.created_at, WORKMAIN._time)) return false;
    if (WORKMAIN._supplier && (r.supplier_name || '') !== WORKMAIN._supplier) return false;
    if (WORKMAIN._operator && (r.created_by_name || '') !== WORKMAIN._operator) return false;
    if (WORKMAIN._refillScope && (r.refill_scope || '') !== WORKMAIN._refillScope) return false;
    if (WORKMAIN._refillStatus && r.refill_status !== WORKMAIN._refillStatus) return false;
    if (kw) {
      const hay = [r.order_ref, r.customer, r.product_name, r.items_text, r.created_by_name]
        .map(x => String(x || '').toLowerCase()).join(' ');
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

function _wmRenderRefills() {
  if (WORKMAIN._refillsLoading && !WORKMAIN._refillsLoaded) return `<div class="wm-placeholder">加载中…</div>`;

  const all = WORKMAIN._refills;
  const list = _wmFilteredRefills();
  const suppliers = [...new Set(all.map(r => r.supplier_name).filter(Boolean))].sort();
  const operators = [...new Set(all.map(r => r.created_by_name).filter(Boolean))].sort();
  const opt = (v, label, cur) => `<option value="${_wmEsc(v)}" ${cur === v ? 'selected' : ''}>${_wmEsc(label)}</option>`;

  const timeChips = [['', '全部'], ['today', '今天'], ['yesterday', '昨天'], ['week', '本周'], ['month', '本月'], ['quarter', '本季'], ['year', '本年']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._time === k ? 'active' : ''}" onclick="workmainSetTime('${k}')">${l}</button>`).join('');
  const scopeChips = [['', '全部分类'], ['parts', '🔩 小配件'], ['whole_lamp', '💡 整灯']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._refillScope === k ? 'active' : ''}" onclick="workmainSetRefillScope('${k}')">${l}</button>`).join('');
  const statusChips = [['', '全部进度'], ['pending_order', '待下单'], ['ordered', '已下单'], ['producing', '生产中'], ['shipped', '已发货'], ['delivered', '已送达']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._refillStatus === k ? 'active' : ''}" onclick="workmainSetRefillStatus('${k}')">${l}</button>`).join('');

  const filterBar = `
    <div class="wm-filters">
      <div class="wm-filter-row">
        <input class="wm-search" type="text" placeholder="搜索 订单号 / 客户 / 产品 / 补件清单 / 录入人…"
               value="${_wmEsc(WORKMAIN._search)}" oninput="workmainSetSearch(this.value)">
        <select class="wm-sel" onchange="workmainSetSupplier(this.value)">
          <option value="">全部供应商</option>${suppliers.map(s => opt(s, s, WORKMAIN._supplier)).join('')}
        </select>
        <select class="wm-sel" onchange="workmainSetOperator(this.value)">
          <option value="">全部录入人</option>${operators.map(s => opt(s, s, WORKMAIN._operator)).join('')}
        </select>
        <button class="wm-btn-clear" onclick="workmainClearFilters()">✕ 清除</button>
        <button class="wm-btn-refresh" onclick="loadWorkmainRefills(true).then(renderWorkmain)">🔄 刷新</button>
      </div>
      <div class="wm-chip-row">${timeChips}<span class="wm-sep"></span>${scopeChips}<span class="wm-sep"></span>${statusChips}</div>
    </div>`;

  const total = list.length, pageSize = WORKMAIN._pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (WORKMAIN._page >= totalPages) WORKMAIN._page = 0;
  const page = WORKMAIN._page;
  const slice = list.slice(page * pageSize, page * pageSize + pageSize);
  const pager = _wmPager(page, totalPages, total);

  const orderedCnt = list.filter(r => r.refill_status && r.refill_status !== 'pending_order').length;
  const stat = `<div class="wm-stat">共 <b>${total}</b> 条 · 已下单及之后 <b>${orderedCnt}</b> · 待下单 <b>${total - orderedCnt}</b></div>`;

  const rows = slice.length ? slice.map(_wmRefillCard).join('') : `<div class="wm-empty">没有符合条件的补件记录</div>`;
  return `${filterBar}${stat}${pager}<div class="wm-list">${rows}</div>${total > pageSize ? pager : ''}`;
}

function _wmRefillCard(r) {
  const st = _WM_REFILL_STATUS[r.refill_status] || r.refill_status || '—';
  const stCls = _WM_REFILL_STATUS_CLS[r.refill_status] || '';
  const expanded = WORKMAIN._expanded === r._src + ':' + r.id;
  const key = `'${r._src}',${r.id}`;
  const isOrdered = r.refill_status && r.refill_status !== 'pending_order';
  const srcTag = r._src === 'aftersales' ? '<span class="wm-srctag">售后转入</span>' : '<span class="wm-srctag">补件单</span>';

  // 分类下拉(双方可改)
  const scopeSel = `<select class="wm-mini-sel" onclick="event.stopPropagation()" onchange="workmainRefillSetScope('${r._src}',${r.id},this.value)">
      <option value="" ${!r.refill_scope ? 'selected' : ''}>未分类</option>
      <option value="parts" ${r.refill_scope === 'parts' ? 'selected' : ''}>🔩 小配件(客服)</option>
      <option value="whole_lamp" ${r.refill_scope === 'whole_lamp' ? 'selected' : ''}>💡 整灯(跟单)</option>
    </select>`;
  // 进度推进下拉
  const statusSel = `<select class="wm-mini-sel" onclick="event.stopPropagation()" onchange="workmainRefillSetStatus('${r._src}',${r.id},this.value)">
      ${_WM_REFILL_STATUS_ORDER.map(s => `<option value="${s}" ${r.refill_status === s ? 'selected' : ''}>${_WM_REFILL_STATUS[s]}</option>`).join('')}
    </select>`;
  // 整灯「标记已下单」:待下单状态才显示
  const markBtn = (r.refill_status === 'pending_order')
    ? `<button class="wm-act wm-act-done" onclick="event.stopPropagation();workmainRefillMarkOrdered('${r._src}',${r.id})">📝 标记已下单</button>`
    : (r.refill_ordered_at ? `<span class="wm-rb wm-rb-done" title="${_wmEsc(r.refill_ordered_by || '')}">已下单 · ${_wmFmtDate(r.refill_ordered_at)}</span>` : '');

  return `
  <div class="wm-card ${expanded ? 'expanded' : ''}">
    <div class="wm-card-head" onclick="workmainToggleExpand('${r._src}:${r.id}')">
      <div class="wm-card-main">
        <span class="wm-order">${_wmEsc(r.order_ref || '无单号')}</span>
        <span class="wm-cust">${_wmEsc(r.customer || '—')}</span>
        <span class="wm-prod">${_wmEsc(r.items_text || r.product_name || '—')}</span>
        ${srcTag}
      </div>
      <div class="wm-card-meta">
        <span class="wm-status ${stCls}">${_wmEsc(st)}</span>
        <span class="wm-exp-arrow">${expanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div class="wm-card-sub">
      <span>录入 ${_wmEsc(r.created_by_name || '—')} · ${_wmFmtDate(r.created_at)}</span>
      ${r.supplier_name ? `<span>供应商 ${_wmEsc(r.supplier_name)}</span>` : ''}
      <span class="wm-inline-ctl">分类 ${scopeSel}</span>
      <span class="wm-inline-ctl">进度 ${statusSel}</span>
      <span class="wm-card-actions">${markBtn}</span>
    </div>
    ${expanded ? _wmRefillDetail(r) : ''}
  </div>`;
}

function _wmRefillDetail(r) {
  const row = (k, v) => v ? `<div class="wm-d-row"><span class="wm-d-k">${k}</span><span class="wm-d-v">${_wmEsc(v)}</span></div>` : '';
  let imgs = '';
  if (Array.isArray(r.attachments) && r.attachments.length) {
    imgs = `<div class="wm-d-imgs">${r.attachments.map(a => {
      const url = (a && (a.url || a)) || '';
      if (!url || /^data:/.test(String(url))) return '';
      return `<a href="${_wmEsc(url)}" target="_blank" rel="noopener"><img loading="lazy" src="${_wmEsc(url)}" alt=""></a>`;
    }).join('')}</div>`;
  }
  return `<div class="wm-detail">
    ${row('补件清单', r.items_text)}
    ${row('分类', _WM_SCOPE[r.refill_scope] || '未分类')}
    ${row('当前进度', _WM_REFILL_STATUS[r.refill_status] || r.refill_status)}
    ${r.refill_ordered_at ? row('已下单', `${r.refill_ordered_by || ''} · ${_wmFmtTime(r.refill_ordered_at)}`) : ''}
    ${row('供应商', r.supplier_name)}
    ${row('来源', r._src === 'aftersales' ? '售后转入补件(aftersales)' : '补件单(refills)')}
    ${imgs}
    <div class="wm-d-note">小配件归客服下单、整灯归跟单下单;分类双方可改。「标记已下单」会自动通知客服。</div>
  </div>`;
}

// ---- 补件动作(写回对应来源表)----
async function _wmRefillUpdate(src, id, patch) {
  const cs = _wmCs();
  if (!cs) { _wmToast('客服库未连接', 'err'); return false; }
  const table = (src === 'aftersales') ? 'aftersales' : 'refills';
  try {
    const { error } = await cs.from(table).update(patch).eq('id', id);
    if (error) throw error;
    const r = WORKMAIN._refills.find(x => x._src === src && x.id === id);
    if (r) Object.assign(r, _wmNormRefill(Object.assign({}, r._raw, patch), src), { _raw: Object.assign({}, r._raw, patch) });
    return true;
  } catch (e) {
    const m = e.message || String(e);
    if (/permission denied|row-level security|42501/i.test(m)) _wmToast(`权限被拒:客服库需放行 anon 更新 ${table}`, 'err');
    else _wmToast('操作失败:' + m, 'err');
    console.warn('[工作主线] 补件更新失败', e);
    return false;
  }
}

async function workmainRefillSetScope(src, id, scope) {
  const ok = await _wmRefillUpdate(src, id, { refill_scope: scope || null });
  if (ok) { _wmToast('已更新分类', 'success'); renderWorkmain(); }
}
async function workmainRefillSetStatus(src, id, status) {
  const ok = await _wmRefillUpdate(src, id, { refill_status: status });
  if (ok) { _wmToast('进度已更新为「' + (_WM_REFILL_STATUS[status] || status) + '」', 'success'); renderWorkmain(); }
}
async function workmainRefillMarkOrdered(src, id) {
  const who = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '';
  const at = new Date().toISOString();
  const ok = await _wmRefillUpdate(src, id, { refill_status: 'ordered', refill_ordered_at: at, refill_ordered_by: who });
  if (!ok) return;
  _wmToast('已标记「已下单」', 'success');
  const r = WORKMAIN._refills.find(x => x._src === src && x.id === id);
  if (r) {
    _wmNotifyCs(
      r,
      `跟单已下单(整灯补发) · ${r.order_ref || '无单号'}`,
      `订单 ${r.order_ref || '—'} · ${r.customer || ''}\n补件:${r.items_text || r.product_name || ''}\n动作:整灯补发已下单\n下单人:${who}\n时间:${_wmFmtTime(at)}`,
      'refill_ordered'
    );
  }
  renderWorkmain();
}

// ---- 补件筛选 setter ----
function workmainSetRefillScope(k) { WORKMAIN._refillScope = k; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetRefillStatus(k) { WORKMAIN._refillStatus = k; WORKMAIN._page = 0; renderWorkmain(); }

// ============ 售后清单(aftersales · 查看 + 已处理退货)============
// 注意:aftersales 无 archived 列,只按 deleted 过滤;客服 status/核心字段只读,跟单仅写 return_*。

async function loadWorkmainAftersales(force) {
  if (WORKMAIN._asLoading) return;
  if (WORKMAIN._asLoaded && !force) return;
  const cs = _wmCs();
  if (!cs) { _wmToast('客服库未连接', 'err'); return; }
  WORKMAIN._asLoading = true;
  try {
    const cols = 'id,record_id,order_ref,customer,country,product_name,sku,issue_type,issue_type_custom,issue_sub,' +
      'damaged_part,issue_detail,supplier_name,supplier_names,status,improvement_suggestion,improvement_status,' +
      'notes,attachments,communication_images,created_by,created_by_name,created_at,updated_at,closed_at,' +
      'deleted,flagged,return_status,return_handled_at,return_handled_by';
    const { data, error } = await cs.from('aftersales')
      .select(cols).order('created_at', { ascending: false }).limit(1500);
    if (error) throw error;
    WORKMAIN._aftersales = (data || []).filter(r => !r.deleted);   // aftersales 无 archived
    WORKMAIN._asLoaded = true;
  } catch (e) {
    const m = e.message || String(e);
    if (/permission denied|row-level security|42501/i.test(m)) _wmToast('权限被拒:客服库需放行 anon 读 aftersales', 'err');
    else _wmToast('加载售后失败:' + m, 'err');
    console.warn('[工作主线] 加载 aftersales 失败', e);
  } finally {
    WORKMAIN._asLoading = false;
  }
}

function _wmFilteredAftersales() {
  const kw = (WORKMAIN._search || '').trim().toLowerCase();
  return WORKMAIN._aftersales.filter(r => {
    if (WORKMAIN._time && !_wmInTime(r.created_at, WORKMAIN._time)) return false;
    if (WORKMAIN._supplier && (r.supplier_name || r.supplier_names || '') !== WORKMAIN._supplier) return false;
    if (WORKMAIN._operator && (r.created_by_name || '') !== WORKMAIN._operator) return false;
    if (WORKMAIN._asStatus && r.status !== WORKMAIN._asStatus) return false;
    if (WORKMAIN._asType && r.issue_type !== WORKMAIN._asType) return false;
    if (WORKMAIN._return === 'handled' && r.return_status !== 'handled') return false;
    if (WORKMAIN._return === 'pending' && r.return_status === 'handled') return false;
    if (kw) {
      const hay = [r.order_ref, r.customer, r.product_name, r.issue_detail, r.damaged_part, r.created_by_name]
        .map(x => String(x || '').toLowerCase()).join(' ');
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

function _wmRenderAftersales() {
  if (WORKMAIN._asLoading && !WORKMAIN._asLoaded) return `<div class="wm-placeholder">加载中…</div>`;

  const all = WORKMAIN._aftersales;
  const list = _wmFilteredAftersales();
  const suppliers = [...new Set(all.map(r => r.supplier_name || r.supplier_names).filter(Boolean))].sort();
  const operators = [...new Set(all.map(r => r.created_by_name).filter(Boolean))].sort();
  const types = [...new Set(all.map(r => r.issue_type).filter(Boolean))].sort();
  const statuses = [...new Set(all.map(r => r.status).filter(Boolean))].sort();
  const opt = (v, label, cur) => `<option value="${_wmEsc(v)}" ${cur === v ? 'selected' : ''}>${_wmEsc(label)}</option>`;

  const timeChips = [['', '全部'], ['today', '今天'], ['yesterday', '昨天'], ['week', '本周'], ['month', '本月'], ['quarter', '本季'], ['year', '本年']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._time === k ? 'active' : ''}" onclick="workmainSetTime('${k}')">${l}</button>`).join('');
  const returnChips = [['', '全部退货'], ['pending', '🟠 待处理退货'], ['handled', '✅ 已处理退货']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._return === k ? 'active' : ''}" onclick="workmainSetReturn('${k}')">${l}</button>`).join('');

  const filterBar = `
    <div class="wm-filters">
      <div class="wm-filter-row">
        <input class="wm-search" type="text" placeholder="搜索 订单号 / 客户 / 产品 / 问题详情 / 损坏部件 / 录入人…"
               value="${_wmEsc(WORKMAIN._search)}" oninput="workmainSetSearch(this.value)">
        <select class="wm-sel" onchange="workmainSetAsStatus(this.value)">
          <option value="">全部状态</option>${statuses.map(s => opt(s, _WM_AS_STATUS[s] || _wmHumanize(s), WORKMAIN._asStatus)).join('')}
        </select>
        <select class="wm-sel" onchange="workmainSetAsType(this.value)">
          <option value="">全部问题类型</option>${types.map(t => opt(t, _WM_ISSUE[t] || _wmHumanize(t), WORKMAIN._asType)).join('')}
        </select>
        <select class="wm-sel" onchange="workmainSetSupplier(this.value)">
          <option value="">全部供应商</option>${suppliers.map(s => opt(s, s, WORKMAIN._supplier)).join('')}
        </select>
        <select class="wm-sel" onchange="workmainSetOperator(this.value)">
          <option value="">全部录入人</option>${operators.map(s => opt(s, s, WORKMAIN._operator)).join('')}
        </select>
        <button class="wm-btn-clear" onclick="workmainClearFilters()">✕ 清除</button>
        <button class="wm-btn-refresh" onclick="loadWorkmainAftersales(true).then(renderWorkmain)">🔄 刷新</button>
      </div>
      <div class="wm-chip-row">${timeChips}<span class="wm-sep"></span>${returnChips}</div>
    </div>`;

  const total = list.length, pageSize = WORKMAIN._pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (WORKMAIN._page >= totalPages) WORKMAIN._page = 0;
  const page = WORKMAIN._page;
  const slice = list.slice(page * pageSize, page * pageSize + pageSize);
  const pager = _wmPager(page, totalPages, total);

  const handledCnt = list.filter(r => r.return_status === 'handled').length;
  const stat = `<div class="wm-stat">共 <b>${total}</b> 单 · 已处理退货 <b>${handledCnt}</b> · 待处理退货 <b>${total - handledCnt}</b></div>`;

  const rows = slice.length ? slice.map(_wmAftersaleCard).join('') : `<div class="wm-empty">没有符合条件的售后记录</div>`;
  return `${filterBar}${stat}${pager}<div class="wm-list">${rows}</div>${total > pageSize ? pager : ''}`;
}

function _wmAftersaleCard(r) {
  const st = _WM_AS_STATUS[r.status] || r.status || '—';
  const stCls = _WM_AS_STATUS_CLS[r.status] || '';
  const handled = r.return_status === 'handled';
  const expanded = WORKMAIN._expanded === 'as:' + r.id;
  const returnBadge = handled
    ? `<span class="wm-rb wm-rb-done" title="处理人 ${_wmEsc(r.return_handled_by || '')} · ${_wmFmtTime(r.return_handled_at)}">✅ 已处理退货</span>`
    : '';
  const actionBtn = handled
    ? `<button class="wm-act wm-act-undo" onclick="event.stopPropagation();workmainToggleAsReturn(${r.id}, false)">↩ 取消已处理</button>`
    : `<button class="wm-act wm-act-done" onclick="event.stopPropagation();workmainToggleAsReturn(${r.id}, true)">✅ 标记已处理退货</button>`;
  const imgCnt = (Array.isArray(r.attachments) ? r.attachments.length : 0) + (Array.isArray(r.communication_images) ? r.communication_images.length : 0);

  return `
  <div class="wm-card ${expanded ? 'expanded' : ''}">
    <div class="wm-card-head" onclick="workmainToggleExpand('as:${r.id}')">
      <div class="wm-card-main">
        <span class="wm-order">${_wmEsc(r.order_ref || '无单号')}</span>
        <span class="wm-cust">${_wmEsc(r.customer || '—')}</span>
        <span class="wm-prod">${_wmEsc(r.product_name || '—')}</span>
      </div>
      <div class="wm-card-meta">
        <span class="wm-type">${_wmEsc(_wmIssueLabel(r))}</span>
        <span class="wm-status ${stCls}">${_wmEsc(st)}</span>
        ${returnBadge}
        <span class="wm-exp-arrow">${expanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div class="wm-card-sub">
      <span>录入 ${_wmEsc(r.created_by_name || '—')} · ${_wmFmtDate(r.created_at)}</span>
      ${r.supplier_name || r.supplier_names ? `<span>供应商 ${_wmEsc(r.supplier_name || r.supplier_names)}</span>` : ''}
      ${r.damaged_part ? `<span>损坏 ${_wmEsc(r.damaged_part)}</span>` : ''}
      ${imgCnt ? `<span>📎 ${imgCnt} 图</span>` : ''}
      <span class="wm-card-actions">${actionBtn}</span>
    </div>
    ${expanded ? _wmAftersaleDetail(r) : ''}
  </div>`;
}

function _wmAftersaleDetail(r) {
  const row = (k, v) => v ? `<div class="wm-d-row"><span class="wm-d-k">${k}</span><span class="wm-d-v">${_wmEsc(v)}</span></div>` : '';
  const atts = []
    .concat(Array.isArray(r.attachments) ? r.attachments : [])
    .concat(Array.isArray(r.communication_images) ? r.communication_images : []);
  let imgs = '';
  if (atts.length) {
    imgs = `<div class="wm-d-imgs">${atts.map(a => {
      const url = (a && (a.url || a)) || '';
      if (!url || /^data:/.test(String(url))) return '';
      return `<a href="${_wmEsc(url)}" target="_blank" rel="noopener"><img loading="lazy" src="${_wmEsc(url)}" alt=""></a>`;
    }).join('')}</div>`;
  }
  return `<div class="wm-detail">
    ${row('问题类型', _wmIssueLabel(r))}
    ${row('问题详情', r.issue_detail)}
    ${row('损坏部件', r.damaged_part)}
    ${row('SKU', r.sku)}
    ${row('国家', r.country)}
    ${row('客服状态', _WM_AS_STATUS[r.status] || r.status)}
    ${row('改善建议', r.improvement_suggestion)}
    ${row('备注', r.notes)}
    ${r.return_status === 'handled' ? row('已处理退货', `${r.return_handled_by || ''} · ${_wmFmtTime(r.return_handled_at)}`) : ''}
    ${imgs}
    <div class="wm-d-note">客服处理流(状态/详情)只读;跟单可标记「已处理退货」。补件分类/下单请在「补件追踪」子标签操作。</div>
  </div>`;
}

// 跟单动作:售后已处理退货
async function workmainToggleAsReturn(id, handled) {
  const cs = _wmCs();
  if (!cs) { _wmToast('客服库未连接', 'err'); return; }
  const r = WORKMAIN._aftersales.find(x => x.id === id);
  if (!r) return;
  const patch = handled
    ? { return_status: 'handled', return_handled_at: new Date().toISOString(), return_handled_by: (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '' }
    : { return_status: null, return_handled_at: null, return_handled_by: null };
  try {
    const { error } = await cs.from('aftersales').update(patch).eq('id', id);
    if (error) throw error;
    Object.assign(r, patch);
    _wmToast(handled ? '已标记「已处理退货」' : '已取消退货标记', 'success');
    if (handled) {
      _wmNotifyCs(
        r,
        `跟单已处理退货 · ${r.order_ref || '无单号'}`,
        `订单 ${r.order_ref || '—'} · ${r.customer || ''} · ${r.product_name || ''}\n问题:${_wmIssueLabel(r)}\n动作:已处理退货(售后)\n处理人:${patch.return_handled_by || ''}\n时间:${_wmFmtTime(patch.return_handled_at)}`,
        'aftersale_return_handled'
      );
    }
    renderWorkmain();
  } catch (e) {
    const m = e.message || String(e);
    if (/permission denied|row-level security|42501/i.test(m)) _wmToast('权限被拒:客服库需放行 anon 更新 aftersales', 'err');
    else _wmToast('操作失败:' + m, 'err');
    console.warn('[工作主线] 售后退货标记失败', e);
  }
}

function workmainSetAsStatus(v) { WORKMAIN._asStatus = v; WORKMAIN._page = 0; renderWorkmain(); }
function workmainSetAsType(v) { WORKMAIN._asType = v; WORKMAIN._page = 0; renderWorkmain(); }

// ---- 自动通知客服(复用 cross_dept_messages · 与转单工单同一套)----
// 通知失败不影响主流程(已 catch),只是少一条提醒。
async function _wmNotifyCs(r, title, body, relatedType) {
  if (typeof cdmClient === 'undefined' || !cdmClient) return;
  let me = { id: 'unknown', name: '' };
  try { if (typeof _cdmGetCurrentUser === 'function') me = _cdmGetCurrentUser(); } catch (_) {}
  const row = {
    from_system: 'po', from_user_id: me.id, from_user_name: me.name,
    to_system: 'cs', to_user_id: r.created_by || null, to_user_name: r.created_by_name || null,
    category: 'general', priority: 'normal',
    title: title, body: body || null,
    related_ref: r.order_ref || null, related_type: relatedType || null, related_shop: null,
    status: 'pending', thread: [], read_by: [me.id],
    watchers: [], attachments: [],
    created_at_ms: Date.now(),
  };
  try {
    const { error } = await cdmClient.from('cross_dept_messages').insert(row);
    if (error) throw error;
  } catch (e) {
    console.warn('[工作主线] 通知客服失败(不影响退货标记)', e);
  }
}
