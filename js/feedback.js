// ============================================================
// 📮 反馈中心 · 闭环 Bug/需求/改进 管理
// ============================================================
// 文件:feedback.js · V5-W3-2026-05-26
// 流程:员工提反馈 → DB → 老板导出给 Claude → Claude 分析 → 你确认 → Claude 实施 → 部署 → 标记
// ============================================================

const FEEDBACK_TYPES = {
  bug: { icon: '🐛', label: 'Bug',     color: '#dc2626' },
  feature: { icon: '💡', label: '新功能', color: '#7c3aed' },
  improvement: { icon: '🔧', label: '改进', color: '#0891b2' },
};
const FEEDBACK_SEVERITIES = {
  urgent: { icon: '🔴', label: '紧急(卡死)',     color: '#dc2626' },
  high:   { icon: '🟠', label: '高(影响主业务)', color: '#ea580c' },
  normal: { icon: '🟡', label: '中(体验问题)',   color: '#eab308' },
  low:    { icon: '🟢', label: '低(优化建议)',   color: '#22c55e' },
};
const FEEDBACK_STATUSES = {
  pending:     { label: '待分析',  color: '#6b7280', desc: '已提交 · 等待老板/Claude 看' },
  analyzing:   { label: 'Claude 分析中', color: '#7c3aed', desc: '老板已导出给 Claude' },
  approved:    { label: '已确认 · 待修复', color: '#0891b2', desc: '老板确认 · 等 Claude 改' },
  in_progress: { label: '改造中',  color: '#2563eb', desc: 'Claude 正在改代码' },
  resolved:    { label: '✅ 已修复', color: '#16a34a', desc: '已部署到生产' },
  rejected:    { label: '❌ 不修复', color: '#dc2626', desc: '老板决定暂不做' },
  duplicate:   { label: '🔁 重复',  color: '#9ca3af', desc: '与其他反馈重复' },
};

let FEEDBACK_ITEMS = [];
let _feedbackRealtimeSub = null;
let _feedbackFilters = { type: '', status: '', severity: '', module: '', mine: false };
let _feedbackCurrentDetailId = null;

// ============================================================
// 初始化 + 加载
// ============================================================

async function feedbackInit() {
  // 复用 cdmClient(跨部门 Supabase)
  if (typeof cdmClient === 'undefined' || !cdmClient) {
    console.warn('[FEEDBACK] cdmClient 未初始化');
    return;
  }
  await feedbackLoad();
  feedbackSubscribeRealtime();
}

async function feedbackLoad() {
  if (!cdmClient) return;
  try {
    const { data, error } = await cdmClient
      .from('system_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.warn('[FEEDBACK] 加载失败(可能 table 不存在):', error.message);
      // localStorage 兜底
      try { FEEDBACK_ITEMS = JSON.parse(localStorage.getItem('feedback_items_local') || '[]'); } catch (_) { FEEDBACK_ITEMS = []; }
      return;
    }
    FEEDBACK_ITEMS = data || [];
  } catch (e) {
    console.error('[FEEDBACK] 加载异常:', e);
  }
}

function feedbackSubscribeRealtime() {
  if (!cdmClient || _feedbackRealtimeSub) return;
  try {
    _feedbackRealtimeSub = cdmClient
      .channel('system_feedback_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_feedback' }, payload => {
        feedbackHandleRealtimeChange(payload);
      })
      .subscribe();
  } catch (e) { console.warn('[FEEDBACK] realtime 订阅失败:', e); }
}

function feedbackHandleRealtimeChange(payload) {
  const row = payload.new || payload.old;
  if (!row) return;
  if (payload.eventType === 'INSERT') {
    if (!FEEDBACK_ITEMS.find(f => f.id === payload.new.id)) FEEDBACK_ITEMS.unshift(payload.new);
  } else if (payload.eventType === 'UPDATE') {
    const idx = FEEDBACK_ITEMS.findIndex(f => f.id === payload.new.id);
    if (idx >= 0) FEEDBACK_ITEMS[idx] = payload.new;
    else FEEDBACK_ITEMS.unshift(payload.new);
    if (_feedbackCurrentDetailId === payload.new.id) feedbackRenderDetail(payload.new);
  } else if (payload.eventType === 'DELETE') {
    FEEDBACK_ITEMS = FEEDBACK_ITEMS.filter(f => f.id !== payload.old.id);
  }
  feedbackRender();
}

// ============================================================
// 渲染主列表
// ============================================================

