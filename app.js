// ═══════════════════════════════════════════
//  FARMWATCH — Full App Logic
// ═══════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── App State ───────────────────────────────
const app = {
  user: null,
  theme: 'dark',
  accent: '#2eea7a',
  accent2: '#19c866',
  demoRunning: false,
  demoInterval: null,
  telemetryRows: [],
  allAlerts: [],
  fields: [],
  notes: [],
  calTasks: [],
  history: [],
  thresholds: { soil: 30, temp: 75, harvest: 80 },
  prevReadings: null,
};

// ── Storage helpers ──────────────────────────
function save(key, val) { try { localStorage.setItem('fw_' + key, JSON.stringify(val)); } catch(e){} }
function load(key, def)  { try { const v = localStorage.getItem('fw_' + key); return v ? JSON.parse(v) : def; } catch(e){ return def; } }

// ── Toast ────────────────────────────────────
function toast(msg, duration = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
function switchAuth(mode) {
  $('#loginForm').classList.toggle('active', mode === 'login');
  $('#registerForm').classList.toggle('active', mode === 'register');
}

function handleLogin() {
  const email = $('#loginEmail').value.trim();
  const pass  = $('#loginPassword').value;
  if (!email || !pass) { toast('⚠️ Please fill in all fields'); return; }

  // Check saved users
  const users = load('users', []);
  const user = users.find(u => u.email === email && u.password === pass);
  if (!user) { toast('❌ Invalid email or password'); return; }

  loginSuccess(user);
}

function handleRegister() {
  const first    = $('#regFirst').value.trim();
  const last     = $('#regLast').value.trim();
  const email    = $('#regEmail').value.trim();
  const farmName = $('#regFarm').value.trim();
  const location = $('#regLocation').value.trim();
  const pass     = $('#regPassword').value;

  if (!first || !email || !farmName || !pass) { toast('⚠️ Please fill required fields'); return; }

  const users = load('users', []);
  if (users.find(u => u.email === email)) { toast('⚠️ Account already exists'); return; }

  const user = { id: Date.now(), first, last, email, farmName, location, password: pass };
  users.push(user);
  save('users', users);

  toast('✅ Account created! Welcome, ' + first);
  loginSuccess(user);
}

function quickDemo() {
  loginSuccess({
    id: 'demo',
    first: 'Demo',
    last: 'Farmer',
    email: 'demo@farmwatch.com',
    farmName: 'Demo Farm',
    location: 'Kampala, Uganda',
  });
  setTimeout(() => startDemo(), 600);
}

function loginSuccess(user) {
  app.user = user;
  save('lastUser', user);

  // Set UI
  $('#userAvatar').textContent = user.first[0].toUpperCase();
  $('#userName').textContent = user.first + ' ' + (user.last || '');
  $('#sidebarFarmName').textContent = user.farmName || 'My Farm';
  $('#sidebarFarmLoc').textContent  = user.location || '—';
  $('#settingFarmName') && ($('#settingFarmName').value = user.farmName || '');
  $('#settingLocation') && ($('#settingLocation').value = user.location || '');

  // Load user data
  app.fields   = load('fields_'   + user.id, []);
  app.notes    = load('notes_'    + user.id, []);
  app.calTasks = load('tasks_'    + user.id, getDefaultTasks());
  app.history  = load('history_'  + user.id, []);
  app.thresholds = load('thresh_' + user.id, { soil: 30, temp: 75, harvest: 80 });

  // Switch screens
  $('#authScreen').classList.remove('active');
  $('#appScreen').classList.add('active');

  renderFields();
  renderHistory();
  renderCalendar();
  renderNotes();
  renderAlerts();
  updateWeather();
  updateDataCount();
}

function logout() {
  if (app.demoRunning) stopDemo();
  app.user = null;
  $('#appScreen').classList.remove('active');
  $('#authScreen').classList.add('active');
  toast('👋 Signed out');
}

// Auto-login from last session
function tryAutoLogin() {
  const user = load('lastUser', null);
  if (user) loginSuccess(user);
}

// ═══════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════
const pageTitles = {
  dashboard: '📊 Dashboard',
  fields:    '🗺️ My Fields',
  history:   '📈 History',
  calendar:  '📅 Crop Calendar',
  notes:     '📝 Farm Notes',
  alerts:    '🔔 Alerts',
  settings:  '⚙️ Settings',
  profit: '💰 Profit Tracker',
  chat:      '🤖 AI Assistant',
};

function gotoPage(name, linkEl) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-link').forEach(l => l.classList.remove('active'));
  $('#page-' + name).classList.add('active');
  if (linkEl) linkEl.classList.add('active');
  $('#pageTitle').textContent = pageTitles[name] || name;

  // Close sidebar on mobile
  if (window.innerWidth < 768) $('#sidebar').classList.remove('open');

  if (name === 'history') renderHistory();
  if (name === 'alerts')  renderAlerts();
  if (name === 'settings') updateDataCount();
}

function toggleSidebar() {
  $('#sidebar').classList.toggle('open');
}

