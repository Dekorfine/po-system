// ============================================================
// 跟单团队工作台 · aftersales.js
// 售后
// ============================================================
// 依赖：core.js · utils.js
// ============================================================

// 售后快速筛选模式（叠加在 status filter 之上）
// 空字符串 = 无叠加；'thismonth' / 'today' / 'overdue' = 按对应维度过滤
let _aftersalesQuickMode = '';

// V5-2026-05-24: 售后阈值筛选 + 仅未处理 chip(跟催单一致的体验)
let _afterThresholdFilter = 0;   // 0=不限,>0=显示发起≥N天的
let _onlyUnhandled = false;       // 仅显示无任何 followups 的(没人跟进的)

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
    
    <span style="margin-left:auto; font-size: 11px; color: var(--text-tertiary);">
      未解决 <b style="color:#dc2626;">${activeSet.length}</b> · 待处理 <b style="color:#f59e0b;">${unhandledCnt}</b>
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
    // V5: 用了阈值/未处理筛选时,默认隐藏已解决/已取消的(否则不直观)
    if ((_afterThresholdFilter > 0 || _onlyUnhandled) && ['resolved','cancelled'].includes(a.status)) return false;
    
    if (q) {
      const t = [a.orderNo, a.product, a.supplier, a.reasonDetail, a._agent, a.site].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fSupp && a.supplier !== fSupp) return false;
    if (fSite && a.site !== fSite) return false;
    if (fReason && !(a.reason || '').startsWith(fReason)) return false;
    if (fs === 'active') return !['resolved','cancelled'].includes(a.status);
    if (fs === 'completed') return ['resolved','cancelled'].includes(a.status);
    if (fs === 'all') return true;
    return a.status === fs;
  });

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
    body.innerHTML = `<div class="empty-state"><div class="icon">🔧</div><div class="text">${AFTERSALES.length === 0 ? '还没有售后单，点 "+ 新增售后" 开始' : '没有匹配的售后单'}</div>${AFTERSALES.length === 0 ? '<button class="btn primary" onclick="addAftersales()">+ 新增第一个售后单</button>' : ''}</div>`;
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
  const renderRows = pageItems.map((a, i) => {
    // 还是用原本的渲染函数 - 把 i 替换成 startIdx + i 即可保持行号连续
    return _renderAftersaleRow(a, startIdx + i);
  }).join('');
  
  body.innerHTML = (list.length > _aftersalesPage.size ? paginationHtml : '') + 
                   renderRows +
                   (list.length > _aftersalesPage.size ? paginationHtml : '');
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

// V4-2026-05-24: 把原本 list.map 里那段长行渲染逻辑抽成函数,供分页调用
function _renderAftersaleRow(a, i) {
    const fuCount = (a.followups || []).length;
    
    // V4：图片拼装策略 — 分两个区域
    // ① 跟单手动上传的图（→ 右侧"截图"列：处理进度可视化）
    const manualScreenshots = [...(a.screenshots || []), ...((a.followups || []).flatMap(f => f.screenshots || []))];
    // ② 产品图：通过 orderNo 反查关联销售单/PO（→ 左侧"状态"列下方：识别产品）
    let productImages = _getRelatedOrderImages(a.orderNo);
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
               onclick="event.stopPropagation(); viewImageGallery(&quot;${galleryData}&quot;, 0)">
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
                     onclick="event.stopPropagation(); viewImageGallery(&quot;${galleryData}&quot;, ${idx + 1})"
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
             onclick="event.stopPropagation(); viewImageGallery(&quot;${galleryData}&quot;, 0)"
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
    
    const reasonHtml = a.reason 
      ? `<span class="reason-tag">⚠ ${escapeHtml(a.reason)}</span>`
      : '<span class="reason-tag empty">⚠ 未选原因</span>';
    
    return `
      <div class="record-row after-row s-${a.status}">
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
    reason: '', reasonDetail: '',
    createdDate: new Date().toISOString().slice(0, 10),
    status: 'pending', nextFollow: '', resolvedDate: '',
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
}

function renderAfterModalContent() {
  const a = currentAfter();
  if (!a) return;
  document.getElementById('asmHeader').innerHTML = `
    <div class="top">
      <div class="order-no">${escapeHtml(a.orderNo || '(未填订单号)')}</div>
      ${IS_ADMIN && window._currentItemAgent ? `<span style="font-size:11px;background:rgba(124,58,237,0.1);color:var(--purple);padding:2px 8px;border-radius:4px;font-weight:600;">👤 ${escapeHtml(window._currentItemAgent)}</span>` : ''}
      <div class="top-status"><span class="status-pill s-${a.status}" style="display:inline-flex;padding:5px 12px;">${AFTER_STATUS_LABELS[a.status]}</span></div>
    </div>
    <div class="meta">
      ${a.product ? `<span>📦 ${escapeHtml(a.product)}</span>` : ''}
      ${a.supplier ? `<span>🏭 ${escapeHtml(a.supplier)}</span>` : ''}
      ${a.reason ? `<span style="color:var(--pink);font-weight:600;">⚠ ${escapeHtml(a.reason)}</span>` : ''}
    </div>
  `;
  // 原因 + 状态
  const { main: mainReason, sub: subReason } = _parseReason(a.reason);
  document.querySelectorAll('#asmReasonGrid .status-pill').forEach(p => p.classList.toggle('selected', p.dataset.r === mainReason));
  document.querySelectorAll('#aftersalesModal .status-grid:not(#asmReasonGrid):not(#asmSubReasonGrid) .status-pill').forEach(p => p.classList.toggle('selected', p.dataset.st === a.status));
  
  // 子原因渲染
  const subWrap = document.getElementById('asmSubReasonWrap');
  const subGrid = document.getElementById('asmSubReasonGrid');
  if (subWrap && subGrid) {
    if (mainReason && REASON_TREE[mainReason] && REASON_TREE[mainReason].subs.length > 0) {
      subWrap.style.display = '';
      subGrid.innerHTML = REASON_TREE[mainReason].subs.map(s => {
        const esc = escapeHtml(s).replace(/'/g, '&#39;');
        const onclick = `setAfterSubReason('${s.replace(/'/g, "\\'")}')`;
        return `<div class="status-pill ${s === subReason ? 'selected' : ''}" data-sub="${esc}" onclick="${onclick}">${esc}</div>`;
      }).join('');
    } else {
      subWrap.style.display = 'none';
      subGrid.innerHTML = '';
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

async function setAfterReason(mainReason) {
  // 点主原因：保留主原因，清空子原因
  persistCurrentAfter(a => { a.reason = mainReason; });
  renderAfterModalContent();
  renderAftersales();
  renderAfterReport();
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('after_' + agent);
  try { await fullSyncAftersales(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function setAfterSubReason(subReason) {
  const a = currentAfter();
  if (!a) return;
  const main = _parseReason(a.reason).main;
  if (!main) { toast('请先选择主原因', 'warn'); return; }
  const newReason = subReason ? `${main} · ${subReason}` : main;
  persistCurrentAfter(x => { x.reason = newReason; });
  renderAfterModalContent();
  renderAftersales();
  renderAfterReport();
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('after_' + agent);
  try { await fullSyncAftersales(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
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
    card.classList.toggle('collapsed', buckets.overdue.length === 0 && buckets.today.length === 0);
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

// 本月汇总报表
function renderAfterReport() {
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
  
  const supEl = document.getElementById('reportBySupplier');
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
  
  const reasonEl = document.getElementById('reportByReason');
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

