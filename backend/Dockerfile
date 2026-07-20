# A Dockerfile is a recipe: each instruction is one step in building the image.
# Docker runs them top to bottom and caches each step, so re-running a build
# after only changing your source code skips the (slow) dependency install.

# Start from an official Node.js image. "20-slim" = Node 20 (matches CI) on a
# stripped-down Debian base — smaller and faster to pull than the full image.
FROM node:20-slim

# Everything from here on happens inside /app in the container's filesystem.
# This has nothing to do with your Windows folders — it's a fresh Linux box.
WORKDIR /app

# node:20-slim ships with no OpenSSL at all. Prisma's query engine is a native
# binary that needs OpenSSL to run, and without it, `prisma generate` silently
# guesses a version, the app builds "successfully," and then crash-loops the
# moment it actually tries to connect to Postgres — a build-time success that
# hides a runtime failure. Installing openssl here means `prisma generate`
# detects the real version and picks the matching engine binary.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy ONLY the dependency manifests first, not the whole codebase yet.
# This is the key trick for fast rebuilds: Docker caches this layer, so if
# you only change a .ts file (not package.json), the next build skips
# `npm ci` entirely and reuses the cached node_modules from last time.
COPY package.json package-lock.json ./
RUN npm ci

# NOW copy the rest of the source code.
COPY . .

# Prisma needs its query engine generated for this specific OS/architecture
# before the app can talk to the database — this reads prisma/schema.prisma
# and writes generated client code into node_modules/@prisma/client.
RUN npx prisma generate

# Compile TypeScript -> JavaScript (same as your local `npm run build`),
# output goes to dist/, same as it does on your machine.
RUN npm run build

EXPOSE 5000

# The actual command that runs when the container starts.
CMD ["node", "dist/server.js"]
