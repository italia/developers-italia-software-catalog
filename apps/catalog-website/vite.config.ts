import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'
import path from 'path'

// Lo SCSS di bootstrap-italia fa `@use '@splidejs/splide/src/css/core/index'`, ma il campo
// `exports` di @splidejs/splide non espone quel percorso: l'alias punta direttamente alla
// cartella del pacchetto. Il percorso va risolto a partire da bootstrap-italia perché con
// l'install isolato di bun il pacchetto non è in apps/catalog/node_modules.
const requireFromHere = createRequire(path.join(__dirname, 'vite.config.ts'))
const bootstrapItaliaDir = path.dirname(requireFromHere.resolve('bootstrap-italia/package.json'))
const splideDir = path.dirname(
  createRequire(path.join(bootstrapItaliaDir, 'package.json')).resolve('@splidejs/splide/package.json'),
)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
      },
    },
  },
  resolve: {
    alias: {
      '@splidejs/splide': splideDir,
    },
  },
})
