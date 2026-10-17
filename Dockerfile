# Imagem do bot para a nuvem (Railway, Fly.io...). O comando de inicio nao usa
# --env-file: as variaveis vem da hospedagem, e o .env nunca entra na imagem.
FROM node:24-bookworm-slim

WORKDIR /app

# O cartao de perfil e um SVG que o sharp desenha com as fontes do sistema, e a
# lista de fontes dele (services/social/profile-card.mjs) termina em DejaVu Sans. Uma
# imagem enxuta nao traz fonte nenhuma, e o texto do cartao sumiria.
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# O volume da hospedagem e montado em /data: o banco e os dados gerados ficam la
# e sobrevivem aos deploys. A API do site escuta em todas as interfaces do
# container (a hospedagem decide o que fica publico); a porta vem de HELENA_WEB_PORT.
ENV HELENA_DATABASE_PATH=/data/helena.db
ENV HELENA_WEB_HOST=0.0.0.0

CMD ["node", "helena.mjs"]
