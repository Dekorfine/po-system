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

const FACTORY = { _list: [], _view: 'board', _loadedAt: 0, _editId: null, _editMedia: [], _editTags: [], _editPurposes: [] };
window.FACTORY = FACTORY;

function _fvIsBoss() { return (typeof IS_ADMIN !== 'undefined' && IS_ADMIN); }

async function loadFactoryVisits() {
  if (typeof sb === 'undefined') return;
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
    ${Array.isArray(v.media_urls) && v.media_urls.length ? `<div style="font-size:10px; color:var(--text-tertiary); margin-top:4px;">📷 ${v.media_urls.length} 张影像</div>` : ''}
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
    <div id="fvModal" style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;" onclick="if(event.target===this) this.remove();">
      <div style="background:var(--bg-card); border-radius:12px; max-width:680px; width:100%; max-height:88vh; overflow:auto; padding:22px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
          <span style="font-size:18px; font-weight:700;">🏭 看厂任务单</span>
          ${mode==='detail'?`<span style="background:${stageMeta.bg||'var(--bg-elevated)'}; color:${stageMeta.color}; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:600;">${stageMeta.label}</span>`:''}
          <button class="btn small" style="margin-left:auto;" onclick="this.closest('#fvModal').remove()">✕</button>
        </div>

        <!-- 上半部分:发起信息 -->
        <div style="font-size:12.5px; font-weight:700; color:var(--accent); margin:6px 0 8px;">① 发起信息</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">供应商名称 *</label><input id="fvSupplier" class="form-control" value="${escapeHtml(v.supplier||'')}" ${ro?'readonly':''}></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">对应产品/订单</label><input id="fvProduct" class="form-control" value="${escapeHtml(v.related_product||'')}" ${ro?'readonly':''}></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">工厂地址</label><input id="fvAddress" class="form-control" value="${escapeHtml(v.factory_address||'')}" ${ro?'readonly':''}></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">联系人/电话</label><input id="fvContact" class="form-control" value="${escapeHtml(v.contact||'')}" ${ro?'readonly':''}></div>
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:11px; color:var(--text-secondary);">看厂目的(可多选)</label>
          ${ro ? `<div style="font-size:12px; padding:6px; background:var(--bg-elevated); border-radius:6px;">${(FACTORY._editPurposes||[]).map(k=>FV_PURPOSE_TEXT[k]).filter(Boolean).map(t=>'• '+escapeHtml(t)).join('<br>')||'(未选)'}${v.purpose_other?'<br>• 其他:'+escapeHtml(v.purpose_other):''}</div>`
            : `<div style="max-height:200px; overflow:auto; border:1px solid var(--border); border-radius:6px; padding:8px;">${_fvPurposeChecks()}</div>
               <input id="fvPurposeOther" class="form-control" placeholder="其他目的(自填)" value="${escapeHtml(v.purpose_other||'')}" style="margin-top:6px;">`}
        </div>
        <div style="margin-bottom:12px;"><label style="font-size:11px; color:var(--text-secondary);">本次看厂补充说明</label><textarea id="fvNote" class="form-control" rows="2" ${ro?'readonly':''}>${escapeHtml(v.visit_note||'')}</textarea></div>

        ${mode==='detail' ? `
        <!-- 派单(主管)-->
        <div style="font-size:12.5px; font-weight:700; color:var(--accent); margin:14px 0 8px;">② 派单 ${!isBoss?'<span style="font-size:10px; font-weight:400; color:var(--text-tertiary);">(仅主管可派单)</span>':''}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:6px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">去看厂同事</label><input id="fvAssignee" class="form-control" value="${escapeHtml(v.assignee_name||'')}" ${!isBoss?'readonly':''}></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">计划日期</label><input id="fvPlanDate" type="date" class="form-control" value="${v.plan_date||''}" ${!isBoss?'readonly':''}></div>
          <div style="display:flex; align-items:flex-end;">${isBoss && (stage==='pending'||stage==='dispatched') ? `<button class="btn primary" style="width:100%;" onclick="factoryDispatch()">${stage==='pending'?'✓ 审核派单':'更新派单'}</button>`:''}</div>
        </div>
        ${v.dispatched_by ? `<div style="font-size:10.5px; color:var(--text-tertiary); margin-bottom:10px;">派单:${escapeHtml(v.dispatched_by)} · ${v.dispatched_at?new Date(v.dispatched_at).toLocaleDateString('zh-CN'):''}</div>`:''}

        <!-- 现场结果(看厂专员 · 全员可填)-->
        <div style="font-size:12.5px; font-weight:700; color:var(--accent); margin:14px 0 8px;">③ 现场结果</div>
        <div style="margin-bottom:8px;"><label style="font-size:11px; color:var(--text-secondary);">现场核对结果(按目的逐项)</label><textarea id="fvSiteResult" class="form-control" rows="3">${escapeHtml(v.site_result||'')}</textarea></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">是否真实工厂/同源</label>
            <select id="fvIsReal" class="form-control"><option value="">—</option><option value="yes" ${v.is_real_factory==='yes'?'selected':''}>是</option><option value="no" ${v.is_real_factory==='no'?'selected':''}>否</option><option value="doubt" ${v.is_real_factory==='doubt'?'selected':''}>存疑</option></select></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">结论</label>
            <select id="fvConclusion" class="form-control"><option value="">—</option><option value="pass" ${v.conclusion==='pass'?'selected':''}>通过可合作</option><option value="rectify" ${v.conclusion==='rectify'?'selected':''}>限期整改后再定</option><option value="reject" ${v.conclusion==='reject'?'selected':''}>不合作/淘汰</option></select></div>
        </div>
        <div style="margin-bottom:8px;"><label style="font-size:11px; color:var(--text-secondary);">问题清单</label><textarea id="fvProblems" class="form-control" rows="2">${escapeHtml(v.problems||'')}</textarea></div>
        <div style="display:grid; grid-template-columns:2fr 1fr 1fr; gap:8px; margin-bottom:8px;">
          <div><label style="font-size:11px; color:var(--text-secondary);">整改要求</label><input id="fvRectify" class="form-control" value="${escapeHtml(v.rectify_require||'')}"></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">责任人</label><input id="fvRectifyOwner" class="form-control" value="${escapeHtml(v.rectify_owner||'')}"></div>
          <div><label style="font-size:11px; color:var(--text-secondary);">期限</label><input id="fvRectifyDeadline" type="date" class="form-control" value="${v.rectify_deadline||''}"></div>
        </div>
        <div style="margin-bottom:8px;"><label style="font-size:11px; color:var(--text-secondary);">整改关闭情况</label><input id="fvRectifyStatus" class="form-control" value="${escapeHtml(v.rectify_status||'')}"></div>

        <!-- 影像留痕 -->
        <div style="margin-bottom:8px;">
          <label style="font-size:11px; color:var(--text-secondary);">影像留痕(生产现场/配件/包装/认证)</label>
          <div id="fvMediaThumbs" style="display:flex; gap:6px; flex-wrap:wrap; margin:6px 0;">${mediaThumbs}</div>
          <input type="file" id="fvMediaInput" accept="image/*" multiple onchange="_fvUploadMedia(event)" style="font-size:12px;">
          <span id="fvMediaStatus" style="font-size:11px; color:var(--text-tertiary); margin-left:8px;"></span>
        </div>
        <div style="margin-bottom:10px;"><label style="font-size:11px; color:var(--text-secondary);">看厂人签字</label><input id="fvVisitorSign" class="form-control" value="${escapeHtml(v.visitor_sign||'')}" style="max-width:200px;"></div>

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
      creator_name: (typeof CURRENT_AGENT!=='undefined'?CURRENT_AGENT:''),
      creator_id: (typeof CURRENT_USER_ID!=='undefined'?CURRENT_USER_ID:null),
    };
    const { error } = await sb.from('factory_visits').insert(row);
    if (error) { if (/factory_visits/.test(error.message||'')) { toast('请先在主库跑 验厂模块.sql', 'err', 5000); return; } throw error; }
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
