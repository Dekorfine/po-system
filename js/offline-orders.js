// ============================================================================
// V20260623:线下单【直连客服库】模式(替代消息桥)
//   数据源:客服库 kwrajryhwyytkjkkidor · 表 offline_orders(单一数据源·主键 order_no)
//   跟单:读全部 + 写自己的 po_stage 列(to_order/producing/arrived)记工序,不动客服 status
//   status=shipped 当已发货只读;客服管 status/发货字段,跟单管 po_stage/notes
//   (旧消息桥 cross_dept_messages 模式已停用)
// ============================================================================

// 客服库 client(线下单 offline_orders 在这个库)
const CS_OFFLINE_URL = 'https://kwrajryhwyytkjkkidor.supabase.co';
const CS_OFFLINE_KEY = 'sb_publishable_6j-rSrv1V95FROe-iX6Yew_unE_Y6n9';
let csOfflineClient = null;
function _getCsOffline() {
  if (!csOfflineClient && window.supabase) {
    csOfflineClient = window.supabase.createClient(CS_OFFLINE_URL, CS_OFFLINE_KEY, { auth: { persistSession: false } });
  }
  return csOfflineClient;
}

const OFF_STAGES = [
  { k: 'pending_payment', label: '待付款', color: '#92400e', bg: 'rgba(239,159,39,0.08)', readonly: true },
  { k: 'ordered',   label: '待下单', color: 'var(--text-secondary)', bg: 'rgba(136,135,128,0.08)' },
  { k: 'producing', label: '生产中', color: '#854f0b',               bg: 'rgba(239,159,39,0.1)' },
  { k: 'shipped',   label: '已发货', color: '#0f6e56',               bg: 'rgba(29,158,117,0.1)' },
];
const OFF_STAGE_MAP = Object.fromEntries(OFF_STAGES.map(s => [s.k, s]));
// V20260624:简化为3段(去掉已到货)· 待下单→生产中→已发货 · 跟单点发货=自动隐藏
const OFF_NEXT = { ordered: 'producing', producing: 'shipped' };
const OFF_PREV = { producing: 'ordered', shipped: 'producing' };
// 进行中阶段(主列表只显示这些)· 待付款和已发货不在主列表
const OFF_ACTIVE_STAGES = ['ordered', 'producing'];
// 行式进度展示用的阶段(不含待付款)
const OFF_FLOW_STAGES = ['ordered', 'producing', 'shipped'];
// V20260617:旧数据兼容 — pending/claimed 一律视为 ordered(待下单)· 接单环节归客服,跟单拿到直接下单
//   received(旧已签收)已取消 → 归并为 shipped(已发货终态)
const OFF_STAGE_NORMALIZE = { pending: 'ordered', claimed: 'ordered', received: 'shipped', to_order: 'ordered', arrived: 'producing' };

const OFFLINE = { _msgs: [], _followups: {}, _shipped: {}, _view: (typeof localStorage !== 'undefined' && localStorage.getItem('offline_view')) || 'list', _scope: 'active', _search: '', _timeFilter: '', _siteFilter: '', _loadedAt: 0 };
window.OFFLINE = OFFLINE;

