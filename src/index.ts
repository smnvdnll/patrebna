import 'dotenv/config';
import 'config/i18n/i18n';
import db from 'config/db/databaseServise';
import { scheduleJob } from 'node-schedule';
import { getUserIds } from 'config/lib/helpers/getUserIds';
import { getUser } from 'config/lib/helpers/getUser';
import { parseKufar } from 'parser/parseKufar';

void (async () => {
  await db.openConnection();

  scheduleJob('* * * * *', async () => {
    try {
      await db.clearExpiredAdReferences();
      const userIds = await getUserIds();
      const users = await Promise.all(
        userIds.map(async (userId) => ({ userId, ...(await getUser(userId)) })),
      );
      await parseKufar(users);
    } catch (error) {
      console.error('Ошибка при плановой проверке Kufar:', error);
    }
  });
})();