// ═══════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════
function setTheme(theme) {
  app.theme = theme;
  document.body.setAttribute('data-theme', theme);
  save('theme', theme);
}
function toggleTheme() {
  setTheme(app.theme === 'dark' ? 'light' : 'dark');
  toast(app.theme === 'dark' ? '🌙 Dark mode' : '☀️ Light mode');
}

function setAccent(color, color2, el) {
  app.accent  = color;
  app.accent2 = color2;
  document.documentElement.style.setProperty('--accent',   color);
  document.documentElement.style.setProperty('--accent-2', color2);
  $$('.swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  save('accent', { color, color2 });
  toast('🎨 Theme color updated');
}

function loadTheme() {
  const theme = load('theme', 'dark');
  setTheme(theme);
  const acc = load('accent', null);
  if (acc) {
    document.documentElement.style.setProperty('--accent',   acc.color);
    document.documentElement.style.setProperty('--accent-2', acc.color2);
  }
}

// ═══════════════════════════════════════════
//  WEATHER (simulated — realistic for Uganda)
// ═══════════════════════════════════════════
const weatherConditions = [
  { icon:'☀️',  temp:26, desc:'Sunny — Ideal for spraying or harvesting',      humid:55, wind:'8 km/h',  rain:'5%',  uv:'UV 7' },
  { icon:'⛅',  temp:24, desc:'Partly Cloudy — Good day for fieldwork',         humid:68, wind:'12 km/h', rain:'20%', uv:'UV 5' },
  { icon:'🌤️', temp:25, desc:'Mostly Clear — Monitor for afternoon showers',   humid:60, wind:'10 km/h', rain:'15%', uv:'UV 6' },
  { icon:'🌧️', temp:20, desc:'Rain expected — Avoid pesticide application',    humid:85, wind:'18 km/h', rain:'75%', uv:'UV 2' },
  { icon:'⛈️', temp:19, desc:'Thunderstorm alert — Keep equipment sheltered',  humid:90, wind:'28 km/h', rain:'90%', uv:'UV 1' },
  { icon:'🌦️', temp:22, desc:'Light showers — Irrigation not needed today',    humid:78, wind:'14 km/h', rain:'50%', uv:'UV 3' },
];

function updateWeather() {
  const w = weatherConditions[Math.floor(Math.random() * weatherConditions.length)];
  $('#weatherIcon').textContent  = w.icon;
  $('#weatherTemp').textContent  = w.temp + '°C';
  $('#weatherDesc').textContent  = w.desc;
  $('#wHumid').textContent = w.humid + '%';
  $('#wWind').textContent  = w.wind;
  $('#wRain').textContent  = w.rain;
  $('#wUV').textContent    = w.uv;
}

// ═══════════════════════════════════════════
//  SENSOR + TELEMETRY
// ═══════════════════════════════════════════
function badgeFor(module, pct, raw) {
  if (module === 'Soil Moisture')    return pct < 35 ? {label:'LOW',   cls:'badge-warn'} : {label:'OK',      cls:'badge-ok'};
  if (module === 'Temperature')      return raw > 600 ? {label:'HIGH',  cls:'badge-warn'} : {label:'OK',      cls:'badge-ok'};
  if (module === 'Harvest Readiness') return raw > 800 ? {label:'READY', cls:'badge-ok'}  : {label:'GROWING', cls:'badge-warn'};
  if (module === 'Sorting Quality') {
    if (raw > 700) return {label:'GRADE A', cls:'badge-ok'};
    if (raw < 400) return {label:'GRADE B', cls:'badge-warn'};
    return {label:'MID', cls:'badge-warn'};
  }
  return {label:'OK', cls:'badge-ok'};
}

function nowTime() {
  return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function renderTelemetry(msg) {
  // Update KPI values
  const soilPct    = msg.soil.moisturePct;
  const tempPct    = msg.temp.levelPct;
  const harvestPct = msg.harvest.readinessPct;
  const sortPct    = msg.sorting.qualityPct;

  $('#liveText').textContent = app.demoRunning ? 'Demo Live' : 'Serial Live';
  $('#liveDot').classList.add('on');

  $('#soilMoisture').textContent = soilPct.toFixed(1);
  $('#tempPct').textContent      = tempPct.toFixed(1);
  $('#harvestPct').textContent   = harvestPct.toFixed(1);
  $('#sortPct').textContent      = sortPct.toFixed(1);

  // Meters
  $('#soilMeter').style.width    = soilPct + '%';
  $('#tempMeter').style.width    = tempPct + '%';
  $('#harvestMeter').style.width = harvestPct + '%';
  $('#sortMeter').style.width    = sortPct + '%';

  // Badges
  const soilB = badgeFor('Soil Moisture',     soilPct,    msg.soil.raw);
  const tempB = badgeFor('Temperature',        tempPct,    msg.temp.raw);
  const harvB = badgeFor('Harvest Readiness',  harvestPct, msg.harvest.raw);
  const sortB = badgeFor('Sorting Quality',    sortPct,    msg.sorting.raw);

  setKpiBadge('#soilStatus',    soilB);
  setKpiBadge('#tempStatus',    tempB);
  setKpiBadge('#harvestStatus', harvB);
  setKpiBadge('#sortStatus',    sortB);

  // Trends
  if (app.prevReadings) {
    setTrend('#soilTrend',    soilPct,    app.prevReadings.soil);
    setTrend('#tempTrend',    tempPct,    app.prevReadings.temp);
    setTrend('#harvestTrend', harvestPct, app.prevReadings.harvest);
    setTrend('#sortTrend',    sortPct,    app.prevReadings.sort);
  }
  app.prevReadings = { soil: soilPct, temp: tempPct, harvest: harvestPct, sort: sortPct };

  // Module states
  setModuleState('mod-planting',  'actPlanting',  msg.act.planting);
  setModuleState('mod-watering',  'actWatering',  msg.act.watering);
  setModuleState('mod-weeding',   'actWeeding',   msg.act.weeding);
  setModuleState('mod-packaging', 'actPackaging', msg.act.packaging);

  // Check thresholds and fire alerts
  checkThresholds(soilPct, tempPct, harvestPct, sortPct);

  // Add to telemetry table
  const t = nowTime();
  const newRows = [
    { module:'Soil Moisture',     raw:msg.soil.raw,    pct:soilPct.toFixed(1),    badge:soilB, time:t },
    { module:'Temperature',       raw:msg.temp.raw,    pct:tempPct.toFixed(1),    badge:tempB, time:t },
    { module:'Harvest Readiness', raw:msg.harvest.raw, pct:harvestPct.toFixed(1), badge:harvB, time:t },
    { module:'Sorting Quality',   raw:msg.sorting.raw, pct:sortPct.toFixed(1),    badge:sortB, time:t },
  ];
  app.telemetryRows = [...newRows, ...app.telemetryRows].slice(0, 20);
  renderTable();

  // Save to history (every reading)
  saveHistoryReading(msg, soilPct, tempPct, harvestPct, sortPct);

  // Update AI insight
  updateInsight(soilPct, tempPct, harvestPct, sortPct);
}

function setKpiBadge(sel, badge) {
  const el = $(sel);
  el.textContent = badge.label;
  el.className = 'kpi-badge ' + badge.cls;
}

function setTrend(sel, current, prev) {
  const el = $(sel);
  if (!el) return;
  const diff = (current - prev).toFixed(1);
  if (diff > 0) { el.textContent = `↑ +${diff}% since last reading`; el.style.color = 'var(--accent)'; }
  else if (diff < 0) { el.textContent = `↓ ${diff}% since last reading`; el.style.color = 'var(--warn)'; }
  else { el.textContent = '→ Stable'; el.style.color = 'var(--text-2)'; }
}

function setModuleState(cardId, labelId, active) {
  const card  = $('#' + cardId);
  const label = $('#' + labelId);
  if (!card || !label) return;
  label.textContent = active ? 'Active' : 'Idle';
  label.style.color = active ? 'var(--accent)' : 'var(--text-2)';
  card.classList.toggle('active-mod', active);
}

function renderTable() {
  $('#telemetryTbody').innerHTML = app.telemetryRows.map(r => `
    <tr>
      <td>${r.module}</td>
      <td>${r.raw}</td>
      <td><strong>${r.pct}%</strong></td>
      <td class="${r.badge.cls}">${r.badge.label}</td>
      <td>${r.time}</td>
    </tr>`).join('');
}

// ─ Threshold alerts ──────────────────────────
let lastAlertTime = {};
function checkThresholds(soil, temp, harvest, sort) {
  const now = Date.now();
  const cooldown = 15000; // 15 seconds between same alert

  if (soil < app.thresholds.soil && (!lastAlertTime.soil || now - lastAlertTime.soil > cooldown)) {
    fireAlert('Soil Moisture', `⚠️ Soil moisture is low (${soil.toFixed(1)}%) — consider watering`, 'warn');
    lastAlertTime.soil = now;
  }
  if (temp > app.thresholds.temp && (!lastAlertTime.temp || now - lastAlertTime.temp > cooldown)) {
    fireAlert('Temperature', `🌡️ High temperature detected (${temp.toFixed(1)}%) — check ventilation`, 'warn');
    lastAlertTime.temp = now;
  }
  if (harvest > app.thresholds.harvest && (!lastAlertTime.harvest || now - lastAlertTime.harvest > cooldown)) {
    fireAlert('Harvest Readiness', `🌾 Crop is ready for harvest (${harvest.toFixed(1)}%)!`, 'ok');
    lastAlertTime.harvest = now;
  }
}

function fireAlert(module, message, severity = 'warn') {
  const alert = { module, message, severity, time: nowTime(), date: new Date().toLocaleDateString() };
  app.allAlerts.unshift(alert);
  app.allAlerts = app.allAlerts.slice(0, 50);

  // Update badge count
  const badge = $('#alertBadge');
  badge.textContent = app.allAlerts.length;
  badge.classList.add('show');

  // Add to dashboard alerts list
  addEventToList(alert);
}

function addEventToList(alert) {
  const ul = $('#alertsList');
  const li = document.createElement('li');
  li.className = 'alert-item';
  li.innerHTML = `
    <div class="a-title">${alert.module.toUpperCase()}</div>
    <div class="a-sub">${alert.message}</div>
    <div class="a-time">${alert.time}</div>
  `;
  ul.prepend(li);
  while (ul.children.length > 6) ul.removeChild(ul.lastChild);
}

// ─ AI Insight banner ─────────────────────────
const insights = [
  (s,t,h,q) => s < 35 ? `💧 Soil is dry (${s.toFixed(0)}%) — water your crops soon to avoid stress.` : null,
  (s,t,h,q) => t > 75 ? `🌡️ Temperature is high (${t.toFixed(0)}%) — consider shade netting or early morning watering.` : null,
  (s,t,h,q) => h > 80 ? `🌾 Your crop is ${h.toFixed(0)}% ready for harvest — schedule your harvest team this week!` : null,
  (s,t,h,q) => q > 70 ? `📦 Produce quality is excellent (Grade A) — good time to approach premium buyers.` : null,
  (s,t,h,q) => s > 70 && t < 50 ? `✅ Conditions are ideal right now — great time to plant new seedlings.` : null,
  (s,t,h,q) => `📊 All systems nominal. Soil: ${s.toFixed(0)}%, Temp: ${t.toFixed(0)}%, Harvest: ${h.toFixed(0)}%.`,
];

function updateInsight(soil, temp, harvest, sort) {
  for (const fn of insights) {
    const msg = fn(soil, temp, harvest, sort);
    if (msg) { $('#insightText').textContent = msg; return; }
  }
}

// ═══════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════
function saveHistoryReading(msg, soil, temp, harvest, sort) {
  if (!app.user) return;
  const entry = {
    time: nowTime(),
    date: new Date().toLocaleDateString(),
    ts:   Date.now(),
    soil:    soil.toFixed(1),
    temp:    temp.toFixed(1),
    harvest: harvest.toFixed(1),
    sort:    sort.toFixed(1),
    soilRaw: msg.soil.raw,
  };
  app.history.unshift(entry);
  app.history = app.history.slice(0, 500);
  save('history_' + app.user.id, app.history);
}

function renderHistory() {
  const tbody = $('#historyTbody');
  const count = $('#historyCount');
  if (!tbody) return;

  count.textContent = app.history.length + ' records';
  $('#dataCount') && ($('#dataCount').textContent = app.history.length);

  if (app.history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-2);padding:30px">No data yet — start Demo Mode to generate readings</td></tr>';
    renderHistorySummary([]);
    return;
  }

  tbody.innerHTML = app.history.slice(0, 100).map((r, i) => `
    <tr>
      <td>${r.date} ${r.time}</td>
      <td>${r.soil}%</td>
      <td>${r.temp}%</td>
      <td>${r.harvest}%</td>
      <td>${r.sort}%</td>
      <td><button class="btn-sm" onclick="deleteHistory(${i})">🗑</button></td>
    </tr>`).join('');

  renderHistorySummary(app.history);
}

function renderHistorySummary(data) {
  const el = $('#historySummary');
  if (!el) return;
  if (data.length === 0) { el.innerHTML = ''; return; }

  const avg = (key) => (data.reduce((s, r) => s + parseFloat(r[key]), 0) / data.length).toFixed(1);
  el.innerHTML = `
    <div class="hist-stat"><div class="hist-stat-val">${data.length}</div><div class="hist-stat-label">Total Readings</div></div>
    <div class="hist-stat"><div class="hist-stat-val">${avg('soil')}%</div><div class="hist-stat-label">Avg Soil Moisture</div></div>
    <div class="hist-stat"><div class="hist-stat-val">${avg('harvest')}%</div><div class="hist-stat-label">Avg Harvest Readiness</div></div>
    <div class="hist-stat"><div class="hist-stat-val">${avg('sort')}%</div><div class="hist-stat-label">Avg Sort Quality</div></div>
  `;
}

function deleteHistory(i) {
  app.history.splice(i, 1);
  save('history_' + app.user.id, app.history);
  renderHistory();
  toast('🗑 Record deleted');
}

function clearHistory() {
  if (!confirm('Clear all history data?')) return;
  app.history = [];
  save('history_' + app.user.id, []);
  renderHistory();
  toast('🗑 History cleared');
}

function updateDataCount() {
  const el = $('#dataCount');
  if (el) el.textContent = app.history.length;
}

// ═══════════════════════════════════════════
//  EXPORT CSV
// ═══════════════════════════════════════════
function exportData() {
  if (app.history.length === 0) { toast('⚠️ No data to export yet'); return; }
  const header = 'Date,Time,Soil %,Temp %,Harvest %,Sort Quality %\n';
  const rows = app.history.map(r => `${r.date},${r.time},${r.soil},${r.temp},${r.harvest},${r.sort}`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `farmwatch_data_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('✅ CSV exported!');
}

// ═══════════════════════════════════════════
//  FIELDS
// ═══════════════════════════════════════════
function openAddField()  { $('#fieldModal').style.display = 'flex'; }
function closeFieldModal() { $('#fieldModal').style.display = 'none'; }

function saveField() {
  const name = $('#fieldName').value.trim();
  const crop = $('#fieldCrop').value;
  const size = $('#fieldSize').value;
  const date = $('#fieldDate').value;
  const notes = $('#fieldNotes').value.trim();
  if (!name) { toast('⚠️ Enter a field name'); return; }

  const field = { id: Date.now(), name, crop, size, date, notes, createdAt: new Date().toLocaleDateString() };
  app.fields.push(field);
  save('fields_' + app.user.id, app.fields);
  closeFieldModal();
  renderFields();
  updateTaskFieldDropdown();
  toast('✅ Field added: ' + name);

  // Clear inputs
  ['fieldName','fieldSize','fieldDate','fieldNotes'].forEach(id => $(('#'+id)).value = '');
}

function deleteField(id) {
  app.fields = app.fields.filter(f => f.id !== id);
  save('fields_' + app.user.id, app.fields);
  renderFields();
  toast('🗑 Field deleted');
}

const cropEmojis = { Maize:'🌽', Beans:'🫘', Tomatoes:'🍅', Cassava:'🌿', 'Sweet Potatoes':'🍠', Sorghum:'🌾', Groundnuts:'🥜', Cabbage:'🥬' };

function renderFields() {
  const grid = $('#fieldsGrid');
  if (!grid) return;
  if (app.fields.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><div class="empty-title">No fields yet</div><p>Add your first field to start tracking crops</p></div>`;
    return;
  }
  grid.innerHTML = app.fields.map(f => `
    <div class="field-card">
      <div class="field-card-top">
        <span class="field-crop-badge">${cropEmojis[f.crop] || '🌱'} ${f.crop}</span>
        <button class="btn-sm danger" onclick="deleteField(${f.id})">🗑</button>
      </div>
      <div class="field-name-big">${f.name}</div>
      <div class="field-meta">
        <span>📐 ${f.size || '—'} acres</span>
        <span>📅 Planted: ${f.date || '—'}</span>
      </div>
      ${f.notes ? `<div class="field-notes-preview">"${f.notes}"</div>` : ''}
    </div>`).join('');
}

// ═══════════════════════════════════════════
//  CROP CALENDAR
// ═══════════════════════════════════════════
function getDefaultTasks() {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0,10);
  const add = (n) => { const d = new Date(); d.setDate(d.getDate()+n); return fmt(d); };
  return [
    { id:1, name:'Apply fertilizer', date: add(2), field:'All Fields', type:'🧪 Fertilizing', done:false },
    { id:2, name:'Irrigation check', date: add(5), field:'All Fields', type:'💧 Watering', done:false },
    { id:3, name:'Pest inspection',  date: add(7), field:'All Fields', type:'🔬 Inspection', done:false },
    { id:4, name:'Weeding session',  date: add(10), field:'All Fields', type:'🌿 Weeding', done:false },
  ];
}

