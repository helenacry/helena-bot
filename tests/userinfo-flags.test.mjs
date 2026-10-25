import test from "node:test";
import assert from "node:assert/strict";

import "./helpers.mjs";

const {
    BADGES, BADGE_IDS, BOOST_MONTHS, getUserBadges, getAccountNotes, nitroSigns, boostLadder
} = await import("../services/social/userinfo-badges.mjs");

const { buildUserinfoEmbed, buildUserinfoDetail, detailOptions } = await import("../services/social/userinfo-view.mjs");
const { normalizeUser, normalizeMember } = await import("../services/discord/normalize.mjs");
const { ICONS, fallbacksOf } = await import("../config/icons.mjs");

const DAY = 86_400_000;

// As informações do cartão por nome: a menção (uma linha da descrição) e os campos, como { "🏷️ Tag": valor }.
const infoOf = embed => Object.fromEntries(
    [
        ...String(embed.description ?? "")
            .split("\n")
            .map(line => line.match(/^(\S+) \*\*(.+?):\*\* (.*)$/))
            .filter(Boolean)
            .map(match => [`${match[1]} ${match[2]}`, match[3]]),
        ...(embed.fields ?? []).map(field => [field.name, field.value])
    ]
);

// ==========================================
// AS FLAGS DO DISCORD (a tabela de flags.lewisakura.moe)
// ==========================================

// o bit de cada insígnia de perfil, como o Discord documenta
const DOCUMENTED = {
    STAFF: 0,
    PARTNER: 1,
    HYPESQUAD_EVENTS: 2,
    BUG_HUNTER_LEVEL_1: 3,
    HOUSE_BRAVERY: 6,
    HOUSE_BRILLIANCE: 7,
    HOUSE_BALANCE: 8,
    EARLY_SUPPORTER: 9,
    BUG_HUNTER_LEVEL_2: 14,
    VERIFIED_BOT: 16,
    VERIFIED_DEVELOPER: 17,
    CERTIFIED_MODERATOR: 18,
    ACTIVE_DEVELOPER: 22
};

test("cada insígnia está no bit que o Discord documenta, e nenhuma falta", () => {
    for (const [id, number] of Object.entries(DOCUMENTED)) {
        const badge = BADGES.find(item => item.id === id);

        assert.ok(badge, `falta ${id}`);
        assert.equal(badge.bit, 1n << BigInt(number), `${id} no bit ${number}`);
    }

    assert.equal(BADGES.length, Object.keys(DOCUMENTED).length);
    assert.deepEqual([...BADGE_IDS].sort(), [...Object.keys(DOCUMENTED), "BOOSTER"].sort());
});

test("com todos os bits ligados, todas as insígnias aparecem, cada uma com nome e explicação", () => {
    const flags = Object.values(DOCUMENTED).reduce((sum, number) => sum + 2 ** number, 0);

    const badges = getUserBadges({ publicFlags: flags });

    assert.equal(badges.length, BADGES.length);

    for (const badge of badges) {
        assert.ok(badge.name.length > 3 && badge.about.endsWith("."), badge.id);
    }
});

test("os emblemas são os emojis comuns do Discord: nenhum tem desenho próprio da Helena e nenhum se repete", () => {
    const names = Object.keys(ICONS);

    const used = new Set();

    for (const badge of BADGES) {
        used.add(badge.emoji);

        const owners = names.filter(name => fallbacksOf(name).includes(badge.emoji));

        assert.deepEqual(owners, [], `${badge.id} (${badge.emoji}) seria trocado por um desenho da Helena: ${owners}`);
    }

    assert.equal(used.size, BADGES.length, "dois selos com o mesmo emoji");

    // o do impulso (💠) e o do Nitro (🌀) também ficam como são: o 💎 e o 🚀 têm desenho no catálogo
    for (const emoji of ["💠", "🌀"]) {
        assert.deepEqual(names.filter(name => fallbacksOf(name).includes(emoji)), [], emoji);
    }

    assert.ok(!names.some(name => /^(badge_|nitro|boost_)/.test(name)), "sem desenhos de emblemas no catálogo");
});

test("bits acima de 31 não quebram nada: o & de 32 bits do JavaScript não os enxerga, a conta é em BigInt", () => {
    // PREMIUM_DISCRIMINATOR (1 << 37) junto de STAFF (1 << 0): o número passa de 2^32
    const flags = 2 ** 37 + 1;

    assert.ok(flags > 2 ** 32);

    assert.deepEqual(getUserBadges({ publicFlags: flags }).map(badge => badge.id), ["STAFF"]);
    assert.equal(nitroSigns({ publicFlags: flags }).state, "possible");

    // quarentena (bit 44) e colaborador (bit 50)
    assert.deepEqual(
        getAccountNotes({ flags: 2 ** 44 + 2 ** 50 }).map(note => note.id),
        ["QUARANTINED", "COLLABORATOR"]
    );

    // flags absurdas ou vazias viram "nenhuma", não erro
    for (const junk of [undefined, null, "x", NaN, -1, 1.5]) {
        assert.doesNotThrow(() => getUserBadges({ publicFlags: junk }), String(junk));
    }

    assert.deepEqual(getUserBadges({}), []);
    assert.deepEqual(getUserBadges(null), []);
});

