// ============================================================
// 跟单团队工作台 · trash.js
// 回收站 · 30 天软删除恢复
// ============================================================
// 依赖：core.js（DATA, sb, IS_ADMIN）+ 业务模块的列表刷新函数
// ============================================================

// ============================================================
// 🗑 回收站
// ============================================================
let _trashTab = 'orders';

async function openTrash() {
  _trashTab = 'orders';
  document.querySelectorAll('.trash-tab-btn').forEach(t => t.classList.toggle('active', t.dataset.trashTab === 'orders'));
  document.getElementById('trashModal').classList.add('show');
  // 先 flush 任何 pending 同步，确保 cache 是最新的
  if (DATA && DATA.flushPending) DATA.flushPending();
  renderTrash();
}

function switchTrashTab(tab) {
  _trashTab = tab;
  document.querySelectorAll('.trash-tab-btn').forEach(t => t.classList.toggle('active', t.dataset.trashTab === tab));
  renderTrash();
}

function _getTrashItems(type) {
  // 直接从 _cache 取所有（含已删除），过滤 deletedAt
  if (type === 'orders') {
    const all = [];
    Object.entries(DATA._cache.ordersByAgent).forEach(([agent, arr]) => {
      arr.forEach(o => o.deletedAt && all.push({ ...o, _agent: agent }));
    });
    return all;
  }
  if (type === 'aftersales') {
    const all = [];
    Object.entries(DATA._cache.aftersalesByAgent).forEach(([agent, arr]) => {
      arr.forEach(o => o.deletedAt && all.push({ ...o, _agent: agent }));
    });
    return all;
  }
  if (type === 'issues') {
    const all = [];
    Object.entries(DATA._cache.issuesByAgent).forEach(([agent, arr]) => {
      arr.forEach(o => o.deletedAt && all.push({ ...o, _agent: agent }));
    });
    return all;
  }
  if (type === 'missing') {
    return DATA._cache.missingLights.filter(m => m.deletedAt);
  }
  if (type === 'purchases') {
    const all = [];
    Object.entries(DATA._cache.purchasesByAgent || {}).forEach(([agent, arr]) => {
      arr.forEach(p => p.deletedAt && all.push({ ...p, _agent: agent }));
    });
    return all;
  }
  return [];
}

