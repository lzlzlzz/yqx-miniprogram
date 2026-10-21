<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">易</div>
        <div>
          <div class="brand-title">易启学</div>
          <div class="brand-subtitle">管理后台</div>
        </div>
      </div>

      <el-menu :default-active="activeMenu" class="menu" @select="activeMenu = $event">
        <el-menu-item index="courses">课程管理</el-menu-item>
        <el-menu-item index="chapters">章节课件</el-menu-item>
        <el-menu-item index="redeem">培训授权码</el-menu-item>
        <el-menu-item index="users">用户列表</el-menu-item>
      </el-menu>
    </aside>

    <main class="content">
      <header class="topbar">
        <div>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>
        <div class="topbar-actions">
          <el-tag :type="cloudReady ? 'success' : 'info'">{{ cloudReady ? '云端模式' : '本地模拟' }}</el-tag>
          <el-button @click="cloudDialogOpen = true">云端配置</el-button>
          <el-button v-if="cloudReady" :loading="adminSyncing" @click="syncAdminData">刷新云端数据</el-button>
          <el-button v-if="activeMenu === 'courses'" type="primary" @click="resetCourseForm">新增课程</el-button>
          <el-button
            v-if="activeMenu === 'chapters' && cloudReady"
            :loading="vodDurationSyncing"
            @click="syncVodDurations"
          >同步 VOD 时长</el-button>
          <el-button v-if="activeMenu === 'chapters'" type="primary" @click="resetChapterForm">新增章节</el-button>
        </div>
      </header>

      <section v-if="activeMenu === 'courses'" class="panel">
        <div class="panel-grid">
          <el-form label-width="92px" class="edit-form">
            <div class="form-title">{{ courseForm.id ? "编辑课程" : "新增课程" }}</div>
            <el-form-item label="课程标题">
              <el-input v-model="courseForm.title" placeholder="请输入课程标题" />
            </el-form-item>
            <el-form-item label="副标题">
              <el-input v-model="courseForm.subtitle" placeholder="一句话说明课程价值" />
            </el-form-item>
            <el-form-item label="排序">
              <el-input-number v-model="courseForm.sort" :min="0" :step="1" />
            </el-form-item>
            <el-form-item label="课程封面">
              <div class="cover-upload">
                <el-input v-model="courseForm.coverUrl" placeholder="可粘贴图片 URL，也可以上传封面图" />
                <input
                  ref="courseCoverInput"
                  class="file-input"
                  type="file"
                  accept="image/*"
                  @change="uploadCourseCover"
                />
                <el-button :loading="coverUploading" @click="triggerCourseCoverSelect">上传封面</el-button>
              </div>
              <div v-if="courseForm.coverUrl" class="cover-meta">已设置封面：{{ courseForm.coverUrl }}</div>
              <img v-if="courseCoverPreviewUrl" class="cover-preview" :src="courseCoverPreviewUrl" alt="课程封面预览" />
            </el-form-item>
            <el-form-item label="课程介绍">
              <el-input v-model="courseForm.description" type="textarea" :rows="4" />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="courseForm.status">
                <el-option label="草稿" value="draft" />
                <el-option label="已上架" value="published" />
                <el-option label="已下架" value="offline" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveCourse">保存课程</el-button>
              <el-button @click="resetCourseForm">清空</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="courseRows" class="data-table">
            <el-table-column prop="title" label="课程标题" min-width="180" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">{{ statusLabel(row.status) }}</template>
            </el-table-column>
            <el-table-column label="章节" width="80">
              <template #default="{ row }">{{ countChapters(row.id) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="210" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="editCourse(row)">编辑</el-button>
                <el-button link type="primary" @click="createChapterForCourse(row)">加章节</el-button>
                <el-button link type="danger" @click="removeCourse(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="activeMenu === 'chapters'" class="panel">
        <div class="panel-grid">
          <el-form label-width="96px" class="edit-form">
            <div class="form-title">{{ chapterForm.id ? "编辑章节" : "新增章节" }}</div>
            <el-form-item label="所属课程">
              <el-select v-model="chapterForm.courseId" placeholder="请选择课程">
                <el-option v-for="course in courseRows" :key="course.id" :label="course.title" :value="course.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="章节标题">
              <el-input v-model="chapterForm.title" placeholder="例如：第一课：课程介绍" />
            </el-form-item>
            <el-form-item label="章节简介">
              <el-input v-model="chapterForm.summary" placeholder="一句话说明本节课学什么" />
            </el-form-item>
            <el-form-item label="排序">
              <el-input-number v-model="chapterForm.sort" :min="0" :step="1" />
            </el-form-item>
            <el-form-item label="VOD FileId">
              <el-input v-model="chapterForm.vodFileId" placeholder="例如 YOUR_VOD_FILE_ID" />
            </el-form-item>
            <el-form-item label="播放地址">
              <el-input v-model="chapterForm.originalPlayUrl" placeholder="腾讯云 VOD 原始播放 URL" />
            </el-form-item>
            <el-form-item label="视频封面">
              <div class="cover-upload">
                <el-input v-model="chapterForm.poster" placeholder="可粘贴视频封面 URL，也可上传图片" />
                <input
                  ref="chapterPosterInput"
                  class="file-input"
                  type="file"
                  accept="image/*"
                  @change="uploadChapterPoster"
                />
                <el-button :loading="chapterUploadLoading.poster" @click="triggerChapterPosterSelect">上传封面</el-button>
              </div>
              <div v-if="chapterForm.poster" class="cover-meta">已设置视频封面：{{ chapterForm.poster }}</div>
              <img v-if="chapterForm.poster" class="cover-preview" :src="chapterForm.poster" alt="视频封面预览" />
            </el-form-item>
            <el-form-item label="视频时长">
              <el-input-number v-model="chapterForm.duration" :min="0" />
              <span class="form-hint">秒</span>
            </el-form-item>
            <el-form-item label="课件文字">
              <el-input v-model="chapterForm.note" type="textarea" :rows="4" placeholder="学员看视频时同步阅读的文字课件" />
            </el-form-item>
            <el-form-item label="截图地址">
              <div class="cover-upload">
                <el-input v-model="chapterForm.imageUrl" placeholder="可粘贴课件截图 URL，也可上传图片" />
                <input
                  ref="chapterImageInput"
                  class="file-input"
                  type="file"
                  accept="image/*"
                  @change="uploadChapterImage"
                />
                <el-button :loading="chapterUploadLoading.image" @click="triggerChapterImageSelect">上传截图</el-button>
              </div>
              <div v-if="chapterForm.imageUrl" class="cover-meta">已设置课件截图：{{ chapterForm.imageUrl }}</div>
              <img v-if="chapterForm.imageUrl" class="courseware-preview" :src="chapterForm.imageUrl" alt="课件截图预览" />
            </el-form-item>
            <el-form-item label="课件资料">
              <div class="cover-upload">
                <el-input v-model="chapterForm.downloadUrl" placeholder="上传 PDF、Word、PPT 或资料包后自动填入" />
                <input
                  ref="chapterDocumentInput"
                  class="file-input"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar"
                  @change="uploadChapterDocument"
                />
                <el-button :loading="chapterUploadLoading.document" @click="triggerChapterDocumentSelect">上传文档</el-button>
              </div>
              <div v-if="chapterForm.downloadUrl" class="cover-meta">已设置课件资料：{{ chapterForm.downloadUrl }}</div>
              <div v-if="chapterForm.previewImages.length" class="cover-meta">
                已生成课件页预览：{{ chapterForm.previewImages.length }} 页。小程序会直接显示在视频下方。
              </div>
              <div v-if="chapterForm.downloadUrl && !chapterForm.downloadFileId" class="cover-meta warning">
                当前资料缺少云文件 ID，请重新上传文档后保存章节，否则真机可能无法打开。
              </div>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="chapterForm.status">
                <el-option label="草稿" value="draft" />
                <el-option label="已上架" value="published" />
                <el-option label="已下架" value="offline" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveChapter">保存章节</el-button>
              <el-button @click="resetChapterForm">清空</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="chapterRows" class="data-table">
            <el-table-column prop="title" label="章节标题" min-width="160" />
            <el-table-column label="课程" min-width="180">
              <template #default="{ row }">{{ courseName(row.courseId) }}</template>
            </el-table-column>
            <el-table-column prop="vodFileId" label="VOD FileId" min-width="170" />
            <el-table-column prop="originalPlayUrl" label="原始播放地址" min-width="220" show-overflow-tooltip />
            <el-table-column label="时长" width="90">
              <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
            </el-table-column>
            <el-table-column label="课件" width="90">
              <template #default="{ row }">{{ coursewareCount(row) }} 项</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="editChapter(row)">编辑</el-button>
                <el-button link type="danger" @click="removeChapter(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="activeMenu === 'redeem'" class="panel">
        <el-alert
          :title="cloudReady ? '当前是云端模式：生成的培训授权码会写入云数据库。' : '当前是本地模拟：不能生成有效授权码，请先完成右上角云端配置。'"
          :type="cloudReady ? 'success' : 'warning'"
          show-icon
          :closable="false"
        />

        <div class="panel-grid redeem-grid">
          <el-form class="edit-form" label-width="96px">
            <div class="form-title">生成培训授权码</div>
            <el-form-item label="授权课程">
              <el-select v-model="redeemForm.courseIds" multiple placeholder="请选择授权课程">
                <el-option v-for="course in trainingCourses" :key="course.id" :label="course.title" :value="course.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="培训权限">
              <el-select v-model="redeemForm.level">
                <el-option label="基础权限" value="normal" />
                <el-option label="一级权限" value="vip1" />
                <el-option label="二级权限" value="vip2" />
                <el-option label="三级权限" value="vip3" />
              </el-select>
            </el-form-item>
            <el-form-item label="使用次数">
              <el-input-number v-model="redeemForm.maxUses" :min="1" :step="1" />
            </el-form-item>
            <el-form-item label="自定义码">
              <el-input v-model="redeemForm.code" placeholder="可留空，系统自动生成" />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="redeemForm.note" placeholder="例如：内部培训授权" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="redeemSaving" @click="createRedeemCode">生成授权码</el-button>
              <el-button @click="resetRedeemForm">清空</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="redeemRows" class="data-table">
            <el-table-column label="授权码" width="160" fixed="left">
              <template #default="{ row }">
                <span class="code-pill">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column label="兑换时间" width="170" fixed="left">
              <template #default="{ row }">
                {{ formatRedeemTime(row) }}
              </template>
            </el-table-column>
            <el-table-column label="课程" min-width="220">
              <template #default="{ row }">{{ redeemCourseNames(row.courseIds) }}</template>
            </el-table-column>
            <el-table-column label="权限" width="110">
              <template #default="{ row }">{{ formatLevel(row.level) }}</template>
            </el-table-column>
            <el-table-column label="次数" width="90">
              <template #default="{ row }">{{ row.usedCount }}/{{ row.maxUses }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">{{ redeemStatusLabel(row.status) }}</template>
            </el-table-column>
            <el-table-column prop="note" label="备注" min-width="150" />
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="copyRedeemCode(row)">复制</el-button>
                <el-button link type="danger" @click="disableRedeem(row)">停用</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

      </section>

      <section v-else class="panel">
        <el-table :data="userRows" class="data-table">
          <el-table-column prop="nickname" label="昵称" min-width="130" />
          <el-table-column prop="phone" label="手机号" min-width="130" />
          <el-table-column prop="wechatId" label="微信号" min-width="130" />
          <el-table-column prop="openid" label="openid" min-width="220" />
          <el-table-column prop="courseCount" label="已开课" width="90" />
        </el-table>
      </section>
    </main>

    <el-dialog v-model="cloudDialogOpen" title="云端配置" width="520px">
      <el-alert
        title="这里只用于本地管理后台调用云函数。后台 Token 请只填在自己电脑上，不要发给别人。"
        type="warning"
        show-icon
        :closable="false"
      />
      <el-form class="cloud-form" label-width="110px">
        <el-form-item label="环境 ID">
          <el-input v-model="cloudConfig.env" placeholder="例如 your-env-id" />
        </el-form-item>
        <el-form-item label="后台 Token">
          <el-input v-model="cloudConfig.adminToken" type="password" show-password placeholder="与 admin 云函数环境变量 ADMIN_TOKEN 一致" />
        </el-form-item>
        <el-form-item label="后台 HTTP">
          <el-input v-model="cloudConfig.adminApiUrl" placeholder="例如 https://...tcloudbase.com/admin" />
          <div class="form-hint">优先使用 HTTP 通道，避免网页后台被匿名登录权限卡住。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cloudDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="saveCloudConfig">保存配置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue"
