import express from 'express';
import apiRouter from 'api/routes/api.routes';
import 'dotenv/config';
import 'config/i18n/i18n';
import db from 'config/db/databaseServise';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use('/api', apiRouter);

app.listen(PORT, () => {
  db.openConnection().then(() => {
    console.log(`Сервер запущен на порту ${PORT}.`);
  });
});
