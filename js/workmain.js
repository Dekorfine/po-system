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
  _flagOnly: false,         // 只看重点(flagged)
  // 补件追踪
  _refills: [],             // 统一形状(refills 表 + aftersales 带 refill 的行)
  _refillsLoaded: false,
  _refillsLoading: false,
  // 补件追踪(简化:跟单只看 未下单/已下单)
  _refillOrder: '',         // ''=全部 undone=未下单 done=已下单
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

// ---- 图片缩略图 + 灯箱(主窗口 position:fixed 版 · 对齐客服端设计)----
const _WM_IMG_REG = {};   // key -> 图片数组,供灯箱按 key 取
function _wmCollectImgs(r) {
  const out = [];
  const push = arr => { if (Array.isArray(arr)) arr.forEach(a => { const url = (a && (a.url || a)) || ''; if (url && !/^data:/.test(String(url))) out.push({ url: String(url), name: (a && a.name) || '' }); }); };
  push(r.attachments); push(r.communication_images);
  return out;
}
// 列表里的单缩略图 + 数量角标(无图返回空)
function _wmThumb(imgs, key) {
  _WM_IMG_REG[key] = imgs;
  if (!imgs || !imgs.length) return '';
  const more = imgs.length > 1 ? `<span class="wm-thumb-count">${imgs.length}</span>` : '';
  return `<span class="wm-thumb-wrap" title="点击看大图" onclick="event.stopPropagation();_wmOpenLightbox(_WM_IMG_REG['${key}'],0)">${more}<img class="wm-thumb" loading="lazy" src="${_wmEsc(imgs[0].url)}" alt=""></span>`;
}

let _wmLB = { imgs: [], i: 0 };
function _wmOpenLightbox(imgs, startIdx) {
  _wmLB.imgs = (imgs || []).filter(x => x && x.url);
  _wmLB.i = startIdx || 0;
  if (!_wmLB.imgs.length) return;
  document.body.style.overflow = 'hidden';   // 锁滚动
  _wmRenderLightbox();
  document.addEventListener('keydown', _wmLbKey);
}
function _wmCloseLightbox() {
  const el = document.getElementById('wmLightbox');
  if (el) el.style.display = 'none';
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _wmLbKey);
}
function _wmLbKey(e) {
  if (e.key === 'Escape') _wmCloseLightbox();
  else if (e.key === 'ArrowLeft') { _wmLB.i = (_wmLB.i - 1 + _wmLB.imgs.length) % _wmLB.imgs.length; _wmRenderLightbox(); }
  else if (e.key === 'ArrowRight') { _wmLB.i = (_wmLB.i + 1) % _wmLB.imgs.length; _wmRenderLightbox(); }
}
function _wmRenderLightbox() {
  let el = document.getElementById('wmLightbox');
  if (!el) { el = document.createElement('div'); el.id = 'wmLightbox'; document.body.appendChild(el); }
  const cur = _wmLB.imgs[_wmLB.i]; const multi = _wmLB.imgs.length > 1;
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;';
  el.style.display = 'flex';
  el.innerHTML = `
    <div style="max-width:90vw;max-height:90vh;display:flex;flex-direction:column;gap:10px" onclick="event.stopPropagation()">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;min-height:0">
        ${multi ? `<button onclick="_wmLB.i=(_wmLB.i-1+_wmLB.imgs.length)%_wmLB.imgs.length;_wmRenderLightbox()" style="position:absolute;left:-50px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.2);color:#fff;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:20px">‹</button>` : ''}
        <img src="${_wmEsc(cur.url)}" style="max-width:100%;max-height:80vh;object-fit:contain;border-radius:6px" alt="">
        ${multi ? `<button onclick="_wmLB.i=(_wmLB.i+1)%_wmLB.imgs.length;_wmRenderLightbox()" style="position:absolute;right:-50px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.2);color:#fff;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:20px">›</button>` : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;color:#fff;font-size:12px">
        <span>${_wmLB.i + 1} / ${_wmLB.imgs.length}</span>
        <a href="${_wmEsc(cur.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="background:rgba(255,255,255,.18);color:#fff;border-radius:6px;padding:4px 10px;text-decoration:none">在新标签打开原图 ↗</a>
      </div>
    </div>`;
  el.onclick = _wmCloseLightbox;   // 点遮罩空白关闭
}

