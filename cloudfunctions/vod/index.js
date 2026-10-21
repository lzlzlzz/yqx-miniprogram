const cloud = require("wx-server-sdk")
const crypto = require("crypto")

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function success(data) {
  return { ok: true, data }
}

function failure(code, message) {
  return {
    ok: false,
    error: { code, message }
  }
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex")
}

function randomUs() {
  return crypto.randomBytes(6).toString("hex")
}

function getOriginalPlayUrl(chapter) {
  return chapter.playUrl || chapter.originalPlayUrl || chapter.sourceUrl || ""
}

function isPublicCourse(course = {}) {
  const title = String(course.title || "").trim()
  return course.accessType === "free" ||
    title.includes("公开资料") ||
    title.includes("定制安装配置服务")
}

function buildVodSignedUrl(originalUrl, options = {}) {
  if (!originalUrl) {
    return {
      playUrl: "",
      signed: false,
      expireAt: 0,
      reason: "ORIGINAL_URL_MISSING"
    }
  }

  const key = process.env.VOD_PLAY_KEY || ""
  if (!key) {
    return {
      playUrl: originalUrl,
      signed: false,
      expireAt: 0,
      reason: "VOD_PLAY_KEY_MISSING"
    }
  }

  const ttlSeconds = Number(process.env.VOD_SIGN_TTL_SECONDS || 7200)
  const expireAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const t = expireAt.toString(16)
  const exper = String(options.exper || 0)
  const rlimit = String(options.rlimit || process.env.VOD_RLIMIT || 0)
  const us = randomUs()
  const url = new URL(originalUrl)
  const pathname = url.pathname
  const dir = pathname.slice(0, pathname.lastIndexOf("/") + 1)
  const sign = md5(`${key}${dir}${t}${exper}${rlimit}${us}`)

  url.search = ""
  url.searchParams.set("t", t)
  url.searchParams.set("exper", exper)
  url.searchParams.set("rlimit", rlimit)
  url.searchParams.set("us", us)
  url.searchParams.set("sign", sign)

  return {
    playUrl: url.toString(),
    signed: true,
    expireAt
  }
}

async function canAccessChapter(openid, chapter) {
  const courseResult = await db.collection("courses").doc(chapter.courseId).get()
    .catch(() => null)
  const course = courseResult && courseResult.data

  if (course && course.status === "published" && isPublicCourse(course)) {
    return {
      hasAccess: true,
      accessSource: "public"
    }
  }

  if (!openid) return { hasAccess: false, accessSource: "" }
  return hasRedeemAccess(openid, chapter.courseId)
}

async function hasRedeemAccess(openid, courseId) {
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
  const matchedAccess = result.data.find((access) => {
    if (access.expireAt && new Date(access.expireAt).getTime() <= now) {
      return false
    }

    return access.identifierValue === openid || access.openid === openid
  })

  return {
    hasAccess: !!matchedAccess,
    accessSource: matchedAccess ? "redeem_code" : ""
  }
}

async function getStudyContent(event) {
  const chapterId = event.chapterId
  if (!chapterId) {
    return failure("CHAPTER_ID_MISSING", "缺少章节 ID")
  }

  const chapterResult = await db.collection("chapters").doc(chapterId).get()
    .catch(() => null)

  if (!chapterResult || !chapterResult.data || chapterResult.data.status !== "published") {
    return failure("CHAPTER_NOT_FOUND", "章节不存在或未上架")
  }

  const wxContext = cloud.getWXContext()
  const chapter = chapterResult.data
  const access = await canAccessChapter(wxContext.OPENID, chapter)

  if (!access.hasAccess) {
    return failure("NO_ACCESS", "暂无该培训内容的访问权限")
  }

  return success({
    chapter: {
      _id: chapter._id,
      courseId: chapter.courseId,
      title: chapter.title,
      duration: chapter.duration || 0
    },
    video: {
      fileId: chapter.vodFileId || "",
      ...buildVodSignedUrl(getOriginalPlayUrl(chapter), {
        exper: 0,
        rlimit: chapter.rlimit || 0
      }),
      poster: chapter.poster || "",
      duration: chapter.duration || 0
    },
    courseware: chapter.courseware || [],
    downloadLinks: chapter.downloadLinks || [],
    access: {
      hasAccess: true,
      accessSource: access.accessSource || "",
      canDownloadMaterials: true
    }
  })
}

exports.main = async (event) => {
  try {
    const action = event.action || "getStudyContent"

    if (action === "getStudyContent") {
      return getStudyContent(event)
    }

    return failure("UNKNOWN_ACTION", "未知视频操作")
  } catch (err) {
    console.error(err)
    return failure("SERVER_ERROR", "视频服务异常")
  }
}
