// ============================================================
// 跟单团队工作台 · utils.js
// 通用工具 · 截图上传 / 导出 HTML / showPrompt / 图片上传 / 同步状态 / 自动同步
// ============================================================
// 依赖：core.js
// ============================================================

// ============================================================
// 截图上传（公用）
// ============================================================
function setupScreenshotHandlers() {
  // 订单/售后/问题：每个 modal 有 fu 区
  const cfgs = [
    { dz: 'omOrigDropZone', fi: 'omOrigFileInput', target: 'order_orig' },
    { dz: 'omFuDropZone', fi: 'omFuFileInput', target: 'order_fu' },
    { dz: 'asmOrigDropZone', fi: 'asmOrigFileInput', target: 'after_orig' },
    { dz: 'asmFuDropZone', fi: 'asmFuFileInput', target: 'after_fu' },
    { dz: 'ismFuDropZone', fi: 'ismFuFileInput', target: 'issue_fu' },
    { dz: 'mmDropZone', fi: 'mmFileInput', target: 'missing_orig' },
    { dz: 'mmRealDropZone', fi: 'mmRealFileInput', target: 'missing_real' },
  ];
  cfgs.forEach(cfg => {
    const dz = document.getElementById(cfg.dz);
    const fi = document.getElementById(cfg.fi);
    if (!dz || !fi) return;
    dz.addEventListener('click', e => { if (e.target.tagName !== 'A') fi.click(); });
    fi.addEventListener('change', e => handleFiles(e.target.files, cfg.target));
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); _pasteTarget = cfg.target; });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); handleFiles(e.dataTransfer.files, cfg.target); });
    dz.addEventListener('mouseenter', () => { _pasteTarget = cfg.target; });
  });
  
  // 全局粘贴：自动按当前 modal 决定上传位置
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    // 检查是否有图片
    let hasImage = false;
    for (const item of items) {
      if (item.type.startsWith('image/')) { hasImage = true; break; }
    }
    if (!hasImage) return;
    
    // 决定 target：优先用鼠标 hover 设置的 _pasteTarget，否则按当前 modal 自动判断
    let target = _pasteTarget;
    if (!target) {
      const visibleModal = document.querySelector('.modal-bg.show');
      if (!visibleModal) return;
      const modalDefaults = {
        orderModal: 'order_fu',           // 订单：默认进跟进区
        aftersalesModal: 'after_fu',
        issueModal: 'issue_fu',
        missingModal: 'missing_orig',      // 找灯：进图片区
        purchaseModal: 'purchase_orig',    // 采购：进图片区
        batchChaseModal: 'batch_chase',
      };
      target = modalDefaults[visibleModal.id];
    }
    if (!target) return;
    
    e.preventDefault();
    const files = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) handleFiles(files, target);
  });
}

async function handleFiles(files, target) {
  const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
  const skipped = files.length - fileArr.length;
  if (skipped > 0) toast(`跳过 ${skipped} 个非图片文件`, 'warn');
  if (fileArr.length === 0) return;
  
  // 上传中提示（长效，30 秒超时）
  const uploadingMsg = toast(`📤 正在上传${fileArr.length > 1 ? ` ${fileArr.length} 张` : ''}图片...`, 'info', 30000);
  
  let okCount = 0, failCount = 0;
  for (const file of fileArr) {
    try {
      const dataURL = await compressImage(file);
      const url = await uploadScreenshotToStorage(dataURL);
      attachScreenshot(url, target);
      okCount++;
    } catch (err) {
      console.error('Upload failed:', file.name, err);
      failCount++;
    }
  }
  
  // 关闭上传中提示
  if (uploadingMsg && uploadingMsg.parentNode) {
    clearTimeout(uploadingMsg._fadeTimer);
    uploadingMsg.style.opacity = '0';
    setTimeout(() => { if (uploadingMsg.parentNode) uploadingMsg.remove(); }, 300);
  }
  
  if (okCount > 0 && failCount === 0) {
    toast(`✓ 已上传 ${okCount} 张图片`);
  } else if (okCount > 0) {
    toast(`✓ 成功 ${okCount} 张，失败 ${failCount} 张`, 'warn');
  } else {
    toast(`❌ 上传失败，请按 F12 看 Console 错误详情`, 'err');
  }
}

