// ============================================================================
// V20260613b:线下单跟进模块(客服 cs → 跟单 po · 看板视图 · 全员协作推进)
//   收件箱来源:cross_dept_messages(xyhbw · cdmClient)to_system='po' AND related_type='offline_transfer'
//   跟进状态:offline_followups(pyfmu · sb · order_no 为 key)— 跟单内部流转,任何同事可推进
//   出货回执:进"已发货"自动往 cross_dept_messages 写 po_shipped(cs 订阅后写 CLOUD.offline_orders)
//   po-system 不直连 CLOUD · 只用 pyfmu(sb) + xyhbw(cdmClient)· 需跑 offline_followups.sql
// ============================================================================

const OFF_STAGES = [
  { k: 'pending',   label: '待接单', color: 'var(--text-secondary)', bg: 'rgba(136,135,128,0.08)' },
  { k: 'claimed',   label: '已接单', color: '#185fa5',               bg: 'rgba(37,99,235,0.08)' },
  { k: 'ordered',   label: '已下单', color: '#185fa5',               bg: 'rgba(37,99,235,0.08)' },
  { k: 'producing', label: '生产中', color: '#854f0b',               bg: 'rgba(239,159,39,0.1)' },
  { k: 'shipped',   label: '已发货', color: '#0f6e56',               bg: 'rgba(29,158,117,0.1)' },
  { k: 'received',  label: '已签收', color: '#3b6d11',               bg: 'rgba(99,153,34,0.1)' },
];
const OFF_STAGE_MAP = Object.fromEntries(OFF_STAGES.map(s => [s.k, s]));
const OFF_NEXT = { pending: 'claimed', claimed: 'ordered', ordered: 'producing', producing: 'shipped', shipped: 'received' };

const OFFLINE = { _msgs: [], _followups: {}, _view: 'board', _loadedAt: 0 };
window.OFFLINE = OFFLINE;

function _offIsBase64(v) {
  const s = String(v || '');
  return s.startsWith('data:') || (s.length > 500 && !/^https?:\/\//.test(s));
}
function _offAttUrl(a) {
  let u = '';
  if (typeof cdmAttUrl === 'function') u = cdmAttUrl(a);
  else u = (a && (a.url || a.publicUrl)) || '';
  if (_offIsBase64(u) || _offIsBase64(a && a.dataUrl)) return '__BASE64__';
  return u;
}
function _offGetFu(orderNo) { return OFFLINE._followups[orderNo] || { stage: 'pending' }; }
function _offStageOf(m) {
  const fu = _offGetFu(m.related_ref);
  if (fu.cancelled) return 'cancelled';
  return fu.stage || 'pending';
}

async function loadOfflineOrders() {
  if (typeof cdmClient === 'undefined') return;
  try {
    const { data: msgs, error: e1 } = await cdmClient
      .from('cross_dept_messages')
      .select('id,from_system,from_user_name,to_system,to_user_id,to_user_name,related_ref,related_shop,priority,title,body,attachments,related_type,status,created_at_ms,updated_at')
      .eq('to_system', 'po').eq('related_type', 'offline_transfer')
      .order('created_at_ms', { ascending: false }).limit(300);
    if (e1) throw e1;
    OFFLINE._msgs = (msgs || []).filter(m => m.status !== 'deleted');

    const orderNos = OFFLINE._msgs.map(m => m.related_ref).filter(Boolean);
    OFFLINE._followups = {};
    if (orderNos.length > 0 && typeof sb !== 'undefined') {
      const { data: fus, error: e2 } = await sb.from('offline_followups').select('*').in('order_no', orderNos);
      if (e2) { if (!/offline_followups/.test(e2.message || '')) throw e2; }
      (fus || []).forEach(f => { OFFLINE._followups[f.order_no] = f; });
    }
    OFFLINE._loadedAt = Date.now();
  } catch (e) { console.warn('[offline] 加载线下单失败:', e.message); }
}

function renderOfflineOrders() {
  const body = document.getElementById('offlineBody');
  if (!body) return;
  const msgs = OFFLINE._msgs || [];
  const header = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
      <h2 style="margin:0; font-size:17px; display:flex; align-items:center; gap:8px;">
        🧾 线下单
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">客服转来的已付款订单 · 全员协作推进 · 发货后自动回写客服(提成统计)</span>
      </h2>
      <div style="margin-left:auto; display:inline-flex; gap:0; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
        <button onclick="offlineSetView('board')" style="padding:5px 12px; font-size:11.5px; border:0; cursor:pointer; background:${OFFLINE._view === 'board' ? 'var(--accent)' : 'var(--bg-card)'}; color:${OFFLINE._view === 'board' ? 'white' : 'var(--text-secondary)'}; font-weight:${OFFLINE._view === 'board' ? '600' : '400'};">▦ 看板</button>
        <button onclick="offlineSetView('list')" style="padding:5px 12px; font-size:11.5px; border:0; border-left:1px solid var(--border); cursor:pointer; background:${OFFLINE._view === 'list' ? 'var(--accent)' : 'var(--bg-card)'}; color:${OFFLINE._view === 'list' ? 'white' : 'var(--text-secondary)'}; font-weight:${OFFLINE._view === 'list' ? '600' : '400'};">☰ 列表</button>
      </div>
      <button class="btn small" onclick="loadOfflineOrders().then(renderOfflineOrders)">🔄 刷新</button>
    </div>`;
  if (msgs.length === 0) {
    body.innerHTML = header + `<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:34px;">🧾</div><div>还没有线下单(客服转单后出现在这里)</div></div>`;
    return;
  }
  body.innerHTML = header + (OFFLINE._view === 'board' ? _offRenderBoard(msgs) : _offRenderList(msgs));
}

