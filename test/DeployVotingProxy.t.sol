// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {DeployVotingProxy} from "../script/DeployVotingProxy.s.sol";
import {VotingProxy} from "../src/VotingProxy.sol";

contract DeployVotingProxyTest is Test {
    function testDeployScriptReadsInitialOwnerSourceFromEnv() public {
        address source = makeAddr("source");

        vm.setEnv("SOURCE_ADDRESS", vm.toString(source));

        DeployVotingProxy deploy = new DeployVotingProxy();
        VotingProxy proxy = deploy.run();

        assertEq(address(proxy).code.length > 0, true);
        assertEq(proxy.owner(), source);
        assertEq(proxy.source(), source);
    }
}
