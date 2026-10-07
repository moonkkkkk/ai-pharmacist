const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const { nickname, avatar, phone } = event;

  const data = {};
  if (nickname !== undefined) data.nickname = nickname;
  if (avatar !== undefined) data.avatar = avatar;
  if (phone !== undefined) data.phone = phone;

  if (Object.keys(data).length === 0) {
    return { success: false, errMsg: '没有要更新的内容' };
  }

  const res = await db.collection('users').where({ openid }).get();
  if (res.data.length === 0) {
    return { success: false, errMsg: '用户不存在' };
  }

  await db.collection('users').where({ openid }).update({ data });
  return { success: true };
};
