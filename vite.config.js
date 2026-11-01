/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Which host built the site: Cloudflare Pages sets CF_PAGES during its build (src/lib/img.js picks the
  // matching image service).
  define: { __IMAGE_HOST__: JSON.stringify(process.env.CF_PAGES ? 'cloudflare' : 'netlify') },
})
