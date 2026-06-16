// ============================================================================
// 验厂模块(供应商看厂流程与记录)· V20260616
//   6步流转:待审核 pending → 已派单 dispatched → 看厂中 visiting → 待复核 review → 已闭环 closed / 已淘汰 rejected
//   数据:pyfmu 主库 factory_visits 表(diffsync 同步 · 全员可见)
//   影像:Supabase Storage(po-screenshots 桶)· 只存 URL · 禁 base64
//   权限:发起/填结果/推进 全员协作;派单 + 复核闭环 仅主管(IS_ADMIN)
//   需跑 验厂模块.sql
// ============================================================================

const FV_STAGES = [
  { k: 'pending',    label: '待审核', color: 'var(--text-secondary)', bg: 'rgba(136,135,128,0.08)' },
  { k: 'dispatched', label: '已派单', color: '#185fa5',               bg: 'rgba(37,99,235,0.08)' },
  { k: 'visiting',   label: '看厂中', color: '#854f0b',               bg: 'rgba(239,159,39,0.1)' },
  { k: 'review',     label: '待复核', color: '#7c3aed',               bg: 'rgba(124,58,237,0.1)' },
  { k: 'closed',     label: '已闭环', color: '#3b6d11',               bg: 'rgba(99,153,34,0.1)' },
];
const FV_STAGE_MAP = Object.fromEntries(FV_STAGES.map(s => [s.k, s]));

// 看厂目的清单(照文档 A/B/C/D 四大类)
const FV_PURPOSES = [
  { group: 'A. 处理合作 / 出货问题(最常用)', items: [
    { k: 'a_delay', t: '出货慢、交期不稳,到厂催货 / 了解产能进度' },
    { k: 'a_pack', t: '包装差:外箱不结实、内部防护不足、破损率高,现场确认改进' },
    { k: 'a_comm', t: '沟通配合差、响应慢,当面对接理顺' },
    { k: 'a_qc', t: '出货前验货 / 大货抽检,确认质量与包装符合要求' },
    { k: 'a_mismatch', t: '货不对板:与样品/图片不一致、偷工减料、换料' },
  ]},
  { group: 'B. 处理售后 / 质量合规问题(常用)', items: [
    { k: 'b_trace', t: '客户售后追溯:质量缺陷、批次问题到厂核查原因' },
    { k: 'b_compliance', t: '质量/合规:光源美规(UL/ETL、120V、认证)、玻璃/五金/电线规格' },
    { k: 'b_claim', t: '退货 / 返修 / 索赔事项现场协商处理' },
  ]},
  { group: 'C. 核实真假工厂(偶尔)', items: [
    { k: 'c_real', t: '是否真实工厂:有无生产线、在产、半成品、配件' },
    { k: 'c_same', t: '是否同源:包装尺寸、内部结构、标签是否与原供应商一致' },
    { k: 'c_capacity', t: '产能与规模、能否配齐配件、能否做定制/非标' },
  ]},
  { group: 'D. 关系维护 / 其他(偶尔)', items: [
    { k: 'd_history', t: '了解之前同事去过的情况、对接人、遗留问题' },
    { k: 'd_vip', t: '重要供应商定期回访、谈价/找源头/年度合作/账期' },
    { k: 'd_sample', t: '打样/封样确认:现场看样、确认大货标准、留封样' },
  ]},
];
const FV_PURPOSE_TEXT = {};
FV_PURPOSES.forEach(g => g.items.forEach(i => { FV_PURPOSE_TEXT[i.k] = i.t; }));

const FACTORY = { _list: [], _view: 'board', _loadedAt: 0, _editId: null, _editMedia: [], _editTags: [], _editPurposes: [], _editStyle: [] };
window.FACTORY = FACTORY;

function _fvIsBoss() { return (typeof IS_ADMIN !== 'undefined' && IS_ADMIN); }

async function loadFactoryVisits() {
  if (typeof sb === 'undefined') return;
  // V20260616:顺带预热供应商库(供发起时搜索下拉用)
  if (typeof SUPPLIERS !== 'undefined' && SUPPLIERS.loadAll && SUPPLIERS._list.length === 0) SUPPLIERS.loadAll().catch(() => {});
  try {
    const { data, error } = await sb.from('factory_visits').select('*')
      .is('deleted_at', null).order('updated_at', { ascending: false }).limit(500);
    if (error) { if (!/factory_visits/.test(error.message || '')) throw error; FACTORY._list = []; return; }
    FACTORY._list = data || [];
    FACTORY._loadedAt = Date.now();
  } catch (e) { console.warn('[factory] 加载失败:', e.message); }
}

