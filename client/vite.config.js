import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// CC_HTTPS=1 enables self-signed HTTPS so mic access (getUserMedia)
// works when testing from other devices on the LAN.
const useHttps = process.env.CC_HTTPS === '1';

export default defineConfig({
  plugins: useHttps ? [basicSsl()] : [],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
      },
    },
  },
});