// 把 dataURL 直接转 Blob（比 fetch(dataURL) 更稳健）
function dataURLToBlob(dataURL) {
  const parts = dataURL.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(parts[1]);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

// 上传到 Supabase Storage（Public bucket，用 publicUrl 永久有效）
async function uploadScreenshotToStorage(dataURL) {
  if (!CURRENT_USER_ID) {
    throw new Error('未登录（CURRENT_USER_ID 为空），请刷新页面重新登录');
  }
  
  const blob = dataURLToBlob(dataURL);
  const ext = blob.type.includes('png') ? 'png' : 'jpg';
  const fileName = `${CURRENT_USER_ID}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  
  console.log('[Upload] 开始上传:', fileName, '大小:', (blob.size / 1024).toFixed(1) + 'KB');
  
  const { error: uploadErr } = await sb.storage.from('po-screenshots').upload(fileName, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (uploadErr) {
    console.error('[Upload] Storage 上传错误:', uploadErr);
    throw new Error('Storage 上传失败: ' + (uploadErr.message || JSON.stringify(uploadErr)));
  }
  
  // 用 publicUrl（永久有效、加载快、可缓存。需要 bucket 设为 Public）
  const { data: urlData } = sb.storage.from('po-screenshots').getPublicUrl(fileName);
  if (!urlData || !urlData.publicUrl) {
    throw new Error('生成 URL 失败');
  }
  
  console.log('[Upload] ✓ 完成:', urlData.publicUrl);
  return urlData.publicUrl;
}

function attachScreenshot(dataURL, target) {
  if (target === 'order_orig') {
    persistCurrentOrder(o => { if (!o.screenshots) o.screenshots = []; o.screenshots.push(dataURL); }, true);
    renderOrderModalContent();
    renderOrders();
  } else if (target === 'order_fu') {
    _newScreenshots_fu.push(dataURL);
    renderTempThumbs('omFuThumbs', _newScreenshots_fu, 'fu');
  } else if (target === 'after_orig') {
    persistCurrentAfter(a => { if (!a.screenshots) a.screenshots = []; a.screenshots.push(dataURL); }, true);
    renderAfterModalContent();
    renderAftersales();
  } else if (target === 'after_fu') {
    _newScreenshots_fu.push(dataURL);
    renderTempThumbs('asmFuThumbs', _newScreenshots_fu, 'fu');
  } else if (target === 'issue_fu') {
    _newScreenshots_fu.push(dataURL);
    renderTempThumbs('ismFuThumbs', _newScreenshots_fu, 'fu');
  } else if (target === 'missing_orig') {
    const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
    if (m) {
      if (!m.screenshots) m.screenshots = [];
      m.screenshots.push(dataURL);
      DATA.saveMissingLights(MISSING_LIGHTS);
      DATA.saveAndSyncMissing().catch(err => console.error(err));
      renderMissingModalContent();
      renderMissing();
    }
  } else if (target === 'missing_real') {
    const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
    if (m) {
      if (!m.realPhotos) m.realPhotos = [];
      m.realPhotos.push(dataURL);
      DATA.saveMissingLights(MISSING_LIGHTS);
      DATA.saveAndSyncMissing().catch(err => console.error(err));
      renderMissingModalContent();
    }
  } else if (target === 'batch_chase') {
    _bcScreenshots.push(dataURL);
    renderBcThumbs();
  } else if (target === 'purchase_orig') {
    persistCurrentPurchase(p => { 
      if (!p.screenshots) p.screenshots = []; 
      p.screenshots.push(dataURL); 
    }, true);
    renderPurchaseModalContent();
    renderPurchases();
  }
}

function renderTempThumbs(elId, list, type) {
  document.getElementById(elId).innerHTML = list.map((s, i) => `
    <div class="drop-zone-thumb">
      <img src="${s}" onclick="viewImage('${s}')">
      <button class="rm" onclick="rmTempThumb('${elId}', ${i})">×</button>
    </div>
  `).join('');
}

function rmTempThumb(elId, i) {
  _newScreenshots_fu.splice(i, 1);
  renderTempThumbs(elId, _newScreenshots_fu, 'fu');
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1200;
        let { width, height } = img;
        if (width > maxW) { height = height * (maxW / width); width = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function viewImage(src) {
  document.getElementById('imageViewerImg').src = src;
  document.getElementById('imageViewer').classList.add('show');
}

// V4：通过订单号查关联销售单/PO 的产品图（售后、催单等模块用）
// 输入：orderNo (string) 如 "K115302"
// 输出：[image_url, ...] 数组（按 line_items 顺序）
function _getRelatedOrderImages(orderNo) {
  if (!orderNo) return [];
  const cleanNo = String(orderNo).trim().replace(/^#/, '');
  if (!cleanNo) return [];
  
  // 1. 优先从 SHOPIFY._orders 找（销售单）
  if (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
    const so = SHOPIFY._orders.find(o => {
      const num = String(o.shopify_order_number || '').replace('#', '');
      const name = String(o.name || '').replace('#', '');
      return num === cleanNo || name === cleanNo;
    });
    if (so && so.line_items && so.line_items.length > 0) {
      const imgs = so.line_items.map(li => li.image_url || li.image || '').filter(Boolean);
      if (imgs.length > 0) return imgs;
    }
  }
  
  // 2. 兜底从 PO_LIST 找（按 po_number 或 order_no 匹配）
  if (typeof PO_LIST !== 'undefined' && PO_LIST.length > 0) {
    const po = PO_LIST.find(p => 
      String(p.po_number || '').trim() === cleanNo || 
      String(p.order_no || '').trim() === cleanNo
    );
    if (po && po.line_items && po.line_items.length > 0) {
      const imgs = po.line_items.map(li => li.image_url || li.image || '').filter(Boolean);
      if (imgs.length > 0) return imgs;
    }
  }
  
  return [];
}

function closeImageViewer() {
  document.getElementById('imageViewer').classList.remove('show');
}

// V4：多图轮播预览（催单列表点击大图时使用，支持左右切换）
let _galleryImages = [];
let _galleryIndex = 0;

function viewImageGallery(jsonData, startIdx) {
  try {
    // HTML attribute 里的图片数组用 &quot; 转义过，要还原回来再 parse
    const decoded = String(jsonData).replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    _galleryImages = JSON.parse(decoded);
    _galleryIndex = startIdx || 0;
    if (!Array.isArray(_galleryImages) || _galleryImages.length === 0) return;
    _renderGalleryFrame();
  } catch (e) {
    console.error('viewImageGallery 解析失败：', e);
    // 兜底：当成单图打开
    if (typeof jsonData === 'string' && jsonData.startsWith('http')) viewImage(jsonData);
  }
}

function _renderGalleryFrame() {
  if (!_galleryImages.length) return;
  const cur = _galleryImages[_galleryIndex];
  document.getElementById('imageViewerImg').src = cur;
  document.getElementById('imageViewer').classList.add('show');
  
  // 在 imageViewer 里加左右切换控件（如果不存在）
  const viewer = document.getElementById('imageViewer');
  let nav = viewer.querySelector('.gallery-nav');
  if (!nav && _galleryImages.length > 1) {
    nav = document.createElement('div');
    nav.className = 'gallery-nav';
    nav.style.cssText = 'position:absolute; bottom:30px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:14px; background:rgba(0,0,0,0.7); padding:10px 20px; border-radius:30px; z-index:10000;';
    nav.innerHTML = `
      <button onclick="event.stopPropagation(); galleryPrev()" style="background:rgba(255,255,255,0.15); border:none; color:white; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:18px;">‹</button>
      <span id="galleryCounter" style="color:white; font-size:13px; font-family:monospace; min-width:50px; text-align:center;">1 / ${_galleryImages.length}</span>
      <button onclick="event.stopPropagation(); galleryNext()" style="background:rgba(255,255,255,0.15); border:none; color:white; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:18px;">›</button>
    `;
    viewer.appendChild(nav);
  }
  if (nav) {
    nav.style.display = _galleryImages.length > 1 ? 'flex' : 'none';
    const counter = document.getElementById('galleryCounter');
    if (counter) counter.textContent = `${_galleryIndex + 1} / ${_galleryImages.length}`;
  }
}

function galleryPrev() {
  if (_galleryImages.length === 0) return;
  _galleryIndex = (_galleryIndex - 1 + _galleryImages.length) % _galleryImages.length;
  _renderGalleryFrame();
}

function galleryNext() {
  if (_galleryImages.length === 0) return;
  _galleryIndex = (_galleryIndex + 1) % _galleryImages.length;
  _renderGalleryFrame();
}

// 左右方向键切换（图片预览打开时生效）
document.addEventListener('keydown', (e) => {
  const viewer = document.getElementById('imageViewer');
  if (!viewer || !viewer.classList.contains('show')) return;
  if (_galleryImages.length < 2) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); galleryPrev(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); galleryNext(); }
  else if (e.key === 'Escape') { closeImageViewer(); }
});

// ============================================================
// 通用：导出图文 HTML 报告（内嵌图片，可直接发供应商）
// ============================================================
function exportAsHTML(title, data, columns) {
  if (!data || data.length === 0) { toast('没有数据', 'err'); return; }
  
  const dateStr = new Date().toLocaleString('zh-CN');
  
  const rowsHtml = data.map((item, i) => {
    const cells = columns.map(col => {
      if (col.isImage) {
        const imgs = col.getImgs ? col.getImgs(item) : [...(item.screenshots || []), ...((item.followups || []).flatMap(f => f.screenshots || []))];
        if (imgs.length === 0) return '<td><span style="color:#aaa; font-size:11px;">无图</span></td>';
        return `<td><div class="images">${imgs.map(s => `<a href="${s}" target="_blank"><img src="${s}" loading="lazy"></a>`).join('')}</div></td>`;
      }
      let val;
      if (col.val) val = col.val(item);
      else val = item[col.key] || '';
      // 订单号要带网站徽章
      if (col.site && item.site) {
        val = `<b style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(val)}</b> <span style="background: #2563eb; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px;">${escapeHtml(item.site)}</span>`;
      } else if (typeof val === 'string' && !val.includes('<')) {
        val = escapeHtml(val);
      }
      return `<td>${val}</td>`;
    }).join('');
    const agentBadge = item._agent ? `<div style="font-size:10px; color:#999; margin-top:2px;">👤 ${escapeHtml(item._agent)}</div>` : '';
    return `<tr><td style="text-align:center; color:#666;"><b>${i + 1}</b>${agentBadge}</td>${cells}</tr>`;
  }).join('');
  
  const headerCells = ['<th style="width: 40px;">#</th>', ...columns.map(c => `<th>${escapeHtml(c.label)}</th>`)].join('');
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)} · ${dateStr}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; max-width: 1400px; margin: 0 auto; padding: 24px; background: #fafaf9; color: #1c1917; }
  .header { background: white; padding: 20px 28px; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .header h1 { margin: 0; font-size: 22px; color: #1c1917; }
  .header .meta { color: #78716c; font-size: 13px; margin-top: 6px; }
  .summary { display: inline-flex; gap: 16px; margin-top: 12px; }
  .summary span { background: #f5f5f4; padding: 6px 12px; border-radius: 6px; font-size: 12.5px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  th, td { border: 1px solid #e7e5e4; padding: 10px 14px; text-align: left; vertical-align: top; font-size: 13px; }
  th { background: #f5f5f4; color: #1c1917; font-weight: 600; font-size: 12px; }
  td { line-height: 1.5; }
  tr:hover td { background: #fafaf9; }
  .images { display: flex; flex-wrap: wrap; gap: 6px; max-width: 280px; }
  .images img { width: 90px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #e7e5e4; cursor: zoom-in; transition: transform 0.15s; }
  .images img:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-color: #2563eb; }
  .footer { text-align: center; padding: 20px; color: #a8a29e; font-size: 11px; }
  @media print { body { background: white; } .images img { width: 80px; height: 80px; } }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">导出时间：${dateStr}</div>
    <div class="summary">
      <span>📊 共 <b>${data.length}</b> 条记录</span>
      <span>💼 由跟单工作台导出</span>
    </div>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">本报告由跟单工作台自动生成 · 点击图片可放大查看 · 可直接发送给供应商</div>
</body>
</html>`;
  
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title}_${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`✓ 已导出图文报告 ${data.length} 条`);
}

