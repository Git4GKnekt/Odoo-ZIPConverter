import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { execSync } from 'child_process';

function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  define: {
    '__BUILD_HASH__': JSON.stringify(getGitHash()),
    '__BUILD_TIME__': JSON.stringify(new Date().toISOString().slice(0, 16))
  },
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
