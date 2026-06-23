# 隐私安全加固报告

## 一、加固范围

- 客户端传输与请求签名：`src/utils/security.js`、`src/services/*.js`
- 本地缓存与退出清理：`src/utils/storage.js`、`src/stores/user.js`
- 邀请码与登录鉴权：`src/services/mock-auth-server.js`、`uniCloud-aliyun/cloudfunctions/pair-auth/index.js`
- 解绑双授权：`src/services/mock-mine-server.js`、`src/pages/relation/index.vue`、`uniCloud-aliyun/cloudfunctions/pair-mine/index.js`
- 云端敏感数据加密：`uniCloud-aliyun/cloudfunctions/pair-chat/index.js`、`pair-daily/index.js`、`pair-records/index.js`
- 数据库权限与审计：`uniCloud-aliyun/database/*.schema.json`

## 二、风险修复清单

| 风险点 | 原状态 | 修复措施 | 结果 |
| --- | --- | --- | --- |
| 云端聊天/动态/记录敏感字段明文落库 | `content` / `images` / `title` 等字段存在明文写入 | 云函数改为 `AES-256-GCM` 写入 `*Cipher` 字段，响应阶段再解密返回 | 已修复 |
| 固定本地密钥与退出残留 | 本地 `pair-space:*` 敏感 key 未统一擦除 | 新增设备专属密钥派生、敏感前缀统一加密、退出登录统一清理 | 已修复 |
| 请求缺少设备指纹与传输安全元信息 | 仅有签名与时间戳 | 所有 envelope 注入 `deviceFingerprint`、`secureTransport`、`tlsRequired` | 已修复 |
| 邀请码可被连续试错 | 仅校验格式与有效性 | 增加设备指纹绑定、失败计数、30 分钟临时拦截、安全审计日志 | 已修复 |
| 解绑确认缺少二次授权 | 只有会话身份确认 | 新增待处理请求绑定的 `secondaryAuthToken` 二次校验 | 已修复 |
| 越权请求缺少审计 | 仅返回错误信息 | 聊天、日常、记录、认证、个人中心云函数统一写入 `security_audit_logs` | 已修复 |
| 分享菜单残留风险 | 页面级零散隐藏 | `App.vue` 全局重复隐藏分享菜单，继续保留页面级防御 | 已修复 |

## 三、加密与传输配置

- 云端敏感数据落库算法：`AES-256-GCM`
- 兼容策略：云函数解密支持 `GCM` 新格式，并兼容历史 `CBC` 旧格式读取，避免历史数据立即失效
- 本地敏感缓存策略：`pair-space:*` 前缀统一加密；密钥由设备种子、设备指纹与作用域派生
- 请求签名：`HMAC-SHA256`
- 哈希算法：`SHA-256`
- 传输安全：
  - 客户端调用云函数前执行受信任链路校验
  - 仅允许 `HTTPS` 或本地开发 `localhost/127.0.0.1`
  - 云上部署要求使用 uniCloud 默认 HTTPS 域名，并在网关侧配置 TLS 1.3

## 四、数据库与权限规则

- 所有核心集合 `permission` 已保持 `read/create/update/delete = false`
- 访问入口统一收敛到云函数
- 新增/补充字段：
  - `messages`: `contentCipher`、`mediaCipher`
  - `moments`: `contentCipher`、`imagesCipher`、`commentsCipher`
  - `diaries`: `titleCipher`、`contentCipher`、`imagesCipher`
  - `anniversaries`: `nameCipher`、`categoryCipher`
  - `wishlists`: `titleCipher`、`descriptionCipher`
  - `users`: `signature`、`notificationSettings`
  - `invite_codes`: `issuerDeviceFingerprint`
- 新增集合：
  - `unbind_requests`
  - `security_audit_logs`

## 五、拦截与告警策略

- 邀请码试错超过阈值：写入 `INVITE_BRUTE_FORCE_BLOCKED` 高危日志
- 会话失效、未绑定访问、越权访问、解绑二次授权失败：写入高危审计日志
- 审计日志字段：
  - `action`
  - `code`
  - `message`
  - `level`
  - `uid`
  - `targetId`
  - `pairId`
  - `deviceFingerprint`
  - `alertTriggered`

## 六、测试用例矩阵

### 自动化已覆盖

- `tests/e2e/security-hardening.spec.js`
  - 邀请码连续试错触发临时拦截
  - 解绑申请发起后，发起方无法单方面直接完成解绑
- `tests/e2e/mine-center.spec.js`
  - 双向解绑主流程验证
- `tests/e2e/auth-bind.spec.js`
  - 注册、登录、绑定主链路验证

### 手工/联调建议覆盖

1. 未绑定账号直接调用聊天/日常/记录/个人中心云函数
2. 非配对双方伪造 `pairId` 访问共享数据
3. 复用已消费邀请码再次绑定
4. 更换设备后连续暴力试错邀请码
5. 发起解绑后篡改 `secondaryAuthToken` 再尝试确认
6. 退出登录后检查 `pair-space:*` 敏感缓存是否被清除
7. 云端数据库抽查确认 `*Cipher` 字段有值且原文空置/不可读

## 七、当前残余风险与后续建议

- 当前客户端本地敏感缓存已切到设备专属密钥，但受限于现有前端运行时，端侧仍使用同步加密能力；若要进一步提升到端侧 `AES-GCM` 原生实现，建议后续统一迁移到 WebCrypto/原生安全存储封装。
- 真实 TLS 1.3 协议协商由 uniCloud 网关与部署域名控制，代码层已做非 HTTPS 拦截，但上线前仍需在控制台完成 TLS 套件确认。
- 图片文件本体若后续接入云存储直传，建议补文件级信封加密，避免仅元数据加密。
- 安全审计当前为库内留痕，建议后续接入短信/邮件/Webhook 告警链路。
