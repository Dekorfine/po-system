// ============================================================================
// V20260527t · 拍摄需求中心(跟单端 · 对接 WorkTrack-KPI 的 photo_logs 表)
// ----------------------------------------------------------------------------
// 跟单遇到问题 → 一键提需求给拍摄部 → 实时看进度
// 文档:AI提示词 v2 · 客服/跟单接入拍摄部工作流
// ----------------------------------------------------------------------------
// 配置:URL + anon key 存 localStorage · 仅 admin 可改 · 默认用 cross-dept 那套
// 来源标识:external_request.source = '跟单' · external_request.from_dept = '跟单部'
// ============================================================================

// ─────────────── Supabase 客户端配置 ───────────────
// 默认值:沿用 cross-dept(美工 Supabase · 大概率同一个项目)
// 老板可在「📨 拍摄」tab 顶部的 [⚙ 配置] 改写到 localStorage
const PHOTOREQ_DEFAULT_URL = 'https://xyhbwqugbnowfjuhqhsj.supabase.co';
const PHOTOREQ_DEFAULT_KEY = 'sb_publishable_Z0dXXZivG5QI-FCbwELxEA_JZBNx2Hn';

function _photoReqGetConfig() {
  const url = localStorage.getItem('worktrack_supabase_url') || PHOTOREQ_DEFAULT_URL;
  const key = localStorage.getItem('worktrack_supabase_anon_key') || PHOTOREQ_DEFAULT_KEY;
  return { url, key };
}

function _photoReqSaveConfig(url, key) {
  if (url) localStorage.setItem('worktrack_supabase_url', url.trim());
  if (key) localStorage.setItem('worktrack_supabase_anon_key', key.trim());
  // 重建 client
  PHOTOREQ._client = null;
}

function _photoReqClient() {
  if (PHOTOREQ._client) return PHOTOREQ._client;
  const { url, key } = _photoReqGetConfig();
  if (!url || !key) return null;
  try {
    PHOTOREQ._client = window.supabase.createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return PHOTOREQ._client;
  } catch (e) {
    console.error('photoReq client 创建失败:', e);
    return null;
  }
}

// ─────────────── 全局 state ───────────────
const PHOTOREQ = {
  _client: null,
  _list: [],
  _allLogs: [],          // V27y: 全量缓存(订阅会更新)
  _filter: 'all-activities',  // V27y: 默认看全部动态
  _viewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('photoreq_view_mode')) || 'list',  // V28a: 'list' | 'grid'
  _loadedAt: 0,
  _channel: null,        // V27y: realtime subscription handle
  _lastToastAt: 0,       // V27y: toast 节流(防刷屏)
};

// ─────────────── 12 店铺(从 v2 文档复制 · 别让 AI 编名) ───────────────
const PHOTOREQ_SHOPS = [
  'Vakkerlight', 'Docos.us', 'Mooijane', 'Mooiehome',
  'Radilum', 'Mooielight', 'Dekorfine', 'Pinlighting',
  'Lumioshine', 'Rayonshine', '阿里巴巴 · Radilum INC', '其他'
];

// ============================================================
// V28c (v4 仓库适配):拍摄仓库相关 helpers
// ============================================================
const PHOTOREQ_WAREHOUSE_REASONS = {
  '无货':         { emoji: '📦', notify: true },
  '供应商缺料':   { emoji: '🏭', notify: true },
  '维修中':       { emoji: '🔧', notify: false },
  '客户取消':     { emoji: '❌', notify: false },
  '等下批货':     { emoji: '🚚', notify: true },
  '样品丢失':     { emoji: '❓', notify: true },
  '质量问题':     { emoji: '⚠️', notify: true },
  '其他':         { emoji: '📋', notify: false },
};

function _photoReqIsWarehoused(log) {
  return !!(log && log.warehouse_info);
}
function _photoReqGetWarehouseAge(log) {
  const w = log?.warehouse_info;
  if (!w?.at_ms) return null;
  return Math.floor((Date.now() - w.at_ms) / (24 * 3600 * 1000));
}
function _photoReqDaysAgoText(ms) {
  if (!ms) return '';
  const days = Math.floor((Date.now() - ms) / (24 * 3600 * 1000));
  if (days === 0) return '今天入库';
  if (days === 1) return '昨天入库';
  if (days < 7) return `入库 ${days} 天`;
  if (days < 30) return `入库 ${Math.floor(days / 7)} 周`;
  return `入库 ${Math.floor(days / 30)} 月`;
}
function _photoReqShouldNotifyCustomer(reason) {
  return PHOTOREQ_WAREHOUSE_REASONS[reason]?.notify === true;
}
function _photoReqWarehouseBadge(log) {
  if (!_photoReqIsWarehoused(log)) return '';
  const w = log.warehouse_info;
  return `<span title="入库人:${escapeHtml(w.by_name || '?')} · 原因:${escapeHtml(w.reason || '?')}" style="display:inline-flex; align-items:center; padding:2px 7px; font-size:10px; border-radius:8px; background:rgba(245,158,11,0.15); color:#92400e; font-weight:700; border:1px solid rgba(245,158,11,0.4);">📦 ${escapeHtml(_photoReqDaysAgoText(w.at_ms))}</span>`;
}

// V28c: 客户通知话术(复制到剪贴板)
function photoReqCopyCustomerNotice(logId) {
  const log = (PHOTOREQ._allLogs || []).find(l => l.id === logId);
  if (!log || !_photoReqIsWarehoused(log)) return;
  const w = log.warehouse_info;
  const detail = w.reason_detail ? `\n预计 ${w.reason_detail} 可恢复拍摄。` : '\n预计回货时间请等拍摄部反馈。';
  const txt = `您好,关于您咨询的「${log.product_name}」,我们这边目前${w.reason}。${detail}\n我们会持续跟进 · 一有进展立刻告诉您 · 非常抱歉给您带来不便。`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(txt).then(
      () => toast('✓ 通知话术已复制 · 粘贴给客户即可', 'success', 2500),
      () => toast('复制失败 · 浏览器不支持', 'err')
    );
  } else {
    prompt('复制以下话术给客户:', txt);
  }
}
window.photoReqCopyCustomerNotice = photoReqCopyCustomerNotice;

// ─────────────── V27y: 来源徽章配置 ───────────────
const PHOTOREQ_SOURCE_BADGES = {
  '客服':  { emoji: '📨', label: '客服', bg: 'rgba(37,99,235,0.1)',  fg: '#1e40af' },
  '跟单':  { emoji: '📋', label: '跟单', bg: 'rgba(124,58,237,0.1)', fg: '#6d28d9' },
  '销售':  { emoji: '💰', label: '销售', bg: 'rgba(234,88,12,0.1)',  fg: '#9a3412' },
  '美工':  { emoji: '🎨', label: '美工', bg: 'rgba(13,148,136,0.1)', fg: '#0f766e' },
  '自发':  { emoji: '📷', label: '拍摄部', bg: 'rgba(120,113,108,0.15)', fg: '#57534e' },
};
function _photoReqSourceBadge(source, fromName) {
  const cfg = PHOTOREQ_SOURCE_BADGES[source] || PHOTOREQ_SOURCE_BADGES['自发'];
  const nameStr = (source === '客服' || source === '跟单' || source === '销售') && fromName 
    ? ` · ${escapeHtml(fromName)}` : '';
  return `<span style="display:inline-flex; align-items:center; padding:2px 8px; font-size:10.5px; border-radius:10px; background:${cfg.bg}; color:${cfg.fg}; font-weight:600;">
    ${cfg.emoji} ${cfg.label}${nameStr}
  </span>`;
}

// ─────────────── 主流程状态显示 ───────────────
const PHOTOREQ_STATUS_LABEL = {
  draft:     { emoji: '📦', text: '已提交 · 等拍摄部接手', color: 'rgba(245,158,11,0.1)', fg: '#92400e' },
  shooting:  { emoji: '📷', text: '拍摄部已接 · 待拍', color: 'rgba(37,99,235,0.1)', fg: '#1e40af' },
  shot:      { emoji: '✓',  text: '已拍完 · 等剪辑', color: 'rgba(13,148,136,0.1)', fg: '#0f766e' },
  editing:   { emoji: '🎬', text: '剪辑中', color: 'rgba(124,58,237,0.1)', fg: '#6d28d9' },
  edited:    { emoji: '✓',  text: '已剪辑 · 等上传', color: 'rgba(13,148,136,0.1)', fg: '#0f766e' },
  uploading: { emoji: '⬆️', text: '上传中', color: 'rgba(37,99,235,0.1)', fg: '#1e40af' },
  done:      { emoji: '✅', text: '完成 · 已上线', color: 'rgba(22,163,74,0.1)', fg: '#15803d' },
};

const PHOTOREQ_PRE_SHOOT_LABEL = {
  pending:  '⏳ 美工预审中',
  approved: '✅ 美工已通过预审 · 正式拍摄中',
  rejected: '⚠️ 美工反馈了问题 · 摄影助理整改中',
};

const PHOTOREQ_REVIEW_LABEL = {
  pending:  '🎬 老板/主管审核视频中',
  approved: '✅ 视频已审核通过 · 准备上传',
  rejected: '⚠️ 视频被反馈问题 · 等修改',
};

