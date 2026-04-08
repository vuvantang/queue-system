import './style.css';
import { initLogger, log } from './logger';
import { checkForUpdates } from './updater';
import {
  getServerUrl,
  setServerUrl,
  clearAuth,
  getToken,
  login,
  getSettings,
  getAreas,
  getServiceTypes,
  getCounters,
  getQueueStatus,
  createTicket,
  connectSocket,
} from './api';
import { printTicketThermal } from './print';
import type { Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentAreaId: number | null = null;
let orgName = 'Queue';
let tvOpened = false;

// DOM - Screens
const loginScreen = document.getElementById('login-screen')!;
const areaScreen = document.getElementById('area-screen')!;
const kioskScreen = document.getElementById('kiosk-screen')!;

// DOM - Login
const loginServerUrl = document.getElementById('login-server-url') as HTMLInputElement;
const loginUsername = document.getElementById('login-username') as HTMLInputElement;
const loginPassword = document.getElementById('login-password') as HTMLInputElement;
const loginError = document.getElementById('login-error')!;
const loginBtn = document.getElementById('login-btn')!;

// DOM - Area selector
const areaList = document.getElementById('area-list')!;
const areaLogoutBtn = document.getElementById('area-logout-btn')!;

// DOM - Kiosk
const kioskLogo = document.getElementById('kiosk-logo') as HTMLImageElement;
const kioskOrgName = document.getElementById('kiosk-org-name')!;
const kioskAreaName = document.getElementById('kiosk-area-name')!;
const serviceButtons = document.getElementById('service-buttons')!;
const kioskWaiting = document.getElementById('kiosk-waiting')!;
const kioskTime = document.getElementById('kiosk-time')!;
const kioskContact = document.getElementById('kiosk-contact')!;
const openSettingsBtn = document.getElementById('open-settings')!;
const ticketResult = document.getElementById('ticket-result')!;
const ticketResultNumber = document.getElementById('ticket-result-number')!;
const resultWaitingCount = document.getElementById('result-waiting-count')!;
const tvStatus = document.getElementById('tv-status')!;
const tvStatusText = document.getElementById('tv-status-text')!;

// DOM - Settings overlay
const settingsOverlay = document.getElementById('settings-overlay')!;
const settingsPrinter = document.getElementById('settings-printer') as HTMLSelectElement;
const settingsRefreshPrinters = document.getElementById('settings-refresh-printers')!;
const settingsTvEnabled = document.getElementById('settings-tv-enabled') as HTMLInputElement;
const settingsTvWarning = document.getElementById('settings-tv-warning')!;
const settingsAutostart = document.getElementById('settings-autostart') as HTMLInputElement;
const settingsSaveBtn = document.getElementById('settings-save')!;
const settingsCancelBtn = document.getElementById('settings-cancel')!;
const settingsChangeAreaBtn = document.getElementById('settings-change-area')!;
const settingsLogoutBtn = document.getElementById('settings-logout')!;
const settingsAutoPrint = document.getElementById('settings-auto-print') as HTMLInputElement;
const settingsAnnounceEnabled = document.getElementById('settings-announce-enabled') as HTMLInputElement;
const settingsTestTts = document.getElementById('settings-test-tts') as HTMLInputElement;
const settingsTestDing = document.getElementById('settings-test-ding')!;
const settingsTestSpeak = document.getElementById('settings-test-speak')!;
const settingsTtsPath = document.getElementById('settings-tts-path') as HTMLInputElement;
const settingsTtsBrowse = document.getElementById('settings-tts-browse')!;
const ttsCacheInfo = document.getElementById('tts-cache-info')!;
const settingsPreloadTts = document.getElementById('settings-preload-tts')!;
const settingsPreloadStatus = document.getElementById('settings-preload-status')!;

// DOM - Settings password prompt
const settingsPasswordOverlay = document.getElementById('settings-password-overlay')!;
const settingsPasswordInput = document.getElementById('settings-password-input') as HTMLInputElement;
const settingsPasswordError = document.getElementById('settings-password-error')!;
const settingsPasswordOk = document.getElementById('settings-password-ok')!;
const settingsPasswordCancel = document.getElementById('settings-password-cancel')!;

// ─── Screens ───

function showScreen(screen: 'login' | 'area' | 'kiosk') {
  loginScreen.classList.toggle('hidden', screen !== 'login');
  areaScreen.classList.toggle('hidden', screen !== 'area');
  kioskScreen.classList.toggle('hidden', screen !== 'kiosk');
}

// ─── Init ───

async function init() {
  await initLogger();
  log.info('Kiosk app starting');

  updateClock();
  setInterval(updateClock, 1000);

  // Hiển thị version trên title window
  let appVersion = '';
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    appVersion = await getVersion();
    log.info('App version: ' + appVersion);
    const title = `Queue - Lấy số v${appVersion}`;
    document.title = title;
    await getCurrentWindow().setTitle(title);
  } catch { /* không phải Tauri */ }

  // Hiển thị machine info trên login
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const machineInfo = await invoke<{ hostname: string; ip: string }>('get_machine_info');
    log.info('Machine: ' + machineInfo.hostname + ' / ' + machineInfo.ip);
    const machineInfoEl = document.getElementById('login-machine-info');
    if (machineInfoEl) {
      const parts = [machineInfo.hostname, machineInfo.ip, appVersion ? `v${appVersion}` : ''].filter(Boolean);
      machineInfoEl.textContent = parts.join(' — ');
    }
  } catch (err) {
    console.error('Machine info error:', err);
  }

  // Kiểm tra cập nhật tự động (silent)
  checkForUpdates(true);

  // Tự động khôi phục phiên nếu đã có token + area đã lưu
  const savedAreaId = localStorage.getItem('kiosk_area_id');
  if (getToken() && savedAreaId) {
    try {
      // Kiểm tra token còn hợp lệ bằng cách gọi API
      await getSettings();
      currentAreaId = Number(savedAreaId);
      log.info('Session restored for area ' + savedAreaId);
      await startKiosk();
      return;
    } catch {
      // Token hết hạn → về màn hình login
      log.warn('Session expired, returning to login');
      clearAuth();
      localStorage.removeItem('kiosk_area_id');
    }
  }

  loginServerUrl.value = getServerUrl();
  showScreen('login');
}

