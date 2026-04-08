import './style.css';
import { initLogger, log } from './logger';
import { checkForUpdates } from './updater';
import * as api from './api';
import type { Socket } from 'socket.io-client';
import { message as dialogMessage } from '@tauri-apps/plugin-dialog';

function showErrorDialog(msg: string) {
  dialogMessage(msg, { title: 'Lỗi', kind: 'error' });
}

function showInfoDialog(msg: string) {
  dialogMessage(msg, { title: 'Thông báo', kind: 'info' });
}

function showWarningDialog(msg: string) {
  dialogMessage(msg, { title: 'Cảnh báo', kind: 'warning' });
}

interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'staff';
}

interface TicketInfo {
  id: number;
  ticket_number: string;
  area_id: number;
  service_type_id: number;
  status: string;
  counter_id: number | null;
  counter_name?: string;
  service_type_name?: string;
}

let currentUser: UserInfo | null = null;
let currentCounterId: number | null = null;
let currentAreaId: number | null = null;
let currentServiceTypeId: number | null = null;
let currentServingTicket: TicketInfo | null = null;
let socket: Socket | null = null;
let activeTab: 'tab-single' | 'tab-multi' = 'tab-single';

// Multi-service state: tickets being served per service type
let multiServingTickets: TicketInfo[] = [];
let cachedServiceTypes: { id: number; name: string; prefix: string; is_active: boolean }[] = [];
let cachedCounters: { id: number; name: string; is_active: boolean }[] = [];
// Per-counter service selection: counterId -> serviceTypeId
const multiCounterMap = new Map<number, number>();

// DOM Elements
const loginScreen = document.getElementById('login-screen')!;
const counterScreen = document.getElementById('counter-screen')!;
const loginServerUrl = document.getElementById('login-server-url') as HTMLInputElement;
const loginUsername = document.getElementById('login-username') as HTMLInputElement;
const loginPassword = document.getElementById('login-password') as HTMLInputElement;
const loginError = document.getElementById('login-error')!;
const loginBtn = document.getElementById('login-btn')!;

const userDisplayName = document.getElementById('user-display-name')!;
const areaSelect = document.getElementById('area-select') as HTMLSelectElement;
const counterSelect = document.getElementById('counter-select') as HTMLSelectElement;
const serviceTypeSelect = document.getElementById('service-type-select') as HTMLSelectElement;

const currentTicketNumber = document.getElementById('current-ticket-number')!;
const currentServiceType = document.getElementById('current-service-type')!;
const currentCounterName = document.getElementById('current-counter-name')!;

const btnCallNext = document.getElementById('btn-call-next')!;
const btnRecall = document.getElementById('btn-recall')!;
const btnComplete = document.getElementById('btn-complete')!;
const btnSkip = document.getElementById('btn-skip')!;

const queueWaitingCount = document.getElementById('queue-waiting-count')!;
const queueWaitingList = document.getElementById('queue-waiting-list')!;
const statCompleted = document.getElementById('stat-completed')!;
const statWaiting = document.getElementById('stat-waiting')!;

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn') as NodeListOf<HTMLButtonElement>;
const tabSingle = document.getElementById('tab-single')!;
const tabMulti = document.getElementById('tab-multi')!;

// Multi-service DOM
const multiServingList = document.getElementById('multi-serving-list')!;
const multiServiceButtons = document.getElementById('multi-service-buttons')!;
const multiWaitingCount = document.getElementById('multi-waiting-count')!;
const multiWaitingList = document.getElementById('multi-waiting-list')!;

// Password modal
const passwordModal = document.getElementById('password-modal')!;
const oldPasswordInput = document.getElementById('old-password') as HTMLInputElement;
const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
const passwordError = document.getElementById('password-error')!;

