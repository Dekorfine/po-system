// ============================================================
// 跟单团队工作台 · settings.js
// 系统设置 · agent 管理 / 供应商管理 / 评分规则
// ============================================================
// 依赖：core.js · utils.js
// ============================================================

// ============================================================
// Agent Picker + Settings + Utils
// ============================================================
function openAgentPicker() {
  const list = document.getElementById('agentList');
  list.innerHTML = CONFIG.agents.map((a, i) => {
    const oCount = DATA.getOrders(a.name).length;
    const aCount = DATA.getAftersales(a.name).length;
    const sites = a.sites || [];
    return `
      <div class="agent-option" onclick="loginAs('${a.name.replace(/'/g, "\\'")}')">
        <div class="av ${a.isAdmin ? 'admin' : 'c' + (i % 4)}">${a.name[0].toUpperCase()}</div>
        <div style="flex: 1; min-width: 0;">
          <div class="nm">${escapeHtml(a.name)}${a.isAdmin ? '<span class="admin-tag">主管</span>' : ''}</div>
          <div class="ml">${oCount} 催单 · ${aCount} 售后</div>
          ${sites.length > 0 ? `<div class="agent-sites">${sites.map(s => `<span class="site-mini">${escapeHtml(s)}</span>`).join('')}</div>` : '<div class="ml" style="color: var(--text-tertiary);">未分配网站</div>'}
        </div>
      </div>
    `;
  }).join('');
  
  // 渲染新增跟单员的网站勾选
  const grid = document.getElementById('newAgentSitesGrid');
  if (grid) {
    grid.innerHTML = (CONFIG.sites || []).map(s => `
      <label class="site-checkbox-item">
        <input type="checkbox" value="${escapeHtml(s)}" onchange="this.parentElement.classList.toggle('checked', this.checked)">
        ${escapeHtml(s)}
      </label>
    `).join('');
  }
  
  document.getElementById('agentModal').classList.add('show');
}

function addAgent() {
  const input = document.getElementById('newAgentName');
  const name = input.value.trim();
  if (!name) return;
  alert(`新增跟单员需要两步（云端版）：

1. 在 Supabase Dashboard → Authentication → Add user 创建邮箱密码账号
2. 复制 user 的 UID，回到 SQL Editor 跑：

INSERT INTO agents (user_id, name, is_admin, sites, modules) VALUES (
  'UID 粘贴这里',
  '${name}',
  FALSE,
  '[]'::jsonb,
  '["orders","aftersales","issues","missing","performance"]'::jsonb
);

完成后让 "${name}" 用邮箱密码登录即可。`);
}

function openSettings() {
  renderSettings();
  // 危险操作区只主管可见
  const dz = document.getElementById('dangerZone');
  if (dz) dz.style.display = IS_ADMIN ? 'block' : 'none';
  document.getElementById('settingsModal').classList.add('show');
}

