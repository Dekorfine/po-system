// ============================================================
// 跟单团队工作台 · shopify.js
// 销售单（Shopify 同步）+ 自定义订单录入
// ============================================================
// 依赖：core.js · utils.js
// ============================================================
// V20260527e: STORES_META 加 legacyOnly 字段 · mooijane 已被 JD app 接管 · chip 不再显示
// V20260527c: 店铺管理 modal 加入 fixed-overlay 白名单 · 修错位 + 列表看不见
// ============================================================

// ============================================================
// Shopify 销售单模块（批次 3：状态机 + DB 持久化 + sub-tabs）
// ============================================================
const SHOPIFY = {
  STORES_META: [
    // V20260601:加 public_domain · 用于前端直拉公开 /products.json API(Edge Function 不支持产品查询)
    { domain: 'vakkerlighting.myshopify.com', site_code: 'VK', public_domain: 'vakkerlighting.com' },
    { domain: 'dekorfine.myshopify.com',      site_code: 'DF', public_domain: 'dekorfine.com' },
    { domain: 'docolight.myshopify.com',      site_code: 'DC', public_domain: 'docolight.com' },
    { domain: 'vkfrench.myshopify.com',       site_code: 'PL', public_domain: 'pinlighting.com' },
    { domain: 'vakkerge.myshopify.com',       site_code: 'RD', public_domain: 'radilum.com' },
    { domain: 'vkwholesale.myshopify.com',    site_code: 'MH', public_domain: 'mhdecorlife.com' },
    { domain: 'docolamp.myshopify.com',       site_code: 'LS', public_domain: 'lumioshine.com' },
    // V20260527e: mooijane.myshopify.com 已被 janedecor.myshopify.com (JD app) 接管
    // 保留 site_code='MJ' 用于历史订单解析,但不在 chip 条显示 "+ 安装" 入口
    { domain: 'mooijane.myshopify.com',       site_code: 'MJ', legacyOnly: true },
    { domain: 'decormote.myshopify.com',      site_code: 'RS', public_domain: 'rayonshine.com' },
    { domain: 'janedecor.myshopify.com',      site_code: 'JD', public_domain: 'janedecor.com' },
    // V20260528b: WooCommerce 接入 · mooielight 是 WordPress + WooCommerce(不是 Shopify)
    // platform='woo' 走 woo-api Edge Function · 不走 shopify-api
    { domain: 'mooielight.com', site_code: 'ML', platform: 'woo', woo_store_id: 'mooielight', display_name: 'Mooielight', public_domain: 'mooielight.com' },
  ],
  FN_URL: 'https://pyfmuknvjqfwcqvbrsvw.supabase.co/functions/v1/shopify-api',
  // V20260528b: woo-api Edge Function URL · 用 anon key 调(已 --no-verify-jwt 部署)
  WOO_FN_URL: 'https://pyfmuknvjqfwcqvbrsvw.supabase.co/functions/v1/woo-api',
  _stores: [],
  _orders: [],
  _autoSyncTimer: null,
  _initialized: false,
  _currentFilter: 'all',

  async call(action, params = {}, shop = null, timeoutMs = 45000) {
    let { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('未登录');
    const body = { shop, action, params };
    // V20260605:封装一次请求 · 便于 401 刷新后重试
    const doFetch = async (token) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(this.FN_URL, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        return { res, json };
      } finally { clearTimeout(timeoutId); }
    };
    try {
      let { res, json } = await doFetch(session.access_token);
      // V20260605:401/会话过期 → 刷新 token 重试一次(修"挂几小时后同步不了")
      if (res.status === 401 || (json && /jwt|token|expired|unauthor/i.test(json.error || ''))) {
        console.warn('[同步] token 可能过期 · 刷新会话后重试…');
        const { data: refreshed } = await sb.auth.refreshSession();
        const newToken = refreshed?.session?.access_token;
        if (newToken) { ({ res, json } = await doFetch(newToken)); }
        else throw new Error('登录已过期 · 请刷新页面重新登录');
      }
      if (!res.ok || !json.ok) throw new Error(json.error || ('HTTP ' + res.status));
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('同步超时· 店铺订单可能太多 · 请缩小日期范围重试');
      throw e;
    }
  },

  // V20260528b: 调 woo-api Edge Function · 用 anon key(已 --no-verify-jwt)
  async callWoo(action, params = {}, wooStoreId = 'mooielight') {
    const body = { store_id: wooStoreId, action, params };
    // V28d: 45 秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(this.WOO_FN_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
      if (!json.ok) throw new Error(json.error || JSON.stringify(json));
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('WooCommerce 同步超时(90秒)· 请缩小日期范围重试');
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async loadStores() {
    const { data, error } = await sb.from('shopify_stores').select('*').order('site_code');
    if (error) throw error;
    const byDomain = {};
    (data || []).forEach(s => { byDomain[s.shop_domain] = s; });
    this._stores = this.STORES_META.map(meta => {
      const row = byDomain[meta.domain];
      // V20260528b: woo 平台不在 shopify_stores 表 · 直接当作已连接(Edge Function 配置)
      if (meta.platform === 'woo') {
        return {
          ...meta,
          connected: true,
          id: meta.domain,
          display_name: meta.display_name || meta.domain.replace(/\..*$/, ''),
          last_sync_at: null,
          auto_sync_enabled: true,
          auto_sync_minutes: 5,
        };
      }
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

  // V28x:真正的秒开 · localStorage 缓存订单 · 打开立即渲染 · 后台异步刷新
  // V28y:cache v2 · 不再按 shop 分桶(避免切 chip 时本地没数据 → 显示 0 的 bug)
  // V20260601-loadfix2:按当前 shops + 日期范围分页拉全 · 带安全上限
  // shops 非空 → .in('shop_domain', shops)(选店只查该店 · 小店不被大店挤出 limit 500)
  async _fetchOrdersScoped(opts = {}) {
    const PAGE = 1000;        // PostgREST 单次返回上限
    const MAX_ROWS = 8000;    // 安全上限(全店总量约 4500 · 留余量)
    const shops = (opts.shops || []).filter(Boolean);
    // V20260602-perf:精简列(排除 raw_payload 大字段)· Shopify 列表/催单都不用它 · egress 大幅下降
    // 列错会 400 → 自动回退 select(*) 兜底 · WooCommerce 详情/运费用到的 raw_payload 之后按需补
    const LEAN = 'id,shop_domain,shopify_order_id,shopify_order_number,customer_name,customer_email,customer_phone,shipping_address,line_items,financial_status,fulfillment_status,local_status,total_price,shipping_fee,currency,customer_note,internal_note,shopify_created_at,imported_by,imported_at,updated_at,deleted_at,deleted_by,platform,wp_order_id,store_label,store_code';
    let all = [];
    let offset = 0;
    let useLean = true;
    while (offset < MAX_ROWS) {
      let q = sb.from('shopify_orders').select(useLean ? LEAN : '*').is('deleted_at', null);
      if (shops.length) q = q.in('shop_domain', shops);
      if (opts.from) q = q.gte('shopify_created_at', opts.from + 'T00:00:00Z');
      if (opts.to)   q = q.lte('shopify_created_at', opts.to + 'T23:59:59Z');
      q = q.order('shopify_created_at', { ascending: false }).range(offset, offset + PAGE - 1);
      const { data, error } = await q;
      if (error) {
        if (useLean && offset === 0) { console.warn('[订单] 精简列查询失败 · 回退 select(*) ·', error.message); useLean = false; continue; }
        throw error;
      }
      const batch = data || [];
      all = all.concat(batch);
      if (batch.length < PAGE) break;   // 末页
      offset += PAGE;
    }
    // V20260602-perf:WooCommerce 订单按需补 raw_payload(列表详情/运费/税要)· 量小(单店)
    if (useLean) {
      const wooIds = all.filter(o => o.platform === 'woo').map(o => o.id).filter(Boolean);
      if (wooIds.length) {
        try {
          const { data: woo } = await sb.from('shopify_orders').select('id,raw_payload').in('id', wooIds);
          const rpMap = {}; (woo || []).forEach(w => { rpMap[w.id] = w.raw_payload; });
          all.forEach(o => { if (o.platform === 'woo' && rpMap[o.id]) o.raw_payload = rpMap[o.id]; });
        } catch (e) { console.warn('[订单] WooCommerce raw_payload 补全失败:', e); }
      }
    }
    const truncated = all.length >= MAX_ROWS;
    if (truncated) console.warn(`[订单] 达到加载上限 ${MAX_ROWS} · 部分未加载 · 建议选店/缩小日期`);
    return { rows: all, truncated };
  },

  // V20260605-incr:算游标 = 一批订单里最大的 updated_at(ISO 字符串可直接比大小)
  _computeOrdersCursor(rows) {
    let mx = '';
    for (const o of (rows || [])) {
      const u = o.updated_at || '';
      if (u > mx) mx = u;
    }
    return mx;
  },

  // V20260605-incr:增量拉取 —— 只拉 updated_at >= cursor 的单,合并进 base(按 id 覆盖/追加,deleted 移除)
  //   这就是店小秘那类 ERP 的做法:本地累积,每次只补变动的(新单+状态变更),不再全量重拉
  async _fetchOrdersIncremental(opts, baseRows, cursor) {
    const PAGE = 1000, MAX_ROWS = 8000;
    const shops = (opts.shops || []).filter(Boolean);
    const LEAN = 'id,shop_domain,shopify_order_id,shopify_order_number,customer_name,customer_email,customer_phone,shipping_address,line_items,financial_status,fulfillment_status,local_status,total_price,shipping_fee,currency,customer_note,internal_note,shopify_created_at,imported_by,imported_at,updated_at,deleted_at,deleted_by,platform,wp_order_id,store_label,store_code';
    const byId = new Map((baseRows || []).map(o => [o.id, o]));
    let fetched = [], offset = 0, useLean = true;
    while (offset < MAX_ROWS) {
      // 注意:增量【不过滤 deleted_at】· 否则删除/退单的单看不到、本地清不掉
      let q = sb.from('shopify_orders').select(useLean ? LEAN : '*');
      if (shops.length) q = q.in('shop_domain', shops);
      if (opts.from) q = q.gte('shopify_created_at', opts.from + 'T00:00:00Z');
      if (opts.to)   q = q.lte('shopify_created_at', opts.to + 'T23:59:59Z');
      if (cursor)    q = q.gte('updated_at', cursor);   // 只要变动过的
      q = q.order('updated_at', { ascending: false }).range(offset, offset + PAGE - 1);
      const { data, error } = await q;
      if (error) { if (useLean && offset === 0) { useLean = false; continue; } throw error; }
      const batch = data || [];
      fetched = fetched.concat(batch);
      if (batch.length < PAGE) break;
      offset += PAGE;
    }
    // 合并:deleted 的移除,其余按 id 覆盖/追加
    let newCursor = cursor || '';
    let removed = 0;
    for (const o of fetched) {
      if (o.updated_at && o.updated_at > newCursor) newCursor = o.updated_at;
      if (o.deleted_at) { if (byId.delete(o.id)) removed++; continue; }
      byId.set(o.id, o);
    }
    let merged = Array.from(byId.values());
    // WooCommerce 新/变动单补 raw_payload(量小)
    if (useLean) {
      const wooIds = fetched.filter(o => o.platform === 'woo' && !o.deleted_at).map(o => o.id).filter(Boolean);
      if (wooIds.length) {
        try {
          const { data: woo } = await sb.from('shopify_orders').select('id,raw_payload').in('id', wooIds);
          const rpMap = {}; (woo || []).forEach(w => { rpMap[w.id] = w.raw_payload; });
          merged.forEach(o => { if (o.platform === 'woo' && rpMap[o.id]) o.raw_payload = rpMap[o.id]; });
        } catch (e) { console.warn('[订单增量] woo raw_payload 补全失败:', e); }
      }
    }
    // 列表期望最新在前(按创建时间倒序)
    merged.sort((a, b) => (b.shopify_created_at || '').localeCompare(a.shopify_created_at || ''));
    return { rows: merged, cursor: newCursor, fetchedCount: fetched.length, removed };
  },

  async loadOrdersFromDB(force = false, opts = {}) {
    const CACHE_MS = 5 * 60 * 1000;  // V20260601-perf:60s→5min · 减少全表 select(*) 重复拉(省 egress/CPU)
    const cacheKey = JSON.stringify({ from: opts.from || '', to: opts.to || '', shops: (opts.shops || []).slice().sort() });  // V20260601-loadfix2:含 shops 分桶
    // ① in-memory 缓存(同 session 内)
    if (!force && this._ordersCacheKey === cacheKey && this._ordersLoadedAt && (Date.now() - this._ordersLoadedAt < CACHE_MS) && this._orders.length > 0) {
      return this._orders;
    }
    // ② V28x:localStorage 缓存(跨 session 秒开)· 立即返回 + 后台异步刷新
    if (!force) {
      try {
        const cacheRaw = localStorage.getItem('shopify_orders_cache_v3');
        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw);
          if (cache && cache.byKey && cache.byKey[cacheKey] && Array.isArray(cache.byKey[cacheKey].data) && cache.byKey[cacheKey].data.length > 0) {  // V20260601-loadfix3:空缓存不返回 · 防止挡住新查询
            this._orders = cache.byKey[cacheKey].data;
            this._ordersLoadedAt = cache.byKey[cacheKey].ts || Date.now();
            this._ordersCacheKey = cacheKey;
            this._ordersCursor = cache.byKey[cacheKey].cursor || this._computeOrdersCursor(this._orders);  // V20260605-incr
            // V20260601-perf:缓存够新(<5min)就不再后台全表刷新 · 大幅减少 raw_payload egress
            const cacheAge = Date.now() - (cache.byKey[cacheKey].ts || 0);
            if (cacheAge > CACHE_MS) {
              this._bgRefreshFromSupabase(opts, cacheKey);
            }
            console.log(`[订单 ⚡秒开] localStorage 缓存命中 · ${this._orders.length} 单${cacheAge > CACHE_MS ? ' · 后台刷新中…' : ' · 缓存够新跳过刷新'}`);
            return this._orders;
          }
        }
      } catch (e) { console.warn('[订单缓存] 读取失败:', e); }
    }
    // ③ 无缓存 / force / 缓存失效 → 同步从 supabase 拉
    // V20260601-loadfix2:按 shops + 日期下推 + 分页拉全(选店只查该店 · 不被大店挤出 limit 500)
    const { rows } = await this._fetchOrdersScoped(opts);
    this._orders = rows;
    this._ordersCursor = this._computeOrdersCursor(rows);   // V20260605-incr:首次/强制全量后记录游标
    this._ordersLoadedAt = Date.now();
    this._ordersCacheKey = cacheKey;
    this._persistOrdersCache(cacheKey);
    console.log(`[订单 全量] ${rows.length} 单 · 游标 ${this._ordersCursor.slice(0,19)}`);
    return this._orders;
  },

  // V28x:后台异步刷新 · 不阻塞 UI
  async _bgRefreshFromSupabase(opts, cacheKey) {
    try {
      // V20260605-incr:后台刷新改【增量】· 只拉 updated_at >= 游标 的变动单,合并进本地(不再全量重拉 8000)
      const base = this._orders || [];
      const cursor = this._ordersCursor || this._computeOrdersCursor(base);
      const before = base.length;
      let fresh, newCursor, fetchedCount = 0, removed = 0;
      if (cursor && before > 0) {
        const r = await this._fetchOrdersIncremental(opts, base, cursor);
        fresh = r.rows; newCursor = r.cursor; fetchedCount = r.fetchedCount; removed = r.removed;
      } else {
        const r = await this._fetchOrdersScoped(opts);   // 无游标/空缓存 → 全量一次
        fresh = r.rows; newCursor = this._computeOrdersCursor(fresh);
      }
      const changed = before !== fresh.length || fetchedCount > 0 || removed > 0;
      this._orders = fresh;
      this._ordersCursor = newCursor;
      this._ordersLoadedAt = Date.now();
      this._ordersCacheKey = cacheKey;
      this._persistOrdersCache(cacheKey);
      if (fetchedCount > 0 || removed > 0) console.log(`[订单 ⚡增量刷新] 补 ${fetchedCount} 变动 · 删 ${removed} · 共 ${fresh.length} 单`);
      if (changed) {
        console.log(`[订单 🔄后台同步] 数据已更新 · ${fresh.length} 单`);
        if (typeof renderShopifyOrders === 'function') renderShopifyOrders();
        if (typeof renderSalesStats === 'function') renderSalesStats();
        if (typeof shopifyRefreshCounts === 'function') shopifyRefreshCounts();
        if (typeof shopifyRefreshRuleCounts === 'function') shopifyRefreshRuleCounts();
      }
    } catch (e) { console.warn('[订单后台同步] 异常:', e); }
  },

  // V28x:持久化订单缓存到 localStorage(可能撑爆 · try-catch 保护)
  _persistOrdersCache(cacheKey) {
    try {
      let cacheRaw = localStorage.getItem('shopify_orders_cache_v3');
      let cache = cacheRaw ? JSON.parse(cacheRaw) : { byKey: {} };
      if (!cache.byKey) cache.byKey = {};
      // 瘦身:line_items 保留(渲染要) · raw_payload 大头 · 留着否则运费/税废了
      // 限制最多缓存 3 个 key(防止历史 key 累积撑爆)
      const keys = Object.keys(cache.byKey);
      if (keys.length > 3) {
        // 删最旧的
        const oldest = keys.sort((a, b) => (cache.byKey[a].ts || 0) - (cache.byKey[b].ts || 0))[0];
        delete cache.byKey[oldest];
      }
      cache.byKey[cacheKey] = { data: this._orders, ts: Date.now(), cursor: this._ordersCursor || this._computeOrdersCursor(this._orders) };
      localStorage.setItem('shopify_orders_cache_v3', JSON.stringify(cache));
    } catch (e) {
      // localStorage 满了 · 清空重写
      if (e.name === 'QuotaExceededError' || /quota|storage/i.test(e.message || '')) {
        try {
          localStorage.removeItem('shopify_orders_cache_v3');
          localStorage.setItem('shopify_orders_cache_v3', JSON.stringify({ byKey: { [cacheKey]: { data: this._orders, ts: Date.now(), cursor: this._ordersCursor || this._computeOrdersCursor(this._orders) } } }));
        } catch (_) { /* 还是写不进 · 放弃 */ }
      }
    }
  },

  invalidateOrders() {
    this._ordersLoadedAt = 0;
    this._ordersCacheKey = null;
    try { localStorage.removeItem('shopify_orders_cache_v3'); } catch (_) {}
  },

  async loadProductImageMap(skus) {
    if (!skus || skus.length === 0) return {};
    // V20260601-fix:分批查询 · 避免 .in() 把所有 SKU 塞 URL 导致 HTTP 414 URL Too Long
    // 547 个 SKU 一次塞 URL 会超 8KB 网关限制
    const BATCH_SIZE = 100;
    const map = {};
    for (let i = 0; i < skus.length; i += BATCH_SIZE) {
      const batch = skus.slice(i, i + BATCH_SIZE);
      try {
        const { data, error } = await sb
          .from('products')
          .select('sku, image_url, name_cn, name_en')
          .in('sku', batch)
          .is('deleted_at', null);
        if (error) { console.warn('[loadProductImageMap] 批次', i/BATCH_SIZE+1, '失败:', error.message); continue; }
        (data || []).forEach(p => { map[p.sku] = p; });
      } catch (e) {
        console.warn('[loadProductImageMap] 批次', i/BATCH_SIZE+1, '异常:', e.message);
      }
    }
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

// V20260527k: 店铺 chip 拖拽排序 + 删除/绑定权限收紧
// ------------------------------------------------------------
// 每个跟单(CURRENT_AGENT)独立保存 chip 顺序到 localStorage
// 长期负责某店的跟单可以把 chip 拖到前面 · 不影响其他跟单
function getShopifyChipOrder() {
  if (typeof CURRENT_AGENT === 'undefined' || !CURRENT_AGENT) return [];
  try {
    return JSON.parse(localStorage.getItem(`shopify_chip_order_${CURRENT_AGENT}`) || '[]');
  } catch (_) { return []; }
}

function saveShopifyChipOrder(domains) {
  if (typeof CURRENT_AGENT === 'undefined' || !CURRENT_AGENT) return;
  try {
    localStorage.setItem(`shopify_chip_order_${CURRENT_AGENT}`, JSON.stringify(domains));
  } catch (_) {}
}

// 按当前用户偏好排序;偏好里没有的店追加到末尾(STORES_META 默认顺序)
function sortStoresByChipPreference(stores) {
  const orderArr = getShopifyChipOrder();
  if (!Array.isArray(orderArr) || orderArr.length === 0) return stores;
  const orderMap = new Map(orderArr.map((d, i) => [d, i]));
  const known = stores.filter(s => orderMap.has(s.domain))
    .sort((a, b) => orderMap.get(a.domain) - orderMap.get(b.domain));
  const unknown = stores.filter(s => !orderMap.has(s.domain));
  return [...known, ...unknown];
}

// 拖拽事件:开始
function shopifyChipDragStart(e, domain) {
  if (typeof CURRENT_AGENT === 'undefined' || !CURRENT_AGENT) { e.preventDefault(); return; }
  e.dataTransfer.setData('text/plain', domain);
  e.dataTransfer.effectAllowed = 'move';
  // 视觉反馈
  e.target.style.opacity = '0.4';
  e.target.classList.add('chip-dragging');
}

// 拖到目标 chip 上方时
function shopifyChipDragOver(e, targetDomain) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // 视觉反馈:目标 chip 加一个左侧蓝色线
  e.currentTarget.classList.add('chip-drop-target');
}

function shopifyChipDragLeave(e) {
  e.currentTarget.classList.remove('chip-drop-target');
}

// 拖拽结束(无论成不成)
function shopifyChipDragEnd(e) {
  e.target.style.opacity = '';
  e.target.classList.remove('chip-dragging');
  // 清掉所有 drop target 视觉
  document.querySelectorAll('.chip-drop-target').forEach(el => el.classList.remove('chip-drop-target'));
}

// 落到目标 chip 上 · 把 source 移到 target 之前
function shopifyChipDrop(e, targetDomain) {
  e.preventDefault();
  e.currentTarget.classList.remove('chip-drop-target');
  const sourceDomain = e.dataTransfer.getData('text/plain');
  if (!sourceDomain || sourceDomain === targetDomain) return;
  
  // 取当前 chip 渲染顺序(可见的 stores)
  const stores = SHOPIFY._stores || [];
  const visible = stores.filter(s => !s.legacyOnly || s.connected);
  const ordered = sortStoresByChipPreference(visible);
  
  const sourceIdx = ordered.findIndex(s => s.domain === sourceDomain);
  const targetIdx = ordered.findIndex(s => s.domain === targetDomain);
  if (sourceIdx < 0 || targetIdx < 0) return;
  
  // 把 source 移到 target 位置前面
  const [moved] = ordered.splice(sourceIdx, 1);
  // 移除后 targetIdx 可能要调整(如果 source 在 target 之前,target 索引会前移 1)
  const newTargetIdx = ordered.findIndex(s => s.domain === targetDomain);
  ordered.splice(newTargetIdx, 0, moved);
  
  // 保存新顺序 + 重渲染
  saveShopifyChipOrder(ordered.map(s => s.domain));
  renderShopifyStores();
  toast('✓ 已调整店铺顺序(只对你生效)', 'info', 1500);
}

// 暴露给 inline onclick 用
window.shopifyChipDragStart = shopifyChipDragStart;
window.shopifyChipDragOver = shopifyChipDragOver;
window.shopifyChipDragLeave = shopifyChipDragLeave;
window.shopifyChipDragEnd = shopifyChipDragEnd;
window.shopifyChipDrop = shopifyChipDrop;
// ------------------------------------------------------------

function renderShopifyStores() {
  const grid = document.getElementById('salesStoresGrid');
  if (!grid) return;
  const stores = SHOPIFY._stores;
  // V20260527e: chip 条只显示「非 legacyOnly」的店;但已连接的 legacyOnly 仍显示(防误删活的店)
  let visibleStores = stores.filter(s => !s.legacyOnly || s.connected);
  // V20260527k: 按用户偏好顺序排序(拖拽保存的顺序)
  visibleStores = sortStoresByChipPreference(visibleStores);
  const connected = visibleStores.filter(s => s.connected).length;
  const totalVisible = visibleStores.length;
  document.getElementById('salesStoresTotal').textContent = `${connected}/${totalVisible}`;

  // V20260527k: 「➕ 手动添加」按钮仅老板可见
  const addBtn = document.getElementById('salesAddStoreBtn');
  if (addBtn) {
    addBtn.style.display = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN) ? '' : 'none';
  }

  grid.innerHTML = visibleStores.map(s => {
    // V20260526q: 当前店被设为过滤(单店或多店里)→ 显示选中态(蓝色边框 + 强调)
    const isFiltered = typeof SHOPIFY_SEARCH !== 'undefined' 
                    && SHOPIFY_SEARCH.shops 
                    && SHOPIFY_SEARCH.shops.has(s.domain);
    // V20260527k: 所有 chip 加拖拽事件
    const dragAttrs = `
      draggable="true"
      ondragstart="shopifyChipDragStart(event, '${s.domain}')"
      ondragover="shopifyChipDragOver(event, '${s.domain}')"
      ondragleave="shopifyChipDragLeave(event)"
      ondragend="shopifyChipDragEnd(event)"
      ondrop="shopifyChipDrop(event, '${s.domain}')"
      style="cursor:grab;"`;
    if (s.connected) {
      // 已连接:绿色 chip + ✓ 标记 + 双击改名 + 点击同步 + 过滤态高亮 + 可拖拽
      return `
        <span class="store-chip connected ${isFiltered ? 'filtering' : ''}" ${dragAttrs}
          onclick="shopifyQuickFetchFromCard('${s.domain}')"
          ondblclick="shopifyRenameStore('${s.id}', '${escapeHtml(s.display_name).replace(/'/g,"\\'")}')"
          title="${escapeHtml(s.display_name)} · ${isFiltered ? '【当前过滤显示】再次点击清除过滤 · ' : ''}点击同步 (双击改名 · 拖拽调整顺序)">
          <span class="store-chip-code">${s.site_code}</span>
          <span class="store-chip-name">${escapeHtml(s.display_name)}</span>
          <span class="store-chip-status">${isFiltered ? '🎯' : '✓'}</span>
        </span>`;
    } else {
      // 未连接:灰色 chip + 安装入口(权限在 shopifyInstall 内部检查)
      return `
        <span class="store-chip" ${dragAttrs}
          onclick="shopifyInstall('${s.domain}')" 
          title="${escapeHtml(s.display_name)} · 未连接 · 点击安装(限老板)">
          <span class="store-chip-code">${s.site_code}</span>
          <span class="store-chip-name">${escapeHtml(s.display_name)}</span>
          <span class="store-chip-status install">+ 安装</span>
        </span>`;
    }
  }).join('');
  
  // V20260526q: 更新过滤状态条 + 清除按钮显隐
  _updateShopFilterStatusBar();
}

// V20260526q: 显示当前过滤状态(共用辅助函数)
function _updateShopFilterStatusBar() {
  const status = document.getElementById('salesStoresFilterStatus');
  const clearBtn = document.getElementById('salesStoresClearBtn');
  if (!status || !clearBtn) return;
  
  const n = (SHOPIFY_SEARCH?.shops?.size) || 0;
  if (n === 0) {
    status.style.display = 'none';
    clearBtn.style.display = 'none';
  } else if (n === 1) {
    const domain = [...SHOPIFY_SEARCH.shops][0];
    const code = SHOPIFY?.siteCodeOf?.(domain) || domain.split('.')[0];
    status.textContent = `仅显示 ${code}`;
    status.className = 'shop-filter-status';
    status.style.display = '';
    clearBtn.style.display = '';
  } else {
    status.textContent = `过滤 ${n} 家店`;
    status.className = 'shop-filter-status multi';
    status.style.display = '';
    clearBtn.style.display = '';
  }
}

// V20260526q: 清除店铺过滤 · 显示全部店订单
// V20260527p: 修 bug · 之前调用的 shopifyRenderShops 不存在(正确名是 renderShopifyStores)
// typeof 守卫让函数缺失静默无报错 · 导致 chip 高亮态没刷新 = 用户看"关不掉"
function shopifyClearShopFilter() {
  if (!SHOPIFY_SEARCH || !SHOPIFY_SEARCH.shops) return;
  SHOPIFY_SEARCH.shops.clear();
  // 重渲 chip 行(清掉 🎯 高亮)
  if (typeof renderShopifyStores === 'function') renderShopifyStores();
  // 重渲国家筛选下方的 chip 区
  if (typeof shopifyRenderShopFilter === 'function') shopifyRenderShopFilter();
  // 隐藏状态条 + 清除按钮(否则会残留)
  _updateShopFilterStatusBar();
  // 重新渲染订单列表(显示全部)
  // V20260601-loadfix:清除店铺过滤 → 重新查库(全部店)
  if (typeof shopifyReloadOrdersAndRender === 'function') shopifyReloadOrdersAndRender(false);
  toast('已显示全部店铺的订单', 'info', 1200);
}
window.shopifyClearShopFilter = shopifyClearShopFilter;

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
  // V20260527k: 仅老板可以安装/绑定新店
  if (typeof IS_ADMIN === 'undefined' || !IS_ADMIN) {
    toast('店铺绑定/安装仅限主管操作 · 请联系老板', 'warn', 2500);
    return;
  }
  const url = SHOPIFY.installUrl(domain);
  window.open(url, '_blank', 'noopener');
  toast('请在新窗口完成授权后回来点 🔄 刷新');
}

function populateFetchShopDropdown() {
  const sel = document.getElementById('salesFetchShop');
  if (!sel) return;
  // V28h3: connected 的店 + 所有 woo 平台店(woo 一定纳入 · 防时机问题漏掉)
  const connected = SHOPIFY._stores.filter(s => s.connected || s.platform === 'woo');
  const current = sel.value;
  sel.innerHTML = '<option value="">— 选择店铺 —</option>' +
    connected.map(s => `<option value="${s.domain}">${escapeHtml(s.display_name)} (${s.site_code})</option>`).join('');
  if (current && connected.find(s => s.domain === current)) sel.value = current;
  else if (connected.length === 1) sel.value = connected[0].domain;
}

function shopifyQuickFetchFromCard(domain) {
  // V20260527g: 点 chip 已在 sales tab 时,不再 switchTab(避免触发 loadOrdersFromDB 慢拉数据)
  // 只在不在 sales tab 时才切 tab(这种情况是从其他 tab 点 chip,但目前 chip 只在 sales tab 展示,实际不触发)
  const alreadyOnSales = (typeof CURRENT_TAB !== 'undefined' && CURRENT_TAB === 'sales');
  if (!alreadyOnSales) {
    switchTab('sales');
  }
  setTimeout(() => {
    // V20260527: 点 chip 只做本地过滤(瞬间)· 不再触发 Shopify API 拉数据(慢)
    // 用户想拉最新数据请单独点 [📥 拉单] 按钮 · 或顶部 [🔄 刷新]
    // 这样切换店铺像店小秘一样流畅
    if (typeof SHOPIFY_SEARCH !== 'undefined' && SHOPIFY_SEARCH.shops) {
      const isOnlyThis = SHOPIFY_SEARCH.shops.size === 1 && SHOPIFY_SEARCH.shops.has(domain);
      if (isOnlyThis) {
        SHOPIFY_SEARCH.shops.clear();
        toast('已清除店铺过滤,显示全部订单', 'info', 1200);
      } else {
        SHOPIFY_SEARCH.shops = new Set([domain]);
        const code = (SHOPIFY?.siteCodeOf && SHOPIFY.siteCodeOf(domain)) || domain.split('.')[0];
        toast(`✓ 已切换到 ${code} 的订单`, 'info', 1200);
      }
      if (typeof renderShopifyStores === 'function') renderShopifyStores();
      if (typeof shopifyRenderShopFilter === 'function') shopifyRenderShopFilter();
      _updateShopFilterStatusBar();
      // V20260601-loadfix:切店铺重新查库(下推 shop · 选店看全)· 命中缓存仍秒切
      if (typeof shopifyReloadOrdersAndRender === 'function') shopifyReloadOrdersAndRender(false);
    }
    // 隐藏 select 也设值(为了后续手动拉单时知道是哪家店)
    const sel = document.getElementById('salesFetchShop');
    if (sel) {
      // V28h3: 确保下拉有这个 option(woo 店可能因时机问题没进下拉 · 动态补上)
      let opt = [...sel.options].find(o => o.value === domain);
      if (!opt) {
        const meta = SHOPIFY._stores.find(s => s.domain === domain) 
                  || SHOPIFY.STORES_META.find(s => s.domain === domain);
        if (meta) {
          opt = document.createElement('option');
          opt.value = domain;
          opt.textContent = `${meta.display_name || domain} (${meta.site_code})`;
          sel.appendChild(opt);
        }
      }
      sel.value = domain;
    }
  }, alreadyOnSales ? 0 : 50);  // 已在 sales tab 时 0ms · 跨 tab 才需 50ms 等待 DOM
}

function setSalesDefaultDates() {
  const to = document.getElementById('salesFetchTo');
  const from = document.getElementById('salesFetchFrom');
  if (!to || !from) return;
  if (!to.value) {
    const today = new Date();
    to.value = _ymdLocal(today);  // V20260601-tzfix
  }
  if (!from.value) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    from.value = _ymdLocal(d);  // V20260601-tzfix
  }
}

