import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  plugins: [react()], build: { outDir: 'dist-demo' },
  resolve: { alias: [{ find: /^(\.\.?\/)+lib\/supabase\.js$/, replacement: path.resolve('demo/mock-supabase.js') }] },
});
