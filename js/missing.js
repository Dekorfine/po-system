// ============================================================
// 跟单团队工作台 · missing.js
// 找灯（共享模块）· 含实拍照片、评论编辑、采纳推荐
// ============================================================
// 依赖：core.js · utils.js
// ============================================================

// 找灯快速筛选模式（叠加在 status filter 之上）
// '' = 无叠加；'thismonth' = 本月新增；'mine' = 我发起的
let _missingQuickMode = '';

// V5-2026-05-24: 找灯阈值筛选(跟催单/售后一致的体验)
let _missingThresholdFilter = 0;   // 0=不限,>0=发布≥N天的
let _missingOnlyNoReply = false;    // 仅显示无任何 comments 的

// 计算找灯发布距今天数
function missingDaysSince(m) {
  if (!m.createdAt) return 0;
  return Math.floor((Date.now() - new Date(m.createdAt).getTime()) / 86400000);
}

// ============================================================
// 找灯阈值 chip 渲染 - V5 (跟催单/售后一致的视觉)
// ============================================================
function renderMissingThresholdChips() {
  const el = document.getElementById('missingThresholdChips');
  if (!el) return;
  
  const thresholds = [3, 7, 15, 30, 60, 90];  // 找灯专属:周期更长
  
  // 基础集合: 只统计"搜寻中"的(已找到/已放弃不算阈值)
  const activeSet = MISSING_LIGHTS.filter(m => m.status === 'searching' && !m.deletedAt);
  const noReplyCnt = activeSet.filter(m => !(m.comments && m.comments.length > 0)).length;
  
  // AND 组合: 如果勾了"仅没人回复",阈值计数只算没人回复的
  const baseSet = _missingOnlyNoReply 
    ? activeSet.filter(m => !(m.comments && m.comments.length > 0)) 
    : activeSet;
  
  // 颜色递进(找灯周期长,允许 90 天)
  function chipColor(days) {
    if (days === 0) return '';
    if (days <= 3)   return '#fbbf24';  // 黄
    if (days <= 7)   return '#f59e0b';  // 橙黄
    if (days <= 15)  return '#dc2626';  // 红
    if (days <= 30)  return '#b91c1c';  // 深红
    if (days <= 60)  return '#991b1b';  // 暗红
    return '#7f1d1d';                    // 90+ 极暗红
  }
  
  function renderChip(days, count) {
    const isActive = _missingThresholdFilter === days;
    const color = chipColor(days);
    const baseStyle = isActive 
      ? `background:${color || '#7c3aed'}; color:white; border-color:${color || '#7c3aed'}; box-shadow:0 2px 8px ${color || '#7c3aed'}66, 0 0 0 3px ${color || '#7c3aed'}22; font-weight:600;`
      : days > 0 ? `border-left:3px solid ${color}; color:${color};` : '';
    return `<button class="rule-chip ${isActive ? 'active' : ''}" 
                    onclick="setMissingThreshold(${days})"
                    style="${baseStyle}"
                    title="${days === 0 ? '显示全部搜寻中' : '发布超过 ' + days + ' 天的'}">
              ${days === 0 ? '📋 全部' : '⏰ ≥' + days + '天'} 
              <span class="cnt-mini" style="${isActive ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${count}</span>
            </button>`;
  }
  
  // 自定义天数 chip
  const isCustom = _missingThresholdFilter > 0 && !thresholds.includes(_missingThresholdFilter);
  let customChipHtml = '';
  if (isCustom) {
    const cnt = baseSet.filter(m => missingDaysSince(m) >= _missingThresholdFilter).length;
    customChipHtml = `<button class="rule-chip active" onclick="setMissingThreshold(0)"
                              style="background:#7f1d1d; color:white; border-color:#7f1d1d; box-shadow:0 2px 8px #7f1d1d66, 0 0 0 3px #7f1d1d22; font-weight:600;"
                              title="自定义阈值,点击取消">
                        🎯 自定义 ≥${_missingThresholdFilter}天 <span class="cnt-mini" style="background:rgba(255,255,255,0.25); color:white;">${cnt}</span>
                        <span style="margin-left:6px; opacity:0.7;">✕</span>
                      </button>`;
  }
  
  el.innerHTML = `
    <span style="font-size:12px; color:var(--text-secondary); font-weight:600; min-width:64px;">找灯阈值:</span>
    ${renderChip(0, baseSet.length)}
    ${thresholds.map(d => renderChip(d, baseSet.filter(m => missingDaysSince(m) >= d).length)).join('')}
    ${customChipHtml}
    <button class="rule-chip" onclick="openCustomMissingThresholdInput()"
            title="输入自定义天数(如 45 天)"
            style="border-style:dashed; color:var(--text-secondary);">
      🎯 自定义...
    </button>
    
    <span style="margin-left:6px; height:18px; width:1px; background:var(--border);"></span>
    
    <button class="rule-chip" 
            onclick="toggleMissingNoReply()" 
            title="只显示从未有人评论的找灯任务"
            style="${_missingOnlyNoReply ? 'background:#f59e0b; color:white; border-color:#f59e0b; box-shadow:0 2px 8px #f59e0b66, 0 0 0 3px #f59e0b22; font-weight:600;' : 'border-left:3px solid #f59e0b; color:#b45309;'}">
      💬 仅没人回复 <span class="cnt-mini" style="${_missingOnlyNoReply ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${noReplyCnt}</span>
    </button>
    
    <span style="margin-left:auto; font-size: 11px; color: var(--text-tertiary);">
      搜寻中 <b style="color:#dc2626;">${activeSet.length}</b> · 待回复 <b style="color:#f59e0b;">${noReplyCnt}</b>
    </span>
  `;
}

function setMissingThreshold(days) {
  _missingThresholdFilter = days;
  renderMissing();
}

function toggleMissingNoReply() {
  _missingOnlyNoReply = !_missingOnlyNoReply;
  renderMissing();
}

async function openCustomMissingThresholdInput() {
  const v = await showPrompt({
    title: '🎯 自定义找灯阈值',
    message: '显示"发布超过 N 天还没找到"的找灯任务。\n常用值:3 / 7 / 15 / 30 / 45 / 60 / 90',
    field: { 
      label: '天数(发布距今 ≥)', 
      value: '', 
      type: 'number',
      placeholder: '例:45'
    },
  });
  if (v === null) return;
  const days = parseInt(v, 10);
  if (!days || days < 1 || days > 999) {
    toast('请输入 1-999 之间的天数', 'warn');
    return;
  }
  setMissingThreshold(days);
}

// ============================================================
// MODULE 4: 找灯（共享）
// ============================================================
// V20260526e: 找灯日期筛选
let _missingDatePreset = 'all';
function missingOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        _missingDatePreset = customPreset;
        const el = document.getElementById('mDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        renderMissing();
      });
    }
    return;
  }
  _missingDatePreset = preset || 'all';
  renderMissing();
}

