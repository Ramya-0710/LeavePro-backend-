// ═══════════════════════════════════════════
// routes/events.js
// ═══════════════════════════════════════════
const express = require('express');
const evRouter = express.Router();
const { Event } = require('../models/index');
const User = require('../models/User');
const { protect, managerOrAdmin } = require('../middleware/auth');
const { createNotification } = require('../utils/notificationHelper');
const { logAction } = require('../utils/auditHelper');

evRouter.get('/', protect, async (req, res) => {
  try {
    const { year, month } = req.query;
    const query = { isActive: true };
    if (year && month) {
      query.date = { $gte: new Date(year, month-1, 1), $lte: new Date(year, month, 0) };
    } else if (year) {
      query.date = { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31) };
    }
    const events = await Event.find(query).populate('createdBy','name').sort({ date: 1 });
    res.json({ success: true, count: events.length, data: events });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

evRouter.post('/', protect, managerOrAdmin, async (req, res) => {
  try {
    const { title, description, date, time, location, assignedTo } = req.body;
    if (!title || !date) return res.status(400).json({ success: false, message: 'Title and date required' });
    const ev = await Event.create({ title, description, date: new Date(date), time, location, assignedTo: assignedTo || 'all', createdBy: req.user._id });

    // Notify relevant employees
    const userQuery = { sysRole: 'employee', isActive: true };
    if (assignedTo && assignedTo !== 'all') userQuery.department = assignedTo;
    const targets = await User.find(userQuery).select('_id');
    await createNotification({
      recipients: targets.map(u => u._id),
      type: 'event_created',
      title: `New Event: ${title}`,
      message: `${title} scheduled on ${new Date(date).toDateString()} at ${time || 'TBD'}. Assigned to: ${assignedTo === 'all' ? 'All Employees' : assignedTo}. Location: ${location || 'TBD'}`,
      relatedEvent: ev._id
    });
    await logAction({ performedBy: req.user._id, action: 'event', description: `Created event: ${title} for ${assignedTo || 'all'}` });
    res.status(201).json({ success: true, message: `Event created & ${targets.length} employees notified`, data: ev });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

evRouter.put('/:id', protect, managerOrAdmin, async (req, res) => {
  try {
    const ev = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!ev) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: ev });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

evRouter.delete('/:id', protect, managerOrAdmin, async (req, res) => {
  try {
    const ev = await Event.findById(req.params.id);
    if (!ev) return res.status(404).json({ success: false, message: 'Event not found' });
    ev.isActive = false; await ev.save();
    await logAction({ performedBy: req.user._id, action: 'event', description: `Deleted event: ${ev.title}` });
    res.json({ success: true, message: 'Event deleted' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = evRouter;
