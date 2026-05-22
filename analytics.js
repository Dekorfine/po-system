// ============================================================
// 跟单团队工作台 · analytics.js
// 数据分析（仅主管可见）· 综合 / 店铺业绩 / SKU / 趋势 / 客户
// ============================================================
// 依赖：core.js + shopify_orders 表查询
// ============================================================

// ============ 📈 数据分析模块（仅主管） ============
const ANALYTICS_STATE = {
  period: 30,           // 时间范围（天）
  subtab: 'summary',    // 当前子 tab
  startDate: null,
  endDate: null,
};

function analyticsShowSubtab(sub) {
  ANALYTICS_STATE.subtab = sub;
  document.querySelectorAll('.sub-tab-btn[data-analytics]').forEach(b => b.classList.toggle('active', b.dataset.analytics === sub));
  renderAnalytics();
}

function analyticsChangePeriod() {
  const val = document.getElementById('analyticsPeriod')?.value || '30';
  ANALYTICS_STATE.period = val === 'all' ? 99999 : parseInt(val);
  renderAnalytics();
}

// 应用时间筛选返回符合条件的订单
function _analyticsGetFilteredOrders() {
  const days = ANALYTICS_STATE.period;
  const now = Date.now();
  const cutoff = now - days * 86400000;
  const orders = (SHOPIFY._orders || []).filter(o => {
    if (o.local_status === 'cancelled') return false;  // 排除已取消
    const ts = new Date(o.shopify_created_at || o.created_at || 0).getTime();
    return ts >= cutoff;
  });
  ANALYTICS_STATE.startDate = days >= 99999 ? '全部' : new Date(cutoff).toISOString().slice(0, 10);
  ANALYTICS_STATE.endDate = new Date(now).toISOString().slice(0, 10);
  return orders;
}

function renderAnalytics() {
  if (!IS_ADMIN) {
    document.getElementById('analyticsBody').innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-tertiary);">⛔ 仅主管可见</div>';
    return;
  }
  // 数据未加载提示
  if (!SHOPIFY._orders || SHOPIFY._orders.length === 0) {
    document.getElementById('analyticsBody').innerHTML = `
      <div style="padding:60px 20px; text-align:center; color:var(--text-tertiary);">
        <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
        <div style="font-size: 14px; margin-bottom: 8px;">还没有订单数据</div>
        <div style="font-size: 12px;">请先到 <a href="javascript:void(0)" onclick="switchTab('sales')" style="color: var(--accent); text-decoration: underline;">销售单 tab</a> 选店铺 + 时间，点 🔄 同步从 Shopify 拉取订单</div>
      </div>`;
    const hintEl = document.getElementById('analyticsRangeHint');
    if (hintEl) hintEl.textContent = '';
    return;
  }
  const orders = _analyticsGetFilteredOrders();
  const hintEl = document.getElementById('analyticsRangeHint');
  if (hintEl) hintEl.textContent = `${ANALYTICS_STATE.startDate} → ${ANALYTICS_STATE.endDate} · 共 ${orders.length} 个订单`;

  switch (ANALYTICS_STATE.subtab) {
    case 'summary': _renderAnalyticsSummary(orders); break;
    case 'shop': _renderAnalyticsShop(orders); break;
    case 'sku': _renderAnalyticsSku(orders); break;
    case 'trend': _renderAnalyticsTrend(orders); break;
    case 'country': _renderAnalyticsCountry(orders); break;
    case 'customer': _renderAnalyticsCustomer(orders); break;
  }
}