function closeModal(id) {
  // 关闭前检查：如果是新建的空条目（没填任何关键字段），自动清除
  cleanupEmptyDraft(id);
  // 强制把待发送的数据立即推送云端，避免关 modal 后刷新看到旧数据
  if (DATA && DATA.flushPending) DATA.flushPending();
  document.getElementById(id).classList.remove('show');
  if (id !== 'agentModal') _pasteTarget = null;
}

// 清理空草稿：用户点 + 新增后什么也没填就关闭 → 把这条空记录删除
async function cleanupEmptyDraft(modalId) {
  if (!_currentItemId) return;
  
  if (modalId === 'orderModal') {
    const agent = window._currentItemAgent || CURRENT_AGENT;
    const arr = DATA.getOrders(agent);
    const idx = arr.findIndex(x => x._id === _currentItemId);
    if (idx < 0) return;
    const o = arr[idx];
    if (o.deletedAt) return;  // 已删除的不动
    
    const hasContent = (o.orderNo && o.orderNo.trim()) ||
                       (o.product && o.product.trim()) ||
                       (o.supplier && o.supplier.trim()) ||
                       (o.notes && o.notes.trim()) ||
                       (o.promisedDate) ||
                       (o.followups && o.followups.length > 0) ||
                       (o.screenshots && o.screenshots.length > 0);
    
    if (!hasContent) {
      arr.splice(idx, 1);
      DATA._cache.ordersByAgent[agent] = arr;
      try {
        await DATA.saveAndSyncOrders(agent);
        loadAllData(); renderOrders(); updateOrderStats(); refreshOrdersFb();
        toast('空白订单已自动取消', 'info');
      } catch (err) { console.error(err); }
    }
  } else if (modalId === 'aftersalesModal') {
    const agent = window._currentItemAgent || CURRENT_AGENT;
    const arr = DATA.getAftersales(agent);
    const idx = arr.findIndex(x => x._id === _currentItemId);
    if (idx < 0) return;
    const a = arr[idx];
    if (a.deletedAt) return;
    
    const hasContent = (a.orderNo && a.orderNo.trim()) ||
                       (a.product && a.product.trim()) ||
                       (a.supplier && a.supplier.trim()) ||
                       (a.reason && a.reason.trim()) ||
                       (a.reasonDetail && a.reasonDetail.trim()) ||
                       (a.followups && a.followups.length > 0) ||
                       (a.screenshots && a.screenshots.length > 0);
    
    if (!hasContent) {
      arr.splice(idx, 1);
      DATA._cache.aftersalesByAgent[agent] = arr;
      try {
        await DATA.saveAndSyncAftersales(agent);
        loadAllData(); renderAftersales(); updateAfterStats(); refreshAsFb();
        toast('空白售后已自动取消', 'info');
      } catch (err) { console.error(err); }
    }
  } else if (modalId === 'issueModal') {
    const agent = window._currentItemAgent || CURRENT_AGENT;
    const arr = DATA.getIssues(agent);
    const idx = arr.findIndex(x => x._id === _currentItemId);
    if (idx < 0) return;
    const it = arr[idx];
    if (it.deletedAt) return;
    
    const hasContent = (it.supplier && it.supplier.trim()) ||
                       (it.issueType && it.issueType.trim()) ||
                       (it.requirement && it.requirement.trim()) ||
                       (it.followups && it.followups.length > 0);
    
    if (!hasContent) {
      arr.splice(idx, 1);
      DATA._cache.issuesByAgent[agent] = arr;
      try {
        await DATA.saveAndSyncIssues(agent);
        loadAllData(); renderIssues(); updateIssueStats();
        toast('空白问题已自动取消', 'info');
      } catch (err) { console.error(err); }
    }
  } else if (modalId === 'missingModal') {
    const arr = DATA.getMissingLights();
    const idx = arr.findIndex(x => x._id === _currentItemId);
    if (idx < 0) return;
    const m = arr[idx];
    if (m.deletedAt) return;
    
    const hasContent = (m.description && m.description.trim()) ||
                       (m.specs && m.specs.trim()) ||
                       (m.customerOrderNo && m.customerOrderNo.trim()) ||
                       (m.screenshots && m.screenshots.length > 0) ||
                       (m.comments && m.comments.length > 0);
    
    if (!hasContent) {
      arr.splice(idx, 1);
      DATA._cache.missingLights = arr;
      try {
        await DATA.saveAndSyncMissing();
        loadAllData(); renderMissing(); updateMissingStats();
        toast('空白任务已自动取消', 'info');
      } catch (err) { console.error(err); }
    }
  } else if (modalId === 'purchaseModal') {
    const agent = window._currentItemAgent || CURRENT_AGENT;
    const arr = DATA.getPurchases(agent);
    const idx = arr.findIndex(x => x._id === _currentItemId);
    if (idx < 0) return;
    const p = arr[idx];
    if (p.deletedAt) return;
    
    const hasContent = (p.platform && p.platform.trim()) ||
                       (p.productUrl && p.productUrl.trim()) ||
                       (p.productName && p.productName.trim()) ||
                       (p.sku && p.sku.trim()) ||
                       (p.totalAmount && p.totalAmount > 0) ||
                       (p.screenshots && p.screenshots.length > 0) ||
                       (p.notes && p.notes.trim());
    
    if (!hasContent) {
      arr.splice(idx, 1);
      DATA._cache.purchasesByAgent[agent] = arr;
      try {
        await DATA.saveAndSyncPurchases(agent);
        loadAllData(); renderPurchases(); updatePurchaseStats();
        toast('空白采购单已自动取消', 'info');
      } catch (err) { console.error(err); }
    }
  }
}

