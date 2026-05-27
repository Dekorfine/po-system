// ============================================================================
// V20260527t · 拍摄需求中心(跟单端 · 对接 WorkTrack-KPI 的 photo_logs 表)
// ----------------------------------------------------------------------------
// 跟单遇到问题 → 一键提需求给拍摄部 → 实时看进度
// 文档:AI提示词 v2 · 客服/跟单接入拍摄部工作流
// ----------------------------------------------------------------------------
// 配置:URL + anon key 存 localStorage · 仅 admin 可改 · 默认用 cross-dept 那套
// 来源标识:external_request.source = '跟单' · external_request.from_dept = '跟单部'
// ============================================================================

// ─────────────── Supabase 客户端配置 ───────────────
// 默认值:沿用 cross-dept(美工 Supabase · 大概率同一个项目)
// 老板可在「📨 拍摄」tab 顶部的 [⚙ 配置] 改写到 localStorage
const PHOTOREQ_DEFAULT_URL = 'https://xyhbwqugbnowfjuhqhsj.supabase.co';
const PHOTOREQ_DEFAULT_KEY = 'sb_publishable_Z0dXXZivG5QI-FCbwELxEA_JZBNx2Hn';

function _photoReqGetConfig() {
  const url = localStorage.getItem('worktrack_supabase_url') || PHOTOREQ_DEFAULT_URL;
  const key = localStorage.getItem('worktrack_supabase_anon_key') || PHOTOREQ_DEFAULT_KEY;
  return { url, key };
}

function _photoReqSaveConfig(url, key) {
  if (url) localStorage.setItem('worktrack_supabase_url', url.trim());
  if (key) localStorage.setItem('worktrack_supabase_anon_key', key.trim());
  // 重建 client
  PHOTOREQ._client = null;
}

function _photoReqClient() {
  if (PHOTOREQ._client) return PHOTOREQ._client;
  const { url, key } = _photoReqGetConfig();
  if (!url || !key) return null;
  try {
    PHOTOREQ._client = window.supabase.createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return PHOTOREQ._client;
  } catch (e) {
    console.error('photoReq client 创建失败:', e);
    return null;
  }
}

// ─────────────── 全局 state ───────────────
const PHOTOREQ = {
  _client: null,
  _list: [],
  _filter: 'mine',    // 'mine' / 'all' / 'urgent' / 'in_progress' / 'done'
  _loadedAt: 0,
};

// ─────────────── 12 店铺(从 v2 文档复制 · 别让 AI 编名) ───────────────
const PHOTOREQ_SHOPS = [
  'Vakkerlight', 'Docos.us', 'Mooijane', 'Mooiehome',
  'Radilum', 'Mooielight', 'Dekorfine', 'Pinlighting',
  'Lumioshine', 'Rayonshine', '阿里巴巴 · Radilum INC', '其他'
];

// ─────────────── 主流程状态显示 ───────────────
const PHOTOREQ_STATUS_LABEL = {
  draft:     { emoji: '📦', text: '已提交 · 等拍摄部接手', color: 'rgba(245,158,11,0.1)', fg: '#92400e' },
  shooting:  { emoji: '📷', text: '拍摄部已接 · 待拍', color: 'rgba(37,99,235,0.1)', fg: '#1e40af' },
  shot:      { emoji: '✓',  text: '已拍完 · 等剪辑', color: 'rgba(13,148,136,0.1)', fg: '#0f766e' },
  editing:   { emoji: '🎬', text: '剪辑中', color: 'rgba(124,58,237,0.1)', fg: '#6d28d9' },
  edited:    { emoji: '✓',  text: '已剪辑 · 等上传', color: 'rgba(13,148,136,0.1)', fg: '#0f766e' },
  uploading: { emoji: '⬆️', text: '上传中', color: 'rgba(37,99,235,0.1)', fg: '#1e40af' },
  done:      { emoji: '✅', text: '完成 · 已上线', color: 'rgba(22,163,74,0.1)', fg: '#15803d' },
};

