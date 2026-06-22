/* node:coverage disable */
type ScoreMap = Record<string, number>;
type InnerStrategy = {
  name: string;
  network?: string;
  params?: Record<string, unknown>;
};
type GetScoresDirect = (
  space: string,
  strategies: InnerStrategy[],
  network: string,
  provider: unknown,
  addresses: string[],
  snapshot: number | string
) => Promise<ScoreMap[]>;

let getScoresDirectHandler: GetScoresDirect = async () => {
  throw new Error('getScoresDirect handler is not configured');
};

export function setGetScoresDirectHandler(handler: GetScoresDirect): void {
  getScoresDirectHandler = handler;
}

export function resetGetScoresDirectHandler(): void {
  getScoresDirectHandler = async () => {
    throw new Error('getScoresDirect handler is not configured');
  };
}

export function getScoresDirect(...args: Parameters<GetScoresDirect>): Promise<ScoreMap[]> {
  return getScoresDirectHandler(...args);
}
/* node:coverage enable */