function renderFactory() {
  const body = document.getElementById('factoryBody');
  if (!body) return;
  const all = FACTORY._list || [];
  const cnt = {};
  FV_STAGES.forEach(s => cnt[s.k] = 0);
  let rejected = 0;
  all.forEach(v => { if (v.stage === 'rejected') rejected++; else if (cnt[v.stage] !== undefined) cnt[v.stage]++; });

  const header = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap;">
      <h2 style="margin:0; font-size:17px; display:flex; align-items:center; gap:8px;">
        🏭 验厂
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">供应商看厂流程与记录 · 谁去看过哪些厂、对接人、问题整改全留底</span>
      </h2>
      <div style="margin-left:auto; display:inline-flex; gap:0; border:1px solid var(--border); border-radius:6px; overflow:hidden;">
        <button onclick="factorySetView('board')" style="padding:5px 12px; font-size:11.5px; border:0; cursor:pointer; background:${FACTORY._view==='board'?'var(--accent)':'var(--bg-card)'}; color:${FACTORY._view==='board'?'white':'var(--text-secondary)'};">▦ 看板</button>
        <button onclick="factorySetView('list')" style="padding:5px 12px; font-size:11.5px; border:0; border-left:1px solid var(--border); cursor:pointer; background:${FACTORY._view==='list'?'var(--accent)':'var(--bg-card)'}; color:${FACTORY._view==='list'?'white':'var(--text-secondary)'};">☰ 列表</button>
      </div>
      <button class="btn primary small" onclick="factoryOpenNew()">+ 发起看厂</button>
      <button class="btn small" onclick="loadFactoryVisits().then(renderFactory)">🔄 刷新</button>
    </div>`;

  if (all.length === 0) {
    body.innerHTML = header + `<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-tertiary);"><div style="font-size:34px;">🏭</div><div>还没有验厂任务 · 点「+ 发起看厂」开始</div></div>`;
    return;
  }
  body.innerHTML = header + (FACTORY._view === 'board' ? _fvBoard(all, rejected) : _fvList(all));
}

function _fvBoard(all, rejected) {
  const by = {};
  FV_STAGES.forEach(s => by[s.k] = []);
  all.forEach(v => { if (v.stage !== 'rejected' && by[v.stage]) by[v.stage].push(v); });
  const cols = FV_STAGES.map(s => `
    <div style="background:${s.bg}; border-radius:10px; padding:10px;">
      <div style="font-size:12.5px; font-weight:700; color:${s.color}; padding:2px 4px 10px; display:flex; justify-content:space-between;">
        <span>${s.label}</span><span style="background:var(--bg-card); padding:0 8px; border-radius:10px;">${by[s.k].length}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; min-height:40px;">
        ${by[s.k].map(_fvCard).join('') || `<div style="font-size:11px; color:var(--text-tertiary); text-align:center; padding:14px;">空</div>`}
      </div>
    </div>`).join('');
  let html = `<div class="offline-board">${cols}</div>`;
  if (rejected) {
    const rej = all.filter(v => v.stage === 'rejected');
    html += `<details style="margin-top:12px;"><summary style="cursor:pointer; font-size:12px; color:var(--text-secondary);">⊘ 已淘汰 (${rejected})</summary><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">${rej.map(_fvCard).join('')}</div></details>`;
  }
  return html;
}

function _fvCard(v) {
  const np = (Array.isArray(v.purposes) ? v.purposes.length : 0);
  const concl = v.conclusion === 'pass' ? '<span style="color:#3b6d11;">✓可合作</span>' : v.conclusion === 'reject' ? '<span style="color:var(--danger);">✗淘汰</span>' : v.conclusion === 'rectify' ? '<span style="color:#854f0b;">⚠限期整改</span>' : '';
  return `
  <div onclick="factoryOpenDetail('${v.id}')" style="background:var(--bg-card); border:1px solid var(--border); border-radius:9px; padding:10px; cursor:pointer; ${v.stage==='rejected'?'opacity:0.6; min-width:170px;':''}">
    <div style="font-weight:700; font-size:13.5px; margin-bottom:4px;">${escapeHtml(v.supplier || '(未填供应商)')}</div>
    ${v.related_product ? `<div style="font-size:10.5px; color:var(--text-secondary); margin-bottom:4px;">${escapeHtml(v.related_product)}</div>` : ''}
    <div style="font-size:10.5px; color:var(--text-tertiary); display:flex; gap:8px; flex-wrap:wrap;">
      ${v.creator_name ? `<span>发起:${escapeHtml(v.creator_name)}</span>` : ''}
      ${v.assignee_name ? `<span>👤去:${escapeHtml(v.assignee_name)}</span>` : ''}
      ${np ? `<span>🎯${np}项目的</span>` : ''}
    </div>
    ${concl ? `<div style="font-size:11px; margin-top:4px;">${concl}</div>` : ''}
    ${v.problems ? `<div style="font-size:10.5px; color:var(--text-secondary); margin-top:4px; padding:4px 6px; background:var(--bg-elevated); border-radius:5px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${escapeHtml(v.problems)}">⚠ ${escapeHtml(v.problems)}</div>` : ''}
    ${Array.isArray(v.style_images) && v.style_images.length ? `<div style="display:flex; gap:3px; margin-top:6px;">${v.style_images.slice(0,4).map(u=>`<img src="${escapeHtml(u)}" loading="lazy" onerror="this.style.display='none'" onclick="event.stopPropagation(); openImgLightbox&&openImgLightbox('${escapeHtml(u)}')" style="width:34px; height:34px; object-fit:cover; border-radius:4px; cursor:zoom-in;">`).join('')}${v.style_images.length>4?`<span style="font-size:10px; color:var(--text-tertiary); align-self:center;">+${v.style_images.length-4}</span>`:''}</div>` : ''}
    ${Array.isArray(v.media_urls) && v.media_urls.length ? `<div style="font-size:10px; color:var(--text-tertiary); margin-top:4px;">📷 ${v.media_urls.length} 张现场影像</div>` : ''}
  </div>`;
}