// Init
async function init() {
  await initLogger();
  log.info('Counter app starting');

  // Hiển thị version trên title window
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const version = await getVersion();
    log.info('App version: ' + version);
    const title = `Queue - Gọi số v${version}`;
    document.title = title;
    await getCurrentWindow().setTitle(title);
  } catch { /* không phải Tauri */ }

  // Kiểm tra cập nhật tự động (silent)
  checkForUpdates(true);

  loginServerUrl.value = api.getServerUrl();

  if (api.getToken()) {
    try {
      currentUser = await api.getMe();
      log.info('Session restored for user: ' + currentUser?.username);
      await showCounterScreen();
      return;
    } catch {
      log.warn('Session expired, returning to login');
      api.clearAuth();
    }
  }

  showLoginScreen();
}

// Login
function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  counterScreen.classList.add('hidden');
  loginServerUrl.value = api.getServerUrl();
}

loginBtn.addEventListener('click', handleLogin);
loginPassword.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleLogin(); });

async function handleLogin() {
  if (loginBtn.classList.contains('loading')) return;
  loginBtn.classList.add('loading');
  loginBtn.setAttribute('disabled', '');
  loginBtn.textContent = 'Đang đăng nhập...';

  const serverUrl = loginServerUrl.value.trim();
  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  if (!serverUrl || !username || !password) {
    showError(loginError, 'Vui lòng nhập đầy đủ thông tin');
    loginBtn.classList.remove('loading');
    loginBtn.removeAttribute('disabled');
    loginBtn.textContent = 'Đăng nhập';
    return;
  }

  api.setServerUrl(serverUrl);

  try {
    log.info('Login attempt: ' + username);
    currentUser = await api.login(username, password);
    log.info('Login successful: ' + currentUser?.username);
    loginPassword.value = '';
    hideError(loginError);
    await showCounterScreen();
  } catch (err: any) {
    log.warn('Login failed: ' + err.message);
    showError(loginError, err.message);
  }

  loginBtn.classList.remove('loading');
  loginBtn.removeAttribute('disabled');
  loginBtn.textContent = 'Đăng nhập';
}

// Counter Screen
async function showCounterScreen() {
  loginScreen.classList.add('hidden');
  counterScreen.classList.remove('hidden');

  userDisplayName.textContent = currentUser?.display_name || '';

  await loadAreas();

  // Restore saved area
  const savedArea = localStorage.getItem('counter_area_id');
  if (savedArea) {
    areaSelect.value = savedArea;
    currentAreaId = Number(savedArea);
    await onAreaChanged();
  }

  // Restore saved counter
  const savedCounter = localStorage.getItem('counter_selected_id');
  if (savedCounter) {
    counterSelect.value = savedCounter;
    currentCounterId = Number(savedCounter);
  }

  // Restore saved service type
  const savedSt = localStorage.getItem('counter_service_type_id');
  if (savedSt) {
    serviceTypeSelect.value = savedSt;
    currentServiceTypeId = Number(savedSt) || null;
  }

  if (currentAreaId) {
    connectToArea();
    await updateQueueDisplay();
  }
}

async function loadAreas() {
  areaSelect.innerHTML = '<option value="">Chọn khu vực</option>';
  try {
    const areas = await api.getAreas();
    areas.filter((a: any) => a.is_active).forEach((area: any) => {
      const opt = document.createElement('option');
      opt.value = String(area.id);
      opt.textContent = area.name;
      areaSelect.appendChild(opt);
    });
  } catch (err: any) {
    console.error('Failed to load areas:', err);
  }
}

async function onAreaChanged() {
  await loadCountersForArea();
  await loadServiceTypes();

  // Restore saved multi-counter assignments
  multiCounterMap.clear();
  try {
    const saved = JSON.parse(localStorage.getItem('counter_multi_map_v2') || '{}');
    for (const [k, v] of Object.entries(saved)) {
      multiCounterMap.set(Number(k), Number(v));
    }
  } catch { /* ignore */ }
}

