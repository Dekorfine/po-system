// ============================================================
// 跟单团队工作台 · core.js
// 核心基础设施：Supabase 客户端、登录、DATA 对象、全局状态、工具函数
// ============================================================
// 加载顺序：必须在所有业务模块前加载
// 改动须慎重 —— 这个文件被所有模块依赖
// ============================================================

// ============================================================
// 跟单团队工作台 · 演示版
// 4 个独立模块 + Tab 切换 + 主管视角
// ============================================================

// ============ 数据访问层 ============
// ============================================================
// Supabase 客户端
// ============================================================
const SUPABASE_URL = 'https://pyfmuknvjqfwcqvbrsvw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dFjk1WN_Hc0Te6IhXZysZg_SXvKQU4C';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let CURRENT_USER_ID = null;     // auth.uid
let CURRENT_USER_EMAIL = null;
let _isBootstrapping = true;

// ============================================================
// 数据访问层（云端版）
// ============================================================
// 设计：
// - 内部 _cache 缓存所有数据
// - 同步接口（getXxx/saveXxx）保留，兼容演示版代码
// - saveXxx 触发防抖异步同步到 Supabase
// ============================================================
const DATA = {
  _cache: {
    config: { id: 1, suppliers: [], sites: ['VK','DC','RD','DF','MH','MJ','ML','RS','LS','PL','线下'], score_rules: null },
    agents: [],
    ordersByAgent: {},
    aftersalesByAgent: {},
    issuesByAgent: {},
    missingLights: [],
    purchasesByAgent: {},
  },
  _syncTimers: {},

  // ============ 异步加载 ============
  async loadAll() {
    // 配置
    const { data: cfg } = await sb.from('config').select('*').eq('id', 1).single();
    if (cfg) {
      this._cache.config = cfg;
      // 首次部署或被清空：自动填充默认供应商列表
      if (!cfg.suppliers || cfg.suppliers.length === 0) {
        this._cache.config.suppliers = [...DEFAULT_SUPPLIERS];
        // 后台异步同步到云端（不阻塞）
        sb.from('config').update({ suppliers: DEFAULT_SUPPLIERS }).eq('id', 1).then(({ error }) => {
          if (error) console.warn('Sync default suppliers failed:', error);
          else console.log('✓ 已自动同步 ' + DEFAULT_SUPPLIERS.length + ' 家默认供应商');
        });
      }
    }

    // Agents
    const { data: agentRows } = await sb.from('agents').select('*');
    this._cache.agents = (agentRows || []).map(a => ({
      _userId: a.user_id,
      name: a.name,
      isAdmin: a.is_admin,
      isBoss: !!a.is_boss,       // V4-2026-05-24: 老板角色
      sites: a.sites || [],
      modules: a.modules || [...ALL_MODULE_KEYS],
    }));

    // Orders / Aftersales / Issues / Missing / Purchases 都按 agent 分组（RLS 自动过滤：跟单只能看自己，主管能看所有）
    const [ordersR, aftersR, issuesR, missingR, purchasesR] = await Promise.all([
      sb.from('orders').select('*').order('created_at', { ascending: false }),
      sb.from('aftersales').select('*').order('created_at', { ascending: false }),
      sb.from('issues').select('*').order('created_at', { ascending: false }),
      sb.from('missing_lights').select('*').order('created_at', { ascending: false }),
      sb.from('online_purchases').select('*').order('created_at', { ascending: false }).then(r => r).catch(e => ({ data: [], error: e })),
    ]);

    // 按 agent_id 分组
    this._cache.ordersByAgent = this._groupByAgent(ordersR.data || [], 'order');
    this._cache.aftersalesByAgent = this._groupByAgent(aftersR.data || [], 'after');
    this._cache.issuesByAgent = this._groupByAgent(issuesR.data || [], 'issue');
    this._cache.missingLights = (missingR.data || []).map(m => this._fromDbMissing(m));
    this._cache.purchasesByAgent = this._groupByAgent(purchasesR.data || [], 'purchase');
  },

  _groupByAgent(rows, type) {
    const result = {};
    const userIdToName = {};
    this._cache.agents.forEach(a => { userIdToName[a._userId] = a.name; });

    rows.forEach(r => {
      const agentName = userIdToName[r.agent_id] || '未知';
      if (!result[agentName]) result[agentName] = [];
      if (type === 'order') result[agentName].push(this._fromDbOrder(r));
      else if (type === 'after') result[agentName].push(this._fromDbAfter(r));
      else if (type === 'issue') result[agentName].push(this._fromDbIssue(r));
      else if (type === 'purchase') result[agentName].push(this._fromDbPurchase(r));
    });
    return result;
  },

  // ============ 字段转换 DB → 内存（snake_case → camelCase）============
  _fromDbOrder(r) {
    return {
      _id: r.id, _agent_id: r.agent_id,
      orderNo: r.order_no || '', site: r.site || '',
      product: r.product || '', supplier: r.supplier || '',
      status: r.status || 'pending',
      orderDate: r.order_date || '', promisedDate: r.promised_date || '',
      shippedDate: r.shipped_date || '', arrivedDate: r.arrived_date || '',
      nextFollow: r.next_follow || '',
      notes: r.notes || '',
      screenshots: r.screenshots || [], followups: r.followups || [],
      createdAt: r.created_at, updatedAt: r.updated_at,
      deletedAt: r.deleted_at || null, deletedBy: r.deleted_by || null,
    };
  },
  _fromDbAfter(r) {
    return {
      _id: r.id, _agent_id: r.agent_id,
      orderNo: r.order_no || '', site: r.site || '',
      product: r.product || '', supplier: r.supplier || '',
      reason: r.reason || '', reasonDetail: r.reason_detail || '',
      status: r.status || 'pending',
      createdDate: r.created_date || '', nextFollow: r.next_follow || '', resolvedDate: r.resolved_date || '',
      screenshots: r.screenshots || [], followups: r.followups || [],
      createdAt: r.created_at,
      deletedAt: r.deleted_at || null, deletedBy: r.deleted_by || null,
    };
  },
  _fromDbIssue(r) {
    return {
      _id: r.id, _agent_id: r.agent_id,
      supplier: r.supplier || '', issueType: r.issue_type || '',
      requirement: r.requirement || '', status: r.status || 'pending',
      followups: r.followups || [], createdAt: r.created_at,
      // V4 R1 新字段
      site: r.site || '', 
      category: r.category || '', 
      subTags: r.sub_tags || [],
      description: r.description || '',
      createdDate: r.created_date || null,
      screenshots: r.screenshots || [],
      // V4 R2 跟进字段
      nextFollowDate: r.next_follow_date || '',
      deletedAt: r.deleted_at || null, deletedBy: r.deleted_by || null,
    };
  },
  _fromDbMissing(r) {
    return {
      _id: r.id, _creator_id: r.creator_id,
      description: r.description || '', specs: r.specs || '',
      customerOrderNo: r.customer_order_no || '',
      creator: r.creator_name || '',
      status: r.status || 'searching',
      screenshots: r.screenshots || [], comments: r.comments || [],
      realPhotos: r.real_photos || [],
      adoptedHelper: r.adopted_helper || '', foundAt: r.found_at,
      source: r.source || 'manual',
      linkedPurchaseId: r.linked_purchase_id || null,
      createdAt: r.created_at,
      deletedAt: r.deleted_at || null, deletedBy: r.deleted_by || null,
    };
  },
  
  _fromDbPurchase(r) {
    return {
      _id: r.id, _agent_id: r.agent_id,
      orderNo: r.order_no || '',
      platform: r.platform || '',
      productUrl: r.product_url || '',
      sku: r.sku || '',
      productName: r.product_name || '',
      description: r.description || '',
      quantity: r.quantity || 1,
      unitPrice: parseFloat(r.unit_price) || 0,
      totalAmount: parseFloat(r.total_amount) || 0,
      status: r.status || 'draft',
      approvedBy: r.approved_by || '',
      approvedAt: r.approved_at,
      rejectedReason: r.rejected_reason || '',
      orderedAt: r.ordered_at,
      receivedAt: r.received_at,
      screenshots: r.screenshots || [],
      followups: r.followups || [],
      notes: r.notes || '',
      linkedMissingId: r.linked_missing_id || null,
      approvalThreshold: parseFloat(r.approval_threshold) || 2000,
      createdAt: r.created_at,
      deletedAt: r.deleted_at || null,
      deletedBy: r.deleted_by || null,
    };
  },

  // ============ 字段转换 内存 → DB ============
  _toDbOrder(o, userId) {
    return {
      ...(o._id && !o._id.startsWith('O') ? { id: o._id } : {}),
      agent_id: userId,
      order_no: o.orderNo || '', site: o.site || '',
      product: o.product || '', supplier: o.supplier || '',
      status: o.status || 'pending',
      order_date: o.orderDate || null, promised_date: o.promisedDate || null,
      shipped_date: o.shippedDate || null, arrived_date: o.arrivedDate || null,
      next_follow: o.nextFollow || null, notes: o.notes || '',
      screenshots: o.screenshots || [], followups: o.followups || [],
      deleted_at: o.deletedAt || null, deleted_by: o.deletedBy || null,
    };
  },
  _toDbAfter(a, userId) {
    return {
      ...(a._id && !a._id.startsWith('A') ? { id: a._id } : {}),
      agent_id: userId,
      order_no: a.orderNo || '', site: a.site || '',
      product: a.product || '', supplier: a.supplier || '',
      reason: a.reason || '', reason_detail: a.reasonDetail || '',
      status: a.status || 'pending',
      created_date: a.createdDate || null, next_follow: a.nextFollow || null, resolved_date: a.resolvedDate || null,
      screenshots: a.screenshots || [], followups: a.followups || [],
      deleted_at: a.deletedAt || null, deleted_by: a.deletedBy || null,
    };
  },
  _toDbIssue(i, userId) {
    return {
      ...(i._id && !i._id.startsWith('I') ? { id: i._id } : {}),
      agent_id: userId,
      supplier: i.supplier || '', issue_type: i.issueType || '',
      requirement: i.requirement || '', status: i.status || 'pending',
      followups: i.followups || [],
      // V4 R1 新字段
      site: i.site || null,
      category: i.category || null,
      sub_tags: i.subTags || [],
      description: i.description || null,
      created_date: i.createdDate || null,
      screenshots: i.screenshots || [],
      // V4 R2 跟进字段
      next_follow_date: i.nextFollowDate || null,
      deleted_at: i.deletedAt || null, deleted_by: i.deletedBy || null,
    };
  },
  _toDbMissing(m, userId, userName) {
    return {
      ...(m._id && !m._id.startsWith('M') ? { id: m._id } : {}),
      creator_id: m._creator_id || userId,
      creator_name: m.creator || userName,
      description: m.description || '', specs: m.specs || '',
      customer_order_no: m.customerOrderNo || '',
      status: m.status || 'searching',
      screenshots: m.screenshots || [], comments: m.comments || [],
      real_photos: m.realPhotos || [],
      adopted_helper: m.adoptedHelper || null,
      found_at: m.foundAt || null,
      source: m.source || 'manual',
      linked_purchase_id: m.linkedPurchaseId || null,
      deleted_at: m.deletedAt || null, deleted_by: m.deletedBy || null,
    };
  },
  
  _toDbPurchase(p, userId) {
    return {
      ...(p._id && !p._id.startsWith('P') ? { id: p._id } : {}),
      agent_id: userId,
      order_no: p.orderNo || '',
      platform: p.platform || '',
      product_url: p.productUrl || '',
      sku: p.sku || '',
      product_name: p.productName || '',
      description: p.description || '',
      quantity: p.quantity || 1,
      unit_price: p.unitPrice || 0,
      total_amount: p.totalAmount || 0,
      status: p.status || 'draft',
      approved_by: p.approvedBy || null,
      approved_at: p.approvedAt || null,
      rejected_reason: p.rejectedReason || null,
      ordered_at: p.orderedAt || null,
      received_at: p.receivedAt || null,
      screenshots: p.screenshots || [],
      followups: p.followups || [],
      notes: p.notes || '',
      linked_missing_id: p.linkedMissingId || null,
      approval_threshold: p.approvalThreshold || 2000,
      deleted_at: p.deletedAt || null,
      deleted_by: p.deletedBy || null,
    };
  },

  // ============ 同步接口（演示版兼容）============
  getConfig() {
    return {
      agents: this._cache.agents,
      suppliers: this._cache.config.suppliers || [],
      sites: this._cache.config.sites || [],
    };
  },
  saveConfig(cfg) {
    this._cache.agents = cfg.agents || this._cache.agents;
    this._cache.config.suppliers = cfg.suppliers || this._cache.config.suppliers;
    this._cache.config.sites = cfg.sites || this._cache.config.sites;
    // 权限/网站类改动用立即同步（不防抖），避免主管改完跟单立刻刷新看不到
    return this._syncConfigAndAgents();
  },

  getCurrentAgent() { return CURRENT_AGENT; },
  setCurrentAgent(name) { /* 由登录决定，no-op */ },

  // 订单
  getOrders(agent) { return this._cache.ordersByAgent[agent] || []; },
  saveOrders(agent, arr) {
    // V5-2026-05-25: 切换视角下拦截
    if (typeof IS_IMPERSONATING !== 'undefined' && IS_IMPERSONATING) {
      if (typeof toast === 'function') toast('👁 切换视角下不能修改订单 · 请先切回原视角', 'err', 4000);
      return;
    }
    this._cache.ordersByAgent[agent] = arr;
    this._debounce('orders_' + agent, 250, () => fullSyncOrders(agent));
  },

  // 售后
  getAftersales(agent) { return this._cache.aftersalesByAgent[agent] || []; },
  saveAftersales(agent, arr) {
    if (typeof IS_IMPERSONATING !== 'undefined' && IS_IMPERSONATING) {
      if (typeof toast === 'function') toast('👁 切换视角下不能修改售后 · 请先切回原视角', 'err', 4000);
      return;
    }
    this._cache.aftersalesByAgent[agent] = arr;
    this._debounce('after_' + agent, 250, () => fullSyncAftersales(agent));
  },

  // 供应商问题
  getIssues(agent) { return this._cache.issuesByAgent[agent] || []; },
  saveIssues(agent, arr) {
    if (typeof IS_IMPERSONATING !== 'undefined' && IS_IMPERSONATING) {
      if (typeof toast === 'function') toast('👁 切换视角下不能修改供应商问题 · 请先切回原视角', 'err', 4000);
      return;
    }
    this._cache.issuesByAgent[agent] = arr;
    this._debounce('issues_' + agent, 250, () => fullSyncIssues(agent));
  },

  // 找灯
  getMissingLights() { return this._cache.missingLights; },
  saveMissingLights(arr) {
    if (typeof IS_IMPERSONATING !== 'undefined' && IS_IMPERSONATING) {
      if (typeof toast === 'function') toast('👁 切换视角下不能修改找灯 · 请先切回原视角', 'err', 4000);
      return;
    }
    this._cache.missingLights = arr;
    this._debounce('missing', 250, () => fullSyncMissing());
  },
  
  // 线上采购
  getPurchases(agent) { return this._cache.purchasesByAgent[agent] || []; },
  getAllPurchases() {
    const all = [];
    Object.entries(this._cache.purchasesByAgent).forEach(([agent, arr]) => {
      arr.forEach(p => all.push({ ...p, _agent: agent }));
    });
    return all;
  },
  savePurchases(agent, arr) {
    if (typeof IS_IMPERSONATING !== 'undefined' && IS_IMPERSONATING) {
      if (typeof toast === 'function') toast('👁 切换视角下不能修改采购 · 请先切回原视角', 'err', 4000);
      return;
    }
    this._cache.purchasesByAgent[agent] = arr;
    this._debounce('purchases_' + agent, 250, () => fullSyncPurchases(agent));
  },

  // 评分规则
  getScoreRules() {
    return (this._cache.config && this._cache.config.score_rules) || this.defaultScoreRules();
  },
  saveScoreRules(rules) {
    if (this._cache.config) this._cache.config.score_rules = rules;
    this._debounce('rules', 250, () => this._syncScoreRules(rules));
  },
  defaultScoreRules() {
    return {
      missingHelp: 10, orderOnTime: 5, orderOverdue: -3, orderDelivered: 2,
      afterResolved: 3, afterFast: 2, issueResolved: 2, issueEscalated: 3,
    };
  },

  // 催单阈值（PO 派生催单的预警天数列表）
  getChaseThresholds() {
    const v = this._cache.config && this._cache.config.chase_thresholds;
    if (Array.isArray(v) && v.length > 0) {
      return v.map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);
    }
    return [3, 7, 10, 14, 21, 30, 60];  // V5: 7 个阈值更细
  },
  async saveChaseThresholds(arr) {
    if (!IS_ADMIN) throw new Error('只有主管能修改催单阈值');
    const cleaned = (arr || []).map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0);
    const sorted = [...new Set(cleaned)].sort((a, b) => a - b);
    if (this._cache.config) this._cache.config.chase_thresholds = sorted;
    const { error } = await sb.from('config').update({ chase_thresholds: sorted }).eq('id', 1);
    if (error) throw error;
    return sorted;
  },

  // 主管聚合视图
  listAllAgents() { return this._cache.agents; },
  getAllOrders() {
    const all = [];
    Object.entries(this._cache.ordersByAgent).forEach(([agent, arr]) => {
      arr.forEach(o => all.push({ ...o, _agent: agent }));
    });
    return all;
  },
  getAllAftersales() {
    const all = [];
    Object.entries(this._cache.aftersalesByAgent).forEach(([agent, arr]) => {
      arr.forEach(o => all.push({ ...o, _agent: agent }));
    });
    return all;
  },
  getAllIssues() {
    const all = [];
    Object.entries(this._cache.issuesByAgent).forEach(([agent, arr]) => {
      arr.forEach(o => all.push({ ...o, _agent: agent }));
    });
    return all;
  },

  // ============ 内部同步（防抖）============
  _pendingFns: {},
  _debounce(key, ms, fn) {
    if (_isBootstrapping) return;
    clearTimeout(this._syncTimers[key]);
    this._pendingFns[key] = fn;
    setSyncStatus('pending');
    this._syncTimers[key] = setTimeout(() => {
      const f = this._pendingFns[key];
      delete this._pendingFns[key];
      delete this._syncTimers[key];
      if (f) {
        setSyncStatus('syncing');
        f().then(() => setSyncStatus('synced')).catch(err => {
          setSyncStatus('error');
          console.error('Sync error', key, err);
          if (typeof toast === 'function') toast('云端同步失败：' + (err.message || err), 'err');
        });
      }
    }, ms);
  },
  
  _cancelDebounce(key) {
    clearTimeout(this._syncTimers[key]);
    delete this._syncTimers[key];
    delete this._pendingFns[key];
  },
  
  // 立即推送（不 debounce）：用于"明确提交动作"如加跟进、删除、状态切换等
  async saveAndSyncOrders(agent) {
    this._cancelDebounce('orders_' + agent);
    setSyncStatus('syncing');
    try { await fullSyncOrders(agent); setSyncStatus('synced'); }
    catch (err) { setSyncStatus('error'); throw err; }
  },
  async saveAndSyncAftersales(agent) {
    this._cancelDebounce('after_' + agent);
    setSyncStatus('syncing');
    try { await fullSyncAftersales(agent); setSyncStatus('synced'); }
    catch (err) { setSyncStatus('error'); throw err; }
  },
  async saveAndSyncIssues(agent) {
    this._cancelDebounce('issues_' + agent);
    setSyncStatus('syncing');
    try { await fullSyncIssues(agent); setSyncStatus('synced'); }
    catch (err) { setSyncStatus('error'); throw err; }
  },
  async saveAndSyncMissing() {
    this._cancelDebounce('missing');
    setSyncStatus('syncing');
    try { await fullSyncMissing(); setSyncStatus('synced'); }
    catch (err) { setSyncStatus('error'); throw err; }
  },
  async saveAndSyncPurchases(agent) {
    this._cancelDebounce('purchases_' + agent);
    setSyncStatus('syncing');
    try { await fullSyncPurchases(agent); setSyncStatus('synced'); }
    catch (err) { setSyncStatus('error'); throw err; }
  },
  
  // 立即执行所有 pending 的同步（关闭 modal 时调用，保证数据落库）
  flushPending() {
    Object.keys(this._pendingFns).forEach(key => {
      clearTimeout(this._syncTimers[key]);
      const f = this._pendingFns[key];
      delete this._pendingFns[key];
      delete this._syncTimers[key];
      if (f) f().catch(err => {
        console.error('Flush sync error', key, err);
        if (typeof toast === 'function') toast('云端同步失败：' + (err.message || err), 'err');
      });
    });
  },

  async _syncConfigAndAgents() {
    if (!IS_ADMIN) return;
    await sb.from('config').update({
      suppliers: this._cache.config.suppliers,
      sites: this._cache.config.sites,
    }).eq('id', 1);
    // 同步每个 agent 的 sites / modules / isAdmin
    for (const a of this._cache.agents) {
      if (a._userId) {
        await sb.from('agents').update({
          name: a.name,
          is_admin: a.isAdmin,
          sites: a.sites || [],
          modules: a.modules || [],
        }).eq('user_id', a._userId);
      }
    }
  },

  async _syncScoreRules(rules) {
    if (!IS_ADMIN) return;
    await sb.from('config').update({ score_rules: rules }).eq('id', 1);
  },
};