function _fvList(all) {
  return `<div style="display:flex; flex-direction:column; gap:8px;">${all.map(v => {
    const meta = v.stage === 'rejected' ? { label:'已淘汰', color:'var(--danger)', bg:'rgba(220,38,38,0.1)' } : FV_STAGE_MAP[v.stage];
    return `<div onclick="factoryOpenDetail('${v.id}')" style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; cursor:pointer; ${v.stage==='rejected'?'opacity:0.6;':''}">
      <span style="background:${meta.bg||'var(--bg-elevated)'}; color:${meta.color}; padding:2px 9px; border-radius:8px; font-size:11px; font-weight:600; white-space:nowrap;">${meta.label}</span>
      <span style="font-weight:700;">${escapeHtml(v.supplier || '(未填)')}</span>
      ${v.assignee_name ? `<span style="font-size:11px; color:var(--text-secondary);">👤${escapeHtml(v.assignee_name)}</span>` : ''}
      ${v.plan_date ? `<span style="font-size:11px; color:var(--text-tertiary);">${v.plan_date}</span>` : ''}
      <span style="margin-left:auto; font-size:11px; color:var(--text-tertiary);">${v.creator_name ? '发起:'+escapeHtml(v.creator_name) : ''}</span>
    </div>`;
  }).join('')}</div>`;
}

function factorySetView(v) { FACTORY._view = v; renderFactory(); }
window.factorySetView = factorySetView;
window.loadFactoryVisits = loadFactoryVisits;
window.renderFactory = renderFactory;

// ─────────────── 发起看厂(上半部分)───────────────
function factoryOpenNew() {
  FACTORY._editId = null;
  FACTORY._editPurposes = [];
  FACTORY._editMedia = [];
  FACTORY._editTags = [];
  FACTORY._editStyle = [];
  // V20260616:预加载供应商库(否则搜索下拉为空 · 验货单同款)
  if (typeof SUPPLIERS !== 'undefined' && SUPPLIERS.loadAll) SUPPLIERS.loadAll().catch(() => {});
  _fvShowModal({ stage: 'pending' }, 'new');
}
window.factoryOpenNew = factoryOpenNew;

function factoryOpenDetail(id) {
  const v = FACTORY._list.find(x => x.id === id);
  if (!v) return;
  FACTORY._editId = id;
  FACTORY._editPurposes = Array.isArray(v.purposes) ? [...v.purposes] : [];
  FACTORY._editMedia = Array.isArray(v.media_urls) ? [...v.media_urls] : [];
  FACTORY._editTags = Array.isArray(v.media_tags) ? [...v.media_tags] : [];
  FACTORY._editStyle = Array.isArray(v.style_images) ? [...v.style_images] : [];
  _fvShowModal(v, 'detail');
}
window.factoryOpenDetail = factoryOpenDetail;

function _fvPurposeChecks() {
  return FV_PURPOSES.map(g => `
    <div style="margin-bottom:8px;">
      <div style="font-size:11.5px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">${g.group}</div>
      ${g.items.map(i => `
        <label style="display:flex; gap:6px; align-items:flex-start; padding:3px 0; font-size:12px; cursor:pointer;">
          <input type="checkbox" data-fvpurpose="${i.k}" ${FACTORY._editPurposes.includes(i.k)?'checked':''} style="margin-top:2px;">
          <span>${i.t}</span>
        </label>`).join('')}
    </div>`).join('');
}

