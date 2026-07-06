import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { copyFileSync, renameSync, existsSync, readdirSync, rmdirSync, readFileSync, writeFileSync, rmSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'clean-dist-wallpaper',
      buildStart() {
        const distDir = path.resolve(__dirname, 'dist-wallpaper');
        if (existsSync(distDir)) {
          rmSync(distDir, { recursive: true, force: true });
        }
      },
    },
    {
      name: 'copy-wallpaper-assets',
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist-wallpaper');
        copyFileSync(path.resolve(__dirname, 'wallpaper/project.json'), path.join(distDir, 'project.json'));
        copyFileSync(path.resolve(__dirname, 'wallpaper/preview.gif'), path.join(distDir, 'preview.gif'));
      },
    },
    {
      name: 'flatten-wallpaper-output',
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist-wallpaper');
        const nested = path.join(distDir, 'wallpaper');
        if (existsSync(nested)) {
          for (const file of readdirSync(nested)) {
            const src = path.join(nested, file);
            const dest = path.join(distDir, file);
            renameSync(src, dest);
          }
          rmdirSync(nested);
        }
        const htmlFile = path.join(distDir, 'index.html');
        if (existsSync(htmlFile)) {
          let html = readFileSync(htmlFile, 'utf-8');
          html = html.replace(/\.\.\/(assets\/)/g, '$1');
          writeFileSync(htmlFile, html, 'utf-8');
        }
      },
    },
  ],
  base: './',
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-wallpaper'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'wallpaper/index.html'),
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
