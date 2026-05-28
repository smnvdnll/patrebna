import { Schema, model } from 'mongoose';

const DataParserSchema = new Schema(
  {
    urls: {
      type: [
        {
          urlId: {
            type: Number,
            required: true,
          },
          url: {
            type: String,
            trim: true,
            required: true,
          },
          isActive: {
            type: Boolean,
            required: true,
          },
          intervalMinutes: {
            type: Number,
            required: true,
            min: 1,
          },
          lastCheckedAt: {
            type: Date,
          },
        },
      ],
    },
  },
  { versionKey: false },
);

export const DataParser = model('DataParser', DataParserSchema);
