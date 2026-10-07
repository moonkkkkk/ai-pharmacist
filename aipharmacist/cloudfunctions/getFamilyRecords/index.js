const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function pad(n) { return n < 10 ? '0' + n : '' + n; }
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
function isDueOn(plan, date) {
  const interval = intervalOf(plan);
  if (interval <= 1) return true;
  const anchor = plan.start_date || date;
  return daysBetween(anchor, date) % interval === 0;
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const { family_openid, month } = event; // month: 'YYYY-MM'

  if (!family_openid || !month) {
    return { success: false, errMsg: '缺少参数' };
  }

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${pad(daysInMonth)}`;

  const plansRes = await db.collection('medication_plans')
    .where({ owner_openid: family_openid }).get();
  const plans = plansRes.data;

  const logsRes = await db.collection('medication_logs')
    .where({
      owner_openid: family_openid,
      date: _.gte(startDate).and(_.lte(endDate)),
    }).get();
  const logs = logsRes.data;

  const days = [];
  const missedList = [];
  let totalDue = 0;
  let totalTaken = 0;
  let totalMissed = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${pad(d)}`;
    const due = plans.filter((p) => isDueOn(p, date)).length;
    const dayLogs = logs.filter((l) => l.date === date);
    const taken = dayLogs.filter((l) => l.status === '已服').length;
    const missed = dayLogs.filter((l) => l.status === '漏服').length;

    totalDue += due;
    totalTaken += taken;
    totalMissed += missed;

    // none=无记录 / full=全服 / part=部分 / miss=漏服
    let state = 'none';
    if (due > 0) {
      if (missed > 0) state = 'miss';
      else if (taken >= due) state = 'full';
      else state = 'part';
    }

    days.push({ day: d, date, state, due, taken, missed });

    dayLogs.filter((l) => l.status === '漏服').forEach((l) => {
      missedList.push({ date, time: l.time, drug_name: l.drug_name });
    });
  }

  const rate = totalDue > 0 ? Math.round((totalTaken / totalDue) * 1000) / 10 : 0;

  return {
    success: true,
    month,
    days,
    missedList,
    stats: { rate, missed: totalMissed, taken: totalTaken, due: totalDue },
  };
};
