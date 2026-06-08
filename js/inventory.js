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
  _view: 'list',      // V20260607一期:list(列表) / grid(网格)
  _page: 1,
  _pageSize: 50,      // 50 / 100
  _store: '',         // V20260607二期:按平台店铺筛(domain · 空=全部)
  _ageFilter: 0,      // V20260607二期:库龄筛 0=不限 / 30 / 60 / 90 / 180 / 365
};

// V20260607二期:库龄(天)· 无 stock_in_at 返回 null(未知)
function _invAgeDays(p) {
  if (!p.stock_in_at) return null;
  const ms = Date.now() - new Date(p.stock_in_at).getTime();
  return Math.floor(ms / 86400000);
}
// 是否压货:有库存 + 库龄 ≥ 主管阈值
function _invIsStale(p) {
  if (Number(p.stock_qty || 0) <= 0) return false;
  const age = _invAgeDays(p);
  if (age == null) return false;
  const thr = (typeof DATA !== 'undefined' && DATA.getInventoryStaleDays) ? DATA.getInventoryStaleDays() : 90;
  return age >= thr;
}
function invSetStore(v) { INVENTORY._store = v; INVENTORY._page = 1; _invRenderList(); }
function invSetAgeFilter(n) { INVENTORY._ageFilter = parseInt(n) || 0; INVENTORY._page = 1; _invRenderList(); }
window.invSetStore = invSetStore; window.invSetAgeFilter = invSetAgeFilter;
async function invSetStaleThreshold() {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) { toast('只有主管能设置压货阈值', 'warn'); return; }
  const cur = (typeof DATA !== 'undefined' && DATA.getInventoryStaleDays) ? DATA.getInventoryStaleDays() : 90;
  const v = prompt('库存压货阈值(库龄超过多少天算"压货"并标红提醒):', String(cur));
  if (v == null) return;
  const n = parseInt(v);
  if (isNaN(n) || n <= 0) { toast('请输入正整数天数', 'warn'); return; }
  try { await DATA.saveInventoryStaleDays(n); toast('✓ 压货阈值已设为 ' + n + ' 天'); renderInventory(); }
  catch (e) { toast('保存失败:' + (e.message || e), 'err'); }
}
window.invSetStaleThreshold = invSetStaleThreshold;

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
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="display:inline-flex; border:1px solid var(--border); border-radius:8px; overflow:hidden;">
          <button onclick="invSetView('list')" title="列表视图" style="padding:6px 12px; font-size:12px; border:none; cursor:pointer; background:${INVENTORY._view==='list'?'var(--accent)':'var(--bg-card)'}; color:${INVENTORY._view==='list'?'#fff':'var(--text-secondary)'};">☰ 列表</button>
          <button onclick="invSetView('grid')" title="网格视图" style="padding:6px 12px; font-size:12px; border:none; border-left:1px solid var(--border); cursor:pointer; background:${INVENTORY._view==='grid'?'var(--accent)':'var(--bg-card)'}; color:${INVENTORY._view==='grid'?'#fff':'var(--text-secondary)'};">▦ 网格</button>
        </div>
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
        { k: 'trash',   label: '🗑 回收站' },
      ].map(f => `
        <button onclick="invSetFilter('${f.k}')" 
                style="padding:6px 12px; font-size:12px; border:1px solid ${INVENTORY._filter === f.k ? 'var(--accent)' : 'var(--border)'}; border-radius:18px; background:${INVENTORY._filter === f.k ? 'var(--accent)' : 'var(--bg-card)'}; color:${INVENTORY._filter === f.k ? 'white' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${INVENTORY._filter === f.k ? '600' : '400'};">
          ${f.label}
        </button>
      `).join('')}
      <input type="text" id="invSearchInput" placeholder="🔍 SKU / 产品名 / 平台SKU / 供应商" 
             value="${escapeHtml(INVENTORY._search)}"
             oninput="INVENTORY._search=this.value; INVENTORY._page=1; _invRenderList()"
             style="margin-left:auto; padding:6px 12px; font-size:12px; border:1px solid var(--border); border-radius:18px; width:280px;">
    </div>

    <!-- V20260607二期:店铺筛 + 库龄筛 + 压货阈值 -->
    <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
      <select onchange="invSetStore(this.value)" title="按绑定的平台店铺筛" style="padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:8px; background:var(--bg-card); color:var(--text-secondary);">
        <option value="">🏬 全部店铺</option>
        ${(SHOPIFY.STORES_META || []).filter(st => !st.legacyOnly).map(st => `<option value="${escapeHtml(st.domain)}" ${INVENTORY._store === st.domain ? 'selected' : ''}>${escapeHtml(st.display_name || st.site_code || st.domain)}</option>`).join('')}
      </select>
      <span style="font-size:11px; color:var(--text-tertiary);">库龄:</span>
      ${[
        { d: 0,   label: '不限' },
        { d: 30,  label: '>30天' },
        { d: 60,  label: '>60天' },
        { d: 90,  label: '>90天' },
        { d: 180, label: '>半年' },
        { d: 365, label: '>1年' },
      ].map(a => `
        <button onclick="invSetAgeFilter(${a.d})" style="padding:5px 11px; font-size:12px; border:1px solid ${INVENTORY._ageFilter === a.d ? '#dc2626' : 'var(--border)'}; border-radius:16px; background:${INVENTORY._ageFilter === a.d ? '#dc2626' : 'var(--bg-card)'}; color:${INVENTORY._ageFilter === a.d ? '#fff' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${INVENTORY._ageFilter === a.d ? '600' : '400'};">${a.label}</button>
      `).join('')}
      <button onclick="invSetStaleThreshold()" title="主管设置:库龄超过多少天算压货并标红" style="margin-left:auto; padding:5px 11px; font-size:12px; border:1px dashed var(--border); border-radius:16px; background:var(--bg-card); color:var(--text-secondary); cursor:pointer;">⚙ 压货阈值 ${(typeof DATA !== 'undefined' && DATA.getInventoryStaleDays) ? DATA.getInventoryStaleDays() : 90}天</button>
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
  INVENTORY._page = 1;
  renderInventory();
}
function invSetView(v) { INVENTORY._view = v; renderInventory(); }
function invSetPage(p) { INVENTORY._page = Math.max(1, p); _invRenderList(); const el=document.getElementById('inventoryList'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); }
function invSetPageSize(n) { INVENTORY._pageSize = parseInt(n)||50; INVENTORY._page = 1; _invRenderList(); }
window.invSetView = invSetView; window.invSetPage = invSetPage; window.invSetPageSize = invSetPageSize;
window.invSetFilter = invSetFilter;

