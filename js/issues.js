// ============================================================
// 跟单团队工作台 · issues.js (V4 R1 · 2026-05-24)
// 供应商问题清单（针对供应商的合作问题：要求/规范/历史问题）
//
// R1 改造：
//   ✅ 修"自动保存空记录"bug — 新建 modal 是草稿态，点【保存】才入库
//   ✅ 加 7 个字段：所属网站 / 供应商 / 问题发起日期 / 大类 / 小标签 / 描述 / 状态
//   ✅ Modal HTML 完全动态生成（不动 index.html）
//   ✅ 老数据向后兼容（旧 issueType 自动显示为兼容大类）
//
// 依赖：core.js（DATA, ISSUES, CONFIG, ISSUE_STATUS_LABELS）
// ============================================================

// ============================================================
// 常量：问题大类 + 具体类型小标签（按大类联动）
// ============================================================
const ISSUE_CATEGORIES = [
  { value: 'craft',       icon: '🔧', label: '工艺要求',  color: '#a855f7' },
  { value: 'spec',        icon: '📐', label: '规格要求',  color: '#3b82f6' },
  { value: 'packaging',   icon: '📦', label: '包装要求',  color: '#f97316' },
  { value: 'logistics',   icon: '🚚', label: '物流要求',  color: '#06b6d4' },
  { value: 'price',       icon: '💰', label: '价格/账期', color: '#10b981' },
  { value: 'cooperation', icon: '🤝', label: '合作问题',  color: '#ef4444' },
];

const ISSUE_SUB_TAGS = {
  craft:       ['喷漆细节', '焊点处理', '抛光要求', '涂层厚度', '表面纹理'],
  spec:        ['尺寸偏差', '孔位错位', '材质替换', '电压标准', '颜色差异'],
  packaging:   ['纸箱规格', '内衬泡沫', '贴标位置', '防潮处理', '唛头打印'],
  logistics:   ['发货延迟', '单号错填', '漏发', '错发', '损坏'],
  price:       ['调价申请', '账期延长', '付款异常', '发票问题'],
  cooperation: ['响应慢', '品控差', '重复出错', '拒绝整改', '配合度低'],
};

// 老 issueType → 新 category 兼容映射（仅用于显示）
const _LEGACY_ISSUE_TYPE_MAP = {
  '配件需求': 'spec',
  '工艺要求': 'craft',
  '规格要求': 'spec',
  '包装要求': 'packaging',
  '质量改善': 'cooperation',
  '其他': 'cooperation',
};

function _getIssueCategoryMeta(it) {
  let value = it.category;
  if (!value && it.issueType) value = _LEGACY_ISSUE_TYPE_MAP[it.issueType] || '';
  return ISSUE_CATEGORIES.find(c => c.value === value) || null;
}

// R2: 跟进日期工具
function _isIssueOverdue(it) {
  if (!it.nextFollowDate) return false;
  if (it.status === 'resolved' || it.status === 'cancelled') return false;
  const today = new Date().toISOString().slice(0, 10);
  return it.nextFollowDate < today;
}
function _issueOverdueDays(it) {
  if (!it.nextFollowDate) return 0;
  const today = new Date();
  const target = new Date(it.nextFollowDate);
  return Math.floor((today - target) / 86400000);
}

// R2: 跟进日期快捷设置
function setIssueFollowDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const dateStr = date.toISOString().slice(0, 10);
  if (_issueDraft) {
    _issueDraft.nextFollowDate = dateStr;
    _renderIssueModal({ isDraft: true });
  } else {
    persistCurrentIssue(it => { it.nextFollowDate = dateStr; });
    _renderIssueModal({ isDraft: false });
    renderIssues();
  }
  toast(`✓ 已设置 ${daysFromNow} 天后跟进（${dateStr}）`);
}

function clearIssueFollowDate() {
  if (_issueDraft) {
    _issueDraft.nextFollowDate = '';
    _renderIssueModal({ isDraft: true });
  } else {
    persistCurrentIssue(it => { it.nextFollowDate = ''; });
    _renderIssueModal({ isDraft: false });
    renderIssues();
  }
}

// R2: 进供应商问题 tab 时扫一遍逾期的，弹 toast
function scanOverdueIssues() {
  const overdue = (ISSUES || []).filter(it => _isIssueOverdue(it) && !it.deletedAt);
  if (overdue.length === 0) return;
  // 按逾期天数倒序，最严重的在前
  overdue.sort((a, b) => _issueOverdueDays(b) - _issueOverdueDays(a));
  const top3 = overdue.slice(0, 3);
  const msg = `⚠ ${overdue.length} 个供应商问题已逾期跟进\n` + 
              top3.map(it => `• ${it.supplier || '未填'} · 逾期 ${_issueOverdueDays(it)} 天`).join('\n');
  toast(msg, 'warn', 8000);
}

// 注入新 modal 的 CSS（一次性，不动 styles.css）
(function _injectIssueModalCSS() {
  if (document.getElementById('issue-modal-r1-style')) return;
  const s = document.createElement('style');
  s.id = 'issue-modal-r1-style';
  s.textContent = `
    /* V4-2026-05-24 修复：强制设置 #issueModal 容器为全屏遮罩 modal
       之前直接 innerHTML 替换内容，但容器本身没有 fixed/overlay 样式，
       导致 modal 内容直接铺在页面上，下层 tab 栏/列表/按钮穿透显示。*/
    #issueModal {
      position: fixed !important;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 9999;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 40px 20px;
      overflow-y: auto;
      box-sizing: border-box;
    }
    #issueModal.show {
      display: flex !important;
    }
    #issueModal .modal-card {
      background: white !important;
      padding: 28px !important;
      border-radius: 14px !important;
      width: 100% !important;
      max-width: 760px !important;
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      position: relative;
      margin: 0 auto;
      animation: ismFadeIn 0.18s ease-out;
    }
    @keyframes ismFadeIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #issueModal .modal-close {
      position: absolute;
      top: 14px; right: 14px;
      width: 32px; height: 32px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 18px;
      color: #6b7280;
      border-radius: 6px;
      line-height: 1;
      z-index: 1;
    }
    #issueModal .modal-close:hover {
      background: #fee2e2;
      color: #dc2626;
    }
    #issueModal h2 {
      font-size: 18px;
      margin: 0 0 18px 0;
      padding-right: 40px;
      color: #111827;
    }

    /* 内部表单结构 */
    .ism-section {
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px dashed var(--border-subtle, #e5e7eb);
    }
    .ism-section:last-of-type { border-bottom: none; }
    .ism-section-title {
      font-size: 12px; font-weight: 700;
      color: var(--text-secondary, #6b7280);
      margin-bottom: 8px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .ism-row {
      display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;
    }
    .ism-row > .ism-field { flex: 1; min-width: 180px; }
    .ism-field label {
      display: block; font-size: 12px; color: var(--text-secondary, #6b7280);
      margin-bottom: 4px; font-weight: 600;
    }
    .ism-field label .req { color: #dc2626; }
    .ism-field input, .ism-field select, .ism-field textarea {
      width: 100%; padding: 8px 10px; border: 1px solid var(--border, #d1d5db);
      border-radius: 6px; font-size: 13px; box-sizing: border-box;
      background: white;
    }
    .ism-field input:focus, .ism-field select:focus, .ism-field textarea:focus {
      outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
    }
    .ism-field textarea { resize: vertical; min-height: 70px; font-family: inherit; }

    .ism-category-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
    }
    .ism-cat-btn {
      padding: 12px 10px; border: 2px solid var(--border, #e5e7eb);
      border-radius: 8px; background: white; cursor: pointer;
      font-size: 13px; font-weight: 600; text-align: center;
      transition: all 0.15s; user-select: none;
      display: flex; flex-direction: column; align-items: center; gap: 4px;
    }
    .ism-cat-btn:hover { border-color: #9ca3af; background: #f9fafb; }
    .ism-cat-btn.selected {
      background: rgba(37, 99, 235, 0.08);
      border-color: #2563eb;
      color: #1d4ed8;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    .ism-cat-btn .ism-cat-icon { font-size: 20px; }

    .ism-subtag-grid {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
    }
    .ism-subtag-btn {
      padding: 5px 12px; border: 1px solid var(--border, #d1d5db);
      border-radius: 999px; background: white; cursor: pointer;
      font-size: 12px; transition: all 0.12s; user-select: none;
    }
    .ism-subtag-btn:hover { background: #f3f4f6; }
    .ism-subtag-btn.selected {
      background: #2563eb; border-color: #2563eb; color: white; font-weight: 600;
    }
    .ism-subtag-empty {
      font-size: 12px; color: var(--text-tertiary, #9ca3af);
      padding: 6px 0; font-style: italic;
    }

    .ism-status-grid { display: flex; gap: 6px; flex-wrap: wrap; }
    .ism-status-grid .status-pill {
      cursor: pointer; padding: 6px 14px; border-radius: 6px;
      border: 2px solid transparent; transition: all 0.12s;
    }
    .ism-status-grid .status-pill.selected {
      border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
    }

    .ism-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      padding-top: 16px; margin-top: 8px;
      border-top: 1px solid var(--border-subtle, #e5e7eb);
      position: sticky;
      bottom: -28px;
      background: white;
      margin: 16px -28px -28px -28px;
      padding: 16px 28px;
      border-bottom-left-radius: 14px;
      border-bottom-right-radius: 14px;
    }
    .ism-footer .ism-hint {
      flex: 1; font-size: 12px; color: var(--text-tertiary, #9ca3af);
      display: flex; align-items: center;
    }
    .ism-footer button {
      padding: 8px 18px;
      border-radius: 6px;
      border: 1px solid var(--border, #d1d5db);
      background: white;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .ism-footer button.primary {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
    }
    .ism-footer button.primary:hover { background: #1d4ed8; }
    .ism-footer button.danger {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fecaca;
    }
    .ism-footer button.danger:hover { background: #fecaca; }
    .ism-footer button:not(.primary):not(.danger):hover {
      background: #f3f4f6;
    }

    .ism-timeline-section { margin-top: 8px; }
    .ism-fu-input-row {
      display: flex; gap: 8px; align-items: flex-start; margin-top: 8px;
    }
    .ism-fu-input-row input[type="date"] { flex-shrink: 0; width: 150px; }
    .ism-fu-input-row textarea { flex: 1; min-height: 60px; }
  `;
  document.head.appendChild(s);
})();

