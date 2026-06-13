// ============================================================================
// V20260613:线下单对接(客服 cs → 跟单 po)
//   契约(已与 cs-system fix231 对齐):
//   · 收转单:cross_dept_messages 筛 to_system='po' AND related_type='offline_transfer'
//     related_ref=订单号 · related_shop=网站 · to_user_id/name=指派(空=全员) · attachments=付款凭证
//     body=人读格式化文本(产品明细只在文本里 · 要结构化用订单号回 pyfmu/Shopify 拉)
//   · 回出货:往 cross_dept_messages 写 from_system='po' to_system='cs'
//     related_type='po_shipped' related_ref=订单号 · cs 订阅后自动写 CLOUD.offline_orders
//   · po-system 不直连 CLOUD · 只用已连的 xyhbw(cdmClient)
//   附件铁律:全是 Storage 公开 URL · 禁 base64(撑爆行→同步静默失败)· 渲染层强制校验
// ============================================================================

const OFFLINE = {
  _list: [],
  _filter: 'todo',        // todo=待处理(pending/in_progress) · shipped=已出货 · all
  _loadedAt: 0,
};
window.OFFLINE = OFFLINE;

// 判断一个值是不是 base64(客服粘贴付款截图最容易混进来)
function _offIsBase64(v) {
  const s = String(v || '');
  return s.startsWith('data:') || (s.length > 500 && !/^https?:\/\//.test(s));
}

// 安全取附件 URL(复用 cross-dept 的 cdmAttUrl · 再加 base64 拦截)
function _offAttUrl(a) {
  let u = '';
  if (typeof cdmAttUrl === 'function') u = cdmAttUrl(a);
  else u = (a && (a.url || a.publicUrl)) || '';
  if (_offIsBase64(u) || _offIsBase64(a && a.dataUrl)) return '__BASE64__';
  return u;
}

async function loadOfflineOrders() {
  if (typeof cdmClient === 'undefined') return;
  try {
    const { data, error } = await cdmClient
      .from('cross_dept_messages')
      .select('id,from_system,from_user_name,to_system,to_user_id,to_user_name,related_ref,related_shop,priority,title,body,attachments,related_type,status,thread,created_at_ms,updated_at,deleted')
      .eq('to_system', 'po')
      .eq('related_type', 'offline_transfer')
      .order('created_at_ms', { ascending: false })
      .limit(300);
    if (error) throw error;
    OFFLINE._list = (data || []).filter(m => !m.deleted);
    OFFLINE._loadedAt = Date.now();
  } catch (e) {
    console.warn('[offline] 加载线下单失败:', e.message);
    OFFLINE._list = [];
  }
}

function renderOfflineOrders() {
  const body = document.getElementById('offlineBody');
  if (!body) return;

  const myId = (typeof CURRENT_USER_ID !== 'undefined') ? CURRENT_USER_ID : null;
  const all = OFFLINE._list || [];

  // 计数
  const cTodo = all.filter(m => m.status === 'pending' || m.status === 'in_progress').length;
  const cShipped = all.filter(m => m.status === 'resolved' || m.status === 'shipped').length;

  let list = all;
  if (OFFLINE._filter === 'todo') list = all.filter(m => m.status === 'pending' || m.status === 'in_progress');
  else if (OFFLINE._filter === 'shipped') list = all.filter(m => m.status === 'resolved' || m.status === 'shipped');
  else if (OFFLINE._filter === 'mine') list = all.filter(m => m.to_user_id === myId || !m.to_user_id);

  const chip = (k, label, n) => `
    <button onclick="offlineSetFilter('${k}')" style="padding:6px 12px; font-size:12px; border:1px solid ${OFFLINE._filter === k ? 'var(--accent)' : 'var(--border)'}; border-radius:18px; background:${OFFLINE._filter === k ? 'var(--accent)' : 'var(--bg-card)'}; color:${OFFLINE._filter === k ? 'white' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${OFFLINE._filter === k ? '600' : '400'};">
      ${label}${typeof n === 'number' ? ` <span style="opacity:0.75; font-size:10.5px;">${n}</span>` : ''}
    </button>`;

  const header = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
      <h2 style="margin:0; font-size:17px; display:flex; align-items:center; gap:8px;">
        🧾 线下单
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">客服转来的已付款订单 · 发货后系统自动回写客服(用于提成统计)</span>
      </h2>
      <button class="btn small" style="margin-left:auto;" onclick="loadOfflineOrders().then(renderOfflineOrders)">🔄 刷新</button>
    </div>
    <div style="display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap;">
      ${chip('todo', '⏳ 待处理', cTodo)}
      ${chip('shipped', '✅ 已出货', cShipped)}
      ${chip('mine', '👤 指派给我')}
      ${chip('all', '🌐 全部', all.length)}
    </div>`;

  if (list.length === 0) {
    body.innerHTML = header + `<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:34px;">🧾</div><div>${OFFLINE._filter === 'todo' ? '没有待处理的线下单' : '没有匹配的线下单'}</div></div>`;
    return;
  }

  body.innerHTML = header + `<div style="display:flex; flex-direction:column; gap:10px;">${list.map(_offlineCard).join('')}</div>`;
}

