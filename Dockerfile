# syntax=docker/dockerfile:1
# Build: docker build -t equilibrium-trades \
#   --build-arg VITE_BUILDER_ADDRESS=0xYourBuilderWallet \
#   --build-arg VITE_HL_REFERRAL_CODE=YOURCODE \
#   .
# Run:  docker run -p 5000:5000 -e DATABASE_URL=... -e PUBLIC_APP_URL=https://www.yourdomain.com ... equilibrium-trades

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_BUILDER_ADDRESS="0xad9be64fd7a35d99a138b87cb212baefbcdcf045"
ARG VITE_HL_REFERRAL_CODE=""
ARG VITE_STRIPE_PAYMENT_LINK_PRO=""
ARG VITE_STRIPE_PAYMENT_LINK_MENTORING=""
ENV VITE_BUILDER_ADDRESS=$VITE_BUILDER_ADDRESS
ENV VITE_HL_REFERRAL_CODE=$VITE_HL_REFERRAL_CODE
ENV VITE_STRIPE_PAYMENT_LINK_PRO=$VITE_STRIPE_PAYMENT_LINK_PRO
ENV VITE_STRIPE_PAYMENT_LINK_MENTORING=$VITE_STRIPE_PAYMENT_LINK_MENTORING

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
