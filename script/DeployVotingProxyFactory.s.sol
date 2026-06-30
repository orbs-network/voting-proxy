// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {VotingProxyFactory} from "../src/VotingProxyFactory.sol";

contract DeployVotingProxyFactory is Script {
    bytes32 private constant SALT = 0x004b79d8019e02a7f432b2c87f0316a4da575e388066f977fd1423972d6213a3;

    function run() external returns (VotingProxyFactory factory) {
        vm.startBroadcast();
        factory = new VotingProxyFactory{salt: SALT}();
        vm.stopBroadcast();
    }
}
