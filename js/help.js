// ============================================================
// 📖 跟单工作台 · 使用手册 + 版本日志 + Bug 反馈 + 功能路线图
// ============================================================
// 文件:help.js · 由 Anthropic Claude 共建
// 最近更新:2026-05-26 · 当前版本 20260525x
// ============================================================

// ==========================================================
// 📜 完整版本历史(所有迭代记录都在这)
// ==========================================================
const VERSION_LOG = [
  {
    v: '20260526b',
    date: '2026-05-26',
    type: 'feature',
    title: '📦 采购单模块接入通用日期筛选',
    notes: [
      '采购单筛选栏新增日期下拉(在供应商下拉旁边)',
      '完整支持:今天/昨天/本周/上周/本月/上月 + 近 7/30/90 天/1 年',
      '可选 2024/2025/2026 全年 + 12 个月 + 当年每月每周',
      '自定义日期范围对话框',
      '原"业绩卡点击" UI 保留(今天/近7天/近30天/近90天/近1年)· 共用同一套预设',
      '重构 PO_DATE_FILTER 用 preset string · 兼容旧代码',
      '加 last_365 预设到 dateFilter.js',
    ],
  },
  {
    v: '20260526a',
    date: '2026-05-26',
    type: 'feature',
    title: '📅 通用日期筛选器(项目级标准)',
    notes: [
      '新增 dateFilter.js 通用日期筛选工具',
      '11 种快捷预设:今天 / 昨天 / 本周 / 上周 / 本月 / 上月 / 近7天 / 近30天 / 近90天 / 本年 / 全部时间',
      '按年度:最近 N 年(默认 3 年)',
      '按月度:当年所有 12 个月 + 去年 + 前年',
      '按周度:当年每月的第 1-5 周(自动按月底截断)',
      '自定义日期对话框:起止日期输入 + 5 个快捷填充按钮',
      '通用 API:getDateRange(preset) / isDateInRange(date, preset) / populateDateFilterSelect(el, ...)',
      '反馈中心已应用:列表筛选 + 下载范围 都支持完整日期筛选',
      '文件名带日期标签:跟单反馈_全部_2026年6月第2周_2026-05-26.md',
      '后续模块加日期筛选只需 3 行代码(见 help 文档)',
    ],
  },
  {
    v: '20260525z',
    date: '2026-05-26',
    type: 'feature',
    title: '💾 反馈一键下载(PDF / Markdown / HTML / JSON)',
    notes: [
      '新增「💾 下载反馈」按钮(老板/运维专属)',
      '4 种格式:Markdown(给 Claude 用最佳)、HTML(印 PDF)、PDF(直接打印)、JSON(原始数据)',
      '6 种范围:全部 / 仅待处理 / 仅紧急 / 仅含截图 / 近7天 / 仅我提的',
      'Markdown 含完整 metadata + 描述 + 截图URL + 评论 + AI 分析历史',
      'Markdown 顶部自动加给 Claude 的指令模板(返回 JSON 格式说明)',
      'HTML 内嵌截图为 base64(自包含 · 断网可看)+ 打印样式 + 分页保护',
      'PDF 模式:自动打开新窗口 + 触发浏览器打印对话框 → 选「另存为 PDF」',
      '文件名规范:跟单反馈_<范围>_YYYY-MM-DD.<扩展名>',
    ],
  },
  {
    v: '20260525y',
    date: '2026-05-26',
    type: 'feature',
    title: '💬 反馈中心(闭环 Bug/需求工单系统)',
    notes: [
      '新增「💬 反馈」tab · 全员可见可提',
      '3 类型:🐛 Bug / 💡 新功能 / 🔧 改进 · 4 紧急度',
      '完整字段:类型 + 紧急度 + 模块 + 标题 + 描述 + 截图 + 复现步骤 + 预期/实际',
      '支持 Ctrl+V 粘贴截图 / 拖拽 / 多文件上传',
      '自动收集浏览器信息 · 用户角色 · app 版本',
      '提交后所有员工实时可见 · 可点赞 · 可评论',
      '🚀 老板专属「📤 导出给 Claude」一键复制所有待分析为结构化 JSON',
      '🚀 老板专属「📥 导入 Claude 分析」把 AI 回复粘贴回来自动写入',
      '7 状态流:待分析→Claude分析中→已确认→改造中→已修复(标版本号)',
      '存储:跨部门 Supabase · system_feedback 表 · Realtime 同步',
      'localStorage 兜底(若 table 未建)',
    ],
  },
  {
    v: '20260525x',
    date: '2026-05-26',
    type: 'feature',
    title: '📖 内置使用手册 + 版本日志 + Bug 反馈',
    notes: [
      '新增「📖 手册」按钮(顶栏右侧)· 全员可见',
      '4 大 tab:模块手册 / 版本记录 / Bug 反馈 / 功能路线图',
      '完整模块说明 · 给新人快速上手',
      'Bug 报告标准模板 + 截图/复现步骤指引',
      '功能路线图对标店小秘等 ERP 的优势/痛点',
    ],
  },
  {
    v: '20260525w',
    date: '2026-05-26',
    type: 'fix',
    title: '🎯 全项目 paste 100% 覆盖(13/13)',
    notes: [
      '修最后漏洞:供应商收款码(支付宝/微信 QR)支持 Ctrl+V 粘贴',
      '鼠标 hover 哪个收款码框 → 蓝色高亮 → 粘贴就进哪个字段',
      '拖拽也支持(变虚线 + 蓝底)',
      '默认进支付宝(没 hover 时)',
    ],
  },
  {
    v: '20260525v',
    date: '2026-05-26',
    type: 'fix',
    title: '📋 项目级 paste 标准化(11 个 textarea 全覆盖)',
    notes: [
      '所有图片上传模态框的 textarea 加 data-paste-target 属性',
      '6 个 modal × 11 个 textarea 全覆盖:订单/售后/问题/找灯/采购/批量催单',
      '后续新加 textarea 只要加一行 data-paste-target 就自动支持粘贴',
    ],
  },
  {
    v: '20260525u',
    date: '2026-05-26',
    type: 'fix',
    title: '🚨 修真正 paste bug · 项目级 3 级路由',
    notes: [
      '根因:全局处理器把 issueModal 默认到 issue_fu,导致描述区粘贴跑到沟通区',
      '修复:3 级优先级 · activeElement.data-paste-target > 鼠标 hover > modalDefaults',
      '即时反馈:粘贴时弹 toast「📋 检测到剪贴板图片 · 上传到「xxx」...」',
      'issue_orig 同时支持 draft 模式和已保存模式',
    ],
  },
  {
    v: '20260525t',
    date: '2026-05-26',
    type: 'feature',
    title: '🖼 供应商问题 · 图片上传(描述区 + 沟通记录)',
    notes: [
      '详细描述加图片网格 · 3 种上传:Ctrl+V / 拖拽 / 选文件',
      '沟通记录加📷 上传图片按钮',
      '每张图悬停红色 × 删除 · 点图查看大图',
      '已嵌入 issues.js 模块 · 完全融入原有 UI',
    ],
  },
  {
    v: '20260525s',
    date: '2026-05-26',
    type: 'feature',
    title: '🌐 v22-CY · 内置 13 个网站常量',
    notes: [
      'SHOPS_PRESET:10 独立站 + 1 平台 + 1 实体公司 + 其他',
      'Vakkerlight / Docos.us / Mooijane / Mooiehome / Radilum / Mooielight / Dekorfine / Pinlighting / Lumioshine / Rayonshine / 阿里巴巴国际站 / Radilum INC',
      '店铺负责人管理改下拉(避免拼写不一致导致自动派单失效)',
      '新建跨部门工单的网站下拉也用此预设(分组显示)',
      '选「其他」时下方出橙色手填框 · 自动派单跳过',
    ],
  },
  {
    v: '20260525r',
    date: '2026-05-26',
    type: 'feature',
    title: '🔔 跨部门通知:owner 完成 + 被分派',
    notes: [
      '别人完成你发的工单 → 桌面通知「✅ 你的工单已完成 · 由 XXX 完成」',
      '点通知跳跨部门 tab + 自动打开详情',
      '主管分派工单给你 → 桌面通知「📌 工单分派给你了 · 由主管 分派」',
      '分派通知 requireInteraction: true(不自动消失,需用户确认)',
    ],
  },
  {
    v: '20260525q',
    date: '2026-05-25',
    type: 'feature',
    title: '👥 v22-CW watcher 多选(新建 + 详情)',
    notes: [
      '新建消息加紫色 watcher 选择按钮(对方部门的其他负责人)',
      '详情主管可编辑 watcher 列表',
      'canSee 已包含 watcher 角色',
    ],
  },
  {
    v: '20260525p',
    date: '2026-05-25',
    type: 'feature',
    title: '🚀 v22-CW 跨部门协作 1.0(全功能)',
    notes: [
      '11 分类:产品问题 / 价格异常 / 订单异常 / 物流追踪 / 退换货 / 美工设计 / 站点维护 / 上架 / 库存预警 / 财务对账 / 通用',
      '4 优先级超时:urgent / high / normal / low · defaultTimeout 可配',
      '4 sub-tab:收件箱 / 已分派给我 / 已超时 / 已发出',
      '5 个统计卡(含⏰超时数)+ 紧急横幅',
      '关联网站 + 自动建议负责人 + watcher 多选',
      '主管:分派 + 店铺负责人管理 + 超时阈值设置',
      'Realtime 3 表同步 + 桌面通知权限请求',
      '分页 20/50/100',
    ],
  },
  {
    v: '20260525e-o',
    date: '2026-05-25',
    type: 'feature',
    title: '🏗 基础架构迭代(o-e)',
    notes: [
      '跨部门协作 v22-CR 初版(5 分类)→ 被 v22-CW 取代',
      'IDE 风格侧栏布局(150px 展开 / 56px 收起 · 文字标签)',
      '销售单批量开 PO(同供应商按国家拆 PO)',
      '找灯模块权限全开(任何跟单可改状态/删除/采纳建议)',
      'PO 打印 8 列(4 个打印函数全统一:含「下单标准」列)',
      'box_note 备注 state 修(改字不被冲掉)',
      '销售单卡 .so-prod-info 宽度修(填满中间空白)',
    ],
  },
];

