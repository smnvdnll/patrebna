#!/bin/bash

# Скрипт настройки Patrebna для локального Docker-запуска.
# Создает .env без генерации сертификатов.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

echo "=== Настройка Patrebna ==="
echo ""

generate_password() {
    openssl rand -base64 16 | tr -d '/+=' | head -c 20
}

if [ -f "$ENV_FILE" ]; then
    read -p ".env уже существует. Перезаписать? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Пропускаем создание .env."
        exit 0
    fi
fi

MONGO_USER="admin"
MONGO_PASS=$(generate_password)

echo "Пароль MongoDB сгенерирован автоматически."
echo ""

echo "=== Telegram (обязательно) ==="
while [ -z "$TG_TOKEN" ]; do
    read -p "TELEGRAM_BOT_TOKEN (от @BotFather): " TG_TOKEN
    if [ -z "$TG_TOKEN" ]; then
        echo "  Токен обязателен!"
    fi
done
echo ""

echo "=== Уведомления администратора (опционально) ==="
echo "TELEGRAM_CHAT_ID - ID чата куда бот будет отправлять уведомления."
read -p "TELEGRAM_CHAT_ID: " TG_CHAT_ID
echo ""

cat > "$ENV_FILE" << EOF
# ============================================
# Patrebna Environment Configuration
# Generated: $(date)
# ============================================

# === MongoDB ===
MONGO_INITDB_ROOT_USERNAME=$MONGO_USER
MONGO_INITDB_ROOT_PASSWORD=$MONGO_PASS

# === Telegram ===
TELEGRAM_BOT_TOKEN=$TG_TOKEN
TELEGRAM_CHAT_ID=$TG_CHAT_ID
EOF

echo ".env создан."
echo ""
echo "  MongoDB: $MONGO_USER / $MONGO_PASS"
