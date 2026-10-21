const { showShareMenu } = require("../../utils/share")

Page({
  onLoad() {
    showShareMenu()
  },

  onShareAppMessage() {
    return {
      title: "易启学培训说明",
      path: "/pages/about/about"
    }
  },

  onShareTimeline() {
    return {
      title: "易启学培训说明"
    }
  }
})
