const store = new TallyStore();

/* ====== State ====== */
let currentView = 'today';
let expandedCardId = null;
let chartPeriod = 30;
let editingTaskId = null;
let recordingTaskId = null;
let undoTimer = null;
let undoAction = null;
let selectedUnit = '个';

/* ====== DOM refs ====== */
const $ = id => document.getElementById(id);
const todayDate = $('today-date');
const taskList = $('task-list');
const todayEmpty = $('today-empty');
const completeBanner = $('today-complete-banner');
const chartsContainer = $('charts-container');
const insightsEmpty = $('insights-empty');
const manageList = $('manage-list');
const manageEmpty = $('manage-empty');

/* ====== Init ====== */
document.addEventListener('DOMContentLoaded', () => {
  updateTodayDate();
  bindTabs();
  bindRecordModal();
  bindTaskForm();
  bindConfirm();
  bindToast();
  bindExport();
  bindPeriodSelector();
  initDragDrop();
  renderTodayView();
  registerSW();
});

/* ====== Service Worker ====== */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/* ====== Tab Switching ====== */
function bindTabs() {
  document.querySelectorAll('#tab-bar .tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('#tab-bar .tab').forEach(t => t.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelector(`#tab-bar .tab[data-view="${name}"]`).classList.add('active');

  if (name === 'today') renderTodayView();
  else if (name === 'insights') renderInsightsView();
  else if (name === 'manage') renderManageView();
}

/* ====== Today View ====== */
function updateTodayDate() {
  const d = new Date();
  const months = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const days = ['周日','周一','周二','周三','周四','周五','周六'];
  todayDate.textContent = `${months[d.getMonth()]}月${d.getDate()}日 ${days[d.getDay()]}`;
}

function renderTodayView() {
  const tasks = store.getTasks();
  taskList.innerHTML = '';

  if (tasks.length === 0) {
    todayEmpty.hidden = false;
    completeBanner.hidden = true;
    return;
  }
  todayEmpty.hidden = true;

  let allGoalsMet = true;
  let hasGoal = false;

  tasks.forEach(task => {
    const summary = store.getTaskSummary(task.id);
    const card = createTaskCard(task, summary);
    taskList.appendChild(card);

    if (task.dailyGoal) {
      hasGoal = true;
      if (summary.total < task.dailyGoal) allGoalsMet = false;
    }
  });

  completeBanner.hidden = !(hasGoal && allGoalsMet);
}

function createTaskCard(task, summary) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.taskId = task.id;

  const main = document.createElement('div');
  main.className = 'card-main';

  const info = document.createElement('div');
  info.className = 'card-info';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = task.name;
  info.appendChild(name);

  const stats = document.createElement('div');
  if (summary.sets === 0) {
    stats.className = 'card-stats none';
    stats.textContent = '今日暂无记录';
  } else {
    stats.className = 'card-stats';
    stats.textContent = `${summary.sets} 组 · 共 ${summary.total} ${task.unit} · 均 ${summary.avg} ${task.unit}/组`;
  }
  info.appendChild(stats);

  if (task.dailyGoal && summary.sets > 0) {
    const pct = Math.min(Math.round(summary.total / task.dailyGoal * 100), 999);
    const bar = document.createElement('div');
    bar.className = 'card-progress';
    const fill = document.createElement('div');
    fill.className = 'card-progress-fill' + (pct >= 100 ? ' done' : '');
    fill.style.width = Math.min(pct, 100) + '%';
    bar.appendChild(fill);
    info.appendChild(bar);
    const pctLabel = document.createElement('div');
    pctLabel.className = 'card-pct' + (pct >= 100 ? ' done' : '');
    pctLabel.textContent = pct + '%';
    info.appendChild(pctLabel);
  }

  const plusBtn = document.createElement('button');
  plusBtn.className = 'plus-btn';
  plusBtn.textContent = '+';
  plusBtn.addEventListener('click', e => {
    e.stopPropagation();
    openRecordModal(task.id);
  });

  main.appendChild(info);
  main.appendChild(plusBtn);
  card.appendChild(main);

  const detail = document.createElement('div');
  detail.className = 'card-detail';
  detail.id = `detail-${task.id}`;
  const detailInner = document.createElement('div');
  detailInner.className = 'card-detail-inner';
  detail.appendChild(detailInner);
  card.appendChild(detail);

  main.addEventListener('click', () => toggleCardExpand(task.id));

  if (expandedCardId === task.id) {
    requestAnimationFrame(() => {
      detail.classList.add('open');
      renderCardDetails(detailInner, task);
    });
  }

  return card;
}

