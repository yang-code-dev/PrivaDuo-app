# 网页版运行排查与验证手册

## 目标

本文档用于排查开源版项目在网页版运行时常见的三类问题：

- `DNS_PROBE_FINISHED_NXDOMAIN`
- 浏览器跨域报错
- HTTPS / 混合内容 / 非安全链路报错

注意：

- 本文档不再提供任何真实 `spaceId`、`clientSecret`、托管域名或历史云空间信息
- 所有验证都应基于你自己创建的 uniCloud 空间和你自己的托管地址

## 项目内已完成的安全基础

### 1. 云配置已改为私有本地填写

`src/utils/cloud.template.js` 仅保留空白模板，真实配置应由使用者在本地复制生成 `src/utils/cloud.js` 后自行填写。

### 2. H5 基础路径支持标准托管

项目已具备标准 H5 构建与托管能力，构建后可部署到你自己的 uniCloud 前端网页托管或自定义 HTTPS 域名。

### 3. 浏览器验证桥已注入

项目加载后会暴露：

```js
window.__PAIRSPACE_CLOUD__
```

可直接在浏览器控制台执行云连通性验证。

## 必须明确的限制

### 1. 跨域白名单不靠源码自动解决

`manifest.json` 不能替代：

- uniCloud Web 端 H5 域名白名单
- 微信公众号 H5 安全域名
- 抖音开放平台 H5 安全域名

这些都必须在你自己的后台控制台配置。

### 2. 公开仓库不会默认连接任何真实云空间

如果 `src/utils/cloud.js` 未填写真实配置，项目不会自动连接到任何私有 uniCloud 资源。

## 排查步骤

### 步骤 1：确认本地私有配置

检查 `src/utils/cloud.js` 是否已由你本地创建，并填写了自己的：

- `spaceId`
- `clientSecret`
- `endpoint`
- `hostingOrigin`
- `publicSignSecret`

同时检查你自己的 uniCloud 空间是否已配置：

- `PAIRSPACE_PUBLIC_SIGN_SECRET`
- `PAIRSPACE_CRYPTO_SECRET`

### 步骤 2：本地运行 H5

```bash
npm run dev:h5
```

常见本地地址：

- `http://localhost:5173`
- `http://localhost:5174`

如果在浏览器本地调试时出现跨域问题，请把对应域名加入你自己空间的 H5 白名单。

### 步骤 3：部署到你自己的网页托管

```bash
npm run publish:h5:hosting
```

或使用 HBuilderX 图形界面，选择你自己账号下的空间进行发布。

### 步骤 4：打开你自己的托管域名验证

验证标准：

1. 页面可以正常打开
2. 浏览器控制台没有 `Mixed Content` 报错
3. 浏览器控制台没有 `CORS` 拒绝报错
4. 登录、绑定、聊天、动态、记录等功能只访问你自己的空间

## `DNS_PROBE_FINISHED_NXDOMAIN` 排查

### 1. 核对域名来源

优先从你自己的 HBuilderX 发布结果或 uniCloud 控制台复制托管地址，不要手动拼接域名。

### 2. 检查托管是否刚发布

如果刚上传完成，可能需要等待几分钟让解析生效。

### 3. 检查网络与 DNS

若你自己的托管域名仍无法解析，可尝试：

- 更换网络环境
- 刷新本机 DNS 缓存
- 使用公共 DNS 进行验证

## 浏览器控制台验证代码

页面打开后，按 `F12` 打开控制台并执行：

```js
(async () => {
  const bridge = window.__PAIRSPACE_CLOUD__
  if (!bridge) {
    console.error('未找到 window.__PAIRSPACE_CLOUD__，请确认页面已完成初始化')
    return
  }

  console.log('页面信息：', bridge.getPageInfo())
  console.log('云配置：', bridge.getConfig())
  console.log('预期托管地址：', bridge.getHostingOrigin())

  try {
    const result = await bridge.ping()
    console.log('云连通性验证成功：', result)
  } catch (error) {
    console.error('云连通性验证失败：', error)
  }
})()
```

### 通过标准

满足以下条件可判定前端与云环境连接基本正常：

- `pageInfo.protocol` 为 `https:`，或本地调试地址为 `http://localhost`
- `cloudConfig.endpoint` 为 `https://api.next.bspapp.com`
- `result.result.ok === true`
- 返回结果表明当前请求命中了你自己部署的 `space-bootstrap` 服务

## 建议流程

1. 先创建自己的 uniCloud 空间并部署数据库和云函数
2. 本地填写 `src/utils/cloud.js`
3. 使用本地 H5 地址先跑通
4. 再发布到你自己的前端网页托管
5. 最后用你自己的正式域名完成验收
