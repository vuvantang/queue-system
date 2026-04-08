import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Flex, Heading, Text, TextField, Button, Card, Tabs,
  Table, IconButton, Callout, Separator, Badge, Dialog, Select,
} from '@radix-ui/themes';
import * as api from '../api';

interface Props {
  onLogout: () => void;
}

interface Area {
  id: number;
  name: string;
  is_active: number;
  announce_template: string;
}

interface ServiceType {
  id: number;
  area_id: number;
  name: string;
  prefix: string;
}

interface Counter {
  id: number;
  area_id: number;
  name: string;
}

interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'staff';
  is_active: number;
}

export default function Dashboard({ onLogout }: Props) {
  return (
    <Box className="min-h-screen bg-[var(--color-background)]">
      {/* Top bar */}
      <Flex
        align="center"
        justify="between"
        px="5"
        py="3"
        className="border-b border-[var(--gray-a5)]"
      >
        <Heading size="4" style={{ color: '#14531b' }}>Queue Admin</Heading>
        <Button variant="soft" color="red" size="1" onClick={onLogout}>
          Đăng xuất
        </Button>
      </Flex>

      <Box p="5" className="max-w-4xl mx-auto">
        <Tabs.Root defaultValue="settings">
          <Tabs.List>
            <Tabs.Trigger value="settings">Cài đặt</Tabs.Trigger>
            <Tabs.Trigger value="areas">Khu vực</Tabs.Trigger>
            <Tabs.Trigger value="users">Tài khoản</Tabs.Trigger>
            <Tabs.Trigger value="reports">Báo cáo</Tabs.Trigger>
            <Tabs.Trigger value="ads">Quảng cáo</Tabs.Trigger>
          </Tabs.List>

          <Box pt="4">
            <Tabs.Content value="settings">
              <SettingsTab />
            </Tabs.Content>
            <Tabs.Content value="areas">
              <AreasTab />
            </Tabs.Content>
            <Tabs.Content value="users">
              <UsersTab />
            </Tabs.Content>
            <Tabs.Content value="reports">
              <ReportsTab />
            </Tabs.Content>
            <Tabs.Content value="ads">
              <AdsTab />
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Box>
    </Box>
  );
}

