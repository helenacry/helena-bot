import net from "node:net";

import { CLOUDFLARE_RANGES } from "../../config/cloudflare-ips.mjs";

// ==========================================
// DE ONDE O PEDIDO VEIO (CLOUDFLARE)
// ==========================================

// "203.0.113.0/24" -> { address, prefix, family }, ou null se não for uma faixa válida.
export function parseRange(text) {
    const [address, prefix, extra] = String(text ?? "").trim().split("/");

    const family = net.isIP(address ?? "");

    if (!family || extra !== undefined || !/^\d{1,3}$/.test(prefix ?? "")) {
        return null;
    }

    const bits = Number(prefix);

    return bits <= (family === 4 ? 32 : 128)
        ? { address, prefix: bits, family: family === 4 ? "ipv4" : "ipv6" }
        : null;
}

// Aceita o endereço como o Node o entrega: IPv6 com colchetes, com zona ("fe80::1%eth0") ou IPv4
// "mapeado" ("::ffff:172.69.1.1", que vale o IPv4 dentro dele). Devolve { address, family } ou null.
function normalize(value) {
    let address = String(value ?? "").trim();

    if (address.startsWith("[") && address.includes("]")) {
        address = address.slice(1, address.indexOf("]"));
    }

    address = address.split("%")[0];

    const family = net.isIP(address);

    return family ? { address, family: family === 4 ? "ipv4" : "ipv6" } : null;
}

// Um verificador "este endereço é da Cloudflare?". "extra" são faixas a mais (HELENA_WEB_CLOUDFLARE_IPS);
// as inválidas são ignoradas aqui (quem monta a configuração já avisou).
export function createCloudflareMatcher(extra = []) {
    const list = new net.BlockList();

    for (const text of [...CLOUDFLARE_RANGES, ...extra]) {
        const range = parseRange(text);

        if (range) {
            list.addSubnet(range.address, range.prefix, range.family);
        }
    }

    return value => {
        const ip = normalize(value);

        return ip !== null && list.check(ip.address, ip.family);
    };
}

// O endereço da própria máquina: quem fala por aqui só pode ser algo instalado nela (um túnel da
// Cloudflare, por exemplo), nunca um visitante da internet.
export function isLoopback(value) {
    const ip = normalize(value);

    if (ip === null) {
        return false;
    }

    return ip.family === "ipv4"
        ? ip.address.startsWith("127.")
        : ip.address === "::1" || /^::ffff:127\./i.test(ip.address);
}

// Separa o que a pessoa escreveu em HELENA_WEB_CLOUDFLARE_IPS: { ranges, invalid }.
export function parseExtraRanges(value) {
    const ranges = [];
    const invalid = [];

    for (const item of String(value ?? "").split(",").map(part => part.trim()).filter(Boolean)) {
        (parseRange(item) ? ranges : invalid).push(item);
    }

    return { ranges, invalid };
}