// ─── Login ───

loginBtn.addEventListener('click', handleLogin);
loginPassword.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleLogin(); });

loginServerUrl.addEventListener('change', () => {
  setServerUrl(loginServerUrl.value);
});

async function handleLogin() {
  if (loginBtn.classList.contains('loading')) return;
  loginBtn.classList.add('loading');
  loginBtn.setAttribute('disabled', '');
  loginBtn.textContent = 'Đang đăng nhập...';

  const url = loginServerUrl.value.trim();
  const username = loginUsername.value.trim();
  const password = loginPassword.value;

  if (!url || !username || !password) {
    showError('Vui lòng nhập đầy đủ thông tin');
    loginBtn.classList.remove('loading');
    loginBtn.removeAttribute('disabled');
    loginBtn.textContent = 'Đăng nhập';
    return;
  }

  setServerUrl(url);

  try {
    log.info('Login attempt: ' + username);
    await login(username, password);
    log.info('Login successful');
    localStorage.setItem('kiosk_username', username);
    loginPassword.value = '';
    hideError();
    await showAreaSelector();
  } catch (err: any) {
    log.warn('Login failed: ' + err.message);
    showError(err.message);
  }

  loginBtn.classList.remove('loading');
  loginBtn.removeAttribute('disabled');
  loginBtn.textContent = 'Đăng nhập';
}

function showError(msg: string) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function hideError() {
  loginError.classList.add('hidden');
}

// ─── Area Selector ───

async function showAreaSelector() {
  showScreen('area');

  try {
    const areas = await getAreas();
    areaList.innerHTML = '';

    const active = areas.filter((a: any) => a.is_active);
    if (active.length === 0) {
      areaList.innerHTML = '<p style="color:#94a3b8; text-align:center;">Chưa có khu vực nào</p>';
      return;
    }

    active.forEach((area: any) => {
      const btn = document.createElement('button');
      btn.className = 'area-option';
      btn.textContent = area.name;
      btn.onclick = () => selectArea(area.id);
      areaList.appendChild(btn);
    });
  } catch {
    areaList.innerHTML = '<p style="color:#ef4444; text-align:center;">Không thể kết nối server</p>';
  }
}

async function selectArea(areaId: number) {
  log.info('Area selected: ' + areaId);
  currentAreaId = areaId;
  localStorage.setItem('kiosk_area_id', String(areaId));
  await startKiosk();
}

