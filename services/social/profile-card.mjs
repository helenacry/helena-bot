
// Primeiro: põe as Poppins do projeto à vista do fontconfig, antes de o sharp
// desenhar qualquer texto.
import "./card-fonts.mjs";

import sharp from "sharp";

import { canDraw, textAdvance } from "./card-glyphs.mjs";

import { emojiImage, findEmoji } from "./card-emoji.mjs";

// ==========================================
// CARTÃO DE PERFIL
// ==========================================

// Imagem 1600 x 1200 montada em SVG e convertida para PNG pelo sharp,
// sem gravar nada em disco.
//
// Peças: lateral com o RANK, chip do estado civil, anel do nível, avatar
// em pentágono, nome e título, bio e cinco cartões (banco, gemas, carteira,
// arma e emprego).

const W = 1600;
const H = 1200;

// A primeira fonte instalada vence. O Poppins vai junto no projeto (assets/fonts);
// o resto é reserva para quando ele falhar: o Segoe UI (Windows) e o DejaVu Sans
// (Linux). Sem nenhuma delas o sistema cai numa fonte com serifa, que funciona
// mas não é a ideal.
const FONT = "Poppins, Nunito, Segoe UI, DejaVu Sans, Arial, sans-serif";

const LILAC = "#b978ff";
const BORDER = "#7540c7";

// ==========================================
// UTILITÁRIOS
// ==========================================

function esc(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

// Conta e corta por caractere (não por unidade UTF-16): cortar no meio de um
// caractere "grande", como as letras matemáticas de nomes estilizados, deixaria
// um símbolo quebrado no cartão.
const chars = value => Array.from(String(value ?? ""));

function short(value, max = 60) {
    const letters = chars(value);

    return letters.length > max
        ? letters.slice(0, max - 1).join("") + "…"
        : letters.join("");
}

function money(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    }).format(Number(value) || 0);
}

// O SVG não desenha emoji colorido: o que sobrar de emoji no texto sai, e fica só as letras. Os emojis
// comuns de nome, bio e cônjuge são desenhados à parte, como imagem (veja rich(), mais abaixo); aqui
// saem os que não têm desenho, e em tudo o mais (emprego, arma, título) saem todos. Sai tudo que
// forma um emoji, não só a figura: teclas (1️⃣), bandeiras (duas letras regionais),
// tons de pele, e os caracteres invisíveis que costuram os emojis compostos
// (ZWJ, seletores de variação, etiquetas) e que de outra forma sobrariam como
// quadradinhos. ©, ® e ™ ficam, a não ser que venham pedindo a versão emoji.
const EMOJI = new RegExp(
    [
        "[0-9#*]\\uFE0F?\\u20E3",
        "[\\u00A9\\u00AE\\u2122]\\uFE0F",
        "(?![\\u00A9\\u00AE\\u2122])\\p{Extended_Pictographic}",
        "\\p{Regional_Indicator}",
        "\\p{Emoji_Modifier}",
        "[\\uFE0E\\uFE0F\\u20E3]",
        "\\p{Cf}"
    ].join("|"),
    "gu"
);

