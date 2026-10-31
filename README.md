# 让一让 · 扫码挪车 H5

> 一张二维码车贴代替手机号。别人扫码即可通知车主挪车，号码不用再印在车窗上。

移动端 H5，微信 / 支付宝 / 系统相机扫码都能打开，无需下载 App、无需注册账号。

---

## 它解决什么问题

临时停车挡住别人时，车主通常在前挡风玻璃留手机号，结果是被推销、被拍照、被诈骗盯上。
「让一让」用一张专属二维码替代号码牌：

- **访客**扫码 → 看到脱敏车牌 → 一键电话 / 短信通知车主
- **车主**扫码 → 直接进入自己的车贴管理页（无账号无密码，换机靠授权码或恢复链接）
- **车主号码不在页面上展示**，点「电话联系」才下发号码，由访客手机直接拨出

---

## 快速开始

```bash
# 1. 安装依赖（Node >= 22.5）
npm install

# 2. 写入演示数据（可选，但推荐，能直接体验扫码端）
npm run seed

# 3. 构建前端
npm run build

# 4. 启动（单端口同时提供 API 与 H5）
npm start
```

打开 http://localhost:3000

| 入口 | 地址 |
|---|---|
| 首页 / 生成车贴 | http://localhost:3000/ |
| 演示扫码页（访客视角） | http://localhost:3000/v/PARK2DAY |
| 我管理的车贴（本机） | http://localhost:3000/mine |
| 演示车主管理（需本机凭证） | http://localhost:3000/v/PARK2DAY/manage |

> 演示数据里的车主是「鄂A·12345 特斯拉 Model Y」，手机号 138****8000。
> 开发模式下短信走 Mock 通道，内容打印在服务端控制台，不会真的发出。

---

## 核心流程

### 1. 车主拿到车贴（先绑定，再生成）

**线上生成**：首页点「免费生成挪车码」→ 填写车牌 / 车型 / 手机号 → 提交后立即拿到已绑定的二维码

**实体车贴**：拿到印好二维码的空白车贴 → 扫码 → 填同样的信息 → 完成绑定

两条路径最终是同一件事：**信息先填完，码才生效**。生成成功后：

- 服务端直接建好 `status = active` 的车辆档案，同时返回可保存的二维码
- 给当前浏览器下发一个**本机管理凭证**（localStorage）
- 管理凭证存在 `vehicle_tokens`，一张车贴可多台设备；换机用旧机授权码，旧机丢失用恢复链接找回
- 空白车贴 7 天内未绑定会被自动清理

### 2. 访客通知

扫已激活的车贴 → 看到脱敏车牌（`鄂A·D**21`）→ 选择：

| 方式 | 说明 |
|---|---|
| 电话联系 | 点击后直接拨打车主手机号；页面只显示 `138****8000`，真实号码在点击瞬间下发并唤起拨号盘 |
| 短信通知 | 选快捷语或自定义留言（100 字内）+ 可选位置 → 车主收到短信 |

### 3. 车主响应

管理页「记录」里查看请求详情 → 一键回复「马上就来 / 已处理」→ 访客结果页 3 秒内同步。

---

## 功能清单

**车主**
- 免注册生成车贴，支持新能源 8 位号牌
- 专用车牌键盘：省份 → 字母 → 数字自动切换，勾选新能源自动加一位
- 高清车贴下载（5 套样式：简约 / 墨黑 / 青绿 / 警示 / 线框，Canvas 合成 900×1260）
- 通知渠道开关、每日提醒上限（1–20）、免打扰时段
- 挪车记录、一键响应、举报骚扰
- 更换车贴码、删除车贴

**访客**
- 零注册扫码即用
- 两种通知方式 + 快捷留言 + 定位上报（配置高德 Key 后自动填地址）
- 实时查看车主是否响应
- 频控提示（同设备 10 分钟 1 次、24 小时 3 次）
- 页面底部「我也要一张挪车码」入口

**风控与隐私**
- 车牌 / 车主名脱敏展示；**扫码页响应里不含手机号**，只有点击拨打时才走单独接口下发
- 号码下发接口有频控（10 分钟 3 次）并写审计日志，可追查批量抓取
- 车辆每日通知上限、电话单独限额、IP 与设备双维度频控
- 无凭证访问 manage 一律 403，前端直接回落到扫码页

---

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + vue-router，自研 CSS 设计系统，无 UI 库 |
| 构建 | `@vue/compiler-sfc` + esbuild（`scripts/build-web.cjs`） |
| 后端 | Node 22 + Express 5 |
| 数据库 | `node:sqlite`（内置，零编译依赖，WAL 模式） |
| 实时 | SSE（车主端新请求推送） |
| 二维码 | `qrcode` |
| 加密 | 内置 crypto：AES-256-GCM + SHA-256 |

