// ============================================================================
// V20260623 · 数据分析模块 analytics.js
// 全站订单数据分析 · 销量榜/波动图/备货建议/ABC/售罄速度/滞销预警/店铺对比
// 数据源:SHOPIFY._orders(shopify_orders 表,含 line_items)· 库存:products(sb)
// ============================================================================

const ANALYTICS = {
  _range: '30d',        // 当前时间范围
  _customFrom: '', _customTo: '',
  _store: '',           // 店铺筛选(空=全部)
  _view: 'restock',     // 子视图:restock(备货建议)/ranking(销量榜)/abc/trend(波动)/stores
  _products: {},        // sku -> 库存产品(国内仓/海外仓)
  _loadedInv: false,
};
window.ANALYTICS = ANALYTICS;

// ── 时间范围定义 ──
const ANALYTICS_RANGES = [
  { k: '7d',   label: '近7天',  days: 7 },
  { k: '14d',  label: '近14天', days: 14 },
  { k: '30d',  label: '近30天', days: 30 },
  { k: '60d',  label: '近2月',  days: 60 },
  { k: '90d',  label: '近3月',  days: 90 },
  { k: '180d', label: '近半年', days: 180 },
  { k: 'quarter', label: '本季度', days: null },
  { k: '365d', label: '近1年',  days: 365 },
  { k: 'custom', label: '自定义', days: null },
];

// ── 排除非产品行(保险/差价/运费/赠品等)──
function _anIsNoise(li) {
  const title = String(li.title || li.name_cn || '').toLowerCase();
  const sku = String(li.sku || '').trim();
  const skuLower = sku.toLowerCase();
  const noiseWords = ['insurance', 'protection', 'shipping protection', 'shipping fee',
    'price difference', 'difference', 'extra fee', 'handling', 'tip', 'gift',
    'orderarmor', 'order armor', 'warranty', 'route protection', 'package protection',
    'shipping insurance', 'order protection', 'damage protection', 'guarantee',
    '保险', '差价', '运费', '补差', '邮费', '赠品', '小费', '附加费', '手续费', '保价', '保障', '保障服务'];
  if (noiseWords.some(w => title.includes(w))) return true;
  // SKU 前缀黑名单(保险/保障类产品的内部 SKU,如 OrderArmor 的 BSI-xxx)
  const noiseSkuPrefix = ['bsi-', 'ins-', 'protect', 'warranty', 'route-'];
  if (noiseSkuPrefix.some(p => skuLower.startsWith(p))) return true;
  // 无 SKU 且单价很低的常是杂项(但保留有 SKU 的)
  if (!sku && Number(li.price || 0) < 5) return true;
  return false;
}

// ── 取当前时间范围的起始时间 ──
function _anRangeStart() {
  const now = new Date();
  if (ANALYTICS._range === 'custom') {
    return ANALYTICS._customFrom ? new Date(ANALYTICS._customFrom + 'T00:00:00') : new Date(now.getTime() - 30 * 86400000);
  }
  if (ANALYTICS._range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  const r = ANALYTICS_RANGES.find(x => x.k === ANALYTICS._range);
  const days = r ? r.days : 30;
  return new Date(now.getTime() - days * 86400000);
}
function _anRangeEnd() {
  if (ANALYTICS._range === 'custom' && ANALYTICS._customTo) return new Date(ANALYTICS._customTo + 'T23:59:59');
  return new Date();
}

// ── 取有效订单(排除取消/删除,时间范围内,店铺筛选)──
function _anValidOrders(start, end) {
  const orders = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) ? SHOPIFY._orders : [];
  const s = start ? start.getTime() : 0;
  const e = end ? end.getTime() : Date.now();
  return orders.filter(o => {
    if (o.local_status === 'cancelled' || o.cancelled_at) return false;
    if (o.deleted_at) return false;
    const t = o.shopify_created_at ? new Date(o.shopify_created_at).getTime() : 0;
    if (t < s || t > e) return false;
    if (ANALYTICS._store && o.shop_domain !== ANALYTICS._store) return false;
    return true;
  });
}

