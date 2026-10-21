const api = require("../../utils/api")
const { formatDuration, sanitizeTrainingWording } = require("../../utils/format")
const { showShareMenu } = require("../../utils/share")

Page({
  data: {
    courseId: "",
    loading: true,
    error: "",
    course: null,
    chapters: [],
    hasAccess: false,
    accessSource: "",
    isPublicAccess: false,
    user: null,
    hasBoundPhone: false,
    phoneLoginLoading: false
  },

  onLoad(options) {
    showShareMenu()
    this.setData({ courseId: options.id || "" })
    this.loadDetail()
  },

  onShareAppMessage() {
    return {
      title: this.data.course?.title || "易启学内部培训",
      path: `/pages/course/detail?id=${this.data.courseId}`
    }
  },

  onShareTimeline() {
    return {
      title: this.data.course?.title || "易启学内部培训",
      query: `id=${this.data.courseId}`
    }
  },

  loadDetail() {
    if (!this.data.courseId) {
      this.setData({
        loading: false,
        error: "缺少课程 ID"
      })
      return
    }

    Promise.all([
      api.getCourseDetail(this.data.courseId),
      api.login().catch(() => ({ user: null }))
    ])
      .then(([data, loginData]) => {
        const user = loginData.user || {}
        getApp().globalData.user = user
        const isPublicAccess = data.accessSource === "public"
        const hasAccess = !!data.hasAccess &&
          (data.accessSource === "redeem_code" || isPublicAccess)
        const chapters = (data.chapters || []).map((chapter) => ({
          ...chapter,
          title: sanitizeTrainingWording(chapter.title),
          summary: sanitizeTrainingWording(chapter.summary),
          durationText: chapter.duration ? formatDuration(chapter.duration) : "待更新",
          actionText: hasAccess ? "学习" : "兑换后观看"
        }))
        const course = {
          ...data.course,
          title: sanitizeTrainingWording(data.course && data.course.title),
          subtitle: sanitizeTrainingWording(data.course && data.course.subtitle),
          description: sanitizeTrainingWording(data.course && data.course.description)
        }

        this.setData({
          loading: false,
          error: "",
          course,
          chapters,
          hasAccess,
          accessSource: data.accessSource || "",
          isPublicAccess,
          user,
          hasBoundPhone: Boolean(user.phone)
        })
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: err.message || "详情加载失败"
        })
      })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }

    wx.switchTab({
      url: "/pages/index/index"
    })
  },

  goStudy() {
    if (!this.requireCourseAccess()) return
    if (!this.requirePhoneBound()) return

    const firstChapter = this.data.chapters[0]
    if (!firstChapter) {
      wx.showToast({
        title: "暂无可学习章节",
        icon: "none"
      })
      return
    }

    wx.navigateTo({
      url: `/pages/study/study?chapterId=${firstChapter._id}`
    })
  },

  goStudyChapter(event) {
    const chapterId = event.currentTarget.dataset.id

    if (!this.requireCourseAccess()) return
    if (!this.requirePhoneBound()) return

    wx.navigateTo({
      url: `/pages/study/study?chapterId=${chapterId}`
    })
  },

  onCoverError() {
    this.setData({
      "course.coverLoadError": true
    })
  },

  requireCourseAccess() {
    if (this.data.hasAccess) return true

    wx.showModal({
      title: "课程尚未开通",
      content: "请先前往“我的”页面输入培训授权码，兑换成功后即可观看课程。",
      confirmText: "前往兑换",
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({
            url: "/pages/mine/mine"
          })
        }
      }
    })
    return false
  },

  requirePhoneBound() {
    if (this.data.isPublicAccess) return true
    if (this.data.hasBoundPhone) return true

    wx.showToast({
      title: "请先授权手机号后继续",
      icon: "none"
    })
    return false
  },

  loginWithPhone(event) {
    const detail = event.detail || {}

    if (!detail.errMsg || detail.errMsg.indexOf("ok") === -1) {
      wx.showToast({
        title: "未完成手机号授权",
        icon: "none"
      })
      return
    }

    if (!detail.code) {
      wx.showToast({
        title: "当前版本无法获取手机号授权码",
        icon: "none"
      })
      return
    }

    this.setData({ phoneLoginLoading: true })

    api.bindPhone(detail.code)
      .then((data) => {
        const user = data.user || {}
        getApp().globalData.user = user
        this.setData({
          user,
          hasBoundPhone: Boolean(user.phone),
          phoneLoginLoading: false
        })
        wx.showToast({
          title: "登录成功",
          icon: "success"
        })
        this.loadDetail()
      })
      .catch((err) => {
        this.setData({ phoneLoginLoading: false })
        wx.showToast({
          title: err.message || "手机号授权失败",
          icon: "none"
        })
      })
  }
})
