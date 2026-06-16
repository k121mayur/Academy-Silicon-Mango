FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# BuildKit cache mount: npm's download cache persists across builds, so a
# changed lockfile only re-fetches the diff instead of the whole tree.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# Cloudflare Turnstile site key is baked into the SPA at build time (Vite).
# Empty by default → CAPTCHA widget is disabled (backend also skips verification).
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Rendered at container start by the nginx image's envsubst step. Only variables
# matching NGINX_ENVSUBST_FILTER (^SM_) are substituted, so nginx runtime vars
# like $uri / $arg_e survive. SM_* values come from docker-compose env.
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
