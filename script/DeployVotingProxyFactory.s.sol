// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {VotingProxyFactory} from "../src/VotingProxyFactory.sol";

contract DeployVotingProxyFactory is Script {
    function run() external returns (VotingProxyFactory factory) {
        bytes32 salt = vm.envOr("SALT", bytes32(0));

        vm.startBroadcast();
        factory = new VotingProxyFactory{salt: salt}();
        vm.stopBroadcast();
    }
}