function toggleCardExpand(taskId) {
  const wasExpanded = expandedCardId === taskId;
  document.querySelectorAll('.card-detail.open').forEach(d => d.classList.remove('open'));
  expandedCardId = wasExpanded ? null : taskId;

  if (!wasExpanded) {
    const detail = $(`detail-${taskId}`);
    if (detail) {
      detail.classList.add('open');
      const inner = detail.querySelector('.card-detail-inner');
      const task = store.getTask(taskId);
      if (task) renderCardDetails(inner, task);
    }
  }
}

function renderCardDetails(container, task) {
  const logs = store.getTaskLogs(task.id);
  container.innerHTML = '';

  if (logs.length === 0) {
    container.innerHTML = '<p style="padding:12px 0;color:var(--text4);font-size:14px;text-align:center">暂无记录</p>';
    return;
  }

  logs.forEach((log, idx) => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const delBg = document.createElement('div');
    delBg.className = 'log-delete-bg';
    delBg.textContent = '删除';

    const content = document.createElement('div');
    content.className = 'log-entry-content';

    const idxEl = document.createElement('span');
    idxEl.className = 'log-idx';
    idxEl.textContent = `第 ${idx + 1} 组`;

    const valEl = document.createElement('span');
    valEl.className = 'log-val';
    valEl.textContent = `${log.value} ${task.unit}`;

    const timeEl = document.createElement('span');
    timeEl.className = 'log-time';
    const t = new Date(log.timestamp);
    timeEl.textContent = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;

    content.appendChild(idxEl);
    content.appendChild(valEl);
    content.appendChild(timeEl);
    entry.appendChild(delBg);
    entry.appendChild(content);
    container.appendChild(entry);

    initSwipeToDelete(entry, content, delBg, () => {
      showConfirm('删除记录', `确定删除第 ${idx + 1} 组记录？`, () => {
        store.deleteLog(task.id, todayStr(), idx);
        haptic();
        renderTodayView();
        renderInsightsView();
      });
    });
  });
}

/* ====== Swipe-to-Delete ====== */
function initSwipeToDelete(entry, content, delBg, onDelete) {
  let startX = 0, currentX = 0, swiping = false;

  content.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    currentX = 0;
    swiping = false;
    content.style.transition = 'none';
  }, { passive: true });

  content.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    if (dx > 0) return;
    swiping = true;
    currentX = Math.max(dx, -80);
    content.style.transform = `translateX(${currentX}px)`;
  }, { passive: true });

  content.addEventListener('touchend', () => {
    content.style.transition = 'transform .25s ease';
    if (currentX < -40) {
      content.style.transform = 'translateX(-72px)';
      entry.classList.add('swiped');
    } else {
      content.style.transform = '';
      entry.classList.remove('swiped');
    }
  });

  delBg.addEventListener('click', onDelete);

  document.addEventListener('touchstart', e => {
    if (!entry.contains(e.target) && entry.classList.contains('swiped')) {
      content.style.transition = 'transform .25s ease';
      content.style.transform = '';
      entry.classList.remove('swiped');
    }
  }, { passive: true });
}

/* ====== Record Modal ====== */
function bindRecordModal() {
  $('record-overlay').addEventListener('click', closeRecordModal);
  const slider = $('record-slider');
  slider.addEventListener('input', () => {
    $('record-val').textContent = slider.value;
    updateSliderFill(slider);
  });
  $('record-confirm').addEventListener('click', confirmRecord);
}

function updateSliderFill(slider) {
  const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
  slider.style.setProperty('--fill', pct + '%');
}

