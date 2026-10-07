const TEMPLATE_IDS = [
  'e1r7JQxOZ5RLQz-giCEyKVGnTlEgERv1ILKQBp4MGM4', // 日程提醒(571)
  '5plmd8WphwvOhKWaDD4tS-WWbvcXS-7L5bHcVR4chfg', // 健康记录提醒
  '8wPrzQSttxYDe_Lapv-TdLPT-tGqyxhetVUnfXqRC0Q', // 待办事项提醒
]; // 一次性订阅消息模板 ID 列表，与 sendReminder 保持一致

Page({
  data: {
    role: 'elder',
    meds: [],
    today: '',
    subscribed: false,
    // 子女：自己 + 家人切换
    memberList: [],
    owner_openid: '',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const role = getApp().globalData.role || 'elder';
    this.setData({ role });
    if (role === 'child') {
      this.setData({ subscribed: !!wx.getStorageSync('childSubscribed') });
      this.loadMembers();
    } else {
      this.setData({ subscribed: !!wx.getStorageSync('subscribed'), owner_openid: '' });
      this.loadToday();
    }
  },

  todayStr() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  // 子女：拉「自己 + 家人」列表，默认选中第一个家人（无家人则自己）
  loadMembers() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      const r = res.result || {};
      const self = { openid: r.self.openid, nickname: r.self.nickname || '自己', isSelf: true };
      const family = (r.family || []).map((f) => ({ openid: f.openid, nickname: f.nickname || '家人', isSelf: false }));
      const memberList = [self, ...family];
      let owner = getApp().globalData.currentFamilyOpenid;
      if (!owner || !family.find((f) => f.openid === owner)) {
        owner = family.length ? family[0].openid : self.openid;
      }
      this.setData({ memberList, owner_openid: owner });
      this.loadToday();
    });
  },

  loadToday() {
    const { role, owner_openid } = this.data;
    const today = this.todayStr();
    const isChildOwner = role === 'child' && owner_openid;
    const plansData = isChildOwner ? { owner_openid } : {};
    const logsData = isChildOwner ? { date: today, owner_openid } : { date: today };

    wx.cloud.callFunction({ name: 'getPlans', data: plansData }).then((res) => {
      const plans = (res.result && res.result.plans) || [];
      wx.cloud.callFunction({ name: 'getLogs', data: logsData }).then((logRes) => {
        const logs = (logRes.result && logRes.result.logs) || [];
        const takenIds = logs.filter((l) => l.status === '已服').map((l) => l.plan_id);
        const meds = plans.map((p) => ({
          ...p,
          taken: takenIds.indexOf(p._id) >= 0,
        }));
        this.setData({ meds, today });
      });
    });
  },

  changeMember(e) {
    const openid = e.currentTarget.dataset.openid;
    getApp().globalData.currentFamilyOpenid = openid;
    this.setData({ owner_openid: openid, meds: [] });
    this.loadToday();
  },

  takeMedicine(e) {
    const { id, index } = e.currentTarget.dataset;
    const item = this.data.meds[index];

    if (item.taken) {
      this.undoTake(id, index);
      return;
    }

    this.requestSubscribe(); // 打卡时攒一次订阅额度（必须在点击手势内同步触发）

    wx.cloud.callFunction({ name: 'confirmTake', data: { plan_id: id } }).then((res) => {
      if (res.result && res.result.success) {
        this.setData({ [`meds[${index}].taken`]: true });
        wx.showToast({ title: '已记录，真棒！', icon: 'success' });
      } else {
        wx.showToast({ title: '记录失败，请重试', icon: 'none' });
      }
    });
  },

  undoTake(id, index) {
    wx.showModal({
      title: '改回未吃',
      content: '确定把这条改成「还没吃」吗？',
      confirmColor: '#E64340',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({ name: 'updateLog', data: { plan_id: id, action: 'undo' } }).then((res) => {
          if (res.result && res.result.success) {
            this.setData({ [`meds[${index}].taken`]: false });
            wx.showToast({ title: '已改回', icon: 'success' });
          } else {
            wx.showToast({ title: res.result.errMsg || '操作失败', icon: 'none' });
          }
        });
      },
    });
  },

  // 续订闭环：每次点「已吃药」/「开启提醒」都调起一次订阅，为下一次攒额度
  requestSubscribe() {
    if (!TEMPLATE_IDS.length) return;
    wx.requestSubscribeMessage({
      tmplIds: TEMPLATE_IDS,
      success: (res) => {
        if (TEMPLATE_IDS.some((id) => res[id] === 'accept')) {
          this.setData({ subscribed: true });
          wx.setStorageSync(this.data.role === 'child' ? 'childSubscribed' : 'subscribed', true);
        }
      },
      fail: () => {},
    });
  },

  onToggleSub() {
    const isChild = this.data.role === 'child';
    if (this.data.subscribed) {
      wx.showToast({ title: isChild ? '漏服通知已开启' : '每日提醒已开启', icon: 'success' });
      return;
    }
    if (!TEMPLATE_IDS.length) {
      wx.showToast({ title: '模板未配置', icon: 'none' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: TEMPLATE_IDS,
      success: (res) => {
        if (TEMPLATE_IDS.some((id) => res[id] === 'accept')) {
          this.setData({ subscribed: true });
          wx.setStorageSync(isChild ? 'childSubscribed' : 'subscribed', true);
          wx.showToast({ title: '已开启', icon: 'success' });
        }
      },
      fail: () => {
        wx.showToast({ title: '开启失败，请重试', icon: 'none' });
      },
    });
  },
});