// ==========================================================
// 📋 模块手册(每个模块的设计初心 + 功能 + 注意事项)
// ==========================================================
const MODULE_MANUAL = [
  {
    icon: '📥', tab: 'sales', name: '销售单(Shopify 订单)',
    purpose: '从 Shopify 后台抓取订单 → 跟单选择供应商 → 开 PO',
    intent: `设计初心:让跟单不用在 Shopify 后台和供应商沟通工具之间来回切换。
所有客户订单一目了然,可直接基于销售单批量开 PO,而不是逐单手工填写。`,
    features: [
      '🔍 多关键字搜索(K1234, K5678 用逗号或空格分隔)',
      '💰 金额范围筛选',
      '🌐 按网站/平台过滤',
      '👥 按跟单/客服负责人过滤',
      '📦 批量勾选 → 同供应商按国家自动拆 PO(灯具外贸常见场景)',
      '⏰ 显示订单天数(超过 X 天可标红预警)',
    ],
    tips: [
      '勾选多个销售单 → 点「📦 批量开 PO」· 系统会按"供应商+国家"组合自动拆成多个 PO',
      '点订单号右边的 ↗ 在新窗口打开 Shopify 后台对应订单',
      '销售单卡里的产品信息行已经 flex:1 填满中间空白(2026-05-25 修复)',
    ],
  },
  {
    icon: '📦', tab: 'po', name: '采购单(PO)',
    purpose: '给供应商下单的正式采购单 · 含详细规格、价格、收货地址、付款条件',
    intent: `设计初心:外贸 PO 必须 8 列齐全(SKU/名称/规格/数量/单价/小计/下单标准/备注),
打印出来必须能让供应商一眼看清要求,避免来回沟通错漏。`,
    features: [
      '📋 8 列标准格式(含「下单标准」列)',
      '🖨 4 种导出:打印 / 复制图 / 导出 PDF / 批量导出',
      '📝 每行可单独写备注(box_note,会自动追加订单号)',
      '🏷 中英双语品名(默认显示中文,可切英文)',
      '✅ 财务审批流(草稿 → 待审 → 审批中 → 已通过 → 已下单)',
      '📷 收款码自动带入(供应商支付宝/微信 QR)',
    ],
    tips: [
      'box_note 改字不会冲掉(已修)· 改完 SKU 数量后备注仍在',
      '主管能驳回 PO · 跟单看到驳回原因后修改',
      'PO 自动同步给财务系统(如部署了 Edge Function)',
    ],
  },
  {
    icon: '📋', tab: 'orders', name: '催单(订单跟进)',
    purpose: '已下 PO 的订单状态跟踪 + 沟通记录 + 物流追踪',
    intent: `设计初心:跟单一个人通常要管几十上百个在产订单。
每次跟供应商沟通的"我说了什么 · 他答了什么 · 下一步"必须沉淀下来,
不然换班/请假就接不上,客户问就答不出。`,
    features: [
      '⏰ 智能催单提醒(按订单年龄)',
      '📞 沟通记录:每次沟通独立条目(日期 + 内容 + 截图)',
      '📦 批量催单(选多个订单 · 同一条催单批量同步)',
      '🚚 物流单号 + 状态跟踪',
      '📷 沟通截图(可 Ctrl+V 粘贴 / 拖拽 / 选文件)',
      '🔔 超时提醒 + 状态徽章(在产 / 待发货 / 已发货 / 已完成)',
    ],
    tips: [
      '沟通记录的输入框可以直接 Ctrl+V 粘贴聊天截图',
      '批量催单输入的备注会加到所有选中订单的沟通记录里',
      '订单跟进的图片归到 order_fu · 描述图归到 order_orig',
    ],
  },
  {
    icon: '🔍', tab: 'missing', name: '找灯',
    purpose: '客户发图片但没找到对应款式 → 全员协作找供应商',
    intent: `设计初心:灯具外贸经常遇到客户发个图问"能不能做"。
传统流程:客服转跟单→跟单找供应商→中间信息丢失。
设计目标:发起人提交(图+描述+规格)→ 全员可见可评论 → 任何人都能贡献"我知道这是 XX 供应商做的"线索。`,
    features: [
      '📷 灯具图(描述图)+ 实物图(后期找到时上传)',
      '📝 详细描述 + 规格(直径/材质/数量/特殊要求)',
      '💬 评论区(任何跟单可贡献线索)',
      '✅ 状态:搜寻中 / 已找到 / 存档(全员可改 · 2026-05-25 权限全开)',
      '👥 全员可见 · 没有"私人找灯"',
    ],
    tips: [
      '不只发起人能改状态,任何跟单看到都能标"已找到"',
      '建议在评论里 @某人 引导关注',
      '已找到后可关联到 PO 形成完整闭环',
    ],
  },
  {
    icon: '⚠', tab: 'issues', name: '供应商问题',
    purpose: '记录与供应商的非订单类问题(质量/价格/工艺/合作纠纷)',
    intent: `设计初心:订单催单是"催进度",这里是"催问题"。
供应商搞出工艺不达标、规格不对、价格临时涨等问题,需要单独跟进。
跟订单分开是因为:问题可能跨多个 PO · 升级到老板时需要完整证据链。`,
    features: [
      '🎯 6 大分类:工艺要求 / 规格要求 / 包装要求 / 物流要求 / 价格账期 / 合作问题',
      '🏷 具体类型多选(喷漆 / 焊点 / 抛光 / 涂层 / 表面纹理 ...)',
      '📷 问题截图(描述区 + 每条沟通记录都可放图)',
      '⏰ 下次跟进日期(3天/7天/15天快捷按钮)',
      '🔄 4 状态:待沟通 / 沟通中 / 已解决 / 已升级老板',
      '💬 沟通记录(每次沟通独立 · 含日期 + 内容 + 图片)',
    ],
    tips: [
      '截图直接 Ctrl+V 粘贴到描述区或沟通区(2026-05-26 修复)',
      '升级到老板时:截图证据链已经在记录里了 · 不用重新整理',
      '已解决 ≠ 关闭,可继续添加沟通记录(如复发)',
    ],
  },
  {
    icon: '🔧', tab: 'aftersales', name: '售后(退/换/补)',
    purpose: '客户收货后发现问题 · 需要返修/换货/补寄/部分退款',
    intent: `设计初心:售后是最烧钱也最伤口碑的环节。
关键指标:首次响应时间 + 解决周期 + 客户满意度。
设计目标:让一线人员能快速判断"哪种处理方案" + 跟踪供应商配合度。`,
    features: [
      '📷 客户反馈照片(必拍)+ 跟进截图',
      '📝 详细描述 + 沟通记录',
      '🔄 状态流:接到反馈 → 处理中 → 已解决',
      '💰 关联 PO + 关联订单 · 一键查源头',
      '⚠ 升级机制(超过 N 天未解决自动标红)',
    ],
    tips: [
      '客户的图片必须先存(法律责任 + 跟供应商索赔的证据)',
      '建议每次跟客户沟通后立刻在这里记录 · 不要等"统一整理"',
      '已解决的售后单不会消失 · 留作未来风控数据',
    ],
  },
  {
    icon: '🛒', tab: 'purchases', name: '线上采购',
    purpose: '从淘宝/1688/京东等线上渠道采购非标件 · 配件 · 样品',
    intent: `设计初心:不是所有采购都走正式 PO。
试款灯杯、临时缺货补、客户特殊配件等小额采购,走"线上采购"流程更轻。
设计目标:让小额采购也能审批 + 记账 + 关联到主订单。`,
    features: [
      '🔗 商品链接(自动识别淘宝/1688)',
      '📋 SKU + 名称 + 描述',
      '💵 单价 × 数量 = 总价(自动计算)',
      '📦 物流单号跟踪',
      '🧾 关联到主订单(可选)',
      '📷 商品截图(可 Ctrl+V 粘贴)',
    ],
    tips: [
      '没有内部订单号也可以建(选"非订单关联")',
      '线上采购的备注框可以贴商品页关键截图',
    ],
  },
  {
    icon: '📨', tab: 'cross_dept', name: '跨部门协作(v22-CW)',
    purpose: '跟单 ↔ 美工 ↔ 客服 三部门工单管理 · 实时同步',
    intent: `设计初心:不同部门用不同系统是巨大的协作摩擦点。
微信群聊太混乱(同事休假后没人继续跟)· 钉钉太正式 · 电话留不下记录。
设计目标:一个轻量的"工单系统",每个工单都有 owner / 状态 / 时限 / watchers,
并且 3 个系统(跟单 / 美工 / 客服)实时同步,跨系统看到自己相关工单的 badge。`,
    features: [
      '🎯 11 个分类:产品问题 / 价格异常 / 订单异常 / 物流追踪 / 退换货 / 美工设计 / 站点维护 / 上架 / 库存预警 / 财务对账 / 通用',
      '🚨 4 优先级超时:urgent(立即) / high(2天) / normal(7天) / low(14天)',
      '🌐 关联网站(13 个预设)→ 自动建议负责人',
      '👥 watcher 多选(对方部门关注此工单的其他人)',
      '📋 4 sub-tab:收件箱 / 已分派给我 / 已超时 / 已发出',
      '📊 5 个统计卡(待处理 / 我的 / 已超时 / 已完成 / 总数)',
      '🔔 桌面通知:被分派 / 工单已完成',
      '⚙ 主管功能:分派给手下 + 维护店铺-负责人映射 + 超时阈值配置',
    ],
    tips: [
      '不能发给自己部门(自己部门内部用本系统的其他模块)',
      '关联网站会自动建议对方部门的"主负责人"',
      '选「📝 其他(手填)」时不会自动派单(避免拼写不一致)',
      'watcher 不会收到完成通知(只有 owner 收到)',
      '主管可以分派、维护店铺映射、调整超时阈值',
    ],
  },
  {
    icon: '✓', tab: 'finance', name: '财务收货',
    purpose: '货到仓库后核对实物数 vs PO 数 · 触发付款流程',
    intent: '让财务和仓库的协作有据可查 · 收货数与 PO 数不符时自动标红。',
    features: ['📦 实收数量录入', '⚠ 差异自动标红', '💵 付款触发', '🚚 入库时间记录'],
    tips: ['差异 ≥ 10% 会自动开"供应商问题"工单'],
  },
  {
    icon: '📚', tab: 'products', name: '产品档案',
    purpose: '所有上架产品的中英文名 / 规格 / 主供应商 / 价格历史',
    intent: '让"客服 / 美工 / 跟单"对同一个 SKU 看到同一份数据。',
    features: ['🏷 中英双语品名', '📷 产品主图', '💰 价格历史', '🏭 主供应商', '📐 规格'],
    tips: ['品名 / 规格变更会自动通知到所有用 此 SKU 的在产订单'],
  },
  {
    icon: '📊', tab: 'performance', name: '绩效',
    purpose: '跟单 / 客服 / 美工的工作量与质量指标',
    intent: '让 KPI 透明 · 不需要主管手工统计 Excel。',
    features: ['📈 处理工单数', '⏰ 平均响应时间', '✅ 解决率', '⚠ 超时次数'],
    tips: ['老板看的是团队总览 · 主管看的是组员明细 · 每人只能看自己'],
  },
];