function renderMissing() {
  // V5: 渲染阈值 chip
  renderMissingThresholdChips();
  
  // V20260526o: 关键修复 · 先填充日期 select(避免空列表时早 return 跳过)
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('mDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _missingDatePreset || 'all');
  }
  
  const body = document.getElementById('missingBody');
  const q = (document.getElementById('mSearch').value || '').trim().toLowerCase();
  const fs = document.getElementById('mFilterStatus').value;
  const fSource = document.getElementById('mFilterSource') ? document.getElementById('mFilterSource').value : '';
  
  let list = MISSING_LIGHTS.filter(m => {
    // V5-2026-05-24: 阈值过滤(发布 ≥ N 天)
    if (_missingThresholdFilter > 0 && missingDaysSince(m) < _missingThresholdFilter) return false;
    // V5: 仅没人回复
    if (_missingOnlyNoReply && (m.comments || []).length > 0) return false;
    // V5: 用了阈值/仅没回复 → 只看搜寻中的(已找到/已放弃没意义)
    if ((_missingThresholdFilter > 0 || _missingOnlyNoReply) && m.status !== 'searching') return false;
    
    if (q) {
      const t = [m.description, m.customerOrderNo, m.creator, (m.comments || []).map(c => c.content + ' ' + (c.suggestedSupplier || '')).join(' ')].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fSource && (m.source || 'manual') !== fSource) return false;
    if (fs === 'all') return true;
    if (fs === 'active') return ['searching', 'found'].includes(m.status);  // 包含已找到(但会被折叠)
    return m.status === fs;
  });

  // V20260526e: 日期筛选
  if (_missingDatePreset && _missingDatePreset !== 'all' && typeof isDateInRange === 'function') {
    list = list.filter(m => isDateInRange(m.createdAt || m.createdDate || m.created_at, _missingDatePreset));
  }

  // V3 快速筛选模式叠加（来自统计卡片点击）
  if (_missingQuickMode === 'thismonth') {
    const thisMonth = new Date().toISOString().slice(0, 7);
    list = list.filter(m => (m.createdAt || '').startsWith(thisMonth));
  } else if (_missingQuickMode === 'mine') {
    list = list.filter(m => m.creator === CURRENT_AGENT || m._agent === CURRENT_AGENT);
  }
  
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  
  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-top: 14px;"><div class="icon">🔍</div><div class="text">${MISSING_LIGHTS.length === 0 ? '还没有找灯任务，点 "+ 发布" 让全队帮你找' : '没有匹配的任务'}</div>${MISSING_LIGHTS.length === 0 ? '<button class="btn primary" onclick="addMissing()">+ 发布第一个找灯任务</button>' : ''}</div>`;
    return;
  }
  
  // 分组逻辑
  if (fs === 'active') {
    const searching = list.filter(m => m.status === 'searching');
    const found = list.filter(m => m.status === 'found');
    let html = '';
    
    // V20260527i: 已找到 > 0 时,在顶部加醒目成就 banner · 一键展开下方 found 区块
    if (found.length > 0) {
      html += `
        <div class="missing-found-banner" onclick="expandMissingFoundAndScroll()" 
             title="点击展开下方「已找到」区块,查看 ${found.length} 个已下单的灯具">
          <div class="banner-left">
            <span class="banner-icon">🎉</span>
            <div>
              <div class="banner-title">已找到 / 已下单 <b>${found.length}</b> 个灯具</div>
              <div class="banner-sub">团队协作成果 · 点击展开查看明细</div>
            </div>
          </div>
          <span class="banner-arrow">展开查看 ▼</span>
        </div>
      `;
    }
    
    // 搜寻中（默认展开）
    if (searching.length > 0) {
      html += renderMissingGroup('searching', '🔍 搜寻中', searching, false);
    } else {
      html += `<div class="empty-state" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-top: 14px;"><div class="icon">🔍</div><div class="text">没有搜寻中的找灯任务</div></div>`;
    }
    // 已找到（默认折叠 · head 样式已加强 · 见 CSS .missing-group-head.found）
    if (found.length > 0) {
      html += renderMissingGroup('found', '✅ 已找到 / 已下单', found, true);
    }
    body.innerHTML = html;
  } else {
    // 单一状态:直接显示一个区块(无折叠头部)
    body.innerHTML = `<div class="missing-group"><div class="missing-grid-wrap" style="border-radius: 10px; border-top: 1px solid var(--border);"><div class="missing-grid">${list.map(renderMissingCard).join('')}</div></div></div>`;
  }
  // V20260526e: 填充日期筛选下拉
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('mDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _missingDatePreset || 'all');
  }
}

function renderMissingGroup(key, title, items, collapsed) {
  return `
    <div class="missing-group ${collapsed ? 'collapsed' : ''}" id="missingGroup_${key}">
      <div class="missing-group-head ${key} ${collapsed ? '' : 'expanded'}" onclick="toggleMissingGroup('${key}')">
        <div class="title">${title} <span class="count">${items.length}</span></div>
        <span class="toggle-arrow">▼</span>
      </div>
      <div class="missing-grid-wrap">
        <div class="missing-grid">${items.map(renderMissingCard).join('')}</div>
      </div>
    </div>
  `;
}

