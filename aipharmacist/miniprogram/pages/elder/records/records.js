const TEMPLATE_IDS = [
  'e1r7JQxOZ5RLQz-giCEyKVGnTlEgERv1ILKQBp4MGM4', // 日程提醒(571)
  '5plmd8WphwvOhKWaDD4tS-WWbvcXS-7L5bHcVR4chfg', // 健康记录提醒
  '8wPrzQSttxYDe_Lapv-TdLPT-tGqyxhetVUnfXqRC0Q', // 待办事项提醒
]; // 子女端漏服通知模板（与 sendReminder 一致，点一次授权 3 个）

Page({
  data: {
    role: 'elder',
    isChild: false,
    memberList: [],
    owner_openid: '',
    ownerName: '',
    overview: { total: 0, taken: 0, pending: 0, missed: 0 },
    trend: [],
    // 日历
    year: 0,
    month: 0,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    cells: [],
    selectedDate: '',
    selectedLabel: '',
    dayLogs: [],
    hasRecord: true,
    // 周报
    summary: '',
    summaryLocked: false,
    quota: 0,
  },

  logsByDate: {},

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const role = getApp().globalData.role || 'elder';
    this.setData({ role, isChild: role === 'child' });
    this.loadMembers();
    if (role === 'child') this.loadQuota();
  },

  // 老人只看自己；子女看「自己 + 家人」，默认第一个家人
  loadMembers() {
    wx.cloud.callFunction({ name: 'bindFamily', data: { action: 'list' } }).then((res) => {
      const r = res.result || {};
      const self = { openid: r.self.openid, nickname: r.self.nickname || '自己', isSelf: true };
      const family = (r.family || []).map((f) => ({ openid: f.openid, nickname: f.nickname || '家人', isSelf: false }));

      let memberList;
      let owner;
      if (this.data.isChild) {
        memberList = [self, ...family];
        owner = getApp().globalData.currentFamilyOpenid;
        if (!owner || !family.find((f) => f.openid === owner)) {
          owner = family.length ? family[0].openid : self.openid;
        }
      } else {
        memberList = [self];
        owner = self.openid;
      }
      const cur = memberList.find((m) => m.openid === owner) || self;
      this.setData({ memberList, owner_openid: owner, ownerName: cur.nickname || '家人' });
      this.loadOverview();
      this.loadLogs();
    });
  },

  changeMember(e) {
    const openid = e.currentTarget.dataset.openid;
    getApp().globalData.currentFamilyOpenid = openid;
    const cur = this.data.memberList.find((m) => m.openid === openid) || {};
    this.setData({ owner_openid: openid, ownerName: cur.nickname || '家人', dayLogs: [], summary: '', summaryLocked: false });
    this.loadOverview();
    this.loadLogs();
  },

  loadOverview() {
    const { owner_openid } = this.data;
    const data = owner_openid ? { owner_openid } : {};
    wx.cloud.callFunction({ name: 'getOverview', data }).then((res) => {
      if (res.result && res.result.success) {
        this.setData({
          overview: res.result.today || {},
          trend: res.result.trend || [],
        }, () => {
          setTimeout(() => this.drawTrendChart(), 100);
        });
      }
    });
  },

  pad(n) { return n < 10 ? '0' + n : '' + n; },

  dateStr(y, m, d) { return `${y}-${this.pad(m + 1)}-${this.pad(d)}`; },

  loadLogs() {
    const { owner_openid } = this.data;
    const data = owner_openid ? { owner_openid } : {};
    wx.cloud.callFunction({ name: 'getLogs', data }).then((res) => {
      const logs = (res.result && res.result.logs) || [];
      const map = {};
      logs.forEach((l) => {
        if (!l.date) return;
        if (!map[l.date]) map[l.date] = [];
        map[l.date].push(l);
      });
      this.logsByDate = map;
      const now = new Date();
      this.buildCalendar(now.getFullYear(), now.getMonth());
      this.selectDate(this.dateStr(now.getFullYear(), now.getMonth(), now.getDate()));
    });
  },

  buildCalendar(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = this.dateStr(today.getFullYear(), today.getMonth(), today.getDate());

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ key: `blank-${i}`, day: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = this.dateStr(year, month, d);
      const dayLogs = this.logsByDate[ds] || [];
      cells.push({
        key: ds,
        day: d,
        date: ds,
        hasLog: dayLogs.length > 0,
        isMiss: dayLogs.some((l) => l.status === '漏服'),
        isToday: ds === todayStr,
      });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `blank-end-${cells.length}`, day: 0 });

    this.setData({ cells, year, month });
  },

  selectDate(date) {
    const logs = this.logsByDate[date] || [];
    logs.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const parts = date.split('-');
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const cells = this.data.cells.map((c) => ({ ...c, isSelected: c.date === date }));
    this.setData({
      selectedDate: date,
      selectedLabel: `${m}月${d}日`,
      dayLogs: logs,
      hasRecord: logs.length > 0,
      cells,
    });
  },

  tapDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.selectDate(date);
  },

  prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    this.buildCalendar(year, month);
    this.selectDate(this.dateStr(year, month, 1));
  },

  nextMonth() {
    let { year, month } = this.data;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    this.buildCalendar(year, month);
    this.selectDate(this.dateStr(year, month, 1));
  },

  drawTrendChart() {
    const trend = this.data.trend;
    if (!trend || !trend.length) return;
    const query = wx.createSelectorQuery().in(this);
    query.select('#trend-chart').fields({ node: true, size: true }).exec((res) => {
      if (!res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || wx.getSystemInfoSync().pixelRatio || 2;
      const width = res[0].width;
      const height = res[0].height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const padL = 6, padR = 6, padT = 12, padB = 18;
      const w = width - padL - padR;
      const h = height - padT - padB;
      const n = trend.length;

      ctx.strokeStyle = '#eeeeee';
      ctx.lineWidth = 1;
      [0, 0.5, 1].forEach((ratio) => {
        const y = padT + h * (1 - ratio);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(width - padR, y);
        ctx.stroke();
      });

      const xStep = n > 1 ? w / (n - 1) : 0;
      const points = trend.map((t, i) => ({
        x: padL + xStep * i,
        y: padT + h * (1 - Math.min(100, Math.max(0, t.rate)) / 100),
      }));

      ctx.strokeStyle = '#2BB3A3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      const grad = ctx.createLinearGradient(0, padT, 0, height - padB);
      grad.addColorStop(0, 'rgba(43, 179, 163, 0.18)');
      grad.addColorStop(1, 'rgba(43, 179, 163, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.lineTo(points[n - 1].x, height - padB);
      ctx.lineTo(points[0].x, height - padB);
      ctx.closePath();
      ctx.fill();

      points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#2BB3A3';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      ctx.fillStyle = '#999999';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      [0, Math.floor((n - 1) / 2), n - 1].forEach((i) => {
        ctx.fillText(trend[i].date, points[i].x, height - 4);
      });
    });
  },

  genWeekly() {
    const { owner_openid } = this.data;
    wx.showLoading({ title: '生成中' });
    wx.cloud.callFunction({ name: 'getWeeklySummary', data: { family_openid: owner_openid } }).then((res) => {
      wx.hideLoading();
      const r = res.result || {};
      if (r.locked) {
        this.setData({ summaryLocked: true, summary: '' });
      } else if (r.success) {
        this.setData({ summaryLocked: false, summary: r.summary || '' });
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '生成失败', icon: 'none' });
    });
  },

  goMonthly() {
    const { owner_openid, ownerName } = this.data;
    wx.navigateTo({
      url: '/pages/child/monthly/monthly?openid=' + owner_openid + '&name=' + encodeURIComponent(ownerName || ''),
    });
  },

  loadQuota() {
    wx.cloud.callFunction({ name: 'remindQuota', data: { action: 'get' } }).then((res) => {
      const r = res.result || {};
      if (r.success) this.setData({ quota: r.quota || 0 });
    });
  },

  onAddQuota() {
    if (this.data.quota >= 99) {
      wx.showToast({ title: '已达上限 99 次', icon: 'none' });
      return;
    }
    if (!TEMPLATE_IDS.length) {
      wx.showToast({ title: '模板未配置', icon: 'none' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: TEMPLATE_IDS,
      success: (res) => {
        const accepted = TEMPLATE_IDS.filter((id) => res[id] === 'accept').length;
        const failed = [];
        TEMPLATE_IDS.forEach((id, i) => {
          const st = res[id];
          if (st !== 'accept') failed.push(`第${i + 1}个（${st === 'ban' ? '被禁用' : '未授权'}）`);
        });
        if (accepted > 0) {
          wx.cloud.callFunction({ name: 'remindQuota', data: { action: 'add', count: accepted } }).then((r2) => {
            const q = (r2.result && r2.result.quota) || (this.data.quota + accepted);
            this.setData({ quota: Math.min(99, q) });
            const content = failed.length
              ? `成功授权 ${accepted} 个\n失败：${failed.join('、')}`
              : `成功授权 ${accepted} 个，全部通过`;
            wx.showModal({ title: '授权结果', content, showCancel: false });
          });
        } else {
          wx.showModal({ title: '授权结果', content: '未授权任何模板，次数未增加', showCancel: false });
        }
      },
      fail: () => {
        wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      },
    });
  },
});
