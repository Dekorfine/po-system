// ============================================================================
// V28n (2026-05-28):批量订单验货单模块
// 跟单做验货标准表给工厂 · 工厂按标准验货 · 留底供售后追溯
// 数据存主库 inspection_sheets 表
// ============================================================================

const INSPECTION = {
  _list: [],
  _filter: 'all',        // all / ordered / pending / done
  _editing: null,        // 当前编辑的验货单(草稿)
  _loaded: false,
};

// 国家预设(美国最常用 · 排第一)+ 标准
const INSP_COUNTRIES = ['美国', '加拿大', '英国', '德国', '法国', '澳大利亚', '以色列', '沙特', '阿联酋', '日本'];
const INSP_STANDARDS = ['美标', '欧标', '英标', '澳标', '国标', '日标'];
const INSP_STATUS = {
  ordered: { label: '已下单', color: '#3b82f6', icon: '📝' },
  pending: { label: '待验货', color: '#f59e0b', icon: '⏳' },
  done:    { label: '已完成验货', color: '#10b981', icon: '✅' },
};

// ─────────────── 加载 + 渲染 ───────────────
async function renderInspection() {
  const tab = document.getElementById('inspectionBody');
  if (!tab) return;
  if (!INSPECTION._loaded) {
    tab.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-tertiary);">加载验货单…</div>';
    await inspLoadAll();
  }
  inspRenderList();
}

async function inspLoadAll() {
  try {
    const { data, error } = await sb.from('inspection_sheets')
      .select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (error) throw error;
    INSPECTION._list = data || [];
    INSPECTION._loaded = true;
  } catch (e) {
    console.error('[验货单] 加载失败:', e);
    toast('验货单加载失败:' + (e.message || e), 'err');
    INSPECTION._list = [];
  }
}

function inspRenderList() {
  const tab = document.getElementById('inspectionBody');
  if (!tab) return;
  const f = INSPECTION._filter;
  const list = f === 'all' ? INSPECTION._list : INSPECTION._list.filter(x => x.status === f);
  const counts = {
    all: INSPECTION._list.length,
    ordered: INSPECTION._list.filter(x => x.status === 'ordered').length,
    pending: INSPECTION._list.filter(x => x.status === 'pending').length,
    done: INSPECTION._list.filter(x => x.status === 'done').length,
  };

  const subTab = (key, label) => `
    <button onclick="inspSetFilter('${key}')" class="insp-subtab ${f === key ? 'active' : ''}"
      style="padding:7px 14px; border-radius:8px; border:1px solid ${f === key ? 'var(--accent)' : 'var(--border)'};
             background:${f === key ? 'var(--accent)' : 'var(--bg-card)'}; color:${f === key ? '#fff' : 'var(--text-secondary)'};
             cursor:pointer; font-size:13px; font-weight:500;">
      ${label} <span style="opacity:0.7;">${counts[key]}</span>
    </button>`;

  tab.innerHTML = `
    <div style="max-width:1200px; margin:0 auto; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
        <div>
          <h2 style="margin:0; font-size:19px; font-weight:600;">🔍 批量订单验货单</h2>
          <div style="font-size:12.5px; color:var(--text-tertiary); margin-top:3px;">给工厂的验货标准 · 工厂按此验货 · 留底供售后追溯</div>
        </div>
        <button class="btn primary" onclick="inspOpenEdit()" style="font-size:13px;">➕ 新建验货单</button>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
        ${subTab('all', '全部')}
        ${subTab('ordered', '📝 已下单')}
        ${subTab('pending', '⏳ 待验货')}
        ${subTab('done', '✅ 已完成')}
      </div>

      ${list.length === 0
        ? `<div style="padding:60px; text-align:center; color:var(--text-tertiary);">
             <div style="font-size:40px; margin-bottom:12px;">🔍</div>
             <div>暂无验货单 · 点「➕ 新建验货单」开始</div>
           </div>`
        : `<div style="display:grid; gap:12px;">${list.map(inspCardHtml).join('')}</div>`
      }
    </div>
  `;
}

function inspSetFilter(f) { INSPECTION._filter = f; inspRenderList(); }
window.inspSetFilter = inspSetFilter;