import { ElMessage } from "element-plus"
import cloudbase from "@cloudbase/js-sdk"
import * as pdfjsLib from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const DEFAULT_ADMIN_API_URL = "https://your-env-id-0000000000.ap-shanghai.app.tcloudbase.com/admin"
const COVER_UPLOAD_MAX_BYTES = 160 * 1024
const COVER_UPLOAD_MAX_EDGE = 640
const DOCUMENT_DIRECT_UPLOAD_MAX_BYTES = 30 * 1024 * 1024
const DOCUMENT_CHUNK_BYTES = 64 * 1024
const PDF_PREVIEW_MAX_PAGES = 12
const PDF_PREVIEW_TARGET_WIDTH = 860
const PDF_PREVIEW_MAX_BYTES = 260 * 1024

const activeMenu = ref("courses")
const cloudDialogOpen = ref(false)
const adminSyncing = ref(false)
const vodDurationSyncing = ref(false)
const redeemSaving = ref(false)
const levelAccessSaving = ref(false)
const coverUploading = ref(false)
const courseCoverInput = ref(null)
const courseCoverPreviewUrl = ref("")
const chapterPosterInput = ref(null)
const chapterImageInput = ref(null)
const chapterDocumentInput = ref(null)
const chapterUploadLoading = reactive({
  poster: false,
  image: false,
  document: false
})

