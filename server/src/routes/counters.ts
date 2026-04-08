import { Router } from 'express';
import * as areaService from '../services/area.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.post('/', (req, res) => {
  try {
    const { area_id, name } = req.body;
    if (!area_id || !name) {
      res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
      return;
    }
    const counter = areaService.createCounter(area_id, name);
    res.status(201).json(counter);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const counter = areaService.updateCounter(Number(req.params.id), req.body);
    res.json(counter);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    areaService.deleteCounter(Number(req.params.id));
    res.json({ message: 'Đã xóa quầy' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
