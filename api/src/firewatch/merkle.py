"""A run's Merkle tree (D108). Must match web/src/merkle.ts byte for byte.

A leaf is keccak256 of keccak256 of the ABI-encoded record ID and fingerprint, so a leaf can't
pass for an inner node. The leaves are sorted, each pair is hashed in sorted order, and an odd
node at the end of a level goes up unchanged.
"""

from eth_abi import encode
from eth_utils import keccak


def leaf(record_id: bytes, fingerprint: bytes) -> bytes:
    return keccak(keccak(encode(["bytes32", "bytes32"], [record_id, fingerprint])))


def _pair(a: bytes, b: bytes) -> bytes:
    return keccak(a + b if a < b else b + a)


def tree(leaves: list[bytes]) -> tuple[bytes, list[list[bytes]]]:
    """The root, and each leaf's proof in the order given."""
    if not leaves:
        raise ValueError("a tree needs at least one leaf")
    level = sorted(leaves)
    # Where each sorted leaf's branch sits on the current level.
    at = {x: i for i, x in enumerate(level)}
    proofs = {x: [] for x in level}
    while len(level) > 1:
        for x, i in at.items():
            sibling = i ^ 1
            if sibling < len(level):
                proofs[x].append(level[sibling])
            at[x] = i // 2
        level = [
            _pair(level[i], level[i + 1]) if i + 1 < len(level) else level[i]
            for i in range(0, len(level), 2)
        ]
    return level[0], [proofs[x] for x in leaves]


def root_from(leaf_hash: bytes, proof: list[bytes]) -> bytes:
    """The root that leaf_hash and its proof lead to."""
    node = leaf_hash
    for sibling in proof:
        node = _pair(node, sibling)
    return node
