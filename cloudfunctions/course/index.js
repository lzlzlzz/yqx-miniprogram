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

function publicCourse(course) {
  const accessType = course.accessType || (Number(course.price || 0) <= 0 ? "free" : "paid")

  return {
    _id: course._id,
    title: course.title,
    subtitle: course.subtitle || "",
    coverUrl: course.coverUrl || "",
    description: course.description || "",
    price: course.price || 0,
    originalPrice: course.originalPrice || 0,
    accessType,
    isFree: accessType === "free",
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
  const page = Math.max(Number(event.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(event.pageSize || 20), 1), 50)
  const skip = (page - 1) * pageSize

  const query = db.collection("courses").where({
    status: "published"
  })

  const [listResult, countResult] = await Promise.all([
    query.orderBy("sort", "asc").orderBy("createdAt", "desc").skip(skip).limit(pageSize).get(),
    query.count()
  ])

  return success({
    list: listResult.data.map(publicCourse),
    total: countResult.total,
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

async function hasPurchased(openid, courseId) {
  if (!openid) return false

  const orderResult = await db.collection("orders")
    .where({
      openid,
      courseId,
      status: "paid"
    })
    .limit(1)
    .get()

  if (orderResult.data.length > 0) {
    return true
  }

  return hasManualAccess(openid, courseId)
}

async function getAccessInfo(openid, course) {
  const accessType = course.accessType || (Number(course.price || 0) <= 0 ? "free" : "paid")

  if (accessType === "free") {
    return {
      hasAccess: true,
      accessSource: "free",
      hasPurchased: false,
      debug: {
        openid,
        courseId: course._id,
        accessType
      }
    }
  }

  if (!openid) {
    return {
      hasAccess: false,
      accessSource: "",
      hasPurchased: false,
      debug: {
        openid,
        courseId: course._id,
        accessType
      }
    }
  }

  const orderResult = await db.collection("orders")
    .where({
      openid,
      courseId: course._id,
      status: "paid"
    })
    .limit(1)
    .get()

  if (orderResult.data.length > 0) {
    return {
      hasAccess: true,
      accessSource: "wechat_pay",
      hasPurchased: true,
      debug: {
        openid,
        courseId: course._id,
        accessType,
        orderCount: orderResult.data.length
      }
    }
  }

  const manualResult = await hasManualAccess(openid, course._id)

  return {
    hasAccess: manualResult.hasAccess,
    accessSource: manualResult.hasAccess ? "manual" : "",
    hasPurchased: false,
    debug: {
      openid,
      courseId: course._id,
      accessType,
      manual: manualResult
    }
  }
}

async function hasManualAccess(openid, courseId) {
  const openidAccessResult = await db.collection("course_access")
    .where({
      courseId,
      status: "active",
      openid
    })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  if (openidAccessResult.data.length > 0) {
    return {
      hasAccess: true,
      matchType: "openid",
      openidAccessCount: openidAccessResult.data.length
    }
  }

  const userResult = await db.collection("users")
    .where({ openid })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  const user = userResult.data[0] || {}
  const identifiers = new Set([openid])

  if (user.phone) identifiers.add(user.phone)
  if (user.wechatId) identifiers.add(user.wechatId)

  const accessResult = await db.collection("course_access")
    .where({
      courseId,
      status: "active"
    })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }))

  const now = Date.now()
  const matched = accessResult.data.some((access) => {
    if (access.expireAt && new Date(access.expireAt).getTime() <= now) {
      return false
    }

    return identifiers.has(access.identifierValue) || access.openid === openid
  })

  return {
    hasAccess: matched,
    matchType: matched ? "identifier" : "",
    identifiers: Array.from(identifiers),
    accessCount: accessResult.data.length
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
      duration: getChapterDuration(chapter),
      isTrial: !!chapter.isTrial
    })),
    hasPurchased: accessInfo.hasPurchased,
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
