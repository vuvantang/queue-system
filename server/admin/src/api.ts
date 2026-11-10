const API_BASE = '/api';

let token = localStorage.getItem('admin_token') || '';

export function getToken(): string { return token; }

export function setToken(t: string) {
  token = t;
  localStorage.setItem('admin_token', t);
}

export function clearToken() {
  token = '';
  localStorage.removeItem('admin_token');
}

export const PASSWORD_POLICY_HINT = 'Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt (ví dụ: !@#$%).';

/** Fired when the server says the current user must change their password first. */
export const MUST_CHANGE_PASSWORD_EVENT = 'bamso:must-change-password';
/** Fired when the session token is rejected (expired, revoked, user locked/deleted). */
export const SESSION_EXPIRED_EVENT = 'bamso:session-expired';

async function apiFetch(path: string, options?: RequestInit & { noAuth?: boolean }): Promise<any> {
  const headers: Record<string, string> = {};
  if (!options?.noAuth && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Don't set Content-Type for FormData
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  if (res.status === 401 && !options?.noAuth) {
    clearToken();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (res.status === 403 && err?.error === 'MUST_CHANGE_PASSWORD') {
      window.dispatchEvent(new Event(MUST_CHANGE_PASSWORD_EVENT));
      throw new Error('Bạn cần đổi mật khẩu trước khi tiếp tục');
    }
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface LoginResult {
  user: { id: number; username: string; display_name: string; role: 'admin' | 'staff'; must_change_password: number };
  must_change_password: boolean;
}

// Auth
export async function login(username: string, password: string): Promise<LoginResult> {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    noAuth: true,
  } as any);
  setToken(data.token);
  return { user: data.user, must_change_password: !!data.must_change_password };
}

export async function getMe(): Promise<LoginResult['user']> {
  return apiFetch('/auth/me');
}

/** Change own password. The server revokes older tokens and returns a new one. */
export async function changePassword(oldPassword: string, newPassword: string) {
  const data = await apiFetch('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
  if (data?.token) setToken(data.token);
  return data;
}

// Settings
export async function getSettings(): Promise<Record<string, string>> {
  return apiFetch('/settings');
}

export async function updateSettings(data: Record<string, string>) {
  return apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) });
}

export async function uploadLogo(file: File) {
  const form = new FormData();
  form.append('logo', file);
  return apiFetch('/settings/logo', { method: 'POST', body: form });
}

export async function deleteLogo() {
  return apiFetch('/settings/logo', { method: 'DELETE' });
}

// Areas
export async function getAreas() {
  return apiFetch('/areas');
}

export async function createArea(name: string) {
  return apiFetch('/areas', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function updateArea(id: number, data: { name?: string; announce_template?: string }) {
  return apiFetch(`/areas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteArea(id: number) {
  return apiFetch(`/areas/${id}`, { method: 'DELETE' });
}

// Service types
export async function getServiceTypes(areaId: number) {
  return apiFetch(`/areas/${areaId}/service-types`);
}

export async function createServiceType(areaId: number, name: string, prefix: string) {
  return apiFetch('/service-types', { method: 'POST', body: JSON.stringify({ area_id: areaId, name, prefix }) });
}

export async function updateServiceType(id: number, data: { name?: string; prefix?: string }) {
  return apiFetch(`/service-types/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteServiceType(id: number) {
  return apiFetch(`/service-types/${id}`, { method: 'DELETE' });
}

// Counters
export async function getCounters(areaId: number) {
  return apiFetch(`/areas/${areaId}/counters`);
}

export async function createCounter(areaId: number, name: string) {
  return apiFetch('/counters', { method: 'POST', body: JSON.stringify({ area_id: areaId, name }) });
}

export async function deleteCounter(id: number) {
  return apiFetch(`/counters/${id}`, { method: 'DELETE' });
}

// Reset
export async function resetArea(areaId: number) {
  return apiFetch(`/tickets/reset/${areaId}`, { method: 'POST' });
}

// Reports
export async function getReportStats(params: { from: string; to: string; area_id?: number }) {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  if (params.area_id) query.set('area_id', String(params.area_id));
  return apiFetch(`/reports/stats?${query}`);
}

// Users
export async function getUsers() {
  return apiFetch('/users');
}

export async function createUser(data: { username: string; password: string; display_name: string; role: string }) {
  return apiFetch('/users', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateUser(id: number, data: { display_name?: string; role?: string; is_active?: number; password?: string }) {
  return apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteUser(id: number) {
  return apiFetch(`/users/${id}`, { method: 'DELETE' });
}

// Advertisements
export async function getAdvertisements() {
  return apiFetch('/advertisements/all');
}

export async function uploadAdvertisement(file: File) {
  const form = new FormData();
  form.append('image', file);
  return apiFetch('/advertisements', { method: 'POST', body: form });
}

export async function updateAdvertisement(id: number, data: { sort_order?: number; is_active?: number }) {
  return apiFetch(`/advertisements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function reorderAdvertisements(order: number[]) {
  return apiFetch('/advertisements/reorder', { method: 'PUT', body: JSON.stringify({ order }) });
}

export async function deleteAdvertisement(id: number) {
  return apiFetch(`/advertisements/${id}`, { method: 'DELETE' });
}
