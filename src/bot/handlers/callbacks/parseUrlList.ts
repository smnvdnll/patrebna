export function parseUrlList(raw: string): string[] {
  if (!raw || typeof raw !== 'string') {
    return [];
  }

  const regex = /https?:\/\/[^\s,;]+/gi;
  const matches = raw.match(regex);
  if (!matches) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of matches) {
    const trimmed = match.replace(/[,.;:!?)\]}>"']+$/g, '');
    if (!trimmed || !/^https?:\/\/.+/i.test(trimmed)) {
      continue;
    }

    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
      if (result.length === 20) {
        break;
      }
    }
  }

  return result;
}
