const cloud = require('wx-server-sdk');
const https = require('https');
const { URL } = require('url');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ===== 配置区 =====
const APP_ID = 'wx5c9c63cd3f023c2a';
const APP_SECRET = process.env.APP_SECRET;
// =================

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
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

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;

  // 1. 生成邀请码 + 待绑定记录（和 bindFamily 的 create 一致）
  const code = genCode();
  let nickname = '';
  try {
    const u = await db.collection('users').where({ openid }).get();
    nickname = (u.data[0] && u.data[0].nickname) || '';
  } catch (e) {}
  await db.collection('bindings').add({
    data: {
      code,
      inviter_openid: openid,
      inviter_nickname: nickname,
      invitee_openid: '',
      invitee_nickname: '',
      status: 'pending',
      expire_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
      create_time: db.serverDate(),
    },
  });

  // 2. 生成可点击的 URL Link，链接里带上邀请码
  const token = await getAccessToken();
  if (!token) return { success: false, errMsg: '获取 access_token 失败' };

  const res = await postJSON(
    `https://api.weixin.qq.com/wxa/generate_urllink?access_token=${token}`,
    {
      path: 'pages/index/index',
      query: `bind=${code}`,
      expire_type: 1,        // 1 = 定时过期
      expire_interval: 1,    // 1 天后过期（和邀请码一致）
    }
  );

  if (res && res.url_link) {
    return { success: true, url_link: res.url_link, code };
  }
  return { success: false, errMsg: (res && res.errmsg) || '生成链接失败' };
};
