// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {VotingProxy} from "./VotingProxy.sol";

contract VotingProxyFactory {
    mapping(address proxy => address source) public source;

    event ProxyCreated(address indexed source, address indexed proxy);

    function create() external returns (VotingProxy proxy) {
        proxy = new VotingProxy(msg.sender);
        source[address(proxy)] = msg.sender;
        emit ProxyCreated(msg.sender, address(proxy));
    }
}