function openAddTask()  { updateTaskFieldDropdown(); $('#taskModal').style.display = 'flex'; }
function closeTaskModal() { $('#taskModal').style.display = 'none'; }

function updateTaskFieldDropdown() {
  const sel = $('#taskField');
  if (!sel) return;
  sel.innerHTML = '<option>All Fields</option>' + app.fields.map(f => `<option>${f.name}</option>`).join('');
}

function saveTask() {
  const name  = $('#taskName').value.trim();
  const date  = $('#taskDate').value;
  const field = $('#taskField').value;
  const type  = $('#taskType').value;
  if (!name || !date) { toast('⚠️ Enter task name and date'); return; }

  app.calTasks.push({ id: Date.now(), name, date, field, type, done: false });
  app.calTasks.sort((a,b) => a.date.localeCompare(b.date));
  save('tasks_' + app.user.id, app.calTasks);
  closeTaskModal();
  renderCalendar();
  toast('✅ Task added');
  $('#taskName').value = '';
}

function toggleTask(id) {
  const t = app.calTasks.find(t => t.id === id);
  if (t) { t.done = !t.done; save('tasks_' + app.user.id, app.calTasks); renderCalendar(); }
}

function deleteTask(id) {
  app.calTasks = app.calTasks.filter(t => t.id !== id);
  save('tasks_' + app.user.id, app.calTasks);
  renderCalendar();
  toast('🗑 Task removed');
}

