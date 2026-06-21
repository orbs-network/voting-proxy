// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IVotingProxy {
    /// @notice Emitted when a Snapshot vote hash is approved.
    event Vote(bytes32 indexed hash);

    function owner() external view returns (address);
    function source() external view returns (address);
    function vote(bytes32 hash) external;
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4 magicValue);
}

/// @notice ERC-1271 Snapshot voting proxy whose voting-power source is the immutable owner.
contract VotingProxy is IVotingProxy {
    bytes4 private constant ERC1271_MAGIC_VALUE = bytes4(keccak256("isValidSignature(bytes32,bytes)"));
    bytes4 private constant ERC1271_INVALID_VALUE = bytes4(type(uint32).max);

    address public immutable owner;

    mapping(bytes32 hash => bool approved) public votes;

    error InvalidOwner(address owner);
    error UnauthorizedAccount(address account);

    constructor(address owner_) {
        if (owner_ == address(0)) revert InvalidOwner(owner_);

        owner = owner_;
    }

    /// @notice Account whose voting power should be used.
    function source() external view returns (address) {
        return owner;
    }

    function vote(bytes32 hash) external {
        if (msg.sender != owner) revert UnauthorizedAccount(msg.sender);

        votes[hash] = true;
        emit Vote(hash);
    }

    /// @notice Valid only for approved hashes with empty Snapshot ERC-1271 signatures.
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4 magicValue) {
        if (sig.length != 0) return ERC1271_INVALID_VALUE;

        return votes[hash] ? ERC1271_MAGIC_VALUE : ERC1271_INVALID_VALUE;
    }
}
