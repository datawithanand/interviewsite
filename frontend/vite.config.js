import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import monacoEditorPluginModule from 'vite-plugin-monaco-editor';

// CJS/ESM interop: the plugin's default export lands in different spots
// depending on how it's resolved.
const monacoEditorPlugin = monacoEditorPluginModule.default || monacoEditorPluginModule;

export default defineConfig({
  plugins: [
    react(),
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'json', 'typescript'],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
