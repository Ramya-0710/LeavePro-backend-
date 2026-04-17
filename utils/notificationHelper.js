const { Notification } = require('../models/index');

const ICONS = {
  leave_applied:    '📋',
  leave_approved:   '✅',
  leave_rejected:   '❌',
  leave_cancelled:  '🚫',
  event_created:    '📢',
  holiday_added:    '🎊',
  conflict_detected:'⚡',
  carry_forward:    '📅',
  backup_assigned:  '🔄',
  user_added:       '👤',
  policy_changed:   '⚙️',
  system:           '🛡️'
};

/**
 * Create notifications for one or many recipients
 * @param {{ recipients: ObjectId|ObjectId[], type: string, title: string, message: string, relatedLeave?: ObjectId, relatedEvent?: ObjectId }} opts
 */
const createNotification = async (opts) => {
  try {
    const { recipients, type, title, message, relatedLeave, relatedEvent } = opts;
    const icon = ICONS[type] || '🔔';
    const list = Array.isArray(recipients) ? recipients : [recipients];
    await Notification.insertMany(
      list.map(recipient => ({
        recipient, type, title, message, icon,
        relatedLeave: relatedLeave || null,
        relatedEvent: relatedEvent || null,
        isRead: false
      }))
    );
  } catch (err) {
    console.error('Notification error:', err.message);
  }
};

/** Notify all managers */
const notifyManagers = async (opts) => {
  const User = require('../models/User');
  const managers = await User.find({ sysRole: 'manager', isActive: true }).select('_id');
  if (managers.length) await createNotification({ ...opts, recipients: managers.map(m => m._id) });
};

/** Notify all admins */
const notifyAdmins = async (opts) => {
  const User = require('../models/User');
  const admins = await User.find({ sysRole: 'admin', isActive: true }).select('_id');
  if (admins.length) await createNotification({ ...opts, recipients: admins.map(a => a._id) });
};

/** Notify employees by department or all */
const notifyByDept = async (department, opts) => {
  const User = require('../models/User');
  const query = { sysRole: 'employee', isActive: true };
  if (department && department !== 'all') query.department = department;
  const users = await User.find(query).select('_id');
  if (users.length) await createNotification({ ...opts, recipients: users.map(u => u._id) });
};

/** Notify everyone (all roles) */
const notifyAll = async (opts) => {
  const User = require('../models/User');
  const users = await User.find({ isActive: true }).select('_id');
  if (users.length) await createNotification({ ...opts, recipients: users.map(u => u._id) });
};

module.exports = { createNotification, notifyManagers, notifyAdmins, notifyByDept, notifyAll };
