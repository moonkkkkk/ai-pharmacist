// 护栏纯逻辑单测：在 generateText 目录下运行 `node test.js`
const logic = require('./logic');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail || ''}`); }
}

console.log('== 硬性阻断 ==');
let r = logic.applyGuardrails('建议您停药，血压已经正常了', { drug_name: '硝苯地平', time: '08:00' });
check('G1 拦截停药建议', r.blocked === true, r.reason);

r = logic.applyGuardrails('', { drug_name: '硝苯地平', time: '08:00' });
check('G4 拦截空输出', r.blocked === true, r.reason);

r = logic.applyGuardrails('This is a reminder', { drug_name: '硝苯地平', time: '08:00' });
check('G4 拦截纯英文', r.blocked === true, r.reason);

r = logic.applyGuardrails('可能该吃药了', { drug_name: '硝苯地平', time: '08:00' });
check('G5 拦截模糊词', r.blocked === true, r.reason);

r = logic.applyGuardrails('该吃阿司匹林了', { drug_name: '硝苯地平', time: '08:00' });
check('G2 拦截药名不一致', r.blocked === true, r.reason);

r = logic.applyGuardrails('该吃药了，时间是 09:30', { drug_name: '硝苯地平', time: '08:00' });
check('G3 拦截时间偏离超5分钟', r.blocked === true, r.reason);

console.log('== 正常通过 ==');
r = logic.applyGuardrails('王叔叔，八点啦，硝苯地平该吃了。记得饭后吃哦。', { nickname: '王叔叔', drug_name: '硝苯地平', time: '08:00' });
check('正常文案放行', r.blocked === false, r.text);

console.log('== 软修正 ==');
r = logic.applyGuardrails('王叔叔,您该吃硝苯地平了.', { nickname: '王叔叔', drug_name: '硝苯地平', time: '08:00' });
check('英文逗号转中文 + 您→昵称', r.text.indexOf(',') < 0 && r.text.indexOf('您') < 0 && r.text.indexOf('硝苯地平') >= 0, r.text);

console.log('== 兜底模板 ==');
const fb = logic.buildFallback({ nickname: '王叔叔', drug_category: '降压药', drug_name: '硝苯地平', time: '08:00', timing: '饭后' });
check('降压药兜底模板', fb.indexOf('降压药') >= 0 && fb.indexOf('王叔叔') >= 0, fb);

console.log('== 输入清洗 ==');
const clean = logic.sanitizeInput('建议停药 换药');
check('输入清洗移除危险词', clean.indexOf('停药') < 0 && clean.indexOf('换药') < 0, clean);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
