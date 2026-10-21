const cloud = require("wx-server-sdk")
const crypto = require("crypto")
const https = require("https")

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const PUBLIC_PAYMENT_ENABLED = process.env.PUBLIC_PAYMENT_ENABLED === "true"

function success(data) {
  return { ok: true, data }
}

function failure(code, message) {
  return {
    ok: false,
    error: { code, message }
  }
}

function normalizeText(value) {
  return String(value || "").trim()
}

function buildOrderNo() {
  const time = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14)
  const random = crypto.randomBytes(6).toString("hex").toUpperCase()
  return `YQX${time}${random}`
}

function randomString(length = 32) {
  return crypto.randomBytes(length).toString("hex").slice(0, length)
}

function normalizePrivateKey(value = "") {
  return String(value).replace(/\\n/g, "\n")
}

function readPrivateKey() {
  const directKey = normalizePrivateKey(process.env.WECHAT_PAY_PRIVATE_KEY || "")
  if (directKey) {
    return directKey
  }

  const base64Key = normalizeText(process.env.WECHAT_PAY_PRIVATE_KEY_BASE64)
  if (!base64Key) {
    return ""
  }

  return Buffer.from(base64Key, "base64").toString("utf8")
}

function getPayConfig() {
  return {
    appid: process.env.WECHAT_PAY_APPID || process.env.WX_APPID || "",
    mchid: process.env.WECHAT_PAY_MCHID || "",
    serialNo: process.env.WECHAT_PAY_SERIAL_NO || "",
    privateKey: readPrivateKey(),
    apiV3Key: process.env.WECHAT_PAY_API_V3_KEY || "",
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || ""
  }
}

function isPayConfigured(config) {
  return Boolean(config.appid && config.mchid && config.serialNo && config.privateKey && config.apiV3Key && config.notifyUrl)
}

function getMissingPayConfig(config) {
  const fields = [
    ["WECHAT_PAY_APPID", config.appid],
    ["WECHAT_PAY_MCHID", config.mchid],
    ["WECHAT_PAY_SERIAL_NO", config.serialNo],
    ["WECHAT_PAY_PRIVATE_KEY 或 WECHAT_PAY_PRIVATE_KEY_BASE64", config.privateKey],
    ["WECHAT_PAY_API_V3_KEY", config.apiV3Key],
    ["WECHAT_PAY_NOTIFY_URL", config.notifyUrl]
  ]

  return fields
    .filter(([, value]) => !value)
    .map(([name]) => name)
}

function signWithPrivateKey(message, privateKey) {
  return crypto
    .createSign("RSA-SHA256")
    .update(message, "utf8")
    .sign(privateKey, "base64")
}

