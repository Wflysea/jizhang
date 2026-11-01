/* 将 package.json 的版本号同步到安卓工程（versionName / versionCode）
 * versionCode 规则：major*10000 + minor*100 + patch（如 1.2.3 → 10203）
 */
const fs = require('fs')
const path = require('path')

const pkg = require('../package.json')
const version = pkg.version
const [maj, min, pat] = version.split('.').map(n => parseInt(n, 10) || 0)
const versionCode = maj * 10000 + min * 100 + pat

const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle')
let s = fs.readFileSync(gradlePath, 'utf8')

if (!/versionCode\s+\d+/.test(s) || !/versionName\s+"[^"]*"/.test(s)) {
  console.error('未在 android/app/build.gradle 中找到 versionCode / versionName')
  process.exit(1)
}

s = s.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
s = s.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`)
fs.writeFileSync(gradlePath, s)

console.log(`✓ 版本已同步：versionName=${version}  versionCode=${versionCode}`)
