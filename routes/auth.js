const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, protect } = require('../middleware/auth');
const { logAction } = require('../utils/auditHelper');

// @POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isActive: true }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    const token = generateToken(user._id, user.sysRole);

    await logAction({
      performedBy: user._id, action: 'login',
      description: `${user.name} (${user.sysRole}) logged in`
    });

    const userData = user.toJSON();
    delete userData.password;

    res.json({
      success: true, message: 'Login successful', token,
      user: { ...userData, initials: user.initials }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('sysRole').isIn(['employee', 'manager', 'admin']),
  body('designation').trim().notEmpty(),
  body('department').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { name, email, password, sysRole, designation, department, phone, reportsTo } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

    const user = await User.create({ name, email, password, sysRole, designation, department, phone, reportsTo: reportsTo || null });
    const token = generateToken(user._id, user.sysRole);
    res.status(201).json({ success: true, message: 'Account created', token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('reportsTo', 'name email');
    res.json({ success: true, user: { ...user.toJSON(), initials: user.initials } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @PUT /api/auth/change-password
router.put('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(req.body.currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password incorrect' });
    }
    user.password = req.body.newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @PUT /api/auth/profile — Update own profile (name, phone, designation)
router.put('/profile', protect, [
  body('name').optional().trim().notEmpty(),
  body('phone').optional()
], async (req, res) => {
  try {
    const allowed = ['name', 'phone'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true })
      .populate('reportsTo', 'name email');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'Profile updated', user: { ...user.toJSON(), initials: user.initials } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
