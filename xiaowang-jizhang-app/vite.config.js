import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 构建产物为相对路径，便于 Capacitor 直接加载 file:// 本地资源
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
