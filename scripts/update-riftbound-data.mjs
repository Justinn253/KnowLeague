import { spawn } from 'node:child_process';

function printUsage() {
  console.log('Usage: npm run data:update:riftbound -- [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]');
  console.log('Refreshes the generated catalogue, then idempotently imports matching TCGCSV archive history.');
}

function parseArguments(argumentsList) {
  if (argumentsList.includes('--help')) {
    printUsage();
    return null;
  }

  const forwardedArguments = [];
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--dry-run') {
      forwardedArguments.push(argument);
      continue;
    }

    if (argument === '--from' || argument === '--to') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a YYYY-MM-DD value.`);
      }
      forwardedArguments.push(argument, value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  return forwardedArguments;
}

function runNodeScript(argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argumentsList, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed${signal ? ` with signal ${signal}` : ` with exit code ${exitCode}`}.`));
    });
  });
}

async function main() {
  const historyArguments = parseArguments(process.argv.slice(2));
  if (historyArguments === null) return;

  await runNodeScript(['scripts/generate-riftbound-catalog.mjs']);
  await runNodeScript(['--env-file=.env.local', 'scripts/import-riftbound-price-history.mjs', ...historyArguments]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
