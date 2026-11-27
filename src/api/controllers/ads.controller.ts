import axios, { AxiosError } from 'axios';
import { type Request, type Response } from 'express';
import { transformRawAds } from 'sources/kufar/KufarMapper';
import { type RawAd } from 'sources/kufar/types';
import { extractNextDataField } from 'config/lib/helpers/extractNextDataField';
import { normalizeKufarUrl } from 'config/lib/helpers/normalizeKufarUrl';
import { kufarFetchSlot } from 'config/lib/kufarFetchGate';
import axiosRetry from 'axios-retry';

axiosRetry(axios, {
  retries: 2,
  retryDelay: (retryCount, error) => {
    console.warn(`Попытка #${retryCount} для ${error?.config?.url}`);
    return retryCount * 4000;
  },
  retryCondition: (error) => {
    const status = error?.response?.status;
    // 429/400 are upstream verdicts, not transient transport failures.
    if (status === 429 || status === 400) return false;
    return axiosRetry.isNetworkOrIdempotentRequestError(error);
  },
});



export async function parseAdsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rawUrl = decodeURIComponent(req.query.url as string);

    if (!rawUrl) {
      res.status(400).json({ error: 'Отсутствует параметр URL' });
      return;
    }

    const url = normalizeKufarUrl(rawUrl);

    await kufarFetchSlot();
    const { data } = await axios.get<string>(url, { timeout: 15000 });

    const ads: RawAd[] | null = extractNextDataField(
      data,
      'props.initialState.listing.ads',
    );

    if (!ads) {
      res.status(204).send();
      return;
    }

    const transformed = transformRawAds(ads);
    res.json(transformed);
  } catch (error) {
    if (error instanceof AxiosError) {
      const { response, message, config } = error;
      res.status(response?.status ?? 400).json({
        error: message,
        details: config?.url,
      });
      console.error(`(${response?.status}) ${message} - ${config?.url}`);
    } else {
      res.status(500).json({
        error: 'Внутренняя ошибка сервера',
        details: String(error),
      });
      console.error('Unexpected error', error);
    }
  }
}
