import { promises as fs } from 'fs';
import path from 'path';

export type SkindleTopGuess = {
  skinId: string;
  answer: string;
  count: number;
};

export type SkindleDailyStatsSnapshot = {
  dateKey: string;
  totalGuesses: number;
  correctGuesses: number;
  averageGuessesToSolve: number;
  topGuesses: SkindleTopGuess[];
  guessesBySkin: Record<string, number>;
};

type SkindleSkinGuessRecord = {
  skinId: string;
  answer: string;
  count: number;
  firstClientId: string;
};

type SkindleClientRecord = {
  guessIds: string[];
  solved: boolean;
  solvedGuessCount: number | null;
};

type SkindleDailyStatsRecord = {
  dateKey: string;
  totalGuesses: number;
  correctGuesses: number;
  totalWinningGuesses: number;
  guessedSkins: Record<string, SkindleSkinGuessRecord>;
  clients: Record<string, SkindleClientRecord>;
};

export type RecordSkindleGuessInput = {
  dateKey: string;
  clientId: string;
  skinId: string;
  answer: string;
  isCorrect: boolean;
};

export type RecordSkindleGuessResult = {
  snapshot: SkindleDailyStatsSnapshot;
  accepted: boolean;
  firstForSkin: boolean;
  clientAlreadySolved: boolean;
};

const STATS_PATH = path.join(process.cwd(), 'data', 'runtime', 'skindle-stats.json');
let writeQueue = Promise.resolve();

function createEmptyDailyRecord(dateKey: string): SkindleDailyStatsRecord {
  return {
    dateKey,
    totalGuesses: 0,
    correctGuesses: 0,
    totalWinningGuesses: 0,
    guessedSkins: {},
    clients: {},
  };
}

async function readStatsFile() {
  try {
    const rawStats = await fs.readFile(STATS_PATH, 'utf8');
    return JSON.parse(rawStats) as Record<string, SkindleDailyStatsRecord>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function writeStatsFile(stats: Record<string, SkindleDailyStatsRecord>) {
  await fs.mkdir(path.dirname(STATS_PATH), { recursive: true });
  await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), 'utf8');
}

function toSnapshot(record: SkindleDailyStatsRecord, includeTopGuesses = true): SkindleDailyStatsSnapshot {
  const topGuesses = includeTopGuesses
    ? Object.values(record.guessedSkins)
        .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer))
        .slice(0, 10)
        .map(({ skinId, answer, count }) => ({ skinId, answer, count }))
    : [];

  const guessesBySkin = Object.fromEntries(
    Object.values(record.guessedSkins).map((guess) => [guess.skinId, guess.count]),
  );

  return {
    dateKey: record.dateKey,
    totalGuesses: record.totalGuesses,
    correctGuesses: record.correctGuesses,
    averageGuessesToSolve: record.correctGuesses > 0 ? record.totalWinningGuesses / record.correctGuesses : 0,
    topGuesses,
    guessesBySkin,
  };
}

export async function getSkindleDailyStats(dateKey: string, includeTopGuesses = true): Promise<SkindleDailyStatsSnapshot> {
  const stats = await readStatsFile();
  return toSnapshot(stats[dateKey] ?? createEmptyDailyRecord(dateKey), includeTopGuesses);
}

export function recordSkindleGuess(input: RecordSkindleGuessInput, includeTopGuesses = true): Promise<RecordSkindleGuessResult> {
  const operation = writeQueue.then(async () => {
    const stats = await readStatsFile();
    const dailyRecord = stats[input.dateKey] ?? createEmptyDailyRecord(input.dateKey);
    const clientRecord = dailyRecord.clients[input.clientId] ?? {
      guessIds: [],
      solved: false,
      solvedGuessCount: null,
    };

    let accepted = false;
    let firstForSkin = false;
    const clientAlreadySolved = clientRecord.solved;

    if (!clientRecord.solved && !clientRecord.guessIds.includes(input.skinId)) {
      accepted = true;
      dailyRecord.totalGuesses += 1;
      clientRecord.guessIds.push(input.skinId);

      const skinRecord = dailyRecord.guessedSkins[input.skinId] ?? {
        skinId: input.skinId,
        answer: input.answer,
        count: 0,
        firstClientId: input.clientId,
      };

      skinRecord.answer = input.answer;
      skinRecord.count += 1;
      firstForSkin = skinRecord.count === 1 && skinRecord.firstClientId === input.clientId;
      dailyRecord.guessedSkins[input.skinId] = skinRecord;

      if (input.isCorrect) {
        clientRecord.solved = true;
        clientRecord.solvedGuessCount = clientRecord.guessIds.length;
        dailyRecord.correctGuesses += 1;
        dailyRecord.totalWinningGuesses += clientRecord.guessIds.length;
      }
    }

    dailyRecord.clients[input.clientId] = clientRecord;
    stats[input.dateKey] = dailyRecord;
    await writeStatsFile(stats);

    return {
      snapshot: toSnapshot(dailyRecord, includeTopGuesses),
      accepted,
      firstForSkin,
      clientAlreadySolved,
    };
  });

  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  );

  return operation;
}
