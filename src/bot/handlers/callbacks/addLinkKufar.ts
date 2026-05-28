import { bot } from 'bot';
import i18next, { t } from 'i18next';
import type TelegramBot from 'node-telegram-bot-api';
import { getUserLanguage } from 'config/lib/helpers/cacheLanguage';
import { type ICallbackData } from 'config/types';
import db from 'config/db/databaseServise';
import { sendMessage } from 'config/lib/helpers/sendMessage';
import { editMessage } from 'config/lib/helpers/editMessage';
import keyboards from 'bot/keyboards';

type PendingAddLink =
  | {
      step: 'url';
      urlId: number;
    }
  | {
      step: 'interval';
      urlId: number;
      urlText: string;
    };

const pendingAddLinks = new Map<number, PendingAddLink>();
let isMessageListenerRegistered = false;

async function handleAddLinkError(
  chatId: number,
  urlId: number,
  error: unknown,
): Promise<void> {
  console.error('Ошибка при обработке добавления ссылки Kufar:', error);
  await sendMessage(chatId, t('Ошибка добавления ссылки'), {
    inline_keyboard: [
      [
        {
          text: t('Добавить ссылку'),
          callback_data: JSON.stringify({
            action: 'add_link_kufar',
            param: urlId,
          }),
        },
      ],
      [
        {
          text: t('Назад'),
          callback_data: JSON.stringify({
            action: 'back_observe',
          }),
        },
      ],
    ],
  });
}

async function handleUrlMessage(
  chatId: number,
  pending: Extract<PendingAddLink, { step: 'url' }>,
  message: TelegramBot.Message,
): Promise<void> {
  const urlText = message.text;
  if (!urlText) return;

  pendingAddLinks.set(chatId, {
    step: 'interval',
    urlId: pending.urlId,
    urlText,
  });

  await sendMessage(chatId, t('Укажите частоту обновления'), {
    force_reply: true,
    input_field_placeholder: '5',
  });
}

async function handleIntervalMessage(
  chatId: number,
  pending: Extract<PendingAddLink, { step: 'interval' }>,
  message: TelegramBot.Message,
): Promise<void> {
  const intervalMinutes = Number(message.text);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    await sendMessage(chatId, t('Ошибка частоты обновления'));
    return;
  }

  pendingAddLinks.delete(chatId);
  await sendMessage(chatId, t('Проверка ссылки Kufar'));

  const url = decodeURIComponent(pending.urlText);
  const data = await db.setUrlKufar(
    chatId,
    url,
    pending.urlId,
    intervalMinutes,
  );
  if (data instanceof Error) {
    await sendMessage(chatId, t('Ошибка добавления ссылки'), {
      inline_keyboard: [
        [
          {
            text: t('Добавить ссылку'),
            callback_data: JSON.stringify({
              action: 'add_link_kufar',
              param: pending.urlId,
            }),
          },
        ],
        [
          {
            text: t('Назад'),
            callback_data: JSON.stringify({
              action: 'back_observe',
            }),
          },
        ],
      ],
    });
  } else {
    if (!data) {
      await sendMessage(chatId, t('Нулевая ссылка'), keyboards.Main());
      return;
    }
    await sendMessage(chatId, t('Сообщение об успехе'), keyboards.Main());
  }
}

function registerMessageListener(): void {
  if (isMessageListenerRegistered) return;
  isMessageListenerRegistered = true;

  bot.on('message', (message): void => {
    void (async (): Promise<void> => {
      const chatId = message.chat.id;
      const pending = pendingAddLinks.get(chatId);
      if (!pending) return;

      await i18next.changeLanguage(await getUserLanguage(chatId));

      if (message.text?.startsWith('/')) {
        pendingAddLinks.delete(chatId);
        return;
      }

      if (pending.step === 'url') {
        await handleUrlMessage(chatId, pending, message);
      } else {
        await handleIntervalMessage(chatId, pending, message);
      }
    })().catch((error) => {
      const chatId = message.chat.id;
      const pending = pendingAddLinks.get(chatId);
      pendingAddLinks.delete(chatId);
      void handleAddLinkError(chatId, pending?.urlId ?? 0, error);
    });
  });
}

export async function handleAddLinkKufar(
  chatId: number,
  messageId: number | undefined,
  callbackData: ICallbackData,
  callbackQueryId: string,
): Promise<void> {
  await i18next.changeLanguage(await getUserLanguage(chatId));
  const urlId: number = callbackData.param;
  await editMessage(
    chatId,
    messageId,
    t('Текст для Kufar при добавлении ссылки'),
    callbackQueryId,
  );

  const promptKufar = await sendMessage(chatId, t('Укажите ссылку для Kufar'), {
    force_reply: true,
    input_field_placeholder: t('Плейсхолдер ссылки Kufar'),
  });

  if (!promptKufar) return;

  registerMessageListener();
  pendingAddLinks.set(chatId, {
    step: 'url',
    urlId,
  });
}
