// ============================================================
// V20260531-HR:HR(人事 · 赵欣)专属模块
// · 月度目标设置(写 hr_monthly_targets)
// · 团队 KPI 总览(读所有 agent 的本月数据)
// · 排名过滤:不显示 role='hr' 的人
// ============================================================

(function() {
  'use strict';
  
  let HR_TARGETS = [];
  
  // ============ 加载月度目标 ============
  async function hrLoadTargets() {
    if (typeof sb === 'undefined') return;
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const { data, error } = await sb
        .from('hr_monthly_targets')
        .select('*')
        .eq('year', y)
        .eq('month', m)
        .order('agent_user_id', { nullsFirst: true });
      if (error) throw error;
      HR_TARGETS = data || [];
    } catch (e) {
      console.warn('[HR] 加载月度目标失败', e.message);
      HR_TARGETS = [];
    }
  }
  
  // ============ 初始化挂载点(只 HR 可见)============
  window.hrInit = async function() {
    if (!window.IS_HR) return;
    
    // 在 performance tab 顶部插入 HR 专属区
    const perfTab = document.querySelector('.tab-content[data-tab="performance"]');
    if (!perfTab) return;
    if (document.getElementById('hrPanel')) return;  // 已初始化
    
    const panel = document.createElement('div');
    panel.id = 'hrPanel';
    panel.className = 'section-block';
    panel.style.cssText = 'margin-top:14px;';
    perfTab.insertBefore(panel, perfTab.firstChild);
    
    await hrLoadTargets();
    hrRender();
  };
  
  function hrRender() {
    const panel = document.getElementById('hrPanel');
    if (!panel) return;
    
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    
    // 取所有非 HR 的 agent
    const agents = ((typeof CONFIG !== 'undefined' && CONFIG.agents) || [])
      .filter(a => a.role !== 'hr');
    
    panel.innerHTML = `
      <div class="fb-card" style="border:1.5px solid #7c3aed;background:linear-gradient(135deg,#faf5ff,#fff);">
        <div class="fb-head" style="cursor:default;">
          <div class="fb-title">
            👥 HR · 月度目标管理(${y} 年 ${m} 月)
            <span class="fb-total">${agents.length} 人</span>
          </div>
          <div class="fb-tabs">
            <button class="btn sm primary" onclick="hrOpenSetTargets()" style="background:#7c3aed;border-color:#7c3aed;">📋 设置月度目标</button>
            <button class="btn sm" onclick="hrLoadAndRender()">🔄 刷新</button>
          </div>
        </div>
        
        <!-- 团队/个人目标卡片 -->
        <div id="hrTargetsList" style="margin-top:10px;">
          ${hrRenderTargetsList(agents)}
        </div>
        
        <div style="margin-top:12px;padding:10px 12px;background:#fafaf9;border-radius:6px;font-size:11.5px;color:#78716c;">
          💡 <b>说明</b>:HR 角色(赵欣)只看绩效 · 不参与跟单业务 · 不计入排名 · 可设置团队/个人月度目标 · 下方"个人绩效"等模块显示目标 vs 实际
        </div>
      </div>
    `;
  }
  
  function hrRenderTargetsList(agents) {
    // 团队目标(agent_user_id IS NULL)
    const teamTargets = HR_TARGETS.filter(t => !t.agent_user_id);
    // 个人目标按 user_id 分组
    const byAgent = {};
    HR_TARGETS.filter(t => t.agent_user_id).forEach(t => {
      if (!byAgent[t.agent_user_id]) byAgent[t.agent_user_id] = [];
      byAgent[t.agent_user_id].push(t);
    });
    
    let html = '';
    
    // 团队目标
    if (teamTargets.length > 0) {
      html += `
        <div style="background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:10px 14px;margin-bottom:8px;">
          <div style="font-size:11px;color:#a8a29e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">🌐 团队整体目标</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            ${teamTargets.map(t => `
              <div style="background:#f5f3ff;border-left:3px solid #7c3aed;padding:6px 12px;border-radius:0 6px 6px 0;font-size:12.5px;">
                <span style="color:#78716c;">${escapeHtml(t.metric)}</span>:
                <b style="font-family:'JetBrains Mono',monospace;color:#7c3aed;">${t.target_value}</b>
                ${t.note ? `<span style="color:#a8a29e;font-size:11px;">· ${escapeHtml(t.note)}</span>` : ''}
                <button onclick="hrDeleteTarget(${t.id})" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:11px;padding:0 4px;">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      html += `<div style="background:#fff;border:1px dashed #cbd5e1;border-radius:8px;padding:10px 14px;margin-bottom:8px;text-align:center;color:#a8a29e;font-size:12px;">暂无团队目标 · 点 [📋 设置月度目标] 添加</div>`;
    }
    
    // 个人目标(网格 · 每人一卡)
    const agentsWithTargets = agents.filter(a => byAgent[a._userId]);
    if (agentsWithTargets.length > 0) {
      html += `
        <div style="background:#fff;border:1px solid #e7e5e4;border-radius:8px;padding:10px 14px;">
          <div style="font-size:11px;color:#a8a29e;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">👤 个人目标</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
            ${agentsWithTargets.map(a => `
              <div style="background:#fafaf9;border-radius:6px;padding:8px 10px;">
                <div style="font-size:12.5px;font-weight:700;margin-bottom:4px;">${escapeHtml(a.displayName || a.name)}</div>
                ${byAgent[a._userId].map(t => `
                  <div style="font-size:11.5px;color:#57534e;display:flex;justify-content:space-between;padding:2px 0;">
                    <span>${escapeHtml(t.metric)}</span>
                    <span><b style="font-family:'JetBrains Mono',monospace;">${t.target_value}</b>
                      <button onclick="hrDeleteTarget(${t.id})" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:10px;padding:0 4px;">✕</button>
                    </span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    return html;
  }
  
  window.hrLoadAndRender = async function() {
    await hrLoadTargets();
    hrRender();
  };
  
  // ============ 设置目标 Modal ============
  window.hrOpenSetTargets = function() {
    const agents = ((typeof CONFIG !== 'undefined' && CONFIG.agents) || [])
      .filter(a => a.role !== 'hr');
    
    const m = document.getElementById('hrSetModal') || (() => {
      const d = document.createElement('div');
      d.id = 'hrSetModal';
      d.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9100;align-items:center;justify-content:center;padding:20px;';
      document.body.appendChild(d);
      return d;
    })();
    
    m.style.display = 'flex';
    m.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;padding:14px 20px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:16px;font-weight:700;">📋 设置月度目标</h3>
          <button onclick="hrCloseSetModal()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button>
        </div>
        
        <div style="padding:20px;">
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label style="display:block;font-size:12px;color:#64748b;font-weight:600;margin-bottom:5px;">对象</label>
              <select id="hrSetAgent" style="width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:14px;">
                <option value="">🌐 团队整体(所有人)</option>
                ${agents.map(a => `<option value="${escapeAttr(a._userId)}" data-name="${escapeAttr(a.displayName || a.name)}">${escapeHtml(a.displayName || a.name)}</option>`).join('')}
              </select>
            </div>
            
            <div>
              <label style="display:block;font-size:12px;color:#64748b;font-weight:600;margin-bottom:5px;">指标</label>
              <select id="hrSetMetric" style="width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:14px;">
                <option value="跟进单数">跟进单数(月度新建 PO 数)</option>
                <option value="完成率">完成率(已完成 / 总数 · %)</option>
                <option value="售后处理数">售后处理数</option>
                <option value="客户问题处理数">客户问题处理数(供应商问题)</option>
                <option value="找灯数">找灯数</option>
                <option value="逾期单数">逾期单数(越少越好)</option>
                <option value="平均响应时长(小时)">平均响应时长(小时 · 越短越好)</option>
                <option value="其它">其它(自定义)</option>
              </select>
            </div>
            
            <div id="hrSetCustomMetric" style="display:none;">
              <input id="hrSetCustomName" type="text" placeholder="自定义指标名" style="width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:14px;">
            </div>
            
            <div>
              <label style="display:block;font-size:12px;color:#64748b;font-weight:600;margin-bottom:5px;">目标值</label>
              <input id="hrSetValue" type="number" step="0.01" placeholder="如 50 / 95 / 200" style="width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:16px;font-family:'JetBrains Mono',monospace;">
            </div>
            
            <div>
              <label style="display:block;font-size:12px;color:#64748b;font-weight:600;margin-bottom:5px;">备注(可选)</label>
              <textarea id="hrSetNote" rows="2" placeholder="如:Q3 冲刺 / 加强转化 / ..." style="width:100%;padding:8px 11px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
            </div>
          </div>
        </div>
        
        <div style="padding:12px 20px;border-top:1px solid #e7e5e4;background:#fafaf9;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 12px 12px;">
          <button onclick="hrCloseSetModal()" style="padding:9px 18px;background:#fff;border:1px solid #cbd5e1;color:#57534e;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">取消</button>
          <button onclick="hrSaveTarget()" style="padding:9px 22px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">💾 保存目标</button>
        </div>
      </div>
    `;
    
    // 自定义指标 toggle
    const metricSel = document.getElementById('hrSetMetric');
    const customDiv = document.getElementById('hrSetCustomMetric');
    metricSel.onchange = () => {
      customDiv.style.display = metricSel.value === '其它' ? 'block' : 'none';
    };
  };
  
  window.hrCloseSetModal = function() {
    const m = document.getElementById('hrSetModal');
    if (m) m.style.display = 'none';
  };
  
  window.hrSaveTarget = async function() {
    const agentId = document.getElementById('hrSetAgent').value || null;
    const agentName = agentId ? (document.querySelector(`#hrSetAgent option[value="${agentId}"]`)?.dataset?.name || '') : null;
    let metric = document.getElementById('hrSetMetric').value;
    if (metric === '其它') {
      metric = (document.getElementById('hrSetCustomName').value || '').trim();
      if (!metric) {
        if (typeof toast === 'function') toast('请填写自定义指标名', 'err');
        return;
      }
    }
    const value = parseFloat(document.getElementById('hrSetValue').value);
    if (isNaN(value)) {
      if (typeof toast === 'function') toast('请填写目标值', 'err');
      return;
    }
    const note = (document.getElementById('hrSetNote').value || '').trim();
    
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const me = _hrGetMe();
    
    try {
      const { error } = await sb.from('hr_monthly_targets').upsert({
        year: y,
        month: m,
        agent_user_id: agentId,
        agent_name: agentName,
        metric: metric,
        target_value: value,
        note: note || null,
        set_by: me.id,
        set_by_name: me.name,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'year,month,agent_user_id,metric' });
      if (error) throw error;
      
      if (typeof toast === 'function') toast('✓ 目标已保存', 'ok');
      hrCloseSetModal();
      await hrLoadAndRender();
    } catch (e) {
      if (typeof toast === 'function') toast('保存失败:' + e.message, 'err');
    }
  };
  
  window.hrDeleteTarget = async function(id) {
    if (!confirm('删除此目标?')) return;
    try {
      const { error } = await sb.from('hr_monthly_targets').delete().eq('id', id);
      if (error) throw error;
      if (typeof toast === 'function') toast('已删除', 'ok');
      await hrLoadAndRender();
    } catch (e) {
      if (typeof toast === 'function') toast('删除失败:' + e.message, 'err');
    }
  };
  
  function _hrGetMe() {
    const agent = ((typeof CONFIG !== 'undefined' && CONFIG.agents) || [])
      .find(a => a.name === (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : ''));
    return {
      id: agent?._userId || null,
      name: agent?.displayName || agent?.name || 'unknown',
    };
  }
  
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
  
  // 等用户登录后初始化
  document.addEventListener('DOMContentLoaded', () => {
    const t = setInterval(() => {
      if (window.IS_HR !== undefined) {
        clearInterval(t);
        // 等 mainApp 显示
        const ready = setInterval(() => {
          const mainApp = document.getElementById('mainApp');
          if (mainApp && mainApp.style.display !== 'none') {
            clearInterval(ready);
            if (window.IS_HR) hrInit();
          }
        }, 500);
      }
    }, 300);
  });
  
})();