// ── 按 SKU 聚合销量(范围内)──
function _anAggBySku(start, end) {
  const orders = _anValidOrders(start, end);
  const agg = {};   // sku -> { sku, name, image, qty, revenue, currency, orders:Set, shops:Set }
  orders.forEach(o => {
    (o.line_items || []).forEach(li => {
      if (_anIsNoise(li)) return;
      const sku = String(li.sku || '').trim() || ('(无SKU)' + String(li.title || '').slice(0, 20));
      if (!agg[sku]) agg[sku] = { sku, name: li.name_cn || li.title || sku, image: li.image_url || '', qty: 0, revenue: 0, currency: o.currency || 'USD', orders: new Set(), shops: new Set() };
      const q = Number(li.quantity || 0);
      agg[sku].qty += q;
      agg[sku].revenue += q * Number(li.price || 0);
      agg[sku].orders.add(o.id);
      if (o.shop_domain) agg[sku].shops.add(o.shop_domain);
      if (!agg[sku].image && li.image_url) agg[sku].image = li.image_url;
    });
  });
  return Object.values(agg).map(a => ({ ...a, orderCount: a.orders.size, shopCount: a.shops.size }));
}

// ── 按月聚合某 SKU 销量(近 N 月,算波动)──
function _anMonthlyBySku(months) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const orders = _anValidOrders(start, now);
  const monthKeys = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const bySku = {};   // sku -> { name, image, monthly: {ym: qty} }
  orders.forEach(o => {
    const d = new Date(o.shopify_created_at);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (o.line_items || []).forEach(li => {
      if (_anIsNoise(li)) return;
      const sku = String(li.sku || '').trim();
      if (!sku) return;
      if (!bySku[sku]) bySku[sku] = { sku, name: li.name_cn || li.title || sku, image: li.image_url || '', monthly: {} };
      bySku[sku].monthly[ym] = (bySku[sku].monthly[ym] || 0) + Number(li.quantity || 0);
    });
  });
  // 补齐每月(没销量的月=0),算均值/标准差/变异系数
  Object.values(bySku).forEach(s => {
    s.series = monthKeys.map(k => s.monthly[k] || 0);
    const n = s.series.length;
    const mean = s.series.reduce((a, b) => a + b, 0) / n;
    const variance = s.series.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    s.mean = mean;
    s.cv = mean > 0 ? std / mean : (s.series.some(x => x > 0) ? 99 : 0);   // 变异系数
    s.total = s.series.reduce((a, b) => a + b, 0);
    // 趋势:后半段均值 vs 前半段
    const half = Math.floor(n / 2);
    const firstHalf = s.series.slice(0, half).reduce((a, b) => a + b, 0) / Math.max(1, half);
    const secondHalf = s.series.slice(half).reduce((a, b) => a + b, 0) / Math.max(1, n - half);
    s.trend = secondHalf - firstHalf;   // >0 涨,<0 跌
    s.trendPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf * 100) : (secondHalf > 0 ? 100 : 0);
  });
  return { monthKeys, list: Object.values(bySku).sort((a, b) => b.total - a.total) };
}

// ── 加载库存(国内仓/海外仓)关联 ──
async function _anLoadInventory() {
  if (ANALYTICS._loadedInv) return;
  try {
    const { data } = await sb.from('products').select('sku, stock_qty, stock_qty_domestic, stock_qty_overseas, name_cn, image_url').eq('is_inventory_item', true);
    ANALYTICS._products = {};
    (data || []).forEach(p => { if (p.sku) ANALYTICS._products[p.sku] = p; });
    ANALYTICS._loadedInv = true;
  } catch (e) { console.warn('[analytics] 库存加载失败:', e.message); }
}

