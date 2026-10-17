process.env.HELENA_OWNER_ID = "777000000000000001";

import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { probeResponse, handleProbeClick, V2_PROBE_MODES } = await import("../services/platform/v2-probe.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { carregarComandos } = await import("../command-registry.mjs");

const OWNER = { id: "777000000000000001", avatarUrl: "https://cdn.exemplo.test/avatar.png" };
const OTHER = { id: "888000000000000002" };

const silently = async fn => {
    const log = console.log;
    console.log = () => {};

    try { return await fn(); } finally { console.log = log; }
};

// As regras que a documentação da VSync dá para os blocos de layout: o que a API
// devolveria como "400 Componentes inválidos" tem que falhar aqui antes.
function checkLayout(components) {
    const problems = [];
    const ids = new Set();
    let total = 0;

    const visit = (component, parent) => {
        total += 1;

        const type = component?.type;

        if (type === "container") {
            if (parent === "container") problems.push("um container não aceita outro container");
            if (component.accentColor && !/^#[0-9a-fA-F]{6}$/.test(component.accentColor)) problems.push("accentColor precisa ser #rrggbb");

            component.components.forEach(child => visit(child, "container"));
        } else if (type === "row") {
            const kids = component.components;
            const onlyMenu = kids.length === 1 && kids[0].type === "select";

            if (!onlyMenu && (kids.length < 1 || kids.length > 5)) problems.push("uma row leva de 1 a 5 botões");

            kids.forEach(child => visit(child, "row"));
        } else if (type === "section") {
            if (!(component.texts.length >= 1 && component.texts.length <= 3)) problems.push("section leva de 1 a 3 textos");
            if (!["button", "thumbnail"].includes(component.accessory?.type)) problems.push("section leva um acessório: botão ou miniatura");

            total += component.texts.length;

            visit(component.accessory, "section");
        } else if (type === "text") {
            if (!(component.content.length >= 1 && component.content.length <= 4000)) problems.push("text leva de 1 a 4000 caracteres");
        } else if (type === "thumbnail") {
            if (parent !== "section") problems.push("thumbnail só como acessório de section");
            if (!component.url.startsWith("https://")) problems.push("thumbnail precisa de https");
        } else if (type === "separator") {
            if (component.spacing && !["small", "large"].includes(component.spacing)) problems.push("spacing: small ou large");
        } else if (type === "button") {
            if (component.customId) {
                if (ids.has(component.customId)) problems.push(`customId repetido: ${component.customId}`);
                ids.add(component.customId);
            }
        } else {
            problems.push(`tipo desconhecido: ${type}`);
        }
    };

    components.forEach(component => visit(component, null));

    if (total > 40) problems.push(`${total} componentes (máximo 40)`);

    return problems;
}

test("/devv2 manda layout V2 dentro das regras da documentação, em todos os modos", () => {
    for (const mode of Object.keys(V2_PROBE_MODES)) {
        const { type, data } = probeResponse(mode, OWNER);

        assert.equal(type, "message", mode);
        assert.deepEqual(checkLayout(data.components), [], mode);
    }
});

test("cada modo manda o que promete: body, embed, os dois, ou resposta privada", () => {
    const of = mode => probeResponse(mode, OWNER).data;

    assert.equal(of("puro").body, undefined);
    assert.equal(of("puro").embeds, undefined);

    assert.match(of("corpo").body, /body/);
    assert.equal(of("corpo").embeds, undefined);

    assert.equal(of("embed").embeds.length, 1);
    assert.equal(of("embed").body, undefined);

    assert.ok(of("tudo").body && of("tudo").embeds.length === 1);

    assert.equal(of("privado").ephemeral, true);
    assert.equal(of("puro").ephemeral, undefined);
});

test("a miniatura só entra com um avatar https", () => {
    const hasThumbnail = user => JSON.stringify(probeResponse("puro", user).data.components).includes('"thumbnail"');

    assert.equal(hasThumbnail(OWNER), true);
    assert.equal(hasThumbnail({ id: OWNER.id, avatarUrl: "http://inseguro.test/a.png" }), false);
    assert.equal(hasThumbnail({ id: OWNER.id }), false);
});

test("o comando /devv2 existe, é do dono e recusa modo inválido", async () => {
    const comandos = await silently(() => carregarComandos());
    const command = comandos.get("devv2");

    assert.ok(command, "devv2 não foi carregado");

    const denied = await command.execute({ user: OTHER, data: { options: { modo: "puro" } } });

    assert.match(JSON.stringify(denied), /exclusivo do propriet/);
    assert.equal(denied.data.components, undefined);

    const ok = await command.execute({ user: OWNER, data: { options: [{ name: "modo", value: "tudo" }] } });

    assert.ok(ok.data.components.length > 0);
    assert.ok(ok.data.embeds.length === 1);

    const standard = await command.execute({ user: OWNER, data: { options: [] } });

    assert.ok(standard.data.components.length > 0);

    const wrong = await command.execute({ user: OWNER, data: { options: [{ name: "modo", value: "xyz" }] } });

    assert.match(JSON.stringify(wrong), /Modo inv/);
});

test("clique: o botão da seção atualiza o layout; 'clássico' volta para embed; outra pessoa é barrada", () => {
    const click = (action, user = OWNER, owner = OWNER.id) => handlePanelClick({
        user,
        data: { customId: `devv2:${action}:${owner}` }
    });

    const refreshed = click("atualizar");

    assert.equal(refreshed.type, "update");
    assert.deepEqual(checkLayout(refreshed.data.components), []);

    const classic = click("classico");

    assert.equal(classic.type, "update");
    assert.equal(classic.data.embeds.length, 1);
    assert.equal(classic.data.components[0].type, "row");

    // quem não é o dono não mexe, nem com o ID do dono no botão
    for (const action of ["atualizar", "classico", "sem-efeito"]) {
        const blocked = click(action, OTHER);

        assert.equal(blocked.type, "message", action);
        assert.equal(blocked.data.ephemeral, true, action);
    }

    // o ID de outra pessoa no botão também não vale para o dono
    assert.equal(handleProbeClick({ user: OWNER, data: { customId: `devv2:atualizar:${OTHER.id}` } }).type, "message");
});