// === 1. 综合汇总（顶部 6 个数字卡 + 趋势）===
function _renderAnalyticsSummary(orders) {
  const totalOrders = orders.length;
  const customerSet = new Set();
  let totalRevenue = 0, refundedAmt = 0;
  let refundedCount = 0, partialRefundedCount = 0;
  let totalQty = 0;
  orders.forEach(o => {
    if (o.customer_email) customerSet.add(o.customer_email);
    else if (o.customer_name) customerSet.add(o.customer_name);
    const amt = Number(o.total_price || 0);
    totalRevenue += amt;
    const fs = (o.financial_status || '').toLowerCase();
    if (fs === 'refunded') { refundedCount++; refundedAmt += amt; }
    else if (fs === 'partially_refunded') { partialRefundedCount++; refundedAmt += amt * 0.3; }  // 估算
    (o.line_items || []).forEach(li => { totalQty += Number(li.quantity) || 0; });
  });
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const refundRate = totalOrders > 0 ? ((refundedCount + partialRefundedCount) / totalOrders) * 100 : 0;

  const body = document.getElementById('analyticsBody');
  body.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
      ${_metric('客户数', totalOrders > 0 ? customerSet.size.toLocaleString() : '0', '👥', 'var(--accent)')}
      ${_metric('订单量', totalOrders.toLocaleString(), '📦', 'var(--accent)')}
      ${_metric('总销售额', '$' + totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 }), '💰', 'var(--success)')}
      ${_metric('客单价', '$' + avgOrder.toLocaleString('en-US', { maximumFractionDigits: 2 }), '📊', 'var(--purple)')}
      ${_metric('总件数', totalQty.toLocaleString(), '🏷', 'var(--teal)')}
      ${_metric('退款金额', '$' + refundedAmt.toLocaleString('en-US', { maximumFractionDigits: 2 }), '💸', 'var(--danger)')}
      ${_metric('退款单数', refundedCount + partialRefundedCount + '', '⊘', 'var(--danger)')}
      ${_metric('退款率', refundRate.toFixed(1) + '%', '📉', refundRate > 5 ? 'var(--danger)' : 'var(--warning)')}
    </div>
    <div style="margin-top: 20px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;">
      <h4 style="margin: 0 0 12px; font-size: 14px; color: var(--text-primary);">📊 按日订单数（最近 ${Math.min(ANALYTICS_STATE.period, 30)} 天）</h4>
      ${_renderDailyBarChart(orders, Math.min(ANALYTICS_STATE.period, 30))}
    </div>
  `;
}

function _metric(label, val, icon, color) {
  return `
    <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span style="font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase;">${label}</span>
        <span style="font-size: 18px; opacity: 0.5;">${icon}</span>
      </div>
      <div style="font-size: 24px; font-weight: 700; color: ${color}; font-family: monospace;">${val}</div>
    </div>`;
}

// 简易柱状图（用 div 高度）
function _renderDailyBarChart(orders, days) {
  const byDate = {};
  orders.forEach(o => {
    const d = (o.shopify_created_at || '').slice(0, 10);
    if (!d) return;
    byDate[d] = (byDate[d] || 0) + 1;
  });
  // 生成最近 N 天
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  const counts = dates.map(d => byDate[d] || 0);
  const max = Math.max(1, ...counts);
  return `
    <div style="display: flex; align-items: flex-end; gap: 2px; height: 140px; padding: 0 4px;">
      ${dates.map((d, i) => `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0;" title="${d}: ${counts[i]} 单">
          <div style="font-size: 9px; color: var(--text-secondary); margin-bottom: 2px;">${counts[i] || ''}</div>
          <div style="width: 100%; height: ${(counts[i] / max) * 100}%; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 1px;"></div>
        </div>
      `).join('')}
    </div>
    <div style="display: flex; gap: 2px; padding: 4px; font-size: 9px; color: var(--text-tertiary);">
      ${dates.map((d, i) => `<div style="flex:1; text-align:center; overflow:hidden; transform: rotate(-45deg); white-space:nowrap; transform-origin: center;">${d.slice(5)}</div>`).join('')}
    </div>`;
}

// === 2. 店铺业绩 ===
function _renderAnalyticsShop(orders) {
  const byShop = {};
  orders.forEach(o => {
    const d = o.shop_domain || 'unknown';
    if (!byShop[d]) byShop[d] = { domain: d, code: SHOPIFY.siteCodeOf(d) || d, orderCount: 0, customerSet: new Set(), revenue: 0, refunded: 0, qty: 0 };
    byShop[d].orderCount++;
    if (o.customer_email) byShop[d].customerSet.add(o.customer_email);
    const amt = Number(o.total_price || 0);
    byShop[d].revenue += amt;
    const fs = (o.financial_status || '').toLowerCase();
    if (fs === 'refunded') byShop[d].refunded += amt;
    (o.line_items || []).forEach(li => { byShop[d].qty += Number(li.quantity) || 0; });
  });
  const rows = Object.values(byShop).sort((a, b) => b.revenue - a.revenue);

  const body = document.getElementById('analyticsBody');
  body.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>店铺</th><th style="text-align:right;">订单数</th><th style="text-align:right;">客户数</th>
        <th style="text-align:right;">总销售</th><th style="text-align:right;">客单价</th>
        <th style="text-align:right;">总件数</th><th style="text-align:right;">退款金额</th>
        <th style="text-align:right;">占比</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td><span style="background: var(--accent); color: white; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; font-family: monospace; margin-right: 6px;">${escapeHtml(r.code)}</span><span style="color: var(--text-tertiary); font-size: 11px;">${escapeHtml(r.domain)}</span></td>
          <td style="text-align:right; font-family:monospace;">${r.orderCount}</td>
          <td style="text-align:right; font-family:monospace;">${r.customerSet.size}</td>
          <td style="text-align:right; font-family:monospace; font-weight:700; color: var(--success);">$${r.revenue.toLocaleString('en-US', {maximumFractionDigits: 2})}</td>
          <td style="text-align:right; font-family:monospace;">$${(r.orderCount > 0 ? r.revenue / r.orderCount : 0).toFixed(2)}</td>
          <td style="text-align:right; font-family:monospace;">${r.qty}</td>
          <td style="text-align:right; font-family:monospace; color: ${r.refunded > 0 ? 'var(--danger)' : 'var(--text-tertiary)'};">$${r.refunded.toFixed(2)}</td>
          <td style="text-align:right; font-family:monospace;">${(orders.length > 0 ? (r.orderCount / orders.length * 100) : 0).toFixed(1)}%</td>
        </tr>`).join('')}
        ${rows.length === 0 ? '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-tertiary);">无数据</td></tr>' : ''}
      </tbody>
    </table>
  `;
}

// === 3. SKU 销量 ===
function _renderAnalyticsSku(orders) {
  const bySku = {};
  orders.forEach(o => {
    (o.line_items || []).forEach(li => {
      const sku = (li.sku || '').trim() || '(无 SKU)';
      if (!bySku[sku]) bySku[sku] = { sku, title: li.title || '', image_url: li.image_url || '', orderCount: 0, qty: 0, revenue: 0 };
      bySku[sku].orderCount++;
      bySku[sku].qty += Number(li.quantity) || 0;
      bySku[sku].revenue += (Number(li.price) || 0) * (Number(li.quantity) || 0);
    });
  });
  const rows = Object.values(bySku).sort((a, b) => b.qty - a.qty);

  const body = document.getElementById('analyticsBody');
  body.innerHTML = `
    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">共 ${rows.length} 个 SKU · 按销量降序</div>
    <table class="data-table">
      <thead><tr>
        <th style="width:60px;">图</th><th>SKU / 产品名</th>
        <th style="text-align:right;">订单数</th><th style="text-align:right;">销售件数</th>
        <th style="text-align:right;">销售额(USD)</th><th style="text-align:right;">平均单价</th>
      </tr></thead>
      <tbody>
        ${rows.slice(0, 200).map((r, i) => `<tr>
          <td>${r.image_url ? `<img loading="lazy" src="${escapeHtml(r.image_url)}" style="width:48px; height:48px; object-fit:cover; border-radius:4px; cursor:zoom-in;" onclick="openImgLightbox('${escapeHtml(r.image_url)}')">` : '<div style="width:48px; height:48px; background:var(--bg-elevated); border-radius:4px; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary);">📷</div>'}</td>
          <td><div style="font-weight:600;">${escapeHtml(r.title)}</div><div style="font-size:10px; color:var(--text-tertiary); font-family:monospace;">${escapeHtml(r.sku)}</div></td>
          <td style="text-align:right; font-family:monospace;">${r.orderCount}</td>
          <td style="text-align:right; font-family:monospace; font-weight:700; color: var(--accent);">${r.qty}</td>
          <td style="text-align:right; font-family:monospace; color: var(--success);">$${r.revenue.toFixed(2)}</td>
          <td style="text-align:right; font-family:monospace;">$${(r.qty > 0 ? r.revenue / r.qty : 0).toFixed(2)}</td>
        </tr>`).join('')}
        ${rows.length > 200 ? `<tr><td colspan="6" style="text-align:center; padding:8px; color:var(--text-tertiary); font-size:11px;">仅显示前 200 个，导出可看全部</td></tr>` : ''}
        ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-tertiary);">无数据</td></tr>' : ''}
      </tbody>
    </table>
  `;
}

// === 4. 订单趋势（按日） ===
function _renderAnalyticsTrend(orders) {
  const byDate = {};
  orders.forEach(o => {
    const d = (o.shopify_created_at || '').slice(0, 10);
    if (!d) return;
    if (!byDate[d]) byDate[d] = { date: d, count: 0, revenue: 0, refunded: 0, qty: 0 };
    byDate[d].count++;
    byDate[d].revenue += Number(o.total_price || 0);
    if ((o.financial_status || '').toLowerCase().includes('refunded')) byDate[d].refunded++;
    (o.line_items || []).forEach(li => byDate[d].qty += Number(li.quantity) || 0);
  });
  const rows = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  const maxRev = Math.max(1, ...rows.map(r => r.revenue));

  const body = document.getElementById('analyticsBody');
  body.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>日期</th>
        <th style="text-align:right;">订单数</th>
        <th style="text-align:right;">总件数</th>
        <th style="text-align:right;">销售额</th>
        <th>销售额可视化</th>
        <th style="text-align:right;">退款单数</th>
        <th style="text-align:right;">客单价</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td style="font-family:monospace; font-weight:600;">${r.date}</td>
          <td style="text-align:right; font-family:monospace;">${r.count}</td>
          <td style="text-align:right; font-family:monospace;">${r.qty}</td>
          <td style="text-align:right; font-family:monospace; color: var(--success); font-weight:700;">$${r.revenue.toFixed(2)}</td>
          <td><div style="background: var(--bg-elevated); border-radius: 3px; height: 16px; position: relative; min-width: 100px;">
            <div style="background: var(--accent); height: 100%; width: ${(r.revenue / maxRev * 100).toFixed(1)}%; border-radius: 3px;"></div>
          </div></td>
          <td style="text-align:right; font-family:monospace; color: ${r.refunded > 0 ? 'var(--danger)' : 'var(--text-tertiary)'};">${r.refunded}</td>
          <td style="text-align:right; font-family:monospace;">$${(r.count > 0 ? r.revenue / r.count : 0).toFixed(2)}</td>
        </tr>`).join('')}
        ${rows.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-tertiary);">无数据</td></tr>' : ''}
      </tbody>
    </table>
  `;
}

// === 5. 客户分布（按国家） ===
function _renderAnalyticsCountry(orders) {
  const byCountry = {};
  orders.forEach(o => {
    const cc = (o.shipping_address?.country_code || '').toUpperCase() || '未知';
    const cn = o.shipping_address?.country || cc;
    if (!byCountry[cc]) byCountry[cc] = { code: cc, name: cn, orderCount: 0, customerSet: new Set(), revenue: 0 };
    byCountry[cc].orderCount++;
    if (o.customer_email) byCountry[cc].customerSet.add(o.customer_email);
    byCountry[cc].revenue += Number(o.total_price || 0);
  });
  const rows = Object.values(byCountry).sort((a, b) => b.revenue - a.revenue);
  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);

  const body = document.getElementById('analyticsBody');
  body.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>国家</th>
        <th style="text-align:right;">订单数</th>
        <th style="text-align:right;">客户数</th>
        <th style="text-align:right;">销售额</th>
        <th>占比</th>
        <th style="text-align:right;">客单价</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
          const pct = totalRev > 0 ? r.revenue / totalRev * 100 : 0;
          return `<tr>
            <td><span style="font-family:monospace; font-weight:700; font-size:13px;">${escapeHtml(r.code)}</span> <span style="color:var(--text-tertiary); font-size:11px;">${escapeHtml(r.name)}</span></td>
            <td style="text-align:right; font-family:monospace;">${r.orderCount}</td>
            <td style="text-align:right; font-family:monospace;">${r.customerSet.size}</td>
            <td style="text-align:right; font-family:monospace; color: var(--success); font-weight:700;">$${r.revenue.toFixed(2)}</td>
            <td><div style="background: var(--bg-elevated); border-radius: 3px; height: 16px; position: relative; min-width: 100px;">
              <div style="background: var(--accent); height: 100%; width: ${pct.toFixed(1)}%; border-radius: 3px;"></div>
            </div><span style="font-size: 10px; color: var(--text-tertiary);">${pct.toFixed(1)}%</span></td>
            <td style="text-align:right; font-family:monospace;">$${(r.orderCount > 0 ? r.revenue / r.orderCount : 0).toFixed(2)}</td>
          </tr>`;
        }).join('')}
        ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-tertiary);">无数据</td></tr>' : ''}
      </tbody>
    </table>
  `;
}

