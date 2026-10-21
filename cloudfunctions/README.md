# 云函数说明

当前第一版云函数：

- `user`：微信登录，自动创建或更新用户。
- `course`：课程列表和课程详情。
- `vod`：章节学习内容，后续接入 VOD 防盗链播放地址。
- `admin`：人工授权开课，适用于线下微信收款。

## 部署前提

需要先在微信开发者工具或 CloudBase 控制台开通云开发环境。

## 数据集合

需要创建以下集合：

- `users`
- `courses`
- `chapters`
- `orders`
- `course_access`

## 测试数据

可参考 `cloudfunctions/seed-data.json` 或根目录 `云数据库初始化数据.md` 创建第一批测试数据。

注意：

- 当前测试数据已使用固定 `_id`：收费课为 `course_paid_001`，免费课为 `course_free_001`，第一课为 `chapter_001`。
- `createdAt`、`updatedAt` 可由后台云函数写入；手动插入测试数据时可暂时不填。

`courses` 示例：

```json
{
  "title": "测试课程",
  "subtitle": "P0 MVP 测试",
  "coverUrl": "https://example.com/course-cover.jpg",
  "description": "这是一门用于跑通课程列表和详情的测试课程。",
  "price": 9900,
  "originalPrice": 19900,
  "accessType": "paid",
  "status": "published",
  "sort": 1
}
```

免费课程示例：

```json
{
  "title": "免费公开资料课",
  "subtitle": "方便客户转发和了解服务",
  "coverUrl": "https://example.com/free-course-cover.jpg",
  "description": "免费公开内容，无需支付即可学习。",
  "price": 0,
  "accessType": "free",
  "status": "published",
  "sort": 2
}
```

`course_access` 示例：

```json
{
  "courseId": "替换为课程 _id",
  "identifierType": "phone",
  "identifierValue": "13800138000",
  "source": "manual_wechat_pay",
  "status": "active",
  "paidAmount": 9900,
  "note": "微信转账已确认"
}
```

`chapters` 示例：

```json
{
  "courseId": "替换为课程 _id",
  "title": "第一讲：课程介绍",
  "summary": "测试章节",
  "sort": 1,
  "vodFileId": "",
  "duration": 600,
  "isTrial": false,
  "courseware": [
    {
      "type": "text",
      "title": "本节重点",
      "content": "理解课程交付主流程：登录、浏览课程、购买、进入章节学习。"
    },
    {
      "type": "link",
      "title": "参考资料",
      "url": "https://example.com/course-resource",
      "description": "点击复制链接或配置业务域名后直接打开"
    }
  ],
  "downloadLinks": [
    {
      "title": "本节课件 PDF",
      "url": "https://example.com/courseware.pdf"
    }
  ],
  "status": "published"
}
```
