Page({
  data: {
    drug_name: '',
    drug_category: '降压药',
    categories: ['降压药', '降糖药', '降脂药', '抗凝药', '其他'],
    take_time: '08:00',
    timing: '饭后',
    timings: ['饭前', '饭后', '随餐'],
    frequency: '每天',
    owners: [{ openid: '', name: '我自己' }],
    ownerNames: ['我自己'],
    ownerIndex: 0,
  },

  onLoad() {
    this.loadOwners();
  },

  loadOwners() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      if (!res.result || !res.result.success) return;
      const r = res.result;
      const owners = [{ openid: r.self.openid, name: '我自己' }];
      (r.family || []).forEach((f) => {
        owners.push({ openid: f.openid, name: f.nickname || '家人' });
      });
      let ownerIndex = 0;
      const target = getApp().globalData.currentFamilyOpenid;
      if (target) {
        const idx = owners.findIndex((o) => o.openid === target);
        if (idx >= 0) ownerIndex = idx;
      }
      this.setData({ owners, ownerNames: owners.map((o) => o.name), ownerIndex });
    });
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

  onFrequencyChange(e) {
    this.setData({ frequency: e.detail.value });
  },

  onOwnerChange(e) {
    this.setData({ ownerIndex: Number(e.detail.value) });
  },

  save() {
    const { drug_name, drug_category, take_time, timing, frequency, owners, ownerIndex } = this.data;
    if (!drug_name.trim()) {
      wx.showToast({ title: '请输入药品名', icon: 'none' });
      return;
    }
    const owner = owners[ownerIndex] || { openid: '' };
    wx.cloud.callFunction({
      name: 'addPlan',
      data: {
        owner_openid: owner.openid || '',
        drug_name,
        drug_category,
        take_time,
        timing,
        frequency,
      },
    }).then((res) => {
      if (res.result.success) {
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
      } else {
        wx.showToast({ title: res.result.errMsg || '保存失败', icon: 'none' });
      }
    });
  },
});
