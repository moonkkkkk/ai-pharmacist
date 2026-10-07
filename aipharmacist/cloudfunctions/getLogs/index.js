const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { plan_id, date, owner_openid } = event;

  const where = { owner_openid: owner_openid || openid };
  if (plan_id) where.plan_id = plan_id;
  if (date) where.date = date;

  const res = await db.collection('medication_logs')
    .where(where)
    .orderBy('create_time', 'desc')
    .get();

  return { success: true, logs: res.data };
};
