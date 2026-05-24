// ============================================================
// 跟单团队工作台 · meetings.js (V4 · 2026-05-24)
// 会议要点 / 工作计划同步
//
// 设计:
//   - 主管发布本周会议要点 → 员工登录所有 tab 顶部都能看到横幅
//   - 主管在"📢 会议要点" tab 管理(发布/编辑/删除/历史)
//   - 员工在该 tab 只读浏览
//   - tab 按钮 + 内容容器全部动态注入,不动 index.html
//
// 依赖: core.js (sb, IS_ADMIN, CURRENT_AGENT, toast, escapeHtml)
// ============================================================

let MEETING_NOTES = [];          // 全局缓存
let _meetingDraft = null;        // 草稿态(发布前)

// 当前周标签
function _getCurrentWeekLabel() {
  const now = new Date();
  const year = now.getFullYear();
  // ISO week number 简化算法
  const firstJan = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now - firstJan) / 86400000);
  const weekNum = Math.ceil((dayOfYear + firstJan.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// ============================================================
// 数据层
// ============================================================
async function loadMeetings() {
  if (typeof sb === 'undefined') {
    console.warn('[meetings] sb 未初始化');
    return;
  }
  try {
    const { data, error } = await sb.from('meeting_notes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('[meetings] 加载失败:', error);
      return;
    }
    MEETING_NOTES = data || [];
    // 渲染横幅 + 当前 tab 如果是 meetings 也刷新
    if (typeof renderMeetingBanner === 'function') renderMeetingBanner();
    if (typeof CURRENT_TAB !== 'undefined' && CURRENT_TAB === 'meetings') {
      renderMeetings();
    }
    if (typeof updateMeetingBadge === 'function') updateMeetingBadge();
  } catch (e) {
    console.error('[meetings] 加载异常:', e);
  }
}

// ============================================================
// CSS 注入(一次性)
// ============================================================
(function _injectMeetingsCSS() {
  if (document.getElementById('meetings-style')) return;
  const s = document.createElement('style');
  s.id = 'meetings-style';
  s.textContent = `
    /* 顶部横幅 - 所有 tab 都能看 */
    #meetingBanner {
      position: relative;
      margin: 0 auto 16px auto;
      max-width: 1400px;
      padding: 12px 18px 12px 18px;
      background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%);
      border: 1px solid #fbbf24;
      border-left: 5px solid #f59e0b;
      border-radius: 10px;
      box-shadow: 0 2px 6px rgba(245, 158, 11, 0.08);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      animation: meetingBannerSlide 0.3s ease-out;
    }
    @keyframes meetingBannerSlide {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #meetingBanner.collapsed .mb-content-wrapper { display: none; }
    #meetingBanner .mb-icon {
      font-size: 24px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    #meetingBanner .mb-body {
      flex: 1;
      min-width: 0;
    }
    #meetingBanner .mb-header {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    #meetingBanner .mb-title {
      font-size: 14px;
      font-weight: 700;
      color: #78350f;
    }
    #meetingBanner .mb-meta {
      font-size: 11.5px;
      color: #92400e;
      opacity: 0.85;
    }
    #meetingBanner .mb-toggle {
      margin-left: auto;
      font-size: 11px;
      color: #78350f;
      background: transparent;
      border: none;
      cursor: pointer;
      font-weight: 600;
      padding: 2px 6px;
    }
    #meetingBanner .mb-content-wrapper {
      margin-top: 10px;
      font-size: 13px;
      color: #422006;
      line-height: 1.6;
    }
    #meetingBanner .mb-highlights {
      margin: 0;
      padding-left: 22px;
    }
    #meetingBanner .mb-highlights li {
      margin: 3px 0;
    }
    #meetingBanner .mb-desc {
      margin-top: 8px;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 8px 10px;
      background: rgba(255,255,255,0.6);
      border-radius: 6px;
    }
    #meetingBanner .mb-thumbs {
      display: flex; gap: 6px; flex-wrap: wrap;
      margin-top: 8px;
    }
    #meetingBanner .mb-thumbs img {
      width: 64px; height: 64px;
      object-fit: cover;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid rgba(245,158,11,0.3);
    }
    #meetingBanner .mb-close {
      width: 24px; height: 24px;
      border: none; background: rgba(0,0,0,0.06);
      border-radius: 50%; cursor: pointer;
      color: #78350f; font-size: 14px;
      flex-shrink: 0;
      line-height: 1;
    }
    #meetingBanner .mb-close:hover { background: rgba(0,0,0,0.12); }

    /* tab 顶部小红点(有新内容时) */
    .tab-item[data-tab="meetings"] .meeting-badge-new {
      display: inline-block;
      background: #dc2626;
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 8px;
      margin-left: 4px;
      animation: meetingPulse 2s ease-in-out infinite;
    }
    @keyframes meetingPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }

    /* 会议要点 tab 内容区 */
    .meetings-container {
      max-width: 1100px;
      margin: 0 auto;
    }
    .meetings-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0 8px 16px 8px;
      border-bottom: 1px solid #e5e7eb;
      margin-bottom: 20px;
    }
    .meetings-header h2 {
      font-size: 22px; font-weight: 700;
      color: #111827; margin: 0;
    }
    .meetings-header .mh-subtitle {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }
    .meeting-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      transition: box-shadow 0.15s;
    }
    .meeting-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .meeting-card.pinned {
      border-left: 5px solid #f59e0b;
      background: linear-gradient(to right, #fffbeb, white 8%);
    }
    .meeting-card.archived {
      opacity: 0.72;
    }
    .mc-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 12px; margin-bottom: 12px;
    }
    .mc-title-row {
      flex: 1;
      min-width: 0;
    }
    .mc-title {
      font-size: 18px; font-weight: 700;
      color: #111827; margin: 0;
    }
    .mc-meta {
      font-size: 12px; color: #6b7280;
      margin-top: 4px;
      display: flex; gap: 12px; flex-wrap: wrap;
    }
    .mc-meta .mc-pin-badge {
      background: #fef3c7; color: #92400e;
      padding: 1px 8px; border-radius: 4px;
      font-weight: 600;
    }
    .mc-actions {
      display: flex; gap: 6px;
      flex-shrink: 0;
    }
    .mc-action-btn {
      padding: 4px 10px; font-size: 12px;
      background: white; border: 1px solid #d1d5db;
      border-radius: 6px; cursor: pointer;
      color: #374151;
    }
    .mc-action-btn:hover { background: #f3f4f6; }
    .mc-action-btn.danger { color: #dc2626; border-color: #fecaca; }
    .mc-action-btn.danger:hover { background: #fee2e2; }
    .mc-action-btn.pinned { background: #fef3c7; color: #78350f; border-color: #fbbf24; }
    .mc-highlights {
      margin: 12px 0 0 0;
      padding-left: 22px;
    }
    .mc-highlights li {
      margin: 5px 0;
      font-size: 14px;
      color: #1f2937;
      line-height: 1.6;
    }
    .mc-content {
      margin-top: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 12px 14px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 3px solid #e5e7eb;
      font-size: 13.5px;
      color: #374151;
      line-height: 1.65;
    }
    .mc-screenshots {
      display: flex; gap: 8px; flex-wrap: wrap;
      margin-top: 12px;
    }
    .mc-screenshots img {
      width: 96px; height: 96px;
      object-fit: cover;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid #e5e7eb;
      transition: transform 0.15s;
    }
    .mc-screenshots img:hover { transform: scale(1.05); }
    
    /* 附件区(PDF/Excel/视频/PPT 等) */
    .mc-attachments {
      display: flex; flex-wrap: wrap; gap: 8px;
      margin-top: 12px;
    }
    .mc-attachment {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      min-width: 180px;
      max-width: 320px;
    }
    .mc-attachment:hover {
      border-color: #2563eb;
      box-shadow: 0 2px 8px rgba(37,99,235,0.1);
      transform: translateY(-1px);
    }
    .mc-att-icon {
      font-size: 28px;
      flex-shrink: 0;
    }
    .mc-att-info {
      flex: 1;
      min-width: 0;
    }
    .mc-att-name {
      font-size: 13px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mc-att-meta {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }
    .mc-att-actions {
      display: flex; gap: 4px;
      flex-shrink: 0;
    }
    .mc-att-actions button {
      width: 26px; height: 26px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      color: #374151;
    }
    .mc-att-actions button:hover { background: #f3f4f6; }
    
    /* 文件预览 modal */
    #filePreviewModal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.85);
      z-index: 10000;
      display: none;
      flex-direction: column;
    }
    #filePreviewModal.show { display: flex; }
    #filePreviewModal .fpm-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 20px;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }
    #filePreviewModal .fpm-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
    #filePreviewModal .fpm-actions {
      display: flex; gap: 8px;
    }
    #filePreviewModal .fpm-actions button {
      padding: 6px 14px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    #filePreviewModal .fpm-actions button:hover { background: #f3f4f6; }
    #filePreviewModal .fpm-actions button.primary {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
    }
    #filePreviewModal .fpm-body {
      flex: 1;
      overflow: auto;
      background: #f3f4f6;
      padding: 20px;
    }
    #filePreviewModal .fpm-body iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    #filePreviewModal .fpm-body img {
      max-width: 100%;
      max-height: calc(100vh - 120px);
      display: block;
      margin: 0 auto;
      background: white;
    }
    #filePreviewModal .fpm-body .fpm-table-wrap {
      background: white;
      padding: 20px;
      border-radius: 8px;
      overflow: auto;
      max-height: calc(100vh - 100px);
    }
    #filePreviewModal .fpm-body table {
      border-collapse: collapse;
      font-size: 13px;
    }
    #filePreviewModal .fpm-body table td,
    #filePreviewModal .fpm-body table th {
      border: 1px solid #e5e7eb;
      padding: 8px 12px;
      min-width: 80px;
    }
    #filePreviewModal .fpm-body table tr:first-child {
      background: #f9fafb;
      font-weight: 600;
    }
    #filePreviewModal .fpm-body video {
      max-width: 100%;
      max-height: calc(100vh - 120px);
      display: block;
      margin: 0 auto;
    }
    #filePreviewModal .fpm-body .fpm-unsupported {
      text-align: center;
      padding: 60px 20px;
      color: white;
    }
    #filePreviewModal .fpm-body .fpm-unsupported .fpm-icon {
      font-size: 80px;
      margin-bottom: 20px;
    }
    
    /* modal 内附件管理区 */
    #meetingModal .mm-attachments-list {
      display: flex; flex-direction: column; gap: 6px;
      margin-top: 8px;
    }
    #meetingModal .mm-attachment-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    #meetingModal .mm-attachment-item .mm-att-icon { font-size: 22px; }
    #meetingModal .mm-attachment-item .mm-att-name {
      flex: 1;
      font-size: 13px;
      color: #111827;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #meetingModal .mm-attachment-item .mm-att-size {
      font-size: 11px;
      color: #6b7280;
    }
    #meetingModal .mm-attachment-item .mm-att-del {
      width: 24px; height: 24px;
      border: 1px solid #fecaca;
      background: white;
      color: #dc2626;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    #meetingModal .mm-attachment-item .mm-att-del:hover {
      background: #fee2e2;
    }
    #meetingModal .mm-upload-hint {
      font-size: 11.5px;
      color: #6b7280;
      margin-top: 6px;
      line-height: 1.5;
    }
    #meetingModal .mm-upload-progress {
      font-size: 12px;
      color: #2563eb;
      margin-top: 6px;
    }
    
    .meetings-empty {
      text-align: center;
      padding: 60px 20px;
      color: #9ca3af;
    }
    .meetings-empty .me-icon {
      font-size: 60px;
      opacity: 0.4;
      margin-bottom: 16px;
    }
    .meetings-empty .me-text {
      font-size: 15px;
      color: #6b7280;
      margin-bottom: 16px;
    }
    .add-meeting-btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 10px 22px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .add-meeting-btn:hover { background: #1d4ed8; }

    /* 主管发布/编辑 modal */
    #meetingModal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 9999;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 40px 20px;
      overflow-y: auto;
    }
    #meetingModal.show { display: flex; }
    #meetingModal .mm-card {
      background: white;
      border-radius: 14px;
      width: 100%;
      max-width: 760px;
      padding: 28px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.35);
      position: relative;
      animation: meetingModalIn 0.18s ease-out;
    }
    @keyframes meetingModalIn {
      from { opacity: 0; transform: translateY(-12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #meetingModal .mm-close {
      position: absolute; top: 14px; right: 14px;
      width: 32px; height: 32px;
      border: none; background: transparent;
      cursor: pointer; font-size: 18px;
      color: #6b7280; border-radius: 6px;
    }
    #meetingModal .mm-close:hover { background: #fee2e2; color: #dc2626; }
    #meetingModal h2 {
      margin: 0 0 18px 0;
      font-size: 19px;
      color: #111827;
      padding-right: 40px;
    }
    #meetingModal .mm-field {
      margin-bottom: 14px;
    }
    #meetingModal .mm-field label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #6b7280;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    #meetingModal .mm-field input,
    #meetingModal .mm-field textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 7px;
      font-size: 14px;
      box-sizing: border-box;
      font-family: inherit;
      background: white;
    }
    #meetingModal .mm-field input:focus,
    #meetingModal .mm-field textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
    }
    #meetingModal .mm-field textarea {
      resize: vertical;
      min-height: 80px;
      line-height: 1.6;
    }
    #meetingModal .mm-highlights-list {
      margin-top: 6px;
    }
    #meetingModal .mm-highlight-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    #meetingModal .mm-highlight-row .mm-bullet {
      font-size: 14px;
      color: #f59e0b;
      flex-shrink: 0;
    }
    #meetingModal .mm-highlight-row input {
      flex: 1;
    }
    #meetingModal .mm-highlight-row .mm-del {
      width: 28px; height: 28px;
      border: 1px solid #fecaca;
      background: white;
      color: #dc2626;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    #meetingModal .mm-highlight-row .mm-del:hover {
      background: #fee2e2;
    }
    #meetingModal .mm-add-highlight {
      margin-top: 6px;
      padding: 6px 12px;
      background: #eff6ff;
      border: 1px dashed #93c5fd;
      color: #1e40af;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    #meetingModal .mm-add-highlight:hover { background: #dbeafe; }
    #meetingModal .mm-row {
      display: flex; gap: 12px;
    }
    #meetingModal .mm-row > .mm-field { flex: 1; }
    #meetingModal .mm-pinned-row {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 7px;
      margin-bottom: 14px;
    }
    #meetingModal .mm-screenshots-area {
      display: flex; gap: 6px; flex-wrap: wrap;
      margin-top: 8px;
    }
    #meetingModal .mm-screenshots-area img {
      width: 64px; height: 64px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      position: relative;
    }
    #meetingModal .mm-screenshot-wrap {
      position: relative;
    }
    #meetingModal .mm-screenshot-del {
      position: absolute;
      top: -6px; right: -6px;
      width: 18px; height: 18px;
      background: #dc2626;
      color: white;
      border-radius: 50%;
      font-size: 11px;
      border: none;
      cursor: pointer;
      line-height: 1;
    }
    #meetingModal .mm-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      padding-top: 16px;
      margin-top: 8px;
      border-top: 1px solid #e5e7eb;
    }
    #meetingModal .mm-footer button {
      padding: 9px 20px;
      border-radius: 7px;
      border: 1px solid #d1d5db;
      background: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    }
    #meetingModal .mm-footer button.primary {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
    }
    #meetingModal .mm-footer button.primary:hover { background: #1d4ed8; }
    #meetingModal .mm-footer .mm-hint {
      flex: 1;
      font-size: 12px;
      color: #6b7280;
      display: flex;
      align-items: center;
    }
  `;
  document.head.appendChild(s);
})();

// ============================================================
// 注入 tab 按钮 + 内容容器(不动 index.html)
// ============================================================
(function _injectMeetingsTab() {
  const tryInject = () => {
    // 防重复
    if (document.querySelector('.tab-item[data-tab="meetings"]')) return;
    
    // 找到现有 tab 容器(任意 .tab-item 的父节点)
    const sampleTab = document.querySelector('.tab-item');
    if (!sampleTab) return;
    const tabBar = sampleTab.parentElement;
    if (!tabBar) return;
    
    // 创建 tab 按钮(样式跟现有 tab 一致 - 单行 + 紧凑 badge)
    const tabBtn = document.createElement('div');
    tabBtn.className = 'tab-item';
    tabBtn.setAttribute('data-tab', 'meetings');
    tabBtn.onclick = () => switchTab('meetings');
    tabBtn.innerHTML = `📢 会议要点 <span class="badge zero" id="meetingsBadge">0</span>`;
    
    // 插到最末尾(也可以放到第一个,看现有 tab 顺序)
    tabBar.appendChild(tabBtn);
    
    // 创建 tab 内容容器
    const sampleContent = document.querySelector('.tab-content');
    if (!sampleContent) return;
    const mainArea = sampleContent.parentElement;
    
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    tabContent.setAttribute('data-tab', 'meetings');
    tabContent.innerHTML = `<div id="meetingsContainer" class="meetings-container"></div>`;
    mainArea.appendChild(tabContent);
    
    // 创建 modal 容器(空容器,内容动态注入)
    if (!document.getElementById('meetingModal')) {
      const modal = document.createElement('div');
      modal.id = 'meetingModal';
      document.body.appendChild(modal);
    }
    
    console.log('[meetings] tab 注入完成');
  };
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(tryInject, 500);
    setTimeout(tryInject, 1500);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryInject, 500);
      setTimeout(tryInject, 1500);
    });
  }
})();