function openRecordModal(taskId) {
  recordingTaskId = taskId;
  const task = store.getTask(taskId);
  if (!task) return;

  $('record-title').textContent = `记录 · ${task.name}`;
  $('record-unit').textContent = task.unit;
  $('slider-min').textContent = task.sliderMin;
  $('slider-max').textContent = task.sliderMax;

  const slider = $('record-slider');
  slider.min = task.sliderMin;
  slider.max = task.sliderMax;

  const logs = store.getTaskLogs(task.id);
  const defaultVal = logs.length > 0
    ? logs[logs.length - 1].value
    : Math.round((task.sliderMin + task.sliderMax) / 2);
  slider.value = defaultVal;
  $('record-val').textContent = defaultVal;
  updateSliderFill(slider);

  showOverlay('record-overlay');
  showSheet('record-modal');
}

function closeRecordModal() {
  hideOverlay('record-overlay');
  hideSheet('record-modal');
  recordingTaskId = null;
}

function confirmRecord() {
  if (!recordingTaskId) return;
  const val = Number($('record-slider').value);
  const result = store.addLog(recordingTaskId, val);
  const task = store.getTask(recordingTaskId);
  closeRecordModal();
  haptic();
  renderTodayView();
  renderInsightsView();

  const undoInfo = { ...result };
  showToast(`已记录 ${val} ${task.unit}`, () => {
    store.deleteLog(undoInfo.taskId, undoInfo.date, undoInfo.index);
    renderTodayView();
    renderInsightsView();
  });
}

/* ====== Task Form ====== */
function bindTaskForm() {
  $('add-task-btn').addEventListener('click', () => openTaskForm());
  $('form-cancel').addEventListener('click', closeTaskForm);
  $('form-save').addEventListener('click', saveTask);
  $('form-overlay').addEventListener('click', closeTaskForm);
  $('form-delete').addEventListener('click', () => {
    if (editingTaskId) {
      const task = store.getTask(editingTaskId);
      showConfirm('删除任务', `删除「${task?.name}」后，该任务的所有历史训练记录也将被清除，且无法恢复。`, () => {
        store.deleteTask(editingTaskId);
        haptic();
        closeTaskForm();
        renderTodayView();
        renderInsightsView();
        renderManageView();
      });
    }
  });

  $('unit-group').addEventListener('click', e => {
    const btn = e.target.closest('.unit-btn');
    if (!btn) return;
    $('unit-group').querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedUnit = btn.dataset.unit;
    $('f-goal-unit').textContent = selectedUnit;
  });
}

function openTaskForm(taskId) {
  editingTaskId = taskId || null;
  const isEdit = !!taskId;

  $('form-title').textContent = isEdit ? '编辑训练任务' : '新建训练任务';
  $('form-delete').hidden = !isEdit;

  if (isEdit) {
    const t = store.getTask(taskId);
    $('f-name').value = t.name;
    $('f-min').value = t.sliderMin;
    $('f-max').value = t.sliderMax;
    $('f-goal').value = t.dailyGoal || '';
    selectedUnit = t.unit;
  } else {
    $('f-name').value = '';
    $('f-min').value = 1;
    $('f-max').value = 50;
    $('f-goal').value = '';
    selectedUnit = '个';
  }

  $('unit-group').querySelectorAll('.unit-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.unit === selectedUnit);
  });
  $('f-goal-unit').textContent = selectedUnit;

  showOverlay('form-overlay');
  showSheet('task-form');
  setTimeout(() => $('f-name').focus(), 400);
}

function closeTaskForm() {
  hideOverlay('form-overlay');
  hideSheet('task-form');
  editingTaskId = null;
  $('f-name').blur();
}

