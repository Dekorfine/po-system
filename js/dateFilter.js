// ============================================================
// 📅 通用日期筛选器(项目级标准)· V5-W3-2026-05-26a
// ============================================================
// 用途:任何需要按日期范围筛选的模块都用这一份
// 支持的 preset:
//   all          所有时间
//   today        今天
//   yesterday    昨天
//   this_week    本周(周一-周日)
//   last_week    上周
//   this_month   本月
//   last_month   上月
//   last_7       近 7 天
//   last_30      近 30 天
//   last_90      近 90 天
//   Y2026        2026 全年
//   Y2026M06     2026 年 6 月
//   Y2026M06W1   2026 年 6 月第 1 周(1-7 号)
//   Y2026M06W2   2026 年 6 月第 2 周(8-14 号)
//   Y2026M06W3   第 3 周(15-21 号)
//   Y2026M06W4   第 4 周(22-28 号)
//   Y2026M06W5   第 5 周(29-月底)
//   custom       自定义(配合 from/to 参数)
// ============================================================

// 把日期标准化到 YYYY-MM-DD 字符串
function _dfFmt(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// 获取某月某周的日期范围 · 简单约定:第 N 周 = 第 (N-1)*7+1 至 第 N*7 号
function _dfGetWeekRange(year, month1based, weekNum) {
  const start = new Date(year, month1based - 1, (weekNum - 1) * 7 + 1);
  let endDay = weekNum * 7;
  // 最后一天用月末日期(防止超出当月)
  const lastDayOfMonth = new Date(year, month1based, 0).getDate();
  endDay = Math.min(endDay, lastDayOfMonth);
  const end = new Date(year, month1based - 1, endDay, 23, 59, 59, 999);
  return { start, end };
}

// 计算指定日期是该月第几周(1-5)
function _dfGetWeekOfMonth(d) {
  return Math.ceil(d.getDate() / 7);
}

// 找到包含 today 的"本周"(周一-周日)
function _dfGetThisWeekRange(refDate = new Date()) {
  const d = new Date(refDate);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow; // 让 Monday 成为周首
  const start = new Date(d);
  start.setDate(d.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ============================================================
// 核心:按 preset 返回 { start, end, label }
// ============================================================
function getDateRange(preset, opt = {}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
  
  if (!preset || preset === 'all') {
    return { start: null, end: null, label: '所有时间' };
  }
  if (preset === 'today') {
    return { start: today, end: todayEnd, label: `今天(${_dfFmt(today)})` };
  }
  if (preset === 'yesterday') {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    const yEnd = new Date(y); yEnd.setHours(23, 59, 59, 999);
    return { start: y, end: yEnd, label: `昨天(${_dfFmt(y)})` };
  }
  if (preset === 'this_week') {
    const { start, end } = _dfGetThisWeekRange();
    return { start, end, label: `本周(${_dfFmt(start)}~${_dfFmt(end)})` };
  }
  if (preset === 'last_week') {
    const { start, end } = _dfGetThisWeekRange();
    const lwStart = new Date(start); lwStart.setDate(start.getDate() - 7);
    const lwEnd = new Date(end); lwEnd.setDate(end.getDate() - 7);
    lwEnd.setHours(23, 59, 59, 999);
    return { start: lwStart, end: lwEnd, label: `上周(${_dfFmt(lwStart)}~${_dfFmt(lwEnd)})` };
  }
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: `本月(${now.getFullYear()}年${now.getMonth() + 1}月)` };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, label: `上月(${start.getFullYear()}年${start.getMonth() + 1}月)` };
  }
  if (preset === 'last_7') {
    const start = new Date(today); start.setDate(today.getDate() - 6);
    return { start, end: todayEnd, label: `近 7 天(${_dfFmt(start)}~今天)` };
  }
  if (preset === 'last_30') {
    const start = new Date(today); start.setDate(today.getDate() - 29);
    return { start, end: todayEnd, label: `近 30 天` };
  }
  if (preset === 'last_90') {
    const start = new Date(today); start.setDate(today.getDate() - 89);
    return { start, end: todayEnd, label: `近 90 天` };
  }
  if (preset === 'last_365') {
    const start = new Date(today); start.setDate(today.getDate() - 364);
    return { start, end: todayEnd, label: `近 1 年` };
  }
  
  // 年度:Y2026
  const yMatch = preset.match(/^Y(\d{4})$/);
  if (yMatch) {
    const y = parseInt(yMatch[1]);
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999), label: `${y} 全年` };
  }
  
  // 月度:Y2026M06
  const ymMatch = preset.match(/^Y(\d{4})M(\d{1,2})$/);
  if (ymMatch) {
    const y = parseInt(ymMatch[1]);
    const m = parseInt(ymMatch[2]);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999), label: `${y}年${m}月` };
  }
  
  // 周度:Y2026M06W1
  const ymwMatch = preset.match(/^Y(\d{4})M(\d{1,2})W(\d)$/);
  if (ymwMatch) {
    const y = parseInt(ymwMatch[1]);
    const m = parseInt(ymwMatch[2]);
    const w = parseInt(ymwMatch[3]);
    const { start, end } = _dfGetWeekRange(y, m, w);
    return { start, end, label: `${y}年${m}月第 ${w} 周(${start.getDate()}-${end.getDate()} 号)` };
  }
  
  // 自定义:custom:YYYY-MM-DD:YYYY-MM-DD
  if (preset.startsWith('custom:')) {
    const parts = preset.split(':');
    if (parts.length === 3) {
      const start = new Date(parts[1] + 'T00:00:00');
      const end = new Date(parts[2] + 'T23:59:59');
      return { start, end, label: `自定义 ${parts[1]} ~ ${parts[2]}` };
    }
  }
  
  return { start: null, end: null, label: preset };
}

