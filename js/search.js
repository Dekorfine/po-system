// ============================================================
// 跟单团队工作台 · search.js (V4 · 2026-05-24)
// 智能全局搜索
//
// 设计:
//   - Cmd+K / Ctrl+K 快捷键唤起搜索框
//   - 顶部一个搜索按钮也能触发
//   - 实时搜索 9 大数据源:
//     销售单 / 采购单(PO) / 催单 / 售后 / 供应商问题 / 产品 / 找灯 / 会议要点 / 跟单员
//   - 关键词分词 + 多字段匹配
//   - 点击结果直接跳转到对应 tab + 高亮目标
//
// 依赖: core.js (DATA, ORDERS, AFTERSALES, ISSUES, MISSING_LIGHTS, PO_LIST, MEETING_NOTES, CURRENT_AGENT, escapeHtml)
// ============================================================

// 注入 CSS
(function _injectSearchCSS() {
  if (document.getElementById('search-style')) return;
  const s = document.createElement('style');
  s.id = 'search-style';
  s.textContent = `
    /* 顶部触发按钮 */
    .global-search-btn {
      position: fixed;
      top: 14px;
      right: 280px;
      z-index: 999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      color: #6b7280;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .global-search-btn:hover {
      border-color: #93c5fd;
      color: #2563eb;
      box-shadow: 0 2px 8px rgba(37,99,235,0.1);
    }
    .global-search-btn .gsb-kbd {
      background: #f3f4f6;
      color: #6b7280;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      border: 1px solid #e5e7eb;
    }
    @media (max-width: 1280px) {
      .global-search-btn { right: 200px; }
      .global-search-btn .gsb-text { display: none; }
    }
    @media (max-width: 760px) {
      .global-search-btn { right: 80px; padding: 6px 8px; }
      .global-search-btn .gsb-kbd { display: none; }
    }

    /* 搜索 modal */
    #globalSearchModal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 80px;
    }
    #globalSearchModal.show { display: flex; }
    .gsm-card {
      background: white;
      width: 100%;
      max-width: 720px;
      max-height: 80vh;
      border-radius: 14px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: gsmFadeIn 0.18s ease-out;
    }
    @keyframes gsmFadeIn {
      from { opacity: 0; transform: translateY(-12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .gsm-input-wrap {
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .gsm-input-wrap .gsm-icon {
      font-size: 20px;
    }
    .gsm-input-wrap input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 16px;
      background: transparent;
      color: #111827;
    }
    .gsm-input-wrap input::placeholder {
      color: #9ca3af;
    }
    .gsm-input-wrap .gsm-clear {
      width: 22px;
      height: 22px;
      border: none;
      background: #f3f4f6;
      color: #6b7280;
      border-radius: 50%;
      cursor: pointer;
      font-size: 12px;
      display: none;
    }
    .gsm-input-wrap.has-input .gsm-clear { display: block; }
    
    .gsm-results {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }
    .gsm-empty {
      padding: 40px 20px;
      text-align: center;
      color: #9ca3af;
    }
    .gsm-empty .gsm-empty-icon {
      font-size: 48px;
      opacity: 0.4;
      margin-bottom: 14px;
    }
    .gsm-hint {
      padding: 16px 24px;
      color: #6b7280;
      font-size: 12.5px;
      background: #f9fafb;
      border-top: 1px solid #f3f4f6;
    }
    .gsm-hint kbd {
      display: inline-block;
      padding: 1px 6px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      color: #374151;
      margin: 0 2px;
    }
    
    .gsm-group {
      padding: 4px 0;
    }
    .gsm-group-title {
      padding: 6px 20px 4px 20px;
      font-size: 11px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      display: flex;
      justify-content: space-between;
    }
    .gsm-group-title .gsm-group-count {
      color: #6b7280;
      font-weight: 600;
    }
    .gsm-result {
      padding: 10px 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      border-left: 3px solid transparent;
      transition: all 0.1s;
    }
    .gsm-result:hover, .gsm-result.active {
      background: #eff6ff;
      border-left-color: #2563eb;
    }
    .gsm-result-icon {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      background: #f3f4f6;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .gsm-result-body {
      flex: 1;
      min-width: 0;
    }
    .gsm-result-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gsm-result-title mark {
      background: #fef3c7;
      color: #92400e;
      padding: 0 2px;
      border-radius: 2px;
      font-weight: 700;
    }
    .gsm-result-meta {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gsm-result-meta mark {
      background: #fef3c7;
      color: #92400e;
      padding: 0 2px;
      border-radius: 2px;
    }
    .gsm-result-tag {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .gsm-result-tag.tag-orders { background: #fef3c7; color: #92400e; }
    .gsm-result-tag.tag-aftersales { background: #fee2e2; color: #991b1b; }
    .gsm-result-tag.tag-issues { background: #ede9fe; color: #5b21b6; }
    .gsm-result-tag.tag-sales { background: #dbeafe; color: #1e40af; }
    .gsm-result-tag.tag-po { background: #fde68a; color: #78350f; }
    .gsm-result-tag.tag-products { background: #d1fae5; color: #065f46; }
    .gsm-result-tag.tag-missing { background: #fed7aa; color: #9a3412; }
    .gsm-result-tag.tag-meetings { background: #fbcfe8; color: #9d174d; }
    .gsm-result-tag.tag-agents { background: #e0e7ff; color: #3730a3; }
  `;
  document.head.appendChild(s);
})();

