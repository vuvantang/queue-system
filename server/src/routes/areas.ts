import { Router } from 'express';
import * as areaService from '../services/area.service.js';
import { getQueueStatus } from '../services/ticket.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Public: list areas (for kiosk/TV config)
router.get('/', (_req, res) => {
  const areas = areaService.listAreas();
  res.json(areas);
});

// Public: get queue status for an area
router.get('/:id/queue', (req, res) => {
  try {
    const status = getQueueStatus(Number(req.params.id));
    res.json(status);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Public: list service types for area (kiosk needs this)
router.get('/:id/service-types', (req, res) => {
  const types = areaService.listServiceTypes(Number(req.params.id));
  res.json(types);
});

// Public: list counters for area
router.get('/:id/counters', (req, res) => {
  const counters = areaService.listCounters(Number(req.params.id));
  res.json(counters);
});

// Admin only: create/update/delete
router.post('/', authenticate, requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'Thiếu tên khu vực' }); return; }
    const area = areaService.createArea(name);
    res.status(201).json(area);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const area = areaService.updateArea(Number(req.params.id), req.body);
    res.json(area);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    areaService.deleteArea(Number(req.params.id));
    res.json({ message: 'Đã xóa khu vực' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
