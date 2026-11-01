# 小王记账（安卓记账 App）

Vue 3 + Vite + Capacitor 实现的移动端记账应用，可打包为安卓 APK。

- 应用名：**小王记账**，包名 `com.xiaowang.jizhang`
- 当前版本：**v1.3.0**（versionCode 10300）
- 安装包体积：约 **3.8 MB**

## 已实现功能

| 模块 | 能力 |
|---|---|
| 明细 | 月份左右切换、橙色渐变概览（支出/收入/结余）、按日分组流水、当日小计；**点击进入编辑页**，**左滑露出复制/编辑/删除** |
| 图表 | SVG 环形占比图、分类排行榜（带进度条）、近半年收支趋势柱状图 |
| 记一笔 | 支出/收入切换、14+8 类 emoji 分类网格、自定义数字键盘、备注/日期/账户；编辑已有记录时显示「删除」 |
| 账户 | 一级六大账户类型（现金/信用卡/金融/虚拟/**投资**/负债）+ 二级自定义具体账号（可增删改，也可在**记账页直接新建**），余额由流水自动汇总 |
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

### 一键发布（推荐）

```bash
npm run release                # 修订号 +1 → 构建 → 打 APK → 更新下载站 → 发布上线 → Git 提交打标签
npm run release:minor          # 次版本号 +1
node scripts/release.cjs --msg="feat: 说明" --no-publish   # 只构建打包不发布
```

脚本 `scripts/release.cjs` 自动完成 6 步：版本号递增并同步安卓 → 构建 → `cap sync` + Gradle 打包 →
把 APK 拷进 `download-site/` 并改写下载页的版本与体积 → 调用发布脚本上线 → `git commit` + `git tag vX.Y.Z`。
分享链接**固定不变**（`https://adca3517fe8576b56.app.workbuddy.host/?sharecode=OFMM663SCK`）。

> 规则：改动 App 代码/资源 → 执行 `npm run release`（每次改动都会自动发布上线）；
> 仅改文档 → 直接 `git commit`，无需重新打包发布。

打包前需准备：JDK 17+（现用 20）、Android SDK 34、Gradle 8.7。
本仓库已将 `android/build.gradle` 的仓库源替换为阿里云镜像，Gradle Wrapper 固定 8.7。

预览支持 `?tab=` 直达页面，如 `http://localhost:4173/?tab=stats`。

## 版本管理

版本号以 `package.json` 的 `version` 为唯一来源，`npm run build` 时由
`scripts/sync-version.cjs` 自动同步到安卓工程：

- `versionName` = package.json version（如 `1.1.0`）
- `versionCode` = `major*10000 + minor*100 + patch`（如 `10100`）

手动分步流程（日常用上面的 `npm run release` 即可，这里仅说明内部步骤）：

```bash
npm run bump                     # 1) 版本号 +1 并同步安卓
npm run build && npm run android:sync   # 2) 构建并同步
# 3) 构建 APK 并更新 download-site/xiaowang-jizhang.apk
cd /workspace && git add -A && git commit -m "feat: 本次改动说明"
git tag v1.3.0                   # 4) 打版本标签
```
