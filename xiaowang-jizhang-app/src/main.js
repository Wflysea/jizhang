import { createApp } from 'vue'
import App from './App.vue'
// 图标依赖系统 emoji 字体（Android/iOS/桌面均自带），不打包字体文件以减小安装包体积
import './styles/global.css'

createApp(App).mount('#app')
