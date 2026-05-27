// ╔═════════════════════════════════════════════════════════╗
// ║   SUPABASE 配置                                          ║
// ║   登录后 [团队] → "Supabase 配置教程" 一步步设置          ║
// ║   配置成功后下面两行填上你的 URL 和 anon key             ║
// ╚═════════════════════════════════════════════════════════╝
const SUPABASE_URL = "https://xyhbwqugbnowfjuhqhsj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Z0dXXZivG5QI-FCbwELxEA_JZBNx2Hn";

// ====================== v22-DJ: 版本号系统 ======================
// 每次重大更新递增 · 在登录页 / Header / 使用手册显示
const APP_VERSION = {
  number: 'v22-ES',
  releaseDate: '2026-05-27',
  major: '2026.05.27 第 39 次更新',
  changes: [
    { v: 'v22-ES', date: '2026-05-27', title: '🔧 修保存报错 invalid input syntax for type uuid',
      items: [
        '诊断：截图错误 invalid input syntax for type uuid "mpnik99p9sznp" / "mpnrmmrshncxf" 是 Date.now().toString(36) 格式的短 ID · 不符合 UUID 标准',
        '根因 1（代码）：saveComponent / savePaymentReceipt / saveCrossDeptMessage 用 item.id || uuid() · 旧记录 id 是短串 → 直接送进 UUID 列',
        '修：3 个函数全改 ensureUuid(item.id) · 不是合法 UUID 就生成新的',
        '根因 2（数据库）：部分表的 user_id / designer_id / sales_id / photographer_id 等列被建成 UUID 类型 · 但用户 ID 是 TEXT（"wjx" "lmx"）',
        '⚠️ 需运行 SQL：v22-ES-fix-uuid-columns-to-text.sql · 把 9 张表 16 个相关列的 UUID 类型转 TEXT · 幂等（已是 TEXT 的不动）',
        '运行后看末尾验证 SELECT · 所有列应该都是 text · 不是 uuid'
      ]
    },
    { v: 'v22-ER', date: '2026-05-27', title: '✨ AI 评价图去 C 位 + 单条重新优化',
      items: [
        '评价图提示词加强：产品占比 30-50% → 20-40% · 大头是房间/场景而非产品本身',
        '4 个默认变体重写：① 远景房间（产品 off-center + 房间为主） ② 仰拍天花板 ③ 强偏角侧拍（透视纵深） ④ 局部 + 周边生活物件',
        'AVOID 列表加 ❌ 产品 C 位 / ❌ Hero shot / ❌ 4 张构图相同',
        '强制每张变体框架不同 · 不再 4 张全是中景居中',
        '单条评价加 ✨ 重新优化 按钮（紫色）· 在 🎲 换名 / 🗑 删除 中间',
        '点击只重生成 标题 + 正文 + 店家回复 · 保留姓名/评分/日期/已生成的图片 · 不会覆盖整批',
        '安全确认：当前正文非空时弹框确认 · 防误覆盖',
        '本次仅改 09-reviews.js · 不动 AI 生图（设计部）模块的提示词'
      ]
    },
    { v: 'v22-EQ', date: '2026-05-27', title: '📊 统计可点 + 待拍摄原因 + 备注审计',
      items: [
        '5 个总数统计卡（总数/待拍摄/剪辑中/待上传/已完成）全部改为可点击 · 一键切到对应状态筛选 · 不用再去下方手动找',
        '6 个 KPI 个人卡片（何世鹏/郭和聪等）改为可点击 · 按员工 title 自动判断填 摄影师/剪辑师/上传者 筛选 · 直接看这个人的所有相关记录',
        '新增「📌 待拍摄原因」chip 在表单 Step 2 · 8 个预设：售后换货 / 维修中 / 工作太多遗漏 / 等供应商发样 / 等客户提供资料 / 产品有问题 / 设备占用 / 低优先级 · 加自定义文字框',
        '只在 status=待拍摄 或 草稿 时显示 · 拍完就不打扰',
        '列表卡片上显示 📌 卡住原因徽章 · 主管扫一眼就知道为啥这条压了那么久',
        '备注审计：编辑保存时若 notes 被清空 / 修改 / 新增 · 自动写一条 photo_log_notes_changed 操作日志 · 留痕谁改了什么时候改 · 含改动前后 200 字摘要 · 在管理员操作记录里能查',
        '⚠️ 需运行 SQL：v22-EQ-add-pending-reason-column.sql · 给 photo_logs 加 pending_reason TEXT 一列'
      ]
    },
    { v: 'v22-EP', date: '2026-05-27', title: '🔧 修日期筛选默认错 + 销售"✓成交"按钮误导',
      items: [
        '修：拍摄部时间筛选默认是"最近活动"（updated_at）· 几乎每条记录都被刚刚编辑过 · 不管选近 15 / 30 / 60 天结果都一样',
        '改：默认改成"创建时间"（created_at）· 切换近 X 天能真的过滤掉旧记录 / 留下新记录',
        '推荐标也从"最近活动"挪到"创建时间" · "最近活动"加了 ⚠️ 提示说筛选意义不大',
        '修：销售部"✓ 成交"按钮 bug · 之前检查 log.inquiry_status（不存在字段 → 永远 undefined） · 改成 log.status · 已成交记录不再重复显示按钮',
        '改：按钮文字"✓ 成交"（绿色实心按钮 · 像状态徽章）→ "📋 推进订单"（绿色描边按钮 · 一眼就知道是操作）· 不再让人误以为客户已成交',
        '帮助文档同步更新'
      ]
    },
    { v: 'v22-EO', date: '2026-05-27', title: '🎬 视频审核工作流 · 一键汇报 · 老板/主管审核',
      items: [
        '新增"📨 提交审核"按钮 · 在拍摄部列表里 status=已剪辑 的记录卡片上 · 拍摄部 / 摄影主管 / admin 可见',
        '点提交 · 弹审批人选择 modal · 默认勾上 Martin / 罗燕秋 / 摄影主管黎俊杰 · 可改',
        '审批人首页顶部出现 "🎬 待审核视频 (N)" 紫色模块 · 列出所有 reviewer 包含自己的待审核记录',
        '点"🎬 去审核" → 弹大 modal · 内嵌视频预览（网盘 / YouTube / IG / FB · 不支持的显示"在新窗口打开"）',
        '审核 modal 内填反馈说明 + 截图（支持粘贴拖拽 · 缩略图点击大图预览）· 然后选 "✅ 通过" 或 "⚠️ 反馈问题"',
        '通过 → 列表状态变 ✅ 已通过审核（绿）· 拍摄部知道可以上传了',
        '反馈 → 列表状态变 ⚠️ 审核未通过（红）· 显示反馈摘要 · 点 "查看详情" 看完整说明 + 截图大图 · 点 "🔄 修改后重新提交" 重走审核流程',
        '⚠️ 需运行 SQL：v22-EO-photo-review-workflow.sql · 给 photo_logs 加 review JSONB 列 + 状态索引'
      ]
    },
    { v: 'v22-EN', date: '2026-05-27', title: '👥 上传权限放开 · 美工+拍摄部都能直接接活',
      items: [
        '去多余文字：筛选区"📊 状态筛选 ↓ 多选 chip 在下方"提示已过时（状态早改单选了）· 直接删',
        '调整派单权限：剪辑完成的视频 · 美工部 + 拍摄部 + 设计师 + 管理员 都能看到 ·「待上传」队列展示所有',
        '我的优先：派给自己的排前面 + 加 👤 派给我 徽章 · 别人的在下面 + 显示 📤 派给XX',
        '帮兜底按钮：派给别人的记录上显示「🤝 我帮 TA 传」绿色按钮 · 拍摄部空闲时可主动接美工的活 · 反之亦然',
        '兜底后自动改派：谁实际点了上传完成 · uploader 自动改派给那个人 · KPI 算账不错位',
        '权限规则：tier ∈ {official, newbie, alibaba_artist, designer, photo_team} OR role=admin · 才能看全部待上传 · 其他角色仍只看派给自己的'
      ]
    },
    { v: 'v22-EM', date: '2026-05-27', title: '↩ 状态可任意前进/退回 · 修正错误专用',
      items: [
        '修：保存按钮之前还要求填产品名才能启用（与 v22-EK 改可选矛盾）· 现在产品名空也能直接保存',
        'Step 4 状态选择从下拉 select 改成 7 个 chip 网格 · 全部阶段一眼可见 · 任意切换',
        '当前状态之前的阶段 chip 显示为琥珀色 ↩ 标识 · 提示"可点击回退到此阶段"',
        '加快捷按钮：「↩ 退回上一阶段（XX）」· 一键回退当前状态前一步',
        '加常用快捷：「⏪ 退回到剪辑前」· 从已剪辑/上传中/已完成 任何状态一键回到已拍摄',
        '为什么需要：上传完成后发现剪辑或摄影有错 · 之前没显式的状态回退入口 · 现在可在编辑表单 Step 4 一键退回任意阶段重做'
      ]
    },
    { v: 'v22-EL', date: '2026-05-27', title: '📕 小红书发布渠道 + IG/FB 可内嵌预览',
      items: [
        '发布渠道新增 📕 小红书 · 在 Step 4 状态备注 → 多平台 URL 区域 · 一行两列布局',
        '小红书 URL 支持：xiaohongshu.com/explore/... · xhslink.com/... · xhscdn.com/...',
        '小红书无官方 iframe embed · 点预览按钮会弹一个"在新窗口打开"按钮 · 跳到原页面看',
        'Instagram 帖子 / Reels：自动识别 /p/xxx · /reel/xxx · /tv/xxx · 转 /embed 后缀 · 内嵌预览类似 YouTube',
        'Facebook 视频：自动套用官方 video plugin URL（plugins/video.php）· 公开视频可内嵌预览',
        '列表卡片 + 网格视图 都加了 📘 FB ▶ + 📕 小红书 ▶ 按钮',
        '⚠️ 需运行 SQL：v22-EL-add-xiaohongshu-column.sql · 给 photo_logs 加 url_xiaohongshu 一列'
      ]
    },
    { v: 'v22-EK', date: '2026-05-27', title: '📦 产品类型 + 产品备注 + 列表排序',
      items: [
        '产品名改为可选 · 删 * 红星 · 留空时按产品类型自动命名（如「样品 · 2026/5/27」）',
        '新增 📦 产品类型 chip 快选：常规产品 / 样品 / 新款 / 现货款 / 试拍 / 其他 · 装样/试拍场景不用纠结取名',
        '新增 📝 产品基础备注（独立于状态备注）· 写客户要求 / 材质 / 配件 · 与流程状态备注分开互不污染',
        '列表加排序 · 类似资源管理器：📝 最近修改 / 🆕 创建时间 / 📷 拍摄日期 / 🎬 剪辑日期 / 📤 上传日期 / 🔤 产品名 A→Z / 📊 状态进度',
        '加 ↑正 ↓倒 方向按钮 · 偏好存 localStorage · 下次进入自动延续',
        '⚠️ 需运行 SQL：v22-EK-add-product-type-notes-columns.sql · 给 photo_logs 加 product_type + product_notes 两列 · 不跑列不存在保存会失败'
      ]
    },
    { v: 'v22-EJ', date: '2026-05-27', title: '🎯 状态筛选回归严格单选 · 一目了然',
      items: [
        '取消多选 · 取消累计模式 · 取消"仅当前阶段"开关 · 删掉 filterStatusInclusive 状态 · 整体简化',
        '单选语义：点未选的 chip → 只显示该状态记录；再点同个 chip → 取消回到 全部；点 全部 → 不筛选',
        '每个 chip 后面带数字 · 显示该状态下有几条记录 · 不点也能预览数量',
        '右侧提示文字简化为"🎯 严格匹配 · 仅显示「XX」"',
        '为什么要回退：v22-ED 的累计模式（点 已拍摄 显示后续所有阶段）违反直觉 · 点 剪辑中 却显示 已剪辑/上传中 让人困惑 · 严格匹配更符合"看哪个点哪个"的直觉'
      ]
    },
    { v: 'v22-EI', date: '2026-05-27', title: '🌟 张欣怡个人独立流程 · 全流程自营',
      items: [
        '张欣怡 (zxy) 在 TEAM_USERS 加 selfServiceUploader: true 标记 · title 改为"实习摄影 · 全流程自营"',
        '新建表单：她登录建新记录时 · 拍/剪/传 三个字段自动填她自己 · 顶部 banner 提示',
        '人员下拉：她的名字后面带 🌟 · 任何字段选了她时 · 空的另两个字段也自动跟上（手动填的不覆盖）',
        '自动派单：findUploaderForShops 加 log+users 参数 · 摄影/剪辑是 zxy 时优先派给她 · 不走 shop_owners 抢美工资源',
        '美工接手：列表卡片"📤 立即派单"按钮仍可手动改派给任何美工 · 美工有空时不挡路',
        '我的上传队列模块：兼容 Supabase snake_case 字段 · 她登录后能看到自己待上传的所有记录'
      ]
    },
    { v: 'v22-EH', date: '2026-05-27', title: '🔧 5 项体验修复 · 反馈页/派单/职责多选/网盘智能/附件预览',
      items: [
        '修反馈页空白：UserFeedbackPage 之前 sed 误伤了 filterStatus → filterStatuses · 进 #feedback 直接挂 · 已修',
        '加快速派单：拍摄部"⚠️ 未派单"警告升级为"📤 立即派单"按钮 · 弹窗选任意上传员 · 不用走整个表单 · 适用于安排加班同事补传场景',
        '加一键补派：admin/主管 进拍摄部顶部多 "🔄 一键补派 N" 按钮 · 扫描所有未派单的历史记录 · 按当前 shop_owners 规则批量自动分配 · 没匹配上的提示手动派',
        '职责改多选 checkbox：网站归属维护表单职责字段从单选 select 改成多选 checkbox · 助理可一次配齐 主负责+视频上传+备用 三个角色 · 矩阵展开自动建多条',
        '多职责合并显示：网站归属列表里同一人多职责合并成一行 · 显示所有角色徽章 · 编辑时自动勾上所有职责 · 删除整组一次性清干净',
        '网盘路径智能显示：长路径中间省略（保留头尾）· HTTP 链接直接打开 · UNC 路径 \\\\192.168.x.x\\... 点击复制到剪贴板 · 2 秒后按钮文字自动还原',
        '附件 lightbox 预览：所有 AttachmentPanel 缩略图改 click-to-zoom · 大图全屏模态 · 左右切换 · 下载按钮 · 不再依赖 target=_blank 新标签'
      ]
    },
    { v: 'v22-EG', date: '2026-05-27', title: '🐛 设计师表单保存失败 + 拍摄部 list/grid 双视图',
      items: [
        '修设计师工作日志保存失败 · 根因：Supabase designer_work_logs 表的 designer_id / reviewed_by 列被建成 UUID 类型 · 但应用里用户 ID 是 TEXT（"wjx" "lmx" "mpnik99p9sznp"）· 类型不匹配',
        '⚠️ 务必先执行 SQL：v22-EG-fix-designer-work-logs-column-types.sql · 一行 ALTER COLUMN 改两列类型为 TEXT · 不丢数据',
        '拍摄部加视图切换：📋 列表 / 🖼️ 网格 · 偏好存 localStorage · 切换无需刷新',
        '网格视图：1:1 大图缩略 · 2/3/4/5 列响应式 · 状态/待上传角标叠在图上 · 关键信息（产品名/SKU/3 个里程碑日期/视频类型/店铺/拍剪传人/平台链接/编辑上传按钮）· 一目了然',
        '列表视图保持原结构 · 用户切到网格视图能立刻避免拥挤'
      ]
    },
    { v: 'v22-EF', date: '2026-05-26', title: '🎥 剪辑阶段视频类型改 chip 折叠按钮 · 所有类型一眼可见',
      items: [
        '剪辑阶段视频类型从下拉 select 改成 chip 折叠按钮 · 7 种预设 + 历史用过的 + 🔧 自定义 全部一眼可见',
        '色阶区分：紫色 = 内置 7 种预设 · 蓝色 = 历史用过的自定义 · 橙色 = 当前自定义模式',
        '点 🔧 自定义 · 下方弹出输入框 · 填新类型直接保存 · 其他人下次也能在 chip 行看到',
        '兼容旧记录：之前用过的所有自定义类型都会以蓝色 chip 显示在历史区',
        '筛选区视频类型暂保持 select 模式 · 仍支持 🔧 自定义 输入'
      ]
    },
    { v: 'v22-EE', date: '2026-05-26', title: '🎥 视频类型扩展 · 加 IG/FB/小红书 · 表单和筛选保持一致',
      items: [
        '内置预设从 4 种扩到 7 种：展示视频 / 安装视频 / 开箱视频 / 工厂视频 / ins 视频 / facebook 视频 / 小红书视频',
        '表单（剪辑阶段 step 3）改为 select + 自定义触发模式 · 7 种预设 · 历史类型（带"历史"后缀）· 最后 🔧 自定义选项',
        '筛选下拉也是同样的结构 · 表单和筛选完全一致 · 让用户预期对得上',
        '选「🔧 自定义」会出现输入框 · 填新类型 · 保存后下次别人能直接选到（自动归入"历史"组）',
        '兼容旧记录：历史已用过但不在预设里的类型会自动出现在下拉里 · 不丢数据'
      ]
    },
    { v: 'v22-ED', date: '2026-05-26', title: '🎯 状态筛选改累计语义 · 修广告页 sed 误伤 · 完整包',
      items: [
        '修拍摄部状态 chip 筛选 · 默认改为「累计语义」：按"已拍摄"也会显示已剪辑/上传中/已完成的记录（因为后续阶段隐含已经经过了拍摄）',
        '加 🎯 仅当前阶段 toggle · 想要严格匹配只看当前阶段也行',
        '修第 2 处 sed 误伤 · 广告视频需求页面之前 filterStatus 也被错改成 filterStatuses · 已恢复',
        '本轮交付完整代码包 · 所有 .js + index.html + quotation.html · 一次替换不再积累 cache 错配'
      ]
    },
    { v: 'v22-EC2', date: '2026-05-26', title: '🚨 hotfix · 销售页打不开（filterStatuses is not defined）',
      items: [
        '上一轮改拍摄部多选状态时 sed 误伤了销售页 / 回单页 · 让 SalesLogPage 引用了不存在的 filterStatuses',
        '症状：进 #sales-log 直接白屏 · Console 报 ReferenceError',
        '已回滚销售页/回单页的 4 处引用 · 仅拍摄部用 filterStatuses 多选 · 销售页保留单选 filterStatus'
      ]
    },
    { v: 'v22-EC', date: '2026-05-26', title: '🔙 浏览器返回不再"假退出"账号',
      items: [
        '根因 1：setView 用 history.replaceState · 整个 app 在浏览器历史里只占 1 条 · 返回直接跳出 app',
        '根因 2：返回后页面刷新 · React state 重置 currentUser=null · 闪一下登录页给"被退出"错觉',
        '修 1：setView 改用 pushState · 每次切换页面都加一条历史条目 · 返回在 app 内部走（home ← sales ← team ...）',
        '修 2：检测到 localStorage 有 session 但 users 还没拉完时 · 显示"⚙️ 正在恢复登录状态..." loading · 不闪登录页',
        'session 还在的话约 500ms 自动恢复 · 全程不需要重新输密码'
      ]
    },
    { v: 'v22-EB', date: '2026-05-26', title: '🔐 密码同步 bug · 根因修复（多浏览器登录不上 / 改完密码失效）',
      items: [
        '根因 1：app_config 表 upsert 没有指定 onConflict:"key" · 主键如果不是 key 字段就会创建重复行 · 后续读取可能读到老行',
        '根因 2：改密码用 saveConfig({users: 整数组}) 覆盖 · 本地 React state 中其他用户的 pwdHash 是过时数据 · 会把别人的新密码覆盖回老密码',
        '根因 3：handleLogin 只比对本地 users state · 如果实时同步还没刷到，会用过时的 pwdHash 判定 → 错判为密码错误',
        '修 1：所有 app_config upsert 加 onConflict:"key" · 启动时自动清除已有的重复行（按 updated_at 留最新）',
        '修 2：新增 saveUserPassword 原子方法 · 拉 DB 最新 → 改一条 → 写回 · 完全不动其他用户',
        '修 3：登录失败时自动用 DB 实时校验密码兜底 · 同时刷新本地 state · 多浏览器场景再也不会本地缓存过时',
        '已用新接口的入口：改自己密码 · admin 重置员工密码 · 首次登录强制改密码（3 个全部覆盖）'
      ]
    },
    { v: 'v22-EA', date: '2026-05-26', title: '🔧 拍摄部表单 + 销售附件多项修复',
      items: [
        '✅ 拍摄表单：4 阶段自由切换 · 没填产品名也能保存（自动用「未命名 + 日期」占位 · 后续慢慢补）',
        '✅ 状态筛选改成多选 chip · 可同时按"已剪辑+上传中+已完成"等组合 · 之前单选会漏匹配',
        '✅ 卡片显示 3 个关键日期：📷 拍摄 / 🎬 剪辑 / 📤 上传 · 一眼看到进度时间',
        '✅ "📤 我已上传"按钮：admin 也能看到 · 未派单的卡片直接手动标记完成 · 不卡死等系统派单',
        '✅ AttachmentPanel 粘贴 v2：第一个面板自动 claim · 单面板表单粘贴不用先点击（销售 3 面板表单第一次粘贴默认到顶部"附件"区）',
        '✅ "拍摄已确认"复选框降级为可选 · 不勾也能进剪辑阶段',
        '🔬 调研：密码问题 / 多窗口问题 需要更多信息 · 见本轮回复底部说明'
      ]
    },
    { v: 'v22-DZ', date: '2026-05-26', title: '📋 报价单瘦身 · 装箱字段折叠 · 常用场景表格更清爽',
      items: [
        '报价单产品表默认只显示 6 列：SKU / Description / Image / Qty / Unit Price / ✕',
        '隐藏 7 个装箱字段：Carton No / L / W / H / N.W. / G.W. / Meas（cbm）· 常用场景 90% 用不上',
        '需要时勾顶部黄色高亮 toggle 「📦 显示装箱单字段（7 列）」· 一键展开 · 状态记忆',
        '原"装箱单显示长宽高"toggle 升级为总开关 · 同时控制表单 7 列 + PDF L/W/H 列',
        '加 iframe cache-buster · 报价单 HTML 改动随主版本号自动失效 · 不再手动强刷'
      ]
    },
    { v: 'v22-DY', date: '2026-05-26', title: '🐛 修两个销售模块严重 bug',
      items: [
        '修 1 · 销售询盘表单粘贴附件复制到所有 3 个面板的 bug（顶部附件 + 买家特征 + 客户浏览）',
        '原因：AttachmentPanel 用 window.paste 监听 · fallback 到 document.body 时 3 个面板全部命中',
        '现在：用 onMouseDown 标记 "最近活跃" 面板 · 粘贴只去那一个 · 多面板互不干扰',
        '修 2 · "✓ 成交" 弹窗保存后状态根本没变更 / 跟进笔记里的成交备注丢失',
        '原因：QuickDealModal 回调里字段名错（用了 inquiryStatus / detailedNotes 等不存在的字段）· saveSalesLog 看不到这些字段 · status 默认回退到 inquiry',
        '现在：字段名对齐 saveSalesLog（status / followUpNotes / nextFollowUpDate 等）· 成交备注用状态 label 标记（如 [2026-05-26 ✍️ 已下单] 客户确认 50% 定金）',
        '修 3 · 成交弹窗默认状态用 log.status（不再读不存在的 log.inquiry_status）· 智能默认：当前是订单阶段保持现状 · 否则起步"已下单"'
      ]
    },
    { v: 'v22-DX', date: '2026-05-26', title: '🔖 设置中心置入侧边栏底部 · 版本号常驻 · 帮你排查部署',
      items: [
        '侧边栏底部加 ⚙️ 设置中心 入口（橙色突出 · 比"自定义布局"亮）· 只要有 settings 权限就显示',
        '侧边栏底部加版本号常驻显示 · 每页都能看到当前版本 · 截图即知',
        '弹窗标题（如店铺负责人管理）右侧加 v22-XX 版本号 · 弹窗内部排查',
        '如果你看到的版本号 < v22-DV · 说明 02-shell.js 没部署上 · 多选 UI / 设置中心 / 自动派单 都出不来',
        '如果版本号 ≥ v22-DV 但 UI 没变 · 浏览器缓存 · Cmd+Shift+R 强刷'
      ]
    },
    { v: 'v22-DW', date: '2026-05-26', title: '🚀 拍摄部 → 美工 · 自动派单工作流',
      items: [
        '剪辑完成时（status 切到 edited）· 系统自动按 applicableShops × shop_owners 查美工 · 优先级 uploader → primary → backup · 自动填 photo_logs.uploader_id/uploader_name',
        '保存后弹窗告知派给了谁 + 按哪个 shop 的哪个角色匹配 · 没匹配上的提示"去 ⚙️ 设置 → 网站归属维护 补一下"',
        '拍摄部列表卡片加 📤 已派给 XXX 徽章（status=edited）· 没派单的显示 ⚠️ 红色提示 · 主管一眼看出哪些被遗漏',
        '美工主页顶部加 📥 待我上传 模块 · 自动列出派给我的 status=edited 视频 · 缩略图 + SKU + 应用店铺 + 网盘链接 · [📤 上传完了] 按钮直接弹简化版上传表单',
        '简化版上传表单：上传日期 + 主上传网站 + 多平台 URL（YouTube 横竖方 + IG + TT + FB + Pin）+ 独立站嵌入证明（状态/URL/截图）· 提交后状态自动变 🎉 done（齐了）或 ⬆️ uploading（半成品）',
        '没派单 + 没积压时模块自动隐藏 · 不占空间不打扰',
        '不需要数据库变更 · 复用已有的 uploader_id / uploader_name / url_* / embed_* 字段'
      ]
    },
    { v: 'v22-DV', date: '2026-05-26', title: '⚙️ 设置中心 · 一站式收口 · 店铺负责人支持批量多选',
      items: [
        '加 ⚙️ 设置中心 独立菜单项（管理组）· admin / supervisor 可见 · 把分散在不同页面的设置类操作收口',
        '设置中心包含 4 张卡：👥 团队管理 · 🌐 网站归属维护 · 🏪 店铺基础信息 · ⏰ 跨部门超时阈值',
        '团队 / 网站归属 卡跳转到独立页面 · 店铺基础 / 超时阈值 卡直接打开弹窗',
        '后续新加的设置类配置（通知偏好 / 显示偏好等）都从设置中心加卡 · 不再各处零散藏入口',
        '兼容性：原本各页面里的入口按钮都保留 · 设置中心是 "+1" 的新入口 · 不破坏老路径',
        '🔥 店铺负责人添加表单升级 · 网站和负责人都改成 checkbox 网格多选 · 一次操作按 N×M 矩阵展开批量插入 · 主管不用一条条加',
        '加 全选 / 清空 / 已选 N 个 / 自动跳过重复 · 提交按钮显示"添加 X 条"实时计数',
        '编辑现有记录时仍是单选（每条记录只对应 1 个 shop × 1 个人 × 1 个 role）'
      ]
    },
    { v: 'v22-DU', date: '2026-05-26', title: '🔥 修销售日报打开崩溃 · 附件对象兼容 · 店铺负责人加 uploader 角色 · 独立菜单入口',
      items: [
        '销售日报 #sales-log 点开报错 (url || "").toLowerCase is not a function · 是因为附件存储升级成了对象 {id,name,mime,dataUrl} · 但渲染处还在当 string 用',
        '加 attachmentUrl() / attachmentName() 兼容工具 · 老数据是 string · 新数据是对象 · 自动取 .url / .dataUrl / .data_url / .publicUrl',
        '修 3 处崩溃：03-home.js PendingReportsModule · 03-home.js MultiAttachmentField · 10-image-team.js 销售卡片附件渲染',
        '店铺负责人维护（ShopOwnersManager）加 uploader 视频上传角色 · 之前只有 primary/backup/manager/designer 4 种 · 现在 5 种 · 派单/上传分别用不同优先级 fallback',
        '弹窗顶部加派单优先级说明：工单 → 主负责 → 备用 → 主管 | 视频上传 → 视频上传 → 主负责 → 备用',
        '🌐 网站归属维护 加独立侧边栏菜单项 · 之前只藏在跨部门协作页面头部按钮里 · 用户找不到 · 现在 admin/supervisor 直接侧边栏点',
        '同样的 pattern 以后只要拿 attachmentUrl(item) 就稳了 · 不会再因数据 schema 变化崩'
      ]
    },
    { v: 'v22-DT', date: '2026-05-26', title: '🖼️ AI 生图也强制 normalize 成 JPEG · 对齐 Judge.me 格式要求',
      items: [
        'Judge.me 严格只接 .jpg/.jpeg/.png · AI 图之前文件名固定 .jpg 但内容可能是 PNG / WEBP（OpenAI gpt-image-1 偶尔 webp · Gemini 一般 png）· URL 扩展和 Content-Type 不一致或直接是 webp 都会让 Judge.me 拒绝',
        '所有 AI 生图先过 canvas 重编码成 JPEG · 0.85 质量 · 1600px 上限 · 再上传 Supabase · 现在 URL .jpg + Content-Type image/jpeg + 内容也是 JPEG 三者一致',
        '副作用：单图大小从 PNG 的 1-3 MB 降到 JPEG 的 200-400 KB · Judge.me 抓图更快 · 但视觉上肉眼无差别（买家秀够用）',
        '手动上传那条路径之前已经过 compressImageDataUrl（v22-DS · 也是 JPEG）· 这次只补 AI 那条'
      ]
    },
    { v: 'v22-DS', date: '2026-05-26', title: '🔧 评价手动上传图改走 Supabase · 修 Judge.me 显示不出图的潜在坑',
      items: [
        '评价编辑卡的"📷 上传"按钮 · 之前直接把图存成 base64 data URL · 这种 URL 在 Judge.me CSV 100% 不显示',
        '现在和 AI 生图同走 Supabase Storage：压缩→上传 attachments bucket→拿 public URL→存到 picture_urls',
        '上传中按钮变蓝色 ⏳ "上传中"提示 · 防止用户连点 + 看得到进度',
        '上传失败有降级：仍能存本地 base64 预览，但弹窗明确告诉用户"CSV 导出后 Judge.me 不显示这张图"',
        'storageRef 不可用时也提示用户 · 之前是静默 fallback'
      ]
    },
    { v: 'v22-DR', date: '2026-05-26', title: '📅 时间筛选大升级 · 本周/上周/本月/上月 + 指定月份周中周',
      items: [
        'DATE_RANGE_PRESETS 加 4 个新选项：本周 · 上周 · 本月 · 上月（其它用 DateRangeChips 的页面也自动拿到 · 销售/付款/操作留档等）',
        '上周/上月 这种过去时间段是闭区间 · 不能像"近 N 天"那样只算 start · 新加 getDateRangeBounds() 返回 {start, end}',
        '加 MonthWeekPicker 组件 · 指定 YYYY-MM + 整月/第1-5周（周定义 1-7/8-14/15-21/22-28/29-月底 · 不跨月）',
        '拍摄部页面接上 MonthWeekPicker · 设了月份就覆盖快捷条 chips（视觉灰显提示）· 加"工作内容汇总"标签显示当前生效范围 + 起止日期 + 总条数',
        '总数统计卡（总数/待拍摄/剪辑中/待上传/已完成）自动跟着新筛选走 · 即"汇总"',
        '其它页面（销售日报/付款回单/操作留档）默认只拿到 4 个 chips 增量 · 需要月份/周中周再单独接（这次只接拍摄部）'
      ]
    },
    { v: 'v22-DQ', date: '2026-05-26', title: '🔧 修 Judge.me CSV 下载 + 摄影表单删除上传模块',
      items: [
        '修 bug：Judge.me 兼容 CSV 下载按钮点了没反应 · v22-DG 改文件名逻辑时漏掉了 a.href = url 这一行 · 现在补上 + 加 appendChild 兼容 Firefox',
        '摄影部 5 步式表单 → 4 步式：删除原 ④ 上传 + 多平台分发（上传者/上传日期/主上传网站/YouTube 横竖方/IG/TikTok/FB/Pinterest/独立站嵌入证明）· 这些都是美工部职责，不应该让摄影部填',
        '原 step 5 状态备注 → 现在是 step 4 · 步骤指示器同步改成 4 圈圈',
        '总览面板删除"上传者/平台数/独立站嵌入"3 行 · 摄影部不再填这些 · 留着只会一直显示"未上传"',
        '数据库字段保留（不删 column）· 现有记录里的上传数据还能在列表卡片和主页警告上看到 · 等美工那边做新表单填'
      ]
    },
    { v: 'v22-DP', date: '2026-05-26', title: '🎥 视频嵌入预览 + 自定义类型 + 求助美工',
      items: [
        '视频类型支持自定义 · 任何人输入新类型 · 自动加入下拉 · 大家共享',
        '上传视频链接改成嵌入预览 · 点击直接在页面 modal 播放 · 不跳浏览器',
        '支持 YouTube 横/竖/方版 + Vimeo 嵌入 · 其他平台保留打开新窗口',
        '拍摄部加「🆘 求助美工」按钮 · 粘贴图片求助 · 通过跨部门系统发给所有美工',
        '美工回复后 · 拍摄部头部出现"📬 N 条求助已回复"提醒'
      ]
    },
    { v: 'v22-DO', date: '2026-05-26', title: '📸 摄影阶段升级 · 网盘日期 + 补拍记录',
      items: [
        '摄影阶段 ② 加「上传到内部网盘日期」+ 网盘链接（跟拍摄日期不同步）',
        '加补拍机制：可多次补拍 · 每次记录日期/补拍人/原因 · 大家清楚为啥要补',
        '加「拍摄已确认完成」复选框 · 没勾不能进剪辑步骤 · 防止素材没拍齐就交剪辑',
        '列表卡片显示补拍次数（如「拍摄+2补」）+ 网盘链接快捷打开',
        '主页"待嵌入"警告 · 列表卡片"独立站嵌入状态"徽章'
      ]
    },
    { v: 'v22-DN', date: '2026-05-26', title: '📤 多平台上传 + 独立站嵌入证明 + UUID 防护',
      items: [
        '拍摄表单 ④ 上传阶段重新设计 · 支持 7+ 平台 URL（YouTube 横/竖/方 · IG · TikTok · FB · Pinterest · 自定义）',
        '加独立站嵌入证明：状态（待嵌入/已嵌入/不需要）+ 独立站 URL + 嵌入截图（最多 4 张）',
        '4 步式表单升级为 5 步式 · ④ 上传分发 + ⑤ 状态备注',
        '主页加待嵌入警告卡：视频已上传 YouTube 但未嵌入独立站 · 一键查看',
        '列表卡片显示所有平台徽章 + 独立站嵌入状态',
        '筛选条加"独立站嵌入状态"过滤',
        '修 UUID 报错：所有 9 个 Supabase save 加 ensureUuid 防护'
      ]
    },
    { v: 'v22-DM', date: '2026-05-26', title: '🗂️ 侧边栏分组 + KPI 部门隔离 + 报价单优化',
      items: [
        '侧边栏改成 3 档点击切换：完全折叠（20px）/ 紧凑（44px）/ 展开（180px）· 取消 hover 动画',
        '侧边栏菜单按 7 大组分类：工作 / 美工 / 销售 / 摄影 / 协作 / 管理 / 系统 · 二级折叠菜单',
        'KPI 排名彻底排除阿里美工（hjb · alibaba_artist）· 独立"阿里美工工作统计"卡按上传数量考核',
        'AI 生图引擎切换器移到顶部公共位置 · 极速/高级模式都能切换 · Gemini 优先 OpenAI 次',
        '阿里美工工作记录加"阿里巴巴国际站链接"字段（独立站链接 + 阿里链接 · 方便追溯搬运来源）',
        '报价单/PI 关键金额（Total / Subtotal）用红色加粗突出',
        '报价单导出 HTML 修：产品图叠加文字问题（图片描述错位）'
      ]
    },
    { v: 'v22-DL', date: '2026-05-26', title: '📥 反馈导出 + SQL 幂等修复',
      items: [
        '反馈页面加 4 种导出格式：📄 Markdown / 📦 JSON / 📊 CSV / 🖼 HTML 含图',
        'Markdown 格式最实用 · 适合下载后发给 AI 一键分析',
        'HTML 含图格式 · 浏览器打开后可打印为 PDF',
        '修 v22-DF / v22-DK SQL 报错 42710（publication 重复添加）· 改成幂等版本'
      ]
    },
    { v: 'v22-DK', date: '2026-05-26', title: '💬 用户反馈系统 + AI 自动分析',
      items: [
        '加用户反馈模块 · 任何员工可提 bug / 新功能建议 / 截图 / 粘贴图片',
        '全局右下角浮动 💬 按钮 · 任何页面都能快速反馈',
        '反馈分类：🐛 Bug · ✨ 新功能 · 🎨 改进 · 💬 其他',
        '严重程度：🚨 紧急 / ⚡ 重要 / · 一般 / · 不急',
        '关联模块下拉 · 自动归类问题',
        'admin 能改状态（待处理→已确认→处理中→已解决）+ 回复',
        '🤖 AI 自动分析未处理反馈 · 生成原因 + 解决方案概述',
        '反馈与版本号挂钩 · 解决后自动记录"已在 v22-XX 解决"'
      ]
    },
    { v: 'v22-DJ', date: '2026-05-26', title: '🎓 内置使用手册 + 美工主页改造',
      items: [
        '加内置使用手册（顶部菜单 + Cmd+K 可达）· 按部门 / 模块分章节',
        '加全局版本号显示（登录页 + Header + 手册）',
        '美工主页加今日工作概览卡 + 时间筛选条（7/30/90/365 天）',
        '阿里美工特殊视图：不显示积分 · 只显示上传 / 修改 / 装修数量',
        '主管视角加员工切换器 · 任何 supervisor / admin 可筛选查看个人数据',
        '刘邦杰（销售主管）权限例外：能查看阿里美工（何健斌）的工作'
      ]
    },
    { v: 'v22-DI', date: '2026-05-26', title: '🤖 评价 AI 强约束 + 销售附图',
      items: [
        'AI 评价多模态：看产品图后再写 · 不再编造"chain"等不存在的特征',
        'Prompt 强化：列出 AI 易虚构特征黑名单（chain / 水晶 / 黄铜 / dimmer 等）',
        '销售询盘"买家特征" / "客户备注" 各加专属附图区（最多 4 张）',
        '销售店铺智能记忆：上次选的下次默认',
        '销售店铺加阿里巴巴国际站 · Radilum 排第 1',
        '阿里美工工作记录店铺隔离：只显示阿里巴巴国际站'
      ]
    },
    { v: 'v22-DH', date: '2026-05-26', title: '⚙️ 评价回退 + 广告图多比例 + 何健斌岗位',
      items: [
        '评价生成步骤指示器可点击 · 任意步骤回退',
        '极速模式谷歌广告图：3 比例独立数量（16:9 + 1:1 + 4:5）+ 快捷预设',
        '何健斌岗位调整：tier → alibaba_artist · 不计积分 · 只统计上传量',
        'Judge.me product_id 强制必填 · 实时校验（防 SKU 误填）',
        '导出 CSV 文件名改用产品标题（不再是 hash 串）'
      ]
    },
    { v: 'v22-DG', date: '2026-05-26', title: '🎨 极速模式增强 + Judge.me bug',
      items: [
        '极速模式加可折叠"产品规格"面板（尺寸/材质/颜色）',
        '极速模式加子模式切换："场景图 / 谷歌广告图"',
        '谷歌广告图：3 种比例 + 1-30 张产品图输入 + 1080p/2K/4K',
        '修 Judge.me 400 bug：product_id 非数字时自动留空（防 SKU 误填）',
        'CSV 导出文件名改用产品标题'
      ]
    },
    { v: 'v22-DF', date: '2026-05-26', title: '🧮 阿里计算器 + 广告工单 + 全局搜索',
      items: [
        '阿里巴巴价格运费计算器（严格按公式：cost × mult × (1−disc/100)）',
        '广告视频需求工单系统（运营→拍摄部转格式）',
        '全局搜索（Cmd+K）· 搜询盘 / 摄影 / 工单 / 跨部门 / 博客',
        '智能时间筛选：加近 3/15/60 天 + 本季度',
        '摄影部表单适用店铺多选',
        '所有 OpenAI 生图 size 修复（1024×1024 / 1024×1536 / 1536×1024）'
      ]
    },
    { v: 'v22-DE', date: '2026-05-25', title: '💼 销售部 + 摄影部完整优化',
      items: [
        '销售卡片"✓ 成交"快捷按钮 · 一键标记状态 + 备注',
        '销售表单附件合并为顶部统一 12 张',
        '客户层级加 L4 + 自定义',
        '拍摄部表单改成 4 步分步卡片式 + 草稿系统',
        '修 UUID bug · 修销售部账号密码 bug'
      ]
    },
    { v: 'v22-DD', date: '2026-05-25', title: '📷 评价图片全模块支持粘贴',
      items: [
        '评价生成全局粘贴兜底（鼠标在任意位置 Ctrl+V 都生效）',
        '摄影部 / 产品设计文档图片上传换 ImageDropZone',
        '所有需要上传图片的位置统一支持点击/粘贴/拖拽'
      ]
    },
    { v: 'v22-DA-DC', date: '2026-05-24', title: '✨ 草稿系统 + 评价多角度 + 摄影部',
      items: [
        '通用草稿系统：5 个模块（评价 / 博客 / 产品 / Skill / PDP）共用',
        '评价 SKU 多角度图（每个 SKU 最多 8 张）',
        '摄影部完整模块（6 个员工 · 工作日志 · 状态机）',
        '登录页员工按部门分组'
      ]
    }
  ]
};
function fmtAppVersion() {
  return `${APP_VERSION.number} · ${APP_VERSION.releaseDate}`;
}

const { useState, useEffect, useMemo, useRef } = React;

// ====================== ICONS ======================
const mi = (children) => ({ size = 24, className = '', style } = {}) =>
  React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', className, style }, children);

const Upload = mi(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>);
const Share2 = mi(<><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>);
const FileText = mi(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></>);
const Sparkles = mi(<><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/></>);
const BarChart3 = mi(<><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></>);
const Users = mi(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>);
const LogOut = mi(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>);
const Calendar = mi(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>);
const Clock = mi(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>);
const ChevronRight = mi(<polyline points="9 18 15 12 9 6"/>);
const X = mi(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>);
const Plus = mi(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>);
const Minus = mi(<line x1="5" y1="12" x2="19" y2="12"/>);
const Trash2 = mi(<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>);
const Edit3 = mi(<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>);
const Lock = mi(<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>);
const Key = mi(<><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></>);
const RotateCcw = mi(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>);
const UserIcon = mi(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>);
const TrendingUp = mi(<><polyline points="22 7 13.5 15.5 8.5 10.5 1 18"/><polyline points="16 7 22 7 22 13"/></>);
const Home = mi(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>);
const Filter = mi(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>);
const Download = mi(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>);
const UploadIcon = mi(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>);
const CheckCircle2 = mi(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>);
const AlertCircle = mi(<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>);
const ArrowLeft = mi(<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>);
const Cloud = mi(<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>);
const CloudOff = mi(<><path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"/><line x1="1" y1="1" x2="23" y2="23"/></>);
const Paintbrush = mi(<><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/><path d="M14.5 17.5 4.5 15"/></>);
const LinkIcon = mi(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>);
const Megaphone = mi(<><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></>);
const Calculator = mi(<><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="16" y1="18" x2="16" y2="18"/></>);
const Folder = mi(<><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></>);
const Wand2 = mi(<><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></>);
const Crop = mi(<><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></>);
const RotateCw = mi(<><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></>);
const Layers = mi(<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>);
const Activity = mi(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>);
// v22-CM: 视角切换图标
const Eye = mi(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>);
// v22-CR: 跨部门消息图标
const Bell = mi(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>);
// v22-CU: 自定义布局 / 钉住
const Sliders = mi(<><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>);
const Pin = mi(<><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></>);
const MessageSquare = mi(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>);
const Camera = mi(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></>);
const Award = mi(<><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>);
const Target = mi(<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>);
const Video = mi(<><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>);
const Package = mi(<><path d="M16.5 9.4L7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>);
const Search = mi(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>);

// ====================== 团队 & 业务常量 ======================
// 13 人团队 (实际名字)
const TEAM_USERS = [
  { id: 'admin',  name: 'Martin',  role: 'admin',  tier: null, hideFromList: true },
  // v22-CG: 罗燕秋 · 与老板同权限 · 人事管理 · 隐藏入口
  { id: 'luoyq',  name: '罗燕秋',  role: 'admin',  tier: null, hideFromList: true },
  // 正式美工 5 人 (王九香兼主管角色)
  { id: 'wjx',    name: '王九香',  role: 'supervisor', tier: 'official' },
  { id: 'cxm',    name: '陈雪梅',  role: 'member', tier: 'official' },
  { id: 'zs',     name: '曾尚',    role: 'member', tier: 'official' },
  { id: 'ljy',    name: '吕嘉颖',  role: 'member', tier: 'official' },
  { id: 'lyl',    name: '刘燕玲',  role: 'member', tier: 'official' },
  // 新晋美工 6 人
  { id: 'zst',    name: '钟诗婷',  role: 'member', tier: 'newbie' },
  { id: 'zyr',    name: '赵韵如',  role: 'member', tier: 'newbie' },
  { id: 'lfx',    name: '林凤喜',  role: 'member', tier: 'newbie' },
  { id: 'bxl',    name: '宾煦丽',  role: 'member', tier: 'newbie' },
  { id: 'lcw',    name: '李翠薇',  role: 'member', tier: 'newbie' },
  { id: 'cwl',    name: '陈伟乐',  role: 'member', tier: 'newbie' },
  // 阿里巴巴批发部美工 1 人
  { id: 'hjb',    name: '何健斌',  role: 'member', tier: 'alibaba_artist', title: '阿里美工' },
  // 阿里巴巴批发部 主管 1 人
  { id: 'lbj',    name: '刘邦杰',  role: 'supervisor', tier: 'alibaba_sales' },
  // v22-BK: 阿里巴巴批发部 业务员
  { id: 'rosie',  name: '罗娇英 Rosie', role: 'sales', tier: 'alibaba_sales' },
  // 客服主管 1 人（主管权限 · 查看美工/设计师数据）
  { id: 'lbh',    name: '李彬桦 Nicole', role: 'supervisor', tier: 'official' },
  // 设计师 3 人（权限：卖价计算 + AI 生图 + 新款设计）
  { id: 'wxh',    name: '王鑫海',  role: 'designer', tier: 'designer' },
  { id: 'lmx',    name: '李明祥',  role: 'designer', tier: 'designer' },
  { id: 'ty',     name: '汤毓',    role: 'designer', tier: 'designer' },
  // v22-CZ: 摄影部 · 主管 1 人 + 员工 5 人（权限隔离 · 只看拍摄部模块）
  { id: 'ljj',    name: '黎俊杰',  role: 'supervisor', tier: 'photo_team', title: '摄影部主管' },
  { id: 'hsp',    name: '何世鹏',  role: 'member', tier: 'photo_team', title: '剪辑师' },
  { id: 'ghc',    name: '郭和聪',  role: 'member', tier: 'photo_team', title: '剪辑实习生' },
  { id: 'czl',    name: '陈泽朗',  role: 'member', tier: 'photo_team', title: '摄影师' },
  { id: 'lgf',    name: '刘根发',  role: 'member', tier: 'photo_team', title: '摄影助理' },
  { id: 'zxy',    name: '张欣怡',  role: 'member', tier: 'photo_team', title: '实习摄影 · 全流程自营', selfServiceUploader: true }
];

// v22-EI: 自助上传用户列表 · 这些人拍/剪后默认自己上传 · 不走 shop_owners 派单
//         美工有时间也可以接手 · 通过"立即派单"按钮手动覆盖
function isSelfServiceUploader(userId, users) {
  if (!userId || !Array.isArray(users)) return false;
  const u = users.find(x => x.id === userId);
  return !!(u && u.selfServiceUploader);
}

// 默认成员登录密码 (升级时自动设置，员工首次登录后建议自行修改)
const DEFAULT_MEMBER_PWD = '123456';

// ====================== 权限系统 ======================
// 所有可分配的功能权限（每个对应一个 view）
const SALES_CUSTOMER_LEVELS = [
  { id: 'L1+', label: 'L1+ 优质询盘',   color: 'emerald', desc: '高质量询盘 · 重点跟进' },
  { id: 'L1',  label: 'L1 普通询盘',    color: 'sky',     desc: '普通询盘' },
  { id: 'L2',  label: 'L2 进阶询盘',    color: 'amber',   desc: '已沟通多次 · 进展中' },
  { id: 'L3',  label: 'L3 重点客户',    color: 'rose',    desc: '高潜力客户 · 重点维护' },
  { id: 'L4',  label: 'L4 战略客户',    color: 'purple',  desc: '战略级合作 / 大额订单' },
  { id: 'new', label: '新询盘',         color: 'stone',   desc: '刚收到的新询盘' },
  { id: 'old', label: '老客户回购',     color: 'violet',  desc: '老客户复购询盘' },
  { id: 'custom', label: '🖊 自定义...', color: 'stone',  desc: '其他自定义层级（输入文字）' }
];

const SALES_CUSTOMER_TYPES = ['个人使用', '采购商', '批发客户', '零售', '设计公司', '室内建筑', '分销商', '未知/其他'];

// v22-DI: 销售店铺列表 · Radilum 优先（最常用）· 加阿里巴巴 · "其他"在最后
const SALES_SHOPS = ['Radilum', 'Polarux Lighting', '阿里巴巴国际站', 'TM', '其他店铺'];

// v22-BT: 扩展状态 — 加入「等待回复 / 已下单 / 生产中 / 选了他家」，按业务流程分组
const SALES_INQUIRY_STATUS = [
  // 进行中（询盘阶段）
  { id: 'inquiry',         label: '🆕 新询盘',      color: '#0ea5e9', bg: '#e0f2fe', group: 'active' },
  { id: 'waiting',         label: '⏳ 等待回复',    color: '#0284c7', bg: '#e0f2fe', group: 'active' },
  { id: 'quoted',          label: '💬 已报价',      color: '#7c3aed', bg: '#ede9fe', group: 'active' },
  { id: 'negotiating',     label: '🔄 议价中',      color: '#d97706', bg: '#fef3c7', group: 'active' },
  { id: 'sample',          label: '📦 样品中',      color: '#0891b2', bg: '#cffafe', group: 'active' },
  // 订单阶段（已确认下单）
  { id: 'ordered',         label: '✍️ 已下单',      color: '#9333ea', bg: '#f3e8ff', group: 'order' },
  { id: 'deposit',         label: '💵 已收定金',    color: '#059669', bg: '#d1fae5', group: 'order' },
  { id: 'producing',       label: '🏭 生产中',      color: '#0f766e', bg: '#ccfbf1', group: 'order' },
  { id: 'paid',            label: '✅ 已付全款',    color: '#16a34a', bg: '#dcfce7', group: 'order' },
  { id: 'shipped',         label: '🚚 已发货',      color: '#0d9488', bg: '#ccfbf1', group: 'order' },
  { id: 'done',            label: '🎉 已成交',      color: '#15803d', bg: '#bbf7d0', group: 'order' },
  // 已结束（失单）
  { id: 'lost_competitor', label: '⚔️ 客户选他家',  color: '#b91c1c', bg: '#fee2e2', group: 'closed' },
  { id: 'lost',            label: '❌ 丢失/无回复', color: '#6b7280', bg: '#f3f4f6', group: 'closed' }
];

// v22-BT: 状态分组标签 + 哪些状态算"已结束"（不需要继续跟进）
const SALES_STATUS_GROUPS = [
  { id: 'active', label: '进行中' },
  { id: 'order',  label: '已下单' },
  { id: 'closed', label: '已结束' }
];
const SALES_CLOSED_STATUSES = ['done', 'lost', 'lost_competitor'];

// v22-BT: 跟进快捷天数
const FOLLOW_UP_PRESET_DAYS = [3, 7, 14, 30];

// v22-BV: 操作留档 — 模块定义 + action 类型
const OPERATION_LOG_MODULES = [
  { id: 'reviews',         label: '⭐ 评价生成',  color: '#d97706', bg: '#fef3c7' },
  { id: 'ai-image',        label: '🎨 AI 生图',   color: '#7c3aed', bg: '#ede9fe' },
  { id: 'design-studio',   label: '✂️ 新款设计',  color: '#0891b2', bg: '#cffafe' },
  { id: 'product-design',  label: '📐 设计文档',  color: '#9333ea', bg: '#f3e8ff' },
  { id: 'blog-writer',     label: '📝 博客快写',  color: '#16a34a', bg: '#dcfce7' },
  { id: 'product-editor',  label: '🔧 详情改写',  color: '#0d9488', bg: '#ccfbf1' },
  { id: 'sales-log',       label: '📞 销售日报',  color: '#dc2626', bg: '#fee2e2' },
  { id: 'payment-receipt', label: '💰 付款回单',  color: '#059669', bg: '#d1fae5' },
  { id: 'meeting',         label: '📢 周会发布',  color: '#9333ea', bg: '#f3e8ff' },
  { id: 'quotation',       label: '📄 报价单',    color: '#1d4ed8', bg: '#dbeafe' },
  { id: 'finance',         label: '💵 卖价计算',  color: '#b45309', bg: '#fef3c7' },
  { id: 'team',            label: '👥 团队管理',  color: '#6b7280', bg: '#f3f4f6' }
];

const OPERATION_LOG_ACTIONS = [
  { id: 'generate', label: '生成', color: '#7c3aed' },
  { id: 'create',   label: '新建', color: '#0ea5e9' },
  { id: 'update',   label: '更新', color: '#d97706' },
  { id: 'delete',   label: '删除', color: '#dc2626' },
  { id: 'export',   label: '导出', color: '#0d9488' },
  { id: 'view',     label: '查看', color: '#6b7280' }
];

const PAYMENT_TYPES = [
  { id: 'deposit',   label: '💵 定金',     desc: '订单首付（30% / 50% 等）' },
  { id: 'middle',    label: '📦 中期款',   desc: '生产到一半时的中期款' },
  { id: 'balance',   label: '💰 尾款',     desc: '发货前/到货后的尾款' },
  { id: 'full',      label: '✅ 全款',     desc: '一次性全额支付' },
  { id: 'sample',    label: '📋 样品费',   desc: '样品订单费用' },
  { id: 'other',     label: '📌 其他',     desc: '其他类型款项' }
];

const PAYMENT_METHODS = ['T/T 电汇', 'Alipay 支付宝', 'PayPal', '西联汇款 WU', '微信', '银行卡', '信用证 L/C', 'Trade Assurance', '其他'];

const RECEIPT_STATUS = [
  { id: 'pending',   label: '⏳ 待财务确认', color: '#d97706', bg: '#fef3c7' },
  { id: 'confirmed', label: '✅ 已确认入账', color: '#16a34a', bg: '#dcfce7' },
  { id: 'problem',   label: '⚠ 有问题',     color: '#dc2626', bg: '#fee2e2' }
];


const ALL_PERMISSIONS = [
  { id: 'home',           label: '首页',         desc: '个人工作台 / 团队首页' },
  { id: 'entries',        label: '工作记录',     desc: '查看 / 录入工作' },
  { id: 'kpi',            label: 'KPI',          desc: '查看 KPI 数据' },
  { id: 'finance',        label: '卖价计算',     desc: '计算器工具' },
  { id: 'ai-image',       label: 'AI 生图',      desc: 'Gemini 生图工具' },
  { id: 'design-studio',  label: '新款设计',     desc: '基于竞品图局部修改设计' },
  { id: 'product-design', label: '产品设计文档', desc: '上传作品、设计评估' },
  { id: 'designer-perf',  label: '设计师绩效',   desc: '设计师工作日志 + 月度积分 + 薪资' },
  { id: 'blog-writer',    label: '博客快写',     desc: 'AI 写博客' },
  { id: 'product-editor', label: '详情改写',     desc: 'PDP 改写' },
  { id: 'reviews',        label: '评价生成',     desc: 'AI 生成买家秀 · Judge.me 格式 · 美式真人感' },
  { id: 'sales-log',      label: '📞 销售日报',  desc: '阿里巴巴业务员询盘跟进 · 客户管理' },
  { id: 'payment-receipt', label: '💰 付款回单', desc: '客户付款凭证上传 · 财务对账' },
  { id: 'quotation',      label: '📄 报价单',    desc: '生成 Quotation / PO / PI / 装箱单（4 合 1）' },
  { id: 'consolidation',  label: '📦 合箱计算',  desc: '合箱智能规划器 · 多个 SKU 合柜出货计算' },
  { id: 'meeting-publish', label: '📢 周会发布',  desc: '发布每周会议纪要 / 工作计划到员工首页' },
  { id: 'cross-dept',     label: '📨 跨部门协作', desc: '与客服 / 跟单部门互发任务 · 收件箱 / 发件箱' },
  { id: 'shop-owners',    label: '🌐 网站归属维护', desc: '主管维护：谁负责哪个网站 · 主负责 / 视频上传 / 备用 / 主管 / 设计师 5 种角色' },
  { id: 'settings',       label: '⚙️ 设置中心',     desc: '一站式设置入口 · 团队 / 网站 / 协作 / API Keys 等都从这里进' },
  { id: 'photo-team-log', label: '📸 拍摄部日志', desc: '产品拍摄/剪辑/上传全流程跟踪（仅摄影部）' },
  { id: 'price-calc',     label: '🧮 阿里计算器', desc: '产品成本 → 卖价 / 折扣 / 运费 / 双币换算（销售部）' },
  { id: 'ad-video-tasks', label: '🎬 广告视频需求', desc: '广告运营提需求 → 拍摄部转横版/竖版/方形' },
  { id: 'user-guide',     label: '📚 使用手册',   desc: '内置功能使用指南 · 所有人可看 · 持续更新' },
  { id: 'feedback',       label: '💬 反馈 / 建议', desc: '反馈 Bug · 提新功能 · 截图描述 · admin 处理后版本迭代' },
  { id: 'operation-logs', label: '📋 操作留档',  desc: '查询所有员工的工作记录 · 谁/什么时候/做了什么' },
  { id: 'reports',        label: '数据报表',     desc: '团队报表 / 看图' },
  { id: 'team',           label: '团队管理',     desc: '员工 / API key / 权限（admin only）' }
];
const ALL_PERMISSION_IDS = ALL_PERMISSIONS.map(p => p.id);

// ============================================================================
// v22-CU: 全局导航数据源 + 用户自定义布局（IDE 风格 · 顶部钉住 + 左侧 sidebar）
// 每个用户可在 ⚙ 自定义弹窗里选择把哪些常用功能"钉"到顶部 · 未钉的进左侧 sidebar
// ============================================================================
// 所有可导航功能 · id 对应 view 路由 · perm 对应权限
// v22-DM: 二级菜单分组 · 侧边栏按 group 折叠显示
const NAV_GROUPS = [
  { id: 'work',     label: '📊 工作 / KPI',    order: 1 },
  { id: 'design',   label: '🎨 美工 / 设计',   order: 2 },
  { id: 'sales',    label: '📞 销售 / 客户',   order: 3 },
  { id: 'photo',    label: '📸 摄影 / 广告',   order: 4 },
  { id: 'collab',   label: '🌐 协作 / 跨部门', order: 5 },
  { id: 'manage',   label: '👥 管理 / 报表',   order: 6 },
  { id: 'system',   label: '⚙ 系统 / 帮助',   order: 7 }
];

const NAV_ITEMS = [
  { id: 'home',           label: '首页',         emoji: '🏠', perm: 'home',             group: 'work' },
  { id: 'entries',        label: '工作记录',     emoji: '📋', perm: 'entries',          group: 'work' },
  { id: 'kpi',            label: 'KPI',          emoji: '🏆', perm: 'kpi',              group: 'work' },
  { id: 'unified-kpi',    label: '团队总览',     emoji: '📊', perm: 'reports',          group: 'work' },
  { id: 'finance',        label: '卖价计算',     emoji: '💵', perm: 'finance',          group: 'work' },
  { id: 'ai-image',       label: 'AI 生图',      emoji: '🎨', perm: 'ai-image',         group: 'design' },
  { id: 'design-studio',  label: '新款设计',     emoji: '✂️', perm: 'design-studio',    group: 'design' },
  { id: 'product-design', label: '设计文档',     emoji: '📐', perm: 'product-design',   group: 'design' },
  { id: 'designer-perf',  label: '设计绩效',     emoji: '⚙️', perm: 'designer-perf',    group: 'design' },
  { id: 'blog-writer',    label: '博客快写',     emoji: '✍️', perm: 'blog-writer',      group: 'design' },
  { id: 'product-editor', label: '详情改写',     emoji: '📝', perm: 'product-editor',   group: 'design' },
  { id: 'reviews',        label: '评价生成',     emoji: '⭐', perm: 'reviews',          group: 'design' },
  { id: 'sales-log',      label: '销售日报',     emoji: '📞', perm: 'sales-log',        group: 'sales' },
  { id: 'payment-receipt', label: '付款回单',    emoji: '💰', perm: 'payment-receipt',  group: 'sales' },
  { id: 'quotation',      label: '报价单',       emoji: '📄', perm: 'quotation',        group: 'sales' },
  { id: 'consolidation',  label: '合箱计算',     emoji: '📦', perm: 'consolidation',    group: 'sales' },
  { id: 'price-calc',     label: '阿里计算器',   emoji: '🧮', perm: 'price-calc',       group: 'sales' },
  { id: 'photo-team-log', label: '拍摄部日志',   emoji: '📸', perm: 'photo-team-log',   group: 'photo' },
  { id: 'ad-video-tasks', label: '广告视频需求', emoji: '🎬', perm: 'ad-video-tasks',   group: 'photo' },
  { id: 'cross-dept',     label: '跨部门协作',   emoji: '📨', perm: 'cross-dept',       group: 'collab' },
  { id: 'shop-owners',    label: '网站归属维护',  emoji: '🌐', perm: 'shop-owners',      group: 'manage' },
  { id: 'meeting-publish', label: '周会发布',    emoji: '📢', perm: 'meeting-publish',  group: 'collab' },
  { id: 'reports',        label: '数据报表',     emoji: '📈', perm: 'reports',          group: 'manage' },
  { id: 'operation-logs', label: '操作留档',     emoji: '🗂️', perm: 'operation-logs',   group: 'manage' },
  { id: 'team',           label: '团队管理',     emoji: '👥', perm: 'team',             group: 'manage' },
  { id: 'settings',       label: '设置中心',     emoji: '⚙️', perm: 'settings',         group: 'manage' },
  { id: 'user-guide',     label: '使用手册',     emoji: '📚', perm: 'user-guide',       group: 'system' },
  { id: 'feedback',       label: '反馈/建议',    emoji: '💬', perm: 'feedback',         group: 'system' }
];
function getNavItem(id) { return NAV_ITEMS.find(it => it.id === id); }

// 每种角色默认钉到顶部的常用项（按使用频率 · 最多 6 个）· 未钉的进左侧
const DEFAULT_PINNED_BY_ROLE = {
  admin:      ['home', 'ai-image', 'design-studio', 'reviews', 'cross-dept', 'unified-kpi'],
  supervisor: ['home', 'kpi', 'unified-kpi', 'operation-logs', 'cross-dept', 'meeting-publish'],
  designer:   ['design-studio', 'product-design', 'designer-perf', 'ai-image', 'cross-dept'],
  sales:      ['home', 'sales-log', 'payment-receipt', 'quotation', 'cross-dept'],
  member:     ['home', 'ai-image', 'reviews', 'design-studio', 'cross-dept']
};
function getDefaultPinned(user) {
  // v22-CZ: 摄影部 tier 用专属默认布局
  if (user.tier === 'photo_team' && user.role !== 'admin') {
    return ['home', 'photo-team-log', 'cross-dept'];
  }
  return DEFAULT_PINNED_BY_ROLE[user.role] || DEFAULT_PINNED_BY_ROLE.member;
}
// 读 / 写 用户的自定义布局（localStorage · 每浏览器独立）
function loadUserNavLayout(userId) {
  try {
    const raw = localStorage.getItem('wt_nav_layout_' + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.pinned)) return parsed;
  } catch (e) {}
  return null;
}
function saveUserNavLayout(userId, layout) {
  try {
    localStorage.setItem('wt_nav_layout_' + userId, JSON.stringify(layout));
  } catch (e) {}
}
const MAX_PINNED = 6;

// ============================================================================
// v22-DA: 通用草稿系统 · 5 个模块共用（评价 / 博客 / 产品 / Skill / 详情）
// 自动保存表单输入 · 失败时保留 · 成功后清除 · 默认保留 7 天
// 用法:
//   DraftStore.save('reviews', userId, formData)
//   const d = DraftStore.load('reviews', userId)  // → { data, ts } 或 null
//   DraftStore.clear('reviews', userId)
//   DraftStore.list(userId)  // → [{ moduleId, ts, data }]
// ============================================================================
const DRAFT_TTL_MS = 7 * 24 * 3600 * 1000;
const DRAFT_KEY_PREFIX = 'wt_draft_';
const DraftStore = {
  _key(moduleId, userId) {
    return `${DRAFT_KEY_PREFIX}${moduleId}_${userId || 'anon'}`;
  },
  save(moduleId, userId, data) {
    try {
      const payload = { data, ts: Date.now(), moduleId };
      const str = JSON.stringify(payload);
      // 草稿大小检查 · 单个不超过 2MB
      if (str.length > 2 * 1024 * 1024) {
        console.warn(`Draft ${moduleId} too large (${(str.length/1024).toFixed(1)}KB)`);
        return false;
      }
      localStorage.setItem(this._key(moduleId, userId), str);
      return true;
    } catch (e) {
      console.warn('Draft save failed:', e.message);
      return false;
    }
  },
  load(moduleId, userId) {
    try {
      const raw = localStorage.getItem(this._key(moduleId, userId));
      if (!raw) return null;
      const { data, ts, moduleId: mid } = JSON.parse(raw);
      if (Date.now() - ts > DRAFT_TTL_MS) {
        this.clear(moduleId, userId);
        return null;
      }
      return { data, ts, moduleId: mid };
    } catch (e) { return null; }
  },
  clear(moduleId, userId) {
    try {
      localStorage.removeItem(this._key(moduleId, userId));
    } catch (e) {}
  },
  list(userId) {
    const suffix = '_' + (userId || 'anon');
    const drafts = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(DRAFT_KEY_PREFIX) && k.endsWith(suffix)) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const { data, ts, moduleId } = JSON.parse(raw);
              if (Date.now() - ts <= DRAFT_TTL_MS) {
                drafts.push({ moduleId, ts, data, size: raw.length });
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
    return drafts.sort((a, b) => b.ts - a.ts);
  },
  // 格式化时间（"5 分钟前" 等）
  formatTs(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff/60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)} 小时前`;
    return `${Math.floor(diff/86400000)} 天前`;
  }
};

// ============================================================================
// v22-CY: 固定网站列表（独立站 + 阿里巴巴 + 其他）
// 主管在 ShopOwnersManager 维护负责人时，从这个下拉选 · 不再手动填写
// 客服 / 跟单 发工单时，「关联网站」也从这个下拉选
// ============================================================================
const SHOPS_PRESET = [
  { id: 'vakkerlight',        label: 'Vakkerlight',          category: '独立站' },
  { id: 'docos',              label: 'Docos.us',             category: '独立站' },
  { id: 'mooijane',           label: 'Mooijane',             category: '独立站' },
  { id: 'mooiehome',          label: 'Mooiehome',            category: '独立站' },
  { id: 'radilum',            label: 'Radilum',              category: '独立站' },
  { id: 'mooielight',         label: 'Mooielight',           category: '独立站' },
  { id: 'dekorfine',          label: 'Dekorfine',            category: '独立站' },
  { id: 'pinlighting',        label: 'Pinlighting',          category: '独立站' },
  { id: 'lumioshine',         label: 'Lumioshine',           category: '独立站' },
  { id: 'rayonshine',         label: 'Rayonshine',           category: '独立站' },
  { id: 'alibaba-radilum',    label: '阿里巴巴 · Radilum INC', category: '平台' },
  { id: 'other',              label: '其他（手填备注）',       category: '其他' }
];
function getShopLabel(idOrLabel) {
  // 兼容历史数据 · 既支持 id 也支持 label
  const byId = SHOPS_PRESET.find(s => s.id === idOrLabel);
  if (byId) return byId.label;
  return idOrLabel;
}

// 根据角色返回默认权限
function getDefaultPermissions(role) {
  if (role === 'admin') return ALL_PERMISSION_IDS.slice();
  if (role === 'supervisor') return ['home', 'entries', 'kpi', 'finance', 'ai-image', 'design-studio', 'product-design', 'designer-perf', 'blog-writer', 'product-editor', 'reviews', 'sales-log', 'payment-receipt', 'quotation', 'consolidation', 'meeting-publish', 'cross-dept', 'shop-owners', 'settings', 'photo-team-log', 'price-calc', 'ad-video-tasks', 'operation-logs', 'reports'];
  if (role === 'designer') return ['finance', 'ai-image', 'design-studio', 'product-design', 'designer-perf', 'consolidation', 'cross-dept'];
  if (role === 'sales') return ['home', 'sales-log', 'payment-receipt', 'quotation', 'consolidation', 'finance', 'ai-image', 'cross-dept', 'price-calc'];
  if (role === 'member') return ['home', 'entries', 'kpi', 'finance', 'ai-image', 'design-studio', 'product-design', 'blog-writer', 'product-editor', 'reviews', 'consolidation', 'cross-dept'];
  return [];
}

// v22-CA: 设计师绩效白名单 — 仅这些 user ID 能查看 designer-perf
// admin (Martin) 始终能看（不受白名单约束）；其他人不在白名单内会被过滤掉
const DESIGNER_PERF_WHITELIST = ['lbj', 'wxh', 'lmx', 'ty'];

// 获取用户实际权限（custom 优先，否则用角色默认）
function getUserPermissions(user) {
  if (!user) return [];
  let perms;
  if (Array.isArray(user.customPermissions) && user.customPermissions.length > 0) {
    perms = user.customPermissions.slice();
  } else {
    perms = getDefaultPermissions(user.role);
  }
  // v22-CA: 设计师绩效白名单约束（admin 不受限）
  if (user.role !== 'admin' && !DESIGNER_PERF_WHITELIST.includes(user.id)) {
    perms = perms.filter(p => p !== 'designer-perf');
  }
  // v22-CZ: 摄影部 tier 强制隔离 · 只能看拍摄部相关模块（不管原角色是什么）
  // v22-DF: 加广告视频需求（摄影部接广告运营工单）
  if (user.tier === 'photo_team' && user.role !== 'admin') {
    perms = ['home', 'photo-team-log', 'cross-dept', 'ad-video-tasks'];
  }
  // v22-DH: 阿里巴巴国际站美工 tier 强制隔离 · 只工作记录 + 跨部门 · 不计积分
  // 何健斌：上传阿里产品 / 修改产品 / 装修店铺 / 辅助工作
  if (user.tier === 'alibaba_artist' && user.role !== 'admin') {
    perms = ['home', 'entries', 'cross-dept', 'ai-image', 'price-calc', 'user-guide', 'feedback'];
  }
  // v22-CZ: photo-team-log 默认只对摄影部 + admin/supervisor 开放
  // v22-DM: 美工 tier（official/newbie/alibaba/alibaba_artist/designer）也能看（只读模式 · 共享流程透明）
  const ART_TIERS = ['official', 'newbie', 'alibaba', 'alibaba_artist', 'designer'];
  if (user.tier !== 'photo_team' && user.role !== 'admin' && user.role !== 'supervisor' && !ART_TIERS.includes(user.tier)) {
    perms = perms.filter(p => p !== 'photo-team-log');
  }
  // 美工 tier 强制有 photo-team-log（即使 perms 里默认没有）
  if (ART_TIERS.includes(user.tier) && !perms.includes('photo-team-log')) {
    perms.push('photo-team-log');
  }
  // v22-DJ: 摄影部 tier 也加使用手册（在 photo_team 隔离里加上）
  if (user.tier === 'photo_team' && user.role !== 'admin') {
    if (!perms.includes('user-guide')) perms.push('user-guide');
    if (!perms.includes('feedback')) perms.push('feedback');
  }
  // v22-DJ/DK: 所有用户都能看使用手册 + 提反馈
  if (!perms.includes('user-guide')) perms.push('user-guide');
  if (!perms.includes('feedback')) perms.push('feedback');
  return perms;
}

// 检查用户是否有某个权限
function hasPermission(user, permId) {
  return getUserPermissions(user).includes(permId);
}

// v22-DJ: 主管能看哪些 tier 的成员 · 含部门临时调配例外
// 例：刘邦杰（alibaba_sales supervisor）当前协助管理阿里美工 → 也能看 alibaba_artist
function getSupervisorVisibleTiers(user) {
  if (!user) return [];
  if (user.role === 'admin') return null;  // null = 看所有
  if (user.role !== 'supervisor') return user.tier ? [user.tier] : [];
  const tiers = [user.tier];
  // 例外 1: 销售部主管协助管理阿里美工
  if (user.tier === 'alibaba_sales') tiers.push('alibaba_artist');
  // 例外 2: 美工部主管能看所有美工 tier（official / newbie / alibaba / alibaba_artist）
  if (['official', 'newbie', 'alibaba', 'designer'].includes(user.tier)) {
    tiers.push('official', 'newbie', 'alibaba', 'alibaba_artist', 'designer');
  }
  return [...new Set(tiers)];
}

// v22-DJ: 检查 supervisor 是否能看某个员工
function canSupervisorSee(user, targetUser) {
  if (!user || !targetUser) return false;
  if (user.role === 'admin') return true;
  if (user.id === targetUser.id) return true;
  if (user.role !== 'supervisor') return false;
  const visible = getSupervisorVisibleTiers(user);
  if (visible === null) return true;
  return visible.includes(targetUser.tier);
}

// ====================== 设计师绩效系统 ======================
// 工作类型定义（积分 + 默认单价 + 分组）
const DESIGNER_WORK_TYPES = [
  // 3D 模型
  { id: 'render_simple',  group: 'render', label: '3D 简单',   defaultPrice: 10 },
  { id: 'render_medium',  group: 'render', label: '3D 中等',   defaultPrice: 15 },
  { id: 'render_hard',    group: 'render', label: '3D 困难',   defaultPrice: 20 },
  // 效果 / 深化 / 其他
  { id: 'effect_simple',  group: 'detail', label: '效果图',    defaultPrice: 15 },
  { id: 'effect_hard',    group: 'detail', label: '深化图',    defaultPrice: 20 },
  { id: 'foam',           group: 'detail', label: '泡沫/包装', defaultPrice: 3 },
  { id: 'misc',           group: 'detail', label: '其它杂事',  defaultPrice: 1 },
  // 安装 / 尺寸 / 配件
  { id: 'install_simple', group: 'install', label: '安装图简单', defaultPrice: 2 },
  { id: 'install_hard',   group: 'install', label: '安装图复杂', defaultPrice: 4 },
  { id: 'size_chart',     group: 'install', label: '尺寸图',    defaultPrice: 1 },
  { id: 'accessory',      group: 'install', label: '配件图',    defaultPrice: 1 },
  // 定制
  { id: 'custom_low',     group: 'custom', label: '定制一般',  defaultPrice: 20 },
  { id: 'custom_mid',     group: 'custom', label: '定制中等',  defaultPrice: 30 },
  { id: 'custom_high',    group: 'custom', label: '定制极高',  defaultPrice: 40 },
  // v22-AY: 非标灯具上架交接（设计师 → 美工流程）
  { id: 'dispatch_to_artist', group: 'launch', label: '📦 发美工上架', defaultPrice: 5 },   // 设计师完成设计转交美工的款数
  { id: 'launched',           group: 'launch', label: '✅ 已上线',     defaultPrice: 25 }   // 最终确认上线的款数（核心 KPI · 月度目标对标）
];

const DESIGNER_WORK_GROUPS = {
  render:  { label: '3D 模型',          color: 'indigo', icon: '🎨' },
  detail:  { label: '效果 / 深化 / 其他', color: 'sky',    icon: '✨' },
  install: { label: '安装 / 尺寸 / 配件', color: 'amber',  icon: '📐' },
  custom:  { label: '定制生产',          color: 'rose',   icon: '💎' },
  launch:  { label: '🚀 上架进度（月度目标对标）', color: 'emerald', icon: '🚀' }
};

// 客服指标基准 + 权重
const DESIGNER_CS_RULES = {
  trainingBenchmark: 4,     // 问题培训基准 4 次
  kbBenchmark: 40,          // 知识库录入基准 40 个
  trainingMaxScore: 7.5,
  kbMaxScore: 7.5,
  totalMaxScore: 15
};

// 综合评价权重
const DESIGNER_REVIEW_WEIGHTS = {
  quality: 10,   // 设计质量
  coordination: 12, // 团队协作
  responsiveness: 8  // 响应效率
};

// 产品品类（按公司战略加权 — 鼓励高客单和拓展品类）
const PRODUCT_CATEGORIES = [
  { id: 'standard',         label: '标准款',       multiplier: 1.0, color: 'stone',  desc: '常规小灯款（客单价较低）' },
  { id: 'large_lamp',       label: '大灯/高客单',  multiplier: 1.3, color: 'amber',  desc: '大尺寸灯具 · 高客单价 · 鼓励' },
  { id: 'engineering',      label: '工程定制',     multiplier: 1.5, color: 'violet', desc: '工程类项目订单 · 强力鼓励' },
  { id: 'non_standard',     label: '非标定制',     multiplier: 1.5, color: 'rose',   desc: '非标客制化产品 · 强力鼓励' }
];

// 默认月度新款目标（按月递增策略）
const DEFAULT_MONTHLY_TARGETS = {
  '2026-05': 40,
  '2026-06': 50,
  '2026-07': 55,
  '2026-08': 60,
  '2026-09': 60,
  '2026-10': 65,
  '2026-11': 65,
  '2026-12': 50  // 年底
};

// 默认薪资规则（v22-C 重写：上线款数为核心 KPI）
const DESIGNER_SALARY_DEFAULTS = {
  passScore: 70,
  baseSalary: 6000,
  bonusMin: 2000,
  bonusMax: 4000,
  // v22-C 新增
  launchKpiWeight: 55,        // 上线款数权重（默认 55%）
  csKpiWeight: 15,            // 客服权重
  reviewKpiWeight: 30,        // 综合评价权重
  baseSalaryFloor: 0,         // 完全没上线时基本工资底线
  minLaunchRatioForBase: 0.5, // 上线数 < 50% 目标 时基本工资按比例（再低就 baseSalaryFloor）
  // 兼容字段（设计师任务图纸基准，旧逻辑保留备用）
  drawingBenchmarkNormal: 1360,
  drawingBenchmarkLowCs: 1800,
  drawingWeightNormal: 55,
  drawingWeightLowCs: 70
};

// 获取生效的工作类型列表（默认 + 自定义 + 隐藏规则）
function getEffectiveWorkTypes(config) {
  const c = config || {};
  const customTypes = Array.isArray(c.designerCustomWorkTypes) ? c.designerCustomWorkTypes : [];
  const hiddenIds = new Set(Array.isArray(c.designerHiddenWorkTypeIds) ? c.designerHiddenWorkTypeIds : []);
  // 默认 14 项 + 自定义（自定义带 _custom: true 标记）
  const all = [];
  DESIGNER_WORK_TYPES.forEach(t => {
    if (!hiddenIds.has(t.id)) all.push({ ...t });
  });
  customTypes.forEach(t => {
    if (t && t.id && !hiddenIds.has(t.id)) {
      all.push({ ...t, _custom: true });
    }
  });
  return all;
}

// 获取当前单价配置（从 app config 读取自定义价，否则用默认值）
function getDesignerPricing(config) {
  const custom = config?.designerPricing || {};
  const pricing = {};
  DESIGNER_WORK_TYPES.forEach(t => {
    pricing[t.id] = (custom[t.id] != null) ? Number(custom[t.id]) : t.defaultPrice;
  });
  return pricing;
}

// 获取当前薪资配置
function getDesignerSalaryRules(config) {
  return { ...DESIGNER_SALARY_DEFAULTS, ...(config?.designerSalaryRules || {}) };
}

// 获取月度目标（每月 N 款）
// designerId: 可选 — 如果某个设计师有独立目标用独立的，否则用 base_count
function getMonthlyTarget(config, month, designerId) {
  const targets = config?.monthlyDesignerTargets || DEFAULT_MONTHLY_TARGETS;
  if (typeof targets === 'object' && !Array.isArray(targets)) {
    const m = targets[month];
    if (typeof m === 'number') return m;
    if (m && typeof m === 'object') {
      if (designerId && typeof m[designerId] === 'number') return m[designerId];
      if (typeof m.base_count === 'number') return m.base_count;
    }
  }
  // fallback: 用默认月度目标
  return DEFAULT_MONTHLY_TARGETS[month] || 40;
}

// 判断设计是否"已上线计入" — 必须满足三个条件
//   1. launched = true
//   2. 有 product_url 作为最终上线 URL
//   3. differences_count >= 3（达到差异化要求）
function isQualifiedLaunch(design) {
  if (!design) return false;
  if (!design.launched) return false;
  if (!design.product_url || !String(design.product_url).trim()) return false;
  const diff = Number(design.differences_count) || 0;
  if (diff < 3) return false;
  return true;
}

// 计算一条工作日志的积分（用户保存时计算 + 主管审核时可调整）
function calcWorkLogPoints(counts, pricing) {
  if (!counts) return 0;
  let total = 0;
  for (const [k, v] of Object.entries(counts)) {
    const n = Number(v) || 0;
    const p = pricing[k] || 0;
    total += n * p;
  }
  return total;
}

// 设计师月度上线统计（新版核心 KPI）
// productDesigns: 全部 product_designs 数组
// designerId: 设计师 id
// month: YYYY-MM
function calcDesignerLaunchStats(productDesigns, designerId, month) {
  const list = productDesigns.filter(d => {
    if (d.user_id !== designerId) return false;
    // 用 launched_at_ms 判断上线月份（若没上线，跳过）
    if (!d.launched || !d.launched_at_ms) return false;
    const launchMonth = new Date(d.launched_at_ms).toISOString().slice(0, 7);
    return launchMonth === month;
  });
  // 合格上线（差异化 >= 3）
  const qualified = list.filter(isQualifiedLaunch);
  // 加权数量（鼓励高客单非标）
  let weightedCount = 0;
  const byCategory = { standard: 0, large_lamp: 0, engineering: 0, non_standard: 0 };
  qualified.forEach(d => {
    const cat = d.product_category || 'standard';
    const def = PRODUCT_CATEGORIES.find(c => c.id === cat) || PRODUCT_CATEGORIES[0];
    weightedCount += def.multiplier;
    if (byCategory[cat] != null) byCategory[cat]++;
  });
  return {
    rawList: list,           // 当月所有上线的（含不合格）
    qualifiedList: qualified, // 合格上线（差异化 >= 3 + 有链接）
    qualifiedCount: qualified.length,
    weightedCount,            // 按品类加权后的"等效款数"
    byCategory,
    unqualifiedCount: list.length - qualified.length
  };
}

// 计算月度三大维度得分（v22-C 新版：上线款数为核心）
// productDesigns: 该月所有产品设计
// monthlyData = { csTraining, csKbEntry, reviewQuality, reviewCoor, reviewResp, monthlyTarget, designerId, month }
// salaryRules
function calcDesignerMonthlyScore(productDesigns, monthlyData, salaryRules) {
  const m = monthlyData || {};
  const designerId = m.designerId;
  const month = m.month;
  const target = Number(m.monthlyTarget) || 40;
  // 1. 上线款数（核心 KPI，替代原"图纸积分"）
  const stats = calcDesignerLaunchStats(productDesigns, designerId, month);
  // 权重：客服未完成时升 launch 权重
  const trCount = Number(m.csTraining) || 0;
  const kbCount = Number(m.csKbEntry) || 0;
  const trScore = (Math.min(trCount, DESIGNER_CS_RULES.trainingBenchmark) / DESIGNER_CS_RULES.trainingBenchmark) * DESIGNER_CS_RULES.trainingMaxScore;
  const kbScore = (Math.min(kbCount, DESIGNER_CS_RULES.kbBenchmark) / DESIGNER_CS_RULES.kbBenchmark) * DESIGNER_CS_RULES.kbMaxScore;
  const csScore = trScore + kbScore;
  const isCsUnfinished = csScore < DESIGNER_CS_RULES.totalMaxScore;
  const launchMaxWeight = isCsUnfinished
    ? (salaryRules.launchKpiWeight + salaryRules.csKpiWeight)  // 70%
    : salaryRules.launchKpiWeight;  // 55%
  // 完成度（按加权数量 / 目标）
  const completion = target > 0 ? (stats.weightedCount / target) : 0;
  const launchScore = Math.min(launchMaxWeight, completion * launchMaxWeight);
  // 综合评价
  const vQ = Math.max(0, Math.min(100, Number(m.reviewQuality) || 0));
  const vC = Math.max(0, Math.min(100, Number(m.reviewCoor) || 0));
  const vR = Math.max(0, Math.min(100, Number(m.reviewResp) || 0));
  const reviewScore = (vQ / 100) * DESIGNER_REVIEW_WEIGHTS.quality
                    + (vC / 100) * DESIGNER_REVIEW_WEIGHTS.coordination
                    + (vR / 100) * DESIGNER_REVIEW_WEIGHTS.responsiveness;
  // 总分
  const totalScore = launchScore + csScore + reviewScore;
  // 工资计算（v22-C 新逻辑）
  const passScore = salaryRules.passScore;
  const baseSalary = salaryRules.baseSalary;
  const bonusMin = salaryRules.bonusMin;
  const bonusMax = salaryRules.bonusMax;
  const minLaunchRatio = salaryRules.minLaunchRatioForBase || 0.5;
  // 基本工资按完成度（核心改动）：
  //   completion >= 1 → 全额
  //   completion >= minLaunchRatio → 按比例
  //   completion < minLaunchRatio → baseSalaryFloor（默认 0）
  let payBase;
  if (completion >= 1) {
    payBase = baseSalary;
  } else if (completion >= minLaunchRatio) {
    payBase = baseSalary * completion;
  } else {
    payBase = salaryRules.baseSalaryFloor || 0;
  }
  // 绩效奖金：必须完成基础目标 + 总分达标
  let payBonus = 0;
  if (completion >= 1 && totalScore >= passScore) {
    payBonus = bonusMin + (bonusMax - bonusMin) * (Math.min(totalScore, 100) - passScore) / (100 - passScore);
  }
  return {
    // 上线统计
    launchTarget: target,
    launchQualified: stats.qualifiedCount,
    launchWeighted: stats.weightedCount,
    launchByCategory: stats.byCategory,
    launchUnqualified: stats.unqualifiedCount,
    launchCompletion: completion,
    launchScore,
    launchMaxWeight,
    qualifiedList: stats.qualifiedList,
    rawList: stats.rawList,
    isCsUnfinished,
    csScore, trScore, kbScore,
    reviewScore, vQ, vC, vR,
    totalScore,
    payBase, payBonus, payTotal: payBase + payBonus,
    isPass: totalScore >= passScore,
    isBaseFullyEarned: completion >= 1
  };
}



const TIER_LABELS = {
  official: '正式美工',
  newbie:   '新晋美工',
  alibaba:  '阿里巴巴美工',
  designer: '设计师',
  alibaba_sales: '📞 销售部',
  alibaba_artist: '🎨 阿里巴巴国际站美工',  // v22-DH: 何健斌 · 不计积分 · 只统计上传量
  photo_team: '📸 摄影部'
};

const TIER_COLORS = {
  official: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', value: '#16a34a' },
  newbie:   { bg: '#f0f9ff', border: '#bae6fd', text: '#075985', value: '#0284c7' },
  alibaba:  { bg: '#fffbeb', border: '#fde68a', text: '#92400e', value: '#d97706' },
  designer: { bg: '#faf5ff', border: '#e9d5ff', text: '#6b21a8', value: '#9333ea' },
  alibaba_sales: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', value: '#dc2626' },
  alibaba_artist: { bg: '#fefce8', border: '#fde047', text: '#854d0e', value: '#ca8a04' },  // v22-DH 黄色系
  photo_team: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', value: '#ea580c' }
};

// 10 家店铺 (Shopify)
const STORES = ['Vakkerlight','Radilum','Docos','Dekorfine','Mooijane','Pinlightins','Mooiehome','Rayonshine','Lumioshine','Mooielight'];

// 阿里巴巴美工固定店铺
const ALIBABA_STORE = '阿里巴巴国际站';

// 社媒 4 个 (无 TikTok)
const PLATFORMS = ['Pinterest','Facebook','Instagram','YouTube'];
const PLATFORM_CONTENT_TYPES = {
  'Pinterest': ['静态图钉','创意图钉(Idea Pin)','视频图钉'],
  'Facebook':  ['图片帖子','视频','Reel','Story','轮播'],
  'Instagram': ['图片帖子','Reel','Story','轮播'],
  'YouTube':   ['长视频','Shorts','直播','社区帖']
};

// Pinterest 广告维度
// PINTEREST_AD 常量已废弃 (v2 改为广告图制作，按数量算分)

// 店铺装修两档
const DECORATION_TYPES = [
  { id: 'simple', label: '简单换图', points: 20 },
  { id: 'event',  label: '活动页面', points: 50 }
];

// ====================== 任务类型定义 ======================
// 正式 / 新晋 用这 15 类
const STANDARD_TASK_TYPES = {
  // 主要工作 (6 类)
  product_upload:   { label: '产品上传',      icon: Upload,    accent: '#b45309', bg: '#fef3c7', group: 'main' },
  social_post:      { label: '社媒发布',      icon: Share2,    accent: '#0f766e', bg: '#ccfbf1', group: 'main' },
  blog:             { label: '博客',          icon: FileText,  accent: '#7c2d12', bg: '#fed7aa', group: 'main' },
  landing_page:     { label: '页面制作',      icon: Sparkles,  accent: '#831843', bg: '#fce7f3', group: 'main' },
  store_decoration: { label: '店铺装修',      icon: Paintbrush, accent: '#1e40af', bg: '#dbeafe', group: 'main' },
  ad_design:        { label: '广告图制作',    icon: Megaphone, accent: '#be123c', bg: '#ffe4e6', group: 'main' },
  // 其他工作 (9 类，原月度补录)
  review:           { label: '评价内容',      icon: Award,     accent: '#7c2d12', bg: '#fed7aa', group: 'extra' },
  email:            { label: '邮件营销',      icon: FileText,  accent: '#0f766e', bg: '#ccfbf1', group: 'extra' },
  edit:             { label: '简单修图',      icon: Edit3,     accent: '#b45309', bg: '#fef3c7', group: 'extra' },
  spec:             { label: '参数文档',      icon: FileText,  accent: '#1e40af', bg: '#dbeafe', group: 'extra' },
  video:            { label: '视频上传',      icon: Video,     accent: '#0f766e', bg: '#ccfbf1', group: 'extra' },
  install:          { label: '安装/3D图纸',   icon: Package,   accent: '#831843', bg: '#fce7f3', group: 'extra' },
  wholesale:        { label: '修改批发网站',  icon: Edit3,     accent: '#7c2d12', bg: '#fed7aa', group: 'extra' },
  product_modify_hr:{ label: '修改产品(小时)',icon: Clock,     accent: '#be123c', bg: '#ffe4e6', group: 'extra' },
  other_hr:         { label: '其他工作(小时)',icon: Clock,     accent: '#365314', bg: '#ecfccb', group: 'extra' }
};

// 阿里巴巴美工 5 类
const ALIBABA_TASK_TYPES = {
  alibaba_product:    { label: '产品上传',    icon: Package,    accent: '#b45309', bg: '#fef3c7', group: 'main' },
  alibaba_detail:     { label: '优化详情页',  icon: Sparkles,   accent: '#831843', bg: '#fce7f3', group: 'main' },
  alibaba_video:      { label: '视频上传',    icon: Video,      accent: '#0f766e', bg: '#ccfbf1', group: 'main' },
  alibaba_decoration: { label: '页面装修',    icon: Paintbrush, accent: '#1e40af', bg: '#dbeafe', group: 'main' },
  other_hr:           { label: '其他工作(小时)', icon: Clock,    accent: '#365314', bg: '#ecfccb', group: 'extra' }
};

const ALL_TASK_TYPES = { ...STANDARD_TASK_TYPES, ...ALIBABA_TASK_TYPES,
  // 扣分类型（仅 admin/supervisor 可创建，不出现在员工首页按钮里）
  penalty: { label: '⚠️ 扣分', icon: AlertCircle, accent: '#dc2626', bg: '#fee2e2', group: 'penalty' },
  // 汇报问题（员工录入，不算 KPI 分，主管首页能看到 pending 列表）
  report: { label: '⚡ 汇报问题', icon: Megaphone, accent: '#9333ea', bg: '#f3e8ff', group: 'report' }
};

// 评价内容 4 档
const REVIEW_TIERS = [
  { id: '8_13_no_img',  label: '8-13条 不带图',  points: 3 },
  { id: '8_13_img',     label: '8-13条 带图',    points: 4 },
  { id: '14_25_no_img', label: '14-25条 不带图', points: 6 },
  { id: '14_25_img',    label: '14-25条 带图',   points: 7 }
];

// 扣分类型 5 种（仅 admin/supervisor 可使用，建议默认分值可调）
const PENALTY_REASONS = [
  { id: 'late_reply',    label: '群里漏回复',   points: 3,  desc: '工作群有人 @ 或问问题但漏回' },
  { id: 'wrong_params',  label: '上传错误参数', points: 5,  desc: '上传产品/页面信息有误，需要返工' },
  { id: 'missed_task',   label: '漏处理工作',   points: 10, desc: '已安排的工作没完成、漏做或忘做' },
  { id: 'sloppy_work',   label: '敷衍工作',     points: 10, desc: '工作完成质量明显敷衍、不用心' },
  { id: 'uncooperative', label: '不配合工作',   points: 15, desc: '团队协作问题，影响他人工作' }
];

// 汇报相关部门
// v22-BA: 实际公司部门列表（不含"其他"·共 6 个部门）
const REPORT_DEPARTMENTS = ['客服', '跟单', '财务', '工厂', '美工', '人事'];

// 汇报紧急度
const REPORT_URGENCY = [
  { id: 'low',    label: '一般',  color: '#0f766e', bg: '#ccfbf1' },
  { id: 'medium', label: '较急',  color: '#b45309', bg: '#fef3c7' },
  { id: 'high',   label: '紧急',  color: '#dc2626', bg: '#fee2e2' }
];

// 汇报状态
const REPORT_STATUS = {
  pending:   { label: '待处理',   color: '#dc2626', bg: '#fee2e2' },
  handling:  { label: '处理中',   color: '#b45309', bg: '#fef3c7' },
  resolved:  { label: '已解决',   color: '#0f766e', bg: '#dcfce7' }
};

// ====================== 卖价计算器 ======================
// 包装尺寸缓冲（实际发货比标注略大）
const PACK_BUFFER = 2;
const CRATE_BUFFER = 5;

// 三家美东承运商定义（保守起见，全部按"加班船/大件"渠道）
const US_CARRIERS_EAST = [
  { id: 'my', name: '明扬加班船', minBw: 12 },
  { id: 'zs', name: '正石',       minBw: 4  },
  { id: 'ch', name: '昌晖加班船', minBw: 12 }
];

// 单个承运商对单个包装的运费（美东）
function calcCarrierBoxUS_East(carrierId, dims, weight, isCrate, surchargeBuffer) {
  const effDims = surchargeBuffer > 0
    ? [dims[0] + surchargeBuffer, dims[1] + surchargeBuffer, dims[2] + surchargeBuffer]
    : [...dims];
  const vol = (effDims[0] * effDims[1] * effDims[2]) / 6000;
  let bw = Math.max(vol, weight);
  const sides = [...effDims].sort((a, b) => b - a);
  const girth = sides[0] + 2 * (sides[1] + sides[2]);

  const carrier = US_CARRIERS_EAST.find(c => c.id === carrierId);
  bw = Math.max(bw, carrier.minBw);
  bw = Math.ceil(bw);

  let baseCost = 0, formula = '';

  // 美东价格表
  if (carrierId === 'ch') {
    // 昌晖加班船 east: base=165 / extra=17 / mid=21 / heavy=18
    const r = { b: 165, e: 17, m: 21, h: 18 };
    if (bw >= 101) { baseCost = bw * r.h; formula = `${bw}kg × ¥${r.h}`; }
    else if (bw >= 12) { baseCost = bw * r.m; formula = `${bw}kg × ¥${r.m}`; }
    else { baseCost = r.b + (bw - 5) * r.e; formula = `¥${r.b}+(${bw}-5)×¥${r.e}`; }
  } else if (carrierId === 'my') {
    // 明扬加班船 east: 100+用 16，12-100用 20，<12用 base=160/extra=17
    if (bw >= 101) { baseCost = bw * 16; formula = `${bw}kg × ¥16`; }
    else if (bw >= 12) { baseCost = bw * 20; formula = `${bw}kg × ¥20`; }
    else { baseCost = 160 + (bw - 5) * 17; formula = `¥160+(${bw}-5)×¥17`; }
  } else if (carrierId === 'zs') {
    // 正石 east: 4-10kg 阶梯价；11-95kg ¥19/kg；≥96kg ¥18/kg
    if (bw <= 10) {
      const steps = { 4: 155, 5: 160, 6: 166, 7: 172, 8: 178, 9: 184, 10: 190 };
      baseCost = steps[Math.max(bw, 4)] || steps[10];
      formula = `阶梯价 ${bw}kg`;
    } else {
      const rate = bw >= 96 ? 18 : 19;
      baseCost = bw * rate;
      formula = `${bw}kg × ¥${rate}`;
    }
  }

  // 各家附加费规则
  const surcharges = [];
  const addSur = (n, c) => surcharges.push({ name: n, cost: c });

  if (carrierId === 'ch') {
    if (isCrate) addSur('木箱费', 10);
    if (weight > 22.5) addSur('重量附加费', weight >= 40 ? 400 : 100);
    if (sides[0] > 120) addSur('超长附加费', sides[0] >= 240 ? 910 : 100);
    if (sides[1] >= 75) addSur('二边超限费', 100);
    if (girth > 265) addSur('围长附加费', girth > 320 ? 600 : 120);
  } else if (carrierId === 'my') {
    if (sides[0] >= 200) addSur('长边≥200', 200);
    else if (sides[0] > 120) addSur('长边120-200', 100);
    if (sides[1] > 75) addSur('二边>75', 100);
    if (weight >= 22) addSur('实重≥22', 100);
    if (girth >= 320) addSur('围长≥320', 600);
    else if (girth > 266) addSur('围长266-320', 100);
  } else if (carrierId === 'zs') {
    const dimSurs = [];
    if (sides[0] >= 120) dimSurs.push(80);
    if (sides[1] >= 76) dimSurs.push(80);
    if (girth >= 263 && girth < 326) dimSurs.push(80);
    if (sides[0] >= 240 || girth >= 326) dimSurs.push(500);
    if (dimSurs.length > 0) addSur('尺寸类附加(取最高项)', Math.max(...dimSurs));
    if (weight >= 40) addSur('实重附加费', 500);
    else if (weight >= 21) addSur('实重附加费', 80);
  }

  const surTotal = surcharges.reduce((s, x) => s + x.cost, 0);
  return {
    carrierId,
    name: US_CARRIERS_EAST.find(c => c.id === carrierId).name,
    freight: baseCost,
    billWeight: bw,
    formula,
    surcharges,
    surTotal,
    totalCost: baseCost + surTotal,
    sides,
    girth
  };
}

// 推演运费：三家美东渠道取最贵的作为保底基准（预留运费空间）
function calcShippingUS(packages) {
  const validPkgs = packages.filter(p => Number(p.l) > 0 && Number(p.w) > 0 && Number(p.h) > 0);
  if (validPkgs.length === 0) return null;

  // 计算所有包装的总围长、最大边等（用于判断哪些渠道可发）
  let overallMaxGirth = 0;
  let overallMaxSide = 0;
  let twoSidesOver200 = false;
  for (const p of validPkgs) {
    const buf = p.isCrate ? CRATE_BUFFER : PACK_BUFFER;
    const effDims = [Number(p.l) + buf, Number(p.w) + buf, Number(p.h) + buf];
    const sides = [...effDims].sort((a, b) => b - a);
    const girth = sides[0] + 2 * (sides[1] + sides[2]);
    overallMaxGirth = Math.max(overallMaxGirth, girth);
    overallMaxSide = Math.max(overallMaxSide, ...effDims);
    if (effDims.filter(d => d >= 200).length >= 2) twoSidesOver200 = true;
  }

  // === 三家美东加班船报价 ===
  const carrierResults = US_CARRIERS_EAST.map(carrier => {
    let total = 0;
    let totalBw = 0;
    let perBoxResults = [];
    for (const p of validPkgs) {
      const dims = [Number(p.l), Number(p.w), Number(p.h)];
      const weight = Number(p.weight) || 0;
      const qty = Number(p.qty) || 1;
      const isCrate = !!p.isCrate;
      const buf = isCrate ? CRATE_BUFFER : PACK_BUFFER;
      const r = calcCarrierBoxUS_East(carrier.id, dims, weight, isCrate, buf);
      total += r.totalCost * qty;
      totalBw += r.billWeight * qty;
      perBoxResults.push({ ...r, qty });
    }
    // 三家加班船判断超尺寸：围长 > 410cm 全部不可发
    const valid = overallMaxGirth <= 410;
    const invalidReason = !valid ? `围长 ${overallMaxGirth.toFixed(0)}cm > 410cm，加班船不可发` : null;
    const formulas = perBoxResults.map(r =>
      `${r.formula}${r.surTotal > 0 ? `+附¥${r.surTotal}` : ''}${r.qty > 1 ? `×${r.qty}件` : ''}`
    ).join('；');
    return {
      carrierId: carrier.id,
      name: carrier.name,
      totalCost: total,
      billWeight: Math.ceil(totalBw),
      formula: formulas,
      perBoxResults,
      valid,
      invalidReason
    };
  });

  // === 云鼎卡车报价（总重/总体积一次性算）===
  let totalVol = 0, totalActual = 0;
  for (const p of validPkgs) {
    const qty = Number(p.qty) || 1;
    const buf = p.isCrate ? CRATE_BUFFER : PACK_BUFFER;
    const effDims = [Number(p.l) + buf, Number(p.w) + buf, Number(p.h) + buf];
    totalVol += (effDims[0] * effDims[1] * effDims[2] * qty) / 6000;
    totalActual += (Number(p.weight) || 0) * qty;
  }
  let ydBw = Math.max(totalVol, totalActual);
  if (ydBw < 101) ydBw = 101;
  ydBw = Math.ceil(ydBw);
  const ydBase = ydBw * 20;
  const ydDelivery = 500;
  let ydSur = 0, ydTier = null;
  let ydInvalid = false, ydReason = null;
  if (overallMaxSide >= 600) { ydInvalid = true; ydReason = `最长边${overallMaxSide.toFixed(0)}cm≥600，云鼎不可发`; }
  else if (twoSidesOver200) { ydInvalid = true; ydReason = '任两边≥200cm，云鼎不可发'; }
  else if (overallMaxSide >= 500) { ydSur = Math.max(ydBw * 5, 10500); ydTier = '≥500cm'; }
  else if (overallMaxSide >= 400) { ydSur = Math.max(ydBw * 4, 4100); ydTier = '≥400cm'; }
  else if (overallMaxSide >= 300) { ydSur = Math.max(ydBw * 3, 2000); ydTier = '≥300cm'; }
  else if (overallMaxSide >= 250 && ydBw > 301) { ydSur = ydBw * 1; ydTier = '≥250cm'; }
  else if (overallMaxSide >= 250) { ydInvalid = true; ydReason = `长边${overallMaxSide.toFixed(0)}cm + ${ydBw}kg 云鼎需单询`; }
  const ydTotal = ydBase + ydDelivery + Math.round(ydSur);
  const ydResult = {
    carrierId: 'yd',
    name: '云鼎卡车',
    totalCost: ydInvalid ? Infinity : ydTotal,
    billWeight: ydBw,
    formula: `${ydBw}kg × ¥20 + ¥500派送${ydSur > 0 ? ` + ¥${Math.round(ydSur)}超长${ydTier}` : ''}`,
    valid: !ydInvalid,
    invalidReason: ydReason
  };

  // === 综合所有 4 家 → 选保底 ===
  const allCarriers = [...carrierResults, ydResult];
  const carriersValid = carrierResults.filter(c => c.valid);

  let maxResult;
  if (carriersValid.length > 0) {
    // 三家加班船至少一家可发 → 取三家中最贵作为保底（云鼎仅显示供参考，不参与保底）
    maxResult = carriersValid.reduce((max, r) => r.totalCost > max.totalCost ? r : max);
  } else if (ydResult.valid) {
    // 三家都不可发（围长 > 410cm 等）→ 云鼎成为唯一可发渠道，作为保底
    maxResult = ydResult;
  } else {
    // 所有渠道都不可发
    return {
      total: Infinity,
      type: '⚠️ 所有渠道均不可发',
      bw: 0,
      base: 0,
      surcharge: 0,
      formula: '尺寸/重量超出所有渠道限制',
      maxGirth: overallMaxGirth,
      comparison: allCarriers.map(c => ({
        carrierId: c.carrierId, name: c.name,
        total: c.totalCost, billWeight: c.billWeight,
        isMax: false, valid: false, invalidReason: c.invalidReason
      })),
      allInvalid: true
    };
  }

  return {
    total: maxResult.totalCost,
    type: maxResult.name + '（美东保底）',
    carrierId: maxResult.carrierId,
    bw: maxResult.billWeight,
    base: maxResult.totalCost,
    surcharge: 0,
    formula: maxResult.formula,
    maxGirth: overallMaxGirth,
    autoCarrierId: maxResult.carrierId, // 系统默认推荐
    comparison: allCarriers.map(c => ({
      carrierId: c.carrierId,
      name: c.name,
      total: c.totalCost,
      billWeight: c.billWeight,
      isMax: c.carrierId === maxResult.carrierId,
      valid: c.valid,
      invalidReason: c.invalidReason,
      formula: c.formula || ''
    }))
  };
}

// 木箱制造费
function calcCrateCost(l, w, h) {
  const surface = 2 * (l * w + l * h + w * h);
  return (surface / 10000) * 44; // 表面积 × ¥44/m²
}

// 美国建议售价
// 公式：(产品成本 + 推演运费 + 木箱费) × 防损系数 × 折扣系数 ÷ 汇率
function calcUSPrice(packages, purchaseCost, params = {}) {
  const damage = Number(params.damageMultiplier) || 2.0;
  const discount = Number(params.discountMultiplier) || 1.2;
  const rate = Number(params.exchangeRate) || 6.2;
  const cost = Number(purchaseCost) || 0;
  const overrideCarrierId = params.overrideCarrierId || null; // 美工手动选择的保底渠道

  const validPkgs = packages.filter(p => Number(p.l) > 0 && Number(p.w) > 0 && Number(p.h) > 0);
  const totalQty = validPkgs.reduce((s, p) => s + (Number(p.qty) || 1), 0);
  const totalProductCost = cost * totalQty;

  let totalCrateCost = 0;
  for (const p of validPkgs) {
    if (p.isCrate) totalCrateCost += calcCrateCost(Number(p.l), Number(p.w), Number(p.h)) * (Number(p.qty) || 1);
  }

  let shipping = calcShippingUS(packages);
  let shippingForPricing = shipping ? shipping.total : 0;

  // 如果美工手动选择了某个渠道，覆盖默认推荐
  if (shipping && overrideCarrierId && shipping.comparison) {
    const picked = shipping.comparison.find(c => c.carrierId === overrideCarrierId && c.valid);
    if (picked) {
      shippingForPricing = picked.total;
      shipping = {
        ...shipping,
        total: picked.total,
        type: picked.name + '（已手动选择）',
        carrierId: picked.carrierId,
        bw: picked.billWeight,
        formula: picked.formula,
        manualOverride: true,
        // 重新标记 isMax
        comparison: shipping.comparison.map(c => ({ ...c, isMax: c.carrierId === overrideCarrierId }))
      };
    }
  }

  const baseCost = totalProductCost + shippingForPricing + totalCrateCost;
  const suggestedTotalUSD = (baseCost * damage * discount) / rate;
  const suggestedUnitUSD = totalQty > 0 ? suggestedTotalUSD / totalQty : 0;

  return {
    valid: cost > 0 && totalQty > 0,
    totalProductCost,
    totalCrateCost,
    shipping,
    shippingForPricing,
    baseCost,
    totalQty,
    suggestedTotalUSD,
    suggestedUnitUSD,
    damage, discount, rate
  };
}

// ====================== Gemini AI 生图 ======================
// API key 对称加密 (AES-GCM)
// 安全级别：防止 Supabase 数据被脱库后直接读到 API key
// 注意：前端代码可见时无法防住技术员工解密 —— 这是 SPA 架构的固有限制
async function aesDeriveKey() {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode('wt_dekorfine_gem_v1_2026'),
    { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('wt_gem_salt_v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptApiKey(plain) {
  if (!plain) return '';
  const key = await aesDeriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), iv.length);
  return 'enc:' + btoa(String.fromCharCode(...combined));
}

async function decryptApiKey(encoded) {
  if (!encoded) return '';
  if (!encoded.startsWith('enc:')) return encoded; // 兼容明文（升级前）
  try {
    const key = await aesDeriveKey();
    const combined = Uint8Array.from(atob(encoded.slice(4)), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch (e) {
    console.error('解密 API key 失败:', e);
    return '';
  }
}

// Gemini 图像模型列表
const GEMINI_IMAGE_MODELS = [
  {
    id: 'gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    desc: '🍌 Nano Banana — 支持参考图修改/场景合成（推荐日常使用）',
    supportsImageInput: true,
    api: 'generateContent',
    badge: '推荐'
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    desc: '🍌🍌 Nano Banana 2 — 2026 新版，更细腻的材质表现（preview）',
    supportsImageInput: true,
    api: 'generateContent',
    badge: '最新'
  },
  {
    id: 'imagen-4.0-ultra-generate-001',
    name: 'Imagen 4 Ultra',
    desc: '最高画质 — 仅文字描述生成（不支持参考图），适合纯创意场景',
    supportsImageInput: false,
    api: 'predict',
    badge: '顶级'
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4',
    desc: '高画质 — 文生图，平衡速度与质量',
    supportsImageInput: false,
    api: 'predict',
    badge: ''
  },
  {
    id: 'imagen-4.0-fast-generate-001',
    name: 'Imagen 4 Fast',
    desc: '快速生成 — 适合批量出图',
    supportsImageInput: false,
    api: 'predict',
    badge: '快速'
  }
];

// v22-J: OpenAI 图像模型（备用方案）
// 需要 API Organization Verification 才能用 gpt-image 系列
const OPENAI_IMAGE_MODELS = [
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    desc: '🔥 2026 最新 — 推理模型 · 文字渲染最准 · 任意尺寸 · 多图输入（顶级）',
    supportsImageInput: true,
    api: 'openai-image',
    badge: '最新顶级'
  },
  {
    id: 'gpt-image-1.5',
    name: 'GPT Image 1.5',
    desc: '✨ 改进版 — 品牌一致性强 · 比 gpt-image-1 便宜 20% · 多图编辑',
    supportsImageInput: true,
    api: 'openai-image',
    badge: '推荐'
  },
  {
    id: 'gpt-image-1',
    name: 'GPT Image 1',
    desc: '原版 — 文字渲染精准 · 适合海报/UI / Logo（贵）',
    supportsImageInput: true,
    api: 'openai-image',
    badge: ''
  },
  {
    id: 'gpt-image-1-mini',
    name: 'GPT Image 1 Mini',
    desc: '💰 便宜 — 速度快 · 适合批量出图（性价比之选）',
    supportsImageInput: true,
    api: 'openai-image',
    badge: '便宜'
  },
  {
    id: 'dall-e-3',
    name: 'DALL·E 3',
    desc: '老牌 — 纯文生图 (不支持参考图)，已被 GPT Image 取代但仍可用',
    supportsImageInput: false,
    api: 'openai-image',
    badge: ''
  }
];

// 旧模型 ID → 新模型 ID 的映射（用户旧 config 自动迁移）
const MODEL_ID_MIGRATIONS = {
  'gemini-2.5-flash-image-preview': 'gemini-2.5-flash-image',
  'imagen-3.0-generate-002': 'imagen-4.0-generate-001'
};
function migrateModelId(id) {
  return MODEL_ID_MIGRATIONS[id] || id;
}

// v22-AH: AI 定价表（USD · 基于 2026 官方价格，admin 可在 团队管理 调整）
// 图像：per image · 文本：per 1M tokens
const AI_PRICING = {
  // OpenAI Image（gpt-image-* 按 quality 计费）
  'gpt-image-2':         { type: 'image', low: 0.011, medium: 0.042, high: 0.080, standard: 0.042 },
  'gpt-image-1.5':       { type: 'image', low: 0.011, medium: 0.042, high: 0.080, standard: 0.042 },
  'gpt-image-1':         { type: 'image', low: 0.011, medium: 0.042, high: 0.080, standard: 0.042 },
  'gpt-image-1-mini':    { type: 'image', low: 0.005, medium: 0.018, high: 0.040, standard: 0.018 },
  'dall-e-3':            { type: 'image', standard: 0.040, hd: 0.080 },
  // Gemini Image
  'gemini-2.5-flash-image':       { type: 'image', flat: 0.039 },
  'gemini-3.1-flash-image-preview': { type: 'image', flat: 0.039 },
  'imagen-4.0-ultra-generate-001':  { type: 'image', flat: 0.060 },
  'imagen-4.0-generate-001':        { type: 'image', flat: 0.040 },
  'imagen-4.0-fast-generate-001':   { type: 'image', flat: 0.020 },
  // Gemini Text (per 1M tokens)
  'gemini-2.5-flash':    { type: 'text', input: 0.075, output: 0.30 },
  'gemini-2.5-pro':      { type: 'text', input: 1.25,  output: 5.00 },
  // Claude (per 1M tokens)
  'claude-haiku-4-5-20251001':  { type: 'text', input: 1.00,  output: 5.00 },
  'claude-sonnet-4-5-20250929': { type: 'text', input: 3.00,  output: 15.00 },
  'claude-opus-4-5-20251108':   { type: 'text', input: 15.00, output: 75.00 },
  // OpenAI Text (per 1M tokens)
  'gpt-4o':              { type: 'text', input: 2.50,  output: 10.00 },
  'gpt-4o-mini':         { type: 'text', input: 0.15,  output: 0.60 },
  'gpt-4-turbo':         { type: 'text', input: 10.00, output: 30.00 },
  'o3':                  { type: 'text', input: 5.00,  output: 20.00 },
  'o3-mini':             { type: 'text', input: 1.10,  output: 4.40 }
};

// 估算单次调用费用（USD）
function estimateCost(model, params = {}) {
  if (!model) return 0;
  // 处理 [provider] model 前缀（如 "[gemini] gemini-2.5-flash-image"）
  const cleanModel = model.replace(/^\[[^\]]+\]\s*/, '').replace(/^\[[A-Za-z-]+\]\s*/, '').trim();
  // 提取 base model（处理类似 "claude-haiku-4-5-20251001" → 匹配前缀）
  let p = AI_PRICING[cleanModel];
  if (!p) {
    // 模糊匹配（处理日期后缀）
    for (const key of Object.keys(AI_PRICING)) {
      if (cleanModel.startsWith(key.split('-2025')[0].split('-2026')[0])) { p = AI_PRICING[key]; break; }
    }
  }
  if (!p) return 0;
  if (p.type === 'image') {
    if (p.flat !== undefined) return p.flat;
    const q = (params.quality || 'standard').toLowerCase();
    // 映射 hd / 4k → high；standard → medium for gpt-image
    const qMap = { hd: 'high', '4k': 'high', auto: 'medium' };
    const qKey = qMap[q] || q;
    return p[qKey] || p.standard || p.medium || 0.04;
  } else if (p.type === 'text') {
    const inTok = params.inputTokens || params.input_tokens || 1500;  // 默认估算
    const outTok = params.outputTokens || params.output_tokens || 600;
    return (p.input * inTok / 1e6) + (p.output * outTok / 1e6);
  }
  return 0;
}
function fmtUsd(n) {
  if (n == null || isNaN(n)) return '$0.00';
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toFixed(2);
}

const ASPECT_RATIOS = [
  // v22-BH: 原图比例（自动取参考图的宽高比，默认推荐）
  { id: 'original', label: '原图比例', pixels: '跟随上传图', tip: '★ 保持参考图比例 · 不裁剪不变形' },
  { id: '1:1',  label: '正方形 1:1',  pixels: '1024×1024', tip: '主图 · 详情' },
  { id: '3:4',  label: '竖版 3:4',    pixels: '896×1280',  tip: '海报 · 详情图' },
  { id: '4:3',  label: '横版 4:3',    pixels: '1280×896',  tip: '场景图' },
  { id: '9:16', label: '竖屏 9:16',   pixels: '768×1408',  tip: '手机 · IG Story' },
  { id: '16:9', label: '宽屏 16:9',   pixels: '1408×768',  tip: '横幅 · YouTube' },
  // v22-D 新增
  { id: '2:3',  label: '竖版 2:3',    pixels: '832×1248',  tip: 'Pinterest · 杂志' },
  { id: '3:2',  label: '横版 3:2',    pixels: '1248×832',  tip: '相机 · 风景' },
  { id: '5:4',  label: '画幅 5:4',    pixels: '1152×922',  tip: '近正方 · 大画幅' },
  { id: '4:5',  label: '竖版 4:5',    pixels: '922×1152',  tip: '社媒 · IG' },
  { id: '21:9', label: '超宽 21:9',   pixels: '1728×740',  tip: '电影 · 全屏 banner' }
];

// 灯具品类
const LIGHT_CATEGORIES = [
  { id: 'all',         label: '全部',       icon: '📋' },
  { id: 'favorite',    label: '我的收藏',   icon: '⭐' },
  { id: 'wall_sconce', label: '壁灯',       icon: '🏛️' },
  { id: 'table_lamp',  label: '台灯',       icon: '💡' },
  { id: 'floor_lamp',  label: '落地灯',     icon: '🪴' },
  { id: 'pendant',     label: '吊灯',       icon: '🎇' },
  { id: 'chandelier',  label: '枝形吊灯',   icon: '👑' },
  { id: 'flush_mount', label: '吸顶灯',     icon: '⭕' },
  { id: 'corridor_light', label: '过道灯',  icon: '🚪' },
  { id: 'fan_light',   label: '风扇灯',     icon: '🌀' },
  { id: 'material',    label: '材质改造',   icon: '🪨' },
  { id: 'tool',        label: '后期工具',   icon: '🔧' }
];

// 美式高端装饰风格
const LIGHT_STYLES = [
  { id: 'all',             label: '全部风格',  color: '#78716c' },
  { id: 'rh_luxury',       label: 'RH 奢华',    color: '#78716c', badge: 'RH' },
  { id: 'vc_classic',      label: 'VC 经典',    color: '#a8a29e', badge: 'VC' },
  { id: 'pottery_barn',    label: 'Pottery Barn', color: '#a16207', badge: 'PB' },
  { id: 'west_elm',        label: 'West Elm',   color: '#525252', badge: 'WE' },
  { id: 'farmhouse',       label: '美式农舍',   color: '#d6d3d1', badge: 'FH' },
  { id: 'coastal',         label: '海岸风',     color: '#0891b2', badge: 'CO' },
  { id: 'modern_minimal',  label: '现代极简',   color: '#404040', badge: 'MM' },
  { id: 'transitional',    label: '过渡式',     color: '#737373', badge: 'TR' },
  { id: 'industrial',      label: '工业风',     color: '#1f2937', badge: 'IN' },
  { id: 'traditional',     label: '传统美式',   color: '#7c2d12', badge: 'TA' },
  { id: 'mansion_luxe',    label: '顶级豪宅',   color: '#854d0e', badge: '👑' },
  { id: 'tool',            label: '工具',       color: '#9333ea', badge: '🔧' }
];

// Prompt 模板（针对美国顶级消费市场深度优化 · 雪花石 + 黄铜重点）
const DEFAULT_PROMPT_TEMPLATES = [
  // ============== 壁灯 Wall Sconces ==============
  {
    id: 'wall_alabaster_powder', icon: '🤍', category: 'wall_sconce', style: 'mansion_luxe',
    name: '西班牙雪花石卫浴壁灯', desc: 'Spanish alabaster · 大理石 · 顶级浴室',
    prompt: 'Place this wall sconce, featuring a Spanish alabaster shade (translucent warm cream with natural mineral veining glowing softly), in an ultra-luxurious primary bathroom of a Beverly Hills mansion. Bookmatched Calacatta Gold marble walls and floor, freestanding Victoria + Albert soaking tub, polished antique brass faucets, custom-cabinetry vanity with cremawhite marble countertop, sheer linen Roman shades, fresh white orchids. Warm 2700K glow emanating from the alabaster diffusing across the marble. Magazine cover quality, Architectural Digest editorial photography, 8K hyperrealistic, soft golden hour ambiance.'
  },
  {
    id: 'wall_brass_library', icon: '📚', category: 'wall_sconce', style: 'mansion_luxe',
    name: '抛光黄铜书房壁灯', desc: 'Polished brass · 红木 · 大宅书房',
    prompt: 'Mount these wall sconces with hand-finished polished antique brass arms, flanking a magnificent floor-to-ceiling bookshelf in a Manhattan penthouse library. Walnut paneled walls, custom mahogany built-in bookcases filled with leather-bound first editions, rolling library ladder in brass, oversized leather Chesterfield sofa, Persian Heriz rug on herringbone oak floor, antique globe, single malt scotch on a silver tray. Warm 2700K candlelight glow. Old-money aesthetic, Ralph Lauren Home meets Hermès, magazine cover quality.'
  },
  {
    id: 'wall_rh_hallway', icon: '🏛️', category: 'wall_sconce', style: 'rh_luxury',
    name: 'RH 庄园走廊壁灯', desc: 'Aged bronze · 老橡木护墙 · 石灰岩',
    prompt: 'Place this wall sconce with aged bronze finish in a Restoration Hardware-inspired estate hallway. Hand-troweled Venetian plaster walls in warm bone, reclaimed French oak wainscoting, French limestone floor with antique patina, oversized hand-forged iron-framed antique mirror, weathered console table styled with a single bronze sculpture and unlit beeswax candles. Soft natural golden hour light filtering through tall windows. Rustic modern luxe, French chateau influence, dramatic shadows, magazine cover quality, 8K cinematic.'
  },
  {
    id: 'wall_vc_powder', icon: '✨', category: 'wall_sconce', style: 'vc_classic',
    name: 'VC 风格客卫壁灯', desc: 'Polished nickel · 白瓷罩 · Aerin 风',
    prompt: 'Mount a pair of these wall sconces flanking a framed antique mirror in an elegant powder room. Visual Comfort-inspired refined American classic by Aerin Lauder: polished nickel finish with white opal hand-blown glass shade, soft Farrow & Ball Pavilion Gray walls, Carrara marble vanity countertop, polished nickel Waterworks faucet, herringbone Calacatta marble floor, fresh peonies in a silver mint julep cup, Architectural Digest editorial quality, warm refined evening ambiance.'
  },
  {
    id: 'wall_pb_bedroom', icon: '🛏️', category: 'wall_sconce', style: 'pottery_barn',
    name: 'PB 卧室床头壁灯（对装）', desc: 'Antique brass · 亚麻床头 · 暖白',
    prompt: 'Mount a pair of these antique brass swing-arm wall sconces above a luxurious bed headboard. Pottery Barn-inspired primary bedroom: oatmeal Belgian linen tufted headboard, crisp white French linen bedding with cashmere throw, soft warm white Farrow & Ball walls, gallery wall of framed family photographs in vintage brass frames, vintage Heriz Persian rug on wide-plank oak floors, antique nightstands styled with stacked books and lit Diptyque candles. Soft warm 2700K bedside glow, cozy welcoming evening ambiance, magazine-quality lifestyle photography.'
  },
  {
    id: 'wall_we_modern', icon: '🌃', category: 'wall_sconce', style: 'west_elm',
    name: 'West Elm 现代过道壁灯', desc: 'Brushed brass · 烟熏玻璃 · 都市',
    prompt: 'Place this wall sconce featuring brushed brass finish with smoked amber glass shade in a sophisticated modern urban hallway. West Elm aesthetic: warm white walls, mid-century walnut console table, single sculptural ceramic vase, framed black-and-white street photography prints in thin black frames, polished concrete floor with kilim runner. Contemporary American mid-century modern style, sleek sophisticated evening lighting, gallery-quality photography.'
  },

  // ============== 台灯 Table Lamps ==============
  {
    id: 'table_alabaster_living', icon: '🤍', category: 'table_lamp', style: 'mansion_luxe',
    name: '雪花石客厅台灯（对装）', desc: 'Spanish alabaster · 黄铜底座 · 大宅',
    prompt: 'Place a pair of these table lamps featuring carved Spanish alabaster bases (warm cream with golden honey veining glowing from within) with hand-finished polished brass details, flanking a tufted velvet sofa in a Beverly Hills mansion living room. Custom silk-blend linen drum shades, Italian travertine coffee table, oversized abstract painting in a museum-quality frame, antique Persian Tabriz rug on herringbone oak floors, fresh white peonies in crystal vases, layered ambient lighting. Architectural Digest cover quality, 8K hyperrealistic, golden hour light streaming through floor-to-ceiling windows, warm muted palette: cream, ivory, antique brass.'
  },
  {
    id: 'table_brass_console', icon: '🟡', category: 'table_lamp', style: 'mansion_luxe',
    name: '古董黄铜玄关台灯', desc: 'Antique brass · 大宅玄关 · 古典',
    prompt: 'Place this antique brass table lamp with hand-applied verde antique patina on an elegant entryway console table in a Manhattan Upper East Side townhouse. Soft Farrow & Ball Drawing Room Blue walls, gold-leafed Louis XVI mirror above, fresh white French tulips in a silver Tiffany & Co vase, family heirloom silver picture frames, vintage Heriz runner on polished marble floor. Warm welcoming evening light, old-money elegance, Ralph Lauren Home aesthetic, magazine cover quality.'
  },
  {
    id: 'table_rh_bedroom', icon: '🛌', category: 'table_lamp', style: 'rh_luxury',
    name: 'RH 主卧床头台灯', desc: 'Hand-spun linen · 青铜底 · 奢华软装',
    prompt: 'Place this table lamp with hand-spun linen drum shade and aged bronze base on an antique-finish nightstand in a Restoration Hardware-inspired primary bedroom. Tufted Belgian linen headboard in warm taupe, oversized down-filled cream bedding with antique cashmere throw, oversized landscape oil painting above the bed, custom-built antique nightstand styled with leather-bound books and unlit beeswax candles, hand-knotted Moroccan rug on wide-plank French oak floors. Soft warm 2700K bedside glow, European-influenced American luxury, rustic modern luxe aesthetic.'
  },
  {
    id: 'table_vc_living', icon: '🛋️', category: 'table_lamp', style: 'vc_classic',
    name: 'VC 客厅边几台灯', desc: 'Hand-thrown ceramic · 大理石几',
    prompt: 'Place this table lamp featuring a hand-thrown ceramic base and Belgian linen drum shade on a Calacatta marble side table next to a tufted Chesterfield sofa. Visual Comfort-inspired classic American living room by Suzanne Kasler: antique gold-leafed mirror above the limestone fireplace, traditional Sultanabad area rug on herringbone oak floors, fresh peonies in a Chinese export blue-and-white porcelain vase, layered traditional and modern art. Soft natural daylight from custom arched windows, refined American classic aesthetic, Architectural Digest editorial photography.'
  },
  {
    id: 'table_modern_desk', icon: '📚', category: 'table_lamp', style: 'modern_minimal',
    name: '现代书桌台灯', desc: '白橡木 + 极简 + Apple 美学',
    prompt: 'Place this minimalist desk lamp with brushed brass arm on a clean modern home office desk. Solid white oak hairpin-leg desk, Farrow & Ball Strong White walls, single beautiful Phaidon design book on the corner, white ceramic Hasami Porcelain mug with steaming pour-over coffee, closed MacBook in space gray, fresh white tulips in a clear glass cylinder vase. Bright natural daylight from large window with linen Roman shade. Minimalist Scandinavian-American style, productivity-focused workspace, West Elm meets Aesop store aesthetic.'
  },

  // ============== 落地灯 Floor Lamps ==============
  {
    id: 'floor_alabaster_living', icon: '🤍', category: 'floor_lamp', style: 'mansion_luxe',
    name: '雪花石落地灯·大宅客厅', desc: 'Spanish alabaster · 抛光黄铜 · 落地',
    prompt: 'Place this floor lamp featuring a carved Spanish alabaster shade (translucent warm cream with natural mineral veining, glowing softly from within) on a polished antique brass tripod base, beside an oversized down-filled silk velvet sofa in a Hamptons oceanfront estate living room. Floor-to-ceiling steel-framed windows with ocean view, weathered French oak coffee table styled with art books, hand-knotted Moroccan ivory rug on wide-plank French oak floors, abstract oil painting on linen-paneled walls, fresh white peonies. Warm muted palette: cream, ivory, soft sand, antique brass. Cinematic golden hour light, oversized scale, rustic modern luxe, magazine cover quality.'
  },
  {
    id: 'floor_rh_living', icon: '🏛️', category: 'floor_lamp', style: 'rh_luxury',
    name: 'RH 客厅奢华落地灯', desc: '亚麻沙发旁 · 大空间 · 暖灰',
    prompt: 'Place this floor lamp with aged iron column and oversized hand-spun linen drum shade beside an oversized down-filled Belgian linen sofa in a Restoration Hardware-inspired great room. Weathered French oak coffee table stacked with leather-bound art books, hand-knotted Moroccan area rug on wide-plank reclaimed oak floors, oversized abstract canvas art on Venetian plaster walls, floor-to-ceiling steel-framed industrial windows. Warm muted palette: cream, oatmeal, taupe, aged bronze. Cinematic natural golden hour daylight, oversized estate-scale proportions, rustic modern luxe aesthetic.'
  },
  {
    id: 'floor_reading_nook', icon: '📖', category: 'floor_lamp', style: 'transitional',
    name: '阅读角落地灯', desc: 'Worn leather wingback · 内嵌书架',
    prompt: 'Place this floor lamp beside a cozy reading nook in a Connecticut country estate. Worn cognac leather wingback chair, chunky hand-knit cream cashmere throw blanket, vintage Persian Heriz rug, small antique side table with stacked hardcover books and steaming hand-thrown ceramic mug. Built-in painted bookshelves floor-to-ceiling on the wall behind filled with leather-bound first editions, soft warm focused reading light. Hygge atmosphere, late afternoon golden ambiance, Pottery Barn meets RH transitional style.'
  },

  // ============== 吊灯 Pendants ==============
  {
    id: 'pendant_alabaster_island', icon: '🤍', category: 'pendant', style: 'mansion_luxe',
    name: '雪花石厨房岛台吊灯', desc: 'Spanish alabaster · 大宅厨房',
    prompt: 'Hang a row of three of these large bowl-shaped Spanish alabaster pendant lights (translucent warm cream with natural honey veining, glowing softly) above an oversized kitchen island in a Hamptons estate kitchen. Custom inset shaker cabinetry painted in Farrow & Ball Pigeon, bookmatched Calacatta Gold marble waterfall countertops, large apron-front farmhouse sink in fireclay, polished antique brass faucet and hardware, full-height bookmatched marble backsplash, wide-plank French oak floors. Counter-height leather barstools, fresh white peonies in a hand-thrown ceramic vase. Warm 2700K alabaster glow, magazine cover quality, golden hour light streaming through tall windows.'
  },
  {
    id: 'pendant_brass_island', icon: '🟡', category: 'pendant', style: 'mansion_luxe',
    name: '抛光黄铜厨房岛台吊灯', desc: 'Polished brass · 大理石 · 顶级厨房',
    prompt: 'Hang a row of three of these polished antique brass pendant lights above a long kitchen island in a Manhattan penthouse. Custom inset shaker cabinetry in Farrow & Ball Dimpse, bookmatched Calacatta Borghini marble waterfall countertops, polished antique brass cabinet hardware and Waterworks faucets, full-height marble backsplash, wide-plank smoked oak floors. Counter-height vintage leather barstools, La Marzocco espresso machine on the counter, fresh white tulips in a crystal vase. Warm 2700K pendant glow, Architectural Digest cover quality, soft natural daylight.'
  },
  {
    id: 'pendant_farmhouse_kitchen', icon: '🍳', category: 'pendant', style: 'farmhouse',
    name: '农舍厨房岛台吊灯（三盏）', desc: '白橱柜 · 大理石 · 暖色',
    prompt: 'Hang a row of three of these pendant lights above a long kitchen island. Modern farmhouse kitchen: shaker-style white cabinets, Carrara marble waterfall countertops, large apron-front fireclay farmhouse sink, polished antique brass Waterworks faucet, white subway tile backsplash with dark grout, wide-plank white oak floors, vintage leather counter stools, fresh sourdough on a Boos cutting board. Warm 2700K pendant glow, Joanna Gaines Magnolia Home aesthetic, bright airy morning daylight, magazine quality.'
  },
  {
    id: 'pendant_rh_dining', icon: '🍽️', category: 'pendant', style: 'rh_luxury',
    name: 'RH 餐厅大吊灯（单盏）', desc: '回收木桌 · 大尺寸 · 复古',
    prompt: 'Hang this oversized aged iron and hand-spun linen pendant light over a 12-foot reclaimed weathered French oak farmhouse dining table. Restoration Hardware-inspired dining room: Belgian linen slipcovered dining chairs, antique sideboard styled with abstract bronze sculpture, oversized vintage landscape oil painting on Venetian plaster walls, hand-troweled limestone floor, exposed reclaimed wood ceiling beams. Warm muted palette: cream, taupe, walnut, aged bronze. Soft natural light from tall steel-framed industrial windows, Architectural Digest editorial photography, rustic modern luxe.'
  },
  {
    id: 'pendant_entryway_grand', icon: '🚪', category: 'pendant', style: 'mansion_luxe',
    name: '大宅玄关挑空吊灯', desc: '大理石棋盘 · 旋转楼梯',
    prompt: 'Hang this elegant pendant light in a two-story grand entryway of a Park Avenue penthouse. Honed Calacatta Gold marble checkerboard floor, sweeping curved staircase with hand-forged iron railing, antique French console table styled with fresh white French tulips in a crystal vase, gold-leafed Louis XV mirror, oversized abstract painting. Soft natural daylight from oversized skylight above and tall arched windows. Refined American luxury, Architectural Digest cover quality.'
  },

  // ============== 枝形吊灯 Chandeliers ==============
  {
    id: 'chand_alabaster_dining', icon: '🤍', category: 'chandelier', style: 'mansion_luxe',
    name: '雪花石枝形吊灯·正式餐厅', desc: 'Spanish alabaster + brass · 顶级',
    prompt: 'Hang this magnificent chandelier featuring carved Spanish alabaster bowls and shades (translucent warm cream with natural honey veining glowing softly) suspended from a polished antique brass frame, above an elegant formal dining table for 12 in a Bel-Air mansion. Custom mahogany Chippendale-style dining table, upholstered host and side chairs in Belgian linen, traditional botanical Audubon prints in gold frames, soft Farrow & Ball Pavilion Gray walls, herringbone French oak floors with traditional Sultanabad rug, fresh white peonies in crystal vases on the table. Warm 2700K alabaster glow, Architectural Digest cover quality, Aerin Lauder meets Ralph Lauren Home aesthetic.'
  },
  {
    id: 'chand_brass_dining', icon: '🟡', category: 'chandelier', style: 'mansion_luxe',
    name: '古董黄铜枝形吊灯·正式餐厅', desc: 'Antique brass · 水晶 · 经典美式',
    prompt: 'Hang this magnificent chandelier featuring hand-finished antique brass arms with crystal accents and white opal glass globes, above an elegant formal dining table for 10 in a Greenwich Connecticut estate dining room. Visual Comfort-inspired classic American: mahogany dining table, upholstered Chippendale chairs in Belgian linen, traditional botanical and equestrian prints in gold-leafed frames, Farrow & Ball Eating Room Red walls, polished hardwood floors with traditional Heriz rug, fresh roses in silver bowls. Warm refined candlelit atmosphere, Aerin Lauder meets Ralph Lauren Home, Architectural Digest editorial quality.'
  },
  {
    id: 'chand_rh_foyer', icon: '👑', category: 'chandelier', style: 'rh_luxury',
    name: 'RH 双层挑空巨型枝形吊灯', desc: '铸铁水晶 · 城堡感 · 巨型',
    prompt: 'Hang this oversized magnificent chandelier in a Restoration Hardware-inspired double-height grand foyer. Hand-forged iron and crystal chandelier dramatically suspended from a high vaulted ceiling with exposed weathered wood beams. French limestone floor in large square tiles with antique patina, oversized antique tapestry on hand-troweled Venetian plaster walls, grand curved limestone staircase with hand-forged iron railing, tall arched steel-framed industrial windows letting in soft natural light, weathered antique console with single bronze sculpture. European castle / French chateau aesthetic, dramatic vertical scale, cinematic magazine cover quality, 8K hyperrealistic.'
  },
  {
    id: 'chand_modern_dining', icon: '💎', category: 'chandelier', style: 'modern_minimal',
    name: '现代极简雕塑吊灯', desc: '黄铜 · 简约餐厅 · Lumens',
    prompt: 'Hang this modern sculptural chandelier featuring polished antique brass arms with frosted globe accents above a contemporary dining table. Minimalist Manhattan penthouse dining room: live-edge walnut dining table, leather-strap dining chairs by Hans Wegner, brushed brass accents, polished concrete floor, single oversized abstract painting on Farrow & Ball Strong White walls, ceramic vases with single dried branches. Sculptural light fixture as the focal centerpiece, Lumens / YLighting aesthetic, gallery-quality architectural editorial photography.'
  },

  // ============== 吸顶灯 Flush Mounts ==============
  {
    id: 'flush_alabaster_bedroom', icon: '🤍', category: 'flush_mount', style: 'mansion_luxe',
    name: '雪花石主卧吸顶灯', desc: 'Spanish alabaster · 顶级卧室',
    prompt: 'Mount this semi-flush mount ceiling light featuring carved Spanish alabaster (translucent warm cream glowing softly with natural veining) framed in polished antique brass, in a serene primary bedroom of a Beverly Hills mansion. Upholstered Belgian linen headboard bed with crisp white French linen bedding, cashmere throw blanket, soft Farrow & Ball Wimborne White walls, wide-plank French oak floors, hand-knotted Moroccan ivory rug, custom-built bedside tables styled with leather-bound books and fresh white peonies. Warm cozy peaceful atmosphere, late afternoon golden hour light, Architectural Digest editorial quality.'
  },
  {
    id: 'flush_pb_bedroom', icon: '🌙', category: 'flush_mount', style: 'pottery_barn',
    name: 'PB 主卧吸顶灯', desc: '温馨 · 米色 · 软装',
    prompt: 'Mount this flush mount or semi-flush mount ceiling light in a serene Pottery Barn-style primary bedroom. Upholstered Belgian linen headboard bed with crisp white linen bedding, soft Farrow & Ball Slipper Satin walls, wide-plank white oak floors, vintage Persian Heriz rug, antique brass nightstands styled with framed family photographs and fresh hydrangeas. Warm cozy atmosphere, late afternoon golden hour light, magazine-quality lifestyle photography.'
  },
  {
    id: 'flush_modern_kitchen', icon: '🍳', category: 'flush_mount', style: 'modern_minimal',
    name: '现代极简厨房吸顶灯', desc: '极简 · 白 · 黄铜',
    prompt: 'Mount this minimalist flush mount light in a modern luxury kitchen ceiling. Custom Italian handle-less cabinets in matte Farrow & Ball Strong White, full-height bookmatched Calacatta Gold marble backsplash and waterfall countertops, polished antique brass hardware accents, oversized island with vintage leather counter stools, La Marzocco espresso machine. Clean modern American kitchen, bright natural daylight from oversized skylights, West Elm meets Boffi aesthetic, gallery-quality architectural photography.'
  },
  {
    id: 'flush_travertine_entryway', icon: '🪨', category: 'flush_mount', style: 'mansion_luxe',
    name: '洞石玄关吸顶灯', desc: 'Travertine · 自然纹理 · 暖光',
    prompt: 'Mount this flush mount ceiling light featuring honed travertine stone (warm cream with natural earthy veining and subtle fossil texture) with hand-finished antique brass trim, in a grand entryway of a Beverly Hills Tuscan villa. Imported French limestone floors with subtle herringbone pattern, hand-troweled Venetian plaster walls in warm Slipper Satin, antique brass console table with fluted travertine top, large gilt-framed Italian Renaissance oil painting, fresh olive branches in antique terracotta urns. Warm golden hour light filtering through, Architectural Digest editorial photography, 8K hyperrealistic.'
  },
  {
    id: 'flush_travertine_bathroom', icon: '🛁', category: 'flush_mount', style: 'mansion_luxe',
    name: '洞石主浴吸顶灯', desc: 'Travertine · 顶级 spa 浴室',
    prompt: 'Mount this flush mount ceiling light with honed travertine stone diffuser (warm cream with natural mineral patterns glowing softly when lit) in a luxury primary bathroom of a Greenwich estate. Bookmatched honed travertine walls and floor, freestanding Waterworks soaking tub on travertine plinth, polished antique brass fixtures, custom-cabinetry vanity with travertine countertop, large vintage gilt mirror, sheer linen Roman shades, fresh white orchids and rolled Egyptian cotton towels. Warm 2700K spa-like ambient glow, magazine cover quality, soft golden hour ambiance, ultra-luxurious.'
  },
  {
    id: 'flush_alabaster_dining', icon: '✨', category: 'flush_mount', style: 'mansion_luxe',
    name: '雪花石餐厅吸顶灯', desc: 'Spanish alabaster · 黄铜 · 大宅餐厅',
    prompt: 'Mount this large flush mount ceiling light featuring carved Spanish alabaster (warm translucent honey-veined glowing softly) with polished antique brass hardware, centered above a custom 12-seat dining table in a Hamptons mansion. Bookmatched walnut dining table, vintage caned French dining chairs upholstered in pale putty linen, hand-troweled Venetian plaster walls in soft Wimborne White, wide-plank rift-cut white oak floors, antique brass demilune buffet, fresh garden roses and white tapered candles, oversized gilt-framed seascape painting. Warm dinner-party 2700K candlelight glow, Architectural Digest photography.'
  },
  {
    id: 'flush_brass_modern_office', icon: '💼', category: 'flush_mount', style: 'modern_minimal',
    name: '现代书房黄铜吸顶灯', desc: 'Aged brass · 极简 · 书房',
    prompt: 'Mount this sleek modern flush mount ceiling light in aged antique brass with frosted opal glass diffuser, in a sophisticated home office of a Manhattan penthouse. Floor-to-ceiling custom walnut bookshelves filled with leather-bound first editions, large partners desk in walnut with green leather inlay, vintage Eames lounge chair, oversized Persian Heriz rug, sheer linen drapery, polished antique brass desk lamp, fresh white orchid in matte ceramic vessel. Warm 2700K reading light, evening atmosphere, editorial-quality photography.'
  },
  {
    id: 'flush_seeded_glass_laundry', icon: '🧺', category: 'flush_mount', style: 'farmhouse',
    name: '气泡玻璃洗衣房吸顶灯', desc: 'Seeded glass · 黄铜 · 实用',
    prompt: 'Mount this flush mount ceiling light with seeded clear glass globe and aged brass hardware, in a beautifully designed laundry room of a Connecticut farmhouse. Custom Shaker cabinets in soft Farrow & Ball Pigeon (greige), honed Carrara marble countertops, deep farmhouse sink, hex floor tile, brass hooks for hanging baskets, woven seagrass laundry baskets, framed botanical prints, vintage Persian runner rug. Bright American farmhouse style, natural daylight from window, soft welcoming atmosphere, Pottery Barn aesthetic.'
  },

  // ============== 过道灯 Corridor / Hallway Lights ==============
  // 关键：强调实际尺寸感（防客户售后投诉"图片看起来很大但实物很小"）
  {
    id: 'corridor_alabaster_narrow', icon: '🚪', category: 'corridor_light', style: 'mansion_luxe',
    name: '雪花石窄过道吸顶灯', desc: '强调小尺寸 · 实际比例 · 适合过道',
    prompt: 'Mount this small compact flush mount ceiling light (DIAMETER about 8 inches / 20cm — IMPORTANT: shown at realistic small size, NOT oversized like a large chandelier) featuring carved Spanish alabaster with polished antique brass trim, in a NARROW hallway of a Beverly Hills mansion. The fixture appears appropriately scaled to the narrow corridor space — small intimate, not dominating. White-painted wainscoting, Farrow & Ball Slipper Satin walls above, wide-plank French oak floors, vintage Persian runner rug, framed family photographs gallery wall, fresh white peonies on antique brass demilune console. Warm welcoming 2700K glow, evening atmosphere, magazine-quality editorial photography. CRITICAL: render with realistic small proportions — this is a hallway/passage light, NOT a statement chandelier.'
  },
  {
    id: 'corridor_brass_hallway', icon: '🛋️', category: 'corridor_light', style: 'mansion_luxe',
    name: '黄铜走廊小吸顶灯', desc: 'Antique brass · 实际尺寸 · 紧凑',
    prompt: 'Mount this small compact flush mount ceiling light (DIAMETER about 10 inches / 25cm — realistic compact size for a hallway, NOT oversized) in aged antique brass with frosted opal glass diffuser, in a Greenwich estate upstairs hallway. The fixture is shown at appropriate small scale — proportional to the corridor width. Custom millwork wainscoting in soft Wimborne White, classic American hallway runner rug in muted blue tones, antique walnut hall bench, oversized gilt-framed seascape oil painting, fresh hydrangeas in antique brass urn. Warm 2700K evening glow, traditional American interior, Architectural Digest photography. CRITICAL: show realistic small hallway-appropriate proportions, NOT a grand chandelier scale.'
  },
  {
    id: 'corridor_seeded_classic', icon: '🕯️', category: 'corridor_light', style: 'farmhouse',
    name: '气泡玻璃过道灯', desc: 'Seeded glass · 实际小尺寸 · 经典',
    prompt: 'Mount this small classic flush mount ceiling light (DIAMETER about 9 inches / 23cm — REALISTIC compact hallway proportions) with seeded clear glass globe and aged brass hardware, in a Connecticut farmhouse second-floor hallway. The fixture is shown at honest small scale appropriate for a passage/corridor — NOT a statement piece. White shiplap walls, wide-plank reclaimed oak floors, vintage Persian Heriz hallway runner, antique pine console table with stack of vintage books, framed black-and-white family photographs, fresh wildflowers in mason jar. American farmhouse style, warm welcoming morning light, Pottery Barn aesthetic. CRITICAL: render at honest hallway-light scale, not chandelier scale.'
  },
  {
    id: 'corridor_modern_minimal', icon: '⚪', category: 'corridor_light', style: 'modern_minimal',
    name: '现代极简过道灯', desc: '极简圆盘 · 实际尺寸 · 紧凑',
    prompt: 'Mount this small minimalist flat disc flush mount ceiling light (DIAMETER about 8-10 inches / 20-25cm — realistic compact corridor scale) in matte aged brass with frosted opal glass diffuser, in a modern Manhattan penthouse hallway. The fixture appears proportional to the corridor — intimate small scale, NOT a statement light. Smooth Venetian plaster walls in soft Strong White, wide-plank rift-cut white oak floors, sleek custom millwork doors, single large piece of abstract modern art on wall. Clean architectural modern American interior, warm 2700K glow, editorial architectural photography. CRITICAL: honest small-scale hallway proportions, NOT oversized.'
  },
  {
    id: 'corridor_lantern_small', icon: '🏮', category: 'corridor_light', style: 'mansion_luxe',
    name: '小灯笼吊式过道灯', desc: '迷你 lantern · Hamptons · 实际尺寸',
    prompt: 'Hang this small classic American lantern-style pendant light (HEIGHT about 12 inches / 30cm including chain — REALISTIC small hallway proportions) in aged antique brass with clear seeded glass panels, in a Hamptons beach house upstairs hallway. The lantern is shown at honest compact scale appropriate to the narrow hallway — NOT a grand entryway lantern. Classic white-painted wainscoting, soft Hamptons blue walls above, white-painted wide-plank floors, navy-and-white striped runner rug, vintage nautical chart in gilt frame, fresh white hydrangeas in white porcelain bowl. Coastal American style, bright daylight from end of hall window, magazine-quality lifestyle photography. CRITICAL: render at realistic small lantern scale, NOT statement chandelier scale.'
  },

  // ============== 风扇灯 Fan Lights ==============
  {
    id: 'fan_coastal_porch', icon: '🌴', category: 'fan_light', style: 'coastal',
    name: '海岸门廊风扇灯', desc: 'Hamptons · 白漆木 · 海景',
    prompt: 'Mount this ceiling fan with integrated light on a covered outdoor porch of a Hamptons oceanfront estate. White-painted beadboard porch ceiling, weathered grey wood plank floors, white-painted wicker furniture with navy-and-white striped Sunbrella cushions, hanging Boston ferns in white pots, hydrangeas in large planters, view of ocean dunes and sea grass beyond. Pottery Barn coastal aesthetic, breezy summer afternoon, warm golden hour light, classic Hamptons beach house feel.'
  },
  {
    id: 'fan_farmhouse_bedroom', icon: '🛏️', category: 'fan_light', style: 'farmhouse',
    name: '南方农舍卧室风扇灯', desc: '大空间 · 复古 · 木质天花',
    prompt: 'Mount this ceiling fan with integrated light in a spacious Southern American bedroom. Large upholstered Belgian linen bed with vintage quilted coverlet, antique chest of drawers, family heirloom rocking chair, soft Farrow & Ball Slipper Satin walls, wide-plank hardwood floors, exposed reclaimed wood ceiling beams, large window with sheer linen curtains, dried hydrangea bouquet in vintage ironstone pitcher. American traditional Southern style, warm cozy peaceful atmosphere, golden morning light.'
  },
  {
    id: 'fan_modern_living', icon: '🛋️', category: 'fan_light', style: 'modern_minimal',
    name: '现代客厅风扇灯', desc: '极简 · 低 profile · 工业',
    prompt: 'Mount this modern ceiling fan with integrated light in a contemporary Manhattan loft living room. Sleek low-profile design with brushed brass blades, paired with a minimalist sectional sofa in oatmeal Belgian linen, polished concrete floor with Berber rug, oversized abstract canvas art piece, single tall snake plant in concrete planter, vintage Eames chair. West Elm meets modern industrial style, sophisticated urban evening lighting, architectural photography quality.'
  },

  // ============== 材质改造（自定义设计专用模板）==============
  {
    id: 'mat_glass_to_alabaster', icon: '🤍', category: 'material', style: 'mansion_luxe',
    name: '玻璃→西班牙雪花石', desc: '保留结构，材质改成 alabaster',
    prompt: 'Redesign this lighting fixture by transforming all glass elements into carved Spanish alabaster (warm translucent cream with natural honey-colored veining that glows softly when lit from within). Keep the overall structure, proportions, and metal framework of the original design unchanged. The alabaster should have visible natural mineral patterns, slightly textured surface, and a luxurious matte finish. Photograph the new design on a clean studio background, professional product photography lighting, 8K hyperrealistic quality, ready for high-end e-commerce catalog.'
  },
  {
    id: 'mat_to_brass', icon: '🟡', category: 'material', style: 'mansion_luxe',
    name: '金属→古董黄铜', desc: '所有金属改成 antique brass',
    prompt: 'Redesign this lighting fixture by transforming all metal elements into hand-finished antique brass with subtle verde antique patina and gentle handcrafted texture. Keep the overall structure, proportions, and any non-metal elements unchanged. The brass should have a warm golden tone with darker patina in the crevices showing handcrafted artisanship. Photograph the new design on a clean studio background, professional product photography lighting, 8K hyperrealistic, high-end e-commerce catalog quality.'
  },
  {
    id: 'mat_to_marble', icon: '🪨', category: 'material', style: 'mansion_luxe',
    name: '玻璃→大理石', desc: 'Carrara 或 Calacatta',
    prompt: 'Redesign this lighting fixture by transforming the glass shade or panel elements into honed Calacatta Gold marble (warm cream background with dramatic golden and grey veining). Keep the overall structure and metal framework unchanged. The marble should appear naturally translucent when lit from within, showing the veining pattern beautifully. Photograph on a clean studio background, 8K hyperrealistic, high-end product catalog quality.'
  },
  {
    id: 'shape_conical_to_cylinder', icon: '🔧', category: 'material', style: 'mansion_luxe',
    name: '锥形罩→直筒罩', desc: '形状改造，保持其余元素',
    prompt: 'Redesign this lighting fixture by changing all conical or tapered lamp shades into straight cylindrical drum shades of similar proportional height. Keep all other elements (frame, material, finish, mounting hardware) completely unchanged. The cylindrical shades should have a contemporary clean silhouette. Photograph on a clean studio background, professional product photography, 8K hyperrealistic quality.'
  },
  {
    id: 'shape_add_crystal', icon: '💎', category: 'material', style: 'mansion_luxe',
    name: '加水晶吊坠装饰', desc: '增加奢华细节',
    prompt: 'Redesign this lighting fixture by adding elegant hand-cut crystal pendant drops hanging from the lower edges and decorative crystal accents along the arms. Keep the original structure, material, and finish of the main frame unchanged. The crystals should appear as classic faceted teardrop and prism shapes, catching and refracting light beautifully. The result should look like a luxurious upgrade. Photograph on a clean studio background, 8K hyperrealistic, high-end product catalog quality.'
  },
  {
    id: 'shape_simplify', icon: '✨', category: 'material', style: 'modern_minimal',
    name: '简化线条·现代化', desc: '去繁就简',
    prompt: 'Redesign this lighting fixture by simplifying its lines and details into a cleaner contemporary silhouette. Remove ornate decorative elements while keeping the essence of the original design. Use cleaner geometric forms, fewer visual elements, and a more modern minimalist aesthetic. The result should feel like a contemporary reinterpretation of the original. Photograph on a clean studio background, 8K hyperrealistic, gallery-quality product photography.'
  },

  // ============== 后期工具 Tools ==============
  {
    id: 'tool_hires', icon: '🔧', category: 'tool', style: 'tool',
    name: '一键高清还原', desc: '低清→4K 超清',
    keepOriginalRatio: true,
    prompt: 'Enhance this image to ultra-high 4K resolution. Restore sharp focus throughout, recover fine details that may appear blurry, enhance material textures (metal, glass, fabric, marble), improve lighting contrast and dynamic range, sharpen edges naturally without artificial halos. Completely preserve the original composition, colors, perspective, and subject matter. Output quality: ready for magazine print, professional photography retouching grade.'
  },
  {
    id: 'tool_remove_bg', icon: '✂️', category: 'tool', style: 'tool',
    name: '一键去背景', desc: '纯白底电商首图',
    keepOriginalRatio: true,
    prompt: 'Remove the background completely and replace with pure white (#FFFFFF). Keep only the lighting product as the clean subject with crisp accurate edges. Add a very subtle natural soft shadow directly beneath the product to ground it visually. E-commerce product photography style, ready for Amazon / Shopify / luxury furniture site listings, no other elements present, 4K quality.'
  },
  {
    id: 'tool_white_studio', icon: '⚪', category: 'tool', style: 'tool',
    name: '一键白底棚拍', desc: '专业产品摄影感',
    keepOriginalRatio: true,
    prompt: 'Replace the background with a clean seamless white studio background. Add subtle natural soft shadows beneath the product to ground it visually. Apply professional product photography lighting setup with soft diffused light from multiple angles, even illumination, accurate color reproduction, sharp focus throughout. 4K e-commerce-ready quality suitable for premium furniture catalogs (RH, Visual Comfort).'
  },
  {
    id: 'tool_lifestyle_warm', icon: '🏠', category: 'tool', style: 'tool',
    name: '通用顶级生活场景', desc: '美式高端家居',
    prompt: 'Place this lighting product in a warm inviting upscale American home setting. Natural daylight from oversized windows, sophisticated neutral color palette (cream, ivory, taupe, soft white, warm wood, antique brass accents), tasteful curated furnishings worthy of Architectural Digest, fresh white peonies in a crystal vase, art books stacked on a marble coffee table. Pottery Barn meets Visual Comfort aesthetic, professional interior photography, mid-afternoon golden hour ambiance, magazine-quality lifestyle photography. ★ CRITICAL: The lamp/light fixture is the HERO — it must be the primary visual focus, occupying 40-60% of the frame. Frame the shot tightly around the lamp; the home setting is supporting context, NOT the subject. Do not let the lamp get lost in the environment.'
  },
  // v22-E 新增：去水印 + 线稿图（核心高频工具）
  // v22-M: prompt 改用「图像修复 / inpainting」术语，避免触发 AI 内容审核 NO_IMAGE
  {
    id: 'tool_remove_watermark', icon: '🧽', category: 'tool', style: 'tool',
    name: '🧽 一键画面清洁', desc: '图像修复 · 智能还原原始干净画面（含覆盖物）',
    keepOriginalRatio: true,
    prompt: `Photo restoration and image inpainting task.

This photograph has surface overlay artifacts that partially obscure the underlying image content — these include diagonal repeating text patterns, semi-transparent graphic overlays, scattered tiled labels, faint red diagonal lines, and similar visual obstructions layered on top of the original photograph.

Your task: Carefully reconstruct the clean original photograph by inpainting (filling in) all obstructed areas using context-aware reconstruction. Use the surrounding unobstructed pixels as reference to seamlessly restore the underlying scene — including subject details, background, materials, lighting gradients, and natural textures — exactly as they would have appeared in the original capture before any overlay was applied.

Critical preservation rules:
- Keep the main subject completely unchanged: same shape, pose, color, proportions, materials, and lighting
- Keep the background composition, depth, and environmental lighting intact
- Restore the original photograph as the photographer would have captured it
- Do not add new elements, do not change colors or composition
- Output a clean, fully-restored photograph indistinguishable from an unobstructed source photograph

Output: clean professional photographic-quality image at original resolution, with all surface overlay artifacts fully reconstructed and removed. No artifacts, no ghosting, no remnants of the original overlays.`
  },
  {
    id: 'tool_line_drawing_3d', icon: '📐', category: 'tool', style: 'tool',
    name: '📐 线稿图 · 摆正正面（推荐）', desc: '正面平视 · 灯具摆正 · 产品图常用',
    keepOriginalRatio: true,
    prompt: 'Convert this lighting product into a clean professional technical line drawing. **★ CAMERA ANGLE: FRONT-FACING, straight-on view at the product\'s center height — the lamp must be perfectly upright and squared to the camera (no tilt, no isometric, no top-down angle).** Show the product from a head-on perspective like a catalog hero shot, with just enough subtle depth/perspective to convey 3D form (NOT a flat 2D outline, but also NOT a 30° isometric view). Pure white background (#FFFFFF). Use crisp black lines (0.5pt to 1pt weight) only — NO color, NO fill, NO shadow, NO photographic rendering, NO speckled/noise texture. **★ DO NOT add dimension lines, measurements, numbers, sizes, or any annotations** unless explicitly mentioned. **★ DO NOT add ANY text, labels, brand names, watermarks, or written words anywhere.** Output a pure clean line drawing of the product shape only. **★ CRITICAL: Preserve the EXACT aspect ratio and proportions of the original product — do NOT stretch, squash, or distort. The lamp\'s horizontal-to-vertical ratio must match the source image exactly.** The product MUST occupy 60-80% of the frame, centered, vertically and horizontally balanced. Authentic mechanical engineering line drawing aesthetic.'
  },
  {
    id: 'tool_line_drawing_iso', icon: '🎨', category: 'tool', style: 'tool',
    name: '🎨 线稿图 · 等距 30° 视角', desc: 'AutoCAD 经典 · 工程师视角',
    keepOriginalRatio: true,
    prompt: 'Convert this lighting product into a clean professional technical line drawing in AutoCAD / SolidWorks isometric engineering drawing style. **★ CAMERA ANGLE: classic isometric 30° view — camera positioned slightly above and offset to the side, showing 3 faces of the product (top + front + side) at a 30° angle.** Show the product as a 3D perspective wireframe / line drawing on pure white background (#FFFFFF). Use crisp black lines (0.5pt to 1pt weight) only — NO color, NO fill, NO shadow, NO photographic rendering, NO speckled/noise texture. **★ DO NOT add dimension lines, measurements, numbers, sizes, or annotations** unless explicitly requested. **★ DO NOT add ANY text, labels, brand names, watermarks, or written words.** Output a pure clean isometric line drawing. **★ CRITICAL: Preserve the EXACT aspect ratio and proportions of the original product.** The product MUST occupy 60-80% of the frame, centered. Authentic engineering isometric drawing aesthetic.'
  },
  {
    id: 'tool_line_drawing_2d', icon: '📏', category: 'tool', style: 'tool',
    name: '📏 线稿图 · 2D 三视图', desc: '正视 + 侧视 + 俯视 · 工程图',
    keepOriginalRatio: true,
    prompt: 'Convert this lighting product into clean professional technical 2D orthographic engineering drawings showing THREE views side-by-side: FRONT view (正视图), SIDE view (侧视图), and TOP view (俯视图). Pure white background (#FFFFFF). Use crisp black lines (0.5pt to 1pt) only — NO color, NO fill, NO shadow, NO speckled/noise texture, NO photographic rendering. Each view should be labeled in English ("FRONT", "SIDE", "TOP") — these 3 small labels are the ONLY text allowed. **★ DO NOT add dimension lines, measurements, numbers, or size annotations** unless explicitly mentioned. **★ DO NOT add ANY other text, brand names, watermarks, title blocks, or written words — only the three view labels FRONT/SIDE/TOP.** Output pure clean line drawings of the product views only. **★ CRITICAL: Each view must preserve the EXACT aspect ratio and proportions of the original product — do NOT stretch, squash, or distort.** Each view drawing should show the product prominently filling its allocated area (60-80%). All three views must be perfectly straight (no tilt). AutoCAD-style technical drawing.'
  },
  {
    id: 'tool_line_drawing_outline', icon: '✏️', category: 'tool', style: 'tool',
    name: '✏️ 线稿图 · 单视图轮廓', desc: '最简洁 · 仅正面单视图轮廓',
    keepOriginalRatio: true,
    prompt: 'Convert this lighting product into the SIMPLEST possible 2D line outline drawing — a single front-facing flat view, like a clean vector icon or product silhouette. **★ CAMERA ANGLE: pure FRONT view, completely straight, no perspective, no isometric, no tilt — exactly like a 2D orthographic front view drawing.** Pure white background (#FFFFFF). Use crisp black lines (0.5pt to 1pt) only — NO color, NO fill, NO shadow, NO speckled/noise texture, NO photographic rendering, NO 3D depth lines. Just the clean outer silhouette and essential internal structural lines that convey the lamp\'s identity. **★ DO NOT add ANY text, labels, dimensions, measurements, brand names, watermarks, or written words anywhere.** **★ CRITICAL: Preserve the EXACT aspect ratio and proportions of the original product — do NOT stretch, squash, or distort.** The product MUST occupy 70-85% of the frame, perfectly centered and squared. Minimal clean vector-art style outline drawing.'
  },
  // v22-F 新增：员工个性化工具（美颜 + 证件照）
  {
    id: 'tool_beauty_portrait', icon: '💄', category: 'tool', style: 'tool',
    name: '💄 一键美颜', desc: '自然美颜 · 保持真实感',
    keepOriginalRatio: true,
    prompt: 'Apply natural professional portrait retouching to this photo. Subtly enhance the subject\'s appearance with gentle skin smoothing (preserve natural skin texture, do NOT make plastic-looking), even out skin tone, brighten eyes slightly with sharper definition, slightly whiten teeth, soften under-eye circles, balance facial lighting for a flattering glow. Lighten and refine eyebrows naturally. Keep the original facial structure, expression, hair, clothing, accessories, and background completely unchanged. The result should look like a high-quality professional headshot — natural, polished, real, not heavily edited. Avoid: heavy filter look, doll-like skin, exaggerated features, plastic surgery effect. The person should still look 100% like themselves, just on their best day.'
  },
  {
    id: 'tool_id_photo', icon: '📸', category: 'tool', style: 'tool',
    name: '📸 一键证件照', desc: '专业证件照 · 白底/蓝底/红底',
    forcedRatio: '3:4',
    prompt: 'Transform this photo into a professional ID/passport photo. Replace the background with a pure CLEAN WHITE background (#FFFFFF) — if you want a different color background, the user can specify "blue background" or "red background" in additional notes. Frame as a standard ID photo: head-and-shoulders portrait, subject facing forward, neutral expression, eyes open and looking at camera, both ears visible, hair neatly arranged not covering face. Apply subtle professional retouching: even skin tone, natural skin texture preserved, well-lit face without harsh shadows, sharp focus on face. Keep the person\'s clothing visible (collar/shoulders area). Standard portrait proportions: subject\'s head should occupy the top 60% of the frame, with appropriate space above head. Professional photography quality suitable for visa / passport / work ID / professional headshot use. Aspect ratio: 1:1 or 3:4 portrait. Background: solid pure color, no texture, no gradient, no shadow.'
  },
  {
    id: 'tool_id_photo_blue', icon: '🔵', category: 'tool', style: 'tool',
    name: '🔵 蓝底证件照', desc: '签证 · 工作证 · 标准蓝底',
    forcedRatio: '3:4',
    prompt: 'Transform this photo into a professional ID photo with PURE SOLID BLUE BACKGROUND (#3a7bd5, official document blue, NOT cyan, NOT dark navy). Frame as a standard ID photo: head-and-shoulders portrait, subject facing forward, neutral or slight pleasant expression, eyes open and looking at camera, both ears visible, hair neatly arranged. Apply subtle professional retouching: even skin tone (preserve natural texture), well-lit face without harsh shadows, sharp focus. Keep the person\'s clothing visible (collar area). Background must be completely solid blue with no gradient, no shadow, no texture. Standard portrait proportions: head occupies top 60% of frame. Suitable for: US visa, work ID, professional headshot, professional ID. Quality: professional studio photography grade.'
  },

  // ============== v22-R 扩充：壁灯（追加 +5）==============
  {
    id: 'wall_glass_ball_stairs', icon: '🔮', category: 'wall_sconce', style: 'modern_minimal',
    name: '玻璃球楼梯间壁灯', desc: 'Globe glass · 楼梯墙面 · 现代极简',
    prompt: 'Mount this wall sconce featuring a hand-blown clear glass globe with brushed brass hardware along a staircase wall in a modern American home. White Venetian plaster walls, custom oak handrail and balustrade with iron spindles, light oak treads, framed black-and-white modern photography ascending the wall. Warm 2700K glow casting soft circular shadows. Architectural Digest modern minimal aesthetic, golden hour light from skylight above, 8K editorial photography.'
  },
  {
    id: 'wall_black_tube_modern', icon: '⚫', category: 'wall_sconce', style: 'modern_minimal',
    name: '黑色细管现代壁灯', desc: 'Matte black · 极简线条 · 当代客厅',
    prompt: 'Place this matte black slim tubular wall sconce above a low-profile credenza in a contemporary American living room. Warm white plaster walls, oversized abstract painting in muted earth tones, floating walnut media console, low boucle sofa in cream, Moroccan-inspired earth-tone rug, single tall sculptural ceramic vase. Warm 2700K directional light grazing the wall texture. Modern minimal magazine-quality lifestyle photography, soft natural light from oversized window.'
  },
  {
    id: 'wall_coastal_white', icon: '🌊', category: 'wall_sconce', style: 'coastal',
    name: '海岸风白色对装壁灯', desc: '白色亚麻罩 · 沙滩屋走廊',
    prompt: 'Install a pair of coastal-style wall sconces with white wash finish and natural linen shades flanking a vintage navy-painted door in a Hamptons beach cottage hallway. White shiplap walls, bleached oak floors, antique wicker basket with rolled beach towels, framed black-and-white ocean photography. Soft natural midday light filtering through the open doorway showing distant ocean view. Coastal Living magazine aesthetic, warm welcoming summer ambiance, 8K editorial photography.'
  },
  {
    id: 'wall_industrial_edison', icon: '🔩', category: 'wall_sconce', style: 'industrial',
    name: '工业风 Edison 壁灯', desc: 'Iron pipe · 裸灯泡 · Loft 厨房',
    prompt: 'Mount this industrial wall sconce featuring black iron pipe armature and exposed vintage Edison bulb in a loft kitchen. Exposed brick wall, reclaimed barn wood open shelving with vintage white ironstone dishes, white subway tile backsplash, butcher block countertop, vintage cast-iron sink with brass bridge faucet, hanging copper cookware. Warm amber Edison glow contrasting with the cool brick. Industrial farmhouse aesthetic, Restoration Hardware industrial collection vibe, magazine-quality.'
  },
  {
    id: 'wall_aerin_brass_pair', icon: '💫', category: 'wall_sconce', style: 'vc_classic',
    name: 'Aerin 黄铜对装壁灯', desc: '抛光黄铜 · 蛋白石玻璃 · 镜对装',
    prompt: 'Mount a pair of refined polished brass wall sconces with hand-blown opal glass shades flanking a venetian antique mirror in an elegant entryway. Aerin Lauder for Visual Comfort aesthetic: hand-troweled Pavilion Gray walls, Calacatta marble herringbone floor, antique French console with cabriole legs, large arrangement of fresh white hydrangeas in a silver bowl, polished brass picture lights. Warm 2700K glow, refined evening ambiance, Town & Country magazine cover quality, 8K cinematic detail.'
  },

  // ============== v22-R 扩充：台灯（追加 +5）==============
  {
    id: 'table_buffet_entryway', icon: '🕯️', category: 'table_lamp', style: 'transitional',
    name: 'Buffet 玄关高台灯', desc: '细高底座 · 黑色 · 玄关',
    prompt: 'Place a pair of tall slender buffet lamps with matte black ceramic columns and crisp white linen drum shades flanking a large arrangement of fresh white hydrangeas on an antique entryway console table. Warm white plaster walls, large gilded antique mirror above, herringbone Calacatta marble floor, vintage Persian Heriz runner, single antique brass key on a silver tray. Warm 2700K glow welcoming guests. Refined American transitional aesthetic, Visual Comfort + Hudson Valley collection style, magazine cover quality.'
  },
  {
    id: 'table_glass_ball_modern', icon: '⚪', category: 'table_lamp', style: 'modern_minimal',
    name: '玻璃球现代台灯', desc: 'Clear glass orb · 黄铜底 · 现代客厅',
    prompt: 'Style this modern table lamp featuring a sculptural clear glass orb base with polished brass hardware and crisp white linen drum shade on a sleek walnut side table next to a boucle sofa. Warm white plaster walls, large abstract painting in earth tones, leather club chair, custom built-in shelving with curated objects and books, oversized circular jute rug on light oak floors. Warm 2700K bedside-style glow casting soft circular reflections. Contemporary American living, Lulu and Georgia meets Schumacher, 8K editorial photography.'
  },
  {
    id: 'table_minimal_black_desk', icon: '🖋️', category: 'table_lamp', style: 'modern_minimal',
    name: '极简黑色书桌台灯', desc: 'Matte black · 可调臂 · 工作室',
    prompt: 'Place this minimal matte black architect-style desk lamp with adjustable arm on a walnut writing desk in a refined home office. Custom built-in walnut bookshelves filled with hardcover books and curated objects, leather executive chair, antique brass desk accessories, vintage Persian Heriz rug on hand-scraped wide-plank oak floors, oversized framed map artwork. Warm focused 2700K task lighting. Sophisticated masculine American home office, Hermès meets Ralph Lauren study aesthetic, magazine quality.'
  },
  {
    id: 'table_farmhouse_ceramic', icon: '🏡', category: 'table_lamp', style: 'farmhouse',
    name: '农舍陶瓷卧室台灯（对装）', desc: 'Ivory ceramic · 麻布罩 · 卧室对装',
    prompt: 'Place a matching pair of ivory crackle-glaze ceramic table lamps with natural linen drum shades on weathered antique pine nightstands flanking a wrought iron canopy bed. American farmhouse primary bedroom: soft white shiplap walls, oatmeal Belgian linen bedding with vintage quilt at foot, wide-plank reclaimed oak floors, antique heirloom Persian rug, sprigs of dried lavender in mason jars, vintage botanical prints in barn wood frames. Warm 2700K bedside glow, cozy evening ambiance, Magnolia Home meets Pottery Barn, magazine-quality lifestyle photography.'
  },
  {
    id: 'table_coastal_shell', icon: '🐚', category: 'table_lamp', style: 'coastal',
    name: '海岸风贝壳台灯', desc: 'Natural shell · 沙滩屋 · 沿海别墅',
    prompt: 'Style this coastal table lamp featuring a natural seashell base and white linen drum shade on a weathered driftwood side table in a Hamptons beach cottage living room. White shiplap walls, slipcovered cream linen sofa with navy striped pillows, distressed white oak coffee table, jute area rug on bleached oak floors, framed antique nautical charts, large clear glass vase with sea fans. Soft natural afternoon light from oversized windows showing dune grass and ocean. Coastal Living editorial photography, warm summer afternoon ambiance.'
  },

  // ============== v22-R 扩充：落地灯（追加 +8）==============
  {
    id: 'floor_rh_arched_brass', icon: '🌙', category: 'floor_lamp', style: 'rh_luxury',
    name: 'RH 黄铜拱形落地灯', desc: 'Arched arm · 抛光黄铜 · 沙发上方',
    prompt: 'Place this oversized arched floor lamp with polished antique brass arm and white linen drum shade arching gracefully over a custom Belgian linen sectional sofa in a Restoration Hardware-style living room. Hand-troweled Venetian plaster walls in warm bone, antique limestone fireplace mantel, vintage oversized antique Persian rug, weathered French oak coffee table with stacked art books, oversized abstract painting. Warm 2700K reading-level glow. RH Modern collection aesthetic, magazine cover quality, golden hour ambient light.'
  },
  {
    id: 'floor_tripod_industrial', icon: '📐', category: 'floor_lamp', style: 'industrial',
    name: '工业风三脚架落地灯', desc: 'Black metal tripod · 帆布罩 · Loft',
    prompt: 'Place this industrial tripod floor lamp with black powder-coated steel legs and natural canvas shade next to a vintage leather Chesterfield sofa in a Brooklyn loft living room. Exposed brick wall, large factory-style steel-framed windows, vintage Persian rug on polished concrete floor, vintage steamer trunk as coffee table, large vintage globe, framed black-and-white industrial photography. Warm 2700K glow contrasting with cool brick and concrete textures. Restoration Hardware industrial collection meets Brooklyn loft aesthetic, cinematic 8K detail.'
  },
  {
    id: 'floor_coastal_white_linen', icon: '⛵', category: 'floor_lamp', style: 'coastal',
    name: '海岸风白色亚麻落地灯', desc: 'White wash · 麻布罩 · 沙滩屋',
    prompt: 'Place this coastal floor lamp with white-washed wooden base and oversized natural linen drum shade beside a slipcovered cream linen reading chair in a Hamptons beach cottage. White shiplap walls, bleached oak floors, large jute area rug, navy and white striped throw blanket draped over the chair, antique wooden side table with a single conch shell and well-loved hardcover novel. Soft natural midday light flooding through oversized windows showing dune grass and the Atlantic in the distance. Coastal Living magazine cover quality, warm summer afternoon ambiance.'
  },
  {
    id: 'floor_minimal_black_orb', icon: '⚫', category: 'floor_lamp', style: 'modern_minimal',
    name: '极简黑色圆罩落地灯', desc: 'Slim black · 圆鼓灯罩 · 现代客厅',
    prompt: 'Place this minimal black floor lamp with slim cylindrical column and matte black drum shade beside a low-profile boucle armchair in a contemporary American living room. Warm white plaster walls, oversized abstract painting in muted earth tones, custom walnut media console, low-pile cream wool rug on light oak floors, single sculptural ceramic vessel. Warm 2700K directional reading light. Sophisticated contemporary American living, Crate & Barrel CB2 meets Lulu and Georgia aesthetic, 8K editorial photography.'
  },
  {
    id: 'floor_alabaster_corner', icon: '🤍', category: 'floor_lamp', style: 'mansion_luxe',
    name: '雪花石角落落地灯', desc: 'Spanish alabaster · 暖光 · 客厅角落',
    prompt: 'Place this stunning floor lamp featuring a column of stacked Spanish alabaster discs glowing softly with warm internal illumination in the corner of a Beverly Hills mansion living room. Hand-troweled Venetian plaster walls in warm bone, custom oversized white Belgian linen sofa, antique Calacatta marble coffee table with curated art books, hand-knotted Persian Tabriz rug, single fresh white orchid in a mineral specimen, polished antique brass picture lights. Warm 2700K alabaster glow casting soft mineral-veined shadows. Architectural Digest cover quality, magnificent old-money American luxury, golden hour ambient light, 8K cinematic detail.'
  },
  {
    id: 'floor_midcentury_brass', icon: '🌳', category: 'floor_lamp', style: 'transitional',
    name: '中世纪现代黄铜落地灯', desc: 'Mid-century · 黄铜 + 木 · 设计师款',
    prompt: 'Place this mid-century modern floor lamp featuring sculptural polished brass arm extending from a solid walnut base with a crisp white drum shade beside an Eames-style lounge chair in a designer living room. Warm white plaster walls, custom built-in walnut credenza, abstract painting in muted ochre and terracotta tones, vintage Persian Heriz rug on light oak herringbone floors, sculptural ceramic vessels. Warm 2700K reading-level glow. Refined mid-century American design, Visual Comfort + Schoolhouse aesthetic, 8K editorial photography.'
  },
  {
    id: 'floor_outdoor_patio_lantern', icon: '🌴', category: 'floor_lamp', style: 'transitional',
    name: '户外露台灯笼落地灯', desc: 'Weatherproof · 灯笼造型 · Hamptons 露台',
    prompt: 'Place this outdoor floor lamp shaped like an oversized antique lantern with bronze frame and seeded glass panels on a covered Hamptons estate terrace beside a teak lounge chair. White-painted brick exterior wall, bluestone patio floor, weathered teak coffee table, oversized clay planters with manicured boxwood topiaries, sweeping ocean view in distance with dune grass blowing in summer breeze. Warm 2700K candlelight-quality glow as dusk falls over the Atlantic. Coastal Living estate aesthetic, magazine cover quality, golden hour ambient light.'
  },
  {
    id: 'floor_reading_arc_marble', icon: '📖', category: 'floor_lamp', style: 'vc_classic',
    name: '大理石底拱形阅读落地灯', desc: 'Marble base · 黄铜臂 · 阅读角',
    prompt: 'Place this elegant arched reading floor lamp with white Carrara marble base, polished antique brass arm, and crisp white linen drum shade beside a custom velvet reading chair and ottoman in a refined reading nook. Floor-to-ceiling custom oak bookshelves filled with leather-bound books, Persian Heriz rug, antique side table with stacked hardcover novels and a steaming cup of tea, framed botanical prints in gold leaf frames. Warm 2700K focused reading glow with golden hour light filtering through tall arched window. Visual Comfort + Studio McGee meets Aerin Lauder aesthetic, magazine cover quality, 8K cinematic.'
  },

  // ============== v22-R 扩充：吊灯（追加 +5）==============
  {
    id: 'pendant_rh_factory_glass', icon: '🏭', category: 'pendant', style: 'industrial',
    name: 'RH 工厂玻璃罩吊灯', desc: 'Vintage factory · 厂房玻璃罩 · Loft',
    prompt: 'Hang a row of three Restoration Hardware-style factory-inspired pendant lights with hand-blown clear seeded glass shades and aged brass canopies above a long reclaimed wood farmhouse dining table in a Brooklyn loft. Exposed brick walls, oversized steel-framed factory windows, vintage Persian rug on polished concrete floor, mixed vintage cross-back dining chairs, oversized antique factory clock on wall, large pottery vessel as centerpiece with eucalyptus branches. Warm 2700K glow contrasting with cool brick textures. RH Industrial collection cinematic 8K, magazine cover quality.'
  },
  {
    id: 'pendant_coastal_rattan', icon: '🌾', category: 'pendant', style: 'coastal',
    name: '海岸风藤编吊灯', desc: 'Woven rattan · 沙滩屋餐厅',
    prompt: 'Hang this large woven natural rattan pendant lamp shaped like a coastal lantern above a white-washed pedestal dining table in a Hamptons beach cottage. White shiplap walls, white-washed cross-back dining chairs with linen cushions, bleached oak floors, jute area rug, large clear glass vase with white hydrangeas and dune grass, antique brass candlesticks. Soft natural late afternoon light flooding through oversized windows showing the Atlantic and dune grass in distance. Serena & Lily catalog cover quality, Coastal Living magazine aesthetic, warm summer ambiance.'
  },
  {
    id: 'pendant_edison_cluster_loft', icon: '💡', category: 'pendant', style: 'industrial',
    name: 'Edison 灯泡簇吊灯', desc: 'Exposed bulbs · 多头簇集 · Loft 餐厅',
    prompt: 'Hang this dramatic cluster pendant with multiple bare Edison filament bulbs suspended at varying heights with black braided cords from a black ceiling canopy above a reclaimed barn wood dining table in a converted Brooklyn loft. Exposed brick walls, steel-framed factory windows, polished concrete floors, mismatched vintage Tolix and wood dining chairs, oversized abstract painting, vintage industrial clock. Warm amber Edison glow contrasting beautifully with cool brick textures. Industrial farmhouse aesthetic, Restoration Hardware industrial collection meets Brooklyn loft style, 8K cinematic detail.'
  },
  {
    id: 'pendant_minimal_globe_kitchen', icon: '🍳', category: 'pendant', style: 'modern_minimal',
    name: '极简圆球吊灯（厨房岛台）', desc: 'White globe · 黑色金属 · 现代厨房',
    prompt: 'Hang a row of three matte black and white opal glass globe pendant lamps above a large Calacatta marble waterfall kitchen island. Modern American kitchen: floor-to-ceiling custom flat-panel oak cabinets, integrated stainless appliances, brass bridge faucet, large arched window over the sink with views of a manicured garden, black wood-grain bar stools with leather seats, a large bowl of fresh lemons on the island. Warm 2700K glow under cool natural daylight. Modern American minimal kitchen aesthetic, McGee Studio meets Schoolhouse Electric, magazine quality, 8K editorial photography.'
  },
  {
    id: 'pendant_farmhouse_iron_cluster', icon: '🌾', category: 'pendant', style: 'farmhouse',
    name: '农舍铁艺簇吊灯', desc: 'Wrought iron · 多头铸铁 · 餐厅',
    prompt: 'Hang this dramatic wrought iron pendant chandelier with multiple curved iron arms and cream linen drum shades above an oversized weathered farmhouse trestle dining table. American farmhouse dining room: white shiplap walls, vintage cross-back dining chairs with worn leather seats, wide-plank reclaimed oak floors, antique heirloom Persian rug, large vintage ironstone pitcher with sunflowers, antique brass candlesticks, framed botanical prints in barn wood frames. Warm 2700K candlelight ambiance. Magnolia Home meets Pottery Barn farmhouse, magazine cover quality, evening dinner ambiance.'
  },

  // ============== v22-R 扩充：枝形吊灯（追加 +6）==============
  {
    id: 'chand_vc_droplet_living', icon: '💧', category: 'chandelier', style: 'vc_classic',
    name: 'VC 水滴枝形客厅吊灯', desc: 'Hand-blown crystal droplets · 黄铜 · 客厅',
    prompt: 'Hang this magnificent multi-tier chandelier featuring hand-blown crystal droplets and polished antique brass armature from a soaring 14-foot ceiling above a custom white Belgian linen sectional in a refined American living room. Hand-troweled Pavilion Gray walls, oversized arched windows with sheer linen drapes, antique Calacatta marble coffee table, hand-knotted Persian Tabriz rug on light oak herringbone floors, custom oak built-in shelves with curated objects, fresh white peonies in silver vases. Warm 2700K crystal glow with golden hour light filtering through tall windows. Visual Comfort + Aerin Lauder Architectural Digest cover quality, 8K cinematic.'
  },
  {
    id: 'chand_farmhouse_candle', icon: '🕯️', category: 'chandelier', style: 'farmhouse',
    name: '农舍蜡烛枝形吊灯', desc: 'Wrought iron · Candle-style · 餐厅',
    prompt: 'Hang this farmhouse wrought iron candle-style chandelier with multiple iron arms ending in candle sleeves with flame-shaped bulbs above an oversized reclaimed barn wood dining table. American farmhouse dining room: white shiplap walls, vintage cross-back wooden chairs with worn linen cushions, wide-plank reclaimed oak floors, antique Persian Heriz rug, large vintage ironstone pitcher with cotton bolls and dried wheat as centerpiece, antique brass candlesticks with real beeswax candles, framed antique botanical prints. Warm 2700K candlelight evening dinner ambiance. Magnolia Home meets Restoration Hardware farmhouse, magazine cover quality.'
  },
  {
    id: 'chand_beverly_crystal', icon: '💎', category: 'chandelier', style: 'mansion_luxe',
    name: 'Beverly Hills 水晶枝形吊灯', desc: 'Cascading crystal · 豪宅 · 大入户',
    prompt: 'Hang this magnificent cascading crystal chandelier dripping with hand-cut Swarovski crystals from a soaring 20-foot domed ceiling in the grand foyer of a Beverly Hills mansion. Curved double staircase with hand-forged wrought iron balustrade and limestone treads, herringbone Calacatta marble floor with central medallion, oversized round mahogany center table with massive arrangement of fresh white French peonies and roses, gilded antique mirror, hand-troweled Venetian plaster walls. Crystals catching late afternoon golden light streaming through the arched window above the front door. Architectural Digest "Most Beautiful Homes" cover quality, old-money grand entrance, 8K cinematic.'
  },
  {
    id: 'chand_molecular_modern', icon: '🧬', category: 'chandelier', style: 'modern_minimal',
    name: '分子结构现代枝形吊灯', desc: 'Lindsey Adelman style · 客厅 · 当代艺术',
    prompt: 'Hang this Lindsey Adelman-inspired sculptural molecular chandelier featuring multiple hand-blown opal glass spheres at varying heights on slim brushed brass armature above a low-profile boucle sectional in a contemporary American living room. Warm white plaster walls, oversized abstract painting in muted earth tones, custom walnut credenza, low-pile cream wool rug on light oak floors, single sculptural ceramic vessel, large monstera plant. Warm 2700K glow with sculptural shadow play. Sophisticated contemporary American design, Studio McGee meets Lindsey Adelman aesthetic, Architectural Digest magazine quality, 8K cinematic.'
  },
  {
    id: 'chand_french_empire', icon: '👑', category: 'chandelier', style: 'mansion_luxe',
    name: '法式 Empire 帝国枝形吊灯', desc: 'Bronze + crystal · 豪华正餐厅',
    prompt: 'Hang this magnificent French Empire-style chandelier with multi-tier bronze armature dripping with hand-cut crystal swags above a large antique mahogany dining table set with fine bone china for a formal dinner. Formal Manhattan penthouse dining room: hand-painted Chinoiserie wallpaper, Calacatta marble floor with herringbone inlay, antique Louis XV dining chairs with silk upholstery, hand-knotted Aubusson rug, large gilded antique mirrors, massive antique sterling silver candelabras with lit beeswax candles, fresh white roses and stephanotis arrangement. Warm 2700K candlelight evening ambiance. Old-money formal American luxury, Town & Country cover quality, 8K cinematic detail.'
  },
  {
    id: 'chand_coastal_seashell', icon: '🐚', category: 'chandelier', style: 'coastal',
    name: '海岸风贝壳枝形吊灯', desc: 'Capiz shells · 白银 · 沙滩屋餐厅',
    prompt: 'Hang this stunning coastal chandelier with multi-tier silver frame and cascading natural Capiz seashells above a white-washed pedestal dining table in a Hamptons beach estate dining room. White shiplap walls, white-washed dining chairs with cream linen slipcovers, bleached oak herringbone floors, jute area rug, large clear glass hurricane vase with white hydrangeas and dune grass, antique silver candlesticks. Soft natural late afternoon light flooding through oversized French doors leading to a terrace with Atlantic ocean view. Coastal Living magazine cover quality, refined Hamptons summer aesthetic, 8K cinematic detail.'
  },

  // ============== v22-R 扩充：吸顶灯（追加 +3）==============
  {
    id: 'flush_industrial_kitchen', icon: '🔩', category: 'flush_mount', style: 'industrial',
    name: '工业风金属吸顶灯', desc: 'Black metal cage · 现代农舍厨房',
    prompt: 'Mount this industrial flush mount ceiling light featuring matte black metal cage with hand-blown clear seeded glass diffuser above a Calacatta marble waterfall kitchen island. Modern American farmhouse kitchen: floor-to-ceiling custom shaker cabinets in soft white, brass bridge faucet, white subway tile backsplash, oversized arched window over the sink, dark walnut bar stools with leather seats, hammered copper pendant lights, large bowl of fresh lemons. Warm 2700K under cool natural daylight. Modern farmhouse aesthetic, Magnolia meets Restoration Hardware, magazine cover quality.'
  },
  {
    id: 'flush_minimal_apartment', icon: '⚪', category: 'flush_mount', style: 'modern_minimal',
    name: '极简圆盘公寓吸顶灯', desc: 'White disc · 隐形吸顶 · 现代公寓',
    prompt: 'Mount this ultra-minimal white circular disc flush mount with hand-blown opal glass diffuser flush to the ceiling above a low-profile boucle sectional in a contemporary American urban apartment. Warm white plaster walls, oversized abstract painting in muted earth tones, custom walnut media console with integrated storage, low-pile cream wool rug on light oak floors, single sculptural ceramic vessel with eucalyptus. Warm 2700K ambient glow. Sophisticated contemporary American urban living, CB2 meets Studio McGee aesthetic, 8K editorial photography.'
  },
  {
    id: 'flush_pb_farmhouse_porch', icon: '🌾', category: 'flush_mount', style: 'farmhouse',
    name: 'PB 农舍门廊吸顶灯', desc: 'Aged bronze · 玻璃罩 · 入户门廊',
    prompt: 'Mount this Pottery Barn-style aged bronze flush mount ceiling light with hand-blown seeded glass diffuser on the ceiling of a welcoming farmhouse covered front porch. White-painted shiplap ceiling, white-painted board-and-batten exterior walls, wide-plank reclaimed oak porch floor, oversized white Adirondack chairs with navy striped cushions, large terracotta planters with manicured boxwood, antique galvanized metal milk pail with fresh hydrangeas, hanging porch swing. Warm 2700K welcoming evening glow as sunset paints the sky pink. Farmhouse American hospitality, Pottery Barn meets Magnolia, magazine cover quality.'
  },

  // ============== v22-R 扩充：过道灯（追加 +5）==============
  {
    id: 'corridor_modern_oak', icon: '🪵', category: 'corridor_light', style: 'pottery_barn',
    name: 'PB 木质过道吊灯', desc: 'Oak + brass · 美式过道 · 8-10 inch',
    prompt: 'Hang a row of three small Pottery Barn-style pendant lights with light oak wood canopy and aged brass hardware along a refined American farmhouse hallway. Each lantern: ACTUAL PHYSICAL SIZE 8-10 inches diameter, NOT large (this is a hallway pendant, must look proportionally small). White shiplap walls, wide-plank reclaimed oak floors, antique runner rug, gallery wall of framed family photographs in light wood frames, antique console table with fresh white hydrangeas. Warm 2700K glow welcoming guests. Farmhouse hospitality aesthetic, Magnolia meets Pottery Barn, magazine cover quality.'
  },
  {
    id: 'corridor_industrial_loft', icon: '🔩', category: 'corridor_light', style: 'industrial',
    name: '工业风过道吊灯', desc: 'Black iron + Edison · Loft 走廊 · 小尺寸',
    prompt: 'Hang a row of three small industrial pendant lights with matte black iron cage and exposed vintage Edison bulb along a Brooklyn loft hallway. Each lantern: ACTUAL PHYSICAL SIZE 8-10 inches diameter, NOT large (hallway pendant must look proportionally small). Exposed brick walls, vintage steel-framed factory windows, polished concrete floor with vintage runner rug, framed black-and-white industrial photography, antique wooden bench. Warm amber Edison glow contrasting with cool brick textures. Brooklyn industrial loft aesthetic, Restoration Hardware industrial collection meets vintage warehouse, 8K cinematic.'
  },
  {
    id: 'corridor_coastal_shell_white', icon: '🐚', category: 'corridor_light', style: 'coastal',
    name: '海岸风贝壳过道灯', desc: 'White + Capiz · 沙滩屋走廊 · 小尺寸',
    prompt: 'Hang a row of three small coastal pendant lights with white wash finish and Capiz shell diffusers along a Hamptons beach cottage hallway. Each lantern: ACTUAL PHYSICAL SIZE 8-10 inches diameter, NOT large (hallway pendant must look proportionally small). White shiplap walls, bleached oak floors, sisal runner rug, framed black-and-white ocean photography, antique driftwood console table with conch shells. Soft natural midday light filtering from a far window showing dune grass and the Atlantic. Coastal Living magazine aesthetic, refined Hamptons summer hospitality, magazine cover quality.'
  },
  {
    id: 'corridor_black_cast_iron', icon: '⚫', category: 'corridor_light', style: 'transitional',
    name: '黑色铸铁过道吊灯', desc: 'Cast iron + glass · 南欧风过道 · 小尺寸',
    prompt: 'Hang a row of three small cast iron pendant lanterns with matte black finish and hand-blown clear seeded glass panels along a refined American farmhouse hallway with southern European Mediterranean influence. Each lantern: ACTUAL PHYSICAL SIZE 8-10 inches diameter, NOT large (hallway pendant must look proportionally small). Hand-troweled cream Venetian plaster walls, terracotta tile floor with antique kilim runner, reclaimed wood console table with terracotta urn full of olive branches, framed antique Italian botanical prints. Warm 2700K glow with golden hour light. Mediterranean-influenced American transitional aesthetic, McGee Studio meets Tuscan villa, magazine quality.'
  },
  {
    id: 'corridor_alabaster_petite_modern', icon: '🤍', category: 'corridor_light', style: 'mansion_luxe',
    name: '雪花石小型过道灯', desc: 'Alabaster + brass · 豪宅走廊 · 8-10 inch',
    prompt: 'Hang a row of three small petite Spanish alabaster pendant lanterns with polished antique brass hardware along the gallery hallway of a Beverly Hills mansion. Each lantern: ACTUAL PHYSICAL SIZE 8-10 inches diameter, NOT large (this is a hallway pendant for a 9-foot wide corridor, must look proportionally small — DO NOT enlarge). Hand-troweled Venetian plaster walls in warm bone, herringbone Calacatta marble floor, gallery wall of framed museum-quality artwork in gilded antique frames, antique Persian Hamadan runner rug, antique French console with fresh white French peonies. Warm 2700K alabaster glow casting soft mineral-veined shadows. Architectural Digest "Most Beautiful Homes" cover quality, refined Beverly Hills luxury, 8K cinematic detail.'
  },

  // ============== v22-R 扩充：风扇灯（追加 +8）==============
  {
    id: 'fan_rh_master_bedroom', icon: '🌀', category: 'fan_light', style: 'rh_luxury',
    name: 'RH 主卧风扇灯', desc: 'Brass + glass globe · 主卧 · Hamptons',
    prompt: 'Mount this Restoration Hardware-style ceiling fan with polished antique brass body, hand-blown opal glass globe light kit, and four walnut blades from a 12-foot ceiling in a luxurious Hamptons primary bedroom. Custom oversized bed with Belgian linen tufted headboard, crisp white French linen bedding with cashmere throw at foot, antique pine nightstands with brass swing-arm reading lamps, hand-knotted Persian rug on wide-plank reclaimed oak floors, oversized arched window with sheer linen drapes showing dune grass and Atlantic in distance, fresh white peonies in silver mint julep cup. Warm 2700K bedside glow. RH meets Aerin Lauder aesthetic, Architectural Digest cover quality.'
  },
  {
    id: 'fan_modern_dining_black', icon: '⚫', category: 'fan_light', style: 'modern_minimal',
    name: '现代极简餐厅风扇灯', desc: 'Matte black · 透明叶片 · 当代餐厅',
    prompt: 'Mount this modern minimal ceiling fan with matte black body, integrated LED disc light, and three slim transparent acrylic blades from the ceiling of a contemporary American dining room above a sleek walnut dining table. Warm white plaster walls, oversized abstract painting, modern walnut dining chairs with black leather seats, low-pile cream wool rug on light oak floors, single sculptural ceramic centerpiece with eucalyptus, custom built-in walnut buffet with curated objects. Warm 2700K integrated light with cool natural daylight from oversized windows. Contemporary American minimal aesthetic, Studio McGee meets Lulu and Georgia, magazine quality, 8K editorial photography.'
  },
  {
    id: 'fan_coastal_white_palm', icon: '🌴', category: 'fan_light', style: 'coastal',
    name: '海岸风棕榈叶风扇灯', desc: 'White + woven palm blades · 沙滩屋客厅',
    prompt: 'Mount this coastal ceiling fan with white-washed wooden body, hand-blown opal glass globe light kit, and four woven natural palm leaf blades from the cathedral ceiling of a Hamptons beach cottage great room. White shiplap walls, large slipcovered cream linen sectional with navy striped throw pillows, distressed white oak coffee table, jute area rug on bleached oak floors, framed antique nautical charts in white frames, large clear glass hurricane vase with sea fans and shells. Soft natural midday light flooding through oversized windows showing dune grass and the Atlantic ocean. Coastal Living magazine cover quality, refined Hamptons summer aesthetic, warm welcoming family ambiance.'
  },
  {
    id: 'fan_industrial_loft', icon: '🔩', category: 'fan_light', style: 'industrial',
    name: '工业风 Loft 风扇灯', desc: 'Black metal + Edison · 厂房 loft',
    prompt: 'Mount this industrial ceiling fan with matte black body, exposed vintage Edison bulb light kit, and four matte black metal blades from the high ceiling of a converted Brooklyn factory loft. Exposed brick walls, oversized steel-framed factory windows, polished concrete floors, vintage Persian Heriz rug, vintage leather Chesterfield sofa, reclaimed barn wood coffee table styled with stacked vintage books and a single brass globe, oversized abstract painting in muted industrial tones. Warm amber Edison glow contrasting with cool brick and concrete textures. Restoration Hardware industrial collection meets Brooklyn loft aesthetic, 8K cinematic detail.'
  },
  {
    id: 'fan_farmhouse_iron_kitchen', icon: '🌾', category: 'fan_light', style: 'farmhouse',
    name: '农舍铸铁厨房风扇灯', desc: 'Cast iron + wood blades · 农舍厨房',
    prompt: 'Mount this American farmhouse ceiling fan with matte black cast iron body, hand-blown clear seeded glass globe light kit, and four reclaimed barn wood blades from the cathedral wood-beam ceiling of an American farmhouse great room kitchen. White shiplap walls, custom soft white shaker cabinets, oversized farmhouse sink with brass bridge faucet, butcher block island top, vintage cross-back stools with leather seats, antique heirloom Persian rug on wide-plank reclaimed oak floors, large bowl of fresh garden vegetables. Warm 2700K glow with golden hour light. Magnolia Home meets Pottery Barn farmhouse aesthetic, magazine cover quality.'
  },
  {
    id: 'fan_outdoor_porch_black', icon: '☀️', category: 'fan_light', style: 'transitional',
    name: '户外门廊风扇灯', desc: 'Weatherproof black · 美式门廊 · 防水',
    prompt: 'Mount this weather-resistant outdoor ceiling fan with matte black body, hand-blown clear seeded glass globe light kit, and four matte black blades from the wood-beam ceiling of a Hamptons estate covered front porch. White-painted shiplap porch ceiling, white-painted board-and-batten exterior wall, wide-plank reclaimed oak porch floor, oversized white Adirondack chairs with navy striped cushions, large terracotta planters with manicured boxwood topiaries, antique galvanized metal milk pail with fresh hydrangeas. Warm 2700K glow as golden hour sunset paints the sky and the Atlantic ocean visible in the distance. Coastal Living estate aesthetic, refined American hospitality, magazine quality.'
  },
  {
    id: 'fan_aerin_bedroom_brass', icon: '✨', category: 'fan_light', style: 'vc_classic',
    name: 'Aerin 主卧风扇灯', desc: 'Polished brass + white shade · 优雅卧室',
    prompt: 'Mount this elegant Visual Comfort Aerin Lauder-style ceiling fan with polished antique brass body, hand-blown opal glass center light kit, and four oak wood blades from the ceiling of a refined American primary bedroom. Hand-troweled Pavilion Gray walls, custom velvet headboard, crisp white French linen bedding with cashmere throw, antique pine nightstands with brass picture lights, hand-knotted Persian Tabriz rug on light oak herringbone floors, gallery wall of framed botanical prints in gold leaf frames, oversized arched window with sheer linen drapes, fresh white peonies in silver mint julep cup. Warm 2700K bedside glow. Refined American old-money bedroom aesthetic, Town & Country meets Aerin Lauder, 8K cinematic detail.'
  },
  {
    id: 'fan_tropical_great_room', icon: '🌺', category: 'fan_light', style: 'mansion_luxe',
    name: 'Beverly Hills 热带大宅风扇灯', desc: 'Tropical estate · 大宅客厅 · 大尺寸',
    prompt: 'Mount this oversized tropical-style ceiling fan with hand-finished aged bronze body, hand-blown alabaster glass center light kit, and four woven palm leaf blades from the 18-foot cathedral ceiling of a Beverly Hills mansion great room. Hand-troweled Venetian plaster walls in warm bone, oversized custom Belgian linen sectional, antique Calacatta marble coffee table, hand-knotted Persian Tabriz rug on light oak floors, custom built-in oak shelves with curated objects and art books, oversized abstract painting, large monstera and bird-of-paradise plants, French doors leading to a manicured garden with pool. Warm 2700K alabaster glow with golden hour light streaming through the doors. Architectural Digest "Most Beautiful Homes" cover quality, refined California luxury, 8K cinematic detail.'
  }
];



// v22-S: AI prompt 自动分类（基于关键词匹配，离线 + 快速）
function autoClassifyPrompt(prompt) {
  const p = (prompt || '').toLowerCase();
  // 灯具类型识别（按出现频次最高的归类）
  const categoryRules = [
    { id: 'chandelier',     keywords: ['chandelier', '枝形吊灯', 'crystal cascading', 'multi-tier'] },
    { id: 'wall_sconce',    keywords: ['wall sconce', 'wall light', 'sconce', '壁灯', 'mounted', 'swing-arm'] },
    { id: 'pendant',        keywords: ['pendant', 'pendant light', '吊灯', 'hang above', 'suspend'] },
    { id: 'table_lamp',     keywords: ['table lamp', 'desk lamp', 'buffet lamp', '台灯', 'nightstand lamp', 'on a side table'] },
    { id: 'floor_lamp',     keywords: ['floor lamp', 'arc lamp', 'arched floor', 'tripod floor', '落地灯', 'standing lamp'] },
    { id: 'flush_mount',    keywords: ['flush mount', 'ceiling light', 'semi-flush', '吸顶', 'flush to the ceiling'] },
    { id: 'corridor_light', keywords: ['hallway', 'corridor', 'walkway', '过道', 'foyer pendant'] },
    { id: 'fan_light',      keywords: ['ceiling fan', 'fan light', '风扇灯'] }
  ];
  const scores = {};
  for (const rule of categoryRules) {
    let s = 0;
    for (const kw of rule.keywords) {
      const count = (p.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      s += count;
    }
    if (s > 0) scores[rule.id] = s;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const category = sorted[0]?.[0] || 'pendant'; // 默认归吊灯

  // 风格识别
  const styleRules = [
    { id: 'mansion_luxe',   keywords: ['beverly hills', 'mansion', 'cascading crystal', 'architectural digest cover', 'venetian plaster', 'calacatta', 'alabaster', 'penthouse'] },
    { id: 'rh_luxury',      keywords: ['restoration hardware', ' rh ', 'rh modern', 'rh industrial', 'rh meets', 'aged bronze'] },
    { id: 'vc_classic',     keywords: ['visual comfort', 'aerin', 'aerin lauder', 'town & country', 'old-money'] },
    { id: 'pottery_barn',   keywords: ['pottery barn', 'magnolia', 'farmhouse hospitality'] },
    { id: 'coastal',        keywords: ['hamptons', 'coastal', 'beach cottage', 'capiz shell', 'dune grass', 'atlantic'] },
    { id: 'industrial',     keywords: ['industrial', 'loft', 'edison bulb', 'brooklyn', 'exposed brick', 'factory'] },
    { id: 'farmhouse',      keywords: ['farmhouse', 'shiplap', 'magnolia home', 'cross-back', 'barn wood'] },
    { id: 'modern_minimal', keywords: ['modern minimal', 'minimal', 'contemporary', 'studio mcgee', 'lulu and georgia', 'boucle'] },
    { id: 'west_elm',       keywords: ['west elm'] },
    { id: 'transitional',   keywords: ['transitional', 'refined', 'mid-century', 'mediterranean'] },
    { id: 'traditional',    keywords: ['traditional american', 'classic american', 'french empire'] }
  ];
  const styleScores = {};
  for (const rule of styleRules) {
    let s = 0;
    for (const kw of rule.keywords) {
      if (p.includes(kw)) s += 1;
    }
    if (s > 0) styleScores[rule.id] = s;
  }
  const styleSorted = Object.entries(styleScores).sort((a, b) => b[1] - a[1]);
  const style = styleSorted[0]?.[0] || 'transitional';

  // 自动生成简短名称（取前几个有意义的英文词）
  const cleaned = (prompt || '').replace(/[^\w\s,]/g, ' ').replace(/\s+/g, ' ');
  // 取前 60 个字符 + 截断到最近空格
  let suggestedName = cleaned.slice(0, 60);
  if (suggestedName.length === 60) {
    const cut = suggestedName.lastIndexOf(' ');
    if (cut > 30) suggestedName = suggestedName.slice(0, cut);
  }

  // 选个 emoji
  const iconMap = {
    chandelier: '✨', wall_sconce: '🏛️', pendant: '🎇', table_lamp: '💡',
    floor_lamp: '🪴', flush_mount: '⭕', corridor_light: '🚪', fan_light: '🌀'
  };
  const icon = iconMap[category] || '🌟';

  return { category, style, suggestedName: suggestedName.trim(), icon };
}


// 调用 Gemini 生成图片
async function callGeminiGenerate({ apiKey, model, prompt, images, aspectRatio, sampleCount }) {
  // 自动迁移旧模型 ID
  model = migrateModelId(model);
  const modelDef = GEMINI_IMAGE_MODELS.find(m => m.id === model) || GEMINI_IMAGE_MODELS[0];
  if (!apiKey) throw new Error('未配置 API Key，请联系管理员在「团队」→「Gemini AI 设置」中配置');
  if (!prompt || !prompt.trim()) throw new Error('请输入生成要求（prompt）');

  if (modelDef.api === 'generateContent') {
    // Gemini 系列（支持参考图）
    const parts = [{ text: prompt }];
    if (images && images.length) {
      for (const img of images) {
        parts.push({
          inlineData: { mimeType: img.mimeType, data: img.base64 }
        });
      }
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...(aspectRatio ? { imageConfig: { aspectRatio } } : {})
      }
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error('API 错误 ' + resp.status + '：' + t.substring(0, 300));
    }
    const data = await resp.json();
    const imgs = [];
    for (const cand of (data.candidates || [])) {
      for (const part of (cand.content?.parts || [])) {
        if (part.inlineData) {
          imgs.push({ mimeType: part.inlineData.mimeType, base64: part.inlineData.data });
        }
      }
    }
    if (!imgs.length) {
      const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || '';
      const rawDetail = JSON.stringify(data).substring(0, 200);
      let friendly = '';
      if (/SAFETY|blocked|policy/i.test(reason)) {
        friendly = 'AI 安全策略拒绝（可能含敏感内容/版权/人像/水印）';
      } else if (/RECITATION/i.test(reason)) {
        friendly = 'Prompt 太接近训练数据（试着改写 prompt 更原创）';
      } else if (/MAX_TOKENS|LENGTH/i.test(reason)) {
        friendly = 'Prompt 太长，请精简';
      } else if (reason === 'OTHER' || !reason) {
        friendly = 'Prompt 太模糊或无图像内容（短中文 prompt 常出此错 · 强烈建议点 [🪄 智能拓展] 修复）';
      } else {
        friendly = `原因：${reason}`;
      }
      throw new Error('未生成图片（' + friendly + '）');
    }
    return imgs;
  } else {
    // Imagen 系列（仅文生图）
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(apiKey)}`;
    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: sampleCount || 1,
        aspectRatio: aspectRatio || '1:1'
      }
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error('API 错误 ' + resp.status + '：' + t.substring(0, 300));
    }
    const data = await resp.json();
    const imgs = (data.predictions || []).map(p => ({
      mimeType: 'image/png',
      base64: p.bytesBase64Encoded
    }));
    if (!imgs.length) throw new Error('未生成图片，请重试或换 prompt');
    return imgs;
  }
}

// v22-J: OpenAI 图像生成（gpt-image-2 / 1.5 / 1 / 1-mini / dall-e-3）
// 支持文生图 + 图编辑（输入参考图）
// 返回值与 callGeminiGenerate 一致：[{ mimeType, base64 }]
async function callOpenAIGenerate({ apiKey, model, prompt, images, aspectRatio, sampleCount, quality }) {
  if (!apiKey) throw new Error('未配置 OpenAI API Key，请联系管理员在「团队」→「OpenAI 设置」中配置');
  if (!prompt || !prompt.trim()) throw new Error('请输入生成要求（prompt）');

  // v22-DD: OpenAI 图像 API 只支持 3 个标准尺寸 + auto（不支持任意 WxH）
  //   Supported: 1024x1024 / 1024x1536 / 1536x1024 / auto
  //   其他 ratio 自动映射到最接近的支持尺寸
  function ratioToSize(ratio) {
    // free / original / auto / undefined → 让 API 自己决定
    if (!ratio || ratio === 'auto' || ratio === 'free' || ratio === 'original') return 'auto';
    // 1:1 → 方形
    if (ratio === '1:1') return '1024x1024';
    // 横版（宽 > 高）→ 1536x1024
    const widescreen = ['16:9', '3:2', '4:3', '5:4', '7:5', '14:11', '2:1', '21:9'];
    if (widescreen.includes(ratio)) return '1536x1024';
    // 竖版（高 > 宽）→ 1024x1536
    const portrait   = ['9:16', '2:3', '3:4', '4:5', '5:7', '11:14', '1:2'];
    if (portrait.includes(ratio))   return '1024x1536';
    // 未知比例 fallback 方形
    return '1024x1024';
  }
  const size = ratioToSize(aspectRatio);
  const isEdit = images && images.length > 0;
  // dall-e-3 不支持编辑，强制走 generations
  const supportsEdit = !model.startsWith('dall-e');

  let url, body, headers;
  headers = {
    'Authorization': `Bearer ${apiKey}`
  };

  if (isEdit && supportsEdit) {
    // 多图编辑：使用 multipart/form-data
    url = 'https://api.openai.com/v1/images/edits';
    const formData = new FormData();
    formData.append('model', model);
    formData.append('prompt', prompt);
    formData.append('n', String(Math.min(sampleCount || 1, 10)));
    formData.append('size', size);
    if (!model.startsWith('dall-e')) {
      // gpt-image 系列支持 quality
      formData.append('quality', quality || 'high');
    }
    // 添加图片
    for (let i = 0; i < images.length && i < 16; i++) {
      const img = images[i];
      const blob = base64ToBlob(img.base64, img.mimeType);
      formData.append('image[]', blob, `ref_${i}.png`);
    }
    body = formData;
    // multipart 不设 Content-Type，让浏览器自动加
  } else {
    // 纯文生图
    url = 'https://api.openai.com/v1/images/generations';
    headers['Content-Type'] = 'application/json';
    const params = {
      model,
      prompt,
      n: Math.min(sampleCount || 1, 10),
      size
    };
    if (model.startsWith('gpt-image')) {
      // v22-AA: gpt-image-* 接受 low/medium/high/auto（不接受 hd/standard/4k）
      const qMap = { standard: 'medium', hd: 'high', '4k': 'high', low: 'low', medium: 'medium', high: 'high', auto: 'auto' };
      params.quality = qMap[quality] || 'high';
      params.output_format = 'png';
    } else if (model === 'dall-e-3') {
      // DALL-E 3 接受 standard / hd
      params.quality = (quality === 'standard' || quality === 'low' || quality === 'medium') ? 'standard' : 'hd';
      // DALL-E 3 强制 n=1
      params.n = 1;
    }
    body = JSON.stringify(params);
  }

  let resp;
  try {
    resp = await fetch(url, { method: 'POST', headers, body });
  } catch (e) {
    throw new Error('OpenAI API 网络错误（可能需要 VPN）: ' + e.message);
  }
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = j.error?.message || JSON.stringify(j); }
    catch (e) { detail = await resp.text(); }
    if (resp.status === 403 && detail.includes('verif')) {
      throw new Error(`OpenAI API 403：你的组织尚未通过 API Organization Verification（gpt-image 系列必需）。\n\n解决方法：登录 https://platform.openai.com → Settings → Organization → Verification → 完成身份验证（通常需要美国身份信息或国际信用卡 + 人脸识别 5-10 分钟）。\n\n验证后通常 24h 内开通。临时可用 dall-e-3 模型。\n\n原始错误：${detail}`);
    }
    throw new Error(`OpenAI 图像 API ${resp.status}: ${detail}`);
  }
  const data = await resp.json();
  const imgs = (data.data || []).map(d => {
    if (d.b64_json) {
      // gpt-image 系列默认返回 b64
      return { mimeType: 'image/png', base64: d.b64_json };
    } else if (d.url) {
      // dall-e-3 返回 URL — 需要 fetch 转 base64
      return { mimeType: 'image/png', base64: null, url: d.url, _needsFetch: true };
    }
    return null;
  }).filter(Boolean);

  // 如果有 URL 形式的（dall-e-3），fetch 并转 base64
  for (const img of imgs) {
    if (img._needsFetch && img.url) {
      try {
        const imgResp = await fetch(img.url);
        const blob = await imgResp.blob();
        img.base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(blob);
        });
        delete img._needsFetch;
        delete img.url;
      } catch (e) {
        console.warn('Failed to fetch DALL-E image:', e);
      }
    }
  }

  if (!imgs.length) throw new Error('OpenAI 未生成图片（可能内容安全策略拒绝）');
  return imgs;
}

// 统一图像生成入口（自动按 provider 路由）
async function callImageGenerate({ provider, apiKey, model, prompt, images, aspectRatio, sampleCount, quality }) {
  if (provider === 'openai') {
    return callOpenAIGenerate({ apiKey, model, prompt, images, aspectRatio, sampleCount, quality });
  }
  // 默认 gemini
  return callGeminiGenerate({ apiKey, model, prompt, images, aspectRatio, sampleCount });
}

// ====================== File System Access（保存到指定文件夹）======================
// 仅 Chrome/Edge 支持。其他浏览器降级到默认下载。
const FS_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// IndexedDB 存储目录句柄
function _idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wt-fs', 1);
    req.onupgradeneeded = (e) => { e.target.result.createObjectStore('handles'); };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSavedDirHandle() {
  if (!FS_SUPPORTED) return null;
  try {
    const db = await _idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const r = tx.objectStore('handles').get('save-dir');
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function saveDirHandle(handle) {
  try {
    const db = await _idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'save-dir');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function clearDirHandle() {
  try {
    const db = await _idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete('save-dir');
      tx.oncomplete = () => resolve(true);
    });
  } catch (e) { return false; }
}

async function ensureFsPermission(handle) {
  if (!handle) return false;
  try {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  } catch (e) { return false; }
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'image/png' });
}

// 保存图片：优先用 File System Access 写入指定目录，失败则浏览器默认下载
async function saveImageFile(base64, mimeType, filename, dirHandle) {
  const blob = base64ToBlob(base64, mimeType);
  if (dirHandle && await ensureFsPermission(dirHandle)) {
    try {
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { method: 'fs', dir: dirHandle.name, filename };
    } catch (e) {
      console.warn('FS 保存失败，降级到浏览器下载:', e);
    }
  }
  // 降级
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { method: 'browser', filename };
}

// ====================== 多 AI 文本生成 ======================
// Claude 模型
const CLAUDE_MODELS = [
  { id: 'claude-haiku-4-5-20251001',  name: 'Claude Haiku 4.5',  desc: '最便宜 · 快 · 适合产品文案/简短改写', badge: '便宜' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', desc: '平衡 · 适合博客和详情页改写', badge: '推荐' },
  { id: 'claude-opus-4-5-20251108',   name: 'Claude Opus 4.5',   desc: '最强 · 贵 · 适合重要长文', badge: '顶级' }
];
// OpenAI 模型
const OPENAI_MODELS = [
  { id: 'gpt-4o-mini',  name: 'GPT-4o Mini',  desc: '便宜 · 适合产品文案', badge: '便宜' },
  { id: 'gpt-4o',       name: 'GPT-4o',       desc: '平衡 · 通用写作', badge: '推荐' },
  { id: 'gpt-4-turbo',  name: 'GPT-4 Turbo',  desc: '强 · 适合长博客', badge: '' }
];
// Gemini 文本模型（区别于图像模型）
const GEMINI_TEXT_MODELS = [
  { id: 'gemini-2.5-flash',     name: 'Gemini 2.5 Flash',     desc: '便宜 · 快 · 大上下文', badge: '便宜' },
  { id: 'gemini-2.5-pro',       name: 'Gemini 2.5 Pro',       desc: '强 · 适合长博客', badge: '' }
];

// Claude API（浏览器直连，需要 dangerous-direct-browser-access header）
async function callClaudeText({ apiKey, model, prompt, systemPrompt, maxTokens, temperature, imageBase64 }) {
  if (!apiKey) throw new Error('未配置 Claude API Key');
  if (!prompt || !prompt.trim()) throw new Error('请输入 prompt');
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };
  // 支持图片输入：构造多模态 content
  const content = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: prompt }
      ]
    : prompt;
  const body = {
    model: model || 'claude-sonnet-4-5-20250929',
    max_tokens: maxTokens || 4096,
    temperature: temperature ?? 0.7,
    messages: [{ role: 'user', content }]
  };
  if (systemPrompt) body.system = systemPrompt;
  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Claude API 网络错误（可能需要 VPN）: ' + e.message);
  }
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = j.error?.message || JSON.stringify(j); } catch (e) { detail = await resp.text(); }
    throw new Error(`Claude API ${resp.status}: ${detail}`);
  }
  const data = await resp.json();
  const text = (data.content || []).map(c => c.text || '').join('');
  return { text, usage: data.usage, raw: data };
}

// OpenAI API（浏览器直连）
async function callOpenAIText({ apiKey, model, prompt, systemPrompt, maxTokens, temperature }) {
  if (!apiKey) throw new Error('未配置 OpenAI API Key');
  if (!prompt || !prompt.trim()) throw new Error('请输入 prompt');
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  let resp;
  try {
    resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        max_tokens: maxTokens || 4096,
        temperature: temperature ?? 0.7,
        messages
      })
    });
  } catch (e) {
    throw new Error('OpenAI API 网络错误（可能需要 VPN）: ' + e.message);
  }
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = j.error?.message || JSON.stringify(j); } catch (e) { detail = await resp.text(); }
    throw new Error(`OpenAI API ${resp.status}: ${detail}`);
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { text, usage: data.usage, raw: data };
}

// Gemini 文本 API（区别于图像）
async function callGeminiText({ apiKey, model, prompt, systemPrompt, maxTokens, temperature }) {
  if (!apiKey) throw new Error('未配置 Gemini API Key');
  if (!prompt || !prompt.trim()) throw new Error('请输入 prompt');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens || 4096,
      temperature: temperature ?? 0.7
    }
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Gemini API 网络错误: ' + e.message);
  }
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = j.error?.message || JSON.stringify(j); } catch (e) { detail = await resp.text(); }
    throw new Error(`Gemini Text API ${resp.status}: ${detail}`);
  }
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return { text, usage: data.usageMetadata, raw: data };
}

// 统一文本 AI 接口
async function callAiText({ provider, apiKey, model, prompt, systemPrompt, maxTokens, temperature, imageBase64 }) {
  const fn = { claude: callClaudeText, openai: callOpenAIText, gemini: callGeminiText }[provider];
  if (!fn) throw new Error('未知 AI provider: ' + provider);
  return fn({ apiKey, model, prompt, systemPrompt, maxTokens, temperature, imageBase64 });
}

// ====================== AI 生图历史记录（IndexedDB）======================
async function _aiHistDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wt-ai-hist', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function addAiHistory(item) {
  try {
    const db = await _aiHistDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').add({ ...item, createdAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function listAiHistory(limit = 30) {
  try {
    const db = await _aiHistDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readonly');
      const r = tx.objectStore('items').index('createdAt').openCursor(null, 'prev');
      const items = [];
      r.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur && items.length < limit) { items.push(cur.value); cur.continue(); }
        else resolve(items);
      };
      r.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}

// v22-AB: Prompt 历史（专门记录成功的 prompt · 一键复用）
async function _promptHistDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wt-prompt-hist', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('promptHash', 'promptHash', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
function simplePromptHash(s) {
  // 简单 hash 用于去重（同一 prompt 多次保存只留一条）
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return String(h);
}
async function savePromptHistory({ prompt, success, lightType, provider, model }) {
  if (!prompt || prompt.trim().length < 30) return null;  // 太短的不存
  const trimmed = prompt.trim();
  const hash = simplePromptHash(trimmed.slice(0, 200));
  try {
    const db = await _promptHistDb();
    return new Promise((resolve) => {
      // 先查是否存在同 hash → 更新 count，否则新增
      const tx = db.transaction('items', 'readwrite');
      const idx = tx.objectStore('items').index('promptHash');
      const range = IDBKeyRange.only(hash);
      const cursor = idx.openCursor(range);
      let found = false;
      cursor.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur && !found) {
          found = true;
          // 更新使用次数 + 时间
          const data = cur.value;
          data.useCount = (data.useCount || 1) + 1;
          data.lastUsed = Date.now();
          data.success = success || data.success;
          cur.update(data);
          resolve(data.id);
        } else if (!found) {
          // 新建
          const r = tx.objectStore('items').add({
            prompt: trimmed.slice(0, 4000),
            promptHash: hash,
            preview: trimmed.slice(0, 100),
            success: !!success,
            useCount: 1,
            lightType: lightType || '',
            provider: provider || '',
            model: model || '',
            createdAt: Date.now(),
            lastUsed: Date.now()
          });
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(null);
        }
      };
      cursor.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}
async function listPromptHistory(limit = 100) {
  try {
    const db = await _promptHistDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readonly');
      const r = tx.objectStore('items').index('createdAt').openCursor(null, 'prev');
      const items = [];
      r.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur && items.length < limit) { items.push(cur.value); cur.continue(); }
        else resolve(items);
      };
      r.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}
async function deletePromptHistory(id) {
  try {
    const db = await _promptHistDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}
async function clearPromptHistory() {
  try {
    const db = await _promptHistDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

// v22-AU: 配件库（吸顶盘 / 灯罩 / 灯臂 / 底座 等可复用配件）
async function _componentLibDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wt-component-lib', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('partType', 'partType', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveComponent({ partType, label, imageBase64, mimeType, note, userId, userName }) {
  if (!imageBase64) throw new Error('缺图片数据');
  const db = await _componentLibDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    const req = tx.objectStore('items').add({
      partType: partType || 'other',
      label: (label || '').slice(0, 80),
      imageBase64,
      mimeType: mimeType || 'image/jpeg',
      note: (note || '').slice(0, 300),
      createdAt: Date.now(),
      userId: userId || 'anon',
      userName: userName || ''
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function listComponents(partType = null) {
  try {
    const db = await _componentLibDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readonly');
      const req = tx.objectStore('items').getAll();
      req.onsuccess = () => {
        let items = req.result || [];
        if (partType) items = items.filter(i => i.partType === partType);
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}
async function deleteComponent(id) {
  try {
    const db = await _componentLibDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}
async function updateComponent(id, patch) {
  try {
    const db = await _componentLibDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readwrite');
      const store = tx.objectStore('items');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const old = getReq.result;
        if (!old) { resolve(false); return; }
        const merged = { ...old, ...patch, id, updatedAt: Date.now() };
        const putReq = store.put(merged);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      };
      getReq.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function deleteAiHistoryItem(id) {
  try {
    const db = await _aiHistDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').delete(id);
      tx.oncomplete = () => resolve(true);
    });
  } catch (e) { return false; }
}

async function clearAiHistory() {
  try {
    const db = await _aiHistDb();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').clear();
      tx.oncomplete = () => resolve(true);
    });
  } catch (e) { return false; }
}

// ====================== Prompt 模板收藏（每个员工本机）======================
async function _favDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wt-favs', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('favs')) db.createObjectStore('favs', { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadFavorites() {
  try {
    const db = await _favDb();
    return new Promise((resolve) => {
      const tx = db.transaction('favs', 'readonly');
      const r = tx.objectStore('favs').getAll();
      r.onsuccess = () => resolve(new Set((r.result || []).map(x => x.id)));
      r.onerror = () => resolve(new Set());
    });
  } catch (e) { return new Set(); }
}
async function toggleFavorite(templateId) {
  try {
    const db = await _favDb();
    return new Promise((resolve) => {
      const tx = db.transaction('favs', 'readwrite');
      const store = tx.objectStore('favs');
      const r = store.get(templateId);
      r.onsuccess = () => {
        if (r.result) { store.delete(templateId); resolve(false); }
        else { store.put({ id: templateId, addedAt: Date.now() }); resolve(true); }
      };
    });
  } catch (e) { return null; }
}

// v22-O: Prompt 模板使用次数（按用户使用频率自动排序）
async function _usageDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wt-template-usage', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('usage')) db.createObjectStore('usage', { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadTemplateUsage() {
  try {
    const db = await _usageDb();
    return new Promise((resolve) => {
      const tx = db.transaction('usage', 'readonly');
      const r = tx.objectStore('usage').getAll();
      r.onsuccess = () => {
        // v22-U: 返回完整对象（含 count + lastUsed），向后兼容（数字访问仍可用 .count）
        const map = {};
        for (const x of (r.result || [])) {
          map[x.id] = { count: x.count || 0, lastUsed: x.lastUsed || 0 };
        }
        resolve(map);
      };
      r.onerror = () => resolve({});
    });
  } catch (e) { return {}; }
}
async function incTemplateUsage(templateId) {
  try {
    const db = await _usageDb();
    return new Promise((resolve) => {
      const tx = db.transaction('usage', 'readwrite');
      const store = tx.objectStore('usage');
      const r = store.get(templateId);
      r.onsuccess = () => {
        const old = r.result;
        store.put({
          id: templateId,
          count: (old?.count || 0) + 1,
          lastUsed: Date.now()
        });
        resolve();
      };
      r.onerror = () => resolve();
    });
  } catch (e) { return; }
}
async function resetTemplateUsage() {
  try {
    const db = await _usageDb();
    return new Promise((resolve) => {
      const tx = db.transaction('usage', 'readwrite');
      tx.objectStore('usage').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) { return; }
}

// v22-O: 详情改写版本管理（每个 product handle 多版本）
async function _pdpVerDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wt-pdp-versions', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('versions')) {
        const store = db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('handle', 'handle', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function savePdpVersion({ handle, title, content, skillId, skillName, provider, model, userId, userName }) {
  if (!content || !content.trim()) return null;
  try {
    const db = await _pdpVerDb();
    return new Promise((resolve) => {
      const tx = db.transaction('versions', 'readwrite');
      const r = tx.objectStore('versions').add({
        handle: (handle || '').trim() || '_unkonwn_',
        title: (title || '').trim().slice(0, 100),
        content,
        skillId, skillName, provider, model,
        userId, userName,
        createdAt: Date.now()
      });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}
async function listPdpVersions(handle, limit = 30) {
  try {
    const db = await _pdpVerDb();
    return new Promise((resolve) => {
      const tx = db.transaction('versions', 'readonly');
      const store = tx.objectStore('versions');
      const list = [];
      // 如果指定 handle，按 handle 索引过滤；否则全部
      const cursorSource = handle
        ? store.index('handle').openCursor(IDBKeyRange.only(handle), 'prev')
        : store.openCursor(null, 'prev');
      cursorSource.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && list.length < limit) {
          list.push(cursor.value);
          cursor.continue();
        } else {
          // 按 createdAt desc 排序兜底（cursor prev 已经基本是新→旧但 handle 索引可能乱序）
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(list);
        }
      };
      cursorSource.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}
async function deletePdpVersion(versionId) {
  try {
    const db = await _pdpVerDb();
    return new Promise((resolve) => {
      const tx = db.transaction('versions', 'readwrite');
      tx.objectStore('versions').delete(versionId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

// 根据岗位返回可用的任务类型
function getTaskTypesForTier(tier) {
  if (tier === 'alibaba' || tier === 'alibaba_artist') return ALIBABA_TASK_TYPES;
  if (tier === 'designer') return {};  // 设计师暂无任务类型（后续补充）
  return STANDARD_TASK_TYPES;
}

// ====================== KPI 规则 (v3.1) ======================
// 产品上传按 SKU 数分档计分
const SKU_TIERS = [
  { min: 1,  max: 2,  points: 10, label: '1-2 SKU' },
  { min: 3,  max: 5,  points: 20, label: '3-5 SKU' },
  { min: 6,  max: 9,  points: 30, label: '6-9 SKU' },
  { min: 10, max: 18, points: 35, label: '10-18 SKU' },
  { min: 19, max: 99, points: 45, label: '19-30 SKU' }
];

function skuTierFor(count) {
  if (count <= 0) return null;
  for (const t of SKU_TIERS) if (count >= t.min && count <= t.max) return t;
  return SKU_TIERS[SKU_TIERS.length - 1]; // 31+ 按最高档
}

// 月度补录已废弃（v2 改为当日记录、当日算分）
// 保留空数组以便兼容历史数据
const MONTHLY_KPI_ITEMS_STANDARD = [];
const MONTHLY_KPI_ITEMS_ALIBABA = [];
function getMonthlyKpiItems(tier) { return []; }

// 日常录入 → KPI 自动算分
// 返回该条 entry 对应的积分
function calcEntryPoints(entry) {
  // v22-DH: 阿里巴巴国际站美工（何健斌 hjb）不计积分 · 只统计上传数量
  // 通过 user_tier (entry 存了的话) 或 user_id 判断
  if (entry && (entry.user_tier === 'alibaba_artist' || entry.user_id === 'hjb')) return 0;
  const d = entry.details || {};
  switch (entry.type) {
    case 'product_upload':
    case 'alibaba_product': {
      // 每个产品按自己的 SKU 数独立算分，然后累加（每条链接 = 一个产品）
      if (Array.isArray(d.skuLinks) && d.skuLinks.length > 0) {
        return d.skuLinks.reduce((sum, x) => {
          const skus = Number(x.skus) || 0;
          if (skus <= 0) return sum;
          const tier = skuTierFor(skus);
          return sum + (tier ? tier.points : 0);
        }, 0);
      } else if (Array.isArray(d.links)) {
        // 兼容旧数据：每条链接当作 1 SKU = 10 分
        return d.links.filter(Boolean).length * 10;
      }
      return 0;
    }
    case 'social_post': {
      const postCount = Number(d.postCount) || 0;
      return postCount * 1; // 社媒分享 1分/次
    }
    case 'blog': {
      const links = (d.links || []).filter(Boolean);
      return links.length * 20; // 博客文章 20分/篇
    }
    case 'landing_page':
    case 'alibaba_detail': {
      return 30; // 页面制作 30分/个
    }
    case 'store_decoration':
    case 'alibaba_decoration': {
      const dec = (DECORATION_TYPES.find(x => x.id === d.decorationType)) || DECORATION_TYPES[0];
      return dec.points;
    }
    case 'ad_design': {
      // 广告图制作 2分/张，按数量算
      const count = Number(d.count) || 1;
      return count * 2;
    }
    case 'alibaba_video': {
      const count = Number(d.count) || 1;
      return count * 2; // 视频上传 2分/个
    }
    case 'review': {
      // 评价内容：4 档 × 数量
      const tier = REVIEW_TIERS.find(t => t.id === d.reviewType) || REVIEW_TIERS[0];
      const count = Number(d.count) || 1;
      return tier.points * count;
    }
    case 'email': {
      const count = Number(d.count) || 1;
      return count * 5; // 邮件营销 5分/次
    }
    case 'edit': {
      const count = Number(d.count) || 1;
      return count * 8; // 简单修图 8分/款
    }
    case 'spec': {
      const count = Number(d.count) || 1;
      return count * 4; // 参数文档 4分/次
    }
    case 'video': {
      const count = Number(d.count) || 1;
      return count * 2; // 视频上传 2分/次
    }
    case 'install': {
      const count = Number(d.count) || 1;
      return count * 1; // 安装图纸 1分/次
    }
    case 'wholesale': {
      const count = Number(d.count) || 1;
      return count * 2; // 修改批发网站 2分/次
    }
    case 'product_modify_hr':
    case 'other_hr': {
      const hours = Number(d.hours) || 0;
      return Math.round(hours * 12 * 10) / 10; // 12分/小时
    }
    case 'penalty': {
      // 扣分：返回负数
      return -(Number(d.points) || 0);
    }
    case 'report': {
      // 汇报问题：不算 KPI 分
      return 0;
    }
    default:
      return 0;
  }
}

// 计算一组 entries 的月度积分汇总 (按 KPI 项分类)
// 返回 { autoSummary: [{name, count, points}], autoTotal }
function summarizeEntriesForKPI(entries, tier) {
  const summary = {};
  const add = (key, name, count, points) => {
    if (!summary[key]) summary[key] = { name, count: 0, points: 0 };
    summary[key].count += count;
    summary[key].points += points;
  };

  for (const e of entries) {
    // 汇报问题不计入 KPI 统计
    if (e.type === 'report') continue;
    const pts = calcEntryPoints(e);
    const d = e.details || {};

    if (e.type === 'product_upload' || e.type === 'alibaba_product') {
      // 每个产品按自己的 SKU 数独立归档（一条链接 = 一个产品）
      if (Array.isArray(d.skuLinks) && d.skuLinks.length > 0) {
        for (const sku of d.skuLinks) {
          const skus = Number(sku.skus) || 0;
          if (skus <= 0) continue;
          const t = skuTierFor(skus);
          if (t) add(`sku_${t.label}`, `上传产品 ${t.label}`, 1, t.points);
        }
      } else if (Array.isArray(d.links)) {
        // 兼容旧数据：每条链接当作 1 SKU
        const links = d.links.filter(Boolean);
        if (links.length > 0) {
          const t = skuTierFor(1);
          if (t) add(`sku_${t.label}`, `上传产品 ${t.label}`, links.length, t.points * links.length);
        }
      }
    } else if (e.type === 'social_post') {
      const cnt = Number(d.postCount) || 0;
      if (cnt > 0) add('social', '社媒分享 (1分/次)', cnt, pts);
    } else if (e.type === 'blog') {
      const cnt = (d.links || []).filter(Boolean).length;
      if (cnt > 0) add('blog', '博客文章 (20分/篇)', cnt, pts);
    } else if (e.type === 'landing_page' || e.type === 'alibaba_detail') {
      add('page', tier === 'alibaba' ? '优化详情页 (30分)' : '页面制作 (30分)', 1, pts);
    } else if (e.type === 'store_decoration' || e.type === 'alibaba_decoration') {
      const dec = (DECORATION_TYPES.find(x => x.id === d.decorationType)) || DECORATION_TYPES[0];
      add(`dec_${dec.id}`, `店铺装修-${dec.label}`, 1, pts);
    } else if (e.type === 'ad_design') {
      const cnt = Number(d.count) || 1;
      add('ad', '广告图一张 (2分/张)', cnt, pts);
    } else if (e.type === 'alibaba_video') {
      const cnt = Number(d.count) || 1;
      add('alibaba_video', '视频上传 (2分/个)', cnt, pts);
    } else if (e.type === 'review') {
      const t = REVIEW_TIERS.find(x => x.id === d.reviewType) || REVIEW_TIERS[0];
      const cnt = Number(d.count) || 1;
      add(`review_${t.id}`, `评价内容 ${t.label} (${t.points}分)`, cnt, pts);
    } else if (e.type === 'email') {
      const cnt = Number(d.count) || 1;
      add('email', '邮件营销 (5分/次)', cnt, pts);
    } else if (e.type === 'edit') {
      const cnt = Number(d.count) || 1;
      add('edit', '简单修图/抠图 (8分/款)', cnt, pts);
    } else if (e.type === 'spec') {
      const cnt = Number(d.count) || 1;
      add('spec', '参数文档+尺寸图 (4分/次)', cnt, pts);
    } else if (e.type === 'video') {
      const cnt = Number(d.count) || 1;
      add('video', '视频上传 (2分/次)', cnt, pts);
    } else if (e.type === 'install') {
      const cnt = Number(d.count) || 1;
      add('install', '安装/3D图纸 (1分/次)', cnt, pts);
    } else if (e.type === 'wholesale') {
      const cnt = Number(d.count) || 1;
      add('wholesale', '修改批发网站 (2分/次)', cnt, pts);
    } else if (e.type === 'product_modify_hr') {
      const hr = Number(d.hours) || 0;
      if (hr > 0) add('product_modify_hr', '修改产品 (12分/小时)', hr, pts);
    } else if (e.type === 'other_hr') {
      const hr = Number(d.hours) || 0;
      if (hr > 0) add('other_hr', '其他工作 (12分/小时)', hr, pts);
    } else if (e.type === 'penalty') {
      const r = PENALTY_REASONS.find(x => x.id === d.reasonType);
      const label = r ? `⚠️ 扣分: ${r.label}` : '⚠️ 扣分';
      add(`penalty_${d.reasonType || 'other'}`, label, 1, pts);
    }
  }

  const list = Object.values(summary).sort((a, b) => b.points - a.points);
  const autoTotal = list.reduce((s, x) => s + x.points, 0);
  return { autoSummary: list, autoTotal };
}

// 计算月度补录项的积分小计
function calcMonthlyManualPoints(items, kpiItems) {
  let total = 0;
  for (const item of kpiItems) {
    const qty = Number(items[item.id]) || 0;
    total += qty * item.points;
  }
  return Math.round(total * 10) / 10;
}

const CHART_COLORS = ['#b45309','#0f766e','#7c2d12','#831843','#1e40af','#be123c','#365314','#86198f'];

// ====================== HELPERS ======================
// v22-CJ: 把 AI 错误信息转成中文人话
function humanizeAiError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  // 网络/超时
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('typeerror')) {
    return '🌐 网络异常 · 检查代理或重试';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
    return '⏱️ AI 响应超时 · 网络较慢，建议重试';
  }
  // HTTP 状态码
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('invalid_api_key')) {
    return '🔑 API Key 无效或过期 · 请联系管理员更换';
  }
  if (msg.includes('403') || msg.includes('forbidden')) {
    return '🚫 API 权限不足 · 该 Key 可能没开通此模型权限';
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many') || msg.includes('quota exceeded') || msg.includes('rate_limit')) {
    return '🚦 AI 服务繁忙（限速）· 稍等几秒再试';
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('bad gateway') || msg.includes('service unavailable')) {
    return '🛠️ AI 服务暂时不可用 · 几分钟后再试';
  }
  // OpenAI/Claude 具体错误
  if (msg.includes('context_length_exceeded') || msg.includes('context length') || msg.includes('maximum context')) {
    return '📏 输入内容太长 · 缩短 prompt 或减少产品数';
  }
  if (msg.includes('content_filter') || msg.includes('content policy') || msg.includes('safety')) {
    return '⚠️ 触发内容审核 · 请调整 prompt 用语';
  }
  if (msg.includes('billing') || msg.includes('insufficient_quota') || msg.includes('no credit')) {
    return '💳 账户余额不足 · 联系管理员充值';
  }
  if (msg.includes('model_not_found') || msg.includes('does not exist') || msg.includes('invalid model')) {
    return '🤖 模型不存在或拼写错误 · 检查模型 ID';
  }
  // 其他常见
  if (msg.includes('parse') || msg.includes('json') || msg.includes('unexpected token')) {
    return '📦 AI 返回格式异常 · 重试一次通常能成';
  }
  if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('abort')) {
    return '⏹️ 任务被中断';
  }
  // 保底：截短显示原始错误
  const raw = String(err?.message || err || '未知错误');
  return raw.length > 100 ? raw.slice(0, 100) + '...' : raw;
}


async function hashPwd(pwd) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(pwd + 'wt_salt_v1'));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
// 给所有非 admin 用户初始化默认密码 hash
async function initUsersWithPwds(users) {
  const memberHash = await hashPwd(DEFAULT_MEMBER_PWD);
  const supHash = await hashPwd('super123');
  // v22-CG: 罗燕秋（多 admin 支持 · 单独密码）
  const luoyqHash = await hashPwd('qq923923');
  return users.map(u => {
    // Martin (id='admin') 走旧 adminPwdHash 路径，不在 user.pwdHash
    if (u.id === 'admin') return u;
    if (u.pwdHash) return u;
    // 罗燕秋单独密码（默认 qq923923）
    if (u.id === 'luoyq') return { ...u, pwdHash: luoyqHash };
    if (u.role === 'admin') return u; // 其他未识别的 admin 不自动设密码
    if (u.role === 'supervisor') return { ...u, pwdHash: supHash };
    return { ...u, pwdHash: memberHash };
  });
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
const monthKey = (s) => s.substring(0, 7);
const formatDate = (s) => { const d = new Date(s); return `${d.getMonth()+1}月${d.getDate()}日`; };
const formatMonth = (m) => { const [y, mo] = m.split('-'); return `${y}年${parseInt(mo)}月`; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate()-n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
// v22-DD: UUID v4 生成（之前用 Date+Math.random 生成的非标准格式 · PostgreSQL UUID 类型拒收）
const uuid = () => {
  // 现代浏览器优先 crypto.randomUUID（标准 RFC 4122 v4）
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback: 手动实现 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? crypto.getRandomValues(new Uint8Array(1))[0] & 15
      : Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// v22-DM: 检测是否是有效的 UUID v4 格式（防止草稿恢复时旧格式 id 引起 Supabase 报错）
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (id) => typeof id === 'string' && UUID_RE.test(id);
const ensureUuid = (id) => isValidUuid(id) ? id : uuid();

// v22-DT: 附件兼容 · 老数据是 string URL · 新数据是 { id, name, mime, dataUrl } 等对象
// 之前多处 (url||'').toLowerCase() 报错就是因为附件升级了但渲染没改
function attachmentUrl(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.url || item.dataUrl || item.data_url || item.publicUrl || '';
}
function attachmentName(item) {
  if (!item) return '';
  if (typeof item === 'string') return item.split('/').pop() || '';
  return item.name || (item.url && item.url.split('/').pop()) || '附件';
}

// v22-DW: 根据 photo_log 的 applicableShops 自动找该派给哪个美工
// 优先级：role='uploader' > 'primary' > 'backup' · 第 1 个 shop 匹中即返回
// 返回 { userId, userName, matchedRole, matchedShop } 或 null
function findUploaderForShops(shopOwners, applicableShops, system = 'design', log = null, users = null) {
  // v22-EI: 自助上传用户优先 · 张欣怡(zxy)等"全流程自营"员工
  //         如果该记录的摄影师 / 剪辑师是自助用户 · 直接派给他们自己 · 不走 shop_owners
  //         美工想接手用"立即派单"手动覆盖
  if (log && Array.isArray(users)) {
    const photographerId = log.photographer_id || log.photographerId;
    const editorId = log.editor_id || log.editorId;
    // 优先剪辑者（更接近上传环节）· 否则用摄影者
    const selfCandidate =
      (editorId && isSelfServiceUploader(editorId, users)) ? users.find(u => u.id === editorId) :
      (photographerId && isSelfServiceUploader(photographerId, users)) ? users.find(u => u.id === photographerId) :
      null;
    if (selfCandidate) {
      return {
        userId: selfCandidate.id,
        userName: selfCandidate.name,
        matchedRole: 'self_service',
        matchedShop: (applicableShops && applicableShops[0]) || ''
      };
    }
  }
  if (!Array.isArray(applicableShops) || applicableShops.length === 0) return null;
  if (!Array.isArray(shopOwners) || shopOwners.length === 0) return null;
  const fallbackRoles = ['uploader', 'primary', 'backup'];
  for (const shop of applicableShops) {
    const candidates = shopOwners.filter(o => o.shopName === shop && o.system === system);
    for (const role of fallbackRoles) {
      const m = candidates.find(o => o.role === role);
      if (m) return { userId: m.userId, userName: m.userName, matchedRole: role, matchedShop: shop };
    }
  }
  return null;
}

// 24 小时编辑限制
const HOURS_24 = 24 * 60 * 60 * 1000;
function canEditEntry(entry) {
  if (!entry.createdAt) return true; // 老数据放行
  return (Date.now() - entry.createdAt) < HOURS_24;
}

// 判断某月是否已锁定 (上月之前的月份都锁)
function isMonthLocked(month) {
  return month < currentMonth();
}

// 列出最近 N 个月（含本月，由近到远）
function listRecentMonths(n = 12) {
  const arr = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    arr.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return arr;
}

// ====================== STORAGE BACKENDS ======================
const isSupabaseConfigured = () => SUPABASE_URL && SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 20;

const ldb = {
  get(k) { try { const v = localStorage.getItem('wt_'+k); return v ? JSON.parse(v) : null; } catch(e) { return null; } },
  set(k, v) { try { localStorage.setItem('wt_'+k, JSON.stringify(v)); return true; } catch(e) { return false; } },
  list(prefix) { const keys=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.startsWith('wt_'+prefix)) keys.push(k.substring(3)); } return keys; }
};

function createLocalBackend() {
  let onConfigCb, onEntriesCb, onKpiCb, onAiUsageCb, onProductDesignsCb, onDesignerWorkLogsCb, onDesignerMonthlyCb, onComponentLibraryCb, onSalesLogsCb, onPaymentReceiptsCb;
  function loadEntries() {
    const all = [];
    for (const key of ldb.list('entries:')) { const d = ldb.get(key); if (Array.isArray(d)) all.push(...d); }
    return all.filter(e => e.date >= daysAgo(180)).sort((a,b) => (b.date+(b.createdAt||0)).toString().localeCompare((a.date+(a.createdAt||0)).toString()));
  }
  function loadKpi() {
    return ldb.get('monthly_kpi') || [];
  }
  function loadAiUsage() {
    return ldb.get('ai_usage') || [];
  }
  return {
    type: 'local',
    hasStorage: false,
    async init(cbs) {
      onConfigCb = cbs.onConfig; onEntriesCb = cbs.onEntries; onKpiCb = cbs.onKpi;
      onAiUsageCb = cbs.onAiUsage;
      onProductDesignsCb = cbs.onProductDesigns;
      onDesignerWorkLogsCb = cbs.onDesignerWorkLogs;
      onDesignerMonthlyCb = cbs.onDesignerMonthly;
      onComponentLibraryCb = cbs.onComponentLibrary;
      onSalesLogsCb = cbs.onSalesLogs;
      onPaymentReceiptsCb = cbs.onPaymentReceipts;
      let cfg = ldb.get('app:config');
      if (!cfg) {
        cfg = {
          users: await initUsersWithPwds(TEAM_USERS),
          adminPwdHash: await hashPwd('admin123'),
          supervisorPwdHash: await hashPwd('super123')
        };
        ldb.set('app:config', cfg);
      }
      // 自动迁移：旧配置补上 supervisor 密码
      if (!cfg.supervisorPwdHash) {
        cfg.supervisorPwdHash = await hashPwd('super123');
        ldb.set('app:config', cfg);
      }
      // 自动迁移：把 TEAM_USERS 里的最新角色合并 + 给每个非 admin 用户补默认 pwdHash
      if (cfg.users && cfg.users.length) {
        let changed = false;
        const defaultMemberHash = await hashPwd(DEFAULT_MEMBER_PWD);
        for (let i = 0; i < cfg.users.length; i++) {
          const u = cfg.users[i];
          const def = TEAM_USERS.find(x => x.id === u.id);
          // 同步角色
          if (def && u.role !== def.role) {
            cfg.users[i] = { ...cfg.users[i], role: def.role };
            changed = true;
          }
          // 补 pwdHash (admin 用 adminPwdHash 单独存)
          if (cfg.users[i].role !== 'admin' && !cfg.users[i].pwdHash) {
            // 主管优先使用 supervisorPwdHash 迁移
            if (cfg.users[i].role === 'supervisor' && cfg.supervisorPwdHash) {
              cfg.users[i] = { ...cfg.users[i], pwdHash: cfg.supervisorPwdHash };
            } else {
              cfg.users[i] = { ...cfg.users[i], pwdHash: defaultMemberHash };
            }
            changed = true;
          }
        }
        // v22-E: 自动补全 TEAM_USERS 里有但 cfg.users 里没有的用户（如 3 个设计师）
        const existingIds = new Set(cfg.users.map(u => u.id));
        for (const def of TEAM_USERS) {
          if (!existingIds.has(def.id)) {
            const pwdHash = def.role === 'admin' ? null
              : def.role === 'supervisor' ? cfg.supervisorPwdHash
              : defaultMemberHash;
            cfg.users.push({ ...def, pwdHash });
            changed = true;
          }
        }
        if (changed) ldb.set('app:config', cfg);
      }
      // 强制把默认用户合并进来
      if (!cfg.users || cfg.users.length === 0) {
        cfg.users = await initUsersWithPwds(TEAM_USERS);
        ldb.set('app:config', cfg);
      }
      cbs.onConfig(cfg);
      cbs.onEntries(loadEntries());
      cbs.onKpi(loadKpi());
      if (cbs.onAiUsage) cbs.onAiUsage(loadAiUsage());
      if (cbs.onTeamSkills) cbs.onTeamSkills(ldb.get('team_skills') || []);
      if (cbs.onShops) cbs.onShops(ldb.get('shop_profiles') || []);
      if (cbs.onProductDesigns) cbs.onProductDesigns(ldb.get('product_designs') || []);
      if (cbs.onDesignerWorkLogs) cbs.onDesignerWorkLogs(ldb.get('designer_work_logs') || []);
      if (cbs.onDesignerMonthly) cbs.onDesignerMonthly(ldb.get('designer_monthly') || []);
      cbs.onReady();
    },
    async saveConfig(updates) {
      const merged = { ...(ldb.get('app:config')||{}), ...updates };
      ldb.set('app:config', merged);
      if (onConfigCb) onConfigCb(merged);
    },
    // v22-P: Skill 团队共享（本地 backend 时用 localStorage 模拟，但单机情况下 = 用户私有）
    async listTeamSkills() {
      return ldb.get('team_skills') || [];
    },
    async saveTeamSkill(skill) {
      const list = ldb.get('team_skills') || [];
      const idx = list.findIndex(s => s.id === skill.id);
      if (idx >= 0) list[idx] = skill;
      else list.push(skill);
      ldb.set('team_skills', list);
      return list;
    },
    async deleteTeamSkill(skillId) {
      const list = (ldb.get('team_skills') || []).filter(s => s.id !== skillId);
      ldb.set('team_skills', list);
      return list;
    },
    // v22-T: 店铺管理（local）
    async listShops() {
      return ldb.get('shop_profiles') || [];
    },
    async saveShop(shop) {
      const list = ldb.get('shop_profiles') || [];
      const idx = list.findIndex(s => s.id === shop.id);
      if (idx >= 0) list[idx] = shop;
      else list.push(shop);
      ldb.set('shop_profiles', list);
      return list;
    },
    async deleteShop(shopId) {
      const list = (ldb.get('shop_profiles') || []).filter(s => s.id !== shopId);
      ldb.set('shop_profiles', list);
      return list;
    },
    async recordAiUsage(record) {
      const arr = ldb.get('ai_usage') || [];
      arr.unshift({
        userId: record.userId,
        userName: record.userName,
        model: record.model,
        success: record.success !== false,
        errorMsg: record.errorMsg || null,
        promptPreview: (record.prompt || '').slice(0, 100),
        createdAtMs: Date.now()
      });
      const trimmed = arr.slice(0, 2000);
      ldb.set('ai_usage', trimmed);
      if (onAiUsageCb) onAiUsageCb(trimmed);
    },
    // v22-BV: 操作留档（IndexedDB 本地版 — 只看自己的）
    async logOperation(rec) {
      const arr = ldb.get('operation_logs') || [];
      arr.unshift({
        id: uuid(),
        user_id: rec.userId,
        user_name: rec.userName || null,
        module: rec.module,
        action: rec.action,
        title: (rec.title || '').slice(0, 200),
        meta: rec.meta || {},
        ref_id: rec.refId || null,
        created_at_ms: Date.now()
      });
      const trimmed = arr.slice(0, 5000);
      ldb.set('operation_logs', trimmed);
    },
    async loadOperationLogs() {
      return ldb.get('operation_logs') || [];
    },
    async saveProductDesign(design) {
      const arr = ldb.get('product_designs') || [];
      const id = design.id || uuid();
      const now = Date.now();
      const newDesign = {
        id,
        user_id: design.userId,
        user_name: design.userName,
        product_title: design.productTitle || null,
        original_image: design.originalImage || null,
        designed_image: design.designedImage || null,
        sale_price: design.salePrice != null ? Number(design.salePrice) : null,
        design_reason: design.designReason || null,
        changes_made: design.changesMade || null,
        reference_info: design.referenceInfo || null,
        product_url: design.productUrl || null,
        review_status: design.reviewStatus || 'pending',
        reviewed_by: design.reviewedBy || null,
        reviewed_by_name: design.reviewedByName || null,
        review_comment: design.reviewComment || null,
        reviewed_at_ms: design.reviewedAtMs || null,
        // v22-C 新增字段
        product_category: design.productCategory || 'standard',
        differences_count: design.differencesCount != null ? Number(design.differencesCount) : 0,
        differences_notes: design.differencesNotes || null,
        producible: design.producible === true,
        launched: design.launched === true,
        launched_at_ms: design.launchedAtMs || null,
        launched_by: design.launchedBy || null,
        launched_by_name: design.launchedByName || null,
        created_at_ms: design.createdAtMs || now,
        updated_at: new Date().toISOString()
      };
      const idx = arr.findIndex(d => d.id === id);
      if (idx >= 0) arr[idx] = newDesign;
      else arr.unshift(newDesign);
      ldb.set('product_designs', arr);
      if (onProductDesignsCb) onProductDesignsCb(arr);
      return id;
    },
    async deleteProductDesign(id) {
      const arr = ldb.get('product_designs') || [];
      const filtered = arr.filter(d => d.id !== id);
      ldb.set('product_designs', filtered);
      if (onProductDesignsCb) onProductDesignsCb(filtered);
    },
    // ===== 设计师工作日志 =====
    async saveDesignerWorkLog(log) {
      const arr = ldb.get('designer_work_logs') || [];
      const id = ensureUuid(log.id);
      const now = Date.now();
      const newLog = {
        id,
        designer_id: log.designerId,
        designer_name: log.designerName,
        work_date: log.workDate,
        product_title: log.productTitle || null,
        product_url: log.productUrl || null,
        store: log.store || null,
        work_counts: log.workCounts || {},
        calc_points: log.calcPoints || 0,
        approved_points: log.approvedPoints || null,
        images: log.images || [],
        notes: log.notes || null,
        review_status: log.reviewStatus || 'pending',
        reviewed_by: log.reviewedBy || null,
        reviewed_by_name: log.reviewedByName || null,
        review_comment: log.reviewComment || null,
        reviewed_at_ms: log.reviewedAtMs || null,
        created_at_ms: log.createdAtMs || now,
        updated_at: new Date().toISOString()
      };
      const idx = arr.findIndex(x => x.id === id);
      if (idx >= 0) arr[idx] = newLog;
      else arr.unshift(newLog);
      ldb.set('designer_work_logs', arr);
      if (onDesignerWorkLogsCb) onDesignerWorkLogsCb(arr);
      return id;
    },
    async deleteDesignerWorkLog(id) {
      const arr = ldb.get('designer_work_logs') || [];
      const filtered = arr.filter(x => x.id !== id);
      ldb.set('designer_work_logs', filtered);
      if (onDesignerWorkLogsCb) onDesignerWorkLogsCb(filtered);
    },
    // ===== 设计师月度绩效 =====
    async saveDesignerMonthly(record) {
      const arr = ldb.get('designer_monthly') || [];
      const id = ensureUuid(record.id);
      const now = Date.now();
      const newRec = {
        id,
        designer_id: record.designerId,
        designer_name: record.designerName,
        month: record.month,    // YYYY-MM
        cs_training: Number(record.csTraining) || 0,
        cs_kb_entry: Number(record.csKbEntry) || 0,
        review_quality: Number(record.reviewQuality) || 0,
        review_coor: Number(record.reviewCoor) || 0,
        review_resp: Number(record.reviewResp) || 0,
        drawing_points: Number(record.drawingPoints) || 0,
        drawing_score: Number(record.drawingScore) || 0,
        cs_score: Number(record.csScore) || 0,
        review_score: Number(record.reviewScore) || 0,
        total_score: Number(record.totalScore) || 0,
        pay_base: Number(record.payBase) || 0,
        pay_bonus: Number(record.payBonus) || 0,
        pay_total: Number(record.payTotal) || 0,
        locked: !!record.locked,
        locked_by: record.lockedBy || null,
        locked_by_name: record.lockedByName || null,
        locked_at_ms: record.lockedAtMs || null,
        notes: record.notes || null,
        updated_by: record.updatedBy || null,
        updated_by_name: record.updatedByName || null,
        updated_at: new Date().toISOString(),
        created_at_ms: record.createdAtMs || now
      };
      const idx = arr.findIndex(x => x.designer_id === newRec.designer_id && x.month === newRec.month);
      if (idx >= 0) { newRec.id = arr[idx].id; arr[idx] = newRec; }
      else arr.unshift(newRec);
      ldb.set('designer_monthly', arr);
      if (onDesignerMonthlyCb) onDesignerMonthlyCb(arr);
      return id;
    },
    async saveEntry(entry) {
      const id = entry.id || uuid();
      const data = { ...entry, id };
      if (!data.createdAt) data.createdAt = Date.now();
      data.kpiPoints = calcEntryPoints(data);
      const mk = `entries:${monthKey(entry.date)}`;
      let m = ldb.get(mk) || [];
      const idx = m.findIndex(e => e.id === id);
      if (idx >= 0) m[idx] = data; else m.push(data);
      ldb.set(mk, m);
      if (onEntriesCb) onEntriesCb(loadEntries());
      return id;
    },
    async deleteEntry(id) {
      for (const key of ldb.list('entries:')) {
        const d = ldb.get(key);
        if (Array.isArray(d)) {
          const filtered = d.filter(e => e.id !== id);
          if (filtered.length !== d.length) { ldb.set(key, filtered); break; }
        }
      }
      if (onEntriesCb) onEntriesCb(loadEntries());
    },
    async saveMonthlyKpi(record) {
      const list = loadKpi();
      const idx = list.findIndex(x => x.userId === record.userId && x.month === record.month);
      const data = { ...record, updatedAt: Date.now() };
      if (idx >= 0) list[idx] = data; else list.push(data);
      ldb.set('monthly_kpi', list);
      if (onKpiCb) onKpiCb(list);
    },
    async uploadFile(file) { throw new Error('本地模式不支持上传图片，请配置 Supabase 后使用'); },
    // v22-AZ: 本地模式配件库（IndexedDB）
    async saveComponent(item) {
      // 本地降级：用 IndexedDB（保留旧实现）
      return await saveComponent({
        partType: item.partType, label: item.label,
        imageBase64: item.imageBase64, mimeType: item.mimeType,
        note: item.note, userId: item.userId, userName: item.userName
      });
    },
    async deleteComponent(id) {
      return await deleteComponent(id);
    },
    // v22-BK: 销售模块（本地模式不支持，仅警告）
    async saveSalesLog() { throw new Error('销售日报需要配置 Supabase 才能使用'); },
    async deleteSalesLog() { throw new Error('销售日报需要配置 Supabase'); },
    async savePaymentReceipt() { throw new Error('付款回单需要配置 Supabase'); },
    async deletePaymentReceipt() { throw new Error('付款回单需要配置 Supabase'); },
    async saveWeeklyMeeting() { throw new Error('周会发布需要配置 Supabase 才能使用'); },
    async deleteWeeklyMeeting() { throw new Error('周会发布需要配置 Supabase'); },
    // v22-CR: 跨部门协作消息
    async saveCrossDeptMessage() { throw new Error('跨部门消息需要配置 Supabase 才能使用'); },
    async deleteCrossDeptMessage() { throw new Error('跨部门消息需要配置 Supabase'); },
    async appendCrossDeptThread() { throw new Error('跨部门消息需要配置 Supabase'); },
    async markCrossDeptRead() { throw new Error('跨部门消息需要配置 Supabase'); },
    cleanup() {}
  };
}

function createSupabaseBackend() {
  let client, channel;
  let cbs_ = null;
  return {
    type: 'supabase',
    hasStorage: true,
    async init(cbs) {
      cbs_ = cbs;
      try {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // v22-EB: 启动检查 · 历史 bug 可能在 app_config 表里留下重复 key='main' 的行 ·
        //         会导致改密码后另一台浏览器读到旧行的 hash → 登录失败
        //         逻辑：把所有 key='main' 行按更新时间排序 · 保留最新的 · 删掉其他
        try {
          const { data: allMains } = await client.from('app_config').select('*').eq('key', 'main');
          if (allMains && allMains.length > 1) {
            console.warn(`[v22-EB] 发现 ${allMains.length} 行 key='main' 重复 · 自动清理 · 保留最新`);
            // 按 updated_at 或 created_at 倒序 · 保留第一条 · 删除剩余
            const sorted = allMains.slice().sort((a, b) => {
              const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
              const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
              return tb - ta;
            });
            const keep = sorted[0];
            for (let i = 1; i < sorted.length; i++) {
              const row = sorted[i];
              try {
                if (row.id) {
                  await client.from('app_config').delete().eq('id', row.id);
                  console.warn('[v22-EB] 已删除重复行 id=', row.id);
                }
              } catch (e) { console.warn('[v22-EB] 删重复行失败:', e); }
            }
          }
        } catch (e) {
          console.warn('[v22-EB] 重复行清理失败 · 继续启动:', e);
        }

        // 1. 加载 config (users + admin pwd + supervisor pwd)
        let { data: cfgRow, error: cfgErr } = await client.from('app_config').select('*').eq('key', 'main').maybeSingle();
        if (cfgErr) throw cfgErr;
        if (!cfgRow) {
          const def = {
            users: await initUsersWithPwds(TEAM_USERS),
            adminPwdHash: await hashPwd('admin123'),
            supervisorPwdHash: await hashPwd('super123')
          };
          await client.from('app_config').insert({ key: 'main', value: def });
          cfgRow = { key: 'main', value: def };
        } else {
          // 迁移：补 supervisor 密码 + 同步角色 + 给每个非 admin 补 pwdHash
          let val = cfgRow.value || {};
          let changed = false;
          if (!val.supervisorPwdHash) {
            val.supervisorPwdHash = await hashPwd('super123');
            changed = true;
          }
          const defaultMemberHash = await hashPwd(DEFAULT_MEMBER_PWD);
          if (val.users && val.users.length) {
            for (let i = 0; i < val.users.length; i++) {
              const u = val.users[i];
              const def = TEAM_USERS.find(x => x.id === u.id);
              // v22-DC: 同步 role + tier + title（修复历史用户缺 tier 字段导致显示错误的问题）
              if (def) {
                let needsUpdate = false;
                const updates = {};
                if (u.role !== def.role) { updates.role = def.role; needsUpdate = true; }
                if (u.tier !== def.tier) { updates.tier = def.tier; needsUpdate = true; }
                if (def.title && u.title !== def.title) { updates.title = def.title; needsUpdate = true; }
                if (needsUpdate) {
                  val.users[i] = { ...val.users[i], ...updates };
                  changed = true;
                }
              }
              // 补 pwdHash
              if (val.users[i].role !== 'admin' && !val.users[i].pwdHash) {
                if (val.users[i].role === 'supervisor' && val.supervisorPwdHash) {
                  val.users[i] = { ...val.users[i], pwdHash: val.supervisorPwdHash };
                } else {
                  val.users[i] = { ...val.users[i], pwdHash: defaultMemberHash };
                }
                changed = true;
              }
            }
            // v22-E: 自动补全 TEAM_USERS 里有但 val.users 里没有的用户
            // v22-DD: supervisor 直接用 super123 默认 hash · 不再用共享 supervisorPwdHash
            //         （避免新主管的密码被其他主管之前修改过的密码污染）
            const existingIds = new Set(val.users.map(u => u.id));
            const defaultSupHash = await hashPwd('super123');
            for (const def of TEAM_USERS) {
              if (!existingIds.has(def.id)) {
                const pwdHash = def.role === 'admin' ? null
                  : def.role === 'supervisor' ? defaultSupHash  // v22-DD: 用默认 super123
                  : defaultMemberHash;
                val.users.push({ ...def, pwdHash });
                changed = true;
              }
            }

            // v22-DD: 摄影部账号一次性密码修复
            // 由于历史 bug · photo_team 主管（黎俊杰）pwdHash 可能被错设为其他主管的共享 hash
            // 通过 flag 确保只跑一次 · 之后用户改密码不会被覆盖
            if (!val.photoTeamPwdFixed) {
              const photoTeamIds = new Set(TEAM_USERS.filter(u => u.tier === 'photo_team').map(u => u.id));
              for (let i = 0; i < val.users.length; i++) {
                const u = val.users[i];
                if (photoTeamIds.has(u.id)) {
                  const targetHash = u.role === 'supervisor' ? defaultSupHash : defaultMemberHash;
                  if (u.pwdHash !== targetHash) {
                    val.users[i] = { ...val.users[i], pwdHash: targetHash };
                    console.log(`[v22-DD] 已修复 ${u.name} (${u.id}) 的密码为默认`);
                    changed = true;
                  }
                }
              }
              val.photoTeamPwdFixed = true;
              changed = true;
            }

            // v22-DD2: 销售部账号一次性密码修复（同摄影部）
            // 历史 bug 同样影响 alibaba_sales tier 的成员（lbj 主管曾改密码污染了 supervisorPwdHash · 何健斌等被错误初始化）
            if (!val.salesTeamPwdFixed) {
              const salesIds = new Set(TEAM_USERS.filter(u => u.tier === 'alibaba_sales').map(u => u.id));
              for (let i = 0; i < val.users.length; i++) {
                const u = val.users[i];
                if (salesIds.has(u.id)) {
                  const targetHash = u.role === 'supervisor' ? defaultSupHash : defaultMemberHash;
                  if (u.pwdHash !== targetHash) {
                    val.users[i] = { ...val.users[i], pwdHash: targetHash };
                    console.log(`[v22-DD2] 已修复 ${u.name} (${u.id}) 的密码为默认`);
                    changed = true;
                  }
                }
              }
              val.salesTeamPwdFixed = true;
              changed = true;
            }

            // v22-DF: 一次性权限迁移 · 给已有用户的 customPermissions 补上新模块（price-calc / ad-video-tasks）
            // 历史 bug: 当 admin 在团队管理里手动勾选过权限后 · 后续新增的功能不会自动出现
            // 修复策略: 一次性给 supervisor / sales 角色补上 price-calc · 给 photo_team tier 补上 ad-video-tasks
            if (!val.v22DfPermsMigrated) {
              for (let i = 0; i < val.users.length; i++) {
                const u = val.users[i];
                if (!Array.isArray(u.customPermissions) || u.customPermissions.length === 0) continue;
                let cp = u.customPermissions.slice();
                let updated = false;
                // 销售部 + 主管 + designer 加阿里计算器
                if ((u.role === 'sales' || u.role === 'supervisor' || u.role === 'designer') && !cp.includes('price-calc')) {
                  cp.push('price-calc');
                  updated = true;
                }
                // 摄影部 + 主管 + admin（admin 不进 customPermissions）加广告视频工单
                if ((u.tier === 'photo_team' || u.role === 'supervisor') && !cp.includes('ad-video-tasks')) {
                  cp.push('ad-video-tasks');
                  updated = true;
                }
                if (updated) {
                  val.users[i] = { ...u, customPermissions: cp };
                  console.log(`[v22-DF] 已为 ${u.name} (${u.id}) 添加新权限: ${cp.filter(x => !u.customPermissions.includes(x)).join(', ')}`);
                  changed = true;
                }
              }
              val.v22DfPermsMigrated = true;
              changed = true;
            }
          }
          if (changed) {
            await client.from('app_config').upsert({ key: 'main', value: val }, { onConflict: 'key' });
            cfgRow.value = val;
          }
        }
        cbs.onConfig(cfgRow.value);

        // 2. 加载最近 180 天的 entries
        const { data: entries, error: entErr } = await client.from('entries')
          .select('*').gte('date', daysAgo(180)).order('date', { ascending: false });
        if (entErr) throw entErr;
        cbs.onEntries((entries || []).map(rowToEntry));

        // 3. 加载 monthly_kpi
        const { data: kpis, error: kpiErr } = await client.from('monthly_kpi').select('*');
        if (kpiErr) throw kpiErr;
        cbs.onKpi((kpis || []).map(rowToKpi));

        // 3b. 加载最近 90 天 ai_usage（如果表不存在不报错）
        try {
          const since = Date.now() - 90 * 24 * 3600 * 1000;
          const { data: usage } = await client.from('ai_usage')
            .select('*').gte('created_at_ms', since)
            .order('created_at_ms', { ascending: false });
          if (cbs.onAiUsage) cbs.onAiUsage(usage || []);
        } catch (e) {
          console.warn('ai_usage 表不存在或暂未配置，跳过加载（请在 Supabase 执行 SQL 建表）');
        }

        // 3c. 加载产品设计文档（最近 180 天）
        try {
          const since180 = Date.now() - 180 * 24 * 3600 * 1000;
          const { data: designs } = await client.from('product_designs')
            .select('*').gte('created_at_ms', since180)
            .order('created_at_ms', { ascending: false });
          if (cbs.onProductDesigns) cbs.onProductDesigns(designs || []);
        } catch (e) {
          console.warn('product_designs 表不存在，跳过加载（请在 Supabase 执行新版 SQL）');
        }

        // 3d. 加载设计师工作日志（最近 365 天）
        try {
          const since365 = Date.now() - 365 * 24 * 3600 * 1000;
          const { data: logs } = await client.from('designer_work_logs')
            .select('*').gte('created_at_ms', since365)
            .order('work_date', { ascending: false });
          if (cbs.onDesignerWorkLogs) cbs.onDesignerWorkLogs(logs || []);
        } catch (e) {
          console.warn('designer_work_logs 表不存在，跳过加载（请在 Supabase 执行新版 SQL）');
        }
        // 3e. 加载设计师月度绩效
        try {
          const { data: monthly } = await client.from('designer_monthly').select('*').order('month', { ascending: false });
          if (cbs.onDesignerMonthly) cbs.onDesignerMonthly(monthly || []);
        } catch (e) {
          console.warn('designer_monthly 表不存在，跳过加载');
        }

        // v22-AZ · 3f. 加载云端配件库（全部 · 不限时间）
        try {
          const { data: components } = await client.from('component_library')
            .select('*').order('created_at_ms', { ascending: false });
          if (cbs.onComponentLibrary) cbs.onComponentLibrary(components || []);
        } catch (e) {
          console.warn('component_library 表不存在，跳过加载（请在 Supabase 执行新版 SQL 建表）');
        }

        // v22-BK · 3g. 加载销售日报（最近 6 月 · 限 2000 条）
        try {
          const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
          const { data: salesLogs } = await client.from('sales_logs')
            .select('*').gte('created_at_ms', sixMonthsAgo).order('created_at_ms', { ascending: false }).limit(2000);
          if (cbs.onSalesLogs) cbs.onSalesLogs(salesLogs || []);
        } catch (e) {
          console.warn('sales_logs 表不存在，跳过（请在 Supabase 执行 v22-BK SQL 建表）');
        }

        // v22-BK · 3h. 加载付款回单（最近 6 月 · 限 2000 条）
        try {
          const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
          const { data: receipts } = await client.from('payment_receipts')
            .select('*').gte('created_at_ms', sixMonthsAgo).order('created_at_ms', { ascending: false }).limit(2000);
          if (cbs.onPaymentReceipts) cbs.onPaymentReceipts(receipts || []);
        } catch (e) {
          console.warn('payment_receipts 表不存在，跳过（请在 Supabase 执行 v22-BK SQL 建表）');
        }

        // v22-CB · 3i. 加载周会纪要（最近 12 周 · 限 200 条）
        try {
          const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
          const { data: meetings } = await client.from('weekly_meetings')
            .select('*').gte('published_at_ms', ninetyDaysAgo).order('published_at_ms', { ascending: false }).limit(200);
          if (cbs.onWeeklyMeetings) cbs.onWeeklyMeetings(meetings || []);
        } catch (e) {
          console.warn('weekly_meetings 表不存在，跳过（请在 Supabase 执行 v22-CB SQL 建表）');
        }

        // v22-CR · 3j. 加载跨部门协作消息（最近 90 天 · 限 500 条）
        try {
          const ninetyDaysAgo2 = Date.now() - 90 * 24 * 60 * 60 * 1000;
          const { data: cdms } = await client.from('cross_dept_messages')
            .select('*').gte('created_at_ms', ninetyDaysAgo2).order('created_at_ms', { ascending: false }).limit(500);
          if (cbs.onCrossDeptMessages) cbs.onCrossDeptMessages(cdms || []);
        } catch (e) {
          console.warn('cross_dept_messages 表不存在，跳过（请在 Supabase 执行 v22-CR SQL 建表）');
        }

        // v22-CV · 3k. 加载店铺-负责人映射（工单系统升级）
        try {
          const { data: sos } = await client.from('shop_owners').select('*').order('shop_name');
          const list = (sos || []).map(r => ({
            id: r.id, shopName: r.shop_name, system: r.system,
            userId: r.user_id, userName: r.user_name, role: r.role || 'primary',
            notes: r.notes || null, createdAtMs: r.created_at_ms, updatedAt: r.updated_at
          }));
          if (cbs.onShopOwners) cbs.onShopOwners(list);
        } catch (e) {
          console.warn('shop_owners 表不存在，跳过（请在 Supabase 执行 v22-CV SQL 建表）');
        }

        // v22-CW · 3l. 加载工单超时阈值配置
        try {
          const { data: cfg } = await client.from('app_config').select('value').eq('key', 'cdm_timeout_config').maybeSingle();
          if (cbs.onCdmTimeoutConfig) cbs.onCdmTimeoutConfig(cfg?.value || {});
        } catch (e) {
          console.warn('cdm_timeout_config 加载失败', e.message);
        }

        // v22-CZ · 3m. 加载摄影部 photo_logs
        try {
          const { data: photos } = await client.from('photo_logs').select('*').order('created_at_ms', { ascending: false }).limit(1000);
          const list = (photos || []).map(r => ({
            id: r.id,
            productName: r.product_name,
            sku: r.sku,
            productImage: r.product_image,
            photographerId: r.photographer_id, photographerName: r.photographer_name,
            shootDate: r.shoot_date,
            editorId: r.editor_id, editorName: r.editor_name,
            editDate: r.edit_date,
            screenshot: r.screenshot,
            videoType: r.video_type || '展示视频',
            uploaderId: r.uploader_id, uploaderName: r.uploader_name,
            uploadDate: r.upload_date,
            uploadSite: r.upload_site, applicableShops: r.applicable_shops || [],
            urlHorizontal: r.url_horizontal, urlVertical: r.url_vertical, urlSquare: r.url_square, urlInstagram: r.url_instagram, urlTiktok: r.url_tiktok, urlFacebook: r.url_facebook, urlPinterest: r.url_pinterest, urlXiaohongshu: r.url_xiaohongshu, review: r.review, pendingReason: r.pending_reason, extraPlatforms: r.extra_platforms || [], embedStatus: r.embed_status || "pending", embedUrl: r.embed_url, embedScreenshots: r.embed_screenshots || [], dropboxUploadDate: r.dropbox_upload_date, dropboxUrl: r.dropbox_url, reshootRecords: r.reshoot_records || [], shootConfirmed: !!r.shoot_confirmed,
            status: r.status || 'draft',
            priority: r.priority || 'normal',
            notes: r.notes,
            relatedCdmId: r.related_cdm_id, relatedShop: r.related_shop,
            createdById: r.created_by_id, createdByName: r.created_by_name,
            createdAtMs: r.created_at_ms, updatedAt: r.updated_at
          }));
          if (cbs.onPhotoLogs) cbs.onPhotoLogs(list);
        } catch (e) {
          console.warn('photo_logs 表不存在，跳过（请在 Supabase 执行 v22-CZ SQL 建表）');
        }

        // v22-DF: 初始加载 ad_video_tasks 广告视频需求工单
        try {
          const { data: adRows } = await client.from('ad_video_tasks').select('*').order('created_at_ms', { ascending: false });
          const adList = (adRows || []).map(r => ({
            id: r.id, productName: r.product_name, sourceUrl: r.source_url,
            targetFormats: r.target_formats || [], priority: r.priority,
            assignedToId: r.assigned_to_id, assignedToName: r.assigned_to_name,
            shops: r.shops || [], deadline: r.deadline, status: r.status,
            notes: r.notes, completionNote: r.completion_note,
            createdById: r.created_by_id, createdByName: r.created_by_name,
            createdAtMs: r.created_at_ms, assignedAtMs: r.assigned_at_ms,
            completedAtMs: r.completed_at_ms, updatedAt: r.updated_at
          }));
          if (cbs.onAdVideoTasks) cbs.onAdVideoTasks(adList);
        } catch (e) {
          console.warn('ad_video_tasks 表不存在，跳过（请在 Supabase 执行 v22-DF SQL 建表）');
        }

        // v22-DK: 初始加载 user_feedback
        try {
          const { data: fbRows } = await client.from('user_feedback').select('*').order('created_at_ms', { ascending: false });
          const fbList = (fbRows || []).map(r => ({
            id: r.id, userId: r.user_id, userName: r.user_name,
            type: r.type, title: r.title, description: r.description,
            module: r.module, priority: r.priority, status: r.status,
            attachments: r.attachments || [],
            adminReply: r.admin_reply, adminAction: r.admin_action,
            resolvedInVersion: r.resolved_in_version, aiAnalysis: r.ai_analysis,
            createdAtMs: r.created_at_ms, updatedAt: r.updated_at
          }));
          if (cbs.onUserFeedbacks) cbs.onUserFeedbacks(fbList);
        } catch (e) {
          console.warn('user_feedback 表不存在，跳过（请在 Supabase 执行 v22-DK SQL 建表）');
        }

        // 4. 实时订阅
        channel = client.channel('worktrack')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, async () => {
            const { data } = await client.from('entries').select('*').gte('date', daysAgo(180)).order('date', { ascending: false });
            cbs.onEntries((data || []).map(rowToEntry));
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_kpi' }, async () => {
            const { data } = await client.from('monthly_kpi').select('*');
            cbs.onKpi((data || []).map(rowToKpi));
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, async () => {
            const { data } = await client.from('app_config').select('*').eq('key', 'main').maybeSingle();
            if (data) cbs.onConfig(data.value);
            // v22-P: team_skills 也同步刷新
            if (cbs.onTeamSkills) {
              try {
                const { data: tsRow } = await client.from('app_config').select('*').eq('key', 'team_skills').maybeSingle();
                cbs.onTeamSkills(tsRow?.value?.skills || []);
              } catch (e) {}
            }
            // v22-T: shop_profiles 也同步
            if (cbs.onShops) {
              try {
                const { data: shopRow } = await client.from('app_config').select('*').eq('key', 'shop_profiles').maybeSingle();
                cbs.onShops(shopRow?.value?.shops || []);
              } catch (e) {}
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_usage' }, async () => {
            try {
              const since = Date.now() - 90 * 24 * 3600 * 1000;
              const { data } = await client.from('ai_usage').select('*').gte('created_at_ms', since).order('created_at_ms', { ascending: false });
              if (cbs.onAiUsage) cbs.onAiUsage(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'product_designs' }, async () => {
            try {
              const s = Date.now() - 180 * 24 * 3600 * 1000;
              const { data } = await client.from('product_designs').select('*').gte('created_at_ms', s).order('created_at_ms', { ascending: false });
              if (cbs.onProductDesigns) cbs.onProductDesigns(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'designer_work_logs' }, async () => {
            try {
              const s = Date.now() - 365 * 24 * 3600 * 1000;
              const { data } = await client.from('designer_work_logs').select('*').gte('created_at_ms', s).order('work_date', { ascending: false });
              if (cbs.onDesignerWorkLogs) cbs.onDesignerWorkLogs(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'designer_monthly' }, async () => {
            try {
              const { data } = await client.from('designer_monthly').select('*').order('month', { ascending: false });
              if (cbs.onDesignerMonthly) cbs.onDesignerMonthly(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'component_library' }, async () => {
            try {
              const { data } = await client.from('component_library').select('*').order('created_at_ms', { ascending: false });
              if (cbs.onComponentLibrary) cbs.onComponentLibrary(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_logs' }, async () => {
            try {
              const { data } = await client.from('sales_logs').select('*').order('created_at_ms', { ascending: false }).limit(2000);
              if (cbs.onSalesLogs) cbs.onSalesLogs(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_receipts' }, async () => {
            try {
              const { data } = await client.from('payment_receipts').select('*').order('created_at_ms', { ascending: false }).limit(2000);
              if (cbs.onPaymentReceipts) cbs.onPaymentReceipts(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_meetings' }, async () => {
            try {
              const { data } = await client.from('weekly_meetings').select('*').order('published_at_ms', { ascending: false }).limit(200);
              if (cbs.onWeeklyMeetings) cbs.onWeeklyMeetings(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cross_dept_messages' }, async () => {
            // v22-CR: 跨部门消息实时同步
            try {
              const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
              const { data } = await client.from('cross_dept_messages').select('*').gte('created_at_ms', ninetyDaysAgo).order('created_at_ms', { ascending: false }).limit(500);
              if (cbs.onCrossDeptMessages) cbs.onCrossDeptMessages(data || []);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_owners' }, async () => {
            // v22-CV: 店铺-负责人实时同步（三方系统共享）
            try {
              const { data } = await client.from('shop_owners').select('*').order('shop_name');
              const list = (data || []).map(r => ({
                id: r.id, shopName: r.shop_name, system: r.system,
                userId: r.user_id, userName: r.user_name, role: r.role || 'primary',
                notes: r.notes || null, createdAtMs: r.created_at_ms, updatedAt: r.updated_at
              }));
              if (cbs.onShopOwners) cbs.onShopOwners(list);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_logs' }, async () => {
            // v22-CZ: 摄影部工作日志实时同步
            try {
              const { data: photos } = await client.from('photo_logs').select('*').order('created_at_ms', { ascending: false }).limit(1000);
              const list = (photos || []).map(r => ({
                id: r.id, productName: r.product_name, sku: r.sku, productImage: r.product_image,
                photographerId: r.photographer_id, photographerName: r.photographer_name, shootDate: r.shoot_date,
                editorId: r.editor_id, editorName: r.editor_name, editDate: r.edit_date,
                screenshot: r.screenshot, videoType: r.video_type || '展示视频',
                uploaderId: r.uploader_id, uploaderName: r.uploader_name, uploadDate: r.upload_date,
                uploadSite: r.upload_site, applicableShops: r.applicable_shops || [],
                urlHorizontal: r.url_horizontal, urlVertical: r.url_vertical, urlSquare: r.url_square, urlInstagram: r.url_instagram, urlTiktok: r.url_tiktok, urlFacebook: r.url_facebook, urlPinterest: r.url_pinterest, urlXiaohongshu: r.url_xiaohongshu, review: r.review, pendingReason: r.pending_reason, extraPlatforms: r.extra_platforms || [], embedStatus: r.embed_status || "pending", embedUrl: r.embed_url, embedScreenshots: r.embed_screenshots || [], dropboxUploadDate: r.dropbox_upload_date, dropboxUrl: r.dropbox_url, reshootRecords: r.reshoot_records || [], shootConfirmed: !!r.shoot_confirmed,
                status: r.status || 'draft', priority: r.priority || 'normal',
                notes: r.notes, relatedCdmId: r.related_cdm_id, relatedShop: r.related_shop,
                createdById: r.created_by_id, createdByName: r.created_by_name,
                createdAtMs: r.created_at_ms, updatedAt: r.updated_at
              }));
              if (cbs.onPhotoLogs) cbs.onPhotoLogs(list);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_video_tasks' }, async () => {
            // v22-DF: 广告视频工单 realtime
            try {
              const { data: adRows } = await client.from('ad_video_tasks').select('*').order('created_at_ms', { ascending: false });
              const list = (adRows || []).map(r => ({
                id: r.id, productName: r.product_name, sourceUrl: r.source_url,
                targetFormats: r.target_formats || [], priority: r.priority,
                assignedToId: r.assigned_to_id, assignedToName: r.assigned_to_name,
                shops: r.shops || [], deadline: r.deadline, status: r.status,
                notes: r.notes, completionNote: r.completion_note,
                createdById: r.created_by_id, createdByName: r.created_by_name,
                createdAtMs: r.created_at_ms, assignedAtMs: r.assigned_at_ms,
                completedAtMs: r.completed_at_ms, updatedAt: r.updated_at
              }));
              if (cbs.onAdVideoTasks) cbs.onAdVideoTasks(list);
            } catch (e) {}
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'user_feedback' }, async () => {
            // v22-DK: 用户反馈 realtime
            try {
              const { data: fbRows } = await client.from('user_feedback').select('*').order('created_at_ms', { ascending: false });
              const list = (fbRows || []).map(r => ({
                id: r.id, userId: r.user_id, userName: r.user_name,
                type: r.type, title: r.title, description: r.description,
                module: r.module, priority: r.priority, status: r.status,
                attachments: r.attachments || [],
                adminReply: r.admin_reply, adminAction: r.admin_action,
                resolvedInVersion: r.resolved_in_version, aiAnalysis: r.ai_analysis,
                createdAtMs: r.created_at_ms, updatedAt: r.updated_at
              }));
              if (cbs.onUserFeedbacks) cbs.onUserFeedbacks(list);
            } catch (e) {}
          })
          .subscribe();

        // v22-Q: 初始加载团队共享 Skill
        if (cbs.onTeamSkills) {
          try {
            const { data: tsRow } = await client.from('app_config').select('*').eq('key', 'team_skills').maybeSingle();
            cbs.onTeamSkills(tsRow?.value?.skills || []);
          } catch (e) {
            console.warn('Initial team skills load failed:', e.message);
          }
        }

        // v22-T: 初始加载店铺
        if (cbs.onShops) {
          try {
            const { data: shopRow } = await client.from('app_config').select('*').eq('key', 'shop_profiles').maybeSingle();
            cbs.onShops(shopRow?.value?.shops || []);
          } catch (e) {
            console.warn('Initial shops load failed:', e.message);
          }
        }

        cbs.onReady();
      } catch (e) {
        console.error('Supabase init error:', e);
        cbs.onError && cbs.onError(e);
      }
    },
    async saveConfig(updates) {
      // v22-EB: 加 onConflict:'key' · 之前不写 onConflict 时 upsert 用主键判定（如果主键是 id 而不是 key 就会创建新行）
      // 必须显式指定 onConflict:'key' 强制按 key 字段判重 · 修旧版本的重复行 bug
      const { data } = await client.from('app_config').select('*').eq('key', 'main').maybeSingle();
      const merged = { ...(data?.value || {}), ...updates };
      const { error } = await client.from('app_config').upsert({ key: 'main', value: merged }, { onConflict: 'key' });
      if (error) throw error;
      // 主动刷新
      if (cbs_ && cbs_.onConfig) cbs_.onConfig(merged);
    },
    // v22-EB: 原子改某个用户的某个字段（特别是 pwdHash）· 避免整个 users 数组覆盖 DB 引起密码错乱
    // 流程：拉最新 DB → 改单个 user 的单个字段 → 写回 · 不动其他用户
    async saveUserField(userId, field, value) {
      const { data } = await client.from('app_config').select('*').eq('key', 'main').maybeSingle();
      const cfg = data?.value || {};
      const users = (cfg.users || []).map(u =>
        u.id === userId ? { ...u, [field]: value } : u
      );
      const merged = { ...cfg, users };
      const { error } = await client.from('app_config').upsert({ key: 'main', value: merged }, { onConflict: 'key' });
      if (error) throw error;
      if (cbs_ && cbs_.onConfig) cbs_.onConfig(merged);
      return users;
    },
    // v22-EB: 改密码专用 · 调用 saveUserField('pwdHash', newHash)
    async saveUserPassword(userId, newPwdHash) {
      return await this.saveUserField(userId, 'pwdHash', newPwdHash);
    },
    // v22-EB: 验证某用户当前密码（拉最新 DB · 不用 React 缓存）· 登录前一刀切防过时数据
    async verifyUserPassword(userId, inputHash) {
      const { data } = await client.from('app_config').select('*').eq('key', 'main').maybeSingle();
      const cfg = data?.value || {};
      const u = (cfg.users || []).find(x => x.id === userId);
      if (!u || !u.pwdHash) return { ok: false, reason: 'no_user_or_no_pwd' };
      return { ok: u.pwdHash === inputHash, dbHash: u.pwdHash, dbUsers: cfg.users };
    },
    // v22-P: Skill 团队共享（存 app_config key='team_skills'）
    async listTeamSkills() {
      try {
        const { data } = await client.from('app_config').select('*').eq('key', 'team_skills').maybeSingle();
        return data?.value?.skills || [];
      } catch (e) {
        console.warn('listTeamSkills failed:', e.message);
        return [];
      }
    },
    async saveTeamSkill(skill) {
      const { data } = await client.from('app_config').select('*').eq('key', 'team_skills').maybeSingle();
      const list = data?.value?.skills || [];
      const idx = list.findIndex(s => s.id === skill.id);
      if (idx >= 0) list[idx] = skill;
      else list.push(skill);
      const { error } = await client.from('app_config').upsert({ key: 'team_skills', value: { skills: list, updatedAt: Date.now() } }, { onConflict: 'key' });
      if (error) throw error;
      return list;
    },
    async deleteTeamSkill(skillId) {
      const { data } = await client.from('app_config').select('*').eq('key', 'team_skills').maybeSingle();
      const list = (data?.value?.skills || []).filter(s => s.id !== skillId);
      const { error } = await client.from('app_config').upsert({ key: 'team_skills', value: { skills: list, updatedAt: Date.now() } }, { onConflict: 'key' });
      if (error) throw error;
      return list;
    },
    // v22-T: 店铺管理（Supabase · 全员实时同步）
    async listShops() {
      try {
        const { data } = await client.from('app_config').select('*').eq('key', 'shop_profiles').maybeSingle();
        return data?.value?.shops || [];
      } catch (e) {
        console.warn('listShops failed:', e.message);
        return [];
      }
    },
    async saveShop(shop) {
      const { data } = await client.from('app_config').select('*').eq('key', 'shop_profiles').maybeSingle();
      const list = data?.value?.shops || [];
      const idx = list.findIndex(s => s.id === shop.id);
      if (idx >= 0) list[idx] = shop;
      else list.push(shop);
      const { error } = await client.from('app_config').upsert({ key: 'shop_profiles', value: { shops: list, updatedAt: Date.now() } }, { onConflict: 'key' });
      if (error) throw error;
      return list;
    },
    async deleteShop(shopId) {
      const { data } = await client.from('app_config').select('*').eq('key', 'shop_profiles').maybeSingle();
      const list = (data?.value?.shops || []).filter(s => s.id !== shopId);
      const { error } = await client.from('app_config').upsert({ key: 'shop_profiles', value: { shops: list, updatedAt: Date.now() } }, { onConflict: 'key' });
      if (error) throw error;
      return list;
    },
    async recordAiUsage(record) {
      try {
        const { error } = await client.from('ai_usage').insert({
          user_id: record.userId,
          user_name: record.userName,
          model: record.model,
          success: record.success !== false,
          error_msg: record.errorMsg || null,
          prompt_preview: (record.prompt || '').slice(0, 100),
          created_at_ms: Date.now()
        });
        if (error) throw error;
      } catch (e) {
        console.warn('记录 AI 用量失败（可能 ai_usage 表未建）:', e.message);
      }
    },
    // v22-BV: 操作留档 — 写入业务操作日志（非 AI 调用）
    async logOperation(rec) {
      try {
        const { error } = await client.from('operation_logs').insert({
          user_id: rec.userId,
          user_name: rec.userName || null,
          module: rec.module,
          action: rec.action,
          title: (rec.title || '').slice(0, 200),
          meta: rec.meta || {},
          ref_id: rec.refId || null,
          created_at_ms: Date.now()
        });
        if (error) throw error;
      } catch (e) {
        console.warn('记录操作日志失败（可能 operation_logs 表未建）:', e.message);
      }
    },
    // v22-BV: 加载操作日志（最近 90 天，最多 5000 条）
    async loadOperationLogs() {
      try {
        const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const { data, error } = await client.from('operation_logs')
          .select('*')
          .gte('created_at_ms', since)
          .order('created_at_ms', { ascending: false })
          .limit(5000);
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.warn('加载操作日志失败:', e.message);
        return [];
      }
    },
    async saveProductDesign(design) {
      const id = design.id || uuid();
      const now = Date.now();
      const row = {
        id,
        user_id: design.userId,
        user_name: design.userName,
        product_title: design.productTitle || null,
        original_image: design.originalImage || null,    // base64 或 URL
        designed_image: design.designedImage || null,    // base64 或 URL
        sale_price: design.salePrice != null ? Number(design.salePrice) : null,
        design_reason: design.designReason || null,
        changes_made: design.changesMade || null,
        reference_info: design.referenceInfo || null,
        product_url: design.productUrl || null,
        review_status: design.reviewStatus || 'pending',
        reviewed_by: design.reviewedBy || null,
        reviewed_by_name: design.reviewedByName || null,
        review_comment: design.reviewComment || null,
        reviewed_at_ms: design.reviewedAtMs || null,
        // v22-C 新增字段
        product_category: design.productCategory || 'standard',
        differences_count: design.differencesCount != null ? Number(design.differencesCount) : 0,
        differences_notes: design.differencesNotes || null,
        producible: design.producible === true,
        launched: design.launched === true,
        launched_at_ms: design.launchedAtMs || null,
        launched_by: design.launchedBy || null,
        launched_by_name: design.launchedByName || null,
        created_at_ms: design.createdAtMs || now,
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('product_designs').upsert(row);
      if (error) throw error;
      try {
        const s = Date.now() - 180 * 24 * 3600 * 1000;
        const { data: fresh } = await client.from('product_designs').select('*').gte('created_at_ms', s).order('created_at_ms', { ascending: false });
        if (cbs_ && cbs_.onProductDesigns) cbs_.onProductDesigns(fresh || []);
      } catch (e) {}
      return id;
    },
    async deleteProductDesign(id) {
      const { error } = await client.from('product_designs').delete().eq('id', id);
      if (error) throw error;
      try {
        const s = Date.now() - 180 * 24 * 3600 * 1000;
        const { data: fresh } = await client.from('product_designs').select('*').gte('created_at_ms', s).order('created_at_ms', { ascending: false });
        if (cbs_ && cbs_.onProductDesigns) cbs_.onProductDesigns(fresh || []);
      } catch (e) {}
    },
    async saveDesignerWorkLog(log) {
      const id = ensureUuid(log.id);
      const now = Date.now();
      const row = {
        id,
        designer_id: log.designerId,
        designer_name: log.designerName,
        work_date: log.workDate,
        product_title: log.productTitle || null,
        product_url: log.productUrl || null,
        store: log.store || null,
        work_counts: log.workCounts || {},
        calc_points: log.calcPoints || 0,
        approved_points: log.approvedPoints || null,
        images: log.images || [],
        notes: log.notes || null,
        review_status: log.reviewStatus || 'pending',
        reviewed_by: log.reviewedBy || null,
        reviewed_by_name: log.reviewedByName || null,
        review_comment: log.reviewComment || null,
        reviewed_at_ms: log.reviewedAtMs || null,
        created_at_ms: log.createdAtMs || now,
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('designer_work_logs').upsert(row);
      if (error) throw error;
      try {
        const since = Date.now() - 365 * 24 * 3600 * 1000;
        const { data: fresh } = await client.from('designer_work_logs').select('*').gte('created_at_ms', since).order('work_date', { ascending: false });
        if (cbs_ && cbs_.onDesignerWorkLogs) cbs_.onDesignerWorkLogs(fresh || []);
      } catch (e) {}
      return id;
    },
    async deleteDesignerWorkLog(id) {
      const { error } = await client.from('designer_work_logs').delete().eq('id', id);
      if (error) throw error;
      try {
        const since = Date.now() - 365 * 24 * 3600 * 1000;
        const { data: fresh } = await client.from('designer_work_logs').select('*').gte('created_at_ms', since).order('work_date', { ascending: false });
        if (cbs_ && cbs_.onDesignerWorkLogs) cbs_.onDesignerWorkLogs(fresh || []);
      } catch (e) {}
    },
    async saveDesignerMonthly(record) {
      const id = ensureUuid(record.id);
      const now = Date.now();
      const row = {
        id,
        designer_id: record.designerId,
        designer_name: record.designerName,
        month: record.month,
        cs_training: Number(record.csTraining) || 0,
        cs_kb_entry: Number(record.csKbEntry) || 0,
        review_quality: Number(record.reviewQuality) || 0,
        review_coor: Number(record.reviewCoor) || 0,
        review_resp: Number(record.reviewResp) || 0,
        drawing_points: Number(record.drawingPoints) || 0,
        drawing_score: Number(record.drawingScore) || 0,
        cs_score: Number(record.csScore) || 0,
        review_score: Number(record.reviewScore) || 0,
        total_score: Number(record.totalScore) || 0,
        pay_base: Number(record.payBase) || 0,
        pay_bonus: Number(record.payBonus) || 0,
        pay_total: Number(record.payTotal) || 0,
        locked: !!record.locked,
        locked_by: record.lockedBy || null,
        locked_by_name: record.lockedByName || null,
        locked_at_ms: record.lockedAtMs || null,
        notes: record.notes || null,
        updated_by: record.updatedBy || null,
        updated_by_name: record.updatedByName || null,
        updated_at: new Date().toISOString(),
        created_at_ms: record.createdAtMs || now
      };
      // 先查是否已存在该 designer + month 的记录
      const { data: existing } = await client.from('designer_monthly')
        .select('id').eq('designer_id', row.designer_id).eq('month', row.month).maybeSingle();
      if (existing) row.id = existing.id;
      const { error } = await client.from('designer_monthly').upsert(row);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('designer_monthly').select('*').order('month', { ascending: false });
        if (cbs_ && cbs_.onDesignerMonthly) cbs_.onDesignerMonthly(fresh || []);
      } catch (e) {}
      return row.id;
    },
    async saveEntry(entry) {
      const id = entry.id || uuid();
      const data = { ...entry, id, kpiPoints: calcEntryPoints({ ...entry, id }) };
      if (!data.createdAt) data.createdAt = Date.now();
      const row = {
        id,
        user_id: data.userId,
        user_name: data.userName,
        date: data.date,
        type: data.type,
        store: data.store || null,
        details: data.details || {},
        time_spent: Number(data.timeSpent) || 0,
        kpi_points: data.kpiPoints,
        created_at_ms: data.createdAt,
        updated_at: new Date().toISOString()
      };
      const { error: insErr } = await client.from('entries').upsert(row);
      if (insErr) throw insErr;
      // 主动刷新本地 entries 状态（不再依赖 realtime）
      try {
        const { data: fresh } = await client.from('entries').select('*').gte('date', daysAgo(180)).order('date', { ascending: false });
        if (cbs_ && cbs_.onEntries) cbs_.onEntries((fresh || []).map(rowToEntry));
      } catch (e) { console.warn('refresh after save failed:', e); }
      return id;
    },
    async deleteEntry(id) {
      const { error } = await client.from('entries').delete().eq('id', id);
      if (error) throw error;
      // 主动刷新
      try {
        const { data: fresh } = await client.from('entries').select('*').gte('date', daysAgo(180)).order('date', { ascending: false });
        if (cbs_ && cbs_.onEntries) cbs_.onEntries((fresh || []).map(rowToEntry));
      } catch (e) { console.warn('refresh after delete failed:', e); }
    },
    async saveMonthlyKpi(record) {
      const row = {
        id: record.id || `${record.userId}_${record.month}`,
        user_id: record.userId,
        user_name: record.userName,
        month: record.month,
        items: record.items || {},
        notes: record.notes || '',
        locked: !!record.locked,
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('monthly_kpi').upsert(row);
      if (error) throw error;
      // 主动刷新
      try {
        const { data: fresh } = await client.from('monthly_kpi').select('*');
        if (cbs_ && cbs_.onKpi) cbs_.onKpi((fresh || []).map(rowToKpi));
      } catch (e) { console.warn('refresh kpi failed:', e); }
    },
    async uploadFile(file, userId) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${userId || 'anon'}/${uuid()}.${ext}`;
      const { error } = await client.storage.from('attachments').upload(path, file);
      if (error) throw error;
      const { data } = client.storage.from('attachments').getPublicUrl(path);
      return data.publicUrl;
    },
    // v22-AZ: 云端配件库（component_library 表 + Supabase Storage）
    async saveComponent(item) {
      // v22-ES: 旧版本可能存 "mpn..." 类非标准 ID · 务必走 ensureUuid 转换
      const id = ensureUuid(item.id);
      const row = {
        id,
        part_type: item.partType || 'other',
        label: item.label || null,
        image_url: item.imageUrl || null,
        note: item.note || null,
        shared: item.shared === true,
        user_id: item.userId,
        user_name: item.userName || null,
        created_at_ms: item.createdAtMs || Date.now(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('component_library').upsert(row);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('component_library').select('*').order('created_at_ms', { ascending: false });
        if (cbs_ && cbs_.onComponentLibrary) cbs_.onComponentLibrary(fresh || []);
      } catch (e) {}
      return id;
    },
    async deleteComponent(id) {
      const { error } = await client.from('component_library').delete().eq('id', id);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('component_library').select('*').order('created_at_ms', { ascending: false });
        if (cbs_ && cbs_.onComponentLibrary) cbs_.onComponentLibrary(fresh || []);
      } catch (e) {}
    },
    // v22-BK: 销售日报（询盘跟进） ======================
    async saveSalesLog(log) {
      const id = ensureUuid(log.id);
      const row = {
        id,
        sales_id: log.salesId,
        sales_name: log.salesName || null,
        log_date: log.logDate,
        log_time: log.logTime || null,
        customer_name: log.customerName,
        customer_country: log.customerCountry || null,
        customer_level: log.customerLevel || null,
        customer_type: log.customerType || null,
        customer_email: log.customerEmail || null,
        alibaba_chat_id: log.alibabaChatId || null,
        product_name: log.productName || null,
        product_image_url: log.productImageUrl || null,
        inquiry_type: log.inquiryType || null,
        shop: log.shop || null,
        product_size: log.productSize || null,
        unit_price: log.unitPrice != null ? Number(log.unitPrice) : null,
        currency: log.currency || 'USD',
        quantity: log.quantity != null ? Number(log.quantity) : null,
        total_amount: log.totalAmount != null ? Number(log.totalAmount) : null,
        status: log.status || 'inquiry',
        follow_up_notes: log.followUpNotes || null,
        // v22-BT: 跟进字段
        next_follow_up_date: log.nextFollowUpDate || null,
        follow_up_reason: log.followUpReason || null,
        buyer_characteristics: log.buyerCharacteristics || null,
        browsing_history: log.browsingHistory || null,
        buyer_char_images: log.buyerCharImages || [],   // v22-DI: jsonb
        browsing_images: log.browsingImages || [],       // v22-DI: jsonb
        attachments: log.attachments || [],
        created_at_ms: log.createdAtMs || Date.now(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('sales_logs').upsert(row);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('sales_logs').select('*').order('created_at_ms', { ascending: false }).limit(2000);
        if (cbs_ && cbs_.onSalesLogs) cbs_.onSalesLogs(fresh || []);
      } catch (e) {}
      return id;
    },
    async deleteSalesLog(id) {
      const { error } = await client.from('sales_logs').delete().eq('id', id);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('sales_logs').select('*').order('created_at_ms', { ascending: false }).limit(2000);
        if (cbs_ && cbs_.onSalesLogs) cbs_.onSalesLogs(fresh || []);
      } catch (e) {}
    },
    // v22-BK: 付款回单（财务对账） ======================
    async savePaymentReceipt(rcpt) {
      // v22-ES: 同样保护 · 防止旧短 ID 进 UUID 列
      const id = ensureUuid(rcpt.id);
      const row = {
        id,
        sales_id: rcpt.salesId,
        sales_name: rcpt.salesName || null,
        receipt_date: rcpt.receiptDate,
        customer_name: rcpt.customerName,
        customer_country: rcpt.customerCountry || null,
        customer_email: rcpt.customerEmail || null,
        related_sales_log_id: rcpt.relatedSalesLogId || null,
        amount: Number(rcpt.amount),
        currency: rcpt.currency || 'USD',
        payment_type: rcpt.paymentType || null,
        payment_method: rcpt.paymentMethod || null,
        receipt_images: rcpt.receiptImages || [],
        status: rcpt.status || 'pending',
        finance_confirmed_by: rcpt.financeConfirmedBy || null,
        finance_confirmed_at: rcpt.financeConfirmedAt || null,
        finance_note: rcpt.financeNote || null,
        notes: rcpt.notes || null,
        created_at_ms: rcpt.createdAtMs || Date.now(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('payment_receipts').upsert(row);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('payment_receipts').select('*').order('created_at_ms', { ascending: false }).limit(2000);
        if (cbs_ && cbs_.onPaymentReceipts) cbs_.onPaymentReceipts(fresh || []);
      } catch (e) {}
      return id;
    },
    async deletePaymentReceipt(id) {
      const { error } = await client.from('payment_receipts').delete().eq('id', id);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('payment_receipts').select('*').order('created_at_ms', { ascending: false }).limit(2000);
        if (cbs_ && cbs_.onPaymentReceipts) cbs_.onPaymentReceipts(fresh || []);
      } catch (e) {}
    },
    // v22-CB: 周会纪要 ======================
    async saveWeeklyMeeting(meeting) {
      const id = meeting.id || uuid();
      const row = {
        id,
        publisher_id: meeting.publisherId,
        publisher_name: meeting.publisherName || null,
        publisher_role: meeting.publisherRole || 'supervisor',
        target_tier: meeting.targetTier || 'all',
        week_label: meeting.weekLabel || null,
        title: meeting.title || null,
        key_points: meeting.keyPoints || null,
        weekly_plan: meeting.weeklyPlan || null,
        attachments: meeting.attachments || [],
        pinned: meeting.pinned !== false,
        published_at_ms: meeting.publishedAtMs || Date.now(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('weekly_meetings').upsert(row);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('weekly_meetings').select('*').order('published_at_ms', { ascending: false }).limit(200);
        if (cbs_ && cbs_.onWeeklyMeetings) cbs_.onWeeklyMeetings(fresh || []);
      } catch (e) {}
      return id;
    },
    async deleteWeeklyMeeting(id) {
      const { error } = await client.from('weekly_meetings').delete().eq('id', id);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('weekly_meetings').select('*').order('published_at_ms', { ascending: false }).limit(200);
        if (cbs_ && cbs_.onWeeklyMeetings) cbs_.onWeeklyMeetings(fresh || []);
      } catch (e) {}
    },
    // ====================== v22-CR: 跨部门协作消息 ======================
    async saveCrossDeptMessage(msg) {
      // v22-ES: 同样保护
      const id = ensureUuid(msg.id);
      const row = {
        id,
        from_system: msg.fromSystem || 'design',
        from_user_id: msg.fromUserId,
        from_user_name: msg.fromUserName || null,
        to_system: msg.toSystem,
        to_user_id: msg.toUserId || null,
        to_user_name: msg.toUserName || null,
        category: msg.category || 'general',
        priority: msg.priority || 'normal',
        title: msg.title,
        body: msg.body || null,
        attachments: msg.attachments || [],
        related_ref: msg.relatedRef || null,
        related_type: msg.relatedType || null,
        // v22-CV: 工单系统升级字段
        related_shop: msg.relatedShop || null,
        assigned_to_id: msg.assignedToId || null,
        assigned_to_name: msg.assignedToName || null,
        assigned_by_id: msg.assignedById || null,
        assigned_by_name: msg.assignedByName || null,
        assigned_at_ms: msg.assignedAtMs || null,
        // v22-CW: 多人 watcher（关注者 user_id 数组）
        watchers: msg.watchers || [],
        status: msg.status || 'pending',
        thread: msg.thread || [],
        read_by: msg.readBy || [],
        created_at_ms: msg.createdAtMs || Date.now(),
        updated_at: new Date().toISOString(),
        completed_at_ms: msg.completedAtMs || null,
        completed_by_id: msg.completedById || null,
        completed_by_name: msg.completedByName || null
      };
      const { error } = await client.from('cross_dept_messages').upsert(row);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('cross_dept_messages').select('*').order('created_at_ms', { ascending: false }).limit(500);
        if (cbs_ && cbs_.onCrossDeptMessages) cbs_.onCrossDeptMessages(fresh || []);
      } catch (e) {}
      return id;
    },
    // v22-CV: 工单分派 · 主管/接收人指派具体处理人
    async assignCrossDeptMessage(messageId, assignedToId, assignedToName, assignedById, assignedByName) {
      const { error } = await client.from('cross_dept_messages').update({
        assigned_to_id: assignedToId,
        assigned_to_name: assignedToName,
        assigned_by_id: assignedById,
        assigned_by_name: assignedByName,
        assigned_at_ms: Date.now(),
        status: 'in_progress',
        updated_at: new Date().toISOString()
      }).eq('id', messageId);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('cross_dept_messages').select('*').order('created_at_ms', { ascending: false }).limit(500);
        if (cbs_ && cbs_.onCrossDeptMessages) cbs_.onCrossDeptMessages(fresh || []);
      } catch (e) {}
    },
    // v22-CV: 加载店铺-负责人映射表
    async loadShopOwners() {
      const { data, error } = await client.from('shop_owners').select('*').order('shop_name');
      if (error) { console.warn('loadShopOwners failed', error); return []; }
      return (data || []).map(r => ({
        id: r.id,
        shopName: r.shop_name,
        system: r.system,
        userId: r.user_id,
        userName: r.user_name,
        role: r.role || 'primary',
        notes: r.notes || null,
        createdAtMs: r.created_at_ms,
        updatedAt: r.updated_at
      }));
    },
    async saveShopOwner(record) {
      const id = ensureUuid(record.id);
      const row = {
        id,
        shop_name: record.shopName,
        system: record.system,
        user_id: record.userId,
        user_name: record.userName,
        role: record.role || 'primary',
        notes: record.notes || null,
        created_at_ms: record.createdAtMs || Date.now(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('shop_owners').upsert(row);
      if (error) throw error;
      try {
        const fresh = await this.loadShopOwners();
        if (cbs_ && cbs_.onShopOwners) cbs_.onShopOwners(fresh);
      } catch (e) {}
      return id;
    },
    async deleteShopOwner(id) {
      const { error } = await client.from('shop_owners').delete().eq('id', id);
      if (error) throw error;
      try {
        const fresh = await this.loadShopOwners();
        if (cbs_ && cbs_.onShopOwners) cbs_.onShopOwners(fresh);
      } catch (e) {}
    },
    // v22-CZ: 摄影部 photo_logs CRUD
    async loadPhotoLogs() {
      const { data, error } = await client.from('photo_logs').select('*').order('created_at_ms', { ascending: false }).limit(1000);
      if (error) { console.warn('loadPhotoLogs failed', error); return []; }
      return (data || []).map(r => ({
        id: r.id,
        productName: r.product_name,
        sku: r.sku,
        productImage: r.product_image,
        photographerId: r.photographer_id, photographerName: r.photographer_name,
        shootDate: r.shoot_date,
        editorId: r.editor_id, editorName: r.editor_name,
        editDate: r.edit_date,
        screenshot: r.screenshot,
        videoType: r.video_type || '展示视频',
        uploaderId: r.uploader_id, uploaderName: r.uploader_name,
        uploadDate: r.upload_date,
        uploadSite: r.upload_site,
        applicableShops: r.applicable_shops || [],  // v22-DF: 适用店铺多选
        urlHorizontal: r.url_horizontal, urlVertical: r.url_vertical, urlSquare: r.url_square, urlInstagram: r.url_instagram, urlTiktok: r.url_tiktok, urlFacebook: r.url_facebook, urlPinterest: r.url_pinterest, urlXiaohongshu: r.url_xiaohongshu, review: r.review, pendingReason: r.pending_reason, extraPlatforms: r.extra_platforms || [], embedStatus: r.embed_status || "pending", embedUrl: r.embed_url, embedScreenshots: r.embed_screenshots || [], dropboxUploadDate: r.dropbox_upload_date, dropboxUrl: r.dropbox_url, reshootRecords: r.reshoot_records || [], shootConfirmed: !!r.shoot_confirmed,
        status: r.status || 'draft',
        priority: r.priority || 'normal',
        notes: r.notes,
        relatedCdmId: r.related_cdm_id, relatedShop: r.related_shop,
        createdById: r.created_by_id, createdByName: r.created_by_name,
        createdAtMs: r.created_at_ms, updatedAt: r.updated_at
      }));
    },
    async savePhotoLog(record) {
      const id = ensureUuid(record.id);
      const row = {
        id,
        product_name: record.productName,
        // v22-EK: 产品类型 + 产品备注（独立于 notes 状态备注）
        product_type: record.productType || null,
        product_notes: record.productNotes || null,
        sku: record.sku || null,
        product_image: record.productImage || null,
        photographer_id: record.photographerId || null,
        photographer_name: record.photographerName || null,
        shoot_date: record.shootDate || null,
        editor_id: record.editorId || null,
        editor_name: record.editorName || null,
        edit_date: record.editDate || null,
        screenshot: record.screenshot || null,
        video_type: record.videoType || '展示视频',
        uploader_id: record.uploaderId || null,
        uploader_name: record.uploaderName || null,
        upload_date: record.uploadDate || null,
        upload_site: record.uploadSite || null,
        applicable_shops: record.applicableShops || [],  // v22-DF: 适用店铺多选
        url_horizontal: record.urlHorizontal || null,
        url_vertical: record.urlVertical || null,
        url_square: record.urlSquare || null,
        // v22-DN: 多平台 URL + 独立站嵌入证明
        url_instagram:   record.urlInstagram || null,
        url_tiktok:      record.urlTiktok || null,
        url_facebook:    record.urlFacebook || null,
        url_pinterest:   record.urlPinterest || null,
        url_xiaohongshu: record.urlXiaohongshu || null,
        // v22-EO: 视频审核状态 · JSONB · 结构在 SQL 注释中
        // v22-EQ: 待拍摄原因（chip 预设 或 自定义）
        pending_reason: record.pendingReason || null,
        extra_platforms: record.extraPlatforms || [],
        embed_status:    record.embedStatus || 'pending',
        embed_url:       record.embedUrl || null,
        embed_screenshots: record.embedScreenshots || [],
        // v22-DO: 网盘上传日期 + 补拍 + 拍摄确认
        dropbox_upload_date: record.dropboxUploadDate || null,
        dropbox_url:         record.dropboxUrl || null,
        reshoot_records:     record.reshootRecords || [],
        shoot_confirmed:     !!record.shootConfirmed,
        status: record.status || 'draft',
        priority: record.priority || 'normal',
        notes: record.notes || null,
        related_cdm_id: record.relatedCdmId || null,
        related_shop: record.relatedShop || null,
        // v22-EO: 审核状态 JSONB · null=未发起 · 否则 {status, requested_at_ms, ..., feedback_*}
        review: record.review || null,
        created_by_id: record.createdById,
        created_by_name: record.createdByName || null,
        created_at_ms: record.createdAtMs || Date.now(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('photo_logs').upsert(row);
      if (error) throw error;
      try {
        const fresh = await this.loadPhotoLogs();
        if (cbs_ && cbs_.onPhotoLogs) cbs_.onPhotoLogs(fresh);
      } catch (e) {}
      return id;
    },
    async deletePhotoLog(id) {
      const { error } = await client.from('photo_logs').delete().eq('id', id);
      if (error) throw error;
      try {
        const fresh = await this.loadPhotoLogs();
        if (cbs_ && cbs_.onPhotoLogs) cbs_.onPhotoLogs(fresh);
      } catch (e) {}
    },

    // v22-DF: 广告视频需求工单 CRUD（拍摄部接广告运营提的转格式工单）
    async loadAdVideoTasks() {
      try {
        const { data, error } = await client.from('ad_video_tasks').select('*').order('created_at_ms', { ascending: false });
        if (error) throw error;
        // row → camelCase
        return (data || []).map(r => ({
          id: r.id,
          productName: r.product_name,
          sourceUrl: r.source_url,
          targetFormats: r.target_formats || [],
          priority: r.priority,
          assignedToId: r.assigned_to_id,
          assignedToName: r.assigned_to_name,
          shops: r.shops || [],
          deadline: r.deadline,
          status: r.status,
          notes: r.notes,
          completionNote: r.completion_note,
          createdById: r.created_by_id,
          createdByName: r.created_by_name,
          createdAtMs: r.created_at_ms,
          assignedAtMs: r.assigned_at_ms,
          completedAtMs: r.completed_at_ms,
          updatedAt: r.updated_at
        }));
      } catch (e) {
        console.warn('loadAdVideoTasks: 表可能未建', e.message);
        return [];
      }
    },
    async saveAdVideoTask(task) {
      const id = ensureUuid(task.id);
      const row = {
        id,
        product_name: task.productName || '',
        source_url: task.sourceUrl || null,
        target_formats: task.targetFormats || [],
        priority: task.priority || 'normal',
        assigned_to_id: task.assignedToId || null,
        assigned_to_name: task.assignedToName || null,
        shops: task.shops || [],
        deadline: task.deadline || null,
        status: task.status || 'pending',
        notes: task.notes || null,
        completion_note: task.completionNote || null,
        created_by_id: task.createdById || null,
        created_by_name: task.createdByName || null,
        created_at_ms: task.createdAtMs || Date.now(),
        assigned_at_ms: task.assignedAtMs || null,
        completed_at_ms: task.completedAtMs || null,
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('ad_video_tasks').upsert(row);
      if (error) throw error;
      try {
        const fresh = await this.loadAdVideoTasks();
        if (cbs_ && cbs_.onAdVideoTasks) cbs_.onAdVideoTasks(fresh);
      } catch (e) {}
      return id;
    },
    async deleteAdVideoTask(id) {
      const { error } = await client.from('ad_video_tasks').delete().eq('id', id);
      if (error) throw error;
      try {
        const fresh = await this.loadAdVideoTasks();
        if (cbs_ && cbs_.onAdVideoTasks) cbs_.onAdVideoTasks(fresh);
      } catch (e) {}
    },

    // v22-DK: 用户反馈 / Bug / 新功能建议 CRUD
    async loadUserFeedbacks() {
      try {
        const { data, error } = await client.from('user_feedback').select('*').order('created_at_ms', { ascending: false });
        if (error) throw error;
        return (data || []).map(r => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          type: r.type,
          title: r.title,
          description: r.description,
          module: r.module,
          priority: r.priority,
          status: r.status,
          attachments: r.attachments || [],
          adminReply: r.admin_reply,
          adminAction: r.admin_action,
          resolvedInVersion: r.resolved_in_version,
          aiAnalysis: r.ai_analysis,
          createdAtMs: r.created_at_ms,
          updatedAt: r.updated_at
        }));
      } catch (e) {
        console.warn('loadUserFeedbacks: 表可能未建', e.message);
        return [];
      }
    },
    async saveUserFeedback(fb) {
      const id = ensureUuid(fb.id);
      const row = {
        id,
        user_id: fb.userId || null,
        user_name: fb.userName || null,
        type: fb.type || 'other',
        title: fb.title || '',
        description: fb.description || '',
        module: fb.module || null,
        priority: fb.priority || 'normal',
        status: fb.status || 'pending',
        attachments: fb.attachments || [],
        admin_reply: fb.adminReply || null,
        admin_action: fb.adminAction || null,
        resolved_in_version: fb.resolvedInVersion || null,
        ai_analysis: fb.aiAnalysis || null,
        created_at_ms: fb.createdAtMs || Date.now(),
        updated_at: new Date().toISOString()
      };
      const { error } = await client.from('user_feedback').upsert(row);
      if (error) throw error;
      try {
        const fresh = await this.loadUserFeedbacks();
        if (cbs_ && cbs_.onUserFeedbacks) cbs_.onUserFeedbacks(fresh);
      } catch (e) {}
      return id;
    },
    async deleteUserFeedback(id) {
      const { error } = await client.from('user_feedback').delete().eq('id', id);
      if (error) throw error;
      try {
        const fresh = await this.loadUserFeedbacks();
        if (cbs_ && cbs_.onUserFeedbacks) cbs_.onUserFeedbacks(fresh);
      } catch (e) {}
    },
    // v22-CW: 超时配置（存在 app_config 表 · key='cdm_timeout_config'）
    // 数据结构: { [system]: { [category]: { [priority]: days } } }
    async loadCdmTimeoutConfig() {
      try {
        const { data } = await client.from('app_config').select('value').eq('key', 'cdm_timeout_config').maybeSingle();
        return data?.value || {};
      } catch (e) { return {}; }
    },
    async saveCdmTimeoutConfig(config) {
      const { error } = await client.from('app_config').upsert({ key: 'cdm_timeout_config', value: config }, { onConflict: 'key' });
      if (error) throw error;
      try {
        if (cbs_ && cbs_.onCdmTimeoutConfig) cbs_.onCdmTimeoutConfig(config);
      } catch (e) {}
    },
    async deleteCrossDeptMessage(id) {
      const { error } = await client.from('cross_dept_messages').delete().eq('id', id);
      if (error) throw error;
      try {
        const { data: fresh } = await client.from('cross_dept_messages').select('*').order('created_at_ms', { ascending: false }).limit(500);
        if (cbs_ && cbs_.onCrossDeptMessages) cbs_.onCrossDeptMessages(fresh || []);
      } catch (e) {}
    },
    // 追加回复到线程
    async appendCrossDeptThread(messageId, reply) {
      // reply: { user_id, user_name, system, content, ts, attachments? }
      // 先读旧的 thread
      const { data: msg, error: e1 } = await client.from('cross_dept_messages').select('thread').eq('id', messageId).maybeSingle();
      if (e1) throw e1;
      const newThread = [...(msg?.thread || []), { ...reply, ts: reply.ts || Date.now() }];
      const { error: e2 } = await client.from('cross_dept_messages').update({
        thread: newThread,
        updated_at: new Date().toISOString()
      }).eq('id', messageId);
      if (e2) throw e2;
      try {
        const { data: fresh } = await client.from('cross_dept_messages').select('*').order('created_at_ms', { ascending: false }).limit(500);
        if (cbs_ && cbs_.onCrossDeptMessages) cbs_.onCrossDeptMessages(fresh || []);
      } catch (e) {}
    },
    // 标记已读
    async markCrossDeptRead(messageId, userId) {
      const { data: msg, error: e1 } = await client.from('cross_dept_messages').select('read_by').eq('id', messageId).maybeSingle();
      if (e1) throw e1;
      const readBy = msg?.read_by || [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        const { error: e2 } = await client.from('cross_dept_messages').update({ read_by: readBy }).eq('id', messageId);
        if (e2) throw e2;
      }
    },
    cleanup() {
      if (channel) client.removeChannel(channel);
    }
  };
}

function rowToEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    date: row.date,
    type: row.type,
    store: row.store,
    details: row.details || {},
    timeSpent: row.time_spent,
    kpiPoints: row.kpi_points,
    createdAt: row.created_at_ms || Date.parse(row.created_at || '') || Date.now()
  };
}
function rowToKpi(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    month: row.month,
    items: row.items || {},
    notes: row.notes || '',
    locked: !!row.locked,
    updatedAt: Date.parse(row.updated_at || '') || Date.now()
  };
}


// ====================== CHARTS ======================