test("as flags públicas e as completas valem juntas, e os avisos da conta aparecem à parte", () => {
    const user = { publicFlags: 1 << 2, flags: (1 << 3) | (1 << 20) | (1 << 12) };

    assert.deepEqual(getUserBadges(user).map(badge => badge.id), ["HYPESQUAD_EVENTS", "BUG_HUNTER_LEVEL_1"]);
    assert.deepEqual(getAccountNotes(user).map(note => note.id), ["SYSTEM", "SPAMMER"]);
});

test("a API entrega as flags e a etiqueta de servidor, e o normalizador as guarda", () => {
    const user = normalizeUser({
        id: "1", username: "ana", avatar: "a_abc", public_flags: 4, flags: 4 + 2 ** 37,
        primary_guild: { tag: "HLN", identity_guild_id: "99", identity_enabled: true }
    });

    assert.equal(user.avatarHash, "a_abc");
    assert.equal(user.publicFlags, 4);
    assert.equal(user.flags, 4 + 2 ** 37);
    assert.deepEqual(user.primaryGuild, { tag: "HLN", guildId: "99" });

    const member = normalizeMember({ avatar: "g_1", banner: "g_2", premium_since: "2026-01-01T00:00:00Z" });

    assert.equal(member.guildAvatarHash, "g_1");
    assert.equal(member.guildBannerHash, "g_2");
});

// ==========================================
// NITRO
// ==========================================

test("Nitro: avatar animado, banner e perfil por servidor são sinais fortes; sem eles, não detectado", () => {
    assert.deepEqual(nitroSigns({}), { state: "none", signs: [] });
    assert.deepEqual(nitroSigns({ avatarHash: "abc" }), { state: "none", signs: [] }, "avatar parado não prova nada");

    assert.deepEqual(nitroSigns({ avatarHash: "a_abc" }), { state: "likely", signs: ["avatar animado"] });
    assert.deepEqual(nitroSigns({ bannerHash: "b1" }), { state: "likely", signs: ["banner no perfil"] });
    assert.deepEqual(nitroSigns({ bannerUrl: "https://x.test/b.png" }), { state: "likely", signs: ["banner no perfil"] });

    assert.deepEqual(
        nitroSigns({ guildAvatarHash: "g", guildBannerHash: "h" }),
        { state: "likely", signs: ["avatar só deste servidor", "banner só deste servidor"] }
    );

    // impulsionar o servidor não é prova de Nitro (qualquer pessoa pode comprar um impulso)
    assert.equal(nitroSigns({ boostingSince: Date.now() }).state, "none");
});

test("Nitro no cartão: a linha diz 'provável' com os sinais e some quando não há sinal (a API não prova a falta)", () => {
    const base = { id: "1", username: "ana", displayName: "Ana", createdAt: 0 };

    assert.equal(infoOf(buildUserinfoEmbed({ user: base }))["🌀 Nitro"], undefined, "sem sinal, o cartão não afirma nada");

    assert.equal(
        infoOf(buildUserinfoEmbed({ user: { ...base, avatarHash: "a_1", bannerUrl: "https://x.test/b.png" } }))["🌀 Nitro"],
        "**Provável** (avatar animado, banner no perfil)"
    );
});

test("a tela de Nitro e impulso explica o que a API não entrega", () => {
    const detail = buildUserinfoDetail("nitro", { id: "1", username: "ana", displayName: "Ana", avatarHash: "a_1" });

    assert.match(detail.title, /Nitro e impulso de Ana/);
    assert.match(detail.fields[0].value, /\*\*Provável\*\* \(avatar animado\)/);
    assert.match(detail.fields[0].value, /só conta a assinatura do Nitro ao próprio dono da conta/);
    assert.equal(detail.fields[1].value, "Não impulsiona nenhum servidor onde a Helena está.");
});

// ==========================================
// INSÍGNIA DE IMPULSO
// ==========================================

const SINCE = Date.UTC(2026, 0, 15, 12, 0, 0);

test("a escada de impulso tem 9 níveis, nos meses em que o Discord troca a insígnia", () => {
    assert.deepEqual([...BOOST_MONTHS], [1, 2, 3, 6, 9, 12, 15, 18, 24]);
});

