// ============================================================================
// V20260528f · 库存仓库系统(阶段 B · tab + 录入/编辑 + 多店 SKU 绑定)
// ----------------------------------------------------------------------------
// 设计:复用 products 表 · 简单版扣减(下单-1/退款+1)· 纯手动绑定
// 三层:平台SKU(多店) → 商品SKU(内部统一) → 库存数量
// ============================================================================

const INVENTORY = {
  _list: [],          // 当前显示的库存产品
  _filter: 'all',     // all / low / out / today / unbound
  _loadedAt: 0,
  _search: '',
};

// 店铺列表(用于绑定 UI · 从 SHOPIFY.STORES_META 取)
function _invShopOptions() {
  const stores = (typeof SHOPIFY !== 'undefined' && SHOPIFY.STORES_META) ? SHOPIFY.STORES_META : [];
  return stores
    .filter(s => !s.legacyOnly)
    .map(s => ({
      domain: s.domain,
      label: s.display_name || s.domain.replace(/\.myshopify\.com$/, '').replace(/\..*$/, ''),
    }));
}

// ─────────────── 主渲染 ───────────────
async function renderInventory() {
  const body = document.getElementById('inventoryBody');
  if (!body) return;
  
  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
      <div>
        <h2 style="margin:0; font-size:18px; display:flex; align-items:center; gap:8px;">
          📦 库存仓库
          <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">多店同款绑定一个内部 SKU · 下单自动扣减</span>
        </h2>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn primary" onclick="invOpenEdit()">+ 录入库存</button>
      </div>
    </div>

    <!-- 筛选 -->
    <div style="display:flex; gap:6px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
      ${[
        { k: 'all',     label: '📋 全部' },
        { k: 'low',     label: '⚠️ 低库存' },
        { k: 'out',     label: '🔴 缺货' },
        { k: 'today',   label: '📅 今日消耗' },
        { k: 'unbound', label: '🔗 未绑定平台SKU' },
      ].map(f => `
        <button onclick="invSetFilter('${f.k}')" 
                style="padding:6px 12px; font-size:12px; border:1px solid ${INVENTORY._filter === f.k ? 'var(--accent)' : 'var(--border)'}; border-radius:18px; background:${INVENTORY._filter === f.k ? 'var(--accent)' : 'var(--bg-card)'}; color:${INVENTORY._filter === f.k ? 'white' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${INVENTORY._filter === f.k ? '600' : '400'};">
          ${f.label}
        </button>
      `).join('')}
      <input type="text" id="invSearchInput" placeholder="🔍 内部SKU / 名称 / 平台SKU" 
             value="${escapeHtml(INVENTORY._search)}"
             oninput="INVENTORY._search=this.value; _invRenderList()"
             style="margin-left:auto; padding:6px 12px; font-size:12px; border:1px solid var(--border); border-radius:18px; width:240px;">
    </div>

    <div id="inventoryList">
      <div style="padding:32px; text-align:center; color:var(--text-tertiary);">加载中...</div>
    </div>
  `;
  
  await _invLoadData();
  _invRenderList();
}
window.renderInventory = renderInventory;

function invSetFilter(f) {
  INVENTORY._filter = f;
  renderInventory();
}
window.invSetFilter = invSetFilter;

async function _invLoadData() {
  try {
    // 库存产品 = is_inventory_item = true
    const { data, error } = await sb.from('products')
      .select('*')
      .eq('is_inventory_item', true)
      .is('deleted_at', null)
      .order('stock_qty', { ascending: true });  // 库存少的排前面
    if (error) throw error;
    INVENTORY._list = data || [];
    INVENTORY._loadedAt = Date.now();
    
    // 今日消耗:查 inventory_movements
    if (INVENTORY._filter === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: moves } = await sb.from('inventory_movements')
        .select('*')
        .eq('movement_type', 'order_deduct')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false });
      INVENTORY._todayMoves = moves || [];
    }
  } catch (e) {
    console.error('加载库存失败:', e);
    INVENTORY._list = [];
    const listEl = document.getElementById('inventoryList');
    if (listEl) listEl.innerHTML = `<div style="padding:20px; text-align:center; color:var(--danger);">加载失败:${escapeHtml(e.message || String(e))}<br><span style="font-size:11px;">SQL 跑了吗?(inventory-system.sql)</span></div>`;
  }
}

function _invRenderList() {
  const listEl = document.getElementById('inventoryList');
  if (!listEl) return;
  
  // 今日消耗 = 单独渲染
  if (INVENTORY._filter === 'today') {
    return _invRenderTodayMoves();
  }
  
  let list = INVENTORY._list;
  
  // 搜索
  const q = (INVENTORY._search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(p => {
      if ((p.sku || '').toLowerCase().includes(q)) return true;
      if ((p.title_cn || p.title || '').toLowerCase().includes(q)) return true;
      const platSkus = Array.isArray(p.platform_skus) ? p.platform_skus : [];
      return platSkus.some(ps => (ps.sku || '').toLowerCase().includes(q));
    });
  }
  
  // 筛选
  if (INVENTORY._filter === 'low') {
    list = list.filter(p => p.stock_qty > 0 && p.stock_qty <= (p.stock_alert_threshold || 5));
  } else if (INVENTORY._filter === 'out') {
    list = list.filter(p => p.stock_qty <= 0);
  } else if (INVENTORY._filter === 'unbound') {
    list = list.filter(p => !Array.isArray(p.platform_skus) || p.platform_skus.length === 0);
  }
  
  if (list.length === 0) {
    listEl.innerHTML = `
      <div style="padding:48px; text-align:center; color:var(--text-tertiary); background:var(--bg-card); border:1px dashed var(--border); border-radius:10px;">
        <div style="font-size:32px; margin-bottom:8px;">📦</div>
        <div style="font-size:14px;">${INVENTORY._filter === 'all' && !q ? '还没录入任何库存' : '当前筛选无匹配'}</div>
        ${INVENTORY._filter === 'all' && !q ? `<button class="btn primary" onclick="invOpenEdit()" style="margin-top:12px;">+ 录入第一个</button>` : ''}
      </div>`;
    return;
  }
  
  listEl.innerHTML = list.map(p => _invCardHtml(p)).join('');
}

function _invCardHtml(p) {
  const stock = Number(p.stock_qty || 0);
  const threshold = Number(p.stock_alert_threshold || 5);
  const platSkus = Array.isArray(p.platform_skus) ? p.platform_skus : [];
  
  // 状态颜色
  let statusColor = 'var(--success)', statusBg = 'rgba(22,163,74,0.06)', statusText = '';
  if (stock <= 0) { statusColor = 'var(--danger)'; statusBg = 'rgba(220,38,38,0.06)'; statusText = '🔴 缺货'; }
  else if (stock <= threshold) { statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,0.08)'; statusText = '⚠️ 低库存'; }
  
  // 库存条(以 threshold*4 或 stock 较大者为满)
  const barMax = Math.max(stock, threshold * 4, 10);
  const barPct = Math.min(100, Math.round(stock / barMax * 100));
  const barColor = stock <= 0 ? 'var(--danger)' : stock <= threshold ? '#f59e0b' : 'var(--success)';
  
  return `
    <div style="display:grid; grid-template-columns: 72px 1fr auto; gap:14px; padding:14px; background:${statusBg}; border:1px solid var(--border); border-left:4px solid ${statusColor}; border-radius:8px; margin-bottom:8px;">
      <!-- 图 -->
      <div>
        ${p.image_url 
          ? `<img src="${escapeHtml(p.image_url)}" style="width:72px; height:72px; object-fit:cover; border-radius:6px; cursor:zoom-in;" onclick="openImgLightbox && openImgLightbox('${escapeHtml(p.image_url)}')">` 
          : `<div style="width:72px; height:72px; background:var(--bg-elevated); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:24px;">📦</div>`}
      </div>
      <!-- 主信息 -->
      <div style="min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap;">
          ${statusText ? `<span style="background:${statusColor}; color:white; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;">${statusText}</span>` : ''}
          <span style="font-size:14px; font-weight:600; color:var(--text-primary);">${escapeHtml(p.title_cn || p.title || '(无名)')}</span>
        </div>
        <div style="font-size:11px; color:var(--text-tertiary); font-family:monospace; margin-bottom:6px;">内部 SKU: ${escapeHtml(p.sku || '')}</div>
        
        <!-- 库存条 -->
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
          <div style="flex:1; max-width:200px; height:8px; background:var(--bg-elevated); border-radius:4px; overflow:hidden;">
            <div style="width:${barPct}%; height:100%; background:${barColor}; transition:width 0.3s;"></div>
          </div>
          <span style="font-size:13px; font-weight:700; color:${statusColor}; font-family:monospace;">${stock}</span>
          <span style="font-size:11px; color:var(--text-tertiary);">预警线 ${threshold}</span>
        </div>
        
        <!-- 绑定的平台 SKU -->
        ${platSkus.length > 0 ? `
        <div style="font-size:11px; color:var(--text-secondary); line-height:1.6;">
          🔗 绑定 ${platSkus.length} 个平台 SKU:
          ${platSkus.map(ps => `<span style="display:inline-block; margin:1px 3px; padding:1px 7px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; font-size:10.5px; font-family:monospace;">${escapeHtml(ps.sku)} <span style="color:var(--text-tertiary);">${escapeHtml(ps.shop_label || '')}</span></span>`).join('')}
        </div>` : `
        <div style="font-size:11px; color:#92400e;">🔗 未绑定平台 SKU · 下单不会自动扣减 · 点编辑去绑定</div>`}
      </div>
      <!-- 右:操作 -->
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <button class="btn small" onclick="invOpenAdjust('${p.id}')" style="font-size:11px; padding:3px 10px;" title="快速调整库存数量">± 调整</button>
        <button class="btn small" onclick="invOpenEdit('${p.id}')" style="font-size:11px; padding:3px 10px;">📝 编辑</button>
      </div>
    </div>
  `;
}

function _invRenderTodayMoves() {
  const listEl = document.getElementById('inventoryList');
  if (!listEl) return;
  const moves = INVENTORY._todayMoves || [];
  
  if (moves.length === 0) {
    listEl.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-tertiary);">今天还没有订单消耗库存</div>`;
    return;
  }
  
  const totalQty = moves.reduce((s, m) => s + Math.abs(m.qty_change || 0), 0);
  
  listEl.innerHTML = `
    <div style="padding:12px 14px; background:rgba(37,99,235,0.05); border-radius:8px; margin-bottom:10px; font-size:13px;">
      📅 今天共 <b style="color:var(--accent);">${moves.length}</b> 笔扣减 · 消耗 <b style="color:var(--accent);">${totalQty}</b> 件库存
    </div>
    ${moves.map(m => `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; margin-bottom:6px; font-size:12px;">
        <span style="font-family:monospace; color:var(--accent); flex-shrink:0;">${escapeHtml(m.internal_sku || '')}</span>
        <span style="color:var(--danger); font-weight:600; flex-shrink:0;">${m.qty_change}</span>
        <span style="color:var(--text-tertiary); flex-shrink:0;">→ 剩 ${m.qty_after}</span>
        <span style="color:var(--text-secondary); margin-left:auto; font-size:11px;">${escapeHtml(m.ref_id || '')} · ${new Date(m.created_at).toLocaleTimeString()}</span>
      </div>
    `).join('')}
  `;
}

