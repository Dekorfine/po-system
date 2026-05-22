// ============================================================
// 跟单团队工作台 · reset-system.js
// 主管专属：模块化重启系统（软删除 + JSON 备份）
// ============================================================
// 依赖：core.js（sb, DATA, IS_ADMIN, CONFIG, CURRENT_AGENT）
//      业务模块（toast, closeModal, loadAllData, renderActiveTab,
//                shopifyReloadOrdersAndRender）
// ============================================================

// ============================================================
// 📦 模块重启系统（仅主管可用）
// ============================================================

// 可重启模块定义 · 顺序就是 UI 显示顺序
const RESET_MODULES = [
  { key: 'orders',        label: '📋 催单',         table: 'orders',          extraFilter: { col: 'po_number', op: 'is', val: null } },
  { key: 'aftersales',    label: '🔧 售后',         table: 'aftersales' },
  { key: 'issues',        label: '⚠ 供应商问题',    table: 'issues' },
  { key: 'missing',       label: '🔍 找灯',         table: 'missing_lights' },
  { key: 'online_pur',    label: '💳 线上采购',     table: 'online_purchases' },
  { key: 'shopify',       label: '📥 销售单',       table: 'shopify_orders',  linked: ['po'],    note: '与采购单联动' },
  { key: 'po',            label: '📦 采购单(PO)',   table: 'orders',          extraFilter: { col: 'po_number', op: 'not_null' }, linked: ['shopify'], note: '与销售单联动' },
  { key: 'products',      label: '📚 产品',         table: 'products' },
];

// 当前选择 & 倒计时状态
const RESET_STATE = {
  selected: new Set(),
  countdownTimer: null,
  countdownRemain: 0,
  counts: {},  // 每个模块当前数据量
};

// 打开重启面板：拉取每个模块的实时数据量
async function openResetPanel() {
  if (!IS_ADMIN) { toast('只有主管能使用此功能', 'err'); return; }
  // 重置状态
  RESET_STATE.selected.clear();
  RESET_STATE.counts = {};
  // 清空确认输入和按钮状态
  const inp = document.getElementById('resetConfirmInput');
  if (inp) inp.value = '';
  const cs = document.getElementById('resetConfirmStep');
  if (cs) cs.style.display = 'none';
  _resetUpdateExecuteBtn(false);

  // 占位 UI
  document.getElementById('resetModulesList').innerHTML = '<div style="padding: 14px; color: var(--text-tertiary); font-size: 12px;">正在统计各模块数据量...</div>';
  document.getElementById('resetPanelModal').classList.add('show');

  // 拉取每个模块的"非删除"数据量
  for (const mod of RESET_MODULES) {
    try {
      let q = sb.from(mod.table).select('*', { count: 'exact', head: true }).is('deleted_at', null);
      if (mod.extraFilter) {
        if (mod.extraFilter.op === 'is') q = q.is(mod.extraFilter.col, mod.extraFilter.val);
        else if (mod.extraFilter.op === 'not_null') q = q.not(mod.extraFilter.col, 'is', null);
      }
      const { count, error } = await q;
      if (error) {
        console.warn(`统计 ${mod.label} 失败:`, error);
        RESET_STATE.counts[mod.key] = '?';
      } else {
        RESET_STATE.counts[mod.key] = count || 0;
      }
    } catch (e) {
      console.warn(`统计 ${mod.label} 异常:`, e);
      RESET_STATE.counts[mod.key] = '?';
    }
  }

  _renderResetModulesList();
  _resetUpdateSummary();
}