test("impulso: o nível sobe no dia do aniversário do mês, e o próximo diz quantos dias faltam", () => {
    // 20 dias depois: ainda sem insígnia (falta 1 mês)
    const fresh = boostLadder(SINCE, SINCE + 20 * DAY);

    assert.equal(fresh.level, 0);
    assert.equal(fresh.months, 0);
    assert.deepEqual({ level: fresh.next.level, months: fresh.next.months }, { level: 1, months: 1 });
    assert.equal(fresh.next.at, Date.UTC(2026, 1, 15, 12, 0, 0));
    assert.equal(fresh.next.days, 11);

    // no instante exato de 1 mês: nível 1; faltam 2 meses (nível 2)
    const one = boostLadder(SINCE, Date.UTC(2026, 1, 15, 12, 0, 0));

    assert.equal(one.level, 1);
    assert.equal(one.next.level, 2);

    // 1 segundo antes: ainda 0
    assert.equal(boostLadder(SINCE, Date.UTC(2026, 1, 15, 11, 59, 59)).level, 0);

    // 7 meses cheios: nível 4 (6 meses), e o próximo é o de 9 meses
    const seven = boostLadder(SINCE, Date.UTC(2026, 7, 20, 0, 0, 0));

    assert.equal(seven.months, 7);
    assert.equal(seven.level, 4);
    assert.deepEqual({ level: seven.next.level, months: seven.next.months }, { level: 5, months: 9 });
    assert.equal(seven.next.at, Date.UTC(2026, 9, 15, 12, 0, 0));
});

test("impulso: com 24 meses ou mais é o nível máximo e não há próximo; sem impulso, não há escada", () => {
    const max = boostLadder(SINCE, Date.UTC(2028, 5, 1));

    assert.equal(max.level, 9);
    assert.equal(max.levels, 9);
    assert.equal(max.next, null);
    assert.ok(max.steps.every(step => step.reached));

    assert.equal(boostLadder(null), null);
    assert.equal(boostLadder(0), null);
    assert.equal(boostLadder("x"), null);
});

test("impulso: começar no dia 31 não estoura o fim dos meses curtos", () => {
    const since = Date.UTC(2026, 0, 31, 8, 0, 0);

    const ladder = boostLadder(since, Date.UTC(2026, 2, 1, 0, 0, 0));

    // 1 mês depois do dia 31 de janeiro é o último dia de fevereiro
    assert.equal(ladder.steps[0].at, Date.UTC(2026, 1, 28, 8, 0, 0));
    assert.equal(ladder.level, 1);
});

test("o cartão de quem impulsiona mostra desde quando, a insígnia de agora e a próxima; a tela de Nitro lista os 9 degraus", () => {
    const now = Date.UTC(2026, 7, 20, 0, 0, 0);

    const user = { id: "1", username: "ana", displayName: "Ana", createdAt: 0, boostingSince: SINCE };

    const card = buildUserinfoEmbed({ user, now });

    const info = infoOf(card);

    assert.match(info["🚀 Impulsionando desde"], /15 de janeiro de 2026/);

    // a insígnia de agora e a próxima: o emblema | quanto tempo, e o emblema | quando chega
    assert.equal(info["🏅 Insígnia de impulso atual"], "💠 | **7 meses 4 dias 12 horas**");
    assert.equal(info["▶️ Próxima insígnia de impulso"], "💠 | em **1 mês 25 dias 12 horas**");

    // e ficam juntas, nessa ordem, logo depois do impulso
    const keys = Object.keys(info);

    assert.deepEqual(keys.slice(keys.indexOf("🚀 Impulsionando desde")), [
        "🚀 Impulsionando desde", "🏅 Insígnia de impulso atual", "▶️ Próxima insígnia de impulso"
    ]);

    const detail = buildUserinfoDetail("nitro", user, now);

    const ladder = detail.fields.find(item => item.name.includes("Níveis"));

    const lines = ladder.value.split("\n").filter(line => line.startsWith("💠"));

    assert.equal(lines.length, 9);
    assert.equal(lines.filter(line => line.endsWith("✅")).length, 4, "4 degraus já alcançados");
    assert.match(lines[0], /^💠 \*\*Nível 1\*\* · 1 mês · <t:\d+:D> ✅$/);
    assert.match(lines[8], /^💠 \*\*Nível 9\*\* · 24 meses · <t:\d+:D> ⏳$/);
});