// ─────────────── 录入/编辑 modal ───────────────
let INV_EDIT = null;

function invOpenEdit(productId = null) {
  if (productId) {
    const p = INVENTORY._list.find(x => String(x.id) === String(productId))
            || (typeof PRODUCTS_CACHE !== 'undefined' ? PRODUCTS_CACHE._byId[productId] : null);
    if (!p) { toast('找不到产品', 'err'); return; }
    INV_EDIT = {
      id: p.id,
      sku: p.sku || '',
      title: p.title_cn || p.title || '',
      image_url: p.image_url || '',
      stock_qty: Number(p.stock_qty || 0),
      stock_alert_threshold: Number(p.stock_alert_threshold || 5),
      platform_skus: Array.isArray(p.platform_skus) ? JSON.parse(JSON.stringify(p.platform_skus)) : [],
      isNew: false,
    };
  } else {
    INV_EDIT = {
      id: null, sku: '', title: '', image_url: '',
      stock_qty: 0, stock_alert_threshold: 5, platform_skus: [],
      isNew: true,
    };
  }
  document.getElementById('inventoryEditModal').style.display = 'flex';
  _invRenderEdit();
  if (typeof _disableAutofillOnFields === 'function') {
    setTimeout(() => _disableAutofillOnFields(document.getElementById('inventoryEditModal')), 0);
  }
}
window.invOpenEdit = invOpenEdit;

