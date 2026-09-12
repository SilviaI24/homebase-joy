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
    // src/lib/auth.server.ts importa getCookies de aquí — este paquete es
    // solo-servidor y su entry point usa módulos virtuales
    // (#tanstack-router-entry, tanstack-start-manifest:v) que solo el
    // propio Vite sabe resolver en tiempo de dev, no esbuild. Sin este
    // exclude, el escaneo de optimizeDeps intenta pre-empaquetarlo con
    // esbuild y `vite dev` no arranca (12 sep 2026).
    exclude: ["@tanstack/start-server-core"],
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
