const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT
const generateToken = (id, sysRole) =>
  jwt.sign({ id, sysRole }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });

// Protect any route
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized — no token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user)        return res.status(401).json({ success: false, message: 'User not found' });
    if (!req.user.isActive) return res.status(401).json({ success: false, message: 'Account deactivated' });
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

// Manager or Admin only
const managerOrAdmin = (req, res, next) => {
  if (['manager', 'admin'].includes(req.user?.sysRole)) return next();
  return res.status(403).json({ success: false, message: 'Access denied — manager/admin only' });
};

// Admin only
const adminOnly = (req, res, next) => {
  if (req.user?.sysRole === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Access denied — admin only' });
};

// Attach policy to request
const attachPolicy = async (req, res, next) => {
  try {
    const { LeavePolicy } = require('../models/index');
    req.policy = await LeavePolicy.findOne({ isActive: true }) || { elDays: 24, slDays: 12, clDays: 6, maxCarryForward: 5, conflictThreshold: 3, advanceNoticeDays: 3 };
    next();
  } catch { next(); }
};

module.exports = { generateToken, protect, managerOrAdmin, adminOnly, attachPolicy };
