const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PRICE = 9.9; // ¥9.9/月
const DAYS = 30;

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const now = Date.now();

  const res = await db.collection('users').where({ openid }).get();
  if (!res.data.length) return { success: false, errMsg: '用户不存在' };

  const user = res.data[0];
  // 续费：在原到期日基础上续；否则从现在起算 30 天
  let expire = now + DAYS * 86400000;
  if (user.subscription_status === 'paid' && user.subscription_expire && user.subscription_expire > now) {
    expire = user.subscription_expire + DAYS * 86400000;
  }

  await db.collection('users').doc(user._id).update({
    data: {
      subscription_status: 'paid',
      subscription_expire: expire,
    },
  });

  return {
    success: true,
    price: PRICE,
    subscription_status: 'paid',
    subscription_expire: expire,
  };
};
