import { describe, it, expect } from 'vitest';
import { parseUrlList } from './parseUrlList';

describe('parseUrlList', () => {
  it('extracts URLs from multi-line text', () => {
    const input = `
https://kufar.by/l/minsk/auto
https://re.kufar.by/l/brest/realty
https://auto.kufar.by/l/grodno/cars
`;
    expect(parseUrlList(input)).toEqual([
      'https://kufar.by/l/minsk/auto',
      'https://re.kufar.by/l/brest/realty',
      'https://auto.kufar.by/l/grodno/cars',
    ]);
  });

  it('extracts URLs from text with surrounding words and punctuation', () => {
    const input =
      'Вот ссылки: https://kufar.by/l/1. Посмотри еще (https://kufar.by/l/2)] и https://kufar.by/l/3!';
    expect(parseUrlList(input)).toEqual([
      'https://kufar.by/l/1',
      'https://kufar.by/l/2',
      'https://kufar.by/l/3',
    ]);
  });

  it('extracts URLs separated by commas and semicolons', () => {
    const input =
      'https://kufar.by/l/1, https://kufar.by/l/2;https://kufar.by/l/3,https://kufar.by/l/4; https://kufar.by/l/5';
    expect(parseUrlList(input)).toEqual([
      'https://kufar.by/l/1',
      'https://kufar.by/l/2',
      'https://kufar.by/l/3',
      'https://kufar.by/l/4',
      'https://kufar.by/l/5',
    ]);
  });

  it('collapses duplicates while preserving first-seen order', () => {
    const input = `
https://kufar.by/l/1
https://kufar.by/l/2
https://kufar.by/l/1
https://kufar.by/l/3
https://kufar.by/l/2
`;
    expect(parseUrlList(input)).toEqual([
      'https://kufar.by/l/1',
      'https://kufar.by/l/2',
      'https://kufar.by/l/3',
    ]);
  });

  it('caps output at 20 URLs', () => {
    const urls = Array.from(
      { length: 30 },
      (_, i) => `https://kufar.by/l/item${i + 1}`,
    );
    const input = urls.join('\n');
    const result = parseUrlList(input);
    expect(result).toHaveLength(20);
    expect(result).toEqual(urls.slice(0, 20));
  });

  it('ignores junk lines and returns empty array when no URLs present', () => {
    const input = `
Привет, бот!
Тут нет никаких ссылок.
Просто текст и числа 12345.
`;
    expect(parseUrlList(input)).toEqual([]);
    expect(parseUrlList('')).toEqual([]);
  });
});
