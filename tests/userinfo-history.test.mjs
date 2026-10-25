import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O histórico de nomes, ícones e banners do /userinfo, a tela de cores do perfil e a privacidade
// do histórico (ocultar, mostrar, apagar). O histórico é de quem usa a Helena e começa no primeiro uso.

const {
    observe, observeTarget, readHistory, isHidden, setHidden, clearHistory, countHistory, resetHistoryMemory, MAX_PER_KIND
} = await import("../services/social/userinfo-history.mjs");

const { privacyAction, privacyView, privacyResponse, PRIVACY_MENU_VALUE } = await import("../services/social/userinfo-privacy.mjs");
const { buildUserinfoDetail, detailOptions, USERINFO_COLOR } = await import("../services/social/userinfo-view.mjs");
const { normalizeUser } = await import("../services/discord/normalize.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");
const { handleUserinfoComponent } = await import("../services/panels/userinfo-panel.mjs");
const { userinfoComponents } = await import("../services/social/userinfo-components.mjs");

const G = "900000000000000001";

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

let counter = 0;

// um jogador novo por teste (o banco é um só por arquivo)
function player(overrides = {}) {
    counter += 1;

    const user = {
        id: String(700000000000000000n + BigInt(counter)),
        username: "maria" + counter,
        displayName: "Maria " + counter,
        avatarHash: "avatarum",
        ...overrides
    };

    getPlayer(G, user.id);
    savePlayerName(user);

    return user;
}

test.beforeEach(() => resetHistoryMemory());

// ==========================================
// GRAVAR
// ==========================================

test("a primeira vez grava o que a pessoa é hoje; a segunda igual não grava nada", () => {
    const user = player();

    assert.equal(observe(user, { time: T0 }), 3, "@usuário, nome de exibição e foto");
    assert.equal(observe(user, { time: T0 + 1000 }), 0);

    resetHistoryMemory();

    assert.equal(observe(user, { time: T0 + 2000 }), 0, "nem sem a memória do processo: o banco já tem o último");

    const history = readHistory(user.id);

    assert.deepEqual(history.usernames.map(entry => entry.value), [user.username]);
    assert.deepEqual(history.displays.map(entry => entry.value), [user.displayName]);
    assert.deepEqual(history.avatars.map(entry => entry.value), ["avatarum"]);
    assert.equal(history.since, T0);
    assert.equal(history.tracked, true);
});

test("o que mudou entra, o mais novo primeiro, e o de agora é sempre o primeiro da lista", () => {
    const user = player();

    observe(user, { time: T0 });
    observe({ ...user, username: "novonome", displayName: "Novo Nome", avatarHash: "avatardois" }, { time: T0 + 5000 });

    const history = readHistory(user.id);

    assert.deepEqual(history.usernames.map(entry => entry.value), ["novonome", user.username]);
    assert.deepEqual(history.displays.map(entry => entry.value), ["Novo Nome", user.displayName]);
    assert.deepEqual(history.avatars.map(entry => entry.value), ["avatardois", "avatarum"]);
    assert.equal(history.avatars[1].at, T0);
    assert.equal(history.avatars[0].at, T0 + 5000);
});

test("sem nome de exibição próprio não entra um 'display' igual ao @usuário; bots e contas sem ID são ignorados", () => {
    const user = player({ displayName: "igual" });

    observe({ ...user, username: "igual", displayName: "igual" });

    assert.deepEqual(readHistory(user.id).displays, []);

    assert.equal(observe({ id: "1", username: "bot", bot: true }), 0);
    assert.equal(observe({}), 0);
    assert.equal(observe(null), 0);
});