areaLogoutBtn.addEventListener('click', () => {
  clearAuth();
  localStorage.removeItem('kiosk_area_id');
  currentAreaId = null;
  showScreen('login');
});

// ─── Kiosk ───

async function startKiosk() {
  showScreen('kiosk');

  // Load org name & logo
  try {
    const settings = await getSettings();
    orgName = settings.org_name || 'Queue';
    kioskOrgName.textContent = orgName;
    if (settings.logo) {
      kioskLogo.src = getServerUrl() + settings.logo;
      kioskLogo.classList.remove('hidden');
    } else {
      kioskLogo.classList.add('hidden');
    }
    // Render contact phones
    try {
      const phones: Array<{ label: string; phone: string }> = JSON.parse(settings.contact_phones || '[]');
      if (phones.length > 0) {
        kioskContact.innerHTML = phones
          .map(p => `<span class="contact-item">${p.label ? `<strong>${p.label}:</strong> ` : ''}${p.phone}</span>`)
          .join('');
        kioskContact.classList.remove('hidden');
      } else {
        kioskContact.classList.add('hidden');
      }
    } catch {
      kioskContact.classList.add('hidden');
    }
  } catch { /* ignore */ }

  // Load area info
  try {
    const areas = await getAreas();
    const area = areas.find((a: any) => a.id === currentAreaId);
    kioskAreaName.textContent = area?.name || '';
  } catch { /* ignore */ }

  // Load service types
  await loadServiceButtons();
  await updateStats();

  // Connect socket
  if (socket) socket.disconnect();
  socket = connectSocket(currentAreaId!);

  socket.on('queue:status', (data: any) => {
    kioskWaiting.textContent = String(data.waiting_count);
  });
  socket.on('ticket:created', () => updateStats());
  socket.on('ticket:called', (data: any) => {
    log.info('Socket ticket:called: ' + data.ticket.ticket_number + ' -> ' + data.counter.name);
    updateStats();
    queueAnnouncement(data.ticket.ticket_number, data.counter.name, data.serviceTypeName || '', data.announceTemplate || '');
  });
  socket.on('ticket:recalled', (data: any) => {
    queueAnnouncement(data.ticket.ticket_number, data.counter.name, data.serviceTypeName || '', data.announceTemplate || '');
  });
  socket.on('ticket:completed', () => updateStats());
  socket.on('ticket:skipped', () => updateStats());

  tryOpenTV();
}

async function loadServiceButtons() {
  if (!currentAreaId) return;
  const types = await getServiceTypes(currentAreaId);
  serviceButtons.innerHTML = '';

  types.filter((t: any) => t.is_active).forEach((st: any) => {
    const btn = document.createElement('button');
    btn.className = 'service-btn';
    btn.innerHTML = `
      <div class="prefix">${st.prefix}</div>
      <div class="name">${st.name}</div>
    `;
    btn.onclick = () => handleTakeNumber(st.id);
    serviceButtons.appendChild(btn);
  });
}

async function updateStats() {
  if (!currentAreaId) return;
  try {
    const status = await getQueueStatus(currentAreaId);
    kioskWaiting.textContent = String(status.waiting_count);
  } catch { /* ignore */ }
}

// ─── Settings ───

openSettingsBtn.addEventListener('click', () => {
  settingsPasswordInput.value = '';
  settingsPasswordError.classList.add('hidden');
  settingsPasswordOverlay.classList.remove('hidden');
  settingsPasswordInput.focus();
});

settingsPasswordOk.addEventListener('click', () => verifySettingsPassword());
settingsPasswordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') verifySettingsPassword(); });

async function verifySettingsPassword() {
  const password = settingsPasswordInput.value;
  if (!password) {
    settingsPasswordError.textContent = 'Vui lòng nhập mật khẩu';
    settingsPasswordError.classList.remove('hidden');
    return;
  }

  try {
    // Re-login to verify password
    const username = localStorage.getItem('kiosk_username') || 'admin';
    await login(username, password);
    settingsPasswordOverlay.classList.add('hidden');
    openSettings();
  } catch {
    settingsPasswordError.textContent = 'Mật khẩu không đúng';
    settingsPasswordError.classList.remove('hidden');
  }
}

settingsPasswordCancel.addEventListener('click', () => {
  settingsPasswordOverlay.classList.add('hidden');
});