function renderTrash() {
  // 更新计数
  document.getElementById('tcOrders').textContent = _getTrashItems('orders').length;
  document.getElementById('tcAfter').textContent = _getTrashItems('aftersales').length;
  document.getElementById('tcIssues').textContent = _getTrashItems('issues').length;
  document.getElementById('tcMissing').textContent = _getTrashItems('missing').length;
  if (document.getElementById('tcPurchases')) {
    document.getElementById('tcPurchases').textContent = _getTrashItems('purchases').length;
  }
  
  const items = _getTrashItems(_trashTab);
  // 按删除时间倒序
  items.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  
  const el = document.getElementById('trashContent');
  if (items.length === 0) {
    el.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-tertiary);">✓ 这个分类的回收站是空的</div>`;
    return;
  }
  
  el.innerHTML = items.map(item => {
    const days = item.deletedAt ? Math.floor((new Date() - new Date(item.deletedAt)) / 86400000) : 0;
    let title = '';
    let subtitle = '';
    if (_trashTab === 'orders') {
      title = (item.orderNo || '(无单号)') + (item.site ? ' [' + item.site + ']' : '');
      subtitle = `📦 ${item.product || '—'} · 🏭 ${item.supplier || '—'}`;
    } else if (_trashTab === 'aftersales') {
      title = (item.orderNo || '(无单号)') + (item.site ? ' [' + item.site + ']' : '');
      subtitle = `${item.reason || '—'} · 📦 ${item.product || '—'} · 🏭 ${item.supplier || '—'}`;
    } else if (_trashTab === 'issues') {
      title = '🏭 ' + (item.supplier || '(未填供应商)') + (item.issueType ? ' · ' + item.issueType : '');
      subtitle = (item.requirement || '').slice(0, 80);
    } else if (_trashTab === 'missing') {
      title = item.description || '(无描述)';
      subtitle = item.specs ? '📏 ' + item.specs : '';
    } else if (_trashTab === 'purchases') {
      title = `${PLATFORM_ICONS[item.platform] || ''} ${item.productName || '(待填商品)'}`;
      subtitle = `¥${(item.totalAmount || 0).toFixed(2)}${item.sku ? ' · SKU: ' + item.sku : ''}${item.orderNo ? ' · ' + item.orderNo : ''}`;
    }
    
    return `
      <div class="trash-row">
        <div class="trash-info">
          <div class="trash-title">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="trash-subtitle">${escapeHtml(subtitle)}</div>` : ''}
          <div class="trash-meta">
            🕐 ${(item.deletedAt || '').slice(0, 16).replace('T', ' ')} （${days} 天前）· 👤 ${escapeHtml(item.deletedBy || '—')} 删除
            ${_trashTab !== 'missing' && item._agent ? ` · 归属：${escapeHtml(item._agent)}` : ''}
          </div>
        </div>
        <div class="trash-actions">
          <button class="btn primary sm" onclick="restoreTrashItem('${_trashTab}', '${item._id}', '${escapeHtml(item._agent || '')}')">↩ 恢复</button>
          <button class="btn danger-text sm" onclick="permanentDeleteTrashItem('${_trashTab}', '${item._id}', '${escapeHtml(item._agent || '')}')">🔥 彻底删除</button>
        </div>
      </div>
    `;
  }).join('');
}

function restoreTrashItem(type, id, agent) {
  let arr, item;
  if (type === 'orders') {
    arr = DATA._cache.ordersByAgent[agent] || [];
    item = arr.find(x => x._id === id);
  } else if (type === 'aftersales') {
    arr = DATA._cache.aftersalesByAgent[agent] || [];
    item = arr.find(x => x._id === id);
  } else if (type === 'issues') {
    arr = DATA._cache.issuesByAgent[agent] || [];
    item = arr.find(x => x._id === id);
  } else if (type === 'missing') {
    arr = DATA._cache.missingLights;
    item = arr.find(x => x._id === id);
  } else if (type === 'purchases') {
    arr = DATA._cache.purchasesByAgent[agent] || [];
    item = arr.find(x => x._id === id);
  }
  if (!item) return;
  
  item.deletedAt = null;
  item.deletedBy = null;
  
  // 触发同步
  if (type === 'orders') DATA.saveOrders(agent, arr);
  else if (type === 'aftersales') DATA.saveAftersales(agent, arr);
  else if (type === 'issues') DATA.saveIssues(agent, arr);
  else if (type === 'missing') DATA.saveMissingLights(arr);
  else if (type === 'purchases') DATA.savePurchases(agent, arr);
  
  loadAllData();
  renderTrash();
  renderActiveTab();
  toast('✓ 已恢复');
}

async function permanentDeleteTrashItem(type, id, agent) {
  if (!confirm('⚠️ 彻底删除后无法找回！\n\n确定要永久删除这条记录吗？')) return;
  
  // 直接调 Supabase 删除
  try {
    let tableName = '';
    if (type === 'orders') tableName = 'orders';
    else if (type === 'aftersales') tableName = 'aftersales';
    else if (type === 'issues') tableName = 'issues';
    else if (type === 'missing') tableName = 'missing_lights';
    else if (type === 'purchases') tableName = 'online_purchases';
    
    if (id && !id.startsWith('O') && !id.startsWith('A') && !id.startsWith('I') && !id.startsWith('M') && !id.startsWith('P')) {
      const { error } = await sb.from(tableName).delete().eq('id', id);
      if (error) throw error;
    }
    
    // 从 _cache 也移除
    if (type === 'orders') {
      DATA._cache.ordersByAgent[agent] = (DATA._cache.ordersByAgent[agent] || []).filter(x => x._id !== id);
    } else if (type === 'aftersales') {
      DATA._cache.aftersalesByAgent[agent] = (DATA._cache.aftersalesByAgent[agent] || []).filter(x => x._id !== id);
    } else if (type === 'issues') {
      DATA._cache.issuesByAgent[agent] = (DATA._cache.issuesByAgent[agent] || []).filter(x => x._id !== id);
    } else if (type === 'missing') {
      DATA._cache.missingLights = DATA._cache.missingLights.filter(x => x._id !== id);
    } else if (type === 'purchases') {
      DATA._cache.purchasesByAgent[agent] = (DATA._cache.purchasesByAgent[agent] || []).filter(x => x._id !== id);
    }
    
    renderTrash();
    toast('已彻底删除');
  } catch (err) {
    console.error(err);
    toast('删除失败：' + (err.message || err), 'err');
  }
}


function exportCurrentTab() {
  if (CURRENT_TAB === 'orders') exportOrders();
  else if (CURRENT_TAB === 'aftersales') exportAfterReport();
  else if (CURRENT_TAB === 'issues') exportIssues();
  else if (CURRENT_TAB === 'missing') exportMissing();
  else if (CURRENT_TAB === 'purchases') exportPurchases();
  else if (CURRENT_TAB === 'performance') exportPerformance();
}

function exportOrders() {
  // V3：从 PO 派生数据导出
  const __src = (typeof CHASE_ORDERS !== 'undefined' && CHASE_ORDERS.length > 0) ? CHASE_ORDERS : ORDERS;
  if (__src.length === 0) { toast('没有数据可导出', 'err'); return; }
  // 询问导出格式
  const choice = confirm('选择导出格式：\n\n确定 = 📄 图文报告（HTML，含图片，发供应商用）\n取消 = 📊 Excel 表格（含图片链接）');
  if (choice) return exportOrdersHTML();
  
  // Excel 导出（含图片 URL 列）
  const headers = ['#','订单号','网站','产品','供应商','状态','下单日','承诺发货','发货日','到货日','已催次数','跟单员','跟进总数','备注','最新跟进','截图链接（可点击）'];
  const rows = __src.map((o, i) => {
    const last = o.followups && o.followups.length > 0 ? o.followups[o.followups.length - 1] : null;
    const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
    const allImgs = [...(o.screenshots || []), ...((o.followups || []).flatMap(f => f.screenshots || []))];
    return [i + 1, o.orderNo || '', o.site || '', o.product || '', o.supplier || '',
      ORDER_STATUS_LABELS[getOrderEffStatus(o)] || '逾期',
      o.orderDate || '', o.promisedDate || '', o.shippedDate || '', o.arrivedDate || '',
      chaseCount, o._agent || '', (o.followups || []).length, o.notes || '',
      last ? `[${last.date}] ${last.note || ''}` : '',
      allImgs.join('\n')];
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // 给图片 URL 列加超链接
  for (let i = 0; i < rows.length; i++) {
    const o = __src[i];
    const firstImg = (o.screenshots && o.screenshots[0]) || (o.followups && o.followups[0] && o.followups[0].screenshots && o.followups[0].screenshots[0]);
    if (firstImg) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: headers.length - 1 });
      if (ws[cellRef]) ws[cellRef].l = { Target: firstImg, Tooltip: '点击在浏览器打开第一张图片' };
    }
  }
  ws['!cols'] = [{wch:5},{wch:14},{wch:8},{wch:24},{wch:14},{wch:10},{wch:11},{wch:11},{wch:11},{wch:11},{wch:8},{wch:10},{wch:8},{wch:20},{wch:40},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws, '催单');
  XLSX.writeFile(wb, `催单_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(`✓ 已导出 ${__src.length} 条`);
}