// ─────────────── 渲染主 tab ───────────────
async function renderPhotoReq() {
  const body = document.getElementById('photoReqBody');
  if (!body) return;
  
  const isAdmin = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN);
  const cfg = _photoReqGetConfig();
  const cfgConfigured = !!(localStorage.getItem('worktrack_supabase_url') && localStorage.getItem('worktrack_supabase_anon_key'));
  const cfgLabel = cfgConfigured ? '✓ 已配置' : 'ℹ 使用默认';
  
  // V20260527u: 配置 + 连接状态条 · 进 tab 自动测连接
  const cfgBar = `
    <div id="photoReqStatusBar" style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:rgba(100,116,139,0.05); border-left:3px solid #94a3b8; border-radius:0 6px 6px 0; margin-bottom:12px; font-size:11.5px; transition:all 0.2s;">
      <span id="photoReqStatusText" style="color:var(--text-secondary);">📨 拍摄部对接 · ${cfgLabel} · ${cfg.url.replace('https://', '').slice(0, 30)}... · <span style="color:var(--text-tertiary);">连接测试中...</span></span>
      <button class="btn small" onclick="photoReqTestConnection()" style="font-size:11px; padding:3px 10px; margin-left:auto;">🔍 测试连接</button>
      ${isAdmin ? `<button class="btn small" onclick="photoReqOpenConfig()" style="font-size:11px; padding:3px 10px;">⚙ 配置</button>` : ''}
    </div>
  `;
  
  body.innerHTML = `
    ${cfgBar}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
      <div>
        <h2 style="margin:0; font-size:18px; display:flex; align-items:center; gap:8px;">
          📨 拍摄需求中心
          <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">遇到问题一键给拍摄部 · 实时看进度</span>
        </h2>
      </div>
      <button class="btn primary" onclick="photoReqOpenNew()">+ 新建拍摄需求</button>
      ${isAdmin ? `<button class="btn" onclick="photoReqOpenBatch()" title="跟单专员/主管专用 · 一次录入多条" style="background:rgba(124,58,237,0.08); border-color:rgba(124,58,237,0.3); color:var(--purple);">📥 批量录入</button>` : ''}
    </div>

    <!-- V27y: 筛选 sub-tab(v3) + V28a: 视图切换 -->
    <div style="display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap; align-items:center;">
      ${[
        { k: 'all-activities', label: '🌐 全部工作动态' },
        { k: 'mine',           label: '👤 我提的' },
        { k: 'urgent',         label: '🚨 加急' },
        { k: 'in-progress',    label: '⏳ 进行中' },
        { k: 'done',           label: '✅ 已完成' },
        { k: 'warehouse',      label: '📦 仓库' },
      ].map(f => `
        <button onclick="photoReqSetFilter('${f.k}')" class="photoreq-filter-chip ${PHOTOREQ._filter === f.k ? 'active' : ''}" 
                style="padding:6px 12px; font-size:12px; border:1px solid ${PHOTOREQ._filter === f.k ? 'var(--accent)' : 'var(--border)'}; border-radius:18px; background:${PHOTOREQ._filter === f.k ? 'var(--accent)' : 'var(--bg-card)'}; color:${PHOTOREQ._filter === f.k ? 'white' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${PHOTOREQ._filter === f.k ? '600' : '400'};">
          ${f.label}
        </button>
      `).join('')}
      
      <!-- V28a: 视图切换 -->
      <div style="margin-left:auto; display:inline-flex; gap:0; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
        <button onclick="photoReqSetViewMode('list')" 
                style="padding:5px 10px; font-size:11.5px; border:0; cursor:pointer; background:${PHOTOREQ._viewMode === 'list' ? 'var(--accent)' : 'var(--bg-card)'}; color:${PHOTOREQ._viewMode === 'list' ? 'white' : 'var(--text-secondary)'}; font-weight:${PHOTOREQ._viewMode === 'list' ? '600' : '400'};" title="列表视图(紧凑 · 适合查找)">
          ☰ 列表
        </button>
        <button onclick="photoReqSetViewMode('grid')" 
                style="padding:5px 10px; font-size:11.5px; border:0; border-left:1px solid var(--border); cursor:pointer; background:${PHOTOREQ._viewMode === 'grid' ? 'var(--accent)' : 'var(--bg-card)'}; color:${PHOTOREQ._viewMode === 'grid' ? 'white' : 'var(--text-secondary)'}; font-weight:${PHOTOREQ._viewMode === 'grid' ? '600' : '400'};" title="网格视图(瀑布流 · 看大图)">
          ⊞ 网格
        </button>
      </div>
    </div>

    <div id="photoReqList">
      <div style="padding:32px; text-align:center; color:var(--text-tertiary);">加载中...</div>
    </div>
  `;
  
  await _photoReqLoadAndRender();
  // V20260527u: 进 tab 自动测一次连接 · 状态条变绿/红
  setTimeout(() => photoReqTestConnection(true), 50);
  // V20260527y: 进 tab 启动实时订阅(订阅全部 · 自动 throttle toast)
  _photoReqSubscribeRealtime();
}
window.renderPhotoReq = renderPhotoReq;

// V20260527u: 测试连接 · 简单 SELECT count · 不取数据
// silent=true 表示不弹 toast(进 tab 自动测时)· silent=false 弹 toast(用户主动点测试时)
async function photoReqTestConnection(silent = false) {
  const bar = document.getElementById('photoReqStatusBar');
  const txt = document.getElementById('photoReqStatusText');
  if (bar && txt) {
    bar.style.background = 'rgba(100,116,139,0.05)';
    bar.style.borderLeftColor = '#94a3b8';
    const cfg = _photoReqGetConfig();
    txt.innerHTML = `📨 拍摄部对接 · <span style="color:var(--text-tertiary);">🔄 测试中...</span>`;
  }
  
  const client = _photoReqClient();
  if (!client) {
    _photoReqSetStatusBar('error', '客户端未初始化 · 检查配置');
    if (!silent) toast('❌ 客户端未初始化', 'err');
    return false;
  }
  
  try {
    // V2 文档 #10:用 SELECT count 测连接(轻量)
    const { error } = await client.from('photo_logs').select('id', { count: 'exact', head: true }).limit(1);
    if (error) throw error;
    _photoReqSetStatusBar('ok', '连接 OK · 拍摄部 Supabase 通了');
    if (!silent) toast('✓ 连接 OK · 拍摄部 Supabase 通了', 'success', 1500);
    return true;
  } catch (e) {
    const msg = e.message || String(e);
    let hint = msg;
    if (msg.includes('permission denied') || msg.includes('JWT') || msg.includes('row-level')) {
      hint = 'RLS 拒绝 · 让 Martin 跑 v2 文档 #9 的 4 条 policy';
    } else if (msg.includes('relation') && msg.includes('does not exist')) {
      hint = '表 photo_logs 不存在 · 拍摄部那边没建表';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      hint = '网络不通 · URL 错了?';
    }
    _photoReqSetStatusBar('error', '连接失败:' + hint);
    if (!silent) toast('❌ 连接失败:' + hint, 'err', 4000);
    console.error('photoReq 连接测试失败:', e);
    return false;
  }
}
window.photoReqTestConnection = photoReqTestConnection;

function _photoReqSetStatusBar(state, message) {
  const bar = document.getElementById('photoReqStatusBar');
  const txt = document.getElementById('photoReqStatusText');
  if (!bar || !txt) return;
  const cfg = _photoReqGetConfig();
  const urlShort = cfg.url.replace('https://', '').slice(0, 30);
  if (state === 'ok') {
    bar.style.background = 'rgba(22,163,74,0.06)';
    bar.style.borderLeftColor = 'var(--success)';
    txt.innerHTML = `📨 拍摄部对接 · <span style="color:var(--success); font-weight:600;">✓ ${escapeHtml(message)}</span> · <span style="color:var(--text-tertiary);">${urlShort}...</span>`;
  } else if (state === 'error') {
    bar.style.background = 'rgba(220,38,38,0.05)';
    bar.style.borderLeftColor = 'var(--danger)';
    txt.innerHTML = `📨 拍摄部对接 · <span style="color:var(--danger); font-weight:600;">❌ ${escapeHtml(message)}</span>`;
  }
}

function photoReqSetFilter(filter) {
  PHOTOREQ._filter = filter;
  // V20260527y: 切 sub-tab 只重渲列表 · 不发请求(用 _allLogs 缓存)
  _photoReqApplyFilterAndRender();
}
window.photoReqSetFilter = photoReqSetFilter;

// V28a: 切换视图模式
function photoReqSetViewMode(mode) {
  PHOTOREQ._viewMode = mode;
  try { localStorage.setItem('photoreq_view_mode', mode); } catch (_) {}
  renderPhotoReq();  // 重渲整个 tab(切换按钮状态也要变)
}
window.photoReqSetViewMode = photoReqSetViewMode;

// ─────────────── 加载列表 · V27y 改:全量查 + 客户端筛选 ───────────────
async function _photoReqLoadAndRender() {
  const listEl = document.getElementById('photoReqList');
  if (!listEl) return;
  
  const client = _photoReqClient();
  if (!client) {
    listEl.innerHTML = `<div style="padding:24px; text-align:center; color:var(--danger); background:rgba(220,38,38,0.05); border-radius:8px;">⚠ Supabase 客户端初始化失败 · 请检查配置</div>`;
    return;
  }
  
  try {
    // V20260527y(v3 #3):一次拉全部 · 不过滤 source · 客户端筛选切换 sub-tab 不发请求
    const { data, error } = await client.from('photo_logs').select('*')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    
    PHOTOREQ._allLogs = data || [];
    PHOTOREQ._loadedAt = Date.now();
    _photoReqApplyFilterAndRender();
  } catch (e) {
    console.error('加载拍摄需求失败:', e);
    listEl.innerHTML = `<div style="padding:20px; text-align:center; color:var(--danger); background:rgba(220,38,38,0.05); border-radius:8px;">
      ⚠ 加载失败:${escapeHtml(e.message || String(e))}<br>
      <span style="font-size:11px; color:var(--text-tertiary);">如果是权限错误 · 让 Martin 配 RLS · 见文档 #9</span>
    </div>`;
  }
}

// V20260527y: 客户端筛选 + 渲染(不发请求)
function _photoReqApplyFilterAndRender() {
  const all = PHOTOREQ._allLogs || [];
  const tab = PHOTOREQ._filter;
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : '');
  
  let list = all;
  switch (tab) {
    case 'all-activities':
      // V28c (v4 #2.1): 默认隐藏仓库中的(它们暂停了 · 不影响活跃判断)
      list = all.filter(l => !_photoReqIsWarehoused(l));
      break;
    case 'mine':
      list = all.filter(l => l.external_request?.from_user_id === myId);
      break;
    case 'urgent':
      list = all.filter(l => 
        (l.priority === 'urgent' || l.external_request?.urgency === 'urgent') 
        && l.status !== 'done'
        && !_photoReqIsWarehoused(l)  // V28c: 在仓库的不算加急
      );
      break;
    case 'in-progress':
      list = all.filter(l => 
        ['shooting', 'shot', 'editing', 'edited', 'uploading'].includes(l.status)
        && !_photoReqIsWarehoused(l)  // V28c: 在仓库的不算进行中
      );
      break;
    case 'done':
      list = all.filter(l => l.status === 'done' && !_photoReqIsWarehoused(l));
      break;
    case 'warehouse':
      // V28c (v4 #2.2): 只看仓库中的
      list = all.filter(l => _photoReqIsWarehoused(l))
              .sort((a, b) => (b.warehouse_info?.at_ms || 0) - (a.warehouse_info?.at_ms || 0));
      break;
  }
  
  PHOTOREQ._list = list;
  _photoReqRenderWarehouseBanner();  // V28c: 渲染"我提的入库中"横幅
  _photoReqRenderList(list);
}

