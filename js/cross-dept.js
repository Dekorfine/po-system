// ============================================================================
// V5-W3 v22-CW (2026-05-26): 跨部门协作模块(11 分类 / 超时 / 分派 / 店铺映射)
// ----------------------------------------------------------------------------
// 三个部门(跟单 po / 美工 design / 客服 cs)用共享 Supabase 表通信
// 表在美工的 Supabase 项目里(消息总线),跟单本地 Supabase 不动
// ============================================================================

// ─────────────── Supabase 客户端 ───────────────
const MESSAGEBUS_URL = "https://xyhbwqugbnowfjuhqhsj.supabase.co";
const MESSAGEBUS_KEY = "sb_publishable_Z0dXXZivG5QI-FCbwELxEA_JZBNx2Hn";
const cdmClient = window.supabase.createClient(MESSAGEBUS_URL, MESSAGEBUS_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const CDM_MY_SYSTEM = 'po';

// ─────────────── 11 分类(v22-CW)───────────────
const CDM_CATEGORIES = [
  { id: 'product_fix',    label: '🛠 修改产品',    color: '#92400e', bg: 'rgba(254,243,199,0.6)', desc: '颜色/尺寸/字母/参数/SKU/视频/图片/可控硅调光 等错误',  defaultTimeout: { urgent: 1, high: 2, normal: 5, low: 14 } },
  { id: 'price_fix',      label: '💰 改卖价',      color: '#991b1b', bg: 'rgba(254,226,226,0.6)', desc: '价格错误 · 通常紧急',                                  defaultTimeout: { urgent: 1, high: 1, normal: 3, low: 7 } },
  { id: 'product_remove', label: '🗑 下架删除',    color: '#374151', bg: 'rgba(243,244,246,0.7)', desc: '产品下架 / 删除',                                       defaultTimeout: { urgent: 1, high: 2, normal: 5, low: 14 } },
  { id: 'new_product',    label: '🆕 上新品',      color: '#1e40af', bg: 'rgba(219,234,254,0.6)', desc: '新品上架 / 客户定制 / 选网站自动派负责美工',           defaultTimeout: { urgent: 2, high: 5, normal: 10, low: 21 } },
  { id: 'reviews',        label: '⭐ 做评价',      color: '#92400e', bg: 'rgba(253,230,138,0.6)', desc: '产品评价生成(美工协助)',                              defaultTimeout: { urgent: 2, high: 5, normal: 7, low: 14 } },
  { id: 'design_3d',      label: '🎨 3D 渲染',     color: '#5b21b6', bg: 'rgba(237,233,254,0.6)', desc: '产品 3D 渲染 · 派给绑定网站的设计师',                  defaultTimeout: { urgent: 3, high: 7, normal: 14, low: 21 } },
  { id: 'install_manual', label: '📐 安装说明书',  color: '#0e7490', bg: 'rgba(207,250,254,0.6)', desc: '安装说明书 / 安装图 · 派给设计师',                     defaultTimeout: { urgent: 3, high: 7, normal: 14, low: 21 } },
  { id: 'custom_lamp',    label: '💡 非标定制',    color: '#9d174d', bg: 'rgba(252,231,243,0.6)', desc: '非标定制灯具 · 派给设计师',                            defaultTimeout: { urgent: 5, high: 10, normal: 21, low: 30 } },
  { id: 'aftersales',     label: '📞 售后处理',    color: '#166534', bg: 'rgba(220,252,231,0.6)', desc: '售后问题 / 退换货 / 投诉',                              defaultTimeout: { urgent: 1, high: 3, normal: 7, low: 14 } },
  { id: 'form_feedback',  label: '📋 表单反馈',    color: '#334155', bg: 'rgba(241,245,249,0.7)', desc: '订单 / 合箱单 / 报价单等表单数据问题',                  defaultTimeout: { urgent: 2, high: 5, normal: 7, low: 14 } },
  { id: 'general',        label: '💬 其他',        color: '#3730a3', bg: 'rgba(224,231,255,0.6)', desc: '其他需求 / 网站问题 / 一般沟通',                        defaultTimeout: { urgent: 2, high: 5, normal: 7, low: 14 } }
];

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
  order: '📦 订单', product: '🏷 产品', review: '⭐ 评论', sales_log: '📊 销售记录', customer: '👤 客户',
};
const CDM_OWNER_ROLES = {
  primary:  { label: '主负责', color: '#2563eb' },
  backup:   { label: '备援',   color: '#0891b2' },
  manager:  { label: '经理',   color: '#7c3aed' },
  designer: { label: '设计师', color: '#ea580c' },
};

// V22-CY: 内置 13 个网站预设(避免员工拼写不一致导致自动派单失效)
const SHOPS_PRESET = [
  { id: 'vakkerlight',    label: 'Vakkerlight',         category: '独立站' },
  { id: 'docos',          label: 'Docos.us',            category: '独立站' },
  { id: 'mooijane',       label: 'Mooijane',            category: '独立站' },
  { id: 'mooiehome',      label: 'Mooiehome',           category: '独立站' },
  { id: 'radilum',        label: 'Radilum',             category: '独立站' },
  { id: 'mooielight',     label: 'Mooielight',          category: '独立站' },
  { id: 'dekorfine',      label: 'Dekorfine',           category: '独立站' },
  { id: 'pinlighting',    label: 'Pinlighting',         category: '独立站' },
  { id: 'lumioshine',     label: 'Lumioshine',          category: '独立站' },
  { id: 'rayonshine',     label: 'Rayonshine',          category: '独立站' },
  { id: 'alibaba',        label: '阿里巴巴国际站',         category: '平台' },
  { id: 'radilum-inc',    label: 'Radilum INC',         category: '实体公司' },
  { id: 'other',          label: '其他(手填备注)',       category: '其他' },
];

// ─────────────── 状态 ───────────────
let CDM_MESSAGES = [];
let SHOP_OWNERS = [];
let CDM_TIMEOUT_CONFIG = {};
let CDM_CURRENT_TAB = 'inbox';  // inbox / assigned-to-me / overdue / sent
let CDM_FILTERS = { search: '', status: '', priority: '', category: '', system: '', timeRange: 'all' };
let CDM_PAGE = 1;
let CDM_PAGE_SIZE = 50;
let CDM_REALTIME_CHANNEL = null;
let CDM_INITIALIZED = false;
let CDM_NOTIFICATION_PERMISSION = false;
let CDM_CURRENT_DETAIL_ID = null;
let _CDM_TIMEOUT_DRAFT = null;       // 超时设置弹窗草稿
let _CDM_TIMEOUT_ACTIVE_CAT = 'product_fix';
let _CDM_NEW_WATCHERS = [];          // v22-CW 补丁: 新建消息时勾选的 watcher user_id 列表

// ─────────────── 用户工具 ───────────────
function _cdmGetCurrentUser() {
  const me = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '';
  let userId = me, userName = me;
  if (typeof CONFIG !== 'undefined' && CONFIG && Array.isArray(CONFIG.agents)) {
    const a = CONFIG.agents.find(x => x.name === me || x._userId === (typeof CURRENT_USER_ID !== 'undefined' ? CURRENT_USER_ID : null));
    if (a) {
      userId = a.alias || a.code || a.name || me;
      userName = a.alias ? `${a.name} (${a.alias})` : a.name;
    }
  }
  const role = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN) ? 'admin' : 'normal';
  return { id: userId || 'unknown', name: userName || userId || '未知', role };
}
function _cdmGetUsers() {
  if (typeof CONFIG !== 'undefined' && CONFIG && Array.isArray(CONFIG.agents)) {
    return CONFIG.agents.filter(a => a.name).map(a => ({
      id: a.alias || a.code || a.name,
      name: a.alias ? `${a.name} (${a.alias})` : a.name,
      shortName: a.name,
      role: a.role || 'normal',
    }));
  }
  return [];
}
function _cdmIsSupervisor() {
  const me = _cdmGetCurrentUser();
  return me.role === 'admin' || me.role === 'supervisor';
}
// v22-CW 补丁: 根据 user_id 反查名字(优先 shop_owners,再 CONFIG.agents,最后回 id)
function _cdmLookupUserName(userId) {
  if (!userId) return '';
  const owner = SHOP_OWNERS.find(s => s.userId === userId);
  if (owner) return owner.userName;
  const u = _cdmGetUsers().find(x => x.id === userId);
  if (u) return u.shortName || u.name;
  return userId;
}

// ─────────────── 超时工具 ───────────────
function getCategoryDef(catId) {
  return CDM_CATEGORIES.find(c => c.id === catId) || CDM_CATEGORIES[CDM_CATEGORIES.length - 1];
}
function getTimeoutDays(category, priority, system, timeoutOverride) {
  try {
    const o = (timeoutOverride && timeoutOverride[system] && timeoutOverride[system][category]) ? timeoutOverride[system][category][priority] : undefined;
    if (typeof o === 'number' && o > 0) return o;
  } catch (e) {}
  const cat = getCategoryDef(category);
  return (cat.defaultTimeout && cat.defaultTimeout[priority]) ?? 7;
}
function isOverdue(message, timeoutOverride) {
  if (!message) return false;
  const status = message.status || 'pending';
  if (status === 'done' || status === 'cancelled') return false;
  const days = getTimeoutDays(message.category, message.priority, message.to_system, timeoutOverride || CDM_TIMEOUT_CONFIG);
  const createdAt = message.created_at_ms || 0;
  return Date.now() > (createdAt + days * 86400000);
}
function getDueAt(message, timeoutOverride) {
  const days = getTimeoutDays(message.category, message.priority, message.to_system, timeoutOverride || CDM_TIMEOUT_CONFIG);
  return (message.created_at_ms || 0) + days * 86400000;
}

