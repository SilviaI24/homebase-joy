// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Pre-bundle late-discovered deps to avoid "optimized dependencies changed → reloading"
    // mid-session, which causes a blank screen flash during HMR.
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
  },
});
