import { randomUUID } from 'node:crypto';
import { type Types } from 'mongoose';
import {
  Listing,
  type IListing,
  type IListingDoc,
  type ITelegramMessageRef,
} from 'config/db/models/Listing';
import { type NormalizedListing } from 'sources/types';

export const CLAIM_LEASE_MS = 15 * 60 * 1000;

export class ListingService {
  async upsertListing(listing: NormalizedListing): Promise<IListingDoc> {
    const setFields: Record<string, unknown> = {
      title: listing.title,
    };
    if (listing.description !== undefined) setFields.description = listing.description;
    if (listing.price !== undefined) setFields.price = listing.price;
    if (listing.currency !== undefined) setFields.currency = listing.currency;
    if (listing.location !== undefined) setFields.location = listing.location;
    if (listing.url !== undefined) setFields.url = listing.url;
    if (listing.imageUrls !== undefined) setFields.imageUrls = listing.imageUrls;
    if (listing.publishedAt !== undefined) setFields.publishedAt = listing.publishedAt;
    if (listing.raw !== undefined) setFields.raw = listing.raw;

    const setOnInsert: Record<string, unknown> = {
      discoveredAt: listing.discoveredAt || new Date(),
      telegramMessages: [],
      notifiedUsers: [],
      claimedUsers: [],
    };

    try {
      const doc = await Listing.findOneAndUpdate(
        { source: listing.source, externalId: listing.externalId },
        {
          $set: setFields,
          $setOnInsert: setOnInsert,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
      return doc as IListingDoc;
    } catch (err: any) {
      if (err?.code === 11000 || (err?.message && err.message.includes('E11000'))) {
        const existing = await Listing.findOne({
          source: listing.source,
          externalId: listing.externalId,
        });
        if (existing) {
          return existing as IListingDoc;
        }
      }
      throw err;
    }
  }

  async getListingByExternalId(
    source: string,
    externalId: string,
  ): Promise<IListingDoc | null> {
    return await Listing.findOne({ source, externalId });
  }

  async getBySourceAndExternalIds(
    source: string,
    externalIds: string[],
  ): Promise<IListingDoc[]> {
    if (!externalIds.length) return [];
    return await Listing.find({
      source,
      externalId: { $in: externalIds },
    });
  }

  async getListingById(id: string | Types.ObjectId): Promise<IListingDoc | null> {
    return await Listing.findById(id);
  }

  async getListingByTelegramMessage(
    chatId: number,
    messageId: number,
  ): Promise<IListingDoc | null> {
    return await Listing.findOne({
      telegramMessages: { $elemMatch: { chatId, messageId } },
    });
  }

  hasTelegramMessageRef(
    listingDoc: { telegramMessages?: ITelegramMessageRef[] } | null | undefined,
    chatId: number,
    messageId: number,
  ): boolean {
    if (!listingDoc?.telegramMessages || !Array.isArray(listingDoc.telegramMessages)) {
      return false;
    }
    return listingDoc.telegramMessages.some(
      (ref) => ref.chatId === chatId && ref.messageId === messageId,
    );
  }

  async addTelegramMessageRef(
    listingId: string | Types.ObjectId,
    chatId: number,
    messageId: number,
  ): Promise<void> {
    await Listing.updateOne(
      { _id: listingId },
      {
        $addToSet: {
          telegramMessages: { chatId, messageId },
        },
      },
    );
  }

  async claimListingForUser(
    listingId: string | Types.ObjectId,
    userId: number,
    now: Date = new Date(),
  ): Promise<{ doc: IListingDoc; token: string } | null> {
    const staleThreshold = new Date(now.getTime() - CLAIM_LEASE_MS);
    await Listing.updateOne(
      {
        _id: listingId,
        claimedUsers: {
          $elemMatch: { userId, claimedAt: { $lt: staleThreshold } },
        },
      },
      {
        $pull: {
          claimedUsers: { userId, claimedAt: { $lt: staleThreshold } },
        },
      },
    );

    const token = randomUUID();
    const doc = await Listing.findOneAndUpdate(
      {
        _id: listingId,
        notifiedUsers: { $ne: userId },
        'claimedUsers.userId': { $ne: userId },
      },
      {
        $push: { claimedUsers: { userId, claimedAt: now, token } },
      },
      { new: true },
    );

    if (!doc) return null;
    return { doc: doc as IListingDoc, token };
  }

  async releaseClaim(
    listingId: string | Types.ObjectId,
    userId: number,
    token: string,
  ): Promise<void> {
    await Listing.updateOne(
      { _id: listingId, claimedUsers: { $elemMatch: { userId, token } } },
      { $pull: { claimedUsers: { userId, token } } },
    );
  }

  async markNotified(
    listingId: string | Types.ObjectId,
    userId: number,
    token: string,
  ): Promise<void> {
    const now = new Date();
    await Listing.updateOne(
      { _id: listingId, claimedUsers: { $elemMatch: { userId, token } } },
      {
        $pull: { claimedUsers: { userId, token } },
        $addToSet: { notifiedUsers: userId },
        $set: { notifiedAt: now },
      },
    );
  }

  toNormalizedListing(doc: IListing | IListingDoc): NormalizedListing {
    return {
      source: doc.source,
      externalId: doc.externalId,
      title: doc.title,
      description: doc.description,
      price: doc.price,
      currency: doc.currency,
      location: doc.location,
      url: doc.url,
      imageUrls: doc.imageUrls || [],
      publishedAt: doc.publishedAt,
      discoveredAt: doc.discoveredAt,
      raw: doc.raw,
    };
  }
}

export const listingService = new ListingService();