function feedbackRender() {
  const root = document.querySelector('.tab-content[data-tab="feedback"]');
  if (!root) return;
  
  const me = _feedbackGetCurrentUser();
  const items = feedbackGetFiltered();
  
  // 统计
  const stats = {
    pending: FEEDBACK_ITEMS.filter(f => f.status === 'pending').length,
    analyzing: FEEDBACK_ITEMS.filter(f => f.status === 'analyzing').length,
    approved: FEEDBACK_ITEMS.filter(f => f.status === 'approved').length,
    resolved: FEEDBACK_ITEMS.filter(f => f.status === 'resolved').length,
    mine: FEEDBACK_ITEMS.filter(f => f.reporter_id === me.id).length,
  };
  
  const isAdmin = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN) || (typeof CURRENT_USER_ROLE !== 'undefined' && (CURRENT_USER_ROLE === 'admin' || CURRENT_USER_ROLE === 'owner'));
  
  root.innerHTML = `
    <div class="feedback-page">
      <!-- 顶栏 -->
      <div class="feedback-topbar">
        <div class="feedback-title">
          <h2 style="margin:0;">💬 反馈中心</h2>
          <span style="font-size:12.5px; color:var(--text-tertiary);">提 Bug · 提需求 · 提改进 · Claude 闭环处理</span>
        </div>
        <div class="feedback-actions">
          <button class="btn primary" onclick="feedbackOpenNew()">+ 提反馈</button>
          ${isAdmin ? `
            <button class="btn" onclick="feedbackExportForClaude()" title="把所有「待分析」+「Claude分析中」的反馈打包成结构化文本 · 复制到剪贴板 · 直接粘贴给 Claude">
              📤 导出给 Claude
            </button>
            <button class="btn" onclick="feedbackImportClaudeAnalysis()" title="把 Claude 回复的分析结果粘贴回来 · 自动写入对应反馈">
              📥 导入 Claude 分析
            </button>
          ` : ''}
          <button class="btn ghost" onclick="feedbackLoad().then(feedbackRender)">🔄</button>
        </div>
      </div>

      <!-- 统计卡 -->
      <div class="feedback-stats">
        <div class="feedback-stat-card pending" onclick="feedbackSetFilter('status', 'pending')">
          <div class="num">${stats.pending}</div><div class="label">📥 待分析</div>
        </div>
        <div class="feedback-stat-card analyzing" onclick="feedbackSetFilter('status', 'analyzing')">
          <div class="num">${stats.analyzing}</div><div class="label">🤖 分析中</div>
        </div>
        <div class="feedback-stat-card approved" onclick="feedbackSetFilter('status', 'approved')">
          <div class="num">${stats.approved}</div><div class="label">⚙ 待修复</div>
        </div>
        <div class="feedback-stat-card resolved" onclick="feedbackSetFilter('status', 'resolved')">
          <div class="num">${stats.resolved}</div><div class="label">✅ 已修复</div>
        </div>
        <div class="feedback-stat-card mine" onclick="feedbackSetFilter('mine', !_feedbackFilters.mine)">
          <div class="num">${stats.mine}</div><div class="label">👤 我提的</div>
        </div>
      </div>

      <!-- 筛选栏 -->
      <div class="feedback-filters">
        <select onchange="feedbackSetFilter('type', this.value)" id="fbFilterType">
          <option value="">所有类型</option>
          ${Object.entries(FEEDBACK_TYPES).map(([k, v]) => `<option value="${k}" ${_feedbackFilters.type === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <select onchange="feedbackSetFilter('status', this.value)" id="fbFilterStatus">
          <option value="">所有状态</option>
          ${Object.entries(FEEDBACK_STATUSES).map(([k, v]) => `<option value="${k}" ${_feedbackFilters.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
        <select onchange="feedbackSetFilter('severity', this.value)" id="fbFilterSev">
          <option value="">所有紧急度</option>
          ${Object.entries(FEEDBACK_SEVERITIES).map(([k, v]) => `<option value="${k}" ${_feedbackFilters.severity === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <input type="text" id="fbSearch" placeholder="搜索标题/描述..." oninput="feedbackSetSearchText(this.value)" style="flex:1; min-width:140px;">
        <button class="btn ghost small" onclick="feedbackClearFilters()">清除筛选</button>
      </div>

      <!-- 列表 -->
      <div class="feedback-list">
        ${items.length === 0 ? `
          <div class="feedback-empty">
            <div style="font-size:42px; opacity:0.4;">📭</div>
            <div style="font-size:14px; color:var(--text-secondary); margin-top:8px;">还没有反馈 · 点右上「+ 提反馈」开始</div>
          </div>
        ` : items.map(f => _feedbackRenderCard(f, me)).join('')}
      </div>
    </div>
  `;
}

function _feedbackRenderCard(f, me) {
  const typeMeta = FEEDBACK_TYPES[f.type] || FEEDBACK_TYPES.improvement;
  const statusMeta = FEEDBACK_STATUSES[f.status] || FEEDBACK_STATUSES.pending;
  const sevMeta = f.severity ? FEEDBACK_SEVERITIES[f.severity] : null;
  const date = new Date(f.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const hasAI = f.ai_analysis && Object.keys(f.ai_analysis).length > 0;
  const upvoted = Array.isArray(f.upvoted_by) && f.upvoted_by.includes(me.id);
  const moduleLabel = _feedbackGetModuleLabel(f.module);
  
  return `
    <div class="feedback-card" onclick="feedbackOpenDetail('${f.id}')">
      <div class="feedback-card-head">
        <span class="fb-type-icon" style="background:${typeMeta.color}15; color:${typeMeta.color};">${typeMeta.icon} ${typeMeta.label}</span>
        ${sevMeta ? `<span class="fb-sev" style="color:${sevMeta.color};">${sevMeta.icon}</span>` : ''}
        <span class="fb-status" style="background:${statusMeta.color}15; color:${statusMeta.color};">${statusMeta.label}</span>
        ${hasAI ? '<span class="fb-ai-flag">🤖 已分析</span>' : ''}
        ${moduleLabel ? `<span class="fb-module">${moduleLabel}</span>` : ''}
        <span style="flex:1;"></span>
        <span class="fb-date">${date}</span>
      </div>
      <div class="feedback-card-title">${escapeHtml(f.title || '(无标题)')}</div>
      ${f.description ? `<div class="feedback-card-desc">${escapeHtml(f.description.slice(0, 140))}${f.description.length > 140 ? '...' : ''}</div>` : ''}
      <div class="feedback-card-foot">
        <span class="fb-reporter">👤 ${escapeHtml(f.reporter_name || '匿名')}</span>
        ${f.screenshots && f.screenshots.length > 0 ? `<span class="fb-attach">📷 ${f.screenshots.length} 图</span>` : ''}
        ${f.comments && f.comments.length > 0 ? `<span class="fb-comm">💬 ${f.comments.length}</span>` : ''}
        <button class="fb-upvote ${upvoted ? 'active' : ''}" onclick="event.stopPropagation(); feedbackToggleUpvote('${f.id}')" title="点赞 · 同意/我也遇到">
          👍 ${f.upvotes || 0}
        </button>
        ${f.fixed_in_version ? `<span class="fb-fixed-ver">v${escapeHtml(f.fixed_in_version)}</span>` : ''}
      </div>
    </div>
  `;
}

function feedbackGetFiltered() {
  const me = _feedbackGetCurrentUser();
  let list = [...FEEDBACK_ITEMS];
  if (_feedbackFilters.type) list = list.filter(f => f.type === _feedbackFilters.type);
  if (_feedbackFilters.status) list = list.filter(f => f.status === _feedbackFilters.status);
  if (_feedbackFilters.severity) list = list.filter(f => f.severity === _feedbackFilters.severity);
  if (_feedbackFilters.module) list = list.filter(f => f.module === _feedbackFilters.module);
  if (_feedbackFilters.mine) list = list.filter(f => f.reporter_id === me.id);
  if (_feedbackFilters.searchText) {
    const q = _feedbackFilters.searchText.toLowerCase();
    list = list.filter(f => 
      (f.title || '').toLowerCase().includes(q) || 
      (f.description || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function feedbackSetFilter(key, value) {
  _feedbackFilters[key] = value;
  feedbackRender();
}
function feedbackSetSearchText(v) { _feedbackFilters.searchText = v; feedbackRender(); }
function feedbackClearFilters() {
  _feedbackFilters = { type: '', status: '', severity: '', module: '', mine: false, searchText: '' };
  feedbackRender();
}

// ============================================================
// 新建反馈 Modal
// ============================================================

let _feedbackNewScreenshots = [];

function feedbackOpenNew(preset = {}) {
  _feedbackNewScreenshots = [];
  const modal = document.getElementById('feedbackNewModal');
  if (!modal) { toast('反馈 modal 未加载', 'err'); return; }
  // 重置表单
  document.getElementById('fbnType').value = preset.type || 'bug';
  document.getElementById('fbnSeverity').value = preset.severity || 'normal';
  document.getElementById('fbnModule').value = preset.module || '';
  document.getElementById('fbnTitle').value = preset.title || '';
  document.getElementById('fbnDescription').value = preset.description || '';
  document.getElementById('fbnReproSteps').value = preset.reproduction_steps || '';
  document.getElementById('fbnExpected').value = '';
  document.getElementById('fbnActual').value = '';
  _feedbackRenderNewScreenshots();
  modal.classList.add('show');
  setTimeout(() => document.getElementById('fbnTitle')?.focus(), 100);
}

function feedbackCloseNew() {
  document.getElementById('feedbackNewModal')?.classList.remove('show');
  _feedbackNewScreenshots = [];
}

function _feedbackRenderNewScreenshots() {
  const el = document.getElementById('fbnScreenshots');
  if (!el) return;
  el.innerHTML = _feedbackNewScreenshots.length === 0
    ? '<div class="fb-thumb-empty">还没截图 · Ctrl+V 粘贴 / 拖拽进来 / 点下面按钮</div>'
    : _feedbackNewScreenshots.map((s, i) => `
        <div class="fb-thumb">
          <img src="${s}" onclick="viewImage('${s}')">
          <button class="rm" onclick="_feedbackRmNewScreenshot(${i})">×</button>
        </div>
      `).join('');
}

function _feedbackRmNewScreenshot(idx) {
  _feedbackNewScreenshots.splice(idx, 1);
  _feedbackRenderNewScreenshots();
}

async function _feedbackOnNewFiles(files) {
  if (!files || files.length === 0) return;
  await handleFiles(files, 'feedback_new');
}

async function _feedbackOnNewDrop(event) {
  event.preventDefault();
  if (event.currentTarget) event.currentTarget.classList.remove('dragging');
  const files = event.dataTransfer.files;
  if (files && files.length > 0) await handleFiles(files, 'feedback_new');
}

async function feedbackSubmitNew() {
  const me = _feedbackGetCurrentUser();
  const type = document.getElementById('fbnType').value;
  const severity = document.getElementById('fbnSeverity').value;
  const module_ = document.getElementById('fbnModule').value;
  const title = document.getElementById('fbnTitle').value.trim();
  const description = document.getElementById('fbnDescription').value.trim();
  const reproSteps = document.getElementById('fbnReproSteps').value.trim();
  const expected = document.getElementById('fbnExpected').value.trim();
  const actual = document.getElementById('fbnActual').value.trim();
  
  if (!title) { toast('请填标题', 'err'); return; }
  if (!type) { toast('请选类型', 'err'); return; }
  
  // 浏览器信息
  const browserInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    url: window.location.href,
  };
  const appVersion = document.getElementById('appVersionTag')?.textContent || '';
  
  const row = {
    id: crypto.randomUUID(),
    type,
    status: 'pending',
    severity: severity || null,
    module: module_ || null,
    title,
    description: description || null,
    screenshots: _feedbackNewScreenshots,
    reproduction_steps: reproSteps || null,
    expected_behavior: expected || null,
    actual_behavior: actual || null,
    reporter_id: me.id,
    reporter_name: me.name,
    reporter_system: 'po',
    browser_info: browserInfo,
    app_version: appVersion,
    upvotes: 0,
    upvoted_by: [],
    comments: [],
    watchers: [],
    created_at: new Date().toISOString(),
  };
  
  try {
    if (cdmClient) {
      const { error } = await cdmClient.from('system_feedback').insert(row);
      if (error) throw error;
    } else {
      // localStorage 兜底
      FEEDBACK_ITEMS.unshift(row);
      try { localStorage.setItem('feedback_items_local', JSON.stringify(FEEDBACK_ITEMS)); } catch (_) {}
    }
    toast('✓ 反馈已提交 · 老板会在下批迭代时处理', 'ok');
    feedbackCloseNew();
    await feedbackLoad();
    feedbackRender();
  } catch (e) {
    console.error('[FEEDBACK] 提交失败:', e);
    toast('提交失败 · ' + (e.message || e) + ' · 请截图反馈给主管', 'err');
  }
}

// ============================================================
// 详情 Modal
// ============================================================

function feedbackOpenDetail(id) {
  const f = FEEDBACK_ITEMS.find(x => x.id === id);
  if (!f) { toast('找不到反馈', 'err'); return; }
  _feedbackCurrentDetailId = id;
  document.getElementById('feedbackDetailModal')?.classList.add('show');
  feedbackRenderDetail(f);
}

function feedbackCloseDetail() {
  document.getElementById('feedbackDetailModal')?.classList.remove('show');
  _feedbackCurrentDetailId = null;
}

function feedbackRenderDetail(f) {
  const body = document.getElementById('feedbackDetailBody');
  if (!body) return;
  const me = _feedbackGetCurrentUser();
  const typeMeta = FEEDBACK_TYPES[f.type] || FEEDBACK_TYPES.improvement;
  const statusMeta = FEEDBACK_STATUSES[f.status] || FEEDBACK_STATUSES.pending;
  const sevMeta = f.severity ? FEEDBACK_SEVERITIES[f.severity] : null;
  const isAdmin = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN) || (typeof CURRENT_USER_ROLE !== 'undefined' && (CURRENT_USER_ROLE === 'admin' || CURRENT_USER_ROLE === 'owner'));
  const isReporter = f.reporter_id === me.id;
  const moduleLabel = _feedbackGetModuleLabel(f.module);
  
  body.innerHTML = `
    <!-- 顶栏:标题 + 状态 -->
    <div class="fb-detail-head">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <span class="fb-type-icon" style="background:${typeMeta.color}15; color:${typeMeta.color};">${typeMeta.icon} ${typeMeta.label}</span>
        ${sevMeta ? `<span class="fb-sev-label" style="background:${sevMeta.color}15; color:${sevMeta.color};">${sevMeta.icon} ${sevMeta.label}</span>` : ''}
        <span class="fb-status-label" style="background:${statusMeta.color}15; color:${statusMeta.color};">${statusMeta.label}</span>
        ${moduleLabel ? `<span class="fb-module">${moduleLabel}</span>` : ''}
        ${f.fixed_in_version ? `<span class="fb-fixed-ver">已修复于 v${escapeHtml(f.fixed_in_version)}</span>` : ''}
      </div>
      <h2 style="margin:8px 0 4px;">${escapeHtml(f.title)}</h2>
      <div style="font-size:11.5px; color:var(--text-tertiary);">
        👤 ${escapeHtml(f.reporter_name || '匿名')} · 
        ${new Date(f.created_at).toLocaleString('zh-CN')} ·
        来自 ${f.reporter_system || 'po'}系统
      </div>
    </div>
    
    <!-- 描述 -->
    ${f.description ? `
      <div class="fb-detail-section">
        <div class="fb-section-title">📝 详细描述</div>
        <div class="fb-text-content">${escapeHtml(f.description).replace(/\n/g, '<br>')}</div>
      </div>
    ` : ''}
    
    <!-- 截图 -->
    ${f.screenshots && f.screenshots.length > 0 ? `
      <div class="fb-detail-section">
        <div class="fb-section-title">📷 截图(${f.screenshots.length} 张)</div>
        <div class="fb-screenshots-grid">
          ${f.screenshots.map(s => `<img src="${s}" onclick="viewImage('${s}')" class="fb-screenshot">`).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- 复现步骤 -->
    ${f.reproduction_steps ? `
      <div class="fb-detail-section">
        <div class="fb-section-title">🔄 复现步骤</div>
        <div class="fb-text-content">${escapeHtml(f.reproduction_steps).replace(/\n/g, '<br>')}</div>
      </div>
    ` : ''}
    
    <!-- 预期 vs 实际 -->
    ${(f.expected_behavior || f.actual_behavior) ? `
      <div class="fb-detail-section" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        ${f.expected_behavior ? `
          <div>
            <div class="fb-section-title" style="color:#16a34a;">✓ 预期</div>
            <div class="fb-text-content">${escapeHtml(f.expected_behavior).replace(/\n/g, '<br>')}</div>
          </div>
        ` : '<div></div>'}
        ${f.actual_behavior ? `
          <div>
            <div class="fb-section-title" style="color:#dc2626;">✗ 实际</div>
            <div class="fb-text-content">${escapeHtml(f.actual_behavior).replace(/\n/g, '<br>')}</div>
          </div>
        ` : ''}
      </div>
    ` : ''}
    
    <!-- 浏览器信息(折叠) -->
    ${f.browser_info ? `
      <details class="fb-detail-section">
        <summary style="cursor:pointer; font-size:12px; color:var(--text-tertiary);">🌐 浏览器/环境信息</summary>
        <pre style="background:var(--bg-elevated); padding:8px; border-radius:4px; font-size:11px; margin-top:6px; overflow-x:auto;">${escapeHtml(JSON.stringify(f.browser_info, null, 2))}</pre>
        ${f.app_version ? `<div style="font-size:11.5px; color:var(--text-tertiary); margin-top:4px;">app version: ${escapeHtml(f.app_version)}</div>` : ''}
      </details>
    ` : ''}
    
    <!-- 🤖 AI 分析结果 -->
    ${f.ai_analysis && Object.keys(f.ai_analysis).length > 0 ? `
      <div class="fb-detail-section fb-ai-section">
        <div class="fb-section-title">🤖 Claude AI 分析(${f.ai_analyzed_at ? new Date(f.ai_analyzed_at).toLocaleString('zh-CN') : ''})</div>
        ${f.ai_analysis.root_cause ? `
          <div style="margin:6px 0;"><b>根因:</b> ${escapeHtml(f.ai_analysis.root_cause)}</div>
        ` : ''}
        ${f.ai_analysis.proposed_fix ? `
          <div style="margin:6px 0;"><b>提议方案:</b> ${escapeHtml(f.ai_analysis.proposed_fix)}</div>
        ` : ''}
        ${f.ai_analysis.files_affected && f.ai_analysis.files_affected.length > 0 ? `
          <div style="margin:6px 0;"><b>涉及文件:</b> ${f.ai_analysis.files_affected.map(x => `<code>${escapeHtml(x)}</code>`).join(', ')}</div>
        ` : ''}
        ${f.ai_analysis.estimated_hours ? `
          <div style="margin:6px 0;"><b>预估工作量:</b> ${escapeHtml(String(f.ai_analysis.estimated_hours))} 小时</div>
        ` : ''}
        ${f.ai_analysis.risk ? `
          <div style="margin:6px 0;"><b>⚠ 风险:</b> ${escapeHtml(f.ai_analysis.risk)}</div>
        ` : ''}
      </div>
    ` : ''}
    
    <!-- 评论区 -->
    <div class="fb-detail-section">
      <div class="fb-section-title">💬 评论(${(f.comments || []).length})</div>
      ${(f.comments || []).length === 0 ? '<div style="font-size:12px; color:var(--text-tertiary);">还没有评论</div>' : ''}
      ${(f.comments || []).map(c => `
        <div class="fb-comment">
          <div class="fb-comment-head">
            <b>${escapeHtml(c.user_name || c.user || '')}</b>
            <span class="fb-comment-time">${new Date(c.time).toLocaleString('zh-CN')}</span>
          </div>
          <div class="fb-comment-body">${escapeHtml(c.text || '').replace(/\n/g, '<br>')}</div>
        </div>
      `).join('')}
      <div class="fb-comment-input">
        <textarea id="fbCommentText" placeholder="补充信息 / 我也遇到 / 提建议..." rows="2"></textarea>
        <button class="btn primary small" onclick="feedbackAddComment('${f.id}')">+ 评论</button>
      </div>
    </div>
    
    <!-- 操作区 -->
    <div class="fb-detail-actions">
      <button class="btn ${(Array.isArray(f.upvoted_by) && f.upvoted_by.includes(me.id)) ? 'primary' : ''}" onclick="feedbackToggleUpvote('${f.id}')">
        👍 点赞 (${f.upvotes || 0})
      </button>
      
      ${isAdmin ? `
        <div style="flex:1;"></div>
        ${f.status === 'pending' || f.status === 'analyzing' ? `
          <button class="btn" onclick="feedbackSetStatus('${f.id}', 'approved')">✓ 确认 · 待修复</button>
          <button class="btn" onclick="feedbackReject('${f.id}')">✗ 不修复</button>
        ` : ''}
        ${f.status === 'approved' ? `
          <button class="btn" onclick="feedbackSetStatus('${f.id}', 'in_progress')">⚙ 开始修复</button>
        ` : ''}
        ${f.status === 'in_progress' || f.status === 'approved' ? `
          <button class="btn primary" onclick="feedbackMarkFixed('${f.id}')">✅ 已修复(填版本号)</button>
        ` : ''}
        ${(isAdmin && (f.status === 'pending')) ? `
          <button class="btn" onclick="feedbackMarkDuplicate('${f.id}')">🔁 重复</button>
        ` : ''}
        ${isAdmin || isReporter ? `
          <button class="btn ghost" onclick="feedbackDelete('${f.id}')" style="color:var(--danger);">🗑 删除</button>
        ` : ''}
      ` : ''}
    </div>
  `;
}

// ============================================================
// 操作函数
// ============================================================

async function feedbackToggleUpvote(id) {
  const f = FEEDBACK_ITEMS.find(x => x.id === id);
  if (!f) return;
  const me = _feedbackGetCurrentUser();
  const upvoted_by = Array.isArray(f.upvoted_by) ? [...f.upvoted_by] : [];
  const i = upvoted_by.indexOf(me.id);
  if (i >= 0) upvoted_by.splice(i, 1);
  else upvoted_by.push(me.id);
  await _feedbackUpdate(id, { upvoted_by, upvotes: upvoted_by.length });
}

async function feedbackAddComment(id) {
  const text = document.getElementById('fbCommentText').value.trim();
  if (!text) { toast('评论不能为空', 'err'); return; }
  const f = FEEDBACK_ITEMS.find(x => x.id === id);
  if (!f) return;
  const me = _feedbackGetCurrentUser();
  const comments = Array.isArray(f.comments) ? [...f.comments] : [];
  comments.push({
    user_id: me.id,
    user_name: me.name,
    text,
    time: new Date().toISOString(),
  });
  await _feedbackUpdate(id, { comments });
  document.getElementById('fbCommentText').value = '';
}

async function feedbackSetStatus(id, newStatus) {
  await _feedbackUpdate(id, { status: newStatus });
  toast(`状态已改为「${FEEDBACK_STATUSES[newStatus]?.label || newStatus}」`, 'ok');
}

async function feedbackReject(id) {
  const reason = prompt('不修复原因 · 会让发起人知道:', '');
  if (reason === null) return;
  const me = _feedbackGetCurrentUser();
  await _feedbackUpdate(id, {
    status: 'rejected',
    rejection_reason: reason || '老板暂不安排此项',
    approved_by_id: me.id,
    approved_by_name: me.name,
    approved_at: new Date().toISOString(),
  });
  toast('已标记为不修复', 'ok');
}

async function feedbackMarkFixed(id) {
  const version = prompt('已修复在哪个版本号? · 格式如 20260526a', '');
  if (!version) return;
  const notes = prompt('修复说明(可选):', '') || '';
  await _feedbackUpdate(id, {
    status: 'resolved',
    fixed_in_version: version.trim(),
    fixed_at: new Date().toISOString(),
    resolution_notes: notes || null,
  });
  toast('✓ 已标记为修复完成 · 发起人会看到', 'ok');
}

async function feedbackMarkDuplicate(id) {
  const dupOf = prompt('这条反馈是哪一条的重复? · 填那条的标题或 ID:', '');
  if (!dupOf) return;
  await _feedbackUpdate(id, {
    status: 'duplicate',
    resolution_notes: `重复于:${dupOf}`,
  });
}

async function feedbackDelete(id) {
  if (!confirm('删除这条反馈?不可恢复。')) return;
  try {
    if (cdmClient) {
      const { error } = await cdmClient.from('system_feedback').delete().eq('id', id);
      if (error) throw error;
    }
    FEEDBACK_ITEMS = FEEDBACK_ITEMS.filter(f => f.id !== id);
    feedbackCloseDetail();
    feedbackRender();
    toast('已删除', 'ok');
  } catch (e) {
    toast('删除失败:' + e.message, 'err');
  }
}

async function _feedbackUpdate(id, patch) {
  try {
    if (cdmClient) {
      const { error } = await cdmClient.from('system_feedback').update(patch).eq('id', id);
      if (error) throw error;
    }
    const idx = FEEDBACK_ITEMS.findIndex(f => f.id === id);
    if (idx >= 0) FEEDBACK_ITEMS[idx] = { ...FEEDBACK_ITEMS[idx], ...patch };
    if (_feedbackCurrentDetailId === id) feedbackRenderDetail(FEEDBACK_ITEMS[idx]);
    feedbackRender();
  } catch (e) {
    console.error('[FEEDBACK] 更新失败:', e);
    toast('更新失败:' + e.message, 'err');
  }
}

// ============================================================
// 🎯 老板专属:导出给 Claude / 导入分析结果
// ============================================================

function feedbackExportForClaude() {
  const pending = FEEDBACK_ITEMS.filter(f => f.status === 'pending' || f.status === 'analyzing');
  if (pending.length === 0) { toast('没有待分析的反馈', 'info'); return; }
  
  // 构造 Claude 友好的结构化文本
  const lines = [];
  lines.push(`# 跟单工作台 · 待 Claude 分析的反馈 (${pending.length} 条)`);
  lines.push(`# 导出时间: ${new Date().toLocaleString('zh-CN')}`);
  lines.push(`# 当前版本: ${document.getElementById('appVersionTag')?.textContent || '未知'}`);
  lines.push('');
  lines.push('请逐条分析每个反馈,对每条给出:');
  lines.push('1. 根因(root_cause):问题真正在哪里');
  lines.push('2. 提议方案(proposed_fix):怎么修');
  lines.push('3. 涉及文件(files_affected):需要改哪几个 .js / .html');
  lines.push('4. 预估工作量(estimated_hours):大概几小时');
  lines.push('5. 风险(risk):有无破坏性变更 / 数据迁移 / 兼容问题');
  lines.push('');
  lines.push('我看完后会回:"确认 #1 #3 #5 · 跳过 #2 · #4 改成 XXX"');
  lines.push('然后你就实施 · 升版本号 · 给我新文件 · 我部署 · 我在反馈中心标修复完成');
  lines.push('');
  lines.push('--- 反馈数据(JSON 格式) ---');
  lines.push('```json');
  
  const exportData = pending.map((f, i) => ({
    seq: i + 1,
    id: f.id,
    type: f.type,
    severity: f.severity,
    module: f.module,
    title: f.title,
    description: f.description,
    reproduction_steps: f.reproduction_steps,
    expected_behavior: f.expected_behavior,
    actual_behavior: f.actual_behavior,
    screenshots_count: (f.screenshots || []).length,
    screenshots_urls: f.screenshots || [],
    reporter: f.reporter_name,
    reporter_system: f.reporter_system,
    upvotes: f.upvotes,
    comments: (f.comments || []).map(c => ({ user: c.user_name, text: c.text })),
    browser: f.browser_info,
    created: f.created_at,
  }));
  
  lines.push(JSON.stringify(exportData, null, 2));
  lines.push('```');
  
  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(async () => {
    toast(`✓ 已复制 ${pending.length} 条到剪贴板 · 直接粘贴给 Claude`, 'ok', 4000);
    // 把这些条目状态改为 analyzing
    for (const f of pending) {
      if (f.status === 'pending') {
        await _feedbackUpdate(f.id, { status: 'analyzing' });
      }
    }
  }).catch(() => {
    // 兜底:把文本放到一个可选中的区域
    _feedbackShowExportFallback(text);
  });
}

function _feedbackShowExportFallback(text) {
  const w = window.open('', '_blank', 'width=800,height=600');
  if (w) {
    w.document.write(`<title>导出反馈 - 复制下面内容</title><pre style="white-space:pre-wrap; font-family:monospace; padding:20px; font-size:12px;">${escapeHtml(text)}</pre>`);
  }
}

function feedbackImportClaudeAnalysis() {
  const modal = document.getElementById('feedbackImportModal');
  if (!modal) return;
  document.getElementById('fbImportText').value = '';
  modal.classList.add('show');
}

function feedbackCloseImport() {
  document.getElementById('feedbackImportModal')?.classList.remove('show');
}

async function feedbackDoImport() {
  const text = document.getElementById('fbImportText').value.trim();
  if (!text) { toast('请粘贴 Claude 返回的内容', 'err'); return; }
  
  // 尝试解析 — 期望格式:多个对象,每个有 id 和 analysis
  // 格式 1: JSON array  [{id, root_cause, proposed_fix, ...}, ...]
  // 格式 2: ```json ... ``` 代码块
  let parsed = null;
  try {
    // 提取 JSON 部分(如果在 ```json 代码块里)
    const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = m ? m[1] : text;
    parsed = JSON.parse(jsonText);
  } catch (e) {
    toast('无法解析 · 请确保是 Claude 返回的 JSON 格式', 'err'); 
    return;
  }
  
  if (!Array.isArray(parsed)) parsed = [parsed];
  
  let updated = 0;
  for (const item of parsed) {
    if (!item.id) continue;
    const f = FEEDBACK_ITEMS.find(x => x.id === item.id);
    if (!f) continue;
    const aiAnalysis = {
      root_cause: item.root_cause || item.rootCause || '',
      proposed_fix: item.proposed_fix || item.proposedFix || item.fix || '',
      files_affected: item.files_affected || item.filesAffected || item.files || [],
      estimated_hours: item.estimated_hours || item.estimatedHours || item.eta || null,
      risk: item.risk || '',
    };
    await _feedbackUpdate(f.id, {
      ai_analysis: aiAnalysis,
      ai_analyzed_at: new Date().toISOString(),
      ai_analyzed_by: 'claude',
    });
    updated++;
  }
  
  toast(`✓ 已为 ${updated} 条反馈写入 AI 分析`, 'ok');
  feedbackCloseImport();
  feedbackRender();
}

// ============================================================
// 工具函数
// ============================================================

function _feedbackGetCurrentUser() {
  const id = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) || (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT?.id) || 'anonymous';
  const name = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT?.name) || '匿名';
  return { id, name };
}

function _feedbackGetModuleLabel(module) {
  if (!module) return '';
  const map = {
    sales: '📥 销售单', po: '📦 采购单', orders: '📋 催单', missing: '🔍 找灯',
    purchases: '🛒 线上采购', aftersales: '🔧 售后', issues: '⚠ 问题',
    finance: '✓ 财务', products: '📚 产品', cross_dept: '📨 跨部门',
    performance: '📊 绩效', other: '其他',
  };
  return map[module] || module;
}

// 给 attachScreenshot 加分支用的(utils.js 调用)
function _feedbackAttachScreenshot(url) {
  if (!_feedbackNewScreenshots) _feedbackNewScreenshots = [];
  _feedbackNewScreenshots.push(url);
  _feedbackRenderNewScreenshots();
}

// escapeHtml 兜底
if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
}

// 暴露到全局
window.feedbackInit = feedbackInit;
window.feedbackRender = feedbackRender;
window.feedbackOpenNew = feedbackOpenNew;
window.feedbackCloseNew = feedbackCloseNew;
window.feedbackSubmitNew = feedbackSubmitNew;
window.feedbackOpenDetail = feedbackOpenDetail;
window.feedbackCloseDetail = feedbackCloseDetail;
window.feedbackToggleUpvote = feedbackToggleUpvote;
window.feedbackAddComment = feedbackAddComment;
window.feedbackSetStatus = feedbackSetStatus;
window.feedbackReject = feedbackReject;
window.feedbackMarkFixed = feedbackMarkFixed;
window.feedbackMarkDuplicate = feedbackMarkDuplicate;
window.feedbackDelete = feedbackDelete;
window.feedbackExportForClaude = feedbackExportForClaude;
window.feedbackImportClaudeAnalysis = feedbackImportClaudeAnalysis;
window.feedbackCloseImport = feedbackCloseImport;
window.feedbackDoImport = feedbackDoImport;
window.feedbackSetFilter = feedbackSetFilter;
window.feedbackSetSearchText = feedbackSetSearchText;
window.feedbackClearFilters = feedbackClearFilters;
window.feedbackLoad = feedbackLoad;
window._feedbackOnNewFiles = _feedbackOnNewFiles;
window._feedbackOnNewDrop = _feedbackOnNewDrop;
window._feedbackRmNewScreenshot = _feedbackRmNewScreenshot;
window._feedbackAttachScreenshot = _feedbackAttachScreenshot;
