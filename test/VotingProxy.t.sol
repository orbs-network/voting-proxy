// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {VotingProxy} from "../src/VotingProxy.sol";
import {Test} from "forge-std/Test.sol";

contract VotingProxyTest is Test {
    bytes4 private constant ERC1271_MAGIC_VALUE = bytes4(keccak256("isValidSignature(bytes32,bytes)"));
    bytes4 private constant ERC1271_INVALID_VALUE = bytes4(type(uint32).max);
    bytes4 private constant TRANSFER_OWNERSHIP_SELECTOR = bytes4(keccak256("transferOwnership(address)"));
    bytes4 private constant ACCEPT_OWNERSHIP_SELECTOR = bytes4(keccak256("acceptOwnership()"));
    bytes4 private constant RENOUNCE_OWNERSHIP_SELECTOR = bytes4(keccak256("renounceOwnership()"));
    bytes4 private constant PENDING_OWNER_SELECTOR = bytes4(keccak256("pendingOwner()"));

    address private source = makeAddr("source");
    address private newOwner = makeAddr("newOwner");
    address private stranger = makeAddr("stranger");

    bytes32 private voteHash = keccak256("snapshot-vote");
    bytes32 private otherHash = keccak256("other-vote");

    VotingProxy private proxy;

    event Vote(bytes32 indexed hash);
    error InvalidOwner(address owner);
    error UnauthorizedAccount(address account);

    function setUp() public {
        proxy = new VotingProxy(source);
    }

    function testSetsInitialOwnerAndSource() public view {
        assertEq(proxy.owner(), source);
        assertEq(proxy.source(), source);
    }

    function testRejectsZeroInitialOwner() public {
        vm.expectRevert(abi.encodeWithSelector(InvalidOwner.selector, address(0)));
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
        vm.expectRevert(abi.encodeWithSelector(UnauthorizedAccount.selector, stranger));

        vm.prank(stranger);
        proxy.vote(voteHash);
    }

    function testOwnerAndSourceAreImmutableAndOwnerManagementAbiIsAbsent() public {
        assertEq(proxy.owner(), source);
        assertEq(proxy.source(), source);

        assertSelectorRevertsFrom(source, abi.encodeWithSelector(TRANSFER_OWNERSHIP_SELECTOR, newOwner));
        assertSelectorRevertsFrom(newOwner, abi.encodeWithSelector(ACCEPT_OWNERSHIP_SELECTOR));
        assertSelectorRevertsFrom(source, abi.encodeWithSelector(RENOUNCE_OWNERSHIP_SELECTOR));
        assertSelectorRevertsFrom(stranger, abi.encodeWithSelector(PENDING_OWNER_SELECTOR));

        assertEq(proxy.owner(), source);
        assertEq(proxy.source(), source);
    }

    function testOnlyImmutableOwnerCanApproveVoteHash() public {
        assertSelectorRevertsFrom(source, abi.encodeWithSelector(TRANSFER_OWNERSHIP_SELECTOR, newOwner));

        vm.expectRevert(abi.encodeWithSelector(UnauthorizedAccount.selector, newOwner));
        vm.prank(newOwner);
        proxy.vote(voteHash);

        vm.prank(source);
        proxy.vote(voteHash);

        assertEq(proxy.isValidSignature(voteHash, hex""), ERC1271_MAGIC_VALUE);
    }

    function assertSelectorRevertsFrom(address caller, bytes memory callData) private {
        vm.prank(caller);
        (bool success,) = address(proxy).call(callData);

        assertFalse(success);
    }
}
