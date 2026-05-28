import { Schema, model } from 'mongoose';

const ProfileSchema = new Schema(
  {
    username: {
      type: String,
    },
    first_name: {
      type: String,
    },
    last_name: {
      type: String,
    },
  },
  { versionKey: false, timestamps: true },
);

export const Profile = model('Profile', ProfileSchema);