// V28c (v4 #3.2):个人首页"我提的入库中"提示横幅
function _photoReqRenderWarehouseBanner() {
  const container = document.getElementById('photoReqList');
  if (!container) return;
  
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : '');
  
  const myWarehoused = (PHOTOREQ._allLogs || []).filter(l => 
    _photoReqIsWarehoused(l) 
    && l.external_request?.from_user_id === myId
  );
  
  // 移除旧 banner(如果有)
  const oldBanner = document.getElementById('photoReqWarehouseBanner');
  if (oldBanner) oldBanner.remove();
  
  if (myWarehoused.length === 0) return;
  if (PHOTOREQ._filter === 'warehouse') return;  // 已经在仓库 tab 不重复提示
  
  // 排序:入库时间倒序 · 取前 3
  const top3 = myWarehoused
    .sort((a, b) => (b.warehouse_info?.at_ms || 0) - (a.warehouse_info?.at_ms || 0))
    .slice(0, 3);
  
  const banner = document.createElement('div');
  banner.id = 'photoReqWarehouseBanner';
  banner.style.cssText = 'padding:12px 14px; background:rgba(254,243,199,0.6); border:1px solid rgba(245,158,11,0.3); border-left:4px solid #f59e0b; border-radius:6px; margin-bottom:10px; font-size:12.5px;';
  banner.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
      <div style="color:#92400e; font-weight:600;">
        📦 你提的 ${myWarehoused.length} 条需求当前在拍摄仓库 · 等货回来
      </div>
      <button onclick="photoReqSetFilter('warehouse')" class="btn small" style="font-size:11px; padding:3px 10px;">查看全部仓库</button>
    </div>
    <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
      ${top3.map(l => {
        const w = l.warehouse_info;
        const daysText = _photoReqDaysAgoText(w.at_ms);
        const emoji = PHOTOREQ_WAREHOUSE_REASONS[w.reason]?.emoji || '📋';
        return `<div style="font-size:11.5px; color:var(--text-secondary); line-height:1.5;">
          · ${escapeHtml(l.product_name || '(无名)')}(${emoji} ${escapeHtml(w.reason || '?')} · ${daysText})${l.sku ? ` <span style="font-family:monospace; color:var(--text-tertiary);">${escapeHtml(l.sku)}</span>` : ''}
        </div>`;
      }).join('')}
      ${myWarehoused.length > 3 ? `<div style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">… 还有 ${myWarehoused.length - 3} 条</div>` : ''}
    </div>
  `;
  
  // 插入到 photoReqList 之前
  container.parentNode.insertBefore(banner, container);
}

function _photoReqRenderList(list) {
  const listEl = document.getElementById('photoReqList');
  if (!listEl) return;
  
  if (list.length === 0) {
    listEl.innerHTML = `
      <div style="padding:48px; text-align:center; color:var(--text-tertiary); background:var(--bg-card); border:1px dashed var(--border); border-radius:10px;">
        <div style="font-size:32px; margin-bottom:8px;">📭</div>
        <div style="font-size:14px;">${PHOTOREQ._filter === 'mine' ? '你还没提过拍摄需求' : '当前筛选无匹配'}</div>
        <button class="btn primary" onclick="photoReqOpenNew()" style="margin-top:12px;">+ 提一个</button>
      </div>
    `;
    return;
  }
  
  // V28a: 根据视图模式选择容器布局
  if (PHOTOREQ._viewMode === 'grid') {
    listEl.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:14px;">
        ${list.map(log => _photoReqCardHtmlGrid(log)).join('')}
      </div>
    `;
  } else {
    // list 视图 · 紧凑横向布局
    listEl.innerHTML = list.map(log => _photoReqCardHtmlList(log)).join('');
  }
}

// V28a: 列表视图卡片 · 紧凑横向 · 高度 ~90px
function _photoReqCardHtmlList(log) {
  const status = log.status || 'draft';
  const statusMeta = PHOTOREQ_STATUS_LABEL[status] || { emoji: '?', text: status, color: 'var(--bg-elevated)', fg: 'var(--text-secondary)' };
  const ext = log.external_request || {};
  const urgent = log.priority === 'urgent' || ext.urgency === 'urgent';
  const shops = Array.isArray(log.applicable_shops) ? log.applicable_shops : [];
  const attachments = Array.isArray(ext.attachments) ? ext.attachments : [];
  const source = ext.source || '自发';
  const fromName = ext.from_name || '';
  const sourceBadge = _photoReqSourceBadge(source, fromName);
  const statusLines = _photoReqRenderStatusLines(log);
  const ageMs = Date.now() - (log.created_at_ms || 0);
  const ageStr = _photoReqFmtAge(ageMs);
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : '');
  const isMine = ext.from_user_id === myId;
  
  // 摘要状态行(最多 2 个 sub-state · 不全显示避免高度爆炸)
  const compactStatus = statusLines.slice(0, 2).join(' · ');
  
  // V28c (v4): 仓库判断
  const inWarehouse = _photoReqIsWarehoused(log);
  const whInfo = log.warehouse_info;
  const leftBorder = inWarehouse ? '#f59e0b' : (urgent ? 'var(--danger)' : statusMeta.fg);
  const cardBg = inWarehouse ? 'rgba(254,243,199,0.4)' : 'var(--bg-card)';
  
  return `
    <div style="display:grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap:12px; padding:10px 14px; background:${cardBg}; border:1px solid var(--border); border-left:4px solid ${leftBorder}; border-radius:6px; margin-bottom:6px; align-items:center;">
      <!-- 图 -->
      <div>
        ${log.product_image 
          ? `<img src="${escapeHtml(log.product_image)}" style="width:64px; height:64px; object-fit:cover; border-radius:5px; cursor:zoom-in; ${inWarehouse ? 'opacity:0.7;' : ''}" onclick="openImgLightbox && openImgLightbox('${escapeHtml(log.product_image)}')">` 
          : `<div style="width:64px; height:64px; background:var(--bg-elevated); border-radius:5px; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:22px;">📷</div>`}
      </div>
      <!-- 主信息 · 3 行 -->
      <div style="min-width:0;">
        <!-- 行 1:徽章 · 状态 · 产品名 · SKU(单行 truncate)-->
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px; flex-wrap:nowrap; overflow:hidden;">
          ${urgent && !inWarehouse ? `<span style="background:var(--danger); color:white; padding:1px 6px; border-radius:8px; font-size:9.5px; font-weight:700; flex-shrink:0;">🚨</span>` : ''}
          ${inWarehouse ? _photoReqWarehouseBadge(log) : ''}
          <span style="flex-shrink:0;">${sourceBadge}</span>
          ${isMine && source !== '自发' ? `<span style="color:var(--accent); font-size:10px; font-weight:600; flex-shrink:0;">↳ 我提</span>` : ''}
          ${!inWarehouse ? `<span style="background:${statusMeta.color}; color:${statusMeta.fg}; padding:1px 7px; border-radius:8px; font-size:10.5px; font-weight:600; flex-shrink:0;">${statusMeta.emoji} ${statusMeta.text}</span>` : ''}
          <span style="font-size:13px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; ${inWarehouse ? 'color:var(--text-secondary);' : ''}">${escapeHtml(log.product_name || '(未填)')}</span>
          ${log.sku ? `<span style="font-size:11px; color:var(--text-tertiary); font-family:monospace; flex-shrink:0;">${escapeHtml(log.sku)}</span>` : ''}
        </div>
        ${inWarehouse ? `
        <!-- 仓库信息行 -->
        <div style="font-size:11px; color:#92400e; margin-bottom:3px; line-height:1.4;">
          ${PHOTOREQ_WAREHOUSE_REASONS[whInfo.reason]?.emoji || '📋'} ${escapeHtml(whInfo.reason || '原因未知')}${whInfo.by_name ? ' · 操作人 ' + escapeHtml(whInfo.by_name) : ''}${whInfo.reason_detail ? ' · ' + escapeHtml(whInfo.reason_detail) : ''}
        </div>` : ''}
        <!-- 行 2:原因(单行 truncate)-->
        ${ext.reason && !inWarehouse ? `
        <div style="font-size:11.5px; color:var(--text-secondary); margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.4;" title="${escapeHtml(ext.reason)}">
          ${escapeHtml(ext.reason)}
        </div>` : ''}
        <!-- 行 3:店铺 / 附件 / 状态摘要 -->
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:10.5px; color:var(--text-tertiary); line-height:1.4;">
          ${shops.length > 0 ? `<span>🏪 ${shops.map(escapeHtml).join('·')}</span>` : ''}
          ${attachments.length > 0 ? `<span>📎 ${attachments.length}</span>` : ''}
          ${compactStatus && !inWarehouse ? `<span style="color:var(--text-secondary);">${compactStatus}</span>` : ''}
          ${inWarehouse && isMine && _photoReqShouldNotifyCustomer(whInfo.reason) ? `<button onclick="photoReqCopyCustomerNotice('${escapeHtml(log.id)}')" style="font-size:10px; padding:2px 7px; border-radius:3px; border:1px solid #fda4af; background:rgba(254,205,211,0.3); color:#9f1239; cursor:pointer;" title="复制通知客户的话术">💬 复制话术</button>` : ''}
        </div>
      </div>
      <!-- 右:时间 + ✏ -->
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
        <span style="font-size:10.5px; color:var(--text-tertiary); white-space:nowrap;">${ageStr}</span>
        ${inWarehouse 
          ? `<button class="btn small" disabled style="font-size:10.5px; padding:2px 8px; opacity:0.4; cursor:not-allowed;" title="在仓库 · 暂停编辑 · 等拍摄部唤醒后才能改">✏ 编辑</button>`
          : `<button onclick="photoReqOpenEdit('${escapeHtml(log.id)}')" class="btn small" style="font-size:10.5px; padding:2px 8px;" title="编辑">✏ 编辑</button>`}
      </div>
    </div>
  `;
}

