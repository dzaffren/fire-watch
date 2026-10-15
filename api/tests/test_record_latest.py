import json
import os
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

from firewatch.fingerprint import fingerprint, record_fields

ROOT = Path(__file__).parents[2]
FIRMS = ROOT / "fixtures" / "firms"
ARTIFACT = ROOT / "contracts" / "out" / "FireRecords.sol" / "FireRecords.json"
# anvil's first well-known dev account; public, holds only local test ETH.
ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RECORD_LATEST = Path(sys.executable).parent / "record-latest"


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
def firms():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FirmsHandler)
    server.csv = (FIRMS / "riau-latest.csv").read_text()
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


def _env(migrated_db, anvil, firms, contract, key):
    return {
        "DATABASE_URL": migrated_db,
        "FIRMS_MAP_KEY": "TESTKEY",
        "FIRMS_BASE_URL": f"http://127.0.0.1:{firms.server_port}",
        "RPC_URL": anvil.provider.endpoint_uri,
        "CONTRACT_ADDRESS": contract.address,
        "RECORDER_PRIVATE_KEY": key,
    }


@pytest.fixture
def funded(migrated_db, anvil, firms):
    contract = _deploy(anvil, Account.from_key(ANVIL_KEY).address)
    return contract, _env(migrated_db, anvil, firms, contract, ANVIL_KEY)


@pytest.fixture
def unfunded(migrated_db, anvil, firms):
    wallet = Account.create()
    contract = _deploy(anvil, wallet.address)
    return wallet, contract, _env(migrated_db, anvil, firms, contract, wallet.key.to_0x_hex())


def run_recorder(env):
    return subprocess.run(
        [RECORD_LATEST], env={**os.environ, **env}, capture_output=True, text=True, timeout=180
    )


def rows(url):
    with psycopg.connect(url, row_factory=dict_row) as conn:
        return conn.execute("SELECT * FROM hotspots ORDER BY id").fetchall()


def test_records_and_seals(funded, firms):
    contract, env = funded

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert firms.paths == ["/api/area/csv/TESTKEY/VIIRS_NOAA20_NRT/95,-11,141,6/5"]
    (row,) = rows(env["DATABASE_URL"])
    assert (row["source"], row["lat_e5"], row["lon_e5"], row["frp_e2"], row["confidence"]) == (
        "VIIRS_NOAA20_NRT", 43120, 10121540, 1420, "n"
    )
    assert row["acquired_at"] == datetime(2026, 10, 12, 6, 18, tzinfo=timezone.utc)
    assert len(row["record_id"]) == 32
    assert len(row["tx_hash"]) == 32
    assert row["sealed_at"] is not None
    assert result.stdout.strip() == (
        f"Sealed 0x{row['record_id'].hex()} in 0x{row['tx_hash'].hex()}"
    )
    sealed_fp, _ = contract.functions.sealOf(row["record_id"]).call()
    assert sealed_fp == fingerprint(**record_fields(row))
    receipt = contract.w3.eth.get_transaction_receipt(row["tx_hash"])
    assert receipt.status == 1 and receipt.to == contract.address


def test_rerun_prints_already_recorded(funded):
    contract, env = funded
    assert run_recorder(env).returncode == 0
    (first,) = rows(env["DATABASE_URL"])
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert "Already recorded" in result.stdout
    assert rows(env["DATABASE_URL"]) == [first]
    assert contract.w3.eth.block_number == block


def test_unfunded_wallet_keeps_row_unsealed(unfunded):
    _, contract, env = unfunded

    result = run_recorder(env)

    assert result.returncode == 1
    assert "insufficient funds" in result.stderr
    (row,) = rows(env["DATABASE_URL"])
    assert row["tx_hash"] is None and row["sealed_at"] is None
    assert contract.functions.sealOf(row["record_id"]).call()[0] == b"\x00" * 32


def test_rerun_after_funding_seals_same_row(unfunded):
    wallet, contract, env = unfunded
    assert run_recorder(env).returncode == 1
    (unsealed,) = rows(env["DATABASE_URL"])
    contract.w3.provider.make_request("anvil_setBalance", [wallet.address, hex(10**18)])

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    (row,) = rows(env["DATABASE_URL"])
    assert (row["id"], row["record_id"]) == (unsealed["id"], unsealed["record_id"])
    assert result.stdout.strip() == (
        f"Sealed 0x{row['record_id'].hex()} in 0x{row['tx_hash'].hex()}"
    )
    sealed_fp, _ = contract.functions.sealOf(row["record_id"]).call()
    assert sealed_fp == fingerprint(**record_fields(row))


def test_already_sealed_on_chain_takes_tx_hash_from_event(funded):
    contract, env = funded
    assert run_recorder(env).returncode == 0
    (sealed,) = rows(env["DATABASE_URL"])
    # As if the earlier run sent the seal but timed out before saving the receipt.
    with psycopg.connect(env["DATABASE_URL"]) as conn:
        conn.execute("UPDATE hotspots SET tx_hash = NULL, sealed_at = NULL")
    contract.w3.provider.make_request("anvil_mine", [5])
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert rows(env["DATABASE_URL"]) == [sealed]
    assert contract.w3.eth.block_number == block


def test_seal_waits_for_an_rpc_node_that_has_not_seen_the_block(funded, public_rpc):
    _, env = funded
    public_rpc.lagging = True

    result = run_recorder({**env, "RPC_URL": public_rpc.url})

    assert result.returncode == 0, result.stderr
    (row,) = rows(env["DATABASE_URL"])
    assert row["tx_hash"] is not None and row["sealed_at"] is not None


def test_already_sealed_is_found_on_an_rpc_that_pruned_old_blocks(funded, public_rpc):
    contract, env = funded
    # Two seconds apart, as on Base. Without an interval anvil stamps every block the same.
    contract.w3.provider.make_request("anvil_mine", [100, 2])
    assert run_recorder(env).returncode == 0
    (sealed,) = rows(env["DATABASE_URL"])
    seal_block = contract.w3.eth.get_transaction_receipt(sealed["tx_hash"]).blockNumber
    with psycopg.connect(env["DATABASE_URL"]) as conn:
        conn.execute("UPDATE hotspots SET tx_hash = NULL, sealed_at = NULL")
    contract.w3.provider.make_request("anvil_mine", [5, 2])
    public_rpc.pruned_below = seal_block - 20

    result = run_recorder({**env, "RPC_URL": public_rpc.url})

    assert result.returncode == 0, result.stderr
    assert rows(env["DATABASE_URL"]) == [sealed]


def test_no_hotspots_stores_nothing(funded, firms):
    contract, env = funded
    firms.csv = (FIRMS / "empty.csv").read_text()
    block = contract.w3.eth.block_number

    result = run_recorder(env)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "No hotspots in the last 5 days"
    assert rows(env["DATABASE_URL"]) == []
    assert contract.w3.eth.block_number == block
