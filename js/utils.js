// ============================================================
// 跟单团队工作台 · utils.js
// 通用工具 · 截图上传 / 导出 HTML / showPrompt / 图片上传 / 同步状态 / 自动同步
// ============================================================
// 依赖：core.js
// ============================================================

// ============================================================
// V4-2026-05-24：催单 / 售后 # 列产品大图样式（自动注入到页面）
// 不动 styles.css，避免改 index.html。第一次加载时一次性 append。
// ============================================================
(function injectRowProdThumbCSS() {
  if (document.getElementById('row-prod-thumb-style')) return;
  const style = document.createElement('style');
  style.id = 'row-prod-thumb-style';
  style.textContent = `
    /* # 列容器：允许产品图块在内部垂直堆叠 */
    .row-num.row-num-with-thumb {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 8px 6px;
      min-width: 92px;
    }
    .row-num.row-num-with-thumb .row-num-idx {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-secondary);
    }

    /* 产品图容器：80×80，圆角，灰底，紫色"产品"角标，hover 放大 */
    .row-prod-thumb {
      position: relative;
      width: 80px;
      height: 80px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      z-index: 1;
    }
    .row-prod-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    /* 紫色"产品"角标（产品库标准图） */
    .row-prod-thumb.has-img.src-product::before {
      content: "产品";
      position: absolute;
      top: 2px;
      left: 2px;
      background: rgba(124, 58, 237, 0.92);
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      pointer-events: none;
      z-index: 2;
    }
    /* 蓝色"实拍"角标（兜底用沟通截图） */
    .row-prod-thumb.has-img.src-manual::before {
      content: "实拍";
      position: absolute;
      top: 2px;
      left: 2px;
      background: rgba(37, 99, 235, 0.92);
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      pointer-events: none;
      z-index: 2;
    }
    /* 兼容：旧版没传图源 class 时也加默认"产品"角标 */
    .row-prod-thumb.has-img:not(.src-product):not(.src-manual)::before {
      content: "产品";
      position: absolute;
      top: 2px;
      left: 2px;
      background: rgba(124, 58, 237, 0.92);
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      pointer-events: none;
      z-index: 2;
    }
    /* +N 张计数角标 */
    .row-prod-thumb .row-prod-badge-count {
      position: absolute;
      bottom: 2px;
      right: 2px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      pointer-events: none;
      z-index: 2;
    }
    /* 无图占位：浅灰色 + 居中相机图标 */
    .row-prod-thumb.no-img {
      background: var(--bg-subtle, #f5f5f5);
      border-style: dashed;
      cursor: default;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .row-prod-thumb .row-prod-fallback {
      font-size: 22px;
      opacity: 0.35;
      color: var(--text-tertiary);
    }
    .row-prod-thumb.no-img:hover {
      /* 无图不放大 */
      transform: none;
    }

    /* hover 放大效果：有图的图变成 2× + 阴影 + 提升层级 */
    .row-prod-thumb.has-img:hover {
      transform: scale(2.2);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      z-index: 100;
      border-color: var(--accent, #2563eb);
    }
    /* 鼠标移开时图也带过渡（更顺滑） */
    .row-prod-thumb.has-img {
      transform-origin: center left;  /* 向右放大，避免左侧被列边裁掉 */
    }

    /* V4-2026-05-24 修复：之前用 .record-row { overflow: visible !important } 是粗暴方案,
       会导致页面所有行的 sticky 容器穿透（页头透出列表文字）。
       现在改成：默认行 overflow 不动，只在 hover 产品图时临时放开。
       同时配合下方 JS 监听给行加 .thumb-hovering class（兼容老浏览器）。*/
    .record-row.thumb-hovering {
      overflow: visible !important;
      z-index: 100;
      position: relative;
    }
    /* 现代浏览器（Chrome 105+）也可用 :has() 自动生效 */
    @supports selector(:has(*)) {
      .record-row:has(.row-prod-thumb.has-img:hover) {
        overflow: visible !important;
        z-index: 100;
        position: relative;
      }
    }
  `;
  document.head.appendChild(style);
})();

