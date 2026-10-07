const TEMPLATE_IDS = [
  'e1r7JQxOZ5RLQz-giCEyKVGnTlEgERv1ILKQBp4MGM4', // 日程提醒(571)
  '5plmd8WphwvOhKWaDD4tS-WWbvcXS-7L5bHcVR4chfg', // 健康记录提醒
  '8wPrzQSttxYDe_Lapv-TdLPT-tGqyxhetVUnfXqRC0Q', // 待办事项提醒
]; // 订阅消息模板 ID 列表，与 sendReminder 一致

Page({
  data: {
    role: 'elder',
    id: '',
    drug_name: '',
    drug_category: '降压药',
    categories: ['降压药', '降糖药', '降脂药', '抗凝药', '其他'],
    take_time: '08:00',
    timing: '饭后',
    timings: ['饭前', '饭后', '随餐'],
    intervalDays: 1,
    family: [],
    ownerNames: [],
    ownerIndex: 0,
    selfOpenid: '',
  },

  onLoad(options) {
    const role = getApp().globalData.role || 'elder';
    this.setData({ role });
    if (options.id) {
      this.setData({ id: options.id });
      wx.setNavigationBarTitle({ title: '编辑药品' });
      this.loadPlan(options.id);
    }
    if (role === 'child') {
      this.loadFamily();
    }
  },

  parseInterval(freq) {
    if (!freq) return 1;
    if (freq === '每天') return 1;
    if (freq === '每周') return 7;
    const m = String(freq).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  },

  loadPlan(id) {
    const owner = this.data.role === 'child' ? getApp().globalData.currentFamilyOpenid : '';
    const data = owner ? { owner_openid: owner } : {};
    wx.cloud.callFunction({ name: 'getPlans', data }).then((res) => {
      const plans = (res.result && res.result.plans) || [];
      const p = plans.find((x) => x._id === id);
      if (p) {
        this.setData({
          drug_name: p.drug_name || '',
          drug_category: p.drug_category || '降压药',
          take_time: p.take_time || '08:00',
          timing: p.timing || '饭后',
          intervalDays: this.parseInterval(p.frequency),
        });
      }
    });
  },

  loadFamily() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      const r = res.result || {};
      const self = r.self || {};
      const family = r.family || [];
      let idx = 0;
      const target = getApp().globalData.currentFamilyOpenid;
      if (target) {
        const i = family.findIndex((f) => f.openid === target);
        if (i >= 0) idx = i + 1;
      }
      this.setData({
        selfOpenid: self.openid || '',
        family,
        ownerNames: ['我（自己）', ...family.map((f) => f.nickname || '家人')],
        ownerIndex: idx,
      });
    });
  },

  onOwnerChange(e) {
    this.setData({ ownerIndex: Number(e.detail.value) });
  },

  onInputName(e) {
    this.setData({ drug_name: e.detail.value });
  },

  onCategoryChange(e) {
    this.setData({ drug_category: this.data.categories[e.detail.value] });
  },

  onTimeChange(e) {
    this.setData({ take_time: e.detail.value });
  },

  onTimingChange(e) {
    this.setData({ timing: this.data.timings[e.detail.value] });
  },

  onInputInterval(e) {
    this.setData({ intervalDays: e.detail.value });
  },

  incInterval() {
    let n = parseInt(this.data.intervalDays, 10);
    if (isNaN(n)) n = 1;
    if (n >= 90) return;
    this.setData({ intervalDays: n + 1 });
  },

  decInterval() {
    let n = parseInt(this.data.intervalDays, 10);
    if (isNaN(n)) n = 1;
    if (n <= 1) return;
    this.setData({ intervalDays: n - 1 });
  },

  requestSubscribe() {
    if (!TEMPLATE_IDS.length) return;
    wx.requestSubscribeMessage({
      tmplIds: TEMPLATE_IDS,
      success: (res) => {
        if (TEMPLATE_IDS.some((id) => res[id] === 'accept')) {
          wx.setStorageSync(getApp().globalData.role === 'child' ? 'childSubscribed' : 'subscribed', true);
        }
      },
      fail: () => {},
    });
  },

  save() {
    if (this.saving) return;
    const { id, drug_name, drug_category, take_time, timing, role, family, ownerIndex } = this.data;
    if (!drug_name.trim()) {
      wx.showToast({ title: '请输入药品名', icon: 'none' });
      return;
    }
    let intervalDays = parseInt(this.data.intervalDays, 10);
    if (isNaN(intervalDays) || intervalDays < 1) intervalDays = 1;
    if (intervalDays > 90) intervalDays = 90;

    const frequency = intervalDays <= 1 ? '每天' : '每' + intervalDays + '日一次';
    const name = id ? 'updatePlan' : 'addPlan';
    const data = { drug_name, drug_category, take_time, timing, frequency };
    if (role === 'child' && !id) {
      if (ownerIndex === 0) {
        data.owner_openid = this.data.selfOpenid;
      } else if (family[ownerIndex - 1]) {
        data.owner_openid = family[ownerIndex - 1].openid;
      }
    }
    if (id) data.plan_id = id;

    this.saving = true;
    this.requestSubscribe(); // 保存后攒一次订阅额度（必须在点击手势内同步触发）
    wx.cloud.callFunction({ name, data }).then((res) => {
      if (res.result.success) {
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1000);
      } else {
        wx.showToast({ title: res.result.errMsg || '保存失败', icon: 'none' });
        this.saving = false;
      }
    }).catch(() => {
      this.saving = false;
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },
});
