const api = require("../../utils/api")
const { sanitizeTrainingWording } = require("../../utils/format")
const { showShareMenu } = require("../../utils/share")
const { isRedeemAccess } = require("../../utils/access")

Page({
  data: {
    user: null,
    avatarText: "易",
    isLoggedIn: false,
    loginLoading: false,
    phone: "",
    memberNo: "",
    level: "normal",
    levelLabel: "基础权限",
    profileSubLabel: "培训权限",
    profileSubValue: "",
    wechatBindingText: "未绑定",
    phoneHint: "微信绑定号码",
    redeemCode: "",
    redeeming: false,
    courses: [],
    coursesLoading: false
  },

  onShow() {
    showShareMenu()
    const appUser = getApp().globalData.user
    if (appUser) {
      this.applyUser(appUser)
      if (appUser.phone) {
        this.loadMyCourses()
      } else {
        this.setData({ courses: [], coursesLoading: false })
      }
      return
    }

    api.login()
      .then((data) => {
        const user = data.user
        getApp().globalData.user = user
        this.applyUser(user)
        if (user.phone) {
          this.loadMyCourses()
        } else {
          this.setData({ courses: [], coursesLoading: false })
        }
      })
      .catch(() => {
        this.setData({
          user: null,
          isLoggedIn: false,
          courses: []
        })
      })
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

  applyUser(user = {}) {
    const level = user.level || "normal"
    const levelLabel = this.formatLevel(level)
    const phone = user.phone || ""
    const memberNo = user.memberNo || this.buildMemberNo(user.openid)
    this.setData({
      user,
      phone,
      memberNo,
      level,
      levelLabel,
      isLoggedIn: Boolean(phone),
      profileSubLabel: "培训权限",
      profileSubValue: levelLabel,
      wechatBindingText: phone ? "已绑定" : "待绑定",
      phoneHint: phone ? "微信绑定号码" : "手机号待绑定"
    })
  },

  buildMemberNo(openid = "") {
    const tail = String(openid).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()
    return `YQX${tail || "00000000"}`
  },

  loadMyCourses() {
    this.setData({ coursesLoading: true })

    api.listMyCourses()
      .then((data) => {
        this.setData({
          courses: (data.list || [])
            .filter((course) => isRedeemAccess(course.accessSource))
            .map((course) => ({
              ...course,
              title: sanitizeTrainingWording(course.title),
              subtitle: sanitizeTrainingWording(course.subtitle),
              description: sanitizeTrainingWording(course.description)
            })),
          coursesLoading: false
        })
      })
      .catch(() => {
        this.setData({
          courses: [],
          coursesLoading: false
        })
      })
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

    this.setData({ loginLoading: true })

    api.bindPhone(detail.code)
      .then((data) => {
        const user = data.user
        getApp().globalData.user = user
        this.applyUser(user)
        this.setData({ loginLoading: false })
        wx.showToast({
          title: "登录成功",
          icon: "success"
        })
        this.loadMyCourses()
      })
      .catch((err) => {
        api.login()
          .then((data) => {
            const user = data.user
            getApp().globalData.user = user
            this.applyUser(user)
            this.loadMyCourses()
          })
          .finally(() => {
            this.setData({ loginLoading: false })
            wx.showToast({
              title: err.message || "手机号授权失败，已先登录",
              icon: "none"
            })
          })
      })
  },

  onRedeemInput(event) {
    this.setData({ redeemCode: event.detail.value })
  },

  redeemCode() {
    if (!this.data.phone) {
      wx.showToast({
        title: "请先授权手机号",
        icon: "none"
      })
      return
    }

    const code = String(this.data.redeemCode || "").trim().toUpperCase().replace(/[\s-]/g, "")
    if (!code) {
      wx.showToast({
        title: "请输入培训授权码",
        icon: "none"
      })
      return
    }

    this.setData({ redeeming: true })

    api.redeemCode(code)
      .then((data) => {
        const user = data.user || {}
        getApp().globalData.user = user
        this.applyUser(user)
        this.setData({
          redeemCode: "",
          redeeming: false
        })
        wx.showToast({
          title: "授权成功",
          icon: "success"
        })
        this.loadMyCourses()
      })
      .catch((err) => {
        this.setData({ redeeming: false })
        wx.showToast({
          title: err.message || "授权失败",
          icon: "none"
        })
      })
  },

  goCourse(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/course/detail?id=${id}`
    })
  },

  goAbout() {
    wx.navigateTo({
      url: "/pages/about/about"
    })
  },

  formatLevel(level = "normal") {
    const map = {
      normal: "基础权限",
      vip1: "一级权限",
      vip2: "二级权限",
      vip3: "三级权限"
    }
    return map[level] || "基础权限"
  }
})