async function loadCountersForArea() {
  counterSelect.innerHTML = '<option value="">Chọn quầy</option>';
  if (!currentAreaId) return;
  try {
    const counters = await api.getCounters(currentAreaId);
    counters.filter((c: any) => c.is_active).forEach((counter: any) => {
      const opt = document.createElement('option');
      opt.value = String(counter.id);
      opt.textContent = counter.name;
      counterSelect.appendChild(opt);
    });
  } catch { /* ignore */ }
}

async function loadServiceTypes() {
  serviceTypeSelect.innerHTML = '<option value="">Tất cả dịch vụ</option>';
  cachedServiceTypes = [];
  cachedCounters = [];
  if (!currentAreaId) return;

  try {
    const [types, counters] = await Promise.all([
      api.getServiceTypes(currentAreaId),
      api.getCounters(currentAreaId),
    ]);
    cachedServiceTypes = types;
    cachedCounters = counters.filter((c: any) => c.is_active);
    types.filter((t: any) => t.is_active).forEach((st: any) => {
      const opt = document.createElement('option');
      opt.value = String(st.id);
      opt.textContent = `${st.prefix} - ${st.name}`;
      serviceTypeSelect.appendChild(opt);
    });
  } catch { /* ignore */ }
}

areaSelect.addEventListener('change', async () => {
  currentAreaId = areaSelect.value ? Number(areaSelect.value) : null;
  log.info('Area selected: ' + (currentAreaId || 'none'));
  if (currentAreaId) {
    localStorage.setItem('counter_area_id', String(currentAreaId));
  } else {
    localStorage.removeItem('counter_area_id');
  }

  currentCounterId = null;
  currentServiceTypeId = null;
  currentServingTicket = null;
  multiServingTickets = [];
  updateCurrentTicketDisplay();
  renderMultiServing();

  if (socket) socket.disconnect();

  if (currentAreaId) {
    await onAreaChanged();
    connectToArea();
    await updateQueueDisplay();
    if (activeTab === 'tab-multi') {
      renderMultiCounterCards();
      refreshMultiFromServer();
    }
  } else {
    // Clear everything when no area selected
    counterSelect.innerHTML = '<option value="">Chọn quầy</option>';
    serviceTypeSelect.innerHTML = '<option value="">Tất cả dịch vụ</option>';
    cachedServiceTypes = [];
    cachedCounters = [];
    multiCounterMap.clear();
    multiServiceButtons.innerHTML = '';
    multiServingList.innerHTML = '';
    queueWaitingList.innerHTML = '';
    queueWaitingCount.textContent = '0';
    statCompleted.textContent = '0';
    statWaiting.textContent = '0';
  }
});

counterSelect.addEventListener('change', async () => {
  currentCounterId = counterSelect.value ? Number(counterSelect.value) : null;
  log.info('Counter selected: ' + (currentCounterId || 'none'));
  if (currentCounterId) {
    localStorage.setItem('counter_selected_id', String(currentCounterId));
  }

  currentServingTicket = null;
  updateCurrentTicketDisplay();

  if (currentAreaId) {
    updateQueueDisplay();
    checkCurrentServing();
  }
});

serviceTypeSelect.addEventListener('change', () => {
  currentServiceTypeId = serviceTypeSelect.value ? Number(serviceTypeSelect.value) : null;
  if (currentServiceTypeId) {
    localStorage.setItem('counter_service_type_id', String(currentServiceTypeId));
  } else {
    localStorage.removeItem('counter_service_type_id');
  }
  updateQueueDisplay();
});