const cloudConfig = reactive({
  env: "your-env-id",
  adminToken: "",
  adminApiUrl: DEFAULT_ADMIN_API_URL
})

let cloudApp = null
let cloudLoginPromise = null

const emptyCourse = {
  id: "",
  title: "",
  subtitle: "",
  accessType: "internal",
  price: 0,
  originalPrice: 0,
  sort: 1,
  coverUrl: "",
  description: "",
  status: "published"
}

const emptyChapter = {
  id: "",
  courseId: "course_paid_001",
  title: "",
  summary: "",
  sort: 1,
  vodFileId: "",
  originalPlayUrl: "",
  poster: "",
  duration: 0,
  isTrial: false,
  note: "",
  imageUrl: "",
  resourceUrl: "",
  commandUrl: "",
  downloadUrl: "",
  downloadFileId: "",
  previewImages: [],
  status: "published"
}

const courseForm = reactive({ ...emptyCourse })
const chapterForm = reactive({ ...emptyChapter })

const accessForm = reactive({
  courseId: "course_paid_001",
  identifierType: "phone",
  identifierValue: "",
  paidAmount: 0,
  note: "内部培训人工授权"
})

const emptyRedeem = {
  courseIds: ["course_paid_001"],
  level: "vip1",
  paidAmount: 0,
  maxUses: 1,
  code: "",
  note: "内部培训授权"
}

const redeemForm = reactive({ ...emptyRedeem })
const memberLevels = [
  { value: "normal", label: "基础权限" },
  { value: "vip1", label: "一级权限" },
  { value: "vip2", label: "二级权限" },
  { value: "vip3", label: "三级权限" }
]
const memberLevelAccess = reactive({
  normal: [],
  vip1: [],
  vip2: [],
  vip3: []
})

const courseRows = ref([
  {
    id: "course_paid_001",
    title: "AI 短视频实战训练营",
    subtitle: "从选题到发布的完整流程",
    price: 0,
    accessType: "internal",
    coverUrl: "",
    description: "内部培训课程，按授权范围开放。",
    status: "published"
  },
  {
    id: "course_free_001",
    title: "内部资料培训课",
    subtitle: "组织内部学习资料",
    price: 0,
    accessType: "internal",
    coverUrl: "",
    description: "内部培训资料，按授权范围开放。",
    status: "published"
  }
])

const chapterRows = ref([
  {
    id: "chapter_001",
    courseId: "course_paid_001",
    title: "第一课：课程介绍",
    vodFileId: "YOUR_VOD_FILE_ID",
    originalPlayUrl: "https://example.com/vod/demo-placeholder.mp4",
    duration: 867,
    isTrial: false,
    note: "本节讲解课程交付流程和学习方式。",
    imageUrl: "",
    resourceUrl: "https://example.com/course-resource",
    status: "published"
  }
])

const accessRows = ref([
  {
    id: "access_001",
    courseId: "course_paid_001",
    identifierType: "phone",
    identifierValue: "13800138000",
    paidAmount: 0,
    note: "内部培训人工授权",
    status: "active"
  }
])

const redeemRows = ref([
  {
    id: "redeem_test_001",
    code: "YQXVIP1",
    courseIds: ["course_paid_001"],
    level: "vip1",
    maxUses: 1,
    usedCount: 0,
    paidAmount: 0,
    note: "测试授权码，开通第一门培训和一级权限",
    status: "active"
  }
])

const userRows = ref([
  {
    nickname: "微信用户",
    phone: "13800138000",
    wechatId: "demo_wechat",
    openid: "openid_demo_001",
    courseCount: 1
  }
])

Object.assign(courseForm, courseRows.value[0])
Object.assign(chapterForm, chapterRows.value[0])

const trainingCourses = computed(() => courseRows.value)
const cloudReady = computed(() => Boolean(cloudConfig.adminToken && (cloudConfig.adminApiUrl || cloudConfig.env)))

const title = computed(() => {
  const map = {
    courses: "课程管理",
    chapters: "章节课件",
    redeem: "培训授权码",
    users: "用户列表"
  }
  return map[activeMenu.value]
})

