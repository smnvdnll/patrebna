import { type RawAd, type IExtendedAd, AdParameters } from 'config/types';
import { getParametersOfAd } from 'config/lib/helpers/getParametersOfAd';
import { type NormalizedListing } from 'sources/types';

export function transformRawAds(rawAds: RawAd[]): IExtendedAd[] {
  const allImages: string[][] = rawAds.map(({ images }) => {
    if (!images.length) return [];

    return images
      .slice(0, 1)
      .map(
        ({ path, media_storage }) =>
          `https://${media_storage}.kufar.by/v1/list_thumbs_2x/${path}`,
      );
  });

  const formatPrice = (value: string): string => {
    const num = +value / 100;
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: num < 1 ? 1 : 0,
      maximumFractionDigits: num < 1 ? 2 : 0,
    }).format(num);
  };

  const extendedAds: IExtendedAd[] = rawAds.map(
    (
      {
        account_id,
        ad_id,
        subject,
        ad_link,
        price_byn,
        price_usd,
        ad_parameters,
        account_parameters,
      },
      index,
    ) => ({
      saller_id: account_id,
      saller_name: getParametersOfAd(
        account_parameters,
        AdParameters.NAME,
      )?.name?.trim(),
      id: String(ad_id),
      title: subject?.trim() || 'Без названия',
      url: ad_link,
      img_url: allImages[index][0] ?? 'https://i.ibb.co/NLkvZYG/no-photo.webp',
      price:
        price_byn !== '0' && price_usd !== '0'
          ? `${formatPrice(price_byn)}р. / ${formatPrice(price_usd)}$`
          : 'Договорная',
      region: getParametersOfAd(ad_parameters, AdParameters.Area)?.area,
      coordinates: getParametersOfAd(ad_parameters, AdParameters.Coordinates)
        ?.coordinates?.reverse()
        ?.map((item: number) => Number(item.toFixed(8))),
      parameters: getParametersOfAd(ad_parameters, [
        AdParameters.Сondition,
        AdParameters.Delivery,
        AdParameters.Safedeal,
        AdParameters.SquareMeter,
        AdParameters.Size,
        AdParameters.ReNumberFloors,
        AdParameters.Floor,
        AdParameters.YearBuilt,
        AdParameters.Rooms,
        AdParameters.Mileage,
        AdParameters.RegDate,
        AdParameters.CarsEngine,
        AdParameters.CarsType,
        AdParameters.CarsCapacity,
        AdParameters.CarsGearbox,
      ]),
    }),
  );
  return extendedAds;
}

export function toNormalizedListing(ad: IExtendedAd): NormalizedListing {
  return {
    source: 'kufar',
    externalId: ad.id,
    title: ad.title,
    url: ad.url,
    location: ad.region,
    imageUrls: [ad.img_url],
    discoveredAt: new Date(),
    raw: ad,
  };
}

export function parsePriceString(
  price?: string | null,
): { amount?: number; currency?: string } | null {
  if (!price || typeof price !== 'string') return null;
  const trimmed = price.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase().includes('договорная') ||
    trimmed === '0' ||
    trimmed === '0р.'
  ) {
    return null;
  }

  // Handle formats like "1 234р. / 56$" or "1 234 р." or "56$"
  const parts = trimmed.split('/');

  // Look for BYN first (contains 'р.' or 'byn' or 'руб')
  const bynPart = parts.find((p) => /р\.|byn|руб/i.test(p));
  if (bynPart) {
    const cleaned = bynPart
      .replace(/\u00A0/g, ' ')
      .replace(/,/g, '.')
      .replace(/[^\d.]/g, '');
    const amount = parseFloat(cleaned);
    if (!isNaN(amount) && amount > 0) {
      return { amount, currency: 'BYN' };
    }
  }

  // Look for USD part (contains '$' or 'usd')
  const usdPart = parts.find((p) => /\$|usd/i.test(p));
  if (usdPart) {
    const cleaned = usdPart
      .replace(/\u00A0/g, ' ')
      .replace(/,/g, '.')
      .replace(/[^\d.]/g, '');
    const amount = parseFloat(cleaned);
    if (!isNaN(amount) && amount > 0) {
      return { amount, currency: 'USD' };
    }
  }

  // If no currency symbol found, try general numeric extract
  const cleaned = trimmed
    .replace(/\u00A0/g, ' ')
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '');
  const amount = parseFloat(cleaned);
  if (!isNaN(amount) && amount > 0) {
    return { amount, currency: 'BYN' };
  }

  return null;
}
