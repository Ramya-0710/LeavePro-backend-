const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Leave = require('../models/Leave');
const User = require('../models/User');
const { LeavePolicy } = require('../models/index');
const { protect, managerOrAdmin, attachPolicy } = require('../middleware/auth');
const { createNotification, notifyManagers, notifyAdmins } = require('../utils/notificationHelper');
const { logAction } = require('../utils/auditHelper');

// Helper: count working days (skip weekends)
function countWorkingDays(from, to) {
  let count = 0;
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1);
}

// Helper: map leaveType to balance key
function balanceKey(type) {
  if (type === 'CL') return 'cl';
  if (type === 'SL') return 'sl';
  return 'el'; // EL, ML, PL, CompOff, BL → el
}

// Helper: detect designation conflict
async function detectConflict(fromDate, toDate, employeeId, threshold = 3) {
  const employee = await User.findById(employeeId);
  const overlap = await Leave.find({
    status: 'approved',
    fromDate: { $lte: new Date(toDate) },
    toDate:   { $gte: new Date(fromDate) }
  }).populate('employee', 'name designation department');

  const designationMap = {};
  overlap.forEach(l => {
    const desig = l.employee?.designation;
    if (!designationMap[desig]) designationMap[desig] = [];
    designationMap[desig].push(l.employee?.name);
  });

  const conflicts = [];
  for (const [desig, names] of Object.entries(designationMap)) {
    if (names.length >= threshold && employee?.designation === desig) {
      conflicts.push({ designation: desig, count: names.length, employees: names, message: `Already ${names.length} ${desig}s on leave: ${names.join(', ')}` });
    }
  }
  return { hasConflict: conflicts.length > 0, conflicts };
}

