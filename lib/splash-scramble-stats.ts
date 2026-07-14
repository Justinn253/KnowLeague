import { promises as fs } from 'fs';
import path from 'path';

export type SplashScrambleDailyStatsSnapshot = {
  dateKey: string;
  correctSolves: number;
};

type SplashScrambleClientRecord = {
  solved: boolean;
};

type SplashScrambleDailyStatsRecord = {
  dateKey: string;
  correctSolves: number;
  clients: Record<string, SplashScrambleClientRecord>;
};

export type RecordSplashScrambleSolveInput = {
  dateKey: string;
  clientId: string;
};

export type RecordSplashScrambleSolveResult = {
  snapshot: SplashScrambleDailyStatsSnapshot;
  accepted: boolean;
  clientAlreadySolved: boolean;
};

const STATS_PATH = path.join(process.cwd(), 'data', 'runtime', 'splash-scramble-stats.json');
let writeQueue = Promise.resolve();

function createEmptyDailyRecord(dateKey: string): SplashScrambleDailyStatsRecord {
  return {
    dateKey,
    correctSolves: 0,
    clients: {},
  };
}

async function readStatsFile() {
  try {
    const rawStats = await fs.readFile(STATS_PATH, 'utf8');
    return JSON.parse(rawStats) as Record<string, SplashScrambleDailyStatsRecord>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function writeStatsFile(stats: Record<string, SplashScrambleDailyStatsRecord>) {
  await fs.mkdir(path.dirname(STATS_PATH), { recursive: true });
  await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), 'utf8');
}

function toSnapshot(record: SplashScrambleDailyStatsRecord): SplashScrambleDailyStatsSnapshot {
  return {
    dateKey: record.dateKey,
    correctSolves: record.correctSolves,
  };
}

export async function getSplashScrambleDailyStats(dateKey: string): Promise<SplashScrambleDailyStatsSnapshot> {
  const stats = await readStatsFile();
  return toSnapshot(stats[dateKey] ?? createEmptyDailyRecord(dateKey));
}

export function recordSplashScrambleSolve(input: RecordSplashScrambleSolveInput): Promise<RecordSplashScrambleSolveResult> {
  const operation = writeQueue.then(async () => {
    const stats = await readStatsFile();
    const dailyRecord = stats[input.dateKey] ?? createEmptyDailyRecord(input.dateKey);
    const clientRecord = dailyRecord.clients[input.clientId] ?? { solved: false };
    const clientAlreadySolved = clientRecord.solved;
    const accepted = !clientAlreadySolved;

    if (accepted) {
      dailyRecord.correctSolves += 1;
      clientRecord.solved = true;
    }

    dailyRecord.clients[input.clientId] = clientRecord;
    stats[input.dateKey] = dailyRecord;
    await writeStatsFile(stats);

    return {
      snapshot: toSnapshot(dailyRecord),
      accepted,
      clientAlreadySolved,
    };
  });

  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );

  return operation;
}