> 构建没有用 Vite 的运行时，是为了让产物构建不依赖 Node 的 HTTP 栈，环境兼容性更好。
> 需要 HMR 开发时仍可用 `npm run dev:web`（Vite）。

---

## 目录结构

```
MovwNowCar/
├── docs/
│   ├── REQUIREMENTS.md     需求规格
│   └── ARCHITECTURE.md     架构设计
├── scripts/
│   ├── build-web.cjs       前端构建（SFC 编译 + esbuild）
│   └── dev.cjs             本地开发（后端 watch + Vite）
├── server/
│   ├── src/
│   │   ├── index.js        Express 入口 + 静态托管
│   │   ├── schema.sql      表结构
│   │   ├── db.js           SQLite 访问与维护任务
│   │   ├── seed.js         演示数据
│   │   ├── lib/            加密、短码、频控、响应封装
│   │   ├── middleware/     设备指纹、错误处理
│   │   ├── routes/sticker.js  全部业务接口
│   │   └── services/       通知编排、电话通道、SSE、通道适配
│   └── test/e2e.cjs        端到端测试（46 项断言）
└── web/
    ├── index.html
    └── src/
        ├── views/          Landing / Create / Scan / Result / Manage / Sticker
        ├── components/     PlateInput / PlateKeyboard / Sheet / Icon ...
        └── styles/
```

---

## 配置

复制 `server/.env.example` 为 `server/.env`：

```ini
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000   # 二维码里写入的地址，上线改 HTTPS 域名
SECRET_KEY=change-me-32-bytes           # JWT/AES 派生密钥
DEV_FIXED_CODE=                         # 开发期固定验证码（本项目已无登录，可留空）
SMS_PROVIDER=mock                       # mock | aliyun
```

### 电话联系方式

**直拨车主真实号码**：页面上只显示 `138****8000`，点「拨打」时才通过接口下发，随即 `tel:` 唤起拨号盘，不落进页面文本，不会被截图带出。

保护措施：

- 接口频控（同设备 10 分钟 3 次），每次下发都写审计日志（IP / 设备 / 车贴），便于追查批量抓取
- **但号码终究会到达客户端**，懂技术的人抓包仍能拿到。产品文案只能说「号码不显示在页面上」，不能承诺"号码绝不外泄"

> AXB 隐私号（一次性虚拟号）需要运营商资质 + 号码资源，本项目不再包含该方案：相关通道、建表与前端界面已移除。

### 接入真实短信（阿里云）

代码里已经实现了阿里云 `SendSms` 的完整签名与调用（`server/src/services/channels/sms.aliyun.js`），不需要额外装 SDK。你只需要拿到四个参数：

**1. 开通短信服务**
阿里云控制台 → 短信服务 → 开通（个人认证可用，但签名审核较严）

**2. 申请签名**
短信服务 → 国内消息 → 签名管理 → 添加签名
- 个人账号通常需要提供已备案的网站 / APP / 公众号作为签名来源
- 审核一般 2 小时内，工作日更快

**3. 申请模板**
模板管理 → 添加模板，内容按这个格式写（变量名要与代码一致）：

```
您的车辆${plate}有挪车请求，${message}，请及时处理。
```

审核通过后会得到一个 `SMS_xxxxxxx` 的模板 CODE。

**4. 填进 `server/.env`**

```ini
SMS_PROVIDER=aliyun
SMS_ACCESS_KEY_ID=LTAI5t...
SMS_ACCESS_KEY_SECRET=...
SMS_SIGN_NAME=让一让          # 必须与审核通过的签名一字不差
SMS_TEMPLATE_ID=SMS_123456789 # 模板 CODE
SMS_REGION=cn-hangzhou
```

重启服务后，`/api/health` 里的 `channels.sms` 会变成 `aliyun`，此后短信就是真发的。

**没配置会怎样**：`SMS_PROVIDER=aliyun` 但缺参数时，发送会抛错并记入通知记录，车主端能看到「短信发送失败」和具体原因（如 `isv.SMS_SIGNATURE_ILLEGAL` 表示签名未审核），不会静默假装成功。

### 其他通道


### 定位（可选）

访客发短信时可以点「定位」上报车辆位置。默认只记录经纬度，车主在记录详情里点「在地图上查看精确位置」跳转高德地图。

