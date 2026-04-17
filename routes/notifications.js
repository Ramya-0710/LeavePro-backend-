// ═══════════════════════════════════════════
// routes/notifications.js
// ═══════════════════════════════════════════
const express = require('express');
const notifRouter = express.Router();
const { Notification } = require('../models/index');
const { protect } = require('../middleware/auth');

notifRouter.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const notifs = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    res.json({ success: true, data: notifs, unreadCount });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

notifRouter.put('/:id/read', protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { isRead: true });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

notifRouter.put('/mark-all-read', protect, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All marked as read' });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ═══════════════════════════════════════════
// routes/analytics.js
// ═══════════════════════════════════════════
const analyticsRouter = express.Router();
const Leave = require('../models/Leave');
const User = require('../models/User');
const { managerOrAdmin, adminOnly } = require('../middleware/auth');

// Manager analytics
analyticsRouter.get('/manager', protect, managerOrAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const start = new Date(year, 0, 1), end = new Date(year, 11, 31);

    const allLeaves = await Leave.find({ fromDate: { $gte: start, $lte: end }, status: 'approved' })
      .populate('employee', 'name designation department');

    const monthly = Array(12).fill(0);
    const deptMap = {}, typeMap = {};
    allLeaves.forEach(l => {
      monthly[new Date(l.fromDate).getMonth()] += l.numberOfDays;
      const dept = l.employee?.department || 'Unknown';
      deptMap[dept] = (deptMap[dept] || 0) + l.numberOfDays;
      typeMap[l.leaveType] = (typeMap[l.leaveType] || 0) + l.numberOfDays;
    });

    const empMap = {};
    allLeaves.forEach(l => {
      const n = l.employee?.name || 'Unknown';
      empMap[n] = { days: (empMap[n]?.days || 0) + l.numberOfDays, dept: l.employee?.department };
    });
    const topTakers = Object.entries(empMap).sort((a,b) => b[1].days - a[1].days).slice(0,10)
      .map(([name, v]) => ({ name, days: v.days, department: v.dept }));

    const today = new Date();
    const todayOnLeave = await Leave.countDocuments({ status: 'approved', fromDate: { $lte: today }, toDate: { $gte: today } });
    const pendingCount = await Leave.countDocuments({ status: 'pending' });

    res.json({ success: true, data: { monthly, departmentBreakdown: deptMap, leaveTypeBreakdown: typeMap, topTakers, todayOnLeave, pendingCount } });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

// Admin analytics (org-wide)
analyticsRouter.get('/admin', protect, adminOnly, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const start = new Date(year, 0, 1), end = new Date(year, 11, 31);
    const allLeaves = await Leave.find({ fromDate: { $gte: start, $lte: end } })
      .populate('employee', 'name designation department');

    const monthly = Array(12).fill(0);
    const deptMap = {}, typeMap = {};
    const approved = allLeaves.filter(l => l.status === 'approved');
    approved.forEach(l => {
      monthly[new Date(l.fromDate).getMonth()] += l.numberOfDays;
      const dept = l.employee?.department || 'Unknown';
      deptMap[dept] = (deptMap[dept] || 0) + l.numberOfDays;
      typeMap[l.leaveType] = (typeMap[l.leaveType] || 0) + l.numberOfDays;
    });

    const totalUsers = await User.countDocuments({ isActive: true });
    const totalEmployees = await User.countDocuments({ sysRole: 'employee', isActive: true });
    const totalManagers  = await User.countDocuments({ sysRole: 'manager', isActive: true });
    const totalAdmins    = await User.countDocuments({ sysRole: 'admin', isActive: true });
    const pendingCount   = await Leave.countDocuments({ status: 'pending' });
    const rejectedCount  = await Leave.countDocuments({ status: 'rejected', fromDate: { $gte: start } });
    const approvalRate   = allLeaves.length > 0 ? Math.round(approved.length / allLeaves.length * 100) : 0;

    res.json({ success: true, data: { monthly, departmentBreakdown: deptMap, leaveTypeBreakdown: typeMap, totalUsers, totalEmployees, totalManagers, totalAdmins, pendingCount, rejectedCount, approvalRate } });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

// Employee analytics
analyticsRouter.get('/employee', protect, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const start = new Date(year, 0, 1), end = new Date(year, 11, 31);
    const myLeaves = await Leave.find({ employee: req.user._id, fromDate: { $gte: start, $lte: end } });

    const monthly = Array(12).fill(0);
    const typeMap = {};
    myLeaves.filter(l => l.status === 'approved').forEach(l => {
      monthly[new Date(l.fromDate).getMonth()] += l.numberOfDays;
      typeMap[l.leaveType] = (typeMap[l.leaveType] || 0) + l.numberOfDays;
    });

    const user = await User.findById(req.user._id);
    const totalUsed = myLeaves.filter(l => l.status === 'approved').reduce((s, l) => s + l.numberOfDays, 0);
    const approvalRate = myLeaves.length > 0 ? Math.round(myLeaves.filter(l => l.status === 'approved').length / myLeaves.length * 100) : 100;
    const shortLeaves  = myLeaves.filter(l => l.status === 'approved' && l.numberOfDays <= 2).length;
    const mediumLeaves = myLeaves.filter(l => l.status === 'approved' && l.numberOfDays >= 3 && l.numberOfDays <= 5).length;
    const longLeaves   = myLeaves.filter(l => l.status === 'approved' && l.numberOfDays > 5).length;

    res.json({ success: true, data: { monthly, leaveTypeBreakdown: typeMap, totalUsed, approvalRate, shortLeaves, mediumLeaves, longLeaves, balance: user.leaveBalance, carryForward: user.carryForwardBalance } });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ═══════════════════════════════════════════
// routes/policy.js
// ═══════════════════════════════════════════
const policyRouter = express.Router();
const { LeavePolicy } = require('../models/index');
const { logAction: pLogAction } = require('../utils/auditHelper');
const { notifyAll: pNotifyAll } = require('../utils/notificationHelper');
const { adminOnly: pAdminOnly } = require('../middleware/auth');

policyRouter.get('/', protect, async (req, res) => {
  try {
    let policy = await LeavePolicy.findOne({ isActive: true });
    if (!policy) policy = new LeavePolicy();
    res.json({ success: true, data: policy });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

policyRouter.put('/', protect, pAdminOnly, async (req, res) => {
  try {
    const fields = ['elDays','slDays','clDays','maxCarryForward','carryForwardEnabled','advanceNoticeDays','slCertRequiredDays','conflictThreshold','leaveYear','timezone'];
    const updates = {};
    fields.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updatedBy = req.user._id;

    let policy = await LeavePolicy.findOneAndUpdate({ isActive: true }, updates, { new: true, upsert: true });

    await pLogAction({ performedBy: req.user._id, action: 'policy', description: `Updated leave policy: ${JSON.stringify(updates)}` });
    await pNotifyAll({ type: 'policy_changed', title: 'Leave Policy Updated', message: `Company leave policy has been updated by admin. EL: ${policy.elDays}d, SL: ${policy.slDays}d, CL: ${policy.clDays}d, Max Carry Forward: ${policy.maxCarryForward}d` });

    res.json({ success: true, message: 'Policy updated', data: policy });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

// Bulk: reset all EL balances
policyRouter.post('/reset-balances', protect, pAdminOnly, async (req, res) => {
  try {
    const policy = await LeavePolicy.findOne({ isActive: true });
    const elDays = policy?.elDays || 24;
    await User.updateMany({ sysRole: 'employee', isActive: true }, { 'leaveBalance.el': elDays });
    await pLogAction({ performedBy: req.user._id, action: 'policy', description: `Bulk reset: All EL balances reset to ${elDays} days` });
    res.json({ success: true, message: `All EL balances reset to ${elDays} days` });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ═══════════════════════════════════════════
// routes/carryforward.js
// ═══════════════════════════════════════════
const cfRouter = express.Router();
const { CarryForward, LeavePolicy: CFPolicy } = require('../models/index');
const { createNotification: cfNotify } = require('../utils/notificationHelper');
const { logAction: cfLog } = require('../utils/auditHelper');
const { adminOnly: cfAdminOnly } = require('../middleware/auth');

cfRouter.get('/', protect, async (req, res) => {
  try {
    const query = req.user.sysRole === 'admin' ? {} : { employee: req.user._id };
    const records = await CarryForward.find(query).populate('employee', 'name designation department').sort({ year: -1 });
    res.json({ success: true, data: records });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

cfRouter.post('/process', protect, cfAdminOnly, async (req, res) => {
  try {
    const { year, maxCarryForward } = req.body;
    const processYear = parseInt(year) || (new Date().getFullYear() - 1);
    const policy = await CFPolicy.findOne({ isActive: true });
    const maxCF = parseInt(maxCarryForward) || policy?.maxCarryForward || 5;
    const elDays = policy?.elDays || 24;

    const employees = await User.find({ sysRole: 'employee', isActive: true });
    const results = [];

    for (const emp of employees) {
      const exists = await CarryForward.findOne({ employee: emp._id, year: processYear });
      if (exists) { results.push({ name: emp.name, skipped: true }); continue; }

      const unused   = emp.leaveBalance.el;
      const carried  = Math.min(unused, maxCF);
      const lapsed   = unused - carried;

      await CarryForward.create({ employee: emp._id, year: processYear, unusedLeaves: unused, carriedForward: carried, lapsed, maxLimit: maxCF, processedBy: req.user._id });
      emp.leaveBalance.el = elDays + carried;
      emp.carryForwardBalance = carried;
      await emp.save();

      await cfNotify({
        recipients: [emp._id], type: 'carry_forward',
        title: '📅 Leave Carry Forward Processed',
        message: `Year ${processYear}: ${unused} unused EL → ${carried} days carried forward (max ${maxCF}), ${lapsed} days lapsed. New EL balance: ${emp.leaveBalance.el} days.`
      });
      results.push({ name: emp.name, unused, carried, lapsed });
    }

    await cfLog({ performedBy: req.user._id, action: 'carry_forward', description: `Processed carry forward for year ${processYear} — ${results.filter(r=>!r.skipped).length} employees` });
    res.json({ success: true, message: `Processed for ${results.filter(r=>!r.skipped).length} employees`, data: results });
  } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// ═══════════════════════════════════════════
// routes/audit.js
// ═══════════════════════════════════════════
const auditRouter = express.Router();
const { AuditLog } = require('../models/index');
const { adminOnly: auAdminOnly } = require('../middleware/auth');

auditRouter.get('/', protect, auAdminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const logs = await AuditLog.find()
      .populate('performedBy', 'name sysRole')
      .populate('targetUser', 'name')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));
    const total = await AuditLog.countDocuments();
    res.json({ success: true, count: logs.length, total, data: logs });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
});

// Export all routers together in one file to keep imports clean
module.exports = { notifRouter, analyticsRouter, policyRouter, cfRouter, auditRouter };
