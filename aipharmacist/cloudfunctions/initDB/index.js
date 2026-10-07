const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const collections = ['users', 'medication_plans', 'medication_logs', 'bindings'];
  const results = [];

  for (const name of collections) {
    try {
      await db.createCollection(name);
      results.push({ name, status: 'created' });
    } catch (e) {
      results.push({ name, status: 'exists' });
    }
  }

  return { success: true, results };
};
