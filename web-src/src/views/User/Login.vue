<script setup>
import VueCookies from 'vue-cookies';
import {getCurrentInstance, onMounted, ref, watch, onUnmounted} from "vue";
import {useRoute, useRouter} from "vue-router";
import axios from "axios";
import QrcodeVue from 'qrcode.vue'


// 将组件注册到本地
defineOptions({
  components: {QrcodeVue}
})

// 获取 Vue 实例
const instance = getCurrentInstance();
const COMMON = instance.appContext.config.globalProperties.$COMMON;
const router = useRouter();
const content = ""
const ConfigData = ref(null)
const user = ref({
  "username": "",
  "password": "",
  "app_name": "trimemedia-web"
})
let title = COMMON.title
const route = useRoute()
const qrData = ref(null)
const isQr = ref(false)
const qrCode = ref(null)  // 存储二维码code
const qrCheckTimer = ref(null)  // 存储定时器
const rememberAccount = ref(localStorage.getItem('login_remember_account') === 'true')
const showPassword = ref(false)

const rememberedUsername = localStorage.getItem('login_username')
if (rememberAccount.value && rememberedUsername) {
  user.value.username = rememberedUsername
}


async function LoginUser() {
  let api = "/api/v1/login"
  let res = await COMMON.requests("POST", api, false, user.value)
  if (rememberAccount.value) {
    localStorage.setItem('login_remember_account', 'true')
    localStorage.setItem('login_username', user.value.username)
  } else {
    localStorage.removeItem('login_remember_account')
    localStorage.removeItem('login_username')
  }
  VueCookies.set('authorization', res.token, -1)
  VueCookies.set('Trim-MC-token', res.token, -1)
  COMMON.ShowMsg('登录成功！')
  await router.push('/');
}

async function NasLogin(code) {
  let api = "/api/v1/auth"
  let data = {
    "source": "Trim-NAS",
    "code": code
  }
  let res = await COMMON.requests("POST", api, false, data)
  VueCookies.set('authorization', res.token, -1)
  VueCookies.set('Trim-MC-token', res.token, -1)
  COMMON.ShowMsg('登录成功！')
  // 打开名为 home 的窗口（若存在，就返回它的引用）
  const parentWin = window.open('', 'home');
  if (parentWin) {
    parentWin.location.href = '/';
  }
  // window.location.href = '/' // 父窗口跳转
  window.close() // 关闭当前窗口
}

// 检查二维码登录状态
async function checkQrLoginStatus() {
  if (!qrCode.value) return;

  try {
    let api = `/api/v1/logincode/${qrCode.value}`
    let res = await COMMON.requests("GET", api, false)
    if (res.status === 'Success') {
      // 登录成功，清除定时器
      clearInterval(qrCheckTimer.value)
      qrCheckTimer.value = null

      // 设置token并跳转
      VueCookies.set('authorization', res.token, -1)
      VueCookies.set('Trim-MC-token', res.token, -1)
      COMMON.ShowMsg('登录成功！')
      await router.push('/')
    }
  } catch (error) {
    console.error('检查二维码登录状态失败:', error)
  }
}

// 开始监控二维码登录状态
function startQrLoginCheck() {
  // 清除可能存在的旧定时器
  if (qrCheckTimer.value) {
    clearInterval(qrCheckTimer.value)
    qrCheckTimer.value = null
  }

  // 每2秒检查一次登录状态
  qrCheckTimer.value = setInterval(checkQrLoginStatus, 2000)
}

// 停止监控二维码登录状态
function stopQrLoginCheck() {
  if (qrCheckTimer.value) {
    clearInterval(qrCheckTimer.value)
    qrCheckTimer.value = null
  }
  qrCode.value = null
}

async function getQr() {
  let api = "/api/v1/logincode/generate"
  let res = await COMMON.requests("PUT", api, false)
  let _code = res.code;
  if (_code === undefined || _code === null) {
    COMMON.ShowMsg('获取登录二维码失败！')
    return;
  }
  qrCode.value = _code  // 保存二维码code
  qrData.value = `fn://com.trim.tv/trim.media-center?platform=AndroidTV&osver=35&clientName=飞牛影视TV&code=${_code}&event=scanLogin&deviceName=${ConfigData.value.server_name}`
  startQrLoginCheck()  // 开始监控登录状态
}

// 监听二维码显示状态
watch(isQr, (newVal) => {
  if (newVal) {
    // 切换到二维码登录时，获取新的二维码
    getQr()
  } else {
    // 切换到账号登录时，停止监控
    stopQrLoginCheck()
  }
})

// 组件卸载时清理定时器
onUnmounted(() => {
  stopQrLoginCheck()
})

