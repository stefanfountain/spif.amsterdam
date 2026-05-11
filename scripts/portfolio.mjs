#!/usr/bin/env node
/**
 * Portfolio PDF generator for spif.amsterdam
 *
 * Renders /slides/ via headless Chrome → PDF at exact 1920×1080 per page.
 * Pipes through ghostscript /printer preset to shrink while keeping 300dpi images.
 *
 * Usage:
 *   npm run portfolio          # captures https://spif.amsterdam/slides/
 *   npm run portfolio:local    # spins up local http.server on port 8765
 *
 * Output:
 *   ../../../2026-vox-arboris-show/docs/applications/nxt-night-academy/portfolio/
 *     spif-amsterdam-slides.pdf            (compressed, upload-ready)
 *     spif-amsterdam-slides.raw.pdf        (uncompressed, kept for inspection)
 */

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(
  __dirname,
  "../../2026-vox-arboris-show/docs/applications/nxt-night-academy/portfolio"
);
const RAW_PDF = resolve(OUT_DIR, "spif-amsterdam-slides.raw.pdf");
const FINAL_PDF = resolve(OUT_DIR, "spif-amsterdam-slides.pdf");

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const useLocal = args.includes("--local");
const LOCAL_PORT = 8765;
const LIVE_URL = "https://spif.amsterdam/slides/";
const LOCAL_URL = `http://localhost:${LOCAL_PORT}/slides/`;

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

async function startLocalServer() {
  console.log(`→ Starting local server on :${LOCAL_PORT} (root: ${SITE_ROOT})`);
  const proc = spawn("python3", ["-m", "http.server", String(LOCAL_PORT)], {
    cwd: SITE_ROOT,
    stdio: ["ignore", "ignore", "ignore"],
  });
  // Wait briefly for the server to bind
  await new Promise((r) => setTimeout(r, 1500));
  return proc;
}

function compressWithGhostscript(input, output) {
  console.log(`→ Compressing via ghostscript /printer preset`);
  const r = spawnSync(
    "gs",
    [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.5",
      "-dPDFSETTINGS=/printer",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-dDetectDuplicateImages=true",
      `-sOutputFile=${output}`,
      input,
    ],
    { stdio: "inherit" }
  );
  if (r.status !== 0) {
    throw new Error(`ghostscript exited with code ${r.status}`);
  }
}

async function main() {
  if (!existsSync(CHROME_PATH)) {
    throw new Error(
      `Chrome not found at ${CHROME_PATH}. Install Google Chrome or edit CHROME_PATH.`
    );
  }
  if (!existsSync(OUT_DIR)) {
    throw new Error(
      `Output dir not found: ${OUT_DIR}. Run from inside the vox-arboris-show workspace.`
    );
  }

  let serverProc = null;
  if (useLocal) {
    serverProc = await startLocalServer();
  }
  const url = useLocal ? LOCAL_URL : LIVE_URL;

  console.log(`→ Launching headless Chrome`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--hide-scrollbars",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });

    console.log(`→ Loading ${url}`);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

    // Wait for slides to be present + give fonts/images a beat to settle
    await page.waitForSelector(".slide", { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    // Wait for all <img> elements to actually decode
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise((res) => {
                img.addEventListener("load", res, { once: true });
                img.addEventListener("error", res, { once: true });
              })
        )
      );
    });
    await new Promise((r) => setTimeout(r, 1500));

    console.log(`→ Generating PDF (1920×1080 per page)`);
    await page.pdf({
      path: RAW_PDF,
      width: "1920px",
      height: "1080px",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
    if (serverProc) {
      serverProc.kill();
      console.log(`→ Stopped local server`);
    }
  }

  const rawSize = statSync(RAW_PDF).size;
  console.log(`→ Raw PDF: ${RAW_PDF}  (${fmtMB(rawSize)})`);

  compressWithGhostscript(RAW_PDF, FINAL_PDF);

  const finalSize = statSync(FINAL_PDF).size;
  console.log(`→ Final PDF: ${FINAL_PDF}  (${fmtMB(finalSize)})`);
  console.log(``);
  console.log(`Done. Upload candidate: ${FINAL_PDF}`);
}

main().catch((err) => {
  console.error("\n✗ Portfolio generation failed:");
  console.error(err);
  process.exit(1);
});
