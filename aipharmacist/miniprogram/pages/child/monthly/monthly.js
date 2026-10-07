Page({
  data: {
    nickname: '家人',
    familyOpenid: '',
    stats: { rate: 0, taken: 0, missed: 0, due: 0 },
    summary: '',
    loading: false,
    locked: false,
    generated: false,
  },

  onLoad(options) {
    const openid = options.openid || getApp().globalData.currentFamilyOpenid || '';
    const name = options.name ? decodeURIComponent(options.name) : '我';
    this.setData({ familyOpenid: openid, nickname: name });
    this.generate();
  },

  generate() {
    this.setData({ loading: true, generated: false, summary: '', locked: false });
    wx.cloud.callFunction({
      name: 'getMonthlyReport',
      data: { family_openid: this.data.familyOpenid || '' },
    }).then((res) => {
      this.setData({ loading: false, generated: true });
      const r = res.result || {};
      if (r.locked) {
        this.setData({ locked: true, summary: '' });
      } else if (r.success) {
        this.setData({ summary: r.summary || '', stats: r.stats || this.data.stats });
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    }).catch(() => {
      this.setData({ loading: false, generated: true });
      wx.showToast({ title: '生成失败', icon: 'none' });
    });
  },

});
