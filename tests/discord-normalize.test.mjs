import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O tradutor do Discord para a Helena (services/discord/normalize.mjs): interações, mensagens
// do prefixo h, usuários e fotos no formato que os comandos já conhecem.

const {
    snowflakeTime, avatarUrl, normalizeUser, normalizeMember, optionsOf, fieldsOf,
    normalizeInteraction, normalizeMessage
} = await import("../services/discord/normalize.mjs");

const USER = { id: "80351110224678912", username: "nelly", global_name: "Nelly", avatar: "8342729096ea3675442027381ff50dfe", bot: false };

test("a data da conta sai do ID (o exemplo da documentação do Discord)", () => {
    // 175928847299117063 é o ID de exemplo da doc: criado em 2016-04-30 11:18:25 UTC
    assert.equal(new Date(snowflakeTime("175928847299117063")).toISOString(), "2016-04-30T11:18:25.796Z");
    assert.equal(snowflakeTime("não é número"), null);
});

test("foto: a da conta, ou uma das 6 padrão escolhida pelo ID", () => {
    assert.equal(avatarUrl(USER), "https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png?size=256");
    assert.equal(avatarUrl(USER, 64).endsWith("?size=64"), true);

    const none = avatarUrl({ id: "80351110224678912", avatar: null });

    assert.match(none, /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
    assert.equal(none, avatarUrl({ id: "80351110224678912" }), "o mesmo ID sempre dá a mesma padrão");
});

test("usuário: o nome de exibição vem do perfil, o apelido do servidor, e a foto é https", () => {
    const user = normalizeUser(USER, { nick: "Apelido" });

    assert.equal(user.id, "80351110224678912");
    assert.equal(user.username, "nelly");
    assert.equal(user.displayName, "Nelly");
    assert.equal(user.nickname, "Apelido");
    assert.ok(user.avatarUrl.startsWith("https://"));
    assert.equal(user.bot, false);
    assert.equal(typeof user.createdAt, "number");

    // sem nome de exibição, vale o @usuário; sem apelido, vazio (como o resto do bot espera)
    const plain = normalizeUser({ id: "1", username: "so_usuario" });

    assert.equal(plain.displayName, "so_usuario");
    assert.equal(plain.nickname, "");

    assert.equal(normalizeUser(null), null);
    assert.equal(normalizeUser({ username: "sem id" }), null);
});

test("membro: apelido, entrada, cargos, impulso e castigo", () => {
    const member = normalizeMember({
        nick: "Nick", joined_at: "2026-10-11T22:51:00.000000+00:00", roles: [111, "222"], permissions: "1071698660929",
        premium_since: "2026-10-12T00:00:00.000000+00:00", communication_disabled_until: "2026-10-30T00:00:00.000000+00:00"
    });

    assert.equal(member.nickname, "Nick");
    assert.equal(member.joinedAt, Date.UTC(2026, 9, 11, 22, 51));
    assert.deepEqual(member.roleIds, ["111", "222"]);
    assert.equal(member.permissions, "1071698660929");
    assert.equal(member.boostingSince, Date.UTC(2026, 9, 12));
    assert.equal(member.timeoutUntil, Date.UTC(2026, 9, 30));

    assert.equal(normalizeMember({}).joinedAt, null);
    assert.equal(normalizeMember(null), null);
});

test("opções do comando: lista vira mapa, e a pessoa chega como ID", () => {
    assert.deepEqual(optionsOf([
        { name: "usuario", type: 6, value: "80351110224678912" },
        { name: "quantia", type: 3, value: "100" },
        { name: "vezes", type: 4, value: 3 },
        { name: "sim", type: 5, value: false }
    ]), { usuario: "80351110224678912", quantia: "100", vezes: 3, sim: false });

    assert.deepEqual(optionsOf(undefined), {});
    assert.deepEqual(optionsOf([{ name: "grupo", type: 1, options: [{ name: "x", type: 3, value: "y" }] }]), { x: "y" });
});

test("comando de barra em servidor: tudo no formato que os comandos usam", () => {
    const interaction = normalizeInteraction({
        id: "1000", token: "tok", application_id: "2000", type: 2, guild_id: "3000", channel_id: "4000", locale: "pt-BR",
        member: { user: USER, nick: "Nick", roles: ["9"], joined_at: "2026-10-11T22:51:00.000000+00:00" },
        data: {
            id: "5", name: "transferir", type: 1,
            options: [{ name: "usuario", type: 6, value: "6000" }, { name: "quantia", type: 3, value: "100" }],
            resolved: { users: { 6000: { id: "6000", username: "maria", global_name: "Maria", avatar: null } }, members: { 6000: { nick: "Mari" } } }
        }
    });

    assert.equal(interaction.type, "command");
    assert.equal(interaction.id, "1000");
    assert.equal(interaction.token, "tok");
    assert.equal(interaction.guildId, "3000");
    assert.equal(interaction.channelId, "4000");
    assert.equal(interaction.user.id, "80351110224678912");
    assert.equal(interaction.user.nickname, "Nick");
    assert.deepEqual(interaction.member.roleIds, ["9"]);
    assert.equal(interaction.data.name, "transferir");
    assert.deepEqual(interaction.data.options, { usuario: "6000", quantia: "100" });
    assert.equal(interaction.data.resolved.users["6000"].nickname, "Mari");
});

test("comando em conversa privada: a pessoa vem em user, sem servidor", () => {
    const interaction = normalizeInteraction({ id: "1", token: "t", type: 2, channel_id: "9", user: USER, data: { name: "ajuda" } });

    assert.equal(interaction.guildId, null);
    assert.equal(interaction.user.username, "nelly");
    assert.equal(interaction.member, null);
});

test("botão e menu: custom_id vira customId, e os valores escolhidos vêm em values", () => {
    const click = normalizeInteraction({
        id: "1", token: "t", type: 3, guild_id: "3", channel_id: "4", member: { user: USER },
        message: { id: "777", channel_id: "4" },
        data: { custom_id: "loja:cat:1", component_type: 3, values: ["weapon"] }
    });

    assert.equal(click.type, "component");
    assert.equal(click.data.customId, "loja:cat:1");
    assert.deepEqual(click.data.values, ["weapon"]);
    assert.equal(click.data.componentType, 3);
    assert.deepEqual(click.message, { id: "777", channelId: "4" });

    const button = normalizeInteraction({ id: "1", token: "t", type: 3, member: { user: USER }, data: { custom_id: "x", component_type: 2 } });

    assert.deepEqual(button.data.values, []);
});

test("formulário enviado: os campos viram [{ customId, value }], como readFields espera", async () => {
    const submit = normalizeInteraction({
        id: "1", token: "t", type: 5, guild_id: "3", member: { user: USER },
        data: { custom_id: "bio:editar:1", components: [
            { type: 1, components: [{ type: 4, custom_id: "bio", value: "olá" }] },
            { type: 1, components: [{ type: 4, custom_id: "nome", value: "" }] }
        ] }
    });

    assert.equal(submit.type, "modal_submit");
    assert.equal(submit.data.customId, "bio:editar:1");
    assert.deepEqual(submit.data.fields, [{ customId: "bio", value: "olá" }, { customId: "nome", value: "" }]);

    // quem lê os formulários do bot entende o resultado
    const { readFields } = await import("../services/panels/modals.mjs");

    assert.deepEqual(readFields(submit), { bio: "olá", nome: "" });

    assert.deepEqual(fieldsOf(undefined), []);
});

test("o que o bot não trata (ping, autocompletar) devolve null", () => {
    assert.equal(normalizeInteraction({ type: 1 }), null);
    assert.equal(normalizeInteraction({ type: 4, data: {} }), null);
    assert.equal(normalizeInteraction(null), null);
});

test("mensagem do prefixo h: o texto vira body, e quem escreveu vem completo", () => {
    const message = normalizeMessage({
        id: "900", guild_id: "3", channel_id: "4", content: "hdaily", author: USER,
        member: { nick: "Nick", roles: [] }, mentions: [{ id: "6000", username: "maria" }]
    });

    assert.equal(message.id, "900");
    assert.equal(message.body, "hdaily");
    assert.equal(message.guildId, "3");
    assert.equal(message.channelId, "4");
    assert.equal(message.author.id, "80351110224678912");
    assert.equal(message.author.nickname, "Nick");
    assert.equal(message.webhookId, null);
    assert.deepEqual(message.mentions.map(user => user.id), ["6000"]);

    const bot = normalizeMessage({ id: "1", guild_id: "3", channel_id: "4", content: "oi", author: { id: "5", username: "outro_bot", bot: true } });

    assert.equal(bot.author.bot, true, "o tratador do prefixo precisa ver que é bot");

    assert.equal(normalizeMessage(null), null);
});
