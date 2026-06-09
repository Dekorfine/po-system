// ============================================================
// 跟单团队工作台 · aftersales.js
// 售后
// ============================================================
// 依赖：core.js · utils.js
// ============================================================
// V20260527d: 售后原因改多选 + 新增「🚨 加急单(速联达)」字段和筛选
// ============================================================

// 售后快速筛选模式（叠加在 status filter 之上）
// 空字符串 = 无叠加；'thismonth' / 'today' / 'overdue' = 按对应维度过滤
let _aftersalesQuickMode = '';

// V5-2026-05-24: 售后阈值筛选 + 仅未处理 chip(跟催单一致的体验)
let _afterThresholdFilter = 0;   // 0=不限,>0=显示发起≥N天的
let _onlyUnhandled = false;       // 仅显示无任何 followups 的(没人跟进的)

// V20260527d: 加急单筛选(速联达 · 商业快递 · 需要紧急发货)
let _onlyUrgentExpress = false;

// V20260526d: 视角切换 · 'list'(详细信息行) / 'grid'(图墙卡片 · 一眼识货)
let _aftersalesViewMode = (localStorage.getItem('aftersales_view_mode') || 'list');

// V20260526e: 售后日期筛选
let _aftersalesDatePreset = 'all';
function aftersalesOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        _aftersalesDatePreset = customPreset;
        const el = document.getElementById('asDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        renderAftersales();
      });
    }
    return;
  }
  _aftersalesDatePreset = preset || 'all';
  renderAftersales();
}

function setAftersalesViewMode(mode) {
  if (!['list', 'grid'].includes(mode)) return;
  _aftersalesViewMode = mode;
  localStorage.setItem('aftersales_view_mode', mode);
  // 切按钮 active 态
  document.querySelectorAll('#asViewToggle .as-view-btn').forEach(b => {
    const active = b.dataset.view === mode;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--bg-card)' : 'transparent';
    b.style.color = active ? 'var(--accent)' : 'var(--text-secondary)';
    b.style.fontWeight = active ? '600' : '400';
  });
  // 网格模式隐藏表头(列表模式才显示)
  const header = document.getElementById('aftersalesListHeader');
  if (header) header.style.display = (mode === 'list') ? '' : 'none';
  renderAftersales();
}

// 计算售后发起距今天数
function afterDaysSince(a) {
  if (!a.createdDate) return 0;
  return Math.floor((Date.now() - new Date(a.createdDate).getTime()) / 86400000);
}

// ============================================================
// 售后阈值 chip 渲染 - V5(发起日算 + 红色递进)
// ============================================================
function renderAfterThresholdChips() {
  const el = document.getElementById('afterThresholdChips');
  if (!el) return;
  
  const thresholds = [1, 3, 5, 7, 14, 30];  // 售后专属:更短的周期(售后比催单急)
  
  // 基础集合: 只统计"未解决"的(已解决/已取消的不算阈值)
  const activeSet = AFTERSALES.filter(a => !['resolved', 'cancelled'].includes(a.status));
  const unhandledCnt = activeSet.filter(a => (a.followups || []).length === 0).length;
  
  // AND 组合: 如果勾了"仅未处理",阈值的计数只算未处理的
  const baseSet = _onlyUnhandled 
    ? activeSet.filter(a => (a.followups || []).length === 0) 
    : activeSet;
  
  // 颜色递进(售后更紧急,1 天就开始上色)
  function chipColor(days) {
    if (days === 0) return '';
    if (days <= 1)  return '#fbbf24';  // 黄(警觉)
    if (days <= 3)  return '#f59e0b';  // 橙黄(该催了)
    if (days <= 5)  return '#ea580c';  // 橙(警告)
    if (days <= 7)  return '#dc2626';  // 红(严重)
    if (days <= 14) return '#b91c1c';  // 深红(很久了)
    return '#7f1d1d';                   // 30+ 极暗红(出大事)
  }
  
  function renderChip(days, count) {
    const isActive = _afterThresholdFilter === days;
    const color = chipColor(days);
    const baseStyle = isActive 
      ? `background:${color || '#7c3aed'}; color:white; border-color:${color || '#7c3aed'}; box-shadow:0 2px 8px ${color || '#7c3aed'}66, 0 0 0 3px ${color || '#7c3aed'}22; font-weight:600;`
      : days > 0 ? `border-left:3px solid ${color}; color:${color};` : '';
    return `<button class="rule-chip ${isActive ? 'active' : ''}" 
                    onclick="setAfterThreshold(${days})"
                    style="${baseStyle}"
                    title="${days === 0 ? '显示全部未解决售后' : '发起超过 ' + days + ' 天的'}">
              ${days === 0 ? '📋 全部' : '⏰ ≥' + days + '天'} 
              <span class="cnt-mini" style="${isActive ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${count}</span>
            </button>`;
  }
  
  // 自定义天数 chip(如果当前值不在标准列表里,显示"自定义 N 天")
  const isCustom = _afterThresholdFilter > 0 && !thresholds.includes(_afterThresholdFilter);
  let customChipHtml = '';
  if (isCustom) {
    const cnt = baseSet.filter(a => afterDaysSince(a) >= _afterThresholdFilter).length;
    customChipHtml = `<button class="rule-chip active" onclick="setAfterThreshold(0)"
                              style="background:#7f1d1d; color:white; border-color:#7f1d1d; box-shadow:0 2px 8px #7f1d1d66, 0 0 0 3px #7f1d1d22; font-weight:600;"
                              title="自定义阈值,点击取消">
                        🎯 自定义 ≥${_afterThresholdFilter}天 <span class="cnt-mini" style="background:rgba(255,255,255,0.25); color:white;">${cnt}</span>
                        <span style="margin-left:6px; opacity:0.7;">✕</span>
                      </button>`;
  }
  
  el.innerHTML = `
    <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600; min-width: 64px;">售后阈值:</span>
    ${renderChip(0, baseSet.length)}
    ${thresholds.map(d => renderChip(d, baseSet.filter(a => afterDaysSince(a) >= d).length)).join('')}
    ${customChipHtml}
    <button class="rule-chip" onclick="openCustomAfterThresholdInput()"
            title="输入自定义天数(如 21 天)"
            style="border-style:dashed; color:var(--text-secondary);">
      🎯 自定义...
    </button>
    
    <span style="margin-left:6px; height:18px; width:1px; background:var(--border);"></span>
    
    <button class="rule-chip" 
            onclick="toggleOnlyUnhandled()" 
            title="只显示从未填过跟进记录的售后(0 条 followups)"
            style="${_onlyUnhandled ? 'background:#f59e0b; color:white; border-color:#f59e0b; box-shadow:0 2px 8px #f59e0b66, 0 0 0 3px #f59e0b22; font-weight:600;' : 'border-left:3px solid #f59e0b; color:#b45309;'}">
      ⚠ 仅未处理 <span class="cnt-mini" style="${_onlyUnhandled ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${unhandledCnt}</span>
    </button>
    
    ${(() => {
      // V20260527d: 仅加急(速联达)chip
      const urgentCnt = activeSet.filter(a => a.isUrgent).length;
      return `<button class="rule-chip" 
              onclick="toggleOnlyUrgentExpress()" 
              title="只显示标记为「加急单 · 速联达」的售后(商业快递 · 需要紧急发货)"
              style="${_onlyUrgentExpress 
                ? 'background:linear-gradient(135deg,#ef4444,#f97316); color:white; border-color:#ef4444; box-shadow:0 2px 10px rgba(239,68,68,0.5), 0 0 0 3px rgba(239,68,68,0.15); font-weight:700;' 
                : 'border-left:3px solid #ef4444; color:#b91c1c;'}">
        🚨 仅加急(速联达) <span class="cnt-mini" style="${_onlyUrgentExpress ? 'background:rgba(255,255,255,0.25); color:white;' : ''}">${urgentCnt}</span>
      </button>`;
    })()}
    
    <span style="margin-left:auto; font-size: 11px; color: var(--text-tertiary);">
      未解决 <b style="color:#dc2626;">${activeSet.length}</b> · 待处理 <b style="color:#f59e0b;">${unhandledCnt}</b> · 🚨 加急 <b style="color:#ef4444;">${activeSet.filter(a => a.isUrgent).length}</b>
    </span>
  `;
}

function setAfterThreshold(days) {
  _afterThresholdFilter = days;
  renderAftersales();
}

function toggleOnlyUnhandled() {
  _onlyUnhandled = !_onlyUnhandled;
  renderAftersales();
}

async function openCustomAfterThresholdInput() {
  const v = await showPrompt({
    title: '🎯 自定义售后阈值',
    message: '显示"发起超过 N 天还没解决"的售后。\n常用值:1 / 3 / 7 / 14 / 21 / 30 / 45',
    field: { 
      label: '天数(发起距今 ≥)', 
      value: '', 
      type: 'number',
      placeholder: '例:21'
    },
  });
  if (v === null) return;
  const days = parseInt(v, 10);
  if (!days || days < 1 || days > 999) {
    toast('请输入 1-999 之间的天数', 'warn');
    return;
  }
  setAfterThreshold(days);
}

