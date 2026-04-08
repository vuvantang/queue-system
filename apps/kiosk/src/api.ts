import { io, Socket } from 'socket.io-client';

let serverUrl = localStorage.getItem('kiosk_server_url') || 'http://localhost:3000';
let authToken = localStorage.getItem('kiosk_token') || '';

export function getServerUrl(): string { return serverUrl; }

export function setServerUrl(url: string): void {
  serverUrl = url.replace(/\/+$/, '');
  localStorage.setItem('kiosk_server_url', serverUrl);
}

export function getToken(): string { return authToken; }

export function setToken(t: string): void {
  authToken = t;
  localStorage.setItem('kiosk_token', t);
}

export function clearAuth(): void {
  authToken = '';
  localStorage.removeItem('kiosk_token');
}

async function apiFetch(path: string, options?: RequestInit & { noAuth?: boolean }): Promise<any> {
  const method = options?.method || 'GET';
  console.debug('[API]', method, path);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options?.noAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${serverUrl}/api${path}`, { headers, ...options });
  if (!res.ok) {
    if (res.status === 401 && !options?.noAuth) {
      console.warn('[API] 401 session expired:', path);
      clearAuth();
      throw new Error('SESSION_EXPIRED');
    }
    console.warn('[API] Error', res.status, path);
    const err = await res.json().catch(() => ({ error: 'Lỗi kết nối' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Auth
export async function login(username: string, password: string) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    noAuth: true,
  } as any);
  setToken(data.token);
  return data.user;
}

export async function getMe() {
  return apiFetch('/auth/me');
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
