import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (!process.env.DATABASE_URL && env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
  return {
  server: {
    host: "127.0.0.1",
    port: 3000
  },
  optimizeDeps: {
    exclude: ["pdfjs-dist"]
  },
  ssr: {
    noExternal: ["pdfjs-dist"]
  },
  plugins: [
    {
      name: "local-resume-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if ((req.url?.split("?")[0].startsWith("/api/resumes") || req.url?.split("?")[0].startsWith("/api/workspace")) &&
              !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) {
            res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ code: "localAccessOnly" }));
            return;
          }
          next();
        });
      },
    },
    tsconfigPaths(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "routes"
      }
    }),
    viteReact()
  ]
  };
});
