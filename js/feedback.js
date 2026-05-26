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
            <button class="btn" onclick="feedbackOpenDownloadDialog()" title="下载所有反馈为 PDF/Markdown/HTML/JSON 文件 · 给老板备份或离线给 Claude">
              💾 下载反馈
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
// 💾 下载反馈(PDF / Markdown / HTML / JSON)· V5-W3-2026-05-26
// ============================================================

function feedbackOpenDownloadDialog() {
  const modal = document.getElementById('feedbackDownloadModal');
  if (!modal) { toast('下载 modal 未加载', 'err'); return; }
  // 默认选项
  document.getElementById('fbDlScope').value = 'all';
  document.getElementById('fbDlFormat').value = 'markdown';
  document.getElementById('fbDlIncludeImages').checked = true;
  document.getElementById('fbDlIncludeResolved').checked = false;
  _feedbackUpdateDlPreview();
  modal.classList.add('show');
}

function feedbackCloseDownloadDialog() {
  document.getElementById('feedbackDownloadModal')?.classList.remove('show');
}

function _feedbackUpdateDlPreview() {
  const scope = document.getElementById('fbDlScope').value;
  const includeResolved = document.getElementById('fbDlIncludeResolved').checked;
  const items = _feedbackGetDownloadItems(scope, includeResolved);
  document.getElementById('fbDlCountHint').textContent = `将导出 ${items.length} 条反馈`;
}

function _feedbackGetDownloadItems(scope, includeResolved) {
  let items = [...FEEDBACK_ITEMS];
  if (scope === 'pending') {
    items = items.filter(f => f.status === 'pending' || f.status === 'analyzing');
  } else if (scope === 'urgent') {
    items = items.filter(f => f.severity === 'urgent' || f.severity === 'high');
  } else if (scope === 'with_screenshots') {
    items = items.filter(f => f.screenshots && f.screenshots.length > 0);
  } else if (scope === 'mine') {
    const me = _feedbackGetCurrentUser();
    items = items.filter(f => f.reporter_id === me.id);
  } else if (scope === 'last_week') {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    items = items.filter(f => new Date(f.created_at).getTime() > weekAgo);
  }
  // 是否含已修复的
  if (!includeResolved) {
    items = items.filter(f => f.status !== 'resolved' && f.status !== 'rejected' && f.status !== 'duplicate');
  }
  return items;
}

async function feedbackDoDownload() {
  const scope = document.getElementById('fbDlScope').value;
  const format = document.getElementById('fbDlFormat').value;
  const includeImages = document.getElementById('fbDlIncludeImages').checked;
  const includeResolved = document.getElementById('fbDlIncludeResolved').checked;
  
  const items = _feedbackGetDownloadItems(scope, includeResolved);
  if (items.length === 0) { toast('没有符合条件的反馈', 'info'); return; }
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const scopeLabels = { all: '全部', pending: '待处理', urgent: '紧急', with_screenshots: '含截图', mine: '我提的', last_week: '近7天' };
  const scopeLabel = scopeLabels[scope] || scope;
  
  if (format === 'markdown') {
    const md = _feedbackGenerateMarkdown(items, includeImages);
    _feedbackDownloadBlob(md, `跟单反馈_${scopeLabel}_${dateStr}.md`, 'text/markdown;charset=utf-8');
    toast(`✓ 已下载 ${items.length} 条反馈 (Markdown)`, 'ok');
  } else if (format === 'html') {
    toast('生成中 · 含截图可能需要几秒...', 'info');
    const html = await _feedbackGenerateHTML(items, includeImages);
    _feedbackDownloadBlob(html, `跟单反馈_${scopeLabel}_${dateStr}.html`, 'text/html;charset=utf-8');
    toast(`✓ 已下载 ${items.length} 条反馈 (HTML) · 用浏览器打开 → Ctrl+P → 另存为 PDF`, 'ok', 5000);
  } else if (format === 'pdf_print') {
    // 直接在浏览器打开 + 触发打印
    toast('打开打印视图中...', 'info');
    const html = await _feedbackGenerateHTML(items, includeImages, true);
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      // 等图片加载完触发打印
      setTimeout(() => { try { w.print(); } catch(_) {} }, 1500);
    } else {
      toast('浏览器拦截了新窗口 · 请允许弹窗', 'err');
    }
  } else if (format === 'json') {
    const json = JSON.stringify(items, null, 2);
    _feedbackDownloadBlob(json, `跟单反馈_${scopeLabel}_${dateStr}.json`, 'application/json');
    toast(`✓ 已下载 ${items.length} 条反馈 (JSON)`, 'ok');
  }
  
  feedbackCloseDownloadDialog();
}

