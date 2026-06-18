import { scoreWithVotingProxy } from './proxyScoring.js';

export const author = 'voting-proxy';
export const version = '0.1.0';
export const overriding = true;

const SOURCE_SELECTOR = '0x67e828bf';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STRATEGY_NAME = /^[a-z0-9-]+$/;

export const strategy = createVotingProxyStrategy(loadStrategy);

export function createVotingProxyStrategy(loadStrategyModule) {
    return async function votingProxyStrategy(space, network, provider, addresses, options, snapshot) {
        const strategies = validateOptions(options);

        return scoreWithVotingProxy({
            addresses,
            scoreInner: (scoringAddresses) =>
                scoreInnerStrategies(space, network, provider, scoringAddresses, strategies, snapshot, loadStrategyModule),
            resolveSources: (sourceCandidates) => resolveProxySources(provider, sourceCandidates, snapshot)
        });
    };
}

export function validateOptions(options) {
    if (!Array.isArray(options.strategies) || options.strategies.length === 0) {
        throw new Error('voting-proxy requires at least one inner strategy');
    }
    if ((options.sourceMethod ?? 'source') !== 'source') {
        throw new Error('voting-proxy currently supports sourceMethod = "source"');
    }

    for (const strategyConfig of options.strategies) {
        if (!STRATEGY_NAME.test(strategyConfig.name)) {
            throw new Error(`Invalid inner strategy name: ${strategyConfig.name}`);
        }
    }

    return options.strategies;
}

async function scoreInnerStrategies(space, network, provider, addresses, strategies, snapshot, loadStrategyModule) {
    const totals = Object.fromEntries(addresses.map((address) => [address, 0]));

    for (const strategyConfig of strategies) {
        const strategyModule = await loadStrategyModule(strategyConfig.name);
        const scores = await strategyModule.strategy(
            space,
            strategyConfig.network ?? network,
            provider,
            addresses,
            strategyConfig.params ?? {},
            snapshot
        );

        for (const [address, score] of Object.entries(scores)) {
            totals[address] = (totals[address] ?? 0) + Number(score);
        }
    }

    return totals;
}

/* node:coverage ignore next 3 */
function loadStrategy(name) {
    return import(`../${name}/index.js`);
}

export async function resolveProxySources(provider, addresses, snapshot) {
    const entries = await Promise.all(
        addresses.map(async (address) => {
            const source = await readSource(provider, address, snapshot);

            return source ? [address, source] : undefined;
        })
    );

    return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}

async function readSource(provider, address, snapshot) {
    if (!hasCall(provider)) return undefined;

    try {
        const result = await provider.call({ to: address, data: SOURCE_SELECTOR }, snapshot);
        const source = decodeAddress(result);

        return source === ZERO_ADDRESS ? undefined : source;
    } catch {
        return undefined;
    }
}

function hasCall(provider) {
    return typeof provider === 'object' && provider !== null && 'call' in provider;
}

export function decodeAddress(result) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(result)) return undefined;

    return `0x${result.slice(26).toLowerCase()}`;
}