// V28a: 网格视图卡片 · 大图在上 · 信息在下
function _photoReqCardHtmlGrid(log) {
  const status = log.status || 'draft';
  const statusMeta = PHOTOREQ_STATUS_LABEL[status] || { emoji: '?', text: status, color: 'var(--bg-elevated)', fg: 'var(--text-secondary)' };
  const ext = log.external_request || {};
  const urgent = log.priority === 'urgent' || ext.urgency === 'urgent';
  const shops = Array.isArray(log.applicable_shops) ? log.applicable_shops : [];
  const attachments = Array.isArray(ext.attachments) ? ext.attachments : [];
  const source = ext.source || '自发';
  const fromName = ext.from_name || '';
  const sourceBadge = _photoReqSourceBadge(source, fromName);
  const statusLines = _photoReqRenderStatusLines(log);
  const ageMs = Date.now() - (log.created_at_ms || 0);
  const ageStr = _photoReqFmtAge(ageMs);
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : '');
  const isMine = ext.from_user_id === myId;
  
  // V28c (v4): 仓库判断
  const inWarehouse = _photoReqIsWarehoused(log);
  const whInfo = log.warehouse_info;
  const topBorder = inWarehouse ? '#f59e0b' : (urgent ? 'var(--danger)' : statusMeta.fg);
  const cardBg = inWarehouse ? 'rgba(254,243,199,0.4)' : 'var(--bg-card)';
  
  return `
    <div style="display:flex; flex-direction:column; background:${cardBg}; border:1px solid var(--border); border-top:4px solid ${topBorder}; border-radius:8px; overflow:hidden; transition:transform 0.15s, box-shadow 0.15s; height:100%;"
         onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)';"
         onmouseleave="this.style.transform=''; this.style.boxShadow='';">
      
      <!-- V28aa: 大图区 · aspect-ratio + contain 保留完整图 -->
      <div style="position:relative; background:var(--bg-elevated); aspect-ratio: 4/3; overflow:hidden;">
        ${log.product_image 
          ? `<img src="${escapeHtml(log.product_image)}" style="width:100%; height:100%; object-fit:contain; cursor:zoom-in; ${inWarehouse ? 'opacity:0.6;' : ''}" onclick="openImgLightbox && openImgLightbox('${escapeHtml(log.product_image)}')">` 
          : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:48px;">📷</div>`}
        ${urgent && !inWarehouse ? `<span style="position:absolute; top:8px; left:8px; background:var(--danger); color:white; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; box-shadow:0 2px 6px rgba(0,0,0,0.15);">🚨 加急</span>` : ''}
        ${inWarehouse ? `<span style="position:absolute; top:8px; left:8px;">${_photoReqWarehouseBadge(log)}</span>` : ''}
        <span style="position:absolute; top:8px; right:8px;">${sourceBadge}</span>
      </div>
      
      <!-- 信息区 -->
      <div style="padding:12px; display:flex; flex-direction:column; gap:6px; flex:1; min-width:0;">
        <!-- 状态徽章 -->
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          ${!inWarehouse ? `<span style="background:${statusMeta.color}; color:${statusMeta.fg}; padding:2px 9px; border-radius:10px; font-size:10.5px; font-weight:600;">${statusMeta.emoji} ${statusMeta.text}</span>` : `<span style="background:rgba(245,158,11,0.15); color:#92400e; padding:2px 9px; border-radius:10px; font-size:10.5px; font-weight:600; border:1px solid rgba(245,158,11,0.3);">${PHOTOREQ_WAREHOUSE_REASONS[whInfo.reason]?.emoji || '📋'} ${escapeHtml(whInfo.reason || '在仓库')}</span>`}
          ${isMine && source !== '自发' ? `<span style="color:var(--accent); font-size:10px; font-weight:600;">↳ 我提</span>` : ''}
        </div>
        
        <!-- 产品名 + SKU -->
        <div style="font-size:13.5px; font-weight:600; color:${inWarehouse ? 'var(--text-secondary)' : 'var(--text-primary)'}; line-height:1.4; word-break:break-word; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
          ${escapeHtml(log.product_name || '(未填产品名)')}
        </div>
        ${log.sku ? `<div style="font-size:11px; color:var(--text-tertiary); font-family:monospace;">${escapeHtml(log.sku)}</div>` : ''}
        
        <!-- 店铺 -->
        ${shops.length > 0 ? `<div style="font-size:10.5px; color:var(--text-tertiary); line-height:1.4;">🏪 ${shops.map(escapeHtml).join(' · ')}</div>` : ''}
        
        <!-- 仓库详情 / 或 原因 -->
        ${inWarehouse ? `
        <div style="font-size:11px; color:#92400e; line-height:1.5; padding:6px 8px; background:rgba(245,158,11,0.08); border-radius:4px;">
          ${whInfo.by_name ? `📦 ${escapeHtml(whInfo.by_name)} 入库` : '📦 已入库'}
          ${whInfo.reason_detail ? `<br>💬 ${escapeHtml(whInfo.reason_detail)}` : ''}
        </div>` : ext.reason ? `
        <div style="font-size:11.5px; color:var(--text-secondary); line-height:1.5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;" title="${escapeHtml(ext.reason)}">
          ${escapeHtml(ext.reason)}
        </div>` : ''}
        
        <!-- 状态行(最多 2 行)-->
        ${statusLines.length > 0 && !inWarehouse ? `
        <div style="margin-top:auto; padding-top:8px; border-top:1px dashed var(--border-subtle); display:flex; flex-direction:column; gap:3px;">
          ${statusLines.slice(0, 3).map(line => `<div style="font-size:10.5px; color:var(--text-secondary); line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${line}</div>`).join('')}
        </div>` : '<div style="margin-top:auto;"></div>'}
        
        <!-- 底部:时间 + 编辑 -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:6px; border-top:1px solid var(--border-subtle); gap:6px; flex-wrap:wrap;">
          <span style="font-size:10.5px; color:var(--text-tertiary);">${ageStr}${attachments.length > 0 ? ` · 📎 ${attachments.length}` : ''}</span>
          ${inWarehouse && isMine && _photoReqShouldNotifyCustomer(whInfo.reason) ? `<button onclick="photoReqCopyCustomerNotice('${escapeHtml(log.id)}')" style="font-size:10px; padding:2px 7px; border-radius:3px; border:1px solid #fda4af; background:rgba(254,205,211,0.3); color:#9f1239; cursor:pointer;" title="复制通知客户的话术">💬 话术</button>` : ''}
          ${inWarehouse 
            ? `<button class="btn small" disabled style="font-size:10.5px; padding:2px 8px; opacity:0.4; cursor:not-allowed;" title="在仓库 · 暂停编辑">✏ 编辑</button>`
            : `<button onclick="photoReqOpenEdit('${escapeHtml(log.id)}')" class="btn small" style="font-size:10.5px; padding:2px 8px;" title="编辑">✏ 编辑</button>`}
        </div>
      </div>
    </div>
  `;
}


// V20260527y(v3 #6):完整状态行 helper
function _photoReqRenderStatusLines(log) {
  const lines = [];
  
  // 摄影师 / 剪辑师 / 上传者
  if (log.photographer_name) lines.push(`📷 摄影师:${escapeHtml(log.photographer_name)}${log.shoot_date ? ` (${log.shoot_date})` : ''}`);
  if (log.editor_name)       lines.push(`🎬 剪辑师:${escapeHtml(log.editor_name)}${log.edit_date ? ` (${log.edit_date})` : ''}`);
  if (log.uploader_name)     lines.push(`⬆️ 上传者:${escapeHtml(log.uploader_name)}${log.upload_date ? ` (${log.upload_date})` : ''}`);
  
  // 美工预审子流程(v22-EW)
  const psr = log.pre_shoot_review;
  if (psr?.status && PHOTOREQ_PRE_SHOOT_LABEL[psr.status]) {
    const by = psr.decision_by_name ? ` (${escapeHtml(psr.decision_by_name)})` : '';
    lines.push(PHOTOREQ_PRE_SHOOT_LABEL[psr.status] + by);
  }
  
  // 视频审核子流程(v22-EO)
  const r = log.review;
  if (r?.status && PHOTOREQ_REVIEW_LABEL[r.status]) {
    const by = r.decision_by_name ? ` (${escapeHtml(r.decision_by_name)})` : '';
    lines.push(PHOTOREQ_REVIEW_LABEL[r.status] + by);
  }
  
  // 卡住原因(v22-EQ)
  if (log.pending_reason && (log.status === 'draft' || log.status === 'shooting')) {
    lines.push(`📌 卡住原因:${escapeHtml(log.pending_reason)}`);
  }
  
  // 已嵌入独立站
  if (log.embed_status === 'embedded') {
    const xhs = log.url_xiaohongshu ? ' · 📕 小红书已发' : '';
    lines.push(`🌐 已嵌入独立站${xhs}`);
  }
  
  return lines;
}

function _photoReqFmtAge(ms) {
  if (!ms || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  if (d < 30) return d + ' 天前';
  return new Date(Date.now() - ms).toLocaleDateString();
}

// ─────────────── 配置中心 ───────────────
function photoReqOpenConfig() {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) {
    toast('配置仅限主管', 'warn');
    return;
  }
  const cfg = _photoReqGetConfig();
  document.getElementById('photoReqCfgUrl').value = cfg.url;
  document.getElementById('photoReqCfgKey').value = cfg.key;
  document.getElementById('photoReqConfigModal').style.display = 'flex';
  if (typeof _disableAutofillOnFields === 'function') {
    setTimeout(() => _disableAutofillOnFields(document.getElementById('photoReqConfigModal')), 0);
  }
}
window.photoReqOpenConfig = photoReqOpenConfig;

function photoReqCloseConfig() {
  document.getElementById('photoReqConfigModal').style.display = 'none';
}
window.photoReqCloseConfig = photoReqCloseConfig;

function photoReqSaveConfig() {
  const url = document.getElementById('photoReqCfgUrl').value.trim();
  const key = document.getElementById('photoReqCfgKey').value.trim();
  if (!url || !key) { toast('URL 和 anon key 都要填', 'warn'); return; }
  if (!url.startsWith('https://') || !url.endsWith('.supabase.co')) {
    toast('URL 格式不对 · 应该是 https://xxx.supabase.co', 'err');
    return;
  }
  _photoReqSaveConfig(url, key);
  toast('✓ 配置已保存 · 重新加载列表中...', 'success');
  photoReqCloseConfig();
  setTimeout(() => renderPhotoReq(), 200);
}
window.photoReqSaveConfig = photoReqSaveConfig;

function photoReqResetConfig() {
  if (!confirm('确认恢复默认配置?\n\n(将清除你保存的 URL + key · 用美工 Supabase 默认值)')) return;
  localStorage.removeItem('worktrack_supabase_url');
  localStorage.removeItem('worktrack_supabase_anon_key');
  PHOTOREQ._client = null;
  toast('✓ 已恢复默认 · 重新加载...', 'success');
  photoReqCloseConfig();
  setTimeout(() => renderPhotoReq(), 200);
}
window.photoReqResetConfig = photoReqResetConfig;

// ─────────────── 新建需求 modal ───────────────
let PHOTOREQ_NEW = null;

function photoReqOpenNew(preset = {}) {
  PHOTOREQ_NEW = {
    product_name: preset.product_name || '',
    sku: preset.sku || '',
    product_image: preset.product_image || '',
    applicable_shops: preset.applicable_shops || [],
    reason: preset.reason || '',
    urgency: 'normal',
    attachments: [],
    external_ref_id: preset.external_ref_id || '',
  };
  _photoReqRenderNew();
  document.getElementById('photoReqNewModal').style.display = 'flex';
  if (typeof _disableAutofillOnFields === 'function') {
    setTimeout(() => _disableAutofillOnFields(document.getElementById('photoReqNewModal')), 0);
  }
}
window.photoReqOpenNew = photoReqOpenNew;

function photoReqCloseNew() {
  document.getElementById('photoReqNewModal').style.display = 'none';
  PHOTOREQ_NEW = null;
}
window.photoReqCloseNew = photoReqCloseNew;

