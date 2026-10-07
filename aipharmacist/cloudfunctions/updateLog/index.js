const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function pad(n) { return n < 10 ? '0' + n : '' + n; }

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID;
  const { plan_id, log_id, action } = event;

  // 撤销已服药：把今天该计划「已服」翻回「待服」
  if (action === 'undo') {
    if (!plan_id && !log_id) return { success: false, errMsg: '缺少参数' };

    let where;
    if (log_id) {
      where = { _id: log_id, status: '已服' };
    } else {
      const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
      where = { plan_id, date, status: '已服' };
    }

    const res = await db.collection('medication_logs').where(where).get();
    if (res.data.length === 0) return { success: false, errMsg: '没有可修改的记录' };

    await db.collection('medication_logs').doc(res.data[0]._id).update({
      data: { status: '待服', confirm_time: _.remove() },
    });
    return { success: true };
  }

  // 删除一条记录
  if (action === 'delete') {
    if (!log_id) return { success: false, errMsg: '缺少记录ID' };
    await db.collection('medication_logs').doc(log_id).remove();
    return { success: true };
  }

  return { success: false, errMsg: '未知操作' };
};
