import { t } from 'i18next';
import { type User } from 'node-telegram-bot-api';
import db from 'config/db/databaseServise';
import { sendMessage } from 'config/lib/helpers/sendMessage';
import { type IProfile } from 'config/types';
import keyboards from 'bot/keyboards';

export async function handleRegistration(
  chatId: number,
  from: User,
): Promise<void> {
  const existingUser = await db.getUser(chatId);
  if (existingUser) {
    await sendMessage(chatId, t('Пользователь уже зарегистрирован'));
    return;
  }

  const profile: IProfile = {
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
  };

  try {
    await db.setUser(chatId, profile);
    await sendMessage(chatId, t('Успех регистрации'), keyboards.Main());
    await sendMessage(chatId, t('Сообщение об отслеживании'), keyboards.Observe());
  } catch (error) {
    await sendMessage(chatId, t('Ошибка регистрации'));
    console.error('Ошибка регистрации:', error);
  }
}