// ============================================================
// 全量同步函数（防抖触发）
// ============================================================
async function fullSyncOrders(agentName) {
  const a = CONFIG.agents.find(x => x.name === agentName);
  if (!a || !a._userId) return;
  const userId = a._userId;
  const arr = DATA._cache.ordersByAgent[agentName] || [];

  const { data: existing } = await sb.from('orders').select('id').eq('agent_id', userId);
  const existingIds = new Set((existing || []).map(o => o.id));
  const localIds = new Set(arr.map(o => o._id).filter(id => id && !id.startsWith('O')));

  const toDelete = [...existingIds].filter(id => !localIds.has(id));
  if (toDelete.length > 0) {
    await sb.from('orders').delete().in('id', toDelete);
  }

  const inserts = arr.filter(o => !o._id || o._id.startsWith('O')).map(o => DATA._toDbOrder(o, userId));
  const updates = arr.filter(o => o._id && !o._id.startsWith('O')).map(o => DATA._toDbOrder(o, userId));

  if (updates.length > 0) {
    const { error } = await sb.from('orders').upsert(updates);
    if (error) throw error;
  }
  if (inserts.length > 0) {
    const { data, error } = await sb.from('orders').insert(inserts).select();
    if (error) throw error;
    // 回填真实 UUID
    let i = 0;
    for (const o of arr) {
      if (!o._id || o._id.startsWith('O')) {
        if (data[i]) {
          const oldId = o._id;
          o._id = data[i].id;
          o._agent_id = userId;
          // 如果当前 modal 打开的就是这个订单，同步更新 _currentItemId
          if (typeof _currentItemId !== 'undefined' && _currentItemId === oldId) {
            _currentItemId = o._id;
          }
          i++;
        }
      }
    }
  }
}

async function fullSyncAftersales(agentName) {
  const a = CONFIG.agents.find(x => x.name === agentName);
  if (!a || !a._userId) return;
  const userId = a._userId;
  const arr = DATA._cache.aftersalesByAgent[agentName] || [];

  const { data: existing } = await sb.from('aftersales').select('id').eq('agent_id', userId);
  const existingIds = new Set((existing || []).map(o => o.id));
  const localIds = new Set(arr.map(o => o._id).filter(id => id && !id.startsWith('A')));

  const toDelete = [...existingIds].filter(id => !localIds.has(id));
  if (toDelete.length > 0) {
    await sb.from('aftersales').delete().in('id', toDelete);
  }

  const inserts = arr.filter(o => !o._id || o._id.startsWith('A')).map(o => DATA._toDbAfter(o, userId));
  const updates = arr.filter(o => o._id && !o._id.startsWith('A')).map(o => DATA._toDbAfter(o, userId));

  if (updates.length > 0) {
    const { error } = await sb.from('aftersales').upsert(updates);
    if (error) throw error;
  }
  if (inserts.length > 0) {
    const { data, error } = await sb.from('aftersales').insert(inserts).select();
    if (error) throw error;
    let i = 0;
    for (const o of arr) {
      if (!o._id || o._id.startsWith('A')) {
        if (data[i]) {
          const oldId = o._id;
          o._id = data[i].id;
          o._agent_id = userId;
          if (typeof _currentItemId !== 'undefined' && _currentItemId === oldId) {
            _currentItemId = o._id;
          }
          i++;
        }
      }
    }
  }
}

async function fullSyncIssues(agentName) {
  const a = CONFIG.agents.find(x => x.name === agentName);
  if (!a || !a._userId) return;
  const userId = a._userId;
  const arr = DATA._cache.issuesByAgent[agentName] || [];

  const { data: existing } = await sb.from('issues').select('id').eq('agent_id', userId);
  const existingIds = new Set((existing || []).map(o => o.id));
  const localIds = new Set(arr.map(o => o._id).filter(id => id && !id.startsWith('I')));

  const toDelete = [...existingIds].filter(id => !localIds.has(id));
  if (toDelete.length > 0) {
    await sb.from('issues').delete().in('id', toDelete);
  }

  const inserts = arr.filter(o => !o._id || o._id.startsWith('I')).map(o => DATA._toDbIssue(o, userId));
  const updates = arr.filter(o => o._id && !o._id.startsWith('I')).map(o => DATA._toDbIssue(o, userId));

  if (updates.length > 0) {
    const { error } = await sb.from('issues').upsert(updates);
    if (error) throw error;
  }
  if (inserts.length > 0) {
    const { data, error } = await sb.from('issues').insert(inserts).select();
    if (error) throw error;
    let i = 0;
    for (const o of arr) {
      if (!o._id || o._id.startsWith('I')) {
        if (data[i]) {
          const oldId = o._id;
          o._id = data[i].id;
          o._agent_id = userId;
          if (typeof _currentItemId !== 'undefined' && _currentItemId === oldId) {
            _currentItemId = o._id;
          }
          i++;
        }
      }
    }
  }
}