const subtitle = computed(() => {
  const map = {
    courses: "维护内部培训内容和上架状态",
    chapters: "绑定 VOD FileId，维护课件文字、截图和资料链接",
    redeem: "生成培训授权码并查看授权记录",
    users: "查看微信登录用户和培训授权状态"
  }
  return map[activeMenu.value]
})

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`
}

function loadCloudConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("yqx_admin_cloud_config") || "{}")
    cloudConfig.env = saved.env || cloudConfig.env
    cloudConfig.adminToken = saved.adminToken || ""
    cloudConfig.adminApiUrl = saved.adminApiUrl || cloudConfig.adminApiUrl
  } catch {
    cloudConfig.adminToken = ""
  }
}

async function saveCloudConfig() {
  localStorage.setItem("yqx_admin_cloud_config", JSON.stringify({
    env: cloudConfig.env.trim(),
    adminToken: cloudConfig.adminToken,
    adminApiUrl: cloudConfig.adminApiUrl.trim()
  }))
  cloudApp = null
  cloudLoginPromise = null
  cloudDialogOpen.value = false
  ElMessage.success("云端配置已保存")
  await syncAdminData()
}

function getCloudApp() {
  if (!cloudReady.value) return null
  if (!cloudApp) {
    cloudApp = cloudbase.init({
      env: cloudConfig.env.trim()
    })
  }
  return cloudApp
}

async function ensureCloudLogin() {
  const app = getCloudApp()
  if (!app) {
    throw new Error("请先完成云端配置")
  }

  if (!cloudLoginPromise) {
    cloudLoginPromise = (async () => {
      const auth = app.auth({ persistence: "local" })
      const loginState = await auth.getLoginState()
      if (loginState) return loginState

      const signInResult = await auth.signInAnonymously()
      if (signInResult?.error) {
        throw new Error(signInResult.error?.message || "云开发匿名登录失败")
      }

      return signInResult?.data || signInResult
    })().catch((err) => {
      cloudLoginPromise = null
      throw err
    })
  }

  await cloudLoginPromise
  return app
}

function translateCloudError(err, fallback = "云端调用失败，请稍后重试") {
  const message = String(err?.message || err || "")

  if (message.includes("EXCEED_AUTHORITY") || message.includes("Request exceeds granted authority")) {
    return "云函数调用权限不足：请在云开发控制台开启匿名登录，并允许已登录用户访问 admin 云函数。设置后等待 1-3 分钟，再刷新后台重试。"
  }

  if (message.includes("scope") || message.includes("INVALID_AUTH")) {
    cloudLoginPromise = null
    return "网页后台云开发登录态失效，请刷新页面后重试。"
  }

  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "后台 HTTP 地址访问失败，请检查云端配置里的后台 HTTP 地址，或确认 CloudBase 已添加 /admin 路由。"
  }

  if (message.includes("Payload Too Large") || message.includes("413")) {
    return "单次上传请求仍被后台拦截：我已改为更小分片，请刷新后台后重试；如果仍出现，请确认 admin 云函数已重新上传。"
  }

  if (message.includes("UNAUTHORIZED")) {
    return "后台 Token 不正确，或 admin 云函数的 ADMIN_TOKEN 环境变量还没保存生效。"
  }

  if (message.includes("ADMIN_TOKEN_MISSING")) {
    return "admin 云函数缺少 ADMIN_TOKEN 环境变量，请先在云函数配置里添加。"
  }

  if (message.includes("FUNCTION_NOT_FOUND")) {
    return "云函数不存在或还没上传成功，请重新上传 admin 云函数。"
  }

  if (message.includes("timeout")) {
    return "云端请求超时，请检查网络后重试。"
  }

  return message || fallback
}

function normalizeErrorMessage(err) {
  if (!err) return "未知原因"
  if (typeof err === "string") return err
  return err.message || err.errMsg || err.error?.message || JSON.stringify(err)
}

async function callAdminViaHttp(action, data = {}) {
  const url = String(cloudConfig.adminApiUrl || "").trim()
  if (!url) {
    throw new Error("请先填写后台 HTTP 地址")
  }

  let response
  let payload
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        adminToken: cloudConfig.adminToken,
        ...data
      })
    })

    const text = await response.text()
    payload = text ? JSON.parse(text) : {}
  } catch (err) {
    throw new Error(translateCloudError(err, "后台 HTTP 调用失败，请检查 /admin 路由是否已配置。"))
  }

  if (!response.ok && !payload?.ok) {
    throw new Error(translateCloudError(payload?.error?.message || response.statusText, "后台 HTTP 调用失败"))
  }

  if (!payload?.ok) {
    throw new Error(translateCloudError(payload?.error?.message, "云函数调用失败"))
  }

  return payload.data
}

async function callAdminViaFunction(action, data = {}) {
  const app = await ensureCloudLogin()

  let result
  try {
    result = await app.callFunction({
      name: "admin",
      data: {
        action,
        adminToken: cloudConfig.adminToken,
        ...data
      }
    })
  } catch (err) {
    throw new Error(translateCloudError(err, "云端调用失败，请检查云开发权限或稍后重试"))
  }

  const payload = result.result
  if (!payload) {
    throw new Error("云函数无返回")
  }

  if (!payload.ok) {
    throw new Error(translateCloudError(payload.error?.message, "云函数调用失败"))
  }

  return payload.data
}

async function callAdmin(action, data = {}) {
  if (String(cloudConfig.adminApiUrl || "").trim()) {
    return await callAdminViaHttp(action, data)
  }

  return await callAdminViaFunction(action, data)
}

function normalizeRecord(row) {
  return {
    ...row,
    id: row.id || row._id
  }
}

function normalizeChapterRecord(row) {
  const record = normalizeRecord(row)
  const courseware = Array.isArray(record.courseware) ? record.courseware : []
  const downloadLinks = Array.isArray(record.downloadLinks) ? record.downloadLinks : []
  const textItem = courseware.find((item) => item.type === "text")
  const imageItems = courseware.filter((item) => item.type === "image")
  const previewImages = Array.isArray(record.previewImages) && record.previewImages.length
    ? record.previewImages
    : imageItems
      .filter((item) => item.role === "courseware-preview" || String(item.title || "").includes("课件预览"))
      .map((item) => item.url)
      .filter(Boolean)
  const imageItem = imageItems.find((item) => item.role !== "courseware-preview" && !String(item.title || "").includes("课件预览"))
  const linkItem = courseware.find((item) => item.type === "link")
  const downloadItem = downloadLinks[0]
  const downloadUrl = record.downloadUrl || downloadItem?.url || ""
  const downloadFileId = record.downloadFileId || downloadItem?.fileId || downloadItem?.fileID ||
    (String(downloadUrl).startsWith("cloud://") ? downloadUrl : "")

  return {
    ...record,
    note: record.note || textItem?.content || "",
    imageUrl: record.imageUrl || imageItem?.url || "",
    commandUrl: record.commandUrl || linkItem?.url || record.resourceUrl || "",
    downloadUrl,
    downloadFileId,
    previewImages
  }
}

function buildChapterPayload(form) {
  const note = form.note.trim()
  const imageUrl = form.imageUrl.trim()
  const downloadUrl = form.downloadUrl.trim()
  const downloadFileId = String(form.downloadFileId || "").trim() ||
    (downloadUrl.startsWith("cloud://") ? downloadUrl : "")
  const previewImages = Array.isArray(form.previewImages)
    ? form.previewImages.map((url) => String(url || "").trim()).filter(Boolean)
    : []
  const courseware = []
  const downloadLinks = []

  if (note) {
    courseware.push({
      type: "text",
      title: "本节重点",
      content: note
    })
  }

  if (imageUrl) {
    courseware.push({
      type: "image",
      title: "操作截图",
      url: imageUrl,
      caption: "本节配套操作截图"
    })
  }

  previewImages.forEach((url, index) => {
    courseware.push({
      type: "image",
      role: "courseware-preview",
      title: index === 0 ? "课件预览" : "",
      url,
      caption: `第 ${index + 1} 页`
    })
  })

  if (downloadUrl) {
    downloadLinks.push({
      title: "课件资料",
      url: downloadUrl,
      fileId: downloadFileId
    })
  }

  return {
    ...form,
    note,
    imageUrl,
    resourceUrl: "",
    commandUrl: "",
    downloadUrl,
    downloadFileId,
    previewImages,
    courseware,
    downloadLinks
  }
}

async function syncAdminData(showSuccess = true) {
  if (!cloudReady.value) return

  adminSyncing.value = true
  try {
    const [courses, chapters, redeem, users] = await Promise.all([
      callAdmin("listCourses", { limit: 200 }),
      callAdmin("listChapters", { limit: 300 }),
      callAdmin("listRedeemCodes", { limit: 100 }),
      callAdmin("listUsers", { limit: 100 })
    ])

    courseRows.value = (courses.list || []).map(normalizeRecord)
    chapterRows.value = (chapters.list || []).map(normalizeChapterRecord)
    redeemRows.value = (redeem.list || []).map(normalizeRecord)
    userRows.value = (users.list || []).map(normalizeRecord).map((user) => ({
      ...user,
      courseCount: Number(user.courseCount || 0)
    }))

    if (courseRows.value.length > 0 && !courseRows.value.some((course) => course.id === courseForm.id)) {
      copyInto(courseForm, courseRows.value[0])
    }

    if (chapterRows.value.length > 0 && !chapterRows.value.some((chapter) => chapter.id === chapterForm.id)) {
      copyInto(chapterForm, chapterRows.value[0])
    }

    if (showSuccess) {
      ElMessage.success("云端数据已刷新")
    }
  } catch (err) {
    ElMessage.error(err.message || "云端数据刷新失败")
  } finally {
    adminSyncing.value = false
  }
}

async function syncVodDurations() {
  if (!cloudReady.value || vodDurationSyncing.value) return

  vodDurationSyncing.value = true
  try {
    const result = await callAdmin("syncVodChapterDurations", { limit: 300 })
    await syncAdminData(false)
    ElMessage.success(`VOD 时长同步完成，已更新 ${result.updatedCount || 0} 个章节`)
  } catch (err) {
    ElMessage.error(err.message || "VOD 时长同步失败")
  } finally {
    vodDurationSyncing.value = false
  }
}

function copyInto(target, source) {
  Object.keys(target).forEach((key) => {
    target[key] = source[key] ?? ""
  })
}

function applyMemberLevelAccess(list = []) {
  memberLevels.forEach((level) => {
    const item = list.find((row) => row.level === level.value)
    memberLevelAccess[level.value] = Array.isArray(item?.courseIds)
      ? [...item.courseIds]
      : []
  })
}

function resetCourseForm() {
  copyInto(courseForm, emptyCourse)
  courseCoverPreviewUrl.value = ""
}

function resetChapterForm() {
  copyInto(chapterForm, {
    ...emptyChapter,
    courseId: courseRows.value[0]?.id || ""
  })
}

function triggerCourseCoverSelect() {
  if (!cloudReady.value) {
    ElMessage.warning("请先完成云端配置，再上传封面")
    return
  }

  courseCoverInput.value?.click()
}

function triggerChapterPosterSelect() {
  if (!cloudReady.value) {
    ElMessage.warning("请先完成云端配置，再上传视频封面")
    return
  }

  chapterPosterInput.value?.click()
}

function triggerChapterImageSelect() {
  if (!cloudReady.value) {
    ElMessage.warning("请先完成云端配置，再上传课件截图")
    return
  }

  chapterImageInput.value?.click()
}

function triggerChapterDocumentSelect() {
  if (!cloudReady.value) {
    ElMessage.warning("请先完成云端配置，再上传课件资料")
    return
  }

  chapterDocumentInput.value?.click()
}

function getFileExtension(fileName = "") {
  const ext = fileName.split(".").pop() || "png"
  return ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      resolve(result.split(",").pop() || "")
    }
    reader.onerror = () => reject(new Error("文件读取失败，请重新选择文件"))
    reader.readAsDataURL(file)
  })
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("封面图片读取失败"))
    }

    image.src = url
  })
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      reject(new Error("封面图片压缩失败"))
    }, "image/jpeg", quality)
  })
}

async function compressCoverImage(file) {
  const image = await loadImageFromFile(file)
  const ratio = Math.min(1, COVER_UPLOAD_MAX_EDGE / Math.max(image.width, image.height))
  let width = Math.max(1, Math.round(image.width * ratio))
  let height = Math.max(1, Math.round(image.height * ratio))
  let quality = 0.74
  let blob = null

  for (let index = 0; index < 12; index += 1) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")

    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    blob = await canvasToBlob(canvas, quality)
    if (blob.size <= COVER_UPLOAD_MAX_BYTES) {
      return blob
    }

    width = Math.max(1, Math.round(width * 0.82))
    height = Math.max(1, Math.round(height * 0.82))
    quality = Math.max(0.42, quality - 0.06)
  }

  throw new Error("封面图压缩后仍然过大，请换一张更小的图片")
}

async function uploadCourseCover(event) {
  const file = event.target.files?.[0]
  event.target.value = ""
  if (!file) return

  if (!file.type.startsWith("image/")) {
    ElMessage.warning("请选择图片文件")
    return
  }

  if (file.size > 8 * 1024 * 1024) {
    ElMessage.warning("封面图请控制在 8MB 以内")
    return
  }

  if (courseCoverPreviewUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(courseCoverPreviewUrl.value)
  }
  courseCoverPreviewUrl.value = URL.createObjectURL(file)

  coverUploading.value = true
  try {
    const compressedCover = await compressCoverImage(file)
    if (compressedCover.size > COVER_UPLOAD_MAX_BYTES) {
      throw new Error("封面图压缩后仍然过大，请换一张更小的图片")
    }

    const result = await callAdmin("uploadCourseCover", {
      fileName: `${(file.name || "cover").replace(/\.[^.]+$/, "")}.jpg`,
      fileBase64: await readFileAsBase64(compressedCover),
      contentType: "image/jpeg"
    })
    courseForm.coverUrl = result.fileID || ""
    ElMessage.success(`封面已压缩到 ${Math.ceil(compressedCover.size / 1024)}KB 并上传，保存课程后生效`)
  } catch (err) {
    ElMessage.error(err.message || "封面上传失败")
  } finally {
    coverUploading.value = false
  }
}

async function uploadChapterImageAsset({ event, target, loadingKey, applyUrl, successText }) {
  const file = event.target.files?.[0]
  event.target.value = ""
  if (!file) return

  if (!file.type.startsWith("image/")) {
    ElMessage.warning("请选择图片文件")
    return
  }

  if (file.size > 8 * 1024 * 1024) {
    ElMessage.warning("图片请控制在 8MB 以内")
    return
  }

  chapterUploadLoading[loadingKey] = true
  try {
    const compressedImage = await compressCoverImage(file)
    if (compressedImage.size > COVER_UPLOAD_MAX_BYTES) {
      throw new Error("图片压缩后仍然过大，请换一张更小的图片")
    }

    const result = await callAdmin("uploadAdminAsset", {
      target,
      fileName: `${(file.name || "image").replace(/\.[^.]+$/, "")}.jpg`,
      fileBase64: await readFileAsBase64(compressedImage),
      contentType: "image/jpeg"
    })

    applyUrl(result.fileID || "")
    ElMessage.success(`${successText}，已压缩到 ${Math.ceil(compressedImage.size / 1024)}KB，保存章节后生效`)
  } catch (err) {
    ElMessage.error(err.message || "图片上传失败")
  } finally {
    chapterUploadLoading[loadingKey] = false
  }
}

async function uploadChapterPoster(event) {
  await uploadChapterImageAsset({
    event,
    target: "chapter-poster",
    loadingKey: "poster",
    applyUrl: (url) => {
      chapterForm.poster = url
    },
    successText: "视频封面已上传"
  })
}

async function uploadChapterImage(event) {
  await uploadChapterImageAsset({
    event,
    target: "chapter-image",
    loadingKey: "image",
    applyUrl: (url) => {
      chapterForm.imageUrl = url
    },
    successText: "课件截图已上传"
  })
}

function isSupportedDocument(file) {
  const ext = getFileExtension(file.name || "")
  return ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "zip", "rar"].includes(ext)
}

function safeStorageFileName(fileName = "document") {
  const ext = getFileExtension(fileName)
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "document"

  return `${base}.${ext}`
}

function safeStorageBaseName(fileName = "document") {
  return safeStorageFileName(fileName).replace(/\.[^.]+$/, "") || "document"
}

function isPdfFile(file) {
  return getFileExtension(file.name || "") === "pdf"
}

function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }
  return `${Math.ceil(bytes / 1024)}KB`
}

async function makePdfPreviewBlob(sourceCanvas) {
  let canvas = sourceCanvas
  let quality = 0.78

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const blob = await canvasToBlob(canvas, quality)
    if (blob.size <= PDF_PREVIEW_MAX_BYTES) {
      return blob
    }

    if (quality > 0.52) {
      quality = Math.max(0.52, quality - 0.08)
      continue
    }

    const nextCanvas = document.createElement("canvas")
    nextCanvas.width = Math.max(1, Math.round(canvas.width * 0.84))
    nextCanvas.height = Math.max(1, Math.round(canvas.height * 0.84))
    const context = nextCanvas.getContext("2d")
    if (!context) {
      throw new Error("课件预览图生成失败")
    }
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, nextCanvas.width, nextCanvas.height)
    context.drawImage(canvas, 0, 0, nextCanvas.width, nextCanvas.height)

    if (canvas !== sourceCanvas) {
      canvas.width = 0
      canvas.height = 0
    }
    canvas = nextCanvas
    quality = 0.72
  }

  throw new Error("课件预览图压缩后仍然过大")
}

async function uploadPdfPreviewImage(blob, fileName, pageNumber) {
  return await uploadFileViaAdminChunks(blob, {
    target: "chapter-image",
    fileName: `${safeStorageBaseName(fileName)}-page-${String(pageNumber).padStart(2, "0")}.jpg`,
    contentType: "image/jpeg",
    uploadPrefix: "preview"
  })
}

function withTimeout(promise, ms, message) {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeoutPromise])
    .finally(() => {
      if (timer) {
        window.clearTimeout(timer)
      }
    })
}

async function renderPdfPreviewImages(file) {
  if (!isPdfFile(file)) {
    return []
  }

  let previewMessage = null
  const showPreviewProgress = (message) => {
    previewMessage?.close?.()
    previewMessage = ElMessage({
      message,
      duration: 0
    })
  }

  showPreviewProgress("正在读取 PDF，请稍等...")
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer())
  })

  try {
    const pdf = await withTimeout(
      loadingTask.promise,
      30000,
      "PDF 读取超时，请换一个页数更少或体积更小的课件文件"
    )
    const pageCount = Math.min(pdf.numPages, PDF_PREVIEW_MAX_PAGES)
    const previewImages = []

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      showPreviewProgress(`正在生成课件预览：第 ${pageNumber}/${pageCount} 页`)
      const page = await withTimeout(
        pdf.getPage(pageNumber),
        15000,
        `读取第 ${pageNumber} 页超时`
      )
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2, PDF_PREVIEW_TARGET_WIDTH / baseViewport.width)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)

      const context = canvas.getContext("2d")
      if (!context) {
        throw new Error("课件预览图生成失败")
      }

      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      await withTimeout(
        page.render({ canvasContext: context, viewport }).promise,
        20000,
        `生成第 ${pageNumber} 页预览图超时`
      )

      const blob = await makePdfPreviewBlob(canvas)
      canvas.width = 0
      canvas.height = 0

      showPreviewProgress(`正在上传课件预览：第 ${pageNumber}/${pageCount} 页`)
      const fileID = await withTimeout(
        uploadPdfPreviewImage(blob, file.name || "courseware.pdf", pageNumber),
        30000,
        `上传第 ${pageNumber} 页预览图超时`
      )
      if (fileID) {
        previewImages.push(fileID)
      }
    }

    if (pdf.numPages > PDF_PREVIEW_MAX_PAGES) {
      ElMessage.warning(`课件页数较多，已先生成前 ${PDF_PREVIEW_MAX_PAGES} 页预览`)
    }

    return previewImages
  } finally {
    previewMessage?.close?.()
    await loadingTask.destroy?.()
  }
}

function normalizeUploadFileId(result) {
  return result?.fileID || result?.fileId || result?.fileid || ""
}

async function uploadDocumentDirectly(file) {
  const app = await ensureCloudLogin()
  const cloudPath = `chapter-documents/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeStorageFileName(file.name)}`
  const result = await app.uploadFile({
    cloudPath,
    filePath: file
  })
  const fileID = normalizeUploadFileId(result)
  if (!fileID) {
    throw new Error("课件资料上传后没有返回文件地址")
  }
  return fileID
}

async function uploadFileViaAdminChunks(file, options) {
  if (!String(cloudConfig.adminApiUrl || "").trim()) {
    throw new Error("云端配置缺少后台 HTTP 地址")
  }

  const target = options.target
  const fileName = options.fileName || "document.pdf"
  const contentType = options.contentType || "application/octet-stream"
  const uploadPrefix = String(options.uploadPrefix || target || "upload").replace(/[^a-zA-Z0-9]/g, "")
  const uploadId = `${uploadPrefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const total = Math.max(1, Math.ceil(file.size / DOCUMENT_CHUNK_BYTES))

  for (let index = 0; index < total; index += 1) {
    const start = index * DOCUMENT_CHUNK_BYTES
    const end = Math.min(file.size, start + DOCUMENT_CHUNK_BYTES)
    const chunk = file.slice(start, end)
    await callAdminViaHttp("uploadAdminAssetChunk", {
      uploadId,
      index,
      total,
      target,
      fileName,
      contentType,
      chunkBase64: await readFileAsBase64(chunk)
    })
  }

  const result = await callAdminViaHttp("completeAdminAssetChunkUpload", {
    uploadId,
    total,
    target,
    fileName,
    contentType
  })

  return result.fileID || ""
}

