type LogLevel = 'info' | 'warn' | 'error';

type ServerLogContext = Record<string, string | number | boolean | null | undefined>;

export function logServerEvent(level: LogLevel, event: string, context: ServerLogContext = {}) {
  const payload = {
    event,
    ...context,
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}
