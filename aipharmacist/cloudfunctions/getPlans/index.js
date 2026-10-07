const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const { owner_openid } = event;
  const where = { owner_openid: owner_openid || openid };

  const res = await db.collection('medication_plans')
    .where(where)
    .orderBy('take_time', 'asc')
    .get();

  return { success: true, plans: res.data };
};
