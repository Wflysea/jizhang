# 随手记复刻版（安卓记账 App）

Vue 3 + Vite + Capacitor 实现的移动端记账应用，可打包为安卓 APK。

## 已实现功能

| 模块 | 能力 |
|---|---|
| 明细 | 月份左右切换、橙色渐变概览（支出/收入/结余）、按日分组流水、当日小计、点击删除 |
| 图表 | SVG 环形占比图、分类排行榜（带进度条）、近半年收支趋势柱状图 |
| 记一笔 | 支出/收入切换、14+8 类 emoji 分类网格、自定义数字键盘、备注/日期/账户 |
| 账户 | 现金/银行卡/支付宝/微信/信用卡，余额由流水自动汇总 |
| 我的 | 导出 CSV、清空数据、预算/分类/提醒/云同步入口 |

- 数据存 `localStorage`，完全离线可用；首次启动自动生成近半年示例数据
- 配色遵循国内惯例：**支出红、收入绿**；品牌色 `#FF9500`
- 打包了 Noto Color Emoji 字体子集，任何设备都能正确显示分类图标

## 命令

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 构建到 dist/
npm run preview      # 预览构建产物 http://localhost:4173
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
