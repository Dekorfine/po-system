// ============================================================
// 跟单团队工作台 · greeting.js (V4 · 2026-05-24)
// 每日温暖问候 · 让 00 后团队工作有温度
//
// 设计:
//   - 用语料库 + 数据驱动,免费即时,完全离线
//   - 时段感知 / 数据感知 / 心情感知 / 个性化
//   - 每天首次打开显示一次,关闭后当天不再弹
//   - 没有"系统通知"那种冷冰冰感,像朋友打招呼
//
// 依赖: core.js (CURRENT_AGENT, IS_ADMIN, ORDERS, AFTERSALES, ISSUES, toast, escapeHtml)
// ============================================================

// ============================================================
// 语料库
// ============================================================

// 时段词 - 不同时间不同问候
const _GREETING_TIME_PHRASES = {
  morning: [   // 5:00 - 11:00
    '早上好啊', '早安', '早呀', 'Morning ☕', '元气满满的早晨', '又是新的一天',
  ],
  noon: [      // 11:00 - 14:00
    '中午好', '午饭吃了吗', '记得休息会儿', '别忘了午休', '中午别太拼',
  ],
  afternoon: [ // 14:00 - 18:00
    '下午好', '咖啡续上了吗', '坚持一下,快下班了', '下午也加油',
  ],
  evening: [   // 18:00 - 23:00
    '晚上好', '辛苦了一天', '差不多收工啦', '加班辛苦了',
  ],
  midnight: [  // 23:00 - 5:00
    '这么晚还在工作', '早点休息哦', '今晚也太拼了', '记得早点睡',
  ],
};

// 周几词
const _GREETING_WEEKDAY = {
  0: '周末了,放松一点',                              // Sunday
  1: '新的一周开始,慢慢来',                          // Monday
  2: '周二,节奏起来了',
  3: '已经周三啦,本周过半',
  4: '周四了,快到周末',
  5: '周五!快下班啦',
  6: '周末加班辛苦了',                               // Saturday
};

// 主语料 - 各种温暖鼓励、关怀、调皮的话
const _GREETING_WARM = [
  '你已经做得很棒了',
  '别太给自己压力',
  '慢慢来,不急',
  '辛苦了',
  '你超棒的',
  '相信你今天也能搞定一切',
  '工作再忙也别忘了吃饭',
  '记得给自己倒杯水',
  '今天也要开开心心的',
  '保持微笑,事情会好起来的',
  '一步一步来就好',
  '不用赶,稳就行',
  '你的努力都被看到了',
  '今天也是被需要的一天',
  '感谢你一直这么靠谱',
  '希望你今天工作顺利',
  '今天又是被你照亮的一天',
  '一切都在变好',
  '你比你想象的更厉害',
  '没事儿,慢慢消化',
];

// 主管专属问候(对主管说不同的话)
const _GREETING_ADMIN = [
  '团队靠你了,辛苦',
  '管理也是一种修行',
  '你扛起了团队',
  '大家都看着你呢,加油',
  '感谢你撑起整个团队',
  '决策不易,但你一直做得很好',
];

// 不同的工作情境鼓励语
const _GREETING_DATA_DRIVEN = {
  busy: [        // 待办很多
    '事儿挺多的,慢慢来,一件一件搞',
    '今天有点忙,但你 hold 得住',
    '清单看着吓人,做起来其实不难',
    '别被数字吓到,你之前更难的都过了',
  ],
  light: [       // 待办少
    '今天比较轻松哦,可以好好喘口气',
    '事情不多,可以摸鱼一下下',
    '今天难得清闲,享受一下',
    '今天没啥火警,稳稳的',
  ],
  achieved: [    // 昨天/本周做了很多
    '你昨天可真拼啊',
    '你最近的工作真亮眼',
    '看了你的数据,真的厉害',
    '你这一周完成了好多',
  ],
  resolved: [    // 解决了很多问题
    '你最近解决问题的速度真快',
    '你的执行力真的强',
    '这些问题被你处理完,客户应该挺满意的',
  ],
  weekend: [     // 周末
    '周末也在工作,真的辛苦',
    '记得抽空给自己放个假',
    '工作之余别忘了生活',
  ],
};