async function fullSyncMissing() {
  const arr = DATA._cache.missingLights;

  // 找灯：所有人共享，按 id 同步
  const { data: existing } = await sb.from('missing_lights').select('id');
  const existingIds = new Set((existing || []).map(o => o.id));
  const localIds = new Set(arr.map(o => o._id).filter(id => id && !id.startsWith('M')));

  // 只删除自己创建的（RLS 控制）
  const toDelete = [...existingIds].filter(id => !localIds.has(id));
  if (toDelete.length > 0) {
    await sb.from('missing_lights').delete().in('id', toDelete);
  }

  const inserts = arr.filter(o => !o._id || o._id.startsWith('M')).map(o => DATA._toDbMissing(o, CURRENT_USER_ID, CURRENT_AGENT));
  const updates = arr.filter(o => o._id && !o._id.startsWith('M')).map(o => DATA._toDbMissing(o, CURRENT_USER_ID, CURRENT_AGENT));

  if (updates.length > 0) {
    const { error } = await sb.from('missing_lights').upsert(updates);
    if (error) throw error;
  }
  if (inserts.length > 0) {
    const { data, error } = await sb.from('missing_lights').insert(inserts).select();
    if (error) throw error;
    let i = 0;
    for (const o of arr) {
      if (!o._id || o._id.startsWith('M')) {
        if (data[i]) {
          const oldId = o._id;
          o._id = data[i].id;
          o._creator_id = data[i].creator_id;
          if (typeof _currentItemId !== 'undefined' && _currentItemId === oldId) {
            _currentItemId = o._id;
          }
          i++;
        }
      }
    }
  }
}

async function fullSyncPurchases(agentName) {
  const me = DATA._cache.agents.find(a => a.name === agentName);
  if (!me) return;
  const userId = me._userId;
  const arr = DATA._cache.purchasesByAgent[agentName] || [];

  const { data: existing } = await sb.from('online_purchases').select('id').eq('agent_id', userId);
  const existingIds = new Set((existing || []).map(x => x.id));
  const localIds = new Set(arr.map(p => p._id).filter(id => id && !id.startsWith('P')));

  const toDelete = [...existingIds].filter(id => !localIds.has(id));
  if (toDelete.length > 0) {
    await sb.from('online_purchases').delete().in('id', toDelete);
  }

  const inserts = arr.filter(p => !p._id || p._id.startsWith('P')).map(p => DATA._toDbPurchase(p, userId));
  const updates = arr.filter(p => p._id && !p._id.startsWith('P')).map(p => DATA._toDbPurchase(p, userId));

  if (updates.length > 0) {
    const { error } = await sb.from('online_purchases').upsert(updates);
    if (error) throw error;
  }
  if (inserts.length > 0) {
    const { data, error } = await sb.from('online_purchases').insert(inserts).select();
    if (error) throw error;
    let i = 0;
    for (const p of arr) {
      if (!p._id || p._id.startsWith('P')) {
        if (data[i]) {
          const oldId = p._id;
          p._id = data[i].id;
          p._agent_id = userId;
          if (typeof _currentItemId !== 'undefined' && _currentItemId === oldId) {
            _currentItemId = p._id;
          }
          i++;
        }
      }
    }
  }
}

// ============ 全局状态 ============
let CONFIG = DATA.getConfig();  // 空配置，bootstrap 后填充
let CURRENT_AGENT = null;       // 字符串：当前账号姓名
let IS_ADMIN = false;
let IS_BOSS = false;            // V4-2026-05-24: 老板角色(比主管更高)

// V5-2026-05-25: 视角切换(impersonation)系统
// 老板可切换到任何账户视角；主管可切换到普通员工视角
// 切换后处于"只读模式" — 不能改数据,避免误操作员工的数据
let ORIGINAL_AGENT = null;      // 真实身份(登录时的)
let ORIGINAL_IS_ADMIN = false;
let ORIGINAL_IS_BOSS = false;
let IS_IMPERSONATING = false;   // 是否处于切换视角状态
let CURRENT_TAB = 'orders';     // orders | aftersales | issues | missing | purchases | performance
let ORDERS = [];
let AFTERSALES = [];
let ISSUES = [];
let MISSING_LIGHTS = [];        // 共享数据
let PURCHASES = [];             // 线上采购

// === 催单系统（V3 改造：从 PO 派生）===
let CHASE_ORDERS = [];          // 派生的催单数据（来自 PO 表 po_number IS NOT NULL 且未发货）
let ALL_PO_ORDERS = [];         // 所有 PO（含已发货已到货）—— 供绩效统计等需要历史数据的模块用
let _chaseThresholdFilter = 0;  // 0=全部，>0=按 N 天阈值过滤
let _chaseLastLoad = 0;         // 上次加载时间（用于缓存判断）

let _currentItemId = null;
let _currentItemType = null;     // 当前打开的 modal 类型
let _newScreenshots_orig = [];   // 主截图待保存
let _newScreenshots_fu = [];     // 跟进截图待保存
let _currentFuType = 'chase';
let _pasteTarget = null;          // 当前焦点的拖放区，'orig' | 'fu'
let _ordersFbTab = 'overdue';
let _asFbTab = 'overdue';

// ============ 常量 ============
const ORDER_STATUS_LABELS = {
  pending: '待下采购', producing: '生产中', shipped: '已发货',
  arrived: '已到货', cancelled: '取消',
  // V5-2026-05-24 补全 PO 派生可能用到的状态
  pending_approval: '待审批', approved: '已批准',
  rejected: '已驳回',
};
const AFTER_STATUS_LABELS = {
  pending: '待处理', contacting: '沟通中', repairing: '返修中',
  resolved: '已解决', cancelled: '已取消',
};
const ISSUE_STATUS_LABELS = {
  pending: '待沟通', in_progress: '沟通中',
  resolved: '已解决', escalated: '已升级老板',
};
const MISSING_STATUS_LABELS = {
  searching: '搜寻中', found: '已找到', abandoned: '已放弃',
};
const ORDER_TYPE_LABELS = {
  chase: '💬 催单', response: '📨 供应商反馈',
  ship: '🚚 发货通知', arrive: '📦 到货', other: '📌 其他',
};
const REASON_LIST = ['产品瑕疵','给错货物','缺配件','功能故障','物流损坏','安装问题','不符预期','其他'];
const REASON_TREE = {
  '产品瑕疵': {
    icon: '⚠',
    subs: ['喷漆不良/掉漆', '有划痕/磨损', '生锈/氧化', '玻璃破损/裂纹', '亚克力变形/发黄', '焊点开裂', '材质问题', '污渍/胶痕', '其他瑕疵']
  },
  '给错货物': {
    icon: '🔄',
    subs: ['款式错误（要 A 给 B）', '颜色错误（如白→黑）', '数量错误（要 2 给 1）', '尺寸错误', '型号错误', '替换货未通知', '其他给错']
  },
  '缺配件': {
    icon: '🧩',
    subs: ['缺光源/灯泡', '缺驱动/电源', '缺遥控器', '缺安装件（螺丝/挂板）', '缺装饰件（吊坠/水晶等）', '缺连接线/灯头线', '缺说明书', '其他缺件']
  },
  '功能故障': {
    icon: '⚡',
    subs: ['电压错误（如要 110V 给 220V）', '光源不对（如要单色给三色）', '调光不对（如要可控硅给常规）', '不亮 / 闪烁 / 不稳', '开关不灵 / 损坏', '蓝牙 / 智能控制问题', '光源亮度不达标', '色温不对', '其他功能问题']
  },
  '物流损坏': {
    icon: '📦',
    subs: ['运输压破', '包装破损', '货物丢失/少箱', '运输延误', '其他物流问题']
  },
  '安装问题': {
    icon: '🔧',
    subs: ['尺寸不符', '配件不匹配', '说明书不清/缺失', '安装结构问题', '其他安装问题']
  },
  '不符预期': {
    icon: '😕',
    subs: ['客户主观因素', '色差较大', '风格不符', '尺寸偏大/偏小', '材质感不符', '其他不符']
  },
  '其他': {
    icon: '📌',
    subs: ['请在详情说明']
  }
};

// 订单号格式提示（按网站）
const ORDER_NO_FORMAT = {
  VK: 'K114176 或 V114176',
  DC: 'DC114176',
  RD: 'RD114176',
  DF: 'DF114176',
  MH: 'MH114176',
  MJ: 'MJ114176',
  ML: 'ML114176',
  RS: 'RS114176',
  LS: 'LS114176',
  PL: 'PL114176',
  '线下': '自定义编号',
};

// 所有模块（用于权限控制）· V4：按业务流程顺序排列（销售单 → 采购单 → 催单 → 异常处理 → 财务收货 → 档案 → 报表）
const ALL_MODULES = [
  { key: 'sales', label: '📥 销售单' },
  { key: 'po', label: '📦 采购单' },
  { key: 'orders', label: '📋 催单' },
  { key: 'missing', label: '🔍 找灯' },
  { key: 'purchases', label: '🛒 线上采购' },
  { key: 'aftersales', label: '🔧 售后' },
  { key: 'issues', label: '⚠ 供应商问题' },
  { key: 'finance', label: '✓ 财务收货' },
  { key: 'products', label: '📚 产品' },
  { key: 'consolidation', label: '🧊 合箱' },
  { key: 'performance', label: '📊 绩效' },
];
const ALL_MODULE_KEYS = ALL_MODULES.map(m => m.key);

