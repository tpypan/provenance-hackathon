import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api and /verify to the verifier so the browser talks to the same origin (no
// CORS, no hardcoded host). BACKEND_ORIGIN defaults to localhost for `npm run dev` and is
// set to http://verifier:8000 by docker-compose.
const backend = process.env.BACKEND_ORIGIN ?? 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // required for Docker to expose the port
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/verify': { target: backend, changeOrigin: true },
    },
  },
})