function requestWechatPay({ method, path, body, config }) {
  const bodyText = body ? JSON.stringify(body) : ""
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomString(32)
  const signMessage = `${method}\n${path}\n${timestamp}\n${nonceStr}\n${bodyText}\n`
  const signature = signWithPrivateKey(signMessage, config.privateKey)
  const authorization = [
    `mchid="${config.mchid}"`,
    `nonce_str="${nonceStr}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${config.serialNo}"`,
    `signature="${signature}"`
  ].join(",")

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.mch.weixin.qq.com",
      path,
      method,
      headers: {
        Authorization: `WECHATPAY2-SHA256-RSA2048 ${authorization}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Yiqixue-MiniProgram/1.0",
        "Content-Length": Buffer.byteLength(bodyText)
      }
    }, (res) => {
      let data = ""
      res.on("data", (chunk) => {
        data += chunk
      })
      res.on("end", () => {
        let parsed = {}
        try {
          parsed = data ? JSON.parse(data) : {}
        } catch (err) {
          reject(err)
          return
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed)
          return
        }

        const message = parsed.message || parsed.detail || `微信支付请求失败：${res.statusCode}`
        const error = new Error(message)
        error.response = parsed
        reject(error)
      })
    })

    req.on("error", reject)
    if (bodyText) {
      req.write(bodyText)
    }
    req.end()
  })
}

async function createWechatPayment(order, course, openid) {
  const config = getPayConfig()

  if (!isPayConfigured(config)) {
    const missing = getMissingPayConfig(config)
    return {
      paymentReady: false,
      missingConfig: missing,
      message: `订单已创建，微信支付参数待配置：${missing.join("、")}`
    }
  }

  const body = {
    appid: config.appid,
    mchid: config.mchid,
    description: String(course.title || "易启学课程").slice(0, 127),
    out_trade_no: order.orderNo,
    notify_url: config.notifyUrl,
    amount: {
      total: Number(order.amount || 0),
      currency: "CNY"
    },
    payer: {
      openid
    }
  }

  const result = await requestWechatPay({
    method: "POST",
    path: "/v3/pay/transactions/jsapi",
    body,
    config
  })

  const prepayId = result.prepay_id
  if (!prepayId) {
    throw new Error("微信支付未返回 prepay_id")
  }

  await db.collection("orders").doc(order._id).update({
    data: {
      prepayId,
      updatedAt: db.serverDate()
    }
  })

  const timeStamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = randomString(32)
  const packageValue = `prepay_id=${prepayId}`
  const paySignMessage = `${config.appid}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`

  return {
    paymentReady: true,
    paymentParams: {
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: "RSA",
      paySign: signWithPrivateKey(paySignMessage, config.privateKey)
    }
  }
}

async function hasPaidOrder(openid, courseId) {
  const result = await db.collection("orders")
    .where({
      openid,
      courseId,
      status: "paid"
    })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  return result.data[0]
}

async function findPendingOrder(openid, courseId) {
  const result = await db.collection("orders")
    .where({
      openid,
      courseId,
      status: "pending"
    })
    .orderBy("createdAt", "desc")
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  return result.data[0]
}

async function findUserByOpenid(openid) {
  const result = await db.collection("users")
    .where({ openid })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  return result.data[0] || {}
}

async function createOrder(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const courseId = normalizeText(event.courseId)

  if (!openid) {
    return failure("OPENID_MISSING", "无法获取微信用户身份")
  }

  if (!courseId) {
    return failure("COURSE_ID_MISSING", "缺少课程 ID")
  }

  const courseResult = await db.collection("courses").doc(courseId).get()
    .catch(() => null)
  const course = courseResult && courseResult.data

  if (!course || course.status !== "published") {
    return failure("COURSE_NOT_FOUND", "课程不存在或未上架")
  }

  const accessType = course.accessType || (Number(course.price || 0) <= 0 ? "free" : "paid")
  if (accessType === "free") {
    return success({
      orderCreated: false,
      alreadyFree: true,
      message: "免费课程无需购买"
    })
  }

  if (Number(course.price || 0) <= 0) {
    return failure("INVALID_COURSE_PRICE", "收费课程价格配置不正确")
  }

  const paidOrder = await hasPaidOrder(openid, courseId)
  if (paidOrder) {
    return success({
      orderCreated: false,
      alreadyPaid: true,
      order: paidOrder
    })
  }

  const pendingOrder = await findPendingOrder(openid, courseId)
  if (pendingOrder) {
    const user = await findUserByOpenid(openid)
    if ((user.phone || user.nickname || user._id) && (!pendingOrder.phone || !pendingOrder.payerPhone || !pendingOrder.userId)) {
      const patch = {
        userId: pendingOrder.userId || user._id || "",
        phone: pendingOrder.phone || user.phone || "",
        payerPhone: pendingOrder.payerPhone || user.phone || "",
        payerNickname: pendingOrder.payerNickname || user.nickname || "",
        updatedAt: db.serverDate()
      }
      await db.collection("orders").doc(pendingOrder._id).update({ data: patch }).catch(() => null)
      Object.assign(pendingOrder, patch)
    }

    // 如果已有 prepay_id，直接复用避免参数不一致
    if (pendingOrder.prepayId) {
      const config = getPayConfig()
      const timeStamp = Math.floor(Date.now() / 1000).toString()
      const nonceStr = randomString(32)
      const packageValue = `prepay_id=${pendingOrder.prepayId}`
      const paySignMessage = `${config.appid}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`

      const paymentReady = isPayConfigured(config)
      return success({
        orderCreated: false,
        paymentReady,
        paymentParams: paymentReady ? {
          timeStamp,
          nonceStr,
          package: packageValue,
          signType: "RSA",
          paySign: signWithPrivateKey(paySignMessage, config.privateKey)
        } : undefined,
        order: pendingOrder,
        message: paymentReady ? "已有待支付订单，可继续支付" : "微信支付参数未配置"
      })
    }

    const payment = await createWechatPayment(pendingOrder, course, openid)

    return success({
      orderCreated: false,
      paymentReady: payment.paymentReady,
      paymentParams: payment.paymentParams,
      missingConfig: payment.missingConfig,
      order: pendingOrder,
      message: payment.message || "已有待支付订单，可继续支付"
    })
  }

  const now = db.serverDate()
  const orderNo = buildOrderNo()
  const user = await findUserByOpenid(openid)
  const orderData = {
    orderNo,
    openid,
    userId: user._id || "",
    phone: user.phone || "",
    payerPhone: user.phone || "",
    payerNickname: user.nickname || "",
    courseId,
    courseTitle: course.title || "",
    amount: Number(course.price || 0),
    status: "pending",
    paymentProvider: "wechat",
    prepayId: "",
    transactionId: "",
    createdAt: now,
    updatedAt: now
  }

  const result = await db.collection("orders").add({ data: orderData })
  const order = {
    _id: result._id,
    ...orderData
  }
  const payment = await createWechatPayment(order, course, openid)

  return success({
    orderCreated: true,
    paymentReady: payment.paymentReady,
    paymentParams: payment.paymentParams,
    missingConfig: payment.missingConfig,
    order,
    message: payment.message || "订单已创建"
  })
}

async function findOrderByIdOrNo({ orderId, orderNo }) {
  const normalizedOrderId = normalizeText(orderId)
  const normalizedOrderNo = normalizeText(orderNo)

  if (normalizedOrderId) {
    const result = await db.collection("orders").doc(normalizedOrderId).get()
      .catch(() => null)
    return result && result.data
  }

  if (normalizedOrderNo) {
    const result = await db.collection("orders")
      .where({ orderNo: normalizedOrderNo })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }))
    return result.data[0]
  }

  return null
}

async function queryWechatPayOrder(orderNo) {
  const config = getPayConfig()
  if (!isPayConfigured(config)) {
    return {
      configured: false,
      missingConfig: getMissingPayConfig(config)
    }
  }

  const encodedOrderNo = encodeURIComponent(orderNo)
  const path = `/v3/pay/transactions/out-trade-no/${encodedOrderNo}?mchid=${encodeURIComponent(config.mchid)}`
  const result = await requestWechatPay({
    method: "GET",
    path,
    config
  })

  return {
    configured: true,
    result
  }
}

async function grantWechatPayAccess(order, payResult) {
  const existed = await db.collection("course_access")
    .where({
      openid: order.openid,
      courseId: order.courseId,
      source: "wechat_pay",
      status: "active"
    })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  if (existed.data.length > 0) {
    return existed.data[0]._id
  }

  const now = db.serverDate()
  const result = await db.collection("course_access").add({
    data: {
      courseId: order.courseId,
      identifierType: "openid",
      identifierValue: order.openid,
      openid: order.openid,
      source: "wechat_pay",
      status: "active",
      paidAmount: Number(order.amount || 0),
      orderNo: order.orderNo,
      transactionId: payResult.transaction_id || "",
      note: "微信支付自动开通",
      createdAt: now,
      updatedAt: now
    }
  })

  return result._id
}

async function markOrderPaid(order, payResult = {}) {
  if (order.status === "paid") {
    await grantWechatPayAccess(order, payResult)
    return order
  }

  const paidAt = db.serverDate()
  await db.collection("orders").doc(order._id).update({
    data: {
      status: "paid",
      transactionId: payResult.transaction_id || order.transactionId || "",
      payerOpenid: payResult.payer && payResult.payer.openid ? payResult.payer.openid : order.openid,
      paidAt,
      updatedAt: paidAt
    }
  })

  await grantWechatPayAccess(order, payResult)

  return {
    ...order,
    status: "paid",
    transactionId: payResult.transaction_id || order.transactionId || ""
  }
}

async function confirmPayment(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const order = await findOrderByIdOrNo({
    orderId: event.orderId,
    orderNo: event.orderNo
  })

  if (!openid) {
    return failure("OPENID_MISSING", "无法获取微信用户身份")
  }

  if (!order) {
    return failure("ORDER_NOT_FOUND", "订单不存在")
  }

  if (order.openid !== openid) {
    return failure("ORDER_FORBIDDEN", "不能确认他人的订单")
  }

  if (order.status === "paid") {
    await grantWechatPayAccess(order, {})
    return success({
      paid: true,
      order,
      message: "订单已支付"
    })
  }

  // 虚拟支付订单：前端 wx.requestVirtualPayment 成功后直接标记
  if (order.paymentProvider === "virtual_pay") {
    await markOrderPaid(order, { transaction_id: "virtual_pay_" + order.orderNo })
    return success({
      paid: true,
      order,
      message: "支付已确认，课程已开通"
    })
  }

  const query = await queryWechatPayOrder(order.orderNo)
  if (!query.configured) {
    return success({
      paid: false,
      missingConfig: query.missingConfig,
      message: `微信支付参数待配置：${query.missingConfig.join("、")}`
    })
  }

  const payResult = query.result || {}
  const tradeState = payResult.trade_state || ""

  if (tradeState === "SUCCESS") {
    const paidOrder = await markOrderPaid(order, payResult)
    return success({
      paid: true,
      order: paidOrder,
      tradeState,
      message: "支付已确认，课程已开通"
    })
  }

  return success({
    paid: false,
    tradeState,
    order,
    message: payResult.trade_state_desc || "支付暂未完成"
  })
}

function isHttpRequest(event) {
  return Boolean(event && (event.httpMethod || event.requestContext))
}

function httpResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
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

function decryptWechatPayResource(resource, apiV3Key) {
  if (!resource || !resource.ciphertext || !resource.nonce) {
    throw new Error("Invalid WeChat Pay notify resource")
  }

  if (resource.algorithm && resource.algorithm !== "AEAD_AES_256_GCM") {
    throw new Error(`Unsupported WeChat Pay notify algorithm: ${resource.algorithm}`)
  }

  const ciphertext = Buffer.from(resource.ciphertext, "base64")
  const authTag = ciphertext.slice(ciphertext.length - 16)
  const encryptedText = ciphertext.slice(0, ciphertext.length - 16)
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(resource.nonce, "utf8")
  )

  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"))
  }

  decipher.setAuthTag(authTag)
  const decoded = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final()
  ]).toString("utf8")

  return JSON.parse(decoded)
}

async function handleWechatPayNotify(event) {
  const config = getPayConfig()
  if (!config.apiV3Key) {
    return httpResponse(500, {
      code: "FAIL",
      message: "WECHAT_PAY_API_V3_KEY is missing"
    })
  }

  const body = parseHttpJsonBody(event)
  const payResult = decryptWechatPayResource(body.resource, config.apiV3Key)
  const orderNo = normalizeText(payResult.out_trade_no)

  if (!orderNo) {
    return httpResponse(400, {
      code: "FAIL",
      message: "out_trade_no is missing"
    })
  }

  const order = await findOrderByIdOrNo({ orderNo })
  if (!order) {
    return httpResponse(404, {
      code: "FAIL",
      message: "order not found"
    })
  }

  if (payResult.trade_state === "SUCCESS") {
    await markOrderPaid(order, payResult)
  }

  return httpResponse(200, {
    code: "SUCCESS",
    message: "success"
  })
}

async function getMyOrders(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const limit = Math.min(Math.max(Number(event.limit || 20), 1), 50)

  if (!openid) {
    return failure("OPENID_MISSING", "无法获取微信用户身份")
  }

  const result = await db.collection("orders")
    .where({ openid })
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get()

  return success({
    list: result.data
  })
}

async function jscode2session(code) {
  const appid = process.env.WECHAT_PAY_APPID || process.env.WX_APPID || ""
  const secret = process.env.WX_APP_SECRET || ""
  if (!appid || !secret) {
    throw new Error("缺少 WX_APPID 或 WX_APP_SECRET 环境变量")
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${code}&grant_type=authorization_code`

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = ""
      res.on("data", (chunk) => { body += chunk })
      res.on("end", () => {
        try {
          const data = JSON.parse(body)
          if (data.errcode) {
            reject(new Error(`jscode2session 失败: ${data.errmsg || data.errcode}`))
            return
          }
          resolve(data)
        } catch (err) {
          reject(err)
        }
      })
    }).on("error", reject)
  })
}

