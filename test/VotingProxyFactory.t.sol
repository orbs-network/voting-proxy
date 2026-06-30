// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {VotingProxy} from "../src/VotingProxy.sol";
import {VotingProxyFactory} from "../src/VotingProxyFactory.sol";
import {Test} from "forge-std/Test.sol";

contract VotingProxyFactoryTest is Test {
    address private owner = makeAddr("owner");

    VotingProxyFactory private factory;

    event ProxyCreated(address indexed source, address indexed proxy);

    function setUp() public {
        factory = new VotingProxyFactory();
    }

    function testCreateDeploysProxyAndRecordsSource() public {
        vm.expectEmit(true, false, false, false, address(factory));
        emit ProxyCreated(owner, address(0));

        vm.prank(owner);
        VotingProxy proxy = factory.create();

        assertEq(address(proxy).code.length > 0, true);
        assertEq(proxy.owner(), owner);
        assertEq(factory.source(address(proxy)), owner);
    }
}
