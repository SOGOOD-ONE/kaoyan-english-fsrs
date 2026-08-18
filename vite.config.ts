import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [],
  build: {
    target: "es2020",
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Split large dependencies into separate chunks for better caching
          "vendor-fsrs": ["ts-fsrs"],
          "vendor-xlsx": ["xlsx"],
          "vendor-idb": ["idb"],
        },
      },
    },
    // Enable brotli size info in build output
    brotliSize: true,
    chunkSizeWarningLimit: 500,
  },
});
