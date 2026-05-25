// ============================================================================
// V5-W3-2026-05-26: 跨部门协作模块 (Cross-Department Collaboration)
// ----------------------------------------------------------------------------
// 三个部门(跟单 po / 美工 design / 客服 cs)用共享 Supabase 表 cross_dept_messages 通信
// 该表在美工的 Supabase 项目里(作为消息总线),3 个部门工作台都连这一个 client 读写
// 跟单系统本地 Supabase 不动,这个 cdmClient 是独立的第二个 client
// ============================================================================

// ─────────────── Supabase 客户端配置(消息总线 / 美工项目)───────────────
const MESSAGEBUS_URL = "https://xyhbwqugbnowfjuhqhsj.supabase.co";
const MESSAGEBUS_KEY = "sb_publishable_Z0dXXZivG5QI-FCbwELxEA_JZBNx2Hn";
const cdmClient = window.supabase.createClient(MESSAGEBUS_URL, MESSAGEBUS_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

const CDM_MY_SYSTEM = 'po';  // 跟单系统标识

// ─────────────── 常量定义(分类/优先级/状态/系统/关联类型)───────────────
const CDM_CATEGORIES = {
  general:     { label: '💬 一般沟通',  color: '#6b7280', bg: 'rgba(107,114,128,0.10)' },
  website_fix: { label: '🔧 网站修正',  color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  price_error: { label: '💰 价格错误',  color: '#ea580c', bg: 'rgba(234,88,12,0.10)' },
  new_product: { label: '✨ 新品上架',  color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  aftersales:  { label: '🛠 售后协调',  color: '#0891b2', bg: 'rgba(8,145,178,0.10)' },
};

const CDM_PRIORITIES = {
  urgent: { label: '🔥 紧急',  color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
  high:   { label: '⚠ 重要',   color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  normal: { label: '一般',     color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
  low:    { label: '低',       color: '#9ca3af', bg: 'rgba(156,163,175,0.06)' },
};

const CDM_STATUSES = {
  pending:     { label: '⏳ 待处理',  color: '#b45309', bg: 'rgba(180,83,9,0.12)' },
  in_progress: { label: '🔄 处理中',  color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  done:        { label: '✅ 已完成',  color: '#15803d', bg: 'rgba(21,128,61,0.12)' },
  cancelled:   { label: '✕ 已取消',   color: '#6b7280', bg: 'rgba(107,114,128,0.10)' },
};

const CDM_SYSTEMS = {
  po:     { label: '📋 跟单部', color: '#2563eb', short: '跟单' },
  design: { label: '🎨 美工部', color: '#7c3aed', short: '美工' },
  cs:     { label: '💬 客服部', color: '#0891b2', short: '客服' },
};

const CDM_REL_TYPES = {
  order:     '📦 订单',
  product:   '🏷 产品',
  review:    '⭐ 评论',
  sales_log: '📊 销售记录',
  customer:  '👤 客户',
};

// ─────────────── 模块状态 ───────────────
let CDM_MESSAGES = [];          // 所有消息(收件+我发的)
let CDM_CURRENT_TAB = 'inbox';  // inbox / outbox / all
let CDM_FILTERS = {
  search: '',
  status: '',
  priority: '',
  category: '',
  system: '',         // 对方系统(收件用 from_system,发件用 to_system)
  timeRange: 'all',   // all / today / 3d / 7d / 30d
};
let CDM_PAGE = 1;
const CDM_PAGE_SIZE = 20;
let CDM_REALTIME_CHANNEL = null;
let CDM_INITIALIZED = false;
let CDM_NOTIFICATION_PERMISSION = false;

// ─────────────── 当前用户工具 ───────────────
function _cdmGetCurrentUser() {
  // 跟单系统:用 CURRENT_AGENT(姓名字符串)+ AGENTS 找到对应 code(如 'lbj')
  const me = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '';
  // 优先用 code(英文短代号 lbj), 不行用姓名
  let userId = me;
  let userName = me;
  if (typeof CONFIG !== 'undefined' && CONFIG && Array.isArray(CONFIG.agents)) {
    const a = CONFIG.agents.find(x => x.name === me || x._userId === (typeof CURRENT_USER_ID !== 'undefined' ? CURRENT_USER_ID : null));
    if (a) {
      // alias 通常是 code 形式("lbj"), name 是中文("刘邦杰")
      userId = a.alias || a.code || a.name || me;
      userName = a.alias ? `${a.name} (${a.alias})` : a.name;
    }
  }
  return { id: userId || 'unknown', name: userName || userId || '未知' };
}

// ─────────────── 加载消息(进入 tab 时全量拉)───────────────
async function cdmLoadMessages() {
  const me = _cdmGetCurrentUser();
  try {
    // 收件:to_system='po' (整个部门) || (to_user_id=me.id)
    // 发件:from_system='po' && from_user_id=me.id
    // 用 OR 一次查完
    const { data, error } = await cdmClient
      .from('cross_dept_messages')
      .select('*')
      .or(`to_system.eq.po,and(from_system.eq.po,from_user_id.eq.${me.id})`)
      .order('created_at_ms', { ascending: false })
      .limit(500);
    if (error) throw error;
    CDM_MESSAGES = data || [];
    cdmRender();
    cdmUpdateHeaderBadge();
  } catch (e) {
    console.error('[CDM] 加载失败:', e);
    if (typeof toast === 'function') toast('跨部门消息加载失败:' + (e.message || e), 'err');
  }
}

// ─────────────── 模块初始化(切到 tab 时调用)───────────────
async function cdmInit() {
  if (!CDM_INITIALIZED) {
    cdmRequestNotificationPermission();
    cdmSubscribeRealtime();
    CDM_INITIALIZED = true;
  }
  await cdmLoadMessages();
}

// 切到 cross_dept tab 时由 core.js renderActiveTab() 调用
function cdmOnTabActivate() {
  cdmInit();
}

// ─────────────── Realtime 订阅(全局长链接,登录后开启)───────────────
function cdmSubscribeRealtime() {
  if (CDM_REALTIME_CHANNEL) return;
  const me = _cdmGetCurrentUser();
  CDM_REALTIME_CHANNEL = cdmClient
    .channel('cdm-realtime-po-' + me.id)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'cross_dept_messages' },
      (payload) => cdmHandleRealtimeChange(payload))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('[CDM] ✓ Realtime 已订阅');
    });
}

function cdmHandleRealtimeChange(payload) {
  const me = _cdmGetCurrentUser();
  const row = payload.new || payload.old;
  if (!row) return;

  // 只关心:发给 po 部门 OR 我自己发出
  const isRelevant = (row.to_system === 'po') ||
                     (row.from_system === 'po' && row.from_user_id === me.id);
  if (!isRelevant) return;

  if (payload.eventType === 'INSERT') {
    if (!CDM_MESSAGES.find(m => m.id === payload.new.id)) {
      CDM_MESSAGES.unshift(payload.new);
    }
    cdmRender();
    cdmUpdateHeaderBadge();
    // 发给我的新消息 → 浏览器通知
    if (payload.new.to_system === 'po' && payload.new.from_user_id !== me.id) {
      cdmShowNotification(payload.new);
    }
  } else if (payload.eventType === 'UPDATE') {
    const idx = CDM_MESSAGES.findIndex(m => m.id === payload.new.id);
    if (idx >= 0) {
      CDM_MESSAGES[idx] = payload.new;
    } else {
      CDM_MESSAGES.unshift(payload.new);
    }
    cdmRender();
    cdmUpdateHeaderBadge();
  } else if (payload.eventType === 'DELETE') {
    CDM_MESSAGES = CDM_MESSAGES.filter(m => m.id !== payload.old.id);
    cdmRender();
    cdmUpdateHeaderBadge();
  }
}

// ─────────────── 浏览器通知 ───────────────
async function cdmRequestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    CDM_NOTIFICATION_PERMISSION = true;
  } else if (Notification.permission !== 'denied') {
    try {
      const perm = await Notification.requestPermission();
      CDM_NOTIFICATION_PERMISSION = (perm === 'granted');
    } catch (e) { /* ignore */ }
  }
}

function cdmShowNotification(msg) {
  if (!CDM_NOTIFICATION_PERMISSION) return;
  try {
    const from = CDM_SYSTEMS[msg.from_system]?.short || msg.from_system;
    const pri = CDM_PRIORITIES[msg.priority]?.label || '';
    const n = new Notification(`📨 ${from} · ${msg.from_user_name || ''}`, {
      body: `${pri ? pri + ' · ' : ''}${msg.title || ''}`,
      tag: msg.id,
      requireInteraction: msg.priority === 'urgent',
    });
    n.onclick = () => {
      try { window.focus(); } catch(_) {}
      if (typeof switchTab === 'function') switchTab('cross_dept');
      setTimeout(() => cdmOpenDetail(msg.id), 250);
      n.close();
    };
  } catch (e) { /* ignore */ }
}

// ─────────────── 列表筛选(收件箱/发件箱/全部 + 5 个筛选器)───────────────
function cdmGetFiltered() {
  const me = _cdmGetCurrentUser();
  let list = CDM_MESSAGES.filter(m => {
    if (CDM_CURRENT_TAB === 'inbox') return m.to_system === 'po';
    if (CDM_CURRENT_TAB === 'outbox') return m.from_system === 'po' && m.from_user_id === me.id;
    return m.to_system === 'po' || (m.from_system === 'po' && m.from_user_id === me.id);
  });

  if (CDM_FILTERS.search) {
    const q = CDM_FILTERS.search.toLowerCase();
    list = list.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.body || '').toLowerCase().includes(q) ||
      (m.related_ref || '').toLowerCase().includes(q) ||
      (m.from_user_name || '').toLowerCase().includes(q) ||
      (m.to_user_name || '').toLowerCase().includes(q)
    );
  }
  if (CDM_FILTERS.status)   list = list.filter(m => m.status === CDM_FILTERS.status);
  if (CDM_FILTERS.priority) list = list.filter(m => m.priority === CDM_FILTERS.priority);
  if (CDM_FILTERS.category) list = list.filter(m => m.category === CDM_FILTERS.category);

  if (CDM_FILTERS.system) {
    list = list.filter(m => {
      if (CDM_CURRENT_TAB === 'inbox')  return m.from_system === CDM_FILTERS.system;
      if (CDM_CURRENT_TAB === 'outbox') return m.to_system === CDM_FILTERS.system;
      return m.from_system === CDM_FILTERS.system || m.to_system === CDM_FILTERS.system;
    });
  }

  if (CDM_FILTERS.timeRange !== 'all') {
    const days = { today: 1, '3d': 3, '7d': 7, '30d': 30 }[CDM_FILTERS.timeRange] || 0;
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    list = list.filter(m => (m.created_at_ms || 0) >= cutoff);
  }

  return list;
}