// 生成 Markdown(给 Claude 用最佳)
function _feedbackGenerateMarkdown(items, includeImages) {
  const lines = [];
  const now = new Date().toLocaleString('zh-CN');
  const appVer = document.getElementById('appVersionTag')?.textContent || '未知';
  
  lines.push(`# 跟单工作台 · 反馈汇总报告`);
  lines.push('');
  lines.push(`> **生成时间**: ${now}  `);
  lines.push(`> **当前系统版本**: ${appVer}  `);
  lines.push(`> **反馈总数**: ${items.length}  `);
  lines.push(`> **导出人**: ${_feedbackGetCurrentUser().name}`);
  lines.push('');
  
  // 按类型分组统计
  const byType = {};
  items.forEach(f => { byType[f.type] = (byType[f.type] || 0) + 1; });
  lines.push(`## 📊 概览`);
  Object.entries(byType).forEach(([t, c]) => {
    const meta = FEEDBACK_TYPES[t] || { icon: '◆', label: t };
    lines.push(`- ${meta.icon} **${meta.label}**: ${c} 条`);
  });
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // 给 Claude 的指令
  lines.push(`## 🤖 致 Claude · 处理这批反馈`);
  lines.push('');
  lines.push('请对下面每条反馈给出:');
  lines.push('1. **根因**(root_cause): 问题真正在哪里 / 为什么会这样');
  lines.push('2. **提议方案**(proposed_fix): 怎么修 · 涉及什么改动');
  lines.push('3. **涉及文件**(files_affected): 需要改哪几个 .js / .html / .css');
  lines.push('4. **预估工作量**(estimated_hours): 大概几小时(0.5 / 1 / 2 / 4 / 8)');
  lines.push('5. **风险**(risk): 有无破坏性变更 / 数据迁移 / 兼容问题');
  lines.push('');
  lines.push('返回格式:JSON 数组,可直接粘回反馈中心的「📥 导入 Claude 分析」按钮。');
  lines.push('');
  lines.push('```json');
  lines.push('[');
  lines.push('  {');
  lines.push('    "id": "反馈的 UUID",');
  lines.push('    "root_cause": "...",');
  lines.push('    "proposed_fix": "...",');
  lines.push('    "files_affected": ["utils.js", "issues.js"],');
  lines.push('    "estimated_hours": 2,');
  lines.push('    "risk": "..."');
  lines.push('  }');
  lines.push(']');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // 逐条
  items.forEach((f, i) => {
    const typeMeta = FEEDBACK_TYPES[f.type] || { icon: '◆', label: f.type };
    const sevMeta = f.severity ? (FEEDBACK_SEVERITIES[f.severity] || {}) : null;
    const statusMeta = FEEDBACK_STATUSES[f.status] || { label: f.status };
    
    lines.push(`## ${i + 1}. ${typeMeta.icon} ${f.title}`);
    lines.push('');
    lines.push(`| 字段 | 值 |`);
    lines.push(`|---|---|`);
    lines.push(`| **ID** | \`${f.id}\` |`);
    lines.push(`| **类型** | ${typeMeta.icon} ${typeMeta.label} |`);
    lines.push(`| **状态** | ${statusMeta.label} |`);
    if (sevMeta) lines.push(`| **紧急度** | ${sevMeta.icon || ''} ${sevMeta.label || f.severity} |`);
    if (f.module) lines.push(`| **模块** | ${_feedbackGetModuleLabel(f.module)} |`);
    lines.push(`| **提报人** | ${f.reporter_name || '匿名'} (${f.reporter_system || 'po'} 系统) |`);
    lines.push(`| **提交时间** | ${new Date(f.created_at).toLocaleString('zh-CN')} |`);
    if (f.upvotes > 0) lines.push(`| **点赞数** | 👍 ${f.upvotes}(说明多人遇到)|`);
    if (f.app_version) lines.push(`| **App 版本** | \`${f.app_version}\` |`);
    if (f.fixed_in_version) lines.push(`| **修复版本** | \`v${f.fixed_in_version}\` ✅ |`);
    lines.push('');
    
    if (f.description) {
      lines.push(`### 📝 详细描述`);
      lines.push('');
      lines.push(f.description);
      lines.push('');
    }
    
    if (f.reproduction_steps) {
      lines.push(`### 🔄 复现步骤`);
      lines.push('');
      lines.push(f.reproduction_steps);
      lines.push('');
    }
    
    if (f.expected_behavior || f.actual_behavior) {
      lines.push(`### ✓ vs ✗`);
      lines.push('');
      if (f.expected_behavior) {
        lines.push(`**✓ 预期**:`);
        lines.push(f.expected_behavior);
        lines.push('');
      }
      if (f.actual_behavior) {
        lines.push(`**✗ 实际**:`);
        lines.push(f.actual_behavior);
        lines.push('');
      }
    }
    
    if (includeImages && f.screenshots && f.screenshots.length > 0) {
      lines.push(`### 📷 截图(${f.screenshots.length} 张)`);
      lines.push('');
      f.screenshots.forEach((s, idx) => {
        lines.push(`![截图${idx + 1}](${s})`);
        lines.push('');
      });
    }
    
    if (f.browser_info) {
      lines.push(`### 🌐 环境信息`);
      lines.push('');
      lines.push('```');
      lines.push(`User Agent: ${f.browser_info.userAgent || '?'}`);
      lines.push(`Platform:   ${f.browser_info.platform || '?'}`);
      lines.push(`Screen:     ${f.browser_info.screen || '?'}`);
      lines.push(`Viewport:   ${f.browser_info.viewport || '?'}`);
      lines.push(`URL:        ${f.browser_info.url || '?'}`);
      lines.push('```');
      lines.push('');
    }
    
    if (f.ai_analysis && Object.keys(f.ai_analysis).length > 0) {
      lines.push(`### 🤖 上次 Claude 分析(已存)`);
      lines.push('');
      if (f.ai_analysis.root_cause) lines.push(`- **根因**: ${f.ai_analysis.root_cause}`);
      if (f.ai_analysis.proposed_fix) lines.push(`- **方案**: ${f.ai_analysis.proposed_fix}`);
      if (f.ai_analysis.files_affected) lines.push(`- **文件**: ${f.ai_analysis.files_affected.join(', ')}`);
      if (f.ai_analysis.estimated_hours) lines.push(`- **预估**: ${f.ai_analysis.estimated_hours} 小时`);
      if (f.ai_analysis.risk) lines.push(`- **风险**: ${f.ai_analysis.risk}`);
      lines.push('');
    }
    
    if (f.comments && f.comments.length > 0) {
      lines.push(`### 💬 评论(${f.comments.length})`);
      lines.push('');
      f.comments.forEach(c => {
        const time = new Date(c.time).toLocaleString('zh-CN');
        lines.push(`- **${c.user_name || c.user_id}** (${time}):`);
        lines.push(`  > ${(c.text || '').split('\n').join('\n  > ')}`);
      });
      lines.push('');
    }
    
    if (f.resolution_notes) {
      lines.push(`### ✅ 修复说明`);
      lines.push('');
      lines.push(f.resolution_notes);
      lines.push('');
    }
    
    if (f.rejection_reason) {
      lines.push(`### ❌ 不修复原因`);
      lines.push('');
      lines.push(f.rejection_reason);
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  });
  
  lines.push('');
  lines.push(`> 报告由 跟单工作台 反馈中心 自动生成 · 共 ${items.length} 条反馈`);
  
  return lines.join('\n');
}

// 生成 HTML(可直接打印为 PDF)
async function _feedbackGenerateHTML(items, includeImages, autoPrint = false) {
  const now = new Date().toLocaleString('zh-CN');
  const appVer = document.getElementById('appVersionTag')?.textContent || '未知';
  const me = _feedbackGetCurrentUser().name;
  
  // 把图片转 base64 内嵌(让 HTML 自包含 · 即使断网也能看)
  let imgCache = new Map();
  if (includeImages) {
    const allUrls = new Set();
    items.forEach(f => (f.screenshots || []).forEach(u => allUrls.add(u)));
    for (const url of allUrls) {
      try {
        const r = await fetch(url);
        const blob = await r.blob();
        const dataUrl = await new Promise(resolve => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.readAsDataURL(blob);
        });
        imgCache.set(url, dataUrl);
      } catch (e) {
        // 失败就保留原 URL
        console.warn('[FEEDBACK] 图片转 base64 失败:', url, e);
      }
    }
  }
  
  const getImgSrc = url => imgCache.get(url) || url;
  
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>跟单工作台 · 反馈报告</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 30px; background: #fff; }
  h1 { font-size: 28px; color: #1e293b; border-bottom: 3px solid #2563eb; padding-bottom: 12px; }
  h2 { font-size: 19px; color: #1e293b; margin-top: 36px; padding-left: 12px; border-left: 4px solid #2563eb; page-break-after: avoid; }
  h3 { font-size: 15px; color: #475569; margin-top: 18px; page-break-after: avoid; }
  .meta { color: #64748b; font-size: 13px; padding: 14px 16px; background: #f1f5f9; border-radius: 8px; margin: 14px 0; }
  .meta b { color: #1e293b; }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 16px 0; }
  .summary-card { background: #f8fafc; border-left: 3px solid #2563eb; padding: 10px 14px; border-radius: 4px; font-size: 13px; }
  .summary-card b { font-size: 20px; color: #1e293b; display: block; }
  .item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 16px 0; page-break-inside: avoid; }
  .item-title { font-size: 17px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
  .badges { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 12px; }
  .badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-bug { background: #fef2f2; color: #dc2626; }
  .badge-feature { background: #faf5ff; color: #7c3aed; }
  .badge-improvement { background: #f0f9ff; color: #0891b2; }
  .badge-urgent { background: #fef2f2; color: #dc2626; }
  .badge-high { background: #fff7ed; color: #ea580c; }
  .badge-normal { background: #fefce8; color: #ca8a04; }
  .badge-low { background: #f0fdf4; color: #16a34a; }
  .badge-status { background: #f1f5f9; color: #475569; }
  table.meta-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12.5px; }
  table.meta-table td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; }
  table.meta-table td:first-child { color: #64748b; width: 110px; font-weight: 600; }
  .section-title { font-size: 13px; font-weight: 700; color: #475569; margin: 12px 0 6px; }
  .desc-box { background: #f8fafc; padding: 10px 14px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; border-left: 3px solid #cbd5e1; }
  .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin: 8px 0; }
  .screenshots img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0; }
  .env-info { background: #1e293b; color: #94a3b8; font-family: monospace; font-size: 11px; padding: 10px 14px; border-radius: 6px; white-space: pre-wrap; }
  .ai-section { background: linear-gradient(135deg, #faf5ff, #f0f9ff); padding: 12px 16px; border-radius: 6px; border-left: 3px solid #7c3aed; margin: 8px 0; }
  .comment { background: #f8fafc; padding: 8px 12px; border-radius: 6px; margin: 4px 0; border-left: 2px solid #cbd5e1; font-size: 12.5px; }
  .comment-meta { color: #64748b; font-size: 11px; margin-bottom: 2px; }
  .footer { margin-top: 36px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-align: center; }
  
  @media print {
    body { padding: 16px; }
    .item { page-break-inside: avoid; box-shadow: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <h1>📋 跟单工作台 · 反馈汇总报告</h1>
  <div class="meta">
    <b>生成时间</b>: ${now}<br>
    <b>系统版本</b>: ${escapeHtml(appVer)}<br>
    <b>反馈总数</b>: ${items.length}<br>
    <b>导出人</b>: ${escapeHtml(me)}
  </div>
`;
  
  // 概览统计
  const byType = {};
  const bySev = {};
  const byStatus = {};
  items.forEach(f => {
    byType[f.type] = (byType[f.type] || 0) + 1;
    if (f.severity) bySev[f.severity] = (bySev[f.severity] || 0) + 1;
    byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  });
  
  html += `<h2>📊 概览</h2><div class="summary">`;
  Object.entries(byType).forEach(([t, c]) => {
    const m = FEEDBACK_TYPES[t] || { icon: '◆', label: t };
    html += `<div class="summary-card">${m.icon} ${m.label}<b>${c}</b></div>`;
  });
  html += `</div>`;
  
  // 逐条
  items.forEach((f, i) => {
    const typeMeta = FEEDBACK_TYPES[f.type] || { icon: '◆', label: f.type };
    const sevMeta = f.severity ? (FEEDBACK_SEVERITIES[f.severity] || {}) : null;
    const statusMeta = FEEDBACK_STATUSES[f.status] || { label: f.status };
    
    html += `<div class="item"><div class="item-title">${i + 1}. ${typeMeta.icon} ${escapeHtml(f.title)}</div>`;
    html += `<div class="badges">`;
    html += `<span class="badge badge-${f.type}">${typeMeta.label}</span>`;
    if (sevMeta) html += `<span class="badge badge-${f.severity}">${sevMeta.icon || ''} ${sevMeta.label || f.severity}</span>`;
    html += `<span class="badge badge-status">${statusMeta.label}</span>`;
    if (f.module) html += `<span class="badge badge-status">${_feedbackGetModuleLabel(f.module)}</span>`;
    if (f.fixed_in_version) html += `<span class="badge" style="background:#dcfce7; color:#16a34a;">✅ v${escapeHtml(f.fixed_in_version)}</span>`;
    html += `</div>`;
    
    html += `<table class="meta-table">`;
    html += `<tr><td>ID</td><td><code style="font-size:10px;">${escapeHtml(f.id)}</code></td></tr>`;
    html += `<tr><td>提报人</td><td>${escapeHtml(f.reporter_name || '匿名')} (${escapeHtml(f.reporter_system || 'po')} 系统)</td></tr>`;
    html += `<tr><td>提交时间</td><td>${new Date(f.created_at).toLocaleString('zh-CN')}</td></tr>`;
    if (f.upvotes > 0) html += `<tr><td>点赞</td><td>👍 ${f.upvotes}</td></tr>`;
    if (f.app_version) html += `<tr><td>App 版本</td><td>${escapeHtml(f.app_version)}</td></tr>`;
    html += `</table>`;
    
    if (f.description) {
      html += `<div class="section-title">📝 详细描述</div><div class="desc-box">${escapeHtml(f.description)}</div>`;
    }
    if (f.reproduction_steps) {
      html += `<div class="section-title">🔄 复现步骤</div><div class="desc-box">${escapeHtml(f.reproduction_steps)}</div>`;
    }
    if (f.expected_behavior) {
      html += `<div class="section-title" style="color:#16a34a;">✓ 预期</div><div class="desc-box">${escapeHtml(f.expected_behavior)}</div>`;
    }
    if (f.actual_behavior) {
      html += `<div class="section-title" style="color:#dc2626;">✗ 实际</div><div class="desc-box">${escapeHtml(f.actual_behavior)}</div>`;
    }
    if (includeImages && f.screenshots && f.screenshots.length > 0) {
      html += `<div class="section-title">📷 截图 (${f.screenshots.length})</div><div class="screenshots">`;
      f.screenshots.forEach(s => { html += `<img src="${getImgSrc(s)}" alt="screenshot">`; });
      html += `</div>`;
    }
    if (f.ai_analysis && Object.keys(f.ai_analysis).length > 0) {
      html += `<div class="section-title">🤖 Claude AI 分析</div><div class="ai-section">`;
      if (f.ai_analysis.root_cause) html += `<div><b>根因:</b> ${escapeHtml(f.ai_analysis.root_cause)}</div>`;
      if (f.ai_analysis.proposed_fix) html += `<div><b>方案:</b> ${escapeHtml(f.ai_analysis.proposed_fix)}</div>`;
      if (f.ai_analysis.files_affected && f.ai_analysis.files_affected.length) html += `<div><b>文件:</b> ${f.ai_analysis.files_affected.map(x => `<code>${escapeHtml(x)}</code>`).join(', ')}</div>`;
      if (f.ai_analysis.estimated_hours) html += `<div><b>预估:</b> ${escapeHtml(String(f.ai_analysis.estimated_hours))} 小时</div>`;
      if (f.ai_analysis.risk) html += `<div><b>⚠ 风险:</b> ${escapeHtml(f.ai_analysis.risk)}</div>`;
      html += `</div>`;
    }
    if (f.comments && f.comments.length > 0) {
      html += `<div class="section-title">💬 评论 (${f.comments.length})</div>`;
      f.comments.forEach(c => {
        html += `<div class="comment"><div class="comment-meta"><b>${escapeHtml(c.user_name || c.user_id || '')}</b> · ${new Date(c.time).toLocaleString('zh-CN')}</div>${escapeHtml(c.text || '').replace(/\n/g, '<br>')}</div>`;
      });
    }
    if (f.browser_info) {
      html += `<details style="margin-top:10px;"><summary style="cursor:pointer; font-size:12px; color:#64748b;">🌐 环境信息</summary><div class="env-info">User Agent: ${escapeHtml(f.browser_info.userAgent || '?')}\nPlatform:   ${escapeHtml(f.browser_info.platform || '?')}\nScreen:     ${escapeHtml(f.browser_info.screen || '?')}\nViewport:   ${escapeHtml(f.browser_info.viewport || '?')}\nURL:        ${escapeHtml(f.browser_info.url || '?')}</div></details>`;
    }
    if (f.resolution_notes) {
      html += `<div class="section-title" style="color:#16a34a;">✅ 修复说明</div><div class="desc-box">${escapeHtml(f.resolution_notes)}</div>`;
    }
    if (f.rejection_reason) {
      html += `<div class="section-title" style="color:#dc2626;">❌ 不修复原因</div><div class="desc-box">${escapeHtml(f.rejection_reason)}</div>`;
    }
    
    html += `</div>`;
  });
  
  html += `<div class="footer">由 跟单工作台 反馈中心 自动生成 · 共 ${items.length} 条 · 报告生成于 ${now}</div>`;
  html += `</body></html>`;
  
  return html;
}

// Blob 下载工具
function _feedbackDownloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
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
window.feedbackOpenDownloadDialog = feedbackOpenDownloadDialog;
window.feedbackCloseDownloadDialog = feedbackCloseDownloadDialog;
window.feedbackDoDownload = feedbackDoDownload;
window._feedbackUpdateDlPreview = _feedbackUpdateDlPreview;
window.feedbackSetFilter = feedbackSetFilter;
window.feedbackSetSearchText = feedbackSetSearchText;
window.feedbackClearFilters = feedbackClearFilters;
window.feedbackLoad = feedbackLoad;
window._feedbackOnNewFiles = _feedbackOnNewFiles;
window._feedbackOnNewDrop = _feedbackOnNewDrop;
window._feedbackRmNewScreenshot = _feedbackRmNewScreenshot;
window._feedbackAttachScreenshot = _feedbackAttachScreenshot;
