Page({
  data: {
    url: ""
  },

  onLoad(options) {
    const url = decodeURIComponent(options.url || "")
    if (!/^https:\/\//.test(url)) {
      wx.showToast({
        title: "链接格式不支持",
        icon: "none"
      })
      return
    }

    this.setData({ url })
  }
})
