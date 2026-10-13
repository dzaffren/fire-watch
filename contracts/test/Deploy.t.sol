// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {FireRecords} from "../src/FireRecords.sol";

contract DeployTest is Test {
    function test_DeploysWithRecorderFromEnv() public {
        address recorder = makeAddr("recorder");
        vm.setEnv("RECORDER_ADDRESS", vm.toString(recorder));

        FireRecords records = new Deploy().run();

        assertEq(records.recorder(), recorder);
    }
}