function invCloseEdit() {
  document.getElementById('inventoryEditModal').style.display = 'none';
  INV_EDIT = null;
}
window.invCloseEdit = invCloseEdit;

function _invRenderEdit() {
  const s = INV_EDIT;
  if (!s) return;
  const body = document.getElementById('inventoryEditBody');
  const shops = _invShopOptions();
  
  body.innerHTML = `
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px; margin-bottom:14px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">
          内部 SKU <span style="color:var(--danger);">*</span>
          ${s.isNew ? '<span style="font-weight:400;color:var(--text-tertiary);">· 输入后按 [🔍 拉取] 自动从 Shopify 找产品</span>' : ''}
        </label>
        <div style="display:flex; gap:6px;">
          <input type="text" id="invEditSkuInput" value="${escapeHtml(s.sku)}" oninput="INV_EDIT.sku=this.value"
                 onkeydown="if(event.key==='Enter' && ${s.isNew}){event.preventDefault();invFetchFromShopify();}"
                 ${s.isNew ? '' : 'readonly'}
                 placeholder="例:VK-PEARL-001"
                 style="flex:1; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; font-family:monospace; ${s.isNew ? '' : 'background:var(--bg-elevated); color:var(--text-tertiary);'}">
          ${s.isNew ? `<button onclick="invFetchFromShopify()" style="padding:8px 14px; background:var(--accent); color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; white-space:nowrap;">🔍 拉取</button>` : ''}
        </div>
        ${!s.isNew ? '<div style="font-size:10px; color:var(--text-tertiary); margin-top:2px;">SKU 创建后不可改</div>' : '<div id="invFetchStatus" style="font-size:11px; margin-top:3px;"></div>'}
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">当前库存 <span style="color:var(--danger);">*</span></label>
        <input type="number" min="0" value="${s.stock_qty}" oninput="INV_EDIT.stock_qty=parseInt(this.value)||0"
               style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; text-align:center; font-weight:700;">
      </div>
    </div>
    
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">产品名称 <span style="color:var(--danger);">*</span></label>
      <input type="text" id="invEditTitleInput" value="${escapeHtml(s.title)}" oninput="INV_EDIT.title=this.value"
             placeholder="例:Pearl Pendant Lamp · 拉取 SKU 后自动填充"
             style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px;">
    </div>
    
    <!-- 产品图区域:URL 输入 + 缩略预览 + 粘贴上传 + 点击大图 -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">
        产品图 · 支持 URL / 粘贴(Ctrl+V)/ 拖拽 / 点击上传
      </label>
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <!-- 缩略预览 -->
        <div id="invEditImgPreview" 
             onclick="if(INV_EDIT.image_url) invPreviewImage(INV_EDIT.image_url)"
             style="flex-shrink:0; width:100px; height:100px; border:1.5px dashed var(--border); border-radius:8px; background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:${s.image_url ? 'zoom-in' : 'default'};">
          ${s.image_url 
            ? `<img src="${escapeHtml(s.image_url)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentNode.innerHTML='<span style=\\'font-size:10px;color:var(--text-tertiary);text-align:center;\\'>⚠️图片<br>加载失败</span>'">` 
            : '<span style="font-size:10px;color:var(--text-tertiary);text-align:center;line-height:1.4;">📦<br>无图</span>'}
        </div>
        
        <!-- 右侧:URL 输入 + 操作 -->
        <div style="flex:1;">
          <input type="text" id="invEditImgUrl" value="${escapeHtml(s.image_url)}" 
                 oninput="INV_EDIT.image_url=this.value;invRefreshImgPreview()"
                 onpaste="invHandlePaste(event)"
                 placeholder="粘贴 URL 或 Ctrl+V 粘贴图片"
                 ondragover="event.preventDefault();this.style.background='var(--accent-soft)';"
                 ondragleave="this.style.background='';"
                 ondrop="event.preventDefault();this.style.background='';invHandleDrop(event)"
                 style="width:100%; padding:8px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px;">
          
          <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
            <label style="display:inline-flex; align-items:center; gap:4px; padding:5px 10px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:5px; cursor:pointer; font-size:11.5px;">
              📷 选图上传
              <input type="file" accept="image/*" style="display:none;" onchange="invUploadImgFile(this.files[0])">
            </label>
            ${s.image_url ? `<button onclick="INV_EDIT.image_url='';invRefreshImgPreview();document.getElementById('invEditImgUrl').value='';" style="padding:5px 10px; background:#fff; border:1px solid var(--border); color:var(--danger); border-radius:5px; cursor:pointer; font-size:11.5px;">✕ 清空</button>` : ''}
          </div>
          <div id="invImgUploadStatus" style="font-size:10.5px; color:var(--text-tertiary); margin-top:4px;"></div>
        </div>
      </div>
    </div>
    
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">低库存预警线</label>
      <input type="number" min="0" value="${s.stock_alert_threshold}" oninput="INV_EDIT.stock_alert_threshold=parseInt(this.value)||0"
             placeholder="低于此值告警"
             style="width:120px; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; text-align:center;">
    </div>
    
    <!-- 绑定平台 SKU -->
    <div style="margin-bottom:6px; padding-top:12px; border-top:1px solid var(--border-subtle);">
      <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">
        🔗 绑定平台 SKU(多店铺同款 · 任一店铺出单都扣这个库存)
      </label>
      <div id="invPlatformSkuList">
        ${s.platform_skus.map((ps, idx) => `
          <div style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
            <input type="text" value="${escapeHtml(ps.sku || '')}" 
                   oninput="INV_EDIT.platform_skus[${idx}].sku=this.value"
                   placeholder="平台 SKU(如 VKC-240305-01)"
                   style="flex:2; padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:5px; font-family:monospace;">
            <select onchange="_invSetPsShop(${idx}, this.value)"
                    style="flex:1.5; padding:6px 8px; font-size:11.5px; border:1px solid var(--border); border-radius:5px;">
              <option value="">— 选店铺 —</option>
              ${shops.map(sh => `<option value="${escapeHtml(sh.domain)}|${escapeHtml(sh.label)}" ${ps.shop === sh.domain ? 'selected' : ''}>${escapeHtml(sh.label)}</option>`).join('')}
            </select>
            <button onclick="_invDelPs(${idx})" style="padding:4px 8px; font-size:12px; color:var(--danger); background:transparent; border:1px solid transparent; cursor:pointer; border-radius:4px;">✕</button>
          </div>
        `).join('')}
      </div>
      <button class="btn small" onclick="_invAddPs()" style="font-size:11px; padding:4px 12px; margin-top:4px;">+ 加一个平台 SKU</button>
    </div>
    
    ${!s.isNew ? `
    <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-subtle);">
      <button onclick="invDelete()" class="btn small" style="font-size:11px; color:var(--danger); border-color:rgba(220,38,38,0.3);">🗑 从库存移除(不删产品)</button>
    </div>` : ''}
  `;
}