function _renderResetModulesList() {
  const wrap = document.getElementById('resetModulesList');
  if (!wrap) return;
  wrap.innerHTML = RESET_MODULES.map(mod => {
    const cnt = RESET_STATE.counts[mod.key];
    const hasData = typeof cnt === 'number' && cnt > 0;
    const checked = RESET_STATE.selected.has(mod.key);
    const inUseTag = hasData ? '<span style="font-size: 10px; padding: 1px 6px; background: rgba(202,138,4,0.15); color: var(--warning, #ca8a04); border-radius: 3px; font-weight: 600; margin-left: 6px;">已使用</span>' : '';
    const linkedTag = mod.note ? `<span style="font-size: 10px; color: var(--text-tertiary); margin-left: 6px;">↔ ${escapeHtml(mod.note)}</span>` : '';
    return `
      <label style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: ${checked ? 'rgba(220,38,38,0.05)' : 'var(--bg-card)'}; border: 1px solid ${checked ? 'var(--danger, #dc2626)' : 'var(--border)'}; border-radius: 6px; cursor: pointer; transition: all 0.15s;">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="resetPanelToggleModule('${mod.key}', this.checked)">
        <span style="flex: 1; font-size: 13px;">${mod.label}${inUseTag}${linkedTag}</span>
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: ${hasData ? 'var(--danger, #dc2626)' : 'var(--text-tertiary)'}; font-weight: 600;">${cnt} 条</span>
      </label>
    `;
  }).join('');
}

function resetPanelToggleModule(key, checked) {
  const mod = RESET_MODULES.find(m => m.key === key);
  if (!mod) return;
  if (checked) RESET_STATE.selected.add(key);
  else RESET_STATE.selected.delete(key);

  // 联动：销售单 ↔ 采购单 必须同时勾选
  if (mod.linked) {
    mod.linked.forEach(linkedKey => {
      if (checked) RESET_STATE.selected.add(linkedKey);
      else RESET_STATE.selected.delete(linkedKey);
    });
  }

  _renderResetModulesList();
  _resetUpdateSummary();
}

function _resetUpdateSummary() {
  const sel = [...RESET_STATE.selected];
  const total = sel.reduce((s, k) => {
    const c = RESET_STATE.counts[k];
    return s + (typeof c === 'number' ? c : 0);
  }, 0);
  document.getElementById('resetSelectedCount').textContent = sel.length;
  document.getElementById('resetTotalRows').textContent = total;

  // 选中且总数>0 时显示确认输入；否则隐藏
  const cs = document.getElementById('resetConfirmStep');
  if (cs) cs.style.display = (sel.length > 0 && total > 0) ? 'block' : 'none';
  if (sel.length === 0 || total === 0) {
    const inp = document.getElementById('resetConfirmInput');
    if (inp) inp.value = '';
    _resetUpdateExecuteBtn(false);
  }
}

// 监听确认词输入
function resetPanelOnConfirmInput(text) {
  const ok = text.trim() === '重启确认';
  _resetUpdateExecuteBtn(ok);
}

// 启用/禁用执行按钮 · 启用时启动 5 秒倒计时
function _resetUpdateExecuteBtn(enable) {
  const btn = document.getElementById('resetExecuteBtn');
  const text = document.getElementById('resetExecuteBtnText');
  if (!btn || !text) return;

  // 清掉旧倒计时
  if (RESET_STATE.countdownTimer) {
    clearInterval(RESET_STATE.countdownTimer);
    RESET_STATE.countdownTimer = null;
  }

  if (!enable) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    text.textContent = '⚠ 我已确认，开始重启';
    return;
  }

  // 启用倒计时（5 秒后才能点）
  RESET_STATE.countdownRemain = 5;
  btn.disabled = true;
  btn.style.opacity = '0.7';
  text.textContent = `⚠ 请等待 ${RESET_STATE.countdownRemain} 秒后可点击`;
  RESET_STATE.countdownTimer = setInterval(() => {
    RESET_STATE.countdownRemain--;
    if (RESET_STATE.countdownRemain <= 0) {
      clearInterval(RESET_STATE.countdownTimer);
      RESET_STATE.countdownTimer = null;
      btn.disabled = false;
      btn.style.opacity = '1';
      text.textContent = '⚠ 我已确认，开始重启';
    } else {
      text.textContent = `⚠ 请等待 ${RESET_STATE.countdownRemain} 秒后可点击`;
    }
  }, 1000);
}

