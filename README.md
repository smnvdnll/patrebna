<p align="center">
      <img src="https://i.ibb.co/G0FKZK1/free-icon-chat-bot-9732765.png" width="150" alt="Patrebna Logo">
</p>
<h1 align="center">PATREBNA</h1>

<p align="center">
   <img src="https://img.shields.io/badge/Typescript-%5E5.5.4-%23007acc" alt="Typescript Version">
   <img src="https://img.shields.io/badge/Node%20telegram%20bot%20api-%5E0.66.0-%230088cc" alt="Node telegram botapi Version">
   <img src="https://img.shields.io/badge/DB-Mongodb-%233fa037" alt="Database">
   <img src="https://img.shields.io/badge/Languages-2-%23ebab00" alt="Languages">
   <img src="https://img.shields.io/badge/Links--only-no_AI-%2300ad64" alt="Links-only, no AI">
   <img src="https://img.shields.io/badge/License-MIT-%23a31f34" alt="License">
</p>

## Обзор / Overview

**Patrebna** — Telegram-бот для мониторинга поисковых ссылок Kufar. Бот
периодически опрашивает добавленные пользователем ссылки, забирает новые
объявления через внутренний API-клиент, применяет фильтр цены/ключевых слов и
дедупликацию по модели, после чего присылает уведомление в Telegram.

**AI-стек удалён полностью** (решение владельца от 16.09.2026): нет LLM,
ско ринга релевантности, discovery-профилей, профилей интересов и обратной связи.
Мониторинг идёт **только через ссылки в боте**. Не включать AI обратно без
явной команды владельца.

---

## Архитектура

```
[ Sources Layer ]      [ Parser ]            [ Bot ]              [ API ]
- MarketSource         - node-schedule loop  - Telegram polling   - Express
- KufarSource/Mapper   - dedup + claim-lease - callback queries   - Kufar scraper
- getSource registry   - price/keyword gate  - link management    - __NEXT_DATA__
                       - TelegramService     - i18n (ru/by)

[ Data Storage ]  MongoDB: Users, Profiles, Parsers, DataParser.urls,
                  Listings, legacy KufarAds
```

- `src/sources/` — абстракция площадки и нормализация объявлений Kufar.
- `src/parser/parseKufar.ts` — опрос ссылок, дедуп, гейт, отправка.
- `src/parser/notifyGate.ts` — правила цены (`NOTIFY_SOURCE_MAX_PRICE_BYN`),
  фильтр ключевых слов и `ModelDedupe`.
- `src/services/listingService.ts` — хранение объявлений, claim-lease,
  привязка к Telegram-сообщениям.
- `src/bot/` — команды, клавиатуры, добавление/удаление ссылок.
- `src/api/` — внутренний HTTP-клиент к Kufar (с общим rate-limit'ом).

---

## Конфигурация

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `TELEGRAM_BOT_TOKEN` | — | Токен бота от @BotFather (обязательно) |
| `TELEGRAM_CHAT_ID` | `""` | Чат для служебных уведомлений |
| `MONGODB_URL` | `mongodb://mongodb:27017/` | Подключение к MongoDB |
| `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` | — | Креды MongoDB |
| `API_BASE_URL` | `http://api:3000/api` | Внутренний API-клиент |
| `KUFAR_MIN_INTERVAL_MS` | `1500` | Минимальный интервал между запросами к Kufar |
| `NOTIFY_DEDUPE_WINDOW_MINUTES` | `720` | Окно подавления дубликатов по модели |
| `NOTIFY_MIN_PRICE_BYN` / `NOTIFY_MAX_PRICE_BYN` | `0` | Глобальные границы цены (0 = выкл.) |
| `NOTIFY_SOURCE_MAX_PRICE_BYN` | — | Потолки цены по ссылкам: `query=rtx+3050:500,query=cmp+40hx:350`. **Первое совпадение по URL выигрывает** — специфичные правила идут перед общими |

`.env` в git не входит (в `.gitignore`); канонический файл живёт только на CT 114.

---

## Быстрый старт

```bash
./scripts/setup-env.sh        # создаёт .env
./scripts/start.sh up-build   # сборка и запуск (docker compose)
./scripts/start.sh logs
```

Команда `/status` показывает количество объявлений, уведомлений за сегодня и
активные ссылки пользователя.

## Тестирование

```bash
npm test              # vitest
npx tsc --noEmit      # проверка типов
```

## Лицензия

MIT.