// ==========================================================
// 🐛 Bug 反馈模板与指引
// ==========================================================
const BUG_REPORT_TEMPLATE = `# Bug 报告模板(复制到群里发)

## 🔴 一句话标题
[模块名] · 简短问题描述

## 📍 在哪个模块
[ ] 销售单  [ ] 采购单  [ ] 催单  [ ] 找灯  [ ] 售后
[ ] 问题    [ ] 采购    [ ] 跨部门  [ ] 财务   [ ] 其他: ___

## ❌ 实际情况(操作什么 → 发生了什么)
1. 我做了:
2. 我看到:
3. 我预期:

## 🔄 怎么重现(每一步都要)
1. 打开 xxx
2. 点击 xxx
3. 输入 xxx
4. 按下 xxx
5. 屏幕显示:

## 📷 截图(必须有)
- 出错那一刻的屏幕截图
- 浏览器控制台(F12 → Console)报错信息

## 🌐 环境
- 浏览器:Chrome / Edge / Firefox / Safari · 版本:
- 操作系统:Windows / Mac · 版本:
- 系统版本号(顶栏右上角):__________
- 我的角色:跟单员 / 主管 / 老板

## ⚡ 紧急度
[ ] 🔴 卡死无法工作  [ ] 🟠 影响主业务  [ ] 🟡 体验问题  [ ] 🟢 优化建议
`;