// 默认供应商列表（首次部署/清空后会自动恢复）
const DEFAULT_SUPPLIERS = [
  "3D打印",
  "7号灯饰",
  "DAWN艺术居",
  "HOGO",
  "casa",
  "e家/乔茜",
  "一号货仓/灯格",
  "一启",
  "一束光",
  "一枝灯饰",
  "一荣",
  "七分光",
  "万伟",
  "万象",
  "世澜/红林",
  "东堡",
  "东舜",
  "东辰",
  "东龙",
  "中慧",
  "中鸿",
  "丰欧电子",
  "丽林",
  "义婷",
  "乔通塑料",
  "九九灯饰",
  "九岸/图尔光电",
  "云家",
  "云雨",
  "亚穆",
  "京派",
  "亮宇",
  "亮家优品",
  "亿众",
  "亿品豪",
  "亿鑫",
  "什么灯饰",
  "任何照明",
  "伊思莱",
  "伊晨",
  "伊诺",
  "众超",
  "优大",
  "优悦",
  "伟煜",
  "伟煜树脂",
  "伯尔",
  "伯德/柏丰",
  "佐恩",
  "佑丰",
  "佛光配件",
  "佰款",
  "佰跃",
  "佳佳",
  "佳和",
  "佳德来",
  "佳易",
  "依诺",
  "保罗",
  "信得",
  "信达",
  "值总/白舟",
  "健锋",
  "允控",
  "元亨/佰宝/元宝",
  "元品",
  "元物",
  "兆虹",
  "光之屋",
  "光之影",
  "光天使",
  "光尚",
  "光方（扶桑树）",
  "光无垠",
  "光源陈列馆",
  "光艺能",
  "光辑",
  "光遇",
  "光韵",
  "克鲁格",
  "兰膏",
  "兴宾",
  "其明",
  "典灯",
  "凌戈/森明",
  "凡克",
  "凡居",
  "凡非",
  "凯丽扬",
  "凯丽琪",
  "凯创",
  "凯泰",
  "凯瑞思",
  "刘强",
  "创佳",
  "创古奇",
  "创居乐",
  "创意",
  "创意欣",
  "创慧",
  "创灯饰",
  "创艺",
  "创艺轩/鸿昇",
  "初芯",
  "利佳",
  "利元灯饰",
  "利濠木艺",
  "力创",
  "北斗星光艺",
  "北欧美家",
  "北淮",
  "匠侬",
  "匠心",
  "匠舍",
  "十八号灯铺",
  "千宏",
  "千灯坊",
  "千灯汇",
  "千誉",
  "华丽",
  "华佳/华之佳",
  "华品",
  "华德",
  "华林/雅盛（迎隆）",
  "华浩",
  "华灯",
  "华美旺家",
  "华荣",
  "华诗源",
  "南宫",
  "南航",
  "南辰",
  "博森",
  "博米",
  "博美",
  "卡奈积/大前门",
  "卡柏",
  "卡梅尔",
  "卡铂",
  "厚蒙",
  "原御家居",
  "原艺工坊",
  "叁叁",
  "双闪",
  "古古",
  "古风",
  "古高尔",
  "吉吉",
  "吉朗达",
  "名丰",
  "名灯惠",
  "向月",
  "君渡",
  "启光",
  "启明",
  "启点",
  "启高",
  "周锋",
  "和盛",
  "品匠",
  "品执",
  "品月",
  "品识",
  "品诚",
  "哥德利",
  "唯尔特",
  "唯展（魅艺）",
  "商意",
  "商朵",
  "喜唐",
  "喜灯",
  "嘉世",
  "嘉业",
  "嘉仕达",
  "嘉帝",
  "嘉美/二星",
  "因得",
  "国雅",
  "图雅钛金",
  "圈圈灯/寻光灯饰",
  "圣立",
  "域上",
  "域见",
  "培宇",
  "塔斯灯",
  "壕琳",
  "壹巢灯饰",
  "壹米滴答",
  "夏月（顺其）",
  "夏洛",
  "夕阳灯",
  "大前门",
  "大理石万家灯饰",
  "大鹏五金",
  "天宇",
  "天畅",
  "太沃/沃盟",
  "奇异之光",
  "奈特",
  "奎光",
  "奕博",
  "奢灯/汝好",
  "奥伦欧",
  "奥康",
  "奥梦",
  "好利欧",
  "好友",
  "好美仕",
  "威威五金",
  "子衿",
  "宇佳",
  "宇宸",
  "宇阁",
  "守灯",
  "安信",
  "宏品/日月明光",
  "宏明",
  "宏通",
  "定忠/喜盈门",
  "宜安",
  "宝佳",
  "实丰照明",
  "室内户外壁灯/候月",
  "家印",
  "寅平",
  "封口胶",
  "尊御",
  "小品光电",
  "小庭苑",
  "小陈风知名",
  "尚异",
  "尚成",
  "尚承",
  "尚晟",
  "尼德兰",
  "居景",
  "居里扬",
  "展总蚕丝灯",
  "巨信螺丝",
  "希得利",
  "希曼达",
  "帝豪",
  "常瑞",
  "康佑",
  "康瑞",
  "康童",
  "开辕",
  "弗莱斯",
  "彩绘/全汉",
  "彼莎",
  "徐广林",
  "德鑫铝管",
  "德钰",
  "心意",
  "忆晨",
  "忆涵",
  "志森",
  "志爱",
  "思佳/开心灯饰",
  "恋家",
  "惠土",
  "意饰",
  "慕佳",
  "慕意",
  "慕橙",
  "戎光",
  "护角/昱科包装",
  "拾尚",
  "振豪",
  "接线端子",
  "摩天轮/创唯",
  "摩派",
  "摩灯拾光",
  "摩灯空间",
  "摩翼",
  "摩艾佳",
  "敏行天下",
  "数据安全系统",
  "斌新",
  "斓斑",
  "斯卡兰",
  "新悦",
  "新望",
  "新源",
  "新爵",
  "新越",
  "新辉",
  "新迪/米琳",
  "新鑫小鸟",
  "方佳圆",
  "旧胡同",
  "旭牛",
  "旺盈/南兮",
  "昂克赛斯",
  "昂德斯",
  "明创",
  "明影",
  "明晨",
  "明玥/古钥",
  "星之朗",
  "星庭煌佳",
  "星星灯",
  "星星灯饰",
  "星星点灯",
  "星晨",
  "星灯阁/雨鑫",
  "星诚",
  "晋南水晶",
  "晨曦/心烁",
  "普球",
  "景致",
  "智程电脑",
  "智艺",
  "曾总",
  "月光领域",
  "有盏灯",
  "朋友圈",
  "朗元",
  "朗图",
  "朝辉五金",
  "木友",
  "木本色",
  "木艺线条灯/木噫",
  "本杰明",
  "权景电线",
  "权浩",
  "杭成",
  "杰尔特",
  "杰灯饰",
  "极物坊",
  "林邦",
  "柏慕",
  "柯胜（柯盛）",
  "格丹",
  "格度",
  "格灵",
  "桃缘茗",
  "梓瑞",
  "梦艺",
  "梵可",
  "梵影",
  "梵梦",
  "梵生",
  "梵简",
  "森木",
  "森源",
  "森耀",
  "楷丰",
  "楷铧",
  "樊灯",
  "欣之亮",
  "欣悦",
  "欣新广告",
  "欣煜",
  "欣辰",
  "欧伯伲",
  "欧佛尼",
  "欧华帝豪",
  "欧司/南帝",
  "欧宇",
  "欧文卡莱",
  "欧晋",
  "欧西曼/安瑞斯",
  "正兴",
  "正天",
  "正特大齐",
  "正飞/艺晨",
  "毅浩",
  "毅诚泡沫",
  "江松",
  "泉红",
  "泓运/泓亮",
  "法拉盛",
  "泽曼",
  "洛奥灯饰",
  "海伦铜灯/8号铜灯",
  "海辉",
  "淘之苑",
  "淘宝吾爱灯",
  "淘宝品艺",
  "淘宝曼灯饰",
  "淘宝灯也",
  "淘宝灯小白",
  "淘宝美尼思",
  "淘宝腾达",
  "淘宝艺术居",
  "淘淘居",
  "清韵",
  "源尚居",
  "潮漫照明",
  "澳兰",
  "澳宸",
  "澳怡/中雅",
  "澳斯米兰",
  "澳特斯/澳迪斯",
  "灏龙",
  "火花球",
  "火车头/HCT灯饰",
  "灯世界",
  "灯光画",
  "灯可爱",
  "灯奇",
  "灯巢",
  "灯工坊",
  "灯火之家",
  "灯百汇",
  "灯语堡/匠舍",
  "灯调工作室",
  "灯迷",
  "灯都精灵",
  "灯阁",
  "灯革",
  "灯顶",
  "灯风尚",
  "炎源",
  "炎锋",
  "炜英纸箱厂",
  "焜昱",
  "焱阳",
  "煜明",
  "煜祥",
  "熠皓",
  "爱家/乐居",
  "爱家居",
  "爱灯堡",
  "爱碧儿/伊维克",
  "王庭灯饰",
  "玖正居",
  "玥澄灯饰",
  "玩灯/壹号货仓",
  "琪琪",
  "琪琳",
  "琼瑶",
  "瑞希",
  "璀璨",
  "畅腾/新中式全铜",
  "百欧/星辰",
  "百涞福",
  "的光",
  "皇玛/天乐",
  "盈煌",
  "盛源",
  "盛腾",
  "盛迈芮",
  "知礼礼品",
  "福布斯",
  "禹哲",
  "禾牛",
  "秦泰数控",
  "立嘉",
  "立美",
  "筑雅居（界雅）",
  "简隆",
  "米丰",
  "米修",
  "素说",
  "红灵",
  "纬特",
  "纽思",
  "维比娅",
  "缔烁",
  "网艺",
  "罗丹凯",
  "美尼思",
  "美洛",
  "群希",
  "羿轩",
  "翔可",
  "翔美",
  "联辰",
  "聚慧",
  "胜辰",
  "腾屹铜",
  "腾达",
  "腾远亚克力",
  "致简",
  "致诚（铜点）",
  "臻盛",
  "艺仟",
  "艺佳",
  "艺博/谢俊铠",
  "艺尚",
  "艺恺",
  "艺戈",
  "艺构/米艺",
  "艺源",
  "艺灯灯饰",
  "艺灯集",
  "艺灯饰",
  "艺盟",
  "艺维",
  "艺臣",
  "艺航木箱",
  "艾嘉",
  "艾尚",
  "艾格",
  "芊顷",
  "荣泰",
  "荣缔时光",
  "荣达",
  "莱伽",
  "莱斯欧",
  "莱美之光",
  "莱雅/觅高",
  "营辉/洋影/初色",
  "蓝屋优美达",
  "蓝恩",
  "蓝海",
  "蓝溪阁",
  "蓝色星空",
  "蔡小姐",
  "蜜匠",
  "触摸款台灯/骏瑞照明",
  "诺依",
  "谱光师（家典）",
  "豪品",
  "豪品欣怡/豪品",
  "豪洁",
  "豫鑫",
  "财凤",
  "赫卡",
  "赫蒙",
  "赵璐/四玺文化/恰北北",
  "起点照明/艾登",
  "路易",
  "轩业",
  "辉企",
  "辉钜",
  "辰光水晶",
  "辰辉",
  "迈科祺",
  "远图",
  "远芬",
  "迪圣奇户外灯",
  "迪派斯",
  "迪都",
  "追潮",
  "逆光",
  "道艺",
  "酷艺",
  "金丝燕",
  "金希",
  "金水木灯",
  "金艺/金艺轩",
  "金辉",
  "鑫仂仕",
  "鑫壮",
  "鑫琪",
  "鑫美居",
  "鑫耀",
  "钰煌",
  "铂泰",
  "铂洁",
  "铜城",
  "铜密码",
  "铜欢喜",
  "铜盟",
  "铜艺五金厂",
  "铜艺美",
  "铭丰",
  "铭峰",
  "铭豪",
  "锐铭",
  "锦之星",
  "锦典",
  "锦绣之光",
  "镁镁",
  "长江铜件",
  "闽皇森",
  "闽航",
  "阁楼厂",
  "阿朵灯饰",
  "阿玛拉",
  "陈总光立方",
  "雅诗曼（众鑫）",
  "集品会",
  "集美",
  "雪丰",
  "零点壹",
  "零维",
  "雷克森/熔岩/偶遇",
  "雷汉尼/北郡",
  "顺成",
  "顺盈",
  "飞翔五金厂",
  "飞腾",
  "香奈儿",
  "馨妍",
  "馨恒",
  "高信",
  "高巧",
  "鸿光轨道盒",
  "鸿兴",
  "鸿庭",
  "鸿灯饰",
  "鸿益",
  "鸿跃",
  "鸿运加工厂",
  "鸿鑫",
  "鸿鹏",
  "鹏程",
  "鹤洲",
  "鹿森堡",
  "鹿角灯",
  "麦佳",
  "麦克优选",
  "麦德哆",
  "麦浪",
  "麦灯",
  "黄凤容",
  "黯光",
  "鼎欧",
  "鼎胜",
  "鼎腾",
  "龙昌",
  "龙映",
  "龙珠阁/本鼎光电",
  "亿源",
  "左尚",
  "往后余生",
  "星沃",
  "木修远/黄太阳",
  "淘缘",
  "灯匠",
  "艺岚",
  "万冠萤火虫",
  "中木",
  "丽道",
  "佑劲/佑莱",
  "佳文骏/三洪",
  "佳缘/佳家",
  "倾慕一居",
  "光朗",
  "凝聚",
  "几何",
  "凡品",
  "华晟",
  "宏壮/宏装",
  "家乐",
  "富达",
  "居皇",
  "广瑞",
  "弘文/弘易",
  "恒福来",
  "斯克诺",
  "新匠",
  "晟辉",
  "极星/艺星/优亮灯饰",
  "梵烨",
  "汉升",
  "泰聚",
  "润明",
  "灯博饰",
  "灿若星",
  "爱丹/艾丹",
  "玖悦/玛瑙",
  "琪光",
  "登匠",
  "祥成",
  "祥瑞光源",
  "秀木坊",
  "立民",
  "糖果（原塔塔）",
  "罗尔斯特",
  "羽浩（祺鑫）",
  "耀广厂",
  "老良木箱",
  "自然源/自然木艺",
  "艺涵",
  "豪鸿",
  "迪澳灯饰",
  "通明",
  "金泰源",
  "铭锋",
  "隆康包装",
  "霓禾",
  "领杭",
  "飞利浦/博发",
  "鸵鸟毛",
  "鸿粤"
];


let SCORE_RULES = DATA.getScoreRules();

// ============ 初始化 ============
// ============================================================
// Bootstrap：启动流程（检查登录 → 加载数据 → 显示主界面）
// ============================================================
async function bootstrap() {
  try {
    // 1. 检查 session
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      showLoginScreen();
      return;
    }

    // 2. 登录成功，初始化
    await onAuthSuccess(session);
  } catch (err) {
    console.error('Bootstrap error:', err);
    showLoginScreen();
    showLoginError('启动失败：' + (err.message || err));
  }
}

async function onAuthSuccess(session) {
  CURRENT_USER_ID = session.user.id;
  CURRENT_USER_EMAIL = session.user.email;

  // 加载所有数据
  document.getElementById('loadingScreen').style.display = 'flex';
  document.getElementById('loginScreen').style.display = 'none';

  try {
    await DATA.loadAll();
  } catch (err) {
    console.error('Load data error:', err);
    showLoginError('加载数据失败：' + (err.message || err) + '。请联系主管。');
    await sb.auth.signOut();
    showLoginScreen();
    return;
  }

  // 更新 CONFIG
  CONFIG = DATA.getConfig();
  SCORE_RULES = DATA.getScoreRules();

  // 找到当前用户对应的 agent
  const agent = CONFIG.agents.find(a => a._userId === CURRENT_USER_ID);
  if (!agent) {
    showLoginError('账号未授权（agents 表中没有此用户）。请联系主管在 agents 表添加记录。');
    await sb.auth.signOut();
    showLoginScreen();
    return;
  }

  CURRENT_AGENT = agent.name;
  IS_ADMIN = agent.isAdmin;
  IS_BOSS = !!agent.isBoss;       // V4: 老板角色
  if (IS_BOSS) IS_ADMIN = true;   // 老板自动拥有主管权限

  // V5-2026-05-25: 记录真实身份(切换视角时要能切回)
  ORIGINAL_AGENT = CURRENT_AGENT;
  ORIGINAL_IS_ADMIN = IS_ADMIN;
  ORIGINAL_IS_BOSS = IS_BOSS;
  IS_IMPERSONATING = false;

  // 主管可见"📈 数据" tab
  const tabAna = document.getElementById('tabAnalytics');
  if (tabAna) tabAna.style.display = IS_ADMIN ? '' : 'none';

  // bootstrap 完成，允许同步触发
  _isBootstrapping = false;

  // 订阅 agents 表实时变化（主管改权限时，跟单端无需刷新即可生效）
  subscribeAgentsRealtime();

  // 初始化 UI
  initUI();
  showMainApp();
}