想让定位**自动填出地址**（如「武汉市江汉区解放大道 123 号」），去高德开放平台申请一个 Web 服务 Key（个人可申请，免费额度每天 5000 次），填进 `.env`：

```ini
AMAP_KEY=你的Key
```

原理：前端拿到坐标后调用 `/api/geo/reverse`，服务端用 Key 请求高德逆地理编码，Key 不会暴露给浏览器。没配 Key 时接口返回空地址，前端降级提示「已记录精确位置」，功能不受影响。

#### 手机上的定位为什么一直失败

浏览器有一条硬规则：**只有安全上下文（https 或 localhost）才允许获取地理位置**。用 `http://192.168.x.x:3000` 打开时，`navigator.geolocation` 会直接返回拒绝，页面只能提示失败——这不是代码问题，换任何网站都一样。

项目内置了一个可选 HTTPS 监听，证书放在 `server/certs/` 时自动开启（默认端口 3443）：

```bash
# 已生成自签名证书：server/certs/lan-key.pem + lan-cert.pem
# 证书 SAN 已包含 192.168.2.111 / 127.0.0.1 / localhost
npm start
```

启动后控制台会多一行 `[https] 已启用：https://<本机IP>:3443`。手机上访问 `https://192.168.2.111:3443/v/<车贴码>`：

- Android Chrome：提示「您的连接不是私密连接」→ 高级 → 继续前往，之后定位权限正常弹出
- iOS Safari：提示证书不受信任 → 显示详细信息 → 访问此网站

> 自签名证书只适合局域网调试。正式上线换成真实域名 + 免费证书（Let's Encrypt）即可，代码不用改。
> 不想折腾证书也没关系：定位失败时页面会说明原因，并提供「地库 B1 / 地库 B2 / 地面停车场 / 路边 / 小区内」快选，手填一样能发给车主。

---

## 测试

```bash
npm start            # 另开一个终端
npm run test:e2e
```

覆盖：生成/绑定 → 访客扫码 → 频控 → 电话联系方式（直拨）→ 车主响应 → 多设备授权/恢复/撤销 → 车牌去重 → 迁移 → 演示车贴 → 换码/停用/删除，共 80 项断言。

---

## Docker 部署

镜像用多阶段构建：先编译前端，运行时只带后端生产依赖。内置 `node:sqlite`，Node 22.13+ 默认可用，无需额外标志。

```bash
# 1. 构建镜像
docker build -t rangyirang-move-car:latest .

# 2. 运行（把 PUBLIC_BASE_URL 换成你的公网地址，SECRET_KEY 换成随机串）
docker run -d --name move-car \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PUBLIC_BASE_URL=https://your-domain.example.com \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -v move-car-data:/app/server/data \
  --restart unless-stopped \
  rangyirang-move-car:latest
```

或使用 Compose（编辑 `docker-compose.yml` 里的环境变量后）：

```bash
docker compose up -d --build
```

要点：

- 数据（SQLite）持久化在命名卷 `move-car-data`，映射到容器内 `/app/server/data`
- 内置 HTTPS 默认不启用；生产建议用 Nginx/Caddy 反代终结 TLS（见下方「部署提示」），或挂载证书到 `/certs` 并设 `HTTPS_KEY`/`HTTPS_CERT`
- 配置一律走环境变量，`.env`、`server/certs/`、`server/data/` 不会打进镜像

---

## 部署提示

- `PUBLIC_BASE_URL` 必须是 HTTPS 域名（微信内打开要求）
- Nginx 反代需要 `proxy_buffering off`（SSE 长连接）
- 数据库文件 `server/data/app.db` 纳入每日备份
- `SECRET_KEY` 使用 32 字节随机值；更换会导致已加密的手机号无法解密
- 上线前把 `SMS_PROVIDER` 切到真实通道，否则车主收不到短信

---

## 身份与找回

车主身份不再依赖账号：一张车贴可以有多个设备凭证（`vehicle_tokens`），并支持两条自助找回路径：

- **换手机（旧机还在）**：管理页「添加新设备」生成授权二维码，新机扫码即加入
- **旧机丢了 / 清缓存**：创建或重置时保存「恢复链接」（26 位恢复码），在访客页点「我是车主 · 找回管理权」输入即可

恢复码只在生成时展示一次，服务端只存哈希。方案细节见 [`docs/车主身份识别实现文档.md`](docs/车主身份识别实现文档.md)。

---

## 后续可扩展

- 微信小程序版（复用同一套 API）
- 车贴电商下单与物流
- 与停车场道闸 / 物业系统对接
- 多城市运营后台
