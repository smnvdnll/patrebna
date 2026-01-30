#!/bin/bash

# Скрипт настройки Patrebna для локальной разработки
# Генерирует сертификаты и создаёт .env файл
# Использование: ./scripts/generate-certs.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_ROOT/certs"
ENV_FILE="$PROJECT_ROOT/.env"

echo "=== Настройка Patrebna ==="
echo ""

# ============================================
# Функция генерации пароля
# ============================================
generate_password() {
    openssl rand -base64 16 | tr -d '/+=' | head -c 20
}

# ============================================
# Функция генерации сертификатов
# ============================================
generate_certificates() {
    echo "[Сертификаты] Генерация..."
    echo ""

    mkdir -p "$CERTS_DIR/mongodb"
    mkdir -p "$CERTS_DIR/redis"

    cd "$CERTS_DIR"

    if [ -f "ca.pem" ]; then
        read -p "Сертификаты уже существуют. Перезаписать? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Пропускаем генерацию сертификатов."
            echo ""
            return
        fi
    fi

    echo "  [1/6] CA сертификат..."
    openssl genrsa -out ca-key.pem 4096 2>/dev/null
    openssl req -new -x509 -days 365 -key ca-key.pem -out ca.pem \
        -subj "/C=BY/ST=Minsk/L=Minsk/O=Patrebna/CN=LocalCA" 2>/dev/null

    echo "  [2/6] MongoDB сертификат..."
    openssl genrsa -out mongodb/mongodb-key.pem 4096 2>/dev/null
    openssl req -new -key mongodb/mongodb-key.pem -out mongodb/mongodb.csr \
        -subj "/C=BY/ST=Minsk/L=Minsk/O=Patrebna/CN=mongodb" 2>/dev/null

    cat > mongodb/mongodb-ext.cnf << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = mongodb
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

    openssl x509 -req -days 365 -in mongodb/mongodb.csr \
        -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
        -out mongodb/mongodb-cert.pem \
        -extfile mongodb/mongodb-ext.cnf 2>/dev/null

    cat mongodb/mongodb-cert.pem mongodb/mongodb-key.pem > mongodb/mongodb.pem
    rm mongodb/mongodb.csr mongodb/mongodb-ext.cnf

    echo "  [3/6] MongoDB keyfile..."
    openssl rand -base64 756 > mongo-keyfile
    chmod 400 mongo-keyfile
    # Установка владельца для Docker (mongodb user = UID 999)
    # На macOS Docker Desktop обрабатывает права автоматически
    if [[ "$(uname)" == "Linux" ]]; then
        sudo chown 999:999 mongo-keyfile
    fi

    echo "  [4/6] Redis сертификат..."
    openssl genrsa -out redis/redis-key.pem 4096 2>/dev/null
    openssl req -new -key redis/redis-key.pem -out redis/redis.csr \
        -subj "/C=BY/ST=Minsk/L=Minsk/O=Patrebna/CN=redis" 2>/dev/null

    cat > redis/redis-ext.cnf << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = redis
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

    openssl x509 -req -days 365 -in redis/redis.csr \
        -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
        -out redis/redis-cert.pem \
        -extfile redis/redis-ext.cnf 2>/dev/null

    rm redis/redis.csr redis/redis-ext.cnf

    echo "  [5/7] Клиентский сертификат..."
    openssl genrsa -out client-key.pem 4096 2>/dev/null
    openssl req -new -key client-key.pem -out client.csr \
        -subj "/C=BY/ST=Minsk/L=Minsk/O=Patrebna/CN=client" 2>/dev/null

    cat > client-ext.cnf << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
EOF

    openssl x509 -req -days 365 -in client.csr \
        -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
        -out client-cert.pem \
        -extfile client-ext.cnf 2>/dev/null

    cat client-cert.pem client-key.pem > client.pem
    rm client.csr client-ext.cnf

    echo "  [6/7] API сертификат..."
    openssl genrsa -out server-key.pem 4096 2>/dev/null
    openssl req -new -key server-key.pem -out server.csr \
        -subj "/C=BY/ST=Minsk/L=Minsk/O=Patrebna/CN=api" 2>/dev/null

    cat > server-ext.cnf << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = api
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

    openssl x509 -req -days 365 -in server.csr \
        -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
        -out server-cert.pem \
        -extfile server-ext.cnf 2>/dev/null

    cat server-cert.pem server-key.pem > server.pem
    rm server.csr server-ext.cnf

    echo "  [7/7] Установка прав..."
    chmod 644 ca.pem ca-key.pem
    chmod 644 mongodb/mongodb.pem mongodb/mongodb-cert.pem mongodb/mongodb-key.pem
    chmod 644 redis/redis-cert.pem redis/redis-key.pem
    chmod 644 client.pem client-cert.pem client-key.pem
    chmod 644 server.pem server-cert.pem server-key.pem
    chmod 400 mongo-keyfile

    rm -f ca.srl

    echo ""
    echo "Сертификаты готовы!"
    echo ""
}