// ============================================================
// Realtime: 订阅 agents 表，权限变更实时同步到客户端
// ============================================================
let _agentsChannel = null;
function subscribeAgentsRealtime() {
  // 防止重复订阅
  if (_agentsChannel) {
    try { sb.removeChannel(_agentsChannel); } catch (e) {}
    _agentsChannel = null;
  }
  _agentsChannel = sb.channel('agents-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, async (payload) => {
      try {
        // 🐛 修复：先读旧值（在覆盖 CONFIG.agents 之前！），否则 oldModules 永远等于 newModules
        const meBefore = (CONFIG.agents || []).find(a => a.name === CURRENT_AGENT);
        const oldModules = JSON.stringify((meBefore || {}).modules || []);
        const oldIsAdmin = (meBefore || {}).isAdmin;

        // 拉最新 agents 数据
        const { data: agentRows } = await sb.from('agents').select('*');
        if (!agentRows) return;
        const fresh = agentRows.map(a => ({
          _userId: a.user_id,
          name: a.name,
          isAdmin: a.is_admin,
          isBoss: !!a.is_boss,       // V4-2026-05-24: 老板角色
          sites: a.sites || [],
          modules: a.modules || [...ALL_MODULE_KEYS],
        }));
        DATA._cache.agents = fresh;
        CONFIG.agents = fresh;

        // 检查当前用户的权限是否变更
        const me = fresh.find(a => a._userId === CURRENT_USER_ID);
        if (!me) return;

        // 自己被改成主管 / 取消主管 → 重新登录最稳妥
        if (me.isAdmin !== oldIsAdmin) {
          IS_ADMIN = me.isAdmin;
          toast('您的主管身份已变更，3 秒后自动刷新...', 'warn', 3000);
          setTimeout(() => location.reload(), 3000);
          return;
        }

        // 普通跟单的模块/网站变更，直接应用（与覆盖前的旧值对比）
        const newModules = JSON.stringify(me.modules || []);
        if (oldModules !== newModules) {
          applyModuleVisibility();
          if (!IS_ADMIN) toast('🔄 您的可见模块已被主管更新');
        }

        // 主管视角下，设置面板如果开着就刷新
        if (IS_ADMIN && document.getElementById('settingsModal')?.classList.contains('show')) {
          renderSettings();
        }
      } catch (err) {
        console.error('Realtime agents 处理失败:', err);
      }
    })
    .subscribe();
}

function initUI() {
  const today = new Date().toISOString().slice(0, 10);
  ['omNewDate','asmNewDate','ismNewDate','asmCreatedDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
  const rm = document.getElementById('reportMonth');
  if (rm) rm.textContent = today.slice(0, 7);

  // 直接登录当前用户（不弹 Agent Picker）
  loginAs(CURRENT_AGENT);
}

function showLoginScreen() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  // V5-W3-2026-05-26: 显示主应用后立刻应用用户的 tab 布局
  setTimeout(() => { if (typeof applyTabLayout === 'function') applyTabLayout(); }, 50);
  // V20260526q: 登录后加一条 appEntry 历史 · 用户点返回时能被 popstate 监听到 · 不会直接跳出应用
  try {
    if (!window.history.state || !window.history.state.appTab) {
      window.history.pushState({ appEntry: true }, '', window.location.href);
    }
  } catch(_) {}
}

// ============================================================
// V4-2026-05-24: 登录错误提示增强
// 之前:错误信息小、英文、无视觉反馈 → 用户以为"没反应"
// 现在:中文化 + 大字 + 抖动 + 输入框红边 + 强制 loading
// ============================================================

