// ============================================================
// 跟单团队工作台 · po.js
// 采购单(PO) + 产品维护 + 同款绑定 + 自定义 PO
// ============================================================
// 依赖：core.js · utils.js · shopify.js
// ============================================================

// ============ 自定义采购单（不基于销售单，线下/补货/定制） ============
let CUSTOM_PO_STATE = null;
async function openCustomPoModal() {
  // 确保供应商列表已加载
  await SUPPLIERS.loadAll();
  // V20260527s: 预加载产品库(供 SKU 在库提示用 · 不阻塞 modal 打开)
  if (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.loadAll) {
    PRODUCTS_CACHE.loadAll().catch(() => {});
  }
  const today = new Date().toISOString().slice(0, 10);
  CUSTOM_PO_STATE = {
    supplierName: '',
    supplierId: null,
    promisedDate: today,
    boxNote: '',
    otherNote: '',
    lineItems: [
      { id: 'cpo-1', sku: '', title: '', variant: '', image_url: '', qty: 1, price: 0, note: '' }
    ],
  };
  document.getElementById('customPoModal').style.display = 'flex';
  renderCustomPo();
}

function closeCustomPoModal() {
  document.getElementById('customPoModal').style.display = 'none';
  CUSTOM_PO_STATE = null;
}

function renderCustomPo() {
  const s = CUSTOM_PO_STATE;
  const body = document.getElementById('customPoBody');
  const lineItemsHtml = s.lineItems.map((li, i) => `
    <div style="border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:8px; padding:0;">
      <div style="display:grid; grid-template-columns: 90px 1fr 80px 90px 90px 36px; gap:8px; padding:10px; align-items:start;">
      <div data-li-img="${li.id}">
        ${li.image_url ? `<img src="${escapeHtml(li.image_url)}" style="width:90px; height:90px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="cpoEditLineImage('${li.id}')">` : `<div onclick="cpoEditLineImage('${li.id}')" style="width:90px; height:90px; border:2px dashed var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-tertiary); font-size:11px; text-align:center;">📷<br>添加图片</div>`}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <input type="text" placeholder="SKU * (如 VKW-XX 或 CUSTOM-001)" value="${escapeHtml(li.sku)}" oninput="cpoSetLine('${li.id}','sku',this.value)" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
        <input type="text" placeholder="产品中文名 *" value="${escapeHtml(li.title)}" oninput="cpoSetLine('${li.id}','title',this.value)" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
        <input type="text" placeholder="变体/规格（如 80cm 黑色）" value="${escapeHtml(li.variant)}" oninput="cpoSetLine('${li.id}','variant',this.value)" style="width:100%; padding:6px 8px; font-size:12px; border:1px solid var(--border); border-radius:5px;">
        <!-- V5-W3-2026-05-26: Custom PO 也加 per-line 备注(跟单填,会进打印件的"备注"列)-->
        <div style="display:flex; gap:6px; align-items:center;">
          <span style="font-size:10.5px; color:var(--text-secondary); font-weight:500; flex-shrink:0; min-width:60px;">📝 本行备注:</span>
          <input type="text" placeholder="尺寸/色温/特殊要求/电气标准等(可选)" 
            value="${escapeHtml(li.note || '')}" 
            oninput="cpoSetLine('${li.id}','note',this.value)" 
            style="flex:1; padding:5px 8px; font-size:11px; border:1px solid var(--border); border-radius:4px; background:var(--bg-card);">
        </div>
      </div>
      <input type="number" min="1" placeholder="数量" value="${li.qty}" oninput="cpoSetLine('${li.id}','qty',this.value); updateCpoTotal();" style="width:100%; padding:6px 8px; font-size:13px; border:1px solid var(--border); border-radius:5px; text-align:center; ${Number(li.qty) >= 2 ? 'background:rgba(220,38,38,0.08); border:2px solid #dc2626; color:#dc2626; font-weight:700;' : ''}">
      <input type="number" min="0" step="0.01" placeholder="单价" value="${li.price}" oninput="cpoSetLine('${li.id}','price',this.value); updateCpoTotal();" style="width:100%; padding:6px 8px; font-size:13px; border:1px solid var(--border); border-radius:5px; text-align:center;">
      <div style="text-align:right; font-family:monospace; font-size:12px; align-self:center;" data-li-subtotal="${li.id}">${(Number(li.qty) * Number(li.price)).toFixed(2)}</div>
      <button class="btn small" onclick="cpoRemoveLine('${li.id}')" style="align-self:center; ${s.lineItems.length <= 1 ? 'opacity:0.4; pointer-events:none;' : 'color:var(--danger);'}" title="${s.lineItems.length <= 1 ? '至少需要一行' : '删除此行'}">✕</button>
      </div>
      <!-- V20260527s: 供应商提示区(SKU 在库时显示) -->
      <div data-li-supplier-hint="${li.id}" style="padding:0 10px 8px; display:none;"></div>
    </div>
  `).join('');

  body.innerHTML = `
    <div style="background: rgba(37,99,235,0.06); padding: 10px 12px; border-radius: 6px; border-left: 3px solid var(--accent); font-size: 12px; color: var(--text-secondary); margin-bottom: 14px;">
      💡 用于不通过销售单的采购：补货、备货、定制单、线下采购等。<br>
      保存后会出现在采购单列表里，可正常走审批/发供应商/到货/入库全流程。
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">供应商 <span style="color:var(--danger);">*</span></label>
        <div style="display:flex; gap:6px; position:relative;">
          <input type="text" id="cpoSupplierInput" value="${escapeHtml(s.supplierName)}" placeholder="🔍 输入供应商名搜索 / 直接添加..." 
            oninput="cpoSupplierSearch(this.value)" onfocus="cpoSupplierSearch(this.value)" onblur="setTimeout(()=>document.getElementById('cpoSupplierResults').style.display='none', 200)"
            style="flex:1; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
          <button class="btn small" onclick="cpoAddNewSupplier()" style="font-size:11px;">+ 新增</button>
          <div id="cpoSupplierResults" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:10; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; max-height:240px; overflow-y:auto; box-shadow:var(--shadow-md); margin-top:4px;"></div>
        </div>
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">下单日期 <span style="color:var(--danger);">*</span></label>
        <input type="date" value="${s.promisedDate}" oninput="CUSTOM_PO_STATE.promisedDate=this.value" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">订单备注（写在纸箱上，供应商对单用）</label>
      <input type="text" value="${escapeHtml(s.boxNote)}" oninput="CUSTOM_PO_STATE.boxNote=this.value" placeholder="例：备货 / 美规110V电压 / 客户编号 XX" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
    </div>

    <div style="margin-bottom: 16px;">
      <h4 style="margin: 0 0 8px; font-size: 13px; color: var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
        <span>🛒 产品明细</span>
        <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">总金额: <b id="cpoTotalDisplay" style="color:var(--accent); font-family:monospace; font-size:14px;">¥ 0.00</b></span>
      </h4>
      <div style="background: var(--bg-elevated); padding: 8px 10px; border-radius: 6px 6px 0 0; display: grid; grid-template-columns: 90px 1fr 80px 90px 90px 36px; gap: 8px; font-size: 10px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">
        <div>图片</div><div>SKU/名称/变体</div><div style="text-align:center;">数量</div><div style="text-align:center;">单价¥</div><div style="text-align:right;">小计</div><div></div>
      </div>
      <div id="cpoLineItemsContainer">${lineItemsHtml}</div>
      <button class="btn small" onclick="cpoAddLine()" style="margin-top: 4px;">+ 添加产品行</button>
      <div id="cpoApprovalWarning" style="margin-top:10px;"></div>
    </div>

    <div style="margin-bottom: 16px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:3px;">其他备注（可选）</label>
      <textarea oninput="CUSTOM_PO_STATE.otherNote=this.value" rows="3" placeholder="例：尺寸 80cm / 暖光 3000K / 包装要求等" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); resize:vertical; font-family:inherit;">${escapeHtml(s.otherNote)}</textarea>
    </div>
  `;
  updateCpoTotal();
  // V20260527s: 初次渲染后,为已有 SKU 的行触发供应商提示
  setTimeout(() => {
    s.lineItems.forEach(li => {
      if ((li.sku || '').trim() && typeof _cpoUpdateLineSupplierHint === 'function') {
        _cpoUpdateLineSupplierHint(li);
      }
    });
  }, 0);
}

function cpoSetLine(id, field, val) {
  const li = CUSTOM_PO_STATE.lineItems.find(x => x.id === id);
  if (!li) return;
  if (field === 'qty') li[field] = parseInt(val) || 0;
  else if (field === 'price') li[field] = parseFloat(val) || 0;
  else li[field] = val;
  const subEl = document.querySelector(`[data-li-subtotal="${id}"]`);
  if (subEl) subEl.textContent = (Number(li.qty) * Number(li.price)).toFixed(2);
  // V20260527s: SKU 变化 → 查产品库 → 提示已有供应商(debounce 250ms)
  if (field === 'sku') {
    if (li._supHintTimer) clearTimeout(li._supHintTimer);
    li._supHintTimer = setTimeout(() => _cpoUpdateLineSupplierHint(li), 250);
  }
}

// V20260527s: 异步查产品库 + 渲染供应商提示
async function _cpoUpdateLineSupplierHint(li) {
  const hintEl = document.querySelector(`[data-li-supplier-hint="${li.id}"]`);
  if (!hintEl) return;
  const sku = (li.sku || '').trim();
  if (!sku) { hintEl.innerHTML = ''; hintEl.style.display = 'none'; return; }
  
  // 优先从 PRODUCTS_CACHE 找(快)· 找不到再查 DB
  let product = null;
  if (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE._all) {
    product = PRODUCTS_CACHE._all.find(p => (p.sku || '').trim() === sku);
  }
  if (!product) {
    try {
      const { data } = await sb.from('products')
        .select('id, sku, suppliers, default_supplier').eq('sku', sku).maybeSingle();
      product = data;
    } catch (_) {}
  }
  
  if (!product) {
    // 新 SKU · 提示会自动入库
    hintEl.innerHTML = `<div style="font-size:11px; color:var(--text-tertiary); padding:4px 0;">💡 新 SKU · 保存 PO 时会自动加入产品库</div>`;
    hintEl.style.display = '';
    return;
  }
  
  const supps = (typeof _getProductSuppliers === 'function') ? _getProductSuppliers(product) : [];
  if (supps.length === 0) {
    hintEl.innerHTML = `<div style="font-size:11px; color:var(--text-tertiary); padding:4px 0;">📦 此 SKU 在库 · 但还没设供应商</div>`;
    hintEl.style.display = '';
    return;
  }
  
  // 显示供应商列表 + 一键设为 PO 供应商
  const currentSup = (CUSTOM_PO_STATE.supplierName || '').trim();
  hintEl.innerHTML = `
    <div style="display:flex; align-items:center; gap:6px; padding:6px 8px; background:rgba(13,148,136,0.05); border-left:3px solid var(--teal); border-radius:0 4px 4px 0; flex-wrap:wrap;">
      <span style="font-size:11px; color:var(--text-secondary); font-weight:500;">📦 此产品已有:</span>
      ${supps.map(s => {
        const isCurrent = s.name === currentSup;
        return `<span 
          onclick="${isCurrent ? '' : `cpoUseSuggestedSupplier('${escapeHtml(s.name).replace(/'/g, "\\'")}')`}"
          style="display:inline-flex; align-items:center; gap:3px; padding:2px 8px; font-size:11px; border-radius:10px; cursor:${isCurrent ? 'default' : 'pointer'}; ${isCurrent ? 'background:var(--accent); color:white; font-weight:600;' : (s.is_default ? 'background:rgba(22,163,74,0.1); color:#15803d; border:1px solid rgba(22,163,74,0.3);' : 'background:white; color:var(--text-secondary); border:1px solid var(--border);')}"
          title="${isCurrent ? '当前已选' : '点击设为本 PO 供应商'}${s.note ? ' · ' + escapeHtml(s.note) : ''}${s.last_price ? ' · 上次 ¥' + Number(s.last_price).toFixed(2) : ''}">
          ${s.is_default && !isCurrent ? '🥇 ' : ''}${isCurrent ? '✓ ' : ''}${escapeHtml(s.name)}${s.note ? `<span style="color:var(--text-tertiary); font-weight:400;">·${escapeHtml(s.note)}</span>` : ''}
        </span>`;
      }).join('')}
    </div>
  `;
  hintEl.style.display = '';
}

// V20260527s: 点击产品行的供应商建议 → 自动填到 PO 顶部供应商字段
function cpoUseSuggestedSupplier(name) {
  if (!name || !CUSTOM_PO_STATE) return;
  const input = document.getElementById('cpoSupplierInput');
  if (input) {
    input.value = name;
    CUSTOM_PO_STATE.supplierName = name;
    // 查 SUPPLIERS 设 ID(若已存在)· 否则保存时会新增
    const found = SUPPLIERS.byName(name);
    CUSTOM_PO_STATE.supplierId = found ? found.id : null;
  }
  // 关掉下拉
  const r = document.getElementById('cpoSupplierResults');
  if (r) r.style.display = 'none';
  toast(`✓ 已设供应商「${name}」`, 'info', 1200);
  // 刷新所有行的提示(让"当前已选"高亮跟着变)
  if (CUSTOM_PO_STATE?.lineItems) {
    CUSTOM_PO_STATE.lineItems.forEach(li => _cpoUpdateLineSupplierHint(li));
  }
}
window.cpoUseSuggestedSupplier = cpoUseSuggestedSupplier;

function cpoAddLine() {
  const newId = 'cpo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  CUSTOM_PO_STATE.lineItems.push({ id: newId, sku: '', title: '', variant: '', image_url: '', qty: 1, price: 0, note: '' });
  renderCustomPo();
}

function cpoRemoveLine(id) {
  if (CUSTOM_PO_STATE.lineItems.length <= 1) return;
  CUSTOM_PO_STATE.lineItems = CUSTOM_PO_STATE.lineItems.filter(li => li.id !== id);
  renderCustomPo();
}

async function cpoEditLineImage(lineId) {
  const li = CUSTOM_PO_STATE.lineItems.find(x => x.id === lineId);
  if (!li) return;
  const result = await showPrompt({
    title: '🖼 产品图片',
    fields: [
      { key: 'img', label: '图片', value: li.image_url || '', type: 'image', hint: '上传 / 粘贴 / 拖入 / URL' },
    ],
  });
  if (result === null) return;
  li.image_url = (result.img || '').trim();
  renderCustomPo();
}

function updateCpoTotal() {
  if (!CUSTOM_PO_STATE) return;
  const total = CUSTOM_PO_STATE.lineItems.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.price) || 0), 0);
  const el = document.getElementById('cpoTotalDisplay');
  if (el) el.textContent = `¥ ${total.toFixed(2)}`;

  // 实时显示审批预警
  const hasLargeQty = CUSTOM_PO_STATE.lineItems.some(li => Number(li.qty) > 20);
  const hasLargeTotal = total > 5000;
  const warnEl = document.getElementById('cpoApprovalWarning');
  if (warnEl) {
    if (hasLargeQty || hasLargeTotal) {
      const reasons = [];
      if (hasLargeQty) reasons.push('有产品数量 > 20 件');
      if (hasLargeTotal) reasons.push('总金额 > ¥5000');
      warnEl.innerHTML = `<div style="padding:10px 14px; background:rgba(180,83,9,0.08); border-left:3px solid var(--warning); border-radius:6px;">
        <div style="font-size:13px; font-weight:600; color:var(--warning);">⚠️ 本采购单需主管审批</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:3px;">触发条件：${reasons.join('、')}。保存后状态为「待主管审批」。</div>
      </div>`;
    } else {
      warnEl.innerHTML = '';
    }
  }
}

// 供应商搜索（独立于 PO 表单）
function cpoSupplierSearch(q) {
  const matches = SUPPLIERS.search(q);
  const exists = SUPPLIERS.byName((q || '').trim());
  const results = document.getElementById('cpoSupplierResults');
  let html = matches.map(s => `
    <div class="picker-item" onmousedown="cpoPickSupplier('${s.id}', '${escapeHtml(s.name).replace(/'/g,"\\'")}')">
      <div>${escapeHtml(s.name)}</div>
      <div style="font-size:11px; color:var(--text-tertiary);">${s.contact_name ? escapeHtml(s.contact_name) + ' · ' : ''}${s.contact_phone ? escapeHtml(s.contact_phone) : ''}${s.total_orders ? ` · 共 ${s.total_orders} 单` : ''}</div>
    </div>
  `).join('');
  if (q && q.trim() && !exists) {
    html += `<div class="picker-item" style="background: rgba(37,99,235,0.04); color: var(--accent);" onmousedown="cpoAddNewSupplier()">
      <div>➕ 新增供应商「${escapeHtml(q.trim())}」</div>
      <div style="font-size:11px; color:var(--text-tertiary);">点此快速添加</div>
    </div>`;
  }
  results.innerHTML = html || '<div style="padding:10px; color:var(--text-tertiary); font-size:12px;">无匹配，请输入新供应商名</div>';
  results.style.display = 'block';
}

function cpoPickSupplier(id, name) {
  CUSTOM_PO_STATE.supplierId = id;
  CUSTOM_PO_STATE.supplierName = name;
  document.getElementById('cpoSupplierInput').value = name;
  document.getElementById('cpoSupplierResults').style.display = 'none';
}

async function cpoAddNewSupplier() {
  const input = document.getElementById('cpoSupplierInput');
  const name = (input.value || '').trim();
  if (!name) { toast('请输入供应商名', 'warn'); return; }
  const existing = SUPPLIERS.byName(name);
  if (existing) {
    cpoPickSupplier(existing.id, existing.name);
    return;
  }
  try {
    const { data, error } = await sb.from('suppliers').insert({ name }).select().single();
    if (error) throw error;
    SUPPLIERS._list.push(data);
    cpoPickSupplier(data.id, data.name);
    toast(`✓ 新增供应商「${name}」`);
  } catch (e) { toast('新增失败：' + (e.message || e), 'err'); }
}

async function saveCustomPo() {
  const s = CUSTOM_PO_STATE;
  if (!s) return;

  // 校验：供应商
  const supName = document.getElementById('cpoSupplierInput').value.trim();
  if (!supName) { toast('请选择/输入供应商', 'warn'); return; }
  let supId = s.supplierId;
  if (!supId || (SUPPLIERS.byId(supId)?.name !== supName)) {
    const found = SUPPLIERS.byName(supName);
    if (found) supId = found.id;
    else {
      const { data, error } = await sb.from('suppliers').insert({ name: supName }).select().single();
      if (error) { toast('新增供应商失败：' + error.message, 'err'); return; }
      SUPPLIERS._list.push(data);
      supId = data.id;
    }
  }

  // 校验：日期 + 产品行
  if (!s.promisedDate) { toast('请填下单日期', 'warn'); return; }
  const validLines = s.lineItems.filter(li => li.sku.trim() && li.title.trim() && li.qty > 0 && li.price > 0);
  if (validLines.length === 0) { toast('至少需要一条有效的产品行（SKU、名称、数量、单价必填且 >0）', 'warn'); return; }

  // 拼装 line_items
  const liData = validLines.map((li, i) => ({
    shopify_line_item_id: null,
    sku: li.sku.trim(),
    title_cn: li.title.trim(),
    title_en: '',
    variant: li.variant.trim(),
    image_url: li.image_url || '',
    qty: Number(li.qty),
    price: Number(li.price),
    subtotal: Number(li.qty) * Number(li.price),
    is_custom: true,
    // V5-W3-2026-05-26: Custom PO 也带 per-line 字段(自定义单可能不关联具体国家,标准留空,跟单按需填备注)
    electrical_standard: '',
    line_note: (li.note || '').trim(),
  }));
  const totalAmount = liData.reduce((s, x) => s + x.subtotal, 0);

  // 是否需要审批
  const needsApproval = liData.some(li => li.qty > 20) || totalAmount > 5000;
  const initialStatus = needsApproval ? 'pending_approval' : 'producing';

  // 拿 PO 编号
  let poNum;
  try {
    const { data: pn, error: pnErr } = await sb.rpc('generate_po_number');
    if (pnErr) throw pnErr;
    poNum = pn;
  } catch (e) { toast('生成 PO 编号失败：' + (e.message || e), 'err'); return; }

  // 当前用户 ID
  let agentId = CURRENT_USER_ID;
  if (!agentId) {
    try { const { data: { user } } = await sb.auth.getUser(); agentId = user?.id; } catch (_) {}
  }
  if (!agentId) { toast('未登录', 'err'); return; }

  const poRow = {
    agent_id: agentId,
    po_number: poNum,
    source: 'manual',  // 自定义 PO 来源
    supplier: supName,
    product: liData.map(x => x.title_cn).join(' / '),
    status: initialStatus,
    promised_date: s.promisedDate,
    line_items: liData,
    box_note: s.boxNote.trim(),
    total_amount: totalAmount,
    sales_order_id: null,  // 不关联销售单
    creator_name: CURRENT_AGENT || '未知',
    site: '',
    order_no: '',
    note: s.otherNote.trim(),
    followups: [],
  };

  try {
    const { error } = await sb.from('orders').insert(poRow);
    if (error) throw error;
    
    // V20260527r: 双向同步 · 把当前 PO 的(产品 ↔ 供应商)关系写回 products.suppliers
    const syncResult = await _syncSuppliersFromPoLines(supName, validLines);
    
    // 主 toast
    toast(needsApproval ? `✓ 已创建 ${poNum}，等主管审批` : `✓ 已创建采购单 ${poNum}`);
    
    // V27o 同步结果提示(仅在有新增/append 时显示 · 让用户感知)
    if (syncResult.newCount > 0 || syncResult.appendedCount > 0) {
      const parts = [];
      if (syncResult.newCount > 0) parts.push(`新建 ${syncResult.newCount} 个产品`);
      if (syncResult.appendedCount > 0) parts.push(`${syncResult.appendedCount} 个产品加了供应商「${supName}」`);
      setTimeout(() => toast(`📦 产品库已同步:${parts.join(' · ')}`, 'info', 2500), 600);
    }
    
    closeCustomPoModal();
    await renderPo();  // 刷新 PO 列表
    if (PO_FILTER !== 'pending' && needsApproval) toast('请进「⏳ 待审批」子tab 查看', 'info');
  } catch (e) {
    toast('保存失败:' + (e.message || e), 'err');
  }
}

// V20260527r: 把 PO 的(产品 ↔ 供应商)关系同步写回 products.suppliers
// 通用 helper · customPo / batchPo 都调用
// li 必须有:sku, title(可选), variant(可选), image_url(可选), price, qty
// 返回:{ newCount, appendedCount, priceUpdatedCount }
async function _syncSuppliersFromPoLines(supName, lineItems) {
  const stats = { newCount: 0, appendedCount: 0, priceUpdatedCount: 0 };
  if (!supName || !Array.isArray(lineItems) || lineItems.length === 0) return stats;
  
  for (const li of lineItems) {
    try {
      const sku = (li.sku || '').trim();
      if (!sku) continue;
      const { data: existing } = await sb.from('products')
        .select('id, suppliers, default_supplier').eq('sku', sku).maybeSingle();
      
      if (!existing) {
        // 新 SKU · 创建 + supplier 作为第一项默认
        await sb.from('products').insert({
          sku,
          name_cn: (li.title || li.title_cn || '').trim(),
          spec_en: (li.variant || '').trim(),
          image_url: li.image_url || null,
          last_purchase_price: li.price,
          default_supplier: supName,
          suppliers: [{ 
            name: supName, note: '', is_default: true, 
            last_price: li.price, sort_order: 0 
          }],
          last_purchased_at: new Date().toISOString(),
        });
        stats.newCount++;
      } else {
        let currentSuppliers = Array.isArray(existing.suppliers) ? existing.suppliers.slice() : [];
        // 数组空但老 default_supplier 有值 · 先转入数组
        if (currentSuppliers.length === 0 && existing.default_supplier) {
          currentSuppliers.push({
            name: existing.default_supplier, note: '', is_default: true,
            last_price: null, sort_order: 0
          });
        }
        
        const existIdx = currentSuppliers.findIndex(s => (s.name || '').trim() === supName);
        if (existIdx >= 0) {
          // 已在 · 更新 last_price
          currentSuppliers[existIdx].last_price = li.price;
          stats.priceUpdatedCount++;
        } else {
          // 不在 · append · 没默认就设为默认
          const hasDefault = currentSuppliers.some(s => s.is_default);
          currentSuppliers.push({
            name: supName, note: '',
            is_default: !hasDefault,
            last_price: li.price,
            sort_order: currentSuppliers.length
          });
          stats.appendedCount++;
        }
        
        const defaultName = currentSuppliers.find(s => s.is_default)?.name || supName;
        
        await sb.from('products').update({
          suppliers: currentSuppliers,
          default_supplier: defaultName,
          last_purchase_price: li.price,
          last_purchased_at: new Date().toISOString(),
        }).eq('id', existing.id);
      }
    } catch (e) { 
      console.warn('同步产品/供应商失败 SKU=' + (li.sku || '?'), e);
    }
  }
  
  // 让 PRODUCTS_CACHE 失效 · 下次进产品 tab 自动重新加载
  if (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE._lastLoaded) {
    PRODUCTS_CACHE._lastLoaded = 0;
  }
  
  return stats;
}
window._syncSuppliersFromPoLines = _syncSuppliersFromPoLines;


// ============================================================
// 批次 4：采购单 + 供应商 + 产品维护 + 同款绑定
// ============================================================

const SUPPLIERS = {
  _list: [],
  _lastLoaded: 0,
  CACHE_MS: 5 * 60 * 1000,  // 5 分钟缓存
  async loadAll(force = false) {
    if (!force && this._lastLoaded && (Date.now() - this._lastLoaded < this.CACHE_MS) && this._list.length > 0) {
      return this._list;  // 使用缓存
    }
    const { data, error } = await sb.from('suppliers').select('*').eq('is_active', true).order('name');
    if (error) throw error;
    this._list = data || [];
    this._lastLoaded = Date.now();
    return this._list;
  },
  invalidate() { this._lastLoaded = 0; },
  byName(name) { return this._list.find(s => s.name === name); },
  byId(id) { return this._list.find(s => s.id === id); },
  search(q) {
    if (!q || !q.trim()) return this._list.slice(0, 30);
    // V5-2026-05-24: 拼音匹配 - 支持中文/全拼/首字母 (NH 也能搜到霓合)
    const results = [];
    for (const s of this._list) {
      // 主要按 name 匹配
      const nameMatch = typeof pinyinMatch === 'function' 
        ? pinyinMatch(s.name || '', q, { pinyinFull: s.pinyin_full, pinyinInitials: s.pinyin_initials })
        : null;
      if (nameMatch) {
        results.push({ s, score: nameMatch.score });
        continue;
      }
      // 兜底: 联系人姓名/电话也搜(老逻辑保留)
      const haystack = ((s.contact_name || '') + ' ' + (s.contact_phone || '')).toLowerCase();
      if (haystack.includes(q.toLowerCase())) {
        results.push({ s, score: 10 });
      }
    }
    // 按 score 升序排
    results.sort((a, b) => a.score - b.score);
    return results.slice(0, 30).map(r => r.s);
  },
};

