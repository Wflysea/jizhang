# 小王记账（安卓记账 App）

Vue 3 + Vite + Capacitor 实现的移动端记账应用，可打包为安卓 APK。

- 应用名：**小王记账**，包名 `com.xiaowang.jizhang`
- 当前版本：**v1.10.0**（versionCode 11000）
- 安装包体积：约 **3.8 MB**

## 已实现功能

| 模块 | 能力 |
|---|---|
| 明细 | 顶部**今天 / 本周 / 本月 / 本年**四档筛选（本周从周一起算；「本月」可左右翻月，其余显示区间）；概览**支出/收入一行、结余单独一行**；按日分组流水、当日小计；**点击进入编辑页**，**左滑露出复制/编辑/删除**（复制后直接进入编辑状态，可改金额/账户/日期再保存） |
| 图表 | SVG 环形占比图、分类排行榜（带进度条）、近半年收支趋势柱状图 |
| 记一笔 | 支出/收入/**转账**切换、14+8 类 emoji 分类网格、自定义数字键盘、备注/日期/账户；编辑已有记录时显示「删除」 |
| 转账 | 账户页「🔄 转账」入口或记一笔页「转账」页签；两级选择器分别选**转出/转入账户**（带余额展示），一键**互换**；转账只记一条流水（转出 −、转入 +），**不计入收支统计与图表**，支持编辑/删除/左滑复制 |
| 账户 | 一级六大账户类型（现金/信用卡/金融/虚拟/**投资**/负债）+ 二级自定义具体账号。新安装**只保留一级类型**，二级账号由用户自建（也可在记账页直接新建或批量导入） |
| 不计入资产 | 每个账号可一键**设为不计入资产**（👁 图标切换）：余额不再计入净资产与账户类型合计，流水照常记录；记账/转账选择器中带「不计入」标记；Excel 导入导出经「计入资产」列保留该标记 |
| 余额调整 | **点击余额**即可手动调整，按差额自动生成一笔「余额调整」流水（调增为收入、调减为支出），保证余额与流水始终自洽 |
| 数据导入导出 | 「我的 → 数据导入导出」**仅 Excel 一来一回**：导出 Excel（明细流水 + 账户 + 分类/月度汇总，含记录ID/账号ID 列用于回导去重与归属还原）；导入同一份 Excel，自动识别账户表与流水表，可选**合并**（跳过重复）或**覆盖**，流水引用的未知账户会**自动新建**（不丢数据）。导出的表格可直接改完再导回，无需另存备份文件 |
| 导出方式 | App 内通过**系统分享面板**导出（可保存到本地、发微信、传网盘）；浏览器预览仍走直接下载 |
| 我的 | 数据导入导出（导出 Excel / 导入 Excel）+ 数据管理（清空全部数据，只清流水保留账号）+ 预算/分类管理入口 |
| 返回键 | 安卓返回键**逐层关闭弹层**（编辑页 → 账户选择器 → 调整/导入弹层），不会直接退出；无任何弹层时需**连按两次**才退出应用 |

- 数据存 `localStorage`，完全离线可用；**新安装为空账本**（不预置账号、也没有示例数据入口），所有账目都由用户真实记录
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
