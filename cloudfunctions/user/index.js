const cloud = require("wx-server-sdk")

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const users = db.collection("users")
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

function getOpenApiErrorMessage(err) {
  const code = err.errCode || err.errcode || err.code || "UNKNOWN"
  const message = err.errMsg || err.errmsg || err.message || "未知错误"
  return `${code}: ${message}`
}

function normalizeText(value) {
  return String(value || "").trim()
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase().replace(/[\s-]/g, "")
}

function normalizeLevel(value) {
  return ["normal", "vip1", "vip2", "vip3"].includes(value) ? value : "normal"
}

function buildMemberNo(openid) {
  const tail = String(openid || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()
  return `YQX${tail || "00000000"}`
}

function publicUser(user = {}, openid = "") {
  const userOpenid = user.openid || openid
  return {
    _id: user._id,
    openid: userOpenid,
    nickname: user.nickname || "",
    avatarUrl: user.avatarUrl || "",
    phone: user.phone || "",
    wechatId: user.wechatId || "",
    memberNo: user.memberNo || buildMemberNo(userOpenid),
    level: normalizeLevel(user.level),
    status: user.status || "active"
  }
}

async function findUserByOpenid(openid) {
  const result = await users.where({ openid }).limit(1).get()
  return result.data[0]
}

async function ensureUser(openid, extraData = {}) {
  const now = db.serverDate()
  const existed = await findUserByOpenid(openid)

  if (existed) {
    const patch = {
      memberNo: existed.memberNo || buildMemberNo(openid),
      lastLoginAt: now,
      updatedAt: now,
      ...extraData
    }

    await users.doc(existed._id).update({ data: patch })

    return {
      ...existed,
      ...patch,
      memberNo: patch.memberNo
    }
  }

  const userData = {
    openid,
    nickname: "",
    avatarUrl: "",
    phone: "",
    wechatId: "",
    memberNo: buildMemberNo(openid),
    level: "normal",
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    ...extraData
  }

  const created = await users.add({ data: userData })

  return {
    ...userData,
    _id: created._id
  }
}

async function login() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return failure("OPENID_MISSING", "无法获取微信用户身份")
  }

  const user = await ensureUser(openid)

  return success({
    user: publicUser(user, openid)
  })
}

async function bindPhone(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const code = normalizeText(event.code)

  if (!openid) {
    return failure("OPENID_MISSING", "无法获取微信用户身份")
  }

  if (!code) {
    return failure("PHONE_CODE_MISSING", "请先授权获取微信绑定手机号")
  }

  let phoneNumber = ""
  try {
    const result = await cloud.openapi.phonenumber.getPhoneNumber({ code })
    const phoneInfo = result.phoneInfo || result.phone_info || {}
    phoneNumber = phoneInfo.phoneNumber || phoneInfo.purePhoneNumber || ""
  } catch (err) {
    const detail = getOpenApiErrorMessage(err)
    console.error("bindPhone failed", detail, err)
    return failure("PHONE_AUTH_FAILED", `手机号授权失败：${detail}`)
  }

  if (!phoneNumber) {
    return failure("PHONE_EMPTY", "没有获取到微信绑定手机号")
  }

  const now = db.serverDate()
  const user = await ensureUser(openid, {
    phone: phoneNumber,
    phoneBoundAt: now,
    wechatBound: true
  })

  return success({
    user: publicUser({
      ...user,
      phone: phoneNumber,
      wechatBound: true
    }, openid)
  })
}

async function updateContact(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return failure("OPENID_MISSING", "无法获取微信用户身份")
  }

  const phone = normalizeText(event.phone)
  const wechatId = normalizeText(event.wechatId)

  if (phone && !/^1\d{10}$/.test(phone)) {
    return failure("INVALID_PHONE", "请输入 11 位手机号")
  }

  if (wechatId && !/^[a-zA-Z0-9_-]{5,32}$/.test(wechatId)) {
    return failure("INVALID_WECHAT_ID", "微信号格式不正确")
  }

  const now = db.serverDate()
  const user = await ensureUser(openid, {
    phone,
    wechatId,
    updatedAt: now
  })

  return success({
    user: publicUser({
      ...user,
      phone,
      wechatId
    }, openid)
  })
}

async function redeemCode(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return failure("OPENID_MISSING", "无法获取微信用户身份")
  }

  const code = normalizeCode(event.code)
  if (!code) {
    return failure("CODE_MISSING", "请输入培训授权码")
  }

  const codeResult = await db.collection("redeem_codes")
    .where({
      code,
      status: "active"
    })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  const redeem = codeResult.data[0]
  if (!redeem) {
    return failure("CODE_INVALID", "培训授权码不存在或已失效")
  }

  if (redeem.expireAt && new Date(redeem.expireAt).getTime() <= Date.now()) {
    return failure("CODE_EXPIRED", "培训授权码已过期")
  }

  const usedCount = Number(redeem.usedCount || 0)
  const maxUses = Number(redeem.maxUses || 1)
  if (usedCount >= maxUses) {
    return failure("CODE_USED", "培训授权码已被使用")
  }

  const now = db.serverDate()
  const currentUser = await ensureUser(openid)
  const targetLevel = normalizeLevel(redeem.level || currentUser.level || "normal")

  await users.doc(currentUser._id).update({
    data: {
      level: targetLevel,
      updatedAt: now
    }
  })

  const courseIds = Array.isArray(redeem.courseIds)
    ? redeem.courseIds
    : (redeem.courseId ? [redeem.courseId] : [])

  for (const courseId of courseIds) {
    const existedAccess = await db.collection("course_access")
      .where({
        courseId,
        openid,
        source: "redeem_code",
        status: "active"
      })
      .limit(1)
      .get()

    if (existedAccess.data.length > 0) {
      continue
    }

    await db.collection("course_access").add({
      data: {
        courseId,
        identifierType: "openid",
        identifierValue: openid,
        openid,
        source: "redeem_code",
        redeemCode: code,
        status: "active",
        paidAmount: Number(redeem.paidAmount || 0),
        note: `培训授权码 ${code}`,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  await db.collection("redeem_codes").doc(redeem._id).update({
    data: {
      usedCount: _.inc(1),
      lastUsedBy: openid,
      lastUsedAt: now,
      status: usedCount + 1 >= maxUses ? "used" : "active",
      updatedAt: now
    }
  })

  return success({
    user: publicUser({
      ...currentUser,
      level: targetLevel
    }, openid),
    courseIds
  })
}

exports.main = async (event = {}) => {
  try {
    const action = event.action || "login"

    if (action === "login") {
      return login()
    }

    if (action === "bindPhone") {
      return bindPhone(event)
    }

    if (action === "updateContact") {
      return updateContact(event)
    }

    if (action === "redeemCode") {
      return redeemCode(event)
    }

    return failure("UNKNOWN_ACTION", "未知用户操作")
  } catch (err) {
    console.error(err)
    return failure("SERVER_ERROR", "用户服务异常")
  }
}