async function uploadDocumentViaAdmin(file, directErr) {
  if (!String(cloudConfig.adminApiUrl || "").trim()) {
    throw new Error(`课件资料上传失败：云端配置缺少后台 HTTP 地址。${directErr ? `直传失败原因：${normalizeErrorMessage(directErr)}` : ""}`)
  }

  return await uploadFileViaAdminChunks(file, {
    target: "chapter-document",
    fileName: file.name || "document.pdf",
    contentType: file.type || "application/octet-stream",
    uploadPrefix: "doc"
  })
}

async function uploadChapterDocument(event) {
  const file = event.target.files?.[0]
  event.target.value = ""
  if (!file) return

  if (!isSupportedDocument(file)) {
    ElMessage.warning("请选择 PDF、Word、PPT、Excel、TXT 或压缩包文件")
    return
  }

  if (file.size > DOCUMENT_DIRECT_UPLOAD_MAX_BYTES) {
    ElMessage.warning("课件资料请控制在 30MB 以内")
    return
  }

  chapterUploadLoading.document = true
  try {
    chapterForm.previewImages = []
    const fileID = await uploadDocumentViaAdmin(file, null)
    let previewImages = []

    try {
      previewImages = await renderPdfPreviewImages(file)
    } catch (previewErr) {
      ElMessage.warning(`课件原文件已上传，但页面预览生成失败：${normalizeErrorMessage(previewErr)}`)
    }

    chapterForm.downloadUrl = fileID
    chapterForm.downloadFileId = fileID
    chapterForm.previewImages = previewImages
    ElMessage.success(`课件资料已上传（${formatFileSize(file.size)}）${previewImages.length ? `，已生成 ${previewImages.length} 页预览` : ""}，保存章节后生效`)
  } catch (err) {
    ElMessage.error(translateCloudError(err, "课件资料上传失败"))
  } finally {
    chapterUploadLoading.document = false
  }
}