function _photoReqRenderNew() {
  const s = PHOTOREQ_NEW;
  const body = document.getElementById('photoReqNewBody');
  
  body.innerHTML = `
    <!-- 产品名 + SKU -->
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px; margin-bottom:14px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">产品名 <span style="color:var(--danger);">*</span></label>
        <input type="text" id="prNewProductName" value="${escapeHtml(s.product_name)}" oninput="PHOTOREQ_NEW.product_name=this.value"
               placeholder="例:Milk Table Lamp"
               style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px;">
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">SKU(强烈建议填)</label>
        <input type="text" id="prNewSku" value="${escapeHtml(s.sku)}" oninput="PHOTOREQ_NEW.sku=this.value"
               placeholder="例:DCT-24118-5"
               style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; font-family:monospace;">
      </div>
    </div>
    
    <!-- 应用店铺多选 -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">应用店铺(可多选)</label>
      <div style="display:flex; flex-wrap:wrap; gap:5px;">
        ${PHOTOREQ_SHOPS.map(shop => {
          const checked = s.applicable_shops.includes(shop);
          return `<span onclick="_photoReqToggleShop('${escapeHtml(shop).replace(/'/g, "\\'")}')"
                        style="padding:5px 10px; font-size:11.5px; border:1px solid ${checked ? 'var(--accent)' : 'var(--border)'}; border-radius:14px; cursor:pointer; user-select:none; background:${checked ? 'var(--accent)' : 'var(--bg-card)'}; color:${checked ? 'white' : 'var(--text-secondary)'}; font-weight:${checked ? '600' : '400'};">
                    ${checked ? '✓ ' : ''}${escapeHtml(shop)}
                  </span>`;
        }).join('')}
      </div>
    </div>
    
    <!-- 原因(大文本) -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">详细原因 <span style="color:var(--danger);">*</span></label>
      <textarea id="prNewReason" oninput="PHOTOREQ_NEW.reason=this.value" rows="4"
                placeholder="客户反馈拿到的灯是金色 · 卖家描述是黄铜色 · 要求重拍清晰彩照对比&#10;紧急:客户在 PayPal 开了 dispute · 2 天内要答复"
                style="width:100%; padding:10px 12px; font-size:13px; border:1px solid var(--border); border-radius:6px; resize:vertical; font-family:inherit; line-height:1.5;">${escapeHtml(s.reason)}</textarea>
    </div>
    
    <!-- 紧急度 -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">紧急度</label>
      <div style="display:flex; gap:8px;">
        <span onclick="PHOTOREQ_NEW.urgency='normal'; _photoReqRenderNew()"
              style="padding:6px 14px; font-size:12px; border:1px solid ${s.urgency==='normal'?'var(--accent)':'var(--border)'}; border-radius:6px; cursor:pointer; background:${s.urgency==='normal'?'var(--accent)':'var(--bg-card)'}; color:${s.urgency==='normal'?'white':'var(--text-secondary)'}; font-weight:${s.urgency==='normal'?'600':'400'};">
          普通
        </span>
        <span onclick="PHOTOREQ_NEW.urgency='urgent'; _photoReqRenderNew()"
              style="padding:6px 14px; font-size:12px; border:1px solid ${s.urgency==='urgent'?'var(--danger)':'var(--border)'}; border-radius:6px; cursor:pointer; background:${s.urgency==='urgent'?'var(--danger)':'var(--bg-card)'}; color:${s.urgency==='urgent'?'white':'var(--text-secondary)'}; font-weight:${s.urgency==='urgent'?'600':'400'};">
          🚨 加急
        </span>
      </div>
      <div style="font-size:11px; color:var(--text-tertiary); margin-top:5px;">⚠ 加急在拍摄部首页置顶 · 慎用 · 客户投诉 / 平台 dispute 等才标加急</div>
    </div>
    
    <!-- 产品图(可选 · URL 或上传) -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">产品图 URL(可选 · 让拍摄部看长啥样)</label>
      <input type="text" value="${escapeHtml(s.product_image)}" oninput="PHOTOREQ_NEW.product_image=this.value"
             placeholder="https://...png · 从 Shopify 复制产品图链接"
             style="width:100%; padding:8px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px;">
    </div>
    
    <!-- 附件上传 -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
        附件 · 客户聊天截图 / 对比图 / 物流损坏图等 (${s.attachments.length})
      </label>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
        ${s.attachments.map((a, idx) => `
          <div style="position:relative; width:80px; height:80px; border-radius:6px; overflow:hidden; border:1px solid var(--border);">
            <img src="${escapeHtml(a.url)}" style="width:100%; height:100%; object-fit:cover;">
            <button onclick="_photoReqDelAttachment(${idx})" style="position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.7); color:white; border:none; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
          </div>
        `).join('')}
        <label for="prNewFiles" style="width:80px; height:80px; border:2px dashed var(--border); border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; color:var(--text-tertiary); font-size:11px; gap:2px;">
          <span style="font-size:18px;">📎</span>
          <span>添加</span>
        </label>
        <input type="file" id="prNewFiles" multiple accept="image/*" onchange="_photoReqOnFilesPick(this.files)" style="display:none;">
      </div>
      <div id="prNewUploadStatus" style="font-size:11px; color:var(--text-tertiary);"></div>
    </div>
    
    <!-- 外部关联(可选) -->
    <div style="margin-bottom:6px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">关联 PO / 售后单号(可选)</label>
      <input type="text" value="${escapeHtml(s.external_ref_id)}" oninput="PHOTOREQ_NEW.external_ref_id=this.value"
             placeholder="例:CG-20260527-0008 / AS-1234"
             style="width:100%; padding:7px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px; font-family:monospace;">
    </div>
  `;
}

function _photoReqToggleShop(shop) {
  if (!PHOTOREQ_NEW) return;
  const arr = PHOTOREQ_NEW.applicable_shops;
  const idx = arr.indexOf(shop);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(shop);
  _photoReqRenderNew();
}
window._photoReqToggleShop = _photoReqToggleShop;

function _photoReqDelAttachment(idx) {
  if (!PHOTOREQ_NEW) return;
  PHOTOREQ_NEW.attachments.splice(idx, 1);
  _photoReqRenderNew();
}
window._photoReqDelAttachment = _photoReqDelAttachment;

// 客户端压缩 + 并行上传
async function _photoReqOnFilesPick(files) {
  if (!files || files.length === 0) return;
  const status = document.getElementById('prNewUploadStatus');
  if (status) status.textContent = `上传中 0/${files.length}...`;
  
  const client = _photoReqClient();
  if (!client) { toast('Supabase 客户端未配置', 'err'); return; }
  
  let done = 0;
  const uploads = Array.from(files).map(async (file) => {
    try {
      const compressed = await _photoReqCompressImage(file);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `cs-requests/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      
      const { error } = await client.storage
        .from('attachments')
        .upload(path, compressed, { upsert: false, contentType: compressed.type });
      if (error) throw error;
      
      const { data: { publicUrl } } = client.storage.from('attachments').getPublicUrl(path);
      
      done++;
      if (status) status.textContent = `上传中 ${done}/${files.length}...`;
      return {
        name: file.name,
        url: publicUrl,
        uploaded_at_ms: Date.now()
      };
    } catch (e) {
      console.error('附件上传失败:', e);
      toast(`上传失败:${file.name} · ${e.message || e}`, 'err');
      return null;
    }
  });
  
  const results = await Promise.all(uploads);
  const successful = results.filter(Boolean);
  if (successful.length > 0) {
    PHOTOREQ_NEW.attachments.push(...successful);
    if (status) status.textContent = `✓ 已上传 ${successful.length} 张`;
    _photoReqRenderNew();
    setTimeout(() => { const s = document.getElementById('prNewUploadStatus'); if (s) s.textContent = ''; }, 2000);
  }
}
window._photoReqOnFilesPick = _photoReqOnFilesPick;

// 压缩图片到 1600px 宽以内 + JPEG q=0.85
function _photoReqCompressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1600;
        let w = img.width, h = img.height;
        if (w > MAX_W) { h = h * (MAX_W / w); w = MAX_W; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          // 用 .jpg 后缀的 file
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(compressed);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// 提交新需求
async function photoReqSubmitNew() {
  const s = PHOTOREQ_NEW;
  if (!s) return;
  
  // 校验
  if (!(s.product_name || '').trim()) { toast('请填产品名', 'warn'); return; }
  if (!(s.reason || '').trim()) { toast('请填详细原因', 'warn'); return; }
  
  const client = _photoReqClient();
  if (!client) { toast('Supabase 客户端未配置 · 让主管去 ⚙ 配置', 'err'); return; }
  
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) : (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : 'unknown');
  const myName = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) ? CURRENT_AGENT : '跟单';
  
  // V20260527t: ⚠️ 必须用 crypto.randomUUID() · 不能用短串
  const id = crypto.randomUUID();
  const now = Date.now();
  
  const row = {
    id,
    product_name: s.product_name.trim(),
    sku: (s.sku || '').trim() || null,
    product_image: (s.product_image || '').trim() || null,
    applicable_shops: s.applicable_shops || [],
    product_type: '跟单需求',
    
    status: 'draft',
    priority: s.urgency === 'urgent' ? 'urgent' : 'normal',
    
    external_request: {
      source: '跟单',
      from_name: myName,
      from_user_id: myId,
      from_dept: '跟单部',
      reason: s.reason.trim(),
      urgency: s.urgency || 'normal',
      attachments: s.attachments || [],
      created_at_ms: now,
      external_ref_id: (s.external_ref_id || '').trim() || null
    },
    
    created_by_id: myId,
    created_by_name: myName,
    created_at_ms: now,
    updated_at: new Date().toISOString()
  };
  
  try {
    const { error } = await client.from('photo_logs').insert(row);
    if (error) throw error;
    toast(`✓ 已提交给拍摄部 · ${s.urgency === 'urgent' ? '🚨 加急工单' : '等待接手'}`, 'success', 2500);
    photoReqCloseNew();
    setTimeout(() => renderPhotoReq(), 200);
  } catch (e) {
    console.error('提交拍摄需求失败:', e);
    toast('提交失败:' + (e.message || e), 'err', 4000);
  }
}
window.photoReqSubmitNew = photoReqSubmitNew;

// ============================================================================
// V20260527y(v3 #8):实时订阅 · 订阅全部 photo_logs 变化
// · INSERT:客服/跟单/销售 来源的新需求 → 弹 toast(throttle ≥3s)
// · UPDATE:我提的状态变化 → 弹 toast
// · 任何变化:静默刷新列表
// ============================================================================
function _photoReqSubscribeRealtime() {
  // 已订阅就不重复
  if (PHOTOREQ._channel) return;
  
  const client = _photoReqClient();
  if (!client) return;
  
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : 'anon');
  
  try {
    PHOTOREQ._channel = client
      .channel(`photo-logs-watch-${myId}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'photo_logs' },
        _photoReqOnRealtimeEvent
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[photoReq] realtime subscribed');
        }
      });
  } catch (e) {
    console.error('[photoReq] subscribe failed:', e);
    PHOTOREQ._channel = null;
  }
}

function _photoReqOnRealtimeEvent(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : 'anon');
  
  // 1. 更新本地缓存(无论事件类型 · 保持数据新鲜)
  if (eventType === 'INSERT' && newRow) {
    // 加到列表头部
    PHOTOREQ._allLogs.unshift(newRow);
  } else if (eventType === 'UPDATE' && newRow) {
    const idx = PHOTOREQ._allLogs.findIndex(l => l.id === newRow.id);
    if (idx >= 0) PHOTOREQ._allLogs[idx] = newRow;
    else PHOTOREQ._allLogs.unshift(newRow);  // 之前不在缓存里(超出 500) · 现在出现了
  } else if (eventType === 'DELETE' && oldRow) {
    PHOTOREQ._allLogs = PHOTOREQ._allLogs.filter(l => l.id !== oldRow.id);
  }
  
  // 2. 弹 toast(throttle · 3 秒内不重复弹)
  const now = Date.now();
  const sinceLastToast = now - (PHOTOREQ._lastToastAt || 0);
  const canToast = sinceLastToast > 3000;
  
  if (canToast && typeof toast === 'function') {
    if (eventType === 'INSERT' && newRow?.external_request) {
      const src = newRow.external_request.source;
      // 只弹 客服/跟单/销售 来源(自发的不弹 · 避免拍摄部内部操作刷屏)
      if (['客服', '跟单', '销售'].includes(src)) {
        const from = newRow.external_request.from_name || '';
        toast(`📨 新需求:${newRow.product_name}${from ? ' · ' + src + '·' + from : ''}`, 'info', 2500);
        PHOTOREQ._lastToastAt = now;
      }
    } else if (eventType === 'UPDATE' && newRow?.external_request?.from_user_id === myId) {
      // V28c (v4 #3.1):入库事件 · 自己提的被入库
      const wasWarehoused = !!oldRow?.warehouse_info;
      const isWarehoused = !!newRow?.warehouse_info;
      
      if (!wasWarehoused && isWarehoused) {
        // 入库
        const w = newRow.warehouse_info;
        toast(`📦 你提的「${newRow.product_name}」已入库 · 原因:${w.reason || '?'}${w.by_name ? ' · 操作人:' + w.by_name : ''}`, 'warn', 8000);
        PHOTOREQ._lastToastAt = now;
      } else if (wasWarehoused && !isWarehoused) {
        // 唤醒
        toast(`✨ 你提的「${newRow.product_name}」已唤醒出库 · 货到位了 · 拍摄部继续跟进`, 'success', 8000);
        PHOTOREQ._lastToastAt = now;
      } else if (oldRow && oldRow.status !== newRow.status) {
        // 普通状态变化(不在仓库 · 仓库变化已在上面处理)
        const statusMap = {
          shooting:  '📷 拍摄部已接',
          shot:      '✓ 已拍完',
          editing:   '🎬 剪辑中',
          edited:    '✓ 已剪辑',
          uploading: '⬆️ 上传中',
          done:      '✅ 完成 · 已上线',
        };
        const label = statusMap[newRow.status];
        if (label) {
          toast(`你提的「${newRow.product_name}」→ ${label}`, 'success', 3000);
          PHOTOREQ._lastToastAt = now;
        }
      }
    }
  }
  
  // 3. 静默刷新列表(应用当前 filter)
  _photoReqApplyFilterAndRender();
}