// ============ 通用供应商 typeahead 增强（不破坏原有 datalist） ============
// 给所有现有的 <input list="*SuppliersList"> 加自定义浮动下拉，更明显的过滤体验
function setupSupplierTypeahead() {
  const inputs = document.querySelectorAll('input[list$="SuppliersList"]');
  inputs.forEach(input => {
    if (input.dataset.typeaheadInit) return;
    input.dataset.typeaheadInit = '1';
    // 移除 list 属性以禁用浏览器原生 datalist（避免双下拉）
    const listId = input.getAttribute('list');
    input.removeAttribute('list');

    // 创建浮层
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative; display:contents;';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const popup = document.createElement('div');
    popup.className = 'supplier-typeahead-popup';
    popup.style.cssText = 'position:absolute; left:0; right:0; max-height:280px; overflow-y:auto; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; box-shadow:var(--shadow-md); z-index:10000; display:none; margin-top:2px; font-size:13px;';
    wrapper.appendChild(popup);

    const render = () => {
      const q = (input.value || '').trim();
      const list = SUPPLIERS._list || [];
      let matches;
      if (!q) {
        // 空输入显示前 30 个（按下单数排序）
        matches = list.slice().sort((a,b) => (b.total_orders||0) - (a.total_orders||0)).slice(0, 30);
      } else {
        const keywords = q.toLowerCase().split(/\s+/).filter(Boolean);
        matches = list.filter(s => {
          const haystack = ((s.name || '') + ' ' + (s.contact_name || '') + ' ' + (s.contact_phone || '')).toLowerCase();
          const haystackNoSpace = haystack.replace(/\s+/g, '');
          return keywords.every(kw => {
            const kwNoSpace = kw.replace(/\s+/g, '');
            return haystack.includes(kw) || haystackNoSpace.includes(kwNoSpace);
          });
        }).slice(0, 50);
      }
      if (matches.length === 0) {
        popup.innerHTML = `<div style="padding:10px; color:var(--text-tertiary);">无匹配${q ? ` "${escapeHtml(q)}"` : ''} · <a href="#" onclick="event.preventDefault(); openSuppliersManager()" style="color:var(--accent);">去管理</a></div>`;
      } else {
        popup.innerHTML = matches.map((s, i) => `
          <div class="supplier-ta-item" data-name="${escapeHtml(s.name)}" style="padding:7px 12px; cursor:pointer; border-bottom:1px solid var(--border-subtle); ${i === 0 ? 'background:var(--bg-row-hover);' : ''}">
            <div style="font-weight:500;">${escapeHtml(s.name)}</div>
            ${(s.contact_name || s.contact_phone || s.total_orders) ? `<div style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">${escapeHtml(s.contact_name || '')} ${s.contact_phone ? '· ' + escapeHtml(s.contact_phone) : ''} ${s.total_orders ? '· ' + s.total_orders + ' 次合作' : ''}</div>` : ''}
          </div>
        `).join('');
        popup.querySelectorAll('.supplier-ta-item').forEach(el => {
          el.addEventListener('mousedown', e => {
            e.preventDefault();
            input.value = el.dataset.name;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            popup.style.display = 'none';
          });
          el.addEventListener('mouseover', () => {
            popup.querySelectorAll('.supplier-ta-item').forEach(x => x.style.background = '');
            el.style.background = 'var(--bg-row-hover)';
          });
        });
      }
      popup.style.display = 'block';
    };

    input.addEventListener('focus', () => {
      // 确保供应商已加载
      if (SUPPLIERS._list.length === 0) SUPPLIERS.loadAll().then(render).catch(() => {});
      else render();
    });
    input.addEventListener('input', render);
    input.addEventListener('blur', () => setTimeout(() => { popup.style.display = 'none'; }, 200));

    // 键盘
    let highlightIdx = 0;
    input.addEventListener('keydown', e => {
      if (popup.style.display === 'none') return;
      const items = popup.querySelectorAll('.supplier-ta-item');
      if (items.length === 0) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[highlightIdx]?.style && (items[highlightIdx].style.background = '');
        highlightIdx = e.key === 'ArrowDown' ? (highlightIdx + 1) % items.length : (highlightIdx - 1 + items.length) % items.length;
        items[highlightIdx].style.background = 'var(--bg-row-hover)';
        items[highlightIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (items[highlightIdx]) {
          e.preventDefault();
          items[highlightIdx].dispatchEvent(new MouseEvent('mousedown'));
        }
      } else if (e.key === 'Escape') {
        popup.style.display = 'none';
      }
    });
  });
}

// 在 DOM 准备好时初始化（页面加载完 + 切 tab 时都跑）
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(setupSupplierTypeahead, 500);
});

const PRODUCTS_CACHE = {
  _bySku: {},
  _byId: {},
  _all: [],
  _lastLoaded: 0,
  CACHE_MS: 5 * 60 * 1000,
  async loadAll(force = false) {
    if (!force && this._lastLoaded && (Date.now() - this._lastLoaded < this.CACHE_MS) && this._all.length > 0) {
      return this._all;
    }
    const { data, error } = await sb.from('products').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (error) throw error;
    this._all = data || [];
    this._bySku = {};
    this._byId = {};
    (data || []).forEach(p => { this._bySku[p.sku] = p; this._byId[p.id] = p; });
    this._lastLoaded = Date.now();
    return this._all;
  },
  invalidate() { this._lastLoaded = 0; },
  // 通过 SKU 查产品，自动穿透 master_product_id
  effectiveBySku(sku) {
    const p = this._bySku[sku];
    if (!p) return null;
    if (p.master_product_id) {
      const master = this._byId[p.master_product_id];
      if (master) return master;
    }
    return p;
  },
};

// ============ 从 variant_title 自动提取 尺寸（英寸→cm 取整）+ 色温 + 材质 + N-Lights 灯头 ============
function extractVariantInfo(variantTitle) {
  if (!variantTitle) return '';
  const out = [];
  const seenDimensions = new Set();  // 去重：网站同时给英寸和 cm 时只保留一个
  const parts = variantTitle.split(/[/|]/).map(s => s.trim()).filter(Boolean);

  // 标准化尺寸字符串（忽略空格/大小写/.0 结尾/直径符号同义词/括号附注，便于比较去重）
  function normSize(s) {
    let n = s.toLowerCase().replace(/\s+/g, '');
    n = n.replace(/\([^)]*\)/g, '');  // 去掉括号内容（如 (2 hooks)），不影响尺寸唯一性
    // 把所有"直径"同义词统一为 d
    // Ø (U+00D8) ø (U+00F8) ⌀ (U+2300 直径符) ∅ (U+2205 空集，常被误用为直径) Φ φ (希腊 Phi)
    n = n.replace(/[øØ⌀∅Φφ]/g, 'd');
    n = n.replace(/diameter/g, 'd');           // 先匹配长的
    n = n.replace(/dia(?![a-z])/g, 'd');       // "dia80" 替换，"diagonal" 不替换
    // 标准化 .0 结尾（80.0cm → 80cm）
    n = n.replace(/(\d+)\.0+(?=cm|mm)/g, '$1');
    return n;
  }
  function addDimension(text) {
    const key = normSize(text);
    if (seenDimensions.has(key)) return;  // 已有等价尺寸，跳过
    seenDimensions.add(key);
    out.push('尺寸：' + text);
  }

  // 材质中英对照
  const MATERIAL_MAP = {
    // 多词条目（按长度优先匹配）
    'wood grain hydrographics': '木纹水转印', 'grain hydrographics': '木纹水转印',
    'hydrographics': '水转印', 'water transfer printing': '水转印',
    'stainless steel': '不锈钢',
    'oak wood': '橡木', 'walnut wood': '胡桃木', 'ash wood': '白蜡木',
    'cherry wood': '樱桃木', 'pine wood': '松木', 'teak wood': '柚木',
    'solid wood': '实木', 'wood grain': '木纹', 'frosted glass': '磨砂玻璃',
    'clear glass': '透明玻璃', 'smoked glass': '茶色玻璃', 'amber glass': '琥珀玻璃',
    // 单词
    brass: '黄铜', copper: '铜', bronze: '青铜',
    iron: '铁', steel: '钢',
    aluminum: '铝', aluminium: '铝',
    marble: '大理石', travertine: '洞石', stone: '石材',
    oak: '橡木', walnut: '胡桃木', ash: '白蜡木',
    cherry: '樱桃木', teak: '柚木', pine: '松木',
    bamboo: '竹', rattan: '藤编',
    glass: '玻璃', crystal: '水晶', ceramic: '陶瓷', porcelain: '瓷',
    fabric: '布艺', linen: '亚麻', cotton: '棉', velvet: '天鹅绒', leather: '皮质',
    concrete: '混凝土', plaster: '石膏', resin: '树脂', acrylic: '亚克力',
    paper: '纸艺', alabaster: '雪花石',
  };

  // 颜色中英对照（含修饰词）
  const COLOR_MAP = {
    // 多词组合(必须排前面 · 避免被单词分割)
    'rose gold': '玫瑰金', 'champagne gold': '香槟金', 'antique brass': '复古黄铜',
    'aged brass': '复古黄铜', 'antique gold': '复古金', 'aged gold': '复古金',
    'matte black': '哑光黑', 'matte white': '哑光白', 'matte gold': '哑光金',
    'matte brass': '哑光黄铜', 'matte brown': '哑光棕', 'matte gray': '哑光灰', 'matte grey': '哑光灰',
    'polished chrome': '抛光铬', 'polished brass': '抛光黄铜', 'polished nickel': '抛光镍',
    'brushed nickel': '拉丝镍', 'brushed brass': '拉丝黄铜', 'brushed gold': '拉丝金',
    'brushed chrome': '拉丝铬', 'brushed steel': '拉丝钢',
    'satin nickel': '缎面镍', 'satin brass': '缎面黄铜', 'satin gold': '缎面金',
    'satin black': '缎面黑', 'satin chrome': '缎面铬',
    'natural wood': '原木色', 'natural brass': '原色黄铜',
    'smoky gray': '烟灰色', 'smoky grey': '烟灰色',
    'smokey gray': '烟灰色', 'smokey grey': '烟灰色',  // 常见拼写错误
    'smoke gray': '烟灰色', 'smoke grey': '烟灰色',
    'oil rubbed bronze': '油擦青铜', 'oil-rubbed bronze': '油擦青铜',
    'dark walnut': '深胡桃木色', 'light walnut': '浅胡桃木色',
    'warm white': '暖白', 'cool white': '冷白', 'pure white': '纯白', 'off white': '米白',
    'sky blue': '天蓝', 'navy blue': '海军蓝', 'royal blue': '宝蓝色',
    'forest green': '森林绿', 'mint green': '薄荷绿', 'sage green': '鼠尾草绿',
    'olive green': '橄榄绿', 'army green': '军绿', 'dark green': '深绿',
    'wine red': '酒红', 'burgundy red': '勃艮第红', 'dark red': '深红',
    // 单词颜色
    black: '黑色', white: '白色', gray: '灰色', grey: '灰色',
    brown: '棕色', red: '红色', blue: '蓝色', green: '绿色',
    yellow: '黄色', pink: '粉色', orange: '橙色', purple: '紫色',
    silver: '银色', gold: '金色', beige: '米色', cream: '奶油色',
    ivory: '象牙白', navy: '海军蓝', champagne: '香槟色',
    charcoal: '炭灰色', chrome: '铬色', graphite: '石墨色',
    nickel: '镍色',
    // 烟灰色系(灯具常见 · 含多种拼写)
    smoky: '烟灰色', smokey: '烟灰色', smoke: '烟灰色', smoked: '烟灰色',
    // 灰色系细分
    taupe: '灰褐色', slate: '石板灰', ash: '灰白色',
    // 暖色系
    coral: '珊瑚色', salmon: '三文鱼色', peach: '蜜桃色',
    terracotta: '陶土色', rust: '铁锈色', amber: '琥珀色',
    // 自然色
    sage: '鼠尾草绿', mint: '薄荷绿', olive: '橄榄绿', emerald: '翡翠绿',
    teal: '蓝绿色', turquoise: '青绿色', burgundy: '勃艮第红',
    maroon: '栗色', mauve: '淡紫色', lavender: '薰衣草紫',
    // 木色
    walnut: '胡桃木色', oak: '橡木色', mahogany: '红木色', cherry: '樱桃木色',
    teak: '柚木色', ebony: '乌木色',
    // 修饰词
    matte: '哑光', polished: '抛光', glossy: '亮光', satin: '缎面',
    antique: '复古', brushed: '拉丝', aged: '复古', distressed: '做旧',
    // 灯具常用颜色名(易错拼写)
    bronze: '青铜色', copper: '铜色',
    transparent: '透明', translucent: '半透明', opaque: '不透明',
    frosted: '磨砂', textured: '纹理',
  };

  // 英寸 → cm 整数（保留 1 位小数显示 .0）
  const inchToCm = (inchStr) => Math.round(parseFloat(inchStr) * 2.54).toFixed(1) + 'cm';

  // N-Lights → N 头
  function translateLights(text) {
    return text.replace(/(\d+)\s*-?\s*(?:light|lights|head|heads|bulbs?)\b/gi, '$1 头');
  }

  for (const part of parts) {
    // === 0. 抽取括号内的 N-hooks/lights/heads/bulbs（独立成"灯头"信息，避免影响尺寸去重） ===
    let cleanedPart = part;
    const hookMatch = part.match(/\(\s*(\d+)\s*(hooks?|lights?|heads?|bulbs?)\s*\)/i);
    if (hookMatch) {
      const headLine = '灯头：' + hookMatch[1] + ' 头';
      if (!out.includes(headLine)) out.push(headLine);
      cleanedPart = part.replace(/\(\s*\d+\s*(hooks?|lights?|heads?|bulbs?)\s*\)/i, '').trim();
    }

    // === 1. 尺寸（独立维度，跑完继续看后面的调光/色温） ===
    let hadSize = false;
    if (/\d+(?:\.\d+)?\s*["'″]/.test(cleanedPart)) {
      let cmText = cleanedPart.replace(/(\d+(?:\.\d+)?)\s*["'″]/g, (_, n) => inchToCm(n));
      cmText = translateLights(cmText);
      addDimension(cmText);
      hadSize = true;
    } else if (/\d+(?:\.\d+)?\s*cm/i.test(cleanedPart)) {
      addDimension(translateLights(cleanedPart));
      hadSize = true;
    } else if (/\d+(?:\.\d+)?\s*mm/i.test(cleanedPart)) {
      addDimension(translateLights(cleanedPart));
      hadSize = true;
    }

    // === 2. 调光（独立检测） ===
    let dimming = null;
    if (/triac.*dimm|dimmable.*triac/i.test(cleanedPart)) dimming = '可控硅调光';
    else if (/0-10\s*v/i.test(cleanedPart)) dimming = '0-10V调光';
    else if (/dimmable|dimming/i.test(cleanedPart)) dimming = '可调光';

    // === 3. 色温（独立检测） ===
    let colorTemp = null;
    if (/warm\s*(light|white)|3000\s*k/i.test(cleanedPart)) colorTemp = '暖光 3000K';
    else if (/cool\s*(light|white)|6000\s*k|6500\s*k/i.test(cleanedPart)) colorTemp = '冷光 6000K';
    else if (/natural\s*(light|white)|neutral\s*white|4000\s*k/i.test(cleanedPart)) colorTemp = '中性光 4000K';
    else if (/daylight|5000\s*k/i.test(cleanedPart)) colorTemp = '日光 5000K';

    // === 调光 + 色温 合并输出（如 "可控硅调光 暖光 3000K"）===
    if (dimming && colorTemp) {
      out.push(`${dimming} ${colorTemp}`);
      continue;
    } else if (dimming) {
      out.push(dimming);
      continue;
    } else if (colorTemp) {
      out.push('色温：' + colorTemp);
      continue;
    }

    // 已识别尺寸的 part 不再继续检测灯头/材质
    if (hadSize) continue;

    // === 4. 单独的 N-Lights（无尺寸） ===
    if (/\d+\s*-?\s*(light|lights|head|heads|bulbs?)\b/i.test(cleanedPart) && !/(warm|cool|natural|daylight|dimm)/i.test(cleanedPart)) {
      const headLine = '灯头：' + translateLights(cleanedPart);
      if (!out.includes(headLine)) out.push(headLine);
      continue;
    }

    // === 5. 颜色 / 材质 综合翻译（如 "Black+Walnut Wood" → "黑色 + 胡桃木"）===
    const lower = cleanedPart.toLowerCase();
    const hasColor = Object.keys(COLOR_MAP).some(k => new RegExp('\\b' + k + '\\b', 'i').test(lower));
    const hasMat = Object.keys(MATERIAL_MAP).some(k => new RegExp('\\b' + k + '\\b', 'i').test(lower));
    if (hasColor || hasMat) {
      let translated = cleanedPart;
      const allMaps = { ...MATERIAL_MAP, ...COLOR_MAP };
      const sortedKeys = Object.keys(allMaps).sort((a, b) => b.length - a.length);
      for (const k of sortedKeys) {
        translated = translated.replace(new RegExp('\\b' + k + '\\b', 'gi'), allMaps[k]);
      }
      translated = translated.replace(/\+/g, ' + ').replace(/\s+&\s+|\s+and\s+/gi, ' + ');
      translated = translated.replace(/\b(wood|material|finish|color|colour)\b/gi, '').replace(/\s+/g, ' ').trim();
      translated = translated.replace(/\s+\+\s+/g, ' + ');
      const prefix = (hasColor && hasMat) ? '配色/材质：' : (hasColor ? '颜色：' : '材质：');
      out.push(prefix + translated);
      continue;
    }
    // 其他不输出（款式、插头标准等不需要）
  }
  const result = out.join('\n');
  console.log('[extractVariantInfo]', JSON.stringify(variantTitle), '→', JSON.stringify(result));
  return result;
}

// ============ 国家 → 电气标准（含电压；用于订单备注） ============
function getElectricalStandard(countryCode, fallbackCountry) {
  const code = (countryCode || '').toUpperCase().trim();
  const NA   = ['US','CA','MX'];                                                  // 北美 110V
  const UK   = ['GB','UK','IE'];                                                  // 英规 220V
  const EU   = ['DE','FR','ES','IT','NL','BE','PT','AT','SE','FI','DK','PL','CZ','GR','HU','RO','BG','HR','SK','SI','LT','LV','EE','LU','MT','CY','NO','CH','IS','LI'];
  const AUS  = ['AU','NZ','FJ'];
  if (NA.includes(code))  return '美规110V电压';
  if (UK.includes(code))  return '英规220V电压';
  if (EU.includes(code))  return '欧规220V电压';
  if (AUS.includes(code)) return '澳规220V电压';
  if (code === 'CN') return '中规220V电压';
  if (code === 'JP') return '日规100V电压';
  if (code === 'KR') return '韩规220V电压';
  if (code === 'IN' || code === 'PK' || code === 'ZA') return '英规220V电压';
  if (code === 'IL') return '欧规220V电压';
  if (code === 'BR') return '巴标220V电压';
  if (code === 'AR' || code === 'CL') return '南美规220V电压';
  if (fallbackCountry) {
    const fc = fallbackCountry.toLowerCase();
    if (/united states|usa|canada|mexico/.test(fc)) return '美规110V电压';
    if (/united kingdom|britain|ireland/.test(fc)) return '英规220V电压';
    if (/germany|france|spain|italy|netherlands|europe/.test(fc)) return '欧规220V电压';
    if (/australia|new zealand/.test(fc)) return '澳规220V电压';
  }
  return '';
}

// ============ 采购单弹窗 ============
let PO_FORM_STATE = null;

async function openPoForm(salesOrderId, selectedLineItemIds = null) {
  // V4：可选第二参数 — 仅默认勾选指定的 line items（拆单功能用）
  // selectedLineItemIds: Set<string> 或 Array<string>，里面是 shopify_line_item_id
  const selectedSet = selectedLineItemIds 
    ? new Set(Array.from(selectedLineItemIds)) 
    : null;
  
  // 加载销售订单、供应商列表、产品库
  const so = SHOPIFY._orders.find(o => o.id === salesOrderId);
  if (!so) { toast('订单不存在', 'err'); return; }

  try {
    await Promise.all([SUPPLIERS.loadAll(), PRODUCTS_CACHE.loadAll()]);
  } catch (e) {
    toast('加载基础数据失败：' + (e.message || e), 'err');
    return;
  }

  // V5-2026-05-24: 查询本订单 SKU 的历史供应商(用于智能推荐)
  // 不阻塞主流程,异步加载
  const skusInThisOrder = (so.line_items || []).map(li => li.sku).filter(Boolean);
  let supplierHistoryMap = {};  // supplier_name → { count, last_at, last_price, skus: [...] }
  if (skusInThisOrder.length > 0) {
    try {
      const { data: hist } = await sb.from('v_sku_supplier_history')
        .select('*')
        .in('sku', skusInThisOrder);
      if (hist && hist.length > 0) {
        hist.forEach(h => {
          const key = h.supplier;
          if (!supplierHistoryMap[key]) {
            supplierHistoryMap[key] = {
              supplier: h.supplier,
              total_count: 0,
              last_at: h.last_ordered_at,
              avg_price: 0,
              prices: [],
              skus: new Set(),
            };
          }
          const entry = supplierHistoryMap[key];
          entry.total_count += h.order_count || 0;
          if (!entry.last_at || h.last_ordered_at > entry.last_at) entry.last_at = h.last_ordered_at;
          if (h.avg_price) entry.prices.push(h.avg_price);
          entry.skus.add(h.sku);
        });
        // 算平均价
        Object.values(supplierHistoryMap).forEach(e => {
          e.avg_price = e.prices.length > 0 ? e.prices.reduce((a,b) => a+b, 0) / e.prices.length : 0;
          e.skus = Array.from(e.skus);
        });
      }
    } catch (e) { console.warn('[supplier-hist] 查历史失败(不影响主流程):', e); }
  }

  PO_FORM_STATE = {
    salesOrder: so,
    selectedSupplierId: null,
    selectedSupplierName: '',
    lineItemSelections: {},  // shopify_line_item_id => { checked, qty, price, supplierName, customSku, customTitleCn, customImageUrl }
    customLines: [],         // 跟单追加的自定义产品（差价/配件/换货等）
    otherNote: '',
    otherNoteManuallyEdited: false,
    // V5-W3-2026-05-26: per-line 备注(每行独立)
    // lineNotes: { [shopify_line_item_id]: '本行备注内容' }
    // lineNotesManuallyEdited: { [shopify_line_item_id]: true } — 跟单手动改过则不再自动覆盖
    lineNotes: {},
    lineNotesManuallyEdited: {},
    // V5-W3-2026-05-26 BUG FIX: 跟单改过的 boxNote 不能在 renderPoForm 重渲时被冲掉
    boxNote: '',
    boxNoteManuallyEdited: false,
    invalidPoIds: new Set(), // 已取消/已驳回 PO 的 ID 集合（用于渲染时过滤显示）
    splitMode: !!selectedSet, // V4：是否是拆单模式（影响表单顶部提示）
    supplierHistory: supplierHistoryMap, // V5: 本订单 SKU 的历史供应商映射
  };

  // 默认勾选未分配且未取消的 line items
  // 注意：要过滤掉指向"已取消 / 已驳回"PO 的 assignment（不算占用名额）
  // PO_LIST 可能还没加载，需要主动加载
  const { data: poStatusData } = await sb.from('orders').select('id, status').not('po_number', 'is', null);
  const invalidPoIds = new Set((poStatusData || []).filter(p => p.status === 'cancelled' || p.status === 'rejected').map(p => p.id));
  PO_FORM_STATE.invalidPoIds = invalidPoIds;

  (so.line_items || []).forEach(li => {
    // 只统计有效 PO 的 assignment
    const validAssignments = (li.po_assignments || []).filter(a => !invalidPoIds.has(a.po_id));
    const remaining = (li.quantity || 0) - validAssignments.reduce((s, a) => s + (a.qty || 0), 0);
    const eff = PRODUCTS_CACHE.effectiveBySku(li.sku) || {};
    // V4：拆单模式下，仅勾选指定的 line items
    const isInSelection = selectedSet ? selectedSet.has(li.shopify_line_item_id) : true;
    PO_FORM_STATE.lineItemSelections[li.shopify_line_item_id] = {
      checked: remaining > 0 && isInSelection,
      qty: remaining,
      price: eff.last_purchase_price || '',
      supplierName: eff.default_supplier || '',
      remaining,
      assignedQty: (li.quantity || 0) - remaining,
    };
  });

  // 推荐默认供应商：从选中 line items 的 default_supplier 取最常见的
  const counts = {};
  Object.values(PO_FORM_STATE.lineItemSelections).forEach(sel => {
    if (sel.checked && sel.supplierName) counts[sel.supplierName] = (counts[sel.supplierName] || 0) + 1;
  });
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
  if (top) {
    PO_FORM_STATE.selectedSupplierName = top[0];
    const sup = SUPPLIERS.byName(top[0]);
    if (sup) PO_FORM_STATE.selectedSupplierId = sup.id;
  }

  renderPoForm();
  document.getElementById('poFormModal').style.display = 'flex';
}

function renderPoForm() {
  const so = PO_FORM_STATE.salesOrder;
  const body = document.getElementById('poFormBody');
  const ship = so.shipping_address || {};
  const siteCode = SHOPIFY.siteCodeOf(so.shop_domain);

  const items = so.line_items || [];
  const itemsHtml = items.map(li => {
    const sel = PO_FORM_STATE.lineItemSelections[li.shopify_line_item_id];
    if (!sel) return '';
    const eff = PRODUCTS_CACHE.effectiveBySku(li.sku) || {};
    const productMap = SHOPIFY._productMap || {};
    const ownProd = productMap[li.sku] || {};
    // 跟单手动改过的字段优先
    const imgUrl = sel.customImageUrl || eff.image_url || ownProd.image_url || li.image_url || '';
    const displaySku = sel.customSku || eff.sku || li.sku;
    const displayTitle = sel.customTitleCn || eff.name_cn || ownProd.name_cn || li.title || '(无名)';
    // V5-2026-05-24: 同时显示英文(如果中英不同)
    const displayEn = li.title && li.title !== displayTitle ? li.title : '';
    const wasEdited = !!(sel.customSku || sel.customTitleCn || sel.customImageUrl);
    const fullyAssigned = sel.remaining === 0;
    // 已分配的 PO 列表（过滤掉已取消/驳回的，避免显示失效 PO）
    const validAssignments = (li.po_assignments || []).filter(a =>
      !PO_FORM_STATE.invalidPoIds || !PO_FORM_STATE.invalidPoIds.has(a.po_id)
    );
    return `
      <div class="po-li-row ${sel.checked ? 'checked' : ''} ${fullyAssigned ? 'assigned' : ''}">
        <input type="checkbox" ${sel.checked ? 'checked' : ''} ${fullyAssigned ? 'disabled' : ''}
          onchange="poFormToggleItem('${li.shopify_line_item_id}', this.checked)">
        ${imgUrl ? `<img loading="lazy" class="li-img" src="${escapeHtml(imgUrl)}" onclick="openImgLightbox('${escapeHtml(imgUrl)}')">` : `<div class="li-noimg">📷</div>`}
        <div class="li-info">
          <div class="sku">${escapeHtml(displaySku)}${wasEdited ? '<span style="margin-left:6px; font-size:10px; padding:1px 6px; background:rgba(124,58,237,0.12); color:#7c3aed; border-radius:3px;">已修改</span>' : ''}</div>
          <div class="name">${escapeHtml(displayTitle)}${displayEn ? ` <span style="color:var(--text-tertiary); font-size:11px; font-weight:400;">/ ${escapeHtml(displayEn)}</span>` : ''}</div>
          <div class="variant">${escapeHtml(li.variant_title || '')}${fullyAssigned ? ' · <span style="color:var(--success)">✓ 已全部开 PO</span>' : sel.assignedQty > 0 ? ` · 剩 ${sel.remaining}/${li.quantity}` : ''}</div>
          ${fullyAssigned && validAssignments.length > 0 ? `
            <div style="margin-top:4px; padding:6px 8px; background:rgba(234,179,8,0.08); border-left:3px solid var(--warning); border-radius:4px; font-size:11px;">
              <b style="color:var(--warning);">⚠ 已开过 PO：</b>${validAssignments.map(a => `
                <a href="javascript:void(0)" onclick="closePoForm(); switchTab('po'); setTimeout(() => { document.querySelector('[data-pofilter=\\'all\\']')?.click(); }, 100);" style="color:var(--accent); text-decoration:none; font-weight:600;" title="跳到采购单 tab 查看/取消">
                  ${escapeHtml(a.po_number)} (${escapeHtml(a.supplier || '')}) × ${a.qty}
                </a>`).join('、')}
              <div style="color:var(--text-tertiary); margin-top:3px;">如需重开请到采购单 tab 先取消该 PO；或在采购单卡片直接修改</div>
            </div>` : ''}
          ${eff.default_supplier ? `<div class="li-default-supplier">默认: ${escapeHtml(eff.default_supplier)}</div>` : ''}
          <div style="margin-top:4px; font-size:11px; display:flex; gap:10px; flex-wrap:wrap;">
            <span>
              <span style="color: var(--text-tertiary);">SKU 备注：</span>
              <span style="color: var(--text-primary);">${eff.notes ? escapeHtml(eff.notes).slice(0, 60) + (eff.notes.length > 60 ? '…' : '') : '<i style="color:var(--text-tertiary)">未维护</i>'}</span>
              <a href="javascript:void(0)" onclick="editSkuNotes('${escapeHtml(li.sku).replace(/'/g,"\\'")}')" style="margin-left:4px; color:var(--accent); text-decoration:none;">✏️ ${eff.notes ? '编辑' : '添加'}</a>
            </span>
            <a href="javascript:void(0)" onclick="poFormEditLine('${li.shopify_line_item_id}')" style="color:#7c3aed; text-decoration:none; font-weight:500;">🔧 修改 SKU / 图 / 名 (换货/差价)</a>
            ${wasEdited ? `<a href="javascript:void(0)" onclick="poFormResetLine('${li.shopify_line_item_id}')" style="color:var(--text-tertiary); text-decoration:none;">↺ 恢复默认</a>` : ''}
          </div>
          <!-- V5-W3-2026-05-26: per-line 备注输入框(每行独立,跟单可编辑)-->
          <div style="margin-top:6px; display:flex; gap:6px; align-items:center;">
            <span style="font-size:11px; color:var(--text-secondary); font-weight:500; flex-shrink:0; min-width:60px;">📝 本行备注:</span>
            <input type="text" id="poLineNote_${li.shopify_line_item_id}"
              value="${escapeHtml(PO_FORM_STATE.lineNotes[li.shopify_line_item_id] || '')}"
              placeholder="自动填入 / 跟单可编辑(尺寸/色温/特殊要求/加急等)"
              oninput="poFormSetLineNote('${li.shopify_line_item_id}', this.value)"
              ${fullyAssigned ? 'disabled' : ''}
              style="flex:1; padding:4px 8px; font-size:11.5px; border:1px solid var(--border); border-radius:4px; background:var(--bg-card); color:var(--text-primary); font-family:inherit;">
            ${fullyAssigned ? '' : `<button onclick="poFormTranslateLine('${li.shopify_line_item_id}')" title="一键翻译:把残留英文规格翻成中文(AI)"
              style="flex-shrink:0; padding:4px 9px; font-size:11px; border:1px solid #7c3aed; background:#7c3aed10; color:#7c3aed; border-radius:4px; cursor:pointer; white-space:nowrap;">🌐 翻译</button>`}
          </div>
        </div>
        <div style="position:relative;">
          <input type="number" min="1" max="${sel.remaining}" value="${sel.qty}" placeholder="数量"
            onchange="poFormSetQty('${li.shopify_line_item_id}', this.value)" ${fullyAssigned ? 'disabled' : ''}
            style="width:100%; ${Number(sel.qty) >= 2 ? 'background:rgba(220,38,38,0.08); border:2px solid #dc2626; color:#dc2626; font-weight:700; font-size:18px; text-align:center;' : ''}">
          ${Number(sel.qty) >= 2 ? `<div style="font-size:9px; color:#dc2626; font-weight:600; text-align:center; margin-top:2px;">⚠ 多件 注意</div>` : ''}
        </div>
        <div>
          <input type="number" min="0" step="0.01" value="${sel.price}" placeholder="单价 ¥"
            onchange="poFormSetPrice('${li.shopify_line_item_id}', this.value)" ${fullyAssigned ? 'disabled' : ''} style="width:100%;">
          ${eff.last_purchase_price ? `<div style="font-size:10px; color:var(--text-tertiary); margin-top:3px; line-height:1.3;">上次：¥${Number(eff.last_purchase_price).toFixed(2)}${eff.default_supplier ? ` · ${escapeHtml(eff.default_supplier)}` : ''}</div>` : '<div style="font-size:10px; color:var(--text-tertiary); margin-top:3px;">无历史价</div>'}
        </div>
        <div style="text-align:right; font-family:'JetBrains Mono', monospace; font-size:12px;">
          ${sel.qty && sel.price ? '¥ ' + (Number(sel.qty) * Number(sel.price)).toFixed(2) : '—'}
        </div>
      </div>`;
  }).join('') + 
  // 自定义追加的产品行
  PO_FORM_STATE.customLines.map(cl => {
    return `
      <div class="po-li-row checked" style="background: rgba(124,58,237,0.04); border-left: 3px solid #7c3aed;">
        <input type="checkbox" checked disabled title="自定义产品行">
        ${cl.image_url ? `<img loading="lazy" class="li-img" src="${escapeHtml(cl.image_url)}" onclick="openImgLightbox('${escapeHtml(cl.image_url)}')">` : `<div class="li-noimg">📷</div>`}
        <div class="li-info">
          <div class="sku">${escapeHtml(cl.sku || '')} <span style="margin-left:6px; font-size:10px; padding:1px 6px; background:rgba(124,58,237,0.12); color:#7c3aed; border-radius:3px;">自定义</span></div>
          <div class="name">${escapeHtml(cl.title_cn || cl.title_en || '(无名)')}</div>
          <div class="variant">${escapeHtml(cl.variant || '')}</div>
          <div style="margin-top:4px; font-size:11px;">
            <a href="javascript:void(0)" onclick="poFormEditCustomLine('${cl.id}')" style="color:#7c3aed; text-decoration:none;">🔧 修改</a>
            <a href="javascript:void(0)" onclick="poFormRemoveCustomLine('${cl.id}')" style="color:var(--danger); text-decoration:none; margin-left:10px;">✕ 删除</a>
          </div>
        </div>
        <div style="position:relative;">
          <input type="number" min="1" value="${cl.qty}" placeholder="数量"
            onchange="poFormSetCustomQty('${cl.id}', this.value)"
            style="width:100%; ${Number(cl.qty) >= 2 ? 'background:rgba(220,38,38,0.08); border:2px solid #dc2626; color:#dc2626; font-weight:700; font-size:18px; text-align:center;' : ''}">
          ${Number(cl.qty) >= 2 ? `<div style="font-size:9px; color:#dc2626; font-weight:600; text-align:center; margin-top:2px;">⚠ 多件 注意</div>` : ''}
        </div>
        <div>
          <input type="number" min="0" step="0.01" value="${cl.price}" placeholder="单价 ¥"
            onchange="poFormSetCustomPrice('${cl.id}', this.value)" style="width:100%;">
        </div>
        <div style="text-align:right; font-family:'JetBrains Mono', monospace; font-size:12px;">
          ${cl.qty && cl.price ? '¥ ' + (Number(cl.qty) * Number(cl.price)).toFixed(2) : '—'}
        </div>
      </div>`;
  }).join('');

  const selected = Object.entries(PO_FORM_STATE.lineItemSelections).filter(([_, sel]) => sel.checked);
  const customLines = PO_FORM_STATE.customLines || [];
  const totalAmount = selected.reduce((s, [_, sel]) => s + (Number(sel.qty) || 0) * (Number(sel.price) || 0), 0)
    + customLines.reduce((s, cl) => s + (Number(cl.qty) || 0) * (Number(cl.price) || 0), 0);
  const totalQty = selected.reduce((s, [_, sel]) => s + (Number(sel.qty) || 0), 0)
    + customLines.reduce((s, cl) => s + (Number(cl.qty) || 0), 0);

  // V5-W3-2026-05-26 方案 B:box_note 只放销售单号(纸箱小标签用)
  //   旧:autoNote = "美规110V电压 K115784"(纸箱写不下)
  //   新:autoNote = "K115784",电气标准移到 line_items[].electrical_standard 列(供应商参考)
  const countryCode = (so.shipping_address && (so.shipping_address.country_code || so.shipping_address.country)) || so.shipping_country || '';
  const standard = getElectricalStandard(countryCode, so.shipping_address?.country || so.shipping_country);
  const autoNote = `${so.shopify_order_number || ''}`;
  // V5-W3-2026-05-26 BUG FIX:同步 autoNote 到 state(但跟单改过的不动)
  if (!PO_FORM_STATE.boxNoteManuallyEdited) {
    PO_FORM_STATE.boxNote = autoNote;
  }

  // V5-W3-2026-05-26 per-line 备注自动生成：
  // - 每行独立生成,存到 PO_FORM_STATE.lineNotes[liid]
  // - 优先级:SKU 维护的 notes (products.notes) > 自动从 variant_title 提取尺寸/色温
  // - 跟单手动改过的行(lineNotesManuallyEdited[liid] === true)不再自动覆盖
  // - 电气标准不再混入备注 — 它去自己的"下单标准"列了
  console.log('%c[PoForm] 准备生成 per-line 备注', 'color:#2563eb; font-weight:bold');
  selected.forEach(([liid]) => {
    if (PO_FORM_STATE.lineNotesManuallyEdited[liid]) return;  // 跟单改过的不动
    const li = items.find(x => x.shopify_line_item_id === liid);
    if (!li) return;
    const eff = PRODUCTS_CACHE.effectiveBySku(li.sku) || {};
    const userNotes = (eff.notes || '').trim();
    let lineNote = '';
    if (userNotes) {
      lineNote = userNotes;
    } else {
      const extracted = extractVariantInfo(li.variant_title || '');
      if (extracted) lineNote = extracted;
    }
    PO_FORM_STATE.lineNotes[liid] = lineNote;
    console.log('  - SKU:', li.sku, '| 自动生成:', JSON.stringify(lineNote));
  });

  // V5-W3 兼容:otherNote 仍保留作为"全单 PO-level 备注"(可选)
  // 不再自动生成,跟单可在表单底部手填(用于全 PO 的全局说明)
  if (!PO_FORM_STATE.otherNoteManuallyEdited && !PO_FORM_STATE.otherNote) {
    PO_FORM_STATE.otherNote = '';  // 默认空,不再自动塞 variant 信息(那些去 lineNotes 了)
  }

  body.innerHTML = `
    ${(() => {
      const r = getRefundStatus(so);
      if (r.level === 'full') return `<div style="background:rgba(220,38,38,0.1); border:2px solid var(--danger); padding:12px 14px; border-radius:8px; margin-bottom:14px;"><div style="font-weight:700; color:var(--danger); font-size:14px;">⛔ 警告：订单已全额退款</div><div style="font-size:12px; color:var(--text-primary); margin-top:4px;">此订单不应再开采购单，请关闭并联系主管。</div></div>`;
      if (r.level === 'partial') return `<div style="background:rgba(217,119,6,0.1); border:2px solid var(--warning); padding:12px 14px; border-radius:8px; margin-bottom:14px;"><div style="font-weight:700; color:var(--warning); font-size:14px;">⚠️ 警告：订单已部分退款</div><div style="font-size:12px; color:var(--text-primary); margin-top:4px;">请核对实际需要采购的产品和数量，避免下错单。建议先取消勾选客户已退款的产品。</div></div>`;
      return '';
    })()}
    <div style="background: var(--bg-elevated); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 12px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
        <div><b>销售订单：</b>${escapeHtml(so.shopify_order_number || '')} <span style="color:var(--text-tertiary);">(${siteCode})</span></div>
        <div><b>客户：</b>${escapeHtml(so.customer_name || '')}</div>
        <div><b>金额：</b>${so.total_price ? parseFloat(so.total_price).toFixed(2) : '0'} ${so.currency || ''}</div>
        <div style="grid-column: 1/-1; color: var(--text-secondary);"><b>收货：</b>${escapeHtml(ship.country_code || '')} ${escapeHtml(ship.city || '')} ${escapeHtml(ship.address1 || '')}</div>
      </div>
    </div>
    ${(() => {
      const customerNote = (so.customer_note || '').trim();
      const internalNote = (so.internal_note || '').trim();
      const noteAttrs = (so.raw_payload?.note_attributes || []).filter(a => a.value && String(a.value).trim());
      if (!customerNote && !internalNote && noteAttrs.length === 0) return '';
      return `<div style="background: rgba(234,179,8,0.1); border: 1px solid rgba(234,179,8,0.3); padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px;">
        <div style="font-weight:600; color:var(--warning); margin-bottom:6px;">⚠️ 注意：本订单有备注信息</div>
        ${customerNote ? `<div style="margin-bottom:6px;"><b>💬 客户备注：</b><span style="white-space:pre-wrap;">${escapeHtml(customerNote)}</span></div>` : ''}
        ${noteAttrs.length > 0 ? `<div style="margin-bottom:6px;"><b>🏷 自定义字段：</b>${noteAttrs.map(a => `<span style="display:inline-block; background:rgba(0,0,0,0.05); padding:1px 6px; border-radius:3px; margin-right:4px;">${escapeHtml(a.name)}: ${escapeHtml(a.value)}</span>`).join('')}</div>` : ''}
        ${internalNote ? `<div><b>📝 内部备注：</b><span style="white-space:pre-wrap;">${escapeHtml(internalNote)}</span></div>` : ''}
      </div>`;
    })()}

    <h4 style="margin: 0 0 8px; font-size: 13px;">📦 选择产品（勾选要开采购单的）</h4>
    ${PO_FORM_STATE.splitMode ? `
      <div style="background: rgba(168, 85, 247, 0.1); border: 1px dashed rgba(168, 85, 247, 0.5); padding: 10px 12px; border-radius: 8px; margin-bottom: 10px; font-size: 12px;">
        <b style="color: #7c3aed;">✂ 拆单模式</b> · 系统已根据你在销售单上的勾选预选了产品。
        提交后这部分单独开 PO，剩余产品稍后可再次拆单开新 PO 给其他供应商。
      </div>` : ''}
    <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
      <div style="display: grid; grid-template-columns: 32px 80px 1fr 100px 130px 90px; gap: 12px; padding: 8px 10px; background: var(--bg-elevated); font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase;">
        <div></div><div>图</div><div>产品 (SKU/中文名)</div><div>数量</div><div>单价 ¥</div><div style="text-align:right;">小计</div>
      </div>
      ${itemsHtml}
      <div style="padding: 10px 12px; border-top: 1px dashed var(--border); background: var(--bg-elevated);">
        <button type="button" class="btn small" onclick="poFormAddCustomLine()" style="font-size:12px;">+ 添加自定义产品行（差价 / 配件 / 换货）</button>
        <span style="margin-left:10px; font-size:11px; color:var(--text-tertiary);">用于客户买 A 换成 B、补差价、加配件等场景</span>
      </div>
    </div>

    <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-secondary);">供应商 *</label>
        <div class="supplier-picker" style="display:flex; gap:6px;">
          <div style="flex:1; position:relative;">
            <input type="text" id="poFormSupplierInput" placeholder="🔍 输入供应商名搜索 / 直接添加…" style="width:100%;"
              value="${escapeHtml(PO_FORM_STATE.selectedSupplierName)}"
              oninput="poFormSupplierSearch(this.value)"
              onfocus="poFormSupplierSearch(this.value)"
              onblur="setTimeout(() => document.getElementById('poFormSupplierResults').classList.remove('show'), 200)">
            <div class="picker-results" id="poFormSupplierResults"></div>
          </div>
          <button type="button" class="btn small" onclick="poFormAddSupplierFromInput()" style="white-space:nowrap;" title="把输入框里的名字添加为新供应商">+ 新增</button>
        </div>
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-secondary);">下单日期 *</label>
        <input type="date" id="poFormPromisedDate" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
      </div>
      <div style="grid-column: 1/-1;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-secondary);">
          下单标准 ⚡ <span style="color:var(--text-tertiary); font-weight:normal;">(默认按客户国家自动选 · 可手动改 · 比如美客户在欧洲用→选欧规)</span>
        </label>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          ${(() => {
            const presets = ['美规110V电压','欧规220V电压','英规220V电压','澳规220V电压','中规220V电压','日规100V电压','韩规220V电压','巴标220V电压'];
            const auto = (typeof getElectricalStandard === 'function')
              ? (getElectricalStandard(PO_FORM_STATE._coCode, PO_FORM_STATE.salesOrder?.shipping_address?.country || '') || '')
              : '';
            const cur = (PO_FORM_STATE.electricalStandard !== undefined && PO_FORM_STATE.electricalStandard !== null)
              ? PO_FORM_STATE.electricalStandard : auto;
            const isCustom = cur && !presets.includes(cur);
            return `
              <select id="poFormStdSelect" onchange="poFormSetStd(this.value)"
                style="flex:1; min-width:180px; padding:7px 10px; border:1px solid var(--border); border-radius:6px; font-size:13px;">
                ${presets.map(p => `<option value="${p}" ${cur === p ? 'selected' : ''}>${p}${p === auto ? ' (默认按国家)' : ''}</option>`).join('')}
                <option value="__custom__" ${isCustom ? 'selected' : ''}>+ 自定义…</option>
              </select>
              <input type="text" id="poFormStdCustom" placeholder="自定义如:美规220V特殊电压"
                value="${isCustom ? escapeHtml(cur) : ''}"
                oninput="PO_FORM_STATE.electricalStandard = this.value"
                style="flex:1.2; min-width:160px; padding:7px 10px; border:1px solid var(--border); border-radius:6px; font-size:13px; ${isCustom ? '' : 'display:none;'}">
            `;
          })()}
        </div>
      </div>
      <div style="grid-column: 1/-1;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-secondary);">订单备注 (会写在纸箱上，供应商对单用) *</label>
        <input type="text" id="poFormBoxNote" class="form-control" value="${escapeHtml(PO_FORM_STATE.boxNote || autoNote)}" placeholder="自动生成"
          oninput="PO_FORM_STATE.boxNote = this.value; PO_FORM_STATE.boxNoteManuallyEdited = true;">
      </div>
      <div style="grid-column: 1/-1;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-secondary);">全单备注 <span style="color:var(--text-tertiary); font-weight:normal;">(可选 · 适用于整张 PO 的说明,比如"全部本周必出"。<b>per-line 细节请填到上面每行的「📝 本行备注」</b>)</span></label>
        <textarea id="poFormNote" class="form-control" rows="2" placeholder="可空。整张 PO 的通用说明..." oninput="PO_FORM_STATE.otherNote = this.value; PO_FORM_STATE.otherNoteManuallyEdited = true;">${escapeHtml(PO_FORM_STATE.otherNote || '')}</textarea>
      </div>
    </div>

    <div style="margin-top: 16px; padding: 12px; background: rgba(37,99,235,0.05); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <span style="font-size:12px; color:var(--text-secondary);">已选 ${selected.length} 行 · ${totalQty} 件</span>
      </div>
      <div style="font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 600;">
        合计：¥ ${totalAmount.toFixed(2)}
      </div>
    </div>
    ${(() => {
      const hasLargeQty = selected.some(([_, sel]) => Number(sel.qty) > 20);
      const hasLargeTotal = totalAmount > 5000;
      if (!hasLargeQty && !hasLargeTotal) return '';
      const reasons = [];
      if (hasLargeQty) reasons.push('有产品数量 > 20 件');
      if (hasLargeTotal) reasons.push('总金额 > ¥5000');
      return `<div style="margin-top:12px; padding:10px 14px; background:rgba(180,83,9,0.08); border-left:3px solid var(--warning); border-radius:6px;">
        <div style="font-size:13px; font-weight:600; color:var(--warning);">⚠️ 本采购单需主管审批</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:3px;">触发条件：${reasons.join('、')}。保存后状态为「待主管审批」，需主管批准后才能推进下一步。</div>
      </div>`;
    })()}
  `;
}

function poFormToggleItem(liid, checked) {
  PO_FORM_STATE.lineItemSelections[liid].checked = checked;
  renderPoForm();
}
// V5-W3-2026-05-26: per-line 备注 setter (跟单编辑某行备注时调用)
//   不调 renderPoForm()(避免每输一个字符就重渲染丢焦点)
//   标记 lineNotesManuallyEdited[liid] 防止自动逻辑覆盖
function poFormSetLineNote(liid, val) {
  PO_FORM_STATE.lineNotes = PO_FORM_STATE.lineNotes || {};
  PO_FORM_STATE.lineNotesManuallyEdited = PO_FORM_STATE.lineNotesManuallyEdited || {};
  PO_FORM_STATE.lineNotes[liid] = val;
  PO_FORM_STATE.lineNotesManuallyEdited[liid] = true;
}

// V28t:手动选/输入下单标准(美客户在欧洲用→可改欧规)
function poFormSetStd(v) {
  const customInput = document.getElementById('poFormStdCustom');
  if (v === '__custom__') {
    if (customInput) { customInput.style.display = ''; customInput.focus(); }
    PO_FORM_STATE.electricalStandard = customInput?.value || '';
  } else {
    if (customInput) customInput.style.display = 'none';
    PO_FORM_STATE.electricalStandard = v;
  }
  PO_FORM_STATE.electricalStandardManuallyEdited = true;
}
window.poFormSetStd = poFormSetStd;

// V28q:一键 AI 翻译本行备注(把残留英文规格翻成中文)
async function poFormTranslateLine(liid) {
  const input = document.getElementById('poLineNote_' + liid);
  if (!input) return;
  const original = input.value || '';
  // 没有英文字母就不用翻
  if (!/[a-zA-Z]{2,}/.test(original)) { toast('本行备注没有需要翻译的英文', 'info', 1500); return; }
  const btn = input.parentElement.querySelector('button');
  const oldTxt = btn ? btn.textContent : '';
  if (btn) { btn.textContent = '翻译中…'; btn.disabled = true; }
  try {
    const translated = await _aiTranslateSpec(original);
    if (translated) {
      input.value = translated;
      poFormSetLineNote(liid, translated);
      toast('✓ 已翻译', 'success', 1500);
    } else {
      toast('翻译无结果', 'warn');
    }
  } catch (e) {
    toast('翻译失败:' + (e.message || e), 'err', 4000);
  } finally {
    if (btn) { btn.textContent = oldTxt; btn.disabled = false; }
  }
}
window.poFormTranslateLine = poFormTranslateLine;

// V28q:通用 AI 翻译灯具规格(英文→中文 · 保留尺寸数字 · 灯具术语)
async function _aiTranslateSpec(text) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `你是灯具外贸跟单翻译助手。把下面的灯具产品规格翻译成简洁中文(发给中国工厂下单用)。规则:
- 尺寸数字/单位保留(cm/D/H 等),英寸转cm
- 灯具术语:Wall Lamp=壁灯, Pendant=吊灯, Chandelier=吊灯, Table Lamp=台灯, heads/lights=头
- 材质/工艺:Hydrographics=水转印, Wood Grain=木纹, Brass=黄铜, Glass=玻璃 等
- 色温:Warm Light/3000K=暖光3000K, Cool=冷光
- 已经是中文的保留不变
- 只输出翻译结果,不要解释,不要加引号

待翻译:
${text}`
      }],
    }),
  });
  if (!resp.ok) throw new Error('API ' + resp.status);
  const data = await resp.json();
  const out = (data.content || []).map(c => c.type === 'text' ? c.text : '').join('').trim();
  return out;
}
window._aiTranslateSpec = _aiTranslateSpec;
function poFormSetQty(liid, val) {
  PO_FORM_STATE.lineItemSelections[liid].qty = parseInt(val) || 0;
  renderPoForm();
}
function poFormSetPrice(liid, val) {
  PO_FORM_STATE.lineItemSelections[liid].price = val;
  renderPoForm();
}

// 修改销售单原始 line item 的 SKU / 中文名 / 图（用于换货 A→B 等场景）
async function poFormEditLine(liid) {
  const sel = PO_FORM_STATE.lineItemSelections[liid];
  const li = (PO_FORM_STATE.salesOrder.line_items || []).find(x => x.shopify_line_item_id === liid);
  if (!sel || !li) return;
  const eff = PRODUCTS_CACHE.effectiveBySku(li.sku) || {};
  const result = await showPrompt({
    title: '🔧 修改产品 (换货 / 差价 / 替换)',
    message: '把客户买的产品替换成实际要发的产品。留空表示保留原值。',
    fields: [
      { key: 'sku',   label: '新 SKU',      value: sel.customSku || eff.sku || li.sku, hint: '客户买的是 A，实际要发 B，填 B 的 SKU' },
      { key: 'title', label: '新中文名',     value: sel.customTitleCn || eff.name_cn || li.title || '' },
      { key: 'img',   label: '产品图片',     value: sel.customImageUrl || eff.image_url || li.image_url || '', type: 'image', hint: '可上传文件 / Ctrl+V 粘贴截图 / 直接拖入 / 输入 URL' },
    ],
  });
  if (!result) return;
  sel.customSku = result.sku.trim() || null;
  sel.customTitleCn = result.title.trim() || null;
  sel.customImageUrl = result.img.trim() || null;
  renderPoForm();
  toast('✓ 已修改');
}

// 恢复销售单原始 line item 默认值
function poFormResetLine(liid) {
  const sel = PO_FORM_STATE.lineItemSelections[liid];
  if (!sel) return;
  sel.customSku = null;
  sel.customTitleCn = null;
  sel.customImageUrl = null;
  renderPoForm();
  toast('已恢复默认');
}

// 自定义额外产品行（差价/配件/换货）
async function poFormAddCustomLine() {
  const result = await showPrompt({
    title: '+ 添加自定义产品行',
    message: '用于：差价补充 / 加配件 / A→B 换货等场景。',
    fields: [
      { key: 'sku',   label: 'SKU 编号',  value: '',  required: true, hint: '如 DIFF-001 / ACCESSORY-X / CUSTOM-XX' },
      { key: 'title', label: '中文名',    value: '',  required: true, hint: '如：差价补充 / 配件 / 换货 A→B' },
      { key: 'qty',   label: '数量',      value: '1', type: 'number', required: true },
      { key: 'price', label: '单价 ¥',    value: '0', type: 'number', required: true },
      { key: 'img',   label: '产品图片',  value: '',  type: 'image', hint: '可上传 / 粘贴 / 拖入 / URL（可选）' },
    ],
  });
  if (!result) return;
  PO_FORM_STATE.customLines.push({
    id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    sku: result.sku.trim(),
    title_cn: result.title.trim(),
    title_en: '',
    variant: '',
    image_url: (result.img || '').trim(),
    qty: parseInt(result.qty) || 1,
    price: parseFloat(result.price) || 0,
    is_custom: true,
  });
  renderPoForm();
  toast('✓ 已添加自定义产品行');
}

async function poFormEditCustomLine(id) {
  const cl = PO_FORM_STATE.customLines.find(x => x.id === id);
  if (!cl) return;
  const result = await showPrompt({
    title: '🔧 修改自定义产品行',
    fields: [
      { key: 'sku',   label: 'SKU 编号', value: cl.sku,      required: true },
      { key: 'title', label: '中文名',   value: cl.title_cn, required: true },
      { key: 'img',   label: '产品图片', value: cl.image_url || '', type: 'image', hint: '可上传 / 粘贴 / 拖入 / URL（可选）' },
    ],
  });
  if (!result) return;
  cl.sku = result.sku.trim();
  cl.title_cn = result.title.trim();
  cl.image_url = result.img.trim();
  renderPoForm();
  toast('✓ 已修改');
}

function poFormRemoveCustomLine(id) {
  if (!confirm('删除这一自定义产品行？')) return;
  PO_FORM_STATE.customLines = PO_FORM_STATE.customLines.filter(x => x.id !== id);
  renderPoForm();
  toast('已删除');
}

function poFormSetCustomQty(id, val) {
  const cl = PO_FORM_STATE.customLines.find(x => x.id === id);
  if (cl) { cl.qty = parseInt(val) || 0; renderPoForm(); }
}

function poFormSetCustomPrice(id, val) {
  const cl = PO_FORM_STATE.customLines.find(x => x.id === id);
  if (cl) { cl.price = parseFloat(val) || 0; renderPoForm(); }
}

// 编辑 SKU 备注（绑定到 products.notes）
async function editSkuNotes(sku) {
  // 走 master 穿透：编辑的是主产品的备注
  const eff = PRODUCTS_CACHE.effectiveBySku(sku);
  if (!eff) { toast('产品不存在', 'err'); return; }
  const newNotes = await showPrompt({
    title: `编辑 SKU 备注 「${eff.sku}」`,
    message: '这段备注会绑定到该 SKU（含同款组），下次开采购单时自动用作"其他备注"。\n常用于：翻译纠正、特殊要求、定制细节、配件标注等。',
    field: { label: 'SKU 备注', value: eff.notes || '', type: 'textarea', rows: 5, placeholder: '例：黑色铁艺 + E27 灯头 × 3 + 带遥控调光 + 美规插头' },
  });
  if (newNotes === null) return;
  try {
    // V4-2026-05-24: 跟单手动改备注 → 同时标 notes_locked,防止 AI 覆盖
    await sb.from('products').update({ 
      notes: newNotes.trim(),
      notes_locked: true,
      translation_source: 'manual',
    }).eq('id', eff.id);
    eff.notes = newNotes.trim();
    eff.notes_locked = true;
    toast('✓ 已保存 · 此后 AI 不再自动覆盖此备注');
    PO_FORM_STATE.otherNoteManuallyEdited = false;
    renderPoForm();
  } catch (e) { toast('保存失败：' + (e.message || e), 'err'); }
}

function poFormSupplierSearch(q) {
  const results = document.getElementById('poFormSupplierResults');
  const matches = SUPPLIERS.search(q);
  const exists = SUPPLIERS.byName(q.trim());
  
  // V5-2026-05-24: 智能推荐 - 同 SKU 之前下过单的供应商
  const history = PO_FORM_STATE?.supplierHistory || {};
  const historyKeys = Object.keys(history);
  
  // 推荐板块(只在没输入搜索词时显示,搜索时让位给搜索结果)
  let recommendHtml = '';
  if (!q.trim() && historyKeys.length > 0) {
    // 排序: 总订单数倒序 + 最近时间倒序
    const ranked = historyKeys
      .map(name => history[name])
      .sort((a, b) => {
        if (b.total_count !== a.total_count) return b.total_count - a.total_count;
        return (b.last_at || '').localeCompare(a.last_at || '');
      })
      .slice(0, 5);
    
    recommendHtml = `
      <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%); padding:6px 10px; font-size:11px; font-weight:600; color:#92400e; border-bottom:1px solid #fcd34d;">
        💡 推荐供应商（基于历史下单）
      </div>
      ${ranked.map(h => {
        const supObj = SUPPLIERS.byName(h.supplier);
        const priceTxt = h.avg_price ? `均价 ¥${h.avg_price.toFixed(0)}` : '';
        const lastTxt = h.last_at ? formatShortDate(h.last_at.slice(0,10)) : '';
        return `
        <div class="picker-item rec-item" onmousedown="poFormPickSupplierByName('${escapeHtml(h.supplier).replace(/'/g,"\\'")}')">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="color:#92400e; font-weight:600;">${escapeHtml(h.supplier)}</span>
            <span style="background:rgba(146,64,14,0.12); color:#92400e; padding:0 6px; border-radius:3px; font-size:10px; font-weight:600;">该 SKU 下过 ${h.total_count} 次</span>
          </div>
          <div class="stats" style="color:#78350f;">
            ${priceTxt}${priceTxt && lastTxt ? ' · ' : ''}${lastTxt ? '上次 ' + lastTxt : ''}${supObj?.contact_phone ? ' · ☎ ' + supObj.contact_phone : ''}
          </div>
        </div>`;
      }).join('')}
      ${matches.length > 0 ? `<div style="background:#f9fafb; padding:6px 10px; font-size:11px; font-weight:600; color:#6b7280; border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb;">所有供应商</div>` : ''}
    `;
  }
  
  // 给搜索结果加上"这个供应商有历史"的徽章
  let html = recommendHtml + matches.map(s => {
    const histInfo = history[s.name];
    const histBadge = histInfo 
      ? `<span style="background:rgba(245,158,11,0.18); color:#b45309; padding:0 6px; border-radius:3px; font-size:10px; font-weight:600; margin-left:6px;">⭐ 历史 ${histInfo.total_count}</span>`
      : '';
    return `
    <div class="picker-item" onmousedown="poFormPickSupplier('${s.id}', '${escapeHtml(s.name).replace(/'/g,"\\'")}')">
      <div>${escapeHtml(s.name)}${histBadge}</div>
      <div class="stats">${s.contact_name || ''} ${s.contact_phone || ''} · ${s.total_orders || 0} 次合作</div>
    </div>`;
  }).join('');
  
  if (q.trim() && !exists) {
    html += `<div class="picker-item new" onmousedown="poFormQuickAddSupplier('${escapeHtml(q.trim()).replace(/'/g,"\\'")}')">+ 新增供应商 "${escapeHtml(q.trim())}"</div>`;
  }
  results.innerHTML = html || '<div class="picker-item" style="color:var(--text-tertiary)">没有匹配的供应商</div>';
  results.classList.add('show');
}

