import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { authenticateAllowMustChange } from '../middleware/auth.js';
import { loginIpLimiter, loginUserLimiter, changePasswordLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.post('/login', loginIpLimiter, loginUserLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    return;
  }
  if (username.length > authService.USERNAME_MAX || password.length > authService.PASSWORD_INPUT_MAX) {
    res.status(400).json({ error: 'Tên đăng nhập hoặc mật khẩu quá dài' });
    return;
  }
  try {
    const result = await authService.login(username, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// Allowed while must_change_password=1 so clients can discover the flag
router.get('/me', authenticateAllowMustChange, (req, res) => {
  try {
    const user = authService.getMe(req.user!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Allowed while must_change_password=1. Returns a fresh token: older tokens are revoked.
router.put('/change-password', authenticateAllowMustChange, changePasswordLimiter, async (req, res) => {
  const { old_password, new_password } = req.body ?? {};
  if (typeof old_password !== 'string' || typeof new_password !== 'string' || !old_password || !new_password) {
    res.status(400).json({ error: 'Thiếu mật khẩu cũ hoặc mật khẩu mới' });
    return;
  }
  if (old_password.length > authService.PASSWORD_INPUT_MAX || new_password.length > authService.PASSWORD_INPUT_MAX) {
    res.status(400).json({ error: 'Mật khẩu quá dài' });
    return;
  }
  try {
    const token = await authService.changePassword(req.user!.userId, old_password, new_password);
    res.json({ message: 'Đổi mật khẩu thành công', token });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
