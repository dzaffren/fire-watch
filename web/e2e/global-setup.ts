import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { fingerprint, type MatchedDetection } from "../src/fingerprint";
import {
  ADMIN_DATABASE_URL,
  API_PORT,
  API_URL,
  ANVIL_PORT,
  CONTRACT_ADDRESS,
  E2E_DATABASE,
  E2E_DATABASE_URL,
  FIRE_RUNS_ADDRESS,
  FIRMS_PORT,
  FIRMS_URL,
  NEW_RECORDER_ADDRESS,
  NEW_RECORDER_PRIVATE_KEY,
  OWNER_ADDRESS,
  OWNER_PRIVATE_KEY,
  RECORDER_ADDRESS,
  RECORDER_PRIVATE_KEY,
  RPC_URL,
  WEB_PORT,
  WEB_URL,
} from "./env";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const ROOT = resolve(WEB, "..");
const CONTRACTS = resolve(ROOT, "contracts");
const API = resolve(ROOT, "api");
// The fixture server answers with both files' rows acquired before the run that asks.
const FIRMS_CSVS = ["fire-record.csv", "fire-origin.csv"].map((f) => resolve(ROOT, "fixtures/firms", f));
// Four recorder runs, each at its own chain time, so the 0332 fire is forecast after each of its
// first three passes and each forecast is sealed before the 15 Oct pass that decides it. Runs 1 and 2
// seal their roots from the first recorder key; then FireRuns' owner replaces it, and runs 3 and 4
// seal from the new one.
const CHAIN_START = "2026-10-13T19:00:00Z";
const RUNS = [
  { at: "2026-10-13T20:00:00Z", key: RECORDER_PRIVATE_KEY },
  { at: "2026-10-14T09:00:00Z", key: RECORDER_PRIVATE_KEY },
  { at: "2026-10-14T20:00:00Z", key: NEW_RECORDER_PRIVATE_KEY },
  { at: "2026-10-15T21:00:00Z", key: NEW_RECORDER_PRIVATE_KEY },
];
const REPLACED_BEFORE_RUN = 2;
// The 0332 fire's first pass, 3 detections, stored by the refused run before run 1.
const FIRST_PASS =
  "SELECT h.id, '0x' || encode(h.record_id, 'hex') AS record_id, h.source, h.lat_e5, h.lon_e5," +
  " extract(epoch FROM h.acquired_at)::integer AS acquired_unix, h.frp_e2, h.confidence, h.fingerprint_version, h.map_version," +
  " (SELECT json_agg(json_build_object('id', a.concession_id, 'inside', a.inside, 'edge_m', a.edge_m))" +
  "  FROM hotspot_concessions a WHERE a.hotspot_id = h.id) AS concessions" +
  " FROM hotspots h JOIN hotspot_concessions m ON m.hotspot_id = h.id AND m.concession_id = 'ID-WOOD-CONCESSION-0332'" +
  " WHERE h.acquired_at = '2026-10-13T17:37Z'";
// The real boundaries of ID-WOOD-CONCESSION-0540, 0377, 0275, 0332, 0356 and 0372, so matches come at real
// distances.
const CONCESSIONS = resolve(ROOT, "fixtures/concessions/trase-cut.geojson");
// WRI's peat polygons near the detections in both FIRMS files, so each fire gets its damage parts.
const PEAT = resolve(ROOT, "fixtures/peat/peat-cut.geojson.gz");
// Multicall3 as deployed on Base Sepolia; a pack reads its seals through it (D38), and anvil has none.
const MULTICALL3 = resolve(ROOT, "fixtures/chain/multicall3.hex");
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
// The landing's real case: the committed copy of the example fire's pack, whose records the e2e seals on anvil (D92).
const CASE_COPY = resolve(WEB, "public/case/pack-0332.json");
const VITE = resolve(WEB, "node_modules/.bin/vite");
const PATH = `${homedir()}/.foundry/bin:${process.env.PATH}`;

const apiEnv = { DATABASE_URL: E2E_DATABASE_URL };

// Async, so the FIRMS fixture server in this process can still answer while a command runs.
function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}, exitCode = 0): Promise<void> {
  if (!existsSync(cwd)) throw new Error(`${cwd} does not exist; the e2e needs contracts/ and api/ beside web/`);
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, PATH, ...env }, stdio: "inherit" });
    child.on("error", (err) => fail(new Error(`\`${cmd} ${args.join(" ")}\` failed in ${cwd}: ${err.message}`)));
    child.on("exit", (code) =>
      code === exitCode ? done() : fail(new Error(`\`${cmd} ${args.join(" ")}\` failed in ${cwd}: exit ${code}`)),
    );
  });
}