// ════════════════════════════════════════════════════════
//  主渲染
// ════════════════════════════════════════════════════════
async function renderAnalytics() {
  const body = document.getElementById('analyticsBody');
  if (!body) return;
  await _anLoadInventory();

  const ordersLoaded = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders && SHOPIFY._orders.length > 0);
  if (!ordersLoaded) {
    body.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-tertiary);">
      <div style="font-size:34px;">📊</div><div>订单数据加载中… 请先打开「销售单」加载订单,再回来查看分析</div>
      <button class="btn primary" style="margin-top:12px;" onclick="renderAnalytics()">🔄 重试</button></div>`;
    return;
  }

  body.innerHTML = _anToolbar() + `<div id="analyticsContent" style="margin-top:14px;"></div>`;
  _anRenderContent();
}

function _anToolbar() {
  const rangeBtns = ANALYTICS_RANGES.map(r =>
    `<button class="an-range-btn${ANALYTICS._range === r.k ? ' active' : ''}" onclick="anSetRange('${r.k}')">${r.label}</button>`
  ).join('');
  const customInputs = ANALYTICS._range === 'custom' ? `
    <span style="display:inline-flex; gap:6px; align-items:center; margin-left:8px;">
      <input type="date" value="${ANALYTICS._customFrom}" onchange="ANALYTICS._customFrom=this.value; _anRenderContent();" style="padding:4px 8px; border:1px solid var(--border); border-radius:5px; font-size:12px;">
      <span style="color:var(--text-tertiary);">→</span>
      <input type="date" value="${ANALYTICS._customTo}" onchange="ANALYTICS._customTo=this.value; _anRenderContent();" style="padding:4px 8px; border:1px solid var(--border); border-radius:5px; font-size:12px;">
    </span>` : '';
  // 店铺下拉
  const shops = {};
  ((typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) ? SHOPIFY._orders : []).forEach(o => { if (o.shop_domain) shops[o.shop_domain] = (o.store_label || o.shop_domain); });
  const shopOpts = '<option value="">📍 全部店铺</option>' + Object.entries(shops).map(([d, l]) => `<option value="${escapeHtml(d)}" ${ANALYTICS._store === d ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');

  const views = [
    { k: 'restock', label: '📦 备货建议' },
    { k: 'ranking', label: '🏆 销量榜' },
    { k: 'trend',   label: '📈 销量波动' },
    { k: 'abc',     label: '🔤 ABC分类' },
    { k: 'stores',  label: '🏪 店铺对比' },
  ];
  const viewTabs = views.map(v => `<button class="an-view-tab${ANALYTICS._view === v.k ? ' active' : ''}" onclick="anSetView('${v.k}')">${v.label}</button>`).join('');

  return `
    <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:10px; padding:12px 14px;">
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <span style="font-size:12px; color:var(--text-secondary); font-weight:600; min-width:50px;">时间:</span>
        ${rangeBtns}${customInputs}
        <select onchange="ANALYTICS._store=this.value; _anRenderContent();" style="margin-left:auto; padding:5px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">${shopOpts}</select>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; border-top:1px solid var(--border-subtle); padding-top:10px;">${viewTabs}</div>
    </div>`;
}

function _anRenderContent() {
  // 重渲工具栏(范围/视图高亮)+ 内容
  const body = document.getElementById('analyticsBody');
  if (body && document.getElementById('analyticsContent')) {
    body.querySelector('div').outerHTML = _anToolbar();
  }
  const el = document.getElementById('analyticsContent');
  if (!el) { renderAnalytics(); return; }
  const v = ANALYTICS._view;
  if (v === 'restock') el.innerHTML = _anViewRestock();
  else if (v === 'ranking') el.innerHTML = _anViewRanking();
  else if (v === 'trend') el.innerHTML = _anViewTrend();
  else if (v === 'abc') el.innerHTML = _anViewABC();
  else if (v === 'stores') el.innerHTML = _anViewStores();
}

function anSetRange(k) { ANALYTICS._range = k; _anRenderContent(); }
function anSetView(v) { ANALYTICS._view = v; _anRenderContent(); }
window.anSetRange = anSetRange; window.anSetView = anSetView;
window.renderAnalytics = renderAnalytics; window._anRenderContent = _anRenderContent;

// 货币格式化(分币种)
function _anFmtCurr(byCurr) {
  const sym = { USD: '$', CNY: '¥', EUR: '€', GBP: '£', AUD: 'A$', AED: 'د.إ' };
  const entries = Object.entries(byCurr).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '0';
  return entries.map(([c, v]) => `${c} ${sym[c] || ''}${Math.round(v).toLocaleString('en-US')}`).join(' + ');
}