// V5: 通过名字选择(用于历史推荐 - 可能供应商在 SUPPLIERS 列表里没找到 id)
function poFormPickSupplierByName(name) {
  const sup = SUPPLIERS.byName(name);
  if (sup) {
    poFormPickSupplier(sup.id, sup.name);
  } else {
    // 历史里有但 suppliers 表没有 - 自动添加
    poFormQuickAddSupplier(name);
  }
}

function poFormPickSupplier(id, name) {
  PO_FORM_STATE.selectedSupplierId = id;
  PO_FORM_STATE.selectedSupplierName = name;
  document.getElementById('poFormSupplierInput').value = name;
  document.getElementById('poFormSupplierResults').classList.remove('show');
}

async function poFormQuickAddSupplier(name) {
  try {
    const { data, error } = await sb.from('suppliers').insert({ name }).select().single();
    if (error) throw error;
    SUPPLIERS._list.push(data);
    poFormPickSupplier(data.id, data.name);
    toast('已新增供应商');
  } catch (e) { toast('新增失败：' + (e.message || e), 'err'); }
}

async function poFormAddSupplierFromInput() {
  const input = document.getElementById('poFormSupplierInput');
  const name = (input.value || '').trim();
  if (!name) {
    // 输入框为空 → 弹出完整新增供应商表单
    openSupplierEdit(null);
    return;
  }
  // 检查是否已存在
  const existing = SUPPLIERS.byName(name);
  if (existing) {
    poFormPickSupplier(existing.id, existing.name);
    toast('供应商已存在，已选中', 'info');
    return;
  }
  // 新增
  await poFormQuickAddSupplier(name);
}

function closePoForm() {
  document.getElementById('poFormModal').style.display = 'none';
  PO_FORM_STATE = null;
}

async function poFormSave() {
  // V28t:防双击/重复保存(避免出现 2 张相同 PO)
  if (poFormSave._busy) return;
  poFormSave._busy = true;
  const _saveBtn = document.getElementById('poFormSaveBtn');
  if (_saveBtn) { _saveBtn.disabled = true; _saveBtn.textContent = '保存中…'; }
  try {
    return await _poFormSaveInner();
  } finally {
    poFormSave._busy = false;
    if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.textContent = '保存采购单'; }
  }
}

async function _poFormSaveInner() {
  const so = PO_FORM_STATE.salesOrder;
  const selected = Object.entries(PO_FORM_STATE.lineItemSelections).filter(([_, sel]) => sel.checked && sel.qty > 0);
  const customLines = (PO_FORM_STATE.customLines || []).filter(cl => cl.qty > 0);
  if (selected.length === 0 && customLines.length === 0) { toast('请勾选至少 1 个产品（或添加自定义行）', 'warn'); return; }

  const supplierName = document.getElementById('poFormSupplierInput').value.trim();
  if (!supplierName) { toast('请选择/输入供应商', 'warn'); return; }
  let supplierId = PO_FORM_STATE.selectedSupplierId;
  // 如果用户改了输入但没从下拉选，按名字找；找不到就新增
  if (!supplierId || (SUPPLIERS.byId(supplierId)?.name !== supplierName)) {
    const found = SUPPLIERS.byName(supplierName);
    if (found) supplierId = found.id;
    else {
      const { data, error } = await sb.from('suppliers').insert({ name: supplierName }).select().single();
      if (error) { toast('新增供应商失败：' + error.message, 'err'); return; }
      SUPPLIERS._list.push(data);
      supplierId = data.id;
    }
  }

  const boxNote = document.getElementById('poFormBoxNote').value.trim();
  const promisedDate = document.getElementById('poFormPromisedDate').value;
  const note = document.getElementById('poFormNote').value.trim();

  if (!promisedDate) { toast('请填下单日期', 'warn'); return; }
  for (const [liid, sel] of selected) {
    if (!sel.price || Number(sel.price) <= 0) { toast('请填所有勾选产品的单价', 'warn'); return; }
  }
  for (const cl of customLines) {
    if (!cl.price || Number(cl.price) <= 0) { toast(`自定义产品「${cl.sku}」未填单价`, 'warn'); return; }
  }

  // 检查多供应商：按 default_supplier 拆
  const items = so.line_items || [];
  const groups = {};  // supplierName => [liid...]
  selected.forEach(([liid, sel]) => {
    const li = items.find(x => x.shopify_line_item_id === liid);
    const eff = PRODUCTS_CACHE.effectiveBySku(li.sku) || {};
    const supName = eff.default_supplier || supplierName;
    if (!groups[supName]) groups[supName] = [];
    groups[supName].push(liid);
  });

  if (Object.keys(groups).length > 1) {
    // 多供应商，弹提示
    const totals = Object.entries(groups).map(([name, liids]) => {
      const qty = liids.reduce((s, lid) => s + (PO_FORM_STATE.lineItemSelections[lid].qty || 0), 0);
      return { name, count: liids.length, qty };
    });
    document.getElementById('multiSupplierBody').innerHTML = `
      <p style="font-size: 13px; line-height: 1.6;">检测到选中的产品来自 <b>${totals.length} 个不同的默认供应商</b>：</p>
      <ul style="font-size: 13px; padding-left: 20px; line-height: 1.8;">
        ${totals.map(t => `<li><b>${escapeHtml(t.name)}</b> · ${t.count} 个产品 · ${t.qty} 件</li>`).join('')}
      </ul>
      <p style="font-size: 12px; color: var(--text-secondary); margin-top: 12px;">
        选 <b>一键拆 ${totals.length} 张</b>：按供应商自动生成 ${totals.length} 张采购单（合计 ${totals.length} 张）<br>
        选 <b>手动单独开</b>：取消本次保存，回上一步自己分批选
      </p>
    `;
    document.getElementById('multiSupplierConfirm').style.display = 'flex';
    PO_FORM_STATE._pendingGroups = groups;
    PO_FORM_STATE._formData = { boxNote, promisedDate, note, supplierIdFallback: supplierId, supplierNameFallback: supplierName };
    return;
  }

  // 单供应商，直接保存（customLines 都跟在这个供应商下）
  await poFormDoSave([{ supplierId, supplierName, liids: selected.map(([liid]) => liid), customLines }], { boxNote, promisedDate, note });
}

function closeMultiSupplierConfirm() {
  document.getElementById('multiSupplierConfirm').style.display = 'none';
}

async function multiSupplierChoice(choice) {
  document.getElementById('multiSupplierConfirm').style.display = 'none';
  if (choice === 'manual') return;
  const groups = PO_FORM_STATE._pendingGroups;
  const fd = PO_FORM_STATE._formData;
  const customLines = (PO_FORM_STATE.customLines || []).filter(cl => cl.qty > 0);
  const all = [];
  let isFirst = true;
  for (const [supName, liids] of Object.entries(groups)) {
    let supId;
    const existing = SUPPLIERS.byName(supName);
    if (existing) supId = existing.id;
    else {
      const { data } = await sb.from('suppliers').insert({ name: supName }).select().single();
      if (data) { SUPPLIERS._list.push(data); supId = data.id; }
    }
    // 自定义产品行只挂在第一组（默认归当前主供应商）
    all.push({ supplierId: supId || fd.supplierIdFallback, supplierName: supName, liids, customLines: isFirst ? customLines : [] });
    isFirst = false;
  }
  await poFormDoSave(all, fd);
}

