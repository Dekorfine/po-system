// ============================================================
// 跟单团队工作台 · issues.js
// 供应商问题清单（针对供应商的合作问题：要求/规范/历史问题）
// ============================================================
// 依赖：core.js（DATA, ISSUES, CONFIG）
// ============================================================

// ============================================================
// MODULE 3: 供应商问题清单
// ============================================================
function renderIssues() {
  const container = document.getElementById('issuesContainer');
  const q = (document.getElementById('isSearch').value || '').trim().toLowerCase();
  const fs = document.getElementById('isFilterStatus').value;
  const fType = document.getElementById('isFilterType').value;
  const view = document.getElementById('isView').value;
  
  let list = ISSUES.filter(it => {
    if (q) {
      const t = [it.supplier, it.issueType, it.requirement, it._agent].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fType && it.issueType !== fType) return false;
    if (fs === 'active') return it.status !== 'resolved';
    if (fs === 'completed') return it.status === 'resolved';
    if (fs === 'all') return true;
    return it.status === fs;
  });
  
  if (list.length === 0) {
    container.innerHTML = `<div class="records-card records-card-empty"><div class="empty-state"><div class="icon">⚠</div><div class="text">${ISSUES.length === 0 ? '还没有记录供应商问题。点 "+ 新增问题" 开始' : '没有匹配的问题'}</div>${ISSUES.length === 0 ? '<button class="btn primary" onclick="addIssue()">+ 新增第一个</button>' : ''}</div></div>`;
    return;
  }
  
  if (view === 'grouped') {
    // 按供应商分组
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
            ${items.map((it, i) => renderIssueRow(it, i)).join('')}
          </div>
        </div>
      `;
    }).join('');
  } else {
    // 列表视图
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
}

function renderIssueRow(it, i) {
  const fuCount = (it.followups || []).length;
  const lastFu = fuCount > 0 ? it.followups[fuCount - 1] : null;
  const lastDate = lastFu ? lastFu.date : '';
  const lastNote = lastFu ? lastFu.note : '';
  
  // 供应商显示：空则警示
  const supplierHtml = it.supplier 
    ? escapeHtml(it.supplier)
    : '<span style="color:var(--warning); font-weight:600;">⚠ 待补充</span>';
  
  // 沟通次数样式
  const fuBadge = fuCount === 0 
    ? '<span style="color:var(--text-tertiary);">—</span>'
    : fuCount >= 3 
      ? `<b style="color:var(--danger);">${fuCount} 次 ⚠</b>` 
      : `<b style="color:var(--text-primary);">${fuCount} 次</b>`;
  
  // 主管能看跟单员名字
  const agentBadge = IS_ADMIN && it._agent 
    ? `<div style="font-size:9px;color:var(--text-tertiary); margin-top:2px;">👤 ${escapeHtml(it._agent)}</div>` 
    : '';
  
  // 要求 + 最近沟通摘要
  const reqText = it.requirement || '<span style="color:var(--text-tertiary);">未填写要求</span>';
  const lastFuHtml = lastFu 
    ? `<div style="margin-top: 6px; padding: 6px 10px; background: var(--bg-elevated); border-radius: 6px; font-size: 11.5px; color: var(--text-secondary); line-height: 1.4;">
         <b style="color:var(--accent);">📞 最近沟通 · ${formatShortDate(lastDate)}：</b>${escapeHtml((lastNote || '').slice(0, 80))}${(lastNote || '').length > 80 ? '...' : ''}
       </div>` 
    : '<div style="margin-top:4px; font-size:11px; color:var(--warning);">⚠ 还没记录沟通</div>';
  
  return `
    <div class="record-row s-${it.status}" onclick="openIssueModal('${it._id}', '${escapeHtml(it._agent || '')}')">
      <div class="row-num">${i + 1}${agentBadge}</div>
      <div><span class="status-pill s-${it.status}">${ISSUE_STATUS_LABELS[it.status]}</span></div>
      <div class="cell-text" style="font-weight:600;">${supplierHtml}</div>
      <div class="cell-text"><span style="background:rgba(124,58,237,0.08);color:var(--purple);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escapeHtml(it.issueType || '—')}</span></div>
      <div class="cell-text" style="line-height:1.4;">
        <div>${typeof reqText === 'string' && !reqText.startsWith('<') ? escapeHtml(reqText.slice(0, 100)) + (reqText.length > 100 ? '...' : '') : reqText}</div>
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

async function addIssue() {
  const newIt = {
    _id: 'I' + Date.now() + Math.random().toString(36).slice(2, 6),
    supplier: '', issueType: '', requirement: '',
    status: 'pending',
    followups: [],
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
  openIssueModal(newIt._id, CURRENT_AGENT);
}

async function quickResolveIssue(id, agent) {
  const ownerAgent = (IS_ADMIN && agent) ? agent : CURRENT_AGENT;
  const arr = DATA.getIssues(ownerAgent);
  const it = arr.find(x => x._id === id);
  if (!it) return;
  
  if (it.status === 'resolved') {
    toast('该问题已是「已解决」状态', 'warn');
    return;
  }
  
  const msg = `供应商问题「${it.supplier || '该问题'}${it.issueType ? ' · ' + it.issueType : ''}」已经解决？\n\n会标记为：✓ 已解决`;
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

function openIssueModal(id, agent) {
  const owner = agent || CURRENT_AGENT;
  const it = DATA.getIssues(owner).find(x => x._id === id);
  if (!it) return;
  _currentItemId = id;
  _currentItemType = 'issue';
  _newScreenshots_fu = [];
  window._currentItemAgent = owner;
  
  document.getElementById('ismSupplier').value = it.supplier || '';
  document.getElementById('ismType').value = it.issueType || '';
  document.getElementById('ismRequirement').value = it.requirement || '';
  document.getElementById('ismNewDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ismNewNote').value = '';
  document.getElementById('ismFuThumbs').innerHTML = '';
  
  renderIssueModalContent();
  document.getElementById('issueModal').classList.add('show');
}

function renderIssueModalContent() {
  const it = currentIssue();
  if (!it) return;
  document.getElementById('ismHeader').innerHTML = `
    <div class="top">
      <div class="order-no" style="font-family: inherit; font-size: 14px;">${escapeHtml(it.supplier || '(未填供应商)')}</div>
      ${IS_ADMIN && window._currentItemAgent ? `<span style="font-size:11px;background:rgba(124,58,237,0.1);color:var(--purple);padding:2px 8px;border-radius:4px;font-weight:600;">👤 ${escapeHtml(window._currentItemAgent)}</span>` : ''}
      <div class="top-status"><span class="status-pill s-${it.status}" style="display:inline-flex;padding:5px 12px;">${ISSUE_STATUS_LABELS[it.status]}</span></div>
    </div>
    <div class="meta">
      ${it.issueType ? `<span>📌 ${escapeHtml(it.issueType)}</span>` : ''}
      <span>📞 已沟通 ${(it.followups || []).length} 次</span>
    </div>
  `;
  document.querySelectorAll('#issueModal .status-grid .status-pill').forEach(p => p.classList.toggle('selected', p.dataset.st === it.status));
  
  const fu = it.followups || [];
  document.getElementById('ismTimelineCount').textContent = `${fu.length} 次`;
  const tl = document.getElementById('ismTimeline');
  if (fu.length === 0) {
    tl.innerHTML = '<div class="timeline-empty">还没有沟通记录</div>';
  } else {
    tl.innerHTML = fu.map((f, i) => `
      <div class="timeline-item">
        <div class="timeline-dot" style="background:var(--purple);">${i + 1}</div>
        <div class="timeline-content">
          <div class="timeline-meta"><span>📅 ${f.date} ${f.time || ''}</span></div>
          <div class="timeline-text">${escapeHtml(f.note || '')}</div>
          ${(f.screenshots && f.screenshots.length > 0) ? `<div class="timeline-screenshots">${f.screenshots.map(s => `<img src="${s}" class="screenshot-thumb" onclick="viewImage('${s}')">`).join('')}</div>` : ''}
          <div class="actions"><button class="del-btn" onclick="delIssueFollowup(${i})">删除</button></div>
        </div>
      </div>
    `).join('');
  }
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
  renderIssueModalContent();
  renderIssues();
  updateIssueStats();
}

async function setIssueStatus(st) {
  persistCurrentIssue(it => it.status = st);
  renderIssueModalContent();
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

function addIssueFollowup() {
  const note = document.getElementById('ismNewNote').value.trim();
  const date = document.getElementById('ismNewDate').value || new Date().toISOString().slice(0, 10);
  if (!note && _newScreenshots_fu.length === 0) { toast('请输入沟通内容', 'warn'); return; }
  persistCurrentIssue(it => {
    if (!it.followups) it.followups = [];
    it.followups.push({ date, time: new Date().toTimeString().slice(0, 5), note, screenshots: [..._newScreenshots_fu] });
    // 第一次沟通自动切到"沟通中"
    if (it.status === 'pending') it.status = 'in_progress';
  }, true);
  document.getElementById('ismNewNote').value = '';
  document.getElementById('ismFuThumbs').innerHTML = '';
  _newScreenshots_fu = [];
  renderIssueModalContent();
  renderIssues();
  updateIssueStats();
  toast('✓ 已记录沟通');
}

function delIssueFollowup(idx) {
  if (!confirm('删除这条记录？')) return;
  persistCurrentIssue(it => it.followups.splice(idx, 1), true);
  renderIssueModalContent();
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
  document.getElementById('isPending').textContent = p;
  document.getElementById('isInProgress').textContent = ip;
  document.getElementById('isEscalated').textContent = esc;
  document.getElementById('isResolved').textContent = res;
  document.getElementById('isStuck').textContent = stuck;
  updateBadges();
}