// ─────────────── 数据加载 ───────────────
async function cdmLoadMessages() {
  const me = _cdmGetCurrentUser();
  try {
    const { data, error } = await cdmClient
      .from('cross_dept_messages').select('*')
      .or(`to_system.eq.po,and(from_system.eq.po,from_user_id.eq.${me.id})`)
      .order('created_at_ms', { ascending: false }).limit(500);
    if (error) throw error;
    CDM_MESSAGES = data || [];
    cdmRender();
    cdmUpdateHeaderBadge();
  } catch (e) {
    console.error('[CDM] 加载失败:', e);
    if (typeof toast === 'function') toast('跨部门消息加载失败:' + (e.message || e), 'err');
  }
}
async function cdmLoadShopOwners() {
  try {
    const { data, error } = await cdmClient.from('shop_owners').select('*').order('shop_name');
    if (error) throw error;
    SHOP_OWNERS = (data || []).map(r => ({
      id: r.id, shopName: r.shop_name, system: r.system,
      userId: r.user_id, userName: r.user_name,
      role: r.role || 'primary', notes: r.notes || null,
      createdAtMs: r.created_at_ms,
    }));
  } catch (e) { console.warn('[CDM] 店铺负责人加载失败:', e); SHOP_OWNERS = []; }
}
async function cdmLoadTimeoutConfig() {
  try {
    const { data, error } = await cdmClient.from('app_config').select('value').eq('key', 'cdm_timeout_config').maybeSingle();
    if (error) throw error;
    CDM_TIMEOUT_CONFIG = (data && data.value) || {};
  } catch (e) { console.warn('[CDM] 超时配置加载失败:', e); CDM_TIMEOUT_CONFIG = {}; }
}

// ─────────────── 初始化 ───────────────
async function cdmInit() {
  if (!CDM_INITIALIZED) {
    cdmRequestNotificationPermission();
    await Promise.all([cdmLoadShopOwners(), cdmLoadTimeoutConfig()]);
    cdmSubscribeRealtime();
    CDM_INITIALIZED = true;
  }
  await cdmLoadMessages();
}
function cdmOnTabActivate() { cdmInit(); }

// ─────────────── Realtime ───────────────
function cdmSubscribeRealtime() {
  if (CDM_REALTIME_CHANNEL) return;
  const me = _cdmGetCurrentUser();
  CDM_REALTIME_CHANNEL = cdmClient
    .channel('cdm-v22cw-po-' + me.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cross_dept_messages' }, p => cdmHandleRealtimeChange(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_owners' }, async () => { await cdmLoadShopOwners(); cdmRender(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, async (payload) => {
      if (payload.new && payload.new.key === 'cdm_timeout_config') {
        CDM_TIMEOUT_CONFIG = payload.new.value || {};
        cdmRender();
      }
    })
    .subscribe(s => { if (s === 'SUBSCRIBED') console.log('[CDM] ✓ Realtime 已订阅 v22-CW'); });
}
function cdmHandleRealtimeChange(payload) {
  const me = _cdmGetCurrentUser();
  const row = payload.new || payload.old;
  if (!row) return;
  const isRelevant = (row.to_system === 'po')
                  || (row.from_system === 'po' && row.from_user_id === me.id)
                  || (Array.isArray(row.watchers) && row.watchers.includes(me.id));
  if (!isRelevant) return;

  if (payload.eventType === 'INSERT') {
    if (!CDM_MESSAGES.find(m => m.id === payload.new.id)) CDM_MESSAGES.unshift(payload.new);
    cdmRender(); cdmUpdateHeaderBadge();
    if (payload.new.to_system === 'po' && payload.new.from_user_id !== me.id) cdmShowNotification(payload.new);
  } else if (payload.eventType === 'UPDATE') {
    const idx = CDM_MESSAGES.findIndex(m => m.id === payload.new.id);
    const oldRow = idx >= 0 ? CDM_MESSAGES[idx] : (payload.old || null);
    if (idx >= 0) CDM_MESSAGES[idx] = payload.new;
    else CDM_MESSAGES.unshift(payload.new);
    cdmRender(); cdmUpdateHeaderBadge();
    // 如果详情正打开,刷新
    if (CDM_CURRENT_DETAIL_ID === payload.new.id) cdmRenderDetail(payload.new);
    // v22-CW: 别人完成我发出的工单 → owner 收到桌面通知
    const wasNotDone = oldRow && oldRow.status !== 'done';
    const nowDone = payload.new.status === 'done';
    const iAmOwner = (payload.new.from_system === 'po' && payload.new.from_user_id === me.id);
    const someoneElseCompleted = (payload.new.completed_by_id && payload.new.completed_by_id !== me.id);
    if (wasNotDone && nowDone && iAmOwner && someoneElseCompleted && CDM_NOTIFICATION_PERMISSION) {
      try {
        const completer = payload.new.completed_by_name || payload.new.completed_by_id || '对方';
        const n = new Notification(`✅ 你的工单已完成`, {
          body: `「${payload.new.title || '(无标题)'}」· 由 ${completer} 完成`,
          tag: 'done-' + payload.new.id,
        });
        n.onclick = () => {
          try { window.focus(); } catch(_) {}
          if (typeof switchTab === 'function') switchTab('cross_dept');
          setTimeout(() => cdmOpenDetail(payload.new.id), 250);
          n.close();
        };
      } catch (e) {}
    }
    // v22-CW: 主管分派工单给我 → 我收到桌面通知
    const wasNotAssignedToMe = !oldRow || oldRow.assigned_to_id !== me.id;
    const nowAssignedToMe = payload.new.assigned_to_id === me.id;
    const assignedBySomeoneElse = (payload.new.assigned_by_id && payload.new.assigned_by_id !== me.id);
    if (wasNotAssignedToMe && nowAssignedToMe && assignedBySomeoneElse && CDM_NOTIFICATION_PERMISSION) {
      try {
        const assigner = payload.new.assigned_by_name || payload.new.assigned_by_id || '主管';
        const n = new Notification(`📌 工单分派给你了`, {
          body: `「${payload.new.title || '(无标题)'}」· 由 ${assigner} 分派`,
          tag: 'assigned-' + payload.new.id,
          requireInteraction: true,
        });
        n.onclick = () => {
          try { window.focus(); } catch(_) {}
          if (typeof switchTab === 'function') switchTab('cross_dept');
          setTimeout(() => cdmOpenDetail(payload.new.id), 250);
          n.close();
        };
      } catch (e) {}
    }
  } else if (payload.eventType === 'DELETE') {
    CDM_MESSAGES = CDM_MESSAGES.filter(m => m.id !== payload.old.id);
    cdmRender(); cdmUpdateHeaderBadge();
  }
}

// ─────────────── 浏览器通知 ───────────────
async function cdmRequestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') CDM_NOTIFICATION_PERMISSION = true;
  else if (Notification.permission !== 'denied') {
    try { const p = await Notification.requestPermission(); CDM_NOTIFICATION_PERMISSION = (p === 'granted'); } catch (e) {}
  }
}
function cdmShowNotification(msg) {
  if (!CDM_NOTIFICATION_PERMISSION) return;
  try {
    const from = (CDM_SYSTEMS[msg.from_system] && CDM_SYSTEMS[msg.from_system].short) || msg.from_system;
    const pri = (CDM_PRIORITIES[msg.priority] && CDM_PRIORITIES[msg.priority].label) || '';
    const n = new Notification(`📨 ${from} · ${msg.from_user_name || ''}`, {
      body: `${pri ? pri + ' · ' : ''}${msg.title || ''}`,
      tag: msg.id, requireInteraction: msg.priority === 'urgent',
    });
    n.onclick = () => {
      try { window.focus(); } catch(_) {}
      if (typeof switchTab === 'function') switchTab('cross_dept');
      setTimeout(() => cdmOpenDetail(msg.id), 250);
      n.close();
    };
  } catch (e) {}
}

// ─────────────── 筛选 + 排序 ───────────────
function _cdmCanSee(m) {
  const me = _cdmGetCurrentUser();
  if (m.to_system === 'po') return true;
  if (Array.isArray(m.watchers) && m.watchers.includes(me.id)) return true;
  return false;
}
function cdmGetFiltered() {
  const me = _cdmGetCurrentUser();
  let list = CDM_MESSAGES.filter(m => {
    if (CDM_CURRENT_TAB === 'inbox') return _cdmCanSee(m);
    if (CDM_CURRENT_TAB === 'assigned-to-me') return m.assigned_to_id === me.id;
    if (CDM_CURRENT_TAB === 'overdue') return _cdmCanSee(m) && isOverdue(m);
    if (CDM_CURRENT_TAB === 'sent') return m.from_user_id === me.id && m.from_system === 'po';
    return true;
  });

  if (CDM_FILTERS.search) {
    const q = CDM_FILTERS.search.toLowerCase();
    list = list.filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.body || '').toLowerCase().includes(q) ||
      (m.related_ref || '').toLowerCase().includes(q) ||
      (m.related_shop || '').toLowerCase().includes(q) ||
      (m.from_user_name || '').toLowerCase().includes(q) ||
      (m.assigned_to_name || '').toLowerCase().includes(q)
    );
  }
  if (CDM_FILTERS.status)   list = list.filter(m => m.status === CDM_FILTERS.status);
  if (CDM_FILTERS.priority) list = list.filter(m => m.priority === CDM_FILTERS.priority);
  if (CDM_FILTERS.category) list = list.filter(m => m.category === CDM_FILTERS.category);
  if (CDM_FILTERS.system) {
    list = list.filter(m => {
      if (CDM_CURRENT_TAB === 'sent') return m.to_system === CDM_FILTERS.system;
      return m.from_system === CDM_FILTERS.system;
    });
  }
  if (CDM_FILTERS.timeRange !== 'all') {
    const days = { today: 1, '3d': 3, '7d': 7, '30d': 30 }[CDM_FILTERS.timeRange] || 0;
    const cutoff = Date.now() - days * 86400000;
    list = list.filter(m => (m.created_at_ms || 0) >= cutoff);
  }

  // 排序: 超时 > 优先级 > 时间(新)
  const priRank = { urgent: 4, high: 3, normal: 2, low: 1 };
  list.sort((a, b) => {
    const ao = isOverdue(a) ? 1 : 0, bo = isOverdue(b) ? 1 : 0;
    if (ao !== bo) return bo - ao;
    const ap = priRank[a.priority] || 0, bp = priRank[b.priority] || 0;
    if (ap !== bp) return bp - ap;
    return (b.created_at_ms || 0) - (a.created_at_ms || 0);
  });
  return list;
}

