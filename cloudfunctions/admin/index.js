const cloud = require("wx-server-sdk")
const crypto = require("crypto")
const tencentcloud = require("tencentcloud-sdk-nodejs")

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const UPLOAD_CHUNKS_COLLECTION = "admin_upload_chunks"
const MEMBER_LEVELS = ["normal", "vip1", "vip2", "vip3"]
const INTERNAL_TRAINING_MODE = process.env.INTERNAL_TRAINING_MODE !== "false"

function success(data) {
  return { ok: true, data }
}

function failure(code, message) {
  return {
    ok: false,
    error: { code, message }
  }
}

function assertAdmin(event) {
  const expected = normalizeText(process.env.ADMIN_TOKEN)
  const received = normalizeText(event.adminToken)

  if (!expected) {
    throw new Error("ADMIN_TOKEN_MISSING")
  }

  if (received !== expected) {
    throw new Error("UNAUTHORIZED")
  }
}

function normalizeText(value) {
  return String(value || "").trim()
}

function isHttpRequest(event) {
  return Boolean(event && (event.httpMethod || event.requestContext))
}

function httpResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  }
}

function parseHttpJsonBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String(event.body || "{}")

  return rawBody ? JSON.parse(rawBody) : {}
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/[\s-]/g, "")
}

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function chunkValues(values, size = 20) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function normalizeCoursePayload(event) {
  const title = normalizeText(event.title)
  const accessType = INTERNAL_TRAINING_MODE
    ? "internal"
    : normalizeText(event.accessType || "paid")
  const price = INTERNAL_TRAINING_MODE
    ? 0
    : (accessType === "free" ? 0 : toNumber(event.price))

  return {
    title,
    subtitle: normalizeText(event.subtitle),
    coverUrl: normalizeText(event.coverUrl),
    description: normalizeText(event.description),
    price,
    originalPrice: INTERNAL_TRAINING_MODE ? 0 : toNumber(event.originalPrice),
    accessType,
    status: normalizeText(event.status || "draft"),
    sort: toNumber(event.sort)
  }
}

function normalizeChapterPayload(event) {
  return {
    courseId: normalizeText(event.courseId),
    title: normalizeText(event.title),
    summary: normalizeText(event.summary),
    sort: toNumber(event.sort),
    vodFileId: normalizeText(event.vodFileId),
    originalPlayUrl: normalizeText(event.originalPlayUrl),
    poster: normalizeText(event.poster),
    duration: toNumber(event.duration),
    isTrial: INTERNAL_TRAINING_MODE ? false : !!event.isTrial,
    courseware: Array.isArray(event.courseware) ? event.courseware : [],
    downloadLinks: Array.isArray(event.downloadLinks) ? event.downloadLinks : [],
    downloadFileId: normalizeText(event.downloadFileId),
    previewImages: Array.isArray(event.previewImages) ? event.previewImages : [],
    status: normalizeText(event.status || "draft")
  }
}

function validateIdentifier(type, value) {
  if (!["openid", "phone", "wechatId"].includes(type)) {
    return "授权标识类型不正确"
  }

  if (!value) {
    return "请输入授权标识"
  }

  if (type === "phone" && !/^1\d{10}$/.test(value)) {
    return "请输入 11 位手机号"
  }

  if (type === "wechatId" && !/^[a-zA-Z0-9_-]{5,32}$/.test(value)) {
    return "微信号格式不正确"
  }

  return ""
}

function normalizeLevel(value) {
  return MEMBER_LEVELS.includes(value) ? value : "normal"
}

function normalizeCourseIds(value) {
  return Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean)
    : []
}

function generateRedeemCode(prefix = "YQX") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(8)
  let code = ""
  for (let index = 0; index < 8; index += 1) {
    code += chars[bytes[index] % chars.length]
  }
  return `${prefix}${code}`
}

function normalizeFileExtension(fileName = "") {
  const ext = String(fileName).split(".").pop() || "png"
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "")
  return safeExt || "png"
}

