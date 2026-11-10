import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
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
  must_change_password?: number | boolean;
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
const passwordForceHint = document.getElementById('password-force-hint')!;
const btnCancelPassword = document.getElementById('btn-cancel-password')!;

// ─── Motion hooks (presentation only) ───
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const currentServingEl = document.getElementById('current-serving')!;
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
let shownTicketText = currentTicketNumber.textContent || '';

// Number roll: old number exits up quickly, new one enters from below.
// Interrupting (rapid calls) cancels the running roll instead of stacking.
function animateTicketChange() {
  const next = currentTicketNumber.textContent || '';
  const prev = shownTicketText;
  shownTicketText = next;
  if (prev === next || typeof currentTicketNumber.animate !== 'function') return;
  const win = currentTicketNumber.parentElement!;
  win.querySelectorAll('.ticket-ghost').forEach(g => g.remove());
  currentTicketNumber.getAnimations().forEach(a => a.cancel());

  const isEmpty = !currentServingTicket;
  if (reducedMotion.matches || isEmpty) {
    currentTicketNumber.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
    return;
  }
  const ghost = document.createElement('div');
  ghost.className = 'ticket-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = prev;
  win.appendChild(ghost);
  ghost.animate(
    [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-75%)', opacity: 0 }],
    { duration: 150, easing: EASE_IN, fill: 'forwards' },
  ).finished.then(() => ghost.remove(), () => ghost.remove());
  currentTicketNumber.animate(
    [{ transform: 'translateY(85%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
    { duration: 300, delay: 50, easing: EASE_OUT, fill: 'backwards' },
  );
}

// Recall acknowledgment: non-spatial ring + colour flash.
function pulseServing() {
  currentServingEl.classList.remove('is-pulsing');
  void currentServingEl.offsetWidth;
  currentServingEl.classList.add('is-pulsing');
  if (typeof currentTicketNumber.animate !== 'function') return;
  currentTicketNumber.getAnimations().filter(a => a.id === 'pulse').forEach(a => a.cancel());
  const anim = currentTicketNumber.animate(
    [{ color: '#fde68a' }, { color: '#ffffff', offset: 0.3 }, { color: '#fde68a' }],
    { duration: 620, easing: EASE_OUT },
  );
  anim.id = 'pulse';
}
currentServingEl.addEventListener('animationend', () => currentServingEl.classList.remove('is-pulsing'));

// Waiting chips: only newly-arrived numbers animate in.
function snapshotTexts(container: HTMLElement, selector: string) {
  return new Set(Array.from(container.querySelectorAll(selector), el => el.textContent || ''));
}
function markNew(container: HTMLElement, selector: string, prev: Set<string>) {
  const firstRender = container.dataset.rendered !== '1';
  container.dataset.rendered = '1';
  if (firstRender) return;
  container.querySelectorAll(selector).forEach(el => {
    if (!prev.has(el.textContent || '')) (el.closest('.multi-serving-card') || el).classList.add('is-new');
  });
}

const ICON_RECALL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

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
    let me: UserInfo | null = null;
    let mustChange = false;
    try {
      me = await api.getMe();
      mustChange = !!me?.must_change_password;
    } catch (err) {
      if (isMustChangePassword(err)) {
        mustChange = true;
      } else {
        log.warn('Session expired, returning to login');
        api.clearAuth();
      }
    }
    if (me || mustChange) {
      currentUser = me;
      log.info('Session restored for user: ' + (me?.username ?? '?'));
      await enterApp(mustChange);
      return;
    }
  }

  showLoginScreen();
}

function isMustChangePassword(err: unknown): boolean {
  return err instanceof api.ApiError && err.code === api.MUST_CHANGE_PASSWORD;
}