// emoji 池子(随机取一个)
const _GREETING_EMOJI = [
  '☕', '🌞', '🌸', '✨', '💪', '🎯', '🌈', '⭐', '🍀', '☀️',
  '🌻', '🎵', '🍃', '💛', '🤍', '🌷', '☘️', '🪴', '🌟',
];

// ============================================================
// 工具函数
// ============================================================
function _greetingPickRandom(arr) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

function _greetingGetTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 23 || h < 5) return 'midnight';
  if (h < 11) return 'morning';
  if (h < 14) return 'noon';
  if (h < 18) return 'afternoon';
  return 'evening';
}

// 计算当前用户的工作数据(用于个性化)
function _greetingGetUserStats() {
  const stats = {
    pendingOrders: 0,
    pendingAftersales: 0,
    pendingIssues: 0,
    overdueIssues: 0,
    todayResolved: 0,
    weekResolved: 0,
  };
  
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    
    if (typeof ORDERS !== 'undefined' && ORDERS) {
      stats.pendingOrders = ORDERS.filter(o => 
        !o.deletedAt && !['arrived', 'received', 'cancelled'].includes(o.status)
      ).length;
    }
    
    if (typeof AFTERSALES !== 'undefined' && AFTERSALES) {
      stats.pendingAftersales = AFTERSALES.filter(a => 
        !a.deletedAt && a.status !== 'resolved'
      ).length;
      stats.weekResolved += AFTERSALES.filter(a => 
        a.status === 'resolved' && a.updatedAt && a.updatedAt >= weekAgo
      ).length;
    }
    
    if (typeof ISSUES !== 'undefined' && ISSUES) {
      stats.pendingIssues = ISSUES.filter(it => 
        !it.deletedAt && it.status !== 'resolved'
      ).length;
      stats.overdueIssues = ISSUES.filter(it => {
        if (!it.nextFollowDate || it.status === 'resolved' || it.deletedAt) return false;
        return it.nextFollowDate < today;
      }).length;
      stats.weekResolved += ISSUES.filter(it => 
        it.status === 'resolved' && it.updatedAt && it.updatedAt >= weekAgo
      ).length;
    }
  } catch (e) {
    console.warn('[greeting] 统计失败:', e);
  }
  
  return stats;
}

