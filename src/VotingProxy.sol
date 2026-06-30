// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IVotingProxy {
    /// @notice Emitted when a Snapshot vote hash and associated data are approved.
    event Vote(bytes32 indexed hash, bytes data);

    function owner() external view returns (address);
    function votes(bytes32 hash) external view returns (bytes memory data);
    function vote(bytes32 hash, bytes calldata data) external;
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4 magicValue);
}

/// @notice ERC-1271 Snapshot voting proxy controlled by an immutable owner.
contract VotingProxy is IVotingProxy {
    bytes4 private constant ERC1271_MAGIC_VALUE = bytes4(keccak256("isValidSignature(bytes32,bytes)"));
    bytes4 private constant ERC1271_INVALID_VALUE = bytes4(type(uint32).max);

    address public immutable owner;

    mapping(bytes32 hash => bytes data) public votes;

    error InvalidOwner(address owner);
    error UnauthorizedAccount(address account);
    error EmptyData();
    error VoteAlreadyApproved(bytes32 hash);

    constructor(address owner_) {
        if (owner_ == address(0)) revert InvalidOwner(owner_);

        owner = owner_;
    }

    function vote(bytes32 hash, bytes calldata data) external {
        if (msg.sender != owner) revert UnauthorizedAccount(msg.sender);
        if (data.length == 0) revert EmptyData();
        if (votes[hash].length != 0) revert VoteAlreadyApproved(hash);

        votes[hash] = data;
        emit Vote(hash, data);
    }

    /// @notice Valid only for approved hashes with empty Snapshot ERC-1271 signatures.
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4 magicValue) {
        if (sig.length != 0) return ERC1271_INVALID_VALUE;

        return votes[hash].length != 0 ? ERC1271_MAGIC_VALUE : ERC1271_INVALID_VALUE;
    }
}
