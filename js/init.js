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

// 启动
// 启动：bootstrap（异步登录检查）
bootstrap();
setupScreenshotHandlers();
setupBatchChaseScreenshot();