document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg && bg.id !== 'agentModal') {
      cleanupEmptyDraft(bg.id);
      if (DATA && DATA.flushPending) DATA.flushPending();
      bg.classList.remove('show');
    }
  });
});

// ============================================================
// 🟢 同步状态指示器
// ============================================================
let _syncStatusTimer = null;
function setSyncStatus(status) {
  const ind = document.getElementById('syncIndicator');
  if (!ind) return;
  const dot = ind.querySelector('.sync-dot');
  const label = ind.querySelector('.sync-label');
  if (!dot || !label) return;
  dot.className = 'sync-dot ' + status;
  const labels = { synced: '✓ 已同步', syncing: '同步中...', pending: '待同步', error: '⚠ 同步失败' };
  label.textContent = labels[status] || '';
  
  if (status === 'synced') {
    clearTimeout(_syncStatusTimer);
  } else if (status === 'error') {
    clearTimeout(_syncStatusTimer);
    _syncStatusTimer = setTimeout(() => setSyncStatus('synced'), 5000);
  }
}

// 防止在同步中刷新/关闭页面丢数据
window.addEventListener('beforeunload', (e) => {
  if (DATA && DATA._pendingFns && Object.keys(DATA._pendingFns).length > 0) {
    // 尝试立即推送
    if (DATA.flushPending) DATA.flushPending();
    e.preventDefault();
    e.returnValue = '还有数据正在同步到云端，确定关闭吗？数据可能丢失。';
    return e.returnValue;
  }
});

