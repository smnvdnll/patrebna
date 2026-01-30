#!/bin/bash

# Скрипт запуска Patrebna
# Интерактивное меню для управления сервисами

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/Docker"
ENV_FILE="$PROJECT_ROOT/.env"

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Загружаем переменные из .env
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    else
        echo "Ошибка: .env файл не найден!"
        echo "Запустите: ./scripts/generate-certs.sh"
        exit 1
    fi
}

# Определяем какие сервисы запускать
get_services() {
    # api всегда нужен для /ads endpoint (используется bot'ом)
    SERVICES="bot parser mongodb redis api"
    echo "$SERVICES"
}

# Инициализация MongoDB Replica Set
init_mongodb_replica() {
    echo "Проверка MongoDB Replica Set... (занимает около минуты)"

    # Ждём пока MongoDB станет доступен
    for i in $(seq 1 30); do
        if docker exec patrebna-mongodb mongosh --tls \
            --tlsCertificateKeyFile /etc/ssl/mongodb.pem \
            --tlsCAFile /etc/ssl/ca.pem \
            -u "$MONGO_INITDB_ROOT_USERNAME" \
            -p "$MONGO_INITDB_ROOT_PASSWORD" \
            --authenticationDatabase admin \
            --eval "db.runCommand('ping')" >/dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    # Проверяем статус replica set - ищем PRIMARY
    RS_STATUS=$(docker exec patrebna-mongodb mongosh --tls \
        --tlsCertificateKeyFile /etc/ssl/mongodb.pem \
        --tlsCAFile /etc/ssl/ca.pem \
        -u "$MONGO_INITDB_ROOT_USERNAME" \
        -p "$MONGO_INITDB_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --eval "try { var s = rs.status(); if(s.members && s.members.some(m => m.stateStr === 'PRIMARY')) { print('has_primary'); } else { print('no_primary'); } } catch(e) { print('not_initialized'); }" --quiet 2>/dev/null)

    if echo "$RS_STATUS" | grep -q "has_primary"; then
        echo "Replica Set готов (PRIMARY найден)"
    elif echo "$RS_STATUS" | grep -q "no_primary"; then
        echo "Replica Set без PRIMARY, реконфигурация..."
        docker exec patrebna-mongodb mongosh --tls \
            --tlsCertificateKeyFile /etc/ssl/mongodb.pem \
            --tlsCAFile /etc/ssl/ca.pem \
            -u "$MONGO_INITDB_ROOT_USERNAME" \
            -p "$MONGO_INITDB_ROOT_PASSWORD" \
            --authenticationDatabase admin \
            --eval "rs.reconfig({_id: 'rs0', members: [{_id: 0, host: 'mongodb:27017'}]}, {force: true})" --quiet
        echo "Replica Set реконфигурирован"
    else
        echo "Инициализация Replica Set..."
        docker exec patrebna-mongodb mongosh --tls \
            --tlsCertificateKeyFile /etc/ssl/mongodb.pem \
            --tlsCAFile /etc/ssl/ca.pem \
            -u "$MONGO_INITDB_ROOT_USERNAME" \
            -p "$MONGO_INITDB_ROOT_PASSWORD" \
            --authenticationDatabase admin \
            --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongodb:27017'}]})" --quiet
        echo "Replica Set инициализирован"
    fi
}

# Функции управления
do_up() {
    SERVICES=$(get_services)
    if [ "$USE_TUNNEL" = "true" ]; then
        echo -e "${GREEN}=== Запуск с Cloudflare Tunnel ===${NC}"
        docker-compose --profile tunnel up -d $SERVICES cloudflared
    else
        echo -e "${GREEN}=== Запуск без туннеля ===${NC}"
        echo "HOST: $HOST"
        docker-compose up -d $SERVICES
    fi

    # Инициализация MongoDB Replica Set
    init_mongodb_replica

    # Показываем URL туннеля если используется
    if [ "$USE_TUNNEL" = "true" ]; then
        echo ""
        echo "Ожидание URL туннеля..."
        sleep 3
        docker logs patrebna-cloudflared 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || echo "URL появится в логах (выберите пункт 7)"
    fi

    echo -e "${GREEN}Все сервисы запущены${NC}"
}

do_down() {
    echo -e "${YELLOW}=== Остановка всех сервисов ===${NC}"
    docker-compose --profile tunnel down
}

do_restart() {
    echo -e "${YELLOW}=== Перезапуск ===${NC}"
    do_down
    do_up
}

do_up_build() {
    SERVICES=$(get_services)

    # Останавливаем контейнеры и удаляем данные перед пересборкой
    echo -e "${YELLOW}Остановка контейнеров...${NC}"
    docker-compose --profile tunnel down 2>/dev/null || true
    echo -e "${YELLOW}Удаление Docker/data...${NC}"
    rm -rf "$DOCKER_DIR/data"
    mkdir -p "$DOCKER_DIR/data/db"
    # MongoDB runs as UID 999 inside container
    # On macOS, Docker Desktop handles permissions automatically
    if [[ "$(uname)" == "Linux" ]]; then
        chown -R 999:999 "$DOCKER_DIR/data/db"
        chmod -R 755 "$DOCKER_DIR/data/db"
    fi

    if [ "$USE_TUNNEL" = "true" ]; then
        echo -e "${GREEN}=== Запуск с пересборкой (Cloudflare Tunnel) ===${NC}"
        docker-compose --profile tunnel up -d --build $SERVICES cloudflared
    else
        echo -e "${GREEN}=== Запуск с пересборкой ===${NC}"
        echo "HOST: $HOST"
        docker-compose up -d --build $SERVICES
    fi

    # Инициализация MongoDB Replica Set
    init_mongodb_replica

    # Показываем URL туннеля если используется
    if [ "$USE_TUNNEL" = "true" ]; then
        echo ""
        echo "Ожидание URL туннеля..."
        sleep 3
        docker logs patrebna-cloudflared 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || echo "URL появится в логах (выберите пункт 7)"
    fi

    echo -e "${GREEN}Все сервисы пересобраны и запущены${NC}"
}

do_logs() {
    echo ""
    echo "Выберите сервис:"
    echo "  1) Все сервисы"
    echo "  2) bot"
    echo "  3) parser"
    echo "  4) mongodb"
    echo "  5) redis"
    echo "  6) cloudflared"
    echo "  7) api"
    echo ""
    read -p "Выбор [1-7]: " log_choice

    case $log_choice in
        1) docker-compose --profile tunnel logs -f ;;
        2) docker-compose logs -f bot ;;
        3) docker-compose logs -f parser ;;
        4) docker-compose logs -f mongodb ;;
        5) docker-compose logs -f redis ;;
        6) docker-compose --profile tunnel logs -f cloudflared ;;
        7) docker-compose logs -f api ;;
        *) echo "Неверный выбор" ;;
    esac
}

