const express = require('express');
const router = express.Router();
const { Holiday } = require('../models/index');
const User = require('../models/User');
const { protect, managerOrAdmin } = require('../middleware/auth');
const { notifyAll } = require('../utils/notificationHelper');
const { logAction } = require('../utils/auditHelper');

router.get('/', protect, async (req, res) => {
  try {
    const { year } = req.query;
    const query = { isActive: true };
    if (year) query.date = { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31) };
    const holidays = await Holiday.find(query).sort({ date: 1 });
    res.json({ success: true, count: holidays.length, data: holidays });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/', protect, managerOrAdmin, async (req, res) => {
  try {
    const { name, date, type, notes } = req.body;
    if (!name || !date) return res.status(400).json({ success: false, message: 'Name and date required' });
    const hol = await Holiday.create({ name, date: new Date(date), type: type || 'National Holiday', notes, createdBy: req.user._id });

    await notifyAll({
      type: 'holiday_added', title: `New Holiday: ${name}`,
      message: `${name} (${hol.type}) has been added on ${new Date(date).toDateString()}. Plan your leaves accordingly.`
    });
    await logAction({ performedBy: req.user._id, action: 'holiday', description: `Added holiday: ${name} (${new Date(date).toDateString()})` });
    res.status(201).json({ success: true, message: `Holiday "${name}" added — all employees notified`, data: hol });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/:id', protect, managerOrAdmin, async (req, res) => {
  try {
    const hol = await Holiday.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!hol) return res.status(404).json({ success: false, message: 'Holiday not found' });
    res.json({ success: true, data: hol });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/:id', protect, managerOrAdmin, async (req, res) => {
  try {
    const hol = await Holiday.findById(req.params.id);
    if (!hol) return res.status(404).json({ success: false, message: 'Holiday not found' });
    hol.isActive = false; await hol.save();
    await logAction({ performedBy: req.user._id, action: 'holiday', description: `Deleted holiday: ${hol.name}` });
    res.json({ success: true, message: 'Holiday deleted' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
