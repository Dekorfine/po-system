// ============================================================================
// V20260613b:线下单跟进模块(客服 cs → 跟单 po · 看板视图 · 全员协作推进)
//   收件箱来源:cross_dept_messages(xyhbw · cdmClient)to_system='po' AND related_type='offline_transfer'
//   跟进状态:offline_followups(pyfmu · sb · order_no 为 key)— 跟单内部流转,任何同事可推进
//   出货回执:进"已发货"自动往 cross_dept_messages 写 po_shipped(cs 订阅后写 CLOUD.offline_orders)
//   po-system 不直连 CLOUD · 只用 pyfmu(sb) + xyhbw(cdmClient)· 需跑 offline_followups.sql
// ============================================================================

const OFF_STAGES = [
  { k: 'ordered',   label: '待下单', color: 'var(--text-secondary)', bg: 'rgba(136,135,128,0.08)' },
  { k: 'producing', label: '生产中', color: '#854f0b',               bg: 'rgba(239,159,39,0.1)' },
  { k: 'shipped',   label: '已发货', color: '#0f6e56',               bg: 'rgba(29,158,117,0.1)' },
  { k: 'received',  label: '已签收', color: '#3b6d11',               bg: 'rgba(99,153,34,0.1)' },
];
const OFF_STAGE_MAP = Object.fromEntries(OFF_STAGES.map(s => [s.k, s]));
const OFF_NEXT = { ordered: 'producing', producing: 'shipped', shipped: 'received' };
const OFF_PREV = { producing: 'ordered', shipped: 'producing', received: 'shipped' };   // V20260617:返回上一步
// V20260617:旧数据兼容 — pending/claimed 一律视为 ordered(待下单)· 接单环节归客服,跟单拿到直接下单
const OFF_STAGE_NORMALIZE = { pending: 'ordered', claimed: 'ordered' };

const OFFLINE = { _msgs: [], _followups: {}, _view: (typeof localStorage !== 'undefined' && localStorage.getItem('offline_view')) || 'board', _loadedAt: 0 };
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
function _offGetFu(orderNo) { return OFFLINE._followups[orderNo] || { stage: 'ordered' }; }
function _offStageOf(m) {
  const fu = _offGetFu(m.related_ref);
  if (fu.cancelled) return 'cancelled';
  let st = fu.stage || 'ordered';
  if (OFF_STAGE_NORMALIZE[st]) st = OFF_STAGE_NORMALIZE[st];   // V20260617:旧 pending/claimed → ordered
  return st;
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
  const vbtn = (k, label) => `<button onclick="offlineSetView('${k}')" style="padding:5px 11px; font-size:11.5px; border:0; ${k !== 'board' ? 'border-left:1px solid var(--border);' : ''} cursor:pointer; background:${OFFLINE._view === k ? 'var(--accent)' : 'var(--bg-card)'}; color:${OFFLINE._view === k ? 'white' : 'var(--text-secondary)'}; font-weight:${OFFLINE._view === k ? '600' : '400'};">${label}</button>`;
  const header = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
      <h2 style="margin:0; font-size:17px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        🧾 线下单
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">客服转来的已付款订单 · 全员协作推进 · 发货后自动回写客服(提成统计)</span>
      </h2>
      <div style="margin-left:auto; display:inline-flex; gap:0; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
        ${vbtn('board', '▦ 看板')}${vbtn('grid', '⊞ 网格')}${vbtn('list', '☰ 列表')}
      </div>
      <button class="btn small" onclick="loadOfflineOrders().then(renderOfflineOrders)">🔄 刷新</button>
    </div>`;
  if (msgs.length === 0) {
    body.innerHTML = header + `<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:34px;">🧾</div><div>还没有线下单(客服转单后出现在这里)</div></div>`;
    return;
  }
  const view = OFFLINE._view === 'grid' ? _offRenderGrid(msgs)
             : OFFLINE._view === 'list' ? _offRenderList(msgs)
             : _offRenderBoard(msgs);
  body.innerHTML = header + view;
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
    <div style="background:${s.bg}; border-radius:10px; padding:10px; display:flex; flex-direction:column;">
      <div style="font-size:12.5px; font-weight:700; color:${s.color}; padding:2px 4px 10px; display:flex; justify-content:space-between; align-items:center;">
        <span>${s.label}</span><span style="background:var(--bg-card); padding:0 8px; border-radius:10px; opacity:0.9;">${byStage[s.k].length}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; min-height:40px;">
        ${byStage[s.k].map(m => _offBoardCard(m, s.k)).join('') || `<div style="font-size:11px; color:var(--text-tertiary); text-align:center; padding:14px 8px;">空</div>`}
      </div>
    </div>`).join('');
  let html = `<div class="offline-board">${cols}</div>`;
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
    return `<img src="${escapeHtml(u)}" loading="lazy" onerror="this.style.display='none'" onclick="event.stopPropagation(); openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="width:40px; height:40px; object-fit:cover; border-radius:5px; cursor:zoom-in;">`;
  }).slice(0, 4).join('');
  const next = (stage !== 'cancelled') ? OFF_NEXT[stage] : null;
  const nextLabel = next ? OFF_STAGE_MAP[next].label : null;
  const claimer = fu.claimed_by_name ? `👤 ${escapeHtml(fu.claimed_by_name)}` : '';
  let actions = '';
  if (next) {
    actions = `<button class="btn small" style="font-size:10.5px; padding:2px 8px; width:100%;" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}')">→ 推进到「${nextLabel}」</button>`;
  } else if (stage === 'received') {
    actions = `<span style="font-size:10.5px; color:var(--ok);">✅ 已完成</span>`;
  }
  return `
  <div onclick="offlineOpenDetail('${m.id}')" style="background:var(--bg-card); border:1px solid var(--border); border-radius:9px; padding:10px; cursor:pointer; ${stage === 'cancelled' ? 'opacity:0.55; min-width:170px;' : ''}">
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
      <span style="font-weight:700; font-size:13.5px;">${escapeHtml(orderNo)}</span>${pri}
      ${m.related_shop ? `<span style="font-size:10px; color:var(--text-tertiary); margin-left:auto; white-space:nowrap;">${escapeHtml(m.related_shop)}</span>` : ''}
    </div>
    ${claimer ? `<div style="font-size:10.5px; color:var(--text-secondary); margin-bottom:6px;">${claimer}</div>` : ''}
    ${fu.remark ? `<div style="font-size:10px; color:var(--text-secondary); margin-bottom:6px; padding:4px 6px; background:var(--bg-elevated); border-radius:5px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${escapeHtml(fu.remark)}">📝 ${escapeHtml(fu.remark)}</div>` : ''}
    ${thumb ? `<div style="display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap;">${thumb}</div>` : ''}
    ${stage !== 'cancelled' ? `<div onclick="event.stopPropagation();">${actions}</div>` : ''}
  </div>`;
}