// === 6. 客户排行 ===
function _renderAnalyticsCustomer(orders) {
  const byCustomer = {};
  orders.forEach(o => {
    const key = o.customer_email || o.customer_name || '匿名';
    if (!byCustomer[key]) byCustomer[key] = { 
      key, name: o.customer_name || '', email: o.customer_email || '', 
      country: o.shipping_address?.country_code || '',
      orderCount: 0, revenue: 0, qty: 0 
    };
    byCustomer[key].orderCount++;
    byCustomer[key].revenue += Number(o.total_price || 0);
    (o.line_items || []).forEach(li => byCustomer[key].qty += Number(li.quantity) || 0);
  });
  const rows = Object.values(byCustomer).sort((a, b) => b.revenue - a.revenue);

  const body = document.getElementById('analyticsBody');
  body.innerHTML = `
    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">共 ${rows.length} 个客户 · 按消费金额降序</div>
    <table class="data-table">
      <thead><tr>
        <th style="width:40px;">#</th>
        <th>客户</th><th>邮箱</th><th>国家</th>
        <th style="text-align:right;">订单数</th><th style="text-align:right;">总件数</th>
        <th style="text-align:right;">总消费</th><th style="text-align:right;">客单价</th>
      </tr></thead>
      <tbody>
        ${rows.slice(0, 200).map((r, i) => `<tr>
          <td style="font-family:monospace; color:var(--text-tertiary);">${i + 1}</td>
          <td style="font-weight:600;">${escapeHtml(r.name)}</td>
          <td style="font-size:11px; color: var(--text-tertiary); font-family:monospace;">${escapeHtml(r.email)}</td>
          <td style="font-family:monospace;">${escapeHtml(r.country)}</td>
          <td style="text-align:right; font-family:monospace;">${r.orderCount}</td>
          <td style="text-align:right; font-family:monospace;">${r.qty}</td>
          <td style="text-align:right; font-family:monospace; color: var(--success); font-weight:700;">$${r.revenue.toFixed(2)}</td>
          <td style="text-align:right; font-family:monospace;">$${(r.orderCount > 0 ? r.revenue / r.orderCount : 0).toFixed(2)}</td>
        </tr>`).join('')}
        ${rows.length > 200 ? `<tr><td colspan="8" style="text-align:center; padding:8px; color:var(--text-tertiary); font-size:11px;">仅显示前 200 个，导出可看全部</td></tr>` : ''}
        ${rows.length === 0 ? '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-tertiary);">无数据</td></tr>' : ''}
      </tbody>
    </table>
  `;
}

