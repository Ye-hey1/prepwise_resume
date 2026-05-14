import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    {
      name: 'patch-html2canvas',
      transform(code: string, id: string) {
        if (id.includes('html2canvas') && code.includes('Attempting to parse an unsupported color function')) {
          // Replace throwing an error with returning transparent (value 0)
          return code.replace(
            /throw new Error\("Attempting to parse an unsupported color function "[^;]+;/g,
            'return 0;'
          )
        }
      }
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (
            id.includes('/node_modules/vue/') ||
            id.includes('/node_modules/pinia/') ||
            id.includes('/node_modules/vue-router/')
          ) {
            return 'vendor-vue'
          }

          if (id.includes('/node_modules/markdown-it/')) {
            return 'vendor-markdown'
          }

          if (
            id.includes('/node_modules/three/') ||
            id.includes('/node_modules/@pixiv/three-vrm/')
          ) {
            if (id.includes('/node_modules/three/addons/')) {
              return 'vendor-three-loaders'
            }
            if (id.includes('/node_modules/@pixiv/three-vrm/')) {
              return 'vendor-vrm'
            }
            return 'vendor-three-core'
          }

          if (id.includes('/node_modules/pdfjs-dist/')) {
            return 'vendor-pdf'
          }

          if (id.includes('/node_modules/html2canvas/')) {
            return 'vendor-html2canvas'
          }

          if (id.includes('/node_modules/html2pdf.js/')) {
            return 'vendor-html2pdf'
          }

          if (id.includes('/node_modules/jspdf/')) {
            return 'vendor-jspdf'
          }

          if (id.includes('/node_modules/mammoth/')) {
            return 'vendor-mammoth'
          }

          if (id.includes('/node_modules/tesseract.js/')) {
            return 'vendor-tesseract'
          }

          if (id.includes('/node_modules/highlight.js/')) {
            return 'vendor-highlight'
          }
        },
      },
    },
  },
})