async function loadPrinterList() {
  settingsPrinter.innerHTML = '<option value="">Đang tải...</option>';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ printers: string[]; default_printer: string | null }>('list_printers');
    const savedPrinter = localStorage.getItem('kiosk_printer_name') || '';

    settingsPrinter.innerHTML = '';
    if (result.printers.length === 0) {
      settingsPrinter.innerHTML = '<option value="">Không tìm thấy máy in</option>';
    } else {
      result.printers.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name + (name === result.default_printer ? ' (mặc định)' : '');
        opt.selected = savedPrinter ? name === savedPrinter : name === result.default_printer;
        settingsPrinter.appendChild(opt);
      });
    }
  } catch {
    settingsPrinter.innerHTML = '<option value="">Lỗi tải danh sách máy in</option>';
  }
}

async function openSettings() {
  settingsOverlay.classList.remove('hidden');

  // Render announcement monitor
  renderAnnounceMonitor();

  // Load TTS path setting
  settingsTtsPath.value = localStorage.getItem('kiosk_tts_path') || '';

  // Show actual TTS cache path
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const cachePath = await invoke<string>('get_tts_cache_path', { customDir: getTtsCustomDir() });
    ttsCacheInfo.textContent = `Đang dùng: ${cachePath}`;
  } catch {
    ttsCacheInfo.textContent = '';
  }
  settingsPreloadStatus.textContent = '';

  // Load printer list (không await — chạy nền để settings không bị treo)
  loadPrinterList();

  // TV toggle
  const tvEnabled = localStorage.getItem('kiosk_tv_enabled') !== 'false';
  settingsTvEnabled.checked = tvEnabled;

  // Check monitor count for warning
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const monitors: any[] = await invoke('list_monitors');
    settingsTvWarning.classList.toggle('hidden', monitors.length >= 2);
  } catch {
    settingsTvWarning.classList.remove('hidden');
  }

  // Announce audio toggle
  settingsAutoPrint.checked = localStorage.getItem('kiosk_auto_print') !== 'false';
  settingsAnnounceEnabled.checked = localStorage.getItem('kiosk_announce_enabled') !== 'false';

  // Auto-start state
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    settingsAutostart.checked = await isEnabled();
  } catch {
    settingsAutostart.checked = false;
  }
}

settingsRefreshPrinters.addEventListener('click', () => loadPrinterList());

// Browse for TTS directory
settingsTtsBrowse.addEventListener('click', async () => {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, title: 'Chọn thư mục âm thanh' });
    if (selected) {
      settingsTtsPath.value = String(selected);
    }
  } catch {
    // Fallback: user types path manually
  }
});

// Preload TTS: download individual parts (static text, counters, ticket digits)
settingsPreloadTts.addEventListener('click', async () => {
  settingsPreloadTts.setAttribute('disabled', '');
  settingsPreloadStatus.textContent = 'Đang tải...';

  if (!currentAreaId) {
    settingsPreloadStatus.textContent = 'Chưa chọn khu vực';
    settingsPreloadTts.removeAttribute('disabled');
    return;
  }

  try {
    const areas = await getAreas();
    const area = areas.find((a: any) => a.id === currentAreaId) as any;
    const template: string = area?.announce_template || 'Mời số {ticket}, đến {counter}';
    const types = await getServiceTypes(currentAreaId);
    const counters = await getCounters(currentAreaId);

    // Collect unique parts to preload
    const phrases = new Set<string>();

    // 1. Static text parts from template (e.g. "Mời số", "đến")
    const staticParts = template.split(/\{ticket\}|\{counter\}|\{service\}/);
    for (const part of staticParts) {
      const cleaned = part.replaceAll(/[,.\s]+$/g, '').replaceAll(/^[,.\s]+/g, '').trim();
      if (cleaned) phrases.add(cleaned);
    }

    // 2. Counter names (e.g. "Quầy 1", "Quầy 2")
    for (const counter of counters) {
      phrases.add(counter.name);
    }

    // 3. Ticket digit combinations (e.g. "0 0 1", "0 1 0", "1 0 0")
    for (let i = 1; i <= 200; i++) {
      phrases.add(String(i).padStart(3, '0').split('').join(' '));
    }

    // 4. Service type names
    for (const st of types.filter((t: any) => t.is_active)) {
      phrases.add(st.name);
    }

    const phraseList = Array.from(phrases);
    settingsPreloadStatus.textContent = `Đang tải 0/${phraseList.length}...`;

    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    // Listen for progress events from Rust
    const unlisten = await listen<{ current: number; total: number; downloaded: number }>('preload-tts-progress', (event) => {
      const { current, total, downloaded } = event.payload;
      settingsPreloadStatus.textContent = `Đang tải ${current}/${total} (${downloaded} mới)...`;
    });

    const downloaded = await invoke<number>('preload_tts', { phrases: phraseList, customDir: getTtsCustomDir() });
    unlisten();

    if (downloaded > 0) {
      settingsPreloadStatus.textContent = `Đã tải ${downloaded} file mới`;
    } else {
      settingsPreloadStatus.textContent = 'Đã có đủ file âm thanh';
    }
  } catch (err) {
    settingsPreloadStatus.textContent = `Lỗi: ${err}`;
  }

  settingsPreloadTts.removeAttribute('disabled');
});

