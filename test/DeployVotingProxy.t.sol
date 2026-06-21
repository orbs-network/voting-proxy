// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {DeployVotingProxy} from "../script/DeployVotingProxy.s.sol";
import {VotingProxy} from "../src/VotingProxy.sol";
import {Test} from "forge-std/Test.sol";

contract DeployVotingProxyTest is Test {
    function testDeployScriptReadsOwnerFromEnv() public {
        address owner = makeAddr("owner");

        vm.setEnv("OWNER", vm.toString(owner));

        DeployVotingProxy deploy = new DeployVotingProxy();
        VotingProxy proxy = deploy.run();

        assertEq(address(proxy).code.length > 0, true);
        assertEq(proxy.owner(), owner);
        assertEq(proxy.source(), owner);
    }
}
