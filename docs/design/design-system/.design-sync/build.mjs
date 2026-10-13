// Builds ./ds-bundle for claude.ai/design from this CSS-only design system.
// The design-sync converter needs a JS package; this folder has none, so the
// upload layout is assembled here. Run from docs/design/design-system:
//   node .design-sync/build.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'ds-bundle';
const cfg = JSON.parse(readFileSync('.design-sync/config.json', 'utf8'));

if (existsSync(OUT) && !existsSync(`${OUT}/_ds_bundle.js`)) {
  console.error(`refusing to replace ${OUT}/: it is not a previous bundle`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
// The validator scans components/ even when there are none.
mkdirSync(`${OUT}/components`, { recursive: true });

cpSync('styles.css', `${OUT}/styles.css`);
cpSync('tokens', `${OUT}/tokens`, { recursive: true });
cpSync('guidelines', `${OUT}/guidelines`, { recursive: true });

const header = cfg.readmeHeader ? readFileSync(cfg.readmeHeader, 'utf8').trimEnd() + '\n\n' : '';
writeFileSync(`${OUT}/README.md`, header + readFileSync('readme.md', 'utf8'));

// No components: an empty bundle with the header the app's self-check reads.
const meta = { namespace: cfg.globalName, components: [], sourceHashes: {}, inlinedExternals: [], builtBy: 'cc-design-sync' };
writeFileSync(`${OUT}/_ds_bundle.js`, `/* @ds-bundle: ${JSON.stringify(meta)} */\nwindow.${cfg.globalName} = window.${cfg.globalName} || {};\n`);
writeFileSync(`${OUT}/.ds-build-meta.json`, JSON.stringify({ componentCount: 0, shape: 'package', pkg: cfg.pkg }, null, 2) + '\n');
writeFileSync(`${OUT}/_ds_needs_recompile`, JSON.stringify({ by: 'design-sync-cli' }) + '\n');

console.error(`built ${OUT}/ (window.${cfg.globalName}, 0 components, ${header ? 'with' : 'no'} readme header)`);
