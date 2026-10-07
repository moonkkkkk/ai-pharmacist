const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const DEMO_ELDERS = [
  {
    openid: 'demo_elder_001',
    nickname: '张大爷',
    phone: '13800001234',
    plans: [
      { drug_name: '苯磺酸氨氯地平片', drug_category: '降压药', take_time: '08:00', timing: '饭前' },
      { drug_name: '盐酸二甲双胍片', drug_category: '降糖药', take_time: '12:00', timing: '随餐' },
      { drug_name: '阿托伐他汀钙片', drug_category: '降脂药', take_time: '20:00', timing: '饭后' },
    ],
    missDays: [0, 2, 4],
  },
  {
    openid: 'demo_elder_002',
    nickname: '李奶奶',
    phone: '13800004321',
    plans: [
      { drug_name: '缬沙坦胶囊', drug_category: '降压药', take_time: '07:30', timing: '饭前' },
      { drug_name: '格列美脲片', drug_category: '降糖药', take_time: '12:30', timing: '随餐' },
    ],
    missDays: [1, 3],
  },
];

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function beijingDate(offsetDays) {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000 + (offsetDays || 0) * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// 当前账号 → 老人（老人端演示）
async function generateElderDemo(openid) {
  const me = await db.collection('users').where({ openid }).get();
  if (me.data.length > 0) {
    await db.collection('users').doc(me.data[0]._id).update({
      data: { role: 'elder', nickname: '王奶奶', phone: '13800005678' },
    });
  } else {
    await db.collection('users').add({
      data: { openid, role: 'elder', nickname: '王奶奶', phone: '13800005678', create_time: db.serverDate() },
    });
  }

  await db.collection('medication_plans').where({ owner_openid: openid }).remove();
  await db.collection('medication_logs').where({ owner_openid: openid }).remove();

  const plans = [
    { drug_name: '苯磺酸氨氯地平片', drug_category: '降压药', take_time: '08:00', timing: '饭前' },
    { drug_name: '盐酸二甲双胍片', drug_category: '降糖药', take_time: '12:00', timing: '随餐' },
    { drug_name: '阿托伐他汀钙片', drug_category: '降脂药', take_time: '20:00', timing: '饭后' },
  ];
  const planIds = [];
  for (const p of plans) {
    const r = await db.collection('medication_plans').add({
      data: {
        owner_openid: openid,
        creator_openid: openid,
        drug_name: p.drug_name,
        drug_category: p.drug_category,
        take_time: p.take_time,
        timing: p.timing,
        frequency: '每天',
        start_date: beijingDate(-6),
        create_time: db.serverDate(),
      },
    });
    planIds.push({ id: r._id, ...p });
  }

  const missDays = [0, 2, 4];
  for (let off = 0; off < 7; off++) {
    const date = beijingDate(-off);
    for (const p of planIds) {
      const isMiss = missDays.indexOf(off) >= 0 && p.drug_category === '降脂药';
      const status = isMiss ? '漏服' : '已服';
      const logData = {
        plan_id: p.id,
        drug_name: p.drug_name,
        owner_openid: openid,
        creator_openid: openid,
        openid,
        date,
        time: p.take_time,
        status,
        create_time: db.serverDate(),
      };
      if (!isMiss) logData.confirm_time = db.serverDate();
      await db.collection('medication_logs').add({ data: logData });
    }
  }

  return {
    success: true,
    message: '已生成老人演示数据：当前账号→老人「王奶奶」，3 条药品 + 近 7 天服药记录',
  };
}

// 生成一个虚拟老人（users + 绑定 + 药品 + 近 7 天记录）
async function seedFamilyElder(openid, elder) {
  await db.collection('users').add({
    data: {
      openid: elder.openid,
      role: 'elder',
      nickname: elder.nickname,
      phone: elder.phone,
      create_time: db.serverDate(),
    },
  });

  await db.collection('bindings').add({
    data: {
      code: '000000',
      inviter_openid: openid,
      inviter_nickname: '子女',
      invitee_openid: elder.openid,
      invitee_nickname: elder.nickname,
      status: 'active',
      create_time: db.serverDate(),
    },
  });

  await db.collection('medication_plans').where({ owner_openid: elder.openid }).remove();
  await db.collection('medication_logs').where({ owner_openid: elder.openid }).remove();

  const planIds = [];
  for (const p of elder.plans) {
    const r = await db.collection('medication_plans').add({
      data: {
        owner_openid: elder.openid,
        creator_openid: openid,
        drug_name: p.drug_name,
        drug_category: p.drug_category,
        take_time: p.take_time,
        timing: p.timing,
        frequency: '每天',
        start_date: beijingDate(-6),
        create_time: db.serverDate(),
      },
    });
    planIds.push({ id: r._id, ...p });
  }

  // 近 7 天记录：missDays 当天漏服最后一种药
  for (let off = 0; off < 7; off++) {
    const date = beijingDate(-off);
    const missDrug = elder.missDays.indexOf(off) >= 0 ? planIds[planIds.length - 1] : null;
    for (const p of planIds) {
      const isMiss = missDrug && missDrug.id === p.id;
      const status = isMiss ? '漏服' : '已服';
      const logData = {
        plan_id: p.id,
        drug_name: p.drug_name,
        owner_openid: elder.openid,
        creator_openid: openid,
        openid,
        date,
        time: p.take_time,
        status,
        create_time: db.serverDate(),
      };
      if (!isMiss) logData.confirm_time = db.serverDate();
      await db.collection('medication_logs').add({ data: logData });
    }
  }
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;

  if (event.action === 'elder') {
    return generateElderDemo(openid);
  }

  // 1. 当前账号 → 子女 + 开通会员（方便直接测周报/打电话）
  const memberFields = {
    role: 'child',
    subscription_status: 'paid',
    subscription_expire: Date.now() + 30 * 86400000,
  };
  const me = await db.collection('users').where({ openid }).get();
  if (me.data.length > 0) {
    await db.collection('users').doc(me.data[0]._id).update({ data: memberFields });
  } else {
    await db.collection('users').add({
      data: { openid, nickname: '子女', phone: '', create_time: db.serverDate(), ...memberFields },
    });
  }

  // 2. 清掉当前账号相关的旧绑定
  await db.collection('bindings').where({ inviter_openid: openid }).remove();
  await db.collection('bindings').where({ invitee_openid: openid }).remove();

  // 3. 循环生成两个虚拟老人 + 绑定
  for (const elder of DEMO_ELDERS) {
    await db.collection('bindings').where({ inviter_openid: elder.openid }).remove();
    await db.collection('bindings').where({ invitee_openid: elder.openid }).remove();
    await db.collection('users').where({ openid: elder.openid }).remove();
    await seedFamilyElder(openid, elder);
  }

  return {
    success: true,
    message: '已生成子女演示数据：当前账号→子女，关联 2 位老人「张大爷」「李奶奶」，各自有药品 + 近 7 天服药记录',
    demo_elders: DEMO_ELDERS.map((e) => e.openid),
  };
};