test("o impulso vale o mais antigo entre este servidor e os outros onde a Helena está; sem impulso nenhum, sem as linhas", () => {
    const now = Date.UTC(2026, 7, 20, 0, 0, 0);

    const base = { id: "1", username: "ana", createdAt: 0 };

    const since = card => infoOf(card)["🚀 Impulsionando desde"];

    // só em outro servidor (boostSince): aparece igual, sem precisar de impulso neste
    assert.match(since(buildUserinfoEmbed({ user: { ...base, boostSince: Date.UTC(2024, 5, 2, 0, 28) }, now })), /^01 de junho de 2024, às 21:28/);

    // nos dois: vale o mais antigo
    assert.match(since(buildUserinfoEmbed({ user: { ...base, boostingSince: SINCE, boostSince: Date.UTC(2024, 5, 2, 0, 28) }, now })), /^01 de junho de 2024/);
    assert.match(since(buildUserinfoEmbed({ user: { ...base, boostingSince: Date.UTC(2023, 0, 10, 15), boostSince: SINCE }, now })), /^10 de janeiro de 2023/);

    // sem nenhum: nada de linha de impulso nem de insígnia
    const none = infoOf(buildUserinfoEmbed({ user: base, now }));

    assert.equal(none["🚀 Impulsionando desde"], undefined);
    assert.equal(none["🏅 Insígnia de impulso atual"], undefined);
    assert.equal(none["🏅 Insígnias"], undefined);
});

test("a insígnia de impulso: o nível máximo, quem ainda não completou 1 mês, e o emoji é sempre o comum do Discord", async () => {
    const { setAppEmojis } = await import("../services/platform/app-emojis.mjs");
    const { ICONS } = await import("../config/icons.mjs");

    try {
        // com todos os desenhos da Helena no aplicativo, os emblemas continuam sendo os emojis comuns
        setAppEmojis(Object.keys(ICONS).map((name, index) => ({ id: String(500000000000000000n + BigInt(index)), name: `h_${name}`, animated: false })));

        const now = Date.UTC(2026, 7, 20, 0, 0, 0);

        // com os desenhos no aplicativo, o nome dos campos leva o emoji da Helena: acha o campo pelo fim do nome
        const make = since => {
            const card = buildUserinfoEmbed({ user: { id: "1", username: "ana", createdAt: 0, boostingSince: since, publicFlags: 1 << 6 }, now });

            return label => card.fields.find(field => field.name.endsWith(label))?.value;
        };

        // mais de 24 meses: nível máximo, sem próximo nível
        const top = make(Date.UTC(2024, 5, 1, 21, 28, 0));

        assert.match(top("Insígnia de impulso atual"), /^💠 \| \*\*2 anos/);
        assert.equal(top("Próxima insígnia de impulso"), "💠 | **Nível máximo alcançado.**");

        // menos de 1 mês: ainda sem insígnia, e a próxima é o nível 1
        const fresh = make(Date.UTC(2026, 7, 10, 0, 0, 0));

        assert.match(fresh("Insígnia de impulso atual"), /^Ainda sem insígnia \| \*\*10 dias\*\*$/);
        assert.match(fresh("Próxima insígnia de impulso"), /^💠 \| em \*\*21 dias\*\*$/);

        // a insígnia da conta (HypeSquad Bravery) e a do impulso: os emojis comuns, sem <:h_...:id>
        assert.equal(top("Insígnias"), "🦁 💠");
        assert.doesNotMatch(top("Insígnias") + top("Insígnia de impulso atual"), /<a?:h_/);

    } finally {
        setAppEmojis([]);
    }
});

test("o cartão e as telas cabem nos limites do embed, mesmo com todas as insígnias", () => {
    const flags = Object.values(DOCUMENTED).reduce((sum, number) => sum + 2 ** number, 0);

    const user = {
        id: "1", username: "ana", displayName: "Ana", createdAt: 0, joinedAt: 1, publicFlags: flags,
        boostingSince: SINCE, avatarHash: "a_1", bannerUrl: "https://x.test/b.png", roleIds: ["1"],
        primaryGuild: { tag: "HLN", guildId: "9" }
    };

    const card = buildUserinfoEmbed({ user });

    assert.ok(card.description.length <= 4096, `descrição com ${card.description.length} caracteres`);
    for (const field of card.fields) {
        assert.ok(field.value.length <= 1024 && field.name.length <= 256, field.name);
    }

    for (const kind of ["badges", "nitro", "dates", "roles"]) {
        const detail = buildUserinfoDetail(kind, user);

        assert.ok((detail.description ?? "").length <= 4096, kind);

        for (const field of detail.fields ?? []) {
            assert.ok(field.value.length <= 1024, `${kind}: ${field.name} (${field.value.length})`);
        }
    }

    assert.ok(detailOptions(user).length <= 25);
    assert.equal(infoOf(card)["🔖 Etiqueta de servidor"], "```\nHLN\n```");
});
