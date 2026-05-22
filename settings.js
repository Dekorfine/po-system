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
    ORDERS.forEach(o => { if (o.supplier && supCounts[o.supplier]) supCounts[o.supplier].o++; });
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

