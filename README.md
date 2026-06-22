# 🗳️ Voting Proxy

Generic ERC-1271 voting proxy for Snapshot contract voting without moving stake, tokens, or delegation.

For older multisigs that cannot implement ERC-1271, upgrade, or move their voting position, `VotingProxy` lets the multisig approve exact vote hashes through a small companion contract.

## ✨ What

1. 🔐 A multisig approves an exact Snapshot vote hash onchain.
2. 🧾 `VotingProxy` exposes ERC-1271 `isValidSignature`.
3. 🧮 A Snapshot `voting-proxy` strategy maps proxy voting power to `source()`.
4. 📬 Snapshot counts the proxy vote with the owner's configured voting power.

## 🧱 Contract

```solidity
interface IVotingProxy {
    event Vote(bytes32 indexed hash);

    function owner() external view returns (address);
    function source() external view returns (address);
    function vote(bytes32 hash) external;
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4);
}
```

Minimal behavior:

1. `owner` is immutable and set in the constructor.
2. `source()` returns `owner`.
3. `vote(hash)` is callable only by `owner`.
4. Ownership cannot be transferred or renounced.
5. `isValidSignature(hash, 0x)` returns `0x1626ba7e` only if `hash` was approved.
6. `vote(hash)` emits `Vote(hash)`.

## 🔐 Roles

1. `owner` approves vote hashes.
2. `owner` provides voting power through `source()`.
3. The constructor `owner` argument sets the only owner.

## 🔁 Flow

1. Create Snapshot vote typed data with `from = VotingProxy`.
2. Compute the Snapshot EIP-712 hash.
3. Owner approves `VotingProxy.vote(hash)` through its normal signing or multisig flow.
4. Submit the vote with `address = VotingProxy` and `sig = "0x"`.
5. Snapshot calls `isValidSignature(hash, 0x)`.
6. Snapshot strategy gives `VotingProxy` the voting power of `source()`.

## 🧮 Strategy

`voting-proxy` is a generic wrapper strategy:

1. Run inner strategies for each voter normally.
2. If a voter has `0` VP and is a contract, call `source()`.
3. Run inner strategies for the source address.
4. Return the source score under the original proxy voter.
5. Dedup multiple voters that resolve to the same source.

Example:

```json
{
  "strategies": [
    {
      "name": "erc20-balance-of",
      "network": "1",
      "params": {
        "address": "0xToken",
        "symbol": "TOKEN",
        "decimals": 18
      }
    }
  ]
}
```

## ⚖️ Dedup

If multiple voters resolve to the same `source()`:

1. Direct source voter wins if present.
2. Otherwise the lowest proxy address wins deterministically.
3. All other voters for that source return `0`.

## ⚠️ Snapshot Notes

1. The strategy should be marked `overriding: true`.
2. Snapshot must treat the strategy as dependent on other addresses.
3. The proxy must exist before the proposal snapshot block.
4. The submitted Snapshot typed data must match the approved hash exactly.
