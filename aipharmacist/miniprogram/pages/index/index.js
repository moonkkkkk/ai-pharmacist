Page({
  data: {
    needRole: false,
    nickname: '',
    phone: '',
  },

  onLoad(options) {
    // 从小程序码扫进来：scene 形如 "bind=123456"，或直接带 bind 参数
    this.bindCode = '';
    if (options) {
      if (options.scene) {
        const scene = decodeURIComponent(options.scene);
        if (scene.indexOf('bind=') === 0) this.bindCode = scene.slice(5);
      } else if (options.bind) {
        this.bindCode = options.bind;
      }
    }

    wx.cloud.callFunction({ name: 'login', data: {} }).then((res) => {
      const r = res.result;
      if (r.success && !r.isNew) {
        this.afterLogin(r.role, r.openid);
      } else if (r.needRole) {
        this.setData({ needRole: true });
      }
    });
  },

  onInputNickname(e) {
    this.setData({ nickname: e.detail.value });
  },

  onInputPhone(e) {
    this.setData({ phone: e.detail.value });
  },

  chooseRole(e) {
    const role = e.currentTarget.dataset.role;
    const { nickname, phone } = this.data;

    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不对', icon: 'none' });
      return;
    }

    wx.cloud.callFunction({
      name: 'login',
      data: { role, nickname, phone },
    }).then((res) => {
      const r = res.result;
      if (r.success) {
        this.afterLogin(r.role, r.openid);
      } else {
        wx.showToast({ title: r.errMsg || '登录失败', icon: 'none' });
      }
    });
  },

  // 登录成功后：如果是从小程序码扫进来的，先自动绑定，再进入对应端
  afterLogin(role, openid) {
    if (!this.bindCode) {
      this.enterByRole(role, openid);
      return;
    }
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'accept', code: this.bindCode } })
      .then((res) => {
        const r = res.result || {};
        if (r.success) {
          wx.showToast({ title: '绑定成功', icon: 'success' });
        } else if (r.errMsg && r.errMsg !== '已经绑定过了') {
          wx.showToast({ title: r.errMsg, icon: 'none' });
        }
        setTimeout(() => this.enterByRole(role, openid), 900);
      })
      .catch(() => this.enterByRole(role, openid));
  },

  enterByRole(role, openid) {
    getApp().globalData.role = role;
    getApp().globalData.openid = openid;
    const url = '/pages/elder/today/today';
    wx.reLaunch({ url });
  },
});
