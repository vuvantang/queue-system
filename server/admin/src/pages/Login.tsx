import { useState, useEffect } from 'react';
import { Box, Card, Flex, Heading, Text, TextField, Button, Callout } from '@radix-ui/themes';
import * as api from '../api';

interface Props {
  onLogin: (mustChangePassword: boolean) => void;
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState<{ name: string; logo: string }>({ name: '', logo: '' });

  useEffect(() => {
    api.getSettings()
      .then(s => setBrand({ name: s.org_name || '', logo: s.logo || '' }))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('Vui lòng nhập đầy đủ'); return; }
    setLoading(true);
    setError('');
    try {
      const { user, must_change_password } = await api.login(username, password);
      if (user.role !== 'admin') {
        api.clearToken();
        setError('Cần quyền quản trị viên');
        return;
      }
      setPassword('');
      onLogin(must_change_password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <Card size="4" className="login-card">
        <form onSubmit={handleSubmit} noValidate>
          <Flex direction="column" gap="5">
            <Flex direction="column" align="center" gap="3" className="text-center">
              {brand.logo && <img src={brand.logo} alt="" className="login-logo" />}
              <Box>
                <Heading size="6" mb="1" style={{ color: 'var(--brand-strong)' }}>Queue</Heading>
                <Text color="gray" size="2">Đăng nhập quản trị</Text>
                {brand.name && (
                  <Text as="div" size="1" color="gray" mt="1" weight="medium">{brand.name}</Text>
                )}
              </Box>
            </Flex>

            {error && (
              <Callout.Root color="red" size="1" role="alert" className="anim-enter">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <Flex direction="column" gap="3">
              <label>
                <Text size="2" weight="medium" mb="1" className="block">Tên đăng nhập</Text>
                <TextField.Root
                  size="3"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  autoFocus
                />
              </label>

              <label>
                <Text size="2" weight="medium" mb="1" className="block">Mật khẩu</Text>
                <TextField.Root
                  size="3"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  autoComplete="current-password"
                />
              </label>
            </Flex>

            <Button type="submit" size="3" loading={loading}>
              Đăng nhập
            </Button>
          </Flex>
        </form>
      </Card>
    </div>
  );
}
