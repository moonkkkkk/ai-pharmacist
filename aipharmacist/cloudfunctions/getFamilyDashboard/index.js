const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function pad(n) { return n < 10 ? '0' + n : '' + n; }
// 云函数 UTC+0，+8 转北京时间
function beijingDate(offsetDays) {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000 + (offsetDays || 0) * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function intervalOf(plan) {
  const f = plan.frequency || '每天';
  if (f === '每天') return 1;
  if (f === '每周') return 7;
  const m = String(f).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}
function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
// 某天是否是该计划的服药日
function isDueOn(plan, date) {
  const interval = intervalOf(plan);
  if (interval <= 1) return true;
  const anchor = plan.start_date || date;
  return daysBetween(anchor, date) % interval === 0;
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const today = beijingDate(0);

  // 已绑定的家人列表（双向：我是邀请方或被邀请方）
  const asInviter = await db.collection('bindings')
    .where({ inviter_openid: openid, status: 'active' }).get();
  const asInvitee = await db.collection('bindings')
    .where({ invitee_openid: openid, status: 'active' }).get();
  const family = [
    ...asInviter.data.map((b) => ({ openid: b.invitee_openid, nickname: b.invitee_nickname })),
    ...asInvitee.data.map((b) => ({ openid: b.inviter_openid, nickname: b.inviter_nickname })),
  ];

  const result = [];
  const weekStart = beijingDate(-6);
  for (const f of family) {
    // 头像 + 手机号
    let avatar = '';
    let phone = '';
    try {
      const u = await db.collection('users').where({ openid: f.openid }).get();
      avatar = (u.data[0] && u.data[0].avatar) || '';
      phone = (u.data[0] && u.data[0].phone) || '';
    } catch (e) {}

    const plansRes = await db.collection('medication_plans')
      .where({ owner_openid: f.openid }).get();

    // 近 7 天日志（含今天），一次查完
    const weekLogsRes = await db.collection('medication_logs')
      .where({
        owner_openid: f.openid,
        date: _.gte(weekStart).and(_.lte(today)),
      })
      .limit(1000)
      .get();
    const weekLogs = weekLogsRes.data;

    // 近 7 天趋势（从早到晚）+ 今日数据
    const trend = [];
    let todayTaken = 0;
    let todayMissed = 0;
    for (let off = 6; off >= 0; off--) {
      const date = beijingDate(-off);
      const due = plansRes.data.filter((p) => isDueOn(p, date)).length;
      const dayLogs = weekLogs.filter((l) => l.date === date);
      const taken = dayLogs.filter((l) => l.status === '已服').length;
      const missed = dayLogs.filter((l) => l.status === '漏服').length;
      if (off === 0) { todayTaken = taken; todayMissed = missed; }
      const rate = due > 0 ? Math.round((taken / due) * 100) : 100;
      trend.push({ date: date.slice(5), rate });
    }

    const dueToday = plansRes.data.filter((p) => isDueOn(p, today)).length;
    const pending = Math.max(0, dueToday - todayTaken - todayMissed);
    const weekMissed = weekLogs.filter((l) => l.status === '漏服').length;

    result.push({
      openid: f.openid,
      nickname: f.nickname || '家人',
      avatar,
      phone,
      today: { total: dueToday, taken: todayTaken, pending, missed: todayMissed },
      weekMissed,
      trend,
    });
  }

  // 当前用户（子女）订阅状态，供前端判断付费墙
  let subscription = { status: 'free', expire: 0 };
  try {
    const me = await db.collection('users').where({ openid }).get();
    if (me.data[0]) {
      subscription = {
        status: me.data[0].subscription_status || 'free',
        expire: me.data[0].subscription_expire || 0,
      };
    }
  } catch (e) {}

  return { success: true, family: result, subscription };
};