// Each long-running process gets its own process group, so teardown also stops what `uv run` starts.
function start(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}): ChildProcess {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, PATH, ...env }, stdio: "inherit", detached: true });
  child.on("error", (err) => console.error(`${cmd} failed to start: ${err.message}`));
  return child;
}

function stop(child: ChildProcess) {
  if (child.pid && child.exitCode === null) process.kill(-child.pid, "SIGTERM");
}

async function waitFor(name: string, child: ChildProcess | null, ready: () => Promise<boolean>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`${name} exited with ${child.exitCode} before it was ready`);
    if (await ready().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} was not ready after ${timeoutMs / 1000} s`);
}

const answers = (url: string, init?: RequestInit) => async () => (await fetch(url, init)).ok;

const rpc = (method: string, params: unknown[]): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
});

// A FIRMS row's acq_date and acq_time, such as 2026-10-14 and 618, in milliseconds.
function acquired(row: string): number {
  const [, , , , , date, time] = row.split(",");
  const hhmm = time.padStart(4, "0");
  return Date.parse(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
}

const sealAbi = parseAbi(["function seal(bytes32 recordId, bytes32 fingerprint)"]);
const recordsWallet = () => createWalletClient({ account: privateKeyToAccount(RECORDER_PRIVATE_KEY), chain: foundry, transport: http(RPC_URL) });

// Seals the copy's records as the recorder sealed them on Base Sepolia, one transaction each (D19), awaited in turn.
async function sealCase() {
  const { hotspots } = JSON.parse(readFileSync(CASE_COPY, "utf8")) as { hotspots: (MatchedDetection & { record_id: Hex })[] };
  const wallet = recordsWallet();
  for (const h of hotspots) {
    await wallet.writeContract({ address: CONTRACT_ADDRESS, abi: sealAbi, functionName: "seal", args: [h.record_id, fingerprint(h)] });
  }
}

// Staged, not recorded: before the switch to FireRuns the recorder sealed each record on FireRecords
// in its own transaction (D19). So the 0332 fire's first pass, stored by a run whose root FireRuns
// refused, is sealed that way before run 1, and the e2e's packs mix old seals with run roots. Run 1's
// root then holds only what it stores, as a root on Base Sepolia does, so a pack's runs rebuild.
async function sealFirstPassOnFireRecords() {
  const db = new pg.Client(E2E_DATABASE_URL);
  await db.connect();
  try {
    const rows = (await db.query(FIRST_PASS)).rows as (MatchedDetection & { id: string; record_id: Hex })[];
    if (rows.length !== 3) throw new Error(`expected the 0332 fire's first pass to have 3 detections, found ${rows.length}`);
    const wallet = recordsWallet();
    const chain = createPublicClient({ chain: foundry, transport: http(RPC_URL) });
    for (const h of rows) {
      const hash = await wallet.writeContract({ address: CONTRACT_ADDRESS, abi: sealAbi, functionName: "seal", args: [h.record_id, fingerprint(h)] });
      const { blockNumber } = await chain.waitForTransactionReceipt({ hash });
      const { timestamp } = await chain.getBlock({ blockNumber });
      await db.query(
        "UPDATE hotspots SET root_id = NULL, proof = NULL, tx_hash = decode($1, 'hex'), sealed_at = to_timestamp($2) WHERE id = $3",
        [hash.slice(2), Number(timestamp), h.id],
      );
    }
  } finally {
    await db.end();
  }
}

async function replaceRecorder() {
  const owner = createWalletClient({ account: privateKeyToAccount(OWNER_PRIVATE_KEY), chain: foundry, transport: http(RPC_URL) });
  const hash = await owner.writeContract({
    address: FIRE_RUNS_ADDRESS,
    abi: parseAbi(["function replaceRecorder(address next)"]),
    functionName: "replaceRecorder",
    args: [NEW_RECORDER_ADDRESS],
  });
  const { status } = await createPublicClient({ chain: foundry, transport: http(RPC_URL) }).waitForTransactionReceipt({ hash });
  if (status !== "success") throw new Error("the owner's replaceRecorder failed");
}