function renderMissingCard(m) {
  const cmtCount = (m.comments || []).length;
  const screenshots = m.screenshots || [];
  const realCount = (m.realPhotos || []).length;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作(改状态/删除/修改),不再限发起人
  const canDelete = !!CURRENT_AGENT;
  const desc = (m.description || '').trim();
  
  // 多图自适应布局
  let coverHTML = '';
  let coverCls = '';
  const n = screenshots.length;
  if (n === 0) {
    coverCls = 'cnt-0';
    coverHTML = '<div class="no-image">💡</div><div class="no-image-hint">无图片</div>';
  } else if (n === 1) {
    coverCls = 'cnt-1';
    coverHTML = `<img src="${screenshots[0]}" alt="灯具图片">`;
  } else if (n === 2) {
    coverCls = 'cnt-2 multi';
    coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
  } else if (n === 3) {
    coverCls = 'cnt-3 multi';
    coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
  } else if (n === 4) {
    coverCls = 'cnt-4 multi';
    coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
  } else {
    // 5+ 张：3x3 网格
    coverCls = 'cnt-many multi';
    const max = 9;
    if (n <= max) {
      coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
    } else {
      // 前 8 张正常，第 9 格显示最后一张图 + 浮层 +N
      coverHTML = screenshots.slice(0, max - 1).map(s => `<img src="${s}">`).join('');
      const remaining = n - (max - 1);
      coverHTML += `<div class="more-overlay"><img src="${screenshots[max - 1]}"><span>+${remaining}</span></div>`;
    }
  }
  
  return `
    <div class="missing-card" onclick="openMissingModal('${m._id}')">
      <div class="cover ${coverCls}">
        ${coverHTML}
        <span class="status-badge s-${m.status}">${MISSING_STATUS_LABELS[m.status]}</span>
        ${m.source === 'purchase' ? '<span class="source-badge" style="position:absolute;top:8px;left:8px;background:rgba(202,138,4,0.95);color:white;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">🛒 采购需求</span>' : ''}
        ${canDelete ? `<button class="card-delete" onclick="event.stopPropagation(); delMissingRow('${m._id}')" title="删除">🗑</button>` : ''}
        ${canDelete ? `<button class="card-quick found ${m.status === 'found' ? 'is-current' : ''}" onclick="event.stopPropagation(); quickMarkMissingFound('${m._id}')" title="${m.status === 'found' ? '当前: 已找到 · 点击恢复成搜寻中' : '一键标记为「已找到」'}">✓</button>` : ''}
        ${canDelete ? `<button class="card-quick archive ${m.status === 'abandoned' ? 'is-current' : ''}" onclick="event.stopPropagation(); quickMarkMissingArchived('${m._id}')" title="${m.status === 'abandoned' ? '当前: 已存档 · 点击恢复成搜寻中' : '存档(标记为已放弃)'}">📦</button>` : ''}
        ${cmtCount > 0 ? `<span class="comments-badge" style="${canDelete ? 'top: 44px;' : ''}">💬 ${cmtCount}</span>` : ''}
        ${realCount > 0 ? `<span class="comments-badge" style="${canDelete ? (cmtCount > 0 ? 'top: 76px;' : 'top: 44px;') : (cmtCount > 0 ? 'top: 40px;' : '')}; background: rgba(13,148,136,0.95);">📸 ${realCount}</span>` : ''}
      </div>
      <div class="body">
        <div class="desc ${desc ? '' : 'empty'}">${desc ? escapeHtml(desc) : '(无描述)'}</div>
        <div class="meta">
          <span class="creator">👤 ${escapeHtml(m.creator || '')}</span>
          ${m.customerOrderNo ? `<span class="order-no">${escapeHtml(m.customerOrderNo)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function toggleMissingGroup(key) {
  const el = document.getElementById('missingGroup_' + key);
  if (!el) return;
  el.classList.toggle('collapsed');
  el.querySelector('.missing-group-head').classList.toggle('expanded');
}

// V20260527i: 点顶部 banner → 展开下方「已找到」区块 + 平滑滚到那里
function expandMissingFoundAndScroll() {
  const el = document.getElementById('missingGroup_found');
  if (!el) return;
  // 强制展开
  el.classList.remove('collapsed');
  const head = el.querySelector('.missing-group-head');
  if (head) head.classList.add('expanded');
  // 平滑滚到该区块顶部
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}
window.expandMissingFoundAndScroll = expandMissingFoundAndScroll;

// ============ V4：自定义数量对话框（截图打包前先选要导多少个）============
function _promptExportLimit(target) {
  return new Promise((resolve) => {
    const total = target.length;
    const withImg = target.filter(m => m.screenshots && m.screenshots.length > 0).length;
    const noImg = total - withImg;
    
    // 推荐选项：根据总数动态生成
    const presets = [4, 6, 9, 12, 16, 20].filter(n => n <= total);
    const defaultVal = Math.min(9, total);
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px;';
    overlay.innerHTML = `
      <div style="background:#fff; border-radius:14px; max-width:480px; width:100%; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,0.25);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
          <span style="font-size:24px;">📸</span>
          <h3 style="margin:0; font-size:17px; font-weight:700; color:#1c1917;">截图打包 · 选择导出数量</h3>
        </div>
        <div style="font-size:12px; color:#57534e; margin-bottom:16px;">
          当前共 <b style="color:#2563eb;">${total}</b> 个任务${noImg > 0 ? `（${withImg} 个有图、${noImg} 个仅描述）` : '（全部有图）'}
        </div>
        <div style="background:#f5f5f4; border-radius:8px; padding:12px; margin-bottom:14px;">
          <div style="font-size:11px; font-weight:600; color:#78716c; margin-bottom:8px;">🚀 快速选择：</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${presets.map(n => `
              <button class="_preset-btn" data-val="${n}" style="padding:6px 14px; border:1.5px solid #e7e5e4; background:#fff; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; color:#1c1917; min-width:50px;">${n}</button>
            `).join('')}
            ${total > 20 ? `<button class="_preset-btn" data-val="${total}" style="padding:6px 14px; border:1.5px solid #2563eb; background:rgba(37,99,235,0.08); color:#2563eb; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer;">全部 ${total}</button>` : ''}
          </div>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:12px; font-weight:600; color:#57534e; display:block; margin-bottom:6px;">或自定义数量（1 - ${total}）：</label>
          <input type="number" id="_exportLimitInput" min="1" max="${total}" value="${defaultVal}" style="width:100%; padding:10px 12px; border:1.5px solid #e7e5e4; border-radius:8px; font-size:16px; font-weight:700; font-family:'JetBrains Mono', monospace; text-align:center; color:#1c1917; background:#fff;">
        </div>
        <div style="background:rgba(37,99,235,0.05); border-left:3px solid #2563eb; padding:8px 12px; border-radius:4px; margin-bottom:18px; font-size:11px; line-height:1.6; color:#57534e;">
          <b style="color:#2563eb;">💡 导出规则：</b><br>
          • <b>有图任务优先</b>（自动排前）<br>
          • 数量越少图越大（1 列 / 2 列 / 3 列自动调整）<br>
          • 生成后可直接发供应商统一咨询
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button id="_exportCancel" style="padding:9px 18px; border:1px solid #e7e5e4; background:#fff; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#57534e;">取消</button>
          <button id="_exportConfirm" style="padding:9px 18px; border:none; background:#2563eb; color:white; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.25);">✓ 开始导出</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    const input = overlay.querySelector('#_exportLimitInput');
    const confirmBtn = overlay.querySelector('#_exportConfirm');
    const cancelBtn = overlay.querySelector('#_exportCancel');
    
    overlay.querySelectorAll('._preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.val;
        overlay.querySelectorAll('._preset-btn').forEach(b => {
          b.style.background = '#fff';
          b.style.color = '#1c1917';
          b.style.borderColor = '#e7e5e4';
        });
        btn.style.background = 'rgba(37,99,235,0.1)';
        btn.style.color = '#2563eb';
        btn.style.borderColor = '#2563eb';
        input.focus();
      });
    });
    
    const defaultBtn = overlay.querySelector(`._preset-btn[data-val="${defaultVal}"]`);
    if (defaultBtn) defaultBtn.click();
    
    const cleanup = (val) => { overlay.remove(); resolve(val); };
    
    confirmBtn.addEventListener('click', () => {
      const n = parseInt(input.value || '0', 10);
      if (!n || n < 1) { toast('数量至少 1 个', 'warn'); return; }
      if (n > total) { toast(`最多 ${total} 个`, 'warn'); return; }
      cleanup(n);
    });
    cancelBtn.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn.click();
      else if (e.key === 'Escape') cancelBtn.click();
    });
    setTimeout(() => input.focus(), 50);
  });
}

// ============ 一键截图打包（拼图导出）============
// V4：先弹出自定义数量对话框，让用户选要导几个，不再固定导全部
async function exportMissingCollage() {
  // 过滤：根据当前筛选条件
  const fs = document.getElementById('mFilterStatus').value;
  let target = MISSING_LIGHTS;
  if (fs === 'active' || fs === 'searching') {
    target = MISSING_LIGHTS.filter(m => m.status === 'searching');
  } else if (fs !== 'all') {
    target = MISSING_LIGHTS.filter(m => m.status === fs);
  }
  
  if (target.length === 0) {
    toast('当前筛选下没有找灯任务可导出', 'warn');
    return;
  }
  
  // V4：弹出数量选择对话框（不再固定导出全部）
  const limit = await _promptExportLimit(target);
  if (limit === null) return;  // 用户取消
  
  // 排序：有图的优先（让前 N 个尽量包含有图的任务）
  target = [...target].sort((a, b) => {
    const aHas = (a.screenshots && a.screenshots.length > 0) ? 1 : 0;
    const bHas = (b.screenshots && b.screenshots.length > 0) ? 1 : 0;
    return bHas - aHas;
  }).slice(0, limit);
  
  toast(`正在生成 ${limit} 个任务的拼图，请稍候...`, 'warn');
  
  try {
    // 加载所有图片（多图任务展开成多个卡片，让每张图都大）
    const items = [];
    for (const m of target) {
      const imgs = [];
      if (m.screenshots && m.screenshots.length > 0) {
        for (const src of m.screenshots.slice(0, 9)) {
          try { imgs.push(await loadImageEl(src)); } catch (e) { /* skip */ }
        }
      }
      items.push({ m, imgs });
    }
    
    // 布局参数：放大尺寸 + 更少列数
    const cardW = 460;
    const imgAreaH = 380;
    const footerH = 110;
    const cardH = imgAreaH + footerH;
    const gap = 16;
    const padding = 32;
    const headerH = 100;
    const pageFooterH = 50;
    
    // 决定列数：1-3 列（保持每张图大）
    const cols = items.length === 1 ? 1 : items.length <= 4 ? 2 : 3;
    const rows = Math.ceil(items.length / cols);
    
    const canvasW = padding * 2 + cols * cardW + (cols - 1) * gap;
    const canvasH = headerH + rows * cardH + (rows - 1) * gap + padding + pageFooterH;
    
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    // 中文字体
    const cnFont = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Heiti SC", sans-serif';
    
    // 背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    // 标题
    ctx.fillStyle = '#1c1917';
    ctx.font = `bold 26px ${cnFont}`;
    ctx.textBaseline = 'top';
    ctx.fillText('找灯需求清单', padding, padding);
    
    ctx.font = `15px ${cnFont}`;
    ctx.fillStyle = '#57534e';
    const dateStr = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'});
    ctx.fillText(`${dateStr} · 共 ${items.length} 个款式，请帮忙看下贵司能做哪些`, padding, padding + 36);
    
    // 分隔线
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding + 70);
    ctx.lineTo(canvasW - padding, padding + 70);
    ctx.stroke();
    
    // 卡片
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = padding + col * (cardW + gap);
      const y = headerH + row * (cardH + gap);
      
      // 卡片边框
      ctx.fillStyle = '#fafaf9';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cardW, cardH);
      
      // 图片区背景
      ctx.fillStyle = '#f5f5f4';
      ctx.fillRect(x, y, cardW, imgAreaH);
      
      const it = items[i];
      const imgs = it.imgs;
      
      if (imgs.length === 0) {
        // 无图占位
        ctx.fillStyle = '#d6d3d1';
        ctx.font = `60px ${cnFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💡', x + cardW / 2, y + imgAreaH / 2 - 8);
        ctx.font = `12px ${cnFont}`;
        ctx.fillStyle = '#a8a29e';
        ctx.fillText('无图片', x + cardW / 2, y + imgAreaH / 2 + 30);
        ctx.textBaseline = 'top';
      } else if (imgs.length === 1) {
        // 单图：占满整个图片区
        const img = imgs[0];
        const ratio = Math.min(cardW / img.width, imgAreaH / img.height);
        const drawW = img.width * ratio;
        const drawH = img.height * ratio;
        ctx.drawImage(img, x + (cardW - drawW) / 2, y + (imgAreaH - drawH) / 2, drawW, drawH);
      } else if (imgs.length === 2) {
        // 2 张图：上下排列（大）
        const slotH = (imgAreaH - 2) / 2;
        for (let k = 0; k < 2; k++) {
          const img = imgs[k];
          const sy = y + k * (slotH + 2);
          const ratio = Math.min(cardW / img.width, slotH / img.height);
          const drawW = img.width * ratio;
          const drawH = img.height * ratio;
          ctx.drawImage(img, x + (cardW - drawW) / 2, sy + (slotH - drawH) / 2, drawW, drawH);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + slotH + 1); ctx.lineTo(x + cardW, y + slotH + 1);
        ctx.stroke();
      } else if (imgs.length === 3) {
        // 3 张图：左大右两小
        const leftW = cardW / 2;
        const rightW = cardW - leftW;
        const rightH = (imgAreaH - 2) / 2;
        // 左：大图
        const im0 = imgs[0];
        const r0 = Math.min(leftW / im0.width, imgAreaH / im0.height);
        ctx.drawImage(im0, x + (leftW - im0.width * r0) / 2, y + (imgAreaH - im0.height * r0) / 2, im0.width * r0, im0.height * r0);
        // 右上 + 右下
        for (let k = 1; k < 3; k++) {
          const img = imgs[k];
          const sx = x + leftW + 2;
          const sy = y + (k - 1) * (rightH + 2);
          const ratio = Math.min((rightW - 2) / img.width, rightH / img.height);
          ctx.drawImage(img, sx + (rightW - 2 - img.width * ratio) / 2, sy + (rightH - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + leftW + 1, y); ctx.lineTo(x + leftW + 1, y + imgAreaH);
        ctx.moveTo(x + leftW, y + rightH + 1); ctx.lineTo(x + cardW, y + rightH + 1);
        ctx.stroke();
      } else if (imgs.length === 4) {
        // 4 张图：2x2
        const slots = imgs.slice(0, 4);
        const slotW = (cardW - 2) / 2, slotH = (imgAreaH - 2) / 2;
        for (let k = 0; k < slots.length; k++) {
          const sx = x + (k % 2) * (slotW + 2);
          const sy = y + Math.floor(k / 2) * (slotH + 2);
          const img = slots[k];
          const ratio = Math.min(slotW / img.width, slotH / img.height);
          ctx.drawImage(img, sx + (slotW - img.width * ratio) / 2, sy + (slotH - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + slotH + 1); ctx.lineTo(x + cardW, y + slotH + 1);
        ctx.moveTo(x + slotW + 1, y); ctx.lineTo(x + slotW + 1, y + imgAreaH);
        ctx.stroke();
      } else {
        // 5-9 张：3x3 网格
        const slots = imgs.slice(0, 9);
        const slotW = (cardW - 4) / 3, slotH = (imgAreaH - 4) / 3;
        for (let k = 0; k < slots.length; k++) {
          const sx = x + (k % 3) * (slotW + 2);
          const sy = y + Math.floor(k / 3) * (slotH + 2);
          const img = slots[k];
          const ratio = Math.min(slotW / img.width, slotH / img.height);
          ctx.drawImage(img, sx + (slotW - img.width * ratio) / 2, sy + (slotH - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          ctx.moveTo(x, y + i * (slotH + 2) - 1); ctx.lineTo(x + cardW, y + i * (slotH + 2) - 1);
          ctx.moveTo(x + i * (slotW + 2) - 1, y); ctx.lineTo(x + i * (slotW + 2) - 1, y + imgAreaH);
        }
        ctx.stroke();
      }
      
      // 编号徽章（左上角）
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(x, y, 52, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 16px ${cnFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${i + 1}`, x + 26, y + 16);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      
      // 多图数量徽章（右下）
      if (it.m.screenshots && it.m.screenshots.length > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        const badge = `共 ${it.m.screenshots.length} 张`;
        ctx.font = `bold 13px ${cnFont}`;
        const w = ctx.measureText(badge).width + 16;
        ctx.fillRect(x + cardW - w - 10, y + imgAreaH - 30, w, 22);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge, x + cardW - w/2 - 10, y + imgAreaH - 19);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      }
      
      // 文字区域
      const m = it.m;
      let textY = y + imgAreaH + 14;
      
      // 描述（最多 2 行）
      ctx.fillStyle = '#1c1917';
      ctx.font = `bold 16px ${cnFont}`;
      const desc = m.description || '(无描述)';
      drawWrappedText(ctx, desc, x + 14, textY, cardW - 28, 22, 2);
      textY += 48;
      
      // 规格（最多 2 行）
      if (m.specs && m.specs.trim()) {
        ctx.font = `13px ${cnFont}`;
        ctx.fillStyle = '#2563eb';
        drawWrappedText(ctx, '📏 ' + m.specs, x + 14, textY, cardW - 28, 18, 2);
      }
      // 不再显示订单号，仅显示提交人
    }
    
    // 页脚
    ctx.font = `11px ${cnFont}`;
    ctx.fillStyle = '#a8a29e';
    ctx.fillText(`本清单由跟单工作台导出 · ${dateStr}`, padding, canvasH - 30);
    ctx.textAlign = 'right';
    ctx.fillText(`共 ${items.length} 款`, canvasW - padding, canvasH - 30);
    ctx.textAlign = 'left';
    
    // 下载
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `找灯清单_${new Date().toISOString().slice(0, 10)}_共${items.length}款.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`✓ 已导出截图（${items.length} 款）`);
    }, 'image/png', 0.95);
    
  } catch (err) {
    console.error(err);
    toast('截图生成失败: ' + (err.message || ''), 'err');
  }
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// Canvas 多行文字（最多 maxLines 行）
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = String(text || '').split('');
  let line = '';
  let lineNum = 0;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      if (lineNum === maxLines - 1) {
        // 最后一行加省略号
        let truncated = line;
        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        ctx.fillText(truncated + '...', x, y + lineNum * lineHeight);
        return;
      }
      ctx.fillText(line, x, y + lineNum * lineHeight);
      line = chars[i];
      lineNum++;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + lineNum * lineHeight);
}

async function addMissing() {
  if (!CURRENT_AGENT) return;
  const newM = {
    _id: 'M' + Date.now() + Math.random().toString(36).slice(2, 6),
    description: '', customerOrderNo: '', specs: '',
    creator: CURRENT_AGENT,
    status: 'searching',
    screenshots: [],
    realPhotos: [],
    comments: [],
    createdAt: new Date().toISOString(),
  };
  MISSING_LIGHTS.unshift(newM);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissing();
  updateMissingStats();
  try {
    await DATA.saveAndSyncMissing();
  } catch (err) {
    console.error('新增找灯同步失败:', err);
    toast('云端同步失败：' + (err.message || err), 'err');
  }
  openMissingModal(newM._id);
}

function delMissingRow(id) {
  // 找到原始 missing（包括已删除的）
  const m = DATA.getMissingLights().find(x => x._id === id);
  if (!m) return;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  if (!confirm('确定删除这个找灯任务？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  m.deletedAt = new Date().toISOString();
  m.deletedBy = CURRENT_AGENT;
  DATA.saveMissingLights(DATA.getMissingLights());
  loadAllData();
  renderMissing();
  updateMissingStats();
  toast('已移入回收站');
}

function openMissingModal(id) {
  const m = MISSING_LIGHTS.find(x => x._id === id);
  if (!m) return;
  _currentItemId = id;
  _currentItemType = 'missing';
  _newScreenshots_orig = [];
  
  document.getElementById('mmOrderNo').value = m.customerOrderNo || '';
  document.getElementById('mmStatus').value = m.status || 'searching';
  document.getElementById('mmDescription').value = m.description || '';
  document.getElementById('mmSpecs').value = m.specs || '';
  document.getElementById('mmNewComment').value = '';
  document.getElementById('mmCommentSupplier').value = '';
  
  renderMissingModalContent();
  document.getElementById('missingModal').classList.add('show');
}

function renderMissingModalContent() {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  document.getElementById('mmHeader').innerHTML = `
    <div class="top">
      <div class="order-no" style="font-family: inherit; font-size: 14px;">🔍 ${escapeHtml((m.description || '').slice(0, 40)) || '(无描述)'}</div>
      <div class="top-status"><span class="status-pill s-${m.status}" style="display:inline-flex;padding:5px 12px;">${MISSING_STATUS_LABELS[m.status]}</span></div>
    </div>
    <div class="meta">
      <span>👤 发起人：${escapeHtml(m.creator || '')}</span>
      <span>📅 ${(m.createdAt || '').slice(0, 10)}</span>
      <span>💬 ${(m.comments || []).length} 条评论</span>
    </div>
  `;
  
  // 图片
  const ss = m.screenshots || [];
  document.getElementById('mmScreenshotsCount').textContent = `${ss.length} 张`;
  document.getElementById('mmScreenshots').innerHTML = ss.map((s, i) => `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmMissingScreenshot(${i})">×</button></div>`).join('');
  // V4：拼图导出按钮（仅当有 2+ 张图时显示）
  const stitchBtnEl = document.getElementById('mmStitchBtn');
  if (stitchBtnEl) {
    stitchBtnEl.style.display = ss.length >= 2 ? 'inline-flex' : 'none';
    stitchBtnEl.onclick = () => openStitchDialog(m._id, 'screenshots');
  }

  // 实拍照片
  const rp = m.realPhotos || [];
  const rpEl = document.getElementById('mmRealPhotosCount');
  if (rpEl) rpEl.textContent = `${rp.length} 张`;
  const rpListEl = document.getElementById('mmRealPhotos');
  if (rpListEl) {
    rpListEl.innerHTML = rp.map((s, i) => `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmMissingRealPhoto(${i})" title="删除">×</button></div>`).join('');
  }

  // 评论
  const cmts = m.comments || [];
  document.getElementById('mmCommentsCount').textContent = `${cmts.length} 条`;
  const cl = document.getElementById('mmCommentsList');
  if (cmts.length === 0) {
    cl.innerHTML = '<div class="timeline-empty">还没有评论，第一个评论让团队知道你找到了什么</div>';
  } else {
    cl.innerHTML = cmts.map((c, i) => {
      const isAdopted = c.adopted;
      // V5-W3-2026-05-26 权限放开:所有跟单都能采纳/撤销建议(不再限发起人)
      const canAdopt = !!CURRENT_AGENT && c.suggestedSupplier && !isAdopted && c.user !== CURRENT_AGENT;
      const canRevoke = !!CURRENT_AGENT && isAdopted;
      const canEdit = (c.user === CURRENT_AGENT || IS_ADMIN);
      const editedTag = c.editedAt ? `<span style="color: var(--text-tertiary); font-size: 10.5px; margin-left: 4px;" title="${escapeHtml(c.editedAt)}">· 已编辑</span>` : '';
      return `
      <div class="comment-item" data-comment-idx="${i}" style="${isAdopted ? 'border-left-color: var(--success);' : ''}">
        <div class="comment-meta">
          <span class="comment-user">👤 ${escapeHtml(c.user || '')}</span>
          <span>${c.date || ''} ${c.time || ''}${editedTag}</span>
          ${c.suggestedSupplier ? `<span class="comment-suggested">🏭 ${escapeHtml(c.suggestedSupplier)}</span>` : ''}
        </div>
        <div class="comment-view" data-comment-view="${i}">
          <div class="comment-text">${escapeHtml(c.content || '')}</div>
          ${canAdopt ? `<button class="comment-adopt-btn" onclick="adoptComment(${i})">⭐ 采纳此推荐（${SCORE_RULES.missingHelp} 分）</button>` : ''}
          ${isAdopted ? `<span class="comment-adopted">✓ 已采纳推荐 · ${escapeHtml(c.user)} +${SCORE_RULES.missingHelp} 分${canRevoke ? ` <a onclick="revokeAdopt(${i})" style="cursor:pointer;text-decoration:underline;color:var(--text-tertiary);margin-left:6px;">撤销</a>` : ''}</span>` : ''}
          ${canEdit ? `<div class="comment-actions" style="display:flex; gap:6px;"><button class="del-btn" onclick="startEditMissingComment(${i})" style="color: var(--accent);">✏️ 编辑</button><button class="del-btn" onclick="delMissingComment(${i})">删除评论</button></div>` : ''}
        </div>
        <div class="comment-edit" data-comment-edit="${i}" style="display:none;">
          <textarea class="form-control" data-edit-content="${i}" style="min-height: 60px; margin-top: 6px;">${escapeHtml(c.content || '')}</textarea>
          <input type="text" class="form-control" data-edit-supplier="${i}" placeholder="推荐供应商（可选）" value="${escapeHtml(c.suggestedSupplier || '')}" style="margin-top: 6px;">
          <div style="display:flex; gap:6px; margin-top: 8px;">
            <button class="btn primary sm" onclick="saveMissingCommentEdit(${i})">✓ 保存</button>
            <button class="btn sm ghost" onclick="cancelMissingCommentEdit(${i})">取消</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
  }
}

async function onMissingField(field, value) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  // 权限检查：只有发起人或主管能修改
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  m[field] = value;
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  if (field === 'status') {
    try { await DATA.saveAndSyncMissing(); }
    catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
  }
}

// deleteCurrentMissing 也加同步
async function deleteCurrentMissingSync() {
  // 旧函数保持兼容
  return deleteCurrentMissing();
}

function deleteCurrentMissing() {
  const m = DATA.getMissingLights().find(x => x._id === _currentItemId);
  if (!m) return;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  if (!confirm('确定删除这个任务？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  m.deletedAt = new Date().toISOString();
  m.deletedBy = CURRENT_AGENT;
  DATA.saveMissingLights(DATA.getMissingLights());
  closeModal('missingModal');
  loadAllData();
  renderMissing();
  updateMissingStats();
  toast('已移入回收站');
}

async function addMissingComment() {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const content = document.getElementById('mmNewComment').value.trim();
  const supplier = document.getElementById('mmCommentSupplier').value.trim();
  if (!content && !supplier) { toast('请输入评论或推荐供应商', 'warn'); return; }
  if (!m.comments) m.comments = [];
  m.comments.push({
    _id: 'C' + Date.now(),
    user: CURRENT_AGENT,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    content,
    suggestedSupplier: supplier || '',
  });
  // 如果加了推荐供应商 + 当前是搜寻中，提示是否切到"已找到"
  if (supplier && m.status === 'searching') {
    if (confirm('已找到供应商，要切换状态为「已找到」吗？')) {
      m.status = 'found';
      document.getElementById('mmStatus').value = 'found';
    }
  }
  DATA.saveMissingLights(MISSING_LIGHTS);
  document.getElementById('mmNewComment').value = '';
  document.getElementById('mmCommentSupplier').value = '';
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  toast('✓ 评论已发布');
  // 立即同步云端
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function delMissingComment(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const c = m.comments[idx];
  if (c.user !== CURRENT_AGENT && !IS_ADMIN) { toast('只能删自己的评论', 'err'); return; }
  if (!confirm('删除这条评论？')) return;
  m.comments.splice(idx, 1);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

// 编辑评论：进入编辑态
function startEditMissingComment(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const c = (m.comments || [])[idx];
  if (!c) return;
  if (c.user !== CURRENT_AGENT && !IS_ADMIN) { toast('只能编辑自己的评论', 'err'); return; }
  // 切换视图 → 编辑
  const view = document.querySelector(`[data-comment-view="${idx}"]`);
  const edit = document.querySelector(`[data-comment-edit="${idx}"]`);
  if (view) view.style.display = 'none';
  if (edit) {
    edit.style.display = 'block';
    const ta = edit.querySelector(`[data-edit-content="${idx}"]`);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
}

// 取消编辑
function cancelMissingCommentEdit(idx) {
  const view = document.querySelector(`[data-comment-view="${idx}"]`);
  const edit = document.querySelector(`[data-comment-edit="${idx}"]`);
  if (edit) edit.style.display = 'none';
  if (view) view.style.display = '';
}

// 保存编辑
async function saveMissingCommentEdit(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const c = (m.comments || [])[idx];
  if (!c) return;
  if (c.user !== CURRENT_AGENT && !IS_ADMIN) { toast('只能编辑自己的评论', 'err'); return; }
  const ta = document.querySelector(`[data-edit-content="${idx}"]`);
  const sup = document.querySelector(`[data-edit-supplier="${idx}"]`);
  const newContent = (ta?.value || '').trim();
  const newSupplier = (sup?.value || '').trim();
  if (!newContent && !newSupplier) { toast('评论或推荐供应商至少填一项', 'warn'); return; }
  // 若推荐供应商被改且评论已被采纳，提示一下（不阻断）
  if (c.adopted && newSupplier !== (c.suggestedSupplier || '')) {
    if (!confirm('该评论已被采纳，修改推荐供应商会影响采纳记录。\n\n确定继续吗？')) return;
  }
  c.content = newContent;
  c.suggestedSupplier = newSupplier;
  c.editedAt = new Date().toISOString();
  c.editedBy = CURRENT_AGENT;
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  toast('✓ 评论已更新');
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

// 删除实拍照片（所有登录用户均可删，与"所有人可上传"对应）
async function rmMissingRealPhoto(i) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  if (!m.realPhotos || !m.realPhotos[i]) return;
  if (!confirm('删除这张实拍照片？')) return;
  m.realPhotos.splice(i, 1);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function adoptComment(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  const c = m.comments[idx];
  if (!c || !c.suggestedSupplier) return;
  if (!confirm(`采纳 ${c.user} 推荐的「${c.suggestedSupplier}」？\n\n${c.user} 将获得 ${SCORE_RULES.missingHelp} 分贡献积分。\n任务状态将自动切换为「已找到」。`)) return;
  
  c.adopted = true;
  c.adoptedAt = new Date().toISOString();
  m.status = 'found';
  m.adoptedHelper = c.user;
  m.foundAt = new Date().toISOString();
  document.getElementById('mmStatus').value = 'found';
  
  DATA.saveMissingLights(MISSING_LIGHTS);
  
  // 如果关联了采购单，自动给采购单加备注+候选供应商
  if (m.linkedPurchaseId) {
    const allPurchases = DATA.getAllPurchases();
    const linked = allPurchases.find(p => p._id === m.linkedPurchaseId);
    if (linked) {
      const pArr = DATA._cache.purchasesByAgent[linked._agent] || [];
      const p = pArr.find(x => x._id === m.linkedPurchaseId);
      if (p) {
        const noteAddition = `[找灯助攻] ${c.user} 推荐供应商：${c.suggestedSupplier}${c.content ? ' — ' + c.content : ''}`;
        p.notes = (p.notes ? p.notes + '\n\n' : '') + noteAddition;
        if (!p.followups) p.followups = [];
        p.followups.push({
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().slice(0, 5),
          note: `已找到供应商「${c.suggestedSupplier}」（由 ${c.user} 推荐）`,
          type: 'found'
        });
        DATA.savePurchases(linked._agent, pArr);
        try { await DATA.saveAndSyncPurchases(linked._agent); } catch (err) { console.error(err); }
      }
    }
  }
  
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  toast(`✓ 已采纳推荐，${c.user} 获得 ${SCORE_RULES.missingHelp} 分`);
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function revokeAdopt(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  if (!confirm('撤销采纳？该评论者将失去贡献积分。')) return;
  const c = m.comments[idx];
  c.adopted = false;
  delete c.adoptedAt;
  delete m.adoptedHelper;
  m.status = 'searching';
  document.getElementById('mmStatus').value = 'searching';
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  toast('已撤销采纳');
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function rmMissingScreenshot(i) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  m.screenshots.splice(i, 1);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

function updateMissingStats() {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  let searching = 0, found = 0, thisM = 0, mine = 0, totalCmts = 0;
  MISSING_LIGHTS.forEach(m => {
    if (m.status === 'searching') searching++;
    if (m.status === 'found') found++;
    if ((m.createdAt || '').startsWith(thisMonth)) thisM++;
    if (m.creator === CURRENT_AGENT) mine++;
    totalCmts += (m.comments || []).length;
  });
  document.getElementById('mSearching').textContent = searching;
  document.getElementById('mFound').textContent = found;
  document.getElementById('mThisMonth').textContent = thisM;
  document.getElementById('mMine').textContent = mine;
  document.getElementById('mComments').textContent = totalCmts;
  updateBadges();
}

// ============================================================
// V4：找灯图片拼接功能（多张图合成一张大图）
// ============================================================
let _stitchSelected = new Set();
let _stitchAllImgs = [];
let _stitchTargetId = null;
let _stitchSourceField = 'screenshots';

function openStitchDialog(missingId, sourceField) {
  const m = MISSING_LIGHTS.find(x => x._id === missingId);
  if (!m) return;
  const imgs = m[sourceField] || [];
  if (imgs.length < 2) { toast('至少需要 2 张图才能拼接', 'warn'); return; }
  
  _stitchTargetId = missingId;
  _stitchSourceField = sourceField;
  _stitchAllImgs = imgs.slice();
  // 默认全选（最多 16 张）
  _stitchSelected = new Set(imgs.slice(0, Math.min(16, imgs.length)).map((_, i) => i));
  
  renderStitchDialog();
  document.getElementById('stitchModal').classList.add('show');
}

function closeStitchDialog() {
  document.getElementById('stitchModal').classList.remove('show');
  _stitchSelected.clear();
  _stitchAllImgs = [];
  _stitchTargetId = null;
}

function renderStitchDialog() {
  const grid = document.getElementById('stitchImgGrid');
  if (!grid) return;
  grid.innerHTML = _stitchAllImgs.map((s, i) => {
    const sel = _stitchSelected.has(i);
    return `
      <div class="stitch-thumb ${sel ? 'sel' : ''}" onclick="toggleStitchImg(${i})">
        <img src="${s}">
        ${sel ? `<span class="stitch-num">${[..._stitchSelected].sort((a,b)=>a-b).indexOf(i) + 1}</span>` : '<span class="stitch-hint">点击选中</span>'}
      </div>`;
  }).join('');
  // 已选数 + 推荐网格
  document.getElementById('stitchCountInfo').textContent = `已选 ${_stitchSelected.size} 张 / 共 ${_stitchAllImgs.length} 张`;
  document.getElementById('stitchPreviewLayout').textContent = getStitchLayoutLabel(_stitchSelected.size);
}

function toggleStitchImg(i) {
  if (_stitchSelected.has(i)) _stitchSelected.delete(i);
  else {
    if (_stitchSelected.size >= 16) { toast('最多 16 张', 'warn'); return; }
    _stitchSelected.add(i);
  }
  renderStitchDialog();
}

function selectAllStitch() {
  _stitchSelected = new Set(_stitchAllImgs.slice(0, Math.min(16, _stitchAllImgs.length)).map((_, i) => i));
  renderStitchDialog();
}
function clearStitchSelection() {
  _stitchSelected.clear();
  renderStitchDialog();
}

function getStitchLayoutLabel(n) {
  if (n <= 1) return '— 至少 2 张 —';
  if (n === 2) return '1 × 2 横向';
  if (n === 3) return '1 × 3 横向';
  if (n === 4) return '2 × 2 网格';
  if (n <= 6) return '2 × 3 网格';
  if (n <= 9) return '3 × 3 网格';
  if (n <= 12) return '3 × 4 网格';
  return '4 × 4 网格';
}

function _getStitchGrid(n) {
  if (n === 2) return [1, 2];
  if (n === 3) return [1, 3];
  if (n === 4) return [2, 2];
  if (n <= 6) return [2, 3];
  if (n <= 9) return [3, 3];
  if (n <= 12) return [3, 4];
  return [4, 4];
}

async function doStitch() {
  if (_stitchSelected.size < 2) { toast('至少选 2 张图', 'warn'); return; }
  const ordered = [..._stitchSelected].sort((a, b) => a - b).map(i => _stitchAllImgs[i]);
  const n = ordered.length;
  const [rows, cols] = _getStitchGrid(n);
  
  toast(`正在拼接 ${n} 张图（${rows}×${cols}）...`, 'info');
  
  try {
    // 加载所有图片
    const loaded = await Promise.all(ordered.map(url => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`图片加载失败：${url.slice(0, 80)}`));
      img.src = url;
    })));
    
    // 单格尺寸 600x600（统一），间隙 8px，最终大图最大 4800x3600 左右
    const CELL = 600;
    const GAP = 8;
    const PAD = 16;
    const W = PAD * 2 + CELL * cols + GAP * (cols - 1);
    const H = PAD * 2 + CELL * rows + GAP * (rows - 1);
    
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    
    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    
    // 逐格绘制（cover 拟合）
    loaded.forEach((img, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const dx = PAD + c * (CELL + GAP);
      const dy = PAD + r * (CELL + GAP);
      // cover 算法：以图片短边铺满格子，长边裁切
      const scale = Math.max(CELL / img.width, CELL / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const offX = (CELL - drawW) / 2;
      const offY = (CELL - drawH) / 2;
      // 用 clip 限制绘制区域
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy, CELL, CELL);
      ctx.clip();
      ctx.drawImage(img, dx + offX, dy + offY, drawW, drawH);
      ctx.restore();
      // 边框
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, CELL - 1, CELL - 1);
      // 角标编号
      const badgeR = 14;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(dx + badgeR + 8, dy + badgeR + 8, badgeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), dx + badgeR + 8, dy + badgeR + 8);
    });
    
    // 导出 blob + 复制到剪贴板（同时给下载链接）
    canvas.toBlob(async (blob) => {
      if (!blob) { toast('拼接失败', 'err'); return; }
      // 尝试复制到剪贴板
      let copied = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copied = true;
      } catch (e) { /* 不支持就跳过 */ }
      // 始终生成下载链接
      const dlUrl = URL.createObjectURL(blob);
      const dlA = document.createElement('a');
      dlA.href = dlUrl;
      dlA.download = `找灯拼图_${n}张_${new Date().toISOString().slice(0,10)}.png`;
      dlA.click();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
      
      closeStitchDialog();
      if (copied) toast(`✓ 已拼接 ${n} 张图，复制到剪贴板 + 下载`, 'ok', 5000);
      else toast(`✓ 已拼接 ${n} 张图，已下载到本地`, 'ok', 5000);
    }, 'image/png', 0.92);
  } catch (err) {
    console.error('拼图失败：', err);
    toast('拼图失败：' + (err.message || err), 'err');
  }
}


// ============================================================
// V5-W3-2026-05-26: 找灯卡片右上角快速操作按钮的 handler(纯 ADD)
//   - quickMarkMissingFound: 一键把状态切到 'found'(或 toggle 回 'searching')
//   - quickMarkMissingArchived: 一键存档(状态 → 'abandoned'),或 toggle 回 'searching'
//   纯新增,不动 missing.js 任何已有函数(adoptComment 之类的复杂流程都不动)
// ============================================================
async function quickMarkMissingFound(id) {
  const m = MISSING_LIGHTS.find(x => x._id === id);
  if (!m) return;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  // 已经是 found → toggle 回 searching
  if (m.status === 'found') {
    if (!confirm('当前任务已是「已找到」状态。\n要恢复成「搜寻中」吗?')) return;
    m.status = 'searching';
    delete m.foundAt;
    delete m.adoptedHelper;
  } else {
    m.status = 'found';
    m.foundAt = new Date().toISOString();
  }
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissing();
  if (typeof updateMissingStats === 'function') updateMissingStats();
  toast(m.status === 'found' ? '✓ 已标记为「已找到」' : '↩ 已恢复成「搜寻中」');
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function quickMarkMissingArchived(id) {
  const m = MISSING_LIGHTS.find(x => x._id === id);
  if (!m) return;
  // V5-W3-2026-05-26 权限放开:所有跟单都能操作
  // 已经存档 → toggle 回 searching
  if (m.status === 'abandoned') {
    if (!confirm('当前任务已是「已存档/已放弃」状态。\n要恢复成「搜寻中」吗?')) return;
    m.status = 'searching';
  } else {
    if (!confirm('确认存档这个找灯任务吗?\n\n存档后任务会从活跃列表移除,\n可通过筛选「已放弃」找回。')) return;
    m.status = 'abandoned';
  }
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissing();
  if (typeof updateMissingStats === 'function') updateMissingStats();
  toast(m.status === 'abandoned' ? '📦 已存档' : '↩ 已恢复成「搜寻中」');
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}
