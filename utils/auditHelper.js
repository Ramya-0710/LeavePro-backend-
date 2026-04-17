const { AuditLog } = require('../models/index');

const logAction = async ({ performedBy, action, description, targetUser = null, targetLeave = null, metadata = {} }) => {
  try {
    await AuditLog.create({ performedBy, action, description, targetUser, targetLeave, metadata });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { logAction };