let _issuesQuickMode = '';

// V20260526e: 问题日期筛选
let _issuesDatePreset = 'all';
function issuesOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        _issuesDatePreset = customPreset;
        const el = document.getElementById('isDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        renderIssues();
      });
    }
    return;
  }
  _issuesDatePreset = preset || 'all';
  renderIssues();
}

// ============================================================
// 列表渲染
// ============================================================
// V20260601-issuegrid:列表/网格切换(同催单设计)· 存 localStorage
let _issuesViewMode = (localStorage.getItem('issues_view_mode') || 'list');
function setIssuesViewMode(mode) {
  if (!['list', 'grid'].includes(mode)) return;
  _issuesViewMode = mode;
  localStorage.setItem('issues_view_mode', mode);
  document.querySelectorAll('#isViewToggle .o-view-btn').forEach(b => {
    const active = b.dataset.view === mode;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--bg-card)' : 'transparent';
    b.style.color = active ? 'var(--accent)' : 'var(--text-secondary)';
    b.style.fontWeight = active ? '600' : '400';
  });
  renderIssues();
}

function renderIssues() {
  const container = document.getElementById('issuesContainer');
  // V20260526o: 关键修复 · 先填充日期 select(避免空列表时早 return 跳过)
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('isDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _issuesDatePreset || 'all');
  }
  const q = (document.getElementById('isSearch').value || '').trim().toLowerCase();
  const fs = document.getElementById('isFilterStatus').value;
  const fType = document.getElementById('isFilterType').value;
  const view = document.getElementById('isView').value;
  // V20260601-issuegrid:同步 列表/网格 按钮高亮(刷新后保持上次选择)
  document.querySelectorAll('#isViewToggle .o-view-btn').forEach(b => {
    const active = b.dataset.view === _issuesViewMode;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--bg-card)' : 'transparent';
    b.style.color = active ? 'var(--accent)' : 'var(--text-secondary)';
    b.style.fontWeight = active ? '600' : '400';
  });
  
  let list = ISSUES.filter(it => {
    if (q) {
      const t = [it.supplier, it.issueType, it.category, it.requirement, it.description, it._agent].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fType) {
      const matchOld = it.issueType === fType;
      const matchNew = it.category === fType;
      if (!matchOld && !matchNew) return false;
    }
    if (fs === 'active') return it.status !== 'resolved';
    if (fs === 'completed') return it.status === 'resolved';
    if (fs === 'all') return true;
    return it.status === fs;
  });

  // V20260526e: 日期筛选
  if (_issuesDatePreset && _issuesDatePreset !== 'all' && typeof isDateInRange === 'function') {
    list = list.filter(it => isDateInRange(it.createdDate || it.created_at, _issuesDatePreset));
  }

  if (_issuesQuickMode === 'stuck') {
    list = list.filter(it =>
      !['resolved','cancelled'].includes(it.status) &&
      (it.followups || []).length >= 3
    );
  }
  
  if (list.length === 0) {
    container.innerHTML = `<div class="records-card records-card-empty"><div class="empty-state"><div class="icon">⚠</div><div class="text">${ISSUES.length === 0 ? '还没有记录供应商问题。点 "+ 新增问题" 开始' : '没有匹配的问题'}</div>${ISSUES.length === 0 ? '<button class="btn primary" onclick="addIssue()">+ 新增第一个</button>' : ''}</div></div>`;
    return;
  }
  
  if (view === 'grouped') {
    const grouped = {};
    list.forEach(it => {
      const s = it.supplier || '未填供应商';
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(it);
    });
    const sortedSuppliers = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);
    
    container.innerHTML = sortedSuppliers.map(sup => {
      const items = grouped[sup];
      const unresolved = items.filter(i => i.status !== 'resolved').length;
      return `
        <div class="supplier-group">
          <div class="supplier-group-head">
            <div class="name">🏭 ${escapeHtml(sup)} <span class="count-badge">${items.length} 项</span>${unresolved > 0 ? `<span class="unresolved-badge">${unresolved} 未解决</span>` : ''}</div>
          </div>
          <div class="supplier-group-body">
            ${_issuesViewMode === 'grid'
              ? `<div class="as-grid">${items.map((it, i) => renderIssueCard(it, i)).join('')}</div>`
              : items.map((it, i) => renderIssueRow(it, i)).join('')}
          </div>
        </div>
      `;
    }).join('');
  } else if (_issuesViewMode === 'grid') {
    // 不分组 + 网格:图墙(同催单 .as-grid)
    container.innerHTML = `<div class="records-card"><div class="as-grid">${list.map((it, i) => renderIssueCard(it, i)).join('')}</div><div class="add-row" onclick="addIssue()">+ 新增问题</div></div>`;
  } else {
    container.innerHTML = `
      <div class="records-card">
        <div class="records-header issues-header">
          <div>#</div><div>状态</div><div>供应商</div><div>类型</div><div>具体要求</div>
          <div>沟通次数</div><div>最后沟通</div><div style="text-align: right;">操作</div>
        </div>
        <div>${list.map((it, i) => renderIssueRow(it, i)).join('')}</div>
        <div class="add-row" onclick="addIssue()">+ 新增问题</div>
      </div>
    `;
  }
  // V20260526e: 填充日期筛选下拉
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('isDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _issuesDatePreset || 'all');
  }
}

