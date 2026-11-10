import { useState } from 'react';
import { Box, Card, Flex, Heading, Text, TextField, Button, Callout } from '@radix-ui/themes';
import * as api from '../api';
import { ExitIcon } from '../icons';

interface Props {
  onDone: () => void;
  onLogout: () => void;
}

export default function ChangePassword({ onDone, onLogout }: Props) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) { setError('Vui lòng nhập đầy đủ'); return; }
    if (newPassword !== confirmPassword) { setError('Mật khẩu xác nhận không khớp'); return; }
    if (newPassword === oldPassword) { setError('Mật khẩu mới không được trùng mật khẩu cũ'); return; }
    setLoading(true);
    setError('');
    try {
      await api.changePassword(oldPassword, newPassword);
      onDone();
    } catch (err: any) {
      if (err.message === 'SESSION_EXPIRED') return; // App routes back to login
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
            <Box className="text-center">
              <Heading size="6" mb="1" style={{ color: 'var(--brand-strong)' }}>Đổi mật khẩu</Heading>
              <Text color="gray" size="2">
                Bạn cần đặt mật khẩu mới trước khi vào trang quản trị.
              </Text>
            </Box>

            {error && (
              <Callout.Root color="red" size="1" role="alert" className="anim-enter">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <Flex direction="column" gap="3">
              <label>
                <Text size="2" weight="medium" mb="1" className="block">Mật khẩu hiện tại</Text>
                <TextField.Root
                  size="3"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
              </label>

              <label>
                <Text size="2" weight="medium" mb="1" className="block">Mật khẩu mới</Text>
                <TextField.Root
                  size="3"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-describedby="pw-policy"
                />
              </label>

              <label>
                <Text size="2" weight="medium" mb="1" className="block">Nhập lại mật khẩu mới</Text>
                <TextField.Root
                  size="3"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>

              <Text id="pw-policy" size="1" color="gray">{api.PASSWORD_POLICY_HINT}</Text>
            </Flex>

            <Flex direction="column" gap="2">
              <Button type="submit" size="3" loading={loading}>
                Lưu mật khẩu mới
              </Button>
              <Button type="button" size="2" variant="soft" color="gray" onClick={onLogout}>
                <ExitIcon />
                Đăng xuất
              </Button>
            </Flex>
          </Flex>
        </form>
      </Card>
    </div>
  );
}
