// ============================================================
// 跟单团队工作台 · aftersales.js
// 售后
// ============================================================
// 依赖：core.js · utils.js
// ============================================================

// 售后快速筛选模式（叠加在 status filter 之上）
// 空字符串 = 无叠加；'thismonth' / 'today' / 'overdue' = 按对应维度过滤
let _aftersalesQuickMode = '';

// ============================================================
// MODULE 2: 售后
// ============================================================
function renderAftersales() {
  const body = document.getElementById('aftersalesBody');
  const q = (document.getElementById('asSearch').value || '').trim().toLowerCase();
  const fs = document.getElementById('asFilterStatus').value;
  const fSupp = document.getElementById('asFilterSupplier').value;
  const fSite = document.getElementById('asFilterSite').value;
  const fReason = document.getElementById('asFilterReason').value;
  
  let list = AFTERSALES.filter(a => {
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
    return;
  }
  
  body.innerHTML = list.map((a, i) => {
    const fuCount = (a.followups || []).length;
    const allScreenshots = [...(a.screenshots || []), ...((a.followups || []).flatMap(f => f.screenshots || []))];
    const lastFu = fuCount > 0 ? a.followups[fuCount - 1] : null;
    const siteBadge = a.site ? `<span class="site-badge s-${a.site}">${escapeHtml(a.site)}</span>` : '';
    
    // 已 N 天
    const days = a.createdDate ? Math.floor((new Date() - new Date(a.createdDate)) / 86400000) : 0;
    const daysHtml = days > 0 ? `<div class="days-ago ${days >= 7 ? 'warn' : ''}">${days} 天</div>` : '';
    
    // 缩略图（最多 3 张）
    const thumbsHtml = allScreenshots.length > 0 
      ? allScreenshots.slice(0, 3).map(s => 
          `<img src="${s}" class="after-thumb" onclick="event.stopPropagation(); viewImage('${s}')">`
        ).join('') + (allScreenshots.length > 3 ? `<span class="more-thumb">+${allScreenshots.length - 3}</span>` : '')
      : '<span class="no-img">无图</span>';
    
    // 最近跟进
    const lastFuHtml = lastFu ? `
      <div class="last-fu">
        <b>📞 ${formatShortDate(lastFu.date)}:</b> ${escapeHtml((lastFu.note || '').slice(0, 70))}${(lastFu.note || '').length > 70 ? '...' : ''}
      </div>` : '';
    
    const reasonHtml = a.reason 
      ? `<span class="reason-tag">⚠ ${escapeHtml(a.reason)}</span>`
      : '<span class="reason-tag empty">⚠ 未选原因</span>';
    
    return `
      <div class="record-row after-row s-${a.status}" onclick="openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}')">
        <div class="row-num">
          ${i + 1}
          ${IS_ADMIN && a._agent ? `<div style="font-size:9px;color:var(--text-tertiary);">${escapeHtml(a._agent.slice(0,2))}</div>` : ''}
          ${daysHtml}
        </div>
        <div><span class="status-pill s-${a.status}">${AFTER_STATUS_LABELS[a.status]}</span></div>
        <div class="cell-main">
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
  }).join('');
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

