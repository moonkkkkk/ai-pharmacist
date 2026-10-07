Page({
  data: {
    role: 'elder',
    meds: [],
    family: [],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const role = getApp().globalData.role || 'elder';
    this.setData({ role });
    if (role === 'child') {
      this.loadFamilyBlocks();
    } else {
      this.loadMeds();
    }
  },

  // 子女：主页展示所有关联成员（有药的），每块最多显示 3 个药，可展开
  loadFamilyBlocks() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      const r = res.result || {};
      const self = r.self || {};
      const family = r.family || [];
      const members = self.openid
        ? [{ openid: self.openid, nickname: self.nickname || '我', isSelf: true }, ...family]
        : family;
      const tasks = members.map((m) =>
        wx.cloud.callFunction({ name: 'getPlans', data: { owner_openid: m.openid } })
          .then((pr) => ({ ...m, meds: (pr.result && pr.result.plans) || [], showAll: false }))
      );
      Promise.all(tasks).then((list) => {
        this.setData({ family: list.filter((m) => m.meds.length > 0) });
      });
    });
  },

  toggleAll(e) {
    const openid = e.currentTarget.dataset.openid;
    const family = this.data.family.map((m) =>
      m.openid === openid ? { ...m, showAll: !m.showAll } : m
    );
    this.setData({ family });
  },

  loadMeds() {
    wx.cloud.callFunction({ name: 'getPlans', data: {} }).then((res) => {
      if (res.result && res.result.success) {
        this.setData({ meds: res.result.plans || [] });
      }
    });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/elder/editPlan/editPlan' });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    const owner = e.currentTarget.dataset.owner;
    if (owner) getApp().globalData.currentFamilyOpenid = owner;
    wx.navigateTo({ url: `/pages/elder/editPlan/editPlan?id=${id}` });
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除药品',
      content: '确定删除这条用药计划吗？',
      confirmColor: '#E64340',
      success: (r) => {
        if (!r.confirm) return;
        wx.cloud.callFunction({ name: 'deletePlan', data: { plan_id: id } }).then((res) => {
          if (res.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' });
            if (this.data.role === 'child') this.loadFamilyBlocks();
            else this.loadMeds();
          } else {
            wx.showToast({ title: res.result.errMsg || '删除失败', icon: 'none' });
          }
        });
      },
    });
  },
});
