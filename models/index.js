const mongoose = require('mongoose');

// ── EVENT ──────────────────────────────────────────
const eventSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, default: '' },
  date:        { type: Date, required: true },
  time:        { type: String, default: '10:00' },
  location:    { type: String, trim: true, default: '' },
  assignedTo: {
    type: String,
    enum: ['all', 'Engineering', 'Design', 'Marketing', 'HR', 'Sales', 'Finance', 'Operations'],
    default: 'all'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive:  { type: Boolean, default: true }
}, { timestamps: true });

// ── HOLIDAY ────────────────────────────────────────
const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  date: { type: Date, required: true },
  type: {
    type: String,
    enum: ['National Holiday', 'Company Holiday', 'Regional Holiday', 'Optional Holiday'],
    default: 'National Holiday'
  },
  notes:     { type: String, trim: true, default: '' },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

// ── NOTIFICATION ───────────────────────────────────
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: [
      'leave_applied', 'leave_approved', 'leave_rejected', 'leave_cancelled',
      'event_created', 'holiday_added', 'conflict_detected', 'carry_forward',
      'backup_assigned', 'user_added', 'policy_changed', 'system'
    ],
    required: true
  },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  icon:    { type: String, default: '🔔' },
  isRead:  { type: Boolean, default: false },
  relatedLeave: { type: mongoose.Schema.Types.ObjectId, ref: 'Leave', default: null },
  relatedEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

// ── CARRY FORWARD ──────────────────────────────────
const carryForwardSchema = new mongoose.Schema({
  employee:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year:          { type: Number, required: true },
  unusedLeaves:  { type: Number, required: true, min: 0 },
  carriedForward:{ type: Number, required: true, min: 0 },
  lapsed:        { type: Number, default: 0 },
  maxLimit:      { type: Number, required: true },
  processedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  processedAt:   { type: Date, default: Date.now },
  notes:         { type: String, default: '' }
}, { timestamps: true });

carryForwardSchema.index({ employee: 1, year: 1 }, { unique: true });

// ── LEAVE POLICY ───────────────────────────────────
const leavePolicySchema = new mongoose.Schema({
  policyName:       { type: String, default: 'Default Policy' },
  elDays:           { type: Number, default: 24 },
  slDays:           { type: Number, default: 12 },
  clDays:           { type: Number, default: 6  },
  maxCarryForward:  { type: Number, default: 5  },
  carryForwardEnabled: { type: Boolean, default: true },
  advanceNoticeDays:   { type: Number, default: 3  },
  slCertRequiredDays:  { type: Number, default: 3  },
  conflictThreshold:   { type: Number, default: 3  },
  leaveYear:           { type: String, enum: ['Jan–Dec', 'Apr–Mar', 'Jul–Jun'], default: 'Jan–Dec' },
  timezone:            { type: String, default: 'Asia/Kolkata' },
  isActive:            { type: Boolean, default: true },
  updatedBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// ── AUDIT LOG ──────────────────────────────────────
const auditLogSchema = new mongoose.Schema({
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: {
    type: String,
    enum: ['approve', 'reject', 'apply', 'cancel', 'policy', 'event', 'user_add', 'user_edit', 'user_delete', 'holiday', 'carry_forward', 'login'],
    required: true
  },
  description: { type: String, required: true },
  targetUser:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  targetLeave: { type: mongoose.Schema.Types.ObjectId, ref: 'Leave', default: null },
  metadata:    { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });

module.exports = {
  Event:       mongoose.model('Event',       eventSchema),
  Holiday:     mongoose.model('Holiday',     holidaySchema),
  Notification:mongoose.model('Notification',notificationSchema),
  CarryForward:mongoose.model('CarryForward',carryForwardSchema),
  LeavePolicy: mongoose.model('LeavePolicy', leavePolicySchema),
  AuditLog:    mongoose.model('AuditLog',    auditLogSchema)
};
