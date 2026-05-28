import db from 'config/db/databaseServise';
import { t } from 'i18next';
import { sendMessage } from 'config/lib/helpers/sendMessage';
import { sendPhoto } from 'config/lib/helpers/sendPhoto';
import { type ICommandHandler } from 'config/types';
import keyboards from 'bot/keyboards';
import { notRegistrationMessage } from 'config/lib/helpers/notRegistrationMessage';
import { bot } from 'bot';

export const commandHandlers: ICommandHandler[] = [
  {
    regex: /\/start/,
    handler: async (userId) => {
      const isRegistered = await db.getUser(userId);
      await sendMessage(userId, t('Приветствие'), keyboards.Main());
      if (isRegistered) {
        await sendMessage(
          userId,
          t('Сообщение об отслеживании'),
          keyboards.Observe(),
        );
      } else {
        await notRegistrationMessage(userId);
      }
    },
    options: { public: true },
  },
  {
    regex: /Помощь|Дапамога/,
    handler: async (userId) => {
      await sendMessage(userId, t('Сообщение для FAQ'), keyboards.Faq());
      await sendMessage(userId, t('Техподдержка'));
    },
    options: { public: true },
  },
  {
    regex: /Профиль|Профіль/,
    handler: async (userId: number) => {
      const profile = await db.getProfile(userId);
      const options: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        timeZone: 'Europe/Minsk',
      };

      const dataProfile = [
        `${t('Сообщение для профиля')}`,
        '',
        `<b>${t('ФИО')}</b>: ${profile?.last_name ?? ''} ${profile?.first_name ?? ''}`,
        `${profile?.username ? `<b>${t('Псевдоним')}</b>: ${profile.username}` : ''}`,
        `<b>${t('Дата регистрации')}</b>: ${
          (profile as { createdAt?: Date } | null)?.createdAt
            ? `<i>${new Date((profile as { createdAt: Date }).createdAt).toLocaleDateString('ru-RU', options)}</i>`
            : t('Недавно')
        }`,
      ].join('\n');
      const { photos, total_count } = await bot.getUserProfilePhotos(userId, {
        offset: 0,
        limit: 1,
      });

      if (!total_count || !photos?.length) {
        await sendMessage(userId, dataProfile, keyboards.Profile());
        return;
      }

      const avatar = photos[0];
      const bestQuality = avatar[avatar.length - 1];
      await sendPhoto(
        userId,
        dataProfile,
        keyboards.Profile(),
        bestQuality.file_id,
      );
    },
  },
  {
    regex: /Отслеживать|Адсочваць/,
    handler: async (userId: number) => {
      await sendMessage(
        userId,
        t('Сообщение об отслеживании'),
        keyboards.Observe(),
      );
    },
  },
  {
    regex: /Язык|Мова/,
    handler: async (userId: number) => {
      await sendMessage(userId, t('Переключить язык приложения'), {
        inline_keyboard: [
          [
            {
              text: t('Сменить язык'),
              callback_data: JSON.stringify({ action: 'change_language' }),
            },
          ],
        ],
      });
    },
  },
];