// Vào màn hình quầy; nếu tài khoản phải đổi mật khẩu thì bắt buộc đổi trước
async function enterApp(mustChangePassword: boolean) {
  if (mustChangePassword) {
    const changed = await requirePasswordChange();
    if (!changed) return;
  }
  if (!currentUser) {
    try {
      currentUser = await api.getMe();
    } catch {
      doLogout();
      return;
    }
  }
  await showCounterScreen();
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

  if (!api.setServerUrl(serverUrl)) {
    showError(loginError, 'Địa chỉ server không hợp lệ (cần http:// hoặc https://)');
    loginBtn.classList.remove('loading');
    loginBtn.removeAttribute('disabled');
    loginBtn.textContent = 'Đăng nhập';
    return;
  }

  let mustChangePassword: boolean | null = null;
  try {
    log.info('Login attempt: ' + username);
    const result = await api.login(username, password);
    currentUser = result.user;
    mustChangePassword = result.mustChangePassword;
    log.info('Login successful: ' + currentUser?.username + (mustChangePassword ? ' (must change password)' : ''));
    loginPassword.value = '';
    hideError(loginError);
  } catch (err: any) {
    log.warn('Login failed: ' + err.message);
    showError(loginError, err.message);
  }

  loginBtn.classList.remove('loading');
  loginBtn.removeAttribute('disabled');
  loginBtn.textContent = 'Đăng nhập';

  if (mustChangePassword !== null) {
    await enterApp(mustChangePassword);
  }
}

