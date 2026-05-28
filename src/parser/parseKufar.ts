import { api } from 'services/apiClient';
import db from 'config/db/databaseServise';
import pLimit from 'p-limit';
import { pause } from 'config/lib/helpers/pause';
import { type IAd, type IExtendedAd, type IParserData } from 'config/types';
import { getBaseNotification } from 'config/lib/helpers/getBaseNotification';
import { getExtendedNotification } from 'config/lib/helpers/getExtendedNotification';
import keyboards from 'bot/keyboards';
import { TelegramService } from 'config/telegram/telegramServise';

function isDue(
  lastCheckedAt: Date | undefined,
  intervalMinutes: number,
): boolean {
  if (!lastCheckedAt) return true;
  return (
    Date.now() - new Date(lastCheckedAt).getTime() >= intervalMinutes * 60_000
  );
}

function hasCoordinates(
  notification:
    | Awaited<ReturnType<typeof getExtendedNotification>>
    | Awaited<ReturnType<typeof getBaseNotification>>,
): notification is Awaited<ReturnType<typeof getExtendedNotification>> {
  return 'coordinates' in notification;
}

export async function parseKufar(
  users: Array<IParserData & { userId: number }>,
): Promise<void> {
  const limit = pLimit(10);
  const tasks = [];

  for (const user of users) {
    const { urls, userId } = user;
    if (!urls) continue;
    for (const { url, urlId, intervalMinutes, lastCheckedAt } of urls.filter(
      ({ isActive }) => isActive,
    )) {
      if (!isDue(lastCheckedAt, intervalMinutes)) continue;

      tasks.push(
        limit(async () => {
          await pause(200);
          const encodedUrl = encodeURIComponent(url);
          const { data } = await api.get<IExtendedAd[]>(`ads?url=${encodedUrl}`);

          await db.touchUrlKufar(userId, urlId);
          if (!Array.isArray(data) || !data.length) return;
          const newAds = await db.addUniqueAds(userId, data, urlId);

          if (!newAds.length) return;
          for (const ad of newAds as Array<
            IExtendedAd & { description?: string }
          >) {
            const adWithUser = { ...ad, userId };
            const { data: description } = await api.get<string>('ad', {
              params: { ad_id: ad.id },
            });
            adWithUser.description = description;
            await pause(300);

            const notification = adWithUser.description
              ? await getExtendedNotification(
                  adWithUser as IExtendedAd & {
                    userId: number;
                    description: string;
                  },
                )
              : await getBaseNotification(
                  adWithUser as IAd & { userId: number },
                );

            await TelegramService.sendPhoto(
              userId,
              notification.caption,
              hasCoordinates(notification)
                ? keyboards.ExpendedForMessage(
                    notification.url,
                    notification.coordinates,
                  )
                : keyboards.BaseForMessage(notification.url),
              notification.image,
            );
          }
        }),
      );
    }
  }

  await Promise.all(tasks);
}
