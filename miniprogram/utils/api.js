function unwrap(result) {
  if (!result) {
    throw new Error("云函数无返回")
  }

  if (result.ok) {
    return result.data
  }

  const message = result.error && result.error.message
    ? result.error.message
    : "请求失败"
  throw new Error(message)
}

function callFunction(name, data = {}) {
  return wx.cloud.callFunction({ name, data, timeout: 15000 })
    .then((res) => unwrap(res.result))
}

function isCloudFileId(value) {
  return typeof value === "string" && value.indexOf("cloud://") === 0
}

function resolveCloudFileUrls(records, fields) {
  const list = Array.isArray(records) ? records : []
  const fileIds = []

  list.forEach((record) => {
    fields.forEach((field) => {
      const value = record && record[field]
      if (isCloudFileId(value) && fileIds.indexOf(value) === -1) {
        fileIds.push(value)
      }
    })
  })

  const listWithFileIds = list.map((record) => {
    const next = { ...record }
    fields.forEach((field) => {
      if (isCloudFileId(next[field])) {
        next[`${field}CloudFileId`] = next[field]
      }
    })
    return next
  })

  if (fileIds.length === 0) {
    return Promise.resolve(listWithFileIds)
  }

  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: fileIds,
      success(res) {
        const urlMap = {}
        ;(res.fileList || []).forEach((item) => {
          if (item.fileID && item.tempFileURL) {
            urlMap[item.fileID] = item.tempFileURL
          }
        })

        resolve(listWithFileIds.map((record) => {
          const next = { ...record }
          fields.forEach((field) => {
            const originalValue = next[field]
            if (urlMap[originalValue]) {
              next[`${field}TempFileURL`] = urlMap[originalValue]
              next[field] = urlMap[originalValue]
            }
          })
          return next
        }))
      },
      fail() {
        resolve(listWithFileIds)
      }
    })
  })
}

function preferCloudFileIdsForDisplay(records, fields) {
  const list = Array.isArray(records) ? records : []
  return list.map((record) => {
    const next = { ...record }
    fields.forEach((field) => {
      const cloudFileId = next[`${field}CloudFileId`]
      if (cloudFileId) {
        next[`${field}ResolvedUrl`] = next[field]
        next[field] = cloudFileId
      }
    })
    return next
  })
}

function login() {
  return callFunction("user", { action: "login" })
}

function listCourses(params = {}) {
  return callFunction("course_v2", {
    action: "list",
    page: params.page || 1,
    pageSize: params.pageSize || 20
  }).then((data) => {
    return resolveCloudFileUrls(data.list || [], ["coverUrl"])
      .then((list) => ({
        ...data,
        list: preferCloudFileIdsForDisplay(list, ["coverUrl"])
      }))
  })
}

function getCourseDetail(courseId) {
  return callFunction("course_v2", {
    action: "detail",
    courseId
  }).then((data) => {
    return resolveCloudFileUrls(data.course ? [data.course] : [], ["coverUrl"])
      .then((list) => ({
        ...data,
        course: preferCloudFileIdsForDisplay(list, ["coverUrl"])[0] || data.course
      }))
  })
}

function listMyCourses() {
  return callFunction("course_v2", {
    action: "my"
  }).then((data) => {
    return resolveCloudFileUrls(data.list || [], ["coverUrl"])
      .then((list) => ({
        ...data,
        list: preferCloudFileIdsForDisplay(list, ["coverUrl"])
      }))
  })
}

function getStudyContent(chapterId) {
  return callFunction("vod", {
    action: "getStudyContent",
    chapterId
  }).then((data) => {
    return Promise.all([
      resolveCloudFileUrls(data.courseware || [], ["url"]),
      resolveCloudFileUrls(data.downloadLinks || [], ["url"]),
      resolveCloudFileUrls(data.video ? [data.video] : [], ["poster"])
    ]).then(([courseware, downloadLinks, videoList]) => ({
      ...data,
      courseware,
      downloadLinks,
      video: videoList[0] || data.video
    }))
  })
}

function updateContact(data) {
  return callFunction("user", {
    action: "updateContact",
    phone: data.phone,
    wechatId: data.wechatId
  })
}

function bindPhone(code) {
  return callFunction("user", {
    action: "bindPhone",
    code
  })
}

function redeemCode(code) {
  return callFunction("user", {
    action: "redeemCode",
    code
  })
}

module.exports = {
  login,
  listCourses,
  listMyCourses,
  getCourseDetail,
  getStudyContent,
  bindPhone,
  updateContact,
  redeemCode
}