async function saveCourse() {
  const title = courseForm.title.trim()
  if (!title) {
    ElMessage.warning("请先填写课程标题")
    return
  }

  const data = {
    ...courseForm,
    title,
    accessType: "internal",
    price: 0,
    originalPrice: 0,
    sort: Number(courseForm.sort || 0)
  }

  if (String(data.coverUrl || "").startsWith("data:")) {
    ElMessage.warning("封面地址异常：请不要直接粘贴图片数据，请使用“上传封面”按钮")
    return
  }

  if (cloudReady.value) {
    try {
      if (data.id) {
        await callAdmin("updateCourse", { ...data, courseId: data.id })
        ElMessage.success("云端课程已更新")
      } else {
        await callAdmin("createCourse", data)
        ElMessage.success("云端课程已新增")
      }
      await syncAdminData(false)
    } catch (err) {
      ElMessage.error(err.message || "课程保存失败")
    }
    return
  }

  if (data.id) {
    const index = courseRows.value.findIndex((course) => course.id === data.id)
    if (index >= 0) courseRows.value[index] = data
    ElMessage.success("课程已更新")
    return
  }

  data.id = createId("course")
  courseRows.value.unshift(data)
  copyInto(courseForm, data)
  ElMessage.success("课程已新增")
}

function editCourse(row) {
  copyInto(courseForm, row)
  courseCoverPreviewUrl.value = ""
  activeMenu.value = "courses"
}

