const cloud = require('wx-server-sdk');
const https = require('https');
const { URL } = require('url');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ===== 配置区：改成你自己的 =====
const APP_ID = 'wx5c9c63cd3f023c2a';
const APP_SECRET = process.env.APP_SECRET;
// 三个订阅模板：发提醒时轮流用，点一次授权 3 个 → 攒 3 次发送额度（额度用完自动换下一个）
// 字段 key 必须与小程序后台模板完全一致，否则发送会被微信拒绝
const TEMPLATES = [
  {
    id: 'e1r7JQxOZ5RLQz-giCEyKVGnTlEgERv1ILKQBp4MGM4', // 日程提醒(571)：日程标题/时间/备注
    fields: { thing5: 'drug_name', time25: 'take_time', thing11: 'text' },
  },
  {
    id: '5plmd8WphwvOhKWaDD4tS-WWbvcXS-7L5bHcVR4chfg', // 健康记录提醒：提醒事项/时间/温馨提示
    fields: { thing3: 'drug_name', time7: 'take_time', thing2: 'text' },
  },
  {
    id: '8wPrzQSttxYDe_Lapv-TdLPT-tGqyxhetVUnfXqRC0Q', // 待办事项提醒：事项主题/事项时间/事项描述
    fields: { thing1: 'drug_name', time2: 'take_time', thing4: 'text' },
  },
];
const MISS_MIN = 30; // 漏服判定：到点提醒后 30 分钟仍未确认 → 通知子女并标记漏服
// ===============================

