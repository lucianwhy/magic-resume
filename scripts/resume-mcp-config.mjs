import { fileURLToPath } from "node:url";
const { register } = await import("tsx/esm/api");
register({ tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)) });
const { apiURL } = await import("../src/agent/resume-client.ts");
console.log(JSON.stringify({ mcpServers: { "magic-resume": {
  command: process.execPath,
  args: [fileURLToPath(new URL("./resume-mcp.mjs", import.meta.url))],
  env: { MAGIC_RESUME_API_URL: apiURL() },
} } }, null, 2));
