import express from 'express';
import apiRouter from 'api/routes/api.routes';
import 'dotenv/config';
import 'config/i18n/i18n';

const app = express();
const PORT = 3000;

app.use(express.json());
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.use('/api', apiRouter);

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}.`);
});