function getVirtualPayConfig() {
  return {
    offerId: process.env.VIRTUAL_PAY_OFFER_ID || "",
    appKey: process.env.VIRTUAL_PAY_APP_KEY || "",
    appid: process.env.WECHAT_PAY_APPID || process.env.WX_APPID || ""
  }
}

function isVirtualPayConfigured(config) {
  return Boolean(config.offerId && config.appKey)
}

/** 创建虚拟支付参数 */
async function createVirtualPayment(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const courseId = normalizeText(event.courseId)
  const code = normalizeText(event.code)

  if (!openid) return failure("OPENID_MISSING", "无法获取微信用户身份")
  if (!courseId) return failure("COURSE_ID_MISSING", "缺少课程 ID")
  if (!code) return failure("CODE_MISSING", "缺少登录 code")

  const payConfig = getVirtualPayConfig()
  if (!isVirtualPayConfigured(payConfig)) {
    return failure("VIRTUAL_PAY_CONFIG_MISSING", "虚拟支付 offerId/appKey 未配置，请在云函数环境变量中添加 VIRTUAL_PAY_OFFER_ID 和 VIRTUAL_PAY_APP_KEY")
  }

  // 获取 session_key
  let sessionKey = ""
  try {
    const session = await jscode2session(code)
    sessionKey = session.session_key || ""
  } catch (err) {
    return failure("SESSION_KEY_ERROR", `获取 session_key 失败: ${err.message}`)
  }
  if (!sessionKey) return failure("SESSION_KEY_MISSING", "获取 session_key 失败")

  // 查课程
  const courseResult = await db.collection("courses").doc(courseId).get().catch(() => null)
  const course = courseResult && courseResult.data
  if (!course || course.status !== "published") {
    return failure("COURSE_NOT_FOUND", "课程不存在或未上架")
  }

  const accessType = course.accessType || (Number(course.price || 0) <= 0 ? "free" : "paid")
  if (accessType === "free") {
    return success({ orderCreated: false, alreadyFree: true, message: "免费课程无需购买" })
  }

  // 查是否已支付
  const paidOrder = await hasPaidOrder(openid, courseId)
  if (paidOrder) {
    return success({ orderCreated: false, alreadyPaid: true, order: paidOrder })
  }

  // 创建订单
  const price = Number(course.price || 0)
  if (price <= 0) return failure("INVALID_COURSE_PRICE", "收费课程价格配置不正确")

  const now = db.serverDate()
  const orderNo = buildOrderNo()
  const user = await findUserByOpenid(openid)
  const orderData = {
    orderNo,
    openid,
    userId: user._id || "",
    phone: user.phone || "",
    payerPhone: user.phone || "",
    payerNickname: user.nickname || "",
    courseId,
    courseTitle: course.title || "",
    amount: price,
    status: "pending",
    paymentProvider: "virtual_pay",
    prepayId: "",
    transactionId: "",
    createdAt: now,
    updatedAt: now
  }

  const result = await db.collection("orders").add({ data: orderData })
  const order = { _id: result._id, ...orderData }

  // 构建 signData
  const goodsPrice = price
  const outTradeNo = orderNo
  const signDataObj = {
    offerId: payConfig.offerId,
    buyQuantity: 1,
    env: 0, // 0=正式环境 iOS必须正式环境
    currencyType: "CNY",
    // 道具ID限20字符：短ID直接用，长ID用哈希
    productId: courseId.length <= 20
      ? courseId
      : "c_" + crypto.createHash("md5").update(courseId).digest("hex").slice(0, 18),
    goodsPrice,
    outTradeNo,
    attach: JSON.stringify({ orderId: order._id, courseId })
  }
  const signData = JSON.stringify(signDataObj)

  console.log("virtual pay signData:", signData)
  console.log("productId:", signDataObj.productId, "courseId:", courseId, "env:", signDataObj.env)

  // paySig = HMAC-SHA256(uri + '&' + signData, appKey)
  const paySig = crypto.createHmac("sha256", payConfig.appKey)
    .update("requestVirtualPayment" + "&" + signData, "utf8")
    .digest("hex")

  // signature = HMAC-SHA256(signData, session_key)
  const signature = crypto.createHmac("sha256", sessionKey)
    .update(signData, "utf8")
    .digest("hex")

  return success({
    orderCreated: true,
    paymentReady: true,
    signData,
    paySig,
    signature,
    order,
    message: "虚拟支付订单已创建"
  })
}

exports.main = async (event = {}) => {
  try {
    if (isHttpRequest(event)) {
      return await handleWechatPayNotify(event)
    }

    const action = event.action || "create"

    if (["create", "createVirtualPayment", "confirm"].includes(action) && !PUBLIC_PAYMENT_ENABLED) {
      return failure("PAYMENT_DISABLED", "当前未开放在线购买")
    }

    if (action === "create") {
      return await createOrder(event)
    }

    if (action === "createVirtualPayment") {
      return await createVirtualPayment(event)
    }

    if (action === "my") {
      return await getMyOrders(event)
    }

    if (action === "confirm") {
      return await confirmPayment(event)
    }

    return failure("UNKNOWN_ACTION", "未知订单操作")
  } catch (err) {
    if (isHttpRequest(event)) {
      return httpResponse(500, {
        code: "FAIL",
        message: err.message || "notify failed"
      })
    }

    console.error(err)
    if (err.response || String(err.message || "").includes("微信支付")) {
      return failure("WECHAT_PAY_ERROR", err.message || "微信支付请求失败")
    }

    return failure("SERVER_ERROR", "订单服务异常")
  }
}
