#!/bin/bash

# Smoke-check Docker services and their internal connections.
# Requires Docker Compose and an existing .env file.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/Docker"
ENV_FILE="$PROJECT_ROOT/.env"

compose() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    elif command -v docker-compose >/dev/null 2>&1; then
        docker-compose "$@"
    else
        echo "Ошибка: Docker Compose не найден."
        echo "Установите Docker Compose plugin или docker-compose."
        exit 1
    fi
}

if [ ! -f "$ENV_FILE" ]; then
    echo "Ошибка: .env файл не найден."
    echo "Создайте .env из .example.env или запустите: ./scripts/setup-env.sh"
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

cd "$DOCKER_DIR"

echo "=== Сборка и запуск сервисов ==="
compose up -d --build bot parser api mongodb

wait_for_health() {
    local service="$1"
    local container="$2"
    local attempts=60

    echo "Ожидание $service..."
    for _ in $(seq 1 "$attempts"); do
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
        if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
            echo "$service готов ($status)"
            return 0
        fi
        sleep 2
    done

    echo "Сервис $service не стал готовым вовремя."
    compose ps
    compose logs --tail=120 "$service"
    exit 1
}

wait_for_health mongodb patrebna-mongodb
wait_for_health api patrebna-api
wait_for_health bot patrebna-bot
wait_for_health parser patrebna-parser

echo "=== Проверка внутренних подключений ==="
compose exec -T mongodb mongosh --quiet \
    -u "$MONGO_INITDB_ROOT_USERNAME" \
    -p "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.runCommand('ping').ok"

compose exec -T api node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

compose exec -T parser node -e "require('http').get('http://api:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

echo "Smoke-check пройден: сервисы запущены, MongoDB/API доступны, parser видит API."
