// ============================================================
// 跟单团队工作台 · missing.js
// 找灯（共享模块）· 含实拍照片、评论编辑、采纳推荐
// ============================================================
// 依赖：core.js · utils.js
// ============================================================

// ============================================================
// MODULE 4: 找灯（共享）
// ============================================================
function renderMissing() {
  const body = document.getElementById('missingBody');
  const q = (document.getElementById('mSearch').value || '').trim().toLowerCase();
  const fs = document.getElementById('mFilterStatus').value;
  const fSource = document.getElementById('mFilterSource') ? document.getElementById('mFilterSource').value : '';
  
  let list = MISSING_LIGHTS.filter(m => {
    if (q) {
      const t = [m.description, m.customerOrderNo, m.creator, (m.comments || []).map(c => c.content + ' ' + (c.suggestedSupplier || '')).join(' ')].join(' ').toLowerCase();
      if (!t.includes(q)) return false;
    }
    if (fSource && (m.source || 'manual') !== fSource) return false;
    if (fs === 'all') return true;
    if (fs === 'active') return ['searching', 'found'].includes(m.status);  // 包含已找到（但会被折叠）
    return m.status === fs;
  });
  
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  
  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-top: 14px;"><div class="icon">🔍</div><div class="text">${MISSING_LIGHTS.length === 0 ? '还没有找灯任务，点 "+ 发布" 让全队帮你找' : '没有匹配的任务'}</div>${MISSING_LIGHTS.length === 0 ? '<button class="btn primary" onclick="addMissing()">+ 发布第一个找灯任务</button>' : ''}</div>`;
    return;
  }
  
  // 分组逻辑
  if (fs === 'active') {
    const searching = list.filter(m => m.status === 'searching');
    const found = list.filter(m => m.status === 'found');
    let html = '';
    // 搜寻中（默认展开）
    if (searching.length > 0) {
      html += renderMissingGroup('searching', '🔍 搜寻中', searching, false);
    } else {
      html += `<div class="empty-state" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; margin-top: 14px;"><div class="icon">🔍</div><div class="text">没有搜寻中的找灯任务</div></div>`;
    }
    // 已找到（默认折叠）
    if (found.length > 0) {
      html += renderMissingGroup('found', '✅ 已找到 / 已下单', found, true);
    }
    body.innerHTML = html;
  } else {
    // 单一状态：直接显示一个区块（无折叠头部）
    body.innerHTML = `<div class="missing-group"><div class="missing-grid-wrap" style="border-radius: 10px; border-top: 1px solid var(--border);"><div class="missing-grid">${list.map(renderMissingCard).join('')}</div></div></div>`;
  }
}

function renderMissingGroup(key, title, items, collapsed) {
  return `
    <div class="missing-group ${collapsed ? 'collapsed' : ''}" id="missingGroup_${key}">
      <div class="missing-group-head ${key} ${collapsed ? '' : 'expanded'}" onclick="toggleMissingGroup('${key}')">
        <div class="title">${title} <span class="count">${items.length}</span></div>
        <span class="toggle-arrow">▼</span>
      </div>
      <div class="missing-grid-wrap">
        <div class="missing-grid">${items.map(renderMissingCard).join('')}</div>
      </div>
    </div>
  `;
}