function connectToArea() {
  if (socket) socket.disconnect();
  if (!currentAreaId) return;

  log.info('Connecting socket to area ' + currentAreaId);
  socket = api.connectSocket(currentAreaId);

  socket.on('queue:status', (data: any) => {
    renderQueueStatus(data);
    if (activeTab === 'tab-multi') renderMultiQueueStatus(data);
    if (currentCounterId) {
      const myTicket = data.serving.find((t: any) => t.counter_id === currentCounterId);
      if (myTicket) {
        currentServingTicket = myTicket;
        updateCurrentTicketDisplay();
      }
    }
    // Tab 2: sync serving list from server
    if (activeTab === 'tab-multi') syncMultiServingFromStatus(data);
  });

  const refreshAll = () => { updateQueueDisplay(); if (activeTab === 'tab-multi') refreshMultiFromServer(); };
  socket.on('ticket:created', refreshAll);
  socket.on('ticket:called', refreshAll);
  socket.on('ticket:completed', refreshAll);
  socket.on('ticket:skipped', refreshAll);
  socket.on('queue:reset', () => {
    currentServingTicket = null;
    multiServingTickets = [];
    updateCurrentTicketDisplay();
    renderMultiServing();
    refreshAll();
  });
}

async function checkCurrentServing() {
  if (!currentAreaId) return;
  try {
    const status = await api.getQueueStatus(currentAreaId);
    if (currentCounterId) {
      const myTicket = status.serving.find((t: any) => t.counter_id === currentCounterId);
      if (myTicket) {
        currentServingTicket = myTicket;
        updateCurrentTicketDisplay();
      }
    }
  } catch { /* ignore */ }
}

// Queue display
async function updateQueueDisplay() {
  if (!currentAreaId) return;
  try {
    const status = await api.getQueueStatus(currentAreaId);
    renderQueueStatus(status);
  } catch { /* ignore */ }
}

function renderQueueStatus(data: any) {
  // Filter waiting by selected service type
  let waitingFiltered = data.waiting;
  if (currentServiceTypeId) {
    waitingFiltered = data.waiting.filter((t: any) => t.service_type_id === currentServiceTypeId);
  }

  queueWaitingCount.textContent = String(waitingFiltered.length);
  queueWaitingList.innerHTML = '';
  waitingFiltered.forEach((ticket: any) => {
    const badge = document.createElement('span');
    badge.className = 'queue-badge';
    badge.textContent = ticket.ticket_number;
    if (ticket.service_type_name) {
      badge.title = ticket.service_type_name;
    }
    queueWaitingList.appendChild(badge);
  });

  statCompleted.textContent = String(data.completed_count);
  statWaiting.textContent = String(data.waiting_count);
}

function updateCurrentTicketDisplay() {
  btnCallNext.removeAttribute('disabled');
  if (currentServingTicket) {
    currentTicketNumber.textContent = currentServingTicket.ticket_number;
    currentServiceType.textContent = currentServingTicket.service_type_name || '';
    currentCounterName.textContent = counterSelect.selectedOptions[0]?.textContent || '';
    btnRecall.removeAttribute('disabled');
    btnComplete.removeAttribute('disabled');
    btnSkip.removeAttribute('disabled');
  } else {
    currentTicketNumber.textContent = '---';
    currentServiceType.textContent = '';
    currentCounterName.textContent = '';
    btnRecall.setAttribute('disabled', '');
    btnComplete.setAttribute('disabled', '');
    btnSkip.setAttribute('disabled', '');
  }
}

// Helper: disable button + show loading during async action
async function withLoading(btn: HTMLElement, fn: () => Promise<void>) {
  if (btn.classList.contains('loading')) return;
  btn.classList.add('loading');
  const origText = btn.innerHTML;
  btn.setAttribute('disabled', '');
  try {
    await fn();
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = origText;
    // Re-enable based on current state
    updateCurrentTicketDisplay();
  }
}

