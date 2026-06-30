// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {DeployVotingProxyFactory} from "../script/DeployVotingProxyFactory.s.sol";
import {VotingProxy} from "../src/VotingProxy.sol";
import {VotingProxyFactory} from "../src/VotingProxyFactory.sol";
import {Test} from "forge-std/Test.sol";

contract DeployVotingProxyFactoryTest is Test {
    address private constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 private constant VANITY_SALT = 0x004b79d8019e02a7f432b2c87f0316a4da575e388066f977fd1423972d6213a3;
    address private constant VANITY_FACTORY = 0xFAc701198EE7B8f3502A1f57D8C0399848Ab61dB;

    function testDeployScriptDeploysFactoryWithHardcodedVanitySalt() public {
        address source = makeAddr("source");
        vm.setEnv("SALT", vm.toString(keccak256("ignored salt")));

        DeployVotingProxyFactory deploy = new DeployVotingProxyFactory();

        address expected =
            vm.computeCreate2Address(VANITY_SALT, keccak256(type(VotingProxyFactory).creationCode), CREATE2_DEPLOYER);
        assertEq(expected, VANITY_FACTORY);

        VotingProxyFactory factory = deploy.run();

        assertEq(address(factory), expected);
        assertEq(address(factory).code.length > 0, true);

        vm.prank(source);
        VotingProxy proxy = factory.create();

        assertEq(proxy.owner(), source);
        assertEq(factory.source(address(proxy)), source);
    }
}