function renderMissingCard(m) {
  const cmtCount = (m.comments || []).length;
  const screenshots = m.screenshots || [];
  const realCount = (m.realPhotos || []).length;
  const canDelete = m.creator === CURRENT_AGENT || IS_ADMIN;
  const desc = (m.description || '').trim();
  
  // 多图自适应布局
  let coverHTML = '';
  let coverCls = '';
  const n = screenshots.length;
  if (n === 0) {
    coverCls = 'cnt-0';
    coverHTML = '<div class="no-image">💡</div><div class="no-image-hint">无图片</div>';
  } else if (n === 1) {
    coverCls = 'cnt-1';
    coverHTML = `<img src="${screenshots[0]}" alt="灯具图片">`;
  } else if (n === 2) {
    coverCls = 'cnt-2 multi';
    coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
  } else if (n === 3) {
    coverCls = 'cnt-3 multi';
    coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
  } else if (n === 4) {
    coverCls = 'cnt-4 multi';
    coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
  } else {
    // 5+ 张：3x3 网格
    coverCls = 'cnt-many multi';
    const max = 9;
    if (n <= max) {
      coverHTML = screenshots.map(s => `<img src="${s}">`).join('');
    } else {
      // 前 8 张正常，第 9 格显示最后一张图 + 浮层 +N
      coverHTML = screenshots.slice(0, max - 1).map(s => `<img src="${s}">`).join('');
      const remaining = n - (max - 1);
      coverHTML += `<div class="more-overlay"><img src="${screenshots[max - 1]}"><span>+${remaining}</span></div>`;
    }
  }
  
  return `
    <div class="missing-card" onclick="openMissingModal('${m._id}')">
      <div class="cover ${coverCls}">
        ${coverHTML}
        <span class="status-badge s-${m.status}">${MISSING_STATUS_LABELS[m.status]}</span>
        ${m.source === 'purchase' ? '<span class="source-badge" style="position:absolute;top:8px;left:8px;background:rgba(202,138,4,0.95);color:white;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;">🛒 采购需求</span>' : ''}
        ${canDelete ? `<button class="card-delete" onclick="event.stopPropagation(); delMissingRow('${m._id}')" title="删除">🗑</button>` : ''}
        ${cmtCount > 0 ? `<span class="comments-badge" style="${canDelete ? 'top: 44px;' : ''}">💬 ${cmtCount}</span>` : ''}
        ${realCount > 0 ? `<span class="comments-badge" style="${canDelete ? (cmtCount > 0 ? 'top: 76px;' : 'top: 44px;') : (cmtCount > 0 ? 'top: 40px;' : '')}; background: rgba(13,148,136,0.95);">📸 ${realCount}</span>` : ''}
      </div>
      <div class="body">
        <div class="desc ${desc ? '' : 'empty'}">${desc ? escapeHtml(desc) : '(无描述)'}</div>
        <div class="meta">
          <span class="creator">👤 ${escapeHtml(m.creator || '')}</span>
          ${m.customerOrderNo ? `<span class="order-no">${escapeHtml(m.customerOrderNo)}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function toggleMissingGroup(key) {
  const el = document.getElementById('missingGroup_' + key);
  if (!el) return;
  el.classList.toggle('collapsed');
  el.querySelector('.missing-group-head').classList.toggle('expanded');
}

// ============ 一键截图打包（拼图导出）============
async function exportMissingCollage() {
  // 过滤：根据当前筛选条件，但只取有图片或有描述的
  const fs = document.getElementById('mFilterStatus').value;
  let target = MISSING_LIGHTS;
  if (fs === 'active' || fs === 'searching') {
    target = MISSING_LIGHTS.filter(m => m.status === 'searching');
  } else if (fs !== 'all') {
    target = MISSING_LIGHTS.filter(m => m.status === fs);
  }
  
  if (target.length === 0) {
    toast('当前筛选下没有找灯任务可导出', 'warn');
    return;
  }
  
  // 确认要导出多少
  const withImg = target.filter(m => m.screenshots && m.screenshots.length > 0).length;
  const noImg = target.length - withImg;
  let confirmMsg = `准备拼图导出 ${target.length} 个找灯任务`;
  if (noImg > 0) confirmMsg += `（${withImg} 个有图，${noImg} 个仅描述）`;
  confirmMsg += '\n\n生成的大图可直接发给供应商统一咨询。继续？';
  if (!confirm(confirmMsg)) return;
  
  toast('正在生成截图，请稍候...', 'warn');
  
  try {
    // 加载所有图片（多图任务展开成多个卡片，让每张图都大）
    const items = [];
    for (const m of target) {
      const imgs = [];
      if (m.screenshots && m.screenshots.length > 0) {
        for (const src of m.screenshots.slice(0, 9)) {
          try { imgs.push(await loadImageEl(src)); } catch (e) { /* skip */ }
        }
      }
      items.push({ m, imgs });
    }
    
    // 布局参数：放大尺寸 + 更少列数
    const cardW = 460;
    const imgAreaH = 380;
    const footerH = 110;
    const cardH = imgAreaH + footerH;
    const gap = 16;
    const padding = 32;
    const headerH = 100;
    const pageFooterH = 50;
    
    // 决定列数：1-3 列（保持每张图大）
    const cols = items.length === 1 ? 1 : items.length <= 4 ? 2 : 3;
    const rows = Math.ceil(items.length / cols);
    
    const canvasW = padding * 2 + cols * cardW + (cols - 1) * gap;
    const canvasH = headerH + rows * cardH + (rows - 1) * gap + padding + pageFooterH;
    
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    
    // 中文字体
    const cnFont = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Heiti SC", sans-serif';
    
    // 背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    // 标题
    ctx.fillStyle = '#1c1917';
    ctx.font = `bold 26px ${cnFont}`;
    ctx.textBaseline = 'top';
    ctx.fillText('找灯需求清单', padding, padding);
    
    ctx.font = `15px ${cnFont}`;
    ctx.fillStyle = '#57534e';
    const dateStr = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'});
    ctx.fillText(`${dateStr} · 共 ${items.length} 个款式，请帮忙看下贵司能做哪些`, padding, padding + 36);
    
    // 分隔线
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding + 70);
    ctx.lineTo(canvasW - padding, padding + 70);
    ctx.stroke();
    
    // 卡片
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = padding + col * (cardW + gap);
      const y = headerH + row * (cardH + gap);
      
      // 卡片边框
      ctx.fillStyle = '#fafaf9';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cardW, cardH);
      
      // 图片区背景
      ctx.fillStyle = '#f5f5f4';
      ctx.fillRect(x, y, cardW, imgAreaH);
      
      const it = items[i];
      const imgs = it.imgs;
      
      if (imgs.length === 0) {
        // 无图占位
        ctx.fillStyle = '#d6d3d1';
        ctx.font = `60px ${cnFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💡', x + cardW / 2, y + imgAreaH / 2 - 8);
        ctx.font = `12px ${cnFont}`;
        ctx.fillStyle = '#a8a29e';
        ctx.fillText('无图片', x + cardW / 2, y + imgAreaH / 2 + 30);
        ctx.textBaseline = 'top';
      } else if (imgs.length === 1) {
        // 单图：占满整个图片区
        const img = imgs[0];
        const ratio = Math.min(cardW / img.width, imgAreaH / img.height);
        const drawW = img.width * ratio;
        const drawH = img.height * ratio;
        ctx.drawImage(img, x + (cardW - drawW) / 2, y + (imgAreaH - drawH) / 2, drawW, drawH);
      } else if (imgs.length === 2) {
        // 2 张图：上下排列（大）
        const slotH = (imgAreaH - 2) / 2;
        for (let k = 0; k < 2; k++) {
          const img = imgs[k];
          const sy = y + k * (slotH + 2);
          const ratio = Math.min(cardW / img.width, slotH / img.height);
          const drawW = img.width * ratio;
          const drawH = img.height * ratio;
          ctx.drawImage(img, x + (cardW - drawW) / 2, sy + (slotH - drawH) / 2, drawW, drawH);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + slotH + 1); ctx.lineTo(x + cardW, y + slotH + 1);
        ctx.stroke();
      } else if (imgs.length === 3) {
        // 3 张图：左大右两小
        const leftW = cardW / 2;
        const rightW = cardW - leftW;
        const rightH = (imgAreaH - 2) / 2;
        // 左：大图
        const im0 = imgs[0];
        const r0 = Math.min(leftW / im0.width, imgAreaH / im0.height);
        ctx.drawImage(im0, x + (leftW - im0.width * r0) / 2, y + (imgAreaH - im0.height * r0) / 2, im0.width * r0, im0.height * r0);
        // 右上 + 右下
        for (let k = 1; k < 3; k++) {
          const img = imgs[k];
          const sx = x + leftW + 2;
          const sy = y + (k - 1) * (rightH + 2);
          const ratio = Math.min((rightW - 2) / img.width, rightH / img.height);
          ctx.drawImage(img, sx + (rightW - 2 - img.width * ratio) / 2, sy + (rightH - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + leftW + 1, y); ctx.lineTo(x + leftW + 1, y + imgAreaH);
        ctx.moveTo(x + leftW, y + rightH + 1); ctx.lineTo(x + cardW, y + rightH + 1);
        ctx.stroke();
      } else if (imgs.length === 4) {
        // 4 张图：2x2
        const slots = imgs.slice(0, 4);
        const slotW = (cardW - 2) / 2, slotH = (imgAreaH - 2) / 2;
        for (let k = 0; k < slots.length; k++) {
          const sx = x + (k % 2) * (slotW + 2);
          const sy = y + Math.floor(k / 2) * (slotH + 2);
          const img = slots[k];
          const ratio = Math.min(slotW / img.width, slotH / img.height);
          ctx.drawImage(img, sx + (slotW - img.width * ratio) / 2, sy + (slotH - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + slotH + 1); ctx.lineTo(x + cardW, y + slotH + 1);
        ctx.moveTo(x + slotW + 1, y); ctx.lineTo(x + slotW + 1, y + imgAreaH);
        ctx.stroke();
      } else {
        // 5-9 张：3x3 网格
        const slots = imgs.slice(0, 9);
        const slotW = (cardW - 4) / 3, slotH = (imgAreaH - 4) / 3;
        for (let k = 0; k < slots.length; k++) {
          const sx = x + (k % 3) * (slotW + 2);
          const sy = y + Math.floor(k / 3) * (slotH + 2);
          const img = slots[k];
          const ratio = Math.min(slotW / img.width, slotH / img.height);
          ctx.drawImage(img, sx + (slotW - img.width * ratio) / 2, sy + (slotH - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
        }
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          ctx.moveTo(x, y + i * (slotH + 2) - 1); ctx.lineTo(x + cardW, y + i * (slotH + 2) - 1);
          ctx.moveTo(x + i * (slotW + 2) - 1, y); ctx.lineTo(x + i * (slotW + 2) - 1, y + imgAreaH);
        }
        ctx.stroke();
      }
      
      // 编号徽章（左上角）
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(x, y, 52, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 16px ${cnFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${i + 1}`, x + 26, y + 16);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      
      // 多图数量徽章（右下）
      if (it.m.screenshots && it.m.screenshots.length > 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        const badge = `共 ${it.m.screenshots.length} 张`;
        ctx.font = `bold 13px ${cnFont}`;
        const w = ctx.measureText(badge).width + 16;
        ctx.fillRect(x + cardW - w - 10, y + imgAreaH - 30, w, 22);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badge, x + cardW - w/2 - 10, y + imgAreaH - 19);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      }
      
      // 文字区域
      const m = it.m;
      let textY = y + imgAreaH + 14;
      
      // 描述（最多 2 行）
      ctx.fillStyle = '#1c1917';
      ctx.font = `bold 16px ${cnFont}`;
      const desc = m.description || '(无描述)';
      drawWrappedText(ctx, desc, x + 14, textY, cardW - 28, 22, 2);
      textY += 48;
      
      // 规格（最多 2 行）
      if (m.specs && m.specs.trim()) {
        ctx.font = `13px ${cnFont}`;
        ctx.fillStyle = '#2563eb';
        drawWrappedText(ctx, '📏 ' + m.specs, x + 14, textY, cardW - 28, 18, 2);
      }
      // 不再显示订单号，仅显示提交人
    }
    
    // 页脚
    ctx.font = `11px ${cnFont}`;
    ctx.fillStyle = '#a8a29e';
    ctx.fillText(`本清单由跟单工作台导出 · ${dateStr}`, padding, canvasH - 30);
    ctx.textAlign = 'right';
    ctx.fillText(`共 ${items.length} 款`, canvasW - padding, canvasH - 30);
    ctx.textAlign = 'left';
    
    // 下载
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `找灯清单_${new Date().toISOString().slice(0, 10)}_共${items.length}款.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`✓ 已导出截图（${items.length} 款）`);
    }, 'image/png', 0.95);
    
  } catch (err) {
    console.error(err);
    toast('截图生成失败: ' + (err.message || ''), 'err');
  }
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// Canvas 多行文字（最多 maxLines 行）
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = String(text || '').split('');
  let line = '';
  let lineNum = 0;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      if (lineNum === maxLines - 1) {
        // 最后一行加省略号
        let truncated = line;
        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        ctx.fillText(truncated + '...', x, y + lineNum * lineHeight);
        return;
      }
      ctx.fillText(line, x, y + lineNum * lineHeight);
      line = chars[i];
      lineNum++;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + lineNum * lineHeight);
}

async function addMissing() {
  if (!CURRENT_AGENT) return;
  const newM = {
    _id: 'M' + Date.now() + Math.random().toString(36).slice(2, 6),
    description: '', customerOrderNo: '', specs: '',
    creator: CURRENT_AGENT,
    status: 'searching',
    screenshots: [],
    realPhotos: [],
    comments: [],
    createdAt: new Date().toISOString(),
  };
  MISSING_LIGHTS.unshift(newM);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissing();
  updateMissingStats();
  try {
    await DATA.saveAndSyncMissing();
  } catch (err) {
    console.error('新增找灯同步失败:', err);
    toast('云端同步失败：' + (err.message || err), 'err');
  }
  openMissingModal(newM._id);
}

function delMissingRow(id) {
  // 找到原始 missing（包括已删除的）
  const m = DATA.getMissingLights().find(x => x._id === id);
  if (!m) return;
  if (m.creator !== CURRENT_AGENT && !IS_ADMIN) { toast('只能删自己发起的任务', 'err'); return; }
  if (!confirm('确定删除这个找灯任务？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  m.deletedAt = new Date().toISOString();
  m.deletedBy = CURRENT_AGENT;
  DATA.saveMissingLights(DATA.getMissingLights());
  loadAllData();
  renderMissing();
  updateMissingStats();
  toast('已移入回收站');
}

function openMissingModal(id) {
  const m = MISSING_LIGHTS.find(x => x._id === id);
  if (!m) return;
  _currentItemId = id;
  _currentItemType = 'missing';
  _newScreenshots_orig = [];
  
  document.getElementById('mmOrderNo').value = m.customerOrderNo || '';
  document.getElementById('mmStatus').value = m.status || 'searching';
  document.getElementById('mmDescription').value = m.description || '';
  document.getElementById('mmSpecs').value = m.specs || '';
  document.getElementById('mmNewComment').value = '';
  document.getElementById('mmCommentSupplier').value = '';
  
  renderMissingModalContent();
  document.getElementById('missingModal').classList.add('show');
}

function renderMissingModalContent() {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  document.getElementById('mmHeader').innerHTML = `
    <div class="top">
      <div class="order-no" style="font-family: inherit; font-size: 14px;">🔍 ${escapeHtml((m.description || '').slice(0, 40)) || '(无描述)'}</div>
      <div class="top-status"><span class="status-pill s-${m.status}" style="display:inline-flex;padding:5px 12px;">${MISSING_STATUS_LABELS[m.status]}</span></div>
    </div>
    <div class="meta">
      <span>👤 发起人：${escapeHtml(m.creator || '')}</span>
      <span>📅 ${(m.createdAt || '').slice(0, 10)}</span>
      <span>💬 ${(m.comments || []).length} 条评论</span>
    </div>
  `;
  
  // 图片
  const ss = m.screenshots || [];
  document.getElementById('mmScreenshotsCount').textContent = `${ss.length} 张`;
  document.getElementById('mmScreenshots').innerHTML = ss.map((s, i) => `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmMissingScreenshot(${i})">×</button></div>`).join('');

  // 实拍照片
  const rp = m.realPhotos || [];
  const rpEl = document.getElementById('mmRealPhotosCount');
  if (rpEl) rpEl.textContent = `${rp.length} 张`;
  const rpListEl = document.getElementById('mmRealPhotos');
  if (rpListEl) {
    rpListEl.innerHTML = rp.map((s, i) => `<div class="drop-zone-thumb"><img src="${s}" onclick="viewImage('${s}')"><button class="rm" onclick="rmMissingRealPhoto(${i})" title="删除">×</button></div>`).join('');
  }

  // 评论
  const cmts = m.comments || [];
  document.getElementById('mmCommentsCount').textContent = `${cmts.length} 条`;
  const cl = document.getElementById('mmCommentsList');
  if (cmts.length === 0) {
    cl.innerHTML = '<div class="timeline-empty">还没有评论，第一个评论让团队知道你找到了什么</div>';
  } else {
    cl.innerHTML = cmts.map((c, i) => {
      const isAdopted = c.adopted;
      const canAdopt = m.creator === CURRENT_AGENT && c.suggestedSupplier && !isAdopted && c.user !== CURRENT_AGENT;
      const canRevoke = m.creator === CURRENT_AGENT && isAdopted;
      const canEdit = (c.user === CURRENT_AGENT || IS_ADMIN);
      const editedTag = c.editedAt ? `<span style="color: var(--text-tertiary); font-size: 10.5px; margin-left: 4px;" title="${escapeHtml(c.editedAt)}">· 已编辑</span>` : '';
      return `
      <div class="comment-item" data-comment-idx="${i}" style="${isAdopted ? 'border-left-color: var(--success);' : ''}">
        <div class="comment-meta">
          <span class="comment-user">👤 ${escapeHtml(c.user || '')}</span>
          <span>${c.date || ''} ${c.time || ''}${editedTag}</span>
          ${c.suggestedSupplier ? `<span class="comment-suggested">🏭 ${escapeHtml(c.suggestedSupplier)}</span>` : ''}
        </div>
        <div class="comment-view" data-comment-view="${i}">
          <div class="comment-text">${escapeHtml(c.content || '')}</div>
          ${canAdopt ? `<button class="comment-adopt-btn" onclick="adoptComment(${i})">⭐ 采纳此推荐（${SCORE_RULES.missingHelp} 分）</button>` : ''}
          ${isAdopted ? `<span class="comment-adopted">✓ 已采纳推荐 · ${escapeHtml(c.user)} +${SCORE_RULES.missingHelp} 分${canRevoke ? ` <a onclick="revokeAdopt(${i})" style="cursor:pointer;text-decoration:underline;color:var(--text-tertiary);margin-left:6px;">撤销</a>` : ''}</span>` : ''}
          ${canEdit ? `<div class="comment-actions" style="display:flex; gap:6px;"><button class="del-btn" onclick="startEditMissingComment(${i})" style="color: var(--accent);">✏️ 编辑</button><button class="del-btn" onclick="delMissingComment(${i})">删除评论</button></div>` : ''}
        </div>
        <div class="comment-edit" data-comment-edit="${i}" style="display:none;">
          <textarea class="form-control" data-edit-content="${i}" style="min-height: 60px; margin-top: 6px;">${escapeHtml(c.content || '')}</textarea>
          <input type="text" class="form-control" data-edit-supplier="${i}" placeholder="推荐供应商（可选）" value="${escapeHtml(c.suggestedSupplier || '')}" style="margin-top: 6px;">
          <div style="display:flex; gap:6px; margin-top: 8px;">
            <button class="btn primary sm" onclick="saveMissingCommentEdit(${i})">✓ 保存</button>
            <button class="btn sm ghost" onclick="cancelMissingCommentEdit(${i})">取消</button>
          </div>
        </div>
      </div>
    `;
    }).join('');
  }
}