// ============================================================
// MODULE 2: 售后
// ============================================================
function renderAftersales() {
  // V5: 渲染阈值 chip
  renderAfterThresholdChips();
  
  // V20260526o: 关键修复 · 先填充日期 select(避免空列表时早 return 跳过)
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('asDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _aftersalesDatePreset || 'all');
  }
  
  const body = document.getElementById('aftersalesBody');
  const q = (document.getElementById('asSearch').value || '').trim().toLowerCase();
  const fs = document.getElementById('asFilterStatus').value;
  const fSupp = document.getElementById('asFilterSupplier').value;
  const fSite = document.getElementById('asFilterSite').value;
  const fReason = document.getElementById('asFilterReason').value;
  
  let list = AFTERSALES.filter(a => {
    // V5-2026-05-24: 阈值过滤(发起 ≥ N 天)
    if (_afterThresholdFilter > 0 && afterDaysSince(a) < _afterThresholdFilter) return false;
    // V5-2026-05-24: 仅未处理(没人跟进过的)
    if (_onlyUnhandled && (a.followups || []).length > 0) return false;
    // V20260527d: 仅加急(速联达)
    if (_onlyUrgentExpress && !a.isUrgent) return false;
    // V5: 用了阈值/未处理筛选时,默认隐藏已解决/已取消的(否则不直观)
    if ((_afterThresholdFilter > 0 || _onlyUnhandled) && ['resolved','cancelled'].includes(a.status)) return false;
    
    if (q) {
      const t = [a.orderNo, a.product, a.supplier, a.reasonDetail, a._agent, a.site].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fSupp && a.supplier !== fSupp) return false;
    if (fSite && a.site !== fSite) return false;
    // V20260527d: 多原因匹配 — 任一已选主类等于 fReason 就保留(兼容老 reason 字符串)
    if (fReason) {
      const { mains } = getAfterReasons(a);
      if (!mains.includes(fReason)) return false;
    }
    if (fs === 'active') return !['resolved','cancelled'].includes(a.status);
    if (fs === 'completed') return ['resolved','cancelled'].includes(a.status);
    if (fs === 'all') return true;
    return a.status === fs;
  });

  // V20260526e: 日期筛选
  if (_aftersalesDatePreset && _aftersalesDatePreset !== 'all' && typeof isDateInRange === 'function') {
    list = list.filter(a => isDateInRange(a.createdDate || a.created_at, _aftersalesDatePreset));
  }

  // V3：快速筛选模式叠加（来自统计卡片点击）
  if (_aftersalesQuickMode === 'thismonth') {
    const thisMonth = new Date().toISOString().slice(0, 7);
    list = list.filter(a => (a.createdDate || '').startsWith(thisMonth));
  } else if (_aftersalesQuickMode === 'today') {
    const today = new Date().toISOString().slice(0, 10);
    list = list.filter(a => a.createdDate === today);
  } else if (_aftersalesQuickMode === 'overdue') {
    const today = new Date().toISOString().slice(0, 10);
    list = list.filter(a => 
      !['resolved','cancelled'].includes(a.status) &&
      a.nextFollow && a.nextFollow < today
    );
  }
  
  list.sort((a, b) => {
    const aDone = ['resolved','cancelled'].includes(a.status);
    const bDone = ['resolved','cancelled'].includes(b.status);
    if (aDone !== bDone) return aDone ? 1 : -1;
    const da = a.nextFollow || a.createdDate || '9999';
    const db = b.nextFollow || b.createdDate || '9999';
    return da.localeCompare(db);
  });
  
  if (list.length === 0) {
    // V20260605:选了供应商/筛选条件但列表空 — 若该范围下其实有"已解决"的售后,明确提示"已全部处理",别让人以为是 bug
    let _emptyMsg;
    if (AFTERSALES.length === 0) {
      _emptyMsg = '还没有售后单，点 "+ 新增售后" 开始';
    } else {
      const _resolvedInScope = AFTERSALES.some(a =>
        (!fSupp || a.supplier === fSupp) && (!fSite || a.site === fSite) &&
        ['resolved', 'cancelled'].includes(a.status));
      _emptyMsg = _resolvedInScope
        ? '该范围的售后已全部处理完成 ✓ · 想看历史请把状态切到「全部」'
        : '没有匹配的售后单';
    }
    body.innerHTML = `<div class="empty-state"><div class="icon">🔧</div><div class="text">${_emptyMsg}</div>${AFTERSALES.length === 0 ? '<button class="btn primary" onclick="addAftersales()">+ 新增第一个售后单</button>' : ''}</div>`;
    // V4-2026-05-24: 清空可见数据
    window._lastVisibleAftersales = [];
    return;
  }
  
  // V4-2026-05-24: 把筛选+排序后的完整列表挂到全局,供导出函数读取
  window._lastVisibleAftersales = list;
  
  // V4-2026-05-24: 分页 - 默认 50/页,localStorage 记住偏好
  if (typeof _aftersalesPage === 'undefined') {
    window._aftersalesPage = {
      size: parseInt(localStorage.getItem('aftersales_page_size') || '50', 10),
      current: 1,
    };
  }
  if (![50, 100].includes(_aftersalesPage.size)) _aftersalesPage.size = 50;
  
  const totalPages = Math.max(1, Math.ceil(list.length / _aftersalesPage.size));
  if (_aftersalesPage.current > totalPages) _aftersalesPage.current = 1;
  
  const startIdx = (_aftersalesPage.current - 1) * _aftersalesPage.size;
  const pageItems = list.slice(startIdx, startIdx + _aftersalesPage.size);
  
  const paginationHtml = renderPaginationBar({
    total: list.length,
    currentPage: _aftersalesPage.current,
    pageSize: _aftersalesPage.size,
    onPageChange: 'setAftersalesPage(__PAGE__)',
    onSizeChange: 'setAftersalesPageSize(__SIZE__)',
  });
  
  // 渲染:顶部分页 + 卡片 + 底部分页(只在数据超过单页时显示分页)
  // V20260526d: 根据 view mode 选择渲染函数
  const renderFn = (_aftersalesViewMode === 'grid') ? _renderAftersaleCard : _renderAftersaleRow;
  const itemsHtml = pageItems.map((a, i) => renderFn(a, startIdx + i)).join('');
  
  // 网格模式包裹在 .as-grid 容器里(CSS 控制布局)
  const wrappedHtml = (_aftersalesViewMode === 'grid')
    ? `<div class="as-grid">${itemsHtml}</div>`
    : itemsHtml;
  
  body.innerHTML = (list.length > _aftersalesPage.size ? paginationHtml : '') + 
                   wrappedHtml +
                   (list.length > _aftersalesPage.size ? paginationHtml : '');
  // V20260526e: 填充日期筛选下拉
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('asDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _aftersalesDatePreset || 'all');
  }
}