const PHOTOREQ_PRE_SHOOT_LABEL = {
  pending:  '⏳ 美工预审中',
  approved: '✅ 美工已通过预审 · 正式拍摄中',
  rejected: '⚠️ 美工反馈了问题 · 摄影助理整改中',
};

const PHOTOREQ_REVIEW_LABEL = {
  pending:  '🎬 老板/主管审核视频中',
  approved: '✅ 视频已审核通过 · 准备上传',
  rejected: '⚠️ 视频被反馈问题 · 等修改',
};

// ─────────────── 渲染主 tab ───────────────
async function renderPhotoReq() {
  const body = document.getElementById('photoReqBody');
  if (!body) return;
  
  const isAdmin = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN);
  const cfg = _photoReqGetConfig();
  const cfgConfigured = !!(localStorage.getItem('worktrack_supabase_url') && localStorage.getItem('worktrack_supabase_anon_key'));
  
  // 配置状态条
  const cfgBar = `
    <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:${cfgConfigured ? 'rgba(22,163,74,0.05)' : 'rgba(245,158,11,0.05)'}; border-left:3px solid ${cfgConfigured ? 'var(--success)' : '#f59e0b'}; border-radius:0 6px 6px 0; margin-bottom:12px; font-size:11.5px;">
      <span style="color:${cfgConfigured ? 'var(--success)' : '#92400e'};">${cfgConfigured ? '✓ 已配置' : '⚠ 使用默认配置(美工 Supabase)'} · ${cfg.url.replace('https://', '').slice(0, 30)}...</span>
      ${isAdmin ? `<button class="btn small" onclick="photoReqOpenConfig()" style="font-size:11px; padding:3px 10px; margin-left:auto;">⚙ 配置</button>` : ''}
    </div>
  `;
  
  body.innerHTML = `
    ${cfgBar}
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
      <div>
        <h2 style="margin:0; font-size:18px; display:flex; align-items:center; gap:8px;">
          📨 拍摄需求中心
          <span style="font-size:11px; font-weight:400; color:var(--text-tertiary);">遇到问题一键给拍摄部 · 实时看进度</span>
        </h2>
      </div>
      <button class="btn primary" onclick="photoReqOpenNew()">+ 新建拍摄需求</button>
    </div>

    <!-- 筛选 sub-tab -->
    <div style="display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap;">
      ${[
        { k: 'mine',        label: '👤 我提的' },
        { k: 'urgent',      label: '🚨 加急' },
        { k: 'in_progress', label: '⏳ 进行中' },
        { k: 'done',        label: '✅ 已完成' },
        { k: 'all',         label: '📋 全部(主管视角)' },
      ].map(f => `
        <button onclick="photoReqSetFilter('${f.k}')" class="photoreq-filter-chip ${PHOTOREQ._filter === f.k ? 'active' : ''}" 
                style="padding:6px 12px; font-size:12px; border:1px solid ${PHOTOREQ._filter === f.k ? 'var(--accent)' : 'var(--border)'}; border-radius:18px; background:${PHOTOREQ._filter === f.k ? 'var(--accent)' : 'var(--bg-card)'}; color:${PHOTOREQ._filter === f.k ? 'white' : 'var(--text-secondary)'}; cursor:pointer; font-weight:${PHOTOREQ._filter === f.k ? '600' : '400'};">
          ${f.label}
        </button>
      `).join('')}
    </div>

    <div id="photoReqList">
      <div style="padding:32px; text-align:center; color:var(--text-tertiary);">加载中...</div>
    </div>
  `;
  
  await _photoReqLoadAndRender();
}
window.renderPhotoReq = renderPhotoReq;

function photoReqSetFilter(filter) {
  PHOTOREQ._filter = filter;
  renderPhotoReq();
}
window.photoReqSetFilter = photoReqSetFilter;