settingsTestDing.addEventListener('click', async () => {
  settingsTestDing.setAttribute('disabled', '');
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('play_ding', { serverUrl: getServerUrl() });
  } catch (err) {
    console.error('Test ding error:', err);
  }
  settingsTestDing.removeAttribute('disabled');
});

settingsTestSpeak.addEventListener('click', async () => {
  const text = settingsTestTts.value.trim();
  if (!text) return;
  settingsTestSpeak.setAttribute('disabled', '');
  try {
    await speakText(text);
  } catch (err) {
    console.error('Test speak error:', err);
  }
  settingsTestSpeak.removeAttribute('disabled');
});

settingsSaveBtn.addEventListener('click', async () => {
  log.info('Settings saved');
  localStorage.setItem('kiosk_printer_name', settingsPrinter.value);
  localStorage.setItem('kiosk_auto_print', String(settingsAutoPrint.checked));
  const tvWasEnabled = localStorage.getItem('kiosk_tv_enabled') !== 'false';
  const tvNowEnabled = settingsTvEnabled.checked;
  localStorage.setItem('kiosk_tv_enabled', String(tvNowEnabled));
  localStorage.setItem('kiosk_announce_enabled', String(settingsAnnounceEnabled.checked));
  localStorage.setItem('kiosk_tts_path', settingsTtsPath.value.trim());

  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
    if (settingsAutostart.checked) {
      await enable();
    } else {
      await disable();
    }
  } catch (err) {
    console.error('Autostart error:', err);
  }

  settingsOverlay.classList.add('hidden');

  // Mở hoặc đóng TV khi thay đổi setting
  if (tvNowEnabled && !tvWasEnabled) {
    tryOpenTV(true);
  } else if (!tvNowEnabled && tvWasEnabled) {
    closeTV();
  }
});

settingsCancelBtn.addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
});

document.getElementById('settings-open-log')!.addEventListener('click', async () => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_log_dir');
  } catch (err) {
    console.error('Open log dir error:', err);
  }
});

settingsChangeAreaBtn.addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
  localStorage.removeItem('kiosk_area_id');
  if (socket) socket.disconnect();
  showAreaSelector();
});

settingsLogoutBtn.addEventListener('click', () => {
  log.info('User logged out');
  settingsOverlay.classList.add('hidden');
  localStorage.removeItem('kiosk_area_id');
  if (socket) socket.disconnect();
  clearAuth();
  currentAreaId = null;
  showScreen('login');
});

// ─── Take Number ───

