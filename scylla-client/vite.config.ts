import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      host: env.HOST || '0.0.0.0',
      port: parseInt(env.PORT || '3009'),
    },
    preview: {
      host: env.HOST || '0.0.0.0',
      port: parseInt(env.PORT || '3009'),
    },
  }
})
