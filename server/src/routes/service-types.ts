import { Router } from 'express';
import * as areaService from '../services/area.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.post('/', (req, res) => {
  try {
    const { area_id, name, prefix } = req.body;
    if (!area_id || !name || !prefix) {
      res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
      return;
    }
    const st = areaService.createServiceType(area_id, name, prefix);
    res.status(201).json(st);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const st = areaService.updateServiceType(Number(req.params.id), req.body);
    res.json(st);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    areaService.deleteServiceType(Number(req.params.id));
    res.json({ message: 'Đã xóa loại dịch vụ' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