function _invSetPsShop(idx, value) {
  if (!INV_EDIT) return;
  const [domain, label] = (value || '').split('|');
  INV_EDIT.platform_skus[idx].shop = domain || '';
  INV_EDIT.platform_skus[idx].shop_label = label || '';
}
window._invSetPsShop = _invSetPsShop;

function _invAddPs() {
  if (!INV_EDIT) return;
  INV_EDIT.platform_skus.push({ sku: '', shop: '', shop_label: '' });
  _invRenderEdit();
}
window._invAddPs = _invAddPs;

function _invDelPs(idx) {
  if (!INV_EDIT) return;
  INV_EDIT.platform_skus.splice(idx, 1);
  _invRenderEdit();
}
window._invDelPs = _invDelPs;

async function invSaveEdit() {
  const s = INV_EDIT;
  if (!s) return;
  if (!(s.sku || '').trim()) { toast('内部 SKU 必填', 'warn'); return; }
  if (!(s.title || '').trim()) { toast('产品名称必填', 'warn'); return; }
  
  // 清理空的平台 SKU 行
  const cleanPlatSkus = s.platform_skus.filter(ps => (ps.sku || '').trim());
  
  try {
    if (s.isNew) {
      // 检查 SKU 是否已存在
      const { data: existing } = await sb.from('products').select('id, is_inventory_item').eq('sku', s.sku.trim()).maybeSingle();
      if (existing) {
        // 已有产品 · 升级为库存品
        const { error } = await sb.from('products').update({
          is_inventory_item: true,
          stock_qty: s.stock_qty,
          stock_alert_threshold: s.stock_alert_threshold,
          platform_skus: cleanPlatSkus,
          image_url: s.image_url || null,
        }).eq('id', existing.id);
        if (error) throw error;
        toast('✓ 已把现有产品纳入库存管理', 'success');
      } else {
        // 新建产品
        const { error } = await sb.from('products').insert({
          sku: s.sku.trim(),
          title_cn: s.title.trim(),
          title: s.title.trim(),
          image_url: s.image_url || null,
          is_inventory_item: true,
          stock_qty: s.stock_qty,
          stock_alert_threshold: s.stock_alert_threshold,
          platform_skus: cleanPlatSkus,
        });
        if (error) throw error;
        toast('✓ 库存产品已创建', 'success');
      }
    } else {
      // 编辑现有
      const { error } = await sb.from('products').update({
        title_cn: s.title.trim(),
        image_url: s.image_url || null,
        stock_qty: s.stock_qty,
        stock_alert_threshold: s.stock_alert_threshold,
        platform_skus: cleanPlatSkus,
      }).eq('id', s.id);
      if (error) throw error;
      toast('✓ 已保存', 'success');
    }
    
    if (typeof PRODUCTS_CACHE !== 'undefined') PRODUCTS_CACHE.invalidate();
    invCloseEdit();
    setTimeout(() => renderInventory(), 150);
  } catch (e) {
    console.error('保存库存失败:', e);
    toast('保存失败:' + (e.message || e), 'err', 4000);
  }
}
window.invSaveEdit = invSaveEdit;