// Counter Screen
async function showCounterScreen() {
  loginScreen.classList.add('hidden');
  counterScreen.classList.remove('hidden');

  if (currentUser) {
    const roleLabel = currentUser.role === 'admin' ? 'Quản trị' : 'Nhân viên';
    userDisplayName.textContent = `${currentUser.display_name || currentUser.username} · ${roleLabel}`;
  } else {
    userDisplayName.textContent = '';
  }

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
  const prevBadges = snapshotTexts(queueWaitingList, '.queue-badge');
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
  markNew(queueWaitingList, '.queue-badge', prevBadges);

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
  currentServingEl.classList.toggle('is-empty', !currentServingTicket);
  animateTicketChange();
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
    pulseServing();
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
function doLogout() {
  log.info('User logged out');
  finishForcedPasswordChange(false);
  passwordModal.classList.add('hidden');
  api.clearAuth();
  currentUser = null;
  currentServingTicket = null;
  if (socket) socket.disconnect();
  socket = null;
  showLoginScreen();
}

document.getElementById('btn-logout')!.addEventListener('click', doLogout);

// Change password
let forcedPasswordPromise: Promise<boolean> | null = null;
let forcedPasswordResolve: ((changed: boolean) => void) | null = null;

function openPasswordModal(forced: boolean) {
  oldPasswordInput.value = '';
  newPasswordInput.value = '';
  hideError(passwordError);
  passwordForceHint.classList.toggle('hidden', !forced);
  btnCancelPassword.textContent = forced ? 'Đăng xuất' : 'Hủy';
  passwordModal.classList.remove('hidden');
  oldPasswordInput.focus();
}

// Bắt buộc đổi mật khẩu (không thể đóng modal, chỉ có thể đăng xuất).
// Trả về true khi đổi thành công, false khi người dùng đăng xuất.
function requirePasswordChange(): Promise<boolean> {
  if (forcedPasswordPromise) return forcedPasswordPromise;
  log.warn('Password change required');
  forcedPasswordPromise = new Promise<boolean>(resolve => { forcedPasswordResolve = resolve; });
  openPasswordModal(true);
  return forcedPasswordPromise;
}

function finishForcedPasswordChange(changed: boolean) {
  const resolve = forcedPasswordResolve;
  forcedPasswordResolve = null;
  forcedPasswordPromise = null;
  passwordForceHint.classList.add('hidden');
  btnCancelPassword.textContent = 'Hủy';
  resolve?.(changed);
}

// Server trả 403 MUST_CHANGE_PASSWORD ở bất kỳ API nào → bắt buộc đổi mật khẩu
api.onMustChangePassword(() => { void requirePasswordChange(); });

document.getElementById('btn-change-password')!.addEventListener('click', () => {
  openPasswordModal(false);
});

btnCancelPassword.addEventListener('click', () => {
  if (forcedPasswordResolve) {
    doLogout();
    return;
  }
  passwordModal.classList.add('hidden');
});

document.getElementById('btn-save-password')!.addEventListener('click', async () => {
  const oldPw = oldPasswordInput.value;
  const newPw = newPasswordInput.value;
  if (!oldPw || !newPw) {
    showError(passwordError, 'Vui lòng nhập đầy đủ');
    return;
  }
  if (forcedPasswordResolve && oldPw === newPw) {
    showError(passwordError, 'Mật khẩu mới phải khác mật khẩu cũ');
    return;
  }
  try {
    await api.changePassword(oldPw, newPw);
  } catch (err: any) {
    showError(passwordError, err.message);
    return;
  }
  oldPasswordInput.value = '';
  newPasswordInput.value = '';
  passwordModal.classList.add('hidden');

  if (forcedPasswordResolve) {
    // Server có thể thu hồi token cũ sau khi đổi mật khẩu → đăng nhập lại bằng mật khẩu mới
    try {
      currentUser = await api.getMe();
    } catch {
      const username = currentUser?.username || loginUsername.value.trim();
      try {
        if (!username) throw new Error('no username');
        currentUser = (await api.login(username, newPw)).user;
      } catch {
        doLogout();
        showInfoDialog('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
        return;
      }
    }
    finishForcedPasswordChange(true);
  }
  showInfoDialog('Đổi mật khẩu thành công');
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
  const prevServing = snapshotTexts(multiServingList, '.msc-ticket');
  multiServingList.innerHTML = '';
  if (multiServingTickets.length === 0) {
    multiServingList.innerHTML = '<div class="multi-serving-empty">Chưa có số đang phục vụ</div>';
    markNew(multiServingList, '.msc-ticket', prevServing);
    return;
  }
  multiServingTickets.forEach(ticket => {
    const counterName = cachedCounters.find(c => c.id === ticket.counter_id)?.name || '';
    const card = document.createElement('div');
    card.className = 'multi-serving-card';
    const ticketEl = el('div', 'msc-ticket', ticket.ticket_number);
    const info = el('div', 'msc-info');
    info.append(
      el('div', 'msc-service', ticket.service_type_name || ''),
      el('div', 'msc-counter', counterName),
    );
    const actions = el('div', 'msc-actions');
    // Icons are constant SVG markup (no server data)
    const iconButton = (cls: string, label: string, icon: string) => {
      const b = el('button', `msc-btn ${cls}`) as HTMLButtonElement;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = icon;
      return b;
    };
    const recallBtn = iconButton('recall-btn', 'Gọi lại', ICON_RECALL);
    const completeBtn = iconButton('complete-btn', 'Hoàn thành', ICON_CHECK);
    const skipBtn = iconButton('skip-btn', 'Bỏ qua', ICON_X);
    actions.append(recallBtn, completeBtn, skipBtn);
    card.append(ticketEl, info, actions);
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
  markNew(multiServingList, '.msc-ticket', prevServing);
}

function renderMultiQueueStatus(data: any) {
  const waiting: any[] = data.waiting;
  multiWaitingCount.textContent = String(waiting.length);
  const prevBadges = snapshotTexts(multiWaitingList, '.queue-badge');
  multiWaitingList.innerHTML = '';
  waiting.forEach((ticket: any) => {
    const badge = document.createElement('span');
    badge.className = 'queue-badge';
    badge.textContent = ticket.ticket_number;
    if (ticket.service_type_name) badge.title = ticket.service_type_name;
    multiWaitingList.appendChild(badge);
  });
  markNew(multiWaitingList, '.queue-badge', prevBadges);

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
function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function showError(el: HTMLElement, msg: string) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(el: HTMLElement) {
  el.classList.add('hidden');
}

// Tắt menu chuột phải mặc định của webview (trừ ô nhập liệu)
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable="true"]')) return;
  e.preventDefault();
});

// Start
init();
