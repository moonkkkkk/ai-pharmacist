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
  const owner = event.owner_openid || openid;
  const today = beijingDate(0);
  const weekStart = beijingDate(-6);

  const plansRes = await db.collection('medication_plans')
    .where({ owner_openid: owner }).get();
  const plans = plansRes.data;

  const logsRes = await db.collection('medication_logs')
    .where({ owner_openid: owner, date: _.gte(weekStart).and(_.lte(today)) })
    .limit(1000)
    .get();
  const logs = logsRes.data;

  const trend = [];
  let todayTaken = 0;
  let todayMissed = 0;
  for (let off = 6; off >= 0; off--) {
    const date = beijingDate(-off);
    const due = plans.filter((p) => isDueOn(p, date)).length;
    const dayLogs = logs.filter((l) => l.date === date);
    const taken = dayLogs.filter((l) => l.status === '已服').length;
    const missed = dayLogs.filter((l) => l.status === '漏服').length;
    if (off === 0) { todayTaken = taken; todayMissed = missed; }
    const rate = due > 0 ? Math.round((taken / due) * 100) : 100;
    trend.push({ date: date.slice(5), rate });
  }

  const dueToday = plans.filter((p) => isDueOn(p, today)).length;
  const pending = Math.max(0, dueToday - todayTaken - todayMissed);
  const weekMissed = logs.filter((l) => l.status === '漏服').length;

  return {
    success: true,
    today: { total: dueToday, taken: todayTaken, pending, missed: todayMissed },
    weekMissed,
    trend,
  };
};