// 执行重启：先 JSON 备份，再软删除
async function resetPanelExecute() {
  if (!IS_ADMIN) { toast('只有主管能使用此功能', 'err'); return; }
  const sel = [...RESET_STATE.selected];
  if (sel.length === 0) return;
  // 二次防呆：再 confirm 一次
  const total = sel.reduce((s, k) => s + (RESET_STATE.counts[k] || 0), 0);
  if (!confirm(`最终确认：将 ${total} 条数据移入回收站？\n（30 天后云端永久清除）`)) return;

  const btn = document.getElementById('resetExecuteBtn');
  const text = document.getElementById('resetExecuteBtnText');
  btn.disabled = true; btn.style.opacity = '0.7';

  try {
    // ===== Step 1: 备份 =====
    text.textContent = '📦 正在备份数据...';
    const backup = await _resetCollectBackup(sel);
    _resetDownloadBackup(backup);
    toast('✓ 已下载 JSON 备份到本地', 'info', 2500);

    // ===== Step 2: 软删除 =====
    text.textContent = '🗑 正在标记为已删除...';
    const nowIso = new Date().toISOString();
    const deletedBy = `${CURRENT_AGENT || '主管'}(重启)`;
    let totalAffected = 0;

    for (const key of sel) {
      const mod = RESET_MODULES.find(m => m.key === key);
      if (!mod) continue;
      try {
        let q = sb.from(mod.table).update({ deleted_at: nowIso, deleted_by: deletedBy }).is('deleted_at', null);
        if (mod.extraFilter) {
          if (mod.extraFilter.op === 'is') q = q.is(mod.extraFilter.col, mod.extraFilter.val);
          else if (mod.extraFilter.op === 'not_null') q = q.not(mod.extraFilter.col, 'is', null);
        }
        const { error } = await q;
        if (error) throw error;
        totalAffected += (RESET_STATE.counts[key] || 0);
      } catch (e) {
        console.error(`重启 ${mod.label} 失败:`, e);
        toast(`${mod.label} 重启失败：${e.message || e}`, 'err');
      }
    }

    // ===== Step 3: 收尾 =====
    text.textContent = '🔄 刷新数据...';
    closeModal('resetPanelModal');
    // 重新加载所有数据
    try { await DATA.loadAll(); } catch (e) { console.warn('reload failed:', e); }
    CONFIG = DATA.getConfig();
    loadAllData();
    // shopify_orders 缓存重新拉取
    try {
      if (typeof shopifyReloadOrdersAndRender === 'function') await shopifyReloadOrdersAndRender();
    } catch (e) { console.warn(e); }
    renderActiveTab();
    toast(`✓ 已重启 ${sel.length} 个模块，共 ${totalAffected} 条数据进回收站`, 'info', 5000);
  } catch (err) {
    console.error('重启失败:', err);
    toast('重启失败：' + (err.message || err), 'err');
    btn.disabled = false; btn.style.opacity = '1';
    text.textContent = '⚠ 我已确认，开始重启';
  }
}

// 收集所选模块的所有数据用于备份
async function _resetCollectBackup(moduleKeys) {
  const out = {
    backup_at: new Date().toISOString(),
    backup_by: CURRENT_AGENT || '主管',
    reason: '模块重启前的自动备份',
    modules: {},
  };
  for (const key of moduleKeys) {
    const mod = RESET_MODULES.find(m => m.key === key);
    if (!mod) continue;
    try {
      let q = sb.from(mod.table).select('*').is('deleted_at', null);
      if (mod.extraFilter) {
        if (mod.extraFilter.op === 'is') q = q.is(mod.extraFilter.col, mod.extraFilter.val);
        else if (mod.extraFilter.op === 'not_null') q = q.not(mod.extraFilter.col, 'is', null);
      }
      const { data, error } = await q;
      if (error) throw error;
      out.modules[key] = { label: mod.label, table: mod.table, rows: data || [] };
    } catch (e) {
      console.error(`备份 ${mod.label} 失败:`, e);
      out.modules[key] = { label: mod.label, table: mod.table, error: e.message || String(e), rows: [] };
    }
  }
  return out;
}

// 触发浏览器下载 JSON 备份
function _resetDownloadBackup(backup) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `重启备份_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 旧 resetAll 保留为占位（兼容老调用，但内部转给新面板）
function resetAll() {
  if (IS_ADMIN) openResetPanel();
  else alert('只有主管能使用此功能');
}
