# 小王记账（安卓记账 App）

Vue 3 + Vite + Capacitor 实现的移动端记账应用，可打包为安卓 APK。

- 应用名：**小王记账**，包名 `com.xiaowang.jizhang`
- 当前版本：**v1.3.0**（versionCode 10300）
- 安装包体积：约 **3.8 MB**

## 已实现功能

| 模块 | 能力 |
|---|---|
| 明细 | 月份左右切换、橙色渐变概览（支出/收入/结余）、按日分组流水、当日小计、点击删除 |
| 图表 | SVG 环形占比图、分类排行榜（带进度条）、近半年收支趋势柱状图 |
| 记一笔 | 支出/收入切换、14+8 类 emoji 分类网格、自定义数字键盘、备注/日期/账户 |
| 账户 | 一级账户类型 + 二级自定义具体账号（可增删改），余额由流水自动汇总 |
| 我的 | 导出 Excel（.xlsx：明细/分类汇总/月度汇总）、清空数据、预算/分类管理入口 |

- 数据存 `localStorage`，完全离线可用；首次启动自动生成近半年示例数据
- 配色遵循国内惯例：**支出红、收入绿**；品牌色 `#FF9500`
- 图标使用 emoji，**依赖系统字体**（不打包字体文件），Android/iOS/桌面均自带，实测显示正常

## 命令

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 构建到 dist/（自动同步版本号到安卓工程）
npm run preview      # 预览构建产物 http://localhost:4173
npm run bump         # 修订号 +1（1.1.0 → 1.1.1）
npm run bump:minor   # 次版本号 +1（1.1.0 → 1.2.0）
```

### 安卓打包

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

打包前需准备：JDK 17+（现用 20）、Android SDK 34、Gradle 8.7。
本仓库已将 `android/build.gradle` 的仓库源替换为阿里云镜像，Gradle Wrapper 固定 8.7。

预览支持 `?tab=` 直达页面，如 `http://localhost:4173/?tab=stats`。

## 版本管理

版本号以 `package.json` 的 `version` 为唯一来源，`npm run build` 时由
`scripts/sync-version.cjs` 自动同步到安卓工程：

- `versionName` = package.json version（如 `1.1.0`）
- `versionCode` = `major*10000 + minor*100 + patch`（如 `10100`）

每次改动的标准流程：

```bash
npm run bump                     # 1) 版本号 +1 并同步安卓
npm run build && npm run android:sync   # 2) 构建并同步
# 3) 构建 APK 并更新 download-site/xiaowang-jizhang.apk
cd /workspace && git add -A && git commit -m "feat: 本次改动说明"
git tag v1.1.0                   # 4) 打版本标签
```