// ============================================================
// 工具:判断某日期 / created_at 是否在 preset 范围内
// ============================================================
function isDateInRange(dateOrTs, preset) {
  if (!preset || preset === 'all') return true;
  const range = getDateRange(preset);
  if (!range.start || !range.end) return true;
  const d = (dateOrTs instanceof Date) ? dateOrTs : new Date(dateOrTs);
  return d >= range.start && d <= range.end;
}

// ============================================================
// 填充 select element · 一键加全部预设
// ============================================================
// 调用例:
//   populateDateFilterSelect('mySelect', 'this_month', { yearsBack: 2, includeWeeks: true });
//
// options:
//   currentValue:     当前选中的 preset
//   yearsBack:        往前列几年(默认 2)
//   includeWeeks:     是否展开"按周"(默认 false · 选中具体月时才显示)
//   includeCustom:    是否含"自定义"选项(默认 true)
//   extraTop:         额外的最顶部选项 [{value, label}, ...]  (例如反馈用的"仅待处理"等业务过滤)
//
function populateDateFilterSelect(selectEl, currentValue, options = {}) {
  if (typeof selectEl === 'string') selectEl = document.getElementById(selectEl);
  if (!selectEl) return;
  const opts = {
    yearsBack: 2,
    includeWeeks: true,
    includeCustom: true,
    extraTop: [],
    ...options,
  };
  
  const now = new Date();
  const curYear = now.getFullYear();
  
  let html = '';
  
  // 额外的业务过滤(如果有)
  if (opts.extraTop && opts.extraTop.length > 0) {
    opts.extraTop.forEach(e => {
      html += `<option value="${escapeHtml(e.value)}">${escapeHtml(e.label)}</option>`;
    });
    html += `<option disabled>──────────</option>`;
  }
  
  html += `<option value="all">📋 所有时间</option>`;
  
  html += `<optgroup label="⚡ 快捷">`;
  html += `<option value="today">📍 今天</option>`;
  html += `<option value="yesterday">⏪ 昨天</option>`;
  html += `<option value="this_week">📅 本周</option>`;
  html += `<option value="last_week">⏮ 上周</option>`;
  html += `<option value="this_month">📆 本月</option>`;
  html += `<option value="last_month">⏮ 上月</option>`;
  html += `<option value="last_7">⏱ 近 7 天</option>`;
  html += `<option value="last_30">⏱ 近 30 天</option>`;
  html += `<option value="last_90">⏱ 近 90 天</option>`;
  html += `<option value="last_365">⏱ 近 1 年</option>`;
  html += `</optgroup>`;
  
  // 按年度(最近 N 年)
  html += `<optgroup label="📅 按年度">`;
  for (let y = curYear; y >= curYear - opts.yearsBack; y--) {
    html += `<option value="Y${y}">${y} 全年</option>`;
  }
  html += `</optgroup>`;
  
  // 按月度(当年所有 12 个月 + 去年最后几个月)
  html += `<optgroup label="📆 按月度(${curYear} 年)">`;
  for (let m = 1; m <= 12; m++) {
    const isFuture = (curYear === now.getFullYear() && m > now.getMonth() + 1);
    html += `<option value="Y${curYear}M${String(m).padStart(2, '0')}"${isFuture ? ' style="color:#94a3b8;"' : ''}>${curYear}年${m}月${isFuture ? ' (未来)' : ''}</option>`;
  }
  html += `</optgroup>`;
  
  // 去年和前年
  for (let y = curYear - 1; y >= curYear - opts.yearsBack; y--) {
    html += `<optgroup label="📆 按月度(${y} 年)">`;
    for (let m = 1; m <= 12; m++) {
      html += `<option value="Y${y}M${String(m).padStart(2, '0')}">${y}年${m}月</option>`;
    }
    html += `</optgroup>`;
  }
  
  // 按周(当年每月每周 · 折叠在 optgroup)
  if (opts.includeWeeks) {
    html += `<optgroup label="🗓 按周(${curYear} 年 · 一个月分 4-5 周)">`;
    // 只列出当年已过或本月的周(避免太多选项)
    const maxMonth = now.getMonth() + 1;
    for (let m = 1; m <= maxMonth; m++) {
      const lastDay = new Date(curYear, m, 0).getDate();
      const totalWeeks = Math.ceil(lastDay / 7);
      for (let w = 1; w <= totalWeeks; w++) {
        const startDay = (w - 1) * 7 + 1;
        const endDay = Math.min(w * 7, lastDay);
        html += `<option value="Y${curYear}M${String(m).padStart(2, '0')}W${w}">${curYear}年${m}月 第${w}周(${startDay}-${endDay}号)</option>`;
      }
    }
    html += `</optgroup>`;
  }
  
  // 自定义
  if (opts.includeCustom) {
    html += `<option disabled>──────────</option>`;
    html += `<option value="custom_open">⚙ 自定义日期范围...</option>`;
  }
  
  selectEl.innerHTML = html;
  if (currentValue) {
    // 自定义类型可能不在 options 里,加一个临时 option
    if (currentValue.startsWith && currentValue.startsWith('custom:')) {
      const opt = document.createElement('option');
      opt.value = currentValue;
      const range = getDateRange(currentValue);
      opt.textContent = `📌 ${range.label}`;
      opt.selected = true;
      selectEl.insertBefore(opt, selectEl.firstChild.nextSibling);
    }
    selectEl.value = currentValue;
  }
}

