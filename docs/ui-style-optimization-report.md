# UI 样式优化报告

## 一、迭代范围

- 全局主题与设计基线：`src/App.vue`、`src/uni.scss`
- 基础组件：`src/components/AppCard.vue`、`AppEmptyState.vue`、`AppLoading.vue`、`AppImageViewer.vue`、`AvatarUploader.vue`
- 首页与主 Tab：`src/pages/home/index.vue`、`message/index.vue`、`moment/index.vue`、`mine/index.vue`
- 记录二级页：`src/pages/diary/detail.vue`、`anniversary/detail.vue`、`wishlist/index.vue`
- 登录与绑定：`src/pages/auth/login.vue`、`src/pages/bind/guide.vue`、`src/pages/splash/index.vue`
- 我的二级页：`src/pages/settings/index.vue`、`album/detail.vue`、`notification/index.vue`、`privacy/index.vue`、`relation/index.vue`

## 二、发现的问题

| 问题类型 | 具体表现 | 影响 |
| --- | --- | --- |
| 颜色体系不统一 | 多处页面残留高饱和粉色、纯白卡片和旧灰底 | 与既定温柔治愈风格冲突 |
| 圆角规范不统一 | 页面内同时存在 `20rpx / 24rpx / 28rpx / 32rpx` 多套规则 | 卡片、按钮、弹窗层级混乱 |
| 间距体系不统一 | 主页面左右边距和模块上下间距不一致 | 页面节奏不稳定，视觉松散 |
| 空状态与加载状态缺失 | 多处仍使用纯文本空态，缺少统一加载组件 | 空白感强，体验不完整 |
| 聊天交互样式未达标 | 气泡缺少箭头，Tab 选中态无明确指示器 | 核心交互识别度不足 |
| 弹层规范不统一 | 编辑器、裁剪弹窗使用旧遮罩和旧圆角 | 弹出层体验不连续 |
| 深浅色适配不彻底 | 旧硬编码颜色较多 | 深色模式下对比和氛围失衡 |
| 安全区适配不完整 | 多页底部未统一加上 `safe-area-inset-bottom` | 全面屏设备易出现贴边和遮挡 |

## 三、修复方案

- 全局主题：统一使用暖米色 `#FFF8F0`、浅豆沙粉 `#E8B4B8`、浅灰 `#F0F0F0`、纯白 `#FFFFFF`、深灰 `#333333`，并同步深色模式 Token。
- 圆角体系：卡片统一 `16px`，按钮与弹窗统一 `12px`，聊天气泡统一 `16px`。
- 间距体系：页面左右安全边距统一为 `16px`，模块主间距统一为 `20px`，列表内次级间距统一收口到 `12px/16px`。
- 空状态：统一接入 `AppEmptyState`，补足聊天、动态、日记、纪念日、心愿、相册等场景。
- 加载状态：统一接入 `AppLoading`，覆盖首页动态加载、聊天初始化骨架等场景。
- 弹层交互：编辑器、头像裁剪弹层统一遮罩透明度、内边距、底部安全区和 `12px` 圆角。
- 图片预览：补全日记页图片全屏预览，并复用统一 `AppImageViewer`。
- 深浅色与安全区：所有本轮页面改造均切换到主题变量，底部统一追加安全区内边距。

## 四、重点修复清单

| 页面/组件 | 主要修复内容 | 结果 |
| --- | --- | --- |
| `message/index.vue` | 重做聊天头部、气泡箭头、文字行高、发送区、Tab 指示器、空/加载状态、安全区 | 已完成 |
| `home/index.vue` | 统一工具入口卡片、动态区空/加载状态、页面节奏 | 已完成 |
| `moment/index.vue` | 统一记录入口卡片样式、间距与点击反馈 | 已完成 |
| `diary/detail.vue` | 统一筛选器、时间轴卡片、编辑弹层、空状态，并补图片预览 | 已完成 |
| `anniversary/detail.vue` | 统一卡片、徽标、空状态和编辑弹层 | 已完成 |
| `wishlist/index.vue` | 统一输入区、列表卡片、勾选态、空状态 | 已完成 |
| `mine/index.vue` | 统一资料卡、汇总卡、菜单列表、通知预览卡 | 已完成 |
| `settings/index.vue` | 统一表单、输入框、保存按钮和页面容器 | 已完成 |
| `album/detail.vue` | 统一头部信息卡、分组卡、网格圆角与空状态 | 已完成 |
| `notification/index.vue` | 统一开关卡片、按钮与选中色 | 已完成 |
| `privacy/index.vue` | 统一说明卡与规则卡片层级 | 已完成 |
| `relation/index.vue` | 统一关系卡、待确认区域、主次按钮与说明卡 | 已完成 |
| `auth/login.vue` | 统一输入框、标签、按钮、首屏视觉 | 已完成 |
| `bind/guide.vue` | 统一规则面板、邀请码卡、输入框与按钮 | 已完成 |
| `splash/index.vue`、`index/index.vue` | 纳入当前视觉基线，移除默认占位风格 | 已完成 |
| `AvatarUploader.vue` | 统一预览区、裁剪弹窗、按钮与遮罩 | 已完成 |

## 五、合规状态

| 规范项 | 状态 | 说明 |
| --- | --- | --- |
| 暖米色 + 豆沙粉主色体系 | 已落实 | 全局 Token 与页面主视觉已统一 |
| 卡片 `16px` 圆角 | 已落实 | 主页面与二级页卡片已收口 |
| 按钮/弹窗 `12px` 圆角 | 已落实 | 表单按钮、抽屉、编辑器、裁剪弹窗已统一 |
| 聊天气泡左右区分 | 已落实 | 对方左侧柔和浅色气泡，我方右侧豆沙粉气泡 |
| 空状态统一 | 已落实 | 关键业务页已替换为统一空状态组件 |
| 加载组件统一 | 已落实 | 首页与聊天页已接入统一加载组件 |
| 深色模式适配 | 已落实 | 本轮页面均改用主题变量，不再依赖旧硬编码色值 |
| 安全区适配 | 已落实 | 页面底部和弹层底部均补充安全区内边距 |
| 图片全屏预览 | 已落实 | 相册、聊天、动态、日记统一进入内置预览器 |
| 禁用态透明度 50% | 已落实 | 继承全局按钮禁用规则 |

## 六、验证结果

- `GetDiagnostics` 复查本轮修改文件，结果均为 `0` 条诊断错误。
- 通过 `npm run build:h5` 完成构建验证，构建成功。
- 残留输出仅为 Sass 旧 `@import` 与 legacy JS API 的弃用告警，不影响本次 UI 功能与样式编译结果。

## 七、后续建议

- 若继续提升规范化程度，建议下一轮把页面级常用布局抽成 `page-shell / section-head / form-card` 这类基础容器类，减少重复样式。
- Sass 弃用告警建议后续统一迁移到 `@use`，避免未来 Dart Sass 升级时产生构建风险。
- 若要进一步做“主流设备走查留档”，可以追加 iPhone 15 Pro、iPhone SE、Pixel 8 三组截图基线，便于后续回归比对。
