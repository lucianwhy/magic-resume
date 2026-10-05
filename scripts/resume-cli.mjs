#!/usr/bin/env node
import { register } from "tsx/esm/api";
import { fileURLToPath } from "node:url";
register({ tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)) });
await import("../src/agent/cli.ts");