function normalizeUploadTarget(target) {
  const targets = {
    "course-cover": "course-covers",
    "chapter-poster": "chapter-posters",
    "chapter-image": "chapter-images",
    "chapter-document": "chapter-documents"
  }

  return targets[normalizeText(target)] || ""
}

function uploadMaxBytes(target) {
  return normalizeText(target) === "chapter-document"
    ? 50 * 1024 * 1024
    : 2 * 1024 * 1024
}

function getVodClient() {
  const secretId = normalizeText(process.env.TENCENTCLOUD_SECRET_ID || process.env.TC_SECRET_ID)
  const secretKey = normalizeText(process.env.TENCENTCLOUD_SECRET_KEY || process.env.TC_SECRET_KEY)

  if (!secretId || !secretKey) {
    throw new Error("VOD_API_SECRET_MISSING")
  }

  const VodClient = tencentcloud.vod.v20180717.Client
  return new VodClient({
    credential: {
      secretId,
      secretKey
    },
    region: normalizeText(process.env.TC_REGION || "ap-guangzhou"),
    profile: {
      httpProfile: {
        endpoint: "vod.tencentcloudapi.com"
      }
    }
  })
}

async function describeVodDurations(fileIds) {
  const uniqueFileIds = uniqueValues(fileIds)
  if (uniqueFileIds.length === 0) return {}

  const client = getVodClient()
  const subAppId = toNumber(process.env.VOD_SUB_APP_ID || process.env.VOD_SUBAPPID || process.env.VOD_APP_ID, 0)
  const durationMap = {}

  for (const fileIdChunk of chunkValues(uniqueFileIds, 10)) {
    const params = {
      FileIds: fileIdChunk
    }

    if (subAppId > 0) {
      params.SubAppId = subAppId
    }

    const result = await client.DescribeMediaInfos(params)
    ;(result.MediaInfoSet || []).forEach((media) => {
      const fileId = normalizeText(media.FileId)
      const duration = Math.round(toNumber(media.MetaData && media.MetaData.Duration, 0))
      if (fileId && duration > 0) {
        durationMap[fileId] = duration
      }
    })
  }

  return durationMap
}

async function uploadCourseCover(event) {
  assertAdmin(event)

  const fileBase64 = normalizeText(event.fileBase64)
  if (!fileBase64) {
    return failure("FILE_MISSING", "请选择课程封面图片")
  }

  const buffer = Buffer.from(fileBase64, "base64")
  if (buffer.length > 2 * 1024 * 1024) {
    return failure("FILE_TOO_LARGE", "封面图片请控制在 2MB 以内")
  }

  const cloudPath = `course-covers/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${normalizeFileExtension(event.fileName)}`
  const result = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  })

  return success({
    fileID: result.fileID,
    cloudPath
  })
}

