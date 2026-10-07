const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function beijingTodayStr() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const { plan_id, drug_name, drug_category, take_time, timing, frequency, taboo_food } = event;

  if (!plan_id) return { success: false, errMsg: '缺少计划ID' };
  if (!drug_name || !take_time) return { success: false, errMsg: '药品名和服用时间必填' };

  let plan;
  try {
    plan = (await db.collection('medication_plans').doc(plan_id).get()).data;
  } catch (e) {
    return { success: false, errMsg: '计划不存在' };
  }

  if (plan.owner_openid !== openid && plan.creator_openid !== openid) {
    return { success: false, errMsg: '无权修改' };
  }

  const data = { drug_name, take_time };
  if (drug_category !== undefined) data.drug_category = drug_category;
  if (timing !== undefined) data.timing = timing;
  if (frequency !== undefined && frequency !== plan.frequency) {
    data.frequency = frequency;
    data.start_date = beijingTodayStr(); // 改了频率，从今天重新起算服药周期
  } else if (frequency !== undefined) {
    data.frequency = frequency;
  }
  if (taboo_food !== undefined) data.taboo_food = taboo_food;

  await db.collection('medication_plans').doc(plan_id).update({ data });
  return { success: true };
};