// Actions
btnCallNext.addEventListener('click', () => withLoading(btnCallNext, async () => {
  if (!currentCounterId) {
    showWarningDialog('Vui lòng chọn quầy');
    return;
  }
  try {
    log.info('Calling next ticket, counter=' + currentCounterId + ', serviceType=' + (currentServiceTypeId || 'all'));
    const result = await api.callNext(currentCounterId, currentServiceTypeId || undefined);
    if (result.ticket) {
      log.info('Called ticket: ' + result.ticket.ticket_number);
      result.ticket.service_type_name = result.serviceTypeName;
      currentServingTicket = result.ticket;
    } else {
      log.info('No tickets waiting');
      showInfoDialog('Không còn số chờ' + (currentServiceTypeId ? ' cho loại dịch vụ này' : ''));
    }
  } catch (err: any) {
    log.error('callNext failed: ' + err.message);
    showErrorDialog(err.message);
  }
}));

btnRecall.addEventListener('click', () => withLoading(btnRecall, async () => {
  if (!currentServingTicket || !currentCounterId) return;
  try {
    log.info('Recalling ticket: ' + currentServingTicket.ticket_number);
    await api.recallTicket(currentServingTicket.id, currentCounterId);
  } catch (err: any) {
    log.error('recall failed: ' + err.message);
    showErrorDialog(err.message);
  }
}));

btnComplete.addEventListener('click', () => withLoading(btnComplete, async () => {
  if (!currentServingTicket) return;
  try {
    log.info('Completing ticket: ' + currentServingTicket.ticket_number);
    await api.completeTicket(currentServingTicket.id);
    currentServingTicket = null;
  } catch (err: any) {
    log.error('complete failed: ' + err.message);
    showErrorDialog(err.message);
  }
}));

btnSkip.addEventListener('click', () => withLoading(btnSkip, async () => {
  if (!currentServingTicket) return;
  try {
    log.info('Skipping ticket: ' + currentServingTicket.ticket_number);
    await api.skipTicket(currentServingTicket.id);
    currentServingTicket = null;
  } catch (err: any) {
    log.error('skip failed: ' + err.message);
    showErrorDialog(err.message);
  }
}));

// Open log directory
document.getElementById('btn-open-log')!.addEventListener('click', async () => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_log_dir');
  } catch (err) {
    console.error('Open log dir error:', err);
  }
});

// Logout
document.getElementById('btn-logout')!.addEventListener('click', () => {
  log.info('User logged out');
  api.clearAuth();
  currentUser = null;
  currentServingTicket = null;
  if (socket) socket.disconnect();
  showLoginScreen();
});

// Change password
document.getElementById('btn-change-password')!.addEventListener('click', () => {
  passwordModal.classList.remove('hidden');
  oldPasswordInput.value = '';
  newPasswordInput.value = '';
  hideError(passwordError);
});

document.getElementById('btn-cancel-password')!.addEventListener('click', () => {
  passwordModal.classList.add('hidden');
});

document.getElementById('btn-save-password')!.addEventListener('click', async () => {
  const oldPw = oldPasswordInput.value;
  const newPw = newPasswordInput.value;
  if (!oldPw || !newPw) {
    showError(passwordError, 'Vui lòng nhập đầy đủ');
    return;
  }
  try {
    await api.changePassword(oldPw, newPw);
    passwordModal.classList.add('hidden');
    showInfoDialog('Đổi mật khẩu thành công');
  } catch (err: any) {
    showError(passwordError, err.message);
  }
});

// ─── Tabs ───

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab as 'tab-single' | 'tab-multi';
    if (tab === activeTab) return;
    activeTab = tab;
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    tabSingle.classList.toggle('hidden', tab !== 'tab-single');
    tabMulti.classList.toggle('hidden', tab !== 'tab-multi');
    if (tab === 'tab-multi') {
      if (currentAreaId) {
        renderMultiCounterCards();
        refreshMultiFromServer();
      } else {
        multiServiceButtons.innerHTML = '<div style="padding:20px;color:var(--text-secondary);font-size:13px;text-align:center;">Vui lòng chọn khu vực</div>';
        multiServingList.innerHTML = '';
      }
    }
  });
});

// ─── Multi-service tab ───

