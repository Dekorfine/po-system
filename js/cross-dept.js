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

// ============================================================================
// V28g (v5):共享人员目录 org_directory · 三系统(design/cs/po)互相能选具体人
// ============================================================================
let CDM_ORG_DIRECTORY = [];  // 缓存全量共享目录

// 读共享目录(用 cdmClient · org_directory 在 MessageBus 库)
async function cdmLoadOrgDirectory() {
  try {
    const { data, error } = await cdmClient
      .from('org_directory')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    CDM_ORG_DIRECTORY = (data || []).map(r => ({
      id: r.id, staffId: r.staff_id,
      name: r.name,
      // V28ν:接收三系统共享的中英名
      chineseName: r.chinese_name || '',
      englishName: r.english_name || '',
      displayName: r.display_name || r.name,
      system: r.system,
      role: r.role, department: r.department, active: r.active !== false,
      sortOrder: r.sort_order || 0,
    }));
    return CDM_ORG_DIRECTORY;
  } catch (e) {
    console.warn('[CDM] 读共享目录失败(org_directory 表存在吗?):', e.message);
    CDM_ORG_DIRECTORY = [];
    return [];
  }
}

// 发布本系统(跟单 po)人员到共享目录
async function cdmPublishMyStaff(updatedBy) {
  try {
    const agents = (typeof CONFIG !== 'undefined' && Array.isArray(CONFIG.agents)) ? CONFIG.agents : [];
    if (agents.length === 0) return 0;
    const rows = agents.map((a, i) => {
      // 角色:老板 > 管理员 > 跟单专员
      const role = a.isBoss ? '老板' : a.isAdmin ? '跟单主管' : '跟单专员';
      // staff_id 用 _userId(稳定 · 不变)
      const staffId = a._userId || a.name;
      // V28ν:中英名 + display_name(三系统统一格式)
      const en = a.englishName || a.name;
      const cn = a.chineseName || '';
      const displayName = (en && cn && en !== cn) ? `${en}(${cn})` : (en || cn || a.name);
      return {
        id: `po_${staffId}`,
        staff_id: staffId,
        name: a.name,
        chinese_name: cn,
        english_name: en,
        display_name: displayName,
        system: 'po',
        role: role,
        department: '跟单部',
        active: a.active !== false,
        sort_order: i,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || 'system',
      };
    });
    const { error } = await cdmClient
      .from('org_directory')
      .upsert(rows, { onConflict: 'id' });
    // V28ξ:列不存在自动降级(跟美工 v22-GJ 同款容错)
    // 如果 chinese_name / english_name / display_name 列没加(SQL 还没跑) · PostgREST 会报错
    // 摘掉这 3 列重试 · 让老 schema 也能写入
    if (error) {
      const msg = (error.message || '').toLowerCase();
      const colMissing = msg.includes('chinese_name') || msg.includes('english_name') || msg.includes('display_name') || msg.includes("could not find the");
      if (colMissing) {
        console.warn('[CDM] org_directory 列不齐 · 降级写入(无双显名)');
        const fallbackRows = rows.map(r => {
          const { chinese_name, english_name, display_name, ...rest } = r;
          return rest;
        });
        const { error: e2 } = await cdmClient
          .from('org_directory')
          .upsert(fallbackRows, { onConflict: 'id' });
        if (e2) throw e2;
        console.log(`[CDM] 已发布 ${fallbackRows.length} 个跟单人员(降级模式 · 跑 SQL 加列后可拿到双显名)`);
        return fallbackRows.length;
      }
      throw error;
    }
    console.log(`[CDM] 已发布 ${rows.length} 个跟单人员到共享目录(含中英名)`);
    return rows.length;
  } catch (e) {
    console.warn('[CDM] 发布人员失败:', e.message, e);
    return -1;
  }
}

// 取某部门的接收人候选(system==目标 && active)
function cdmGetRecipientOptions(targetSystem) {
  return CDM_ORG_DIRECTORY
    .filter(p => p.system === targetSystem && p.active)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

// 显示"谁在处理"
function cdmRenderAssignee(msg) {
  if (!msg.to_user_id) return '📢 整个部门';
  const person = CDM_ORG_DIRECTORY.find(p => p.staffId === msg.to_user_id && p.system === msg.to_system);
  if (person) {
    // V28ν:优先用 displayName(三系统统一)
    const shown = person.displayName || person.name;
    return `👤 ${shown}${person.role ? '(' + person.role + ')' : ''}`;
  }
  return `👤 ${msg.to_user_name || msg.to_user_id}`;
}
window.cdmLoadOrgDirectory = cdmLoadOrgDirectory;
window.cdmPublishMyStaff = cdmPublishMyStaff;

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
  // 通用
  primary:   { label: '主负责',   color: '#2563eb', icon: '⭐' },
  backup:    { label: '备援',     color: '#0891b2', icon: '🛟' },
  manager:   { label: '经理',     color: '#7c3aed', icon: '👔' },
  // V20260526m: 跟单部门专属 6 角色(对齐项目文档规范)
  finance:   { label: '财务对接', color: '#16a34a', icon: '💰', dept: 'po' },
  warehouse: { label: '仓库对接', color: '#ca8a04', icon: '📦', dept: 'po' },
  shipping:  { label: '物流对接', color: '#dc2626', icon: '🚚', dept: 'po' },
  // 美工部门角色(保留兼容)
  designer:  { label: '设计师',   color: '#ea580c', icon: '🎨', dept: 'design' },
  uploader:  { label: '视频上传', color: '#db2777', icon: '📹', dept: 'design' },
  // 客服部门角色
  night:     { label: '夜班',     color: '#475569', icon: '🌙', dept: 'cs' },
  escalation:{ label: '升级处理', color: '#dc2626', icon: '⚠', dept: 'cs' },
};

// V20260526m: 跟单部门派单 fallback 顺序(按文档定义)
const CDM_PO_FALLBACK = {
  primary:   ['primary', 'backup', 'manager'],
  finance:   ['finance', 'primary', 'backup'],
  warehouse: ['warehouse', 'primary', 'backup'],
  shipping:  ['shipping', 'primary', 'backup'],
  backup:    ['backup', 'primary', 'manager'],
  manager:   ['manager', 'primary'],
};

// 通用 findOwnerForShop · 按角色优先级 fallback 找负责人
function findOwnerForShop(shopName, primaryRole, fallbackRoles, system) {
  if (!Array.isArray(SHOP_OWNERS) || !shopName) return null;
  const sys = system || 'po';
  const candidates = SHOP_OWNERS.filter(o => o.shopName === shopName && o.system === sys);
  if (candidates.length === 0) return null;
  const allRoles = [primaryRole, ...(fallbackRoles || [])];
  for (let i = 0; i < allRoles.length; i++) {
    const found = candidates.find(c => c.role === allRoles[i]);
    if (found) return found;
  }
  return null;
}

// 跟单部门便捷封装 · 按文档规范的 fallback 链
function findPoOwnerForShop(shopName, role) {
  const chain = CDM_PO_FALLBACK[role] || [role, 'primary', 'backup'];
  return findOwnerForShop(shopName, chain[0], chain.slice(1), 'po');
}

