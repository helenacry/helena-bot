
// Primeiro: põe as Poppins do projeto à vista do fontconfig, antes de o sharp
// desenhar qualquer texto.
import "./card-fonts.mjs";

import sharp from "sharp";

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

const LILAC = "#b97cff";
const BORDER = "#7d4fe0";

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

// O SVG não desenha emoji colorido: tira os emojis do texto (o título
// equipado costuma começar com um) e deixa só as letras. Sai tudo que forma
// um emoji, não só a figura: teclas (1️⃣), bandeiras (duas letras regionais),
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

export function plain(value) {
    return String(value ?? "")
        .replace(EMOJI, "")
        .replace(/\s+/g, " ")
        .replace(/\p{Cc}/gu, "")
        .trim();
}

// Quebra o texto em linhas de até "max" caracteres, sem cortar palavras
// (palavra maior que a linha é partida). Passando de "maxLines", termina
// com reticências.
export function wrap(text, max, maxLines) {
    const lines = [];
    let line = "";

    for (const piece of String(text ?? "").split(/\s+/).filter(Boolean)) {
        let letters = chars(piece);

        while (letters.length > max) {
            if (line) {
                lines.push(line);
                line = "";
            }

            lines.push(letters.slice(0, max).join(""));
            letters = letters.slice(max);
        }

        const word = letters.join("");

        if (!line) {
            line = word;
        } else if (chars(line + " " + word).length <= max) {
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

        kept[maxLines - 1] = short(kept[maxLines - 1] + "…", max);

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

// ==========================================
// FORMAS E ÍCONES
// ==========================================

// Estrela de quatro pontas, com as laterais curvas para dentro.
function star(x, y, size, color = "#9f7be3", opacity = 0.5) {
    const k = size * 0.14;

    return `<path d="M${x},${y - size} Q${x + k},${y - k} ${x + size},${y} Q${x + k},${y + k} ${x},${y + size} Q${x - k},${y + k} ${x - size},${y} Q${x - k},${y - k} ${x},${y - size} Z" fill="${color}" opacity="${opacity}"/>`;
}

// Pentágono regular com uma ponta para cima.
function pentagon(cx, cy, radius) {
    return [-90, -18, 54, 126, 198]
        .map(degrees => {
            const angle = degrees * Math.PI / 180;

            return [
                (cx + radius * Math.cos(angle)).toFixed(1),
                (cy + radius * Math.sin(angle)).toFixed(1)
            ].join(",");
        })
        .join(" ");
}

// Arco do anel de nível: começa no topo e anda no sentido horário.
function arc(cx, cy, radius, ratio) {
    if (ratio >= 0.999) {
        return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#bb86ff" stroke-width="18"/>`;
    }

    const angle = (-90 + 360 * ratio) * Math.PI / 180;

    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    return `<path d="M${cx},${cy - radius} A${radius},${radius} 0 ${ratio > 0.5 ? 1 : 0} 1 ${x.toFixed(1)},${y.toFixed(1)}" fill="none" stroke="#bb86ff" stroke-width="18" stroke-linecap="round"/>`;
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

    crown: color => `
        <path fill="${color}" d="M-26,18 L-31,-14 L-14,2 L0,-24 L14,2 L31,-14 L26,18 Z"/>
        <rect fill="${color}" x="-26" y="22" width="52" height="7" rx="3"/>`,

    heart: (color, filled = true) => `
        <path fill="${filled ? color : "none"}" stroke="${color}" stroke-width="${filled ? 0 : 4}" d="M0,16 C-30,-6 -16,-26 0,-9 C16,-26 30,-6 0,16 Z"/>`
};

function icon(name, x, y, scale, ...args) {
    return `<g transform="translate(${x},${y}) scale(${scale})">${ICONS[name](...args)}</g>`;
}

// ==========================================
// CARTÃO DE DADO (pílula)
// ==========================================

function pill({ x, y, color, glyph, label, value, detail = "" }) {
    const long = String(value).length > 13;

    return `
        <rect x="${x}" y="${y}" width="432" height="94" rx="47" fill="#1e1541" stroke="${BORDER}" stroke-width="2"/>
        <circle cx="${x + 48}" cy="${y + 47}" r="36" fill="${color}"/>
        ${glyph(x + 48, y + 47)}
        ${txt(x + 100, y + 38, label, 18, "#b9a6e6", 600, 'letter-spacing="1.2"')}
        ${txt(x + 100, y + 73, short(value, 22), long ? 27 : 34, "#ffffff", 800)}
        ${detail ? txt(x + 404, y + 73, detail, 21, "#cdb2f7", 600, 'text-anchor="end"') : ""}
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
// DECORAÇÃO
// ==========================================

// [x, y, tamanho, opacidade]
const STARS = [
    [930, 104, 21, 0.55], [708, 180, 25, 0.55], [360, 153, 14, 0.5],
    [1197, 125, 11, 0.5], [445, 260, 21, 0.45], [1092, 239, 19, 0.5],
    [842, 275, 14, 0.5], [1328, 286, 21, 0.5], [689, 425, 14, 0.45],
    [1170, 419, 14, 0.5], [880, 492, 21, 0.5], [1412, 506, 25, 0.5],
    [582, 92, 9, 0.3], [1511, 232, 13, 0.7]
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

    // No 0% o anel ainda mostra um tracinho, como no desenho.
    const arcRatio = ratio > 0 ? ratio : 0.02;

    const avatar = await imageData(
        data.avatarUrl,
        data.avatarBuffer
    );

    // Identidade
    const name = short(plain(data.name) || "Jogador", 20);

    const nameLength = chars(name).length;

    const nameSize = nameLength <= 12
        ? 58
        : Math.max(34, 58 - (nameLength - 12) * 3);

    const title = plain(data.title);

    const bio = plain(data.bio) || "Nenhuma bio definida.";

    const bioLines = wrap(bio, 27, 7);

    // Só emoji no nome da pessoa: sobra "" e o cartão mostra o traço.
    const spouseName = plain(String(data.spouseName ?? "").replace(/^@+/, ""));

    const spouse = spouseName ? "@" + spouseName : "";

    const married = Boolean(data.married);

    const rank = Number.isFinite(Number(data.rank)) && Number(data.rank) > 0
        ? String(Math.trunc(Number(data.rank)))
        : "—";

    // Dano da arma, à direita do cartão (aceita o texto antigo "Dano: N").
    const damage =
        data.weaponDamage ??
        /Dano:\s*(\d+)/.exec(String(data.weaponDetail ?? ""))?.[1];

    const weapon = plain(data.weapon) || "Nenhuma";

    const pentagonPoints = pentagon(425, 497, 201);

    // ======================================
    // SVG DO PERFIL
    // ======================================

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">

        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#21123f"/>
                <stop offset="1" stop-color="#110c27"/>
            </linearGradient>

            <radialGradient id="glow" cx="0.63" cy="0.38" r="0.75">
                <stop offset="0" stop-color="#5f2b8f"/>
                <stop offset="0.55" stop-color="#341659"/>
                <stop offset="1" stop-color="#1b0f3b"/>
            </radialGradient>

            <clipPath id="hero">
                <rect x="210" y="24" width="1366" height="712" rx="44"/>
            </clipPath>

            <clipPath id="pentagon">
                <polygon points="${pentagonPoints}"/>
            </clipPath>
        </defs>

        <!-- MOLDURA -->

        <rect x="6" y="6" width="1588" height="1188" rx="70" fill="url(#bg)" stroke="#a66cf5" stroke-width="10"/>
        <rect x="20" y="20" width="1560" height="1160" rx="58" fill="none" stroke="#6b3fc4" stroke-width="2" opacity=".6"/>

        <!-- PAINEL PRINCIPAL -->

        <rect x="210" y="24" width="1366" height="712" rx="44" fill="url(#glow)" stroke="${BORDER}" stroke-width="2"/>

        <g clip-path="url(#hero)">
            ${STARS.map(([x, y, size, opacity]) => star(x, y, size, "#a98aea", opacity)).join("")}

            <!-- faixa do nome -->
            <rect x="210" y="583" width="1366" height="153" fill="#0d0820" opacity=".55"/>
            <rect x="210" y="582" width="1366" height="2" fill="${BORDER}"/>
        </g>

        <!-- NOME E TÍTULO -->

        ${txt(1060, 656, name, nameSize, "#ffffff", 800, 'text-anchor="middle"')}

        ${title
            ? star(1060 - chars(short(title, 30)).length * 8.1 - 26, 690, 8, "#d6b4ff", 0.9) +
              txt(1060, 698, short(title, 30), 24, "#d6b4ff", 600, 'text-anchor="middle"')
            : txt(1060, 698, "Sem título equipado", 22, "#8f78c4", 500, 'text-anchor="middle"')}

        ${data.isOwner
            ? icon("crown", 1446, 700, 0.42, "#f5c66d") +
              txt(1472, 708, "DEV", 22, "#f5c66d", 800)
            : ""}

        <!-- AVATAR EM PENTÁGONO -->

        <polygon points="${pentagonPoints}" fill="#2a1a55" stroke="#c9a6ff" stroke-width="16" stroke-linejoin="round"/>

        ${avatar
            ? `<image href="${avatar}" x="${425 - 201}" y="${497 - 201}" width="402" height="402" preserveAspectRatio="xMidYMid slice" clip-path="url(#pentagon)"/>`
            : `<g clip-path="url(#pentagon)">
                   <rect x="224" y="296" width="402" height="402" fill="#4a2c85"/>
                   ${star(425, 480, 90, "#c9a6ff", 0.9)}
               </g>`}

        <!-- ESTADO CIVIL (chip no canto) -->

        <path d="M212,26 H780 V106 a32,32 0 0 1 -32,32 H212 Z" fill="#1b1237" stroke="#8a5cf0" stroke-width="2"/>

        <circle cx="278" cy="82" r="38" fill="${married ? "#d92f8c" : "#43336f"}"/>
        ${icon("heart", 278, 83, 0.9, "#ffffff", married)}

        ${txt(337, 80, married ? "Casado(a)" : "Solteiro(a)", 36, "#ffffff", 700)}
        ${txt(337, 112, married ? short(spouse || "—", 24) : "sem cônjuge", 21, "#b5a2e0", 500)}

        <!-- ANEL DO NÍVEL -->

        <circle cx="1430" cy="148" r="104" fill="#1c1238" stroke="#6a3fd1" stroke-width="8"/>
        <circle cx="1430" cy="148" r="80" fill="none" stroke="#33206b" stroke-width="18"/>
        ${arc(1430, 148, 80, arcRatio)}

        ${txt(1430, 112, "LEVEL", 22, "#eadfff", 700, 'text-anchor="middle" letter-spacing="1.5"')}
        ${txt(1430, 176, String(level), 66, "#ffffff", 800, 'text-anchor="middle"')}
        ${txt(1430, 203, `${percent}%`, 22, "#d3c0f7", 600, 'text-anchor="middle"')}

        <!-- LATERAL -->

        <rect x="24" y="24" width="176" height="1152" rx="40" fill="#140e2b" stroke="${BORDER}" stroke-width="2"/>

        ${icon("crown", 112, 84, 0.92, LILAC)}
        ${txt(112, 152, "RANK", 27, "#c5a3ff", 700, 'text-anchor="middle" letter-spacing="1"')}
        ${txt(112, 222, rank, rank.length > 3 ? 40 : 54, "#ffffff", 800, 'text-anchor="middle"')}
        <rect x="48" y="262" width="129" height="2" fill="#382865"/>

        ${txt(112, 1040, "Helena", 24, "#b58cff", 700, 'text-anchor="middle"')}
        ${star(112, 1140, 18, "#b36bff", 0.95)}

        <!-- BIO -->

        <rect x="225" y="778" width="385" height="330" rx="28" fill="#1a1236" stroke="${BORDER}" stroke-width="2"/>
        ${txt(258, 826, "Bio", 28, LILAC, 700)}
        <rect x="258" y="846" width="319" height="2" fill="#3b2a6b"/>

        ${bioLines.map((line, index) => txt(
            258,
            892 + index * 33,
            line,
            22,
            data.bio ? "#e7dcfc" : "#8f78c4",
            400,
            'font-style="italic"'
        )).join("")}

        <!-- DADOS -->

        ${pill({
            x: 662, y: 778, color: "#a24cf0", label: "BANCO",
            value: money(data.bank),
            glyph: (x, y) => icon("bank", x, y, 0.95)
        })}

        ${pill({
            x: 1110, y: 778, color: "#d63fe2", label: "GEMAS",
            value: Number(data.gems || 0).toLocaleString("pt-BR"),
            glyph: (x, y) => icon("gem", x, y, 0.95, "#d63fe2")
        })}

        ${pill({
            x: 662, y: 890, color: "#ee5aa6", label: "CARTEIRA",
            value: money(data.wallet),
            glyph: (x, y) => icon("wallet", x, y, 0.95, "#ee5aa6")
        })}

        ${pill({
            x: 1110, y: 890, color: "#22c3a6", label: "ARMA EQUIPADA",
            value: weapon,
            detail: damage ? `Dano ${damage}` : "",
            glyph: (x, y) => icon("gun", x, y, 0.95)
        })}

        ${pill({
            x: 886, y: 1002, color: "#f2a21c", label: "EMPREGO ATUAL",
            value: plain(data.job) || "Desempregado(a)",
            glyph: (x, y) => icon("briefcase", x, y, 0.95, "#f2a21c")
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
