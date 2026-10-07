Page({
  data: {
    role: 'elder',
    nickname: '',
    avatar: '',
    phone: '',
    family: [],
    roleLabel: '子女',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.setData({ role: getApp().globalData.role || 'elder' });
    this.loadProfile();
  },

  loadProfile() {
    wx.cloud.callFunction({ name: 'login', data: {} }).then((res) => {
      const r = res.result || {};
      this.setData({
        nickname: r.nickname || '',
        avatar: r.avatar || '',
        phone: r.phone || '未绑定',
      });
    });

    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      if (!res.result || !res.result.success) return;
      const r = res.result;
      this.setData({
        family: r.family || [],
        roleLabel: (r.self.role || 'elder') === 'elder' ? '子女' : '老人',
      });
    });
  },

  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl;
    if (!tempPath) return;
    wx.showLoading({ title: '上传中' });
    wx.cloud.uploadFile({
      cloudPath: `avatars/${Date.now()}-${Math.floor(Math.random() * 10000)}.png`,
      filePath: tempPath,
    }).then((up) => {
      const fileID = up.fileID;
      return wx.cloud.callFunction({ name: 'updateProfile', data: { avatar: fileID } }).then(() => {
        this.setData({ avatar: fileID });
        wx.hideLoading();
      });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '头像上传失败', icon: 'none' });
    });
  },

  onInputNickname(e) {
    this.setData({ nickname: e.detail.value });
  },

  saveNickname() {
    const nickname = this.data.nickname.trim();
    if (!nickname) return;
    wx.cloud.callFunction({ name: 'updateProfile', data: { nickname } }).then(() => {
      wx.showToast({ title: '已保存', icon: 'success' });
    });
  },

  goBind() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },

  bindPhone() {
    wx.showModal({
      title: '绑定手机号',
      editable: true,
      placeholderText: '请输入手机号',
      success: (res) => {
        if (!res.confirm) return;
        const phone = (res.content || '').trim();
        if (!/^1\d{10}$/.test(phone)) {
          wx.showToast({ title: '手机号格式不对', icon: 'none' });
          return;
        }
        wx.cloud.callFunction({ name: 'updateProfile', data: { phone } }).then(() => {
          this.setData({ phone });
          wx.showToast({ title: '已绑定', icon: 'success' });
        }).catch(() => {
          wx.showToast({ title: '绑定失败', icon: 'none' });
        });
      },
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新选择身份',
      confirmColor: '#E64340',
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
