// ============================================================
// 跟单团队工作台 · purchases.js
// 线上采购模块（淘宝/天猫/京东等平台采购，需审批）
// ============================================================
// 依赖：core.js（DATA, PURCHASES）+ 工具函数
// ============================================================

// ============================================================
// 🛒 线上采购模块
// ============================================================
const PURCHASE_STATUS_LABELS = {
  draft: '草稿', pending_approval: '待审批', approved: '已批准', rejected: '已驳回',
  ordered: '已下单', shipped: '已发货', received: '已收货', cancelled: '已取消'
};
const PLATFORM_ICONS = {
  '淘宝': '🛍', '阿里巴巴': '🏭', '京东': '🛒', '拼多多': '🍃', '天猫': '🎁', '其他': '📌'
};

function getApprovalThreshold() {
  // 默认 2000 元，可以未来加入配置
  return (CONFIG && CONFIG.approvalThreshold) || 2000;
}

async function addPurchase() {
  const me = CONFIG.agents.find(a => a.name === CURRENT_AGENT);
  const newP = {
    _id: 'P' + Date.now() + Math.random().toString(36).slice(2, 6),
    orderNo: '', platform: '', productUrl: '', sku: '',
    productName: '', description: '',
    quantity: 1, unitPrice: 0, totalAmount: 0,
    status: 'draft',
    screenshots: [], followups: [], notes: '',
    linkedMissingId: null,
    approvalThreshold: getApprovalThreshold(),
    createdAt: new Date().toISOString(),
  };
  const arr = DATA.getPurchases(CURRENT_AGENT);
  arr.unshift(newP);
  DATA.savePurchases(CURRENT_AGENT, arr);
  loadAllData();
  renderPurchases();
  updatePurchaseStats();
  try { await DATA.saveAndSyncPurchases(CURRENT_AGENT); }
  catch (err) { console.error(err); toast('云端同步失败：' + (err.message || err), 'err'); }
  openPurchaseModal(newP._id, CURRENT_AGENT);
}

