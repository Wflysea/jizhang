/* 一键发布：版本号递增 → 构建 → 打包 APK → 更新下载站 → 发布上线 → Git 提交打标签
 *
 * 用法：
 *   node scripts/release.cjs                    # 修订号 +1（1.2.0 → 1.2.1）
 *   node scripts/release.cjs --type=minor       # 次版本号 +1（1.2.0 → 1.3.0）
 *   node scripts/release.cjs --msg="feat: ..."  # 指定提交信息
 *   node scripts/release.cjs --no-git           # 跳过 Git 提交与打标签
 *   node scripts/release.cjs --no-publish       # 只构建打包，不发布上线
 *   node scripts/release.cjs --no-release       # 跳过 GitHub Release 上传
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const APP_DIR = path.join(__dirname, '..')
const ROOT_DIR = path.join(APP_DIR, '..')
const SITE_DIR = path.join(ROOT_DIR, 'download-site')
const PUBLISH_SCRIPT = '/root/.codebuddy/skills/sites/scripts/publish.js'
const GH_REPO = 'Wflysea/jizhang'

const args = process.argv.slice(2)
const opt = key => {
  const hit = args.find(a => a.startsWith(`--${key}=`))
  return hit ? hit.slice(key.length + 3) : null
}
const has = key => args.includes(`--${key}`)

const bumpType = opt('type') || 'patch'
const commitMsg = opt('msg') || ''
const doGit = !has('no-git')
const doPublish = !has('no-publish')
const doRelease = !has('no-release')

const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || '/root/.sdkman/candidates/java/20.fx-zulu',
  ANDROID_HOME: process.env.ANDROID_HOME || '/opt/android-sdk'
}
// Gradle：优先本机已装版本，回落 gradlew
const GRADLE = fs.existsSync('/opt/gradle-8.7/bin/gradle')
  ? '/opt/gradle-8.7/bin/gradle'
  : './gradlew'

function run(cmd, cwd = APP_DIR) {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { cwd, env, stdio: 'inherit', shell: '/bin/bash' })
}

function step(title) {
  console.log(`\n================ ${title} ================`)
}

/* ---------- 1. 版本号递增 ---------- */
step('1/6 版本号递增')
const prevVersion = require(path.join(APP_DIR, 'package.json')).version
run(`npm version ${bumpType} --no-git-tag-version`)
run('node scripts/sync-version.cjs')
const version = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version
console.log(`版本号：${prevVersion} → ${version}`)

/* ---------- 2. 构建 Web 产物 ---------- */
step('2/6 构建 Web 产物')
run('npm run build')

/* ---------- 3. 同步并打包正式签名 APK ---------- */
step('3/6 同步 Capacitor 并打包正式签名 APK')
run('npx cap sync android')
run(`${GRADLE} assembleRelease --no-daemon`, path.join(APP_DIR, 'android'))

const apkSrc = path.join(APP_DIR, 'android/app/build/outputs/apk/release/app-release.apk')
if (!fs.existsSync(apkSrc)) {
  console.error('✗ 未找到 APK 产物，发布中止（请确认 android/keystore.properties 与 release-key.jks 存在）')
  process.exit(1)
}
const apkSize = fs.statSync(apkSrc).size
const sizeMB = (apkSize / 1024 / 1024).toFixed(1)
console.log(`APK：${apkSize} 字节（${sizeMB} MB）`)

/* ---------- 4. 更新下载站 ---------- */
step('4/6 更新下载站')
const apkDst = path.join(SITE_DIR, 'xiaowang-jizhang.apk')
fs.copyFileSync(apkSrc, apkDst)

const htmlPath = path.join(SITE_DIR, 'index.html')
let html = fs.readFileSync(htmlPath, 'utf8')
// 注意：体积替换只匹配 HTML 标签内的文本（>xx MB<），
// 不能裸匹配 "xxMB" —— 会误伤 base64 图片数据（内联图标）
html = html.replace(/v\d+\.\d+\.\d+/g, `v${version}`)
html = html.replace(/小王记账-v\d+\.\d+\.\d+\.apk/g, `小王记账-v${version}.apk`)
html = html.replace(/>(\d+(\.\d+)?)\s*MB</g, `>${sizeMB} MB<`)
fs.writeFileSync(htmlPath, html)
console.log(`下载页已更新：v${version} / ${sizeMB} MB`)

