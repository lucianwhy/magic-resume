import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { blankResumeState } from "../src/config/initialResumeData";
import { apiURL, patchResume, projectResume, errorDetails, AgentError, ResumeAgentClient } from "../src/agent/resume-client";

const resume = () => ({ ...structuredClone(blankResumeState), id: randomUUID(), title: "测试", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z", templateId: "classic", activeSection: "basic", draggingProjectId: null });
test("nested patches preserve omitted fields, images and sibling values", () => {
  const original = resume(); original.basic.photo = "photo"; original.basic.githubKey = "secret"; original.basic.email = "email@example.com";
  const updated = patchResume(original, { basic: { name: "新姓名" }, globalSettings: { baseFontSize: 18 } });
  assert.equal(updated.basic.name, "新姓名"); assert.equal(updated.basic.email, original.basic.email);
  assert.equal(updated.basic.photo, "photo"); assert.equal(updated.basic.githubKey, "secret");
  assert.equal(updated.globalSettings.baseFontSize, 18); assert.equal(updated.globalSettings.themeColor, original.globalSettings.themeColor);
  assert.equal(original.basic.name, "");
});
test("arrays replace, optional nulls remove fields and unknown legacy fields remain", () => {
  const original = resume(); original.basic.customFields = [{ id: "one", label: "链接", value: "value" }];
  original.basic.layout = "left";
  const updated = patchResume(original, { basic: { customFields: [], layout: null }, templateId: null });
  assert.deepEqual(updated.basic.customFields, []); assert.equal(updated.basic.layout, undefined); assert.equal(updated.templateId, null);
});
test("certificate arrays retain omitted image URLs by id without restoring deleted items", () => {
  const original = resume(); original.certificates = [{ id: "keep", url: "large-image", width: 50 }, { id: "remove", url: "another-image", width: 50 }];
  const updated = patchResume(original, { certificates: [{ id: "keep", width: 80 }] });
  assert.deepEqual(updated.certificates, [{ id: "keep", url: "large-image", width: 80 }]);
  assert.throws(() => patchResume(original, { certificates: [{ id: "new", width: 50 }] }));
  assert.equal(patchResume(original, { certificates: [{ id: "keep", width: 80, url: "replacement" }] }).certificates[0].url, "replacement");
});
test("patches reject identity changes, prototype keys and malformed nested fields", () => {
  for (const patch of [{ id: "other" }, { createdAt: "2024" }, { updatedAt: "2024" }, { typo: "x" }, {}, { basic: { name: 3 } }, { globalSettings: { baseFontSize: "18" } }, { education: [{ id: "x", school: {} }] }, { basic: { fieldOrder: {} } }, { menuSections: [{ id: "x", enabled: "yes" }] }, JSON.parse('{"basic":{"__proto__":{"polluted":true}}}')]) {
    assert.throws(() => patchResume(resume(), patch));
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
test("get projections and conflict details never expose credentials or large image fields", () => {
  const document = resume(); document.basic.githubKey = "sensitive-token"; document.basic.photo = "large-image";
  document.certificates = [{ id: "one", url: "large-certificate", width: 50 }];
  const record = { resume: document, revision: 7 };
  const projected = projectResume(record); const text = JSON.stringify(projected);
  assert.ok(!text.includes("sensitive-token") && !text.includes("large-image") && !text.includes("large-certificate"));
  assert.equal((projectResume(record, { includeImages: true }).resume.basic as Record<string, unknown>).photo, "large-image");
  assert.equal((projectResume(record, { sections: ["skillContent"] }).resume).basic, undefined);
  assert.ok(!JSON.stringify(errorDetails(new AgentError("revisionConflict", "conflict", 409, record))).includes("sensitive-token"));
  assert.equal(document.basic.githubKey, "sensitive-token");
});
test("API targets are restricted to local HTTP origins", () => {
  assert.equal(apiURL("http://localhost:3001"), "http://localhost:3001");
  for (const value of ["https://example.com", "http://example.com", "http://user:pass@localhost:3000", "http://localhost:3000/subpath", "file:///etc/passwd", "http://localhost:3000/?key=secret"]) assert.throws(() => apiURL(value));
});
test("unavailable API yields an actionable error without credentials", async () => {
  const client = new ResumeAgentClient("http://127.0.0.1:1");
  await assert.rejects(client.list(), { code: "connectionFailed", status: 503 });
});