// ============================================================
// V20260601-syncall2: 多店同步调度器
// 不选店(下拉留空)→ 同步全部店(排除 legacyOnly · mooijane 已被 JD 接管)
// 选店 → 只同步该店 · 单一 _syncing 锁 / 单一按钮 loading / 全部完成只 reload 一次
// ============================================================
async function shopifyFetchOrders() {
  if (SHOPIFY._syncing) {
    toast('正在同步中 · 请稍候…', 'info', 1500);
    return;
  }

  // 决定同步范围 · 下拉留空 = 全部店(chip 只管列表过滤,不再决定同步范围)
  let shop = document.getElementById('salesFetchShop').value;
  let targets;
  if (shop) {
    const meta = SHOPIFY.STORES_META.find(s => s.domain === shop);
    targets = meta ? [meta] : [{ domain: shop }];
  } else {
    targets = SHOPIFY.STORES_META.filter(s => !s.legacyOnly);
  }
  // 按 domain 去重(同 myshopify 域名的多个 site_code 只拉一次)
  const seen = new Set();
  targets = targets.filter(t => { if (seen.has(t.domain)) return false; seen.add(t.domain); return true; });
  if (targets.length === 0) { toast('没有可同步的店铺', 'warn'); return; }

  const from = document.getElementById('salesFetchFrom').value;
  const to = document.getElementById('salesFetchTo').value;
  const status = 'any';  // V20260601-fetchfix:同步一律抓全部状态(含已完成)· 拉全入库

  const btn = document.querySelector('#salesFetchCard .btn.primary');
  const hint = document.getElementById('salesFetchHint');
  SHOPIFY._syncing = true;
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  if (hint) hint.textContent = targets.length > 1 ? `准备同步 ${targets.length} 家店…` : '正在同步…';

  const isMulti = targets.length > 1;
  let grandCount = 0, grandSaved = 0, grandNewProducts = 0;
  const failed = [];

  try {
    for (let i = 0; i < targets.length; i++) {
      const meta = targets[i];
      const tag = meta.site_code || meta.domain;
      const prefix = isMulti ? `[${i + 1}/${targets.length}] ${tag} · ` : '';
      try {
        const stat = (meta.platform === 'woo')
          ? await _syncWooStore(meta, { from, to, status }, hint, prefix)
          : await _syncShopifyStore(meta.domain, { from, to, status }, hint, prefix);
        grandCount += stat.count || 0;
        grandSaved += stat.saved || 0;
        grandNewProducts += stat.newProducts || 0;
        if (stat.error) failed.push(`${tag}: ${stat.error}`);
      } catch (e) {
        console.error(`[syncAll] ${meta.domain} 失败:`, e);
        failed.push(`${tag}: ${e.message || e}`);
      }
    }

    let msg = isMulti
      ? `全部同步完成 · ${targets.length} 店 · 共 ${grandCount} 单`
      : `同步完成 · 共 ${grandCount} 单`;
    if (grandSaved > 0) msg += ` · 入库 ${grandSaved}`;
    if (grandNewProducts > 0) msg += ` · 新建产品 ${grandNewProducts}`;
    if (failed.length > 0) msg += ` · ⚠ ${failed.length} 店失败`;
    if (hint) hint.textContent = `${msg} · ${new Date().toLocaleTimeString()}`;
    toast(msg, failed.length > 0 ? 'warn' : 'success', failed.length > 0 ? 6000 : 3000);
    if (failed.length > 0) console.warn('[syncAll] 失败明细:', failed);

    await shopifyReloadOrdersAndRender(true);
  } catch (e) {
    toast('同步失败:' + (e.message || e), 'err', 4000);
    if (hint) hint.textContent = '同步失败:' + (e.message || e);
  } finally {
    SHOPIFY._syncing = false;
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
  }
}