function createChapterForCourse(row) {
  copyInto(chapterForm, {
    ...emptyChapter,
    courseId: row.id,
    sort: countChapters(row.id) + 1
  })
  activeMenu.value = "chapters"
}

async function removeCourse(row) {
  const hasChapters = chapterRows.value.some((chapter) => chapter.courseId === row.id)
  if (hasChapters) {
    ElMessage.warning("这个课程下面还有章节，先删除或迁移章节")
    return
  }

  if (cloudReady.value) {
    try {
      await callAdmin("deleteCourse", { courseId: row.id })
      await syncAdminData(false)
      ElMessage.success("云端课程已删除")
    } catch (err) {
      ElMessage.error(err.message || "课程删除失败")
    }
    return
  }

  courseRows.value = courseRows.value.filter((course) => course.id !== row.id)
  if (courseForm.id === row.id) resetCourseForm()
  ElMessage.success("课程已删除")
}

async function saveChapter() {
  const title = chapterForm.title.trim()
  if (!chapterForm.courseId) {
    ElMessage.warning("请选择所属课程")
    return
  }

  if (!title) {
    ElMessage.warning("请先填写章节标题")
    return
  }

  const data = {
    ...buildChapterPayload(chapterForm),
    title,
    sort: Number(chapterForm.sort || 0),
    duration: Number(chapterForm.duration || 0)
  }

  if ([data.poster, data.imageUrl].some((url) => String(url || "").startsWith("data:"))) {
    ElMessage.warning("图片地址异常：请不要直接粘贴图片数据，请使用上传按钮")
    return
  }

  if (String(data.downloadUrl || "").startsWith("data:")) {
    ElMessage.warning("课件资料地址异常：请使用“上传文档”按钮，不要直接粘贴文件数据")
    return
  }

  if (cloudReady.value) {
    try {
      if (data.id) {
        await callAdmin("updateChapter", { ...data, chapterId: data.id })
        ElMessage.success("云端章节已更新")
      } else {
        await callAdmin("createChapter", data)
        ElMessage.success("云端章节已新增")
      }
      await syncAdminData(false)
    } catch (err) {
      ElMessage.error(err.message || "章节保存失败")
    }
    return
  }

  if (data.id) {
    const index = chapterRows.value.findIndex((chapter) => chapter.id === data.id)
    if (index >= 0) chapterRows.value[index] = data
    ElMessage.success("章节已更新")
    return
  }

  data.id = createId("chapter")
  chapterRows.value.unshift(data)
  copyInto(chapterForm, data)
  ElMessage.success("章节已新增")
}

function editChapter(row) {
  copyInto(chapterForm, normalizeChapterRecord(row))
  activeMenu.value = "chapters"
}

async function removeChapter(row) {
  if (cloudReady.value) {
    try {
      await callAdmin("deleteChapter", { chapterId: row.id })
      await syncAdminData(false)
      ElMessage.success("云端章节已删除")
    } catch (err) {
      ElMessage.error(err.message || "章节删除失败")
    }
    return
  }

  chapterRows.value = chapterRows.value.filter((chapter) => chapter.id !== row.id)
  if (chapterForm.id === row.id) resetChapterForm()
  ElMessage.success("章节已删除")
}

async function grantAccess() {
  const identifierValue = accessForm.identifierValue.trim()
  if (!accessForm.courseId) {
    ElMessage.warning("请选择课程")
    return
  }

  if (!identifierValue) {
    ElMessage.warning("请输入授权标识")
    return
  }

  if (accessForm.identifierType === "phone" && !/^1\d{10}$/.test(identifierValue)) {
    ElMessage.warning("手机号需要是 11 位")
    return
  }

  if (cloudReady.value) {
    try {
      await callAdmin("grantCourseAccess", {
        courseId: accessForm.courseId,
        identifierType: accessForm.identifierType,
        identifierValue,
        paidAmount: 0,
        note: accessForm.note
      })
      accessForm.identifierValue = ""
      await syncAdminData(false)
      ElMessage.success("云端人工授权已添加")
    } catch (err) {
      ElMessage.error(err.message || "人工授权失败")
    }
    return
  }

  const row = {
    id: createId("access"),
    courseId: accessForm.courseId,
    identifierType: accessForm.identifierType,
    identifierValue,
    paidAmount: 0,
    note: accessForm.note,
    status: "active"
  }

  accessRows.value.unshift(row)
  accessForm.identifierValue = ""
  ElMessage.success("已添加人工授权")
}