// 退出 tab / 切到别的 tab 时退订(释放资源)
function _photoReqUnsubscribeRealtime() {
  if (PHOTOREQ._channel) {
    try {
      const client = _photoReqClient();
      if (client) client.removeChannel(PHOTOREQ._channel);
    } catch (_) {}
    PHOTOREQ._channel = null;
  }
}
window._photoReqUnsubscribeRealtime = _photoReqUnsubscribeRealtime;

// ============================================================================
// V20260527z(v3 #4 + #5):编辑模式 · 区分可编辑 vs 只读 · merge 不覆盖
// ============================================================================
let PHOTOREQ_EDIT = null;

// 可编辑字段白名单(v3 #4)
const PHOTOREQ_EDITABLE_FIELDS = [
  'product_name', 'sku', 'product_image', 'applicable_shops', 'product_type', 'product_notes'
];

function photoReqOpenEdit(logId) {
  const log = (PHOTOREQ._allLogs || []).find(l => l.id === logId);
  if (!log) { toast('找不到该需求 · 可能刚被删除', 'warn'); return; }
  
  // V28c (v4 #2.4):仓库中的不能编辑
  if (_photoReqIsWarehoused(log)) {
    toast(`📦 此记录在仓库中 · 等拍摄部唤醒后才能改`, 'warn', 3000);
    return;
  }
  
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : 'anon');
  
  PHOTOREQ_EDIT = {
    logId,
    originalUpdatedAt: log.updated_at,
    isMine: log.external_request?.from_user_id === myId,
    // 可编辑字段(从 log 拷贝当前值)
    product_name: log.product_name || '',
    sku: log.sku || '',
    product_image: log.product_image || '',
    applicable_shops: Array.isArray(log.applicable_shops) ? [...log.applicable_shops] : [],
    product_type: log.product_type || '',
    product_notes: log.product_notes || '',
    // external_request 追加用
    reason_append: '',
    new_attachments: [],
    urgency_upgrade: null,  // null = 不变 / 'urgent' = 升级加急
    // 只读引用
    _readonly: log,
  };
  
  document.getElementById('photoReqEditModal').style.display = 'flex';
  _photoReqRenderEdit();
  if (typeof _disableAutofillOnFields === 'function') {
    setTimeout(() => _disableAutofillOnFields(document.getElementById('photoReqEditModal')), 0);
  }
}
window.photoReqOpenEdit = photoReqOpenEdit;

function photoReqCloseEdit() {
  document.getElementById('photoReqEditModal').style.display = 'none';
  PHOTOREQ_EDIT = null;
}
window.photoReqCloseEdit = photoReqCloseEdit;

function _photoReqRenderEdit() {
  const s = PHOTOREQ_EDIT;
  if (!s) return;
  const log = s._readonly;
  const ext = log.external_request || {};
  const body = document.getElementById('photoReqEditBody');
  
  // 黄色边框样式 · 可编辑字段统一用
  const editBorder = 'border:2px solid #f59e0b; background:rgba(245,158,11,0.03);';
  // 灰色样式 · 只读字段
  const readonlyStyle = 'background:var(--bg-elevated); color:var(--text-tertiary); border:1px solid var(--border-subtle); padding:8px 10px; border-radius:5px; font-size:12.5px;';
  
  body.innerHTML = `
    <!-- 编辑模式提示 -->
    <div style="padding:10px 12px; background:rgba(245,158,11,0.08); border-left:3px solid #f59e0b; border-radius:0 6px 6px 0; margin-bottom:14px; font-size:11.5px; color:var(--text-secondary); line-height:1.6;">
      📝 你正在编辑「${escapeHtml(log.product_name || '(无名)')}」<br>
      <span style="color:var(--text-tertiary);">${s.isMine ? '👤 这条是你提的 · 全部可改' : '👥 这条是别人提的 · 只能改产品基础信息 + 追加补充原因/附件'}</span>
    </div>

    <!-- 可编辑字段区 -->
    <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">📝 产品基础信息(任何人都可改)</div>
    
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px; margin-bottom:12px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">产品名</label>
        <input type="text" value="${escapeHtml(s.product_name)}" oninput="PHOTOREQ_EDIT.product_name=this.value"
               style="width:100%; padding:7px 10px; font-size:13px; border-radius:5px; ${editBorder}">
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">SKU</label>
        <input type="text" value="${escapeHtml(s.sku)}" oninput="PHOTOREQ_EDIT.sku=this.value"
               style="width:100%; padding:7px 10px; font-size:13px; border-radius:5px; font-family:monospace; ${editBorder}">
      </div>
    </div>
    
    <div style="margin-bottom:12px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">应用店铺(多选)</label>
      <div style="display:flex; flex-wrap:wrap; gap:5px; padding:6px; border-radius:5px; ${editBorder}">
        ${PHOTOREQ_SHOPS.map(shop => {
          const checked = s.applicable_shops.includes(shop);
          return `<span onclick="_photoReqEditToggleShop('${escapeHtml(shop).replace(/'/g, "\\'")}')"
                        style="padding:4px 9px; font-size:11.5px; border:1px solid ${checked ? 'var(--accent)' : 'var(--border)'}; border-radius:12px; cursor:pointer; user-select:none; background:${checked ? 'var(--accent)' : 'var(--bg-card)'}; color:${checked ? 'white' : 'var(--text-secondary)'}; font-weight:${checked ? '600' : '400'};">
                    ${checked ? '✓ ' : ''}${escapeHtml(shop)}
                  </span>`;
        }).join('')}
      </div>
    </div>
    
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">类型</label>
        <select onchange="PHOTOREQ_EDIT.product_type=this.value"
                style="width:100%; padding:7px 10px; font-size:13px; border-radius:5px; ${editBorder}">
          ${[
            { v: '', label: '— 未指定 —' },
            { v: '新款', label: '🆕 新款' },
            { v: '常规', label: '📦 常规产品' },
            { v: '样品', label: '🧪 样品' },
            { v: '现货', label: '✅ 现货' },
            { v: '定制', label: '💎 定制' },
            { v: '客服需求', label: '📨 客服需求' },
            { v: '跟单需求', label: '📋 跟单需求' },
          ].map(o => `<option value="${o.v}" ${s.product_type === o.v ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">产品图 URL <span style="color:var(--text-tertiary);font-weight:400;">(可粘 URL 或上传图片)</span></label>
        <div style="display:flex; gap:6px; align-items:center;">
          <input type="text" value="${escapeHtml(s.product_image)}" oninput="PHOTOREQ_EDIT.product_image=this.value"
                 placeholder="https://...png"
                 style="flex:1; padding:7px 10px; font-size:12px; border-radius:5px; ${editBorder}">
          <label class="btn small" style="white-space:nowrap; cursor:pointer; ${s._imgUploading?'opacity:.6;pointer-events:none;':''}">${s._imgUploading?'上传中…':'📤 上传图片'}
            <input type="file" accept="image/*" style="display:none;" onchange="photoReqEditPickImage(this)">
          </label>
        </div>
        ${s.product_image ? `<img src="${escapeHtml(s.product_image)}" style="margin-top:6px; width:64px; height:64px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">` : ''}
      </div>
    </div>
    
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">产品备注 · 特殊属性 / 尺寸 / 材质提醒</label>
      <textarea oninput="PHOTOREQ_EDIT.product_notes=this.value" rows="2"
                placeholder="例:客户要黄铜色 · 高度 1.5m · 110V 美规"
                style="width:100%; padding:8px 10px; font-size:12.5px; border-radius:5px; resize:vertical; font-family:inherit; ${editBorder}">${escapeHtml(s.product_notes)}</textarea>
    </div>
    
    <!-- 补充原因 + 追加附件(走 external_request append) -->
    <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-subtle);">
      <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">➕ 追加补充(不覆盖原始内容)</div>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">补充原因(会追加到原 reason 末尾 · 带日期标记)</label>
        <textarea oninput="PHOTOREQ_EDIT.reason_append=this.value" rows="2"
                  placeholder="客户又补充了 · 要求颜色再深一点..."
                  style="width:100%; padding:8px 10px; font-size:12.5px; border-radius:5px; resize:vertical; font-family:inherit; border:2px solid #f59e0b; background:rgba(245,158,11,0.03);">${escapeHtml(s.reason_append)}</textarea>
        ${ext.reason ? `
          <details style="margin-top:6px;">
            <summary style="font-size:10.5px; color:var(--text-tertiary); cursor:pointer;">查看原 reason</summary>
            <div style="margin-top:4px; padding:6px 8px; background:var(--bg-elevated); border-radius:4px; font-size:11.5px; color:var(--text-secondary); white-space:pre-wrap; max-height:120px; overflow-y:auto;">${escapeHtml(ext.reason)}</div>
          </details>` : ''}
      </div>
      
      ${(s.urgency_upgrade === null && ext.urgency !== 'urgent') ? `
        <div style="margin-bottom:6px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-secondary); cursor:pointer;">
            <input type="checkbox" onchange="PHOTOREQ_EDIT.urgency_upgrade=this.checked?'urgent':null; _photoReqRenderEdit()">
            升级为 🚨 加急(客户投诉 / 平台 dispute 等)
          </label>
        </div>
      ` : ext.urgency === 'urgent' ? `
        <div style="font-size:11px; color:var(--danger); margin-bottom:6px;">🚨 当前已经是加急状态</div>
      ` : `
        <div style="font-size:11px; color:var(--danger); margin-bottom:6px;">🚨 将升级为加急(保存生效)<button onclick="PHOTOREQ_EDIT.urgency_upgrade=null; _photoReqRenderEdit()" style="margin-left:6px; font-size:10px; padding:1px 6px;">取消升级</button></div>
      `}
    </div>
    
    <!-- 只读区 · 拍摄部填的字段 -->
    <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-subtle);">
      <div style="font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">🔒 以下是拍摄部/系统填的 · 你只能看</div>
      
      <div style="display:grid; grid-template-columns: 100px 1fr; gap:8px 12px; font-size:12px;">
        <div style="color:var(--text-tertiary);">状态:</div>
        <div style="${readonlyStyle}">${PHOTOREQ_STATUS_LABEL[log.status]?.emoji || '?'} ${PHOTOREQ_STATUS_LABEL[log.status]?.text || log.status}</div>
        
        <div style="color:var(--text-tertiary);">紧急度:</div>
        <div style="${readonlyStyle}">${log.priority || 'normal'}</div>
        
        ${log.photographer_name ? `
          <div style="color:var(--text-tertiary);">摄影师:</div>
          <div style="${readonlyStyle}">📷 ${escapeHtml(log.photographer_name)}${log.shoot_date ? ' (' + log.shoot_date + ')' : ''}</div>
        ` : ''}
        
        ${log.editor_name ? `
          <div style="color:var(--text-tertiary);">剪辑师:</div>
          <div style="${readonlyStyle}">🎬 ${escapeHtml(log.editor_name)}${log.edit_date ? ' (' + log.edit_date + ')' : ''}</div>
        ` : ''}
        
        ${log.pre_shoot_review?.status ? `
          <div style="color:var(--text-tertiary);">美工预审:</div>
          <div style="${readonlyStyle}">${PHOTOREQ_PRE_SHOOT_LABEL[log.pre_shoot_review.status] || log.pre_shoot_review.status}</div>
        ` : ''}
        
        ${log.review?.status ? `
          <div style="color:var(--text-tertiary);">视频审核:</div>
          <div style="${readonlyStyle}">${PHOTOREQ_REVIEW_LABEL[log.review.status] || log.review.status}</div>
        ` : ''}
        
        ${log.url_horizontal ? `
          <div style="color:var(--text-tertiary);">视频:</div>
          <div style="${readonlyStyle}"><a href="${escapeHtml(log.url_horizontal)}" target="_blank" style="color:var(--accent);">📺 横版</a>${log.url_vertical ? ' · <a href="' + escapeHtml(log.url_vertical) + '" target="_blank" style="color:var(--accent);">📱 竖版</a>' : ''}</div>
        ` : ''}
      </div>
    </div>
  `;
}

// V20260606:编辑拍摄需求 · 上传产品图(复用批量行上传逻辑)· 修"忘记加图、编辑时加不进去"
async function photoReqEditPickImage(input) {
  const file = input && input.files && input.files[0];
  if (!file || !PHOTOREQ_EDIT) { if (input) input.value=''; return; }
  try {
    PHOTOREQ_EDIT._imgUploading = true; _photoReqRenderEdit();
    const url = await _photoReqBatchUploadOne(file);
    PHOTOREQ_EDIT.product_image = url;
    PHOTOREQ_EDIT._imgUploading = false; _photoReqRenderEdit();
    if (typeof toast === 'function') toast('✓ 图片已上传', 'success');
  } catch (e) {
    PHOTOREQ_EDIT._imgUploading = false; _photoReqRenderEdit();
    if (typeof toast === 'function') toast('上传失败:' + (e.message || e), 'err', 5000);
  }
}
window.photoReqEditPickImage = photoReqEditPickImage;

function _photoReqEditToggleShop(shop) {
  if (!PHOTOREQ_EDIT) return;
  const arr = PHOTOREQ_EDIT.applicable_shops;
  const idx = arr.indexOf(shop);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(shop);
  _photoReqRenderEdit();
}
window._photoReqEditToggleShop = _photoReqEditToggleShop;

// 保存编辑 · 两步:1) update 基础字段(白名单)2) merge external_request(append-only)
async function photoReqSaveEdit() {
  const s = PHOTOREQ_EDIT;
  if (!s) return;
  
  const client = _photoReqClient();
  if (!client) { toast('Supabase 客户端未初始化', 'err'); return; }
  
  // 校验
  if (!(s.product_name || '').trim()) { toast('产品名不能为空', 'warn'); return; }
  
  const nowIso = new Date().toISOString();
  
  try {
    // STEP 1:更新可编辑字段(只走白名单)
    const basicsUpdate = {
      product_name: s.product_name.trim(),
      sku: (s.sku || '').trim() || null,
      product_image: (s.product_image || '').trim() || null,
      applicable_shops: s.applicable_shops || [],
      product_type: (s.product_type || '').trim() || null,
      product_notes: (s.product_notes || '').trim() || null,
      updated_at: nowIso,
    };
    const { error: err1 } = await client.from('photo_logs')
      .update(basicsUpdate)
      .eq('id', s.logId);
    if (err1) throw err1;
    
    // STEP 2:如果有补充原因 / 升级加急,merge external_request(先 fetch 再写)
    const needMerge = (s.reason_append || '').trim() || s.urgency_upgrade;
    if (needMerge) {
      const { data: row, error: err2 } = await client.from('photo_logs')
        .select('external_request')
        .eq('id', s.logId)
        .single();
      if (err2) throw err2;
      
      const current = row?.external_request || {};
      const merged = { ...current };
      
      // 追加 reason(带日期标记)
      if ((s.reason_append || '').trim()) {
        const dateStr = new Date().toLocaleDateString('zh-CN');
        const myName = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) ? CURRENT_AGENT : '我';
        merged.reason = (current.reason || '') + 
          `\n\n--- ${dateStr} ${myName} 补充 ---\n` + 
          s.reason_append.trim();
      }
      
      // 升级加急
      if (s.urgency_upgrade === 'urgent') {
        merged.urgency = 'urgent';
      }
      
      const finalUpdate = {
        external_request: merged,
        updated_at: nowIso,
      };
      if (s.urgency_upgrade === 'urgent') finalUpdate.priority = 'urgent';
      
      const { error: err3 } = await client.from('photo_logs')
        .update(finalUpdate)
        .eq('id', s.logId);
      if (err3) throw err3;
    }
    
    toast('✓ 已保存修改', 'success', 2000);
    photoReqCloseEdit();
    // 触发列表刷新(realtime 也会推送 · 这里手动刷以防延迟)
    setTimeout(() => _photoReqLoadAndRender(), 100);
  } catch (e) {
    console.error('保存编辑失败:', e);
    toast('保存失败:' + (e.message || e), 'err', 4000);
  }
}
window.photoReqSaveEdit = photoReqSaveEdit;

// ============================================================================
// V20260527z(v3 #7):批量录入 · 跟单专员/主管专属
// 多行表格 · 默认值统一 · Promise.allSettled 并行 insert · 同批次 batch_id 一致
// ============================================================================
let PHOTOREQ_BATCH = null;

function photoReqOpenBatch() {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) {
    toast('批量录入仅限主管 / 跟单专员', 'warn');
    return;
  }
  
  PHOTOREQ_BATCH = {
    rows: [
      _photoReqBatchEmptyRow(),
      _photoReqBatchEmptyRow(),
      _photoReqBatchEmptyRow(),
    ],
    defaults: {
      urgency: 'normal',
      reason_prefix: '',
      batch_id: crypto.randomUUID(),
    },
    submitting: false,
  };
  
  document.getElementById('photoReqBatchModal').style.display = 'flex';
  _photoReqRenderBatch();
}
window.photoReqOpenBatch = photoReqOpenBatch;

function photoReqCloseBatch() {
  document.getElementById('photoReqBatchModal').style.display = 'none';
  PHOTOREQ_BATCH = null;
}
window.photoReqCloseBatch = photoReqCloseBatch;

function _photoReqBatchEmptyRow() {
  return {
    _id: 'r' + Math.random().toString(36).slice(2, 9),
    product_name: '',
    sku: '',
    applicable_shops: [],
    urgency: '',  // 空 = 用默认
    reason: '',
    product_image: '',  // V28h: 每行支持图片(上传/粘贴)
    _uploading: false,
  };
}

// V28h: 批量行 · 通用单图上传(压缩 + 传 storage · 返回 publicUrl)
async function _photoReqBatchUploadOne(file) {
  const client = _photoReqClient();
  if (!client) throw new Error('Supabase 未初始化');
  const compressed = await _photoReqCompressImage(file);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `cs-requests/batch-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await client.storage.from('attachments')
    .upload(path, compressed, { upsert: false, contentType: compressed.type });
  if (error) throw error;
  const { data: { publicUrl } } = client.storage.from('attachments').getPublicUrl(path);
  return publicUrl;
}

