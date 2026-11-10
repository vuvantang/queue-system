import { io, Socket } from 'socket.io-client';

let serverUrl = localStorage.getItem('counter_server_url') || 'http://localhost:3000';
let authToken = localStorage.getItem('counter_token') || '';

export function getServerUrl(): string { return serverUrl; }

/** Returns a normalized http(s) base URL, or null if invalid. */
export function normalizeServerUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function setServerUrl(url: string): boolean {
  const normalized = normalizeServerUrl(url);
  if (!normalized) return false;
  serverUrl = normalized;
  localStorage.setItem('counter_server_url', serverUrl);
  return true;
}

export function getToken(): string { return authToken; }
export function setToken(token: string): void {
  authToken = token;
  localStorage.setItem('counter_token', token);
}

export function clearAuth(): void {
  authToken = '';
  localStorage.removeItem('counter_token');
}

export const MUST_CHANGE_PASSWORD = 'MUST_CHANGE_PASSWORD';
export const MUST_CHANGE_PASSWORD_MSG = 'Bạn cần đổi mật khẩu trước khi tiếp tục';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

// Called when the server answers 403 MUST_CHANGE_PASSWORD
let mustChangePasswordHandler: (() => void) | null = null;
export function onMustChangePassword(handler: () => void): void {
  mustChangePasswordHandler = handler;
}

async function apiFetch(path: string, options?: RequestInit & { noAuth?: boolean }): Promise<any> {
  const method = options?.method || 'GET';
  console.debug('[API]', method, path);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options?.noAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const { noAuth: _noAuth, ...fetchOptions } = options || {};
  const res = await fetch(`${serverUrl}/api${path}`, { ...fetchOptions, headers });
  if (!res.ok) {
    if (res.status === 401 && !options?.noAuth) {
      console.warn('[API] 401 session expired:', path);
      clearAuth();
      throw new ApiError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 401, 'SESSION_EXPIRED');
    }
    console.warn('[API] Error', res.status, path);
    const err = await res.json().catch(() => ({} as { error?: string }));
    const serverMsg: string = typeof err?.error === 'string' ? err.error : '';
    if (res.status === 403 && serverMsg === MUST_CHANGE_PASSWORD) {
      mustChangePasswordHandler?.();
      throw new ApiError(MUST_CHANGE_PASSWORD_MSG, 403, MUST_CHANGE_PASSWORD);
    }
    let msg = serverMsg;
    if (!msg) {
      msg = res.status === 429
        ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút'
        : `Lỗi kết nối (HTTP ${res.status})`;
    }
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

// Auth
export async function login(username: string, password: string): Promise<{ user: any; mustChangePassword: boolean }> {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    noAuth: true,
  });
  setToken(data.token);
  const mustChangePassword = !!(data.must_change_password ?? data.user?.must_change_password);
  return { user: data.user, mustChangePassword };
}

export async function getMe() {
  return apiFetch('/auth/me');
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const data = await apiFetch('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
  // Server revokes older tokens on password change and returns a fresh one.
  if (data && typeof data.token === 'string') setToken(data.token);
  return data;
}

// Areas & Counters
export async function getAreas() { return apiFetch('/areas'); }
export async function getCounters(areaId: number) { return apiFetch(`/areas/${areaId}/counters`); }
export async function getServiceTypes(areaId: number) { return apiFetch(`/areas/${areaId}/service-types`); }
export async function getQueueStatus(areaId: number) { return apiFetch(`/areas/${areaId}/queue`); }

// Tickets
export async function callNext(counterId: number, serviceTypeId?: number) {
  const body: any = { counter_id: counterId };
  if (serviceTypeId) body.service_type_id = serviceTypeId;
  return apiFetch('/tickets/call-next', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function recallTicket(ticketId: number, counterId: number) {
  return apiFetch(`/tickets/${ticketId}/recall`, {
    method: 'POST',
    body: JSON.stringify({ counter_id: counterId }),
  });
}

export async function completeTicket(ticketId: number) {
  return apiFetch(`/tickets/${ticketId}/complete`, { method: 'POST' });
}

export async function skipTicket(ticketId: number) {
  return apiFetch(`/tickets/${ticketId}/skip`, { method: 'POST' });
}

export async function resetQueue() {
  return apiFetch('/tickets/reset', { method: 'POST' });
}

// Users (admin)
export async function getUsers() { return apiFetch('/users'); }
export async function createUser(data: { username: string; password: string; display_name: string; role: string }) {
  return apiFetch('/users', { method: 'POST', body: JSON.stringify(data) });
}
export async function deleteUser(id: number) {
  return apiFetch(`/users/${id}`, { method: 'DELETE' });
}

// Areas management (admin)
export async function createArea(name: string) {
  return apiFetch('/areas', { method: 'POST', body: JSON.stringify({ name }) });
}
export async function deleteArea(id: number) {
  return apiFetch(`/areas/${id}`, { method: 'DELETE' });
}
export async function createServiceType(areaId: number, name: string, prefix: string) {
  return apiFetch('/service-types', { method: 'POST', body: JSON.stringify({ area_id: areaId, name, prefix }) });
}
export async function deleteServiceType(id: number) {
  return apiFetch(`/service-types/${id}`, { method: 'DELETE' });
}
export async function createCounter(areaId: number, name: string) {
  return apiFetch('/counters', { method: 'POST', body: JSON.stringify({ area_id: areaId, name }) });
}
export async function deleteCounter(id: number) {
  return apiFetch(`/counters/${id}`, { method: 'DELETE' });
}

// Settings (admin)
export async function getSettings() { return apiFetch('/settings'); }
export async function updateSettings(data: Record<string, string>) {
  return apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) });
}

// Socket
export function connectSocket(areaId: number): Socket {
  console.info('[Socket] Connecting to area', areaId);
  const socket = io(serverUrl);
  socket.on('connect', () => {
    console.info('[Socket] Connected, joining area', areaId);
    socket.emit('join:area', areaId);
  });
  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected:', reason);
  });
  return socket;
}