test("o banner só entra quando o perfil completo da conta foi carregado", () => {
    const user = player();

    observe({ ...user, bannerHash: "bannerum" }, { time: T0 });

    assert.deepEqual(readHistory(user.id).banners, [], "sem accountLoaded não dá para saber o banner");

    observe({ ...user, accountLoaded: true, bannerHash: "bannerum" }, { time: T0 + 1 });
    observe({ ...user, accountLoaded: true, bannerHash: "bannerdois" }, { time: T0 + 2 });

    assert.deepEqual(readHistory(user.id).banners.map(entry => entry.value), ["bannerdois", "bannerum"]);
});

test("guarda só os últimos 25 de cada tipo", () => {
    const user = player();

    for (let index = 0; index < MAX_PER_KIND + 10; index += 1) {
        observe({ ...user, avatarHash: "foto" + index }, { time: T0 + index });
    }

    const avatars = readHistory(user.id).avatars;

    assert.equal(avatars.length, MAX_PER_KIND);
    assert.equal(avatars[0].value, "foto" + (MAX_PER_KIND + 9), "a mais nova fica");
    assert.equal(avatars.at(-1).value, "foto10", "as mais velhas saem");
});

test("quem nunca usou a Helena não ganha histórico só por ser consultado; quem usa ganha", () => {
    const stranger = { id: "888000000000000001", username: "estranho", displayName: "Estranho", avatarHash: "x" };

    assert.equal(observeTarget(stranger), 0);
    assert.equal(readHistory(stranger.id).tracked, false);
    assert.equal(countHistory(stranger.id), 0);

    const known = player();

    assert.equal(observeTarget(known), 3);
});

// ==========================================
// PRIVACIDADE
// ==========================================

test("ocultar para de guardar e esconde o que já havia; mostrar traz de volta; apagar tira de vez", () => {
    const user = player();

    observe(user, { time: T0 });

    setHidden(user.id, true);

    assert.equal(isHidden(user.id), true);
    assert.equal(readHistory(user.id).hidden, true);
    assert.deepEqual(readHistory(user.id).usernames, [], "nada é mostrado");
    assert.equal(observe({ ...user, username: "troquei" }, { time: T0 + 1 }), 0, "e nada novo é guardado");

    setHidden(user.id, false);

    assert.deepEqual(readHistory(user.id).usernames.map(entry => entry.value), [user.username], "o que havia volta, sem o que foi trocado oculto");

    assert.equal(clearHistory(user.id), 3);
    assert.equal(countHistory(user.id), 0);
    assert.deepEqual(readHistory(user.id).usernames, []);
});

test("as palavras do comando: ocultar, mostrar, apagar e privar; nome de gente não vira ação", () => {
    assert.equal(privacyAction("ocultar"), "ocultar");
    assert.equal(privacyAction(" MOSTRAR "), "mostrar");
    assert.equal(privacyAction("apagar"), "apagar");
    assert.equal(privacyAction("privar"), "status");

    for (const text of ["mariasilva", "@ocultar", "<@123>", "", undefined, null, "ocultar tudo", "constructor", "__proto__", "toString"]) {
        assert.equal(privacyAction(text), null, String(text));
    }
});

test("a tela de privacidade aplica a ação, mostra o estado e deixa só o botão que faz sentido", () => {
    const user = player();

    observe(user, { time: T0 });

    const labels = view => view.components[0].components.map(button => [button.label, Boolean(button.disabled)]);

    const status = privacyView(user.id, "status");

    assert.match(status.embed.title, /Seu histórico do \/userinfo/);
    assert.deepEqual(labels(status), [["Ocultar", false], ["Mostrar", true], ["Apagar tudo", false]]);

    const hidden = privacyView(user.id, "ocultar");

    assert.match(hidden.embed.title, /Histórico oculto/);
    assert.equal(isHidden(user.id), true);
    assert.deepEqual(labels(hidden), [["Ocultar", true], ["Mostrar", false], ["Apagar tudo", false]]);
    assert.ok(hidden.components[0].components.every(button => button.customId.startsWith(`userinfo:priv:${user.id}:`)));

    const shown = privacyView(user.id, "mostrar");

    assert.match(shown.embed.title, /Histórico visível/);
    assert.equal(isHidden(user.id), false);

    const erased = privacyView(user.id, "apagar");

    assert.match(erased.embed.title, /Histórico apagado/);
    assert.match(erased.embed.description, /Apaguei \*\*3\*\* registros/);
    assert.equal(countHistory(user.id), 0);
    assert.deepEqual(labels(erased), [["Ocultar", false], ["Mostrar", true], ["Apagar tudo", true]]);

    // uma ação que não existe vira só a consulta, sem mexer em nada
    assert.match(privacyView(user.id, "qualquer").embed.title, /Seu histórico/);
});

