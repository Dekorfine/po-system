// ============================================================
// V20260531-WIZARD:开 PO 新人引导向导
// 不替代原 [📦 开采购单] 按钮 · 单独 [🪄 新人引导] 入口
// 流程:5 步收集字段 → 预览 → 自动打开原表单并预填 → 用户 review 提交
// ============================================================

(function() {
  'use strict';
  
  let WIZARD_STATE = null;
  let _wizardStep = 1;
  const TOTAL_STEPS = 5;
  
  // ============ 入口 ============
  window.openPoWizard = async function(salesOrderId) {
    const so = (typeof SHOPIFY !== 'undefined' && SHOPIFY._orders || []).find(o => o.id === salesOrderId);
    if (!so) {
      if (typeof toast === 'function') toast('订单不存在', 'err');
      return;
    }
    
    // 加载供应商 + 产品库
    try {
      if (typeof SUPPLIERS !== 'undefined') await SUPPLIERS.loadAll();
      if (typeof PRODUCTS_CACHE !== 'undefined') await PRODUCTS_CACHE.loadAll();
    } catch (e) {
      console.warn('[wizard] 加载基础数据失败', e);
    }
    
    // 加载历史供应商(智能推荐)
    let supplierHistory = {};
    const skus = (so.line_items || []).map(li => li.sku).filter(Boolean);
    if (skus.length > 0 && typeof sb !== 'undefined') {
      try {
        const { data } = await sb.from('v_sku_supplier_history').select('*').in('sku', skus);
        if (data && data.length > 0) {
          data.forEach(h => {
            const key = h.supplier;
            if (!supplierHistory[key]) {
              supplierHistory[key] = { supplier: h.supplier, count: 0, last_at: h.last_ordered_at, prices: [], skus: new Set() };
            }
            supplierHistory[key].count += h.order_count || 0;
            if (!supplierHistory[key].last_at || h.last_ordered_at > supplierHistory[key].last_at) {
              supplierHistory[key].last_at = h.last_ordered_at;
            }
            if (h.avg_price) supplierHistory[key].prices.push(h.avg_price);
            supplierHistory[key].skus.add(h.sku);
          });
          Object.values(supplierHistory).forEach(e => {
            e.avg_price = e.prices.length > 0 ? e.prices.reduce((a,b) => a+b, 0) / e.prices.length : 0;
            e.skus = Array.from(e.skus);
          });
        }
      } catch (e) { console.warn('[wizard] 历史查询失败', e); }
    }
    
    // 检查每个 line_item 是否已经开过 PO(避免重复)
    let alreadyOrderedItems = new Set();
    try {
      const { data: existingPo } = await sb.from('purchase_orders')
        .select('items')
        .eq('sales_order_id', so.id)
        .neq('status', 'cancelled');
      if (existingPo && existingPo.length > 0) {
        existingPo.forEach(po => {
          (po.items || []).forEach(item => {
            if (item.shopify_line_item_id) alreadyOrderedItems.add(item.shopify_line_item_id);
          });
        });
      }
    } catch (e) { console.warn('[wizard] 查询已开 PO 失败', e); }
    
    WIZARD_STATE = {
      so,
      supplierHistory,
      alreadyOrderedItems,
      selectedSupplier: null,
      customSupplierName: '',
      lineItems: (so.line_items || []).map(li => {
        const wasOrdered = alreadyOrderedItems.has(li.shopify_line_item_id);
        return {
          ...li,
          _checked: !wasOrdered,
          _alreadyOrdered: wasOrdered,
          _unitPrice: 0,
          _qty: li.quantity || 1,
          _note: '',
        };
      }),
      specialRequirements: {
        voltage: '',         // 110V / 220V / null(无)
        standard: '',        // 美标 / 欧标 / 中标
        lightSource: '',     // LED / 白炽 / null
        manualEn: false,     // 英文说明书
        sampleFirst: false,  // 是否打样
        otherReq: '',
      },
      _confirmedCheckList: false,  // step 4 的清单确认
    };
    
    _wizardStep = 1;
    _renderWizard();
  };
  
  function _renderWizard() {
    // 移除已有
    document.getElementById('poWizardModal')?.remove();
    
    const m = document.createElement('div');
    m.id = 'poWizardModal';
    m.className = 'modal-bg show';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    m.innerHTML = `
      <div style="background:#fff;border-radius:14px;width:100%;max-width:760px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        ${_renderHeader()}
        <div style="flex:1;overflow-y:auto;padding:20px 24px;">
          ${_renderStep()}
        </div>
        ${_renderFooter()}
      </div>
    `;
    document.body.appendChild(m);
  }
  
  function _renderHeader() {
    const stepLabels = ['确认订单', '选供应商', '价格 / 数量', '特殊要求清单', '预览 + 提交'];
    return `
      <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;padding:16px 24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;font-size:16px;font-weight:700;">🪄 开 PO 新人引导 · Step ${_wizardStep}/${TOTAL_STEPS}</h3>
          <button onclick="closePoWizard()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button>
        </div>
        <div style="display:flex;gap:4px;">
          ${stepLabels.map((label, i) => {
            const step = i + 1;
            const done = step < _wizardStep;
            const active = step === _wizardStep;
            return `<div style="flex:1;text-align:center;font-size:10.5px;padding:6px 4px;border-radius:6px;background:${active ? 'rgba(255,255,255,0.95)' : done ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'};color:${active ? '#1e40af' : 'white'};font-weight:${active ? '700' : '500'};">${done ? '✓' : step}. ${label}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  }
  
  function _renderStep() {
    if (_wizardStep === 1) return _renderStep1();
    if (_wizardStep === 2) return _renderStep2();
    if (_wizardStep === 3) return _renderStep3();
    if (_wizardStep === 4) return _renderStep4();
    if (_wizardStep === 5) return _renderStep5();
    return '';
  }
  
  // ============ Step 1:确认订单 + 选要开 PO 的产品 ============
  function _renderStep1() {
    const so = WIZARD_STATE.so;
    const items = WIZARD_STATE.lineItems;
    const allOrdered = items.every(i => i._alreadyOrdered);
    
    return `
      <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;">
        💡 <b>这一步</b>:确认要给哪些产品开采购单。<b>已经开过 PO 的产品自动跳过</b>(避免重复)。
      </div>
      
      <div style="background:#f8fafc;padding:12px 14px;border-radius:8px;margin-bottom:14px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;margin-bottom:4px;letter-spacing:1px;">订单</div>
        <div style="font-weight:700;font-size:16px;color:#1c1917;">${escapeHtml(so.shopify_order_number || so.id)}</div>
        <div style="font-size:12px;color:#57534e;margin-top:4px;">${escapeHtml(so.shop_domain || '')} · 客户:${escapeHtml(so.customer_name || '—')}</div>
      </div>
      
      ${allOrdered ? `
        <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:14px;color:#92400e;font-size:13px;text-align:center;">
          ⚠️ 该订单所有产品都已经开过 PO 了 · 无需再开
        </div>
      ` : `
        <div style="font-size:13px;color:#1c1917;margin-bottom:8px;font-weight:600;">📦 选择要开 PO 的产品(共 ${items.length} 个):</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${items.map((it, idx) => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid ${it._alreadyOrdered ? '#e7e5e4' : it._checked ? '#2563eb' : '#e7e5e4'};border-radius:8px;background:${it._alreadyOrdered ? '#fafaf9' : '#fff'};cursor:${it._alreadyOrdered ? 'not-allowed' : 'pointer'};opacity:${it._alreadyOrdered ? '0.55' : '1'};">
              <input type="checkbox" ${it._checked ? 'checked' : ''} ${it._alreadyOrdered ? 'disabled' : ''} onchange="poWizardToggleItem(${idx})" style="margin:0;width:18px;height:18px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:#1c1917;">${escapeHtml(it.title || '(无标题)')}</div>
                <div style="font-size:11px;color:#78716c;margin-top:2px;">
                  SKU: ${escapeHtml(it.sku || '—')} · 数量: ${it.quantity || 1}
                  ${it._alreadyOrdered ? '<span style="color:#15803d;font-weight:600;margin-left:6px;">✓ 已开 PO</span>' : ''}
                </div>
              </div>
            </label>
          `).join('')}
        </div>
      `}
    `;
  }
  
  // ============ Step 2:选供应商 ============
  function _renderStep2() {
    const histList = Object.values(WIZARD_STATE.supplierHistory)
      .sort((a, b) => (b.count || 0) - (a.count || 0));
    const allSuppliers = typeof SUPPLIERS !== 'undefined' && Array.isArray(SUPPLIERS.list) ? SUPPLIERS.list : [];
    const selected = WIZARD_STATE.selectedSupplier;
    const custom = WIZARD_STATE.customSupplierName;
    
    return `
      <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;">
        💡 <b>这一步</b>:选供应商。<b>智能推荐</b>:这些 SKU 之前用过的供应商,优先推荐(成功率高 + 价格已知)。
      </div>
      
      ${histList.length > 0 ? `
        <div style="font-size:13px;color:#1c1917;font-weight:600;margin-bottom:8px;">⭐ 智能推荐(曾给这些 SKU 下过单):</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
          ${histList.map(h => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid ${selected === h.supplier ? '#2563eb' : '#e7e5e4'};border-radius:8px;background:${selected === h.supplier ? '#eff6ff' : '#fff'};cursor:pointer;">
              <input type="radio" name="poWizardSupplier" value="${escapeHtml(h.supplier)}" ${selected === h.supplier ? 'checked' : ''} onchange="poWizardSelectSupplier('${escapeHtml(h.supplier).replace(/'/g,"\\'")}')">
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:700;color:#1c1917;">${escapeHtml(h.supplier)}</div>
                <div style="font-size:11px;color:#78716c;margin-top:2px;">
                  历史 ${h.count} 单 · 平均 ¥${(h.avg_price || 0).toFixed(2)} · 涉及 ${h.skus.length} 个 SKU
                </div>
              </div>
              <div style="font-size:11px;color:#15803d;font-weight:700;">⭐ 推荐</div>
            </label>
          `).join('')}
        </div>
      ` : ''}
      
      <div style="font-size:13px;color:#1c1917;font-weight:600;margin-bottom:8px;">📋 全部供应商:</div>
      <select onchange="poWizardSelectSupplier(this.value)" style="width:100%;padding:10px 12px;border:1.5px solid #e7e5e4;border-radius:8px;font-size:14px;">
        <option value="">— 选择供应商 —</option>
        ${allSuppliers.map(s => `<option value="${escapeHtml(s.name)}" ${selected === s.name ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
      </select>
      
      <div style="margin-top:14px;padding:10px 12px;background:#fafaf9;border-radius:8px;font-size:12px;color:#57534e;">
        💡 找不到供应商? <button onclick="poWizardManualSupplier()" style="background:#2563eb;color:#fff;border:none;padding:5px 12px;border-radius:5px;font-size:11.5px;cursor:pointer;font-weight:600;margin-left:6px;">+ 手动输入新供应商</button>
        ${custom ? `<div style="margin-top:6px;font-size:11px;color:#15803d;">✓ 已输入:<b>${escapeHtml(custom)}</b></div>` : ''}
      </div>
    `;
  }
  
  // ============ Step 3:价格 / 数量 ============
  function _renderStep3() {
    const items = WIZARD_STATE.lineItems.filter(i => i._checked);
    const supplier = WIZARD_STATE.selectedSupplier || WIZARD_STATE.customSupplierName;
    const hist = WIZARD_STATE.supplierHistory[supplier];
    
    return `
      <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;">
        💡 <b>这一步</b>:确认每个产品的 <b>数量</b> 和 <b>采购单价</b>(给供应商的价格,不是卖给客户的价)。<br>
        ${hist && hist.prices && hist.prices.length > 0 ? `历史平均 ¥${hist.avg_price.toFixed(2)} · 参考用` : '<span style="color:#92400e;">⚠ 新供应商无历史价 · 跟供应商问完再填</span>'}
      </div>
      
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${items.map((it, idx) => {
          const realIdx = WIZARD_STATE.lineItems.indexOf(it);
          return `
            <div style="border:1.5px solid #e7e5e4;border-radius:8px;padding:12px;">
              <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#1c1917;">${escapeHtml(it.title || '')}</div>
              <div style="font-size:11px;color:#78716c;margin-bottom:8px;">SKU: ${escapeHtml(it.sku || '—')}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div>
                  <label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px;font-weight:600;">数量(件)</label>
                  <input type="number" value="${it._qty}" min="1" 
                    onchange="poWizardUpdateItem(${realIdx}, '_qty', parseInt(this.value)||1)"
                    style="width:100%;padding:8px 10px;border:1.5px solid #e7e5e4;border-radius:6px;font-size:13px;font-family:'JetBrains Mono',monospace;text-align:right;">
                </div>
                <div>
                  <label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px;font-weight:600;">采购单价(¥)</label>
                  <input type="number" value="${it._unitPrice || ''}" min="0" step="0.01"
                    placeholder="${hist?.avg_price ? hist.avg_price.toFixed(2) : '问供应商'}"
                    onchange="poWizardUpdateItem(${realIdx}, '_unitPrice', parseFloat(this.value)||0)"
                    style="width:100%;padding:8px 10px;border:1.5px solid #e7e5e4;border-radius:6px;font-size:13px;font-family:'JetBrains Mono',monospace;text-align:right;">
                </div>
              </div>
              <input type="text" value="${escapeHtml(it._note || '')}" placeholder="备注(如颜色/包装要求 · 可选)"
                onchange="poWizardUpdateItem(${realIdx}, '_note', this.value)"
                style="width:100%;padding:7px 10px;border:1.5px solid #e7e5e4;border-radius:6px;font-size:12px;margin-top:8px;">
            </div>
          `;
        }).join('')}
      </div>
      
      <div id="poWizardStep3Total" style="margin-top:14px;padding:10px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;font-size:13px;color:#166534;text-align:right;">
        ${_calcTotal()}
      </div>
    `;
  }
  
  function _calcTotal() {
    const items = WIZARD_STATE.lineItems.filter(i => i._checked);
    const total = items.reduce((sum, it) => sum + (it._qty * (it._unitPrice || 0)), 0);
    const qty = items.reduce((sum, it) => sum + it._qty, 0);
    return `合计:${items.length} 个产品 · ${qty} 件 · <b style="font-size:16px;font-family:'JetBrains Mono',monospace;">¥${total.toFixed(2)}</b>`;
  }
  
  // ============ Step 4:特殊要求清单(防漏关键项)============
  function _renderStep4() {
    const r = WIZARD_STATE.specialRequirements;
    const so = WIZARD_STATE.so;
    const country = (so.shipping_address?.country || '').toLowerCase();
    const suggestStd = country.includes('united states') || country === 'us' ? '美标' :
                       country.includes('saudi') || country.includes('uae') || country.includes('europe') ? '欧标' :
                       country.includes('australia') ? 'AU 标' : '';
    const suggestV = country.includes('united states') || country === 'us' ? '110V' :
                     country.includes('saudi') || country.includes('uae') || country.includes('europe') ? '220V' :
                     country.includes('australia') ? '230V' : '';
    
    return `
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#92400e;">
        ⚠️ <b>这一步最关键!</b> 漏填这些信息 → 供应商按默认做,产品到了用不了 → 返工 / 重做 / 损失千元起。<br>
        客户国家:<b>${escapeHtml(so.shipping_address?.country || '未填')}</b>
        ${suggestStd ? ` · <span style="color:#15803d;font-weight:600;">建议:${suggestStd} · ${suggestV}</span>` : ''}
      </div>
      
      <div style="display:flex;flex-direction:column;gap:12px;">
        <!-- 电压 -->
        <div>
          <label style="font-size:13px;font-weight:700;color:#1c1917;display:block;margin-bottom:6px;">⚡ 电压(目的国必须正确!)</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['110V', '220V', '230V', '其它'].map(v => `
              <button onclick="poWizardSetReq('voltage', '${v}')" style="padding:8px 14px;border:1.5px solid ${r.voltage === v ? '#2563eb' : '#e7e5e4'};background:${r.voltage === v ? '#eff6ff' : '#fff'};color:${r.voltage === v ? '#1e40af' : '#1c1917'};border-radius:6px;font-size:12.5px;cursor:pointer;font-weight:${r.voltage === v ? '700' : '500'};">${v}${suggestV === v ? ' ⭐' : ''}</button>
            `).join('')}
          </div>
        </div>
        
        <!-- 标准 -->
        <div>
          <label style="font-size:13px;font-weight:700;color:#1c1917;display:block;margin-bottom:6px;">📋 标准</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['美标', '欧标', 'AU 标', '中标', '其它'].map(s => `
              <button onclick="poWizardSetReq('standard', '${s}')" style="padding:8px 14px;border:1.5px solid ${r.standard === s ? '#2563eb' : '#e7e5e4'};background:${r.standard === s ? '#eff6ff' : '#fff'};color:${r.standard === s ? '#1e40af' : '#1c1917'};border-radius:6px;font-size:12.5px;cursor:pointer;font-weight:${r.standard === s ? '700' : '500'};">${s}${suggestStd === s ? ' ⭐' : ''}</button>
            `).join('')}
          </div>
        </div>
        
        <!-- 光源 -->
        <div>
          <label style="font-size:13px;font-weight:700;color:#1c1917;display:block;margin-bottom:6px;">💡 光源</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${['LED', '白炽灯', '不带光源', '其它'].map(l => `
              <button onclick="poWizardSetReq('lightSource', '${l}')" style="padding:8px 14px;border:1.5px solid ${r.lightSource === l ? '#2563eb' : '#e7e5e4'};background:${r.lightSource === l ? '#eff6ff' : '#fff'};color:${r.lightSource === l ? '#1e40af' : '#1c1917'};border-radius:6px;font-size:12.5px;cursor:pointer;font-weight:${r.lightSource === l ? '700' : '500'};">${l}</button>
            `).join('')}
          </div>
        </div>
        
        <!-- toggles -->
        <div style="display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:#fafaf9;border-radius:8px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
            <input type="checkbox" ${r.manualEn ? 'checked' : ''} onchange="poWizardSetReq('manualEn', this.checked)" style="width:16px;height:16px;">
            <span><b>放英文说明书</b>(美/欧/AU 必带)</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
            <input type="checkbox" ${r.sampleFirst ? 'checked' : ''} onchange="poWizardSetReq('sampleFirst', this.checked)" style="width:16px;height:16px;">
            <span><b>做首样</b>(新供应商/新款式 · 量大订单建议勾)</span>
          </label>
        </div>
        
        <!-- 其它 -->
        <div>
          <label style="font-size:13px;font-weight:700;color:#1c1917;display:block;margin-bottom:6px;">📝 客户其它要求(可选)</label>
          <textarea onchange="poWizardSetReq('otherReq', this.value)" rows="3" placeholder="如:特殊颜色 / 包装方式 / 配件 / 加固 / 防潮等"
            style="width:100%;padding:10px;border:1.5px solid #e7e5e4;border-radius:6px;font-size:12.5px;font-family:inherit;resize:vertical;">${escapeHtml(r.otherReq || '')}</textarea>
        </div>
      </div>
    `;
  }
  
  // ============ Step 5:预览 + 提交 ============
  function _renderStep5() {
    const so = WIZARD_STATE.so;
    const items = WIZARD_STATE.lineItems.filter(i => i._checked);
    const supplier = WIZARD_STATE.selectedSupplier || WIZARD_STATE.customSupplierName;
    const r = WIZARD_STATE.specialRequirements;
    const total = items.reduce((sum, it) => sum + (it._qty * (it._unitPrice || 0)), 0);
    
    const issues = [];
    if (!supplier) issues.push('未选供应商');
    if (items.length === 0) issues.push('未勾选任何产品');
    if (items.some(i => !i._unitPrice)) issues.push('有产品未填单价');
    if (!r.voltage) issues.push('未确认电压');
    if (!r.standard) issues.push('未确认标准');
    
    return `
      <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;">
        ✅ <b>这一步</b>:核对全部信息 → 点 <b>[打开正式表单 · 已预填]</b> → 在标准 PO 表单里再 review 一遍 → 提交。
      </div>
      
      ${issues.length > 0 ? `
        <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#991b1b;">
          ⚠️ <b>请先返回完善以下项</b>:<br>
          ${issues.map(i => `· ${i}`).join('<br>')}
        </div>
      ` : ''}
      
      <div style="background:#fafaf9;border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">订单</div>
        <div style="font-size:14px;font-weight:700;">${escapeHtml(so.shopify_order_number || so.id)}</div>
      </div>
      
      <div style="background:#fafaf9;border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">供应商</div>
        <div style="font-size:14px;font-weight:700;color:${supplier ? '#1c1917' : '#dc2626'};">${escapeHtml(supplier) || '⚠ 未选'}</div>
      </div>
      
      <div style="background:#fafaf9;border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">产品(${items.length} 个)</div>
        ${items.map(it => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e7e5e4;font-size:12.5px;">
            <span style="flex:1;">${escapeHtml(it.title || '')} <span style="color:#78716c;font-size:11px;">(${escapeHtml(it.sku || '—')})</span></span>
            <span style="font-family:'JetBrains Mono',monospace;color:#1c1917;font-weight:600;">${it._qty} × ¥${(it._unitPrice||0).toFixed(2)} = ¥${(it._qty * (it._unitPrice||0)).toFixed(2)}</span>
          </div>
        `).join('')}
        <div style="display:flex;justify-content:space-between;padding-top:10px;font-size:14px;font-weight:700;color:#15803d;">
          <span>合计</span>
          <span style="font-family:'JetBrains Mono',monospace;">¥${total.toFixed(2)}</span>
        </div>
      </div>
      
      <div style="background:#fafaf9;border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">特殊要求</div>
        <div style="font-size:12.5px;line-height:1.8;">
          ⚡ 电压:<b>${escapeHtml(r.voltage) || '<span style="color:#dc2626">⚠ 未选</span>'}</b><br>
          📋 标准:<b>${escapeHtml(r.standard) || '<span style="color:#dc2626">⚠ 未选</span>'}</b><br>
          💡 光源:<b>${escapeHtml(r.lightSource) || '未选'}</b><br>
          📖 英文说明书:<b>${r.manualEn ? '✅ 是' : '否'}</b><br>
          🔬 做首样:<b>${r.sampleFirst ? '✅ 是' : '否'}</b>
          ${r.otherReq ? `<br>📝 其它:${escapeHtml(r.otherReq)}` : ''}
        </div>
      </div>
    `;
  }
  
  // ============ Footer 按钮 ============
  function _renderFooter() {
    const items = WIZARD_STATE.lineItems.filter(i => i._checked);
    const supplier = WIZARD_STATE.selectedSupplier || WIZARD_STATE.customSupplierName;
    const r = WIZARD_STATE.specialRequirements;
    
    let nextEnabled = true;
    let nextHint = '';
    if (_wizardStep === 1) {
      nextEnabled = items.length > 0;
      if (!nextEnabled) nextHint = '请至少勾选 1 个产品';
    } else if (_wizardStep === 2) {
      nextEnabled = !!supplier;
      if (!nextEnabled) nextHint = '请选择供应商';
    } else if (_wizardStep === 3) {
      nextEnabled = items.every(it => it._unitPrice > 0);
      if (!nextEnabled) nextHint = '请给所有产品填单价';
    } else if (_wizardStep === 4) {
      nextEnabled = !!r.voltage && !!r.standard;
      if (!nextEnabled) nextHint = '电压 / 标准必填';
    }
    
    return `
      <div style="padding:14px 24px;border-top:1px solid #e7e5e4;background:#fafaf9;display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="font-size:11.5px;color:#dc2626;font-weight:600;">${nextHint}</div>
        <div style="display:flex;gap:8px;">
          ${_wizardStep > 1 ? `<button onclick="poWizardPrev()" style="padding:9px 18px;background:#fff;border:1.5px solid #e7e5e4;color:#1c1917;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">← 上一步</button>` : `<button onclick="closePoWizard()" style="padding:9px 18px;background:#fff;border:1.5px solid #e7e5e4;color:#78716c;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">取消</button>`}
          ${_wizardStep < TOTAL_STEPS 
            ? `<button onclick="poWizardNext()" ${!nextEnabled ? 'disabled' : ''} style="padding:9px 22px;background:${nextEnabled ? '#2563eb' : '#cbd5e1'};color:#fff;border:none;border-radius:6px;cursor:${nextEnabled ? 'pointer' : 'not-allowed'};font-size:13px;font-weight:700;">下一步 →</button>`
            : `<button onclick="poWizardSubmit()" style="padding:9px 22px;background:#15803d;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">🚀 打开正式表单 · 已预填</button>`
          }
        </div>
      </div>
    `;
  }
  
  // ============ 公开函数(给 onclick 调用)============
  window.closePoWizard = function() {
    document.getElementById('poWizardModal')?.remove();
    WIZARD_STATE = null;
  };
  
  window.poWizardPrev = function() {
    if (_wizardStep > 1) { _wizardStep--; _renderWizard(); }
  };
  
  window.poWizardNext = function() {
    if (_wizardStep < TOTAL_STEPS) { _wizardStep++; _renderWizard(); }
  };
  
  window.poWizardToggleItem = function(idx) {
    const it = WIZARD_STATE.lineItems[idx];
    if (it._alreadyOrdered) return;
    it._checked = !it._checked;
    _renderWizard();
  };
  
  window.poWizardSelectSupplier = function(name) {
    WIZARD_STATE.selectedSupplier = name;
    WIZARD_STATE.customSupplierName = '';
    _renderWizard();
  };
  
  window.poWizardManualSupplier = function() {
    const name = prompt('请输入新供应商名称:');
    if (name && name.trim()) {
      WIZARD_STATE.selectedSupplier = null;
      WIZARD_STATE.customSupplierName = name.trim();
      _renderWizard();
    }
  };
  
  window.poWizardUpdateItem = function(idx, field, value) {
    WIZARD_STATE.lineItems[idx][field] = value;
    // 只更新合计 · 避免全 modal 重渲染丢失光标
    const tot = document.getElementById('poWizardStep3Total');
    if (tot) tot.innerHTML = _calcTotal();
  };
  
  window.poWizardSetReq = function(key, value) {
    WIZARD_STATE.specialRequirements[key] = value;
    _renderWizard();
  };
  
  window.poWizardSubmit = function() {
    const items = WIZARD_STATE.lineItems.filter(i => i._checked);
    const supplier = WIZARD_STATE.selectedSupplier || WIZARD_STATE.customSupplierName;
    const r = WIZARD_STATE.specialRequirements;
    
    if (!supplier || items.length === 0 || items.some(i => !i._unitPrice) || !r.voltage || !r.standard) {
      if (typeof toast === 'function') toast('请先完善必填项(回上一步检查)', 'err');
      return;
    }
    
    // 保存到 sessionStorage · 让原 openPoForm 打开后预填
    const preset = {
      timestamp: Date.now(),
      salesOrderId: WIZARD_STATE.so.id,
      supplier: supplier,
      isCustomSupplier: !!WIZARD_STATE.customSupplierName,
      lineItems: items.map(it => ({
        shopify_line_item_id: it.shopify_line_item_id,
        sku: it.sku,
        qty: it._qty,
        price: it._unitPrice,
        note: it._note,
      })),
      specialRequirements: r,
    };
    sessionStorage.setItem('poWizardPreset', JSON.stringify(preset));
    
    closePoWizard();
    
    // 调用原表单 + 仅传选中的 line_items
    const selectedIds = new Set(items.map(it => it.shopify_line_item_id).filter(Boolean));
    if (typeof openPoForm === 'function') {
      openPoForm(preset.salesOrderId, selectedIds.size > 0 ? selectedIds : null);
      // 弹个提示告诉用户 wizard 收集到的字段保存在 sessionStorage 里
      setTimeout(() => {
        if (typeof toast === 'function') {
          toast('💡 已打开正式表单 · Wizard 收集的字段请手动核对 / 复制到表单字段', 'ok', 8000);
        }
      }, 500);
    } else {
      alert('原 PO 表单函数未加载');
    }
  };
  
  // ============ 工具:HTML 转义 ============
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  
})();