function renderMultiCounterCards() {
  multiServiceButtons.innerHTML = '';
  const activeCounters = cachedCounters.filter(c => c.is_active);
  if (activeCounters.length === 0) {
    multiServiceButtons.innerHTML = '<div style="padding:10px;color:var(--text-secondary);font-size:12px;text-align:center;">Chưa có quầy</div>';
    return;
  }
  const activeServices = cachedServiceTypes.filter(t => t.is_active);

  activeCounters.forEach(counter => {
    const card = document.createElement('div');
    card.className = 'multi-counter-card';

    // Counter name header
    const header = document.createElement('div');
    header.className = 'multi-counter-header';
    header.textContent = counter.name;
    card.appendChild(header);

    // Service type dropdown
    const select = document.createElement('select');
    select.className = 'multi-counter-service-select';
    select.innerHTML = '<option value="">Chọn dịch vụ</option>';
    activeServices.forEach(st => {
      const opt = document.createElement('option');
      opt.value = String(st.id);
      opt.textContent = `${st.prefix} - ${st.name}`;
      select.appendChild(opt);
    });

    // Restore saved service type for this counter
    const savedServiceTypeId = multiCounterMap.get(counter.id);
    if (savedServiceTypeId) {
      select.value = String(savedServiceTypeId);
    }

    select.addEventListener('change', () => {
      const val = select.value ? Number(select.value) : 0;
      if (val) {
        multiCounterMap.set(counter.id, val);
      } else {
        multiCounterMap.delete(counter.id);
      }
      saveMultiCounterMap();
      // Update waiting count display for this card
      refreshMultiFromServer();
    });

    card.appendChild(select);

    // Waiting count display
    const waitingEl = document.createElement('div');
    waitingEl.className = 'multi-counter-waiting';
    waitingEl.dataset.counterWaiting = String(counter.id);
    waitingEl.textContent = '--';
    card.appendChild(waitingEl);

    // Call button
    const btn = document.createElement('button');
    btn.className = 'multi-counter-call-btn';
    btn.textContent = 'Gọi số';
    btn.addEventListener('click', () => handleMultiCallNext(counter.id, btn, select));

    card.appendChild(btn);
    multiServiceButtons.appendChild(card);
  });
}

function saveMultiCounterMap() {
  const obj: Record<string, number> = {};
  multiCounterMap.forEach((v, k) => { obj[String(k)] = v; });
  localStorage.setItem('counter_multi_map_v2', JSON.stringify(obj));
}

async function handleMultiCallNext(counterId: number, btn: HTMLButtonElement, select: HTMLSelectElement) {
  const serviceTypeId = select.value ? Number(select.value) : null;
  if (!serviceTypeId) {
    showWarningDialog('Vui lòng chọn dịch vụ cho quầy này');
    return;
  }
  if (btn.classList.contains('loading')) return;
  btn.classList.add('loading');
  // Auto-complete existing ticket for this counter before calling next
  const existing = multiServingTickets.find(t => t.counter_id === counterId);
  if (existing) {
    try {
      await api.completeTicket(existing.id);
    } catch (err: any) {
      showErrorDialog(err.message);
      btn.classList.remove('loading');
      return;
    }
  }
  try {
    const result = await api.callNext(counterId, serviceTypeId);
    if (result.ticket) {
      await refreshMultiFromServer();
    } else {
      await refreshMultiFromServer();
      showInfoDialog('Không còn số chờ cho dịch vụ này');
    }
  } catch (err: any) {
    showErrorDialog(err.message);
  }
  btn.classList.remove('loading');
}