async function onMissingField(field, value) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  // 权限检查：只有发起人或主管能修改
  if (m.creator !== CURRENT_AGENT && !IS_ADMIN) {
    toast('只有发起人能修改这个找灯任务', 'err');
    // 还原 UI 状态
    renderMissingModalContent();
    return;
  }
  m[field] = value;
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  if (field === 'status') {
    try { await DATA.saveAndSyncMissing(); }
    catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
  }
}

// deleteCurrentMissing 也加同步
async function deleteCurrentMissingSync() {
  // 旧函数保持兼容
  return deleteCurrentMissing();
}

function deleteCurrentMissing() {
  const m = DATA.getMissingLights().find(x => x._id === _currentItemId);
  if (!m) return;
  if (m.creator !== CURRENT_AGENT && !IS_ADMIN) { toast('只能删自己发起的任务', 'err'); return; }
  if (!confirm('确定删除这个任务？\n\n（删除后会进回收站，30 天内可恢复）')) return;
  m.deletedAt = new Date().toISOString();
  m.deletedBy = CURRENT_AGENT;
  DATA.saveMissingLights(DATA.getMissingLights());
  closeModal('missingModal');
  loadAllData();
  renderMissing();
  updateMissingStats();
  toast('已移入回收站');
}

async function addMissingComment() {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const content = document.getElementById('mmNewComment').value.trim();
  const supplier = document.getElementById('mmCommentSupplier').value.trim();
  if (!content && !supplier) { toast('请输入评论或推荐供应商', 'warn'); return; }
  if (!m.comments) m.comments = [];
  m.comments.push({
    _id: 'C' + Date.now(),
    user: CURRENT_AGENT,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    content,
    suggestedSupplier: supplier || '',
  });
  // 如果加了推荐供应商 + 当前是搜寻中，提示是否切到"已找到"
  if (supplier && m.status === 'searching') {
    if (confirm('已找到供应商，要切换状态为「已找到」吗？')) {
      m.status = 'found';
      document.getElementById('mmStatus').value = 'found';
    }
  }
  DATA.saveMissingLights(MISSING_LIGHTS);
  document.getElementById('mmNewComment').value = '';
  document.getElementById('mmCommentSupplier').value = '';
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  toast('✓ 评论已发布');
  // 立即同步云端
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function delMissingComment(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const c = m.comments[idx];
  if (c.user !== CURRENT_AGENT && !IS_ADMIN) { toast('只能删自己的评论', 'err'); return; }
  if (!confirm('删除这条评论？')) return;
  m.comments.splice(idx, 1);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

// 编辑评论：进入编辑态
function startEditMissingComment(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const c = (m.comments || [])[idx];
  if (!c) return;
  if (c.user !== CURRENT_AGENT && !IS_ADMIN) { toast('只能编辑自己的评论', 'err'); return; }
  // 切换视图 → 编辑
  const view = document.querySelector(`[data-comment-view="${idx}"]`);
  const edit = document.querySelector(`[data-comment-edit="${idx}"]`);
  if (view) view.style.display = 'none';
  if (edit) {
    edit.style.display = 'block';
    const ta = edit.querySelector(`[data-edit-content="${idx}"]`);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
}

// 取消编辑
function cancelMissingCommentEdit(idx) {
  const view = document.querySelector(`[data-comment-view="${idx}"]`);
  const edit = document.querySelector(`[data-comment-edit="${idx}"]`);
  if (edit) edit.style.display = 'none';
  if (view) view.style.display = '';
}

// 保存编辑
async function saveMissingCommentEdit(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  const c = (m.comments || [])[idx];
  if (!c) return;
  if (c.user !== CURRENT_AGENT && !IS_ADMIN) { toast('只能编辑自己的评论', 'err'); return; }
  const ta = document.querySelector(`[data-edit-content="${idx}"]`);
  const sup = document.querySelector(`[data-edit-supplier="${idx}"]`);
  const newContent = (ta?.value || '').trim();
  const newSupplier = (sup?.value || '').trim();
  if (!newContent && !newSupplier) { toast('评论或推荐供应商至少填一项', 'warn'); return; }
  // 若推荐供应商被改且评论已被采纳，提示一下（不阻断）
  if (c.adopted && newSupplier !== (c.suggestedSupplier || '')) {
    if (!confirm('该评论已被采纳，修改推荐供应商会影响采纳记录。\n\n确定继续吗？')) return;
  }
  c.content = newContent;
  c.suggestedSupplier = newSupplier;
  c.editedAt = new Date().toISOString();
  c.editedBy = CURRENT_AGENT;
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  toast('✓ 评论已更新');
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

// 删除实拍照片（所有登录用户均可删，与"所有人可上传"对应）
async function rmMissingRealPhoto(i) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  if (!m.realPhotos || !m.realPhotos[i]) return;
  if (!confirm('删除这张实拍照片？')) return;
  m.realPhotos.splice(i, 1);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function adoptComment(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  if (m.creator !== CURRENT_AGENT) { toast('只有发起人能采纳', 'err'); return; }
  const c = m.comments[idx];
  if (!c || !c.suggestedSupplier) return;
  if (!confirm(`采纳 ${c.user} 推荐的「${c.suggestedSupplier}」？\n\n${c.user} 将获得 ${SCORE_RULES.missingHelp} 分贡献积分。\n任务状态将自动切换为「已找到」。`)) return;
  
  c.adopted = true;
  c.adoptedAt = new Date().toISOString();
  m.status = 'found';
  m.adoptedHelper = c.user;
  m.foundAt = new Date().toISOString();
  document.getElementById('mmStatus').value = 'found';
  
  DATA.saveMissingLights(MISSING_LIGHTS);
  
  // 如果关联了采购单，自动给采购单加备注+候选供应商
  if (m.linkedPurchaseId) {
    const allPurchases = DATA.getAllPurchases();
    const linked = allPurchases.find(p => p._id === m.linkedPurchaseId);
    if (linked) {
      const pArr = DATA._cache.purchasesByAgent[linked._agent] || [];
      const p = pArr.find(x => x._id === m.linkedPurchaseId);
      if (p) {
        const noteAddition = `[找灯助攻] ${c.user} 推荐供应商：${c.suggestedSupplier}${c.content ? ' — ' + c.content : ''}`;
        p.notes = (p.notes ? p.notes + '\n\n' : '') + noteAddition;
        if (!p.followups) p.followups = [];
        p.followups.push({
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().slice(0, 5),
          note: `已找到供应商「${c.suggestedSupplier}」（由 ${c.user} 推荐）`,
          type: 'found'
        });
        DATA.savePurchases(linked._agent, pArr);
        try { await DATA.saveAndSyncPurchases(linked._agent); } catch (err) { console.error(err); }
      }
    }
  }
  
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  toast(`✓ 已采纳推荐，${c.user} 获得 ${SCORE_RULES.missingHelp} 分`);
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function revokeAdopt(idx) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  if (m.creator !== CURRENT_AGENT) { toast('只有发起人能撤销', 'err'); return; }
  if (!confirm('撤销采纳？该评论者将失去贡献积分。')) return;
  const c = m.comments[idx];
  c.adopted = false;
  delete c.adoptedAt;
  delete m.adoptedHelper;
  m.status = 'searching';
  document.getElementById('mmStatus').value = 'searching';
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  updateMissingStats();
  toast('已撤销采纳');
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

async function rmMissingScreenshot(i) {
  const m = MISSING_LIGHTS.find(x => x._id === _currentItemId);
  if (!m) return;
  if (m.creator !== CURRENT_AGENT && !IS_ADMIN) { toast('只有发起人能修改', 'err'); return; }
  m.screenshots.splice(i, 1);
  DATA.saveMissingLights(MISSING_LIGHTS);
  renderMissingModalContent();
  renderMissing();
  try { await DATA.saveAndSyncMissing(); }
  catch (err) { console.error(err); toast('同步失败:' + (err.message || err), 'err'); }
}

function updateMissingStats() {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  let searching = 0, found = 0, thisM = 0, mine = 0, totalCmts = 0;
  MISSING_LIGHTS.forEach(m => {
    if (m.status === 'searching') searching++;
    if (m.status === 'found') found++;
    if ((m.createdAt || '').startsWith(thisMonth)) thisM++;
    if (m.creator === CURRENT_AGENT) mine++;
    totalCmts += (m.comments || []).length;
  });
  document.getElementById('mSearching').textContent = searching;
  document.getElementById('mFound').textContent = found;
  document.getElementById('mThisMonth').textContent = thisM;
  document.getElementById('mMine').textContent = mine;
  document.getElementById('mComments').textContent = totalCmts;
  updateBadges();
}

