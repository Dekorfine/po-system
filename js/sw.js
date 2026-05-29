// ============================================================================
// V28α:Service Worker · 缓存所有 JS/CSS/字体 · 第二次打开 0 网络 · 真正秒开
// 策略:Stale-While-Revalidate
//   ① 立即从缓存返回(秒开)
//   ② 同时后台拉新版本 · 有更新就缓存
//   ③ 下次打开就是新版本
// ============================================================================

const CACHE_NAME = 'dekorfine-po-v28alpha';
const STATIC_ASSETS = [
  '/po-system/',
  '/po-system/index.html',
  // CDN 第三方库(很大 · 缓存了下次直接读)
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
];

// 安装时预缓存(失败不阻塞 · 用户可能离线)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// 激活:清旧版本缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k.startsWith('dekorfine-po-')).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// fetch:Stale-While-Revalidate
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  
  // 只缓存 GET
  if (req.method !== 'GET') return;
  
  // ❌ 不缓存:Supabase API 数据(每次要拉最新)
  if (url.hostname.includes('supabase.co')) return;
  // ❌ 不缓存:Anthropic API
  if (url.hostname.includes('anthropic.com')) return;
  // ❌ 不缓存:google fonts CSS(自己有 long-cache)
  // ✅ 只缓存:本站 JS/CSS/字体 + 关键 CDN
  
  const isOurAsset = url.origin === self.location.origin && 
    (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || 
     url.pathname.endsWith('.html') || url.pathname === '/po-system/' ||
     url.pathname.match(/\.(woff2?|ttf|png|jpg|svg|ico)$/));
  const isCdnLib = url.hostname.includes('cdn.jsdelivr.net') || 
                   url.hostname.includes('cdnjs.cloudflare.com') ||
                   url.hostname.includes('fonts.gstatic.com');
  
  if (!isOurAsset && !isCdnLib) return;
  
  e.respondWith(
    caches.match(req).then(cached => {
      // 后台拉新版本(不阻塞)· 有更新就缓存
      const networkPromise = fetch(req).then(resp => {
        if (resp && resp.status === 200) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);  // 网络挂了就用缓存
      
      // 有缓存 → 立即返回缓存(秒开)+ 后台异步更新
      // 没缓存 → 等网络
      return cached || networkPromise;
    })
  );
});
