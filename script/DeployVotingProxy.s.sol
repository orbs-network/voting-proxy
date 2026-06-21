// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {VotingProxy} from "../src/VotingProxy.sol";

contract DeployVotingProxy is Script {
    function run() external returns (VotingProxy proxy) {
        address owner = vm.envAddress("OWNER");

        vm.startBroadcast();
        proxy = new VotingProxy(owner);
        vm.stopBroadcast();
    }
}