async function uploadAdminAsset(event) {
  assertAdmin(event)

  const target = normalizeText(event.target)
  const folder = normalizeUploadTarget(target)
  if (!folder) {
    return failure("INVALID_UPLOAD_TARGET", "上传类型不正确")
  }

  const fileBase64 = normalizeText(event.fileBase64)
  if (!fileBase64) {
    return failure("FILE_MISSING", "请选择要上传的文件")
  }

  const buffer = Buffer.from(fileBase64, "base64")
  const maxBytes = uploadMaxBytes(target)
  if (buffer.length > maxBytes) {
    return failure("FILE_TOO_LARGE", `文件请控制在 ${Math.floor(maxBytes / 1024 / 1024)}MB 以内`)
  }

  const cloudPath = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${normalizeFileExtension(event.fileName)}`
  const result = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  })

  return success({
    fileID: result.fileID,
    cloudPath
  })
}

function chunkDocId(uploadId, index) {
  return `${normalizeText(uploadId)}_${Number(index)}`
}

async function uploadAdminAssetChunk(event) {
  assertAdmin(event)

  const uploadId = normalizeText(event.uploadId)
  const target = normalizeText(event.target)
  const folder = normalizeUploadTarget(target)
  const index = toNumber(event.index, -1)
  const total = toNumber(event.total, 0)
  const chunkBase64 = normalizeText(event.chunkBase64)

  if (!uploadId || !folder || index < 0 || total <= 0 || !chunkBase64) {
    return failure("INVALID_CHUNK_UPLOAD", "分片上传参数不完整")
  }

  const buffer = Buffer.from(chunkBase64, "base64")
  if (buffer.length > 512 * 1024) {
    return failure("CHUNK_TOO_LARGE", "单个分片请控制在 512KB 以内")
  }

  try {
    await db.collection(UPLOAD_CHUNKS_COLLECTION)
      .doc(chunkDocId(uploadId, index))
      .set({
        data: {
          uploadId,
          target,
          fileName: normalizeText(event.fileName),
          contentType: normalizeText(event.contentType),
          index,
          total,
          chunkBase64,
          createdAt: new Date()
        }
      })
  } catch (err) {
    return failure(
      "UPLOAD_CHUNK_SAVE_FAILED",
      `分片临时保存失败：${err.message || err}。请在云数据库创建 ${UPLOAD_CHUNKS_COLLECTION} 集合后重试。`
    )
  }

  return success({
    uploadId,
    index,
    total
  })
}

async function removeUploadChunks(uploadId, total) {
  for (let index = 0; index < total; index += 1) {
    try {
      await db.collection(UPLOAD_CHUNKS_COLLECTION)
        .doc(chunkDocId(uploadId, index))
        .remove()
    } catch (err) {
      console.warn("清理上传分片失败", uploadId, index, err)
    }
  }
}

async function completeAdminAssetChunkUpload(event) {
  assertAdmin(event)

  const uploadId = normalizeText(event.uploadId)
  const target = normalizeText(event.target)
  const folder = normalizeUploadTarget(target)
  const total = toNumber(event.total, 0)
  const fileName = normalizeText(event.fileName || "document.pdf")

  if (!uploadId || !folder || total <= 0) {
    return failure("INVALID_CHUNK_UPLOAD", "分片上传参数不完整")
  }

  let chunkResults
  try {
    chunkResults = await Promise.all(Array.from({ length: total }, (_, index) => (
      db.collection(UPLOAD_CHUNKS_COLLECTION)
        .doc(chunkDocId(uploadId, index))
        .get()
        .then((result) => ({ index, data: result.data || {} }))
    )))
  } catch (err) {
    return failure(
      "UPLOAD_CHUNK_READ_FAILED",
      `读取上传分片失败：${err.message || err}。请确认 ${UPLOAD_CHUNKS_COLLECTION} 集合已经创建。`
    )
  }

  const buffers = []
  for (const item of chunkResults.sort((left, right) => left.index - right.index)) {
    const chunkBase64 = normalizeText(item.data.chunkBase64)
    if (!chunkBase64) {
      return failure("CHUNK_MISSING", `第 ${item.index + 1} 个分片缺失，请重新上传`)
    }
    buffers.push(Buffer.from(chunkBase64, "base64"))
  }

  const buffer = Buffer.concat(buffers)
  const maxBytes = uploadMaxBytes(target)
  if (buffer.length > maxBytes) {
    await removeUploadChunks(uploadId, total)
    return failure("FILE_TOO_LARGE", `文件请控制在 ${Math.floor(maxBytes / 1024 / 1024)}MB 以内`)
  }

  const cloudPath = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${normalizeFileExtension(fileName)}`
  const result = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  })

  removeUploadChunks(uploadId, total)
    .catch((err) => console.warn("清理上传分片失败", uploadId, err))

  return success({
    fileID: result.fileID,
    cloudPath
  })
}

async function listCourses(event) {
  assertAdmin(event)

  const result = await db.collection("courses")
    .orderBy("sort", "asc")
    .orderBy("createdAt", "desc")
    .limit(Number(event.limit || 100))
    .get()

  return success({
    list: result.data
  })
}

