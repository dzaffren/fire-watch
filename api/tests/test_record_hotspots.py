import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import psycopg
import pytest
from eth_account import Account
from psycopg.rows import dict_row
from web3 import Web3
from web3.exceptions import TimeExhausted

from firewatch import concessions, forecast, record_hotspots
from firewatch.chain import Chain
from firewatch.fingerprint import (
    fingerprint_v2,
    forecast_fields,
    forecast_fingerprint,
    record_fields_v2,
)
from firewatch.merkle import leaf, root_from

ROOT = Path(__file__).parents[2]
FIRMS = ROOT / "fixtures" / "firms"
TRASE_CUT = ROOT / "fixtures" / "concessions" / "trase-cut.geojson"
ARTIFACT = ROOT / "contracts" / "out" / "FireRuns.sol" / "FireRuns.json"
# anvil's first two well-known dev accounts; public, hold only local test ETH. The second owns
# FireRuns, so it can replace the recorder.
ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
OWNER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
RECORD_HOTSPOTS = Path(sys.executable).parent / "record-hotspots"
FIRE_RECORD = (FIRMS / "fire-record.csv").read_text()
# The 19 detections of the ID-WOOD-CONCESSION-0332 fire of scenario 1, on 4 passes.
FIRE_ORIGIN = (FIRMS / "fire-origin.csv").read_text()
# The header and hotspots A, B and C from scenario 1.
ABC = "".join(FIRE_RECORD.splitlines(keepends=True)[:4])
A = (-358175, 10571567)
B = (-367525, 11535328)
LOG_LINE = re.compile(
    r"recorded fetched=(\d+) kept=(\d+) new=(\d+) sealed=(\d+) unsealed=(\d+)"
    r" balance_eth=\d+\.\d{4}"
)
FORECAST_LOG = re.compile(r"forecasts=(\d+) forecasts_sealed=(\d+) outcomes=(\d+) forecast_ms=\d+")
ROOTS_LOG = re.compile(r" roots=(\d+) run=(\d+|none)$", re.MULTILINE)
C0332 = "ID-WOOD-CONCESSION-0332"


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def anvil():
    subprocess.run(["forge", "build"], cwd=ROOT / "contracts", check=True, capture_output=True)
    url = f"http://127.0.0.1:{_free_port()}"
    proc = subprocess.Popen(["anvil", "--port", url.rsplit(":", 1)[1], "--silent"])
    w3 = Web3(Web3.HTTPProvider(url))
    for _ in range(100):
        if w3.is_connected():
            break
        time.sleep(0.05)
    yield w3
    proc.terminate()
    proc.wait()


def _deploy(w3, recorder):
    artifact = json.loads(ARTIFACT.read_text())
    deployer = Account.from_key(ANVIL_KEY)
    factory = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"]["object"])
    tx = factory.constructor(Account.from_key(OWNER_KEY).address, recorder).build_transaction(
        {"from": deployer.address, "nonce": w3.eth.get_transaction_count(deployer.address)}
    )
    tx_hash = w3.eth.send_raw_transaction(deployer.sign_transaction(tx).raw_transaction)
    address = w3.eth.wait_for_transaction_receipt(tx_hash).contractAddress
    return w3.eth.contract(address=address, abi=artifact["abi"])


@pytest.fixture
def clocked(mapped_db, firms):
    """A fresh anvil whose clock starts at 2026-10-13 19:00 UTC, so each run can be staged at a
    past chain time, as the e2e stages them."""
    url = f"http://127.0.0.1:{_free_port()}"
    start = str(_unix("2026-10-13T19:00"))
    proc = subprocess.Popen(
        ["anvil", "--port", url.rsplit(":", 1)[1], "--silent", "--timestamp", start]
    )
    w3 = Web3(Web3.HTTPProvider(url))
    for _ in range(100):
        if w3.is_connected():
            break
        time.sleep(0.05)
    contract = _deploy(w3, Account.from_key(ANVIL_KEY).address)
    yield contract, _env(mapped_db, w3, firms, contract, ANVIL_KEY)
    proc.terminate()
    proc.wait()