// 单店 Shopify 同步核心(无锁 / 无按钮 / 无 reload · 供调度器循环调用)
// V20260601-fetchfix2:时间窗口分片 + 超时自适应二分 · 彻底修复大店超时/抓不全
//   背景:Edge Function 不支持 since_id 分页;auto_save 逐单存很慢 · 大店一窗就 >45 秒超时
//   方案:① 日期范围切 3 天窗 · 逐窗 created_at_min/max 拉(每窗 ≤250 一页拉完)
//        ② 同步超时放宽到 90 秒
//        ③ 任一窗【超时/出错】或【满 250 疑似截断】→ 自动二分该窗重拉 · 直到窗够小能完成
//        ④ 窗口缩到 12 小时仍失败才放弃该窗(避免死循环)· 单店失败不影响其它店
//        ⑤ status 固定 any → 不漏已完成 / 已关闭单
// 返回 { count, saved, newProducts, truncated, failedWindows }
async function _syncShopifyStore(shop, { from, to, status }, hint, prefix = '') {
  const fetchStatus = status || 'any';
  const DAY = 864e5;
  const MIN_SPAN = DAY / 2;          // 最小窗口 12 小时
  const SYNC_TIMEOUT = 90000;        // 同步单次给 90 秒
  const endDate   = to   ? new Date(to   + 'T23:59:59Z') : new Date();
  const startDate = from ? new Date(from + 'T00:00:00Z') : new Date(endDate.getTime() - 365 * DAY);

  // 初始按 3 天切窗(从最新往回)
  const stack = [];
  let c = new Date(endDate);
  while (c > startDate) {
    let st = new Date(c.getTime() - 3 * DAY);
    if (st < startDate) st = new Date(startDate);
    stack.push([new Date(st), new Date(c)]);
    c = st;
  }

  let totalCount = 0, totalSaved = 0, totalNewProducts = 0, reqCount = 0, failedWindows = 0;
  const MAX_REQ = 800;  // 安全上限

  const halve = (ws, we) => {
    const mid = new Date(ws.getTime() + Math.floor((we - ws) / 2));
    stack.push([new Date(ws), mid]);
    stack.push([new Date(mid.getTime()), new Date(we)]);
  };

  while (stack.length && reqCount < MAX_REQ) {
    const [ws, we] = stack.pop();
    const spanMs = we - ws;
    const params = {
      status: fetchStatus, limit: 250, auto_save: true,
      created_at_min: ws.toISOString(),
      created_at_max: we.toISOString(),
    };
    if (hint) hint.textContent = `${prefix}${ws.toISOString().slice(0,10)} ~ ${we.toISOString().slice(0,10)}…${totalCount > 0 ? ` 已 ${totalCount} 单` : ''}`;

    let r;
    try {
      r = await SHOPIFY.call('list_orders', params, shop, SYNC_TIMEOUT);
    } catch (e) {
      reqCount++;
      if (spanMs > MIN_SPAN) { halve(ws, we); continue; }   // 超时/出错 → 二分重试
      console.warn(`[syncOrders] ${shop} 窗口 ${ws.toISOString().slice(0,10)}~${we.toISOString().slice(0,10)} 已最小仍失败 · 跳过 · ${e.message || e}`);
      failedWindows++;
      continue;
    }
    reqCount++;
    const orders = Array.isArray(r.orders) ? r.orders : [];
    const batchCount = orders.length || r.count || 0;

    if (batchCount >= 250 && spanMs > MIN_SPAN) { halve(ws, we); continue; }  // 满250 → 二分

    totalCount += batchCount;
    if (typeof r.saved === 'number')        totalSaved += r.saved;
    if (typeof r.new_products === 'number') totalNewProducts += r.new_products;
  }

  const truncated = (reqCount >= MAX_REQ && stack.length > 0) || failedWindows > 0;
  if (truncated) console.warn(`[syncOrders] ${shop} 未完全拉全 · 失败窗口 ${failedWindows} · 剩余 ${stack.length}`);
  return { count: totalCount, saved: totalSaved, newProducts: totalNewProducts, truncated, failedWindows };
}

async function _syncWooStore(storeMeta, { from, to, status }, hint, prefix = '') {
  const baseParams = { per_page: 100 };
  if (status && status !== 'any') {
    if (status === 'open' || status === 'unfulfilled') baseParams.status = 'processing,on-hold';
    else if (status === 'closed' || status === 'fulfilled') baseParams.status = 'completed';
  } else {
    baseParams.status = 'processing,completed,on-hold';
  }
  if (from) baseParams.after = from + 'T00:00:00';
  if (to) baseParams.before = to + 'T23:59:59';

  let totalCount = 0, totalSaved = 0, lastError = null;
  const MAX_PAGES = 50;  // 50 × 100 = 5000 单上限

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const params = { ...baseParams, page: pageNum };
    if (hint) hint.textContent = `${prefix}「${storeMeta.display_name || 'Woo'}」第 ${pageNum} 页…${totalCount > 0 ? ` 已拉 ${totalCount} 单` : ''}`;
    const result = await SHOPIFY.callWoo('sync_orders', params, storeMeta.woo_store_id);
    const batchCount = result.count || 0;
    totalCount += batchCount;
    totalSaved += (result.saved || 0);
    if (result.error) lastError = result.error;
    if (batchCount < 100) break;  // 末页
  }
  return { count: totalCount, saved: totalSaved, error: lastError };
}

// WC 订单格式 → shopify_orders 表结构
function wooNormalizeOrder(wo, storeMeta) {
  const billing = wo.billing || {};
  const shipping = wo.shipping || {};
  const fullName = (n) => ((n.first_name || '') + ' ' + (n.last_name || '')).trim();
  
  // 状态映射 · WC → Shopify-ish(便于复用展示逻辑)
  // WC: pending / processing / on-hold / completed / cancelled / refunded / failed
  // financial_status: paid / pending / refunded / voided
  // fulfillment_status: fulfilled / unfulfilled
  let financial = 'pending', fulfillment = null;
  switch (wo.status) {
    case 'completed':  financial = 'paid';     fulfillment = 'fulfilled'; break;
    case 'processing': financial = 'paid';     fulfillment = null;        break;  // 已付未发
    case 'on-hold':    financial = 'pending';  fulfillment = null;        break;
    case 'pending':    financial = 'pending';  fulfillment = null;        break;
    case 'refunded':   financial = 'refunded'; fulfillment = null;        break;
    case 'cancelled':  financial = 'voided';   fulfillment = null;        break;
    case 'failed':     financial = 'voided';   fulfillment = null;        break;
  }
  
  // 行项目转 line_items
  const lineItems = (wo.line_items || []).map(li => {
    // WC 的变体规格在 meta_data 里(attribute_pa_xxx 之类)
    const variantMeta = (li.meta_data || [])
      .filter(m => m.key && !m.key.startsWith('_') && m.display_value)
      .map(m => `${m.display_key || m.key}: ${m.display_value}`)
      .join(' / ');
    
    return {
      sku: li.sku || '',
      title: li.name || '',
      quantity: li.quantity || 1,        // 前端读 quantity(不是 qty)
      price: parseFloat(li.price || 0),
      total: parseFloat(li.total || 0),
      variant_title: variantMeta || '',  // 前端读 variant_title(不是 variant)
      image_url: li.image?.src || '',    // 前端读 image_url(不是 image)
      product_id: li.product_id || null,
      variation_id: li.variation_id || null,
    };
  });
  
  const totalPrice = parseFloat(wo.total || 0);
  
  return {
    // ⚠️ 关键:用 woo- 前缀防与 Shopify 数字 ID 冲突
    shopify_order_id: `woo-${storeMeta.woo_store_id}-${wo.id}`,
    shopify_order_number: String(wo.number || wo.id),
    wp_order_id: Number(wo.id),
    platform: 'woo',
    shop_domain: storeMeta.domain,
    
    // 客户
    customer_name: fullName(billing) || fullName(shipping) || '(无名)',
    customer_email: billing.email || null,
    customer_phone: billing.phone || null,
    
    // 状态
    financial_status: financial,
    fulfillment_status: fulfillment,
    local_status: fulfillment === 'fulfilled' ? 'completed' : 'processing',
    
    // 金额(只用确认存在的 total_price + currency · 运费/税挪进 raw_payload)
    total_price: totalPrice,
    currency: wo.currency || 'USD',
    
    // 行项目 + 地址
    line_items: lineItems,
    shipping_address: {
      name: fullName(shipping),
      address1: shipping.address_1 || '',
      address2: shipping.address_2 || '',
      city: shipping.city || '',
      province: shipping.state || '',
      country: shipping.country || '',
      country_code: shipping.country || '',
      zip: shipping.postcode || '',
      phone: billing.phone || shipping.phone || '',
    },
    
    // 时间(订单创建时间字段叫 shopify_created_at)
    shopify_created_at: wo.date_created_gmt ? wo.date_created_gmt + 'Z' 
                      : wo.date_created || new Date().toISOString(),
    imported_at: new Date().toISOString(),
    
    // 客户备注
    customer_note: wo.customer_note || null,
    
    // 原始数据(运费/税/PDF Invoice 号等都在这 · getShippingFee 从这读)
    raw_payload: wo,
  };
}

