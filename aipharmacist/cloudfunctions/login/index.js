const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const res = await db.collection('users').where({ openid }).get();

  if (res.data.length > 0) {
    const user = res.data[0];
    return {
      success: true,
      isNew: false,
      needRole: false,
      openid,
      role: user.role,
      nickname: user.nickname,
      phone: user.phone,
      avatar: user.avatar || '',
      subscription_status: user.subscription_status || 'free',
      subscription_expire: user.subscription_expire || 0,
    };
  }

  // 新用户但还没选身份：返回 needRole，前端引导选择
  if (!event.role) {
    return { success: true, isNew: true, needRole: true, openid };
  }

  const role = event.role;
  const nickname = event.nickname || '';
  const phone = event.phone || '';

  await db.collection('users').add({
    data: {
      openid,
      role,
      nickname,
      phone,
      subscription_status: 'free',
      subscription_expire: 0,
      create_time: db.serverDate(),
    },
  });

  return {
    success: true,
    isNew: true,
    needRole: false,
    openid,
    role,
    nickname,
    phone,
    subscription_status: 'free',
    subscription_expire: 0,
  };
};
