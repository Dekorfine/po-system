// ============================================================
// V20260531-SHARED-AFTERSALES:共享售后事件(跨部门库 aftersales_events)
// 客服写核心字段 · 跟单写改进/沟通图/timeline · 双方写完成动作
// 实时订阅 · 客服改完跟单即时看到 · 反之亦然
// ============================================================

(function() {
  'use strict';
  
  if (typeof cdmClient === 'undefined') {
    console.warn('[ASE] cdmClient 未就绪 · 共享售后模块跳过');
    return;
  }
  
  let ASE_LIST = [];                 // 全部事件
  let _aseFilter = 'all';            // 列表过滤(all / open / closed)
  let _aseSubscribed = false;
  let _aseCurrentEditId = null;      // 当前 modal 编辑的事件 ID
  
  // ============ 加载列表 ============
  async function aseLoad() {
    try {
      const { data, error } = await cdmClient
        .from('aftersales_events')
        .select('*')
        .eq('deleted', false)
        .order('created_at_ms', { ascending: false })
        .limit(500);
      if (error) throw error;
      ASE_LIST = data || [];
      aseRender();
    } catch (e) {
      console.warn('[ASE] 加载失败', e.message);
    }
  }
  
  // ============ 渲染列表(挂在 aftersales tab 顶部)============
  function aseRender() {
    const root = document.getElementById('aseRoot');
    if (!root) return;
    
    const list = ASE_LIST.filter(ev => {
      if (_aseFilter === 'open' && ev.completed) return false;
      if (_aseFilter === 'closed' && !ev.completed) return false;
      return true;
    });
    
    const total = ASE_LIST.length;
    const openCount = ASE_LIST.filter(e => !e.completed).length;
    const closedCount = total - openCount;
    
    root.innerHTML = `
      <div class="fb-card" style="margin-bottom:14px;border:1px solid #93c5fd;">
        <div class="fb-head" style="cursor:pointer;" onclick="aseToggleCollapse()">
          <div class="fb-title">
            🤝 客服共享售后事件 
            <span class="fb-total">${total}</span>
          </div>
          <div class="fb-tabs">
            <span class="fb-tab ${_aseFilter==='all'?'active':''}" onclick="event.stopPropagation();aseSetFilter('all')">全部 <span class="count">${total}</span></span>
            <span class="fb-tab ${_aseFilter==='open'?'active overdue':''}" onclick="event.stopPropagation();aseSetFilter('open')">未完成 <span class="count">${openCount}</span></span>
            <span class="fb-tab ${_aseFilter==='closed'?'active':''}" onclick="event.stopPropagation();aseSetFilter('closed')">已完成 <span class="count">${closedCount}</span></span>
            <button class="btn sm" onclick="event.stopPropagation();aseLoad()" style="margin-left:8px;">🔄 刷新</button>
            <span class="fb-toggle" id="aseToggleIcon">▾</span>
          </div>
        </div>
        <div class="fb-list" id="aseList" style="max-height:380px;overflow-y:auto;">
          ${list.length === 0 ? `<div class="fb-empty">暂无共享售后事件 · 等客服创建</div>` : list.map(ev => aseRenderItem(ev)).join('')}
        </div>
      </div>
    `;
  }
  
  function aseRenderItem(ev) {
    const imgCount = Array.isArray(ev.images) ? ev.images.length : 0;
    const vidCount = Array.isArray(ev.videos) ? ev.videos.length : 0;
    const tlCount = Array.isArray(ev.timeline) ? ev.timeline.length : 0;
    const improStatus = ev.improvement_status || '未开始';
    const improColor = {
      '未开始': '#a8a29e',
      '沟通中': '#ca8a04',
      '已转美工': '#2563eb',
      '已完成': '#15803d',
      '不涉及': '#78716c',
    }[improStatus] || '#a8a29e';
    const dt = new Date(ev.created_at_ms || 0);
    const dateStr = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    
    return `
      <div onclick="aseOpenDetail('${escapeAttr(ev.id)}')" style="display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;padding:10px 12px;background:${ev.completed?'#f0fdf4':'#fff'};border:1px solid ${ev.completed?'#86efac':'var(--border)'};border-radius:8px;cursor:pointer;margin-bottom:6px;font-size:13px;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='${ev.completed?'#86efac':'var(--border)'}'">
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#a8a29e;width:60px;">${escapeHtml(dateStr)}</div>
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:13px;color:#1c1917;">
            ${ev.completed ? '<span style="color:#15803d;font-size:11px;">✓ 已完成</span> ' : ''}
            ${escapeHtml(ev.order_no || '无订单号')} 
            <span style="color:#78716c;font-weight:400;font-size:11.5px;">· ${escapeHtml(ev.supplier || '—')} · ${escapeHtml(ev.event_type || '售后')}</span>
          </div>
          <div style="font-size:11.5px;color:#57534e;margin-top:2px;">
            ${escapeHtml(ev.product_name || ev.product_sku || '产品').slice(0, 30)}${(ev.product_name||'').length > 30 ? '...' : ''}
            ${ev.damaged_part ? ` · 损坏:${escapeHtml(ev.damaged_part)}` : ''}
            ${ev.reason ? ` · ${escapeHtml(ev.reason)}` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-size:10.5px;">
          ${imgCount > 0 ? `<span style="color:#2563eb;">📷 ${imgCount}</span>` : ''}
          ${vidCount > 0 ? `<span style="color:#7c3aed;">🎥 ${vidCount}</span>` : ''}
          ${tlCount > 0 ? `<span style="color:#78716c;">💬 ${tlCount}</span>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
          <span style="font-size:10px;background:${improColor};color:#fff;padding:2px 7px;border-radius:8px;font-weight:600;">改进:${escapeHtml(improStatus)}</span>
          <span style="font-size:10px;color:#a8a29e;">${escapeHtml(ev.status || 'open')}</span>
        </div>
      </div>
    `;
  }
  
  window.aseSetFilter = function(f) {
    _aseFilter = f;
    aseRender();
  };
  
  window.aseToggleCollapse = function() {
    const card = document.getElementById('aseRoot')?.querySelector('.fb-card');
    if (card) card.classList.toggle('collapsed');
    const icon = document.getElementById('aseToggleIcon');
    if (icon) icon.style.transform = card?.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0)';
  };
  
  // ============ 详情 Modal ============
  window.aseOpenDetail = function(id) {
    const ev = ASE_LIST.find(e => e.id === id);
    if (!ev) return;
    _aseCurrentEditId = id;
    
    const m = document.getElementById('aseDetailModal') || (() => {
      const d = document.createElement('div');
      d.id = 'aseDetailModal';
      d.className = 'modal-bg';
      d.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;align-items:center;justify-content:center;padding:20px;';
      document.body.appendChild(d);
      return d;
    })();
    
    m.style.display = 'flex';
    m.innerHTML = aseBuildDetailHTML(ev);
  };
  
  window.aseCloseDetail = function() {
    const m = document.getElementById('aseDetailModal');
    if (m) m.style.display = 'none';
    _aseCurrentEditId = null;
  };
  
  function aseBuildDetailHTML(ev) {
    const images = Array.isArray(ev.images) ? ev.images : [];
    const videos = Array.isArray(ev.videos) ? ev.videos : [];
    const commImgs = Array.isArray(ev.communication_images) ? ev.communication_images : [];
    const timeline = Array.isArray(ev.timeline) ? ev.timeline : [];
    const improStatus = ev.improvement_status || '未开始';
    
    return `
      <div style="background:#fff;border-radius:14px;width:100%;max-width:920px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        
        <!-- 头部 -->
        <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;padding:14px 20px;border-radius:14px 14px 0 0;position:sticky;top:0;z-index:10;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <h3 style="margin:0;font-size:15px;font-weight:700;">${ev.completed?'✓ ':''}${escapeHtml(ev.order_no || '无订单号')} · ${escapeHtml(ev.event_type || '售后')}</h3>
              <div style="font-size:11.5px;opacity:0.85;margin-top:3px;">${escapeHtml(ev.supplier || '—')} · ${escapeHtml(ev.shop || '—')} · 创建于 ${new Date(ev.created_at_ms||0).toLocaleString()}</div>
            </div>
            <button onclick="aseCloseDetail()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:15px;">✕</button>
          </div>
        </div>
        
        <div style="padding:18px 20px;">
          
          <!-- 客服核心信息(只读)-->
          <div style="background:#fafaf9;border-radius:10px;padding:12px 14px;margin-bottom:14px;border-left:3px solid #2563eb;">
            <div style="font-size:10.5px;color:#a8a29e;font-weight:700;letter-spacing:1px;margin-bottom:8px;">📋 客服信息(只读)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:12.5px;">
              ${ev.product_name ? `<div><b style="color:#78716c;">产品:</b> ${escapeHtml(ev.product_name)}</div>` : ''}
              ${ev.product_sku ? `<div><b style="color:#78716c;">SKU:</b> <code style="font-family:'JetBrains Mono',monospace;">${escapeHtml(ev.product_sku)}</code></div>` : ''}
              ${ev.damaged_part ? `<div><b style="color:#78716c;">损坏部位:</b> <span style="color:#dc2626;font-weight:600;">${escapeHtml(ev.damaged_part)}</span></div>` : ''}
              ${ev.reason ? `<div><b style="color:#78716c;">原因:</b> ${escapeHtml(ev.reason)}</div>` : ''}
              ${ev.customer_name ? `<div><b style="color:#78716c;">客户:</b> ${escapeHtml(ev.customer_name)}${ev.customer_country?` · ${escapeHtml(ev.customer_country)}`:''}</div>` : ''}
              ${ev.amount != null ? `<div><b style="color:#78716c;">金额:</b> <span style="font-family:'JetBrains Mono',monospace;">$${ev.amount}</span></div>` : ''}
            </div>
            ${ev.reason_detail ? `<div style="margin-top:8px;font-size:12.5px;"><b style="color:#78716c;">原因细节:</b><br><div style="white-space:pre-wrap;color:#1c1917;">${escapeHtml(ev.reason_detail)}</div></div>` : ''}
            ${ev.damage_desc ? `<div style="margin-top:8px;font-size:12.5px;"><b style="color:#78716c;">损坏描述:</b><br><div style="white-space:pre-wrap;color:#1c1917;">${escapeHtml(ev.damage_desc)}</div></div>` : ''}
          </div>
          
          <!-- 图片(客服上传)-->
          ${images.length > 0 ? `
            <div style="margin-bottom:14px;">
              <div style="font-size:11.5px;color:#78716c;font-weight:700;margin-bottom:6px;">📷 现场图片(${images.length})</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${images.map((im, i) => `
                  <div style="position:relative;">
                    <img src="${escapeAttr(im.url)}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #e7e5e4;cursor:pointer;" onclick="asePreviewImg('${escapeAttr(im.url)}')" alt="图${i+1}">
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <!-- 视频(客服上传)-->
          ${videos.length > 0 ? `
            <div style="margin-bottom:14px;">
              <div style="font-size:11.5px;color:#78716c;font-weight:700;margin-bottom:6px;">🎥 视频(${videos.length})</div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                ${videos.map((v, i) => `
                  <div style="border:1px solid #e7e5e4;border-radius:8px;padding:6px;background:#fff;max-width:280px;">
                    <video controls preload="metadata" style="width:100%;max-width:260px;border-radius:4px;display:block;">
                      <source src="${escapeAttr(v.url)}" type="${escapeAttr(v.mime || 'video/mp4')}">
                    </video>
                    <div style="margin-top:4px;display:flex;justify-content:space-between;font-size:10.5px;color:#78716c;">
                      <span>${escapeHtml(v.name || `视频${i+1}`)}</span>
                      <a href="${escapeAttr(v.url)}" download="${escapeAttr(v.name || `video${i+1}.mp4`)}" style="color:#2563eb;text-decoration:underline;">⬇ 下载</a>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <!-- 跟单填:产品改进意见 -->
          <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <div style="font-size:10.5px;color:#1e40af;font-weight:700;letter-spacing:1px;margin-bottom:8px;">🛠 跟单 · 产品改进(可编辑)</div>
            
            <label style="display:block;font-size:11.5px;color:#1e40af;font-weight:600;margin-bottom:4px;">改进状态</label>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">
              ${['未开始','沟通中','已转美工','已完成','不涉及'].map(s => `
                <button onclick="aseSetImproveStatus('${s}')" style="padding:5px 10px;border:1.5px solid ${improStatus===s?'#2563eb':'#cbd5e1'};background:${improStatus===s?'#2563eb':'#fff'};color:${improStatus===s?'#fff':'#1c1917'};border-radius:5px;font-size:11.5px;cursor:pointer;font-weight:${improStatus===s?'700':'500'};">${s}</button>
              `).join('')}
            </div>
            
            <label style="display:block;font-size:11.5px;color:#1e40af;font-weight:600;margin-bottom:4px;">改进意见(给供应商/美工)</label>
            <textarea id="aseImproveSugg" rows="3" placeholder="如:模具尺寸需要调整 / 包装加固 / 颜色调整..."
              style="width:100%;padding:8px 10px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;">${escapeHtml(ev.improvement_suggestion || '')}</textarea>
            
            <!-- 沟通图片 -->
            <div style="margin-top:10px;">
              <label style="display:block;font-size:11.5px;color:#1e40af;font-weight:600;margin-bottom:4px;">沟通图片(传到客服/供应商/美工的图)</label>
              <div id="aseCommImgs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                ${commImgs.map((im, i) => `
                  <div style="position:relative;">
                    <img src="${escapeAttr(im.url)}" style="width:64px;height:64px;object-fit:cover;border-radius:5px;border:1px solid #cbd5e1;cursor:pointer;" onclick="asePreviewImg('${escapeAttr(im.url)}')">
                    <button onclick="aseRemoveCommImg(${i})" style="position:absolute;top:-5px;right:-5px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:none;cursor:pointer;font-size:11px;line-height:1;padding:0;">✕</button>
                  </div>
                `).join('')}
                <label style="width:64px;height:64px;border:1.5px dashed #cbd5e1;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:#78716c;font-size:18px;">
                  +<span style="font-size:9px;">添加图</span>
                  <input type="file" accept="image/*" multiple style="display:none;" onchange="aseUploadCommImgs(this.files)">
                </label>
              </div>
              <div id="aseCommUploadStatus" style="font-size:10.5px;color:#78716c;"></div>
            </div>
            
            <button onclick="aseSaveImprove()" style="margin-top:10px;padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:12.5px;font-weight:700;cursor:pointer;">💾 保存改进信息</button>
          </div>
          
          <!-- Timeline 跟进 -->
          <div style="background:#fafaf9;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <div style="font-size:10.5px;color:#78716c;font-weight:700;letter-spacing:1px;margin-bottom:8px;">💬 跟进时间线(${timeline.length})</div>
            ${timeline.length === 0 ? `<div style="color:#a8a29e;font-size:11.5px;text-align:center;padding:10px;">暂无跟进 · 在下方添加</div>` : `
              <div style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;padding-right:4px;">
                ${[...timeline].reverse().map(tl => `
                  <div style="background:#fff;padding:8px 10px;border-radius:6px;border-left:3px solid ${tl.role==='cs'?'#7c3aed':tl.role==='orders'?'#2563eb':'#a8a29e'};">
                    <div style="font-size:11px;color:#78716c;display:flex;justify-content:space-between;">
                      <span><b style="color:#1c1917;">${escapeHtml(tl.by || '匿名')}</b> <span style="background:${tl.role==='cs'?'#ede9fe':tl.role==='orders'?'#dbeafe':'#f3f4f6'};color:${tl.role==='cs'?'#7c3aed':tl.role==='orders'?'#2563eb':'#78716c'};padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px;">${tl.role==='cs'?'客服':tl.role==='orders'?'跟单':'其它'}</span></span>
                      <span>${new Date(tl.ts).toLocaleString()}</span>
                    </div>
                    <div style="font-size:12px;color:#1c1917;margin-top:3px;">
                      ${tl.action ? `<b>[${escapeHtml(tl.action)}]</b> ` : ''}${escapeHtml(tl.note || '')}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
            
            <div style="margin-top:10px;display:flex;gap:6px;align-items:flex-start;">
              <select id="aseTlAction" style="padding:7px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;">
                <option value="跟进">跟进</option>
                <option value="改进">改进</option>
                <option value="沟通">沟通</option>
                <option value="联系供应商">联系供应商</option>
                <option value="联系客户">联系客户</option>
                <option value="备注">备注</option>
              </select>
              <textarea id="aseTlNote" rows="2" placeholder="跟进备注..." style="flex:1;padding:7px 10px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
              <button onclick="aseAddTimeline()" style="padding:7px 14px;background:#2563eb;color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;font-weight:600;align-self:stretch;">追加</button>
            </div>
          </div>
          
          <!-- 完成确认 -->
          <div style="background:${ev.completed?'#f0fdf4':'#fef3c7'};border:1px solid ${ev.completed?'#86efac':'#fbbf24'};border-radius:10px;padding:12px 14px;">
            <div style="font-size:10.5px;color:${ev.completed?'#166534':'#92400e'};font-weight:700;letter-spacing:1px;margin-bottom:8px;">
              ${ev.completed ? '✓ 已完成' : '🏁 完成处理'}
            </div>
            ${ev.completed ? `
              <div style="font-size:12.5px;color:#166534;">
                由 <b>${escapeHtml(ev.completed_by || '匿名')}</b> 于 ${new Date(ev.completed_at_ms||0).toLocaleString()} 确认完成
              </div>
              ${ev.final_resolution ? `<div style="margin-top:6px;padding:8px;background:#fff;border-radius:5px;font-size:12px;"><b>最终方案:</b> ${escapeHtml(ev.final_resolution)}</div>` : ''}
              <button onclick="aseReopen()" style="margin-top:8px;padding:6px 14px;background:#fff;border:1px solid #86efac;color:#166534;border-radius:5px;font-size:11.5px;cursor:pointer;">↺ 重新打开</button>
            ` : `
              <label style="display:block;font-size:11.5px;color:#92400e;font-weight:600;margin-bottom:4px;">最终处理方案</label>
              <textarea id="aseFinalRes" rows="2" placeholder="如:全单重发 / 退款 / 补寄配件等..." style="width:100%;padding:7px 10px;border:1px solid #fbbf24;border-radius:5px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
              <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                <select id="aseFinalStatus" style="padding:6px;border:1px solid #fbbf24;border-radius:5px;font-size:12px;">
                  <option value="closed">已关闭(常规)</option>
                  <option value="returned">已退货</option>
                  <option value="customer_refund">已退款</option>
                </select>
                <button onclick="aseConfirmComplete()" style="padding:8px 22px;background:#15803d;color:#fff;border:none;border-radius:5px;font-size:12.5px;cursor:pointer;font-weight:700;">✅ 确认完成</button>
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }
  
  // ============ 图片预览 ============
  window.asePreviewImg = function(url) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
    ov.onclick = () => ov.remove();
    ov.innerHTML = `<img src="${escapeAttr(url)}" style="max-width:96%;max-height:96%;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.5);">`;
    document.body.appendChild(ov);
  };
  
  // ============ 改进状态 toggle ============
  let _aseImproveStatusPending = null;
  window.aseSetImproveStatus = function(s) {
    _aseImproveStatusPending = s;
    const ev = ASE_LIST.find(e => e.id === _aseCurrentEditId);
    if (ev) {
      // 立即视觉更新(不写库 · 等点保存)
      ev._pendingImproveStatus = s;
      const m = document.getElementById('aseDetailModal');
      if (m && m.style.display !== 'none') {
        m.innerHTML = aseBuildDetailHTML({ ...ev, improvement_status: s });
      }
    }
  };
  
  // ============ 上传沟通图 ============
  window.aseUploadCommImgs = async function(files) {
    if (!files || files.length === 0) return;
    const ev = ASE_LIST.find(e => e.id === _aseCurrentEditId);
    if (!ev) return;
    
    const status = document.getElementById('aseCommUploadStatus');
    if (status) status.textContent = `上传中 0/${files.length}...`;
    
    const existing = Array.isArray(ev.communication_images) ? [...ev.communication_images] : [];
    let done = 0;
    
    for (const f of files) {
      try {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `aftersales/comm_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await cdmClient.storage.from('attachments')
          .upload(path, f, { contentType: f.type, upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = cdmClient.storage.from('attachments').getPublicUrl(path);
        existing.push({ url: publicUrl, name: f.name, mime: f.type });
        done++;
        if (status) status.textContent = `上传中 ${done}/${files.length}...`;
      } catch (e) {
        console.warn('[ASE] 上传图失败', e);
        if (status) status.textContent = `上传失败:${e.message}`;
      }
    }
    
    // 更新当前 ev 的 communication_images(只本地 · 等保存写库)
    ev._pendingCommImages = existing;
    if (status) status.textContent = `已添加 ${done} 张图 · 点 [保存改进信息] 写入`;
    
    // 重渲 modal
    const m = document.getElementById('aseDetailModal');
    if (m && m.style.display !== 'none') {
      m.innerHTML = aseBuildDetailHTML({ ...ev, communication_images: existing });
    }
  };
  
  window.aseRemoveCommImg = function(idx) {
    const ev = ASE_LIST.find(e => e.id === _aseCurrentEditId);
    if (!ev) return;
    const imgs = ev._pendingCommImages || ev.communication_images || [];
    const newImgs = imgs.filter((_, i) => i !== idx);
    ev._pendingCommImages = newImgs;
    const m = document.getElementById('aseDetailModal');
    if (m && m.style.display !== 'none') {
      m.innerHTML = aseBuildDetailHTML({ ...ev, communication_images: newImgs });
    }
  };
  
  // ============ 保存改进信息 ============
  window.aseSaveImprove = async function() {
    const ev = ASE_LIST.find(e => e.id === _aseCurrentEditId);
    if (!ev) return;
    
    const sugg = document.getElementById('aseImproveSugg')?.value || '';
    const status = ev._pendingImproveStatus || ev.improvement_status || '未开始';
    const commImgs = ev._pendingCommImages !== undefined ? ev._pendingCommImages : (ev.communication_images || []);
    
    try {
      const { error } = await cdmClient
        .from('aftersales_events')
        .update({
          improvement_suggestion: sugg,
          improvement_status: status,
          communication_images: commImgs,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ev.id);
      if (error) throw error;
      
      // 本地同步
      ev.improvement_suggestion = sugg;
      ev.improvement_status = status;
      ev.communication_images = commImgs;
      delete ev._pendingImproveStatus;
      delete ev._pendingCommImages;
      
      if (typeof toast === 'function') toast('改进信息已保存', 'ok');
      aseRender();
      // 重渲 modal
      aseOpenDetail(ev.id);
    } catch (e) {
      if (typeof toast === 'function') toast('保存失败:' + e.message, 'err');
    }
  };
  
  // ============ 追加 timeline ============
  window.aseAddTimeline = async function() {
    const ev = ASE_LIST.find(e => e.id === _aseCurrentEditId);
    if (!ev) return;
    
    const action = document.getElementById('aseTlAction')?.value || '跟进';
    const note = (document.getElementById('aseTlNote')?.value || '').trim();
    if (!note) {
      if (typeof toast === 'function') toast('请填写跟进备注', 'err');
      return;
    }
    
    const me = aseGetMe();
    const newEntry = {
      ts: Date.now(),
      by: me.name,
      role: 'orders',
      action: action,
      note: note,
    };
    const newTimeline = [...(ev.timeline || []), newEntry];
    
    try {
      const { error } = await cdmClient
        .from('aftersales_events')
        .update({
          timeline: newTimeline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ev.id);
      if (error) throw error;
      
      ev.timeline = newTimeline;
      if (typeof toast === 'function') toast('跟进已追加', 'ok');
      aseRender();
      aseOpenDetail(ev.id);
    } catch (e) {
      if (typeof toast === 'function') toast('追加失败:' + e.message, 'err');
    }
  };
  
  // ============ 确认完成 ============
  window.aseConfirmComplete = async function() {
    const ev = ASE_LIST.find(e => e.id === _aseCurrentEditId);
    if (!ev) return;
    
    const finalRes = (document.getElementById('aseFinalRes')?.value || '').trim();
    const finalStatus = document.getElementById('aseFinalStatus')?.value || 'closed';
    const me = aseGetMe();
    
    if (!confirm('确认完成此售后事件?完成后仍可继续编辑/追加跟进。')) return;
    
    const now = Date.now();
    const newTimeline = [...(ev.timeline || []), {
      ts: now,
      by: me.name,
      role: 'orders',
      action: '完成',
      note: finalRes || '已确认完成',
    }];
    
    try {
      const { error } = await cdmClient
        .from('aftersales_events')
        .update({
          completed: true,
          completed_by: me.name,
          completed_at_ms: now,
          final_resolution: finalRes,
          status: finalStatus,
          timeline: newTimeline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ev.id);
      if (error) throw error;
      
      ev.completed = true;
      ev.completed_by = me.name;
      ev.completed_at_ms = now;
      ev.final_resolution = finalRes;
      ev.status = finalStatus;
      ev.timeline = newTimeline;
      
      if (typeof toast === 'function') toast('✅ 已确认完成', 'ok');
      aseRender();
      aseOpenDetail(ev.id);
    } catch (e) {
      if (typeof toast === 'function') toast('完成失败:' + e.message, 'err');
    }
  };
  
  // ============ 重新打开 ============
  window.aseReopen = async function() {
    const ev = ASE_LIST.find(e => e.id === _aseCurrentEditId);
    if (!ev) return;
    if (!confirm('重新打开此售后事件?')) return;
    
    const me = aseGetMe();
    const newTimeline = [...(ev.timeline || []), {
      ts: Date.now(),
      by: me.name,
      role: 'orders',
      action: '重新打开',
      note: '',
    }];
    
    try {
      const { error } = await cdmClient
        .from('aftersales_events')
        .update({
          completed: false,
          status: 'open',
          timeline: newTimeline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ev.id);
      if (error) throw error;
      
      ev.completed = false;
      ev.status = 'open';
      ev.timeline = newTimeline;
      
      if (typeof toast === 'function') toast('已重新打开', 'ok');
      aseRender();
      aseOpenDetail(ev.id);
    } catch (e) {
      if (typeof toast === 'function') toast('失败:' + e.message, 'err');
    }
  };
  
  // ============ 当前用户 ============
  function aseGetMe() {
    if (typeof _cdmGetCurrentUser === 'function') {
      const u = _cdmGetCurrentUser();
      return { id: u.id, name: u.displayName || u.name || 'unknown' };
    }
    return { id: 'unknown', name: '未知' };
  }
  
  // ============ Realtime 订阅 ============
  function aseSubscribe() {
    if (_aseSubscribed) return;
    try {
      cdmClient
        .channel('ase-events-' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'aftersales_events' }, (payload) => {
          console.log('[ASE Realtime]', payload.eventType, payload.new?.id);
          aseLoad();
        })
        .subscribe();
      _aseSubscribed = true;
      console.log('[ASE] ✓ Realtime 订阅成功');
    } catch (e) {
      console.warn('[ASE] Realtime 失败', e);
    }
  }
  
  // ============ 初始化:注入挂载点 + 加载 ============
  window.aseInit = function() {
    // 检查挂载点是否已存在
    if (document.getElementById('aseRoot')) return;
    
    const tabContent = document.querySelector('.tab-content[data-tab="aftersales"]');
    if (!tabContent) return;
    
    // 在 tab content 最前插入挂载点
    const root = document.createElement('div');
    root.id = 'aseRoot';
    root.className = 'section-block';
    tabContent.insertBefore(root, tabContent.firstChild);
    
    aseLoad();
    aseSubscribe();
  };
  
  // ============ 工具 ============
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  
  // 启动:切到售后 tab 时初始化
  document.addEventListener('DOMContentLoaded', () => {
    // 等 cdmClient 就绪
    const t = setInterval(() => {
      if (typeof cdmClient !== 'undefined' && cdmClient) {
        clearInterval(t);
        // 等用户登录 + 工作台显示
        const ready = setInterval(() => {
          const mainApp = document.getElementById('mainApp');
          if (mainApp && mainApp.style.display !== 'none') {
            clearInterval(ready);
            aseInit();
          }
        }, 500);
      }
    }, 200);
  });
  
})();