# ============================================
# Функция создания .env файла
# ============================================
create_env_file() {
    echo "[.env] Настройка переменных окружения..."
    echo ""

    if [ -f "$ENV_FILE" ]; then
        read -p ".env уже существует. Перезаписать? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Пропускаем создание .env."
            echo ""
            return
        fi
    fi

    # Автогенерация паролей
    MONGO_USER="admin"
    MONGO_PASS=$(generate_password)
    REDIS_PASS=$(generate_password)

    echo "Пароли сгенерированы автоматически."
    echo ""

    # Telegram - обязательно
    echo "=== Telegram (обязательно) ==="
    while [ -z "$TG_TOKEN" ]; do
        read -p "TELEGRAM_BOT_TOKEN (от @BotFather): " TG_TOKEN
        if [ -z "$TG_TOKEN" ]; then
            echo "  Токен обязателен!"
        fi
    done
    echo ""

    # Telegram Chat ID - опционально
    echo "=== Уведомления администратора (опционально) ==="
    echo "TELEGRAM_CHAT_ID - ID чата куда бот будет отправлять"
    echo "уведомления о новых пользователях. Можно оставить пустым."
    read -p "TELEGRAM_CHAT_ID: " TG_CHAT_ID
    echo ""

    # bePaid - опционально
    echo "=== bePaid платежи (опционально, Enter - пропустить) ==="
    read -p "STORE_ID: " STORE_ID
    read -p "BEPAID_API_KEY: " BEPAID_KEY
    echo ""

    # Запись в файл
    cat > "$ENV_FILE" << EOF
# ============================================
# Patrebna Environment Configuration
# Generated: $(date)
# ============================================

# === MongoDB ===
MONGO_INITDB_ROOT_USERNAME=$MONGO_USER
MONGO_INITDB_ROOT_PASSWORD=$MONGO_PASS

# === Redis ===
REDIS_PASSWORD=$REDIS_PASS

# === Telegram ===
TELEGRAM_BOT_TOKEN=$TG_TOKEN
TELEGRAM_CHAT_ID=$TG_CHAT_ID

# === Server ===
HOST=
WEBHOOK_PORT=8443
USE_TUNNEL=true

# === bePaid (Payment) ===
STORE_ID=$STORE_ID
BEPAID_API_KEY=$BEPAID_KEY
EOF

    echo ".env создан!"
    echo ""
    echo "  MongoDB: $MONGO_USER / $MONGO_PASS"
    echo "  Redis:   $REDIS_PASS"
    echo ""
}

# ============================================
# Главный процесс
# ============================================

generate_certificates
create_env_file

# ============================================
# Итог
# ============================================
echo "==========================================="
echo "Настройка завершена!"
echo "==========================================="
echo ""
echo "Структура:"
echo "  certs/           - сертификаты для MongoDB и Redis"
echo "  .env             - переменные окружения"
echo ""
echo "Запуск:"
echo "  ./scripts/start.sh up"
echo ""
echo "Другие команды:"
echo "  ./scripts/start.sh down       - остановить"
echo "  ./scripts/start.sh logs       - логи"
echo "  ./scripts/start.sh tunnel-url - URL туннеля"
echo ""
