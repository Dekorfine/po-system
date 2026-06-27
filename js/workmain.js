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
  else body = `<div class="wm-placeholder">🚧 「${subTabs.find(t => t.k === WORKMAIN._sub).label.replace(/^[^\s]+\s/, '')}」即将上线<br><span>第一期先跑通退款管理,跑稳后补这块。</span></div>`;

  host.innerHTML = `<div class="wm-wrap">${subBar}${body}</div>`;
}

function workmainSetSub(k) {
  WORKMAIN._sub = k;
  WORKMAIN._page = 0;
  renderWorkmain();
  if (k === 'refunds' && !WORKMAIN._loaded) loadWorkmainRefunds().then(renderWorkmain);
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