// V20260601-issuefix #6:网格卡片
function renderIssueCard(it, i) {
  const catMeta = _getIssueCategoryMeta(it);
  const cat = catMeta ? `${catMeta.icon} ${catMeta.label}` : (it.issueType || '—');
  const desc = (it.description || it.requirement || '').slice(0, 60);
  const shots = [...new Set([...((it.products||[]).map(p=>p.image_url).filter(Boolean)), ...(it.screenshots||[])])];
  const cover = shots[0];
  const siteBadge = it.site ? `<span class="site-badge s-${it.site}">${escapeHtml(it.site)}</span>` : '';
  const overdue = _isIssueOverdue(it);
  return `
    <div class="issue-card s-${it.status}" onclick="openIssueModal('${it._id}', '${escapeHtml(it._agent || '')}')"
         style="border:1px solid ${overdue ? '#dc2626' : 'var(--border)'}; border-radius:10px; overflow:hidden; cursor:pointer; background:var(--bg-card); transition:box-shadow .15s;"
         onmouseover="this.style.boxShadow='var(--shadow-lg)'" onmouseout="this.style.boxShadow=''">
      <div style="height:130px; background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;">
        ${cover
          ? `<img src="${cover}" style="width:100%; height:100%; object-fit:cover;" onclick="event.stopPropagation(); viewImage('${cover}')">${shots.length>1 ? `<span style="position:absolute; right:6px; bottom:6px; background:rgba(0,0,0,0.6); color:#fff; font-size:10px; padding:1px 6px; border-radius:8px;">📷 ${shots.length}</span>` : ''}`
          : '<span style="color:var(--text-tertiary); font-size:12px;">📭 无图</span>'}
      </div>
      <div style="padding:8px 10px;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">${siteBadge}<b style="font-size:13px;">${escapeHtml(it.supplier || '⚠ 待补充')}</b></div>
        <div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">${escapeHtml(cat)}</div>
        <div style="font-size:11.5px; color:var(--text-primary); line-height:1.4; min-height:32px;">${escapeHtml(desc)}${desc.length >= 60 ? '...' : ''}</div>
        <div style="margin-top:6px;"><span class="status-pill s-${it.status}">${ISSUE_STATUS_LABELS[it.status]}</span></div>
      </div>
    </div>`;
}

function renderIssueRow(it, i) {
  const fuCount = (it.followups || []).length;
  const lastFu = fuCount > 0 ? it.followups[fuCount - 1] : null;
  const lastDate = lastFu ? lastFu.date : '';
  const lastNote = lastFu ? lastFu.note : '';
  
  const supplierHtml = it.supplier 
    ? escapeHtml(it.supplier)
    : '<span style="color:var(--warning); font-weight:600;">⚠ 待补充</span>';
  
  const fuBadge = fuCount === 0 
    ? '<span style="color:var(--text-tertiary);">—</span>'
    : fuCount >= 3 
      ? `<b style="color:var(--danger);">${fuCount} 次 ⚠</b>` 
      : `<b style="color:var(--text-primary);">${fuCount} 次</b>`;
  
  const agentBadge = IS_ADMIN && it._agent 
    ? `<div style="font-size:9px;color:var(--text-tertiary); margin-top:2px;">👤 ${escapeHtml(it._agent)}</div>` 
    : '';
  
  // R1：分类显示（兼容老数据 issueType）
  const catMeta = _getIssueCategoryMeta(it);
  const categoryHtml = catMeta 
    ? `<span style="background:${catMeta.color}1f; color:${catMeta.color}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">${catMeta.icon} ${catMeta.label}</span>`
    : (it.issueType 
        ? `<span style="background:rgba(124,58,237,0.08); color:var(--purple); padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">${escapeHtml(it.issueType)}</span>`
        : '<span style="color:var(--text-tertiary); font-size:11px;">—</span>');
  
  const subTagsHtml = (it.subTags && it.subTags.length > 0)
    ? `<div style="margin-top:4px; display:flex; gap:4px; flex-wrap:wrap;">${it.subTags.slice(0,3).map(t => 
        `<span style="background:#e0e7ff; color:#3730a3; padding:1px 6px; border-radius:3px; font-size:10px;">${escapeHtml(t)}</span>`
      ).join('')}${it.subTags.length > 3 ? `<span style="color:var(--text-tertiary); font-size:10px;">+${it.subTags.length-3}</span>` : ''}</div>`
    : '';
  
  const desc = it.description || it.requirement || '';
  const descHtml = desc 
    ? escapeHtml(desc.slice(0, 100)) + (desc.length > 100 ? '...' : '')
    : '<span style="color:var(--text-tertiary);">未填写描述</span>';
  // V20260601-issuefix #6:行内问题截图缩略图(模仿售后 · 点击看大图)
  const shots = [...new Set([...((it.products||[]).map(p=>p.image_url).filter(Boolean)), ...(it.screenshots||[])])];
  const thumbHtml = shots.length > 0
    ? `<div style="display:flex; gap:3px; margin-top:5px; flex-wrap:wrap;">${shots.slice(0,3).map(sc => `<img src="${sc}" style="width:42px; height:42px; object-fit:cover; border-radius:4px; cursor:zoom-in; border:1px solid var(--border);" onclick="event.stopPropagation(); viewImage('${sc}')">`).join('')}${shots.length>3 ? `<span style="font-size:10px; color:var(--text-tertiary); align-self:center;">+${shots.length-3}</span>` : ''}</div>`
    : '';
  
  const lastFuHtml = lastFu 
    ? `<div style="margin-top: 6px; padding: 6px 10px; background: var(--bg-elevated); border-radius: 6px; font-size: 11.5px; color: var(--text-secondary); line-height: 1.4;">
         <b style="color:var(--accent);">📞 最近沟通 · ${formatShortDate(lastDate)}：</b>${escapeHtml((lastNote || '').slice(0, 80))}${(lastNote || '').length > 80 ? '...' : ''}
       </div>` 
    : '<div style="margin-top:4px; font-size:11px; color:var(--warning);">⚠ 还没记录沟通</div>';
  
  const siteBadge = it.site ? `<span class="site-badge s-${it.site}" style="margin-right:4px;">${escapeHtml(it.site)}</span>` : '';
  
  // R2: 逾期跟进的红色徽章 / 待跟进倒计时
  let followBadge = '';
  if (it.nextFollowDate && it.status !== 'resolved' && it.status !== 'cancelled') {
    if (_isIssueOverdue(it)) {
      followBadge = `<span style="background:#dc2626; color:white; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; margin-left:4px;">⚠ 逾期 ${_issueOverdueDays(it)} 天</span>`;
    } else {
      const daysLeft = -_issueOverdueDays(it);
      if (daysLeft <= 3) {
        followBadge = `<span style="background:#f59e0b; color:white; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; margin-left:4px;">⏰ ${daysLeft} 天后跟进</span>`;
      } else {
        followBadge = `<span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:4px; font-size:11px; margin-left:4px;">📅 ${daysLeft} 天后跟进</span>`;
      }
    }
  }
  
  return `
    <div class="record-row s-${it.status}${_isIssueOverdue(it) ? ' issue-overdue' : ''}" onclick="openIssueModal('${it._id}', '${escapeHtml(it._agent || '')}')">
      <div class="row-num">${i + 1}${agentBadge}</div>
      <div><span class="status-pill s-${it.status}">${ISSUE_STATUS_LABELS[it.status]}</span>${followBadge}</div>
      <div class="cell-text" style="font-weight:600;">${siteBadge}${supplierHtml}</div>
      <div class="cell-text">${categoryHtml}${subTagsHtml}</div>
      <div class="cell-text" style="line-height:1.4;">
        <div>${descHtml}</div>
        ${thumbHtml}
        ${lastFuHtml}
      </div>
      <div class="cell-text mono" style="text-align:center;">${fuBadge}</div>
      <div class="date-cell ${lastDate ? '' : 'empty'}">${formatShortDate(lastDate)}</div>
      <div class="row-actions">
        ${it.status !== 'resolved' ? `<button class="action-btn done" title="一键标记为已解决" onclick="event.stopPropagation(); quickResolveIssue('${it._id}', '${escapeHtml(it._agent || '')}')">✓</button>` : '<span style="width: 28px;"></span>'}
        <button class="action-btn delete" title="删除" onclick="event.stopPropagation(); delIssueRow('${it._id}', '${escapeHtml(it._agent || '')}')">🗑</button>
      </div>
    </div>
  `;
}