let isTakingNumber = false;
async function handleTakeNumber(serviceTypeId: number) {
  if (isTakingNumber) return;
  isTakingNumber = true;

  // Disable all service buttons during request
  const allBtns = serviceButtons.querySelectorAll('.service-btn') as NodeListOf<HTMLButtonElement>;
  allBtns.forEach(b => { b.disabled = true; b.classList.add('loading'); });

  try {
    log.info('Creating ticket for serviceType=' + serviceTypeId);
    const ticket = await createTicket(serviceTypeId);
    log.info('Ticket created: ' + ticket.ticket_number);
    const status = await getQueueStatus(currentAreaId!);

    ticketResultNumber.textContent = ticket.ticket_number;
    resultWaitingCount.textContent = String(status.waiting_count);
    ticketResult.classList.remove('hidden');

    if (localStorage.getItem('kiosk_auto_print') !== 'false') {
      log.info('Auto-printing ticket: ' + ticket.ticket_number);
      printTicketThermal(ticket.ticket_number, orgName, status.waiting_count);
    }

    setTimeout(() => {
      ticketResult.classList.add('hidden');
    }, 5000);
  } catch (err: any) {
    log.error('Ticket creation failed: ' + err.message);
    if (err.message === 'SESSION_EXPIRED') {
      showScreen('login');
      return;
    }
    import('@tauri-apps/plugin-dialog').then(({ message }) =>
      message(err.message || 'Lỗi lấy số', { title: 'Lỗi', kind: 'error' })
    ).catch(() => {});
  } finally {
    isTakingNumber = false;
    allBtns.forEach(b => { b.disabled = false; b.classList.remove('loading'); });
  }
}

ticketResult.addEventListener('click', () => {
  ticketResult.classList.add('hidden');
});

// ─── Announcement Queue (phát từ Rust, tuần tự) ───

interface AnnounceItem {
  ticketNumber: string;
  counterName: string;
  serviceTypeName: string;
  template: string;
  time?: string;
}

const announceQueue: AnnounceItem[] = [];
const announceHistory: AnnounceItem[] = [];
let currentAnnounce: AnnounceItem | null = null;
let isAnnouncing = false;

// DOM - Announce monitor
const announceCurrent = document.getElementById('announce-current')!;
const announceCurrentText = document.getElementById('announce-current-text')!;
const announcePendingSection = document.getElementById('announce-pending-section')!;
const announcePendingCount = document.getElementById('announce-pending-count')!;
const announcePendingList = document.getElementById('announce-pending-list')!;
const announceHistorySection = document.getElementById('announce-history-section')!;
const announceHistoryList = document.getElementById('announce-history-list')!;
const announceEmpty = document.getElementById('announce-empty')!;

function formatAnnounceLabel(item: AnnounceItem): string {
  return `${item.ticketNumber} → ${item.counterName}`;
}

function renderAnnounceMonitor() {
  const hasAnything = currentAnnounce || announceQueue.length > 0 || announceHistory.length > 0;
  announceEmpty.classList.toggle('hidden', hasAnything);

  // Current
  if (currentAnnounce) {
    announceCurrent.classList.remove('hidden');
    announceCurrentText.textContent = `Đang phát: ${formatAnnounceLabel(currentAnnounce)}`;
  } else {
    announceCurrent.classList.add('hidden');
  }

  // Pending
  if (announceQueue.length > 0) {
    announcePendingSection.classList.remove('hidden');
    announcePendingCount.textContent = String(announceQueue.length);
    announcePendingList.innerHTML = '';
    announceQueue.forEach(item => {
      const li = document.createElement('li');
      li.textContent = formatAnnounceLabel(item);
      announcePendingList.appendChild(li);
    });
  } else {
    announcePendingSection.classList.add('hidden');
  }

  // History
  if (announceHistory.length > 0) {
    announceHistorySection.classList.remove('hidden');
    announceHistoryList.innerHTML = '';
    // Show newest first
    for (let i = announceHistory.length - 1; i >= 0; i--) {
      const item = announceHistory[i];
      const li = document.createElement('li');
      li.textContent = `${item.time} — ${formatAnnounceLabel(item)}`;
      announceHistoryList.appendChild(li);
    }
  } else {
    announceHistorySection.classList.add('hidden');
  }
}

function getTtsCustomDir(): string | undefined {
  return localStorage.getItem('kiosk_tts_path') || undefined;
}

// Speak parts via Rust Google TTS (each part cached separately, played as one stream)
async function speakParts(parts: string[]): Promise<void> {
  const filtered = parts.map(p => p.trim()).filter(p => p.length > 0);
  if (filtered.length === 0) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('speak_vietnamese', { parts: filtered, customDir: getTtsCustomDir() });
}

// For test button — single text string spoken as one part
async function speakText(text: string): Promise<void> {
  await speakParts([text]);
}

function queueAnnouncement(ticketNumber: string, counterName: string, serviceTypeName: string, template: string) {
  if (localStorage.getItem('kiosk_announce_enabled') === 'false') return;
  log.info('Queuing announcement: ' + ticketNumber + ' -> ' + counterName);
  announceQueue.push({ ticketNumber, counterName, serviceTypeName, template });
  renderAnnounceMonitor();
  if (!isAnnouncing) processNextAnnouncement();
}

