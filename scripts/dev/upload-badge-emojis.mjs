
// Coloca os ícones das insígnias (um PNG por insígnia) como emojis de um servidor da VSync, para o
// /userinfo mostrá-los (services/social/badge-emojis.mjs). Quem roda é você, com o seu token:
//
//   node --env-file=.env scripts/dev/upload-badge-emojis.mjs <pasta com os PNGs> <ID do servidor>
//   node --env-file=.env scripts/dev/upload-badge-emojis.mjs <pasta> <servidor> --yes
//   ... --faltantes   só os ícones das insígnias sem emoji fixo no catálogo
//
// Sem --yes ele só confere e mostra o plano (não envia nada). O nome do arquivo, sem .png, é o nome
// do emoji (auto_admin.png -> auto_admin). Só os nomes que o catálogo usa são enviados, e os que o
// servidor já tem ficam como estão. O bot precisa de MANAGE_GUILD no servidor, e o servidor precisa
// de vagas (o limite depende do nível do Pulse do servidor).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { BADGE_ICON_NAMES, BADGE_ICONS_WITHOUT_EMOJI } from "../../services/social/userinfo-badges.mjs";

const API = "https://api.vsync.lat";

// O que a VSync aceita de um emoji (documentação: PNG/GIF/WebP até 256 KB, nome de 2 a 32 letras,
// números ou _).
const MAX_BYTES = 256 * 1024;
const NAME = /^[A-Za-z0-9_]{2,32}$/;

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");

// --faltantes: só os ícones das insígnias que não têm emoji fixo no catálogo (o resto já tem).
const onlyMissing = args.includes("--faltantes");

const [folder, guildId] = args.filter(arg => !arg.startsWith("--"));

function stop(message) {
    console.error(message);
    process.exit(1);
}

if (!folder || !guildId) {
    stop("Uso: node --env-file=.env scripts/dev/upload-badge-emojis.mjs <pasta com os PNGs> <ID do servidor> [--yes]");
}

const token = process.env.VSYNC_BOT_TOKEN;

if (!token) {
    stop("VSYNC_BOT_TOKEN não configurado (rode com --env-file=.env).");
}

const headers = { Authorization: `Bot ${token}` };

const sleep = ms => new Promise(done => setTimeout(done, ms));

// ==========================================
// O QUE HÁ NA PASTA
// ==========================================

const wanted = new Set(onlyMissing ? BADGE_ICONS_WITHOUT_EMOJI : BADGE_ICON_NAMES);

const files = readdirSync(resolve(folder))
    .filter(file => extname(file).toLowerCase() === ".png")
    .map(file => ({ file, name: basename(file, extname(file)), path: join(resolve(folder), file) }));

const usable = [];
const ignored = [];

for (const item of files) {
    const size = statSync(item.path).size;

    if (!wanted.has(item.name)) ignored.push(`${item.file} (${BADGE_ICON_NAMES.includes(item.name) ? "já tem emoji fixo no catálogo" : "o catálogo não usa este nome"})`);
    else if (!NAME.test(item.name)) ignored.push(`${item.file} (nome inválido para emoji)`);
    else if (size > MAX_BYTES) ignored.push(`${item.file} (passa de 256 KB)`);
    else usable.push({ ...item, size });
}

const missingFiles = [...wanted].filter(name => !usable.some(item => item.name === name));

// ==========================================
// O QUE O SERVIDOR JÁ TEM
// ==========================================

const listed = await fetch(`${API}/guilds/${encodeURIComponent(guildId)}/emojis`, { headers });

if (listed.status === 403) stop("O bot não tem MANAGE_GUILD neste servidor (a VSync recusou a lista de emojis).");
if (listed.status === 404) stop("Servidor não encontrado, ou o bot não está nele.");
if (!listed.ok) stop(`A VSync respondeu HTTP ${listed.status} ao listar os emojis.`);

const body = await listed.json();

const existing = Array.isArray(body.emojis) ? body.emojis : [];
const limit = Number(body.limit) || null;

const have = new Set(existing.map(emoji => String(emoji?.name ?? "")));

const toSend = usable.filter(item => !have.has(item.name));
const already = usable.filter(item => have.has(item.name));

// ==========================================
// O PLANO
// ==========================================

console.log(`Servidor ${guildId}: ${existing.length} emojis${limit ? ` de ${limit} vagas` : ""}.`);
console.log(`Pasta: ${usable.length} ícones do catálogo prontos${ignored.length ? `, ${ignored.length} ignorados` : ""}.`);

for (const line of ignored) console.log(`  ignorado: ${line}`);
for (const name of missingFiles) console.log(`  faltando na pasta: ${name}.png`);

console.log(`Já existem no servidor (ficam como estão): ${already.length}`);
console.log(`A enviar: ${toSend.length}${toSend.length ? ` (${toSend.map(item => item.name).join(", ")})` : ""}`);

if (limit && existing.length + toSend.length > limit) {
    stop(`Não cabe: faltam ${existing.length + toSend.length - limit} vaga(s). Apague emojis ou use outro servidor.`);
}

if (!toSend.length) {
    console.log("Nada a fazer.");
    process.exit(0);
}

if (!confirmed) {
    console.log("\nNada foi enviado. Confira o plano e rode de novo com --yes para enviar.");
    process.exit(0);
}

// ==========================================
// O ENVIO
// ==========================================

let sent = 0;

for (const item of toSend) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const form = new FormData();

        form.set("name", item.name);
        form.set("file", new Blob([readFileSync(item.path)], { type: "image/png" }), item.file);

        const response = await fetch(`${API}/guilds/${encodeURIComponent(guildId)}/emojis`, {
            method: "POST",
            headers,
            body: form
        });

        // no limite de pedidos: espera o tempo que a VSync pediu e tenta mais uma vez
        if (response.status === 429 && attempt === 1) {
            const wait = Number(response.headers.get("retry-after")) || 5;

            console.log(`  ${item.name}: limite de pedidos, esperando ${wait}s`);
            await sleep(wait * 1000);
            continue;
        }

        if (!response.ok) {
            const detail = (await response.text()).slice(0, 300);

            stop(`  ${item.name}: HTTP ${response.status} ${detail}\nParei aqui: ${sent} de ${toSend.length} enviados. Rode de novo para continuar (os que já existem são pulados).`);
        }

        sent++;
        console.log(`  ${item.name}: enviado (${sent}/${toSend.length})`);
        break;
    }

    await sleep(400);
}

console.log(`\nPronto: ${sent} emojis enviados. O /userinfo passa a usá-los em até 1 minuto.`);
