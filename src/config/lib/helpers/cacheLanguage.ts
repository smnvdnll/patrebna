import { Languages, type LanguageOfUser } from 'config/types';

const languages: LanguageOfUser = {};

export const getUserLanguage = async (userId: number): Promise<Languages> =>
  languages[userId]?.language ?? Languages.Russian;

export const setUserLanguage = async (
  userId: number,
  language: Languages,
): Promise<void> => {
  languages[userId] = { language };
};
