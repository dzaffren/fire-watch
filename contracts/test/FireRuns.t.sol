// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DeployRuns} from "../script/DeployRuns.s.sol";
import {FireRuns} from "../src/FireRuns.sol";

contract FireRunsTest is Test {
    bytes32 constant ROOT = keccak256("08:00 UTC run");
    bytes32 constant NEXT_ROOT = keccak256("09:00 UTC run");

    address owner = makeAddr("owner");
    address recorder = makeAddr("recorder");
    address newRecorder = makeAddr("new recorder");
    FireRuns runs;

    function setUp() public {
        runs = new FireRuns(owner, recorder);
    }

    function test_RecorderSealsRootsInOrder() public {
        vm.warp(1792828800);
        vm.prank(recorder);
        assertEq(runs.sealRoot(ROOT), 1);
        vm.warp(1792832400);
        vm.prank(recorder);
        assertEq(runs.sealRoot(NEXT_ROOT), 2);

        (bytes32 root, uint64 sealedAt) = runs.runOf(1);
        assertEq(root, ROOT);
        assertEq(sealedAt, 1792828800);
        (root, sealedAt) = runs.runOf(2);
        assertEq(root, NEXT_ROOT);
        assertEq(sealedAt, 1792832400);
    }

    function test_RunOfRootFindsASealedRoot() public {
        vm.warp(1792828800);
        vm.prank(recorder);
        runs.sealRoot(ROOT);

        (bool found, uint256 run, uint64 sealedAt) = runs.runOfRoot(ROOT);
        assertTrue(found);
        assertEq(run, 1);
        assertEq(sealedAt, 1792828800);
    }

    function test_UnsealedRootAndRunsPastTheEndReturnZeros() public {
        vm.prank(recorder);
        runs.sealRoot(ROOT);

        (bool found, uint256 run, uint64 sealedAt) = runs.runOfRoot(NEXT_ROOT);
        assertFalse(found);
        assertEq(run, 0);
        assertEq(sealedAt, 0);
        for (uint256 n = 0; n < 4; n += 2) {
            (bytes32 root, uint64 at) = runs.runOf(n);
            assertEq(root, bytes32(0));
            assertEq(at, 0);
        }
    }

    function test_SealRootEmitsRootSealed() public {
        vm.expectEmit(true, true, false, true, address(runs));
        emit FireRuns.RootSealed(1, ROOT);
        vm.prank(recorder);
        runs.sealRoot(ROOT);
    }

    function test_RevertWhen_CallerIsNotRecorder() public {
        vm.prank(owner);
        vm.expectRevert(FireRuns.NotRecorder.selector);
        runs.sealRoot(ROOT);
    }

    function test_RevertWhen_RootIsEmpty() public {
        vm.prank(recorder);
        vm.expectRevert(FireRuns.EmptyRoot.selector);
        runs.sealRoot(bytes32(0));
    }

    function test_RevertWhen_RootAlreadySealed() public {
        vm.startPrank(recorder);
        runs.sealRoot(ROOT);
        vm.expectRevert(abi.encodeWithSelector(FireRuns.AlreadySealed.selector, ROOT, 1));
        runs.sealRoot(ROOT);
        vm.stopPrank();

        (bytes32 root,) = runs.runOf(2);
        assertEq(root, bytes32(0));
    }

    function test_OwnerReplacesRecorder() public {
        vm.prank(recorder);
        runs.sealRoot(ROOT);

        vm.expectEmit(true, true, false, true, address(runs));
        emit FireRuns.RecorderReplaced(recorder, newRecorder);
        vm.prank(owner);
        runs.replaceRecorder(newRecorder);
        assertEq(runs.recorder(), newRecorder);

        vm.prank(recorder);
        vm.expectRevert(FireRuns.NotRecorder.selector);
        runs.sealRoot(NEXT_ROOT);

        vm.prank(newRecorder);
        assertEq(runs.sealRoot(NEXT_ROOT), 2);
        (bytes32 root,) = runs.runOf(1);
        assertEq(root, ROOT);
    }

    function test_RevertWhen_ReplacerIsNotOwner() public {
        vm.prank(recorder);
        vm.expectRevert(FireRuns.NotOwner.selector);
        runs.replaceRecorder(newRecorder);

        vm.prank(makeAddr("thief"));
        vm.expectRevert(FireRuns.NotOwner.selector);
        runs.replaceRecorder(newRecorder);
        assertEq(runs.recorder(), recorder);
    }

    function test_RevertWhen_NewRecorderIsZero() public {
        vm.prank(owner);
        vm.expectRevert(FireRuns.ZeroRecorder.selector);
        runs.replaceRecorder(address(0));
    }

    function test_DeploysWithOwnerAndRecorderFromEnv() public {
        vm.setEnv("OWNER_ADDRESS", vm.toString(owner));
        vm.setEnv("RECORDER_ADDRESS", vm.toString(recorder));

        FireRuns deployed = new DeployRuns().run();

        assertEq(deployed.owner(), owner);
        assertEq(deployed.recorder(), recorder);
    }
}
