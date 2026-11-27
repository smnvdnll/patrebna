import axios from 'axios';
import { type InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { isTelegramError } from 'config/types';
import { createReadStream } from 'fs';
import FormData from 'form-data';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TOKEN}`;
const DEFAULT_IMAGE_PATH = 'src/bot/assets/images/no-photo.webp';

export const TelegramService = {
  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboardMarkup,
  ) {
    try {
      const url = `${TELEGRAM_API_URL}/editMessageText`;
      await axios.post(url, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } catch (error) {
      if (isTelegramError(error)) {
        const { error_code, description } = error.response.body;
        if (description.includes('Bad Request: message is not modified')) {
          console.log(
            'Сообщение не было изменено, так как содержимое осталось тем же.',
          );
          return;
        }
        if (
          error_code === 403 ||
          (error_code === 400 && description.includes('USER_IS_BLOCKED'))
        ) {
          console.warn(`Пользователь ${chatId} заблокировал бота.`);
          return;
        }

        console.error('Ошибка при отправке сообщения в Telegram:', error);
      }
      console.error('Неизвестная ошибка:', error);
    }
  },
  async sendMessageToChat(text: string) {
    if (!CHAT_ID) return;

    try {
      const url = `${TELEGRAM_API_URL}/sendMessage`;
      await axios.post(url, {
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
      });
    } catch (error) {
      console.error('Ошибка при отправке сообщения в Telegram:', error);
    }
  },
  async sendMessage(
    chatId: number,
    text: string,
    keyboard?: InlineKeyboardMarkup,
  ): Promise<number | undefined> {
    try {
      const url = `${TELEGRAM_API_URL}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return response.data?.result?.message_id;
    } catch (error) {
      await this.handleUserError(chatId, error);
      return undefined;
    }
  },
  async sendPhoto(
    chatId: number,
    caption: string,
    keyboard?: InlineKeyboardMarkup,
    photo?: string,
  ): Promise<number | undefined> {
    try {
      if (photo) {
        const url = `${TELEGRAM_API_URL}/sendPhoto`;
        const response = await axios.post(url, {
          chat_id: chatId,
          photo,
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        return response.data?.result?.message_id;
      }

      const url = `${TELEGRAM_API_URL}/sendPhoto`;
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      if (keyboard) form.append('reply_markup', JSON.stringify(keyboard));
      form.append('photo', createReadStream(DEFAULT_IMAGE_PATH));
      const response = await axios.post(url, form, { headers: form.getHeaders() });
      return response.data?.result?.message_id;
    } catch (error) {
      const fallbackResult = await this.sendMessage(chatId, caption, keyboard);
      await this.handleUserError(chatId, error);
      return fallbackResult;
    }
  },
  async handleUserError(chatId: number, error: unknown) {
    if (isTelegramError(error)) {
      const { error_code, description } = error.response.body;
      if (
        error_code === 403 ||
        (error_code === 400 && description.includes('USER_IS_BLOCKED'))
      ) {
        console.warn(`Пользователь ${chatId} заблокировал бота.`);
        return;
      }
    }
    console.error('Ошибка при отправке сообщения в Telegram:', error);
  },
};