def _unix(text):
    return int(datetime.fromisoformat(text + "+00:00").timestamp())


def at_chain_time(contract, text):
    """Mines a block at text, UTC, so the next run's now is then."""
    contract.w3.provider.make_request("evm_mine", [_unix(text)])


def passes(*acquired):
    """The FIRE_ORIGIN header and its rows from the passes acquired at these YYYY-MM-DD,HHMM."""
    header, *rows = FIRE_ORIGIN.splitlines(keepends=True)
    return header + "".join(r for r in rows if r.split(",")[5] + "," + r.split(",")[6] in acquired)


@pytest.fixture
def firms():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FirmsHandler)
    server.csv = ABC
    server.status = 200
    server.paths = []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server
    server.shutdown()
    server.server_close()


class _FirmsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.paths.append(self.path)
        body = self.server.csv.encode()
        self.send_response(self.server.status)
        self.send_header("Content-Type", "text/csv")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def public_rpc(anvil):
    """anvil behind a proxy that acts like a public RPC: blocks below pruned_below are gone,
    and when lagging, each block number is unknown the first time it is asked for."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), _PublicRpcHandler)
    server.upstream = anvil.provider.endpoint_uri
    server.pruned_below = 0
    server.lagging = False
    server.asked = set()
    server.url = f"http://127.0.0.1:{server.server_port}"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server
    server.shutdown()
    server.server_close()


class _PublicRpcHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        body = json.dumps(self._answer(request)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _answer(self, request):
        server = self.server
        if request["method"] == "eth_getBlockByNumber" and request["params"][0].startswith("0x"):
            number = int(request["params"][0], 16)
            if number < server.pruned_below:
                error = {"code": 4444, "message": "pruned history unavailable"}
                return {"jsonrpc": "2.0", "id": request["id"], "error": error}
            if server.lagging and number not in server.asked:
                server.asked.add(number)
                return {"jsonrpc": "2.0", "id": request["id"], "result": None}
        upstream = urllib.request.Request(
            server.upstream, json.dumps(request).encode(), {"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(upstream) as response:
            return json.loads(response.read())

    def log_message(self, *args):
        pass


@pytest.fixture
def mapped_db(migrated_db):
    concessions.load(TRASE_CUT.read_bytes(), migrated_db)
    return migrated_db


def _env(db, anvil, firms, contract, key):
    return {
        "DATABASE_URL": db,
        "FIRMS_MAP_KEY": "TESTKEY",
        "FIRMS_BASE_URL": f"http://127.0.0.1:{firms.server_port}",
        "RPC_URL": anvil.provider.endpoint_uri,
        "FIRE_RUNS_ADDRESS": contract.address,
        "RECORDER_PRIVATE_KEY": key,
    }


@pytest.fixture
def funded(mapped_db, anvil, firms):
    contract = _deploy(anvil, Account.from_key(ANVIL_KEY).address)
    return contract, _env(mapped_db, anvil, firms, contract, ANVIL_KEY)


@pytest.fixture
def unfunded(mapped_db, anvil, firms):
    wallet = Account.create()
    contract = _deploy(anvil, wallet.address)
    return wallet, contract, _env(mapped_db, anvil, firms, contract, wallet.key.to_0x_hex())


def run_recorder(env):
    return subprocess.run(
        [RECORD_HOTSPOTS], env={**os.environ, **env}, capture_output=True, text=True, timeout=180
    )


def logged(stdout):
    """fetched, kept, new, sealed and unsealed from the run's log line."""
    (match,) = LOG_LINE.finditer(stdout)
    return tuple(int(n) for n in match.groups())