test("a resposta escrita no comando (hui ocultar) é privada, só de quem pediu", () => {
    const user = player();

    const response = privacyResponse(user.id, "ocultar");

    assert.equal(response.data.ephemeral, true);
    assert.ok(response.data.components[0].components.length === 3);
    assert.equal(isHidden(user.id), true);

    assert.match(privacyResponse("", "ocultar").data.embeds[0].description, /identificar/);
});

// ==========================================
// O MENU E OS BOTÕES
// ==========================================

const click = (customId, values, userId) => ({
    id: "c1", guildId: G, channelId: "900000000000000099",
    user: { id: userId, username: "eu", displayName: "Eu" },
    data: { customId, componentType: values ? 3 : 2, ...(values ? { values } : {}) }
});

test("o item 'Meu histórico' só aparece no próprio cartão", () => {
    const user = { id: "5", username: "x" };

    assert.ok(!detailOptions(user).some(option => option.value === PRIVACY_MENU_VALUE));
    assert.ok(detailOptions(user, { self: true }).some(option => option.value === PRIVACY_MENU_VALUE));
    assert.ok(detailOptions({ ...user, avatarUrl: "https://a.test/a.png", roleIds: ["r"] }, { self: true }).length <= 25);

    const own = userinfoComponents({ ownerId: "5", user });
    const other = userinfoComponents({ ownerId: "9", user });

    assert.ok(own[0].components[0].options.some(option => option.value === "privacy"));
    assert.ok(!other[0].components[0].options.some(option => option.value === "privacy"));
});

test("Meu histórico: o menu abre a tela privada com os botões, e os botões mexem só para o dono", async () => {
    const user = player();

    const comandos = new Map();

    const open = await handleUserinfoComponent(click(`userinfo:more:${user.id}:${user.id}`, ["privacy"], user.id), comandos);

    assert.equal(open.type, "message");
    assert.equal(open.data.ephemeral, true);
    assert.match(open.data.embeds[0].title, /Seu histórico/);
    assert.equal(open.data.components[0].components.length, 3);

    // outra pessoa não abre o histórico de quem é dono do cartão, mesmo pela escolha do menu
    const other = player();

    const denied = await handleUserinfoComponent(click(`userinfo:more:${other.id}:${user.id}`, ["privacy"], other.id), comandos);

    assert.match(denied.data.embeds[0].title, /Só no seu cartão/);

    // o botão Ocultar: edita a mesma mensagem (update) e o estado muda
    const hide = await handleUserinfoComponent(click(`userinfo:priv:${user.id}:ocultar`, undefined, user.id), comandos);

    assert.equal(hide.type, "update");
    assert.match(hide.data.embeds[0].title, /Histórico oculto/);
    assert.equal(isHidden(user.id), true);

    // o botão de outra pessoa não vale
    const stranger = await handleUserinfoComponent(click(`userinfo:priv:${user.id}:mostrar`, undefined, other.id), comandos);

    assert.equal(stranger.data.ephemeral, true);
    assert.equal(isHidden(user.id), true, "continua oculto");

    // uma ação inventada não faz nada
    const invented = await handleUserinfoComponent(click(`userinfo:priv:${user.id}:destruir`, undefined, user.id), comandos);

    assert.match(invented.data.embeds[0].title, /Botão desconhecido/);
});

