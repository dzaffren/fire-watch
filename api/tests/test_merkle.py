import json
import random
from pathlib import Path

import pytest
from eth_abi import encode
from eth_utils import keccak

from firewatch.merkle import leaf, root_from, tree

VECTORS = json.loads((Path(__file__).parents[2] / "fixtures" / "merkle-vectors.json").read_text())
RECORD_ID = bytes.fromhex("13b417c6f54dd95c7c418b5df3f34963cf00f46555d5cae74693cdffbb1d1cf7")
FINGERPRINT = bytes.fromhex("5c16e53d7df3be615bca703d8580e3fec0fbd86d85da8dac6265a6ec08d1b6bc")


def _leaves(n):
    rng = random.Random(n)
    return [rng.randbytes(32) for _ in range(n)]


def test_leaf_hashes_the_encoded_pair_twice():
    assert leaf(RECORD_ID, FINGERPRINT) == keccak(
        keccak(encode(["bytes32", "bytes32"], [RECORD_ID, FINGERPRINT]))
    )


def test_one_leaf_is_its_own_root():
    only = leaf(RECORD_ID, FINGERPRINT)
    assert tree([only]) == (only, [[]])


def test_two_leaves_hash_in_sorted_order():
    a, b = sorted(_leaves(2))
    assert tree([b, a]) == (keccak(a + b), [[a], [b]])


def test_an_odd_leaf_goes_up_unchanged():
    a, b, c = sorted(_leaves(3))
    root, proofs = tree([a, b, c])
    ab = keccak(a + b)
    assert root == keccak(min(ab, c) + max(ab, c))
    assert proofs == [[b, c], [a, c], [ab]]


@pytest.mark.parametrize("n", [1, 2, 3, 4, 5, 8, 13, 1297])
def test_every_proof_leads_to_its_root(n):
    leaves = _leaves(n)
    root, proofs = tree(leaves)
    assert [root_from(x, p) for x, p in zip(leaves, proofs)] == [root] * n


def test_the_root_does_not_depend_on_the_order():
    leaves = _leaves(13)
    assert tree(leaves)[0] == tree(leaves[::-1])[0]


def test_a_changed_leaf_leads_to_another_root():
    leaves = _leaves(5)
    root, proofs = tree(leaves)
    assert root_from(leaf(RECORD_ID, FINGERPRINT), proofs[2]) != root


def test_an_empty_tree_is_refused():
    with pytest.raises(ValueError):
        tree([])


def test_has_the_shared_vectors():
    assert [len(v["leaves"]) for v in VECTORS] == [1, 2, 3, 5]


@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_matches_shared_vector(vector):
    leaves = [
        leaf(bytes.fromhex(x["record_id"][2:]), bytes.fromhex(x["fingerprint"][2:]))
        for x in vector["leaves"]
    ]
    root, proofs = tree(leaves)
    assert "0x" + root.hex() == vector["root"]
    assert [["0x" + h.hex() for h in p] for p in proofs] == [x["proof"] for x in vector["leaves"]]
    assert ["0x" + x.hex() for x in leaves] == [x["leaf"] for x in vector["leaves"]]