// ---- 🚩 重要(flagged)· 主管标记重点 ----
async function workmainToggleFlag(src, id) {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) { _wmToast('仅主管可标记重点', 'err'); return; }
  const cs = _wmCs(); if (!cs) return;
  const table = (src === 'aftersale') ? 'aftersales' : 'refunds';
  const arr = (src === 'aftersale') ? WORKMAIN._aftersales : WORKMAIN._refunds;
  const r = arr.find(x => x.id === id); if (!r) return;
  const nv = !r.flagged;
  try {
    const { error } = await cs.from(table).update({ flagged: nv }).eq('id', id);
    if (error) throw error;
    r.flagged = nv;
    _wmToast(nv ? '已标记重点' : '已取消重点', 'success');
    renderWorkmain();
  } catch (e) {
    const m = e.message || String(e);
    if (/column .*flagged.* does not exist/i.test(m)) _wmToast(`${table} 缺 flagged 列,请先 ALTER TABLE 加上`, 'err');
    else if (/permission denied|row-level security|42501/i.test(m)) _wmToast('权限被拒:客服库需放行 anon 更新', 'err');
    else _wmToast('操作失败:' + m, 'err');
  }
}
function workmainToggleFlagOnly() { WORKMAIN._flagOnly = !WORKMAIN._flagOnly; WORKMAIN._page = 0; renderWorkmain(); }

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
const _WM_REFILL_STATUS = { pending_order: '待下单', ordered: '已下单', labeled: '已下单', producing: '生产中', shipped: '已发货', delivered: '已送达' };
// 跟单只关心二元:未下单(pending_order/空)vs 已下单(其余一切,稳健兼容 ordered/labeled/…)
function _wmRefillDone(r) { return !!(r.refill_status && r.refill_status !== 'pending_order'); }
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
    if (WORKMAIN._flagOnly && !r.flagged) return false;
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
  try {
    if (WORKMAIN._sub === 'refunds') body = _wmRenderRefunds();
    else if (WORKMAIN._sub === 'refills') body = _wmRenderRefills();
    else if (WORKMAIN._sub === 'aftersales') body = _wmRenderAftersales();
    else if (WORKMAIN._sub === 'summary') body = _wmRenderSummary();
    else body = `<div class="wm-placeholder">🚧 即将上线</div>`;
  } catch (e) {
    // 防护:工作主线渲染出错绝不连累整体启动/登录(本 tab 常是落地页)
    console.error('[工作主线] 渲染失败', e);
    body = `<div class="wm-placeholder">⚠️ 此子标签渲染出错:${_wmEsc(e && e.message || e)}<br><span>其它功能不受影响 · 可切换子标签或刷新页面</span></div>`;
  }

  host.innerHTML = `<div class="wm-wrap">${subBar}${body}</div>`;
}

function workmainSetSub(k) {
  WORKMAIN._sub = k;
  WORKMAIN._page = 0;
  // 切子标签自动清掉共享筛选,避免上一个标签的"今天/只看重点/供应商"等串过来把列表过滤空
  WORKMAIN._search = ''; WORKMAIN._time = ''; WORKMAIN._supplier = ''; WORKMAIN._operator = '';
  WORKMAIN._status = ''; WORKMAIN._type = ''; WORKMAIN._return = ''; WORKMAIN._flagOnly = false;
  WORKMAIN._refillOrder = '';
  WORKMAIN._asStatus = ''; WORKMAIN._asType = '';
  WORKMAIN._expanded = null;
  renderWorkmain();
  if (k === 'refunds' && !WORKMAIN._loaded) loadWorkmainRefunds().then(renderWorkmain);
  if (k === 'refills' && !WORKMAIN._refillsLoaded) loadWorkmainRefills().then(renderWorkmain);
  if (k === 'aftersales' && !WORKMAIN._asLoaded) loadWorkmainAftersales().then(renderWorkmain);
  if (k === 'summary') {
    const need = [];
    if (!WORKMAIN._loaded) need.push(loadWorkmainRefunds());
    if (!WORKMAIN._asLoaded) need.push(loadWorkmainAftersales());
    if (!WORKMAIN._refillsLoaded) need.push(loadWorkmainRefills());
    if (need.length) Promise.all(need).then(renderWorkmain);
  }
}

