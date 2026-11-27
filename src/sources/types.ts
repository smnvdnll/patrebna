export interface SourceQuery {
  url: string;
}

export interface NormalizedListing {
  source: string;
  externalId: string;
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  location?: string;
  url: string;
  imageUrls: string[];
  publishedAt?: Date;
  discoveredAt: Date;
  raw?: unknown;
}

export interface MarketSource {
  readonly name: string;
  fetchListings(query: SourceQuery): Promise<NormalizedListing[]>;
  fetchListingDetails(listing: NormalizedListing): Promise<NormalizedListing>;
}