// ==========================================
// AS TELAS DE HISTÓRICO
// ==========================================

test("Nomes anteriores: cada nome com o intervalo em que foi visto, e o texto de quem ainda não mudou", () => {
    const user = player();

    observe(user, { time: T0 });
    observe({ ...user, username: "segundo", displayName: "Segundo" }, { time: T0 + 10 * 86_400_000 });
    observe({ ...user, username: "terceiro", displayName: "Segundo" }, { time: T0 + 20 * 86_400_000 });

    const screen = buildUserinfoDetail("names", { ...user, username: "terceiro" }, T0 + 30 * 86_400_000, { history: readHistory(user.id) });

    assert.match(screen.title, /Nomes anteriores de/);
    assert.match(screen.description, /\*\*segundo\*\* · @usuário · visto de <t:\d+:D> até <t:\d+:D>/);
    assert.match(screen.description, new RegExp(`\\*\\*${user.username}\\*\\* · @usuário`));
    assert.match(screen.description, /\*\*Maria \d+\*\* · nome de exibição/);
    assert.doesNotMatch(screen.description, /\*\*terceiro\*\*/, "o nome de agora não é 'anterior'");
    assert.match(screen.description, /A Helena só guarda isso de quem usa a Helena, desde <t:\d+:D>/);
    assert.match(screen.description, /ocultar ou apagar o seu em \*\*Meu histórico\*\*/);

    const fresh = player();

    observe(fresh, { time: T0 });

    const none = buildUserinfoDetail("names", fresh, T0, { history: readHistory(fresh.id) });

    assert.match(none.description, /ainda não viu essa pessoa trocar de nome/);
});

test("Ícones antigos e banners antigos: o link de cada um e a imagem da anterior", () => {
    const user = player();

    observe({ ...user, accountLoaded: true, bannerHash: "b1" }, { time: T0 });
    observe({ ...user, avatarHash: "avatardois", accountLoaded: true, bannerHash: "b2" }, { time: T0 + 1000 });

    const history = readHistory(user.id);

    const avatars = buildUserinfoDetail("oldavatars", user, T0 + 2000, { history });

    assert.match(avatars.title, /Ícones antigos de/);
    assert.match(avatars.description, new RegExp(`\\[abrir\\]\\(https://cdn\\.discordapp\\.com/avatars/${user.id}/avatarum\\.png\\?size=256\\)`));
    assert.equal(avatars.image.url, `https://cdn.discordapp.com/avatars/${user.id}/avatarum.png?size=256`);

    const banners = buildUserinfoDetail("oldbanners", user, T0 + 2000, { history });

    assert.match(banners.description, new RegExp(`banners/${user.id}/b1\\.png\\?size=512`));
    assert.equal(banners.image.url, `https://cdn.discordapp.com/banners/${user.id}/b1.png?size=512`);

    // sem anteriores: texto de quem ainda não trocou, e nenhuma imagem
    const fresh = player();

    observe(fresh, { time: T0 });

    const none = buildUserinfoDetail("oldavatars", fresh, T0, { history: readHistory(fresh.id) });

    assert.match(none.description, /ainda não viu essa pessoa trocar de foto/);
    assert.equal(none.image, undefined);
});

test("quem ocultou e quem nunca usou a Helena veem o aviso certo, sem lista", () => {
    const hidden = player();

    observe(hidden, { time: T0 });
    setHidden(hidden.id, true);

    const a = buildUserinfoDetail("names", hidden, T0, { history: readHistory(hidden.id) });

    assert.match(a.description, /escolheu ocultar o histórico/);
    assert.doesNotMatch(a.description, /visto de/);

    const stranger = { id: "888000000000000002", username: "estranho", displayName: "Estranho" };

    const b = buildUserinfoDetail("oldavatars", stranger, T0, { history: readHistory(stranger.id) });

    assert.match(b.description, /só guarda o histórico de quem usa a Helena/);
});

