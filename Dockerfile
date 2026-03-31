# syntax=docker/dockerfile:1
# Build: docker build -t equilibrium-trades \
#   --build-arg VITE_BUILDER_ADDRESS=0xYourBuilderWallet \
#   --build-arg VITE_HL_REFERRAL_CODE=YOURCODE \
#   --build-arg VITE_SENTRY_DSN=https://...@....ingest.sentry.io/... \
#   .
# Run:  docker run -p 5000:5000 -e DATABASE_URL=... -e PUBLIC_APP_URL=https://www.yourdomain.com ... equilibrium-trades
#
# Debian slim (glibc) avoids Alpine/musl issues with some native npm deps and matches typical Linux CI.

FROM node:20-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .

ARG VITE_BUILDER_ADDRESS="0xad9be64fd7a35d99a138b87cb212baefbcdcf045"
ARG VITE_HL_REFERRAL_CODE=""
ARG VITE_STRIPE_PAYMENT_LINK_PRO=""
ARG VITE_STRIPE_PAYMENT_LINK_MENTORING=""
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=""
ENV VITE_BUILDER_ADDRESS=$VITE_BUILDER_ADDRESS
ENV VITE_HL_REFERRAL_CODE=$VITE_HL_REFERRAL_CODE
ENV VITE_STRIPE_PAYMENT_LINK_PRO=$VITE_STRIPE_PAYMENT_LINK_PRO
ENV VITE_STRIPE_PAYMENT_LINK_MENTORING=$VITE_STRIPE_PAYMENT_LINK_MENTORING
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE

RUN npm run build

FROM node:20-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
