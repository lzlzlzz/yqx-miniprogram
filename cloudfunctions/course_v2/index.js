const cloud = require("wx-server-sdk")

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function success(data) {
  return { ok: true, data }
}

function failure(code, message) {
  return {
    ok: false,
    error: { code, message }
  }
}

function isPublicCourse(course = {}) {
  const title = String(course.title || "").trim()
  return course.accessType === "free" ||
    title.includes("公开资料") ||
    title.includes("定制安装配置服务")
}

function publicCourse(course) {
  return {
    _id: course._id,
    title: course.title,
    subtitle: course.subtitle || "",
    coverUrl: course.coverUrl || "",
    description: course.description || "",
    status: course.status,
    sort: course.sort || 0
  }
}

function getChapterDuration(chapter) {
  const candidates = [
    chapter.fullDuration,
    chapter.videoDuration,
    chapter.originalDuration,
    chapter.vodDuration,
    chapter.mediaDuration,
    chapter.duration
  ]

  for (const value of candidates) {
    const seconds = Number(value || 0)
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds
    }
  }

  return 0
}

async function listCourses(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const page = Math.max(Number(event.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(event.pageSize || 20), 1), 50)
  const skip = (page - 1) * pageSize

  const coursesResult = await db.collection("courses")
    .where({ status: "published" })
    .orderBy("sort", "asc")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get()

  const courses = []
  for (const course of coursesResult.data) {
    const accessInfo = await getAccessInfo(openid, course)
    courses.push({
      ...publicCourse(course),
      hasAccess: accessInfo.hasAccess,
      accessSource: accessInfo.accessSource
    })
  }

  return success({
    list: courses.slice(skip, skip + pageSize),
    total: courses.length,
    page,
    pageSize
  })
}

async function listMyCourses() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const coursesResult = await db.collection("courses")
    .where({ status: "published" })
    .orderBy("sort", "asc")
    .get()

  const list = []
  for (const course of coursesResult.data) {
    const accessInfo = await getAccessInfo(openid, course)
    if (accessInfo.hasAccess) {
      list.push({
        ...publicCourse(course),
        accessSource: accessInfo.accessSource
      })
    }
  }

  return success({
    list
  })
}

async function getAccessInfo(openid, course) {
  if (isPublicCourse(course)) {
    return {
      hasAccess: true,
      accessSource: "public",
      hasPurchased: false
    }
  }

  if (!openid) {
    return {
      hasAccess: false,
      accessSource: "",
      hasPurchased: false
    }
  }

  const access = await getRedeemAccessInfo(openid, course._id)

  return {
    hasAccess: access.hasAccess,
    accessSource: access.accessSource,
    hasPurchased: false
  }
}

async function getRedeemAccessInfo(openid, courseId) {
  const result = await db.collection("course_access")
    .where({
      courseId,
      status: "active",
      source: "redeem_code"
    })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))

  const now = Date.now()
  const access = result.data.find((item) => {
    if (item.expireAt && new Date(item.expireAt).getTime() <= now) {
      return false
    }
    return item.openid === openid || item.identifierValue === openid
  })

  return {
    hasAccess: !!access,
    accessSource: access ? "redeem_code" : ""
  }
}

async function getCourseDetail(event) {
  const courseId = event.courseId
  if (!courseId) {
    return failure("COURSE_ID_MISSING", "缺少课程 ID")
  }

  const courseResult = await db.collection("courses").doc(courseId).get()
    .catch(() => null)

  if (!courseResult || !courseResult.data || courseResult.data.status !== "published") {
    return failure("COURSE_NOT_FOUND", "课程不存在或未上架")
  }

  const chapterResult = await db.collection("chapters")
    .where({
      courseId,
      status: _.in(["published"])
    })
    .orderBy("sort", "asc")
    .get()

  const wxContext = cloud.getWXContext()
  const accessInfo = await getAccessInfo(wxContext.OPENID, courseResult.data)

  return success({
    course: publicCourse(courseResult.data),
    chapters: chapterResult.data.map((chapter) => ({
      _id: chapter._id,
      courseId: chapter.courseId,
      title: chapter.title,
      summary: chapter.summary || "",
      sort: chapter.sort || 0,
      duration: getChapterDuration(chapter)
    })),
    hasAccess: accessInfo.hasAccess,
    accessSource: accessInfo.accessSource
  })
}

exports.main = async (event) => {
  try {
    const action = event.action || "list"

    if (action === "list") {
      return listCourses(event)
    }

    if (action === "detail") {
      return getCourseDetail(event)
    }

    if (action === "my") {
      return listMyCourses(event)
    }

    return failure("UNKNOWN_ACTION", "未知课程操作")
  } catch (err) {
    console.error(err)
    return failure("SERVER_ERROR", "课程服务异常")
  }
}