// ============================================================
// 草稿态：新建问题（R1 核心修复）
// 旧逻辑：点【新增】直接 insert → 即使没填字段也留下脏数据
// 新逻辑：点【新增】弹"草稿 modal"，本地暂存 → 点【保存】才校验+入库
// ============================================================
let _issueDraft = null;

function addIssue() {
  const me = CONFIG.agents.find(a => a.name === CURRENT_AGENT);
  const defaultSite = (me && me.sites && me.sites.length > 0) ? me.sites[0] : '';
  // V28j 修:必须清空 _currentItemId · 否则粘贴图片会判定为"编辑模式"写到上一个问题
  if (typeof _currentItemId !== 'undefined') _currentItemId = null;
  _newScreenshots_fu = [];
  _issueDraft = {
    site: defaultSite,
    supplier: '',
    createdDate: new Date().toISOString().slice(0, 10),
    category: '',
    subTags: [],
    description: '',
    status: 'pending',
    nextFollowDate: '',  // R2: 下次跟进日期
    followups: [],
    screenshots: [],
    orderNo: '',          // V20260602:关联订单号
    products: [],         // V20260602:抓取选中的产品
  };
  
  _renderIssueModal({ isDraft: true });
  document.getElementById('issueModal').classList.add('show');
  if (typeof issAutoFetchProducts === 'function') issAutoFetchProducts();
}

// V20260601-issuefix:重渲前把输入框里已敲的值存进草稿 · 否则点问题大类/加图片会清空供应商和详细描述
function _captureIssueDraftFromDOM() {
  if (!_issueDraft) return;
  const site = document.getElementById('ismSite');
  const sup  = document.getElementById('ismSupplier');
  const cd   = document.getElementById('ismCreatedDate');
  const desc = document.getElementById('ismDescription');
  if (site) _issueDraft.site = site.value;
  if (sup)  _issueDraft.supplier = sup.value;
  if (cd)   _issueDraft.createdDate = cd.value;
  if (desc) _issueDraft.description = desc.value;
  const ono = document.getElementById('ismOrderNo');
  if (ono) _issueDraft.orderNo = ono.value;
}

async function saveDraftIssue() {
  _captureIssueDraftFromDOM();  // V20260601-issuefix:先抓 DOM 值
  if (!_issueDraft) return;
  
  _issueDraft.site = document.getElementById('ismSite').value;
  _issueDraft.supplier = document.getElementById('ismSupplier').value.trim();
  _issueDraft.createdDate = document.getElementById('ismCreatedDate').value;
  _issueDraft.description = document.getElementById('ismDescription').value.trim();
  
  const missing = [];
  if (!_issueDraft.supplier) missing.push('供应商');
  if (!_issueDraft.category) missing.push('问题大类');
  if (missing.length > 0) {
    toast(`请填写：${missing.join(' / ')}`, 'warn', 4000);
    return;
  }
  
  const newIt = {
    _id: 'I' + Date.now() + Math.random().toString(36).slice(2, 6),
    site: _issueDraft.site,
    supplier: _issueDraft.supplier,
    createdDate: _issueDraft.createdDate,
    category: _issueDraft.category,
    subTags: _issueDraft.subTags || [],
    description: _issueDraft.description,
    requirement: _issueDraft.description,  // 老字段兼容
    nextFollowDate: _issueDraft.nextFollowDate || '',  // R2: 下次跟进日期
    status: 'pending',
    followups: [],
    screenshots: _issueDraft.screenshots || [],  // V20260601-issuefix:保存草稿里的图片(原来写死 [] 把图丢了)
    orderNo: _issueDraft.orderNo || '',          // V20260602
    products: _issueDraft.products || [],        // V20260602
    createdAt: new Date().toISOString(),
  };
  
  const arr = DATA.getIssues(CURRENT_AGENT);
  arr.unshift(newIt);
  DATA.saveIssues(CURRENT_AGENT, arr);
  loadAllData();
  renderIssues();
  updateIssueStats();
  
  try {
    await DATA.saveAndSyncIssues(CURRENT_AGENT);
  } catch (err) {
    console.error('新增问题同步失败:', err);
    toast('云端同步失败：' + (err.message || err), 'err');
  }
  
  toast(`✓ 已新建供应商问题（${newIt.supplier}）`);
  
  _issueDraft = null;
  _currentItemId = newIt._id;
  _currentItemType = 'issue';
  window._currentItemAgent = CURRENT_AGENT;
  _renderIssueModal({ isDraft: false });
}

function closeDraftIssue() {
  _issueDraft = null;
  closeModal('issueModal');
}

function selectIssueCategory(value) {
  if (_issueDraft) {
    _captureIssueDraftFromDOM();  // V20260601-issuefix
    _issueDraft.category = value;
    _issueDraft.subTags = [];
    _renderIssueModal({ isDraft: true });
  } else {
    persistCurrentIssue(it => {
      it.category = value;
      it.subTags = [];
    });
    _renderIssueModal({ isDraft: false });
    renderIssues();
  }
}

function toggleIssueSubTag(tag) {
  if (_issueDraft) {
    _captureIssueDraftFromDOM();  // V20260601-issuefix
    const i = _issueDraft.subTags.indexOf(tag);
    if (i >= 0) _issueDraft.subTags.splice(i, 1);
    else _issueDraft.subTags.push(tag);
    _renderIssueModal({ isDraft: true });
  } else {
    persistCurrentIssue(it => {
      if (!it.subTags) it.subTags = [];
      const i = it.subTags.indexOf(tag);
      if (i >= 0) it.subTags.splice(i, 1);
      else it.subTags.push(tag);
    });
    _renderIssueModal({ isDraft: false });
    renderIssues();
  }
}

// ============================================================
// 列表行的快捷操作
// ============================================================
async function quickResolveIssue(id, agent) {
  const ownerAgent = (IS_ADMIN && agent) ? agent : CURRENT_AGENT;
  const arr = DATA.getIssues(ownerAgent);
  const it = arr.find(x => x._id === id);
  if (!it) return;
  
  if (it.status === 'resolved') {
    toast('该问题已是「已解决」状态', 'warn');
    return;
  }
  
  const catMeta = _getIssueCategoryMeta(it);
  const catLabel = catMeta ? catMeta.label : (it.issueType || '');
  const msg = `供应商问题「${it.supplier || '该问题'}${catLabel ? ' · ' + catLabel : ''}」已经解决？\n\n会标记为：✓ 已解决`;
  if (!confirm(msg)) return;
  
  it.status = 'resolved';
  
  DATA._cache.issuesByAgent[ownerAgent] = arr;
  loadAllData();
  renderActiveTab();
  toast('正在同步到云端...', 'info', 8000);
  
  try {
    DATA._cancelDebounce && DATA._cancelDebounce('issues_' + ownerAgent);
    await fullSyncIssues(ownerAgent);
    toast(`✓ 问题已标记「已解决」并已同步`);
  } catch (err) {
    console.error('同步失败:', err);
    toast('本地已更新，云端同步失败：' + (err.message || err), 'err');
  }
}