// ─────────────── 加载列表 ───────────────
async function _photoReqLoadAndRender() {
  const listEl = document.getElementById('photoReqList');
  if (!listEl) return;
  
  const client = _photoReqClient();
  if (!client) {
    listEl.innerHTML = `<div style="padding:24px; text-align:center; color:var(--danger); background:rgba(220,38,38,0.05); border-radius:8px;">⚠ Supabase 客户端初始化失败 · 请检查配置</div>`;
    return;
  }
  
  try {
    let q = client.from('photo_logs').select('*')
      .eq('external_request->>source', '跟单')
      .order('created_at_ms', { ascending: false })
      .limit(200);
    
    // "我提的" 加 from_user_id 过滤
    if (PHOTOREQ._filter === 'mine') {
      const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) || (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : '');
      if (myId) q = q.eq('external_request->>from_user_id', String(myId));
    }
    
    const { data, error } = await q;
    if (error) throw error;
    
    let list = data || [];
    
    // 应用本地筛选
    if (PHOTOREQ._filter === 'urgent') {
      list = list.filter(x => x.priority === 'urgent' || x.external_request?.urgency === 'urgent');
    } else if (PHOTOREQ._filter === 'in_progress') {
      list = list.filter(x => !['done', 'cancelled'].includes(x.status));
    } else if (PHOTOREQ._filter === 'done') {
      list = list.filter(x => x.status === 'done');
    }
    
    PHOTOREQ._list = list;
    PHOTOREQ._loadedAt = Date.now();
    _photoReqRenderList(list);
  } catch (e) {
    console.error('加载拍摄需求失败:', e);
    listEl.innerHTML = `<div style="padding:20px; text-align:center; color:var(--danger); background:rgba(220,38,38,0.05); border-radius:8px;">
      ⚠ 加载失败:${escapeHtml(e.message || String(e))}<br>
      <span style="font-size:11px; color:var(--text-tertiary);">如果是权限错误 · 让 Martin 配 RLS · 见文档 #9</span>
    </div>`;
  }
}

function _photoReqRenderList(list) {
  const listEl = document.getElementById('photoReqList');
  if (!listEl) return;
  
  if (list.length === 0) {
    listEl.innerHTML = `
      <div style="padding:48px; text-align:center; color:var(--text-tertiary); background:var(--bg-card); border:1px dashed var(--border); border-radius:10px;">
        <div style="font-size:32px; margin-bottom:8px;">📭</div>
        <div style="font-size:14px;">${PHOTOREQ._filter === 'mine' ? '你还没提过拍摄需求' : '当前筛选无匹配'}</div>
        <button class="btn primary" onclick="photoReqOpenNew()" style="margin-top:12px;">+ 提一个</button>
      </div>
    `;
    return;
  }
  
  listEl.innerHTML = list.map(log => _photoReqCardHtml(log)).join('');
}