function _fvShowModal(v, mode) {
  const isBoss = _fvIsBoss();
  const stage = v.stage || 'pending';
  const stageMeta = stage === 'rejected' ? {label:'已淘汰',color:'var(--danger)'} : FV_STAGE_MAP[stage];
  const ro = (mode === 'detail');  // detail 模式上半部分只读展示,操作靠下方按钮

  // 影像缩略
  const mediaThumbs = (FACTORY._editMedia || []).map((u, i) => `
    <div style="position:relative; display:inline-block;">
      <img src="${escapeHtml(u)}" onclick="openImgLightbox && openImgLightbox('${escapeHtml(u)}')" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;">
      <button onclick="_fvRemoveMedia(${i})" style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; border:0; background:var(--danger); color:white; cursor:pointer; font-size:11px; line-height:1;">×</button>
    </div>`).join('');

  const html = `
    <div id="fvModal" style="position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(2px);" onclick="if(event.target===this) this.remove();">
      <div style="background:var(--bg-card); border-radius:14px; max-width:700px; width:100%; max-height:90vh; overflow:auto; box-shadow:0 12px 48px rgba(0,0,0,0.25);">
        <div style="position:sticky; top:0; z-index:5; background:var(--bg-card); display:flex; align-items:center; gap:10px; padding:18px 24px; border-bottom:1px solid var(--border); border-radius:14px 14px 0 0;">
          <span style="font-size:18px; font-weight:700;">🏭 看厂任务单</span>
          ${mode==='detail'?`<span style="background:${stageMeta.bg||'var(--bg-elevated)'}; color:${stageMeta.color}; padding:3px 12px; border-radius:12px; font-size:11.5px; font-weight:600;">${stageMeta.label}</span>`:''}
          <button class="btn small" style="margin-left:auto;" onclick="this.closest('#fvModal').remove()">✕</button>
        </div>
        <div style="padding:20px 24px 24px;">

        <!-- 上半部分:发起信息 -->
        <div style="font-size:13px; font-weight:700; color:var(--accent); margin:2px 0 12px; padding-bottom:6px; border-bottom:2px solid rgba(37,99,235,0.12);">① 发起信息</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div style="position:relative;"><label style="font-size:11px; color:var(--text-secondary); display:block; margin-bottom:4px;">供应商名称 *</label>
            <input id="fvSupplier" name="fv_sup_noac" class="form-control" value="${escapeHtml(v.supplier||'')}" ${ro?'readonly':''} autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" ${ro?'':'oninput="fvSupplierSearch(this.value)" onfocus="fvSupplierSearch(this.value)"'} placeholder="输入供应商名(从供应商库搜索·也可自定义)">
            <div id="fvSupplierDropdown" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:60; background:var(--bg-card); border:1px solid var(--border); border-radius:7px; max-height:200px; overflow-y:auto; box-shadow:0 4px 16px rgba(0,0,0,0.12); margin-top:2px;"></div>
          </div>
          <div><label style="font-size:11px; color:var(--text-secondary);">对应产品/订单</label><input id="fvProduct" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.related_product||'')}" ${ro?'readonly':''}></div>
        </div>
        ${ro ? '' : `
        <div style="background:rgba(37,99,235,0.04); border:1px solid rgba(37,99,235,0.15); border-radius:8px; padding:10px; margin-bottom:10px;">
          <div style="font-size:11.5px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">🔎 按订单号拉取(自动填供应商+产品)</div>
          <div style="display:flex; gap:8px;">
            <input id="fvFetchInput" class="form-control mono" placeholder="如 PL3798 / DC34469" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();fvFetchOrder();}">
            <button class="btn primary" onclick="fvFetchOrder()">🔍 拉取</button>
          </div>
          <div id="fvFetchStatus" style="font-size:11px; margin-top:6px; min-height:14px;"></div>
        </div>`}
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">工厂地址</label><input id="fvAddress" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.factory_address||'')}" ${ro?'readonly':''}></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">联系人/电话</label><input id="fvContact" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.contact||'')}" ${ro?'readonly':''}></div>
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:11px; color:var(--text-secondary);">看厂目的(可多选)</label>
          ${ro ? `<div style="font-size:12px; padding:6px; background:var(--bg-elevated); border-radius:6px;">${(FACTORY._editPurposes||[]).map(k=>FV_PURPOSE_TEXT[k]).filter(Boolean).map(t=>'• '+escapeHtml(t)).join('<br>')||'(未选)'}${v.purpose_other?'<br>• 其他:'+escapeHtml(v.purpose_other):''}</div>`
            : `<div style="max-height:200px; overflow:auto; border:1px solid var(--border); border-radius:6px; padding:8px;">${_fvPurposeChecks()}</div>
               <input id="fvPurposeOther" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" placeholder="其他目的(自填)" value="${escapeHtml(v.purpose_other||'')}" style="margin-top:6px;">`}
        </div>
        <div style="margin-bottom:12px;"><label style="font-size:11px; color:var(--text-secondary);">本次看厂补充说明</label><textarea id="fvNote" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" rows="2" ${ro?'readonly':''}>${escapeHtml(v.visit_note||'')}</textarea></div>
        <div style="margin-bottom:12px;">
          <label style="font-size:11px; color:var(--text-secondary);">供应商风格参考图 <span style="color:var(--text-tertiary);">(这供应商主要做什么风格 · 看厂前参考)</span></label>
          <div id="fvStyleThumbs" style="display:flex; gap:6px; flex-wrap:wrap; margin:6px 0;">${(FACTORY._editStyle||[]).map((u,i)=>`<div style="position:relative; display:inline-block;"><img src="${escapeHtml(u)}" onclick="openImgLightbox&&openImgLightbox('${escapeHtml(u)}')" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;"><button onclick="_fvRemoveStyle(${i})" style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; border:0; background:var(--danger); color:white; cursor:pointer; font-size:11px; line-height:1;">×</button></div>`).join('')}</div>
          <div id="fvStylePaste" tabindex="0" onpaste="_fvPasteStyle(event)" onclick="document.getElementById('fvStyleInput').click()" title="点这里选图 · 或选中后 Ctrl+V 粘贴截图"
               style="margin-top:4px; border:1.5px dashed var(--border); border-radius:8px; padding:10px 12px; text-align:center; font-size:12px; color:var(--text-tertiary); cursor:pointer; outline:none;"
               onfocus="this.style.borderColor='var(--accent)'; this.style.color='var(--accent)';" onblur="this.style.borderColor='var(--border)'; this.style.color='var(--text-tertiary)';">
            📋 点此选图,或 <b>Ctrl+V 粘贴截图</b>
          </div>
          <input type="file" id="fvStyleInput" accept="image/*" multiple onchange="_fvUploadStyle(event)" style="display:none;">
          <span id="fvStyleStatus" style="font-size:11px; color:var(--text-tertiary); margin-left:8px;"></span>
        </div>

        ${mode==='detail' ? `
        <!-- 派单(主管)-->
        <div style="font-size:13px; font-weight:700; color:var(--accent); margin:18px 0 12px; padding-bottom:6px; border-bottom:2px solid rgba(37,99,235,0.12);">② 派单 ${!isBoss?'<span style="font-size:10px; font-weight:400; color:var(--text-tertiary);">(仅主管可派单)</span>':''}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:6px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">去看厂同事</label><input id="fvAssignee" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.assignee_name||'')}" ${!isBoss?'readonly':''}></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">计划日期</label><input id="fvPlanDate" type="date" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${v.plan_date||''}" ${!isBoss?'readonly':''}></div>
          <div style="display:flex; align-items:flex-end;">${isBoss && (stage==='pending'||stage==='dispatched') ? `<button class="btn primary" style="width:100%;" onclick="factoryDispatch()">${stage==='pending'?'✓ 审核派单':'更新派单'}</button>`:''}</div>
        </div>
        ${v.dispatched_by ? `<div style="font-size:10.5px; color:var(--text-tertiary); margin-bottom:10px;">派单:${escapeHtml(v.dispatched_by)} · ${v.dispatched_at?new Date(v.dispatched_at).toLocaleDateString('zh-CN'):''}</div>`:''}

        <!-- 现场结果(看厂专员 · 全员可填)-->
        <div style="font-size:13px; font-weight:700; color:var(--accent); margin:18px 0 12px; padding-bottom:6px; border-bottom:2px solid rgba(37,99,235,0.12);">③ 现场结果</div>
        <div style="margin-bottom:8px;"><label style="font-size:11px; color:var(--text-secondary);">现场核对结果(按目的逐项)</label><textarea id="fvSiteResult" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" rows="3">${escapeHtml(v.site_result||'')}</textarea></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">是否真实工厂/同源</label>
            <select id="fvIsReal" class="form-control"><option value="">—</option><option value="yes" ${v.is_real_factory==='yes'?'selected':''}>是</option><option value="no" ${v.is_real_factory==='no'?'selected':''}>否</option><option value="doubt" ${v.is_real_factory==='doubt'?'selected':''}>存疑</option></select></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">结论</label>
            <select id="fvConclusion" class="form-control"><option value="">—</option><option value="pass" ${v.conclusion==='pass'?'selected':''}>通过可合作</option><option value="rectify" ${v.conclusion==='rectify'?'selected':''}>限期整改后再定</option><option value="reject" ${v.conclusion==='reject'?'selected':''}>不合作/淘汰</option></select></div>
        </div>
        <div style="margin-bottom:8px;"><label style="font-size:11px; color:var(--text-secondary);">问题清单 / 本次总结</label><textarea id="fvProblems" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" rows="3" placeholder="本次看厂发现的问题总结:交期 / 包装 / 质量 / 沟通配合 / 合规认证 等">${escapeHtml(v.problems||'')}</textarea></div>
        <div style="display:grid; grid-template-columns:2fr 1fr 1fr; gap:8px; margin-bottom:8px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">整改要求</label><input id="fvRectify" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.rectify_require||'')}"></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">责任人</label><input id="fvRectifyOwner" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.rectify_owner||'')}"></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">期限</label><input id="fvRectifyDeadline" type="date" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${v.rectify_deadline||''}"></div>
        </div>
        <div style="margin-bottom:8px;"><label style="font-size:11px; color:var(--text-secondary);">整改关闭情况</label><input id="fvRectifyStatus" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.rectify_status||'')}"></div>

        <!-- 影像留痕 -->
        <div style="margin-bottom:8px;">
          <label style="font-size:11px; color:var(--text-secondary);">影像留痕(生产现场/配件/包装/认证)</label>
          <div id="fvMediaThumbs" style="display:flex; gap:6px; flex-wrap:wrap; margin:6px 0;">${mediaThumbs}</div>
          <input type="file" id="fvMediaInput" accept="image/*" multiple onchange="_fvUploadMedia(event)" style="font-size:12px;">
          <span id="fvMediaStatus" style="font-size:11px; color:var(--text-tertiary); margin-left:8px;"></span>
        </div>
        <div style="margin-bottom:10px;"><label style="font-size:11px; color:var(--text-secondary);">看厂人签字</label><input id="fvVisitorSign" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" class="form-control" value="${escapeHtml(v.visitor_sign||'')}" style="max-width:200px;"></div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; padding-top:8px; border-top:1px solid var(--border);">
          <button class="btn primary" onclick="factorySaveResult()">💾 保存现场结果</button>
          ${stage==='dispatched'?`<button class="btn" onclick="factoryAdvance('visiting')">▶ 标记看厂中</button>`:''}
          ${(stage==='visiting'||stage==='dispatched')?`<button class="btn" onclick="factoryAdvance('review')">提交复核 →</button>`:''}
          ${isBoss && stage==='review'?`<button class="btn primary" onclick="factoryReview('closed')">✓ 复核闭环</button>`:''}
          ${isBoss && stage!=='rejected'?`<button class="btn danger" onclick="factoryReview('rejected')">⊘ 淘汰</button>`:''}
          <button class="btn danger" style="margin-left:auto;" onclick="factoryDelete('${v.id}')">🗑 删除</button>
        </div>
        ${v.reviewed_by?`<div style="font-size:10.5px; color:var(--text-tertiary); margin-top:8px;">复核:${escapeHtml(v.reviewed_by)} · ${v.reviewed_at?new Date(v.reviewed_at).toLocaleDateString('zh-CN'):''}</div>`:''}
        ` : `
        <div style="display:flex; gap:8px; justify-content:flex-end; padding-top:10px; border-top:1px solid var(--border);">
          <button class="btn" onclick="this.closest('#fvModal').remove()">取消</button>
          <button class="btn primary" onclick="factoryCreate()">发起看厂任务</button>
        </div>`}
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function _fvCollectPurposes() {
  const checks = document.querySelectorAll('#fvModal input[data-fvpurpose]:checked');
  return Array.from(checks).map(c => c.dataset.fvpurpose);
}