// 注入抖动动画 CSS(一次性)
(function _injectLoginErrorCSS() {
  if (document.getElementById('login-error-style')) return;
  const s = document.createElement('style');
  s.id = 'login-error-style';
  s.textContent = `
    @keyframes loginShake {
      0%, 100% { transform: translateX(0); }
      15%, 45%, 75% { transform: translateX(-8px); }
      30%, 60%, 90% { transform: translateX(8px); }
    }
    @keyframes loginErrorFadeIn {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .login-shake { animation: loginShake 0.4s ease-in-out; }
    .login-input-error {
      border-color: #dc2626 !important;
      background: #fef2f2 !important;
      box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12) !important;
    }
    #loginError.show {
      display: flex !important;
      align-items: center;
      gap: 8px;
      font-size: 14px !important;
      font-weight: 600;
      padding: 12px 14px !important;
      border-left: 4px solid #dc2626 !important;
      animation: loginErrorFadeIn 0.3s ease-out;
    }
    #loginError.show .login-error-icon {
      font-size: 18px;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(s);
})();

// 中文化 Supabase 错误
function _translateAuthError(rawMsg) {
  if (!rawMsg) return '登录失败,请稍后再试';
  const msg = String(rawMsg).toLowerCase();
  
  if (msg.includes('invalid login credentials') || 
      msg.includes('invalid email or password') ||
      msg.includes('invalid credentials')) {
    return '邮箱或密码错误 · 请检查后重试';
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return '邮箱未验证 · 请联系主管在后台确认账号';
  }
  if (msg.includes('user not found')) {
    return '该邮箱没有注册 · 请检查邮箱或联系主管创建账号';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('networkerror')) {
    return '网络异常 · 请检查网络连接后重试';
  }
  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return '尝试次数过多 · 请稍后再试(约 1 分钟)';
  }
  if (msg.includes('email') && msg.includes('invalid')) {
    return '邮箱格式不对 · 请检查';
  }
  if (msg.includes('password') && (msg.includes('short') || msg.includes('weak'))) {
    return '密码不符合要求 · 至少 6 位';
  }
  // 默认:保留原文但加中文提示
  return `登录失败:${rawMsg}`;
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (!el) return;
  el.innerHTML = `<span class="login-error-icon">⚠</span><span>${escapeHtml(msg)}</span>`;
  el.style.display = 'flex';
  el.classList.add('show');
  
  // 让输入框变红(错误状态)
  const emailInput = document.getElementById('loginEmail');
  const pwdInput = document.getElementById('loginPassword');
  if (emailInput) emailInput.classList.add('login-input-error');
  if (pwdInput) pwdInput.classList.add('login-input-error');
  
  // 抖动登录卡片(视觉冲击)
  const card = el.closest('div[style*="background: white"]') || el.parentElement;
  if (card) {
    card.classList.remove('login-shake');
    void card.offsetWidth;  // 重置动画
    card.classList.add('login-shake');
  }
  
  // 自动 focus 到密码框,方便重输
  if (pwdInput) {
    pwdInput.value = '';
    setTimeout(() => pwdInput.focus(), 100);
  }
}

function _clearLoginError() {
  const el = document.getElementById('loginError');
  if (el) {
    el.style.display = 'none';
    el.classList.remove('show');
    el.textContent = '';
  }
  document.getElementById('loginEmail')?.classList.remove('login-input-error');
  document.getElementById('loginPassword')?.classList.remove('login-input-error');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  
  _clearLoginError();
  
  // 前端简单校验,避免错误请求
  if (!email) {
    showLoginError('请输入邮箱');
    return false;
  }
  if (!password) {
    showLoginError('请输入密码');
    return false;
  }
  if (!email.includes('@')) {
    showLoginError('邮箱格式不对 · 请检查(应包含 @)');
    return false;
  }
  
  btn.disabled = true;
  btn.textContent = '登录中...';
  btn.style.opacity = '0.7';
  
  // 强制最少 600ms 的 loading,让用户看到反馈
  const startTime = Date.now();
  const ensureMinDelay = async () => {
    const elapsed = Date.now() - startTime;
    if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
  };

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await ensureMinDelay();
    document.getElementById('loginPassword').value = '';
    await onAuthSuccess(data.session);
  } catch (e) {
    await ensureMinDelay();
    const friendlyMsg = _translateAuthError(e.message || e);
    showLoginError(friendlyMsg);
    console.warn('[登录失败] 原始错误:', e.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
    btn.style.opacity = '1';
  }
  return false;
}

// 用户开始输入时,清除错误提示(让 UX 顺滑)
(function _bindLoginInputClear() {
  if (window._loginInputClearBound) return;
  window._loginInputClearBound = true;
  setTimeout(() => {
    const emailInput = document.getElementById('loginEmail');
    const pwdInput = document.getElementById('loginPassword');
    [emailInput, pwdInput].forEach(el => {
      if (!el) return;
      el.addEventListener('input', _clearLoginError);
    });
  }, 1500);
})();

async function handleLogout() {
  if (!confirm('确认登出？')) return;
  await sb.auth.signOut();
  location.reload();
}

// 兼容：保留 init 函数（被各处调用）
function init() {
  // 已迁移到 bootstrap，此处空实现
}

function loginAs(name, opts) {
  opts = opts || {};
  const agent = CONFIG.agents.find(a => a.name === name);
  if (!agent) return;
  CURRENT_AGENT = name;
  IS_ADMIN = agent.isAdmin || false;
  IS_BOSS = !!agent.isBoss;           // V5-2026-05-25: loginAs 也要处理 IS_BOSS
  if (IS_BOSS) IS_ADMIN = true;       // 老板自动拥有主管权限

  // V5-2026-05-25: 视角切换状态
  IS_IMPERSONATING = !!opts.impersonating;
  document.body.classList.toggle('impersonating-readonly', IS_IMPERSONATING);

  DATA.setCurrentAgent(name);
  
  // 主管可见"📈 数据" tab
  const tabAna = document.getElementById('tabAnalytics');
  if (tabAna) tabAna.style.display = IS_ADMIN ? '' : 'none';
  
  document.getElementById('curAvatar').textContent = name[0].toUpperCase();
  
  const mySites = agent.sites || [];
  const siteStr = mySites.length > 0 ? mySites.join(' / ') : '未设置';
  const sitesHTML = IS_ADMIN ? '' : `<span class="my-sites ${mySites.length > 0 ? 'has-sites' : ''}">📍 ${escapeHtml(siteStr)}</span>`;
  // V5-2026-05-25: 老板加 👑 标识,主管加 主管 标识
  const roleBadge = IS_BOSS ? '<span class="boss-badge">👑 老板</span>' : (IS_ADMIN ? '<span class="admin-badge">主管</span>' : '');
  document.getElementById('curName').innerHTML = roleBadge + escapeHtml(name) + sitesHTML;
  document.getElementById('agentPill').classList.toggle('admin', IS_ADMIN);
  document.getElementById('ordersAdminNote').style.display = IS_ADMIN ? 'inline-flex' : 'none';
  document.getElementById('asAdminNote').style.display = IS_ADMIN ? 'inline-flex' : 'none';
  
  // V5-2026-05-25: 视角切换按钮可见性(只有真实身份是老板或主管才显示)
  const switchBtn = document.getElementById('agentSwitchBtn');
  if (switchBtn) {
    switchBtn.style.display = (ORIGINAL_IS_BOSS || ORIGINAL_IS_ADMIN) ? 'inline-flex' : 'none';
  }

  // V5-2026-05-25: 更新切换视角的 banner
  updateImpersonationBanner();

  closeModal('agentModal');
  loadAllData();
  applyModuleVisibility();
  restoreLastTab();
  renderActiveTab();
}

// ============================================================
// V5-2026-05-25: 视角切换(impersonation)系统
//
// 权限矩阵:
//   👑 老板  → 可切换到所有人(老板/主管/普通员工)
//   🛡 主管  → 可切换到普通员工(不能切到老板/其他主管)
//   👤 员工  → 看不到切换按钮
//
// 切换后:
//   - body 加 .impersonating-readonly class → CSS 禁用关键写操作按钮
//   - 顶部显示橙色 banner 提示当前视角 + 切回原视角按钮
//   - dbWriteGuard() 在所有数据保存前拦截,防止误操作员工数据
// ============================================================
function openAgentSwitchModal() {
  if (!ORIGINAL_IS_BOSS && !ORIGINAL_IS_ADMIN) {
    toast('您没有切换视角的权限', 'err');
    return;
  }
  let targets = (CONFIG.agents || []).filter(a => a.name !== ORIGINAL_AGENT);
  if (!ORIGINAL_IS_BOSS) {
    // 主管:只能切到普通员工(非老板、非主管)
    targets = targets.filter(a => !a.isBoss && !a.isAdmin);
  }
  // 老板:可切到所有人(已经过滤了自己)
  
  // 按角色排序:老板优先 > 主管 > 普通员工 → 名字
  targets.sort((a, b) => {
    const rankA = a.isBoss ? 0 : (a.isAdmin ? 1 : 2);
    const rankB = b.isBoss ? 0 : (b.isAdmin ? 1 : 2);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  
  const listEl = document.getElementById('agentSwitchList');
  if (!listEl) return;
  
  if (targets.length === 0) {
    listEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-tertiary); font-size:13px;">没有可切换的账号</div>';
  } else {
    listEl.innerHTML = targets.map(a => {
      const role = a.isBoss ? '<span class="agent-switch-role boss">👑 老板</span>' 
                            : a.isAdmin ? '<span class="agent-switch-role admin">🛡 主管</span>'
                                        : '<span class="agent-switch-role">👤 员工</span>';
      const siteStr = (a.sites || []).length > 0 ? (a.sites || []).join(' / ') : '未设置';
      const nameEsc = (a.name || '').replace(/'/g, "\\'");
      return `<button class="agent-switch-card" onclick="switchToAgent('${escapeHtml(nameEsc)}')" type="button">
        <div class="agent-switch-avatar">${escapeHtml((a.name || '?')[0].toUpperCase())}</div>
        <div class="agent-switch-info">
          <div class="agent-switch-name">${escapeHtml(a.name || '')}</div>
          <div class="agent-switch-meta">${role}<span style="color:var(--text-tertiary); font-size:11px; margin-left:8px;">📍 ${escapeHtml(siteStr)}</span></div>
        </div>
        <div class="agent-switch-arrow">→</div>
      </button>`;
    }).join('');
  }
  
  // 显示当前真实身份提示
  const currentInfoEl = document.getElementById('agentSwitchCurrentInfo');
  if (currentInfoEl) {
    const myRole = ORIGINAL_IS_BOSS ? '👑 老板' : (ORIGINAL_IS_ADMIN ? '🛡 主管' : '👤 员工');
    currentInfoEl.innerHTML = `当前身份: <b>${escapeHtml(ORIGINAL_AGENT || '')}</b> · ${myRole}`;
  }
  
  document.getElementById('agentSwitchModal').classList.add('show');
}

function switchToAgent(name) {
  if (!name || name === ORIGINAL_AGENT) {
    return switchBackToOriginal();
  }
  closeModal('agentSwitchModal');
  loginAs(name, { impersonating: true });
  toast(`👁 已切换到 ${name} 的视角 · 当前是只读模式,不能修改数据`, 'success', 4000);
}

function switchBackToOriginal() {
  if (!ORIGINAL_AGENT) return;
  closeModal('agentSwitchModal');
  loginAs(ORIGINAL_AGENT, { impersonating: false });
  toast(`↩ 已切回 ${ORIGINAL_AGENT} 的视角`, 'success');
}

function updateImpersonationBanner() {
  let banner = document.getElementById('impersonationBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'impersonationBanner';
    banner.className = 'impersonation-banner';
    // 插入到 app-header 之前(顶部最显眼)
    const header = document.querySelector('.app-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(banner, header);
    } else {
      document.body.prepend(banner);
    }
  }
  if (IS_IMPERSONATING && CURRENT_AGENT && ORIGINAL_AGENT) {
    banner.innerHTML = `
      <span class="imp-banner-text">
        <span class="imp-banner-icon">👁</span>
        你正在以 <b>${escapeHtml(CURRENT_AGENT)}</b> 的视角查看
        <span class="imp-banner-tag">只读模式</span>
      </span>
      <button class="imp-banner-back" onclick="switchBackToOriginal()" type="button">
        ↩ 切回 ${escapeHtml(ORIGINAL_AGENT)}
      </button>
    `;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

// V5-2026-05-25: 数据写入守卫 — 切换视角下拦截所有写操作
// 用法: 在任何 save/insert/delete/update 前调用 if (!dbWriteGuard('保存订单')) return;
function dbWriteGuard(action) {
  if (IS_IMPERSONATING) {
    toast(`👁 ${action || '此操作'}已禁用 · 当前是切换视角(只读模式)。请先点顶部 banner 「切回原视角」`, 'err', 5000);
    return false;
  }
  return true;
}

// 获取当前用户可见的模块
function getVisibleModules(agent) {
  if (!agent) return ALL_MODULE_KEYS;
  if (agent.isAdmin) return ALL_MODULE_KEYS;
  return agent.modules || ALL_MODULE_KEYS;
}

// 应用模块可见性（隐藏没权限的 tab）
function applyModuleVisibility() {
  const me = CONFIG.agents.find(a => a.name === CURRENT_AGENT);
  const visible = getVisibleModules(me);
  document.querySelectorAll('.tab-item[data-tab]').forEach(el => {
    const key = el.dataset.tab;
    el.style.display = visible.includes(key) ? '' : 'none';
  });
  // 如果当前 tab 不可见，切到第一个可见的
  if (!visible.includes(CURRENT_TAB)) {
    const target = visible[0] || 'orders';
    switchTab(target);
  }
}

function loadAllData() {
  if (IS_ADMIN) {
    ORDERS = DATA.getAllOrders().filter(o => !o.deletedAt);
    AFTERSALES = DATA.getAllAftersales().filter(a => !a.deletedAt);
    ISSUES = DATA.getAllIssues().filter(i => !i.deletedAt);
    PURCHASES = DATA.getAllPurchases().filter(p => !p.deletedAt);
  } else {
    ORDERS = DATA.getOrders(CURRENT_AGENT).filter(o => !o.deletedAt).map(o => ({ ...o, _agent: CURRENT_AGENT }));
    AFTERSALES = DATA.getAftersales(CURRENT_AGENT).filter(o => !o.deletedAt).map(o => ({ ...o, _agent: CURRENT_AGENT }));
    ISSUES = DATA.getIssues(CURRENT_AGENT).filter(o => !o.deletedAt).map(o => ({ ...o, _agent: CURRENT_AGENT }));
    PURCHASES = DATA.getPurchases(CURRENT_AGENT).filter(p => !p.deletedAt).map(p => ({ ...p, _agent: CURRENT_AGENT }));
  }
  MISSING_LIGHTS = DATA.getMissingLights().filter(m => !m.deletedAt);
  refreshAllSupplierDropdowns();
  updateBadges();
  // V4-2026-05-24:启动会议要点加载(异步,不阻塞 UI)
  if (typeof loadMeetings === 'function') {
    loadMeetings().catch(e => console.warn('[meetings] 加载失败:', e));
  }
  // 异步加载 PO 派生催单数据（不阻塞 UI）
  if (typeof loadChaseOrders === 'function') {
    loadChaseOrders().catch(e => console.warn('PO 派生催单加载失败:', e));
  }
  // V4 修复：登录后立即预加载销售单数据（默认 sales tab 进首屏直接看到订单，不用点同步）
  // 同时预加载 PRODUCTS_CACHE + SHOPIFY._productMap，让催单/售后能通过 SKU 反查产品图
  if (typeof SHOPIFY !== 'undefined' && SHOPIFY.loadStores && SHOPIFY.loadOrdersFromDB) {
    SHOPIFY.loadStores()
      .then(() => SHOPIFY.loadOrdersFromDB(false))
      .then(async () => {
        // 收集所有订单的 SKU，预加载产品图 map（催单/售后通过 SKU 反查时要用）
        const allSkus = new Set();
        (SHOPIFY._orders || []).forEach(o => {
          (o.line_items || []).forEach(li => { if (li.sku) allSkus.add(li.sku); });
        });
        if (allSkus.size > 0) {
          try {
            SHOPIFY._productMap = await SHOPIFY.loadProductImageMap([...allSkus]);
            console.log(`[预加载] ${allSkus.size} 个 SKU 的产品图已就位`);
          } catch (e) { console.warn('产品图预加载失败:', e); }
        }
        if (typeof renderShopifyOrders === 'function') renderShopifyOrders();
        if (typeof renderShopifyStores === 'function') renderShopifyStores();
        // 产品图加载完后，如果当前在催单/售后 tab，刷新一次让图显示出来
        if (CURRENT_TAB === 'orders' && typeof renderOrders === 'function') renderOrders();
        if (CURRENT_TAB === 'aftersales' && typeof renderAftersales === 'function') renderAftersales();
      })
      .catch(e => console.warn('销售单预加载失败:', e));
  }
  // V4：PRODUCTS_CACHE 也预加载（PO 模块用，且催单/售后兜底反查产品图）
  if (typeof PRODUCTS_CACHE !== 'undefined' && PRODUCTS_CACHE.loadAll) {
    PRODUCTS_CACHE.loadAll().then(() => {
      console.log('[预加载] 产品库已就位');
      // 加载完后如果在催单/售后 tab，刷新让图显示
      if (CURRENT_TAB === 'orders' && typeof renderOrders === 'function') renderOrders();
      if (CURRENT_TAB === 'aftersales' && typeof renderAftersales === 'function') renderAftersales();
    }).catch(e => console.warn('产品库预加载失败:', e));
  }
}

function renderActiveTab() {
  if (CURRENT_TAB === 'orders') {
    // PO 派生数据可能尚未加载完成（异步）—— 先尝试用现有缓存渲染，加载完成后再次刷新
    renderOrders(); refreshOrdersFb(); renderUrgentBanner(); updateOrderStats();
    if (typeof loadChaseOrders === 'function') {
      loadChaseOrders().then(() => {
        renderOrders(); refreshOrdersFb(); renderUrgentBanner(); updateOrderStats();
      }).catch(e => console.warn('PO 派生催单加载失败:', e));
    }
    // V20260526g: 应用保存的视角模式
    if (typeof setOrdersViewMode === 'function' && typeof _ordersViewMode !== 'undefined') {
      setTimeout(() => setOrdersViewMode(_ordersViewMode), 50);
    }
  }
  else if (CURRENT_TAB === 'aftersales') { 
    renderAftersales(); refreshAsFb(); updateAfterStats(); renderAfterReport();
    // V20260526d: 应用保存的视角模式 + 按钮高亮
    if (typeof setAftersalesViewMode === 'function' && typeof _aftersalesViewMode !== 'undefined') {
      setTimeout(() => setAftersalesViewMode(_aftersalesViewMode), 50);
    }
  }
  else if (CURRENT_TAB === 'issues') { 
    renderIssues(); 
    updateIssueStats(); 
    // R2: 进 tab 扫一遍逾期跟进问题
    if (typeof scanOverdueIssues === 'function') {
      setTimeout(scanOverdueIssues, 300);
    }
  }
  else if (CURRENT_TAB === 'missing') { renderMissing(); updateMissingStats(); }
  else if (CURRENT_TAB === 'purchases') { 
    if (typeof renderPurchases === 'function') renderPurchases(); 
    if (typeof updatePurchaseStats === 'function') updatePurchaseStats();
    setTimeout(_populatePurchasesDateFilter, 50);  // V20260526e
  }
  else if (CURRENT_TAB === 'sales') { 
    // V4 修复：之前 renderShopify 函数不存在导致 sales tab 切换时不会自动渲染
    // 现在切到 sales tab 自动从本地 DB 加载缓存数据（60 秒缓存内不重复拉）
    if (typeof SHOPIFY !== 'undefined' && SHOPIFY.loadOrdersFromDB) {
      // 先用现有缓存立刻渲染（防止白屏）
      if (typeof renderShopifyOrders === 'function' && SHOPIFY._orders && SHOPIFY._orders.length > 0) {
        renderShopifyOrders();
      }
      // 然后异步刷新（如果有新数据）
      SHOPIFY.loadOrdersFromDB(false).then(() => {
        if (typeof renderShopifyOrders === 'function') renderShopifyOrders();
        if (typeof renderShopifyStores === 'function') renderShopifyStores();
      }).catch(e => console.warn('销售单加载失败:', e));
    }
  }
  else if (CURRENT_TAB === 'po') { if (typeof renderPo === 'function') renderPo(); }
  else if (CURRENT_TAB === 'finance') { if (typeof renderFinance === 'function') renderFinance(); }
  else if (CURRENT_TAB === 'products') { if (typeof renderProducts === 'function') renderProducts(); }
  else if (CURRENT_TAB === 'analytics') { renderAnalytics(); }
  else if (CURRENT_TAB === 'performance') { 
    if (typeof renderPerformance === 'function') renderPerformance();
    setTimeout(_populatePerfDateFilter, 50);  // V20260526e
  }
  else if (CURRENT_TAB === 'meetings') { 
    if (typeof renderMeetings === 'function') renderMeetings();
  }
  // V5-W3-2026-05-26: 跨部门协作 tab(美工/客服消息互通)
  else if (CURRENT_TAB === 'cross_dept') {
    if (typeof cdmOnTabActivate === 'function') cdmOnTabActivate();
  }
  // V5-W3-2026-05-26: 反馈中心 tab
  else if (CURRENT_TAB === 'feedback') {
    if (typeof feedbackInit === 'function') {
      feedbackInit().then(() => {
        if (typeof feedbackRender === 'function') feedbackRender();
      });
    } else if (typeof feedbackRender === 'function') {
      feedbackRender();
    }
  }
}

function updateBadges() {
  const today = new Date().toISOString().slice(0, 10);
  // 催单：紧急（橙/红预警）+ 今日要催 —— V3 改造：优先用 PO 派生数据
  const ordersSource = (typeof CHASE_ORDERS !== 'undefined' && CHASE_ORDERS.length > 0) ? CHASE_ORDERS : ORDERS;
  let oUrgent = 0;
  ordersSource.forEach(o => {
    const lvl = getOrderUrgencyLevel(o);
    if (lvl === 'red' || lvl === 'orange') oUrgent++;
    else if (o.nextFollow === today && !['cancelled','shipped','arrived'].includes(o.status)) oUrgent++;
  });
  // 售后：未解决
  const asUnresolved = AFTERSALES.filter(a => !['resolved','cancelled'].includes(a.status)).length;
  // 问题：未解决
  const isUnresolved = ISSUES.filter(i => !['resolved'].includes(i.status)).length;
  // 找灯：搜寻中
  const mActive = MISSING_LIGHTS.filter(m => m.status === 'searching').length;
  // V4：财务收货：所有 status=arrived 的 PO（等待财务对账推进到 received）
  const financeWaiting = (typeof PO_LIST !== 'undefined') 
    ? PO_LIST.filter(p => p.status === 'arrived').length 
    : 0;
  
  setBadge('badgeOrders', oUrgent);
  setBadge('badgeAftersales', asUnresolved);
  setBadge('badgeIssues', isUnresolved);
  setBadge('badgeMissing', mActive);
  setBadge('badgeFinance', financeWaiting);
}

function setBadge(id, n) {
  const el = document.getElementById(id);
  el.textContent = n;
  el.classList.toggle('zero', n === 0);
}

// ============ Tab 切换 ============
function switchTab(name, fromPopstate) {
  CURRENT_TAB = name;
  try { localStorage.setItem('current_tab', name); } catch(_) {}
  // V20260526q: 用 pushState 把 tab 切换记录到浏览器历史
  // 之前用 replaceState 导致浏览器返回直接跳出应用(看起来像"登出")
  // 现在:返回会在应用内切回上一个 tab
  // fromPopstate=true 时不再 push(避免无限循环)
  if (!fromPopstate) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', name);
      // 首次进入应用没有 state 时,用 push 创建第一条历史
      // 后续切 tab 都用 push 累加历史
      window.history.pushState({ appTab: name }, '', url.toString());
    } catch(_) {}
  }
  document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.dataset.tab === name));
  renderActiveTab();
}

// V20260526q: 监听浏览器返回/前进 · 在应用内切换 tab(不跳出)
window.addEventListener('popstate', (e) => {
  // 如果 state 里有 appTab,切换到对应 tab(不再 push 避免循环)
  if (e.state && e.state.appTab) {
    switchTab(e.state.appTab, true);
    return;
  }
  // 没有 state(用户返回到应用入口的初始页) · 不让真的离开
  // 重新 push 一个当前 tab 的 state,把用户"留住"
  if (CURRENT_TAB && document.getElementById('mainApp')?.style.display !== 'none') {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', CURRENT_TAB);
      window.history.pushState({ appTab: CURRENT_TAB }, '', url.toString());
    } catch(_) {}
  }
});

function restoreLastTab() {
  try {
    // V4：优先从 URL 参数读（支持新标签打开指定 tab，例如 ?tab=po）
    let target = null;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const fromUrl = urlParams.get('tab');
      if (fromUrl) target = fromUrl;
    } catch(_) {}
    // 否则用上次访问的 tab
    if (!target) target = localStorage.getItem('current_tab');
    if (!target) return;
    
    // 验证 tab 元素存在且当前用户有权限访问
    const tabEl = document.querySelector(`.tab-item[data-tab="${target}"]`);
    if (!tabEl) return;
    const visible = tabEl.offsetParent !== null || window.getComputedStyle(tabEl).display !== 'none';
    if (!visible) return;
    switchTab(target);
  } catch(_) {}
}

// ============ 公用 - 状态判断 ============
function getOrderEffStatus(o) {
  if (['cancelled'].includes(o.status)) return o.status;
  if (o.status === 'producing' && o.promisedDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (o.promisedDate < today) return 'overdue';
  }
  return o.status || 'pending';
}

// 计算订单紧急程度：normal / yellow / orange / red
function getOrderUrgencyLevel(o) {
  if (['cancelled','shipped','arrived'].includes(o.status)) return 'normal';
  if (!o.promisedDate) return 'normal';
  const today = new Date().toISOString().slice(0, 10);
  const chaseCount = (o.followups || []).filter(f => f.type === 'chase').length;
  
  if (o.promisedDate >= today) {
    // 还未到期
    if (chaseCount >= 2) return 'yellow';  // 催了好几次还没回应也算
    return 'normal';
  }
  
  // 已逾期
  const daysOverdue = Math.floor((new Date(today) - new Date(o.promisedDate)) / 86400000);
  
  if (daysOverdue >= 7 && chaseCount >= 3) return 'red';
  if (daysOverdue > 3 || chaseCount >= 3) return 'orange';
  return 'yellow';
}
function diffDays(dateStr) {
  if (!dateStr) return 0;
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const t = new Date(dateStr + 'T00:00:00');
  return Math.round((t - today) / 86400000);
}
function getDateClass(d) {
  if (!d) return 'empty';
  const today = new Date().toISOString().slice(0, 10);
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'upcoming';
}
function formatShortDate(d) { return d ? d.slice(5).replace('-', '/') : '—'; }
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============ 供应商下拉同步 ============
function refreshAllSupplierDropdowns() {
  // 1. 收集所有供应商 + 各模块计数
  const counts = {};
  CONFIG.suppliers.forEach(s => {
    if (s) counts[s] = { orders: 0, after: 0, issues: 0 };
  });
  // V3：用 CHASE_ORDERS（PO 派生），未加载完时退回 ORDERS
  const __ordSrc = (typeof CHASE_ORDERS !== 'undefined' && CHASE_ORDERS.length > 0) ? CHASE_ORDERS : ORDERS;
  __ordSrc.forEach(o => {
    if (!o.supplier) return;
    if (!counts[o.supplier]) counts[o.supplier] = { orders: 0, after: 0, issues: 0 };
    counts[o.supplier].orders++;
  });
  AFTERSALES.forEach(a => {
    if (!a.supplier) return;
    if (!counts[a.supplier]) counts[a.supplier] = { orders: 0, after: 0, issues: 0 };
    counts[a.supplier].after++;
  });
  ISSUES.forEach(i => {
    if (!i.supplier) return;
    if (!counts[i.supplier]) counts[i.supplier] = { orders: 0, after: 0, issues: 0 };
    counts[i.supplier].issues++;
  });
  
  // 2. 按热度排序：订单数 + 售后数 + 问题数*2（问题加权）；相同则字母升序
  const sorted = Object.keys(counts).sort((a, b) => {
    const ca = counts[a], cb = counts[b];
    const ha = ca.orders + ca.after + ca.issues * 2;
    const hb = cb.orders + cb.after + cb.issues * 2;
    if (ha !== hb) return hb - ha;
    return a.localeCompare(b, 'zh-CN');
  });
  
  // 3. 筛选下拉：显示活动数后缀（订/售/问），活跃供应商排前面
  ['oFilterSupplier','asFilterSupplier'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">全部供应商</option>' + sorted.map(s => {
      const c = counts[s];
      const total = c.orders + c.after + c.issues;
      const suffix = total > 0 ? ` · 订${c.orders}/售${c.after}/问${c.issues}` : '';
      return `<option value="${escapeHtml(s)}" ${cur===s?'selected':''}>${escapeHtml(s)}${suffix}</option>`;
    }).join('');
  });
  
  const reasonEl = document.getElementById('asFilterReason');
  if (reasonEl) {
    const cur = reasonEl.value;
    reasonEl.innerHTML = '<option value="">全部原因</option>' + REASON_LIST.map(r => `<option value="${r}" ${cur===r?'selected':''}>${r}</option>`).join('');
  }
  
  // 4. datalist 联想：按热度排序（value 干净没后缀，不影响匹配）
  ['oSuppliersList','asSuppliersList','isSuppliersList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = sorted.map(s => `<option value="${escapeHtml(s)}">`).join('');
  });
  
  // 网站下拉同步
  refreshSiteDropdowns();
}

function refreshSiteDropdowns() {
  // 当前用户负责的网站
  const me = CONFIG.agents.find(a => a.name === CURRENT_AGENT);
  const mySites = (me && me.sites) || [];
  const allSites = CONFIG.sites || [];
  // 主管能看到所有网站；普通跟单只看自己负责的
  const visibleSites = IS_ADMIN ? allSites : (mySites.length > 0 ? mySites : allSites);
  
  // 筛选下拉：包含全部网站选项
  ['oFilterSite','asFilterSite'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">📍 全部网站</option>' + visibleSites.map(s => `<option value="${escapeHtml(s)}" ${cur===s?'selected':''}>${escapeHtml(s)}</option>`).join('');
  });
  
  // Modal 里的网站选择器：只显示自己负责的
  ['omSite','asmSite'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    const opts = visibleSites.map(s => `<option value="${escapeHtml(s)}" ${cur===s?'selected':''}>${escapeHtml(s)}</option>`).join('');
    el.innerHTML = '<option value="">选择网站...</option>' + opts;
    if (cur) el.value = cur;
  });
}

// 检查订单是否有关联的售后单（同 site + orderNo）
function hasRelatedAftersales(order) {
  if (!order.orderNo) return null;
  const allAfter = IS_ADMIN ? AFTERSALES : DATA.getAftersales(CURRENT_AGENT);
  return allAfter.filter(a => a.orderNo === order.orderNo && (a.site || '') === (order.site || '') && !['resolved','cancelled'].includes(a.status));
}

// 根据所选网站，更新订单号输入框的 placeholder 和提示
function updateOrderNoHint(siteSelectId, orderNoInputId, hintId) {
  const site = document.getElementById(siteSelectId)?.value || '';
  const fmt = ORDER_NO_FORMAT[site] || '';
  const input = document.getElementById(orderNoInputId);
  const hint = document.getElementById(hintId);
  if (input) {
    input.placeholder = site ? `如：${fmt}` : '先选网站';
  }
  if (hint) {
    if (site) {
      if (site === 'VK') {
        hint.innerHTML = `💡 VK 订单格式：<b>K + 数字编号</b> 或 <b>V + 数字编号</b>（位数不限，如 K14176 / K114176 / V1141760）`;
      } else if (site === '线下') {
        hint.innerHTML = `💡 线下订单：可自定义编号格式`;
      } else {
        hint.innerHTML = `💡 ${site} 订单格式：<b>${site} + 数字编号</b>（位数不限，如 ${site}14176 / ${site}114176）`;
      }
      hint.style.display = 'block';
    } else {
      hint.style.display = 'none';
    }
  }
}

// ============ 通用 - Banner 切换 ============
function toggleFb(id, e) {
  if (e && e.target.closest('.fb-tab')) return;
  const c = document.getElementById(id);
  c.classList.toggle('collapsed');
  c.dataset.userToggled = '1';
  // V20260526q: 记忆折叠状态(只对带 _collapsed 偏好的元素生效)
  if (id === 'ordersFb') {
    localStorage.setItem('orders_fb_collapsed', c.classList.contains('collapsed') ? '1' : '0');
  } else if (id === 'asFb') {
    localStorage.setItem('as_fb_collapsed', c.classList.contains('collapsed') ? '1' : '0');
  }
}

// ============================================================================
// V5-W3-2026-05-26: 工作台布局自定义(IDE 风格 · 顶部+侧栏)
// ============================================================================
const TAB_LAYOUT_KEY = 'tab_layout_v1';
const TAB_LAYOUT_DEFAULT = {
  // 常用 — 显示在顶部
  sales:         'top',
  po:            'top',
  orders:        'top',
  aftersales:    'top',
  products:      'top',
  // 不常用 — 显示在左侧栏(图标 only)
  missing:       'side',
  purchases:     'side',
  issues:        'side',
  finance:       'side',
  cross_dept:    'side',
  consolidation: 'side',
  performance:   'side',
  analytics:     'side',
};
const TAB_META = {
  sales:         { icon: '📥', label: '销售单',     badgeId: 'badgeSales' },
  po:            { icon: '📦', label: '采购单',     badgeId: 'badgePo' },
  orders:        { icon: '📋', label: '催单',       badgeId: 'badgeOrders' },
  missing:       { icon: '🔍', label: '找灯',       badgeId: 'badgeMissing' },
  purchases:     { icon: '🛒', label: '线上采购',   badgeId: 'badgePurchases' },
  aftersales:    { icon: '🔧', label: '售后',       badgeId: 'badgeAftersales' },
  issues:        { icon: '⚠',  label: '供应商问题', badgeId: 'badgeIssues' },
  finance:       { icon: '✓',  label: '财务收货',   badgeId: 'badgeFinance' },
  products:      { icon: '📚', label: '产品',       badgeId: 'badgeProducts' },
  cross_dept:    { icon: '📨', label: '跨部门',     badgeId: 'badgeCrossDept' },
  feedback:      { icon: '💬', label: '反馈',       badgeId: 'badgeFeedback' },
  consolidation: { icon: '🧊', label: '合箱',       badgeId: null },
  analytics:     { icon: '📈', label: '数据',       badgeId: null },
  performance:   { icon: '📊', label: '绩效',       badgeId: 'badgePerformance' },
};

function getTabLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem(TAB_LAYOUT_KEY) || '{}');
    return { ...TAB_LAYOUT_DEFAULT, ...stored };
  } catch (_) { return { ...TAB_LAYOUT_DEFAULT }; }
}

function applyTabLayout() {
  const layout = getTabLayout();
  const sideBar = document.getElementById('sideTabBar');
  if (!sideBar) return;

  // 读侧栏是否收起(localStorage)
  const isCollapsed = localStorage.getItem('side_tab_collapsed') === '1';
  sideBar.classList.toggle('collapsed', isCollapsed);

  // 清空 sidebar
  sideBar.innerHTML = '';

  // 顶部收起/展开切换按钮
  const toggleBtn = document.createElement('div');
  toggleBtn.className = 'side-tab-toggle';
  toggleBtn.title = isCollapsed ? '展开侧栏' : '收起侧栏';
  toggleBtn.innerHTML = isCollapsed ? '⏵' : '⏴';
  toggleBtn.onclick = toggleSidebarCollapsed;
  sideBar.appendChild(toggleBtn);

  let hasSideTabs = false;

  // 遍历每个 tab,根据 layout 决定 zone
  document.querySelectorAll('.tab-nav .tab-item').forEach(el => {
    const t = el.dataset.tab;
    if (!t) return;
    const zone = layout[t] || 'top';
    el.dataset.zone = zone;

    if (zone === 'side') {
      hasSideTabs = true;
      const meta = TAB_META[t] || { icon: '◆', label: t, badgeId: null };
      // 不渲染明明 display:none 的(比如 tabAnalytics)
      if (el.style.display === 'none' && el.id === 'tabAnalytics') return;

      const side = document.createElement('div');
      side.className = 'side-tab-item';
      side.dataset.tab = t;
      side.dataset.zone = 'side';
      const isActive = (CURRENT_TAB === t);
      if (isActive) side.classList.add('active');

      // 徽章值(从 topbar 元素读)
      let badgeText = '0';
      let badgeClass = 'zero';
      if (meta.badgeId) {
        const topBadge = document.getElementById(meta.badgeId);
        if (topBadge) {
          badgeText = topBadge.textContent || '0';
          badgeClass = topBadge.classList.contains('zero') ? 'zero' : '';
        }
      }
      side.innerHTML = `
        <span class="side-tab-icon">${meta.icon}</span>
        <span class="side-tab-label">${meta.label}</span>
        ${meta.badgeId ? `<span class="side-tab-badge ${badgeClass}" data-mirror-of="${meta.badgeId}">${badgeText}</span>` : ''}
        <span class="side-tab-tooltip">${meta.label}</span>
      `;
      side.addEventListener('click', () => switchTab(t));
      sideBar.appendChild(side);
    }
  });

  // 显示/隐藏 sidebar
  if (hasSideTabs) {
    // V5-W3-2026-05-26: 底部固定 📐 自定义布局按钮(永远显示,不依赖顶栏)
    const bottom = document.createElement('div');
    bottom.className = 'side-tab-bottom';
    bottom.innerHTML = `
      <div class="side-tab-customize" onclick="openTabLayoutModal()" title="自定义工作台布局">
        <span class="side-tab-icon">📐</span>
        <span class="side-tab-label">自定义布局</span>
        <span class="side-tab-tooltip">📐 自定义布局</span>
      </div>
    `;
    sideBar.appendChild(bottom);
    sideBar.style.display = 'flex';
    document.body.classList.add('has-side-tabs');
    document.body.classList.toggle('side-collapsed', isCollapsed);
  } else {
    sideBar.style.display = 'none';
    document.body.classList.remove('has-side-tabs');
    document.body.classList.remove('side-collapsed');
  }
  
  // V20260526h: 应用完布局后强制同步 padding
  setTimeout(() => { if (typeof syncMainAppPadding === 'function') syncMainAppPadding(); }, 50);
}

// V5-W3-2026-05-26: 切换侧栏收起/展开
function toggleSidebarCollapsed() {
  const sb = document.getElementById('sideTabBar');
  if (!sb) return;
  const isNowCollapsed = !sb.classList.contains('collapsed');
  sb.classList.toggle('collapsed', isNowCollapsed);
  document.body.classList.toggle('side-collapsed', isNowCollapsed);
  localStorage.setItem('side_tab_collapsed', isNowCollapsed ? '1' : '0');
  // 更新顶部切换按钮的图标
  const toggleBtn = sb.querySelector('.side-tab-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = isNowCollapsed ? '⏵' : '⏴';
    toggleBtn.title = isNowCollapsed ? '展开侧栏' : '收起侧栏';
  }
  // V20260526h: 关键修复 · 用 JS 直接同步 mainApp padding-left
  // CSS 规则有时会被覆盖 · JS 直接 inline style 最稳
  setTimeout(syncMainAppPadding, 200);  // 等 transition 完成(width 0.18s)
}

// V20260526h: 关键 · 用 JS 同步 mainApp 的 padding-left 为实际 sidebar 宽度
// 这样不管 CSS 怎么变,padding 一定跟 sidebar 宽度匹配
function syncMainAppPadding() {
  const sb = document.getElementById('sideTabBar');
  const main = document.getElementById('mainApp');
  if (!main) return;
  if (!sb || sb.style.display === 'none' || !document.body.classList.contains('has-side-tabs')) {
    main.style.paddingLeft = '0';
    return;
  }
  const sbWidth = sb.offsetWidth || (sb.classList.contains('collapsed') ? 56 : 150);
  main.style.paddingLeft = (sbWidth + 4) + 'px';  // +4px buffer 防止贴边
}

// 暴露给 window
window.syncMainAppPadding = syncMainAppPadding;

// V20260526h: 系统设置 modal · 打开 + tab 切换
function openSettings() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  modal.classList.add('show');
  // 主管才看到高级 tab
  const advTab = document.getElementById('settingsAdvancedTab');
  if (advTab) advTab.style.display = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN) ? '' : 'none';
  // 默认打开产品维护 tab
  switchSettingsTab('products');
  // 渲染网站列表 / 供应商列表
  renderSettingsSites();
  renderSettingsSuppliers();
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.settings-pane').forEach(p => {
    p.style.display = (p.dataset.pane === tab) ? '' : 'none';
  });
  // 切到供应商 tab 时刷新列表
  if (tab === 'suppliers') renderSettingsSuppliers();
  if (tab === 'sites') renderSettingsSites();
}

function renderSettingsSites() {
  const el = document.getElementById('settingsSitesList');
  if (!el) return;
  if (typeof SHOPS_PRESET === 'undefined') {
    el.innerHTML = '<div style="grid-column:1/-1; padding:16px; text-align:center; color:var(--text-tertiary);">SHOPS_PRESET 未加载</div>';
    return;
  }
  // 按 category 分组
  const groups = {};
  SHOPS_PRESET.forEach(s => {
    const g = s.category || '其他';
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  });
  const grpIcons = { '主站': '⭐', '子站': '🌍', '老站': '📦', '内部': '🔧', '其他': '📌' };
  el.innerHTML = Object.entries(groups).map(([g, sites]) => `
    <div style="grid-column: 1/-1; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-top: 8px; padding: 4px 8px; background: var(--bg-card); border-radius: 4px;">
      ${grpIcons[g] || '📌'} ${g} · ${sites.length}
    </div>
    ${sites.map(s => `
      <div style="padding: 10px 12px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 12px;">
        <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(s.label || '')}</div>
        <div style="font-size: 10.5px; color: var(--text-tertiary); margin-top: 2px;">${escapeHtml(s.domain || s.value || '')}</div>
      </div>
    `).join('')}
  `).join('');
}

function renderSettingsSuppliers() {
  const el = document.getElementById('settingsSuppliers');
  const countEl = document.getElementById('suppliersCountInline');
  if (!el) return;
  // 从已有 SUPPLIERS 或 PO/Orders 数据中提取
  const all = new Set();
  if (typeof PO_LIST !== 'undefined' && Array.isArray(PO_LIST)) {
    PO_LIST.forEach(p => { if (p.supplier) all.add(p.supplier); });
  }
  if (typeof CHASE_ORDERS !== 'undefined' && Array.isArray(CHASE_ORDERS)) {
    CHASE_ORDERS.forEach(o => { if (o.supplier) all.add(o.supplier); });
  }
  if (typeof AFTERSALES !== 'undefined' && Array.isArray(AFTERSALES)) {
    AFTERSALES.forEach(a => { if (a.supplier) all.add(a.supplier); });
  }
  const list = [...all].sort();
  if (countEl) countEl.textContent = list.length;
  if (list.length === 0) {
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-tertiary); font-size:12.5px;">还没有供应商记录 · 在 PO/订单/售后中填供应商后会自动出现在这里</div>';
    return;
  }
  el.innerHTML = `<div style="display:flex; flex-wrap:wrap; gap:6px;">${list.map(s => `
    <span style="display:inline-flex; align-items:center; padding:4px 10px; background:var(--bg-card); border:1px solid var(--border); border-radius:14px; font-size:12px;">
      🏭 ${escapeHtml(s)}
    </span>
  `).join('')}</div>`;
}

function addSupplierConfig() {
  const input = document.getElementById('newSupplier');
  if (!input) return;
  const val = (input.value || '').trim();
  if (!val) { if (typeof toast === 'function') toast('请填供应商名称', 'warn'); return; }
  // 这里只是 UI 反馈 · 实际供应商会在使用中自动注册到 SUPPLIERS
  if (typeof toast === 'function') toast(`✓ 已记录「${val}」· 在 PO/订单中使用时会自动联想`);
  input.value = '';
  renderSettingsSuppliers();
}

// 暴露给 window
window.openSettings = openSettings;
window.switchSettingsTab = switchSettingsTab;
window.renderSettingsSites = renderSettingsSites;
window.renderSettingsSuppliers = renderSettingsSuppliers;
window.addSupplierConfig = addSupplierConfig;

// 让 updateBadges() 也同步刷新 sidebar 徽章
function syncSideBadges() {
  document.querySelectorAll('.side-tab-badge').forEach(badge => {
    const srcId = badge.dataset.mirrorOf;
    if (!srcId) return;
    const src = document.getElementById(srcId);
    if (!src) return;
    badge.textContent = src.textContent;
    badge.classList.toggle('zero', src.classList.contains('zero'));
  });
}

// 让 switchTab 也刷新 sidebar 高亮(monkey-patch)
const _origSwitchTab = window.switchTab;
window.switchTab = function(name) {
  _origSwitchTab.call(this, name);
  document.querySelectorAll('.side-tab-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
};

// 让 updateBadges 调用后同步 sidebar
const _origUpdateBadges = window.updateBadges;
window.updateBadges = function() {
  _origUpdateBadges.call(this);
  syncSideBadges();
};

// ============ 布局自定义弹窗 ============
function openTabLayoutModal() {
  const layout = getTabLayout();
  const list = document.getElementById('tabLayoutList');
  if (!list) return;
  // 渲染每个 tab 的 toggle
  list.innerHTML = Object.keys(TAB_META).map(t => {
    const meta = TAB_META[t];
    const zone = layout[t] || 'top';
    // 隐藏的 analytics 也允许配置
    return `
      <div class="tab-layout-row">
        <span class="icon">${meta.icon}</span>
        <span class="label">${meta.label}</span>
        <div class="tab-layout-toggle">
          <button class="${zone === 'top' ? 'active' : ''}" onclick="_tabLayoutSetZone('${t}', 'top', this)">顶部</button>
          <button class="${zone === 'side' ? 'active' : ''}" onclick="_tabLayoutSetZone('${t}', 'side', this)">侧栏</button>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('tabLayoutModal').classList.add('show');
}

let _tabLayoutDraft = null;
function _tabLayoutSetZone(tab, zone, btnEl) {
  if (!_tabLayoutDraft) _tabLayoutDraft = getTabLayout();
  _tabLayoutDraft[tab] = zone;
  // 切换按钮高亮
  const row = btnEl.closest('.tab-layout-row');
  row.querySelectorAll('.tab-layout-toggle button').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
}

function saveTabLayout() {
  if (_tabLayoutDraft) {
    localStorage.setItem(TAB_LAYOUT_KEY, JSON.stringify(_tabLayoutDraft));
    _tabLayoutDraft = null;
  }
  closeTabLayoutModal();
  applyTabLayout();
  if (typeof toast === 'function') toast('✓ 布局已保存');
}

function closeTabLayoutModal() {
  document.getElementById('tabLayoutModal')?.classList.remove('show');
  _tabLayoutDraft = null;
}

function resetTabLayout() {
  if (!confirm('恢复默认布局?(销售/采购/催单/售后/产品 在顶部,其余在侧栏)')) return;
  localStorage.removeItem(TAB_LAYOUT_KEY);
  _tabLayoutDraft = null;
  closeTabLayoutModal();
  applyTabLayout();
  if (typeof toast === 'function') toast('✓ 已恢复默认布局');
}

// V20260526e: 通用日期筛选 stub(给暂未实现的 renderPerformance / renderPurchases 用 · 函数实现后能直接配合)
let _perfDatePreset = 'all';
function perfOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        _perfDatePreset = customPreset;
        const el = document.getElementById('perfDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        if (typeof renderPerformance === 'function') renderPerformance();
        if (typeof toast === 'function' && typeof getDateRange === 'function') {
          toast(`✓ 已切到:${getDateRange(customPreset).label}`);
        }
      });
    }
    return;
  }
  _perfDatePreset = preset || 'all';
  if (typeof renderPerformance === 'function') renderPerformance();
  if (preset !== 'all' && typeof toast === 'function' && typeof getDateRange === 'function') {
    toast(`✓ 已切到:${getDateRange(preset).label}`);
  }
}