function inspCardHtml(it) {
  const st = INSP_STATUS[it.status] || INSP_STATUS.ordered;
  const imgs = Array.isArray(it.images) ? it.images : [];
  const firstImg = imgs[0]?.url || '';
  const reqBadges = [];
  if (it.standard) reqBadges.push(`🏷 ${escapeHtml(it.standard)}`);
  if (it.voltage) reqBadges.push(`⚡ ${escapeHtml(it.voltage)}`);
  if (it.color_temp) reqBadges.push(`🌡 ${escapeHtml(it.color_temp)}`);
  if (it.need_sample) reqBadges.push(`📐 首样`);
  if (it.need_manual_en) reqBadges.push(`📄 英文说明书`);

  return `
    <div onclick="inspOpenEdit('${it.id}')"
         style="background:var(--bg-card); border:1px solid var(--border); border-radius:12px; padding:14px; cursor:pointer; display:flex; gap:14px; transition:box-shadow .15s;"
         onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
      ${firstImg
        ? `<img src="${escapeHtml(firstImg)}" style="width:88px; height:88px; object-fit:cover; border-radius:8px; flex-shrink:0;">`
        : `<div style="width:88px; height:88px; border-radius:8px; background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0;">💡</div>`
      }
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
          <span style="font-weight:600; font-size:15px;">${escapeHtml(it.order_no || '(无订单号)')}</span>
          <span style="font-size:11px; padding:2px 8px; border-radius:10px; background:${st.color}1a; color:${st.color}; font-weight:600;">${st.icon} ${st.label}</span>
          ${imgs.length > 1 ? `<span style="font-size:11px; color:var(--text-tertiary);">📷 ${imgs.length} 图</span>` : ''}
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:6px;">
          🏭 ${escapeHtml(it.supplier_name || '—')} · 📦 ${it.order_qty || '?'} 件 · 🌍 ${escapeHtml(it.country || '—')}
        </div>
        ${reqBadges.length > 0 ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">${reqBadges.map(b => `<span style="font-size:11px; padding:2px 7px; border-radius:6px; background:var(--bg-elevated); color:var(--text-secondary);">${b}</span>`).join('')}</div>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end; flex-shrink:0;">
        <button class="btn small primary" onclick="event.stopPropagation(); inspPreview('${it.id}')" title="预览验货单 · 可导出">👁 预览/导出</button>
      </div>
    </div>
  `;
}

// ─────────────── 新建/编辑 modal ───────────────
function inspOpenEdit(id) {
  // 预加载供应商库
  if (typeof SUPPLIERS !== 'undefined' && SUPPLIERS.loadAll) SUPPLIERS.loadAll().catch(() => {});

  const it = id ? INSPECTION._list.find(x => x.id === id) : null;
  INSPECTION._editing = it ? JSON.parse(JSON.stringify(it)) : {
    order_no: '', supplier_id: null, supplier_name: '', order_qty: '',
    country: '美国', standard: '美标', voltage: '', color_temp: '', light_source: 'LED',
    label_req: '', need_sample: false, need_manual_en: false,
    packing_method: '', other_req: '', images: [], status: 'ordered',
    inspect_result: '', inspect_note: '', inspect_images: [],
  };
  inspRenderEditModal();
  document.getElementById('inspEditModal')?.classList.add('show');
  // V28o:挂全局粘贴监听(modal 打开时 · 整个 modal 内 Ctrl+V 都能贴图 · 不用先点聚焦)
  _inspPasteHandler = (e) => {
    const modal = document.getElementById('inspEditModal');
    if (!modal || !modal.classList.contains('show')) return;
    inspPasteImg(e);
  };
  document.addEventListener('paste', _inspPasteHandler);
}
let _inspPasteHandler = null;
window.inspOpenEdit = inspOpenEdit;

