// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {FireRuns} from "../src/FireRuns.sol";

/// @notice forge script script/DeployRuns.s.sol --rpc-url $RPC_URL --account fire-runs-owner --broadcast
contract DeployRuns is Script {
    function run() external returns (FireRuns runs) {
        address owner = vm.envAddress("OWNER_ADDRESS");
        address recorder = vm.envAddress("RECORDER_ADDRESS");

        vm.startBroadcast();
        runs = new FireRuns(owner, recorder);
        vm.stopBroadcast();

        console.log("FireRuns deployed at", address(runs));
        console.log("owner", owner);
        console.log("recorder", recorder);
    }
}
