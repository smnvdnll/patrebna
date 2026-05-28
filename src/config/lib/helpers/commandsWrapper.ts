import { bot } from 'bot';
import i18next from 'i18next';
import db from 'config/db/databaseServise';
import { getUserLanguage } from 'config/lib/helpers/cacheLanguage';
import { notRegistrationMessage } from './notRegistrationMessage';
import { type ICommandHandler } from 'config/types';

export async function commandsWrapper({
  regex,
  handler,
  options = { public: false },
}: ICommandHandler): Promise<void> {
  bot.onText(regex, (ctx, match) => {
    void (async () => {
      const userId = ctx.chat.id;
      await i18next.changeLanguage(await getUserLanguage(userId));
      if (!options.public) {
        const isRegistered = await db.getUser(userId);
        if (!isRegistered) {
          await notRegistrationMessage(userId);
          return;
        }
      }
      await handler(userId, match);
    })().catch((error) => {
      console.error('Ошибка при обработке команды бота:', error);
    });
  });
}
