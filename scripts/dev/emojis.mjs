// Os emojis próprios da Helena (assets/emojis/*.svg, lista em config/icons.mjs).
//
//   node scripts/dev/emojis.mjs sheet [saida.png]   uma folha com todos, em fundo escuro e claro, em 128 e 32 px
//   node scripts/dev/emojis.mjs upload              envia ao aplicativo os que ainda não existem (precisa do token)
//   node scripts/dev/emojis.mjs upload --replace    apaga e envia de novo os que já existem (para trocar um desenho)
//
// O envio fala com o Discord de verdade (POST /applications/:id/emojis), então só roda quando você pede.
//
// Ele precisa de DISCORD_BOT_TOKEN: o token do bot OFICIAL (o mesmo das variáveis do Discloud; o emoji vai para o
// aplicativo dono do token). O .env do projeto pode não tê-lo (o antigo era da VSync). Para não gravar o token em
// arquivo, no PowerShell (não aparece na tela nem no histórico, e some quando a janela fecha):
//
//   $s = Read-Host "Token do bot" -AsSecureString; $env:DISCORD_BOT_TOKEN = [System.Net.NetworkCredential]::new("", $s).Password
//   node scripts/dev/emojis.mjs upload
//   Remove-Item Env:DISCORD_BOT_TOKEN
//
// O bot só lê a lista de emojis do aplicativo quando sobe: depois do envio, faça um Rebuild no Discloud.

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

export const MISSING_TOKEN =
    "❌ Falta o DISCORD_BOT_TOKEN: o envio usa o token do bot oficial, e o .env do projeto pode não ter essa variável.\n" +
    "   Sem gravar o token em arquivo (PowerShell):\n" +
    "     $s = Read-Host \"Token do bot\" -AsSecureString; $env:DISCORD_BOT_TOKEN = [System.Net.NetworkCredential]::new(\"\", $s).Password\n" +
    "     node scripts/dev/emojis.mjs upload\n" +
    "     Remove-Item Env:DISCORD_BOT_TOKEN\n" +
    "   O token está nas variáveis do app no Discloud (aba Variáveis).";

/** O que mostrar quando o envio falha: o Discord recusar o token (401) quase sempre é o token errado, não um defeito. */
export function explainFailure(error) {
    const message = error?.message ?? String(error);

    if (error?.status === 401) {
        return `${message}\n❌ O Discord recusou o token. Confira se o DISCORD_BOT_TOKEN é o do bot Helena (aba Bot do Portal ou variáveis do Discloud) e não um token antigo, como o da VSync.`;
    }

    return message;
}

async function upload({ replace }) {
    if (!String(process.env.DISCORD_BOT_TOKEN ?? "").trim()) {
        throw new Error(MISSING_TOKEN);
    }

    const { createDiscordApi } = await import("../../services/discord/api.mjs");

    const api = createDiscordApi();

    const application = await api.application();

    // para conferir que é o aplicativo certo antes de qualquer envio
    console.log(`Aplicativo: ${application.name} (${application.id})`);

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

    if (sent > 0) {
        console.log("O bot só lê a lista de emojis ao subir: faça um Rebuild no Discloud para ele passar a usar os novos.");
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1].replace(/\\/g, "/")}`))) {
    const [command, ...rest] = process.argv.slice(2);

    if (command === "sheet") {
        await sheet(rest[0] ?? "emojis-sheet.png");
    } else if (command === "upload") {
        try {
            await upload({ replace: rest.includes("--replace") });

        } catch (error) {
            // uma mensagem clara em vez do rastro de pilha
            console.error(explainFailure(error));

            process.exitCode = 1;
        }
    } else {
        console.log("Uso: node scripts/dev/emojis.mjs sheet [saida.png] | upload [--replace]");
    }
}
