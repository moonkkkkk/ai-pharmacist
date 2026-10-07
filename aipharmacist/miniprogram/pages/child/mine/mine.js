Page({
  data: {
    nickname: '',
    phone: '',
    roleText: '子女',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadProfile();
  },

  loadProfile() {
    wx.cloud.callFunction({ name: 'login', data: {} }).then((res) => {
      const r = res.result || {};
      this.setData({
        nickname: r.nickname || '未设置',
        phone: r.phone || '未绑定',
        roleText: r.role === 'elder' ? '老人' : '子女',
      });
    });
  },

  goBind() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新选择身份',
      confirmColor: '#fa5151',
      success: (res) => {
        if (!res.confirm) return;
        wx.cloud.callFunction({ name: 'logout', data: {} }).then(() => {
          getApp().globalData.role = '';
          wx.reLaunch({ url: '/pages/index/index' });
        });
      },
    });
  },
});
