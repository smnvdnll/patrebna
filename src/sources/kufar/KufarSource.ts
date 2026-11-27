import { api } from 'services/apiClient';
import { type IExtendedAd } from 'config/types';
import { type MarketSource, type NormalizedListing, type SourceQuery } from 'sources/types';
import { parsePriceString, toNormalizedListing } from 'sources/kufar/KufarMapper';

export class KufarSource implements MarketSource {
  readonly name = 'kufar';

  async fetchListings(query: SourceQuery): Promise<NormalizedListing[]> {
    const { data } = await api.get<IExtendedAd[]>('ads', {
      params: { url: query.url },
    });

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((ad) => {
      const normalized = toNormalizedListing(ad);
      const parsedPrice = parsePriceString(ad.price);
      return {
        ...normalized,
        price: parsedPrice?.amount,
        currency: parsedPrice?.currency,
      };
    });
  }

  async fetchListingDetails(
    listing: NormalizedListing,
  ): Promise<NormalizedListing> {
    const { data } = await api.get<string>('ad', {
      params: { ad_id: listing.externalId },
    });

    if (typeof data === 'string' && data.trim().length > 0) {
      return {
        ...listing,
        description: data.trim(),
      };
    }

    return listing;
  }
}