window.findOwnerForShop = findOwnerForShop;
window.findPoOwnerForShop = findPoOwnerForShop;

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
let CDM_FILTERS = { search: '', status: '', priority: '', category: '', system: '', timeRange: 'all', datePreset: 'all' };
let CDM_PAGE = 1;
let CDM_PAGE_SIZE = 50;
let CDM_REALTIME_CHANNEL = null;
let CDM_INITIALIZED = false;
let CDM_NOTIFICATION_PERMISSION = false;
let CDM_CURRENT_DETAIL_ID = null;
let _CDM_TIMEOUT_DRAFT = null;       // 超时设置弹窗草稿
let _CDM_TIMEOUT_ACTIVE_CAT = 'product_fix';
let _CDM_NEW_WATCHERS = [];          // v22-CW 补丁: 新建消息时勾选的 watcher user_id 列表

// V20260601-perf:列表查询只拉轻量字段 · 不拉 attachments(图)/thread(沟通)大字段
// 详情打开时再单独拉。三系统(客服/跟单/美工)统一规范
// V20260601-fix:跟单表可能没有 completed_* / payload(美工新加),用核心字段(保证三系统都有)
const CDM_LIST_COLS = 'id,from_system,from_user_id,from_user_name,to_system,to_user_id,to_user_name,category,priority,title,body,related_ref,related_type,related_shop,assigned_to_id,assigned_to_name,assigned_by_id,assigned_by_name,assigned_at_ms,watchers,status,read_by,created_at_ms,updated_at';

// 列表查询的统一辅助函数 · 字段缺失自动降级
async function _cdmQueryList(query) {
  const r = await query.select(CDM_LIST_COLS);
  if (r.error) {
    console.warn('[CDM] 轻量字段查询失败 · 降级到 *', r.error.message);
    return await query.select('*');
  }
  return r;
}

// 把 realtime 推送的整行 row 瘦身成轻量版(去掉 attachments / thread 大字段)
function _cdmTrimRow(row) {
  if (!row) return row;
  const { attachments, thread, ...trimmed } = row;
  // 保留计数提示(老代码可能依赖判空)
  trimmed.attachments = Array.isArray(attachments) ? [] : (attachments == null ? null : []);
  trimmed.thread = Array.isArray(thread) ? [] : (thread == null ? null : []);
  trimmed._lite = true;  // 标记:大字段未加载 · 详情时按需取
  return trimmed;
}

