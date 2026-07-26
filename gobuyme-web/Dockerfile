# Local development only — production deploys to Netlify (see netlify.toml),
# this image is not what runs in production.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Unlike the backend's .dockerignore, .env.local is deliberately NOT excluded
# here: Next.js reads it during `next build` and bakes every NEXT_PUBLIC_*
# value straight into the client-side JS bundle at build time. If it were
# excluded, the app would build "successfully" but ship with those values
# silently blank in the browser — a build-time success hiding a runtime bug,
# the same trap the backend's missing-OpenSSL issue was.
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
