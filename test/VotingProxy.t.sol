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
    bytes4 private constant SOURCE_SELECTOR = bytes4(keccak256("source()"));

    address private source = makeAddr("source");
    address private newOwner = makeAddr("newOwner");
    address private stranger = makeAddr("stranger");

    bytes32 private voteHash = keccak256("snapshot-vote");
    bytes32 private otherHash = keccak256("other-vote");
    bytes private data = hex"010203";
    bytes private otherData = hex"040506";

    VotingProxy private proxy;

    event Vote(bytes32 indexed hash, bytes data);
    error InvalidOwner(address owner);
    error UnauthorizedAccount(address account);
    error EmptyData();
    error VoteAlreadyApproved(bytes32 hash);

    function setUp() public {
        proxy = new VotingProxy(source);
    }

    function testSetsInitialOwner() public view {
        assertEq(proxy.owner(), source);
    }

    function testSourceAbiIsAbsent() public {
        assertSelectorRevertsFrom(stranger, abi.encodeWithSelector(SOURCE_SELECTOR));
    }

    function testRejectsZeroInitialOwner() public {
        vm.expectRevert(abi.encodeWithSelector(InvalidOwner.selector, address(0)));
        new VotingProxy(address(0));
    }

    function testOwnerCanApproveExactVoteHash() public {
        vm.expectEmit(true, false, false, true, address(proxy));
        emit Vote(voteHash, data);

        vm.prank(source);
        proxy.vote(voteHash, data);

        assertEq(proxy.votes(voteHash), data);
        assertEq(proxy.isValidSignature(voteHash, hex""), ERC1271_MAGIC_VALUE);
        assertEq(proxy.isValidSignature(otherHash, hex""), ERC1271_INVALID_VALUE);
    }

    function testRejectsEmptyData() public {
        vm.expectRevert(EmptyData.selector);

        vm.prank(source);
        proxy.vote(voteHash, hex"");

        assertEq(proxy.votes(voteHash), hex"");
        assertEq(proxy.isValidSignature(voteHash, hex""), ERC1271_INVALID_VALUE);
    }

    function testCannotReplaceApprovedData() public {
        vm.prank(source);
        proxy.vote(voteHash, data);

        vm.expectRevert(abi.encodeWithSelector(VoteAlreadyApproved.selector, voteHash));

        vm.prank(source);
        proxy.vote(voteHash, otherData);

        assertEq(proxy.votes(voteHash), data);
        assertEq(proxy.isValidSignature(voteHash, hex""), ERC1271_MAGIC_VALUE);
    }

    function testRejectsNonEmptySignatureEvenForApprovedHash() public {
        vm.prank(source);
        proxy.vote(voteHash, data);

        assertEq(proxy.isValidSignature(voteHash, hex"01"), ERC1271_INVALID_VALUE);
    }

    function testOnlyOwnerCanApproveVoteHash() public {
        vm.expectRevert(abi.encodeWithSelector(UnauthorizedAccount.selector, stranger));

        vm.prank(stranger);
        proxy.vote(voteHash, data);
    }

    function testOwnerIsImmutableAndOwnerManagementAbiIsAbsent() public {
        assertEq(proxy.owner(), source);

        assertSelectorRevertsFrom(source, abi.encodeWithSelector(TRANSFER_OWNERSHIP_SELECTOR, newOwner));
        assertSelectorRevertsFrom(newOwner, abi.encodeWithSelector(ACCEPT_OWNERSHIP_SELECTOR));
        assertSelectorRevertsFrom(source, abi.encodeWithSelector(RENOUNCE_OWNERSHIP_SELECTOR));
        assertSelectorRevertsFrom(stranger, abi.encodeWithSelector(PENDING_OWNER_SELECTOR));

        assertEq(proxy.owner(), source);
    }

    function testOnlyImmutableOwnerCanApproveVoteHash() public {
        assertSelectorRevertsFrom(source, abi.encodeWithSelector(TRANSFER_OWNERSHIP_SELECTOR, newOwner));

        vm.expectRevert(abi.encodeWithSelector(UnauthorizedAccount.selector, newOwner));
        vm.prank(newOwner);
        proxy.vote(voteHash, data);

        vm.prank(source);
        proxy.vote(voteHash, data);

        assertEq(proxy.isValidSignature(voteHash, hex""), ERC1271_MAGIC_VALUE);
    }

    function assertSelectorRevertsFrom(address caller, bytes memory callData) private {
        vm.prank(caller);
        (bool success,) = address(proxy).call(callData);

        assertFalse(success);
    }
}