// ============================================================
// 自定义日期选择对话框
// ============================================================
let _dfCustomOnConfirm = null;

function openCustomDateRange(currentFrom, currentTo, onConfirm) {
  _dfCustomOnConfirm = onConfirm;
  const modal = document.getElementById('customDateRangeModal');
  if (!modal) {
    console.error('[DATE-FILTER] customDateRangeModal not in DOM');
    return;
  }
  const today = _dfFmt(new Date());
  document.getElementById('dfCustomFrom').value = currentFrom || today;
  document.getElementById('dfCustomTo').value = currentTo || today;
  modal.classList.add('show');
}

function closeCustomDateRange() {
  document.getElementById('customDateRangeModal')?.classList.remove('show');
  _dfCustomOnConfirm = null;
}

function confirmCustomDateRange() {
  const from = document.getElementById('dfCustomFrom').value;
  const to = document.getElementById('dfCustomTo').value;
  if (!from || !to) { toast('请填完整日期', 'err'); return; }
  if (from > to) { toast('开始日期必须 ≤ 结束日期', 'err'); return; }
  const preset = `custom:${from}:${to}`;
  if (typeof _dfCustomOnConfirm === 'function') _dfCustomOnConfirm(preset);
  closeCustomDateRange();
}

// 处理 select 的 change 事件 · 自动处理 custom_open
function onDateFilterChange(selectEl, onChange) {
  if (typeof selectEl === 'string') selectEl = document.getElementById(selectEl);
  if (!selectEl) return;
  const val = selectEl.value;
  if (val === 'custom_open') {
    // 打开自定义日期对话框
    openCustomDateRange(null, null, (customPreset) => {
      // 在 select 里加这个 custom option
      populateDateFilterSelect(selectEl, customPreset);
      if (onChange) onChange(customPreset);
    });
    // 重置 select 到之前的值(避免 stuck 在 custom_open)
    selectEl.value = '';
    return;
  }
  if (onChange) onChange(val);
}

// 暴露到全局
if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  };
}

window.getDateRange = getDateRange;
window.isDateInRange = isDateInRange;
window.populateDateFilterSelect = populateDateFilterSelect;
window.openCustomDateRange = openCustomDateRange;
window.closeCustomDateRange = closeCustomDateRange;
window.confirmCustomDateRange = confirmCustomDateRange;
window.onDateFilterChange = onDateFilterChange;
