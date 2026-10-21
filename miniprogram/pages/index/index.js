const api = require("../../utils/api")
const { sanitizeTrainingWording } = require("../../utils/format")
const { showShareMenu } = require("../../utils/share")

Page({
  data: {
    loading: true,
    error: "",
    courses: []
  },

  onLoad() {
    showShareMenu()
    this.bootstrap()
  },

  onShareAppMessage() {
    return {
      title: "易启学内部培训",
      path: "/pages/index/index"
    }
  },

  onShareTimeline() {
    return {
      title: "易启学内部培训"
    }
  },

  onPullDownRefresh() {
    this.loadCourses().finally(() => wx.stopPullDownRefresh())
  },

  bootstrap() {
    this.setData({ loading: true, error: "" })

    api.login()
      .then((data) => {
        getApp().globalData.user = data.user
      })
      .catch((err) => {
        console.warn("用户登录失败，继续加载公开课程", err)
      })

    return this.loadCourses()
  },

  loadCourses() {
    return api.listCourses()
      .then((data) => {
        this.setData({
          loading: false,
          error: "",
          courses: (data.list || []).map((course) => ({
            ...course,
            title: sanitizeTrainingWording(course.title),
            subtitle: sanitizeTrainingWording(course.subtitle),
            description: sanitizeTrainingWording(course.description)
          }))
        })
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: err.message || "课程加载失败"
        })
      })
  },

  goDetail(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/course/detail?id=${id}`
    })
  },

  onCoverError(event) {
    const index = event.currentTarget.dataset.index
    if (typeof index === "undefined") return

    this.setData({
      [`courses[${index}].coverLoadError`]: true
    })
  }
})
