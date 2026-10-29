import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { siteOnly } = await import("../services/platform/site-only.mjs");

// ==========================================
// A VARIÁVEL
// ==========================================

test("só o valor 'on' liga o modo só-site; qualquer outro deixa o bot como sempre", () => {
    for (const value of ["on", "ON", " on ", "On"]) {
        assert.equal(siteOnly({ HELENA_WEB_ONLY: value }), true, `«${value}» liga`);
    }

    // um erro de digitação nunca derruba o bot oficial: o modo é estrito
    for (const value of [undefined, null, "", "off", "1", "true", "sim", "yes", "onn", "o n"]) {
        assert.equal(siteOnly({ HELENA_WEB_ONLY: value }), false, `«${value}» não liga`);
    }

    assert.equal(siteOnly({}), false);
});

// ==========================================
// NO BOT (helena.mjs não roda em teste: confere no código)
// ==========================================

const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

// A chamada está dentro de um bloco "if (!SITE_ONLY) {": o último desses blocos antes dela ainda
// não foi fechado (o fecha-chaves de coluna 0 só aparece no fim do bloco).
function guarded(call) {
    const at = source.indexOf(call);

    assert.ok(at >= 0, `não achei «${call}» em helena.mjs`);

    const open = source.lastIndexOf("if (!SITE_ONLY) {", at);

    assert.ok(open >= 0, `«${call}» não está atrás de if (!SITE_ONLY)`);

    assert.ok(!source.slice(open, at).includes("\n}"), `«${call}» ficou fora do bloco do modo só-site`);
}

test("no modo só-site o bot não autentica, não registra comandos e não conecta ao Discord", () => {
    guarded("application = await api.application()");
    guarded("transport = createTransport(api, appId)");
    guarded("await loadAppEmojis(api, appId)");
    guarded("await registrarComandos(");
    guarded("startLaunderingSweeper(");
    guarded("conectarGateway();\n}");
});

test("o token só é exigido fora do modo só-site, e o modo exige a porta da API", () => {
    const start = source.indexOf("const SITE_ONLY = siteOnly();");

    assert.ok(start > 0);

    const block = source.slice(start, source.indexOf("const api = discordApi();", start));

    assert.match(block, /HELENA_WEB_PORT/, "sem a API não há o que subir");
    assert.match(block, /else if \(!TOKEN\)/, "fora do modo, a falta do token continua derrubando");
    assert.match(block, /NÃO entra no Discord/, "o log avisa que o bot não responde");
});