const BUG_GUIDELINES = [
  {
    title: '✍ 一句话标题怎么写',
    body: `不好:"系统出问题了"
好  :"跟单·沟通区 Ctrl+V 粘贴图片没反应"
好  :"PO 打印 8 列变成 6 列 · 缺「下单标准」和「规格」"
要点:模块 + 动作 + 问题现象`,
  },
  {
    title: '🔄 复现步骤为什么这么重要',
    body: `开发改 bug 90% 时间花在"我没法重现你的问题"上。
所以请像写菜谱:第 1 步打开什么 · 第 2 步点什么 · 第 3 步...
不要省略!"打开页面"是错的 · 是"打开跟单工作台 → 点📨 跨部门 → 收件箱 → 第 3 条工单"。`,
  },
  {
    title: '📷 截图必须包含什么',
    body: `1. 整个屏幕(不只是问题区域)
2. 浏览器地址栏(看 URL)
3. 顶栏右上角的版本号
4. 如果有 alert/toast 弹窗,要截到弹窗
5. F12 → Console → 红字报错也截图`,
  },
  {
    title: '⚡ 紧急度怎么定',
    body: `🔴 卡死:整个系统打不开 / 救命数据丢失 / 主流程完全堵死
🟠 影响主业务:某个高频功能挂了(每天都用的)
🟡 体验问题:能用但很难用 / 偶发错误
🟢 优化建议:能用 · 只是想改得更顺手

紧急度直接影响响应时间:🔴 立刻修 · 🟠 当天 · 🟡 本周 · 🟢 下批迭代`,
  },
  {
    title: '🚫 不要这样提 bug',
    body: `❌ "系统好慢"           → 哪个页面?多慢?什么时间?
❌ "总是有问题"          → 具体什么操作?
❌ "之前可以的现在不行"  → 什么时候开始?中间装了什么?
❌ "我截图发你"(无截图) → 截图是必须的`,
  },
];