// Split template into parts: static text + dynamic (ticket, counter, service)
// e.g. "Mời số {ticket}, đến {counter}" → ["Mời số", "0 0 1", "đến", "Quầy 1"]
function buildAnnounceParts(ticketNumber: string, counterName: string, serviceTypeName: string, template: string): string[] {
  const digits = ticketNumber.replaceAll(/\D/g, '');
  // Split template by placeholders, keeping the delimiters
  const parts: string[] = [];
  const regex = /\{ticket\}|\{counter\}|\{service\}/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(template)) !== null) {
    // Static text before this placeholder
    const before = template.slice(lastIndex, match.index).replaceAll(/[,.\s]+$/g, '').trim();
    if (before) parts.push(before);
    // Dynamic value
    if (match[0] === '{ticket}') parts.push(digits);
    else if (match[0] === '{counter}') parts.push(counterName);
    else if (match[0] === '{service}') parts.push(serviceTypeName);
    lastIndex = match.index + match[0].length;
  }
  // Remaining static text
  const remaining = template.slice(lastIndex).replaceAll(/^[,.\s]+/g, '').trim();
  if (remaining) parts.push(remaining);
  return parts;
}

async function processNextAnnouncement() {
  if (announceQueue.length === 0) {
    isAnnouncing = false;
    currentAnnounce = null;
    renderAnnounceMonitor();
    return;
  }
  isAnnouncing = true;
  const item = announceQueue.shift()!;
  currentAnnounce = item;
  renderAnnounceMonitor();

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('play_ding', { serverUrl: getServerUrl() });
    const parts = buildAnnounceParts(item.ticketNumber, item.counterName, item.serviceTypeName, item.template);
    await speakParts(parts);
  } catch (err) {
    console.error('Announce error:', err);
  }

  // Move to history
  item.time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  announceHistory.push(item);
  // Keep max 20 history items
  if (announceHistory.length > 20) announceHistory.shift();
  currentAnnounce = null;
  renderAnnounceMonitor();

  processNextAnnouncement();
}

// ─── TV Display ───

async function openTV(monitorIndex?: number) {
  if (tvOpened) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const url = `${getServerUrl()}/tv/${currentAreaId}`;
    log.info('Opening TV display: ' + url + ', monitor=' + (monitorIndex ?? 'default'));
    await invoke('open_tv_window', { url, monitorIndex: monitorIndex ?? null });
    tvOpened = true;
    tvStatus.classList.remove('hidden');
    tvStatusText.textContent = monitorIndex != null
      ? `Đang hiển thị trên màn hình ${monitorIndex + 1}`
      : 'Đang hiển thị TV';
  } catch (err) {
    console.error('Open TV error:', err);
  }
}

async function closeTV() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('close_tv_window');
  } catch { /* ignore */ }
  tvOpened = false;
  tvStatus.classList.add('hidden');
}

async function tryOpenTV(manual = false) {
  if (localStorage.getItem('kiosk_tv_enabled') === 'false') return;
  if (tvOpened) return;

  try {
    const { invoke } = await import('@tauri-apps/api/core');

    // Retry lấy danh sách monitor (có thể chưa sẵn sàng ngay)
    let monitors: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      monitors = await invoke('list_monitors');
      if (monitors.length > 0) break;
      await new Promise(r => setTimeout(r, 500));
    }

    log.info('tryOpenTV: detected ' + monitors.length + ' monitors, manual=' + manual);

    if (monitors.length >= 2) {
      // Tìm index màn hình phụ
      const secondaryIdx = monitors.findIndex((m: any) => !m.is_primary);
      await openTV(secondaryIdx >= 0 ? secondaryIdx : 1);
    } else if (manual) {
      // User chủ động bật từ settings → mở TV trên cùng màn hình
      await openTV();
    } else {
      // Tự động khi khởi động, chỉ 1 màn hình → bỏ qua
      log.info('tryOpenTV: only 1 monitor detected, skipping auto TV');
    }
  } catch (err) {
    log.error('tryOpenTV error: ' + err);
  }
}

// ─── Clock ───

function updateClock() {
  const now = new Date();
  kioskTime.textContent = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
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