async function _invLoadData() {
  try {
    // 库存产品 = is_inventory_item = true · 回收站则查 deleted_at NOT null
    let qy = sb.from('products').select('*').eq('is_inventory_item', true);
    qy = (INVENTORY._filter === 'trash')
      ? qy.not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
      : qy.is('deleted_at', null).order('stock_qty', { ascending: true });
    const { data, error } = await qy;
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
  // 回收站 = 单独渲染
  if (INVENTORY._filter === 'trash') {
    return _invRenderTrash();
  }
  
  let list = INVENTORY._list;
  
  // 搜索(SKU / 产品名 / 平台SKU / 供应商)
  const q = (INVENTORY._search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(p => {
      if ((p.sku || '').toLowerCase().includes(q)) return true;
      if ((p.name_cn || '').toLowerCase().includes(q)) return true;
      if ((p.name_en || '').toLowerCase().includes(q)) return true;
      if ((p.default_supplier || '').toLowerCase().includes(q)) return true;
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
  // 按平台店铺筛(绑定了该店 domain 的)
  if (INVENTORY._store) {
    list = list.filter(p => Array.isArray(p.platform_skus) && p.platform_skus.some(ps => (ps.shop || ps.shop_domain || '') === INVENTORY._store));
  }
  // 按库龄筛(只看有库存且库龄≥N天的)
  if (INVENTORY._ageFilter > 0) {
    list = list.filter(p => {
      if (Number(p.stock_qty || 0) <= 0) return false;
      const age = _invAgeDays(p);
      return age != null && age >= INVENTORY._ageFilter;
    });
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
  
  // 分页
  const total = list.length;
  const pageSize = INVENTORY._pageSize || 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (INVENTORY._page > totalPages) INVENTORY._page = totalPages;
  const cur = INVENTORY._page;
  const pageItems = list.slice((cur - 1) * pageSize, cur * pageSize);
  
  // 压货汇总(整库,不受当前筛选影响)
  const staleAll = (INVENTORY._list || []).filter(_invIsStale);
  const staleBanner = staleAll.length > 0 ? `
    <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; margin-bottom:10px; background:rgba(220,38,38,0.07); border:1px solid rgba(220,38,38,0.3); border-radius:8px;">
      <span style="font-size:18px;">🐢</span>
      <span style="font-size:13px; color:#dc2626; font-weight:600;">有 ${staleAll.length} 款库存压货超过 ${(typeof DATA!=='undefined'&&DATA.getInventoryStaleDays)?DATA.getInventoryStaleDays():90} 天</span>
      <button onclick="invSetAgeFilter(${(typeof DATA!=='undefined'&&DATA.getInventoryStaleDays)?DATA.getInventoryStaleDays():90})" style="margin-left:auto; padding:4px 12px; font-size:12px; border:1px solid #dc2626; border-radius:14px; background:#fff; color:#dc2626; cursor:pointer;">只看压货 →</button>
    </div>` : '';

  const pager = (typeof renderPaginationBar === 'function') ? renderPaginationBar({
    total, currentPage: cur, pageSize,
    onPageChange: 'invSetPage(__PAGE__)', onSizeChange: 'invSetPageSize(__SIZE__)',
  }) : '';
  
  // 列表 / 网格
  let bodyHtml;
  if (INVENTORY._view === 'grid') {
    bodyHtml = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px;">${pageItems.map(p => _invGridCardHtml(p)).join('')}</div>`;
  } else {
    bodyHtml = pageItems.map(p => _invCardHtml(p)).join('');
  }
  
  listEl.innerHTML = `${staleBanner}${pager}${bodyHtml}${total > pageSize ? pager : ''}`;
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
          ${_invIsStale(p) ? `<span style="background:#dc2626; color:#fff; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;" title="库龄超过压货阈值">🐢 压货 ${_invAgeDays(p)}天</span>` : (_invAgeDays(p) != null ? `<span style="color:var(--text-tertiary); font-size:10.5px;">库龄 ${_invAgeDays(p)}天</span>` : '')}
          <span style="font-size:14px; font-weight:600; color:var(--text-primary);">${escapeHtml(p.name_cn || '(无名)')}</span>
        </div>
        <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:6px;"><span style="font-family:monospace;">内部 SKU: ${escapeHtml(p.sku || '')}</span>${p.default_supplier ? ` · <span style="color:var(--text-secondary);">🏭 ${escapeHtml(p.default_supplier)}</span>` : ''}</div>
        
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

// V20260607三期:回收站渲染(已删库存 · 主管可恢复/彻底移出)
function _invRenderTrash() {
  const listEl = document.getElementById('inventoryList');
  if (!listEl) return;
  let list = INVENTORY._list || [];
  const q = (INVENTORY._search || '').trim().toLowerCase();
  if (q) list = list.filter(p => (p.sku||'').toLowerCase().includes(q) || (p.name_cn||'').toLowerCase().includes(q));
  if (list.length === 0) {
    listEl.innerHTML = `<div style="padding:48px; text-align:center; color:var(--text-tertiary); background:var(--bg-card); border:1px dashed var(--border); border-radius:10px;"><div style="font-size:32px; margin-bottom:8px;">🗑</div><div style="font-size:14px;">回收站是空的</div></div>`;
    return;
  }
  const canAdmin = (typeof IS_ADMIN === 'undefined') || IS_ADMIN;
  listEl.innerHTML = `
    <div style="padding:8px 12px; margin-bottom:10px; background:rgba(120,113,108,0.08); border:1px solid var(--border); border-radius:8px; font-size:12px; color:var(--text-secondary);">
      🗑 回收站:删除的库存会保留在这里(数量/绑定都在)· ${canAdmin ? '主管可「♻ 恢复」或「彻底移出」' : '仅主管可恢复 · 你可查看'}
    </div>
    ${list.map(p => {
      const when = p.deleted_at ? new Date(p.deleted_at).toLocaleString() : '';
      return `
      <div style="display:grid; grid-template-columns:56px 1fr auto; gap:12px; padding:12px; background:var(--bg-card); border:1px solid var(--border); border-radius:8px; margin-bottom:8px; opacity:.85;">
        <div>${p.image_url ? `<img src="${escapeHtml(p.image_url)}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;">` : `<div style="width:56px;height:56px;background:var(--bg-elevated);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);">📦</div>`}</div>
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${escapeHtml(p.name_cn || '(无名)')}</div>
          <div style="font-size:11px;color:var(--text-tertiary);font-family:monospace;">${escapeHtml(p.sku || '')} · 库存 ${Number(p.stock_qty||0)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">🗑 删除于 ${escapeHtml(when)}${p.deleted_by ? ' · by ' + escapeHtml(p.deleted_by) : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          ${canAdmin ? `<button class="btn small" onclick="invRestore('${p.id}')" style="font-size:11px;padding:4px 12px;background:rgba(22,163,74,0.1);border-color:rgba(22,163,74,0.4);color:var(--success);">♻ 恢复</button>
          <button class="btn small" onclick="invPurge('${p.id}')" style="font-size:11px;padding:4px 12px;color:var(--danger);border-color:rgba(220,38,38,0.3);">彻底移出</button>` : `<span style="font-size:11px;color:var(--text-tertiary);">仅主管可恢复</span>`}
        </div>
      </div>`;
    }).join('')}
  `;
}

// V20260607一期:网格视图卡片(竖向 · 图大 · 库存色块 · 供应商)
function _invGridCardHtml(p) {
  const stock = Number(p.stock_qty || 0);
  const threshold = Number(p.stock_alert_threshold || 5);
  const platSkus = Array.isArray(p.platform_skus) ? p.platform_skus : [];
  let statusColor = 'var(--success)', statusText = '充足';
  if (stock <= 0) { statusColor = 'var(--danger)'; statusText = '🔴 缺货'; }
  else if (stock <= threshold) { statusColor = '#f59e0b'; statusText = '⚠️ 低库存'; }
  const barMax = Math.max(stock, threshold * 4, 10);
  const barPct = Math.min(100, Math.round(stock / barMax * 100));
  return `
    <div style="background:var(--bg-card); border:1px solid var(--border); border-top:3px solid ${statusColor}; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;">
      <div style="position:relative; width:100%; aspect-ratio:1/1; background:var(--bg-elevated); border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
        ${p.image_url
          ? `<img src="${escapeHtml(p.image_url)}" style="width:100%; height:100%; object-fit:cover; cursor:zoom-in;" onclick="openImgLightbox && openImgLightbox('${escapeHtml(p.image_url)}')">`
          : `<span style="color:var(--text-tertiary); font-size:32px;">📦</span>`}
        <span style="position:absolute; top:6px; left:6px; background:${statusColor}; color:#fff; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;">${statusText} ${stock}</span>
      </div>
      <div style="font-size:13px; font-weight:600; color:var(--text-primary); line-height:1.3; min-height:34px; overflow:hidden;">${escapeHtml(p.name_cn || '(无名)')}</div>
      <div style="font-size:10.5px; color:var(--text-tertiary); font-family:monospace;">${escapeHtml(p.sku || '')}</div>
      ${_invIsStale(p) ? `<div style="font-size:10.5px; color:#dc2626; font-weight:700;">🐢 压货 ${_invAgeDays(p)}天</div>` : (_invAgeDays(p) != null ? `<div style="font-size:10.5px; color:var(--text-tertiary);">库龄 ${_invAgeDays(p)}天</div>` : '')}
      <div style="height:6px; background:var(--bg-elevated); border-radius:3px; overflow:hidden;"><div style="width:${barPct}%; height:100%; background:${statusColor};"></div></div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:10.5px; color:var(--text-secondary);">
        <span title="供应商">${p.default_supplier ? '🏭 ' + escapeHtml(p.default_supplier) : '<span style=\'color:var(--text-tertiary)\'>无供应商</span>'}</span>
        <span style="color:var(--text-tertiary);">预警 ${threshold}</span>
      </div>
      ${platSkus.length === 0 ? `<div style="font-size:10px; color:#92400e;">🔗 未绑定平台SKU</div>` : `<div style="font-size:10px; color:var(--text-tertiary);">🔗 绑定 ${platSkus.length} 个平台SKU</div>`}
      <div style="display:flex; gap:6px; margin-top:auto;">
        <button class="btn small" onclick="invOpenAdjust('${p.id}')" style="flex:1; font-size:11px; padding:4px;">± 调整</button>
        <button class="btn small" onclick="invOpenEdit('${p.id}')" style="flex:1; font-size:11px; padding:4px;">📝 编辑</button>
      </div>
    </div>`;
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
      title: p.name_cn || '',
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
        ${s.isNew ? `
          <details style="margin-top:6px;">
            <summary style="font-size:10.5px;color:var(--text-tertiary);cursor:pointer;">📌 SKU 找不到?粘贴产品 URL 拉(兜底方案)</summary>
            <div style="display:flex; gap:6px; margin-top:5px;">
              <input type="text" id="invProductUrlInput" 
                     placeholder="https://www.dekorfine.com/products/xxx?variant=12345"
                     style="flex:1; padding:6px 8px; font-size:11.5px; border:1px solid var(--border); border-radius:5px;">
              <button onclick="invFetchFromProductUrl()" 
                      style="padding:6px 10px; background:var(--accent); color:#fff; border:none; border-radius:5px; cursor:pointer; font-size:11px;">拉</button>
            </div>
          </details>
          <details style="margin-top:6px;" open>
            <summary style="font-size:10.5px;color:var(--accent);cursor:pointer;font-weight:600;">📦 用订单号拉取(填订单号 → 选产品 → 自动带入 SKU/名称/图)</summary>
            <div style="display:flex; gap:6px; margin-top:5px;">
              <input type="text" id="invOrderNoInput"
                     placeholder="订单号 如 K117094 / MH4526"
                     onkeydown="if(event.key==='Enter'){event.preventDefault();invFetchByOrderNo();}"
                     style="flex:1; padding:6px 8px; font-size:11.5px; border:1px solid var(--border); border-radius:5px; font-family:monospace;">
              <button onclick="invFetchByOrderNo()"
                      style="padding:6px 10px; background:var(--accent); color:#fff; border:none; border-radius:5px; cursor:pointer; font-size:11px; white-space:nowrap;">📦 拉取</button>
            </div>
            <div id="invOrderFetchResult" style="margin-top:6px;"></div>
          </details>
        ` : ''}
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
    
    <!-- V20260601:SKU 全明细挂载点(拉 Shopify 后自动填充) -->
    <div id="invVariantDetailBox" style="display:none;"></div>
    
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
      <button onclick="invDelete()" class="btn small" style="font-size:11px; color:var(--danger); border-color:rgba(220,38,38,0.3);">🗑 删除(可在回收站恢复)</button>
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
          stock_in_at: new Date().toISOString(),   // V20260607二期:入库时间(库龄起算)
        }).eq('id', existing.id);
        if (error) throw error;
        toast('✓ 已把现有产品纳入库存管理', 'success');
      } else {
        // 新建产品
        const { error } = await sb.from('products').insert({
          sku: s.sku.trim(),
          name_cn: s.title.trim(),
          image_url: s.image_url || null,
          is_inventory_item: true,
          stock_qty: s.stock_qty,
          stock_alert_threshold: s.stock_alert_threshold,
          platform_skus: cleanPlatSkus,
          stock_in_at: new Date().toISOString(),   // V20260607二期:入库时间(库龄起算)
        });
        if (error) throw error;
        toast('✓ 库存产品已创建', 'success');
      }
    } else {
      // 编辑现有
      const { error } = await sb.from('products').update({
        name_cn: s.title.trim(),
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

// ===== V20260603:库存录入 · 用订单号拉取产品(复用催单抓取逻辑)=====
let _invOrderFetched = [];
function invFetchByOrderNo() {
  const box = document.getElementById('invOrderFetchResult');
  const rawNo = (document.getElementById('invOrderNoInput')?.value || '').trim();
  const nos = rawNo.split(/[\/,，、\s]+/).map(x => x.trim().replace(/^#/, '')).filter(Boolean);
  if (nos.length === 0) { if (box) box.innerHTML = '<span style="font-size:11px;color:var(--danger);">请先填订单号</span>'; return; }
  let lineItems = [];
  nos.forEach(n => {
    let got = [];
    if (typeof PO_LIST !== 'undefined' && PO_LIST.length) {
      const pos = PO_LIST.filter(pp => String(pp.po_number||'').trim()===n || String(pp.order_no||'').trim()===n);
      got = pos.flatMap(pp => pp.line_items || []);
    }
    if (got.length === 0 && typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) {
      const so = SHOPIFY._orders.find(x => String(x.shopify_order_number||'').replace('#','')===n || String(x.name||'').replace('#','')===n);
      if (so && so.line_items) got = so.line_items;
    }
    lineItems = lineItems.concat(got);
  });
  lineItems = (lineItems||[]).filter(li => typeof _isInsuranceLineItem !== 'function' || !_isInsuranceLineItem(li));
  if (lineItems.length === 0) {
    if (box) box.innerHTML = `<span style="font-size:11px;color:var(--warning);">⚠ 本地没找到订单「${escapeHtml(nos.join(' / '))}」的产品 · 可改用上面的 SKU 拉取</span>`;
    _invOrderFetched = []; return;
  }
  const productMap = (typeof SHOPIFY !== 'undefined' && SHOPIFY._productMap) ? SHOPIFY._productMap : {};
  _invOrderFetched = lineItems.map(li => {
    const eff = (li.sku && typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.effectiveBySku) ? (PRODUCTS_CACHE.effectiveBySku(li.sku) || {}) : {};
    const name = eff.name_cn || li.title_cn || li.title || li.title_en || '';
    let img = li.image_url || li.image || eff.image_url || '';
    if (!img && li.sku && productMap[li.sku] && productMap[li.sku].image_url) img = productMap[li.sku].image_url;
    const variant = (typeof _cleanFetchedSpec === 'function') ? _cleanFetchedSpec(li, li.variant || li.variant_title || '') : (li.variant || li.variant_title || '');
    return { sku: li.sku || '', name, image_url: img, variant };
  }).filter(x => x.sku);
  if (_invOrderFetched.length === 0) { if (box) box.innerHTML = '<span style="font-size:11px;color:var(--warning);">⚠ 该订单产品没有 SKU,无法带入</span>'; return; }
  if (box) box.innerHTML = `
    <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:4px;">点一个产品 → 自动填入 SKU / 名称 / 图:</div>
    <div style="display:flex;flex-direction:column;gap:5px;max-height:220px;overflow-y:auto;">
      ${_invOrderFetched.map((p,i)=>`
        <div onclick="invPickOrderLine(${i})" style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:7px;padding:5px 8px;cursor:pointer;background:var(--bg-card);"
             onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--bg-elevated)';" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg-card)';">
          ${p.image_url?`<img src="${p.image_url}" loading="lazy" style="width:40px;height:40px;object-fit:cover;border-radius:5px;flex-shrink:0;">`:'<span style="width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;">📷</span>'}
          <div style="min-width:0;flex:1;">
            <div style="font-family:monospace;font-size:11px;color:var(--accent);">${escapeHtml(p.sku)}</div>
            <div style="font-size:11.5px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name||'(无名)')}</div>
            ${p.variant?`<div style="font-size:10px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.variant)}</div>`:''}
          </div>
        </div>`).join('')}
    </div>`;
}
window.invFetchByOrderNo = invFetchByOrderNo;

function invPickOrderLine(i) {
  const p = _invOrderFetched[i];
  if (!p || !INV_EDIT) return;
  INV_EDIT.sku = p.sku;
  INV_EDIT.title = p.name || p.sku;
  if (p.image_url) INV_EDIT.image_url = p.image_url;
  // 重渲染弹窗,字段自动带入
  if (typeof _invRenderEdit === 'function') _invRenderEdit();
  setTimeout(() => {
    const st = document.getElementById('invFetchStatus');
    if (st) { st.textContent = `✓ 已带入 ${p.sku} · 可继续填库存数量后保存`; st.style.color = 'var(--success)'; }
  }, 60);
}
window.invPickOrderLine = invPickOrderLine;

async function invDelete() {
  const s = INV_EDIT;
  if (!s || s.isNew) return;
  if (!confirm('确认删除这条库存?\n\n会移到「🗑 回收站」· 库存数量/平台绑定都保留 · 主管可随时恢复。')) return;
  try {
    const who = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) ? CURRENT_AGENT : '?';
    const { error } = await sb.from('products').update({
      deleted_at: new Date().toISOString(),   // V20260607三期:软删除 → 进回收站,可恢复
      deleted_by: who,
    }).eq('id', s.id);
    if (error) throw error;
    if (typeof PRODUCTS_CACHE !== 'undefined') PRODUCTS_CACHE.invalidate();
    toast('🗑 已移到回收站 · 主管可在「回收站」恢复', 'success');
    invCloseEdit();
    setTimeout(() => renderInventory(), 150);
  } catch (e) {
    if (/deleted_by/.test(e.message || '')) { /* 没有 deleted_by 列也不影响,重试只写 deleted_at */
      try { await sb.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', s.id); toast('🗑 已移到回收站', 'success'); invCloseEdit(); setTimeout(() => renderInventory(), 150); return; } catch(_) {}
    }
    toast('删除失败:' + (e.message || e), 'err');
  }
}
window.invDelete = invDelete;

// V20260607三期:恢复(主管)· 从回收站还原
async function invRestore(id) {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) { toast('只有主管能恢复', 'warn'); return; }
  try {
    const { error } = await sb.from('products').update({ deleted_at: null }).eq('id', id);
    if (error) throw error;
    if (typeof PRODUCTS_CACHE !== 'undefined') PRODUCTS_CACHE.invalidate();
    toast('♻ 已恢复');
    renderInventory();
  } catch (e) { toast('恢复失败:' + (e.message || e), 'err'); }
}
window.invRestore = invRestore;

// V20260607三期:彻底移出库存(主管)· 不再跟踪库存(产品本身保留),不再出现在回收站
async function invPurge(id) {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) { toast('只有主管能彻底删除', 'warn'); return; }
  if (!confirm('彻底移出库存管理?\n\n该产品将不再跟踪库存、解除平台绑定,也不在回收站显示。\n(产品资料本身不删 · 但此操作不可在库存里恢复)')) return;
  try {
    const { error } = await sb.from('products').update({ is_inventory_item: false, deleted_at: null, platform_skus: [] }).eq('id', id);
    if (error) throw error;
    if (typeof PRODUCTS_CACHE !== 'undefined') PRODUCTS_CACHE.invalidate();
    toast('已彻底移出库存');
    renderInventory();
  } catch (e) { toast('操作失败:' + (e.message || e), 'err'); }
}
window.invPurge = invPurge;

// ─────────────── 快速调整库存 modal ───────────────
let INV_ADJUST = null;

function invOpenAdjust(productId) {
  const p = INVENTORY._list.find(x => String(x.id) === String(productId));
  if (!p) { toast('找不到产品', 'err'); return; }
  INV_ADJUST = { id: p.id, sku: p.sku, title: p.name_cn, current: Number(p.stock_qty || 0), delta: 0, mode: 'add' };
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
    const _invUpd = { stock_qty: newQty };
    if (change > 0) _invUpd.stock_in_at = new Date().toISOString();   // V20260607二期:补货重置库龄起算
    const { error } = await sb.from('products').update(_invUpd).eq('id', s.id);
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

// V20260601:复用 po.js 里的 _aiTranslateSpec(Claude Sonnet 4 · 已为灯具术语优化)
// 单次调用太慢(每个变体属性都翻一次)· 改成一次性合批翻译
async function _invTranslateBatch(items) {
  // items: [{ key, text }] · 返回 { key: translatedText }
  if (!items || items.length === 0) return {};
  if (typeof _aiTranslateSpec !== 'function') {
    console.warn('[invTranslate] _aiTranslateSpec 不存在 · 跳过翻译');
    return {};
  }
  
  // 已经是中文的过滤掉(>30% 中文)
  const needTranslate = items.filter(it => {
    if (!it.text) return false;
    const cnChars = (it.text.match(/[\u4e00-\u9fa5]/g) || []).length;
    return cnChars / it.text.length < 0.3;
  });
  if (needTranslate.length === 0) return {};
  
  // 合批:用编号格式喂给 Claude · 一次返回多条
  const numbered = needTranslate.map((it, i) => `[${i+1}] ${it.text}`).join('\n');
  
  try {
    const result = await _aiTranslateSpec(numbered);
    // 解析:[1] xxx \n [2] yyy ...
    const map = {};
    const lines = result.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      const m = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (m) {
        const idx = parseInt(m[1]) - 1;
        if (needTranslate[idx]) {
          map[needTranslate[idx].key] = m[2].trim();
        }
      }
    });
    return map;
  } catch (e) {
    console.warn('[invTranslate] 批量翻译失败', e.message);
    return {};
  }
}

// 单次翻译(仅供单字段需要时调用 · 大部分场景用 _invTranslateBatch)
async function _invTranslateEnToCn(text) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  if (!t) return '';
  const cnChars = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (cnChars / t.length > 0.3) return t;
  
  if (typeof _aiTranslateSpec !== 'function') return text;
  try {
    return (await _aiTranslateSpec(t)) || text;
  } catch (e) {
    console.warn('[invTranslate]', e.message);
    return text;
  }
}

// SKU 明细渲染 · 只显示店铺 SKU + 变体翻译结果
function _invRenderVariantDetail(detail) {
  const box = document.getElementById('invVariantDetailBox');
  if (!box) return;
  if (!detail) { box.innerHTML = ''; box.style.display = 'none'; return; }
  
  // 没有变体名也不显示
  if (!detail.variantTitleEn && !detail.variantSku) {
    box.innerHTML = ''; 
    box.style.display = 'none';
    return;
  }
  
  // 变体翻译显示成多行(extractVariantInfo 输出每行用 \n 分隔)
  const cnLines = (detail.variantInfoCn || '').split('\n').filter(Boolean);
  
  box.innerHTML = `
    <div style="background:#f0f9ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:11.5px;color:#1e40af;font-weight:700;letter-spacing:0.5px;">📋 SKU 明细</div>
        ${detail.productUrl ? `<a href="${escapeHtmlForInv(detail.productUrl)}" target="_blank" rel="noopener" style="font-size:11px;color:#2563eb;text-decoration:underline;">↗ 看产品页</a>` : ''}
      </div>
      
      ${detail.variantSku ? `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px;margin-bottom:8px;">
          <div style="color:#64748b;">店铺 SKU</div>
          <div style="color:#1c1917;font-family:JetBrains Mono,monospace;font-size:12px;">${escapeHtmlForInv(detail.variantSku)}</div>
        </div>
      ` : ''}
      
      ${detail.variantTitleEn ? `
        <div style="font-size:11px;color:#78716c;margin-bottom:4px;">变体(原文)</div>
        <div style="font-size:12.5px;color:#57534e;margin-bottom:8px;padding:6px 8px;background:#fafaf9;border-radius:5px;font-family:JetBrains Mono,monospace;">${escapeHtmlForInv(detail.variantTitleEn)}</div>
      ` : ''}
      
      ${cnLines.length > 0 ? `
        <div style="font-size:11px;color:#78716c;margin-bottom:4px;">变体(中文 · 自动转 cm + 去重)</div>
        <div style="background:#fff;border:1px solid #e0e7ff;border-radius:5px;padding:8px 10px;">
          ${cnLines.map(line => `<div style="font-size:12.5px;color:#1c1917;line-height:1.6;">${escapeHtmlForInv(line)}</div>`).join('')}
        </div>
      ` : (detail.variantTitleEn ? `<div style="font-size:11.5px;color:#a8a29e;font-style:italic;">变体未能自动翻译 · 可手动编辑产品名</div>` : '')}
    </div>
  `;
  box.style.display = 'block';
}

// 通用核心:抓到 product + variant 后做完整处理
// V20260601 精简版:只翻译产品名(Claude) + 用 PO 的 extractVariantInfo 处理变体
async function _invApplyProductData(p, v, storeName, productUrl) {
  const status = document.getElementById('invFetchStatus');
  if (status) status.textContent = `⏳ Claude AI 翻译产品名...`;
  
  // 1. 产品名翻译(Claude · 灯具术语优化)
  const titleEn = p.title || '';
  let titleCn = titleEn;
  try {
    if (typeof _aiTranslateSpec === 'function' && titleEn) {
      // 已经是中文就跳
      const cnChars = (titleEn.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (cnChars / titleEn.length < 0.3) {
        titleCn = (await _aiTranslateSpec(titleEn)) || titleEn;
      }
    }
  } catch (e) {
    console.warn('[invTranslate]', e.message);
  }
  INV_EDIT.title = titleCn;
  
  // 2. 图
  let imgUrl = '';
  if (v?.featured_image?.src) imgUrl = v.featured_image.src;
  else if (Array.isArray(p.images) && p.images.length > 0) imgUrl = p.images[0].src;
  else if (p.image?.src) imgUrl = p.image.src;
  if (imgUrl) INV_EDIT.image_url = imgUrl;
  
  // 3. 变体翻译 · 复用 PO 单的 extractVariantInfo(英寸→cm · 多尺寸去重 · 颜色/材质翻译)
  let variantInfoCn = '';
  if (v?.title && typeof extractVariantInfo === 'function') {
    variantInfoCn = extractVariantInfo(v.title);
  }
  
  // 4. UI 同步
  const titleInput = document.getElementById('invEditTitleInput');
  if (titleInput) titleInput.value = INV_EDIT.title;
  const urlInput = document.getElementById('invEditImgUrl');
  if (urlInput) urlInput.value = INV_EDIT.image_url;
  invRefreshImgPreview();
  
  // 5. 精简明细
  _invRenderVariantDetail({
    variantSku: v?.sku || p.sku || '',
    variantTitleEn: v?.title || '',
    variantInfoCn: variantInfoCn,
    productUrl: productUrl,
  });
  
  return { titleCn, titleEn, imgUrl };
}

// 1. 从 Shopify 拉 SKU 对应的产品(用公开 /products.json API · 不走后端 Edge Function)
window.invFetchFromShopify = async function() {
  const sku = (INV_EDIT?.sku || '').trim();
  const status = document.getElementById('invFetchStatus');
  if (!sku) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '请先填 SKU'; }
    return;
  }
  if (status) { status.style.color = 'var(--text-secondary)'; status.textContent = '⏳ 分析 SKU 前缀...'; }
  
  try {
    // SKU 前缀路由
    const skuUpper = sku.toUpperCase();
    const STORES_META = (SHOPIFY?.STORES_META || []).filter(m => !m.legacyOnly && m.public_domain);
    const meta = STORES_META.find(m => skuUpper.startsWith(m.site_code));
    
    const queue = [];
    if (meta) queue.push({ meta, isPrimary: true });
    for (const m of STORES_META) {
      if (!queue.find(q => q.meta.domain === m.domain)) queue.push({ meta: m, isPrimary: false });
    }
    
    if (status) {
      if (meta) status.textContent = `⏳ SKU 前缀 ${meta.site_code} → 优先 ${meta.public_domain}...`;
      else status.textContent = `⏳ 未识别前缀 · 遍历查询(较慢)...`;
    }
    
    let found = null;
    let triedStores = [];
    
    for (const { meta: m, isPrimary } of queue) {
      const storeName = m.public_domain || m.domain;
      triedStores.push(storeName);
      if (status) status.textContent = `⏳ 查 ${storeName}${isPrimary ? ' [主店]' : ''}...`;
      
      try {
        const maxPages = isPrimary ? 5 : 2;
        let allProducts = [];
        for (let page = 1; page <= maxPages; page++) {
          const url = `https://${m.public_domain}/products.json?limit=250&page=${page}`;
          const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
          if (!res.ok) break;
          const json = await res.json();
          const products = json.products || [];
          allProducts.push(...products);
          if (products.length < 250) break;
        }
        
        for (const p of allProducts) {
          const variants = p.variants || [];
          const matchedVariant = variants.find(v => 
            (v.sku || '').toLowerCase() === sku.toLowerCase()
          );
          if (matchedVariant) {
            const productUrl = `https://${m.public_domain}/products/${p.handle}${matchedVariant.id ? '?variant=' + matchedVariant.id : ''}`;
            found = { product: p, variant: matchedVariant, store: storeName, productUrl };
            break;
          }
        }
        if (found) break;
        
        if (isPrimary && status) {
          status.style.color = '#b45309';
          status.textContent = `⚠ 主店未找到 · 尝试其它店...`;
        }
      } catch (e) {
        console.warn('[invFetch] store error:', m.public_domain, e.message);
      }
    }
    
    if (!found) {
      if (status) { 
        status.style.color = 'var(--danger)'; 
        status.textContent = `⚠ 未找到 · 已查 ${triedStores.length} 个店 · 可粘贴产品 URL 手动拉`;
      }
      return;
    }
    
    // 应用产品数据 + 翻译
    await _invApplyProductData(found.product, found.variant, found.store, found.productUrl);
    
    if (status) { 
      status.style.color = 'var(--ok)'; 
      status.textContent = `✓ 在 ${found.store} 找到 · 已填充全部明细 + 翻译完成`; 
    }
  } catch (e) {
    console.error('[invFetch]', e);
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '⚠ 拉取失败:' + (e.message || '未知'); }
  }
};

