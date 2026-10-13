// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title FireRecords
/// @notice Write-once store of hotspot record fingerprints.
contract FireRecords {
    struct Seal {
        bytes32 fingerprint;
        uint64 sealedAt;
    }

    address public immutable recorder;

    mapping(bytes32 recordId => Seal) private seals;

    constructor(address recorder_) {
        recorder = recorder_;
    }

    /// @notice Seals `fingerprint` under `recordId`.
    function seal(bytes32 recordId, bytes32 fingerprint) external {
        seals[recordId] = Seal(fingerprint, uint64(block.timestamp));
    }

    /// @notice Returns the sealed fingerprint and the block time it was sealed at, or zeros.
    function sealOf(bytes32 recordId) external view returns (bytes32 fingerprint, uint64 sealedAt) {
        Seal storage s = seals[recordId];
        return (s.fingerprint, s.sealedAt);
    }
}
