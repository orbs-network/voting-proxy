import { scoreWithVotingProxy } from './proxyScoring.js';

export const supportedProtocols = ['evm'];
export const strategy = _createVotingProxyStrategy({
    getScoresDirect: loadScoreApiGetScoresDirect,
    callSourceMulticall: loadScoreApiSourceMulticall
});

const SOURCE_ABI = ['function source() view returns (address)'];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function _createVotingProxyStrategy({ getScoresDirect, callSourceMulticall }) {
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
            resolveSources: (proxies) =>
                resolveSources(callSourceMulticall, network, provider, proxies, snapshot)
        });
    };
}

async function scoreStrategies(
    getScoresDirect,
    space,
    network,
    provider,
    addresses,
    strategies,
    snapshot
) {
    const totals = Object.fromEntries(addresses.map((address) => [address, 0]));
    const scoresByStrategy = await getScoresDirect(
        space,
        strategies,
        network,
        provider,
        addresses,
        snapshot
    );

    for (const scores of scoresByStrategy) {
        for (const [address, score] of Object.entries(scores)) {
            totals[address] = (totals[address] ?? 0) + Number(score);
        }
    }

    return totals;
}

async function resolveSources(callSourceMulticall, network, provider, addresses, snapshot) {
    if (!provider) return {};
    const blockTag = typeof snapshot === 'number' ? snapshot : 'latest';

    let sources;
    try {
        sources = await callSourceMulticall(network, provider, addresses, blockTag);
    } catch {
        return {};
    }

    const entries = addresses.map((address, i) => {
        const source = normalizeSource(sources[i]);
        return source && source !== ZERO_ADDRESS ? [address, source] : undefined;
    });

    return Object.fromEntries(entries.filter(Boolean));
}

function normalizeSource(value) {
    const source = Array.isArray(value) ? value[0] : value;
    return typeof source === 'string' && /^0x[0-9a-fA-F]{40}$/.test(source)
        ? source.toLowerCase()
        : undefined;
}

/* node:coverage disable */
async function loadScoreApiGetScoresDirect(...args) {
    const { getScoresDirect } = await import('../../utils');
    return getScoresDirect(...args);
}

async function loadScoreApiSourceMulticall(network, provider, addresses, blockTag) {
    const [{ Interface }, { default: networks }] = await Promise.all([
        import('@ethersproject/abi'),
        import('@snapshot-labs/snapshot.js/src/networks.json')
    ]);
    const multicallInterface = new Interface([
        'function aggregate(tuple(address target, bytes callData)[] calls) ' +
            'view returns (uint256 blockNumber, bytes[] returnData)'
    ]);
    const sourceInterface = new Interface(SOURCE_ABI);
    const multicallAddress = networks[network]?.multicall;
    if (!multicallAddress) return [];

    const result = await provider.call(
        {
            to: multicallAddress,
            data: multicallInterface.encodeFunctionData('aggregate', [
                addresses.map((address) => [
                    address.toLowerCase(),
                    sourceInterface.encodeFunctionData('source', [])
                ])
            ])
        },
        blockTag
    );
    const [, returnData] = multicallInterface.decodeFunctionResult('aggregate', result);

    return returnData.map((data) => {
        try {
            return sourceInterface.decodeFunctionResult('source', data)[0];
        } catch {
            return undefined;
        }
    });
}
/* node:coverage enable */
