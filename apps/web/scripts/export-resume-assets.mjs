import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const importUrl = process.env.RESUME_IMPORT_URL;
const outputDir = process.env.RESUME_OUTPUT_DIR || "../outputs";
const resumeId = "wang-haoyue-ai-application-intern";

if (!importUrl) {
  throw new Error("RESUME_IMPORT_URL is required");
}

const baseUrl = new URL(importUrl).origin;
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

try {
  await page.goto(importUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  await page.goto(`${baseUrl}/app/workbench/${resumeId}`, {
    waitUntil: "networkidle",
  });
  const preview = page.locator("#resume-preview");
  await preview.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(800);

  await preview.screenshot({
    path: `${outputDir}/王皓月_AI应用开发实习生.png`,
    type: "png",
  });

  await page.evaluate(() => {
    const preview = document.querySelector("#resume-preview");
    if (!preview) throw new Error("Resume preview not found");
    const standalone = preview.cloneNode(true);
    standalone.style.transform = "none";
    standalone.style.margin = "0";
    standalone.style.width = "210mm";
    standalone.style.minHeight = "297mm";
    document.body.replaceChildren(standalone);
  });
  await page.addStyleTag({
    content: `
      @page { size: A4; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      #resume-preview { box-sizing: border-box !important; }
    `,
  });
  await page.pdf({
    path: `${outputDir}/王皓月_AI应用开发实习生.pdf`,
    format: "A4",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
} finally {
  await browser.close();
}
