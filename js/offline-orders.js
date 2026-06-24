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
  { k: 'arrived',   label: '已到货', color: '#1d6fa5',               bg: 'rgba(37,99,235,0.1)' },
  { k: 'shipped',   label: '已发货', color: '#0f6e56',               bg: 'rgba(29,158,117,0.1)' },
];
const OFF_STAGE_MAP = Object.fromEntries(OFF_STAGES.map(s => [s.k, s]));
// V20260622:新流程 — 跟单只推进到「已到货 arrived」;发货由客服在 cs-system 做(填转单号),跟单只读显示
const OFF_NEXT = { ordered: 'producing', producing: 'arrived' };
const OFF_PREV = { producing: 'ordered', arrived: 'producing' };
// V20260617:旧数据兼容 — pending/claimed 一律视为 ordered(待下单)· 接单环节归客服,跟单拿到直接下单
//   received(旧已签收)已取消 → 归并为 shipped(已发货终态)
const OFF_STAGE_NORMALIZE = { pending: 'ordered', claimed: 'ordered', received: 'shipped' };

const OFFLINE = { _msgs: [], _followups: {}, _shipped: {}, _view: (typeof localStorage !== 'undefined' && localStorage.getItem('offline_view')) || 'board', _loadedAt: 0 };
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
// V20260623:订单号规范化(剥掉 # 前缀和首尾空格)· 用于跨消息匹配(转单 vs 发货可能一个带#一个不带)
function _offNormNo(no) { return String(no || '').replace(/^#/, '').trim(); }
// 按规范化订单号查发货信息(转单/发货订单号可能 # 不一致)
function _offShippedOf(no) { return (OFFLINE._shipped && OFFLINE._shipped[_offNormNo(no)]) || null; }
function _offStageOf(m) {
  const fu = _offGetFu(m.related_ref);
  if (fu.cancelled) return 'cancelled';
  // V20260622:客服已发货(offline_shipped 消息) → 覆盖为 shipped 终态(不论 followup 是 arrived 还是别的)
  if (_offShippedOf(m.related_ref)) return 'shipped';
  let st = fu.stage || 'ordered';
  if (OFF_STAGE_NORMALIZE[st]) st = OFF_STAGE_NORMALIZE[st];   // V20260617:旧 pending/claimed → ordered · received → shipped
  return st;
}

async function loadOfflineOrders() {
  // V20260623b:双库兼容 — 线下单消息可能在 pyfmu(sb·新)或 xyhbw(cdmClient·旧),两边都查合并去重
  //   避免迁库过渡期一边没数据就全空。其他跨部门工单仍各自在原库。
  const clients = [];
  if (typeof sb !== 'undefined') clients.push(sb);
  if (typeof cdmClient !== 'undefined') clients.push(cdmClient);
  if (clients.length === 0) return;
  const _qOffline = async (relType, cols) => {
    const results = [];
    for (const cli of clients) {
      try {
        const { data } = await cli.from('cross_dept_messages').select(cols)
          .eq('to_system', 'po').eq('related_type', relType)
          .order('created_at_ms', { ascending: false }).limit(300);
        if (data) results.push(...data);
      } catch (e) { /* 某个库没这张表/无权限 → 跳过,用另一个库 */ }
    }
    return results;
  };
  try {
    // 转单(两库合并 · 按 related_ref 去重,留最新)
    const rawMsgs = await _qOffline('offline_transfer', 'id,from_system,from_user_name,to_system,to_user_id,to_user_name,related_ref,related_shop,priority,title,body,attachments,related_type,status,created_at_ms,updated_at');
    const seen = {};
    rawMsgs.filter(m => m.status !== 'deleted').forEach(m => {
      const k = _offNormNo(m.related_ref) || m.id;
      if (!seen[k] || (m.created_at_ms || 0) > (seen[k].created_at_ms || 0)) seen[k] = m;
    });
    OFFLINE._msgs = Object.values(seen).sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));

    const orderNos = OFFLINE._msgs.map(m => m.related_ref).filter(Boolean);
    OFFLINE._followups = {};
    if (orderNos.length > 0 && typeof sb !== 'undefined') {
      const { data: fus, error: e2 } = await sb.from('offline_followups').select('*').in('order_no', orderNos);
      if (e2) { if (!/offline_followups/.test(e2.message || '')) throw e2; }
      (fus || []).forEach(f => { OFFLINE._followups[f.order_no] = f; });
    }

    // V20260622:读客服发货消息(offline_shipped)→ 反映「已发货」+ 快递单号(发货由客服在 cs-system 做)
    OFFLINE._shipped = {};
    OFFLINE._shippedUnmatched = [];
    try {
      const knownOrderNos = new Set(orderNos.map(_offNormNo));   // 规范化后匹配
      const shippedMsgs = await _qOffline('offline_shipped', 'related_ref, related_shop, body, created_at_ms');
      (shippedMsgs || []).forEach(m => {
        if (!m.related_ref) return;
        const key = _offNormNo(m.related_ref);   // 规范化订单号(剥#)做匹配key
        const body = String(m.body || '');
        const mt = body.match(/(?:快递单号|转单号|物流单号)[:：]\s*([^\s·\n]+)/);   // 快递/转单号(兼容两种关键词)
        const tracking = mt ? mt[1] : '';
        const mc = body.match(/(?:快递单号|转单号|物流单号)[:：]\s*[^\s·\n]+\s*·\s*([^\n]+?)(?:\s*\n|$)/);   // 承运商(可选)
        const carrier = mc ? mc[1].trim() : '';
        if (!OFFLINE._shipped[key]) {                       // 同一单只取最新一条(已排序 desc)·幂等去重
          OFFLINE._shipped[key] = { tracking: tracking, carrier: carrier, at: m.created_at_ms };
        }
        if (!knownOrderNos.has(key)) {                      // 匹配不到线下单 → 留作人工核对
          OFFLINE._shippedUnmatched.push({ order_no: m.related_ref, shop: m.related_shop || '', tracking: tracking, at: m.created_at_ms });
        }
      });
    } catch (se) { console.warn('[offline] 读发货消息失败:', se.message); }

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
      <button class="btn small" onclick="offlineDiagShipped()" title="查 MESSAGEBUS 库的客服发货消息,排查为什么没同步">🔍 发货诊断</button>
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
  } else if (stage === 'shipped') {
    // V20260622:客服已发货 · 只读终态 + 转单号
    const _sh = _offShippedOf(orderNo); const tk = (_sh && _sh.tracking) || '';
    actions = `<span style="font-size:10.5px; color:var(--ok);">✅ 已发货${tk ? ` · 快递单号 ${escapeHtml(tk)}` : ''}</span>`;
  } else if (stage === 'arrived') {
    // V20260622:跟单推进到头 · 等客服发货
    actions = `<span style="font-size:10.5px; color:var(--text-tertiary);">✅ 已到货 · 等客服发货</span>`;
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
    const _firstAtt = atts.find(a => { const u = _offAttUrl(a); return u && u !== '__BASE64__'; });
    const _fMeta = [firstUrl, _firstAtt && _firstAtt.type, _firstAtt && _firstAtt.content_type, _firstAtt && _firstAtt.mimetype, _firstAtt && _firstAtt.name, _firstAtt && _firstAtt.filename].filter(Boolean).join(' ').toLowerCase();
    const firstIsImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)(\?|$)/.test(_fMeta) || /image\//.test(_fMeta);
    const firstIsPdf = firstUrl && !firstIsImage;   // 非图片当文件(PDF/未知)处理
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
          : (st === 'shipped'
              ? `<div style="text-align:center; font-size:11px; color:var(--ok);">✅ 已发货${(_offShippedOf(orderNo) && _offShippedOf(orderNo).tracking) ? ` · 快递单号 ${escapeHtml(_offShippedOf(orderNo).tracking)}` : ''}</div>`
              : (st === 'arrived'
                  ? `<div style="text-align:center; font-size:11px; color:var(--text-tertiary);">✅ 已到货 · 等客服发货</div>`
                  : '')))}
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
    // V20260617b:正向判断"是否图片"——只有确认是图片才走灯箱,其余(PDF/未知)一律文件卡片+新标签打开
    //   覆盖各种字段:url后缀 / type / content_type / mimetype / name / filename
    const meta = [u, a && a.type, a && a.content_type, a && a.mimetype, a && a.mime, a && a.name, a && a.filename]
      .filter(Boolean).join(' ').toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)(\?|$)/.test(meta) || /image\//.test(meta);
    if (isImage) {
      return `<img src="${escapeHtml(u)}" loading="lazy" onclick="openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="max-width:120px; max-height:120px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;">`;
    }
    // 非图片(PDF 或未知格式)→ 文件卡片,新标签打开
    const fname = (a && (a.name || a.filename)) || (/pdf/.test(meta) ? 'PDF 文档' : '附件文件');
    const icon = /pdf/.test(meta) ? '📄' : '📎';
    return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener" style="display:flex; align-items:center; gap:8px; padding:10px 14px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:8px; text-decoration:none; color:var(--text-primary); font-size:12.5px;" title="点击在新标签页打开">
      <span style="font-size:22px;">${icon}</span>
      <span style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fname)}</span>
      <span style="color:var(--accent); font-size:11px; margin-left:4px;">↗ 打开</span>
    </a>`;
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
        ${next ? `<button class="btn primary small" onclick="offlineAdvance('${m.id}','${escapeHtml(orderNo)}','${next}'); offlineOpenDetail('${m.id}'); this.closest('[style*=fixed]').remove();" title="推进到下一步">推进到「${OFF_STAGE_MAP[next].label}」→</button>` : (
          stage === 'shipped'
            ? `<span style="font-size:12.5px; color:var(--ok); align-self:center;">✅ 客服已发货${(_offShippedOf(orderNo) && _offShippedOf(orderNo).tracking) ? ` · 快递单号 <b>${escapeHtml(_offShippedOf(orderNo).tracking)}</b>${_offShippedOf(orderNo).carrier ? ` (${escapeHtml(_offShippedOf(orderNo).carrier)})` : ''}` : ''}</span>`
            : (stage === 'arrived'
                ? '<span style="font-size:12px; color:var(--text-tertiary); align-self:center;">✅ 已到货 · 等客服发货(发货由客服操作)</span>'
                : ''))}
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

// V20260623:发货同步诊断 — 查 MESSAGEBUS 库实际数据,排查客服已发货为何没同步到跟单
async function offlineDiagShipped() {
  const clients = [];
  if (typeof sb !== 'undefined') clients.push({ name: 'pyfmu(跟单库)', cli: sb });
  if (typeof cdmClient !== 'undefined') clients.push({ name: 'xyhbw(销售库)', cli: cdmClient });
  if (clients.length === 0) { toast('未连接任何库', 'err'); return; }
  toast('🔍 正在查两个库的 cross_dept_messages...', 'info', 1500);
  try {
    // 双库查询,带库来源标注
    const _q = async (relType, cols) => {
      const out = [];
      for (const { name, cli } of clients) {
        try {
          const { data } = await cli.from('cross_dept_messages').select(cols)
            .eq('to_system', 'po').eq('related_type', relType)
            .order('created_at_ms', { ascending: false }).limit(200);
          (data || []).forEach(r => out.push({ ...r, _db: name }));
        } catch (e) { /* 该库无表/无权限 */ }
      }
      return out;
    };
    const shipped = await _q('offline_shipped', 'related_ref, related_shop, body, status, created_at_ms');
    const transfers = await _q('offline_transfer', 'related_ref, status');

    // 统计各库分布
    const dbStat = {};
    [...shipped, ...transfers].forEach(r => { dbStat[r._db] = (dbStat[r._db] || 0) + 1; });

    const transferNos = new Set((transfers || []).map(t => _offNormNo(t.related_ref)).filter(Boolean));
    const shippedList = shipped || [];
    // 分类:能匹配到转单 vs 匹配不到(孤儿发货消息)· 按规范化订单号匹配
    const matched = [], orphan = [];
    shippedList.forEach(m => {
      if (!m.related_ref) return;
      const mt = String(m.body || '').match(/(?:快递单号|转单号|物流单号)[:：]\s*([^\s·\n]+)/);
      const row = { order_no: m.related_ref, shop: m.related_shop || '', tracking: mt ? mt[1] : '(未解析)', status: m.status, at: m.created_at_ms };
      if (transferNos.has(_offNormNo(m.related_ref))) matched.push(row); else orphan.push(row);
    });

    const fmtTime = ms => ms ? new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const rowHtml = r => `<tr>
      <td style="padding:5px 8px; font-family:monospace; font-weight:600;">${escapeHtml(r.order_no)}</td>
      <td style="padding:5px 8px;">${escapeHtml(r.shop)}</td>
      <td style="padding:5px 8px; font-family:monospace;">${escapeHtml(r.tracking)}</td>
      <td style="padding:5px 8px; color:var(--text-tertiary);">${fmtTime(r.at)}</td></tr>`;

    const html = `
      <div style="margin-bottom:14px; padding:10px 12px; background:var(--bg-elevated); border-radius:8px; font-size:13px; line-height:1.7;">
        两库实际数据(pyfmu跟单库 + xyhbw销售库):<br>
        · 数据分布:${Object.entries(dbStat).map(([k, v]) => `${k}=${v}`).join(' · ') || '两库都没数据 ⚠️'}<br>
        · 客服发货消息(offline_shipped):<b>${shippedList.length}</b> 条<br>
        · 转单建单消息(offline_transfer):<b>${transferNos.size}</b> 个订单号<br>
        · 发货消息能匹配到转单的:<b style="color:var(--ok);">${matched.length}</b> 条 ✅<br>
        · 发货消息<b style="color:var(--danger);">匹配不到</b>转单的(孤儿):<b style="color:var(--danger);">${orphan.length}</b> 条 ⚠️
      </div>
      ${orphan.length > 0 ? `
      <div style="font-weight:600; color:var(--danger); margin:10px 0 6px;">⚠️ 这些发货消息在跟单找不到对应的转单(所以看不到):</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:14px;">
        <thead><tr style="background:var(--bg-elevated); text-align:left;"><th style="padding:6px 8px;">订单号</th><th style="padding:6px 8px;">网站</th><th style="padding:6px 8px;">转单号</th><th style="padding:6px 8px;">发货时间</th></tr></thead>
        <tbody>${orphan.map(rowHtml).join('')}</tbody>
      </table>
      <div style="font-size:12px; color:var(--text-secondary); margin-bottom:14px; padding:8px 10px; background:rgba(239,159,39,0.08); border-radius:6px;">
        💡 原因:客服发货的这些订单,跟单这边没有对应的「offline_transfer」转单工单(没被转过来,或转单消息被删了)。<br>
        解决:① 让客服补一条转单(related_type=offline_transfer)· 或 ② 点下方按钮把这些孤儿发货单【强制建为线下单】
      </div>
      <button class="btn primary" onclick="offlineImportOrphanShipped()">🧾 把这 ${orphan.length} 个孤儿发货单导入线下单</button>
      ` : '<div style="color:var(--ok); padding:10px;">✅ 所有客服发货消息都能匹配到转单,数据正常。如果看板还看不到,点「🔄 刷新」。</div>'}
      ${matched.length > 0 ? `
      <details style="margin-top:14px;"><summary style="cursor:pointer; font-size:12px; color:var(--text-secondary);">查看 ${matched.length} 条正常匹配的发货消息</summary>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:8px;">
        <tbody>${matched.map(rowHtml).join('')}</tbody>
      </table></details>` : ''}
    `;
    OFFLINE._orphanShipped = orphan;   // 存起来供导入用
    _offShowModal('🔍 发货同步诊断', html);
  } catch (e) {
    toast('诊断失败:' + (e.message || e), 'err', 4000);
  }
}
window.offlineDiagShipped = offlineDiagShipped;

// 把孤儿发货单(有发货消息但无转单)强制建为线下单 followup,直接标 shipped
async function offlineImportOrphanShipped() {
  const orphans = OFFLINE._orphanShipped || [];
  if (orphans.length === 0) { toast('没有需要导入的', 'info'); return; }
  if (!confirm(`把这 ${orphans.length} 个孤儿发货单导入线下单(直接标为已发货)?\n它们会出现在线下单看板「已发货」列。`)) return;
  try {
    const nowIso = new Date().toISOString();
    let ok = 0;
    for (const o of orphans) {
      // 写一条 offline_followups(stage=shipped),并补一条 offline_transfer 消息让看板能显示订单信息
      if (typeof sb !== 'undefined') {
        await sb.from('offline_followups').upsert({ order_no: o.order_no, stage: 'shipped', stage_at: nowIso, updated_at: nowIso }, { onConflict: 'order_no' });
      }
      // 补建 offline_transfer 工单(让线下单看板有这条单的基础信息)
      await (typeof sb !== 'undefined' ? sb : cdmClient).from('cross_dept_messages').insert({
        from_system: 'cs', to_system: 'po', related_type: 'offline_transfer',
        related_ref: o.order_no, related_shop: o.shop,
        title: `[补建·已发货] ${o.order_no}`,
        body: `补建的线下单(客服已发货但无转单记录)· 转单号: ${o.tracking}`,
        status: 'done', created_at_ms: o.at || Date.now(), updated_at: nowIso,
      });
      ok++;
    }
    toast(`🧾 已导入 ${ok} 个发货单到线下单`, 'success', 3000);
    document.querySelectorAll('[data-off-modal]').forEach(el => el.remove());
    await loadOfflineOrders();
    renderOfflineOrders();
  } catch (e) { toast('导入失败:' + (e.message || e), 'err', 4000); }
}
window.offlineImportOrphanShipped = offlineImportOrphanShipped;

// 通用弹层(诊断用)
function _offShowModal(title, bodyHtml) {
  document.querySelectorAll('[data-off-modal]').forEach(el => el.remove());
  const wrap = document.createElement('div');
  wrap.setAttribute('data-off-modal', '1');
  wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow:auto;';
  wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  wrap.innerHTML = `<div style="background:var(--bg-card); border-radius:12px; max-width:760px; width:100%; padding:20px 22px; box-shadow:0 12px 40px rgba(0,0,0,0.25);">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
      <h3 style="margin:0; font-size:16px;">${title}</h3>
      <button class="btn small" onclick="this.closest('[data-off-modal]').remove()">✕ 关闭</button>
    </div>
    ${bodyHtml}
  </div>`;
  document.body.appendChild(wrap);
}

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
  // V20260622:跟单只推进到「已到货 arrived」为止 · 发货由客服在 cs-system 做(填转单号),跟单不再写 po_shipped 回执
  if (toStage !== 'ordered' && toStage !== 'producing' && toStage !== 'arrived') {
    if (typeof toast === 'function') toast('发货由客服操作 · 跟单推进到「已到货」即可', 'info', 2500);
    return;
  }
  try {
    const nowIso = new Date().toISOString();
    await _offWriteFu(orderNo, { stage: toStage, stage_at: nowIso });
    if (typeof toast === 'function') toast(`→ ${orderNo} 已推进到「${label}」`, 'ok', 2200);
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