async function invDelete() {
  const s = INV_EDIT;
  if (!s || s.isNew) return;
  if (!confirm('确认把这个产品从库存管理移除?\n\n(产品本身不删 · 只是不再跟踪库存 + 解除平台 SKU 绑定)')) return;
  try {
    const { error } = await sb.from('products').update({
      is_inventory_item: false,
      platform_skus: [],
    }).eq('id', s.id);
    if (error) throw error;
    if (typeof PRODUCTS_CACHE !== 'undefined') PRODUCTS_CACHE.invalidate();
    toast('✓ 已从库存移除', 'success');
    invCloseEdit();
    setTimeout(() => renderInventory(), 150);
  } catch (e) {
    toast('移除失败:' + (e.message || e), 'err');
  }
}
window.invDelete = invDelete;

// ─────────────── 快速调整库存 modal ───────────────
let INV_ADJUST = null;

function invOpenAdjust(productId) {
  const p = INVENTORY._list.find(x => String(x.id) === String(productId));
  if (!p) { toast('找不到产品', 'err'); return; }
  INV_ADJUST = { id: p.id, sku: p.sku, title: p.title_cn || p.title, current: Number(p.stock_qty || 0), delta: 0, mode: 'add' };
  document.getElementById('inventoryAdjustModal').style.display = 'flex';
  _invRenderAdjust();
}
window.invOpenAdjust = invOpenAdjust;

