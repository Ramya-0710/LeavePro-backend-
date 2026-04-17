const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Leave = require('../models/Leave');
const { protect, managerOrAdmin, adminOnly } = require('../middleware/auth');
const { logAction } = require('../utils/auditHelper');
const { createNotification } = require('../utils/notificationHelper');

// @GET /api/users — All users (manager/admin) or team
router.get('/', protect, managerOrAdmin, async (req, res) => {
  try {
    const { dept, sysRole, search, isActive } = req.query;
    const query = {};
    if (dept) query.department = dept;
    if (sysRole) query.sysRole = sysRole;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) query.name = { $regex: search, $options: 'i' };

    // Managers only see employees; admins see all
    if (req.user.sysRole === 'manager') query.sysRole = 'employee';

    const users = await User.find(query)
      .populate('reportsTo', 'name email')
      .select('-password')
      .sort({ name: 1 });

    // Attach today's leave status
    const today = new Date();
    const enriched = await Promise.all(users.map(async u => {
      const onLeave = await Leave.findOne({
        employee: u._id, status: 'approved',
        fromDate: { $lte: today }, toDate: { $gte: today }
      }).select('leaveType fromDate toDate');
      return { ...u.toJSON(), initials: u.initials, isOnLeaveToday: !!onLeave, currentLeave: onLeave };
    }));

    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @GET /api/users/available-backups?fromDate=&toDate= — for apply leave backup dropdown
router.get('/available-backups', protect, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    if (!fromDate || !toDate) {
      return res.status(400).json({ success: false, message: 'fromDate and toDate required' });
    }
    const from = new Date(fromDate), to = new Date(toDate);

    // Find who is on approved leave during this period
    const leavesInPeriod = await Leave.find({
      status: 'approved', fromDate: { $lte: to }, toDate: { $gte: from }
    }).select('employee');
    const onLeaveIds = new Set(leavesInPeriod.map(l => l.employee.toString()));

    const allEmployees = await User.find({ sysRole: 'employee', isActive: true }).select('name designation department');

    const available   = allEmployees.filter(u => !onLeaveIds.has(u._id.toString()) && u._id.toString() !== req.user._id.toString());
    const unavailable = allEmployees.filter(u => onLeaveIds.has(u._id.toString()));

    res.json({ success: true, available, unavailable });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @GET /api/users/:id
router.get('/:id', protect, managerOrAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('reportsTo', 'name email');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const leaves = await Leave.find({ employee: user._id })
      .populate('backupEmployee', 'name')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, data: { ...user.toJSON(), initials: user.initials, leaves } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @POST /api/users — Admin creates user
router.post('/', protect, adminOnly, [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('designation').trim().notEmpty(),
  body('department').trim().notEmpty(),
  body('sysRole').isIn(['employee', 'manager', 'admin'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { name, email, designation, department, sysRole, reportsTo, leaveBalance, phone, tempPassword } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });

    const chosenPassword = (tempPassword && tempPassword.trim().length >= 6) ? tempPassword.trim() : 'password123';

    const user = await User.create({
      name, email,
      password: chosenPassword,
      designation, department, sysRole,
      phone: phone || '',
      reportsTo: reportsTo || null,
      leaveBalance: leaveBalance || undefined
    });

    await logAction({
      performedBy: req.user._id, action: 'user_add',
      description: `Added employee: ${name} (${designation} · ${department}) as ${sysRole}`,
      targetUser: user._id
    });

    await createNotification({
      recipients: [req.user._id],
      type: 'user_added',
      title: `New User Added: ${name}`,
      message: `${name} (${designation}) has been added to ${department} as ${sysRole}. Temp password: ${chosenPassword}`
    });

    // Notify ALL active managers about the new team member
    const { notifyManagers } = require('../utils/notificationHelper');
    await notifyManagers({
      type: 'user_added',
      title: `New Team Member: ${name}`,
      message: `${name} (${designation} · ${department}) has been added to the platform by Admin as ${sysRole}. They can now log in and apply for leaves.`
    });

    res.status(201).json({ success: true, message: `User "${name}" created`, data: user.toJSON() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @PUT /api/users/:id — Admin updates user
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const allowed = ['name', 'email', 'designation', 'department', 'sysRole', 'phone', 'reportsTo', 'leaveBalance', 'carryForwardBalance', 'isActive'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    // Fix: empty string for reportsTo causes Mongoose CastError (can't cast '' to ObjectId)
    if (updates.reportsTo === '' || updates.reportsTo === undefined) updates.reportsTo = null;

    // Block editing any admin account (including self)
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    if (target.sysRole === 'admin') return res.status(403).json({ success: false, message: 'Admin accounts cannot be edited' });

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    await logAction({
      performedBy: req.user._id, action: 'user_edit',
      description: `Updated user: ${user.name} — ${JSON.stringify(updates)}`,
      targetUser: user._id
    });

    res.json({ success: true, message: 'User updated', data: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @DELETE /api/users/:id — Admin deletes user (soft delete)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.sysRole === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin accounts' });
    if (user._id.toString() === req.user._id.toString()) return res.status(400).json({ success: false, message: 'Cannot delete yourself' });

    user.isActive = false;
    await user.save();

    await logAction({
      performedBy: req.user._id, action: 'user_delete',
      description: `Deleted user: ${user.name} (${user.designation})`,
      targetUser: user._id
    });

    res.json({ success: true, message: `User "${user.name}" deleted` });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
