# syntax=docker/dockerfile:1

FROM oven/bun:1.2 AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json bun.lock bunfig.toml ./
RUN mkdir -p /tmp/bun-install \
  && TMPDIR=/tmp/bun-install bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3002

CMD ["bun", "run", "src/server.ts"]
