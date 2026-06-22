import { scoreWithVotingProxy } from './proxyScoring.js';

export const supportedProtocols = ['evm'];
export const strategy = _createVotingProxyStrategy(loadScoreApiGetScoresDirect);

const SOURCE_SELECTOR = '0x67e828bf';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function _createVotingProxyStrategy(getScoresDirect) {
    return async (space, network, provider, addresses, options, snapshot) => {
        const strategies = options?.strategies;
        if (!Array.isArray(strategies) || !strategies.length) {
            throw new Error('voting-proxy requires at least one inner strategy');
        }

        return scoreWithVotingProxy({
            addresses,
            scoreInner: (scoringAddresses) =>
                scoreStrategies(
                    getScoresDirect,
                    space,
                    network,
                    provider,
                    scoringAddresses,
                    strategies,
                    snapshot
                ),
            resolveSources: (proxies) => resolveSources(provider, proxies, snapshot)
        });
    };
}

async function scoreStrategies(getScoresDirect, space, network, provider, addresses, strategies, snapshot) {
    const totals = Object.fromEntries(addresses.map((address) => [address, 0]));
    const scoresByStrategy = await getScoresDirect(space, strategies, network, provider, addresses, snapshot);

    for (const scores of scoresByStrategy) {
        for (const [address, score] of Object.entries(scores)) {
            totals[address] = (totals[address] ?? 0) + Number(score);
        }
    }

    return totals;
}

async function resolveSources(provider, addresses, snapshot) {
    if (!provider?.call) return {};

    const blockTag = typeof snapshot === 'number' ? snapshot : 'latest';
    const entries = await Promise.all(
        addresses.map(async (address) => {
            try {
                const source = decodeSource(
                    await provider.call({ to: address, data: SOURCE_SELECTOR }, blockTag)
                );
                return source && source !== ZERO_ADDRESS ? [address, source] : undefined;
            } catch {
                return undefined;
            }
        })
    );

    return Object.fromEntries(entries.filter(Boolean));
}

function decodeSource(result) {
    return /^0x[0-9a-fA-F]{64}$/.test(result) ? `0x${result.slice(26).toLowerCase()}` : undefined;
}

async function loadScoreApiGetScoresDirect(...args) {
    const { getScoresDirect } = await import('../../utils');
    return getScoresDirect(...args);
}