function saveTask() {
  const name = $('f-name').value.trim();
  if (!name) {
    $('f-name').focus();
    return;
  }
  const data = {
    name,
    unit: selectedUnit,
    sliderMin: Math.max(0, Number($('f-min').value) || 0),
    sliderMax: Math.max(1, Number($('f-max').value) || 50),
    dailyGoal: Number($('f-goal').value) || null
  };
  if (data.sliderMin >= data.sliderMax) data.sliderMax = data.sliderMin + 1;

  if (editingTaskId) {
    store.updateTask(editingTaskId, data);
  } else {
    store.addTask(data);
  }

  closeTaskForm();
  renderTodayView();
  renderInsightsView();
  renderManageView();
}

/* ====== Manage View ====== */
function renderManageView() {
  if (currentView !== 'manage') return;
  const tasks = store.getTasks();
  manageList.innerHTML = '';
  manageEmpty.hidden = tasks.length > 0;

  tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'manage-item';
    item.dataset.taskId = task.id;

    const info = document.createElement('div');
    info.className = 'manage-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'manage-name';
    nameEl.textContent = task.name;
    const meta = document.createElement('div');
    meta.className = 'manage-meta';
    let metaText = `${task.unit} · ${task.sliderMin}~${task.sliderMax}`;
    if (task.dailyGoal) metaText += ` · 目标 ${task.dailyGoal}${task.unit}`;
    meta.textContent = metaText;
    info.appendChild(nameEl);
    info.appendChild(meta);

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 5h10M4 9h10M4 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

    item.appendChild(info);
    item.appendChild(handle);

    item.addEventListener('click', e => {
      if (e.target.closest('.drag-handle')) return;
      openTaskForm(task.id);
    });

    manageList.appendChild(item);
  });
}

/* ====== Drag & Drop ====== */
function initDragDrop() {
  const list = manageList;
  let dragItem = null, startY = 0, offsetY = 0;
  let items = [], startIndex = -1, placeholder = null;

  list.addEventListener('touchstart', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const item = handle.closest('.manage-item');
    if (!item) return;

    e.preventDefault();
    dragItem = item;
    items = [...list.querySelectorAll('.manage-item')];
    startIndex = items.indexOf(item);
    startY = e.touches[0].clientY;
    const rect = item.getBoundingClientRect();
    offsetY = startY - rect.top;

    placeholder = document.createElement('div');
    placeholder.style.height = rect.height + 'px';
    placeholder.style.transition = 'none';

    item.style.position = 'fixed';
    item.style.width = rect.width + 'px';
    item.style.left = rect.left + 'px';
    item.style.top = rect.top + 'px';
    item.style.zIndex = '20';
    item.classList.add('dragging');
    list.insertBefore(placeholder, item.nextSibling);
  }, { passive: false });

  list.addEventListener('touchmove', e => {
    if (!dragItem) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    dragItem.style.top = (y - offsetY) + 'px';

    const siblings = [...list.querySelectorAll('.manage-item:not(.dragging)')];
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid && placeholder.nextSibling !== sib) {
        list.insertBefore(placeholder, sib);
        break;
      } else if (y >= mid && sib.nextSibling === placeholder) {
        list.insertBefore(placeholder, sib.nextSibling?.nextSibling || null);
      }
    }
  }, { passive: false });

  list.addEventListener('touchend', () => {
    if (!dragItem) return;
    list.insertBefore(dragItem, placeholder);
    placeholder.remove();
    dragItem.style.position = '';
    dragItem.style.width = '';
    dragItem.style.left = '';
    dragItem.style.top = '';
    dragItem.style.zIndex = '';
    dragItem.classList.remove('dragging');

    const newOrder = [...list.querySelectorAll('.manage-item')].map(el => el.dataset.taskId);
    store.reorderTasks(newOrder);
    dragItem = null;
    placeholder = null;
  });
}

/* ====== Export ====== */
function bindExport() {
  $('export-btn').addEventListener('click', async () => {
    const data = store.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const file = new File([blob], `tally-backup-${todayStr()}.json`, { type: 'application/json' });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Tally 数据备份' });
        return;
      }
    } catch (_) {}

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('数据已导出');
  });
}

/* ====== Insights View ====== */
function bindPeriodSelector() {
  $('period-selector').addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    $('period-selector').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartPeriod = Number(btn.dataset.days);
    renderInsightsView();
  });
}

