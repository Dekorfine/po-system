// ============================================================
// 跟单团队工作台 · init.js
// 启动钩子 · renderActiveTab 接入 + bootstrap 入口（必须最后加载）
// ============================================================
// 依赖：所有其他业务模块
// ============================================================

// ============ 接入 renderActiveTab ============
const _origRenderActiveTab = renderActiveTab;
renderActiveTab = function() {
  if (CURRENT_TAB === 'sales') return renderSales();
  if (CURRENT_TAB === 'po') return renderPo();
  if (CURRENT_TAB === 'products') return renderProducts();
  return _origRenderActiveTab();
};

// V4 修复：脚本在 <head>，但 bootstrap() 立即执行时 DOM 还没解析完，
// 会导致 getElementById('loadingScreen') 返回 null。所以等 DOM 就绪再启动。
function startApp() {
  try {
    bootstrap();
    setupScreenshotHandlers();
    setupBatchChaseScreenshot();
  } catch (err) {
    console.error('启动失败:', err);
  }
}

if (document.readyState === 'loading') {
  // DOM 还在解析，等 DOMContentLoaded
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  // DOM 已经就绪（页面加载完，或脚本动态注入）
  startApp();
}