// ==========================================================
// 🚀 功能路线图(对标店小秘 + AI 增强)
// ==========================================================
const ROADMAP = {
  // 跟同类 ERP(店小秘 / 旺店通 / 易仓)对比 · 我们的优势
  advantages: [
    {
      icon: '🤖', title: 'AI 直接改代码',
      desc: '店小秘:提需求 → 排队 → 几个月才上线。我们:跟 Claude 说一句 → 当天部署。',
    },
    {
      icon: '🔗', title: '3 部门深度融合',
      desc: '店小秘 = 跟单系统。我们 = 跟单 + 美工 + 客服 实时联动 · 跨部门工单只一个 click。',
    },
    {
      icon: '🌍', title: '外贸特化(灯具行业)',
      desc: '店小秘 ≈ 通用模板。我们 = 灯具特有字段(挂板/驱动/调光/电压/认证)直接内置。',
    },
    {
      icon: '💾', title: '自有数据 · 不被锁住',
      desc: '店小秘:数据在他们服务器,断网/涨价/政策都受制。我们:Supabase · 一键导出。',
    },
    {
      icon: '🎯', title: '为你团队定制',
      desc: '店小秘:你迁就软件。我们:软件迁就你。改字段/改流程/加规则 都行。',
    },
    {
      icon: '💰', title: '无月费',
      desc: '店小秘:每月几百到几千。我们:Supabase 免费层够小团队用了。',
    },
  ],

  // 店小秘的痛点 · 我们已经解决的
  solvedPainPoints: [
    'Shopify 订单自动抓取 ✅',
    '同供应商批量开 PO ✅',
    '中英双语品名 ✅',
    '8 列 PO 打印格式 ✅',
    '沟通记录沉淀(支持图)✅',
    '跨部门工单实时同步 ✅',
    '权限灵活(不只主管能改)✅',
    '复制粘贴图片到任何位置 ✅',
    '13 个网站预设(避免拼写)✅',
  ],

  // 已规划但还没开发(下批做)
  upcoming: [
    {
      icon: '📊', name: '智能催单建议',
      desc: 'AI 看订单的"年龄 + 上次沟通 + 历史平均交期" → 建议催单话术(粤语/英语/普通话)',
      eta: '1-2 周',
    },
    {
      icon: '🌐', name: '中英自动翻译',
      desc: '跟单中文写沟通记录 → 自动生成给客户/供应商的英文版 · 按对话语境调风格',
      eta: '2-3 周',
    },
    {
      icon: '🔍', name: '产品识图',
      desc: '客户发产品图(找灯模块) → AI 识别 → 自动匹配档案里类似产品 + 推荐供应商',
      eta: '1 个月',
    },
    {
      icon: '📈', name: '价格异常检测',
      desc: '同款 SKU 不同 PO 价格波动 > X% 自动提醒主管 · 防止采购吃回扣或供应商乱报价',
      eta: '2-3 周',
    },
    {
      icon: '📦', name: '物流自动跟踪',
      desc: '物流单号录入后自动调取 17track / FedEx / DHL API · 状态变更通知客服 + 客户',
      eta: '1-2 个月',
    },
    {
      icon: '⚖', name: '供应商绩效评分',
      desc: '准时率 / 质量问题率 / 配合度 / 价格竞争力 → 每月自动评分 · 主管按分配单',
      eta: '1-2 个月',
    },
    {
      icon: '🤖', name: 'AI 客服首响',
      desc: '客户邮件/留言进来 → AI 起草第一版回复 → 人工审核发出 · 节省 70% 重复劳动',
      eta: '2-3 个月',
    },
    {
      icon: '🧊', name: '合箱智能拼装',
      desc: '多个 PO 货量小 → 自动建议合箱方案 · 算柜量 / 重量 / 体积 / 优化运费',
      eta: '1-2 个月',
    },
    {
      icon: '📑', name: '自动出口报关单',
      desc: 'PO 数据自动转报关单格式 · 减少代理来回核对 · 海关 HS Code 自动匹配',
      eta: '2-3 个月',
    },
    {
      icon: '💼', name: '财务月度报表',
      desc: '每月 1 号自动生成:营收 / 毛利 / 供应商账期 / 现金流 / 异常分析',
      eta: '1 个月',
    },
  ],

  // Claude 现在(就此刻)可以做的
  claudeCanDo: [
    '✏ 修任何 bug · 给我控制台截图 + 复现步骤',
    '🎨 改 UI 布局 · 颜色 · 字体 · 间距',
    '➕ 加新字段 / 新模块 / 新审批流',
    '🔄 改业务逻辑 · 状态流 · 权限规则',
    '🌐 改文案(中文/英文)/ 加多语言',
    '📊 加报表 · 图表 · 统计卡',
    '🔌 接第三方 API(物流 / 翻译 / 支付)',
    '💾 数据库结构调整(配合 Supabase MCP)',
    '🚀 性能优化 · 代码重构',
    '📖 写文档 / 培训资料',
  ],
};

