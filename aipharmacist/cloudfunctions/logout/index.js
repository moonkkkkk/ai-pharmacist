const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  try {
    await db.collection('users').where({ openid }).remove();
    return { success: true };
  } catch (e) {
    return { success: false, errMsg: e.message };
  }
};