// V28θ:订单形状归一(Edge Function 可能返回 Shopify/WC 原始 或 表行 · 统一成表行)
// 给客服侧也参考用 · 调用方拿到的 order 总是统一形状
window.normalizeOrderShape = function(raw, shopDomain) {
  if (!raw) return null;
  // 已是表行
  if (raw.shopify_order_number !== undefined && raw.shop_domain !== undefined) return raw;
  // WC 原始(有 number + billing/shipping)
  if (raw.number !== undefined && (raw.billing || raw.shipping)) {
    const billing = raw.billing || {}, shipping = raw.shipping || {};
    const fullName = n => ((n.first_name || '') + ' ' + (n.last_name || '')).trim();
    return {
      shopify_order_number: raw.number || String(raw.id),
      shopify_order_id: raw.id,
      shop_domain: shopDomain || 'mooielight.com',
      platform: 'woo',
      customer_name: fullName(billing) || fullName(shipping),
      customer_email: billing.email || '',
      customer_phone: billing.phone || shipping.phone || '',
      total_price: raw.total,
      currency: raw.currency,
      financial_status: ['completed', 'processing'].includes(raw.status) ? 'paid' : 'pending',
      shipping_address: {
        name: fullName(shipping) || fullName(billing),
        company: shipping.company || billing.company || '',
        address1: shipping.address_1 || billing.address_1 || '',
        address2: shipping.address_2 || billing.address_2 || '',
        city: shipping.city || billing.city || '',
        province: shipping.state || billing.state || '',
        province_code: shipping.state || billing.state || '',
        country: shipping.country || billing.country || '',
        country_code: shipping.country || billing.country || '',
        zip: shipping.postcode || billing.postcode || '',
        phone: billing.phone || shipping.phone || '',
      },
      line_items: (raw.line_items || []).map(li => ({
        sku: li.sku || '', title: li.name || '',
        variant_title: (li.meta_data || [])
          .filter(m => m.key && !m.key.startsWith('_') && m.display_value)
          .map(m => `${m.display_key || m.key}: ${m.display_value}`).join(' / '),
        quantity: li.quantity || 1, price: li.price || 0,
        product_id: li.product_id, variation_id: li.variation_id,
      })),
      shopify_created_at: raw.date_created_gmt ? raw.date_created_gmt + 'Z' : raw.date_created,
      customer_note: raw.customer_note || raw.note || null,
      note: raw.customer_note || raw.note || null,
      raw_payload: raw,
    };
  }
  // Shopify REST 原始(有 name 带 # / customer / shipping_address 直出)
  if (raw.name !== undefined || raw.order_number !== undefined) {
    const sa = raw.shipping_address || raw.billing_address || {};
    const customer = raw.customer || {};
    return {
      shopify_order_number: (raw.name || '').replace(/^#/, '') || String(raw.order_number || raw.id),
      shopify_order_id: raw.id,
      shop_domain: shopDomain || raw.shop_domain || '',
      platform: 'shopify',
      customer_name: sa.name || ((customer.first_name || '') + ' ' + (customer.last_name || '')).trim(),
      customer_email: raw.email || customer.email || '',
      customer_phone: sa.phone || raw.phone || customer.phone || '',
      total_price: raw.total_price,
      currency: raw.currency,
      financial_status: raw.financial_status,
      fulfillment_status: raw.fulfillment_status,
      shipping_address: {
        name: sa.name || '', company: sa.company || '',
        address1: sa.address1 || '', address2: sa.address2 || '',
        city: sa.city || '', province: sa.province || '',
        province_code: sa.province_code || '',
        country: sa.country || '', country_code: sa.country_code || '',
        zip: sa.zip || '', phone: sa.phone || '',
      },
      line_items: (raw.line_items || []).map(li => ({
        sku: li.sku || '', title: li.title || li.name || '',
        variant_title: li.variant_title || '',
        quantity: li.quantity || 1, price: li.price || 0,
        product_id: li.product_id, variant_id: li.variant_id,
        properties: li.properties || [],
        image_url: li.image?.src || li.image_url || '',
      })),
      shopify_created_at: raw.created_at,
      processed_at: raw.processed_at,
      customer_note: raw.note, note: raw.note,
      note_attributes: raw.note_attributes || [],
      raw_payload: raw,
    };
  }
  console.warn('[normalizeOrderShape] 未识别的形状', raw);
  return raw;
};

// V28ζ:实时单查订单(策略 B:先查本地 · 未命中才拉 Shopify · 不入库批量)
//
// 通用 API · 客服系统/发票系统/其它模块都能调:
//   const r = await window.lookupOrderByName('PL3124', 'vkfrench.myshopify.com');
//   r = { ok: true/false, source: 'local'|'shopify'|'cache', order: {...} | null, error?: 'xxx' }
//
// 调用方建议先用 shop=null 自动多店扫描:
//   const r = await window.lookupOrderByName('PL3124');  // 会自动扫所有已连接店
window._orderLookupCache = window._orderLookupCache || {};  // 内存缓存 5 分钟 · key = `${shop}|${orderNo}`
const _LOOKUP_CACHE_TTL = 5 * 60 * 1000;

window.lookupOrderByName = async function(orderNo, shopDomain = null, opts = {}) {
  if (!orderNo) return { ok: false, error: '订单号为空' };
  orderNo = String(orderNo).replace(/^#/, '').trim();
  const noStore = opts.noStore;    // 不写本地缓存
  const forceRemote = opts.forceRemote;  // 跳过本地直接拉远端

  // ① 内存缓存(5 分钟)
  const cacheKey = (shopDomain || '*') + '|' + orderNo;
  if (!forceRemote) {
    const hit = window._orderLookupCache[cacheKey];
    if (hit && (Date.now() - hit.ts < _LOOKUP_CACHE_TTL)) {
      return { ok: true, source: 'cache', order: hit.order };
    }
  }

  // ② 本地 supabase shopify_orders 表(已同步过的)
  if (!forceRemote) {
    try {
      let q = sb.from('shopify_orders').select('*').is('deleted_at', null);
      // 订单号在多个字段里:shopify_order_number / order_no / name
      q = q.or(`shopify_order_number.eq.${orderNo},shopify_order_number.eq.#${orderNo}`);
      if (shopDomain) q = q.eq('shop_domain', shopDomain);
      const { data, error } = await q.limit(5);
      if (!error && data && data.length > 0) {
        const order = data[0];
        if (!noStore) window._orderLookupCache[cacheKey] = { ts: Date.now(), order };
        return { ok: true, source: 'local', order };
      }
    } catch (e) { console.warn('[lookupOrder 本地查询失败]', e); }
  }

  // ③ 远端 Shopify(未命中 → 调 Edge Function · auto_save:false 不入库批量数据)
  if (!shopDomain) {
    // 没指定店铺 · 试所有已连接店
    const stores = (SHOPIFY._stores || []).filter(s => s.shop_domain || s.domain);
    for (const s of stores) {
      const sd = s.shop_domain || s.domain;
      const r = await window.lookupOrderByName(orderNo, sd, { ...opts, _noRecurse: true });
      if (r && r.ok) return r;
    }
    return { ok: false, error: `订单号 ${orderNo} 在已连接的 ${stores.length} 个店铺中都没找到 · 请确认订单号正确` };
  }

  try {
    for (const tryName of [orderNo, '#' + orderNo]) {
      const r = await SHOPIFY.call('list_orders', {
        name: tryName,
        status: 'any',
        limit: 5,
        auto_save: !!opts.autoSave,  // 默认不入库 · 调用方明确要才入
      }, shopDomain);
      if (r && r.count > 0 && Array.isArray(r.orders) && r.orders.length > 0) {
        // V28θ:无论 Edge Function 返回什么形状 · 统一 normalize
        const order = window.normalizeOrderShape(r.orders[0], shopDomain);
        if (!noStore) window._orderLookupCache[cacheKey] = { ts: Date.now(), order };
        return { ok: true, source: 'shopify', order, saved: r.saved };
      }
    }
    return { ok: false, error: `Shopify ${shopDomain} 中未找到 ${orderNo}` };
  } catch (e) {
    return { ok: false, error: 'Shopify 查询失败:' + (e.message || e) };
  }
};

// V28ε:按订单号补拉历史订单 · UI 入口(沿用)· 内部改走 lookupOrderByName(B 策略)
window.openFetchByOrderNo = async function() {
  const modal = document.getElementById('fetchByOrderNoModal');
  if (!modal) return;
  const sel = document.getElementById('fetchByOrderNoShop');
  if (sel) {
    sel.innerHTML = '<option value="">所有店铺(自动匹配)</option>';
    const stores = SHOPIFY._stores || [];
    stores.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.shop_domain || s.domain || '';
      opt.textContent = `${s.site_code || s.code || ''} · ${opt.value}`;
      sel.appendChild(opt);
    });
  }
  document.getElementById('fetchByOrderNoList').value = '';
  document.getElementById('fetchByOrderNoResult').style.display = 'none';
  modal.classList.add('show');
};

window.doFetchByOrderNo = async function() {
  const shop = document.getElementById('fetchByOrderNoShop').value || null;
  const rawList = document.getElementById('fetchByOrderNoList').value || '';
  const orderNos = rawList.split(/[\n,,;;\s]+/).map(s => s.trim()).filter(Boolean);
  if (orderNos.length === 0) { toast('请输入至少 1 个订单号', 'warn'); return; }

  const btn = document.getElementById('fetchByOrderNoBtn');
  const resultEl = document.getElementById('fetchByOrderNoResult');
  btn.disabled = true; btn.textContent = '查询中…';
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div style="color:#6366f1;">🔄 实时查询 ' + orderNos.length + ' 个订单…</div>';

  let okCount = 0;
  const results = [];
  for (const orderNo of orderNos) {
    // 跟单这边补拉:autoSave:true 入库(方便后续看)· 客服系统调时传 false
    const r = await window.lookupOrderByName(orderNo, shop, { autoSave: true });
    if (r.ok) {
      okCount++;
      const o = r.order;
      const sourceLabel = { local: '🗄 本地', shopify: '🌐 Shopify(新)', cache: '⚡ 缓存' }[r.source] || r.source;
      results.push({ ok: true, msg: `${orderNo} → ${sourceLabel} · ${o.shop_domain || '?'} · ${o.email || o.customer_email || '?'} · ¥${o.total_price || '?'}` });
    } else {
      results.push({ ok: false, msg: `${orderNo} → ✗ ${r.error}` });
    }
    resultEl.innerHTML = results.map(r => 
      `<div style="color:${r.ok ? '#16a34a' : '#dc2626'}; line-height:1.6;">${r.msg}</div>`
    ).join('');
  }

  btn.disabled = false; btn.textContent = '🚀 查询';
  resultEl.innerHTML += `<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border); font-weight:600;">完成:成功 ${okCount} / ${orderNos.length}</div>`;
  if (okCount > 0) toast(`✓ 查到 ${okCount} 单`, 'ok', 3000);
};

// V28β:跟单常用日期快筛 · 今天/昨天/本周/本月/未下完
// V20260601-syncall:清空日期 · 拉全部历史
window.shopifyClearDateRange = function() {
  const from = document.getElementById('salesFetchFrom');
  const to = document.getElementById('salesFetchTo');
  if (from) from.value = '';
  if (to) to.value = '';
  // 自定义范围 select 切回
  const sel = document.getElementById('salesFetchRange');
  if (sel) sel.value = 'custom';
  const hint = document.getElementById('salesQuickRangeHint');
  if (hint) hint.textContent = '⚠ 已清空日期 · 点 [🔄 同步] 将拉该店所有历史订单(分页 · 可能数分钟)';
};

// V20260601-tzfix:本地日期 YYYY-MM-DD(不经 UTC · 修 UTC+8 下"本月/今天"偏一天塌缩)
function _ymdLocal(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

window.shopifyQuickRange = async function(kind) {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const fmt = _ymdLocal;  // V20260601-tzfix:本地日期
  let from = '', to = '';
  let needPending = false;
  switch (kind) {
    case 'today':
      from = to = fmt(new Date(y, m, d)); break;
    case 'yesterday':
      from = to = fmt(new Date(y, m, d - 1)); break;
    case 'week': {
      const dow = new Date(y, m, d).getDay() || 7;  // 周一=1
      from = fmt(new Date(y, m, d - dow + 1));
      to = fmt(new Date(y, m, d));
      break;
    }
    case 'month':
      from = fmt(new Date(y, m, 1));
      to = fmt(new Date(y, m, d));
      break;
    case 'yesterday_pending':
      from = to = fmt(new Date(y, m, d - 1));
      needPending = true;
      break;
    case 'today_pending':
      from = to = fmt(new Date(y, m, d));
      needPending = true;
      break;
  }
  const fromEl = document.getElementById('salesFetchFrom');
  const toEl = document.getElementById('salesFetchTo');
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
  if (typeof shopifyReloadOrdersAndRender === 'function') await shopifyReloadOrdersAndRender(false);
  window._salesOnlyNoPo = needPending;
  if (typeof renderShopifyOrders === 'function') renderShopifyOrders();
  const hint = document.getElementById('salesQuickRangeHint');
  if (hint) {
    const labelMap = { today: '今天', yesterday: '昨天', week: '本周', month: '本月', yesterday_pending: '昨天未下完', today_pending: '今天未下完' };
    hint.textContent = `已应用:${labelMap[kind]}(${from} → ${to})${needPending ? ' · 仅未下 PO' : ''}`;
  }
};

async function shopifyReloadOrdersAndRender(force = false) {
  // V28y:不再按 shop 拉数据 · 始终拉全部店的订单 → 切 chip 纯本地过滤(瞬间)
  // shop 只用作"同步该店时"的参数(右上 [同步] 按钮)· 不影响 loadOrdersFromDB
  const from = document.getElementById('salesFetchFrom')?.value || '';
  const to   = document.getElementById('salesFetchTo')?.value || '';
  // V20260601-loadfix:把当前选中店铺下推查询(选店只拉该店 · 不被大店挤出 limit)
  const shops = [...((typeof SHOPIFY_SEARCH !== 'undefined' && SHOPIFY_SEARCH.shops) || [])];
  await SHOPIFY.loadOrdersFromDB(force, { from, to, shops });
  const skus = [];
  SHOPIFY._orders.forEach(o => (o.line_items || []).forEach(li => { if (li.sku) skus.push(li.sku); }));
  SHOPIFY._productMap = await SHOPIFY.loadProductImageMap([...new Set(skus)]);
  renderShopifyOrders();  // 内部已同步刷新状态计数
  renderSalesStats();  // 业绩面板
  // V20260601-loadfix:达到加载上限提示
  if (SHOPIFY._loadTruncated) {
    const hint = document.getElementById('salesFetchHint');
    if (hint) hint.textContent = '⚠ 当前范围订单较多(已加载上限 5000 单)· 选具体店铺或缩小日期可看全';
  }
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
  const fmt = _ymdLocal;  // V20260601-tzfix:本地日期
  fromEl.value = fmt(from);
  toEl.value = fmt(today);
  // 立刻按新区间从本地读
  shopifyReloadOrdersAndRender(true);
}

function shopifyRefreshCounts() {
  // V20260601-loadfix:计数口径与列表对齐 · 应用店铺 chip + 快筛日期(数据已按范围完整加载 → 数字精确)
  let orders = SHOPIFY._orders;
  if (SHOPIFY_SEARCH && SHOPIFY_SEARCH.shops && SHOPIFY_SEARCH.shops.size > 0) {
    orders = orders.filter(o => SHOPIFY_SEARCH.shops.has(o.shop_domain || ''));
  }
  if (typeof SHOPIFY_DATE_PRESET !== 'undefined' && SHOPIFY_DATE_PRESET && SHOPIFY_DATE_PRESET !== 'all' && typeof isDateInRange === 'function') {
    orders = orders.filter(o => isDateInRange(o.shopify_created_at || o.created_at, SHOPIFY_DATE_PRESET));
  }
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

// ============================================================
// V5-W3-2026-05-25: 新增元素的 helper 函数(纯 ADD,不动任何已有逻辑)
//   1. 国家代码 → 中文(US → 美国,避免下单错误)
//   2. 运输方式(Standard / Express,筛选 + 显示)
//   3. 付款时间(类似店小秘,下单 + 付款 都展示)
// 全部从 raw_payload 提取,不需要后端改动
// ============================================================
const COUNTRY_CN_MAP = {
  US:'美国', CA:'加拿大', GB:'英国', UK:'英国', AU:'澳大利亚', NZ:'新西兰',
  FR:'法国', DE:'德国', IT:'意大利', ES:'西班牙', NL:'荷兰', BE:'比利时',
  CH:'瑞士', AT:'奥地利', IE:'爱尔兰', PT:'葡萄牙', GR:'希腊',
  SE:'瑞典', NO:'挪威', DK:'丹麦', FI:'芬兰', IS:'冰岛',
  PL:'波兰', CZ:'捷克', HU:'匈牙利', RO:'罗马尼亚', BG:'保加利亚',
  RU:'俄罗斯', UA:'乌克兰', TR:'土耳其', IL:'以色列',
  JP:'日本', KR:'韩国', CN:'中国', HK:'香港', TW:'台湾', MO:'澳门',
  SG:'新加坡', MY:'马来西亚', TH:'泰国', PH:'菲律宾', VN:'越南', ID:'印尼',
  IN:'印度', PK:'巴基斯坦', BD:'孟加拉国', LK:'斯里兰卡',
  BR:'巴西', MX:'墨西哥', AR:'阿根廷', CL:'智利', CO:'哥伦比亚', PE:'秘鲁',
  SA:'沙特阿拉伯', AE:'阿联酋', QA:'卡塔尔', KW:'科威特', BH:'巴林', OM:'阿曼',
  ZA:'南非', EG:'埃及', NG:'尼日利亚', KE:'肯尼亚', MA:'摩洛哥',
  PR:'波多黎各',
};
function countryToChinese(code) {
  if (!code) return '';
  return COUNTRY_CN_MAP[String(code).toUpperCase()] || '';
}
// 提取 Shopify 订单的运输方式 title(如 "Standard Shipping (4-6weeks)")
function getShippingMethod(o) {
  const sl = (o && o.raw_payload && o.raw_payload.shipping_lines) || null;
  if (Array.isArray(sl) && sl.length > 0) {
    return String(sl[0].title || '').trim();
  }
  return '';
}
// 提取付款时间(processed_at)
function getPaymentTime(o) {
  return (o && o.raw_payload && o.raw_payload.processed_at) || null;
}
// V28k: 提取运费金额(多来源 fallback · 兼容 Shopify 各种字段 + WooCommerce)
function getShippingFee(o) {
  if (!o) return 0;
  // V20260604:优先用入库时存好的 shipping_fee 小列(精简查询带得到 · 不依赖 raw_payload)
  if (o.shipping_fee !== undefined && o.shipping_fee !== null && o.shipping_fee !== '') {
    return Number(o.shipping_fee) || 0;
  }
  const raw = o.raw_payload || {};

  // ── WooCommerce ──
  if (o.platform === 'woo') {
    if (raw.shipping_total !== undefined) return parseFloat(raw.shipping_total) || 0;
    return Number(o.total_shipping || 0);
  }

  // ── Shopify 多来源(按可靠度排序)──
  // 1. total_shipping_price_set.shop_money.amount(Shopify 标准运费字段 · 最准)
  const setAmt = raw.total_shipping_price_set?.shop_money?.amount
              ?? raw.total_shipping_price_set?.presentment_money?.amount;
  if (setAmt !== undefined && setAmt !== null) return parseFloat(setAmt) || 0;

  // 2. shipping_lines[].price / discounted_price 求和
  if (Array.isArray(raw.shipping_lines) && raw.shipping_lines.length > 0) {
    return raw.shipping_lines.reduce((s, line) => {
      const p = line.discounted_price ?? line.price ?? 0;
      return s + (parseFloat(p) || 0);
    }, 0);
  }

  // 3. normalized 字段
  if (o.total_shipping !== undefined && o.total_shipping !== null && o.total_shipping !== '') {
    return Number(o.total_shipping) || 0;
  }

  // 4. 间接算:total - subtotal - tax(都从 raw 拿 · 兜底)
  const total = parseFloat(raw.total_price ?? o.total_price ?? 0);
  const subtotal = parseFloat(raw.subtotal_price ?? raw.current_subtotal_price ?? 0);
  const tax = parseFloat(raw.total_tax ?? raw.current_total_tax ?? 0);
  if (total > 0 && subtotal > 0) {
    const diff = total - subtotal - tax;
    if (diff > 0.01) return diff;
  }

  return 0;
}

// V28w: WooCommerce 变体 URL 诊断 · 控制台跑 diagWooVariant() 看每行的 meta_data 结构
window.diagWooVariant = function() {
  const orders = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) ? SHOPIFY._orders.filter(o => o.platform === 'woo').slice(0, 5) : [];
  if (orders.length === 0) { console.log('没有 woo 订单 · 先同步 mooielight'); return; }
  console.log('=== Woo 变体 URL 诊断(前 5 单)===');
  orders.forEach(o => {
    const raw = o.raw_payload || {};
    const rawLis = Array.isArray(raw.line_items) ? raw.line_items : [];
    console.log(`%c订单 ${o.shopify_order_number}`, 'color:#10b981;font-weight:bold');
    rawLis.forEach((li, i) => {
      const attrs = (li.meta_data || []).filter(m => m.key && !m.key.startsWith('_'));
      console.log(`  行${i+1}: ${li.name}`);
      console.log(`    product_id=${li.product_id} variation_id=${li.variation_id} sku=${li.sku}`);
      console.log(`    meta_data(${attrs.length}个):`, attrs.map(m => `${m.key}=${m.value || m.display_value}`));
      // 生成测试 URL
      const params = attrs.map(m => {
        const k = m.key.startsWith('pa_') ? 'attribute_' + m.key : 'attribute_' + m.key;
        return k + '=' + encodeURIComponent(m.value || m.display_value || '');
      }).filter(Boolean);
      const url = `https://${o.shop_domain}/?p=${li.product_id}${params.length ? '&' + params.join('&') : ''}`;
      console.log(`    %c前台 URL: ${url}`, 'color:#7c3aed');
    });
  });
  console.log('=== 复制 URL 打开看是否精确到变体 ===');
};

// V28k: 诊断命令 · 控制台跑 diagShipping() 看前 5 单运费来源
window.diagShipping = function() {
  const orders = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) ? SHOPIFY._orders : [];
  if (orders.length === 0) { console.log('没有订单 · 先同步'); return; }
  
  // V28η:统计概览(全量)
  let paid = 0, free = 0, rawEmpty = 0;
  const sample = { paid: [], free: [], rawEmpty: [] };
  orders.forEach(o => {
    const raw = o.raw_payload || {};
    const rawHasData = Object.keys(raw).length > 0;
    const fee = getShippingFee(o);
    if (!rawHasData) {
      rawEmpty++;
      if (sample.rawEmpty.length < 3) sample.rawEmpty.push(o.shopify_order_number);
    } else if (fee > 0) {
      paid++;
      if (sample.paid.length < 3) sample.paid.push({ no: o.shopify_order_number, fee, title: getShippingMethod(o) });
    } else {
      free++;
      if (sample.free.length < 3) sample.free.push({ no: o.shopify_order_number, title: getShippingMethod(o) });
    }
  });
  console.log('%c=== 运费诊断概览 ===', 'font-size:14px;color:#0d9488;font-weight:bold');
  console.log(`总订单: ${orders.length}`);
  console.log(`%c✅ 付费运输(快速): ${paid} 单`, 'color:#16a34a;font-weight:bold');
  if (sample.paid.length) console.log('  样本:', sample.paid);
  console.log(`%c⚪ 免运费(标准): ${free} 单`, 'color:#6b7280;font-weight:bold');
  if (sample.free.length) console.log('  样本:', sample.free);
  console.log(`%c⚠ raw_payload 空: ${rawEmpty} 单 ${rawEmpty > 0 ? '← 这些订单运费判断不了!' : ''}`, rawEmpty > 0 ? 'color:#dc2626;font-weight:bold' : 'color:#666');
  if (sample.rawEmpty.length) console.log('  样本:', sample.rawEmpty);
  console.log('');
  console.log('=== 前 5 单详细字段(看 raw_payload 结构是否对)===');
  orders.slice(0, 5).forEach(o => {
    const raw = o.raw_payload || {};
    console.log(`%c${o.shopify_order_number}`, 'font-weight:bold', {
      平台: o.platform || 'shopify',
      'getShippingFee结果': getShippingFee(o),
      'getShippingMethod结果': getShippingMethod(o),
      'isExpress判断': isExpressShipping(o) ? '🚀 快速' : '🚚 标准',
      '①total_shipping_price_set.shop_money.amount': raw.total_shipping_price_set?.shop_money?.amount,
      '②shipping_lines样例': Array.isArray(raw.shipping_lines) ? raw.shipping_lines.map(l => ({ title: l.title, price: l.price, discounted: l.discounted_price })) : '无',
      '③total_shipping字段': o.total_shipping,
      'raw顶层key': Object.keys(raw).slice(0, 12),
    });
  });
  if (rawEmpty > orders.length * 0.3) {
    console.log('%c⚠️ raw_payload 缺失率高 · 需重新同步(F12 → 销售单 → 同步 拉新数据)', 'color:#dc2626;font-size:13px;font-weight:bold');
  }
};

