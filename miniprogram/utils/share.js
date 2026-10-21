function showShareMenu() {
  if (!wx.showShareMenu) return

  wx.showShareMenu({
    menus: ["shareAppMessage", "shareTimeline"]
  })
}

module.exports = {
  showShareMenu
}