// ==========================================================
// 🖼 渲染函数
// ==========================================================
const HELP_TABS = [
  { id: 'manual',   icon: '📋', label: '模块手册' },
  { id: 'version',  icon: '📜', label: '版本记录' },
  { id: 'bug',      icon: '🐛', label: 'Bug 反馈' },
  { id: 'roadmap',  icon: '🚀', label: '路线图' },
];
let HELP_CURRENT_TAB = 'manual';

function openHelpManual(tabId) {
  if (tabId) HELP_CURRENT_TAB = tabId;
  const modal = document.getElementById('helpManualModal');
  if (!modal) return;
  modal.classList.add('show');
  renderHelpContent();
}

function closeHelpManual() {
  const modal = document.getElementById('helpManualModal');
  if (modal) modal.classList.remove('show');
}

function helpSwitchTab(tabId) {
  HELP_CURRENT_TAB = tabId;
  renderHelpContent();
}

function renderHelpContent() {
  // 渲染 tab 切换栏
  const tabBar = document.getElementById('helpTabBar');
  if (tabBar) {
    tabBar.innerHTML = HELP_TABS.map(t => `
      <div class="help-tab-item ${t.id === HELP_CURRENT_TAB ? 'active' : ''}" onclick="helpSwitchTab('${t.id}')">
        ${t.icon} ${t.label}
      </div>
    `).join('');
  }
  // 渲染主内容
  const body = document.getElementById('helpManualBody');
  if (!body) return;
  if (HELP_CURRENT_TAB === 'manual') body.innerHTML = renderManualSection();
  else if (HELP_CURRENT_TAB === 'version') body.innerHTML = renderVersionSection();
  else if (HELP_CURRENT_TAB === 'bug') body.innerHTML = renderBugSection();
  else if (HELP_CURRENT_TAB === 'roadmap') body.innerHTML = renderRoadmapSection();
}