function renderMultiServing() {
  multiServingList.innerHTML = '';
  if (multiServingTickets.length === 0) {
    multiServingList.innerHTML = '<div class="multi-serving-empty">Chưa có số đang phục vụ</div>';
    return;
  }
  multiServingTickets.forEach(ticket => {
    const counterName = cachedCounters.find(c => c.id === ticket.counter_id)?.name || '';
    const card = document.createElement('div');
    card.className = 'multi-serving-card';
    card.innerHTML = `
      <div class="msc-ticket">${ticket.ticket_number}</div>
      <div class="msc-info">
        <div class="msc-service">${ticket.service_type_name || ''}</div>
        <div class="msc-counter">${counterName}</div>
      </div>
      <div class="msc-actions">
        <button class="msc-btn recall-btn" title="Gọi lại">&#128264;</button>
        <button class="msc-btn complete-btn" title="Hoàn thành">&#10004;</button>
        <button class="msc-btn skip-btn" title="Bỏ qua">&#10006;</button>
      </div>
    `;
    const [recallBtn, completeBtn, skipBtn] = card.querySelectorAll('.msc-btn') as NodeListOf<HTMLButtonElement>;
    recallBtn.addEventListener('click', async () => {
      const counterId = ticket.counter_id;
      if (!counterId) return;
      try { await api.recallTicket(ticket.id, counterId); } catch (err: any) { showErrorDialog(err.message); }
    });
    completeBtn.addEventListener('click', async () => {
      try {
        await api.completeTicket(ticket.id);
        await refreshMultiFromServer();
      } catch (err: any) { showErrorDialog(err.message); }
    });
    skipBtn.addEventListener('click', async () => {
      try {
        await api.skipTicket(ticket.id);
        await refreshMultiFromServer();
      } catch (err: any) { showErrorDialog(err.message); }
    });
    multiServingList.appendChild(card);
  });
}

function renderMultiQueueStatus(data: any) {
  const waiting: any[] = data.waiting;
  multiWaitingCount.textContent = String(waiting.length);
  multiWaitingList.innerHTML = '';
  waiting.forEach((ticket: any) => {
    const badge = document.createElement('span');
    badge.className = 'queue-badge';
    badge.textContent = ticket.ticket_number;
    if (ticket.service_type_name) badge.title = ticket.service_type_name;
    multiWaitingList.appendChild(badge);
  });

  // Update per-counter waiting counts based on selected service
  const countMap = new Map<number, number>();
  waiting.forEach((t: any) => {
    countMap.set(t.service_type_id, (countMap.get(t.service_type_id) || 0) + 1);
  });
  multiServiceButtons.querySelectorAll('[data-counter-waiting]').forEach(el => {
    const counterId = Number((el as HTMLElement).dataset.counterWaiting);
    const selectedServiceId = multiCounterMap.get(counterId);
    if (selectedServiceId) {
      (el as HTMLElement).textContent = `Chờ: ${countMap.get(selectedServiceId) || 0}`;
    } else {
      (el as HTMLElement).textContent = '--';
    }
  });
}

function syncMultiServingFromStatus(data: any) {
  // Get all counter IDs assigned in multi-service tab
  const assignedCounterIds = new Set(multiCounterMap.keys());
  // Filter serving tickets: must match an assigned counter
  multiServingTickets = data.serving.filter((t: any) => assignedCounterIds.has(t.counter_id));
  renderMultiServing();
}

async function refreshMultiFromServer() {
  if (!currentAreaId) return;
  try {
    const status = await api.getQueueStatus(currentAreaId);
    syncMultiServingFromStatus(status);
    renderMultiQueueStatus(status);
  } catch { /* ignore */ }
}

// Helpers
function showError(el: HTMLElement, msg: string) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(el: HTMLElement) {
  el.classList.add('hidden');
}

// F12: toggle DevTools
document.addEventListener('keydown', async (e) => {
  if (e.key === 'F12') {
    e.preventDefault();
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = getCurrentWebviewWindow();
      // @ts-ignore - devtools method available with devtools feature
      if (win.isDevToolsOpen && await win.isDevToolsOpen()) {
        // @ts-ignore
        win.closeDevTools();
      } else {
        // @ts-ignore
        win.openDevTools();
      }
    } catch { /* ignore */ }
  }
});

// Start
init();