async function createCourse(event) {
  assertAdmin(event)

  const data = normalizeCoursePayload(event)
  if (!data.title) {
    return failure("TITLE_MISSING", "请输入课程标题")
  }

  if (!["free", "paid", "internal"].includes(data.accessType)) {
    return failure("INVALID_ACCESS_TYPE", "课程类型不正确")
  }

  const now = db.serverDate()
  const result = await db.collection("courses").add({
    data: {
      ...data,
      createdAt: now,
      updatedAt: now
    }
  })

  return success({
    courseId: result._id
  })
}

async function updateCourse(event) {
  assertAdmin(event)

  const courseId = normalizeText(event.courseId)
  if (!courseId) {
    return failure("COURSE_ID_MISSING", "缺少课程 ID")
  }

  const data = normalizeCoursePayload(event)
  if (!data.title) {
    return failure("TITLE_MISSING", "请输入课程标题")
  }

  await db.collection("courses").doc(courseId).update({
    data: {
      ...data,
      updatedAt: db.serverDate()
    }
  })

  return success({
    courseId
  })
}

async function deleteCourse(event) {
  assertAdmin(event)

  const courseId = normalizeText(event.courseId)
  if (!courseId) {
    return failure("COURSE_ID_MISSING", "缺少课程 ID")
  }

  await db.collection("courses").doc(courseId).remove()

  return success({
    courseId
  })
}

async function listChapters(event) {
  assertAdmin(event)

  const courseId = normalizeText(event.courseId)
  let query = db.collection("chapters")
  if (courseId) {
    query = query.where({ courseId })
  }

  const result = await query
    .orderBy("sort", "asc")
    .orderBy("createdAt", "desc")
    .limit(Number(event.limit || 200))
    .get()

  return success({
    list: result.data
  })
}

async function createChapter(event) {
  assertAdmin(event)

  const data = normalizeChapterPayload(event)
  if (!data.courseId) {
    return failure("COURSE_ID_MISSING", "缺少课程 ID")
  }

  if (!data.title) {
    return failure("TITLE_MISSING", "请输入章节标题")
  }

  const now = db.serverDate()
  const result = await db.collection("chapters").add({
    data: {
      ...data,
      createdAt: now,
      updatedAt: now
    }
  })

  return success({
    chapterId: result._id
  })
}

async function updateChapter(event) {
  assertAdmin(event)

  const chapterId = normalizeText(event.chapterId)
  if (!chapterId) {
    return failure("CHAPTER_ID_MISSING", "缺少章节 ID")
  }

  const data = normalizeChapterPayload(event)
  if (!data.courseId) {
    return failure("COURSE_ID_MISSING", "缺少课程 ID")
  }

  if (!data.title) {
    return failure("TITLE_MISSING", "请输入章节标题")
  }

  await db.collection("chapters").doc(chapterId).update({
    data: {
      ...data,
      updatedAt: db.serverDate()
    }
  })

  return success({
    chapterId
  })
}

async function syncVodChapterDurations(event) {
  assertAdmin(event)

  const courseId = normalizeText(event.courseId)
  let query = db.collection("chapters")
  if (courseId) {
    query = query.where({ courseId })
  }

  const result = await query.limit(Number(event.limit || 300)).get()
  const chapters = result.data || []
  const durationMap = await describeVodDurations(chapters.map((chapter) => chapter.vodFileId))
  const updated = []
  const skipped = []

  for (const chapter of chapters) {
    const fileId = normalizeText(chapter.vodFileId)
    const nextDuration = durationMap[fileId] || 0
    const currentDuration = toNumber(chapter.duration, 0)
    const currentFullDuration = toNumber(chapter.fullDuration || chapter.videoDuration || chapter.originalDuration, 0)

    if (!fileId) {
      skipped.push({
        chapterId: chapter._id,
        title: chapter.title,
        reason: "VOD_FILE_ID_MISSING"
      })
      continue
    }

    if (!nextDuration) {
      skipped.push({
        chapterId: chapter._id,
        title: chapter.title,
        vodFileId: fileId,
        reason: "VOD_DURATION_NOT_FOUND"
      })
      continue
    }

    if (currentDuration === nextDuration && currentFullDuration === nextDuration) {
      skipped.push({
        chapterId: chapter._id,
        title: chapter.title,
        vodFileId: fileId,
        duration: currentDuration,
        reason: "ALREADY_SYNCED"
      })
      continue
    }

    await db.collection("chapters").doc(chapter._id).update({
      data: {
        duration: nextDuration,
        fullDuration: nextDuration,
        videoDuration: nextDuration,
        updatedAt: db.serverDate()
      }
    })

    updated.push({
      chapterId: chapter._id,
      title: chapter.title,
      vodFileId: fileId,
      before: currentDuration,
      after: nextDuration
    })
  }

  return success({
    updated,
    skipped,
    updatedCount: updated.length,
    skippedCount: skipped.length
  })
}

