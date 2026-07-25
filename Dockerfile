FROM python:3.12-slim

WORKDIR /app

COPY web/requirements.txt /app/web/requirements.txt
RUN pip install --no-cache-dir -r /app/web/requirements.txt

COPY web/ /app/web/
COPY entry/ /app/entry/

# Seed survives empty persistent volume mount at /app/web/data
RUN cp -a /app/web/data /app/web/data-seed \
 && printf '%s\n' '#!/bin/sh' \
      'set -e' \
      'mkdir -p /app/web/data/images /app/web/data/issues' \
      '# Seed issues / votes only when volume is empty' \
      'if [ -z "$(ls -A /app/web/data/issues 2>/dev/null)" ] && [ -d /app/web/data-seed/issues ]; then' \
      '  cp -a /app/web/data-seed/issues/. /app/web/data/issues/' \
      'fi' \
      'if [ ! -f /app/web/data/votes.json ] && [ -f /app/web/data-seed/votes.json ]; then' \
      '  cp /app/web/data-seed/votes.json /app/web/data/votes.json' \
      'fi' \
      '# Always fill missing manga files from image seed (safe for already-seeded volumes)' \
      'if [ -d /app/web/data-seed/images ]; then' \
      '  cp -an /app/web/data-seed/images/. /app/web/data/images/ 2>/dev/null || true' \
      'fi' \
      'exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}' \
      > /app/web/entrypoint.sh \
 && chmod +x /app/web/entrypoint.sh

WORKDIR /app/web
ENV PORT=8080
EXPOSE 8080

CMD ["/app/web/entrypoint.sh"]