function toast(msg, type, duration) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : type === 'warn' ? ' warn' : type === 'info' ? ' info' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  const d = duration || 2800;
  const fadeTimer = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => { if (t.parentNode) t.remove(); }, 300); }, d);
  t._fadeTimer = fadeTimer;
  return t;
}


// ============ 图片上传到 Supabase Storage ============
async function uploadImageToStorage(file) {
  if (!file) throw new Error('未选择文件');
  if (!file.type?.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能大于 10MB');
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { data, error } = await sb.storage.from('product-images').upload(safeName, file, { upsert: false });
  if (error) {
    if (error.message?.includes('Bucket not found') || error.message?.includes('not found')) {
      throw new Error('图片存储未配置，请先在 Supabase 跑 create-storage-bucket.sql');
    }
    throw error;
  }
  const { data: { publicUrl } } = sb.storage.from('product-images').getPublicUrl(safeName);
  return publicUrl;
}

// 图片上传相关交互（在 showPrompt 内部使用）
function _setupImageFieldHandlers(modalEl, body) {
  body.querySelectorAll('.image-field-wrapper').forEach(wrapper => {
    const fileInput = wrapper.querySelector('input[type=file]');
    const urlInput = wrapper.querySelector('input[data-key]');
    const preview = wrapper.querySelector('[data-preview]');
    const uploadBtn = wrapper.querySelector('[data-action=upload]');
    const clearBtn = wrapper.querySelector('[data-action=clear]');
    const statusEl = wrapper.querySelector('[data-status]');

    function updatePreview(url) {
      if (url) preview.innerHTML = `<img src="${url}" style="max-width:100%; max-height:140px; border-radius:6px; object-fit:contain;">`;
      else preview.innerHTML = '<div style="color:var(--text-tertiary); font-size:12px; padding:20px;">📷 无图片</div>';
    }
    async function doUpload(file) {
      statusEl.textContent = '⏳ 上传中…';
      statusEl.style.color = 'var(--accent)';
      try {
        const url = await uploadImageToStorage(file);
        urlInput.value = url;
        updatePreview(url);
        statusEl.textContent = '✓ 上传成功';
        statusEl.style.color = 'var(--success)';
        setTimeout(() => { statusEl.textContent = '支持 粘贴(Ctrl+V) / 上传 / 拖拽 / URL'; statusEl.style.color = 'var(--text-tertiary)'; }, 2000);
      } catch (e) {
        statusEl.textContent = '✗ ' + (e.message || e);
        statusEl.style.color = 'var(--danger)';
      }
    }

    // 文件选择
    uploadBtn?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', e => { if (e.target.files[0]) doUpload(e.target.files[0]); });
    // URL 手动改 → 同步预览
    urlInput?.addEventListener('input', () => updatePreview(urlInput.value.trim()));
    // 清空
    clearBtn?.addEventListener('click', () => { urlInput.value = ''; updatePreview(''); });
    // 拖拽
    preview?.addEventListener('dragover', e => { e.preventDefault(); preview.style.borderColor = 'var(--accent)'; });
    preview?.addEventListener('dragleave', e => { preview.style.borderColor = 'var(--border)'; });
    preview?.addEventListener('drop', e => {
      e.preventDefault();
      preview.style.borderColor = 'var(--border)';
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) doUpload(file);
    });
    // 当前 wrapper 也接受粘贴（点过它后焦点在内时）
    wrapper.addEventListener('paste', async e => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await doUpload(file);
          return;
        }
      }
    });
  });

  // 全局粘贴：modal 打开时整个文档监听一次（对当前激活的图片字段生效）
  const pasteHandler = async (e) => {
    if (modalEl.style.display !== 'flex') return;
    // 焦点不在文本输入里时才捕获图片粘贴
    const active = document.activeElement;
    const isTextInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !active.closest('.image-field-wrapper');
    if (isTextInput) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        // 找到第一个图片字段
        const wrapper = body.querySelector('.image-field-wrapper');
        if (!wrapper) return;
        const file = item.getAsFile();
        if (!file) return;
        // 触发该 wrapper 的上传流程
        const urlInput = wrapper.querySelector('input[data-key]');
        const preview = wrapper.querySelector('[data-preview]');
        const statusEl = wrapper.querySelector('[data-status]');
        statusEl.textContent = '⏳ 粘贴上传中…';
        statusEl.style.color = 'var(--accent)';
        try {
          const url = await uploadImageToStorage(file);
          urlInput.value = url;
          preview.innerHTML = `<img src="${url}" style="max-width:100%; max-height:140px; border-radius:6px; object-fit:contain;">`;
          statusEl.textContent = '✓ 粘贴上传成功';
          statusEl.style.color = 'var(--success)';
          setTimeout(() => { statusEl.textContent = '支持 粘贴(Ctrl+V) / 上传 / 拖拽 / URL'; statusEl.style.color = 'var(--text-tertiary)'; }, 2000);
        } catch (err) {
          statusEl.textContent = '✗ ' + (err.message || err);
          statusEl.style.color = 'var(--danger)';
        }
        return;
      }
    }
  };
  document.addEventListener('paste', pasteHandler);
  // 返回清理函数
  return () => document.removeEventListener('paste', pasteHandler);
}

