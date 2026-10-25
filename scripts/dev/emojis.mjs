// Os emojis próprios da Helena (assets/emojis/*.svg, lista em config/icons.mjs).
//
//   node scripts/dev/emojis.mjs sheet [saida.png]   uma folha com todos, em fundo escuro e claro, em 128 e 32 px
//   node scripts/dev/emojis.mjs upload              envia ao aplicativo os que ainda não existem (precisa do token)
//   node scripts/dev/emojis.mjs upload --replace    apaga e envia de novo os que já existem (para trocar um desenho)
//
// O envio fala com o Discord de verdade (POST /applications/:id/emojis), então só roda quando você pede.
// Use com o .env certo:  node --env-file=.env scripts/dev/emojis.mjs upload

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { ICONS, ICON_PREFIX } from "../../config/icons.mjs";

const DIR = new URL("../../assets/emojis/", import.meta.url);

const SIZE = 128;

/** O desenho de um emoji em PNG (o Discord pede até 256 KB; 128 x 128 é o tamanho dele). */
export async function renderEmoji(name, size = SIZE) {
    const svg = await readFile(new URL(`${name}.svg`, DIR));

    return sharp(svg, { density: Math.round((72 * size) / 128) * 4 })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer();
}

// ---------------------------------------------------------------- a folha de prévia

async function sheet(output) {
    const names = Object.keys(ICONS);

    const cell = 150;
    const columns = 10;
    const rows = Math.ceil(names.length / columns);
    const band = rows * cell;

    // duas faixas: o escuro do Discord (#313338) e o claro (#ffffff); em cada célula, o desenho em 128 e em 32 px
    const layers = [];

    for (const [bandIndex, background] of ["#313338", "#ffffff"].entries()) {
        for (const [index, name] of names.entries()) {
            const x = (index % columns) * cell + 10;
            const y = bandIndex * band + Math.floor(index / columns) * cell + 6;

            layers.push({ input: await renderEmoji(name, 96), left: x, top: y });
            layers.push({ input: await renderEmoji(name, 32), left: x + 100, top: y + 20 });
            layers.push({ input: await renderEmoji(name, 22), left: x + 100, top: y + 60 });
        }

        void background;
    }

    const dark = { create: { width: columns * cell, height: band, channels: 4, background: "#313338" } };
    const light = { create: { width: columns * cell, height: band, channels: 4, background: "#ffffff" } };

    const top = await sharp(dark).png().toBuffer();
    const bottom = await sharp(light).png().toBuffer();

    await sharp({ create: { width: columns * cell, height: band * 2, channels: 4, background: "#313338" } })
        .composite([{ input: top, left: 0, top: 0 }, { input: bottom, left: 0, top: band }, ...layers])
        .png()
        .toFile(output);

    console.log(`Folha com ${names.length} emojis em ${output}`);
}

// ---------------------------------------------------------------- o envio

async function upload({ replace }) {
    const { createDiscordApi } = await import("../../services/discord/api.mjs");

    const api = createDiscordApi();

    const application = await api.application();

    const existing = new Map(((await api.appEmojis(application.id)).items ?? []).map(item => [item.name, item]));

    let sent = 0;

    for (const name of Object.keys(ICONS)) {
        const emojiName = ICON_PREFIX + name;
        const found = existing.get(emojiName);

        if (found && !replace) {
            console.log(`= ${emojiName} já existe`);
            continue;
        }

        if (found) {
            await api.request("DELETE", `/applications/${application.id}/emojis/${found.id}`);
        }

        await api.createAppEmoji(application.id, emojiName, await renderEmoji(name));

        console.log(`+ ${emojiName} enviado`);

        sent += 1;
    }

    console.log(`${sent} emoji(s) enviado(s) ao aplicativo ${application.name}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1].replace(/\\/g, "/")}`))) {
    const [command, ...rest] = process.argv.slice(2);

    if (command === "sheet") {
        await sheet(rest[0] ?? "emojis-sheet.png");
    } else if (command === "upload") {
        await upload({ replace: rest.includes("--replace") });
    } else {
        console.log("Uso: node scripts/dev/emojis.mjs sheet [saida.png] | upload [--replace]");
    }
}
