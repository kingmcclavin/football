/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps asset URLs relative so the build works on any static host,
// including GitHub Pages project sites served from a sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2019', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