// Os "tokens" da VSync dentro de um texto: emoji personalizado (<:nome:id>, <a:nome:id>) e menção
// de pessoa, cargo ou canal (<@id>, <@&id>, <#id>). No cartão viravam um texto cru e comprido; aqui
// somem (e a menção some também: o cartão não mostra o ID de ninguém).
const TOKEN = /<a?:[\p{L}\p{N}_~]{1,32}:[\p{L}\p{N}-]{1,64}>|<[@#][&!]?[\p{L}\p{N}-]{1,64}>/gu;

// Cada emoji desenhado como imagem entra no texto como este caractere (área de uso privado, que nenhum
// texto de quem joga consegue trazer: rich() e plain() tiram esses antes). Assim o texto continua uma
// string só e passa pelo mesmo corte e quebra de linha; os arquivos dos emojis vão numa lista à parte,
// na mesma ordem.
const MARK = "";

// Deixa o texto como o cartão consegue desenhar: letras e números sem os "adornos". Tira os caracteres
// de controle e invisíveis e tudo o que o Poppins não tem (símbolos decorativos, japonês, árabe...),
// que sairiam como quadradinhos. Antes, o acento solto se junta à letra (NFC) e o caractere que o
// Poppins não tem vira o seu equivalente comum, se houver (NFKC): letras em fonte estilizada
// (𝓑𝓲𝓸, 𝗕𝗶𝗼), largura total (ＡＢＣ) e ligaduras (ﬁ) voltam a ser letras. O que o Poppins já tem
// (™, ©, é...) fica como está. O MARK passa sem ser tocado.
function tidy(text) {
    const letters = Array.from(
        text
            .replace(/\s+/g, " ")
            .replace(/[\p{Cc}\p{Cs}\p{Co}\p{Cn}]/gu, letter => letter === MARK ? letter : "")
    );

    return letters
        .flatMap(letter => letter === MARK || canDraw(letter.codePointAt(0))
            ? [letter]
            : Array.from(letter.normalize("NFKC")).filter(part => part === " " || canDraw(part.codePointAt(0))))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
}

// O texto pronto para o cartão, sem emoji nenhum: tira os tokens da VSync (emoji personalizado e
// menção) e os emojis, e deixa o resto passar por tidy().
export function plain(value) {
    return tidy(
        String(value ?? "")
            .normalize("NFC")
            .replace(/\p{Co}/gu, "")
            .replace(TOKEN, " ")
            .replace(EMOJI, "")
    );
}

// O mesmo que plain(), mas os emojis comuns ficam, para serem desenhados em cores: devolve o texto
// com um MARK no lugar de cada emoji, os arquivos dos desenhos (na ordem) e os emojis como estavam
// escritos. Um emoji sem desenho (novo demais, ou os pacotes não instalados) sai do texto, como no plain().
export function rich(value) {
    const source = String(value ?? "")
        .normalize("NFC")
        .replace(/\p{Co}/gu, "")
        .replace(TOKEN, " ");

    const files = [];
    const glyphs = [];

    let marked = "";
    let cursor = 0;

    for (const { start, end, file } of findEmoji(source)) {
        marked += source.slice(cursor, start) + MARK;

        files.push(file);
        glyphs.push(source.slice(start, end));

        cursor = end;
    }

    marked += source.slice(cursor);

    return { text: tidy(marked.replace(EMOJI, "")), files, glyphs };
}

// O texto como aparece no cartão, com os emojis de verdade no lugar (para mostrar à pessoa como a bio
// vai ficar).
export function cardText(value) {
    const { text, glyphs } = rich(value);

    let next = 0;

    return text.replaceAll(MARK, () => glyphs[next++]);
}

// Quanto cada caractere pesa na linha: um emoji ocupa o espaço de uns dois caracteres e meio.
const EMOJI_WEIGHT = 2.3;

const weigh = letters => letters.reduce((sum, letter) => sum + (letter === MARK ? EMOJI_WEIGHT : 1), 0);

// Quebra o texto em linhas de até "max" caracteres, sem cortar palavras
// (palavra maior que a linha é partida). Passando de "maxLines", termina
// com reticências. O emoji (MARK) pesa mais que uma letra.
export function wrap(text, max, maxLines) {
    const lines = [];
    let line = "";

    for (const piece of String(text ?? "").split(/\s+/).filter(Boolean)) {
        let letters = chars(piece);

        while (weigh(letters) > max) {
            if (line) {
                lines.push(line);
                line = "";
            }

            let take = 0;
            let used = 0;

            while (take < letters.length && used + weigh([letters[take]]) <= max) {
                used += weigh([letters[take]]);

                take++;
            }

            take = Math.max(1, take);

            lines.push(letters.slice(0, take).join(""));
            letters = letters.slice(take);
        }

        const word = letters.join("");

        if (!line) {
            line = word;
        } else if (weigh(chars(line + " " + word)) <= max) {
            line += " " + word;
        } else {
            lines.push(line);
            line = word;
        }
    }

    if (line) {
        lines.push(line);
    }

    if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);

        // a última linha perde letras do fim até caber com as reticências
        const last = chars(kept[maxLines - 1]);

        while (last.length > 0 && weigh(last) + 1 > max) {
            last.pop();
        }

        kept[maxLines - 1] = last.join("") + "…";

        return kept;
    }

    return lines;
}

