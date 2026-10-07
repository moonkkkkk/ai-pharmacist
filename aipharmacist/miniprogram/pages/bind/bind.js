Page({
  data: {
    role: 'elder',
    roleLabel: '家人',
    inviteCode: '',
    inputCode: '',
    family: [],
    linkUrl: '',
  },

  onShow() {
    this.loadFamily();
  },

  loadFamily() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      if (!res.result || !res.result.success) return;
      const r = res.result;
      const role = r.self.role || getApp().globalData.role || 'elder';
      this.setData({
        role,
        family: r.family || [],
        roleLabel: role === 'elder' ? '子女' : '老人',
      });
    });
  },

  generate() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'create' } }).then((res) => {
      const r = res.result || {};
      if (r.success) {
        this.setData({ inviteCode: r.code });
      } else {
        wx.showToast({ title: r.errMsg || '生成失败', icon: 'none' });
      }
    });
  },

  copyCode() {
    if (!this.data.inviteCode) return;
    wx.setClipboardData({ data: this.data.inviteCode });
  },

  // 生成可点击链接：复制后发给家人，点开即可绑定
  generateLink() {
    wx.showLoading({ title: '生成中' });
    wx.cloud.callFunction({ name: 'generateLink', data: {} }).then((res) => {
      wx.hideLoading();
      const r = res.result || {};
      if (r.success) {
        this.setData({ linkUrl: r.url_link });
      } else {
        wx.showToast({ title: r.errMsg || '生成失败', icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    });
  },

  copyLink() {
    if (!this.data.linkUrl) return;
    wx.setClipboardData({ data: this.data.linkUrl });
  },

  // 转发给好友：带上邀请码，对方点开卡片自动绑定
  onShareAppMessage() {
    return wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'create' } })
      .then((res) => {
        const code = (res.result && res.result.code) || '';
        return {
          title: '邀请你一起管理用药提醒',
          path: `/pages/index/index?bind=${code}`,
          imageUrl: '/images/bind-poster.png',
        };
      })
      .catch(() => ({
        title: 'AI 云药师',
        path: '/pages/index/index',
        imageUrl: '/images/bind-poster.png',
      }));
  },

  onInputCode(e) {
    this.setData({ inputCode: e.detail.value });
  },

  accept() {
    const code = this.data.inputCode.trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'accept', code } }).then((res) => {
      const r = res.result || {};
      if (r.success) {
        wx.showToast({ title: '绑定成功', icon: 'success' });
        this.setData({ inputCode: '' });
        this.loadFamily();
      } else {
        wx.showToast({ title: r.errMsg || '绑定失败', icon: 'none' });
      }
    });
  },
});
