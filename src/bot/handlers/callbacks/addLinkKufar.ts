import { bot } from 'bot';
import i18next, { t } from 'i18next';
import type TelegramBot from 'node-telegram-bot-api';
import { getUserLanguage } from 'config/lib/helpers/cacheLanguage';
import { type ICallbackData } from 'config/types';
import db from 'config/db/databaseServise';
import { sendMessage } from 'config/lib/helpers/sendMessage';
import { editMessage } from 'config/lib/helpers/editMessage';
import keyboards from 'bot/keyboards';

import { parseUrlList } from 'bot/handlers/callbacks/parseUrlList';

type PendingAddLink =
  | {
      step: 'url';
      urlId: number;
    }
  | {
      step: 'interval';
      urlId: number;
      urlText?: string;
      urls?: string[];
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

  const urls = parseUrlList(urlText);
  if (urls.length === 0) {
    pendingAddLinks.delete(chatId);
    await handleAddLinkError(chatId, pending.urlId, new Error('No URLs found'));
    return;
  }

  if (urls.length === 1) {
    pendingAddLinks.set(chatId, {
      step: 'interval',
      urlId: pending.urlId,
      urlText: urls[0],
    });
  } else {
    pendingAddLinks.set(chatId, {
      step: 'interval',
      urlId: pending.urlId,
      urls,
    });
  }

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

  if (pending.urls && pending.urls.length > 1) {
    const dataParser = await db.getDataParser(chatId);
    let maxId = Math.max(
      pending.urlId,
      ...(dataParser?.urls.map((u) => u.urlId) ?? [0]),
    );

    let successCount = 0;
    const failedUrls: Array<{ url: string; reason: 'zero' | 'error' }> = [];

    for (let i = 0; i < pending.urls.length; i++) {
      const rawUrl = pending.urls[i];
      let url = rawUrl;
      try {
        url = decodeURIComponent(rawUrl);
      } catch {
        // use rawUrl if decode fails
      }
      const targetUrlId = i === 0 ? pending.urlId : ++maxId;

      const data = await db.setUrlKufar(
        chatId,
        url,
        targetUrlId,
        intervalMinutes,
      );

      if (data instanceof Error) {
        failedUrls.push({ url: rawUrl, reason: 'error' });
      } else if (!data) {
        failedUrls.push({ url: rawUrl, reason: 'zero' });
      } else {
        successCount++;
      }
    }

    if (successCount > 0 && failedUrls.length === 0) {
      await sendMessage(
        chatId,
        `${t('Добавлено ссылок')} ${successCount}`,
        keyboards.Main(),
      );
    } else if (successCount > 0 && failedUrls.length > 0) {
      const lines: string[] = [
        `${t('Добавлено ссылок')} ${successCount}`,
        '',
        t('Не удалось добавить'),
        ...failedUrls.slice(0, 3).map((item) => {
          const reason =
            item.reason === 'zero'
              ? t('Ссылка без объявлений')
              : t('ошибка');
          return `- ${item.url} (${reason})`;
        }),
      ];
      if (failedUrls.length > 3) {
        lines.push(`- ... ${t('и др.')} (${failedUrls.length - 3})`);
      }
      await sendMessage(chatId, lines.join('\n'), keyboards.Main());
    } else {
      const lines: string[] = [
        t('Ошибка добавления ссылки'),
        '',
        t('Не удалось добавить'),
        ...failedUrls.slice(0, 3).map((item) => {
          const reason =
            item.reason === 'zero'
              ? t('Ссылка без объявлений')
              : t('ошибка');
          return `- ${item.url} (${reason})`;
        }),
      ];
      if (failedUrls.length > 3) {
        lines.push(`- ... ${t('и др.')} (${failedUrls.length - 3})`);
      }
      await sendMessage(chatId, lines.join('\n'), {
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
    }
    return;
  }

  await sendMessage(chatId, t('Проверка ссылки Kufar'));

  const url = decodeURIComponent(pending.urlText ?? pending.urls?.[0] ?? '');
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