def records(url):
    """Every stored hotspot with its matches sorted by concession ID and its root's run, oldest
    first."""
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT h.*, COALESCE((SELECT json_agg(json_build_object('id', m.concession_id,"
            " 'inside', m.inside, 'edge_m', m.edge_m) ORDER BY m.concession_id)"
            " FROM hotspot_concessions m WHERE m.hotspot_id = h.id), '[]') AS concessions,"
            " (SELECT run FROM roots r WHERE r.id = h.root_id) AS run"
            " FROM hotspots h ORDER BY h.acquired_at, h.id"
        ).fetchall()


def forecasts(url):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT f.*, (SELECT run FROM roots r WHERE r.id = f.root_id) AS run"
            " FROM forecasts f ORDER BY made_at, id"
        ).fetchall()


def stored_roots(url):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute("SELECT * FROM roots ORDER BY id").fetchall()


def runs(url):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute("SELECT * FROM recorder_runs ORDER BY id").fetchall()


def utc(text):
    return datetime.fromisoformat(text + "+00:00")


def km(edge_m):
    return round(edge_m / 1000, 2)


def forget_seals(url):
    """As if a run sent its root but crashed before storing the receipt."""
    with psycopg.connect(url) as conn:
        conn.execute("UPDATE roots SET run = NULL, tx_hash = NULL, sealed_at = NULL")
        conn.execute("UPDATE hotspots SET tx_hash = NULL, sealed_at = NULL")
        conn.execute("UPDATE forecasts SET tx_hash = NULL, sealed_at = NULL")


def roots_logged(stdout):
    """roots and run from the run's log line."""
    return ROOTS_LOG.search(stdout).groups()


def sent(contract, since):
    """The hashes of the transactions to contract in the blocks after since."""
    w3 = contract.w3
    return [
        bytes(tx.hash)
        for n in range(since + 1, w3.eth.block_number + 1)
        for tx in w3.eth.get_block(n, full_transactions=True).transactions
        if tx.to == contract.address
    ]


def fingerprint_of(row):
    if "concessions" in row:
        return fingerprint_v2(**record_fields_v2(row, row["concessions"]))
    return forecast_fingerprint(forecast_fields(row))


def assert_sealed(contract, row):
    """row's proof leads to its run's root on FireRuns, and row has that root's transaction
    and block time."""
    root, sealed_unix = contract.functions.runOf(row["run"]).call()
    assert root != b"\x00" * 32
    assert root_from(leaf(row["record_id"], fingerprint_of(row)), row["proof"]) == root
    assert row["sealed_at"] == datetime.fromtimestamp(sealed_unix, timezone.utc)
    receipt = contract.w3.eth.get_transaction_receipt(row["tx_hash"])
    assert receipt.status == 1 and receipt.to == contract.address


def test_chain_now_is_the_latest_block_time(anvil):
    later = anvil.eth.get_block("latest").timestamp + 3600
    anvil.provider.make_request("evm_mine", [later])
    chain = Chain(anvil.provider.endpoint_uri, "0x" + "00" * 20, ANVIL_KEY)

    assert chain.now() == datetime.fromtimestamp(later, timezone.utc)


def test_keeps_a_and_b_drops_c(funded, firms):
    contract, env = funded

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert logged(result.stdout) == (3, 2, 2, 4, 0)
    a, b = records(env["DATABASE_URL"])
    assert (a["lat_e5"], a["lon_e5"]) == A
    assert (b["lat_e5"], b["lon_e5"]) == B
    assert [(m["id"], m["inside"], km(m["edge_m"])) for m in a["concessions"]] == [
        ("ID-WOOD-CONCESSION-0540", True, 3.1),
    ]
    assert [(m["id"], m["inside"], km(m["edge_m"])) for m in b["concessions"]] == [
        ("ID-WOOD-CONCESSION-0275", False, 1.02),
        ("ID-WOOD-CONCESSION-0377", False, 0.37),
    ]
    for row in (a, b):
        assert (row["fingerprint_version"], row["map_version"]) == (2, concessions.MAP_VERSION)
        assert_sealed(contract, row)
    assert roots_logged(result.stdout) == ("1", "1")
    (run,) = runs(env["DATABASE_URL"])
    assert (run["kept"], run["sealed"], run["unsealed"], run["error"]) == (2, 4, 0, None)
    assert run["started_at"] <= run["finished_at"]


def test_rerun_adds_nothing(funded):
    contract, env = funded
    assert run_recorder(env).returncode == 0
    first = records(env["DATABASE_URL"])
    made = forecasts(env["DATABASE_URL"])
    assert len(made) == 2
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert logged(result.stdout) == (3, 2, 0, 0, 0)
    assert FORECAST_LOG.search(result.stdout).groups()[:3] == ("0", "0", "0")
    assert roots_logged(result.stdout) == ("0", "none")
    assert records(env["DATABASE_URL"]) == first
    assert forecasts(env["DATABASE_URL"]) == made
    assert contract.w3.eth.block_number == block


def test_an_empty_wallet_drops_the_root_and_the_next_run_seals_both_runs(unfunded, firms):
    wallet, contract, env = unfunded
    url = env["DATABASE_URL"]

    result = run_recorder(env)

    assert result.returncode == 1
    assert "insufficient funds" in result.stderr
    assert logged(result.stdout) == (3, 2, 2, 0, 4)
    assert roots_logged(result.stdout) == ("0", "none")
    assert stored_roots(url) == []
    first = records(url) + forecasts(url)
    assert [(r["root_id"], r["proof"], r["tx_hash"], r["sealed_at"]) for r in first] == [
        (None, None, None, None)
    ] * 4
    (run,) = runs(url)
    assert (run["kept"], run["sealed"], run["unsealed"]) == (2, 0, 4)
    assert "insufficient funds" in run["error"]

    contract.w3.provider.make_request("anvil_setBalance", [wallet.address, hex(10**18)])
    firms.csv = FIRE_RECORD
    block = contract.w3.eth.block_number
    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    sealed = records(url) + forecasts(url)
    assert {r["record_id"] for r in first} < {r["record_id"] for r in sealed}
    assert logged(result.stdout)[3:] == (len(sealed), 0)
    assert roots_logged(result.stdout) == ("1", "1")
    (root,) = stored_roots(url)
    assert root["run"] == 1
    assert sent(contract, block) == [root["tx_hash"]]
    for row in sealed:
        assert (row["root_id"], row["tx_hash"]) == (root["id"], root["tx_hash"])
        assert_sealed(contract, row)
    assert runs(url)[-1]["error"] is None


def test_a_stored_root_not_on_chain_is_sent_again_never_dropped(unfunded, monkeypatch):
    wallet, contract, env = unfunded
    url = env["DATABASE_URL"]
    for name, value in env.items():
        monkeypatch.setenv(name, value)

    def times_out(self, root):
        raise TimeExhausted("no receipt in 120 seconds")

    with monkeypatch.context() as m:
        m.setattr(Chain, "seal_root", times_out)
        assert record_hotspots.main() == 1
    (stored,) = stored_roots(url)
    assert stored["run"] is None

    # The earlier send may still land, so a refused resend keeps the root (D110).
    result = run_recorder(env)

    assert result.returncode == 1
    assert "insufficient funds" in result.stderr
    assert stored_roots(url) == [stored]
    assert {r["root_id"] for r in records(url) + forecasts(url)} == {stored["id"]}

    contract.w3.provider.make_request("anvil_setBalance", [wallet.address, hex(10**18)])
    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert roots_logged(result.stdout) == ("1", "1")
    (root,) = stored_roots(url)
    assert (root["id"], root["root"], root["run"]) == (stored["id"], stored["root"], 1)
    for row in records(url) + forecasts(url):
        assert row["tx_hash"] == root["tx_hash"]
        assert_sealed(contract, row)


def test_a_stored_root_already_on_chain_is_filled_in_not_sent_again(funded):
    contract, env = funded
    url = env["DATABASE_URL"]
    assert run_recorder(env).returncode == 0
    sealed, made, roots = records(url), forecasts(url), stored_roots(url)
    forget_seals(url)
    contract.w3.provider.make_request("anvil_mine", [5])
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert logged(result.stdout)[3:] == (4, 0)
    assert roots_logged(result.stdout) == ("1", "1")
    assert stored_roots(url) == roots
    assert records(url) == sealed
    assert forecasts(url) == made
    assert contract.w3.eth.block_number == block


def test_after_the_owner_replaces_the_recorder_only_the_new_key_seals(funded, firms):
    contract, env = funded
    url = env["DATABASE_URL"]
    w3 = contract.w3
    assert run_recorder(env).returncode == 0
    first = {r["record_id"] for r in records(url) + forecasts(url)}
    (old_root,) = stored_roots(url)
    new_key = Account.create()
    w3.provider.make_request("anvil_setBalance", [new_key.address, hex(10**18)])
    owner = Account.from_key(OWNER_KEY)
    tx = contract.functions.replaceRecorder(new_key.address).build_transaction(
        {"from": owner.address, "nonce": w3.eth.get_transaction_count(owner.address)}
    )
    tx_hash = w3.eth.send_raw_transaction(owner.sign_transaction(tx).raw_transaction)
    assert w3.eth.wait_for_transaction_receipt(tx_hash).status == 1
    firms.csv = FIRE_RECORD
    block = w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 1
    assert "NotRecorder" in result.stderr
    assert "NotRecorder" in runs(url)[-1]["error"]
    assert sent(contract, block) == []
    assert stored_roots(url) == [old_root]
    waiting = [r for r in records(url) + forecasts(url) if r["record_id"] not in first]
    assert waiting
    assert {(r["root_id"], r["proof"], r["tx_hash"]) for r in waiting} == {(None, None, None)}

    result = run_recorder({**env, "RECORDER_PRIVATE_KEY": new_key.key.to_0x_hex()})

    assert result.returncode == 0, result.stderr
    assert roots_logged(result.stdout) == ("1", "2")
    old, new = stored_roots(url)
    assert old == old_root and new["run"] == 2
    assert w3.eth.get_transaction(new["tx_hash"])["from"] == new_key.address
    for row in records(url) + forecasts(url):
        assert row["run"] == (1 if row["record_id"] in first else 2)
        assert_sealed(contract, row)


def test_run_makes_its_forecast_and_seals_it_with_the_detections(clocked, firms):
    contract, env = clocked
    firms.csv = passes("2026-10-13,1737", "2026-10-14,618", "2026-10-14,1720")
    at_chain_time(contract, "2026-10-14T20:00")

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert FORECAST_LOG.search(result.stdout).groups()[:3] == ("1", "1", "0")
    (made,) = forecasts(env["DATABASE_URL"])
    assert made["concession_id"] == C0332
    assert (made["after_pass_at"], made["made_at"], made["until_at"], made["inside_by_at"]) == (
        utc("2026-10-14T17:20"), utc("2026-10-14T20:00"), utc("2026-10-16T20:00"),
        utc("2026-10-15T05:20"),
    )
    assert (made["from_lat_e5"], made["from_lon_e5"]) == (-284220, 11271781)
    assert (made["crossing_lat_e5"], made["crossing_lon_e5"]) == (-284194, 11271793)
    assert (made["rule_version"], made["outcome"]) == (forecast.RULE_VERSION, "waiting")
    stored = records(env["DATABASE_URL"])
    assert made["fire_key"] == stored[0]["record_id"]
    for row in [made, *stored]:
        assert (row["run"], row["tx_hash"]) == (1, made["tx_hash"])
        assert_sealed(contract, row)


def test_next_run_stores_the_outcome(clocked, firms):
    contract, env = clocked
    firms.csv = passes("2026-10-13,1737", "2026-10-14,618", "2026-10-14,1720")
    at_chain_time(contract, "2026-10-14T20:00")
    assert run_recorder(env).returncode == 0
    firms.csv = FIRE_ORIGIN
    at_chain_time(contract, "2026-10-15T21:00")

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert FORECAST_LOG.search(result.stdout).groups()[:3] == ("0", "0", "1")
    # Seen inside on the 15 Oct pass, so no more forecasts for the fire.
    (made,) = forecasts(env["DATABASE_URL"])
    assert (made["outcome"], made["outcome_at"]) == ("seen_inside", utc("2026-10-15T18:43"))
    assert made["sealed_at"] < made["outcome_at"]


def test_a_quiet_concession_closes_its_forecast_after_48_hours(clocked, firms):
    contract, env = clocked
    firms.csv = passes("2026-10-13,1737", "2026-10-14,618", "2026-10-14,1720")
    at_chain_time(contract, "2026-10-14T20:00")
    assert run_recorder(env).returncode == 0
    # No new rows, so only the waiting forecast brings 0332 into the run.
    at_chain_time(contract, "2026-10-17T01:59")
    assert run_recorder(env).returncode == 0
    (waiting,) = forecasts(env["DATABASE_URL"])
    assert waiting["outcome"] == "waiting"
    at_chain_time(contract, "2026-10-17T02:00")

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert FORECAST_LOG.search(result.stdout).groups()[:3] == ("0", "0", "1")
    (made,) = forecasts(env["DATABASE_URL"])
    assert (made["outcome"], made["outcome_at"]) == ("not_seen_inside", None)


def test_a_late_row_of_a_forecast_pass_neither_joins_nor_forecasts_again(clocked, firms):
    contract, env = clocked
    first_pass = passes("2026-10-13,1737")
    firms.csv = first_pass
    at_chain_time(contract, "2026-10-13T20:00")
    assert run_recorder(env).returncode == 0
    (before,) = forecasts(env["DATABASE_URL"])
    # The same 17:37 pass, 200 m south of the fire's first detection, so it sorts first and
    # becomes the fire's key.
    late = first_pass.splitlines(keepends=True)[1].replace("-2.8517,", "-2.8535,", 1)
    firms.csv = first_pass + late
    at_chain_time(contract, "2026-10-13T21:00")

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert logged(result.stdout)[2] == 1
    assert FORECAST_LOG.search(result.stdout).groups()[:3] == ("0", "0", "0")
    assert forecasts(env["DATABASE_URL"]) == [before]
    assert before["outcome"] == "waiting"


def test_forecast_error_still_seals_detections(funded, firms, monkeypatch, capsys):
    contract, env = funded
    for name, value in env.items():
        monkeypatch.setenv(name, value)

    def broken(*args):
        raise RuntimeError("no forecast")

    monkeypatch.setattr(forecast, "make", broken)

    assert record_hotspots.main() == 1

    assert logged(capsys.readouterr().out) == (3, 2, 2, 2, 0)
    for row in records(env["DATABASE_URL"]):
        assert_sealed(contract, row)
    assert forecasts(env["DATABASE_URL"]) == []
    assert runs(env["DATABASE_URL"])[-1]["error"] == "RuntimeError: no forecast"


def test_records_a_firms_error_without_the_key(funded, firms, monkeypatch, capsys):
    _, env = funded
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    firms.status = 503

    assert record_hotspots.main() == 1

    error = runs(env["DATABASE_URL"])[-1]["error"]
    assert "503 Service Unavailable" in error
    assert "TESTKEY" not in error
    assert "TESTKEY" not in capsys.readouterr().err


def test_rolled_back_forecasts_are_not_logged(funded, firms, monkeypatch, capsys):
    _, env = funded
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    make, calls = forecast.make, []

    # B is near 0275 and 0377; its 0275 forecast is made, then its 0377 one fails.
    def fails_second(*args):
        calls.append(args)
        if len(calls) == 2:
            raise RuntimeError("no forecast")
        return make(*args)

    monkeypatch.setattr(forecast, "make", fails_second)

    assert record_hotspots.main() == 1

    assert FORECAST_LOG.search(capsys.readouterr().out).groups()[:3] == ("0", "0", "0")
    assert forecasts(env["DATABASE_URL"]) == []


def test_a_run_seals_its_detections_and_forecasts_under_one_root(funded, firms):
    contract, env = funded
    firms.csv = FIRE_RECORD
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    stored = records(env["DATABASE_URL"])
    made = forecasts(env["DATABASE_URL"])
    assert len(made) > 3
    assert logged(result.stdout) == (25, len(stored), len(stored), len(stored) + len(made), 0)
    assert FORECAST_LOG.search(result.stdout).groups()[:2] == (str(len(made)), str(len(made)))
    assert roots_logged(result.stdout) == ("1", "1")
    (root,) = stored_roots(env["DATABASE_URL"])
    assert root["run"] == 1
    assert sent(contract, block) == [root["tx_hash"]]
    receipt = contract.w3.eth.get_transaction_receipt(root["tx_hash"])
    block_time = contract.w3.eth.get_block(receipt.blockNumber).timestamp
    assert root["sealed_at"] == datetime.fromtimestamp(block_time, timezone.utc)
    assert contract.functions.runOf(1).call() == [root["root"], block_time]
    for row in stored + made:
        assert (row["root_id"], row["tx_hash"], row["sealed_at"]) == (
            root["id"], root["tx_hash"], root["sealed_at"],
        )
        assert_sealed(contract, row)
    (run,) = runs(env["DATABASE_URL"])
    assert (run["sealed"], run["unsealed"], run["error"]) == (len(stored) + len(made), 0, None)


def test_second_run_exits_while_first_holds_lock(funded, firms):
    _, env = funded
    with psycopg.connect(env["DATABASE_URL"]) as first_run:
        first_run.execute("SELECT pg_advisory_lock(%s)", (record_hotspots.LOCK_KEY,))

        result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "Another run is active"
    assert firms.paths == []
    assert records(env["DATABASE_URL"]) == []
    assert runs(env["DATABASE_URL"]) == []


def test_first_run_takes_five_days(funded, firms):
    _, env = funded

    assert run_recorder(env).returncode == 0
    assert run_recorder(env).returncode == 0

    assert firms.paths == [
        "/api/area/csv/TESTKEY/VIIRS_NOAA20_NRT/95,-11,141,6/5",
        "/api/area/csv/TESTKEY/VIIRS_NOAA20_NRT/95,-11,141,6/2",
    ]


def test_seal_waits_for_an_rpc_node_that_has_not_seen_the_block(funded, public_rpc):
    contract, env = funded
    public_rpc.lagging = True

    result = run_recorder({**env, "RPC_URL": public_rpc.url})

    assert result.returncode == 0, result.stderr
    for row in records(env["DATABASE_URL"]):
        assert_sealed(contract, row)


def test_a_stored_root_on_chain_is_found_on_an_rpc_that_pruned_old_blocks(funded, public_rpc):
    contract, env = funded
    url = env["DATABASE_URL"]
    # Two seconds apart, as on Base. Without an interval anvil stamps every block the same.
    contract.w3.provider.make_request("anvil_mine", [100, 2])
    assert run_recorder(env).returncode == 0
    sealed, roots = records(url), stored_roots(url)
    seal_block = contract.w3.eth.get_transaction_receipt(roots[0]["tx_hash"]).blockNumber
    forget_seals(url)
    contract.w3.provider.make_request("anvil_mine", [5, 2])
    public_rpc.pruned_below = seal_block - 20

    result = run_recorder({**env, "RPC_URL": public_rpc.url})

    assert result.returncode == 0, result.stderr
    assert stored_roots(url) == roots
    assert records(url) == sealed


def test_no_hotspots_stores_nothing(funded, firms):
    contract, env = funded
    firms.csv = (FIRMS / "empty.csv").read_text()
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert logged(result.stdout) == (0, 0, 0, 0, 0)
    assert records(env["DATABASE_URL"]) == []
    assert contract.w3.eth.block_number == block
