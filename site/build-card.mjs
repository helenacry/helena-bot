// Gera a imagem de exemplo do cartão de perfil que aparece no herói do site,
// usando o MESMO gerador do comando /perfil (services/profile-card.mjs).
// Assim a imagem do site nunca fica diferente do cartão que o bot envia.
//
//   npm run site:card
//
// Rode de novo sempre que o desenho do cartão mudar. Os dados são de uma
// jogadora fictícia, e a foto é a da própria Helena (assets/helena_pfp.png).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { renderProfileCard } from "../services/profile-card.mjs";

import { getItem } from "../config/items.mjs";

const OUTPUT = new URL("./assets/img/helena-card.webp", import.meta.url);

const avatarBuffer = await readFile(
    new URL("../assets/helena_pfp.png", import.meta.url)
);

const revolver = getItem("revolver");

const png = await renderProfileCard({
    name: "Educado",
    isOwner: true,
    avatarBuffer,

    title: "Rico",
    bio: "Algumas pessoas colecionam coisas, eu coleciono momentos. E ainda assim, sempre quero mais.",

    // Em reais (o gerador recebe reais, não centavos).
    bank: 2300,
    wallet: 150,
    gems: 12,

    job: "Programador",

    weapon: revolver.name,
    weaponDamage: revolver.damage,

    level: 18,
    maxLevel: 100,
    xpProgress: 1800,
    xpRequired: 4500,

    rank: 3,

    married: true,
    spouseName: "sakura"
});

const file = fileURLToPath(OUTPUT);

await sharp(png)
    .resize(1200)
    .webp({ quality: 86 })
    .toFile(file);

const meta = await sharp(file).metadata();

console.log(`site/assets/img/helena-card.webp atualizado (${meta.width}x${meta.height}).`);
