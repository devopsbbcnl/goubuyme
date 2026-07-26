# Local development only — production deploys to Netlify (see netlify.toml),
# this image is not what runs in production.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# .env.local is deliberately NOT in .dockerignore: Next.js bakes every
# NEXT_PUBLIC_* value into the client bundle at `next build` time, not at
# container start — see gobuyme-web/Dockerfile for the longer version of
# why that distinction matters here.
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
