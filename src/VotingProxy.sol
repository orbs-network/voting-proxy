// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IVotingProxy {
    /// @notice Emitted when a Snapshot vote hash is approved.
    event Vote(bytes32 indexed hash);

    function source() external view returns (address);
    function vote(bytes32 hash) external;
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4 magicValue);
}

/// @notice ERC-1271 Snapshot voting proxy whose voting-power source is the current owner.
contract VotingProxy is IVotingProxy, Ownable2Step {
    bytes4 private constant ERC1271_MAGIC_VALUE = bytes4(keccak256("isValidSignature(bytes32,bytes)"));
    bytes4 private constant ERC1271_INVALID_VALUE = 0xffffffff;

    mapping(bytes32 hash => bool approved) public votes;

    constructor(address source_) Ownable(source_) {}

    /// @notice Account whose voting power should be used.
    function source() external view returns (address) {
        return owner();
    }

    function vote(bytes32 hash) external onlyOwner {
        votes[hash] = true;
        emit Vote(hash);
    }

    /// @notice Valid only for approved hashes with empty Snapshot ERC-1271 signatures.
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4 magicValue) {
        if (sig.length != 0) return ERC1271_INVALID_VALUE;

        return votes[hash] ? ERC1271_MAGIC_VALUE : ERC1271_INVALID_VALUE;
    }
}
