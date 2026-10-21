# 易启学小程序

易启学是一个微信小程序课程交付平台。P0 MVP 目标是在 2 周内跑通：

```text
微信登录 -> 浏览课程 -> 微信支付购买 -> 腾讯云 VOD 视频学习
```

## 当前状态

当前处于本地开发骨架阶段，已包含：

- `miniprogram/`：原生微信小程序端
- `cloudfunctions/`：微信云开发云函数
- `admin/`：Vue 3 管理后台
- 项目记忆文档：状态、计划、数据库、接口、外部平台配置、开发日志

## 目录结构

```text
miniprogram/       小程序端
cloudfunctions/    云函数后端
admin/             管理后台
```

## 导入小程序

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本项目根目录。
4. AppID 已写入 `project.config.json`。
5. 将 `miniprogram/config.js` 中的 `cloudEnv` 改为云开发环境 ID。

当前还需要开通微信云开发并填写环境 ID。

## 敏感信息规则

不要把这些信息写入代码、文档或聊天：

- 小程序 AppSecret
- 微信支付 API v3 Key
- 微信支付商户私钥、证书文件内容
- 腾讯云 SecretId / SecretKey
- 腾讯云 VOD 防盗链 Key