function invCloseAdjust() {
  document.getElementById('inventoryAdjustModal').style.display = 'none';
  INV_ADJUST = null;
}
window.invCloseAdjust = invCloseAdjust;

function _invRenderAdjust() {
  const s = INV_ADJUST;
  if (!s) return;
  const body = document.getElementById('inventoryAdjustBody');
  const preview = s.mode === 'add' ? s.current + s.delta
                : s.mode === 'subtract' ? s.current - s.delta
                : s.delta;  // set
  
  body.innerHTML = `
    <div style="text-align:center; margin-bottom:16px;">
      <div style="font-size:13px; color:var(--text-secondary);">${escapeHtml(s.title)}</div>
      <div style="font-size:11px; color:var(--text-tertiary); font-family:monospace;">${escapeHtml(s.sku)}</div>
      <div style="font-size:32px; font-weight:700; color:var(--accent); font-family:monospace; margin-top:8px;">${s.current}</div>
      <div style="font-size:11px; color:var(--text-tertiary);">当前库存</div>
    </div>
    
    <div style="display:flex; gap:6px; margin-bottom:12px;">
      ${[
        { k: 'add', label: '➕ 入库(加)' },
        { k: 'subtract', label: '➖ 出库(减)' },
        { k: 'set', label: '🔢 直接设为' },
      ].map(m => `
        <button onclick="INV_ADJUST.mode='${m.k}'; _invRenderAdjust()"
                style="flex:1; padding:7px; font-size:12px; border:1px solid ${s.mode === m.k ? 'var(--accent)' : 'var(--border)'}; border-radius:6px; background:${s.mode === m.k ? 'var(--accent)' : 'var(--bg-card)'}; color:${s.mode === m.k ? 'white' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${s.mode === m.k ? '600' : '400'};">
          ${m.label}
        </button>
      `).join('')}
    </div>
    
    <input type="number" min="0" value="${s.delta}" oninput="INV_ADJUST.delta=parseInt(this.value)||0; _invRenderAdjust()"
           placeholder="数量"
           style="width:100%; padding:10px; font-size:16px; border:1px solid var(--border); border-radius:6px; text-align:center; margin-bottom:12px;">
    
    <div style="text-align:center; padding:10px; background:var(--bg-elevated); border-radius:6px;">
      调整后:<span style="font-size:20px; font-weight:700; color:${preview < 0 ? 'var(--danger)' : 'var(--success)'}; font-family:monospace;">${preview}</span>
      ${preview < 0 ? '<div style="font-size:11px; color:var(--danger);">⚠ 库存不能为负</div>' : ''}
    </div>
  `;
}

async function invSaveAdjust() {
  const s = INV_ADJUST;
  if (!s) return;
  const newQty = s.mode === 'add' ? s.current + s.delta
               : s.mode === 'subtract' ? s.current - s.delta
               : s.delta;
  if (newQty < 0) { toast('库存不能为负', 'warn'); return; }
  if (s.delta === 0 && s.mode !== 'set') { toast('请输入数量', 'warn'); return; }
  
  const change = newQty - s.current;
  const myName = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) ? CURRENT_AGENT : '?';
  
  try {
    const { error } = await sb.from('products').update({ stock_qty: newQty }).eq('id', s.id);
    if (error) throw error;
    
    // 记流水
    await sb.from('inventory_movements').insert({
      product_id: s.id,
      internal_sku: s.sku,
      movement_type: s.mode === 'add' ? 'inbound' : 'manual_adjust',
      qty_change: change,
      qty_after: newQty,
      ref_type: 'manual',
      ref_id: null,
      operator: myName,
      note: `手动${s.mode === 'add' ? '入库' : s.mode === 'subtract' ? '出库' : '设置'}`,
    });
    
    if (typeof PRODUCTS_CACHE !== 'undefined') PRODUCTS_CACHE.invalidate();
    toast(`✓ 库存已更新 → ${newQty}`, 'success');
    invCloseAdjust();
    setTimeout(() => renderInventory(), 150);
  } catch (e) {
    toast('调整失败:' + (e.message || e), 'err');
  }
}
window.invSaveAdjust = invSaveAdjust;

// ============================================================
// V20260601-INV-SKU-IMG:SKU 拉 Shopify · 粘贴上传 · 图片预览
// ============================================================

