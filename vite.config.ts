import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@radix-ui")) return "radix-vendor";
          if (id.includes("@tanstack/react-query")) return "query-vendor";

          if (id.includes("@nktkas/hyperliquid")) return "hyperliquid-vendor";
          if (id.includes("micro-eth-signer")) return "ethers-vendor";
          if (id.includes("ethers")) return "ethers-vendor";

          if (id.includes("lightweight-charts")) return "lightweight-charts-vendor";
          if (id.includes("recharts")) return "recharts-vendor";

          if (id.includes("framer-motion")) return "framer-motion-vendor";
          if (id.includes("lucide-react")) return "lucide-vendor";

          if (id.includes("react-router")) return "react-vendor";
          if (id.includes("react-dom")) return "react-vendor";
          if (id.includes("scheduler")) return "react-vendor";
          if (/[/\\]node_modules[/\\]react[/\\]/.test(id)) return "react-vendor";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
