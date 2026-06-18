# Voting Proxy Strategy

Generic overriding Snapshot strategy that scores a zero-VP contract voter by calling `source()` and scoring that source address with configured inner strategies.

If several voters resolve to the same source, a direct source voter wins. Otherwise, the lowest proxy address wins deterministically and the other proxies return `0`.