function exportOrdersHTML() {
  // V3：从 PO 派生数据导出
  const __src = (typeof CHASE_ORDERS !== 'undefined' && CHASE_ORDERS.length > 0) ? CHASE_ORDERS : ORDERS;
  exportAsHTML('催单清单', __src, [
    { key: 'orderNo', label: '订单号', site: true },
    { key: 'product', label: '产品' },
    { key: 'supplier', label: '供应商' },
    { key: 'statusLabel', label: '状态', val: o => ORDER_STATUS_LABELS[getOrderEffStatus(o)] || '' },
    { key: 'dates', label: '日期', val: o => `下单 ${o.orderDate||'—'}<br>承诺 ${o.promisedDate||'—'}<br>${o.shippedDate?'发货 '+o.shippedDate:''}` },
    { key: 'chaseInfo', label: '催单记录', val: o => {
      const chases = (o.followups||[]).filter(f => f.type === 'chase');
      if (chases.length === 0) return '<span style="color:#999;">未催</span>';
      return `<b style="color:#b91c1c;">已催 ${chases.length} 次</b><br>` + chases.map(c => `[${c.date}] ${escapeHtml(c.note || '')}`).join('<br>');
    }},
    { key: 'notes', label: '备注' },
    { key: 'images', label: '图片', isImage: true },
  ]);
}