/* ---------- 5. 发布上线 ---------- */
let publishOut = ''
if (doPublish) {
  step('5/7 发布下载站')
  try {
    publishOut = execSync(
      `node ${PUBLISH_SCRIPT} --dir ${SITE_DIR} --language node 2>&1`,
      { env, shell: '/bin/bash', maxBuffer: 1024 * 1024 * 8 }
    ).toString()
    console.log(publishOut.trim().split('\n').slice(-6).join('\n'))
  } catch (e) {
    console.error('✗ 下载站发布失败（不影响后续 GitHub Release 与 Git 推送）')
  }
} else {
  step('5/7 发布下载站（已跳过 --no-publish）')
}

/* ---------- 6. 发布到 GitHub Release（固定的「最新版」Release） ----------
 * 不每个版本单独建 Release，而是始终更新同一个 Release（标签 latest），
 * 让用户始终从同一个入口拿到最新安装包。代码版本标签 vX.Y.Z 仍照常打（见第 7 步）。
 */
if (doRelease) {
  step('6/7 发布到 GitHub Release（最新版）')
  const tag = 'latest'
  const title = '小王记账 最新版'
  const notes = `小王记账 最新正式签名安装包：v${version}（${sizeMB} MB）\n\n- 安装包：${path.basename(apkSrc)}\n- 对应版本：v${version}\n- 提交信息：${commitMsg || 'chore: 发布 v' + version}\n\n历史版本可在 Git 标签 v${version} 中查看源码。`
  const relEnv = { ...env, GH_TOKEN: process.env.GH_TOKEN || env.GH_TOKEN || '' }
  try {
    // 先删除旧的「最新版」Release 与标签，再重建（保证始终是最新 APK）
    try {
      execSync(`gh release delete latest --repo ${GH_REPO} --yes`, { env: relEnv, shell: '/bin/bash', stdio: 'ignore' })
    } catch (e) { /* 不存在则忽略 */ }
    try {
      execSync(`git push origin :refs/tags/latest`, { env: relEnv, shell: '/bin/bash', stdio: 'ignore' })
    } catch (e) { /* 不存在则忽略 */ }
    execSync(
      `gh release create ${tag} "${apkSrc}" --repo ${GH_REPO} --title "${title}" --notes "${notes.replace(/"/g, '\\"')}" --latest`,
      { env: relEnv, shell: '/bin/bash', stdio: 'inherit' }
    )
    console.log(`✓ 已更新 GitHub Release（最新版）：${tag}`)
  } catch (e) {
    console.error('✗ GitHub Release 发布失败（请确认 gh 已登录且具备权限，或手动发布）')
  }
} else {
  step('6/7 发布到 GitHub Release（已跳过 --no-release）')
}

/* ---------- 7. Git 提交与标签并推送到远端 ---------- */
if (doGit) {
  step('7/7 Git 提交、打标签并推送')
  const msg = commitMsg || `chore: 发布 v${version}`
  const fullMsg = `${msg}\n\n- 版本 v${version}，安装包 ${sizeMB} MB（自动发布脚本生成）`
  fs.writeFileSync('/tmp/_release_msg.txt', fullMsg)
  try {
    run('git add -A', ROOT_DIR)
    execSync('git commit -F /tmp/_release_msg.txt', { cwd: ROOT_DIR, env, stdio: 'inherit' })
  } catch (e) {
    console.log('（无变更需要提交，跳过）')
  }
  try {
    execSync(`git tag v${version}`, { cwd: ROOT_DIR, env, stdio: 'inherit' })
  } catch (e) {
    console.log(`（标签 v${version} 已存在，跳过）`)
  }
  try {
    run('git push origin main', ROOT_DIR)
    run(`git push origin v${version}`, ROOT_DIR)
  } catch (e) {
    console.log('（推送远端失败，请检查网络/权限后手动推送）')
  }
  // 第 6 步建 Release 时 main 尚未推送本次提交，latest 标签会指向上一版提交。
  // 这里把 latest 标签强制对齐到本次发布提交，保证「最新版」源码快照与 APK 同版。
  if (doRelease && (process.env.GH_TOKEN || env.GH_TOKEN)) {
    try {
      const head = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, env }).toString().trim()
      execSync(
        `gh api -X PATCH repos/${GH_REPO}/git/refs/tags/latest -f sha=${head} -F force=true`,
        { env: { ...env, GH_TOKEN: process.env.GH_TOKEN || env.GH_TOKEN }, shell: '/bin/bash', stdio: 'ignore' }
      )
      console.log('✓ latest 标签已对齐到本次发布提交')
    } catch (e) {
      console.log('（latest 标签对齐失败，可忽略；不影响 Release 资产下载）')
    }
  }
} else {
  step('7/7 Git 提交与标签（已跳过 --no-git）')
}

console.log(`\n✅ 发布完成：v${version}（${sizeMB} MB，已签名）`)