// ============================================================
// 顶部横幅渲染(所有 tab 都看得到)
// ============================================================
function renderMeetingBanner() {
  // 找最新置顶的一条
  const latest = MEETING_NOTES.find(m => m.is_pinned && !m.deleted_at);
  
  // 用户本会话是否手动关闭了?
  const dismissedKey = latest ? `meetingBanner_dismissed_${latest.id}` : '';
  const isDismissed = latest && sessionStorage.getItem(dismissedKey) === '1';
  
  // 移除旧横幅
  document.getElementById('meetingBanner')?.remove();
  
  // 没置顶内容 / 用户关闭了 → 不显示
  if (!latest || isDismissed) return;
  
  // 找一个稳定的插入点(顶部、tab 栏之后)
  const tabSample = document.querySelector('.tab-item');
  const tabBar = tabSample?.parentElement;
  if (!tabBar) return;
  
  // 创建横幅
  const banner = document.createElement('div');
  banner.id = 'meetingBanner';
  banner.className = 'collapsed';  // 默认折叠(显示标题,展开看详情)
  
  const highlights = Array.isArray(latest.highlights) ? latest.highlights : [];
  const meta = [];
  if (latest.meeting_date) meta.push(`📅 ${latest.meeting_date}`);
  if (latest.created_by_name) meta.push(`✍ ${latest.created_by_name}`);
  if (latest.week_label) meta.push(`🗓 ${latest.week_label}`);
  
  banner.innerHTML = `
    <div class="mb-icon">📢</div>
    <div class="mb-body">
      <div class="mb-header" onclick="toggleMeetingBanner()">
        <span class="mb-title">${escapeHtml(latest.title)}</span>
        <span class="mb-meta">${meta.join(' · ')}</span>
        <button class="mb-toggle" type="button" id="mbToggleBtn">展开 ▼</button>
      </div>
      <div class="mb-content-wrapper">
        ${highlights.length > 0 ? `
          <ul class="mb-highlights">
            ${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
          </ul>
        ` : ''}
        ${latest.content ? `<div class="mb-desc">${escapeHtml(latest.content)}</div>` : ''}
        ${(latest.screenshots && latest.screenshots.length > 0) ? `
          <div class="mb-thumbs">
            ${latest.screenshots.map(s => `<img src="${escapeHtml(s)}" onclick="viewImage('${escapeHtml(s)}')">`).join('')}
          </div>
        ` : ''}
      </div>
    </div>
    <button class="mb-close" type="button" onclick="dismissMeetingBanner('${latest.id}')" title="本次会话关闭(下次登录会再次出现)">✕</button>
  `;
  
  // 插到 tabBar 之后
  tabBar.parentNode.insertBefore(banner, tabBar.nextSibling);
}

function toggleMeetingBanner() {
  const banner = document.getElementById('meetingBanner');
  if (!banner) return;
  banner.classList.toggle('collapsed');
  const btn = document.getElementById('mbToggleBtn');
  if (btn) btn.textContent = banner.classList.contains('collapsed') ? '展开 ▼' : '收起 ▲';
}

function dismissMeetingBanner(id) {
  sessionStorage.setItem(`meetingBanner_dismissed_${id}`, '1');
  document.getElementById('meetingBanner')?.remove();
  toast('已隐藏 · 下次登录会再次出现');
}

function updateMeetingBadge() {
  const badge = document.getElementById('meetingsBadge');
  if (!badge) return;
  const pinned = MEETING_NOTES.filter(m => m.is_pinned && !m.deleted_at).length;
  badge.textContent = pinned;
  badge.classList.toggle('zero', pinned === 0);
}

// ============================================================
// 会议要点 tab 内容渲染
// ============================================================
function renderMeetings() {
  const container = document.getElementById('meetingsContainer');
  if (!container) return;
  
  const list = MEETING_NOTES.filter(m => !m.deleted_at);
  
  const headerHtml = `
    <div class="meetings-header">
      <div>
        <h2>📢 会议要点 / 工作计划</h2>
        <div class="mh-subtitle">主管发布本周会议内容,员工随时回看 · 共 ${list.length} 条记录</div>
      </div>
      ${IS_ADMIN ? `
        <button class="add-meeting-btn" onclick="addMeetingNote()">+ 发布新会议</button>
      ` : ''}
    </div>
  `;
  
  if (list.length === 0) {
    container.innerHTML = headerHtml + `
      <div class="meetings-empty">
        <div class="me-icon">📭</div>
        <div class="me-text">
          ${IS_ADMIN ? '还没有发布过会议要点。点击右上角"+ 发布新会议"开始' : '主管还没有发布会议要点,稍后再来'}
        </div>
        ${IS_ADMIN ? '<button class="add-meeting-btn" onclick="addMeetingNote()">+ 发布第一条</button>' : ''}
      </div>
    `;
    return;
  }
  
  const cardsHtml = list.map(m => _renderMeetingCard(m)).join('');
  container.innerHTML = headerHtml + cardsHtml;
}

function _renderMeetingCard(m) {
  const isPinned = m.is_pinned;
  const highlights = Array.isArray(m.highlights) ? m.highlights : [];
  
  const meta = [];
  if (m.meeting_date) meta.push(`📅 ${m.meeting_date}`);
  if (m.week_label) meta.push(`🗓 ${m.week_label}`);
  if (m.created_by_name) meta.push(`✍ ${escapeHtml(m.created_by_name)}`);
  meta.push(`🕐 ${formatTime(m.created_at)}`);
  
  return `
    <div class="meeting-card ${isPinned ? 'pinned' : 'archived'}">
      <div class="mc-header">
        <div class="mc-title-row">
          <h3 class="mc-title">${escapeHtml(m.title)}</h3>
          <div class="mc-meta">
            ${isPinned ? '<span class="mc-pin-badge">📌 置顶 · 员工首页显示</span>' : ''}
            ${meta.join(' · ')}
          </div>
        </div>
        ${IS_ADMIN ? `
          <div class="mc-actions">
            <button class="mc-action-btn ${isPinned ? 'pinned' : ''}" onclick="togglePinMeeting('${m.id}')" title="${isPinned ? '取消置顶,从首页横幅移除' : '置顶,在员工首页横幅显示'}">${isPinned ? '📌 已置顶' : '📌 置顶'}</button>
            <button class="mc-action-btn" onclick="editMeetingNote('${m.id}')">✏️ 编辑</button>
            <button class="mc-action-btn danger" onclick="deleteMeetingNote('${m.id}')">🗑 删除</button>
          </div>
        ` : ''}
      </div>
      ${highlights.length > 0 ? `
        <ul class="mc-highlights">
          ${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
        </ul>
      ` : ''}
      ${m.content ? `<div class="mc-content">${escapeHtml(m.content)}</div>` : ''}
      ${(m.screenshots && m.screenshots.length > 0) ? `
        <div class="mc-screenshots">
          ${m.screenshots.map(s => `<img src="${escapeHtml(s)}" onclick="viewImage('${escapeHtml(s)}')">`).join('')}
        </div>
      ` : ''}
      ${(m.attachments && m.attachments.length > 0) ? `
        <div class="mc-attachments">
          ${m.attachments.map(att => {
            const info = _getFileTypeInfo(att.name, att.type);
            return `
              <div class="mc-attachment" onclick="previewMeetingFile('${escapeHtml(att.url)}', '${escapeHtml(att.name)}', '${escapeHtml(att.type || '')}')">
                <span class="mc-att-icon">${info.icon}</span>
                <div class="mc-att-info">
                  <div class="mc-att-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</div>
                  <div class="mc-att-meta">${info.label} · ${_formatFileSize(att.size)} · 点击预览</div>
                </div>
                <div class="mc-att-actions">
                  <button onclick="event.stopPropagation();window.open('${escapeHtml(att.url)}','_blank')" title="下载">📥</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return iso; }
}

// ============================================================
// 主管: 新建会议要点
// ============================================================
function addMeetingNote() {
  if (!IS_ADMIN) { toast('仅主管可发布会议要点', 'warn'); return; }
  _meetingDraft = {
    title: '',
    content: '',
    highlights: [],
    screenshots: [],
    attachments: [],
    meeting_date: new Date().toISOString().slice(0, 10),
    week_label: _getCurrentWeekLabel(),
    is_pinned: true,  // 默认置顶
  };
  _renderMeetingModal({ isEdit: false });
  document.getElementById('meetingModal').classList.add('show');
}

function editMeetingNote(id) {
  if (!IS_ADMIN) { toast('仅主管可编辑', 'warn'); return; }
  const m = MEETING_NOTES.find(x => x.id === id);
  if (!m) { toast('找不到记录', 'err'); return; }
  _meetingDraft = {
    id: m.id,
    title: m.title || '',
    content: m.content || '',
    highlights: Array.isArray(m.highlights) ? [...m.highlights] : [],
    screenshots: Array.isArray(m.screenshots) ? [...m.screenshots] : [],
    attachments: Array.isArray(m.attachments) ? [...m.attachments] : [],
    meeting_date: m.meeting_date || '',
    week_label: m.week_label || _getCurrentWeekLabel(),
    is_pinned: !!m.is_pinned,
  };
  _renderMeetingModal({ isEdit: true });
  document.getElementById('meetingModal').classList.add('show');
}

function _renderMeetingModal({ isEdit }) {
  const modal = document.getElementById('meetingModal');
  if (!modal || !_meetingDraft) return;
  
  const d = _meetingDraft;
  
  const highlightsHtml = (d.highlights || []).map((h, i) => `
    <div class="mm-highlight-row" data-idx="${i}">
      <span class="mm-bullet">●</span>
      <input type="text" value="${escapeHtml(h)}" placeholder="例：本周完成 5000+ 单催货" 
             onchange="_updateHighlight(${i}, this.value)">
      <button type="button" class="mm-del" onclick="_removeHighlight(${i})" title="删除这条">×</button>
    </div>
  `).join('');
  
  const screenshotsHtml = (d.screenshots || []).map((s, i) => `
    <div class="mm-screenshot-wrap">
      <img src="${escapeHtml(s)}">
      <button type="button" class="mm-screenshot-del" onclick="_removeMeetingScreenshot(${i})">×</button>
    </div>
  `).join('');
  
  // V4-附件:渲染已上传的附件列表
  const attachmentsHtml = (d.attachments || []).map((att, i) => {
    const info = _getFileTypeInfo(att.name, att.type);
    return `
      <div class="mm-attachment-item">
        <span class="mm-att-icon">${info.icon}</span>
        <span class="mm-att-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="mm-att-size">${_formatFileSize(att.size)}</span>
        <button type="button" class="mm-att-del" onclick="_removeMeetingAttachment(${i})" title="移除">×</button>
      </div>
    `;
  }).join('');
  
  modal.innerHTML = `
    <div class="mm-card">
      <button class="mm-close" type="button" onclick="closeMeetingModal()">✕</button>
      <h2>${isEdit ? '✏️ 编辑会议要点' : '📢 发布会议要点'}</h2>
      
      <div class="mm-field">
        <label>会议主题 *</label>
        <input type="text" id="mmTitle" value="${escapeHtml(d.title)}" placeholder="例：本周工作要点 / 五月第三周例会">
      </div>
      
      <div class="mm-row">
        <div class="mm-field">
          <label>会议日期</label>
          <input type="date" id="mmMeetingDate" value="${d.meeting_date}">
        </div>
        <div class="mm-field">
          <label>周次标签</label>
          <input type="text" id="mmWeekLabel" value="${escapeHtml(d.week_label)}" placeholder="${_getCurrentWeekLabel()}">
        </div>
      </div>
      
      <div class="mm-pinned-row">
        <input type="checkbox" id="mmIsPinned" ${d.is_pinned ? 'checked' : ''}>
        <label for="mmIsPinned" style="margin: 0; cursor: pointer; font-weight: 600; color: #78350f;">
          📌 置顶到员工首页(所有 tab 顶部横幅显示)
        </label>
      </div>
      
      <div class="mm-field">
        <label>本周要点(每条一行,简洁明了)</label>
        <div class="mm-highlights-list">${highlightsHtml}</div>
        <button type="button" class="mm-add-highlight" onclick="_addHighlight()">+ 添加要点</button>
      </div>
      
      <div class="mm-field">
        <label>详细说明 / 工作计划</label>
        <textarea id="mmContent" rows="5" placeholder="例：&#10;1. 本周 PO 重点跟 …&#10;2. 售后率要降到 5% 以内&#10;3. 周五开月度评审会">${escapeHtml(d.content)}</textarea>
      </div>
      
      <div class="mm-field">
        <label>截图 / 图片(可选)</label>
        <div class="mm-screenshots-area">${screenshotsHtml}</div>
        <input type="file" id="mmFileInput" accept="image/*" multiple style="display:none;" onchange="_uploadMeetingScreenshots(this.files)">
        <button type="button" class="mm-add-highlight" onclick="document.getElementById('mmFileInput').click()">+ 上传图片</button>
      </div>
      
      <div class="mm-field">
        <label>📎 附件 - PDF / Excel / Word / 视频 等</label>
        <div class="mm-attachments-list">${attachmentsHtml}</div>
        <input type="file" id="mmAttachInput" multiple style="display:none;"
               accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,.mp4,.webm,.zip,image/*"
               onchange="_uploadMeetingAttachments(this.files)">
        <button type="button" class="mm-add-highlight" onclick="document.getElementById('mmAttachInput').click()">+ 上传附件</button>
        <div class="mm-upload-progress" id="mmUploadProgress"></div>
        <div class="mm-upload-hint">
          💡 支持 PDF / Excel / Word / 图片 / 视频 / 压缩包,单文件 ≤ 100 MB<br>
          💡 PPT 文件浏览器无法直接预览,建议另存为 PDF 后上传效果最好
        </div>
      </div>
      
      <div class="mm-footer">
        <span class="mm-hint">💡 ${d.is_pinned ? '发布后会显示在所有员工首页顶部' : '不置顶 · 仅在会议要点 tab 内可见'}</span>
        <button type="button" onclick="closeMeetingModal()">取消</button>
        <button type="button" class="primary" onclick="saveMeetingNote()">💾 ${isEdit ? '保存修改' : '发布'}</button>
      </div>
    </div>
  `;
}

function closeMeetingModal() {
  document.getElementById('meetingModal')?.classList.remove('show');
  _meetingDraft = null;
}

function _addHighlight() {
  if (!_meetingDraft) return;
  if (!Array.isArray(_meetingDraft.highlights)) _meetingDraft.highlights = [];
  _meetingDraft.highlights.push('');
  _renderMeetingModal({ isEdit: !!_meetingDraft.id });
}

function _removeHighlight(idx) {
  if (!_meetingDraft || !_meetingDraft.highlights) return;
  _meetingDraft.highlights.splice(idx, 1);
  _renderMeetingModal({ isEdit: !!_meetingDraft.id });
}

function _updateHighlight(idx, val) {
  if (!_meetingDraft || !_meetingDraft.highlights) return;
  _meetingDraft.highlights[idx] = val;
  // 不重渲(避免 input 失焦)
}

function _removeMeetingScreenshot(idx) {
  if (!_meetingDraft || !_meetingDraft.screenshots) return;
  _meetingDraft.screenshots.splice(idx, 1);
  _renderMeetingModal({ isEdit: !!_meetingDraft.id });
}

async function _uploadMeetingScreenshots(files) {
  if (!files || files.length === 0) return;
  if (!_meetingDraft) return;
  toast(`上传 ${files.length} 张图片中...`, 'info');
  
  // 复用现有的图片上传逻辑(从 utils.js)
  for (const file of files) {
    try {
      // 简化版: 转 base64 直接存(数据库 jsonb 能存)
      // 如果有 Supabase Storage,可以改成上传到 storage
      const dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      _meetingDraft.screenshots.push(dataUrl);
    } catch (e) {
      console.error('上传失败:', e);
      toast('图片上传失败: ' + (e.message || e), 'err');
    }
  }
  _renderMeetingModal({ isEdit: !!_meetingDraft.id });
}

async function saveMeetingNote() {
  if (!_meetingDraft) return;
  
  // 收集字段
  _meetingDraft.title = document.getElementById('mmTitle').value.trim();
  _meetingDraft.content = document.getElementById('mmContent').value.trim();
  _meetingDraft.meeting_date = document.getElementById('mmMeetingDate').value;
  _meetingDraft.week_label = document.getElementById('mmWeekLabel').value.trim();
  _meetingDraft.is_pinned = document.getElementById('mmIsPinned').checked;
  // 清理空 highlights
  _meetingDraft.highlights = (_meetingDraft.highlights || []).filter(h => h && h.trim());
  
  if (!_meetingDraft.title) {
    toast('请填写会议主题', 'warn');
    return;
  }
  
  const payload = {
    title: _meetingDraft.title,
    content: _meetingDraft.content || null,
    highlights: _meetingDraft.highlights,
    screenshots: _meetingDraft.screenshots || [],
    attachments: _meetingDraft.attachments || [],
    meeting_date: _meetingDraft.meeting_date || null,
    week_label: _meetingDraft.week_label || null,
    is_pinned: _meetingDraft.is_pinned,
    updated_at: new Date().toISOString(),
  };
  
  try {
    if (_meetingDraft.id) {
      // 编辑
      const { error } = await sb.from('meeting_notes')
        .update(payload)
        .eq('id', _meetingDraft.id);
      if (error) throw error;
      toast(`✓ 已更新「${_meetingDraft.title}」`);
    } else {
      // 新建
      payload.created_by_name = CURRENT_AGENT || '主管';
      const { data: { user } } = await sb.auth.getUser();
      if (user) payload.created_by = user.id;
      const { error } = await sb.from('meeting_notes').insert(payload);
      if (error) throw error;
      toast(`✓ 已发布「${_meetingDraft.title}」`);
    }
    closeMeetingModal();
    await loadMeetings();
  } catch (e) {
    console.error('保存会议要点失败:', e);
    toast('保存失败:' + (e.message || e), 'err');
  }
}

async function deleteMeetingNote(id) {
  if (!IS_ADMIN) { toast('仅主管可删除', 'warn'); return; }
  const m = MEETING_NOTES.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`确定删除「${m.title}」?\n\n删除后员工首页和 tab 中都不再显示。`)) return;
  
  try {
    const { error } = await sb.from('meeting_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    toast('已删除');
    await loadMeetings();
  } catch (e) {
    console.error('删除失败:', e);
    toast('删除失败:' + (e.message || e), 'err');
  }
}

async function togglePinMeeting(id) {
  if (!IS_ADMIN) { toast('仅主管可置顶', 'warn'); return; }
  const m = MEETING_NOTES.find(x => x.id === id);
  if (!m) return;
  const newPinned = !m.is_pinned;
  
  try {
    const { error } = await sb.from('meeting_notes')
      .update({ is_pinned: newPinned, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    toast(newPinned ? '✓ 已置顶 · 员工首页会显示' : '✓ 已取消置顶');
    await loadMeetings();
  } catch (e) {
    console.error('置顶切换失败:', e);
    toast('操作失败:' + (e.message || e), 'err');
  }
}

// ============================================================
// V4-2026-05-24:附件支持(PDF/Excel/Word/PPT/视频/图片)
// 使用 Supabase Storage 存储 + 在线预览
// ============================================================

// 文件类型识别
function _getFileTypeInfo(fileName, mimeType) {
  const name = (fileName || '').toLowerCase();
  const ext = name.split('.').pop();
  const mime = (mimeType || '').toLowerCase();
  
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) {
    return { icon: '🖼️', kind: 'image', label: '图片' };
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return { icon: '📕', kind: 'pdf', label: 'PDF' };
  }
  if (mime.includes('spreadsheet') || mime === 'application/vnd.ms-excel' || ext === 'xlsx' || ext === 'xls') {
    return { icon: '📊', kind: 'excel', label: 'Excel' };
  }
  if (ext === 'csv' || mime === 'text/csv') {
    return { icon: '📋', kind: 'csv', label: 'CSV' };
  }
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || ext === 'docx' || ext === 'doc') {
    return { icon: '📘', kind: 'word', label: 'Word' };
  }
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint' || ext === 'pptx' || ext === 'ppt') {
    return { icon: '📊', kind: 'ppt', label: 'PPT' };
  }
  if (mime.startsWith('video/') || ['mp4','webm','mov','avi'].includes(ext)) {
    return { icon: '🎬', kind: 'video', label: '视频' };
  }
  if (mime === 'application/zip' || ext === 'zip') {
    return { icon: '🗄️', kind: 'zip', label: '压缩包' };
  }
  return { icon: '📎', kind: 'other', label: '文件' };
}

function _formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

// 上传附件到 Supabase Storage
async function _uploadMeetingAttachment(file) {
  if (!file) return null;
  const maxSize = 100 * 1024 * 1024;  // 100 MB
  if (file.size > maxSize) {
    toast(`文件 ${file.name} 超过 100MB,无法上传`, 'err');
    return null;
  }
  
  // 用时间戳 + 随机串避免重名
  const ext = file.name.split('.').pop();
  const safeName = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5.-]/g, '_');
  const path = `${Date.now()}_${Math.random().toString(36).slice(2,8)}_${safeName}`;
  
  try {
    const { data, error } = await sb.storage
      .from('meeting-files')
      .upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
      });
    if (error) throw error;
    
    // 拿 public URL
    const { data: urlData } = sb.storage.from('meeting-files').getPublicUrl(path);
    
    return {
      name: file.name,
      url: urlData.publicUrl,
      path,
      type: file.type,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error('上传附件失败:', e);
    toast(`上传 ${file.name} 失败: ${e.message || e}`, 'err');
    return null;
  }
}

// modal 内点击上传附件
async function _uploadMeetingAttachments(files) {
  if (!files || files.length === 0) return;
  if (!_meetingDraft) return;
  
  if (!Array.isArray(_meetingDraft.attachments)) _meetingDraft.attachments = [];
  
  // 显示上传进度
  const progressEl = document.getElementById('mmUploadProgress');
  if (progressEl) progressEl.textContent = `上传中... 0 / ${files.length}`;
  
  let done = 0;
  for (const file of files) {
    const result = await _uploadMeetingAttachment(file);
    if (result) {
      _meetingDraft.attachments.push(result);
    }
    done++;
    if (progressEl) progressEl.textContent = `上传中... ${done} / ${files.length}`;
  }
  
  if (progressEl) progressEl.textContent = '';
  _renderMeetingModal({ isEdit: !!_meetingDraft.id });
  toast(`✓ 已上传 ${done} 个附件`);
}

function _removeMeetingAttachment(idx) {
  if (!_meetingDraft || !_meetingDraft.attachments) return;
  if (!confirm('确定移除此附件?(已上传的文件会从云端删除)')) return;
  
  const att = _meetingDraft.attachments[idx];
  if (att && att.path) {
    // 从 Storage 删除文件
    sb.storage.from('meeting-files').remove([att.path]).catch(e => {
      console.warn('删除 Storage 文件失败:', e);
    });
  }
  _meetingDraft.attachments.splice(idx, 1);
  _renderMeetingModal({ isEdit: !!_meetingDraft.id });
}

// 在线预览文件
async function previewMeetingFile(url, fileName, mimeType) {
  const info = _getFileTypeInfo(fileName, mimeType);
  
  // 移除可能存在的旧 modal
  document.getElementById('filePreviewModal')?.remove();
  
  const modal = document.createElement('div');
  modal.id = 'filePreviewModal';
  modal.className = 'show';
  
  let bodyHtml = '';
  let extraActions = '';
  
  switch (info.kind) {
    case 'image':
      bodyHtml = `<img src="${escapeHtml(url)}" alt="${escapeHtml(fileName)}">`;
      break;
      
    case 'pdf':
      // PDF 用浏览器原生 PDF.js iframe
      bodyHtml = `<iframe src="${escapeHtml(url)}#toolbar=1" frameborder="0"></iframe>`;
      break;
      
    case 'video':
      bodyHtml = `<video src="${escapeHtml(url)}" controls autoplay></video>`;
      break;
      
    case 'excel':
    case 'csv':
      // 用 SheetJS 解析
      bodyHtml = `<div class="fpm-table-wrap"><div style="text-align:center;padding:40px;color:#6b7280;">⏳ 加载表格中...</div></div>`;
      break;
      
    case 'word':
      // 用 mammoth.js 转 HTML
      bodyHtml = `<div class="fpm-table-wrap"><div style="text-align:center;padding:40px;color:#6b7280;">⏳ 加载文档中...</div></div>`;
      break;
      
    case 'ppt':
      // PPT 无法直接预览,提示
      bodyHtml = `
        <div class="fpm-unsupported">
          <div class="fpm-icon">📊</div>
          <div style="font-size:18px;margin-bottom:8px;">PPT 文件浏览器无法直接预览</div>
          <div style="font-size:14px;opacity:0.8;margin-bottom:24px;">建议主管下次上传时,先将 PPT 另存为 PDF,效果更好</div>
          <button onclick="window.open('${escapeHtml(url)}','_blank')" 
                  style="padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;">
            📥 下载查看
          </button>
        </div>
      `;
      break;
      
    default:
      bodyHtml = `
        <div class="fpm-unsupported">
          <div class="fpm-icon">${info.icon}</div>
          <div style="font-size:18px;margin-bottom:8px;">无法在线预览此类型文件</div>
          <button onclick="window.open('${escapeHtml(url)}','_blank')" 
                  style="padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;">
            📥 下载文件
          </button>
        </div>
      `;
  }
  
  modal.innerHTML = `
    <div class="fpm-header">
      <span class="fpm-title">${info.icon} ${escapeHtml(fileName)}</span>
      <div class="fpm-actions">
        <button onclick="window.open('${escapeHtml(url)}','_blank')">📥 下载</button>
        ${extraActions}
        <button class="primary" onclick="closeFilePreview()">关闭 (Esc)</button>
      </div>
    </div>
    <div class="fpm-body" id="fpmBody">${bodyHtml}</div>
  `;
  document.body.appendChild(modal);
  
  // Esc 关闭
  const handler = (e) => { if (e.key === 'Escape') closeFilePreview(); };
  document.addEventListener('keydown', handler);
  modal._escHandler = handler;
  
  // 异步加载 Excel/Word
  if (info.kind === 'excel' || info.kind === 'csv') {
    _loadAndRenderSpreadsheet(url, info.kind);
  } else if (info.kind === 'word') {
    _loadAndRenderWord(url);
  }
}

function closeFilePreview() {
  const modal = document.getElementById('filePreviewModal');
  if (modal) {
    if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
    modal.remove();
  }
}

// 加载 SheetJS 库并渲染 Excel/CSV
async function _loadAndRenderSpreadsheet(url, kind) {
  try {
    // 加载 SheetJS
    if (typeof XLSX === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload = res;
        s.onerror = () => rej(new Error('SheetJS 加载失败'));
        document.head.appendChild(s);
      });
    }
    
    // 拉文件
    const response = await fetch(url);
    if (!response.ok) throw new Error('下载失败');
    const buf = await response.arrayBuffer();
    
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
    
    const body = document.getElementById('fpmBody');
    if (body) {
      const sheetTabs = workbook.SheetNames.length > 1 
        ? `<div style="margin-bottom:12px;padding:8px;background:white;border-radius:6px;font-size:12px;color:#6b7280;">📑 工作表: ${workbook.SheetNames.map((n,i) => `<span style="${i===0?'color:#2563eb;font-weight:600':''}">${escapeHtml(n)}</span>`).join(' · ')} (仅显示第一个)</div>`
        : '';
      body.innerHTML = `<div class="fpm-table-wrap">${sheetTabs}${html}</div>`;
    }
  } catch (e) {
    const body = document.getElementById('fpmBody');
    if (body) body.innerHTML = `<div class="fpm-unsupported"><div class="fpm-icon">⚠️</div><div>加载失败: ${escapeHtml(e.message || String(e))}</div></div>`;
  }
}

// 加载 mammoth.js 并渲染 Word
async function _loadAndRenderWord(url) {
  try {
    if (typeof mammoth === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
        s.onload = res;
        s.onerror = () => rej(new Error('mammoth.js 加载失败'));
        document.head.appendChild(s);
      });
    }
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('下载失败');
    const buf = await response.arrayBuffer();
    
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    
    const body = document.getElementById('fpmBody');
    if (body) {
      body.innerHTML = `<div class="fpm-table-wrap" style="line-height:1.8;font-size:14px;color:#1f2937;">${result.value}</div>`;
    }
  } catch (e) {
    const body = document.getElementById('fpmBody');
    if (body) body.innerHTML = `<div class="fpm-unsupported"><div class="fpm-icon">⚠️</div><div>加载失败: ${escapeHtml(e.message || String(e))}</div></div>`;
  }
}
