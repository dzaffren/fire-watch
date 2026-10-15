import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  ADMIN_DATABASE_URL,
  API_PORT,
  API_URL,
  ANVIL_PORT,
  CONTRACT_ADDRESS,
  E2E_DATABASE,
  E2E_DATABASE_URL,
  FIRMS_PORT,
  FIRMS_URL,
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
const FIRMS_CSV = resolve(ROOT, "fixtures/firms/fire-record.csv");
// The real boundaries of ID-WOOD-CONCESSION-0540, 0377 and 0275, so matches come at real distances.
const CONCESSIONS = resolve(ROOT, "fixtures/concessions/trase-cut.geojson");
const VITE = resolve(WEB, "node_modules/.bin/vite");
const PATH = `${homedir()}/.foundry/bin:${process.env.PATH}`;

const apiEnv = { DATABASE_URL: E2E_DATABASE_URL };

// Async, so the FIRMS fixture server in this process can still answer while a command runs.
function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}): Promise<void> {
  if (!existsSync(cwd)) throw new Error(`${cwd} does not exist; the e2e needs contracts/ and api/ beside web/`);
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, PATH, ...env }, stdio: "inherit" });
    child.on("error", (err) => fail(new Error(`\`${cmd} ${args.join(" ")}\` failed in ${cwd}: ${err.message}`)));
    child.on("exit", (code) =>
      code === 0 ? done() : fail(new Error(`\`${cmd} ${args.join(" ")}\` failed in ${cwd}: exit ${code}`)),
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
  const firms = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/csv" });
    createReadStream(FIRMS_CSV).pipe(res);
  });
  const teardown = () => {
    children.forEach(stop);
    firms.close();
  };

  try {
    const anvil = start("anvil", ["--port", String(ANVIL_PORT), "--silent"], WEB);
    children.push(anvil);
    await waitFor("anvil", anvil, answers(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    }));

    await run(
      "forge",
      ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--private-key", RECORDER_PRIVATE_KEY, "--broadcast"],
      CONTRACTS,
      { RECORDER_ADDRESS },
    );

    await resetDatabase();
    await run("uv", ["run", "python", "-m", "firewatch.migrate", "up"], API, apiEnv);
    await run("uv", ["run", "load-concessions", CONCESSIONS], API, apiEnv);

    await new Promise<void>((done) => firms.listen(FIRMS_PORT, "127.0.0.1", done));
    await run("uv", ["run", "record-hotspots"], API, {
      ...apiEnv,
      FIRMS_MAP_KEY: "e2e",
      FIRMS_BASE_URL: FIRMS_URL,
      RPC_URL,
      CONTRACT_ADDRESS,
      RECORDER_PRIVATE_KEY,
    });

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
