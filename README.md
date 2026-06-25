# 🗳️ Voting Proxy

Generic ERC-1271 voting proxy for Snapshot voting without moving voting power.

For older multisigs that cannot upgrade to ERC-1271 or move their voting power,
`VotingProxy` lets the multisig approve exact vote hashes and recover the
associated data through a small companion contract.

Snapshot Score API strategy PR: https://github.com/snapshot-labs/score-api/pull/1452

## ✨ What

1. 🔐 A multisig approves an exact Snapshot vote hash and associated data onchain.
2. 🧾 `VotingProxy` exposes ERC-1271 `isValidSignature`.
3. 🧮 A Snapshot `voting-proxy` strategy maps proxy voting power to `source()`.
4. 📬 Snapshot counts the proxy vote with the owner's configured voting power.

## 🧱 Contract

```solidity
interface IVotingProxy {
    event Vote(bytes32 indexed hash, bytes data);

    function owner() external view returns (address);
    function source() external view returns (address);
    function votes(bytes32 hash) external view returns (bytes memory data);
    function vote(bytes32 hash, bytes calldata data) external;
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4);
}
```

Minimal behavior:

1. `owner` is immutable and set in the constructor.
2. `source()` returns `owner`.
3. `vote(hash, data)` is callable only by `owner`.
4. Ownership cannot be transferred or renounced.
5. `data` must be non-empty.
6. An approved hash cannot be replaced.
7. `votes(hash)` returns the stored data bytes for retrieval.
8. `isValidSignature(hash, 0x)` returns `0x1626ba7e` only if `votes(hash).length != 0`.
9. `vote(hash, data)` emits `Vote(hash, data)`.

## 🔐 Roles

1. `owner` approves vote hashes.
2. `owner` provides voting power through `source()`.
3. The constructor `owner` argument sets the only owner.

## 🔁 Flow

1. Create Snapshot vote typed data with `from = VotingProxy`.
2. Compute the Snapshot EIP-712 hash.
3. Owner approves `VotingProxy.vote(hash, data)` through its normal signing or multisig flow.
4. Later signers or submitters can read `votes(hash)` to recover the stored data.
5. Submit the vote with `address = VotingProxy` and `sig = "0x"`.
6. Snapshot calls `isValidSignature(hash, 0x)`.
7. Snapshot strategy gives `VotingProxy` the voting power of `source()`.

## 🧮 Strategy

`voting-proxy` is a generic wrapper strategy:

1. Run inner strategies for each voter normally.
2. If a voter has `0` VP, batch-call `source()` with Snapshot multicall.
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
5. The contract stores data bytes for retrieval, but offchain tooling must verify those bytes match the approved hash.