// 1b. 通过产品 URL 拉(兜底)
window.invFetchFromProductUrl = async function() {
  const url = (document.getElementById('invProductUrlInput')?.value || '').trim();
  const status = document.getElementById('invFetchStatus');
  if (!url) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '请贴产品 URL'; }
    return;
  }
  if (status) { status.style.color = 'var(--text-secondary)'; status.textContent = '⏳ 解析产品 URL...'; }
  
  try {
    const m = url.match(/https?:\/\/(?:www\.)?([^/]+)\/products\/([^/?#]+)/i);
    if (!m) throw new Error('URL 格式不识别');
    const host = m[1];
    const handle = m[2];
    const variantId = (url.match(/variant=(\d+)/) || [])[1];
    
    const productUrl = `https://${host}/products/${handle}.json`;
    if (status) status.textContent = `⏳ 拉 ${host}/${handle}...`;
    
    const res = await fetch(productUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const p = json.product;
    if (!p) throw new Error('返回数据没有 product 字段');
    
    const variants = p.variants || [];
    const v = variantId 
      ? variants.find(x => String(x.id) === String(variantId))
      : variants[0];
    
    // 自动填 SKU(如果空)
    if (v?.sku && !INV_EDIT.sku) {
      INV_EDIT.sku = v.sku;
      const skuIn = document.getElementById('invEditSkuInput');
      if (skuIn) skuIn.value = v.sku;
    }
    
    await _invApplyProductData(p, v, host, url);
    
    if (status) { 
      status.style.color = 'var(--ok)'; 
      status.textContent = `✓ 已从 ${host} 拉取 · 全部明细 + 翻译完成`; 
    }
  } catch (e) {
    console.error('[invFetchUrl]', e);
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '⚠ URL 拉取失败:' + (e.message || '未知'); }
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
