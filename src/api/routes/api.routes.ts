import { Router } from 'express';
import { parseAdHandler } from 'api/controllers/ad.controller';
import { parseAdsHandler } from 'api/controllers/ads.controller';

const router = Router();

router.get('/ad', parseAdHandler);
router.get('/ads', parseAdsHandler);

export default router;