// 发起(创建)
async function factoryCreate() {
  const supplier = (document.getElementById('fvSupplier')?.value || '').trim();
  if (!supplier) { toast('请填供应商名称', 'err'); return; }
  try {
    const row = {
      stage: 'pending', supplier,
      related_product: (document.getElementById('fvProduct')?.value||'').trim(),
      factory_address: (document.getElementById('fvAddress')?.value||'').trim(),
      contact: (document.getElementById('fvContact')?.value||'').trim(),
      purposes: _fvCollectPurposes(),
      purpose_other: (document.getElementById('fvPurposeOther')?.value||'').trim(),
      visit_note: (document.getElementById('fvNote')?.value||'').trim(),
      style_images: FACTORY._editStyle || [],
      creator_name: (typeof CURRENT_AGENT!=='undefined'?CURRENT_AGENT:''),
      creator_id: (typeof CURRENT_USER_ID!=='undefined'?CURRENT_USER_ID:null),
    };
    const { error } = await sb.from('factory_visits').insert(row);
    if (error) {
      const m = error.message || '';
      if (/relation .*factory_visits.* does not exist/i.test(m)) { toast('表未建 · 请在主库跑 验厂模块.sql', 'err', 5000); return; }
      if (/column .* does not exist|style_images|could not find/i.test(m)) { toast('缺字段(可能是 style_images)· 请在主库跑:ALTER TABLE factory_visits ADD COLUMN IF NOT EXISTS style_images jsonb DEFAULT \'[]\'', 'err', 7000); return; }
      toast('保存失败:' + m, 'err', 6000);
      return;
    }
    toast('🏭 已发起看厂任务', 'ok', 2500);
    document.getElementById('fvModal')?.remove();
    await loadFactoryVisits(); renderFactory();
    if (typeof updateBadges==='function') updateBadges();
  } catch (e) { toast('发起失败:'+(e.message||e), 'err', 4000); }
}
window.factoryCreate = factoryCreate;

