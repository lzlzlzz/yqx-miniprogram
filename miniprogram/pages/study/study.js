const api = require("../../utils/api")
const { sanitizeTrainingWording } = require("../../utils/format")
const { showShareMenu } = require("../../utils/share")
const { requireLearningAccess } = require("../../utils/access")

function isCloudFileId(value) {
  return typeof value === "string" && value.indexOf("cloud://") === 0
}

Page({
  data: {
    chapterId: "",
    loading: true,
    error: "",
    chapter: null,
    video: {},
    courseware: [],
    downloadLinks: [],
    materialsOpen: true,
    landscapeMode: false,
    requestingLandscape: false,
    settingsOpen: false,
    brightnessPercent: 60,
    muted: false,
    access: null,
    canDownloadMaterials: false
  },

  onLoad(options) {
    showShareMenu()
    this.setData({ chapterId: options.chapterId || "" })
    this.loadStudyContent()
  },

  onShareAppMessage() {
    return {
      title: this.data.chapter?.title || "易启学内部培训",
      path: `/pages/study/study?chapterId=${this.data.chapterId}`
    }
  },

  onShareTimeline() {
    return {
      title: this.data.chapter?.title || "易启学内部培训",
      query: `chapterId=${this.data.chapterId}`
    }
  },

  onReady() {
    if (!wx.getScreenBrightness) return

    wx.getScreenBrightness({
      success: (res) => {
        this.setData({
          brightnessPercent: Math.round(Number(res.value || 0.6) * 100)
        })
      }
    })
  },

  onResize(res) {
    const size = res && res.size ? res.size : {}
    const isLandscape = Number(size.windowWidth || 0) > Number(size.windowHeight || 0)

    if (this.data.requestingLandscape && isLandscape) {
      this.setData({
        requestingLandscape: false,
        landscapeMode: true,
        materialsOpen: true
      })
    }

    if (this.data.landscapeMode && !isLandscape) {
      this.setData({
        landscapeMode: false,
        materialsOpen: true
      })
    }
  },

  loadStudyContent() {
    if (!this.data.chapterId) {
      this.setData({
        loading: false,
        error: "缺少章节 ID"
      })
      return
    }

    api.getStudyContent(this.data.chapterId)
      .then((data) => {
        requireLearningAccess(data.access && data.access.accessSource)
        const courseware = (data.courseware || []).map((item) => ({
          ...item,
          displayTitle: item.type === "link" ? "课件命令行" : item.title,
          displayDescription: item.type === "link"
            ? "本节课配套命令、操作步骤和补充材料。"
            : (item.description || item.url || ""),
          expanded: item.type !== "link"
        }))
        const hasInlinePreview = courseware.some((item) => (
          item.type === "image" &&
          (item.role === "courseware-preview" || String(item.title || "").includes("课件预览"))
        ))
        const access = data.access || null
        const canDownloadMaterials = access
          ? (typeof access.canDownloadMaterials === "boolean"
            ? access.canDownloadMaterials
            : !!access.hasAccess)
          : false
        const downloadLinks = (data.downloadLinks || []).map((item) => ({
          ...item,
          fileId: item.fileId || item.fileID || item.urlCloudFileId || (isCloudFileId(item.url) ? item.url : ""),
          previewUrl: item.urlTempFileURL || (isCloudFileId(item.url) ? "" : item.url),
          displayTitle: "课件资料",
          displayDescription: hasInlinePreview
            ? "课件已在当前学习页展示，点击下载可保存或转发原文档。"
            : (item.description || "当前章节还没有生成课件页预览，请在后台重新上传 PDF 并保存章节。"),
          openLabel: hasInlinePreview ? "已展示" : "说明",
          inlinePreview: hasInlinePreview,
          expanded: false
        }))

        this.setData({
          loading: false,
          error: "",
          chapter: {
            ...data.chapter,
            title: sanitizeTrainingWording(data.chapter && data.chapter.title)
          },
          video: data.video || {},
          courseware,
          downloadLinks,
          access,
          canDownloadMaterials,
          materialsOpen: true
        })
      })
      .catch((err) => {
        this.setData({
          loading: false,
          error: err.message || "学习内容加载失败"
        })
      })
  },

  copyLink(event) {
    const url = event.currentTarget.dataset.url
    if (!url) return

    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({
          title: "链接已复制",
          icon: "success"
        })
      }
    })
  },

  openLink(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (Number.isInteger(index) && this.data.courseware[index]) {
      const courseware = this.data.courseware.map((item, currentIndex) => currentIndex === index
        ? { ...item, expanded: !item.expanded }
        : item)
      this.setData({ courseware })
      return
    }

    const url = event.currentTarget.dataset.url
    if (!url) return

    this.openOrCopyResource(url)
  },

  downloadLink(event) {
    const url = event.currentTarget.dataset.url
    const fileId = event.currentTarget.dataset.fileId
    if (!url && !fileId) return

    this.downloadResource(url, { fileId, showMenu: true })
  },

  openDownload(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.downloadLinks[index]) return

    const item = this.data.downloadLinks[index]
    if (item.inlinePreview) {
      wx.showToast({
        title: "课件已在当前页面展示",
        icon: "none"
      })
      return
    }

    wx.showModal({
      title: "课件暂未内嵌展示",
      content: "这节课目前只有原 PDF 文件，还没有生成页面预览图。请在后台重新上传 PDF 并保存章节，生成后就会直接显示在视频下方。需要原文档请点“下载”。",
      showCancel: false,
      confirmText: "知道了"
    })
  },

  openOrCopyResource(url) {
    if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/i.test(url)) {
      this.downloadResource(url, { showMenu: false })
      return
    }

    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({
          title: "链接已复制",
          icon: "success"
        })
      }
    })
  },

  inferFileType(value = "") {
    const source = String(value || "").split("?")[0].split("#")[0]
    const match = source.match(/\.([a-z0-9]+)$/i)
    const ext = match ? match[1].toLowerCase() : ""
    return ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf"].includes(ext)
      ? ext
      : ""
  },

  openLocalDocument(filePath, source, showMenu) {
    const fileType = this.inferFileType(source)
    const options = {
      filePath,
      showMenu,
      complete: () => wx.hideLoading(),
      fail: (err) => this.documentFallback(source, err)
    }

    if (fileType) {
      options.fileType = fileType
    } else if (/\.(zip|rar|7z)$/i.test(String(source || "").split("?")[0])) {
      wx.hideLoading()
      wx.showToast({
        title: "压缩包不能在线预览，请点下载后转发或保存",
        icon: "none"
      })
      return
    }

    wx.openDocument(options)
  },

  downloadResource(url, options = {}) {
    const fileId = options.fileId
    const showMenu = options.showMenu !== false
    const source = fileId || url
    wx.showLoading({ title: "处理中" })

    if (!fileId && /tcb\.qcloud\.la/i.test(String(url || ""))) {
      wx.hideLoading()
      wx.showToast({
        title: "请在后台重新上传课件资料",
        icon: "none"
      })
      console.warn("课件资料缺少云文件ID，请在后台重新上传并保存章节", { url })
      return
    }

    if (fileId && wx.cloud && wx.cloud.downloadFile) {
      wx.cloud.downloadFile({
        fileID: fileId,
        success: (res) => {
          this.openLocalDocument(res.tempFilePath, fileId, showMenu)
        },
        fail: (err) => this.copyFallback(url || fileId, err),
        complete: () => {
          wx.hideLoading()
        }
      })
      return
    }

    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200) {
          this.copyFallback(url, { errMsg: `HTTP ${res.statusCode}` })
          return
        }

        this.openLocalDocument(res.tempFilePath, source, showMenu)
      },
      fail: (err) => this.copyFallback(url, err),
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  documentFallback(url, err) {
    console.warn("课件资料预览失败", err)
    this.copyFallback(url, err, "预览受限，已复制链接")
  },

  copyFallback(url, err, title = "下载受限，已复制链接") {
    console.warn("课件资料下载失败", err)
    wx.hideLoading()
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({
          title,
          icon: "none"
        })
      }
    })
  },

  toggleSettings() {
    this.setData({
      settingsOpen: !this.data.settingsOpen
    })
  },

  hideSettings() {
    if (this.data.settingsOpen) {
      this.setData({ settingsOpen: false })
    }
  },

  onBrightnessChange(event) {
    const value = Number(event.detail.value || 0)
    this.setData({ brightnessPercent: value })

    if (!wx.setScreenBrightness) return

    wx.setScreenBrightness({
      value: Math.max(0.05, Math.min(1, value / 100))
    })
  },

  onSoundSwitchChange(event) {
    this.setData({
      muted: !event.detail.value
    })
  },

  toggleMaterials() {
    this.setData({
      materialsOpen: !this.data.materialsOpen
    })
  },

  enterLandscape() {
    this.setData({ requestingLandscape: true })

    if (wx.setPageOrientation) {
      wx.setPageOrientation({
        orientation: "landscape",
        fail: () => this.handleLandscapeBlocked()
      })
    }

    setTimeout(() => {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const isLandscape = Number(info.windowWidth || 0) > Number(info.windowHeight || 0)

      if (isLandscape) {
        this.setData({
          requestingLandscape: false,
          landscapeMode: true,
          materialsOpen: true
        })
        return
      }

      this.handleLandscapeBlocked()
    }, 900)
  },

  exitLandscape() {
    if (wx.setPageOrientation) {
      wx.setPageOrientation({
        orientation: "portrait"
      })
    }

    this.setData({
      landscapeMode: false,
      requestingLandscape: false,
      materialsOpen: true
    })
  },

  handleLandscapeBlocked() {
    this.setData({
      requestingLandscape: false,
      landscapeMode: false,
      materialsOpen: true
    })

    wx.showModal({
      title: "无法切换横屏",
      content: "请先关闭手机的竖屏方向锁，再点击横屏观看。",
      showCancel: false,
      confirmText: "知道了"
    })
  },

  onVideoPlay() {
    this.hideSettings()
  },

  /** 复位缩放 */
  resetPinchZoom(event) {
    const index = event.currentTarget.dataset.index
    if (typeof index === 'undefined') return
    this.setData({ [`courseware[${index}].pinchScale`]: 1 })
  }
})