function _offlineCard(m) {
  const shipped = (m.status === 'resolved' || m.status === 'shipped');
  const atts = Array.isArray(m.attachments) ? m.attachments : [];
  const orderNo = m.related_ref || '(无订单号)';
  const assignee = m.to_user_name ? `指派:${escapeHtml(m.to_user_name)}` : '全员可领';
  const pri = m.priority === 'urgent' ? '<span style="background:var(--danger); color:white; padding:1px 7px; border-radius:8px; font-size:10.5px; font-weight:600;">🚨 加急</span>' : '';

  // 付款凭证缩略图(全走 _offAttUrl · base64 拒渲并标红)
  const vouchers = atts.map(a => {
    const u = _offAttUrl(a);
    if (u === '__BASE64__') return `<div style="width:56px; height:56px; background:rgba(220,38,38,0.1); border:1px dashed var(--danger); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:9px; color:var(--danger); text-align:center; padding:2px;" title="附件是 base64 内嵌 · 应改存 Storage URL · 已拒绝渲染">⚠ base64</div>`;
    if (!u) return '';
    return `<img src="${escapeHtml(u)}" loading="lazy" onerror="this.style.display='none'" onclick="openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="width:56px; height:56px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;">`;
  }).join('');

  return `
  <div style="border:1px solid ${shipped ? 'var(--border)' : 'var(--accent)'}; border-radius:10px; padding:14px; background:var(--bg-card); ${shipped ? 'opacity:0.75;' : ''}">
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
      <span style="font-weight:700; font-size:15px;">${escapeHtml(orderNo)}</span>
      ${m.related_shop ? `<span style="font-size:11px; color:var(--text-secondary); background:var(--bg-elevated); padding:1px 8px; border-radius:8px;">${escapeHtml(m.related_shop)}</span>` : ''}
      ${pri}
      ${shipped
        ? '<span style="margin-left:auto; background:rgba(22,163,74,0.12); color:#15803d; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:600;">✅ 已出货 · 已回写客服</span>'
        : `<button class="btn primary small" style="margin-left:auto;" onclick="offlineMarkShipped('${m.id}', '${escapeHtml(orderNo)}')">📦 标记发货</button>`}
    </div>
    <div style="font-size:11.5px; color:var(--text-tertiary); margin-bottom:8px;">来自客服 ${escapeHtml(m.from_user_name || '')} · ${assignee} · ${m.created_at_ms ? new Date(m.created_at_ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</div>
    ${vouchers ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">${vouchers}</div>` : ''}
    <pre style="white-space:pre-wrap; word-break:break-word; font-family:inherit; font-size:12.5px; color:var(--text-primary); margin:0; background:var(--bg-elevated); padding:10px; border-radius:6px; line-height:1.6; max-height:240px; overflow:auto;">${escapeHtml(m.body || '(无内容)')}</pre>
  </div>`;
}

function offlineSetFilter(f) {
  OFFLINE._filter = f;
  renderOfflineOrders();
}
window.offlineSetFilter = offlineSetFilter;

// ── 标记发货 → 写 po_shipped 回执到 cross_dept_messages(cs 订阅后写 CLOUD.offline_orders)──
async function offlineMarkShipped(msgId, orderNo) {
  if (!orderNo || orderNo === '(无订单号)') { alert('该工单没有订单号 · 无法回写客服 · 请联系客服补订单号'); return; }
  if (!confirm(`确认订单 ${orderNo} 已发货?\n\n系统会自动通知客服(用于提成统计)· 你不需要再去客服系统操作。`)) return;
  if (typeof cdmClient === 'undefined') { alert('消息总线未连接'); return; }
  const nowIso = new Date().toISOString();
  const me = (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : '') || '跟单';
  try {
    // 1) 写出货回执(cs 按 related_type='po_shipped' + related_ref=订单号 消费)
    const { error: e1 } = await cdmClient.from('cross_dept_messages').insert({
      from_system: 'po',
      from_user_id: (typeof CURRENT_USER_ID !== 'undefined') ? CURRENT_USER_ID : null,
      from_user_name: me,
      to_system: 'cs',
      related_type: 'po_shipped',
      related_ref: orderNo,                              // ← cs 用它定位 offline_orders.order_no
      title: `[出货回执] ${orderNo}`,
      body: `dispatched_at=${nowIso}`,                   // body 里的 dispatched_at 优先
      updated_at: nowIso,
      status: 'pending',
      created_at_ms: Date.now(),
    });
    if (e1) throw e1;

    // 2) 把原转单工单标记完成(本系统侧 · 不碰 CLOUD)
    const { error: e2 } = await cdmClient.from('cross_dept_messages')
      .update({ status: 'resolved', updated_at: nowIso })
      .eq('id', msgId);
    if (e2) throw e2;

    // 3) 本地更新 + 重渲
    const m = OFFLINE._list.find(x => x.id === msgId);
    if (m) m.status = 'resolved';
    if (typeof toast === 'function') toast(`📦 ${orderNo} 已标记发货 · 已通知客服`, 'ok', 2500);
    renderOfflineOrders();
    if (typeof updateBadges === 'function') updateBadges();
  } catch (e) {
    if (typeof toast === 'function') toast('回写失败:' + (e.message || e), 'err', 4000);
    else alert('回写失败:' + (e.message || e));
  }
}
window.offlineMarkShipped = offlineMarkShipped;

// ── 加载时自检:org_directory 里跟单同事是否齐(只读 · 缺谁列出来)──
async function offlineCheckOrgDirectory() {
  if (typeof cdmClient === 'undefined') return;
  try {
    const { data, error } = await cdmClient
      .from('org_directory')
      .select('id, display_name, name, system, active')
      .eq('system', 'po');
    if (error) throw error;
    const active = (data || []).filter(r => r.active !== false);
    console.log(`[offline] org_directory 跟单部(system='po')共 ${active.length} 人:`, active.map(r => r.display_name || r.name).join(' / '));
    if (active.length === 0) {
      console.warn('[offline] ⚠ org_directory 里没有跟单人员 → 客服转单下拉选不到跟单同事!请在跟单工作台触发一次人员发布(publishMyStaff)');
    }
    return active;
  } catch (e) {
    console.warn('[offline] org_directory 自检失败:', e.message);
  }
}
window.offlineCheckOrgDirectory = offlineCheckOrgDirectory;

// 未读线下单数(待处理)→ 角标
function offlineTodoCount() {
  return (OFFLINE._list || []).filter(m => m.status === 'pending' || m.status === 'in_progress').length;
}
window.offlineTodoCount = offlineTodoCount;
