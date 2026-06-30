// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {DeployVotingProxyFactory} from "../script/DeployVotingProxyFactory.s.sol";
import {VotingProxy} from "../src/VotingProxy.sol";
import {VotingProxyFactory} from "../src/VotingProxyFactory.sol";
import {Test} from "forge-std/Test.sol";

contract DeployVotingProxyFactoryTest is Test {
    address private constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function testDeployScriptDeploysFactoryWithSalt() public {
        bytes32 salt = keccak256("vanity salt");
        address source = makeAddr("source");
        vm.setEnv("SALT", vm.toString(salt));

        DeployVotingProxyFactory deploy = new DeployVotingProxyFactory();

        address expected =
            vm.computeCreate2Address(salt, keccak256(type(VotingProxyFactory).creationCode), CREATE2_DEPLOYER);
        VotingProxyFactory factory = deploy.run();

        assertEq(address(factory), expected);
        assertEq(address(factory).code.length > 0, true);

        vm.prank(source);
        VotingProxy proxy = factory.create();

        assertEq(proxy.owner(), source);
        assertEq(factory.source(address(proxy)), source);
    }
}
