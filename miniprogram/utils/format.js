function formatPrice(price) {
  const value = Number(price || 0)
  return (value / 100).toFixed(2)
}

function formatDuration(seconds) {
  const value = Number(seconds || 0)
  const minute = Math.floor(value / 60)
  const second = value % 60
  return `${minute}:${String(second).padStart(2, "0")}`
}

function sanitizeTrainingWording(value) {
  return String(value || "")
    .replace(/付费版/g, "基础版")
    .replace(/免费版/g, "基础版")
    .replace(/免费公开内容[，,]\s*无需支付即可学习[。.]?/g, "公开培训内容，按授权范围学习。")
    .replace(/无需支付即可学习/g, "按授权范围学习")
    .replace(/付费/g, "")
    .replace(/免费/g, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

module.exports = {
  formatPrice,
  formatDuration,
  sanitizeTrainingWording
}
