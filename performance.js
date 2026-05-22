// ============================================================
// 跟单团队工作台 · performance.js
// 绩效统计 · 个人积分 + 团队对比 + 月度/年度汇总
// ============================================================
// 依赖：core.js（ORDERS, AFTERSALES, ISSUES, MISSING_LIGHTS）
// ============================================================

// ============================================================
// MODULE 5: 绩效统计
// ============================================================

// 根据时间窗口过滤
function getPeriodRange(period) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (period === 'month') {
    const start = today.slice(0, 7) + '-01';
    return { start, end: today, label: '本月（' + today.slice(0, 7) + '）' };
  }
  if (period === 'lastMonth') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const start = d.toISOString().slice(0, 10);
    const endD = new Date(now.getFullYear(), now.getMonth(), 0);
    const end = endD.toISOString().slice(0, 10);
    return { start, end, label: '上月（' + start.slice(0, 7) + '）' };
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
    return { start, end: today, label: `本季度（Q${q + 1}）` };
  }
  return { start: '2000-01-01', end: today, label: '累计' };
}

function inRange(date, range) {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= range.start && d <= range.end;
}

// 计算单个 agent 的得分
// ============ 视图切换 ============
let _perfView = 'score';
function switchPerfView(view) {
  _perfView = view;
  document.querySelectorAll('.perf-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.perf-view').forEach(v => v.style.display = v.dataset.view === view ? '' : 'none');
  
  if (view === 'score') {
    renderPerformance();
  } else if (view === 'monthly') {
    // 默认上月
    const monthInput = document.getElementById('monthlyMonth');
    if (!monthInput.value) {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      monthInput.value = d.toISOString().slice(0, 7);
    }
    renderMonthlySummary();
  } else if (view === 'yearly') {
    initYearlyView();
    renderYearlySummary();
  } else if (view === 'daily') {
    const dateInput = document.getElementById('dailyDate');
    if (!dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    // 主管能切换跟单员
    const agentSel = document.getElementById('dailyAgent');
    if (IS_ADMIN) {
      agentSel.style.display = '';
      const cur = agentSel.value;
      agentSel.innerHTML = '<option value="">全部跟单员</option>' +
        CONFIG.agents.filter(a => !a.isAdmin).map(a => `<option value="${escapeHtml(a.name)}" ${cur === a.name ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
    } else {
      agentSel.style.display = 'none';
    }
    renderDailyReport();
  }
}

function setDailyQuick(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  document.getElementById('dailyDate').value = d.toISOString().slice(0, 10);
  renderDailyReport();
}

// ============ 📋 日报 ============
function renderDailyReport() {
  const date = document.getElementById('dailyDate').value;
  if (!date) return;
  const filterAgent = IS_ADMIN ? (document.getElementById('dailyAgent').value || '') : CURRENT_AGENT;
  
  // 收集所有跟单员的数据（含已删除的，因为日报可能要看历史）
  // 但回收站里的不算 - 过滤掉 deletedAt
  const allOrders = IS_ADMIN ? DATA.getAllOrders().filter(o => !o.deletedAt) : DATA.getOrders(CURRENT_AGENT).filter(o => !o.deletedAt).map(o => ({ ...o, _agent: CURRENT_AGENT }));
  const allAfter = IS_ADMIN ? DATA.getAllAftersales().filter(a => !a.deletedAt) : DATA.getAftersales(CURRENT_AGENT).filter(a => !a.deletedAt).map(a => ({ ...a, _agent: CURRENT_AGENT }));
  const allIssues = IS_ADMIN ? DATA.getAllIssues().filter(i => !i.deletedAt) : DATA.getIssues(CURRENT_AGENT).filter(i => !i.deletedAt).map(i => ({ ...i, _agent: CURRENT_AGENT }));
  const allMissing = DATA.getMissingLights().filter(m => !m.deletedAt);
  
  // 按跟单员筛选（主管视角）
  const filterByAgent = (item) => {
    if (!filterAgent) return true;
    return item._agent === filterAgent || item.creator === filterAgent;
  };
  
  // 当天创建的
  const newOrders = allOrders.filter(o => (o.createdAt || '').startsWith(date) && filterByAgent(o));
  const newAfter = allAfter.filter(a => (a.createdAt || a.createdDate || '').startsWith(date) && filterByAgent(a));
  const newIssues = allIssues.filter(i => (i.createdAt || '').startsWith(date) && filterByAgent(i));
  const newMissing = allMissing.filter(m => (m.createdAt || '').startsWith(date) && filterByAgent(m));
  
  // 当天发生的跟进/沟通
  const orderFollowups = [];
  allOrders.forEach(o => {
    if (filterAgent && o._agent !== filterAgent) return;
    (o.followups || []).forEach(f => {
      if ((f.date || '').startsWith(date)) {
        orderFollowups.push({ order: o, fu: f });
      }
    });
  });
  const afterFollowups = [];
  allAfter.forEach(a => {
    if (filterAgent && a._agent !== filterAgent) return;
    (a.followups || []).forEach(f => {
      if ((f.date || '').startsWith(date)) {
        afterFollowups.push({ after: a, fu: f });
      }
    });
  });
  const issueFollowups = [];
  allIssues.forEach(i => {
    if (filterAgent && i._agent !== filterAgent) return;
    (i.followups || []).forEach(f => {
      if ((f.date || '').startsWith(date)) {
        issueFollowups.push({ issue: i, fu: f });
      }
    });
  });
  
  // 当天完成的
  const completedOrders = allOrders.filter(o => 
    ((o.arrivedDate || '').startsWith(date) || (o.shippedDate || '').startsWith(date)) && filterByAgent(o)
  );
  const completedAfter = allAfter.filter(a => (a.resolvedDate || '').startsWith(date) && filterByAgent(a));
  
  // 渲染
  const el = document.getElementById('dailyReportBody');
  const isToday = date === new Date().toISOString().slice(0, 10);
  const dateLabel = isToday ? '今天' : date;
  const agentLabel = filterAgent ? ` · ${escapeHtml(filterAgent)}` : (IS_ADMIN ? ' · 全员' : '');
  
  const totalActions = newOrders.length + newAfter.length + newIssues.length + newMissing.length + orderFollowups.length + afterFollowups.length + issueFollowups.length + completedOrders.length + completedAfter.length;
  
  if (totalActions === 0) {
    el.innerHTML = `
      <div style="background: var(--bg-card); padding: 40px; border-radius: 12px; text-align: center; border: 1px solid var(--border);">
        <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
        <div style="font-size: 14px; color: var(--text-secondary);">${dateLabel}${agentLabel} 没有工作记录</div>
      </div>
    `;
    return;
  }
  
  el.innerHTML = `
    <div style="background: linear-gradient(135deg, rgba(37,99,235,0.05), rgba(124,58,237,0.05)); padding: 20px 24px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 16px;">
      <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">📋 ${dateLabel} 工作汇总${agentLabel}</div>
      <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 4px; font-family: 'JetBrains Mono', monospace;">${date}</div>
    </div>
    
    <!-- 数据总览 -->
    <div class="stats-bar" style="margin-bottom: 18px;">
      <div class="stat-card"><div class="label">📋 新建催单</div><div class="value mono"><span>${newOrders.length}</span><span class="unit">单</span></div><div class="sub">今日录入</div></div>
      <div class="stat-card repairing"><div class="label">🔧 新建售后</div><div class="value mono"><span>${newAfter.length}</span><span class="unit">单</span></div><div class="sub">今日录入</div></div>
      <div class="stat-card purple"><div class="label">⚠ 新建问题</div><div class="value mono"><span>${newIssues.length}</span><span class="unit">项</span></div><div class="sub">今日录入</div></div>
      <div class="stat-card warning"><div class="label">🔍 新建找灯</div><div class="value mono"><span>${newMissing.length}</span><span class="unit">个</span></div><div class="sub">今日发起</div></div>
      <div class="stat-card success"><div class="label">✓ 完成订单</div><div class="value mono"><span>${completedOrders.length}</span><span class="unit">单</span></div><div class="sub">发货/到货</div></div>
    </div>
    
    <div class="stats-bar" style="margin-bottom: 18px;">
      <div class="stat-card"><div class="label">📞 催单跟进</div><div class="value mono"><span>${orderFollowups.length}</span><span class="unit">条</span></div><div class="sub">沟通记录</div></div>
      <div class="stat-card"><div class="label">📞 售后跟进</div><div class="value mono"><span>${afterFollowups.length}</span><span class="unit">条</span></div><div class="sub">处理记录</div></div>
      <div class="stat-card"><div class="label">📞 问题沟通</div><div class="value mono"><span>${issueFollowups.length}</span><span class="unit">条</span></div><div class="sub">沟通记录</div></div>
      <div class="stat-card success"><div class="label">✓ 解决售后</div><div class="value mono"><span>${completedAfter.length}</span><span class="unit">单</span></div><div class="sub">今日关闭</div></div>
    </div>
    
    ${newOrders.length > 0 ? `
      <div class="daily-section">
        <h3>📋 新建催单 (${newOrders.length})</h3>
        <div class="daily-list">${newOrders.map((o, i) => `
          <div class="daily-item" onclick="switchTab('orders'); setTimeout(() => openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono"><b>${escapeHtml(o.orderNo || '(待填单号)')}</b>${o.site ? ` <span class="site-badge s-${o.site}">${escapeHtml(o.site)}</span>` : ''}</span>
            <span class="daily-text">📦 ${escapeHtml(o.product || '—')} · 🏭 ${escapeHtml(o.supplier || '—')}</span>
            ${IS_ADMIN && o._agent ? `<span class="daily-agent">👤 ${escapeHtml(o._agent)}</span>` : ''}
            <span class="daily-status s-${getOrderEffStatus(o)}">${ORDER_STATUS_LABELS[o.status] || '—'}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${newAfter.length > 0 ? `
      <div class="daily-section">
        <h3>🔧 新建售后 (${newAfter.length})</h3>
        <div class="daily-list">${newAfter.map((a, i) => `
          <div class="daily-item" onclick="switchTab('aftersales'); setTimeout(() => openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono"><b>${escapeHtml(a.orderNo || '(无单号)')}</b>${a.site ? ` <span class="site-badge s-${a.site}">${escapeHtml(a.site)}</span>` : ''}</span>
            <span class="daily-text">${escapeHtml(a.reason || '—')} · 🏭 ${escapeHtml(a.supplier || '—')}</span>
            ${IS_ADMIN && a._agent ? `<span class="daily-agent">👤 ${escapeHtml(a._agent)}</span>` : ''}
            <span class="daily-status s-${a.status}">${AFTER_STATUS_LABELS[a.status] || '—'}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${newIssues.length > 0 ? `
      <div class="daily-section">
        <h3>⚠ 新建问题 (${newIssues.length})</h3>
        <div class="daily-list">${newIssues.map((it, i) => `
          <div class="daily-item" onclick="switchTab('issues'); setTimeout(() => openIssueModal('${it._id}', '${escapeHtml(it._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono">🏭 <b>${escapeHtml(it.supplier || '—')}</b></span>
            <span class="daily-text">${escapeHtml(it.issueType || '—')} · ${escapeHtml((it.requirement || '').slice(0, 50))}</span>
            ${IS_ADMIN && it._agent ? `<span class="daily-agent">👤 ${escapeHtml(it._agent)}</span>` : ''}
            <span class="daily-status s-${it.status}">${ISSUE_STATUS_LABELS[it.status] || '—'}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${newMissing.length > 0 ? `
      <div class="daily-section">
        <h3>🔍 新建找灯 (${newMissing.length})</h3>
        <div class="daily-list">${newMissing.map((m, i) => `
          <div class="daily-item" onclick="switchTab('missing'); setTimeout(() => openMissingModal('${m._id}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono">${escapeHtml((m.description || '(无描述)').slice(0, 30))}</span>
            <span class="daily-text">${escapeHtml(m.specs || '—')}</span>
            <span class="daily-agent">👤 ${escapeHtml(m.creator || '—')}</span>
            <span class="daily-status s-${m.status}">${MISSING_STATUS_LABELS[m.status] || '—'}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${completedOrders.length > 0 ? `
      <div class="daily-section">
        <h3>✓ 完成的订单 (${completedOrders.length})</h3>
        <div class="daily-list">${completedOrders.map((o, i) => `
          <div class="daily-item" onclick="switchTab('orders'); setTimeout(() => openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono"><b>${escapeHtml(o.orderNo || '(无单号)')}</b>${o.site ? ` <span class="site-badge s-${o.site}">${escapeHtml(o.site)}</span>` : ''}</span>
            <span class="daily-text">📦 ${escapeHtml(o.product || '—')} · 🏭 ${escapeHtml(o.supplier || '—')}</span>
            ${IS_ADMIN && o._agent ? `<span class="daily-agent">👤 ${escapeHtml(o._agent)}</span>` : ''}
            <span class="daily-status s-${o.status}">${ORDER_STATUS_LABELS[o.status] || '—'}${(o.arrivedDate || '').startsWith(date) ? ' (到货)' : (o.shippedDate || '').startsWith(date) ? ' (发货)' : ''}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${orderFollowups.length > 0 ? `
      <div class="daily-section">
        <h3>📞 催单跟进 (${orderFollowups.length})</h3>
        <div class="daily-list">${orderFollowups.map((x, i) => `
          <div class="daily-item compact" onclick="switchTab('orders'); setTimeout(() => openOrderModal('${x.order._id}', '${escapeHtml(x.order._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono"><b>${escapeHtml(x.order.orderNo || '(无单号)')}</b></span>
            <span class="daily-text">${ORDER_TYPE_LABELS[x.fu.type] || '其他'}: ${escapeHtml((x.fu.note || '').slice(0, 60))}</span>
            ${IS_ADMIN && x.order._agent ? `<span class="daily-agent">👤 ${escapeHtml(x.order._agent)}</span>` : ''}
            <span class="daily-time">${x.fu.time || ''}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${afterFollowups.length > 0 ? `
      <div class="daily-section">
        <h3>📞 售后跟进 (${afterFollowups.length})</h3>
        <div class="daily-list">${afterFollowups.map((x, i) => `
          <div class="daily-item compact" onclick="switchTab('aftersales'); setTimeout(() => openAfterModal('${x.after._id}', '${escapeHtml(x.after._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono"><b>${escapeHtml(x.after.orderNo || '(无单号)')}</b></span>
            <span class="daily-text">${escapeHtml((x.fu.note || '').slice(0, 60))}</span>
            ${IS_ADMIN && x.after._agent ? `<span class="daily-agent">👤 ${escapeHtml(x.after._agent)}</span>` : ''}
            <span class="daily-time">${x.fu.time || ''}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${issueFollowups.length > 0 ? `
      <div class="daily-section">
        <h3>📞 问题沟通 (${issueFollowups.length})</h3>
        <div class="daily-list">${issueFollowups.map((x, i) => `
          <div class="daily-item compact" onclick="switchTab('issues'); setTimeout(() => openIssueModal('${x.issue._id}', '${escapeHtml(x.issue._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono">🏭 <b>${escapeHtml(x.issue.supplier || '—')}</b></span>
            <span class="daily-text">${escapeHtml((x.fu.note || '').slice(0, 60))}</span>
            ${IS_ADMIN && x.issue._agent ? `<span class="daily-agent">👤 ${escapeHtml(x.issue._agent)}</span>` : ''}
            <span class="daily-time">${x.fu.time || ''}</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
    
    ${completedAfter.length > 0 ? `
      <div class="daily-section">
        <h3>✓ 解决的售后 (${completedAfter.length})</h3>
        <div class="daily-list">${completedAfter.map((a, i) => `
          <div class="daily-item" onclick="switchTab('aftersales'); setTimeout(() => openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}'), 200);">
            <span class="daily-num">${i + 1}</span>
            <span class="daily-mono"><b>${escapeHtml(a.orderNo || '(无单号)')}</b></span>
            <span class="daily-text">${escapeHtml(a.reason || '—')} · 🏭 ${escapeHtml(a.supplier || '—')}</span>
            ${IS_ADMIN && a._agent ? `<span class="daily-agent">👤 ${escapeHtml(a._agent)}</span>` : ''}
            <span class="daily-status s-resolved">已解决</span>
          </div>
        `).join('')}</div>
      </div>
    ` : ''}
  `;
}

function exportDailyReport() {
  const date = document.getElementById('dailyDate').value;
  if (!date) { toast('请选择日期', 'warn'); return; }
  const filterAgent = IS_ADMIN ? (document.getElementById('dailyAgent').value || '') : CURRENT_AGENT;
  
  const allOrders = IS_ADMIN ? DATA.getAllOrders().filter(o => !o.deletedAt) : DATA.getOrders(CURRENT_AGENT).filter(o => !o.deletedAt).map(o => ({ ...o, _agent: CURRENT_AGENT }));
  const allAfter = IS_ADMIN ? DATA.getAllAftersales().filter(a => !a.deletedAt) : DATA.getAftersales(CURRENT_AGENT).filter(a => !a.deletedAt).map(a => ({ ...a, _agent: CURRENT_AGENT }));
  const allIssues = IS_ADMIN ? DATA.getAllIssues().filter(i => !i.deletedAt) : DATA.getIssues(CURRENT_AGENT).filter(i => !i.deletedAt).map(i => ({ ...i, _agent: CURRENT_AGENT }));
  
  const filterByAgent = (item) => !filterAgent || item._agent === filterAgent || item.creator === filterAgent;
  
  const newOrders = allOrders.filter(o => (o.createdAt || '').startsWith(date) && filterByAgent(o));
  const newAfter = allAfter.filter(a => (a.createdAt || '').startsWith(date) && filterByAgent(a));
  const newIssues = allIssues.filter(i => (i.createdAt || '').startsWith(date) && filterByAgent(i));
  
  const wb = XLSX.utils.book_new();
  
  if (newOrders.length > 0) {
    const headers = ['#','订单号','网站','产品','供应商','状态','跟单员','创建时间'];
    const rows = newOrders.map((o, i) => [i+1, o.orderNo||'', o.site||'', o.product||'', o.supplier||'', ORDER_STATUS_LABELS[o.status]||'', o._agent||'', (o.createdAt||'').slice(0,16).replace('T',' ')]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, '新建催单');
  }
  if (newAfter.length > 0) {
    const headers = ['#','订单号','网站','产品','供应商','原因','状态','跟单员','创建时间'];
    const rows = newAfter.map((a, i) => [i+1, a.orderNo||'', a.site||'', a.product||'', a.supplier||'', a.reason||'', AFTER_STATUS_LABELS[a.status]||'', a._agent||'', (a.createdAt||'').slice(0,16).replace('T',' ')]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, '新建售后');
  }
  if (newIssues.length > 0) {
    const headers = ['#','供应商','类型','要求','状态','跟单员','创建时间'];
    const rows = newIssues.map((it, i) => [i+1, it.supplier||'', it.issueType||'', it.requirement||'', ISSUE_STATUS_LABELS[it.status]||'', it._agent||'', (it.createdAt||'').slice(0,16).replace('T',' ')]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, '新建问题');
  }
  
  if (wb.SheetNames.length === 0) { toast('该日期没有数据', 'warn'); return; }
  XLSX.writeFile(wb, `日报_${date}${filterAgent ? '_' + filterAgent : ''}.xlsx`);
  toast(`✓ 已导出日报`);
}

function setMonthlyQuick(offset) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  document.getElementById('monthlyMonth').value = d.toISOString().slice(0, 7);
  renderMonthlySummary();
}

// ============ 📅 月度回顾 ============
function renderMonthlySummary() {
  const month = document.getElementById('monthlyMonth').value;
  if (!month) return;
  
  const monthStart = month + '-01';
  // 当月结束日
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
  const todayStr = new Date().toISOString().slice(0, 10);
  
  // 当月范围内的数据
  const isInMonth = (date) => date && date >= monthStart && date <= monthEnd;
  const isCreatedInMonth = (o) => isInMonth((o.createdAt || '').slice(0, 10));
  
  // 1. 本月新增统计
  const monthlyOrders = ORDERS.filter(o => isCreatedInMonth(o) || isInMonth(o.orderDate));
  const monthlyAfter = AFTERSALES.filter(a => isInMonth(a.createdDate));
  const monthlyIssues = ISSUES.filter(i => isCreatedInMonth(i));
  const monthlyMissing = MISSING_LIGHTS.filter(m => isCreatedInMonth(m));
  
  // 完成统计
  const ordersCompleted = monthlyOrders.filter(o => ['shipped','arrived'].includes(o.status) && isInMonth(o.shippedDate || o.arrivedDate));
  const afterResolved = monthlyAfter.filter(a => a.status === 'resolved' && isInMonth(a.resolvedDate));
  const issuesResolved = monthlyIssues.filter(i => i.status === 'resolved');
  const missingFound = monthlyMissing.filter(m => m.status === 'found');
  
  document.getElementById('mNewOrders').textContent = monthlyOrders.length;
  document.getElementById('mNewOrdersSub').textContent = `已发货 ${ordersCompleted.length}`;
  document.getElementById('mNewAfter').textContent = monthlyAfter.length;
  document.getElementById('mNewAfterSub').textContent = `已解决 ${afterResolved.length}`;
  document.getElementById('mNewIssues').textContent = monthlyIssues.length;
  document.getElementById('mNewIssuesSub').textContent = `已解决 ${issuesResolved.length}`;
  document.getElementById('mNewMissing').textContent = monthlyMissing.length;
  document.getElementById('mNewMissingSub').textContent = `已找到 ${missingFound.length}`;
  
  // 2. 月末未完成清单（截至 monthEnd 或今天，看哪个早）
  const cutoffDate = monthEnd < todayStr ? monthEnd : todayStr;
  
  // 催单：在 cutoffDate 之前下单，但当时还没发货
  const ordersPending = ORDERS.filter(o => {
    const orderDate = o.orderDate || (o.createdAt || '').slice(0, 10);
    if (!orderDate || orderDate > cutoffDate) return false;
    // 截止日还没发货
    const shipDate = o.shippedDate;
    return !shipDate || shipDate > cutoffDate;
  }).filter(o => !['cancelled'].includes(o.status));
  
  // 售后：在 cutoffDate 前发起，但当时还没解决
  const afterPending = AFTERSALES.filter(a => {
    const createdDate = a.createdDate || (a.createdAt || '').slice(0, 10);
    if (!createdDate || createdDate > cutoffDate) return false;
    const resolveDate = a.resolvedDate;
    return !resolveDate || resolveDate > cutoffDate;
  }).filter(a => !['cancelled'].includes(a.status));
  
  // 供应商问题：当月新增 + 还未解决
  const issuesPending = ISSUES.filter(i => {
    const createdDate = (i.createdAt || '').slice(0, 10);
    if (!createdDate || createdDate > cutoffDate) return false;
    return i.status !== 'resolved';
  });
  
  // 找灯：当月新增 + 还在搜寻
  const missingPending = MISSING_LIGHTS.filter(m => {
    const createdDate = (m.createdAt || '').slice(0, 10);
    if (!createdDate || createdDate > cutoffDate) return false;
    return m.status === 'searching';
  });
  
  // 3. 按跟单员分组工作量
  const workload = {};
  CONFIG.agents.forEach(a => {
    if (!a.isAdmin) workload[a.name] = { orders: 0, after: 0, issues: 0, missing: 0, completed: 0 };
  });
  monthlyOrders.forEach(o => { if (workload[o._agent]) workload[o._agent].orders++; });
  monthlyAfter.forEach(a => { if (workload[a._agent]) workload[a._agent].after++; });
  monthlyIssues.forEach(i => { if (workload[i._agent]) workload[i._agent].issues++; });
  monthlyMissing.forEach(m => { if (workload[m.creator]) workload[m.creator].missing++; });
  ordersCompleted.forEach(o => { if (workload[o._agent]) workload[o._agent].completed++; });
  
  // 渲染未完成清单 + 工作量
  const body = document.getElementById('monthlySummaryBody');
  body.innerHTML = `
    <h3 style="margin: 14px 0 8px 0; font-size: 15px; color: var(--text-primary);">⚠ 截至月末（${cutoffDate}）未完成的事项</h3>
    
    ${renderSummaryOrdersSection(ordersPending, cutoffDate)}
    ${renderSummaryAfterSection(afterPending, cutoffDate)}
    ${renderSummaryIssuesSection(issuesPending)}
    ${renderSummaryMissingSection(missingPending)}
    
    <h3 style="margin: 24px 0 8px 0; font-size: 15px; color: var(--text-primary);">👥 ${month.replace('-', ' 年 ')} 月 · 跟单员工作量</h3>
    <div class="workload-grid">
      ${Object.entries(workload).map(([name, w]) => `
        <div class="workload-card">
          <div class="name">${escapeHtml(name)}<span style="font-size:11px;color:var(--text-tertiary);font-weight:normal;">${w.orders + w.after + w.issues + w.missing} 项</span></div>
          <div class="stats">
            <span class="stat-item">📋 <b>${w.orders}</b></span>
            <span class="stat-item">✓ <b>${w.completed}</b></span>
            <span class="stat-item">🔧 <b>${w.after}</b></span>
            <span class="stat-item">⚠ <b>${w.issues}</b></span>
            <span class="stat-item">🔍 <b>${w.missing}</b></span>
          </div>
        </div>
      `).join('') || '<div class="summary-empty">本月暂无跟单员活动</div>'}
    </div>
  `;
}

function renderSummaryOrdersSection(orders, cutoffDate) {
  const cls = orders.length > 0 ? 'danger' : 'success';
  let rowsHtml;
  if (orders.length === 0) {
    rowsHtml = '<div class="summary-empty">✓ 太棒了，本月催单全部按时处理完成！</div>';
  } else {
    // 按逾期严重程度排序
    orders.sort((a, b) => (a.promisedDate || '9999').localeCompare(b.promisedDate || '9999'));
    rowsHtml = orders.slice(0, 30).map(o => {
      const days = o.promisedDate && o.promisedDate < cutoffDate
        ? Math.floor((new Date(cutoffDate) - new Date(o.promisedDate)) / 86400000) : 0;
      const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
      const siteBadge = o.site ? `<span class="site-badge s-${o.site}" style="margin-left:6px;">${escapeHtml(o.site)}</span>` : '';
      return `
        <div class="summary-row" onclick="openOrderModal('${o._id}', '${escapeHtml(o._agent || '')}')">
          <div class="order-no">${escapeHtml(o.orderNo || '—')}${siteBadge}</div>
          <div>
            <div>${escapeHtml(o.product || '—')}</div>
            <div class="meta">🏭 ${escapeHtml(o.supplier || '—')}${IS_ADMIN ? ' · 👤 ' + escapeHtml(o._agent || '') : ''}</div>
          </div>
          <div class="meta">承诺 ${o.promisedDate || '—'}</div>
          <div class="meta" style="color:${days > 7 ? 'var(--danger)' : days > 0 ? 'var(--warning)' : 'var(--text-secondary)'};">${days > 0 ? '逾期 ' + days + ' 天' : '—'}</div>
          <div class="meta" style="text-align:right;">已催 ${chaseCount} 次</div>
        </div>
      `;
    }).join('');
    if (orders.length > 30) rowsHtml += `<div class="summary-empty">还有 ${orders.length - 30} 单未显示</div>`;
  }
  return `
    <div class="summary-section">
      <div class="head">
        <div class="title">🔴 催单未完成（应发货但未发货）<span class="count ${cls}">${orders.length} 单</span></div>
      </div>
      ${rowsHtml}
    </div>
  `;
}

function renderSummaryAfterSection(list, cutoffDate) {
  const cls = list.length > 0 ? 'warning' : 'success';
  let rowsHtml;
  if (list.length === 0) {
    rowsHtml = '<div class="summary-empty">✓ 本月售后单全部按时处理完成</div>';
  } else {
    list.sort((a, b) => (a.createdDate || '9999').localeCompare(b.createdDate || '9999'));
    rowsHtml = list.slice(0, 30).map(a => {
      const days = a.createdDate ? Math.floor((new Date(cutoffDate) - new Date(a.createdDate)) / 86400000) : 0;
      const siteBadge = a.site ? `<span class="site-badge s-${a.site}" style="margin-left:6px;">${escapeHtml(a.site)}</span>` : '';
      return `
        <div class="summary-row" onclick="openAfterModal('${a._id}', '${escapeHtml(a._agent || '')}')">
          <div class="order-no">${escapeHtml(a.orderNo || '—')}${siteBadge}</div>
          <div>
            <div>${escapeHtml(a.reason || '—')} · ${escapeHtml(a.product || '—')}</div>
            <div class="meta">🏭 ${escapeHtml(a.supplier || '—')}${IS_ADMIN ? ' · 👤 ' + escapeHtml(a._agent || '') : ''}</div>
          </div>
          <div class="meta">发起 ${a.createdDate || '—'}</div>
          <div class="meta">${AFTER_STATUS_LABELS[a.status] || a.status}</div>
          <div class="meta" style="text-align:right;">已 ${days} 天</div>
        </div>
      `;
    }).join('');
    if (list.length > 30) rowsHtml += `<div class="summary-empty">还有 ${list.length - 30} 单未显示</div>`;
  }
  return `
    <div class="summary-section">
      <div class="head">
        <div class="title">🟠 售后未解决<span class="count ${cls}">${list.length} 单</span></div>
      </div>
      ${rowsHtml}
    </div>
  `;
}

function renderSummaryIssuesSection(list) {
  const cls = list.length > 0 ? 'warning' : 'success';
  let rowsHtml;
  if (list.length === 0) {
    rowsHtml = '<div class="summary-empty">✓ 本月供应商问题全部已解决</div>';
  } else {
    rowsHtml = list.slice(0, 30).map(i => `
      <div class="summary-row" onclick="openIssueModal('${i._id}', '${escapeHtml(i._agent || '')}')">
        <div class="order-no">${escapeHtml(i.supplier || '—')}</div>
        <div>
          <div>${escapeHtml(i.issueType || '—')}</div>
          <div class="meta">${escapeHtml((i.requirement || '').slice(0, 40))}${IS_ADMIN ? ' · 👤 ' + escapeHtml(i._agent || '') : ''}</div>
        </div>
        <div class="meta">${(i.createdAt || '').slice(0, 10)}</div>
        <div class="meta">${i.status === 'escalated' ? '🚨 已升级' : '处理中'}</div>
        <div class="meta" style="text-align:right;">${(i.followups || []).length} 次沟通</div>
      </div>
    `).join('');
    if (list.length > 30) rowsHtml += `<div class="summary-empty">还有 ${list.length - 30} 个未显示</div>`;
  }
  return `
    <div class="summary-section">
      <div class="head">
        <div class="title">🟡 供应商问题未解决<span class="count ${cls}">${list.length} 项</span></div>
      </div>
      ${rowsHtml}
    </div>
  `;
}

function renderSummaryMissingSection(list) {
  const cls = list.length > 0 ? 'warning' : 'success';
  let rowsHtml;
  if (list.length === 0) {
    rowsHtml = '<div class="summary-empty">✓ 本月找灯任务全部已找到</div>';
  } else {
    rowsHtml = list.slice(0, 20).map(m => `
      <div class="summary-row" onclick="openMissingModal('${m._id}')">
        <div class="order-no">🔍</div>
        <div>
          <div>${escapeHtml((m.description || '(无描述)').slice(0, 50))}</div>
          <div class="meta">${m.specs ? '📏 ' + escapeHtml(m.specs.slice(0, 30)) : ''}</div>
        </div>
        <div class="meta">${(m.createdAt || '').slice(0, 10)}</div>
        <div class="meta">👤 ${escapeHtml(m.creator || '')}</div>
        <div class="meta" style="text-align:right;">${(m.comments || []).length} 条建议</div>
      </div>
    `).join('');
    if (list.length > 20) rowsHtml += `<div class="summary-empty">还有 ${list.length - 20} 个未显示</div>`;
  }
  return `
    <div class="summary-section">
      <div class="head">
        <div class="title">🟢 找灯任务搜寻中<span class="count ${cls}">${list.length} 个</span></div>
      </div>
      ${rowsHtml}
    </div>
  `;
}

function exportMonthlySummary() {
  const month = document.getElementById('monthlyMonth').value;
  if (!month) return;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthStart = month + '-01';
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
  const todayStr = new Date().toISOString().slice(0, 10);
  const cutoffDate = monthEnd < todayStr ? monthEnd : todayStr;
  
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: 概览
  const isInMonth = d => d && d >= monthStart && d <= monthEnd;
  const monthlyOrders = ORDERS.filter(o => isInMonth((o.createdAt || '').slice(0, 10)) || isInMonth(o.orderDate));
  const monthlyAfter = AFTERSALES.filter(a => isInMonth(a.createdDate));
  const monthlyIssues = ISSUES.filter(i => isInMonth((i.createdAt || '').slice(0, 10)));
  const monthlyMissing = MISSING_LIGHTS.filter(M => isInMonth((M.createdAt || '').slice(0, 10)));
  
  const overview = [
    [`${month} 月度报告`],
    [`生成日期: ${todayStr}`],
    [],
    ['指标', '数量', '完成', '说明'],
    ['本月新增订单', monthlyOrders.length, monthlyOrders.filter(o => ['shipped','arrived'].includes(o.status)).length, ''],
    ['本月新增售后', monthlyAfter.length, monthlyAfter.filter(a => a.status === 'resolved').length, ''],
    ['本月新增问题', monthlyIssues.length, monthlyIssues.filter(i => i.status === 'resolved').length, ''],
    ['本月找灯任务', monthlyMissing.length, monthlyMissing.filter(m => m.status === 'found').length, ''],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(overview);
  ws1['!merges'] = [{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}}];
  ws1['!cols'] = [{wch:24},{wch:12},{wch:12},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws1, '概览');
  
  // Sheet 2: 未完成催单
  const ordersPending = ORDERS.filter(o => {
    const od = o.orderDate || (o.createdAt || '').slice(0, 10);
    if (!od || od > cutoffDate) return false;
    return (!o.shippedDate || o.shippedDate > cutoffDate) && !['cancelled'].includes(o.status);
  });
  const ordersData = [
    ['订单号', '网站', '产品', '供应商', '下单日', '承诺日', '逾期天数', '已催次数', '跟单员']
  ].concat(ordersPending.map(o => {
    const days = o.promisedDate && o.promisedDate < cutoffDate
      ? Math.floor((new Date(cutoffDate) - new Date(o.promisedDate)) / 86400000) : 0;
    return [o.orderNo, o.site, o.product, o.supplier, o.orderDate, o.promisedDate, days > 0 ? days : '',
      (o.followups || []).filter(f => f.type === 'chase').length, o._agent];
  }));
  const ws2 = XLSX.utils.aoa_to_sheet(ordersData);
  ws2['!cols'] = [{wch:14},{wch:8},{wch:24},{wch:18},{wch:11},{wch:11},{wch:10},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws2, '未完成催单');
  
  // Sheet 3: 未解决售后
  const afterPending = AFTERSALES.filter(a => {
    const cd = a.createdDate || (a.createdAt || '').slice(0, 10);
    if (!cd || cd > cutoffDate) return false;
    return (!a.resolvedDate || a.resolvedDate > cutoffDate) && !['cancelled'].includes(a.status);
  });
  const afterData = [
    ['订单号', '网站', '产品', '供应商', '原因', '详情', '发起日', '状态', '跟单员']
  ].concat(afterPending.map(a => [a.orderNo, a.site, a.product, a.supplier, a.reason,
    a.reasonDetail, a.createdDate, AFTER_STATUS_LABELS[a.status], a._agent]));
  const ws3 = XLSX.utils.aoa_to_sheet(afterData);
  ws3['!cols'] = [{wch:14},{wch:8},{wch:20},{wch:18},{wch:12},{wch:30},{wch:11},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws3, '未解决售后');
  
  XLSX.writeFile(wb, `跟单月报_${month}.xlsx`);
  toast(`✓ 已导出 ${month} 月报`);
}

// ============ 📆 年度汇总 ============
function initYearlyView() {
  const sel = document.getElementById('yearlyYear');
  if (sel.options.length > 0) return;
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= thisYear - 3; y--) {
    sel.innerHTML += `<option value="${y}">${y} 年</option>`;
  }
}

function renderYearlySummary() {
  const year = document.getElementById('yearlyYear').value;
  if (!year) return;
  
  // 按月统计
  const monthly = Array.from({ length: 12 }, () => ({ orders: 0, after: 0, issues: 0, missing: 0, completed: 0 }));
  ORDERS.forEach(o => {
    const date = o.orderDate || (o.createdAt || '').slice(0, 10);
    if (!date || !date.startsWith(year)) return;
    const m = parseInt(date.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) {
      monthly[m].orders++;
      if (['shipped','arrived'].includes(o.status)) monthly[m].completed++;
    }
  });
  AFTERSALES.forEach(a => {
    const date = a.createdDate;
    if (!date || !date.startsWith(year)) return;
    const m = parseInt(date.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) monthly[m].after++;
  });
  ISSUES.forEach(i => {
    const date = (i.createdAt || '').slice(0, 10);
    if (!date.startsWith(year)) return;
    const m = parseInt(date.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) monthly[m].issues++;
  });
  MISSING_LIGHTS.forEach(M => {
    const date = (M.createdAt || '').slice(0, 10);
    if (!date.startsWith(year)) return;
    const m = parseInt(date.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) monthly[m].missing++;
  });
  
  // 全年合计
  const totals = monthly.reduce((acc, m) => ({
    orders: acc.orders + m.orders,
    completed: acc.completed + m.completed,
    after: acc.after + m.after,
    issues: acc.issues + m.issues,
    missing: acc.missing + m.missing,
  }), { orders: 0, completed: 0, after: 0, issues: 0, missing: 0 });
  
  // Top 供应商
  const supplierCount = {};
  ORDERS.forEach(o => {
    const date = o.orderDate || (o.createdAt || '').slice(0, 10);
    if (!date.startsWith(year) || !o.supplier) return;
    supplierCount[o.supplier] = (supplierCount[o.supplier] || 0) + 1;
  });
  const topSuppliers = Object.entries(supplierCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  
  // 售后原因 Top
  const reasonCount = {};
  AFTERSALES.forEach(a => {
    if (!a.createdDate || !a.createdDate.startsWith(year) || !a.reason) return;
    reasonCount[a.reason] = (reasonCount[a.reason] || 0) + 1;
  });
  const topReasons = Object.entries(reasonCount).sort((a, b) => b[1] - a[1]);
  
  const body = document.getElementById('yearlySummaryBody');
  body.innerHTML = `
    <div class="stats-bar" style="margin-bottom: 18px;">
      <div class="stat-card"><div class="label">${year} 年订单</div><div class="value mono"><span>${totals.orders}</span></div><div class="sub">已发货 ${totals.completed}</div></div>
      <div class="stat-card repairing"><div class="label">售后总数</div><div class="value mono"><span>${totals.after}</span></div><div class="sub">单</div></div>
      <div class="stat-card purple"><div class="label">供应商问题</div><div class="value mono"><span>${totals.issues}</span></div><div class="sub">项</div></div>
      <div class="stat-card success"><div class="label">找灯任务</div><div class="value mono"><span>${totals.missing}</span></div><div class="sub">个</div></div>
    </div>
    
    <div class="summary-section">
      <div class="head"><div class="title">📈 ${year} 年 · 各月业务趋势</div></div>
      <div style="display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; padding: 12px 4px;">
        ${monthly.map((m, idx) => `
          <div style="text-align: center;">
            <div style="font-size: 10px; color: var(--text-tertiary); font-family: 'JetBrains Mono', monospace;">${idx + 1}月</div>
            <div style="background: linear-gradient(to top, var(--accent), rgba(37,99,235,0.3)); height: ${Math.max(20, m.orders * 3)}px; max-height: 80px; margin: 4px 0; border-radius: 3px;" title="订单 ${m.orders}"></div>
            <div style="font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--accent);">${m.orders}</div>
            <div style="font-size: 9px; color: var(--text-tertiary);">售后 ${m.after}</div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px;">
      <div class="summary-section">
        <div class="head"><div class="title">🏭 ${year} 年 Top 10 供应商</div></div>
        ${topSuppliers.length === 0 ? '<div class="summary-empty">暂无数据</div>' : topSuppliers.map(([s, c], i) => `
          <div style="display: flex; justify-content: space-between; padding: 6px 4px; border-bottom: 1px solid var(--border-subtle); font-size: 12.5px;">
            <span><b>${i + 1}.</b> ${escapeHtml(s)}</span>
            <span style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary);">${c} 单</span>
          </div>
        `).join('')}
      </div>
      
      <div class="summary-section">
        <div class="head"><div class="title">🔧 ${year} 年售后原因分布</div></div>
        ${topReasons.length === 0 ? '<div class="summary-empty">暂无数据</div>' : topReasons.map(([r, c]) => {
          const pct = totals.after > 0 ? Math.round(c / totals.after * 100) : 0;
          return `
            <div style="padding: 6px 4px; border-bottom: 1px solid var(--border-subtle); font-size: 12.5px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>${escapeHtml(r)}</span>
                <span style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary);">${c} (${pct}%)</span>
              </div>
              <div style="height: 4px; background: var(--bg-elevated); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; background: var(--pink); width: ${pct}%;"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function exportYearlySummary() {
  const year = document.getElementById('yearlyYear').value;
  if (!year) return;
  toast(`正在导出 ${year} 年度报告...`);
  
  const wb = XLSX.utils.book_new();
  
  // 按月统计
  const months = Array.from({length: 12}, (_, i) => i + 1);
  const monthly = months.map(m => {
    const monthStr = `${year}-${String(m).padStart(2, '0')}`;
    const o = ORDERS.filter(x => (x.orderDate || '').startsWith(monthStr));
    const a = AFTERSALES.filter(x => (x.createdDate || '').startsWith(monthStr));
    const i = ISSUES.filter(x => (x.createdAt || '').slice(0,7) === monthStr);
    const M = MISSING_LIGHTS.filter(x => (x.createdAt || '').slice(0,7) === monthStr);
    return [`${m} 月`, o.length, o.filter(x => ['shipped','arrived'].includes(x.status)).length, a.length, a.filter(x => x.status === 'resolved').length, i.length, M.length];
  });
  const data = [
    [`${year} 年度报告`],
    [],
    ['月份', '订单', '已发货', '售后', '已解决', '问题', '找灯'],
    ...monthly,
    ['合计', ...monthly.reduce((acc, r) => acc.map((v, i) => v + r[i + 1]), [0,0,0,0,0,0])],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:6}}];
  ws['!cols'] = [{wch:10},{wch:8},{wch:10},{wch:8},{wch:10},{wch:8},{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws, '年度概览');
  
  XLSX.writeFile(wb, `跟单年报_${year}.xlsx`);
  toast(`✓ 已导出 ${year} 年报`);
}

function calcAgentScore(agentName, range) {
  let scoreMissing = 0, scoreOrders = 0, scoreAfter = 0, scoreIssues = 0;
  const detail = { missingHelps: [], orderOnTime: 0, orderOverdue: 0, orderDelivered: 0, afterResolved: 0, afterFast: 0, issueResolved: 0, issueEscalated: 0 };
  
  // 找灯贡献：这个 agent 被采纳了多少次
  MISSING_LIGHTS.forEach(m => {
    if (m.adoptedHelper === agentName && m.foundAt && inRange(m.foundAt, range)) {
      scoreMissing += SCORE_RULES.missingHelp;
      detail.missingHelps.push(m);
    }
  });
  
  // 催单：这个 agent 的订单
  const orders = DATA.getOrders(agentName);
  orders.forEach(o => {
    // 按时发货 / 逾期
    if (o.shippedDate && inRange(o.shippedDate, range)) {
      if (o.promisedDate && o.shippedDate <= o.promisedDate) {
        scoreOrders += SCORE_RULES.orderOnTime;
        detail.orderOnTime++;
      } else if (o.promisedDate && o.shippedDate > o.promisedDate) {
        scoreOrders += SCORE_RULES.orderOverdue;
        detail.orderOverdue++;
      }
    }
    // 已交付
    // 到货完成（之前是已交付，现在用已到货）
    if (o.arrivedDate && inRange(o.arrivedDate, range) && o.status === 'arrived') {
      scoreOrders += SCORE_RULES.orderDelivered;
      detail.orderDelivered++;
    }
  });
  
  // 售后：这个 agent 解决的售后
  const aftersales = DATA.getAftersales(agentName);
  aftersales.forEach(a => {
    if (a.status === 'resolved' && a.resolvedDate && inRange(a.resolvedDate, range)) {
      scoreAfter += SCORE_RULES.afterResolved;
      detail.afterResolved++;
      // 7 天内快速解决
      if (a.createdDate) {
        const days = (new Date(a.resolvedDate) - new Date(a.createdDate)) / 86400000;
        if (days <= 7) {
          scoreAfter += SCORE_RULES.afterFast;
          detail.afterFast++;
        }
      }
    }
  });
  
  // 供应商问题：解决/升级
  const issues = DATA.getIssues(agentName);
  issues.forEach(it => {
    // 取最后跟进时间或 createdAt
    const lastFu = (it.followups || []).slice(-1)[0];
    const lastDate = lastFu ? lastFu.date : (it.createdAt || '').slice(0, 10);
    if (!inRange(lastDate, range)) return;
    if (it.status === 'resolved') {
      scoreIssues += SCORE_RULES.issueResolved;
      detail.issueResolved++;
    } else if (it.status === 'escalated') {
      scoreIssues += SCORE_RULES.issueEscalated;
      detail.issueEscalated++;
    }
  });
  
  return {
    agent: agentName,
    total: scoreMissing + scoreOrders + scoreAfter + scoreIssues,
    scoreMissing, scoreOrders, scoreAfter, scoreIssues,
    detail,
  };
}

