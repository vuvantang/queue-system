import { io, Socket } from 'socket.io-client';

// The kiosk only uses public endpoints. The operator login is a gate only:
// the returned bearer token is never stored (not in memory, not on disk).
try { localStorage.removeItem('kiosk_token'); } catch { /* ignore */ }

let serverUrl = localStorage.getItem('kiosk_server_url') || 'http://localhost:3000';

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
  localStorage.setItem('kiosk_server_url', serverUrl);
  return true;
}

export function hasSavedServerUrl(): boolean {
  return !!localStorage.getItem('kiosk_server_url');
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const method = options?.method || 'GET';
  console.debug('[API]', method, path);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const res = await fetch(`${serverUrl}/api${path}`, { ...options, headers });
  if (!res.ok) {
    console.warn('[API] Error', res.status, path);
    const err = await res.json().catch(() => ({} as { error?: string }));
    let msg: string = typeof err?.error === 'string' && err.error ? err.error : '';
    if (!msg) {
      msg = res.status === 429
        ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút'
        : `Lỗi kết nối (HTTP ${res.status})`;
    }
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

// Auth — verify operator credentials only; the token is discarded.
export async function verifyOperator(username: string, password: string): Promise<void> {
  await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

// Data
export async function getSettings(): Promise<Record<string, string>> {
  return apiFetch('/settings');
}

export async function getAreas(): Promise<{ id: number; name: string; is_active: number }[]> {
  return apiFetch('/areas');
}

export async function getServiceTypes(areaId: number): Promise<{ id: number; name: string; prefix: string; is_active: number }[]> {
  return apiFetch(`/areas/${areaId}/service-types`);
}

export async function getCounters(areaId: number): Promise<{ id: number; name: string }[]> {
  return apiFetch(`/areas/${areaId}/counters`);
}

export async function getQueueStatus(areaId: number): Promise<{ waiting_count: number; completed_count: number }> {
  return apiFetch(`/areas/${areaId}/queue`);
}

export async function createTicket(serviceTypeId: number): Promise<{
  id: number;
  ticket_number: string;
  area_id: number;
  status: string;
  created_at: string;
}> {
  return apiFetch('/tickets', {
    method: 'POST',
    body: JSON.stringify({ service_type_id: serviceTypeId }),
  });
}

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
