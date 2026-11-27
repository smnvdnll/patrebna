import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface ITelegramMessageRef {
  chatId: number;
  messageId: number;
}

export interface IClaimedUser {
  userId: number;
  claimedAt: Date;
  token?: string;
}

export interface IListing {
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
  telegramMessages: ITelegramMessageRef[];
  notifiedAt?: Date;
  notifiedUsers: number[];
  claimedUsers: IClaimedUser[];
  kufarAdId?: Types.ObjectId;
}

export type IListingDoc = HydratedDocument<IListing>;

const ListingSchema = new Schema<IListing>(
  {
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    price: { type: Number },
    currency: { type: String },
    location: { type: String },
    url: { type: String, required: true },
    imageUrls: { type: [String], default: [] },
    publishedAt: { type: Date },
    discoveredAt: { type: Date, default: Date.now },
    raw: { type: Schema.Types.Mixed },
    telegramMessages: [
      {
        _id: false,
        chatId: { type: Number, required: true },
        messageId: { type: Number, required: true },
      },
    ],
    notifiedAt: { type: Date },
    notifiedUsers: [{ type: Number }],
    claimedUsers: [
      {
        _id: false,
        userId: { type: Number, required: true },
        claimedAt: { type: Date, required: true },
        token: { type: String },
      },
    ],
    kufarAdId: { type: Schema.Types.ObjectId, ref: 'KufarAd' },
  },
  { timestamps: true, versionKey: false },
);

ListingSchema.index({ source: 1, externalId: 1 }, { unique: true });
ListingSchema.index({
  'telegramMessages.chatId': 1,
  'telegramMessages.messageId': 1,
});

export const Listing = model<IListing>('Listing', ListingSchema);