// V4-2026-05-24：JS 监听给行加/移 .thumb-hovering（兼容老浏览器,与 :has() 双保险）
(function _bindThumbHoverListener() {
  if (window._thumbHoverBound) return;
  window._thumbHoverBound = true;
  document.addEventListener('mouseover', (e) => {
    const thumb = e.target.closest && e.target.closest('.row-prod-thumb.has-img');
    if (thumb) {
      const row = thumb.closest('.record-row');
      if (row) row.classList.add('thumb-hovering');
    }
  }, true);
  document.addEventListener('mouseout', (e) => {
    const thumb = e.target.closest && e.target.closest('.row-prod-thumb.has-img');
    if (thumb) {
      const row = thumb.closest('.record-row');
      if (row) row.classList.remove('thumb-hovering');
    }
  }, true);
})();

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
  } else if (target === 'issue_orig') {
    // V22-CY+: 供应商问题主描述区的图片
    persistCurrentIssue(it => { if (!it.screenshots) it.screenshots = []; it.screenshots.push(dataURL); }, true);
    _renderIssueModal({ isDraft: false });
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

// V5-W3-2026-05-26: 统一所有 gallery 函数到 #imgLightbox(不再用 #imageViewer)
//   原因:用户希望催单/售后/找灯/会议/供应商问题/销售单/PO/产品库 全部共享一个 lightbox
//   原 #imageViewer DOM 保留作为 dormant 元素(防止某处直接引用报错)
//   所有 JS 调用点(viewImage / viewImageGallery)接口不变,内部全部代理到 #imgLightbox
function viewImage(src) {
  // 单图:清空多图状态(防止还残留 prev/next 按钮),然后用 openImgLightbox 显示
  _galleryImages = [];
  _galleryIndex = 0;
  _ensureLightboxNav(false);  // 隐藏多图导航
  openImgLightbox(src);
}

// V4：通过订单号查关联销售单/PO 的产品图（售后、催单等模块用）
// 输入：orderNo (string) 如 "K115302"
// 输出：[image_url, ...] 数组
// 实现：先通过 orderNo 找到订单 → 拿出 line_items 的 SKU 列表 → 
//      按 SKU 反查 SHOPIFY._productMap 或 PRODUCTS_CACHE 拿到产品图
function _getRelatedOrderImages(orderNo) {
  if (!orderNo) return [];
  const cleanNo = String(orderNo).trim().replace(/^#/, '');
  if (!cleanNo) return [];
  
  // 1. 优先从 SHOPIFY._orders 找（销售单）
  let lineItems = [];
  if (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
    const so = SHOPIFY._orders.find(o => {
      const num = String(o.shopify_order_number || '').replace('#', '');
      const name = String(o.name || '').replace('#', '');
      return num === cleanNo || name === cleanNo;
    });
    if (so && so.line_items) lineItems = so.line_items;
  }
  
  // 2. 兜底从 PO_LIST 找（按 po_number 或 order_no）
  if (lineItems.length === 0 && typeof PO_LIST !== 'undefined' && PO_LIST.length > 0) {
    const po = PO_LIST.find(p => 
      String(p.po_number || '').trim() === cleanNo || 
      String(p.order_no || '').trim() === cleanNo
    );
    if (po && po.line_items) lineItems = po.line_items;
  }
  
  if (lineItems.length === 0) return [];
  
  // 通过 SKU 反查产品图（line_items 本身没有 image_url 字段）
  const productMap = (typeof SHOPIFY !== 'undefined' && SHOPIFY._productMap) ? SHOPIFY._productMap : {};
  const imgs = [];
  for (const li of lineItems) {
    let img = '';
    // 先看 line_item 本身有没有（PO 创建时可能直接存了 image_url，比如自定义 PO）
    if (li.image_url) img = li.image_url;
    else if (li.image) img = li.image;
    // 否则按 SKU 从产品库反查
    else if (li.sku) {
      // 优先 SHOPIFY._productMap
      if (productMap[li.sku] && productMap[li.sku].image_url) {
        img = productMap[li.sku].image_url;
      }
      // 兜底 PRODUCTS_CACHE
      else if (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.effectiveBySku) {
        const p = PRODUCTS_CACHE.effectiveBySku(li.sku);
        if (p && p.image_url) img = p.image_url;
      }
    }
    if (img) imgs.push(img);
  }
  return imgs;
}

function closeImageViewer() {
  // V5-W3-2026-05-26:代理到 closeImgLightbox(不带 event,所以不会被 IMG 检查拦截)
  if (typeof closeImgLightbox === 'function') closeImgLightbox();
  _galleryImages = [];
  _galleryIndex = 0;
  _ensureLightboxNav(false);
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
  // V5-W3-2026-05-26:用 openImgLightbox 显示(享受异步加载 + body lock + 店小秘式 CSS)
  openImgLightbox(cur);
  // 多图时添加/更新左右切换控件 → 现在加到 #imgLightbox 里
  _ensureLightboxNav(_galleryImages.length > 1);
}

// V5-W3-2026-05-26:把多图导航控件加到 #imgLightbox(原来加在 #imageViewer)
function _ensureLightboxNav(show) {
  const viewer = document.getElementById('imgLightbox');
  if (!viewer) return;
  let nav = viewer.querySelector('.gallery-nav');
  if (show) {
    if (!nav) {
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
    nav.style.display = 'flex';
    const counter = document.getElementById('galleryCounter');
    if (counter) counter.textContent = `${_galleryIndex + 1} / ${_galleryImages.length}`;
  } else if (nav) {
    nav.style.display = 'none';
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

// V5-W3-2026-05-26:键盘监听切到 #imgLightbox
// 左右方向键切换 / ESC 关闭(图片预览打开时生效)
document.addEventListener('keydown', (e) => {
  const viewer = document.getElementById('imgLightbox');
  if (!viewer || !viewer.classList.contains('show')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeImageViewer(); return; }
  if (_galleryImages.length < 2) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); galleryPrev(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); galleryNext(); }
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



// ============================================================
// V4 R4 升级版 (2026-05-24)：导出 PDF 预览 + 卡片排版
// 改进点（针对老版的问题）：
//   ✅ 不再截屏页面 DOM（避免按钮/侧栏污染、乱码）
//   ✅ 每个 tab 用专属"打印版"卡片渲染（屏幕外 DOM）
//   ✅ 点【📥 PDF】先弹预览，确认无误后再下载
//   ✅ 中文全部走 html2canvas 渲染（不用 pdf.text），杜绝乱码
//   ✅ 自适应分页（按 A4 横向自动切分）
//   ✅ 含图（卡片里的 img 标签 html2canvas 会渲染进去）
//
// 4 个 tab 都按"卡片版"统一排版：
//   左侧 # 号 + 80×80 产品图
//   中间订单号、网站、状态、供应商、原因/类型、描述、最近沟通
//   右侧 状态徽章 + 发起日期 + 逾期天数
// ============================================================

// 注入打印版的 CSS（屏幕外的 DOM 也要用）
(function _injectExportPrintCSS() {
  if (document.getElementById('export-print-style')) return;
  const s = document.createElement('style');
  s.id = 'export-print-style';
  s.textContent = `
    .export-print-page {
      width: 1100px;
      padding: 32px 36px;
      background: white;
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
      color: #1f2937;
      box-sizing: border-box;
    }
    .export-print-header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 14px;
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .export-print-header .epp-title {
      font-size: 26px; font-weight: 700; color: #111827;
      letter-spacing: 0.5px;
    }
    .export-print-header .epp-meta {
      font-size: 13px; color: #6b7280;
      text-align: right;
      line-height: 1.6;
    }
    .export-print-card {
      display: grid;
      grid-template-columns: 36px 92px 1fr 180px;
      gap: 14px;
      align-items: stretch;
      padding: 14px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      margin-bottom: 10px;
      background: white;
      page-break-inside: avoid;
    }
    .export-print-card.overdue {
      border-left: 4px solid #dc2626;
      background: linear-gradient(to right, #fef2f2, white 12%);
    }
    .export-print-card.resolved {
      border-left: 4px solid #10b981;
      background: linear-gradient(to right, #ecfdf5, white 12%);
      opacity: 0.85;
    }
    .epc-num {
      font-size: 18px; font-weight: 700;
      color: #6b7280;
      display: flex; align-items: center; justify-content: center;
    }
    .epc-img-wrap {
      width: 80px; height: 80px;
      border-radius: 8px;
      overflow: hidden;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .epc-img-wrap img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .epc-img-wrap .no-img {
      font-size: 24px; opacity: 0.4;
    }
    .epc-body {
      display: flex; flex-direction: column; gap: 4px;
      min-width: 0;
    }
    .epc-row-title {
      font-size: 15px; font-weight: 700;
      color: #111827;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .epc-tag {
      display: inline-block;
      padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 600;
      background: #e0e7ff; color: #3730a3;
    }
    .epc-tag.site-VK { background: #dbeafe; color: #1e40af; }
    .epc-tag.site-DF { background: #fce7f3; color: #9d174d; }
    .epc-tag.site-DC { background: #fef3c7; color: #92400e; }
    .epc-tag.site-PL { background: #d1fae5; color: #065f46; }
    .epc-tag.site-RD { background: #fee2e2; color: #991b1b; }
    .epc-tag.site-MH { background: #e0e7ff; color: #3730a3; }
    .epc-tag.site-LS { background: #fae8ff; color: #86198f; }
    .epc-tag.site-MJ { background: #fed7aa; color: #9a3412; }
    .epc-tag.site-RS { background: #cffafe; color: #155e75; }
    .epc-tag.reason {
      background: #fee2e2; color: #b91c1c;
    }
    .epc-tag.category {
      background: rgba(124,58,237,0.08); color: #6d28d9;
    }
    .epc-line {
      font-size: 12.5px; color: #374151;
      line-height: 1.5;
      word-break: break-all;
    }
    .epc-line .label {
      color: #6b7280; font-weight: 600;
      display: inline-block;
      min-width: 56px;
    }
    .epc-line.desc {
      color: #1f2937;
      padding: 4px 8px;
      background: #f9fafb;
      border-radius: 4px;
      border-left: 3px solid #d1d5db;
      margin-top: 2px;
    }
    .epc-line.last-fu {
      color: #4b5563;
      padding: 4px 8px;
      background: #eff6ff;
      border-radius: 4px;
      border-left: 3px solid #3b82f6;
      margin-top: 2px;
      font-size: 12px;
    }
    .epc-side {
      display: flex; flex-direction: column; gap: 4px;
      align-items: flex-end;
      text-align: right;
      flex-shrink: 0;
    }
    .epc-status {
      padding: 4px 12px; border-radius: 6px;
      font-size: 12px; font-weight: 700;
      background: #fef3c7; color: #92400e;
    }
    .epc-status.s-resolved { background: #d1fae5; color: #065f46; }
    .epc-status.s-cancelled { background: #f3f4f6; color: #6b7280; }
    .epc-status.s-in_progress, .epc-status.s-shipped { background: #dbeafe; color: #1e40af; }
    .epc-status.s-pending { background: #fef3c7; color: #92400e; }
    .epc-status.s-escalated, .epc-status.s-overdue { background: #fee2e2; color: #991b1b; }
    .epc-side-date {
      font-size: 11.5px; color: #6b7280;
    }
    .epc-side-overdue {
      font-size: 12px; font-weight: 700; color: #dc2626;
    }
    .epc-side-followups {
      font-size: 11.5px; color: #6b7280;
    }
    .export-print-footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px dashed #d1d5db;
      font-size: 11px; color: #9ca3af;
      text-align: center;
    }
    
    /* 预览框 modal */
    .export-preview-modal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.78);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      animation: epmFadeIn 0.18s ease-out;
    }
    @keyframes epmFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .export-preview-content {
      background: white; border-radius: 12px;
      max-width: 92vw; max-height: 92vh;
      display: flex; flex-direction: column;
      box-shadow: 0 24px 64px rgba(0,0,0,0.4);
      overflow: hidden;
    }
    .export-preview-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 20px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(to bottom, #f9fafb, #fff);
      flex-shrink: 0;
    }
    .export-preview-title {
      font-size: 15px; font-weight: 600; color: #111827;
      display: flex; align-items: center; gap: 8px;
    }
    .export-preview-title .epm-tag {
      background: #2563eb; color: white;
      padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 700;
    }
    .export-preview-close {
      width: 30px; height: 30px;
      border: none; background: transparent;
      cursor: pointer; font-size: 18px; color: #6b7280;
      border-radius: 6px; line-height: 1;
    }
    .export-preview-close:hover { background: #fee2e2; color: #dc2626; }
    .export-preview-body {
      flex: 1; min-height: 0;
      overflow: auto;
      padding: 20px;
      background: #f3f4f6;
      text-align: center;
    }
    .export-preview-body img {
      max-width: 100%;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      background: white;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .export-preview-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid #e5e7eb;
      background: #fafafa;
      flex-shrink: 0;
    }
    .export-preview-actions .ep-btn {
      padding: 8px 16px; border-radius: 6px;
      border: 1px solid #d1d5db; background: white;
      cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .export-preview-actions .ep-btn.primary {
      background: #2563eb; color: white; border-color: #2563eb;
    }
    .export-preview-actions .ep-btn.primary:hover { background: #1d4ed8; }
    .export-preview-actions .ep-btn:not(.primary):hover { background: #f3f4f6; }
    .export-preview-actions .ep-hint {
      flex: 1; font-size: 12px; color: #6b7280;
      display: flex; align-items: center;
    }
    
    /* tab 顶部导出按钮组 */
    .export-btn-group {
      display: inline-flex;
      gap: 6px;
      margin-left: 8px;
    }
    .export-btn-group .btn.small {
      padding: 5px 12px;
      font-size: 12px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      color: #374151;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .export-btn-group .btn.small:hover {
      background: #e5e7eb;
      border-color: #9ca3af;
    }
    /* R2 供应商问题逾期行高亮 */
    .record-row.issue-overdue {
      background: linear-gradient(to right, rgba(220, 38, 38, 0.04), transparent 30%) !important;
      border-left: 3px solid #dc2626 !important;
    }
  `;
  document.head.appendChild(s);
})();

// ============================================================
// 卡片渲染：根据 tab 类型,把数据行渲染成统一的卡片 HTML
// ============================================================
function _renderExportCardHTML(item, index, type) {
  // 通用工具
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _formatDate = (d) => {
    if (!d) return '';
    if (typeof d === 'string' && d.length >= 10) return d.slice(0, 10);
    try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d); }
  };
  
  let img = '', orderNo = '', site = '', supplier = '', status = '', statusLabel = '', 
      reason = '', desc = '', lastFu = '', startDate = '', sideExtra = '', isOverdue = false, isResolved = false;
  
  if (type === 'orders') {
    // 催单
    const manualScreenshots = [...(item.screenshots || []), ...((item.followups || []).flatMap(f => f.screenshots || []))];
    let productImages = [];
    if (item._isPO && item.lineItems) {
      productImages = item.lineItems.map(li => li.image_url || li.image || '').filter(Boolean);
    } else if (item.orderNo && typeof _getRelatedOrderImages === 'function') {
      productImages = _getRelatedOrderImages(item.orderNo);
    }
    if (productImages.length === 0 && manualScreenshots.length > 0) productImages = manualScreenshots;
    img = productImages[0] || '';
    orderNo = item.orderNo || '⚠ 待填订单号';
    site = item.site || '';
    supplier = item.supplier || '未填供应商';
    status = item.status || '';
    statusLabel = (typeof ORDER_STATUS_LABELS !== 'undefined' && ORDER_STATUS_LABELS[status]) || status || '未知';
    desc = item.product || '';
    if (item.followups && item.followups.length > 0) {
      const last = item.followups[item.followups.length - 1];
      lastFu = `📞 ${_formatDate(last.date)}: ${(last.note || '').slice(0, 100)}`;
    }
    startDate = _formatDate(item.orderDate);
    const days = (typeof chaseDaysSince === 'function') ? chaseDaysSince(item) : 0;
    if (days > 0) {
      if (days >= 15) { isOverdue = true; sideExtra = `<div class="epc-side-overdue">⏰ 已 ${days} 天</div>`; }
      else { sideExtra = `<div class="epc-side-followups">已 ${days} 天</div>`; }
    }
    if (status === 'arrived') isResolved = true;
  }
  else if (type === 'aftersales') {
    // 售后
    const manualScreenshots = [...(item.screenshots || []), ...((item.followups || []).flatMap(f => f.screenshots || []))];
    let productImages = (item.orderNo && typeof _getRelatedOrderImages === 'function') ? _getRelatedOrderImages(item.orderNo) : [];
    if (productImages.length === 0 && manualScreenshots.length > 0) productImages = manualScreenshots;
    img = productImages[0] || '';
    orderNo = item.orderNo || '⚠ 待填订单号';
    site = item.site || '';
    supplier = item.supplier || '未填供应商';
    status = item.status || '';
    statusLabel = (typeof AFTER_STATUS_LABELS !== 'undefined' && AFTER_STATUS_LABELS[status]) || status || '未知';
    reason = item.reason || '未选原因';
    desc = item.reasonDetail || item.product || '';
    if (item.followups && item.followups.length > 0) {
      const last = item.followups[item.followups.length - 1];
      lastFu = `📞 ${_formatDate(last.date)}: ${(last.note || '').slice(0, 100)}`;
    }
    startDate = _formatDate(item.createdDate);
    const today = new Date();
    if (item.createdDate) {
      const days = Math.floor((today - new Date(item.createdDate)) / 86400000);
      if (days >= 7 && status !== 'resolved') sideExtra = `<div class="epc-side-overdue">⏰ ${days} 天</div>`;
      else if (days > 0) sideExtra = `<div class="epc-side-followups">${days} 天</div>`;
    }
    if (status === 'resolved') isResolved = true;
  }
  else if (type === 'issues') {
    // 供应商问题
    img = '';  // 供应商问题暂无产品图（可能未来加）
    orderNo = item.supplier || '⚠ 待填供应商';  // 用供应商名当主标题
    site = item.site || '';
    supplier = '';  // 上面已经显示
    status = item.status || '';
    statusLabel = (typeof ISSUE_STATUS_LABELS !== 'undefined' && ISSUE_STATUS_LABELS[status]) || status || '未知';
    // 大类显示
    const catMeta = (typeof _getIssueCategoryMeta === 'function') ? _getIssueCategoryMeta(item) : null;
    reason = catMeta ? `${catMeta.icon} ${catMeta.label}` : (item.issueType || '未分类');
    // 小标签
    if (item.subTags && item.subTags.length > 0) {
      reason += ' · ' + item.subTags.slice(0, 3).join(' / ');
    }
    desc = item.description || item.requirement || '';
    if (item.followups && item.followups.length > 0) {
      const last = item.followups[item.followups.length - 1];
      lastFu = `📞 ${_formatDate(last.date)}: ${(last.note || '').slice(0, 100)}`;
    }
    startDate = _formatDate(item.createdDate || item.createdAt);
    // 跟进逾期
    if (item.nextFollowDate && status !== 'resolved' && status !== 'cancelled') {
      const today = new Date().toISOString().slice(0, 10);
      if (item.nextFollowDate < today) {
        const overdueDays = Math.floor((new Date() - new Date(item.nextFollowDate)) / 86400000);
        isOverdue = true;
        sideExtra = `<div class="epc-side-overdue">⚠ 逾期 ${overdueDays} 天</div>`;
      } else {
        const daysLeft = Math.floor((new Date(item.nextFollowDate) - new Date()) / 86400000);
        sideExtra = `<div class="epc-side-followups">📅 ${daysLeft + 1} 天后跟进</div>`;
      }
    }
    if (status === 'resolved') isResolved = true;
  }
  else if (type === 'finance') {
    // 财务收货 (PO)
    img = (item.line_items && item.line_items[0]) ? (item.line_items[0].image_url || '') : '';
    orderNo = item.po_number || '⚠';
    site = '';
    supplier = item.supplier || '未填供应商';
    status = item.status || '';
    statusLabel = status === 'received' ? '已收货' : (status === 'arrived' ? '待收货' : status);
    reason = `关联销售单: ${item.order_no || '—'}`;
    desc = `共 ${(item.line_items || []).length} 项产品 · 总额 ¥ ${Number(item.total_amount || 0).toFixed(2)}`;
    startDate = _formatDate(item.created_at);
    if (status === 'received') isResolved = true;
  }
  
  const rowCls = (isOverdue ? 'overdue' : '') + (isResolved ? ' resolved' : '');
  const imgHtml = img 
    ? `<img src="${_esc(img)}" crossorigin="anonymous" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=&quot;no-img&quot;>📷</span>'">`
    : `<span class="no-img">📷</span>`;
  
  const siteTag = site ? `<span class="epc-tag site-${_esc(site)}">${_esc(site)}</span>` : '';
  const reasonTag = reason ? `<span class="epc-tag ${type === 'issues' ? 'category' : 'reason'}">${_esc(reason)}</span>` : '';
  
  return `
    <div class="export-print-card ${rowCls}">
      <div class="epc-num">${index + 1}</div>
      <div class="epc-img-wrap">${imgHtml}</div>
      <div class="epc-body">
        <div class="epc-row-title">
          ${_esc(orderNo)}
          ${siteTag}
          ${reasonTag}
        </div>
        ${supplier ? `<div class="epc-line"><span class="label">供应商：</span>${_esc(supplier)}</div>` : ''}
        ${desc ? `<div class="epc-line desc">${_esc(desc)}</div>` : ''}
        ${lastFu ? `<div class="epc-line last-fu">${_esc(lastFu)}</div>` : ''}
      </div>
      <div class="epc-side">
        <div class="epc-status s-${_esc(status)}">${_esc(statusLabel)}</div>
        ${startDate ? `<div class="epc-side-date">📅 ${_esc(startDate)}</div>` : ''}
        ${sideExtra}
      </div>
    </div>
  `;
}

// ============================================================
// 核心：构建专属打印版 DOM（屏幕外）+ 截图 + 弹预览
// ============================================================
async function _buildExportPageAndPreview(opts) {
  // opts: { type, items, title, fileName }
  if (!opts.items || opts.items.length === 0) {
    toast('当前没有可导出的数据', 'warn');
    return;
  }
  
  toast(`正在准备 ${opts.items.length} 条数据...`, 'info', 3000);
  
  // 加载工具
  try {
    if (typeof _loadHtml2Canvas !== 'function') throw new Error('html2canvas 加载器不可用（依赖 po.js）');
    await _loadHtml2Canvas();
    if (typeof _loadJsPdf !== 'function') throw new Error('jsPDF 加载器不可用（依赖 po.js）');
    await _loadJsPdf();
  } catch (e) {
    toast('导出工具加载失败：' + (e.message || e), 'err');
    return;
  }
  
  // 屏幕外构建专属"打印版"DOM
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed; left:-99999px; top:0; z-index:-1; background:white;';
  
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  const timeStr = today.toLocaleTimeString('zh-CN', { hour12: false });
  const currentUser = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '';
  
  const cardsHtml = opts.items.map((item, i) => _renderExportCardHTML(item, i, opts.type)).join('');
  
  wrap.innerHTML = `
    <div class="export-print-page">
      <div class="export-print-header">
        <div class="epp-title">${opts.title}</div>
        <div class="epp-meta">
          <div>📅 ${dateStr} ${timeStr}</div>
          <div>📊 共 ${opts.items.length} 条记录</div>
          ${currentUser ? `<div>👤 ${currentUser}</div>` : ''}
        </div>
      </div>
      <div class="export-print-body">
        ${cardsHtml}
      </div>
      <div class="export-print-footer">
        — Dekorfine 跟单工作台 · 自动生成于 ${dateStr} ${timeStr} —
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  
  // 等图片加载完
  const imgs = wrap.querySelectorAll('img');
  await Promise.all([...imgs].map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });
  }));
  
  // 截图整个 DOM
  let canvas;
  try {
    canvas = await window.html2canvas(wrap.querySelector('.export-print-page'), {
      backgroundColor: '#ffffff',
      scale: 1.6,  // 高清，但不至于让 PDF 过大
      useCORS: true,
      logging: false,
    });
  } catch (e) {
    toast('截图失败：' + (e.message || e), 'err');
    document.body.removeChild(wrap);
    return;
  } finally {
    document.body.removeChild(wrap);
  }
  
  // 显示预览
  _showExportPreview({ canvas, fileName: opts.fileName, title: opts.title, count: opts.items.length });
}

// ============================================================
// 预览框
// ============================================================
function _showExportPreview({ canvas, fileName, title, count }) {
  document.getElementById('exportPreviewModal')?.remove();
  
  const dataUrl = canvas.toDataURL('image/png');
  const modal = document.createElement('div');
  modal.id = 'exportPreviewModal';
  modal.className = 'export-preview-modal';
  modal.innerHTML = `
    <div class="export-preview-content">
      <div class="export-preview-header">
        <span class="export-preview-title">
          <span class="epm-tag">预览</span>
          ${title} · ${count} 条
        </span>
        <button class="export-preview-close" onclick="closeExportPreview()">✕</button>
      </div>
      <div class="export-preview-body">
        <img src="${dataUrl}" alt="导出预览">
      </div>
      <div class="export-preview-actions">
        <span class="ep-hint">💡 确认无误后下载 PDF / 复制图到剪贴板</span>
        <button class="ep-btn" onclick="closeExportPreview()">← 返回</button>
        <button class="ep-btn" onclick="exportPreviewCopyImage()">📋 复制图片</button>
        <button class="ep-btn primary" onclick="exportPreviewDownloadPDF()">📥 下载 PDF</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  window._exportPreviewCache = { canvas, fileName, title, count };
  
  // Esc 关闭
  const handler = (e) => { if (e.key === 'Escape') closeExportPreview(); };
  document.addEventListener('keydown', handler);
  modal._escHandler = handler;
  
  // 点遮罩关闭
  modal.addEventListener('click', (e) => { if (e.target === modal) closeExportPreview(); });
}

function closeExportPreview() {
  const modal = document.getElementById('exportPreviewModal');
  if (modal) {
    if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
    modal.remove();
  }
  window._exportPreviewCache = null;
}

// 在预览框里点【下载 PDF】
async function exportPreviewDownloadPDF() {
  const cache = window._exportPreviewCache;
  if (!cache) { toast('预览已失效', 'err'); return; }
  
  const { canvas, fileName } = cache;
  
  try {
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = 297;
    const pageHeight = 210;
    const margin = 6;
    const usableW = pageWidth - margin * 2;
    const usableH = pageHeight - margin * 2;
    
    // 计算缩放比例
    const imgW = usableW;
    const imgH = (canvas.height / canvas.width) * imgW;
    
    if (imgH <= usableH) {
      // 一页够
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, imgW, imgH);
    } else {
      // 多页：按页高切分（保持比例）
      const ratio = canvas.width / imgW;
      const pageCanvasH = usableH * ratio;
      
      let yOffset = 0;
      let pageNum = 1;
      while (yOffset < canvas.height) {
        const sliceH = Math.min(pageCanvasH, canvas.height - yOffset);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        
        if (pageNum > 1) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, imgW, (sliceH / canvas.width) * imgW);
        
        yOffset += sliceH;
        pageNum++;
      }
    }
    
    pdf.save(fileName);
    toast(`✓ 已下载 ${fileName}`);
    closeExportPreview();
  } catch (e) {
    toast('PDF 生成失败：' + (e.message || e), 'err');
  }
}

// 在预览框里点【复制图片到剪贴板】
async function exportPreviewCopyImage() {
  const cache = window._exportPreviewCache;
  if (!cache) { toast('预览已失效', 'err'); return; }
  
  cache.canvas.toBlob(async (blob) => {
    if (!blob) { toast('图片生成失败', 'err'); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('✓ 图片已复制到剪贴板，去微信/邮件 Ctrl+V 粘贴');
      closeExportPreview();
    } catch (e) {
      // 退回下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = cache.fileName.replace('.pdf', '.png');
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('剪贴板不可用，已自动下载图片', 'info');
      closeExportPreview();
    }
  }, 'image/png');
}

// ============================================================
// 通用 CSV 导出（Excel 能直接打开，不含图）
// ============================================================
function exportToCSV(rows, headers, filename) {
  if (!rows || rows.length === 0) { toast('没有可导出的数据', 'warn'); return; }
  
  const escapeCsv = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  
  const lines = [];
  if (headers && headers.length > 0) lines.push(headers.map(escapeCsv).join(','));
  rows.forEach(row => lines.push(row.map(escapeCsv).join(',')));
  
  const csv = '\ufeff' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `导出_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  
  toast(`✓ 已导出 ${rows.length} 行（CSV，Excel 可打开）`);
}

// ============================================================
// 4 个 tab 各自的导出入口
// ============================================================

// 催单
async function exportOrdersPDF() {
  if (typeof ORDERS === 'undefined' || !ORDERS) { toast('催单数据未加载', 'warn'); return; }
  // V4-2026-05-24: 导出当前可见(筛选 + 排序后),而不是全集
  const items = (window._lastVisibleOrders && window._lastVisibleOrders.length > 0) 
    ? window._lastVisibleOrders 
    : ORDERS.filter(o => !o.deletedAt);
  await _buildExportPageAndPreview({
    type: 'orders',
    items,
    title: '📋 催单清单' + (window._lastVisibleOrders ? ` (已筛选 ${items.length} 条)` : ''),
    fileName: `催单清单_${new Date().toISOString().slice(0,10)}.pdf`,
  });
}
function exportOrdersExcel() {
  if (typeof ORDERS === 'undefined' || !ORDERS) { toast('催单数据未加载', 'warn'); return; }
  const source = (window._lastVisibleOrders && window._lastVisibleOrders.length > 0) 
    ? window._lastVisibleOrders 
    : ORDERS.filter(o => !o.deletedAt);
  const rows = source.map(o => [
    o.orderNo || '', o.site || '', o.product || '', o.supplier || '', o.status || '',
    o.orderDate || '', o.promisedDate || '', (o.followups || []).length, o.notes || '',
  ]);
  exportToCSV(rows, ['订单号', '网站', '产品', '供应商', '状态', '下单日期', '承诺日期', '催单次数', '备注'],
    `催单清单_${new Date().toISOString().slice(0,10)}.csv`);
}

// 售后
async function exportAftersalesPDF() {
  if (typeof AFTERSALES === 'undefined' || !AFTERSALES) { toast('售后数据未加载', 'warn'); return; }
  // V4-2026-05-24: 导出当前可见(筛选 + 排序后),而不是全集
  const items = (window._lastVisibleAftersales && window._lastVisibleAftersales.length > 0) 
    ? window._lastVisibleAftersales 
    : AFTERSALES.filter(a => !a.deletedAt);
  await _buildExportPageAndPreview({
    type: 'aftersales',
    items,
    title: '🔧 售后清单' + (window._lastVisibleAftersales ? ` (已筛选 ${items.length} 条)` : ''),
    fileName: `售后清单_${new Date().toISOString().slice(0,10)}.pdf`,
  });
}
function exportAftersalesExcel() {
  if (typeof AFTERSALES === 'undefined' || !AFTERSALES) { toast('售后数据未加载', 'warn'); return; }
  const source = (window._lastVisibleAftersales && window._lastVisibleAftersales.length > 0) 
    ? window._lastVisibleAftersales 
    : AFTERSALES.filter(a => !a.deletedAt);
  const rows = source.map(a => [
    a.orderNo || '', a.site || '', a.product || '', a.supplier || '', a.reason || '',
    a.status || '', a.createdDate || '', a.nextFollow || '', (a.followups || []).length, a.reasonDetail || '',
  ]);
  exportToCSV(rows, ['订单号', '网站', '产品', '供应商', '原因', '状态', '发起日期', '下次跟进', '跟进次数', '详情'],
    `售后清单_${new Date().toISOString().slice(0,10)}.csv`);
}

// 供应商问题
async function exportIssuesPDF() {
  if (typeof ISSUES === 'undefined' || !ISSUES) { toast('问题数据未加载', 'warn'); return; }
  const items = ISSUES.filter(it => !it.deletedAt);
  await _buildExportPageAndPreview({
    type: 'issues',
    items,
    title: '⚠ 供应商问题清单',
    fileName: `供应商问题_${new Date().toISOString().slice(0,10)}.pdf`,
  });
}
function exportIssuesExcel() {
  if (typeof ISSUES === 'undefined' || !ISSUES) { toast('问题数据未加载', 'warn'); return; }
  const catLabel = (it) => {
    if (typeof _getIssueCategoryMeta !== 'function') return it.category || it.issueType || '';
    const m = _getIssueCategoryMeta(it);
    return m ? m.label : (it.issueType || '');
  };
  const rows = ISSUES.filter(it => !it.deletedAt).map(it => [
    it.site || '', it.supplier || '', catLabel(it),
    (it.subTags || []).join(' / '), it.description || it.requirement || '',
    it.status || '', it.createdDate || '', it.nextFollowDate || '', (it.followups || []).length,
  ]);
  exportToCSV(rows, ['网站', '供应商', '问题大类', '具体类型', '描述', '状态', '发起日期', '下次跟进', '沟通次数'],
    `供应商问题_${new Date().toISOString().slice(0,10)}.csv`);
}

// 财务收货
async function exportFinancePDF() {
  if (typeof PO_LIST === 'undefined' || !PO_LIST) { toast('PO 数据未加载', 'warn'); return; }
  const items = PO_LIST.filter(p => ['arrived', 'received'].includes(p.status));
  if (items.length === 0) { toast('没有待收货/已收货的 PO', 'warn'); return; }
  await _buildExportPageAndPreview({
    type: 'finance',
    items,
    title: '💰 财务收货清单',
    fileName: `财务收货_${new Date().toISOString().slice(0,10)}.pdf`,
  });
}
function exportFinanceExcel() {
  if (typeof PO_LIST === 'undefined' || !PO_LIST) { toast('PO 数据未加载', 'warn'); return; }
  const rows = PO_LIST.filter(p => ['arrived', 'received'].includes(p.status)).map(p => [
    p.po_number || '', p.supplier || '', p.order_no || '', p.status || '',
    p.total_amount || 0,
    p.created_at ? p.created_at.slice(0, 10) : '',
    p.updated_at ? p.updated_at.slice(0, 10) : '',
    (p.line_items || []).length,
  ]);
  exportToCSV(rows, ['PO号', '供应商', '销售单号', '状态', '总金额', '开单日期', '更新日期', '商品行数'],
    `财务收货_${new Date().toISOString().slice(0,10)}.csv`);
}

// 自动注入导出按钮到 4 个 tab
(function _autoInjectExportButtons() {
  const tryInject = () => {
    const tabs = [
      { tab: 'orders-tab', anchorSelector: 'button[onclick*="addOrder"]', prefix: 'orders' },
      { tab: 'aftersales-tab', anchorSelector: 'button[onclick*="addAftersales"]', prefix: 'aftersales' },
      { tab: 'issues-tab', anchorSelector: 'button[onclick*="addIssue"]', prefix: 'issues' },
      { tab: 'finance-tab', anchorSelector: '#finance-tab .records-card', prefix: 'finance' },
    ];
    
    tabs.forEach(t => {
      const exists = document.querySelector(`[data-export-injected="${t.prefix}"]`);
      if (exists) return;
      
      let anchor = document.querySelector(t.anchorSelector);
      if (!anchor) return;
      
      const group = document.createElement('span');
      group.className = 'export-btn-group';
      group.setAttribute('data-export-injected', t.prefix);
      const cap = t.prefix.charAt(0).toUpperCase() + t.prefix.slice(1);
      group.innerHTML = `
        <button class="btn small" onclick="export${cap}PDF()" title="导出当前列表 → 先弹预览，确认后下载 PDF（含图）">📥 PDF</button>
        <button class="btn small" onclick="export${cap}Excel()" title="导出 Excel/CSV（不含图）">📊 Excel</button>
      `;
      anchor.parentNode.insertBefore(group, anchor.nextSibling);
    });
  };
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(tryInject, 800);
    setTimeout(tryInject, 2000);
    setTimeout(tryInject, 4000);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryInject, 800);
      setTimeout(tryInject, 2000);
      setTimeout(tryInject, 4000);
    });
  }
  
  window._injectExportButtons = tryInject;
})();

// ============================================================
// V4-2026-05-24:通用分页组件
// 用于催单/售后等长列表 — 50/100 每页 + 首页 / 上一页 / 页码 / 下一页 / 末页
// ============================================================

// 注入分页 CSS(一次性)
(function _injectPaginationCSS() {
  if (document.getElementById('pagination-style')) return;
  const s = document.createElement('style');
  s.id = 'pagination-style';
  s.textContent = `
    .pagination-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: var(--bg-elevated, #f9fafb);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 8px;
      margin: 8px 0;
      flex-wrap: wrap;
      font-size: 13px;
      color: var(--text-secondary, #4b5563);
    }
    .pagination-bar .pgn-info {
      font-size: 12.5px;
      color: var(--text-secondary, #6b7280);
    }
    .pagination-bar .pgn-info b {
      color: var(--accent, #2563eb);
      font-weight: 700;
    }
    .pagination-bar .pgn-size-sel {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      color: var(--text-secondary, #6b7280);
    }
    .pagination-bar select {
      padding: 4px 8px;
      border: 1px solid var(--border, #d1d5db);
      border-radius: 6px;
      font-size: 12.5px;
      background: white;
      cursor: pointer;
    }
    .pagination-bar .pgn-controls {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .pagination-bar .pgn-btn {
      min-width: 32px;
      height: 30px;
      padding: 0 10px;
      border: 1px solid var(--border, #d1d5db);
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12.5px;
      color: var(--text-primary, #1f2937);
      transition: all 0.12s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .pagination-bar .pgn-btn:hover:not(:disabled):not(.active) {
      background: var(--bg-hover, #f3f4f6);
      border-color: var(--accent, #2563eb);
      color: var(--accent, #2563eb);
    }
    .pagination-bar .pgn-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .pagination-bar .pgn-btn.active {
      background: var(--accent, #2563eb);
      color: white;
      border-color: var(--accent, #2563eb);
      font-weight: 600;
    }
    .pagination-bar .pgn-btn.first-last {
      font-weight: 600;
    }
    .pagination-bar .pgn-ellipsis {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      color: var(--text-tertiary, #9ca3af);
    }
    @media (max-width: 720px) {
      .pagination-bar { padding: 8px 10px; gap: 8px; }
      .pagination-bar .pgn-info { width: 100%; text-align: center; }
      .pagination-bar .pgn-size-sel { flex: 1; }
      .pagination-bar .pgn-controls { flex: 1; justify-content: flex-end; }
      .pagination-bar .pgn-btn { min-width: 28px; height: 28px; padding: 0 6px; font-size: 11.5px; }
    }
  `;
  document.head.appendChild(s);
})();

/**
 * 渲染分页栏(顶部 + 底部各调一次)
 * @param {Object} opts
 * @param {number} opts.total       总数据条数
 * @param {number} opts.currentPage 当前页码(从 1 开始)
 * @param {number} opts.pageSize    每页数量
 * @param {string} opts.onPageChange JS 表达式字符串,用 (newPage) 占位 
 *                                   例如 "setOrdersPage(__PAGE__)"
 * @param {string} opts.onSizeChange JS 表达式字符串,用 __SIZE__ 占位
 *                                   例如 "setOrdersPageSize(__SIZE__)"
 * @returns {string} HTML
 */
function renderPaginationBar(opts) {
  const total = Math.max(0, opts.total || 0);
  const pageSize = Math.max(1, opts.pageSize || 50);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.max(1, Math.min(opts.currentPage || 1, totalPages));
  
  // 显示哪些页码 - 最多显示 ~7 个连续页码,过多就用 ...
  let pageNums = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNums.push(i);
  } else {
    pageNums.push(1);  // 始终显示第一页
    if (current > 4) pageNums.push('...');
    const start = Math.max(2, current - 2);
    const end = Math.min(totalPages - 1, current + 2);
    for (let i = start; i <= end; i++) pageNums.push(i);
    if (current < totalPages - 3) pageNums.push('...');
    pageNums.push(totalPages);  // 始终显示最后一页
  }
  
  const startIdx = (current - 1) * pageSize + 1;
  const endIdx = Math.min(total, current * pageSize);
  
  const handler = (pageExpr) => opts.onPageChange.replace('__PAGE__', pageExpr);
  const sizeHandler = opts.onSizeChange ? opts.onSizeChange.replace('__SIZE__', 'this.value') : '';
  
  const numsHtml = pageNums.map(p => {
    if (p === '...') return `<span class="pgn-ellipsis">…</span>`;
    return `<button class="pgn-btn ${p === current ? 'active' : ''}" onclick="${handler(p)}">${p}</button>`;
  }).join('');
  
  return `
    <div class="pagination-bar">
      <div class="pgn-info">
        共 <b>${total}</b> 条 · 当前 <b>${startIdx}-${endIdx}</b> · 共 <b>${totalPages}</b> 页
      </div>
      <div class="pgn-size-sel">
        每页 
        <select onchange="${sizeHandler}">
          <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
        </select>
      </div>
      <div class="pgn-controls">
        <button class="pgn-btn first-last" onclick="${handler(1)}" ${current === 1 ? 'disabled' : ''} title="首页">⏮</button>
        <button class="pgn-btn" onclick="${handler(current - 1)}" ${current === 1 ? 'disabled' : ''} title="上一页">‹</button>
        ${numsHtml}
        <button class="pgn-btn" onclick="${handler(current + 1)}" ${current === totalPages ? 'disabled' : ''} title="下一页">›</button>
        <button class="pgn-btn first-last" onclick="${handler(totalPages)}" ${current === totalPages ? 'disabled' : ''} title="末页">⏭</button>
      </div>
    </div>
  `;
}

// ============================================================
// V5-2026-05-24: 拼音匹配工具
// 用法: pinyinMatch(haystack, query, opts)
//   haystack: 待匹配的项,可以是字符串,也可以是对象(指定 fields 时)
//   query:    用户输入的搜索词 (中文/拼音/首字母都行)
//   opts:     { pinyinFull, pinyinInitials } - 如果对象已带这两个字段就直接用,不用重算
// 
// 灯具供应商常用字典 (~250 个汉字),配合服务端 pinyin_full/initials 实现高性能匹配
// 
// 匹配优先级:
//   1. 原文 includes (中文/英文/数字)
//   2. 首字母 startsWith
//   3. 首字母 includes (允许片段在中间)
//   4. 全拼 startsWith
//   5. 全拼 includes
// ============================================================

const _PINYIN_DICT = {
  '阿':'a','安':'an','艾':'ai','八':'ba','巴':'ba','白':'bai','百':'bai','宝':'bao','北':'bei','贝':'bei',
  '本':'ben','彬':'bin','波':'bo','博':'bo','布':'bu','邦':'bang','保':'bao','冰':'bing','才':'cai','彩':'cai',
  '昌':'chang','长':'chang','常':'chang','辰':'chen','晨':'chen','成':'cheng','诚':'cheng','城':'cheng','驰':'chi',
  '川':'chuan','创':'chuang','春':'chun','聪':'cong','超':'chao','朝':'chao','臣':'chen','达':'da','大':'da',
  '代':'dai','丹':'dan','德':'de','迪':'di','帝':'di','点':'dian','电':'dian','顶':'ding','东':'dong','都':'dou',
  '度':'du','多':'duo','灯':'deng','登':'deng','鼎':'ding','动':'dong','冬':'dong','尔':'er','二':'er','恩':'en',
  '发':'fa','法':'fa','凡':'fan','繁':'fan','方':'fang','芳':'fang','飞':'fei','菲':'fei','丰':'feng','风':'feng',
  '峰':'feng','锋':'feng','福':'fu','富':'fu','帆':'fan','凤':'feng','芬':'fen','高':'gao','歌':'ge','工':'gong',
  '功':'gong','光':'guang','广':'guang','贵':'gui','国':'guo','官':'guan','冠':'guan','观':'guan','果':'guo',
  '钢':'gang','港':'gang','格':'ge','根':'gen','更':'geng','宫':'gong','古':'gu','谷':'gu','哈':'ha','海':'hai',
  '韩':'han','汉':'han','杭':'hang','航':'hang','豪':'hao','好':'hao','号':'hao','禾':'he','合':'he','和':'he',
  '河':'he','黑':'hei','红':'hong','宏':'hong','鸿':'hong','湖':'hu','虎':'hu','华':'hua','花':'hua','环':'huan',
  '欢':'huan','辉':'hui','汇':'hui','惠':'hui','会':'hui','火':'huo','霍':'huo','吉':'ji','基':'ji','集':'ji',
  '佳':'jia','家':'jia','嘉':'jia','建':'jian','剑':'jian','健':'jian','江':'jiang','将':'jiang','匠':'jiang',
  '杰':'jie','捷':'jie','金':'jin','锦':'jin','京':'jing','景':'jing','晶':'jing','精':'jing','九':'jiu','久':'jiu',
  '军':'jun','俊':'jun','骏':'jun','巨':'ju','聚':'ju','居':'ju','劲':'jin','凯':'kai','开':'kai','克':'ke',
  '科':'ke','可':'ke','康':'kang','坤':'kun','快':'kuai','拉':'la','来':'lai','兰':'lan','蓝':'lan','朗':'lang',
  '乐':'le','雷':'lei','理':'li','里':'li','丽':'li','力':'li','立':'li','联':'lian','良':'liang','亮':'liang',
  '林':'lin','灵':'ling','凌':'ling','六':'liu','柳':'liu','隆':'long','龙':'long','鲁':'lu','路':'lu','禄':'lu',
  '罗':'luo','洛':'luo','吕':'lv','李':'li','梁':'liang','马':'ma','玛':'ma','麦':'mai','茂':'mao','美':'mei',
  '梅':'mei','蒙':'meng','孟':'meng','米':'mi','密':'mi','明':'ming','名':'ming','铭':'ming','木':'mu','闽':'min',
  '纳':'na','南':'nan','尼':'ni','泥':'ni','霓':'ni','宁':'ning','诺':'nuo','能':'neng','欧':'ou','偶':'ou',
  '帕':'pa','派':'pai','潘':'pan','彭':'peng','鹏':'peng','品':'pin','平':'ping','普':'pu','璞':'pu','七':'qi',
  '齐':'qi','其':'qi','奇':'qi','启':'qi','迁':'qian','前':'qian','乾':'qian','强':'qiang','巧':'qiao','青':'qing',
  '清':'qing','庆':'qing','秋':'qiu','球':'qiu','泉':'quan','全':'quan','群':'qun','钱':'qian','然':'ran','让':'rang',
  '日':'ri','荣':'rong','融':'rong','锐':'rui','瑞':'rui','若':'ruo','熔':'rong','柔':'rou','人':'ren','仁':'ren',
  '塞':'sai','赛':'sai','三':'san','森':'sen','商':'shang','上':'shang','尚':'shang','神':'shen','生':'sheng',
  '升':'sheng','盛':'sheng','圣':'sheng','十':'shi','石':'shi','时':'shi','世':'shi','事':'shi','舒':'shu','帅':'shuai',
  '水':'shui','顺':'shun','思':'si','斯':'si','四':'si','宋':'song','松':'song','速':'su','苏':'su','沙':'sha',
  '邵':'shao','深':'shen','它':'ta','塔':'ta','泰':'tai','太':'tai','唐':'tang','陶':'tao','腾':'teng','田':'tian',
  '天':'tian','铁':'tie','通':'tong','同':'tong','铜':'tong','统':'tong','途':'tu','图':'tu','土':'tu','团':'tuan',
  '拓':'tuo','托':'tuo','万':'wan','王':'wang','旺':'wang','威':'wei','维':'wei','伟':'wei','卫':'wei','为':'wei',
  '文':'wen','沃':'wo','无':'wu','武':'wu','五':'wu','物':'wu','吴':'wu','汪':'wang','希':'xi','溪':'xi','喜':'xi',
  '夏':'xia','先':'xian','仙':'xian','相':'xiang','香':'xiang','祥':'xiang','小':'xiao','晓':'xiao','心':'xin',
  '欣':'xin','新':'xin','信':'xin','兴':'xing','星':'xing','秀':'xiu','徐':'xu','旭':'xu','璇':'xuan','雪':'xue',
  '熊':'xiong','亚':'ya','雅':'ya','烟':'yan','岩':'yan','燕':'yan','阳':'yang','杨':'yang','洋':'yang','一':'yi',
  '依':'yi','宜':'yi','怡':'yi','艺':'yi','亿':'yi','逸':'yi','银':'yin','英':'ying','盈':'ying','颖':'ying',
  '永':'yong','勇':'yong','友':'you','佑':'you','游':'you','于':'yu','余':'yu','玉':'yu','宇':'yu','雨':'yu',
  '元':'yuan','园':'yuan','原':'yuan','远':'yuan','源':'yuan','月':'yue','悦':'yue','云':'yun','运':'yun','韵':'yun',
  '颜':'yan','尧':'yao','业':'ye','叶':'ye','义':'yi','益':'yi','应':'ying','在':'zai','泽':'ze','展':'zhan',
  '战':'zhan','张':'zhang','章':'zhang','昭':'zhao','兆':'zhao','赵':'zhao','哲':'zhe','浙':'zhe','真':'zhen',
  '振':'zhen','正':'zheng','政':'zheng','郑':'zheng','志':'zhi','智':'zhi','中':'zhong','钟':'zhong','众':'zhong',
  '州':'zhou','周':'zhou','朱':'zhu','主':'zhu','卓':'zhuo','紫':'zi','自':'zi','宗':'zong','总':'zong','尊':'zun',
  '左':'zuo','作':'zuo','坐':'zuo',
  // V5 补丁 · 补全你的实际供应商用到的字
  '羽':'yu','浩':'hao','祺':'qi','鑫':'xin','莱':'lai','遇':'yu',
  '岸':'an','坝':'ba','柏':'bai','般':'ban','半':'ban','帮':'bang','榜':'bang','抱':'bao',
  '焕':'huan','焰':'yan','璐':'lu','玮':'wei','琨':'kun','璟':'jing','炜':'wei','焜':'kun',
  '烁':'shuo','熠':'yi','炳':'bing','炯':'jiong','炽':'chi','焘':'tao','熙':'xi','燊':'shen',
  '燚':'yi','燮':'xie','焱':'yan','煜':'yu','炼':'lian','炉':'lu','炎':'yan','熹':'xi',
  '燃':'ran','烨':'ye','炅':'jiong','澎':'peng','澈':'che','澜':'lan','潇':'xiao','溢':'yi',
  '渊':'yuan','湘':'xiang','湍':'tuan','济':'ji','滔':'tao','滨':'bin','漠':'mo','潭':'tan',
  '潮':'chao','澳':'ao','满':'man','涛':'tao','檀':'tan','桦':'hua','梓':'zi','桐':'tong',
  '楠':'nan','榕':'rong','槐':'huai','柠':'ning','榆':'yu','榛':'zhen','桔':'ju','梨':'li',
  '梧':'wu','萧':'xiao','萍':'ping','蓉':'rong','蕊':'rui','芷':'zhi','茜':'qian','芸':'yun',
  '葆':'bao','萌':'meng','蓄':'xu','蕴':'yun','范':'fan','芙':'fu','葛':'ge','芦':'lu',
  '蕾':'lei','蓓':'bei','蒂':'di','蕙':'hui','茶':'cha','茨':'ci','茹':'ru','苑':'yuan',
  '荆':'jing','蓟':'ji','葳':'wei','苇':'wei','苔':'tai','苗':'miao','苓':'ling','茁':'zhuo',
  '芯':'xin','芮':'rui','芹':'qin','陆':'lu','汝':'ru','冕':'mian','晖':'hui','皓':'hao',
  '昊':'hao','晗':'han','昕':'xin','昀':'yun','晟':'sheng','晔':'ye','昱':'yu','旸':'yang',
  '旻':'min','旨':'zhi','旷':'kuang',
  // V5 补丁 2 · 实际数据缺失的 70+ 字
  '佰':'bai','款':'kuan','跃':'yue','允':'yun','控':'kong','几':'ji','何':'he',
  '千':'qian','誉':'yu','卡':'ka','铂':'bo','叁':'san','闪':'shan','渡':'du',
  '因':'yin','得':'de','域':'yu','见':'jian','壕':'hao','琳':'lin','奈':'nai',
  '梦':'meng','子':'zi','衿':'jin','封':'feng','胶':'jiao','弘':'hong','彼':'bi',
  '莎':'sha','忆':'yi','涵':'han','意':'yi','饰':'shi','慕':'mu','橙':'cheng',
  '接':'jie','端':'duan','摩':'mo','翼':'yi','斓':'lan','斑':'ban','桃':'tao',
  '缘':'yuan','茗':'ming','梵':'fan','楷':'kai','铧':'hua','淘':'tao','琪':'qi',
  '琼':'qiong','瑶':'yao','璀':'cui','璨':'can','素':'su','说':'shuo','纬':'wei',
  '羿':'yi','轩':'xuan','致':'zhi','芊':'qian','顷':'qing','赫':'he','钰':'yu',
  '煌':'huang','洁':'jie','镁':'mei','阁':'ge','楼':'lou','厂':'chang','馨':'xin',
  '妍':'yan','恒':'heng','鸵':'tuo','鸟':'niao','毛':'mao','鹤':'he','洲':'zhou',
  '简':'jian','影':'ying',
};

// 字符串 → 全拼(没匹配的字保留原样)
function _strToPinyinFull(str) {
  if (!str) return '';
  let out = '';
  for (const c of String(str)) {
    if (_PINYIN_DICT[c]) out += _PINYIN_DICT[c];
    else if (/[a-zA-Z0-9]/.test(c)) out += c.toLowerCase();
  }
  return out;
}

// 字符串 → 首字母
function _strToPinyinInitials(str) {
  if (!str) return '';
  let out = '';
  for (const c of String(str)) {
    if (_PINYIN_DICT[c]) out += _PINYIN_DICT[c][0].toUpperCase();
    else if (/[a-zA-Z0-9]/.test(c)) out += c.toUpperCase();
  }
  return out;
}

/**
 * 智能匹配:中文/英文/首字母/全拼都能命中
 * @param {string} haystack - 被搜索的原文(如供应商名 "霓合")
 * @param {string} query - 用户输入(如 "NH" / "nh" / "ni" / "霓")
 * @param {Object} opts - 可选 { pinyinFull: 服务端预算的, pinyinInitials: 服务端预算的 }
 * @returns {Object|null} { matched: true, score: 数字越小排越前 } 或 null
 */
function pinyinMatch(haystack, query, opts) {
  if (!query || !query.trim()) return { matched: true, score: 100 };
  if (!haystack) return null;
  
  const q = query.trim().toLowerCase();
  const orig = String(haystack).toLowerCase();
  
  // 1. 原文匹配(中文/英文)
  if (orig.includes(q)) {
    return { matched: true, score: orig.startsWith(q) ? 1 : 2 };
  }
  
  // 优先用服务端预算的(更快+更准)
  let initials = (opts && opts.pinyinInitials) || _strToPinyinInitials(haystack);
  let full = (opts && opts.pinyinFull) || _strToPinyinFull(haystack);
  initials = initials.toLowerCase();
  full = full.toLowerCase();
  
  // 2. 首字母 startsWith (最常用的场景: NH → 霓合)
  if (initials.startsWith(q)) return { matched: true, score: 3 };
  
  // 3. 首字母 includes (片段在中间: 比如搜 "KS" 匹配 "雷克森")
  if (initials.includes(q)) return { matched: true, score: 4 };
  
  // 4. 全拼 startsWith (nihe → 霓合)
  if (full.startsWith(q)) return { matched: true, score: 5 };
  
  // 5. 全拼 includes
  if (full.includes(q)) return { matched: true, score: 6 };
  
  return null;
}

// 暴露到全局
window.pinyinMatch = pinyinMatch;
window._strToPinyinInitials = _strToPinyinInitials;
window._strToPinyinFull = _strToPinyinFull;
