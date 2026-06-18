// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {VotingProxy} from "../src/VotingProxy.sol";

contract VotingProxyTest is Test {
    bytes4 private constant ERC1271_MAGIC_VALUE = bytes4(keccak256("isValidSignature(bytes32,bytes)"));
    bytes4 private constant ERC1271_INVALID_VALUE = 0xffffffff;

    address private source = makeAddr("source");
    address private newOwner = makeAddr("newOwner");
    address private stranger = makeAddr("stranger");

    bytes32 private voteHash = keccak256("snapshot-vote");
    bytes32 private otherHash = keccak256("other-vote");

    VotingProxy private proxy;

    event Vote(bytes32 indexed hash);
    error OwnableInvalidOwner(address owner);
    error OwnableUnauthorizedAccount(address account);

    function setUp() public {
        proxy = new VotingProxy(source);
    }

    function testSetsInitialOwnerAndSource() public view {
        assertEq(proxy.owner(), source);
        assertEq(proxy.source(), source);
    }

    function testRejectsZeroInitialOwner() public {
        vm.expectRevert(abi.encodeWithSelector(OwnableInvalidOwner.selector, address(0)));
        new VotingProxy(address(0));
    }

    function testOwnerCanApproveExactVoteHash() public {
        vm.expectEmit(true, false, false, true, address(proxy));
        emit Vote(voteHash);

        vm.prank(source);
        proxy.vote(voteHash);

        assertTrue(proxy.votes(voteHash));
        assertEq(proxy.isValidSignature(voteHash, hex""), ERC1271_MAGIC_VALUE);
        assertEq(proxy.isValidSignature(otherHash, hex""), ERC1271_INVALID_VALUE);
    }

    function testOwnerCanApproveSameVoteHashTwice() public {
        vm.startPrank(source);
        proxy.vote(voteHash);
        proxy.vote(voteHash);
        vm.stopPrank();

        assertTrue(proxy.votes(voteHash));
        assertEq(proxy.isValidSignature(voteHash, hex""), ERC1271_MAGIC_VALUE);
    }

    function testRejectsNonEmptySignatureEvenForApprovedHash() public {
        vm.prank(source);
        proxy.vote(voteHash);

        assertEq(proxy.isValidSignature(voteHash, hex"01"), ERC1271_INVALID_VALUE);
    }

    function testOnlyOwnerCanApproveVoteHash() public {
        vm.expectRevert(abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, stranger));

        vm.prank(stranger);
        proxy.vote(voteHash);
    }

    function testOwnershipTransfersInTwoStepsAndSourceFollowsOwner() public {
        vm.prank(source);
        proxy.transferOwnership(newOwner);

        assertEq(proxy.owner(), source);
        assertEq(proxy.source(), source);
        assertEq(proxy.pendingOwner(), newOwner);

        vm.prank(newOwner);
        proxy.acceptOwnership();

        assertEq(proxy.owner(), newOwner);
        assertEq(proxy.source(), newOwner);
        assertEq(proxy.pendingOwner(), address(0));
    }

    function testPreviousOwnerCannotApproveAfterOwnershipTransfer() public {
        vm.prank(source);
        proxy.transferOwnership(newOwner);

        vm.prank(newOwner);
        proxy.acceptOwnership();

        vm.expectRevert(abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, source));

        vm.prank(source);
        proxy.vote(voteHash);

        vm.prank(newOwner);
        proxy.vote(voteHash);

        assertTrue(proxy.votes(voteHash));
    }
}