// 注入搜索按钮 + modal 容器
(function _injectSearchUI() {
  const tryInject = () => {
    if (document.getElementById('globalSearchBtn')) return;
    
    // 创建顶部按钮
    const btn = document.createElement('button');
    btn.id = 'globalSearchBtn';
    btn.className = 'global-search-btn';
    btn.type = 'button';
    btn.onclick = openGlobalSearch;
    btn.innerHTML = `
      <span style="font-size:14px;">🔍</span>
      <span class="gsb-text">搜索全部</span>
      <span class="gsb-kbd">${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K</span>
    `;
    document.body.appendChild(btn);
    
    // 创建 modal 容器
    if (!document.getElementById('globalSearchModal')) {
      const modal = document.createElement('div');
      modal.id = 'globalSearchModal';
      document.body.appendChild(modal);
    }
    
    // 注册键盘快捷键
    document.addEventListener('keydown', (e) => {
      // Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openGlobalSearch();
      }
    });
  };
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(tryInject, 800);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInject, 800));
  }
})();

// ============================================================
// 打开搜索框
// ============================================================
let _searchActiveIdx = 0;  // 当前键盘选中的结果
let _searchResults = [];   // 当前结果

function openGlobalSearch() {
  // 没登录的时候不显示
  if (typeof CURRENT_AGENT === 'undefined' || !CURRENT_AGENT) return;
  
  const modal = document.getElementById('globalSearchModal');
  if (!modal) return;
  
  modal.classList.add('show');
  modal.innerHTML = `
    <div class="gsm-card">
      <div class="gsm-input-wrap" id="gsmInputWrap">
        <span class="gsm-icon">🔍</span>
        <input type="text" id="gsmInput" placeholder="搜索订单 / PO / 售后 / 产品 / 供应商 / 会议..." autocomplete="off" autofocus>
        <button type="button" class="gsm-clear" onclick="document.getElementById('gsmInput').value='';doGlobalSearch('')">×</button>
      </div>
      <div class="gsm-results" id="gsmResults">
        <div class="gsm-empty">
          <div class="gsm-empty-icon">🔎</div>
          <div>输入关键词搜索 · 例如订单号 / SKU / 供应商名 / 客户名</div>
        </div>
      </div>
      <div class="gsm-hint">
        <kbd>↑↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭
      </div>
    </div>
  `;
  
  const input = document.getElementById('gsmInput');
  setTimeout(() => input?.focus(), 50);
  
  input.addEventListener('input', (e) => doGlobalSearch(e.target.value));
  input.addEventListener('keydown', _onSearchKeydown);
  
  // 点遮罩关闭
  modal.addEventListener('click', (e) => { if (e.target === modal) closeGlobalSearch(); });
  
  _searchActiveIdx = 0;
  _searchResults = [];
}

function closeGlobalSearch() {
  document.getElementById('globalSearchModal')?.classList.remove('show');
}

