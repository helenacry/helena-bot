
// ==========================================
// FAIXAS DE IP DA CLOUDFLARE
// ==========================================

// Atrás da Cloudflare (HELENA_WEB_TRUST_PROXY=cloudflare), o IP do visitante vem no cabeçalho
// CF-Connecting-IP. Esse cabeçalho só merece confiança se o pedido veio MESMO da Cloudflare: quem
// alcançasse o app por outro caminho escreveria o que quisesse nele e escaparia dos limites por IP.
// A prova é o endereço de quem falou com o proxy da hospedagem, que o visitante não consegue forjar:
// se ele está nestas faixas, o pedido passou pela Cloudflare (services/web/cloudflare.mjs).
//
// Lista oficial, em https://www.cloudflare.com/ips-v4/ e https://www.cloudflare.com/ips-v6/
// (conferida em 29/10/2026; muda muito raramente). Uma faixa nova que ainda não esteja aqui não derruba
// nada: o pedido só passa a valer pelo endereço de quem chegou, e o log avisa. Para acrescentar faixas
// sem mexer no código, use HELENA_WEB_CLOUDFLARE_IPS.
export const CLOUDFLARE_RANGES = Object.freeze([
    // IPv4
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",

    // IPv6
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32"
]);