test("uma tela de histórico longa é cortada e cabe no limite do embed", () => {
    const user = player();

    for (let index = 0; index < 25; index += 1) {
        observe({ ...user, username: "nome" + "x".repeat(60) + index, displayName: "Nome" + "y".repeat(70) + index }, { time: T0 + index });
    }

    const screen = buildUserinfoDetail("names", user, T0 + 100, { history: readHistory(user.id) });

    assert.ok(screen.description.length <= 4096, String(screen.description.length));
    assert.match(screen.description, /…e mais \d+\./);
});

// ==========================================
// CORES DO PERFIL
// ==========================================

test("Cores do perfil: a cor de destaque, as cores do nome, a plaquinha e a decoração do avatar", () => {
    const raw = {
        id: "1", username: "ana", global_name: "Ana",
        accent_color: 0x8555ff,
        banner_color: "#232428",
        display_name_styles: { font_id: 3, effect_id: 2, colors: [0xff0000, 0x00ff00, "x", -5] },
        collectibles: { nameplate: { palette: "bubble_gum", asset: "n/", sku_id: "1", label: "" } },
        avatar_decoration_data: { asset: "a_abc", sku_id: "2" }
    };

    const user = normalizeUser(raw);

    assert.deepEqual(user.nameColors, [0xff0000, 0x00ff00], "só números válidos de cor");
    assert.equal(user.nameplatePalette, "bubble_gum");
    assert.equal(user.avatarDecoration, "a_abc");
    assert.equal(user.bannerColor, "#232428");

    const screen = buildUserinfoDetail("colors", user);

    const fields = Object.fromEntries(screen.fields.map(field => [field.name, field.value]));

    assert.equal(screen.color, 0x8555ff, "a barra do embed leva a cor da pessoa");
    assert.equal(fields["🎨 Cor de destaque"], "`#8555FF`");
    assert.equal(fields["✏️ Cores do nome"], "`#FF0000` · `#00FF00`");
    assert.equal(fields["🏷️ Plaquinha"], "Chiclete");
    assert.match(fields["🖼️ Decoração do avatar"], /decoração de avatar/);
    assert.equal(screen.thumbnail.url, "https://cdn.discordapp.com/avatar-decoration-presets/a_abc.png?size=256");
    assert.match(screen.description, /não os entrega a bots/);
});

test("Cores do perfil: sem nada de enfeite, só a cor de destaque (ou 'sem cor definida')", () => {
    const plain = normalizeUser({ id: "1", username: "ana", accent_color: 2303016, banner_color: "#232428" });

    const screen = buildUserinfoDetail("colors", plain);

    assert.deepEqual(screen.fields.map(field => field.name), ["🎨 Cor de destaque"]);
    assert.equal(screen.fields[0].value, "`#232428`");
    assert.equal(screen.thumbnail, undefined);

    // sem accent_color, vale a cor do banner
    const fromBanner = buildUserinfoDetail("colors", normalizeUser({ id: "1", username: "ana", banner_color: "#112233" }));

    assert.equal(fromBanner.fields[0].value, "`#112233`");

    // e sem nenhuma das duas
    const none = buildUserinfoDetail("colors", { id: "1", username: "ana" });

    assert.equal(none.fields[0].value, "Sem cor definida.");
    assert.equal(none.color, USERINFO_COLOR, "sem cor da pessoa, a barra é a violeta da Helena");
});

test("a tabela do histórico existe e só guarda os tipos conhecidos", () => {
    const columns = db.prepare("PRAGMA table_info(userinfo_history)").all().map(column => column.name);

    assert.deepEqual(columns, ["id", "user_id", "kind", "value", "seen_at"]);

    assert.throws(() => db.prepare("INSERT INTO userinfo_history (user_id, kind, value, seen_at) VALUES ('1', 'mensagem', 'oi', 1)").run());
});
