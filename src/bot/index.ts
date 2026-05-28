import TelegramBot from 'node-telegram-bot-api';
import 'config/i18n/i18n';
import cbquery from 'bot/cbquery';

(process as any).noDeprecation = true;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

export const bot = new TelegramBot(TOKEN, {
  polling: false,
});

bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error);
});

void (async () => {
  try {
    await cbquery();
    await bot.deleteWebHook();
    await bot.startPolling();
    console.info('Telegram polling started');
  } catch (error) {
    console.error('Telegram polling could not be started', error);
  }
})();
