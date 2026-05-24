// ============================================================
// 跟单团队工作台 · shopify.js
// 销售单（Shopify 同步）+ 自定义订单录入
// ============================================================
// 依赖：core.js · utils.js
// ============================================================

// ============================================================
// Shopify 销售单模块（批次 3：状态机 + DB 持久化 + sub-tabs）
// ============================================================
const SHOPIFY = {
  STORES_META: [
    { domain: 'vakkerlighting.myshopify.com', site_code: 'VK' },
    { domain: 'dekorfine.myshopify.com',      site_code: 'DF' },
    { domain: 'docolight.myshopify.com',      site_code: 'DC' },
    { domain: 'vkfrench.myshopify.com',       site_code: 'PL' },
    { domain: 'vakkerge.myshopify.com',       site_code: 'RD' },
    { domain: 'vkwholesale.myshopify.com',    site_code: 'MH' },
    { domain: 'docolamp.myshopify.com',       site_code: 'LS' },
    { domain: 'mooijane.myshopify.com',       site_code: 'MJ' },
    { domain: 'decormote.myshopify.com',      site_code: 'RS' },
  ],
  FN_URL: 'https://pyfmuknvjqfwcqvbrsvw.supabase.co/functions/v1/shopify-api',
  _stores: [],
  _orders: [],
  _autoSyncTimer: null,
  _initialized: false,
  _currentFilter: 'all',

  async call(action, params = {}, shop = null) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('未登录');
    const body = { shop, action, params };
    const res = await fetch(this.FN_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error || ('HTTP ' + res.status));
    return json;
  },

  async loadStores() {
    const { data, error } = await sb.from('shopify_stores').select('*').order('site_code');
    if (error) throw error;
    const byDomain = {};
    (data || []).forEach(s => { byDomain[s.shop_domain] = s; });
    this._stores = this.STORES_META.map(meta => {
      const row = byDomain[meta.domain];
      return {
        ...meta,
        connected: !!row && row.is_active,
        id: row?.id || null,
        display_name: row?.display_name || meta.domain.replace('.myshopify.com', ''),
        last_sync_at: row?.last_sync_at || null,
        auto_sync_enabled: row?.auto_sync_enabled !== false,
        auto_sync_minutes: row?.auto_sync_minutes || 5,
      };
    });
    return this._stores;
  },

  async loadOrdersFromDB(force = false, opts = {}) {
    const CACHE_MS = 60 * 1000;
    const cacheKey = JSON.stringify({ shop: opts.shop || '', from: opts.from || '', to: opts.to || '' });
    if (!force && this._ordersCacheKey === cacheKey && this._ordersLoadedAt && (Date.now() - this._ordersLoadedAt < CACHE_MS) && this._orders.length > 0) {
      return this._orders;
    }
    let q = sb.from('shopify_orders').select('*').is('deleted_at', null);
    if (opts.shop) q = q.eq('shop_domain', opts.shop);
    if (opts.from) q = q.gte('shopify_created_at', opts.from + 'T00:00:00Z');
    if (opts.to)   q = q.lte('shopify_created_at', opts.to + 'T23:59:59Z');
    q = q.order('shopify_created_at', { ascending: false }).limit(500);
    const { data, error } = await q;
    if (error) throw error;
    this._orders = data || [];
    this._ordersLoadedAt = Date.now();
    this._ordersCacheKey = cacheKey;
    return this._orders;
  },
  invalidateOrders() { this._ordersLoadedAt = 0; this._ordersCacheKey = null; },

  async loadProductImageMap(skus) {
    if (!skus || skus.length === 0) return {};
    const { data } = await sb.from('products').select('sku, image_url, name_cn, name_en').in('sku', skus).is('deleted_at', null);
    const map = {};
    (data || []).forEach(p => { map[p.sku] = p; });
    return map;
  },

  async renameStore(storeId, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    const { error } = await sb.from('shopify_stores').update({ display_name: trimmed }).eq('id', storeId);
    if (error) throw error;
  },

  async setOrderStatus(orderId, status) {
    const { error } = await sb.from('shopify_orders')
      .update({ local_status: status, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
  },

  installUrl(domain) {
    return `https://pyfmuknvjqfwcqvbrsvw.supabase.co/functions/v1/shopify-install?shop=${domain}`;
  },

  shopifyAdminUrl(domain, shopifyOrderId) {
    if (domain === 'manual') return '';  // 自定义订单无外链
    return `https://admin.shopify.com/store/${domain.replace('.myshopify.com', '')}/orders/${shopifyOrderId}`;
  },

  formatRelativeTime(ts) {
    if (!ts) return '未同步';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return Math.floor(diff) + ' 秒前';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 2) return '昨天';
    return Math.floor(diff / 86400) + ' 天前';
  },

  flagEmoji(code) {
    if (!code || code.length !== 2) return '🌐';
    const A = 0x1F1E6;
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => A + c.charCodeAt(0) - 65));
  },

  siteCodeOf(shopDomain) {
    if (shopDomain === 'manual') return 'MN';  // 自定义订单标记
    const m = this.STORES_META.find(s => s.domain === shopDomain);
    return m?.site_code || '';
  },
};

async function shopifyReloadStores() {
  try {
    await SHOPIFY.loadStores();
    renderShopifyStores();
    populateFetchShopDropdown();
  } catch (e) {
    toast('加载店铺失败：' + (e.message || e), 'err');
  }
}

function renderShopifyStores() {
  const grid = document.getElementById('salesStoresGrid');
  if (!grid) return;
  const stores = SHOPIFY._stores;
  const connected = stores.filter(s => s.connected).length;
  document.getElementById('salesStoresTotal').textContent = `${connected}/9`;

  grid.innerHTML = stores.map(s => {
    if (s.connected) {
      // 已连接：绿色 chip + ✓ 标记 + 双击改名 + 点击同步
      return `
        <span class="store-chip connected" 
          onclick="shopifyQuickFetchFromCard('${s.domain}')"
          ondblclick="shopifyRenameStore('${s.id}', '${escapeHtml(s.display_name).replace(/'/g,"\\'")}')"
          title="${escapeHtml(s.display_name)} · 已连接 · ${SHOPIFY.formatRelativeTime(s.last_sync_at)}同步 (双击改名)">
          <span class="store-chip-code">${s.site_code}</span>
          <span class="store-chip-name">${escapeHtml(s.display_name)}</span>
          <span class="store-chip-status">✓</span>
        </span>`;
    } else {
      // 未连接：灰色 chip + 安装入口
      return `
        <span class="store-chip" onclick="shopifyInstall('${s.domain}')" title="${escapeHtml(s.display_name)} · 未连接，点击安装">
          <span class="store-chip-code">${s.site_code}</span>
          <span class="store-chip-name">${escapeHtml(s.display_name)}</span>
          <span class="store-chip-status install">+ 安装</span>
        </span>`;
    }
  }).join('');
}

async function shopifyRenameStore(storeId, currentName) {
  const newName = await showPrompt({
    title: '改店铺显示名',
    message: '建议改成真实品牌名，方便在销售订单/采购单中识别。',
    field: { label: '店铺显示名', value: currentName, placeholder: '例如：Vakker Lighting' },
  });
  if (newName === null || newName.trim() === currentName) return;
  try {
    await SHOPIFY.renameStore(storeId, newName);
    toast('✓ 改名成功');
    await shopifyReloadStores();
  } catch (e) { toast('改名失败：' + (e.message || e), 'err'); }
}

function shopifyInstall(domain) {
  const url = SHOPIFY.installUrl(domain);
  window.open(url, '_blank', 'noopener');
  toast('请在新窗口完成授权后回来点 🔄 刷新');
}

function populateFetchShopDropdown() {
  const sel = document.getElementById('salesFetchShop');
  if (!sel) return;
  const connected = SHOPIFY._stores.filter(s => s.connected);
  const current = sel.value;
  sel.innerHTML = '<option value="">— 选择店铺 —</option>' +
    connected.map(s => `<option value="${s.domain}">${escapeHtml(s.display_name)} (${s.site_code})</option>`).join('');
  if (current && connected.find(s => s.domain === current)) sel.value = current;
  else if (connected.length === 1) sel.value = connected[0].domain;
}

function shopifyQuickFetchFromCard(domain) {
  switchTab('sales');
  setTimeout(() => {
    document.getElementById('salesFetchShop').value = domain;
    shopifyFetchOrders();
  }, 100);
}

function setSalesDefaultDates() {
  const to = document.getElementById('salesFetchTo');
  const from = document.getElementById('salesFetchFrom');
  if (!to || !from) return;
  if (!to.value) {
    const today = new Date();
    to.value = today.toISOString().slice(0, 10);
  }
  if (!from.value) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    from.value = d.toISOString().slice(0, 10);
  }
}

async function shopifyFetchOrders() {
  const shop = document.getElementById('salesFetchShop').value;
  if (!shop) { toast('请先选择店铺', 'warn'); return; }
  const from = document.getElementById('salesFetchFrom').value;
  const to = document.getElementById('salesFetchTo').value;
  const status = document.getElementById('salesFetchStatus').value;

  const btn = document.querySelector('#salesFetchCard .btn.primary');
  btn.classList.add('loading');
  const hint = document.getElementById('salesFetchHint');
  hint.textContent = '正在同步…';

  try {
    const params = { status, limit: 100, auto_save: true };
    if (from) params.created_at_min = from + 'T00:00:00Z';
    if (to) params.created_at_max = to + 'T23:59:59Z';
    const r = await SHOPIFY.call('list_orders', params, shop);
    let msg = `同步完成 · 共 ${r.count} 单`;
    if (r.saved !== undefined) msg += ` · 入库 ${r.saved}`;
    if (r.new_products) msg += ` · 新建产品 ${r.new_products}`;
    hint.textContent = `${msg} · ${new Date().toLocaleTimeString()}`;
    toast(msg);
    await shopifyReloadOrdersAndRender(true);  // force=true 跳过缓存
  } catch (e) {
    toast('同步失败：' + (e.message || e), 'err');
    hint.textContent = '同步失败';
  } finally {
    btn.classList.remove('loading');
  }
}

async function shopifyReloadOrdersAndRender(force = false) {
  const shop = document.getElementById('salesFetchShop')?.value || '';
  const from = document.getElementById('salesFetchFrom')?.value || '';
  const to   = document.getElementById('salesFetchTo')?.value || '';
  await SHOPIFY.loadOrdersFromDB(force, { shop, from, to });
  const skus = [];
  SHOPIFY._orders.forEach(o => (o.line_items || []).forEach(li => { if (li.sku) skus.push(li.sku); }));
  SHOPIFY._productMap = await SHOPIFY.loadProductImageMap([...new Set(skus)]);
  shopifyRefreshCounts();
  renderShopifyOrders();
  renderSalesStats();  // 业绩面板
}

