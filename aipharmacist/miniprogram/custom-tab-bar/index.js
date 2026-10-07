Component({
  data: {
    selected: 0,
    list: [],
  },
  lifetimes: {
    attached() {
      const role = getApp().globalData.role || 'elder';
      this.setData({
        list: role === 'child'
          ? [
              { pagePath: '/pages/elder/today/today', text: '打卡', icon: 'check' },
              { pagePath: '/pages/elder/meds/meds', text: '药品管理', icon: 'med' },
              { pagePath: '/pages/elder/records/records', text: '记录', icon: 'record' },
              { pagePath: '/pages/elder/mine/mine', text: '我的', icon: 'me' },
            ]
          : [
              { pagePath: '/pages/elder/today/today', text: '吃药打卡', icon: 'check' },
              { pagePath: '/pages/elder/meds/meds', text: '用药方案', icon: 'med' },
              { pagePath: '/pages/elder/records/records', text: '用药记录', icon: 'record' },
              { pagePath: '/pages/elder/mine/mine', text: '我的', icon: 'me' },
            ],
      });
    },
  },
  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset;
      wx.switchTab({ url: path });
      this.setData({ selected: index });
    },
  },
});