function _cdmComputeStats() {
  const me = _cdmGetCurrentUser();
  const inbox = CDM_MESSAGES.filter(_cdmCanSee);
  const readBy = m => Array.isArray(m.read_by) ? m.read_by : [];
  const unread = inbox.filter(m => !readBy(m).includes(me.id));
  const urgent = inbox.filter(m => m.priority === 'urgent' && m.status !== 'done' && m.status !== 'cancelled');
  const overdue = inbox.filter(m => isOverdue(m));
  const pending = inbox.filter(m => m.status === 'pending');
  const inProgress = inbox.filter(m => m.status === 'in_progress');
  const sent = CDM_MESSAGES.filter(m => m.from_user_id === me.id && m.from_system === 'po');
  const assignedToMe = CDM_MESSAGES.filter(m => m.assigned_to_id === me.id);
  return { unread: unread.length, urgent: urgent.length, overdue: overdue.length, pending: pending.length, inProgress: inProgress.length, sent: sent.length, assignedToMe: assignedToMe.length, inboxTotal: inbox.length };
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
  cdmRenderUrgentBanner();
  cdmRenderStats();
  cdmRenderTabCounts();

  if (pageList.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:60px 20px; color:var(--text-tertiary); font-size:14px;">
      <div style="font-size:48px; margin-bottom:12px;">📭</div>
      <div>没有符合条件的消息</div>
      ${CDM_CURRENT_TAB === 'sent' ? '<div style="margin-top:8px; font-size:12px;">点右上「✏ 新建消息」给美工或客服发消息</div>' : ''}
    </div>`;
    cdmRenderPagination(0, 1, 1);
    return;
  }
  container.innerHTML = pageList.map(m => cdmRenderCard(m)).join('');
  cdmRenderPagination(total, CDM_PAGE, totalPages);
}

function cdmRenderTabCounts() {
  const me = _cdmGetCurrentUser();
  const inbox = CDM_MESSAGES.filter(_cdmCanSee);
  const assigned = CDM_MESSAGES.filter(m => m.assigned_to_id === me.id);
  const overdue = inbox.filter(m => isOverdue(m));
  const sent = CDM_MESSAGES.filter(m => m.from_user_id === me.id && m.from_system === 'po');
  const readBy = m => Array.isArray(m.read_by) ? m.read_by : [];
  const inboxUnread = inbox.filter(m => !readBy(m).includes(me.id)).length;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('cdmTabInbox', `📥 收件箱 <span class="cdm-count">${inbox.length}</span>${inboxUnread > 0 ? ` <span class="cdm-unread-dot">${inboxUnread}</span>` : ''}`);
  set('cdmTabAssigned', `📌 分派给我 <span class="cdm-count">${assigned.length}</span>`);
  set('cdmTabOverdue', `⏰ 超时 ${overdue.length > 0 ? `<span class="cdm-overdue-dot">${overdue.length}</span>` : `<span class="cdm-count">${overdue.length}</span>`}`);
  set('cdmTabSent', `📤 发件箱 <span class="cdm-count">${sent.length}</span>`);
}

function cdmRenderUrgentBanner() {
  const banner = document.getElementById('cdmUrgentBanner');
  if (!banner) return;
  const stats = _cdmComputeStats();
  const isSup = _cdmIsSupervisor();
  const show = (stats.urgent > 0 || stats.overdue > 0 || (isSup && stats.pending > 0));
  if (!show) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  banner.innerHTML = `
    <div class="cdm-urgent-icon">🚨</div>
    <div class="cdm-urgent-text">
      <div class="cdm-urgent-title">⚠ 还有工单需要处理 · 别让消息被群里刷下去</div>
      <div class="cdm-urgent-sub">
        ${stats.urgent > 0 ? `<span>🚨 紧急 <b>${stats.urgent}</b> 条</span>` : ''}
        ${stats.overdue > 0 ? `<span>⏰ 超时 <b>${stats.overdue}</b> 条</span>` : ''}
        ${isSup && stats.pending > 0 ? `<span>⏳ 待处理 <b>${stats.pending}</b> 条</span>` : ''}
      </div>
    </div>
    <button class="btn" style="background:#dc2626; color:white; font-weight:600; flex-shrink:0;" onclick="cdmSwitchTab('overdue')">查看超时</button>
  `;
}

function cdmRenderStats() {
  const c = document.getElementById('cdmStatsContainer');
  if (!c) return;
  const s = _cdmComputeStats();
  c.innerHTML = `
    <div class="cdm-stat" onclick="cdmSwitchTab('inbox'); CDM_FILTERS.search=''; cdmRender();">
      <div class="cdm-stat-label">📥 待我处理</div>
      <div class="cdm-stat-value">${s.unread}</div>
      <div class="cdm-stat-sub">收件箱未读</div>
    </div>
    <div class="cdm-stat" onclick="CDM_FILTERS.status='in_progress'; document.getElementById('cdmFilterStatus').value='in_progress'; cdmRender();">
      <div class="cdm-stat-label">🔄 进行中</div>
      <div class="cdm-stat-value" style="color:#2563eb;">${s.inProgress}</div>
      <div class="cdm-stat-sub">处理中</div>
    </div>
    <div class="cdm-stat" onclick="cdmSwitchTab('sent');">
      <div class="cdm-stat-label">📤 我发出</div>
      <div class="cdm-stat-value">${s.sent}</div>
      <div class="cdm-stat-sub">总发件</div>
    </div>
    <div class="cdm-stat" onclick="cdmSwitchTab('inbox'); CDM_FILTERS.priority='urgent'; document.getElementById('cdmFilterPriority').value='urgent'; cdmRender();">
      <div class="cdm-stat-label">🔥 紧急未处理</div>
      <div class="cdm-stat-value" style="color:#dc2626;">${s.urgent}</div>
      <div class="cdm-stat-sub">最高优先级</div>
    </div>
    <div class="cdm-stat ${s.overdue > 0 ? 'cdm-stat-alert' : ''}" onclick="${s.overdue > 0 ? "cdmSwitchTab('overdue')" : ''}">
      <div class="cdm-stat-label" style="${s.overdue > 0 ? 'color:#dc2626; font-weight:700;' : ''}">⏰ 超时</div>
      <div class="cdm-stat-value" style="color:${s.overdue > 0 ? '#dc2626' : '#9ca3af'};">${s.overdue}</div>
      <div class="cdm-stat-sub">已超过截止</div>
    </div>
  `;
}

function cdmRenderCard(m) {
  const me = _cdmGetCurrentUser();
  const catDef = getCategoryDef(m.category);
  const pri = CDM_PRIORITIES[m.priority] || CDM_PRIORITIES.normal;
  const status = CDM_STATUSES[m.status] || CDM_STATUSES.pending;
  const fromSys = CDM_SYSTEMS[m.from_system] || { label: m.from_system, color: '#666' };
  const toSys = CDM_SYSTEMS[m.to_system] || { label: m.to_system, color: '#666' };
  const readBy = Array.isArray(m.read_by) ? m.read_by : [];
  const iAmRecipient = (m.to_system === 'po');
  const isUnread = iAmRecipient && !readBy.includes(me.id);
  const overdue = isOverdue(m);
  const dueAt = getDueAt(m);
  const dueDays = Math.round((dueAt - Date.now()) / 86400000);

  const dt = new Date(m.created_at_ms || 0);
  const diffMin = Math.max(0, Math.floor((Date.now() - (m.created_at_ms || 0)) / 60000));
  let timeStr;
  if (diffMin < 1) timeStr = '刚刚';
  else if (diffMin < 60) timeStr = `${diffMin} 分钟前`;
  else if (diffMin < 1440) timeStr = `${Math.floor(diffMin/60)} 小时前`;
  else if (diffMin < 10080) timeStr = `${Math.floor(diffMin/1440)} 天前`;
  else timeStr = dt.toLocaleDateString();
  const threadCount = Array.isArray(m.thread) ? m.thread.length : 0;
  const watchersCount = Array.isArray(m.watchers) ? m.watchers.length : 0;
  const isMine = (m.from_system === 'po' && m.from_user_id === me.id);
  const otherSys = isMine ? toSys : fromSys;
  const direction = isMine ? '发给' : '来自';

  const relHtml = m.related_ref ? `<span class="cdm-chip" style="background:rgba(37,99,235,0.08); color:#2563eb; font-family:'JetBrains Mono',monospace;">${CDM_REL_TYPES[m.related_type] || '🔗'} ${escapeHtml(m.related_ref)}</span>` : '';
  const shopHtml = m.related_shop ? `<span class="cdm-chip" style="background:rgba(16,185,129,0.12); color:#047857;">🌐 ${escapeHtml(m.related_shop)}</span>` : '';
  const assignedHtml = m.assigned_to_name ? `<span class="cdm-chip" style="background:rgba(37,99,235,0.12); color:#1e40af; font-weight:600;">📌 ${escapeHtml(m.assigned_to_name)}</span>` : '';
  const overdueHtml = overdue ? `<span class="cdm-chip cdm-chip-pulse" style="background:#dc2626; color:white; font-weight:700;">⏰ 已超时 ${Math.abs(dueDays)} 天</span>` : '';
  const dueHtml = (!overdue && m.status !== 'done' && m.status !== 'cancelled') ? `<span class="cdm-chip" style="background:${dueDays <= 1 ? 'rgba(234,88,12,0.12)' : 'rgba(0,0,0,0.04)'}; color:${dueDays <= 1 ? '#b45309' : '#888'}; font-weight:${dueDays <= 1 ? '600' : '500'};">${dueDays <= 0 ? '今日截止' : `还剩 ${dueDays} 天`}</span>` : '';

  return `
    <div class="cdm-card${isUnread ? ' cdm-unread' : ''}${overdue ? ' cdm-overdue-card' : ''}" onclick="cdmOpenDetail('${m.id}')"
         style="border-left:3px solid ${overdue ? '#dc2626' : pri.color};">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
            ${isUnread ? '<span class="cdm-unread-pulse"></span>' : ''}
            <span style="font-weight:${isUnread ? '600' : '500'}; font-size:14px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(m.title || '(无标题)')}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:5px; align-items:center;">
            ${overdueHtml}
            ${(m.priority && m.priority !== 'normal') ? `<span class="cdm-chip" style="background:${pri.bg}; color:${pri.color}; font-weight:600;">${pri.label}</span>` : ''}
            <span class="cdm-chip" style="background:${catDef.bg}; color:${catDef.color};">${catDef.label}</span>
            <span class="cdm-chip" style="background:${status.bg}; color:${status.color}; font-weight:500;">${status.label}</span>
            <span class="cdm-chip" style="background:rgba(0,0,0,0.04); color:${otherSys.color};">${direction} ${otherSys.label}</span>
            ${shopHtml}
            ${assignedHtml}
            ${relHtml}
            ${threadCount > 0 ? `<span class="cdm-chip" style="background:rgba(0,0,0,0.05); color:#666;">💬 ${threadCount}</span>` : ''}
            ${watchersCount > 0 ? `<span class="cdm-chip" style="background:rgba(124,58,237,0.10); color:#7c3aed;">👁 ${watchersCount}</span>` : ''}
            ${dueHtml}
          </div>
          ${m.body ? `<div style="font-size:12.5px; color:var(--text-secondary); line-height:1.5; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(m.body)}</div>` : ''}
        </div>
        <div style="text-align:right; flex-shrink:0; font-size:11px; color:var(--text-tertiary); min-width:90px;">
          <div style="font-weight:500; color:var(--text-secondary); margin-bottom:2px;">${escapeHtml(m.from_user_name || m.from_user_id || '')}</div>
          <div style="font-family:'JetBrains Mono',monospace;">${timeStr}</div>
        </div>
      </div>
    </div>
  `;
}

function cdmRenderPagination(total, page, totalPages) {
  const pageSizeBtns = [20, 50, 100].map(n => `<button class="btn small" style="${CDM_PAGE_SIZE===n?'background:#2563eb; color:white; font-weight:600;':''}" onclick="cdmSetPageSize(${n})">${n}</button>`).join('');
  const html = `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 4px; font-size:12px; color:var(--text-secondary); flex-wrap:wrap; gap:10px;">
      <span>共 <b style="color:var(--text-primary);">${total}</b> 条 · 第 <b>${page}</b> / ${totalPages} 页</span>
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="font-size:11.5px;">每页:</span>
        <div style="display:flex; gap:3px;">${pageSizeBtns}</div>
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
function cdmSetPageSize(n) { CDM_PAGE_SIZE = n; CDM_PAGE = 1; cdmRender(); }

// ─────────────── Tab / 筛选器 ───────────────
function cdmSwitchTab(tab) {
  CDM_CURRENT_TAB = tab; CDM_PAGE = 1;
  document.querySelectorAll('.cdm-subtab').forEach(b => b.classList.remove('active'));
  const idMap = { 'inbox': 'cdmTabInbox', 'assigned-to-me': 'cdmTabAssigned', 'overdue': 'cdmTabOverdue', 'sent': 'cdmTabSent' };
  document.getElementById(idMap[tab])?.classList.add('active');
  cdmRender();
}
function cdmSetFilter(key, val) { CDM_FILTERS[key] = val; CDM_PAGE = 1; cdmRender(); }
function cdmResetFilters() {
  CDM_FILTERS = { search: '', status: '', priority: '', category: '', system: '', timeRange: 'all' };
  CDM_PAGE = 1;
  ['cdmSearchInput','cdmFilterStatus','cdmFilterPriority','cdmFilterCategory','cdmFilterSystem'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelectorAll('.cdm-time-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.cdm-time-chip[data-range="all"]')?.classList.add('active');
  cdmRender();
}
let _cdmSearchTimer = null;
function cdmOnSearchInput(val) {
  clearTimeout(_cdmSearchTimer);
  _cdmSearchTimer = setTimeout(() => { CDM_FILTERS.search = val; CDM_PAGE = 1; cdmRender(); }, 250);
}
function cdmSetTimeRange(range, el) {
  CDM_FILTERS.timeRange = range; CDM_PAGE = 1;
  document.querySelectorAll('.cdm-time-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  cdmRender();
}

// 在 tab content 渲染顶部"管理员功能"按钮(主管才有)
function cdmRenderAdminButtons() {
  const el = document.getElementById('cdmAdminButtons');
  if (!el) return;
  const isSup = _cdmIsSupervisor();
  if (!isSup) { el.innerHTML = ''; return; }
  const mineCount = SHOP_OWNERS.filter(s => s.system === 'po').length;
  el.innerHTML = `
    <button class="btn" onclick="cdmOpenTimeoutSettings()" title="设置每个分类+优先级的超时天数">⏰ 超时阈值</button>
    <button class="btn" onclick="cdmOpenShopOwnersManager()" title="维护本部门员工与网站的负责关系">🌐 店铺负责人 (${mineCount})</button>
  `;
}

// 填充分类下拉框(扫码生成 option,从 CDM_CATEGORIES)
function cdmPopulateCategorySelects() {
  const ids = ['cdmNewCategory', 'cdmFilterCategory'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.populated === '1') return;
    if (id === 'cdmFilterCategory') {
      el.innerHTML = `<option value="">所有分类</option>` + CDM_CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    } else {
      el.innerHTML = CDM_CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    }
    el.dataset.populated = '1';
  });
}

// ─────────────── 新建消息弹窗 ───────────────
function cdmOpenNewModal(preset = {}) {
  cdmPopulateCategorySelects();
  const modal = document.getElementById('cdmNewModal');
  if (!modal) return;
  _CDM_NEW_WATCHERS = [];  // v22-CW 补丁:重置 watcher 选择
  document.getElementById('cdmNewToSystem').value = preset.to_system || '';
  document.getElementById('cdmNewCategory').value = preset.category || 'general';
  document.getElementById('cdmNewPriority').value = preset.priority || 'normal';
  document.getElementById('cdmNewTitle').value = preset.title || '';
  document.getElementById('cdmNewBody').value = preset.body || '';
  document.getElementById('cdmNewRelType').value = preset.related_type || '';
  document.getElementById('cdmNewRelRef').value = preset.related_ref || '';
  cdmPopulateShopDropdown();
  document.getElementById('cdmNewRelatedShop').value = preset.related_shop || '';
  // V22-CY: 清空自定义网站名 + 隐藏框
  const custom = document.getElementById('cdmNewCustomShopName');
  const customWrap = document.getElementById('cdmNewCustomShopWrap');
  if (custom) custom.value = '';
  if (customWrap) customWrap.style.display = 'none';
  cdmUpdateSuggestedReceiver();
  modal.classList.add('show');
}
function cdmCloseNewModal() { document.getElementById('cdmNewModal')?.classList.remove('show'); }

function cdmPopulateShopDropdown() {
  const el = document.getElementById('cdmNewRelatedShop');
  if (!el) return;
  // V22-CY: 用 SHOPS_PRESET 而不是从 shop_owners 提取(避免拼写不一致)
  const groups = ['独立站', '平台', '实体公司'];
  const groupIcons = { '独立站': '📦', '平台': '🛒', '实体公司': '🏢' };
  el.innerHTML = `<option value="">— 不关联(通用工单)—</option>` +
    groups.map(g => `
      <optgroup label="${groupIcons[g] || ''} ${g}">
        ${SHOPS_PRESET.filter(s => s.category === g).map(s => `<option value="${escapeHtml(s.label)}">${escapeHtml(s.label)}</option>`).join('')}
      </optgroup>
    `).join('') +
    `<option value="__other__">📝 其他(手填备注)</option>`;
}
function cdmUpdateSuggestedReceiver() {
  const shop = document.getElementById('cdmNewRelatedShop')?.value || '';
  const toSys = document.getElementById('cdmNewToSystem')?.value || '';
  const hintEl = document.getElementById('cdmSuggestedReceiverHint');
  const customWrap = document.getElementById('cdmNewCustomShopWrap');
  // V22-CY: "其他"时显示手填框
  if (customWrap) customWrap.style.display = (shop === '__other__') ? 'block' : 'none';

  let suggestedUserId = null;
  if (hintEl) {
    if (shop === '__other__') {
      hintEl.innerHTML = '<span style="color:#b45309; font-size:11.5px;">⚠ 其他网站 · 不自动派单 · 请手动指定接收人</span>';
    } else if (!shop || !toSys) {
      hintEl.innerHTML = '<span style="color:var(--text-tertiary); font-size:11.5px;">选了「关联网站」+「发给部门」后会自动建议负责人</span>';
    } else {
      const candidates = SHOP_OWNERS.filter(s => s.shopName === shop && s.system === toSys);
      if (candidates.length === 0) {
        hintEl.innerHTML = '<span style="color:var(--text-tertiary); font-size:11.5px;">该部门此网站还没维护负责人 · 主管去「🌐 店铺负责人」添加</span>';
      } else {
        const primary = candidates.find(c => c.role === 'primary') || candidates.find(c => c.role === 'manager') || candidates[0];
        suggestedUserId = primary.userId;
        const roleLabel = (CDM_OWNER_ROLES[primary.role] || {}).label || primary.role;
        hintEl.innerHTML = `<span style="font-size:12px;">👤 <b>${escapeHtml(primary.userName)}</b> <span style="color:var(--text-tertiary);">(${roleLabel})</span>${candidates.length > 1 ? ` <span style="color:var(--text-tertiary);">+${candidates.length - 1} 备援</span>` : ''}</span>`;
      }
    }
  }
  // v22-CW 补丁:刷新 watcher 候选区(对方部门的其他负责人,排除已自动派的)
  cdmRenderWatcherCandidates(toSys, suggestedUserId);
}

// v22-CW 补丁:渲染新建消息时的 watcher 多选区
function cdmRenderWatcherCandidates(toSys, excludeUserId) {
  const el = document.getElementById('cdmNewWatchersArea');
  if (!el) return;
  if (!toSys) {
    el.innerHTML = '<div style="font-size:11.5px; color:var(--text-tertiary); padding:6px 0;">选了「发给部门」后这里会显示对方部门可关注的人</div>';
    return;
  }
  const seen = new Set();
  if (excludeUserId) seen.add(excludeUserId);
  const candidates = SHOP_OWNERS
    .filter(s => s.system === toSys)
    .filter(s => { if (seen.has(s.userId)) return false; seen.add(s.userId); return true; });
  if (candidates.length === 0) {
    el.innerHTML = '<div style="font-size:11.5px; color:var(--text-tertiary); padding:6px 0;">对方部门还没维护其他可关注的负责人</div>';
    return;
  }
  el.innerHTML = candidates.map(c => {
    const selected = _CDM_NEW_WATCHERS.includes(c.userId);
    const roleLabel = (CDM_OWNER_ROLES[c.role] || {}).label || c.role;
    return `<button type="button" class="cdm-watcher-chip${selected ? ' selected' : ''}"
      onclick="cdmToggleNewWatcher('${escapeHtml(c.userId).replace(/'/g, "\\'")}')"
      title="${escapeHtml(c.shopName)} · ${roleLabel}">
      ${selected ? '✓' : '+'} ${escapeHtml(c.userName)}
    </button>`;
  }).join('');
}

// v22-CW 补丁:切换 watcher 选中状态
function cdmToggleNewWatcher(userId) {
  const idx = _CDM_NEW_WATCHERS.indexOf(userId);
  if (idx >= 0) _CDM_NEW_WATCHERS.splice(idx, 1);
  else _CDM_NEW_WATCHERS.push(userId);
  // 重新渲染保持当前 toSystem + suggestedUserId 上下文
  const toSys = document.getElementById('cdmNewToSystem')?.value || '';
  const shop = document.getElementById('cdmNewRelatedShop')?.value || '';
  let suggestedUserId = null;
  if (shop && toSys) {
    const cs = SHOP_OWNERS.filter(s => s.shopName === shop && s.system === toSys);
    const primary = cs.find(c => c.role === 'primary') || cs.find(c => c.role === 'manager') || cs[0];
    if (primary) suggestedUserId = primary.userId;
  }
  cdmRenderWatcherCandidates(toSys, suggestedUserId);
}

async function cdmSubmitNew() {
  const me = _cdmGetCurrentUser();
  const toSys = document.getElementById('cdmNewToSystem').value;
  const cat = document.getElementById('cdmNewCategory').value;
  const pri = document.getElementById('cdmNewPriority').value;
  const title = document.getElementById('cdmNewTitle').value.trim();
  const body = document.getElementById('cdmNewBody').value.trim();
  const relT = document.getElementById('cdmNewRelType').value;
  const relR = document.getElementById('cdmNewRelRef').value.trim();
  let relShop = document.getElementById('cdmNewRelatedShop').value;
  // V22-CY: "其他"时取自定义输入框
  if (relShop === '__other__') {
    relShop = (document.getElementById('cdmNewCustomShopName')?.value || '').trim() || null;
  } else if (!relShop) {
    relShop = null;
  }
  if (!toSys) { toast('请选择接收部门', 'err'); return; }
  if (toSys === 'po') { toast('不能发给自己部门', 'err'); return; }
  if (!title) { toast('请填标题', 'err'); return; }

  // 自动建议的接收人(如有)— "其他"网站跳过自动派
  let toUserId = null, toUserName = null;
  if (relShop && toSys && document.getElementById('cdmNewRelatedShop').value !== '__other__') {
    const candidates = SHOP_OWNERS.filter(s => s.shopName === relShop && s.system === toSys);
    const primary = candidates.find(c => c.role === 'primary') || candidates.find(c => c.role === 'manager') || candidates[0];
    if (primary) { toUserId = primary.userId; toUserName = primary.userName; }
  }

  const row = {
    from_system: 'po', from_user_id: me.id, from_user_name: me.name,
    to_system: toSys, to_user_id: toUserId, to_user_name: toUserName,
    category: cat || 'general', priority: pri || 'normal',
    title, body: body || null,
    related_ref: relR || null, related_type: relT || null, related_shop: relShop || null,
    status: 'pending', thread: [], read_by: [me.id],
    watchers: [..._CDM_NEW_WATCHERS],   // v22-CW 补丁:跟单勾选的额外通知人
    created_at_ms: Date.now(),
  };
  try {
    const { error } = await cdmClient.from('cross_dept_messages').insert(row);
    if (error) throw error;
    cdmCloseNewModal();
    const watcherCount = _CDM_NEW_WATCHERS.length;
    toast(`✓ 已发送给${(CDM_SYSTEMS[toSys] || {}).short || toSys}部${toUserName ? ` · 自动派给 ${toUserName}` : ''}${watcherCount > 0 ? ` · ${watcherCount} 人关注` : ''}`);
    _CDM_NEW_WATCHERS = [];
    await cdmLoadMessages();
  } catch (e) {
    console.error('[CDM] 发送失败:', e);
    toast('发送失败:' + (e.message || e), 'err');
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
        if (idx >= 0) CDM_MESSAGES[idx] = data; else CDM_MESSAGES.unshift(data);
        m = data;
      }
    } catch (e) {}
  }
  if (!m) { toast('消息不存在', 'err'); return; }
  CDM_CURRENT_DETAIL_ID = id;
  cdmRenderDetail(m);
  document.getElementById('cdmDetailModal')?.classList.add('show');

  const me = _cdmGetCurrentUser();
  const readBy = Array.isArray(m.read_by) ? m.read_by : [];
  if (m.to_system === 'po' && !readBy.includes(me.id)) {
    const newReadBy = [...readBy, me.id];
    try {
      const { error } = await cdmClient.from('cross_dept_messages').update({ read_by: newReadBy }).eq('id', m.id);
      if (!error) { m.read_by = newReadBy; cdmRender(); cdmUpdateHeaderBadge(); }
    } catch (e) {}
  }
}
function cdmCloseDetail() { document.getElementById('cdmDetailModal')?.classList.remove('show'); CDM_CURRENT_DETAIL_ID = null; }