function inspRenderEditModal() {
  const d = INSPECTION._editing;
  if (!d) return;
  const isEdit = !!d.id;
  const body = document.getElementById('inspEditBody');
  if (!body) return;

  const field = (label, html, req) => `<div style="margin-bottom:14px;"><label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">${label}${req ? ' <span style="color:var(--danger);">*</span>' : ''}</label>${html}</div>`;
  const inpStyle = 'width:100%; padding:9px 11px; border:1px solid var(--border); border-radius:7px; font-size:13px; box-sizing:border-box; background:var(--bg-card);';
  const inp = (key, ph = '', type = 'text') => `<input type="${type}" value="${escapeHtml(d[key] ?? '')}" oninput="inspSetField('${key}', this.value)" placeholder="${ph}" style="${inpStyle}">`;
  const sectionStyle = 'background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:10px; padding:16px; margin-bottom:14px;';
  const sectionTitle = (icon, t) => `<div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:14px; display:flex; align-items:center; gap:6px;">${icon} ${t}</div>`;

  // 国家下拉(可手填)
  const countryOpts = INSP_COUNTRIES.map(c => `<option value="${c}" ${d.country === c ? 'selected' : ''}>${c}</option>`).join('');
  const stdOpts = INSP_STANDARDS.map(s => `<option value="${s}" ${d.standard === s ? 'selected' : ''}>${s}</option>`).join('');

  // 状态做成按钮组
  const statusBtns = Object.entries(INSP_STATUS).map(([k, v]) => `
    <button onclick="inspSetField('status','${k}'); inspRenderEditModal();"
      style="flex:1; padding:9px; border-radius:8px; cursor:pointer; font-size:12.5px; font-weight:600; border:1.5px solid ${d.status === k ? v.color : 'var(--border)'};
             background:${d.status === k ? v.color + '15' : 'var(--bg-card)'}; color:${d.status === k ? v.color : 'var(--text-secondary)'};">
      ${v.icon} ${v.label}
    </button>`).join('');

  const imgs = Array.isArray(d.images) ? d.images : [];
  const imgCells = imgs.map((im, i) => im._uploading
    ? `<div style="width:84px;height:84px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;">⏳</div>`
    : `<div style="position:relative;width:84px;height:84px;">
         <img src="${escapeHtml(im.url)}" style="width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${escapeHtml(im.url)}','_blank')">
         <button onclick="inspRemoveImg(${i})" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--danger);color:#fff;border:0;font-size:11px;cursor:pointer;line-height:1;">✕</button>
       </div>`
  ).join('');

  const chk = (key, label) => `
    <label style="display:flex; align-items:center; gap:7px; cursor:pointer; font-size:13px; padding:9px 14px; border-radius:8px; border:1.5px solid ${d[key] ? 'var(--accent)' : 'var(--border)'}; background:${d[key] ? 'var(--accent)10' : 'var(--bg-card)'}; flex:1;">
      <input type="checkbox" ${d[key] ? 'checked' : ''} onchange="inspSetField('${key}', this.checked); inspRenderEditModal();" style="width:15px;height:15px;"> ${label}
    </label>`;

  body.innerHTML = `
    <!-- 状态 · 顶部按钮组 -->
    <div style="display:flex; gap:8px; margin-bottom:16px;">${statusBtns}</div>

    <!-- 区1:基础信息 -->
    <div style="${sectionStyle}">
      ${sectionTitle('📋', '基础信息')}
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
        ${field('订单编号', inp('order_no', '如 AL-1032'), true)}
        ${field('订单数量', inp('order_qty', '如 55', 'number'))}
      </div>
      ${field('供应商', `
        <div style="position:relative;">
          <input type="text" id="inspSupplierInput" value="${escapeHtml(d.supplier_name || '')}"
                 oninput="inspSupplierSearch(this.value)" placeholder="输入供应商名(从供应商库搜索 · 也可自定义)"
                 style="${inpStyle}" autocomplete="off">
          <div id="inspSupplierDropdown" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:50; background:var(--bg-card); border:1px solid var(--border); border-radius:7px; max-height:200px; overflow-y:auto; box-shadow:0 4px 16px rgba(0,0,0,0.12); margin-top:2px;"></div>
        </div>
      `, true)}
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:0;">
        ${field('目的国家', `<select onchange="inspSetField('country', this.value)" style="${inpStyle}">
          ${countryOpts}<option value="__custom__">+ 自定义国家</option>
        </select>
        <input type="text" id="inspCustomCountry" value="${INSP_COUNTRIES.includes(d.country) ? '' : escapeHtml(d.country || '')}"
               oninput="inspSetField('country', this.value)" placeholder="自定义国家名"
               style="${inpStyle} margin-top:6px; ${INSP_COUNTRIES.includes(d.country) ? 'display:none;' : ''}">`)}
        ${field('标准', `<select onchange="inspSetField('standard', this.value)" style="${inpStyle}">${stdOpts}<option value="__custom__">+ 自定义</option></select>`)}
      </div>
    </div>

    <!-- 区2:规格要求 -->
    <div style="${sectionStyle}">
      ${sectionTitle('⚡', '规格要求')}
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:0;">
        ${field('电压', inp('voltage', '如 220V'))}
        ${field('色温', inp('color_temp', '如 3000K'))}
        ${field('光源', inp('light_source', '如 LED'))}
      </div>
    </div>

    <!-- 区3:验货要求 -->
    <div style="${sectionStyle}">
      ${sectionTitle('✅', '验货要求')}
      ${field('要求 / 标签', `<textarea oninput="inspSetField('label_req', this.value)" rows="2" placeholder="如:产品标 QC · 地线标 LN · 箱唛标" style="${inpStyle} resize:vertical;">${escapeHtml(d.label_req || '')}</textarea>`)}
      <div style="display:flex; gap:12px; margin-bottom:14px;">
        ${chk('need_sample', '📐 要做首样')}
        ${chk('need_manual_en', '📄 放英文说明书')}
      </div>
      ${field('纸箱打包数量', inp('packing_method', '如 10+10+10+10+10+5'))}
      ${field('客户其他要求', `<textarea oninput="inspSetField('other_req', this.value)" rows="2" placeholder="如:电线外漏2米 · 弹簧卡扣底盘需要白色的" style="${inpStyle} resize:vertical; margin-bottom:0;">${escapeHtml(d.other_req || '')}</textarea>`)}
    </div>

    <!-- 区4:灯具图片 -->
    <div style="${sectionStyle} margin-bottom:0;">
      ${sectionTitle('💡', '灯具图片(支持复制粘贴 / 上传多张)')}
      <div id="inspImgArea" tabindex="0" onpaste="inspPasteImg(event)"
           style="border:1.5px dashed var(--border); border-radius:8px; padding:14px; outline:none; background:var(--bg-card);">
        ${imgs.length ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">${imgCells}</div>` : ''}
        <div style="display:flex; align-items:center; gap:10px; justify-content:center; ${imgs.length ? '' : 'padding:8px 0;'}">
          <label class="btn small primary" style="cursor:pointer;">📎 上传图片(可多选)<input type="file" accept="image/*" multiple style="display:none;" onchange="inspPickImgs(this)"></label>
          <span style="font-size:11.5px; color:var(--text-tertiary);">或直接 Ctrl+V 粘贴截图 · 支持多张</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('inspEditTitle').textContent = isEdit ? '✏️ 编辑验货单' : '➕ 新建验货单';
  document.getElementById('inspDeleteBtn').style.display = isEdit ? '' : 'none';
}

