const STORAGE_KEY = 'tally_data';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

class TallyStore {
  constructor() {
    this._data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (!d.tasks) d.tasks = [];
        if (!d.logs) d.logs = {};
        return d;
      }
    } catch (e) {
      console.error('数据加载失败:', e);
    }
    return { tasks: [], logs: {} };
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      console.error('数据保存失败:', e);
    }
  }

  /* ====== Tasks ====== */

  getTasks() {
    return [...this._data.tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getTask(id) {
    return this._data.tasks.find(t => t.id === id) || null;
  }

  addTask({ name, unit, sliderMin, sliderMax, dailyGoal }) {
    const task = {
      id: generateId(),
      name,
      unit: unit || '个',
      sliderMin: Number(sliderMin) || 1,
      sliderMax: Number(sliderMax) || 50,
      dailyGoal: dailyGoal ? Number(dailyGoal) : null,
      sortOrder: this._data.tasks.length,
      createdAt: new Date().toISOString()
    };
    this._data.tasks.push(task);
    this._save();
    return task;
  }

  updateTask(id, updates) {
    const t = this._data.tasks.find(t => t.id === id);
    if (!t) return null;
    if (updates.name !== undefined) t.name = updates.name;
    if (updates.unit !== undefined) t.unit = updates.unit;
    if (updates.sliderMin !== undefined) t.sliderMin = Number(updates.sliderMin);
    if (updates.sliderMax !== undefined) t.sliderMax = Number(updates.sliderMax);
    if (updates.dailyGoal !== undefined) t.dailyGoal = updates.dailyGoal ? Number(updates.dailyGoal) : null;
    this._save();
    return t;
  }

  deleteTask(id) {
    this._data.tasks = this._data.tasks.filter(t => t.id !== id);
    for (const date in this._data.logs) {
      delete this._data.logs[date][id];
      if (Object.keys(this._data.logs[date]).length === 0) {
        delete this._data.logs[date];
      }
    }
    this._save();
  }

  reorderTasks(orderedIds) {
    orderedIds.forEach((id, i) => {
      const t = this._data.tasks.find(t => t.id === id);
      if (t) t.sortOrder = i;
    });
    this._save();
  }

  /* ====== Logs ====== */

  addLog(taskId, value, date) {
    date = date || todayStr();
    if (!this._data.logs[date]) this._data.logs[date] = {};
    if (!this._data.logs[date][taskId]) this._data.logs[date][taskId] = [];
    const entry = { value: Number(value), timestamp: new Date().toISOString() };
    this._data.logs[date][taskId].push(entry);
    this._save();
    return { date, taskId, index: this._data.logs[date][taskId].length - 1, entry };
  }

  deleteLog(taskId, date, index) {
    const arr = this._data.logs[date]?.[taskId];
    if (!arr || index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
    if (arr.length === 0) delete this._data.logs[date][taskId];
    if (this._data.logs[date] && Object.keys(this._data.logs[date]).length === 0) {
      delete this._data.logs[date];
    }
    this._save();
  }

  getTaskLogs(taskId, date) {
    date = date || todayStr();
    return this._data.logs[date]?.[taskId] || [];
  }

  getDateLogs(date) {
    return this._data.logs[date] || {};
  }

  /* ====== Statistics ====== */

  getTaskDailyTotals(taskId, days) {
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = formatDateStr(d);
      const logs = this._data.logs[ds]?.[taskId] || [];
      const total = logs.reduce((s, l) => s + l.value, 0);
      result.push({ date: ds, value: total });
    }
    return result;
  }

  getTaskSummary(taskId, date) {
    const logs = this.getTaskLogs(taskId, date);
    if (logs.length === 0) return { sets: 0, total: 0, avg: 0 };
    const total = logs.reduce((s, l) => s + l.value, 0);
    return {
      sets: logs.length,
      total,
      avg: Math.round(total / logs.length * 10) / 10
    };
  }

  /* ====== Export ====== */

  exportData() {
    return JSON.stringify(this._data, null, 2);
  }
}