// === 导出当前子 tab ===
function analyticsExportCurrent() {
  const orders = _analyticsGetFilteredOrders();
  const sub = ANALYTICS_STATE.subtab;
  const today = new Date().toISOString().slice(0, 10);
  const labelMap = { summary: '综合汇总', shop: '店铺业绩', sku: 'SKU 销量', trend: '订单趋势', country: '客户分布', customer: '客户排行' };
  const title = `数据分析 - ${labelMap[sub]} - ${ANALYTICS_STATE.startDate}~${ANALYTICS_STATE.endDate}`;
  
  // 把当前 body 的表格 + meta 信息组合成导出 HTML
  // 移除 onclick 等事件处理器（在新窗口里不存在这些函数）
  const bodyHtml = document.getElementById('analyticsBody').innerHTML
    .replace(/\s*onclick="[^"]*"/g, '')
    .replace(/\s*onmouseenter="[^"]*"/g, '')
    .replace(/\s*onmouseleave="[^"]*"/g, '')
    .replace(/cursor:\s*zoom-in/g, 'cursor:default');
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; padding: 20px; color: #1c1917; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #78716c; font-size: 12px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  thead { background: #f5f5f4; }
  th, td { border: 1px solid #d6d3d1; padding: 6px 8px; vertical-align: middle; text-align: left; }
  th { font-weight: 600; font-size: 11px; text-transform: uppercase; }
  img { display:block; width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }
  .actions { margin: 14px 0; }
  .actions button { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 8px; }
  @media print { .actions { display: none; } body { padding: 8px; } table { font-size: 10px; } img { width: 36px; height: 36px; } }
</style></head><body>
<h1>📈 ${labelMap[sub]}</h1>
<div class="meta">导出日期：${today} · 时间范围：${ANALYTICS_STATE.startDate} → ${ANALYTICS_STATE.endDate} · 订单数：${orders.length}</div>
<div class="actions">
  <button onclick="window.print()">🖨 打印 / 保存为 PDF</button>
  <button onclick="(()=>{const t=document.querySelector('table'); if(t) navigator.clipboard.writeText(t.outerHTML).then(()=>alert('已复制 HTML，可粘贴到 Excel/Word'));})()">📋 复制表格</button>
</div>
${bodyHtml}
<div style="margin-top: 16px; font-size: 11px; color: #78716c; text-align: right;">跟单团队工作台 · ${labelMap[sub]}</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('浏览器阻止了新窗口，请允许弹窗', 'err'); return; }
  win.document.write(html);
  win.document.close();
  toast(`✓ ${labelMap[sub]} 已导出`);
}