function cdmRenderDetail(m) {
  const wrap = document.getElementById('cdmDetailBody');
  if (!wrap) return;
  const me = _cdmGetCurrentUser();
  const catDef = getCategoryDef(m.category);
  const pri = CDM_PRIORITIES[m.priority] || CDM_PRIORITIES.normal;
  const status = CDM_STATUSES[m.status] || CDM_STATUSES.pending;
  const fromSys = CDM_SYSTEMS[m.from_system] || { label: m.from_system };
  const toSys = CDM_SYSTEMS[m.to_system] || { label: m.to_system };
  const dt = new Date(m.created_at_ms || 0);
  const thread = Array.isArray(m.thread) ? m.thread : [];
  const isInbox = (m.to_system === 'po');
  const isMine = (m.from_system === 'po' && m.from_user_id === me.id);
  const canChangeStatus = isInbox || isMine;
  const canAssign = isInbox && _cdmIsSupervisor() && m.status !== 'done' && m.status !== 'cancelled';
  const overdue = isOverdue(m);
  const dueAt = getDueAt(m);
  const dueDays = Math.round((dueAt - Date.now()) / 86400000);
  const users = _cdmGetUsers();

  wrap.innerHTML = `
    <div style="border-bottom:1px solid var(--border-subtle); padding-bottom:14px; margin-bottom:14px;">
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
        ${overdue ? `<span class="cdm-chip cdm-chip-pulse" style="background:#dc2626; color:white; font-weight:700; padding:2px 8px; font-size:12px;">⏰ 已超时 ${Math.abs(dueDays)} 天</span>` : ''}
        <span class="cdm-chip" style="background:${pri.bg}; color:${pri.color}; font-weight:600; padding:2px 8px; font-size:12px;">${pri.label}</span>
        <span class="cdm-chip" style="background:${catDef.bg}; color:${catDef.color}; padding:2px 8px; font-size:12px;">${catDef.label}</span>
        <span class="cdm-chip" style="background:${status.bg}; color:${status.color}; padding:2px 8px; font-size:12px;">${status.label}</span>
        ${m.related_shop ? `<span class="cdm-chip" style="background:rgba(16,185,129,0.12); color:#047857; padding:2px 8px; font-size:12px;">🌐 ${escapeHtml(m.related_shop)}</span>` : ''}
        ${m.related_ref ? `<span class="cdm-chip" style="background:rgba(37,99,235,0.08); color:#2563eb; padding:2px 8px; font-size:12px; font-family:'JetBrains Mono',monospace;">${CDM_REL_TYPES[m.related_type] || '🔗'} ${escapeHtml(m.related_ref)}</span>` : ''}
      </div>
      <h2 style="font-size:18px; font-weight:600; margin:0 0 10px; color:var(--text-primary);">${escapeHtml(m.title || '')}</h2>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-secondary); flex-wrap:wrap; gap:8px;">
        <span><b>${escapeHtml(m.from_user_name || m.from_user_id || '')}</b> · <span style="color:${fromSys.color};">${fromSys.label}</span> → <span style="color:${toSys.color};">${toSys.label}</span></span>
        <span style="font-family:'JetBrains Mono',monospace;">${dt.toLocaleString()}${!overdue && m.status !== 'done' && m.status !== 'cancelled' ? ` · 截止 ${new Date(dueAt).toLocaleDateString()} (${dueDays <= 0 ? '今天' : `还剩 ${dueDays} 天`})` : ''}</span>
      </div>
      ${m.assigned_to_name ? `<div style="margin-top:10px; padding:8px 12px; background:rgba(37,99,235,0.08); border-radius:6px; font-size:12.5px; color:#1e40af;">📌 已分派给 <b>${escapeHtml(m.assigned_to_name)}</b> · 由 ${escapeHtml(m.assigned_by_name || '')} · ${m.assigned_at_ms ? new Date(m.assigned_at_ms).toLocaleString() : ''}</div>` : ''}
    </div>

    ${m.body ? `<div style="background:var(--bg-elevated); padding:12px 14px; border-radius:6px; margin-bottom:14px; font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.body)}</div>` : ''}

    ${canAssign ? `
      <div style="background:rgba(37,99,235,0.04); border:1px solid rgba(37,99,235,0.2); border-radius:6px; padding:10px 12px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:600; color:#1e40af;">📌 工单分派(主管功能)</span>
          <button class="btn small" onclick="cdmToggleAssignPicker()">${m.assigned_to_id ? '↻ 重新分派' : '➕ 分派给手下'}</button>
        </div>
        <div id="cdmAssignPicker" style="display:none; margin-top:8px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:6px;">
            ${users.map(u => `<button class="btn small" onclick="cdmAssignTo('${m.id}', '${u.id}', '${escapeHtml(u.shortName || u.name).replace(/'/g, "\\'")}')" style="${m.assigned_to_id === u.id ? 'background:#2563eb; color:white;' : ''}">👤 ${escapeHtml(u.shortName || u.name)}</button>`).join('')}
          </div>
        </div>
      </div>` : ''}

    ${(canAssign || (Array.isArray(m.watchers) && m.watchers.length > 0)) ? (() => {
      const watchers = Array.isArray(m.watchers) ? m.watchers : [];
      const availableUsers = users.filter(u => !watchers.includes(u.id) && u.id !== m.assigned_to_id);
      return `
      <div style="background:rgba(124,58,237,0.04); border:1px solid rgba(124,58,237,0.2); border-radius:6px; padding:10px 12px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:600; color:#5b21b6;">
            👁 关注人(${watchers.length})· 收件箱也能看到 · 完成时一起通知
          </span>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:${canAssign ? '10px' : '0'};">
          ${watchers.length === 0 ? '<span style="font-size:11.5px; color:var(--text-tertiary); padding:4px 0;">还没人关注</span>' : watchers.map(wid => {
            const wname = _cdmLookupUserName(wid);
            return `<span class="cdm-watcher-existing">
              👁 ${escapeHtml(wname)}
              ${canAssign ? `<button onclick="cdmToggleWatcher('${m.id}', '${escapeHtml(wid).replace(/'/g, "\\'")}', '${escapeHtml(wname).replace(/'/g, "\\'")}')" title="取消关注" class="cdm-watcher-x">✕</button>` : ''}
            </span>`;
          }).join('')}
        </div>
        ${canAssign && availableUsers.length > 0 ? `
          <div style="font-size:11.5px; color:var(--text-tertiary); margin-bottom:4px;">+ 添加本部门关注人:</div>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            ${availableUsers.map(u => `<button class="btn small" onclick="cdmToggleWatcher('${m.id}', '${u.id}', '${escapeHtml(u.shortName || u.name).replace(/'/g, "\\'")}')">+ ${escapeHtml(u.shortName || u.name)}</button>`).join('')}
          </div>` : ''}
      </div>`;
    })() : ''}

    ${canChangeStatus ? `
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px; padding:10px 12px; background:var(--bg-elevated); border-radius:6px;">
        <span style="font-size:12px; font-weight:500; color:var(--text-secondary); margin-right:4px;">改状态:</span>
        ${Object.entries(CDM_STATUSES).map(([k, v]) => `<button class="btn small" onclick="cdmChangeStatus('${m.id}', '${k}')" style="${m.status===k?`background:${v.bg}; color:${v.color}; font-weight:600; border:1px solid ${v.color};`:''}">${v.label}</button>`).join('')}
      </div>` : ''}

    <div style="margin-bottom:14px;">
      <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">💬 沟通线程 (${thread.length})</div>
      ${thread.length === 0 ? '<div style="color:var(--text-tertiary); font-size:12px; padding:10px 12px; background:var(--bg-elevated); border-radius:6px;">还没有回复 · 在下方输入第一条</div>' : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${thread.map(t => {
            const tSys = CDM_SYSTEMS[t.system] || { label: t.system, color: '#666' };
            const tDt = new Date(t.ts || 0);
            const isMyReply = (t.system === 'po' && t.user_id === me.id);
            return `<div style="background:${isMyReply ? 'rgba(37,99,235,0.05)' : 'var(--bg-card)'}; border:1px solid var(--border-subtle); border-left:3px solid ${tSys.color}; border-radius:6px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; flex-wrap:wrap; gap:6px;">
                  <span style="font-size:12px; font-weight:600;"><span style="color:${tSys.color};">${tSys.label}</span> · ${escapeHtml(t.user_name || t.user_id || '')}</span>
                  <span style="font-size:11px; color:var(--text-tertiary); font-family:'JetBrains Mono',monospace;">${tDt.toLocaleString()}</span>
                </div>
                <div style="font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; color:var(--text-primary);">${escapeHtml(t.content || '')}</div>
              </div>`;
          }).join('')}
        </div>`}
    </div>

    <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
      <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">✍ 回复</div>
      <textarea id="cdmReplyText" placeholder="输入回复内容,支持换行..." rows="3" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); resize:vertical; font-family:inherit;"></textarea>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
        <button class="btn primary" onclick="cdmSubmitReply('${m.id}')">📤 发送回复</button>
      </div>
    </div>
  `;
}

