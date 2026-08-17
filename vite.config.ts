import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    react(),
    ...(command === "build" ? [nitro({ preset: "vercel" })] : []),
  ],
  css: {
    transformer: "lightningcss",
  },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@tanstack/router-core",
      "@tanstack/router-core/ssr/client",
      "seroval",
      "recharts",
      "lucide-react",
      "sonner",
    ],
  },
  server: {
    warmup: {
      clientFiles: [
        "./src/routes/__root.tsx",
        "./src/routes/index.tsx",
        "./src/components/AppShell.tsx",
      ],
    },
    hmr: { overlay: true },
  },
}));
