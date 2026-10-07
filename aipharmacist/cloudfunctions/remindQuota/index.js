const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 漏服通知次数：查询 / 增加（上限 99，发一次扣一次由 sendReminder 完成）
exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const action = event.action || 'get';
  const users = db.collection('users');

  const res = await users.where({ openid }).get();
  if (res.data.length === 0) {
    return { success: false, errMsg: '用户不存在', quota: 0 };
  }
  const current = res.data[0].remind_quota || 0;

  if (action === 'get') {
    return { success: true, quota: current };
  }

  if (action === 'add') {
    const n = Math.max(0, parseInt(event.count, 10) || 0);
    const next = Math.min(99, current + n);
    await users.where({ openid }).update({ data: { remind_quota: next } });
    return { success: true, quota: next };
  }

  return { success: false, errMsg: '未知操作', quota: current };
};