function _offRenderBoard(msgs) {
  const byStage = {};
  OFF_STAGES.forEach(s => byStage[s.k] = []);
  const cancelled = [];
  msgs.forEach(m => {
    const st = _offStageOf(m);
    if (st === 'cancelled') cancelled.push(m);
    else (byStage[st] = byStage[st] || []).push(m);
  });
  const cols = OFF_STAGES.map(s => `
    <div style="flex:1; min-width:175px; background:${s.bg}; border-radius:10px; padding:8px;">
      <div style="font-size:12px; font-weight:700; color:${s.color}; padding:4px 6px 8px; display:flex; justify-content:space-between; align-items:center;">
        <span>${s.label}</span><span style="opacity:0.7;">${byStage[s.k].length}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; min-height:40px;">
        ${byStage[s.k].map(m => _offBoardCard(m, s.k)).join('') || `<div style="font-size:11px; color:var(--text-tertiary); text-align:center; padding:8px;">—</div>`}
      </div>
    </div>`).join('');
  let html = `<div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; align-items:flex-start;">${cols}</div>`;
  if (cancelled.length) {
    html += `<details style="margin-top:12px;"><summary style="cursor:pointer; font-size:12px; color:var(--text-secondary);">🗑️ 已取消 (${cancelled.length})</summary><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">${cancelled.map(m => _offBoardCard(m, 'cancelled')).join('')}</div></details>`;
  }
  return html;
}