function pad(n) { return n < 10 ? '0' + n : '' + n; }
// 云函数运行时是 UTC+0，统一 +8 转北京时间（否则提醒会晚 8 小时）
function beijingNow() { return new Date(Date.now() + 8 * 60 * 60 * 1000); }
function todayStr() { const d = beijingNow(); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function hhmm() { const d = beijingNow(); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }

// ===== 用药频率：每 X 日一次 =====
// frequency 取值：'每天' / '每周'(兼容) / '每X日一次'
function intervalOf(plan) {
  const f = plan.frequency || '每天';
  if (f === '每天') return 1;
  if (f === '每周') return 7;
  const m = String(f).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

// 锚点日期（第 0 天）：优先 start_date，否则回退到 create_time 的北京时间日期
function anchorOf(plan, fallback) {
  if (plan.start_date) return plan.start_date;
  if (plan.create_time) {
    const d = new Date(new Date(plan.create_time).getTime() + 8 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return fallback;
}

// 纯日期差（天），避免时区干扰
function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// 今天是否是服药日
function isDueToday(plan, date) {
  const interval = intervalOf(plan);
  if (interval <= 1) return true;
  const diff = daysBetween(anchorOf(plan, date), date);
  return diff % interval === 0;
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function postJSON(url, payload) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ __raw: d }); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

async function getAccessToken() {
  const data = await getJSON(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APP_ID}&secret=${APP_SECRET}`);
  return data.access_token || '';
}

// 日期文本：date 类型字段只接受日期，格式如「2026年10月6日」
function dateText(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

// 字段取值：src 为 'text'/'date_text'/'time_note' 是特殊来源，其余直接取 plan 上的字段
function fieldValue(src, plan, text, date) {
  if (src === 'text') return text || '';
  if (src === 'date_text') return dateText(date);
  if (src === 'time_note') {
    const base = plan.take_time ? `服用时间 ${plan.take_time}` : '记得服药';
    return plan.timing ? `${base} ${plan.timing}` : base;
  }
  return plan[src] || '';
}

// 发订阅消息：三个模板轮流，某个额度用完/未授权就自动换下一个
async function sendSubscribe(openid, plan, text, date) {
  if (!openid || !APP_SECRET) return false;
  const token = await getAccessToken();
  if (!token) return false;
  for (const tpl of TEMPLATES) {
    try {
      const data = {
        touser: openid,
        template_id: tpl.id,
        page: 'pages/elder/today/today',
        data: {},
      };
      Object.keys(tpl.fields).forEach((k) => {
        let val = fieldValue(tpl.fields[k], plan, text, date);
        if (k.indexOf('thing') === 0) val = val.slice(0, 20); // thing 类型限 20 字
        data.data[k] = { value: val };
      });
      const res = await postJSON(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, data);
      console.log('[提醒] 模板', tpl.id, '结果:', JSON.stringify(res));
      if (res && res.errcode === 0) return true;
    } catch (e) {
      console.log('[提醒] 模板', tpl.id, '发送异常:', e.message);
    }
  }
  return false;
}

// 读取用户剩余漏服通知次数
async function getQuota(openid) {
  try {
    const res = await db.collection('users').where({ openid }).get();
    return res.data.length ? (res.data[0].remind_quota || 0) : 0;
  } catch (e) { return 0; }
}

// 扣除 1 次漏服通知次数
async function decQuota(openid) {
  try {
    const res = await db.collection('users').where({ openid }).get();
    if (!res.data.length) return;
    const cur = res.data[0].remind_quota || 0;
    await db.collection('users').where({ openid }).update({ data: { remind_quota: Math.max(0, cur - 1) } });
  } catch (e) {}
}

// 通知子女：给 creator_openid 发订阅消息，成功后扣 1 次漏服次数
async function sendToChild(childOpenid, plan, log) {
  if (!childOpenid) return;
  const quota = await getQuota(childOpenid);
  if (quota <= 0) {
    console.log(`[提醒] 子女 ${childOpenid} 无漏服通知次数，跳过`);
    return;
  }
  const text = `老人还没吃药，请及时提醒`;
  const ok = await sendSubscribe(childOpenid, plan, text, log.date);
  if (ok) {
    await decQuota(childOpenid);
    console.log(`[提醒] 已通知子女并扣除 1 次：${log.drug_name}`);
  }
}

async function getPlan(plan_id) {
  try { return (await db.collection('medication_plans').doc(plan_id).get()).data; }
  catch (e) { return null; }
}

// 普通提醒文案（不接 AI）
function plainText(plan) {
  const drug = plan.drug_name || '药品';
  const timing = plan.timing ? `（${plan.timing}）` : '';
  return `记得吃药：${drug}${timing}`;
}

// 多药合并文案：同一时间点的药名用「、」连接，不带 timing（避免多药 timing 冲突 + 超长）
function mergedText(plans) {
  const drugs = plans.map((p) => p.drug_name || '药品').join('、');
  return `记得吃药：${drugs}`;
}

// 到点提醒：发订阅消息给老人。同一「人 + 服药时间」的多条方案合并成一条消息，但每个方案仍各自建「待服」记录
async function remindGroup(plans, date, time) {
  const owner = plans[0].owner_openid;
  const merged = plans.length > 1;
  const text = merged ? mergedText(plans) : plainText(plans[0]);
  const drugLabel = merged
    ? plans.map((p) => p.drug_name || '药品').join('、')
    : (plans[0].drug_name || '药品');

  // 合并成一条订阅消息（标题/主题=药名列表，时间=方案时间，备注/描述=文案）
  await sendSubscribe(owner, { drug_name: drugLabel, take_time: plans[0].take_time, timing: plans[0].timing }, text, date);

  // 每个方案仍独立建「待服」记录，保证打卡 / 漏服按方案粒度统计
  const next = new Date(Date.now() + MISS_MIN * 60 * 1000);
  for (const plan of plans) {
    await db.collection('medication_logs').add({
      data: {
        plan_id: plan._id,
        drug_name: plan.drug_name,
        owner_openid: plan.owner_openid,
        creator_openid: plan.creator_openid,
        date,
        time,
        status: '待服',
        level: 1,
        next_remind_time: next,
        create_time: db.serverDate(),
      },
    });
  }
  console.log(`[提醒] 到点提醒已发${merged ? '（合并）' : ''}：${drugLabel} ${time} → ${owner}`);
}

// 漏服处理：到点提醒 MISS_MIN 分钟后仍未确认 → 通知子女 + 标记漏服
async function escalate(now) {
  const pending = await db.collection('medication_logs')
    .where({ status: '待服', next_remind_time: _.lte(now) })
    .limit(1000)
    .get();

  for (const log of pending.data) {
    const plan = await getPlan(log.plan_id);
    if (!plan) continue;
    await sendToChild(log.creator_openid, plan, log);
    await db.collection('medication_logs').doc(log._id).update({
      data: { status: '漏服', level: 2 },
    });
    console.log(`[提醒] 漏服通知子女 + 标记漏服：${log.drug_name}`);
  }
}

exports.main = async (event, context) => {
  const now = new Date();
  const date = todayStr();
  const time = hhmm();

  // 先处理到期的漏服记录，再发新提醒
  await escalate(now);

  const plans = await db.collection('medication_plans').limit(1000).get();

  // 筛出今天到点且尚未处理的方案
  const duePlans = [];
  for (const plan of plans.data) {
    if (!plan.take_time || plan.take_time > time) continue; // 还没到点
    if (!isDueToday(plan, date)) continue; // 今天不是服药日（每X日一次）
    const exist = await db.collection('medication_logs')
      .where({ plan_id: plan._id, date }).get();
    if (exist.data.length > 0) continue; // 今天已处理
    duePlans.push(plan);
  }

  // 按「人 + 服药时间」分组，同一时间点合并成一条提醒
  const groups = {};
  duePlans.forEach((p) => {
    const key = `${p.owner_openid}|${p.take_time}`;
    (groups[key] = groups[key] || []).push(p);
  });

  let due = 0;
  for (const key of Object.keys(groups)) {
    await remindGroup(groups[key], date, time);
    due += groups[key].length;
  }

  return { success: true, date, time, due };
};