// @GET /api/leaves — Admin sees all, Manager sees own team only, Employee sees own
router.get('/', protect, async (req, res) => {
  try {
    const { status, dept, page = 1, limit = 100, mine } = req.query;
    let query = {};

    if (req.user.sysRole === 'employee' || mine === 'true') {
      // Employee: own leaves only
      query.employee = req.user._id;

    } else if (req.user.sysRole === 'manager') {
      // Manager: only team members who report to this manager
      const teamMembers = await User.find({ reportsTo: req.user._id }).select('_id');
      const teamIds = teamMembers.map(e => e._id);
      query.employee = { $in: teamIds };
      if (status) query.status = status;

    } else if (req.user.sysRole === 'admin') {
  // Admin: ONLY managers' leave requests

  const managers = await User.find({ sysRole: 'manager' }).select('_id');
  const managerIds = managers.map(m => m._id);

  query.employee = { $in: managerIds };

  if (status) query.status = status;
}

    let leaves = await Leave.find(query)
      .populate('employee', 'name designation department email')
      .populate('backupEmployee', 'name designation')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    if ((req.user.sysRole === 'manager' || req.user.sysRole === 'admin') && dept) {
      leaves = leaves.filter(l => l.employee?.department === dept);
    }

    const total = await Leave.countDocuments(query);
    res.json({ success: true, count: leaves.length, total, data: leaves });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @GET /api/leaves/check-conflict
router.get('/check-conflict', protect, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const policy = await LeavePolicy.findOne({ isActive: true });
    const threshold = policy?.conflictThreshold || 3;
    const result = await detectConflict(fromDate, toDate, req.user._id, threshold);
    res.json({ success: true, ...result });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @GET /api/leaves/today — Who is on leave today
router.get('/today', protect, managerOrAdmin, async (req, res) => {
  try {
    const today = new Date();
    const leaves = await Leave.find({
      status: 'approved',
      fromDate: { $lte: today },
      toDate:   { $gte: today }
    }).populate('employee', 'name designation department');
    res.json({ success: true, count: leaves.length, data: leaves });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @GET /api/leaves/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employee', 'name designation department email')
      .populate('backupEmployee', 'name designation')
      .populate('reviewedBy', 'name');
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    res.json({ success: true, data: leave });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @POST /api/leaves — Employee applies
router.post('/', protect, attachPolicy, [
  body('leaveType').isIn(['CL','SL','EL','ML','PL','CompOff','BL']),
  body('fromDate').isISO8601(),
  body('toDate').isISO8601(),
  body('reason').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { leaveType, fromDate, toDate, reason, backupEmployee } = req.body;
    const from = new Date(fromDate), to = new Date(toDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    if (from < today) return res.status(400).json({ success: false, message: 'Cannot apply for past dates' });
    if (to < from)    return res.status(400).json({ success: false, message: 'End date must be after start date' });

    const days = countWorkingDays(from, to);
    const key  = balanceKey(leaveType);
    const emp  = await User.findById(req.user._id);
    const avail = emp.leaveBalance[key] || 0;
    const cfBal = key === 'el' ? (emp.carryForwardBalance || 0) : 0;
    const total = avail + cfBal;

    if (days > total) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${leaveType} balance. Available: ${total} days (${avail} + ${cfBal} carry-forward). Requested: ${days} days`
      });
    }

    // Conflict detection
    const threshold = req.policy?.conflictThreshold || 3;
    const conflictResult = await detectConflict(fromDate, toDate, req.user._id, threshold);
    const conflictDetails = conflictResult.conflicts.map(c => c.message).join('; ');

    const leave = await Leave.create({
      employee: req.user._id, leaveType, fromDate: from, toDate: to, numberOfDays: days, reason,
      backupEmployee: backupEmployee || null,
      conflictDetected: conflictResult.hasConflict,
      conflictDetails,
      deductedFrom: key
    });

    const pop = await leave.populate([
      { path: 'employee', select: 'name designation department' },
      { path: 'backupEmployee', select: 'name designation' }
    ]);

    // Notify managers
    await notifyManagers({
      type: 'leave_applied', title: 'New Leave Request',
      message: `${req.user.name} (${req.user.designation}) applied for ${leaveType} — ${days} day${days>1?'s':''} (${from.toDateString()} to ${to.toDateString()}). Backup: ${backupEmployee ? 'Assigned' : 'Not assigned'}.${conflictResult.hasConflict ? ` ⚠️ Conflict: ${conflictDetails}` : ''}`,
      relatedLeave: leave._id
    });

    // Conflict alert to managers + admins
    if (conflictResult.hasConflict) {
      await notifyManagers({
        type: 'conflict_detected', title: '⚠️ Leave Conflict Detected',
        message: `Conflict for ${req.user.name}'s ${leaveType}: ${conflictDetails}. Review carefully before approving.`,
        relatedLeave: leave._id
      });
      await notifyAdmins({
        type: 'conflict_detected', title: '⚠️ System Conflict Alert',
        message: `Conflict threshold exceeded in ${req.user.department}: ${conflictDetails}`,
        relatedLeave: leave._id
      });
    }

    await logAction({
      performedBy: req.user._id, action: 'apply',
      description: `Applied for ${leaveType} — ${days} days (${from.toDateString()} to ${to.toDateString()})`,
      targetLeave: leave._id
    });

    res.status(201).json({ success: true, message: 'Leave submitted. Manager notified.', data: pop });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @PUT /api/leaves/:id/status — Manager approves/rejects
router.put('/:id/status', protect, managerOrAdmin, [
  body('status').isIn(['approved', 'rejected']),
  body('managerNote').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employee', 'name email designation department')
      .populate('backupEmployee', 'name designation');
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'pending') return res.status(400).json({ success: false, message: `Already ${leave.status}` });

    const { status, managerNote } = req.body;

    // Deduct balance on approval
    if (status === 'approved') {
      const emp = await User.findById(leave.employee._id);
      const key = leave.deductedFrom || balanceKey(leave.leaveType);
      const days = leave.numberOfDays;

      if (key === 'el') {
        const cf = emp.carryForwardBalance || 0;
        if (cf >= days) {
          emp.carryForwardBalance -= days;
        } else {
          const fromAnnual = days - cf;
          emp.carryForwardBalance = 0;
          emp.leaveBalance.el = Math.max(0, emp.leaveBalance.el - fromAnnual);
        }
      } else {
        emp.leaveBalance[key] = Math.max(0, emp.leaveBalance[key] - days);
      }
      await emp.save();
    }

    leave.status = status;
    leave.managerNote = managerNote || (status === 'approved' ? 'Approved ✅' : 'Rejected ❌');
    leave.reviewedBy  = req.user._id;
    leave.reviewedAt  = new Date();
    await leave.save();

    // Notify employee
    await createNotification({
      recipients: [leave.employee._id],
      type: status === 'approved' ? 'leave_approved' : 'leave_rejected',
      title: `Leave ${status === 'approved' ? 'Approved ✅' : 'Rejected ❌'}`,
      message: `Your ${leave.leaveType} (${new Date(leave.fromDate).toDateString()}${leave.fromDate.toDateString() !== leave.toDate.toDateString() ? ' – ' + leave.toDate.toDateString() : ''}) has been ${status} by manager.${managerNote ? ` Note: "${managerNote}"` : ''}`,
      relatedLeave: leave._id
    });

    // Notify backup employee when leave is approved
    if (status === 'approved' && leave.backupEmployee) {
      const empName = leave.employee?.name || 'A colleague';
      const fromStr = new Date(leave.fromDate).toDateString();
      const toStr   = new Date(leave.toDate).toDateString();
      const dateRange = fromStr === toStr ? fromStr : `${fromStr} – ${toStr}`;
      await createNotification({
        recipients: [leave.backupEmployee],
        type: 'backup_assigned',
        title: '🔄 You are the Backup Employee',
        message: `${empName}'s ${leave.leaveType} leave (${dateRange}, ${leave.numberOfDays} day${leave.numberOfDays > 1 ? 's' : ''}) has been approved. You have been assigned as their backup. Please be prepared to cover their responsibilities during this period.`,
        relatedLeave: leave._id
      });
    }

    await logAction({
      performedBy: req.user._id,
      action: status,
      description: `${status === 'approved' ? 'Approved' : 'Rejected'} leave for ${leave.employee.name} (${leave.leaveType}, ${leave.numberOfDays}d)${managerNote ? ` — "${managerNote}"` : ''}`,
      targetUser: leave.employee._id,
      targetLeave: leave._id
    });

    res.json({ success: true, message: `Leave ${status}`, data: leave });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @PUT /api/leaves/:id/cancel — Employee cancels pending
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const leave = await Leave.findOne({ _id: req.params.id, employee: req.user._id });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending leaves can be cancelled' });

    leave.status = 'cancelled';
    leave.managerNote = 'Cancelled by employee';
    await leave.save();

    await notifyManagers({
      type: 'leave_cancelled', title: 'Leave Cancelled',
      message: `${req.user.name} cancelled their ${leave.leaveType} request (${new Date(leave.fromDate).toDateString()})`,
      relatedLeave: leave._id
    });

    await logAction({
      performedBy: req.user._id, action: 'cancel',
      description: `Cancelled ${leave.leaveType} (${new Date(leave.fromDate).toDateString()})`,
      targetLeave: leave._id
    });

    res.json({ success: true, message: 'Leave cancelled', data: leave });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;