function _offBoardCard(m, stage) {
  const fu = _offGetFu(m.related_ref);
  const orderNo = m.related_ref || '(无单号)';
  const pri = m.priority === 'urgent' ? '<span style="background:var(--danger); color:white; padding:0 5px; border-radius:6px; font-size:9.5px; font-weight:600;">急</span>' : '';
  const thumb = (Array.isArray(m.attachments) ? m.attachments : []).map(a => {
    const u = _offAttUrl(a);
    if (u === '__BASE64__') return `<span style="font-size:9px; color:var(--danger);" title="附件是 base64 · 应改 Storage URL">⚠</span>`;
    if (!u) return '';
    return `<img src="${escapeHtml(u)}" loading="lazy" onerror="this.style.display='none'" onclick="event.stopPropagation(); openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="width:28px; height:28px; object-fit:cover; border-radius:4px; cursor:zoom-in;">`;
  }).slice(0, 3).join('');
  const next = (stage !== 'cancelled') ? OFF_NEXT[stage] : null;
  const nextLabel = next ? OFF_STAGE_MAP[next].label : null;
  const claimer = fu.claimed_by_name ? `👤 ${escapeHtml(fu.claimed_by_name)}` : '';
  let actions = '';
  if (stage === 'pending') {
    actions = `<button class="btn primary small" style="font-size:10.5px; padding:2px 8px; width:100%;" onclick="offlineClaim('${m.id}','${escapeHtml(orderNo)}')">✋ 接单</button>`;
  } else if (next) {
    actions = `<button class="btn small" style="font-size:10.5px; padding:2px 8px; width:100%;" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}')">→ 推进到「${nextLabel}」</button>`;
  } else if (stage === 'received') {
    actions = `<span style="font-size:10.5px; color:var(--ok);">✅ 已完成</span>`;
  }
  return `
  <div onclick="offlineOpenDetail('${m.id}')" style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:8px; cursor:pointer; ${stage === 'cancelled' ? 'opacity:0.55; min-width:160px;' : ''}">
    <div style="display:flex; align-items:center; gap:5px; margin-bottom:4px;">
      <span style="font-weight:700; font-size:12.5px;">${escapeHtml(orderNo)}</span>${pri}
      ${m.related_shop ? `<span style="font-size:9.5px; color:var(--text-tertiary); margin-left:auto;">${escapeHtml(m.related_shop)}</span>` : ''}
    </div>
    ${claimer ? `<div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">${claimer}</div>` : ''}
    ${thumb ? `<div style="display:flex; gap:3px; margin-bottom:6px;">${thumb}</div>` : ''}
    ${stage !== 'cancelled' ? `<div onclick="event.stopPropagation();">${actions}</div>` : ''}
  </div>`;
}

function _offRenderList(msgs) {
  const rows = msgs.map(m => {
    const st = _offStageOf(m);
    const meta = (st === 'cancelled') ? { label: '已取消', color: 'var(--danger)', bg: 'rgba(220,38,38,0.1)' } : OFF_STAGE_MAP[st];
    const fu = _offGetFu(m.related_ref);
    const next = (st !== 'cancelled' && st !== 'received') ? OFF_NEXT[st] : null;
    return `
    <div onclick="offlineOpenDetail('${m.id}')" style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; cursor:pointer; ${st === 'cancelled' ? 'opacity:0.55;' : ''}">
      <span style="background:${meta.bg || 'var(--bg-elevated)'}; color:${meta.color}; padding:2px 9px; border-radius:8px; font-size:11px; font-weight:600; white-space:nowrap;">${meta.label}</span>
      <span style="font-weight:700;">${escapeHtml(m.related_ref || '(无单号)')}</span>
      ${m.related_shop ? `<span style="font-size:11px; color:var(--text-secondary);">${escapeHtml(m.related_shop)}</span>` : ''}
      ${fu.claimed_by_name ? `<span style="font-size:11px; color:var(--text-secondary);">👤 ${escapeHtml(fu.claimed_by_name)}</span>` : ''}
      ${m.priority === 'urgent' ? '<span style="background:var(--danger); color:white; padding:0 6px; border-radius:6px; font-size:10px;">急</span>' : ''}
      ${next ? `<button class="btn small" style="margin-left:auto; font-size:10.5px; padding:2px 8px;" onclick="event.stopPropagation(); offlineAdvance('${m.id}','${escapeHtml(m.related_ref || '')}','${next}')">→ ${OFF_STAGE_MAP[next].label}</button>` : '<span style="margin-left:auto;"></span>'}
    </div>`;
  }).join('');
  return `<div style="display:flex; flex-direction:column; gap:8px;">${rows}</div>`;
}

function offlineOpenDetail(msgId) {
  const m = OFFLINE._msgs.find(x => x.id === msgId);
  if (!m) return;
  const vouchers = (Array.isArray(m.attachments) ? m.attachments : []).map(a => {
    const u = _offAttUrl(a);
    if (u === '__BASE64__') return `<div style="padding:8px; color:var(--danger); font-size:12px;">⚠ 附件是 base64 内嵌 · 应改存 Storage URL</div>`;
    if (!u) return '';
    return `<img src="${escapeHtml(u)}" loading="lazy" onclick="openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="max-width:120px; max-height:120px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;">`;
  }).join('');
  const html = `
    <div style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;" onclick="if(event.target===this) this.remove();">
      <div style="background:var(--bg-card); border-radius:12px; max-width:640px; width:100%; max-height:85vh; overflow:auto; padding:20px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <span style="font-size:17px; font-weight:700;">🧾 ${escapeHtml(m.related_ref || '(无单号)')}</span>
          ${m.related_shop ? `<span style="font-size:12px; color:var(--text-secondary); background:var(--bg-elevated); padding:1px 8px; border-radius:8px;">${escapeHtml(m.related_shop)}</span>` : ''}
          <button class="btn small" style="margin-left:auto;" onclick="this.closest('[style*=fixed]').remove()">✕</button>
        </div>
        <div style="font-size:11.5px; color:var(--text-tertiary); margin-bottom:10px;">来自客服 ${escapeHtml(m.from_user_name || '')} · ${m.created_at_ms ? new Date(m.created_at_ms).toLocaleString('zh-CN') : ''}</div>
        ${vouchers ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">${vouchers}</div>` : ''}
        <pre style="white-space:pre-wrap; word-break:break-word; font-family:inherit; font-size:13px; line-height:1.7; background:var(--bg-elevated); padding:12px; border-radius:8px; margin:0 0 12px;">${escapeHtml(m.body || '(无内容)')}</pre>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn small" style="color:var(--danger);" onclick="offlineCancel('${m.id}','${escapeHtml(m.related_ref || '')}'); this.closest('[style*=fixed]').remove();">🗑️ 取消此单</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
window.offlineOpenDetail = offlineOpenDetail;

function offlineSetView(v) { OFFLINE._view = v; renderOfflineOrders(); }
window.offlineSetView = offlineSetView;

async function _offWriteFu(orderNo, patch) {
  if (typeof sb === 'undefined') throw new Error('数据库未连接');
  const cur = OFFLINE._followups[orderNo] || { order_no: orderNo };
  const row = { ...cur, ...patch, order_no: orderNo, updated_at: new Date().toISOString() };
  const { error } = await sb.from('offline_followups').upsert(row, { onConflict: 'order_no' });
  if (error) {
    if (/offline_followups/.test(error.message || '')) throw new Error('请先在跟单主库跑 offline_followups.sql');
    throw error;
  }
  OFFLINE._followups[orderNo] = row;
}

