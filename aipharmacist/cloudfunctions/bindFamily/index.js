const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getNickname(openid) {
  try {
    const r = await db.collection('users').where({ openid }).get();
    return (r.data[0] && r.data[0].nickname) || '';
  } catch (e) { return ''; }
}

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const { action, code } = event;

  // 生成邀请码
  if (action === 'create') {
    const c = genCode();
    const nickname = await getNickname(openid);
    await db.collection('bindings').add({
      data: {
        code: c,
        inviter_openid: openid,
        inviter_nickname: nickname,
        invitee_openid: '',
        invitee_nickname: '',
        status: 'pending',
        expire_time: new Date(Date.now() + 24 * 60 * 60 * 1000),
        create_time: db.serverDate(),
      },
    });
    return { success: true, code: c };
  }

  // 接受邀请码
  if (action === 'accept') {
    if (!code) return { success: false, errMsg: '请输入邀请码' };

    const res = await db.collection('bindings')
      .where({ code: String(code), status: 'pending' })
      .get();
    if (res.data.length === 0) return { success: false, errMsg: '邀请码无效或已过期' };
    const binding = res.data[0];

    // 防自绑
    if (binding.inviter_openid === openid) {
      return { success: false, errMsg: '不能绑定自己' };
    }
    // 过期校验
    if (binding.expire_time && Date.now() > new Date(binding.expire_time).getTime()) {
      return { success: false, errMsg: '邀请码已过期，请重新生成' };
    }
    // 防重复绑定
    const dup = await db.collection('bindings').where(_.or([
      { inviter_openid: binding.inviter_openid, invitee_openid: openid, status: 'active' },
      { inviter_openid: openid, invitee_openid: binding.inviter_openid, status: 'active' },
    ])).get();
    if (dup.data.length > 0) return { success: false, errMsg: '已经绑定过了' };

    const nickname = await getNickname(openid);
    await db.collection('bindings').doc(binding._id).update({
      data: {
        invitee_openid: openid,
        invitee_nickname: nickname || '家人',
        status: 'active',
      },
    });
    return { success: true };
  }

  // 拉取「我自己 + 已关联家人」列表
  if (action === 'list') {
    let self = { openid, nickname: '', role: '' };
    try {
      const u = await db.collection('users').where({ openid }).get();
      if (u.data.length) {
        self.nickname = u.data[0].nickname || '';
        self.role = u.data[0].role || '';
      }
    } catch (e) {}

    const asInviter = await db.collection('bindings')
      .where({ inviter_openid: openid, status: 'active' }).get();
    const asInvitee = await db.collection('bindings')
      .where({ invitee_openid: openid, status: 'active' }).get();

    const family = [
      ...asInviter.data.map((b) => ({ openid: b.invitee_openid, nickname: b.invitee_nickname })),
      ...asInvitee.data.map((b) => ({ openid: b.inviter_openid, nickname: b.inviter_nickname })),
    ];

    return { success: true, self, family };
  }

  return { success: false, errMsg: '未知操作' };
};
