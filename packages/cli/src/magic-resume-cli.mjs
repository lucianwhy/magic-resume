#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const [command, ...args] = process.argv.slice(2);
const baseUrl = (process.env.MAGIC_RESUME_URL || "http://localhost:3000").replace(/\/$/, "");
const apiKey = process.env.MAGIC_RESUME_API_KEY;

const usage = () => {
  console.log(`Magic Resume CLI

Usage:
  magic-resume list
  magic-resume get <id>
  magic-resume put <resume.json>
  magic-resume patch <id> <patch.json>
  magic-resume delete <id>

Environment:
  MAGIC_RESUME_URL=http://localhost:3000
  MAGIC_RESUME_API_KEY=<same value as RESUME_API_KEY>`);
};

const request = async (path, options = {}) => {
  if (!apiKey) {
    throw new Error("MAGIC_RESUME_API_KEY is required");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.error || `${response.status} ${response.statusText}`);
  }
  return body;
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

try {
  let result;
  switch (command) {
    case "list":
      result = await request("/api/resumes");
      break;
    case "get":
      if (!args[0]) throw new Error("Missing resume id");
      result = await request(`/api/resumes/${encodeURIComponent(args[0])}`);
      break;
    case "put": {
      if (!args[0]) throw new Error("Missing resume JSON file");
      const resume = await readJson(args[0]);
      if (typeof resume?.id !== "string") throw new Error("Resume JSON needs string id");
      result = await request(`/api/resumes/${encodeURIComponent(resume.id)}`, {
        method: "PUT",
        body: JSON.stringify(resume),
      });
      break;
    }
    case "patch":
      if (!args[0] || !args[1]) throw new Error("Usage: magic-resume patch <id> <patch.json>");
      result = await request(`/api/resumes/${encodeURIComponent(args[0])}`, {
        method: "PATCH",
        body: JSON.stringify(await readJson(args[1])),
      });
      break;
    case "delete":
      if (!args[0]) throw new Error("Missing resume id");
      await request(`/api/resumes/${encodeURIComponent(args[0])}`, { method: "DELETE" });
      result = { deleted: args[0] };
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      usage();
      process.exit(0);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
