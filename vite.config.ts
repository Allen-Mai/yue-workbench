import { defineConfig } from 'vite';

/**
 * 按需构建：单入口、无 polyfill、无运行时框架依赖。
 * 目标体积：gzip < 500KB（实际约 40KB 量级）。
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    minify: 'esbuild',
    assetsInlineLimit: 4096,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 600,
    // 不注入 modulepreload 内联 polyfill：目标是 ES2020，不需要，
    // 且内联脚本会被 vercel.json 里的严格 CSP（script-src 'self'）拦截。
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      // 忽略各种临时/校验文件，避免 Windows 上的 EBUSY 把 dev server 拖垮
      ignored: ['**/node_modules/**', '**/dist/**', '**/.*.tmpdir/**', '**/._*', '**/*.tmp', '**/.dsh-check/**'],
    },
  },
  preview: { port: 4173, host: true },
});