// ============ 通用 prompt 替代浏览器原生（更好看 + 支持多字段） ============
// 用法：
//   const val = await showPrompt({ title: '改店铺名', field: { label: '名称', value: '原名' } });
//   const result = await showPrompt({ title: '编辑产品', fields: [
//     { key: 'sku', label: 'SKU', value: '...', required: true },
//     { key: 'name', label: '中文名', value: '...', hint: '留空恢复默认' },
//     { key: 'price', label: '单价', type: 'number', value: 100 },
//     { key: 'note', label: '备注', type: 'textarea', rows: 4, value: '' },
//   ]});
// 取消返回 null；多字段返回对象；单字段返回字符串
function showPrompt(opts) {
  return new Promise(resolve => {
    const modal = document.getElementById('genericPromptModal');
    if (!modal) { console.error('genericPromptModal not found'); resolve(null); return; }
    document.getElementById('genericPromptTitle').textContent = opts.title || '请输入';
    const body = document.getElementById('genericPromptBody');
    // 兼容单字段：opts.field 转为 fields 数组
    const isSingle = !!opts.field && !opts.fields;
    const fields = opts.fields || (opts.field ? [{ key: '__single', ...opts.field }] : []);
    const messageHtml = opts.message
      ? `<div style="background: rgba(37,99,235,0.06); padding: 8px 10px; border-radius: 6px; border-left: 3px solid var(--accent); font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; white-space: pre-wrap;">${escapeHtml(opts.message)}</div>`
      : '';
    body.innerHTML = messageHtml + fields.map(f => {
      const val = f.value == null ? '' : String(f.value);
      const inputAttrs = `data-key="${escapeHtml(f.key)}" placeholder="${escapeHtml(f.placeholder || '')}" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); font-family:inherit;"`;
      let inputHtml;
      if (f.type === 'textarea') {
        inputHtml = `<textarea ${inputAttrs} rows="${f.rows || 4}" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); font-family:inherit; resize:vertical;">${escapeHtml(val)}</textarea>`;
      } else if (f.type === 'number') {
        inputHtml = `<input type="number" ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : 'step="any"'} value="${escapeHtml(val)}" ${inputAttrs}>`;
      } else if (f.type === 'image') {
        // 图片字段：含预览 + 上传按钮 + 粘贴/拖拽 + URL 输入
        inputHtml = `
          <div class="image-field-wrapper" tabindex="0" style="border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px; background: var(--bg-elevated);">
            <div data-preview style="border: 2px dashed var(--border); border-radius: 6px; padding: 6px; min-height: 80px; display: flex; align-items: center; justify-content: center; background: var(--bg-card); transition: border-color 0.15s;">
              ${val ? `<img src="${escapeHtml(val)}" style="max-width:100%; max-height:140px; border-radius:6px; object-fit:contain;">` : '<div style="color:var(--text-tertiary); font-size:12px; padding:20px;">📷 无图片</div>'}
            </div>
            <div style="display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap;">
              <button type="button" class="btn small" data-action="upload">📁 选择文件</button>
              <input type="file" accept="image/*" style="display:none;">
              ${val ? `<button type="button" class="btn small" data-action="clear">✕ 清空</button>` : ''}
              <span data-status style="font-size: 11px; color: var(--text-tertiary); margin-left: 4px;">支持 粘贴(Ctrl+V) / 上传 / 拖拽 / URL</span>
            </div>
            <input type="text" value="${escapeHtml(val)}" ${inputAttrs.replace('width:100%', 'width:100%; margin-top:8px; font-size:11px; font-family:monospace')} placeholder="或直接粘贴图片 URL">
          </div>`;
      } else {
        inputHtml = `<input type="text" value="${escapeHtml(val)}" ${inputAttrs}>`;
      }
      return `
        <div style="margin-bottom: 14px;">
          ${f.label ? `<label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">${escapeHtml(f.label)}${f.required ? ' <span style="color:var(--danger);">*</span>' : ''}</label>` : ''}
          ${inputHtml}
          ${f.hint ? `<div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">${escapeHtml(f.hint)}</div>` : ''}
        </div>`;
    }).join('');

    // 如果有 image 字段，设置上传/粘贴交互（返回 cleanup 函数）
    const hasImageField = fields.some(f => f.type === 'image');
    const imageCleanup = hasImageField ? _setupImageFieldHandlers(modal, body) : null;

    const cleanup = (val) => {
      modal.style.display = 'none';
      document.getElementById('genericPromptOk').onclick = null;
      document.getElementById('genericPromptCancel').onclick = null;
      document.getElementById('genericPromptClose').onclick = null;
      document.removeEventListener('keydown', keyHandler, true);
      if (imageCleanup) imageCleanup();
      resolve(val);
    };
    const onOk = () => {
      const result = {};
      body.querySelectorAll('[data-key]').forEach(inp => { result[inp.dataset.key] = inp.value; });
      for (const f of fields) {
        if (f.required && !(result[f.key] || '').trim()) {
          toast(`${f.label || '该字段'} 必填`, 'warn');
          return;
        }
      }
      cleanup(isSingle ? (result['__single'] || '') : result);
    };
    const keyHandler = (e) => {
      if (modal.style.display !== 'flex') return;
      if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
      else if (e.key === 'Enter' && fields.length === 1 && fields[0].type !== 'textarea') {
        e.preventDefault();
        onOk();
      }
    };
    document.getElementById('genericPromptOk').onclick = onOk;
    document.getElementById('genericPromptCancel').onclick = () => cleanup(null);
    document.getElementById('genericPromptClose').onclick = () => cleanup(null);
    document.addEventListener('keydown', keyHandler, true);
    modal.style.display = 'flex';
    setTimeout(() => {
      const firstInput = body.querySelector('[data-key]');
      if (firstInput) { firstInput.focus(); if (firstInput.select) firstInput.select(); }
    }, 100);
  });
}

// 编辑工作台内部备注（不同步到 Shopify）- 用自定义弹窗
let INTERNAL_NOTE_EDITING_ID = null;
function editInternalNote(orderId) {
  const o = SHOPIFY._orders.find(x => x.id === orderId);
  if (!o) return;
  INTERNAL_NOTE_EDITING_ID = orderId;
  document.getElementById('internalNoteOrderNo').textContent = o.shopify_order_number || '';
  document.getElementById('internalNoteText').value = o.internal_note || '';
  document.getElementById('internalNoteModal').style.display = 'flex';
  setTimeout(() => document.getElementById('internalNoteText').focus(), 100);
}

function closeInternalNoteModal() {
  document.getElementById('internalNoteModal').style.display = 'none';
  INTERNAL_NOTE_EDITING_ID = null;
}

async function saveInternalNote() {
  if (!INTERNAL_NOTE_EDITING_ID) return;
  const o = SHOPIFY._orders.find(x => x.id === INTERNAL_NOTE_EDITING_ID);
  if (!o) return;
  const newNote = document.getElementById('internalNoteText').value.trim();
  try {
    await sb.from('shopify_orders').update({
      internal_note: newNote,
      updated_at: new Date().toISOString(),
    }).eq('id', INTERNAL_NOTE_EDITING_ID);
    o.internal_note = newNote;
    toast('✓ 已保存内部备注');
    closeInternalNoteModal();
    renderShopifyOrders();
  } catch (e) { toast('保存失败：' + (e.message || e), 'err'); }
}

async function shopifyStartProcessing(orderId) {
  try {
    await SHOPIFY.setOrderStatus(orderId, 'processing');
    toast('已进入"待处理"');
    await shopifyReloadOrdersAndRender();
    shopifyShowFilter('processing');
  } catch (e) {
    toast('操作失败：' + (e.message || e), 'err');
  }
}

async function shopifyCancelOrder(orderId) {
  if (!confirm('确认取消这个销售订单？（可后续恢复）')) return;
  try {
    await SHOPIFY.setOrderStatus(orderId, 'cancelled');
    toast('已取消');
    await shopifyReloadOrdersAndRender();
  } catch (e) {
    toast('操作失败：' + (e.message || e), 'err');
  }
}

async function shopifyMarkDone(orderId) {
  if (!confirm('确认标记这个订单为"已完成"？（所有 PO 都已开完）')) return;
  try {
    await SHOPIFY.setOrderStatus(orderId, 'done');
    toast('✓ 已完成');
    await shopifyReloadOrdersAndRender();
  } catch (e) {
    toast('操作失败：' + (e.message || e), 'err');
  }
}

async function shopifyReopenOrder(orderId) {
  try {
    await SHOPIFY.setOrderStatus(orderId, 'processing');
    toast('已重开');
    await shopifyReloadOrdersAndRender();
    shopifyShowFilter('processing');
  } catch (e) {
    toast('操作失败：' + (e.message || e), 'err');
  }
}

function shopifyOpenPoForm(orderId) {
  openPoForm(orderId);
}

function openImgLightbox(url) {
  const box = document.getElementById('imgLightbox');
  const img = document.getElementById('imgLightboxImg');
  if (!box || !img) return;
  // 先显示加载占位（避免大图加载时卡顿感）
  img.removeAttribute('src');
  img.style.opacity = '0.3';
  box.classList.add('show');
  document.body.style.overflow = 'hidden';
  // 异步加载新图
  const tmp = new Image();
  tmp.onload = () => {
    img.src = url;
    img.style.opacity = '1';
  };
  tmp.onerror = () => {
    img.style.opacity = '1';
    img.src = url;  // 也设置一下，让原生错误图标显示
  };
  tmp.src = url;
}

function closeImgLightbox(e) {
  const box = document.getElementById('imgLightbox');
  if (!box) return;
  // 点图片本身不关闭（避免误触）；点 ✕ 或 背景关闭
  if (e && e.target && e.target.tagName === 'IMG') return;
  box.classList.remove('show');
  document.body.style.overflow = '';
}

// ============ 自动同步 ============
const SHOPIFY_AUTOSYNC_KEY = 'shopify_autosync_on';

function shopifyAutoSyncOn() {
  return localStorage.getItem(SHOPIFY_AUTOSYNC_KEY) !== '0';
}

function shopifyToggleAutoSync() {
  const on = !shopifyAutoSyncOn();
  localStorage.setItem(SHOPIFY_AUTOSYNC_KEY, on ? '1' : '0');
  if (on) {
    shopifyStartAutoSync();
    toast('自动同步已开启 · 每 5 分钟自动拉单');
  } else {
    shopifyStopAutoSync();
    toast('自动同步已关闭');
  }
  shopifyUpdateAutoSyncIndicator();
}

function shopifyUpdateAutoSyncIndicator() {
  const btn = document.getElementById('salesAutoSyncBtn');
  const ind = document.getElementById('salesAutoSyncIndicator');
  if (!btn || !ind) return;
  const on = shopifyAutoSyncOn();
  btn.classList.toggle('on', on);
  btn.innerHTML = on ? '⏱️ 自动 ✓' : '⏱️ 自动';
  ind.textContent = on ? '自动同步：开 · 5 分钟' : '自动同步：关';
}

function shopifyStartAutoSync() {
  shopifyStopAutoSync();
  SHOPIFY._autoSyncTimer = setInterval(async () => {
    if (CURRENT_TAB !== 'sales') return;
    const shop = document.getElementById('salesFetchShop')?.value;
    if (!shop) return;
    try {
      const status = document.getElementById('salesFetchStatus').value;
      const from = document.getElementById('salesFetchFrom').value;
      const to = document.getElementById('salesFetchTo').value;
      const params = { status, limit: 100, auto_save: true };
      if (from) params.created_at_min = from + 'T00:00:00Z';
      if (to) params.created_at_max = to + 'T23:59:59Z';
      const r = await SHOPIFY.call('list_orders', params, shop);
      const prevIds = new Set(SHOPIFY._orders.map(o => o.shopify_order_id));
      await shopifyReloadOrdersAndRender();
      const newCount = SHOPIFY._orders.filter(o => !prevIds.has(o.shopify_order_id)).length;
      const hint = document.getElementById('salesFetchHint');
      if (hint) hint.textContent = `自动同步：${r.count} 单 · ${new Date().toLocaleTimeString()}`;
      if (newCount > 0) {
        toast(`🔔 自动同步：新到 ${newCount} 个订单`);
      }
    } catch (e) {
      console.warn('自动同步失败', e);
    }
  }, 5 * 60 * 1000);
}

function shopifyStopAutoSync() {
  if (SHOPIFY._autoSyncTimer) { clearInterval(SHOPIFY._autoSyncTimer); SHOPIFY._autoSyncTimer = null; }
}

// ============ 销售单 tab 初始化 ============
async function renderSales() {
  if (!SHOPIFY._initialized) {
    setSalesDefaultDates();
    shopifyUpdateAutoSyncIndicator();
    SHOPIFY._initialized = true;
    if (shopifyAutoSyncOn()) shopifyStartAutoSync();
  }
  // 切回 tab：优先用缓存（renderShopifyOrders 用已有数据）；缓存过期或为空时才查 DB
  if (SHOPIFY._orders.length > 0 && SHOPIFY._ordersLoadedAt && (Date.now() - SHOPIFY._ordersLoadedAt < 60000)) {
    // 缓存仍新鲜：直接渲染
    if (SHOPIFY._stores.length === 0) await shopifyReloadStores();
    shopifyRefreshCounts();
    renderShopifyOrders();
  } else {
    await shopifyReloadStores();
    await shopifyReloadOrdersAndRender();
  }
}