// V4-2026-05-24: 售后分页控制
function setAftersalesPage(newPage) {
  if (typeof _aftersalesPage === 'undefined') window._aftersalesPage = { size: 50, current: 1 };
  _aftersalesPage.current = newPage;
  renderAftersales();
  setTimeout(() => {
    document.getElementById('aftersalesBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function setAftersalesPageSize(newSize) {
  const size = parseInt(newSize, 10);
  if (![50, 100].includes(size)) return;
  if (typeof _aftersalesPage === 'undefined') window._aftersalesPage = { size: 50, current: 1 };
  _aftersalesPage.size = size;
  _aftersalesPage.current = 1;
  localStorage.setItem('aftersales_page_size', String(size));
  renderAftersales();
}

// ============================================================
// V20260526d: 网格卡片渲染 · 类似找灯卡片(图墙 · 一眼识货)
// ============================================================
function _renderAftersaleCard(a, i) {
  // 收集所有图片 · 优先用客户截图(沟通图)展示
  const manualScreenshots = [...(a.screenshots || []), ...((a.followups || []).flatMap(f => f.screenshots || []))];
  let productImages = (a.products || []).map(p => p.image_url).filter(Boolean);  // V20260602:优先选中SKU的图
  if (!productImages.length && typeof _getRelatedOrderImages === 'function') productImages = _getRelatedOrderImages(a.orderNo);
  const allImages = manualScreenshots.length > 0 ? manualScreenshots : productImages;
  
  // 状态信息
  const status = a.status || 'pending';
  const statusMeta = {
    pending: { label: '待处理', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
    contacting: { label: '沟通中', color: '#2563eb', bg: 'rgba(37,99,235,0.15)' },
    repairing: { label: '返修中', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
    resolved: { label: '已解决', color: '#16a34a', bg: 'rgba(22,163,74,0.15)' },
    cancelled: { label: '已取消', color: '#9ca3af', bg: 'rgba(156,163,175,0.15)' },
  }[status] || { label: status, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
  
  const isDone = ['resolved', 'cancelled'].includes(status);
  const days = afterDaysSince(a);
  const urgent = !isDone && days >= 7;
  // V20260527d: 加急单(速联达)— 跟"逾期 urgent"语义不同,这是商业快递需求
  const expressUrgent = !!a.isUrgent;
  
  // 多图布局(借鉴找灯)
  let coverHTML = '';
  let coverCls = '';
  const n = allImages.length;
  if (n === 0) {
    coverCls = 'cnt-0';
    coverHTML = '<div class="no-image">🔧</div><div class="no-image-hint">无截图</div>';
  } else if (n === 1) {
    coverCls = 'cnt-1';
    coverHTML = `<img src="${allImages[0]}" alt="售后图" loading="lazy">`;
  } else if (n === 2) {
    coverCls = 'cnt-2 multi';
    coverHTML = allImages.map(s => `<img src="${s}" loading="lazy">`).join('');
  } else if (n === 3) {
    coverCls = 'cnt-3 multi';
    coverHTML = allImages.map(s => `<img src="${s}" loading="lazy">`).join('');
  } else if (n === 4) {
    coverCls = 'cnt-4 multi';
    coverHTML = allImages.map(s => `<img src="${s}" loading="lazy">`).join('');
  } else {
    coverCls = 'cnt-many multi';
    const max = 9;
    if (n <= max) {
      coverHTML = allImages.map(s => `<img src="${s}" loading="lazy">`).join('');
    } else {
      coverHTML = allImages.slice(0, max - 1).map(s => `<img src="${s}" loading="lazy">`).join('');
      const remaining = n - (max - 1);
      coverHTML += `<div class="more-overlay"><img src="${allImages[max - 1]}" loading="lazy"><span>+${remaining}</span></div>`;
    }
  }
  
  // V20260527d: 多原因显示(grid 卡片)
  const { mains: gridMains } = getAfterReasons(a);
  const reasonDisplay = gridMains.length > 0 
    ? gridMains.join(' + ')
    : ((a.reason || '').split('·')[0] || a.reason || '');
  const reason = reasonDisplay;
  const reasonDetail = (a.reasonDetail || '').trim();
  const fuCount = (a.followups || []).length;
  const supplier = a.supplier || '';
  const product = a.product || a.productName || '';
  
  return `
    <div class="as-card ${urgent ? 'urgent' : ''} ${expressUrgent ? 'express-urgent' : ''} ${isDone ? 'done' : ''}" onclick="openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}')" ${expressUrgent ? 'style="box-shadow:0 0 0 2px #ef4444, 0 4px 12px rgba(239,68,68,0.25);"' : ''}>
      <div class="cover ${coverCls}">
        ${coverHTML}
        <span class="status-badge" style="background:${statusMeta.bg}; color:${statusMeta.color};">${statusMeta.label}</span>
        ${expressUrgent ? `<span class="urgent-badge" style="background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;font-weight:700;box-shadow:0 2px 6px rgba(239,68,68,0.4);">🚨 加急·速联达</span>` : (urgent ? `<span class="urgent-badge">🔥 ${days}天</span>` : '')}
        ${fuCount > 0 ? `<span class="comments-badge">💬 ${fuCount}</span>` : ''}
        ${n > 0 ? `<span class="photo-count">📷 ${n}</span>` : ''}
      </div>
      <div class="body">
        <div class="order-no">${escapeHtml(a.orderNo || '(无订单号)')}</div>
        ${product ? `<div class="product">${escapeHtml(product)}</div>` : ''}
        ${reason ? `<div class="reason">⚠ ${escapeHtml(reason)}</div>` : ''}
        ${reasonDetail ? `<div class="detail">${escapeHtml(reasonDetail.slice(0, 60))}${reasonDetail.length > 60 ? '...' : ''}</div>` : ''}
        <div class="meta">
          ${supplier ? `<span class="supplier">🏭 ${escapeHtml(supplier)}</span>` : ''}
          ${a.site ? `<span class="site">🌐 ${escapeHtml(a.site)}</span>` : ''}
          <span class="date">📅 ${escapeHtml(a.createdDate || '')}</span>
        </div>
      </div>
    </div>
  `;
}

// V4-2026-05-24: 把原本 list.map 里那段长行渲染逻辑抽成函数,供分页调用
function _renderAftersaleRow(a, i) {
    const fuCount = (a.followups || []).length;
    
    // V4：图片拼装策略 — 分两个区域
    // ① 跟单手动上传的图（→ 右侧"截图"列：处理进度可视化）
    const manualScreenshots = [...(a.screenshots || []), ...((a.followups || []).flatMap(f => f.screenshots || []))];
    // ② 产品图：通过 orderNo 反查关联销售单/PO（→ 左侧"状态"列下方：识别产品）
    let productImages = (a.products || []).map(p => p.image_url).filter(Boolean);  // V20260602:优先选中SKU的图
    if (!productImages.length) productImages = _getRelatedOrderImages(a.orderNo);
    // V4-2026-05-24：产品图反查不到时 → 兜底用跟单上传的沟通截图
    // 让 # 列大图位永远有内容可看（"一眼识货"的体验不被未填产品破坏）
    let productImageSource = 'product';  // 'product' = 来自产品库 | 'manual' = 来自沟通截图兜底
    if (productImages.length === 0 && manualScreenshots.length > 0) {
      productImages = manualScreenshots.slice(0, 4);
      productImageSource = 'manual';
    }
    
    const lastFu = fuCount > 0 ? a.followups[fuCount - 1] : null;
    const siteBadge = a.site ? `<span class="site-badge s-${a.site}">${escapeHtml(a.site)}</span>` : '';
    
    // 已 N 天
    const days = a.createdDate ? Math.floor((new Date() - new Date(a.createdDate)) / 86400000) : 0;
    const daysHtml = days > 0 ? `<div class="days-ago ${days >= 7 ? 'warn' : ''}">${days} 天</div>` : '';
    
    // V4：右侧"截图"列 → 只展示跟单上传的沟通截图
    let thumbsHtml;
    if (manualScreenshots.length === 0) {
      thumbsHtml = '<span class="no-img">无沟通图</span>';
    } else {
      const main = manualScreenshots[0];
      const rest = manualScreenshots.slice(1, 4);
      const totalRemain = manualScreenshots.length - 1 - rest.length;
      const countBadge = manualScreenshots.length > 1
        ? `<span style="position:absolute; bottom:2px; right:2px; background:rgba(0,0,0,0.7); color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; pointer-events:none;">📷 ${manualScreenshots.length}</span>`
        : '';
      const sourceBadge = `<span style="position:absolute; top:2px; left:2px; background:rgba(124,58,237,0.92); color:white; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; pointer-events:none;">✓ 处理中</span>`;
      const galleryData = JSON.stringify(manualScreenshots).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
      
      thumbsHtml = `
        <div style="display:flex; gap:4px; align-items:flex-start;">
          <div style="position:relative; width:90px; height:90px; flex-shrink:0; cursor:pointer; border-radius:6px; overflow:hidden; border:1px solid var(--border); background: var(--bg-elevated);" 
               onclick="event.stopPropagation(); viewImageGallery('${galleryData}', 0)">
            <img src="${main}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy" 
                 onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=&quot;display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--text-tertiary);font-size:11px;&quot;>加载失败</div>'">
            ${sourceBadge}
            ${countBadge}
          </div>
          ${rest.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:3px;">
              ${rest.map((s, idx) => `
                <img src="${s}" style="width:28px; height:28px; object-fit:cover; border-radius:4px; cursor:pointer; border:1px solid var(--border); flex-shrink:0;" 
                     loading="lazy"
                     onclick="event.stopPropagation(); viewImageGallery('${galleryData}', ${idx + 1})"
                     onerror="this.style.display='none'">
              `).join('')}
              ${totalRemain > 0 ? `<span style="font-size:10px; color:var(--text-tertiary); width:28px; text-align:center; line-height:1.2;">+${totalRemain}</span>` : ''}
            </div>` : ''}
        </div>
      `;
    }
    
    // V4-2026-05-24：左侧"#列"内 → 紧贴行号下方显示产品大图（一眼识别产品）
    // 改动点：从状态徽章下方移到 # 列内；无图也显示灰色占位；hover 自动放大
    // 角标语义：紫色"产品"（来自产品库标准图）/ 蓝色"实拍"（兜底用沟通截图）
    let productImageHtml = '';
    if (productImages.length > 0) {
      const main = productImages[0];
      const restCount = productImages.length - 1;
      const galleryData = JSON.stringify(productImages).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
      const sourceCls = productImageSource === 'manual' ? 'src-manual' : 'src-product';
      productImageHtml = `
        <div class="row-prod-thumb has-img ${sourceCls}" 
             onclick="event.stopPropagation(); viewImageGallery('${galleryData}', 0)"
             title="${productImageSource === 'manual' ? '实拍/沟通图' : '产品图'}｜点击查看大图${restCount > 0 ? `（共 ${productImages.length} 张）` : ''}｜悬停自动放大">
          <img src="${main}" loading="lazy"
               onerror="this.style.display='none'; this.parentElement.classList.add('img-err'); this.parentElement.innerHTML='<div class=&quot;row-prod-fallback&quot;>📷</div>'">
          ${restCount > 0 ? `<span class="row-prod-badge-count">+${restCount}</span>` : ''}
        </div>
      `;
    } else {
      // V4-2026-05-24：无任何图也显示占位（保持 # 列宽度一致 + 视觉对齐）
      productImageHtml = `<div class="row-prod-thumb no-img" title="该售后暂无关联产品图/沟通图"><span class="row-prod-fallback">📷</span></div>`;
    }
    
    // 最近跟进
    const lastFuHtml = lastFu ? `
      <div class="last-fu">
        <b>📞 ${formatShortDate(lastFu.date)}:</b> ${escapeHtml((lastFu.note || '').slice(0, 70))}${(lastFu.note || '').length > 70 ? '...' : ''}
      </div>` : '';
    
    const reasonHtml = (() => {
      // V20260527d: 多原因 → 多个 reason-tag
      const { mains } = getAfterReasons(a);
      if (mains.length > 0) {
        return mains.map(m => `<span class="reason-tag">⚠ ${escapeHtml(m)}</span>`).join('');
      }
      return a.reason 
        ? `<span class="reason-tag">⚠ ${escapeHtml(a.reason)}</span>`
        : '<span class="reason-tag empty">⚠ 未选原因</span>';
    })();
    // V20260527d: 加急徽章(列表模式)
    const urgentRowBadge = a.isUrgent 
      ? `<span class="reason-tag" style="background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;font-weight:700;border:none;">🚨 加急·速联达</span>` 
      : '';
    
    return `
      <div class="record-row after-row s-${a.status}" ${a.isUrgent ? 'style="border-left:3px solid #ef4444;"' : ''}>
        <div class="row-num row-num-with-thumb">
          <span class="row-num-idx">${i + 1}</span>
          ${productImageHtml}
          ${IS_ADMIN && a._agent ? `<div style="font-size:9px;color:var(--text-tertiary);">${escapeHtml(a._agent.slice(0,2))}</div>` : ''}
          ${daysHtml}
        </div>
        <div onclick="openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}')" style="cursor:pointer;"><span class="status-pill s-${a.status}">${AFTER_STATUS_LABELS[a.status]}</span></div>
        <div class="cell-main" onclick="openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}')" style="cursor:pointer;">
          <div class="order-line">
            <span class="order-no-big">${escapeHtml(a.orderNo || '⚠ 待填订单号')}</span>
            ${siteBadge}
            ${urgentRowBadge}
            ${reasonHtml}
          </div>
          <div class="product-line">📦 ${escapeHtml(a.product || '未填产品')}</div>
          <div class="supplier-line">🏭 ${escapeHtml(a.supplier || '未填供应商')}</div>
          ${a.reasonDetail ? `<div class="detail-line">${escapeHtml(a.reasonDetail.slice(0, 100))}${a.reasonDetail.length > 100 ? '...' : ''}</div>` : ''}
          ${lastFuHtml}
        </div>
        <div class="thumbs-cell">${thumbsHtml}</div>
        <div class="dates-cell">
          <div class="date-line"><span class="lbl">📅 发起</span>${formatShortDate(a.createdDate) || '—'}</div>
          ${a.nextFollow ? `<div class="date-line"><span class="lbl">⏰ 下次</span>${formatShortDate(a.nextFollow)}</div>` : ''}
          ${a.resolvedDate ? `<div class="date-line"><span class="lbl resolved">✓ 解决</span>${formatShortDate(a.resolvedDate)}</div>` : ''}
        </div>
        <div class="row-actions">
          ${a.status !== 'resolved' && a.status !== 'cancelled' ? `<button class="action-btn done" title="一键标记为已解决" onclick="event.stopPropagation(); quickCompleteAfter('${a._id}', '${escapeHtml(a._agent || '')}')">✓</button>` : '<span style="width: 28px;"></span>'}
          <button class="followup-btn ${fuCount > 0 ? 'has-followups' : ''}" onclick="event.stopPropagation(); openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}')">${fuCount > 0 ? `📋${fuCount}` : '📋'}</button>
          <button class="action-btn delete" title="删除" onclick="event.stopPropagation(); delAfterRow('${a._id}', '${escapeHtml(a._agent || '')}')">🗑</button>
        </div>
      </div>
    `;
}

async function addAftersales() {
  const me = CONFIG.agents.find(a => a.name === CURRENT_AGENT);
  const defaultSite = (me && me.sites && me.sites.length > 0) ? me.sites[0] : '';
  const newA = {
    _id: 'A' + Date.now() + Math.random().toString(36).slice(2, 6),
    orderNo: '', product: '', supplier: '',
    site: defaultSite,
    // V20260527d: 新字段 — 多选原因 + 加急
    reasons: [], reasonSubs: {},
    reason: '', reasonDetail: '',
    isUrgent: false,
    createdDate: new Date().toISOString().slice(0, 10),
    status: 'pending', nextFollow: '', resolvedDate: '',
    products: [],   // V20260602:关联产品(多选)
    screenshots: [], followups: [],
    createdAt: new Date().toISOString(),
  };
  const arr = DATA.getAftersales(CURRENT_AGENT);
  arr.unshift(newA);
  DATA.saveAftersales(CURRENT_AGENT, arr);
  loadAllData();
  renderAftersales();
  updateAfterStats();
  try {
    await DATA.saveAndSyncAftersales(CURRENT_AGENT);
  } catch (err) {
    console.error('新增售后同步失败:', err);
    toast('云端同步失败：' + (err.message || err), 'err');
  }
  openAfterModal(newA._id, CURRENT_AGENT);
}

async function quickCompleteAfter(id, agent) {
  const ownerAgent = agent || CURRENT_AGENT;
  const arr = DATA.getAftersales(ownerAgent);
  const a = arr.find(x => x._id === id);
  if (!a) return;
  
  if (a.status === 'resolved') {
    toast('该售后单已是「已解决」状态', 'warn');
    return;
  }
  
  const today = new Date().toISOString().slice(0, 10);
  const msg = `售后 ${a.orderNo || '(无单号)'} 已经解决？\n\n会标记为：✓ 已解决\n解决日期：${today}`;
  if (!confirm(msg)) return;
  
  a.status = 'resolved';
  if (!a.resolvedDate) a.resolvedDate = today;
  
  DATA._cache.aftersalesByAgent[ownerAgent] = arr;
  loadAllData();
  renderActiveTab();
  toast('正在同步到云端...', 'info', 8000);
  
  try {
    DATA._cancelDebounce && DATA._cancelDebounce('after_' + ownerAgent);
    await fullSyncAftersales(ownerAgent);
    toast(`✓ 售后已标记「已解决」并已同步`);
  } catch (err) {
    console.error('同步失败:', err);
    toast('本地已更新，云端同步失败：' + (err.message || err), 'err');
  }
}

function delAfterRow(id, agent) {
  if (!confirm('确定删除？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  const owner = (IS_ADMIN && agent) ? agent : CURRENT_AGENT;
  const arr = DATA.getAftersales(owner);
  const a = arr.find(x => x._id === id);
  if (!a) return;
  a.deletedAt = new Date().toISOString();
  a.deletedBy = CURRENT_AGENT;
  DATA.saveAftersales(owner, arr);
  loadAllData();
  renderActiveTab();
  toast('已移入回收站');
}

function openAfterModal(id, agent) {
  const owner = agent || CURRENT_AGENT;
  const arr = DATA.getAftersales(owner);
  const a = arr.find(x => x._id === id);
  if (!a) return;
  _currentItemId = id;
  _currentItemType = 'after';
  _newScreenshots_fu = [];
  _newScreenshots_orig = [];
  window._currentItemAgent = owner;
  
  refreshSiteDropdowns();
  document.getElementById('asmSite').value = a.site || '';
  document.getElementById('asmOrderNo').value = a.orderNo || '';
  document.getElementById('asmProduct').value = a.product || '';
  document.getElementById('asmSupplier').value = a.supplier || '';
  document.getElementById('asmCreatedDate').value = a.createdDate || '';
  document.getElementById('asmReasonDetail').value = a.reasonDetail || '';
  document.getElementById('asmNextFollow').value = a.nextFollow || '';
  document.getElementById('asmResolvedDate').value = a.resolvedDate || '';
  document.getElementById('asmNewDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('asmNewNote').value = '';
  document.getElementById('asmFuThumbs').innerHTML = '';
  updateOrderNoHint('asmSite', 'asmOrderNo', 'asmOrderNoHint');
  
  renderAfterModalContent();
  document.getElementById('aftersalesModal').classList.add('show');
  // V20260602:打开时自动抓取订单产品(有订单号就抓)
  if (typeof afAutoFetchProducts === 'function') { _afFetched = []; _afState = 'empty'; afAutoFetchProducts(); }
}

function renderAfterModalContent() {
  const a = currentAfter();
  if (!a) return;
  
  // V20260527d: 多原因 + 加急
  const { mains: selectedMains, subs: selectedSubs } = getAfterReasons(a);
  const reasonStr = _buildReasonString(selectedMains, selectedSubs);
  const isUrgent = !!a.isUrgent;
  
  document.getElementById('asmHeader').innerHTML = `
    <div class="top">
      <div class="order-no">${escapeHtml(a.orderNo || '(未填订单号)')}</div>
      ${isUrgent ? `<span style="font-size:11px;background:linear-gradient(135deg,#ef4444,#f97316);color:#fff;padding:3px 9px;border-radius:4px;font-weight:700;box-shadow:0 2px 6px rgba(239,68,68,0.35);">🚨 加急单·速联达</span>` : ''}
      ${IS_ADMIN && window._currentItemAgent ? `<span style="font-size:11px;background:rgba(124,58,237,0.1);color:var(--purple);padding:2px 8px;border-radius:4px;font-weight:600;">👤 ${escapeHtml(window._currentItemAgent)}</span>` : ''}
      <div class="top-status"><span class="status-pill s-${a.status}" style="display:inline-flex;padding:5px 12px;">${AFTER_STATUS_LABELS[a.status]}</span></div>
    </div>
    <div class="meta">
      ${a.product ? `<span>📦 ${escapeHtml(a.product)}</span>` : ''}
      ${a.supplier ? `<span>🏭 ${escapeHtml(a.supplier)}</span>` : ''}
      ${reasonStr ? `<span style="color:var(--pink);font-weight:600;">⚠ ${escapeHtml(reasonStr)}</span>` : ''}
    </div>
  `;
  
  // V20260527d: 加急单开关(在 #asmUrgentToggle 占位)
  const urgentEl = document.getElementById('asmUrgentToggle');
  if (urgentEl) {
    urgentEl.innerHTML = `
      <button type="button" class="urgent-toggle-btn ${isUrgent ? 'on' : ''}" onclick="toggleAfterUrgent()"
              style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.15s;border:2px solid ${isUrgent ? '#ef4444' : 'var(--border)'};background:${isUrgent ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'var(--bg-card)'};color:${isUrgent ? '#fff' : 'var(--text-secondary)'};box-shadow:${isUrgent ? '0 3px 10px rgba(239,68,68,0.3)' : 'none'};">
        ${isUrgent ? '🚨' : '⚪'} 加急单(速联达·商业快递)${isUrgent ? ' · 已标记' : ''}
      </button>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">速联达=商业快递,标记后供应商需优先安排发货</div>
    `;
  }
  
  // V20260527d: 主原因按钮高亮(多选)
  document.querySelectorAll('#asmReasonGrid .status-pill').forEach(p => {
    p.classList.toggle('selected', selectedMains.includes(p.dataset.r));
  });
  // 状态 pill 高亮
  document.querySelectorAll('#aftersalesModal .status-grid:not(#asmReasonGrid):not(#asmSubReasonGrid) .status-pill').forEach(p => p.classList.toggle('selected', p.dataset.st === a.status));
  
  // V20260527d: 子原因区 — 为每个已选主原因展开一组子原因 chip
  const subWrap = document.getElementById('asmSubReasonWrap');
  const subGrid = document.getElementById('asmSubReasonGrid');
  if (subWrap && subGrid) {
    if (selectedMains.length === 0) {
      subWrap.style.display = 'none';
      subGrid.innerHTML = '';
    } else {
      subWrap.style.display = '';
      subGrid.innerHTML = selectedMains.map(main => {
        const tree = REASON_TREE[main];
        if (!tree || !tree.subs || tree.subs.length === 0) return '';
        const curSub = selectedSubs[main] || '';
        const escMain = main.replace(/'/g, "\\'");
        const pills = tree.subs.map(s => {
          const escSub = escapeHtml(s);
          const escSubJs = s.replace(/'/g, "\\'");
          const sel = s === curSub ? 'selected' : '';
          return `<div class="status-pill ${sel}" onclick="setAfterSubReason('${escMain}', '${escSubJs}')">${escSub}</div>`;
        }).join('');
        return `
          <div style="margin-bottom:10px;">
            <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:5px;font-weight:600;">
              ${tree.icon || '·'} ${escapeHtml(main)} 
              <span style="font-weight:400;color:var(--text-tertiary);">— 具体类型(可选)</span>
            </div>
            <div class="status-grid cols-3">${pills}</div>
          </div>
        `;
      }).join('');
    }
  }
  
  // 截图
  const origs = a.screenshots || [];
  document.getElementById('asmOrigCount').textContent = `${origs.length} 张`;
  document.getElementById('asmOrigThumbs').innerHTML = origs.map((s, i) => `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmAfterOrig(${i})">×</button></div>`).join('');
  
  // 时间线
  const fu = a.followups || [];
  document.getElementById('asmTimelineCount').textContent = `${fu.length} 条`;
  const tl = document.getElementById('asmTimeline');
  if (fu.length === 0) {
    tl.innerHTML = '<div class="timeline-empty">还没有处理记录</div>';
  } else {
    tl.innerHTML = fu.map((f, i) => `
      <div class="timeline-item">
        <div class="timeline-dot" style="background:var(--pink);">${i + 1}</div>
        <div class="timeline-content">
          <div class="timeline-meta"><span>📅 ${f.date} ${f.time || ''}</span></div>
          <div class="timeline-text">${escapeHtml(f.note || '')}</div>
          ${(f.screenshots && f.screenshots.length > 0) ? `<div class="timeline-screenshots">${f.screenshots.map(s => `<img src="${s}" class="screenshot-thumb" onclick="viewImage('${s}')">`).join('')}</div>` : ''}
          <div class="actions"><button class="del-btn" onclick="delAfterFollowup(${i})">删除</button></div>
        </div>
      </div>
    `).join('');
  }
}

function currentAfter() {
  if (!_currentItemId) return null;
  const agent = window._currentItemAgent || CURRENT_AGENT;
  return DATA.getAftersales(agent).find(a => a._id === _currentItemId);
}

function persistCurrentAfter(updater, immediate = false) {
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getAftersales(agent);
  const idx = arr.findIndex(a => a._id === _currentItemId);
  if (idx < 0) return;
  updater(arr[idx]);
  DATA.saveAftersales(agent, arr);
  loadAllData();
  if (immediate) {
    DATA.saveAndSyncAftersales(agent).catch(err => { console.error(err); toast('同步失败:' + (err.message || err), 'err'); });
  }
}

function onAfterField(field, value) {
  persistCurrentAfter(a => a[field] = value);
  if (field === 'site') updateOrderNoHint('asmSite', 'asmOrderNo', 'asmOrderNoHint');
  renderAfterModalContent();
  renderAftersales();
  updateAfterStats();
  refreshAsFb();
  renderAfterReport();
}

// ===== V20260602:售后订单抓取(镜像催单/问题模块)=====
// 输入订单号 → 自动从 PO/销售单抓原始订单产品 → 勾选有售后的 SKU(可多选)→ 自动填图+规格
let _afFetched = [];      // [{spec,qty,image_url,sku,_checked}]
let _afState = 'empty';   // empty | ok | nomatch
let _afNo = '';
let _afLastSrc = '';
let _afFetchTimer = null;

function afOrderNoChanged(value) {
  persistCurrentAfter(a => a.orderNo = value);
  updateOrderNoHint('asmSite', 'asmOrderNo', 'asmOrderNoHint');
  clearTimeout(_afFetchTimer);
  _afFetchTimer = setTimeout(() => afAutoFetchProducts(), 600);
}

function afAutoFetchProducts() {
  const a = currentAfter();
  const rawNo = (document.getElementById('asmOrderNo')?.value || (a && a.orderNo) || '').trim();
  const panel = document.getElementById('asmFetchPanel');
  // 支持多个订单号(/ , 、 空格 分隔)· 一个客户多个订单都有售后
  const nos = rawNo.split(/[\/,，、\s]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
  _afNo = nos.join(' / ');
  if (nos.length === 0) { _afFetched = []; _afState = 'empty'; if (panel) afRenderFetchPanel(); return; }

  let lineItems = [];
  const srcSet = new Set();
  nos.forEach(n => {
    // V20260606:以"完整订单"为准 + PO 合并去重 — 修"客户买了多个SKU,售后只显示6个(PO只覆盖部分SKU)"
    //   先取 Shopify 完整订单的全部 line_items,再并入 PO 里订单没有的(按 SKU/规格去重),保证所有 SKU 都出现
    let got = [];
    const _seen = new Set();
    const _key = (li) => String(li.sku || li.variant || li.variant_title || li.title || '').trim().toLowerCase();
    // ① Shopify 完整订单(全部 SKU)
    if (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
      const so = SHOPIFY._orders.find(x => String(x.shopify_order_number||'').replace('#','')===n || String(x.name||'').replace('#','')===n);
      if (so && so.line_items && so.line_items.length) {
        so.line_items.forEach(li => { const k=_key(li); if(k && !_seen.has(k)){ _seen.add(k); got.push(li); } });
        srcSet.add('销售单');
      }
    }
    // ② PO 里有、但订单没覆盖到的 SKU 也并进来(按 SKU 去重)
    if (typeof PO_LIST !== 'undefined' && PO_LIST.length) {
      const pos = PO_LIST.filter(pp => String(pp.po_number||'').trim()===n || String(pp.order_no||'').trim()===n);
      const poItems = pos.flatMap(pp => pp.line_items || []);
      let added = 0;
      poItems.forEach(li => { const k=_key(li); if(k && !_seen.has(k)){ _seen.add(k); got.push(li); added++; } });
      if (got.length && (added > 0 || !srcSet.has('销售单'))) srcSet.add('PO');
    }
    got.forEach(li => { try { li._fromOrder = n; } catch(e){} });
    lineItems = lineItems.concat(got);
  });
  const src = (nos.length > 1 ? `${nos.length}个订单·` : '') + ([...srcSet].join('/') || '');
  lineItems = (lineItems||[]).filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));

  const productMap = (typeof SHOPIFY !== 'undefined' && SHOPIFY._productMap) ? SHOPIFY._productMap : {};
  _afFetched = lineItems.map(li => {
    const rawSpec = li.variant || li.variant_title || li.title_cn || li.title_en || li.title || '';
    let spec = (typeof _cleanFetchedSpec === 'function') ? _cleanFetchedSpec(li, rawSpec) : rawSpec;
    let img = li.image_url || li.image || '';
    if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
    if (!img && li.sku && typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.effectiveBySku) {
      const pp = PRODUCTS_CACHE.effectiveBySku(li.sku); if (pp && pp.image_url) img = pp.image_url;
    }
    const cur = (a && a.products) || [];
    const checked = cur.some(x => (x.sku && x.sku===li.sku) || (x.spec && x.spec===spec));
    return { spec, qty: li.qty || li.quantity || '', image_url: img, sku: li.sku || '', _checked: checked };
  });
  // 本地没抓到但已保存过产品 → 显示已保存的
  if (_afFetched.length === 0 && a && (a.products || []).length > 0) {
    _afFetched = a.products.map(p => ({ spec: p.spec, qty: p.qty, image_url: p.image_url, sku: p.sku, _checked: true }));
    _afLastSrc = '已保存';
  }
  _afState = (_afFetched.length === 0) ? 'nomatch' : 'ok';
  // 只有一个产品且没选过 → 默认勾上(常见:整单只有一件,直接就是它有售后)
  if (_afFetched.length === 1 && (!(a && a.products) || a.products.length === 0)) { _afFetched[0]._checked = true; afCommitProducts(); }
  _afLastSrc = src;
  // 打开时用新抓取(已清洗+数量)重建已勾选 · 修"规格还是英文/没存数量"
  if (a && _afFetched.length && _afFetched.some(p => p._checked)) {
    const fetchedSel = _afFetched.filter(p => p._checked).map(p => ({ spec: p.spec, qty: p.qty, image_url: p.image_url, sku: p.sku }));
    const sig = arr => JSON.stringify((arr||[]).map(p => [p.sku || '', p.spec || '', p.qty == null ? '' : p.qty, p.image_url || '']));
    if (sig(a.products) !== sig(fetchedSel)) afCommitProducts();
  }
  afRenderFetchPanel();
  // V20260608:不再自动调 AI 翻译 — 浏览器直连 api.anthropic.com 在 GitHub Pages 必被 CORS 拦死(从未成功),
  //   每次打开售后都白发一个注定失败的请求 + 满屏报错。需要翻译时由人工点按钮(若要真正可用须走服务端代理)。
  // afTranslateRemaining();
}

async function afManualFetch() {
  const a = currentAfter();
  const rawNo = (document.getElementById('asmOrderNo')?.value || (a && a.orderNo) || '').trim();
  const nos = rawNo.split(/[\/,，、\s]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
  if (nos.length === 0) { alert('请先填订单号'); return; }
  const site = document.getElementById('asmSite')?.value || (a && a.site);
  const meta = (typeof SHOPIFY !== 'undefined' && SHOPIFY.STORES_META) ? SHOPIFY.STORES_META.find(m => m.site_code === site) : null;
  const shop = meta ? meta.domain : null;
  const panel = document.getElementById('asmFetchPanel');
  if (!shop) { if (panel) panel.innerHTML = `<div style="font-size:12px;color:var(--danger);">⚠ 站点 ${escapeHtml(site||'')} 无对应 Shopify 店铺</div>`; return; }
  _afNo = nos.join(' / ');
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
      } catch (e) { console.warn('[售后后台拉取]', n, e.message || e); }
    }
    lineItems = lineItems.filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));
    if (lineItems.length === 0) { _afFetched=[]; _afState='nomatch'; if (panel) panel.innerHTML = `<div style="font-size:12px;color:var(--warning);padding:4px 0;">⚠ Shopify 后台也没查到「${escapeHtml(_afNo)}」的产品</div>`; return; }
    const productMap = (SHOPIFY._productMap) || {};
    _afFetched = lineItems.map(li => {
      const rawSpec = li.variant_title || li.variant || li.title || '';
      let spec = (typeof _cleanFetchedSpec === 'function') ? _cleanFetchedSpec(li, rawSpec) : rawSpec;
      let img = li.image_url || '';
      if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
      const cur = (a && a.products) || [];
      const checked = cur.some(x => (x.sku && x.sku===li.sku) || (x.spec && x.spec===spec));
      return { spec, qty: li.quantity || li.qty || '', image_url: img, sku: li.sku || '', _checked: checked };
    });
    _afState='ok'; _afLastSrc = nos.length > 1 ? `Shopify后台·${nos.length}单` : 'Shopify后台';
    if (_afFetched.length===1 && (!(a && a.products) || a.products.length===0)) { _afFetched[0]._checked=true; afCommitProducts(); }
    afRenderFetchPanel();
    afTranslateRemaining();
  } catch (e) {
    if (panel) panel.innerHTML = `<div style="font-size:12px;color:var(--danger);padding:4px 0;">❌ 后台拉取失败:${escapeHtml(e.message||String(e))}</div>`;
  }
}

function afRenderFetchPanel() {
  const panel = document.getElementById('asmFetchPanel'); if (!panel) return;
  const btn = '<button type="button" class="btn small" onclick="afManualFetch()" style="padding:3px 10px;font-size:11px;margin-left:8px;">📥 从 Shopify 后台拉取</button>';
  if (_afState === 'empty' || !_afNo) {
    panel.innerHTML = '<div style="font-size:11.5px;color:var(--text-secondary);padding:2px 0;">👆 填<b>订单号</b> → 自动从 PO/销售单抓产品,勾选<b>有售后的 SKU</b>(可多选)→ 自动填产品图和规格' + btn + '</div>';
    return;
  }
  if (_afState === 'nomatch' || !_afFetched.length) {
    panel.innerHTML = `<div style="font-size:11.5px;color:var(--warning);padding:4px 0;">⚠ 本地没找到订单「<b>${escapeHtml(_afNo)}</b>」· 旧订单可点右边从后台拉` + btn + `</div>`;
    return;
  }
  const allChecked = _afFetched.every(p => p._checked);
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
      <div style="font-size:11.5px;color:var(--text-secondary);font-weight:600;">📥 订单「${escapeHtml(_afNo)}」的产品(${_afLastSrc||'订单'})· 勾选<b style="color:var(--pink);">有售后问题的 SKU</b></div>
      <div>
        <button type="button" class="btn small" onclick="afToggleAll()" style="padding:3px 10px;font-size:11px;">${allChecked?'取消全选':'全选'}</button>
        <button type="button" class="btn small" onclick="afManualFetch()" style="padding:3px 10px;font-size:11px;margin-left:6px;">📥 后台重拉</button>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${_afFetched.map((p,i)=>`
        <label style="display:flex;align-items:center;gap:7px;border:1.5px solid ${p._checked?'var(--pink)':'var(--border)'};border-radius:8px;padding:6px 9px;cursor:pointer;background:${p._checked?'rgba(236,72,153,0.08)':'var(--bg-card)'};">
          <input type="checkbox" ${p._checked?'checked':''} onchange="afToggleFetched(${i})">
          ${p.image_url?`<img src="${p.image_url}" style="width:48px;height:48px;object-fit:cover;border-radius:5px;">`:'<span style="font-size:20px;">📷</span>'}
          <span style="font-size:12px;max-width:240px;line-height:1.35;">${escapeHtml(p.spec||'(无规格)')}${p.qty?` · <b style="color:#dc2626;">×${p.qty}</b>`:''}</span>
        </label>`).join('')}
    </div>
    <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:6px;">勾选后自动填入「产品」字段 · 售后问题图照常在下方上传</div>`;
}

function afToggleFetched(i) { if (!_afFetched[i]) return; _afFetched[i]._checked = !_afFetched[i]._checked; afCommitProducts(); afRenderFetchPanel(); }
function afToggleAll() { const tg = !_afFetched.every(p=>p._checked); _afFetched.forEach(p=>p._checked=tg); afCommitProducts(); afRenderFetchPanel(); }
function afCommitProducts() {
  const selected = _afFetched.filter(p=>p._checked).map(p=>({spec:p.spec,qty:p.qty,image_url:p.image_url,sku:p.sku}));
  persistCurrentAfter(a => {
    a.products = selected;
    // 自动填「产品」字段(多 SKU 用 / 隔开)
    a.product = selected.map(p => p.spec).filter(Boolean).join(' / ');
  });
  renderAfterModalContent();
  renderAftersales();
}
async function afTranslateRemaining() {
  if (typeof _aiTranslateSpec !== 'function') return;
  const need = _afFetched.filter(p => { if(!p.spec)return false; const en=(p.spec.match(/[A-Za-z]{3,}/g)||[]).length; const cn=(p.spec.match(/[\u4e00-\u9fa5]/g)||[]).length; return en>0 && cn/Math.max(p.spec.length,1)<0.5; });
  if (need.length === 0) return;
  try {
    const numbered = need.map((p,i)=>`[${i+1}] ${p.spec}`).join('\n');
    const result = await _aiTranslateSpec(numbered);
    (result.split('\n').filter(l=>l.trim())).forEach(line=>{ const m=line.match(/^\[(\d+)\]\s*(.+)$/); if(m){const idx=parseInt(m[1])-1; if(need[idx])need[idx].spec=m[2].trim();}});
    afCommitProducts(); afRenderFetchPanel();
  } catch(e) { console.warn('[售后 AI 翻译兜底失败]', e.message||e); }
}

// 售后原因辅助：拆分 "主类 · 子类" 格式
const REASON_MIGRATION = {
  '质量问题': '产品瑕疵',
  '发错货': '给错货物',
  '缺件少件': '缺配件',
};
function _parseReason(reason) {
  if (!reason) return { main: '', sub: '' };
  const parts = reason.split(' · ');
  let main = parts[0] || '';
  if (REASON_MIGRATION[main]) main = REASON_MIGRATION[main];
  return { main, sub: parts[1] || '' };
}

// ============================================================
// V20260527d: 售后原因多选辅助
// ------------------------------------------------------------
// 新数据结构(向后兼容):
//   a.reasons      = ['产品瑕疵', '物流损坏']  // 主原因数组
//   a.reasonSubs   = { '产品瑕疵': '喷漆不良/掉漆' }  // 各主类下的子原因
//   a.reason       = '产品瑕疵 · 喷漆不良/掉漆 + 物流损坏'  // 兼容字段(同步生成)
//   a.isUrgent     = true/false  // 加急单(速联达)
// 老数据 a.reason 字符串自动 parse,无需迁移
// ============================================================
function getAfterReasons(a) {
  // 优先读新数组;空就从老 reason 拆出来
  if (Array.isArray(a.reasons) && a.reasons.length > 0) {
    const subs = (a.reasonSubs && typeof a.reasonSubs === 'object') ? a.reasonSubs : {};
    // 迁移老主原因名
    const mains = a.reasons.map(m => REASON_MIGRATION[m] || m);
    return { mains, subs };
  }
  // 兼容老数据:reason 是字符串 "主 · 子" 或多个用 " + " 拼
  if (!a.reason) return { mains: [], subs: {} };
  const segments = a.reason.split(' + ');
  const mains = [];
  const subs = {};
  segments.forEach(seg => {
    const { main, sub } = _parseReason(seg);
    if (main && !mains.includes(main)) {
      mains.push(main);
      if (sub) subs[main] = sub;
    }
  });
  return { mains, subs };
}

// 把多选 mains + subs 拼回兼容字符串(供旧代码/筛选/导出读)
function _buildReasonString(mains, subs) {
  if (!mains || mains.length === 0) return '';
  return mains.map(m => {
    const sub = subs && subs[m];
    return sub ? `${m} · ${sub}` : m;
  }).join(' + ');
}

// 多选 toggle:点主原因 → 加入/移除数组
async function toggleAfterReason(mainReason) {
  const a = currentAfter();
  if (!a) return;
  const { mains, subs } = getAfterReasons(a);
  const idx = mains.indexOf(mainReason);
  let newMains, newSubs;
  if (idx >= 0) {
    // 已选 → 取消,顺带移除该主类下的子原因
    newMains = mains.filter(m => m !== mainReason);
    newSubs = { ...subs };
    delete newSubs[mainReason];
  } else {
    // 未选 → 加入末尾
    newMains = [...mains, mainReason];
    newSubs = { ...subs };
  }
  persistCurrentAfter(x => {
    x.reasons = newMains;
    x.reasonSubs = newSubs;
    x.reason = _buildReasonString(newMains, newSubs);  // 同步兼容字段
  });
  renderAfterModalContent();
  renderAftersales();
  renderAfterReport();
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('after_' + agent);
  try { await fullSyncAftersales(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

// 给指定主原因设置子原因(点 chip 点子原因 chip 时调)
async function setAfterSubReason(mainReason, subReason) {
  const a = currentAfter();
  if (!a) return;
  const { mains, subs } = getAfterReasons(a);
  if (!mains.includes(mainReason)) {
    toast('请先勾选 "' + mainReason + '" 主原因', 'warn');
    return;
  }
  const newSubs = { ...subs };
  // 再次点击同一个子原因 = 取消
  if (newSubs[mainReason] === subReason) {
    delete newSubs[mainReason];
  } else {
    newSubs[mainReason] = subReason;
  }
  persistCurrentAfter(x => {
    x.reasons = mains;
    x.reasonSubs = newSubs;
    x.reason = _buildReasonString(mains, newSubs);
  });
  renderAfterModalContent();
  renderAftersales();
  renderAfterReport();
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('after_' + agent);
  try { await fullSyncAftersales(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

// V20260527d: 加急单(速联达)开关
async function toggleAfterUrgent() {
  const a = currentAfter();
  if (!a) return;
  const next = !a.isUrgent;
  persistCurrentAfter(x => { x.isUrgent = next; });
  renderAfterModalContent();
  renderAftersales();
  updateAfterStats();
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('after_' + agent);
  try { await fullSyncAftersales(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
  toast(next ? '🚨 已标记为加急单(速联达)' : '已取消加急标记', 'ok');
}

// V20260527d: 顶部 chip 切换"仅加急"
function toggleOnlyUrgentExpress() {
  _onlyUrgentExpress = !_onlyUrgentExpress;
  renderAftersales();
}

// 保留旧 setAfterReason 名以防其他地方误调(自动转发到 toggle)
async function setAfterReason(mainReason) {
  return toggleAfterReason(mainReason);
}

async function setAfterStatus(st) {
  persistCurrentAfter(a => {
    a.status = st;
    if (st === 'resolved' && !a.resolvedDate) {
      a.resolvedDate = new Date().toISOString().slice(0, 10);
      document.getElementById('asmResolvedDate').value = a.resolvedDate;
    }
  });
  renderAfterModalContent();
  renderAftersales();
  updateAfterStats();
  refreshAsFb();
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('after_' + agent);
  try { await fullSyncAftersales(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

function deleteCurrentAfter() {
  if (!confirm('确定删除？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getAftersales(agent);
  const a = arr.find(x => x._id === _currentItemId);
  if (!a) return;
  a.deletedAt = new Date().toISOString();
  a.deletedBy = CURRENT_AGENT;
  DATA.saveAftersales(agent, arr);
  closeModal('aftersalesModal');
  loadAllData();
  renderAftersales();
  updateAfterStats();
  refreshAsFb();
  renderAfterReport();
  toast('已移入回收站');
}

function addAfterFollowup() {
  const note = document.getElementById('asmNewNote').value.trim();
  const date = document.getElementById('asmNewDate').value || new Date().toISOString().slice(0, 10);
  if (!note && _newScreenshots_fu.length === 0) { toast('请输入处理内容或上传截图', 'warn'); return; }
  persistCurrentAfter(a => {
    if (!a.followups) a.followups = [];
    a.followups.push({ date, time: new Date().toTimeString().slice(0, 5), note, screenshots: [..._newScreenshots_fu] });
  }, true);
  document.getElementById('asmNewNote').value = '';
  document.getElementById('asmFuThumbs').innerHTML = '';
  _newScreenshots_fu = [];
  renderAfterModalContent();
  renderAftersales();
  refreshAsFb();
  toast('✓ 已记录');
}

function delAfterFollowup(idx) {
  if (!confirm('删除这条记录？')) return;
  persistCurrentAfter(a => a.followups.splice(idx, 1), true);
  renderAfterModalContent();
  renderAftersales();
}

function rmAfterOrig(i) {
  persistCurrentAfter(a => a.screenshots.splice(i, 1), true);
  renderAfterModalContent();
}

function updateAfterStats() {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  let unresolved = 0, thisM = 0, resolvedM = 0, todayCnt = 0, overdueCnt = 0;
  AFTERSALES.forEach(a => {
    if (!['resolved','cancelled'].includes(a.status)) {
      unresolved++;
      if (a.nextFollow && a.nextFollow < today) overdueCnt++;
    }
    if (a.createdDate && a.createdDate.startsWith(thisMonth)) thisM++;
    if (a.createdDate === today) todayCnt++;
    if (a.status === 'resolved' && a.resolvedDate && a.resolvedDate.startsWith(thisMonth)) resolvedM++;
  });
  document.getElementById('asUnresolved').textContent = unresolved;
  document.getElementById('asThisMonth').textContent = thisM;
  
  // 售后比例：本月售后 / 本月活跃订单
  // V3：用 CHASE_ORDERS（PO 派生），不存在或为空时退回 ORDERS
  const __src = (typeof CHASE_ORDERS !== 'undefined' && CHASE_ORDERS.length > 0) ? CHASE_ORDERS : ORDERS;
  const ordersThisMonth = __src.filter(o => o.orderDate && o.orderDate.startsWith(thisMonth)).length;
  const ratio = ordersThisMonth > 0 ? (thisM / ordersThisMonth * 100).toFixed(1) : 0;
  document.getElementById('asThisMonthSub').textContent = ordersThisMonth > 0 ? `本月订单 ${ordersThisMonth}, 售后率 ${ratio}%` : '本月无订单';
  
  document.getElementById('asResolved').textContent = resolvedM;
  document.getElementById('asTodayCount').textContent = todayCnt;
  document.getElementById('asOverdue').textContent = overdueCnt;
  updateBadges();
}

function refreshAsFb() {
  const today = new Date().toISOString().slice(0, 10);
  const buckets = { overdue: [], today: [], upcoming: [] };
  AFTERSALES.forEach(a => {
    if (['resolved','cancelled'].includes(a.status)) return;
    if (a.nextFollow) {
      if (a.nextFollow < today) buckets.overdue.push(a);
      else if (a.nextFollow === today) buckets.today.push(a);
      else buckets.upcoming.push(a);
    }
  });
  buckets.overdue.sort((a, b) => (a.nextFollow || '').localeCompare(b.nextFollow || ''));
  buckets.upcoming.sort((a, b) => (a.nextFollow || '').localeCompare(b.nextFollow || ''));
  
  document.getElementById('asFbOverdue').textContent = buckets.overdue.length;
  document.getElementById('asFbToday').textContent = buckets.today.length;
  document.getElementById('asFbUpcoming').textContent = buckets.upcoming.length;
  const total = new Set([...buckets.overdue, ...buckets.today, ...buckets.upcoming].map(a => a._id)).size;
  document.getElementById('asFbTotal').textContent = `共 ${total} 单`;
  
  const card = document.getElementById('asFb');
  if (!card.dataset.userToggled) {
    // V20260527j: 真·默认折叠 · 每次进 tab 都强制折叠
    // 用户当次会话点开后仍保持展开(由 toggleFb 设 dataset.userToggled='1')
    // 刷新页面后 DOM 重建 · userToggled 丢失 · 重新回到折叠
    card.classList.add('collapsed');
  }
  
  if (buckets[_asFbTab].length === 0) {
    for (const t of ['overdue','today','upcoming']) { if (buckets[t].length > 0) { _asFbTab = t; break; } }
  }
  document.querySelectorAll('#asFb .fb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _asFbTab));
  
  const list = document.getElementById('asFbList');
  const items = buckets[_asFbTab];
  if (items.length === 0) {
    list.innerHTML = `<div class="fb-empty">✓ 没有需处理的售后单</div>`;
    return;
  }
  list.innerHTML = items.slice(0, 12).map(a => {
    const days = diffDays(a.nextFollow);
    let label = formatShortDate(a.nextFollow), cls = '';
    if (a.nextFollow) {
      if (days < 0) { label = `逾期 ${-days} 天`; cls = 'overdue'; }
      else if (days === 0) { label = '今日'; cls = 'today'; }
      else { label = `${days} 天后`; cls = 'upcoming'; }
    }
    return `
      <div class="fb-item" onclick="openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}')">
        <div class="dot" style="background:var(--pink);"></div>
        <div class="order-no">${escapeHtml(a.orderNo || '—')}</div>
        <div class="product">${escapeHtml(a.product || a.reason || '(无描述)')}${IS_ADMIN && a._agent ? ` · 👤${escapeHtml(a._agent)}` : ''}</div>
        <div class="badge">${escapeHtml(a.reason || '')}</div>
        <div class="next ${cls}">${label}</div>
        <button class="action-btn">处理</button>
      </div>
    `;
  }).join('');
}

function switchAsFb(t) { _asFbTab = t; document.getElementById('asFb').classList.remove('collapsed'); refreshAsFb(); }

// V20260527f: 「本月售后汇总」可折叠 · 默认折叠 · localStorage 记忆
function toggleAfterReport(e) {
  if (e) e.stopPropagation();
  const card = document.getElementById('asReportCard');
  if (!card) return;
  card.classList.toggle('collapsed');
  const isCollapsed = card.classList.contains('collapsed');
  localStorage.setItem('as_report_collapsed', isCollapsed ? '1' : '0');
  // 切换箭头方向
  const icon = document.getElementById('asReportToggleIcon');
  if (icon) icon.textContent = isCollapsed ? '▼' : '▲';
}

// 本月汇总报表
function renderAfterReport() {
  // V20260527j: 汇总已移到 analytics tab · DOM 不在 aftersales tab 时 early return
  const supEl = document.getElementById('reportBySupplier');
  const reasonEl = document.getElementById('reportByReason');
  if (!supEl || !reasonEl) return;
  
  // V20260527f: 应用 localStorage 折叠状态(默认折叠)
  const reportCard = document.getElementById('asReportCard');
  if (reportCard && !reportCard.dataset.collapseApplied) {
    const saved = localStorage.getItem('as_report_collapsed');
    const shouldCollapse = saved !== '0';  // '0'=展开;'1'/null=折叠(默认)
    reportCard.classList.toggle('collapsed', shouldCollapse);
    const icon = document.getElementById('asReportToggleIcon');
    if (icon) icon.textContent = shouldCollapse ? '▼' : '▲';
    reportCard.dataset.collapseApplied = '1';
  }
  
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthData = AFTERSALES.filter(a => a.createdDate && a.createdDate.startsWith(thisMonth));
  
  // 按供应商
  const bySupplier = {};
  monthData.forEach(a => {
    const s = a.supplier || '未填供应商';
    if (!bySupplier[s]) bySupplier[s] = { count: 0, unresolved: 0 };
    bySupplier[s].count++;
    if (!['resolved','cancelled'].includes(a.status)) bySupplier[s].unresolved++;
  });
  const supplierList = Object.entries(bySupplier).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  const maxCount = supplierList.length > 0 ? supplierList[0][1].count : 1;
  
  if (supplierList.length === 0) {
    supEl.innerHTML = '<div style="font-size: 12px; color: var(--text-tertiary); padding: 12px; text-align: center;">本月暂无售后</div>';
  } else {
    supEl.innerHTML = supplierList.map(([sup, info]) => {
      const pct = (info.count / maxCount * 100).toFixed(0);
      return `
        <div class="bar-row">
          <div class="label" title="${escapeHtml(sup)}">${escapeHtml(sup)}</div>
          <div class="bar"><div class="bar-fill ${info.unresolved > 0 ? 'pink' : ''}" style="width: ${pct}%;"></div></div>
          <div class="count">${info.count}</div>
          <div><button class="export-supplier-btn" onclick="exportSupplierAfter('${escapeHtml(sup).replace(/'/g, "\\'")}')">导出</button></div>
        </div>
      `;
    }).join('');
  }
  
  // 按原因（只按主原因统计，避免子原因导致分散）
  const byReason = {};
  monthData.forEach(a => {
    const r = (_parseReason(a.reason).main) || '未填';
    byReason[r] = (byReason[r] || 0) + 1;
  });
  const reasonList = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
  const totalReason = monthData.length || 1;
  
  if (reasonList.length === 0) {
    reasonEl.innerHTML = '<div style="font-size: 12px; color: var(--text-tertiary); padding: 12px; text-align: center;">本月暂无售后</div>';
  } else {
    const maxReason = reasonList[0][1];
    reasonEl.innerHTML = reasonList.map(([r, c]) => {
      const pct = (c / maxReason * 100).toFixed(0);
      const totalPct = (c / totalReason * 100).toFixed(1);
      return `
        <div class="bar-row">
          <div class="label">${escapeHtml(r)}</div>
          <div class="bar"><div class="bar-fill" style="width: ${pct}%;"></div></div>
          <div class="count">${c}</div>
          <div class="pct">${totalPct}%</div>
        </div>
      `;
    }).join('');
  }
}

function exportSupplierAfter(supplier) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const data = AFTERSALES.filter(a => a.supplier === supplier && a.createdDate && a.createdDate.startsWith(thisMonth));
  if (data.length === 0) { toast('该供应商本月无售后记录', 'warn'); return; }
  const headers = ['#','订单号','产品','售后原因','原因详情','发起日','状态','解决日','跟单员','处理记录'];
  const rows = data.map((a, i) => [
    i + 1, a.orderNo, a.product, a.reason, a.reasonDetail,
    a.createdDate, AFTER_STATUS_LABELS[a.status], a.resolvedDate, a._agent,
    (a.followups || []).map(f => `[${f.date}] ${f.note}`).join(' || '),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:5},{wch:14},{wch:20},{wch:12},{wch:30},{wch:11},{wch:10},{wch:11},{wch:10},{wch:60}];
  XLSX.utils.book_append_sheet(wb, ws, supplier.slice(0, 30));
  XLSX.writeFile(wb, `售后_${supplier}_${thisMonth}.xlsx`);
  toast(`✓ 已导出 ${data.length} 条`);
}

// V20260608:售后"瘦身" — 把 screenshots/followups 里残留的 base64 老图迁到云存储(存URL),根治"越用越慢"
//   幂等:没有 base64 就什么都不改;失败的跳过不影响其余。主管操作。
async function migrateAftersalesBase64() {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) { toast('只有主管能执行瘦身', 'warn'); return; }
  if (typeof uploadScreenshotToStorage !== 'function') { toast('上传组件不可用', 'err'); return; }
  if (!confirm('扫描所有售后,把残留的 base64 老图迁移到云存储(存URL)。\n\n这会让售后加载变快、减小数据库体积。\n过程可能几分钟,期间别关页面。继续?')) return;

  toast('正在扫描售后…', 'info', 6000);
  let rows;
  try {
    const { data, error } = await sb.from('aftersales').select('id, screenshots, followups');
    if (error) throw error;
    rows = data || [];
  } catch (e) { toast('读取失败:' + (e.message || e), 'err', 6000); return; }

  const isB64 = (x) => typeof x === 'string' && x.startsWith('data:image');
  let scanned = 0, foundImgs = 0, migrated = 0, failed = 0, changedRows = 0;

  for (const r of rows) {
    scanned++;
    let changed = false;
    // screenshots[]
    let shots = Array.isArray(r.screenshots) ? r.screenshots.slice() : [];
    for (let i = 0; i < shots.length; i++) {
      if (isB64(shots[i])) {
        foundImgs++;
        try { shots[i] = await uploadScreenshotToStorage(shots[i]); migrated++; changed = true; }
        catch (e) { failed++; console.warn('迁移失败(screenshot)', r.id, e); }
      }
    }
    // followups[].screenshots[]
    let fus = Array.isArray(r.followups) ? JSON.parse(JSON.stringify(r.followups)) : [];
    for (const f of fus) {
      if (!Array.isArray(f.screenshots)) continue;
      for (let j = 0; j < f.screenshots.length; j++) {
        if (isB64(f.screenshots[j])) {
          foundImgs++;
          try { f.screenshots[j] = await uploadScreenshotToStorage(f.screenshots[j]); migrated++; changed = true; }
          catch (e) { failed++; console.warn('迁移失败(followup)', r.id, e); }
        }
      }
    }
    if (changed) {
      try {
        const { error } = await sb.from('aftersales').update({ screenshots: shots, followups: fus }).eq('id', r.id);
        if (error) throw error;
        changedRows++;
      } catch (e) { failed++; console.warn('保存失败', r.id, e); }
    }
    if (scanned % 20 === 0) toast(`扫描中… ${scanned}/${rows.length} · 已迁移 ${migrated} 张`, 'info', 4000);
  }

  if (foundImgs === 0) {
    toast(`✓ 扫描 ${scanned} 条售后,没有 base64 老图(数据已经是干净的URL)`, 'success', 7000);
  } else {
    toast(`✓ 瘦身完成:扫描 ${scanned} 条 · 发现 ${foundImgs} 张 base64 · 迁移 ${migrated} 张 · 更新 ${changedRows} 条${failed ? ` · 失败 ${failed}(看控制台)` : ''}`, 'success', 9000);
    if (typeof DATA !== 'undefined' && DATA.loadAll) { try { await DATA.loadAll(); } catch(_){} }
    if (typeof renderAftersales === 'function') renderAftersales();
  }
}
window.migrateAftersalesBase64 = migrateAftersalesBase64;

// V20260608:售后清单导出 Excel(带产品图)· 镜像催单清单导出 · 没图也能一眼看出是哪个产品
async function exportAftersalesExcelImg() {
  const source = (window._lastVisibleAftersales && window._lastVisibleAftersales.length > 0)
    ? window._lastVisibleAftersales
    : (typeof AFTERSALES !== 'undefined' ? AFTERSALES.filter(a => !a.deletedAt) : []);
  if (!source || source.length === 0) { toast('当前没有可导出的售后记录', 'warn'); return; }
  if (typeof _loadExcelJS !== 'function' || typeof _fetchImageSmall !== 'function') { toast('Excel 组件不可用', 'err'); return; }
  try { await _loadExcelJS(); } catch (e) { toast('Excel 组件加载失败:' + (e.message || e), 'err', 6000); return; }
  toast('正在生成售后 Excel(含产品图)…', 'info', 8000);

  const today = new Date().toISOString().slice(0, 10);
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('售后清单');
  const STATUS = (typeof AFTER_STATUS_LABELS !== 'undefined') ? AFTER_STATUS_LABELS : {};

  const headers = ['订单号', '网站', '产品图', '产品 / 规格', '供应商', '售后原因', '原因详情', '发起日', '状态', '解决日', '跟单员', '处理记录'];
  const IMG_COL = 3;

  ws.addRow(['售后清单']);
  ws.addRow([`生成日期: ${today.replace(/-/g, '/')}    共 ${source.length} 条`]);
  ws.addRow([]);
  const headerRow = ws.addRow(headers);
  const dataStartRow = ws.rowCount + 1;

  const dataRowRefs = [];
  source.forEach(a => {
    dataRowRefs.push(ws.addRow([
      a.orderNo || '', a.site || '', '', a.product || '', a.supplier || '',
      a.reason || '', a.reasonDetail || '', a.createdDate || '',
      STATUS[a.status] || a.status || '', a.resolvedDate || '', a._agent || '',
      (a.followups || []).map(f => `[${f.date}] ${f.note || ''}`).join(' || '),
    ]));
  });

  [16, 7, 13, 30, 12, 12, 30, 11, 10, 11, 10, 50].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // 每行取一张图:优先产品图(a.products[].image_url),没有就用首张售后截图兜底
  const urls = source.map(a => {
    const pimg = (a.products || []).map(p => p.image_url).filter(Boolean)[0];
    if (pimg) return pimg;
    const shot = (a.screenshots || [])[0] || ((a.followups || []).flatMap(f => f.screenshots || [])[0]);
    return shot || '';
  });
  const dataURLs = await Promise.all(urls.map(u => _fetchImageSmall(u, 96)));
  let embedded = 0;
  for (let i = 0; i < source.length; i++) {
    const du = dataURLs[i];
    const rowNo = dataStartRow + i;
    if (du) {
      try {
        const id = wb.addImage({ base64: du, extension: 'jpeg' });
        ws.getRow(rowNo).height = 64;
        ws.addImage(id, { tl: { col: (IMG_COL - 1) + 0.1, row: (rowNo - 1) + 0.06 }, ext: { width: 72, height: 72 }, editAs: 'oneCell' });
        embedded++;
      } catch (e) {}
    }
  }

  const thin = { style: 'thin', color: { argb: 'FFD0D7DE' } };
  const allBorder = { top: thin, left: thin, bottom: thin, right: thin };
  const N = headers.length;
  headerRow.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = allBorder;
  });
  headerRow.height = 24;
  const centerCols = [1, 2, 3, 8, 9, 10, 11];
  dataRowRefs.forEach((row, idx) => {
    if (idx % 2 === 1) for (let c = 1; c <= N; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2F2' } };
    for (let c = 1; c <= N; c++) {
      const cell = row.getCell(c);
      cell.border = allBorder;
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: centerCols.includes(c) ? 'center' : 'left' };
    }
  });
  ws.views = [{ state: 'frozen', ySplit: dataStartRow - 1 }];
  try { ws.autoFilter = { from: { row: dataStartRow - 1, column: 1 }, to: { row: dataStartRow - 1, column: N } }; } catch (e) {}
  ws.mergeCells(1, 1, 1, N); ws.mergeCells(2, 1, 2, N);
  ws.getRow(1).font = { bold: true, size: 14 }; ws.getRow(1).alignment = { horizontal: 'center' };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const el = document.createElement('a');
  el.href = URL.createObjectURL(blob);
  el.download = `售后清单_${today}.xlsx`;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(el.href), 8000);
  toast(`✓ 已导出 ${source.length} 条 · 嵌入 ${embedded} 张图`);
}
window.exportAftersalesExcelImg = exportAftersalesExcelImg;

function exportAfterReport() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const data = AFTERSALES.filter(a => a.createdDate && a.createdDate.startsWith(thisMonth));
  if (data.length === 0) { toast('本月无售后', 'warn'); return; }
  
  const choice = confirm('选择导出格式：\n\n确定 = 📄 图文报告（HTML，含图片，发供应商用）\n取消 = 📊 Excel 表格');
  if (choice) {
    // 用通用 HTML 导出
    exportAsHTML(`${thisMonth} 售后汇总`, data, [
      { key: 'orderNo', label: '订单号', site: true },
      { key: 'product', label: '产品' },
      { key: 'supplier', label: '供应商' },
      { key: 'reason', label: '原因' },
      { key: 'reasonDetail', label: '详情' },
      { key: 'statusLabel', label: '状态', val: a => AFTER_STATUS_LABELS[a.status] || '' },
      { key: 'dates', label: '日期', val: a => `发起 ${a.createdDate||'—'}${a.resolvedDate?'<br>解决 '+a.resolvedDate:''}` },
      { key: 'followupsList', label: '跟进', val: a => {
        const fu = a.followups || [];
        if (fu.length === 0) return '<span style="color:#999;">无</span>';
        return fu.map(f => `[${f.date}] ${escapeHtml(f.note || '')}`).join('<br>');
      }},
      { key: 'images', label: '图片', isImage: true },
    ]);
    return;
  }
  
  const headers = ['#','订单号','网站','产品','供应商','售后原因','原因详情','发起日','状态','解决日','跟单员','下次跟进','截图链接','所有跟进'];
  const rows = data.map((a, i) => [
    i + 1, a.orderNo || '', a.site || '', a.product || '', a.supplier || '',
    a.reason || '', a.reasonDetail || '',
    a.createdDate || '', AFTER_STATUS_LABELS[a.status] || '', a.resolvedDate || '',
    a._agent || '', a.nextFollow || '',
    [...(a.screenshots || []), ...((a.followups || []).flatMap(f => f.screenshots || []))].join('\n'),
    (a.followups || []).map(f => `[${f.date}] ${f.note || ''}`).join('\n'),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  for (let i = 0; i < rows.length; i++) {
    const a = data[i];
    const firstImg = (a.screenshots && a.screenshots[0]) || (a.followups && a.followups[0] && a.followups[0].screenshots && a.followups[0].screenshots[0]);
    if (firstImg) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 12 });
      if (ws[cellRef]) ws[cellRef].l = { Target: firstImg, Tooltip: '点击查看第一张图片' };
    }
  }
  ws['!cols'] = [{wch:5},{wch:14},{wch:8},{wch:20},{wch:14},{wch:12},{wch:30},{wch:11},{wch:10},{wch:11},{wch:10},{wch:11},{wch:30},{wch:50}];
  XLSX.utils.book_append_sheet(wb, ws, '本月售后汇总');
  XLSX.writeFile(wb, `售后汇总_${thisMonth}.xlsx`);
  toast(`✓ 已导出 ${data.length} 条`);
}

