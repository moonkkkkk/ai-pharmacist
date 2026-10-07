const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function pad(n) { return n < 10 ? '0' + n : '' + n; }
// 云函数 UTC+0，+8 转北京时间（作为服药周期的第 0 天）
function beijingTodayStr() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const {
    owner_openid,
    drug_name,
    drug_category,
    take_time,
    timing,
    frequency,
    taboo_food,
  } = event;

  if (!drug_name || !take_time) {
    return { success: false, errMsg: '药品名和服用时间必填' };
  }

  // 默认 owner：子女 → 已关联的老人；老人 → 自己
  let owner = owner_openid || openid;
  if (!owner_openid) {
    let role = '';
    try {
      const u = await db.collection('users').where({ openid }).get();
      role = (u.data[0] && u.data[0].role) || '';
    } catch (e) {}

    if (role === 'child') {
      const bindRes = await db.collection('bindings')
        .where(_.or([
          { inviter_openid: openid, status: 'active' },
          { invitee_openid: openid, status: 'active' },
        ]))
        .get();
      if (bindRes.data.length > 0) {
        const b = bindRes.data[0];
        owner = b.inviter_openid === openid ? b.invitee_openid : b.inviter_openid;
      }
    }
  }

  const res = await db.collection('medication_plans').add({
    data: {
      owner_openid: owner,
      creator_openid: openid,
      drug_name,
      drug_category: drug_category || '',
      take_time,
      timing: timing || '',
      frequency: frequency || '每天',
      start_date: beijingTodayStr(),
      taboo_food: taboo_food || '',
      create_time: db.serverDate(),
    },
  });

  return { success: true, plan_id: res._id };
};
