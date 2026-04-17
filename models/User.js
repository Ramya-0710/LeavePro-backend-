const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const leaveBalanceSchema = new mongoose.Schema({
  cl: { type: Number, default: 6  },
  sl: { type: Number, default: 12 },
  el: { type: Number, default: 24 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String, required: [true, 'Name is required'], trim: true, maxlength: 100
  },
  email: {
    type: String, required: [true, 'Email required'], unique: true,
    lowercase: true, trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  password: {
    type: String, required: [true, 'Password required'], minlength: 6, select: false
  },
  sysRole: {
    type: String, enum: ['employee', 'manager', 'admin'], default: 'employee'
  },
  designation: {
    type: String, required: [true, 'Designation required'], trim: true
  },
  department: {
    type: String, required: [true, 'Department required'],
    enum: ['Engineering', 'Design', 'Marketing', 'HR', 'Sales', 'Finance', 'Operations']
  },
  phone:    { type: String, default: '' },
  avatar:   { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  leaveBalance: { type: leaveBalanceSchema, default: () => ({}) },
  carryForwardBalance: { type: Number, default: 0 },
  // Who this employee reports to (manager)
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  joinDate:  { type: Date, default: Date.now }
}, { timestamps: true });

// Hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Initials virtual
userSchema.virtual('initials').get(function () {
  return this.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
});

userSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) { delete ret.password; return ret; }
});

module.exports = mongoose.model('User', userSchema);