function txt(
    x,
    y,
    value,
    size = 28,
    color = "#f6edff",
    weight = 500,
    extra = ""
) {
    return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(value)}</text>`;
}

// O espaço que o emoji ocupa na linha e o tamanho do desenho, em múltiplos do tamanho da letra; e
// quanto o desenho sobe acima da linha de base do texto (o emoji fica centrado na altura das letras).
const EMOJI_ADVANCE = 1.25;
const EMOJI_BOX = 1.12;
const EMOJI_RISE = 0.9;

// Uma linha de texto que pode ter emojis (os MARK de rich()). Sem emoji sai igual ao txt(). Com emoji,
// a linha vira pedaços: o texto entre os emojis, cada pedaço no seu lugar (a largura vem das letras do
// Poppins), e o desenho de cada emoji, que sai da lista "files" (o que foi usado é tirado dela).
// "middle" centraliza a linha inteira em x.
function richText(x, y, line, files, size, color, weight, { italic = false, middle = false } = {}) {
    const extra = [
        italic ? 'font-style="italic"' : "",
        middle ? 'text-anchor="middle"' : ""
    ].filter(Boolean).join(" ");

    if (!line.includes(MARK)) {
        return txt(x, y, line, size, color, weight, extra);
    }

    const parts = line.split(MARK);

    const style = { weight, italic };

    const advance = size * EMOJI_ADVANCE;
    const box = size * EMOJI_BOX;

    const total = parts.reduce((sum, part) => sum + textAdvance(part, size, style), 0)
        + (parts.length - 1) * advance;

    let cursor = middle ? x - total / 2 : x;

    let svg = "";

    parts.forEach((part, index) => {
        // o SVG corta os espaços do começo e do fim de um texto, então o espaço do começo é somado aqui
        const body = part.trim();

        if (body) {
            const lead = textAdvance(part.slice(0, part.indexOf(body)), size, style);

            svg += txt(
                (cursor + lead).toFixed(1),
                y,
                body,
                size,
                color,
                weight,
                italic ? 'font-style="italic"' : ""
            );
        }

        cursor += textAdvance(part, size, style);

        if (index < parts.length - 1) {
            const image = emojiImage(files.shift());

            if (image) {
                svg += `<image href="${image}" x="${(cursor + (advance - box) / 2).toFixed(1)}" y="${(y - size * EMOJI_RISE).toFixed(1)}" width="${box.toFixed(1)}" height="${box.toFixed(1)}"/>`;
            }

            cursor += advance;
        }
    });

    return svg;
}

// ==========================================
// FORMAS E ÍCONES
// ==========================================

// Estrela de quatro pontas, com as laterais curvas para dentro.
function star(x, y, size, color = "#9f7be3", opacity = 0.5) {
    const k = size * 0.14;

    return `<path d="M${x},${y - size} Q${x + k},${y - k} ${x + size},${y} Q${x + k},${y + k} ${x},${y + size} Q${x - k},${y + k} ${x - size},${y} Q${x - k},${y - k} ${x},${y - size} Z" fill="${color}" opacity="${opacity}"/>`;
}

// Pentágono com uma ponta para cima (um pouco mais largo que alto, como no desenho: rx > ry).
function pentagon(cx, cy, rx, ry = rx) {
    return [-90, -18, 54, 126, 198]
        .map(degrees => {
            const angle = degrees * Math.PI / 180;

            return [
                (cx + rx * Math.cos(angle)).toFixed(1),
                (cy + ry * Math.sin(angle)).toFixed(1)
            ].join(",");
        })
        .join(" ");
}

// Arco do anel de nível: sai do topo e anda no sentido anti-horário (no desenho, o trecho do 0%
// fica à esquerda do topo).
function arc(cx, cy, radius, ratio) {
    if (ratio >= 0.999) {
        return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#b66cff" stroke-width="12"/>`;
    }

    const angle = (-90 - 360 * ratio) * Math.PI / 180;

    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    return `<path d="M${cx},${cy - radius} A${radius},${radius} 0 ${ratio > 0.5 ? 1 : 0} 0 ${x.toFixed(1)},${y.toFixed(1)}" fill="none" stroke="#b66cff" stroke-width="12" stroke-linecap="round"/>`;
}

const ICONS = {
    bank: () => `
        <path fill="#fff" d="M-22,-8 L0,-24 L22,-8 Z"/>
        <rect fill="#fff" x="-16" y="-4" width="7" height="20" rx="1.5"/>
        <rect fill="#fff" x="-3.5" y="-4" width="7" height="20" rx="1.5"/>
        <rect fill="#fff" x="9" y="-4" width="7" height="20" rx="1.5"/>
        <rect fill="#fff" x="-22" y="19" width="44" height="6" rx="2"/>`,

    gem: color => `
        <path fill="#fff" d="M-14,-18 H14 L24,-4 L0,22 L-24,-4 Z"/>
        <path fill="none" stroke="${color}" stroke-width="2" opacity=".6" d="M-24,-4 H24 M-8,-4 L0,22 L8,-4 M-14,-18 L-8,-4 M14,-18 L8,-4"/>`,

    wallet: color => `
        <rect fill="#fff" x="-22" y="-14" width="44" height="30" rx="7"/>
        <rect fill="${color}" x="2" y="-4" width="22" height="14" rx="5"/>
        <circle fill="#fff" cx="11" cy="3" r="3.2"/>`,

    gun: () => `
        <rect fill="#fff" x="-24" y="-14" width="46" height="15" rx="3"/>
        <path fill="#fff" d="M-2,0 H13 L17,22 H3 Z"/>
        <path fill="none" stroke="#fff" stroke-width="3" d="M-12,1 V9 Q-12,13 -7,13 H0"/>`,

    briefcase: color => `
        <rect fill="#fff" x="-22" y="-10" width="44" height="30" rx="6"/>
        <path fill="none" stroke="#fff" stroke-width="5" d="M-9,-10 V-15 Q-9,-19 -5,-19 H5 Q9,-19 9,-15 V-10"/>
        <rect fill="${color}" opacity=".45" x="-22" y="3" width="44" height="4"/>`,

    // Três pontas com os lados retos e a barra embaixo, na mesma largura (52 x 48).
    crown: color => `
        <path fill="${color}" d="M-26,-17 L-10.5,-3 L0,-24 L10.5,-3 L26,-17 L26,12 L-26,12 Z"/>
        <rect fill="${color}" x="-26" y="17" width="52" height="7" rx="3.5"/>`,

    // Coração de 30 x 31.
    heart: (color, filled = true) => `
        <path fill="${filled ? color : "none"}" stroke="${color}" stroke-width="${filled ? 0 : 3.5}" d="M0,15.5 C-8,9 -15,3 -15,-5.5 C-15,-12 -10.5,-15.5 -6.5,-15.5 C-3.5,-15.5 -1.5,-14 0,-11.5 C1.5,-14 3.5,-15.5 6.5,-15.5 C10.5,-15.5 15,-12 15,-5.5 C15,3 8,9 0,15.5 Z"/>`
};

