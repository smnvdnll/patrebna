/* eslint-disable @typescript-eslint/naming-convention */
import { bot } from 'bot';
import i18next, { t } from 'i18next';
import db from 'config/db/databaseServise';
import keyboards from 'bot/keyboards';
import { getUserLanguage } from 'config/lib/helpers/cacheLanguage';
import { notRegistrationMessage } from 'config/lib/helpers/notRegistrationMessage';
import { type ICallbackData } from 'config/types';
import { handleRegistration } from 'bot/handlers/callbacks/registration';
import { handleAddLinkKufar } from 'bot/handlers/callbacks/addLinkKufar';
import { handleChangeLanguage } from 'bot/handlers/callbacks/changeLanguage';
import { handleObserveKufar } from 'bot/handlers/callbacks/observeKufar';
import { handleChangeUrlStatus } from 'bot/handlers/callbacks/changeUrlStatus';
import { handleWrapperForLink } from 'bot/handlers/callbacks/wrapperForLink';
import { handleOpenQuestionFaq } from 'bot/handlers/callbacks/openQuestionFaq';
import { editMessage } from 'config/lib/helpers/editMessage';
import { sendMessage } from 'config/lib/helpers/sendMessage';
import { commandsWrapper } from 'config/lib/helpers/commandsWrapper';
import { commandHandlers } from 'constants/commandHandlers';
import { deleteMessage } from 'config/lib/helpers/deleteMessage';
import { pause } from 'config/lib/helpers/pause';
import { safeAnswerCallbackQuery } from 'config/lib/helpers/safeAnswerCallbackQuery';

export default async (): Promise<void> => {
  bot.on('callback_query', (query): void => {
    void (async (): Promise<void> => {
      const { data, from, id: callbackQueryId, message } = query;
      const chatId = from.id;
      const isRegistered = await db.getUser(chatId);
      let callbackData: ICallbackData;
      try {
        const parsed = JSON.parse(data ?? '{}');
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'action' in parsed
        ) {
          callbackData = parsed;
        } else {
          throw new Error('Невалидный JSON');
        }
      } catch {
        callbackData = { action: data ?? '' };
      }

      if (!isRegistered && callbackData.action !== 'registration') {
        await notRegistrationMessage(chatId);
        return;
      }

      const messageId = message?.message_id;
      const language = await getUserLanguage(chatId);
      switch (callbackData.action) {
        case 'registration': {
          await handleRegistration(chatId, from);
          break;
        }
        case 'change_language': {
          await handleChangeLanguage(chatId, message, callbackQueryId);
          break;
        }
        case 'kufar': {
          await handleObserveKufar(chatId, messageId, callbackQueryId);
          break;
        }
        case 'add_link_kufar': {
          await handleAddLinkKufar(
            chatId,
            messageId,
            callbackData,
            callbackQueryId,
          );
          break;
        }
        case 'change_status_link_kufar': {
          await handleChangeUrlStatus(
            chatId,
            messageId,
            callbackData,
            callbackQueryId,
          );
          break;
        }
        case 'remove_link_kufar': {
          await i18next.changeLanguage(language);
          const urlId: number = callbackData.param;
          await db.removeUrlKufar(chatId, urlId);
          await handleObserveKufar(chatId, messageId, callbackQueryId);
          await sendMessage(chatId, t('Ссылка удалена'));
          break;
        }
        case 'wrap_link': {
          await handleWrapperForLink(
            chatId,
            messageId,
            callbackData,
            callbackQueryId,
          );
          break;
        }
        case 'on_map': {
          const [latitude, longitude]: [number, number] = callbackData.param;
          await bot.sendLocation(chatId, latitude, longitude, {
            reply_to_message_id: messageId,
          });
          break;
        }
        case 'faq_question_open': {
          await handleOpenQuestionFaq(
            chatId,
            messageId,
            callbackData,
            callbackQueryId,
          );
          break;
        }
        case 'remove_me': {
          await i18next.changeLanguage(language);
          if (messageId) {
            await deleteMessage(chatId, messageId, callbackQueryId);
            await pause(150);
          }
          await sendMessage(chatId, t('Сообщение об удалении профиля'), {
            inline_keyboard: [
              [
                {
                  text: t('Все равно удалить'),
                  callback_data: JSON.stringify({
                    action: 'approve_remove_me',
                  }),
                },
              ],
              [
                {
                  text: t('В другой раз'),
                  callback_data: JSON.stringify({ action: 'reject' }),
                },
              ],
            ],
          });
          break;
        }
        case 'approve_remove_me': {
          await i18next.changeLanguage(language);
          await editMessage(
            chatId,
            messageId,
            t('Подтвердить удаление'),
            callbackQueryId,
            {
              inline_keyboard: [
                [
                  {
                    text: t('Регистрация'),
                    callback_data: JSON.stringify({ action: 'registration' }),
                  },
                ],
              ],
            },
          );
          await db.removeUser(chatId);
          break;
        }
        case 'reject': {
          await i18next.changeLanguage(language);
          await editMessage(
            chatId,
            messageId,
            t('Отклонить удаление'),
            callbackQueryId,
          );
          await sendMessage(
            chatId,
            t('Сообщение об отслеживании'),
            keyboards.Observe(),
          );
          break;
        }
        case 'back_observe': {
          await i18next.changeLanguage(language);
          await editMessage(
            chatId,
            messageId,
            t('Сообщение об отслеживании'),
            callbackQueryId,
            keyboards.Observe(),
          );
          break;
        }
      }
    })().catch((error) => {
      console.error('Ошибка при обработке callback_query:', error);
    });
  });
  await db.openConnection();
  for (const command of commandHandlers) {
    await commandsWrapper(command);
  }
};