async function deleteChapter(event) {
  assertAdmin(event)

  const chapterId = normalizeText(event.chapterId)
  if (!chapterId) {
    return failure("CHAPTER_ID_MISSING", "缺少章节 ID")
  }

  await db.collection("chapters").doc(chapterId).remove()

  return success({
    chapterId
  })
}

async function grantCourseAccess(event) {
  assertAdmin(event)

  if (INTERNAL_TRAINING_MODE) {
    return failure("MANUAL_ACCESS_DISABLED", "当前仅支持通过培训授权码开通课程")
  }

  const courseId = normalizeText(event.courseId)
  const identifierType = normalizeText(event.identifierType)
  const identifierValue = normalizeText(event.identifierValue)
  const note = normalizeText(event.note)
  const paidAmount = INTERNAL_TRAINING_MODE ? 0 : Number(event.paidAmount || 0)
  const error = validateIdentifier(identifierType, identifierValue)

  if (!courseId) {
    return failure("COURSE_ID_MISSING", "请选择课程")
  }

  if (error) {
    return failure("INVALID_IDENTIFIER", error)
  }

  const now = db.serverDate()
  const data = {
    courseId,
    identifierType,
    identifierValue,
    source: INTERNAL_TRAINING_MODE ? "internal_manual" : "manual_wechat_pay",
    status: "active",
    paidAmount,
    note,
    createdAt: now,
    updatedAt: now
  }

  if (identifierType === "openid") {
    data.openid = identifierValue
  }

  const result = await db.collection("course_access").add({ data })

  return success({
    accessId: result._id
  })
}

async function listCourseAccess(event) {
  assertAdmin(event)

  const result = await db.collection("course_access")
    .orderBy("createdAt", "desc")
    .limit(Number(event.limit || 50))
    .get()

  return success({
    list: result.data
  })
}

async function disableCourseAccess(event) {
  assertAdmin(event)

  const accessId = normalizeText(event.accessId)
  if (!accessId) {
    return failure("ACCESS_ID_MISSING", "缺少授权记录 ID")
  }

  await db.collection("course_access").doc(accessId).update({
    data: {
      status: "disabled",
      updatedAt: db.serverDate()
    }
  })

  return success({
    accessId
  })
}

async function listRedeemCodes(event) {
  assertAdmin(event)

  const result = await db.collection("redeem_codes")
    .orderBy("createdAt", "desc")
    .limit(Number(event.limit || 100))
    .get()

  return success({
    list: result.data
  })
}

async function createRedeemCode(event) {
  assertAdmin(event)

  const courseIds = normalizeCourseIds(event.courseIds)
  const code = normalizeCode(event.code) || generateRedeemCode()
  const level = normalizeLevel(event.level)
  const maxUses = Math.max(1, toNumber(event.maxUses, 1))
  const paidAmount = INTERNAL_TRAINING_MODE ? 0 : Math.max(0, toNumber(event.paidAmount, 0))
  const note = normalizeText(event.note)

  if (courseIds.length === 0) {
    return failure("REDEEM_TARGET_MISSING", "请选择授权课程")
  }

  const existed = await db.collection("redeem_codes")
    .where({ code })
    .limit(1)
    .get()

  if (existed.data.length > 0) {
    return failure("CODE_EXISTS", "授权码已存在，请换一个")
  }

  const now = db.serverDate()
  const result = await db.collection("redeem_codes").add({
    data: {
      code,
      courseIds,
      level,
      status: "active",
      maxUses,
      usedCount: 0,
      paidAmount,
      note,
      createdAt: now,
      updatedAt: now
    }
  })

  return success({
    redeemCodeId: result._id,
    code
  })
}

