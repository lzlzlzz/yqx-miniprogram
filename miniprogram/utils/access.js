function isRedeemAccess(value) {
  return value === "redeem_code"
}

function isLearningAccess(value) {
  return isRedeemAccess(value) || value === "public"
}

function requireLearningAccess(value) {
  if (!isLearningAccess(value)) {
    throw new Error("请先使用培训授权码开通该课程")
  }
}

module.exports = {
  isRedeemAccess,
  isLearningAccess,
  requireLearningAccess
}