function _offIsBase64(v) {
  const s = String(v || '');
  return s.startsWith('data:') || (s.length > 500 && !/^https?:\/\//.test(s));
}
function _offAttUrl(a) {
  let u = '';
  if (typeof cdmAttUrl === 'function') u = cdmAttUrl(a);
  else u = (a && (a.url || a.publicUrl)) || '';
  if (_offIsBase64(u) || _offIsBase64(a && a.dataUrl)) return '__BASE64__';
  return u;
}
function _offGetFu(orderNo) { return OFFLINE._followups[orderNo] || { stage: 'ordered' }; }
// V20260623:订单号规范化(剥掉 # 前缀和首尾空格)· 用于跨消息匹配(转单 vs 发货可能一个带#一个不带)
function _offNormNo(no) { return String(no || '').replace(/^#/, '').trim(); }
// 按规范化订单号查发货信息(转单/发货订单号可能 # 不一致)
function _offShippedOf(no) { return (OFFLINE._shipped && OFFLINE._shipped[_offNormNo(no)]) || null; }
function _offStageOf(m) {
  // V20260623:按客服 status 区分付款阶段
  const csStatus = (m && m._csStatus) || (m && m._row && m._row.status) || '';
  if (csStatus === 'shipped') return 'shipped';        // 客服已发货 → 已发货只读
  if (csStatus === 'cancelled') return 'cancelled';
  // 未付款/草稿 → 单独「待付款」列(跟单还不接手,等客服收款)
  if (csStatus === 'pending_payment' || csStatus === 'draft') return 'pending_payment';
  // 已付款(paid)/已下单(dispatched)→ 跟单按 po_stage 推进工序
  const fu = _offGetFu(m.related_ref);
  if (fu.cancelled) return 'cancelled';
  if (_offShippedOf(m.related_ref)) return 'shipped';
  let st = fu.stage || 'ordered';
  if (OFF_STAGE_NORMALIZE[st]) st = OFF_STAGE_NORMALIZE[st];   // 旧值兼容
  if (st === 'pending_payment') st = 'ordered';   // 防 po_stage 误存付款态
  return st;
}

async function loadOfflineOrders() {
  // V20260623:直连客服库 kwrajryhwyytkjkkidor 的 offline_orders 表(单一数据源)
  const cs = _getCsOffline();
  if (!cs) { console.warn('[offline] 客服库 client 未就绪'); return; }
  OFFLINE._followups = {};
  OFFLINE._shipped = {};
  OFFLINE._shippedUnmatched = [];
  try {
    // 列表查询:不取 attachments(重列),编辑/详情时再单独拉
    const { data: rows, error } = await cs.from('offline_orders')
      .select('*')
      .eq('deleted', false)
      .order('updated_at', { ascending: false }).limit(500);
    if (error) throw error;

    // 把每行 offline_orders 映射成渲染层需要的 m 形状
    OFFLINE._msgs = (rows || []).map(o => {
      const orderNo = o.order_no || '';
      // po_stage(跟单工序)→ followups;客服 status=shipped 当已发货
      OFFLINE._followups[orderNo] = {
        order_no: orderNo,
        stage: o.po_stage || 'ordered',
        remark: o.notes || '',
        cancelled: o.status === 'cancelled',
      };
      // 客服已发货 → 记快递单号
      if (o.status === 'shipped' && o.ship_no) {
        OFFLINE._shipped[_offNormNo(orderNo)] = { tracking: o.ship_no, carrier: o.ship_carrier || '', at: o.shipped_at };
      }
      return {
        id: o.id,
        related_ref: orderNo,
        related_shop: o.site || '',
        priority: 'normal',
        title: `[线下单] ${orderNo}`,
        body: _offComposeBody(o),
        attachments: Array.isArray(o.attachments) ? o.attachments : [],   // select * 已带附件
        _attLoaded: true,
        _row: o,                  // 完整行(详情/商品行用)
        _csStatus: o.status,      // 客服状态(shipped 当已发货只读)
        created_at_ms: o.created_at ? new Date(o.created_at).getTime() : 0,
      };
    });
    OFFLINE._loadedAt = Date.now();
  } catch (e) {
    console.warn('[offline] 加载客服线下单失败:', e.message);
    if (typeof toast === 'function') toast('线下单加载失败:' + (e.message || e), 'err', 4000);
  }
}

// 把 offline_orders 行组装成展示文本(给详情/卡片备注用)
function _offComposeBody(o) {
  const lines = [];
  if (o.customer_name) lines.push(`客户: ${o.customer_name}${o.customer_email ? ' · ' + o.customer_email : ''}`);
  if (o.payment_currency || o.payment_amount) lines.push(`金额: ${o.payment_currency || ''} ${o.payment_amount || ''}${o.received_amount ? ' · 实收 ' + o.received_amount : ''}`);
  const addr = [o.ship_to_name, o.ship_to_address, o.ship_to_city, o.ship_to_state, o.ship_to_zip, o.ship_to_country].filter(Boolean).join(', ');
  if (addr) lines.push(`收货: ${addr}`);
  if (Array.isArray(o.products) && o.products.length) {
    lines.push('商品:');
    o.products.forEach(p => lines.push(`  · ${p.sku || ''} ${p.name || p.variant_title || ''} ×${p.qty || p.quantity || 1}`));
  }
  if (o.ship_no) lines.push(`快递单号: ${o.ship_no}${o.ship_carrier ? ' · ' + o.ship_carrier : ''}`);
  return lines.join('\n');
}


function renderOfflineOrders() {
  const body = document.getElementById('offlineBody');
  if (!body) return;
  const allMsgs = OFFLINE._msgs || [];
  // 默认视图 = 列表
  if (!OFFLINE._view) OFFLINE._view = 'list';
  if (!OFFLINE._scope) OFFLINE._scope = 'active';   // active=进行中 / shipped=已发货

  // 分组:进行中(待下单+生产中)· 已发货 · (待付款和取消不进主流程)
  const activeMsgs = [], shippedMsgs = [], pendingMsgs = [];
  allMsgs.forEach(m => {
    const st = _offStageOf(m);
    if (st === 'cancelled') return;
    if (st === 'shipped') shippedMsgs.push(m);
    else if (st === 'pending_payment') pendingMsgs.push(m);
    else activeMsgs.push(m);   // ordered + producing
  });

  const vbtn = (k, label) => `<button onclick="offlineSetView('${k}')" style="padding:5px 11px; font-size:11.5px; border:0; ${k !== 'list' ? 'border-left:1px solid var(--border);' : ''} cursor:pointer; background:${OFFLINE._view === k ? 'var(--accent)' : 'var(--bg-card)'}; color:${OFFLINE._view === k ? 'white' : 'var(--text-secondary)'}; font-weight:${OFFLINE._view === k ? '600' : '400'};">${label}</button>`;
  const sbtn = (k, label, count, icon) => `<button onclick="offlineSetScope('${k}')" style="padding:6px 13px; font-size:12.5px; border:1px solid ${OFFLINE._scope === k ? 'var(--accent)' : 'var(--border)'}; border-radius:8px; cursor:pointer; background:${OFFLINE._scope === k ? 'var(--accent)' : 'var(--bg-card)'}; color:${OFFLINE._scope === k ? 'white' : 'var(--text-secondary)'}; font-weight:${OFFLINE._scope === k ? '600' : '400'};">${icon} ${label} <span style="background:${OFFLINE._scope === k ? 'rgba(255,255,255,0.25)' : 'var(--bg-elevated)'}; padding:0 6px; border-radius:8px; font-size:11px;">${count}</span></button>`;

  const header = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
      <h2 style="margin:0; font-size:17px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        🧾 线下单
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">客服转来的已付款订单 · 一行一单 · 点发货后自动隐藏</span>
      </h2>
      <div style="margin-left:auto; display:inline-flex; gap:0; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
        ${vbtn('list', '☰ 列表')}${vbtn('board', '▦ 看板')}${vbtn('grid', '⊞ 网格')}
      </div>
      <button class="btn small" onclick="loadOfflineOrders().then(renderOfflineOrders)">🔄 刷新</button>
      <button class="btn small" onclick="offlineDiagShipped()" title="检测客服库连接和数据">🔍 连接检测</button>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
      ${sbtn('active', '进行中', activeMsgs.length, '⏳')}
      ${sbtn('shipped', '已发货', shippedMsgs.length, '📦')}
      ${pendingMsgs.length ? `<span style="font-size:11px; color:var(--text-tertiary); margin-left:4px;">·  待付款 ${pendingMsgs.length} 单(客服收款后才转来,跟单不显示防误下单)</span>` : ''}
    </div>
    ${_offToolbar()}`;

  if (allMsgs.length === 0) {
    body.innerHTML = header + `<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:34px;">🧾</div><div>还没有线下单(客服转单后出现在这里)</div></div>`;
    return;
  }

  // 当前 scope 的数据
  let msgs = OFFLINE._scope === 'shipped' ? shippedMsgs : activeMsgs;
  // 应用 搜索 + 时间 + 网站 筛选
  msgs = _offApplyFilters(msgs);
  if (msgs.length === 0) {
    const hasFilter = OFFLINE._search || OFFLINE._timeFilter || OFFLINE._siteFilter;
    const emptyTxt = hasFilter ? '没有匹配的订单(试试清除筛选)'
      : OFFLINE._scope === 'shipped' ? '还没有已发货的单' : '没有进行中的单(待下单/生产中)· 客服收款转单后出现在这里';
    body.innerHTML = header + `<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:30px;">${hasFilter ? '🔍' : OFFLINE._scope === 'shipped' ? '📦' : '✅'}</div><div>${emptyTxt}</div>${hasFilter ? '<button class="btn small" style="margin-top:12px;" onclick="offlineClearFilters()">清除筛选</button>' : ''}</div>`;
    return;
  }

  // 重复订单号检测(黄条警告)· 基于当前 scope 全部数据(不受分页影响)
  const seen = {}, dups = new Set();
  msgs.forEach(m => { const no = (m._row && m._row.order_no) || m.related_ref; if (no) { if (seen[no]) dups.add(no); seen[no] = true; } });
  const dupBanner = dups.size ? `<div style="margin-bottom:10px; padding:9px 14px; background:rgba(239,159,39,0.12); border:1px solid rgba(239,159,39,0.4); border-radius:8px; font-size:12px; color:#854f0b;">⚠️ 发现 ${dups.size} 个重复订单号:${[...dups].slice(0, 8).map(escapeHtml).join('、')}${dups.size > 8 ? ' 等' : ''} · 可能客服重复建单,建议核对</div>` : '';

  const view = OFFLINE._view === 'grid' ? _offRenderGrid(msgs)
             : OFFLINE._view === 'board' ? _offRenderBoard(msgs)
             : _offRenderList(msgs);
  body.innerHTML = header + dupBanner + view;
}
function offlineSetScope(s) { OFFLINE._scope = s; OFF_LIST_PAGE = 0; renderOfflineOrders(); }
window.offlineSetScope = offlineSetScope;

// ── 工具栏:智能搜索 + 时间筛选 + 网站筛选 + 每页数量 ──
const OFF_TIME_FILTERS = [
  { k: '', label: '全部' },
  { k: 'today', label: '今天' },
  { k: '3d', label: '近3天' },
  { k: '7d', label: '近7天' },
  { k: '30d', label: '近30天' },
];
function _offToolbar() {
  // 网站下拉(从所有单提取站点码)
  const sites = {};
  (OFFLINE._msgs || []).forEach(m => { const s = (m._row && m._row.site) || m.related_shop; if (s) sites[s] = true; });
  const siteOpts = '<option value="">🌐 全部网站</option>' + Object.keys(sites).sort().map(s => `<option value="${escapeHtml(s)}" ${OFFLINE._siteFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
  const timeBtns = OFF_TIME_FILTERS.map(t =>
    `<button onclick="offlineSetTime('${t.k}')" style="padding:4px 11px; font-size:11.5px; border:1px solid ${(OFFLINE._timeFilter || '') === t.k ? 'var(--accent)' : 'var(--border)'}; border-radius:14px; cursor:pointer; background:${(OFFLINE._timeFilter || '') === t.k ? 'var(--accent)' : 'var(--bg-card)'}; color:${(OFFLINE._timeFilter || '') === t.k ? '#fff' : 'var(--text-secondary)'};">${t.label}</button>`
  ).join('');
  const sizeSel = [20, 50, 100].map(n => `<option value="${n}" ${OFF_LIST_PAGE_SIZE === n ? 'selected' : ''}>${n}/页</option>`).join('');
  const hasFilter = OFFLINE._search || OFFLINE._timeFilter || OFFLINE._siteFilter;
  return `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
      <div style="position:relative; flex:1; min-width:220px;">
        <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-tertiary); font-size:13px;">🔍</span>
        <input type="text" id="offSearchInput" value="${escapeHtml(OFFLINE._search || '')}" oninput="offlineSetSearch(this.value)"
          placeholder="搜订单号 / 客户名 / 邮箱 / 网站 / 快递单号 / SKU"
          style="width:100%; padding:8px 10px 8px 32px; font-size:12.5px; border:1px solid var(--border); border-radius:7px; box-sizing:border-box; background:var(--bg-card);">
      </div>
      <div style="display:inline-flex; gap:5px; align-items:center;">
        <span style="font-size:11px; color:var(--text-tertiary);">下单时间:</span>${timeBtns}
      </div>
      <select onchange="offlineSetSite(this.value)" style="padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">${siteOpts}</select>
      <select onchange="offlineSetPageSize(this.value)" style="padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">${sizeSel}</select>
      ${hasFilter ? `<button class="btn small" onclick="offlineClearFilters()" style="font-size:11px;">✕ 清除筛选</button>` : ''}
    </div>`;
}

// 应用筛选(搜索 + 时间 + 网站)
function _offApplyFilters(msgs) {
  let out = msgs;
  const q = (OFFLINE._search || '').trim().toLowerCase();
  if (q) {
    out = out.filter(m => {
      const o = m._row || {};
      const hay = [
        o.order_no, m.related_ref, o.site, m.related_shop,
        o.customer_name, o.customer_email, o.customer_phone,
        o.ship_no, o.ship_carrier, o.created_by_name,
        ...(Array.isArray(o.products) ? o.products.map(p => (p.sku || '') + ' ' + (p.name || '')) : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if (OFFLINE._siteFilter) {
    out = out.filter(m => ((m._row && m._row.site) || m.related_shop) === OFFLINE._siteFilter);
  }
  if (OFFLINE._timeFilter) {
    const now = Date.now();
    const span = { today: 1, '3d': 3, '7d': 7, '30d': 30 }[OFFLINE._timeFilter];
    if (span) {
      let cutoff;
      if (OFFLINE._timeFilter === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); cutoff = d.getTime(); }
      else cutoff = now - span * 86400000;
      out = out.filter(m => {
        const o = m._row || {};
        const t = o.created_at ? new Date(o.created_at).getTime() : (m.created_at_ms || 0);
        return t >= cutoff;
      });
    }
  }
  return out;
}

let _offSearchTimer = null;
function offlineSetSearch(v) {
  OFFLINE._search = v; OFF_LIST_PAGE = 0;
  // 防抖:输入停 250ms 再渲染(避免每键全量重渲)
  clearTimeout(_offSearchTimer);
  _offSearchTimer = setTimeout(() => {
    renderOfflineOrders();
    const inp = document.getElementById('offSearchInput');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }, 250);
}
function offlineSetTime(k) { OFFLINE._timeFilter = k; OFF_LIST_PAGE = 0; renderOfflineOrders(); }
function offlineSetSite(v) { OFFLINE._siteFilter = v; OFF_LIST_PAGE = 0; renderOfflineOrders(); }
function offlineSetPageSize(n) { OFF_LIST_PAGE_SIZE = parseInt(n) || 20; OFF_LIST_PAGE = 0; renderOfflineOrders(); }
function offlineClearFilters() { OFFLINE._search = ''; OFFLINE._timeFilter = ''; OFFLINE._siteFilter = ''; OFF_LIST_PAGE = 0; renderOfflineOrders(); }
window.offlineSetSearch = offlineSetSearch;
window.offlineSetTime = offlineSetTime;
window.offlineSetSite = offlineSetSite;
window.offlineSetPageSize = offlineSetPageSize;
window.offlineClearFilters = offlineClearFilters;

// V20260623:看板每列分页(防一列上百卡变无限长列 · 与客服端对齐)
const OFF_BOARD_PAGE_SIZE = 8;
const OFF_BOARD_PAGE = {};   // stageKey -> 当前页(0-based)
function offBoardSetPage(stageK, page) {
  OFF_BOARD_PAGE[stageK] = page;
  renderOfflineOrders();
}
window.offBoardSetPage = offBoardSetPage;

// 单列翻页器 HTML(顶/底通用)· ‹ n / m › · 到头到尾置灰
function _offColPager(stageK, safePage, totalPages) {
  if (totalPages <= 1) return '';
  const prevDis = safePage <= 0, nextDis = safePage >= totalPages - 1;
  const btn = (label, dis, toPage) => `<button onclick="${dis ? '' : `offBoardSetPage('${stageK}',${toPage})`}"
    style="width:24px; height:22px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); cursor:${dis ? 'default' : 'pointer'}; opacity:${dis ? '0.4' : '1'}; font-size:12px; line-height:1; padding:0;" ${dis ? 'disabled' : ''}>${label}</button>`;
  return `<div style="display:flex; align-items:center; justify-content:center; gap:6px; padding:6px 0; font-size:11px; color:var(--text-secondary);">
    ${btn('‹', prevDis, Math.max(0, safePage - 1))}
    <span style="min-width:42px; text-align:center;">${safePage + 1} / ${totalPages}</span>
    ${btn('›', nextDis, Math.min(totalPages - 1, safePage + 1))}
  </div>`;
}

function _offRenderBoard(msgs) {
  const byStage = {};
  OFF_STAGES.forEach(s => byStage[s.k] = []);
  const cancelled = [];
  msgs.forEach(m => {
    const st = _offStageOf(m);
    if (st === 'cancelled') cancelled.push(m);
    else (byStage[st] = byStage[st] || []).push(m);
  });
  // V20260624:看板列按 scope 过滤 — 进行中只显示待下单/生产中,已发货只显示已发货
  const shownStages = OFFLINE._scope === 'shipped'
    ? OFF_STAGES.filter(s => s.k === 'shipped')
    : OFF_STAGES.filter(s => OFF_ACTIVE_STAGES.includes(s.k));
  const cols = shownStages.map(s => {
    const list = byStage[s.k];
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / OFF_BOARD_PAGE_SIZE));
    let safePage = OFF_BOARD_PAGE[s.k] || 0;
    if (safePage > totalPages - 1) safePage = totalPages - 1;   // 列表变短自动收敛,不出空白页
    if (safePage < 0) safePage = 0;
    OFF_BOARD_PAGE[s.k] = safePage;
    const start = safePage * OFF_BOARD_PAGE_SIZE;
    const pageCards = list.slice(start, start + OFF_BOARD_PAGE_SIZE);   // 只渲染本页
    const pager = _offColPager(s.k, safePage, totalPages);
    return `
    <div style="background:${s.bg}; border-radius:10px; padding:10px; display:flex; flex-direction:column; min-width:210px;">
      <div style="font-size:12.5px; font-weight:700; color:${s.color}; padding:2px 4px 6px; display:flex; justify-content:space-between; align-items:center;">
        <span>${s.label}</span><span style="background:var(--bg-card); padding:0 8px; border-radius:10px; opacity:0.9;">${total}</span>
      </div>
      ${pager}
      <div style="display:flex; flex-direction:column; gap:8px; min-height:40px;">
        ${pageCards.map(m => _offBoardCard(m, s.k)).join('') || `<div style="font-size:11px; color:var(--text-tertiary); text-align:center; padding:14px 8px;">空</div>`}
      </div>
      ${pager}
    </div>`;
  }).join('');
  let html = `<div class="offline-board">${cols}</div>`;
  if (cancelled.length) {
    html += `<details style="margin-top:12px;"><summary style="cursor:pointer; font-size:12px; color:var(--text-secondary);">🗑️ 已取消 (${cancelled.length})</summary><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">${cancelled.map(m => _offBoardCard(m, 'cancelled')).join('')}</div></details>`;
  }
  return html;
}

function _offBoardCard(m, stage) {
  const o = m._row || {};
  const fu = _offGetFu(m.related_ref);
  const orderNo = m.related_ref || o.order_no || '(无单号)';
  const site = m.related_shop || o.site || '';
  // 金额(原币种)
  const curr = o.payment_currency || 'USD';
  const amt = o.payment_amount || o.received_amount || 0;
  const amtStr = amt ? `${curr} ${Number(amt).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';
  // 客户
  const cust = o.customer_name || '';
  const email = o.customer_email || '';
  // 商品件数
  const products = Array.isArray(o.products) ? o.products : [];
  const itemCount = products.reduce((s, p) => s + Number(p.qty || p.quantity || 1), 0);
  const creator = o.created_by_name || o.created_by || '';
  // 商品图(优先 products 里的图,其次 attachments)
  let imgUrl = '';
  for (const p of products) {
    const u = p.image || p.image_url || p.img || (Array.isArray(p.images) ? p.images[0] : '');
    if (u) { imgUrl = u; break; }
  }
  if (!imgUrl && Array.isArray(o.attachments)) {
    for (const a of o.attachments) { const u = _offAttUrl(a); if (u && u !== '__BASE64__') { imgUrl = u; break; } }
  }
  const imgCell = imgUrl
    ? `<img src="${escapeHtml(_offImg(imgUrl, '120x120'))}" loading="lazy" onerror="this.style.display='none'" onclick="event.stopPropagation(); openImgLightbox && openImgLightbox('${escapeHtml(_offImg(imgUrl, '800x800'))}')" style="width:42px; height:42px; object-fit:cover; border-radius:6px; flex-shrink:0; cursor:zoom-in;">`
    : `<div style="width:42px; height:42px; background:var(--bg-elevated); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">🧾</div>`;

  const next = (stage !== 'cancelled') ? OFF_NEXT[stage] : null;
  const nextLabel = next ? OFF_STAGE_MAP[next].label : null;
  let actions = '';
  if (stage === 'pending_payment') {
    actions = `<div style="font-size:10.5px; color:#92400e; text-align:center; padding:3px; background:rgba(239,159,39,0.1); border-radius:5px;">⏳ 等客服收款 · 收款后转「待下单」</div>`;
  } else if (next) {
    actions = `<button class="btn small" style="font-size:11px; padding:3px 10px; width:100%; background:var(--accent); color:white; border:0; border-radius:6px;" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}')">→ ${nextLabel}</button>`;
  } else if (stage === 'shipped') {
    const _sh = _offShippedOf(orderNo); const tk = (_sh && _sh.tracking) || o.ship_no || '';
    actions = `<div style="font-size:10.5px; color:var(--ok); text-align:center; padding:3px;">✅ 已发货${tk ? ` · ${escapeHtml(tk)}` : ''}</div>`;
  } else if (stage === 'arrived') {
    actions = `<div style="font-size:10.5px; color:var(--text-tertiary); text-align:center; padding:3px;">✅ 已到货 · 等客服发货</div>`;
  }

  return `
  <div onclick="offlineOpenDetail('${m.id}')" style="background:var(--bg-card); border:1px solid var(--border); border-radius:10px; padding:11px; cursor:pointer; ${stage === 'cancelled' ? 'opacity:0.55;' : ''}">
    <div style="display:flex; gap:9px;">
      ${imgCell}
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;">
          ${site ? `<span style="font-size:9.5px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:1px 5px; border-radius:4px;">${escapeHtml(site)}</span>` : ''}
          <span style="font-weight:700; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(orderNo)}</span>
          ${amtStr ? `<span style="font-size:11px; font-weight:600; color:var(--text-secondary); margin-left:auto; white-space:nowrap;">${escapeHtml(amtStr)}</span>` : ''}
        </div>
        ${cust ? `<div style="font-size:11.5px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">👤 ${escapeHtml(cust)}</div>` : ''}
        ${email ? `<div style="font-size:10px; color:var(--text-tertiary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">✉️ ${escapeHtml(email)}</div>` : ''}
        <div style="font-size:10px; color:var(--text-tertiary); margin-top:2px;">📦 ${itemCount} 件${creator ? ` · 录入 ${escapeHtml(creator)}` : ''}</div>
      </div>
    </div>
    ${fu.remark ? `<div style="font-size:10px; color:var(--text-secondary); margin-top:7px; padding:4px 6px; background:var(--bg-elevated); border-radius:5px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${escapeHtml(fu.remark)}">📝 ${escapeHtml(fu.remark)}</div>` : ''}
    ${actions ? `<div style="margin-top:8px;" onclick="event.stopPropagation();">${actions}</div>` : ''}
  </div>`;
}