async function resetDatabase() {
  const admin = new pg.Client(ADMIN_DATABASE_URL);
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${E2E_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${E2E_DATABASE}`);
  } finally {
    await admin.end();
  }
}

export default async function globalSetup() {
  const children: ChildProcess[] = [];
  const [header, ...rows] = FIRMS_CSVS.flatMap((path, i) =>
    readFileSync(path, "utf8").trimEnd().split("\n").slice(i === 0 ? 0 : 1),
  );
  let runAt = 0;
  const firms = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/csv" });
    res.end([header, ...rows.filter((row) => acquired(row) < runAt)].join("\n") + "\n");
  });
  const teardown = () => {
    children.forEach(stop);
    firms.close();
  };

  try {
    const anvil = start("anvil", ["--port", String(ANVIL_PORT), "--silent", "--timestamp", String(Date.parse(CHAIN_START) / 1000)], WEB);
    children.push(anvil);
    await waitFor("anvil", anvil, answers(RPC_URL, rpc("eth_chainId", [])));
    const setCode = await (await fetch(RPC_URL, rpc("anvil_setCode", [MULTICALL3_ADDRESS, readFileSync(MULTICALL3, "utf8").trim()]))).json();
    if (setCode.error) throw new Error(`anvil_setCode for Multicall3 failed: ${setCode.error.message}`);

    await run(
      "forge",
      ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--private-key", RECORDER_PRIVATE_KEY, "--broadcast"],
      CONTRACTS,
      { RECORDER_ADDRESS },
    );
    await run(
      "forge",
      ["script", "script/DeployRuns.s.sol", "--rpc-url", RPC_URL, "--private-key", RECORDER_PRIVATE_KEY, "--broadcast"],
      CONTRACTS,
      { OWNER_ADDRESS, RECORDER_ADDRESS },
    );

    await resetDatabase();
    await run("uv", ["run", "python", "-m", "firewatch.migrate", "up"], API, apiEnv);
    await run("uv", ["run", "load-concessions", CONCESSIONS], API, apiEnv);
    await run("uv", ["run", "load-peat", PEAT], API, apiEnv);

    await new Promise<void>((done) => firms.listen(FIRMS_PORT, "127.0.0.1", done));
    for (const [i, { at, key }] of RUNS.entries()) {
      if (i === REPLACED_BEFORE_RUN) await replaceRecorder();
      runAt = Date.parse(at);
      // The recorder's clock is the latest block's time (D50).
      const mined = await (await fetch(RPC_URL, rpc("evm_mine", [runAt / 1000]))).json();
      if (mined.error) throw new Error(`evm_mine at ${at} failed: ${mined.error.message}`);
      const recorderEnv = { ...apiEnv, FIRMS_MAP_KEY: "e2e", FIRMS_BASE_URL: FIRMS_URL, RPC_URL, FIRE_RUNS_ADDRESS };
      if (i === 0) {
        // The owner key isn't FireRuns' recorder, so the run stores and forecasts, then drops its root and exits 1 (D110).
        await run("uv", ["run", "record-hotspots"], API, { ...recorderEnv, RECORDER_PRIVATE_KEY: OWNER_PRIVATE_KEY }, 1);
        await sealFirstPassOnFireRecords();
      }
      await run("uv", ["run", "record-hotspots"], API, { ...recorderEnv, RECORDER_PRIVATE_KEY: key });
    }
    await sealCase();

    const api = start(
      "uv",
      ["run", "uvicorn", "firewatch.app:app", "--host", "127.0.0.1", "--port", String(API_PORT)],
      API,
      { ...apiEnv, ALLOWED_ORIGIN: WEB_URL },
    );
    children.push(api);
    await waitFor("API", api, answers(`${API_URL}/api/health`));

    await run(VITE, ["build", "--outDir", "dist-e2e"], WEB, {
      VITE_API_URL: API_URL,
      VITE_RPC_URL: RPC_URL,
      VITE_CONTRACT_ADDRESS: CONTRACT_ADDRESS,
      VITE_FIRE_RUNS_ADDRESS: FIRE_RUNS_ADDRESS,
      VITE_GOOGLE_MAPS_KEY: "e2e-fake",
    });
    const preview = start(VITE, ["preview", "--outDir", "dist-e2e", "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"], WEB);
    children.push(preview);
    await waitFor("vite preview", preview, answers(WEB_URL));
  } catch (err) {
    teardown();
    throw err;
  }

  return teardown;
}