// ── 网格视图(大图卡片 · 自适应列 · 看大图为主)──
function _offRenderGrid(msgs) {
  const cards = msgs.map(m => {
    const st = _offStageOf(m);
    const meta = (st === 'cancelled') ? { label: '已取消', color: 'var(--danger)', bg: 'rgba(220,38,38,0.1)' } : OFF_STAGE_MAP[st];
    const fu = _offGetFu(m.related_ref);
    const orderNo = m.related_ref || '(无单号)';
    const next = (st !== 'cancelled' && st !== 'received') ? OFF_NEXT[st] : null;
    const atts = (Array.isArray(m.attachments) ? m.attachments : []);
    const firstUrl = (() => { for (const a of atts) { const u = _offAttUrl(a); if (u && u !== '__BASE64__') return u; } return ''; })();
    const firstIsPdf = firstUrl && /\.pdf(\?|$)/i.test(firstUrl);
    const hasB64 = atts.some(a => _offAttUrl(a) === '__BASE64__');
    const cover = (firstUrl && !firstIsPdf)
      ? `<div style="height:150px; background:var(--bg-elevated); border-radius:8px 8px 0 0; overflow:hidden; display:flex; align-items:center; justify-content:center;"><img src="${escapeHtml(firstUrl)}" loading="lazy" onerror="this.parentElement.innerHTML='<span style=&quot;color:var(--text-tertiary);font-size:28px;&quot;>🧾</span>'" onclick="event.stopPropagation(); openImgLightbox && openImgLightbox('${escapeHtml(firstUrl)}')" style="width:100%; height:100%; object-fit:cover; cursor:zoom-in;"></div>`
      : firstIsPdf
        ? `<div style="height:150px; background:var(--bg-elevated); border-radius:8px 8px 0 0; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-tertiary); gap:4px;"><span style="font-size:34px;">📄</span><span style="font-size:11px;">PDF 凭证 · 点卡片查看</span></div>`
      : `<div style="height:150px; background:var(--bg-elevated); border-radius:8px 8px 0 0; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:30px;">${hasB64 ? '<span style=\"font-size:12px; color:var(--danger);\">⚠ 凭证为base64</span>' : '🧾'}</div>`;
    return `
    <div class="as-card" onclick="offlineOpenDetail('${m.id}')" style="cursor:pointer; ${st === 'cancelled' ? 'opacity:0.55;' : ''} padding:0; overflow:hidden;">
      ${cover}
      <div style="padding:10px 12px;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
          <span style="background:${meta.bg || 'var(--bg-elevated)'}; color:${meta.color}; padding:1px 8px; border-radius:8px; font-size:10.5px; font-weight:600;">${meta.label}</span>
          ${m.priority === 'urgent' ? '<span style="background:var(--danger); color:white; padding:0 6px; border-radius:6px; font-size:10px;">急</span>' : ''}
        </div>
        <div style="font-weight:700; font-size:14px; margin-bottom:3px;">${escapeHtml(orderNo)}</div>
        <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:8px;">${m.related_shop ? escapeHtml(m.related_shop) : ''}${fu.claimed_by_name ? ` · 👤 ${escapeHtml(fu.claimed_by_name)}` : ''}</div>
        ${st === 'cancelled' ? '' : (next
          ? `<button class="btn small" style="width:100%; font-size:11px;" onclick="event.stopPropagation(); offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}')">→ 推进到「${OFF_STAGE_MAP[next].label}」</button>`
          : `<div style="text-align:center; font-size:11px; color:var(--ok);">✅ 已完成</div>`)}
      </div>
    </div>`;
  }).join('');
  return `<div class="as-grid">${cards}</div>`;
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
  const orderNo = m.related_ref || '';
  const fu = _offGetFu(orderNo);
  const stage = _offStageOf(m);
  const stageMeta = stage === 'cancelled' ? { label:'已取消', color:'var(--danger)', bg:'rgba(220,38,38,0.1)' } : OFF_STAGE_MAP[stage];
  const next = OFF_NEXT[stage];
  const prev = OFF_PREV[stage];
  const vouchers = (Array.isArray(m.attachments) ? m.attachments : []).map(a => {
    const u = _offAttUrl(a);
    if (u === '__BASE64__') return `<div style="padding:8px; color:var(--danger); font-size:12px;">⚠ 附件是 base64 内嵌 · 应改存 Storage URL</div>`;
    if (!u) return '';
    // V20260617:区分 PDF/图片 — PDF 用文件卡片+新标签打开(浏览器原生预览),不塞进图片灯箱(否则显示异常/被弹窗盖住)
    const isPdf = /\.pdf(\?|$)/i.test(u) || /pdf/i.test((a && a.type) || '') || /pdf/i.test((a && a.name) || '');
    if (isPdf) {
      const fname = (a && a.name) || 'PDF 文档';
      return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:8px; padding:10px 14px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:8px; text-decoration:none; color:var(--text-primary); font-size:12.5px;" title="点击在新标签页打开 PDF">
        <span style="font-size:22px;">📄</span>
        <span style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fname)}</span>
        <span style="color:var(--accent); font-size:11px; margin-left:4px;">↗ 打开</span>
      </a>`;
    }
    return `<img src="${escapeHtml(u)}" loading="lazy" onclick="openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="max-width:120px; max-height:120px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;">`;
  }).join('');

  // 跟单操作区:当前阶段 + 推进/返回 + 备注
  const opsArea = stage === 'cancelled' ? `
    <div style="padding:12px; background:rgba(220,38,38,0.06); border-radius:8px; text-align:center; color:var(--danger); font-size:13px;">此单已取消</div>
  ` : `
    <div style="background:var(--bg-elevated); border-radius:10px; padding:14px; margin-bottom:12px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <span style="font-size:12px; color:var(--text-secondary);">当前阶段:</span>
        <span style="background:${stageMeta.bg}; color:${stageMeta.color}; padding:3px 12px; border-radius:10px; font-size:12.5px; font-weight:700;">${stageMeta.label}</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${prev ? `<button class="btn small" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${prev}'); offlineOpenDetail('${m.id}'); this.closest('[style*=fixed]').remove();" title="退回到上一步">← 返回「${OFF_STAGE_MAP[prev].label}」</button>` : ''}
        ${next ? `<button class="btn primary small" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}'); offlineOpenDetail('${m.id}'); this.closest('[style*=fixed]').remove();" title="推进到下一步">推进到「${OFF_STAGE_MAP[next].label}」→</button>` : (stage==='received' ? '<span style="font-size:12px; color:var(--ok); align-self:center;">✅ 已完成全流程</span>' : '')}
      </div>
      <div>
        <label style="font-size:11.5px; color:var(--text-secondary); display:block; margin-bottom:5px;">📝 跟单备注(什么时候下单、当前情况、跟厂进度等)</label>
        <textarea id="offRemarkInput" rows="3" autocomplete="off" data-1p-ignore data-lpignore="true"
          style="width:100%; padding:8px; font-size:12.5px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); resize:vertical; box-sizing:border-box;"
          placeholder="例:6/13 已下单给三洪,约 15 天交期 / 6/20 催了进度,说本周出货">${escapeHtml(fu.remark || '')}</textarea>
        <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
          <button class="btn primary small" onclick="offlineSaveRemark('${escapeHtml(orderNo)}')">💾 保存备注</button>
          <span id="offRemarkStatus" style="font-size:11px; color:var(--text-tertiary);"></span>
        </div>
      </div>
    </div>`;

  const html = `
    <div style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;" onclick="if(event.target===this) this.remove();">
      <div style="background:var(--bg-card); border-radius:12px; max-width:640px; width:100%; max-height:88vh; overflow:auto; padding:20px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; position:sticky; top:-20px; background:var(--bg-card); padding-top:4px; z-index:3;">
          <span style="font-size:17px; font-weight:700;">🧾 ${escapeHtml(orderNo || '(无单号)')}</span>
          ${m.related_shop ? `<span style="font-size:12px; color:var(--text-secondary); background:var(--bg-elevated); padding:1px 8px; border-radius:8px;">${escapeHtml(m.related_shop)}</span>` : ''}
          <button class="btn small" style="margin-left:auto;" onclick="this.closest('[style*=fixed]').remove()">✕</button>
        </div>
        <div style="font-size:11.5px; color:var(--text-tertiary); margin-bottom:10px;">来自客服 ${escapeHtml(m.from_user_name || '')} · ${m.created_at_ms ? new Date(m.created_at_ms).toLocaleString('zh-CN') : ''}</div>
        ${opsArea}
        ${vouchers ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">${vouchers}</div>` : ''}
        <pre style="white-space:pre-wrap; word-break:break-word; font-family:inherit; font-size:13px; line-height:1.7; background:var(--bg-elevated); padding:12px; border-radius:8px; margin:0 0 12px;">${escapeHtml(m.body || '(无内容)')}</pre>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn small" style="color:var(--danger);" onclick="offlineCancel('${m.id}','${escapeHtml(orderNo)}'); this.closest('[style*=fixed]').remove();">🗑️ 取消此单</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}
window.offlineOpenDetail = offlineOpenDetail;

function offlineSetView(v) {
  OFFLINE._view = v;
  try { localStorage.setItem('offline_view', v); } catch (e) {}
  renderOfflineOrders();
}
window.offlineSetView = offlineSetView;

async function _offWriteFu(orderNo, patch) {
  if (typeof sb === 'undefined') throw new Error('数据库未连接');
  const cur = OFFLINE._followups[orderNo] || { order_no: orderNo };
  const merged = { ...cur, ...patch, order_no: orderNo, updated_at: new Date().toISOString() };
  // V20260617:只 upsert 表里确实存在的列(防 cur 里残留旧字段导致 column does not exist)
  const ALLOWED = ['order_no', 'stage', 'claimed_by_id', 'claimed_by_name', 'stage_at', 'claimed_at', 'cancelled', 'remark', 'updated_at'];
  const row = {};
  ALLOWED.forEach(k => { if (merged[k] !== undefined) row[k] = merged[k]; });
  const { error } = await sb.from('offline_followups').upsert(row, { onConflict: 'order_no' });
  if (error) {
    const m = error.message || '';
    // 表不存在才提示跑 SQL;其它错误(列缺失/权限)显示真实原因,不再笼统误导
    if (/relation .*offline_followups.* does not exist/i.test(m)) {
      throw new Error('表未建 · 请在跟单主库(pyfmu)跑 offline_followups.sql');
    }
    if (/column .* does not exist/i.test(m)) {
      throw new Error('表缺字段 · 请重跑 offline_followups.sql 全文(' + m + ')');
    }
    if (/permission denied|row-level security|403/i.test(m)) {
      throw new Error('权限被拒 · 请在 pyfmu 跑:ALTER TABLE offline_followups DISABLE ROW LEVEL SECURITY; GRANT ALL ON offline_followups TO anon;');
    }
    throw new Error('保存失败:' + m);
  }
  OFFLINE._followups[orderNo] = merged;
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

// V20260617:保存跟单备注(记录下单时间、当前情况、跟厂进度)
async function offlineSaveRemark(orderNo) {
  if (!orderNo) return;
  const ta = document.getElementById('offRemarkInput');
  const status = document.getElementById('offRemarkStatus');
  if (!ta) return;
  if (status) status.textContent = '⏳ 保存中...';
  try {
    await _offWriteFu(orderNo, { remark: ta.value });
    if (status) { status.style.color = 'var(--ok)'; status.textContent = '✓ 已保存'; }
    if (typeof toast === 'function') toast('💾 跟单备注已保存', 'success', 1800);
  } catch (e) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '保存失败:' + (e.message || e); }
  }
}
window.offlineSaveRemark = offlineSaveRemark;

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