function resetRedeemForm() {
  redeemForm.courseIds = [...emptyRedeem.courseIds]
  redeemForm.level = emptyRedeem.level
  redeemForm.maxUses = emptyRedeem.maxUses
  redeemForm.code = ""
  redeemForm.note = emptyRedeem.note
}

function generateRedeemCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let index = 0; index < 8; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return `YQX${code}`
}

async function createRedeemCode() {
  if (!cloudReady.value) {
    ElMessage.error("当前是本地模拟，不能生成有效授权码。请先完成右上角云端配置")
    return
  }

  const courseIds = Array.isArray(redeemForm.courseIds) ? redeemForm.courseIds : []
  const level = redeemForm.level || "normal"

  if (courseIds.length === 0 && level === "normal") {
    ElMessage.warning("请选择课程或培训权限")
    return
  }

  const code = String(redeemForm.code || generateRedeemCode()).trim().toUpperCase().replace(/[\s-]/g, "")
  const existed = redeemRows.value.some((row) => row.code === code)
  if (existed) {
    ElMessage.warning("授权码已存在，请换一个")
    return
  }

  redeemSaving.value = true

  try {
    const data = await callAdmin("createRedeemCode", {
      code: redeemForm.code ? code : "",
      courseIds,
      level,
      maxUses: Math.max(1, Number(redeemForm.maxUses || 1)),
      paidAmount: 0,
      note: redeemForm.note
    })
    const createdCode = data.code || code
    const latest = await callAdmin("listRedeemCodes", { limit: 100 })
    redeemRows.value = (latest.list || []).map(normalizeRecord)

    const created = redeemRows.value.some((row) => row.code === createdCode && row.status === "active")
    if (!created) {
      throw new Error("云端校验失败：授权码没有写入数据库，请不要使用这串码")
    }

    redeemForm.code = ""
    await navigator.clipboard.writeText(createdCode).catch(() => {})
    ElMessage.success(`云端授权码已生成并校验成功：${createdCode}`)
  } catch (err) {
    ElMessage.error(err.message || "生成授权码失败")
  } finally {
    redeemSaving.value = false
  }
}

async function saveMemberLevelAccess() {
  if (!cloudReady.value) {
    ElMessage.error("当前是本地模拟，不能保存等级课程配置。请先完成右上角云端配置")
    return
  }

  levelAccessSaving.value = true
  try {
    await Promise.all(memberLevels.map((level) => callAdmin("saveMemberLevelAccess", {
      level: level.value,
      courseIds: Array.isArray(memberLevelAccess[level.value])
        ? memberLevelAccess[level.value]
        : []
    })))
    ElMessage.success("培训权限课程配置已保存")
    await syncAdminData(false)
  } catch (err) {
    ElMessage.error(err.message || "培训权限课程配置保存失败")
  } finally {
    levelAccessSaving.value = false
  }
}

async function copyRedeemCode(row) {
  try {
    await navigator.clipboard.writeText(row.code)
    ElMessage.success("授权码已复制")
  } catch {
    ElMessage.info(`授权码：${row.code}`)
  }
}

async function disableRedeem(row) {
  if (cloudReady.value) {
    try {
      await callAdmin("disableRedeemCode", { redeemCodeId: row.id })
      await syncAdminData(false)
      ElMessage.success("云端授权码已停用")
    } catch (err) {
      ElMessage.error(err.message || "停用授权码失败")
    }
    return
  }

  row.status = "disabled"
  ElMessage.success("授权码已停用")
}

async function disableAccess(row) {
  if (cloudReady.value) {
    try {
      await callAdmin("disableCourseAccess", { accessId: row.id })
      await syncAdminData(false)
      ElMessage.success("云端授权已停用")
    } catch (err) {
      ElMessage.error(err.message || "停用授权失败")
    }
    return
  }

  row.status = "disabled"
  ElMessage.success("授权已停用")
}

function courseName(courseId) {
  return courseRows.value.find((course) => course.id === courseId)?.title || "未选择课程"
}

function countChapters(courseId) {
  return chapterRows.value.filter((chapter) => chapter.courseId === courseId).length
}

function coursewareCount(row) {
  const courseware = Array.isArray(row.courseware) ? row.courseware : []
  const downloadLinks = Array.isArray(row.downloadLinks) ? row.downloadLinks : []
  const fallbackItems = [row.note, row.imageUrl, row.commandUrl, row.resourceUrl, row.downloadUrl]

  return courseware.length + downloadLinks.length || fallbackItems.filter(Boolean).length
}

function statusLabel(status) {
  const map = {
    draft: "草稿",
    published: "已上架",
    offline: "已下架"
  }
  return map[status] || status
}

function identifierTypeLabel(type) {
  const map = {
    openid: "openid",
    phone: "手机号",
    wechatId: "微信号"
  }
  return map[type] || type
}

function toDateValue(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (value.$date) return toDateValue(value.$date)
  if (value.seconds) return toDateValue(Number(value.seconds) * 1000)
  if (value._seconds) return toDateValue(Number(value._seconds) * 1000)
  return null
}

function formatDateTime(value) {
  const date = toDateValue(value)
  if (!date) return "-"
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function formatRedeemTime(row) {
  if (Number(row?.usedCount || 0) <= 0) return "未兑换"
  const formatted = formatDateTime(row?.lastUsedAt)
  return formatted === "-" ? "已兑换（时间缺失）" : formatted
}

function redeemCourseNames(courseIds = []) {
  if (!courseIds.length) return "仅培训权限"
  return courseIds.map(courseName).join("、")
}

function redeemStatusLabel(status) {
  const map = {
    active: "有效",
    used: "已用完",
    disabled: "停用"
  }
  return map[status] || status
}

function formatLevel(level = "normal") {
  const map = {
    normal: "基础",
    vip1: "一级",
    vip2: "二级",
    vip3: "三级"
  }
  return map[level] || "基础"
}

function formatDuration(seconds) {
  const value = Number(seconds || 0)
  const minutes = Math.floor(value / 60)
  const rest = String(value % 60).padStart(2, "0")
  return `${minutes}:${rest}`
}

onMounted(async () => {
  loadCloudConfig()
  await syncAdminData(false)
})
</script>
