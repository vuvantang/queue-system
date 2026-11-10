import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Flex, Heading, Text, TextField, Button, Card, Tabs,
  Table, IconButton, Separator, Badge, Select, Skeleton,
} from '@radix-ui/themes';
import * as api from '../api';
import {
  PencilIcon, CrossIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon,
  PlusIcon, CheckIcon, ResetIcon, ExitIcon, UploadIcon,
} from '../icons';

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

/** Inline save feedback: success draws a check, errors stay readable. */
function SaveStatus({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg === 'Đã lưu';
  return (
    <Text
      size="2"
      color={ok ? 'green' : 'red'}
      weight="medium"
      role="status"
      className={ok ? 'save-ok' : 'anim-enter'}
    >
      {ok && <CheckIcon />}
      {msg}
    </Text>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Heading as="h2" size="3" weight="bold" className="section-title">{children}</Heading>;
}

export default function Dashboard({ onLogout }: Props) {
  const [brand, setBrand] = useState<{ name: string; logo: string }>({ name: '', logo: '' });

  useEffect(() => {
    api.getSettings()
      .then(s => setBrand({ name: s.org_name || '', logo: s.logo || '' }))
      .catch(() => {});
  }, []);

  return (
    <Box className="min-h-screen">
      {/* Top bar */}
      <header className="admin-header">
        <Flex align="center" justify="between" gap="3" px={{ initial: '4', sm: '6' }} py="3">
          <Flex align="center" gap="3" style={{ minWidth: 0 }}>
            {brand.logo && <img src={brand.logo} alt="" className="admin-header__logo" />}
            <Box style={{ minWidth: 0 }}>
              <Heading as="h1" size="4" style={{ color: 'var(--brand-strong)', lineHeight: 1.2 }}>Queue Admin</Heading>
              {brand.name && (
                <Text as="div" size="1" color="gray" truncate>{brand.name}</Text>
              )}
            </Box>
          </Flex>
          <Button variant="soft" color="gray" size="2" onClick={onLogout}>
            <ExitIcon />
            Đăng xuất
          </Button>
        </Flex>
      </header>

      <main className="admin-main">
        <Tabs.Root defaultValue="settings" className="admin-tabs">
          <Tabs.List size="2">
            <Tabs.Trigger value="settings">Cài đặt</Tabs.Trigger>
            <Tabs.Trigger value="areas">Khu vực</Tabs.Trigger>
            <Tabs.Trigger value="users">Tài khoản</Tabs.Trigger>
            <Tabs.Trigger value="reports">Báo cáo</Tabs.Trigger>
            <Tabs.Trigger value="ads">Quảng cáo</Tabs.Trigger>
          </Tabs.List>

          <Box pt="5">
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
      </main>
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
          <SectionTitle>Tên tổ chức</SectionTitle>
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
          <SaveStatus msg={msg} />
        </Flex>
      </Card>

      {/* Logo */}
      <Card>
        <Flex direction="column" gap="3">
          <SectionTitle>Logo</SectionTitle>

          {logo && (
            <Flex align="center" gap="4">
              <img
                src={logo}
                alt="Logo"
                className="h-16 w-auto object-contain rounded-lg border border-[var(--gray-a5)] p-1 bg-white"
              />
              <Button variant="soft" color="red" size="1" onClick={handleDeleteLogo}>
                <TrashIcon />
                Xóa logo
              </Button>
            </Flex>
          )}

          <Flex gap="2" align="center">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleUpload}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <UploadIcon />
              {logo ? 'Đổi logo' : 'Chọn logo'}
            </Button>
            <Text size="1" color="gray">PNG, JPG, SVG - tối đa 5MB</Text>
          </Flex>
        </Flex>
      </Card>

      {/* Contact phones */}
      <Card>
        <Flex direction="column" gap="3">
          <SectionTitle>Số điện thoại liên hệ</SectionTitle>

          {phones.length === 0 && (
            <Text size="2" color="gray">Chưa có số điện thoại nào.</Text>
          )}

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
              <IconButton
                variant="soft"
                color="red"
                size="2"
                aria-label={`Xóa số ${p.label || p.phone || i + 1}`}
                title="Xóa"
                onClick={() => {
                  setPhones(phones.filter((_, j) => j !== i));
                }}
              >
                <CrossIcon />
              </IconButton>
            </Flex>
          ))}

          <Flex gap="2">
            <Button variant="soft" size="2" onClick={() => setPhones([...phones, { label: '', phone: '' }])}>
              <PlusIcon />
              Thêm số điện thoại
            </Button>
          </Flex>

          <Separator size="4" />

          <Flex gap="3" align="center">
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
            <SaveStatus msg={phoneMsg} />
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
  const [loaded, setLoaded] = useState(false);

  const loadAreas = useCallback(async () => {
    try {
      const data = await api.getAreas();
      setAreas(data);
    } finally {
      setLoaded(true);
    }
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
            <Text as="label" htmlFor="new-area" size="2" weight="medium" mb="1" className="block">Thêm khu vực</Text>
            <TextField.Root
              id="new-area"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="Tên khu vực"
              onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
            />
          </Box>
          <Button onClick={handleAddArea}><PlusIcon />Thêm</Button>
        </Flex>
      </Card>

      {/* Area list */}
      {!loaded && <Skeleton height="280px" style={{ borderRadius: 'var(--radius-4)' }} />}

      {areas.map(area => (
        <AreaCard key={area.id} area={area} onDelete={() => handleDeleteArea(area.id)} onRename={loadAreas} />
      ))}

      {loaded && areas.length === 0 && (
        <Card>
          <Flex direction="column" align="center" gap="1" py="6">
            <Text size="2" weight="medium">Chưa có khu vực nào</Text>
            <Text size="2" color="gray">Nhập tên ở ô phía trên để tạo khu vực đầu tiên.</Text>
          </Flex>
        </Card>
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
  const [templateMsg, setTemplateMsg] = useState('');
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
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          {editing ? (
            <Flex gap="2" align="center" className="flex-1" style={{ minWidth: 240 }}>
              <TextField.Root
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="flex-1"
                aria-label="Tên khu vực"
                autoFocus
              />
              <Button size="2" onClick={saveName}>Lưu</Button>
              <Button size="2" variant="soft" color="gray" onClick={() => { setName(area.name); setEditing(false); }}>Hủy</Button>
            </Flex>
          ) : (
            <Flex align="center" gap="2" wrap="wrap">
              <Heading as="h2" size="4">{area.name}</Heading>
              <Badge size="1" color="gray" variant="soft" className="num">ID {area.id}</Badge>
              <Button size="1" variant="ghost" color="gray" onClick={() => setEditing(true)} style={{ marginLeft: 4 }}>
                <PencilIcon width={13} height={13} />
                Sửa tên
              </Button>
            </Flex>
          )}
          <Flex gap="2" align="center">
            <Button
              size="1"
              variant="soft"
              color="orange"
              onClick={async () => {
                if (!confirm(`Reset hàng đợi khu vực "${area.name}"?`)) return;
                try { await api.resetArea(area.id); alert('Đã reset khu vực'); } catch (e: any) { alert(e.message); }
              }}
            >
              <ResetIcon width={13} height={13} />
              Reset hàng đợi
            </Button>
            <Button size="1" variant="soft" color="red" onClick={onDelete}>
              <TrashIcon width={13} height={13} />
              Xóa
            </Button>
          </Flex>
        </Flex>

        <Text size="1" color="gray">
          TV Display: <code className="bg-[var(--gray-a3)] px-1.5 py-0.5 rounded text-[var(--gray-12)]">/tv/{area.id}</code>
        </Text>

        <Separator size="4" />

        {/* Announce template */}
        <Box>
          <Text as="label" htmlFor={`tpl-${area.id}`} size="2" weight="bold" mb="1" className="block">Chuỗi phát âm khi gọi số</Text>
          <Text size="1" color="gray" mb="2" className="block">
            Biến: <code>{'{ticket}'}</code> = số thứ tự, <code>{'{counter}'}</code> = tên quầy, <code>{'{service}'}</code> = loại dịch vụ
          </Text>
          <Flex gap="2" align="center" wrap="wrap">
            <Box className="flex-1" style={{ minWidth: 220 }}>
              <TextField.Root
                id={`tpl-${area.id}`}
                value={announceTemplate}
                onChange={(e) => setAnnounceTemplate(e.target.value)}
                placeholder="Mời số {ticket}, đến {counter}"
                size="2"
              />
            </Box>
            <Button
              size="2"
              loading={savingTemplate}
              onClick={async () => {
                setSavingTemplate(true);
                setTemplateMsg('');
                try {
                  await api.updateArea(area.id, { announce_template: announceTemplate });
                  setTemplateMsg('Đã lưu');
                  setTimeout(() => setTemplateMsg(''), 2000);
                } catch (e: any) {
                  alert(e.message);
                } finally {
                  setSavingTemplate(false);
                }
              }}
            >
              Lưu
            </Button>
            <SaveStatus msg={templateMsg} />
          </Flex>
        </Box>

        <Separator size="4" />

        {/* Service Types */}
        <Box>
          <Text size="2" weight="bold" mb="2" className="block">Loại dịch vụ</Text>
          <Flex gap="2" mb="3" align="end">
            <TextField.Root
              value={newStName}
              onChange={(e) => setNewStName(e.target.value)}
              placeholder="Tên dịch vụ"
              aria-label="Tên dịch vụ"
              size="2"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addServiceType()}
            />
            <TextField.Root
              value={newStPrefix}
              onChange={(e) => setNewStPrefix(e.target.value)}
              placeholder="Prefix"
              aria-label="Prefix"
              size="2"
              style={{ width: 88 }}
              onKeyDown={(e) => e.key === 'Enter' && addServiceType()}
            />
            <Button size="2" variant="soft" onClick={addServiceType}><PlusIcon />Thêm</Button>
          </Flex>

          {serviceTypes.length > 0 ? (
            <Table.Root size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell width="88px">Prefix</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Tên</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell width="88px"><span className="sr-only">Thao tác</span></Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {serviceTypes.map(st => (
                  <ServiceTypeRow key={st.id} st={st} onReload={load} />
                ))}
              </Table.Body>
            </Table.Root>
          ) : (
            <Text size="2" color="gray">Chưa có loại dịch vụ</Text>
          )}
        </Box>

        <Separator size="4" />

        {/* Counters */}
        <Box>
          <Text size="2" weight="bold" mb="2" className="block">Quầy phục vụ</Text>
          <Flex gap="2" mb="3" align="end">
            <TextField.Root
              value={newCounterName}
              onChange={(e) => setNewCounterName(e.target.value)}
              placeholder="Tên quầy"
              aria-label="Tên quầy"
              size="2"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCounter()}
            />
            <Button size="2" variant="soft" onClick={addCounter}><PlusIcon />Thêm</Button>
          </Flex>

          {counters.length > 0 ? (
            <Flex gap="2" wrap="wrap">
              {counters.map(c => (
                <Badge key={c.id} size="3" variant="surface" color="gray" highContrast>
                  {c.name}
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="red"
                    className="ml-1"
                    aria-label={`Xóa ${c.name}`}
                    title="Xóa quầy"
                    onClick={async () => {
                      if (!confirm(`Xóa quầy "${c.name}"?`)) return;
                      try { await api.deleteCounter(c.id); load(); } catch (e: any) { alert(e.message); }
                    }}
                  >
                    <CrossIcon width={12} height={12} />
                  </IconButton>
                </Badge>
              ))}
            </Flex>
          ) : (
            <Text size="2" color="gray">Chưa có quầy</Text>
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
          <TextField.Root value={editPrefix} onChange={(e) => setEditPrefix(e.target.value)} size="1" style={{ width: 60 }} aria-label="Prefix" />
        </Table.Cell>
        <Table.Cell>
          <TextField.Root value={editName} onChange={(e) => setEditName(e.target.value)} size="1" onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Tên dịch vụ" autoFocus />
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
      <Table.Cell><Badge size="2" variant="solid">{st.prefix}</Badge></Table.Cell>
      <Table.Cell>{st.name}</Table.Cell>
      <Table.Cell>
        <Flex gap="3" justify="end" pr="1">
          <IconButton size="1" variant="ghost" color="gray" aria-label={`Sửa ${st.name}`} title="Sửa" onClick={() => setEditing(true)}>
            <PencilIcon />
          </IconButton>
          <IconButton size="1" variant="ghost" color="red" aria-label={`Xóa ${st.name}`} title="Xóa" onClick={async () => {
            if (!confirm(`Xóa loại dịch vụ "${st.name}"?`)) return;
            try { await api.deleteServiceType(st.id); onReload(); } catch (e: any) { alert(e.message); }
          }}>
            <TrashIcon />
          </IconButton>
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
    <Flex direction="column" gap="2" role="list">
      {items.map((item, i) => (
        <Flex key={i} align="center" gap="3" role="listitem">
          <Text size="1" color="gray" className="bar-label num" title={item.label}>{item.label}</Text>
          <Box className="flex-1 bar-track">
            <Box
              className="bar-fill"
              style={{
                width: `${Math.max((item.value / max) * 100, 1)}%`,
                background: color,
                animationDelay: `${Math.min(i, 8) * 30}ms`,
              }}
            />
          </Box>
          <Text size="2" weight="bold" className="num" style={{ width: 40, flexShrink: 0 }}>{item.value}</Text>
          {item.sub && <Text size="1" color="gray" className="num" style={{ width: 60, flexShrink: 0 }}>{item.sub}</Text>}
        </Flex>
      ))}
    </Flex>
  );
}

function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <Card className="flex-1" style={{ minWidth: 150 }}>
      <Flex direction="column" gap="1">
        <Flex align="center" gap="2">
          {tone && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: tone, flexShrink: 0 }} />}
          <Text size="2" color="gray">{label}</Text>
        </Flex>
        <span className="stat-value">{value}</span>
      </Flex>
    </Card>
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
            <Text as="label" htmlFor="rp-from" size="2" weight="medium" className="block" mb="1">Từ ngày</Text>
            <input
              id="rp-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="date-field"
            />
          </Box>
          <Box>
            <Text as="label" htmlFor="rp-to" size="2" weight="medium" className="block" mb="1">Đến ngày</Text>
            <input
              id="rp-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="date-field"
            />
          </Box>
          <Box>
            <Text size="2" weight="medium" className="block" mb="1">Khu vực</Text>
            <Select.Root
              value={areaId != null ? String(areaId) : 'all'}
              onValueChange={(v) => setAreaId(v === 'all' ? undefined : Number(v))}
            >
              <Select.Trigger aria-label="Khu vực" style={{ minWidth: 160 }} />
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

      {!data && loading && (
        <Flex direction="column" gap="3" aria-busy="true">
          <Flex gap="3" wrap="wrap">
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} height="84px" className="flex-1" style={{ minWidth: 150 }} />)}
          </Flex>
          <Skeleton height="160px" />
        </Flex>
      )}

      {data && (
        <>
          {/* Summary */}
          <Flex gap="3" wrap="wrap">
            <StatTile label="Tổng số" value={data.summary.total} tone="var(--brand-strong)" />
            <StatTile label="Đã phục vụ" value={data.summary.completed} tone="var(--brand)" />
            <StatTile label="Bỏ qua" value={data.summary.skipped} tone="var(--gold)" />
            <StatTile label="TB chờ" value={formatDuration(data.summary.avg_wait_seconds)} />
            <StatTile label="TB phục vụ" value={formatDuration(data.summary.avg_serve_seconds)} />
          </Flex>

          {/* Daily Chart */}
          {data.daily.length > 0 && (
            <Card>
              <Box mb="4"><SectionTitle>Theo ngày</SectionTitle></Box>
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
              <Box mb="4"><SectionTitle>Theo loại dịch vụ</SectionTitle></Box>
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
              <Box mb="4"><SectionTitle>Theo giờ</SectionTitle></Box>
              <BarChart
                items={data.hourly.map(h => ({
                  label: `${String(h.hour).padStart(2, '0')}:00`,
                  value: h.total,
                }))}
                color="var(--brand-strong)"
              />
            </Card>
          )}

          {/* By Counter / Staff */}
          {data.byCounter.length > 0 && (
            <Card>
              <Box mb="4"><SectionTitle>Theo quầy / nhân viên</SectionTitle></Box>
              <Table.Root size="2" className="table-nowrap">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Quầy</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Nhân viên</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Đã phục vụ</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">TB phục vụ</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.byCounter.map((c, i) => (
                    <Table.Row key={i}>
                      <Table.Cell><Text weight="medium">{c.counter_name}</Text></Table.Cell>
                      <Table.Cell>{c.staff_name || '—'}</Table.Cell>
                      <Table.Cell justify="end"><Text weight="medium">{c.total}</Text></Table.Cell>
                      <Table.Cell justify="end">{formatDuration(c.avg_serve_seconds)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Card>
          )}

          {data.summary.total === 0 && (
            <Card>
              <Flex justify="center" py="6">
                <Text color="gray" size="2">Không có dữ liệu trong khoảng thời gian này</Text>
              </Flex>
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
  const [loaded, setLoaded] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } finally {
      setLoaded(true);
    }
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
      alert('Đã đặt lại mật khẩu. Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập tới.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Flex direction="column" gap="4">
      {/* Add user form */}
      <Card>
        <Flex direction="column" gap="3">
          <SectionTitle>Thêm tài khoản</SectionTitle>
          <Flex gap="2" wrap="wrap">
            <TextField.Root
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Tên đăng nhập"
              aria-label="Tên đăng nhập"
              size="2"
              className="flex-1"
              style={{ minWidth: 160 }}
            />
            <TextField.Root
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mật khẩu"
              aria-label="Mật khẩu"
              size="2"
              className="flex-1"
              style={{ minWidth: 160 }}
            />
            <TextField.Root
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Tên hiển thị"
              aria-label="Tên hiển thị"
              size="2"
              className="flex-1"
              style={{ minWidth: 160 }}
            />
            <Select.Root value={newRole} onValueChange={(v) => setNewRole(v as 'staff' | 'admin')}>
              <Select.Trigger aria-label="Vai trò" />
              <Select.Content>
                <Select.Item value="staff">Nhân viên</Select.Item>
                <Select.Item value="admin">Quản trị</Select.Item>
              </Select.Content>
            </Select.Root>
            <Button onClick={handleAdd}><PlusIcon />Thêm</Button>
          </Flex>
          <Text size="1" color="gray">
            Mật khẩu: {api.PASSWORD_POLICY_HINT} Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.
          </Text>
        </Flex>
      </Card>

      {/* User list */}
      <Card>
        {!loaded ? (
          <Flex direction="column" gap="3" p="2" aria-busy="true">
            <Skeleton height="20px" width="40%" />
            <Skeleton height="20px" />
            <Skeleton height="20px" />
          </Flex>
        ) : users.length > 0 ? (
          <Table.Root size="2" className="table-nowrap">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Username</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Tên hiển thị</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Vai trò</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Trạng thái</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell><span className="sr-only">Thao tác</span></Table.ColumnHeaderCell>
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
                      <Select.Trigger variant="ghost" aria-label={`Vai trò của ${user.username}`} />
                      <Select.Content>
                        <Select.Item value="staff">Nhân viên</Select.Item>
                        <Select.Item value="admin">Quản trị</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge asChild size="2" color={user.is_active ? 'green' : 'red'}>
                      <button
                        type="button"
                        className="pill-button"
                        title={user.is_active ? 'Bấm để khóa' : 'Bấm để mở khóa'}
                        aria-pressed={!!user.is_active}
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.is_active ? 'Hoạt động' : 'Khóa'}
                      </button>
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="3" align="center" justify="end">
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
                            aria-label="Mật khẩu mới"
                            autoFocus
                          />
                          <Button size="1" onClick={() => handleResetPassword(user.id)}>OK</Button>
                          <Button size="1" variant="soft" color="gray" onClick={() => { setEditingId(null); setEditPassword(''); }}>Hủy</Button>
                        </Flex>
                      ) : (
                        <Button size="1" variant="soft" onClick={() => setEditingId(user.id)}>
                          Đặt MK
                        </Button>
                      )}
                      <IconButton size="1" variant="ghost" color="red" aria-label={`Xóa tài khoản ${user.username}`} title="Xóa" onClick={() => handleDelete(user.id)}>
                        <TrashIcon />
                      </IconButton>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          <Flex justify="center" py="5">
            <Text color="gray" size="2">Chưa có tài khoản nào</Text>
          </Flex>
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
          <SectionTitle>Thời gian hiển thị mỗi slide</SectionTitle>
          <Flex align="center" gap="3">
            <TextField.Root
              value={slideDuration}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlideDuration(e.target.value)}
              type="number"
              min="1"
              style={{ width: 100 }}
              placeholder="5"
              aria-label="Thời gian hiển thị mỗi slide (giây)"
              className="num"
            />
            <Text size="2" color="gray">giây</Text>
            <Button onClick={handleSaveDuration} loading={saving}>Lưu</Button>
            <SaveStatus msg={msg} />
          </Flex>
        </Flex>
      </Card>

      {/* Upload */}
      <Card>
        <Flex direction="column" gap="3">
          <SectionTitle>Ảnh quảng cáo</SectionTitle>
          <Text size="2" color="gray">
            Ảnh sẽ hiển thị trên TV khi không còn khách chờ và phục vụ. PNG, JPG, SVG, WebP - tối đa 5MB.
          </Text>
          <Flex align="center" gap="3">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} loading={uploading}>
              <UploadIcon />
              {uploading ? 'Đang tải...' : 'Thêm ảnh'}
            </Button>
          </Flex>
        </Flex>
      </Card>

      {/* Ads list */}
      {ads.length === 0 && (
        <Card>
          <Flex justify="center" py="5">
            <Text color="gray" size="2">Chưa có ảnh quảng cáo nào</Text>
          </Flex>
        </Card>
      )}
      {ads.length > 0 && (
        <Card>
          <Flex direction="column" gap="3">
            <SectionTitle>Danh sách ({ads.length} ảnh)</SectionTitle>
            {ads.map((ad, index) => (
              <Flex
                key={ad.id}
                align="center"
                gap="3"
                p="2"
                className={`ad-row rounded-lg border ${ad.is_active ? 'border-[var(--gray-a5)]' : 'border-[var(--gray-a3)] opacity-60'}`}
              >
                <Text size="2" color="gray" className="num" style={{ minWidth: 24, textAlign: 'center' }}>
                  {index + 1}
                </Text>
                <img
                  src={ad.image_path}
                  alt={`Ad ${ad.id}`}
                  className="rounded bg-[var(--gray-a3)]"
                  style={{ height: 60, width: 100, objectFit: 'cover' }}
                />
                <Flex direction="column" gap="1" style={{ flex: 1 }}>
                  <Badge color={ad.is_active ? 'green' : 'gray'} size="1">
                    {ad.is_active ? 'Đang hiện' : 'Đã ẩn'}
                  </Badge>
                </Flex>
                <Flex gap="2" align="center" wrap="wrap" justify="end">
                  <IconButton
                    variant="soft"
                    color="gray"
                    size="1"
                    disabled={index === 0}
                    onClick={() => handleMove(index, 'up')}
                    title="Di chuyển lên"
                    aria-label="Di chuyển lên"
                  >
                    <ChevronUpIcon />
                  </IconButton>
                  <IconButton
                    variant="soft"
                    color="gray"
                    size="1"
                    disabled={index === ads.length - 1}
                    onClick={() => handleMove(index, 'down')}
                    title="Di chuyển xuống"
                    aria-label="Di chuyển xuống"
                  >
                    <ChevronDownIcon />
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
                    <TrashIcon width={13} height={13} />
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