async function offlineClaim(msgId, orderNo) {
  if (!orderNo || orderNo === '(无单号)') { alert('该单没有订单号'); return; }
  try {
    const nowIso = new Date().toISOString();
    await _offWriteFu(orderNo, {
      stage: 'claimed',
      claimed_by_id: (typeof CURRENT_USER_ID !== 'undefined') ? CURRENT_USER_ID : null,
      claimed_by_name: (typeof CURRENT_AGENT !== 'undefined') ? CURRENT_AGENT : '',
      stage_at: nowIso, claimed_at: nowIso,
    });
    if (typeof toast === 'function') toast(`✋ 已接单 ${orderNo}`, 'ok', 2000);
    renderOfflineOrders();
  } catch (e) { _offErr(e); }
}
window.offlineClaim = offlineClaim;

async function offlineAdvance(msgId, orderNo, toStage) {
  if (!orderNo) { alert('该单没有订单号 · 无法推进'); return; }
  const label = OFF_STAGE_MAP[toStage] ? OFF_STAGE_MAP[toStage].label : toStage;
  if (toStage === 'shipped' && !confirm(`确认 ${orderNo} 已发货?\n会自动通知客服(用于提成统计)· 你不用再去客服系统操作。`)) return;
  try {
    const nowIso = new Date().toISOString();
    const patch = { stage: toStage, stage_at: nowIso };
    patch[toStage + '_at'] = nowIso;
    await _offWriteFu(orderNo, patch);
    if (toStage === 'shipped' && typeof cdmClient !== 'undefined') {
      const me = (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : '') || '跟单';
      const { error } = await cdmClient.from('cross_dept_messages').insert({
        from_system: 'po',
        from_user_id: (typeof CURRENT_USER_ID !== 'undefined') ? CURRENT_USER_ID : null,
        from_user_name: me, to_system: 'cs', related_type: 'po_shipped', related_ref: orderNo,
        title: `[出货回执] ${orderNo}`, body: `dispatched_at=${nowIso}`,
        updated_at: nowIso, status: 'pending', created_at_ms: Date.now(),
      });
      if (error) console.warn('[offline] 出货回执写入失败(状态已更新 · 可重发):', error.message);
      cdmClient.from('cross_dept_messages').update({ status: 'resolved', updated_at: nowIso }).eq('id', msgId).then(() => {});
    }
    if (typeof toast === 'function') toast(`→ ${orderNo} 已推进到「${label}」${toStage === 'shipped' ? ' · 已通知客服' : ''}`, 'ok', 2500);
    renderOfflineOrders();
    if (typeof updateBadges === 'function') updateBadges();
  } catch (e) { _offErr(e); }
}
window.offlineAdvance = offlineAdvance;

async function offlineCancel(msgId, orderNo) {
  if (!orderNo) return;
  if (!confirm(`确认取消线下单 ${orderNo}?`)) return;
  try {
    await _offWriteFu(orderNo, { cancelled: true, stage_at: new Date().toISOString() });
    if (typeof toast === 'function') toast(`🗑️ 已取消 ${orderNo}`, 'ok', 2000);
    renderOfflineOrders();
    if (typeof updateBadges === 'function') updateBadges();
  } catch (e) { _offErr(e); }
}
window.offlineCancel = offlineCancel;

function _offErr(e) {
  const msg = '操作失败:' + (e.message || e);
  if (typeof toast === 'function') toast(msg, 'err', 4000); else alert(msg);
}

function offlineTodoCount() {
  return (OFFLINE._msgs || []).filter(m => {
    const st = _offStageOf(m);
    return st !== 'shipped' && st !== 'received' && st !== 'cancelled';
  }).length;
}
window.offlineTodoCount = offlineTodoCount;

async function offlineCheckOrgDirectory() {
  if (typeof cdmClient === 'undefined') return;
  try {
    const { data, error } = await cdmClient.from('org_directory').select('id, display_name, name, system, active').eq('system', 'po');
    if (error) throw error;
    const active = (data || []).filter(r => r.active !== false);
    console.log(`[offline] org_directory 跟单部(system='po')共 ${active.length} 人:`, active.map(r => r.display_name || r.name).join(' / '));
    if (active.length === 0) console.warn('[offline] ⚠ org_directory 无跟单人员 → 客服转单下拉选不到 · 请在跟单工作台触发人员发布');
    return active;
  } catch (e) { console.warn('[offline] org_directory 自检失败:', e.message); }
}
window.offlineCheckOrgDirectory = offlineCheckOrgDirectory;
