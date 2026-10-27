import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` startet mit HTTPS im LAN, weil Web Crypto und Mikrofon einen sicheren Kontext brauchen
export default defineConfig(({ mode }) => ({
  base: '/papa-birthday/',
  plugins: mode === 'phone' ? [basicSsl()] : [],
  build: { sourcemap: false },
}));
