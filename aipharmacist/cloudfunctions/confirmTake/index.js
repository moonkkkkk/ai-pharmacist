const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function pad(n) { return n < 10 ? '0' + n : '' + n; }

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { plan_id } = event;

  if (!plan_id) {
    return { success: false, errMsg: '缺少计划ID' };
  }

  let plan;
  try {
    plan = (await db.collection('medication_plans').doc(plan_id).get()).data;
  } catch (e) {
    return { success: false, errMsg: '计划不存在' };
  }

  const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // 云函数是 UTC+0，+8 转北京时间
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;

  // 找到今天该计划的「待服」记录，翻成「已服」
  const pending = await db.collection('medication_logs')
    .where({ plan_id, date, status: '待服' })
    .get();

  if (pending.data.length > 0) {
    await db.collection('medication_logs').doc(pending.data[0]._id).update({
      data: { status: '已服', confirm_time: db.serverDate() },
    });
  } else {
    // 没有待服记录（比如老人主动提前吃了），直接补一条已服
    await db.collection('medication_logs').add({
      data: {
        plan_id,
        drug_name: plan.drug_name,
        owner_openid: plan.owner_openid,
        creator_openid: plan.creator_openid,
        openid,
        date,
        time: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`,
        status: '已服',
        confirm_time: db.serverDate(),
        create_time: db.serverDate(),
      },
    });
  }

  return { success: true };
};
