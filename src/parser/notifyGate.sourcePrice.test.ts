import { describe, expect, it } from 'vitest';
import {
  matchSourcePriceRule,
  parseSourcePriceRules,
  passesPriceAndKeywordGate,
} from 'parser/notifyGate';

const RAM_URL =
  'https://www.kufar.by/l/komplektuyushchie-dlja-kompjutera?query=ddr4&sort=lst.d';
const SSD_URL = 'https://www.kufar.by/l/zhestkie-diski?query=ssd&sort=lst.d';

describe('parseSourcePriceRules', () => {
  it('parses match:price pairs', () => {
    expect(parseSourcePriceRules('query=ddr4:300')).toEqual([
      { match: 'query=ddr4', maxPrice: 300 },
    ]);
  });

  it('parses several comma separated rules and trims them', () => {
    expect(parseSourcePriceRules(' query=ddr4:300 , query=ddr3:150 ')).toEqual([
      { match: 'query=ddr4', maxPrice: 300 },
      { match: 'query=ddr3', maxPrice: 150 },
    ]);
  });

  it('keeps colons inside the match part (splits on the last colon)', () => {
    expect(parseSourcePriceRules('https://www.kufar.by/l?query=ddr4:300')).toEqual([
      { match: 'https://www.kufar.by/l?query=ddr4', maxPrice: 300 },
    ]);
  });

  it('never throws and drops junk', () => {
    expect(parseSourcePriceRules(undefined)).toEqual([]);
    expect(parseSourcePriceRules('')).toEqual([]);
    expect(parseSourcePriceRules('query=ddr4')).toEqual([]);
    expect(parseSourcePriceRules('query=ddr4:0')).toEqual([]);
    expect(parseSourcePriceRules('query=ddr4:abc')).toEqual([]);
    expect(parseSourcePriceRules(':300')).toEqual([]);
  });
});

describe('matchSourcePriceRule', () => {
  const rules = parseSourcePriceRules('query=ddr4:300');

  it('matches a plain URL', () => {
    expect(matchSourcePriceRule(RAM_URL, rules)?.maxPrice).toBe(300);
  });

  it('matches a percent-encoded URL', () => {
    const encoded =
      'https://www.kufar.by/l/komplektuyushchie-dlja-kompjutera?query=%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE%D0%BA%D0%B0%D1%80%D1%82%D0%B0';
    const cyrillic = parseSourcePriceRules('query=видеокарта:500');
    expect(matchSourcePriceRule(encoded, cyrillic)?.maxPrice).toBe(500);
  });

  it('does not match unrelated links', () => {
    expect(matchSourcePriceRule(SSD_URL, rules)).toBeUndefined();
  });
});

describe('passesPriceAndKeywordGate with source ceilings', () => {
  const rules = parseSourcePriceRules('query=ddr4:300');

  it('caps ads coming from the оперативка link', () => {
    const over = passesPriceAndKeywordGate(
      { title: 'Оперативная память Kingston Fury DDR4 32GB', price: 770 },
      { minPrice: 60, sourceUrl: RAM_URL, sourceRules: rules },
    );
    expect(over).toEqual({ pass: false, reason: 'source_above_max_price' });

    const under = passesPriceAndKeywordGate(
      { title: 'Оперативная память Crucial DDR4 16GB', price: 250 },
      { minPrice: 60, sourceUrl: RAM_URL, sourceRules: rules },
    );
    expect(under.pass).toBe(true);
  });

  it('lets an expensive DDR4 laptop through when it came from another link', () => {
    const laptop = passesPriceAndKeywordGate(
      { title: 'Ноутбук HP EliteBook 855 G7 / 8GB DDR4', price: 700 },
      { minPrice: 60, sourceUrl: 'https://www.kufar.by/l/noutbuki?query=hp', sourceRules: rules },
    );
    expect(laptop.pass).toBe(true);
  });

  it('ignores source ceilings when no URL is supplied (discovery path)', () => {
    const res = passesPriceAndKeywordGate(
      { title: 'Оперативная память DDR4 32GB', price: 770 },
      { minPrice: 60, sourceRules: rules },
    );
    expect(res.pass).toBe(true);
  });

  it('leaves the global gates intact', () => {
    const below = passesPriceAndKeywordGate(
      { title: 'Оперативная память Micron 8GB DDR4', price: 45 },
      { minPrice: 60, sourceUrl: RAM_URL, sourceRules: rules },
    );
    expect(below).toEqual({ pass: false, reason: 'below_min_price' });

    const noPrice = passesPriceAndKeywordGate(
      { title: 'Оперативная память DDR4' },
      { minPrice: 60, sourceUrl: RAM_URL, sourceRules: rules },
    );
    expect(noPrice).toEqual({ pass: false, reason: 'no_price' });
  });
});
