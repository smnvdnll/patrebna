import db from 'config/db/databaseServise';
import { getUserLanguage } from 'config/lib/helpers/cacheLanguage';
import { editMessage } from 'config/lib/helpers/editMessage';
import { getObserveButton } from 'config/lib/helpers/getObserveButton';
import { type IButton, Button } from 'config/types';
import i18next, { t } from 'i18next';

export async function handleObserveKufar(
  chatId: number,
  messageId: number | undefined,
  callbackQueryId: string,
): Promise<void> {
  await i18next.changeLanguage(await getUserLanguage(chatId));
  const dataParser = await db.getDataParser(chatId);
  const quantityUrls = dataParser?.urls.length ?? 0;

  const inlineKeyboard: IButton[][] = [getObserveButton()];
  const message = t('Текст для Kufar');

  const addButtonType = quantityUrls === 0 ? Button.ADD : Button.ADD_MORE;
  inlineKeyboard.unshift(
    getObserveButton(addButtonType, quantityUrls + 1),
  );

  if (quantityUrls > 0) {
    const wrapButtons: IButton[][] = [];
    const sortedUrls = [...dataParser!.urls].sort((a, b) => a.urlId - b.urlId);

    for (let i = 0; i < quantityUrls; i++) {
      wrapButtons.push(getObserveButton(Button.WRAP, sortedUrls[i].urlId));
    }

    inlineKeyboard.unshift(...wrapButtons);
  }

  await editMessage(chatId, messageId, message, callbackQueryId, {
    inline_keyboard: inlineKeyboard,
  });
}