// ─────────────── 渲染主入口 ───────────────
function cdmRender() {
  const container = document.getElementById('cdmListContainer');
  if (!container) return;

  const filtered = cdmGetFiltered();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / CDM_PAGE_SIZE));
  if (CDM_PAGE > totalPages) CDM_PAGE = totalPages;
  const start = (CDM_PAGE - 1) * CDM_PAGE_SIZE;
  const pageList = filtered.slice(start, start + CDM_PAGE_SIZE);

  cdmRenderStats();

  // sub-tab 计数
  const me = _cdmGetCurrentUser();
  const inboxAll = CDM_MESSAGES.filter(m => m.to_system === 'po');
  const outboxAll = CDM_MESSAGES.filter(m => m.from_system === 'po' && m.from_user_id === me.id);
  const readBy = (m) => Array.isArray(m.read_by) ? m.read_by : [];
  const inboxUnread = inboxAll.filter(m => !readBy(m).includes(me.id)).length;
  const tIn = document.getElementById('cdmTabInbox');
  const tOut = document.getElementById('cdmTabOutbox');
  const tAll = document.getElementById('cdmTabAll');
  if (tIn)  tIn.innerHTML  = `📥 收件箱 <span class="cdm-count">${inboxAll.length}</span>${inboxUnread > 0 ? ` <span class="cdm-unread-dot">${inboxUnread}</span>` : ''}`;
  if (tOut) tOut.innerHTML = `📤 发件箱 <span class="cdm-count">${outboxAll.length}</span>`;
  if (tAll) tAll.innerHTML = `📋 全部 <span class="cdm-count">${CDM_MESSAGES.length}</span>`;

  if (pageList.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px 20px; color:var(--text-tertiary); font-size:14px;">
        <div style="font-size:48px; margin-bottom:12px;">📭</div>
        <div>没有符合条件的消息</div>
        ${CDM_CURRENT_TAB === 'outbox' ? '<div style="margin-top:8px; font-size:12px;">点右上「✏ 新建消息」给美工或客服发消息</div>' : ''}
      </div>
    `;
    cdmRenderPagination(0, 1, 1);
    return;
  }

  container.innerHTML = pageList.map(m => cdmRenderCard(m)).join('');
  cdmRenderPagination(total, CDM_PAGE, totalPages);
}

function cdmRenderCard(m) {
  const me = _cdmGetCurrentUser();
  const cat = CDM_CATEGORIES[m.category] || CDM_CATEGORIES.general;
  const pri = CDM_PRIORITIES[m.priority] || CDM_PRIORITIES.normal;
  const status = CDM_STATUSES[m.status] || CDM_STATUSES.pending;
  const fromSys = CDM_SYSTEMS[m.from_system] || { label: m.from_system, color: '#666' };
  const toSys = CDM_SYSTEMS[m.to_system] || { label: m.to_system, color: '#666' };
  const readBy = Array.isArray(m.read_by) ? m.read_by : [];
  const iAmRecipient = (m.to_system === 'po');
  const isUnread = iAmRecipient && !readBy.includes(me.id);

  // 时间(相对显示)
  const dt = new Date(m.created_at_ms || 0);
  const diffMin = Math.max(0, Math.floor((Date.now() - (m.created_at_ms || 0)) / 60000));
  let timeStr;
  if (diffMin < 1)        timeStr = '刚刚';
  else if (diffMin < 60)  timeStr = `${diffMin} 分钟前`;
  else if (diffMin < 1440) timeStr = `${Math.floor(diffMin/60)} 小时前`;
  else if (diffMin < 10080) timeStr = `${Math.floor(diffMin/1440)} 天前`;
  else timeStr = dt.toLocaleDateString();

  const threadCount = Array.isArray(m.thread) ? m.thread.length : 0;

  // 对方系统(根据当前 tab 决定显示 from 还是 to)
  const isMine = (m.from_system === 'po' && m.from_user_id === me.id);
  const otherSys = isMine ? toSys : fromSys;
  const otherSysLabel = otherSys.label || '';
  const direction = isMine ? '发给' : '来自';

  const relHtml = m.related_ref ? `
    <span style="display:inline-flex; align-items:center; gap:3px; padding:2px 7px; background:rgba(37,99,235,0.08); color:#2563eb; border-radius:3px; font-size:11px; font-family:'JetBrains Mono', monospace;">
      ${CDM_REL_TYPES[m.related_type] || '🔗'} ${escapeHtml(m.related_ref)}
    </span>` : '';

  return `
    <div class="cdm-card${isUnread ? ' cdm-unread' : ''}" onclick="cdmOpenDetail('${m.id}')"
         style="border-left:3px solid ${pri.color};">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
            ${isUnread ? '<span class="cdm-unread-pulse"></span>' : ''}
            <span style="font-weight:${isUnread ? '600' : '500'}; font-size:14px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escapeHtml(m.title || '(无标题)')}
            </span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:5px; align-items:center;">
            ${(m.priority && m.priority !== 'normal') ? `<span class="cdm-chip" style="background:${pri.bg}; color:${pri.color}; font-weight:600;">${pri.label}</span>` : ''}
            <span class="cdm-chip" style="background:${cat.bg}; color:${cat.color};">${cat.label}</span>
            <span class="cdm-chip" style="background:${status.bg}; color:${status.color}; font-weight:500;">${status.label}</span>
            <span class="cdm-chip" style="background:rgba(0,0,0,0.04); color:${otherSys.color};">${direction} ${otherSysLabel}</span>
            ${relHtml}
            ${threadCount > 0 ? `<span class="cdm-chip" style="background:rgba(0,0,0,0.05); color:#666;">💬 ${threadCount}</span>` : ''}
          </div>
          ${m.body ? `<div style="font-size:12.5px; color:var(--text-secondary); line-height:1.5; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(m.body)}</div>` : ''}
        </div>
        <div style="text-align:right; flex-shrink:0; font-size:11px; color:var(--text-tertiary); min-width:90px;">
          <div style="font-weight:500; color:var(--text-secondary); margin-bottom:2px;">${escapeHtml(m.from_user_name || m.from_user_id || '')}</div>
          <div style="font-family:'JetBrains Mono', monospace;">${timeStr}</div>
        </div>
      </div>
    </div>
  `;
}

function cdmRenderStats() {
  const c = document.getElementById('cdmStatsContainer');
  if (!c) return;
  const me = _cdmGetCurrentUser();
  const inbox = CDM_MESSAGES.filter(m => m.to_system === 'po');
  const readBy = (m) => Array.isArray(m.read_by) ? m.read_by : [];
  const unread = inbox.filter(m => !readBy(m).includes(me.id));
  const inProgress = CDM_MESSAGES.filter(m =>
    (m.to_system === 'po' || (m.from_system === 'po' && m.from_user_id === me.id))
    && m.status === 'in_progress'
  );
  const urgentUnread = unread.filter(m => m.priority === 'urgent');
  const outboxAll = CDM_MESSAGES.filter(m => m.from_system === 'po' && m.from_user_id === me.id);

  c.innerHTML = `
    <div class="cdm-stat" onclick="cdmSwitchTab('inbox'); CDM_FILTERS.search=''; cdmRender();" style="cursor:pointer;">
      <div class="cdm-stat-label">📥 待我处理</div>
      <div class="cdm-stat-value">${unread.length}</div>
      <div class="cdm-stat-sub">收件箱未读</div>
    </div>
    <div class="cdm-stat" onclick="cdmSwitchTab('all'); CDM_FILTERS.status='in_progress'; document.getElementById('cdmFilterStatus').value='in_progress'; cdmRender();" style="cursor:pointer;">
      <div class="cdm-stat-label">🔄 进行中</div>
      <div class="cdm-stat-value" style="color:#2563eb;">${inProgress.length}</div>
      <div class="cdm-stat-sub">收+发 · 处理中</div>
    </div>
    <div class="cdm-stat" onclick="cdmSwitchTab('outbox');" style="cursor:pointer;">
      <div class="cdm-stat-label">📤 我发出</div>
      <div class="cdm-stat-value">${outboxAll.length}</div>
      <div class="cdm-stat-sub">总发件</div>
    </div>
    <div class="cdm-stat" onclick="cdmSwitchTab('inbox'); CDM_FILTERS.priority='urgent'; document.getElementById('cdmFilterPriority').value='urgent'; cdmRender();" style="cursor:pointer;">
      <div class="cdm-stat-label">🔥 紧急未读</div>
      <div class="cdm-stat-value" style="color:#dc2626;">${urgentUnread.length}</div>
      <div class="cdm-stat-sub">最高优先级</div>
    </div>
  `;
}

function cdmRenderPagination(total, page, totalPages) {
  const html = `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 4px; font-size:12px; color:var(--text-secondary);">
      <span>共 <b style="color:var(--text-primary);">${total}</b> 条 · 第 <b>${page}</b> / ${totalPages} 页</span>
      <div style="display:flex; gap:4px;">
        <button class="btn small" onclick="cdmGoPage(${page-1})" ${page<=1?'disabled style="opacity:0.4; cursor:not-allowed;"':''}>‹ 上一页</button>
        <button class="btn small" onclick="cdmGoPage(${page+1})" ${page>=totalPages?'disabled style="opacity:0.4; cursor:not-allowed;"':''}>下一页 ›</button>
      </div>
    </div>
  `;
  const top = document.getElementById('cdmPaginationTop');
  const bottom = document.getElementById('cdmPaginationBottom');
  if (top) top.innerHTML = html;
  if (bottom) bottom.innerHTML = html;
}

function cdmGoPage(n) {
  const filtered = cdmGetFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / CDM_PAGE_SIZE));
  CDM_PAGE = Math.max(1, Math.min(n, totalPages));
  cdmRender();
  document.getElementById('cdmListContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─────────────── sub-tab / 筛选器 ───────────────
function cdmSwitchTab(tab) {
  CDM_CURRENT_TAB = tab;
  CDM_PAGE = 1;
  document.querySelectorAll('.cdm-subtab').forEach(b => b.classList.remove('active'));
  const id = 'cdmTab' + tab.charAt(0).toUpperCase() + tab.slice(1);
  document.getElementById(id)?.classList.add('active');
  cdmRender();
}

function cdmSetFilter(key, val) {
  CDM_FILTERS[key] = val;
  CDM_PAGE = 1;
  cdmRender();
}

function cdmResetFilters() {
  CDM_FILTERS = { search: '', status: '', priority: '', category: '', system: '', timeRange: 'all' };
  CDM_PAGE = 1;
  const ids = ['cdmSearchInput','cdmFilterStatus','cdmFilterPriority','cdmFilterCategory','cdmFilterSystem'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('.cdm-time-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.cdm-time-chip[data-range="all"]')?.classList.add('active');
  cdmRender();
}

let _cdmSearchTimer = null;
function cdmOnSearchInput(val) {
  clearTimeout(_cdmSearchTimer);
  _cdmSearchTimer = setTimeout(() => {
    CDM_FILTERS.search = val;
    CDM_PAGE = 1;
    cdmRender();
  }, 250);
}

function cdmSetTimeRange(range, el) {
  CDM_FILTERS.timeRange = range;
  CDM_PAGE = 1;
  document.querySelectorAll('.cdm-time-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  cdmRender();
}

// ─────────────── 新建消息弹窗 ───────────────
function cdmOpenNewModal(preset = {}) {
  const modal = document.getElementById('cdmNewModal');
  if (!modal) return;
  document.getElementById('cdmNewToSystem').value = preset.to_system || '';
  document.getElementById('cdmNewCategory').value = preset.category || 'general';
  document.getElementById('cdmNewPriority').value = preset.priority || 'normal';
  document.getElementById('cdmNewTitle').value    = preset.title || '';
  document.getElementById('cdmNewBody').value     = preset.body || '';
  document.getElementById('cdmNewRelType').value  = preset.related_type || '';
  document.getElementById('cdmNewRelRef').value   = preset.related_ref || '';
  modal.classList.add('show');
}

function cdmCloseNewModal() {
  document.getElementById('cdmNewModal')?.classList.remove('show');
}

async function cdmSubmitNew() {
  const me = _cdmGetCurrentUser();
  const toSys = document.getElementById('cdmNewToSystem').value;
  const cat   = document.getElementById('cdmNewCategory').value;
  const pri   = document.getElementById('cdmNewPriority').value;
  const title = document.getElementById('cdmNewTitle').value.trim();
  const body  = document.getElementById('cdmNewBody').value.trim();
  const relT  = document.getElementById('cdmNewRelType').value;
  const relR  = document.getElementById('cdmNewRelRef').value.trim();

  if (!toSys) { if (typeof toast==='function') toast('请选择接收部门', 'err'); return; }
  if (toSys === 'po') { if (typeof toast==='function') toast('不能发给自己部门', 'err'); return; }
  if (!title) { if (typeof toast==='function') toast('请填标题', 'err'); return; }

  const row = {
    from_system: 'po',
    from_user_id: me.id,
    from_user_name: me.name,
    to_system: toSys,
    to_user_id: null,
    to_user_name: null,
    category: cat || 'general',
    priority: pri || 'normal',
    title,
    body: body || null,
    related_ref: relR || null,
    related_type: relT || null,
    status: 'pending',
    thread: [],
    read_by: [me.id],   // 自己发的自动算"已读"
    created_at_ms: Date.now(),
  };

  try {
    const { error } = await cdmClient.from('cross_dept_messages').insert(row);
    if (error) throw error;
    cdmCloseNewModal();
    if (typeof toast === 'function') toast('✓ 已发送给' + (CDM_SYSTEMS[toSys]?.short || toSys) + '部');
    await cdmLoadMessages();
  } catch (e) {
    console.error('[CDM] 发送失败:', e);
    if (typeof toast === 'function') toast('发送失败:' + (e.message || e), 'err');
  }
}

// ─────────────── 详情弹窗 ───────────────
async function cdmOpenDetail(id) {
  let m = CDM_MESSAGES.find(x => x.id === id);
  if (!m) {
    try {
      const { data } = await cdmClient.from('cross_dept_messages').select('*').eq('id', id).single();
      if (data) {
        const idx = CDM_MESSAGES.findIndex(x => x.id === id);
        if (idx >= 0) CDM_MESSAGES[idx] = data;
        else CDM_MESSAGES.unshift(data);
        m = data;
      }
    } catch (e) {}
  }
  if (!m) { if (typeof toast==='function') toast('消息不存在', 'err'); return; }

  cdmRenderDetail(m);
  document.getElementById('cdmDetailModal')?.classList.add('show');

  // 标记已读
  const me = _cdmGetCurrentUser();
  const readBy = Array.isArray(m.read_by) ? m.read_by : [];
  if (m.to_system === 'po' && !readBy.includes(me.id)) {
    const newReadBy = [...readBy, me.id];
    try {
      const { error } = await cdmClient.from('cross_dept_messages').update({ read_by: newReadBy }).eq('id', m.id);
      if (!error) {
        m.read_by = newReadBy;
        cdmRender();
        cdmUpdateHeaderBadge();
      }
    } catch (e) { console.warn('[CDM] 标已读失败:', e); }
  }
}

function cdmCloseDetail() {
  document.getElementById('cdmDetailModal')?.classList.remove('show');
}

function cdmRenderDetail(m) {
  const wrap = document.getElementById('cdmDetailBody');
  if (!wrap) return;
  const me = _cdmGetCurrentUser();
  const cat = CDM_CATEGORIES[m.category] || CDM_CATEGORIES.general;
  const pri = CDM_PRIORITIES[m.priority] || CDM_PRIORITIES.normal;
  const status = CDM_STATUSES[m.status] || CDM_STATUSES.pending;
  const fromSys = CDM_SYSTEMS[m.from_system] || { label: m.from_system };
  const toSys = CDM_SYSTEMS[m.to_system] || { label: m.to_system };
  const dt = new Date(m.created_at_ms || 0);
  const thread = Array.isArray(m.thread) ? m.thread : [];
  const isInbox = (m.to_system === 'po');
  const isMine = (m.from_system === 'po' && m.from_user_id === me.id);
  const canChangeStatus = isInbox || isMine;

  wrap.innerHTML = `
    <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:14px; margin-bottom:14px;">
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
        <span class="cdm-chip" style="background:${pri.bg}; color:${pri.color}; font-weight:600; padding:2px 8px; font-size:12px;">${pri.label}</span>
        <span class="cdm-chip" style="background:${cat.bg}; color:${cat.color}; padding:2px 8px; font-size:12px;">${cat.label}</span>
        <span class="cdm-chip" style="background:${status.bg}; color:${status.color}; padding:2px 8px; font-size:12px;">${status.label}</span>
        ${m.related_ref ? `<span class="cdm-chip" style="background:rgba(37,99,235,0.08); color:#2563eb; padding:2px 8px; font-size:12px; font-family:'JetBrains Mono',monospace;">${CDM_REL_TYPES[m.related_type] || '🔗'} ${escapeHtml(m.related_ref)}</span>` : ''}
      </div>
      <h2 style="font-size:18px; font-weight:600; margin:0 0 10px; color:var(--text-primary);">${escapeHtml(m.title || '')}</h2>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-secondary); flex-wrap:wrap; gap:8px;">
        <span><b>${escapeHtml(m.from_user_name || m.from_user_id || '')}</b> · <span style="color:${fromSys.color};">${fromSys.label}</span> → <span style="color:${toSys.color};">${toSys.label}</span></span>
        <span style="font-family:'JetBrains Mono',monospace;">${dt.toLocaleString()}</span>
      </div>
    </div>

    ${m.body ? `
      <div style="background:var(--bg-elevated); padding:12px 14px; border-radius:6px; margin-bottom:14px; font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.body)}</div>` : ''}

    ${canChangeStatus ? `
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px; padding:10px 12px; background:var(--bg-elevated); border-radius:6px;">
        <span style="font-size:12px; font-weight:500; color:var(--text-secondary); margin-right:4px;">改状态:</span>
        ${Object.entries(CDM_STATUSES).map(([k, v]) => `
          <button class="btn small" onclick="cdmChangeStatus('${m.id}', '${k}')" style="${m.status===k?`background:${v.bg}; color:${v.color}; font-weight:600; border:1px solid ${v.color};`:''}">${v.label}</button>
        `).join('')}
      </div>` : ''}

    <div style="margin-bottom:14px;">
      <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">💬 沟通线程 (${thread.length})</div>
      ${thread.length === 0 ? '<div style="color:var(--text-tertiary); font-size:12px; padding:10px 12px; background:var(--bg-elevated); border-radius:6px;">还没有回复 · 在下方输入第一条</div>' : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${thread.map(t => {
            const tSys = CDM_SYSTEMS[t.system] || { label: t.system, color: '#666' };
            const tDt = new Date(t.ts || 0);
            const isMyReply = (t.system === 'po' && t.user_id === me.id);
            return `
              <div style="background:${isMyReply ? 'rgba(37,99,235,0.05)' : 'var(--bg-card)'}; border:1px solid var(--border-subtle); border-left:3px solid ${tSys.color}; border-radius:6px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; flex-wrap:wrap; gap:6px;">
                  <span style="font-size:12px; font-weight:600;"><span style="color:${tSys.color};">${tSys.label}</span> · ${escapeHtml(t.user_name || t.user_id || '')}</span>
                  <span style="font-size:11px; color:var(--text-tertiary); font-family:'JetBrains Mono',monospace;">${tDt.toLocaleString()}</span>
                </div>
                <div style="font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; color:var(--text-primary);">${escapeHtml(t.content || '')}</div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
      <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">✍ 回复</div>
      <textarea id="cdmReplyText" placeholder="输入回复内容,支持换行..." rows="3"
        style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); resize:vertical; font-family:inherit;"></textarea>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
        <button class="btn primary" onclick="cdmSubmitReply('${m.id}')">📤 发送回复</button>
      </div>
    </div>
  `;
}

async function cdmSubmitReply(id) {
  const me = _cdmGetCurrentUser();
  const ta = document.getElementById('cdmReplyText');
  const text = (ta?.value || '').trim();
  if (!text) { if (typeof toast==='function') toast('请输入回复内容', 'err'); return; }

  const m = CDM_MESSAGES.find(x => x.id === id);
  if (!m) { if (typeof toast==='function') toast('消息已不存在', 'err'); return; }

  const thread = Array.isArray(m.thread) ? [...m.thread] : [];
  thread.push({
    user_id: me.id,
    user_name: me.name,
    system: 'po',
    content: text,
    ts: Date.now(),
  });

  try {
    const { error } = await cdmClient
      .from('cross_dept_messages')
      .update({ thread, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    m.thread = thread;
    if (ta) ta.value = '';
    cdmRenderDetail(m);
    cdmRender();
    if (typeof toast === 'function') toast('✓ 回复已发送');
  } catch (e) {
    console.error('[CDM] 回复失败:', e);
    if (typeof toast === 'function') toast('回复失败:' + (e.message || e), 'err');
  }
}

async function cdmChangeStatus(id, newStatus) {
  const me = _cdmGetCurrentUser();
  const m = CDM_MESSAGES.find(x => x.id === id);
  if (!m || m.status === newStatus) return;

  const updates = { status: newStatus, updated_at: new Date().toISOString() };
  if (newStatus === 'done') {
    updates.completed_at_ms = Date.now();
    updates.completed_by_id = me.id;
    updates.completed_by_name = me.name;
  }

  try {
    const { error } = await cdmClient.from('cross_dept_messages').update(updates).eq('id', id);
    if (error) throw error;
    Object.assign(m, updates);
    cdmRenderDetail(m);
    cdmRender();
    if (typeof toast === 'function') toast(`✓ 状态:${CDM_STATUSES[newStatus]?.label || newStatus}`);
  } catch (e) {
    console.error('[CDM] 状态切换失败:', e);
    if (typeof toast === 'function') toast('状态切换失败:' + (e.message || e), 'err');
  }
}

// ─────────────── Header 未读徽章 ───────────────
function cdmUpdateHeaderBadge() {
  const me = _cdmGetCurrentUser();
  const unread = CDM_MESSAGES.filter(m =>
    m.to_system === 'po' &&
    !(Array.isArray(m.read_by) ? m.read_by : []).includes(me.id)
  ).length;

  const headerBadge = document.getElementById('cdmHeaderBadge');
  if (headerBadge) {
    headerBadge.textContent = unread;
    headerBadge.style.display = unread > 0 ? 'inline-flex' : 'none';
  }
  const tabBadge = document.getElementById('badgeCrossDept');
  if (tabBadge) {
    tabBadge.textContent = unread;
    tabBadge.classList.toggle('zero', unread === 0);
  }
}

// ─────────────── 启动时只拉未读数(不渲染 UI)+ 开 Realtime ───────────────
async function cdmInitHeaderOnly() {
  try {
    const me = _cdmGetCurrentUser();
    if (!me.id || me.id === 'unknown') return;
    const { data } = await cdmClient
      .from('cross_dept_messages')
      .select('*')
      .or(`to_system.eq.po,and(from_system.eq.po,from_user_id.eq.${me.id})`)
      .order('created_at_ms', { ascending: false })
      .limit(500);
    CDM_MESSAGES = data || [];
    cdmUpdateHeaderBadge();
    cdmSubscribeRealtime();
    cdmRequestNotificationPermission();
  } catch (e) {
    console.warn('[CDM] init header 失败:', e);
  }
}

// 登录后(等 CURRENT_AGENT)初始化未读 + Realtime
window.addEventListener('DOMContentLoaded', () => {
  let attempts = 0;
  const wait = setInterval(() => {
    if ((typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || attempts++ > 120) {
      clearInterval(wait);
      if (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) {
        cdmInitHeaderOnly();
      }
    }
  }, 500);
});
