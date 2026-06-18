import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_SEQUENCER_URL = 'https://seq.snapshot.org';
const VOTE_SELECTOR = '0xa69beaba';

export function voteCalldata(hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error('Expected a bytes32 vote hash');
  }

  return `${VOTE_SELECTOR}${hash.slice(2)}`;
}

export function withSignature(envelope, signature = '0x') {
  return { ...envelope, sig: signature };
}

export async function submitEnvelope(url, envelope) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(envelope)
  });
  const body = await readJsonOrText(response);

  if (!response.ok) {
    throw new Error(`Snapshot submission failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return body;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(helpText());
    return;
  }
  if (!args.hash) throw new Error('Missing --hash <bytes32>');

  const envelope = args.envelope ? withSignature(JSON.parse(await readFile(args.envelope, 'utf8'))) : undefined;
  const output = {
    voteHash: args.hash,
    voteCalldata: voteCalldata(args.hash),
    ...(envelope ? { envelope } : {})
  };

  if (args.submit) {
    if (!envelope) throw new Error('Missing --envelope <path> for --submit');
    output.receipt = await submitEnvelope(args.hub ?? DEFAULT_SEQUENCER_URL, envelope);
  }

  console.log(JSON.stringify(output, null, 2));
}

export function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--submit') {
      args.submit = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);

    const name = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);

    args[name] = value;
    index += 1;
  }

  return args;
}

async function readJsonOrText(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function helpText() {
  return `Usage: node scripts/submit-vote.mjs --hash <bytes32> [options]

Options:
  --envelope <path>       Prepared Snapshot submit envelope JSON
  --hub <url>             Snapshot sequencer URL, defaults to ${DEFAULT_SEQUENCER_URL}
  --submit                Submit the envelope after printing vote calldata
`;
}

/* node:coverage disable */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
/* node:coverage enable */
