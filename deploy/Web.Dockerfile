FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY web/package*.json ./web/
RUN npm --prefix web ci
COPY web ./web
COPY contracts ./contracts
COPY fixtures ./fixtures
ARG VITE_PUBLIC_DEMO=0
ENV VITE_MOCK=0 VITE_API_URL="" VITE_PUBLIC_DEMO=${VITE_PUBLIC_DEMO}
RUN npm --prefix web run build

FROM caddy:2-alpine
COPY --from=build /src/web/dist /srv