// ════════════════════════════════════════════════════════
//  视图1:备货建议(核心)
// ════════════════════════════════════════════════════════
function _anViewRestock() {
  const start = _anRangeStart(), end = _anRangeEnd();
  const days = Math.max(1, Math.round((end - start) / 86400000));
  const agg = _anAggBySku(start, end);
  const monthly = _anMonthlyBySku(6);   // 近6月算波动
  const monthlyMap = {};
  monthly.list.forEach(m => { monthlyMap[m.sku] = m; });

  // 给每个 SKU 算备货建议
  const rows = agg.filter(a => !a.sku.startsWith('(无SKU)')).map(a => {
    const inv = ANALYTICS._products[a.sku] || {};
    const stockTotal = Number(inv.stock_qty || 0);
    const stockOverseas = Number(inv.stock_qty_overseas || 0);
    const dailySales = a.qty / days;
    const daysOfStock = dailySales > 0 ? Math.round(stockTotal / dailySales) : (stockTotal > 0 ? 999 : 0);
    const m = monthlyMap[a.sku] || { cv: 99, trend: 0, trendPct: 0, mean: 0 };
    // 决策
    let advice, adviceColor, adviceIcon, suggestQty = 0, priority = 0;
    const stable = m.cv <= 0.4;          // 波动小=稳定
    const volatile = m.cv > 0.7;         // 波动大
    const declining = m.trendPct < -40;  // 大幅下滑
    if (a.qty === 0) {
      advice = '范围内无销量'; adviceColor = 'var(--text-tertiary)'; adviceIcon = '➖';
    } else if (volatile || declining) {
      advice = volatile ? '波动大 · 暂不建议备货' : '销量下滑 · 谨慎备货';
      adviceColor = '#dc2626'; adviceIcon = '⚠️'; priority = 1;
    } else if (stable && daysOfStock < 30) {
      // 稳定 + 库存不足30天 → 建议补货(补到约45天量)
      suggestQty = Math.max(0, Math.ceil(dailySales * 45 - stockTotal));
      advice = `稳定畅销 · 建议备 ${suggestQty} 件`;
      adviceColor = '#0f6e56'; adviceIcon = '✅'; priority = 3;
    } else if (stable) {
      advice = '稳定 · 库存充足'; adviceColor = '#1d6fa5'; adviceIcon = '👍'; priority = 2;
    } else {
      advice = '销量一般 · 按需备货'; adviceColor = 'var(--text-secondary)'; adviceIcon = '○';
    }
    return { ...a, inv, stockTotal, stockOverseas, dailySales, daysOfStock, cv: m.cv, trendPct: m.trendPct, advice, adviceColor, adviceIcon, suggestQty, priority };
  }).sort((a, b) => b.priority - a.priority || b.qty - a.qty);

  const recommend = rows.filter(r => r.suggestQty > 0);

  let html = `
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px;">
      ${_anStatCard('分析产品', rows.length + ' 个', 'var(--accent)')}
      ${_anStatCard('建议备货', recommend.length + ' 个', '#0f6e56')}
      ${_anStatCard('波动大/下滑', rows.filter(r => r.priority === 1).length + ' 个', '#dc2626')}
      ${_anStatCard('快断货(<7天)', rows.filter(r => r.daysOfStock > 0 && r.daysOfStock < 7).length + ' 个', '#f59e0b')}
    </div>
    <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:8px;">📊 基于近 ${days} 天销量 + 近6月波动 + 当前库存综合判断 · 契合「少批量多次备海外仓」策略(建议量按45天销量)</div>
    <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead><tr style="background:var(--bg-elevated); text-align:left;">
        <th style="padding:8px;">产品</th><th style="padding:8px;">范围销量</th><th style="padding:8px;">日均</th>
        <th style="padding:8px;">国内/海外库存</th><th style="padding:8px;">可卖天数</th><th style="padding:8px;">波动</th><th style="padding:8px;">趋势</th><th style="padding:8px;">备货建议</th>
      </tr></thead><tbody>`;
  rows.slice(0, 200).forEach(r => {
    const cvLabel = r.cv >= 99 ? '—' : (r.cv <= 0.4 ? `<span style="color:#0f6e56;">稳 ${r.cv.toFixed(2)}</span>` : r.cv > 0.7 ? `<span style="color:#dc2626;">大 ${r.cv.toFixed(2)}</span>` : `${r.cv.toFixed(2)}`);
    const trendLabel = r.trendPct > 10 ? `<span style="color:#0f6e56;">↗ +${Math.round(r.trendPct)}%</span>` : r.trendPct < -10 ? `<span style="color:#dc2626;">↘ ${Math.round(r.trendPct)}%</span>` : '→ 平';
    const doStock = r.daysOfStock === 999 ? '充足' : r.daysOfStock === 0 ? '无货' : `${r.daysOfStock}天`;
    const doColor = r.daysOfStock > 0 && r.daysOfStock < 7 ? '#dc2626' : r.daysOfStock < 30 ? '#f59e0b' : 'var(--text-secondary)';
    html += `<tr style="border-bottom:1px solid var(--border-subtle);">
      <td style="padding:7px 8px;"><div style="display:flex; align-items:center; gap:8px;">
        ${r.image ? `<img src="${escapeHtml(_anImg(r.image, '80x80'))}" style="width:34px;height:34px;object-fit:cover;border-radius:5px;">` : '<div style="width:34px;height:34px;background:var(--bg-elevated);border-radius:5px;"></div>'}
        <div><div style="font-weight:600; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.name)}</div><div style="font-family:monospace; font-size:10.5px; color:var(--text-tertiary);">${escapeHtml(r.sku)}</div></div>
      </div></td>
      <td style="padding:7px 8px; font-weight:700;">${r.qty}</td>
      <td style="padding:7px 8px;">${r.dailySales.toFixed(1)}/天</td>
      <td style="padding:7px 8px;">🏠${r.inv.stock_qty_domestic || 0} · ✈️${r.stockOverseas}</td>
      <td style="padding:7px 8px; color:${doColor}; font-weight:600;">${doStock}</td>
      <td style="padding:7px 8px;">${cvLabel}</td>
      <td style="padding:7px 8px;">${trendLabel}</td>
      <td style="padding:7px 8px; color:${r.adviceColor}; font-weight:600;">${r.adviceIcon} ${escapeHtml(r.advice)}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

// ════════════════════════════════════════════════════════
//  视图2:销量榜
// ════════════════════════════════════════════════════════
function _anViewRanking() {
  const start = _anRangeStart(), end = _anRangeEnd();
  const agg = _anAggBySku(start, end).sort((a, b) => b.qty - a.qty);
  // 分币种汇总营收
  const byCurr = {};
  agg.forEach(a => { byCurr[a.currency] = (byCurr[a.currency] || 0) + a.revenue; });
  const totalQty = agg.reduce((s, a) => s + a.qty, 0);

  let html = `
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">
      ${_anStatCard('动销产品', agg.length + ' 个', 'var(--accent)')}
      ${_anStatCard('总销量', totalQty + ' 件', '#0f6e56')}
      ${_anStatCard('总销售额', _anFmtCurr(byCurr), '#1d6fa5')}
    </div>
    <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead><tr style="background:var(--bg-elevated); text-align:left;">
        <th style="padding:8px;">#</th><th style="padding:8px;">产品</th><th style="padding:8px;">销量</th><th style="padding:8px;">销售额</th><th style="padding:8px;">订单数</th><th style="padding:8px;">在售店铺</th>
      </tr></thead><tbody>`;
  agg.slice(0, 200).forEach((a, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    html += `<tr style="border-bottom:1px solid var(--border-subtle);">
      <td style="padding:7px 8px; font-weight:700;">${medal}</td>
      <td style="padding:7px 8px;"><div style="display:flex; align-items:center; gap:8px;">
        ${a.image ? `<img src="${escapeHtml(_anImg(a.image, '80x80'))}" style="width:34px;height:34px;object-fit:cover;border-radius:5px;">` : '<div style="width:34px;height:34px;background:var(--bg-elevated);border-radius:5px;"></div>'}
        <div><div style="font-weight:600; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(a.name)}</div><div style="font-family:monospace; font-size:10.5px; color:var(--text-tertiary);">${escapeHtml(a.sku)}</div></div>
      </div></td>
      <td style="padding:7px 8px; font-weight:700; color:var(--accent);">${a.qty}</td>
      <td style="padding:7px 8px;">${a.currency} ${Math.round(a.revenue).toLocaleString('en-US')}</td>
      <td style="padding:7px 8px;">${a.orderCount}</td>
      <td style="padding:7px 8px;">${a.shopCount} 店</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

// ════════════════════════════════════════════════════════
//  视图3:销量波动(波状图)
// ════════════════════════════════════════════════════════
function _anViewTrend() {
  const { monthKeys, list } = _anMonthlyBySku(6);
  const top = list.slice(0, 40);   // 取销量前40画
  let html = `<div style="font-size:11px; color:var(--text-tertiary); margin-bottom:10px;">📈 近6个月每月销量波动 · 变异系数(CV)越小越稳定 · <span style="color:#0f6e56;">绿=稳定建议备货</span> · <span style="color:#dc2626;">红=波动大不建议</span></div>`;
  html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:12px;">`;
  top.forEach(s => {
    const max = Math.max(...s.series, 1);
    const stable = s.cv <= 0.4;
    const volatile = s.cv > 0.7;
    const badge = volatile ? '<span style="color:#dc2626; font-weight:600;">⚠️ 波动大</span>' : stable ? '<span style="color:#0f6e56; font-weight:600;">✅ 稳定</span>' : '<span style="color:var(--text-secondary);">○ 一般</span>';
    const barColor = volatile ? '#dc2626' : stable ? '#0f6e56' : '#f59e0b';
    // 迷你柱状图
    const bars = s.series.map((v, i) => {
      const h = Math.round(v / max * 56);
      return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;">
        <div style="font-size:9px; color:var(--text-tertiary);">${v}</div>
        <div style="width:100%; max-width:30px; height:${h}px; min-height:2px; background:${barColor}; border-radius:3px 3px 0 0;"></div>
        <div style="font-size:8.5px; color:var(--text-tertiary);">${monthKeys[i].slice(5)}</div>
      </div>`;
    }).join('');
    html += `<div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:10px; padding:12px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        ${s.image ? `<img src="${escapeHtml(_anImg(s.image, '80x80'))}" style="width:32px;height:32px;object-fit:cover;border-radius:5px;">` : ''}
        <div style="flex:1; min-width:0;"><div style="font-weight:600; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.name)}</div>
        <div style="font-family:monospace; font-size:10px; color:var(--text-tertiary);">${escapeHtml(s.sku)} · 共${s.total}件</div></div>
        <div style="font-size:11px; text-align:right;">${badge}<div style="font-size:10px; color:var(--text-tertiary);">CV ${s.cv >= 99 ? '—' : s.cv.toFixed(2)}</div></div>
      </div>
      <div style="display:flex; align-items:flex-end; gap:3px; height:80px;">${bars}</div>
    </div>`;
  });
  html += `</div>`;
  return html;
}

// ════════════════════════════════════════════════════════
//  视图4:ABC 分类
// ════════════════════════════════════════════════════════
function _anViewABC() {
  const start = _anRangeStart(), end = _anRangeEnd();
  const agg = _anAggBySku(start, end).sort((a, b) => b.revenue - a.revenue);
  const totalRev = agg.reduce((s, a) => s + a.revenue, 0) || 1;
  let cum = 0;
  agg.forEach(a => { cum += a.revenue; a.cumPct = cum / totalRev * 100; a.cls = a.cumPct <= 80 ? 'A' : a.cumPct <= 95 ? 'B' : 'C'; });
  const aCnt = agg.filter(x => x.cls === 'A').length, bCnt = agg.filter(x => x.cls === 'B').length, cCnt = agg.filter(x => x.cls === 'C').length;
  const clsColor = { A: '#0f6e56', B: '#1d6fa5', C: 'var(--text-tertiary)' };

  let html = `
    <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:10px;">🔤 ABC分类(按销售额贡献):A=贡献前80%核心品(重点备货) · B=80-95%(适量) · C=尾部(按需,别囤)</div>
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;">
      ${_anStatCard('A类(核心)', aCnt + ' 个', clsColor.A)}
      ${_anStatCard('B类', bCnt + ' 个', clsColor.B)}
      ${_anStatCard('C类(长尾)', cCnt + ' 个', clsColor.C)}
    </div>
    <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead><tr style="background:var(--bg-elevated); text-align:left;">
        <th style="padding:8px;">类</th><th style="padding:8px;">产品</th><th style="padding:8px;">销售额</th><th style="padding:8px;">累计占比</th><th style="padding:8px;">销量</th>
      </tr></thead><tbody>`;
  agg.slice(0, 200).forEach(a => {
    html += `<tr style="border-bottom:1px solid var(--border-subtle);">
      <td style="padding:7px 8px;"><span style="display:inline-block; width:22px; height:22px; line-height:22px; text-align:center; border-radius:50%; background:${clsColor[a.cls]}; color:white; font-weight:700; font-size:11px;">${a.cls}</span></td>
      <td style="padding:7px 8px;"><div style="font-weight:600; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(a.name)}</div><div style="font-family:monospace; font-size:10.5px; color:var(--text-tertiary);">${escapeHtml(a.sku)}</div></td>
      <td style="padding:7px 8px;">${a.currency} ${Math.round(a.revenue).toLocaleString('en-US')}</td>
      <td style="padding:7px 8px;">${a.cumPct.toFixed(1)}%</td>
      <td style="padding:7px 8px;">${a.qty}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

// ════════════════════════════════════════════════════════
//  视图5:店铺对比
// ════════════════════════════════════════════════════════
function _anViewStores() {
  const start = _anRangeStart(), end = _anRangeEnd();
  const orders = _anValidOrders(start, end);
  const byShop = {};
  orders.forEach(o => {
    const k = o.shop_domain || '(未知)';
    if (!byShop[k]) byShop[k] = { shop: k, label: o.store_label || k, orders: 0, qty: 0, byCurr: {} };
    byShop[k].orders++;
    byShop[k].byCurr[o.currency || 'USD'] = (byShop[k].byCurr[o.currency || 'USD'] || 0) + Number(o.total_price || 0);
    (o.line_items || []).forEach(li => { if (!_anIsNoise(li)) byShop[k].qty += Number(li.quantity || 0); });
  });
  const list = Object.values(byShop).sort((a, b) => b.orders - a.orders);
  let html = `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px;">
    <thead><tr style="background:var(--bg-elevated); text-align:left;">
      <th style="padding:8px;">店铺</th><th style="padding:8px;">订单数</th><th style="padding:8px;">销量</th><th style="padding:8px;">销售额</th>
    </tr></thead><tbody>`;
  list.forEach(s => {
    html += `<tr style="border-bottom:1px solid var(--border-subtle);">
      <td style="padding:7px 8px; font-weight:600;">${escapeHtml(s.label)}</td>
      <td style="padding:7px 8px; font-weight:700; color:var(--accent);">${s.orders}</td>
      <td style="padding:7px 8px;">${s.qty} 件</td>
      <td style="padding:7px 8px;">${_anFmtCurr(s.byCurr)}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

// ── 工具 ──
function _anStatCard(label, value, color) {
  return `<div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:10px; padding:12px 14px;">
    <div style="font-size:11px; color:var(--text-tertiary);">${label}</div>
    <div style="font-size:18px; font-weight:700; color:${color}; margin-top:2px; font-family:'JetBrains Mono',monospace;">${value}</div>
  </div>`;
}
function _anImg(url, size) {
  if (!url || typeof url !== 'string') return url;
  if (!/cdn\.shopify\.com|\/cdn\/shop\//i.test(url)) return url;
  try {
    const [base, query] = url.split('?');
    const cleaned = base.replace(/_(\d+x\d+|\d+x|x\d+)(?=\.\w+$)/i, '');
    const resized = cleaned.replace(/(\.\w+)$/i, `_${size}$1`);
    return query ? `${resized}?${query}` : resized;
  } catch (e) { return url; }
}