function renderManualSection() {
  return `
    <div class="help-intro">
      <h2 style="margin:0 0 10px 0;">📋 跟单工作台 · 完整模块手册</h2>
      <div style="color:var(--text-secondary); font-size:13px;">
        每个模块的<b>设计初心</b>、<b>主要功能</b>、<b>使用技巧</b> · 给新人 30 分钟内上手
      </div>
    </div>
    ${MODULE_MANUAL.map(m => `
      <div class="help-module-card">
        <div class="help-module-header" onclick="this.parentElement.classList.toggle('expanded')">
          <div class="help-module-title">
            <span class="help-module-icon">${m.icon}</span>
            <span>${escapeHtml(m.name)}</span>
            <span class="help-module-tab-tag">tab: ${m.tab}</span>
          </div>
          <div class="help-module-purpose">${escapeHtml(m.purpose)}</div>
          <div class="help-expand-arrow">▼</div>
        </div>
        <div class="help-module-body">
          <div class="help-section">
            <div class="help-section-title">💡 设计初心</div>
            <div class="help-section-content">${escapeHtml(m.intent).replace(/\n/g, '<br>')}</div>
          </div>
          <div class="help-section">
            <div class="help-section-title">⚡ 主要功能</div>
            <ul class="help-feature-list">
              ${m.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
            </ul>
          </div>
          ${m.tips && m.tips.length > 0 ? `
            <div class="help-section help-tips">
              <div class="help-section-title">💎 使用技巧</div>
              <ul class="help-feature-list">
                ${m.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('')}
  `;
}

function renderVersionSection() {
  return `
    <div class="help-intro">
      <h2 style="margin:0 0 10px 0;">📜 版本迭代记录</h2>
      <div style="color:var(--text-secondary); font-size:13px;">
        每次系统更新都会记录在这里 · 当前版本 <b>${escapeHtml(VERSION_LOG[0].v)}</b> · ${escapeHtml(VERSION_LOG[0].date)}
      </div>
    </div>
    <div class="help-version-timeline">
      ${VERSION_LOG.map((v, i) => `
        <div class="help-version-item ${i === 0 ? 'latest' : ''}">
          <div class="help-version-marker"></div>
          <div class="help-version-content">
            <div class="help-version-header">
              <span class="help-version-num">${escapeHtml(v.v)}</span>
              <span class="help-version-date">${escapeHtml(v.date)}</span>
              <span class="help-version-type help-version-${v.type}">${v.type === 'feature' ? '✨ 新功能' : (v.type === 'fix' ? '🔧 修复' : '📝 改进')}</span>
              ${i === 0 ? '<span class="help-version-current">当前版本</span>' : ''}
            </div>
            <div class="help-version-title">${escapeHtml(v.title)}</div>
            <ul class="help-version-notes">
              ${v.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
            </ul>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderBugSection() {
  return `
    <div class="help-intro">
      <h2 style="margin:0 0 10px 0;">🐛 Bug 反馈指南</h2>
      <div style="color:var(--text-secondary); font-size:13px;">
        发现 bug 不丢人 · <b>提不清 bug 才是真的耽误事</b>。
      </div>
    </div>
    
    <div class="help-section" style="background:linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.08)); padding:18px 20px; border-radius:10px; border:1px solid rgba(37,99,235,0.2);">
      <div style="display:flex; gap:12px; align-items:center;">
        <div style="font-size:42px;">💬</div>
        <div style="flex:1;">
          <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">✨ 推荐 · 在系统内直接提反馈</div>
          <div style="font-size:13px; color:var(--text-secondary); line-height:1.6;">
            点顶部「💬 反馈」tab → 填表单 → 截图 Ctrl+V 粘贴 → 提交 · 完事。
            <br>老板会用 Claude 分析所有反馈 · 确认后立即修复 · 完成后你会看到状态变绿 ✅
          </div>
          <button class="btn primary" style="margin-top:10px;" onclick="closeHelpManual(); switchTab('feedback'); setTimeout(feedbackOpenNew, 300);">
            💬 立刻打开反馈中心
          </button>
        </div>
      </div>
    </div>
    
    <div class="help-section help-bug-template">
      <div class="help-section-title">📋 也可以用这个标准模板发到群里(如果反馈中心暂时打不开)</div>
      <div style="position:relative;">
        <button class="btn small" style="position:absolute; top:8px; right:8px; z-index:2;" onclick="copyBugTemplate(this)">📋 复制模板</button>
        <pre id="bugTemplateBox">${escapeHtml(BUG_REPORT_TEMPLATE)}</pre>
      </div>
    </div>
    
    <div class="help-section">
      <div class="help-section-title">📚 详细指引(无论你用反馈中心还是群里发,这些都适用)</div>
      ${BUG_GUIDELINES.map(g => `
        <div class="help-bug-guide">
          <div class="help-bug-guide-title">${escapeHtml(g.title)}</div>
          <div class="help-bug-guide-body">${escapeHtml(g.body).replace(/\n/g, '<br>')}</div>
        </div>
      `).join('')}
    </div>
    
    <div class="help-section help-contact">
      <div class="help-section-title">🔄 反馈闭环流程</div>
      <ol style="margin:0; padding-left:20px; font-size:13px; line-height:1.8;">
        <li><b>提交</b>:你在反馈中心填表 → 系统存到云端</li>
        <li><b>导出</b>:老板点「📤 导出给 Claude」→ 复制结构化 JSON</li>
        <li><b>分析</b>:粘贴给 Claude → Claude 分析每条根因/方案/工作量/风险</li>
        <li><b>确认</b>:老板回 Claude "确认 #1 #3 #5,跳过 #2"</li>
        <li><b>实施</b>:Claude 改代码 → 升版本号 → 给新文件</li>
        <li><b>部署</b>:老板推到生产 → 在反馈中心点「✅ 已修复 in v20260526a」</li>
        <li><b>通知</b>:你看到自己提的反馈状态变绿 ✅</li>
      </ol>
    </div>
  `;
}

function renderRoadmapSection() {
  return `
    <div class="help-intro">
      <h2 style="margin:0 0 10px 0;">🚀 功能路线图</h2>
      <div style="color:var(--text-secondary); font-size:13px;">
        对标店小秘 / 旺店通 / 易仓 等 ERP · 我们的优势 + 已解决痛点 + 下批迭代计划
      </div>
    </div>
    
    <div class="help-section">
      <div class="help-section-title">🏆 相比店小秘等通用 ERP · 我们的优势</div>
      <div class="help-advantage-grid">
        ${ROADMAP.advantages.map(a => `
          <div class="help-advantage-card">
            <div class="help-advantage-icon">${a.icon}</div>
            <div class="help-advantage-title">${escapeHtml(a.title)}</div>
            <div class="help-advantage-desc">${escapeHtml(a.desc)}</div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div class="help-section">
      <div class="help-section-title">✅ 已解决的常见痛点</div>
      <div class="help-solved-grid">
        ${ROADMAP.solvedPainPoints.map(p => `<div class="help-solved-item">${escapeHtml(p)}</div>`).join('')}
      </div>
    </div>
    
    <div class="help-section">
      <div class="help-section-title">🔮 下批迭代(规划中)</div>
      <div style="font-size:12.5px; color:var(--text-tertiary); margin-bottom:10px;">这些功能下面这些已经在路线图上 · 优先级和顺序你可以指挥 Claude 调整</div>
      ${ROADMAP.upcoming.map(u => `
        <div class="help-upcoming-card">
          <div class="help-upcoming-header">
            <span class="help-upcoming-icon">${u.icon}</span>
            <span class="help-upcoming-name">${escapeHtml(u.name)}</span>
            <span class="help-upcoming-eta">⏱ ${escapeHtml(u.eta)}</span>
          </div>
          <div class="help-upcoming-desc">${escapeHtml(u.desc)}</div>
        </div>
      `).join('')}
    </div>
    
    <div class="help-section help-claude-can">
      <div class="help-section-title">🤖 Claude AI 助手当前能做的(就在此刻)</div>
      <div class="help-claude-grid">
        ${ROADMAP.claudeCanDo.map(c => `<div class="help-claude-item">${escapeHtml(c)}</div>`).join('')}
      </div>
      <div style="margin-top:12px; padding:12px; background:rgba(37,99,235,0.06); border-radius:6px; font-size:12.5px;">
        💡 <b>怎么用</b>:主管 / 老板 把需求发到群里 → Claude 当天或次日改完 → 强刷生效。
        你想加什么、改什么、修什么 · 直接说。 不用排期 / 不用立项 / 不用预算审批。
      </div>
    </div>
  `;
}

// 复制 Bug 模板
function copyBugTemplate(btn) {
  const text = BUG_REPORT_TEMPLATE;
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = '✓ 已复制';
    setTimeout(() => { btn.textContent = old; }, 1500);
  }).catch(() => {
    toast('复制失败 · 请手动选中复制', 'err');
  });
}

// escapeHtml 兜底(防止 utils.js 还没加载)
if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
}