// V28h: 批量行 · 选文件上传
async function _photoReqBatchPickImage(rowId, fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const r = PHOTOREQ_BATCH?.rows.find(x => x._id === rowId);
  if (!r) return;
  r._uploading = true;
  _photoReqRenderBatch();
  try {
    r.product_image = await _photoReqBatchUploadOne(file);
    toast('✓ 图片已上传', 'success', 1500);
  } catch (e) {
    toast('上传失败:' + (e.message || e), 'err');
  } finally {
    r._uploading = false;
    _photoReqRenderBatch();
  }
}
window._photoReqBatchPickImage = _photoReqBatchPickImage;

// V28h: 批量行 · 粘贴图片(Ctrl+V)
async function _photoReqBatchPasteImage(rowId, e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      e.preventDefault();
      const file = it.getAsFile();
      if (!file) continue;
      const r = PHOTOREQ_BATCH?.rows.find(x => x._id === rowId);
      if (!r) return;
      r._uploading = true;
      _photoReqRenderBatch();
      try {
        r.product_image = await _photoReqBatchUploadOne(file);
        toast('✓ 粘贴图片已上传', 'success', 1500);
      } catch (err) {
        toast('上传失败:' + (err.message || err), 'err');
      } finally {
        r._uploading = false;
        _photoReqRenderBatch();
      }
      return;
    }
  }
}
window._photoReqBatchPasteImage = _photoReqBatchPasteImage;

// V28h: 批量行 · 清除图片
function _photoReqBatchClearImage(rowId) {
  const r = PHOTOREQ_BATCH?.rows.find(x => x._id === rowId);
  if (r) { r.product_image = ''; _photoReqRenderBatch(); }
}
window._photoReqBatchClearImage = _photoReqBatchClearImage;

function _photoReqRenderBatch() {
  const s = PHOTOREQ_BATCH;
  if (!s) return;
  const body = document.getElementById('photoReqBatchBody');
  
  body.innerHTML = `
    <!-- 默认设置区 -->
    <div style="display:grid; grid-template-columns: 1fr 2fr; gap:12px; padding:12px; background:rgba(124,58,237,0.05); border-radius:8px; margin-bottom:14px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">统一紧急度</label>
        <select onchange="PHOTOREQ_BATCH.defaults.urgency=this.value" style="width:100%; padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
          <option value="normal" ${s.defaults.urgency === 'normal' ? 'selected' : ''}>普通</option>
          <option value="urgent" ${s.defaults.urgency === 'urgent' ? 'selected' : ''}>🚨 加急</option>
        </select>
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">统一原因前缀(可选 · 会自动加到每条原因前)</label>
        <input type="text" value="${escapeHtml(s.defaults.reason_prefix)}" oninput="PHOTOREQ_BATCH.defaults.reason_prefix=this.value"
               placeholder="例:本周新品汇总 / 周五拍摄计划"
               style="width:100%; padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
      </div>
    </div>
    
    <!-- 表格 header -->
    <div style="display:grid; grid-template-columns: 56px 1.5fr 0.9fr 1.6fr 84px 1.6fr 32px; gap:6px; padding:8px 10px; background:var(--bg-elevated); font-size:10.5px; font-weight:600; color:var(--text-tertiary); border-radius:6px 6px 0 0; text-transform:uppercase;">
      <div>图片</div>
      <div>产品名 *</div>
      <div>SKU</div>
      <div>店铺</div>
      <div>紧急度</div>
      <div>原因</div>
      <div></div>
    </div>
    
    <!-- 表格 rows -->
    <div style="border:1px solid var(--border); border-top:0; border-radius:0 0 6px 6px; overflow:hidden;">
      ${s.rows.map((r, idx) => _photoReqBatchRowHtml(r, idx)).join('')}
    </div>
    
    <!-- 操作 -->
    <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
      <button class="btn small" onclick="_photoReqBatchAddRow()" style="padding:5px 12px;">+ 加一行</button>
      <button class="btn small" onclick="_photoReqBatchAddRows(5)" style="padding:5px 12px;">+ 加 5 行</button>
      <span style="margin-left:auto; font-size:11.5px; color:var(--text-secondary);">共 <b style="color:var(--purple);">${s.rows.filter(r => r.product_name.trim()).length}</b> 行待提交(${s.rows.length} 总)</span>
    </div>
    
    <div style="margin-top:14px; padding:10px 12px; background:rgba(13,148,136,0.05); border-left:3px solid var(--teal); border-radius:0 6px 6px 0; font-size:11px; color:var(--text-secondary); line-height:1.6;">
      💡 <b>使用提示:</b><br>
      · 只有"产品名"是必填 · 其他都可后续编辑(走 ✏ 编辑)<br>
      · 提交后立刻出现在拍摄部首页(每条独立 PO 一样)· 同一批次的 batch_id 一致(后续可查同一批)<br>
      · 失败的行不影响其他成功的(Promise.allSettled)
    </div>
  `;
}