// V20260531-img:全局图片三重判断 + 大图预览(z-index 高于 cdm modal)· 与客服侧规范对齐
window.cdmIsImage = function(a) {
  if (!a) return false;
  const mime = a.mime || a.mimeType || a.type || a.content_type || a.contentType || '';
  if (mime.startsWith && mime.startsWith('image/')) return true;
  const dataUrl = a.dataUrl || '';
  if (/^data:image\//i.test(dataUrl)) return true;
  const u = a.url || a.publicUrl || a.dataUrl || a.name || '';
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(String(u).toLowerCase());
};

window.cdmPreviewImage = function(url) {
  if (!url) return;
  // 移除可能已存在的预览层
  document.getElementById('cdmImgPreviewLayer')?.remove();
  const layer = document.createElement('div');
  layer.id = 'cdmImgPreviewLayer';
  layer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:100020;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
  layer.onclick = () => layer.remove();
  // ESC 关闭
  const onKey = (e) => { if (e.key === 'Escape') { layer.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  layer.innerHTML = `
    <button onclick="document.getElementById('cdmImgPreviewLayer').remove()" 
            style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px;line-height:1;z-index:1;">✕</button>
    <a href="${String(url).replace(/"/g,'&quot;')}" target="_blank" rel="noopener" download
       onclick="event.stopPropagation();"
       style="position:absolute;bottom:20px;right:20px;background:rgba(255,255,255,0.15);color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;z-index:1;">⬇ 下载</a>
    <img src="${String(url).replace(/"/g,'&quot;')}" 
         style="max-width:96%;max-height:96%;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.5);cursor:default;" 
         onclick="event.stopPropagation();">
  `;
  document.body.appendChild(layer);
};

// 从附件对象拿 URL(兼容 dataUrl / url / publicUrl / storage path)
window.cdmAttUrl = function(a) {
  if (!a) return '';
  if (a.dataUrl) return a.dataUrl;
  if (a.url) return a.url;
  if (a.publicUrl) return a.publicUrl;
  const p = a.path || a.storage_path;
  if (p && typeof cdmClient !== 'undefined') {
    try { return cdmClient.storage.from('attachments').getPublicUrl(p).data.publicUrl; } 
    catch (_) { return ''; }
  }
  return '';
};

// V20260531-ase:工单跳转到共享售后事件
window.cdmJumpToAftersalesEvent = function(aseId) {
  if (!aseId) return;
  // 1. 切到售后 tab(让 aftersales-shared 挂载点显示)
  if (typeof switchTab === 'function') switchTab('aftersales');
  // 2. 关闭工单详情(避免遮挡)
  if (typeof cdmCloseDetail === 'function') cdmCloseDetail();
  // 3. 等售后模块就绪后打开详情(可能 modal 已经加载或要等 ase 列表)
  let attempts = 0;
  const tryOpen = () => {
    if (typeof window.aseOpenDetail !== 'function') return false;
    window.aseOpenDetail(aseId);
    const aseRoot = document.getElementById('aseRoot');
    if (aseRoot) aseRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  };
  setTimeout(() => {
    if (tryOpen()) return;
    // 等模块就绪 · 最多 5 秒
    const t = setInterval(() => {
      if (tryOpen() || attempts++ > 10) clearInterval(t);
    }, 500);
  }, 400);
};

// ─────────────── 用户工具 ───────────────
function _cdmGetCurrentUser() {
  const me = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '';
  let userId = me, userName = me, shortName = me, displayName = me;
  if (typeof CONFIG !== 'undefined' && CONFIG && Array.isArray(CONFIG.agents)) {
    const a = CONFIG.agents.find(x => x.name === me || x._userId === (typeof CURRENT_USER_ID !== 'undefined' ? CURRENT_USER_ID : null));
    if (a) {
      // V28ν+:优先用 _userId(稳定 UUID) · 跨系统对齐
      userId = a._userId || a.alias || a.code || a.name || me;
      shortName = a.shortName || a.name;
      // V28ξ:写工单时用 displayName("Aylin(李雪玲)")· 跟美工 v22-GJ 对齐
      displayName = a.displayName || (a.englishName && a.chineseName && a.englishName !== a.chineseName 
        ? `${a.englishName}(${a.chineseName})` 
        : (a.englishName || a.chineseName || a.name));
      userName = displayName;  // ⭐ from_user_name / to_user_name / thread.user_name 都用这个
    }
  }
  const role = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN) ? 'admin' : 'normal';
  return { id: userId || 'unknown', name: userName || userId || '未知', shortName, displayName, role };
}
function _cdmGetUsers() {
  if (typeof CONFIG !== 'undefined' && CONFIG && Array.isArray(CONFIG.agents)) {
    return CONFIG.agents.filter(a => a.name).map(a => ({
      id: a._userId || a.alias || a.code || a.name,
      name: a.displayName || a.name,
      shortName: a.shortName || a.name,
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
      .from('cross_dept_messages').select(CDM_LIST_COLS)
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
    await Promise.all([cdmLoadShopOwners(), cdmLoadTimeoutConfig(), cdmLoadOrgDirectory()]);
    cdmSubscribeRealtime();
    CDM_INITIALIZED = true;
    // V28k2:进 tab 必发布跟单人员到共享目录(不卡 IS_ADMIN · 发布的是全员通讯录 · 无权限风险)
    const me = _cdmGetCurrentUser();
    cdmPublishMyStaff(me.name).then(n => {
      if (n > 0) {
        console.log(`[CDM] ✓ 已发布 ${n} 个跟单人员到共享目录`);
        cdmLoadOrgDirectory();  // 发布后刷新
      } else if (n < 0) {
        console.warn('[CDM] 发布跟单人员失败 · 见上方报错');
      }
    });
  }
  await cdmLoadMessages();
}
function cdmOnTabActivate() { cdmInit(); }

// V28k2:手动同步人员到共享目录(给个明确按钮 · 带 toast 反馈)
async function cdmManualPublishStaff() {
  const me = _cdmGetCurrentUser();
  toast('正在同步跟单人员到共享目录…', 'info', 1500);
  const n = await cdmPublishMyStaff(me.name);
  if (n > 0) {
    await cdmLoadOrgDirectory();
    toast(`✓ 已发布 ${n} 个跟单人员到共享目录 · 美工/客服现在能选到你们了`, 'success', 4000);
  } else if (n === 0) {
    toast('没有可发布的人员(CONFIG.agents 为空?)', 'warn');
  } else {
    toast('发布失败 · 见控制台报错 · 检查 org_directory 表权限', 'err', 5000);
  }
}
window.cdmManualPublishStaff = cdmManualPublishStaff;

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

  // V20260613:线下单工单(related_type='offline_transfer')变化 → 刷新线下单 tab + 角标(复用本订阅 · 不新增频道)
  // V20260622:offline_shipped(客服发货)也触发刷新,让"已发货"列即时更新
  if (row.to_system === 'po' && (row.related_type === 'offline_transfer' || row.related_type === 'offline_shipped') && typeof loadOfflineOrders === 'function') {
    loadOfflineOrders().then(() => {
      if (typeof OFFLINE !== 'undefined' && typeof CURRENT_TAB !== 'undefined' && CURRENT_TAB === 'offline' && typeof renderOfflineOrders === 'function') renderOfflineOrders();
      if (typeof updateBadges === 'function') updateBadges();
      if (payload.eventType === 'INSERT' && row.from_user_id !== me.id && typeof toast === 'function') {
        toast(row.related_type === 'offline_shipped' ? '📦 客服已发货一单' : '🧾 收到一条新的线下转单', 'ok', 3000);
      }
    }).catch(() => {});
  }
  const isRelevant = (row.to_system === 'po')
                  || (row.from_system === 'po' && row.from_user_id === me.id)
                  || (Array.isArray(row.watchers) && row.watchers.includes(me.id));
  if (!isRelevant) return;

  if (payload.eventType === 'INSERT') {
    // V20260601-perf:剥大字段 · 详情打开再按需拉
    const lite = _cdmTrimRow(payload.new);
    if (!CDM_MESSAGES.find(m => m.id === lite.id)) CDM_MESSAGES.unshift(lite);
    cdmRender(); cdmUpdateHeaderBadge();
    if (payload.new.to_system === 'po' && payload.new.from_user_id !== me.id) cdmShowNotification(payload.new);
  } else if (payload.eventType === 'UPDATE') {
    const lite = _cdmTrimRow(payload.new);
    const idx = CDM_MESSAGES.findIndex(m => m.id === lite.id);
    const oldRow = idx >= 0 ? CDM_MESSAGES[idx] : (payload.old || null);
    if (idx >= 0) CDM_MESSAGES[idx] = lite;
    else CDM_MESSAGES.unshift(lite);
    cdmRender(); cdmUpdateHeaderBadge();
    // 如果详情正打开 · 重新按需拉 attachments + thread(实时更新)
    if (CDM_CURRENT_DETAIL_ID === payload.new.id) {
      // 异步取大字段 · 不阻塞
      cdmFetchDetailFields(payload.new.id).then(extra => {
        const merged = { ...lite, ...extra, _lite: false };
        const i2 = CDM_MESSAGES.findIndex(m => m.id === lite.id);
        if (i2 >= 0) CDM_MESSAGES[i2] = merged;
        cdmRenderDetail(merged);
      });
    }
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
  // V20260526e: 通用日期 preset 筛选
  if (CDM_FILTERS.datePreset && CDM_FILTERS.datePreset !== 'all' && typeof isDateInRange === 'function') {
    list = list.filter(m => isDateInRange(m.created_at_ms || m.created_at, CDM_FILTERS.datePreset));
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
    // V20260526e: 填充日期筛选下拉(空状态也要)
    if (typeof populateDateFilterSelect === 'function') {
      const dateEl = document.getElementById('cdmDateFilter');
      if (dateEl) populateDateFilterSelect(dateEl, CDM_FILTERS.datePreset || 'all');
    }
    return;
  }
  container.innerHTML = pageList.map(m => cdmRenderCard(m)).join('');
  cdmRenderPagination(total, CDM_PAGE, totalPages);
  // V20260526e: 填充日期筛选下拉
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('cdmDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, CDM_FILTERS.datePreset || 'all');
  }
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

// V20260526e: 跨部门日期筛选(支持 custom_open)
function cdmOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        CDM_FILTERS.datePreset = customPreset;
        const el = document.getElementById('cdmDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        cdmRender();
      });
    }
    return;
  }
  CDM_FILTERS.datePreset = preset || 'all';
  CDM_PAGE = 1;
  cdmRender();
}
function cdmResetFilters() {
  CDM_FILTERS = { search: '', status: '', priority: '', category: '', system: '', timeRange: 'all', datePreset: 'all' };
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
    <button class="btn" onclick="cdmManualPublishStaff()" title="把跟单团队发布到共享人员目录 · 让美工/客服发工单时能选到你们">👥 同步人员到共享目录</button>
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
  _CDM_NEW_IMGS = [];      // V28m:重置图片附件
  if (typeof _cdmRenderNewImgs === 'function') _cdmRenderNewImgs();
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
function cdmCloseNewModal() { document.getElementById('cdmNewModal')?.classList.remove('show'); _CDM_NEW_IMGS = []; }

// ============================================================================
// V28m:发工单图片附件(标准结构 {url, name, mime} · 传 MessageBus 的 attachments 桶)
// ============================================================================
let _CDM_NEW_IMGS = [];  // [{url, name, mime, size}]

async function _cdmUploadImage(file) {
  // 压缩
  const compressed = await _cdmCompressImg(file);
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `po-requests/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await cdmClient.storage.from('attachments')
    .upload(path, compressed, { upsert: false, contentType: compressed.type || file.type });
  if (error) throw error;
  const { data: { publicUrl } } = cdmClient.storage.from('attachments').getPublicUrl(path);
  // 标准结构(美工/客服三方统一):url + name + mime + size
  return { url: publicUrl, name: file.name, mime: compressed.type || file.type || 'image/png', size: compressed.size || file.size };
}

function _cdmCompressImg(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        let { width, height } = img;
        if (width > max || height > max) {
          if (width > height) { height = height * max / width; width = max; }
          else { width = width * max / height; height = max; }
        }
        const cv = document.createElement('canvas');
        cv.width = width; cv.height = height;
        cv.getContext('2d').drawImage(img, 0, 0, width, height);
        cv.toBlob(b => resolve(b || file), 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function cdmNewPickImages(input) {
  const files = [...(input.files || [])];
  input.value = '';
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    await _cdmAddNewImg(f);
  }
}
window.cdmNewPickImages = cdmNewPickImages;

async function cdmNewPasteImage(e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      e.preventDefault();
      const f = it.getAsFile();
      if (f) await _cdmAddNewImg(f);
      return;
    }
  }
}
window.cdmNewPasteImage = cdmNewPasteImage;

async function _cdmAddNewImg(file) {
  const placeholder = { url: '', name: file.name, mime: 'uploading', _uploading: true };
  _CDM_NEW_IMGS.push(placeholder);
  _cdmRenderNewImgs();
  try {
    const att = await _cdmUploadImage(file);
    const idx = _CDM_NEW_IMGS.indexOf(placeholder);
    if (idx >= 0) _CDM_NEW_IMGS[idx] = att;
    toast('✓ 图片已上传', 'success', 1200);
  } catch (err) {
    const idx = _CDM_NEW_IMGS.indexOf(placeholder);
    if (idx >= 0) _CDM_NEW_IMGS.splice(idx, 1);
    toast('上传失败:' + (err.message || err), 'err', 4000);
  }
  _cdmRenderNewImgs();
}

function _cdmRenderNewImgs() {
  const el = document.getElementById('cdmNewImgList');
  if (!el) return;
  el.innerHTML = _CDM_NEW_IMGS.map((img, i) => img._uploading
    ? `<div style="width:60px;height:60px;border-radius:6px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:11px;">⏳</div>`
    : `<div style="position:relative;width:60px;height:60px;">
         <img src="${escapeHtml(img.url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;">
         <button onclick="cdmRemoveNewImg(${i})" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--danger);color:#fff;border:0;font-size:11px;cursor:pointer;line-height:1;">✕</button>
       </div>`
  ).join('');
}

function cdmRemoveNewImg(i) { _CDM_NEW_IMGS.splice(i, 1); _cdmRenderNewImgs(); }
window.cdmRemoveNewImg = cdmRemoveNewImg;

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
// V28g (v5):部门变化时 · 填充"指定接收人"下拉 + 原有逻辑
function cdmOnToSystemChange() {
  cdmPopulateRecipientDropdown();
  cdmUpdateSuggestedReceiver();
}
window.cdmOnToSystemChange = cdmOnToSystemChange;

// V28g (v5):选了具体接收人 · 高亮提示
function cdmOnToUserChange() {
  const sel = document.getElementById('cdmNewToUser');
  const hintEl = document.getElementById('cdmSuggestedReceiverHint');
  if (sel && sel.value && hintEl) {
    const opt = sel.options[sel.selectedIndex];
    hintEl.innerHTML = `<span style="font-size:12px; color:var(--success);">✓ 已指定 <b>${escapeHtml(opt.textContent.trim())}</b> 处理</span>`;
  }
}
window.cdmOnToUserChange = cdmOnToUserChange;

// V28g (v5):填充"指定接收人"下拉(从共享目录取目标部门的人)
function cdmPopulateRecipientDropdown() {
  const toSys = document.getElementById('cdmNewToSystem')?.value || '';
  const sel = document.getElementById('cdmNewToUser');
  if (!sel) return;
  const people = toSys ? cdmGetRecipientOptions(toSys) : [];
  sel.innerHTML = `<option value="">— 整个部门(不指定)—</option>` +
    people.map(p => `<option value="${escapeHtml(p.staffId)}" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.role ? ' · ' + escapeHtml(p.role) : ''}</option>`).join('');
  if (people.length === 0 && toSys) {
    sel.innerHTML += `<option value="" disabled>(该部门暂无共享人员 · 让对方主管同步)</option>`;
  }
}
window.cdmPopulateRecipientDropdown = cdmPopulateRecipientDropdown;

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
  
  // V28g (v5):手动指定的接收人优先(覆盖自动建议)
  const manualSel = document.getElementById('cdmNewToUser');
  if (manualSel && manualSel.value) {
    toUserId = manualSel.value;
    const opt = manualSel.options[manualSel.selectedIndex];
    toUserName = opt?.getAttribute('data-name') || opt?.textContent?.split('·')[0]?.trim() || toUserId;
  }

  // V28m:带上图片附件(过滤掉还在上传的)
  const attachments = _CDM_NEW_IMGS.filter(im => im.url && !im._uploading)
    .map(im => ({ url: im.url, name: im.name, mime: im.mime, size: im.size }));

  const row = {
    from_system: 'po', from_user_id: me.id, from_user_name: me.name,
    to_system: toSys, to_user_id: toUserId, to_user_name: toUserName,
    category: cat || 'general', priority: pri || 'normal',
    title, body: body || null,
    related_ref: relR || null, related_type: relT || null, related_shop: relShop || null,
    status: 'pending', thread: [], read_by: [me.id],
    watchers: [..._CDM_NEW_WATCHERS],   // v22-CW 补丁:跟单勾选的额外通知人
    attachments: attachments,            // V28m:标准结构 {url, name, mime, size}
    created_at_ms: Date.now(),
  };
  try {
    const { error } = await cdmClient.from('cross_dept_messages').insert(row);
    if (error) throw error;
    cdmCloseNewModal();
    const watcherCount = _CDM_NEW_WATCHERS.length;
    toast(`✓ 已发送给${(CDM_SYSTEMS[toSys] || {}).short || toSys}部${toUserName ? ` · 自动派给 ${toUserName}` : ''}${watcherCount > 0 ? ` · ${watcherCount} 人关注` : ''}`);
    _CDM_NEW_WATCHERS = [];
    _CDM_NEW_IMGS = [];   // V28m:清空已发送的图片
    await cdmLoadMessages();
  } catch (e) {
    console.error('[CDM] 发送失败:', e);
    toast('发送失败:' + (e.message || e), 'err');
  }
}

// V20260601-perf:按需拉详情大字段
// V20260601-fix2:用 select('*') 单条 · 字段不存在就是 undefined · 不报错
async function cdmFetchDetailFields(id) {
  try {
    const { data } = await cdmClient
      .from('cross_dept_messages')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return {
      attachments: Array.isArray(data?.attachments) ? data.attachments : [],
      thread: Array.isArray(data?.thread) ? data.thread : [],
      payload: data?.payload || null,
    };
  } catch (e) {
    console.warn('[CDM] 详情大字段加载失败', e.message);
    return { attachments: [], thread: [] };
  }
}

// ─────────────── 详情弹窗 ───────────────
async function cdmOpenDetail(id) {
  let m = CDM_MESSAGES.find(x => x.id === id);
  if (!m) {
    // 列表里没有 · 直接查全行(罕见 · 比如刚跳过来)
    try {
      const { data } = await cdmClient.from('cross_dept_messages').select('*').eq('id', id).single();
      if (data) {
        m = data;
        // 缓存轻量版到列表
        const lite = _cdmTrimRow(data);
        const idx = CDM_MESSAGES.findIndex(x => x.id === id);
        if (idx >= 0) CDM_MESSAGES[idx] = lite; else CDM_MESSAGES.unshift(lite);
      }
    } catch (e) {}
  } else if (m._lite) {
    // 列表里只有轻量版 · 按需拉大字段
    CDM_CURRENT_DETAIL_ID = id;
    cdmRenderDetail(m);  // 先用轻量版渲染骨架(显示 "加载附件...")
    document.getElementById('cdmDetailModal')?.classList.add('show');
    const extra = await cdmFetchDetailFields(id);
    Object.assign(m, extra, { _lite: false });
    cdmRenderDetail(m);  // 大字段到了 · 重新渲染
    
    // 标已读
    const me = _cdmGetCurrentUser();
    const readBy = Array.isArray(m.read_by) ? m.read_by : [];
    if (m.to_system === 'po' && !readBy.includes(me.id)) {
      const newReadBy = [...readBy, me.id];
      try {
        const { error } = await cdmClient.from('cross_dept_messages').update({ read_by: newReadBy }).eq('id', m.id);
        if (!error) { m.read_by = newReadBy; cdmRender(); cdmUpdateHeaderBadge(); }
      } catch (e) {}
    }
    return;
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
  // V20260531:打开新工单时清空上一次回复的附件草稿
  if (!window._cdmCurrentDetailId || window._cdmCurrentDetailId !== m.id) {
    _CDM_REPLY_ATTS = [];
    window._cdmCurrentDetailId = m.id;
  }
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
      ${(() => {
        // V20260531-ase:工单关联售后事件 · 显示跳转按钮
        // 兼容三种方式:① payload.aftersales_event_id ② related_type='aftersales_event' ③ payload 整体是 jsonb 含此字段
        let aseId = null;
        try {
          if (m.payload && typeof m.payload === 'object' && m.payload.aftersales_event_id) {
            aseId = m.payload.aftersales_event_id;
          } else if (m.related_type === 'aftersales_event' && m.related_ref) {
            aseId = m.related_ref;
          } else if (typeof m.payload === 'string') {
            const p = JSON.parse(m.payload);
            if (p && p.aftersales_event_id) aseId = p.aftersales_event_id;
          }
        } catch(_) {}
        if (!aseId) return '';
        return `
          <div style="margin:0 0 12px;padding:10px 14px;background:linear-gradient(90deg,#fef3c7,#fff);border:1.5px solid #fbbf24;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div style="font-size:12.5px;color:#92400e;">
              🔗 <b>本工单源于客户售后事件</b> · <code style="background:#fff;padding:1px 6px;border-radius:3px;font-size:11px;font-family:'JetBrains Mono',monospace;">${escapeHtml(String(aseId).slice(0,8))}...</code>
            </div>
            <button onclick="cdmJumpToAftersalesEvent('${escapeHtml(aseId)}')" style="padding:7px 16px;background:#f59e0b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12.5px;font-weight:700;white-space:nowrap;">
              📋 查看售后详情 →
            </button>
          </div>
        `;
      })()}
      ${m.status === 'done' && isMine ? (() => {
        // V28β:工单已完成 + 我是发起人 → 显眼按钮跳到附件区 + 给完成回复区
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        const lastReply = thread.length > 0 ? thread[thread.length - 1] : null;
        const completer = m.completed_by_name || (lastReply && lastReply.user_name) || '对方';
        const hasAtt = atts.length > 0;
        return `
        <div style="margin:10px 0; padding:12px 14px; background:linear-gradient(135deg,#ecfdf5,#d1fae5); border:1.5px solid #10b981; border-radius:8px; animation:confirmFadeIn 0.3s;">
          <div style="font-size:13.5px; font-weight:600; color:#065f46; margin-bottom:8px;">
            ✅ 工单已由 ${escapeHtml(completer)} 完成 · 请检查
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${hasAtt ? `<button class="btn primary" onclick="_cdmJumpToAttachments()" style="background:#10b981;">📎 查看附件(${atts.length})· 高亮显示</button>` : ''}
            <button class="btn" onclick="_cdmJumpToThread()" style="background:#fff; border:1px solid #10b981; color:#065f46;">💬 看沟通记录(${thread.length})</button>
            <button class="btn" onclick="_cdmReopenTicket('${m.id}')" style="background:#fff; border:1px solid #f59e0b; color:#92400e;">↩️ 不满意 · 退回重做</button>
          </div>
        </div>`;
      })() : ''}
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-secondary); flex-wrap:wrap; gap:8px;">
        <span><b>${escapeHtml(m.from_user_name || m.from_user_id || '')}</b> · <span style="color:${fromSys.color};">${fromSys.label}</span> → <span style="color:${toSys.color};">${toSys.label}</span>${m.to_user_id ? ` · <b style="color:${toSys.color};">${escapeHtml(cdmRenderAssignee(m))}</b>` : ' · 📢 整部门'}</span>
        <span style="font-family:'JetBrains Mono',monospace;">${dt.toLocaleString()}${!overdue && m.status !== 'done' && m.status !== 'cancelled' ? ` · 截止 ${new Date(dueAt).toLocaleDateString()} (${dueDays <= 0 ? '今天' : `还剩 ${dueDays} 天`})` : ''}</span>
      </div>
      ${m.assigned_to_name ? `<div style="margin-top:10px; padding:8px 12px; background:rgba(37,99,235,0.08); border-radius:6px; font-size:12.5px; color:#1e40af;">📌 已分派给 <b>${escapeHtml(m.assigned_to_name)}</b> · 由 ${escapeHtml(m.assigned_by_name || '')} · ${m.assigned_at_ms ? new Date(m.assigned_at_ms).toLocaleString() : ''}</div>` : ''}
    </div>

    ${m.body ? `<div style="background:var(--bg-elevated); padding:12px 14px; border-radius:6px; margin-bottom:14px; font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.body)}</div>` : ''}

    ${(() => {
      // V28m:渲染附件(多字段容错 · 跟美工 cdmAttUrl 对齐 · 能认 url/path/各种 mime)
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      if (atts.length === 0) return '';
      const attUrl = (a) => {
        if (typeof a === 'string') return a;
        const direct = a.url || a.dataUrl || a.src || a.href || a.publicUrl || a.public_url || a.downloadUrl;
        if (direct) return direct;
        const p = a.path || a.storage_path || a.key || a.file_path;
        if (p) { try { return cdmClient.storage.from('attachments').getPublicUrl(p).data.publicUrl; } catch (e) { return ''; } }
        return '';
      };
      const isImg = window.cdmIsImage;
      const cells = atts.map(a => {
        const u = attUrl(a);
        if (!u) return '';
        if (isImg(a)) {
          return `<div style="display:inline-block; position:relative; cursor:pointer;" onclick="cdmPreviewImage('${escapeHtml(u).replace(/'/g, '&#39;')}')">
            <img src="${escapeHtml(u)}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--border);display:block;"
                 onerror="this.outerHTML='<div style=\\'width:90px;height:90px;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-tertiary);text-align:center;\\'>⚠️ 图片<br>打不开</div>'">
          </div>`;
        }
        return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" style="font-size:12px; color:var(--accent);">📎 ${escapeHtml(a.name || '附件')}</a>`;
      }).join('');
      return `<div style="margin-bottom:14px;">
        <div style="font-size:12px; color:var(--text-tertiary); margin-bottom:6px;">📷 附件 (${atts.length})</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">${cells}</div>
      </div>`;
    })()}
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
            const tAtts = Array.isArray(t.attachments) ? t.attachments : [];
            return `<div style="background:${isMyReply ? 'rgba(37,99,235,0.05)' : 'var(--bg-card)'}; border:1px solid var(--border-subtle); border-left:3px solid ${tSys.color}; border-radius:6px; padding:10px 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; flex-wrap:wrap; gap:6px;">
                  <span style="font-size:12px; font-weight:600;"><span style="color:${tSys.color};">${tSys.label}</span> · ${escapeHtml(t.user_name || t.user_id || '')}</span>
                  <span style="font-size:11px; color:var(--text-tertiary); font-family:'JetBrains Mono',monospace;">${tDt.toLocaleString()}</span>
                </div>
                <div style="font-size:13px; line-height:1.5; white-space:pre-wrap; word-break:break-word; color:var(--text-primary);">${escapeHtml(t.content || '')}</div>
                ${tAtts.length > 0 ? `
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-subtle);">
                    ${tAtts.map(a => {
                      const u = cdmAttUrl(a);
                      if (!u) return '';
                      if (cdmIsImage(a)) {
                        return `<div style="cursor:pointer;" onclick="cdmPreviewImage('${escapeHtml(u).replace(/'/g,'&#39;')}')">
                          <img src="${escapeHtml(u)}" style="width:80px;height:80px;object-fit:cover;border-radius:5px;border:1px solid var(--border);display:block;"
                               onerror="this.outerHTML='<div style=\\'width:80px;height:80px;border-radius:5px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-tertiary);\\'>⚠️</div>'">
                        </div>`;
                      }
                      return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" style="font-size:11.5px;color:var(--accent);padding:4px 9px;background:var(--bg-elevated);border-radius:4px;text-decoration:none;">📎 ${escapeHtml(a.name || '附件')}</a>`;
                    }).join('')}
                  </div>
                ` : ''}
              </div>`;
          }).join('')}
        </div>`}
    </div>

    <div style="border-top:1px solid var(--border-subtle); padding-top:12px;">
      <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">✍ 回复</div>
      <textarea id="cdmReplyText" placeholder="输入回复内容,支持 Ctrl+V 粘贴截图..." rows="3"
        onpaste="cdmReplyPaste(event)"
        ondragover="event.preventDefault();this.style.background='var(--accent-soft)';"
        ondragleave="this.style.background='';"
        ondrop="event.preventDefault();this.style.background='';cdmReplyDrop(event)"
        style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); resize:vertical; font-family:inherit;"></textarea>
      
      <!-- 回复区附件预览 -->
      <div id="cdmReplyAttachments" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;"></div>
      
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px;">
        <label style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;">
          📎 加附件
          <input type="file" multiple accept="image/*,application/pdf" style="display:none;" onchange="cdmReplyPickFiles(this.files)">
        </label>
        <button class="btn primary" onclick="cdmSubmitReply('${m.id}')">📤 发送回复</button>
      </div>
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px;">💡 支持 Ctrl+V 粘贴截图 / 拖拽图片 / 点击 [📎 加附件]</div>
    </div>
  `;
}