// 销售额业绩面板（按 7/30/90/180/365 天分段；销售额数据仅主管可见）
async function renderSalesStats() {
  const container = document.getElementById('salesStatsContainer');
  if (!container) return;

  const now = new Date();
  const periods = [
    { label: '今天',   days: 1 },
    { label: '近7天',  days: 7 },
    { label: '近30天', days: 30 },
    { label: '近90天', days: 90 },
    { label: '近1年',  days: 365 },
  ];

  // 在当前店铺范围内查每段销售额（管理员）或单数（跟单都能看）
  const shop = document.getElementById('salesFetchShop')?.value || '';
  // 取近 1 年所有订单（前端切片，比多次查询快）
  const since = new Date(now.getTime() - 365 * 86400000).toISOString();
  let q = sb.from('shopify_orders').select('total_price, currency, shopify_created_at, financial_status, local_status, shop_domain').gte('shopify_created_at', since).is('deleted_at', null);
  if (shop) q = q.eq('shop_domain', shop);
  const { data, error } = await q;
  if (error) { console.warn('销售业绩加载失败:', error); container.innerHTML = ''; return; }

  const rows = data || [];

  // 按时间段切片（排除已取消 cancelled）
  const stats = periods.map(p => {
    const since = new Date(now.getTime() - (p.days === 1 ? 0 : p.days) * 86400000);
    if (p.days === 1) {
      since.setHours(0, 0, 0, 0);
    }
    const sinceIso = since.toISOString();
    const rs = rows.filter(r => r.shopify_created_at >= sinceIso && r.local_status !== 'cancelled');
    const totalAmount = rs.reduce((s, x) => s + Number(x.total_price || 0), 0);
    return { label: p.label, count: rs.length, amount: totalAmount };
  });

  // 货币（取最常见的）
  const currCount = {};
  rows.forEach(r => { const c = r.currency || ''; if (c) currCount[c] = (currCount[c] || 0) + 1; });
  const mainCurrency = Object.entries(currCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '';

  container.innerHTML = `
    <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">📊 销售业绩 <span style="font-weight:400; color:var(--text-tertiary); margin-left:6px; font-size:11px;">${shop ? escapeHtml(shop) : '全部店铺'}${IS_ADMIN ? '' : ' · 仅订单数（销售额限主管查看）'} · 点击卡片查看订单</span></div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;">
        ${stats.map((s, i) => `
          <div class="sales-stat-card" onclick="shopifyFilterByPeriod(${periods[i].days})" title="点击：筛选出${s.label}的订单">
            <div style="font-size: 11px; color: var(--text-tertiary);">${s.label}</div>
            <div style="font-size: 20px; font-weight: 700; color: var(--accent); margin-top:2px;">${s.count}<span style="font-size: 11px; font-weight: 400; color: var(--text-tertiary); margin-left: 3px;">单</span></div>
            ${IS_ADMIN ? `<div style="font-size: 11px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace;">${mainCurrency} ${s.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>` : '<div style="font-size: 11px; color: var(--text-tertiary);">🔒 销售额</div>'}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 点击业绩卡片 → 在订单列表里按时间筛选
function shopifyFilterByPeriod(days) {
  // 设置 quickRange 下拉
  const sel = document.getElementById('salesQuickRange');
  const fromEl = document.getElementById('salesFetchFrom');
  const toEl = document.getElementById('salesFetchTo');
  
  // days=1 表示今天，找最接近的下拉值
  if (days === 1) {
    // 今天用自定义
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);
    if (sel) sel.value = 'custom';
    if (fromEl) fromEl.value = ymd;
    if (toEl) toEl.value = ymd;
  } else {
    // 7/30/90/365 直接选下拉值
    if (sel) {
      sel.value = String(days);
      salesQuickRangeChange();  // 触发下拉变化逻辑
    }
  }
  // 重新加载订单 + 渲染
  shopifyReloadOrdersAndRender(true);
  // 滚动到订单列表顶部
  setTimeout(() => {
    const ordersEl = document.getElementById('salesOrdersBody');
    if (ordersEl) ordersEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
  toast(`✓ 已筛选：${days === 1 ? '今天' : '近 ' + days + ' 天'}`, 'info');
}

// 快捷时间下拉变化
function salesQuickRangeChange() {
  const sel = document.getElementById('salesQuickRange');
  const v = sel.value;
  const fromEl = document.getElementById('salesFetchFrom');
  const toEl = document.getElementById('salesFetchTo');
  if (v === 'custom') return;  // 让用户自己选
  const days = parseInt(v, 10);
  const today = new Date();
  const from = new Date(today.getTime() - days * 86400000);
  const fmt = d => d.toISOString().slice(0, 10);
  fromEl.value = fmt(from);
  toEl.value = fmt(today);
  // 立刻按新区间从本地读
  shopifyReloadOrdersAndRender(true);
}

function shopifyRefreshCounts() {
  const orders = SHOPIFY._orders;
  const counts = { all: 0, pending: 0, processing: 0, done: 0, cancelled: 0 };
  orders.forEach(o => {
    if (o.local_status === 'cancelled') counts.cancelled++;
    else if (o.local_status === 'done') counts.done++;
    else {
      counts.all++;  // "全部" = 进行中（pending + processing），不含 done / cancelled
      if (o.local_status === 'pending') counts.pending++;
      else if (o.local_status === 'processing') counts.processing++;
    }
  });
  document.getElementById('cntAll').textContent = counts.all;
  document.getElementById('cntPending').textContent = counts.pending;
  document.getElementById('cntProcessing').textContent = counts.processing;
  document.getElementById('cntDone').textContent = counts.done;
  const cancelledEl = document.getElementById('cntCancelled');
  if (cancelledEl) cancelledEl.textContent = counts.cancelled;
  if (typeof setBadge === 'function') setBadge('badgeSales', counts.pending);
  // 同步规则计数
  if (typeof shopifyRefreshRuleCounts === 'function') shopifyRefreshRuleCounts();
}

let SHOPIFY_PAGE = 1;
const SHOPIFY_PAGE_SIZE = 50;

// 销售单搜索/排序状态
const SHOPIFY_SEARCH = {
  type: 'order_no',           // 搜索字段类型
  text: '',                   // 搜索内容
  mode: 'fuzzy',              // fuzzy / exact
  countries: new Set(),       // 国家筛选（多选）
  shops: new Set(),           // 店铺筛选（多选）
  amtMin: null, amtMax: null, // 金额范围
  financialStatus: '',        // 付款状态
  refundFilter: '',           // 退款状态
  rule: 'all',                // 订单规则快筛
  sortBy: 'order_date_desc',  // 排序方式
};

// 选中订单 ID 集合
const SHOPIFY_SELECTED = new Set();
// V4：销售单拆单选择（orderId -> Set<shopify_line_item_id>），用于"仅为选中开 PO"
const SHOPIFY_SPLIT_SEL = new Map();

function shopifySetSearchType(t) {
  SHOPIFY_SEARCH.type = t;
  document.querySelectorAll('.search-type-chip').forEach(el => el.classList.toggle('active', el.dataset.searchType === t));
  shopifyDoSearch();
}

function shopifySetSort(s) {
  SHOPIFY_SEARCH.sortBy = s;
  document.querySelectorAll('.sort-chip').forEach(el => el.classList.toggle('active', el.dataset.sortBy === s));
  shopifyDoSearch();
}

function shopifyDoSearch() {
  SHOPIFY_SEARCH.text = (document.getElementById('salesSearchText')?.value || '').trim();
  SHOPIFY_SEARCH.mode = document.getElementById('salesSearchMode')?.value || 'fuzzy';
  SHOPIFY_SEARCH.amtMin = parseFloat(document.getElementById('salesAmtMin')?.value) || null;
  SHOPIFY_SEARCH.amtMax = parseFloat(document.getElementById('salesAmtMax')?.value) || null;
  SHOPIFY_SEARCH.financialStatus = document.getElementById('salesFinancialStatus')?.value || '';
  SHOPIFY_SEARCH.refundFilter = document.getElementById('salesRefundFilter')?.value || '';
  SHOPIFY_PAGE = 1;
  renderShopifyOrders();
}

function shopifyResetSearch() {
  SHOPIFY_SEARCH.text = '';
  SHOPIFY_SEARCH.countries.clear();
  SHOPIFY_SEARCH.amtMin = null;
  SHOPIFY_SEARCH.amtMax = null;
  SHOPIFY_SEARCH.financialStatus = '';
  SHOPIFY_SEARCH.refundFilter = '';
  const inp = document.getElementById('salesSearchText'); if (inp) inp.value = '';
  const amin = document.getElementById('salesAmtMin'); if (amin) amin.value = '';
  const amax = document.getElementById('salesAmtMax'); if (amax) amax.value = '';
  const fs = document.getElementById('salesFinancialStatus'); if (fs) fs.value = '';
  const rf = document.getElementById('salesRefundFilter'); if (rf) rf.value = '';
  document.querySelectorAll('.country-chip').forEach(el => el.classList.remove('active'));
  SHOPIFY_PAGE = 1;
  renderShopifyOrders();
}

function shopifyToggleAdvSearch() {
  const adv = document.getElementById('salesAdvSearch');
  if (!adv) return;
  adv.style.display = adv.style.display === 'none' ? 'block' : 'none';
  if (adv.style.display === 'block') {
    shopifyRenderCountryFilter();
    shopifyRenderShopFilter();
  }
}

function shopifyRenderShopFilter() {
  const wrap = document.getElementById('salesShopFilter');
  if (!wrap) return;
  const shopMap = {};
  (SHOPIFY._orders || []).forEach(o => {
    const d = o.shop_domain || '';
    if (!d) return;
    const code = SHOPIFY.siteCodeOf(d) || d;
    if (!shopMap[d]) shopMap[d] = { domain: d, code, count: 0 };
    shopMap[d].count++;
  });
  const sorted = Object.values(shopMap).sort((a, b) => b.count - a.count);
  wrap.innerHTML = sorted.map(s => `
    <button class="country-chip ${SHOPIFY_SEARCH.shops.has(s.domain) ? 'active' : ''}" 
      onclick="shopifyToggleShop('${escapeHtml(s.domain)}')">${escapeHtml(s.code)} (${s.count})</button>
  `).join('') || '<span style="font-size:11px; color:var(--text-tertiary);">先同步订单</span>';
}

function shopifyToggleShop(domain) {
  if (SHOPIFY_SEARCH.shops.has(domain)) SHOPIFY_SEARCH.shops.delete(domain);
  else SHOPIFY_SEARCH.shops.add(domain);
  shopifyRenderShopFilter();
  shopifyDoSearch();
}

// 规则快筛
function shopifySetRule(rule) {
  SHOPIFY_SEARCH.rule = rule;
  document.querySelectorAll('.rule-chip').forEach(el => el.classList.toggle('active', el.dataset.rule === rule));
  SHOPIFY_PAGE = 1;
  renderShopifyOrders();
}

// 计算订单是否命中某规则
function _orderMatchesRule(o, rule) {
  switch (rule) {
    case 'all': return true;
    case 'has_note': return !!(o.customer_note || '').trim();
    case 'has_internal': return !!(o.internal_note || '').trim();
    case 'refunded': {
      const fs = (o.financial_status || '').toLowerCase();
      return fs === 'refunded' || fs === 'partially_refunded';
    }
    case 'big_amount': {
      // 大额：> ¥3000（按 USD ≥ 460 简化判断）
      const amt = Number(o.total_price || 0);
      const cur = (o.currency || 'USD').toUpperCase();
      // 简化：USD/EUR/GBP/AUD 按 6.5 折算；CNY 直接比较
      if (cur === 'CNY' || cur === 'RMB') return amt >= 3000;
      return amt >= 460;  // ~ ¥3000
    }
    case 'big_qty': {
      return (o.line_items || []).some(li => (Number(li.quantity) || 0) >= 5);
    }
    case 'overdue': {
      // 待处理且超过 7 天
      if (o.local_status !== 'pending' && o.local_status !== 'processing') return false;
      const ts = new Date(o.shopify_created_at || o.created_at || 0).getTime();
      const daysSince = (Date.now() - ts) / 86400000;
      return daysSince >= 7;
    }
    case 'manual': return o.shop_domain === 'manual';
    case 'unknown_sku': {
      // line_item 的 SKU 在 products 表中不存在
      return (o.line_items || []).some(li => {
        if (!li.sku) return true;
        const eff = PRODUCTS_CACHE.effectiveBySku ? PRODUCTS_CACHE.effectiveBySku(li.sku) : null;
        return !eff;
      });
    }
    default: return true;
  }
}

// 刷新规则 chip 计数
// 计数遵循"所见即所得"原则：显示**当前 sub-tab 范围内**命中的数量
// 同时缓存全局命中数（不限 sub-tab）到 SHOPIFY._ruleGlobalCounts，用于空结果引导
function shopifyRefreshRuleCounts() {
  const all = SHOPIFY._orders || [];
  const filter = SHOPIFY._currentFilter || 'all';
  // 当前 sub-tab 范围
  const currentScope = filter === 'all'
    ? all.filter(o => o.local_status !== 'cancelled' && o.local_status !== 'done')
    : all.filter(o => o.local_status === filter);
  // 全局 active 范围（待审核 + 待处理，不含已完成/已取消）
  const globalActive = all.filter(o => o.local_status !== 'cancelled' && o.local_status !== 'done');

  const rules = ['has_note', 'has_internal', 'refunded', 'big_amount', 'big_qty', 'overdue', 'manual', 'unknown_sku'];
  SHOPIFY._ruleGlobalCounts = {};
  rules.forEach(r => {
    const cnt = currentScope.filter(o => _orderMatchesRule(o, r)).length;
    const globalCnt = globalActive.filter(o => _orderMatchesRule(o, r)).length;
    SHOPIFY._ruleGlobalCounts[r] = globalCnt;
    const el = document.getElementById(`ruleCnt_${r}`);
    if (el) {
      el.textContent = cnt;
      // 当前为 0 但全局有时，给 chip 加一个标记色（视觉提示用户切到全部能看到）
      const chipEl = el.closest('.rule-chip');
      if (chipEl) chipEl.classList.toggle('has-global', cnt === 0 && globalCnt > 0);
    }
  });
}

// 批量操作
function shopifyToggleSelectOrder(orderId, checked) {
  if (checked) SHOPIFY_SELECTED.add(orderId);
  else SHOPIFY_SELECTED.delete(orderId);
  shopifyUpdateBatchUI();
}

// V4：点击销售单的 SKU/产品名 → 在新标签打开 Shopify 后台的产品页
// V5-2026-05-24: 加 mode 参数 - 'admin' (后台编辑) / 'storefront' (前台商品页)
// 3 层兜底,即使老数据没存 product_id 也能跳
function openShopifyProductInBrowser(orderId, lineItemId, mode) {
  mode = mode || 'admin';  // 默认后台
  const order = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) 
    ? SHOPIFY._orders.find(o => o.id === orderId) 
    : null;
  if (!order) { toast('订单不存在', 'err'); return; }
  
  // 找对应的 line_item
  const item = (order.line_items || []).find(li => 
    String(li.shopify_line_item_id) === String(lineItemId)
  );
  if (!item) { toast('产品行不存在', 'err'); return; }
  
  // ============ 前台模式 ============
  if (mode === 'storefront') {
    // 前台 URL: https://xxx.myshopify.com/products/handle (需要 product handle)
    // 如果有 handle 直接用,否则用 product_id 兜底,否则搜 SKU
    if (item.product_handle && order.shop_domain) {
      const url = `https://${order.shop_domain}/products/${item.product_handle}`;
      console.log('%c[打开 Shopify 前台]', 'color:#10b981;font-weight:bold', { sku: item.sku, url });
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.product_id && order.shop_domain) {
      // 用 product_id 跳 — Shopify 会重定向到对应 handle
      const url = `https://${order.shop_domain}/products/${item.product_id}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.sku && order.shop_domain) {
      // 兜底:用 SKU 搜前台
      const url = `https://${order.shop_domain}/search?q=${encodeURIComponent(item.sku)}`;
      console.log('%c[搜 Shopify 前台]', 'color:#10b981;font-weight:bold', { sku: item.sku, url });
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    toast('无法定位前台商品页', 'err');
    return;
  }
  
  // ============ 后台模式(默认) ============
  // 【层 1】最优: Shopify 后台产品编辑页
  if (item.product_id && order.shop_domain && order.shop_domain !== 'manual') {
    const url = `https://${order.shop_domain}/admin/products/${item.product_id}`;
    console.log('%c[打开 Shopify 后台产品]', 'color:#2563eb;font-weight:bold', { 
      sku: item.sku, product_id: item.product_id, url 
    });
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  
  // 【层 2】兜底: 用 SKU 搜 Shopify 后台
  if (item.sku && order.shop_domain && order.shop_domain !== 'manual') {
    const url = `https://${order.shop_domain}/admin/products?selectedView=all&query=${encodeURIComponent(item.sku)}`;
    console.log('%c[搜 Shopify 后台 SKU]', 'color:#f59e0b;font-weight:bold', { sku: item.sku, url });
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  
  // 【层 3】最后兜底: 跳本地档案
  if (item.sku && typeof gotoProductBySku === 'function') {
    toast('该订单无 Shopify 店铺信息,跳到本地产品档案', 'info', 3000);
    gotoProductBySku(item.sku);
  } else {
    toast('无法定位产品页', 'err');
  }
}

// ============================================================
// V4：销售单拆单功能
// 跟单可以勾选部分 line_items 拆出来开独立 PO（同一销售单可能多个供应商）
// ============================================================
function soToggleSplitItem(orderId, lineItemId, checked) {
  if (!SHOPIFY_SPLIT_SEL.has(orderId)) SHOPIFY_SPLIT_SEL.set(orderId, new Set());
  const sel = SHOPIFY_SPLIT_SEL.get(orderId);
  if (checked) sel.add(lineItemId);
  else sel.delete(lineItemId);
  if (sel.size === 0) SHOPIFY_SPLIT_SEL.delete(orderId);
  
  // 局部刷新这个订单卡片的"拆单状态行"，避免重渲染整列表（防抖+保留滚动位置）
  if (typeof SHOPIFY !== 'undefined' && typeof SHOPIFY.render === 'function') {
    SHOPIFY.render();
  }
}

function soClearSplitSel(orderId) {
  SHOPIFY_SPLIT_SEL.delete(orderId);
  // 清空 UI 上的勾选
  document.querySelectorAll(`.so-split-checkbox[data-order-id="${orderId}"]`).forEach(cb => { cb.checked = false; });
  if (typeof SHOPIFY !== 'undefined' && typeof SHOPIFY.render === 'function') SHOPIFY.render();
}

function soOpenPoFormForSplit(orderId) {
  const sel = SHOPIFY_SPLIT_SEL.get(orderId);
  if (!sel || sel.size === 0) {
    toast('请先在产品行左侧勾选要拆单的产品', 'warn');
    return;
  }
  console.log('%c[拆单] 开始为选中的 line_items 开 PO', 'color:#7c3aed;font-weight:bold', {
    orderId,
    selectedLineItemIds: Array.from(sel),
  });
  // 调用增强版 openPoForm（第二参数 = 仅默认勾选这些 IDs）
  openPoForm(orderId, sel);
  // 清空拆单选择（避免下次开 PO 时还带着这些勾选）
  SHOPIFY_SPLIT_SEL.delete(orderId);
}


function shopifyToggleSelectAll(checked) {
  // 选中"当前页"的所有
  document.querySelectorAll('.so-card-checkbox').forEach(cb => {
    cb.checked = checked;
    const id = cb.dataset.orderId;
    if (id) {
      if (checked) SHOPIFY_SELECTED.add(id);
      else SHOPIFY_SELECTED.delete(id);
    }
  });
  shopifyUpdateBatchUI();
}

function shopifyUpdateBatchUI() {
  const n = SHOPIFY_SELECTED.size;
  const cntEl = document.getElementById('salesSelectedCount');
  if (cntEl) cntEl.textContent = n;
  const disabled = n === 0;
  ['batchApproveBtn', 'batchDoneBtn', 'batchCancelBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

async function shopifyBatchApprove() {
  const ids = [...SHOPIFY_SELECTED];
  if (ids.length === 0) return;
  if (!confirm(`确认把 ${ids.length} 个订单从"待审核"推进到"待处理"？`)) return;
  try {
    // 只对 pending 状态的生效
    const toUpdate = (SHOPIFY._orders || []).filter(o => ids.includes(o.id) && o.local_status === 'pending');
    if (toUpdate.length === 0) { toast('所选订单中没有"待审核"状态的', 'warn'); return; }
    const { error } = await sb.from('shopify_orders').update({ local_status: 'processing', updated_at: new Date().toISOString() }).in('id', toUpdate.map(x => x.id));
    if (error) throw error;
    // 更新本地
    toUpdate.forEach(o => { o.local_status = 'processing'; });
    toast(`✓ 已审核 ${toUpdate.length} 个订单（${ids.length - toUpdate.length} 个跳过）`);
    SHOPIFY_SELECTED.clear();
    shopifyRefreshCounts();
    shopifyRefreshRuleCounts();
    renderShopifyOrders();
  } catch (e) { toast('批量审核失败：' + (e.message || e), 'err'); }
}

async function shopifyBatchMarkDone() {
  const ids = [...SHOPIFY_SELECTED];
  if (ids.length === 0) return;
  if (!confirm(`确认把 ${ids.length} 个订单标记为"已完成"？`)) return;
  try {
    const { error } = await sb.from('shopify_orders').update({ local_status: 'done', updated_at: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
    (SHOPIFY._orders || []).forEach(o => { if (ids.includes(o.id)) o.local_status = 'done'; });
    toast(`✓ 已标记 ${ids.length} 个订单为完成`);
    SHOPIFY_SELECTED.clear();
    shopifyRefreshCounts();
    shopifyRefreshRuleCounts();
    renderShopifyOrders();
  } catch (e) { toast('批量完成失败：' + (e.message || e), 'err'); }
}

async function shopifyBatchCancel() {
  const ids = [...SHOPIFY_SELECTED];
  if (ids.length === 0) return;
  if (!confirm(`⚠ 确认批量取消 ${ids.length} 个订单？\n如果这些订单已开 PO，请先去采购单 tab 处理那些 PO。`)) return;
  try {
    const { error } = await sb.from('shopify_orders').update({ local_status: 'cancelled', updated_at: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
    (SHOPIFY._orders || []).forEach(o => { if (ids.includes(o.id)) o.local_status = 'cancelled'; });
    toast(`✓ 已取消 ${ids.length} 个订单`);
    SHOPIFY_SELECTED.clear();
    shopifyRefreshCounts();
    shopifyRefreshRuleCounts();
    renderShopifyOrders();
  } catch (e) { toast('批量取消失败：' + (e.message || e), 'err'); }
}

// 导出当前筛选结果（新窗口打开 HTML 表格，可打印 PDF / 复制到 Excel）
function shopifyExportOrders() {
  // 走和 render 一样的过滤逻辑（含搜索、规则、排序）
  const filter = SHOPIFY._currentFilter;
  let orders = filter === 'all'
    ? (SHOPIFY._orders || []).filter(o => o.local_status !== 'cancelled' && o.local_status !== 'done')
    : (SHOPIFY._orders || []).filter(o => o.local_status === filter);
  if (SHOPIFY_SEARCH.rule && SHOPIFY_SEARCH.rule !== 'all') {
    orders = orders.filter(o => _orderMatchesRule(o, SHOPIFY_SEARCH.rule));
  }
  orders = shopifyApplySearchFilter(orders);
  orders = shopifyApplySorting(orders);

  if (orders.length === 0) { toast('当前筛选无数据', 'warn'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const totalUSD = orders.reduce((s, o) => s + Number(o.total_price || 0), 0);
  const totalQty = orders.reduce((s, o) => s + (o.line_items || []).reduce((q, li) => q + Number(li.quantity || 0), 0), 0);

  // 收集所有 line_items 平铺
  const rows = [];
  orders.forEach(o => {
    const a = o.shipping_address || {};
    const addr = [a.address1, a.city, a.province, a.country_code, a.zip].filter(Boolean).join(', ');
    (o.line_items || []).forEach((li, idx) => {
      rows.push({
        order_no: o.shopify_order_number,
        shop: SHOPIFY.siteCodeOf(o.shop_domain) || o.shop_domain,
        date: (o.shopify_created_at || '').slice(0, 10),
        customer: o.customer_name || '',
        email: o.customer_email || '',
        country: a.country_code || '',
        addr,
        total: o.total_price || 0,
        currency: o.currency || 'USD',
        sku: li.sku || '',
        product: li.title || '',
        variant: li.variant_title || '',
        qty: li.quantity || 0,
        price: li.price || 0,
        image_url: li.image_url || '',
        financial_status: o.financial_status || '',
        local_status: o.local_status || '',
        note: ((o.customer_note || '') + (o.internal_note ? ` | 内部:${o.internal_note}` : '')).slice(0, 100),
        first_line: idx === 0,  // 是不是该订单的第一行（用于显示订单号/客户）
      });
    });
  });

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>销售订单导出 - ${today}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; padding: 20px; color: #1c1917; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #78716c; font-size: 12px; margin-bottom: 16px; }
  .summary { background: #f5f5f4; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; display: flex; gap: 24px; font-size: 13px; flex-wrap: wrap; }
  .summary b { font-size: 16px; color: #2563eb; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  thead { background: #f5f5f4; }
  th, td { border: 1px solid #d6d3d1; padding: 5px 7px; vertical-align: middle; }
  th { font-weight: 600; text-align: left; font-size: 10px; text-transform: uppercase; }
  .qty-big { background: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
  img { display: block; width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #d6d3d1; }
  .actions { margin: 14px 0; }
  .actions button { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 8px; }
  .actions button:hover { background: #1d4ed8; }
  @media print {
    .actions { display: none; }
    body { padding: 8px; }
    table { font-size: 9px; }
    img { width: 40px; height: 40px; }
  }
</style></head><body>
<h1>📥 销售订单导出</h1>
<div class="meta">导出日期：${today} · 当前筛选状态：${filter} · 共 ${orders.length} 个订单, ${rows.length} 行产品</div>
<div class="summary">
  <div>订单数：<b>${orders.length}</b></div>
  <div>产品行数：<b>${rows.length}</b></div>
  <div>总件数：<b>${totalQty}</b></div>
  <div>总金额（USD）：<b>$ ${totalUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b></div>
</div>
<div class="actions">
  <button onclick="window.print()">🖨 打印 / 保存为 PDF</button>
  <button onclick="navigator.clipboard.writeText(document.querySelector('table').outerHTML).then(() => alert('已复制 HTML，可粘贴到 Excel/Word'))">📋 复制表格</button>
  <span style="font-size:12px; color:#78716c;">提示：在浏览器打印窗口可选"另存为 PDF"</span>
</div>
<table>
  <thead><tr>
    <th>店</th><th>订单号</th><th>下单日</th><th>客户</th><th>邮箱</th><th>国家</th>
    <th>图</th><th>SKU/产品</th><th>规格</th><th style="text-align:center;">数量</th><th style="text-align:right;">单价</th>
    <th style="text-align:right;">总额</th><th>付款</th><th>备注</th>
  </tr></thead>
  <tbody>${rows.map(r => `<tr>
    <td>${r.first_line ? r.shop : ''}</td>
    <td style="font-family:monospace; font-size:10px;">${r.first_line ? r.order_no : ''}</td>
    <td>${r.first_line ? r.date : ''}</td>
    <td>${r.first_line ? escapeHtml(r.customer) : ''}</td>
    <td style="font-size:10px;">${r.first_line ? escapeHtml(r.email) : ''}</td>
    <td>${r.country}</td>
    <td>${r.image_url ? `<img src="${escapeHtml(r.image_url)}">` : ''}</td>
    <td><b>${escapeHtml(r.product)}</b><br><span style="color:#78716c; font-family:monospace; font-size:9px;">${escapeHtml(r.sku)}</span></td>
    <td style="font-size:10px; color:#44403c;">${escapeHtml(r.variant)}</td>
    <td style="text-align:center;">${Number(r.qty) >= 2 ? `<span class="qty-big">${r.qty}</span>` : r.qty}</td>
    <td style="text-align:right; font-family:monospace;">${r.currency} ${Number(r.price).toFixed(2)}</td>
    <td style="text-align:right; font-family:monospace;">${r.first_line ? `<b>${r.currency} ${Number(r.total).toFixed(2)}</b>` : ''}</td>
    <td style="font-size:10px;">${escapeHtml(r.financial_status)}</td>
    <td style="font-size:10px; max-width:200px; overflow:hidden;">${r.first_line ? escapeHtml(r.note) : ''}</td>
  </tr>`).join('')}</tbody>
</table>
<div style="margin-top: 16px; font-size: 11px; color: #78716c; text-align: right;">跟单团队工作台 · 共 ${rows.length} 行 · ${orders.length} 个订单</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('浏览器阻止了新窗口，请允许弹窗', 'err'); return; }
  win.document.write(html);
  win.document.close();
  toast(`✓ 已导出 ${orders.length} 个订单`);
}

function shopifyRenderCountryFilter() {
  const wrap = document.getElementById('salesCountryFilter');
  if (!wrap) return;
  // 统计所有国家
  const countryMap = {};
  (SHOPIFY._orders || []).forEach(o => {
    const cc = (o.shipping_address?.country_code || '').toUpperCase();
    const cn = o.shipping_address?.country || cc || '未知';
    if (cc) countryMap[cc] = { code: cc, name: cn, count: (countryMap[cc]?.count || 0) + 1 };
  });
  const sorted = Object.values(countryMap).sort((a, b) => b.count - a.count);
  wrap.innerHTML = sorted.map(c => `
    <button class="country-chip ${SHOPIFY_SEARCH.countries.has(c.code) ? 'active' : ''}" 
      onclick="shopifyToggleCountry('${c.code}')">${c.code} (${c.count})</button>
  `).join('') || '<span style="font-size:11px; color:var(--text-tertiary);">先同步订单</span>';
}

function shopifyToggleCountry(code) {
  if (SHOPIFY_SEARCH.countries.has(code)) SHOPIFY_SEARCH.countries.delete(code);
  else SHOPIFY_SEARCH.countries.add(code);
  shopifyRenderCountryFilter();
  shopifyDoSearch();
}

// 应用搜索过滤
function shopifyApplySearchFilter(orders) {
  if (!orders || orders.length === 0) return orders;
  let list = orders;

  // 文本搜索
  if (SHOPIFY_SEARCH.text) {
    // 多关键字（逗号/空格/中文逗号分隔）
    const keywords = SHOPIFY_SEARCH.text.split(/[,，\s]+/).filter(Boolean).map(k => k.toLowerCase());
    if (keywords.length > 0) {
      list = list.filter(o => {
        const type = SHOPIFY_SEARCH.type;
        const mode = SHOPIFY_SEARCH.mode;  // fuzzy / exact
        // 取被搜索的字段值
        const getFieldValue = (t) => {
          switch (t) {
            case 'order_no': return (o.shopify_order_number || '').toLowerCase();
            case 'sku': return (o.line_items || []).map(li => (li.sku || '').toLowerCase()).join(' ');
            case 'product_name': return (o.line_items || []).map(li => (li.title || '').toLowerCase()).join(' ');
            case 'customer_name': return (o.customer_name || '').toLowerCase();
            case 'email': return (o.customer_email || '').toLowerCase();
            case 'address': {
              const a = o.shipping_address || {};
              return [a.address1, a.address2, a.city, a.province, a.country, a.country_code, a.zip].filter(Boolean).join(' ').toLowerCase();
            }
            case 'note': return ((o.customer_note || '') + ' ' + (o.internal_note || '')).toLowerCase();
            case 'any': {
              const a = o.shipping_address || {};
              return [
                o.shopify_order_number, o.customer_name, o.customer_email,
                (o.line_items || []).map(li => (li.sku || '') + ' ' + (li.title || '')).join(' '),
                a.address1, a.city, a.province, a.country, a.country_code, a.zip,
                o.customer_note, o.internal_note,
              ].filter(Boolean).join(' ').toLowerCase();
            }
            default: return '';
          }
        };
        const fieldVal = getFieldValue(type);
        // 任一关键字命中即可（OR）
        return keywords.some(kw => {
          if (mode === 'exact') {
            // 精确：字段值的单词中有完全相等的
            const words = fieldVal.split(/[\s,;]+/);
            return words.includes(kw);
          } else {
            return fieldVal.includes(kw);
          }
        });
      });
    }
  }

  // 国家筛选
  if (SHOPIFY_SEARCH.countries.size > 0) {
    list = list.filter(o => {
      const cc = (o.shipping_address?.country_code || '').toUpperCase();
      return SHOPIFY_SEARCH.countries.has(cc);
    });
  }

  // 金额范围
  if (SHOPIFY_SEARCH.amtMin != null) list = list.filter(o => Number(o.total_price || 0) >= SHOPIFY_SEARCH.amtMin);
  if (SHOPIFY_SEARCH.amtMax != null) list = list.filter(o => Number(o.total_price || 0) <= SHOPIFY_SEARCH.amtMax);

  // 付款状态
  if (SHOPIFY_SEARCH.financialStatus) list = list.filter(o => (o.financial_status || '') === SHOPIFY_SEARCH.financialStatus);

  // 退款状态
  if (SHOPIFY_SEARCH.refundFilter) {
    list = list.filter(o => {
      const r = getRefundStatus(o);
      return r.level === SHOPIFY_SEARCH.refundFilter;
    });
  }

  return list;
}

// 应用排序
function shopifyApplySorting(orders) {
  const sortBy = SHOPIFY_SEARCH.sortBy;
  const sorted = [...orders];
  switch (sortBy) {
    case 'order_date_asc':
      sorted.sort((a, b) => new Date(a.shopify_created_at || a.created_at || 0) - new Date(b.shopify_created_at || b.created_at || 0));
      break;
    case 'amount_desc':
      sorted.sort((a, b) => Number(b.total_price || 0) - Number(a.total_price || 0));
      break;
    case 'amount_asc':
      sorted.sort((a, b) => Number(a.total_price || 0) - Number(b.total_price || 0));
      break;
    case 'sku':
      sorted.sort((a, b) => {
        const aSku = (a.line_items?.[0]?.sku || '').toLowerCase();
        const bSku = (b.line_items?.[0]?.sku || '').toLowerCase();
        return aSku.localeCompare(bSku);
      });
      break;
    case 'order_date_desc':
    default:
      sorted.sort((a, b) => new Date(b.shopify_created_at || b.created_at || 0) - new Date(a.shopify_created_at || a.created_at || 0));
  }
  return sorted;
}

function shopifyGoPage(p) {
  SHOPIFY_PAGE = Math.max(1, p);
  renderShopifyOrders();
  const el = document.getElementById('salesOrdersBody');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function shopifyShowFilter(f) {
  SHOPIFY._currentFilter = f;
  SHOPIFY_PAGE = 1;  // 切换 sub-tab 时重置页码
  document.querySelectorAll('.sub-tab-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  shopifyRefreshRuleCounts();  // 切 sub-tab 后，chip 计数也要刷新（所见即所得）
  renderShopifyOrders();
}

function renderShopifyOrders() {
  const body = document.getElementById('salesOrdersBody');
  if (!body) return;
  const filter = SHOPIFY._currentFilter;
  const all = SHOPIFY._orders;
  let orders = filter === 'all'
    ? all.filter(o => o.local_status !== 'cancelled' && o.local_status !== 'done')
    : all.filter(o => o.local_status === filter);

  // 应用规则筛选
  if (SHOPIFY_SEARCH.rule && SHOPIFY_SEARCH.rule !== 'all') {
    orders = orders.filter(o => _orderMatchesRule(o, SHOPIFY_SEARCH.rule));
  }

  // 应用店铺筛选
  if (SHOPIFY_SEARCH.shops.size > 0) {
    orders = orders.filter(o => SHOPIFY_SEARCH.shops.has(o.shop_domain || ''));
  }

  // 应用搜索过滤
  const beforeSearch = orders.length;
  orders = shopifyApplySearchFilter(orders);
  // 应用排序
  orders = shopifyApplySorting(orders);

  // 搜索摘要
  const summaryEl = document.getElementById('salesSearchSummary');
  if (summaryEl) {
    const hasSearch = SHOPIFY_SEARCH.text || SHOPIFY_SEARCH.countries.size > 0 || SHOPIFY_SEARCH.amtMin != null || SHOPIFY_SEARCH.amtMax != null || SHOPIFY_SEARCH.financialStatus || SHOPIFY_SEARCH.refundFilter;
    if (hasSearch) {
      summaryEl.style.display = 'block';
      const parts = [];
      if (SHOPIFY_SEARCH.text) parts.push(`<b>${escapeHtml(SHOPIFY_SEARCH.text)}</b> (${SHOPIFY_SEARCH.mode === 'exact' ? '精确' : '模糊'})`);
      if (SHOPIFY_SEARCH.countries.size > 0) parts.push(`国家: ${[...SHOPIFY_SEARCH.countries].join('/')}`);
      if (SHOPIFY_SEARCH.amtMin != null || SHOPIFY_SEARCH.amtMax != null) parts.push(`金额: ${SHOPIFY_SEARCH.amtMin || 0}~${SHOPIFY_SEARCH.amtMax || '∞'}`);
      if (SHOPIFY_SEARCH.financialStatus) parts.push(`付款: ${SHOPIFY_SEARCH.financialStatus}`);
      if (SHOPIFY_SEARCH.refundFilter) parts.push(`退款: ${SHOPIFY_SEARCH.refundFilter}`);
      summaryEl.innerHTML = `🔍 找到 <b>${orders.length}</b> 条 / 共 ${beforeSearch} 条 · 条件: ${parts.join(' + ')}`;
    } else {
      summaryEl.style.display = 'none';
    }
  }

  if (orders.length === 0) {
    const labelMap = { pending: '待审核', processing: '待处理', done: '已完成', cancelled: '已取消' };
    const hasSearch = SHOPIFY_SEARCH.text || SHOPIFY_SEARCH.countries.size > 0 || SHOPIFY_SEARCH.amtMin != null || SHOPIFY_SEARCH.amtMax != null;
    const activeRule = SHOPIFY_SEARCH.rule;
    const ruleLabels = {
      has_note: '有备注', has_internal: '有内部备注', refunded: '退款单', big_amount: '大额 ≥¥3000',
      big_qty: '高数量 ≥5件', overdue: '超时未发 ≥7天', manual: '自定义订单', unknown_sku: '未配对 SKU',
    };

    // 优先级最高：当前 sub-tab 下点了某规则空，但全局有 → 引导切到「全部」
    if (activeRule && activeRule !== 'all' && filter !== 'all' && !hasSearch) {
      const globalCnt = (SHOPIFY._ruleGlobalCounts || {})[activeRule] || 0;
      if (globalCnt > 0) {
        body.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--text-tertiary); font-size: 13px;">
          当前「${labelMap[filter] || filter}」状态下没有「${ruleLabels[activeRule] || activeRule}」的订单<br>
          💡 切到 <a href="javascript:void(0)" onclick="shopifyShowFilter('all')" style="color:var(--accent); text-decoration:underline; font-weight:600;">「全部」状态</a> 可看到 ${globalCnt} 个（其中部分已开 PO，状态变为「待处理」）
        </div>`;
        return;
      }
    }

    const hint = hasSearch
      ? `🔍 搜索没有匹配结果。<a href="javascript:void(0)" onclick="shopifyResetSearch()" style="color:var(--accent); text-decoration:underline;">清除搜索</a>`
      : filter === 'all'
        ? '还没有订单。选店铺 + 时间范围，点 🔄 同步从 Shopify 拉取'
        : `没有 "${labelMap[filter] || filter}" 状态的订单`;
    body.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--text-tertiary); font-size: 13px;">${hint}</div>`;
    return;
  }

  // 分页
  const totalPages = Math.max(1, Math.ceil(orders.length / SHOPIFY_PAGE_SIZE));
  if (SHOPIFY_PAGE > totalPages) SHOPIFY_PAGE = totalPages;
  const start = (SHOPIFY_PAGE - 1) * SHOPIFY_PAGE_SIZE;
  const pagedOrders = orders.slice(start, start + SHOPIFY_PAGE_SIZE);

  const productMap = SHOPIFY._productMap || {};

  const cardsHtml = pagedOrders.map(o => {
    const shop = o.shop_domain;
    const customerName = o.customer_name || '(无名)';
    const customerEmail = o.customer_email || '';
    const ship = o.shipping_address || {};
    const country = ship.country_code || '';
    const city = ship.city || '';
    const adminLink = SHOPIFY.shopifyAdminUrl(shop, o.shopify_order_id);
    const createdAt = o.shopify_created_at ? new Date(o.shopify_created_at) : null;
    const dateStr = createdAt ? `${createdAt.getFullYear()}-${String(createdAt.getMonth()+1).padStart(2,'0')}-${String(createdAt.getDate()).padStart(2,'0')}` : '';
    const timeStr = createdAt ? `${String(createdAt.getHours()).padStart(2,'0')}:${String(createdAt.getMinutes()).padStart(2,'0')}` : '';

    const items = o.line_items || [];
    const totalQty = items.reduce((s, li) => s + (li.quantity || 0), 0);
    const lineWithPo = items.filter(li => (li.po_assignments || []).length > 0).length;
    const siteCode = SHOPIFY.siteCodeOf(shop);

    // V4 修复（2026-05-24）：退款检测移到 items.map 之前
    // 之前在 items.map 内的 line 1135 使用 isFullyRefunded 时，它尚未声明（TDZ），
    // 导致 renderShopifyOrders 渲染时直接抛 ReferenceError，UI 不刷新。
    const refund = getRefundStatus(o);
    const isFullyRefunded = refund.level === 'full';
    const isPartiallyRefunded = refund.level === 'partial';

    const productsHtml = items.length > 0 ? items.map(li => {
      const p = productMap[li.sku] || {};
      const imgUrl = p.image_url || li.image_url || '';
      const nameCn = p.name_cn || '';
      const title = nameCn || li.title || '(无名)';
      const variant = li.variant_title || '';
      const hasPo = (li.po_assignments || []).length > 0;
      // V4：标题和 SKU 可点击跳转到产品 tab
      // V5-2026-05-24: 双图标 - 🔧 跳后台编辑 / 🛒 跳前台商品页
      const liId = li.shopify_line_item_id || '';
      const skuEsc = escapeHtml(li.sku || '').replace(/'/g, "\\'");
      const hasShopifyProduct = li.sku && o.shop_domain && o.shop_domain !== 'manual';
      
      // SKU 可点击(主操作 - 跳 Shopify 后台)
      const tipBackend = li.product_id ? '点击打开 Shopify 后台产品页' : '点击搜索 Shopify 后台 SKU';
      const skuClickable = li.sku 
        ? hasShopifyProduct
          ? `<a href="#" onclick="event.preventDefault();event.stopPropagation();openShopifyProductInBrowser('${o.id}','${liId}','admin'); return false;" style="color:var(--accent); text-decoration:none; cursor:pointer;" title="${tipBackend}">${escapeHtml(li.sku)}</a>`
          : `<a href="#" onclick="event.preventDefault();event.stopPropagation();gotoProductBySku('${skuEsc}'); return false;" style="color:var(--accent); text-decoration:none; cursor:pointer;" title="点击查看本地产品档案">${escapeHtml(li.sku)}</a>`
        : '';
      
      // 后台 + 前台 + 本地 三个跳转图标
      const shopifyIcons = hasShopifyProduct ? `
        <a href="#" onclick="event.preventDefault();event.stopPropagation();openShopifyProductInBrowser('${o.id}','${liId}','admin'); return false;" 
           style="margin-left:6px; color:var(--accent); text-decoration:none; font-size:11px; opacity:0.85;" 
           title="🔧 在 Shopify 后台打开此产品(编辑/库存/价格)">🔧</a>
        <a href="#" onclick="event.preventDefault();event.stopPropagation();openShopifyProductInBrowser('${o.id}','${liId}','storefront'); return false;" 
           style="margin-left:4px; color:var(--success); text-decoration:none; font-size:11px; opacity:0.85;" 
           title="🛒 在 Shopify 前台打开商品页(客户视角)">🛒</a>
      ` : '';
      
      // 产品名仅高亮悬停,不再单独点击(避免冲突,改用图标)
      const titleClickable = `<span style="color:inherit;">${escapeHtml(title)}</span>`;
      // 跳工作台产品 tab 的小图标（次要操作）
      const localProductIcon = li.sku 
        ? `<a href="#" onclick="event.preventDefault();event.stopPropagation();gotoProductBySku('${skuEsc}'); return false;" style="margin-left:6px; color:var(--text-tertiary); text-decoration:none; font-size:11px; opacity:0.65;" title="查看工作台产品档案（本地）">📋</a>`
        : '';
      // V4：拆单 checkbox（仅 processing 状态且未开 PO 的行显示）
      const canSplit = o.local_status === 'processing' && !hasPo && !isFullyRefunded;
      const splitCheckbox = canSplit 
        ? `<input type="checkbox" class="so-split-checkbox" data-order-id="${o.id}" data-line-id="${li.shopify_line_item_id}" onclick="event.stopPropagation();soToggleSplitItem('${o.id}','${li.shopify_line_item_id}',this.checked)" title="勾选后可拆单（仅为选中行开 PO）" style="margin-right: 8px; cursor: pointer; flex-shrink: 0;">`
        : '';
      return `
        <div class="so-product-line">
          ${splitCheckbox}
          ${imgUrl ? `<img loading="lazy" class="so-prod-img" src="${escapeHtml(imgUrl)}" data-fullsrc="${escapeHtml(imgUrl)}" onclick="openImgLightbox(this.dataset.fullsrc)" alt="">` : `<div class="so-prod-noimg">📷</div>`}
          <div class="so-prod-info">
            ${li.sku ? `<div class="so-prod-sku">SKU: ${skuClickable}${shopifyIcons}${localProductIcon}${hasPo ? ' · <span style="color:var(--success)">✓ 已开 PO</span>' : ''}</div>` : ''}
            <div class="so-prod-name">${titleClickable}${nameCn ? ` <span style="color:var(--text-tertiary); font-size:11px; font-weight:400;">/ ${escapeHtml(li.title || '')}</span>` : ''}</div>
            ${variant ? `<div class="so-prod-variant">${escapeHtml(variant)}</div>` : ''}
          </div>
          <div class="so-prod-qty">
            ${(li.quantity || 0) >= 2
              ? `<span style="display:inline-block; background:var(--danger); color:white; padding:3px 10px; border-radius:6px; font-weight:700; font-size:16px;">× ${li.quantity}</span>`
              : `<span style="color:var(--text-secondary); font-size:13px;">× ${li.quantity || 0}</span>`}
            ${li.price ? `<span class="price">${o.currency || ''} ${parseFloat(li.price).toFixed(2)}</span>` : ''}
          </div>
        </div>`;
    }).join('') : `<div style="font-size:12px; color:var(--text-tertiary); padding:8px 0;">（无产品行）</div>`;

    // V4 修复：退款检测已经在上方（items.map 之前）声明，此处删除重复

    // V4：拆单状态显示（已勾选 line_items 数量）
    const splitCount = (SHOPIFY_SPLIT_SEL.get(o.id) || new Set()).size;
    const splitInfoHtml = splitCount > 0 ? `
      <div style="background: rgba(168, 85, 247, 0.08); border: 1px dashed rgba(168, 85, 247, 0.4); padding: 6px 12px; margin-top: 8px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
        <span style="color: #7c3aed; font-weight: 600;">📤 已选 ${splitCount} 项拆单</span>
        <span>
          <button class="btn small" onclick="event.stopPropagation();soClearSplitSel('${o.id}')" style="padding: 2px 8px; font-size: 11px;">清空</button>
          <button class="btn small primary" onclick="event.stopPropagation();soOpenPoFormForSplit('${o.id}')" style="padding: 2px 10px; font-size: 11px;">📦 仅为选中开 PO</button>
        </span>
      </div>` : '';

    let actionsHtml = '';
    if (o.local_status === 'pending') {
      actionsHtml = `
        <button class="so-action-btn primary" onclick="shopifyStartProcessing('${o.id}')" ${isFullyRefunded ? 'disabled style="opacity:0.4; cursor:not-allowed;" title="此订单已全额退款，禁止开采购单"' : ''}>👁 开始处理</button>
        <button class="so-action-btn" onclick="shopifyCancelOrder('${o.id}')">取消</button>`;
    } else if (o.local_status === 'processing') {
      actionsHtml = `
        <button class="so-action-btn primary" onclick="${isFullyRefunded ? `toast('该订单已全额退款，禁止开采购单，请先取消订单','err')` : `shopifyOpenPoForm('${o.id}')`}" ${isFullyRefunded ? 'disabled style="opacity:0.4; cursor:not-allowed;" title="此订单已全额退款，禁止开采购单"' : ''}>📦 开采购单${items.length > 1 ? '（全部）' : ''}</button>
        ${items.length > 1 && !isFullyRefunded ? `<button class="so-action-btn" onclick="toast('💡 在产品行左侧勾选要拆出来的产品 → 点蓝色「仅为选中开 PO」按钮','info',5000)" title="多个产品不同供应商时，勾选要拆的几个产品开独立 PO">✂ 拆单</button>` : ''}
        <button class="so-action-btn" onclick="shopifyMarkDone('${o.id}')" title="所有产品都开采购单后点此完成">✓ 标记完成</button>`;
    } else if (o.local_status === 'done') {
      actionsHtml = `<button class="so-action-btn" onclick="shopifyReopenOrder('${o.id}')">↺ 重新打开</button>`;
    } else if (o.local_status === 'cancelled') {
      actionsHtml = `<button class="so-action-btn" onclick="shopifyReopenOrder('${o.id}')">↺ 恢复</button>`;
    }

    const localStatusPill = ({
      pending: '<span class="so-status-pill" style="background:rgba(37,99,235,0.12); color:var(--accent)">🔵 待审核</span>',
      processing: '<span class="so-status-pill" style="background:rgba(202,138,4,0.12); color:var(--status-producing)">🟡 待处理</span>',
      done: '<span class="so-status-pill" style="background:rgba(21,128,61,0.12); color:var(--success)">✅ 已完成</span>',
      cancelled: '<span class="so-status-pill" style="background:rgba(168,162,158,0.12); color:var(--text-tertiary)">已取消</span>',
    })[o.local_status] || '';

    return `
      <div class="so-card ${o.local_status === 'done' || o.local_status === 'cancelled' ? 'imported' : ''} ${SHOPIFY_SELECTED.has(o.id) ? 'selected' : ''}" data-id="${o.id}" style="${isFullyRefunded ? 'border-color: var(--danger); border-width: 2px;' : isPartiallyRefunded ? 'border-color: var(--warning); border-width: 2px;' : ''}">
        <div class="so-card-top">
          <div class="so-top-checkbox" style="gap:8px;">
            <input type="checkbox" class="so-card-checkbox" data-order-id="${o.id}" ${SHOPIFY_SELECTED.has(o.id) ? 'checked' : ''}
              onchange="shopifyToggleSelectOrder('${o.id}', this.checked)"
              onclick="event.stopPropagation()"
              title="批量选择">
            ${siteCode ? `<span class="site-pill" style="background:${shop === 'manual' ? 'var(--warning)' : 'var(--accent)'}; color:white; font-size:11px; padding:2px 7px; border-radius:4px; font-weight:700;" title="${shop === 'manual' ? '手动创建的订单' : ''}">${siteCode}</span>` : ''}
          </div>
          <div class="so-top-meta">
            ${adminLink ? `<a href="${adminLink}" target="_blank" rel="noopener" class="so-order-no" title="在 Shopify 后台打开">
              ${escapeHtml(o.shopify_order_number || '#' + (o.shopify_order_id || ''))} <span class="ext">↗</span>
            </a>` : `<span class="so-order-no" style="color:var(--text-primary); font-weight:600;" title="手动创建的订单">${escapeHtml(o.shopify_order_number || '#' + (o.shopify_order_id || ''))} <span style="font-size:10px; color:var(--text-tertiary);">(手动)</span></span>`}
            <span>下单 <b>${dateStr} ${timeStr}</b></span>
          </div>
          <div class="so-top-status">
            ${refund.level !== 'none' ? `<span style="display:inline-block; padding:2px 8px; border-radius:4px; background:${refund.bg}; color:${refund.color}; font-size:11px; font-weight:600; margin-right:4px;">${refund.label}</span>` : ''}
            ${o.financial_status && refund.level === 'none' ? `<span class="so-status-pill ${o.financial_status}">${o.financial_status}</span>` : ''}
            ${localStatusPill}
          </div>
        </div>
        ${isFullyRefunded ? `<div style="background:rgba(220,38,38,0.08); padding:8px 14px; font-size:12px; border-top:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle); color:var(--danger);"><b>⚠️ 订单已全额退款</b> · 禁止开采购单（避免下错单造成损失）。如需操作请先取消订单或联系主管。</div>` : ''}
        ${isPartiallyRefunded ? `<div style="background:rgba(217,119,6,0.08); padding:8px 14px; font-size:12px; border-top:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle); color:var(--warning);"><b>⚠️ 订单已部分退款</b> · 开采购单前请核对实际需采购的产品/数量。</div>` : ''}
        ${(() => {
          const customerNote = (o.customer_note || '').trim();
          const internalNote = (o.internal_note || '').trim();
          const noteAttrs = (o.raw_payload?.note_attributes || []).filter(a => a.value && String(a.value).trim());
          if (!customerNote && !internalNote && noteAttrs.length === 0) return '';
          return `<div style="background: rgba(234,179,8,0.08); border-top:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle); padding:8px 14px; font-size:12px;">
            ${customerNote ? `<div style="margin-bottom:${(internalNote || noteAttrs.length) ? '6px' : '0'};"><b style="color:var(--warning);">💬 客户备注：</b><span style="color:var(--text-primary); white-space:pre-wrap;">${escapeHtml(customerNote)}</span></div>` : ''}
            ${noteAttrs.length > 0 ? `<div style="margin-bottom:${internalNote ? '6px' : '0'};"><b style="color:var(--text-secondary);">🏷 自定义字段：</b>${noteAttrs.map(a => `<span style="display:inline-block; background:rgba(0,0,0,0.04); padding:1px 6px; border-radius:3px; margin:0 4px 2px 0; font-size:11px;">${escapeHtml(a.name)}: ${escapeHtml(a.value)}</span>`).join('')}</div>` : ''}
            ${internalNote ? `<div><b style="color:var(--accent);">📝 内部备注：</b><span style="color:var(--text-primary); white-space:pre-wrap;">${escapeHtml(internalNote)}</span></div>` : ''}
          </div>`;
        })()}
        <div class="so-card-body">
          <div class="so-products">${productsHtml}</div>
          <div class="so-recipient">
            <div class="name">${escapeHtml(customerName)}</div>
            <div class="email">${escapeHtml(customerEmail)}</div>
            <div class="country">${SHOPIFY.flagEmoji(country)} ${escapeHtml(city)}${country ? `, ${country}` : ''}</div>
          </div>
          <div class="so-amount-block">
            <div><span class="so-amount-big">${o.total_price ? parseFloat(o.total_price).toFixed(2) : '0.00'}</span><span class="so-amount-cur">${o.currency || ''}</span></div>
            <div class="so-amount-sub">${totalQty} 件 · ${items.length} 行</div>
          </div>
        </div>
        ${splitInfoHtml}
        <div class="so-card-actions">
          <div class="so-progress">${items.length > 0 ? `PO 进度：${lineWithPo} / ${items.length} 行已分配` : ''}</div>
          <div class="so-actions-right">
            <button class="so-action-btn" onclick="editInternalNote('${o.id}')" title="跟单内部备注（不会同步回 Shopify）">📝 内部备注</button>
            ${actionsHtml}
          </div>
        </div>
      </div>`;
  }).join('');

  // 分页 footer
  let pagerHtml = '';
  if (totalPages > 1) {
    const pageBtns = [];
    const maxBtns = 7;
    let s = Math.max(1, SHOPIFY_PAGE - 3);
    let e = Math.min(totalPages, s + maxBtns - 1);
    s = Math.max(1, e - maxBtns + 1);
    for (let i = s; i <= e; i++) {
      pageBtns.push(`<button class="btn small ${i === SHOPIFY_PAGE ? 'primary' : ''}" onclick="shopifyGoPage(${i})" style="min-width:32px;">${i}</button>`);
    }
    pagerHtml = `
      <div style="display:flex; justify-content:center; align-items:center; gap:6px; padding:16px; flex-wrap:wrap;">
        <button class="btn small" onclick="shopifyGoPage(1)" ${SHOPIFY_PAGE === 1 ? 'disabled' : ''}>« 首页</button>
        <button class="btn small" onclick="shopifyGoPage(${SHOPIFY_PAGE - 1})" ${SHOPIFY_PAGE === 1 ? 'disabled' : ''}>‹ 上一页</button>
        ${pageBtns.join('')}
        <button class="btn small" onclick="shopifyGoPage(${SHOPIFY_PAGE + 1})" ${SHOPIFY_PAGE === totalPages ? 'disabled' : ''}>下一页 ›</button>
        <button class="btn small" onclick="shopifyGoPage(${totalPages})" ${SHOPIFY_PAGE === totalPages ? 'disabled' : ''}>末页 »</button>
        <span style="margin-left:12px; font-size:12px; color:var(--text-tertiary);">共 <b>${orders.length}</b> 条 · 第 ${SHOPIFY_PAGE}/${totalPages} 页</span>
      </div>`;
  } else {
    pagerHtml = `<div style="text-align:center; padding:10px; font-size:11px; color:var(--text-tertiary);">共 ${orders.length} 条</div>`;
  }
  body.innerHTML = cardsHtml + pagerHtml;
  // 渲染完更新批量 UI
  shopifyUpdateBatchUI();
  // 全选 checkbox 同步状态
  const selAllEl = document.getElementById('salesSelectAll');
  if (selAllEl) {
    const cbs = document.querySelectorAll('.so-card-checkbox');
    if (cbs.length > 0) {
      const allChecked = [...cbs].every(cb => cb.checked);
      const noneChecked = [...cbs].every(cb => !cb.checked);
      selAllEl.checked = allChecked;
      selAllEl.indeterminate = !allChecked && !noneChecked;
    } else {
      selAllEl.checked = false;
      selAllEl.indeterminate = false;
    }
  }
}

// 检测订单退款状态
// 返回 { level: 'none'|'partial'|'full'|'voided', label, color, badge }
function getRefundStatus(o) {
  const fs = (o.financial_status || '').toLowerCase();
  if (fs === 'refunded') return { level: 'full',    label: '💸 全额退款',   color: '#dc2626', bg: 'rgba(220,38,38,0.12)' };
  if (fs === 'partially_refunded') return { level: 'partial', label: '⚠️ 部分退款', color: '#d97706', bg: 'rgba(217,119,6,0.12)' };
  if (fs === 'voided')   return { level: 'voided',  label: '⊘ 已作废',     color: '#78716c', bg: 'rgba(120,113,108,0.15)' };
  return { level: 'none', label: '', color: '', bg: '' };
}


// ============ 自定义订单（线下购买手动录入） ============
let CUSTOM_ORDER_STATE = null;
function openCustomOrderModal() {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  CUSTOM_ORDER_STATE = {
    orderNumber: `MANUAL-${ymd}-${seq}`,
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    shipCountry: '',
    shipCity: '',
    shipAddress: '',
    currency: 'USD',
    note: '',
    lineItems: [
      { id: 'line-1', sku: '', title: '', variant_title: '', image_url: '', quantity: 1, price: 0 }
    ],
  };
  document.getElementById('customOrderModal').style.display = 'flex';
  renderCustomOrder();
}

function closeCustomOrderModal() {
  document.getElementById('customOrderModal').style.display = 'none';
  CUSTOM_ORDER_STATE = null;
}

function _coInput(id, label, value, opts = {}) {
  const type = opts.type || 'text';
  const placeholder = opts.placeholder || '';
  const required = opts.required ? ' <span style="color:var(--danger);">*</span>' : '';
  return `
    <div>
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">${label}${required}</label>
      <input type="${type}" id="${id}" value="${escapeHtml(String(value || ''))}" placeholder="${escapeHtml(placeholder)}"
        oninput="_coUpdateField('${id}', this.value)"
        style="width:100%; padding:7px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary);">
    </div>`;
}

function _coUpdateField(id, val) {
  const map = {
    coOrderNumber: 'orderNumber', coCurrency: 'currency',
    coCustName: 'customerName', coCustEmail: 'customerEmail', coCustPhone: 'customerPhone',
    coShipCountry: 'shipCountry', coShipCity: 'shipCity', coShipAddr: 'shipAddress',
    coNote: 'note',
  };
  const key = map[id];
  if (key) CUSTOM_ORDER_STATE[key] = val;
  // 货币和国家变化时更新总金额显示
  if (id === 'coCurrency' || id.startsWith('coLi_')) updateCoTotal();
}

function renderCustomOrder() {
  const s = CUSTOM_ORDER_STATE;
  const body = document.getElementById('customOrderBody');
  const lineItemsHtml = s.lineItems.map((li, i) => `
    <div style="display:grid; grid-template-columns: 90px 1fr 80px 90px 90px 36px; gap:8px; padding:10px; border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:8px; align-items:start;">
      <div data-li-img="${li.id}">
        ${li.image_url ? `<img src="${escapeHtml(li.image_url)}" style="width:90px; height:90px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="coEditLineImage('${li.id}')">` : `<div onclick="coEditLineImage('${li.id}')" style="width:90px; height:90px; border:2px dashed var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-tertiary); font-size:11px; text-align:center;">📷<br>添加图片</div>`}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <input type="text" placeholder="SKU * (如 VKW-251110-31)" value="${escapeHtml(li.sku)}" oninput="coSetLine('${li.id}','sku',this.value)" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
        <input type="text" placeholder="产品名称 *" value="${escapeHtml(li.title)}" oninput="coSetLine('${li.id}','title',this.value)" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
        <input type="text" placeholder="变体/规格（如 黑色 / Triac Dimmable）" value="${escapeHtml(li.variant_title)}" oninput="coSetLine('${li.id}','variant_title',this.value)" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
      </div>
      <input type="number" min="1" placeholder="数量" value="${li.quantity}" oninput="coSetLine('${li.id}','quantity',this.value); updateCoTotal();" style="width:100%; padding:6px 8px; font-size:13px; border:1px solid var(--border); border-radius:5px; text-align:center; ${Number(li.quantity) >= 2 ? 'background:rgba(220,38,38,0.08); border:2px solid #dc2626; color:#dc2626; font-weight:700;' : ''}">
      <input type="number" min="0" step="0.01" placeholder="单价" value="${li.price}" oninput="coSetLine('${li.id}','price',this.value); updateCoTotal();" style="width:100%; padding:6px 8px; font-size:13px; border:1px solid var(--border); border-radius:5px; text-align:center;">
      <div style="text-align:right; font-family:monospace; font-size:12px; align-self:center;" data-li-subtotal="${li.id}">${(Number(li.quantity) * Number(li.price)).toFixed(2)}</div>
      <button class="btn small" onclick="coRemoveLine('${li.id}')" style="align-self:center; ${s.lineItems.length <= 1 ? 'opacity:0.4; pointer-events:none;' : 'color:var(--danger);'}" title="${s.lineItems.length <= 1 ? '至少需要一行' : '删除此行'}">✕</button>
    </div>
  `).join('');

  body.innerHTML = `
    <div style="background: rgba(37,99,235,0.06); padding: 10px 12px; border-radius: 6px; border-left: 3px solid var(--accent); font-size: 12px; color: var(--text-secondary); margin-bottom: 14px;">
      💡 用于线下购买、补单、批发等不通过 Shopify 后台的订单。<br>
      保存后会出现在销售单列表里，可正常开 PO、加备注、流转所有流程。
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: var(--text-secondary);">📋 订单信息</h4>
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 10px;">
        ${_coInput('coOrderNumber', '订单编号', s.orderNumber, { required: true, placeholder: 'MANUAL-XXXXX' })}
        ${_coInput('coCurrency', '货币', s.currency, { placeholder: 'USD / AUD / EUR / CNY' })}
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: var(--text-secondary);">👤 客户信息</h4>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
        ${_coInput('coCustName', '客户姓名', s.customerName, { required: true })}
        ${_coInput('coCustEmail', '邮箱', s.customerEmail, { type: 'email' })}
        ${_coInput('coCustPhone', '电话', s.customerPhone)}
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: var(--text-secondary);">📦 收货地址（用于自动判定电气标准）</h4>
      <div style="display:grid; grid-template-columns: 100px 1fr 2fr; gap: 10px;">
        ${_coInput('coShipCountry', '国家代码', s.shipCountry, { placeholder: 'US/CN/AU/GB...', required: true })}
        ${_coInput('coShipCity', '城市', s.shipCity)}
        ${_coInput('coShipAddr', '详细地址', s.shipAddress)}
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
        <span>🛒 产品明细</span>
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">总金额: <b id="coTotalDisplay" style="color:var(--accent); font-family:monospace; font-size:14px;">${s.currency} 0.00</b></span>
      </h4>
      <div style="background: var(--bg-elevated); padding: 8px 10px; border-radius: 6px 6px 0 0; display: grid; grid-template-columns: 90px 1fr 80px 90px 90px 36px; gap: 8px; font-size: 10px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">
        <div>图片</div><div>SKU/名称/变体</div><div style="text-align:center;">数量</div><div style="text-align:center;">单价</div><div style="text-align:right;">小计</div><div></div>
      </div>
      <div id="coLineItemsContainer" style="margin-top:0;">${lineItemsHtml}</div>
      <button class="btn small" onclick="coAddLine()" style="margin-top: 4px;">+ 添加产品行</button>
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: var(--text-secondary);">📝 备注（可选）</h4>
      <textarea id="coNote" oninput="_coUpdateField('coNote', this.value)" rows="2" placeholder="如：客户特殊要求、批发折扣说明等" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); resize:vertical; font-family:inherit;">${escapeHtml(s.note)}</textarea>
    </div>
  `;
  updateCoTotal();
}

function coSetLine(id, field, val) {
  const li = CUSTOM_ORDER_STATE.lineItems.find(x => x.id === id);
  if (!li) return;
  if (field === 'quantity') li[field] = parseInt(val) || 0;
  else if (field === 'price') li[field] = parseFloat(val) || 0;
  else li[field] = val;
  // 更新本行小计
  const subEl = document.querySelector(`[data-li-subtotal="${id}"]`);
  if (subEl) subEl.textContent = (Number(li.quantity) * Number(li.price)).toFixed(2);
}

function coAddLine() {
  const newId = 'line-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  CUSTOM_ORDER_STATE.lineItems.push({ id: newId, sku: '', title: '', variant_title: '', image_url: '', quantity: 1, price: 0 });
  renderCustomOrder();
}

function coRemoveLine(id) {
  if (CUSTOM_ORDER_STATE.lineItems.length <= 1) return;
  CUSTOM_ORDER_STATE.lineItems = CUSTOM_ORDER_STATE.lineItems.filter(li => li.id !== id);
  renderCustomOrder();
}

async function coEditLineImage(lineId) {
  const li = CUSTOM_ORDER_STATE.lineItems.find(x => x.id === lineId);
  if (!li) return;
  const result = await showPrompt({
    title: '🖼 产品图片',
    fields: [
      { key: 'img', label: '图片', value: li.image_url || '', type: 'image', hint: '上传 / 粘贴 / 拖入 / URL' },
    ],
  });
  if (result === null) return;
  li.image_url = (result.img || '').trim();
  renderCustomOrder();
}

function updateCoTotal() {
  if (!CUSTOM_ORDER_STATE) return;
  const total = CUSTOM_ORDER_STATE.lineItems.reduce((s, x) => s + (Number(x.quantity) || 0) * (Number(x.price) || 0), 0);
  const el = document.getElementById('coTotalDisplay');
  if (el) el.textContent = `${CUSTOM_ORDER_STATE.currency || ''} ${total.toFixed(2)}`;
}

async function saveCustomOrder() {
  const s = CUSTOM_ORDER_STATE;
  if (!s) return;
  // 校验
  if (!s.orderNumber.trim()) { toast('订单编号必填', 'warn'); return; }
  if (!s.customerName.trim()) { toast('客户姓名必填', 'warn'); return; }
  if (!s.shipCountry.trim()) { toast('国家代码必填（决定电气标准）', 'warn'); return; }
  const validLines = s.lineItems.filter(li => li.sku.trim() && li.title.trim() && li.quantity > 0);
  if (validLines.length === 0) { toast('至少需要一条有效的产品行（SKU、名称、数量必填）', 'warn'); return; }

  // 检查订单号是否重复
  const { data: existing } = await sb.from('shopify_orders').select('id').eq('shopify_order_number', s.orderNumber.trim()).maybeSingle();
  if (existing) { toast(`订单号 ${s.orderNumber} 已存在`, 'err'); return; }

  // 组装订单数据
  const totalPrice = validLines.reduce((sum, li) => sum + Number(li.quantity) * Number(li.price), 0);
  const manualOrderId = 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const lineItemsData = validLines.map((li, i) => ({
    shopify_line_item_id: `manual-li-${manualOrderId}-${i}`,
    title: li.title.trim(),
    variant_title: li.variant_title.trim(),
    sku: li.sku.trim(),
    quantity: Number(li.quantity),
    price: String(li.price),
    image_url: li.image_url,
    product_id: null,
    variant_id: null,
    po_assignments: [],
  }));

  const row = {
    shop_domain: 'manual',
    shopify_order_id: manualOrderId,
    shopify_order_number: s.orderNumber.trim(),
    customer_name: s.customerName.trim(),
    customer_email: s.customerEmail.trim(),
    customer_phone: s.customerPhone.trim(),
    shipping_address: {
      country_code: s.shipCountry.trim().toUpperCase(),
      city: s.shipCity.trim(),
      address1: s.shipAddress.trim(),
      name: s.customerName.trim(),
    },
    line_items: lineItemsData,
    financial_status: 'paid',
    fulfillment_status: null,
    local_status: 'processing',  // 直接进待处理
    total_price: totalPrice,
    currency: (s.currency || 'USD').toUpperCase(),
    customer_note: s.note.trim(),
    shopify_created_at: new Date().toISOString(),
    raw_payload: { _manual: true, _created_by: CURRENT_AGENT || 'unknown' },
    imported_at: new Date().toISOString(),
  };
  // imported_by 用 supabase user id
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (user) row.imported_by = user.id;
  } catch (_) {}

  try {
    const { error } = await sb.from('shopify_orders').insert(row);
    if (error) throw error;
    toast(`✓ 自定义订单 ${s.orderNumber} 创建成功`);
    closeCustomOrderModal();
    // 同步上传到产品表（如果 SKU 不在的话）
    for (const li of validLines) {
      try {
        const { data: existingProd } = await sb.from('products').select('id, name_cn_locked, notes_locked').eq('sku', li.sku.trim()).maybeSingle();
        if (!existingProd) {
          // V4-2026-05-24: 新产品 - 插入后异步触发 AI 翻译
          const { data: insertedProd } = await sb.from('products').insert({
            sku: li.sku.trim(),
            name_en: li.title.trim(),
            spec_en: li.variant_title.trim(),
            image_url: li.image_url || null,
          }).select('id').single();
          
          // 异步翻译(不阻塞抓单)
          if (insertedProd && typeof translateProduct === 'function') {
            translateProduct({
              id: insertedProd.id,
              sku: li.sku.trim(),
              name_en: li.title.trim(),
              variant_en: li.variant_title.trim(),
              notes: null,
              name_cn_locked: false,
              notes_locked: false,
            }, { silent: true }).catch(e => console.warn(`[shopify] SKU ${li.sku} 翻译失败:`, e));
          }
        } else if (li.image_url) {
          await sb.from('products').update({ image_url: li.image_url }).eq('id', existingProd.id);
        }
      } catch (e) { console.warn('同步产品失败:', e); }
    }
    // 刷新销售单列表
    SHOPIFY.invalidateOrders();
    await shopifyReloadOrdersAndRender(true);
  } catch (e) {
    toast('保存失败：' + (e.message || e), 'err');
  }
}