async function poFormDoSave(groups, common) {
  const so = PO_FORM_STATE.salesOrder;
  const items = so.line_items || [];
  const siteCode = SHOPIFY.siteCodeOf(so.shop_domain);
  const me = (typeof CURRENT_AGENT === 'string' && CURRENT_AGENT) ? CURRENT_AGENT : '系统';

  // agent_id 必填校验 + fallback：先用全局，再 fall back 到 supabase auth
  let agentId = (typeof CURRENT_USER_ID === 'string') ? CURRENT_USER_ID : null;
  if (!agentId) {
    try {
      const { data: { user } } = await sb.auth.getUser();
      agentId = user?.id || null;
    } catch (e) {}
  }
  console.log('%c[poFormDoSave] CURRENT_USER_ID:', 'color:#2563eb', CURRENT_USER_ID, '| 最终 agent_id:', agentId);
  if (!agentId) {
    toast('当前账号未识别，请刷新页面重新登录', 'err');
    return;
  }

  try {
    const allInserts = [];
    const allLineItemUpdates = JSON.parse(JSON.stringify(so.line_items));  // 深拷

    // V5-W3-2026-05-26: 在 PO 层面计算电气标准(从销售订单的国家)
    // 后续每个 liData 都会带上这个 standard(per-line 字段,future 合箱时可不同)
    const _coCode = (so.shipping_address && (so.shipping_address.country_code || so.shipping_address.country)) || so.shipping_country || '';
    const _poStandard = (PO_FORM_STATE.electricalStandardManuallyEdited && PO_FORM_STATE.electricalStandard)
      ? PO_FORM_STATE.electricalStandard
      : (getElectricalStandard(_coCode, so.shipping_address?.country || so.shipping_country) || '');

    for (const g of groups) {
      // 生成 PO 编号
      const { data: poNum, error: poNumErr } = await sb.rpc('generate_po_number');
      if (poNumErr) { console.error('PO编号生成失败：', poNumErr); throw new Error('PO 编号生成失败：' + poNumErr.message); }
      if (!poNum) throw new Error('生成采购单编号失败 (no data)');

      const liData = g.liids.map(liid => {
        const li = items.find(x => x.shopify_line_item_id === liid);
        const sel = PO_FORM_STATE.lineItemSelections[liid];
        const eff = PRODUCTS_CACHE.effectiveBySku(li.sku) || {};
        // 用户改过则用 custom 字段，否则用 effective/li 原始字段
        return {
          shopify_line_item_id: liid,
          sku: sel.customSku || eff.sku || li.sku,
          title_cn: sel.customTitleCn || eff.name_cn || '',
          title_en: li.title || '',
          variant: li.variant_title || '',
          image_url: sel.customImageUrl || eff.image_url || li.image_url || '',
          qty: Number(sel.qty),
          price: Number(sel.price),
          subtotal: Number(sel.qty) * Number(sel.price),
          edited: !!(sel.customSku || sel.customTitleCn || sel.customImageUrl),
          // V5-W3-2026-05-26: per-line 电气标准 + 备注
          electrical_standard: _poStandard,
          line_note: (PO_FORM_STATE.lineNotes && PO_FORM_STATE.lineNotes[liid]) || '',
        };
      });
      // 把自定义产品行追加到 liData
      (g.customLines || []).forEach(cl => {
        liData.push({
          shopify_line_item_id: null,  // 自定义没有 shopify line id
          sku: cl.sku,
          title_cn: cl.title_cn || '',
          title_en: cl.title_en || '',
          variant: cl.variant || '',
          image_url: cl.image_url || '',
          qty: Number(cl.qty),
          price: Number(cl.price),
          subtotal: Number(cl.qty) * Number(cl.price),
          is_custom: true,
          // V5-W3-2026-05-26: 自定义行也带上电气标准(默认跟订单走)+ 空 line_note(跟单填)
          electrical_standard: _poStandard,
          line_note: cl.note || '',
        });
      });
      const totalAmount = liData.reduce((s, x) => s + x.subtotal, 0);
      const firstLi = liData[0];

      // 审批触发：单个产品数量 > 20 或总金额 > 5000
      const needsApproval = liData.some(li => li.qty > 20) || totalAmount > 5000;
      const initialStatus = needsApproval ? 'pending_approval' : 'producing';

      const poRow = {
        agent_id: agentId,
        po_number: poNum,
        source: 'shopify',
        supplier: g.supplierName,
        product: liData.map(x => x.title_cn || x.title_en).join(' / '),
        status: initialStatus,
        promised_date: common.promisedDate,
        line_items: liData,
        box_note: common.boxNote,
        total_amount: totalAmount,
        sales_order_id: so.id,
        creator_name: me,
        site: siteCode,
        order_no: so.shopify_order_number,
        note: common.note,
        followups: [],
      };
      console.log('保存采购单：', poRow);
      const { data: created, error: err } = await sb.from('orders').insert(poRow).select().single();
      if (err) { console.error('采购单 insert 失败：', err, '\n字段：', poRow); throw new Error('数据库插入失败：' + (err.message || JSON.stringify(err))); }
      allInserts.push(created);

      // 更新 line_items 的 po_assignments
      g.liids.forEach((liid, idx) => {
        const target = allLineItemUpdates.find(x => x.shopify_line_item_id === liid);
        if (target) {
          target.po_assignments = target.po_assignments || [];
          target.po_assignments.push({
            po_id: created.id,
            po_number: poNum,
            qty: liData[idx].qty,
            supplier: g.supplierName,
            created_at: new Date().toISOString(),
          });
        }
      });

      // 更新 products 表的 last_purchase_price / default_supplier
      for (const li of liData) {
        const { error: pErr } = await sb.from('products').update({
          last_purchase_price: li.price,
          default_supplier: g.supplierName,
          last_purchased_at: new Date().toISOString(),
        }).eq('sku', li.sku);
        if (pErr) console.warn('更新产品上次单价失败（不影响主流程）：', li.sku, pErr.message);
      }
      
      // V4-2026-05-24: 如果跟单手动改过"其他备注"且是单 SKU PO
      // → 把这个改动同步回 products.notes + 标记 notes_locked
      // (多 SKU PO 不自动同步,因为无法判断哪段对应哪个 SKU)
      if (common.note && common.note.trim() && liData.length === 1 && PO_FORM_STATE.otherNoteManuallyEdited) {
        const targetSku = liData[0].sku;
        try {
          await sb.from('products').update({
            notes: common.note.trim(),
            notes_locked: true,
            translation_source: 'manual',
          }).eq('sku', targetSku);
          console.log(`[po] ✓ 已同步备注到 SKU ${targetSku} 并锁定(不再被 AI 覆盖)`);
          // 同步本地缓存
          if (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE._all) {
            const cached = PRODUCTS_CACHE._all.find(x => x.sku === targetSku);
            if (cached) {
              cached.notes = common.note.trim();
              cached.notes_locked = true;
            }
          }
        } catch (e) {
          console.warn('同步备注到 SKU 库失败(不影响 PO 创建):', e);
        }
      }

      // 更新 suppliers 累计
      if (g.supplierId) {
        const sup = SUPPLIERS.byId(g.supplierId);
        if (sup) {
          const { error: sErr } = await sb.from('suppliers').update({
            total_orders: (sup.total_orders || 0) + 1,
            total_amount: (Number(sup.total_amount) || 0) + totalAmount,
            last_order_at: new Date().toISOString(),
          }).eq('id', g.supplierId);
          if (sErr) console.warn('更新供应商累计失败（不影响主流程）：', sErr.message);
        }
      }
    }

    // 检测：是否所有 line_items 都已全部分配 PO 了 → 自动标记销售单为 done（移出待办列表）
    const allFullyAssigned = allLineItemUpdates.every(li => {
      const totalAssigned = (li.po_assignments || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
      return totalAssigned >= (Number(li.quantity) || 0);
    });
    const newLocalStatus = allFullyAssigned ? 'done' : 'processing';

    // 把更新后的 line_items 写回 shopify_orders
    const { error: soErr } = await sb.from('shopify_orders').update({
      line_items: allLineItemUpdates,
      local_status: newLocalStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', so.id);
    if (soErr) console.warn('更新销售订单 line_items 失败：', soErr.message);

    const hasPending = allInserts.some(po => po.status === 'pending_approval');
    if (hasPending) {
      toast(`✓ 已开 ${allInserts.length} 张采购单，${allInserts.filter(p=>p.status==='pending_approval').length} 张待主管审批`, 'info');
    } else if (allFullyAssigned) {
      toast(`✓ 成功开 ${allInserts.length} 张采购单，销售单已全部分配，自动移至「已完成」`);
    } else {
      toast(`✓ 成功开 ${allInserts.length} 张采购单`);
    }
    closePoForm();
    SHOPIFY.invalidateOrders();  // 销售单 line_items 已变化，下次进 tab 强制刷新
    PRODUCTS_CACHE.invalidate(); // 产品上次单价/默认供应商已更新
    SUPPLIERS.invalidate();      // 供应商累计已更新
    // 切换到采购单 tab 看刚开的单
    switchTab('po');
  } catch (e) {
    console.error('保存采购单错误：', e);
    toast('保存失败：' + (e.message || JSON.stringify(e) || '未知错误'), 'err');
  }
}

// ============ 供应商档案管理 ============
async function openSuppliersManager() {
  try {
    await SUPPLIERS.loadAll();
    document.getElementById('suppliersModal').style.display = 'flex';
    renderSuppliersList();
  } catch (e) { toast('加载供应商失败：' + (e.message || e), 'err'); }
}

function closeSuppliersManager() {
  document.getElementById('suppliersModal').style.display = 'none';
}

function renderSuppliersList() {
  const rawQ = document.getElementById('supSearch').value || '';
  const keywords = rawQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sort = document.getElementById('supSort').value;
  let list = SUPPLIERS._list.filter(s => {
    if (keywords.length === 0) return true;
    const haystack = ((s.name || '') + ' ' + (s.contact_name || '') + ' ' + (s.contact_phone || '')).toLowerCase();
    const haystackNoSpace = haystack.replace(/\s+/g, '');
    return keywords.every(kw => {
      const kwNoSpace = kw.replace(/\s+/g, '');
      return haystack.includes(kw) || haystackNoSpace.includes(kwNoSpace);
    });
  });
  if (sort === 'orders') list.sort((a,b) => (b.total_orders||0) - (a.total_orders||0));
  else if (sort === 'name') list.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  else if (sort === 'recent') list.sort((a,b) => new Date(b.last_order_at||0) - new Date(a.last_order_at||0));

  // V4：统计待审批数量，主管端显眼提示
  const pendingCount = SUPPLIERS._list.filter(s => s.approval_status === 'pending_approval').length;

  const body = document.getElementById('suppliersListBody');
  if (list.length === 0) {
    body.innerHTML = '<div style="padding:32px; text-align:center; color:var(--text-tertiary);">无匹配</div>';
    return;
  }
  body.innerHTML = `
    ${pendingCount > 0 && IS_ADMIN ? `
      <div style="background: rgba(202,138,4,0.08); border: 1px solid rgba(202,138,4,0.3); padding: 10px 14px; margin-bottom: 10px; border-radius: 6px; font-size: 13px;">
        <b style="color: #854f0b;">⏳ ${pendingCount} 家供应商待你审批</b>
        · 跟单新建后必须主管批准才能用于下 PO
        <button class="btn small" onclick="document.getElementById('supSearch').value=''; supplierFilterPending=!supplierFilterPending; renderSuppliersList();" style="margin-left: 10px; padding: 2px 10px; font-size: 11px;">
          ${supplierFilterPending ? '显示全部' : '仅看待审批'}
        </button>
      </div>` : ''}
    <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; overflow:hidden;">
      <div class="supplier-header">
        <div>名称</div><div>联系人</div><div>电话</div><div style="text-align:right;">下单数</div><div></div>
      </div>
      ${(supplierFilterPending ? list.filter(s => s.approval_status === 'pending_approval') : list).map(s => {
        const apprStatus = s.approval_status || 'approved';
        const statusBadge = apprStatus === 'pending_approval' 
          ? '<span style="display:inline-block; padding:1px 6px; background:rgba(202,138,4,0.15); color:#854f0b; border-radius:3px; font-size:10px; font-weight:600; margin-left:6px;">⏳ 待审批</span>'
          : apprStatus === 'rejected'
          ? '<span style="display:inline-block; padding:1px 6px; background:rgba(220,38,38,0.15); color:#dc2626; border-radius:3px; font-size:10px; font-weight:600; margin-left:6px;">❌ 已驳回</span>'
          : '';
        const syncBadge = s.finance_synced_at 
          ? '<span style="display:inline-block; padding:1px 6px; background:rgba(21,128,61,0.1); color:#15803d; border-radius:3px; font-size:10px; font-weight:600; margin-left:4px;" title="已同步到财务系统">💰 已同步</span>'
          : '';
        return `
        <div class="supplier-row" onclick="openSupplierEdit('${s.id}')" ${apprStatus === 'pending_approval' ? 'style="background: rgba(202,138,4,0.04);"' : ''}>
          <div class="name">${escapeHtml(s.name)}${statusBadge}${syncBadge}</div>
          <div class="contact">${escapeHtml(s.contact_name || '—')}</div>
          <div class="phone">${escapeHtml(s.contact_phone || '—')}</div>
          <div class="orders">${s.total_orders || 0}</div>
          <div class="actions">
            <button class="btn small" onclick="event.stopPropagation(); openSupplierStatement('${s.id}')" title="月度对账单 · 当月 PO 列表 + 合计 + 一键导出" style="background:rgba(13,148,136,0.06); border-color:rgba(13,148,136,0.3); color:var(--teal); margin-right:4px;">📊 对账</button>
            <button class="btn small" onclick="event.stopPropagation(); openSupplierEdit('${s.id}')">编辑</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div style="padding:10px; text-align:center; color:var(--text-tertiary); font-size:11px;">共 ${list.length} 家${pendingCount > 0 ? ` · ⏳ ${pendingCount} 待审批` : ''}</div>
  `;
}

// ============================================================
// V20260527x: 供应商月度对账单
// 月底跟供应商对账场景:本月在你家下了多少单 · 多少件 · 总金额
// 一键导出 CSV(给供应商发邮件)+ 打印友好 HTML(打印盖章用)
// ============================================================
let SUPPLIER_STMT = null;

async function openSupplierStatement(supplierId) {
  const s = SUPPLIERS.byId(supplierId);
  if (!s) { toast('找不到供应商', 'err'); return; }
  
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  SUPPLIER_STMT = {
    supplier: s,
    month: thisMonth,
    pos: [],
    loading: true,
  };
  
  document.getElementById('supplierStatementModal').style.display = 'flex';
  _renderSupplierStatementBody();
  await _loadSupplierStatementData();
  _renderSupplierStatementBody();
}
window.openSupplierStatement = openSupplierStatement;

function closeSupplierStatement() {
  document.getElementById('supplierStatementModal').style.display = 'none';
  SUPPLIER_STMT = null;
}
window.closeSupplierStatement = closeSupplierStatement;

async function _loadSupplierStatementData() {
  if (!SUPPLIER_STMT) return;
  SUPPLIER_STMT.loading = true;
  
  const { supplier, month } = SUPPLIER_STMT;
  const [y, m] = month.split('-').map(Number);
  const fromDate = `${y}-${String(m).padStart(2, '0')}-01T00:00:00`;
  // 下个月第一天
  const nextMonth = new Date(y, m, 1).toISOString();
  
  try {
    const { data, error } = await sb.from('orders')
      .select('id, po_number, supplier, source, status, promised_date, created_at, line_items, total_amount, box_note, creator_name, sales_order_id, site')
      .eq('supplier', supplier.name)
      .not('po_number', 'is', null)
      .gte('created_at', fromDate)
      .lt('created_at', nextMonth)
      .order('created_at', { ascending: true });
    if (error) throw error;
    SUPPLIER_STMT.pos = data || [];
  } catch (e) {
    console.error('加载对账数据失败:', e);
    toast('加载失败:' + (e.message || e), 'err');
    SUPPLIER_STMT.pos = [];
  }
  SUPPLIER_STMT.loading = false;
}

function changeStatementMonth(newMonth) {
  if (!SUPPLIER_STMT) return;
  SUPPLIER_STMT.month = newMonth;
  SUPPLIER_STMT.loading = true;
  _renderSupplierStatementBody();
  _loadSupplierStatementData().then(_renderSupplierStatementBody);
}
window.changeStatementMonth = changeStatementMonth;

// 月份选择器:从 12 个月前到当月
function _monthsForSelect() {
  const arr = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    arr.push(value);
  }
  return arr;
}

function _renderSupplierStatementBody() {
  const body = document.getElementById('supplierStatementBody');
  if (!body || !SUPPLIER_STMT) return;
  
  const { supplier, month, pos, loading } = SUPPLIER_STMT;
  
  // 合计
  let totalPOs = pos.length;
  let totalItems = 0;
  let totalAmount = 0;
  let cancelledCount = 0;
  pos.forEach(p => {
    if (p.status === 'cancelled') { cancelledCount++; return; }
    totalAmount += Number(p.total_amount || 0);
    (p.line_items || []).forEach(li => totalItems += Number(li.qty || 0));
  });
  const activePOs = totalPOs - cancelledCount;
  
  body.innerHTML = `
    <!-- 供应商基本信息 -->
    <div style="display:flex; gap:16px; align-items:flex-start; padding:14px; background:var(--bg-elevated); border-radius:8px; margin-bottom:14px;">
      <div style="flex:1; min-width:0;">
        <div style="font-size:16px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">${escapeHtml(supplier.name)}</div>
        <div style="font-size:12px; color:var(--text-secondary); display:flex; flex-wrap:wrap; gap:10px;">
          ${supplier.contact_name ? `<span>👤 ${escapeHtml(supplier.contact_name)}</span>` : ''}
          ${supplier.contact_phone ? `<span>📞 ${escapeHtml(supplier.contact_phone)}</span>` : ''}
          ${supplier.payment_terms ? `<span>💳 ${escapeHtml(supplier.payment_terms)}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <label style="font-size:11px; color:var(--text-tertiary); margin-bottom:4px; display:block;">对账月份</label>
        <select onchange="changeStatementMonth(this.value)" style="padding:6px 10px; font-size:12.5px; border:1px solid var(--border); border-radius:6px; background:white; font-family:monospace;">
          ${_monthsForSelect().map(mm => `<option value="${mm}" ${mm === month ? 'selected' : ''}>${mm}${mm === month ? '' : ''}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- 合计区 -->
    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin-bottom:14px;">
      <div style="padding:12px; background:rgba(37,99,235,0.05); border:1px solid rgba(37,99,235,0.15); border-radius:8px;">
        <div style="font-size:10px; color:var(--text-tertiary); margin-bottom:3px;">PO 单数</div>
        <div style="font-size:22px; font-weight:700; color:var(--accent); font-family:monospace;">${activePOs}</div>
        ${cancelledCount > 0 ? `<div style="font-size:10px; color:var(--text-tertiary); margin-top:2px;">+${cancelledCount} 已取消</div>` : ''}
      </div>
      <div style="padding:12px; background:rgba(13,148,136,0.05); border:1px solid rgba(13,148,136,0.15); border-radius:8px;">
        <div style="font-size:10px; color:var(--text-tertiary); margin-bottom:3px;">总件数</div>
        <div style="font-size:22px; font-weight:700; color:var(--teal); font-family:monospace;">${totalItems}</div>
      </div>
      <div style="padding:12px; background:rgba(22,163,74,0.05); border:1px solid rgba(22,163,74,0.15); border-radius:8px; grid-column: span 2;">
        <div style="font-size:10px; color:var(--text-tertiary); margin-bottom:3px;">总金额(本月 · 不含已取消)</div>
        <div style="font-size:24px; font-weight:700; color:var(--success); font-family:monospace;">¥ ${totalAmount.toFixed(2)}</div>
      </div>
    </div>

    <!-- PO 列表 -->
    ${loading ? `
      <div style="padding:32px; text-align:center; color:var(--text-tertiary);">📦 加载中...</div>
    ` : pos.length === 0 ? `
      <div style="padding:32px; text-align:center; color:var(--text-tertiary); background:var(--bg-card); border:1px dashed var(--border); border-radius:8px;">
        本月没有在「${escapeHtml(supplier.name)}」开过 PO
      </div>
    ` : `
      <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; overflow:hidden;">
        <div style="display:grid; grid-template-columns: 100px 1fr 70px 100px 90px; gap:8px; padding:8px 12px; background:var(--bg-elevated); font-size:10.5px; font-weight:600; color:var(--text-tertiary); text-transform:uppercase;">
          <div>PO 号</div>
          <div>产品明细</div>
          <div style="text-align:center;">件数</div>
          <div style="text-align:right;">金额</div>
          <div style="text-align:center;">状态</div>
        </div>
        ${pos.map(p => {
          const items = p.line_items || [];
          const qty = items.reduce((s, li) => s + Number(li.qty || 0), 0);
          const isCancelled = p.status === 'cancelled';
          const statusMeta = _poStatusMeta(p.status);
          return `
          <div style="display:grid; grid-template-columns: 100px 1fr 70px 100px 90px; gap:8px; padding:10px 12px; border-top:1px solid var(--border-subtle); font-size:12px; align-items:flex-start; ${isCancelled ? 'opacity:0.5; text-decoration:line-through;' : ''}">
            <div style="font-family:monospace; color:var(--accent); font-size:11.5px;">${escapeHtml(p.po_number || '')}</div>
            <div style="font-size:11.5px; line-height:1.5;">
              ${items.map(li => `<div>${escapeHtml(li.title_cn || li.sku || '')} <span style="color:var(--text-tertiary); font-family:monospace;">${escapeHtml(li.sku || '')}</span> × ${li.qty}</div>`).join('')}
              ${p.box_note ? `<div style="font-size:10.5px; color:var(--text-tertiary); margin-top:3px;">📝 ${escapeHtml(p.box_note)}</div>` : ''}
            </div>
            <div style="text-align:center; font-family:monospace; font-weight:600;">${qty}</div>
            <div style="text-align:right; font-family:monospace; font-weight:600; color:var(--text-primary);">¥${Number(p.total_amount || 0).toFixed(2)}</div>
            <div style="text-align:center;">
              <span style="display:inline-block; padding:2px 8px; font-size:10.5px; border-radius:10px; background:${statusMeta.bg}; color:${statusMeta.color}; font-weight:600;">${statusMeta.label}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    `}
    
    <!-- 导出按钮 -->
    <div style="display:flex; gap:8px; margin-top:16px; padding-top:12px; border-top:1px solid var(--border-subtle);">
      <button class="btn" onclick="exportSupplierStatementCsv()" ${pos.length === 0 ? 'disabled style="opacity:0.5;"' : ''}>📥 导出 CSV(发邮件)</button>
      <button class="btn" onclick="printSupplierStatement()" ${pos.length === 0 ? 'disabled style="opacity:0.5;"' : ''}>🖨 打印对账单(可盖章)</button>
      <span style="margin-left:auto; font-size:11px; color:var(--text-tertiary); align-self:center;">
        💡 CSV 用 Excel 打开 · 打印版含合计 + 印章位
      </span>
    </div>
  `;
}

function _poStatusMeta(status) {
  const meta = {
    pending_approval: { label: '⏳ 待审批', bg: 'rgba(202,138,4,0.1)', color: '#854f0b' },
    producing:        { label: '生产中', bg: 'rgba(37,99,235,0.1)', color: 'var(--accent)' },
    shipped:          { label: '已发货', bg: 'rgba(124,58,237,0.1)', color: 'var(--purple)' },
    arrived:          { label: '已到货', bg: 'rgba(13,148,136,0.1)', color: 'var(--teal)' },
    inventory:        { label: '已入库', bg: 'rgba(22,163,74,0.1)', color: 'var(--success)' },
    cancelled:        { label: '已取消', bg: 'rgba(107,114,128,0.1)', color: 'var(--text-tertiary)' },
    rejected:         { label: '已驳回', bg: 'rgba(220,38,38,0.1)', color: 'var(--danger)' },
  };
  return meta[status] || { label: status, bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' };
}

// 导出 CSV(逐 PO 一行)· 文件名:对账_广州X厂_2026-05.csv
function exportSupplierStatementCsv() {
  if (!SUPPLIER_STMT || SUPPLIER_STMT.pos.length === 0) { toast('无数据', 'warn'); return; }
  const { supplier, month, pos } = SUPPLIER_STMT;
  
  const header = ['PO 号', '下单日期', '约交期', '产品明细', '总件数', '总金额(¥)', '状态', '备注'];
  const rows = pos.map(p => {
    const items = p.line_items || [];
    const qty = items.reduce((s, li) => s + Number(li.qty || 0), 0);
    const products = items.map(li => `${li.title_cn || li.sku}(${li.sku}) ×${li.qty}`).join(' / ');
    const statusLabel = _poStatusMeta(p.status).label.replace(/[⏳]/g, '').trim();
    const orderDate = p.created_at ? p.created_at.slice(0, 10) : '';
    return [
      p.po_number || '',
      orderDate,
      p.promised_date || '',
      products,
      qty,
      Number(p.total_amount || 0).toFixed(2),
      statusLabel,
      p.box_note || ''
    ];
  });
  
  // 合计行
  const activePos = pos.filter(p => p.status !== 'cancelled');
  const totalQty = activePos.reduce((s, p) => s + (p.line_items || []).reduce((q, li) => q + Number(li.qty || 0), 0), 0);
  const totalAmount = activePos.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  rows.push(['', '', '', '【合计(不含已取消)】', totalQty, totalAmount.toFixed(2), `${activePos.length} 单`, '']);
  
  // CSV 字符串 · UTF-8 BOM 让 Excel 中文不乱码
  const csvLines = [header, ...rows].map(row => 
    row.map(cell => {
      const s = String(cell || '');
      // 如果含逗号/引号/换行,用引号包并转义内部引号
      if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',')
  );
  const csv = '\uFEFF' + csvLines.join('\r\n');
  
  // 下载
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `对账_${supplier.name}_${month}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
  
  toast(`✓ 已下载 · ${a.download}`, 'success', 2000);
}
window.exportSupplierStatementCsv = exportSupplierStatementCsv;

// 打印对账单 · 新窗口 · 含合计 + 印章位
function printSupplierStatement() {
  if (!SUPPLIER_STMT || SUPPLIER_STMT.pos.length === 0) { toast('无数据', 'warn'); return; }
  const { supplier, month, pos } = SUPPLIER_STMT;
  
  const activePos = pos.filter(p => p.status !== 'cancelled');
  const totalQty = activePos.reduce((s, p) => s + (p.line_items || []).reduce((q, li) => q + Number(li.qty || 0), 0), 0);
  const totalAmount = activePos.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const cancelledCount = pos.length - activePos.length;
  
  // 公司名:从用户记忆 · JANEDECOR INC / Vakker Limited
  const companyName = 'JANEDECOR INC / Vakker Limited';
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<title>对账单 - ${escapeHtml(supplier.name)} - ${month}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #222; font-size: 12px; line-height: 1.5; }
  .head { text-align: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 2px solid #333; }
  .head h1 { font-size: 22px; margin: 0 0 6px; }
  .head .subtitle { font-size: 13px; color: #666; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; }
  .meta .left, .meta .right { line-height: 1.8; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  th { background: #f0f0f0; padding: 8px 6px; border: 1px solid #999; text-align: left; font-weight: 600; }
  td { padding: 6px; border: 1px solid #ccc; vertical-align: top; }
  td.right { text-align: right; }
  td.center { text-align: center; }
  td.mono { font-family: monospace; }
  tr.cancelled td { color: #999; text-decoration: line-through; }
  tr.total { font-weight: 700; background: #fafafa; }
  tr.total td { border-top: 2px solid #333; padding: 10px 6px; }
  .signature { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 24px; border-top: 1px dashed #999; }
  .sig-box { width: 45%; }
  .sig-box .label { font-weight: 600; margin-bottom: 60px; }
  .sig-box .line { border-bottom: 1px solid #333; height: 30px; }
  .sig-box .sub { font-size: 10px; color: #666; margin-top: 4px; text-align: center; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style>
</head><body>

<div class="head">
  <h1>📋 月度对账单</h1>
  <div class="subtitle">Monthly Statement · ${month}</div>
</div>

<div class="meta">
  <div class="left">
    <div><b>供应商:</b>${escapeHtml(supplier.name)}</div>
    ${supplier.contact_name ? `<div><b>联系人:</b>${escapeHtml(supplier.contact_name)}</div>` : ''}
    ${supplier.contact_phone ? `<div><b>电话:</b>${escapeHtml(supplier.contact_phone)}</div>` : ''}
    ${supplier.payment_terms ? `<div><b>付款条件:</b>${escapeHtml(supplier.payment_terms)}</div>` : ''}
  </div>
  <div class="right" style="text-align:right;">
    <div><b>对账方:</b>${companyName}</div>
    <div><b>对账月份:</b>${month}</div>
    <div><b>出账日期:</b>${new Date().toISOString().slice(0,10)}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:14%;">PO 号</th>
      <th style="width:11%;">下单日期</th>
      <th>产品明细</th>
      <th style="width:6%;">件数</th>
      <th style="width:10%;">金额(¥)</th>
      <th style="width:8%;">状态</th>
    </tr>
  </thead>
  <tbody>
    ${pos.map(p => {
      const items = p.line_items || [];
      const qty = items.reduce((s, li) => s + Number(li.qty || 0), 0);
      const isCancelled = p.status === 'cancelled';
      const products = items.map(li => `${escapeHtml(li.title_cn || li.sku || '')} (${escapeHtml(li.sku || '')}) × ${li.qty}`).join('<br>');
      return `
        <tr ${isCancelled ? 'class="cancelled"' : ''}>
          <td class="mono">${escapeHtml(p.po_number || '')}</td>
          <td class="mono">${p.created_at ? p.created_at.slice(0, 10) : ''}</td>
          <td>${products}${p.box_note ? `<br><span style="color:#888;font-size:10px;">📝 ${escapeHtml(p.box_note)}</span>` : ''}</td>
          <td class="center mono">${qty}</td>
          <td class="right mono">¥${Number(p.total_amount || 0).toFixed(2)}</td>
          <td class="center">${_poStatusMeta(p.status).label.replace(/[⏳📦🚚]/g, '').trim()}</td>
        </tr>
      `;
    }).join('')}
    <tr class="total">
      <td colspan="3">合计(不含已取消)</td>
      <td class="center mono">${totalQty}</td>
      <td class="right mono">¥${totalAmount.toFixed(2)}</td>
      <td class="center">${activePos.length} 单${cancelledCount > 0 ? ` <span style="font-weight:400; color:#888;">(+${cancelledCount} 已取消)</span>` : ''}</td>
    </tr>
  </tbody>
</table>

<div class="signature">
  <div class="sig-box">
    <div class="label">供应商确认</div>
    <div class="line"></div>
    <div class="sub">盖章 + 签字 + 日期</div>
  </div>
  <div class="sig-box">
    <div class="label">${companyName}</div>
    <div class="line"></div>
    <div class="sub">盖章 + 签字 + 日期</div>
  </div>
</div>

<div class="no-print" style="margin-top:30px; text-align:center;">
  <button onclick="window.print()" style="padding:8px 20px; font-size:14px; cursor:pointer;">🖨 打印</button>
  <button onclick="window.close()" style="padding:8px 20px; font-size:14px; cursor:pointer; margin-left:10px;">关闭</button>
</div>

<script>setTimeout(() => window.print(), 500);</script>
</body></html>`;
  
  const w = window.open('', '_blank');
  if (!w) { toast('请允许新窗口弹出', 'warn'); return; }
  w.document.write(html);
  w.document.close();
}
window.printSupplierStatement = printSupplierStatement;

// ============================================================
// V4：过滤"仅看待审批"开关
let supplierFilterPending = false;

let SUPPLIER_EDIT_ID = null;
function openSupplierEdit(id) {
  SUPPLIER_EDIT_ID = id;
  const s = id ? SUPPLIERS.byId(id) : { name:'', contact_name:'', contact_phone:'', contact_wechat:'', address:'', payment_terms:'', notes:'',
    alipay_account:'', alipay_name:'', alipay_qr_url:'', wechat_qr_url:'',
    bank_name:'', bank_account:'', bank_account_name:'', approval_status:'pending_approval' };
  document.getElementById('supplierEditTitle').textContent = id ? `编辑供应商：${s.name}` : '新增供应商';
  document.getElementById('supplierDeleteBtn').style.display = id ? '' : 'none';
  
  // V4：审批状态徽章
  const apprStatus = s.approval_status || 'approved';
  const apprBadge = apprStatus === 'pending_approval' 
    ? `<span style="display:inline-block; padding:3px 10px; background:rgba(202,138,4,0.15); color:#854f0b; border-radius:4px; font-size:11px; font-weight:600; margin-left:8px;">⏳ 待主管审批</span>`
    : apprStatus === 'rejected'
    ? `<span style="display:inline-block; padding:3px 10px; background:rgba(220,38,38,0.15); color:#dc2626; border-radius:4px; font-size:11px; font-weight:600; margin-left:8px;">❌ 已驳回</span>`
    : id ? `<span style="display:inline-block; padding:3px 10px; background:rgba(21,128,61,0.15); color:#15803d; border-radius:4px; font-size:11px; font-weight:600; margin-left:8px;">✓ 已生效</span>` : '';
  
  document.getElementById('supplierEditTitle').innerHTML = (id ? `编辑供应商：${escapeHtml(s.name)}` : '新增供应商') + apprBadge;
  
  document.getElementById('supplierEditBody').innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <!-- 基础信息 -->
      <div style="grid-column:1/-1;"><label style="font-size:12px; font-weight:600;">供应商名 *</label><input id="seName" class="form-control" value="${escapeHtml(s.name||'')}" placeholder="如：优亮灯饰"></div>
      <div><label style="font-size:12px; font-weight:600;">联系人</label><input id="seContact" class="form-control" value="${escapeHtml(s.contact_name||'')}"></div>
      <div><label style="font-size:12px; font-weight:600;">电话</label><input id="sePhone" class="form-control" value="${escapeHtml(s.contact_phone||'')}"></div>
      <div><label style="font-size:12px; font-weight:600;">微信</label><input id="seWechat" class="form-control" value="${escapeHtml(s.contact_wechat||'')}"></div>
      <div><label style="font-size:12px; font-weight:600;">付款条件</label><input id="seTerms" class="form-control" value="${escapeHtml(s.payment_terms||'')}" placeholder="如：月结30天 / 见单付款"></div>
      <div style="grid-column:1/-1;"><label style="font-size:12px; font-weight:600;">地址</label><input id="seAddress" class="form-control" value="${escapeHtml(s.address||'')}"></div>
      
      <!-- V4：支付宝收款（同步到财务系统）-->
      <div style="grid-column:1/-1; margin-top:8px; padding-top:12px; border-top:1px solid var(--border-subtle);">
        <div style="font-size:13px; font-weight:700; color:var(--accent); margin-bottom:6px;">💰 支付宝收款（同步到财务系统）</div>
      </div>
      <div><label style="font-size:12px; font-weight:600;">支付宝账号</label><input id="seAlipayAccount" class="form-control" value="${escapeHtml(s.alipay_account||'')}" placeholder="手机号 / 邮箱"></div>
      <div><label style="font-size:12px; font-weight:600;">支付宝收款人姓名</label><input id="seAlipayName" class="form-control" value="${escapeHtml(s.alipay_name||'')}" placeholder="姓名（必须和账号实名一致）"></div>
      <div>
        <label style="font-size:12px; font-weight:600;">支付宝收款二维码</label>
        <div class="image-field-wrapper" data-target="seAlipayQrUrl">
          <input type="hidden" id="seAlipayQrUrl" data-key="alipay_qr_url" value="${escapeHtml(s.alipay_qr_url||'')}">
          <div class="image-preview-box" style="position:relative; min-height:80px; border:1px dashed var(--border); border-radius:6px; padding:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:var(--bg-card);">
            ${s.alipay_qr_url ? `<img src="${escapeHtml(s.alipay_qr_url)}" style="max-height:120px; max-width:100%;">` : `<div style="color:var(--text-tertiary); font-size:12px; padding:20px;">📷 点击上传 / 粘贴二维码图片</div>`}
            <input type="file" accept="image/*" style="position:absolute; inset:0; opacity:0; cursor:pointer;" onchange="supplierUploadImage(this, 'seAlipayQrUrl')">
          </div>
        </div>
      </div>
      <div>
        <label style="font-size:12px; font-weight:600;">微信收款二维码</label>
        <div class="image-field-wrapper" data-target="seWechatQrUrl">
          <input type="hidden" id="seWechatQrUrl" data-key="wechat_qr_url" value="${escapeHtml(s.wechat_qr_url||'')}">
          <div class="image-preview-box" style="position:relative; min-height:80px; border:1px dashed var(--border); border-radius:6px; padding:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:var(--bg-card);">
            ${s.wechat_qr_url ? `<img src="${escapeHtml(s.wechat_qr_url)}" style="max-height:120px; max-width:100%;">` : `<div style="color:var(--text-tertiary); font-size:12px; padding:20px;">📷 点击上传 / 粘贴二维码图片</div>`}
            <input type="file" accept="image/*" style="position:absolute; inset:0; opacity:0; cursor:pointer;" onchange="supplierUploadImage(this, 'seWechatQrUrl')">
          </div>
        </div>
      </div>
      
      <!-- V4：银行账号（对公付款用，同步到财务系统）-->
      <div style="grid-column:1/-1; margin-top:8px; padding-top:12px; border-top:1px solid var(--border-subtle);">
        <div style="font-size:13px; font-weight:700; color:var(--accent); margin-bottom:6px;">🏦 对公银行账号（同步到财务系统）</div>
      </div>
      <div style="grid-column:1/-1;"><label style="font-size:12px; font-weight:600;">开户人 / 公司名</label><input id="seBankAccountName" class="form-control" value="${escapeHtml(s.bank_account_name||'')}" placeholder="开户人姓名（个人）或公司名"></div>
      <div><label style="font-size:12px; font-weight:600;">银行名</label><input id="seBankName" class="form-control" value="${escapeHtml(s.bank_name||'')}" placeholder="如：中国工商银行"></div>
      <div><label style="font-size:12px; font-weight:600;">银行账号</label><input id="seBankAccount" class="form-control" value="${escapeHtml(s.bank_account||'')}" placeholder="完整账号"></div>
      
      <!-- 备注 -->
      <div style="grid-column:1/-1; margin-top:8px;"><label style="font-size:12px; font-weight:600;">备注</label><textarea id="seNotes" class="form-control" rows="2">${escapeHtml(s.notes||'')}</textarea></div>
      
      ${id ? `<div style="grid-column:1/-1; padding:8px 10px; background:var(--bg-elevated); border-radius:6px; font-size:11px; color:var(--text-tertiary);">累计下单：${s.total_orders||0} 次 · 累计金额：¥${Number(s.total_amount||0).toFixed(2)}</div>` : ''}
      
      <!-- V4：审批操作（仅主管 + 待审批状态时显示）-->
      ${id && apprStatus === 'pending_approval' && IS_ADMIN ? `
        <div style="grid-column:1/-1; padding:10px 12px; background:rgba(202,138,4,0.08); border:1px solid rgba(202,138,4,0.3); border-radius:6px;">
          <div style="font-size:12px; color:#854f0b; margin-bottom:8px;">
            <b>⏳ 待审批：</b>此供应商由跟单 <b>${escapeHtml(s.created_by_name || '?')}</b> 新建，需主管确认后才能下 PO，确认后自动同步财务系统。
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn primary" onclick="supplierApprove('${id}', true)" style="background:var(--success); padding:6px 14px;">✓ 批准（同步到财务系统）</button>
            <button class="btn" onclick="supplierApprove('${id}', false)" style="color:var(--danger); padding:6px 14px;">✗ 驳回</button>
          </div>
        </div>` : ''}
    </div>
  `;
  document.getElementById('supplierEditModal').style.display = 'flex';
  // V22-CY+ 2026-05-26: 注册 paste 支持(QR 收款码可粘贴)
  _setupSupplierEditPaste();
}

function closeSupplierEdit() {
  document.getElementById('supplierEditModal').style.display = 'none';
  SUPPLIER_EDIT_ID = null;
  // V22-CY+: 卸载 paste handler
  _teardownSupplierEditPaste();
}

async function supplierSave() {
  // V4：收集所有字段，包括新增的支付宝/微信/银行/二维码
  const payload = {
    name: document.getElementById('seName').value.trim(),
    contact_name: document.getElementById('seContact').value.trim(),
    contact_phone: document.getElementById('sePhone').value.trim(),
    contact_wechat: document.getElementById('seWechat').value.trim(),
    payment_terms: document.getElementById('seTerms').value.trim(),
    address: document.getElementById('seAddress').value.trim(),
    notes: document.getElementById('seNotes').value.trim(),
    // V4 新增字段
    alipay_account: document.getElementById('seAlipayAccount').value.trim(),
    alipay_name: document.getElementById('seAlipayName').value.trim(),
    alipay_qr_url: document.getElementById('seAlipayQrUrl').value.trim(),
    wechat_qr_url: document.getElementById('seWechatQrUrl').value.trim(),
    bank_name: document.getElementById('seBankName').value.trim(),
    bank_account: document.getElementById('seBankAccount').value.trim(),
    bank_account_name: document.getElementById('seBankAccountName').value.trim(),
    updated_at: new Date().toISOString(),
  };
  if (!payload.name) { toast('名称必填', 'warn'); return; }
  
  try {
    if (SUPPLIER_EDIT_ID) {
      // 编辑现有供应商（不改 approval_status，除非用主管审批按钮）
      const { error } = await sb.from('suppliers').update(payload).eq('id', SUPPLIER_EDIT_ID);
      if (error) throw error;
      toast('✓ 已保存供应商信息');
    } else {
      // V4：新建供应商
      // - 主管创建：直接 approval_status='approved' 立刻生效
      // - 跟单创建：approval_status='pending_approval' 等主管审批
      payload.created_at = new Date().toISOString();
      payload.created_by = CURRENT_USER_ID || null;
      payload.created_by_name = CURRENT_AGENT || null;
      payload.approval_status = IS_ADMIN ? 'approved' : 'pending_approval';
      if (IS_ADMIN) {
        payload.approved_by = CURRENT_USER_ID || null;
        payload.approved_at = new Date().toISOString();
      }
      const { error } = await sb.from('suppliers').insert(payload);
      if (error) throw error;
      
      if (IS_ADMIN) {
        toast('✓ 已新增供应商');
      } else {
        toast(`✓ 已提交供应商「${payload.name}」，等待主管审批后才能下 PO`, 'ok', 6000);
      }
    }
    await SUPPLIERS.loadAll();
    renderSuppliersList();
    closeSupplierEdit();
  } catch (e) {
    // 字段不存在的友好错误（提示用户跑 SQL）
    if (String(e.message || e).includes('column') && String(e.message || e).includes('does not exist')) {
      toast('❌ 数据库字段未更新，请联系管理员跑 V4 SQL 升级', 'err', 8000);
      console.error('SQL 升级未执行：请在 Supabase SQL Editor 跑 V4 供应商扩展字段', e);
    } else {
      toast('保存失败：' + (e.message || e), 'err');
    }
  }
}

// V4：供应商二维码 / 图片上传
async function supplierUploadImage(inputEl, hiddenId) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  await _supplierDoUploadFile(file, hiddenId);
  inputEl.value = '';  // 重置 file input 以便再次选同名文件
}

// V22-CY+ 2026-05-26: 抽出文件→上传→更新预览的逻辑(给 paste 复用)
async function _supplierDoUploadFile(file, hiddenId) {
  if (!file.type.startsWith('image/')) { toast(`${file.name || '文件'} 不是图片`, 'err'); return; }
  try {
    toast('上传中...', 'info');
    const url = await uploadImageToStorage(file);
    const hiddenInput = document.getElementById(hiddenId);
    if (hiddenInput) {
      hiddenInput.value = url;
      // 更新预览
      const wrapper = document.querySelector(`.image-field-wrapper[data-target="${hiddenId}"]`);
      if (wrapper) {
        const box = wrapper.querySelector('.image-preview-box');
        if (box) {
          const fileInput = box.querySelector('input[type=file]');
          box.innerHTML = `<img src="${escapeHtml(url)}" style="max-height:120px; max-width:100%;">`;
          if (fileInput) box.appendChild(fileInput);
        }
      }
      toast('✓ 已上传');
    }
  } catch (e) {
    toast('上传失败：' + (e.message || e), 'err');
  }
}

// V22-CY+ 2026-05-26: 供应商编辑 modal 的 paste 支持
// 鼠标 hover 在哪个 wrapper 上 → 粘贴/拖拽就进那个字段
let _SUPPLIER_PASTE_TARGET = null;
let _supplierPasteHandler = null;

function _setupSupplierEditPaste() {
  const modal = document.getElementById('supplierEditModal');
  if (!modal) return;
  
  // 给两个 wrapper 加 hover/drag 监听 + 视觉提示
  const wrappers = modal.querySelectorAll('.image-field-wrapper[data-target]');
  wrappers.forEach(w => {
    const target = w.dataset.target;
    if (!target) return;
    // hover 时设为粘贴目标 + 视觉高亮
    w.addEventListener('mouseenter', () => {
      _SUPPLIER_PASTE_TARGET = target;
      w.style.outline = '2px solid var(--accent, #2563eb)';
      w.style.outlineOffset = '2px';
    });
    w.addEventListener('mouseleave', () => {
      w.style.outline = '';
      w.style.outlineOffset = '';
    });
    // 拖拽进入也设
    w.addEventListener('dragover', e => {
      e.preventDefault();
      _SUPPLIER_PASTE_TARGET = target;
      w.style.outline = '2px dashed var(--accent, #2563eb)';
      w.style.background = 'rgba(37,99,235,0.05)';
    });
    w.addEventListener('dragleave', () => {
      w.style.outline = '';
      w.style.background = '';
    });
    w.addEventListener('drop', async e => {
      e.preventDefault();
      w.style.outline = '';
      w.style.background = '';
      const file = e.dataTransfer?.files?.[0];
      if (file) await _supplierDoUploadFile(file, target);
    });
  });
  
  // 卸掉旧的(防止重复注册)
  if (_supplierPasteHandler) {
    document.removeEventListener('paste', _supplierPasteHandler);
  }
  
  // 文档级 paste(只在 supplierEditModal 打开时生效)
  _supplierPasteHandler = async (e) => {
    if (modal.style.display !== 'flex') return;
    const items = e.clipboardData?.items || [];
    let imageFile = null;
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        imageFile = item.getAsFile();
        break;
      }
    }
    if (!imageFile) return;
    e.preventDefault();
    // 默认进支付宝(如果 hover 未设置过)
    const target = _SUPPLIER_PASTE_TARGET || 'seAlipayQrUrl';
    const fieldLabel = target === 'seAlipayQrUrl' ? '支付宝收款码' : (target === 'seWechatQrUrl' ? '微信收款码' : target);
    toast(`📋 检测到剪贴板图片 · 上传到「${fieldLabel}」...`, 'info', 2000);
    await _supplierDoUploadFile(imageFile, target);
  };
  document.addEventListener('paste', _supplierPasteHandler);
}

function _teardownSupplierEditPaste() {
  if (_supplierPasteHandler) {
    document.removeEventListener('paste', _supplierPasteHandler);
    _supplierPasteHandler = null;
  }
  _SUPPLIER_PASTE_TARGET = null;
}

// V4：主管审批/驳回供应商
async function supplierApprove(supplierId, approve) {
  if (!IS_ADMIN) { toast('仅主管可审批', 'err'); return; }
  const s = SUPPLIERS.byId(supplierId);
  if (!s) return;
  
  if (approve) {
    if (!confirm(`确认批准供应商「${s.name}」？\n\n批准后该供应商：\n• 可被跟单选择下 PO\n• 系统会尝试同步到财务系统（如已部署 Edge Function）`)) return;
  } else {
    if (!confirm(`确认驳回供应商「${s.name}」？\n\n驳回后该供应商不可用，但记录保留。`)) return;
  }
  
  try {
    await sb.from('suppliers').update({
      approval_status: approve ? 'approved' : 'rejected',
      approved_by: CURRENT_USER_ID || null,
      approved_at: new Date().toISOString(),
    }).eq('id', supplierId);
    
    toast(approve ? `✓ 已批准「${s.name}」` : `已驳回「${s.name}」`);
    
    // V4：如果批准了，尝试同步到财务系统
    if (approve) {
      try {
        const syncResult = await syncSupplierToFinance(supplierId);
        if (syncResult.ok) {
          toast(`✓ 已同步到财务系统（UUID: ${syncResult.uuid?.slice(0, 8)}...）`, 'ok', 5000);
        } else if (syncResult.skipped) {
          console.log('[财务同步] 跳过：', syncResult.reason);
        }
      } catch (syncErr) {
        console.warn('[财务同步] 失败（不影响审批）：', syncErr);
        toast('⚠ 已批准但财务同步失败，请检查 Edge Function 部署', 'warn', 5000);
      }
    }
    
    await SUPPLIERS.loadAll();
    renderSuppliersList();
    closeSupplierEdit();
  } catch (e) {
    toast('操作失败：' + (e.message || e), 'err');
  }
}

// V4：调用 Edge Function 把供应商同步到财务系统
// Edge Function 在跟单运维端部署（持有 gendan_api 账号凭证）
async function syncSupplierToFinance(supplierId) {
  const s = SUPPLIERS.byId(supplierId);
  if (!s) return { skipped: true, reason: '供应商不存在' };
  
  // 没填支付宝且没填银行账号 → 跳过同步（财务必填这些）
  if (!s.alipay_account && !s.bank_account) {
    return { skipped: true, reason: '未填写支付宝或银行账号，不同步' };
  }
  
  try {
    // 调 Supabase Edge Function 代理（避免跨域 + 保护密钥）
    // Edge Function 名：sync-to-caiwu，需要单独部署
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { skipped: true, reason: '未登录' };
    
    const res = await fetch('https://pyfmuknvjqfwcqvbrsvw.supabase.co/functions/v1/sync-to-caiwu', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_supplier',
        supplier: {
          local_id: s.id,
          name: s.name,
          payee: s.alipay_name || s.bank_account_name,
          alipay: s.alipay_account,
          bank_name: s.bank_name,
          bank_account: s.bank_account,
          notes: s.notes,
        },
      }),
    });
    
    if (!res.ok) {
      // Edge Function 未部署或财务方 API 没开通 → 优雅降级（本地照常存）
      if (res.status === 404 || res.status === 503) {
        return { skipped: true, reason: 'sync-to-caiwu Edge Function 未部署' };
      }
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    
    const json = await res.json();
    if (json.ok && json.finance_uuid) {
      // 回写财务系统给的 UUID
      await sb.from('suppliers').update({
        finance_supplier_uuid: json.finance_uuid,
        finance_synced_at: new Date().toISOString(),
      }).eq('id', supplierId);
      return { ok: true, uuid: json.finance_uuid };
    }
    
    return { skipped: true, reason: 'Edge Function 返回非 ok 状态' };
  } catch (e) {
    console.error('[同步财务] 异常：', e);
    throw e;
  }
}

async function supplierDelete() {
  if (!SUPPLIER_EDIT_ID) return;
  const s = SUPPLIERS.byId(SUPPLIER_EDIT_ID);
  if (!confirm(`确认删除供应商 "${s?.name}"？（仅停用，历史采购单不影响）`)) return;
  try {
    await sb.from('suppliers').update({ is_active: false }).eq('id', SUPPLIER_EDIT_ID);
    await SUPPLIERS.loadAll();
    renderSuppliersList();
    closeSupplierEdit();
    toast('已删除');
  } catch (e) { toast('删除失败：' + (e.message || e), 'err'); }
}

// ============ 产品维护 ============

// V4：从任何地方（销售单/PO/找灯）跳转到产品页查看具体产品
// 用法：onclick="gotoProductBySku('VK05-251011-10')"
function gotoProductBySku(sku) {
  if (!sku) return;
  // 切到产品 tab
  if (typeof switchTab === 'function') switchTab('products');
  // 等 tab 切换 + 加载完成，再设搜索词
  setTimeout(() => {
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
      searchInput.value = sku;
      // 同时清除其他筛选避免冲突
      const fl = document.getElementById('productFilter');
      const sf = document.getElementById('productSiteFilter');
      if (fl) fl.value = 'all';
      if (sf) sf.value = 'all';
      renderProductsList();
      // 高亮：找到对应行加上闪烁效果
      setTimeout(() => {
        const body = document.getElementById('productsListBody');
        if (!body) return;
        const targetRow = body.querySelector(`[data-sku="${CSS.escape(sku)}"]`);
        if (targetRow) {
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetRow.style.transition = 'background 0.3s';
          targetRow.style.background = 'var(--accent-soft, #fff7ed)';
          setTimeout(() => { targetRow.style.background = ''; }, 1800);
        } else {
          // 没找到精确匹配，至少滚到列表顶
          body.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 250);
    }
    if (typeof toast === 'function') toast(`✓ 已跳转到产品：${sku}`);
  }, 150);
}

async function renderProducts() {
  try {
    await PRODUCTS_CACHE.loadAll();
    renderProductsList();
  } catch (e) { toast('加载产品失败：' + (e.message || e), 'err'); }
}

function renderProductsList() {
  const q = (document.getElementById('productSearch')?.value || '').toLowerCase();
  const filter = document.getElementById('productFilter')?.value || 'all';
  const site = document.getElementById('productSiteFilter')?.value || 'all';
  let list = PRODUCTS_CACHE._all.slice();
  if (q) list = list.filter(p =>
    (p.sku || '').toLowerCase().includes(q) ||
    (p.name_cn || '').toLowerCase().includes(q) ||
    (p.name_en || '').toLowerCase().includes(q)
  );
  if (filter === 'no_cn') list = list.filter(p => !p.name_cn);
  else if (filter === 'no_supplier') list = list.filter(p => !p.default_supplier);
  else if (filter === 'masters') list = list.filter(p => !p.master_product_id && PRODUCTS_CACHE._all.some(x => x.master_product_id === p.id));
  else if (filter === 'aliases') list = list.filter(p => !!p.master_product_id);
  if (site !== 'all') list = list.filter(p => (p.sku || '').startsWith(site) || (p.sku || '').includes('-' + site + '-'));

  document.getElementById('productsCountHint').textContent = `${list.length} / ${PRODUCTS_CACHE._all.length} 个产品`;

  const body = document.getElementById('productsListBody');
  if (list.length === 0) {
    body.innerHTML = '<div style="padding:32px; text-align:center; color:var(--text-tertiary);">无匹配产品</div>';
    return;
  }

  body.innerHTML = `
    <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; overflow:hidden;">
      <div class="product-header">
        <div></div><div>SKU / 英文名</div><div>中文名</div><div>供应商列表</div><div>上次单价</div><div></div>
      </div>
      ${list.slice(0, 200).map(p => {
        const hasAlias = !p.master_product_id && PRODUCTS_CACHE._all.some(x => x.master_product_id === p.id);
        const isAlias = !!p.master_product_id;
        const master = isAlias ? PRODUCTS_CACHE._byId[p.master_product_id] : null;
        // V20260527n: 多供应商显示 · 优先用 suppliers 数组,fallback 到老 default_supplier
        const supps = _getProductSuppliers(p);
        const suppHtml = supps.length === 0
          ? '<span style="color:var(--text-tertiary)">—</span>'
          : `<div style="display:flex; flex-wrap:wrap; gap:3px;">${supps.slice(0, 3).map(s => `
              <span style="display:inline-flex; align-items:center; gap:3px; padding:2px 6px; font-size:11px; border-radius:4px; ${s.is_default ? 'background:rgba(22,163,74,0.1); color:#15803d; font-weight:600; border:1px solid rgba(22,163,74,0.25);' : 'background:var(--bg-elevated); color:var(--text-secondary); border:1px solid var(--border-subtle);'}" title="${s.note ? escapeHtml(s.note) : ''}">
                ${s.is_default ? '🥇 ' : ''}${escapeHtml(s.name)}${s.note ? `<span style="color:var(--text-tertiary); font-weight:400;">·${escapeHtml(s.note)}</span>` : ''}
              </span>`).join('')}${supps.length > 3 ? `<span style="font-size:11px; color:var(--text-tertiary); padding:2px 4px;">+${supps.length - 3}</span>` : ''}</div>`;
        return `
        <div class="product-row ${isAlias ? 'is-alias' : ''}" data-sku="${escapeHtml(p.sku)}">
          ${p.image_url ? `<img class="prod-img" src="${escapeHtml(p.image_url)}" onclick="openImgLightbox('${escapeHtml(p.image_url)}')">` : `<div class="prod-noimg">📷</div>`}
          <div>
            <div class="sku">${escapeHtml(p.sku)}${hasAlias ? '<span class="master-tag">主</span>' : ''}${isAlias ? `<span class="alias-tag">同款: ${escapeHtml(master?.sku || '')}</span>` : ''}</div>
            <div class="name-en">${escapeHtml(p.name_en || '')}</div>
          </div>
          <div>
            <div class="name-cn">${p.name_cn ? escapeHtml(p.name_cn) : '<span style="color:var(--text-tertiary)">未维护</span>'}</div>
          </div>
          <div>${suppHtml}</div>
          <div class="price">${p.last_purchase_price ? '¥' + Number(p.last_purchase_price).toFixed(2) : '—'}</div>
          <div class="actions">
            <button class="btn small" onclick="openProductEdit('${p.id}')">编辑</button>
            <button class="btn small" onclick="openMasterBind('${p.id}')" title="同款绑定">🔗</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    ${list.length > 200 ? `<div style="padding:10px; text-align:center; color:var(--text-tertiary); font-size:11px;">仅显示前 200 个，请用搜索筛选</div>` : ''}
  `;
}

// V20260527n: 统一获取产品的供应商列表(向后兼容老 default_supplier 字段)
function _getProductSuppliers(p) {
  if (!p) return [];
  // 优先用新数组
  if (Array.isArray(p.suppliers) && p.suppliers.length > 0) {
    return p.suppliers.slice().sort((a, b) => {
      // 默认的排最前 · 其次按 sort_order
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }
  // fallback 到老 default_supplier 字符串
  if (p.default_supplier) {
    return [{ name: p.default_supplier, note: '', is_default: true, sort_order: 0 }];
  }
  return [];
}
window._getProductSuppliers = _getProductSuppliers;

// V20260527n: 产品编辑 modal · 中文名 + 多供应商管理
// ============================================================
let PRODUCT_EDIT_ID = null;
let PRODUCT_EDIT_SUPPLIERS = []; // 当前编辑中的 suppliers 数组(临时,保存时才写回)

async function openProductEdit(productId) {
  const p = PRODUCTS_CACHE._byId[productId];
  if (!p) return;
  PRODUCT_EDIT_ID = productId;
  // V20260527q: 预加载供应商库 · 为联想搜索做准备
  try { await SUPPLIERS.loadAll(); } catch (_) {}
  // 深拷贝当前 suppliers · 避免直接改 cache
  const current = _getProductSuppliers(p);
  PRODUCT_EDIT_SUPPLIERS = current.map(s => ({
    name: s.name || '',
    note: s.note || '',
    is_default: !!s.is_default,
    last_price: s.last_price || null,
    sort_order: s.sort_order || 0,
  }));
  
  // 渲染 modal 内容
  document.getElementById('productEditSku').textContent = p.sku;
  _renderProductEditBody(p);
  
  // 显示 modal
  const modal = document.getElementById('productEditModal');
  modal.style.display = 'flex';
  
  // V27n autocomplete 防御
  if (typeof _disableAutofillOnFields === 'function') {
    setTimeout(() => _disableAutofillOnFields(modal), 0);
  }
}
window.openProductEdit = openProductEdit;

function closeProductEdit() {
  document.getElementById('productEditModal').style.display = 'none';
  PRODUCT_EDIT_ID = null;
  PRODUCT_EDIT_SUPPLIERS = [];
}
window.closeProductEdit = closeProductEdit;

function _renderProductEditBody(p) {
  const body = document.getElementById('productEditBody');
  body.innerHTML = `
    <!-- 产品基本信息 -->
    <div style="display:flex; gap:14px; align-items:flex-start; padding:12px; background:var(--bg-elevated); border-radius:8px; margin-bottom:18px;">
      ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" style="width:72px; height:72px; border-radius:6px; object-fit:cover; flex-shrink:0;">` : '<div style="width:72px; height:72px; background:var(--bg-card); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:24px;">📷</div>'}
      <div style="flex:1; min-width:0;">
        <div style="font-family:'JetBrains Mono', monospace; color:var(--accent); font-size:12px; margin-bottom:4px;">${escapeHtml(p.sku)}</div>
        <div style="font-size:13px; color:var(--text-secondary); word-break:break-word;">${escapeHtml(p.name_en || '')}</div>
      </div>
    </div>

    <!-- 中文名 -->
    <div style="margin-bottom:20px;">
      <label style="display:block; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">中文名</label>
      <input type="text" id="productEditNameCn" value="${escapeHtml(p.name_cn || '')}" 
             placeholder="例如:极简北欧落地灯"
             style="width:100%; padding:8px 12px; font-size:13px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card);">
      <div style="font-size:11px; color:var(--text-tertiary); margin-top:4px;">替代英文名 · 显示在销售单 / 采购单 / 打印预览</div>
    </div>

    <!-- 多供应商管理 -->
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <label style="font-size:12px; font-weight:600; color:var(--text-secondary);">
          🏭 供应商列表 <span style="font-weight:400; color:var(--text-tertiary);">(<span id="productEditSupplierCount">0</span> 个)</span>
        </label>
        <button class="btn small" onclick="addProductSupplier()" style="font-size:11px;">+ 添加供应商</button>
      </div>
      <div style="font-size:11px; color:var(--text-tertiary); margin-bottom:10px; padding:8px 12px; background:rgba(13,148,136,0.06); border-radius:6px; border-left:3px solid var(--teal);">
        💡 一个产品可备注多个供应商 · 备注材质/价格特点(玻璃/塑料/价格贵/炒货) · 下单时根据"哪家有货"快速切换
      </div>
      <div id="productEditSupplierList"></div>
    </div>
  `;
  _renderProductSupplierList();
}

function _renderProductSupplierList() {
  const list = document.getElementById('productEditSupplierList');
  const cntEl = document.getElementById('productEditSupplierCount');
  if (cntEl) cntEl.textContent = PRODUCT_EDIT_SUPPLIERS.length;
  
  if (PRODUCT_EDIT_SUPPLIERS.length === 0) {
    list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-tertiary); background:var(--bg-card); border:1px dashed var(--border); border-radius:6px; font-size:12px;">还没有供应商 · 点 [+ 添加供应商]</div>`;
    return;
  }
  
  list.innerHTML = PRODUCT_EDIT_SUPPLIERS.map((s, idx) => `
    <div style="display:grid; grid-template-columns: 30px 1fr 1.2fr 90px 36px; gap:8px; align-items:center; padding:8px 10px; background:${s.is_default ? 'rgba(22,163,74,0.06)' : 'var(--bg-card)'}; border:1px solid ${s.is_default ? 'rgba(22,163,74,0.25)' : 'var(--border)'}; border-radius:6px; margin-bottom:6px;">
      <div style="text-align:center; font-size:14px; color:var(--text-tertiary); cursor:grab;" title="排序">${s.is_default ? '🥇' : (idx + 1)}</div>
      <!-- V20260527q: 供应商名 · 联想搜索 + 可自由输入 -->
      <div style="position:relative;">
        <input type="text" 
               id="prodSupNameInput_${idx}"
               value="${escapeHtml(s.name)}" 
               placeholder="供应商名(如:广州X厂)"
               oninput="prodSupNameSearch(${idx}, this.value)"
               onfocus="prodSupNameSearch(${idx}, this.value)"
               onblur="setTimeout(() => { const r = document.getElementById('prodSupNameResults_${idx}'); if (r) r.style.display = 'none'; }, 200)"
               style="width:100%; padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:4px; background:white;">
        <div id="prodSupNameResults_${idx}" 
             style="display:none; position:absolute; top:100%; left:0; right:0; z-index:2000; background:white; border:1px solid var(--border); border-radius:6px; box-shadow:var(--shadow-md); max-height:240px; overflow-y:auto; margin-top:2px;">
        </div>
      </div>
      <input type="text" value="${escapeHtml(s.note)}" 
             placeholder="备注(玻璃 / 塑料 / 价格贵 / 炒货)"
             oninput="updateProductSupplier(${idx}, 'note', this.value)"
             style="padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:4px; background:white;">
      <button class="btn small ${s.is_default ? 'primary' : ''}" 
              onclick="setProductSupplierDefault(${idx})"
              title="${s.is_default ? '当前默认' : '设为默认'}"
              style="font-size:11px; padding:4px 8px;">
        ${s.is_default ? '✓ 默认' : '设默认'}
      </button>
      <button class="btn small" onclick="delProductSupplier(${idx})" 
              title="删除"
              style="font-size:12px; padding:4px 8px; color:var(--danger); background:rgba(220,38,38,0.06); border-color:rgba(220,38,38,0.25);">🗑</button>
    </div>
  `).join('');
}

// V20260527q: 产品编辑 modal 内 · 供应商名联想搜索 + 新增
function prodSupNameSearch(idx, q) {
  // 同步当前输入到状态
  if (PRODUCT_EDIT_SUPPLIERS[idx]) {
    PRODUCT_EDIT_SUPPLIERS[idx].name = q;
  }
  const results = document.getElementById('prodSupNameResults_' + idx);
  if (!results) return;
  
  const matches = (typeof SUPPLIERS !== 'undefined' && SUPPLIERS.search) ? SUPPLIERS.search(q) : [];
  const trimmed = (q || '').trim();
  const exists = trimmed && SUPPLIERS.byName ? SUPPLIERS.byName(trimmed) : null;
  
  // 不重复:已在当前产品 supplier 列表里的名字标灰
  const alreadyUsed = new Set(
    PRODUCT_EDIT_SUPPLIERS
      .map((s, i) => i !== idx ? (s.name || '').trim().toLowerCase() : null)
      .filter(Boolean)
  );
  
  let html = matches.slice(0, 8).map(s => {
    const dup = alreadyUsed.has((s.name || '').toLowerCase());
    return `
      <div class="picker-item" 
           ${dup ? '' : `onmousedown="prodSupNamePick(${idx}, '${escapeHtml(s.name).replace(/'/g,"\\'")}')"`}
           style="padding:8px 12px; cursor:${dup ? 'not-allowed' : 'pointer'}; border-bottom:1px solid var(--border-subtle); ${dup ? 'opacity:0.4;' : ''}"
           onmouseenter="${dup ? '' : "this.style.background='var(--bg-elevated)'"}"
           onmouseleave="this.style.background=''">
        <div style="font-size:12.5px; font-weight:500;">${escapeHtml(s.name)}${dup ? ' <span style="font-size:10px; color:var(--text-tertiary);">(已在列表)</span>' : ''}</div>
        <div style="font-size:11px; color:var(--text-tertiary);">${s.contact_name ? escapeHtml(s.contact_name) + ' · ' : ''}${s.contact_phone ? escapeHtml(s.contact_phone) : ''}${s.total_orders ? ` · 共 ${s.total_orders} 单` : ''}</div>
      </div>`;
  }).join('');
  
  // "➕ 新增"项 · 当输入了但库里没有
  if (trimmed && !exists && !alreadyUsed.has(trimmed.toLowerCase())) {
    html += `
      <div class="picker-item" 
           onmousedown="prodSupNameAddNew(${idx}, '${escapeHtml(trimmed).replace(/'/g,"\\'")}')"
           style="padding:8px 12px; cursor:pointer; background:rgba(37,99,235,0.04); color:var(--accent);"
           onmouseenter="this.style.background='rgba(37,99,235,0.1)'"
           onmouseleave="this.style.background='rgba(37,99,235,0.04)'">
        <div style="font-size:12.5px; font-weight:600;">➕ 新增供应商「${escapeHtml(trimmed)}」</div>
        <div style="font-size:11px; color:var(--text-tertiary);">点此存入供应商库 · 之后其他产品也能选</div>
      </div>`;
  }
  
  if (!html) {
    html = '<div style="padding:10px 12px; color:var(--text-tertiary); font-size:12px;">无匹配 · 输入新名后可添加</div>';
  }
  
  results.innerHTML = html;
  results.style.display = 'block';
}
window.prodSupNameSearch = prodSupNameSearch;

// 选中已有供应商
function prodSupNamePick(idx, name) {
  if (!PRODUCT_EDIT_SUPPLIERS[idx]) return;
  PRODUCT_EDIT_SUPPLIERS[idx].name = name;
  const input = document.getElementById('prodSupNameInput_' + idx);
  if (input) input.value = name;
  const results = document.getElementById('prodSupNameResults_' + idx);
  if (results) results.style.display = 'none';
}
window.prodSupNamePick = prodSupNamePick;

// 新增供应商到库 · 然后设到这一行
async function prodSupNameAddNew(idx, name) {
  if (!PRODUCT_EDIT_SUPPLIERS[idx]) return;
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  // 检查是否真的没存(防御)
  const existing = SUPPLIERS.byName ? SUPPLIERS.byName(trimmed) : null;
  if (existing) {
    prodSupNamePick(idx, existing.name);
    return;
  }
  try {
    const { data, error } = await sb.from('suppliers').insert({ name: trimmed }).select().single();
    if (error) throw error;
    // 强刷供应商缓存
    if (SUPPLIERS.loadAll) await SUPPLIERS.loadAll(true);
    prodSupNamePick(idx, data.name);
    toast(`✓ 已新增供应商「${data.name}」到供应商库`, 'success', 1500);
  } catch (e) {
    toast('新增失败:' + (e.message || e), 'err');
  }
}
window.prodSupNameAddNew = prodSupNameAddNew;

function addProductSupplier() {
  // 新加的若是第一个,自动设为默认
  const isFirst = PRODUCT_EDIT_SUPPLIERS.length === 0;
  PRODUCT_EDIT_SUPPLIERS.push({
    name: '',
    note: '',
    is_default: isFirst,
    last_price: null,
    sort_order: PRODUCT_EDIT_SUPPLIERS.length,
  });
  _renderProductSupplierList();
  // V20260527q: 用 ID 直接定位新行的供应商名输入框 · focus + 触发联想
  setTimeout(() => {
    const newIdx = PRODUCT_EDIT_SUPPLIERS.length - 1;
    const newInput = document.getElementById('prodSupNameInput_' + newIdx);
    if (newInput) {
      newInput.focus();
    }
    // autocomplete 防御
    if (typeof _disableAutofillOnFields === 'function') {
      _disableAutofillOnFields(document.getElementById('productEditSupplierList'));
    }
  }, 30);
}
window.addProductSupplier = addProductSupplier;

function updateProductSupplier(idx, field, value) {
  if (!PRODUCT_EDIT_SUPPLIERS[idx]) return;
  PRODUCT_EDIT_SUPPLIERS[idx][field] = value;
  // 不重渲染 · 避免输入时 cursor 跳掉
}
window.updateProductSupplier = updateProductSupplier;

function setProductSupplierDefault(idx) {
  if (!PRODUCT_EDIT_SUPPLIERS[idx]) return;
  // 单选:只能一个默认
  PRODUCT_EDIT_SUPPLIERS.forEach((s, i) => { s.is_default = (i === idx); });
  _renderProductSupplierList();
}
window.setProductSupplierDefault = setProductSupplierDefault;

function delProductSupplier(idx) {
  if (!PRODUCT_EDIT_SUPPLIERS[idx]) return;
  const wasDefault = PRODUCT_EDIT_SUPPLIERS[idx].is_default;
  PRODUCT_EDIT_SUPPLIERS.splice(idx, 1);
  // 删的是默认 → 把第一项设为新默认
  if (wasDefault && PRODUCT_EDIT_SUPPLIERS.length > 0) {
    PRODUCT_EDIT_SUPPLIERS[0].is_default = true;
  }
  _renderProductSupplierList();
}
window.delProductSupplier = delProductSupplier;

async function saveProductEdit() {
  const productId = PRODUCT_EDIT_ID;
  if (!productId) return;
  const p = PRODUCTS_CACHE._byId[productId];
  if (!p) return;
  
  const newCn = (document.getElementById('productEditNameCn')?.value || '').trim();
  
  // 清理 suppliers:去掉空名供应商,补 sort_order
  const cleanSuppliers = PRODUCT_EDIT_SUPPLIERS
    .filter(s => (s.name || '').trim())
    .map((s, i) => ({
      name: s.name.trim(),
      note: (s.note || '').trim(),
      is_default: !!s.is_default,
      last_price: s.last_price || null,
      sort_order: i,
    }));
  
  // 校验:如果有 supplier 但没人是默认,自动设第一个为默认
  if (cleanSuppliers.length > 0 && !cleanSuppliers.some(s => s.is_default)) {
    cleanSuppliers[0].is_default = true;
  }
  
  // 双向同步:取 is_default=true 的 name 写到 default_supplier 字段(向后兼容)
  const defaultSupplierName = cleanSuppliers.find(s => s.is_default)?.name || null;
  
  try {
    const updates = {
      suppliers: cleanSuppliers,
      default_supplier: defaultSupplierName,
    };
    // 中文名只在变化时更新(且标 manual 不让 AI 覆盖)
    if (newCn !== (p.name_cn || '')) {
      updates.name_cn = newCn;
      updates.name_cn_locked = true;
      updates.translation_source = 'manual';
    }
    
    const { error } = await sb.from('products').update(updates).eq('id', productId);
    if (error) throw error;
    
    // 同步更新本地 cache
    p.suppliers = cleanSuppliers;
    p.default_supplier = defaultSupplierName;
    if (updates.name_cn !== undefined) {
      p.name_cn = updates.name_cn;
      p.name_cn_locked = true;
    }
    
    toast(`✓ 已保存 · ${cleanSuppliers.length} 个供应商`);
    closeProductEdit();
    renderProducts();
  } catch (e) { 
    // V27n: 如果是 suppliers 字段不存在错误,提示用户跑 SQL
    const msg = e.message || String(e);
    if (msg.includes('suppliers') || msg.includes('column')) {
      toast('⚠ 数据库还没加 suppliers 字段 · 请先跑 sql/add-product-suppliers.sql', 'err', 4000);
    } else {
      toast('保存失败:' + msg, 'err'); 
    }
  }
}
window.saveProductEdit = saveProductEdit;
// ============================================================

// ============ 同款绑定 ============
let MASTER_BIND_PRODUCT_ID = null;
async function openMasterBind(productId) {
  MASTER_BIND_PRODUCT_ID = productId;
  await PRODUCTS_CACHE.loadAll();
  renderMasterBind();
  document.getElementById('masterBindModal').style.display = 'flex';
}
function closeMasterBind() {
  document.getElementById('masterBindModal').style.display = 'none';
  MASTER_BIND_PRODUCT_ID = null;
}
function renderMasterBind() {
  const p = PRODUCTS_CACHE._byId[MASTER_BIND_PRODUCT_ID];
  if (!p) return;
  // 找出主产品（若 p 是 alias，主就是 master_product_id 指向的；若 p 自身是主，就是它）
  const masterId = p.master_product_id || p.id;
  const master = PRODUCTS_CACHE._byId[masterId];
  const aliases = PRODUCTS_CACHE._all.filter(x => x.master_product_id === masterId);

  document.getElementById('masterBindBody').innerHTML = `
    <div style="background: var(--bg-elevated); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
      <div style="font-size: 11px; color: var(--text-tertiary); margin-bottom: 4px;">主产品（同款代表）</div>
      <div style="display: flex; align-items: center; gap: 10px;">
        ${master.image_url ? `<img src="${escapeHtml(master.image_url)}" style="width:48px; height:48px; border-radius:6px; object-fit:cover;">` : ''}
        <div>
          <div style="font-family:'JetBrains Mono', monospace; color: var(--accent); font-size: 12px;">${escapeHtml(master.sku)}</div>
          <div style="font-weight: 500;">${escapeHtml(master.name_cn || master.name_en || '')}</div>
        </div>
        ${master.id !== MASTER_BIND_PRODUCT_ID ? `<button class="btn small" style="margin-left:auto;" onclick="masterUnbindSelf()">解除我自己的绑定</button>` : ''}
      </div>
    </div>

    <h4 style="margin: 12px 0 8px; font-size: 13px;">已关联同款 (${aliases.length})</h4>
    ${aliases.length === 0 ? `<div style="font-size: 12px; color: var(--text-tertiary); padding: 8px;">还没有绑定其他 SKU 为同款</div>` :
      `<div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
        ${aliases.map(a => `
          <div style="display:grid; grid-template-columns: 48px 1fr 80px; gap: 10px; padding: 8px 12px; align-items: center; border-bottom: 1px solid var(--border-subtle);">
            ${a.image_url ? `<img src="${escapeHtml(a.image_url)}" style="width:40px; height:40px; border-radius:4px; object-fit:cover;">` : '<div></div>'}
            <div>
              <div style="font-family:'JetBrains Mono', monospace; color: var(--accent); font-size:11px;">${escapeHtml(a.sku)}</div>
              <div style="font-size: 12px;">${escapeHtml(a.name_en || '')}</div>
            </div>
            <button class="btn small danger" onclick="masterRemoveAlias('${a.id}')">移除</button>
          </div>
        `).join('')}
      </div>`}

    <h4 style="margin: 14px 0 8px; font-size: 13px;">+ 添加同款</h4>
    <input type="text" id="masterBindSearch" placeholder="🔍 搜其他 SKU / 名称 来添加为同款" oninput="masterBindSearchInput(this.value)" class="form-control">
    <div id="masterBindSearchResults" style="margin-top: 8px; max-height: 200px; overflow-y: auto;"></div>
  `;
}

function masterBindSearchInput(q) {
  const results = document.getElementById('masterBindSearchResults');
  if (!q || q.length < 2) { results.innerHTML = ''; return; }
  const lower = q.toLowerCase();
  const masterId = PRODUCTS_CACHE._byId[MASTER_BIND_PRODUCT_ID]?.master_product_id || MASTER_BIND_PRODUCT_ID;
  const candidates = PRODUCTS_CACHE._all.filter(p =>
    p.id !== masterId && p.master_product_id !== masterId &&
    ((p.sku || '').toLowerCase().includes(lower) || (p.name_en || '').toLowerCase().includes(lower) || (p.name_cn || '').toLowerCase().includes(lower))
  ).slice(0, 15);
  if (candidates.length === 0) { results.innerHTML = '<div style="font-size:12px; color:var(--text-tertiary); padding:8px;">无匹配</div>'; return; }
  results.innerHTML = candidates.map(c => `
    <div style="display:grid; grid-template-columns: 40px 1fr 80px; gap: 10px; padding: 6px 10px; align-items: center; border-bottom: 1px solid var(--border-subtle); cursor:pointer;" onclick="masterAddAlias('${c.id}')">
      ${c.image_url ? `<img src="${escapeHtml(c.image_url)}" style="width:36px; height:36px; border-radius:4px; object-fit:cover;">` : '<div></div>'}
      <div>
        <div style="font-family:'JetBrains Mono', monospace; color: var(--accent); font-size:11px;">${escapeHtml(c.sku)}</div>
        <div style="font-size: 12px;">${escapeHtml(c.name_en || c.name_cn || '')}</div>
      </div>
      <button class="btn small primary">加为同款</button>
    </div>`).join('');
}

async function masterAddAlias(aliasId) {
  const masterId = PRODUCTS_CACHE._byId[MASTER_BIND_PRODUCT_ID]?.master_product_id || MASTER_BIND_PRODUCT_ID;
  try {
    await sb.from('products').update({ master_product_id: masterId }).eq('id', aliasId);
    await PRODUCTS_CACHE.loadAll();
    renderMasterBind();
    toast('已绑定为同款');
  } catch (e) { toast('失败：' + (e.message || e), 'err'); }
}
async function masterRemoveAlias(aliasId) {
  if (!confirm('确认移除该 SKU 的同款绑定？')) return;
  try {
    await sb.from('products').update({ master_product_id: null }).eq('id', aliasId);
    await PRODUCTS_CACHE.loadAll();
    renderMasterBind();
    toast('已移除');
  } catch (e) { toast('失败：' + (e.message || e), 'err'); }
}
async function masterUnbindSelf() {
  try {
    await sb.from('products').update({ master_product_id: null }).eq('id', MASTER_BIND_PRODUCT_ID);
    await PRODUCTS_CACHE.loadAll();
    renderMasterBind();
    toast('已解除');
  } catch (e) { toast('失败', 'err'); }
}

// ============ 采购单 tab ============
let PO_LIST = [];
let PO_FILTER = 'active';  // V20260526c: 默认从 'all' 改为 'active' (店小秘式待办)
// V20260526q: PO 店铺过滤(参考销售单)· 支持单店/多店 · manual PO(无 sales_order_id)不受影响
let PO_SHOP_FILTER = new Set();
let PO_SALES_ORDERS_MAP = {};
let PO_SUPPLIER_FILTER = '';
let PO_DATE_FILTER = null;  // {days, creator?} 时间范围筛选
let PO_SEARCH = '';         // 关键词搜索：PO 编号 / 供应商 / SKU / 产品名 / 备注
let PO_PAGE = 1;
const PO_PAGE_SIZE = 50;

// 5 步状态流：producing → sent → confirmed → arrived → received
const PO_STATUSES = [
  { value: 'producing', label: '已开单',         color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  { value: 'sent',      label: '已发供应商',     color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  { value: 'confirmed', label: '供应商已确认',   color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
  { value: 'arrived',   label: '已到货',         color: '#ea580c', bg: 'rgba(234,88,12,0.1)' },
  { value: 'received',  label: '已完成入库',     color: '#15803d', bg: 'rgba(21,128,61,0.1)' },
];
// 特殊状态
const PO_SPECIAL_STATUSES = {
  pending_approval: { label: '⏳ 待主管审批', color: '#b45309', bg: 'rgba(180,83,9,0.12)' },
  rejected:         { label: '❌ 已驳回',     color: '#b91c1c', bg: 'rgba(185,28,28,0.12)' },
  cancelled:        { label: '⊘ 已取消',     color: '#78716c', bg: 'rgba(120,113,108,0.12)' },
};
function poStatusInfo(value) {
  return PO_SPECIAL_STATUSES[value] || PO_STATUSES.find(s => s.value === value) || { label: value || '未知', color: '#888', bg: '#eee' };
}
function poNextStatus(value) {
  const i = PO_STATUSES.findIndex(s => s.value === value);
  return (i >= 0 && i < PO_STATUSES.length - 1) ? PO_STATUSES[i + 1] : null;
}
function poPrevStatus(value) {
  const i = PO_STATUSES.findIndex(s => s.value === value);
  return (i > 0) ? PO_STATUSES[i - 1] : null;
}

async function renderPo() {
  try {
    const { data } = await sb.from('orders').select('*').not('po_number', 'is', null).order('created_at', { ascending: false }).limit(500);
    PO_LIST = data || [];

    // 预加载相关销售单的 shopify_order_id + shop_domain（用于点击销售单号跳转 Shopify 后台）
    // V5-W3-2026-05-26: 多取 shipping_address(老 PO 打印时兜底算电气标准用)
    const salesOrderIds = [...new Set(PO_LIST.map(p => p.sales_order_id).filter(Boolean))];
    if (salesOrderIds.length > 0) {
      const { data: sos } = await sb.from('shopify_orders').select('id, shopify_order_id, shop_domain, shipping_address').in('id', salesOrderIds);
      PO_SALES_ORDERS_MAP = {};
      (sos || []).forEach(o => { PO_SALES_ORDERS_MAP[o.id] = o; });
    } else {
      PO_SALES_ORDERS_MAP = {};
    }

    poRefreshCounts();
    renderPoList();
    loadPoStats();
    // V20260526q: 加载完 PO 后渲染店铺过滤 chip
    if (typeof poRenderShops === 'function') poRenderShops();
  } catch (e) { toast('加载采购单失败：' + (e.message || e), 'err'); }
}

// 业绩统计：自己的下单数（管理员可看团队总计）
async function loadPoStats() {
  const container = document.getElementById('poStatsContainer');
  if (!container) return;
  const me = (typeof CURRENT_AGENT === 'string' && CURRENT_AGENT) ? CURRENT_AGENT : '';
  if (!me) { container.innerHTML = ''; return; }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const periods = [
    { label: '今天',   since: startOfToday },
    { label: '近7天',  since: new Date(now.getTime() - 7  * 86400000).toISOString() },
    { label: '近30天', since: new Date(now.getTime() - 30 * 86400000).toISOString() },
    { label: '近90天', since: new Date(now.getTime() - 90 * 86400000).toISOString() },
    { label: '近1年',  since: new Date(now.getTime() - 365 * 86400000).toISOString() },
  ];

  // 一次查询近 1 年的，前端切片
  const { data, error } = await sb.from('orders')
    .select('total_amount, status, creator_name, created_at')
    .gte('created_at', periods[periods.length - 1].since)
    .not('po_number', 'is', null);
  if (error) { console.warn('业绩统计加载失败：', error); return; }

  const myRows = (data || []).filter(r => r.creator_name === me);
  const allRows = data || [];

  const myStats = periods.map((p, idx) => {
    const rows = myRows.filter(r => r.created_at >= p.since);
    const days = idx === 0 ? 1 : [7, 30, 90, 365][idx - 1];
    return { label: p.label, count: rows.length, amount: rows.reduce((s, x) => s + Number(x.total_amount || 0), 0), days };
  });

  let html = `
    <div style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">📊 我的业绩 <span style="font-weight:400; color:var(--text-tertiary); margin-left:6px;">${escapeHtml(me)}<span style="margin-left:6px; font-size:11px;">· 点击卡片查看对应 PO</span></span></div>
        ${IS_ADMIN ? '<button class="btn small" onclick="poStatsToggleTeam()" style="font-size:11px;" id="poStatsToggleBtn">👥 查看全员</button>' : ''}
      </div>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;">
        ${myStats.map(s => `
          <div class="sales-stat-card" onclick="poFilterByPeriod(${s.days})" title="点击：筛选出${s.label}由我创建的采购单">
            <div style="font-size: 11px; color: var(--text-tertiary);">${s.label}</div>
            <div style="font-size: 20px; font-weight: 700; color: var(--accent); margin-top:2px;">${s.count}<span style="font-size: 11px; font-weight: 400; color: var(--text-tertiary); margin-left: 3px;">张</span></div>
            <div style="font-size: 10px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace;">¥ ${s.amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</div>
          </div>
        `).join('')}
      </div>
      <div id="poStatsTeam" style="display:none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-subtle);">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">👥 全员业绩（近1年）</div>
        ${(() => {
          const byCreator = {};
          allRows.forEach(r => {
            const c = r.creator_name || '未知';
            if (!byCreator[c]) byCreator[c] = { count: 0, amount: 0 };
            byCreator[c].count++;
            byCreator[c].amount += Number(r.total_amount || 0);
          });
          const sorted = Object.entries(byCreator).sort(([,a], [,b]) => b.count - a.count);
          if (sorted.length === 0) return '<div style="font-size:12px; color:var(--text-tertiary);">暂无数据</div>';
          return `<table style="width:100%; font-size:12px; border-collapse:collapse;">
            <thead><tr style="color:var(--text-tertiary); text-align:left;">
              <th style="padding:4px 8px;">跟单</th>
              <th style="padding:4px 8px; text-align:right;">今天</th>
              <th style="padding:4px 8px; text-align:right;">近7天</th>
              <th style="padding:4px 8px; text-align:right;">近30天</th>
              <th style="padding:4px 8px; text-align:right;">近90天</th>
              <th style="padding:4px 8px; text-align:right;">近1年</th>
              <th style="padding:4px 8px; text-align:right;">总金额（1年）</th>
            </tr></thead>
            <tbody>
              ${sorted.map(([creator, _]) => {
                const rs = allRows.filter(r => r.creator_name === creator);
                const counts = periods.map(p => rs.filter(r => r.created_at >= p.since).length);
                const totalAmount = rs.reduce((s, x) => s + Number(x.total_amount || 0), 0);
                const isMe = creator === me;
                return `<tr style="border-top:1px solid var(--border-subtle); ${isMe ? 'background:rgba(37,99,235,0.04);' : ''}">
                  <td style="padding:4px 8px; font-weight:${isMe ? '600' : '400'};">${escapeHtml(creator)}${isMe ? ' <span style="font-size:10px; color:var(--accent);">(我)</span>' : ''}</td>
                  ${counts.map(c => `<td style="padding:4px 8px; text-align:right; font-family:monospace;">${c}</td>`).join('')}
                  <td style="padding:4px 8px; text-align:right; font-family:monospace; color:var(--text-secondary);">¥ ${totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
        })()}
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function poStatsToggleTeam() {
  const el = document.getElementById('poStatsTeam');
  const btn = document.getElementById('poStatsToggleBtn');
  if (!el) return;
  const visible = el.style.display !== 'none';
  el.style.display = visible ? 'none' : 'block';
  if (btn) btn.textContent = visible ? '👥 查看全员' : '👥 收起';
}

function poRefreshCounts() {
  // V20260526c 改造:加 "active" = 进行中(店小秘式"待办") · 排除已完成 + 已取消
  const counts = { all: 0, active: 0, producing: 0, ordered: 0, done: 0, cancelled: 0, pending: 0 };
  PO_LIST.forEach(p => {
    if (p.status === 'cancelled') counts.cancelled++;
    else {
      counts.all++;  // "全部" 排除已取消
      if (p.status === 'received') counts.done++;
      else if (p.status === 'pending_approval') { counts.pending++; counts.active++; }
      else if (p.status === 'producing') { counts.producing++; counts.active++; }
      else if (['sent', 'confirmed', 'arrived'].includes(p.status)) { counts.ordered++; counts.active++; }
    }
  });
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('poCntAll', counts.all);
  setText('poCntActive', counts.active);  // V20260526c 新加
  setText('poCntProducing', counts.producing);
  setText('poCntOrdered', counts.ordered);
  setText('poCntDone', counts.done);
  setText('poCntCancelled', counts.cancelled);
  setText('poCntPending', counts.pending);
  if (typeof setBadge === 'function') setBadge('badgePo', IS_ADMIN && counts.pending > 0 ? counts.pending : (counts.producing + counts.ordered));
}

function poShowFilter(f) {
  PO_FILTER = f;
  PO_PAGE = 1;  // 切换 tab 时重置页码
  document.querySelectorAll('.sub-tab-btn[data-pofilter]').forEach(b => b.classList.toggle('active', b.dataset.pofilter === f));
  renderPoList();
}

function poChangeSupplierFilter(val) {
  PO_SUPPLIER_FILTER = val || '';
  PO_PAGE = 1;
  renderPoList();
}

// 点击业绩卡片：按时间 + 当前用户筛选 PO
function poFilterByPeriod(days) {
  // V20260526a: 用 preset string 而非 days
  const presetMap = { 1: 'today', 7: 'last_7', 30: 'last_30', 90: 'last_90', 365: 'last_365' };
  const preset = presetMap[days] || 'last_' + days;
  PO_DATE_FILTER = { preset, creator: CURRENT_AGENT, days };  // days 留着兜底
  PO_FILTER = 'active';  // V20260526c: 业绩卡切换到待办 tab（仍然排除已取消）
  PO_PAGE = 1;
  // 同步 sub-tab UI
  document.querySelectorAll('.sub-tab-btn[data-pofilter]').forEach(b => b.classList.toggle('active', b.dataset.pofilter === 'all'));
  renderPoList();
  setTimeout(() => {
    const el = document.getElementById('poListBody');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
  toast(`✓ 已筛选:${days === 1 ? '今天' : '近 ' + days + ' 天'} · ${CURRENT_AGENT}`);
}

// V20260526a: 给通用日期筛选下拉用的入口
function poSetDatePreset(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, (customPreset) => {
        PO_DATE_FILTER = { preset: customPreset };  // 不带 creator
        PO_PAGE = 1;
        renderPoList();
        toast(`✓ 已筛选自定义日期范围`);
      });
    }
    return;
  }
  if (!preset || preset === 'all') {
    PO_DATE_FILTER = null;
  } else {
    PO_DATE_FILTER = { preset };  // 不带 creator(下拉是全员视角)
  }
  PO_PAGE = 1;
  renderPoList();
  if (preset && preset !== 'all' && typeof getDateRange === 'function') {
    const r = getDateRange(preset);
    toast(`✓ 已筛选:${r.label}`);
  }
}

function poClearDateFilter() {
  PO_DATE_FILTER = null;
  renderPoList();
}

// V20260526c: 一键清除所有筛选(空状态时给用户的逃生门)
function poClearAllFilters() {
  PO_DATE_FILTER = null;
  PO_SUPPLIER_FILTER = '';
  PO_SEARCH = '';
  PO_FILTER = 'active';  // 默认到"未完成"
  PO_PAGE = 1;
  document.querySelectorAll('.sub-tab-btn[data-pofilter]').forEach(b => b.classList.toggle('active', b.dataset.pofilter === 'active'));
  renderPoList();
  toast('✓ 已清除所有筛选');
}

// V4：搜索（带 200ms 防抖，避免每输入一字符就重渲染）
let _poSearchTimer = null;
function poSetSearch(val) {
  if (_poSearchTimer) clearTimeout(_poSearchTimer);
  _poSearchTimer = setTimeout(() => {
    PO_SEARCH = (val || '').trim();
    PO_PAGE = 1;
    renderPoList();
    // 保持搜索框焦点（重渲染后输入框是新元素，要重新聚焦 + 光标移到末尾）
    const inp = document.getElementById('poSearchInput');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }, 200);
}

function poClearSearch() {
  PO_SEARCH = '';
  PO_PAGE = 1;
  renderPoList();
}

function poGoPage(p) {
  PO_PAGE = Math.max(1, p);
  renderPoList();
  // 滚动到列表顶
  const el = document.getElementById('poListBody');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPoList() {
  let list = PO_LIST;
  // V20260526c: 加 "active" 状态 = 进行中(店小秘式"待办"· 排除已完成 + 已取消)
  if (PO_FILTER === 'active') list = list.filter(p => !['received', 'cancelled'].includes(p.status));
  else if (PO_FILTER === 'pending') list = list.filter(p => p.status === 'pending_approval');
  else if (PO_FILTER === 'producing') list = list.filter(p => p.status === 'producing');
  else if (PO_FILTER === 'ordered') list = list.filter(p => ['sent', 'confirmed', 'arrived'].includes(p.status));
  else if (PO_FILTER === 'cancelled') list = list.filter(p => p.status === 'cancelled');
  else if (PO_FILTER === 'done') list = list.filter(p => p.status === 'received');
  else if (PO_FILTER === 'all') list = list.filter(p => p.status !== 'cancelled');

  // 供应商筛选
  if (PO_SUPPLIER_FILTER) list = list.filter(p => (p.supplier || '') === PO_SUPPLIER_FILTER);
  
  // V20260526q: 店铺筛选(从关联 SO 获取 shop_domain · manual PO 无 SO 关联不受过滤)
  if (PO_SHOP_FILTER && PO_SHOP_FILTER.size > 0) {
    list = list.filter(p => {
      if (!p.sales_order_id) return true;  // manual PO 总是显示(没法判断店铺)
      const so = PO_SALES_ORDERS_MAP[p.sales_order_id];
      return so && PO_SHOP_FILTER.has(so.shop_domain || '');
    });
  }

  // 日期筛选（点击业绩卡片 或 日期下拉)
  // V20260526a: 重构 PO_DATE_FILTER 用 preset string + 可选 creator
  if (PO_DATE_FILTER) {
    // 新格式:{ preset, creator? }
    if (PO_DATE_FILTER.preset && typeof isDateInRange === 'function') {
      list = list.filter(p => isDateInRange(p.created_at, PO_DATE_FILTER.preset));
    } else if (PO_DATE_FILTER.days) {
      // 旧格式兼容
      const cutoff = PO_DATE_FILTER.days === 1
        ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
        : new Date(Date.now() - PO_DATE_FILTER.days * 86400000).toISOString();
      list = list.filter(p => (p.created_at || '') >= cutoff);
    }
    if (PO_DATE_FILTER.creator) list = list.filter(p => p.creator_name === PO_DATE_FILTER.creator);
  }

  // V4：多维关键词搜索（PO 编号 / 供应商 / SKU / 产品名 / 备注 / 销售单号 / 创建人）
  if (PO_SEARCH) {
    const q = PO_SEARCH.toLowerCase().trim();
    list = list.filter(p => {
      // PO 自身字段
      if ((p.po_number || '').toLowerCase().includes(q)) return true;
      if ((p.supplier || '').toLowerCase().includes(q)) return true;
      if ((p.order_no || '').toLowerCase().includes(q)) return true;
      if ((p.note || '').toLowerCase().includes(q)) return true;
      if ((p.box_note || '').toLowerCase().includes(q)) return true;
      if ((p.creator_name || '').toLowerCase().includes(q)) return true;
      // line_items 里的 SKU / 产品名 / variant
      for (const li of (p.line_items || [])) {
        if ((li.sku || '').toLowerCase().includes(q)) return true;
        if ((li.title_cn || '').toLowerCase().includes(q)) return true;
        if ((li.title_en || '').toLowerCase().includes(q)) return true;
        if ((li.variant || '').toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }

  const body = document.getElementById('poListBody');
  // V20260526c: 空状态先不 return · 等下面把筛选栏建好再渲染

  // 分页
  const totalPages = Math.max(1, Math.ceil(list.length / PO_PAGE_SIZE));
  if (PO_PAGE > totalPages) PO_PAGE = totalPages;
  const start = (PO_PAGE - 1) * PO_PAGE_SIZE;
  const pagedList = list.slice(start, start + PO_PAGE_SIZE);

  // 收集所有供应商（用于筛选下拉）
  const allSuppliers = [...new Set(PO_LIST.filter(p => p.status !== 'cancelled').map(p => p.supplier).filter(Boolean))].sort();
  const supplierFilterHtml = `
    <div style="display:flex; gap:10px; align-items:center; padding:10px 0; flex-wrap:wrap;">
      <!-- V4:多维搜索框 -->
      <div style="position:relative; flex:1; min-width:240px; max-width:380px;">
        <input type="text" id="poSearchInput" placeholder="🔍 PO 编号 / 供应商 / SKU / 产品名 / 备注..." 
               value="${escapeHtml(PO_SEARCH)}" 
               oninput="poSetSearch(this.value)"
               style="width:100%; padding:7px 32px 7px 12px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary);">
        ${PO_SEARCH ? `<span onclick="poClearSearch()" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); cursor:pointer; color:var(--text-tertiary); font-size:14px; padding:2px 6px;" title="清除搜索">✕</span>` : ''}
      </div>
      <select onchange="poChangeSupplierFilter(this.value)" style="padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); min-width:200px;">
        <option value="">— 全部供应商 (${allSuppliers.length}) —</option>
        ${allSuppliers.map(s => `<option value="${escapeHtml(s)}" ${PO_SUPPLIER_FILTER === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
      </select>
      <!-- V20260526a: 通用日期筛选下拉 -->
      <select id="poDateFilterSelect" onchange="poSetDatePreset(this.value)" 
              style="padding:6px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px; background:var(--bg-card); color:var(--text-primary); min-width:160px;">
        <!-- 由 populateDateFilterSelect 动态填充 -->
      </select>
      ${PO_DATE_FILTER && PO_DATE_FILTER.preset ? `
        <span style="display:inline-flex; align-items:center; gap:4px; padding: 4px 10px; background: var(--accent-soft, #eff6ff); border: 1px solid var(--accent); border-radius: 14px; font-size: 12px; color: var(--accent); font-weight: 600;">
          📅 ${escapeHtml((typeof getDateRange === 'function' ? getDateRange(PO_DATE_FILTER.preset).label : PO_DATE_FILTER.preset))}${PO_DATE_FILTER.creator ? ' · ' + escapeHtml(PO_DATE_FILTER.creator) : ''}
          <span onclick="poClearDateFilter()" style="cursor:pointer; margin-left:4px; padding: 0 4px;" title="清除日期筛选">✕</span>
        </span>
      ` : ''}
      ${(PO_SEARCH || PO_SUPPLIER_FILTER) ? `
        <span style="font-size:12px; color:var(--text-secondary);">
          ${PO_SUPPLIER_FILTER ? `筛选 <b>${escapeHtml(PO_SUPPLIER_FILTER)}</b>` : ''}${PO_SUPPLIER_FILTER && PO_SEARCH ? ' · ' : ''}${PO_SEARCH ? `搜 "<b>${escapeHtml(PO_SEARCH)}</b>"` : ''}：<b style="color:var(--accent);">${list.length}</b> 张
        </span>
        ${PO_SUPPLIER_FILTER ? `
          <button class="btn small" onclick="poExportSupplier()" title="导出该供应商的对单表(用于催单/对账)">📤 对单表</button>
          <button class="btn small primary" onclick="poBatchExportOpenDialog()" title="把所有 PO 打包成一个 PDF/Word 发给供应商">📑 批量导出 PO</button>
        ` : ''}
      ` : ''}
    </div>
  `;

  // V20260526c: 卡片列表 · 空时显示友好提示(但筛选栏仍在,用户能切日期)
  let cardsHtml;
  if (list.length === 0) {
    const filterActive = (PO_DATE_FILTER) || PO_SUPPLIER_FILTER || PO_SEARCH;
    cardsHtml = `
      <div style="padding:48px 24px; text-align:center; color:var(--text-tertiary);">
        <div style="font-size:42px; opacity:0.4; margin-bottom:8px;">📭</div>
        <div style="font-size:14px; color:var(--text-secondary); font-weight:600;">${filterActive ? '当前筛选下没有采购单' : '还没有采购单'}</div>
        ${filterActive ? `
          <div style="font-size:12px; margin-top:6px;">试试切换日期范围 / 清除筛选 / 选其他状态</div>
          <button class="btn small primary" style="margin-top:12px;" onclick="poClearAllFilters()">🔄 清除全部筛选</button>
        ` : '<div style="font-size:12px; margin-top:6px;">点右上「+ 新建采购单」开始创建</div>'}
      </div>
    `;
  } else {
    cardsHtml = pagedList.map(p => {
    const items = p.line_items || [];
    const created = p.created_at ? new Date(p.created_at).toISOString().slice(0,10) : '';
    const isCancelled = p.status === 'cancelled';
    const isPending = p.status === 'pending_approval';
    const isRejected = p.status === 'rejected';
    const statusInfo = poStatusInfo(p.status);
    const next = !isPending && !isRejected && !isCancelled ? poNextStatus(p.status) : null;
    const prev = !isPending && !isRejected && !isCancelled ? poPrevStatus(p.status) : null;

    // 触发审批的原因
    const bigQtyItems = items.filter(li => (li.qty || 0) > 20);
    const isBigTotal = Number(p.total_amount || 0) > 5000;
    let approvalReasons = [];
    if (bigQtyItems.length > 0) approvalReasons.push(`产品数量过大 (${bigQtyItems.map(li => (li.title_cn||li.title_en)+' '+li.qty+'件').join(', ')})`);
    if (isBigTotal) approvalReasons.push(`金额 ¥${Number(p.total_amount).toFixed(2)} > 5000`);

    // 构建 Shopify Admin 订单链接
    const soInfo = PO_SALES_ORDERS_MAP[p.sales_order_id] || {};
    const adminLink = (soInfo.shop_domain && soInfo.shopify_order_id)
      ? `https://${soInfo.shop_domain}/admin/orders/${soInfo.shopify_order_id}`
      : '';

    return `
      <div class="po-card ${isCancelled ? 'cancelled' : ''}" style="${isPending ? 'border-color:var(--warning); border-width:2px;' : isRejected ? 'border-color:var(--danger); border-width:2px;' : ''}">
        <div class="po-card-top" style="display:flex; align-items:center; flex-wrap:wrap; gap:14px; padding:10px 14px; background:var(--bg-elevated); border-bottom:1px solid var(--border-subtle); font-size:12px;">
          <div style="flex:1 1 auto; min-width:280px; max-width:660px;">
            <span class="po-no">${escapeHtml(p.po_number || '')}</span>
            <span class="po-meta" style="margin-left: 12px;">销售单 ${adminLink ? `<a href="${adminLink}" target="_blank" rel="noopener" style="color:var(--accent); text-decoration:none; font-weight:600;" title="在 Shopify 后台打开">${escapeHtml(p.order_no || '')} ↗</a>` : `<b>${escapeHtml(p.order_no || '')}</b>`} · ${escapeHtml(p.site || '')}</span>
          </div>
          <div class="po-meta" style="flex-shrink:0; flex-grow:0; min-width:140px; max-width:240px;">供应商:<b>${escapeHtml(p.supplier || '')}</b></div>
          <div class="po-meta" style="flex-shrink:0; flex-grow:0; width:160px; text-align:right; font-family:'JetBrains Mono',monospace; margin-left:0;">¥ ${Number(p.total_amount || 0).toFixed(2)}</div>
        </div>
        ${isPending ? `<div style="background:rgba(180,83,9,0.08); padding:8px 14px; border-bottom:1px solid var(--border-subtle); font-size:12px;"><b style="color:var(--warning);">⚠️ 待主管审批：</b><span style="color:var(--text-secondary);">${approvalReasons.join('；') || '触发审批阈值'}</span></div>` : ''}
        ${isRejected && p.approval_note ? `<div style="background:rgba(185,28,28,0.08); padding:8px 14px; border-bottom:1px solid var(--border-subtle); font-size:12px;"><b style="color:var(--danger);">❌ 驳回原因：</b><span style="color:var(--text-primary);">${escapeHtml(p.approval_note)}</span>${p.approved_by ? ` <span style="color:var(--text-tertiary);">· 由 ${escapeHtml(p.approved_by)} 驳回</span>` : ''}</div>` : ''}
        <div class="po-card-body" style="display: flex; align-items: flex-start; gap: 24px; font-size: 12px; padding: 10px 14px;">
          <div style="flex: 1; min-width: 0; max-width: 780px;">
            ${items.slice(0,3).map(li => {
              const skuStr = li.sku || '';
              const titleStr = li.title_cn || li.title_en || '';
              // V5-2026-05-24: 双语显示 - 如果有中文 + 英文且不同,两个都显示
              const titleEnStr = (li.title_cn && li.title_en && li.title_cn !== li.title_en) ? li.title_en : '';
              const variantStr = li.variant || '';  // V5: 变体/规格
              const skuClickable = skuStr 
                ? `<a href="#" onclick="event.preventDefault();event.stopPropagation();gotoProductBySku('${escapeHtml(skuStr).replace(/'/g, "\\'")}');return false;" style="color:var(--accent); text-decoration:none; cursor:pointer;" title="点击查看产品详情">${escapeHtml(skuStr)}</a>` 
                : '';
              const titleClickable = skuStr
                ? `<a href="#" onclick="event.preventDefault();event.stopPropagation();gotoProductBySku('${escapeHtml(skuStr).replace(/'/g, "\\'")}');return false;" style="color:inherit; text-decoration:none; cursor:pointer; border-bottom:1px dashed var(--border-subtle);" title="点击查看产品详情">${escapeHtml(titleStr)}</a>`
                : escapeHtml(titleStr);
              return `
              <div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:6px;">
                ${li.image_url
                  ? `<img src="${escapeHtml(li.image_url)}" style="width:50px; height:50px; object-fit:cover; border-radius:6px; border:1px solid var(--border-subtle); cursor:zoom-in; flex-shrink:0;" onclick="openImgLightbox('${escapeHtml(li.image_url)}')">`
                  : `<div style="width:50px; height:50px; border-radius:6px; background:var(--bg-elevated); display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:18px; flex-shrink:0;">📷</div>`}
                <div style="flex:1; min-width:0; font-size:12px;">
                  <div style="color:var(--text-tertiary); font-family:monospace; font-size:10px;">${skuClickable}</div>
                  <div style="color:var(--text-primary);">${titleClickable}${titleEnStr ? ` <span style="color:var(--text-tertiary); font-size:11px; font-weight:400;">/ ${escapeHtml(titleEnStr)}</span>` : ''} ${(li.qty||0) >= 2 ? `<span style="background:var(--danger); color:white; padding:2px 8px; border-radius:5px; font-weight:700; font-size:14px; margin:0 4px;">× ${li.qty}</span>` : `<span style="color:var(--text-tertiary)">× ${li.qty}</span>`} @ ¥${Number(li.price).toFixed(2)}</div>
                  ${variantStr ? `<div style="color:var(--text-secondary); font-size:11px; margin-top:2px;">📐 ${escapeHtml(variantStr)}</div>` : ''}
                </div>
              </div>`;
            }).join('')}
            ${items.length > 3 ? `<div style="color:var(--text-tertiary); font-size:11px;">还有 ${items.length-3} 行…</div>` : ''}
            ${p.box_note ? `<div style="color:var(--text-secondary); margin-top:6px;">📦 <b>纸箱:</b> ${escapeHtml(p.box_note)}</div>` : ''}
            ${p.note ? `<div style="color:var(--text-secondary); margin-top:4px; padding:6px 8px; background:rgba(245,158,11,0.06); border-left:2px solid var(--warning); border-radius:3px; white-space:pre-wrap;">📝 <b>其他:</b> ${escapeHtml(p.note)}</div>` : ''}
          </div>
          <div style="font-size: 11px; color: var(--text-tertiary); flex-shrink: 0; flex-grow: 0; width: 180px; margin-left: 0;">
            <div>开单:${created}</div>
            <div>下单日期:${escapeHtml(p.promised_date || '—')}</div>
            <div style="margin-top: 4px;">
              <span style="display:inline-block; padding:2px 8px; border-radius:4px; background:${statusInfo.bg}; color:${statusInfo.color}; font-size:11px; font-weight:500;">
                ${statusInfo.label}
              </span>
            </div>
            <div>跟单:${escapeHtml(p.creator_name || '')}</div>
            ${p.approved_by && !isRejected ? `<div style="color:var(--success); font-size:11px;">✓ 由 ${escapeHtml(p.approved_by)} 批准</div>` : ''}
          </div>
        </div>
        <div class="po-card-actions">
          <div style="font-size: 11px; color: var(--text-tertiary);">${items.length} 个产品行 · ${items.reduce((s,x) => s + (x.qty||0), 0)} 件</div>
          <div style="display: flex; gap: 6px; align-items:center; flex-wrap:wrap;">
            ${isPending && IS_ADMIN ? `<button class="so-action-btn primary" onclick="poApprove('${p.id}')">✓ 批准</button><button class="so-action-btn danger" onclick="poReject('${p.id}')">❌ 驳回</button>` : ''}
            ${isPending && !IS_ADMIN ? `<span style="font-size:11px; color:var(--warning);">等待主管审批</span>` : ''}
            ${isRejected ? `<button class="so-action-btn primary" onclick="poResubmit('${p.id}')">↻ 重新提交审批</button>` : ''}
            ${next ? `<button class="so-action-btn primary" onclick="poAdvance('${p.id}', '${next.value}', '${next.label}')" title="推进到下一步">▶ ${next.label}</button>` : ''}
            ${prev ? `<button class="so-action-btn" onclick="poRevert('${p.id}', '${prev.value}', '${prev.label}')" title="退回上一步">↩ 退回</button>` : ''}
            ${!isCancelled && p.status !== 'received' ? `<button class="so-action-btn" onclick="poEditPrices('${p.id}')" title="修改 PO 内每个产品的数量和单价">✏️ 改价</button>` : ''}
            ${!isCancelled && p.status !== 'received' ? `<button class="so-action-btn" onclick="poEditDescription('${p.id}')" title="修改产品中文名/英文名/规格/备注（不改数量和价格）">📝 改描述</button>` : ''}
            <button class="so-action-btn" onclick="poPreviewImage('${p.id}')" title="预览订单图（不下载、不复制）｜确认无误后再点复制订单图">👁 预览</button>
            <button class="so-action-btn primary" onclick="poQuickCopyImage('${p.id}')" title="一键生成订单图，直接复制到剪贴板，粘贴到供应商群">📋 复制订单图</button>
            <button class="so-action-btn" onclick="poOpenPrint('${p.id}')" title="预览 + 打印（少数订单需要纸质单据）">🖨 打印</button>
            ${!isCancelled ? `<button class="so-action-btn danger" onclick="poCancel('${p.id}')">⊘ 取消</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
  }  // V20260526c: 关闭 else 分支

  // 分页 footer
  let pagerHtml = '';
  if (totalPages > 1) {
    const pageBtns = [];
    const maxBtns = 7;
    let s = Math.max(1, PO_PAGE - 3);
    let e = Math.min(totalPages, s + maxBtns - 1);
    s = Math.max(1, e - maxBtns + 1);
    for (let i = s; i <= e; i++) {
      pageBtns.push(`<button class="btn small ${i === PO_PAGE ? 'primary' : ''}" onclick="poGoPage(${i})" style="min-width:32px;">${i}</button>`);
    }
    pagerHtml = `
      <div style="display:flex; justify-content:center; align-items:center; gap:6px; padding:16px; flex-wrap:wrap;">
        <button class="btn small" onclick="poGoPage(1)" ${PO_PAGE === 1 ? 'disabled' : ''}>« 首页</button>
        <button class="btn small" onclick="poGoPage(${PO_PAGE - 1})" ${PO_PAGE === 1 ? 'disabled' : ''}>‹ 上一页</button>
        ${pageBtns.join('')}
        <button class="btn small" onclick="poGoPage(${PO_PAGE + 1})" ${PO_PAGE === totalPages ? 'disabled' : ''}>下一页 ›</button>
        <button class="btn small" onclick="poGoPage(${totalPages})" ${PO_PAGE === totalPages ? 'disabled' : ''}>末页 »</button>
        <span style="margin-left:12px; font-size:12px; color:var(--text-tertiary);">共 <b>${list.length}</b> 条 · 第 ${PO_PAGE}/${totalPages} 页</span>
      </div>`;
  } else {
    pagerHtml = `<div style="text-align:center; padding:10px; font-size:11px; color:var(--text-tertiary);">共 ${list.length} 条</div>`;
  }

  body.innerHTML = supplierFilterHtml + cardsHtml + pagerHtml;
  
  // V20260526a: 填充通用日期筛选下拉
  if (typeof populateDateFilterSelect === 'function') {
    const dateSelect = document.getElementById('poDateFilterSelect');
    if (dateSelect) {
      const currentPreset = (PO_DATE_FILTER && PO_DATE_FILTER.preset) ? PO_DATE_FILTER.preset : 'all';
      populateDateFilterSelect(dateSelect, currentPreset);
    }
  }
}

// 导出当前筛选的供应商所有 PO（生成对单表，新窗口打开，可打印 PDF / 复制到 Excel）
function poExportSupplier() {
  if (!PO_SUPPLIER_FILTER) { toast('请先选择供应商', 'warn'); return; }
  const supplier = PO_SUPPLIER_FILTER;
  // 收集该供应商所有非取消的 PO（按当前 sub-tab 过滤）
  let list = PO_LIST.filter(p => (p.supplier || '') === supplier);
  if (PO_FILTER === 'pending') list = list.filter(p => p.status === 'pending_approval');
  else if (PO_FILTER === 'producing') list = list.filter(p => p.status === 'producing');
  else if (PO_FILTER === 'ordered') list = list.filter(p => ['sent', 'confirmed', 'arrived'].includes(p.status));
  else if (PO_FILTER === 'cancelled') list = list.filter(p => p.status === 'cancelled');
  else if (PO_FILTER === 'done') list = list.filter(p => p.status === 'received');
  else list = list.filter(p => p.status !== 'cancelled');

  if (list.length === 0) { toast(`供应商「${supplier}」下没有符合条件的 PO`, 'warn'); return; }

  const today = new Date().toISOString().slice(0, 10);
  const totalAmount = list.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const totalQty = list.reduce((s, p) => s + (p.line_items || []).reduce((q, li) => q + Number(li.qty || 0), 0), 0);

  const labelMap = { all: '进行中（全部）', pending: '待审批', producing: '待发供应商', ordered: '已下单', done: '已完成', cancelled: '已取消' };
  const filterLabel = labelMap[PO_FILTER] || PO_FILTER;

  // 收集所有 line items（按 PO 平铺）
  const allRows = [];
  list.forEach(p => {
    (p.line_items || []).forEach(li => {
      allRows.push({
        po_number: p.po_number,
        order_no: p.order_no,
        site: p.site,
        created: p.created_at?.slice(0, 10) || '',
        promised: p.promised_date || '',
        status: poStatusInfo(p.status).label,
        box_note: p.box_note || '',
        sku: li.sku || '',
        title: li.title_cn || li.title_en || '',
        variant: li.variant || '',
        image_url: li.image_url || '',
        qty: li.qty || 0,
        price: li.price || 0,
        subtotal: (Number(li.qty) || 0) * (Number(li.price) || 0),
      });
    });
  });

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${supplier} 对单表 - ${today}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; padding: 20px; color: #1c1917; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #78716c; font-size: 12px; margin-bottom: 16px; }
  .summary { background: #f5f5f4; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; display: flex; gap: 24px; font-size: 13px; }
  .summary b { font-size: 16px; color: #2563eb; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  thead { background: #f5f5f4; }
  th, td { border: 1px solid #d6d3d1; padding: 6px 8px; vertical-align: middle; }
  th { font-weight: 600; text-align: left; }
  .qty-big { background: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 14px; }
  img { display: block; width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #d6d3d1; }
  .actions { margin: 14px 0; }
  .actions button { background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 8px; }
  .actions button:hover { background: #1d4ed8; }
  @media print {
    .actions { display: none; }
    body { padding: 8px; }
    table { font-size: 10px; }
    img { width: 50px; height: 50px; }
  }
</style>
</head>
<body>
<h1>📋 ${supplier} 对单表</h1>
<div class="meta">导出日期：${today} · 状态范围：${filterLabel} · 用于催单 / 对账 / 内部沟通</div>
<div class="summary">
  <div>采购单总数：<b>${list.length}</b></div>
  <div>产品行数：<b>${allRows.length}</b></div>
  <div>总件数：<b>${totalQty}</b></div>
  <div>总金额：<b>¥ ${totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b></div>
</div>
<div class="actions">
  <button onclick="window.print()">🖨 打印 / 保存为 PDF</button>
  <button onclick="navigator.clipboard.writeText(document.querySelector('table').outerHTML).then(() => alert('已复制 HTML，可粘贴到 Excel/Word'))">📋 复制表格</button>
  <span style="font-size:12px; color:#78716c;">提示：浏览器打印窗口可选"另存为 PDF"</span>
</div>
<table>
  <thead>
    <tr>
      <th style="width: 70px;">图片</th>
      <th>采购单号</th>
      <th>销售单</th>
      <th>SKU / 产品</th>
      <th>规格</th>
      <th style="width: 60px; text-align: center;">数量</th>
      <th style="width: 80px; text-align: right;">单价</th>
      <th style="width: 90px; text-align: right;">小计</th>
      <th style="width: 100px;">订单备注</th>
      <th style="width: 80px;">开单日</th>
      <th>状态</th>
    </tr>
  </thead>
  <tbody>
    ${allRows.map(r => `
      <tr>
        <td>${r.image_url ? `<img src="${r.image_url}">` : '—'}</td>
        <td style="font-family: monospace; font-size: 11px;">${r.po_number}</td>
        <td>${r.order_no || ''} <span style="color:#78716c; font-size:10px;">${r.site || ''}</span></td>
        <td><b>${r.title}</b><br><span style="color:#78716c; font-size:10px; font-family:monospace;">${r.sku}</span></td>
        <td style="font-size: 11px; color: #44403c;">${r.variant}</td>
        <td style="text-align: center;">${Number(r.qty) >= 2 ? `<span class="qty-big">${r.qty}</span>` : r.qty}</td>
        <td style="text-align: right; font-family: monospace;">¥${Number(r.price).toFixed(2)}</td>
        <td style="text-align: right; font-family: monospace;"><b>¥${Number(r.subtotal).toFixed(2)}</b></td>
        <td style="font-size: 11px;">${r.box_note}</td>
        <td style="font-size: 11px;">${r.created}</td>
        <td style="font-size: 11px;">${r.status}</td>
      </tr>
    `).join('')}
  </tbody>
</table>
<div style="margin-top: 16px; font-size: 11px; color: #78716c; text-align: right;">
  跟单团队工作台 · 共 ${allRows.length} 行 · 总额 ¥${totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('浏览器阻止了新窗口，请允许弹窗', 'err'); return; }
  win.document.write(html);
  win.document.close();
  toast(`✓ ${supplier} 对单表已打开，可打印/导出 PDF`);
}

async function poApprove(poId) {
  if (!IS_ADMIN) { toast('只有主管能批准', 'err'); return; }
  if (!confirm('批准这张采购单？批准后跟单可继续推进流程。')) return;
  try {
    await sb.from('orders').update({
      status: 'producing',
      approved_by: CURRENT_AGENT,
      approval_note: '已批准',
      updated_at: new Date().toISOString(),
    }).eq('id', poId);
    toast('✓ 已批准');
    await renderPo();
  } catch (e) { toast('失败：' + (e.message || e), 'err'); }
}

async function poReject(poId) {
  if (!IS_ADMIN) { toast('只有主管能驳回', 'err'); return; }
  const reason = await showPrompt({ title: '⊗ 驳回采购单', message: '驳回原因会显示给跟单作为修改依据。', field: { label: '驳回原因', value: '', type: 'textarea', rows: 3, placeholder: '例：单价偏高，请重新询价', required: true } });
  if (reason === null) return;
  if (!reason.trim()) { toast('请填驳回原因', 'warn'); return; }
  try {
    const po = PO_LIST.find(x => x.id === poId);
    await sb.from('orders').update({
      status: 'rejected',
      approved_by: CURRENT_AGENT,
      approval_note: reason.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', poId);
    // 释放 line_items 的 po_assignments，让跟单可以重新开
    if (po && po.sales_order_id) {
      const { data: so } = await sb.from('shopify_orders').select('line_items, local_status').eq('id', po.sales_order_id).single();
      if (so) {
        const updatedItems = (so.line_items || []).map(li => ({
          ...li,
          po_assignments: (li.po_assignments || []).filter(a => a.po_id !== poId),
        }));
        const stillFullyAssigned = updatedItems.every(li => {
          const totalAssigned = (li.po_assignments || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
          return totalAssigned >= (Number(li.quantity) || 0);
        });
        const updateData = { line_items: updatedItems, updated_at: new Date().toISOString() };
        if (so.local_status === 'done' && !stillFullyAssigned) {
          updateData.local_status = 'processing';
        }
        await sb.from('shopify_orders').update(updateData).eq('id', po.sales_order_id);
      }
    }
    toast('已驳回，line item 已释放可重开');
    SHOPIFY.invalidateOrders();
    await renderPo();
  } catch (e) { toast('失败：' + (e.message || e), 'err'); }
}

async function poResubmit(poId) {
  if (!confirm('重新提交审批？\n（请确认已修正驳回原因里提到的问题）')) return;
  try {
    await sb.from('orders').update({
      status: 'pending_approval',
      approval_note: null,
      approved_by: null,
      updated_at: new Date().toISOString(),
    }).eq('id', poId);
    toast('已重新提交，等主管审批');
    await renderPo();
  } catch (e) { toast('失败：' + (e.message || e), 'err'); }
}

async function poAdvance(poId, nextStatus, nextLabel) {
  const po = PO_LIST.find(x => x.id === poId);
  if (!po) return;

  // V4 修复：推进到 "received"（财务收货完成）时同步到 Shopify 后台
  // 业务流程：producing → sent → confirmed → arrived → received（财务收货 = 此时触发同步）
  if (nextStatus === 'received') {
    const items = po.line_items || [];
    const today = new Date().toISOString().slice(0, 10);
    // 默认拼接：每行一个产品
    const defaultLines = items.map(li => {
      const name = li.title_cn || li.title_en || li.sku || '产品';
      return `  • ${name} × ${li.qty}（${po.supplier || '供应商'}）已回`;
    }).join('\n');
    const defaultAppend = `[财务录入 ${today}] 采购单 ${po.po_number} 已完成入库：\n${defaultLines}`;

    const extraNote = await showPrompt({
      title: `✓ 确认 ${po.po_number} 财务收货完成？`,
      message: `财务对账完成后，会自动追加以下内容到 Shopify 订单备注（保留原有客户备注）：\n${'─'.repeat(38)}\n${defaultAppend}\n${'─'.repeat(38)}`,
      field: { label: '额外备注（可选）', value: '', type: 'textarea', rows: 3, placeholder: '如：完好，无破损 / 缺 1 个待补 / 包装稍有变形' },
    });
    if (extraNote === null) return;  // 取消

    const appendText = extraNote.trim()
      ? `${defaultAppend}\n  备注：${extraNote.trim()}`
      : defaultAppend;

    // 调 Edge Function 同步 Shopify（增强日志，方便排查同步失败原因）
    console.log('%c[Shopify 同步] 开始', 'color:#2563eb;font-weight:bold', {
      poNumber: po.po_number,
      salesOrderId: po.sales_order_id,
      appendText: appendText.slice(0, 200),
    });
    
    try {
      // 查找关联的销售单（在 SHOPIFY._orders 缓存里）
      const so = SHOPIFY._orders ? SHOPIFY._orders.find(o => o.id === po.sales_order_id) : null;
      
      if (!po.sales_order_id) {
        // PO 没关联销售单（自定义 PO）
        console.warn('[Shopify 同步] 跳过：此 PO 无关联销售单（自定义 PO）');
        toast(`ℹ 此 PO 是自定义采购单（无关联销售单），跳过 Shopify 备注同步`, 'warn', 5000);
      } else if (!so) {
        // 销售单不在内存缓存里（可能销售单 tab 没加载过，或销售单已删除）
        console.warn('[Shopify 同步] 跳过：在 SHOPIFY._orders 缓存里找不到 sales_order_id =', po.sales_order_id);
        console.warn('  → 请先切换到「销售单」tab 加载数据，再操作"财务收货"');
        toast(`⚠ 销售单数据未加载，请先打开"销售单" tab 一次，再来收货同步`, 'warn', 6000);
      } else if (!so.shopify_order_id) {
        // 销售单是手动创建的（不来自 Shopify）
        console.warn('[Shopify 同步] 跳过：该销售单是手动创建的，没有 Shopify 订单 ID');
        toast(`ℹ 此销售单是手动创建（非 Shopify 同步），跳过备注同步`, 'warn', 5000);
      } else {
        // 真正执行同步
        console.log('[Shopify 同步] 准备调用 Edge Function update_order_note', {
          order_id: so.shopify_order_id,
          shop: so.shop_domain,
        });
        const result = await SHOPIFY.call('update_order_note', {
          order_id: so.shopify_order_id,
          shop: so.shop_domain,
          append_text: appendText,
        }, so.shop_domain);
        console.log('%c[Shopify 同步] ✓ 成功', 'color:#16a34a;font-weight:bold', result);
        toast(`✓ 已同步到 Shopify 后台备注（订单 ${so.shopify_order_number || so.shopify_order_id}）`, 'ok', 5000);
      }
    } catch (e) {
      // 同步失败但不阻塞推进
      console.error('%c[Shopify 同步] ✗ 失败', 'color:#dc2626;font-weight:bold', e);
      if (!confirm('⚠️ 同步到 Shopify 失败：\n' + (e.message || e) + '\n\n排查清单：\n1. Edge Function 是否已部署最新版？\n   命令：supabase functions deploy shopify-api --project-ref pyfmuknvjqfwcqvbrsvw\n2. shopify_stores 表的 access_token 是否过期？\n3. F12 Console 看详细错误日志\n\n是否继续推进 PO 到"已完成入库"？')) return;
    }
  } else {
    if (!confirm(`确认推进到「${nextLabel}」？`)) return;
  }

  try {
    await sb.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', poId);
    toast(`✓ 已推进到「${nextLabel}」`);
    await renderPo();
  } catch (e) { toast('操作失败：' + (e.message || e), 'err'); }
}

async function poRevert(poId, prevStatus, prevLabel) {
  if (!confirm(`确认退回到「${prevLabel}」？`)) return;
  try {
    await sb.from('orders').update({ status: prevStatus, updated_at: new Date().toISOString() }).eq('id', poId);
    toast(`已退回到「${prevLabel}」`);
    await renderPo();
  } catch (e) { toast('操作失败：' + (e.message || e), 'err'); }
}

// ============================================================
// V4：财务收货模块（独立 tab）
// 显示所有 status='arrived' 的 PO，财务对账后推进到 'received'
// 推进时自动追加备注到 Shopify 订单后台（不覆盖客户原备注）
// ============================================================
async function renderFinance() {
  // V20260527f: 先渲染一次(用已有数据 · 即使空也展示统计 + 空状态)
  // 避免拉数据失败时 tab 完全空白
  try { renderFinanceList(); } catch (_) { /* 容器还没就绪 */ }
  
  // 复用 PO 数据，无需独立 fetch
  try {
    if (!PO_LIST || PO_LIST.length === 0) {
      // 首次进入：拉 PO 数据
      const { data, error } = await sb.from('orders').select('*').not('po_number', 'is', null).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      PO_LIST = data || [];
    }
    // 同步销售单数据（同步 Shopify 备注时要用）
    if (typeof SHOPIFY !== 'undefined' && SHOPIFY.loadOrdersFromDB) {
      await SHOPIFY.loadOrdersFromDB(false).catch(() => {});
    }
    renderFinanceList();
  } catch (e) {
    console.error('renderFinance 出错:', e);
    toast('加载财务数据失败：' + (e.message || e), 'err');
    // V20260527f: 错误兜底 · 在 listBody 显示错误 + 重试按钮(不让 tab 整片空白)
    const body = document.getElementById('financeListBody');
    if (body) {
      body.innerHTML = `
        <div style="padding: 60px 20px; text-align: center; background: rgba(220,38,38,0.04); border: 1px dashed #fca5a5; border-radius: 10px;">
          <div style="font-size: 48px; margin-bottom: 10px;">⚠</div>
          <div style="font-size: 15px; color: #b91c1c; font-weight: 600; margin-bottom: 6px;">加载财务数据失败</div>
          <div style="font-size: 12px; color: var(--text-tertiary); margin-bottom: 14px; font-family: var(--font-mono);">${escapeHtml(String(e.message || e)).slice(0, 200)}</div>
          <button class="btn primary sm" onclick="renderFinance()">🔄 重试</button>
        </div>`;
    }
  }
}

// V20260526e: 财务日期筛选
let _financeDatePreset = 'all';
function financeOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        _financeDatePreset = customPreset;
        const el = document.getElementById('financeDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        renderFinanceList();
      });
    }
    return;
  }
  _financeDatePreset = preset || 'all';
  renderFinanceList();
}

// V20260527h: 财务收货 sub-tab(待对账 / 本月已入库 / 历史已入库)
let _financeSubTab = 'waiting';
function financeSwitchSubTab(t) {
  if (!['waiting', 'done_month', 'done_all'].includes(t)) return;
  _financeSubTab = t;
  renderFinanceList();
}
window.financeSwitchSubTab = financeSwitchSubTab;

function renderFinanceList() {
  // V20260526o: 关键修复 · 先填充日期 select(不管有没有待对账 PO)
  // 否则 waiting.length === 0 时早 return,select 永远是空的黑色框
  if (typeof populateDateFilterSelect === 'function') {
    const dateEl = document.getElementById('financeDateFilter');
    if (dateEl) populateDateFilterSelect(dateEl, _financeDatePreset || 'all');
  }
  
  // V20260527h: 安全兜底 · PO_LIST 没就绪也不爆错
  const allPo = Array.isArray(PO_LIST) ? PO_LIST : [];
  
  // 待财务收货的 PO (status = 'arrived')
  let waiting = allPo.filter(p => p.status === 'arrived');
  // V20260526e: 日期筛选(基于 PO 创建日期)
  if (_financeDatePreset && _financeDatePreset !== 'all' && typeof isDateInRange === 'function') {
    waiting = waiting.filter(p => isDateInRange(p.created_at, _financeDatePreset));
  }
  // 本月已收货 (status = 'received')
  const today = new Date();
  const thisMonth = today.toISOString().slice(0, 7);  // YYYY-MM
  const doneThisMonth = allPo.filter(p => p.status === 'received' && (p.updated_at || p.created_at || '').startsWith(thisMonth))
    .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
  // 全部已收货(按最近更新降序)
  const allDone = allPo.filter(p => p.status === 'received')
    .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
  // 本月总金额
  const monthAmount = doneThisMonth.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const totalAmount = allDone.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  
  // V20260527h: 统计卡片改成可点击切换 sub-tab
  const cardBase = 'cursor:pointer; transition:transform 0.1s, box-shadow 0.15s;';
  const cardActive = 'box-shadow: 0 0 0 2px var(--accent), 0 4px 12px rgba(37,99,235,0.15); transform: translateY(-1px);';
  const statsHtml = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 8px;">
      <div class="sales-stat-card" style="border-left: 4px solid var(--warning); ${cardBase} ${_financeSubTab === 'waiting' ? cardActive : ''}"
           onclick="financeSwitchSubTab('waiting')" title="点击查看待对账 PO">
        <div class="sales-stat-label">⏳ 待财务对账</div>
        <div class="sales-stat-num">${waiting.length}</div>
        <div class="sales-stat-sub">单 · 跟单已确认到货</div>
      </div>
      <div class="sales-stat-card" style="border-left: 4px solid var(--success); ${cardBase} ${_financeSubTab === 'done_month' ? cardActive : ''}"
           onclick="financeSwitchSubTab('done_month')" title="点击查看本月已入库列表">
        <div class="sales-stat-label">✓ 本月已入库</div>
        <div class="sales-stat-num">${doneThisMonth.length}</div>
        <div class="sales-stat-sub">单 · ¥${monthAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="sales-stat-card" style="${cardBase} ${_financeSubTab === 'done_all' ? cardActive : ''}"
           onclick="financeSwitchSubTab('done_all')" title="点击查看历史已入库列表">
        <div class="sales-stat-label">📊 累计已入库</div>
        <div class="sales-stat-num">${allDone.length}</div>
        <div class="sales-stat-sub">单 · ¥${totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</div>
      </div>
    </div>
  `;
  const statsEl = document.getElementById('financeStatsContainer');
  if (statsEl) statsEl.innerHTML = statsHtml;
  
  const body = document.getElementById('financeListBody');
  if (!body) return;
  
  // V20260527h: sub-tab 切换条
  const subTabHtml = `
    <div style="display:flex; gap:6px; margin-bottom:14px; padding:5px; background:var(--bg-elevated); border-radius:8px; width:fit-content;">
      ${[
        { k: 'waiting', label: `🎯 待对账`, cnt: waiting.length, color: '#ea580c' },
        { k: 'done_month', label: `✓ 本月已入库`, cnt: doneThisMonth.length, color: '#16a34a' },
        { k: 'done_all', label: `📊 历史已入库`, cnt: allDone.length, color: '#6b7280' },
      ].map(t => {
        const active = _financeSubTab === t.k;
        return `<button onclick="financeSwitchSubTab('${t.k}')" 
                style="padding:6px 14px; font-size:12.5px; border:none; cursor:pointer; border-radius:6px; font-weight:${active ? 600 : 500};
                       background:${active ? 'var(--bg-card)' : 'transparent'};
                       color:${active ? t.color : 'var(--text-secondary)'};
                       box-shadow:${active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'};
                       transition:all 0.15s;">
          ${t.label} <span style="opacity:0.7; margin-left:2px;">${t.cnt}</span>
        </button>`;
      }).join('')}
    </div>
  `;
  
  // V20260527h: 按 sub-tab 渲染对应列表
  if (_financeSubTab === 'waiting') {
    if (waiting.length === 0) {
      // 空状态 — 仍然显示 sub-tab 头,顺带预览"本月已入库"前 5 条
      const previewDone = doneThisMonth.slice(0, 5);
      body.innerHTML = subTabHtml + `
        <div style="padding: 40px 20px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border); border-radius: 10px; margin-bottom: 14px;">
          <div style="font-size: 42px; margin-bottom: 8px;">🎉</div>
          <div style="font-size: 15px; color: var(--text-primary); font-weight: 600; margin-bottom: 6px;">没有待财务收货的 PO</div>
          <div style="font-size: 12px; color: var(--text-tertiary);">所有"已到货"的采购单都已完成对账入库</div>
          <div style="margin-top:14px; font-size:11px; color:var(--text-tertiary);">
            ℹ 跟单确认 PO 到货后 → 状态变 <code style="background:rgba(234,88,12,0.12); padding:1px 5px; border-radius:3px; color:#ea580c;">已到货</code> → 自动出现在这里等财务对账
          </div>
        </div>
        ${previewDone.length > 0 ? `
          <div style="display:flex; align-items:center; justify-content:space-between; margin: 18px 0 10px;">
            <div style="font-size:13px; color:var(--text-secondary); font-weight:600;">📅 本月最近入库</div>
            <button class="btn small" onclick="financeSwitchSubTab('done_month')" style="padding:4px 10px; font-size:11px;">查看全部 ${doneThisMonth.length} 单 →</button>
          </div>
          ${previewDone.map(p => _renderFinanceDoneItem(p)).join('')}
        ` : `
          <div style="padding:20px; text-align:center; font-size:12px; color:var(--text-tertiary);">本月还没有入库记录</div>
        `}
      `;
    } else {
      body.innerHTML = subTabHtml + `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px;">
          共 <b style="color: var(--accent);">${waiting.length}</b> 张 PO 等待财务对账确认入库:
        </div>
        ${waiting.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
          .map(p => _renderFinanceWaitingItem(p)).join('')}
      `;
    }
  } else if (_financeSubTab === 'done_month') {
    if (doneThisMonth.length === 0) {
      body.innerHTML = subTabHtml + `
        <div style="padding: 50px 20px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border); border-radius: 10px;">
          <div style="font-size: 40px; margin-bottom: 8px;">📭</div>
          <div style="font-size: 14px; color: var(--text-secondary);">本月还没有入库记录</div>
          <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 6px;">财务点了「✓ 完成入库」后,会出现在这里</div>
        </div>`;
    } else {
      body.innerHTML = subTabHtml + `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px;">
          本月共 <b style="color: var(--success);">${doneThisMonth.length}</b> 单已入库 · 合计 <b style="color: var(--accent);">¥${monthAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</b>
        </div>
        ${doneThisMonth.map(p => _renderFinanceDoneItem(p)).join('')}
      `;
    }
  } else if (_financeSubTab === 'done_all') {
    if (allDone.length === 0) {
      body.innerHTML = subTabHtml + `
        <div style="padding: 50px 20px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border); border-radius: 10px;">
          <div style="font-size: 40px; margin-bottom: 8px;">📦</div>
          <div style="font-size: 14px; color: var(--text-secondary);">还没有任何入库记录</div>
        </div>`;
    } else {
      const showLimit = 50;
      const showItems = allDone.slice(0, showLimit);
      body.innerHTML = subTabHtml + `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px;">
          累计 <b style="color: var(--accent);">${allDone.length}</b> 单已入库 · 合计 <b style="color: var(--accent);">¥${totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</b>
          ${allDone.length > showLimit ? `<span style="color:var(--text-tertiary); margin-left:8px;">· 显示最近 ${showLimit} 单</span>` : ''}
        </div>
        ${showItems.map(p => _renderFinanceDoneItem(p)).join('')}
      `;
    }
  }
}

// V20260527h: 渲染"待对账"条目卡片(含完成入库按钮)
function _renderFinanceWaitingItem(p) {
  const items = p.line_items || [];
  const totalQty = items.reduce((s, x) => s + (x.qty || 0), 0);
  const arrived = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—';
  const so = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) 
    ? SHOPIFY._orders.find(o => o.id === p.sales_order_id) 
    : null;
  const shopifyHint = p.sales_order_id 
    ? (so?.shopify_order_id 
        ? `<span style="color:var(--success); font-size:11px;">✓ 收货后同步 Shopify ${so.shopify_order_number || ''}</span>`
        : `<span style="color:var(--text-tertiary); font-size:11px;">⚠ 销售单未加载,请先打开销售单 tab</span>`)
    : `<span style="color:var(--text-tertiary); font-size:11px;">ℹ 自定义 PO(无 Shopify 同步)</span>`;
  
  return `
    <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-bottom: 10px; transition: box-shadow 0.15s;" 
         onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'" 
         onmouseout="this.style.boxShadow='none'">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 14px;">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <span style="font-family: monospace; font-weight: 700; color: var(--accent); font-size: 14px;">${escapeHtml(p.po_number)}</span>
            <span style="padding: 2px 8px; background: rgba(234,88,12,0.1); color: #ea580c; font-size: 11px; border-radius: 4px; font-weight: 600;">📦 已到货</span>
            ${p.order_no ? `<span style="font-size: 11px; color: var(--text-tertiary);">→ 销售单 <a href="#" onclick="event.preventDefault();poJumpToSalesOrder('${p.sales_order_id}');return false;" style="color: var(--accent); text-decoration: none;">${escapeHtml(p.order_no)}</a></span>` : ''}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
            <span><b>供应商:</b>${escapeHtml(p.supplier || '—')}</span>
            <span><b>数量:</b>${totalQty} 件 / ${items.length} 行</span>
            <span><b>金额:</b><b style="color: var(--accent);">¥ ${Number(p.total_amount || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b></span>
            <span><b>到货:</b>${arrived}</span>
            <span><b>跟单:</b>${escapeHtml(p.creator_name || '—')}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
            ${items.slice(0, 4).map(li => `
              <span style="background: var(--bg-elevated); padding: 3px 8px; border-radius: 4px; font-size: 11px; color: var(--text-secondary);">
                ${escapeHtml((li.title_cn || li.title_en || li.sku || '').slice(0, 30))} × ${li.qty}
              </span>
            `).join('')}
            ${items.length > 4 ? `<span style="font-size: 11px; color: var(--text-tertiary);">还有 ${items.length - 4} 行...</span>` : ''}
          </div>
          <div style="margin-top: 8px;">${shopifyHint}</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;">
          <button class="btn primary" onclick="poAdvance('${p.id}', 'received', '已完成入库')" 
                  style="background: var(--success); padding: 8px 16px; white-space: nowrap;" 
                  title="财务对账完成 → 推进到已入库 → 自动追加备注到 Shopify">
            ✓ 完成入库
          </button>
          <button class="btn small" onclick="poOpenPrint('${p.id}')" style="padding: 4px 12px; font-size: 11px;">
            👁 查看详情
          </button>
          <button class="btn small" onclick="poRevert('${p.id}', 'confirmed', '供应商已确认')" 
                  style="padding: 4px 12px; font-size: 11px; color: var(--text-tertiary);" 
                  title="退回到上一步(万一是误推进)">
            ↺ 退回
          </button>
        </div>
      </div>
    </div>`;
}

// V20260527h: 渲染"已入库"条目卡片(更紧凑 · 显示入库日期 · 无完成按钮)
function _renderFinanceDoneItem(p) {
  const items = p.line_items || [];
  const totalQty = items.reduce((s, x) => s + (x.qty || 0), 0);
  const receivedDate = p.updated_at 
    ? new Date(p.updated_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) 
    : '—';
  const so = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders) 
    ? SHOPIFY._orders.find(o => o.id === p.sales_order_id) 
    : null;
  
  return `
    <div style="background: var(--bg-card); border: 1px solid var(--border); border-left: 3px solid var(--success); border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap;">
            <span style="font-family: monospace; font-weight: 700; color: var(--accent); font-size: 13.5px;">${escapeHtml(p.po_number)}</span>
            <span style="padding: 2px 7px; background: rgba(22,163,74,0.1); color: var(--success); font-size: 10.5px; border-radius: 4px; font-weight: 600;">✓ 已入库</span>
            <span style="font-size: 11px; color: var(--text-tertiary);">📅 ${receivedDate}</span>
            ${p.order_no ? `<span style="font-size: 11px; color: var(--text-tertiary);">→ <a href="#" onclick="event.preventDefault();poJumpToSalesOrder('${p.sales_order_id}');return false;" style="color: var(--accent); text-decoration: none;">${escapeHtml(p.order_no)}</a></span>` : ''}
            ${so?.shopify_order_number ? `<span style="font-size: 10.5px; color: var(--success);" title="已同步 Shopify">✓ Shopify ${escapeHtml(so.shopify_order_number)}</span>` : ''}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: var(--text-secondary);">
            <span><b>供应商:</b>${escapeHtml(p.supplier || '—')}</span>
            <span><b>数量:</b>${totalQty} 件 / ${items.length} 行</span>
            <span><b>金额:</b><b style="color: var(--accent);">¥ ${Number(p.total_amount || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b></span>
            <span><b>跟单:</b>${escapeHtml(p.creator_name || '—')}</span>
          </div>
        </div>
        <div style="display: flex; gap: 6px; flex-shrink: 0;">
          <button class="btn small" onclick="poOpenPrint('${p.id}')" style="padding: 4px 11px; font-size: 11px;">👁 详情</button>
          <button class="btn small" onclick="poRevert('${p.id}', 'arrived', '退回到待对账')" 
                  style="padding: 4px 11px; font-size: 11px; color: var(--text-tertiary);" 
                  title="退回到待对账状态(误入库时使用)">
            ↺ 退回
          </button>
        </div>
      </div>
    </div>`;
}

// 点采购单里的销售单号跳转到销售单 tab
function poJumpToSalesOrder(salesOrderId) {
  if (!salesOrderId) { toast('该采购单没关联销售单', 'warn'); return; }
  // 切到销售单 tab
  switchTab('sales');
  setTimeout(() => {
    // 滚动到对应订单卡片
    const card = document.querySelector(`.so-card[data-id="${salesOrderId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '2px solid var(--accent)';
      card.style.outlineOffset = '2px';
      setTimeout(() => { card.style.outline = ''; card.style.outlineOffset = ''; }, 2500);
    } else {
      toast('订单卡片不在当前 sub-tab，请切换 sub-tab', 'info');
    }
  }, 400);
}

async function poCancel(poId) {
  if (!confirm('确认取消此采购单？\n该 line items 会释放，可重新开新的采购单。')) return;
  try {
    const po = PO_LIST.find(x => x.id === poId);
    if (!po) return;
    await sb.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', poId);
    // 释放 sales_order line_items 中对应的 po_assignments
    if (po.sales_order_id) {
      const { data: so } = await sb.from('shopify_orders').select('line_items, local_status').eq('id', po.sales_order_id).single();
      if (so) {
        const updatedItems = (so.line_items || []).map(li => ({
          ...li,
          po_assignments: (li.po_assignments || []).filter(a => a.po_id !== poId),
        }));
        // 重新检测：现在是否还全部分配？如果不是 → 把销售单从 done 拉回 processing
        const stillFullyAssigned = updatedItems.every(li => {
          const totalAssigned = (li.po_assignments || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
          return totalAssigned >= (Number(li.quantity) || 0);
        });
        const updateData = { line_items: updatedItems, updated_at: new Date().toISOString() };
        // 之前是 done 且现在不满足 → 拉回 processing 让跟单继续处理
        if (so.local_status === 'done' && !stillFullyAssigned) {
          updateData.local_status = 'processing';
        }
        await sb.from('shopify_orders').update(updateData).eq('id', po.sales_order_id);
        if (so.local_status === 'done' && !stillFullyAssigned) {
          toast('已取消，对应销售单从「已完成」拉回「待处理」');
        } else {
          toast('已取消');
        }
      } else {
        toast('已取消');
      }
    } else {
      toast('已取消');
    }
    SHOPIFY.invalidateOrders();
    await renderPo();
  } catch (e) { toast('取消失败：' + (e.message || e), 'err'); }
}

// ============ 打印预览 ============
// 编辑现有 PO 的价格/数量（方便：发现下错单时，无需取消重开）
async function poEditPrices(poId) {
  const po = PO_LIST.find(x => x.id === poId);
  if (!po) return;
  const items = po.line_items || [];
  if (items.length === 0) { toast('该 PO 无产品行', 'warn'); return; }

  // 构建 fields 数组：每个产品 2 个字段（数量 + 单价）
  const fields = [];
  items.forEach((li, idx) => {
    fields.push({
      key: `qty_${idx}`,
      label: `${idx + 1}. ${li.title_cn || li.title_en || li.sku} 数量`,
      value: li.qty,
      type: 'number',
      min: 1,
      required: true,
    });
    fields.push({
      key: `price_${idx}`,
      label: `${idx + 1}. ${li.title_cn || li.title_en || li.sku} 单价 ¥`,
      value: li.price,
      type: 'number',
      min: 0,
      required: true,
    });
  });

  const result = await showPrompt({
    title: `✏️ 修改 ${po.po_number} 价格/数量`,
    message: `供应商：${po.supplier || ''} · 当前状态：${poStatusInfo(po.status).label}\n注意：修改后会重新计算 PO 总金额。如金额超过 ¥5000 或某产品数量超 20，会进入待审批。`,
    fields,
  });
  if (!result) return;

  // 重组 line_items
  const newLineItems = items.map((li, idx) => {
    const qty = Number(result[`qty_${idx}`]) || li.qty;
    const price = Number(result[`price_${idx}`]) || li.price;
    return { ...li, qty, price, subtotal: qty * price };
  });
  const newTotal = newLineItems.reduce((s, x) => s + x.subtotal, 0);

  // 判断是否需要重新审批（数量过大或金额过大）
  const needsApproval = newLineItems.some(li => li.qty > 20) || newTotal > 5000;
  const wasApproval = po.status === 'pending_approval';
  let newStatus = po.status;
  let approvalNote = po.approval_note;
  let approvedBy = po.approved_by;
  // 如果当前是 producing/sent 等批准后状态，但改后超阈值 → 回退到 pending_approval
  if (needsApproval && !wasApproval && po.status !== 'received' && po.status !== 'cancelled' && po.status !== 'rejected') {
    if (confirm(`修改后 PO 触发审批阈值（数量>20 或总金额>¥5000），需重新审批。\n是否继续修改？\n\n点确定 → PO 状态回到「待审批」`)) {
      newStatus = 'pending_approval';
      approvalNote = null;
      approvedBy = null;
    } else {
      return;
    }
  }

  try {
    await sb.from('orders').update({
      line_items: newLineItems,
      total_amount: newTotal,
      status: newStatus,
      approval_note: approvalNote,
      approved_by: approvedBy,
      updated_at: new Date().toISOString(),
    }).eq('id', poId);

    // 🔑 关键：同步更新销售单的 po_assignments.qty（按 SKU 匹配）
    if (po.sales_order_id) {
      try {
        const { data: so } = await sb.from('shopify_orders').select('line_items, local_status').eq('id', po.sales_order_id).single();
        if (so) {
          const updatedItems = (so.line_items || []).map(li => {
            const newAssignments = (li.po_assignments || []).map(a => {
              if (a.po_id !== poId) return a;  // 不是这个 PO 的不动
              // 在 newLineItems 里找对应 SKU 的行（或 shopify_line_item_id 关联）
              const matched = newLineItems.find(nl =>
                (nl.shopify_line_item_id && li.shopify_line_item_id && nl.shopify_line_item_id === li.shopify_line_item_id) ||
                ((nl.sku || '') === (li.sku || ''))
              );
              if (matched) return { ...a, qty: Number(matched.qty) || a.qty };
              return a;
            });
            return { ...li, po_assignments: newAssignments };
          });

          // 检测 done 状态切换
          const stillFully = updatedItems.every(li => {
            const tot = (li.po_assignments || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
            return tot >= (Number(li.quantity) || 0);
          });
          const updateData = { line_items: updatedItems, updated_at: new Date().toISOString() };
          if (so.local_status === 'done' && !stillFully) {
            updateData.local_status = 'processing';  // 改后不够了 → 拉回待处理
          } else if (so.local_status !== 'done' && so.local_status !== 'cancelled' && stillFully) {
            updateData.local_status = 'done';  // 改后刚好满了 → 自动归档
          }
          await sb.from('shopify_orders').update(updateData).eq('id', po.sales_order_id);
        }
      } catch (sErr) {
        console.warn('同步销售单 po_assignments 失败：', sErr);
      }
    }

    toast(`✓ 已更新 ${po.po_number}`);
    SHOPIFY.invalidateOrders();  // 销售单 line_items 变了，强刷
    await renderPo();
  } catch (e) { toast('更新失败：' + (e.message || e), 'err'); }
}

function poOpenPrint(poId) {
  const po = PO_LIST.find(x => x.id === poId);
  if (!po) return;
  const items = po.line_items || [];
  const totalQty = items.reduce((s,x) => s + (x.qty||0), 0);
  const totalAmount = items.reduce((s,x) => s + (x.subtotal||0), 0);

  // V5-W3-2026-05-26: 老 PO 没有 line.electrical_standard 字段,从关联销售单兜底计算一个 PO-level standard
  // (新 PO 每行都已经存了 electrical_standard,优先用 line item 自己的)
  let _lookupStd = '';
  try {
    const soInfo = (typeof PO_SALES_ORDERS_MAP !== 'undefined') ? (PO_SALES_ORDERS_MAP[po.sales_order_id] || {}) : {};
    const shipping = soInfo.shipping_address || {};
    const co = shipping.country_code || shipping.country || '';
    if (co && typeof getElectricalStandard === 'function') {
      _lookupStd = getElectricalStandard(co, shipping.country || '') || '';
    }
  } catch (e) { console.warn('[poOpenPrint] 电气标准兜底查询失败:', e); }
  
  // V4-2026-05-24: 打印版同样过滤 SKU(防发给供应商泄露)
  function _stripSkus(text) {
    if (!text) return text;
    return String(text)
      .replace(/\b[A-Z]{2,}\d+(?:[-_][A-Z0-9]+)*\b/g, (m) => m.length >= 6 ? '' : m)
      .replace(/\b[A-Z0-9]+(?:[-_][A-Z0-9]+){2,}\b/g, (m) => {
        const l = (m.match(/[A-Z]/g) || []).length, d = (m.match(/\d/g) || []).length;
        return (l >= 2 && d >= 4) ? '' : m;
      })
      .replace(/\b(SKU|Code|Item|商品编码|货号|编号)\s*[:：]\s*\S+/gi, '')
      .replace(/\s{2,}/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  }

  document.getElementById('poPrintBody').innerHTML = `
    <div class="po-print" id="poPrintContent">
      <!-- 紧凑顶栏：左标题号 右日期/跟单 -->
      <div class="po-header">
        <div class="po-title">
          📋 采购单 <span class="po-no">${escapeHtml(po.po_number)}</span>
        </div>
        <div class="po-meta-right">
          开单 ${new Date(po.created_at).toLocaleDateString()} · 跟单 ${escapeHtml(po.creator_name || '')}
        </div>
      </div>
      <!-- 关键信息一行展示 -->
      <div class="meta-bar">
        <span><b>供应商：</b>${escapeHtml(po.supplier)}</span>
        <span><b>关联销售：</b>${escapeHtml(po.order_no || '—')}</span>
        
        <span><b>合计：</b><span style="color:#dc2626; font-weight:700;">${totalQty} 件 / ¥ ${totalAmount.toFixed(2)}</span></span>
      </div>
      <!-- 产品表格 -->
      <table>
        <thead><tr>
          <th width="28" style="text-align:center;">#</th>
          <th width="60">图片</th>
          <th>产品规格</th>
          <th width="70" style="text-align:center; background:#fef9f3;">下单标准</th>
          <th width="44" style="text-align:center;">数量</th>
          <th width="68" style="text-align:right;">单价</th>
          <th width="76" style="text-align:right;">小计</th>
          <th width="180" style="background:#fffdf7;">备注</th>
        </tr></thead>
        <tbody>
          ${items.map((li, i) => {
            const cleanTitle = _stripSkus(li.title_cn || '');
            const eff = (typeof PRODUCTS_CACHE !== 'undefined' && li.sku) ? (PRODUCTS_CACHE.effectiveBySku(li.sku) || {}) : {};
            const skuNotes = (eff.notes || '').trim();
            const rawSpecs = skuNotes || extractVariantInfo(li.variant || '');
            const cleanSpecs = _stripSkus(rawSpecs);
            // V5-W3-2026-05-26: per-line 电气标准 + 备注(优先用 line_item 自己的字段,fallback 到 PO-level)
            const lineStd = li.electrical_standard || _lookupStd || '';
            const lineNote = li.line_note || '';
            return `
            <tr>
              <td style="text-align:center;">${i+1}</td>
              <td>${li.image_url ? `<img src="${escapeHtml(li.image_url)}">` : '<span style="color:#aaa;">—</span>'}</td>
              <td class="spec-cell">${cleanTitle ? `<div style="font-weight:600; font-size:12px;">${escapeHtml(cleanTitle)}</div>` : ''}${cleanSpecs ? `<div style="color:#555; font-size:11px; line-height:1.5; white-space:pre-line; margin-top:1px;">${escapeHtml(cleanSpecs)}</div>` : (cleanTitle ? '' : '<span style="color:#888;">—</span>')}</td>
              <td style="text-align:center; background:#fef9f3; padding:4px 3px; vertical-align:middle; word-break:keep-all;">${lineStd ? `<b style="color:#c2410c; font-family:monospace; font-size:11px; font-weight:600; line-height:1.3; display:inline-block;">${escapeHtml(lineStd)}</b>` : '<span style="color:#aaa;">—</span>'}</td>
              <td style="text-align:center;">${li.qty >= 2 ? `<span style="background:#dc2626; color:white; padding:2px 8px; border-radius:4px; font-weight:700; font-size:13px; display:inline-block;">${li.qty}</span>` : li.qty}</td>
              <td style="text-align:right; font-family:monospace;">¥ ${Number(li.price).toFixed(2)}</td>
              <td style="text-align:right; font-family:monospace; font-weight:600;">¥ ${Number(li.subtotal).toFixed(2)}</td>
              <td style="background:#fffdf7; font-size:10.5px; color:#444; vertical-align:top; padding:5px 7px; white-space:pre-wrap; line-height:1.4;">${lineNote ? escapeHtml(lineNote) : '<span style="color:#bbb; font-style:italic;">(无)</span>'}</td>
            </tr>`;
          }).join('')}
          <tr class="total-row">
            <td colspan="3" style="text-align:right;">合 计</td>
            <td style="background:#fef9f3;"></td>
            <td style="text-align:center;">${totalQty}</td>
            <td></td>
            <td style="text-align:right; font-family:monospace; color:#dc2626;">¥ ${totalAmount.toFixed(2)}</td>
            <td style="background:#fffdf7;"></td>
          </tr>
        </tbody>
      </table>
      <!-- V5-W3-2026-05-26: 移除黄色"其他备注"框(内容已并入备注列 per-line)
           只保留红框 订单备注(纸箱用),并简化为只显示销售单号 -->
      <!-- 订单备注：紧贴合计行下方，独占整行 -->
      <div style="background:#fff5f5; border:1px solid #fecaca; padding:12px 14px; margin-top:8px; border-radius:6px;">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <span style="font-weight:700; color:#dc2626; font-size:13px; white-space:nowrap; flex-shrink:0;">⚠ 订单备注（请写在纸箱上）：</span>
          <div style="flex:1; color:#7f1d1d; font-weight:600; white-space:pre-wrap; word-break:break-all; font-family:monospace; font-size:14px;">${escapeHtml(po.box_note || '—')}</div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('poPrintModal').style.display = 'flex';
  // V28z:扫描产品规格残留英文 · 提示拼写问题 + 一键 AI 翻译
  setTimeout(() => _scanPoPrintEnglishResidue(po), 150);
}

// V28z:扫描 PO 打印里的英文残留(可能是拼写错误或词典缺失)
function _scanPoPrintEnglishResidue(po) {
  const wrap = document.getElementById('poPrintBody');
  if (!wrap) return;
  // 找所有产品规格 cell · class 加在那个 td 上
  const cells = wrap.querySelectorAll('.spec-cell');
  const issues = [];   // [{liid, sku, originalSpec, englishWords}]
  cells.forEach((cell, idx) => {
    const txt = cell.innerText || '';
    // 提取**连续英文单词**(2 字母以上 · 排除尺寸单位/电压等数字旁缩写)
    // 排除常见正确缩写:cm, mm, kg, W, V, K, LED, USD, EUR, IP, AC, DC, US, EU, UK, AU
    const SAFE = /^(cm|mm|kg|g|w|v|k|led|usd|eur|ip|ac|dc|us|eu|uk|au|jp|kr|cn|ce|ul|hz|lm|cri|ra|set|pcs?|pack|kit|fcc|rohs|etl|sku|d|h|x|to|in|of|or|and|by|for)$/i;
    const englishWords = [...txt.matchAll(/\b[a-zA-Z]{2,}\b/g)]
      .map(m => m[0])
      .filter(w => !SAFE.test(w))
      .filter((w, i, a) => a.indexOf(w) === i);  // 去重
    if (englishWords.length > 0) {
      issues.push({ idx, sku: po.line_items?.[idx]?.sku || '', text: txt, words: englishWords });
    }
  });

  if (issues.length === 0) return;  // 完全无英文残留 · 不打扰

  // 显眼警告条 · 插在打印内容上方
  const printContent = document.getElementById('poPrintContent');
  if (!printContent) return;
  const allWords = [...new Set(issues.flatMap(i => i.words))];
  const warnId = '__poEnglishWarn__';
  document.getElementById(warnId)?.remove();
  const warn = document.createElement('div');
  warn.id = warnId;
  warn.className = 'no-print';   // 打印时不显示这个警告条
  warn.style.cssText = 'background:#fffbeb; border:1.5px solid #f59e0b; border-radius:8px; padding:12px 14px; margin-bottom:10px; font-size:13px;';
  warn.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
      <div style="font-weight:600; color:#92400e;">
        ⚠️ 检测到 ${issues.length} 行产品规格有未翻译的英文(共 ${allWords.length} 个词)· 可能是美工 SKU 拼写错或词典缺词
      </div>
      <button onclick="_dismissPoEngWarn()" style="background:transparent; border:0; color:#92400e; cursor:pointer; font-size:18px; line-height:1;">✕</button>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
      ${allWords.map(w => {
        const suggestion = _suggestSpelling(w);
        return `<span title="${suggestion ? '可能是:' + suggestion : '词典未收录'}"
          style="padding:3px 8px; background:#fef3c7; border:1px solid #fbbf24; border-radius:4px; font-family:monospace; font-size:12px;">
          <b>${escapeHtml(w)}</b>${suggestion ? ' → <span style="color:#15803d;">' + suggestion + '</span>' : ''}
        </span>`;
      }).join('')}
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button onclick="_autoTranslatePoEng('${po.id}')" 
        style="padding:6px 14px; background:#7c3aed; color:#fff; border:0; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
        🌐 AI 一键翻译所有英文
      </button>
      <button onclick="_copyEngWordsForArtist(${JSON.stringify(allWords).replace(/"/g, '&quot;')})"
        style="padding:6px 14px; background:#fff; color:#7c3aed; border:1.5px solid #7c3aed; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
        📋 复制给美工(让他改 SKU)
      </button>
      <span style="font-size:11px; color:#78716c; align-self:center;">建议:把残留的英文翻好 · 或让美工把 SKU 的英文规格写完整</span>
    </div>
  `;
  printContent.parentNode.insertBefore(warn, printContent);
}

function _dismissPoEngWarn() { document.getElementById('__poEnglishWarn__')?.remove(); }
window._dismissPoEngWarn = _dismissPoEngWarn;

// 简易拼写建议(基于词典里的已知词 · Levenshtein 距离)
function _suggestSpelling(word) {
  const KNOWN = ['Smoky', 'Smokey', 'Smoke', 'Smoked', 'Black', 'White', 'Gray', 'Grey', 'Brown', 'Walnut', 'Brass', 'Gold',
    'Silver', 'Bronze', 'Chrome', 'Nickel', 'Wood', 'Glass', 'Marble', 'Crystal', 'Matte', 'Polished', 'Brushed',
    'Antique', 'Satin', 'Champagne', 'Charcoal', 'Beige', 'Ivory', 'Navy', 'Coral', 'Mint', 'Sage', 'Olive',
    'Burgundy', 'Lavender', 'Hydrographics', 'Stainless', 'Steel', 'Frosted', 'Smoked'];
  const lower = word.toLowerCase();
  // 完全相等已经在词典里(理论上不该到这)
  // 找编辑距离 ≤ 2 的最相近词
  let best = null, bestDist = 3;
  for (const k of KNOWN) {
    const d = _levenshtein(lower, k.toLowerCase());
    if (d > 0 && d < bestDist) { best = k; bestDist = d; }
  }
  return best;
}

function _levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

// AI 一键翻译 PO 打印里所有残留英文
async function _autoTranslatePoEng(poId) {
  const cells = document.querySelectorAll('#poPrintBody .spec-cell');
  if (!cells.length) return;
  toast('AI 正在翻译…', 'info', 2000);
  for (const cell of cells) {
    const txt = cell.innerText || '';
    if (!/[a-zA-Z]{3,}/.test(txt)) continue;
    try {
      const translated = await _aiTranslateSpec(txt);
      if (translated && translated.trim()) {
        // 不破坏 HTML 结构 · 直接换文字
        cell.innerHTML = escapeHtml(translated).replace(/\n/g, '<br>');
      }
    } catch (e) { console.warn('翻译失败:', e); }
  }
  _dismissPoEngWarn();
  toast('✓ AI 翻译完成 · 可截图发工厂', 'success', 2500);
}
window._autoTranslatePoEng = _autoTranslatePoEng;

// 复制给美工的提示(他要去改 SKU)
async function _copyEngWordsForArtist(words) {
  const lines = words.map(w => {
    const sug = _suggestSpelling(w);
    return `${w}${sug ? ' (可能想写:' + sug + ')' : ''}`;
  });
  const text = `美工你好,下面这些英文在跟单系统翻译失败,可能是 SKU 规格里拼写有问题,麻烦核对下并修正:\n\n${lines.join('\n')}\n\n如果是新词,我们这边会加进词典 · 谢谢!`;
  try {
    await navigator.clipboard.writeText(text);
    toast('✓ 已复制 · 粘贴发给美工', 'success', 2000);
  } catch (e) {
    // 降级:文本框选中
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('✓ 已复制', 'success', 2000);
  }
}
window._copyEngWordsForArtist = _copyEngWordsForArtist;

function closePoPrint() { document.getElementById('poPrintModal').style.display = 'none'; }
function poPrintNow() { window.print(); }

// 加载 html2canvas（动态加载、单次）
async function _loadHtml2Canvas() {
  if (typeof window.html2canvas !== 'undefined') return true;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('CDN 加载失败'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('加载超时')), 12000);
  });
  return true;
}

// 把 DOM 元素截图 → 复制到剪贴板（剪贴板失败则下载）
async function _captureAndCopy(el, filename) {
  const canvas = await window.html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 3, useCORS: true, logging: false,
  });
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { resolve({ ok: false, err: '生成图片失败' }); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        resolve({ ok: true, mode: 'clipboard' });
      } catch (e) {
        // 降级：下载
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || `图片_${Date.now()}.png`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve({ ok: true, mode: 'download' });
      }
    }, 'image/png');
  });
}

// 🚀 一键复制订单图（PO 卡片上调用）
async function poQuickCopyImage(poId) {
  const po = PO_LIST.find(x => x.id === poId);
  if (!po) { toast('找不到 PO', 'err'); return; }
  toast('正在生成订单图…', 'info');

  // 加载 html2canvas
  try {
    await _loadHtml2Canvas();
  } catch (e) {
    toast('截图工具加载失败，请检查网络或用打印按钮', 'err');
    return;
  }

  // 临时创建一个屏幕外的预览容器（不打开 modal）
  const items = po.line_items || [];
  const totalQty = items.reduce((s,x) => s + (x.qty||0), 0);
  const totalAmount = items.reduce((s,x) => s + (x.subtotal||0), 0);

  // V5-W3-2026-05-26: 老 PO 兜底电气标准查询
  let _lookupStd = '';
  try {
    const soInfo = (typeof PO_SALES_ORDERS_MAP !== 'undefined') ? (PO_SALES_ORDERS_MAP[po.sales_order_id] || {}) : {};
    const shipping = soInfo.shipping_address || {};
    const co = shipping.country_code || shipping.country || '';
    if (co && typeof getElectricalStandard === 'function') {
      _lookupStd = getElectricalStandard(co, shipping.country || '') || '';
    }
  } catch (e) {}

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed; left:-99999px; top:0; width:920px; z-index:-1;';
  wrap.innerHTML = `
    <div class="po-print">
      <div class="po-header">
        <div class="po-title">📋 采购单 <span class="po-no">${escapeHtml(po.po_number)}</span></div>
        <div class="po-meta-right">开单 ${new Date(po.created_at).toLocaleDateString()} · 跟单 ${escapeHtml(po.creator_name || '')}</div>
      </div>
      <div class="meta-bar">
        <span><b>供应商：</b>${escapeHtml(po.supplier)}</span>
        <span><b>关联销售：</b>${escapeHtml(po.order_no || '—')}</span>
        
        <span><b>合计：</b><span style="color:#dc2626; font-weight:700;">${totalQty} 件 / ¥ ${totalAmount.toFixed(2)}</span></span>
      </div>
      <table>
        <thead><tr>
          <th width="32" style="text-align:center;">#</th>
          <th width="66">图片</th>
          <th>产品规格</th>
          <th width="70" style="text-align:center; background:#fef9f3;">下单标准</th>
          <th width="44" style="text-align:center;">数量</th>
          <th width="68" style="text-align:right;">单价</th>
          <th width="76" style="text-align:right;">小计</th>
          <th width="180" style="background:#fffdf7;">备注</th>
        </tr></thead>
        <tbody>
          ${items.map((li, i) => {
            const specs = extractVariantInfo(li.variant || '');
            const lineStd = li.electrical_standard || _lookupStd || '';
            const lineNote = li.line_note || '';
            return `
            <tr>
              <td style="text-align:center;">${i+1}</td>
              <td>${li.image_url ? `<img src="${escapeHtml(li.image_url)}" crossorigin="anonymous">` : '<span style="color:#aaa;">—</span>'}</td>
              <td>${li.title_cn ? `<div style="font-weight:600; font-size:12px;">${escapeHtml(li.title_cn)}</div>` : ''}${specs ? `<div style="color:#555; font-size:11px; line-height:1.5; white-space:pre-line; margin-top:1px;">${escapeHtml(specs)}</div>` : ''}</td>
              <td style="text-align:center; background:#fef9f3; padding:4px 3px; vertical-align:middle; word-break:keep-all;">${lineStd ? `<b style="color:#c2410c; font-family:monospace; font-size:11px; font-weight:600; line-height:1.3; display:inline-block;">${escapeHtml(lineStd)}</b>` : '<span style="color:#aaa;">—</span>'}</td>
              <td style="text-align:center;">${li.qty >= 2 ? `<span style="background:#dc2626; color:white; padding:2px 8px; border-radius:4px; font-weight:700; font-size:13px;">${li.qty}</span>` : li.qty}</td>
              <td style="text-align:right; font-family:monospace;">¥ ${Number(li.price).toFixed(2)}</td>
              <td style="text-align:right; font-family:monospace; font-weight:600;">¥ ${Number(li.subtotal).toFixed(2)}</td>
              <td style="background:#fffdf7; font-size:10.5px; color:#444; vertical-align:top; padding:5px 7px; white-space:pre-wrap; line-height:1.4;">${lineNote ? escapeHtml(lineNote) : '<span style="color:#bbb; font-style:italic;">(无)</span>'}</td>
            </tr>`;
          }).join('')}
          <tr class="total-row">
            <td colspan="3" style="text-align:right;">合 计</td>
            <td style="background:#fef9f3;"></td>
            <td style="text-align:center;">${totalQty}</td>
            <td></td>
            <td style="text-align:right; font-family:monospace; color:#dc2626;">¥ ${totalAmount.toFixed(2)}</td>
            <td style="background:#fffdf7;"></td>
          </tr>
        </tbody>
      </table>
      <!-- 订单备注：紧贴合计行下方，独占整行 -->
      <div style="background:#fff5f5; border:1px solid #fecaca; padding:12px 14px; margin-top:8px; border-radius:6px;">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <span style="font-weight:700; color:#dc2626; font-size:13px; white-space:nowrap; flex-shrink:0;">⚠ 订单备注（请写在纸箱上）：</span>
          <div style="flex:1; color:#7f1d1d; font-weight:600; white-space:pre-wrap; word-break:break-all;">${escapeHtml(po.box_note || '—')}</div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  // 等图片加载完成
  const imgs = wrap.querySelectorAll('img');
  await Promise.all([...imgs].map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });
  }));

  try {
    const result = await _captureAndCopy(wrap.querySelector('.po-print'), `采购单_${po.po_number}.png`);
    if (result.ok) {
      if (result.mode === 'clipboard') toast(`✓ ${po.po_number} 已复制图片，去微信群 Ctrl+V 粘贴`);
      else toast(`✓ ${po.po_number} 已下载图片`);
    } else {
      toast('生成失败：' + (result.err || ''), 'err');
    }
  } catch (e) {
    toast('截图失败：' + (e.message || e), 'err');
  } finally {
    document.body.removeChild(wrap);
  }
}

// 截图复制按钮（预览 modal 内）
async function poScreenshot() {
  const el = document.getElementById('poPrintContent');
  if (!el) { toast('找不到预览内容', 'err'); return; }
  toast('正在生成图片…', 'info');
  try { await _loadHtml2Canvas(); } catch (e) { toast('截图工具加载失败', 'err'); return; }
  const result = await _captureAndCopy(el, `采购单_${Date.now()}.png`);
  if (result.ok) {
    if (result.mode === 'clipboard') toast('✓ 图片已复制，可直接粘贴到微信/QQ');
    else toast('✓ 已下载图片');
  } else { toast('生成失败', 'err'); }
}

// ============================================================
// V4：批量导出多 PO 为单个 PDF（每页一个采购单）
// 用户场景：亿源供应商今天有 5 个 PO → 一键打包发给亿源
// ============================================================

async function _loadJsPdf() {
  if (window.jspdf?.jsPDF) return true;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('jsPDF CDN 加载失败'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('jsPDF 加载超时')), 15000);
  });
  return true;
}

// 构建单个 PO 的导出 HTML（屏幕外渲染，html2canvas 截图用）
function _buildSinglePoExportNode(po, includeImages) {
  const items = po.line_items || [];
  const totalQty = items.reduce((s, x) => s + (x.qty || 0), 0);
  const totalAmount = items.reduce((s, x) => s + (x.subtotal || 0), 0);

  // V5-W3-2026-05-26: 老 PO 兜底电气标准查询
  let _lookupStd = '';
  try {
    const soInfo = (typeof PO_SALES_ORDERS_MAP !== 'undefined') ? (PO_SALES_ORDERS_MAP[po.sales_order_id] || {}) : {};
    const shipping = soInfo.shipping_address || {};
    const co = shipping.country_code || shipping.country || '';
    if (co && typeof getElectricalStandard === 'function') {
      _lookupStd = getElectricalStandard(co, shipping.country || '') || '';
    }
  } catch (e) {}
  
  // V4-2026-05-24: SKU 过滤函数 - 防同行通过 SKU 反查我们网站
  function _stripSkus(text) {
    if (!text) return text;
    return String(text)
      .replace(/\b[A-Z]{2,}\d+(?:[-_][A-Z0-9]+)*\b/g, (match) => match.length >= 6 ? '' : match)
      .replace(/\b[A-Z0-9]+(?:[-_][A-Z0-9]+){2,}\b/g, (match) => {
        const letters = (match.match(/[A-Z]/g) || []).length;
        const digits = (match.match(/\d/g) || []).length;
        return (letters >= 2 && digits >= 4) ? '' : match;
      })
      .replace(/\b(SKU|Code|Item|商品编码|货号|编号)\s*[:：]\s*\S+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }
  
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed; left:-99999px; top:0; width:920px; z-index:-1; background:#fff;';
  wrap.innerHTML = `
    <div class="po-print">
      <div class="po-header">
        <div class="po-title">📋 采购单 <span class="po-no">${escapeHtml(po.po_number)}</span></div>
        <div class="po-meta-right">开单 ${new Date(po.created_at).toLocaleDateString()} · 跟单 ${escapeHtml(po.creator_name || '')}</div>
      </div>
      <div class="meta-bar">
        <span><b>供应商：</b>${escapeHtml(po.supplier)}</span>
        <span><b>关联销售：</b>${escapeHtml(po.order_no || '—')}</span>
        
        <span><b>合计：</b><span style="color:#dc2626; font-weight:700;">${totalQty} 件 / ¥ ${totalAmount.toFixed(2)}</span></span>
      </div>
      <table>
        <thead><tr>
          <th width="32" style="text-align:center;">#</th>
          ${includeImages ? '<th width="66">图片</th>' : ''}
          <th>产品规格</th>
          <th width="70" style="text-align:center; background:#fef9f3;">下单标准</th>
          <th width="44" style="text-align:center;">数量</th>
          <th width="68" style="text-align:right;">单价</th>
          <th width="76" style="text-align:right;">小计</th>
          <th width="180" style="background:#fffdf7;">备注</th>
        </tr></thead>
        <tbody>
          ${items.map((li, i) => {
            const cleanTitle = _stripSkus(li.title_cn || '');
            const eff = (typeof PRODUCTS_CACHE !== 'undefined' && li.sku) ? (PRODUCTS_CACHE.effectiveBySku(li.sku) || {}) : {};
            const skuNotes = (eff.notes || '').trim();
            const rawSpecs = skuNotes || extractVariantInfo(li.variant || '');
            const cleanSpecs = _stripSkus(rawSpecs);
            const lineStd = li.electrical_standard || _lookupStd || '';
            const lineNote = li.line_note || '';
            return `
            <tr>
              <td style="text-align:center;">${i+1}</td>
              ${includeImages ? `<td>${li.image_url ? `<img src="${escapeHtml(li.image_url)}" crossorigin="anonymous">` : '<span style="color:#aaa;">—</span>'}</td>` : ''}
              <td class="spec-cell">${cleanTitle ? `<div style="font-weight:600; font-size:12px;">${escapeHtml(cleanTitle)}</div>` : ''}${cleanSpecs ? `<div style="color:#555; font-size:11px; line-height:1.5; white-space:pre-line; margin-top:1px;">${escapeHtml(cleanSpecs)}</div>` : ''}</td>
              <td style="text-align:center; background:#fef9f3; padding:4px 3px; vertical-align:middle; word-break:keep-all;">${lineStd ? `<b style="color:#c2410c; font-family:monospace; font-size:11px; font-weight:600; line-height:1.3; display:inline-block;">${escapeHtml(lineStd)}</b>` : '<span style="color:#aaa;">—</span>'}</td>
              <td style="text-align:center;">${li.qty >= 2 ? `<span style="background:#dc2626; color:white; padding:2px 8px; border-radius:4px; font-weight:700; font-size:13px;">${li.qty}</span>` : li.qty}</td>
              <td style="text-align:right; font-family:monospace;">¥ ${Number(li.price).toFixed(2)}</td>
              <td style="text-align:right; font-family:monospace; font-weight:600;">¥ ${Number(li.subtotal).toFixed(2)}</td>
              <td style="background:#fffdf7; font-size:10.5px; color:#444; vertical-align:top; padding:5px 7px; white-space:pre-wrap; line-height:1.4;">${lineNote ? escapeHtml(lineNote) : '<span style="color:#bbb; font-style:italic;">(无)</span>'}</td>
            </tr>`;
          }).join('')}
          <tr class="total-row">
            <td colspan="${includeImages ? 3 : 2}" style="text-align:right;">合 计</td>
            <td style="background:#fef9f3;"></td>
            <td style="text-align:center;">${totalQty}</td>
            <td></td>
            <td style="text-align:right; font-family:monospace; color:#dc2626;">¥ ${totalAmount.toFixed(2)}</td>
            <td style="background:#fffdf7;"></td>
          </tr>
        </tbody>
      </table>
      <div style="background:#fff5f5; border:1px solid #fecaca; padding:12px 14px; margin-top:8px; border-radius:6px;">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <span style="font-weight:700; color:#dc2626; font-size:13px; white-space:nowrap; flex-shrink:0;">⚠ 订单备注（请写在纸箱上）：</span>
          <div style="flex:1; color:#7f1d1d; font-weight:600; white-space:pre-wrap; word-break:break-all;">${escapeHtml(_stripSkus(po.box_note || '') || '—')}</div>
        </div>
      </div>
    </div>`;
  return wrap;
}

// 弹窗：选格式 + 含图选项
function poBatchExportOpenDialog() {
  if (!PO_SUPPLIER_FILTER) { toast('请先在上方下拉里筛选一个供应商', 'warn'); return; }
  
  let list = PO_LIST.filter(p => (p.supplier || '') === PO_SUPPLIER_FILTER);
  if (PO_FILTER === 'pending') list = list.filter(p => p.status === 'pending_approval');
  else if (PO_FILTER === 'producing') list = list.filter(p => p.status === 'producing');
  else if (PO_FILTER === 'ordered') list = list.filter(p => ['sent', 'confirmed', 'arrived'].includes(p.status));
  else if (PO_FILTER === 'cancelled') list = list.filter(p => p.status === 'cancelled');
  else if (PO_FILTER === 'done') list = list.filter(p => p.status === 'received');
  else list = list.filter(p => p.status !== 'cancelled');
  
  if (list.length === 0) { toast(`供应商「${PO_SUPPLIER_FILTER}」下没有 PO 可导出`, 'warn'); return; }
  
  // 显示对话框
  document.getElementById('batchExportInfo').innerHTML = `
    <b>供应商：</b>${escapeHtml(PO_SUPPLIER_FILTER)} · <b>${list.length} 张 PO</b> 将打包导出
  `;
  document.getElementById('batchExportModal').classList.add('show');
}

function closeBatchExport() {
  document.getElementById('batchExportModal').classList.remove('show');
}

async function poDoBatchExport(format) {
  closeBatchExport();
  const includeImages = document.getElementById('batchExportIncludeImg').checked;
  
  if (!PO_SUPPLIER_FILTER) { toast('请先筛选供应商', 'warn'); return; }
  
  let list = PO_LIST.filter(p => (p.supplier || '') === PO_SUPPLIER_FILTER);
  if (PO_FILTER === 'pending') list = list.filter(p => p.status === 'pending_approval');
  else if (PO_FILTER === 'producing') list = list.filter(p => p.status === 'producing');
  else if (PO_FILTER === 'ordered') list = list.filter(p => ['sent', 'confirmed', 'arrived'].includes(p.status));
  else if (PO_FILTER === 'cancelled') list = list.filter(p => p.status === 'cancelled');
  else if (PO_FILTER === 'done') list = list.filter(p => p.status === 'received');
  else list = list.filter(p => p.status !== 'cancelled');
  
  if (list.length === 0) { toast('无 PO 可导出', 'warn'); return; }
  
  if (format === 'pdf') {
    await _poBatchExportPDF(list, includeImages);
  } else if (format === 'docx') {
    _poBatchExportDocx(list, includeImages);
  }
}

async function _poBatchExportPDF(list, includeImages) {
  toast(`正在生成 ${list.length} 张 PO 的 PDF...（请稍候）`, 'info', 8000);
  
  try {
    await Promise.all([_loadHtml2Canvas(), _loadJsPdf()]);
  } catch (e) {
    toast('PDF 工具加载失败：' + e.message + '\n请检查网络连接', 'err', 6000);
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const A4_WIDTH_MM = 210;
  const MARGIN = 8;
  const USABLE_WIDTH = A4_WIDTH_MM - MARGIN * 2;
  
  for (let i = 0; i < list.length; i++) {
    const po = list[i];
    const wrap = _buildSinglePoExportNode(po, includeImages);
    document.body.appendChild(wrap);
    
    try {
      // 等图片加载
      if (includeImages) {
        const imgs = wrap.querySelectorAll('img');
        await Promise.all([...imgs].map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });
        }));
      }
      
      const canvas = await window.html2canvas(wrap.querySelector('.po-print'), {
        backgroundColor: '#ffffff',
        scale: 1.6, useCORS: true, logging: false,
      });
      
      const imgHeight = canvas.height * USABLE_WIDTH / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', MARGIN, MARGIN, USABLE_WIDTH, imgHeight);
      
      // 页脚：页码
      pdf.setFontSize(8);
      pdf.setTextColor(120, 113, 108);
      pdf.text(`${i + 1} / ${list.length} · ${po.po_number}`, A4_WIDTH_MM / 2, 290, { align: 'center' });
    } finally {
      wrap.remove();
    }
  }
  
  const filename = `${PO_SUPPLIER_FILTER}_采购单_${list.length}张_${new Date().toISOString().slice(0,10)}.pdf`;
  pdf.save(filename);
  toast(`✓ 已导出 ${list.length} 张 PO 到 PDF：${filename}`, 'ok', 6000);
}

// Word 导出：用 HTML 包装成 .doc 文件（Word 能识别 HTML，简化方案）
function _poBatchExportDocx(list, includeImages) {
  toast(`正在生成 ${list.length} 张 PO 的 Word...`, 'info');
  
  const today = new Date().toISOString().slice(0, 10);
  const supplier = PO_SUPPLIER_FILTER;
  
  // 构建 Word-friendly HTML（每个 PO 占一页，用 page-break-after 强制分页）
  const poHtmls = list.map(po => {
    const items = po.line_items || [];
    const totalQty = items.reduce((s, x) => s + (x.qty || 0), 0);
    const totalAmount = items.reduce((s, x) => s + (x.subtotal || 0), 0);
    // V5-W3-2026-05-26: 老 PO 兜底电气标准查询
    let _lookupStd = '';
    try {
      const soInfo = (typeof PO_SALES_ORDERS_MAP !== 'undefined') ? (PO_SALES_ORDERS_MAP[po.sales_order_id] || {}) : {};
      const shipping = soInfo.shipping_address || {};
      const co = shipping.country_code || shipping.country || '';
      if (co && typeof getElectricalStandard === 'function') {
        _lookupStd = getElectricalStandard(co, shipping.country || '') || '';
      }
    } catch (e) {}
    return `
    <div style="page-break-after: always; padding: 20px;">
      <h2 style="margin:0 0 6px; font-size:18pt; color:#1c1917;">📋 采购单 ${escapeHtml(po.po_number)}</h2>
      <div style="color:#78716c; font-size:10pt; margin-bottom:10px;">开单 ${new Date(po.created_at).toLocaleDateString()} · 跟单 ${escapeHtml(po.creator_name || '')}</div>
      <div style="background:#f5f5f4; padding:8px 12px; border-radius:4px; margin-bottom:10px; font-size:10pt;">
        <b>供应商：</b>${escapeHtml(po.supplier)} &nbsp;|&nbsp; 
        <b>关联销售：</b>${escapeHtml(po.order_no || '—')} &nbsp;|&nbsp; 
        
        <b>合计：</b><span style="color:#dc2626; font-weight:700;">${totalQty} 件 / ¥ ${totalAmount.toFixed(2)}</span>
      </div>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:100%; font-size:10pt;">
        <thead style="background:#f5f5f4;">
          <tr>
            <th style="width:40px;">#</th>
            ${includeImages ? '<th style="width:80px;">图片</th>' : ''}
            <th>产品规格</th>
            <th style="width:70px; background:#fef9f3;">下单标准</th>
            <th style="width:60px;">数量</th>
            <th style="width:80px;">单价</th>
            <th style="width:90px;">小计</th>
            <th style="width:120px; background:#fffdf7;">备注</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((li, i) => {
            const specs = extractVariantInfo(li.variant || '');
            const lineStd = li.electrical_standard || _lookupStd || '';
            const lineNote = li.line_note || '';
            return `
            <tr>
              <td style="text-align:center;">${i+1}</td>
              ${includeImages ? `<td>${li.image_url ? `<img src="${escapeHtml(li.image_url)}" style="width:60px; height:60px; object-fit:cover;">` : '—'}</td>` : ''}
              <td>${li.title_cn ? `<b>${escapeHtml(li.title_cn)}</b><br>` : ''}<span style="color:#78716c; font-size:8pt;">${escapeHtml(li.sku || '')}</span>${specs ? `<br><span style="color:#555; font-size:9pt;">${escapeHtml(specs)}</span>` : ''}</td>
              <td style="text-align:center; background:#fef9f3;"><b style="color:#c2410c; font-size:9pt;">${escapeHtml(lineStd) || '—'}</b></td>
              <td style="text-align:center; ${li.qty >= 2 ? 'background:#dc2626; color:white; font-weight:700;' : ''}">${li.qty}</td>
              <td style="text-align:right;">¥ ${Number(li.price).toFixed(2)}</td>
              <td style="text-align:right; font-weight:600;">¥ ${Number(li.subtotal).toFixed(2)}</td>
              <td style="background:#fffdf7; font-size:9pt; color:#444; vertical-align:top;">${lineNote ? escapeHtml(lineNote) : ''}</td>
            </tr>`;
          }).join('')}
          <tr style="background:#fef3c7; font-weight:700;">
            <td colspan="${includeImages ? 3 : 2}" style="text-align:right;">合 计</td>
            <td style="background:#fef9f3;"></td>
            <td style="text-align:center;">${totalQty}</td>
            <td></td>
            <td style="text-align:right; color:#dc2626;">¥ ${totalAmount.toFixed(2)}</td>
            <td style="background:#fffdf7;"></td>
          </tr>
        </tbody>
      </table>
      <div style="background:#fff5f5; border:1px solid #fecaca; padding:10px; margin-top:10px;">
        <b style="color:#dc2626;">⚠ 订单备注（请写在纸箱上）：</b>
        <span style="color:#7f1d1d; font-weight:600;">${escapeHtml(po.box_note || '—')}</span>
      </div>
    </div>`;
  }).join('');
  
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="UTF-8">
<title>${supplier} 采购单</title>
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
<style>
  body { font-family: "Microsoft YaHei", -apple-system, sans-serif; }
  table { border-collapse: collapse; }
  @page { size: A4; margin: 1.5cm; }
</style>
</head>
<body>
<h1 style="font-size:22pt; margin-bottom:4pt;">📋 ${supplier} 采购单合集</h1>
<div style="color:#78716c; font-size:10pt; margin-bottom:20pt;">共 ${list.length} 张 PO · 导出日期 ${today}${includeImages ? ' · 含图' : ' · 不含图'}</div>
${poHtmls}
</body>
</html>`;
  
  // Word 能识别 HTML 但需要 .doc 后缀和 Word HTML MIME
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${supplier}_采购单_${list.length}张_${today}.doc`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  
  toast(`✓ 已导出 ${list.length} 张 PO 到 Word 文档`, 'ok', 5000);
}
// 兼容旧引用



// ============================================================
// V4-2026-05-24：PO 预览功能（点【👁 预览】按钮触发）
// 用户需求：复制订单图前先在网页上预览，确认无误再复制/下载
// 设计：
//   - 复用 _buildSinglePoExportNode + html2canvas → dataURL
//   - 全屏遮罩 + 中间居中大图
//   - 底部 3 个按钮：返回修改 / 复制到剪贴板 / 下载图片
//   - Esc 关闭 / 点遮罩背景关闭
// ============================================================

// 注入 CSS（一次性，不动 styles.css）
(function injectPoPreviewCSS() {
  if (document.getElementById('po-preview-modal-style')) return;
  const style = document.createElement('style');
  style.id = 'po-preview-modal-style';
  style.textContent = `
    .po-preview-modal {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      animation: poPreviewFadeIn 0.18s ease-out;
    }
    @keyframes poPreviewFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .po-preview-backdrop {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(4px);
      cursor: pointer;
    }
    .po-preview-content {
      position: relative; z-index: 1;
      background: white; border-radius: 12px;
      max-width: 92vw; max-height: 92vh;
      display: flex; flex-direction: column;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .po-preview-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 18px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(to bottom, #f9fafb, #fff);
      flex-shrink: 0;
    }
    .po-preview-title {
      font-size: 14px; font-weight: 600; color: #111827;
      display: flex; align-items: center; gap: 8px;
    }
    .po-preview-title .po-preview-tag {
      background: #2563eb; color: white;
      padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 700;
    }
    .po-preview-close {
      width: 30px; height: 30px;
      border: none; background: transparent;
      cursor: pointer; font-size: 18px; color: #6b7280;
      border-radius: 6px; line-height: 1;
      transition: all 0.15s;
    }
    .po-preview-close:hover { background: #fee2e2; color: #dc2626; }
    .po-preview-body {
      flex: 1; min-height: 0;
      overflow: auto;
      padding: 20px;
      background: #f3f4f6;
      display: flex; justify-content: center; align-items: flex-start;
    }
    .po-preview-body img {
      max-width: 100%;
      height: auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      background: white;
      border-radius: 4px;
    }
    .po-preview-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      padding: 12px 18px;
      border-top: 1px solid #e5e7eb;
      background: #fafafa;
      flex-shrink: 0;
    }
    .po-preview-actions .so-action-btn {
      padding: 6px 14px; font-size: 13px;
    }
    .po-preview-hint {
      flex: 1;
      font-size: 12px;
      color: #6b7280;
      display: flex; align-items: center;
    }
  `;
  document.head.appendChild(style);
})();

// 主入口：点【👁 预览】按钮调用
async function poPreviewImage(poId) {
  const po = PO_LIST.find(x => x.id === poId);
  if (!po) { toast('找不到 PO', 'err'); return; }
  toast('正在生成预览…', 'info');

  try {
    await _loadHtml2Canvas();
  } catch (e) {
    toast('截图工具加载失败，请检查网络', 'err');
    return;
  }

  // 复用现有的屏幕外渲染函数（与"复制订单图"完全一致的版式）
  const wrap = _buildSinglePoExportNode(po, true);
  document.body.appendChild(wrap);

  // 等图片加载完成（避免半截截图）
  const imgs = wrap.querySelectorAll('img');
  await Promise.all([...imgs].map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(res => { img.onload = res; img.onerror = res; setTimeout(res, 3000); });
  }));

  try {
    const canvas = await window.html2canvas(wrap.querySelector('.po-print'), {
      backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false,
    });
    const dataUrl = canvas.toDataURL('image/png');
    _showPoPreviewModal(po, canvas, dataUrl);
  } catch (e) {
    toast('生成失败：' + (e.message || e), 'err');
  } finally {
    // 截图完成后清理屏幕外的临时 DOM（canvas 已经独立存在）
    document.body.removeChild(wrap);
  }
}

// 弹出全屏预览
function _showPoPreviewModal(po, canvas, dataUrl) {
  // 移除可能存在的旧 modal（防止重复打开）
  document.getElementById('poPreviewModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'poPreviewModal';
  modal.className = 'po-preview-modal';
  modal.innerHTML = `
    <div class="po-preview-backdrop" onclick="poClosePreview()"></div>
    <div class="po-preview-content">
      <div class="po-preview-header">
        <span class="po-preview-title">
          <span class="po-preview-tag">预览</span>
          ${escapeHtml(po.po_number)} · ${escapeHtml(po.supplier)}
        </span>
        <button class="po-preview-close" onclick="poClosePreview()" title="关闭 (Esc)">✕</button>
      </div>
      <div class="po-preview-body">
        <img src="${dataUrl}" alt="采购单预览">
      </div>
      <div class="po-preview-actions">
        <span class="po-preview-hint">💡 确认无误后选择复制或下载（取消请点关闭/Esc）</span>
        <button class="so-action-btn" onclick="poClosePreview()">← 返回修改</button>
        <button class="so-action-btn" onclick="poPreviewDownload()">📥 下载图片</button>
        <button class="so-action-btn primary" onclick="poPreviewCopyToClipboard()" title="把图复制到剪贴板，去微信群 Ctrl+V 粘贴">📋 复制到剪贴板</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // 缓存当前 canvas（让复制/下载按钮能用）
  window._poPreviewCache = { po, canvas, dataUrl };

  // Esc 关闭
  const handler = (e) => {
    if (e.key === 'Escape') {
      poClosePreview();
    }
  };
  document.addEventListener('keydown', handler);
  modal._escHandler = handler;
}

function poClosePreview() {
  const modal = document.getElementById('poPreviewModal');
  if (modal) {
    if (modal._escHandler) {
      document.removeEventListener('keydown', modal._escHandler);
    }
    modal.remove();
  }
  window._poPreviewCache = null;
}

// 在预览框里点【复制到剪贴板】
async function poPreviewCopyToClipboard() {
  const cache = window._poPreviewCache;
  if (!cache) { toast('预览已失效，请重新点预览', 'err'); return; }
  cache.canvas.toBlob(async (blob) => {
    if (!blob) { toast('生成失败', 'err'); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(`✓ ${cache.po.po_number} 已复制到剪贴板，去微信群 Ctrl+V 粘贴`);
      poClosePreview();
    } catch (e) {
      // 浏览器不支持剪贴板 API（HTTP 或旧浏览器）→ 自动退回下载
      toast('剪贴板不可用，已自动下载到本地', 'info');
      _poPreviewBlobDownload(blob, cache.po.po_number);
      poClosePreview();
    }
  }, 'image/png');
}

// 在预览框里点【下载图片】
function poPreviewDownload() {
  const cache = window._poPreviewCache;
  if (!cache) { toast('预览已失效，请重新点预览', 'err'); return; }
  cache.canvas.toBlob((blob) => {
    if (!blob) { toast('生成失败', 'err'); return; }
    _poPreviewBlobDownload(blob, cache.po.po_number);
    toast(`✓ ${cache.po.po_number} 已下载`);
    poClosePreview();
  }, 'image/png');
}

// 内部工具：blob → 触发浏览器下载
function _poPreviewBlobDownload(blob, poNumber) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `采购单_${poNumber}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// V4-2026-05-24：修改 PO 产品描述（不动数量/价格）
// 用户场景：英文翻译错误、中文名要调、纸箱备注要补 — 但数量/价格已经定了不能改
// ============================================================
async function poEditDescription(poId) {
  const po = PO_LIST.find(x => x.id === poId);
  if (!po) { toast('找不到 PO', 'err'); return; }
  const items = po.line_items || [];
  if (items.length === 0) { toast('该 PO 无产品行', 'warn'); return; }

  // 构建字段：先订单备注，再每个产品的 3 个字段
  const fields = [
    {
      key: 'box_note',
      label: '📦 订单备注（写在纸箱上，供应商会看到）',
      value: po.box_note || '',
      type: 'textarea',
      rows: 3,
      placeholder: '例：美规110V电压、E27灯头、带调光遥控',
    },
  ];
  
  items.forEach((li, idx) => {
    const label = `——— 产品 ${idx + 1} · SKU: ${li.sku || '(无)'} · 数量 ${li.qty} 件 ¥${li.price}/件 (锁定) ———`;
    // 用一个"分隔字段"标识产品行，但其实只能用 readonly 模拟
    // showPrompt 不支持纯标题字段,所以把"标识"放到第一个字段的 label 里
    fields.push({
      key: `title_cn_${idx}`,
      label: `${label}\n中文名`,
      value: li.title_cn || '',
      type: 'text',
      placeholder: '例：玻璃花朵铜质壁灯',
    });
    fields.push({
      key: `title_en_${idx}`,
      label: `产品 ${idx + 1} · 英文名`,
      value: li.title_en || li.title || '',
      type: 'text',
      placeholder: '例：Brass Floral Glass Sconce',
    });
    fields.push({
      key: `variant_${idx}`,
      label: `产品 ${idx + 1} · 规格描述`,
      value: li.variant || '',
      type: 'text',
      placeholder: '例：220V / 黑色 / E27',
    });
  });

  const result = await showPrompt({
    title: `📝 修改 ${po.po_number} 产品描述`,
    message: `供应商：${po.supplier || ''} · 共 ${items.length} 项产品\n\n⚠ 此处不能改数量/价格（请用"改价"按钮）。修改后会同步到 PO 数据 + 后续生成的订单图。`,
    fields,
    okText: '💾 保存修改',
    cancelText: '取消',
  });
  if (!result) return;

  // 重组 line_items（保留所有原字段,只更新描述类字段）
  const newLineItems = items.map((li, idx) => ({
    ...li,
    title_cn: (result[`title_cn_${idx}`] || '').trim(),
    title_en: (result[`title_en_${idx}`] || '').trim(),
    variant: (result[`variant_${idx}`] || '').trim(),
    // 数量、单价、subtotal 完全不动
  }));
  const newBoxNote = (result.box_note || '').trim();

  try {
    await sb.from('orders').update({
      line_items: newLineItems,
      box_note: newBoxNote,
      updated_at: new Date().toISOString(),
    }).eq('id', poId);
    
    // 更新本地缓存
    po.line_items = newLineItems;
    po.box_note = newBoxNote;
    
    toast(`✓ 已保存 ${po.po_number} 的描述修改`);
    
    // 刷新列表
    if (typeof renderPo === 'function') renderPo();
  } catch (e) {
    console.error('保存 PO 描述失败:', e);
    toast('保存失败：' + (e.message || e), 'err');
  }
}

// ============================================================
// V20260526q: PO 店铺过滤(参考销售单 chip)
// ============================================================

function poRenderShops() {
  const grid = document.getElementById('poStoresGrid');
  if (!grid) return;
  const stores = (typeof SHOPIFY !== 'undefined' && SHOPIFY._stores) ? SHOPIFY._stores : [];
  if (stores.length === 0) {
    grid.innerHTML = '<span style="font-size:11px; color:var(--text-tertiary);">先去销售单同步店铺</span>';
    _updatePoShopFilterStatusBar();
    return;
  }
  const connectedStores = stores.filter(s => s.connected);
  if (connectedStores.length === 0) {
    grid.innerHTML = '<span style="font-size:11px; color:var(--text-tertiary);">先去销售单连接店铺</span>';
    _updatePoShopFilterStatusBar();
    return;
  }
  grid.innerHTML = connectedStores.map(s => {
    const isFiltered = PO_SHOP_FILTER.has(s.domain);
    return `
      <span class="store-chip connected ${isFiltered ? 'filtering' : ''}" 
        onclick="poToggleShopFilter('${s.domain}')"
        title="${escapeHtml(s.display_name)} · ${isFiltered ? '【当前过滤】再次点击取消 · ' : ''}点击只看该店的 PO">
        <span class="store-chip-code">${s.site_code}</span>
        <span class="store-chip-name">${escapeHtml(s.display_name)}</span>
        <span class="store-chip-status">${isFiltered ? '🎯' : '✓'}</span>
      </span>`;
  }).join('');
  _updatePoShopFilterStatusBar();
}

function _updatePoShopFilterStatusBar() {
  const status = document.getElementById('poStoresFilterStatus');
  const clearBtn = document.getElementById('poStoresClearBtn');
  if (!status || !clearBtn) return;
  const n = PO_SHOP_FILTER.size;
  if (n === 0) {
    status.style.display = 'none';
    clearBtn.style.display = 'none';
  } else if (n === 1) {
    const domain = [...PO_SHOP_FILTER][0];
    const code = (typeof SHOPIFY !== 'undefined' && SHOPIFY.siteCodeOf) ? SHOPIFY.siteCodeOf(domain) : domain.split('.')[0];
    status.textContent = `仅显示 ${code} 的 PO`;
    status.className = 'shop-filter-status';
    status.style.display = '';
    clearBtn.style.display = '';
  } else {
    status.textContent = `过滤 ${n} 家店的 PO`;
    status.className = 'shop-filter-status multi';
    status.style.display = '';
    clearBtn.style.display = '';
  }
}

function poToggleShopFilter(domain) {
  // V20260527g: 改为单选切换 · 跟销售单一致 · 模仿店小秘
  // 点未选 → 替换为唯一过滤
  // 点已选(唯一) → 清空
  const isOnlyThis = PO_SHOP_FILTER.size === 1 && PO_SHOP_FILTER.has(domain);
  if (isOnlyThis) {
    PO_SHOP_FILTER.clear();
    toast('已清除店铺过滤,显示全部 PO', 'info', 1200);
  } else {
    PO_SHOP_FILTER.clear();
    PO_SHOP_FILTER.add(domain);
    const code = (SHOPIFY && SHOPIFY.siteCodeOf) ? SHOPIFY.siteCodeOf(domain) : domain;
    toast(`✓ 已切换到 ${code} 的 PO`, 'info', 1200);
  }
  poRenderShops();
  PO_PAGE = 1;
  renderPoList();
}
window.poToggleShopFilter = poToggleShopFilter;

function poClearShopFilter() {
  if (PO_SHOP_FILTER.size === 0) return;
  PO_SHOP_FILTER.clear();
  poRenderShops();
  PO_PAGE = 1;
  renderPoList();
  toast('已显示全部店铺的 PO', 'info', 1200);
}
window.poClearShopFilter = poClearShopFilter;
window.poRenderShops = poRenderShops;
