import { Router } from 'express';
import * as authService from '../services/auth.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/', (_req, res) => {
  const users = authService.listUsers();
  res.json(users);
});

router.post('/', async (req, res) => {
  try {
    const { username, password, display_name, role } = req.body ?? {};
    if (!username || !password || !display_name) {
      res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
      return;
    }
    const user = await authService.createUser(username, password, display_name, role ?? 'staff');
    res.status(201).json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = await authService.updateUser(Number(req.params.id), req.body ?? {});
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    authService.deleteUser(Number(req.params.id), req.user!.userId);
    res.json({ message: 'Đã xóa người dùng' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