// ---- 渲染:退款管理子标签 ----
function _wmRenderRefunds() {
  if (WORKMAIN._loading && !WORKMAIN._loaded) {
    return `<div class="wm-placeholder">加载中…</div>`;
  }

  const all = WORKMAIN._refunds;
  const list = _wmFilteredRefunds().sort((a, b) =>
    (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || (new Date(b.created_at || 0) - new Date(a.created_at || 0))
  );

  // 筛选项来源(从真实数据取,保证和库一致)
  const suppliers = [...new Set(all.map(r => r.supplier_name || r.supplier_names).filter(Boolean))].sort();
  const operators = [...new Set(all.map(r => r.created_by_name).filter(Boolean))].sort();
  const types = [...new Set(all.map(r => r.refund_type).filter(Boolean))].sort();

  const opt = (v, label, cur) => `<option value="${_wmEsc(v)}" ${cur === v ? 'selected' : ''}>${_wmEsc(label)}</option>`;
  const timeChips = [['', '全部'], ['today', '今天'], ['yesterday', '昨天'], ['week', '本周'], ['month', '本月'], ['quarter', '本季'], ['year', '本年']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._time === k ? 'active' : ''}" onclick="workmainSetTime('${k}')">${l}</button>`).join('');
  const returnChips = [['', '全部退货'], ['pending', '🟠 待处理退货'], ['handled', '✅ 已处理退货']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._return === k ? 'active' : ''}" onclick="workmainSetReturn('${k}')">${l}</button>`).join('');
  const flagChip = `<button class="wm-chip wm-chip-flag ${WORKMAIN._flagOnly ? 'active' : ''}" onclick="workmainToggleFlagOnly()">🚩 只看重点</button>`;

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
      <div class="wm-chip-row">${timeChips}<span class="wm-sep"></span>${returnChips}<span class="wm-sep"></span>${flagChip}</div>
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
  const imgs = _wmCollectImgs(r);
  const thumb = _wmThumb(imgs, 'refund:' + r.id);

  // 🚩 重要(主管标记)· 未标记时仅主管可见可点;已标记则人人可见红旗
  const canFlag = (typeof IS_ADMIN === 'undefined') || IS_ADMIN;
  const flagBtn = (r.flagged || canFlag)
    ? `<button class="wm-flag ${r.flagged ? 'on' : ''}" title="${r.flagged ? '重点退款(点取消)' : '主管标记重点'}" ${canFlag ? '' : 'disabled'} onclick="event.stopPropagation();workmainToggleFlag('refund',${r.id})">🚩</button>`
    : '';

  const actionBtn = handled
    ? `<button class="wm-act wm-act-undo" onclick="event.stopPropagation();workmainToggleReturn(${r.id}, false)">↩ 取消已处理</button>`
    : `<button class="wm-act wm-act-done" onclick="event.stopPropagation();workmainToggleReturn(${r.id}, true)">✅ 标记已处理退货</button>`;

  return `
  <div class="wm-card ${expanded ? 'expanded' : ''} ${r.flagged ? 'flagged' : ''}" data-id="${r.id}">
    <div class="wm-card-head" onclick="workmainToggleExpand(${r.id})">
      <div class="wm-card-main">
        ${flagBtn}
        <span class="wm-order">${_wmEsc(r.order_ref || '无单号')}</span>
        <span class="wm-cust">${_wmEsc(r.customer || '—')}</span>
        <span class="wm-prod">${_wmEsc(r.product_name || '—')}</span>
      </div>
      <div class="wm-card-meta">
        ${thumb}
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
      ${r.refund_reason ? `<span class="wm-reason">${_wmEsc(r.refund_reason)}</span>` : ''}
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
  const all = _wmCollectImgs(r);
  if (all.length) {
    const key = 'refund-d:' + r.id; _WM_IMG_REG[key] = all;
    imgs = `<div class="wm-d-imgs">${all.map((im, i) =>
      `<img class="wm-d-img" loading="lazy" src="${_wmEsc(im.url)}" alt="" onclick="_wmOpenLightbox(_WM_IMG_REG['${key}'],${i})">`
    ).join('')}</div>`;
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
  WORKMAIN._flagOnly = false;
  WORKMAIN._refillOrder = '';
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
    // 关键:refills 的下单状态在 status 列;aftersales 在 refill_status 列(客服交底口径)
    refill_status: (src === 'refills' ? row.status : row.refill_status) || 'pending_order',
    refill_scope: row.refill_scope || '',
    refill_ordered_by: row.refill_ordered_by || '',
    refill_ordered_at: row.refill_ordered_at || null,
    created_by: row.created_by || null,
    created_by_name: row.created_by_name || '',
    created_at: row.created_at,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    communication_images: Array.isArray(row.communication_images) ? row.communication_images : [],
    flagged: !!row.flagged,
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
      'created_by,created_by_name,created_at,attachments,communication_images,flagged,deleted';
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
    if (WORKMAIN._flagOnly && !r.flagged) return false;
    if (WORKMAIN._refillOrder === 'undone' && _wmRefillDone(r)) return false;
    if (WORKMAIN._refillOrder === 'done' && !_wmRefillDone(r)) return false;
    if (WORKMAIN._time && !_wmInTime(r.created_at, WORKMAIN._time)) return false;
    if (WORKMAIN._supplier && (r.supplier_name || '') !== WORKMAIN._supplier) return false;
    if (WORKMAIN._operator && (r.created_by_name || '') !== WORKMAIN._operator) return false;
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
  const list = _wmFilteredRefills().sort((a, b) =>
    (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || (new Date(b.created_at || 0) - new Date(a.created_at || 0))
  );
  const suppliers = [...new Set(all.map(r => r.supplier_name).filter(Boolean))].sort();
  const operators = [...new Set(all.map(r => r.created_by_name).filter(Boolean))].sort();
  const opt = (v, label, cur) => `<option value="${_wmEsc(v)}" ${cur === v ? 'selected' : ''}>${_wmEsc(label)}</option>`;

  const timeChips = [['', '全部'], ['today', '今天'], ['yesterday', '昨天'], ['week', '本周'], ['month', '本月'], ['quarter', '本季'], ['year', '本年']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._time === k ? 'active' : ''}" onclick="workmainSetTime('${k}')">${l}</button>`).join('');
  const orderChips = [['', '全部'], ['undone', '🔲 未下单'], ['done', '✅ 已下单']]
    .map(([k, l]) => `<button class="wm-chip ${k === 'undone' ? 'wm-chip-undone' : ''} ${k === 'done' ? 'wm-chip-done' : ''} ${WORKMAIN._refillOrder === k ? 'active' : ''}" onclick="workmainSetRefillOrder('${k}')">${l}</button>`).join('');

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
      <div class="wm-chip-row"><span class="wm-chip-label">下单状态</span>${orderChips}<span class="wm-sep"></span>${timeChips}<span class="wm-sep"></span><button class="wm-chip wm-chip-flag ${WORKMAIN._flagOnly ? 'active' : ''}" onclick="workmainToggleFlagOnly()">🚩 只看重点</button></div>
    </div>`;

  const total = list.length, pageSize = WORKMAIN._pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (WORKMAIN._page >= totalPages) WORKMAIN._page = 0;
  const page = WORKMAIN._page;
  const slice = list.slice(page * pageSize, page * pageSize + pageSize);
  const pager = _wmPager(page, totalPages, total);

  const doneCnt = list.filter(_wmRefillDone).length;
  const stat = `<div class="wm-stat">共 <b>${total}</b> 条 · 已下单 <b>${doneCnt}</b> · 未下单 <b>${total - doneCnt}</b></div>`;

  const rows = slice.length ? slice.map(_wmRefillCard).join('') : `<div class="wm-empty">没有符合条件的补件记录</div>`;
  return `${filterBar}${stat}${pager}<div class="wm-list">${rows}</div>${total > pageSize ? pager : ''}`;
}

function _wmRefillCard(r) {
  const done = _wmRefillDone(r);
  const stCls = done ? 'wm-st-done' : 'wm-st-pending';
  const stLabel = done ? '已下单' : '待下单';
  const expanded = WORKMAIN._expanded === r._src + ':' + r.id;
  const srcTag = r._src === 'aftersales' ? '<span class="wm-srctag">售后转入</span>' : '<span class="wm-srctag">补件单</span>';
  const imgs = _wmCollectImgs(r);
  const thumb = _wmThumb(imgs, 'rf:' + r._src + ':' + r.id);
  const canFlag = (typeof IS_ADMIN === 'undefined') || IS_ADMIN;
  const flagBtn = (r.flagged || canFlag)
    ? `<button class="wm-flag ${r.flagged ? 'on' : ''}" title="${r.flagged ? '重点(点取消)' : '主管标记重点'}" ${canFlag ? '' : 'disabled'} onclick="event.stopPropagation();workmainRefillToggleFlag('${r._src}',${r.id})">🚩</button>`
    : '';

  // 未下单:跟单可选「📝 标记已下单」(不强制);已下单:显示下单时间(若有)
  const markBtn = !done
    ? `<button class="wm-act wm-act-done" onclick="event.stopPropagation();workmainRefillMarkOrdered('${r._src}',${r.id})">📝 标记已下单</button>`
    : (r.refill_ordered_at ? `<span class="wm-rb wm-rb-done" title="${_wmEsc(r.refill_ordered_by || '')}">已下单 · ${_wmFmtDate(r.refill_ordered_at)}</span>` : '');

  return `
  <div class="wm-card ${expanded ? 'expanded' : ''} ${r.flagged ? 'flagged' : ''}">
    <div class="wm-card-head" onclick="workmainToggleExpand('${r._src}:${r.id}')">
      <div class="wm-card-main">
        ${flagBtn}
        <span class="wm-order">${_wmEsc(r.order_ref || '无单号')}</span>
        <span class="wm-cust">${_wmEsc(r.customer || '—')}</span>
        <span class="wm-prod">${_wmEsc(r.items_text || r.product_name || '—')}</span>
        ${srcTag}
      </div>
      <div class="wm-card-meta">
        ${thumb}
        <span class="wm-status ${stCls}">${stLabel}</span>
        <span class="wm-exp-arrow">${expanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div class="wm-card-sub">
      <span>录入 ${_wmEsc(r.created_by_name || '—')} · ${_wmFmtDate(r.created_at)}</span>
      ${r.supplier_name ? `<span>供应商 ${_wmEsc(r.supplier_name)}</span>` : ''}
      <span class="wm-card-actions">${markBtn}</span>
    </div>
    ${expanded ? _wmRefillDetail(r) : ''}
  </div>`;
}

function _wmRefillDetail(r) {
  const row = (k, v) => v ? `<div class="wm-d-row"><span class="wm-d-k">${k}</span><span class="wm-d-v">${_wmEsc(v)}</span></div>` : '';
  let imgs = '';
  const all = _wmCollectImgs(r);
  if (all.length) {
    const key = 'rf-d:' + r._src + ':' + r.id; _WM_IMG_REG[key] = all;
    imgs = `<div class="wm-d-imgs">${all.map((im, i) =>
      `<img class="wm-d-img" loading="lazy" src="${_wmEsc(im.url)}" alt="" onclick="_wmOpenLightbox(_WM_IMG_REG['${key}'],${i})">`
    ).join('')}</div>`;
  }
  return `<div class="wm-detail">
    ${row('补件清单', r.items_text)}
    ${row('下单状态', _wmRefillDone(r) ? '已下单' : '待下单')}
    ${r.refill_ordered_at ? row('下单记录', `${r.refill_ordered_by || ''} · ${_wmFmtTime(r.refill_ordered_at)}`) : ''}
    ${row('供应商', r.supplier_name)}
    ${row('来源', r._src === 'aftersales' ? '售后转入补件(aftersales)' : '补件单(refills)')}
    ${imgs}
    <div class="wm-d-note">客服会把配件下单并标注;跟单只需看「未下单/已下单」。未下单的可点「标记已下单」(可选,会自动通知客服)。</div>
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
  // refills 下单状态列是 status;aftersales 是 refill_status
  const statusCol = (src === 'refills') ? 'status' : 'refill_status';
  const patch = { [statusCol]: 'ordered', refill_ordered_at: at, refill_ordered_by: who };
  const ok = await _wmRefillUpdate(src, id, patch);
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
function workmainSetRefillOrder(k) { WORKMAIN._refillOrder = k; WORKMAIN._page = 0; renderWorkmain(); }

// 补件 🚩 重要(写回对应来源表 aftersales/refills)
async function workmainRefillToggleFlag(src, id) {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) { _wmToast('仅主管可标记重点', 'err'); return; }
  const r = WORKMAIN._refills.find(x => x._src === src && x.id === id); if (!r) return;
  const nv = !r.flagged;
  const ok = await _wmRefillUpdate(src, id, { flagged: nv });
  if (ok) { _wmToast(nv ? '已标记重点' : '已取消重点', 'success'); renderWorkmain(); }
}

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
    if (WORKMAIN._flagOnly && !r.flagged) return false;
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
  const list = _wmFilteredAftersales().sort((a, b) =>
    (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || (new Date(b.created_at || 0) - new Date(a.created_at || 0))
  );
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
      <div class="wm-chip-row">${timeChips}<span class="wm-sep"></span>${returnChips}<span class="wm-sep"></span><button class="wm-chip wm-chip-flag ${WORKMAIN._flagOnly ? 'active' : ''}" onclick="workmainToggleFlagOnly()">🚩 只看重点</button></div>
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
  const imgs = _wmCollectImgs(r);
  const thumb = _wmThumb(imgs, 'as:' + r.id);
  const canFlag = (typeof IS_ADMIN === 'undefined') || IS_ADMIN;
  const flagBtn = (r.flagged || canFlag)
    ? `<button class="wm-flag ${r.flagged ? 'on' : ''}" title="${r.flagged ? '重点(点取消)' : '主管标记重点'}" ${canFlag ? '' : 'disabled'} onclick="event.stopPropagation();workmainToggleFlag('aftersale',${r.id})">🚩</button>`
    : '';
  const actionBtn = handled
    ? `<button class="wm-act wm-act-undo" onclick="event.stopPropagation();workmainToggleAsReturn(${r.id}, false)">↩ 取消已处理</button>`
    : `<button class="wm-act wm-act-done" onclick="event.stopPropagation();workmainToggleAsReturn(${r.id}, true)">✅ 标记已处理退货</button>`;

  return `
  <div class="wm-card ${expanded ? 'expanded' : ''} ${r.flagged ? 'flagged' : ''}">
    <div class="wm-card-head" onclick="workmainToggleExpand('as:${r.id}')">
      <div class="wm-card-main">
        ${flagBtn}
        <span class="wm-order">${_wmEsc(r.order_ref || '无单号')}</span>
        <span class="wm-cust">${_wmEsc(r.customer || '—')}</span>
        <span class="wm-prod">${_wmEsc(r.product_name || '—')}</span>
      </div>
      <div class="wm-card-meta">
        ${thumb}
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
      ${r.issue_detail ? `<span class="wm-reason">${_wmEsc(r.issue_detail)}</span>` : ''}
      <span class="wm-card-actions">${actionBtn}</span>
    </div>
    ${expanded ? _wmAftersaleDetail(r) : ''}
  </div>`;
}

function _wmAftersaleDetail(r) {
  const row = (k, v) => v ? `<div class="wm-d-row"><span class="wm-d-k">${k}</span><span class="wm-d-v">${_wmEsc(v)}</span></div>` : '';
  const atts = _wmCollectImgs(r);
  let imgs = '';
  if (atts.length) {
    const key = 'as-d:' + r.id; _WM_IMG_REG[key] = atts;
    imgs = `<div class="wm-d-imgs">${atts.map((im, i) =>
      `<img class="wm-d-img" loading="lazy" src="${_wmEsc(im.url)}" alt="" onclick="_wmOpenLightbox(_WM_IMG_REG['${key}'],${i})">`
    ).join('')}</div>`;
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

// ============ 月度汇总(只读聚合 · 可导出)============
// 退款按"退款类型+币种"汇总金额/笔数(只算 status in completed/approved);
// 售后按供应商/问题类型计数;补件按进度计数。范围跟随顶部时间快筛。

function _wmTimeLabel() {
  const m = { '': '全部时间', today: '今天', yesterday: '昨天', week: '本周', month: '本月', quarter: '本季', year: '本年' };
  return m[WORKMAIN._time] || '全部时间';
}

function _wmSummaryData() {
  const inT = (d) => _wmInTime(d, WORKMAIN._time);
  // 退款:只算 completed / approved
  const refunds = WORKMAIN._refunds.filter(r => inT(r.created_at) && ['completed', 'approved'].includes(r.status));
  const refundAgg = {};   // key: type||cur
  refunds.forEach(r => {
    const type = _wmTypeLabel(r);
    const cur = r.currency || '—';
    const k = type + '|||' + cur;
    if (!refundAgg[k]) refundAgg[k] = { type, cur, count: 0, amount: 0 };
    refundAgg[k].count++;
    refundAgg[k].amount += Number(r.amount) || 0;
  });
  const curTotal = {};
  Object.values(refundAgg).forEach(x => { curTotal[x.cur] = (curTotal[x.cur] || 0) + x.amount; });

  // 售后:按供应商 / 问题类型计数
  const as = WORKMAIN._aftersales.filter(r => inT(r.created_at));
  const asBySupplier = {}, asByType = {};
  as.forEach(r => {
    const sup = r.supplier_name || r.supplier_names || '(未填供应商)';
    asBySupplier[sup] = (asBySupplier[sup] || 0) + 1;
    const ty = _wmIssueLabel(r);
    asByType[ty] = (asByType[ty] || 0) + 1;
  });

  // 补件:按进度计数
  const rf = WORKMAIN._refills.filter(r => inT(r.created_at));
  const rfByStatus = {};
  rf.forEach(r => {
    const s = _WM_REFILL_STATUS[r.refill_status] || r.refill_status || '—';
    rfByStatus[s] = (rfByStatus[s] || 0) + 1;
  });

  return {
    refundRows: Object.values(refundAgg).sort((a, b) => b.amount - a.amount),
    refundCurTotal: curTotal,
    refundCount: refunds.length,
    asBySupplier, asByType, asCount: as.length,
    rfByStatus, rfCount: rf.length,
  };
}

function _wmRenderSummary() {
  if (!(WORKMAIN._loaded && WORKMAIN._asLoaded && WORKMAIN._refillsLoaded)) {
    return `<div class="wm-placeholder">汇总加载中…(正在拉取退款 / 售后 / 补件三张表)</div>`;
  }
  const d = _wmSummaryData();
  const timeChips = [['', '全部'], ['today', '今天'], ['yesterday', '昨天'], ['week', '本周'], ['month', '本月'], ['quarter', '本季'], ['year', '本年']]
    .map(([k, l]) => `<button class="wm-chip ${WORKMAIN._time === k ? 'active' : ''}" onclick="workmainSetTime('${k}')">${l}</button>`).join('');

  // 退款汇总表
  const refundRows = d.refundRows.length
    ? d.refundRows.map(x => `<tr><td>${_wmEsc(x.type)}</td><td>${_wmEsc(x.cur)}</td><td class="num">${x.count}</td><td class="num">${x.amount.toFixed(2)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="wm-sum-empty">无数据</td></tr>`;
  const curTotalRows = Object.entries(d.refundCurTotal)
    .map(([cur, amt]) => `<tr class="wm-sum-total"><td colspan="2">合计(${_wmEsc(cur)})</td><td class="num">—</td><td class="num">${amt.toFixed(2)}</td></tr>`).join('');

  // 售后:供应商 / 问题类型
  const supRows = Object.entries(d.asBySupplier).sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `<tr><td>${_wmEsc(s)}</td><td class="num">${c}</td></tr>`).join('') || `<tr><td colspan="2" class="wm-sum-empty">无数据</td></tr>`;
  const typeRows = Object.entries(d.asByType).sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `<tr><td>${_wmEsc(s)}</td><td class="num">${c}</td></tr>`).join('') || `<tr><td colspan="2" class="wm-sum-empty">无数据</td></tr>`;

  // 补件:进度
  const rfRows = _WM_REFILL_STATUS_ORDER.map(k => _WM_REFILL_STATUS[k])
    .concat(Object.keys(d.rfByStatus).filter(s => !Object.values(_WM_REFILL_STATUS).includes(s)))
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(label => `<tr><td>${_wmEsc(label)}</td><td class="num">${d.rfByStatus[label] || 0}</td></tr>`).join('');

  return `
    <div class="wm-filters"><div class="wm-chip-row" style="margin-top:0">${timeChips}
      <span class="wm-sep"></span>
      <button class="wm-btn-refresh" onclick="_wmSummaryExport()">⬇ 导出 CSV</button>
    </div></div>
    <div class="wm-sum-rangeline">汇总范围:<b>${_wmTimeLabel()}</b> · 退款 ${d.refundCount} 笔(仅已审核/已完成)· 售后 ${d.asCount} 单 · 补件 ${d.rfCount} 条</div>

    <div class="wm-sum-block">
      <div class="wm-sum-title">💸 退款汇总(退款类型 × 币种 · 仅 approved/completed)</div>
      <table class="wm-sum-table">
        <thead><tr><th>退款类型</th><th>币种</th><th class="num">笔数</th><th class="num">金额合计</th></tr></thead>
        <tbody>${refundRows}${curTotalRows}</tbody>
      </table>
    </div>

    <div class="wm-sum-2col">
      <div class="wm-sum-block">
        <div class="wm-sum-title">🔧 售后 · 按供应商</div>
        <table class="wm-sum-table"><thead><tr><th>供应商</th><th class="num">单数</th></tr></thead><tbody>${supRows}</tbody></table>
      </div>
      <div class="wm-sum-block">
        <div class="wm-sum-title">🔧 售后 · 按问题类型</div>
        <table class="wm-sum-table"><thead><tr><th>问题类型</th><th class="num">单数</th></tr></thead><tbody>${typeRows}</tbody></table>
      </div>
    </div>

    <div class="wm-sum-block" style="max-width:420px">
      <div class="wm-sum-title">📦 补件 · 按进度</div>
      <table class="wm-sum-table"><thead><tr><th>进度</th><th class="num">条数</th></tr></thead><tbody>${rfRows}</tbody></table>
    </div>`;
}

function _wmSummaryExport() {
  const d = _wmSummaryData();
  const lines = [];
  const esc = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const row = arr => lines.push(arr.map(esc).join(','));
  row([`客服工作主线 月度汇总`, `范围:${_wmTimeLabel()}`, `导出:${new Date().toLocaleString()}`]);
  row([]);
  row(['【退款汇总(仅 approved/completed)】']);
  row(['退款类型', '币种', '笔数', '金额合计']);
  d.refundRows.forEach(x => row([x.type, x.cur, x.count, x.amount.toFixed(2)]));
  Object.entries(d.refundCurTotal).forEach(([cur, amt]) => row([`合计(${cur})`, '', '', amt.toFixed(2)]));
  row([]);
  row(['【售后 · 按供应商】']); row(['供应商', '单数']);
  Object.entries(d.asBySupplier).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => row([s, c]));
  row([]);
  row(['【售后 · 按问题类型】']); row(['问题类型', '单数']);
  Object.entries(d.asByType).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => row([s, c]));
  row([]);
  row(['【补件 · 按进度】']); row(['进度', '条数']);
  Object.entries(d.rfByStatus).forEach(([s, c]) => row([s, c]));

  const csv = '\ufeff' + lines.join('\r\n');   // BOM 防 Excel 中文乱码
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `客服工作主线汇总_${_wmTimeLabel()}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    _wmToast('已导出 CSV', 'success');
  } catch (e) { _wmToast('导出失败:' + (e.message || e), 'err'); }
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
