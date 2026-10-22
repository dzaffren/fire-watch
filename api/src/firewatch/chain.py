"""The recorder's side of the FireRuns contract (contracts/src/FireRuns.sol)."""

import time
from datetime import datetime, timezone

from eth_account import Account
from web3 import Web3
from web3.exceptions import BlockNotFound, Web3RPCError

RECEIPT_TIMEOUT = 120
# A public RPC is several nodes behind one URL; the one asked may not have a new block yet.
BLOCK_TRIES = 10
BLOCK_RETRY_SECONDS = 1

# Hand-written so the API does not depend on a contracts build.
ABI = [
    {
        "type": "function",
        "name": "sealRoot",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "root", "type": "bytes32"}],
        "outputs": [{"name": "run", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "runOfRoot",
        "stateMutability": "view",
        "inputs": [{"name": "root", "type": "bytes32"}],
        "outputs": [
            {"name": "found", "type": "bool"},
            {"name": "run", "type": "uint256"},
            {"name": "sealedAt", "type": "uint64"},
        ],
    },
    {
        "type": "event",
        "name": "RootSealed",
        "anonymous": False,
        "inputs": [
            {"name": "run", "type": "uint256", "indexed": True},
            {"name": "root", "type": "bytes32", "indexed": True},
        ],
    },
    {"type": "error", "name": "NotRecorder", "inputs": []},
    {"type": "error", "name": "EmptyRoot", "inputs": []},
    {
        "type": "error",
        "name": "AlreadySealed",
        "inputs": [{"name": "root", "type": "bytes32"}, {"name": "run", "type": "uint256"}],
    },
]


class ChainError(Exception):
    pass


class Refused(ChainError):
    """The node refused the transaction, so it was never sent."""


class Chain:
    def __init__(self, rpc_url: str, contract_address: str, private_key: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(contract_address), abi=ABI
        )
        self.account = Account.from_key(private_key)

    def run_of_root(self, root: bytes) -> tuple[int, datetime] | None:
        """root's run and the block time it was sealed at, or None if it is not sealed."""
        found, run, sealed_at = self.contract.functions.runOfRoot(root).call()
        if not found:
            return None
        return run, datetime.fromtimestamp(sealed_at, timezone.utc)

    def seal_root(self, root: bytes) -> tuple[int, bytes, datetime]:
        """Seals root and waits for the receipt; returns its run, the tx hash and the block
        time."""
        try:
            tx = self.contract.functions.sealRoot(root).build_transaction(
                {
                    "from": self.account.address,
                    "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                }
            )
            tx_hash = self.w3.eth.send_raw_transaction(
                self.account.sign_transaction(tx).raw_transaction
            )
        except Web3RPCError as e:
            if "insufficient funds" in str(e).lower():
                raise Refused(
                    f"insufficient funds in the recorder wallet {self.account.address}"
                ) from e
            raise Refused(f"the node refused sealRoot: {e}") from e
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=RECEIPT_TIMEOUT)
        if receipt.status != 1:
            raise ChainError(f"sealRoot transaction 0x{bytes(tx_hash).hex()} reverted")
        (sealed,) = self.contract.events.RootSealed().process_receipt(receipt)
        block = self._block(receipt.blockNumber)
        return (
            sealed.args.run,
            bytes(tx_hash),
            datetime.fromtimestamp(block.timestamp, timezone.utc),
        )

    def now(self) -> datetime:
        """The latest block's time: the clock every seal is stamped with (D50)."""
        return datetime.fromtimestamp(self._block("latest").timestamp, timezone.utc)

    def balance_eth(self) -> float:
        return float(Web3.from_wei(self.w3.eth.get_balance(self.account.address), "ether"))

    def root_tx_hash(self, root: bytes, sealed_at: datetime) -> bytes:
        """The hash of the transaction that sealed root at sealed_at."""
        # Search only the blocks stamped with the seal's time; public RPCs cap getLogs ranges.
        ts = int(sealed_at.timestamp())
        logs = self.contract.events.RootSealed.get_logs(
            from_block=self._first_block_after(ts - 1),
            to_block=self._first_block_after(ts) - 1,
            argument_filters={"root": root},
        )
        if not logs:
            raise ChainError(f"no RootSealed event found for 0x{root.hex()}")
        return bytes(logs[0].transactionHash)

    def _first_block_after(self, ts: int) -> int:
        """Lowest block number whose timestamp is after ts, or latest + 1 if none is."""
        # Step back from the head in doubling strides, not up from block 0: public RPCs prune
        # old blocks, and the seal is recent.
        latest = self.w3.eth.block_number
        low, high, stride = latest, latest + 1, 1
        while low > 0 and self._block(low).timestamp > ts:
            low, high, stride = max(0, low - stride), low, stride * 2
        while low < high:
            mid = (low + high) // 2
            if self._block(mid).timestamp > ts:
                high = mid
            else:
                low = mid + 1
        return low

    def _block(self, number: int | str):
        """Block `number`, giving a lagging RPC node a few seconds to catch up."""
        for attempt in range(BLOCK_TRIES):
            try:
                return self.w3.eth.get_block(number)
            except BlockNotFound:
                if attempt == BLOCK_TRIES - 1:
                    raise
                time.sleep(BLOCK_RETRY_SECONDS)
