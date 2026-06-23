# H5 发行与 uniCloud 前端网页托管

## 适用范围

本文档用于开源版项目的 H5 构建、uniCloud 前端网页托管部署，以及跨域与安全域名核对。

注意：

- 本仓库不再提供任何真实服务空间名称、`spaceId`、`clientSecret`、托管域名或历史云资源信息
- 所有开源使用者都必须创建并使用自己的 uniCloud 空间
- `src/utils/cloud.js` 属于本地私有配置，不应提交到公开仓库

## 发布前准备

1. 复制 `src/utils/cloud.template.js` 为本地私有文件 `src/utils/cloud.js`
2. 在 `src/utils/cloud.js` 中填写你自己的 `spaceId`、`clientSecret`、`hostingOrigin`
3. 在你自己的 uniCloud 空间中配置环境变量：

- `PAIRSPACE_PUBLIC_SIGN_SECRET`
- `PAIRSPACE_CRYPTO_SECRET`
- `PAIRSPACE_SMS_TEST_MODE`，仅测试时按需使用
- `PAIRSPACE_FIXED_SMS_CODE`，仅在测试模式下使用

4. 将 `uniCloud-aliyun/database/` 的 schema 和 index 导入你自己的空间
5. 将 `uniCloud-aliyun/cloudfunctions/` 部署到你自己的空间

## H5 请求安全策略

项目所有敏感请求统一通过 `uniCloud.callFunction` 发起，相关服务层包括：

- `src/services/auth.js`
- `src/services/chat.js`
- `src/services/daily.js`
- `src/services/mine.js`
- `src/services/records.js`

安全校验逻辑位于 `src/utils/security.js`：

- 本地开发仅允许 `localhost` / `127.0.0.1`
- 线上 H5 仅允许 `https:` 页面发送敏感请求
- 前端本地缓存密钥在未配置时按设备自动生成随机值

## H5 发行方式

### 方式一：本地构建

```bash
npm run publish:h5:web
```

### 方式二：构建后上传到你自己的 uniCloud 网页托管

```bash
npm run publish:h5:hosting
```

如果你使用 HBuilderX 图形界面，请在发布时选择你自己账号下的阿里云 uniCloud 空间，不要复用任何历史示例空间。

## 构建输出目录

常见输出目录如下：

```text
dist/build/h5
dist/build/web
```

上传网页托管时，请确认实际上传的是包含 `index.html`、`assets/`、`static/` 的根目录，而不是只上传其中某个子目录。

## 跨域与安全域名

### 推荐部署方式

推荐把 H5 部署到你自己同一 uniCloud 空间的前端网页托管，这样更容易保持前端页面和云函数调用环境一致。

### 本地浏览器调试

如果使用本地调试地址，例如：

- `http://localhost:5173`
- `http://localhost:5174`

则需要按你自己空间的要求，在 uniCloud 控制台配置相应 H5 域名白名单。

### 自定义域名

如果你使用自己的正式 HTTPS 域名，请同时：

- 在 `src/utils/cloud.js` 中设置 `hostingOrigin`
- 在 uniCloud 控制台配置对应域名白名单
- 如有需要，在外部平台后台补充安全域名配置

## 发布后验收

请使用你自己的托管域名完成以下验证：

- 页面可正常打开
- 浏览器控制台无跨域或混合内容错误
- 登录流程可在你自己的云空间中完成
- 双人绑定、聊天、动态、记录模块均只访问你自己的云资源
- 开源仓库中仍不包含任何真实私有配置

## 开源安全要求

- 不要把真实 `src/utils/cloud.js`、证书文件、打包缓存、测试产物提交到 GitHub
- 不要在文档、Issue、截图、测试日志中暴露真实 `spaceId`、`clientSecret`、托管域名
- 如果历史提交中曾包含这些信息，公开前需额外清理 git 历史并轮换密钥