function _onSearchKeydown(e) {
  if (e.key === 'Escape') {
    closeGlobalSearch();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _searchActiveIdx = Math.min(_searchActiveIdx + 1, _searchResults.length - 1);
    _updateActiveResult();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    _searchActiveIdx = Math.max(_searchActiveIdx - 1, 0);
    _updateActiveResult();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (_searchResults.length > 0 && _searchResults[_searchActiveIdx]) {
      _searchResults[_searchActiveIdx].onClick();
    }
    return;
  }
}

function _updateActiveResult() {
  document.querySelectorAll('.gsm-result').forEach((el, i) => {
    el.classList.toggle('active', i === _searchActiveIdx);
  });
  // 滚动到可视区
  const active = document.querySelector('.gsm-result.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// ============================================================
// 核心搜索逻辑
// ============================================================
function doGlobalSearch(query) {
  const wrap = document.getElementById('gsmInputWrap');
  const results = document.getElementById('gsmResults');
  if (!wrap || !results) return;
  
  if (query && query.trim()) wrap.classList.add('has-input');
  else wrap.classList.remove('has-input');
  
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    results.innerHTML = `
      <div class="gsm-empty">
        <div class="gsm-empty-icon">🔎</div>
        <div>输入关键词搜索 · 例如订单号 / SKU / 供应商名 / 客户名</div>
      </div>
    `;
    _searchResults = [];
    return;
  }
  
  // 分词(空格分开)
  const tokens = q.split(/\s+/).filter(t => t.length > 0);
  
  // 收集各数据源结果
  const groups = [
    _searchOrders(tokens),
    _searchAftersales(tokens),
    _searchIssues(tokens),
    _searchSales(tokens),
    _searchPo(tokens),
    _searchProducts(tokens),
    _searchMissing(tokens),
    _searchMeetings(tokens),
    _searchAgents(tokens),
  ].filter(g => g && g.results.length > 0);
  
  // 渲染
  if (groups.length === 0) {
    results.innerHTML = `
      <div class="gsm-empty">
        <div class="gsm-empty-icon">🤷</div>
        <div>没找到匹配 "${escapeHtml(query)}" 的内容</div>
        <div style="margin-top:8px;font-size:12px;color:#9ca3af;">试试用更短的关键词,或换一个关键词</div>
      </div>
    `;
    _searchResults = [];
    return;
  }
  
  // 扁平化所有结果方便键盘导航
  _searchResults = groups.flatMap(g => g.results);
  _searchActiveIdx = 0;
  
  let html = '';
  let globalIdx = 0;
  groups.forEach(g => {
    html += `
      <div class="gsm-group">
        <div class="gsm-group-title">
          <span>${g.icon} ${g.label}</span>
          <span class="gsm-group-count">${g.results.length} 项</span>
        </div>
        ${g.results.map((r, i) => {
          const isActive = globalIdx === 0;
          globalIdx++;
          return `
            <div class="gsm-result ${isActive ? 'active' : ''}" onclick='_clickSearchResult(${globalIdx - 1})'>
              <div class="gsm-result-icon">${r.icon || g.icon}</div>
              <div class="gsm-result-body">
                <div class="gsm-result-title">${r.title}</div>
                <div class="gsm-result-meta">${r.meta || ''}</div>
              </div>
              <span class="gsm-result-tag tag-${g.tagKey}">${g.tagLabel}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  });
  
  results.innerHTML = html;
}

function _clickSearchResult(idx) {
  if (_searchResults[idx] && _searchResults[idx].onClick) {
    _searchResults[idx].onClick();
  }
}

// ============================================================
// 工具函数
// ============================================================

// 匹配判断:所有 token 都要出现在 text 里
function _matchAll(text, tokens) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return tokens.every(tok => t.includes(tok));
}

