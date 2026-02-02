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
        },
      ],
    },
  },
  { versionKey: false },
);

export const DataParser = model('DataParser', DataParserSchema);