function renderPerformance() {
  const period = document.getElementById('perfPeriod').value;
  const range = getPeriodRange(period);
  document.getElementById('perfPeriodLabel').textContent = `(${range.start.slice(5)} ~ ${range.end.slice(5)})`;
  document.getElementById('perfMode').textContent = IS_ADMIN ? '👑 主管视角 · 查看所有跟单员' : `查看 ${CURRENT_AGENT} 的成绩`;
  
  // 计算所有 agent 的得分
  const allAgents = CONFIG.agents.filter(a => !a.isAdmin);  // 主管不参与排名
  const scores = allAgents.map(a => calcAgentScore(a.name, range)).sort((a, b) => b.total - a.total);
  
  // 顶部统计：主管显示团队总分，跟单员显示自己的分
  const myScore = scores.find(s => s.agent === CURRENT_AGENT);
  if (IS_ADMIN) {
    const teamTotal = scores.reduce((s, x) => s + x.total, 0);
    const teamMissing = scores.reduce((s, x) => s + x.scoreMissing, 0);
    const teamOrders = scores.reduce((s, x) => s + x.scoreOrders, 0);
    const teamAfter = scores.reduce((s, x) => s + x.scoreAfter, 0);
    const teamIssues = scores.reduce((s, x) => s + x.scoreIssues, 0);
    document.getElementById('pTotal').textContent = teamTotal;
    document.getElementById('pTotalSub').textContent = `团队总分 · ${scores.length} 人`;
    document.getElementById('pMissing').textContent = teamMissing;
    document.getElementById('pMissingSub').textContent = `团队帮人找到`;
    document.getElementById('pOrders').textContent = teamOrders;
    document.getElementById('pAfter').textContent = teamAfter;
    document.getElementById('pIssues').textContent = teamIssues;
  } else if (myScore) {
    document.getElementById('pTotal').textContent = myScore.total;
    const myRank = scores.findIndex(s => s.agent === CURRENT_AGENT) + 1;
    document.getElementById('pTotalSub').textContent = `排名 ${myRank} / ${scores.length}`;
    document.getElementById('pMissing').textContent = myScore.scoreMissing;
    document.getElementById('pMissingSub').textContent = `${myScore.detail.missingHelps.length} 次帮人找到`;
    document.getElementById('pOrders').textContent = myScore.scoreOrders;
    document.getElementById('pOrdersSub').textContent = `按时${myScore.detail.orderOnTime}/逾期${myScore.detail.orderOverdue}`;
    document.getElementById('pAfter').textContent = myScore.scoreAfter;
    document.getElementById('pAfterSub').textContent = `解决 ${myScore.detail.afterResolved} 单`;
    document.getElementById('pIssues').textContent = myScore.scoreIssues;
    document.getElementById('pIssuesSub').textContent = `解决${myScore.detail.issueResolved}/升级${myScore.detail.issueEscalated}`;
  } else {
    ['pTotal','pMissing','pOrders','pAfter','pIssues'].forEach(id => document.getElementById(id).textContent = 0);
  }
  
  // 排行榜
  const lb = document.getElementById('perfLeaderboard');
  if (scores.length === 0) {
    lb.innerHTML = '';
  } else {
    lb.innerHTML = `
      <div class="leaderboard-card">
        <h3>🏆 团队排行榜<span style="font-size:11px;color:var(--text-tertiary);font-weight:500;">${range.label}</span></h3>
        <div class="lb-row lb-head">
          <div class="lb-rank">名次</div>
          <div>跟单员</div>
          <div class="lb-score">总分</div>
          <div class="lb-score">🔍 找灯</div>
          <div class="lb-score">📋 催单</div>
          <div class="lb-score">🔧 售后</div>
          <div class="lb-score">⚠ 问题</div>
        </div>
        ${scores.map((s, i) => {
          const rank = i + 1;
          const isMe = s.agent === CURRENT_AGENT;
          let rankCls = 'r-other', rankTxt = `#${rank}`;
          if (rank === 1) { rankCls = 'r1'; rankTxt = '🥇'; }
          else if (rank === 2) { rankCls = 'r2'; rankTxt = '🥈'; }
          else if (rank === 3) { rankCls = 'r3'; rankTxt = '🥉'; }
          return `
            <div class="lb-row ${isMe ? 'me' : ''}">
              <div class="lb-rank ${rankCls}">${rankTxt}</div>
              <div class="lb-name">
                <span class="avatar c${i % 4}">${s.agent[0].toUpperCase()}</span>
                ${escapeHtml(s.agent)}${isMe ? ' (我)' : ''}
              </div>
              <div class="lb-score total">${s.total}</div>
              <div class="lb-score detail ${s.scoreMissing > 0 ? 'positive' : ''}">${s.scoreMissing}</div>
              <div class="lb-score detail ${s.scoreOrders > 0 ? 'positive' : s.scoreOrders < 0 ? 'negative' : ''}">${s.scoreOrders}</div>
              <div class="lb-score detail ${s.scoreAfter > 0 ? 'positive' : ''}">${s.scoreAfter}</div>
              <div class="lb-score detail ${s.scoreIssues > 0 ? 'positive' : ''}">${s.scoreIssues}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  // 我的找灯贡献明细（只显示当前用户的）
  const contributions = myScore ? myScore.detail.missingHelps : [];
  const md = document.getElementById('perfMissingDetail');
  if (contributions.length > 0 && !IS_ADMIN) {
    md.innerHTML = `
      <div class="leaderboard-card">
        <h3>🌟 我帮人找到的灯（${range.label}）<span style="font-size:11px;color:var(--success);font-weight:600;">+${contributions.length * SCORE_RULES.missingHelp} 分</span></h3>
        <div class="contribution-list" style="padding: 14px;">
          ${contributions.map(m => {
            const cover = (m.screenshots && m.screenshots.length > 0) ? m.screenshots[0] : null;
            return `
              <div class="contribution-item" onclick="switchTab('missing'); setTimeout(() => openMissingModal('${m._id}'), 200);" style="cursor: pointer;">
                ${cover ? `<img src="${cover}" class="img-thumb">` : '<div class="img-thumb">💡</div>'}
                <div class="info">
                  <div class="title">${escapeHtml((m.description || '(无描述)').slice(0, 40))}</div>
                  <div class="desc">发起人 ${escapeHtml(m.creator)} · 完成于 ${(m.foundAt || '').slice(0, 10)}</div>
                </div>
                <div class="gain">+${SCORE_RULES.missingHelp}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    md.innerHTML = '';
  }
}

// 评分规则配置
function openScoreRules() {
  document.getElementById('ruleMissingHelp').value = SCORE_RULES.missingHelp;
  document.getElementById('ruleOrderOnTime').value = SCORE_RULES.orderOnTime;
  document.getElementById('ruleOrderOverdue').value = SCORE_RULES.orderOverdue;
  document.getElementById('ruleOrderDelivered').value = SCORE_RULES.orderDelivered;
  document.getElementById('ruleAfterResolved').value = SCORE_RULES.afterResolved;
  document.getElementById('ruleAfterFast').value = SCORE_RULES.afterFast;
  document.getElementById('ruleIssueResolved').value = SCORE_RULES.issueResolved;
  document.getElementById('ruleIssueEscalated').value = SCORE_RULES.issueEscalated;
  document.getElementById('scoreRulesModal').classList.add('show');
}

function saveScoreRules() {
  SCORE_RULES = {
    missingHelp: +document.getElementById('ruleMissingHelp').value || 0,
    orderOnTime: +document.getElementById('ruleOrderOnTime').value || 0,
    orderOverdue: +document.getElementById('ruleOrderOverdue').value || 0,
    orderDelivered: +document.getElementById('ruleOrderDelivered').value || 0,
    afterResolved: +document.getElementById('ruleAfterResolved').value || 0,
    afterFast: +document.getElementById('ruleAfterFast').value || 0,
    issueResolved: +document.getElementById('ruleIssueResolved').value || 0,
    issueEscalated: +document.getElementById('ruleIssueEscalated').value || 0,
  };
  DATA.saveScoreRules(SCORE_RULES);
  closeModal('scoreRulesModal');
  renderPerformance();
  toast('✓ 评分规则已保存，已重新计算');
}

function resetScoreRules() {
  if (!confirm('恢复默认评分规则？')) return;
  SCORE_RULES = DATA.defaultScoreRules();
  DATA.saveScoreRules(SCORE_RULES);
  openScoreRules();
  toast('已恢复默认');
}

function exportPerformance() {
  const period = document.getElementById('perfPeriod').value;
  const range = getPeriodRange(period);
  const scores = CONFIG.agents.filter(a => !a.isAdmin).map(a => calcAgentScore(a.name, range)).sort((a, b) => b.total - a.total);
  if (scores.length === 0) { toast('没有数据', 'err'); return; }
  const headers = ['排名','跟单员','总分','找灯贡献','催单效率','售后解决','推动改善','找灯采纳次数','按时发货','逾期发货','已交付','售后解决数','7天内快速解决','问题解决数','升级老板数'];
  const rows = scores.map((s, i) => [
    i + 1, s.agent, s.total, s.scoreMissing, s.scoreOrders, s.scoreAfter, s.scoreIssues,
    s.detail.missingHelps.length, s.detail.orderOnTime, s.detail.orderOverdue, s.detail.orderDelivered,
    s.detail.afterResolved, s.detail.afterFast, s.detail.issueResolved, s.detail.issueEscalated,
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({wch:12}));
  XLSX.utils.book_append_sheet(wb, ws, range.label.slice(0, 30));
  XLSX.writeFile(wb, `绩效统计_${range.label}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('✓ 已导出');
}

