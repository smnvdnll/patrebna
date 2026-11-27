import db from 'config/db/databaseServise';
import pLimit from 'p-limit';
import { pause } from 'config/lib/helpers/pause';
import { type IAd, type IExtendedAd, type IParserData } from 'config/types';
import { getBaseNotification } from 'config/lib/helpers/getBaseNotification';
import { getExtendedNotification } from 'config/lib/helpers/getExtendedNotification';
import keyboards from 'bot/keyboards';
import { TelegramService } from 'config/telegram/telegramServise';
import { getSource } from 'sources';
import { listingService } from 'services/listingService';
import { type IListingDoc } from 'config/db/models/Listing';
import {
  ModelDedupe,
  parseSourcePriceRules,
  passesPriceAndKeywordGate,
} from 'parser/notifyGate';

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


/**
 * Links-only mode: no AI scoring, no discovery profiles. Only the price/keyword
 * gate and per-model dedupe decide whether a new listing is sent.
 */
const NOTIFY_DEDUPE_WINDOW_MS =
  Number(process.env.NOTIFY_DEDUPE_WINDOW_MINUTES ?? 720) * 60_000;
const MIN_NOTIFY_PRICE_BYN = Number(process.env.NOTIFY_MIN_PRICE_BYN ?? 0);
const MAX_NOTIFY_PRICE_BYN = Number(process.env.NOTIFY_MAX_PRICE_BYN ?? 0);
/** Per-search-link ceilings, e.g. NOTIFY_SOURCE_MAX_PRICE_BYN=query=ddr4:300 */
const SOURCE_MAX_PRICE_RULES = parseSourcePriceRules(
  process.env.NOTIFY_SOURCE_MAX_PRICE_BYN,
);
const modelDedupe = new ModelDedupe(NOTIFY_DEDUPE_WINDOW_MS);

export async function parseKufar(
  users: Array<IParserData & { userId: number }>,
): Promise<void> {
  // Fan-out stays low: the API serialises upstream calls anyway, and a wide
  // limit just queues 429-bound requests.
  const limit = pLimit(3);
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
          try {
            await pause(200);
            const base = getSource('kufar');
            const listings = await base.fetchListings({ url });

            await db.touchUrlKufar(userId, urlId);
            if (!Array.isArray(listings) || !listings.length) return;

            // Legacy dedup & user tracking (per-user semantics preserved)
            const rawAds = listings.map((l) => l.raw as IAd);
            const newAds = await db.addUniqueAds(userId, rawAds, urlId);
            if (!newAds.length) return;

            const newForNotify = listings.filter((l) =>
              newAds.some((a) => a.id === l.externalId),
            );

            if (!newForNotify.length) return;

            for (const listing of newForNotify) {
              let detailed = listing;
              try {
                detailed = await base.fetchListingDetails(listing);
              } catch (detailErr) {
                console.warn(
                  `Could not fetch details for listing ${listing.externalId}:`,
                  detailErr,
                );
              }

              await pause(300);

              let listingDoc: IListingDoc | null = null;
              try {
                listingDoc = await listingService.upsertListing(detailed);
              } catch (upsertErr) {
                console.error(
                  `Error upserting listing ${detailed.externalId}:`,
                  upsertErr,
                );
              }

              if (!listingDoc) continue;

              const claim = await listingService.claimListingForUser(
                listingDoc._id,
                userId,
              );
              if (!claim) {
                console.debug('already claimed/notified, skip');
                continue;
              }
              const { token } = claim;

              let notifiedSuccess = false;
              try {
                // Links-only mode: no AI scoring, no discovery profiles.
                let gated = true;
                let gateReason = '';
                if (gated) {
                  const priceGate = passesPriceAndKeywordGate(
                    {
                      title: detailed.title,
                      price: detailed.price,
                      currency: detailed.currency,
                    },
                    {
                      minPrice: MIN_NOTIFY_PRICE_BYN,
                      maxPrice: MAX_NOTIFY_PRICE_BYN,
                      sourceUrl: url,
                      sourceRules: SOURCE_MAX_PRICE_RULES,
                    },
                  );
                  if (!priceGate.pass) {
                    gated = false;
                    gateReason = priceGate.reason ?? 'gated';
                  } else if (!modelDedupe.shouldAlert({ title: detailed.title })) {
                    gated = false;
                    gateReason = 'duplicate_model';
                  }
                }
                if (!gated && gateReason) {
                  console.info(
                    `[NotifyGate] suppressed "${detailed.title}" reason=${gateReason} price=${detailed.price ?? '-'}`,
                  );
                }

                if (gated) {
                  const adWithUser = {
                    ...(detailed.raw as IExtendedAd),
                    userId,
                    description: detailed.description || '',
                  };

                  const notification = detailed.description
                    ? await getExtendedNotification(
                        adWithUser as IExtendedAd & {
                          userId: number;
                          description: string;
                        },
                      )
                    : await getBaseNotification(
                        adWithUser as IAd & { userId: number },
                      );

                  const coordinates = hasCoordinates(notification)
                    ? notification.coordinates
                    : undefined;

                  const keyboard = coordinates
                    ? keyboards.ExpendedForMessage(notification.url, coordinates)
                    : keyboards.BaseForMessage(notification.url);

                  const messageId = await TelegramService.sendPhoto(
                    userId,
                    notification.caption,
                    keyboard,
                    notification.image,
                  );

                  if (messageId && listingDoc) {
                    notifiedSuccess = true;
                    try {
                      await listingService.addTelegramMessageRef(
                        listingDoc._id,
                        userId,
                        messageId,
                      );
                    } catch (refErr) {
                      console.error('Error adding telegram message ref:', refErr);
                    }
                    try {
                      await listingService.markNotified(listingDoc._id, userId, token);
                    } catch (markErr) {
                      console.error('Error marking listing notified:', markErr);
                    }
                  }
                }
              } catch (evalOrSendErr) {
                console.error(
                  `Error evaluating/sending listing ${detailed.externalId}:`,
                  evalOrSendErr,
                );
              } finally {
                if (!notifiedSuccess && listingDoc) {
                  try {
                    await listingService.releaseClaim(listingDoc._id, userId, token);
                  } catch (relErr) {
                    console.error('Error releasing claim:', relErr);
                  }
                }
              }
            }
          } catch (taskError) {
            console.error(`Error in parseKufar task for user ${userId}:`, taskError);
          }
        }),
      );
    }
  }

  await Promise.all(tasks);
}
