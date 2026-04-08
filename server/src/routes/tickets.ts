import { Router } from 'express';
import * as ticketService from '../services/ticket.service.js';
import { manualReset, resetArea } from '../services/reset.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { broadcast } from '../socket.js';

const router = Router();

// Public: create ticket (kiosk)
router.post('/', (req, res) => {
  try {
    const { service_type_id } = req.body;
    if (!service_type_id) {
      res.status(400).json({ error: 'Thiếu loại dịch vụ' });
      return;
    }
    const ticket = ticketService.createTicket(service_type_id);
    broadcast(`area:${ticket.area_id}`, 'ticket:created', { ticket });
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Staff: call next
router.post('/call-next', authenticate, (req, res) => {
  try {
    const { counter_id, service_type_id } = req.body;
    if (!counter_id) {
      res.status(400).json({ error: 'Thiếu quầy' });
      return;
    }
    const result = ticketService.callNext(counter_id, req.user!.userId, service_type_id);
    if (!result) {
      res.json({ message: 'Không còn số chờ', ticket: null });
      return;
    }
    broadcast(`area:${result.ticket.area_id}`, 'ticket:called', {
      ticket: result.ticket,
      counter: result.counter,
      serviceTypeName: result.serviceTypeName,
      announceTemplate: result.announceTemplate,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Staff: recall
router.post('/:id/recall', authenticate, (req, res) => {
  try {
    const { counter_id } = req.body;
    if (!counter_id) {
      res.status(400).json({ error: 'Thiếu quầy' });
      return;
    }
    const result = ticketService.recall(Number(req.params.id), counter_id);
    broadcast(`area:${result.ticket.area_id}`, 'ticket:recalled', {
      ticket: result.ticket,
      counter: result.counter,
      serviceTypeName: result.serviceTypeName,
      announceTemplate: result.announceTemplate,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Staff: complete
router.post('/:id/complete', authenticate, (req, res) => {
  try {
    const ticket = ticketService.completeTicket(Number(req.params.id));
    broadcast(`area:${ticket.area_id}`, 'ticket:completed', { ticket });
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Staff: skip
router.post('/:id/skip', authenticate, (req, res) => {
  try {
    const ticket = ticketService.skipTicket(Number(req.params.id));
    broadcast(`area:${ticket.area_id}`, 'ticket:skipped', { ticket });
    res.json(ticket);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: reset all
router.post('/reset', authenticate, requireAdmin, (_req, res) => {
  manualReset();
  broadcast('all', 'queue:reset', {});
  res.json({ message: 'Đã reset hàng đợi' });
});

// Admin: reset by area
router.post('/reset/:areaId', authenticate, requireAdmin, (req, res) => {
  const areaId = Number(req.params.areaId);
  resetArea(areaId);
  broadcast(`area:${areaId}`, 'queue:reset', {});
  res.json({ message: 'Đã reset khu vực' });
});

export default router;
