import { useState } from 'react';
import { Box, Card, Flex, Heading, Text, TextField, Button, Callout } from '@radix-ui/themes';
import * as api from '../api';

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('Vui lòng nhập đầy đủ'); return; }
    setLoading(true);
    setError('');
    try {
      const user = await api.login(username, password);
      if (user.role !== 'admin') {
        api.clearToken();
        setError('Cần quyền quản trị viên');
        return;
      }
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex align="center" justify="center" className="min-h-screen bg-[var(--color-background)]">
      <Card size="4" style={{ width: 380 }}>
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="4">
            <Box className="text-center">
              <Heading size="6" mb="1" style={{ color: '#14531b' }}>Queue</Heading>
              <Text color="gray" size="2">Đăng nhập quản trị</Text>
            </Box>

            {error && (
              <Callout.Root color="red" size="1">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <label>
              <Text size="2" color="gray" mb="1" className="block">Tên đăng nhập</Text>
              <TextField.Root
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </label>

            <label>
              <Text size="2" color="gray" mb="1" className="block">Mật khẩu</Text>
              <TextField.Root
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </label>

            <Button type="submit" size="3" loading={loading}>
              Đăng nhập
            </Button>
          </Flex>
        </form>
      </Card>
    </Flex>
  );
}