function renderInsightsView() {
  if (currentView !== 'insights') return;
  const tasks = store.getTasks();
  chartsContainer.innerHTML = '';

  if (tasks.length === 0) {
    insightsEmpty.hidden = false;
    return;
  }
  insightsEmpty.hidden = true;

  tasks.forEach(task => {
    const data = store.getTaskDailyTotals(task.id, chartPeriod);
    const hasData = data.some(d => d.value > 0);

    const card = document.createElement('div');
    card.className = 'chart-card';

    const title = document.createElement('div');
    title.className = 'chart-title';
    title.textContent = task.name;
    card.appendChild(title);

    if (!hasData) {
      const hint = document.createElement('div');
      hint.style.cssText = 'padding:20px 0;text-align:center;color:var(--text4);font-size:13px';
      hint.textContent = `最近 ${chartPeriod} 天无记录`;
      card.appendChild(hint);
    } else {
      const canvas = document.createElement('canvas');
      canvas.className = 'chart-canvas';
      card.appendChild(canvas);
      requestAnimationFrame(() => drawChart(canvas, data, task.unit, false));

      card.addEventListener('click', () => openFullscreenChart(task, data));
    }

    chartsContainer.appendChild(card);
  });
}

function getChartColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    bar: s.getPropertyValue('--accent').trim() || '#007AFF',
    barEmpty: s.getPropertyValue('--sep').trim() || 'rgba(60,60,67,0.12)',
    text: s.getPropertyValue('--text3').trim() || '#8E8E93',
    line: s.getPropertyValue('--sep').trim() || 'rgba(60,60,67,0.12)',
  };
}