// "scale" é um número ou [largura, altura] (alguns ícones do desenho são mais largos ou mais altos).
function icon(name, x, y, scale, ...args) {
    const [sx, sy] = Array.isArray(scale) ? scale : [scale, scale];

    return `<g transform="translate(${x},${y}) scale(${sx},${sy})">${ICONS[name](...args)}</g>`;
}

// ==========================================
// CARTÃO DE DADO (pílula)
// ==========================================

function pill({ x, y, color, glyph, label, value, detail = "" }) {
    const long = String(value).length > 13;

    return `
        <rect x="${x + 1}" y="${y}" width="430" height="94" rx="47" fill="#211541" stroke="${BORDER}" stroke-width="2"/>
        <circle cx="${x + 49}" cy="${y + 47}" r="36" fill="${color}"/>
        ${glyph(x + 49, y + 47)}
        ${txt(x + 100, y + 37, label, 17, "#bda2df", 500)}
        ${txt(x + 100, y + 69, short(value, 22), long ? 24 : 30, "#ffffff", 700)}
        ${detail ? txt(x + 404, y + 69, detail, 19, "#cdb2f7", 600, 'text-anchor="end"') : ""}
    `;
}

// ==========================================
// CARREGAMENTO DE AVATAR
// ==========================================

// Recorta a imagem em quadrado e devolve como data URI para o SVG.
async function toDataUri(input) {
    const png = await sharp(input)
        .resize(440, 440, {
            fit: "cover"
        })
        .png()
        .toBuffer();

    return `data:image/png;base64,${png.toString("base64")}`;
}

// O avatar vem de uma URL https (a foto da conta) ou, para testes e para
// gerar a imagem de exemplo do site, direto da memória (avatarBuffer).
async function imageData(url, buffer) {
    try {
        if (Buffer.isBuffer(buffer)) {
            return await toDataUri(buffer);
        }

        if (
            !url ||
            typeof url !== "string" ||
            !/^https:\/\//.test(url)
        ) {
            return null;
        }

        const response = await fetch(url, {
            signal: AbortSignal.timeout(6000)
        });

        if (!response.ok) {
            return null;
        }

        const input = Buffer.from(
            await response.arrayBuffer()
        );

        if (input.length > 5_000_000) {
            return null;
        }

        return await toDataUri(input);

    } catch (error) {
        console.warn(
            "[PROFILE CARD] Avatar indisponível:",
            error.message
        );

        return null;
    }
}

// ==========================================
// EMOJI DO TÍTULO
// ==========================================

