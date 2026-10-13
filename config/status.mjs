import { SITE_LABEL } from "./site.mjs";

export const STATUS_CONFIG = Object.freeze({
    interval: 60_000,

    clusterId: 1,

    // O endereço do site, como aparece na atividade (vem de config/site.mjs).
    site: SITE_LABEL,

    helpCommand: "hajuda",

    maxActivityLength: 64
});