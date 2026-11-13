#!/usr/bin/env node
// shot <url> <out.png> [WxH] [--full] : screenshot a page with headless Chromium
const { chromium } = require("playwright");
const [url, out, size = "1280x800", ...flags] = process.argv.slice(2);
if (!url || !out) { console.error("usage: shot <url> <out.png> [WxH] [--full]"); process.exit(2); }
const [width, height] = size.split("x").map(Number);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width, height } });
  await p.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await p.screenshot({ path: out, fullPage: flags.includes("--full") });
  await b.close();
  console.log(out);
})().catch((e) => { console.error(e.message); process.exit(1); });