// O SVG do sharp não desenha emoji colorido (sem fonte de emoji o texto vira quadradinhos), então
// os emojis dos títulos das conquistas são desenhados aqui, em vetor, numa grade de 32 x 32. O
// título equipado vem como "💰 Rico": o emoji do começo vira este desenho, e um emoji que não
// está na lista fica de fora (o cartão mostra uma estrelinha no lugar).
const EMOJI_ART = Object.freeze({
    // 🌱 broto
    "🌱": `
        <path d="M16,29 L16,14" stroke="#3f7d20" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M16,17 C16,9 10,5 3,6 C3,14 9,18 16,17 Z" fill="#7ed957"/>
        <path d="M16,14 C16,6 22,2 29,3 C29,11 23,15 16,14 Z" fill="#4fb53a"/>`,

    // 🏆 troféu
    "🏆": `
        <path d="M9,5 H23 V14 C23,19.5 19.5,22.5 16,22.5 C12.5,22.5 9,19.5 9,14 Z" fill="#ffc83d"/>
        <path d="M9,8 H5.2 C5.2,13.5 7,15.5 10.2,15.8 M23,8 H26.8 C26.8,13.5 25,15.5 21.8,15.8" stroke="#ffb300" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <rect x="14.4" y="22.5" width="3.2" height="4" fill="#e69a00"/>
        <rect x="10" y="26" width="12" height="3.4" rx="1.4" fill="#ffc83d" stroke="#e69a00" stroke-width="1"/>
        <path d="M12,7.5 V13 C12,15.5 13,17 14.4,18" stroke="#fff3c4" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".85"/>`,

    // 👑 coroa
    "👑": `
        <path d="M3,24 L2,10 L10,16.5 L16,6 L22,16.5 L30,10 L29,24 Z" fill="#ffc83d"/>
        <path d="M3,24 H29 V27.5 H3 Z" fill="#e69a00"/>
        <circle cx="2.2" cy="10" r="1.9" fill="#ffc83d"/><circle cx="16" cy="6" r="1.9" fill="#ffc83d"/><circle cx="29.8" cy="10" r="1.9" fill="#ffc83d"/>
        <circle cx="16" cy="19.5" r="2" fill="#ef4444"/><circle cx="9" cy="20.5" r="1.5" fill="#3b82f6"/><circle cx="23" cy="20.5" r="1.5" fill="#3b82f6"/>`,

    // 💵 cédula
    "💵": `
        <rect x="2.5" y="8" width="27" height="16" rx="2.6" fill="#55b95a" stroke="#2e7d32" stroke-width="1.5"/>
        <circle cx="16" cy="16" r="4.6" fill="#b7e4b9" stroke="#2e7d32" stroke-width="1.2"/>
        <circle cx="7.2" cy="12.2" r="1.4" fill="#b7e4b9"/><circle cx="24.8" cy="19.8" r="1.4" fill="#b7e4b9"/>`,

    // 💰 saco de dinheiro
    "💰": `
        <path d="M11,3.6 L21,3.6 L18.2,10 L13.8,10 Z" fill="#b67a43"/>
        <path d="M16,9.5 C8,12 4.6,19 4.6,23.2 C4.6,27.4 9.6,29.4 16,29.4 C22.4,29.4 27.4,27.4 27.4,23.2 C27.4,19 24,12 16,9.5 Z" fill="#c98b4e" stroke="#8a5a2b" stroke-width="1"/>
        <path d="M11.6,9.6 H20.4" stroke="#e8c15a" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="16" cy="21" r="5" fill="#ffd54f" stroke="#c79100" stroke-width="1"/>
        <path d="M17.7,18.8 C16.9,18 14.3,18.2 14.3,19.8 C14.3,21.6 17.7,20.8 17.7,22.6 C17.7,24 15.1,24.3 14.3,23.3 M16,17.4 V24.6" stroke="#a06b00" stroke-width="1.3" stroke-linecap="round" fill="none"/>`,

    // 💎 gema
    "💎": `
        <path d="M9,5 H23 L29,12 L16,28.5 L3,12 Z" fill="#4fc3f7"/>
        <path d="M9,5 H23 L19.6,12 H12.4 Z" fill="#b3e5fc"/>
        <path d="M3,12 H29 M9,5 L12.4,12 L16,28.5 M23,5 L19.6,12 L16,28.5" stroke="#0288d1" stroke-width="1.1" stroke-linejoin="round" fill="none" opacity=".75"/>`,

    // 🔥 fogo
    "🔥": `
        <path d="M16,2.6 C17,8 24.4,11 24.4,19.2 C24.4,25.2 20.6,29.4 16,29.4 C11.4,29.4 7.6,25.2 7.6,19.2 C7.6,15.2 9.8,13 10.8,10 C13,12 13,14 14,15.2 C14,10.2 13.8,6.2 16,2.6 Z" fill="#ff6d1f"/>
        <path d="M16,14.6 C17,18 21.2,19.4 21.2,23.6 C21.2,26.8 18.9,28.8 16,28.8 C13.1,28.8 10.8,26.8 10.8,23.6 C10.8,20 14,19 16,14.6 Z" fill="#ffc107"/>
        <path d="M16,21.8 C17,23.4 18.6,24 18.6,26 C18.6,27.6 17.4,28.8 16,28.8 C14.6,28.8 13.4,27.6 13.4,26 C13.4,24.2 15,23.4 16,21.8 Z" fill="#fff3b0"/>`,

    // 🌟 estrela brilhante
    "🌟": `
        <path d="M16,2.4 L19.7,11.3 L29.4,12.1 L22,18.4 L24.3,27.8 L16,22.8 L7.7,27.8 L10,18.4 L2.6,12.1 L12.3,11.3 Z" fill="#ffd633" stroke="#f5a300" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M27.5,2.5 L28.4,5 L31,5.9 L28.4,6.8 L27.5,9.3 L26.6,6.8 L24,5.9 L26.6,5 Z" fill="#fff176"/>`,

    // ⚔ espadas cruzadas
    "⚔": `
        <g transform="rotate(45 16 16)">
            <path d="M16,1.5 L18.4,5.6 V20 H13.6 V5.6 Z" fill="#cfd8dc" stroke="#90a4ae" stroke-width=".8"/>
            <rect x="9.6" y="20" width="12.8" height="2.8" rx="1.3" fill="#8d6e63"/>
            <rect x="14.8" y="22.8" width="2.4" height="5" fill="#5d4037"/>
            <circle cx="16" cy="28.6" r="1.9" fill="#ffc107"/>
        </g>
        <g transform="rotate(-45 16 16)">
            <path d="M16,1.5 L18.4,5.6 V20 H13.6 V5.6 Z" fill="#e3eaee" stroke="#90a4ae" stroke-width=".8"/>
            <rect x="9.6" y="20" width="12.8" height="2.8" rx="1.3" fill="#8d6e63"/>
            <rect x="14.8" y="22.8" width="2.4" height="5" fill="#5d4037"/>
            <circle cx="16" cy="28.6" r="1.9" fill="#ffc107"/>
        </g>`,

    // 🏅 medalha
    "🏅": `
        <path d="M8.6,2.6 H15.2 L19.6,13.4 H13 Z" fill="#e53935"/>
        <path d="M23.4,2.6 H16.8 L12.4,13.4 H19 Z" fill="#1e88e5"/>
        <circle cx="16" cy="20.4" r="9" fill="#ffc83d" stroke="#e69a00" stroke-width="1.6"/>
        <circle cx="16" cy="20.4" r="5.4" fill="#ffe082" stroke="#e69a00" stroke-width=".9"/>
        <path d="M16,17 L16.9,19.3 L19.3,19.5 L17.5,21 L18.1,23.4 L16,22.1 L13.9,23.4 L14.5,21 L12.7,19.5 L15.1,19.3 Z" fill="#e69a00"/>`
});