function renderSettings() {
  // 网站列表
  const sitesEl = document.getElementById('settingsSites');
  if (sitesEl) {
    sitesEl.innerHTML = (CONFIG.sites || []).map(s => `
      <span class="tag-item"><span class="site-badge s-${s}" style="margin:0;">${escapeHtml(s)}</span>
        <button class="row-del" onclick="removeSiteConfig('${s.replace(/'/g, "\\'")}')" style="margin: 0 -4px 0 4px; padding: 0 4px;">✕</button>
      </span>
    `).join('');
  }
  
  // 跟单员 + 网站 + 模块分配
  const agentsListEl = document.getElementById('settingsAgentsList');
  if (agentsListEl) {
    agentsListEl.innerHTML = CONFIG.agents.map((a, agentIdx) => {
      const sites = a.sites || [];
      const modules = a.isAdmin ? ALL_MODULE_KEYS : (a.modules || ALL_MODULE_KEYS);
      return `
        <div class="agent-setting-row">
          <div class="head">
            <div>
              <span class="name">${escapeHtml(a.name)}${a.isAdmin ? '<span class="admin-tag" style="margin-left:4px;">主管</span>' : ''}${a.name === CURRENT_AGENT ? ' ★' : ''}</span>
              <div class="info">${sites.length} 个网站 · ${a.isAdmin ? '全部模块（主管）' : modules.length + ' 个可见模块'}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="row-del" onclick="renameAgent(${agentIdx})" style="padding: 4px 10px; background: rgba(37,99,235,0.08); color: var(--accent); border: 1px solid rgba(37,99,235,0.2); border-radius: 5px; font-weight: 600; font-size: 11px; cursor: pointer;" title="给跟单员改名">✏️ 改名</button>
              ${a.name !== CURRENT_AGENT ? `<button class="row-del" onclick="removeAgent('${a.name.replace(/'/g, "\\'")}')" style="padding: 4px 8px;">✕ 删除</button>` : ''}
            </div>
          </div>
          
          <div style="font-size: 10.5px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 8px; margin-bottom: 6px; font-weight: 600;">📍 负责网站</div>
          <div class="sites-checkbox-grid">
            ${(CONFIG.sites || []).map(s => {
              const checked = sites.includes(s);
              return `<label class="site-checkbox-item ${checked ? 'checked' : ''}" data-site="${escapeHtml(s)}">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleAgentSite(${agentIdx}, '${s.replace(/'/g, "\\'")}', this.checked); this.parentElement.classList.toggle('checked', this.checked)">
                ${escapeHtml(s)}
              </label>`;
            }).join('')}
          </div>
          
          <div style="font-size: 10.5px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 12px; margin-bottom: 6px; font-weight: 600;">📦 可见模块${a.isAdmin ? '（主管默认全部）' : ''}</div>
          <div class="modules-checkbox-grid">
            ${ALL_MODULES.map(mod => {
              const checked = a.isAdmin ? true : modules.includes(mod.key);
              return `<label class="module-checkbox-item ${checked ? 'checked' : ''}">
                <input type="checkbox" ${checked ? 'checked' : ''} ${a.isAdmin ? 'disabled' : ''} onchange="toggleAgentModule(${agentIdx}, '${mod.key}', this.checked); this.parentElement.classList.toggle('checked', this.checked)">
                ${mod.label}
              </label>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }
  
  // 供应商列表（按热度排序 + 显示活动数）
  const supEl = document.getElementById('settingsSuppliers');
  const supCount = document.getElementById('suppliersCount');
  if (supEl) {
    // 计算每个供应商的活动数
    const supCounts = {};
    CONFIG.suppliers.forEach(s => { if (s) supCounts[s] = { o: 0, a: 0, i: 0 }; });
    // V3：用 CHASE_ORDERS（PO 派生）
    const __srcOrders = (typeof CHASE_ORDERS !== 'undefined' && CHASE_ORDERS.length > 0) ? CHASE_ORDERS : ORDERS;
    __srcOrders.forEach(o => { if (o.supplier && supCounts[o.supplier]) supCounts[o.supplier].o++; });
    AFTERSALES.forEach(a => { if (a.supplier && supCounts[a.supplier]) supCounts[a.supplier].a++; });
    ISSUES.forEach(it => { if (it.supplier && supCounts[it.supplier]) supCounts[it.supplier].i++; });
    
    // 按热度排序：订单 + 售后 + 问题×2
    const sortedSuppliers = [...CONFIG.suppliers].sort((a, b) => {
      const ca = supCounts[a] || {o:0,a:0,i:0}, cb = supCounts[b] || {o:0,a:0,i:0};
      const ha = ca.o + ca.a + ca.i * 2;
      const hb = cb.o + cb.a + cb.i * 2;
      if (ha !== hb) return hb - ha;
      return a.localeCompare(b, 'zh-CN');
    });
    
    supEl.innerHTML = sortedSuppliers.map(s => {
      const c = supCounts[s] || {o:0,a:0,i:0};
      const total = c.o + c.a + c.i;
      const isHot = total >= 5;
      const hasIssue = c.i > 0;
      const badge = total > 0 
        ? `<span style="font-size:9.5px; color: var(--text-tertiary); margin: 0 4px;">订${c.o}/售${c.a}/问${c.i}</span>`
        : '';
      const cls = hasIssue ? ' has-issue' : isHot ? ' is-hot' : '';
      return `<span class="tag-item${cls}">${escapeHtml(s)}${badge}
        <button class="row-del" onclick="removeSupplier('${s.replace(/'/g, "\\'")}')" style="margin: 0 -4px 0 4px; padding: 0 4px;">✕</button>
      </span>`;
    }).join('');
    
    if (supCount) supCount.textContent = `（共 ${CONFIG.suppliers.length} 家，按合作量排序）`;
  }

  // === V3：催单阈值编辑（仅主管可见）===
  const chaseWrap = document.getElementById('settingsChaseThresholds');
  if (chaseWrap) {
    chaseWrap.style.display = IS_ADMIN ? 'block' : 'none';
    if (IS_ADMIN) {
      const list = (typeof DATA !== 'undefined' && DATA.getChaseThresholds) ? DATA.getChaseThresholds() : [3, 7, 15, 30];
      // V20260603:默认待催阈值当前值
      const ddInput = document.getElementById('chaseDefaultDays');
      const ddHint = document.getElementById('chaseDefaultDaysHint');
      const curDef = (typeof DATA !== 'undefined' && DATA.getChaseDefaultDays) ? DATA.getChaseDefaultDays() : 0;
      if (ddInput && document.activeElement !== ddInput) ddInput.value = curDef || '';
      if (ddHint) ddHint.innerHTML = curDef > 0
        ? `当前:催单页默认只显示<b>下单 ≥ ${curDef} 天</b>还没到货的单`
        : `当前:<b>显示全部</b>(未启用默认过滤)`;
      // V20260604:付运费单阈值当前值
      const fdInput = document.getElementById('chaseFreightDays');
      const fdHint = document.getElementById('chaseFreightDaysHint');
      const curFd = (typeof DATA !== 'undefined' && DATA.getChaseFreightDays) ? DATA.getChaseFreightDays() : 3;
      if (fdInput && document.activeElement !== fdInput) fdInput.value = curFd;
      if (fdHint) fdHint.innerHTML = `当前:付运费单<b>下单 ≥ ${curFd} 天</b>就进催单(比普通单更早)`;
      const tagsEl = document.getElementById('chaseThresholdsTags');
      if (tagsEl) {
        tagsEl.innerHTML = list.map(d => `
          <span class="tag-item" style="background: rgba(202,138,4,0.08); border-color: rgba(202,138,4,0.3); color: var(--warning, #ca8a04); font-weight: 600;">
            ⏰ ${d} 天
            <button class="row-del" onclick="removeChaseThreshold(${d})" style="margin: 0 -4px 0 4px; padding: 0 4px;">✕</button>
          </span>
        `).join('') || '<span style="color:var(--text-tertiary); font-size:11px;">（未设置阈值时使用默认 3/7/15/30 天）</span>';
      }
    }
  }
}

// === V3：催单阈值管理 ===
async function addChaseThreshold() {
  if (!IS_ADMIN) { toast('只有主管能修改阈值', 'err'); return; }
  const input = document.getElementById('newChaseThreshold');
  const v = parseInt((input?.value || '').trim());
  if (!v || v <= 0 || v > 365) { toast('请输入 1-365 之间的天数', 'warn'); return; }
  const current = DATA.getChaseThresholds();
  if (current.includes(v)) { toast(`${v} 天已存在`, 'warn'); return; }
  try {
    await DATA.saveChaseThresholds([...current, v]);
    if (input) input.value = '';
    toast(`✓ 已新增阈值 ⏰ ${v} 天`);
    renderSettings();
    // 如果催单 tab 开着，刷新 chip
    if (typeof renderChaseThresholdChips === 'function') renderChaseThresholdChips();
  } catch (err) {
    console.error(err);
    toast('保存失败：' + (err.message || err), 'err');
  }
}

async function removeChaseThreshold(days) {
  if (!IS_ADMIN) { toast('只有主管能修改阈值', 'err'); return; }
  const current = DATA.getChaseThresholds();
  if (current.length <= 1) { toast('至少要保留 1 个阈值', 'warn'); return; }
  if (!confirm(`移除「${days} 天」这个催单阈值？`)) return;
  try {
    await DATA.saveChaseThresholds(current.filter(d => d !== days));
    toast(`✓ 已移除 ⏰ ${days} 天`);
    renderSettings();
    if (typeof renderChaseThresholdChips === 'function') renderChaseThresholdChips();
  } catch (err) {
    console.error(err);
    toast('保存失败：' + (err.message || err), 'err');
  }
}

async function setChaseFreightDays() {
  if (!IS_ADMIN) { toast('只有主管能修改', 'err'); return; }
  const input = document.getElementById('chaseFreightDays');
  const v = parseInt((input?.value || '3').trim());
  if (isNaN(v) || v < 0 || v > 365) { toast('请输入 0-365 之间的天数', 'warn'); return; }
  try {
    await DATA.saveChaseFreightDays(v);
    toast(`✓ 付运费单待催阈值已设为 ${v} 天(全员生效)`);
    if (typeof renderOrders === 'function') renderOrders();
    renderSettings();
  } catch (err) {
    console.error(err);
    toast('保存失败:' + (err.message || err), 'err');
  }
}

async function setChaseDefaultDays() {
  if (!IS_ADMIN) { toast('只有主管能修改', 'err'); return; }
  const input = document.getElementById('chaseDefaultDays');
  const v = parseInt((input?.value || '0').trim()) || 0;
  if (v < 0 || v > 365) { toast('请输入 0-365 之间的天数(0=显示全部)', 'warn'); return; }
  try {
    await DATA.saveChaseDefaultDays(v);
    toast(v > 0 ? `✓ 默认待催阈值已设为 ${v} 天(全员生效)` : '✓ 已关闭默认过滤(显示全部)');
    // 立即套用到催单页
    if (typeof _chaseThresholdFilter !== 'undefined') { _chaseThresholdFilter = v; }
    if (typeof _chaseDefaultApplied !== 'undefined') { _chaseDefaultApplied = true; }
    if (typeof renderOrders === 'function') renderOrders();
    if (typeof renderChaseThresholdChips === 'function') renderChaseThresholdChips();
    renderSettings();
  } catch (err) {
    console.error(err);
    toast('保存失败:' + (err.message || err), 'err');
  }
}

async function toggleAgentModule(agentIdx, moduleKey, checked) {
  const agent = CONFIG.agents[agentIdx];
  if (!agent || agent.isAdmin) return;
  if (!agent.modules) agent.modules = [...ALL_MODULE_KEYS];
  if (checked) {
    if (!agent.modules.includes(moduleKey)) agent.modules.push(moduleKey);
  } else {
    agent.modules = agent.modules.filter(m => m !== moduleKey);
  }
  try {
    await DATA.saveConfig(CONFIG);
    const modLabel = (ALL_MODULES.find(m => m.key === moduleKey) || {}).label || moduleKey;
    toast(`✓ ${agent.name} 的「${modLabel}」权限已${checked ? '开启' : '关闭'}并同步`);
  } catch (err) {
    console.error('权限同步失败:', err);
    toast('权限同步失败：' + (err.message || err), 'err');
  }
  // 如果是当前用户被改了，立即生效
  if (agent.name === CURRENT_AGENT) {
    applyModuleVisibility();
  }
}

function addSiteConfig() {
  const input = document.getElementById('newSite');
  const val = (input.value || '').trim().toUpperCase();
  if (!val) return;
  if (!CONFIG.sites) CONFIG.sites = [];
  if (CONFIG.sites.includes(val)) { toast('已存在', 'warn'); return; }
  CONFIG.sites.push(val);
  DATA.saveConfig(CONFIG);
  input.value = '';
  renderSettings();
  refreshSiteDropdowns();
}

function removeSiteConfig(name) {
  if (!confirm(`删除网站 "${name}"？已有的订单/售后数据不会受影响。`)) return;
  CONFIG.sites = (CONFIG.sites || []).filter(s => s !== name);
  // 从每个 agent 的 sites 中也移除
  CONFIG.agents.forEach(a => {
    if (a.sites) a.sites = a.sites.filter(s => s !== name);
  });
  DATA.saveConfig(CONFIG);
  renderSettings();
  refreshSiteDropdowns();
}

function toggleAgentSite(agentIdx, site, checked) {
  const agent = CONFIG.agents[agentIdx];
  if (!agent) return;
  if (!agent.sites) agent.sites = [];
  if (checked) {
    if (!agent.sites.includes(site)) agent.sites.push(site);
  } else {
    agent.sites = agent.sites.filter(s => s !== site);
  }
  DATA.saveConfig(CONFIG);
  // 当前用户被改了网站，同步刷新 UI
  if (agent.name === CURRENT_AGENT) {
    loginAs(CURRENT_AGENT);
  }
}

function addSupplierConfig() {
  const input = document.getElementById('newSupplier');
  const val = input.value.trim();
  if (!val) return;
  if (CONFIG.suppliers.includes(val)) { toast('已存在', 'warn'); return; }
  CONFIG.suppliers.push(val);
  DATA.saveConfig(CONFIG);
  input.value = '';
  renderSettings();
  refreshAllSupplierDropdowns();
}

// ============ 供应商批量导入 ============
function openSupplierImport() {
  const ta = document.getElementById('supplierImportText');
  const prev = document.getElementById('supplierImportPreview');
  if (ta) ta.value = '';
  if (prev) prev.style.display = 'none';
  const modal = document.getElementById('supplierImportModal');
  if (modal) modal.classList.add('show');
}

// 解析批量导入文本 → 拆分 + 去重 + 分类（新增/已存在）
function _parseSupplierImport() {
  const text = (document.getElementById('supplierImportText')?.value || '').trim();
  if (!text) return { all: [], toAdd: [], duplicates: [] };
  // 按 换行 / 逗号 / 分号 / Tab 分隔（中英文逗号都支持）
  const raw = text.split(/[\n\r,，;；\t]+/).map(s => s.trim()).filter(Boolean);
  // 文本内去重
  const seen = new Set();
  const all = [];
  for (const s of raw) {
    if (!seen.has(s)) { seen.add(s); all.push(s); }
  }
  // 区分新增 / 已存在
  const existing = new Set(CONFIG.suppliers || []);
  const toAdd = all.filter(s => !existing.has(s));
  const duplicates = all.filter(s => existing.has(s));
  return { all, toAdd, duplicates };
}

function previewSupplierImport() {
  const { all, toAdd, duplicates } = _parseSupplierImport();
  const prev = document.getElementById('supplierImportPreview');
  const txt = document.getElementById('supplierImportPreviewText');
  if (!prev || !txt) return;
  if (all.length === 0) {
    prev.style.display = 'block';
    txt.innerHTML = '<span style="color:var(--text-tertiary);">未识别到有效内容</span>';
    return;
  }
  prev.style.display = 'block';
  txt.innerHTML = `
    📊 共识别 <b>${all.length}</b> 个 · 
    将新增 <b style="color:var(--success,#16a34a);">${toAdd.length}</b> 个 · 
    跳过 <b style="color:var(--text-tertiary);">${duplicates.length}</b> 个已存在
    ${toAdd.length > 0 ? `<div style="margin-top:6px; max-height: 100px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; color: var(--text-secondary);">新增预览：${toAdd.slice(0, 50).map(escapeHtml).join('、')}${toAdd.length > 50 ? `... 等 ${toAdd.length} 个` : ''}</div>` : ''}
  `;
}

async function confirmSupplierImport() {
  const { all, toAdd, duplicates } = _parseSupplierImport();
  if (all.length === 0) { toast('请先粘贴供应商名单', 'warn'); return; }
  if (toAdd.length === 0) { toast(`所有 ${all.length} 个供应商都已存在，无需导入`, 'warn'); return; }
  if (!confirm(`确认导入 ${toAdd.length} 个新供应商？\n（${duplicates.length} 个已存在的会跳过）`)) return;
  if (!CONFIG.suppliers) CONFIG.suppliers = [];
  CONFIG.suppliers.push(...toAdd);
  try {
    await DATA.saveConfig(CONFIG);
    toast(`✓ 已导入 ${toAdd.length} 个新供应商`);
    closeModal('supplierImportModal');
    renderSettings();
    refreshAllSupplierDropdowns();
  } catch (err) {
    console.error('供应商导入同步失败:', err);
    toast('导入云端同步失败：' + (err.message || err), 'err');
  }
}

function removeSupplier(name) {
  CONFIG.suppliers = CONFIG.suppliers.filter(s => s !== name);
  DATA.saveConfig(CONFIG);
  renderSettings();
  refreshAllSupplierDropdowns();
}

async function renameAgent(agentIdx) {
  const agent = CONFIG.agents[agentIdx];
  if (!agent) return;
  
  const newName = await showPrompt({
    title: `修改 "${agent.name}" 的显示姓名`,
    message: '💡 用途：改成中文名字、改英文名字、或跟单离职后给新人接管时改名。\n⚠ 只改显示名，登录邮箱和密码不变。历史数据自动跟着新名字走，不会丢。',
    field: { label: '新姓名', value: agent.name, placeholder: '如：王思雨' },
  });
  
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === agent.name) return;
  
  if (CONFIG.agents.find(a => a.name === trimmed)) {
    toast('已有同名跟单员，请用别的名字', 'warn');
    return;
  }
  
  try {
    // 1. 更新 Supabase 的 agents 表
    if (agent._userId) {
      const { error } = await sb.from('agents').update({ name: trimmed }).eq('user_id', agent._userId);
      if (error) throw error;
    }
    
    // 2. 更新内存中的 agent 记录
    const oldName = agent.name;
    agent.name = trimmed;
    
    // 3. 重命名 _cache 里以旧名字为 key 的数据
    ['ordersByAgent', 'aftersalesByAgent', 'issuesByAgent'].forEach(k => {
      if (DATA._cache[k][oldName]) {
        DATA._cache[k][trimmed] = DATA._cache[k][oldName];
        delete DATA._cache[k][oldName];
      }
    });
    
    // 4. 如果改的是当前登录用户，更新 CURRENT_AGENT + 顶部显示
    if (CURRENT_AGENT === oldName) {
      CURRENT_AGENT = trimmed;
    }
    
    // 5. 重新加载全部数据 + 刷新所有 UI
    loadAllData();
    renderSettings();
    
    if (CURRENT_AGENT === trimmed) loginAs(trimmed);
    else renderActiveTab();
    
    toast(`✓ 已改名：${oldName} → ${trimmed}`);
  } catch (err) {
    console.error(err);
    toast('改名失败：' + (err.message || err), 'err');
  }
}

function removeAgent(name) {
  if (name === CURRENT_AGENT) { toast('不能删除当前账号', 'err'); return; }
  if (!confirm(`删除 "${name}" 会同时删除其所有数据（催单/售后/问题），确定？`)) return;
  CONFIG.agents = CONFIG.agents.filter(a => a.name !== name);
  DATA.saveConfig(CONFIG);
  ['orders', 'aftersales', 'issues'].forEach(k => localStorage.removeItem(`po_${k}_${name}`));
  renderSettings();
}


// ============================================================
// V4-2026-05-24: 老板专属 - 用户管理界面
// 老板能改任何人的:岗位/sites/modules/is_admin/is_boss
// ============================================================

// 注入 CSS
(function _injectBossPanelCSS() {
  if (document.getElementById('boss-panel-style')) return;
  const s = document.createElement('style');
  s.id = 'boss-panel-style';
  s.textContent = `
    /* 老板入口按钮 */
    .boss-mgmt-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 2px 6px rgba(245,158,11,0.3);
      transition: transform 0.12s;
    }
    .boss-mgmt-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(245,158,11,0.4);
    }
    
    /* 老板管理 modal */
    #bossPanelModal {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 9998;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 30px 16px;
      overflow-y: auto;
    }
    #bossPanelModal.show { display: flex; }
    .bpm-card {
      background: white;
      border-radius: 14px;
      width: 100%;
      max-width: 920px;
      padding: 28px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.35);
      position: relative;
    }
    .bpm-close {
      position: absolute; top: 14px; right: 14px;
      width: 32px; height: 32px;
      border: none; background: transparent;
      cursor: pointer; font-size: 18px;
      color: #6b7280; border-radius: 6px;
    }
    .bpm-close:hover { background: #fee2e2; color: #dc2626; }
    .bpm-header {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 2px solid #fde68a;
    }
    .bpm-header h2 {
      margin: 0; font-size: 20px; color: #111827;
    }
    .bpm-header .bpm-subtitle {
      color: #6b7280; font-size: 13px;
    }
    .bpm-agent-row {
      display: grid;
      grid-template-columns: 50px 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 14px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .bpm-agent-row.is-boss {
      border-color: #f59e0b;
      background: linear-gradient(to right, #fffbeb, white 30%);
    }
    .bpm-agent-row.is-admin:not(.is-boss) {
      border-color: #2563eb;
      background: linear-gradient(to right, #eff6ff, white 30%);
    }
    .bpm-avatar {
      width: 50px; height: 50px;
      border-radius: 50%;
      background: #e5e7eb;
      color: #6b7280;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700;
    }
    .bpm-avatar.boss { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; }
    .bpm-avatar.admin { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; }
    .bpm-info { min-width: 0; }
    .bpm-name {
      font-size: 16px; font-weight: 700; color: #111827;
      display: flex; align-items: center; gap: 8px;
    }
    .bpm-role-tag {
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
    }
    .bpm-role-tag.boss { background: #fef3c7; color: #92400e; }
    .bpm-role-tag.admin { background: #dbeafe; color: #1e40af; }
    .bpm-role-tag.staff { background: #f3f4f6; color: #4b5563; }
    .bpm-stats {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    .bpm-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .bpm-action-btn {
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .bpm-action-btn:hover { background: #f3f4f6; }
    .bpm-action-btn.active { 
      background: #2563eb; color: white; border-color: #2563eb;
    }
    .bpm-action-btn.danger { color: #dc2626; border-color: #fecaca; }
    .bpm-action-btn.danger:hover { background: #fee2e2; }
    
    /* 编辑详情 modal */
    .bpm-edit-section {
      margin-top: 16px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .bpm-edit-title {
      font-size: 12px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 10px;
      letter-spacing: 0.5px;
    }
    .bpm-checkbox-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 8px;
    }
    .bpm-checkbox {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      user-select: none;
    }
    .bpm-checkbox:hover { border-color: #93c5fd; }
    .bpm-checkbox.checked {
      background: #eff6ff;
      border-color: #2563eb;
      color: #1d4ed8;
      font-weight: 600;
    }
    .bpm-checkbox input { margin: 0; }
  `;
  document.head.appendChild(s);
})();

// 注入老板入口按钮到顶栏
(function _injectBossButton() {
  const tryInject = () => {
    if (document.getElementById('bossPanelBtn')) {
      console.log('[boss] 按钮已存在,跳过');
      return true;
    }
    // 只有老板能看到
    if (typeof IS_BOSS === 'undefined' || !IS_BOSS) {
      return false;  // 等登录完成
    }
    
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) {
      console.warn('[boss] 找不到 .header-actions,稍后重试');
      return false;
    }
    
    const btn = document.createElement('button');
    btn.id = 'bossPanelBtn';
    btn.className = 'boss-mgmt-btn';
    btn.type = 'button';
    btn.onclick = openBossPanel;
    btn.innerHTML = `👑 用户管理`;
    // 强制 inline style 覆盖缓存
    btn.style.cssText = `
      position: static !important;
      display: inline-flex !important;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 2px 6px rgba(245,158,11,0.3);
      vertical-align: middle;
      margin: 0 4px;
      top: auto !important;
      right: auto !important;
    `;
    
    const searchBtn = headerActions.querySelector('#globalSearchBtn');
    if (searchBtn && searchBtn.nextSibling) {
      headerActions.insertBefore(btn, searchBtn.nextSibling);
    } else {
      const agentPill = headerActions.querySelector('#agentPill');
      if (agentPill && agentPill.nextSibling) {
        headerActions.insertBefore(btn, agentPill.nextSibling);
      } else {
        headerActions.insertBefore(btn, headerActions.firstChild);
      }
    }
    
    console.log('[boss] ✓ 老板按钮已注入到顶栏');
    
    if (!document.getElementById('bossPanelModal')) {
      const modal = document.createElement('div');
      modal.id = 'bossPanelModal';
      document.body.appendChild(modal);
    }
    return true;
  };
  
  const retry = (count = 0) => {
    if (tryInject()) return;
    if (count < 30) {  // 重试 30 次(老板可能登录慢一点)
      setTimeout(() => retry(count + 1), 1000);
    }
  };
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    retry();
  } else {
    document.addEventListener('DOMContentLoaded', () => retry());
  }
})();

// 打开老板管理面板
function openBossPanel() {
  if (!IS_BOSS) { toast('仅老板可用', 'warn'); return; }
  
  const modal = document.getElementById('bossPanelModal');
  if (!modal) return;
  
  const ALL_MODULES = (typeof ALL_MODULE_KEYS !== 'undefined') 
    ? ALL_MODULE_KEYS 
    : ['sales','po','orders','missing','purchases','aftersales','issues','finance','products','consolidation','performance','meetings'];
  
  const MODULE_LABELS = {
    sales: '销售单', po: '采购单', orders: '催单', missing: '找灯',
    purchases: '线上采购', aftersales: '售后', issues: '供应商问题',
    finance: '财务收货', products: '产品', consolidation: '合箱',
    performance: '绩效', meetings: '会议要点',
  };
  
  const SITES = ['VK','DF','DC','PL','RD','MH','LS','MJ','RS'];
  
  modal.classList.add('show');
  modal.innerHTML = `
    <div class="bpm-card">
      <button class="bpm-close" onclick="closeBossPanel()">✕</button>
      <div class="bpm-header">
        <span style="font-size:28px;">👑</span>
        <div>
          <h2>用户管理</h2>
          <div class="bpm-subtitle">老板专属 · 改任何人的岗位/权限/模块/网站</div>
        </div>
      </div>
      <div id="bossAgentList"></div>
    </div>
  `;
  
  _renderBossAgentList(ALL_MODULES, MODULE_LABELS, SITES);
}

function closeBossPanel() {
  document.getElementById('bossPanelModal')?.classList.remove('show');
}

function _renderBossAgentList(ALL_MODULES, MODULE_LABELS, SITES) {
  const list = document.getElementById('bossAgentList');
  if (!list || !CONFIG.agents) return;
  
  list.innerHTML = CONFIG.agents.map(a => {
    const isBoss = !!a.isBoss;
    const isAdmin = !!a.isAdmin;
    const role = isBoss ? '👑 老板' : (isAdmin ? '👔 主管' : '👤 员工');
    const roleClass = isBoss ? 'boss' : (isAdmin ? 'admin' : 'staff');
    const oCount = (typeof DATA !== 'undefined') ? DATA.getOrders(a.name).length : 0;
    const aCount = (typeof DATA !== 'undefined') ? DATA.getAftersales(a.name).length : 0;
    
    return `
      <div class="bpm-agent-row ${isBoss ? 'is-boss' : ''} ${isAdmin && !isBoss ? 'is-admin' : ''}">
        <div class="bpm-avatar ${roleClass}">${(a.name || '?')[0].toUpperCase()}</div>
        <div class="bpm-info">
          <div class="bpm-name">
            ${escapeHtml(a.name)}
            <span class="bpm-role-tag ${roleClass}">${role}</span>
          </div>
          <div class="bpm-stats">
            ${oCount} 催单 · ${aCount} 售后 · ${(a.sites || []).length} 个网站 · ${(a.modules || []).length} 个模块
          </div>
        </div>
        <div class="bpm-actions">
          <button class="bpm-action-btn" onclick="_bossToggleRole('${escapeHtml(a.name)}', 'boss')" title="切换老板权限">
            ${isBoss ? '✓ 老板' : '设为老板'}
          </button>
          <button class="bpm-action-btn" onclick="_bossToggleRole('${escapeHtml(a.name)}', 'admin')" title="切换主管权限">
            ${isAdmin ? '✓ 主管' : '设为主管'}
          </button>
          <button class="bpm-action-btn" onclick="_bossEditAgent('${escapeHtml(a.name)}')">⚙️ 详细</button>
          ${a.name !== CURRENT_AGENT ? `<button class="bpm-action-btn danger" onclick="_bossRemoveAgent('${escapeHtml(a.name)}')">🗑</button>` : ''}
        </div>
        <div id="bossEdit-${escapeHtml(a.name)}" style="grid-column: 1 / -1; display:none;">
          <div class="bpm-edit-section">
            <div class="bpm-edit-title">🌍 可访问的网站</div>
            <div class="bpm-checkbox-grid">
              ${SITES.map(s => {
                const checked = (a.sites || []).includes(s);
                return `
                  <label class="bpm-checkbox ${checked ? 'checked' : ''}" onclick="_bossToggleSite('${escapeHtml(a.name)}', '${s}', event)">
                    <input type="checkbox" ${checked ? 'checked' : ''} onclick="event.stopPropagation()" onchange="_bossToggleSite('${escapeHtml(a.name)}', '${s}', event)">
                    ${s}
                  </label>
                `;
              }).join('')}
            </div>
          </div>
          <div class="bpm-edit-section">
            <div class="bpm-edit-title">📦 可访问的模块</div>
            <div class="bpm-checkbox-grid">
              ${ALL_MODULES.map(m => {
                const checked = (a.modules || []).includes(m);
                const label = MODULE_LABELS[m] || m;
                return `
                  <label class="bpm-checkbox ${checked ? 'checked' : ''}" onclick="_bossToggleModule('${escapeHtml(a.name)}', '${m}', event)">
                    <input type="checkbox" ${checked ? 'checked' : ''} onclick="event.stopPropagation()" onchange="_bossToggleModule('${escapeHtml(a.name)}', '${m}', event)">
                    ${label}
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function _bossToggleRole(name, type) {
  if (!IS_BOSS) return;
  const agent = CONFIG.agents.find(a => a.name === name);
  if (!agent) return;
  
  const updates = {};
  if (type === 'boss') {
    const newVal = !agent.isBoss;
    updates.is_boss = newVal;
    // 老板自动也是主管
    if (newVal) updates.is_admin = true;
    if (!confirm(`确定将「${name}」${newVal ? '设为' : '取消'}老板?\n\n${newVal ? '设为老板后可以管理所有员工。' : ''}`)) return;
  } else if (type === 'admin') {
    const newVal = !agent.isAdmin;
    updates.is_admin = newVal;
    // 取消主管时同时取消老板
    if (!newVal) updates.is_boss = false;
    if (!confirm(`确定将「${name}」${newVal ? '设为' : '取消'}主管?`)) return;
  }
  
  try {
    const { error } = await sb.from('agents').update(updates).eq('user_id', agent._userId);
    if (error) throw error;
    
    // 更新本地缓存
    if ('is_boss' in updates) agent.isBoss = updates.is_boss;
    if ('is_admin' in updates) agent.isAdmin = updates.is_admin;
    
    toast(`✓ 已更新 ${name} 的权限`);
    openBossPanel();  // 重新渲染
  } catch (e) {
    console.error('更新权限失败:', e);
    toast('更新失败: ' + (e.message || e), 'err');
  }
}

function _bossEditAgent(name) {
  const detail = document.getElementById(`bossEdit-${name}`);
  if (detail) {
    const showing = detail.style.display !== 'none';
    detail.style.display = showing ? 'none' : 'block';
  }
}

async function _bossToggleSite(name, site, event) {
  if (event) event.stopPropagation();
  if (!IS_BOSS) return;
  
  const agent = CONFIG.agents.find(a => a.name === name);
  if (!agent) return;
  
  const sites = [...(agent.sites || [])];
  const idx = sites.indexOf(site);
  if (idx >= 0) sites.splice(idx, 1);
  else sites.push(site);
  
  try {
    const { error } = await sb.from('agents').update({ sites }).eq('user_id', agent._userId);
    if (error) throw error;
    agent.sites = sites;
    toast(`✓ ${name} 网站权限已更新`);
    // 不重新渲染整个 modal,避免折叠
  } catch (e) {
    console.error('更新失败:', e);
    toast('更新失败: ' + (e.message || e), 'err');
  }
}

async function _bossToggleModule(name, mod, event) {
  if (event) event.stopPropagation();
  if (!IS_BOSS) return;
  
  const agent = CONFIG.agents.find(a => a.name === name);
  if (!agent) return;
  
  const modules = [...(agent.modules || [])];
  const idx = modules.indexOf(mod);
  if (idx >= 0) modules.splice(idx, 1);
  else modules.push(mod);
  
  try {
    const { error } = await sb.from('agents').update({ modules }).eq('user_id', agent._userId);
    if (error) throw error;
    agent.modules = modules;
    toast(`✓ ${name} 模块权限已更新`);
  } catch (e) {
    console.error('更新失败:', e);
    toast('更新失败: ' + (e.message || e), 'err');
  }
}

async function _bossRemoveAgent(name) {
  if (!IS_BOSS) return;
  if (!confirm(`确定删除「${name}」?\n\n这只会删除 agents 表的记录,Supabase Auth 用户还在。\n要完全删除需要去 Auth Dashboard 删 user。`)) return;
  
  const agent = CONFIG.agents.find(a => a.name === name);
  if (!agent) return;
  
  try {
    const { error } = await sb.from('agents').delete().eq('user_id', agent._userId);
    if (error) throw error;
    
    // 从本地缓存移除
    CONFIG.agents = CONFIG.agents.filter(a => a.name !== name);
    toast(`✓ 已删除 ${name}`);
    openBossPanel();
  } catch (e) {
    console.error('删除失败:', e);
    toast('删除失败: ' + (e.message || e), 'err');
  }
}