function renderCalendar() {
  const grid = $('#calendarGrid');
  if (!grid) return;
  if (app.calTasks.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">No tasks yet</div><p>Plan your farming activities</p></div>`;
    return;
  }
  grid.innerHTML = app.calTasks.map(t => {
    const d    = new Date(t.date + 'T00:00');
    const day  = d.getDate();
    const mon  = d.toLocaleString('default', { month:'short' });
    const past = new Date(t.date) < new Date() && !t.done;
    return `
    <div class="cal-task ${t.done ? 'done' : ''}">
      <div class="cal-date-box" style="${past ? 'opacity:.5' : ''}">
        <div class="cal-day">${day}</div>
        <div class="cal-month">${mon}</div>
      </div>
      <div class="cal-task-info">
        <div class="cal-task-name">${t.done ? '✅ ' : ''}${t.name}</div>
        <div class="cal-task-meta">${t.type} · ${t.field}</div>
        <div class="cal-task-actions">
          <button class="btn-sm" onclick="toggleTask(${t.id})">${t.done ? 'Undo' : 'Mark done'}</button>
          <button class="btn-sm danger" onclick="deleteTask(${t.id})">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
//  NOTES
// ═══════════════════════════════════════════
function openAddNote()  { $('#noteModal').style.display = 'flex'; }
function closeNoteModal() { $('#noteModal').style.display = 'none'; }

function saveNote() {
  const title = $('#noteTitle').value.trim();
  const body  = $('#noteBody').value.trim();
  const tag   = $('#noteTag').value;
  if (!title || !body) { toast('⚠️ Fill in title and note'); return; }

  app.notes.unshift({ id: Date.now(), title, body, tag, time: new Date().toLocaleString() });
  save('notes_' + app.user.id, app.notes);
  closeNoteModal();
  renderNotes();
  toast('✅ Note saved');
  $('#noteTitle').value = '';
  $('#noteBody').value  = '';
}

function deleteNote(id) {
  app.notes = app.notes.filter(n => n.id !== id);
  save('notes_' + app.user.id, app.notes);
  renderNotes();
  toast('🗑 Note deleted');
}

function renderNotes() {
  const grid = $('#notesGrid');
  if (!grid) return;
  if (app.notes.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No notes yet</div><p>Record observations, pests spotted, market prices...</p></div>`;
    return;
  }
  grid.innerHTML = app.notes.map(n => `
    <div class="note-card">
      <button class="note-del" onclick="deleteNote(${n.id})">✕</button>
      <div class="note-tag">${n.tag}</div>
      <div class="note-title">${n.title}</div>
      <div class="note-body">${n.body}</div>
      <div class="note-time">📅 ${n.time}</div>
    </div>`).join('');
}

// ═══════════════════════════════════════════
//  ALERTS PAGE
// ═══════════════════════════════════════════
function renderAlerts() {
  const el = $('#alertsFull');
  if (!el) return;
  if (app.allAlerts.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-title">No alerts yet</div><p>Alerts appear here when sensor readings cross your thresholds</p></div>`;
    return;
  }
  el.innerHTML = app.allAlerts.map(a => `
    <div class="alert-full-item">
      <div class="alert-severity sev-${a.severity}"></div>
      <div>
        <div class="a-title">${a.module}</div>
        <div class="a-sub">${a.message}</div>
        <div class="a-time">${a.date} ${a.time}</div>
      </div>
    </div>`).join('');
}

function clearAlerts() {
  app.allAlerts = [];
  $('#alertBadge').classList.remove('show');
  renderAlerts();
  toast('🗑 Alerts cleared');
}

// ═══════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════
function saveThresholds() {
  app.thresholds = {
    soil:    parseInt($('#threshSoil').value)    || 30,
    temp:    parseInt($('#threshTemp').value)    || 75,
    harvest: parseInt($('#threshHarvest').value) || 80,
  };
  save('thresh_' + app.user.id, app.thresholds);
  toast('✅ Thresholds saved');
}

function saveProfile() {
  const name = $('#settingFarmName').value.trim();
  const loc  = $('#settingLocation').value.trim();
  if (app.user) {
    app.user.farmName = name;
    app.user.location = loc;
    save('lastUser', app.user);
    $('#sidebarFarmName').textContent = name || 'My Farm';
    $('#sidebarFarmLoc').textContent  = loc  || '—';
  }
  toast('✅ Profile saved');
}

// ═══════════════════════════════════════════
//  DEMO MODE
// ═══════════════════════════════════════════
const demoSim = {
  soil:    { raw: 450, dir: 1 },
  temp:    { raw: 300, dir: 1 },
  harvest: { raw: 750, dir: 1 },
  sort:    { raw: 650, dir: -1 },
};

function drift(sim, min, max, step = 20) {
  sim.raw += sim.dir * (Math.random() * step + 3);
  if (sim.raw >= max) sim.dir = -1;
  if (sim.raw <= min) sim.dir =  1;
  sim.raw = Math.round(Math.min(max, Math.max(min, sim.raw)));
  return sim.raw;
}

function buildDemoMsg() {
  const sr = drift(demoSim.soil,    50,  950);
  const tr = drift(demoSim.temp,    80,  920);
  const hr = drift(demoSim.harvest, 200, 1010);
  const qr = drift(demoSim.sort,    150, 980);
  return {
    telemetry: true,
    soil:    { raw: sr, moisturePct:  +((sr/1023)*100).toFixed(1) },
    temp:    { raw: tr, levelPct:     +((tr/1023)*100).toFixed(1) },
    harvest: { raw: hr, readinessPct: +((hr/1023)*100).toFixed(1) },
    sorting: { raw: qr, qualityPct:   +((qr/1023)*100).toFixed(1) },
    act: { planting: sr < 400, watering: tr > 500, weeding: hr < 600, packaging: qr > 700 },
  };
}

function startDemo() {
  if (app.demoRunning) return;
  app.demoRunning = true;
  $('#demoBtn').textContent = '⏹ Stop Demo';
  $('#demoBtn').style.color = 'var(--danger)';
  renderTelemetry(buildDemoMsg());
  app.demoInterval = setInterval(() => renderTelemetry(buildDemoMsg()), 2000);
  toast('▶ Demo Mode started — live data flowing!');
}

function stopDemo() {
  app.demoRunning = false;
  clearInterval(app.demoInterval);
  $('#demoBtn').textContent = '▶ Demo Mode';
  $('#demoBtn').style.color = '';
  $('#liveText').textContent = 'Idle';
  $('#liveDot').classList.remove('on');
  toast('⏹ Demo stopped');
}

function toggleDemo() {
  app.demoRunning ? stopDemo() : startDemo();
}

// ═══════════════════════════════════════════
//  WEB SERIAL
// ═══════════════════════════════════════════
async function connectSerial() {
  if (!('serial' in navigator)) { toast('❌ Web Serial needs Chrome or Edge'); return; }
  if (app.demoRunning) stopDemo();
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    $('#connectBtn').textContent = '⎓ Connected';
    toast('✅ Arduino connected!');
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    const reader = decoder.readable.getReader();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.event)     fireAlert(msg.module || 'System', msg.message || msg.event);
          if (msg.telemetry) renderTelemetry(msg);
        } catch {}
      }
    }
  } catch(e) {
    $('#connectBtn').textContent = '⎓ Connect';
    $('#liveText').textContent = 'Idle';
    $('#liveDot').classList.remove('on');
  }
}