function delIssueRow(id, agent) {
  if (!confirm('确定删除？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  const owner = (IS_ADMIN && agent) ? agent : CURRENT_AGENT;
  const arr = DATA.getIssues(owner);
  const it = arr.find(x => x._id === id);
  if (!it) return;
  it.deletedAt = new Date().toISOString();
  it.deletedBy = CURRENT_AGENT;
  DATA.saveIssues(owner, arr);
  loadAllData();
  renderActiveTab();
  toast('已移入回收站');
}

// ============================================================
// 编辑模式入口
// ============================================================
function openIssueModal(id, agent) {
  const owner = agent || CURRENT_AGENT;
  const it = DATA.getIssues(owner).find(x => x._id === id);
  if (!it) return;
  _currentItemId = id;
  _currentItemType = 'issue';
  _newScreenshots_fu = [];
  window._currentItemAgent = owner;
  _issueDraft = null;
  
  _renderIssueModal({ isDraft: false });
  document.getElementById('issueModal').classList.add('show');
  if (typeof issAutoFetchProducts === 'function') issAutoFetchProducts();
}

// ============================================================
// 渲染 modal 内容（草稿 + 编辑共用）
// ============================================================
function _renderIssueModal({ isDraft }) {
  const modal = document.getElementById('issueModal');
  if (!modal) return;
  
  const data = isDraft ? _issueDraft : currentIssue();
  if (!data) return;
  
  const SITES = ['VK', 'DF', 'DC', 'PL', 'RD', 'MH', 'LS', 'MJ', 'RS', ''];
  
  const catGridHtml = ISSUE_CATEGORIES.map(c => `
    <div class="ism-cat-btn ${data.category === c.value ? 'selected' : ''}" 
         onclick="selectIssueCategory('${c.value}')"
         title="${c.label}">
      <span class="ism-cat-icon">${c.icon}</span>
      <span>${c.label}</span>
    </div>
  `).join('');
  
  let subTagsHtml = '';
  if (data.category) {
    const tags = ISSUE_SUB_TAGS[data.category] || [];
    subTagsHtml = tags.map(t => `
      <div class="ism-subtag-btn ${(data.subTags || []).includes(t) ? 'selected' : ''}"
           onclick="toggleIssueSubTag('${t}')">${t}</div>
    `).join('');
  } else {
    subTagsHtml = '<div class="ism-subtag-empty">← 先选问题大类，再选具体类型</div>';
  }
  
  let timelineHtml = '';
  if (!isDraft) {
    const fu = data.followups || [];
    timelineHtml = `
      <div class="ism-section ism-timeline-section">
        <div class="ism-section-title">📞 沟通记录 · ${fu.length} 次</div>
        ${fu.length === 0 ? '<div style="font-size:12px; color:var(--text-tertiary); padding:8px 0;">还没有沟通记录</div>' : ''}
        <div id="ismTimeline">
          ${fu.map((f, i) => `
            <div style="border-left: 3px solid var(--purple); padding: 8px 12px; margin: 6px 0; background: var(--bg-elevated); border-radius: 0 6px 6px 0;">
              <div style="font-size: 11px; color: var(--text-tertiary); margin-bottom: 4px;">📅 ${escapeHtml(f.date || '')} ${escapeHtml(f.time || '')}</div>
              <div style="font-size: 13px;">${escapeHtml(f.note || '')}</div>
              ${(f.screenshots && f.screenshots.length > 0) ? `<div style="display:flex; gap:4px; margin-top:6px;">${f.screenshots.map(s => `<img src="${s}" style="width:48px; height:48px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="viewImage('${s}')">`).join('')}</div>` : ''}
              <button onclick="delIssueFollowup(${i})" style="margin-top: 4px; font-size: 11px; color: #dc2626; background: none; border: none; cursor: pointer;">删除</button>
            </div>
          `).join('')}
        </div>
        <div class="ism-fu-input-row">
          <input type="date" id="ismNewDate" value="${new Date().toISOString().slice(0,10)}">
          <textarea id="ismNewNote" placeholder="本次沟通了什么？对方答复？下一步？ · 可 Ctrl+V 粘贴截图" rows="2" data-paste-target="issue_fu"></textarea>
          <button class="btn primary" id="ismAddFuBtn" onclick="addIssueFollowup()" style="flex-shrink:0; align-self:stretch;">+ 添加</button>
        </div>
        <div id="ismFuHint" style="display:none; margin-top:6px; padding:8px 10px; background:#fef3c7; border:1px solid #f59e0b; border-radius:6px; font-size:12px; color:#92400e;">
          ⚠️ 有 <b id="ismFuHintCount">0</b> 张图未保存 · 请点上面 <b>「+ 添加」</b>(可不填文字)· 关闭弹窗会丢图
        </div>
        <div style="margin-top:6px; display:flex; align-items:center; gap:8px;">
          <button type="button" class="btn small" onclick="document.getElementById('ismFuFileInput').click()">📷 上传图片</button>
          <input type="file" id="ismFuFileInput" accept="image/*" multiple style="display:none;" onchange="onIssueFuFiles(this.files)">
          <span style="font-size:11px; color:var(--text-tertiary);">将沟通截图直接保存到记录里</span>
        </div>
        <div id="ismFuThumbs" style="display:flex; gap:4px; margin-top:6px;"></div>
      </div>
    `;
  }
  
  let statusHtml = '';
  if (!isDraft) {
    statusHtml = `
      <div class="ism-section">
        <div class="ism-section-title">当前处理状态</div>
        <div class="ism-status-grid">
          ${Object.entries(ISSUE_STATUS_LABELS).map(([k, v]) => `
            <span class="status-pill s-${k} ${data.status === k ? 'selected' : ''}" 
                  onclick="setIssueStatus('${k}')">${v}</span>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  const title = isDraft 
    ? '➕ 新建供应商问题' 
    : `✏️ ${escapeHtml(data.supplier || '(未填供应商)')}${IS_ADMIN && window._currentItemAgent ? ` <span style="font-size:11px;background:rgba(124,58,237,0.1);color:var(--purple);padding:2px 8px;border-radius:4px;font-weight:600;">👤 ${escapeHtml(window._currentItemAgent)}</span>` : ''}`;
  
  const footerHtml = isDraft
    ? `
      <div class="ism-hint">💡 必填：供应商 + 问题大类</div>
      <button class="btn" onclick="closeDraftIssue()">取消</button>
      <button class="btn primary" onclick="saveDraftIssue()">💾 保存并继续编辑</button>
    `
    : `
      <div class="ism-hint">字段修改会自动同步</div>
      <button class="btn danger" onclick="deleteCurrentIssue()">🗑 删除</button>
      <button class="btn primary" onclick="closeIssueModal()">关闭</button>
    `;
  
  modal.innerHTML = `
    <div class="modal-card" style="width: 1180px; max-width: 96vw; max-height: 92vh; padding: 20px 24px;">
      <button class="modal-close" onclick="${isDraft ? 'closeDraftIssue()' : `closeIssueModal()`}">✕</button>
      <div style="display:flex; align-items:baseline; gap:14px; margin-bottom:10px;">
        <h2 style="margin:0;">${title}</h2>
      </div>
      
      <!-- 顶部:基本信息一行 -->
      <div style="display:grid; grid-template-columns: 140px 1fr 1fr 160px; gap:10px; margin-bottom:12px; padding:12px; background:var(--bg-elevated); border-radius:8px;">
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:11px;">所属网站</label>
          <select id="ismSite" ${isDraft ? '' : `onchange="onIssueField('site', this.value)"`} style="padding:6px 8px; font-size:13px; width:100%;">
            ${SITES.map(s => `<option value="${s}" ${data.site === s ? 'selected' : ''}>${s || '— 通用 —'}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:11px;">供应商 <span class="req">*</span></label>
          <input type="text" id="ismSupplier" value="${escapeHtml(data.supplier || '')}" placeholder="如:光朗、3D打印、星沃"
                 ${isDraft ? '' : `onchange="onIssueField('supplier', this.value.trim())"`}
                 style="padding:6px 8px; font-size:13px; width:100%;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:11px;">订单号（自动抓产品 · 多个用 / 隔开）</label>
          <input type="text" id="ismOrderNo" value="${escapeHtml(data.orderNo || '')}" placeholder="如 V110375/V110540"
                 oninput="issOrderNoChanged(this.value)"
                 style="padding:6px 8px; font-size:13px; width:100%;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:11px;">问题发起日期</label>
          <input type="date" id="ismCreatedDate" value="${data.createdDate || new Date().toISOString().slice(0,10)}"
                 ${isDraft ? '' : `onchange="onIssueField('createdDate', this.value)"`}
                 style="padding:6px 8px; font-size:13px; width:100%;">
        </div>
      </div>
      
      <!-- V20260602:抓取的产品(多选 · 自动填图和规格) -->
      <div id="issFetchPanel" style="margin-bottom:12px; padding:10px 12px; background:var(--bg-elevated); border-radius:8px;"></div>

      <!-- 问题大类 + 状态 一行 -->
      <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px; margin-bottom:12px;">
        <div style="padding:10px 12px; background:var(--bg-elevated); border-radius:8px;">
          <div style="font-size:11px; color:var(--text-secondary); font-weight:600; margin-bottom:6px;">问题大类 <span style="color:#dc2626;">*</span></div>
          <div class="ism-category-grid" style="grid-template-columns:repeat(6, 1fr); gap:4px;">${catGridHtml}</div>
        </div>
        <div style="padding:10px 12px; background:var(--bg-elevated); border-radius:8px;">
          <div style="font-size:11px; color:var(--text-secondary); font-weight:600; margin-bottom:6px;">当前状态</div>
          ${statusHtml.replace('<div class="ism-section">', '<div style="margin:0;">').replace('<div class="ism-section-title">当前状态</div>', '').replace(/<\/div>\s*$/, '</div>')}
        </div>
      </div>
      
      <!-- 具体类型(多选) -->
      ${subTagsHtml ? `<div style="margin-bottom:10px; padding:8px 12px; background:var(--bg-elevated); border-radius:8px;">
        <div style="font-size:11px; color:var(--text-secondary); font-weight:600; margin-bottom:5px;">具体类型(可多选)</div>
        <div class="ism-subtag-grid">${subTagsHtml}</div>
      </div>` : ''}
      
      <!-- 详细描述 + 图片 + 下次跟进 -->
      <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:12px; margin-bottom:12px;">
        <div style="padding:8px 12px; background:var(--bg-elevated); border-radius:8px;">
          <div style="font-size:11px; color:var(--text-secondary); font-weight:600; margin-bottom:5px;">详细描述</div>
          <textarea id="ismDescription" rows="3" placeholder="详细描述问题或要求 · 可在此 Ctrl+V 粘贴截图"
                    data-paste-target="issue_orig"
                    style="width:100%; padding:8px 10px; border:1px solid var(--border, #d1d5db); border-radius:6px; font-size:12.5px; box-sizing:border-box; font-family:inherit; resize:vertical;"
                    ${isDraft ? '' : `onchange="onIssueField('description', this.value.trim())"`}>${escapeHtml(data.description || data.requirement || '')}</textarea>
          <div style="margin-top:6px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="font-size:11px; color:var(--text-secondary);">📷 问题截图</span>
              <button type="button" class="btn small" onclick="document.getElementById('ismDescFileInput').click()" style="padding:3px 8px; font-size:11px;">+ 上传图片</button>
              <input type="file" id="ismDescFileInput" accept="image/*" multiple style="display:none;" onchange="onIssueDescFiles(this.files)">
            </div>
            <div id="ismDescThumbs" class="ism-drop-zone" ondrop="onIssueDescDrop(event)" ondragover="event.preventDefault(); this.classList.add('dragging');" ondragleave="this.classList.remove('dragging');" style="max-height:120px; overflow-y:auto;">
              ${(data.screenshots || []).length === 0 
                ? '<div style="grid-column:1/-1; padding:10px; text-align:center; color:var(--text-tertiary); font-size:11.5px; border:1px dashed var(--border); border-radius:6px;">📭 还没图 · Ctrl+V 粘贴 / 拖入 / 点上方上传</div>'
                : (data.screenshots || []).map((s, i) => `
                  <div class="ism-photo-tile">
                    <img src="${s}" onclick="viewImage('${s}')">
                    <button class="rm" onclick="event.stopPropagation(); delIssueDescScreenshot(${i})">×</button>
                  </div>
                `).join('')
              }
            </div>
          </div>
        </div>
        <div style="padding:8px 12px; background:var(--bg-elevated); border-radius:8px;">
          <div style="font-size:11px; color:var(--text-secondary); font-weight:600; margin-bottom:5px;">⏰ 下次跟进日期</div>
          <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
            <button type="button" class="btn small" onclick="setIssueFollowDate(3)" style="padding:3px 8px; font-size:11px;">3天后</button>
            <button type="button" class="btn small" onclick="setIssueFollowDate(7)" style="padding:3px 8px; font-size:11px;">7天后</button>
            <button type="button" class="btn small" onclick="setIssueFollowDate(15)" style="padding:3px 8px; font-size:11px;">15天后</button>
            <input type="date" id="ismNextFollowDate" value="${data.nextFollowDate || ''}"
                   style="padding:5px 8px; border:1px solid var(--border, #d1d5db); border-radius:6px; font-size:12px; flex:1; min-width:130px;"
                   ${isDraft ? `onchange="_issueDraft.nextFollowDate = this.value"` : `onchange="onIssueField('nextFollowDate', this.value)"`}>
            <button type="button" class="btn small" onclick="clearIssueFollowDate()" style="padding:3px 8px; font-size:11px; color:#6b7280;">清空</button>
          </div>
          ${data.nextFollowDate ? `<div style="font-size:11.5px; color:${_isIssueOverdue(data) ? '#dc2626' : '#059669'}; font-weight:600;">${_isIssueOverdue(data) ? '⚠ 已逾期 ' + _issueOverdueDays(data) + ' 天' : '📅 距跟进还有 ' + _issueOverdueDays(data) * -1 + ' 天'}</div>` : ''}
        </div>
      </div>
      
      <!-- 沟通历史(满宽 · 限高) -->
      <div style="max-height:30vh; overflow-y:auto; padding:8px 12px; background:var(--bg-elevated); border-radius:8px; margin-bottom:10px;">
        ${timelineHtml.replace('<div class="ism-section">', '<div>').replace('</div>$', '</div>')}
      </div>
      
      <div class="ism-footer" style="margin-top:8px;">${footerHtml}</div>
    </div>
  `;
}

// ============================================================
// 编辑态字段同步
// ============================================================
// ============================================================
// V20260602:供应商问题模块 · 自动抓取订单产品(复用催单逻辑)
// ============================================================
let _issFetched = [], _issFetchTimer = null, _issState = 'empty', _issNo = '', _issLastSrc = '';

function _issTarget() { return _issueDraft ? _issueDraft : (typeof currentIssue === 'function' ? currentIssue() : null); }
function _issPersist(updater) {
  if (_issueDraft) updater(_issueDraft);
  else if (typeof persistCurrentIssue === 'function') persistCurrentIssue(updater);
}

function issOrderNoChanged(value) {
  if (_issueDraft) _issueDraft.orderNo = value;
  else _issPersist(it => it.orderNo = value);
  clearTimeout(_issFetchTimer);
  _issFetchTimer = setTimeout(() => issAutoFetchProducts(), 600);
}

function issAutoFetchProducts() {
  const t = _issTarget();
  const rawNo = (document.getElementById('ismOrderNo')?.value || (t && t.orderNo) || '').trim();
  const panel = document.getElementById('issFetchPanel');
  // V20260602:支持多个订单号(/ , 、 空格 分隔)· 一个供应商多个订单有问题
  const nos = rawNo.split(/[\/,，、\s]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
  _issNo = nos.join(' / ');
  if (nos.length === 0) { _issFetched = []; _issState = 'empty'; if (panel) issRenderFetchPanel(); return; }

  let lineItems = [];
  const srcSet = new Set();
  nos.forEach(n => {
    let got = [];
    if (typeof PO_LIST !== 'undefined' && PO_LIST.length) {
      const pos = PO_LIST.filter(pp => String(pp.po_number||'').trim()===n || String(pp.order_no||'').trim()===n);
      got = pos.flatMap(pp => pp.line_items || []);
      if (got.length) srcSet.add('PO');
    }
    if (got.length === 0 && typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
      const so = SHOPIFY._orders.find(x => String(x.shopify_order_number||'').replace('#','')===n || String(x.name||'').replace('#','')===n);
      if (so && so.line_items && so.line_items.length) { got = so.line_items; srcSet.add('销售单'); }
    }
    got.forEach(li => { try { li._fromOrder = n; } catch(e){} });
    lineItems = lineItems.concat(got);
  });
  const src = (nos.length > 1 ? `${nos.length}个订单·` : '') + ([...srcSet].join('/') || '');
  lineItems = (lineItems||[]).filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));

  const productMap = (typeof SHOPIFY !== 'undefined' && SHOPIFY._productMap) ? SHOPIFY._productMap : {};
  _issFetched = lineItems.map(li => {
    const rawSpec = li.variant || li.variant_title || li.title_cn || li.title_en || li.title || '';
    let spec = (typeof _cleanFetchedSpec === 'function') ? _cleanFetchedSpec(li, rawSpec) : rawSpec;
    let img = li.image_url || li.image || '';
    if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
    if (!img && li.sku && typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.effectiveBySku) {
      const pp = PRODUCTS_CACHE.effectiveBySku(li.sku); if (pp && pp.image_url) img = pp.image_url;
    }
    const cur = (t && t.products) || [];
    const checked = cur.some(x => (x.sku && x.sku===li.sku) || (x.spec && x.spec===spec));
    return { spec, qty: li.qty || '', image_url: img, sku: li.sku || '', _checked: checked };
  });
  // V20260602:本地没抓到但已保存过产品 → 显示已保存的(不报"没找到")
  if (_issFetched.length === 0 && t && (t.products || []).length > 0) {
    _issFetched = t.products.map(p => ({ spec: p.spec, qty: p.qty, image_url: p.image_url, sku: p.sku, _checked: true }));
    _issLastSrc = '已保存';
  }
  _issState = (_issFetched.length === 0) ? 'nomatch' : 'ok';
  if (_issFetched.length === 1 && (!(t && t.products) || t.products.length === 0)) { _issFetched[0]._checked = true; issCommitProducts(); }
  _issLastSrc = src;
  issRenderFetchPanel();
  issTranslateRemaining();
}

async function issManualFetch() {
  const t = _issTarget();
  const rawNo = (document.getElementById('ismOrderNo')?.value || (t && t.orderNo) || '').trim();
  const nos = rawNo.split(/[\/,，、\s]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
  if (nos.length === 0) { alert('请先填订单号'); return; }
  const site = document.getElementById('ismSite')?.value || (t && t.site);
  const meta = (typeof SHOPIFY !== 'undefined' && SHOPIFY.STORES_META) ? SHOPIFY.STORES_META.find(m => m.site_code === site) : null;
  const shop = meta ? meta.domain : null;
  const panel = document.getElementById('issFetchPanel');
  if (!shop) { if (panel) panel.innerHTML = `<div style="font-size:12px;color:var(--danger);">⚠ 站点 ${escapeHtml(site||'')} 无对应 Shopify 店铺</div>`; return; }
  _issNo = nos.join(' / ');
  if (panel) panel.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:6px 0;">⏳ 正在从 Shopify 后台拉取${nos.length>1?` ${nos.length} 个订单`:`订单「${escapeHtml(nos[0])}」`}…</div>`;
  try {
    let lineItems = [];
    for (const n of nos) {
      try {
        const r = await SHOPIFY.call('list_orders', { name: n, status: 'any', limit: 10, auto_save: false }, shop, 30000);
        const orders = Array.isArray(r.orders) ? r.orders : [];
        const ord = orders.find(x => String(x.name||'').replace('#','')===n) || orders[0];
        let lis = (ord && ord.line_items) ? ord.line_items : [];
        lis.forEach(li => { try { li._fromOrder = n; } catch(e){} });
        lineItems = lineItems.concat(lis);
      } catch (e) { console.warn('[问题后台拉取]', n, e.message || e); }
    }
    lineItems = lineItems.filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));
    if (lineItems.length === 0) { _issFetched=[]; _issState='nomatch'; if (panel) panel.innerHTML = `<div style="font-size:12px;color:var(--warning);padding:4px 0;">⚠ Shopify 后台也没查到「${escapeHtml(_issNo)}」的产品</div>`; return; }
    const productMap = (SHOPIFY._productMap) || {};
    _issFetched = lineItems.map(li => {
      const rawSpec = li.variant_title || li.variant || li.title || '';
      let spec = (typeof _cleanFetchedSpec === 'function') ? _cleanFetchedSpec(li, rawSpec) : rawSpec;
      let img = li.image_url || '';
      if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
      const cur = (t && t.products) || [];
      const checked = cur.some(x => (x.sku && x.sku===li.sku) || (x.spec && x.spec===spec));
      return { spec, qty: li.quantity || li.qty || '', image_url: img, sku: li.sku || '', _checked: checked };
    });
    _issState='ok'; _issLastSrc = nos.length > 1 ? `Shopify后台·${nos.length}单` : 'Shopify后台';
    if (_issFetched.length===1 && (!(t && t.products) || t.products.length===0)) { _issFetched[0]._checked=true; issCommitProducts(); }
    issRenderFetchPanel();
    issTranslateRemaining();
  } catch (e) {
    if (panel) panel.innerHTML = `<div style="font-size:12px;color:var(--danger);padding:4px 0;">❌ 后台拉取失败:${escapeHtml(e.message||String(e))}</div>`;
  }
}

function issRenderFetchPanel() {
  const panel = document.getElementById('issFetchPanel'); if (!panel) return;
  const btn = '<button type="button" class="btn small" onclick="issManualFetch()" style="padding:3px 10px;font-size:11px;margin-left:8px;">📥 从 Shopify 后台拉取</button>';
  if (_issState === 'empty' || !_issNo) {
    panel.innerHTML = '<div style="font-size:11.5px;color:var(--text-secondary);padding:2px 0;">👆 填<b>订单号</b> → 自动从 PO/销售单抓产品,勾选自动填入产品图和规格' + btn + '</div>';
    return;
  }
  if (_issState === 'nomatch' || !_issFetched.length) {
    panel.innerHTML = `<div style="font-size:11.5px;color:var(--warning);padding:4px 0;">⚠ 本地没找到订单「<b>${escapeHtml(_issNo)}</b>」· 旧订单可点右边从后台拉` + btn + `</div>`;
    return;
  }
  const allChecked = _issFetched.every(p => p._checked);
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
      <div style="font-size:11.5px;color:var(--text-secondary);font-weight:600;">📥 订单「${escapeHtml(_issNo)}」的产品(${_issLastSrc||'订单'})· 勾选问题产品 → 自动填图+规格</div>
      <div>
        <button type="button" class="btn small" onclick="issToggleAll()" style="padding:3px 10px;font-size:11px;">${allChecked?'取消全选':'全选'}</button>
        <button type="button" class="btn small" onclick="issManualFetch()" style="padding:3px 10px;font-size:11px;margin-left:6px;">📥 后台重拉</button>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${_issFetched.map((p,i)=>`
        <label style="display:flex;align-items:center;gap:7px;border:1.5px solid ${p._checked?'var(--accent)':'var(--border)'};border-radius:8px;padding:6px 9px;cursor:pointer;background:${p._checked?'rgba(37,99,235,0.08)':'var(--bg-card)'};">
          <input type="checkbox" ${p._checked?'checked':''} onchange="issToggleFetched(${i})">
          ${p.image_url?`<img src="${p.image_url}" style="width:48px;height:48px;object-fit:cover;border-radius:5px;">`:'<span style="font-size:20px;">📷</span>'}
          <span style="font-size:12px;max-width:240px;line-height:1.35;">${escapeHtml(p.spec||'(无规格)')}${p.qty?` · <b style="color:#dc2626;">×${p.qty}</b>`:''}</span>
        </label>`).join('')}
    </div>`;
}

function issToggleFetched(i) { if (!_issFetched[i]) return; _issFetched[i]._checked = !_issFetched[i]._checked; issCommitProducts(); issRenderFetchPanel(); }
function issToggleAll() { const tg = !_issFetched.every(p=>p._checked); _issFetched.forEach(p=>p._checked=tg); issCommitProducts(); issRenderFetchPanel(); }
function issCommitProducts() {
  const selected = _issFetched.filter(p=>p._checked).map(p=>({spec:p.spec,qty:p.qty,image_url:p.image_url,sku:p.sku}));
  _issPersist(t => { t.products = selected; });
  if (!_issueDraft) { if (typeof renderIssues==='function') renderIssues(); }
}
async function issTranslateRemaining() {
  if (typeof _aiTranslateSpec !== 'function') return;
  const need = _issFetched.filter(p => { if(!p.spec)return false; const en=(p.spec.match(/[A-Za-z]{3,}/g)||[]).length; const cn=(p.spec.match(/[\u4e00-\u9fa5]/g)||[]).length; return en>0 && cn/Math.max(p.spec.length,1)<0.5; });
  if (need.length === 0) return;
  try {
    const numbered = need.map((p,i)=>`[${i+1}] ${p.spec}`).join('\n');
    const result = await _aiTranslateSpec(numbered);
    (result.split('\n').filter(l=>l.trim())).forEach(line=>{ const m=line.match(/^\[(\d+)\]\s*(.+)$/); if(m){const idx=parseInt(m[1])-1; if(need[idx])need[idx].spec=m[2].trim();}});
    issCommitProducts(); issRenderFetchPanel();
  } catch(e) { console.warn('[问题 AI 翻译兜底失败]', e.message||e); }
}

function currentIssue() {
  if (!_currentItemId) return null;
  const agent = window._currentItemAgent || CURRENT_AGENT;
  return DATA.getIssues(agent).find(i => i._id === _currentItemId);
}

function persistCurrentIssue(updater, immediate = false) {
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getIssues(agent);
  const idx = arr.findIndex(i => i._id === _currentItemId);
  if (idx < 0) return;
  updater(arr[idx]);
  DATA.saveIssues(agent, arr);
  loadAllData();
  if (immediate) {
    DATA.saveAndSyncIssues(agent).catch(err => { console.error(err); toast('同步失败:' + (err.message || err), 'err'); });
  }
}

function onIssueField(field, value) {
  persistCurrentIssue(it => it[field] = value);
  renderIssues();
  updateIssueStats();
}

async function setIssueStatus(st) {
  persistCurrentIssue(it => it.status = st);
  _renderIssueModal({ isDraft: false });
  renderIssues();
  updateIssueStats();
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('issues_' + agent);
  try { await fullSyncIssues(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

function deleteCurrentIssue() {
  if (!confirm('确定删除？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getIssues(agent);
  const it = arr.find(x => x._id === _currentItemId);
  if (!it) return;
  it.deletedAt = new Date().toISOString();
  it.deletedBy = CURRENT_AGENT;
  DATA.saveIssues(agent, arr);
  closeModal('issueModal');
  loadAllData();
  renderIssues();
  updateIssueStats();
  toast('已移入回收站');
}

// V28u:关闭供应商问题 modal 前 · 检查暂存沟通图片(防丢图)
function closeIssueModal() {
  if (Array.isArray(_newScreenshots_fu) && _newScreenshots_fu.length > 0) {
    if (!confirm(`沟通区还有 ${_newScreenshots_fu.length} 张图未保存!\n\n点"确定"关闭(图会丢)· 点"取消"先去点 [+ 添加] 保存`)) return;
    _newScreenshots_fu = [];
  }
  closeModal('issueModal');
}
window.closeIssueModal = closeIssueModal;

function addIssueFollowup() {
  const noteEl = document.getElementById('ismNewNote');
  const dateEl = document.getElementById('ismNewDate');
  if (!noteEl || !dateEl) return;
  const note = noteEl.value.trim();
  const date = dateEl.value || new Date().toISOString().slice(0, 10);
  if (!note && (!_newScreenshots_fu || _newScreenshots_fu.length === 0)) { 
    toast('请输入沟通内容', 'warn'); 
    return; 
  }
  persistCurrentIssue(it => {
    if (!it.followups) it.followups = [];
    it.followups.push({ 
      date, 
      time: new Date().toTimeString().slice(0, 5), 
      note, 
      screenshots: [...(_newScreenshots_fu || [])] 
    });
    if (it.status === 'pending') it.status = 'in_progress';
  }, true);
  _newScreenshots_fu = [];
  _renderIssueModal({ isDraft: false });
  renderIssues();
  updateIssueStats();
  toast('✓ 已记录沟通');
}

function delIssueFollowup(idx) {
  if (!confirm('删除这条记录？')) return;
  persistCurrentIssue(it => it.followups.splice(idx, 1), true);
  _renderIssueModal({ isDraft: false });
  renderIssues();
}

function updateIssueStats() {
  let p = 0, ip = 0, esc = 0, res = 0, stuck = 0;
  ISSUES.forEach(it => {
    if (it.status === 'pending') p++;
    if (it.status === 'in_progress') ip++;
    if (it.status === 'escalated') esc++;
    if (it.status === 'resolved') res++;
    if ((it.followups || []).length >= 3 && it.status !== 'resolved') stuck++;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('isPending', p);
  set('isInProgress', ip);
  set('isEscalated', esc);
  set('isResolved', res);
  set('isStuck', stuck);
  if (typeof updateBadges === 'function') updateBadges();
}

// ============================================================
// V22-CY+ 2026-05-26: 供应商问题 - 图片上传(主描述 + 沟通记录)
// 粘贴由 utils.js 全局处理器统一管理(通过 data-paste-target 属性)
// 这里只保留 文件选择 + 拖拽 + 删除 等专属逻辑
// ============================================================

// 主描述图片 · 文件选择
async function onIssueDescFiles(files) {
  if (!files || files.length === 0) return;
  await handleFiles(files, 'issue_orig');
}

// 主描述图片 · 拖拽
async function onIssueDescDrop(event) {
  event.preventDefault();
  const dropZone = event.currentTarget;
  if (dropZone) dropZone.classList.remove('dragging');
  const files = event.dataTransfer.files;
  if (files && files.length > 0) await handleFiles(files, 'issue_orig');
}

// 主描述图片 · 删除
function delIssueDescScreenshot(idx) {
  if (!confirm('删除这张图片?')) return;
  // V22-CY+ 修:支持 draft 和已保存模式
  if (typeof _issueDraft !== 'undefined' && _issueDraft && !_currentItemId) {
    _captureIssueDraftFromDOM();  // V20260601-issuefix
    if (_issueDraft.screenshots && _issueDraft.screenshots[idx] !== undefined) {
      _issueDraft.screenshots.splice(idx, 1);
      _renderIssueModal({ isDraft: true });
    }
  } else {
    persistCurrentIssue(it => {
      if (it.screenshots && it.screenshots[idx] !== undefined) {
        it.screenshots.splice(idx, 1);
      }
    }, true);
    _renderIssueModal({ isDraft: false });
  }
}

// 沟通记录图片 · 文件选择
async function onIssueFuFiles(files) {
  if (!files || files.length === 0) return;
  if (!Array.isArray(_newScreenshots_fu)) _newScreenshots_fu = [];
  await handleFiles(files, 'issue_fu');
}
