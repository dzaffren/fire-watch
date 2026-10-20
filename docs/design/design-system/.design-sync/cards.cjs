const { chromium } = require(process.argv[2]);
const fs = require("fs"), path = require("path");
(async () => {
  const b = await chromium.launch();
  const dir = process.argv[3], out = process.argv[4];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".html")).sort()) {
    const p = await b.newPage({ viewport: { width: 1200, height: 700 } });
    const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    p.on("requestfailed", r => errs.push("failed " + r.url()));
    await p.goto("file://" + path.resolve(dir, f), { waitUntil: "networkidle" });
    await p.waitForTimeout(300);
    const first = fs.readFileSync(path.join(dir, f), "utf8").split("\n")[0];
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.screenshot({ path: path.join(out, f.replace(".html", ".png")), fullPage: true });
    console.log(f, "height", h, first.startsWith("<!-- @dsCard") ? "dsCard ok" : "NO dsCard", errs.length ? errs.join("; ") : "no errors");
    await p.close();
  }
  await b.close();
})();
