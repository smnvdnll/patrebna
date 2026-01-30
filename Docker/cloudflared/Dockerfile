FROM alpine:latest

RUN apk add --no-cache curl

# Download cloudflared binary
RUN curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared

ENTRYPOINT ["/bin/sh"]
