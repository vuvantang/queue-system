import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { authenticate, requirePasswordChanged } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
      return;
    }
    const result = authService.login(username, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

router.get('/me', authenticate, requirePasswordChanged, (req, res) => {
  try {
    const user = authService.getMe(req.user!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.put('/change-password', authenticate, (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      res.status(400).json({ error: 'Thiếu mật khẩu cũ hoặc mật khẩu mới' });
      return;
    }
    authService.changePassword(req.user!.userId, old_password, new_password);
    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
