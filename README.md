<p align="center">
      <img src="https://i.ibb.co/G0FKZK1/free-icon-chat-bot-9732765.png" width="150">
</p>
<h1 align="center">PATREBNA</h1>

<p align="center">
   <img src="https://img.shields.io/badge/Typescript-%5E5.5.4-%23007acc" alt="Typescript Version">
   <img src="https://img.shields.io/badge/Node%20telegram%20bot%20api-%5E0.66.0-%230088cc" alt="Node telegram botapi Version">
  <img src="https://img.shields.io/badge/DB-Mongodb-%233fa037" alt="Database">
  <img src="https://img.shields.io/badge/Cache-Redis-%23a41e11" alt="Cache">
   <img src="https://img.shields.io/badge/Languages-2-%23ebab00" alt="Languages">
   <img src="https://img.shields.io/badge/Payment-bePaid-%23ff8e09" alt="Payment">
   <img src="https://img.shields.io/badge/Version-v4.0.2-%2300ad64" alt="App Version">
   <img src="https://img.shields.io/badge/License-MIT-%23a31f34" alt="License">
</p>

## Что умеет этот бот?

**Patrebna bot** - бот парсер, который отслеживает и оповещает о появлении новых объявлений на площадке **Kufar**.
Сообщения приходят в личную переписку с ботом.

## Быстрый старт

### Требования

- Docker и Docker Compose
- Telegram Bot Token (получить у [@BotFather](https://t.me/BotFather))

### Установка

**1. Клонируйте репозиторий**

```bash
git clone https://github.com/evgeniy-kolmak/patrebna.git
cd patrebna
```

**2. Запустите скрипт настройки**

```bash
./scripts/generate-certs.sh
```

Скрипт автоматически:
- Сгенерирует SSL сертификаты для MongoDB и Redis
- Создаст `.env` файл с безопасными паролями
- Запросит только необходимые данные (Telegram Bot Token)

**3. Запустите проект**

```bash
./scripts/start.sh
```

Откроется интерактивное меню управления:

```
╔════════════════════════════════╗
║       PATREBNA управление       ║
╚════════════════════════════════╝

  1) Запустить
  2) Остановить
  3) Логи
  4) Статус
  5) Перезапустить
  6) URL туннеля
  0) Выход
```

Готово! Выберите пункт 1 для запуска.

### Управление

**Интерактивный режим** (рекомендуется):
```bash
./scripts/start.sh
```

**Командный режим** (для автоматизации):
```bash
./scripts/start.sh up          # Запустить
./scripts/start.sh down        # Остановить
./scripts/start.sh restart     # Перезапустить
./scripts/start.sh logs        # Логи (интерактивный выбор сервиса)
./scripts/start.sh status      # Статус контейнеров
./scripts/start.sh tunnel-url  # Получить URL туннеля
```

## Режимы работы

### Cloudflare Tunnel

По умолчанию проект настроен для локальной разработки с использованием Cloudflare Tunnel. Это позволяет получить публичный HTTPS URL без настройки домена и сертификатов.

В `.env`:
```
USE_TUNNEL=true
```

При запуске автоматически:
- Создаётся туннель через Cloudflare
- Генерируется публичный URL (например: `https://random-words.trycloudflare.com`)
- Устанавливается webhook в Telegram

### Режим Свой домен

Для работы на сервере с собственным доменом:

В `.env`:
```
USE_TUNNEL=false
HOST=https://yourdomain.com
```

Требуется:
- Публичный домен с SSL сертификатом
- Открытый порт 8443
- Сертификаты для бота в `certs/bot/`

## Архитектура

Проект состоит из нескольких сервисов:

| Сервис | Описание |
|--------|----------|
| **bot** | Telegram бот - обрабатывает команды и отправляет уведомления |
| **parser** | Парсер - периодически проверяет Kufar на новые объявления |
| **api** | API сервер - обрабатывает платежи bePaid |
| **mongodb** | База данных |
| **redis** | Кэш и очереди сообщений |
| **cloudflared** | Туннель для разработки (опционально) |

## Конфигурация

### Переменные окружения

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Да | Токен бота от @BotFather |
| `TELEGRAM_CHAT_ID` | Нет | ID чата для уведомлений администратора |
| `USE_TUNNEL` | Нет | `true` - использовать Cloudflare Tunnel |
| `HOST` | Нет* | Домен для webhook (если `USE_TUNNEL=false`) |
| `WEBHOOK_PORT` | Нет | Порт webhook (по умолчанию: 8443) |
| `STORE_ID` | Нет | ID магазина bePaid |
| `BEPAID_API_KEY` | Нет | API ключ bePaid |

*Обязательно если `USE_TUNNEL=false`

### Структура проекта

```
patrebna/
├── src/
│   ├── bot/           # Telegram бот
│   ├── parser/        # Парсер Kufar
│   ├── api/           # API сервер
│   └── config/        # Конфигурация (DB, Redis, i18n)
├── scripts/
│   ├── generate-certs.sh   # Настройка проекта
│   ├── start.sh            # Управление Docker
│   └── start-tunnel.sh     # Скрипт туннеля
├── Docker/
│   └── docker-compose.yml
├── certs/             # SSL сертификаты (генерируются)
└── .env               # Переменные окружения (генерируется)
```

## Интерактив с ботом

Чтобы начать, достаточно запустить бота `/start` и добавить ссылку для отслеживания (с выбранной категорией и настроенными фильтрами товаров) - https://kufar.by/l/город/товар/.

<img src="https://i.ibb.co/CB0xznz/IMG-2389.webp" alt="Пример использования">

#### Какую информацию парсит бот

- Главное фото
- Заголовок
- Описание (если есть)
- Цена
- Ссылка на объявление

*Параметры могут варьироваться в зависимости от категории объявлений (Недвижимость, Авто или Другое).*

<img src="https://i.ibb.co/T00jMgr/IMG-9240.webp" width="400" alt="Пример сообщения">

## Дополнительная информация

- Бот мультиязычный и поддерживает два языка (русский и белорусский)
- К боту можно подключить оплату подписки через bePaid
- По умолчанию проверка новых объявлений выполняется раз в 30 минут, в подписке - раз в 5 минут
- В базовой версии можно добавить только одну ссылку для отслеживания, в премиум версии - 3 ссылки

## Решение проблем

### MongoDB не запускается

Убедитесь что сертификаты сгенерированы:
```bash
ls -la certs/
```

Если папка пуста - запустите `./scripts/generate-certs.sh`

### Бот не отвечает

Проверьте логи:
```bash
./scripts/start.sh
# Выберите пункт 3 (Логи) → 2 (bot)
```

Или напрямую:
```bash
docker-compose logs -f bot
```

### Туннель не работает

Проверьте логи cloudflared:
```bash
./scripts/start.sh
# Выберите пункт 3 (Логи) → 6 (cloudflared)
```

Убедитесь что `USE_TUNNEL=true` в `.env`

## Разработчик

- [Евгений Колмак](https://github.com/evgeniy-kolmak)

## Лицензия

Проект **Patrebna** распространяется по лицензии MIT.
