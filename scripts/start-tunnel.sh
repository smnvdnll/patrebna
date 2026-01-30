#!/bin/sh

# Скрипт запуска cloudflared туннеля с автоматической установкой webhook
# Использование: запускается как entrypoint в Docker контейнере

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
LOCAL_URL="${TUNNEL_TARGET_URL:-http://bot:8443}"

if [ -z "$BOT_TOKEN" ]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN не установлен"
  exit 1
fi

echo "=== Cloudflared Quick Tunnel ==="
echo "Target: $LOCAL_URL"
echo ""

# Функция установки webhook с ретраями
set_webhook() {
  TUNNEL_URL="$1"
  WEBHOOK_URL="${TUNNEL_URL}/bot${BOT_TOKEN}"
  MAX_RETRIES=10
  RETRY=0

  while [ $RETRY -lt $MAX_RETRIES ]; do
    RETRY=$((RETRY + 1))

    # Ждём перед попыткой (DNS пропагация)
    if [ $RETRY -eq 1 ]; then
      echo "Ожидание DNS пропагации (30 сек)..."
      sleep 30
    else
      echo "Повторная попытка через 15 сек... ($RETRY/$MAX_RETRIES)"
      sleep 15
    fi

    echo "Устанавливаем webhook..."
    RESPONSE=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}")

    if echo "$RESPONSE" | grep -q '"ok":true'; then
      echo "==========================================="
      echo "Webhook успешно установлен!"
      echo "URL: $WEBHOOK_URL"
      echo "==========================================="
      return 0
    else
      echo "Попытка $RETRY не удалась: $(echo "$RESPONSE" | grep -o '"description":"[^"]*"' | head -1)"
    fi
  done

  echo "==========================================="
  echo "ОШИБКА: Не удалось установить webhook после $MAX_RETRIES попыток"
  echo "Последний ответ: $RESPONSE"
  echo "==========================================="
  return 1
}

# Запускаем cloudflared и читаем вывод
cloudflared tunnel --no-autoupdate --url "$LOCAL_URL" 2>&1 | while read line; do
  echo "$line"

  # Ищем URL туннеля в выводе
  TUNNEL_URL=$(echo "$line" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | head -1)

  if [ -n "$TUNNEL_URL" ]; then
    echo ""
    echo "==========================================="
    echo "Tunnel URL: $TUNNEL_URL"
    echo "==========================================="
    echo ""

    # Запускаем установку webhook в фоне
    set_webhook "$TUNNEL_URL" &
  fi
done
