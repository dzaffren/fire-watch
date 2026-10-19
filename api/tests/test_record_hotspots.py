import itertools
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

from firewatch import concessions, forecast, record_hotspots
from firewatch.chain import Chain
from firewatch.fingerprint import (
    fingerprint_v2,
    forecast_fields,
    forecast_fingerprint,
    record_fields_v2,
)

ROOT = Path(__file__).parents[2]
FIRMS = ROOT / "fixtures" / "firms"
TRASE_CUT = ROOT / "fixtures" / "concessions" / "trase-cut.geojson"
ARTIFACT = ROOT / "contracts" / "out" / "FireRecords.sol" / "FireRecords.json"
# anvil's first well-known dev account; public, holds only local test ETH.
ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
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
    tx = factory.constructor(recorder).build_transaction(
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
    server.paths = []
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server
    server.shutdown()
    server.server_close()


class _FirmsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.paths.append(self.path)
        body = self.server.csv.encode()
        self.send_response(200)
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
        "CONTRACT_ADDRESS": contract.address,
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
    """Every stored hotspot with its matches sorted by concession ID, oldest first."""
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute(
            "SELECT h.*, COALESCE((SELECT json_agg(json_build_object('id', m.concession_id,"
            " 'inside', m.inside, 'edge_m', m.edge_m) ORDER BY m.concession_id)"
            " FROM hotspot_concessions m WHERE m.hotspot_id = h.id), '[]') AS concessions"
            " FROM hotspots h ORDER BY h.acquired_at, h.id"
        ).fetchall()


def forecasts(url):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute("SELECT * FROM forecasts ORDER BY made_at, id").fetchall()


def runs(url):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute("SELECT * FROM recorder_runs ORDER BY id").fetchall()


def utc(text):
    return datetime.fromisoformat(text + "+00:00")


def km(edge_m):
    return round(edge_m / 1000, 2)


def assert_sealed(contract, row):
    assert len(row["tx_hash"]) == 32 and row["sealed_at"] is not None
    sealed_fp, _ = contract.functions.sealOf(row["record_id"]).call()
    assert sealed_fp == fingerprint_v2(**record_fields_v2(row, row["concessions"]))
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
        logs = contract.events.Sealed.get_logs(
            from_block=0, argument_filters={"recordId": row["record_id"]}
        )
        assert len(logs) == 1
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
    assert records(env["DATABASE_URL"]) == first
    assert forecasts(env["DATABASE_URL"]) == made
    assert contract.w3.eth.block_number == block


def test_unfunded_keeps_records_then_next_run_seals(unfunded):
    wallet, contract, env = unfunded

    result = run_recorder(env)

    assert result.returncode == 1
    assert "insufficient funds" in result.stderr
    assert logged(result.stdout) == (3, 2, 2, 0, 4)
    unsealed = records(env["DATABASE_URL"])
    assert [(r["tx_hash"], r["sealed_at"]) for r in unsealed] == [(None, None)] * 2
    (run,) = runs(env["DATABASE_URL"])
    assert (run["kept"], run["sealed"], run["unsealed"]) == (2, 0, 4)
    assert "insufficient funds" in run["error"]

    contract.w3.provider.make_request("anvil_setBalance", [wallet.address, hex(10**18)])
    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert logged(result.stdout) == (3, 2, 0, 4, 0)
    sealed = records(env["DATABASE_URL"])
    assert [(r["id"], r["record_id"]) for r in sealed] == [
        (r["id"], r["record_id"]) for r in unsealed
    ]
    for row in sealed:
        assert_sealed(contract, row)
    assert runs(env["DATABASE_URL"])[-1]["error"] is None


def test_run_makes_and_seals_forecasts_first(clocked, firms):
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
    first = records(env["DATABASE_URL"])[0]
    assert made["fire_key"] == first["record_id"]
    sealed_fp, sealed_unix = contract.functions.sealOf(made["record_id"]).call()
    assert sealed_fp == forecast_fingerprint(forecast_fields(made))
    assert made["sealed_at"] == datetime.fromtimestamp(sealed_unix, timezone.utc)
    receipt = contract.w3.eth.get_transaction_receipt(made["tx_hash"])
    assert receipt.status == 1 and receipt.to == contract.address
    hotspot_blocks = [
        contract.w3.eth.get_transaction_receipt(r["tx_hash"]).blockNumber
        for r in records(env["DATABASE_URL"])
    ]
    assert receipt.blockNumber < min(hotspot_blocks)


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


def test_stops_sealing_after_40_minutes(funded, firms, monkeypatch, capsys):
    contract, env = funded
    firms.csv = FIRE_RECORD
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    ten_minutes_a_call = itertools.count(0, 600).__next__

    assert record_hotspots.main(clock=ten_minutes_a_call) == 0

    stored = records(env["DATABASE_URL"])
    made = forecasts(env["DATABASE_URL"])
    fetched, kept, new, sealed, unsealed = logged(capsys.readouterr().out)
    # Forecasts seal first, so the budget's 3 seals all go to them (D49).
    assert len(made) > 3
    assert (fetched, kept, new, sealed, unsealed) == (
        25, len(stored), len(stored), 3, len(stored) + len(made) - 3,
    )
    assert [r["tx_hash"] is not None for r in made] == [True] * 3 + [False] * (len(made) - 3)
    assert all(r["tx_hash"] is None for r in stored)


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


def test_already_sealed_on_chain_takes_tx_hash_from_event(funded):
    contract, env = funded
    assert run_recorder(env).returncode == 0
    sealed = records(env["DATABASE_URL"])
    # As if the earlier run sent the seals but timed out before saving the receipts.
    with psycopg.connect(env["DATABASE_URL"]) as conn:
        conn.execute("UPDATE hotspots SET tx_hash = NULL, sealed_at = NULL")
    contract.w3.provider.make_request("anvil_mine", [5])
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert records(env["DATABASE_URL"]) == sealed
    assert contract.w3.eth.block_number == block


def test_seal_waits_for_an_rpc_node_that_has_not_seen_the_block(funded, public_rpc):
    contract, env = funded
    public_rpc.lagging = True

    result = run_recorder({**env, "RPC_URL": public_rpc.url})

    assert result.returncode == 0, result.stderr
    for row in records(env["DATABASE_URL"]):
        assert_sealed(contract, row)


def test_already_sealed_is_found_on_an_rpc_that_pruned_old_blocks(funded, public_rpc):
    contract, env = funded
    # Two seconds apart, as on Base. Without an interval anvil stamps every block the same.
    contract.w3.provider.make_request("anvil_mine", [100, 2])
    assert run_recorder(env).returncode == 0
    sealed = records(env["DATABASE_URL"])
    seal_block = contract.w3.eth.get_transaction_receipt(sealed[0]["tx_hash"]).blockNumber
    with psycopg.connect(env["DATABASE_URL"]) as conn:
        conn.execute("UPDATE hotspots SET tx_hash = NULL, sealed_at = NULL")
    contract.w3.provider.make_request("anvil_mine", [5, 2])
    public_rpc.pruned_below = seal_block - 20

    result = run_recorder({**env, "RPC_URL": public_rpc.url})

    assert result.returncode == 0, result.stderr
    assert records(env["DATABASE_URL"]) == sealed


def test_no_hotspots_stores_nothing(funded, firms):
    contract, env = funded
    firms.csv = (FIRMS / "empty.csv").read_text()
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert logged(result.stdout) == (0, 0, 0, 0, 0)
    assert records(env["DATABASE_URL"]) == []
    assert contract.w3.eth.block_number == block
