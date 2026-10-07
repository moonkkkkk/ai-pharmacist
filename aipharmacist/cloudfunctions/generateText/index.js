const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const logic = require('./logic');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// ===== 配置区：改成你自己的 =====
// DeepSeek：去 platform.deepseek.com 申请 key，充几块钱即可
// 通义千问：去 bailian.console.aliyun.com 申请，改用下面的 BASE_URL + MODEL
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = 'https://api.deepseek.com';
const LLM_MODEL = 'deepseek-chat';
// 通义千问（二选一）：
// const LLM_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
// const LLM_MODEL = 'qwen-turbo';
const MAX_RETRY = 3;
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
      { role: 'system', content: logic.SYSTEM_PROMPT },
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

exports.main = async (event, context) => {
  const ctx = {
    nickname: logic.sanitizeInput(event.nickname || ''),
    drug_name: logic.sanitizeInput(event.drug_name || ''),
    drug_category: event.drug_category || '其他',
    time: event.time || '',
    timing: event.timing || '',
    taboo_food: logic.sanitizeInput(event.taboo_food || ''),
    weather: event.weather || '',
  };

  if (!ctx.drug_name || !ctx.time) {
    return { success: false, errMsg: '药品名和服用时间必填' };
  }

  // 没配 API Key → 直接走兜底模板（保证演示不崩）
  if (!LLM_API_KEY) {
    return { success: true, text: logic.buildFallback(ctx), fallback: true, reason: '未配置 API Key' };
  }

  const userPrompt = logic.buildUserPrompt(ctx);

  for (let i = 0; i < MAX_RETRY; i++) {
    let raw = '';
    try {
      raw = await callLLM(userPrompt);
    } catch (e) {
      continue;
    }
    const res = logic.applyGuardrails(raw, ctx);
    if (!res.blocked) {
      return { success: true, text: res.text, fallback: false };
    }
  }

  return { success: true, text: logic.buildFallback(ctx), fallback: true, reason: '护栏拦截超限' };
};