// Separa o título equipado ("💰 Rico") no desenho do emoji (ou null) e no texto sem emoji.
export function splitTitle(raw) {
    const text = String(raw ?? "").trim();

    const first = /^\p{Extended_Pictographic}️?/u.exec(text)?.[0] ?? "";

    return {
        art: EMOJI_ART[first.replace(/️/g, "")] ?? null,
        text: plain(text)
    };
}

// ==========================================
// LARGURA DE UM TEXTO
// ==========================================

// A largura que o texto ocupa de verdade (para centralizar o emoji junto com o título): desenha
// o texto com as mesmas fontes e mede onde há tinta. O resultado fica guardado.
const widths = new Map();

async function textWidth(value, size, weight) {
    const key = `${value}|${size}|${weight}`;

    if (widths.has(key)) {
        return widths.get(key);
    }

    const pad = 20;

    const boxWidth = Math.ceil(chars(value).length * size * 0.9) + pad * 2;

    const { data, info } = await sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${Math.ceil(size * 2)}">` +
        txt(pad, Math.ceil(size * 1.4), value, size, "#ffffff", weight) +
        "</svg>"
    )).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let left = info.width;
    let right = -1;

    for (let x = 0; x < info.width; x++) {
        for (let y = 0; y < info.height; y++) {
            if (data[(y * info.width + x) * 4 + 3] > 40) {
                left = Math.min(left, x);
                right = Math.max(right, x);

                break;
            }
        }
    }

    const width = right >= left ? right - left + 1 : 0;

    widths.set(key, width);

    return width;
}

// ==========================================
// DECORAÇÃO
// ==========================================

// [x, y, tamanho, cor]: as estrelas do painel, uma cor para cada (algumas mais fortes).
const STARS = [
    [930, 104, 21, "#745091"], [708, 180, 25, "#ad89c9"], [360, 153, 14, "#a887c4"],
    [1197, 125, 11, "#755092"], [445, 260, 21, "#6c4d8a"], [1092, 239, 19, "#b28bcd"],
    [842, 275, 14, "#7b5398"], [1328, 286, 21, "#745090"], [689, 425, 14, "#745091"],
    [1170, 419, 14, "#af89cb"], [880, 492, 21, "#734f90"], [1412, 506, 25, "#684b84"],
    [582, 92, 9, "#2a1647"], [1511, 232, 13, "#ab88c6"]
];

// ==========================================
// GERADOR DO CARTÃO
// ==========================================

