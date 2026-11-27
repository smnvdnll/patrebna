import { describe, it, expect } from 'vitest';
import {
  transformRawAds,
  toNormalizedListing,
  parsePriceString,
} from 'sources/kufar/KufarMapper';
import { type RawAd, type IExtendedAd, AdParameters } from 'config/types';

describe('KufarMapper', () => {
  it('transformRawAds correctly transforms raw Kufar ad', () => {
    const rawAds: RawAd[] = [
      {
        account_id: 'acc123',
        ad_id: 998877,
        subject: 'Lenovo ThinkCentre M720q',
        ad_link: 'https://kufar.by/item/998877',
        body_short: 'Mini PC in great condition',
        price_byn: '45000', // 450.00 BYN (in kopecks / 100)
        price_usd: '14000', // 140.00 USD
        images: [{ path: 'test_image.jpg', media_storage: 'rms' }],
        ad_parameters: [
          { p: AdParameters.Area, vl: 'Минск', v: 'Минск' },
          { p: AdParameters.Coordinates, vl: [53.9, 27.56], v: [53.9, 27.56] },
        ],
        account_parameters: [
          { p: AdParameters.NAME, vl: 'Иван', v: 'Иван' },
        ],
      },
    ];

    const transformed = transformRawAds(rawAds);
    expect(transformed).toHaveLength(1);
    expect(transformed[0].id).toBe('998877');
    expect(transformed[0].title).toBe('Lenovo ThinkCentre M720q');
    expect(transformed[0].saller_id).toBe('acc123');
    expect(transformed[0].saller_name).toBe('Иван');
    expect(transformed[0].region).toBe('Минск');
    expect(transformed[0].img_url).toBe(
      'https://rms.kufar.by/v1/list_thumbs_2x/test_image.jpg',
    );
    expect(transformed[0].price).toContain('450');
  });

  it('toNormalizedListing maps fields to standard NormalizedListing shape', () => {
    const ad: IExtendedAd = {
      id: '12345',
      title: 'HP ProDesk 400 G4',
      url: 'https://kufar.by/item/12345',
      img_url: 'https://rms.kufar.by/v1/list_thumbs_2x/img.jpg',
      region: 'Гродно',
      price: '350р. / 110$',
      saller_id: 's1',
      saller_name: 'Seller',
      parameters: {},
    };

    const normalized = toNormalizedListing(ad);
    expect(normalized.source).toBe('kufar');
    expect(normalized.externalId).toBe('12345');
    expect(normalized.title).toBe('HP ProDesk 400 G4');
    expect(normalized.url).toBe('https://kufar.by/item/12345');
    expect(normalized.location).toBe('Гродно');
    expect(normalized.imageUrls).toEqual([
      'https://rms.kufar.by/v1/list_thumbs_2x/img.jpg',
    ]);
    expect(normalized.discoveredAt).toBeInstanceOf(Date);
    expect(normalized.raw).toEqual(ad);
  });

  describe('parsePriceString', () => {
    it('parses standard BYN / USD formatted strings', () => {
      const res = parsePriceString('1 234р. / 56$');
      expect(res).toEqual({ amount: 1234, currency: 'BYN' });
    });

    it('parses non-breaking space (\\u00A0) formatted strings', () => {
      const res = parsePriceString('1\u00A0234р. / 56$');
      expect(res).toEqual({ amount: 1234, currency: 'BYN' });
    });

    it('parses USD-only price string', () => {
      const res = parsePriceString('100$');
      expect(res).toEqual({ amount: 100, currency: 'USD' });
    });

    it('parses BYN decimal price string', () => {
      const res = parsePriceString('1 234.50р.');
      expect(res).toEqual({ amount: 1234.5, currency: 'BYN' });
    });

    it('returns null for "Договорная"', () => {
      expect(parsePriceString('Договорная')).toBeNull();
    });

    it('returns null for "0р."', () => {
      expect(parsePriceString('0р.')).toBeNull();
    });

    it('returns null for empty or null strings', () => {
      expect(parsePriceString('')).toBeNull();
      expect(parsePriceString(null)).toBeNull();
      expect(parsePriceString(undefined)).toBeNull();
    });
  });
});
