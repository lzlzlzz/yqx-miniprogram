const defaultCourses = [
  {
    id: "course_paid_001",
    title: "AI 短视频实战训练营"
  }
]

const levelOptions = [
  { value: "normal", label: "基础权限" },
  { value: "vip1", label: "一级权限" },
  { value: "vip2", label: "二级权限" },
  { value: "vip3", label: "三级权限" }
]

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]/g, "")
}

function unwrap(result) {
  if (!result) {
    throw new Error("云函数无返回")
  }

  if (result.ok) {
    return result.data
  }

  throw new Error(result.error && result.error.message ? result.error.message : "云函数调用失败")
}

Page({
  data: {
    adminToken: "",
    courses: defaultCourses,
    courseIndex: 0,
    levels: levelOptions,
    levelIndex: 1,
    maxUses: 1,
    customCode: "",
    note: "内部培训授权",
    loadingCourses: false,
    saving: false,
    latestCode: ""
  },

  onLoad() {
    const savedToken = wx.getStorageSync("yqx_admin_token") || ""
    this.setData({ adminToken: savedToken })
    if (savedToken) {
      this.loadCourses()
    }
  },

  onTokenInput(event) {
    this.setData({ adminToken: event.detail.value })
  },

  onCustomCodeInput(event) {
    this.setData({ customCode: normalizeCode(event.detail.value) })
  },

  onMaxUsesInput(event) {
    this.setData({ maxUses: Math.max(1, Number(event.detail.value || 1)) })
  },

  onNoteInput(event) {
    this.setData({ note: event.detail.value })
  },

  onCourseChange(event) {
    this.setData({
      courseIndex: Number(event.detail.value)
    })
  },

  onLevelChange(event) {
    this.setData({ levelIndex: Number(event.detail.value) })
  },

  callAdmin(action, data = {}) {
    const adminToken = String(this.data.adminToken || "").trim()
    if (!adminToken) {
      return Promise.reject(new Error("请先填写后台 Token"))
    }

    wx.setStorageSync("yqx_admin_token", adminToken)

    return wx.cloud.callFunction({
      name: "admin",
      data: {
        action,
        adminToken,
        ...data
      }
    }).then((res) => unwrap(res.result))
  },

  loadCourses() {
    this.setData({ loadingCourses: true })

    this.callAdmin("listCourses", { limit: 100 })
      .then((data) => {
        const courses = (data.list || [])
          .map((course) => ({
            id: course._id,
            title: course.title
          }))

        if (courses.length > 0) {
          this.setData({
            courses,
            courseIndex: 0
          })
        }

        wx.showToast({
          title: "课程已刷新",
          icon: "success"
        })
      })
      .catch((err) => {
        wx.showToast({
          title: err.message || "课程刷新失败",
          icon: "none"
        })
      })
      .finally(() => {
        this.setData({ loadingCourses: false })
      })
  },

  createRedeemCode() {
    const course = this.data.courses[this.data.courseIndex]
    const level = this.data.levels[this.data.levelIndex]

    if (!course || !course.id) {
      wx.showToast({
        title: "请先选择课程",
        icon: "none"
      })
      return
    }

    this.setData({ saving: true })

    this.callAdmin("createRedeemCode", {
      code: normalizeCode(this.data.customCode),
      courseIds: [course.id],
      level: level.value,
      maxUses: Math.max(1, Number(this.data.maxUses || 1)),
      paidAmount: 0,
      note: this.data.note
    })
      .then((data) => {
        const code = data.code
        this.setData({
          latestCode: code,
          customCode: ""
        })

        wx.setClipboardData({
          data: code,
          success: () => {
            wx.showModal({
              title: "授权码已生成",
              content: `${code}\n\n已自动复制。`,
              showCancel: false
            })
          }
        })
      })
      .catch((err) => {
        wx.showToast({
          title: err.message || "生成失败",
          icon: "none"
        })
      })
      .finally(() => {
        this.setData({ saving: false })
      })
  },

  copyLatestCode() {
    if (!this.data.latestCode) return

    wx.setClipboardData({
      data: this.data.latestCode,
      success: () => {
        wx.showToast({
          title: "已复制",
          icon: "success"
        })
      }
    })
  }
})