async function getConfig() {
  let api = '/api/v1/sys/config'
  ConfigData.value = await COMMON.requests("GET", api);
  if (ConfigData.value !== undefined) {
    localStorage.setItem("title", ConfigData.value.server_name)
  }
}

async function GetFnUrl() {
  const instance = axios.create()
  let api = "/api/getFnUrl"
  let res = await instance.get(api)
  return res.data;
}

async function OpenNasLogin() {
  let fnUrl = await GetFnUrl();
  window.name = 'home';
  window.open(`${fnUrl}/signin?client_id=${ConfigData.value.nas_oauth.app_id}&redirect_uri=${window.location.href}`, '_blank', 'width=600,height=400')
}

function toggleQrMode() {
  isQr.value = !isQr.value
  if (isQr.value) {
    getQr()
  }
}

function showForgotPasswordTip() {
  COMMON.ShowMsg('请通过飞牛 NAS 找回或重置账号密码')
}

onMounted(async () => {
  await getConfig();
  if (route.query.code !== undefined) {
    await NasLogin(route.query.code);
  }
})

</script>

<template>
  <n-layout-content class="login-page">
    <div class="container">
      <div class="main">
        <div class="md-card login-card">
          <div class="brand-block">
            <div class="brand-line">
              <img class="brand-logo" src="/images/fnos-logo.png" alt="飞牛影视">
            </div>
            <div class="server-title">{{ ConfigData?.server_name || 'FnTv' }}</div>
          </div>
          <h2 class="card-title">{{ isQr ? '扫码登录' : '账号登录' }}</h2>
          <div class="create-post-from" v-if="!isQr">
            <div class="form-control">
              <input v-model="user.username" type="text" name="账号" placeholder="用户名" autocomplete="username" required="">
            </div>
            <div class="form-control password-control">
              <input v-model="user.password" :type="showPassword ? 'text' : 'password'" name="密码" placeholder="密码" required=""
                     autocomplete="off" @keyup.enter="LoginUser">
              <button class="password-toggle" type="button" aria-label="切换密码显示" @click="showPassword = !showPassword">
                <i class='bx' :class="showPassword ? 'bx-show' : 'bx-hide'"></i>
              </button>
            </div>
            <div class="form-row">
              <label class="remember-row">
                <input v-model="rememberAccount" type="checkbox">
                <span>记住账号</span>
              </label>
              <button class="inline-action" type="button" @click="showForgotPasswordTip">
                忘记密码?
              </button>
            </div>
            <div class="form-control">
              <button class="btn login-btn" @click="LoginUser">登录</button>
            </div>
          </div>
          <div class="qr-section" v-if="isQr">
            <div class="qr-generator" v-if="qrData">
              <qrcode-vue
                  :value="qrData"
                  :size="280"
                  :level="'M'"
                  :render-as="'canvas'"
                  :margin="1"
                  class="qr-code"
              />
              <div class="qr-tip">请使用飞牛影视扫描二维码登录</div>
            </div>
            <div v-if="!qrData" class="qr-wrapper loading">
              <span class="loading-text">二维码加载中...</span>
            </div>
            <button class="inline-action qr-account-action" type="button" @click="toggleQrMode">
              账号登录
            </button>
          </div>
          <div class="login-options">
            <button class="btn option-btn" @click="OpenNasLogin">
              使用 NAS 登录
            </button>
          </div>
        </div>
      </div>
    </div>
  </n-layout-content>
</template>

<style scoped>
.login-page {
  position: relative;
  isolation: isolate;
  background-size: cover;
  background-position: center;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  background-color: #050607;
  background-image:
      radial-gradient(circle at 50% 48%, rgba(48, 58, 74, 0.16), rgba(0, 0, 0, 0) 34%),
      linear-gradient(rgba(0, 0, 0, 0.56), rgba(0, 0, 0, 0.74)),
      url(https://wework.qpic.cn/wwpic/893131_WTVcr3SmScqHmY2_1675911425/0);
}

.login-page::before,
.login-page::after {
  position: absolute;
  inset: 0;
  z-index: -1;
  content: "";
  pointer-events: none;
}

.login-page::before {
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: saturate(82%) brightness(0.72);
}

.login-page::after {
  background:
      linear-gradient(90deg, rgba(0, 0, 0, 0.5), transparent 22%, transparent 78%, rgba(0, 0, 0, 0.54)),
      linear-gradient(180deg, rgba(0, 0, 0, 0.5), transparent 28%, rgba(0, 0, 0, 0.52));
}

.container {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
}

.main {
  display: flex;
  justify-content: center;
  width: 100%;
}

.md-card.login-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 472px;
  max-width: calc(100vw - 32px);
  min-height: 560px;
  margin: 0 auto;
  padding: 56px 61px 58px;
  box-sizing: border-box;
  color: #fff;
  background:
      linear-gradient(146deg, rgba(55, 45, 37, 0.42), rgba(16, 17, 20, 0.88) 38%, rgba(20, 20, 22, 0.94));
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 24px;
  box-shadow: 0 26px 72px rgba(0, 0, 0, 0.46);
  backdrop-filter: saturate(142%) blur(22px);
}