function _photoReqCardHtml(log) {
  const status = log.status || 'draft';
  const statusMeta = PHOTOREQ_STATUS_LABEL[status] || { emoji: '?', text: status, color: 'var(--bg-elevated)', fg: 'var(--text-secondary)' };
  const ext = log.external_request || {};
  const urgent = log.priority === 'urgent' || ext.urgency === 'urgent';
  const shops = Array.isArray(log.applicable_shops) ? log.applicable_shops : [];
  const attachments = Array.isArray(ext.attachments) ? ext.attachments : [];
  
  // 子流程状态
  const preReview = log.pre_shoot_review;
  const review = log.review;
  let subStatus = '';
  if (preReview?.status && PHOTOREQ_PRE_SHOOT_LABEL[preReview.status]) {
    subStatus = `<div style="font-size:11px; color:var(--text-secondary); margin-top:3px;">${PHOTOREQ_PRE_SHOOT_LABEL[preReview.status]}</div>`;
  }
  if (review?.status && PHOTOREQ_REVIEW_LABEL[review.status]) {
    subStatus += `<div style="font-size:11px; color:var(--text-secondary); margin-top:3px;">${PHOTOREQ_REVIEW_LABEL[review.status]}</div>`;
  }
  
  const ageMs = Date.now() - (log.created_at_ms || 0);
  const ageStr = _photoReqFmtAge(ageMs);
  
  return `
    <div style="display:grid; grid-template-columns: 80px 1fr; gap:14px; padding:14px; background:var(--bg-card); border:1px solid var(--border); border-left:4px solid ${urgent ? 'var(--danger)' : statusMeta.fg}; border-radius:8px; margin-bottom:10px;">
      <!-- 产品图 -->
      <div>
        ${log.product_image 
          ? `<img src="${escapeHtml(log.product_image)}" style="width:80px; height:80px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="openImgLightbox && openImgLightbox('${escapeHtml(log.product_image)}')">` 
          : `<div style="width:80px; height:80px; background:var(--bg-elevated); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:24px;">📷</div>`}
      </div>
      <!-- 主内容 -->
      <div style="min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
          ${urgent ? `<span style="background:var(--danger); color:white; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700;">🚨 加急</span>` : ''}
          <span style="background:${statusMeta.color}; color:${statusMeta.fg}; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:600;">${statusMeta.emoji} ${statusMeta.text}</span>
          <span style="font-size:11px; color:var(--text-tertiary);">${ageStr}</span>
        </div>
        <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-bottom:3px; word-break:break-word;">
          ${escapeHtml(log.product_name || '(未填产品名)')}
          ${log.sku ? `<span style="font-size:11px; font-weight:400; color:var(--text-tertiary); margin-left:6px; font-family:monospace;">${escapeHtml(log.sku)}</span>` : ''}
        </div>
        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:6px; line-height:1.5; max-height:42px; overflow:hidden; text-overflow:ellipsis;">
          ${escapeHtml(ext.reason || '(无原因描述)')}
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:11px; color:var(--text-tertiary);">
          ${shops.length > 0 ? `<span>🏪 ${shops.map(escapeHtml).join(' · ')}</span>` : ''}
          ${attachments.length > 0 ? `<span>📎 ${attachments.length} 张图</span>` : ''}
          ${ext.from_name ? `<span>👤 ${escapeHtml(ext.from_name)}</span>` : ''}
        </div>
        ${subStatus}
      </div>
    </div>
  `;
}

function _photoReqFmtAge(ms) {
  if (!ms || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  if (d < 30) return d + ' 天前';
  return new Date(Date.now() - ms).toLocaleDateString();
}

// ─────────────── 配置中心 ───────────────
function photoReqOpenConfig() {
  if (typeof IS_ADMIN !== 'undefined' && !IS_ADMIN) {
    toast('配置仅限主管', 'warn');
    return;
  }
  const cfg = _photoReqGetConfig();
  document.getElementById('photoReqCfgUrl').value = cfg.url;
  document.getElementById('photoReqCfgKey').value = cfg.key;
  document.getElementById('photoReqConfigModal').style.display = 'flex';
  if (typeof _disableAutofillOnFields === 'function') {
    setTimeout(() => _disableAutofillOnFields(document.getElementById('photoReqConfigModal')), 0);
  }
}
window.photoReqOpenConfig = photoReqOpenConfig;

function photoReqCloseConfig() {
  document.getElementById('photoReqConfigModal').style.display = 'none';
}
window.photoReqCloseConfig = photoReqCloseConfig;

function photoReqSaveConfig() {
  const url = document.getElementById('photoReqCfgUrl').value.trim();
  const key = document.getElementById('photoReqCfgKey').value.trim();
  if (!url || !key) { toast('URL 和 anon key 都要填', 'warn'); return; }
  if (!url.startsWith('https://') || !url.endsWith('.supabase.co')) {
    toast('URL 格式不对 · 应该是 https://xxx.supabase.co', 'err');
    return;
  }
  _photoReqSaveConfig(url, key);
  toast('✓ 配置已保存 · 重新加载列表中...', 'success');
  photoReqCloseConfig();
  setTimeout(() => renderPhotoReq(), 200);
}
window.photoReqSaveConfig = photoReqSaveConfig;

function photoReqResetConfig() {
  if (!confirm('确认恢复默认配置?\n\n(将清除你保存的 URL + key · 用美工 Supabase 默认值)')) return;
  localStorage.removeItem('worktrack_supabase_url');
  localStorage.removeItem('worktrack_supabase_anon_key');
  PHOTOREQ._client = null;
  toast('✓ 已恢复默认 · 重新加载...', 'success');
  photoReqCloseConfig();
  setTimeout(() => renderPhotoReq(), 200);
}
window.photoReqResetConfig = photoReqResetConfig;

// ─────────────── 新建需求 modal ───────────────
let PHOTOREQ_NEW = null;

function photoReqOpenNew(preset = {}) {
  PHOTOREQ_NEW = {
    product_name: preset.product_name || '',
    sku: preset.sku || '',
    product_image: preset.product_image || '',
    applicable_shops: preset.applicable_shops || [],
    reason: preset.reason || '',
    urgency: 'normal',
    attachments: [],
    external_ref_id: preset.external_ref_id || '',
  };
  _photoReqRenderNew();
  document.getElementById('photoReqNewModal').style.display = 'flex';
  if (typeof _disableAutofillOnFields === 'function') {
    setTimeout(() => _disableAutofillOnFields(document.getElementById('photoReqNewModal')), 0);
  }
}
window.photoReqOpenNew = photoReqOpenNew;

function photoReqCloseNew() {
  document.getElementById('photoReqNewModal').style.display = 'none';
  PHOTOREQ_NEW = null;
}
window.photoReqCloseNew = photoReqCloseNew;

function _photoReqRenderNew() {
  const s = PHOTOREQ_NEW;
  const body = document.getElementById('photoReqNewBody');
  
  body.innerHTML = `
    <!-- 产品名 + SKU -->
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px; margin-bottom:14px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">产品名 <span style="color:var(--danger);">*</span></label>
        <input type="text" id="prNewProductName" value="${escapeHtml(s.product_name)}" oninput="PHOTOREQ_NEW.product_name=this.value"
               placeholder="例:Milk Table Lamp"
               style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px;">
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">SKU(强烈建议填)</label>
        <input type="text" id="prNewSku" value="${escapeHtml(s.sku)}" oninput="PHOTOREQ_NEW.sku=this.value"
               placeholder="例:DCT-24118-5"
               style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--border); border-radius:6px; font-family:monospace;">
      </div>
    </div>
    
    <!-- 应用店铺多选 -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">应用店铺(可多选)</label>
      <div style="display:flex; flex-wrap:wrap; gap:5px;">
        ${PHOTOREQ_SHOPS.map(shop => {
          const checked = s.applicable_shops.includes(shop);
          return `<span onclick="_photoReqToggleShop('${escapeHtml(shop).replace(/'/g, "\\'")}')"
                        style="padding:5px 10px; font-size:11.5px; border:1px solid ${checked ? 'var(--accent)' : 'var(--border)'}; border-radius:14px; cursor:pointer; user-select:none; background:${checked ? 'var(--accent)' : 'var(--bg-card)'}; color:${checked ? 'white' : 'var(--text-secondary)'}; font-weight:${checked ? '600' : '400'};">
                    ${checked ? '✓ ' : ''}${escapeHtml(shop)}
                  </span>`;
        }).join('')}
      </div>
    </div>
    
    <!-- 原因(大文本) -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">详细原因 <span style="color:var(--danger);">*</span></label>
      <textarea id="prNewReason" oninput="PHOTOREQ_NEW.reason=this.value" rows="4"
                placeholder="客户反馈拿到的灯是金色 · 卖家描述是黄铜色 · 要求重拍清晰彩照对比&#10;紧急:客户在 PayPal 开了 dispute · 2 天内要答复"
                style="width:100%; padding:10px 12px; font-size:13px; border:1px solid var(--border); border-radius:6px; resize:vertical; font-family:inherit; line-height:1.5;">${escapeHtml(s.reason)}</textarea>
    </div>
    
    <!-- 紧急度 -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">紧急度</label>
      <div style="display:flex; gap:8px;">
        <span onclick="PHOTOREQ_NEW.urgency='normal'; _photoReqRenderNew()"
              style="padding:6px 14px; font-size:12px; border:1px solid ${s.urgency==='normal'?'var(--accent)':'var(--border)'}; border-radius:6px; cursor:pointer; background:${s.urgency==='normal'?'var(--accent)':'var(--bg-card)'}; color:${s.urgency==='normal'?'white':'var(--text-secondary)'}; font-weight:${s.urgency==='normal'?'600':'400'};">
          普通
        </span>
        <span onclick="PHOTOREQ_NEW.urgency='urgent'; _photoReqRenderNew()"
              style="padding:6px 14px; font-size:12px; border:1px solid ${s.urgency==='urgent'?'var(--danger)':'var(--border)'}; border-radius:6px; cursor:pointer; background:${s.urgency==='urgent'?'var(--danger)':'var(--bg-card)'}; color:${s.urgency==='urgent'?'white':'var(--text-secondary)'}; font-weight:${s.urgency==='urgent'?'600':'400'};">
          🚨 加急
        </span>
      </div>
      <div style="font-size:11px; color:var(--text-tertiary); margin-top:5px;">⚠ 加急在拍摄部首页置顶 · 慎用 · 客户投诉 / 平台 dispute 等才标加急</div>
    </div>
    
    <!-- 产品图(可选 · URL 或上传) -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">产品图 URL(可选 · 让拍摄部看长啥样)</label>
      <input type="text" value="${escapeHtml(s.product_image)}" oninput="PHOTOREQ_NEW.product_image=this.value"
             placeholder="https://...png · 从 Shopify 复制产品图链接"
             style="width:100%; padding:8px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px;">
    </div>
    
    <!-- 附件上传 -->
    <div style="margin-bottom:14px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
        附件 · 客户聊天截图 / 对比图 / 物流损坏图等 (${s.attachments.length})
      </label>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
        ${s.attachments.map((a, idx) => `
          <div style="position:relative; width:80px; height:80px; border-radius:6px; overflow:hidden; border:1px solid var(--border);">
            <img src="${escapeHtml(a.url)}" style="width:100%; height:100%; object-fit:cover;">
            <button onclick="_photoReqDelAttachment(${idx})" style="position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.7); color:white; border:none; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
          </div>
        `).join('')}
        <label for="prNewFiles" style="width:80px; height:80px; border:2px dashed var(--border); border-radius:6px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; color:var(--text-tertiary); font-size:11px; gap:2px;">
          <span style="font-size:18px;">📎</span>
          <span>添加</span>
        </label>
        <input type="file" id="prNewFiles" multiple accept="image/*" onchange="_photoReqOnFilesPick(this.files)" style="display:none;">
      </div>
      <div id="prNewUploadStatus" style="font-size:11px; color:var(--text-tertiary);"></div>
    </div>
    
    <!-- 外部关联(可选) -->
    <div style="margin-bottom:6px;">
      <label style="display:block; font-size:11px; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">关联 PO / 售后单号(可选)</label>
      <input type="text" value="${escapeHtml(s.external_ref_id)}" oninput="PHOTOREQ_NEW.external_ref_id=this.value"
             placeholder="例:CG-20260527-0008 / AS-1234"
             style="width:100%; padding:7px 10px; font-size:12px; border:1px solid var(--border); border-radius:6px; font-family:monospace;">
    </div>
  `;
}

function _photoReqToggleShop(shop) {
  if (!PHOTOREQ_NEW) return;
  const arr = PHOTOREQ_NEW.applicable_shops;
  const idx = arr.indexOf(shop);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(shop);
  _photoReqRenderNew();
}
window._photoReqToggleShop = _photoReqToggleShop;

function _photoReqDelAttachment(idx) {
  if (!PHOTOREQ_NEW) return;
  PHOTOREQ_NEW.attachments.splice(idx, 1);
  _photoReqRenderNew();
}
window._photoReqDelAttachment = _photoReqDelAttachment;

// 客户端压缩 + 并行上传
async function _photoReqOnFilesPick(files) {
  if (!files || files.length === 0) return;
  const status = document.getElementById('prNewUploadStatus');
  if (status) status.textContent = `上传中 0/${files.length}...`;
  
  const client = _photoReqClient();
  if (!client) { toast('Supabase 客户端未配置', 'err'); return; }
  
  let done = 0;
  const uploads = Array.from(files).map(async (file) => {
    try {
      const compressed = await _photoReqCompressImage(file);
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `cs-requests/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      
      const { error } = await client.storage
        .from('attachments')
        .upload(path, compressed, { upsert: false, contentType: compressed.type });
      if (error) throw error;
      
      const { data: { publicUrl } } = client.storage.from('attachments').getPublicUrl(path);
      
      done++;
      if (status) status.textContent = `上传中 ${done}/${files.length}...`;
      return {
        name: file.name,
        url: publicUrl,
        uploaded_at_ms: Date.now()
      };
    } catch (e) {
      console.error('附件上传失败:', e);
      toast(`上传失败:${file.name} · ${e.message || e}`, 'err');
      return null;
    }
  });
  
  const results = await Promise.all(uploads);
  const successful = results.filter(Boolean);
  if (successful.length > 0) {
    PHOTOREQ_NEW.attachments.push(...successful);
    if (status) status.textContent = `✓ 已上传 ${successful.length} 张`;
    _photoReqRenderNew();
    setTimeout(() => { const s = document.getElementById('prNewUploadStatus'); if (s) s.textContent = ''; }, 2000);
  }
}
window._photoReqOnFilesPick = _photoReqOnFilesPick;

