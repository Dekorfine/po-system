// ============================================================
// 跟单团队工作台 · orders.js
// 催单 · 含批量催单、紧急告警 banner、供应商对账单
// ============================================================
// 依赖：core.js · utils.js
// ============================================================

// MODULE 1: 催单
// ============================================================
function renderOrders() {
  const body = document.getElementById('ordersBody');
  const card = document.getElementById('ordersCard');
  const q = (document.getElementById('oSearch').value || '').trim().toLowerCase();
  const fStatus = document.getElementById('oFilterStatus').value;
  const fSupplier = document.getElementById('oFilterSupplier').value;
  const fSite = document.getElementById('oFilterSite').value;
  const sortBy = document.getElementById('oSortBy').value;
  
  let list = ORDERS.filter(o => {
    if (q) {
      const t = [o.orderNo, o.product, o.supplier, o.notes, o._agent, o.site].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fSupplier && o.supplier !== fSupplier) return false;
    if (fSite && o.site !== fSite) return false;
    if (fStatus === 'active') return !['cancelled', 'arrived'].includes(o.status);
    if (fStatus === 'completed') return ['arrived', 'cancelled'].includes(o.status);
    if (fStatus === 'overdue') return getOrderEffStatus(o) === 'overdue';
    if (fStatus === 'all') return true;
    return o.status === fStatus;
  });
  
  // 排序
  if (sortBy === 'urgency') {
    list.sort((a, b) => {
      const sa = getOrderEffStatus(a), sb = getOrderEffStatus(b);
      const aIsCatch = !['cancelled','shipped','arrived'].includes(a.status);
      const bIsCatch = !['cancelled','shipped','arrived'].includes(b.status);
      if (aIsCatch !== bIsCatch) return aIsCatch ? -1 : 1;
      if (sa === 'overdue' && sb !== 'overdue') return -1;
      if (sb === 'overdue' && sa !== 'overdue') return 1;
      const da = a.nextFollow || a.promisedDate || '9999';
      const db = b.nextFollow || b.promisedDate || '9999';
      return da.localeCompare(db);
    });
  } else if (sortBy === 'promised_asc') {
    list.sort((a, b) => (a.promisedDate || '9999').localeCompare(b.promisedDate || '9999'));
  } else if (sortBy === 'order_date_desc') {
    list.sort((a, b) => (b.orderDate || '0000').localeCompare(a.orderDate || '0000'));
  }
  
  if (list.length === 0) {
    card.style.display = 'block';
    document.getElementById('ordersGroupedContainer')?.remove();
    body.innerHTML = `<div class="empty-state"><div class="icon">📋</div><div class="text">${ORDERS.length === 0 ? '还没有订单，点 "+ 新增订单" 开始记录催单' : '没有匹配的订单'}</div>${ORDERS.length === 0 ? '<button class="btn primary" onclick="addOrder()">+ 新增第一个订单</button>' : ''}</div>`;
    return;
  }
  
  // 按供应商分组视图
  if (sortBy === 'supplier_grouped') {
    card.style.display = 'none';
    let groupedCt = document.getElementById('ordersGroupedContainer');
    if (!groupedCt) {
      groupedCt = document.createElement('div');
      groupedCt.id = 'ordersGroupedContainer';
      card.parentNode.insertBefore(groupedCt, card);
    }
    
    // 按供应商分组
    const grouped = {};
    list.forEach(o => {
      const s = o.supplier || '未填供应商';
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(o);
    });
    // 按订单数倒序
    const sortedSuppliers = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);
    
    groupedCt.innerHTML = sortedSuppliers.map(sup => {
      const items = grouped[sup];
      const canChase = items.filter(o => !['cancelled','shipped','arrived'].includes(o.status));
      const overdueCount = items.filter(o => getOrderEffStatus(o) === 'overdue').length;
      const allMine = !IS_ADMIN; // 主管视角下不显示批量催单（因为可能跨多个跟单员）
      const totalChase = canChase.reduce((s, o) => s + (o.followups || []).filter(f => f.type === 'chase').length, 0);
      return `
        <div class="supplier-group">
          <div class="supplier-group-head">
            <div class="name">🏭 ${escapeHtml(sup)}
              <span class="count-badge">${items.length} 单</span>
              ${overdueCount > 0 ? `<span class="overdue-badge">🔴 ${overdueCount} 逾期</span>` : ''}
              ${canChase.length > 0 ? `<span class="count-badge" style="background: rgba(202,138,4,0.1); color: var(--warning);">${canChase.length} 待催</span>` : ''}
              ${totalChase > 0 ? `<span class="count-badge" style="background: rgba(190,24,93,0.1); color: var(--pink);">累计催 ${totalChase} 次</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              ${canChase.length > 0 ? `<button class="export-accounting-btn" onclick="exportSupplierAccounting('${sup.replace(/'/g, "\\'")}')" title="生成对账单 Excel 发给供应商">📋 导出对账单</button>` : ''}
              ${canChase.length > 0 && allMine ? `<button class="batch-chase-btn" onclick="openBatchChase('${sup.replace(/'/g, "\\'")}')">⚡ 批量催单</button>` : ''}
            </div>
          </div>
          <div class="supplier-group-body">
            ${items.map((o, i) => renderOrderRow(o, i)).join('')}
          </div>
        </div>
      `;
    }).join('');
    return;
  }
  
  // 普通列表视图
  document.getElementById('ordersGroupedContainer')?.remove();
  card.style.display = 'block';
  body.innerHTML = list.map((o, i) => renderOrderRow(o, i)).join('');
}

function renderOrderRow(o, i) {
  const eff = getOrderEffStatus(o);
  const fuCount = (o.followups || []).length;
  const chaseList = (o.followups || []).filter(f => f.type === 'chase');
  const chaseCount = chaseList.length;
  const allScreenshots = [...(o.screenshots || []), ...((o.followups || []).flatMap(f => f.screenshots || []))];
  const promisedCls = getDateClass(o.promisedDate);
  const related = hasRelatedAftersales(o);
  const siteBadge = o.site ? `<span class="site-badge s-${o.site}">${escapeHtml(o.site)}</span>` : '';
  const afterBadge = related && related.length > 0 ? `<span class="related-after-badge" title="该订单有 ${related.length} 个未解决的售后单">🔧 售后${related.length}</span>` : '';
  
  // 已 N 天（下单至今）
  const days = o.orderDate ? Math.floor((new Date() - new Date(o.orderDate)) / 86400000) : 0;
  const daysHtml = days > 0 ? `<div class="days-ago ${days >= 14 ? 'warn' : ''}">${days}天</div>` : '';
  
  // 缩略图（最多 3 张）
  const thumbsHtml = allScreenshots.length > 0 
    ? allScreenshots.slice(0, 3).map(s => 
        `<img src="${s}" class="after-thumb" onclick="event.stopPropagation(); viewImage('${s}')">`
      ).join('') + (allScreenshots.length > 3 ? `<span class="more-thumb">+${allScreenshots.length - 3}</span>` : '')
    : '<span class="no-img">无图</span>';
  
  // 催单历史框：展示每次催单的日期 + 最近一次的备注
  let chaseBoxHtml = '';
  if (chaseCount > 0) {
    const lastChase = chaseList[chaseList.length - 1];
    const chaseDates = chaseList.map(c => formatShortDate(c.date)).join(' · ');
    const chaseLevelCls = chaseCount >= 5 ? 'critical' : chaseCount >= 3 ? 'warning' : '';
    chaseBoxHtml = `
      <div class="chase-history ${chaseLevelCls}">
        <div class="chase-counts">🔥 已催 <b>${chaseCount}</b> 次 · ${chaseDates}</div>
        ${lastChase && lastChase.note ? `<div class="chase-last">📞 ${formatShortDate(lastChase.date)}: ${escapeHtml((lastChase.note || '').slice(0, 70))}${(lastChase.note || '').length > 70 ? '...' : ''}</div>` : ''}
      </div>
    `;
  }
  
  // 备注框
  const notesHtml = o.notes ? `<div class="detail-line">📝 ${escapeHtml(o.notes.slice(0, 80))}${o.notes.length > 80 ? '...' : ''}</div>` : '';
  
  // 日期：下单 / 承诺 / 下次 / 发货 / 到货
  const datesHtml = `
    ${o.orderDate ? `<div class="date-line"><span class="lbl">📅 下单</span>${formatShortDate(o.orderDate)}</div>` : ''}
    ${o.promisedDate ? `<div class="date-line ${promisedCls}"><span class="lbl">⏰ 承诺</span>${formatShortDate(o.promisedDate)}${eff === 'overdue' ? ' ⚠' : ''}</div>` : ''}
    ${o.nextFollow ? `<div class="date-line"><span class="lbl">📞 下次</span>${formatShortDate(o.nextFollow)}</div>` : ''}
    ${o.shippedDate ? `<div class="date-line"><span class="lbl resolved">📦 发货</span>${formatShortDate(o.shippedDate)}</div>` : ''}
    ${o.arrivedDate ? `<div class="date-line"><span class="lbl resolved">✓ 到货</span>${formatShortDate(o.arrivedDate)}</div>` : ''}
  `;
  
  return `
    <div class="record-row after-row s-${eff}" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">
      <div class="row-num">
        ${i + 1}
        ${IS_ADMIN && o._agent ? `<div style="font-size:9px;color:var(--text-tertiary);">${escapeHtml(o._agent.slice(0,2))}</div>` : ''}
        ${daysHtml}
      </div>
      <div><span class="status-pill s-${eff}">${ORDER_STATUS_LABELS[o.status] || '未知'}${eff === 'overdue' ? ' ⚠' : ''}</span></div>
      <div class="cell-main">
        <div class="order-line">
          <span class="order-no-big">${escapeHtml(o.orderNo || '⚠ 待填订单号')}</span>
          ${siteBadge}
          ${afterBadge}
        </div>
        <div class="product-line">📦 ${escapeHtml(o.product || '未填产品')}</div>
        <div class="supplier-line">🏭 ${escapeHtml(o.supplier || '未填供应商')}</div>
        ${notesHtml}
        ${chaseBoxHtml}
      </div>
      <div class="thumbs-cell">${thumbsHtml}</div>
      <div class="dates-cell">${datesHtml || '<span class="no-img">—</span>'}</div>
      <div class="row-actions">
        ${o.status !== 'arrived' ? `<button class="action-btn done" title="一键完成（${o.status === 'shipped' ? '已发货 → 已到货' : '标为已发货'}）" onclick="event.stopPropagation(); quickCompleteOrder('${o._id}', '${escapeHtml(o._agent || '')}')">✓</button>` : '<span style="width: 28px;"></span>'}
        <button class="followup-btn ${fuCount > 0 ? 'has-followups' : ''}" onclick="event.stopPropagation(); openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">${fuCount > 0 ? `📋${fuCount}` : '📋'}</button>
        <button class="action-btn delete" title="删除" onclick="event.stopPropagation(); delOrderRow('${o._id}', '${escapeHtml(o._agent || '')}')">🗑</button>
      </div>
    </div>
  `;
}

async function addOrder() {
  const me = CONFIG.agents.find(a => a.name === CURRENT_AGENT);
  const defaultSite = (me && me.sites && me.sites.length > 0) ? me.sites[0] : '';
  const newOrder = {
    _id: 'O' + Date.now() + Math.random().toString(36).slice(2, 6),
    orderNo: '', product: '', supplier: '',
    site: defaultSite,
    orderDate: new Date().toISOString().slice(0, 10),
    promisedDate: '', shippedDate: '', arrivedDate: '',
    status: 'pending', nextFollow: '', notes: '',
    screenshots: [], followups: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const arr = DATA.getOrders(CURRENT_AGENT);
  arr.unshift(newOrder);
  DATA.saveOrders(CURRENT_AGENT, arr);
  loadAllData();
  renderOrders();
  updateOrderStats();
  
  // 立即推送 + 等待 UUID 回填完成，避免 modal 拿到临时 ID
  try {
    await DATA.saveAndSyncOrders(CURRENT_AGENT);
  } catch (err) {
    console.error('新增订单同步失败:', err);
    toast('云端同步失败：' + (err.message || err), 'err');
  }
  
  // 此时 newOrder._id 已是真实 UUID
  openOrderModal(newOrder._id, CURRENT_AGENT);
}

// ============================================================
// 快捷筛选：点击统计卡片自动切到对应状态
// ============================================================
function quickFilterOrders(type) {
  const filter = document.getElementById('oFilterStatus');
  if (!filter) return;
  filter.value = type;
  renderOrders();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickFilterAfter(type) {
  const filter = document.getElementById('asFilterStatus');
  if (!filter) return;
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  
  // 特殊筛选用搜索框临时实现，或切对应选项
  if (type === 'thismonth') {
    // 显示本月新增
    filter.value = 'all';
    renderAftersales();
    toast('显示全部售后（本月新增已在统计中）');
    return;
  }
  if (type === 'today') {
    filter.value = 'all';
    renderAftersales();
    toast('显示全部售后');
    return;
  }
  if (type === 'overdue') {
    filter.value = 'active';
    renderAftersales();
    toast('显示未解决（含逾期）');
    return;
  }
  filter.value = type;
  renderAftersales();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickFilterIssues(type) {
  const filter = document.getElementById('isFilterStatus');
  if (!filter) return;
  
  if (type === 'stuck') {
    // 沟通 ≥3 次的未解决问题
    filter.value = 'active';
    renderIssues();
    toast('显示未解决问题（含沟通 3 次以上）');
    return;
  }
  filter.value = type;
  renderIssues();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickFilterMissing(type) {
  const filter = document.getElementById('mFilterStatus');
  const searchBox = document.getElementById('mSearch');
  if (!filter || !searchBox) return;
  
  if (type === 'mine') {
    filter.value = 'all';
    searchBox.value = CURRENT_AGENT;
    renderMissing();
    toast('显示「我发起的」找灯任务');
    return;
  }
  if (type === 'thismonth') {
    filter.value = 'all';
    searchBox.value = '';
    renderMissing();
    toast('显示全部任务（本月新增已在统计）');
    return;
  }
  searchBox.value = '';
  filter.value = type;
  renderMissing();
  toast(`已切换：${filter.options[filter.selectedIndex].text}`);
}

function quickGotoPerfDetail(type) {
  if (type === 'leaderboard') {
    // 滚动到团队排行榜
    const el = document.getElementById('perfLeaderboard');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('查看团队排行榜');
    }
    return;
  }
  if (type === 'missing') {
    // 滚动到找灯贡献明细
    const el = document.getElementById('perfMissingDetail');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('查看我的找灯贡献明细');
    }
    return;
  }
  if (type === 'orders') {
    switchTab('orders');
    setTimeout(() => {
      const search = document.getElementById('oSearch');
      const filter = document.getElementById('oFilterStatus');
      if (search && IS_ADMIN) search.value = CURRENT_AGENT;  // 主管视角下筛选自己
      if (filter) filter.value = 'active';
      renderOrders();
    }, 50);
    toast('查看我的订单');
    return;
  }
  if (type === 'aftersales') {
    switchTab('aftersales');
    setTimeout(() => {
      const search = document.getElementById('asSearch');
      const filter = document.getElementById('asFilterStatus');
      if (search && IS_ADMIN) search.value = CURRENT_AGENT;
      if (filter) filter.value = 'all';
      renderAftersales();
    }, 50);
    toast('查看我的售后');
    return;
  }
  if (type === 'issues') {
    switchTab('issues');
    setTimeout(() => {
      const search = document.getElementById('isSearch');
      const filter = document.getElementById('isFilterStatus');
      if (search && IS_ADMIN) search.value = CURRENT_AGENT;
      if (filter) filter.value = 'all';
      renderIssues();
    }, 50);
    toast('查看我的问题');
    return;
  }
}

async function quickCompleteOrder(id, agent) {
  const ownerAgent = agent || CURRENT_AGENT;
  const arr = DATA.getOrders(ownerAgent);
  const o = arr.find(x => x._id === id);
  if (!o) return;
  
  const today = new Date().toISOString().slice(0, 10);
  
  if (o.status === 'arrived') {
    toast('该订单已是「已到货」状态', 'warn');
    return;
  }
  
  let nextStatus, dateField, nextLabel, msg;
  if (o.status === 'shipped') {
    nextStatus = 'arrived';
    dateField = 'arrivedDate';
    nextLabel = '已到货';
    msg = `订单 ${o.orderNo || '(无单号)'} 已经收到货？\n\n会标记为：✓ 已到货\n到货日期：${today}`;
  } else {
    nextStatus = 'shipped';
    dateField = 'shippedDate';
    nextLabel = '已发货';
    msg = `订单 ${o.orderNo || '(无单号)'} 已经发货？\n\n会标记为：✓ 已发货\n发货日期：${today}\n\n(再点一次可标记为「已到货」)`;
  }
  
  if (!confirm(msg)) return;
  
  o.status = nextStatus;
  if (!o[dateField]) o[dateField] = today;
  o.updatedAt = new Date().toISOString();
  
  // 立即更新本地 cache + UI
  DATA._cache.ordersByAgent[ownerAgent] = arr;
  loadAllData();
  renderActiveTab();
  toast('正在同步到云端...', 'info', 8000);
  
  // 立即推送到云端（不等 debounce），避免刷新时看到旧数据
  try {
    DATA._cancelDebounce && DATA._cancelDebounce('orders_' + ownerAgent);
    await fullSyncOrders(ownerAgent);
    toast(`✓ 订单已标记「${nextLabel}」并已同步`);
  } catch (err) {
    console.error('同步失败:', err);
    toast('本地已更新，云端同步失败：' + (err.message || err), 'err');
  }
}

function delOrderRow(id, agent) {
  if (!confirm('确定删除这个订单？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  const ownerAgent = (IS_ADMIN && agent) ? agent : CURRENT_AGENT;
  const arr = DATA.getOrders(ownerAgent);
  const o = arr.find(x => x._id === id);
  if (!o) return;
  o.deletedAt = new Date().toISOString();
  o.deletedBy = CURRENT_AGENT;
  DATA.saveOrders(ownerAgent, arr);
  loadAllData();
  renderActiveTab();
  toast('已移入回收站');
}

function openOrderModal(id, agent) {
  // 找到原始数据（来自具体跟单员）
  const ownerAgent = agent || CURRENT_AGENT;
  const arr = DATA.getOrders(ownerAgent);
  const o = arr.find(x => x._id === id);
  if (!o) return;
  
  _currentItemId = id;
  _currentItemType = 'order';
  _newScreenshots_fu = [];
  _newScreenshots_orig = [];
  _currentFuType = 'chase';
  window._currentItemAgent = ownerAgent;
  
  refreshSiteDropdowns();
  document.getElementById('omSite').value = o.site || '';
  document.getElementById('omOrderNo').value = o.orderNo || '';
  document.getElementById('omProduct').value = o.product || '';
  document.getElementById('omSupplier').value = o.supplier || '';
  document.getElementById('omNotes').value = o.notes || '';
  document.getElementById('omOrderDate').value = o.orderDate || '';
  document.getElementById('omPromisedDate').value = o.promisedDate || '';
  document.getElementById('omNextFollow').value = o.nextFollow || '';
  document.getElementById('omNewDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('omNewNote').value = '';
  document.getElementById('omFuThumbs').innerHTML = '';
  document.querySelectorAll('#omTypeRow .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === 'chase'));
  updateOrderNoHint('omSite', 'omOrderNo', 'omOrderNoHint');
  
  renderOrderModalContent();
  document.getElementById('orderModal').classList.add('show');
}

function renderOrderModalContent() {
  const o = currentOrder();
  if (!o) return;
  const eff = getOrderEffStatus(o);
  document.getElementById('omHeader').innerHTML = `
    <div class="top">
      <div class="order-no">${escapeHtml(o.orderNo || '(未填订单号)')}</div>
      ${IS_ADMIN && window._currentItemAgent ? `<span style="font-size:11px;background:rgba(124,58,237,0.1);color:var(--purple);padding:2px 8px;border-radius:4px;font-weight:600;">👤 ${escapeHtml(window._currentItemAgent)}</span>` : ''}
      <div class="top-status"><span class="status-pill s-${eff}" style="display:inline-flex;padding:5px 12px;">${ORDER_STATUS_LABELS[o.status]}${eff === 'overdue' ? ' ⚠ 已逾期' : ''}</span></div>
    </div>
    <div class="meta">
      ${o.product ? `<span>📦 ${escapeHtml(o.product)}</span>` : ''}
      ${o.supplier ? `<span>🏭 ${escapeHtml(o.supplier)}</span>` : ''}
      ${o.notes ? `<span>📝 ${escapeHtml(o.notes)}</span>` : ''}
    </div>
  `;
  document.querySelectorAll('#orderModal .status-grid .status-pill').forEach(p => p.classList.toggle('selected', p.dataset.st === o.status));
  
  // 截图
  const origs = o.screenshots || [];
  document.getElementById('omOrigCount').textContent = `${origs.length} 张`;
  document.getElementById('omOrigThumbs').innerHTML = origs.map((s, i) => `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmOrderOrig(${i})" title="移除">×</button></div>`).join('');
  
  // 时间线
  const fu = o.followups || [];
  document.getElementById('omTimelineCount').textContent = `${fu.length} 条`;
  const tl = document.getElementById('omTimeline');
  if (fu.length === 0) {
    tl.innerHTML = '<div class="timeline-empty">还没有跟进记录</div>';
  } else {
    tl.innerHTML = fu.map((f, i) => `
      <div class="timeline-item">
        <div class="timeline-dot" style="background:var(--accent);">${i + 1}</div>
        <div class="timeline-content">
          <div class="timeline-meta"><span>📅 ${f.date} ${f.time || ''}</span><span class="timeline-type">${ORDER_TYPE_LABELS[f.type] || '其他'}</span></div>
          <div class="timeline-text">${escapeHtml(f.note || '')}</div>
          ${(f.screenshots && f.screenshots.length > 0) ? `<div class="timeline-screenshots">${f.screenshots.map(s => `<img src="${s}" class="screenshot-thumb" onclick="viewImage('${s}')">`).join('')}</div>` : ''}
          <div class="actions"><button class="del-btn" onclick="delOrderFollowup(${i})">删除</button></div>
        </div>
      </div>
    `).join('');
  }
}

function currentOrder() {
  if (!_currentItemId) return null;
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getOrders(agent);
  return arr.find(o => o._id === _currentItemId);
}

function persistCurrentOrder(updater, immediate = false) {
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getOrders(agent);
  const idx = arr.findIndex(o => o._id === _currentItemId);
  if (idx < 0) return;
  updater(arr[idx]);
  arr[idx].updatedAt = new Date().toISOString();
  DATA.saveOrders(agent, arr);
  loadAllData();
  if (immediate) {
    DATA.saveAndSyncOrders(agent).catch(err => { console.error(err); toast('同步失败:' + (err.message || err), 'err'); });
  }
}

function onOrderField(field, value) {
  persistCurrentOrder(o => {
    o[field] = value;
    if (field === 'promisedDate' && value && o.status === 'pending') o.status = 'producing';
  });
  if (field === 'site') updateOrderNoHint('omSite', 'omOrderNo', 'omOrderNoHint');
  renderOrderModalContent();
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
}

async function setOrderStatus(st) {
  persistCurrentOrder(o => {
    o.status = st;
    if (st === 'shipped' && !o.shippedDate) {
      o.shippedDate = new Date().toISOString().slice(0, 10);
    }
    if (st === 'arrived' && !o.arrivedDate) {
      o.arrivedDate = new Date().toISOString().slice(0, 10);
    }
  });
  renderOrderModalContent();
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
  // 立即推送云端，避免刷新看到旧状态
  const agent = window._currentItemAgent || CURRENT_AGENT;
  DATA._cancelDebounce('orders_' + agent);
  try { await fullSyncOrders(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

function deleteCurrentOrder() {
  if (!confirm('确定删除这个订单？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getOrders(agent);
  const o = arr.find(x => x._id === _currentItemId);
  if (!o) return;
  o.deletedAt = new Date().toISOString();
  o.deletedBy = CURRENT_AGENT;
  DATA.saveOrders(agent, arr);
  closeModal('orderModal');
  loadAllData();
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
  toast('已移入回收站');
}

function setOmFuType(t) {
  _currentFuType = t;
  document.querySelectorAll('#omTypeRow .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === t));
}

function addOrderFollowup() {
  const note = document.getElementById('omNewNote').value.trim();
  const date = document.getElementById('omNewDate').value || new Date().toISOString().slice(0, 10);
  if (!note && _newScreenshots_fu.length === 0) { toast('请输入跟进内容或上传截图', 'warn'); return; }
  
  persistCurrentOrder(o => {
    if (!o.followups) o.followups = [];
    o.followups.push({
      type: _currentFuType, date,
      time: new Date().toTimeString().slice(0, 5),
      note, screenshots: [..._newScreenshots_fu],
    });
    if (_currentFuType === 'ship' && ['pending','producing'].includes(o.status)) {
      o.status = 'shipped';
      if (!o.shippedDate) o.shippedDate = date;
    }
    if (_currentFuType === 'arrive' && o.status === 'shipped') {
      o.status = 'arrived';
      if (!o.arrivedDate) o.arrivedDate = date;
    }
  }, true);
  
  document.getElementById('omNewNote').value = '';
  document.getElementById('omFuThumbs').innerHTML = '';
  _newScreenshots_fu = [];
  renderOrderModalContent();
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
  toast(`✓ 已记录（${ORDER_TYPE_LABELS[_currentFuType]}）`);
}

function delOrderFollowup(idx) {
  if (!confirm('删除这条跟进？')) return;
  persistCurrentOrder(o => o.followups.splice(idx, 1), true);
  renderOrderModalContent();
  renderOrders();
  refreshOrdersFb();
}

function rmOrderOrig(i) {
  persistCurrentOrder(o => o.screenshots.splice(i, 1), true);
  renderOrderModalContent();
}

// 催单统计
function updateOrderStats() {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  let active = 0, producing = 0, shipped = 0, arrivedThisMonth = 0, overdue = 0, todayCount = 0;
  ORDERS.forEach(o => {
    const eff = getOrderEffStatus(o);
    if (!['cancelled'].includes(o.status)) {
      active++;
      if (o.status === 'producing') producing++;
      if (o.status === 'shipped') shipped++;
      if (eff === 'overdue') overdue++;
      if ((o.nextFollow === today) || (o.promisedDate === today && o.status === 'producing')) todayCount++;
    }
    if (o.arrivedDate && o.arrivedDate.startsWith(thisMonth)) arrivedThisMonth++;
  });
  document.getElementById('oActive').textContent = active;
  document.getElementById('oActiveSub').textContent = active > 0 ? '未取消' : '✓ 全部完成';
  document.getElementById('oProducing').textContent = producing;
  document.getElementById('oShipped').textContent = shipped;
  document.getElementById('oArrived').textContent = arrivedThisMonth;
  document.getElementById('oOverdue').textContent = overdue;
  document.getElementById('oToday').textContent = todayCount;
  document.getElementById('oUrgentSub').textContent = overdue > 0 ? '🔴 立即处理' : todayCount > 0 ? '🟡 今日跟进' : '✓ 无紧急';
  updateBadges();
  renderUrgentBanner();
}

// 催单 banner
function refreshOrdersFb() {
  const today = new Date().toISOString().slice(0, 10);
  const buckets = { overdue: [], today: [], upcoming: [] };
  ORDERS.forEach(o => {
    if (['cancelled','shipped','arrived'].includes(o.status)) return;
    const triggerDate = o.nextFollow || (o.status === 'producing' ? o.promisedDate : null);
    if (triggerDate) {
      if (triggerDate < today) buckets.overdue.push(o);
      else if (triggerDate === today) buckets.today.push(o);
      else buckets.upcoming.push(o);
    }
  });
  buckets.overdue.sort((a, b) => (a.nextFollow || a.promisedDate || '').localeCompare(b.nextFollow || b.promisedDate || ''));
  buckets.upcoming.sort((a, b) => (a.nextFollow || a.promisedDate || '').localeCompare(b.nextFollow || b.promisedDate || ''));
  
  document.getElementById('ordersFbOverdue').textContent = buckets.overdue.length;
  document.getElementById('ordersFbToday').textContent = buckets.today.length;
  document.getElementById('ordersFbUpcoming').textContent = buckets.upcoming.length;
  
  const total = new Set([...buckets.overdue, ...buckets.today, ...buckets.upcoming].map(o => o._id)).size;
  document.getElementById('ordersFbTotal').textContent = `共 ${total} 单`;
  
  const card = document.getElementById('ordersFb');
  if (!card.dataset.userToggled) {
    card.classList.toggle('collapsed', buckets.overdue.length === 0 && buckets.today.length === 0);
  }
  
  if (buckets[_ordersFbTab].length === 0) {
    for (const t of ['overdue','today','upcoming']) { if (buckets[t].length > 0) { _ordersFbTab = t; break; } }
  }
  document.querySelectorAll('#ordersFb .fb-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _ordersFbTab));
  
  const list = document.getElementById('ordersFbList');
  const items = buckets[_ordersFbTab];
  if (items.length === 0) {
    list.innerHTML = `<div class="fb-empty">✓ ${_ordersFbTab === 'overdue' ? '没有逾期订单' : _ordersFbTab === 'today' ? '今天没有要跟进的' : '没有未来跟进计划'}</div>`;
    return;
  }
  list.innerHTML = items.slice(0, 12).map(o => {
    const eff = getOrderEffStatus(o);
    const td = o.nextFollow || o.promisedDate || '';
    const days = diffDays(td);
    let label = formatShortDate(td), cls = '';
    if (td) {
      if (days < 0) { label = `逾期 ${-days} 天`; cls = 'overdue'; }
      else if (days === 0) { label = '今日'; cls = 'today'; }
      else { label = `${days} 天后`; cls = 'upcoming'; }
    }
    return `
      <div class="fb-item" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">
        <div class="dot" style="background:var(--status-${eff});"></div>
        <div class="order-no">${escapeHtml(o.orderNo || '—')}</div>
        <div class="product">${escapeHtml(o.product || '(无描述)')}${IS_ADMIN && o._agent ? ` · 👤${escapeHtml(o._agent)}` : ''}</div>
        <div class="badge">${ORDER_STATUS_LABELS[o.status]}</div>
        <div class="next ${cls}">${label}</div>
        <button class="action-btn">处理</button>
      </div>
    `;
  }).join('');
}

function switchOrdersFb(t) { _ordersFbTab = t; document.getElementById('ordersFb').classList.remove('collapsed'); refreshOrdersFb(); }

// ============ 🚨 紧急告警 Banner（橙/红预警订单）============
function renderUrgentBanner() {
  const banner = document.getElementById('urgentAlert');
  if (!banner) return;
  
  const urgent = ORDERS.filter(o => {
    const lvl = getOrderUrgencyLevel(o);
    return lvl === 'red' || lvl === 'orange';
  });
  
  if (urgent.length === 0) {
    banner.style.display = 'none';
    return;
  }
  
  banner.style.display = 'block';
  document.getElementById('urgentCount').textContent = urgent.length;
  
  const redCount = urgent.filter(o => getOrderUrgencyLevel(o) === 'red').length;
  const orangeCount = urgent.length - redCount;
  
  banner.classList.toggle('no-red', redCount === 0);
  
  let subtitle = '';
  if (redCount > 0) subtitle += `🔴 ${redCount} 严重预警 · `;
  if (orangeCount > 0) subtitle += `🟠 ${orangeCount} 警告 · `;
  subtitle += '逾期 + 多次催单未发货';
  if (IS_ADMIN) subtitle = '👑 主管视角 · ' + subtitle;
  document.getElementById('urgentSubtitle').textContent = subtitle;
  
  // 排序：红色优先，逾期天数倒序，催单次数倒序
  urgent.sort((a, b) => {
    const la = getOrderUrgencyLevel(a) === 'red' ? 0 : 1;
    const lb = getOrderUrgencyLevel(b) === 'red' ? 0 : 1;
    if (la !== lb) return la - lb;
    return (a.promisedDate || '9999').localeCompare(b.promisedDate || '9999');
  });
  
  const today = new Date().toISOString().slice(0, 10);
  const items = urgent.slice(0, 8).map(o => {
    const lvl = getOrderUrgencyLevel(o);
    const days = o.promisedDate ? Math.max(0, Math.floor((new Date(today) - new Date(o.promisedDate)) / 86400000)) : 0;
    const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
    const icon = lvl === 'red' ? '🔴' : '🟠';
    const ownerInfo = IS_ADMIN && o._agent ? ` · 👤 ${escapeHtml(o._agent)}` : '';
    return `
      <div class="urgent-item ${lvl}" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">
        <div class="level">${icon}</div>
        <div class="order">${escapeHtml(o.orderNo || '—')}</div>
        <div class="col-info">
          <div>${escapeHtml(o.product || '(无产品描述)')}</div>
          <div class="supplier">🏭 ${escapeHtml(o.supplier || '—')}${ownerInfo}</div>
        </div>
        <div class="col-date">承诺 ${formatShortDate(o.promisedDate)}</div>
        <div class="col-overdue">逾期 ${days} 天</div>
        <div class="col-chase">催 ${chaseCount} 次</div>
        <button class="escalate-btn" onclick="event.stopPropagation(); openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">处理</button>
      </div>
    `;
  }).join('');
  
  let html = items;
  if (urgent.length > 8) {
    html += `<div class="urgent-more">⚠ 还有 ${urgent.length - 8} 个紧急订单，请用「按供应商分组」视图查看完整列表</div>`;
  }
  document.getElementById('urgentList').innerHTML = html;
}

// ============ 📋 导出供应商对账单 ============
function exportSupplierAccounting(supplier) {
  // 找该供应商所有未发货订单（含所有跟单员的，主管视角下）
  const sourceOrders = IS_ADMIN ? DATA.getAllOrders() : DATA.getOrders(CURRENT_AGENT).map(o => ({...o, _agent: CURRENT_AGENT}));
  const orders = sourceOrders.filter(o => o.supplier === supplier && !['cancelled','shipped','arrived'].includes(o.status));
  
  if (orders.length === 0) { toast('该供应商没有待催的订单', 'warn'); return; }
  
  // 按下单日期排序（最早下单的在前，最该催）
  orders.sort((a, b) => (a.orderDate || '9999').localeCompare(b.orderDate || '9999'));
  
  const today = new Date().toISOString().slice(0, 10);
  const dateStr = today.replace(/-/g, '/');
  
  // 统计
  let totalOverdueDays = 0;
  let overdueCount = 0;
  let totalChase = 0;
  orders.forEach(o => {
    if (o.promisedDate && o.promisedDate < today) {
      const days = Math.floor((new Date(today) - new Date(o.promisedDate)) / 86400000);
      totalOverdueDays += days;
      overdueCount++;
    }
    totalChase += (o.followups || []).filter(f => f.type === 'chase').length;
  });
  const avgOverdue = overdueCount > 0 ? Math.round(totalOverdueDays / overdueCount) : 0;
  
  const headers = ['序号','订单号','产品 / SKU','下单日期','原承诺发货日','当前状态','已逾期(天)','已催次数','最后跟进','我方备注'];
  
  const rows = orders.map((o, i) => {
    const days = o.promisedDate && o.promisedDate < today ? Math.floor((new Date(today) - new Date(o.promisedDate)) / 86400000) : 0;
    const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
    const last = o.followups && o.followups.length > 0 ? o.followups[o.followups.length - 1] : null;
    return [
      i + 1, o.orderNo || '', o.product || '',
      o.orderDate || '', o.promisedDate || '',
      ORDER_STATUS_LABELS[o.status] || '',
      days > 0 ? days : '',
      chaseCount > 0 ? chaseCount : '',
      last ? `[${last.date}] ${last.note}` : '',
      o.notes || '',
    ];
  });
  
  // 构造工作表
  const wb = XLSX.utils.book_new();
  const data = [
    [`${supplier} - 滞留订单对账清单`],
    [`生成日期: ${dateStr}    共 ${orders.length} 单待发货    其中逾期 ${overdueCount} 单    平均逾期 ${avgOverdue} 天    累计催单 ${totalChase} 次`],
    [''],
    ['请贵司核对以下订单并尽快回复发货计划：'],
    [''],
    headers,
    ...rows,
    [''],
    ['说明：'],
    ['1. 以上订单均为我司已下采购单但贵司尚未发货的订单'],
    ['2. 「原承诺发货日」为贵司当初承诺的发货日期，请贵司确认'],
    ['3. 请于收到此表 3 个工作日内回复每单的最新发货计划'],
    ['4. 如有特殊情况，请及时与对接跟单员联系'],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // 合并标题
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: headers.length - 1 } },
    { s: { r: 6 + rows.length + 1, c: 0 }, e: { r: 6 + rows.length + 1, c: headers.length - 1 } },
    { s: { r: 6 + rows.length + 2, c: 0 }, e: { r: 6 + rows.length + 2, c: headers.length - 1 } },
    { s: { r: 6 + rows.length + 3, c: 0 }, e: { r: 6 + rows.length + 3, c: headers.length - 1 } },
    { s: { r: 6 + rows.length + 4, c: 0 }, e: { r: 6 + rows.length + 4, c: headers.length - 1 } },
    { s: { r: 6 + rows.length + 5, c: 0 }, e: { r: 6 + rows.length + 5, c: headers.length - 1 } },
  ];
  
  ws['!cols'] = [{wch:5},{wch:14},{wch:26},{wch:11},{wch:11},{wch:10},{wch:10},{wch:8},{wch:35},{wch:25}];
  
  XLSX.utils.book_append_sheet(wb, ws, supplier.slice(0, 30) || 'sheet');
  XLSX.writeFile(wb, `${supplier}_滞留订单对账_${today}.xlsx`);
  toast(`✓ 已导出 ${orders.length} 单对账清单`);
}

// ============ 批量催单 ============
let _bcSupplier = null;
let _bcType = 'chase';
let _bcScreenshots = [];
let _bcSelectedIds = new Set();

function openBatchChase(supplier) {
  _bcSupplier = supplier;
  _bcType = 'chase';
  _bcScreenshots = [];
  _bcSelectedIds = new Set();
  
  // 找该供应商所有未发货订单
  const myOrders = DATA.getOrders(CURRENT_AGENT);
  const items = myOrders.filter(o => o.supplier === supplier && !['cancelled','shipped','arrived'].includes(o.status));
  
  if (items.length === 0) { toast('该供应商没有待催的订单', 'warn'); return; }
  
  // 默认全选
  items.forEach(o => _bcSelectedIds.add(o._id));
  
  // 渲染
  document.getElementById('bcSupplierTitle').textContent = `供应商：${supplier} · ${items.length} 单待催`;
  document.getElementById('bcDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bcNote').value = '';
  document.getElementById('bcThumbs').innerHTML = '';
  document.querySelectorAll('#batchChaseModal .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === 'chase'));
  
  renderBcOrdersList(items);
  document.getElementById('batchChaseModal').classList.add('show');
}

function renderBcOrdersList(items) {
  const html = items.map(o => {
    const eff = getOrderEffStatus(o);
    const promisedCls = getDateClass(o.promisedDate);
    const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
    const checked = _bcSelectedIds.has(o._id);
    return `
      <div class="bc-order-item" onclick="bcToggle('${o._id}')">
        <input type="checkbox" ${checked ? 'checked' : ''} data-id="${o._id}" onclick="event.stopPropagation();" onchange="bcToggle('${o._id}')">
        <div class="order-no">${escapeHtml(o.orderNo || '—')}</div>
        <div class="product">${escapeHtml(o.product || '(无产品描述)')}</div>
        <div class="promised ${promisedCls}">${formatShortDate(o.promisedDate)}${eff === 'overdue' ? ' ⚠' : ''}</div>
        <div class="chase-count ${chaseCount >= 3 ? 'high' : ''}">已催${chaseCount}次</div>
      </div>
    `;
  }).join('');
  document.getElementById('bcOrdersList').innerHTML = html;
  updateBcCount();
}

function bcToggle(id) {
  if (_bcSelectedIds.has(id)) _bcSelectedIds.delete(id);
  else _bcSelectedIds.add(id);
  // 重新渲染（更新 checked 状态）
  const myOrders = DATA.getOrders(CURRENT_AGENT);
  const items = myOrders.filter(o => o.supplier === _bcSupplier && !['cancelled','shipped','arrived'].includes(o.status));
  renderBcOrdersList(items);
}

function bcSelectAll(yes) {
  const myOrders = DATA.getOrders(CURRENT_AGENT);
  const items = myOrders.filter(o => o.supplier === _bcSupplier && !['cancelled','shipped','arrived'].includes(o.status));
  if (yes) items.forEach(o => _bcSelectedIds.add(o._id));
  else _bcSelectedIds.clear();
  renderBcOrdersList(items);
}

function updateBcCount() {
  document.getElementById('bcSelectedCount').textContent = `已选 ${_bcSelectedIds.size} 单`;
}

function setBcType(t) {
  _bcType = t;
  document.querySelectorAll('#batchChaseModal .fu-type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === t));
}

async function saveBatchChase() {
  if (_bcSelectedIds.size === 0) { toast('请至少选 1 单', 'warn'); return; }
  const note = document.getElementById('bcNote').value.trim();
  const date = document.getElementById('bcDate').value || new Date().toISOString().slice(0, 10);
  if (!note && _bcScreenshots.length === 0) { toast('请输入催单内容或上传截图', 'warn'); return; }
  
  const arr = DATA.getOrders(CURRENT_AGENT);
  let count = 0;
  arr.forEach(o => {
    if (_bcSelectedIds.has(o._id)) {
      if (!o.followups) o.followups = [];
      o.followups.push({
        type: _bcType, date,
        time: new Date().toTimeString().slice(0, 5),
        note,
        screenshots: [..._bcScreenshots],
        _batch: true,
      });
      o.updatedAt = new Date().toISOString();
      count++;
    }
  });
  DATA.saveOrders(CURRENT_AGENT, arr);
  
  closeModal('batchChaseModal');
  loadAllData();
  renderOrders();
  updateOrderStats();
  refreshOrdersFb();
  toast(`✓ 已批量催单 ${count} 个订单`);
  // 立即同步云端
  try { await DATA.saveAndSyncOrders(CURRENT_AGENT); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

// ============ 批量催单截图（用 _pasteTarget 复用全局粘贴）============
function setupBatchChaseScreenshot() {
  const dz = document.getElementById('bcDropZone');
  const fi = document.getElementById('bcFileInput');
  if (!dz || !fi || dz.dataset.bound) return;
  dz.dataset.bound = '1';
  dz.addEventListener('click', e => { if (e.target.tagName !== 'A') fi.click(); });
  fi.addEventListener('change', e => handleBcFiles(e.target.files));
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); _pasteTarget = 'batch_chase'; });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); handleBcFiles(e.dataTransfer.files); });
  dz.addEventListener('mouseenter', () => { _pasteTarget = 'batch_chase'; });
}

async function handleBcFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) { toast(`${file.name} 不是图片`, 'err'); continue; }
    try {
      const dataURL = await compressImage(file);
      const url = await uploadScreenshotToStorage(dataURL);
      _bcScreenshots.push(url);
      renderBcThumbs();
    } catch (err) {
      console.error(err);
      toast('图片上传失败：' + (err.message || err), 'err');
    }
  }
}

function renderBcThumbs() {
  document.getElementById('bcThumbs').innerHTML = _bcScreenshots.map((s, i) => `
    <div class="drop-zone-thumb">
      <img src="${s}" onclick="viewImage('${s}')">
      <button class="rm" onclick="rmBcThumb(${i})">×</button>
    </div>
  `).join('');
}

function rmBcThumb(i) {
  _bcScreenshots.splice(i, 1);
  renderBcThumbs();
}

