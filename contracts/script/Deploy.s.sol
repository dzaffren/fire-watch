// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {FireRecords} from "../src/FireRecords.sol";

/// @notice forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external returns (FireRecords records) {
        address recorder = vm.envAddress("RECORDER_ADDRESS");

        vm.startBroadcast();
        records = new FireRecords(recorder);
        vm.stopBroadcast();

        console.log("FireRecords deployed at", address(records));
        console.log("recorder", recorder);
    }
}