function exportIssues() {
  if (ISSUES.length === 0) { toast('没有数据', 'err'); return; }
  const choice = confirm('选择导出格式：\n\n确定 = 📄 图文报告（HTML）\n取消 = 📊 Excel 表格');
  if (choice) return exportIssuesHTML();
  
  const headers = ['#','供应商','问题类型','要求','状态','沟通次数','跟单员','最后沟通','所有沟通记录'];
  const rows = ISSUES.map((it, i) => [
    i + 1, it.supplier || '', it.issueType || '', it.requirement || '',
    ISSUE_STATUS_LABELS[it.status],
    (it.followups || []).length, it._agent || '',
    (it.followups || []).length > 0 ? it.followups[it.followups.length - 1].date : '',
    (it.followups || []).map(f => `[${f.date}] ${f.note || ''}`).join('\n'),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:5},{wch:14},{wch:10},{wch:50},{wch:10},{wch:8},{wch:10},{wch:11},{wch:60}];
  XLSX.utils.book_append_sheet(wb, ws, '供应商问题');
  XLSX.writeFile(wb, `供应商问题_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(`✓ 已导出 ${ISSUES.length} 条`);
}

function exportIssuesHTML() {
  exportAsHTML('供应商问题清单', ISSUES, [
    { key: 'supplier', label: '供应商' },
    { key: 'issueType', label: '类型' },
    { key: 'requirement', label: '具体要求' },
    { key: 'statusLabel', label: '状态', val: it => ISSUE_STATUS_LABELS[it.status] || '' },
    { key: 'communications', label: '沟通记录', val: it => {
      const fu = it.followups || [];
      if (fu.length === 0) return '<span style="color:#999;">无</span>';
      return `<b>共 ${fu.length} 次</b><br>` + fu.map(f => `[${f.date}] ${escapeHtml(f.note || '')}`).join('<br>');
    }},
    { key: 'images', label: '图片', isImage: true, getImgs: it => (it.followups || []).flatMap(f => f.screenshots || []) },
  ]);
}

function exportMissing() {
  if (MISSING_LIGHTS.length === 0) { toast('没有数据', 'err'); return; }
  const choice = confirm('选择导出格式：\n\n确定 = 📄 图文报告（HTML，含图片）\n取消 = 📊 Excel 表格');
  if (choice) return exportMissingHTML();
  
  const headers = ['#','灯具描述','规格','客户订单号','发起人','状态','创建日','评论数','所有评论','参考图','实拍图'];
  const rows = MISSING_LIGHTS.map((m, i) => [
    i + 1, m.description || '', m.specs || '', m.customerOrderNo || '', m.creator || '',
    MISSING_STATUS_LABELS[m.status] || '',
    (m.createdAt || '').slice(0, 10), (m.comments || []).length,
    (m.comments || []).map(c => `[${c.user} ${c.date}]${c.suggestedSupplier ? '推荐:' + c.suggestedSupplier : ''} ${c.content}`).join(' || '),
    (m.screenshots || []).join('\n'),
    (m.realPhotos || []).join('\n'),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  for (let i = 0; i < rows.length; i++) {
    const m = MISSING_LIGHTS[i];
    if (m.screenshots && m.screenshots[0]) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: headers.length - 2 });
      if (ws[cellRef]) ws[cellRef].l = { Target: m.screenshots[0], Tooltip: '点击查看第一张参考图' };
    }
    if (m.realPhotos && m.realPhotos[0]) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: headers.length - 1 });
      if (ws[cellRef]) ws[cellRef].l = { Target: m.realPhotos[0], Tooltip: '点击查看第一张实拍图' };
    }
  }
  ws['!cols'] = [{wch:5},{wch:40},{wch:20},{wch:14},{wch:10},{wch:10},{wch:11},{wch:8},{wch:60},{wch:30},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws, '找灯');
  XLSX.writeFile(wb, `找灯_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(`✓ 已导出 ${MISSING_LIGHTS.length} 条`);
}

function exportMissingHTML() {
  exportAsHTML('找灯需求清单', MISSING_LIGHTS, [
    { key: 'description', label: '灯具描述' },
    { key: 'specs', label: '规格' },
    { key: 'creator', label: '发起人' },
    { key: 'statusLabel', label: '状态', val: m => MISSING_STATUS_LABELS[m.status] || '' },
    { key: 'createdAt', label: '创建', val: m => (m.createdAt||'').slice(0,10) },
    { key: 'comments', label: '建议', val: m => {
      const cs = m.comments || [];
      if (cs.length === 0) return '<span style="color:#999;">无</span>';
      return cs.map(c => `<b>${escapeHtml(c.user || '')}</b>${c.suggestedSupplier ? ` 👍 推荐: <b style="color:#2563eb">${escapeHtml(c.suggestedSupplier)}</b>` : ''}${c.editedAt ? ' <span style="color:#aaa;font-size:10px;">·已编辑</span>' : ''}<br>${escapeHtml(c.content || '')}`).join('<hr style="border:0;border-top:1px dashed #ddd;margin:6px 0;">');
    }},
    { key: 'images', label: '参考图', isImage: true, getImgs: m => m.screenshots || [] },
    { key: 'realPhotos', label: '实拍图', isImage: true, getImgs: m => m.realPhotos || [] },
  ]);
}

function exportPurchases() {
  if (PURCHASES.length === 0) { toast('没有数据', 'err'); return; }
  const choice = confirm('选择导出格式：\n\n确定 = 📄 图文报告（HTML，含图片）\n取消 = 📊 Excel 表格');
  if (choice) return exportPurchasesHTML();
  
  const headers = ['#','关联订单号','平台','商品名','SKU','商品链接','数量','单价','总金额','状态','申请人','审批人','审批日期','创建时间'];
  const rows = PURCHASES.map((p, i) => [
    i + 1, p.orderNo || '', p.platform || '',
    p.productName || '', p.sku || '',
    p.productUrl || '', p.quantity || 1,
    p.unitPrice || 0, p.totalAmount || 0,
    PURCHASE_STATUS_LABELS[p.status] || '',
    p._agent || '', p.approvedBy || '',
    (p.approvedAt || '').slice(0, 10),
    (p.createdAt || '').slice(0, 16).replace('T', ' '),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // 给商品链接加超链接
  for (let i = 0; i < rows.length; i++) {
    const p = PURCHASES[i];
    if (p.productUrl) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 5 });
      if (ws[cellRef]) ws[cellRef].l = { Target: p.productUrl, Tooltip: '打开商品链接' };
    }
  }
  ws['!cols'] = [{wch:5},{wch:14},{wch:10},{wch:30},{wch:14},{wch:30},{wch:6},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:11},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws, '线上采购');
  XLSX.writeFile(wb, `线上采购_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(`✓ 已导出 ${PURCHASES.length} 条`);
}

function exportPurchasesHTML() {
  exportAsHTML('线上采购清单', PURCHASES, [
    { key: 'productName', label: '商品名' },
    { key: 'platform', label: '平台', val: p => (PLATFORM_ICONS[p.platform] || '') + ' ' + (p.platform || '') },
    { key: 'sku', label: 'SKU' },
    { key: 'amount', label: '金额', val: p => `<b>¥${(p.totalAmount || 0).toFixed(2)}</b><br><span style="color:#999;font-size:11px;">${p.quantity || 1} × ¥${(p.unitPrice || 0).toFixed(2)}</span>` },
    { key: 'url', label: '商品链接', val: p => p.productUrl ? `<a href="${p.productUrl}" target="_blank" style="color:#2563eb;">🔗 打开</a>` : '—' },
    { key: 'statusLabel', label: '状态', val: p => PURCHASE_STATUS_LABELS[p.status] || '' },
    { key: 'approval', label: '审批', val: p => p.approvedBy ? `${escapeHtml(p.approvedBy)}<br><span style="color:#999;font-size:11px;">${(p.approvedAt||'').slice(0,10)}</span>` : '—' },
    { key: 'images', label: '图片', isImage: true },
  ]);
}