// 1. 从 Shopify 拉 SKU 对应的产品(SKU 前缀路由 · 命中店铺优先)
window.invFetchFromShopify = async function() {
  const sku = (INV_EDIT?.sku || '').trim();
  const status = document.getElementById('invFetchStatus');
  if (!sku) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '请先填 SKU'; }
    return;
  }
  if (status) { status.style.color = 'var(--text-secondary)'; status.textContent = '⏳ 分析 SKU 前缀...'; }
  
  try {
    if (typeof SHOPIFY === 'undefined' || !SHOPIFY.call) throw new Error('Shopify 模块未就绪');
    if (!SHOPIFY._stores || SHOPIFY._stores.length === 0) {
      await SHOPIFY.loadStores().catch(() => {});
    }
    const stores = (SHOPIFY._stores || []).filter(s => s.connected || s.platform === 'woo');
    if (stores.length === 0) throw new Error('没有已连接的店铺');
    
    // 🎯 关键:按 SKU 前缀做店铺路由
    // 例:DFC-LYD88047 → 前缀含 "DF" → dekorfine 店;VK-001 → "VK" → vakkerlighting
    const skuUpper = sku.toUpperCase();
    const STORES_META = (SHOPIFY.STORES_META || []);
    const meta = STORES_META.find(m => skuUpper.startsWith(m.site_code));  // 前缀严格匹配 site_code
    
    // 构造查询队列:命中店第一 · 其它店作为兜底
    const queue = [];
    if (meta) {
      const primary = stores.find(s => s.domain === meta.domain);
      if (primary) queue.push({ store: primary, isPrimary: true });
    }
    // 其它已连接店作为兜底(避免重复)
    for (const s of stores) {
      if (!queue.find(q => q.store.domain === s.domain)) queue.push({ store: s, isPrimary: false });
    }
    
    if (status) {
      if (meta) status.textContent = `⏳ SKU 前缀 ${meta.site_code} → 优先查 ${meta.domain}...`;
      else status.textContent = `⏳ 未识别 SKU 前缀 · 遍历查询...`;
    }
    
    let found = null;
    let triedStores = [];
    
    for (const { store, isPrimary } of queue) {
      triedStores.push(store.name || SHOPIFY.siteCodeOf(store.domain) || store.domain);
      if (status) status.textContent = `⏳ 查 ${triedStores[triedStores.length-1]}${isPrimary ? '(主)' : ''}...`;
      
      try {
        // 优先尝试后端 search_product_by_sku · 不支持则降级 list_products
        let products = [];
        let usedAction = '';
        try {
          console.log(`[invFetch] try search_product_by_sku · sku=${sku} · shop=${store.domain}`);
          const r1 = await SHOPIFY.call('search_product_by_sku', { sku }, store.domain);
          console.log('[invFetch] search_product_by_sku response:', r1);
          products = r1?.products || (r1?.product ? [r1.product] : []);
          usedAction = 'search_product_by_sku';
        } catch (e1) {
          console.warn('[invFetch] search_product_by_sku 失败 · 降级 list_products:', e1.message);
          // 降级 · list_products 拉一批(默认 250 上限)然后过滤
          const r2 = await SHOPIFY.call('list_products', { 
            fields: 'id,title,handle,image,images,variants', 
            limit: 250 
          }, store.domain);
          console.log(`[invFetch] list_products returned ${r2?.products?.length || 0} products`);
          products = r2?.products || [];
          usedAction = 'list_products';
        }
        console.log(`[invFetch] using ${usedAction} · checking ${products.length} products for SKU=${sku}`);
        
        // 客户端筛选 · 检查变体 SKU + 产品 SKU 两层
        for (const p of products) {
          const matchedVariant = (p.variants || []).find(v => 
            (v.sku || '').toLowerCase() === sku.toLowerCase()
          );
          if (matchedVariant || (p.sku || '').toLowerCase() === sku.toLowerCase()) {
            found = { 
              product: p, 
              variant: matchedVariant, 
              store: store.name || SHOPIFY.siteCodeOf(store.domain) || store.domain,
              storeDomain: store.domain,
            };
            break;
          }
        }
        if (found) break;
        // 主店没命中:继续尝试其它店但更明确提示
        if (isPrimary && status) {
          status.style.color = '#b45309';
          status.textContent = `⚠ 主店 ${store.name || meta?.site_code} 未找到 · 尝试其它店...`;
        }
      } catch (e) {
        console.warn('[invFetch] store error:', store.domain, e.message);
      }
    }
    
    if (!found) {
      if (status) { 
        status.style.color = 'var(--danger)'; 
        status.textContent = `⚠ 未找到 SKU=${sku} · 已查 ${triedStores.length} 个店铺`;
      }
      return;
    }
    
    // 填充数据
    const p = found.product;
    const v = found.variant;
    INV_EDIT.title = p.title || '';
    const imgUrl = (v?.image?.src) || (p.image?.src) || (p.images?.[0]?.src) || '';
    if (imgUrl) INV_EDIT.image_url = imgUrl;
    
    const titleInput = document.getElementById('invEditTitleInput');
    if (titleInput) titleInput.value = INV_EDIT.title;
    const urlInput = document.getElementById('invEditImgUrl');
    if (urlInput) urlInput.value = INV_EDIT.image_url;
    invRefreshImgPreview();
    
    if (status) { 
      status.style.color = 'var(--ok)'; 
      status.textContent = `✓ 在 ${found.store} 找到 · 已填充产品名${imgUrl ? '+图' : ''}`; 
    }
  } catch (e) {
    console.error('[invFetch]', e);
    if (status) { 
      status.style.color = 'var(--danger)'; 
      status.textContent = '⚠ 拉取失败:' + (e.message || '未知');
    }
  }
};

