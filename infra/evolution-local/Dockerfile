ARG EVOLUTION_BASE_REF=evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339
FROM ${EVOLUTION_BASE_REF}

LABEL software-barbearia.evolution.base-ref="evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339"
LABEL software-barbearia.evolution.patch="software-barbearia-offline-queue-v1"

COPY patches/software-barbearia-hardening.mjs /evolution/node_modules/baileys/lib/Utils/software-barbearia-hardening.js
COPY patches/apply-baileys-hardening.mjs /tmp/apply-baileys-hardening.mjs

RUN node /tmp/apply-baileys-hardening.mjs && rm /tmp/apply-baileys-hardening.mjs