/* ─── Settings Tab ─── */
function SettingsTab() {
  const [orgName, setOrgName] = useState('');
  const [logo, setLogo] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [phones, setPhones] = useState<Array<{ label: string; phone: string }>>([]);
  const [savingPhones, setSavingPhones] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      setOrgName(s.org_name || '');
      setLogo(s.logo || '');
      try { setPhones(JSON.parse(s.contact_phones || '[]')); } catch { setPhones([]); }
    });
  }, []);

  const saveOrgName = async () => {
    setSaving(true);
    setMsg('');
    try {
      await api.updateSettings({ org_name: orgName });
      setMsg('Đã lưu');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.uploadLogo(file);
      setLogo(res.logo);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      await api.deleteLogo();
      setLogo('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Flex direction="column" gap="4">
      {/* Org name */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Tên tổ chức</Heading>
          <Flex gap="2" align="end">
            <Box className="flex-1">
              <TextField.Root
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Nhập tên tổ chức"
              />
            </Box>
            <Button onClick={saveOrgName} loading={saving}>Lưu</Button>
          </Flex>
          {msg && (
            <Text size="2" color={msg === 'Đã lưu' ? 'green' : 'red'}>{msg}</Text>
          )}
        </Flex>
      </Card>

      {/* Logo */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Logo</Heading>

          {logo && (
            <Flex align="center" gap="4">
              <img
                src={logo}
                alt="Logo"
                className="h-16 w-auto object-contain rounded-lg border border-[var(--gray-a5)] p-1"
              />
              <Button variant="soft" color="red" size="1" onClick={handleDeleteLogo}>
                Xóa logo
              </Button>
            </Flex>
          )}

          <Flex gap="2" align="center">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              {logo ? 'Đổi logo' : 'Chọn logo'}
            </Button>
            <Text size="1" color="gray">PNG, JPG, SVG - tối đa 5MB</Text>
          </Flex>
        </Flex>
      </Card>

      {/* Contact phones */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Số điện thoại liên hệ</Heading>

          {phones.map((p, i) => (
            <Flex key={i} gap="2" align="end">
              <Box className="flex-1">
                <TextField.Root
                  value={p.label}
                  onChange={(e) => {
                    const next = [...phones];
                    next[i] = { ...next[i], label: e.target.value };
                    setPhones(next);
                  }}
                  placeholder="Tên (VD: Hotline)"
                />
              </Box>
              <Box className="flex-1">
                <TextField.Root
                  value={p.phone}
                  onChange={(e) => {
                    const next = [...phones];
                    next[i] = { ...next[i], phone: e.target.value };
                    setPhones(next);
                  }}
                  placeholder="Số điện thoại"
                />
              </Box>
              <Button variant="soft" color="red" size="1" onClick={() => {
                setPhones(phones.filter((_, j) => j !== i));
              }}>Xóa</Button>
            </Flex>
          ))}

          <Flex gap="2">
            <Button variant="outline" size="1" onClick={() => setPhones([...phones, { label: '', phone: '' }])}>
              + Thêm số điện thoại
            </Button>
          </Flex>

          <Flex gap="2" align="center">
            <Button onClick={async () => {
              setSavingPhones(true);
              setPhoneMsg('');
              try {
                await api.updateSettings({ contact_phones: JSON.stringify(phones.filter(p => p.phone.trim())) });
                setPhoneMsg('Đã lưu');
                setTimeout(() => setPhoneMsg(''), 2000);
              } catch (err: any) {
                setPhoneMsg(err.message);
              } finally {
                setSavingPhones(false);
              }
            }} loading={savingPhones}>Lưu</Button>
            {phoneMsg && (
              <Text size="2" color={phoneMsg === 'Đã lưu' ? 'green' : 'red'}>{phoneMsg}</Text>
            )}
          </Flex>
        </Flex>
      </Card>
    </Flex>
  );
}

/* ─── Areas Tab ─── */
function AreasTab() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [newAreaName, setNewAreaName] = useState('');

  const loadAreas = useCallback(async () => {
    const data = await api.getAreas();
    setAreas(data);
  }, []);

  useEffect(() => { loadAreas(); }, [loadAreas]);

  const handleAddArea = async () => {
    if (!newAreaName.trim()) return;
    try {
      await api.createArea(newAreaName.trim());
      setNewAreaName('');
      loadAreas();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteArea = async (id: number) => {
    if (!confirm('Xóa khu vực này? Tất cả quầy và dịch vụ sẽ bị xóa theo.')) return;
    try {
      await api.deleteArea(id);
      loadAreas();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Flex direction="column" gap="4">
      {/* Add area */}
      <Card>
        <Flex gap="2" align="end">
          <Box className="flex-1">
            <Text size="2" color="gray" mb="1" className="block">Thêm khu vực</Text>
            <TextField.Root
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="Tên khu vực"
              onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
            />
          </Box>
          <Button onClick={handleAddArea}>Thêm</Button>
        </Flex>
      </Card>

      {/* Area list */}
      {areas.map(area => (
        <AreaCard key={area.id} area={area} onDelete={() => handleDeleteArea(area.id)} onRename={loadAreas} />
      ))}

      {areas.length === 0 && (
        <Text color="gray" size="2" className="text-center py-8">Chưa có khu vực nào</Text>
      )}
    </Flex>
  );
}

/* ─── Area Card ─── */
function AreaCard({ area, onDelete, onRename }: { area: Area; onDelete: () => void; onRename: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  const [announceTemplate, setAnnounceTemplate] = useState(area.announce_template || 'Mời số {ticket}, đến {counter}');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [newStName, setNewStName] = useState('');
  const [newStPrefix, setNewStPrefix] = useState('');
  const [newCounterName, setNewCounterName] = useState('');

  const load = useCallback(async () => {
    const [st, ct] = await Promise.all([
      api.getServiceTypes(area.id),
      api.getCounters(area.id),
    ]);
    setServiceTypes(st);
    setCounters(ct);
  }, [area.id]);

  useEffect(() => { load(); }, [load]);

  const saveName = async () => {
    try {
      await api.updateArea(area.id, { name });
      setEditing(false);
      onRename();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addServiceType = async () => {
    if (!newStName.trim() || !newStPrefix.trim()) return;
    try {
      await api.createServiceType(area.id, newStName.trim(), newStPrefix.trim().toUpperCase());
      setNewStName('');
      setNewStPrefix('');
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const addCounter = async () => {
    if (!newCounterName.trim()) return;
    try {
      await api.createCounter(area.id, newCounterName.trim());
      setNewCounterName('');
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Card>
      <Flex direction="column" gap="3">
        {/* Area header */}
        <Flex align="center" justify="between">
          {editing ? (
            <Flex gap="2" align="center" className="flex-1">
              <TextField.Root
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="flex-1"
              />
              <Button size="1" onClick={saveName}>Lưu</Button>
              <Button size="1" variant="soft" color="gray" onClick={() => { setName(area.name); setEditing(false); }}>Hủy</Button>
            </Flex>
          ) : (
            <Flex align="center" gap="2">
              <Heading size="3">{area.name}</Heading>
              <Badge size="1" color="blue">ID: {area.id}</Badge>
              <Text size="1" color="gray" className="cursor-pointer hover:underline" onClick={() => setEditing(true)}>
                Sửa tên
              </Text>
            </Flex>
          )}
          <Button size="1" variant="soft" color="red" onClick={onDelete}>Xóa</Button>
        </Flex>

        <Flex align="center" justify="between">
          <Text size="1" color="gray">
            TV Display: <code className="bg-[var(--gray-a3)] px-1 rounded">/tv/{area.id}</code>
          </Text>
          <Button
            size="1"
            variant="soft"
            color="orange"
            onClick={async () => {
              if (!confirm(`Reset hàng đợi khu vực "${area.name}"?`)) return;
              try { await api.resetArea(area.id); alert('Đã reset khu vực'); } catch (e: any) { alert(e.message); }
            }}
          >
            Reset hàng đợi
          </Button>
        </Flex>

        {/* Announce template */}
        <Box>
          <Text size="2" weight="bold" mb="1" className="block">Chuỗi phát âm khi gọi số</Text>
          <Text size="1" color="gray" mb="2" className="block">
            Biến: {'{ticket}'} = số thứ tự, {'{counter}'} = tên quầy, {'{service}'} = loại dịch vụ
          </Text>
          <Flex gap="2" align="end">
            <Box className="flex-1">
              <TextField.Root
                value={announceTemplate}
                onChange={(e) => setAnnounceTemplate(e.target.value)}
                placeholder="Mời số {ticket}, đến {counter}"
                size="1"
              />
            </Box>
            <Button
              size="1"
              loading={savingTemplate}
              onClick={async () => {
                setSavingTemplate(true);
                try {
                  await api.updateArea(area.id, { announce_template: announceTemplate });
                } catch (e: any) {
                  alert(e.message);
                } finally {
                  setSavingTemplate(false);
                }
              }}
            >
              Lưu
            </Button>
          </Flex>
        </Box>

        <Separator size="4" />

        {/* Service Types */}
        <Box>
          <Text size="2" weight="bold" mb="2" className="block">Loại dịch vụ</Text>
          <Flex gap="2" mb="2" align="end">
            <TextField.Root
              value={newStName}
              onChange={(e) => setNewStName(e.target.value)}
              placeholder="Tên dịch vụ"
              size="1"
              className="flex-1"
            />
            <TextField.Root
              value={newStPrefix}
              onChange={(e) => setNewStPrefix(e.target.value)}
              placeholder="Prefix"
              size="1"
              style={{ width: 80 }}
            />
            <Button size="1" onClick={addServiceType}>Thêm</Button>
          </Flex>

          {serviceTypes.length > 0 ? (
            <Table.Root size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Prefix</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Tên</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell width="100px"></Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {serviceTypes.map(st => (
                  <ServiceTypeRow key={st.id} st={st} onReload={load} />
                ))}
              </Table.Body>
            </Table.Root>
          ) : (
            <Text size="1" color="gray">Chưa có loại dịch vụ</Text>
          )}
        </Box>

        <Separator size="4" />

        {/* Counters */}
        <Box>
          <Text size="2" weight="bold" mb="2" className="block">Quầy phục vụ</Text>
          <Flex gap="2" mb="2" align="end">
            <TextField.Root
              value={newCounterName}
              onChange={(e) => setNewCounterName(e.target.value)}
              placeholder="Tên quầy"
              size="1"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCounter()}
            />
            <Button size="1" onClick={addCounter}>Thêm</Button>
          </Flex>

          {counters.length > 0 ? (
            <Flex gap="2" wrap="wrap">
              {counters.map(c => (
                <Badge key={c.id} size="2" variant="surface">
                  {c.name}
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="red"
                    className="ml-1"
                    onClick={async () => {
                      try { await api.deleteCounter(c.id); load(); } catch (e: any) { alert(e.message); }
                    }}
                  >
                    ✕
                  </IconButton>
                </Badge>
              ))}
            </Flex>
          ) : (
            <Text size="1" color="gray">Chưa có quầy</Text>
          )}
        </Box>
      </Flex>
    </Card>
  );
}

/* ─── Service Type Row (inline edit) ─── */
function ServiceTypeRow({ st, onReload }: { st: ServiceType; onReload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(st.name);
  const [editPrefix, setEditPrefix] = useState(st.prefix);

  const save = async () => {
    try {
      await api.updateServiceType(st.id, { name: editName.trim(), prefix: editPrefix.trim().toUpperCase() });
      setEditing(false);
      onReload();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (editing) {
    return (
      <Table.Row>
        <Table.Cell>
          <TextField.Root value={editPrefix} onChange={(e) => setEditPrefix(e.target.value)} size="1" style={{ width: 60 }} />
        </Table.Cell>
        <Table.Cell>
          <TextField.Root value={editName} onChange={(e) => setEditName(e.target.value)} size="1" onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Table.Cell>
        <Table.Cell>
          <Flex gap="1">
            <Button size="1" onClick={save}>Lưu</Button>
            <Button size="1" variant="soft" color="gray" onClick={() => { setEditName(st.name); setEditPrefix(st.prefix); setEditing(false); }}>Hủy</Button>
          </Flex>
        </Table.Cell>
      </Table.Row>
    );
  }

  return (
    <Table.Row>
      <Table.Cell><Badge>{st.prefix}</Badge></Table.Cell>
      <Table.Cell>{st.name}</Table.Cell>
      <Table.Cell>
        <Flex gap="1">
          <IconButton size="1" variant="ghost" onClick={() => setEditing(true)}>✎</IconButton>
          <IconButton size="1" variant="ghost" color="red" onClick={async () => {
            try { await api.deleteServiceType(st.id); onReload(); } catch (e: any) { alert(e.message); }
          }}>✕</IconButton>
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
}

/* ─── Reports Tab ─── */
interface ReportData {
  summary: {
    total: number;
    completed: number;
    skipped: number;
    waiting: number;
    serving: number;
    avg_serve_seconds: number | null;
    avg_wait_seconds: number | null;
  };
  daily: { date: string; total: number; completed: number; skipped: number }[];
  byService: { name: string; prefix: string; total: number }[];
  byCounter: { counter_name: string; staff_name: string | null; total: number; avg_serve_seconds: number | null }[];
  hourly: { hour: number; total: number }[];
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || isNaN(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

function BarChart({ items, color }: { items: { label: string; value: number; sub?: string }[]; color: string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <Flex direction="column" gap="2">
      {items.map((item, i) => (
        <Flex key={i} align="center" gap="3">
          <Text size="1" style={{ width: 90, textAlign: 'right', flexShrink: 0 }}>{item.label}</Text>
          <Box className="flex-1" style={{ position: 'relative', height: 24 }}>
            <Box
              style={{
                width: `${Math.max((item.value / max) * 100, 1)}%`,
                height: '100%',
                background: color,
                borderRadius: 4,
                transition: 'width 0.3s',
              }}
            />
          </Box>
          <Text size="1" weight="bold" style={{ width: 40, flexShrink: 0 }}>{item.value}</Text>
          {item.sub && <Text size="1" color="gray" style={{ width: 60, flexShrink: 0 }}>{item.sub}</Text>}
        </Flex>
      ))}
    </Flex>
  );
}

function ReportsTab() {
  const today = new Date().toLocaleDateString('en-CA');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [areaId, setAreaId] = useState<number | undefined>();
  const [areas, setAreas] = useState<Area[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAreas().then(setAreas);
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getReportStats({ from, to, area_id: areaId });
      setData(result);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, areaId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  return (
    <Flex direction="column" gap="4">
      {/* Filters */}
      <Card>
        <Flex gap="3" align="end" wrap="wrap">
          <Box>
            <Text size="1" color="gray" className="block" mb="1">Từ ngày</Text>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--gray-a5)', fontSize: 14 }}
            />
          </Box>
          <Box>
            <Text size="1" color="gray" className="block" mb="1">Đến ngày</Text>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--gray-a5)', fontSize: 14 }}
            />
          </Box>
          <Box>
            <Text size="1" color="gray" className="block" mb="1">Khu vực</Text>
            <Select.Root
              value={areaId != null ? String(areaId) : 'all'}
              onValueChange={(v) => setAreaId(v === 'all' ? undefined : Number(v))}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="all">Tất cả</Select.Item>
                {areas.map(a => (
                  <Select.Item key={a.id} value={String(a.id)}>{a.name}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>
          <Button onClick={loadReport} loading={loading}>Xem báo cáo</Button>
        </Flex>
      </Card>

      {data && (
        <>
          {/* Summary Cards */}
          <Flex gap="3" wrap="wrap">
            <Card className="flex-1" style={{ minWidth: 140 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Tổng số</Text>
                <Heading size="6" style={{ color: '#14531b' }}>{data.summary.total}</Heading>
              </Flex>
            </Card>
            <Card className="flex-1" style={{ minWidth: 140 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Đã phục vụ</Text>
                <Heading size="6" color="green">{data.summary.completed}</Heading>
              </Flex>
            </Card>
            <Card className="flex-1" style={{ minWidth: 140 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">Bỏ qua</Text>
                <Heading size="6" color="orange">{data.summary.skipped}</Heading>
              </Flex>
            </Card>
            <Card className="flex-1" style={{ minWidth: 140 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">TB chờ</Text>
                <Heading size="6" color="blue">{formatDuration(data.summary.avg_wait_seconds)}</Heading>
              </Flex>
            </Card>
            <Card className="flex-1" style={{ minWidth: 140 }}>
              <Flex direction="column" align="center" gap="1">
                <Text size="1" color="gray">TB phục vụ</Text>
                <Heading size="6" color="purple">{formatDuration(data.summary.avg_serve_seconds)}</Heading>
              </Flex>
            </Card>
          </Flex>

          {/* Daily Chart */}
          {data.daily.length > 0 && (
            <Card>
              <Heading size="3" mb="3">Theo ngày</Heading>
              <BarChart
                items={data.daily.map(d => ({
                  label: d.date.slice(5), // MM-DD
                  value: d.total,
                  sub: `${d.completed} xong`,
                }))}
                color="#1b8a2a"
              />
            </Card>
          )}

          {/* By Service Type */}
          {data.byService.length > 0 && (
            <Card>
              <Heading size="3" mb="3">Theo loại dịch vụ</Heading>
              <BarChart
                items={data.byService.map(s => ({
                  label: `${s.prefix} - ${s.name}`,
                  value: s.total,
                }))}
                color="#b8860b"
              />
            </Card>
          )}

          {/* Hourly Distribution */}
          {data.hourly.length > 0 && (
            <Card>
              <Heading size="3" mb="3">Theo giờ</Heading>
              <BarChart
                items={data.hourly.map(h => ({
                  label: `${String(h.hour).padStart(2, '0')}:00`,
                  value: h.total,
                }))}
                color="#2563eb"
              />
            </Card>
          )}

          {/* By Counter / Staff */}
          {data.byCounter.length > 0 && (
            <Card>
              <Heading size="3" mb="3">Theo quầy / nhân viên</Heading>
              <Table.Root size="2">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Quầy</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Nhân viên</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Đã phục vụ</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>TB phục vụ</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.byCounter.map((c, i) => (
                    <Table.Row key={i}>
                      <Table.Cell><Text weight="medium">{c.counter_name}</Text></Table.Cell>
                      <Table.Cell>{c.staff_name || '—'}</Table.Cell>
                      <Table.Cell><Badge color="green">{c.total}</Badge></Table.Cell>
                      <Table.Cell>{formatDuration(c.avg_serve_seconds)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Card>
          )}

          {data.summary.total === 0 && (
            <Card>
              <Text color="gray" size="2" className="text-center py-8">Không có dữ liệu trong khoảng thời gian này</Text>
            </Card>
          )}
        </>
      )}
    </Flex>
  );
}

/* ─── Users Tab ─── */
function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'staff' | 'admin'>('staff');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPassword, setEditPassword] = useState('');

  const loadUsers = useCallback(async () => {
    const data = await api.getUsers();
    setUsers(data);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleAdd = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) return;
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        display_name: newDisplayName.trim(),
        role: newRole,
      });
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('staff');
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa tài khoản này?')) return;
    try {
      await api.deleteUser(id);
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await api.updateUser(user.id, { is_active: user.is_active ? 0 : 1 });
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleChangeRole = async (user: User, role: string) => {
    try {
      await api.updateUser(user.id, { role });
      loadUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetPassword = async (id: number) => {
    if (!editPassword.trim()) return;
    try {
      await api.updateUser(id, { password: editPassword });
      setEditingId(null);
      setEditPassword('');
      alert('Đã đặt lại mật khẩu');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Flex direction="column" gap="4">
      {/* Add user form */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="3">Thêm tài khoản</Heading>
          <Flex gap="2" wrap="wrap">
            <TextField.Root
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Tên đăng nhập"
              size="2"
              style={{ minWidth: 140 }}
            />
            <TextField.Root
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mật khẩu"
              size="2"
              style={{ minWidth: 140 }}
            />
            <TextField.Root
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Tên hiển thị"
              size="2"
              style={{ minWidth: 140 }}
            />
            <Select.Root value={newRole} onValueChange={(v) => setNewRole(v as 'staff' | 'admin')}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="staff">Nhân viên</Select.Item>
                <Select.Item value="admin">Quản trị</Select.Item>
              </Select.Content>
            </Select.Root>
            <Button onClick={handleAdd}>Thêm</Button>
          </Flex>
        </Flex>
      </Card>

      {/* User list */}
      <Card>
        {users.length > 0 ? (
          <Table.Root size="2">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Username</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Tên hiển thị</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Vai trò</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Trạng thái</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {users.map(user => (
                <Table.Row key={user.id}>
                  <Table.Cell>
                    <Text weight="medium">{user.username}</Text>
                  </Table.Cell>
                  <Table.Cell>{user.display_name}</Table.Cell>
                  <Table.Cell>
                    <Select.Root value={user.role} onValueChange={(v) => handleChangeRole(user, v)}>
                      <Select.Trigger variant="ghost" />
                      <Select.Content>
                        <Select.Item value="staff">Nhân viên</Select.Item>
                        <Select.Item value="admin">Quản trị</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={user.is_active ? 'green' : 'red'}
                      className="cursor-pointer"
                      onClick={() => handleToggleActive(user)}
                    >
                      {user.is_active ? 'Hoạt động' : 'Khóa'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="1">
                      {editingId === user.id ? (
                        <Flex gap="1" align="center">
                          <TextField.Root
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Mật khẩu mới"
                            size="1"
                            style={{ width: 130 }}
                            onKeyDown={(e) => e.key === 'Enter' && handleResetPassword(user.id)}
                          />
                          <Button size="1" onClick={() => handleResetPassword(user.id)}>OK</Button>
                          <Button size="1" variant="soft" color="gray" onClick={() => { setEditingId(null); setEditPassword(''); }}>Hủy</Button>
                        </Flex>
                      ) : (
                        <Button size="1" variant="soft" onClick={() => setEditingId(user.id)}>
                          Đặt MK
                        </Button>
                      )}
                      <IconButton size="1" variant="ghost" color="red" onClick={() => handleDelete(user.id)}>
                        ✕
                      </IconButton>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          <Text color="gray" size="2" className="text-center py-4">Chưa có tài khoản nào</Text>
        )}
      </Card>
    </Flex>
  );
}

/* ============================== ADS TAB ============================== */

interface Ad {
  id: number;
  image_path: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

function AdsTab() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [slideDuration, setSlideDuration] = useState('5');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAds = useCallback(async () => {
    try {
      const list = await api.getAdvertisements();
      setAds(list);
    } catch (err: any) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadAds();
    api.getSettings().then(s => {
      if (s.ad_slide_duration) setSlideDuration(s.ad_slide_duration);
    });
  }, [loadAds]);

  const handleSaveDuration = async () => {
    const val = parseInt(slideDuration, 10);
    if (!val || val < 1) {
      setMsg('Thời gian phải >= 1 giây');
      setTimeout(() => setMsg(''), 2000);
      return;
    }
    setSaving(true);
    try {
      await api.updateSettings({ ad_slide_duration: String(val) });
      setMsg('Đã lưu');
      setTimeout(() => setMsg(''), 2000);
    } catch (err: any) {
      setMsg(err.message);
    }
    setSaving(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadAdvertisement(file);
      }
      await loadAds();
    } catch (err: any) {
      alert(err.message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa ảnh quảng cáo này?')) return;
    try {
      await api.deleteAdvertisement(id);
      await loadAds();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleActive = async (ad: Ad) => {
    try {
      await api.updateAdvertisement(ad.id, { is_active: ad.is_active ? 0 : 1 });
      await loadAds();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newAds = [...ads];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newAds.length) return;
    [newAds[index], newAds[swapIndex]] = [newAds[swapIndex], newAds[index]];
    const order = newAds.map(a => a.id);
    try {
      const updated = await api.reorderAdvertisements(order);
      setAds(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Flex direction="column" gap="4">
      {/* Slide duration config */}
      <Card>
        <Flex direction="column" gap="3">
          <Text weight="bold" size="3">Thời gian hiển thị mỗi slide</Text>
          <Flex align="center" gap="3">
            <TextField.Root
              value={slideDuration}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlideDuration(e.target.value)}
              type="number"
              min="1"
              style={{ width: 100 }}
              placeholder="5"
            />
            <Text size="2" color="gray">giây</Text>
            <Button onClick={handleSaveDuration} disabled={saving}>Lưu</Button>
            {msg && <Text size="2" color={msg === 'Đã lưu' ? 'green' : 'red'}>{msg}</Text>}
          </Flex>
        </Flex>
      </Card>

      {/* Upload */}
      <Card>
        <Flex direction="column" gap="3">
          <Text weight="bold" size="3">Ảnh quảng cáo</Text>
          <Text size="2" color="gray">
            Ảnh sẽ hiển thị trên TV khi không còn khách chờ và phục vụ. PNG, JPG, SVG, WebP - tối đa 5MB.
          </Text>
          <Flex align="center" gap="3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Đang tải...' : '+ Thêm ảnh'}
            </Button>
          </Flex>
        </Flex>
      </Card>

      {/* Ads list */}
      {ads.length > 0 && (
        <Card>
          <Flex direction="column" gap="3">
            <Text weight="bold" size="3">Danh sách ({ads.length} ảnh)</Text>
            {ads.map((ad, index) => (
              <Flex
                key={ad.id}
                align="center"
                gap="3"
                p="2"
                className={`rounded-lg border ${ad.is_active ? 'border-[var(--gray-a5)]' : 'border-[var(--gray-a3)] opacity-50'}`}
              >
                <Text size="2" color="gray" style={{ minWidth: 24, textAlign: 'center' }}>
                  {index + 1}
                </Text>
                <img
                  src={ad.image_path}
                  alt={`Ad ${ad.id}`}
                  className="rounded"
                  style={{ height: 60, width: 100, objectFit: 'cover' }}
                />
                <Flex direction="column" gap="1" style={{ flex: 1 }}>
                  <Badge color={ad.is_active ? 'green' : 'gray'} size="1">
                    {ad.is_active ? 'Đang hiện' : 'Đã ẩn'}
                  </Badge>
                </Flex>
                <Flex gap="1">
                  <IconButton
                    variant="ghost"
                    size="1"
                    disabled={index === 0}
                    onClick={() => handleMove(index, 'up')}
                    title="Di chuyển lên"
                  >
                    ▲
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    size="1"
                    disabled={index === ads.length - 1}
                    onClick={() => handleMove(index, 'down')}
                    title="Di chuyển xuống"
                  >
                    ▼
                  </IconButton>
                  <Button
                    variant="soft"
                    size="1"
                    color={ad.is_active ? 'gray' : 'green'}
                    onClick={() => handleToggleActive(ad)}
                  >
                    {ad.is_active ? 'Ẩn' : 'Hiện'}
                  </Button>
                  <Button variant="soft" color="red" size="1" onClick={() => handleDelete(ad.id)}>
                    Xóa
                  </Button>
                </Flex>
              </Flex>
            ))}
          </Flex>
        </Card>
      )}
    </Flex>
  );
}