// 2. 粘贴图片处理(Ctrl+V 在 URL 输入框)
window.invHandlePaste = function(e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  for (const it of items) {
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
      e.preventDefault();
      const f = it.getAsFile();
      if (f) invUploadImgFile(f);
      return;
    }
  }
};

// 3. 拖拽图片处理
window.invHandleDrop = function(e) {
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  for (const f of files) {
    if (f.type && f.type.startsWith('image/')) {
      invUploadImgFile(f);
      return;
    }
  }
};

// 4. 上传图片文件到 attachments 桶(跨部门库 · 已有公开桶)
window.invUploadImgFile = async function(file) {
  if (!file) return;
  const status = document.getElementById('invImgUploadStatus');
  if (file.size > 5 * 1024 * 1024) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '⚠ 文件超 5MB · 请压缩'; }
    return;
  }
  if (!file.type.startsWith('image/')) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '⚠ 不是图片格式'; }
    return;
  }
  if (typeof cdmClient === 'undefined') {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '⚠ 跨部门库未就绪 · 无法上传'; }
    return;
  }
  
  if (status) { status.style.color = 'var(--text-secondary)'; status.textContent = '⏳ 上传中...'; }
  
  try {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `inventory/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await cdmClient.storage.from('attachments')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: { publicUrl } } = cdmClient.storage.from('attachments').getPublicUrl(path);
    
    INV_EDIT.image_url = publicUrl;
    const urlInput = document.getElementById('invEditImgUrl');
    if (urlInput) urlInput.value = publicUrl;
    invRefreshImgPreview();
    
    if (status) { 
      status.style.color = 'var(--ok)'; 
      status.textContent = `✓ 已上传 · ${(file.size/1024).toFixed(0)} KB`; 
    }
  } catch (e) {
    console.error('[invUpload]', e);
    if (status) { 
      status.style.color = 'var(--danger)'; 
      status.textContent = '⚠ 上传失败:' + (e.message || '未知'); 
    }
  }
};

// 5. 大图预览(fixed 弹层 · 与 cross-dept 同款)
window.invPreviewImage = function(url) {
  if (!url) return;
  document.getElementById('invImgPreviewLayer')?.remove();
  const layer = document.createElement('div');
  layer.id = 'invImgPreviewLayer';
  layer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:100020;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
  layer.onclick = () => { layer.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') { layer.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  const safeUrl = String(url).replace(/"/g, '&quot;');
  layer.innerHTML = `
    <button onclick="document.getElementById('invImgPreviewLayer').remove()" 
            style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px;z-index:1;">✕</button>
    <a href="${safeUrl}" target="_blank" rel="noopener" download onclick="event.stopPropagation();"
       style="position:absolute;bottom:20px;right:20px;background:rgba(255,255,255,0.15);color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;z-index:1;">⬇ 下载</a>
    <img src="${safeUrl}" style="max-width:96%;max-height:96%;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.5);" onclick="event.stopPropagation();">
  `;
  document.body.appendChild(layer);
};

// 6. 刷新缩略图预览(URL 变了之后调用)
window.invRefreshImgPreview = function() {
  const box = document.getElementById('invEditImgPreview');
  if (!box) return;
  const url = INV_EDIT?.image_url || '';
  if (url) {
    box.style.cursor = 'zoom-in';
    box.innerHTML = `<img src="${escapeHtmlForInv(url)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentNode.innerHTML='<span style=\\'font-size:10px;color:var(--text-tertiary);text-align:center;\\'>⚠️图片<br>加载失败</span>'">`;
  } else {
    box.style.cursor = 'default';
    box.innerHTML = '<span style="font-size:10px;color:var(--text-tertiary);text-align:center;line-height:1.4;">📦<br>无图</span>';
  }
};

// 本地 escape(避免依赖外部)
function escapeHtmlForInv(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
