# PrivaDuo

基于 `UniApp + Vue 3 + Pinia + uniCloud` 的双人私密应用示例项目。

## 开源安全说明

- 当前仓库不再包含真实 `spaceId`、`clientSecret`、云端签名密钥、固定本地加密密钥或你的线上托管域名。
- `src/utils/cloud.js` 已作为本地私有配置文件处理，`.gitignore` 已默认屏蔽，公开仓库不会直接连接你的 uniCloud 空间。
- 云函数所需密钥统一改为从 uniCloud 环境变量读取，不会访问你当前账号下的云端资源。
- 本次改造只做安全脱敏，不改动双人聊天、通知设置、退出登录等既有业务逻辑。

## 本地准备

1. 安装依赖

```bash
npm install
```

2. 创建私有前端配置

- 复制 `src/utils/cloud.template.js` 为你自己的 `src/utils/cloud.js`
- 仅在本地填写你自己的 uniCloud 私有配置
- 不要把填写后的 `src/utils/cloud.js` 提交到公开仓库

示例流程：

```bash
cp src/utils/cloud.template.js src/utils/cloud.js
```

需要你自行填写的字段：

- `spaceId`：你自己创建的 uniCloud 空间 ID
- `clientSecret`：你自己空间的前端调用密钥
- `endpoint`：通常保持 `https://api.next.bspapp.com`
- `hostingOrigin`：你自己的 H5 托管域名，可留空
- `publicSignSecret`：需与你自己云函数环境变量 `PAIRSPACE_PUBLIC_SIGN_SECRET` 保持一致
- `localCryptoSecret`：前端本地缓存加密种子，可留空，留空后会在设备端自动生成随机密钥

## 自建 uniCloud 空间

1. 使用你自己的 DCloud 账号在 HBuilderX 中创建或绑定 uniCloud 阿里云空间
2. 导入 `uniCloud-aliyun/database/` 下的数据库 schema 和 index
3. 将 `uniCloud-aliyun/cloudfunctions/` 下的云函数部署到你自己的空间
4. 确保项目始终遵守双人强绑定约束，不接入第三人、群聊或公开社交入口

## 云函数环境变量

以下变量必须在你自己的 uniCloud 空间中配置：

- `PAIRSPACE_PUBLIC_SIGN_SECRET`：前端请求签名配置，需与本地 `cloud.js` 保持一致
- `PAIRSPACE_CRYPTO_SECRET`：云函数服务端加密密钥

以下变量仅在你自己的测试空间按需启用：

- `PAIRSPACE_SMS_TEST_MODE`：是否启用固定短信验证码测试模式
- `PAIRSPACE_FIXED_SMS_CODE`：仅当 `PAIRSPACE_SMS_TEST_MODE=true` 时必填

安全建议：

- 使用密码管理器或安全随机生成器创建密钥
- 不要把真实密钥重新写回源码、测试脚本或文档
- 如果这些值曾经进入 git 历史，请额外清理历史提交并立即轮换密钥

## 安全部署方案

### 1. 前端私有配置

- `src/utils/cloud.js` 只保留在本地，不入库
- `src/utils/cloud.template.js` 只作为空白模板公开
- 如果你需要多人协作，建议通过私有文档或密码管理器分发真实配置

### 2. 云函数密钥管理

- 所有云函数统一通过 `process.env` 读取环境变量
- 不在云函数源码内写死默认密钥或兜底密钥
- 部署到不同环境时，为每个环境使用独立密钥

### 3. 前端本地缓存加密

- 当前实现不再依赖固定 AES IV
- 前端 `localCryptoSecret` 留空时，会在本地自动生成按设备隔离的随机密钥
- 这层加密仅用于本地缓存保护，不应视为服务端信任边界

## 代码安全检查结论

- 云函数中未发现固定 AES IV，当前服务端加密使用随机 IV
- 未发现仍在业务代码中写死的 `spaceId`、`clientSecret` 或云函数默认密钥
- 已发现并移除文档中的历史真实空间信息与托管域名示例
- 开源使用者必须自行创建空间、配置环境变量、填写本地私有配置，仓库默认不会访问你的云资源

## 运行项目

本地 H5 调试：

```bash
npm run dev:h5
```

如需运行 E2E，请使用你自己的本地或托管地址：

```bash
PAIRSPACE_HOSTING_ORIGIN=http://127.0.0.1:5173 npm run test:e2e
```

## 开源前检查清单

- 确认 `.gitignore` 已屏蔽 `src/utils/cloud.js`、证书、缓存、构建目录、调试产物
- 确认公开仓库中不包含真实 `spaceId`、`clientSecret`、托管域名和任何密钥
- 如 `src/utils/cloud.js` 曾被 git 跟踪，发布前执行 `git rm --cached src/utils/cloud.js`
- 检查历史提交、Tag、Release 附件，确保旧密钥和旧云空间信息不会继续暴露
