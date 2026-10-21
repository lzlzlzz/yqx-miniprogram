const { cloudEnv } = require("./config")

App({
  globalData: {
    user: null
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用支持云开发的微信开发者工具版本")
      return
    }

    wx.cloud.init({
      env: cloudEnv || undefined,
      traceUser: true
    })
  }
})
