Page({
  data: {
    familyList: [],
    familyOpenid: '',
    familyName: '',
    month: '',
    grid: [],
    stats: { rate: 0, missed: 0 },
    missedList: [],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadFamily();
  },

  pad(n) { return n < 10 ? '0' + n : '' + n; },

  loadFamily() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      const r = res.result || {};
      const family = r.family || [];
      let target = getApp().globalData.currentFamilyOpenid;
      if (!target && family.length) target = family[0].openid;
      this.setData({ familyList: family });

      if (!target) {
        this.setData({ familyOpenid: '', familyName: '', grid: [], missedList: [], stats: { rate: 0, missed: 0 } });
        return;
      }

      const cur = family.find((f) => f.openid === target) || { openid: target, nickname: '家人' };
      const now = new Date();
      const month = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}`;
      this.setData({ familyOpenid: target, familyName: cur.nickname || '家人', month });
      this.loadRecords();
    });
  },

  loadRecords() {
    const { familyOpenid, month } = this.data;
    if (!familyOpenid) return;
    wx.cloud.callFunction({
      name: 'getFamilyRecords',
      data: { family_openid: familyOpenid, month },
    }).then((res) => {
      if (res.result && res.result.success) {
        this.setData({
          missedList: (res.result.missedList || []).map((m, i) => ({
            ...m,
            _key: `${m.date}-${m.time}-${m.drug_name}-${i}`,
          })),
          stats: res.result.stats || { rate: 0, missed: 0 },
          days: res.result.days || [],
        });
        this.buildGrid();
      }
    });
  },

  buildGrid() {
    const { month, days } = this.data;
    const [y, m] = month.split('-').map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=周日
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ empty: true, key: 'b' + i });
    days.forEach((d) => cells.push({ day: d.day, state: d.state, key: 'd' + d.day }));
    this.setData({ grid: cells });
  },

  changeFamily(e) {
    const openid = e.currentTarget.dataset.openid;
    getApp().globalData.currentFamilyOpenid = openid;
    const cur = this.data.familyList.find((f) => f.openid === openid) || { nickname: '家人' };
    const now = new Date();
    const month = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}`;
    this.setData({ familyOpenid: openid, familyName: cur.nickname || '家人', month });
    this.loadRecords();
  },

  prevMonth() {
    this.shiftMonth(-1);
  },

  nextMonth() {
    this.shiftMonth(1);
  },

  shiftMonth(delta) {
    const [y, m] = this.data.month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const month = `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}`;
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}`;
    if (month > curMonth) return; // 不显示未来月份
    this.setData({ month });
    this.loadRecords();
  },
});
