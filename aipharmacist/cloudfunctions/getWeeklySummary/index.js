const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');
const { URL } = require('url');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ===== 配置区（与 generateText 一致）=====
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = 'https://api.deepseek.com';
const LLM_MODEL = 'deepseek-chat';
const MAX_RETRY = 2;
// ===============================

const DANGER_WORDS = ['停药', '停用', '减量', '加量', '增量', '补服', '换药', '调整剂量', '加一片', '减一片'];

const SYSTEM_PROMPT = `你是"小云"，一个温暖贴心的用药管家。你要把 TA 本周的用药情况，总结成一段温暖贴心的用药周报。

要求：
1. 只给生活化的提醒建议（如设闹钟、饭后顺手吃、把药放显眼处、午睡后提醒），绝对不能说医疗建议（补服、停药、改剂量、换药）
2. 语气温暖、让人安心，不要制造焦虑
3. 指出漏服规律（如果有）：漏服集中在哪个时间段或哪种药
4. 如果本周没有漏服，要肯定和鼓励 TA
5. 称呼必须用 TA 的昵称，没有昵称就用"您"，不要用"你"
6. 控制在 80 字以内`;

function pad(n) { return n < 10 ? '0' + n : '' + n; }
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
function isDueOn(plan, date) {
  const interval = intervalOf(plan);
  if (interval <= 1) return true;
  const anchor = plan.start_date || date;
  return daysBetween(anchor, date) % interval === 0;
}

// ===== 报告缓存（当天生成一次，避免重复调用 LLM）=====
const REPORT_TYPE = 'weekly_v3';
const CACHE_COLLECTION = 'reports';

async function getCached(ownerOpenid, date) {
  try {
    const res = await db.collection(CACHE_COLLECTION)
      .where({ type: REPORT_TYPE, owner_openid: ownerOpenid, date })
      .limit(1)
      .get();
    return res.data[0] || null;
  } catch (e) {
    return null;
  }
}

async function saveCached(ownerOpenid, date, summary, stats) {
  try {
    await db.collection(CACHE_COLLECTION).add({
      data: { type: REPORT_TYPE, owner_openid: ownerOpenid, date, summary, stats, create_time: db.serverDate() },
    });
  } catch (e) {}
}

async function ensureCacheCollection() {
  try {
    await db.createCollection(CACHE_COLLECTION);
  } catch (e) {
    // 集合已存在则忽略
  }
}
// ===============================

function postJSON(url, payload, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }, headers),
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({ __raw: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('LLM 超时')); });
    req.write(body);
    req.end();
  });
}

async function callLLM(userPrompt) {
  const data = await postJSON(`${LLM_BASE_URL}/chat/completions`, {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 200,
    stream: false,
  }, { Authorization: `Bearer ${LLM_API_KEY}` });

  if (data.error) throw new Error(data.error.message || 'LLM 返回错误');
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return (content || '').trim();
}

function buildUserPrompt(nickname, rate, taken, due, missed, missSummary) {
  const parts = [];
  parts.push(`昵称：${nickname || '您'}`);
  parts.push(`本周（近 7 天）共应服 ${due} 次，已服 ${taken} 次，完成率 ${rate}%`);
  parts.push(`漏服 ${missed} 次`);
  if (missSummary && missSummary.length) {
    parts.push('漏服分布：');
    missSummary.forEach((s) => parts.push(`- ${s}`));
  }
  parts.push('');
  parts.push('请生成一段本周用药总结。');
  return parts.join('\n');
}

function hardBlock(text) {
  if (!text || !text.trim()) return true;
  if (!/[一-龥]/.test(text)) return true;
  if (DANGER_WORDS.some((w) => text.includes(w))) return true;
  return false;
}

function softFix(text, nickname) {
  let out = text;
  out = out.replace(/,/g, '，').replace(/\./g, '。').replace(/!/g, '！')
    .replace(/\?/g, '？').replace(/;/g, '；').replace(/:/g, '：');
  const nick = nickname || '您';
  out = out.replace(/患者/g, nick).replace(/您/g, nick).replace(/你/g, nick);
  if (out.length > 80) {
    const cut = out.slice(0, 80);
    const lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
    out = lastStop > 0 ? cut.slice(0, lastStop + 1) : cut;
  }
  return out;
}

function fallbackSummary(nickname, rate, missed) {
  const nick = nickname || '您';
  if (missed === 0) return `${nick}本周服药完成率 ${rate}%，表现很好，继续保持！`;
  return `${nick}本周服药完成率 ${rate}%，漏服 ${missed} 次，记得提醒按时吃药哦。`;
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const family_openid = event.family_openid || openid;

  const today = beijingDate(0);
  await ensureCacheCollection();

  // 当天已生成过 → 直接返回缓存，不再调 LLM
  const cached = await getCached(family_openid, today);
  if (cached) {
    return { success: true, locked: false, summary: cached.summary, stats: cached.stats, cached: true };
  }

  // 2. 统计近 7 天
  const weekStart = beijingDate(-6);

  const plansRes = await db.collection('medication_plans')
    .where({ owner_openid: family_openid }).get();

  // 服药未满一周 → 锁定，不生成周报
  const planStartDates = plansRes.data.map((p) => p.start_date).filter(Boolean);
  if (planStartDates.length) {
    const earliestStart = planStartDates.sort()[0];
    if (daysBetween(earliestStart, today) < 6) {
      return { success: true, locked: true, summary: '', stats: null };
    }
  }

  const logsRes = await db.collection('medication_logs')
    .where({ owner_openid: family_openid, date: _.gte(weekStart).and(_.lte(today)) })
    .limit(1000)
    .get();
  const logs = logsRes.data;

  let due = 0;
  for (let off = 6; off >= 0; off--) {
    const date = beijingDate(-off);
    due += plansRes.data.filter((p) => isDueOn(p, date)).length;
  }
  const taken = logs.filter((l) => l.status === '已服').length;
  const missedLogs = logs.filter((l) => l.status === '漏服');
  const missed = missedLogs.length;
  const rate = due > 0 ? Math.round((taken / due) * 100) : 100;

  // 漏服按「药品 + 时间」聚合
  const missMap = {};
  missedLogs.forEach((l) => {
    const key = `${l.drug_name} ${l.time}`;
    missMap[key] = (missMap[key] || 0) + 1;
  });
  const missSummary = Object.entries(missMap).map(([k, v]) => `${k} 漏服 ${v} 次`);

  let nickname = '您';
  try {
    const fam = await db.collection('users').where({ openid: family_openid }).get();
    if (fam.data[0] && fam.data[0].nickname) nickname = fam.data[0].nickname;
  } catch (e) {}

  // 3. 调 LLM 生成总结（带护栏），失败则走兜底
  const userPrompt = buildUserPrompt(nickname, rate, taken, due, missed, missSummary);
  let summary = '';
  for (let i = 0; i < MAX_RETRY; i++) {
    let raw = '';
    try {
      raw = await callLLM(userPrompt);
    } catch (e) {
      continue;
    }
    if (!hardBlock(raw)) {
      summary = softFix(raw, nickname);
      break;
    }
  }
  if (!summary) summary = fallbackSummary(nickname, rate, missed);

  const stats = { rate, taken, due, missed };
  await saveCached(family_openid, today, summary, stats);

  return { success: true, locked: false, summary, stats, cached: false };
};
