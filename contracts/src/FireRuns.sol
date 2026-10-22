// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title FireRuns
/// @notice Write-once, numbered store of one Merkle root per recorder run. The owner can
/// replace the recorder and do nothing else.
contract FireRuns {
    struct Run {
        bytes32 root;
        uint64 sealedAt;
    }

    event RootSealed(uint256 indexed run, bytes32 indexed root);
    event RecorderReplaced(address indexed previous, address indexed next);

    error NotRecorder();
    error NotOwner();
    error EmptyRoot();
    error AlreadySealed(bytes32 root, uint256 run);
    error ZeroRecorder();

    address public immutable owner;
    address public recorder;

    // Run n is at n - 1, so run 0 is never sealed.
    Run[] private runs;
    mapping(bytes32 root => uint256 run) private runOfRoot_;

    constructor(address owner_, address recorder_) {
        owner = owner_;
        recorder = recorder_;
    }

    /// @notice Seals `root` as the next run and returns its number, counted from 1.
    function sealRoot(bytes32 root) external returns (uint256 run) {
        if (msg.sender != recorder) revert NotRecorder();
        // A zero root would read as unsealed.
        if (root == 0) revert EmptyRoot();
        // A resent root after a crash must not seal twice.
        if (runOfRoot_[root] != 0) revert AlreadySealed(root, runOfRoot_[root]);
        runs.push(Run(root, uint64(block.timestamp)));
        run = runs.length;
        runOfRoot_[root] = run;
        emit RootSealed(run, root);
    }

    /// @notice Replaces the recorder, as after a leak of its key.
    function replaceRecorder(address next) external {
        if (msg.sender != owner) revert NotOwner();
        if (next == address(0)) revert ZeroRecorder();
        emit RecorderReplaced(recorder, next);
        recorder = next;
    }

    /// @notice Returns run `run`'s root and the block time it was sealed at, or zeros.
    function runOf(uint256 run) external view returns (bytes32 root, uint64 sealedAt) {
        if (run == 0 || run > runs.length) return (0, 0);
        Run storage r = runs[run - 1];
        return (r.root, r.sealedAt);
    }

    /// @notice Returns whether `root` is sealed, its run and its block time.
    function runOfRoot(bytes32 root) external view returns (bool found, uint256 run, uint64 sealedAt) {
        run = runOfRoot_[root];
        if (run == 0) return (false, 0, 0);
        return (true, run, runs[run - 1].sealedAt);
    }
}