// 派单(主管)
async function factoryDispatch() {
  if (!_fvIsBoss()) { toast('仅主管可派单', 'err'); return; }
  const id = FACTORY._editId; if (!id) return;
  try {
    const nowIso = new Date().toISOString();
    const upd = {
      assignee_name: (document.getElementById('fvAssignee')?.value||'').trim(),
      plan_date: document.getElementById('fvPlanDate')?.value || null,
      dispatched_by: (typeof CURRENT_AGENT!=='undefined'?CURRENT_AGENT:''),
      dispatched_at: nowIso, stage: 'dispatched', updated_at: nowIso,
    };
    const { error } = await sb.from('factory_visits').update(upd).eq('id', id);
    if (error) throw error;
    toast('✓ 已派单', 'ok', 2000);
    document.getElementById('fvModal')?.remove();
    await loadFactoryVisits(); renderFactory(); factoryOpenDetail(id);
  } catch (e) { toast('派单失败:'+(e.message||e), 'err', 4000); }
}
window.factoryDispatch = factoryDispatch;

// 保存现场结果(全员可填)
async function factorySaveResult() {
  const id = FACTORY._editId; if (!id) return;
  try {
    const upd = {
      site_result: (document.getElementById('fvSiteResult')?.value||'').trim(),
      is_real_factory: document.getElementById('fvIsReal')?.value || null,
      conclusion: document.getElementById('fvConclusion')?.value || null,
      problems: (document.getElementById('fvProblems')?.value||'').trim(),
      rectify_require: (document.getElementById('fvRectify')?.value||'').trim(),
      rectify_owner: (document.getElementById('fvRectifyOwner')?.value||'').trim(),
      rectify_deadline: document.getElementById('fvRectifyDeadline')?.value || null,
      rectify_status: (document.getElementById('fvRectifyStatus')?.value||'').trim(),
      visitor_sign: (document.getElementById('fvVisitorSign')?.value||'').trim(),
      media_urls: FACTORY._editMedia || [],
      style_images: FACTORY._editStyle || [],
      visited_at: new Date().toISOString().slice(0,10),
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from('factory_visits').update(upd).eq('id', id);
    if (error) throw error;
    toast('💾 现场结果已保存', 'ok', 2000);
    document.getElementById('fvModal')?.remove();
    await loadFactoryVisits(); renderFactory();
  } catch (e) { toast('保存失败:'+(e.message||e), 'err', 4000); }
}
window.factorySaveResult = factorySaveResult;

// 推进阶段(全员)
async function factoryAdvance(toStage) {
  const id = FACTORY._editId; if (!id) return;
  try {
    const { error } = await sb.from('factory_visits').update({ stage: toStage, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    toast('→ 已推进到「'+(FV_STAGE_MAP[toStage]?.label||toStage)+'」', 'ok', 2000);
    document.getElementById('fvModal')?.remove();
    await loadFactoryVisits(); renderFactory();
    if (typeof updateBadges==='function') updateBadges();
  } catch (e) { toast('操作失败:'+(e.message||e), 'err', 4000); }
}
window.factoryAdvance = factoryAdvance;

// 复核闭环/淘汰(主管)
async function factoryReview(result) {
  if (!_fvIsBoss()) { toast('仅主管可复核', 'err'); return; }
  const id = FACTORY._editId; if (!id) return;
  if (result==='rejected' && !confirm('确认淘汰此供应商验厂任务?')) return;
  try {
    const nowIso = new Date().toISOString();
    const { error } = await sb.from('factory_visits').update({
      stage: result, reviewed_by: (typeof CURRENT_AGENT!=='undefined'?CURRENT_AGENT:''), reviewed_at: nowIso, updated_at: nowIso,
    }).eq('id', id);
    if (error) throw error;
    toast(result==='closed'?'✓ 已复核闭环':'⊘ 已淘汰', 'ok', 2000);
    document.getElementById('fvModal')?.remove();
    await loadFactoryVisits(); renderFactory();
    if (typeof updateBadges==='function') updateBadges();
  } catch (e) { toast('复核失败:'+(e.message||e), 'err', 4000); }
}
window.factoryReview = factoryReview;

async function factoryDelete(id) {
  if (!confirm('确认删除此验厂任务?')) return;
  try {
    const { error } = await sb.from('factory_visits').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    toast('🗑 已删除', 'ok', 2000);
    document.getElementById('fvModal')?.remove();
    await loadFactoryVisits(); renderFactory();
  } catch (e) { toast('删除失败:'+(e.message||e), 'err', 4000); }
}
window.factoryDelete = factoryDelete;

// 影像上传(Storage · 禁 base64)
async function _fvUploadMedia(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const status = document.getElementById('fvMediaStatus');
  if (status) status.textContent = '⏳ 上传中...';
  for (const f of files) {
    try {
      const r = (typeof _inspUploadImg === 'function') ? await _inspUploadImg(f) : null;
      if (r && r.url) FACTORY._editMedia.push(r.url);
    } catch (e) { console.warn('影像上传失败:', e.message); }
  }
  if (status) status.textContent = `✓ 已上传 ${FACTORY._editMedia.length} 张`;
  // 刷新缩略图
  const box = document.getElementById('fvMediaThumbs');
  if (box) box.innerHTML = FACTORY._editMedia.map((u,i)=>`<div style="position:relative; display:inline-block;"><img src="${escapeHtml(u)}" onclick="openImgLightbox&&openImgLightbox('${escapeHtml(u)}')" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;"><button onclick="_fvRemoveMedia(${i})" style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; border:0; background:var(--danger); color:white; cursor:pointer; font-size:11px; line-height:1;">×</button></div>`).join('');
}
window._fvUploadMedia = _fvUploadMedia;
function _fvRemoveMedia(i) {
  FACTORY._editMedia.splice(i, 1);
  const box = document.getElementById('fvMediaThumbs');
  if (box) box.innerHTML = FACTORY._editMedia.map((u,j)=>`<div style="position:relative; display:inline-block;"><img src="${escapeHtml(u)}" onclick="openImgLightbox&&openImgLightbox('${escapeHtml(u)}')" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;"><button onclick="_fvRemoveMedia(${j})" style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; border:0; background:var(--danger); color:white; cursor:pointer; font-size:11px; line-height:1;">×</button></div>`).join('');
}
window._fvRemoveMedia = _fvRemoveMedia;

// 角标:未闭环的(待审核+已派单+看厂中+待复核)
function factoryActiveCount() {
  return (FACTORY._list||[]).filter(v => v.stage!=='closed' && v.stage!=='rejected').length;
}
window.factoryActiveCount = factoryActiveCount;

// ─────────────── 供应商可筛选下拉(复用 SUPPLIERS 库)───────────────
function fvSupplierSearch(q) {
  const dd = document.getElementById('fvSupplierDropdown');
  if (!dd) return;
  if (!q || !q.trim()) { dd.style.display = 'none'; return; }
  // V20260616:库还没加载好 → 先提示加载中,载完自动重搜
  if (typeof SUPPLIERS !== 'undefined' && SUPPLIERS._list.length === 0 && SUPPLIERS.loadAll) {
    dd.innerHTML = `<div style="padding:10px; font-size:12px; color:var(--text-tertiary);">⏳ 供应商库加载中...</div>`;
    dd.style.display = '';
    SUPPLIERS.loadAll().then(() => {
      const cur = document.getElementById('fvSupplier');
      if (cur && cur.value.trim()) fvSupplierSearch(cur.value);   // 载完用最新输入重搜
    }).catch(() => { dd.style.display = 'none'; });
    return;
  }
  const matches = (typeof SUPPLIERS !== 'undefined' && SUPPLIERS.search) ? SUPPLIERS.search(q).slice(0, 8) : [];
  const sups = matches.map(m => m.s || m);
  if (sups.length === 0) {
    dd.innerHTML = `<div style="padding:10px; font-size:12px; color:var(--text-tertiary);">无匹配 · 将作为自定义供应商「${escapeHtml(q)}」</div>`;
    dd.style.display = '';
    return;
  }
  dd.innerHTML = sups.map(s => `
    <div onclick="fvPickSupplier('${escapeHtml(s.name).replace(/'/g, "\\'")}', ${s.address?`'${escapeHtml(s.address).replace(/'/g, "\\'")}'`:'null'}, ${s.contact_name||s.contact_phone?`'${escapeHtml([s.contact_name,s.contact_phone].filter(Boolean).join(' ')).replace(/'/g, "\\'")}'`:'null'})"
         style="padding:9px 12px; cursor:pointer; font-size:13px; border-bottom:1px solid var(--border-subtle);"
         onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='transparent'">
      🏭 ${escapeHtml(s.name)}${s.contact_name?` · ${escapeHtml(s.contact_name)}`:''}
    </div>`).join('');
  dd.style.display = '';
}
window.fvSupplierSearch = fvSupplierSearch;

function fvPickSupplier(name, address, contact) {
  const inp = document.getElementById('fvSupplier');
  if (inp) inp.value = name;
  // 供应商档案里有地址/联系人就自动带入(空的不覆盖已填)
  const addrEl = document.getElementById('fvAddress');
  const contEl = document.getElementById('fvContact');
  if (addrEl && address && !addrEl.value) addrEl.value = address;
  if (contEl && contact && !contEl.value) contEl.value = contact;
  const dd = document.getElementById('fvSupplierDropdown');
  if (dd) dd.style.display = 'none';
}
window.fvPickSupplier = fvPickSupplier;

// ─────────────── 按订单号拉取(自动填供应商+产品)───────────────
async function fvFetchOrder() {
  const raw = (document.getElementById('fvFetchInput')?.value || '').trim();
  const status = document.getElementById('fvFetchStatus');
  if (!raw) { if (status) { status.style.color = 'var(--danger)'; status.textContent = '请先填订单号'; } return; }
  const no = raw.replace(/^#/, '').trim();
  if (status) { status.style.color = 'var(--text-secondary)'; status.textContent = '⏳ 查找订单...'; }

  // 1) 先查采购单(orders 里 po_number/order_no 匹配 · 有供应商)
  let supplier = '', product = '';
  try {
    if (typeof sb !== 'undefined') {
      const { data: pos } = await sb.from('orders').select('supplier, product, order_no, po_number, line_items')
        .or(`po_number.eq.${no},order_no.eq.${no}`).is('deleted_at', null).limit(5);
      const hit = (pos || []).find(p => p.supplier) || (pos || [])[0];
      if (hit) {
        supplier = hit.supplier || '';
        product = hit.product || (Array.isArray(hit.line_items) ? hit.line_items.map(x => x.title_cn || x.title || '').filter(Boolean).join(' / ') : '');
      }
    }
  } catch (e) { /* 继续 */ }

  // 2) 采购单没有 → 查销售单(SHOPIFY 缓存)拿产品(销售单无供应商)
  if (!product && typeof SHOPIFY !== 'undefined' && Array.isArray(SHOPIFY._orders)) {
    const so = SHOPIFY._orders.find(s => String(s.shopify_order_number||'').replace('#','')===no || String(s.name||'').replace('#','')===no);
    if (so && Array.isArray(so.line_items)) {
      product = so.line_items.map(x => x.title_cn || x.title || x.title_en || '').filter(Boolean).join(' / ');
    }
  }

  if (!supplier && !product) {
    if (status) { status.style.color = 'var(--danger)'; status.textContent = '未找到该订单 · 可手动填写'; }
    return;
  }

  // 填充(供应商优先用采购单的 · 产品填到对应产品/订单)
  const supEl = document.getElementById('fvSupplier');
  const prodEl = document.getElementById('fvProduct');
  if (supplier && supEl && !supEl.value) supEl.value = supplier;
  if (prodEl) prodEl.value = (prodEl.value ? prodEl.value + ' / ' : '') + (product || ('订单 ' + no));
  if (status) { status.style.color = 'var(--ok)'; status.textContent = `✓ 已拉取${supplier?' · 供应商「'+supplier+'」':''}${product?' · 产品已填':''}`; }
  if (typeof toast === 'function') toast('✓ 已拉取订单信息', 'success', 2000);
}
window.fvFetchOrder = fvFetchOrder;

// ─────────────── 供应商风格参考图上传(Storage · 禁 base64)───────────────
function _fvRenderStyleThumbs() {
  const box = document.getElementById('fvStyleThumbs');
  if (box) box.innerHTML = (FACTORY._editStyle||[]).map((u,i)=>`<div style="position:relative; display:inline-block;"><img src="${escapeHtml(u)}" onclick="openImgLightbox&&openImgLightbox('${escapeHtml(u)}')" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border); cursor:zoom-in;"><button onclick="_fvRemoveStyle(${i})" style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; border:0; background:var(--danger); color:white; cursor:pointer; font-size:11px; line-height:1;">×</button></div>`).join('');
}
async function _fvUploadStyle(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const status = document.getElementById('fvStyleStatus');
  if (status) status.textContent = '⏳ 上传中...';
  for (const f of files) {
    try {
      const r = (typeof _inspUploadImg === 'function') ? await _inspUploadImg(f) : null;
      if (r && r.url) FACTORY._editStyle.push(r.url);
    } catch (e) { console.warn('风格图上传失败:', e.message); }
  }
  if (status) status.textContent = `✓ 已上传 ${FACTORY._editStyle.length} 张`;
  _fvRenderStyleThumbs();
}
window._fvUploadStyle = _fvUploadStyle;
function _fvRemoveStyle(i) { FACTORY._editStyle.splice(i, 1); _fvRenderStyleThumbs(); }
window._fvRemoveStyle = _fvRemoveStyle;

// 粘贴截图上传(Ctrl+V · 复用 Storage 上传)
async function _fvPasteStyle(e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  const status = document.getElementById('fvStyleStatus');
  let any = false;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      e.preventDefault();
      const file = it.getAsFile();
      if (!file) continue;
      any = true;
      if (status) status.textContent = '⏳ 上传粘贴的图...';
      try {
        const r = (typeof _inspUploadImg === 'function') ? await _inspUploadImg(file) : null;
        if (r && r.url) { FACTORY._editStyle.push(r.url); _fvRenderStyleThumbs(); }
        if (typeof toast === 'function') toast('✓ 粘贴图片已上传', 'success', 1500);
      } catch (err) {
        if (typeof toast === 'function') toast('上传失败:' + (err.message || err), 'err');
      }
    }
  }
  if (status) status.textContent = any ? `✓ 已上传 ${FACTORY._editStyle.length} 张` : '剪贴板里没有图片';
}
window._fvPasteStyle = _fvPasteStyle;