async function listMemberLevelAccess(event) {
  assertAdmin(event)

  const result = await db.collection("course_access")
    .where({
      source: "member_level",
      identifierType: "memberLevel",
      status: "active"
    })
    .limit(300)
    .get()
    .catch(() => ({ data: [] }))

  const map = {}
  result.data.forEach((item) => {
    const level = normalizeLevel(item.identifierValue)
    if (!map[level]) {
      map[level] = {
        level,
        courseIds: [],
        status: "active"
      }
    }
    if (item.courseId) {
      map[level].courseIds.push(item.courseId)
    }
  })

  return success({
    list: MEMBER_LEVELS.map((level) => map[level] || {
      level,
      courseIds: [],
      status: "active"
    })
  })
}

async function saveMemberLevelAccess(event) {
  assertAdmin(event)

  if (INTERNAL_TRAINING_MODE) {
    return failure("LEVEL_ACCESS_DISABLED", "当前培训权限等级不再直接开通课程")
  }

  const level = normalizeLevel(event.level)
  const courseIds = normalizeCourseIds(event.courseIds)
  const now = db.serverDate()

  await db.collection("course_access")
    .where({
      source: "member_level",
      identifierType: "memberLevel",
      identifierValue: level
    })
    .remove()
    .catch(() => null)

  for (const courseId of courseIds) {
    await db.collection("course_access").add({
      data: {
        courseId,
        identifierType: "memberLevel",
        identifierValue: level,
        source: "member_level",
        status: "active",
        note: `培训权限 ${level} 自动授权`,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return success({
    level,
    courseIds
  })
}

async function disableRedeemCode(event) {
  assertAdmin(event)

  const redeemCodeId = normalizeText(event.redeemCodeId)
  if (!redeemCodeId) {
    return failure("REDEEM_CODE_ID_MISSING", "缺少授权码记录 ID")
  }

  await db.collection("redeem_codes").doc(redeemCodeId).update({
    data: {
      status: "disabled",
      updatedAt: db.serverDate()
    }
  })

  return success({
    redeemCodeId
  })
}

async function listOrders(event) {
  assertAdmin(event)

  const maxLimit = Math.min(Math.max(Number(event.limit || 200), 1), 500)
  const orders = []
  for (let offset = 0; orders.length < maxLimit; offset += 100) {
    const batchLimit = Math.min(100, maxLimit - orders.length)
    const result = await db.collection("orders")
      .orderBy("createdAt", "desc")
      .skip(offset)
      .limit(batchLimit)
      .get()
    const batch = result.data || []
    orders.push(...batch)
    if (batch.length < batchLimit) break
  }

  const openids = uniqueValues(orders.flatMap((order) => [order.openid, order.payerOpenid]))
  const userIds = uniqueValues(orders.map((order) => order.userId))
  const userMapByOpenid = {}
  const userMapById = {}

  for (const chunk of chunkValues(openids)) {
    const byOpenid = await db.collection("users")
      .where({ openid: _.in(chunk) })
      .get()
      .catch(() => ({ data: [] }))
    const byWxOpenid = await db.collection("users")
      .where({ _openid: _.in(chunk) })
      .get()
      .catch(() => ({ data: [] }))

    ;[...(byOpenid.data || []), ...(byWxOpenid.data || [])].forEach((user) => {
      if (user._id) userMapById[user._id] = user
      if (user.openid) userMapByOpenid[user.openid] = user
      if (user._openid) userMapByOpenid[user._openid] = user
    })
  }

  for (const chunk of chunkValues(userIds)) {
    const byId = await db.collection("users")
      .where({ _id: _.in(chunk) })
      .get()
      .catch(() => ({ data: [] }))

    ;(byId.data || []).forEach((user) => {
      if (user._id) userMapById[user._id] = user
      if (user.openid) userMapByOpenid[user.openid] = user
      if (user._openid) userMapByOpenid[user._openid] = user
    })
  }

  const list = orders.map((order) => {
    const user = userMapById[order.userId] || userMapByOpenid[order.openid] || userMapByOpenid[order.payerOpenid] || {}
    return {
      ...order,
      payerPhone: order.phone || order.payerPhone || user.phone || "",
      payerNickname: order.nickname || user.nickname || ""
    }
  })

  return success({
    list
  })
}

async function listUsers(event) {
  assertAdmin(event)

  const result = await db.collection("users")
    .orderBy("updatedAt", "desc")
    .limit(Number(event.limit || 100))
    .get()

  return success({
    list: result.data
  })
}

async function handleAdminAction(event) {
  const action = event.action

  if (action === "listCourses") {
    return await listCourses(event)
  }

  if (action === "createCourse") {
    return await createCourse(event)
  }

  if (action === "updateCourse") {
    return await updateCourse(event)
  }

  if (action === "uploadCourseCover") {
    return await uploadCourseCover(event)
  }

  if (action === "uploadAdminAsset") {
    return await uploadAdminAsset(event)
  }

  if (action === "uploadAdminAssetChunk") {
    return await uploadAdminAssetChunk(event)
  }

  if (action === "completeAdminAssetChunkUpload") {
    return await completeAdminAssetChunkUpload(event)
  }

  if (action === "deleteCourse") {
    return await deleteCourse(event)
  }

  if (action === "listChapters") {
    return await listChapters(event)
  }

  if (action === "createChapter") {
    return await createChapter(event)
  }

  if (action === "updateChapter") {
    return await updateChapter(event)
  }

  if (action === "syncVodChapterDurations" || action === "repairKnownChapterDurations") {
    return await syncVodChapterDurations(event)
  }

  if (action === "deleteChapter") {
    return await deleteChapter(event)
  }

  if (action === "grantCourseAccess") {
    return await grantCourseAccess(event)
  }

  if (action === "listCourseAccess") {
    return await listCourseAccess(event)
  }

  if (action === "disableCourseAccess") {
    return await disableCourseAccess(event)
  }

  if (action === "listRedeemCodes") {
    return await listRedeemCodes(event)
  }

  if (action === "createRedeemCode") {
    return await createRedeemCode(event)
  }

  if (action === "disableRedeemCode") {
    return await disableRedeemCode(event)
  }

  if (action === "listMemberLevelAccess") {
    return await listMemberLevelAccess(event)
  }

  if (action === "saveMemberLevelAccess") {
    return await saveMemberLevelAccess(event)
  }

  if (action === "listOrders") {
    return await listOrders(event)
  }

  if (action === "listUsers") {
    return await listUsers(event)
  }

  return failure("UNKNOWN_ACTION", "未知后台操作")
}

exports.main = async (event = {}) => {
  const httpMode = isHttpRequest(event)

  try {
    if (httpMode && event.httpMethod === "OPTIONS") {
      return httpResponse(204, {})
    }

    const payload = httpMode ? parseHttpJsonBody(event) : event
    const result = await handleAdminAction(payload)
    return httpMode ? httpResponse(result.ok ? 200 : 400, result) : result
  } catch (err) {
    let result
    if (err.message === "ADMIN_TOKEN_MISSING") {
      result = failure("ADMIN_TOKEN_MISSING", "admin 云函数还没有配置 ADMIN_TOKEN")
      return httpMode ? httpResponse(500, result) : result
    }

    if (err.message === "UNAUTHORIZED") {
      result = failure("UNAUTHORIZED", "后台授权失败")
      return httpMode ? httpResponse(401, result) : result
    }

    if (err.message === "VOD_API_SECRET_MISSING") {
      result = failure("VOD_API_SECRET_MISSING", "请先在 admin 云函数环境变量配置 TC_SECRET_ID 和 TC_SECRET_KEY")
      return httpMode ? httpResponse(500, result) : result
    }

    console.error(err)
    result = failure("SERVER_ERROR", `后台服务异常：${err.message || err}`)
    return httpMode ? httpResponse(500, result) : result
  }
}