// Shopify CDN 图片压缩(文件名后插 _WxH)
function _offImg(url, size) {
  if (!url || typeof url !== 'string') return url;
  if (!/cdn\.shopify\.com|\/cdn\/shop\//i.test(url)) return url;
  try {
    const [base, query] = url.split('?');
    const cleaned = base.replace(/_(\d+x\d+|\d+x|x\d+)(?=\.\w+$)/i, '');
    const resized = cleaned.replace(/(\.\w+)$/i, `_${size}$1`);
    return query ? `${resized}?${query}` : resized;
  } catch (e) { return url; }
}

// ── 网格视图(大图卡片 · 自适应列 · 看大图为主)──
function _offRenderGrid(msgs) {
  // V20260623:网格分页(顶+底)
  const total = msgs.length;
  const totalPages = Math.max(1, Math.ceil(total / OFF_LIST_PAGE_SIZE));
  let safePage = OFF_LIST_PAGE;
  if (safePage > totalPages - 1) safePage = totalPages - 1;
  if (safePage < 0) safePage = 0;
  OFF_LIST_PAGE = safePage;
  const start = safePage * OFF_LIST_PAGE_SIZE;
  const pageMsgs = msgs.slice(start, start + OFF_LIST_PAGE_SIZE);
  const pager = _offListPager(safePage, totalPages, total);
  const cards = pageMsgs.map(m => {
    const o = m._row || {};
    const st = _offStageOf(m);
    const meta = (st === 'cancelled') ? { label: '已取消', color: 'var(--danger)', bg: 'rgba(220,38,38,0.1)' } : OFF_STAGE_MAP[st];
    const fu = _offGetFu(m.related_ref);
    const orderNo = m.related_ref || '(无单号)';
    const site = m.related_shop || o.site || '';
    const next = (st !== 'cancelled' && st !== 'received') ? OFF_NEXT[st] : null;
    const curr = o.payment_currency || 'USD';
    const amt = o.payment_amount || o.received_amount || 0;
    const amtStr = amt ? `${curr} ${Number(amt).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';
    const cust = o.customer_name || '';
    const products = Array.isArray(o.products) ? o.products : [];
    const itemCount = products.reduce((s, p) => s + Number(p.qty || p.quantity || 1), 0);
    // 商品图(products 优先,其次 attachments)
    let firstUrl = '';
    for (const p of products) { const u = p.image || p.image_url || p.img || (Array.isArray(p.images) ? p.images[0] : ''); if (u) { firstUrl = u; break; } }
    if (!firstUrl && Array.isArray(o.attachments)) { for (const a of o.attachments) { const u = _offAttUrl(a); if (u && u !== '__BASE64__') { firstUrl = u; break; } } }
    const cover = firstUrl
      ? `<div style="height:150px; background:var(--bg-elevated); border-radius:8px 8px 0 0; overflow:hidden;"><img src="${escapeHtml(_offImg(firstUrl, '400x400'))}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=&quot;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:28px;&quot;>🧾</div>'" style="width:100%; height:100%; object-fit:cover;"></div>`
      : `<div style="height:150px; background:var(--bg-elevated); border-radius:8px 8px 0 0; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:30px;">🧾</div>`;
    return `
    <div class="as-card" onclick="offlineOpenDetail('${m.id}')" style="cursor:pointer; ${st === 'cancelled' ? 'opacity:0.55;' : ''} padding:0; overflow:hidden;">
      ${cover}
      <div style="padding:10px 12px;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
          <span style="background:${meta.bg || 'var(--bg-elevated)'}; color:${meta.color}; padding:1px 8px; border-radius:8px; font-size:10.5px; font-weight:600;">${meta.label}</span>
          ${site ? `<span style="font-size:9.5px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:1px 5px; border-radius:4px;">${escapeHtml(site)}</span>` : ''}
          ${amtStr ? `<span style="font-size:11px; font-weight:600; color:var(--text-secondary); margin-left:auto;">${escapeHtml(amtStr)}</span>` : ''}
        </div>
        <div style="font-weight:700; font-size:14px; margin-bottom:2px;">${escapeHtml(orderNo)}</div>
        ${cust ? `<div style="font-size:11.5px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">👤 ${escapeHtml(cust)}</div>` : ''}
        <div style="font-size:10.5px; color:var(--text-tertiary); margin-bottom:8px;">📦 ${itemCount} 件${o.created_by_name ? ` · 录入 ${escapeHtml(o.created_by_name)}` : ''}</div>
        ${st === 'cancelled' ? '' : (next
          ? `<button class="btn small" style="width:100%; font-size:11px; background:var(--accent); color:white; border:0; border-radius:6px; padding:4px;" onclick="event.stopPropagation(); offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}')">→ ${OFF_STAGE_MAP[next].label}</button>`
          : (st === 'shipped'
              ? `<div style="text-align:center; font-size:11px; color:var(--ok);">✅ 已发货${(_offShippedOf(orderNo) && _offShippedOf(orderNo).tracking) ? ` · ${escapeHtml(_offShippedOf(orderNo).tracking)}` : ''}</div>`
              : (st === 'arrived'
                  ? `<div style="text-align:center; font-size:11px; color:var(--text-tertiary);">✅ 已到货 · 等客服发货</div>`
                  : '')))}
      </div>
    </div>`;
  }).join('');
  return `${pager}<div class="as-grid">${cards}</div>${pager}`;
}

let OFF_LIST_PAGE = 0;
let OFF_LIST_PAGE_SIZE = 20;
function offListSetPage(page) { OFF_LIST_PAGE = page; renderOfflineOrders(); }
window.offListSetPage = offListSetPage;
function _offListPager(safePage, totalPages, total) {
  if (totalPages <= 1) return '';
  const prevDis = safePage <= 0, nextDis = safePage >= totalPages - 1;
  const btn = (label, dis, toPage) => `<button onclick="${dis ? '' : `offListSetPage(${toPage})`}"
    style="padding:4px 12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); cursor:${dis ? 'default' : 'pointer'}; opacity:${dis ? '0.4' : '1'}; font-size:12px;" ${dis ? 'disabled' : ''}>${label}</button>`;
  return `<div style="display:flex; align-items:center; justify-content:center; gap:10px; padding:8px 0; font-size:12px; color:var(--text-secondary);">
    ${btn('‹ 上一页', prevDis, Math.max(0, safePage - 1))}
    <span>第 ${safePage + 1} / ${totalPages} 页 · 共 ${total} 单</span>
    ${btn('下一页 ›', nextDis, Math.min(totalPages - 1, safePage + 1))}
  </div>`;
}

function _offRenderList(msgs) {
  // V20260624:行式列表(一行一单·像销售单)· 缩略图+进度色块+右侧推进/发货按钮
  const total = msgs.length;
  const totalPages = Math.max(1, Math.ceil(total / OFF_LIST_PAGE_SIZE));
  let safePage = OFF_LIST_PAGE;
  if (safePage > totalPages - 1) safePage = totalPages - 1;
  if (safePage < 0) safePage = 0;
  OFF_LIST_PAGE = safePage;
  const start = safePage * OFF_LIST_PAGE_SIZE;
  const pageMsgs = msgs.slice(start, start + OFF_LIST_PAGE_SIZE);
  const pager = _offListPager(safePage, totalPages, total);
  const isShippedScope = OFFLINE._scope === 'shipped';

  // 图例(进行中才显示进度图例)
  const legend = isShippedScope ? '' : `
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:8px; padding:7px 12px; background:var(--bg-elevated); border-radius:7px; font-size:11px; color:var(--text-secondary); flex-wrap:wrap;">
      <span>进度:</span>
      <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:#1d9e75; display:inline-block;"></span>已完成</span>
      <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:#ef9f27; display:inline-block;"></span>进行中</span>
      <span style="display:inline-flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:var(--border); display:inline-block;"></span>未到</span>
    </div>`;

  const rows = pageMsgs.map(m => {
    const o = m._row || {};
    const st = _offStageOf(m);
    const orderNo = m.related_ref || o.order_no || '(无单号)';
    const site = m.related_shop || o.site || '';
    const fu = _offGetFu(orderNo);
    const curr = o.payment_currency || 'USD';
    const amt = o.payment_amount || o.received_amount || 0;
    const amtStr = amt ? `${curr} ${Number(amt).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';
    const cust = o.customer_name || '';
    const products = Array.isArray(o.products) ? o.products : [];
    const itemCount = products.reduce((s, p) => s + Number(p.qty || p.quantity || 1), 0);
    const creator = o.created_by_name || '';
    // 缩略图(产品主图优先)
    let imgUrl = '';
    for (const p of products) { const u = p.image || p.image_url || p.img || (Array.isArray(p.images) ? p.images[0] : ''); if (u) { imgUrl = u; break; } }
    if (!imgUrl && Array.isArray(o.attachments)) { for (const a of o.attachments) { const u = _offAttUrl(a); if (u && u !== '__BASE64__') { imgUrl = u; break; } } }
    const imgCell = imgUrl
      ? `<img src="${escapeHtml(_offImg(imgUrl, '120x120'))}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='🧾';" onclick="event.stopPropagation(); openImgLightbox && openImgLightbox('${escapeHtml(_offImg(imgUrl, '800x800'))}')" style="width:46px; height:46px; object-fit:cover; border-radius:6px; cursor:zoom-in;">`
      : '🧾';

    // 进度色块(3段:待下单/生产中/已发货)
    const stageIdx = OFF_FLOW_STAGES.indexOf(st === 'shipped' ? 'shipped' : st);
    const blocks = OFF_FLOW_STAGES.map((sk, i) => {
      let bg, color, check = '';
      if (i < stageIdx) { bg = '#1d9e75'; color = '#fff'; check = '✓ '; }
      else if (i === stageIdx) { bg = '#ef9f27'; color = '#412402'; }
      else { bg = 'var(--bg-elevated)'; color = 'var(--text-tertiary)'; }
      return `<div style="flex:1; text-align:center; padding:4px 2px; background:${bg}; color:${color}; font-size:10.5px; font-weight:600; border-radius:3px;">${check}${OFF_STAGE_MAP[sk].label}</div>`;
    }).join('<div style="width:3px;"></div>');

    // 右侧操作
    let actionCell;
    if (isShippedScope || st === 'shipped') {
      const tk = (_offShippedOf(orderNo) && _offShippedOf(orderNo).tracking) || o.ship_no || '';
      actionCell = `<div style="font-size:11px; color:var(--ok); display:flex; align-items:center; gap:4px; white-space:nowrap; justify-content:flex-end;">✅ 已发货${tk ? ' · ' + escapeHtml(tk) : ''}</div>`;
    } else {
      const next = OFF_NEXT[st];
      if (next === 'shipped') {
        actionCell = `<button class="btn small" style="white-space:nowrap; font-size:12px; background:#0f6e56; color:#fff; border:0;" onclick="event.stopPropagation(); offlineAdvance('${m.id}','${escapeHtml(orderNo)}','shipped')">📦 点发货</button>`;
      } else if (next) {
        actionCell = `<button class="btn small" style="white-space:nowrap; font-size:12px; background:var(--accent); color:#fff; border:0;" onclick="event.stopPropagation(); offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}')">→ ${OFF_STAGE_MAP[next].label}</button>`;
      } else { actionCell = ''; }
    }

    return `
    <div onclick="offlineOpenDetail('${m.id}')" style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; margin-bottom:7px; cursor:pointer;">
      <div style="width:46px; height:46px; border-radius:6px; background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:20px;">${imgCell}</div>
      <div style="width:160px; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:6px;">
          ${site ? `<span style="font-size:9.5px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:1px 5px; border-radius:4px;">${escapeHtml(site)}</span>` : ''}
          <span style="font-weight:700; font-size:14px;">${escapeHtml(orderNo)}</span>
        </div>
        ${cust ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">👤 ${escapeHtml(cust)}</div>` : ''}
      </div>
      <div style="width:120px; flex-shrink:0;">
        ${amtStr ? `<div style="font-weight:600; font-size:12.5px;">${escapeHtml(amtStr)}</div>` : ''}
        <div style="font-size:10.5px; color:var(--text-tertiary);">📦 ${itemCount} 件${creator ? ' · ' + escapeHtml(creator) : ''}</div>
      </div>
      ${isShippedScope ? '<div style="flex:1;"></div>' : `<div style="flex:1; display:flex; align-items:center; min-width:190px;">${blocks}</div>`}
      <div style="flex-shrink:0; min-width:100px; text-align:right;">${actionCell}</div>
    </div>`;
  }).join('');
  return `${legend}${pager}<div style="display:flex; flex-direction:column;">${rows}</div>${pager}`;
}

function offlineOpenDetail(orderId) {
  const m = OFFLINE._msgs.find(x => String(x.id) === String(orderId));
  if (!m) return;
  const o = m._row || {};
  const orderNo = m.related_ref || o.order_no || '(无单号)';
  const site = m.related_shop || o.site || '';
  const fu = _offGetFu(orderNo);
  const stage = _offStageOf(m);
  const stageMeta = stage === 'cancelled' ? { label: '已取消', color: 'var(--danger)', bg: 'rgba(220,38,38,0.1)' } : OFF_STAGE_MAP[stage];
  const next = OFF_NEXT[stage];
  const prev = OFF_PREV[stage];

  // 金额 / 客户
  const curr = o.payment_currency || 'USD';
  const amt = o.payment_amount || o.received_amount || 0;
  const amtStr = amt ? `${curr} ${Number(amt).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '';

  // 商品行表格
  const products = Array.isArray(o.products) ? o.products : [];
  const prodRows = products.map(p => {
    const pimg = p.image || p.image_url || p.img || (Array.isArray(p.images) ? p.images[0] : '') || '';
    return `<tr style="border-bottom:1px solid var(--border-subtle);">
      <td style="padding:6px 8px;">${pimg ? `<img src="${escapeHtml(_offImg(pimg, '120x120'))}" onerror="this.style.display='none'" onclick="openImgLightbox && openImgLightbox('${escapeHtml(_offImg(pimg, '800x800'))}')" style="width:38px;height:38px;object-fit:cover;border-radius:5px; cursor:zoom-in;">` : '<div style="width:38px;height:38px;background:var(--bg-elevated);border-radius:5px;"></div>'}</td>
      <td style="padding:6px 8px; font-family:monospace; font-size:11px;">${escapeHtml(p.sku || '')}</td>
      <td style="padding:6px 8px; font-size:12px;">${escapeHtml(p.name || p.title || '')}${p.variant_title ? `<div style="color:var(--text-tertiary); font-size:10.5px;">${escapeHtml(p.variant_title)}</div>` : ''}</td>
      <td style="padding:6px 8px; text-align:center; font-weight:600;">×${p.qty || p.quantity || 1}</td>
      <td style="padding:6px 8px; text-align:right; font-size:11.5px;">${p.unit_price || p.price ? `${curr} ${p.unit_price || p.price}` : ''}</td>
    </tr>`;
  }).join('');
  const prodTable = products.length ? `
    <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin:14px 0 6px;">📦 商品明细(${products.length} 项)</div>
    <table style="width:100%; border-collapse:collapse; font-size:12px; background:var(--bg-elevated); border-radius:8px; overflow:hidden;">
      <thead><tr style="text-align:left; color:var(--text-tertiary); font-size:11px;"><th style="padding:6px 8px;">图</th><th style="padding:6px 8px;">SKU</th><th style="padding:6px 8px;">品名</th><th style="padding:6px 8px; text-align:center;">数量</th><th style="padding:6px 8px; text-align:right;">单价</th></tr></thead>
      <tbody>${prodRows}</tbody>
    </table>` : '';

  // 收货地址
  const addr = [o.ship_to_name, o.ship_to_phone, o.ship_to_address, o.ship_to_address2, o.ship_to_city, o.ship_to_state, o.ship_to_zip, o.ship_to_country].filter(Boolean).join(' · ');
  const addrBlock = addr ? `<div style="font-size:12px; margin-top:12px;"><span style="color:var(--text-secondary);">📍 收货:</span> ${escapeHtml(addr)}</div>` : '';

  // 客户信息块
  const custBlock = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; font-size:12.5px; margin-top:10px;">
      ${o.customer_name ? `<div><span style="color:var(--text-secondary);">👤 客户:</span> ${escapeHtml(o.customer_name)}</div>` : ''}
      ${o.customer_email ? `<div><span style="color:var(--text-secondary);">✉️ 邮箱:</span> ${escapeHtml(o.customer_email)}</div>` : ''}
      ${o.customer_phone ? `<div><span style="color:var(--text-secondary);">📞 电话:</span> ${escapeHtml(o.customer_phone)}</div>` : ''}
      ${amtStr ? `<div><span style="color:var(--text-secondary);">💰 金额:</span> <b>${escapeHtml(amtStr)}</b>${o.payment_method ? ` (${escapeHtml(o.payment_method)})` : ''}</div>` : ''}
      ${o.created_by_name ? `<div><span style="color:var(--text-secondary);">录入:</span> ${escapeHtml(o.created_by_name)}</div>` : ''}
      ${o.invoice_no ? `<div><span style="color:var(--text-secondary);">发票号:</span> ${escapeHtml(o.invoice_no)}</div>` : ''}
    </div>`;

  // 客服派单文案 / 备注
  const dispatchBlock = o.follow_dispatch_text ? `<div style="font-size:12px; margin-top:12px; padding:8px 10px; background:rgba(239,159,39,0.08); border-radius:6px; line-height:1.6;"><span style="color:#854f0b; font-weight:600;">📋 客服派单说明:</span><br>${escapeHtml(o.follow_dispatch_text)}</div>` : '';

  // 附件凭证
  const vouchers = (Array.isArray(o.attachments) ? o.attachments : []).map(a => {
    const u = _offAttUrl(a);
    if (!u || u === '__BASE64__') return '';
    const meta = [u, a && a.type, a && a.name].filter(Boolean).join(' ').toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)(\?|$)/.test(meta) || /image\//.test(meta);
    if (isImage) return `<img src="${escapeHtml(u)}" loading="lazy" onclick="openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="max-width:100px; max-height:100px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;">`;
    return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:6px; padding:8px 12px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:8px; text-decoration:none; color:var(--text-primary); font-size:12px;">📎 附件 ↗</a>`;
  }).filter(Boolean).join('');

  // 跟单操作区:返回上一步 + 推进下一步 + 备注
  const opsArea = stage === 'cancelled' ? `
    <div style="padding:12px; background:rgba(220,38,38,0.06); border-radius:8px; text-align:center; color:var(--danger); font-size:13px;">此单已取消</div>
  ` : `
    <div style="background:var(--bg-elevated); border-radius:10px; padding:14px; margin-bottom:12px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <span style="font-size:12px; color:var(--text-secondary);">当前工序:</span>
        <span style="background:${stageMeta.bg}; color:${stageMeta.color}; padding:3px 12px; border-radius:10px; font-size:12.5px; font-weight:700;">${stageMeta.label}</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${prev ? `<button class="btn small" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${prev}'); this.closest('[data-off-detail]').remove();" title="退回上一步">← 返回「${OFF_STAGE_MAP[prev].label}」</button>` : ''}
        ${next ? `<button class="btn primary small" style="${next === 'shipped' ? 'background:#0f6e56;' : ''}" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}'); this.closest('[data-off-detail]').remove();" title="推进下一步">${next === 'shipped' ? '📦 点发货(移至已发货)' : '推进到「' + OFF_STAGE_MAP[next].label + '」→'}</button>` : (
          stage === 'pending_payment'
            ? '<span style="font-size:12px; color:#92400e; align-self:center;">⏳ 此单未付款 · 等客服收款后才转「待下单」(跟单暂不操作)</span>'
            : stage === 'shipped'
            ? `<span style="font-size:12.5px; color:var(--ok); align-self:center;">✅ 已发货${(_offShippedOf(orderNo) && _offShippedOf(orderNo).tracking) ? ` · 快递单号 <b>${escapeHtml(_offShippedOf(orderNo).tracking)}</b>` : (o.ship_no ? ` · ${escapeHtml(o.ship_no)}` : '')}</span>`
            : '')}
      </div>
      <div>
        <label style="font-size:11.5px; color:var(--text-secondary); display:block; margin-bottom:5px;">📝 跟单备注(下单时间、当前情况、跟厂进度)</label>
        <textarea id="offRemarkInput" rows="3" autocomplete="off"
          style="width:100%; padding:8px; font-size:12.5px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); resize:vertical; box-sizing:border-box;"
          placeholder="例:6/13 已下单给三洪,约15天交期 / 6/20 催进度,本周出货">${escapeHtml(fu.remark || '')}</textarea>
        <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
          <button class="btn primary small" onclick="offlineSaveRemark('${escapeHtml(orderNo)}')">💾 保存备注</button>
          <span id="offRemarkStatus" style="font-size:11px; color:var(--text-tertiary);"></span>
        </div>
      </div>
    </div>`;

  const html = `
    <div data-off-detail="1" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:flex-start; justify-content:center; padding:30px 16px; overflow:auto;" onclick="if(event.target===this) this.remove();">
      <div style="background:var(--bg-card); border-radius:12px; max-width:640px; width:100%; padding:20px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          ${site ? `<span style="font-size:11px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:1px 7px; border-radius:5px;">${escapeHtml(site)}</span>` : ''}
          <span style="font-size:17px; font-weight:700;">🧾 ${escapeHtml(orderNo)}</span>
          <button class="btn small" style="margin-left:auto;" onclick="this.closest('[data-off-detail]').remove()">✕ 关闭</button>
        </div>
        ${custBlock}
        ${addrBlock}
        ${dispatchBlock}
        ${prodTable}
        ${vouchers ? `<div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin:14px 0 6px;">📎 凭证/附件</div><div style="display:flex; gap:8px; flex-wrap:wrap;">${vouchers}</div>` : ''}
        <div style="margin-top:16px;">${opsArea}</div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn small" style="color:var(--danger);" onclick="offlineCancel('${m.id}','${escapeHtml(orderNo)}'); this.closest('[data-off-detail]').remove();">🗑️ 取消此单</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
window.offlineOpenDetail = offlineOpenDetail;
window.offlineOpenDetail = offlineOpenDetail;

function offlineSetView(v) {
  OFFLINE._view = v;
  try { localStorage.setItem('offline_view', v); } catch (e) {}
  renderOfflineOrders();
}
window.offlineSetView = offlineSetView;

// V20260623:发货同步诊断 — 查 MESSAGEBUS 库实际数据,排查客服已发货为何没同步到跟单
// V20260623:连接检测(直连客服库模式)— 查 offline_orders 数据状态
async function offlineDiagShipped() {
  const cs = _getCsOffline();
  if (!cs) { toast('客服库 client 未就绪', 'err'); return; }
  toast('🔍 正在检测客服库连接...', 'info', 1500);
  try {
    const { data, error } = await cs.from('offline_orders')
      .select('status, po_stage, products').eq('deleted', false).limit(1000);
    if (error) throw error;
    const rows = data || [];
    const byStatus = {}, byPoStage = {};
    rows.forEach(r => {
      byStatus[r.status || '(空)'] = (byStatus[r.status || '(空)'] || 0) + 1;
      byPoStage[r.po_stage || '(未设)'] = (byPoStage[r.po_stage || '(未设)'] || 0) + 1;
    });
    // 取一条有商品的样本,看 products 项有没有图片字段
    let prodSample = '(无)';
    const withProd = rows.find(r => Array.isArray(r.products) && r.products.length);
    if (withProd) {
      const p0 = withProd.products[0];
      prodSample = '字段:' + Object.keys(p0).join(', ');
      const imgKey = ['image', 'image_url', 'img', 'images'].find(k => p0[k]);
      prodSample += imgKey ? ` · ✅有图(${imgKey})` : ' · ⚠️没有图片字段';
    }
    const html = `
      <div style="padding:10px 12px; background:var(--bg-elevated); border-radius:8px; font-size:13px; line-height:1.8;">
        ✅ 已连接客服库 <code>kwrajryhwyytkjkkidor</code> · 表 <code>offline_orders</code><br>
        · 共 <b>${rows.length}</b> 条线下单(deleted=false)<br><br>
        <b>按客服 status:</b><br>${Object.entries(byStatus).map(([k, v]) => `&nbsp;&nbsp;${k}: ${v}`).join('<br>')}<br><br>
        <b>按跟单 po_stage:</b><br>${Object.entries(byPoStage).map(([k, v]) => `&nbsp;&nbsp;${k}: ${v}`).join('<br>')}<br><br>
        <b>商品行(products)样本:</b><br>&nbsp;&nbsp;${escapeHtml(prodSample)}
      </div>
      <div style="font-size:12px; color:var(--text-secondary); margin-top:10px; padding:8px 10px; background:rgba(37,99,235,0.06); border-radius:6px;">
        💡 跟单只写 po_stage(工序)和 notes(备注),不动客服 status。status=shipped 当已发货只读。
      </div>`;
    _offShowModal('🔍 客服库连接检测', html);
  } catch (e) {
    const m = e.message || String(e);
    let hint = '';
    if (/permission denied|row-level security|403/i.test(m)) hint = '<br><br>⚠️ 权限被拒:需客服库放行 anon 读 offline_orders(见对接文档第5节)';
    if (/relation .*offline_orders.* does not exist/i.test(m)) hint = '<br><br>⚠️ 表不存在:确认客服库表名是 offline_orders';
    _offShowModal('🔍 连接检测失败', `<div style="padding:12px; color:var(--danger);">连接客服库失败:${escapeHtml(m)}${hint}</div>`);
  }
}
window.offlineDiagShipped = offlineDiagShipped;


// 通用弹层(诊断用)
function _offShowModal(title, bodyHtml) {
  document.querySelectorAll('[data-off-modal]').forEach(el => el.remove());
  const wrap = document.createElement('div');
  wrap.setAttribute('data-off-modal', '1');
  wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow:auto;';
  wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  wrap.innerHTML = `<div style="background:var(--bg-card); border-radius:12px; max-width:760px; width:100%; padding:20px 22px; box-shadow:0 12px 40px rgba(0,0,0,0.25);">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
      <h3 style="margin:0; font-size:16px;">${title}</h3>
      <button class="btn small" onclick="this.closest('[data-off-modal]').remove()">✕ 关闭</button>
    </div>
    ${bodyHtml}
  </div>`;
  document.body.appendChild(wrap);
}

async function _offWriteFu(orderNo, patch) {
  // V20260623:直写客服库 offline_orders · 只动 po_stage / notes(不碰 status/ship_*/payment_* 等客服字段)
  const cs = _getCsOffline();
  if (!cs) throw new Error('客服库未连接');
  const cur = OFFLINE._followups[orderNo] || { order_no: orderNo };
  const merged = { ...cur, ...patch, order_no: orderNo, updated_at: new Date().toISOString() };

  // 映射到 offline_orders 的列:跟单工序 → po_stage;备注 → notes
  const dbPatch = {};
  if (patch.stage !== undefined) dbPatch.po_stage = patch.stage;
  if (patch.remark !== undefined) dbPatch.notes = patch.remark;
  if (patch.cancelled === true) dbPatch.po_stage = 'cancelled';   // 跟单侧取消只标自己的工序,不动客服 status
  if (Object.keys(dbPatch).length === 0) { OFFLINE._followups[orderNo] = merged; return; }

  const { error } = await cs.from('offline_orders').update(dbPatch).eq('order_no', orderNo);
  if (error) {
    const m = error.message || '';
    if (/column .*po_stage.* does not exist/i.test(m)) {
      throw new Error('客服库缺 po_stage 列 · 请在客服库 kwraj 跑:ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS po_stage text;');
    }
    if (/permission denied|row-level security|403/i.test(m)) {
      throw new Error('权限被拒 · 需客服库放行 anon 更新 offline_orders(见对接文档第5节 RLS 策略)');
    }
    throw new Error('保存失败:' + m);
  }
  OFFLINE._followups[orderNo] = merged;
}

async function offlineClaim(msgId, orderNo) {
  if (!orderNo || orderNo === '(无单号)') { alert('该单没有订单号'); return; }
  try {
    const nowIso = new Date().toISOString();
    await _offWriteFu(orderNo, {
      stage: 'claimed',
      claimed_by_id: (typeof CURRENT_USER_ID !== 'undefined') ? CURRENT_USER_ID : null,
      claimed_by_name: (typeof CURRENT_AGENT !== 'undefined') ? CURRENT_AGENT : '',
      stage_at: nowIso, claimed_at: nowIso,
    });
    if (typeof toast === 'function') toast(`✋ 已接单 ${orderNo}`, 'ok', 2000);
    renderOfflineOrders();
  } catch (e) { _offErr(e); }
}
window.offlineClaim = offlineClaim;

async function offlineAdvance(msgId, orderNo, toStage) {
  if (!orderNo) { alert('该单没有订单号 · 无法推进'); return; }
  const label = OFF_STAGE_MAP[toStage] ? OFF_STAGE_MAP[toStage].label : toStage;
  // V20260624:3段流程 · 跟单可推进到 ordered/producing/shipped(点发货=标记发货+自动隐藏)
  if (toStage !== 'ordered' && toStage !== 'producing' && toStage !== 'shipped') {
    if (typeof toast === 'function') toast('无效的工序', 'info', 2000);
    return;
  }
  try {
    const nowIso = new Date().toISOString();
    await _offWriteFu(orderNo, { stage: toStage, stage_at: nowIso });
    if (toStage === 'shipped') {
      if (typeof toast === 'function') toast(`📦 ${orderNo} 已标记发货 · 移至「已发货」`, 'ok', 2500);
    } else {
      if (typeof toast === 'function') toast(`→ ${orderNo} 已推进到「${label}」`, 'ok', 2200);
    }
    renderOfflineOrders();
    if (typeof updateBadges === 'function') updateBadges();
  } catch (e) { _offErr(e); }
}
window.offlineAdvance = offlineAdvance;

// V20260617:保存跟单备注(记录下单时间、当前情况、跟厂进度)
async function offlineSaveRemark(orderNo) {
  if (!orderNo) return;
  const ta = document.getElementById('offRemarkInput');
  const status = document.getElementById('offRemarkStatus');
  if (!ta) return;
  if (status) status.textContent = '⏳ 保存中...';
  try {
    await _offWriteFu(orderNo, { remark: ta.value });
    if (status) { status.style.color = 'var(--ok)'; status.textContent = '✓ 已保存'; }
    if (typeof toast === 'function') toast('💾 跟单备注已保存', 'success', 1800);
  } catch (e) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '保存失败:' + (e.message || e); }
  }
}
window.offlineSaveRemark = offlineSaveRemark;

async function offlineCancel(msgId, orderNo) {
  if (!orderNo) return;
  if (!confirm(`确认取消线下单 ${orderNo}?`)) return;
  try {
    await _offWriteFu(orderNo, { cancelled: true, stage_at: new Date().toISOString() });
    if (typeof toast === 'function') toast(`🗑️ 已取消 ${orderNo}`, 'ok', 2000);
    renderOfflineOrders();
    if (typeof updateBadges === 'function') updateBadges();
  } catch (e) { _offErr(e); }
}
window.offlineCancel = offlineCancel;

function _offErr(e) {
  const msg = '操作失败:' + (e.message || e);
  if (typeof toast === 'function') toast(msg, 'err', 4000); else alert(msg);
}

function offlineTodoCount() {
  return (OFFLINE._msgs || []).filter(m => {
    const st = _offStageOf(m);
    return st !== 'shipped' && st !== 'received' && st !== 'cancelled';
  }).length;
}
window.offlineTodoCount = offlineTodoCount;

async function offlineCheckOrgDirectory() {
  if (typeof cdmClient === 'undefined') return;
  try {
    const { data, error } = await cdmClient.from('org_directory').select('id, display_name, name, system, active').eq('system', 'po');
    if (error) throw error;
    const active = (data || []).filter(r => r.active !== false);
    console.log(`[offline] org_directory 跟单部(system='po')共 ${active.length} 人:`, active.map(r => r.display_name || r.name).join(' / '));
    if (active.length === 0) console.warn('[offline] ⚠ org_directory 无跟单人员 → 客服转单下拉选不到 · 请在跟单工作台触发人员发布');
    return active;
  } catch (e) { console.warn('[offline] org_directory 自检失败:', e.message); }
}
window.offlineCheckOrgDirectory = offlineCheckOrgDirectory;
