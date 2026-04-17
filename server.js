const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { success:false, message:'Too many requests' } });
app.use('/api/', limiter);

// Routes
const { notifRouter, analyticsRouter, policyRouter, cfRouter, auditRouter } = require('./routes/notifications');

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/leaves',        require('./routes/leaves'));
app.use('/api/events',        require('./routes/events'));
app.use('/api/holidays',      require('./routes/holidays'));
app.use('/api/notifications', notifRouter);
app.use('/api/analytics',     analyticsRouter);
app.use('/api/policy',        policyRouter);
app.use('/api/carryforward',  cfRouter);
app.use('/api/audit',         auditRouter);

app.get('/api/health', (req, res) => res.json({ success:true, message:'LeaveFlow Pro API ✅', timestamp: new Date() }));
app.use((req, res) => res.status(404).json({ success:false, message:`${req.originalUrl} not found` }));
app.use((err, req, res, next) => res.status(err.statusCode||500).json({ success:false, message: err.message||'Server error' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 LeaveFlow Pro → http://localhost:${PORT}`));

    // Year-end carry forward cron — Jan 1 midnight
    cron.schedule('0 0 1 1 *', async () => {
      console.log('🔄 Running year-end carry forward cron...');
      try {
        const User = require('./models/User');
        const { CarryForward, LeavePolicy } = require('./models/index');
        const { createNotification } = require('./utils/notificationHelper');
        const policy = await LeavePolicy.findOne({ isActive:true });
        const maxCF  = policy?.maxCarryForward || parseInt(process.env.MAX_CARRY_FORWARD) || 5;
        const elDays = policy?.elDays || parseInt(process.env.EL_DAYS) || 24;
        const year   = new Date().getFullYear() - 1;
        const employees = await User.find({ sysRole:'employee', isActive:true });
        for (const emp of employees) {
          const exists = await CarryForward.findOne({ employee:emp._id, year });
          if (exists) continue;
          const unused  = emp.leaveBalance.el;
          const carried = Math.min(unused, maxCF);
          const lapsed  = unused - carried;
          await CarryForward.create({ employee:emp._id, year, unusedLeaves:unused, carriedForward:carried, lapsed, maxLimit:maxCF });
          emp.leaveBalance.el = elDays + carried;
          emp.carryForwardBalance = carried;
          await emp.save();
          await createNotification({ recipients:[emp._id], type:'carry_forward', title:'📅 Leave Carry Forward Processed', message:`Year ${year}: ${unused} unused EL → ${carried} days carried, ${lapsed} lapsed. New EL: ${emp.leaveBalance.el} days.` });
        }
        console.log(`✅ Carry forward done for ${employees.length} employees`);
      } catch (err) { console.error('❌ Cron error:', err.message); }
    });
  })
  .catch(err => { console.error('❌ MongoDB failed:', err.message); process.exit(1); });