// V28η:回归用户原始口径 · 付了运费 = 快速运输 · 不管 shipping title 叫啥
// 之前 V28x 让 STD 关键词命中(如 title="Standard Shipping")直接归标准 → 即使付了费
// 用户反馈:"客户支付了运费的订单还是无法筛选" → 改回按费用主判断
function isExpressShipping(o) {
  // 主逻辑:付了运费 = 快速运输(用户口径)
  const fee = getShippingFee(o);
  if (fee > 0) return true;
  // 兜底:免运费但 method 含明确快递关键词(如客户用满减券免运费但选了 DHL Express)
  const method = getShippingMethod(o).toLowerCase();
  if (!method) return false;
  const EXPRESS_KW = (localStorage.getItem('shopify_express_keywords') || 
    'express,priority,overnight,加急,dhl express,fedex priority,ups next').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return EXPRESS_KW.some(kw => method.includes(kw));
}
// 格式化 ISO 时间为 "MM-DD HH:mm"(下单/付款时间用)
function fmtShortDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mo}-${dy} ${hh}:${mm}`;
}

// 选中订单 ID 集合
const SHOPIFY_SELECTED = new Set();
// V4：销售单拆单选择（orderId -> Set<shopify_line_item_id>），用于"仅为选中开 PO"
const SHOPIFY_SPLIT_SEL = new Map();

function shopifySetSearchType(t) {
  SHOPIFY_SEARCH.type = t;
  document.querySelectorAll('.search-type-chip').forEach(el => el.classList.toggle('active', el.dataset.searchType === t));
  shopifyDoSearch();
}

// V28x:订单规则自定义(每个跟单独立配置 · 存 localStorage)
const RULE_DEFS = [
  { key: 'has_note',          label: '💬 有备注' },
  { key: 'has_internal',      label: '📝 有内部备注' },
  { key: 'refunded',          label: '💸 退款单' },
  { key: 'big_amount',        label: '💰 大额 ≥¥3000' },
  { key: 'big_qty',           label: '📦 高数量 ≥5件' },
  { key: 'overdue',           label: '⏰ 超时未发 ≥7天' },
  { key: 'express_shipping',  label: '⚡ 快速运输' },
  { key: 'standard_shipping', label: '🚚 标准运输' },
  { key: 'manual',            label: '✍ 自定义订单' },
  { key: 'unknown_sku',       label: '❓ 未配对 SKU' },
];
function _getHiddenRules() {
  try {
    return new Set(JSON.parse(localStorage.getItem('shopify_hidden_rules') || '[]'));
  } catch (_) { return new Set(); }
}
function openRuleConfig() {
  const body = document.getElementById('ruleConfigBody');
  if (!body) return;
  const hidden = _getHiddenRules();
  body.innerHTML = RULE_DEFS.map(r => `
    <label style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:13px;">
      <input type="checkbox" data-rule-config="${r.key}" ${hidden.has(r.key) ? '' : 'checked'} style="width:16px; height:16px;">
      <span>${r.label}</span>
    </label>
  `).join('');
  document.getElementById('ruleConfigExpressKw').value = localStorage.getItem('shopify_express_keywords') || '';
  document.getElementById('ruleConfigStdKw').value = localStorage.getItem('shopify_standard_keywords') || '';
  document.getElementById('ruleConfigModal').classList.add('show');
}
window.openRuleConfig = openRuleConfig;
function closeRuleConfig() {
  document.getElementById('ruleConfigModal').classList.remove('show');
}
window.closeRuleConfig = closeRuleConfig;
function saveRuleConfig() {
  const hidden = [];
  document.querySelectorAll('[data-rule-config]').forEach(cb => {
    if (!cb.checked) hidden.push(cb.dataset.ruleConfig);
  });
  localStorage.setItem('shopify_hidden_rules', JSON.stringify(hidden));
  const exp = (document.getElementById('ruleConfigExpressKw').value || '').trim();
  const std = (document.getElementById('ruleConfigStdKw').value || '').trim();
  if (exp) localStorage.setItem('shopify_express_keywords', exp);
  else localStorage.removeItem('shopify_express_keywords');
  if (std) localStorage.setItem('shopify_standard_keywords', std);
  else localStorage.removeItem('shopify_standard_keywords');
  applyHiddenRules();
  closeRuleConfig();
  if (typeof shopifyRefreshRuleCounts === 'function') shopifyRefreshRuleCounts();
  if (typeof renderShopifyOrders === 'function') renderShopifyOrders();
  if (typeof toast === 'function') toast('✓ 配置已保存', 'success', 1500);
}
window.saveRuleConfig = saveRuleConfig;
function resetRuleConfig() {
  if (!confirm('重置为默认?(显示所有规则 + 清空关键词)')) return;
  localStorage.removeItem('shopify_hidden_rules');
  localStorage.removeItem('shopify_express_keywords');
  localStorage.removeItem('shopify_standard_keywords');
  openRuleConfig();
}
window.resetRuleConfig = resetRuleConfig;
function applyHiddenRules() {
  const hidden = _getHiddenRules();
  document.querySelectorAll('.rule-chip.rule-customizable').forEach(el => {
    el.style.display = hidden.has(el.dataset.rule) ? 'none' : '';
  });
}
window.applyHiddenRules = applyHiddenRules;
// 页面加载时应用一次
setTimeout(applyHiddenRules, 500);
setTimeout(applyHiddenRules, 1500);  // 兜底

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
  // V20260527p: 修 bug · 旧 shopifyRenderShops 不存在 · 正确名 renderShopifyStores
  if (typeof renderShopifyStores === 'function') renderShopifyStores();
  _updateShopFilterStatusBar();
  // V20260601-loadfix:切店铺重新查库(下推 shop)
  if (typeof shopifyReloadOrdersAndRender === 'function') shopifyReloadOrdersAndRender(false);
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
    // V5-W3-2026-05-25: 运输方式快筛(纯 ADD)
    // V28d 改:快速=付了运费 · 标准=免运费(不再要求有 method 名)
    case 'express_shipping': return isExpressShipping(o);
    case 'standard_shipping': return !isExpressShipping(o);
    default: return true;
  }
}

// 刷新规则 chip 计数
// 计数遵循"所见即所得"原则：显示**当前 sub-tab 范围内**命中的数量
// 同时缓存全局命中数（不限 sub-tab）到 SHOPIFY._ruleGlobalCounts，用于空结果引导
function shopifyRefreshRuleCounts() {
  // V20260601-fetchfix:规则计数也按店铺 chip + 快筛日期过滤 · 和列表对齐(消除"标准运输460"这类全店串数)
  let all = SHOPIFY._orders || [];
  if (SHOPIFY_SEARCH && SHOPIFY_SEARCH.shops && SHOPIFY_SEARCH.shops.size > 0) {
    all = all.filter(o => SHOPIFY_SEARCH.shops.has(o.shop_domain || ''));
  }
  if (typeof SHOPIFY_DATE_PRESET !== 'undefined' && SHOPIFY_DATE_PRESET && SHOPIFY_DATE_PRESET !== 'all' && typeof isDateInRange === 'function') {
    all = all.filter(o => isDateInRange(o.shopify_created_at || o.created_at, SHOPIFY_DATE_PRESET));
  }
  const filter = SHOPIFY._currentFilter || 'all';
  // 当前 sub-tab 范围
  const currentScope = filter === 'all'
    ? all.filter(o => o.local_status !== 'cancelled' && o.local_status !== 'done')
    : all.filter(o => o.local_status === filter);
  // 全局 active 范围（待审核 + 待处理，不含已完成/已取消）
  const globalActive = all.filter(o => o.local_status !== 'cancelled' && o.local_status !== 'done');

  const rules = ['has_note', 'has_internal', 'refunded', 'big_amount', 'big_qty', 'overdue', 'express_shipping', 'standard_shipping', 'manual', 'unknown_sku'];
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
  // V5-2026-05-24: 修复 404 - 用真实 product_handle 跳转
  // V5-W3-2026-05-25: 加 ?variant=xxx 深链到客户实际买的 SKU
  //   不加 → 只到产品页,显示默认 variant(可能是错的颜色/尺寸)
  //   加上 → Shopify 自动选中该 variant + 显示对应图 + 对应价格
  // 老订单可能没有 handle,需要先跑 backfill_handles 补全
  if (mode === 'storefront') {
    // 【唯一正确】有 product_handle 直接拼前台 URL
    if (item.product_handle && order.shop_domain) {
      // V5-W3: 拼 variant query 让前台直接打开客户买的那个 SKU
      const variantParam = item.variant_id ? `?variant=${item.variant_id}` : '';
      const url = `https://${order.shop_domain}/products/${item.product_handle}${variantParam}`;
      console.log('%c[Shopify 前台]', 'color:#10b981;font-weight:bold', { sku: item.sku, variant_id: item.variant_id, url });
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    // 没 handle → 提示去跑补全,跳后台兜底
    if (item.product_id && order.shop_domain) {
      toast('该订单缺少 product_handle (老数据),跳后台编辑页。请管理员跑一次 "补全 handle"', 'warn', 5000);
      // 跳后台,跟单可以从那里点 "在线查看" 跳前台
      const url = `https://${order.shop_domain}/admin/products/${item.product_id}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    toast('无法定位前台商品页(订单缺产品 ID)', 'err');
    return;
  }
  
  // ============ 后台模式(默认) ============
  // 【层 1】最优: Shopify 后台产品编辑页
  if (item.product_id && order.shop_domain && order.shop_domain !== 'manual') {
    const url = `https://${order.shop_domain}/admin/products/${item.product_id}`;
    console.log('%c[Shopify 后台 · 用 product_id]', 'color:#2563eb;font-weight:bold', { 
      sku: item.sku, product_id: item.product_id, url 
    });
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  
  // 【层 2】兜底: 用 SKU 搜 Shopify 后台
  if (item.sku && order.shop_domain && order.shop_domain !== 'manual') {
    const url = `https://${order.shop_domain}/admin/products?selectedView=all&query=${encodeURIComponent(item.sku)}`;
    console.log('%c[Shopify 后台 · 搜 SKU]', 'color:#f59e0b;font-weight:bold', { sku: item.sku, url });
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
  ['batchApproveBtn', 'batchDoneBtn', 'batchCancelBtn', 'batchOpenPoBtn'].forEach(id => {
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

// V20260526e: 销售单日期筛选
let SHOPIFY_DATE_PRESET = 'all';
function shopifyOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        SHOPIFY_DATE_PRESET = customPreset;
        const el = document.getElementById('shopifyDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        renderShopifyOrders();
      });
    }
    return;
  }
  SHOPIFY_DATE_PRESET = preset || 'all';
  SHOPIFY_PAGE = 1;
  renderShopifyOrders();
}