function drawChart(canvas, data, unit, isFullscreen) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const colors = getChartColors();
  const pad = { top: 16, right: 8, bottom: 24, left: isFullscreen ? 44 : 36 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const n = data.length;
  const gap = n > 60 ? 0.5 : n > 30 ? 1 : 2;
  const barW = Math.max(1, (cw - gap * (n - 1)) / n);

  ctx.fillStyle = colors.line;
  ctx.fillRect(pad.left, pad.top + ch, cw, 0.5);

  data.forEach((d, i) => {
    const x = pad.left + i * (barW + gap);
    const barH = d.value > 0 ? Math.max(2, (d.value / maxVal) * ch) : 0;
    const y = pad.top + ch - barH;

    if (d.value > 0) {
      ctx.fillStyle = colors.bar;
      const r = Math.min(barW / 2, 3);
      roundedRect(ctx, x, y, barW, barH, r, 0);
      ctx.fill();
    }
  });

  ctx.fillStyle = colors.text;
  ctx.font = `500 ${isFullscreen ? 12 : 10}px -apple-system,sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(maxVal, pad.left - 6, pad.top + 10);
  ctx.fillText('0', pad.left - 6, pad.top + ch + 4);

  ctx.textAlign = 'center';
  const labelInterval = n <= 30 ? 7 : n <= 90 ? 14 : 30;
  for (let i = 0; i < n; i += labelInterval) {
    const d = data[i];
    const x = pad.left + i * (barW + gap) + barW / 2;
    const parts = d.date.split('-');
    ctx.fillText(`${parseInt(parts[1])}/${parseInt(parts[2])}`, x, pad.top + ch + 16);
  }

  canvas._chartData = data;
  canvas._chartUnit = unit;
  canvas._chartMeta = { pad, barW, gap, maxVal, cw, ch };
}

function roundedRect(ctx, x, y, w, h, rTop, rBottom) {
  ctx.beginPath();
  ctx.moveTo(x + rTop, y);
  ctx.lineTo(x + w - rTop, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rTop);
  ctx.lineTo(x + w, y + h - rBottom);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rBottom, y + h);
  ctx.lineTo(x + rBottom, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rBottom);
  ctx.lineTo(x, y + rTop);
  ctx.quadraticCurveTo(x, y, x + rTop, y);
  ctx.closePath();
}

/* ====== Fullscreen Chart ====== */
function openFullscreenChart(task, data) {
  const fs = $('fs-chart');
  $('fs-title').textContent = `${task.name} · 最近${chartPeriod}天`;
  fs.hidden = false;
  document.body.style.overflow = 'hidden';

  const canvas = $('fs-canvas');
  const tooltip = $('fs-tooltip');
  tooltip.hidden = true;

  requestAnimationFrame(() => drawChart(canvas, data, task.unit, true));

  const resizeHandler = () => {
    requestAnimationFrame(() => drawChart(canvas, data, task.unit, true));
  };
  window.addEventListener('resize', resizeHandler);

  canvas.ontouchmove = canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const meta = canvas._chartMeta;
    if (!meta) return;
    const idx = Math.floor((x - meta.pad.left) / (meta.barW + meta.gap));
    if (idx >= 0 && idx < data.length) {
      const d = data[idx];
      const parts = d.date.split('-');
      tooltip.textContent = `${parseInt(parts[1])}月${parseInt(parts[2])}日: ${d.value} ${task.unit}`;
      tooltip.hidden = false;
      tooltip.style.left = Math.min(clientX + 10, window.innerWidth - 130) + 'px';
      tooltip.style.top = (clientY - 40) + 'px';
    }
  };
  canvas.ontouchend = canvas.onmouseleave = () => { tooltip.hidden = true; };

  $('fs-close').onclick = () => {
    fs.hidden = true;
    document.body.style.overflow = '';
    window.removeEventListener('resize', resizeHandler);
    canvas.ontouchmove = canvas.onmousemove = canvas.ontouchend = canvas.onmouseleave = null;
    tooltip.hidden = true;
  };
}

/* ====== Confirm Dialog ====== */
let confirmCallback = null;

function bindConfirm() {
  $('confirm-no').addEventListener('click', hideConfirm);
  $('confirm-overlay').addEventListener('click', hideConfirm);
  $('confirm-yes').addEventListener('click', () => {
    hideConfirm();
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });
}

function showConfirm(title, msg, onConfirm) {
  $('confirm-title').textContent = title;
  $('confirm-msg').textContent = msg;
  confirmCallback = onConfirm;
  $('confirm-overlay').hidden = false;
  $('confirm-dialog').hidden = false;
  requestAnimationFrame(() => {
    $('confirm-overlay').classList.add('show');
    $('confirm-dialog').classList.add('show');
  });
}

function hideConfirm() {
  $('confirm-overlay').classList.remove('show');
  $('confirm-dialog').classList.remove('show');
  setTimeout(() => {
    $('confirm-overlay').hidden = true;
    $('confirm-dialog').hidden = true;
  }, 200);
}

/* ====== Toast ====== */
function bindToast() {
  $('toast-undo').addEventListener('click', () => {
    if (undoAction) undoAction();
    hideToast();
  });
}

function showToast(msg, undo) {
  clearTimeout(undoTimer);
  undoAction = undo || null;
  $('toast-msg').textContent = msg;
  $('toast-undo').hidden = !undo;
  $('toast').hidden = false;
  requestAnimationFrame(() => $('toast').classList.add('show'));
  undoTimer = setTimeout(hideToast, undo ? 4000 : 2500);
}

function hideToast() {
  clearTimeout(undoTimer);
  $('toast').classList.remove('show');
  setTimeout(() => { $('toast').hidden = true; }, 250);
  undoAction = null;
}

/* ====== Overlay & Sheet helpers ====== */
function showOverlay(id) {
  $(id).hidden = false;
  requestAnimationFrame(() => $(id).classList.add('show'));
}
function hideOverlay(id) {
  $(id).classList.remove('show');
  setTimeout(() => { $(id).hidden = true; }, 250);
}
function showSheet(id) {
  $(id).hidden = false;
  requestAnimationFrame(() => $(id).classList.add('show'));
}
function hideSheet(id) {
  $(id).classList.remove('show');
  setTimeout(() => { $(id).hidden = true; }, 400);
}

/* ====== Haptic ====== */
function haptic() {
  try { navigator?.vibrate?.(10); } catch (_) {}
}
