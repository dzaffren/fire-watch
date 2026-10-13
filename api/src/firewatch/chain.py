"""The recorder's side of the FireRecords contract (contracts/src/FireRecords.sol)."""

from datetime import datetime, timezone

from eth_account import Account
from web3 import Web3
from web3.exceptions import Web3RPCError

RECEIPT_TIMEOUT = 120
ZERO = b"\x00" * 32

# Hand-written so the API does not depend on a contracts build.
ABI = [
    {
        "type": "function",
        "name": "seal",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "recordId", "type": "bytes32"},
            {"name": "fingerprint", "type": "bytes32"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "sealOf",
        "stateMutability": "view",
        "inputs": [{"name": "recordId", "type": "bytes32"}],
        "outputs": [
            {"name": "fingerprint", "type": "bytes32"},
            {"name": "sealedAt", "type": "uint64"},
        ],
    },
    {
        "type": "event",
        "name": "Sealed",
        "anonymous": False,
        "inputs": [
            {"name": "recordId", "type": "bytes32", "indexed": True},
            {"name": "fingerprint", "type": "bytes32", "indexed": False},
        ],
    },
    {"type": "error", "name": "NotRecorder", "inputs": []},
    {"type": "error", "name": "AlreadySealed", "inputs": [{"name": "recordId", "type": "bytes32"}]},
    {"type": "error", "name": "EmptyFingerprint", "inputs": []},
]


class ChainError(Exception):
    pass


class Chain:
    def __init__(self, rpc_url: str, contract_address: str, private_key: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(contract_address), abi=ABI
        )
        self.account = Account.from_key(private_key)

    def sealed(self, record_id: bytes) -> datetime | None:
        """When record_id was sealed, or None if it is not sealed."""
        fingerprint, sealed_at = self.contract.functions.sealOf(record_id).call()
        if fingerprint == ZERO:
            return None
        return datetime.fromtimestamp(sealed_at, timezone.utc)

    def seal(self, record_id: bytes, fingerprint: bytes) -> tuple[bytes, datetime]:
        """Seals and waits for the receipt; returns the tx hash and the block time."""
        try:
            tx = self.contract.functions.seal(record_id, fingerprint).build_transaction(
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
                raise ChainError(
                    f"insufficient funds in the recorder wallet {self.account.address}"
                ) from e
            raise
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=RECEIPT_TIMEOUT)
        if receipt.status != 1:
            raise ChainError(f"seal transaction 0x{bytes(tx_hash).hex()} reverted")
        block = self.w3.eth.get_block(receipt.blockNumber)
        return bytes(tx_hash), datetime.fromtimestamp(block.timestamp, timezone.utc)

    def seal_tx_hash(self, record_id: bytes) -> bytes:
        """The hash of the transaction that sealed record_id."""
        sealed_at = self.sealed(record_id)
        if sealed_at is None:
            raise ChainError(f"0x{record_id.hex()} is not sealed")
        # Search only the blocks stamped with the seal's time; public RPCs cap getLogs ranges.
        ts = int(sealed_at.timestamp())
        logs = self.contract.events.Sealed.get_logs(
            from_block=self._first_block_after(ts - 1),
            to_block=self._first_block_after(ts) - 1,
            argument_filters={"recordId": record_id},
        )
        if not logs:
            raise ChainError(f"no Sealed event found for 0x{record_id.hex()}")
        return bytes(logs[0].transactionHash)

    def _first_block_after(self, ts: int) -> int:
        """Lowest block number whose timestamp is after ts, or latest + 1 if none is."""
        low, high = 0, self.w3.eth.block_number + 1
        while low < high:
            mid = (low + high) // 2
            if self.w3.eth.get_block(mid).timestamp > ts:
                high = mid
            else:
                low = mid + 1
        return low
