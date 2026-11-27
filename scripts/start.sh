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

# Загружаем переменные из .env
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    else
        echo "Ошибка: .env файл не найден!"
        echo "Создайте .env из .example.env или запустите: ./scripts/setup-env.sh"
        exit 1
    fi
}

# Определяем какие сервисы запускать
get_services() {
    # api всегда нужен для /ads endpoint (используется bot'ом)
    SERVICES="bot parser mongodb api"
    echo "$SERVICES"
}

# Функции управления
do_up() {
    SERVICES=$(get_services)
    echo -e "${GREEN}=== Запуск сервисов ===${NC}"
    compose up -d $SERVICES

    echo -e "${GREEN}Все сервисы запущены${NC}"
}

do_down() {
    echo -e "${YELLOW}=== Остановка всех сервисов ===${NC}"
    compose down
}

do_restart() {
    echo -e "${YELLOW}=== Перезапуск ===${NC}"
    do_down
    do_up
}

do_up_build() {
    SERVICES=$(get_services)

    # Останавливаем контейнеры перед пересборкой
    echo -e "${YELLOW}Остановка контейнеров...${NC}"
    compose down 2>/dev/null || true
    echo "Данные MongoDB (пользователи, профили, ссылки) хранятся в volume kufar-mongodb-data и сохраняются при пересборке."

    echo -e "${GREEN}=== Запуск с пересборкой ===${NC}"
    compose up -d --build $SERVICES

    echo -e "${GREEN}Все сервисы пересобраны и запущены${NC}"
}

do_logs() {
    echo ""
    echo "Выберите сервис:"
    echo "  1) Все сервисы"
    echo "  2) bot"
    echo "  3) parser"
    echo "  4) mongodb"
    echo "  5) api"
    echo ""
    read -p "Выбор [1-5]: " log_choice

    case $log_choice in
        1) compose logs -f ;;
        2) compose logs -f bot ;;
        3) compose logs -f parser ;;
        4) compose logs -f mongodb ;;
        5) compose logs -f api ;;
        *) echo "Неверный выбор" ;;
    esac
}

do_status() {
    echo -e "${BLUE}=== Статус контейнеров ===${NC}"
    compose ps
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
            *) echo "Неизвестная команда: $1" ;;
        esac
        exit 0
    fi

    # Интерактивный режим
    while true; do
        show_menu
        read -p "Выбор [0-6]: " choice
        echo ""

        case $choice in
            1) do_up ;;
            2) do_up_build ;;
            3) do_down ;;
            4) do_logs ;;
            5) do_status ;;
            6) do_restart ;;
            0) echo "Выход"; exit 0 ;;
            *) echo "Неверный выбор" ;;
        esac

        echo ""
        read -p "Нажмите Enter для продолжения..."
    done
}

main "$@"
