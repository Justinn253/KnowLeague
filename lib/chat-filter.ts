type EncodedBlockedTerm = {
  value: string;
};

const BLOCKED_TERMS: EncodedBlockedTerm[] = [
  { value: 'bmlnZ2Vy' },
  { value: 'bmlnZ2E=' },
  { value: 'bmln' },
  { value: 'ZmFnZ290' },
  { value: 'ZmFn' },
  { value: 'a2lrZQ==' },
  { value: 'Y2hpbms=' },
  { value: 'Z29vaw==' },
  { value: 'c3BpYw==' },
  { value: 'd2V0YmFjaw==' },
  { value: 'YmVhbmVy' },
  { value: 'Y29vbg==' },
  { value: 'amlnYWJvbw==' },
  { value: 'emlwcGVyaGVhZA==' },
  { value: 'c2FuZG5pZ2dlcg==' },
  { value: 'cmFnaGVhZA==' },
  { value: 'dHJhbm55' },
  { value: 'cmV0YXJk' },
  { value: 'bW9uZ29sb2lk' },
  { value: 'ZHlrZQ==' },
  { value: 'c2hlbWFsZQ==' },
];

const LEETSPEAK_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '8': 'b',
  '3': 'e',
  '6': 'g',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '0': 'o',
  '$': 's',
  '5': 's',
  '7': 't',
  '+': 't',
};

const CHARACTER_VARIANTS: Record<string, string> = {
  a: 'a@4',
  b: 'b8',
  c: 'c',
  d: 'd',
  e: 'e3',
  f: 'f',
  g: 'g69',
  h: 'h',
  i: 'i1!|',
  j: 'j',
  k: 'k',
  l: 'l1!|',
  m: 'm',
  n: 'n',
  o: 'o0',
  p: 'p',
  q: 'q',
  r: 'r',
  s: 's$5',
  t: 't7+',
  u: 'u',
  v: 'v',
  w: 'w',
  x: 'x',
  y: 'y',
  z: 'z2',
};

function decodeBlockedTerm(value: string) {
  if (typeof atob === 'function') {
    return atob(value);
  }

  return Buffer.from(value, 'base64').toString('utf8');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCharacterPattern(char: string) {
  const variants = CHARACTER_VARIANTS[char] ?? char;
  return `[${variants.split('').map(escapeRegExp).join('')}]+`;
}

function normalizeForChatFilter(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\s\S]/g, '')
    .split('')
    .map((char) => LEETSPEAK_MAP[char] ?? char)
    .join('')
    .replace(/([a-z0-9])\1{2,}/g, '$1$1');

  return normalized.replace(/[^a-z0-9]+/g, ' ').trim();
}

const blockedTermPatterns = BLOCKED_TERMS.map(({ value }) => {
  const term = normalizeForChatFilter(decodeBlockedTerm(value)).replace(/\s+/g, '');
  const separatedLetters = term.split('').map(escapeRegExp).join('\\s*');
  return new RegExp(`(?:^|\\s)${separatedLetters}(?:\\s|$)`, 'i');
});

const sanitizerPatterns = BLOCKED_TERMS
  .map(({ value }) => normalizeForChatFilter(decodeBlockedTerm(value)).replace(/\s+/g, ''))
  .sort((left, right) => right.length - left.length)
  .map((term) => {
    const separatedLetters = term.split('').map(buildCharacterPattern).join('[^a-zA-Z0-9]*');
    return new RegExp(`(^|[^a-zA-Z0-9])(${separatedLetters})(?=$|[^a-zA-Z0-9])`, 'gi');
  });

function maskFilteredTerm(term: string) {
  return term.replace(/[^\s]/g, '*');
}

export function containsBlockedChatTerm(message: string) {
  const normalizedMessage = normalizeForChatFilter(message);
  if (!normalizedMessage) {
    return false;
  }

  return blockedTermPatterns.some((pattern) => pattern.test(normalizedMessage));
}

export function sanitizeChatMessage(message: string) {
  return sanitizerPatterns.reduce(
    (sanitizedMessage, pattern) => sanitizedMessage.replace(pattern, (_match, prefix: string, term: string) => `${prefix}${maskFilteredTerm(term)}`),
    message,
  );
}

export function assertChatMessageAllowed(message: string) {
  if (containsBlockedChatTerm(message)) {
    throw new Error('Message blocked by chat safety filter.');
  }
}