function _photoReqBatchRowHtml(r, idx) {
  const shopsLabel = r.applicable_shops.length > 0 
    ? r.applicable_shops.join(' · ') 
    : '<span style="color:var(--text-tertiary);">未选</span>';
  // V28h: 图片单元格(上传/粘贴/预览)
  const imgCell = r._uploading
    ? `<div style="width:48px; height:48px; border-radius:5px; background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--text-tertiary);">⏳</div>`
    : r.product_image
      ? `<div style="position:relative; width:48px; height:48px;">
           <img src="${escapeHtml(r.product_image)}" style="width:48px; height:48px; object-fit:cover; border-radius:5px; cursor:zoom-in;" onclick="openImgLightbox && openImgLightbox('${escapeHtml(r.product_image)}')">
           <button onclick="_photoReqBatchClearImage('${r._id}')" style="position:absolute; top:-6px; right:-6px; width:16px; height:16px; border-radius:50%; background:var(--danger); color:white; border:0; font-size:10px; cursor:pointer; line-height:1; padding:0;" title="移除">✕</button>
         </div>`
      : `<label tabindex="0" onpaste="_photoReqBatchPasteImage('${r._id}', event)" title="点击上传 · 或选中后 Ctrl+V 粘贴"
              style="width:48px; height:48px; border:1px dashed var(--border); border-radius:5px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; font-size:9px; color:var(--text-tertiary); gap:1px; outline:none;">
           <span style="font-size:15px;">📷</span>
           <span style="font-size:8px;">贴/传</span>
           <input type="file" accept="image/*" style="display:none;" onchange="_photoReqBatchPickImage('${r._id}', this)">
         </label>`;
  return `
    <div style="display:grid; grid-template-columns: 56px 1.5fr 0.9fr 1.6fr 84px 1.6fr 32px; gap:6px; padding:6px 10px; border-top:${idx > 0 ? '1px solid var(--border-subtle)' : '0'}; align-items:center;">
      <div>${imgCell}</div>
      <input type="text" value="${escapeHtml(r.product_name)}" oninput="_photoReqBatchSetField('${r._id}','product_name',this.value); _photoReqBatchUpdateCount()"
             placeholder="必填..."
             style="padding:6px 8px; font-size:12px; border:1px solid ${r.product_name.trim() ? 'var(--border)' : 'rgba(245,158,11,0.4)'}; border-radius:4px;">
      <input type="text" value="${escapeHtml(r.sku)}" oninput="_photoReqBatchSetField('${r._id}','sku',this.value)"
             placeholder="可选"
             style="padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:4px; font-family:monospace;">
      <div onclick="_photoReqBatchOpenShops('${r._id}')" style="padding:6px 8px; font-size:11.5px; border:1px solid var(--border); border-radius:4px; cursor:pointer; background:var(--bg-card); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(r.applicable_shops.join(' / '))}">
        ${shopsLabel}
      </div>
      <select onchange="_photoReqBatchSetField('${r._id}','urgency',this.value)"
              style="padding:6px 8px; font-size:11.5px; border:1px solid var(--border); border-radius:4px;">
        <option value="" ${!r.urgency ? 'selected' : ''}>默认</option>
        <option value="normal" ${r.urgency === 'normal' ? 'selected' : ''}>普通</option>
        <option value="urgent" ${r.urgency === 'urgent' ? 'selected' : ''}>🚨 加急</option>
      </select>
      <input type="text" value="${escapeHtml(r.reason)}" oninput="_photoReqBatchSetField('${r._id}','reason',this.value)"
             placeholder="可选"
             style="padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:4px;">
      <button onclick="_photoReqBatchRemoveRow('${r._id}')" style="padding:4px 8px; font-size:11px; color:var(--danger); background:transparent; border:1px solid transparent; cursor:pointer; border-radius:4px;" title="删除此行">✕</button>
    </div>
  `;
}

function _photoReqBatchSetField(rowId, field, val) {
  if (!PHOTOREQ_BATCH) return;
  const r = PHOTOREQ_BATCH.rows.find(x => x._id === rowId);
  if (r) r[field] = val;
}
window._photoReqBatchSetField = _photoReqBatchSetField;

function _photoReqBatchUpdateCount() {
  // 只更新计数 · 不全重渲(防止焦点丢失)
  // 实际触发是用户输入完整产品名时 · 此处轻量刷新
  if (!PHOTOREQ_BATCH) return;
  const cnt = PHOTOREQ_BATCH.rows.filter(r => r.product_name.trim()).length;
  // 简单粗暴 · 找到计数 b 元素更新
  const counts = document.querySelectorAll('#photoReqBatchBody b');
  if (counts.length) counts[counts.length - 1].textContent = cnt;
}
window._photoReqBatchUpdateCount = _photoReqBatchUpdateCount;

function _photoReqBatchAddRow() {
  if (!PHOTOREQ_BATCH) return;
  PHOTOREQ_BATCH.rows.push(_photoReqBatchEmptyRow());
  _photoReqRenderBatch();
}
window._photoReqBatchAddRow = _photoReqBatchAddRow;

function _photoReqBatchAddRows(n) {
  if (!PHOTOREQ_BATCH) return;
  for (let i = 0; i < n; i++) PHOTOREQ_BATCH.rows.push(_photoReqBatchEmptyRow());
  _photoReqRenderBatch();
}
window._photoReqBatchAddRows = _photoReqBatchAddRows;

function _photoReqBatchRemoveRow(rowId) {
  if (!PHOTOREQ_BATCH) return;
  PHOTOREQ_BATCH.rows = PHOTOREQ_BATCH.rows.filter(r => r._id !== rowId);
  // 至少保留 1 行
  if (PHOTOREQ_BATCH.rows.length === 0) PHOTOREQ_BATCH.rows.push(_photoReqBatchEmptyRow());
  _photoReqRenderBatch();
}
window._photoReqBatchRemoveRow = _photoReqBatchRemoveRow;

// 简易店铺多选 · prompt 输入 · 后续可改为 popover(本轮先简单)
function _photoReqBatchOpenShops(rowId) {
  if (!PHOTOREQ_BATCH) return;
  const r = PHOTOREQ_BATCH.rows.find(x => x._id === rowId);
  if (!r) return;
  // 弹一个简单选择 dialog
  const shopList = PHOTOREQ_SHOPS.map((s, i) => `${i + 1}. ${r.applicable_shops.includes(s) ? '✓' : '·'} ${s}`).join('\n');
  const input = prompt(`选择店铺(输入序号 · 逗号分隔)\n\n${shopList}\n\n例:1,3,5 · 留空清除`, r.applicable_shops.map(sh => PHOTOREQ_SHOPS.indexOf(sh) + 1).join(','));
  if (input === null) return;  // 取消
  if (input.trim() === '') {
    r.applicable_shops = [];
  } else {
    const idxs = input.split(/[,，\s]+/).map(x => parseInt(x.trim()) - 1).filter(x => x >= 0 && x < PHOTOREQ_SHOPS.length);
    r.applicable_shops = [...new Set(idxs.map(i => PHOTOREQ_SHOPS[i]))];
  }
  _photoReqRenderBatch();
}
window._photoReqBatchOpenShops = _photoReqBatchOpenShops;

async function photoReqSubmitBatch() {
  const s = PHOTOREQ_BATCH;
  if (!s) return;
  if (s.submitting) return;
  
  // 过滤空行(product_name 为空的不提交)
  const validRows = s.rows.filter(r => (r.product_name || '').trim());
  if (validRows.length === 0) { toast('没有可提交的行 · 至少填一个产品名', 'warn'); return; }
  
  const client = _photoReqClient();
  if (!client) { toast('Supabase 客户端未初始化', 'err'); return; }
  
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) 
             : (typeof CURRENT_AGENT !== 'undefined' ? String(CURRENT_AGENT) : 'unknown');
  const myName = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) ? CURRENT_AGENT : '跟单';
  
  if (!confirm(`确认提交 ${validRows.length} 条拍摄需求?\n\n紧急度默认:${s.defaults.urgency === 'urgent' ? '🚨 加急' : '普通'}\n原因前缀:${s.defaults.reason_prefix || '(无)'}`)) return;
  
  s.submitting = true;
  document.getElementById('photoReqBatchSubmitBtn').textContent = '⏳ 提交中...';
  document.getElementById('photoReqBatchSubmitBtn').disabled = true;
  
  const now = Date.now();
  const nowIso = new Date().toISOString();
  
  const inserts = validRows.map(r => {
    const urgency = r.urgency || s.defaults.urgency || 'normal';
    let reason = (r.reason || '').trim();
    if (s.defaults.reason_prefix) {
      reason = s.defaults.reason_prefix + (reason ? ' · ' + reason : '');
    }
    return {
      id: crypto.randomUUID(),
      product_name: r.product_name.trim(),
      sku: (r.sku || '').trim() || null,
      product_image: (r.product_image || '').trim() || null,
      applicable_shops: r.applicable_shops || [],
      product_type: '跟单需求',
      status: 'draft',
      priority: urgency,
      external_request: {
        source: '跟单',
        from_name: myName,
        from_user_id: myId,
        from_dept: '跟单部',
        reason: reason || '(批量录入 · 待补充)',
        urgency,
        attachments: [],
        created_at_ms: now,
        external_ref_id: null,
        batch_id: s.defaults.batch_id,
      },
      created_by_id: myId,
      created_by_name: myName,
      created_at_ms: now,
      updated_at: nowIso,
    };
  });
  
  // 并行提交 · 不会因单个失败影响其他
  const results = await Promise.allSettled(
    inserts.map(row => client.from('photo_logs').insert(row))
  );
  
  let succeeded = 0;
  let failed = 0;
  const errorMsgs = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled' && !r.value.error) {
      succeeded++;
    } else {
      failed++;
      const err = r.status === 'rejected' ? r.reason : r.value.error;
      errorMsgs.push(`行 ${idx + 1} (${validRows[idx].product_name}):${err?.message || err}`);
    }
  });
  
  s.submitting = false;
  
  if (failed === 0) {
    toast(`✓ 全部 ${succeeded} 条提交成功`, 'success', 3000);
    photoReqCloseBatch();
    setTimeout(() => _photoReqLoadAndRender(), 200);
  } else {
    document.getElementById('photoReqBatchSubmitBtn').textContent = '💾 批量提交';
    document.getElementById('photoReqBatchSubmitBtn').disabled = false;
    alert(`⚠ 部分失败 · 成功 ${succeeded} 条 · 失败 ${failed} 条\n\n${errorMsgs.join('\n')}`);
    if (succeeded > 0) {
      // 移除已成功的行 · 让用户重试失败的
      // (简单实现:直接关 modal,让用户进列表看)
      toast(`✓ ${succeeded} 条已成功 · ${failed} 条失败 · 见弹窗详情`, 'warn', 5000);
      setTimeout(() => _photoReqLoadAndRender(), 200);
    }
  }
}
window.photoReqSubmitBatch = photoReqSubmitBatch;
