// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FireRecords} from "../src/FireRecords.sol";

contract FireRecordsTest is Test {
    // Riau hotspot from fixtures/fingerprint-vectors.json (scenario 1).
    bytes32 constant FINGERPRINT = 0x5c16e53d7df3be615bca703d8580e3fec0fbd86d85da8dac6265a6ec08d1b6bc;
    bytes32 constant RECORD_ID = keccak256("riau record");

    address recorder = makeAddr("recorder");
    FireRecords records;

    function setUp() public {
        records = new FireRecords(recorder);
    }

    function test_RecorderSealsAndSealOfReturnsIt() public {
        vm.warp(1791785880);
        vm.prank(recorder);
        records.seal(RECORD_ID, FINGERPRINT);

        (bytes32 fingerprint, uint64 sealedAt) = records.sealOf(RECORD_ID);
        assertEq(fingerprint, FINGERPRINT);
        assertEq(sealedAt, 1791785880);
    }

    function test_RevertWhen_CallerIsNotRecorder() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(FireRecords.NotRecorder.selector);
        records.seal(RECORD_ID, FINGERPRINT);
    }

    function test_RevertWhen_RecordAlreadySealed() public {
        vm.startPrank(recorder);
        records.seal(RECORD_ID, FINGERPRINT);
        vm.expectRevert(abi.encodeWithSelector(FireRecords.AlreadySealed.selector, RECORD_ID));
        records.seal(RECORD_ID, keccak256("other fingerprint"));
        vm.stopPrank();

        (bytes32 fingerprint,) = records.sealOf(RECORD_ID);
        assertEq(fingerprint, FINGERPRINT);
    }

    function test_RevertWhen_FingerprintIsEmpty() public {
        vm.prank(recorder);
        vm.expectRevert(FireRecords.EmptyFingerprint.selector);
        records.seal(RECORD_ID, bytes32(0));
    }

    function test_UnsealedRecordReturnsZeros() public view {
        (bytes32 fingerprint, uint64 sealedAt) = records.sealOf(RECORD_ID);
        assertEq(fingerprint, bytes32(0));
        assertEq(sealedAt, 0);
    }
}