function cdmToggleAssignPicker() {
  const p = document.getElementById('cdmAssignPicker');
  if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

async function cdmAssignTo(msgId, userId, userName) {
  const me = _cdmGetCurrentUser();
  const m = CDM_MESSAGES.find(x => x.id === msgId);
  if (!m) return;
  try {
    const { data: cur } = await cdmClient.from('cross_dept_messages').select('thread').eq('id', msgId).maybeSingle();
    const newThread = [...((cur && cur.thread) || []), {
      user_id: me.id, user_name: me.name, system: 'po',
      content: `📌 分派给「${userName}」处理`, ts: Date.now(),
    }];
    const { error } = await cdmClient.from('cross_dept_messages').update({
      assigned_to_id: userId, assigned_to_name: userName,
      assigned_by_id: me.id, assigned_by_name: me.name,
      assigned_at_ms: Date.now(),
      status: 'in_progress',
      thread: newThread,
      updated_at: new Date().toISOString(),
    }).eq('id', msgId);
    if (error) throw error;
    Object.assign(m, { assigned_to_id: userId, assigned_to_name: userName, assigned_by_id: me.id, assigned_by_name: me.name, assigned_at_ms: Date.now(), status: 'in_progress', thread: newThread });
    cdmRenderDetail(m); cdmRender();
    toast(`✓ 已分派给 ${userName}`);
  } catch (e) { console.error('[CDM] 分派失败:', e); toast('分派失败:' + (e.message || e), 'err'); }
}

// v22-CW 补丁:添加/取消 watcher · 主管在详情里操作
async function cdmToggleWatcher(msgId, userId, userName) {
  const me = _cdmGetCurrentUser();
  const m = CDM_MESSAGES.find(x => x.id === msgId);
  if (!m) return;
  const current = Array.isArray(m.watchers) ? [...m.watchers] : [];
  const isWatching = current.includes(userId);
  const next = isWatching ? current.filter(x => x !== userId) : [...current, userId];
  const action = isWatching ? '取消关注' : '设为关注人';
  try {
    const { data: cur } = await cdmClient.from('cross_dept_messages').select('thread').eq('id', msgId).maybeSingle();
    const newThread = [...((cur && cur.thread) || []), {
      user_id: me.id, user_name: me.name, system: 'po',
      content: `👁 ${action}「${userName || userId}」`, ts: Date.now(),
    }];
    const { error } = await cdmClient.from('cross_dept_messages').update({
      watchers: next, thread: newThread, updated_at: new Date().toISOString(),
    }).eq('id', msgId);
    if (error) throw error;
    m.watchers = next;
    m.thread = newThread;
    cdmRenderDetail(m); cdmRender();
    toast(`✓ ${action}成功`);
  } catch (e) { console.error('[CDM] watcher 切换失败:', e); toast('操作失败:' + (e.message || e), 'err'); }
}

async function cdmSubmitReply(id) {
  const me = _cdmGetCurrentUser();
  const ta = document.getElementById('cdmReplyText');
  const text = (ta?.value || '').trim();
  if (!text) { toast('请输入回复内容', 'err'); return; }
  const m = CDM_MESSAGES.find(x => x.id === id);
  if (!m) { toast('消息已不存在', 'err'); return; }
  const thread = Array.isArray(m.thread) ? [...m.thread] : [];
  thread.push({ user_id: me.id, user_name: me.name, system: 'po', content: text, ts: Date.now() });
  try {
    const { error } = await cdmClient.from('cross_dept_messages').update({ thread, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    m.thread = thread;
    if (ta) ta.value = '';
    cdmRenderDetail(m); cdmRender();
    toast('✓ 回复已发送');
  } catch (e) { console.error('[CDM] 回复失败:', e); toast('回复失败:' + (e.message || e), 'err'); }
}

async function cdmChangeStatus(id, newStatus) {
  const me = _cdmGetCurrentUser();
  const m = CDM_MESSAGES.find(x => x.id === id);
  if (!m || m.status === newStatus) return;
  const completed = newStatus === 'done';
  const updates = { status: newStatus, updated_at: new Date().toISOString() };
  if (completed) {
    updates.completed_at_ms = Date.now();
    updates.completed_by_id = me.id;
    updates.completed_by_name = me.name;
  } else {
    updates.completed_at_ms = null; updates.completed_by_id = null; updates.completed_by_name = null;
  }
  try {
    const { error } = await cdmClient.from('cross_dept_messages').update(updates).eq('id', id);
    if (error) throw error;
    Object.assign(m, updates);
    cdmRenderDetail(m); cdmRender();
    toast(`✓ 状态:${(CDM_STATUSES[newStatus] || {}).label || newStatus}`);
    if (completed && CDM_NOTIFICATION_PERMISSION) {
      try { new Notification(`✅ 工单已完成:${m.title}`, { body: `由 ${me.name} 完成`, icon: '/favicon.ico' }); } catch (e) {}
    }
  } catch (e) { console.error('[CDM] 状态切换失败:', e); toast('状态切换失败:' + (e.message || e), 'err'); }
}

// ─────────────── Header 未读徽章 ───────────────
function cdmUpdateHeaderBadge() {
  const me = _cdmGetCurrentUser();
  const unread = CDM_MESSAGES.filter(m => m.to_system === 'po' && !(Array.isArray(m.read_by) ? m.read_by : []).includes(me.id)).length;
  const overdueCount = CDM_MESSAGES.filter(m => _cdmCanSee(m) && isOverdue(m)).length;
  const showCount = unread + overdueCount;
  const headerBadge = document.getElementById('cdmHeaderBadge');
  if (headerBadge) {
    headerBadge.textContent = showCount;
    headerBadge.style.display = showCount > 0 ? 'inline-flex' : 'none';
  }
  const tabBadge = document.getElementById('badgeCrossDept');
  if (tabBadge) {
    tabBadge.textContent = unread;
    tabBadge.classList.toggle('zero', unread === 0);
  }
}

// ─────────────── 店铺负责人管理 ───────────────
function cdmOpenShopOwnersManager() {
  if (!_cdmIsSupervisor()) { toast('需要主管/管理员权限', 'err'); return; }
  document.getElementById('cdmShopOwnersModal')?.classList.add('show');
  cdmRenderShopOwnersList();
}
function cdmCloseShopOwnersManager() { document.getElementById('cdmShopOwnersModal')?.classList.remove('show'); }

function cdmRenderShopOwnersList() {
  const body = document.getElementById('cdmShopOwnersBody');
  if (!body) return;
  const users = _cdmGetUsers();
  const userOpts = users.map(u => `<option value="${u.id}|${escapeHtml(u.shortName || u.name)}">${escapeHtml(u.name)}</option>`).join('');
  const roleOpts = Object.entries(CDM_OWNER_ROLES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  // 按 shop_name 分组
  const grouped = {};
  SHOP_OWNERS.forEach(o => { if (!grouped[o.shopName]) grouped[o.shopName] = []; grouped[o.shopName].push(o); });
  const shopNames = Object.keys(grouped).sort();

  body.innerHTML = `
    <div style="background:rgba(37,99,235,0.06); padding:12px 14px; border-radius:8px; margin-bottom:14px; font-size:12.5px; color:var(--text-secondary); border-left:3px solid var(--accent);">
      💡 维护本部门(<b style="color:#2563eb;">📋 跟单</b>)员工与网站的负责关系 · 三方共享 · 只能编辑本部门记录
    </div>
    <div style="background:var(--bg-elevated); padding:12px 14px; border-radius:8px; margin-bottom:18px;">
      <div style="font-weight:600; font-size:13px; margin-bottom:8px; color:var(--text-primary);">➕ 新增负责人 <span style="font-size:11px; color:var(--text-tertiary); font-weight:400;">· 网站从预设列表选(避免拼写不一致)</span></div>
      <div style="display:grid; grid-template-columns: 2fr 2fr 1fr 2fr auto; gap:8px; align-items:center;">
        <select id="cdmOwnerShopName" onchange="cdmOnOwnerShopChange()" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
          <option value="">— 选择网站 —</option>
          <optgroup label="📦 独立站">
            ${SHOPS_PRESET.filter(s => s.category === '独立站').map(s => `<option value="${escapeHtml(s.label)}">${escapeHtml(s.label)}</option>`).join('')}
          </optgroup>
          <optgroup label="🛒 平台">
            ${SHOPS_PRESET.filter(s => s.category === '平台').map(s => `<option value="${escapeHtml(s.label)}">${escapeHtml(s.label)}</option>`).join('')}
          </optgroup>
          <optgroup label="🏢 实体公司">
            ${SHOPS_PRESET.filter(s => s.category === '实体公司').map(s => `<option value="${escapeHtml(s.label)}">${escapeHtml(s.label)}</option>`).join('')}
          </optgroup>
          <option value="__other__">📝 其他(手填)</option>
        </select>
        <select id="cdmOwnerUser" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
          <option value="">-- 选员工 --</option>${userOpts}
        </select>
        <select id="cdmOwnerRole" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
          ${roleOpts}
        </select>
        <input id="cdmOwnerNotes" placeholder="备注(可选)" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
        <button class="btn primary" onclick="cdmSaveOwnerFromForm()">+ 添加</button>
      </div>
      <div id="cdmOwnerCustomShopWrap" style="display:none; margin-top:8px;">
        <input id="cdmOwnerCustomShopName" placeholder="输入网站名(选了「其他」时必填)" style="width:100%; padding:7px 10px; font-size:12.5px; border:1px solid #ea580c; border-radius:5px; background:rgba(234,88,12,0.05);">
        <div style="font-size:10.5px; color:var(--text-tertiary); margin-top:2px;">⚠ 自由填写的网站名会被独立看待 · 拼写不一致会导致系统当成不同网站</div>
      </div>
    </div>
    <div style="font-weight:600; font-size:13px; margin-bottom:8px; color:var(--text-primary);">现有负责人 (按网站分组)</div>
    ${shopNames.length === 0 ? '<div style="text-align:center; padding:40px 20px; color:var(--text-tertiary); font-size:13px;">还没有任何记录 · 用上面的表单添加</div>' : shopNames.map(shop => `
      <div style="border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:10px; overflow:hidden;">
        <div style="background:var(--bg-elevated); padding:8px 12px; font-weight:600; font-size:13px;">🌐 ${escapeHtml(shop)}</div>
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead>
            <tr style="background:var(--bg-card);">
              <th style="text-align:left; padding:6px 12px; font-weight:500; color:var(--text-secondary); font-size:11.5px;">部门</th>
              <th style="text-align:left; padding:6px; font-weight:500; color:var(--text-secondary); font-size:11.5px;">负责人</th>
              <th style="text-align:left; padding:6px; font-weight:500; color:var(--text-secondary); font-size:11.5px;">角色</th>
              <th style="text-align:left; padding:6px; font-weight:500; color:var(--text-secondary); font-size:11.5px;">备注</th>
              <th style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>
            ${grouped[shop].sort((a, b) => (a.system||'').localeCompare(b.system||'')).map(o => {
              const sys = CDM_SYSTEMS[o.system] || { label: o.system, color: '#666' };
              const role = CDM_OWNER_ROLES[o.role] || { label: o.role, color: '#666' };
              const isMine = o.system === 'po';
              return `<tr style="border-top:1px solid var(--border-subtle);">
                <td style="padding:7px 12px;"><span style="color:${sys.color}; font-weight:500;">${sys.label}</span></td>
                <td style="padding:7px;">${escapeHtml(o.userName || o.userId || '')}</td>
                <td style="padding:7px;"><span style="background:rgba(0,0,0,0.04); color:${role.color}; padding:1px 7px; border-radius:3px; font-size:11px; font-weight:500;">${role.label}</span></td>
                <td style="padding:7px; color:var(--text-tertiary); font-size:11.5px;">${escapeHtml(o.notes || '—')}</td>
                <td style="padding:7px; text-align:right;">${isMine ? `<button class="btn small" onclick="cdmDeleteOwner('${o.id}')" style="color:var(--danger);">✕</button>` : `<span style="color:var(--text-tertiary); font-size:11px;">(其他部门)</span>`}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  `;
}

// V22-CY: 切换网站下拉显示/隐藏"其他"手填输入框
function cdmOnOwnerShopChange() {
  const sel = document.getElementById('cdmOwnerShopName');
  const wrap = document.getElementById('cdmOwnerCustomShopWrap');
  if (!sel || !wrap) return;
  wrap.style.display = (sel.value === '__other__') ? 'block' : 'none';
}

async function cdmSaveOwnerFromForm() {
  const shopVal = document.getElementById('cdmOwnerShopName').value;
  let shopName = shopVal;
  // V22-CY: "其他"选项时用手填字段
  if (shopVal === '__other__') {
    const custom = (document.getElementById('cdmOwnerCustomShopName').value || '').trim();
    if (!custom) { toast('选了「其他」请填写网站名', 'err'); return; }
    shopName = custom;
  } else if (!shopName) {
    toast('请选择网站', 'err'); return;
  }
  const userVal = document.getElementById('cdmOwnerUser').value;
  const role = document.getElementById('cdmOwnerRole').value;
  const notes = document.getElementById('cdmOwnerNotes').value.trim();
  if (!userVal) { toast('请选员工', 'err'); return; }
  const [userId, userName] = userVal.split('|');
  const row = {
    id: crypto.randomUUID(),
    shop_name: shopName,
    system: 'po',  // 锁定本部门
    user_id: userId,
    user_name: userName,
    role: role || 'primary',
    notes: notes || null,
    created_at_ms: Date.now(),
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await cdmClient.from('shop_owners').upsert(row);
    if (error) throw error;
    toast('✓ 已添加');
    document.getElementById('cdmOwnerShopName').value = '';
    document.getElementById('cdmOwnerCustomShopName').value = '';
    document.getElementById('cdmOwnerCustomShopWrap').style.display = 'none';
    document.getElementById('cdmOwnerUser').value = '';
    document.getElementById('cdmOwnerNotes').value = '';
    await cdmLoadShopOwners();
    cdmRenderShopOwnersList();
    cdmRenderAdminButtons();
  } catch (e) { console.error('[CDM] 保存失败:', e); toast('保存失败:' + (e.message || e), 'err'); }
}
async function cdmDeleteOwner(id) {
  const owner = SHOP_OWNERS.find(o => o.id === id);
  if (!owner) return;
  if (owner.system !== 'po') { toast('只能删本部门的记录', 'err'); return; }
  if (!confirm(`确认删除「${owner.shopName} · ${owner.userName}」?`)) return;
  try {
    const { error } = await cdmClient.from('shop_owners').delete().eq('id', id);
    if (error) throw error;
    toast('✓ 已删除');
    await cdmLoadShopOwners();
    cdmRenderShopOwnersList();
    cdmRenderAdminButtons();
  } catch (e) { toast('删除失败:' + (e.message || e), 'err'); }
}

// ─────────────── 超时阈值设置 ───────────────
function cdmOpenTimeoutSettings() {
  if (!_cdmIsSupervisor()) { toast('需要主管/管理员权限', 'err'); return; }
  _CDM_TIMEOUT_DRAFT = JSON.parse(JSON.stringify(CDM_TIMEOUT_CONFIG || {}));
  document.getElementById('cdmTimeoutModal')?.classList.add('show');
  cdmRenderTimeoutSettings();
}
function cdmCloseTimeoutSettings() { document.getElementById('cdmTimeoutModal')?.classList.remove('show'); _CDM_TIMEOUT_DRAFT = null; }
function cdmSwitchTimeoutCategory(catId) { _CDM_TIMEOUT_ACTIVE_CAT = catId; cdmRenderTimeoutSettings(); }

function cdmRenderTimeoutSettings() {
  const body = document.getElementById('cdmTimeoutBody');
  if (!body) return;
  const activeCat = getCategoryDef(_CDM_TIMEOUT_ACTIVE_CAT);
  const draftPo = (_CDM_TIMEOUT_DRAFT && _CDM_TIMEOUT_DRAFT.po) || {};
  const draftCat = draftPo[activeCat.id] || {};

  body.innerHTML = `
    <div style="background:rgba(180,83,9,0.08); padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:12px; color:#92400e; border-left:3px solid #b45309;">
      💡 设置本部门(<b>📋 跟单</b>)每个分类+优先级的超时天数 · 留空 = 用默认值 · 三方共享配置但只能改本部门
    </div>

    <!-- 分类 tab -->
    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle);">
      ${CDM_CATEGORIES.map(c => `
        <button class="btn small" onclick="cdmSwitchTimeoutCategory('${c.id}')" style="${_CDM_TIMEOUT_ACTIVE_CAT === c.id ? `background:${c.bg}; color:${c.color}; font-weight:700; border:1px solid ${c.color};` : ''}">${c.label}</button>
      `).join('')}
    </div>

    <!-- 当前分类的 4 个优先级 -->
    <div style="background:var(--bg-elevated); padding:14px 16px; border-radius:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-size:15px; font-weight:600; color:${activeCat.color};">${activeCat.label}</div>
          <div style="font-size:11.5px; color:var(--text-tertiary); margin-top:2px;">${activeCat.desc}</div>
        </div>
        <button class="btn small" onclick="cdmResetTimeoutCategory()">⟲ 恢复此分类默认</button>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        ${['urgent','high','normal','low'].map(p => {
          const pri = CDM_PRIORITIES[p];
          const def = activeCat.defaultTimeout[p];
          const cur = (typeof draftCat[p] === 'number') ? draftCat[p] : '';
          const isCustom = (typeof draftCat[p] === 'number' && draftCat[p] !== def);
          return `<div style="background:var(--bg-card); padding:10px 12px; border-radius:6px; border:1px solid ${isCustom ? pri.color : 'var(--border-subtle)'};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:13px; font-weight:600; color:${pri.color};">${pri.label}</span>
              <span style="font-size:11px; color:var(--text-tertiary);">${isCustom ? '(已自定义)' : `(默认 ${def} 天)`}</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <input type="number" min="1" max="365" value="${cur}" placeholder="默认 ${def}" 
                oninput="cdmUpdateTimeoutValue('${p}', this.value)"
                style="flex:1; padding:7px 10px; font-size:13px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card); color:var(--text-primary); font-family:'JetBrains Mono',monospace;">
              <span style="font-size:11.5px; color:var(--text-secondary);">天</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function cdmUpdateTimeoutValue(priority, val) {
  if (!_CDM_TIMEOUT_DRAFT) _CDM_TIMEOUT_DRAFT = {};
  if (!_CDM_TIMEOUT_DRAFT.po) _CDM_TIMEOUT_DRAFT.po = {};
  if (!_CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT]) _CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT] = {};
  const n = parseInt(val);
  if (val === '' || isNaN(n) || n <= 0) {
    delete _CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT][priority];
    if (Object.keys(_CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT]).length === 0) {
      delete _CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT];
    }
  } else {
    _CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT][priority] = Math.min(365, Math.max(1, n));
  }
  // 仅更新输入框右侧"已自定义"标签 - 不全刷以保焦点
  setTimeout(() => {
    const activeCat = getCategoryDef(_CDM_TIMEOUT_ACTIVE_CAT);
    const draftCat = (_CDM_TIMEOUT_DRAFT.po && _CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT]) || {};
    document.querySelectorAll('#cdmTimeoutBody input[type="number"]').forEach(inp => {
      const priKey = (inp.getAttribute('oninput').match(/'(\w+)'/) || [])[1];
      if (!priKey) return;
      const def = activeCat.defaultTimeout[priKey];
      const isCust = (typeof draftCat[priKey] === 'number' && draftCat[priKey] !== def);
      const box = inp.closest('div[style*="background:var(--bg-card)"]');
      if (box) {
        box.style.border = `1px solid ${isCust ? CDM_PRIORITIES[priKey].color : 'var(--border-subtle)'}`;
        const tag = box.querySelector('span:nth-child(2)');
        if (tag) tag.textContent = isCust ? '(已自定义)' : `(默认 ${def} 天)`;
      }
    });
  }, 0);
}
function cdmResetTimeoutCategory() {
  if (!_CDM_TIMEOUT_DRAFT || !_CDM_TIMEOUT_DRAFT.po) return;
  delete _CDM_TIMEOUT_DRAFT.po[_CDM_TIMEOUT_ACTIVE_CAT];
  cdmRenderTimeoutSettings();
}
function cdmResetAllTimeouts() {
  if (!confirm('确认恢复本部门所有分类的超时阈值到默认?')) return;
  if (!_CDM_TIMEOUT_DRAFT) _CDM_TIMEOUT_DRAFT = {};
  _CDM_TIMEOUT_DRAFT.po = {};
  cdmRenderTimeoutSettings();
}
async function cdmSaveTimeoutConfig() {
  if (!_CDM_TIMEOUT_DRAFT) return;
  try {
    // 先读最新,避免覆盖其他部门的配置
    const { data: cur } = await cdmClient.from('app_config').select('value').eq('key', 'cdm_timeout_config').maybeSingle();
    const merged = (cur && cur.value) || {};
    merged.po = (_CDM_TIMEOUT_DRAFT.po) || {};
    const { error } = await cdmClient.from('app_config').upsert({ key: 'cdm_timeout_config', value: merged });
    if (error) throw error;
    CDM_TIMEOUT_CONFIG = merged;
    toast('✓ 超时阈值已保存');
    cdmCloseTimeoutSettings();
    cdmRender();
  } catch (e) { console.error('[CDM] 保存超时配置失败:', e); toast('保存失败:' + (e.message || e), 'err'); }
}

// ─────────────── 启动时只拉未读数 + 开 Realtime ───────────────
async function cdmInitHeaderOnly() {
  try {
    const me = _cdmGetCurrentUser();
    if (!me.id || me.id === 'unknown') return;
    await Promise.all([cdmLoadShopOwners(), cdmLoadTimeoutConfig()]);
    const { data } = await cdmClient
      .from('cross_dept_messages').select('*')
      .or(`to_system.eq.po,and(from_system.eq.po,from_user_id.eq.${me.id})`)
      .order('created_at_ms', { ascending: false }).limit(500);
    CDM_MESSAGES = data || [];
    cdmUpdateHeaderBadge();
    cdmSubscribeRealtime();
    cdmRequestNotificationPermission();
  } catch (e) { console.warn('[CDM] init header 失败:', e); }
}

window.addEventListener('DOMContentLoaded', () => {
  let attempts = 0;
  const wait = setInterval(() => {
    if ((typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || attempts++ > 120) {
      clearInterval(wait);
      if (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) cdmInitHeaderOnly();
    }
  }, 500);
});

// 切到 tab 时填充选项 + 渲染管理员按钮
const _cdmOrigOnTabActivate = cdmOnTabActivate;
cdmOnTabActivate = function() {
  _cdmOrigOnTabActivate();
  cdmPopulateCategorySelects();
  cdmRenderAdminButtons();
};