.brand-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-bottom: 38px;
}

.brand-line {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
}

.brand-logo {
  display: block;
  width: 232px;
  height: auto;
  object-fit: contain;
}

.server-title {
  margin-top: 28px;
  color: rgba(255, 255, 255, 0.93);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  text-align: center;
}

.card-title {
  display: none;
  margin: 0 0 20px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
}

.create-post-from {
  width: 100%;
  flex-shrink: 0;
}

.form-control {
  margin-bottom: 16px;
  position: relative;
  width: 100%;
}

.form-control input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  color: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  outline: none;
  font-size: 16px;
  line-height: 48px;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  background: rgba(255, 255, 255, 0.12);
  box-sizing: border-box;
  -webkit-appearance: none;
}

.password-control input {
  padding-right: 44px;
}

.form-control input::placeholder {
  color: rgba(255, 255, 255, 0.58);
}

.form-control input:focus {
  border-color: rgba(10, 132, 255, 0.84);
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.16);
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: rgba(255, 255, 255, 0.62);
  background: transparent;
  border: 0;
  border-radius: 50%;
  transform: translateY(-50%);
  cursor: pointer;
}

.password-toggle:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 2px 0 28px;
}

.remember-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.66);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
  user-select: none;
}

.remember-row input {
  width: 16px;
  height: 16px;
  accent-color: #0a84ff;
}

.inline-action {
  padding: 0;
  color: rgba(255, 255, 255, 0.72);
  background: transparent;
  border: 0;
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}

.inline-action:hover {
  color: #fff;
}

.qr-section {
  width: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
}

.qr-generator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.qr-code {
  width: 238px !important;
  height: 238px !important;
  background: white;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
  flex-shrink: 0;
}

.qr-code canvas {
  width: 238px !important;
  height: 238px !important;
}

.qr-wrapper.loading {
  width: 238px;
  height: 238px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  flex-shrink: 0;
}

.loading-text {
  color: rgba(255, 255, 255, 0.72);
  font-size: 16px;
}

.qr-tip {
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  text-align: center;
  margin-top: 10px;
  flex-shrink: 0;
}

.qr-account-action {
  margin-top: 14px;
}

.login-options {
  width: 100%;
  margin-top: 18px;
  display: flex;
  flex-shrink: 0;
}

.btn {
  width: 100%;
  height: 48px;
  padding: 0 20px;
  font-size: 16px;
  font-weight: 600;
  line-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.login-btn {
  width: 100%;
  margin: 0 auto;
  display: block;
  color: white;
  background: #0a84ff;
  border: 1px solid #0a84ff;
  box-shadow: none;
}

.login-btn:hover {
  background: #2d95ff;
  border-color: #2d95ff;
}

.option-btn {
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.option-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.24);
}

@media (max-width: 768px) {
  .container {
    padding: 18px;
  }

  .md-card.login-card {
    width: 100%;
    max-width: 360px;
    min-height: auto;
    padding: 34px 24px 30px;
    margin: 0;
    border-radius: 22px;
  }

  .brand-block {
    margin-bottom: 28px;
  }

  .brand-logo {
    width: 204px;
  }

  .server-title {
    margin-top: 20px;
    font-size: 18px;
    line-height: 25px;
  }

  .qr-code {
    width: 200px !important;
    height: 200px !important;
    padding: 8px;
  }

  .qr-code canvas {
    width: 200px !important;
    height: 200px !important;
  }

  .qr-wrapper.loading {
    width: 200px;
    height: 200px;
  }

  .login-options {
    margin-top: 16px;
  }

  .form-control {
    margin-bottom: 12px;
  }

  .form-control input {
    font-size: 16px;
    height: 46px;
    line-height: 46px;
  }

  .btn {
    height: 46px;
    font-size: 15px;
    line-height: 46px;
  }
}

@media (max-width: 360px) {
  .md-card.login-card {
    padding: 28px 18px 24px;
  }

  .brand-logo {
    width: 188px;
  }

  .qr-code {
    width: 180px !important;
    height: 180px !important;
  }

  .qr-code canvas {
    width: 180px !important;
    height: 180px !important;
  }

  .qr-wrapper.loading {
    width: 180px;
    height: 180px;
  }
}
</style>
