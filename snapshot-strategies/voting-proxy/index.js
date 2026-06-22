import { scoreWithVotingProxy } from './proxyScoring.js';

export const author = 'voting-proxy';
export const version = '0.1.0';
export const overriding = true;
export const strategy = _createVotingProxyStrategy((name) => import(`../${name}/index.js`));

const SOURCE = '0x67e828bf';
const ZERO = '0x0000000000000000000000000000000000000000';
const NAME = /^[a-z0-9-]+$/;

export function _createVotingProxyStrategy(loadStrategy) {
    return async (space, network, provider, addresses, options, snapshot) => {
        const strategies = options.strategies;
        if (!Array.isArray(strategies) || !strategies.length) {
            throw new Error('voting-proxy requires at least one inner strategy');
        }
        for (const { name } of strategies) if (!NAME.test(name)) throw new Error(`Invalid inner strategy name: ${name}`);

        return scoreWithVotingProxy({
            addresses,
            scoreInner: (scoringAddresses) =>
                scoreStrategies(space, network, provider, scoringAddresses, strategies, snapshot, loadStrategy),
            resolveSources: (proxies) => resolveSources(provider, proxies, snapshot)
        });
    };
}

async function scoreStrategies(space, network, provider, addresses, strategies, snapshot, loadStrategy) {
    const totals = Object.fromEntries(addresses.map((address) => [address, 0]));

    for (const { name, network: strategyNetwork, params = {} } of strategies) {
        const { strategy } = await loadStrategy(name);
        const scores = await strategy(space, strategyNetwork ?? network, provider, addresses, params, snapshot);

        for (const [address, score] of Object.entries(scores)) {
            totals[address] = (totals[address] ?? 0) + Number(score);
        }
    }

    return totals;
}

async function resolveSources(provider, addresses, snapshot) {
    const entries = await Promise.all(
        addresses.map(async (address) => {
            try {
                const source = decode(await provider.call({ to: address, data: SOURCE }, snapshot));
                return source && source !== ZERO ? [address, source] : undefined;
            } catch {
                return undefined;
            }
        })
    );

    return Object.fromEntries(entries.filter(Boolean));
}

function decode(result) {
    return /^0x[0-9a-fA-F]{64}$/.test(result) ? `0x${result.slice(26).toLowerCase()}` : undefined;
}