do_status() {
    echo -e "${BLUE}=== Статус контейнеров ===${NC}"
    docker-compose --profile tunnel ps
}

do_tunnel_url() {
    echo -e "${BLUE}=== URL туннеля ===${NC}"
    URL=$(docker logs patrebna-cloudflared 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
    if [ -n "$URL" ]; then
        echo "$URL"
    else
        echo "Туннель не запущен или URL ещё не получен"
    fi
}

# Показать меню
show_menu() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}       ${GREEN}PATREBNA${NC} управление       ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════╝${NC}"
    echo ""
    echo "  1) Запустить"
    echo "  2) Запустить с пересборкой"
    echo "  3) Остановить"
    echo "  4) Логи"
    echo "  5) Статус"
    echo "  6) Перезапустить"
    echo "  7) URL туннеля"
    echo "  0) Выход"
    echo ""
}

# Главный процесс
main() {
    load_env
    cd "$DOCKER_DIR"

    # Если передан аргумент - выполнить команду напрямую
    if [ -n "$1" ]; then
        case "$1" in
            up) do_up ;;
            build|up-build) do_up_build ;;
            down) do_down ;;
            restart) do_restart ;;
            logs) do_logs ;;
            status) do_status ;;
            tunnel-url) do_tunnel_url ;;
            *) echo "Неизвестная команда: $1" ;;
        esac
        exit 0
    fi

    # Интерактивный режим
    while true; do
        show_menu
        read -p "Выбор [0-7]: " choice
        echo ""

        case $choice in
            1) do_up ;;
            2) do_up_build ;;
            3) do_down ;;
            4) do_logs ;;
            5) do_status ;;
            6) do_restart ;;
            7) do_tunnel_url ;;
            0) echo "Выход"; exit 0 ;;
            *) echo "Неверный выбор" ;;
        esac

        echo ""
        read -p "Нажмите Enter для продолжения..."
    done
}

main "$@"