// ============================================================
// 核心:生成个性化问候语
// ============================================================
function generateDailyGreeting() {
  const name = CURRENT_AGENT || '同学';
  const timeOfDay = _greetingGetTimeOfDay();
  const dayOfWeek = new Date().getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const stats = _greetingGetUserStats();
  const isAdmin = (typeof IS_ADMIN !== 'undefined' && IS_ADMIN);
  
  // ===== 组装 4 部分 =====
  
  // Part 1 - 时段问候 + 名字 + emoji
  const timePhrase = _greetingPickRandom(_GREETING_TIME_PHRASES[timeOfDay]);
  const emoji = _greetingPickRandom(_GREETING_EMOJI);
  const greeting = `${name},${timePhrase} ${emoji}`;
  
  // Part 2 - 个性化感想
  let personalLine = '';
  if (isWeekend) {
    personalLine = _greetingPickRandom(_GREETING_DATA_DRIVEN.weekend);
  } else if (timeOfDay === 'midnight') {
    personalLine = _greetingPickRandom(_GREETING_TIME_PHRASES.midnight);
  } else if (stats.weekResolved >= 10) {
    personalLine = _greetingPickRandom(_GREETING_DATA_DRIVEN.achieved);
  } else if (stats.pendingOrders + stats.pendingAftersales + stats.pendingIssues > 30) {
    personalLine = _greetingPickRandom(_GREETING_DATA_DRIVEN.busy);
  } else if (stats.pendingOrders + stats.pendingAftersales + stats.pendingIssues < 5) {
    personalLine = _greetingPickRandom(_GREETING_DATA_DRIVEN.light);
  } else {
    // 通用温暖 / 主管专属
    personalLine = isAdmin && Math.random() < 0.4
      ? _greetingPickRandom(_GREETING_ADMIN)
      : _greetingPickRandom(_GREETING_WARM);
  }
  
  // Part 3 - 数据小条(可选,有数据时显示)
  let dataLine = '';
  const todoTotal = stats.pendingOrders + stats.pendingAftersales + stats.pendingIssues;
  if (todoTotal > 0) {
    const parts = [];
    if (stats.pendingOrders > 0) parts.push(`${stats.pendingOrders} 个催单`);
    if (stats.pendingAftersales > 0) parts.push(`${stats.pendingAftersales} 个售后`);
    if (stats.pendingIssues > 0) parts.push(`${stats.pendingIssues} 个供应商问题`);
    if (parts.length > 0) {
      dataLine = `今天有 ${parts.join(' · ')} 等着你,慢慢来`;
    }
  }
  if (stats.overdueIssues > 0) {
    dataLine = `有 ${stats.overdueIssues} 个问题逾期了,有时间跟一下哦`;
  }
  
  // Part 4 - 周几语
  let weekdayLine = '';
  if (Math.random() < 0.5) {  // 50% 概率出现
    weekdayLine = _GREETING_WEEKDAY[dayOfWeek] || '';
  }
  
  // ===== 日期 =====
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const weekDayCn = ['日', '一', '二', '三', '四', '五', '六'][dayOfWeek];
  
  return {
    greeting,
    personalLine,
    dataLine,
    weekdayLine,
    dateStr,
    weekDayCn,
    timeOfDay,
  };
}

// ============================================================
// 渲染问候卡片(顶部显示)
// ============================================================
function renderGreetingCard() {
  // 已经显示过 / 用户关闭过
  const today = new Date().toISOString().slice(0, 10);
  const lastShownKey = `greeting_shown_${today}_${CURRENT_AGENT}`;
  if (sessionStorage.getItem(lastShownKey)) return;
  
  // 移除可能存在的旧卡片
  document.getElementById('greetingCard')?.remove();
  
  const g = generateDailyGreeting();
  
  // 找一个稳定的插入点:tab 栏父容器之后(在 meetingBanner 之前)
  const tabSample = document.querySelector('.tab-item');
  const tabBar = tabSample?.parentElement;
  if (!tabBar) return;
  
  const card = document.createElement('div');
  card.id = 'greetingCard';
  card.className = `greeting-card greeting-${g.timeOfDay}`;
  card.innerHTML = `
    <button class="gc-close" type="button" onclick="dismissGreetingCard()" title="关闭(今天不再显示)">✕</button>
    <div class="gc-content">
      <div class="gc-line gc-line-main">${escapeHtml(g.greeting)}</div>
      ${g.personalLine ? `<div class="gc-line gc-line-personal">${escapeHtml(g.personalLine)}</div>` : ''}
      ${g.dataLine ? `<div class="gc-line gc-line-data">${escapeHtml(g.dataLine)}</div>` : ''}
      ${g.weekdayLine ? `<div class="gc-line gc-line-week">${escapeHtml(g.weekdayLine)}</div>` : ''}
      <div class="gc-meta">· ${g.dateStr} · 周${g.weekDayCn} ·</div>
    </div>
  `;
  
  tabBar.parentNode.insertBefore(card, tabBar.nextSibling);
}

function dismissGreetingCard() {
  const today = new Date().toISOString().slice(0, 10);
  const key = `greeting_shown_${today}_${CURRENT_AGENT}`;
  sessionStorage.setItem(key, '1');
  // 也记到 localStorage,让多 tab 同步
  try { localStorage.setItem(key, '1'); } catch(_) {}
  document.getElementById('greetingCard')?.remove();
}

