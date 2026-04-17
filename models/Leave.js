const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  leaveType: {
    type: String, required: true,
    enum: ['CL', 'SL', 'EL', 'ML', 'PL', 'CompOff', 'BL']
  },
  fromDate:     { type: Date, required: true },
  toDate:       { type: Date, required: true },
  numberOfDays: { type: Number, required: true, min: 1 },
  reason:       { type: String, required: true, trim: true, maxlength: 500 },
  backupEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: {
    type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending'
  },
  managerNote:  { type: String, trim: true, default: '' },
  reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt:   { type: Date, default: null },
  // Conflict metadata
  conflictDetected: { type: Boolean, default: false },
  conflictDetails:  { type: String, default: '' },
  // Which balance to deduct from
  deductedFrom: { type: String, enum: ['cl', 'sl', 'el', 'carry_forward', 'none'], default: 'none' }
}, { timestamps: true });

leaveSchema.index({ employee: 1, status: 1 });
leaveSchema.index({ fromDate: 1, toDate: 1 });

leaveSchema.virtual('duration').get(function () {
  return `${this.numberOfDays} day${this.numberOfDays > 1 ? 's' : ''}`;
});

leaveSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Leave', leaveSchema);