// 压缩图片到 1600px 宽以内 + JPEG q=0.85
function _photoReqCompressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1600;
        let w = img.width, h = img.height;
        if (w > MAX_W) { h = h * (MAX_W / w); w = MAX_W; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          // 用 .jpg 后缀的 file
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(compressed);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// 提交新需求
async function photoReqSubmitNew() {
  const s = PHOTOREQ_NEW;
  if (!s) return;
  
  // 校验
  if (!(s.product_name || '').trim()) { toast('请填产品名', 'warn'); return; }
  if (!(s.reason || '').trim()) { toast('请填详细原因', 'warn'); return; }
  
  const client = _photoReqClient();
  if (!client) { toast('Supabase 客户端未配置 · 让主管去 ⚙ 配置', 'err'); return; }
  
  const myId = (typeof CURRENT_USER_ID !== 'undefined' && CURRENT_USER_ID) ? String(CURRENT_USER_ID) : (typeof CURRENT_AGENT !== 'undefined' ? CURRENT_AGENT : 'unknown');
  const myName = (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) ? CURRENT_AGENT : '跟单';
  
  // V20260527t: ⚠️ 必须用 crypto.randomUUID() · 不能用短串
  const id = crypto.randomUUID();
  const now = Date.now();
  
  const row = {
    id,
    product_name: s.product_name.trim(),
    sku: (s.sku || '').trim() || null,
    product_image: (s.product_image || '').trim() || null,
    applicable_shops: s.applicable_shops || [],
    product_type: '跟单需求',
    
    status: 'draft',
    priority: s.urgency === 'urgent' ? 'urgent' : 'normal',
    
    external_request: {
      source: '跟单',
      from_name: myName,
      from_user_id: myId,
      from_dept: '跟单部',
      reason: s.reason.trim(),
      urgency: s.urgency || 'normal',
      attachments: s.attachments || [],
      created_at_ms: now,
      external_ref_id: (s.external_ref_id || '').trim() || null
    },
    
    created_by_id: myId,
    created_by_name: myName,
    created_at_ms: now,
    updated_at: new Date().toISOString()
  };
  
  try {
    const { error } = await client.from('photo_logs').insert(row);
    if (error) throw error;
    toast(`✓ 已提交给拍摄部 · ${s.urgency === 'urgent' ? '🚨 加急工单' : '等待接手'}`, 'success', 2500);
    photoReqCloseNew();
    setTimeout(() => renderPhotoReq(), 200);
  } catch (e) {
    console.error('提交拍摄需求失败:', e);
    toast('提交失败:' + (e.message || e), 'err', 4000);
  }
}
window.photoReqSubmitNew = photoReqSubmitNew;