// 检查 localStorage 看今天是不是已经看过(跨 tab 同步)
function _greetingCheckShown() {
  const today = new Date().toISOString().slice(0, 10);
  const key = `greeting_shown_${today}_${CURRENT_AGENT}`;
  try {
    if (localStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      return true;
    }
  } catch(_) {}
  return false;
}

// ============================================================
// CSS 注入
// ============================================================
(function _injectGreetingCSS() {
  if (document.getElementById('greeting-style')) return;
  const s = document.createElement('style');
  s.id = 'greeting-style';
  s.textContent = `
    .greeting-card {
      position: relative;
      margin: 0 auto 14px auto;
      max-width: 1400px;
      padding: 22px 28px 20px 28px;
      border-radius: 14px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      animation: greetingFadeIn 0.5s ease-out;
      overflow: hidden;
    }
    @keyframes greetingFadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    /* 不同时段的背景配色 */
    .greeting-morning {
      background: linear-gradient(135deg, #fef3c7 0%, #fff7ed 60%, #fff 100%);
      border: 1px solid #fde68a;
    }
    .greeting-noon {
      background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 60%, #fff 100%);
      border: 1px solid #bfdbfe;
    }
    .greeting-afternoon {
      background: linear-gradient(135deg, #ddd6fe 0%, #ede9fe 60%, #fff 100%);
      border: 1px solid #c4b5fd;
    }
    .greeting-evening {
      background: linear-gradient(135deg, #fed7aa 0%, #ffedd5 60%, #fff 100%);
      border: 1px solid #fdba74;
    }
    .greeting-midnight {
      background: linear-gradient(135deg, #c7d2fe 0%, #e0e7ff 60%, #fff 100%);
      border: 1px solid #a5b4fc;
    }
    .gc-content {
      position: relative;
      z-index: 1;
    }
    .gc-line {
      font-size: 15px;
      color: #1f2937;
      line-height: 1.7;
      margin: 4px 0;
    }
    .gc-line-main {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 10px;
    }
    .gc-line-personal {
      font-size: 14.5px;
      color: #4b5563;
    }
    .gc-line-data {
      font-size: 13.5px;
      color: #6b7280;
      margin-top: 6px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 6px;
      display: inline-block;
    }
    .gc-line-week {
      font-size: 13px;
      color: #6b7280;
      font-style: italic;
    }
    .gc-meta {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 10px;
      letter-spacing: 0.5px;
    }
    .gc-close {
      position: absolute;
      top: 12px;
      right: 14px;
      width: 26px; height: 26px;
      background: rgba(0,0,0,0.06);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 13px;
      color: #4b5563;
      line-height: 1;
      z-index: 2;
    }
    .gc-close:hover {
      background: rgba(0,0,0,0.12);
      color: #dc2626;
    }
    
    /* 移动端调小一点 */
    @media (max-width: 720px) {
      .greeting-card { padding: 16px 18px; }
      .gc-line-main { font-size: 18px; }
      .gc-line { font-size: 13.5px; }
    }
  `;
  document.head.appendChild(s);
})();

// 自动启动:登录后延迟 800ms 显示问候(等数据加载完)
window.addEventListener('load', () => {
  setTimeout(() => {
    if (typeof CURRENT_AGENT !== 'undefined' && CURRENT_AGENT) {
      if (!_greetingCheckShown()) {
        renderGreetingCard();
      }
    }
  }, 800);
});

// 提供手动重新触发(测试用)
window.testGreeting = function() {
  const today = new Date().toISOString().slice(0, 10);
  const key = `greeting_shown_${today}_${CURRENT_AGENT}`;
  sessionStorage.removeItem(key);
  try { localStorage.removeItem(key); } catch(_) {}
  renderGreetingCard();
};
