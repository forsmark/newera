FROM oven/bun:1
WORKDIR /app

# Install dependencies (layer-cached — only re-runs when package files change)
COPY package.json bun.lock ./
COPY src/client/package.json ./src/client/
COPY src/server/package.json ./src/server/
RUN bun install --frozen-lockfile

# Copy source and build the React client into dist/
COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "src/server/index.ts"]