function inspSetField(key, val) {
  if (!INSPECTION._editing) return;
  INSPECTION._editing[key] = val;
  // 国家自定义切换
  if (key === 'country') {
    const custom = document.getElementById('inspCustomCountry');
    if (val === '__custom__' && custom) {
      custom.style.display = '';
      INSPECTION._editing.country = '';
      custom.focus();
    }
  }
  if (key === 'standard' && val === '__custom__') {
    INSPECTION._editing.standard = '';
  }
}
window.inspSetField = inspSetField;

// ─────────────── 供应商搜索(从供应商库) ───────────────
function inspSupplierSearch(q) {
  INSPECTION._editing.supplier_name = q;
  INSPECTION._editing.supplier_id = null;  // 改名后先清 id · 选中时再赋
  const dd = document.getElementById('inspSupplierDropdown');
  if (!dd) return;
  if (!q || !q.trim()) { dd.style.display = 'none'; return; }
  const matches = (typeof SUPPLIERS !== 'undefined' && SUPPLIERS.search) ? SUPPLIERS.search(q).slice(0, 8) : [];
  // search 返回的可能是 {s, score} 或直接 supplier · 兼容
  const sups = matches.map(m => m.s || m);
  if (sups.length === 0) {
    dd.innerHTML = `<div style="padding:10px; font-size:12px; color:var(--text-tertiary);">无匹配 · 将作为自定义供应商「${escapeHtml(q)}」</div>`;
    dd.style.display = '';
    return;
  }
  dd.innerHTML = sups.map(s => `
    <div onclick="inspPickSupplier('${s.id}', '${escapeHtml(s.name).replace(/'/g, "\\'")}')"
         style="padding:9px 12px; cursor:pointer; font-size:13px; border-bottom:1px solid var(--border-subtle);"
         onmouseover="this.style.background='var(--bg-elevated)'" onmouseout="this.style.background='transparent'">
      🏭 ${escapeHtml(s.name)}
    </div>
  `).join('');
  dd.style.display = '';
}
window.inspSupplierSearch = inspSupplierSearch;

