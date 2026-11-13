FROM node:26-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

# Fail the image build itself on any lint error or failing test - and on any
# type error, which `npm run build` checks first.
RUN npm run lint && npm test

# Without source maps: they're only useful with the source at hand, and are
# most of the build's size.
RUN npm run build -- --sourcemap false

##### STAGE 2 #####

# The slim variant: nginx without the extra modules (njs, image filter, ...)
# a static site doesn't need.
FROM nginx:1.30-alpine-slim

WORKDIR /usr/share/nginx/html

COPY --from=builder /usr/src/app/dist .

EXPOSE 80

COPY --chmod=755 entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

ENV ADAGUC_AUTOWMS_ENDPOINT="http://localhost:8090/adaguc-services/autowms?"

CMD ["nginx","-g","daemon off;"]