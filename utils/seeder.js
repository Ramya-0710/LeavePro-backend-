const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Leave = require('../models/Leave');
const { Event, Holiday, Notification, CarryForward, LeavePolicy, AuditLog } = require('../models/index');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');

    // Clear
    await Promise.all([
      User.deleteMany({}), Leave.deleteMany({}), Event.deleteMany({}),
      Holiday.deleteMany({}), Notification.deleteMany({}),
      CarryForward.deleteMany({}), LeavePolicy.deleteMany({}), AuditLog.deleteMany({})
    ]);
    console.log('🗑️  Cleared all collections');

    // ── Leave Policy ──
    const policy = await LeavePolicy.create({
      policyName: 'Default IT Policy', elDays: 24, slDays: 12, clDays: 6,
      maxCarryForward: 5, carryForwardEnabled: true, advanceNoticeDays: 3,
      slCertRequiredDays: 3, conflictThreshold: 3, leaveYear: 'Jan–Dec',
      timezone: 'Asia/Kolkata', isActive: true
    });
    console.log('✅ Policy created');

    // ── Admin ──
    const admin = await User.create({
      name: 'Arjun Sharma', email: 'arjun@leaveflow.com', password: 'password123',
      sysRole: 'admin', designation: 'System Admin', department: 'HR',
      phone: '+91-9000000099', leaveBalance: { cl:6, sl:12, el:24 }
    });

    // ── Manager ──
    const manager = await User.create({
      name: 'Meera Kapoor', email: 'meera@leaveflow.com', password: 'password123',
      sysRole: 'manager', designation: 'HR Manager', department: 'HR',
      phone: '+91-9000000098', leaveBalance: { cl:6, sl:12, el:24 }
    });

    // ── Employees ──
    const empData = [
      { name:'Rahul Sharma',  email:'rahul@leaveflow.com',  desig:'Senior Developer', dept:'Engineering', bal:{cl:6,sl:8,el:14}, cf:2 },
      { name:'Priya Mehta',   email:'priya@leaveflow.com',  desig:'UI/UX Designer',   dept:'Design',      bal:{cl:4,sl:10,el:16},cf:0 },
      { name:'Kiran Patel',   email:'kiran@leaveflow.com',  desig:'Developer',         dept:'Engineering', bal:{cl:5,sl:9,el:12}, cf:0 },
      { name:'Ananya Nair',   email:'ananya@leaveflow.com', desig:'Developer',         dept:'Engineering', bal:{cl:6,sl:11,el:19},cf:0 },
      { name:'Vikram Singh',  email:'vikram@leaveflow.com', desig:'Developer',         dept:'Engineering', bal:{cl:5,sl:10,el:17},cf:0 },
      { name:'Sneha Reddy',   email:'sneha@leaveflow.com',  desig:'Marketing Lead',   dept:'Marketing',   bal:{cl:4,sl:9,el:15}, cf:0 },
      { name:'Dev Patel',     email:'dev@leaveflow.com',    desig:'Full-Stack Dev',   dept:'Engineering', bal:{cl:6,sl:12,el:20},cf:0 },
      { name:'Nisha Agarwal', email:'nisha@leaveflow.com',  desig:'HR Executive',     dept:'HR',          bal:{cl:5,sl:11,el:18},cf:0 },
      { name:'Rohit Verma',   email:'rohit@leaveflow.com',  desig:'Backend Dev',      dept:'Engineering', bal:{cl:4,sl:8,el:13}, cf:0 },
      { name:'Kavya Iyer',    email:'kavya@leaveflow.com',  desig:'Graphic Designer', dept:'Design',      bal:{cl:6,sl:12,el:21},cf:0 },
      { name:'Arun Kumar',    email:'arun@leaveflow.com',   desig:'Product Manager',  dept:'Engineering', bal:{cl:5,sl:10,el:16},cf:0 },
      { name:'Divya Shah',    email:'divya@leaveflow.com',  desig:'Marketing Exec',   dept:'Marketing',   bal:{cl:6,sl:11,el:19},cf:0 },
      { name:'Sanjay Gupta',  email:'sanjay@leaveflow.com', desig:'QA Engineer',      dept:'Engineering', bal:{cl:5,sl:10,el:18},cf:0 },
      { name:'Riya Tiwari',   email:'riya@leaveflow.com',   desig:'Content Writer',   dept:'Marketing',   bal:{cl:5,sl:10,el:17},cf:0 },
      { name:'Naren Das',     email:'naren@leaveflow.com',  desig:'DevOps Eng',       dept:'Engineering', bal:{cl:6,sl:11,el:20},cf:0 },
    ];

    const employees = [];
    for (const e of empData) {
      const u = await User.create({
        name: e.name, email: e.email, password: 'password123',
        sysRole: 'employee', designation: e.desig, department: e.dept,
        phone: '+91-9000000000', reportsTo: manager._id,
        leaveBalance: { cl: e.bal.cl, sl: e.bal.sl, el: e.bal.el },
        carryForwardBalance: e.cf
      });
      employees.push(u);
    }
    console.log(`✅ Created ${employees.length} employees`);

    const find = (name) => employees.find(e => e.name === name);
    const rahul  = find('Rahul Sharma');
    const priya  = find('Priya Mehta');
    const kiran  = find('Kiran Patel');
    const ananya = find('Ananya Nair');
    const vikram = find('Vikram Singh');
    const dev    = find('Dev Patel');
    const sneha  = find('Sneha Reddy');
    const kavya  = find('Kavya Iyer');
    const divya  = find('Divya Shah');
    const nisha  = find('Nisha Agarwal');
    const rohit  = find('Rohit Verma');
    const sanjay = find('Sanjay Gupta');
    const riya   = find('Riya Tiwari');

    const today = new Date();
    const d = (offset) => { const dt = new Date(today); dt.setDate(dt.getDate() + offset); return dt; };

    // ── Leaves ──
    const leavesData = [
      // Pending (manager needs to action)
      { employee:vikram._id, leaveType:'EL', fromDate:d(1),  toDate:d(1),  numberOfDays:1, reason:'Personal work',    backup:dev._id,    status:'pending',  deductedFrom:'el' },
      { employee:sneha._id,  leaveType:'SL', fromDate:d(3),  toDate:d(4),  numberOfDays:2, reason:'Not feeling well', backup:divya._id,   status:'pending',  deductedFrom:'sl' },
      { employee:kavya._id,  leaveType:'CL', fromDate:d(7),  toDate:d(8),  numberOfDays:2, reason:'Family function',  backup:priya._id,   status:'pending',  deductedFrom:'cl' },
      { employee:sanjay._id, leaveType:'EL', fromDate:d(14), toDate:d(18), numberOfDays:5, reason:'Vacation',         backup:rohit._id,   status:'pending',  deductedFrom:'el' },
      { employee:riya._id,   leaveType:'SL', fromDate:d(6),  toDate:d(7),  numberOfDays:2, reason:'Migraine',         backup:divya._id,   status:'pending',  deductedFrom:'sl' },
      // Approved (today + upcoming)
      { employee:rahul._id,  leaveType:'EL', fromDate:d(0),  toDate:d(2),  numberOfDays:3, reason:'Wedding anniversary', backup:ananya._id, status:'approved', managerNote:'Approved — enjoy! 🎉', reviewedBy:manager._id, reviewedAt:new Date(), deductedFrom:'el' },
      { employee:priya._id,  leaveType:'SL', fromDate:d(0),  toDate:d(0),  numberOfDays:1, reason:'Fever',            backup:kavya._id,   status:'approved', managerNote:'Get well soon! 💙', reviewedBy:manager._id, reviewedAt:new Date(), deductedFrom:'sl' },
      { employee:kiran._id,  leaveType:'CL', fromDate:d(0),  toDate:d(2),  numberOfDays:3, reason:'Relocation',       backup:dev._id,     status:'approved', managerNote:'Approved',          reviewedBy:manager._id, reviewedAt:new Date(), deductedFrom:'cl' },
      { employee:divya._id,  leaveType:'EL', fromDate:d(-4), toDate:d(-3), numberOfDays:2, reason:'Travel',           backup:sneha._id,   status:'approved', managerNote:'Approved',          reviewedBy:manager._id, reviewedAt:new Date(), deductedFrom:'el' },
      { employee:sanjay._id, leaveType:'EL', fromDate:d(11), toDate:d(12), numberOfDays:2, reason:'Holiday trip',     backup:rohit._id,   status:'approved', managerNote:'Approved 🌴',       reviewedBy:manager._id, reviewedAt:new Date(), deductedFrom:'el' },
      // Rejected
      { employee:nisha._id,  leaveType:'CL', fromDate:d(-7), toDate:d(-7), numberOfDays:1, reason:'Personal',         backup:null,        status:'rejected', managerNote:'Team dependency that week — please reapply next month.', reviewedBy:manager._id, reviewedAt:new Date(), deductedFrom:'cl' },
    ];

    const createdLeaves = await Leave.insertMany(leavesData);
    console.log(`✅ Created ${createdLeaves.length} leaves`);

    // ── Carry Forward for Rahul (has 2 days from prev year) ──
    await CarryForward.create({
      employee: rahul._id, year: 2024, unusedLeaves: 7, carriedForward: 2,
      lapsed: 5, maxLimit: 5, processedBy: admin._id
    });

    // ── Events ──
    const events = await Event.insertMany([
      { title:'All Hands Meeting',    date:d(4),  time:'10:00', assignedTo:'all',       location:'Main Conference Hall',  description:'Q1 review & Q2 planning',      createdBy:manager._id },
      { title:'Product Demo Day',     date:d(11), time:'14:00', assignedTo:'Engineering',location:'Zoom — link shared',    description:'Sprint deliverables demo',     createdBy:manager._id },
      { title:'Design System Review', date:d(8),  time:'11:00', assignedTo:'Design',    location:'Room B-204',            description:'Q2 design system sign-off',    createdBy:manager._id },
      { title:'Marketing Strategy Q2',date:d(21), time:'09:30', assignedTo:'Marketing', location:'Room A-101',            description:'Set Q2 marketing KPIs',        createdBy:manager._id },
    ]);
    console.log(`✅ Created ${events.length} events`);

    // ── Holidays ──
    const yr = today.getFullYear();
    const holidays = await Holiday.insertMany([
      { name:'Good Friday',       date:new Date(yr,3,18),  type:'National Holiday', createdBy:admin._id },
      { name:'Maharashtra Day',   date:new Date(yr,4,1),   type:'Regional Holiday', notes:'Maharashtra', createdBy:admin._id },
      { name:'Buddha Purnima',    date:new Date(yr,4,12),  type:'National Holiday', createdBy:admin._id },
      { name:'Independence Day',  date:new Date(yr,7,15),  type:'National Holiday', createdBy:admin._id },
      { name:'Janmashtami',       date:new Date(yr,7,16),  type:'National Holiday', createdBy:admin._id },
      { name:'Ganesh Chaturthi',  date:new Date(yr,7,27),  type:'National Holiday', createdBy:admin._id },
      { name:'Gandhi Jayanti',    date:new Date(yr,9,2),   type:'National Holiday', createdBy:admin._id },
      { name:'Diwali',            date:new Date(yr,9,20),  type:'National Holiday', createdBy:admin._id },
      { name:'Diwali Holiday',    date:new Date(yr,9,21),  type:'Company Holiday',  createdBy:admin._id },
      { name:'Christmas',         date:new Date(yr,11,25), type:'National Holiday', createdBy:admin._id },
    ]);
    console.log(`✅ Created ${holidays.length} holidays`);

    // ── Notifications ──
    await Notification.insertMany([
      { recipient:manager._id, type:'leave_applied',    title:'New Leave Request',         message:`Vikram Singh applied for EL on ${d(1).toDateString()} (1 day). Backup: Dev Patel assigned.`,                 icon:'📋', isRead:false },
      { recipient:manager._id, type:'leave_applied',    title:'New Leave Request',         message:`Sneha Reddy applied for SL (${d(3).toDateString()} – ${d(4).toDateString()}). Reason: Not feeling well.`,        icon:'🤒', isRead:false },
      { recipient:manager._id, type:'conflict_detected',title:'⚠️ Conflict Detected',     message:'3 Developers on leave simultaneously. Engineering understaffed. Review before approving.',                       icon:'⚡', isRead:false },
      { recipient:manager._id, type:'conflict_detected',title:'🔴 Critical Conflict Risk', message:"Vikram's request approval will leave only 1 Developer available. Assign backup first.",                          icon:'🔴', isRead:false },
      { recipient:rahul._id,   type:'leave_approved',   title:'Leave Approved ✅',         message:`Your EL (${d(0).toDateString()} – ${d(2).toDateString()}) has been approved. Enjoy your time off!`,             icon:'✅', isRead:false },
      { recipient:rahul._id,   type:'event_created',    title:'New Event: All Hands',      message:`All Hands Meeting on ${d(4).toDateString()} at 10:00 AM — Main Conference Hall.`,                               icon:'📢', isRead:true  },
      { recipient:rahul._id,   type:'holiday_added',    title:'Holiday: Good Friday',      message:`Good Friday (${new Date(yr,3,18).toDateString()}) is a company holiday.`,                                        icon:'🎊', isRead:true  },
      { recipient:priya._id,   type:'leave_approved',   title:'Leave Approved ✅',         message:`Your SL (${d(0).toDateString()}) has been approved. Get well soon!`,                                             icon:'✅', isRead:false },
      { recipient:admin._id,   type:'system',           title:'System Alert',              message:'Conflict threshold exceeded in Engineering (3+ Developers on leave simultaneously).',                             icon:'🛡️', isRead:false },
      { recipient:admin._id,   type:'leave_applied',    title:'Daily Activity',            message:'5 new leave applications submitted today. 2 conflict incidents detected.',                                        icon:'📋', isRead:true  },
    ]);

    // ── Audit Logs ──
    await AuditLog.insertMany([
      { performedBy:manager._id, action:'approve',  description:`Approved EL for Rahul Sharma (3 days)`,          targetUser:rahul._id  },
      { performedBy:manager._id, action:'approve',  description:`Approved SL for Priya Mehta (1 day)`,            targetUser:priya._id  },
      { performedBy:manager._id, action:'approve',  description:`Approved CL for Kiran Patel (3 days)`,           targetUser:kiran._id  },
      { performedBy:manager._id, action:'reject',   description:`Rejected CL for Nisha Agarwal — "Team dependency that week"`, targetUser:nisha._id },
      { performedBy:admin._id,   action:'policy',   description:`Updated leave policy: Max Carry Forward = 5 days` },
      { performedBy:manager._id, action:'event',    description:`Created event: All Hands Meeting for all employees` },
      { performedBy:admin._id,   action:'user_add', description:`Added employee: Naren Das (DevOps Eng · Engineering)`, targetUser:find('Naren Das')._id },
      { performedBy:manager._id, action:'holiday',  description:`Added holiday: Good Friday` },
    ]);

    console.log('\n🎉 ══════════════════════════════════════════════');
    console.log('   SEED COMPLETE — Login Credentials:');
    console.log('   🧑‍💼 Admin:    arjun@leaveflow.com  / password123');
    console.log('   👨‍💼 Manager:  meera@leaveflow.com  / password123');
    console.log('   👤 Employee: rahul@leaveflow.com  / password123');
    console.log('   (All other employees also use password123)');
    console.log('══════════════════════════════════════════════');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
};

seed();
