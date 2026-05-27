// ════════════════════════════════════════════════════════════════════
// 📖 使用手册 + 🎯 App 主入口 (fix45: 浏览器返回拦截器)
// 拆自 workspace.html · 原始行号 22835-25017
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// 📖 帮助中心模块 (fix13)
// 包含:入门指南 / 模块详解 / 角色权限 / 快捷操作 / 报告 Bug / 版本日志 / AI 能力 / 路线图 / 设计哲学
// ════════════════════════════════════════════════════════════════════
const HelpCenterModule = ({ user }) => {
  const [section, setSection] = useState('intro');
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  const sections = [
    { key:'intro',     label:'🚀 新人入门',     desc:'3 分钟上手' },
    { key:'modules',   label:'📚 模块详解',     desc:'19 个模块功能说明' },
    { key:'roles',     label:'👥 角色权限',     desc:'4 种角色能做什么' },
    { key:'shortcuts', label:'⌨ 快捷操作',     desc:'右键 / 粘贴 / 多窗口' },
    { key:'bugs',      label:'🐛 报告 Bug',     desc:'怎么发问题给 AI 修' },
    { key:'history',   label:'📦 版本日志',     desc:`${VERSION_HISTORY.length} 个版本记录` },
    { key:'ai',        label:'🤖 AI 能力清单',  desc:'Claude 能做什么' },
    { key:'roadmap',   label:'🛣 待开发路线图', desc:'还可以加什么' },
    { key:'philosophy',label:'💡 设计哲学',     desc:'为什么这么设计' },
  ];

  return (
    <div className="fade-in">
      {/* 头部 */}
      <div className="paper rounded-2xl p-5" style={{marginBottom:12, background:'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10}}>
          <div>
            <div className="font-display" style={{fontSize:20, fontWeight:600, color:'#5b21b6'}}>📖 使用手册 / 帮助中心</div>
            <div style={{fontSize:12, color:'#6b21a8', marginTop:4}}>
              新人入职必读 · 老员工查阅手册 · 反馈 Bug · 当前版本 <strong>{APP_VERSION}</strong>
            </div>
          </div>
          <div style={{display:'flex', gap:6, alignItems:'center'}}>
            <span style={{padding:'4px 10px', background:'white', borderRadius:14, fontSize:11, color:'#6b21a8', fontWeight:600}}>共 {sections.length} 个章节</span>
            <span style={{padding:'4px 10px', background:'white', borderRadius:14, fontSize:11, color:'#6b21a8', fontWeight:600}}>{VERSION_HISTORY.length} 个版本</span>
          </div>
        </div>
      </div>

      {/* 主体:左侧栏 + 右侧内容 */}
      <div style={{display:'grid', gridTemplateColumns:'200px 1fr', gap:12, alignItems:'flex-start'}}>
        {/* 左:章节导航 */}
        <div className="paper rounded-2xl p-2" style={{position:'sticky', top:80}}>
          {sections.map(s => {
            const isSel = section === s.key;
            return (
              <button key={s.key} onClick={() => setSection(s.key)}
                style={{
                  width:'100%', textAlign:'left',
                  padding:'9px 12px', marginBottom:2,
                  background: isSel ? 'var(--accent-soft)' : 'transparent',
                  color: isSel ? 'var(--accent)' : 'var(--ink-2)',
                  border:'none', borderRadius:7, cursor:'pointer',
                  fontFamily:'inherit', fontSize:12.5,
                  fontWeight: isSel ? 600 : 500,
                  transition:'background .12s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                <div>{s.label}</div>
                <div style={{fontSize:10, color: isSel ? 'var(--accent)' : 'var(--ink-4)', marginTop:1, fontWeight:400}}>{s.desc}</div>
              </button>
            );
          })}
        </div>

        {/* 右:内容 */}
        <div className="paper rounded-2xl p-6" style={{minHeight:600}}>
          {section === 'intro'      && <HelpSectionIntro user={user} />}
          {section === 'modules'    && <HelpSectionModules user={user} isAdmin={isAdmin} />}
          {section === 'roles'      && <HelpSectionRoles />}
          {section === 'shortcuts'  && <HelpSectionShortcuts />}
          {section === 'bugs'       && <HelpSectionBugs />}
          {section === 'history'    && <HelpSectionHistory />}
          {section === 'ai'         && <HelpSectionAi />}
          {section === 'roadmap'    && <HelpSectionRoadmap />}
          {section === 'philosophy' && <HelpSectionPhilosophy />}
        </div>
      </div>
    </div>
  );
};

// 共用样式组件
const HelpH1 = ({ children }) => (
  <div className="font-display" style={{fontSize:18, fontWeight:600, color:'var(--ink)', marginBottom:12, paddingBottom:8, borderBottom:'1px solid var(--line)'}}>{children}</div>
);
const HelpH2 = ({ children }) => (
  <div style={{fontSize:14, fontWeight:600, color:'var(--ink)', marginTop:18, marginBottom:8}}>{children}</div>
);
const HelpP = ({ children }) => (
  <div style={{fontSize:13, color:'var(--ink-2)', lineHeight:1.7, marginBottom:8}}>{children}</div>
);
const HelpUL = ({ items }) => (
  <ul style={{fontSize:12.5, color:'var(--ink-2)', lineHeight:1.8, paddingLeft:20, marginBottom:8}}>
    {items.map((t, i) => <li key={i} style={{marginBottom:2}}>{t}</li>)}
  </ul>
);
const HelpCode = ({ children }) => (
  <code style={{padding:'2px 6px', background:'#f5f5f7', border:'1px solid var(--line)', borderRadius:4, fontSize:11, fontFamily:'ui-monospace, monospace', color:'#7c3aed'}}>{children}</code>
);
const HelpNote = ({ children, kind = 'info' }) => {
  const c = kind === 'warn' ? { bg:'#fef3c7', bd:'#fde047', tx:'#854d0e' } :
            kind === 'danger' ? { bg:'#fee2e2', bd:'#fca5a5', tx:'#b91c1c' } :
            kind === 'good' ? { bg:'#dcfce7', bd:'#86efac', tx:'#15803d' } :
            { bg:'#eff6ff', bd:'#bfdbfe', tx:'#1e40af' };
  return (
    <div style={{padding:'10px 12px', background:c.bg, border:'1px solid '+c.bd, borderRadius:8, fontSize:12, color:c.tx, lineHeight:1.6, marginBottom:10}}>{children}</div>
  );
};

// ════════════════ Section: 新人入门 ════════════════
const HelpSectionIntro = ({ user }) => (
  <div>
    <HelpH1>🚀 3 分钟上手 — 新人必读</HelpH1>
    <HelpP>欢迎使用 <strong>Dekorfine 统一工作台</strong> — 公司客服 + 财务 + 报价的全流程系统。</HelpP>

    <HelpH2>第一步:认识你的角色</HelpH2>
    <HelpUL items={[
      <><HelpCode>员工 staff</HelpCode> — 普通客服,处理自己的客户、订单</>,
      <><HelpCode>主管 admin</HelpCode> — 看所有员工的工单 + 审批 + 配置权限</>,
      <><HelpCode>总管 super_admin</HelpCode> — 全部权限(老板)</>,
      <><HelpCode>财务 finance</HelpCode> — 专责退款 / 运费对账</>,
    ]} />
    <HelpP>你现在的身份:<strong style={{color:'var(--accent)'}}>{user.name} {user.alias ? '· ' + user.alias : ''} · {user.role === 'super_admin' ? '总管' : user.role === 'admin' ? '主管' : user.role === 'finance' ? '财务' : '员工'}</strong></HelpP>

    <HelpH2>第二步:认识你的工作台</HelpH2>
    <HelpUL items={[
      <><strong>顶部 6 个 tab</strong> — 你最常用的功能(可在 <HelpCode>⚙ 布局</HelpCode> 自定义)</>,
      <><strong>左侧栏</strong> — 其他工具按"主功能/资源/协作/管理"4 组分类</>,
      <><strong>右上角徽章</strong> — 红色=紧急/超时,蓝色=待办,绿色=完成</>,
      <><strong>底部"自定义布局"</strong> — 把你不用的功能从顶部挪到侧边栏(每个员工独立)</>,
    ]} />

    <HelpH2>第三步:每天进系统的"工作快照"</HelpH2>
    <HelpP>进 <HelpCode>📞 客服跟进</HelpCode> 第一眼看到的卡片就是"今天该干什么":</HelpP>
    <HelpUL items={[
      '🔴 逾期未跟进的客户(数字 = 几个)',
      '🟡 今天要跟进的客户',
      '🟢 已完成的本日任务',
      <>退款处理人特权:看到 <strong>今天要审核的退款</strong> + <strong>今天要打款的退款</strong></>,
    ]} />

    <HelpH2>第四步:常见操作</HelpH2>
    <HelpUL items={[
      <><strong>右键</strong>任意 tab → "在新标签页中打开" → 多窗口工作</>,
      <><strong>Ctrl+V</strong> 截图直接粘贴到任何附件区(知识库/跟进/拒付/工单)</>,
      <><strong>Esc</strong> 关闭模态框 / AI 评价面板</>,
      <><strong>Ctrl+Enter</strong> 在回复框 = 发送</>,
    ]} />

    <HelpH2>第五步:遇到问题</HelpH2>
    <HelpNote>
      <strong>所有 bug / 新需求</strong> → 进左侧 <HelpCode>🐛 报告 Bug</HelpCode> 章节,按模板提交给主管(Nicole/Miya)。
      不要直接说"不工作了" — 没有信息没法修。
    </HelpNote>
  </div>
);

// ════════════════ Section: 模块详解 ════════════════
const HelpSectionModules = ({ user, isAdmin }) => {
  const MODS = [
    { key:'cs', icon:'📞', name:'客服跟进', summary:'客户跟进总控台',
      what:'记录每个客户的咨询、订单状态、提醒。',
      why:'之前用 Excel 跟客户,信息分散容易漏。把它做成 Web 表格,多人协同 + 不丢数据。',
      how:[
        '顶部 + 新增客户 创建客户卡片',
        '填客户基本信息 + 订单号 + 沟通要点',
        '设置"下次跟进时间" → 到点出现在徽章计数',
        '工作快照面板看今天该跟进的人',
        '客户解决了 → 标记"已完成"',
      ],
      tips:['时间智能筛选 (今天 / 3 天 / 一周)', '模板回复联动知识库', '工单升级到主管 / 老板', '软删除 + 回收站'],
    },
    { key:'chargebacks', icon:'🚨', name:'拒付', summary:'Stripe/PayPal 拒付争议管理',
      what:'录入拒付通知,上传证据(订单截图/物流/邮件/聊天),按剩余时间排序。',
      why:'拒付有严格时限,过期就输。需要专人盯 + 自动提醒。',
      how:[
        '接到拒付通知 → 这里录入',
        '上传证据(可粘贴截图)',
        '系统按"剩余时间"自动排序,临近的红色高亮',
        '财务/主管审核胜诉率',
      ],
      tips:['金额汇总按货币/网站/状态分布', '专人接拒付任务'],
    },
    { key:'offline_orders', icon:'💳', name:'线下单', summary:'非 Shopify 订单(WhatsApp/邮件/阿里巴巴)',
      what:'统一录入非 Shopify 的订单,跟正常订单一样跟踪。',
      why:'这类订单数据散在邮箱里,没法对账。集中后可以跟 Shopify 一样跟踪 + 财务对账。',
      how:[
        '收到线下询价/下单 → + 新建',
        '录入产品(SKU/单价/数量)+ 客户信息 + 收件地址',
        '状态推进:报价 → 客户确认 → 已付 → 已发',
        '财务月底导出对账',
      ],
    },
    { key:'custom_photo', icon:'🎨', name:'定制 & 实拍', summary:'客户改产品 / 上传实拍照核实',
      what:'客户定制咨询 + 实拍核实(销售图 vs 客户实物)。',
      why:'美工接到定制需求经常信息不全 → 来回沟通慢。这里强制必填字段。',
      how:[
        '定制咨询:产品 + 客户预算 + 期望日期 + 设计参考图',
        '实拍核实:订单编号 + 销售图 + 实物对比 + 客户留言板(图文+时间线)',
      ],
    },
    { key:'events', icon:'📋', name:'工作主线', summary:'7 大事件类型统一管理',
      what:'售后/补件/拒付/退款/定制/实拍/自定义 — 跨模块汇总。',
      why:'之前每种事件都在自己的 tab,跨 tab 同步麻烦。这里看全部按时间/紧急排序。',
      how:[
        '每条客户记录里都可以 + 加事件',
        '在这里能看到所有员工/所有客户的事件汇总',
        '按状态/类型/时间筛选',
        '一键 ✓ 完成',
      ],
    },
    { key:'reviews', icon:'⭐', name:'产品评价', summary:'评价任务调度 + 嵌入式 AI 工具',
      what:'老板派评价任务 → 客服接单 → 用嵌入的美工 AI 工具生成 → 完成。',
      why:'以前要切两个系统(任务在 CS,生成工具在美工)。现在一个页面搞定。',
      how:[
        '老板 + 发布评价任务(产品链接 + 目标 N 条 + 优先级)',
        '客服看到任务 → 👤 接单',
        '接单后出现紫色 🤖 AI 生成评价 按钮 → 全屏面板打开 AI 工具',
        '在 AI 工具里生成评价 + 导出 Judge.me CSV',
        '回来点 ✅ 标记完成',
      ],
      tips:['顶部紫色"🤖 AI 评价工具"按钮:不绑定任务也能直接打开', 'iframe 永久挂载,关闭再开瞬间显示'],
    },
    { key:'suppliers', icon:'🏭', name:'供应商', summary:'693 家供应商集中管理',
      what:'联系方式 + 评分 + 备注 + 历史合作记录。',
      why:'工厂联系信息散在每个客服的微信里,新人入职接不上。',
    },
    { key:'kb', icon:'📚', name:'知识库', summary:'280+ 客服回复模板',
      what:'分类的客服回复模板 + AI 优化建议。',
      why:'减少重复打字 + 保证回复一致 + AI 优化模板。',
      how:[
        '按问题分类找模板 → 复制 → 改个性化部分 → 发客户',
        '主管可以编辑模板,普通员工只读',
      ],
    },
    { key:'quote', icon:'📝', name:'报价单', summary:'生成正式报价单',
      what:'给客户生成标准格式的报价单。',
      why:'之前用 Word,格式不一致。',
    },
    { key:'finance', icon:'🧮', name:'财务计算器', summary:'13 承运商 + 售价建议 + 对账',
      what:'输入产品尺寸+实重+目的国 → 13 承运商对比 → 建议售价 → 账单对账。',
      why:'选错承运商一单亏几百;算错售价一批货亏几千。这里集中计算 + 推演运费保证售价稳定。',
      how:[
        '输入产品尺寸 + 实重 + 数量 + 目的国',
        '看 13 个承运商对比(价格 + 节省 + 利润率)',
        '选 #1 推荐的发货',
        '月底用"实际承运商账单"对账,验证没被多收',
      ],
      tips:['明扬加班船最近改为 19/18/17 元/kg(美东/中/西)', '超规(>68kg 或 >300cm 单边 或 >420cm 围长)自动标"不接收"'],
    },
    { key:'freight', icon:'🚚', name:'运费支付', summary:'财务对账 + 快递公司管理 (财务/主管)',
      what:'支付记录 + 快递公司管理 + 月度统计。',
      why:'对账过程留痕,避免重复支付。',
    },
    { key:'cross_dept', icon:'📨', name:'跨部门协作', summary:'美工/客服/跟单 三部门消息总线',
      what:'三方共享同一份 Supabase 数据 + Realtime 实时同步。',
      why:'客服跟美工以前靠群消息沟通,关键工单被刷下去就漏。这里:有状态、有超时、有分派、有关注人。',
      how:[
        '收件箱:别人发给客服的工单',
        '分派给我:主管把工单分给了我',
        '⏰ 超时:还没处理超过截止时间的(红色脉冲)',
        '我发起的:我发出去的',
        '新建工单时:选关联网站 → 自动建议负责人 + 选 watcher 多人收到通知',
      ],
      tips:[
        '主管特权:🌐 店铺负责人(维护客服员工 ↔ 网站映射,对方部门也能看)',
        '主管特权:⏰ 超时阈值(自定义客服部 11 类 × 4 优先级超时天数)',
        '详情里 📌 分派给手下 + 👁 关注人管理',
        '完成时弹桌面通知',
      ],
    },
    { key:'briefings', icon:'📢', name:'会议纪要', summary:'主管发布要点 + 员工确认',
      what:'书面化的会议要点 + 员工标记已读已处理。',
      why:'周会内容靠记忆容易漏。',
    },
    isAdmin && { key:'admin_overview', icon:'📊', name:'主管汇总 (admin)', summary:'所有模块一屏看全',
      what:'团队当日所有模块的进度仪表盘。',
      why:'主管要看团队全局,不用切多个 tab。',
    },
    { key:'dashboard', icon:'📈', name:'数据看板', summary:'团队数据 + 个人 KPI',
      what:'统计图表 + 员工绩效。',
    },
    isAdmin && { key:'delete_approvals', icon:'🛡', name:'删除审批 (admin)', summary:'员工删除申请待审批',
      what:'员工发起的删除申请待主管审批。',
      why:'防止误删/恶意删除关键数据,主管把关。',
    },
    { key:'trash', icon:'🗑', name:'回收站', summary:'软删除数据可还原',
      what:'所有"删除"操作都是软删,这里可还原。',
    },
    isAdmin && { key:'admin', icon:'⚙', name:'设置 (admin)', summary:'员工 / 拒付专人 / Gemini / 退款处理人',
      what:'系统配置全集。',
    },
  ].filter(Boolean);

  return (
    <div>
      <HelpH1>📚 模块详解 — 19 个模块,每个都做什么</HelpH1>
      <HelpP>下面每个模块都包含 3 件事:<strong>是什么</strong> · <strong>为什么这么设计</strong> · <strong>怎么用</strong>。</HelpP>
      <div style={{display:'flex', flexDirection:'column', gap:14, marginTop:14}}>
        {MODS.map(m => (
          <div key={m.key} style={{padding:'14px 16px', background:'#fafaf7', border:'1px solid var(--line)', borderRadius:10}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
              <span style={{fontSize:22}}>{m.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:15, fontWeight:600, color:'var(--ink)'}}>{m.name}</div>
                <div style={{fontSize:11, color:'var(--ink-3)'}}>{m.summary}</div>
              </div>
              <span style={{padding:'2px 8px', background:'white', border:'1px solid var(--line)', borderRadius:8, fontSize:10, color:'var(--ink-3)', fontFamily:'ui-monospace'}}>tab: {m.key}</span>
            </div>
            <div style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.6, marginTop:4}}>
              <div><strong style={{color:'#0369a1'}}>📌 是什么:</strong> {m.what}</div>
              {m.why && <div style={{marginTop:3}}><strong style={{color:'#7c3aed'}}>💭 为什么:</strong> {m.why}</div>}
              {m.how && (
                <div style={{marginTop:5}}>
                  <strong style={{color:'#16a34a'}}>🎯 怎么用:</strong>
                  <ol style={{paddingLeft:20, margin:'3px 0 0 0'}}>{m.how.map((h,i) => <li key={i} style={{marginBottom:1}}>{h}</li>)}</ol>
                </div>
              )}
              {m.tips && (
                <div style={{marginTop:5, padding:'6px 9px', background:'#fef3c7', border:'1px solid #fde047', borderRadius:6}}>
                  <strong style={{color:'#854d0e'}}>💡 高级技巧:</strong>
                  <ul style={{paddingLeft:18, margin:'2px 0 0 0', listStyle:'disc'}}>{m.tips.map((t,i) => <li key={i} style={{marginBottom:1, color:'#854d0e'}}>{t}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════ Section: 角色权限 ════════════════
const HelpSectionRoles = () => {
  const matrix = [
    { op:'查看自己的客户',           staff:'✓', finance:'✓', admin:'✓', super_admin:'✓' },
    { op:'查看所有员工的客户',       staff:'✗', finance:'✗', admin:'✓', super_admin:'✓' },
    { op:'录入退款 / 拒付 / 售后',   staff:'✓', finance:'✓', admin:'✓', super_admin:'✓' },
    { op:'审批退款',                 staff:'仅退款处理人', finance:'仅退款处理人', admin:'✓', super_admin:'✓' },
    { op:'删除数据',                 staff:'需申请', finance:'需申请', admin:'直接', super_admin:'直接' },
    { op:'审批删除申请',             staff:'✗', finance:'✗', admin:'✓', super_admin:'✓' },
    { op:'查看 / 编辑员工',          staff:'✗', finance:'✗', admin:'✓', super_admin:'✓' },
    { op:'看财务模块',               staff:'✗', finance:'✓', admin:'✓', super_admin:'✓' },
    { op:'跨部门协作 - 工单分派',    staff:'✗', finance:'✗', admin:'✓', super_admin:'✓' },
    { op:'跨部门协作 - 编辑 watcher',staff:'✗', finance:'✗', admin:'✓', super_admin:'✓' },
    { op:'编辑超时阈值',             staff:'✗', finance:'✗', admin:'✓', super_admin:'✓' },
    { op:'店铺负责人 - 维护',        staff:'✗', finance:'✗', admin:'✓', super_admin:'✓' },
    { op:'店铺负责人 - 编辑其他部门记录', staff:'✗', finance:'✗', admin:'✗', super_admin:'✗' },
    { op:'升级到主管',               staff:'✓', finance:'✓', admin:'-', super_admin:'-' },
    { op:'升级到老板',               staff:'-', finance:'-', admin:'✓', super_admin:'-' },
  ];
  const cellStyle = (v) => {
    if (v === '✓' || v === '直接') return { color:'#15803d', fontWeight:600 };
    if (v === '✗') return { color:'#b91c1c', fontWeight:600 };
    if (v === '-') return { color:'var(--ink-4)' };
    return { color:'#b45309', fontWeight:500, fontSize:10 };
  };
  return (
    <div>
      <HelpH1>👥 角色权限速查表</HelpH1>
      <HelpP>系统有 4 种角色,每种角色能做的不一样。下面这张表是<strong>完整权限速查</strong>:</HelpP>
      <div style={{overflowX:'auto', marginTop:10}}>
        <table style={{width:'100%', fontSize:12, borderCollapse:'collapse', background:'white'}}>
          <thead>
            <tr style={{background:'#f5f5f7'}}>
              <th style={{padding:'8px 10px', textAlign:'left', borderBottom:'1px solid var(--line)', fontWeight:600}}>操作</th>
              <th style={{padding:'8px 10px', textAlign:'center', borderBottom:'1px solid var(--line)', fontWeight:600}}>员工</th>
              <th style={{padding:'8px 10px', textAlign:'center', borderBottom:'1px solid var(--line)', fontWeight:600}}>财务</th>
              <th style={{padding:'8px 10px', textAlign:'center', borderBottom:'1px solid var(--line)', fontWeight:600}}>主管</th>
              <th style={{padding:'8px 10px', textAlign:'center', borderBottom:'1px solid var(--line)', fontWeight:600}}>总管</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((r, i) => (
              <tr key={i} style={{borderBottom:'1px solid var(--line-soft)'}}>
                <td style={{padding:'7px 10px'}}>{r.op}</td>
                <td style={{padding:'7px 10px', textAlign:'center', ...cellStyle(r.staff)}}>{r.staff}</td>
                <td style={{padding:'7px 10px', textAlign:'center', ...cellStyle(r.finance)}}>{r.finance}</td>
                <td style={{padding:'7px 10px', textAlign:'center', ...cellStyle(r.admin)}}>{r.admin}</td>
                <td style={{padding:'7px 10px', textAlign:'center', ...cellStyle(r.super_admin)}}>{r.super_admin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HelpNote kind="info">
        <strong>"退款处理人"</strong> 在 <HelpCode>⚙ 设置 → 💰 退款处理人</HelpCode> 配置(目前是 Miya / Nicole / Yulia 周末顶班)。
      </HelpNote>
    </div>
  );
};

// ════════════════ Section: 快捷操作 ════════════════
const HelpSectionShortcuts = () => (
  <div>
    <HelpH1>⌨ 快捷操作 — 提速 10 倍</HelpH1>

    <HelpH2>🖱 鼠标快捷</HelpH2>
    <HelpUL items={[
      <><strong>右键</strong>任意 tab → "在新标签页中打开"(支持多窗口同时工作)</>,
      <><strong>Ctrl+点击</strong>(Mac: Cmd+点击)→ 后台新标签打开</>,
      <><strong>Shift+点击</strong> → 新窗口打开</>,
      <><strong>中键点击</strong> → 后台新标签</>,
    ]} />
    <HelpNote kind="good">
      实战:<strong>同时盯</strong> 客服跟进 + 拒付 + 工作主线 三个窗口,不用反复切 tab。
    </HelpNote>

    <HelpH2>📋 粘贴 / 拖拽图片(8 处全部支持)</HelpH2>
    <HelpUL items={[
      'Win+Shift+S 截图 → 在系统任何附件区直接 Ctrl+V',
      '从文件夹拖图直接丢到附件区(批量)',
      '支持的位置:跟进附件 / 拒付证据 / 线下单图 / 定制设计稿 / 实拍核实 / 工单草稿 / 跨部门工单 / 跨部门回复',
    ]} />
    <HelpNote>
      多数地方有"上传区"focus 后才能粘贴 — 先点一下虚线框,再 Ctrl+V。<br/>
      <strong>跨部门协作</strong> + <strong>知识库</strong> 是"全局粘贴",在模态框任何位置都可以 Ctrl+V。
    </HelpNote>

    <HelpH2>⌨ 键盘快捷</HelpH2>
    <HelpUL items={[
      <><HelpCode>Esc</HelpCode> 关闭模态框 / AI 评价面板</>,
      <><HelpCode>Ctrl+Enter</HelpCode> 回复框发送</>,
      <><HelpCode>Ctrl+Shift+R</HelpCode> 强刷(清除缓存,部署新版后必做)</>,
      <><HelpCode>F12</HelpCode> 打开开发者工具(报 bug 必须用)</>,
    ]} />

    <HelpH2>🎯 找东西</HelpH2>
    <HelpUL items={[
      <>顶部 <strong>🔍 全局搜索</strong>:跨模块找客户 / 订单 / SKU / 邮箱</>,
      '每个列表都有"智能搜索":空格分多个关键词,AND 匹配(都包含才显示)',
      <>每个列表都有<strong>时间筛选 chips</strong>:今天 / 3 天 / 7 天 / 14 天 / 30 天 / 90 天 / 全部</>,
    ]} />

    <HelpH2>🎨 自定义布局</HelpH2>
    <HelpUL items={[
      <>右上角 <HelpCode>⚙ 布局</HelpCode> 按钮 → 把不常用的 tab 从顶部移到侧栏</>,
      <>侧边栏左上 <HelpCode>◀ 折叠</HelpCode> 按钮 → 收起到 icon-only(56px 宽)</>,
      '每个员工独立配置 · 自动保存到本地浏览器(切账号自动还原)',
    ]} />
  </div>
);

// ════════════════ Section: 报告 Bug ════════════════
const HelpSectionBugs = () => (
  <div>
    <HelpH1>🐛 报告 Bug — 让 AI 在 5 分钟内修好</HelpH1>
    <HelpNote kind="warn">
      <strong>好的 Bug 报告 = 1 分钟看懂 + 5 分钟修好。</strong><br/>
      坏的 Bug 报告:"不工作了","白屏","保存不了" → AI 看不懂,只能猜,可能要来回 3-5 轮才能定位,严重影响工作。
    </HelpNote>

    <HelpH2>第一步:准备这 4 样东西</HelpH2>
    <HelpUL items={[
      <><strong>1. 版本号</strong> — F12 → Console → 找到 <HelpCode>📦 统一工作台 v2026.XX.XX-XXX 已加载</HelpCode></>,
      <><strong>2. 截图</strong> — F12 Console 红色报错堆栈截图(不是文字!要看堆栈)+ UI 异常截图</>,
      <><strong>3. 复现步骤</strong> — 从登录到出 bug 每一步操作的清单</>,
      <><strong>4. 环境</strong> — 谁登录的(角色)/ 哪个浏览器 / 操作系统</>,
    ]} />

    <HelpH2>第二步:用这个模板</HelpH2>
    <div style={{padding:'14px 16px', background:'#1a1a17', color:'#e0e0e0', borderRadius:8, fontSize:12, fontFamily:'ui-monospace, monospace', lineHeight:1.7, whiteSpace:'pre-wrap', marginBottom:10}}>
{`版本号: 2026.05.25-fix13   ← 从 F12 Console 看到的
环境: Chrome 130 / Windows 11
账号: Miya · admin

复现步骤:
1. 进【拒付】tab
2. 点【+ 新建拒付】
3. 填好所有字段
4. 点【保存】

期望结果:
保存成功,关闭弹窗,列表里出现新条目

实际结果:
弹出错误 "NULL not allowed in column created_by"
console 报红色错误(截图见附件)
列表没刷新

截图:
[贴 console 报错截图]
[贴 UI 截图]`}</div>

    <HelpH2>第三步:不要这样描述</HelpH2>
    <HelpUL items={[
      <><span style={{color:'#b91c1c'}}>❌</span> "保存不了" — 哪个保存?报错是什么?</>,
      <><span style={{color:'#b91c1c'}}>❌</span> "白屏了" — Console 有什么?哪个 tab?</>,
      <><span style={{color:'#b91c1c'}}>❌</span> "刚才不行了" — 哪个版本?什么操作?</>,
      <><span style={{color:'#b91c1c'}}>❌</span> "邝雅琦反馈说有问题" — 什么问题?报错截图呢?</>,
      <><span style={{color:'#15803d'}}>✅</span> "fix13 版本,Miya 登录,点【拒付】→【+新建】→【保存】,弹出 'NULL not allowed in column created_by',截图附上"</>,
    ]} />

    <HelpH2>第四步:发到哪里</HelpH2>
    <HelpNote kind="good">
      <strong>员工 → 主管(Nicole / Miya)→ AI 助手(Claude)</strong><br/>
      主管收到详细 bug 报告后,贴到跟 Claude 的对话窗口里。AI 看代码定位、修复、输出新 HTML。<br/>
      你 Ctrl+Shift+R 强刷即生效。<br/>
      如果是数据库改动(很少),AI 会附 SQL 文件,需要在 Supabase 跑一下。
    </HelpNote>

    <HelpH2>怎么截图 F12 Console 报错?</HelpH2>
    <HelpUL items={[
      <>1. 按 <HelpCode>F12</HelpCode> 打开开发者工具</>,
      <>2. 切到 <HelpCode>Console</HelpCode> 标签</>,
      <>3. 找<strong>红色</strong>的 Error 行(可能有 ▶ 可以点开看堆栈)</>,
      <>4. 点开 ▶ 看完整堆栈</>,
      <>5. 截图(Win+Shift+S 框选)</>,
      <>6. 把图片<strong>粘贴</strong>到给主管的消息里</>,
    ]} />
  </div>
);

// ════════════════ Section: 版本日志 ════════════════
const HelpSectionHistory = () => {
  const typeBadge = (type) => {
    const M = {
      feature:  { label:'✨ 新功能', bg:'#dcfce7', color:'#15803d' },
      fix:      { label:'🔧 修复',   bg:'#fee2e2', color:'#b91c1c' },
      refactor: { label:'♻ 重构',    bg:'#fef3c7', color:'#854d0e' },
      perf:     { label:'⚡ 性能',   bg:'#dbeafe', color:'#1e40af' },
      data:     { label:'📦 数据',   bg:'#f3e8ff', color:'#7c3aed' },
    };
    const d = M[type] || M.feature;
    return <span style={{padding:'2px 6px', background:d.bg, color:d.color, borderRadius:6, fontSize:9, fontWeight:700, flexShrink:0, marginRight:6}}>{d.label}</span>;
  };
  return (
    <div>
      <HelpH1>📦 版本日志 — {VERSION_HISTORY.length} 个迭代版本</HelpH1>
      <HelpP>每次升级都会在这里留痕。最新版在最上面。</HelpP>
      <HelpNote>
        当前版本:<HelpCode>{APP_VERSION}</HelpCode>
      </HelpNote>
      <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:14}}>
        {VERSION_HISTORY.map((v, i) => (
          <div key={v.version} style={{padding:'12px 14px', background: i === 0 ? '#f0f9ff' : '#fafaf7', border:'1px solid '+(i===0?'#bae6fd':'var(--line)'), borderRadius:9}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap'}}>
              <code style={{padding:'2px 8px', background:'white', border:'1px solid var(--line)', borderRadius:6, fontSize:11, fontFamily:'ui-monospace, monospace', color: i === 0 ? '#0369a1' : 'var(--ink)', fontWeight:600}}>{v.version}</code>
              {i === 0 && <span style={{padding:'2px 8px', background:'#0369a1', color:'white', borderRadius:6, fontSize:10, fontWeight:600}}>当前</span>}
              <span style={{fontSize:11, color:'var(--ink-3)'}}>📅 {v.date}</span>
              <span style={{fontSize:13, fontWeight:600, color:'var(--ink)'}}>· {v.title}</span>
            </div>
            <ul style={{paddingLeft:0, listStyle:'none', margin:0}}>
              {v.changes.map((c, j) => (
                <li key={j} style={{padding:'3px 0', fontSize:12, color:'var(--ink-2)', display:'flex', alignItems:'flex-start', lineHeight:1.5}}>
                  {typeBadge(c.type)}
                  <span style={{flex:1}}>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════ Section: AI 能力清单 ════════════════
const HelpSectionAi = () => (
  <div>
    <HelpH1>🤖 AI (Claude) 能做什么</HelpH1>
    <HelpP>这个系统所有代码都是 AI 写的,所有 bug 修复 + 新功能也都靠 AI。下面是 AI 已实现的能力 + 做不了的事。</HelpP>

    <HelpH2>✅ 已实现能力(直接可用)</HelpH2>
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
      {[
        { i:'🔧', t:'修代码 Bug', d:'你给截图,AI 定位+修(已修过 200+ 次)' },
        { i:'✨', t:'加新功能', d:'你描述需求,AI 开发(本系统积累 13 个大版本)' },
        { i:'🎨', t:'改 UI', d:'布局调整 / 颜色 / 字体 / 排版' },
        { i:'📦', t:'加新模块', d:'从零设计一个全新功能模块' },
        { i:'🗄', t:'数据库改造', d:'Schema 改 / SQL 迁移 / Realtime 订阅' },
        { i:'🔗', t:'跨系统集成', d:'iframe / postMessage / 三方共享 Supabase' },
        { i:'⚡', t:'性能优化', d:'加载速度 / 持久挂载 / 缓存策略' },
        { i:'📊', t:'导入导出', d:'CSV / Excel / PDF' },
        { i:'🖼', t:'图片处理', d:'粘贴 / 拖拽 / 压缩 / 预览' },
        { i:'🪟', t:'多窗口支持', d:'右键新标签 / 中键 / Ctrl+点击' },
        { i:'🔐', t:'权限管理', d:'不同角色不同视图(已 4 种角色)' },
        { i:'🌐', t:'实时同步', d:'Supabase Realtime · 多端实时刷新' },
        { i:'🎯', t:'智能搜索', d:'多关键词 AND 匹配 + 跨字段' },
        { i:'📅', t:'时间智能', d:'今天 / 3 天 / 7 天 chips + 截止判定' },
      ].map((c, i) => (
        <div key={i} style={{padding:'10px 12px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8}}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
            <span style={{fontSize:18}}>{c.i}</span>
            <span style={{fontSize:13, fontWeight:600, color:'#15803d'}}>{c.t}</span>
          </div>
          <div style={{fontSize:11, color:'var(--ink-2)', lineHeight:1.4}}>{c.d}</div>
        </div>
      ))}
    </div>

    <HelpH2>❌ 做不了的事</HelpH2>
    <HelpUL items={[
      <><strong>直接访问硬件</strong> — 摄像头 / 打印机 / 蓝牙(浏览器沙箱限制,只能通过 Web API)</>,
      <><strong>不可逆操作的自动化</strong> — 批量删除生产数据需要人工逐项确认</>,
      <><strong>物理出货</strong> — 工厂 / 物流追踪需要对接外部 API,不在本系统内</>,
      <><strong>3D 渲染 / AI 图像生成</strong> — 这是<strong>美工部 worktrack-kpi 系统</strong>的事,客服侧通过 iframe 嵌入调用</>,
      <><strong>替你做决策</strong> — AI 只执行你的需求,不会自己判断"该不该退款"</>,
    ]} />

    <HelpH2>💬 怎么找 AI?</HelpH2>
    <HelpNote kind="info">
      <strong>员工不直接找 AI</strong>。Nicole / Miya 在跟 AI 对话的窗口里。你把 bug 报告 / 新需求<strong>给主管</strong>,主管粘到对话里,AI 会:
      <ol style={{paddingLeft:20, marginTop:6}}>
        <li>看代码定位问题</li>
        <li>写修复 / 新功能</li>
        <li>输出新版 HTML(可能附 SQL)</li>
        <li>你 Ctrl+Shift+R 强刷生效</li>
      </ol>
    </HelpNote>
  </div>
);

// ════════════════ Section: 路线图 ════════════════
const HelpSectionRoadmap = () => (
  <div>
    <HelpH1>🛣 待开发路线图</HelpH1>
    <HelpP>下面是<strong>还没做但 AI 能做</strong>的事。如果你觉得某项有价值,告诉主管,我下一轮加上。</HelpP>

    <HelpH2>📱 体验优化(中等优先)</HelpH2>
    <HelpUL items={[
      '手机响应式 — 左侧栏在手机变成抽屉',
      '拖拽排序 — 自定义布局里直接拖 tab 调顺序(目前是 ↑↓ 按钮)',
      '暗黑模式 — 跟随系统切换',
      '批量操作 — 评价任务 / 工单批量改状态',
    ]} />

    <HelpH2>📊 数据洞察(中等优先)</HelpH2>
    <HelpUL items={[
      '数据看板增强 — 更多图表 / 个人 KPI 趋势 / 团队对比',
      '客户档案合并 — 重复客户记录智能合并',
      '订单全生命周期视图 — 一个客户的所有事件时间线',
    ]} />

    <HelpH2>🔔 实时增强(低优先)</HelpH2>
    <HelpUL items={[
      '桌面通知 — 跨部门协作 watchers 完成时也通知(spec 说"下批做")',
      '离线模式 — 断网仍能写入,联网后同步',
      '@提及 — 跨部门工单里 @某人,他能在收件箱看到高亮',
    ]} />

    <HelpH2>🌐 国际化(低优先)</HelpH2>
    <HelpUL items={[
      '多语言 — 界面英文版(给外籍员工)',
      '多时区 — 显示时间用员工所在时区',
    ]} />

    <HelpH2>💰 财务增强(财务部需求)</HelpH2>
    <HelpUL items={[
      '上海单独报关件 350元/票 — 计算器加全局复选框',
      '更多承运商(spec 来) — 新增/调整报价',
      '账单批量对账 — 上传承运商账单 Excel 自动核账',
    ]} />

    <HelpH2>🎯 客服增强(客服部需求)</HelpH2>
    <HelpUL items={[
      '邮件模板 — 知识库里加邮件正文模板(目前只有聊天模板)',
      'WhatsApp 集成 — 一键发回复模板到 WhatsApp(需要外部 API)',
      '智能下次跟进时间 — AI 根据沟通内容建议时间',
    ]} />

    <HelpNote kind="warn">
      <strong>说明</strong>:这些都是技术上 AI 能做的,但<strong>排不排上日程取决于业务优先级</strong>。主管和老板决定先做哪个。
    </HelpNote>
  </div>
);

// ════════════════ Section: 设计哲学 ════════════════
const HelpSectionPhilosophy = () => (
  <div>
    <HelpH1>💡 设计哲学 — 为什么这么设计</HelpH1>
    <HelpP>新人理解了"为什么",才能避免误用。下面是这个系统的 7 条设计原则。</HelpP>

    <HelpH2>1. 不要重新发明轮子</HelpH2>
    <HelpP>保留你们原有的 Excel/纸质流程,只是把它<strong>数字化 + 多人协同</strong>。所以你会看到很多功能是"录入 → 跟进 → 完成"三步式,跟纸质工作流一致。</HelpP>

    <HelpH2>2. 防呆设计 > 强制约束</HelpH2>
    <HelpUL items={[
      '关键字段不能漏(创建人/创建时间/状态自动填,不让人填错)',
      '删除走"软删除 + 回收站",误操作可还原',
      '重要操作(退款 / 大额支付)要主管审批,不让人误删',
      '错误提示告诉"怎么解决",不只是"出错了"',
    ]} />

    <HelpH2>3. 速度 > 美观</HelpH2>
    <HelpUL items={[
      '所有按钮 1 秒内响应',
      '切换 tab 不重新加载(visitedTabs 机制 + iframe 持久挂载)',
      '大列表自动分页 + 智能搜索',
      'AI 评价工具 preconnect 提前握手,打开瞬间显示',
    ]} />

    <HelpH2>4. 信息密度高,但不杂乱</HelpH2>
    <HelpUL items={[
      '苹果风格:大量空白 + 关键信息突出',
      '颜色编码:🔴红=紧急/超时/拒付 · 🟢绿=完成 · 🔵蓝=进行中 · 🟡橙=待处理',
      'emoji 做标签:📞 客服跟进 比 "客户跟进表" 更快识别',
      'badge 数字:让你不用进 tab 就知道有几个待办',
    ]} />

    <HelpH2>5. 每个人都是主角</HelpH2>
    <HelpUL items={[
      '每个员工独立的导航布局(⚙ 布局,保存到本地)',
      '工作快照面板:登录第一眼看"今天我该干什么"',
      '个人 KPI(数据看板)',
      '退款处理人专属红卡 / 主管特权按钮 / 财务专属财务模块',
    ]} />

    <HelpH2>6. 主管不被困在审批里</HelpH2>
    <HelpUL items={[
      '软删除审批 / 退款审批 / 工单升级 — 主管有徽章提醒',
      '不阻塞日常工作 — 主管自己也是员工,先干自己的活,空了再批',
      '紧急横幅:有超时/紧急任务时,主页顶部红色震动 + 一键跳转',
    ]} />

    <HelpH2>7. 跨部门是协作不是甩锅</HelpH2>
    <HelpUL items={[
      '跨部门协作:有状态/超时/分派/关注人',
      '三方共享同一份数据,谁都改不了对方的(system === MY_SYSTEM 强制约束)',
      '工单完成时双方都收到桌面通知 + Realtime 实时刷新',
      '"店铺负责人"映射:选了 Vakkerlight 自动派对方部门的负责人,不用问"谁负责"',
    ]} />

    <HelpNote kind="info">
      <strong>底线规则</strong>:任何让用户多点 1 次、多输 1 个字、多等 1 秒的功能 — 重新设计。
    </HelpNote>
  </div>
);

// ============================================================
// 主 App (Shell + 路由)
// ============================================================
const App = () => {
  // 🆕 fix22: 联动 1+3 — 全局加载产品主表 + 自定义网站,Context 注入到所有模块
  const [customSites, setCustomSites] = useState([]);
  const [productsList, setProductsList] = useState([]);
  
  const loadCustomSites = useCallback(async () => {
    try {
      if (!CLOUD.client) return;
      const { data } = await CLOUD.client.from('system_settings').select('value').eq('key', 'custom_sites').maybeSingle();
      setCustomSites((data?.value?.sites) || []);
    } catch (e) { console.warn('[联动3] 加载自定义网站失败', e); }
  }, []);
  
  const loadProductsList = useCallback(async () => {
    try {
      const list = await CLOUD.list('products', { limit: 2000 });
      setProductsList((list || []).filter(p => !p.deleted));
    } catch (e) { console.warn('[联动1] 加载产品主表失败', e); }
  }, []);
  
  useEffect(() => {
    // 延迟加载,等 CLOUD 初始化完
    const t = setTimeout(() => { loadCustomSites(); loadProductsList(); }, 1500);
    return () => clearTimeout(t);
  }, []);
  
  // 监听 Realtime — 产品/自定义网站变了立刻刷新
  useEffect(() => {
    if (!CLOUD.isOn || !CLOUD.supabase) return;
    let ch1 = null, ch2 = null;
    try {
      ch1 = CLOUD.supabase.channel('products_global').on('postgres_changes',
        { event:'*', schema:'public', table:'products' }, () => loadProductsList()).subscribe();
      ch2 = CLOUD.supabase.channel('settings_global').on('postgres_changes',
        { event:'*', schema:'public', table:'system_settings', filter:'key=eq.custom_sites' }, () => loadCustomSites()).subscribe();
    } catch (e) { console.warn('Realtime 订阅失败', e); }
    return () => { try { if (ch1) CLOUD.supabase.removeChannel(ch1); if (ch2) CLOUD.supabase.removeChannel(ch2); } catch {} };
  }, [loadProductsList, loadCustomSites]);
  
  // 合并的网站代码 — 内置 + 启用的自定义
  const mergedSiteCodes = useMemo(() => {
    const activeCustom = customSites.filter(s => s.active !== false).map(s => s.code);
    return [...SITES, ...activeCustom.filter(c => !SITES.includes(c))];
  }, [customSites]);
  
  const sitesContextValue = useMemo(() => ({ siteCodes: mergedSiteCodes, customSites, refresh: loadCustomSites }), [mergedSiteCodes, customSites, loadCustomSites]);
  const productsContextValue = useMemo(() => ({ products: productsList, refresh: loadProductsList }), [productsList, loadProductsList]);
  
  // 员工 (localStorage + 云同步备份) - 加版本号机制，代码里改了 INITIAL_EMPLOYEES 后能自动覆盖
  const EMPLOYEES_VERSION = 8;  // 🆕 加入 13 个北简客服
  const [employees, setEmployees] = useState(() => {
    const storedVer = STORE.get('employees_version', 0);
    const stored = STORE.get('employees', []);
    
    // 🆕 保险机制:即使版本号已经是最新,也检查 INITIAL_EMPLOYEES 里有没有缺失的(比如用户曾经删除过)
    const missingInitials = INITIAL_EMPLOYEES.filter(i => !stored.some(s => s.id === i.id));
    const needsUpdate = storedVer < EMPLOYEES_VERSION || missingInitials.length > 0;
    
    if (needsUpdate) {
      // 版本升级 / 补全缺失员工 → 合并 INITIAL_EMPLOYEES 的新数据（按 id），但保留用户自己添加的员工
      const merged = INITIAL_EMPLOYEES.map(initial => {
        const old = stored.find(e => e.id === initial.id);
        // 强制用 INITIAL_EMPLOYEES 的 name/alias/sites/role（覆盖 localStorage），但保留用户改过的密码
        return old ? { ...initial, password: old.password || initial.password } : initial;
      });
      // 加上用户自己添加的（不在 INITIAL_EMPLOYEES 里的）
      const extras = stored.filter(e => !INITIAL_EMPLOYEES.some(i => i.id === e.id));
      STORE.set('employees_version', EMPLOYEES_VERSION);
      if (missingInitials.length > 0) {
        console.log('[员工补充] 自动补入缺失的内置账号:', missingInitials.map(e => e.name).join(', '));
      }
      return [...merged, ...extras];
    }
    return stored.length > 0 ? stored : INITIAL_EMPLOYEES;
  });
  useEffect(() => { STORE.set('employees', employees); }, [employees]);

  // 云同步配置（默认启用 + 版本号机制：URL 变化时强制更新）
  const CLOUD_CFG_VERSION = 3;  // 客服项目正确配置后的版本
  const [cloudCfg, setCloudCfg] = useState(() => {
    const saved = STORE.get('cloud_config', null);
    const savedVer = STORE.get('cloud_config_version', 0);
    // 版本号过期 / URL 不匹配 → 强制用默认（避免 PO 项目旧配置残留）
    if (!saved || savedVer < CLOUD_CFG_VERSION || saved.url !== DEFAULT_SB_URL) {
      const fresh = { url: DEFAULT_SB_URL, key: DEFAULT_SB_KEY, enabled: true };
      STORE.set('cloud_config', fresh);
      STORE.set('cloud_config_version', CLOUD_CFG_VERSION);
      return fresh;
    }
    // 即使保留旧 cfg，也强制 enabled = true（数据必须能同步）
    if (saved.enabled === false) {
      const fixed = { ...saved, enabled: true };
      STORE.set('cloud_config', fixed);
      return fixed;
    }
    return saved;
  });
  const [cloudOn, setCloudOn] = useState(false);
  const [cloudVersion, setCloudVersion] = useState(0); // 用于强制重新加载

  // 初始化云连接
  useEffect(() => {
    if (cloudCfg.enabled && cloudCfg.url && cloudCfg.key) {
      const ok = CLOUD.init(cloudCfg.url, cloudCfg.key);
      setCloudOn(ok);
      if (ok) {
        // 后台 ping
        CLOUD.ping().then(r => { if (!r.ok) setCloudOn(false); });
      }
    } else {
      setCloudOn(false);
    }
  }, [cloudCfg]);

  // 当前登录用户
  const [user, setUser] = useState(() => {
    const stored = STORE.get('current_user', null);
    if (!stored) return null;
    const emp = STORE.get('employees', INITIAL_EMPLOYEES).find(e => e.id === stored.id);
    return emp || null;
  });

  // 所有客服记录 (localStorage + 云同步)
  const [records, setRecords] = useState(() => STORE.get('cs_records', []));
  // 写入 localStorage（永久兜底）
  useEffect(() => { STORE.set('cs_records', records); }, [records]);

  // 云同步：启用时把云端记录拉下来覆盖本地视图（首次加载）
  useEffect(() => {
    if (!cloudOn || !user) return;
    (async () => {
      const cloud = await CLOUD.list('workspace_records', { order:{col:'updated_at', asc:false}, limit:1000 });
      if (cloud !== null) {
        // 🆕 fix7: 不能简单云端覆盖! 用户可能有未同步的本地记录(网络断 / 跨日 / 上次同步失败)
        // 旧版策略导致数据丢失: 用户工作一天,本地有 N 条,刷新后被云端覆盖 → 全没了
        // 新策略: 智能合并
        //   1. 本地有但云端无 → 保留本地(待同步)
        //   2. 本地比云端新 → 保留本地(待同步)
        //   3. 其他 → 用云端
        // 然后立即触发重新同步,把保留的本地记录补传到云端
        const localRecords = recordsRef.current || STORE.get('cs_records', []);
        const cloudById = new Map((cloud || []).map(r => [r.id, r]));
        const localOnly = [];
        const localNewer = [];
        
        (localRecords || []).forEach(local => {
          if (!local || !local.id) return;
          // 跳过完全空白且非删除的"未填"行
          if (!isRecordMeaningful(local) && !local.deleted) return;
          const remote = cloudById.get(local.id);
          if (!remote) {
            // 本地独有 — 从未同步过
            localOnly.push(local);
          } else {
            // 两边都有 — 比较时间戳
            const localTs = new Date(local.updatedAt || local.updated_at || local.createdAt || 0).getTime();
            const remoteTs = new Date(remote.updated_at || remote.updatedAt || remote.created_at || 0).getTime();
            if (localTs > remoteTs + 1000) {  // 1秒容差避免时钟漂移
              localNewer.push(local);
            }
          }
        });
        
        if (localOnly.length > 0 || localNewer.length > 0) {
          // 合并: 本地未同步的优先保留,其他用云端
          const keepLocalIds = new Set([...localOnly, ...localNewer].map(r => r.id));
          const merged = [
            ...localOnly,
            ...localNewer,
            ...(cloud || []).filter(c => !keepLocalIds.has(c.id))
          ];
          setRecords(merged);
          const count = localOnly.length + localNewer.length;
          console.warn(`[fix7 数据保护] 检测到 ${count} 条本地未同步记录 — 本地独有: ${localOnly.length},本地更新: ${localNewer.length}。已恢复并将自动重新上传。`);
          // toast 在 useToast 还没初始化时不能用,延后
          setTimeout(() => {
            try { toast && toast(`⚠ 恢复 ${count} 条本地未同步记录,正在重新上传...`); } catch(e){}
          }, 200);
          // setRecords 会触发 debounced upload effect,自动重新同步
        } else {
          // 没有未同步的,正常用云端
          setRecords(cloud);
        }
      }
    })();
  }, [cloudOn, user, cloudVersion]);

  // 🛠 清理 record 上传前的空字符串日期 → null（Postgres 不接受 ""）
  // 🛠 已知"风险字段" - 如果云端 schema 没建会触发 "Could not find the X column" 错误
  // 这些字段是渐进式加上来的，老 schema 可能没有
  const RISKY_FIELDS = ['escalated', 'escalatedAt', 'escalateReason', 'transferUnreadFor', 'transferHistory'];
  
  // 跟踪上次失败的字段名集合，避免反复重试
  const skipFieldsRef = useRef(new Set());
  
  const sanitizeRecordForCloud = (r) => {
    const cleaned = { ...r };
    // 这些字段如果是 "" 必须改 null，否则 Postgres 报错
    ['nextFollowUp', 'date', 'deletedAt', 'createdAt', 'updatedAt', 'escalatedAt', 'transferUnreadFor'].forEach(k => {
      if (cleaned[k] === '' || cleaned[k] === undefined) cleaned[k] = null;
    });
    // 这些字段如果是 undefined 必须填值（boolean 类型）
    if (cleaned.escalated === undefined) cleaned.escalated = false;
    if (cleaned.escalateReason === undefined) cleaned.escalateReason = null;
    // status 不能空
    if (!cleaned.status) cleaned.status = 'pending';
    // 🆕 剥离已被云端拒绝的字段（schema cache 不识别的）
    skipFieldsRef.current.forEach(field => { delete cleaned[field]; });
    return cleaned;
  };
  
  // 🆕 智能上传 - 检测 schema 错误自动剥离字段重试
  const uploadRecordsWithRetry = async (recordsToUpload, maxRetries = 5) => {
    // 🆕 过滤掉完全空白的"未填内容"行 - 用户点+加一行但没填任何字段的
    // 已删除的也包括（让 deleted=true 能同步）
    const meaningful = (recordsToUpload || []).filter(r => 
      r.deleted || isRecordMeaningful(r)
    );
    if (meaningful.length === 0) return { ok: true, skipped: recordsToUpload?.length || 0 };
    
    let attempt = 0;
    while (attempt < maxRetries) {
      const cleaned = meaningful.map(sanitizeRecordForCloud);
      const { error } = await CLOUD.client.from('workspace_records').upsert(cleaned);
      if (!error) return { ok: true };  // 成功
      
      // 提取错误中的字段名："Could not find the 'XXX' column"
      const match = (error.message || '').match(/Could not find the '([^']+)' column/i);
      if (match) {
        const missingField = match[1];
        // 🆕 fix8: 剥离任意 schema 缓存里找不到的列(不再限定白名单)
        // 之前只剥离 escal/transfer 系列字段,但实际还会出现 'website' / 其他新字段
        // 不剥离就整批同步失败 → 数据全堆在本地 → 客服不敢刷新
        // 用户:"云端写入失败：Could not find the 'website' column..."
        const variants = [missingField, missingField.toLowerCase(), missingField.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
        variants.forEach(v => skipFieldsRef.current.add(v));
        console.warn(`[fix8 schema-retry] workspace_records 缺少列 "${missingField}",已自动剥离重试 (第 ${attempt + 1}/${maxRetries} 次)。建议主管在 Supabase 补建该列。`);
        attempt++;
        continue;
      }
      // 不是 schema 错误，直接抛
      throw error;
    }
    throw new Error('多次重试后仍然失败');
  };
  
  // 写入云端（每次 records 变化，debounced）
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const [cloudSyncError, setCloudSyncError] = useState(null);
  useEffect(() => {
    if (!cloudOn || !user) return;
    const t = setTimeout(async () => {
      const current = recordsRef.current;
      if (current.length === 0) return;
      try {
        await uploadRecordsWithRetry(current);
        setCloudSyncError(null);
      } catch(e) {
        console.error('云端写入失败', e);
        setCloudSyncError(e.message);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [records, cloudOn, user]);

  // tab - 持久化到 localStorage，刷新后保留
  const [activeTab, setActiveTab] = useState(() => {
    // URL hash 优先 (#tab=kb)，其次 localStorage，最后按角色默认
    // 🆕 fix11: 正则允许下划线,匹配 cross_dept / delete_approvals / ai_reviews / admin_overview / offline_orders / custom_photo 等
    const hashMatch = window.location.hash.match(/tab=([a-z_]+)/);
    let initialTab = null;
    if (hashMatch) initialTab = hashMatch[1];
    else {
      const saved = localStorage.getItem('ws_active_tab');
      if (saved) initialTab = saved;
    }
    // 🆕 fix11-hotfix2: ai_reviews 已废弃 → 重定向到 reviews (产品评价内部包含了 AI 工具)
    if (initialTab === 'ai_reviews') initialTab = 'reviews';
    // 🆕 fix11-hotfix4: report 已废弃 → 重定向到 cross_dept (跨部门协作取代了汇报工单)
    if (initialTab === 'report') initialTab = 'cross_dept';
    if (initialTab) return initialTab;
    // 财务人员默认进入财务 tab（user 可能为 null - 未登录状态）
    if (user && user.role === 'finance') return 'finance';
    return 'cs';
  });
  // tab 切换时写入 localStorage + URL hash
  useEffect(() => {
    localStorage.setItem('ws_active_tab', activeTab);
    // 仅当 tab 不是默认才写 hash，避免普通用户看到难看的 hash
    if (activeTab !== 'cs') {
      window.history.replaceState(null, '', `#tab=${activeTab}`);
    } else if (window.location.hash.includes('tab=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [activeTab]);
  
  // 🆕 fix11: 监听 URL hash 变化 (浏览器 back/forward + 右键新窗口都会触发) → 同步 activeTab
  useEffect(() => {
    const onHashChange = () => {
      const m = window.location.hash.match(/tab=([a-z_]+)/);
      if (m && m[1] !== activeTab) setActiveTab(m[1]);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [activeTab]);
  
  // 跟踪访问过的 iframe tab —— 让 iframe 保持挂载，避免切 tab 时丢数据
  const [visitedTabs, setVisitedTabs] = useState(() => {
    const s = new Set();
    // 如果初始 tab 是 iframe 类，也算访问过
    if (['finance','quote','kb','ai_reviews'].includes(activeTab)) s.add(activeTab);
    return s;
  });
  useEffect(() => {
    if (['finance','quote','kb','ai_reviews'].includes(activeTab) && !visitedTabs.has(activeTab)) {
      setVisitedTabs(prev => new Set([...prev, activeTab]));
    }
  }, [activeTab]);

  // Toast
  const [toast, toastNode] = useToast();

  // 🆕 fix7: 全局申请主管协助 helper — 任何编辑器都可调用 window.__requestSupervisorAssistance(...)
  // 避免给每个 editor 都加 employees / cloudOn / toast props
  useEffect(() => {
    window.__requestSupervisorAssistance = async ({ entityType, entityId, entityTitle, level } = {}) => {
      if (!user) { alert('请先登录'); return; }
      // 默认根据角色判断升级目标:staff/finance → admin,admin → super_admin,super_admin 已在顶
      const autoLevel = level || (user.role === 'admin' ? 'boss' : 'admin');
      if (user.role === 'super_admin') {
        alert('你已是最高级别(老板),无需升级');
        return;
      }
      const reason = prompt(
        `💼 申请${autoLevel === 'boss' ? '老板' : '主管'}协助\n\n请填写需要处理的原因 (将创建工单):`,
        ''
      );
      if (reason === null) return; // 取消
      if (!reason.trim()) { alert('请填写原因'); return; }
      const targetRole = autoLevel === 'boss' ? 'super_admin' : 'admin';
      const candidates = (employees || []).filter(e => e.role === targetRole && !e.hideFromList);
      const allCandidates = candidates.length > 0 ? candidates : (employees || []).filter(e => e.role === targetRole);
      if (allCandidates.length === 0) { alert(`没有找到${autoLevel === 'boss' ? '老板' : '主管'}账号`); return; }
      const target = allCandidates[0];
      const targetLabel = autoLevel === 'boss' ? '老板' : '主管';
      const ticket = {
        id: uid(),
        title: `🚨 ${entityType || '工单'}申请${targetLabel}协助 · ${entityTitle || '(无标题)'}`,
        content: `类型: ${entityType || '?'}\nID: ${entityId || '?'}\n来源: ${user.name}${user.alias ? ' ' + user.alias : ''}\n升级到: ${targetLabel}\n\n【原因】\n${reason.trim()}`,
        priority: 'high',
        department: 'service',
        from_id: user.id,
        from_name: user.name + (user.alias ? ' ' + user.alias : ''),
        target_id: target.id,
        target_name: target.name + (target.alias ? ' ' + target.alias : ''),
        status: 'pending',
        entity_type: entityType || null,
        entity_id: entityId || null,
        record_ref: entityId || null,
        created_at: nowISO(),
        updated_at: nowISO(),
      };
      try {
        if (cloudOn && CLOUD.client) {
          const { error } = await CLOUD.client.from('workspace_tickets').upsert(ticket);
          if (error) throw error;
        } else {
          STORE.set('tickets_local', [ticket, ...STORE.get('tickets_local', [])]);
        }
        toast(`✓ 已申请${targetLabel} ${target.name} 协助`);
      } catch (e) {
        alert(`❌ 申请失败: ${e.message}\n\n建议:工单可能未在云端创建,但本地已记录`);
        STORE.set('tickets_local', [ticket, ...STORE.get('tickets_local', [])]);
      }
    };
    return () => { delete window.__requestSupervisorAssistance; };
  }, [user, employees, cloudOn, toast]);

  // 🆕 fix9: 退款处理人员配置 (Miya / Nicole / Yulia 三人默认 — 主管可在设置改)
  // 业务场景: 所有客服可记录退款,但"批准/完成/上传截图"由名单中的人执行
  // 默认值:从 INITIAL_EMPLOYEES 推断 (u_miya/u_nicole/u_yulia),云端有配置时优先用云端
  const [refundProcessors, setRefundProcessors] = useState(() => 
    STORE.get('refund_processors_cache', ['u_miya', 'u_nicole', 'u_yulia'])
  );
  useEffect(() => {
    if (!cloudOn || !CLOUD.client) return;
    (async () => {
      try {
        const { data } = await CLOUD.client.from('system_settings').select('*').eq('key', 'refund_processors').single();
        const ids = data?.value?.user_ids;
        if (Array.isArray(ids) && ids.length > 0) {
          setRefundProcessors(ids);
          STORE.set('refund_processors_cache', ids);
        }
      } catch (e) { /* 表里没这条 → 用默认 */ }
    })();
  }, [cloudOn]);

  // 🆕 提供全局可调用的权限检查 (避免 prop drilling)
  useEffect(() => {
    window.__canProcessRefund = (u) => {
      const target = u || user;
      if (!target) return false;
      if (target.role === 'super_admin') return true;  // 老板永远可处理
      return refundProcessors.includes(target.id);
    };
    window.__refundProcessors = refundProcessors;
    window.__setRefundProcessors = async (newIds, currentUserName) => {
      if (!cloudOn || !CLOUD.client) { alert('云端未连接,无法保存'); return false; }
      try {
        const userNames = newIds.map(id => {
          const e = (employees || []).find(em => em.id === id);
          return e ? e.name + (e.alias ? ' ' + e.alias : '') : id;
        });
        const { error } = await CLOUD.client.from('system_settings').upsert({
          key: 'refund_processors',
          value: { user_ids: newIds, user_names: userNames },
          updated_at: new Date().toISOString(),
          updated_by_name: currentUserName || (user?.name || 'unknown'),
        });
        if (error) throw error;
        setRefundProcessors(newIds);
        STORE.set('refund_processors_cache', newIds);
        return true;
      } catch (e) {
        alert('保存退款处理人配置失败: ' + (e.message || e));
        return false;
      }
    };
    return () => {
      delete window.__canProcessRefund;
      delete window.__refundProcessors;
      delete window.__setRefundProcessors;
    };
  }, [refundProcessors, user, employees, cloudOn]);

  // ══════════════════════════════════════════════════════════════
  // 📨 fix9c: 跨部门协作消息 — 美工/客服/跟单 三系统共用消息总线
  // ══════════════════════════════════════════════════════════════
  const [cdmMessages, setCdmMessages] = useState([]);
  const [cdmLoading, setCdmLoading] = useState(false);
  const cdmLoadingRef = useRef(false);
  // 🆕 v22-CV/CW: 店铺-负责人映射 + 超时阈值配置 (三方共享)
  const [shopOwners, setShopOwners] = useState([]);
  const [cdmTimeoutConfig, setCdmTimeoutConfig] = useState({});

  const loadCdmMessages = async () => {
    if (cdmLoadingRef.current) return;  // 防止 realtime 风暴重复请求
    const client = getCdmClient();
    if (!client) return;
    cdmLoadingRef.current = true;
    setCdmLoading(true);
    try {
      // 拉最近 90 天 500 条
      const cutoffMs = Date.now() - 90 * 24 * 3600 * 1000;
      const { data, error } = await client
        .from('cross_dept_messages')
        .select('*')
        .gte('created_at_ms', cutoffMs)
        .order('created_at_ms', { ascending: false })
        .limit(500);
      if (error) throw error;
      setCdmMessages(data || []);
    } catch (e) { console.warn('[CDM] 加载消息失败', e); }
    cdmLoadingRef.current = false;
    setCdmLoading(false);
  };

  // 🆕 v22-CV/CW: 加载 shop_owners 和 cdm_timeout_config
  const loadShopOwners = async () => {
    const client = getCdmClient();
    if (!client) return;
    try {
      const { data, error } = await client
        .from('shop_owners')
        .select('*')
        .order('shop_name');
      if (error) throw error;
      setShopOwners((data || []).map(r => ({
        id: r.id,
        shopName: r.shop_name,
        system: r.system,
        userId: r.user_id,
        userName: r.user_name,
        role: r.role || 'primary',
        notes: r.notes || null,
        createdAtMs: r.created_at_ms,
      })));
    } catch (e) { console.warn('[CDM] 加载 shop_owners 失败', e); }
  };
  const loadCdmTimeoutConfig = async () => {
    const client = getCdmClient();
    if (!client) return;
    try {
      const { data, error } = await client
        .from('app_config')
        .select('value')
        .eq('key', 'cdm_timeout_config')
        .maybeSingle();
      if (error) throw error;
      setCdmTimeoutConfig(data?.value || {});
    } catch (e) { console.warn('[CDM] 加载 cdm_timeout_config 失败', e); }
  };

  useEffect(() => {
    if (!user) return;
    loadCdmMessages();
    loadShopOwners();
    loadCdmTimeoutConfig();
  }, [user?.id]);

  // 🆕 v22-CV/CW: shop_owners + app_config Realtime 订阅
  useEffect(() => {
    if (!user) return;
    const client = getCdmClient();
    if (!client) return;
    let channel;
    try {
      channel = client
        .channel('cdm_v22cw_cs_' + user.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_owners' }, () => {
          loadShopOwners();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, (payload) => {
          if (payload?.new?.key === 'cdm_timeout_config') {
            setCdmTimeoutConfig(payload.new.value || {});
          }
        })
        .subscribe();
    } catch (e) { console.warn('[CDM v22-CW] Realtime 订阅失败', e); }
    return () => { try { if (channel) client.removeChannel(channel); } catch {} };
  }, [user?.id]);

  // Realtime 订阅 — 新消息 / 回复 / 状态变化时自动重新拉取 + 桌面通知
  useEffect(() => {
    if (!user) return;
    const client = getCdmClient();
    if (!client) return;
    const channelName = 'cdm_realtime_cs_' + user.id;
    let channel;
    try {
      channel = client
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cross_dept_messages' }, (payload) => {
          loadCdmMessages();
          // 是新消息且发给客服部 → 桌面通知
          if (payload?.eventType === 'INSERT' && payload?.new?.to_system === 'cs' && payload?.new?.from_user_id !== user.id) {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try {
                const cat = findCdm(CDM_CATEGORIES, payload.new.category);
                new Notification(`📨 ${cat.label}`, {
                  body: payload.new.title + ' — ' + (payload.new.from_user_name || '?'),
                  tag: 'cdm-' + payload.new.id,
                });
              } catch {}
            }
          }
        })
        .subscribe();
    } catch (e) { console.warn('[CDM] Realtime 订阅失败', e); }
    return () => { try { if (channel) client.removeChannel(channel); } catch {} };
  }, [user?.id]);

  // 计算未读数(给顶部铃铛用) — 收件箱里 to_system=cs 且 user 不在 read_by 里
  const cdmUnreadCount = useMemo(() => {
    if (!user) return 0;
    return cdmMessages.filter(m =>
      m.to_system === 'cs' &&
      m.from_user_id !== user.id &&
      !(m.read_by || []).includes(user.id)
    ).length;
  }, [cdmMessages, user?.id]);

  const cdmUrgentUnread = useMemo(() => {
    if (!user) return 0;
    return cdmMessages.filter(m =>
      m.to_system === 'cs' &&
      m.priority === 'urgent' &&
      m.status !== 'done' && m.status !== 'cancelled' &&
      !(m.read_by || []).includes(user.id)
    ).length;
  }, [cdmMessages, user?.id]);

  // ══════════════════════════════════════════════════════════════
  // 🆕 fix10: 导航布局自定义 — IDE 风格(顶部常用 + 左侧不常用)
  // 每个用户独立保存,localStorage 键 nav_layout_${user.id}
  // ══════════════════════════════════════════════════════════════
  const DEFAULT_TOP_KEYS = ['cs', 'chargebacks', 'offline_orders', 'custom_photo', 'events', 'reviews'];

  const [layoutPrefs, setLayoutPrefs] = useState({ topKeys: DEFAULT_TOP_KEYS, sidebarOrder: [], sidebarCollapsed: false });
  // 登录或切换账号时重新加载该用户的布局
  useEffect(() => {
    if (!user) return;
    const saved = STORE.get(`nav_layout_${user.id}`, null);
    if (saved && Array.isArray(saved.topKeys)) {
      setLayoutPrefs({
        topKeys: saved.topKeys,
        sidebarOrder: Array.isArray(saved.sidebarOrder) ? saved.sidebarOrder : [],  // 🆕 fix28
        sidebarCollapsed: !!saved.sidebarCollapsed,
      });
    } else {
      setLayoutPrefs({ topKeys: DEFAULT_TOP_KEYS, sidebarOrder: [], sidebarCollapsed: false });
    }
  }, [user?.id]);
  // 保存
  useEffect(() => {
    if (!user) return;
    STORE.set(`nav_layout_${user.id}`, layoutPrefs);
  }, [layoutPrefs, user?.id]);

  const [customizeOpen, setCustomizeOpen] = useState(false);

  // 计算完整 tabs 列表 — 单一数据源,TopNav 和 Sidebar 都从这里拿
  // 🆕 fix11-hotfix1: stats 在函数体后面才定义 → 用 ?. 防御性访问,首渲染时 stats 是 undefined 不崩
  const allTabs = useMemo(() => {
    if (!user) return [];
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isFinanceVisible = user.role === 'finance' || isAdmin;
    const tabs = [
      // 主功能
      { key:'cs',             label:'📞 客服跟进',   icon:'📞', badge: stats?.overdue,           group:'main' },
      { key:'chargebacks',    label:'🚨 拒付',       icon:'🚨', badge: stats?.urgentChargebacks, badgeColor:'#dc2626', group:'main' },
      { key:'offline_orders', label:'💳 线下单',     icon:'💳',                                 group:'main' },
      { key:'custom_photo',   label:'🎨 定制&实拍',  icon:'🎨',                                 group:'main' },
      { key:'events',         label:'📋 工作主线',   icon:'📋', badge: stats?.pendingEvents,    group:'main' },
      { key:'reviews',        label:'⭐ 产品评价',   icon:'⭐', badge: stats?.pendingReviews,   group:'main' },
      // 资源工具
      { key:'suppliers',  label:'🏭 供应商',         icon:'🏭', group:'resources' },
      { key:'kb',         label:'📚 知识库',         icon:'📚', group:'resources' },
      { key:'quote',      label:'📝 报价单',         icon:'📝', group:'resources' },
      { key:'finance',    label:'🧮 财务计算器',     icon:'🧮', group:'resources' },
      { key:'help',       label:'📖 使用手册',       icon:'📖', group:'resources' },  // 🆕 fix13: 帮助中心
      { key:'feedback',   label:'🐛 反馈中心',       icon:'🐛', group:'resources' },  // 🆕 fix14: bug 反馈
      // 🆕 fix11-hotfix2: ai_reviews 不再作为独立 tab — 已合并进 ⭐ 产品评价 内部
      ...(isFinanceVisible ? [{ key:'freight', label:'🚚 运费支付', icon:'🚚', group:'resources' }] : []),
      // 协作
      { key:'tasks',      label:'📌 任务分派', icon:'📌', group:'collab' },  // 🆕 fix19
      { key:'cross_dept', label:'📨 跨部门协作', icon:'📨', badge: cdmUnreadCount, badgeColor: cdmUrgentUnread > 0 ? '#dc2626' : '#0071e3', group:'collab' },
      { key:'briefings',  label:'📢 会议纪要',   icon:'📢', group:'collab' },
      // 🆕 fix11-hotfix4: 汇报工单已被跨部门协作取代,从导航中移除 (代码保留以防需要回滚)
      // 管理
      ...(isAdmin ? [
        { key:'admin_overview',   label:'📊 主管汇总', icon:'📊', group:'admin' },
        { key:'dashboard',        label:'📈 数据看板', icon:'📈', group:'admin' },
        { key:'delete_approvals', label:'🛡 删除审批', icon:'🛡', badge: stats?.pendingDeleteReqs, badgeColor:'#dc2626', group:'admin' },
        { key:'trash',            label:'🗑 回收站',   icon:'🗑', badge: stats?.trashCount, badgeColor:'#86868b', group:'admin' },
        { key:'admin',            label:'⚙ 设置',     icon:'⚙', group:'admin' },
      ] : [
        { key:'dashboard', label:'📈 数据看板', icon:'📈', group:'admin' },
        { key:'trash',     label:'🗑 回收站',   icon:'🗑', badge: stats?.trashCount, badgeColor:'#86868b', group:'admin' },
      ]),
    ];
    return tabs;
  }, [user?.id, user?.role, stats, cdmUnreadCount, cdmUrgentUnread]);

  // 拆成顶部 vs 侧边栏
  const topTabs = useMemo(() => {
    if (!allTabs.length) return [];
    // 按 layoutPrefs.topKeys 的顺序排列
    return layoutPrefs.topKeys
      .map(k => allTabs.find(t => t.key === k))
      .filter(Boolean);
  }, [allTabs, layoutPrefs.topKeys]);

  const sidebarTabs = useMemo(() => {
    if (!allTabs.length) return [];
    const nonPinned = allTabs.filter(t => !layoutPrefs.topKeys.includes(t.key));
    // 🆕 fix28: 按用户自定义 sidebarOrder 排序;没在 order 里的项保持 allTabs 原顺序
    const order = layoutPrefs.sidebarOrder || [];
    if (order.length === 0) return nonPinned;
    const orderMap = new Map(order.map((k, i) => [k, i]));
    return [...nonPinned].sort((a, b) => {
      const ia = orderMap.has(a.key) ? orderMap.get(a.key) : 99999;
      const ib = orderMap.has(b.key) ? orderMap.get(b.key) : 99999;
      return ia - ib;
    });
  }, [allTabs, layoutPrefs.topKeys, layoutPrefs.sidebarOrder]);

  // 通知权限
  const [notifPerm, setNotifPerm] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const requestNotifPerm = () => {
    if (typeof Notification === 'undefined') { toast('⚠️ 当前浏览器不支持桌面通知'); return; }
    if (Notification.permission === 'denied') { toast('⚠️ 通知已被浏览器禁用，请在浏览器设置中开启'); return; }
    Notification.requestPermission().then(p => {
      setNotifPerm(p);
      if (p === 'granted') { sendDesktopNotification('统一工作台', '✅ 桌面通知已开启', 'workspace-test'); toast('✓ 桌面通知已开启'); }
      else toast('已取消授权');
    });
  };

  // 登录
  const onLogin = (emp) => {
    setUser(emp);
    STORE.set('current_user', { id: emp.id });
    toast(`✓ 欢迎回来, ${emp.name}`);
    // 登录后若用户尚未做选择，温和地引导一次（不强弹，由用户主动点）
  };

  // 🆕 fix45: 登录后注册"返回拦截器",防止误触浏览器返回退出工作台
  useEffect(() => {
    if (!user) return;
    // 登录后,history 加一个标记 entry,这样按返回会触发我们的 popstate handler
    if (!window.history.state || !window.history.state._wsGuard) {
      window.history.pushState({ _wsGuard: true }, '', window.location.href);
    }
    const onPop = (e) => {
      // 弹原生 confirm:留在工作台 OR 真的离开
      const stay = !confirm('确定要离开工作台?\n\n(账号仍是登录状态,下次打开会自动恢复)');
      if (stay) {
        // 用户选"取消" → 再 push 一个 entry 回来,留在原页
        window.history.pushState({ _wsGuard: true }, '', window.location.href);
      }
      // 用户选"确定" → 不阻止,浏览器继续导航走
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [user]);

  const onLogout = () => {
    if (!confirm('确认退出登录？')) return;
    setUser(null);
    STORE.del('current_user');
    STORE.del('impersonate_origin');  // 清除模拟身份
  };

  // 🆕 切换账号 - 主管/老板免密查看模式
  const switchAccount = (targetEmployee) => {
    const isAdminViewer = user && (user.role === 'admin' || user.role === 'super_admin');
    // 主管/老板:无需密码,以查看模式切换
    if (isAdminViewer && targetEmployee.id !== user.id) {
      const ok = confirm(
        `👁 以 ${targetEmployee.name}${targetEmployee.alias ? ' ' + targetEmployee.alias : ''} 的身份查看\n\n` +
        `这是查看模式 — 你可以看到该员工的所有数据,顶部会显示明显标识,随时可一键切回。\n\n` +
        `继续吗?`
      );
      if (!ok) return;
      // 记录原始身份(切回用)
      const origin = STORE.get('impersonate_origin', null);
      if (!origin) {
        STORE.set('impersonate_origin', { id: user.id, name: user.name, alias: user.alias, role: user.role });
      }
      const newUser = { ...targetEmployee, _impersonating: true };
      setUser(newUser);
      STORE.set('current_user', newUser);
      toast(`👁 已切换到 ${newUser.name} 视角 · 顶部可一键切回`);
      return;
    }
    // 普通员工切换:需要密码
    const password = prompt(`切换到 ${targetEmployee.name}${targetEmployee.alias ? ' ' + targetEmployee.alias : ''} 的账号\n\n请输入该账号的密码：`);
    if (password === null) return;
    if (!password) { alert('密码不能为空'); return; }
    if (password !== targetEmployee.password) {
      alert('❌ 密码错误');
      return;
    }
    const newUser = { ...targetEmployee };
    setUser(newUser);
    STORE.set('current_user', newUser);
    STORE.del('impersonate_origin');
    toast(`✓ 已切换到 ${newUser.name}${newUser.alias ? ' ' + newUser.alias : ''}`);
  };
  
  // 🆕 切回原始身份
  const restoreOriginalUser = () => {
    const origin = STORE.get('impersonate_origin', null);
    if (!origin) return;
    const original = INITIAL_EMPLOYEES.find(e => e.id === origin.id) || employees.find(e => e.id === origin.id);
    if (!original) {
      alert('原账号找不到了,请重新登录');
      return;
    }
    setUser(original);
    STORE.set('current_user', original);
    STORE.del('impersonate_origin');
    toast(`✓ 已切回 ${original.name}${original.alias ? ' ' + original.alias : ''}`);
  };

  // 统计 badge
  const today = todayISO();
  const stats = useMemo(() => {
    if (!user) return { overdue:0, dueToday:0, trashCount:0, ticketInbox:0, pendingEvents:0, pendingReviews:0, urgentChargebacks:0, pendingDeleteReqs:0 };
    const live = records.filter(r => !r.deleted);
    const mine = (user.role === 'admin' || user.role === 'super_admin') ? live : live.filter(r => r.ownerId === user.id);
    const overdue = mine.filter(r => r.status !== 'resolved' && r.nextFollowUp && r.nextFollowUp < today).length;
    const dueToday = mine.filter(r => r.status !== 'resolved' && r.nextFollowUp === today).length;
    const trash = (user.role === 'admin' || user.role === 'super_admin')
      ? records.filter(r => r.deleted && isRecordMeaningful(r)).length
      : records.filter(r => r.deleted && (r.deletedBy === user.id || r.ownerId === user.id) && isRecordMeaningful(r)).length;
    // 工单收件箱（本地缓存计数，准确数字在 ReportModule 内）
    const tickets = STORE.get('tickets_local', []);
    const ticketInbox = tickets.filter(t => (t.target_id === user.id) && (t.status === 'pending' || t.status === 'accepted')).length;
    // 🆕 待处理事件徽章 (财务/admin 看待审退款，其他人看自己创建的所有未关闭事件)
    const isFinance = user.role === 'finance' || user.role === 'admin' || user.role === 'super_admin';
    const evCache = STORE.get('events_cache', { aftersales:[], refunds:[], refills:[] });
    let pendingEvents = 0;
    if (isFinance) {
      pendingEvents = (evCache.refunds || []).filter(r => r.status === 'pending').length;
    }
    // 🆕 我的待领取 + 指派给我的评价任务
    const reviewsCache = STORE.get('reviews_cache', []);
    const pendingReviews = reviewsCache.filter(r => 
      !r.deleted && r.status !== 'completed' && r.status !== 'cancelled' && (
        r.assigned_to === user.id || r.claimed_by === user.id
      )
    ).length;
    // 🆕 紧急拒付计数 (7 天内即将到期 + 已逾期)
    const cbCache = STORE.get('chargebacks_cache', []);
    const urgentChargebacks = cbCache.filter(c => {
      if (c.deleted) return false;
      if (c.status === 'won' || c.status === 'lost' || c.status === 'closed') return false;
      if (!c.deadline) return false;
      const d = daysUntil(c.deadline);
      return d !== null && d <= 7;
    }).length;
    // 🆕 待审批删除请求数 (主管 = approver_role='admin' 的; 老板 = 全部 pending)
    const drCache = STORE.get('delete_requests_cache', []);
    const isSuperAdmin = user.role === 'super_admin';
    const isAdminRole = user.role === 'admin' || user.role === 'super_admin';
    let pendingDeleteReqs = 0;
    if (isAdminRole) {
      pendingDeleteReqs = drCache.filter(r => 
        r.status === 'pending' && (isSuperAdmin || r.approver_role === 'admin')
      ).length;
    }
    return { overdue, dueToday, trashCount: trash, ticketInbox, pendingEvents, pendingReviews, urgentChargebacks, pendingDeleteReqs };
  }, [records, user, today]);

  // 🆕 主管/老板:后台轮询删除审批数据(每 2 分钟,更新徽章)
  useEffect(() => {
    if (!user) return;
    const isAdminRole = user.role === 'admin' || user.role === 'super_admin';
    if (!isAdminRole) return;
    const fetchDR = async () => {
      try {
        const data = await CLOUD.list('delete_requests', { order:{col:'requested_at', asc:false}, limit:200 });
        STORE.set('delete_requests_cache', data || []);
      } catch {}
    };
    fetchDR();
    const t = setInterval(fetchDR, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [user]);
  
  // 🆕 全局禁用浏览器自动填充 - 除登录页外所有 input 都不允许 Chrome 自动填(账号密码/历史邮箱)
  useEffect(() => {
    if (!user) return;  // 未登录时(LoginScreen)不处理,允许浏览器记住账号密码
    
    const disableAutofill = () => {
      // input / textarea / select 都处理
      document.querySelectorAll('input, textarea').forEach(el => {
        // 跳过显式标注允许自动填充的(data-keep-autofill 属性)
        if (el.dataset.keepAutofill !== undefined) return;
        // 跳过 LoginScreen 内的(以防万一)
        if (el.closest('[data-login-screen]')) return;
        // 设置为 new-password(Chrome 唯一会严格遵守的禁填值)
        if (el.getAttribute('autocomplete') !== 'new-password') {
          el.setAttribute('autocomplete', 'new-password');
        }
        // 还可加 spell-check 关闭
        if (!el.hasAttribute('spellcheck')) {
          el.setAttribute('spellcheck', 'false');
        }
        // 防止 Edge / 1Password 等密码管理器加图标
        if (!el.dataset.lpignore) {
          el.setAttribute('data-lpignore', 'true');
          el.setAttribute('data-1p-ignore', 'true');
        }
      });
    };
    
    disableAutofill();
    
    // 监听 DOM 变化(新增的 input 也处理)
    const observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
      if (hasNewNodes) disableAutofill();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => observer.disconnect();
  }, [user]);
  
  // 标题栏徽章: (N) 统一工作台
  useEffect(() => {
    const n = stats.overdue + stats.dueToday;
    document.title = (n > 0 ? `(${n}) ` : '') + '统一工作台';
  }, [stats.overdue, stats.dueToday]);

  // 桌面通知 - 定时检查
  useEffect(() => {
    if (!user) return;
    if (notifPerm !== 'granted') return;

    // 会话内已通知 ID（sessionStorage 保证刷新后重发）
    const notifiedKey = 'workspace_notified_ids';
    const getNotified = () => {
      try { return new Set(JSON.parse(sessionStorage.getItem(notifiedKey) || '[]')); }
      catch(e) { return new Set(); }
    };
    const saveNotified = (set) => {
      try { sessionStorage.setItem(notifiedKey, JSON.stringify([...set])); } catch(e) {}
    };

    const check = () => {
      const today = todayISO();
      const notified = getNotified();
      const live = records.filter(r => !r.deleted);
      const mine = (user.role === 'admin' || user.role === 'super_admin') ? live : live.filter(r => r.ownerId === user.id);

      // 逾期
      const overdue = mine.filter(r => r.status !== 'resolved' && r.nextFollowUp && r.nextFollowUp < today && !notified.has('over_' + r.id));
      // 今日到期
      const dueToday = mine.filter(r => r.status !== 'resolved' && r.nextFollowUp === today && !notified.has('today_' + r.id));

      if (overdue.length > 0) {
        const r = overdue[0];
        const more = overdue.length > 1 ? `（另有 ${overdue.length - 1} 单未跟进）` : '';
        sendDesktopNotification(
          `⏰ 跟进已逾期：${r.customer || '未填客户'}`,
          `事项：${r.category || '—'}｜原定 ${r.nextFollowUp} 跟进${more}`,
          'overdue_' + r.id
        );
        overdue.forEach(o => notified.add('over_' + o.id));
      } else if (dueToday.length > 0) {
        const r = dueToday[0];
        const more = dueToday.length > 1 ? `（今日另有 ${dueToday.length - 1} 单）` : '';
        sendDesktopNotification(
          `📌 今日跟进提醒：${r.customer || '未填客户'}`,
          `事项：${r.category || '—'}｜请尽早跟进${more}`,
          'today_' + r.id
        );
        dueToday.forEach(o => notified.add('today_' + o.id));
      }
      
      // 🆕 主管/老板专属:超 7 天未解决的预警(每日只通知一次)
      const isAdminRole = (user.role === 'admin' || user.role === 'super_admin');
      if (isAdminRole) {
        const cutoff7d = addDays(today, -7);
        const stale = live.filter(r => 
          r.status !== 'resolved' && 
          r.status !== 'transferred' &&
          r.date && r.date < cutoff7d &&
          isRecordMeaningful(r)
        );
        const dailyKey = 'stale_warn_' + today;
        if (stale.length > 0 && !notified.has(dailyKey)) {
          const ownerCount = new Set(stale.map(r => r.ownerId)).size;
          sendDesktopNotification(
            `⚠️ 超 7 天未解决:${stale.length} 条`,
            `涉及 ${ownerCount} 位员工 · 点击工作台查看`,
            'stale_' + today
          );
          notified.add(dailyKey);
        }
      }
      saveNotified(notified);
    };

    // 启动后 3 秒检查一次（避免登录瞬间打扰），之后每 5 分钟检查
    const t1 = setTimeout(check, 3000);
    const t2 = setInterval(check, 5 * 60 * 1000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [user, records, notifPerm]);

  // 🔍 全局智能搜索（必须在条件 return 之前定义,符合 React Rules of Hooks）
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+K / Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      // 斜杠快捷键（如果焦点不在输入框）
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (!user) {
    return <LoginScreen employees={employees} onLogin={onLogin} />;
  }
  
  return (
    <SitesContext.Provider value={sitesContextValue}>
    <ProductsContext.Provider value={productsContextValue}>
    <div className="min-h-screen">
      <TopNav user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} stats={stats} notifPerm={notifPerm} requestNotifPerm={requestNotifPerm} cloudOn={cloudOn} employees={employees} switchAccount={switchAccount} onOpenSearch={() => setSearchOpen(true)} cdmUnreadCount={cdmUnreadCount} cdmUrgentUnread={cdmUrgentUnread} topTabs={topTabs} sidebarHiddenCount={sidebarTabs.length} onOpenCustomize={() => setCustomizeOpen(true)} />
      
      {/* 🆕 模拟身份横幅 - 主管/老板以其他人身份查看时的提醒 */}
      {(() => {
        const origin = STORE.get('impersonate_origin', null);
        if (!origin || !user) return null;
        return (
          <div style={{
            background:'linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)',
            borderBottom:'2px solid #f59e0b',
            padding:'10px 20px',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            gap:14,
            flexWrap:'wrap',
            fontSize:13,
            position:'sticky',
            top:0,
            zIndex:50,
            boxShadow:'0 2px 8px rgba(245,158,11,.2)',
          }}>
            <span style={{fontSize:18}}>👁</span>
            <span style={{color:'#78350f'}}>
              <strong>正在以 {user.name}{user.alias ? ' ' + user.alias : ''} 的身份查看</strong>
              <span style={{marginLeft:6, color:'#92400e'}}>· 你的真实身份是 <strong>{origin.name}{origin.alias ? ' ' + origin.alias : ''}</strong></span>
            </span>
            <button onClick={restoreOriginalUser}
              style={{
                padding:'6px 14px', background:'#f59e0b', color:'white', border:'none',
                borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:12,
              }}>
              ← 切回 {origin.name}
            </button>
          </div>
        );
      })()}
      
      {/* 🔍 全局搜索 */}
      <GlobalSearch 
        open={searchOpen} 
        onClose={() => setSearchOpen(false)}
        user={user}
        employees={employees}
        records={records}
        setActiveTab={setActiveTab}
        onJumpToRecord={null}  // 暂时不实现跳转到具体行
      />
      
      {/* 🆕 云同步状态横幅 - 失败时大红警告 */}
      {cloudOn === false && (
        <div style={{background:'#fef2f2', borderBottom:'1.5px solid #ef4444', padding:'10px 20px', textAlign:'center', fontSize:13, color:'#991b1b'}}>
          ⚠ <strong>云同步未连接</strong> · 你的数据只存在本地浏览器，换浏览器/电脑会看不到 · 
          <button onClick={() => setCloudVersion(v => v + 1)} style={{marginLeft:8, padding:'3px 10px', background:'#dc2626', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontSize:12}}>
            🔄 重试连接
          </button>
        </div>
      )}
      {cloudOn && cloudSyncError && (
        <div style={{background:'#fef3c7', borderBottom:'1.5px solid #f59e0b', padding:'10px 20px', textAlign:'center', fontSize:13, color:'#854d0e'}}>
          ⚠ <strong>云端写入失败</strong>：{cloudSyncError.slice(0, 100)} · 数据可能未同步到云端 · 
          <button onClick={async () => {
            try {
              await uploadRecordsWithRetry(records);
              setCloudSyncError(null);
              const skipped = skipFieldsRef.current.size;
              if (skipped > 0) {
                toast(`✓ 已上传 ${records.length} 条（自动剥离了 ${skipped} 个云端缺失字段）`);
              } else {
                toast(`✓ 已成功上传 ${records.length} 条记录到云端`);
              }
            } catch(e) {
              setCloudSyncError(e.message);
              alert('❌ 上传失败：' + e.message);
            }
          }} style={{marginLeft:8, padding:'3px 10px', background:'#d97706', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit', fontSize:12}}>
            🔄 强制上传 ({records.length} 条)
          </button>
        </div>
      )}
      {/* 🆕 fix10: 主区 = 左侧栏 + 右侧内容(IDE 风格) */}
      <div style={{display:'flex', alignItems:'flex-start', minHeight:'calc(100vh - 56px)'}}>
        <NavSidebar
          tabs={sidebarTabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={layoutPrefs.sidebarCollapsed}
          onToggleCollapse={() => setLayoutPrefs(p => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed }))}
          onOpenCustomize={() => setCustomizeOpen(true)}
        />
        <div style={{flex:1, minWidth:0}}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {user && cloudOn && activeTab !== 'chargebacks' && (
          <ChargebackReminderBanner user={user} employees={employees} onJumpTo={() => setActiveTab('chargebacks')} />
        )}
        {activeTab === 'cs' && (
          <>
            <WorkSnapshotPanel user={user} employees={employees} records={records} 
              onJumpTo={(tab, params) => {
                setActiveTab(tab);
                if (params?.section) {
                  // 让 AdminModule 接收 section 参数(需要后续支持)
                  STORE.set('admin_section_hint', params.section);
                }
              }} />
            <CSModule user={user} employees={employees} records={records} setRecords={setRecords} toast={toast} cloudOn={cloudOn} />
          </>
        )}
        {activeTab === 'chargebacks' && (
          <ChargebacksModule user={user} employees={employees} toast={toast} />
        )}
        {activeTab === 'offline_orders' && (
          <OfflineOrdersModule user={user} employees={employees} toast={toast} />
        )}
        {activeTab === 'custom_photo' && (
          <CustomPhotoModule user={user} employees={employees} toast={toast} />
        )}
        {activeTab === 'briefings' && (
          <BriefingsModule user={user} employees={employees} toast={toast} cloudOn={cloudOn} />
        )}
        {activeTab === 'cross_dept' && (
          <CrossDeptModule user={user} employees={employees} messages={cdmMessages} loading={cdmLoading} onReload={loadCdmMessages} toast={toast}
            shopOwners={shopOwners} cdmTimeoutConfig={cdmTimeoutConfig} />
        )}
        {activeTab === 'events' && (
          <EventsModule user={user} employees={employees} records={records} toast={toast} cloudOn={cloudOn} />
        )}
        {activeTab === 'reviews' && (
          <ReviewsModule user={user} employees={employees} toast={toast} />
        )}
        {activeTab === 'suppliers' && (
          <SuppliersManagement toast={toast} user={user} />
        )}
        {/* iframe 类模块用 display 切换，避免切 tab 时丢失填写的数据 */}
        {visitedTabs.has('finance') && (
          <div style={{display: activeTab === 'finance' ? 'block' : 'none'}}>
            <FinanceModule user={user} toast={toast} />
          </div>
        )}
        {visitedTabs.has('quote') && (
          <div style={{display: activeTab === 'quote' ? 'block' : 'none'}}>
            <QuoteModule user={user} employees={employees} toast={toast} cloudOn={cloudOn} />
          </div>
        )}
        {visitedTabs.has('kb') && (
          <div style={{display: activeTab === 'kb' ? 'block' : 'none'}}>
            <KbModule user={user} toast={toast} cloudOn={cloudOn} />
          </div>
        )}
        {/* 🆕 fix11-hotfix2: AI 评价生成已并入 ⭐ 产品评价 内部 — 不再作为独立 tab */}
        {activeTab === 'freight' && (
          <FreightModule user={user} toast={toast} cloudOn={cloudOn} />
        )}
        {/* 🆕 fix13: 帮助中心 */}
        {activeTab === 'help' && (
          <HelpCenterModule user={user} />
        )}
        {/* 🆕 fix19: 任务分派 */}
        {activeTab === 'tasks' && (
          <TasksModule user={user} employees={employees} toast={toast} />
        )}
        {/* 🆕 fix14: bug 反馈中心 */}
        {activeTab === 'feedback' && (
          <BugReportsModule user={user} employees={employees} toast={toast} />
        )}
        {activeTab === 'report' && (
          <ReportModule user={user} employees={employees} toast={toast} cloudOn={cloudOn} />
        )}
        {activeTab === 'dashboard' && (
          <DashboardModule user={user} employees={employees} records={records} />
        )}
        {activeTab === 'admin_overview' && (user.role === 'admin' || user.role === 'super_admin') && (
          <>
            <WorkSnapshotPanel user={user} employees={employees} records={records}
              onJumpTo={(tab) => setActiveTab(tab)} />
            <AdminOverviewDashboard user={user} employees={employees} toast={toast} />
          </>
        )}
        {activeTab === 'delete_approvals' && (user.role === 'admin' || user.role === 'super_admin') && (
          <DeleteApprovalCenter user={user} toast={toast} />
        )}
        {activeTab === 'trash' && (
          <TrashModule user={user} employees={employees} records={records} setRecords={setRecords} toast={toast} />
        )}
        {activeTab === 'admin' && (user.role === 'admin' || user.role === 'super_admin') && (
          <AdminModule user={user} employees={employees} setEmployees={setEmployees} toast={toast} cloudCfg={cloudCfg} setCloudCfg={setCloudCfg} onCloudApply={() => setCloudVersion(v=>v+1)} />
        )}
          </div>{/* /max-w-7xl */}
        </div>{/* /flex-1 content wrapper */}
      </div>{/* /flex with sidebar */}
      <footer style={{textAlign:'center', padding:'40px 20px', color:'var(--ink-4)', fontSize:12, fontWeight:400}}>
        统一工作台 · v2.1 · {cloudOn ? '☁ Supabase 云端协同' : '💾 本地模式'}
      </footer>
      {/* 🆕 fix10: 自定义布局 modal */}
      {customizeOpen && (
        <LayoutCustomizeModal
          allTabs={allTabs}
          layoutPrefs={layoutPrefs}
          defaultTopKeys={DEFAULT_TOP_KEYS}
          onSave={({ topKeys: newTopKeys, sidebarOrder: newSidebarOrder }) => setLayoutPrefs(p => ({ ...p, topKeys: newTopKeys, sidebarOrder: newSidebarOrder || [] }))}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
      {toastNode}
    </div>
    </ProductsContext.Provider>
    </SitesContext.Provider>
  );
};

// 📦 版本日志 - 用户用来确认加载的是哪个版本
const APP_VERSION = '2026.05.26-fix32';

// ════════════════════════════════════════════════════════════════════
// 📦 版本历史 (数据驱动 · 用于帮助中心展示)
// 添加新版本只需在数组开头加一项即可
// 字段: version 版本号 / date 日期 / title 一句话概要 / changes 详细改动列表
// type: 'feature' 新功能 / 'fix' 修复 / 'refactor' 重构 / 'perf' 性能 / 'data' 数据
// ════════════════════════════════════════════════════════════════════
const VERSION_HISTORY = [
  { version: '2026.05.26-fix32', date: '2026.05.26', title: '🚀 速度大优化 — 预编译版,启动速度提升 5-10 倍', changes: [
    { type:'perf', text:'整个工作台从"浏览器跑 Babel 实时转译 8 秒"改成"预编译后直接执行" — 首屏从 ~10s 降到 ~1.5s' },
    { type:'perf', text:'不再下载 Babel CDN (节省 3 MB 流量) + 不占用 CPU 编译时间' },
    { type:'perf', text:'切 tab 流畅度提升:AI 评价、知识库等模块点击响应明显变快' },
    { type:'feature', text:'部署方式简化:从 11 个 .js 文件 → 1 个 app.compiled.js + index.html (2 个文件)' },
  ]},
  { version: '2026.05.25-fix31', date: '2026.05.25', title: '📝 报价单 — iframe 内部恢复滚动条 + 📚 KB 升级主管默认到 Miya', changes: [
    { type:'fix', text:'报价单 iframe 删除 scrolling="no" — 之前 fix29 让 iframe 不再撑大,但同时禁用了内部滚动,导致用户看不到下面的 PDF 预览' },
    { type:'fix', text:'现在 iframe 锁定 viewport 高度 + 内部自己有滚动条 (跟 KB iframe 一样的设置) → 用户可以滚 iframe 看预览' },
    { type:'feature', text:'KB(独立 kb.html):升级主管按钮点击后,自动创建跨部门消息,默认派给 Miya(u_miya)' },
  ]},
  { version: '2026.05.25-fix30', date: '2026.05.25', title: '📢 会议纪要 — 期号改成"2026年6月份 第一周" + 快速切上下周', changes: [
    { type:'feature', text:'期号格式:从 "2026 第 22 周" → "2026年6月份 第二周" — 用自然月分周 (1-7/8-14/15-21/22-28/29-end),跟数据筛选模块一致' },
    { type:'feature', text:'新增 3 个快捷按钮:← 上周 / 本周(高亮) / 下周 →,一键切换' },
    { type:'feature', text:'新增日期选择器:点 📅 → 选任意日期 → 自动生成对应期号,适合写历史/未来纪要' },
    { type:'feature', text:'输入框仍允许手动改 — 如果客户的期号惯例不一样可以自定义' },
  ]},
  { version: '2026.05.25-fix29', date: '2026.05.25', title: '📝 报价单 — 修复"无限下滑"(应用 KB 的 fix8 方案)', changes: [
    { type:'fix', text:'报价单 iframe 不再撑大 — 跟知识库 fix8 同样的处理,iframe 保持 calc(100vh - 100px),自己有滚动条' },
    { type:'fix', text:'根因:之前 iframe 撑到内容高度(~3000px),workspace 主页面也变巨高 → "无限下滑"' },
    { type:'fix', text:'副效:position:fixed 的 modal(❓ 使用手册)不再锚到 iframe 顶部,而是锁在 iframe viewport — 点 ❓ 就在你眼前出现' },
    { type:'fix', text:'移除 iframe-modal-open 的 scrollIntoView 旧逻辑 (这是真正触发"页面平滑滑动到顶"的元凶)' },
  ]},
  { version: '2026.05.25-fix28', date: '2026.05.25', title: '⚙ 侧栏自定义 — 其他功能也支持手动 ↑↓ 排序', changes: [
    { type:'feature', text:'侧栏自定义弹窗:下方"其他功能"区每个 tab 项加 ↑↓ 按钮,可手动调整组内顺序' },
    { type:'feature', text:'排序规则:在 同组内 (主功能 / 资源工具 / 协作 / 管理) 上下交换,不跨组' },
    { type:'feature', text:'用户自定义顺序保存在 layoutPrefs.sidebarOrder · 每个员工独立,不影响他人' },
    { type:'fix', text:'重置按钮:同时清掉 topKeys + sidebarOrder,恢复完全默认' },
  ]},
  { version: '2026.05.25-fix23', date: '2026.05.25', title: '🌐 店铺负责人 — 新角色 + 矩阵批量添加 + 智能派单', changes: [
    { type:'feature', text:'CDM_OWNER_ROLES 新增 2 个客服角色:🌙 夜班(晚 6 点后美区询盘)/ 🚨 升级处理(投诉退款纠纷)' },
    { type:'feature', text:'店铺负责人维护新增"🔢 矩阵批量"模式:N 网站 × M 员工 × 1 角色 → 一键添加 N×M 条记录' },
    { type:'feature', text:'批量模式自动去重:(shop, user, role) 已存在的跳过,只插入新组合 · 提示"添加 X 条 · 跳过 Y 条重复"' },
    { type:'feature', text:'批量模式支持自定义网站(临时添加非预设网站)' },
    { type:'feature', text:'跨部门消息自动派单 fallback 升级:primary → night → escalation → backup → manager → 第一个 · 更适合客服业务' },
    { type:'feature', text:'角色按钮带 tooltip 说明:每个角色 hover 显示职责' },
  ]},
  { version: '2026.05.25-fix22', date: '2026.05.25', title: '🔗 三大联动 — SKU 联想 + 售后自动统计 + 网站全局生效', changes: [
    { type:'feature', text:'🔗 联动 1: 线下单产品行 / 售后产品名 / 退款产品名 输入时自动联想产品主表 — 显示缩略图/SKU/供应商/默认价/历史售后次数' },
    { type:'feature', text:'选中产品自动填:SKU + 产品名 + 缩略图 + 默认单价(单价为空时)+ 关联 product_id 字段' },
    { type:'feature', text:'联想支持 ↑↓ 选择 / Enter 确认 / Esc 关闭 · 实时模糊匹配 SKU 和产品名' },
    { type:'feature', text:'🔗 联动 2: 新建售后事件时,自动给产品主表的 total_aftersales 计数 +1 — 哪款产品问题多自动统计' },
    { type:'feature', text:'按 product_name 精确匹配 +(若填了)product_sku 匹配 · 失败静默不阻塞保存' },
    { type:'feature', text:'🔗 联动 3: 自定义网站(⚙ 设置 → 🌐 网站 添加的)自动加进所有网站下拉 — 筛选/录入/编辑全场景' },
    { type:'feature', text:'共改造 10 处 SITES.map → allSites.map,涉及 7 个模块 · Realtime 监听自定义网站变更立即生效' },
    { type:'refactor', text:'新增 React Context:SitesContext + ProductsContext · App 启动时加载并通过 Provider 分发 · 各模块用 useSiteCodes() / useProducts() Hook 消费' },
  ]},
  { version: '2026.05.25-fix21', date: '2026.05.25', title: '⚙ 统一设置中心 — 网站 + 产品 + 人员 一处维护', changes: [
    { type:'feature', text:'⚙ 设置 重新分组:基础维护(人员/网站/产品/供应商)/ 业务规则 / 系统 — 视觉分隔更清晰' },
    { type:'feature', text:'🌐 网站维护:11 个内置网站可见 + 主管可添加自定义站点(代码/名称/品牌/域名/订单前缀/主题色)' },
    { type:'feature', text:'📦 产品维护:全新产品主表 — SKU/名称/分类/供应商/默认价/产品图/URL/标签/描述/备注' },
    { type:'feature', text:'产品图支持点击/粘贴/拖拽上传,自动压缩 · 售后次数高亮(≥5 红 / 1-4 黄)' },
    { type:'data',  text:'新增 Supabase 表 products + Realtime · 自定义网站复用 system_settings 表' },
  ]},
  { version: '2026.05.25-fix20', date: '2026.05.25', title: '📦 模块化重构 — 1.32MB 单文件拆成 11 个 JS 模块', changes: [
    { type:'refactor', text:'workspace.html 从 23k 行单文件拆成 21KB 壳 + 11 个独立 JS 文件,加载更快,维护更清晰' },
    { type:'refactor', text:'按功能归类:核心工具 / 客服跟进 / 看板回收站 / 设置财务 / 报价会议 / 拒付线下单 / 实拍评价 / 工作主线 / 知识库跨部门 / 任务反馈 / 帮助主入口' },
    { type:'perf', text:'拆 11 文件按需缓存,改一个模块只刷该文件,CDN 命中率更高' },
  ]},
  { version: '2026.05.25-fix19', date: '2026.05.25', title: '📌 任务分派 — 临时工作派给同事,主管全局可见', changes: [
    { type:'feature', text:'新增 📌 任务分派 tab (协作组),临时性工作派给某个人,主管随时看进度' },
    { type:'feature', text:'4 个 tab:📥 我的待办 / 📤 我派的 / ⚠ 已超期 / 🌐 全部任务 (主管)' },
    { type:'feature', text:'6 个状态:⏳ 待处理 / 🔧 处理中 / ⛔ 卡住 / ✅ 已完成 / ❌ 已取消 + 加 ⚠ 超期标识' },
    { type:'feature', text:'4 级优先级:🚨 紧急 / ⚡ 重要 / · 普通 / · 低 (按优先级 + 截止日 + 卡住状态排序)' },
    { type:'feature', text:'快速操作按钮:卡片上直接 ▶ 接手 / ✓ 完成 / ⛔ 卡住,不用进详情' },
    { type:'feature', text:'详情区:任务说明 / 时间线(派发→接手→完成)/ 状态切换 / 对话区 / 编辑 / 删除' },
    { type:'feature', text:'实时推送:派给你时浏览器通知 + Toast · 任务有变化主管实时刷新' },
    { type:'feature', text:'统计卡:待处理 / 处理中 / 卡住 / 已超期 / 已完成 / 总任务 — 一眼看全' },
    { type:'feature', text:'紧急任务横幅:你有 N 个紧急任务待办时头部红色提醒,带脉动动画' },
    { type:'feature', text:'承接人改派:创建人/主管可在详情里编辑承接人 + 截止日 + 优先级' },
    { type:'feature', text:'支持 AdvancedDateFilter(本周/本月/任意月第N周) + 状态/优先级/承接人/全文搜索' },
    { type:'data',  text:'新增 Supabase 表 tasks + Realtime 订阅' },
  ]},
  { version: '2026.05.25-fix18', date: '2026.05.25', title: '🎯 4 大痛点一次性处理 — 转单/产品图/邮件分布/侧边栏自动排序', changes: [
    { type:'feature', text:'📤 转给跟单 — 线下单"已付款"状态自动出现按钮,一键创建跨部门工单到跟单部' },
    { type:'feature', text:'转单时自动附带:订单号 / 客户 / 收货 / 产品清单 / 付款凭证 / 下单指令 · 跟单方 Realtime 推送' },
    { type:'feature', text:'根据 order.site 自动从店铺-负责人映射推荐跟单同事 · 支持紧急程度 + 备注' },
    { type:'feature', text:'订单卡显示"✓ 已转 [跟单姓名]"标签,避免重复转单' },
    { type:'feature', text:'🖼️ 产品图片粘贴 — 线下单产品清单每行多了 48×48 缩略图位' },
    { type:'feature', text:'图片支持:点击上传 / 聚焦后 Ctrl+V 粘贴 / 拖拽 / 自动压缩到 600px(0.8 JPEG)/ 点击放大' },
    { type:'feature', text:'转单时跟单方看到的消息里含产品图,一眼就懂是什么产品' },
    { type:'feature', text:'📊 数据看板新增"员工×日期×网站"热力图 — 颜色深浅=邮件量,每格悬停看网站分布' },
    { type:'feature', text:'支持近 7 天 / 本月切换 · 旁边附"负责网站"前 4 大标签 · 默认显示前 8 人,可展开全部' },
    { type:'feature', text:'⭐ 侧边栏自动按使用频率排序 — 你常点的功能自动上浮,顶部 chip 可关闭' },
    { type:'feature', text:'点击次数本地保存(localStorage),按用户独立 · 默认开启' },
  ]},
  { version: '2026.05.25-fix17', date: '2026.05.25', title: '🏆 产品售后 TOP + 反馈 KPI 绩效分', changes: [
    { type:'feature', text:'月度汇总新增 🛍️ 产品问题排行 TOP 20 — 按 售后+补件+退款 总次数排序,知道哪款产品问题最多' },
    { type:'feature', text:'产品级排行附带:涉及供应商列表 + 退款金额(美元),一眼看出问题源头' },
    { type:'feature', text:'反馈中心新增 📊 KPI 视图(主管/admin 专属)— 按提交人 × 月份汇总,直接看绩效分' },
    { type:'feature', text:'KPI 表显示:总提交 / Bug / 功能 / 改进 / 疑问 / 紧急 / 已修复 / 处理中 / 拒绝 / 🏆 绩效分' },
    { type:'feature', text:'绩效计分公式:bug=3 / 功能=2 / 改进=2 / 疑问=1 · 已修复 ×1.5 · 拒绝/重复 ×0.3 · 紧急 ×1.2 · 重要 ×1.1' },
    { type:'feature', text:'KPI 视图复用 AdvancedDateFilter,支持本月 / 上月 / 任意月份精确统计' },
  ]},
  { version: '2026.05.25-fix16', date: '2026.05.25', title: '🪄 线下单智能地址识别 — 粘贴整段地址自动填字段', changes: [
    { type:'feature', text:'线下单 "📍 收货信息" 区顶部新增智能粘贴板:粘贴整段地址,自动识别 7 个字段(姓名/电话/街道/城市/州/邮编/国家)' },
    { type:'feature', text:'支持美国(City, ST ZIP) / 加拿大(City, ON M5V 3A8) / 英国(SW1A 2AA) / 欧洲(10115 Berlin) / 澳洲(Melbourne VIC 3000) / 拉脱维亚(LV-2015) 等主流格式' },
    { type:'feature', text:'国家识别支持 50+ 国家名 + 简写(USA/US/UK/AU/DE/FR ...)' },
    { type:'feature', text:'自动跳过标签前缀(Name: / Phone: / Address: / 姓名: / 地址: 等)' },
    { type:'feature', text:'识别后字段仍可手动修改,绿色反馈条提示识别了哪几项' },
    { type:'feature', text:'粘贴时自动触发解析(超 20 字符且含换行/逗号),也可点 🪄 按钮手动触发' },
  ]},
  { version: '2026.05.25-fix15', date: '2026.05.25', title: '📅 增强日期筛选 — 本周/本月/任意月份的第N周', changes: [
    { type:'feature', text:'新增全局组件 <AdvancedDateFilter> 和辅助函数 getDateRange() / filterByDateRange()' },
    { type:'feature', text:'支持快捷选项:今天 / 昨天 / 本周 / 上周 / 本月 / 上月 / 全部 / 近 3-90 天' },
    { type:'feature', text:'支持按年份/月份精确选择:2026 年 + 12 月份网格 + 整月按钮' },
    { type:'feature', text:'支持按月份的"第 N 周"精确筛选:1-7 号 / 8-14 号 / 15-21 号 / 22-28 号 / 29 号-月底' },
    { type:'feature', text:'跨部门协作 / 反馈中心列表 + 导出模态 升级使用新筛选器' },
    { type:'feature', text:'客户跟进 / 拒付 / 线下单 / 定制咨询 / 实拍核实 加新筛选行(与原"超 N 天未处理"过滤器并存)' },
    { type:'feature', text:'文件名自动带时间范围(如 bug反馈_待修复_2026年6月第2周_5条_...)' },
  ]},
  { version: '2026.05.25-fix14b', date: '2026.05.25', title: '📥 反馈中心导出 4 种格式', changes: [
    { type:'feature', text:'反馈中心头部新增 📥 下载导出按钮 (主管/admin 专属)' },
    { type:'feature', text:'4 种格式:📝 Markdown · 🖨 PDF (浏览器打印) · 🌐 HTML · 📊 CSV' },
    { type:'feature', text:'筛选导出:仅待修复 / 仅已修复 / 全部 · 时间范围 · 类别' },
    { type:'feature', text:'内容选项:截图开关 / 主管回复 / 对话历史' },
    { type:'feature', text:'文件名自动含范围+数量+时间戳 (如 bug反馈_待修复_7条_20260525_1430.md)' },
    { type:'feature', text:'CSV 带 UTF-8 BOM,Excel 直接打开中文不乱码' },
    { type:'feature', text:'PDF 通过浏览器原生打印对话框,排版优雅,带分页防截断' },
  ]},
  { version: '2026.05.25-fix14', date: '2026.05.25', title: '🐛 内置反馈中心 + AI 自助 handoff', changes: [
    { type:'feature', text:'新增 🐛 反馈中心 模块 — 用户自助提交 bug/需求 → Supabase → 主管查阅 → AI 一键导出修复' },
    { type:'feature', text:'提交表单:类别 + 优先级 + 模块 + 描述 + 复现步骤 + 期望/实际 + 截图(粘贴/拖拽/上传 最多 8 张)' },
    { type:'feature', text:'自动收集版本号 + 浏览器信息 + 操作系统 + 视口尺寸,免去手填' },
    { type:'feature', text:'主管特权:🤖 导出给 AI 按钮 — 一键生成结构化文本摘要,直接粘到 Claude 对话窗' },
    { type:'feature', text:'状态机:新提交 → 已查阅 → 已排期 → 修复中 → 已修复(自动填当前版本号)' },
    { type:'feature', text:'对话区:用户 ↔ 主管可在反馈下持续沟通,减少信息丢失' },
    { type:'data',  text:'新增 Supabase 表 bug_reports + Realtime 订阅(任何人提交主管实时收到)' },
  ]},
  { version: '2026.05.25-fix13', date: '2026.05.25', title: '内置帮助中心 + 版本日志', changes: [
    { type:'feature', text:'新增 📖 使用手册 模块 — 一站式新人指南、模块说明、设计意图、Bug 报告流程' },
    { type:'feature', text:'内置版本日志(从 fix12 起完整记录,以后每次升级都自动归档)' },
    { type:'feature', text:'文档化 Claude AI 能力清单 + 未来路线图(让团队知道还能改什么)' },
  ]},
  { version: '2026.05.25-financefix1', date: '2026.05.25', title: '财务计算器:明扬加班船报价更新', changes: [
    { type:'data',  text:'明扬加班船 报价改为 美东19 / 美中18 / 美西17 元/kg(12-99kg)+ 15/14/13 元/kg(100kg+)' },
    { type:'data',  text:'明扬加班船 附加费按图 3 spec 重写:单边 / 第二边 / 实重 / 围长 6 档' },
    { type:'feature', text:'超规自动标"不接收":实重>68kg / 单边>300cm / 围长>420cm' },
  ]},
  { version: '2026.05.25-fix12-r5-paste-audit', date: '2026.05.25', title: '全局图片上传粘贴审计', changes: [
    { type:'fix',   text:'CdmDetailModal 回复框补上 Ctrl+V 粘贴 + 拖拽支持(漏的)' },
    { type:'data',  text:'8 处图片上传位置完整审计,全部支持粘贴' },
  ]},
  { version: '2026.05.25-fix12-r4-cy', date: '2026.05.25', title: 'v22-CY 预设网站列表', changes: [
    { type:'data',  text:'新增 SHOPS_PRESET:13 个公司网站(10 独立站 + 阿里巴巴 + Radilum INC + 其他)' },
    { type:'feature', text:'ShopOwnersManager 和 ComposeModal 都改用预设下拉,杜绝拼写不一致' },
    { type:'feature', text:'"其他"选项支持手填备注模式(不参与自动派单)' },
  ]},
  { version: '2026.05.25-fix12-r3b', date: '2026.05.25', title: 'v22-CW Round 3b:主管管理面板', changes: [
    { type:'feature', text:'新增 ShopOwnersManager(店铺-负责人维护,三方共享 + 只能编辑本部门)' },
    { type:'feature', text:'新增 TimeoutSettingsModal(主管自定义客服部 11 类 × 4 优先级超时阈值)' },
  ]},
  { version: '2026.05.25-fix12-r2-r3a', date: '2026.05.25', title: 'v22-CW Round 2+3a:UI 重排 + 工单升级', changes: [
    { type:'feature', text:'跨部门协作 4 tab(收件箱/分派给我/超时/我发起的)+ 超时优先排序' },
    { type:'feature', text:'顶部红色震动横幅(超时/紧急/主管视角)+ 5 张统计卡(加 ⏰ 超时)' },
    { type:'feature', text:'分页支持 20/50/100 切换' },
    { type:'feature', text:'ComposeModal:关联网站 + 自动建议负责人 + 多选 watchers' },
    { type:'feature', text:'DetailModal:工单分派(主管)+ watcher 管理 + 完成时桌面通知' },
  ]},
  { version: '2026.05.25-fix12-r1', date: '2026.05.25', title: 'v22-CV/CW Round 1:基础设施', changes: [
    { type:'data',  text:'CDM_CATEGORIES 从 7 类升级到 11 类(修改产品/改卖价/下架/上新品/做评价/3D 渲染/安装图/非标定制/售后/表单/其他)' },
    { type:'feature', text:'工具函数 getCategoryDef/getTimeoutDays/isOverdue/getDueAt 全局暴露 window.__cdmHelpers' },
    { type:'feature', text:'shopOwners + cdmTimeoutConfig state 加载 + Realtime 实时同步' },
    { type:'feature', text:'工单卡片增强:超时角标 / 关联网站 / 分派给 / watcher 数 / 截止剩余天数' },
    { type:'feature', text:'进入跨部门协作时自动询问浏览器通知权限' },
  ]},
  { version: '2026.05.25-fix11-hotfix4', date: '2026.05.25', title: '去重 — 删除汇报工单 tab', changes: [
    { type:'refactor', text:'汇报工单功能已被跨部门协作完全取代,从导航中移除(代码保留可回滚)' },
  ]},
  { version: '2026.05.25-fix11-hotfix3', date: '2026.05.25', title: 'AI 评价工具加载速度优化', changes: [
    { type:'perf',  text:'<link rel="preconnect"> 提前 DNS+TLS 握手美工域名' },
    { type:'perf',  text:'iframe 永久挂载 + display 切换,关闭再开瞬间显示' },
    { type:'perf',  text:'稳定 URL(只含用户身份)+ postMessage 推任务上下文,iframe 不再重 load' },
    { type:'feature', text:'头部加"工具加载中..."橙色提示芯片(iframe onLoad 触发后消失)' },
  ]},
  { version: '2026.05.25-fix11-hotfix2', date: '2026.05.25', title: 'AI 评价生成合并到产品评价 tab', changes: [
    { type:'refactor', text:'移除 🤖 AI 评价生成 独立 tab,合并进 ⭐ 产品评价 内部' },
    { type:'feature', text:'产品评价顶部加"🤖 AI 评价工具"按钮(ad-hoc 临时模式)' },
    { type:'feature', text:'任务卡上 in_progress 时显示紫色"🤖 AI 生成评价"按钮' },
  ]},
  { version: '2026.05.25-fix11-hotfix1', date: '2026.05.25', title: 'fix11 hotfix:stats 变量提升 bug', changes: [
    { type:'fix',   text:'allTabs useMemo 引用 stats.X 时 stats 还是 undefined(Babel hoisting)→ 改 stats?.X 防御' },
  ]},
  { version: '2026.05.25-fix11', date: '2026.05.25', title: '右键新窗口 + 评价 AI 合并', changes: [
    { type:'feature', text:'tab 改为 <a href="#tab=...">,支持右键"在新标签打开"/中键/Ctrl+点击' },
    { type:'feature', text:'hashchange 监听同步 activeTab(浏览器后退/前进/外部链接)' },
    { type:'feature', text:'评价任务卡接单后出现紫色"🤖 AI 生成评价",全屏面板内嵌美工 iframe' },
  ]},
  { version: '2026.05.25-fix10', date: '2026.05.25', title: 'IDE 风格侧边栏布局 + 自定义弹窗', changes: [
    { type:'feature', text:'顶部常用 tab + 左侧栏不常用 tab 分组(主功能/资源/协作/管理)' },
    { type:'feature', text:'侧边栏可折叠到 icon-only(56px)' },
    { type:'feature', text:'⚙ 自定义布局 弹窗,每个员工独立保存(localStorage `nav_layout_${user.id}`)' },
  ]},
  { version: '2026.05.25-fix9c', date: '2026.05.25', title: '跨部门协作初版 + AI 评价 iframe', changes: [
    { type:'feature', text:'跨部门协作模块(美工/客服/跟单 三系统共用消息总线 Supabase)' },
    { type:'feature', text:'AI 评价生成 iframe 嵌入美工 worktrack-kpi 的 ?embed=cs-reviews 精简模式' },
  ]},
  { version: '2026.05.25-fix9b', date: '2026.05.25', title: '事件按钮折叠 + 完成率统计', changes: [
    { type:'feature', text:'6 个事件按钮折叠成"📌 添加事件 ▼",节省横向空间' },
    { type:'feature', text:'退款管理 + 拒付加金额汇总组件(按货币/网站/状态分布)' },
    { type:'feature', text:'售后/补件加完成率横幅(3/7/14/30/60 天)' },
    { type:'feature', text:'售后/补件行加 ✓ 一键完成按钮' },
  ]},
  { version: '2026.05.25-fix9', date: '2026.05.25', title: '老板删除 bug + 退款权限模型', changes: [
    { type:'fix',   text:'aftersales/refills/refunds 三张表 deleted 列缺失 SQL 加上' },
    { type:'fix',   text:'loadAll 没过滤 !deleted 导致软删除回弹 → 补 .filter(!x.deleted)' },
    { type:'feature', text:'退款处理人模型:system_settings.refund_processors,只有授权人才能审批退款' },
    { type:'feature', text:'WorkSnapshotPanel 退款处理人专属 2 张红卡(今天审核 / 今天打款)' },
  ]},
  { version: '2026.05.25-fix8', date: '2026.05.25', title: 'CLOUD.upsert 自动 schema-retry', changes: [
    { type:'perf',  text:'PGRST204 "column not found" → 自动剥离该列重试(最多 5 次),缓存到 CLOUD._missingColumns' },
    { type:'fix',   text:'kb.html iframe modal 显示修复(viewport-bound 检测)' },
  ]},
  { version: '2026.05.25-fix7', date: '2026.05.25', title: '保存兜底 + 同步保护 + 升级按钮', changes: [
    { type:'fix',   text:'所有 Editor 加 created_by 兜底(防止 NULL 约束报错)' },
    { type:'feature', text:'多级升级按钮:staff/finance → admin → super_admin' },
    { type:'feature', text:'实拍核实表单重写:订单编号 + CustomerRepliesBoard 留言板(文图时间线)' },
  ]},
];
console.log(
  '%c📦 统一工作台 v' + APP_VERSION + ' 已加载\n' +
  '%c如看到旧 bug,请强刷 Ctrl+Shift+R 清除缓存\n' +
  '调试工具:window.CLOUD / window.__debugTimeFilter',
  'color:#0369a1; font-weight:bold; font-size:14px; background:#e0f2fe; padding:4px 8px; border-radius:4px',
  'color:#64748b; font-size:11px'
);

// 暴露调试入口
if (typeof window !== 'undefined') {
  window.CLOUD = CLOUD;
  window.APP_VERSION = APP_VERSION;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