// V28β:已完成工单 · 跳到附件区高亮 / 跳沟通 / 退回重做
window._cdmJumpToAttachments = function() {
  const wrap = document.getElementById('cdmDetailBody');
  if (!wrap) return;
  // 找附件区(里面有图片或下载链接)
  const blocks = wrap.querySelectorAll('div');
  for (const b of blocks) {
    if ((b.textContent || '').includes('📎 附件') || b.querySelector('img[onclick*="cdmPreview"]') || b.querySelector('a[download]')) {
      b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const orig = b.style.boxShadow;
      b.style.transition = 'box-shadow 0.3s';
      b.style.boxShadow = '0 0 0 3px #10b981';
      setTimeout(() => { b.style.boxShadow = orig; }, 2500);
      return;
    }
  }
  if (typeof toast === 'function') toast('未找到附件区', 'warn');
};
window._cdmJumpToThread = function() {
  const wrap = document.getElementById('cdmDetailBody');
  if (!wrap) return;
  const blocks = wrap.querySelectorAll('div');
  for (const b of blocks) {
    if ((b.textContent || '').includes('💬 沟通线程')) {
      b.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
};
window._cdmReopenTicket = async function(msgId) {
  const ok = await window.confirmDialog({
    title: '退回工单重做',
    message: '工单将退回到「处理中」状态,美工/客服会重新看到 · 你的回复内容会作为退回原因 · 确认?',
    okText: '退回',
    danger: true,
  });
  if (!ok) return;
  try {
    await sb.from('cross_dept_messages').update({ status: 'in_progress' }).eq('id', msgId);
    // 自动加一条 thread 说明退回
    const me = _cdmGetCurrentUser();
    const reason = document.getElementById('cdmReplyText')?.value?.trim() || '(未填写原因)';
    const tNote = {
      ts: Date.now(),
      system: 'po',
      user_id: me.id,
      user_name: me.shortName || me.name,
      content: `↩️ 跟单退回重做:${reason}`,
    };
    const m = CDM_MESSAGES.find(x => x.id === msgId);
    const thread = Array.isArray(m?.thread) ? [...m.thread, tNote] : [tNote];
    await sb.from('cross_dept_messages').update({ thread }).eq('id', msgId);
    if (typeof toast === 'function') toast('✓ 已退回重做', 'ok');
  } catch (e) {
    if (typeof toast === 'function') toast('退回失败:' + (e.message || e), 'err');
  }
};

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

// V20260531:回复框附件支持
let _CDM_REPLY_ATTS = [];

window.cdmReplyPaste = async function(e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      e.preventDefault();
      const f = it.getAsFile();
      if (f) await _cdmAddReplyAtt(f);
    }
  }
};