let _purchasesDatePreset = 'all';
function purchasesOnDateChange(preset) {
  if (preset === 'custom_open') {
    if (typeof openCustomDateRange === 'function') {
      openCustomDateRange(null, null, customPreset => {
        _purchasesDatePreset = customPreset;
        const el = document.getElementById('pDateFilter');
        if (el && typeof populateDateFilterSelect === 'function') populateDateFilterSelect(el, customPreset);
        if (typeof renderPurchases === 'function') renderPurchases();
      });
    }
    return;
  }
  _purchasesDatePreset = preset || 'all';
  if (typeof renderPurchases === 'function') renderPurchases();
}

// 进入这两个 tab 时填充下拉
function _populatePerfDateFilter() {
  if (typeof populateDateFilterSelect === 'function') {
    const el = document.getElementById('perfDateFilter');
    if (el) populateDateFilterSelect(el, _perfDatePreset || 'all');
  }
}
function _populatePurchasesDateFilter() {
  if (typeof populateDateFilterSelect === 'function') {
    const el = document.getElementById('pDateFilter');
    if (el) populateDateFilterSelect(el, _purchasesDatePreset || 'all');
  }
}

// 暴露
window.perfOnDateChange = perfOnDateChange;
window.purchasesOnDateChange = purchasesOnDateChange;

// 登录后(等 mainApp 显示后)应用一次布局
window.addEventListener('DOMContentLoaded', () => {
  let attempts = 0;
  const wait = setInterval(() => {
    const m = document.getElementById('mainApp');
    if ((m && m.style.display !== 'none') || attempts++ > 120) {
      clearInterval(wait);
      if (m && m.style.display !== 'none') {
        applyTabLayout();
        // V20260526h: 应用完布局后再次同步 padding(双保险)
        setTimeout(syncMainAppPadding, 100);
        setTimeout(syncMainAppPadding, 500);  // 再保险一次
      }
    }
  }, 500);
});

// V20260526h: 窗口大小变化时也要同步 padding
window.addEventListener('resize', () => {
  if (typeof syncMainAppPadding === 'function') syncMainAppPadding();
});