// Monta o SVG do cartão (texto). Separado da conversão em PNG para que
// os testes olhem o conteúdo sem depender de pixels.
export async function profileSvg(data = {}) {
    const level = Math.max(
        1,
        Number(data.level) || 1
    );

    const maxLevel = Math.max(
        level,
        Number(data.maxLevel) || 100
    );

    const xp = Math.max(
        0,
        Number(data.xpProgress) || 0
    );

    const needed = Math.max(
        1,
        Number(data.xpRequired) || 1
    );

    const ratio = level >= maxLevel
        ? 1
        : Math.min(1, xp / needed);

    const percent = Math.floor(ratio * 100);

    // Com 0% o anel ainda mostra um trecho (6% do círculo), como no desenho.
    const arcRatio = Math.max(ratio, 0.06);

    const avatar = await imageData(
        data.avatarUrl,
        data.avatarBuffer
    );

    // Identidade
    // Nome, bio e cônjuge levam emojis em cores (o texto fica com um MARK no lugar de cada um e os
    // desenhos vêm de "files", na ordem). O corte (short) conta cada emoji como 1.
    const nameRich = rich(data.name);

    const name = short(nameRich.text || "Jogador", 20);

    const nameFiles = nameRich.files.slice();

    // o emoji pesa mais que uma letra: um nome cheio de emojis encolhe a letra como um nome comprido
    const nameLength = weigh(chars(name));

    const nameSize = nameLength <= 12
        ? 48
        : Math.max(30, 48 - (nameLength - 12) * 2.5);

    const titleParts = splitTitle(data.title);

    const title = short(titleParts.text, 30);

    const bioRich = rich(data.bio);

    const bioLines = wrap(bioRich.text || "Nenhuma bio definida.", 28, 7);

    const bioFiles = bioRich.files.slice();

    // Nada que o cartão consiga desenhar no nome da pessoa: sobra "" e o cartão mostra o traço.
    const spouseRich = rich(String(data.spouseName ?? "").replace(/^@+/, ""));

    const spouse = spouseRich.text ? "@" + spouseRich.text : "";

    const spouseFiles = spouseRich.files.slice();

    const married = Boolean(data.married);

    const rank = Number.isFinite(Number(data.rank)) && Number(data.rank) > 0
        ? String(Math.trunc(Number(data.rank)))
        : "—";

    // Dano da arma, à direita do cartão (aceita o texto antigo "Dano: N").
    const damage =
        data.weaponDamage ??
        /Dano:\s*(\d+)/.exec(String(data.weaponDetail ?? ""))?.[1];

    const weapon = plain(data.weapon) || "Nenhuma";

    const pentagonPoints = pentagon(424.5, 499, 203.5, 200.1);

    // Título equipado: o emoji (desenhado) e o texto, centralizados juntos no meio da faixa (no
    // desenho, o emoji tem 20 px de tinta e fica a 10 px do texto).
    let titleSvg;

    if (title) {
        const size = 20;

        const textInk = await textWidth(title, size, 500);

        const lead = titleParts.art ? 30 : 0;

        // onde começa a tinta (o texto começa uns 1,5 px depois do ponto de partida)
        const left = 1058 - (lead + textInk) / 2;

        const mark = titleParts.art
            ? `<g transform="translate(${(left - 2.6).toFixed(1)},676.6) scale(0.875)">${titleParts.art}</g>`
            : star(left - 14, 689, 8, "#d6b4ff", 0.9);

        titleSvg = mark + txt(left + lead - 1.5, 698, title, size, "#c9a5ef", 500);

    } else {
        titleSvg = txt(1058, 697, "Sem título equipado", 20, "#8f78c4", 500, 'text-anchor="middle"');
    }

    // ======================================
    // SVG DO PERFIL
    // ======================================

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">

        <defs>
            <!-- fundo da moldura: um degradê que clareia para a esquerda, embaixo, e um brilho por cima -->
            <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="59" y1="1383" x2="2085" y2="611">
                <stop offset="0" stop-color="#2e1148"/>
                <stop offset="0.5" stop-color="#150c30"/>
                <stop offset="1" stop-color="#100729"/>
            </linearGradient>

            <radialGradient id="bgGlow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(838 664) scale(1088 588)">
                <stop offset="0" stop-color="#53166e" stop-opacity=".32"/>
                <stop offset="0.6" stop-color="#53166e" stop-opacity=".14"/>
                <stop offset="1" stop-color="#53166e" stop-opacity="0"/>
            </radialGradient>

            <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(1000 288) scale(782 493)">
                <stop offset="0" stop-color="#562477"/>
                <stop offset="0.51" stop-color="#341451"/>
                <stop offset="1" stop-color="#1b0b36"/>
            </radialGradient>

            <linearGradient id="rim" gradientUnits="userSpaceOnUse" x1="0" y1="296" x2="0" y2="698">
                <stop offset="0" stop-color="#c9a0ff"/>
                <stop offset="1" stop-color="#b878ff"/>
            </linearGradient>

            <clipPath id="hero">
                <rect x="210" y="25" width="1366" height="711" rx="30"/>
            </clipPath>

            <clipPath id="pentagon">
                <polygon points="${pentagonPoints}"/>
            </clipPath>
        </defs>

        <!-- MOLDURA -->

        <rect x="8" y="8" width="1584" height="1184" rx="44" fill="#0d0821" stroke="#9b59f4" stroke-width="8"/>
        <rect x="20" y="20" width="1560" height="1160" rx="34" fill="url(#bg)" stroke="#d0a0ff" stroke-width="2"/>
        <rect x="21" y="21" width="1558" height="1158" rx="33" fill="url(#bgGlow)"/>

        <!-- PAINEL PRINCIPAL -->

        <rect x="210" y="25" width="1366" height="711" rx="30" fill="url(#glow)" stroke="${BORDER}" stroke-width="2"/>

        <g clip-path="url(#hero)">
            ${STARS.map(([x, y, size, color]) => star(x, y, size, color, 1)).join("")}

            <!-- faixa do nome -->
            <rect x="210" y="583" width="1366" height="153" fill="#0d0820" opacity=".55"/>
            <rect x="210" y="582" width="1366" height="2" fill="${BORDER}"/>
        </g>

        <!-- NOME E TÍTULO -->

        ${richText(1058, 654, name, nameFiles, nameSize, "#ffffff", 700, { middle: true })}

        ${titleSvg}

        ${data.isOwner
            ? icon("crown", 1445.5, 701.5, 0.35, "#f3ca71") +
              txt(1476, 706, "DEV", 17, "#f3ca71", 700)
            : ""}

        <!-- AVATAR EM PENTÁGONO -->

        <polygon points="${pentagonPoints}" fill="#2a1a55" stroke="url(#rim)" stroke-width="9" stroke-linejoin="round"/>

        ${avatar
            ? `<image href="${avatar}" x="${424.5 - 205}" y="${499 - 205}" width="410" height="410" preserveAspectRatio="xMidYMid slice" clip-path="url(#pentagon)"/>`
            : `<g clip-path="url(#pentagon)">
                   <rect x="224" y="296" width="402" height="402" fill="#4a2c85"/>
                   ${star(425, 480, 90, "#c9a6ff", 0.9)}
               </g>`}

        <!-- ESTADO CIVIL (chip no canto) -->

        <path d="M210,25 H780 V114 a24,24 0 0 1 -24,24 H210 Z" fill="#200f3c"/>
        <path d="M780,25 V114 a24,24 0 0 1 -24,24 H211" fill="none" stroke="#a65bf3" stroke-width="2"/>

        <circle cx="278" cy="82" r="38" fill="${married ? "#d83391" : "#43336f"}"/>
        ${icon("heart", 278, 83.5, 1.03, "#ffffff", married)}

        ${txt(337, 79, married ? "Casado(a)" : "Solteiro(a)", 32, "#ffffff", 700)}
        ${richText(337, 111, married ? short(spouse || "—", 24) : "sem cônjuge", spouseFiles, 18, "#d7b9f7", 500)}

        <!-- ANEL DO NÍVEL -->

        <circle cx="1430" cy="148" r="104" fill="#170c32" stroke="#512b91" stroke-width="8"/>
        <circle cx="1430" cy="148" r="81" fill="none" stroke="#38215f" stroke-width="12"/>
        ${arc(1430, 148, 81, arcRatio)}

        ${txt(1430, 111, "LEVEL", 22, "#ddc6fa", 700, 'text-anchor="middle"')}
        ${txt(1430, 165, String(level), 55, "#ffffff", 700, 'text-anchor="middle"')}
        ${txt(1430, 197, `${percent}%`, 22, "#d9c0f5", 500, 'text-anchor="middle"')}

        <!-- LATERAL -->

        <rect x="25" y="25" width="175" height="1151" rx="26" fill="#160d36" stroke="${BORDER}" stroke-width="2"/>

        ${icon("crown", 112, 81.5, 1, LILAC)}
        ${txt(112, 158, "RANK", 24, "#d1b4ff", 700, 'text-anchor="middle"')}
        ${txt(112, 219, rank, rank.length > 3 ? 32 : 42, "#ffffff", 700, 'text-anchor="middle"')}
        <rect x="48" y="259" width="129" height="2" fill="#432469"/>

        ${txt(112, 1039, "Helena", 20, "#c5a2ef", 700, 'text-anchor="middle"')}
        ${star(112, 1140, 18, "#b36bff", 0.95)}

        <!-- BIO -->

        <rect x="225" y="778" width="385" height="330" rx="19" fill="#1a1036" stroke="#7141b5" stroke-width="2"/>
        ${txt(258, 823, "Bio", 23, "#c696ff", 700)}
        <rect x="258" y="845" width="319" height="2" fill="#432469"/>

        ${bioLines.map((line, index) => richText(
            258,
            891 + index * 32,
            line,
            bioFiles,
            21,
            bioRich.text ? "#e0cef5" : "#8f78c4",
            400,
            { italic: true }
        )).join("")}

        <!-- DADOS -->

        ${pill({
            x: 662, y: 778, color: "#a855f7", label: "BANCO",
            value: money(data.bank),
            glyph: (x, y) => icon("bank", x, y + 1.5, [0.86, 0.79])
        })}

        ${pill({
            x: 1110, y: 778, color: "#d442db", label: "GEMAS",
            value: Number(data.gems || 0).toLocaleString("pt-BR"),
            glyph: (x, y) => icon("gem", x, y, 0.73, "#d442db")
        })}

        ${pill({
            x: 662, y: 890, color: "#ed5ca8", label: "CARTEIRA",
            value: money(data.wallet),
            glyph: (x, y) => icon("wallet", x, y + 2, [0.82, 0.89], "#ed5ca8")
        })}

        ${pill({
            x: 1110, y: 890, color: "#2bbfae", label: "ARMA EQUIPADA",
            value: weapon,
            detail: damage ? `Dano ${damage}` : "",
            glyph: (x, y) => icon("gun", x, y, [0.83, 0.835])
        })}

        ${pill({
            x: 886, y: 1002, color: "#e9a02e", label: "EMPREGO ATUAL",
            value: plain(data.job) || "Desempregado(a)",
            glyph: (x, y) => icon("briefcase", x, y + 0.5, [0.857, 0.884], "#e9a02e")
        })}

    </svg>
    `;

    return svg;
}

// ==========================================
// CONVERSÃO SVG -> PNG
// ==========================================

export async function renderProfileCard(data = {}) {
    const svg = await profileSvg(data);

    return sharp(
        Buffer.from(svg)
    )
        .png()
        .toBuffer();
}

// O Poppins foi achado de verdade? Desenha a mesma palavra com ele e com uma
// família que não existe: se saírem iguais, o sistema usou a fonte reserva nos dois.
// Serve para o log de inicialização avisar, em vez de o cartão sair com outra fonte
// sem ninguém perceber.
export async function cardFontAvailable() {
    const draw = family => sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="90"><text x="8" y="64" font-family="${family}" font-size="56" font-weight="700">Hamburgefons</text></svg>`
    )).raw().toBuffer();

    const [poppins, missing] = await Promise.all([
        draw("Poppins"),
        draw("Helena Fonte Inexistente")
    ]);

    return !poppins.equals(missing);
}
