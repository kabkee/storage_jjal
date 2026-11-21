// Plugins
import Components from 'unplugin-vue-components/vite'
import Vue from '@vitejs/plugin-vue'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import ViteFonts from 'unplugin-fonts/vite'
import VueRouter from 'unplugin-vue-router/vite'
import AdminPlugin from './admin/vite-plugin-admin.mjs'

// Utilities
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    VueRouter(),
    Vue({
      template: { transformAssetUrls }
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    Components(),
    ViteFonts({
      google: {
        families: [{
          name: 'Roboto',
          styles: 'wght@100;300;400;500;700;900',
        }],
      },
    }),
    // 로컬 관리 화면(/admin) API — dev 서버 전용
    AdminPlugin(),
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 3000,
    // 개발 서버는 Tailscale https(https://kabkee-main.tailfe017f.ts.net:8445 → :3010)로도 연다 — 클립보드 복사는 https 에서만 됨.
    // Vite 5.4.12+ 는 모르는 Host 를 막으므로 tailnet 이름을 허용해 둔다
    allowedHosts: ['.ts.net'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    },
    assetsInlineLimit: 0,
  }
})