function inspPickSupplier(id, name) {
  INSPECTION._editing.supplier_id = id;
  INSPECTION._editing.supplier_name = name;
  const inputEl = document.getElementById('inspSupplierInput');
  if (inputEl) inputEl.value = name;
  document.getElementById('inspSupplierDropdown').style.display = 'none';
}
window.inspPickSupplier = inspPickSupplier;

// ─────────────── 图片上传(复用 po-screenshots 桶) ───────────────
async function _inspUploadImg(file) {
  const compressed = await _inspCompress(file);
  const ext = (compressed.type && compressed.type.includes('png')) ? 'png' : 'jpg';
  // V28o2: 用跟 issues 一致的路径前缀(CURRENT_USER_ID/)· 绕过 po-screenshots 桶的 RLS
  const uid = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? CURRENT_USER_ID : 'inspection';
  const path = `${uid}/insp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('po-screenshots').upload(path, compressed, { upsert: false, contentType: compressed.type });
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from('po-screenshots').getPublicUrl(path);
  return { url: publicUrl, name: file.name };
}

function _inspCompress(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const max = 1600; let { width, height } = img;
        if (width > max || height > max) {
          if (width > height) { height = height * max / width; width = max; }
          else { width = width * max / height; height = max; }
        }
        const cv = document.createElement('canvas');
        cv.width = width; cv.height = height;
        cv.getContext('2d').drawImage(img, 0, 0, width, height);
        cv.toBlob(b => resolve(b || file), 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function inspPickImgs(input) {
  const files = [...(input.files || [])];
  input.value = '';
  for (const f of files) { if (f.type.startsWith('image/')) await _inspAddImg(f); }
}
window.inspPickImgs = inspPickImgs;

async function inspPasteImg(e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      e.preventDefault();
      const f = it.getAsFile();
      if (f) await _inspAddImg(f);
      return;
    }
  }
}
window.inspPasteImg = inspPasteImg;

async function _inspAddImg(file) {
  if (!INSPECTION._editing.images) INSPECTION._editing.images = [];
  const ph = { url: '', name: file.name, _uploading: true };
  INSPECTION._editing.images.push(ph);
  inspRenderEditModal();
  try {
    const att = await _inspUploadImg(file);
    const idx = INSPECTION._editing.images.indexOf(ph);
    if (idx >= 0) INSPECTION._editing.images[idx] = att;
    toast('✓ 图片已上传', 'success', 1200);
  } catch (err) {
    const idx = INSPECTION._editing.images.indexOf(ph);
    if (idx >= 0) INSPECTION._editing.images.splice(idx, 1);
    toast('上传失败:' + (err.message || err), 'err', 4000);
  }
  inspRenderEditModal();
}

function inspRemoveImg(i) {
  INSPECTION._editing.images.splice(i, 1);
  inspRenderEditModal();
}
window.inspRemoveImg = inspRemoveImg;

// ─────────────── 保存 / 删除 ───────────────
async function inspSave() {
  const d = INSPECTION._editing;
  if (!d) return;
  if (!d.order_no && !d.supplier_name) { toast('至少填订单号或供应商', 'warn'); return; }
  // 过滤上传中的图
  const images = (d.images || []).filter(im => im.url && !im._uploading).map(im => ({ url: im.url, name: im.name }));
  const me = (typeof CURRENT_AGENT !== 'undefined') ? CURRENT_AGENT : 'system';

  const payload = {
    order_no: d.order_no || null,
    supplier_id: d.supplier_id || null,
    supplier_name: d.supplier_name || null,
    order_qty: d.order_qty ? parseInt(d.order_qty) : null,
    country: d.country || null,
    standard: d.standard || null,
    voltage: d.voltage || null,
    color_temp: d.color_temp || null,
    light_source: d.light_source || null,
    label_req: d.label_req || null,
    need_sample: !!d.need_sample,
    need_manual_en: !!d.need_manual_en,
    packing_method: d.packing_method || null,
    other_req: d.other_req || null,
    images: images,
    status: d.status || 'ordered',
    updated_at: new Date().toISOString(),
  };

  try {
    if (d.id) {
      const { error } = await sb.from('inspection_sheets').update(payload).eq('id', d.id);
      if (error) throw error;
      toast('✓ 验货单已更新', 'success');
    } else {
      payload.created_by = me;
      const { error } = await sb.from('inspection_sheets').insert(payload);
      if (error) throw error;
      toast('✓ 验货单已创建', 'success');
    }
    inspCloseEdit();
    await inspLoadAll();
    inspRenderList();
  } catch (e) {
    console.error('[验货单] 保存失败:', e);
    toast('保存失败:' + (e.message || e), 'err', 5000);
  }
}
window.inspSave = inspSave;

async function inspDelete() {
  const d = INSPECTION._editing;
  if (!d || !d.id) return;
  if (!confirm('确认删除这张验货单?(可恢复 · 软删除)')) return;
  try {
    const { error } = await sb.from('inspection_sheets').update({ deleted_at: new Date().toISOString() }).eq('id', d.id);
    if (error) throw error;
    toast('已删除', 'success');
    inspCloseEdit();
    await inspLoadAll();
    inspRenderList();
  } catch (e) {
    toast('删除失败:' + (e.message || e), 'err');
  }
}
window.inspDelete = inspDelete;

function inspCloseEdit() {
  document.getElementById('inspEditModal')?.classList.remove('show');
  INSPECTION._editing = null;
  // V28o:卸载全局粘贴监听
  if (_inspPasteHandler) { document.removeEventListener('paste', _inspPasteHandler); _inspPasteHandler = null; }
}
window.inspCloseEdit = inspCloseEdit;

// ─────────────── 导出(图片 / PDF) ───────────────
// 生成验货单的标准 HTML(图片版和 PDF 共用)
function _inspBuildExportHtml(it) {
  const imgs = Array.isArray(it.images) ? it.images : [];
  const st = INSP_STATUS[it.status] || INSP_STATUS.ordered;
  const row = (label, val, highlight) => `
    <tr>
      <td style="border:1px solid #333; padding:11px 14px; background:#f0f0f0; font-weight:700; width:140px; white-space:nowrap; font-size:14px;">${label}</td>
      <td style="border:1px solid #333; padding:11px 14px; font-size:14px; ${highlight ? 'color:#c0392b; font-weight:600;' : ''}">${val || '—'}</td>
    </tr>`;

  // 图片区:1 张占满 · 2-4 张网格 · 更多滚动
  const imgGrid = imgs.length === 0
    ? '<div style="color:#999; text-align:center; padding:80px 20px; border:1px dashed #ccc; border-radius:6px;">暂无灯具图片</div>'
    : imgs.length === 1
      ? `<img src="${escapeHtml(imgs[0].url)}" crossorigin="anonymous" style="width:100%; border:1px solid #ccc; border-radius:6px; display:block;">`
      : `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
           ${imgs.map(im => `<img src="${escapeHtml(im.url)}" crossorigin="anonymous" style="width:100%; aspect-ratio:1; object-fit:cover; border:1px solid #ccc; border-radius:6px; display:block;">`).join('')}
         </div>`;

  return `
    <div style="font-family:'Microsoft YaHei',sans-serif; width:820px; padding:32px; background:#fff; color:#1a1a1a; box-sizing:border-box;">
      <!-- 标题 -->
      <div style="text-align:center; margin-bottom:20px; padding-bottom:16px; border-bottom:3px double #333;">
        <div style="font-size:24px; font-weight:800; letter-spacing:2px;">批量订单验货单</div>
        <div style="font-size:13px; color:#666; margin-top:6px;">工厂验货标准 · 请严格按此执行 &nbsp;|&nbsp; 状态:${st.label}</div>
      </div>

      <div style="display:flex; gap:24px; align-items:flex-start;">
        <!-- 左:信息表 -->
        <div style="flex:1.15; min-width:0;">
          <div style="font-size:16px; font-weight:700; margin-bottom:10px; padding:8px 0; border-bottom:2px solid #333;">📋 订单注意事项</div>
          <table style="width:100%; border-collapse:collapse;">
            ${row('订单号', escapeHtml(it.order_no || ''))}
            ${row('供应商', escapeHtml(it.supplier_name || ''))}
            ${row('订单数量', it.order_qty ? it.order_qty + ' 件' : '')}
            ${row('目的国家', escapeHtml(it.country || ''))}
            ${row('标准', escapeHtml(it.standard || ''))}
            ${row('光源 / 色温 / 电压', [it.light_source, it.color_temp, it.voltage].filter(Boolean).join(' / '))}
            ${row('要求 / 标签', escapeHtml(it.label_req || ''))}
            ${row('是否做首样', it.need_sample ? '✅ 是' : '否', it.need_sample)}
            ${row('放英文说明书', it.need_manual_en ? '✅ 是' : '否', it.need_manual_en)}
            ${row('纸箱打包数量', escapeHtml(it.packing_method || ''))}
            ${row('客户其他要求', escapeHtml(it.other_req || ''), !!it.other_req)}
          </table>
          <div style="margin-top:24px; display:flex; gap:40px; font-size:14px; color:#333;">
            <div>跟单:________________</div>
            <div>产线:________________</div>
          </div>
          <div style="margin-top:8px; font-size:12px; color:#999;">制表日期:${new Date(it.created_at || Date.now()).toLocaleDateString('zh-CN')}</div>
        </div>

        <!-- 右:灯具图片 -->
        <div style="flex:1; min-width:0;">
          <div style="font-size:16px; font-weight:700; margin-bottom:10px; padding:8px 0; border-bottom:2px solid #333;">💡 灯具图片</div>
          ${imgGrid}
        </div>
      </div>
    </div>
  `;
}

// V28o:预览验货单(弹 modal 显示效果 · 里面放导出按钮)
let _inspPreviewId = null;
let _inspPreviewPasteHandler = null;

function inspPreview(id) {
  const it = INSPECTION._list.find(x => x.id === id);
  if (!it) return;
  const modal = document.getElementById('inspPreviewModal');
  if (!modal) return;
  _inspPreviewId = id;
  modal.dataset.sheetId = id;
  inspRenderPreview();
  modal.classList.add('show');
  // V28o4:预览里也能粘贴加图(全局监听 · modal 开着时生效)
  _inspPreviewPasteHandler = (e) => {
    const m = document.getElementById('inspPreviewModal');
    if (!m || !m.classList.contains('show')) return;
    inspPreviewPaste(e);
  };
  document.addEventListener('paste', _inspPreviewPasteHandler);
}
window.inspPreview = inspPreview;

function inspRenderPreview() {
  const it = INSPECTION._list.find(x => x.id === _inspPreviewId);
  const body = document.getElementById('inspPreviewBody');
  if (!it || !body) return;
  const imgs = Array.isArray(it.images) ? it.images : [];
  // 图片管理条(预览顶部 · 可加/删图)
  const thumbStrip = `
    <div style="width:100%; max-width:820px; margin:0 auto 14px; background:#fff; border-radius:8px; padding:12px; box-sizing:border-box;">
      <div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:600;">📷 灯具图片(直接 Ctrl+V 粘贴 / 上传 · 实时保存)</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        ${imgs.map((im, i) => im._uploading
          ? `<div style="width:64px;height:64px;border-radius:6px;background:#eee;display:flex;align-items:center;justify-content:center;">⏳</div>`
          : `<div style="position:relative;width:64px;height:64px;">
               <img src="${escapeHtml(im.url)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #ddd;">
               <button onclick="inspPreviewRemoveImg(${i})" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:0;font-size:11px;cursor:pointer;line-height:1;">✕</button>
             </div>`).join('')}
        <label style="width:64px;height:64px;border:1.5px dashed #bbb;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:#888;gap:2px;">
          <span style="font-size:18px;">+</span>上传
          <input type="file" accept="image/*" multiple style="display:none;" onchange="inspPreviewPickImgs(this)">
        </label>
      </div>
    </div>`;
  body.innerHTML = thumbStrip + _inspBuildExportHtml(it);
}

function inspClosePreview() {
  document.getElementById('inspPreviewModal')?.classList.remove('show');
  _inspPreviewId = null;
  if (_inspPreviewPasteHandler) { document.removeEventListener('paste', _inspPreviewPasteHandler); _inspPreviewPasteHandler = null; }
}
window.inspClosePreview = inspClosePreview;

// 预览里上传/粘贴/删图 · 直接存库
async function _inspPreviewAddImg(file) {
  const it = INSPECTION._list.find(x => x.id === _inspPreviewId);
  if (!it) return;
  if (!Array.isArray(it.images)) it.images = [];
  const ph = { url: '', name: file.name, _uploading: true };
  it.images.push(ph);
  inspRenderPreview();
  try {
    const att = await _inspUploadImg(file);
    const idx = it.images.indexOf(ph);
    if (idx >= 0) it.images[idx] = att;
    // 实时存库
    await sb.from('inspection_sheets').update({ images: it.images.filter(im => im.url), updated_at: new Date().toISOString() }).eq('id', it.id);
    toast('✓ 图片已加并保存', 'success', 1500);
  } catch (err) {
    const idx = it.images.indexOf(ph);
    if (idx >= 0) it.images.splice(idx, 1);
    toast('上传失败:' + (err.message || err), 'err', 4000);
  }
  inspRenderPreview();
}

async function inspPreviewPickImgs(input) {
  const files = [...(input.files || [])];
  input.value = '';
  for (const f of files) { if (f.type.startsWith('image/')) await _inspPreviewAddImg(f); }
}
window.inspPreviewPickImgs = inspPreviewPickImgs;

async function inspPreviewPaste(e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      e.preventDefault();
      const f = it.getAsFile();
      if (f) await _inspPreviewAddImg(f);
      return;
    }
  }
}
window.inspPreviewPaste = inspPreviewPaste;

async function inspPreviewRemoveImg(i) {
  const it = INSPECTION._list.find(x => x.id === _inspPreviewId);
  if (!it || !Array.isArray(it.images)) return;
  it.images.splice(i, 1);
  inspRenderPreview();
  try {
    await sb.from('inspection_sheets').update({ images: it.images.filter(im => im.url), updated_at: new Date().toISOString() }).eq('id', it.id);
  } catch (e) { toast('保存失败', 'err'); }
}
window.inspPreviewRemoveImg = inspPreviewRemoveImg;

async function inspExportImage(id) {
  const it = INSPECTION._list.find(x => x.id === id);
  if (!it) return;
  toast('正在生成图片…', 'info', 1500);
  // 用 html2canvas(若没加载则提示)
  if (typeof html2canvas === 'undefined') {
    await _inspLoadHtml2Canvas();
  }
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed; left:-9999px; top:0;';
  wrap.innerHTML = _inspBuildExportHtml(it);
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap.firstElementChild, { useCORS: true, scale: 2, backgroundColor: '#fff' });
    const link = document.createElement('a');
    link.download = `验货单_${it.order_no || it.supplier_name || 'sheet'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('✓ 图片已导出', 'success');
  } catch (e) {
    toast('导出失败:' + (e.message || e) + ' · 图片可能跨域 · 试试 PDF', 'err', 5000);
  } finally {
    document.body.removeChild(wrap);
  }
}
window.inspExportImage = inspExportImage;

async function inspExportPDF(id) {
  const it = INSPECTION._list.find(x => x.id === id);
  if (!it) return;
  // 用浏览器打印为 PDF(最稳 · 不依赖库)
  const html = _inspBuildExportHtml(it);
  const w = window.open('', '_blank');
  if (!w) { toast('请允许弹窗', 'warn'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>验货单_${escapeHtml(it.order_no || '')}</title></head>
    <body style="margin:0;">${html}
    <script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>
    </body></html>`);
  w.document.close();
  toast('在打印窗口选「另存为 PDF」', 'info', 3000);
}
window.inspExportPDF = inspExportPDF;

function _inspLoadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (typeof html2canvas !== 'undefined') return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// 点空白关供应商下拉
document.addEventListener('click', (e) => {
  if (!e.target.closest('#inspSupplierInput') && !e.target.closest('#inspSupplierDropdown')) {
    const dd = document.getElementById('inspSupplierDropdown');
    if (dd) dd.style.display = 'none';
  }
});