function renderShopifyOrders() {
  const body = document.getElementById('salesOrdersBody');
  if (!body) return;
  // V20260601-loadfix:每次渲染同步刷新状态计数 · 保证卡片数字与当前店铺/日期视图一致
  if (typeof shopifyRefreshCounts === 'function') shopifyRefreshCounts();
  
  // V20260526o: 关键修复 · 先填充日期 select(避免空状态时早 return 跳过)
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('salesDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, (typeof SHOPIFY_DATE_PRESET !== 'undefined') ? SHOPIFY_DATE_PRESET : 'all');
  }
  
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

  // V20260526e: 应用日期筛选(基于 shopify_created_at)
  if (typeof SHOPIFY_DATE_PRESET !== 'undefined' && SHOPIFY_DATE_PRESET && SHOPIFY_DATE_PRESET !== 'all' && typeof isDateInRange === 'function') {
    orders = orders.filter(o => isDateInRange(o.shopify_created_at || o.created_at, SHOPIFY_DATE_PRESET));
  }

  // V28β:快筛"未下完" · 只显示没下 PO 的(po_progress < line_items 数量)
  if (window._salesOnlyNoPo) {
    orders = orders.filter(o => {
      const totalLines = Array.isArray(o.line_items) ? o.line_items.length : 0;
      const assigned = Number(o.po_progress || 0);
      return totalLines > 0 && assigned < totalLines;
    });
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
      express_shipping: '⚡ 快速运输', standard_shipping: '🚚 标准运输',
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
      // V5-W3-2026-05-25 修复:优先用 line_item 的 variant 真图,fallback 到 products 表主图
      // 旧逻辑 `p.image_url || li.image_url` → 总显示主图(products 表存的是主图)
      // 新逻辑 `li.image_url || p.image_url` → 显示客户实际买的那张 variant 图
      const imgUrl = li.image_url || p.image_url || '';
      const nameCn = p.name_cn || '';
      const title = nameCn || li.title || '(无名)';
      const variant = li.variant_title || '';
      const hasPo = (li.po_assignments || []).length > 0;
      // V4：标题和 SKU 可点击跳转到产品 tab
      // V5-2026-05-24: 双图标 - 🔧 跳后台编辑 / 🛒 跳前台商品页
      const liId = li.shopify_line_item_id || '';
      const skuEsc = escapeHtml(li.sku || '').replace(/'/g, "\\'");
      const isWoo = o.platform === 'woo';  // V28i: woo 平台
      const hasShopifyProduct = li.sku && o.shop_domain && o.shop_domain !== 'manual' && !isWoo;
      
      // V28w:WooCommerce 变体 URL 深度修复
      //   旧 bug:?p=variation_id 会 404(variation 是隐藏子产品,不能直接 ?p=)
      //   新方案:?p=product_id(主产品·WP 会 301 到 /product/slug/)+ 从 raw_payload 提取 attribute 参数精准到变体
      //   WC 标准变体 URL 格式:/product/slug/?attribute_pa_color=walnut&attribute_pa_plug=us
      const wooBase = isWoo ? ('https://' + String(o.shop_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')) : '';
      let wooFrontUrl = '';
      let wooFrontHint = '';
      if (isWoo && li.product_id) {
        // 1) 主产品 URL(用 ?p=product_id · WP 301 跳转到 /product/slug/)
        const baseUrl = `${wooBase}/?p=${li.product_id}`;
        // 2) 从 raw_payload 找这一行的 meta_data · 提取 attribute_pa_xxx 参数
        const rawLis = (o.raw_payload && Array.isArray(o.raw_payload.line_items)) ? o.raw_payload.line_items : [];
        const rawLi = rawLis.find(rl => rl.variation_id === li.variation_id && rl.product_id === li.product_id) 
                   || rawLis.find(rl => rl.product_id === li.product_id);
        const attrParams = [];
        if (rawLi && Array.isArray(rawLi.meta_data)) {
          for (const m of rawLi.meta_data) {
            // WC 标准:全局属性 key 形如 "pa_color" / 本地属性 "Color"
            //         订单 meta_data 里 m.key 是属性 key · m.value 是 slug(用于 URL)
            if (!m.key || m.key.startsWith('_')) continue;  // 跳过私有 meta(_开头)
            const k = m.key.startsWith('pa_') ? 'attribute_' + m.key : 'attribute_' + m.key;
            const v = (m.value || m.display_value || '').toString();
            if (v) attrParams.push(k + '=' + encodeURIComponent(v));
          }
        }
        wooFrontUrl = attrParams.length > 0 ? `${baseUrl}&${attrParams.join('&')}` : baseUrl;
        wooFrontHint = attrParams.length > 0 ? ' · 精确到变体' : (li.variation_id ? ' · 主产品页(变体属性未抓到)' : '');
      } else if (isWoo && li.sku) {
        // 没 product_id · 退回 SKU 搜索
        wooFrontUrl = `${wooBase}/?s=${encodeURIComponent(li.sku)}&post_type=product`;
        wooFrontHint = ' · 按SKU搜索';
      }
      // 后台链接:变体在父产品页编辑 · 用 product_id
      const wooAdminUrl = isWoo && li.product_id ? `${wooBase}/wp-admin/post.php?post=${li.product_id}&action=edit` : '';
      const wooIcons = isWoo ? `
        ${wooAdminUrl ? `<a href="${wooAdminUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();"
           style="margin-left:6px; color:var(--accent); text-decoration:none; font-size:11px; opacity:0.85;"
           title="🔧 在 WordPress 后台打开此产品(编辑/库存/价格)">🔧</a>` : ''}
        ${wooFrontUrl ? `<a href="${wooFrontUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();"
           style="margin-left:4px; color:var(--success); text-decoration:none; font-size:11px; opacity:0.85;"
           title="🛒 在店铺前台打开商品页(客户视角${wooFrontHint})">🛒</a>` : ''}
      ` : '';
      
      // SKU 可点击(主操作 - 跳 Shopify 后台)
      const tipBackend = li.product_id ? '点击打开 Shopify 后台产品页' : '点击搜索 Shopify 后台 SKU';
      const skuClickable = li.sku 
        ? hasShopifyProduct
          ? `<a href="#" onclick="event.preventDefault();event.stopPropagation();openShopifyProductInBrowser('${o.id}','${liId}','admin'); return false;" style="color:var(--accent); text-decoration:none; cursor:pointer;" title="${tipBackend}">${escapeHtml(li.sku)}</a>`
          : isWoo && wooAdminUrl
            ? `<a href="${wooAdminUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="color:var(--accent); text-decoration:none; cursor:pointer;" title="点击打开 WordPress 后台产品页">${escapeHtml(li.sku)}</a>`
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
      // V5-2026-05-25 修复布局错位:
      // 旧:splitCheckbox + img + info + qty = 4 个子元素塞进 3 列 grid → qty 换行 + 图被推到 1fr 列
      // 新:把 checkbox 绝对定位包进 leftcol,grid 永远 3 列
      return `
        <div class="so-product-line">
          <div class="so-prod-leftcol">
            ${splitCheckbox}
            ${imgUrl ? `<img loading="lazy" class="so-prod-img" src="${escapeHtml(imgUrl)}" data-fullsrc="${escapeHtml(imgUrl)}" onclick="openImgLightbox(this.dataset.fullsrc)" alt="">` : `<div class="so-prod-noimg">📷</div>`}
          </div>
          <div class="so-prod-info">
            ${li.sku ? `<div class="so-prod-sku">SKU: ${skuClickable}${shopifyIcons}${wooIcons}${localProductIcon}${hasPo ? ' · <span style="color:var(--success)">✓ 已开 PO</span>' : ''}</div>` : ''}
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
        ${!isFullyRefunded ? `<button class="so-action-btn" onclick="openPoWizard('${o.id}')" title="新人引导:5 步走完整流程 · 防漏关键字段(电压/标准/光源等)" style="background:linear-gradient(135deg,#fef3c7,#fff);border-color:#fbbf24;color:#92400e;">🪄 新人引导</button>` : ''}
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
            ${(() => {
              // V5-W3-2026-05-25: 加客户付款时间(纯 ADD)
              const pt = getPaymentTime(o);
              const ptStr = fmtShortDateTime(pt);
              return ptStr ? `<span style="color:var(--text-secondary);">付款 <b style="color:var(--success);">${ptStr}</b></span>` : '';
            })()}
            ${(() => {
              // V5-W3-2026-05-25: 加运输方式(快速/标准)
              const sm = getShippingMethod(o);
              if (!sm) return '';
              const exp = isExpressShipping(o);
              const icon = exp ? '⚡' : '🚚';
              const col = exp ? '#dc2626' : 'var(--text-secondary)';
              const bg = exp ? 'rgba(220,38,38,0.08)' : 'rgba(0,0,0,0.04)';
              return `<span style="display:inline-flex; align-items:center; gap:3px; padding:2px 8px; border-radius:4px; background:${bg}; color:${col}; font-size:11px; font-weight:600;" title="客户选的运输方式">${icon} ${escapeHtml(sm)}</span>`;
            })()}
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
        <div class="so-card-body" style="display:flex; align-items:flex-start; gap:20px; padding:12px 14px;">
          <div class="so-products" style="flex:1 1 auto; min-width:0; max-width:720px; display:flex; flex-direction:column; gap:8px;">${productsHtml}</div>
          <div class="so-card-side" style="flex-shrink:0; flex-grow:0; width:220px; min-width:0; margin-left:0; display:flex; flex-direction:column; gap:8px; padding-left:14px; border-left:1px dashed var(--border-subtle);">
            <!-- 客户 -->
            <div class="so-recipient">
              <div class="name">${escapeHtml(customerName)}</div>
              ${customerEmail ? `<div class="email">${escapeHtml(customerEmail)}</div>` : ''}
              <div class="country">${SHOPIFY.flagEmoji(country)} ${escapeHtml(city)}${country ? `, ${country}` : ''}</div>
              ${countryToChinese(country) ? `<div style="font-size:11px; color:var(--accent); font-weight:600; margin-top: 2px;" title="自动翻译,避免下错单">📍 ${countryToChinese(country)}</div>` : ''}
            </div>
            <!-- 金额 -->
            <div class="so-amount-block">
              <div><span class="so-amount-big">${o.total_price ? parseFloat(o.total_price).toFixed(2) : '0.00'}</span><span class="so-amount-cur">${o.currency || ''}</span></div>
              <div class="so-amount-sub">${totalQty} 件 · ${items.length} 行</div>
            </div>
            ${(() => {
              // V28i: woo 专属订单详情(支付/运费/税/发票/后台链接)
              if (o.platform !== 'woo') return '';
              const rp = o.raw_payload || {};
              const wooBase = 'https://' + String(o.shop_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
              const pay = rp.payment_method_title || rp.payment_method || '';
              const ship = parseFloat(rp.shipping_total || 0);
              const tax = parseFloat(rp.total_tax || 0);
              const invoice = rp.wpo_wcpdf_invoice_number || '';
              const cur = o.currency || '';
              const rows = [];
              if (pay) rows.push(`💳 ${escapeHtml(pay)}`);
              rows.push(`🚚 运费 ${cur} ${ship.toFixed(2)}${ship > 0 ? ' <span style="color:var(--accent);">(快速)</span>' : ' <span style="color:var(--text-tertiary);">(免/标准)</span>'}`);
              if (tax > 0) rows.push(`🧾 税 ${cur} ${tax.toFixed(2)}`);
              if (invoice) rows.push(`📄 发票号 ${escapeHtml(invoice)}`);
              return `<div style="font-size:11px; color:var(--text-secondary); line-height:1.7; padding:8px; background:rgba(124,58,237,0.05); border-radius:6px; border:1px solid rgba(124,58,237,0.12);">
                <div style="font-weight:600; color:#7c3aed; margin-bottom:3px;">🌐 WooCommerce 详情</div>
                ${rows.map(r => `<div>${r}</div>`).join('')}
                <div style="margin-top:5px; padding-top:5px; border-top:1px dashed var(--border-subtle); display:flex; gap:8px; flex-wrap:wrap;">
                  <a href="${wooBase}/wp-admin/post.php?post=${o.wp_order_id}&action=edit" target="_blank" rel="noopener" style="color:var(--accent); text-decoration:none; font-size:11px;" title="在 WP 后台打开此订单">🔧 后台订单</a>
                  ${invoice ? `<a href="${wooBase}/wp-admin/post.php?post=${o.wp_order_id}&action=edit" target="_blank" rel="noopener" style="color:var(--success); text-decoration:none; font-size:11px;" title="发票在订单页下载">📄 发票</a>` : ''}
                </div>
              </div>`;
            })()}
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
  // V20260526e: 填充日期筛选下拉
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('shopifyDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, (typeof SHOPIFY_DATE_PRESET !== 'undefined') ? SHOPIFY_DATE_PRESET : 'all');
  }
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



// ============================================================================
// V5-W3-2026-05-26: 销售单批量开 PO
// ----------------------------------------------------------------------------
// 用户场景:搜了同款 SKU 有 N 个订单,想一次性给同一供应商开 PO
// 流程:
//   1) 用户勾选多个销售单 → 点「📦 批量开 PO」
//   2) 弹出预览:按"国家"自动分组(同国家 = 1 张 PO,多 SKU)
//   3) 选供应商 + 基础单价 → 点"生成 N 张 PO"
//   4) 后端循环 insert N 张 PO
// 不同国家 → 自动拆成多张 PO(因为电气标准不同)
// 同一国家不同 SKU → 合并到 1 张 PO
// ============================================================================

let BATCH_PO_STATE = null;

async function shopifyBatchOpenPo() {
  const ids = [...SHOPIFY_SELECTED];
  if (ids.length === 0) { toast('请先勾选要开 PO 的销售单', 'warn'); return; }
  
  const orders = (SHOPIFY._orders || []).filter(o => ids.includes(o.id));
  if (orders.length === 0) { toast('找不到所选订单', 'err'); return; }
  
  // 过滤掉已被全部开过 PO 的 line items
  // 构建分组:按国家分组, 每个国家组里再合并相同 SKU
  const groups = {};  // { 'US_美规110V电压': { country: 'US', standard: '美规110V电压', orders: [...], lines: [...] } }
  
  for (const o of orders) {
    const coCode = (o.shipping_address && (o.shipping_address.country_code || o.shipping_address.country)) || o.shipping_country || 'UNKNOWN';
    const standard = (typeof getElectricalStandard === 'function')
      ? (getElectricalStandard(coCode, o.shipping_address?.country || o.shipping_country) || '')
      : '';
    const groupKey = `${coCode}_${standard}`;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        country: coCode,
        countryName: o.shipping_address?.country || o.shipping_country || coCode,
        standard,
        orders: [],
        lines: [],  // 每条:{ orderId, orderNo, liid, sku, title_cn, variant, image_url, qty, originalPrice, note, included }
      };
    }
    groups[groupKey].orders.push(o);
    
    for (const li of (o.line_items || [])) {
      // 跳过已完全开过 PO 的 line item
      const assigned = (li.po_assignments || []).reduce((s, a) => s + (a.qty || 0), 0);
      const remaining = (li.quantity || 0) - assigned;
      if (remaining <= 0) continue;
      
      // 默认价格:effective.last_purchase_price > 0 > 0
      let defaultPrice = 0;
      try {
        const eff = (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.effectiveBySku) 
          ? PRODUCTS_CACHE.effectiveBySku(li.sku) 
          : null;
        if (eff && eff.last_purchase_price) defaultPrice = Number(eff.last_purchase_price);
      } catch (_) {}
      
      // 自动提取本行备注(从 variant)
      let lineNote = '';
      try { 
        if (typeof extractVariantInfo === 'function') lineNote = extractVariantInfo(li.variant_title || '') || '';
      } catch (_) {}
      
      groups[groupKey].lines.push({
        orderId: o.id,
        orderNo: o.shopify_order_number,
        liid: li.shopify_line_item_id,
        sku: li.sku || '',
        title_cn: li.title_cn || li.title || '',
        title_en: li.title || '',
        variant: li.variant_title || '',
        image_url: li.image_url || '',
        qty: remaining,
        originalQty: remaining,
        price: defaultPrice,
        note: lineNote,
        included: true,
      });
    }
  }
  
  // 过滤掉空组(都已开过 PO)
  const validGroups = Object.entries(groups).filter(([k, g]) => g.lines.length > 0);
  if (validGroups.length === 0) {
    toast('所选订单已全部开过 PO,没有可开的 line item', 'warn');
    return;
  }
  
  // 初始化状态
  BATCH_PO_STATE = {
    groups: validGroups.map(([k, g]) => ({ key: k, ...g })),
    supplierName: '',
    supplierId: null,
    promisedDate: new Date().toISOString().slice(0, 10),
    globalNote: '',
  };
  
  document.getElementById('batchPoModalBg').style.display = 'flex';
  renderBatchPoModal();
}

function renderBatchPoModal() {
  const s = BATCH_PO_STATE;
  if (!s) return;
  const body = document.getElementById('batchPoBody');
  if (!body) return;
  
  // 统计:总行数 + 总件数
  let totalLines = 0, totalQty = 0, totalAmount = 0;
  s.groups.forEach(g => {
    g.lines.forEach(l => {
      if (l.included) {
        totalLines++;
        totalQty += Number(l.qty) || 0;
        totalAmount += (Number(l.qty) || 0) * (Number(l.price) || 0);
      }
    });
  });
  const willCreate = s.groups.filter(g => g.lines.some(l => l.included)).length;
  
  // 国旗
  const flagOf = (code) => {
    const map = { US: '🇺🇸', UK: '🇬🇧', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪', FR: '🇫🇷', MX: '🇲🇽', IT: '🇮🇹', ES: '🇪🇸', NL: '🇳🇱' };
    return map[code] || '🌐';
  };
  
  body.innerHTML = `
    <div style="background:rgba(37,99,235,0.06); padding:10px 14px; border-radius:6px; margin-bottom:14px; font-size:12px; color:var(--text-secondary); border-left:3px solid var(--accent);">
      💡 将创建 <b style="color:var(--accent);">${willCreate} 张 PO</b> · 共 <b>${totalLines}</b> 行 · 总 <b>${totalQty}</b> 件 · 合计 <b style="color:var(--danger);">¥ ${totalAmount.toFixed(2)}</b>
      <br>📌 同一国家的所有 SKU 合并成 1 张 PO,不同国家自动拆 PO(因为电气标准不同)
    </div>
    
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
      <div>
        <label style="display:block; font-size:11.5px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">供应商 <span style="color:var(--danger);">*</span></label>
        <div style="display:flex; gap:6px; position:relative;">
          <input type="text" id="batchPoSupplierInput" value="${escapeHtml(s.supplierName)}" placeholder="🔍 搜索 / 直接添加..." 
            oninput="batchPoSupplierSearch(this.value)" onfocus="batchPoSupplierSearch(this.value)" 
            onblur="setTimeout(()=>{const r=document.getElementById('batchPoSupplierResults'); if(r)r.style.display='none';}, 200)"
            style="flex:1; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
          <div id="batchPoSupplierResults" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:10; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; max-height:220px; overflow-y:auto; box-shadow:var(--shadow-md); margin-top:4px;"></div>
        </div>
      </div>
      <div>
        <label style="display:block; font-size:11.5px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">下单日期 <span style="color:var(--danger);">*</span></label>
        <input type="date" value="${s.promisedDate}" oninput="BATCH_PO_STATE.promisedDate=this.value" 
          style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
      </div>
    </div>
    
    <div style="margin-bottom: 14px;">
      <label style="display:block; font-size:11.5px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">全单备注 <span style="font-weight:400; color:var(--text-tertiary);">(可选,会应用到所有 PO 的"全单备注"字段)</span></label>
      <input type="text" value="${escapeHtml(s.globalNote)}" oninput="BATCH_PO_STATE.globalNote=this.value" 
        placeholder="例:本周必出 / 优先 / 整批包装统一标准"
        style="width:100%; padding:7px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
    </div>
    
    <!-- 预览:每个国家组一张表格 -->
    ${s.groups.map((g, gi) => {
      const groupQty = g.lines.filter(l => l.included).reduce((s, l) => s + Number(l.qty || 0), 0);
      const groupAmount = g.lines.filter(l => l.included).reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0);
      const includedCount = g.lines.filter(l => l.included).length;
      return `
        <div style="border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:12px; overflow:hidden;">
          <div style="background:#fef9f3; padding:10px 14px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:600; font-size:13.5px;">
              ${flagOf(g.country)} <b>PO #${gi+1}</b> · ${escapeHtml(g.countryName)}
              ${g.standard ? ` · <span style="color:#c2410c; font-family:monospace; font-size:12px;">${escapeHtml(g.standard)}</span>` : ''}
            </div>
            <div style="font-size:12px; color:var(--text-secondary);">
              ${includedCount}/${g.lines.length} 行 · ${groupQty} 件 · <b style="color:var(--danger);">¥ ${groupAmount.toFixed(2)}</b>
            </div>
          </div>
          <div style="padding:0;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead>
                <tr style="background:var(--bg-elevated);">
                  <th style="width:30px; padding:6px 4px;"><input type="checkbox" ${g.lines.every(l => l.included) ? 'checked' : ''} onchange="batchPoToggleGroup(${gi}, this.checked)"></th>
                  <th style="width:80px; padding:6px;">订单号</th>
                  <th style="width:46px; padding:6px;"></th>
                  <th style="padding:6px;">SKU / 产品名 / 变体</th>
                  <th style="width:60px; padding:6px; text-align:center;">数量</th>
                  <th style="width:80px; padding:6px; text-align:right;">单价 ¥</th>
                  <th style="width:80px; padding:6px; text-align:right;">小计</th>
                  <th style="padding:6px;">本行备注</th>
                </tr>
              </thead>
              <tbody>
                ${g.lines.map((l, li) => `
                  <tr style="border-top:1px solid var(--border-subtle); ${!l.included ? 'opacity:0.4; background:var(--bg-elevated);' : ''}">
                    <td style="padding:5px 4px; text-align:center;"><input type="checkbox" ${l.included ? 'checked' : ''} onchange="batchPoToggleLine(${gi}, ${li}, this.checked)"></td>
                    <td style="padding:5px; font-family:monospace; font-size:11px; color:#2563eb;">${escapeHtml(l.orderNo || '')}</td>
                    <td style="padding:3px;">${l.image_url ? `<img src="${escapeHtml(l.image_url)}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">` : '<div style="width:40px; height:40px; background:var(--bg-elevated); border-radius:4px; display:flex; align-items:center; justify-content:center; color:#aaa;">📷</div>'}</td>
                    <td style="padding:5px; font-size:11.5px;">
                      <div style="font-family:monospace; color:var(--text-tertiary); font-size:10.5px;">${escapeHtml(l.sku || '—')}</div>
                      <div style="font-weight:500;">${escapeHtml(l.title_cn || l.title_en || '')}</div>
                      ${l.variant ? `<div style="color:var(--text-tertiary); font-size:10.5px;">${escapeHtml(l.variant)}</div>` : ''}
                    </td>
                    <td style="padding:5px;">
                      <input type="number" min="1" max="${l.originalQty}" value="${l.qty}" onchange="batchPoSetLine(${gi}, ${li}, 'qty', this.value)" 
                        style="width:100%; padding:4px 6px; font-size:12px; text-align:center; border:1px solid var(--border); border-radius:4px;">
                    </td>
                    <td style="padding:5px;">
                      <input type="number" min="0" step="0.01" value="${l.price}" onchange="batchPoSetLine(${gi}, ${li}, 'price', this.value)" 
                        style="width:100%; padding:4px 6px; font-size:12px; text-align:right; border:1px solid var(--border); border-radius:4px;">
                    </td>
                    <td style="padding:5px; text-align:right; font-family:monospace; font-weight:500;">¥ ${(Number(l.qty) * Number(l.price)).toFixed(2)}</td>
                    <td style="padding:5px;">
                      <input type="text" value="${escapeHtml(l.note)}" onchange="batchPoSetLine(${gi}, ${li}, 'note', this.value)" placeholder="尺寸/色温/特殊要求"
                        style="width:100%; padding:4px 6px; font-size:11px; border:1px solid var(--border); border-radius:4px;">
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('')}
    
    <!-- 全行单价批量填(快捷)-->
    <div style="background:var(--bg-elevated); padding:10px 14px; border-radius:6px; margin-top:8px; display:flex; gap:10px; align-items:center; font-size:12.5px;">
      <span style="color:var(--text-secondary); font-weight:500;">💡 快捷:</span>
      <input type="number" id="batchPoApplyPriceInput" placeholder="批量单价 ¥" step="0.01" min="0" 
        style="width:120px; padding:5px 8px; font-size:12px; border:1px solid var(--border); border-radius:4px;">
      <button class="btn small" onclick="batchPoApplyPriceAll()">📋 应用到全部行</button>
      <span style="flex:1;"></span>
      <button class="btn small" onclick="batchPoToggleAll(true)">☑ 全选</button>
      <button class="btn small" onclick="batchPoToggleAll(false)">☐ 全不选</button>
    </div>
  `;
}

function batchPoSetLine(gi, li, field, val) {
  const line = BATCH_PO_STATE.groups[gi].lines[li];
  if (!line) return;
  if (field === 'qty') line.qty = Math.max(1, Math.min(Number(val) || 1, line.originalQty));
  else if (field === 'price') line.price = Math.max(0, Number(val) || 0);
  else line[field] = val;
  // 只更新该行的小计(避免重渲染冲掉焦点)— 简单做法:全刷
  renderBatchPoModal();
  // 重新聚焦
  setTimeout(() => {
    const inputs = document.querySelectorAll(`#batchPoBody table tbody tr`);
    if (inputs[gi * 100 + li]) inputs[gi * 100 + li].querySelector(`input[oninput*="'${field}'"]`)?.focus();
  }, 0);
}

function batchPoToggleLine(gi, li, checked) {
  BATCH_PO_STATE.groups[gi].lines[li].included = checked;
  renderBatchPoModal();
}

function batchPoToggleGroup(gi, checked) {
  BATCH_PO_STATE.groups[gi].lines.forEach(l => l.included = checked);
  renderBatchPoModal();
}

function batchPoToggleAll(checked) {
  BATCH_PO_STATE.groups.forEach(g => g.lines.forEach(l => l.included = checked));
  renderBatchPoModal();
}

function batchPoApplyPriceAll() {
  const v = Number(document.getElementById('batchPoApplyPriceInput').value);
  if (!v || v <= 0) { toast('请填入有效价格', 'warn'); return; }
  BATCH_PO_STATE.groups.forEach(g => g.lines.forEach(l => { if (l.included) l.price = v; }));
  renderBatchPoModal();
}

function closeBatchPoModal() {
  document.getElementById('batchPoModalBg').style.display = 'none';
  BATCH_PO_STATE = null;
}

// 供应商搜索(复用 SUPPLIERS)
async function batchPoSupplierSearch(q) {
  const r = document.getElementById('batchPoSupplierResults');
  if (!r) return;
  q = (q || '').trim().toLowerCase();
  if (typeof SUPPLIERS === 'undefined' || !SUPPLIERS.loadAll) { return; }
  let list = SUPPLIERS.allCached() || [];
  if (q) list = list.filter(s => (s.name || '').toLowerCase().includes(q));
  list = list.slice(0, 20);
  if (list.length === 0) {
    r.innerHTML = `<div style="padding:10px; font-size:12px; color:var(--text-tertiary); text-align:center;">未找到 · <button class="btn small primary" onclick="batchPoUseRawSupplier()">直接用「${escapeHtml(q)}」</button></div>`;
  } else {
    r.innerHTML = list.map(s => `
      <div onclick="batchPoPickSupplier('${s.id || ''}', '${escapeHtml(s.name || '').replace(/'/g, "\\'")}')" 
        style="padding:8px 12px; font-size:12.5px; cursor:pointer; border-bottom:1px solid var(--border-subtle);" 
        onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='transparent'">
        ${escapeHtml(s.name || '')}
      </div>
    `).join('');
  }
  r.style.display = 'block';
}

function batchPoPickSupplier(id, name) {
  BATCH_PO_STATE.supplierId = id || null;
  BATCH_PO_STATE.supplierName = name || '';
  document.getElementById('batchPoSupplierInput').value = name || '';
  document.getElementById('batchPoSupplierResults').style.display = 'none';
}

function batchPoUseRawSupplier() {
  const raw = document.getElementById('batchPoSupplierInput').value.trim();
  if (!raw) return;
  BATCH_PO_STATE.supplierId = null;
  BATCH_PO_STATE.supplierName = raw;
  document.getElementById('batchPoSupplierResults').style.display = 'none';
}

async function batchPoSubmit() {
  const s = BATCH_PO_STATE;
  if (!s) return;
  // 取最新供应商名(input 可能没失焦没触发 pick)
  const supName = document.getElementById('batchPoSupplierInput').value.trim();
  if (!supName) { toast('请填供应商', 'err'); return; }
  s.supplierName = supName;
  
  if (!s.promisedDate) { toast('请填下单日期', 'err'); return; }
  
  // 收集有效组
  const validGroups = s.groups.filter(g => g.lines.some(l => l.included));
  if (validGroups.length === 0) { toast('请至少勾选一行', 'err'); return; }
  
  // 验证所有有效行都有价格
  for (const g of validGroups) {
    for (const l of g.lines) {
      if (l.included && (!l.price || l.price <= 0)) {
        toast(`订单 ${l.orderNo} 的 ${l.sku} 没填单价`, 'err'); return;
      }
    }
  }
  
  if (!confirm(`确认生成 ${validGroups.length} 张 PO?\n供应商:${supName}\n点确定后会全部插入数据库,无法撤销(但可后续取消单张 PO)`)) return;
  
  // 当前用户
  let agentId = (typeof CURRENT_USER_ID !== 'undefined') ? CURRENT_USER_ID : null;
  if (!agentId) { 
    try { const { data: { user } } = await sb.auth.getUser(); agentId = user?.id; } catch (_) {}
  }
  if (!agentId) { toast('未登录', 'err'); return; }
  const creator = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) || '未知';
  
  // 顺序循环生成 PO(避免并发拿同号)
  const created = [];
  let failed = 0;
  
  for (const g of validGroups) {
    try {
      // 拿 PO 编号
      const { data: poNum, error: poNumErr } = await sb.rpc('generate_po_number');
      if (poNumErr) throw poNumErr;
      if (!poNum) throw new Error('generate_po_number 返回空');
      
      // 组装 line_items
      const liData = g.lines.filter(l => l.included).map(l => ({
        shopify_line_item_id: l.liid,
        sku: l.sku,
        title_cn: l.title_cn,
        title_en: l.title_en,
        variant: l.variant,
        image_url: l.image_url,
        qty: Number(l.qty),
        price: Number(l.price),
        subtotal: Number(l.qty) * Number(l.price),
        electrical_standard: g.standard || '',
        line_note: l.note || '',
        _source_order_no: l.orderNo,
        _source_order_id: l.orderId,
      }));
      
      const totalQty = liData.reduce((sum, x) => sum + x.qty, 0);
      const totalAmount = liData.reduce((sum, x) => sum + x.subtotal, 0);
      
      // 用第一个 order id 作为 sales_order_id(因为 schema 只能存一个)
      // 多订单合并 PO 时,后续在 line_items 里的 _source_order_no 用来追溯
      const firstOrderId = liData[0]?._source_order_id || g.orders[0]?.id || null;
      const allOrderNos = [...new Set(liData.map(x => x._source_order_no).filter(Boolean))];
      const orderNoStr = allOrderNos.join(' / ');
      
      // 审批触发
      const needsApproval = liData.some(li => li.qty > 20) || totalAmount > 5000;
      const initialStatus = needsApproval ? 'pending_approval' : 'producing';
      
      const poRow = {
        agent_id: agentId,
        po_number: poNum,
        source: 'batch',  // 批量来源标识
        supplier: supName,
        product: liData.map(x => x.title_cn).filter(Boolean).join(' / ').slice(0, 200),
        status: initialStatus,
        promised_date: s.promisedDate,
        line_items: liData,
        box_note: orderNoStr,  // 多订单号用 / 连
        total_amount: totalAmount,
        sales_order_id: firstOrderId,
        creator_name: creator,
        site: g.orders[0]?.site_code || g.orders[0]?.shop_domain || '',
        order_no: orderNoStr,
        note: s.globalNote || '',
        followups: [],
      };
      
      const { data: insertedPo, error: insErr } = await sb.from('orders').insert(poRow).select().single();
      if (insErr) throw insErr;
      created.push(insertedPo);
      
      // V20260527r: 双向同步 · 把这张批量 PO 的(产品 ↔ 供应商)关系写回 products.suppliers
      if (typeof _syncSuppliersFromPoLines === 'function') {
        try { await _syncSuppliersFromPoLines(supName, liData); } catch (e) { console.warn('批量PO同步供应商失败', e); }
      }
      
      // 更新每个销售订单的 line_items[].po_assignments
      const ordersByOrderId = {};
      liData.forEach(li => {
        if (!ordersByOrderId[li._source_order_id]) ordersByOrderId[li._source_order_id] = [];
        ordersByOrderId[li._source_order_id].push(li);
      });
      
      for (const [oid, oLis] of Object.entries(ordersByOrderId)) {
        const so = (SHOPIFY._orders || []).find(o => o.id === oid);
        if (!so) continue;
        const updatedLineItems = JSON.parse(JSON.stringify(so.line_items || []));
        oLis.forEach(li => {
          const target = updatedLineItems.find(x => x.shopify_line_item_id === li.shopify_line_item_id);
          if (target) {
            target.po_assignments = target.po_assignments || [];
            target.po_assignments.push({
              po_id: insertedPo.id,
              po_number: poNum,
              qty: li.qty,
              supplier: supName,
              created_at: new Date().toISOString(),
            });
          }
        });
        // 同步到 DB
        await sb.from('shopify_orders').update({ 
          line_items: updatedLineItems, 
          updated_at: new Date().toISOString() 
        }).eq('id', oid);
        // 本地更新
        so.line_items = updatedLineItems;
      }
      
    } catch (e) {
      console.error('[BatchPO] 组生成失败:', g, e);
      failed++;
    }
  }
  
  if (created.length > 0) {
    toast(`✓ 成功生成 ${created.length} 张 PO${failed ? ` · ⚠ ${failed} 张失败` : ''}`);
    closeBatchPoModal();
    SHOPIFY_SELECTED.clear();
    SHOPIFY.invalidateOrders();
    await shopifyReloadOrdersAndRender(true);
  } else {
    toast(`❌ 全部失败 (${failed} 张)`, 'err');
  }
}

// ============================================================
// V20260526q: 手动添加店铺(跨 organization 用 · 直接填 token)
// ============================================================

function shopifyOpenAddStore() {
  // V20260527k: 仅老板可以打开手动添加店铺 modal
  if (typeof IS_ADMIN === 'undefined' || !IS_ADMIN) {
    toast('店铺绑定仅限主管操作 · 请联系老板', 'warn', 2500);
    return;
  }
  // 清空表单
  ['addStoreDomain', 'addStoreDisplayName', 'addStoreSiteCode', 'addStoreToken'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const hint = document.getElementById('addStoreHint');
  if (hint) { hint.style.display = 'none'; hint.textContent = ''; }
  
  // 打开 modal
  if (typeof openModal === 'function') {
    openModal('shopifyAddStoreModal');
  } else {
    document.getElementById('shopifyAddStoreModal').style.display = 'flex';
    document.getElementById('shopifyAddStoreModal').classList.add('show');
  }
  
  setTimeout(() => document.getElementById('addStoreDomain')?.focus(), 100);
}
window.shopifyOpenAddStore = shopifyOpenAddStore;

async function shopifySubmitAddStore() {
  // V20260527k: 双重保护 · 仅老板可提交
  if (typeof IS_ADMIN === 'undefined' || !IS_ADMIN) {
    toast('店铺绑定仅限主管操作 · 请联系老板', 'warn', 2500);
    return;
  }
  const domain = (document.getElementById('addStoreDomain')?.value || '').trim().toLowerCase();
  const displayName = (document.getElementById('addStoreDisplayName')?.value || '').trim();
  const siteCode = (document.getElementById('addStoreSiteCode')?.value || '').trim().toUpperCase();
  const token = (document.getElementById('addStoreToken')?.value || '').trim();
  const scope = (document.getElementById('addStoreScope')?.value || '').trim();
  
  const hint = document.getElementById('addStoreHint');
  const submitBtn = document.getElementById('addStoreSubmitBtn');
  const showHint = (msg, type) => {
    if (!hint) return;
    const colors = {
      err:  { bg: '#fef2f2', color: '#991b1b', border: 'rgba(220,38,38,0.3)' },
      ok:   { bg: '#f0fdf4', color: '#166534', border: 'rgba(22,163,74,0.3)' },
      info: { bg: '#eff6ff', color: '#1e40af', border: 'rgba(37,99,235,0.3)' },
    };
    const c = colors[type] || colors.info;
    hint.style.cssText = `display:block; margin-top:14px; padding:10px 14px; border-radius:6px; font-size:12px; background:${c.bg}; color:${c.color}; border:1px solid ${c.border};`;
    hint.textContent = msg;
  };
  
  // 1. 校验
  if (!domain) return showHint('请输入店铺域名', 'err');
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(domain)) {
    return showHint('域名格式错误,正确格式:xxxx.myshopify.com', 'err');
  }
  if (!displayName) return showHint('请填写显示名', 'err');
  if (!siteCode) return showHint('请填写 Site Code', 'err');
  if (!/^[A-Z0-9]{2,6}$/.test(siteCode)) return showHint('Site Code 必须是 2-6 个大写字母/数字', 'err');
  if (!token) return showHint('请粘贴 Admin API access token', 'err');
  if (!token.startsWith('shpat_') && !token.startsWith('shppa_')) {
    return showHint('Token 格式错误 · Shopify Admin API token 通常以 shpat_ 开头', 'err');
  }
  
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  
  try {
    // 2. 验证 token 是否有效(调用 Shopify API · 拿 shop 信息)
    showHint('正在验证 token · 调用 Shopify API…', 'info');
    
    const verifyRes = await fetch(`https://${domain}/admin/api/2026-04/shop.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    
    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      let msg = `Token 验证失败(HTTP ${verifyRes.status})`;
      if (verifyRes.status === 401) msg = 'Token 无效或已过期 · 请检查';
      if (verifyRes.status === 403) msg = 'Token 权限不足 · 请检查 API Scopes';
      if (verifyRes.status === 404) msg = '店铺不存在 · 请检查域名';
      throw new Error(msg + ' · ' + errText.slice(0, 100));
    }
    
    const { shop } = await verifyRes.json();
    
    // 3. 检查是否已存在
    showHint('✓ Token 验证通过 · 正在写入数据库…', 'info');
    
    const { data: existing, error: queryErr } = await sb
      .from('shopify_stores')
      .select('id, shop_domain')
      .eq('shop_domain', domain)
      .maybeSingle();
    
    if (queryErr) throw queryErr;
    
    const payload = {
      shop_domain: domain,
      shop_name: domain.replace('.myshopify.com', ''),
      display_name: displayName,
      site_code: siteCode,
      access_token: token,
      scope: scope || 'read_orders,read_products,read_customers,read_fulfillments,read_shipping,read_inventory',
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    
    let action = '';
    if (existing) {
      // 已存在 → 询问是否覆盖
      if (!confirm(`店铺 ${domain} 已存在,确认覆盖 token 和配置吗?`)) {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        return showHint('已取消,未做任何更改', 'info');
      }
      const { error } = await sb.from('shopify_stores').update(payload).eq('id', existing.id);
      if (error) throw error;
      action = '更新';
    } else {
      const { error } = await sb.from('shopify_stores').insert(payload);
      if (error) throw error;
      action = '添加';
    }
    
    showHint(`✓ ${action}成功 · 店铺 ${shop?.name || displayName} (${siteCode}) 已可用`, 'ok');
    toast(`✓ ${action}成功:${displayName} (${siteCode})`, 'success', 3000);
    
    // 1.5 秒后关闭 modal + 刷新店铺列表
    setTimeout(() => {
      // V20260527c: 直接 style.display='none' · 与 fixed overlay CSS 一致
      document.getElementById('shopifyAddStoreModal').style.display = 'none';
      if (typeof shopifyReloadStores === 'function') shopifyReloadStores();
    }, 1500);
    
  } catch (e) {
    console.error('添加店铺失败:', e);
    showHint('❌ ' + (e.message || e), 'err');
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
}
window.shopifySubmitAddStore = shopifySubmitAddStore;

// ============================================================
// V20260527: 店铺管理 modal (列表 + 添加 + 删除)
// ============================================================

function shopifyMgrSwitchTab(tab) {
  // 切换 tab 高亮
  document.querySelectorAll('.store-mgr-tab').forEach(b => {
    const active = b.dataset.stab === tab;
    b.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
    b.style.color = active ? 'var(--accent)' : 'var(--text-secondary)';
    b.classList.toggle('active', active);
  });
  // 切换内容
  document.getElementById('storeMgrTabList').style.display = (tab === 'list') ? 'block' : 'none';
  document.getElementById('storeMgrTabAdd').style.display = (tab === 'add') ? 'block' : 'none';
  // 切换底部按钮
  const submitBtn = document.getElementById('addStoreSubmitBtn');
  if (submitBtn) submitBtn.style.display = (tab === 'add') ? '' : 'none';
  
  if (tab === 'list') {
    shopifyMgrRenderList();
  }
}
window.shopifyMgrSwitchTab = shopifyMgrSwitchTab;

async function shopifyMgrRenderList() {
  const wrap = document.getElementById('storeMgrList');
  if (!wrap) return;
  wrap.innerHTML = '<div style="text-align:center; padding:40px 20px; color:var(--text-tertiary); font-size:13px;">加载中...</div>';
  
  try {
    const { data, error } = await sb.from('shopify_stores')
      .select('id, shop_domain, shop_name, display_name, site_code, is_active, scope, updated_at, created_at')
      .order('shop_domain');
    
    if (error) throw error;
    if (!data || data.length === 0) {
      wrap.innerHTML = '<div style="text-align:center; padding:40px 20px; color:var(--text-tertiary); font-size:13px;">还没有连接任何店铺<br>点上方「➕ 手动添加新店」开始</div>';
      return;
    }
    
    let html = `
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead>
          <tr style="background:var(--bg-elevated); border-bottom:2px solid var(--border);">
            <th style="padding:10px 8px; text-align:left; font-weight:600;">Code</th>
            <th style="padding:10px 8px; text-align:left; font-weight:600;">域名</th>
            <th style="padding:10px 8px; text-align:left; font-weight:600;">显示名</th>
            <th style="padding:10px 8px; text-align:center; font-weight:600; width:60px;">状态</th>
            <th style="padding:10px 8px; text-align:center; font-weight:600; width:170px;">操作</th>
          </tr>
        </thead>
        <tbody>`;
    
    data.forEach(s => {
      const codeBadge = s.site_code 
        ? `<span style="background:var(--bg-elevated); padding:3px 8px; border-radius:4px; font-family:monospace; font-weight:700; font-size:11px;">${escapeHtml(s.site_code)}</span>`
        : `<span style="color:var(--text-tertiary); font-size:11px;">未设</span>`;
      const activeBadge = s.is_active
        ? `<span style="background:rgba(21,128,61,0.1); color:var(--success); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600;">✓ 活跃</span>`
        : `<span style="background:rgba(107,114,128,0.1); color:var(--text-tertiary); padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600;">已停用</span>`;
      
      // V20260527k: 非老板只显示「仅老板可操作」灰提示
      const isAdmin = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN);
      const actionsCell = isAdmin
        ? `<button class="btn small" onclick="shopifyMgrToggleActive('${s.id}', ${s.is_active})" title="${s.is_active ? '停用' : '激活'}" style="padding:4px 8px; font-size:11px;">${s.is_active ? '⏸ 停用' : '▶ 激活'}</button>
           <button class="btn small" onclick="shopifyMgrDelete('${s.id}', '${escapeHtml(s.shop_domain).replace(/'/g, '&#39;')}')" title="删除连接" style="padding:4px 8px; font-size:11px; background:rgba(220,38,38,0.06); border-color:rgba(220,38,38,0.3); color:var(--danger);">🗑 删除</button>`
        : `<span style="font-size:11px; color:var(--text-tertiary);" title="店铺管理(停用/删除)仅限主管">🔒 仅主管可操作</span>`;
      
      html += `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:10px 8px;">${codeBadge}</td>
          <td style="padding:10px 8px; font-family:monospace; color:var(--accent); font-size:11.5px; word-break:break-all;">${escapeHtml(s.shop_domain)}</td>
          <td style="padding:10px 8px;">${escapeHtml(s.display_name || s.shop_name || '')}</td>
          <td style="padding:10px 8px; text-align:center;">${activeBadge}</td>
          <td style="padding:10px 8px; text-align:center;">${actionsCell}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    wrap.innerHTML = html;
  } catch (e) {
    wrap.innerHTML = `<div style="color:var(--danger); padding:20px; font-size:13px;">加载失败:${escapeHtml(e.message || String(e))}</div>`;
  }
}
window.shopifyMgrRenderList = shopifyMgrRenderList;

async function shopifyMgrToggleActive(id, currentActive) {
  // V20260527k: 仅老板可停用/激活
  if (typeof IS_ADMIN === 'undefined' || !IS_ADMIN) {
    toast('停用/激活店铺仅限主管操作', 'warn', 2500);
    return;
  }
  try {
    const { error } = await sb.from('shopify_stores')
      .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    toast(currentActive ? '已停用' : '已激活', 'info', 1200);
    await shopifyMgrRenderList();
    if (typeof shopifyReloadStores === 'function') shopifyReloadStores();
  } catch (e) {
    toast('操作失败:' + (e.message || e), 'err');
  }
}
window.shopifyMgrToggleActive = shopifyMgrToggleActive;

async function shopifyMgrDelete(id, domain) {
  // V20260527k: 仅老板可删除店铺连接
  if (typeof IS_ADMIN === 'undefined' || !IS_ADMIN) {
    toast('删除店铺仅限主管操作 · 请联系老板', 'warn', 2500);
    return;
  }
  const confirmed = confirm(
    `⚠ 确认删除店铺连接?\n\n店铺:${domain}\n\n` +
    `- 跟单系统会移除此店的 token 记录\n` +
    `- 已同步的订单数据保留在 DB(不删)\n` +
    `- 不会撤销 Shopify 端的 app 授权\n` +
    `- 想完全卸载,需去 Shopify Admin 操作\n\n` +
    `确认删除?`
  );
  if (!confirmed) return;
  
  try {
    const { error } = await sb.from('shopify_stores').delete().eq('id', id);
    if (error) throw error;
    toast(`✓ 已删除 ${domain} 的连接`, 'success', 2000);
    await shopifyMgrRenderList();
    if (typeof shopifyReloadStores === 'function') shopifyReloadStores();
  } catch (e) {
    toast('删除失败:' + (e.message || e), 'err');
  }
}
window.shopifyMgrDelete = shopifyMgrDelete;

// 重写 shopifyOpenAddStore · 默认显示列表 tab
const _origOpen = window.shopifyOpenAddStore;
window.shopifyOpenAddStore = function() {
  // 清空表单
  ['addStoreDomain', 'addStoreDisplayName', 'addStoreSiteCode', 'addStoreToken'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const hint = document.getElementById('addStoreHint');
  if (hint) { hint.style.display = 'none'; hint.textContent = ''; }
  
  // V20260527c: 用 style.display='flex' 触发 fixed overlay CSS([style*="flex"] 选择器)
  // 项目里 modal 用这个机制 · 不是 .modal-bg.show 那套
  document.getElementById('shopifyAddStoreModal').style.display = 'flex';
  
  // 默认显示列表 tab
  shopifyMgrSwitchTab('list');
};
