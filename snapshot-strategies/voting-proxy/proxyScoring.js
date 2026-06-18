export async function scoreWithVotingProxy(options) {
    const directScores = await options.scoreInner(options.addresses);
    const directScoreLookup = normalizedScoreMap(directScores);
    const sourceCandidates = options.addresses.filter((address) => (directScoreLookup.get(address) ?? 0) === 0);
    const sourceByProxy = sourceCandidates.length > 0 ? await options.resolveSources(sourceCandidates) : {};
    const sources = sourceAddressesToScore(options.addresses, directScores, sourceByProxy);
    const sourceScores = sources.length > 0 ? await options.scoreInner(sources) : {};

    return remapProxyScores(options.addresses, directScores, sourceByProxy, sourceScores);
}

export function sourceAddressesToScore(addresses, directScores, sourceByProxy) {
    const scores = normalizedScoreMap(directScores);
    const sourcesByProxy = normalizedAddressMap(sourceByProxy);
    const directAddressKeys = normalizedAddressSet(addresses);

    return uniqueAddresses(
        addresses.flatMap((address) => sourceAddressToScore(address, scores, sourcesByProxy, directAddressKeys))
    );
}

export function remapProxyScores(addresses, directScores, sourceByProxy, sourceScores) {
    const scores = normalizedScoreMap(directScores);
    const sourcesByProxy = normalizedAddressMap(sourceByProxy);
    const sourceScoreLookup = normalizedScoreMap(sourceScores);
    const directAddressKeys = normalizedAddressSet(addresses);
    const proxyWinnerBySource = proxyWinnersBySource(addresses, scores, sourcesByProxy);

    return Object.fromEntries(
        addresses.map((address) => {
            const directScore = scoreOf(address, scores);
            const source = sourcesByProxy.get(address);
            if (directScore !== 0 || !source) return [address, directScore];

            const sourceKey = normalizeAddress(source);
            if (directAddressKeys.has(sourceKey)) return [address, 0];

            const winner = proxyWinnerBySource.get(sourceKey);
            const score = winner === normalizeAddress(address) ? sourceScoreLookup.get(source) ?? 0 : 0;

            return [address, score];
        })
    );
}

export function normalizedScoreMap(scores) {
    return normalizedAddressMap(scores);
}

function sourceAddressToScore(address, scores, sourcesByProxy, directAddressKeys) {
    if (hasVotingPower(address, scores)) return [];

    const source = sourcesByProxy.get(address);

    return source && !directAddressKeys.has(normalizeAddress(source)) ? [source] : [];
}

function proxyWinnersBySource(addresses, scores, sourcesByProxy) {
    const proxyKeysBySource = new Map();

    for (const address of addresses) {
        if (hasVotingPower(address, scores)) continue;

        const source = sourcesByProxy.get(address);
        if (!source) continue;

        const sourceKey = normalizeAddress(source);
        const proxyKeys = proxyKeysBySource.get(sourceKey) ?? [];
        proxyKeys.push(normalizeAddress(address));
        proxyKeysBySource.set(sourceKey, proxyKeys);
    }

    return new Map(
        [...proxyKeysBySource.entries()].map(([sourceKey, proxyKeys]) => [
            sourceKey,
            proxyKeys.sort(compareAddressKeys)[0]
        ])
    );
}

function normalizedAddressMap(values) {
    const map = new Map(Object.entries(values).map(([address, value]) => [normalizeAddress(address), value]));

    return {
        get: (address) => map.get(normalizeAddress(address))
    };
}

function normalizedAddressSet(addresses) {
    return new Set(addresses.map(normalizeAddress));
}

function hasVotingPower(address, scores) {
    return scoreOf(address, scores) !== 0;
}

function scoreOf(address, scores) {
    return scores.get(address) ?? 0;
}

function uniqueAddresses(addresses) {
    const seen = new Set();

    return addresses.filter((address) => {
        const key = normalizeAddress(address);
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

function compareAddressKeys(left, right) {
    return left.localeCompare(right);
}

function normalizeAddress(address) {
    return address.toLowerCase();
}