// 高亮 token
function _highlight(text, tokens) {
  if (!text) return '';
  let result = escapeHtml(String(text));
  tokens.forEach(tok => {
    if (!tok) return;
    const re = new RegExp('(' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    result = result.replace(re, '<mark>$1</mark>');
  });
  return result;
}

// 限制结果数(每组最多 5 个)
const MAX_PER_GROUP = 5;

// ============================================================
// 各数据源搜索
// ============================================================

function _searchOrders(tokens) {
  if (typeof ORDERS === 'undefined' || !ORDERS) return null;
  const results = [];
  for (const o of ORDERS) {
    if (o.deletedAt) continue;
    const searchText = [o.orderNo, o.product, o.supplier, o.notes, o.site, o._agent].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      results.push({
        icon: '🔥',
        title: _highlight(o.orderNo || '(未填订单号)', tokens),
        meta: _highlight(`${o.site || ''} · ${o.product || ''} · ${o.supplier || '未填供应商'} · ${o.status || ''}`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('orders');
          // 滚动到目标
          setTimeout(() => {
            const els = document.querySelectorAll('.record-row');
            for (const el of els) {
              if (el.textContent.includes(o.orderNo)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.outline = '3px solid #f59e0b';
                setTimeout(() => { el.style.outline = ''; }, 2500);
                break;
              }
            }
          }, 200);
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '🔥', label: '催单', tagKey: 'orders', tagLabel: '催单', results };
}

function _searchAftersales(tokens) {
  if (typeof AFTERSALES === 'undefined' || !AFTERSALES) return null;
  const results = [];
  for (const a of AFTERSALES) {
    if (a.deletedAt) continue;
    const searchText = [a.orderNo, a.product, a.supplier, a.reason, a.reasonDetail, a.site, a._agent].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      results.push({
        icon: '🔧',
        title: _highlight(a.orderNo || '(未填订单号)', tokens),
        meta: _highlight(`${a.site || ''} · ${a.reason || ''} · ${a.supplier || '未填供应商'} · ${a.status || ''}`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('aftersales');
          setTimeout(() => {
            const els = document.querySelectorAll('.record-row');
            for (const el of els) {
              if (el.textContent.includes(a.orderNo)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.outline = '3px solid #f59e0b';
                setTimeout(() => { el.style.outline = ''; }, 2500);
                break;
              }
            }
          }, 200);
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '🔧', label: '售后', tagKey: 'aftersales', tagLabel: '售后', results };
}

function _searchIssues(tokens) {
  if (typeof ISSUES === 'undefined' || !ISSUES) return null;
  const results = [];
  for (const it of ISSUES) {
    if (it.deletedAt) continue;
    const searchText = [it.supplier, it.description, it.requirement, it.issueType, it.category, ...(it.subTags || []), it._agent].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      const catLabel = (typeof _getIssueCategoryMeta === 'function') ? (_getIssueCategoryMeta(it)?.label || '') : (it.issueType || '');
      results.push({
        icon: '⚠',
        title: _highlight(it.supplier || '(未填供应商)', tokens),
        meta: _highlight(`${catLabel} · ${(it.description || it.requirement || '').slice(0, 80)}`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('issues');
          setTimeout(() => {
            if (typeof openIssueModal === 'function') {
              openIssueModal(it._id, it._agent || '');
            }
          }, 300);
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '⚠', label: '供应商问题', tagKey: 'issues', tagLabel: '问题', results };
}

function _searchSales(tokens) {
  if (typeof SHOPIFY === 'undefined' || !SHOPIFY || !SHOPIFY._orders) return null;
  const results = [];
  for (const o of SHOPIFY._orders) {
    const searchText = [o.order_no, o.customer_name, o.shipping_address, o.shop, (o.line_items || []).map(li => li.title || li.sku).join(' ')].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      results.push({
        icon: '🛒',
        title: _highlight(o.order_no || '(无订单号)', tokens),
        meta: _highlight(`${o.shop || ''} · ${o.customer_name || ''} · ¥${o.total_amount || 0}`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('sales');
          setTimeout(() => {
            const els = document.querySelectorAll('[data-order-no]');
            for (const el of els) {
              if (el.getAttribute('data-order-no') === o.order_no) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.outline = '3px solid #f59e0b';
                setTimeout(() => { el.style.outline = ''; }, 2500);
                break;
              }
            }
          }, 200);
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '🛒', label: '销售单', tagKey: 'sales', tagLabel: '销售', results };
}

function _searchPo(tokens) {
  if (typeof PO_LIST === 'undefined' || !PO_LIST) return null;
  const results = [];
  for (const p of PO_LIST) {
    const skus = (p.line_items || []).map(li => `${li.sku || ''} ${li.title_cn || ''} ${li.title_en || ''}`).join(' ');
    const searchText = [p.po_number, p.supplier, p.order_no, p.box_note, skus].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      results.push({
        icon: '📦',
        title: _highlight(p.po_number || '(无 PO 号)', tokens),
        meta: _highlight(`${p.supplier || '未填供应商'} · 销售单 ${p.order_no || ''} · ¥${p.total_amount || 0}`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('po');
          setTimeout(() => {
            const els = document.querySelectorAll('[data-po-id], .po-card');
            for (const el of els) {
              if (el.textContent.includes(p.po_number)) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.outline = '3px solid #f59e0b';
                setTimeout(() => { el.style.outline = ''; }, 2500);
                break;
              }
            }
          }, 200);
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '📦', label: '采购单', tagKey: 'po', tagLabel: '采购', results };
}

function _searchProducts(tokens) {
  if (typeof PRODUCTS_CACHE === 'undefined' || !PRODUCTS_CACHE) return null;
  const products = PRODUCTS_CACHE._all || [];
  const results = [];
  for (const p of products) {
    const searchText = [p.sku, p.name_cn, p.name_en, p.notes].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      results.push({
        icon: '💡',
        title: _highlight(`${p.sku || ''} · ${p.name_cn || p.name_en || ''}`, tokens),
        meta: _highlight(p.name_en || p.notes || '', tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('products');
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '💡', label: '产品', tagKey: 'products', tagLabel: '产品', results };
}

function _searchMissing(tokens) {
  if (typeof MISSING_LIGHTS === 'undefined' || !MISSING_LIGHTS) return null;
  const results = [];
  for (const m of MISSING_LIGHTS) {
    if (m.deletedAt) continue;
    const searchText = [m.description, m.specs, m.customerOrderNo, m.creator].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      results.push({
        icon: '🔍',
        title: _highlight(m.description || '(无描述)', tokens),
        meta: _highlight(`订单 ${m.customerOrderNo || '—'} · ${m.specs || ''} · ${m.status || ''}`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('missing');
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '🔍', label: '找灯', tagKey: 'missing', tagLabel: '找灯', results };
}

function _searchMeetings(tokens) {
  if (typeof MEETING_NOTES === 'undefined' || !MEETING_NOTES) return null;
  const results = [];
  for (const m of MEETING_NOTES) {
    if (m.deleted_at) continue;
    const searchText = [m.title, m.content, (m.highlights || []).join(' '), m.created_by_name].filter(Boolean).join(' ');
    if (_matchAll(searchText, tokens)) {
      results.push({
        icon: '📢',
        title: _highlight(m.title, tokens),
        meta: _highlight(`${m.meeting_date || ''} · ${m.created_by_name || ''} · ${(m.content || '').slice(0, 80)}`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('meetings');
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '📢', label: '会议要点', tagKey: 'meetings', tagLabel: '会议', results };
}

function _searchAgents(tokens) {
  if (typeof CONFIG === 'undefined' || !CONFIG.agents) return null;
  // 只有主管/老板能搜跟单员
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) return null;
  
  const results = [];
  for (const a of CONFIG.agents) {
    const searchText = [a.name, ...(a.sites || []), ...(a.modules || [])].join(' ');
    if (_matchAll(searchText, tokens)) {
      const role = a.isBoss ? '👑 老板' : (a.isAdmin ? '👔 主管' : '👤 员工');
      results.push({
        icon: a.isBoss ? '👑' : (a.isAdmin ? '👔' : '👤'),
        title: _highlight(a.name, tokens),
        meta: _highlight(`${role} · ${(a.sites || []).join('/')} · ${(a.modules || []).length} 个模块`, tokens),
        onClick: () => {
          closeGlobalSearch();
          if (typeof switchTab === 'function') switchTab('settings');
        },
      });
      if (results.length >= MAX_PER_GROUP) break;
    }
  }
  if (results.length === 0) return null;
  return { icon: '👥', label: '跟单员', tagKey: 'agents', tagLabel: '员工', results };
}
