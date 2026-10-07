// 文案生成 + 护栏的纯逻辑（不依赖云环境，方便本地 node test.js 单测）

const DANGER_WORDS = [
  '停药', '停用', '减量', '加量', '增量', '补服', '换药',
  '调整剂量', '减少剂量', '增加剂量', '加一片', '减一片',
];
const VAGUE_WORDS = ['可能', '也许', '不确定', '大概', '或许', '应该可以'];

const SYSTEM_PROMPT = `你是一个温暖、贴心的用药小管家，你的名字叫"小云"。
你的服务对象是 65 岁以上的慢病老人及其子女。

核心原则：
1. 绝对不能建议停药、改剂量、更换药品
2. 药品名称、服用时间、剂量必须和输入严格一致
3. 语气要像家人在耳边温柔叮嘱，不要像说明书
4. 如果输入中有食物禁忌信息，必须在提醒中提及
5. 每次提醒控制在 80 字以内
6. 使用用户提供的昵称来称呼，不允许使用"患者""您"
7. 如果用户漏服了，不要建议补服，只说"今天XX时间的药尚未确认"
8. 药品名称必须使用中文通用名。英文输入请转换为中文通用名
9. 如果天气为空，不要提及任何天气相关内容`;

function buildUserPrompt(ctx) {
  const parts = [];
  parts.push(`用户昵称：${ctx.nickname || '老人家'}`);
  parts.push(`药品名称：${ctx.drug_name}`);
  parts.push(`药品类别：${ctx.drug_category || ''}`);
  parts.push(`服用时间：${ctx.time}`);
  parts.push(`服用时机：${ctx.timing || ''}`);
  if (ctx.taboo_food) parts.push(`特殊禁忌：${ctx.taboo_food}`);
  if (ctx.weather) parts.push(`今日天气：${ctx.weather}`);
  parts.push('');
  parts.push('要求：');
  parts.push('- 语气温暖亲切，像家人在耳边说话');
  parts.push('- 如果天气极端（>35℃ 或 <0℃），加入天气关怀');
  parts.push('- 如果有特殊禁忌，用通俗的话解释原因');
  parts.push('- 字数控制在 80 字以内');
  parts.push('- 如果天气为空，跳过天气描述');
  return parts.join('\n');
}

// "08:00" → "8点"，兜底文案用，更口语
function chineseTime(time) {
  if (!time) return '';
  const m = String(time).match(/^(\d{1,2}):\d{2}$/);
  if (m) return `${parseInt(m[1], 10)}点`;
  return time;
}

const FALLBACK_TEMPLATES = {
  '降压药': (n, t, timing) => `${n}，${chineseTime(t)}啦，降压药该吃了。记得${timing || '按时'}服用哦。`,
  '降糖药': (n, t, timing) => `${n}，${chineseTime(t)}了，降糖药${timing || '按时'}吃。按时吃饭，血糖稳稳的。`,
  '降脂药': (n, t, timing) => `${n}，${chineseTime(t)}啦，降脂药该吃了。${timing || '按时'}服用最好。`,
  '其他': (n, t, timing, drug) => `${n}，${chineseTime(t)}了，${drug}该吃了。${timing || '按时'}服用哦。`,
};

function buildFallback(ctx) {
  const nickname = ctx.nickname || '老人家';
  const fn = FALLBACK_TEMPLATES[ctx.drug_category] || FALLBACK_TEMPLATES['其他'];
  return fn(nickname, ctx.time, ctx.timing, ctx.drug_name);
}

// 软修正：英文标点→中文、称呼→昵称、超字数截断
function softFix(text, ctx) {
  let out = text;
  out = out.replace(/,/g, '，').replace(/\./g, '。').replace(/!/g, '！')
    .replace(/\?/g, '？').replace(/;/g, '；').replace(/:/g, '：');
  const nickname = ctx.nickname || '老人家';
  out = out.replace(/患者/g, nickname).replace(/您/g, nickname);
  if (out.length > 80) {
    const cut = out.slice(0, 80);
    const lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
    out = lastStop > 0 ? cut.slice(0, lastStop + 1) : cut;
  }
  return out;
}

// 硬性阻断检查。返回 { blocked, reason }
function hardBlock(text, ctx) {
  if (!text || !text.trim()) return { blocked: true, reason: 'G4-空输出' };
  if (!/[一-龥]/.test(text)) return { blocked: true, reason: 'G4-非中文' };
  if (DANGER_WORDS.some((w) => text.includes(w))) return { blocked: true, reason: 'G1-危险建议' };
  if (VAGUE_WORDS.some((w) => text.includes(w))) return { blocked: true, reason: 'G5-模糊表述' };

  // G2 药品名一致性：至少一个药名出现在文案里
  const names = String(ctx.drug_name || '').split(/[+＋、,，\s]+/).filter(Boolean);
  if (names.length && !names.some((n) => text.includes(n))) {
    return { blocked: true, reason: 'G2-药名不一致' };
  }

  // G3 时间一致性：仅当输出出现 HH:MM 时校验
  const t = text.match(/(\d{1,2}):(\d{2})/);
  if (t && ctx.time) {
    const outMin = parseInt(t[1], 10) * 60 + parseInt(t[2], 10);
    const inM = String(ctx.time).match(/(\d{1,2}):(\d{2})/);
    if (inM) {
      const inMin = parseInt(inM[1], 10) * 60 + parseInt(inM[2], 10);
      if (Math.abs(outMin - inMin) > 5) return { blocked: true, reason: 'G3-时间偏离' };
    }
  }

  return { blocked: false, reason: '' };
}

// 输入侧清洗：移除危险指令，防止"建议停药"进到提示词里
function sanitizeInput(text) {
  if (!text) return '';
  let out = String(text);
  DANGER_WORDS.forEach((w) => { out = out.split(w).join(''); });
  return out;
}

function applyGuardrails(text, ctx) {
  const blocked = hardBlock(text, ctx);
  if (blocked.blocked) return { blocked: true, reason: blocked.reason, text: '' };
  return { blocked: false, reason: '', text: softFix(text, ctx) };
}

module.exports = {
  SYSTEM_PROMPT,
  buildUserPrompt,
  applyGuardrails,
  buildFallback,
  sanitizeInput,
  DANGER_WORDS,
  VAGUE_WORDS,
};
