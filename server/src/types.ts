export interface User {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: 'admin' | 'staff';
  is_active: number;
  must_change_password: number;
  created_at: string;
}

export interface Area {
  id: number;
  name: string;
  is_active: number;
  announce_template: string;
}

export interface ServiceType {
  id: number;
  area_id: number;
  name: string;
  prefix: string;
  next_number: number;
  is_active: number;
}

export interface Counter {
  id: number;
  area_id: number;
  name: string;
  is_active: number;
}

export interface Ticket {
  id: number;
  ticket_number: string;
  service_type_id: number;
  area_id: number;
  status: 'waiting' | 'serving' | 'completed' | 'skipped';
  counter_id: number | null;
  called_by: number | null;
  created_at: string;
  called_at: string | null;
  completed_at: string | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface QueueStatus {
  serving: (Ticket & { counter_name?: string; service_type_name?: string })[];
  waiting: (Ticket & { service_type_name?: string })[];
  completed_count: number;
  waiting_count: number;
  service_types: { id: number; name: string; prefix: string }[];
}

export interface Advertisement {
  id: number;
  image_path: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

export interface JwtPayload {
  userId: number;
  username: string;
  role: 'admin' | 'staff';
}