function renderPurchases() {
  if (!CURRENT_AGENT) return;
  // 主管查看所有，跟单只看自己
  const myList = PURCHASES;
  
  const q = (document.getElementById('pSearch') ? document.getElementById('pSearch').value.toLowerCase() : '').trim();
  const fStatus = document.getElementById('pFilterStatus') ? document.getElementById('pFilterStatus').value : 'active';
  const fPlatform = document.getElementById('pFilterPlatform') ? document.getElementById('pFilterPlatform').value : '';
  
  let list = myList.filter(p => {
    if (q) {
      const t = `${p.orderNo||''}${p.productName||''}${p.sku||''}${p.platform||''}${p.description||''}`.toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fPlatform && p.platform !== fPlatform) return false;
    if (fStatus === 'active') return !['received', 'cancelled', 'rejected'].includes(p.status);
    if (fStatus === 'completed') return ['received', 'cancelled', 'rejected'].includes(p.status);
    if (fStatus === 'all') return true;
    return p.status === fStatus;
  });
  
  // 排序：待审批 + 紧急金额优先
  list.sort((a, b) => {
    const statusPriority = { pending_approval: 0, approved: 1, ordered: 2, shipped: 3, draft: 4, received: 5, rejected: 6, cancelled: 7 };
    const sa = statusPriority[a.status] ?? 9;
    const sb = statusPriority[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  
  const body = document.getElementById('purchasesBody');
  if (!body) return;
  
  if (list.length === 0) {
    body.innerHTML = `<div style="padding: 60px 20px; text-align: center; color: var(--text-tertiary);">
      <div style="font-size: 40px; margin-bottom: 12px;">🛒</div>
      <div style="font-size: 14px;">还没有线上采购单</div>
      <div style="font-size: 11px; margin-top: 6px;">点击下方 "+ 新增采购" 创建第一笔</div>
    </div>`;
    return;
  }
  
  body.innerHTML = list.map((p, i) => renderPurchaseRow(p, i)).join('');
}

function renderPurchaseRow(p, i) {
  const totalCls = p.totalAmount >= 5000 ? 'huge' : p.totalAmount >= getApprovalThreshold() ? 'large' : '';
  const needsApproval = p.totalAmount >= (p.approvalThreshold || getApprovalThreshold());
  const platformIcon = PLATFORM_ICONS[p.platform] || '📌';
  
  let statusBadge = `<span class="status-pill s-${p.status}">${PURCHASE_STATUS_LABELS[p.status]}</span>`;
  if (p.status === 'pending_approval') statusBadge += '<div class="approval-badge pending" style="margin-top: 4px;">⏳ 待审批</div>';
  if (p.status === 'approved') statusBadge += `<div class="approval-badge approved" style="margin-top: 4px;">✓ ${escapeHtml(p.approvedBy || '主管')}已批</div>`;
  if (p.status === 'rejected') statusBadge += '<div class="approval-badge rejected" style="margin-top: 4px;">✗ 已驳回</div>';
  
  const thumb = p.screenshots && p.screenshots[0] 
    ? `<img src="${p.screenshots[0]}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover; vertical-align: middle; margin-right: 6px;" onclick="event.stopPropagation(); viewImage('${p.screenshots[0]}')">`
    : '';
  
  return `
    <div class="purchase-row" onclick="openPurchaseModal('${p._id}', '${escapeHtml(p._agent || '')}')">
      <div class="row-num">${i + 1}${IS_ADMIN && p._agent ? `<div style="font-size:9px;color:var(--text-tertiary);">${escapeHtml(p._agent.slice(0,2))}</div>` : ''}</div>
      <div><span class="purchase-platform">${platformIcon} ${escapeHtml(p.platform || '—')}</span></div>
      <div class="cell-main">
        <div class="order-line">
          ${thumb}<span class="order-no-big" style="font-size: 14px;">${escapeHtml(p.productName || '(待填商品名)')}</span>
        </div>
        ${p.orderNo ? `<div class="product-line"><b>关联订单</b>: ${escapeHtml(p.orderNo)}</div>` : ''}
        ${p.sku ? `<div class="supplier-line">📋 SKU: <span style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(p.sku)}</span></div>` : ''}
        ${p.productUrl ? `<div class="detail-line"><a href="${p.productUrl}" target="_blank" onclick="event.stopPropagation();" style="color: var(--accent); text-decoration: underline; font-size: 11px;">🔗 打开商品链接</a></div>` : ''}
      </div>
      <div>
        <div class="purchase-amount ${totalCls}">¥${(p.totalAmount || 0).toFixed(2)}</div>
        <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 2px;">${p.quantity || 1} × ¥${(p.unitPrice || 0).toFixed(2)}</div>
        ${needsApproval && p.status === 'draft' ? '<div style="font-size: 10px; color: var(--warning); margin-top: 2px;">⚠ 需审批</div>' : ''}
      </div>
      <div>${statusBadge}</div>
      <div style="font-size: 11px; color: var(--text-secondary);">
        👤 ${escapeHtml(p._agent || '—')}<br>
        <span style="font-size: 10px; color: var(--text-tertiary);">${(p.createdAt || '').slice(5, 10)}</span>
      </div>
      <div class="row-actions">
        ${IS_ADMIN && p.status === 'pending_approval' ? `
          <button class="action-btn done" title="批准" onclick="event.stopPropagation(); quickApprove('${p._id}', '${escapeHtml(p._agent || '')}')">✓</button>
          <button class="action-btn delete" title="驳回" onclick="event.stopPropagation(); quickReject('${p._id}', '${escapeHtml(p._agent || '')}')" style="color: var(--danger);">✗</button>
        ` : ''}
        ${p.status === 'approved' && p._agent === CURRENT_AGENT ? `<button class="action-btn done" title="标记已下单" onclick="event.stopPropagation(); markOrdered('${p._id}')">🛒</button>` : ''}
        ${p.status === 'ordered' && p._agent === CURRENT_AGENT ? `<button class="action-btn done" title="标记已收货" onclick="event.stopPropagation(); markReceived('${p._id}')">✓</button>` : ''}
        <button class="action-btn delete" title="删除" onclick="event.stopPropagation(); delPurchaseRow('${p._id}', '${escapeHtml(p._agent || '')}')">🗑</button>
      </div>
    </div>
  `;
}

function updatePurchaseStats() {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  let pending = 0, approved = 0, ordered = 0, received = 0, totalSpent = 0;
  
  PURCHASES.forEach(p => {
    if (p.status === 'pending_approval') pending++;
    if (p.status === 'approved') approved++;
    if (['ordered', 'shipped'].includes(p.status)) ordered++;
    if (p.status === 'received' && (p.receivedAt || p.createdAt || '').startsWith(thisMonth)) {
      received++;
      totalSpent += (p.totalAmount || 0);
    }
  });
  
  const el = id => document.getElementById(id);
  if (el('pPendingApproval')) el('pPendingApproval').textContent = pending;
  if (el('pApproved')) el('pApproved').textContent = approved;
  if (el('pOrdered')) el('pOrdered').textContent = ordered;
  if (el('pReceived')) el('pReceived').textContent = received;
  if (el('pTotalSpent')) el('pTotalSpent').textContent = totalSpent.toFixed(0);
  if (el('badgePurchases')) {
    const total = pending + approved;
    el('badgePurchases').textContent = total;
    el('badgePurchases').className = 'badge' + (total === 0 ? ' zero' : '');
  }
  if (el('purchasesAdminHint')) {
    el('purchasesAdminHint').style.display = IS_ADMIN ? '' : 'none';
  }
  if (el('approvalThresholdHint')) el('approvalThresholdHint').textContent = getApprovalThreshold();
}

function quickFilterPurchases(status) {
  const f = document.getElementById('pFilterStatus');
  if (!f) return;
  f.value = status;
  renderPurchases();
}

// ============ 采购 modal 操作 ============
let _currentPurchase = null;

function openPurchaseModal(id, agent) {
  const ownerAgent = agent || CURRENT_AGENT;
  const arr = DATA.getPurchases(ownerAgent);
  const p = arr.find(x => x._id === id);
  if (!p) return;
  _currentItemId = id;
  window._currentItemAgent = ownerAgent;
  _currentItemType = 'purchase';
  
  // 填充字段
  const $ = id => document.getElementById(id);
  $('pmInternalOrderNo').value = p.orderNo || '';
  $('pmSku').value = p.sku || '';
  $('pmProductUrl').value = p.productUrl || '';
  $('pmProductName').value = p.productName || '';
  $('pmDescription').value = p.description || '';
  $('pmQuantity').value = p.quantity || 1;
  $('pmUnitPrice').value = p.unitPrice || 0;
  $('pmTotalAmount').value = p.totalAmount || 0;
  $('pmNotes').value = p.notes || '';
  $('pmThresholdHint').textContent = p.approvalThreshold || getApprovalThreshold();
  
  renderPurchaseModalContent();
  setupPurchaseScreenshot();
  document.getElementById('purchaseModal').classList.add('show');
  _pasteTarget = 'purchase_orig';
}

function renderPurchaseModalContent() {
  const arr = DATA.getPurchases(window._currentItemAgent || CURRENT_AGENT);
  const p = arr.find(x => x._id === _currentItemId);
  if (!p) return;
  
  // header
  document.getElementById('pmOrderNo').textContent = p.productName || '(待填商品名)';
  document.getElementById('pmAgent').textContent = '👤 ' + (window._currentItemAgent || CURRENT_AGENT);
  document.getElementById('pmCreatedAt').textContent = '📅 ' + (p.createdAt || '').slice(0, 10);
  document.getElementById('pmAmount').textContent = '💰 ¥' + (p.totalAmount || 0).toFixed(2);
  
  // status pill highlight
  document.querySelectorAll('#pmStatusGrid .status-pill').forEach(el => {
    el.classList.toggle('selected', el.dataset.st === p.status);
  });
  document.querySelectorAll('#pmPlatformGrid .status-pill').forEach(el => {
    el.classList.toggle('selected', el.dataset.p === p.platform);
  });
  
  // status badge
  document.getElementById('pmStatusBadge').innerHTML = `<span class="status-pill s-${p.status}" style="padding: 6px 14px;">${PURCHASE_STATUS_LABELS[p.status]}</span>`;
  
  // 审批提示
  const threshold = p.approvalThreshold || getApprovalThreshold();
  const needsApproval = (p.totalAmount || 0) >= threshold;
  const noteEl = document.getElementById('pmApprovalNote');
  if (needsApproval) {
    if (p.status === 'draft') {
      noteEl.innerHTML = `<span style="color: var(--warning);">⚠ 金额 ¥${(p.totalAmount || 0).toFixed(2)} ≥ ¥${threshold}，需主管审批后才能下单</span>`;
    } else if (p.status === 'pending_approval') {
      noteEl.innerHTML = `<span style="color: var(--warning);">⏳ 已提交审批，等待主管批准</span>`;
    } else if (p.status === 'approved') {
      noteEl.innerHTML = `<span style="color: var(--success);">✓ 已被 ${escapeHtml(p.approvedBy || '主管')} 批准（${(p.approvedAt || '').slice(0, 10)}），可以下单</span>`;
    } else if (p.status === 'rejected') {
      noteEl.innerHTML = `<span style="color: var(--danger);">✗ 已被驳回${p.rejectedReason ? '：' + escapeHtml(p.rejectedReason) : ''}</span>`;
    } else {
      noteEl.innerHTML = '';
    }
  } else {
    noteEl.innerHTML = `<span style="color: var(--text-tertiary);">金额 ¥${(p.totalAmount || 0).toFixed(2)} < ¥${threshold}，无需审批</span>`;
  }
  
  // 提交审批按钮
  const submitBtn = document.getElementById('pmSubmitBtn');
  const ownerAgent = window._currentItemAgent || CURRENT_AGENT;
  const isOwner = ownerAgent === CURRENT_AGENT;
  if (p.status === 'draft' && needsApproval && isOwner) {
    submitBtn.style.display = '';
    submitBtn.textContent = '📤 提交审批';
  } else if (p.status === 'approved' && isOwner) {
    submitBtn.style.display = '';
    submitBtn.textContent = '🛒 标记已下单';
    submitBtn.onclick = () => markOrdered(p._id);
  } else if (p.status === 'ordered' && isOwner) {
    submitBtn.style.display = '';
    submitBtn.textContent = '✓ 标记已收货';
    submitBtn.onclick = () => markReceived(p._id);
  } else {
    submitBtn.style.display = 'none';
  }
  if (p.status === 'draft' && needsApproval && isOwner) {
    submitBtn.onclick = submitForApproval;
  }
  
  // 主管审批按钮
  const approvalActionsEl = document.getElementById('pmApprovalActions');
  if (IS_ADMIN && p.status === 'pending_approval') {
    approvalActionsEl.style.display = '';
  } else {
    approvalActionsEl.style.display = 'none';
  }
  
  // URL 预览
  const urlPreview = document.getElementById('pmUrlPreview');
  if (p.productUrl) {
    const platform = detectPlatform(p.productUrl);
    if (platform && !p.platform) {
      onPurchaseField('platform', platform);
    }
    urlPreview.innerHTML = `<span style="color: var(--text-tertiary);">检测到平台：</span><a href="${p.productUrl}" target="_blank" style="color: var(--accent);">${platform || '其他'}</a>`;
  } else {
    urlPreview.innerHTML = '';
  }
  
  // 截图
  const ss = p.screenshots || [];
  document.getElementById('pmScreenshots').innerHTML = ss.map((s, i) => 
    `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmPurchaseScreenshot(${i})">×</button></div>`
  ).join('');
}

function detectPlatform(url) {
  if (!url) return '';
  if (url.includes('taobao.com')) return '淘宝';
  if (url.includes('1688.com') || url.includes('alibaba.com')) return '阿里巴巴';
  if (url.includes('jd.com')) return '京东';
  if (url.includes('pinduoduo.com') || url.includes('yangkeduo.com')) return '拼多多';
  if (url.includes('tmall.com')) return '天猫';
  return '其他';
}

function persistCurrentPurchase(updater, immediate = false) {
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getPurchases(agent);
  const idx = arr.findIndex(p => p._id === _currentItemId);
  if (idx < 0) return;
  updater(arr[idx]);
  DATA.savePurchases(agent, arr);
  loadAllData();
  if (immediate) {
    DATA.saveAndSyncPurchases(agent).catch(err => { console.error(err); toast('同步失败:' + (err.message || err), 'err'); });
  }
}

function onPurchaseField(field, value) {
  persistCurrentPurchase(p => p[field] = value);
  if (field === 'productUrl') {
    const platform = detectPlatform(value);
    if (platform) {
      persistCurrentPurchase(p => p.platform = platform);
    }
  }
  renderPurchaseModalContent();
  renderPurchases();
  updatePurchaseStats();
}

function onPurchaseQtyOrPrice() {
  const qty = parseFloat(document.getElementById('pmQuantity').value) || 1;
  const price = parseFloat(document.getElementById('pmUnitPrice').value) || 0;
  const total = qty * price;
  document.getElementById('pmTotalAmount').value = total.toFixed(2);
  persistCurrentPurchase(p => {
    p.quantity = qty;
    p.unitPrice = price;
    p.totalAmount = total;
  });
  renderPurchaseModalContent();
  renderPurchases();
  updatePurchaseStats();
}

async function setPurchasePlatform(platform) {
  persistCurrentPurchase(p => p.platform = platform, true);
  renderPurchaseModalContent();
  renderPurchases();
}

async function setPurchaseStatus(st) {
  // 检查权限：草稿 → 待审批可以，其他状态切换有限制
  const arr = DATA.getPurchases(window._currentItemAgent || CURRENT_AGENT);
  const p = arr.find(x => x._id === _currentItemId);
  if (!p) return;
  
  // 草稿状态下，如果金额超阈值，禁止直接设为非待审批/草稿状态
  if (p.status === 'draft' && p.totalAmount >= (p.approvalThreshold || getApprovalThreshold())) {
    if (!['draft', 'pending_approval', 'cancelled'].includes(st)) {
      toast(`金额 ≥ ¥${p.approvalThreshold || getApprovalThreshold()}，必须先提交审批`, 'warn');
      return;
    }
  }
  // 非主管不能直接设为 approved/rejected
  if (!IS_ADMIN && (st === 'approved' || st === 'rejected')) {
    toast('只有主管能审批通过/驳回', 'warn');
    return;
  }
  
  persistCurrentPurchase(p => p.status = st, true);
  renderPurchaseModalContent();
  renderPurchases();
  updatePurchaseStats();
}

async function submitForApproval() {
  const arr = DATA.getPurchases(window._currentItemAgent || CURRENT_AGENT);
  const p = arr.find(x => x._id === _currentItemId);
  if (!p) return;
  
  // 校验必填
  if (!p.platform) { toast('请先选择采购平台', 'warn'); return; }
  if (!p.productUrl) { toast('请先填写商品链接', 'warn'); return; }
  if (!p.productName) { toast('请先填写商品名称', 'warn'); return; }
  if (!p.totalAmount || p.totalAmount <= 0) { toast('请先填写有效金额', 'warn'); return; }
  
  const threshold = p.approvalThreshold || getApprovalThreshold();
  if (p.totalAmount < threshold) {
    // 不需要审批，直接 approved
    if (!confirm(`金额 ¥${p.totalAmount.toFixed(2)} 低于审批阈值 ¥${threshold}，将自动批准。\n\n确定提交？`)) return;
    persistCurrentPurchase(p => {
      p.status = 'approved';
      p.approvedBy = '系统自动';
      p.approvedAt = new Date().toISOString();
    }, true);
    toast('✓ 已自动批准（金额低于阈值）');
  } else {
    if (!confirm(`金额 ¥${p.totalAmount.toFixed(2)} ≥ ¥${threshold}，需要主管审批。\n\n确定提交？`)) return;
    persistCurrentPurchase(p => {
      p.status = 'pending_approval';
    }, true);
    toast('✓ 已提交审批，等待主管批准');
  }
  
  // 同步到找灯模块（如果有图片）
  await syncToMissing(p);
  
  renderPurchaseModalContent();
  renderPurchases();
  updatePurchaseStats();
}

async function syncToMissing(p) {
  // 如果有截图且没关联过找灯，自动创建找灯任务
  if ((p.screenshots && p.screenshots.length > 0) && !p.linkedMissingId) {
    const newM = {
      _id: 'M' + Date.now() + Math.random().toString(36).slice(2, 6),
      description: `[采购需求] ${p.productName || '商品'}${p.sku ? ' / SKU: ' + p.sku : ''}`,
      specs: `数量 ${p.quantity || 1} 个 · 单价 ¥${(p.unitPrice || 0).toFixed(2)}\n${p.description || ''}`,
      customerOrderNo: p.orderNo || '',
      creator: window._currentItemAgent || CURRENT_AGENT,
      status: 'searching',
      screenshots: [...(p.screenshots || [])],
      comments: [],
      source: 'purchase',
      linkedPurchaseId: p._id,
      createdAt: new Date().toISOString(),
    };
    MISSING_LIGHTS.unshift(newM);
    DATA.saveMissingLights(MISSING_LIGHTS);
    try { await DATA.saveAndSyncMissing(); } catch (err) { console.error(err); }
    
    // 反向链接
    persistCurrentPurchase(x => x.linkedMissingId = newM._id, true);
    toast('✓ 已同步到「找灯」模块，团队可以一起帮忙找供应商', 'info', 4000);
  }
}

async function approvePurchase() {
  const arr = DATA.getPurchases(window._currentItemAgent || CURRENT_AGENT);
  const p = arr.find(x => x._id === _currentItemId);
  if (!p) return;
  if (!IS_ADMIN) { toast('只有主管能审批', 'err'); return; }
  if (!confirm(`确认批准这笔 ¥${p.totalAmount.toFixed(2)} 的采购吗？`)) return;
  
  persistCurrentPurchase(x => {
    x.status = 'approved';
    x.approvedBy = CURRENT_AGENT;
    x.approvedAt = new Date().toISOString();
  }, true);
  
  renderPurchaseModalContent();
  renderPurchases();
  updatePurchaseStats();
  toast(`✓ 已批准采购`);
}

async function quickApprove(id, agent) {
  const arr = DATA.getPurchases(agent);
  const p = arr.find(x => x._id === id);
  if (!p) return;
  if (!IS_ADMIN) { toast('只有主管能审批', 'err'); return; }
  if (!confirm(`确认批准 ${agent} 的这笔 ¥${p.totalAmount.toFixed(2)} 采购吗？`)) return;
  
  p.status = 'approved';
  p.approvedBy = CURRENT_AGENT;
  p.approvedAt = new Date().toISOString();
  DATA.savePurchases(agent, arr);
  loadAllData();
  renderPurchases();
  updatePurchaseStats();
  try { await DATA.saveAndSyncPurchases(agent); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
  toast(`✓ 已批准`);
}

async function rejectPurchase() {
  const arr = DATA.getPurchases(window._currentItemAgent || CURRENT_AGENT);
  const p = arr.find(x => x._id === _currentItemId);
  if (!p) return;
  if (!IS_ADMIN) { toast('只有主管能驳回', 'err'); return; }
  const reason = await showPrompt({ title: '⊗ 驳回采购单', message: '驳回原因会显示给跟单作为修改依据。', field: { label: '驳回原因', value: '', type: 'textarea', rows: 3, placeholder: '例：单价偏高，请重新询价', required: true } });
  if (!reason || !reason.trim()) return;
  
  persistCurrentPurchase(x => {
    x.status = 'rejected';
    x.rejectedReason = reason;
    x.approvedBy = CURRENT_AGENT;
    x.approvedAt = new Date().toISOString();
  }, true);
  
  renderPurchaseModalContent();
  renderPurchases();
  updatePurchaseStats();
  toast(`✗ 已驳回`);
}

async function quickReject(id, agent) {
  const arr = DATA.getPurchases(agent);
  const p = arr.find(x => x._id === id);
  if (!p) return;
  if (!IS_ADMIN) { toast('只有主管能驳回', 'err'); return; }
  const reason = await showPrompt({ title: '⊗ 驳回采购单', message: '驳回原因会显示给跟单作为修改依据。', field: { label: '驳回原因', value: '', type: 'textarea', rows: 3, placeholder: '例：单价偏高，请重新询价', required: true } });
  if (!reason || !reason.trim()) return;
  
  p.status = 'rejected';
  p.rejectedReason = reason;
  p.approvedBy = CURRENT_AGENT;
  p.approvedAt = new Date().toISOString();
  DATA.savePurchases(agent, arr);
  loadAllData();
  renderPurchases();
  updatePurchaseStats();
  try { await DATA.saveAndSyncPurchases(agent); }
  catch (err) { console.error(err); }
  toast(`✗ 已驳回`);
}

async function markOrdered(id) {
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getPurchases(agent);
  const p = arr.find(x => x._id === id);
  if (!p) return;
  if (p.status !== 'approved') { toast('请先获批准', 'warn'); return; }
  if (!confirm(`确认已在淘宝/平台下单？`)) return;
  
  p.status = 'ordered';
  p.orderedAt = new Date().toISOString();
  DATA.savePurchases(agent, arr);
  loadAllData();
  renderPurchases();
  renderPurchaseModalContent();
  updatePurchaseStats();
  try { await DATA.saveAndSyncPurchases(agent); } catch (err) { console.error(err); }
  toast('✓ 已标记下单');
}

async function markReceived(id) {
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getPurchases(agent);
  const p = arr.find(x => x._id === id);
  if (!p) return;
  if (!['ordered', 'shipped'].includes(p.status)) { toast('请先下单', 'warn'); return; }
  if (!confirm(`确认货已经收到？`)) return;
  
  p.status = 'received';
  p.receivedAt = new Date().toISOString();
  DATA.savePurchases(agent, arr);
  loadAllData();
  renderPurchases();
  renderPurchaseModalContent();
  updatePurchaseStats();
  try { await DATA.saveAndSyncPurchases(agent); } catch (err) { console.error(err); }
  toast('✓ 已确认收货');
}

async function delPurchaseRow(id, agent) {
  if (!confirm('确定删除这个采购单？\n\n（删除后会进回收站，可恢复）')) return;
  const ownerAgent = (IS_ADMIN && agent) ? agent : CURRENT_AGENT;
  const arr = DATA.getPurchases(ownerAgent);
  const p = arr.find(x => x._id === id);
  if (!p) return;
  p.deletedAt = new Date().toISOString();
  p.deletedBy = CURRENT_AGENT;
  DATA.savePurchases(ownerAgent, arr);
  loadAllData();
  renderPurchases();
  updatePurchaseStats();
  try { await DATA.saveAndSyncPurchases(ownerAgent); } catch (err) { console.error(err); }
  toast('已移入回收站');
}

async function deleteCurrentPurchase() {
  if (!confirm('确定删除这个采购单？\n\n（删除后会进回收站，可恢复）')) return;
  const agent = window._currentItemAgent || CURRENT_AGENT;
  const arr = DATA.getPurchases(agent);
  const p = arr.find(x => x._id === _currentItemId);
  if (!p) return;
  p.deletedAt = new Date().toISOString();
  p.deletedBy = CURRENT_AGENT;
  DATA.savePurchases(agent, arr);
  closeModal('purchaseModal');
  loadAllData();
  renderPurchases();
  updatePurchaseStats();
  try { await DATA.saveAndSyncPurchases(agent); } catch (err) { console.error(err); }
  toast('已移入回收站');
}

async function rmPurchaseScreenshot(i) {
  persistCurrentPurchase(p => p.screenshots.splice(i, 1), true);
  renderPurchaseModalContent();
  renderPurchases();
}

function setupPurchaseScreenshot() {
  const dz = document.getElementById('pmDropZone');
  const fi = document.getElementById('pmFileInput');
  const sel = document.getElementById('pmFileSelect');
  if (!dz || !fi || dz.dataset.bound) return;
  dz.dataset.bound = '1';
  
  sel.addEventListener('click', () => fi.click());
  fi.addEventListener('change', e => handleFiles(e.target.files, 'purchase_orig'));
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('dragover');
    handleFiles(e.dataTransfer.files, 'purchase_orig');
  });
}