const API_KEY = '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';
// ═══════════════════════════════════════════
//  PROFIT TRACKER
// ═══════════════════════════════════════════
let profitHistory = [];

function calculateProfit() {
  const seeds      = parseFloat($('#costSeeds').value)      || 0;
  const fertilizer = parseFloat($('#costFertilizer').value) || 0
  
  const other      = parseFloat($('#costOther').value)      || 0;
  const yield_kg   = parseFloat($('#harvestYield').value)   || 0;
  const rawPrice   = parseFloat($('#rawPrice').value)       || 0;
  const pkgPrice   = parseFloat($('#packagedPrice').value)  || 0;
  const crop       = $('#profitCrop').value;
  const season     = $('#profitSeason').value;

  if (yield_kg === 0) { toast('⚠️ Enter harvest yield first'); return; }

  const totalCosts  = seeds + fertilizer + other;
  const rawRevenue  = yield_kg * rawPrice;
  const pkgRevenue  = yield_kg * pkgPrice;
  const rawProfit   = rawRevenue - totalCosts;
  const pkgProfit   = pkgRevenue - totalCosts;

  const fmt = (n) => n.toLocaleString() + ' UGX';

  $('#profitRevRaw').innerHTML  = `<div style="font-size:12px;color:var(--text-2)">Raw Revenue</div><div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--accent)">${fmt(rawRevenue)}</div>`;
  $('#profitRevPkg').innerHTML  = `<div style="font-size:12px;color:var(--text-2)">Packaged Revenue</div><div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--cyan)">${fmt(pkgRevenue)}</div>`;
  $('#profitCostTotal').innerHTML = `<div style="font-size:12px;color:var(--text-2)">Total Costs</div><div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--danger)">${fmt(totalCosts)}</div>`;
  $('#profitNet').innerHTML     = `<div style="font-size:12px;color:var(--text-2)">Net Profit (Packaged)</div><div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:${pkgProfit >= 0 ? 'var(--accent)' : 'var(--danger)'}">${fmt(pkgProfit)}</div>`;

  $('#profitResult').style.display = 'grid';

  const entry = { season, crop, yield_kg, rawRevenue, pkgRevenue, totalCosts, rawProfit, pkgProfit };
  profitHistory.unshift(entry);
  if (app.user) save('profit_' + app.user.id, profitHistory);
  renderProfitHistory();
  toast('✅ Profit calculated!');
}

