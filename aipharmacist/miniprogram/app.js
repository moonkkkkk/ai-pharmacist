// app.js
App({
  globalData: {
    env: "cloud1-d5gafsac26dea3484",
    role: '',
    openid: '',
    nickname: '',
    currentFamilyOpenid: '',
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
  },
});