window.cdmReplyDrop = async function(e) {
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  for (const f of files) await _cdmAddReplyAtt(f);
};

window.cdmReplyPickFiles = async function(files) {
  if (!files || files.length === 0) return;
  for (const f of files) await _cdmAddReplyAtt(f);
};

async function _cdmAddReplyAtt(file) {
  if (file.size > 5 * 1024 * 1024) {
    toast('附件超 5MB · 请压缩后再传', 'err');
    return;
  }
  const placeholder = { url: '', name: file.name, mime: file.type || 'uploading', _uploading: true };
  _CDM_REPLY_ATTS.push(placeholder);
  _renderReplyAtts();
  try {
    const att = await _cdmUploadImage(file);
    const idx = _CDM_REPLY_ATTS.indexOf(placeholder);
    if (idx >= 0) _CDM_REPLY_ATTS[idx] = att;
    _renderReplyAtts();
  } catch (e) {
    const idx = _CDM_REPLY_ATTS.indexOf(placeholder);
    if (idx >= 0) _CDM_REPLY_ATTS.splice(idx, 1);
    _renderReplyAtts();
    toast('上传失败:' + (e.message || e), 'err');
  }
}

function _renderReplyAtts() {
  const box = document.getElementById('cdmReplyAttachments');
  if (!box) return;
  if (_CDM_REPLY_ATTS.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = _CDM_REPLY_ATTS.map((a, i) => {
    const u = cdmAttUrl(a);
    if (a._uploading) {
      return `<div style="width:60px;height:60px;border-radius:5px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-tertiary);">上传中</div>`;
    }
    const isImg = cdmIsImage(a);
    return `<div style="position:relative;display:inline-block;">
      ${isImg ? `<img src="${escapeHtml(u)}" style="width:60px;height:60px;object-fit:cover;border-radius:5px;border:1px solid var(--border);display:block;cursor:pointer;" onclick="cdmPreviewImage('${escapeHtml(u).replace(/'/g,'&#39;')}')">` : `<div style="width:60px;height:60px;border-radius:5px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-secondary);text-align:center;padding:4px;">📎<br>${escapeHtml((a.name||'文件').slice(0,8))}</div>`}
      <button onclick="cdmReplyRemoveAtt(${i})" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:11px;line-height:1;padding:0;">✕</button>
    </div>`;
  }).join('');
}

window.cdmReplyRemoveAtt = function(idx) {
  _CDM_REPLY_ATTS.splice(idx, 1);
  _renderReplyAtts();
};

async function cdmSubmitReply(id) {
  const me = _cdmGetCurrentUser();
  const ta = document.getElementById('cdmReplyText');
  const text = (ta?.value || '').trim();
  // V20260531:允许"只附件无文字"
  const atts = _CDM_REPLY_ATTS.filter(a => !a._uploading);
  if (!text && atts.length === 0) { toast('请输入回复内容或加附件', 'err'); return; }
  if (_CDM_REPLY_ATTS.some(a => a._uploading)) { toast('附件还在上传 · 稍等', 'err'); return; }
  const m = CDM_MESSAGES.find(x => x.id === id);
  if (!m) { toast('消息已不存在', 'err'); return; }
  const thread = Array.isArray(m.thread) ? [...m.thread] : [];
  const reply = { user_id: me.id, user_name: me.name, system: 'po', content: text, ts: Date.now() };
  if (atts.length > 0) reply.attachments = atts;
  thread.push(reply);
  try {
    const { error } = await cdmClient.from('cross_dept_messages').update({ thread, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    m.thread = thread;
    if (ta) ta.value = '';
    _CDM_REPLY_ATTS = [];
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
  // 按 shop_name 分组
  const grouped = {};
  SHOP_OWNERS.forEach(o => { if (!grouped[o.shopName]) grouped[o.shopName] = []; grouped[o.shopName].push(o); });
  const shopNames = Object.keys(grouped).sort();
  
  // V20260526m: 跟单部门可用角色(过滤出 dept='po' 或通用的 · 通用角色没 dept 字段)
  const poRoles = Object.entries(CDM_OWNER_ROLES).filter(([k, v]) => !v.dept || v.dept === 'po');
  
  body.innerHTML = `
    <div style="background:rgba(37,99,235,0.06); padding:12px 14px; border-radius:8px; margin-bottom:14px; font-size:12.5px; color:var(--text-secondary); border-left:3px solid var(--accent);">
      💡 维护本部门(<b style="color:#2563eb;">📋 跟单</b>)员工与网站的负责关系 · 三方共享 · 只能编辑本部门记录
    </div>
    
    <!-- V20260526m: N × M 矩阵批量添加 UI -->
    <div style="background:var(--bg-elevated); padding:14px 16px; border-radius:8px; margin-bottom:18px; border:1px solid var(--border-subtle);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
        <div style="font-weight:600; font-size:13.5px; color:var(--text-primary);">➕ 批量添加(矩阵式)<span style="font-size:11px; color:var(--text-tertiary); font-weight:400; margin-left:8px;">· 一次勾 N 网站 × M 人 = N×M 条记录</span></div>
        <button class="btn small ghost" onclick="cdmToggleSingleMode()" id="cdmSingleModeBtn" title="切换到单条添加模式">⇋ 单条模式</button>
      </div>
      
      <!-- 矩阵模式(默认) -->
      <div id="cdmMatrixForm">
        <!-- 步骤 1: 选网站(多选) -->
        <div style="margin-bottom:14px;">
          <div style="font-weight:600; font-size:12px; color:var(--text-secondary); margin-bottom:6px;">① 选网站 <span id="cdmMatrixShopCount" style="color:var(--accent); font-weight:700;">0</span> 个</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:6px;">
            ${SHOPS_PRESET.filter(s => s.id !== 'other').map(s => `
              <label style="display:flex; align-items:center; gap:6px; padding:6px 9px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:5px; cursor:pointer; font-size:12px;" 
                     onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-subtle)'">
                <input type="checkbox" class="cdm-matrix-shop" value="${escapeHtml(s.label)}" onchange="cdmUpdateMatrixCount()" style="cursor:pointer;">
                <span>${escapeHtml(s.label)}</span>
              </label>
            `).join('')}
            <label style="display:flex; align-items:center; gap:6px; padding:6px 9px; background:rgba(234,88,12,0.05); border:1px dashed #ea580c; border-radius:5px; cursor:pointer; font-size:12px;">
              <input type="checkbox" class="cdm-matrix-shop-other" onchange="cdmToggleMatrixOther(this)" style="cursor:pointer;">
              <span style="color:#ea580c;">📝 其他(手填)</span>
            </label>
          </div>
          <input id="cdmMatrixCustomShop" placeholder="多个手填网站用逗号分隔(例:Test1, Test2)" style="display:none; width:100%; margin-top:6px; padding:6px 10px; font-size:12px; border:1px solid #ea580c; border-radius:5px; background:rgba(234,88,12,0.04);">
        </div>
        
        <!-- 步骤 2: 选员工(多选) -->
        <div style="margin-bottom:14px;">
          <div style="font-weight:600; font-size:12px; color:var(--text-secondary); margin-bottom:6px;">② 选员工 <span id="cdmMatrixUserCount" style="color:var(--accent); font-weight:700;">0</span> 个</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:6px; max-height:180px; overflow-y:auto; padding:4px;">
            ${users.map(u => `
              <label style="display:flex; align-items:center; gap:6px; padding:6px 9px; background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:5px; cursor:pointer; font-size:12px;"
                     onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border-subtle)'">
                <input type="checkbox" class="cdm-matrix-user" value="${u.id}|${escapeHtml(u.shortName || u.name)}" onchange="cdmUpdateMatrixCount()" style="cursor:pointer;">
                <span>${escapeHtml(u.name)}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <!-- 步骤 3: 选角色(单选 · 一批次只能一种角色) -->
        <div style="margin-bottom:14px;">
          <div style="font-weight:600; font-size:12px; color:var(--text-secondary); margin-bottom:6px;">③ 选角色 <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">· 一次批量只能一种角色</span></div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${poRoles.map(([k, v], i) => `
              <label style="display:flex; align-items:center; gap:5px; padding:6px 12px; background:var(--bg-card); border:1.5px solid var(--border-subtle); border-radius:6px; cursor:pointer; font-size:12.5px;"
                     onmouseover="this.style.borderColor='${v.color}'" onmouseout="this.style.borderColor=this.querySelector('input').checked ? '${v.color}' : 'var(--border-subtle)'">
                <input type="radio" name="cdmMatrixRole" value="${k}" ${i === 0 ? 'checked' : ''} style="cursor:pointer;" onchange="this.closest('label').style.borderColor='${v.color}'; document.querySelectorAll('input[name=cdmMatrixRole]').forEach(r => { if (!r.checked) r.closest('label').style.borderColor='var(--border-subtle)'; });">
                <span>${v.icon || ''} <span style="color:${v.color}; font-weight:600;">${v.label}</span></span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <!-- 步骤 4: 备注 + 保存 -->
        <div style="display:flex; gap:10px; align-items:center;">
          <input id="cdmMatrixNotes" placeholder="备注(可选 · 对所有批量记录生效)" style="flex:1; padding:8px 12px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
          <button class="btn primary" onclick="cdmSaveMatrix()" id="cdmMatrixSaveBtn" style="padding:8px 16px; font-size:13px;">✓ 添加 <span id="cdmMatrixSavePreview">0</span> 条</button>
        </div>
      </div>
      
      <!-- 单条模式(隐藏 · 切换显示) -->
      <div id="cdmSingleForm" style="display:none;">
        <div style="display:grid; grid-template-columns: 2fr 2fr 1fr 2fr auto; gap:8px; align-items:center;">
          <select id="cdmOwnerShopName" onchange="cdmOnOwnerShopChange()" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
            <option value="">— 选择网站 —</option>
            ${SHOPS_PRESET.filter(s => s.id !== 'other').map(s => `<option value="${escapeHtml(s.label)}">${escapeHtml(s.label)}</option>`).join('')}
            <option value="__other__">📝 其他(手填)</option>
          </select>
          <select id="cdmOwnerUser" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
            <option value="">-- 选员工 --</option>${users.map(u => `<option value="${u.id}|${escapeHtml(u.shortName || u.name)}">${escapeHtml(u.name)}</option>`).join('')}
          </select>
          <select id="cdmOwnerRole" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
            ${poRoles.map(([k, v]) => `<option value="${k}">${v.icon || ''} ${v.label}</option>`).join('')}
          </select>
          <input id="cdmOwnerNotes" placeholder="备注(可选)" style="padding:7px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:5px; background:var(--bg-card);">
          <button class="btn primary" onclick="cdmSaveOwnerFromForm()">+ 添加</button>
        </div>
        <div id="cdmOwnerCustomShopWrap" style="display:none; margin-top:8px;">
          <input id="cdmOwnerCustomShopName" placeholder="输入网站名(选了「其他」时必填)" style="width:100%; padding:7px 10px; font-size:12.5px; border:1px solid #ea580c; border-radius:5px; background:rgba(234,88,12,0.05);">
        </div>
      </div>
    </div>
    
    <div style="font-weight:600; font-size:13px; margin-bottom:8px; color:var(--text-primary);">现有负责人 (按网站分组 · ${SHOP_OWNERS.length} 条记录)</div>
    ${shopNames.length === 0 ? '<div style="text-align:center; padding:40px 20px; color:var(--text-tertiary); font-size:13px;">还没有任何记录 · 用上面的表单添加</div>' : shopNames.map(shop => `
      <div style="border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:10px; overflow:hidden;">
        <div style="background:var(--bg-elevated); padding:8px 12px; font-weight:600; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
          <span>🌐 ${escapeHtml(shop)}</span>
          <span style="font-size:11px; color:var(--text-tertiary); font-weight:400;">${grouped[shop].length} 人</span>
        </div>
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
                <td style="padding:7px;"><span style="background:rgba(0,0,0,0.04); color:${role.color}; padding:1px 7px; border-radius:3px; font-size:11px; font-weight:500;">${role.icon || ''} ${role.label}</span></td>
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

// V20260526m: 矩阵模式相关函数
function cdmToggleSingleMode() {
  const matrix = document.getElementById('cdmMatrixForm');
  const single = document.getElementById('cdmSingleForm');
  const btn = document.getElementById('cdmSingleModeBtn');
  if (!matrix || !single || !btn) return;
  const isMatrix = matrix.style.display !== 'none';
  matrix.style.display = isMatrix ? 'none' : '';
  single.style.display = isMatrix ? '' : 'none';
  btn.textContent = isMatrix ? '⇋ 矩阵模式' : '⇋ 单条模式';
  btn.title = isMatrix ? '切换回矩阵批量添加' : '切换到单条精细添加';
}

function cdmToggleMatrixOther(cb) {
  const input = document.getElementById('cdmMatrixCustomShop');
  if (!input) return;
  input.style.display = cb.checked ? '' : 'none';
  cdmUpdateMatrixCount();
}

function cdmUpdateMatrixCount() {
  const shops = document.querySelectorAll('.cdm-matrix-shop:checked').length;
  const otherCb = document.querySelector('.cdm-matrix-shop-other');
  const otherInput = document.getElementById('cdmMatrixCustomShop');
  let otherCount = 0;
  if (otherCb && otherCb.checked && otherInput && otherInput.value.trim()) {
    otherCount = otherInput.value.split(',').map(s => s.trim()).filter(Boolean).length;
  }
  const totalShops = shops + otherCount;
  const users = document.querySelectorAll('.cdm-matrix-user:checked').length;
  const sc = document.getElementById('cdmMatrixShopCount');
  const uc = document.getElementById('cdmMatrixUserCount');
  const preview = document.getElementById('cdmMatrixSavePreview');
  if (sc) sc.textContent = totalShops;
  if (uc) uc.textContent = users;
  if (preview) preview.textContent = totalShops * users;
}

async function cdmSaveMatrix() {
  // 收集网站
  const shops = [];
  document.querySelectorAll('.cdm-matrix-shop:checked').forEach(cb => shops.push(cb.value));
  const otherCb = document.querySelector('.cdm-matrix-shop-other');
  if (otherCb && otherCb.checked) {
    const input = document.getElementById('cdmMatrixCustomShop');
    if (input && input.value.trim()) {
      input.value.split(',').map(s => s.trim()).filter(Boolean).forEach(s => shops.push(s));
    }
  }
  // 收集员工
  const users = [];
  document.querySelectorAll('.cdm-matrix-user:checked').forEach(cb => {
    const [id, name] = cb.value.split('|');
    users.push({ id, name });
  });
  // 角色
  const roleEl = document.querySelector('input[name="cdmMatrixRole"]:checked');
  const role = roleEl ? roleEl.value : 'primary';
  const notes = document.getElementById('cdmMatrixNotes').value.trim() || null;
  
  if (shops.length === 0) { toast('请至少选 1 个网站', 'err'); return; }
  if (users.length === 0) { toast('请至少选 1 个员工', 'err'); return; }
  
  // 生成 N × M 矩阵 · 去重
  const existingKeys = new Set(
    SHOP_OWNERS.filter(o => o.system === 'po').map(o => `${o.shopName}|${o.role}|${o.userId}`)
  );
  const rows = [];
  let skipped = 0;
  for (const shop of shops) {
    for (const user of users) {
      const key = `${shop}|${role}|${user.id}`;
      if (existingKeys.has(key)) { skipped++; continue; }
      rows.push({
        id: crypto.randomUUID(),
        shop_name: shop,
        system: 'po',
        user_id: user.id,
        user_name: user.name,
        role: role,
        notes: notes,
        created_at_ms: Date.now(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  
  if (rows.length === 0) {
    toast(`所有 ${shops.length * users.length} 条记录都已存在 · 跳过`, 'warn');
    return;
  }
  
  try {
    const btn = document.getElementById('cdmMatrixSaveBtn');
    if (btn) btn.disabled = true;
    const { error } = await cdmClient.from('shop_owners').upsert(rows);
    if (error) throw error;
    toast(`✓ 已添加 ${rows.length} 条${skipped > 0 ? ` · 跳过 ${skipped} 条重复` : ''}`);
    // 清空表单
    document.querySelectorAll('.cdm-matrix-shop:checked, .cdm-matrix-user:checked, .cdm-matrix-shop-other:checked').forEach(cb => cb.checked = false);
    const cs = document.getElementById('cdmMatrixCustomShop');
    if (cs) { cs.value = ''; cs.style.display = 'none'; }
    document.getElementById('cdmMatrixNotes').value = '';
    cdmUpdateMatrixCount();
    await cdmLoadShopOwners();
    cdmRenderShopOwnersList();
    cdmRenderAdminButtons();
  } catch (e) { 
    console.error('[CDM] 批量保存失败:', e); 
    toast('保存失败:' + (e.message || e), 'err'); 
  } finally {
    const btn = document.getElementById('cdmMatrixSaveBtn');
    if (btn) btn.disabled = false;
  }
}

window.cdmToggleSingleMode = cdmToggleSingleMode;
window.cdmToggleMatrixOther = cdmToggleMatrixOther;
window.cdmUpdateMatrixCount = cdmUpdateMatrixCount;
window.cdmSaveMatrix = cdmSaveMatrix;

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
      .from('cross_dept_messages').select(CDM_LIST_COLS)
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
