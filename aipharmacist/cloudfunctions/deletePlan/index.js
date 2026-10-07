const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const { plan_id } = event;

  if (!plan_id) return { success: false, errMsg: '缺少计划ID' };

  let plan;
  try {
    plan = (await db.collection('medication_plans').doc(plan_id).get()).data;
  } catch (e) {
    return { success: false, errMsg: '计划不存在' };
  }

  if (plan.owner_openid !== openid && plan.creator_openid !== openid) {
    return { success: false, errMsg: '无权删除' };
  }

  await db.collection('medication_plans').doc(plan_id).remove();
  return { success: true };
};