function renderProfitHistory() {
  const tbody = $('#profitHistoryTbody');
  if (!tbody) return;
  $('#seasonCount').textContent = profitHistory.length + ' seasons';
  if (profitHistory.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-2);padding:20px">No seasons recorded yet</td></tr>';
    return;
  }
  tbody.innerHTML = profitHistory.map(r => `
    <tr>
      <td>${r.season}</td>
      <td>${r.crop}</td>
      <td>${r.yield_kg} kg</td>
      <td>${r.rawRevenue.toLocaleString()} UGX</td>
      <td style="color:var(--danger)">${r.totalCosts.toLocaleString()} UGX</td>
      <td style="color:${r.pkgProfit >= 0 ? 'var(--accent)' : 'var(--danger)'};font-weight:800">${r.pkgProfit.toLocaleString()} UGX</td>
    </tr>`).join('');
}
function getSmartReply(msg) {
  const s = app.prevReadings?.soil?.toFixed(1) || 'unknown';
  const t = app.prevReadings?.temp?.toFixed(1) || 'unknown';
  const h = app.prevReadings?.harvest?.toFixed(1) || 'unknown';
  const q = app.prevReadings?.sort?.toFixed(1) || 'unknown';
  const m = msg.toLowerCase();

  if (m.includes('soil') || m.includes('moisture') || m.includes('water'))
    return `💧 Your soil moisture is currently ${s}%. ${parseFloat(s) < 35 ? 'This is critically low — irrigate immediately, preferably early morning to reduce evaporation. Apply 25-30mm of water.' : 'Moisture levels are healthy. Continue monitoring and water when it drops below 35%.'}`;
  
  if (m.includes('temp') || m.includes('heat') || m.includes('hot'))
    return `🌡️ Temperature level is at ${t}%. ${parseFloat(t) > 75 ? 'This is high — consider shade netting and water crops in the early morning. Avoid working in the field between 11am-3pm.' : 'Temperature is within normal range for Uganda. Keep monitoring.'}`;
  
  if (m.includes('harvest') || m.includes('ready') || m.includes('pick'))
    return `🌾 Harvest readiness is at ${h}%. ${parseFloat(h) > 80 ? 'Your crop is ready! Schedule your harvest team this week. Pick early morning for best quality.' : 'Crop is still growing. Expected to be ready when readiness exceeds 80%.'}`;
  
  if (m.includes('quality') || m.includes('sort') || m.includes('grade') || m.includes('pack'))
    return `📦 Sorting quality is at ${q}%. ${parseFloat(q) > 70 ? 'Excellent Grade A quality! Contact premium buyers in Kampala market now — prices are best for Grade A produce.' : 'Quality is mid-grade. Improve by harvesting at optimal time and handling carefully.'}`;
  
  if (m.includes('profit') || m.includes('money') || m.includes('sell') || m.includes('price'))
    return `💰 Current Kampala prices: Maize 1,200 UGX/kg, Tomatoes 800 UGX/kg, Beans 2,500 UGX/kg. With Grade A quality at ${q}%, you can negotiate premium prices. Consider packaging to increase value by 30-50%.`;
  
  if (m.includes('pest') || m.includes('disease') || m.includes('insect') || m.includes('bug'))
    return `🐛 For pest control in Uganda: inspect crops early morning when pests are active. Use neem oil spray as organic option. For severe infestations contact your local NAADS extension worker. Document any findings in Farm Notes.`;
  
  if (m.includes('fertiliz') || m.includes('nutrient') || m.includes('npk'))
    return `🧪 Based on your soil readings (${s}%), apply NPK fertilizer at planting and top-dress with CAN at 6 weeks. For Ugandan soils, DAP is recommended at planting. Always soil test first for best results.`;
  
  if (m.includes('weather') || m.includes('rain') || m.includes('forecast'))
    return `🌤️ Check your weather banner on the dashboard for today's conditions. For Uganda's climate, plant at start of rainy season (March-May or August-November). Avoid spraying before rain.`;
  
  if (m.includes('next season') || m.includes('improve') || m.includes('better'))
    return `📊 Based on this season's data — soil averaged ${s}%, harvest readiness reached ${h}%. Next season: improve irrigation schedule, target soil moisture above 60% consistently, and harvest when readiness exceeds 85% for maximum yield.`;

  return `🌱 I can help you with soil moisture (${s}%), temperature (${t}%), harvest readiness (${h}%), and sorting quality (${q}%). Ask me about watering, harvesting, pests, fertilizing, market prices, or how to improve next season!`;
}
async function sendChatMessage() {
  const input = $('#chatInput');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';

  const typing = document.createElement('div');
  typing.className = 'chat-typing';
  typing.id = 'typingIndicator';
  typing.textContent = 'AI is thinking...';
  $('#chatMessages').appendChild(typing);

  try {
    const reply = getSmartReply(msg);
    setTimeout(() => {
      document.getElementById('typingIndicator')?.remove();
      addChatBubble(reply, 'ai');
    }, 1500);
  } catch (err) {
    document.getElementById('typingIndicator')?.remove();
    addChatBubble('Sorry, I could not process that.', 'ai');
  }
}
function addChatBubble(text, role) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  div.innerHTML = `<div class="bubble-text">${text}</div>`;
  $('#chatMessages').appendChild(div);
  $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
}

$('#chatInput') && $('#chatInput').addEventListener('keypress', e => {
  if (e.key === 'Enter') sendChatMessage();
});

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
loadTheme();
tryAutoLogin();
window.addEventListener('online', () => {
  document.getElementById('offlineBanner').style.display = 'none';
});

window.addEventListener('offline', () => {
  document.getElementById('offlineBanner').style.display = 'block';
});
