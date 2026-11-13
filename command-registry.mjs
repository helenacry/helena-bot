
import { readdir } from "node:fs/promises";

import { discordApi } from "./services/discord/api.mjs";

import { toDiscordCommand } from "./services/discord/format.mjs";

import { slashDescription, HIDDEN_FOLDERS } from "./config/command-categories.mjs";

import { EXACT as EN_US_EXACT } from "./config/locales/en-US.mjs";

const COMMANDS_DIR = new URL("./commands/", import.meta.url);

// Lista os .mjs de commands/ e de todas as subpastas
// (commands/economy, commands/social, commands/dev...),
// em ordem alfabética para que o carregamento seja
// sempre o mesmo.

async function listarArquivos(dir) {
    const entradas = await readdir(dir, { withFileTypes: true });

    entradas.sort((a, b) => a.name.localeCompare(b.name));

    const arquivos = [];

    for (const entrada of entradas) {
        const nome = encodeURIComponent(entrada.name);

        if (entrada.isDirectory()) {
            arquivos.push(
                ...await listarArquivos(new URL(`${nome}/`, dir))
            );

        } else if (entrada.isFile() && entrada.name.endsWith(".mjs")) {
            arquivos.push(new URL(nome, dir));
        }
    }

    return arquivos;
}

function caminhoRelativo(url) {
    return url.href.slice(COMMANDS_DIR.href.length);
}

// Aliases: um comando pode declarar aliases: ["bal", "carteira"]
// para ser chamado também por hbal e hcarteira, e por /bal e
// /carteira. Cada alias é registrado no Discord como um comando
// de barra próprio, com a mesma descrição e as mesmas opções.

const aliasesPorComandos = new WeakMap();

// Regra de nome dos comandos de barra do Discord:
// 1 a 32 caracteres, minúsculas, números, "-" ou "_".
const ALIAS_VALIDO = /^[a-z0-9_-]{1,32}$/;

// Limite de comandos de barra globais por aplicativo no Discord.
const LIMITE_COMANDOS = 100;

function indexarAliases(comandos, origem) {
    const aliases = new Map();

    for (const comando of comandos.values()) {
        const caminho = origem.get(comando.name);
        const lista = comando.aliases ?? [];

        if (!Array.isArray(lista)) {
            throw new Error(
                `"aliases" de ${caminho} deve ser uma lista.`
            );
        }

        for (const alias of lista) {
            if (typeof alias !== "string" || !ALIAS_VALIDO.test(alias)) {
                throw new Error(
                    `Alias inválido "${alias}" em ${caminho} ` +
                    "(use de 1 a 32 caracteres: minúsculas sem acento, " +
                    "números, \"-\" ou \"_\")."
                );
            }

            if (comandos.has(alias)) {
                throw new Error(
                    `Alias "${alias}" de ${caminho} conflita ` +
                    `com o comando ${origem.get(alias)}.`
                );
            }

            if (aliases.has(alias)) {
                throw new Error(
                    `Alias duplicado "${alias}": ` +
                    `${origem.get(aliases.get(alias).name)} e ${caminho}.`
                );
            }

            aliases.set(alias, comando);
        }
    }

    return aliases;
}

// Encontra o comando pelo nome oficial ou por um alias.
export function resolverComando(comandos, nome) {
    return comandos.get(nome) ?? aliasesPorComandos.get(comandos)?.get(nome);
}

// O que o último carregarComandos() leu: os comandos e o arquivo de cada um
// (nome -> "pasta/arquivo.mjs"). A central de ajuda lê daqui, então ela lista
// o que o bot tem de verdade e nunca fica desatualizada.
let ultimaCarga = null;

export function comandosCarregados() {
    return ultimaCarga;
}

export async function carregarComandos() {
    const comandos = new Map();

    // Arquivo onde cada comando foi definido, usado para
    // apontar nomes repetidos entre pastas.
    const origem = new Map();

    const porPasta = new Map();

    for (const arquivo of await listarArquivos(COMMANDS_DIR)) {
        const caminho = decodeURIComponent(caminhoRelativo(arquivo));

        const modulo = await import(arquivo);

        const comando = modulo.default;

        if (!comando?.name || typeof comando.execute !== "function") {
            console.warn(`Comando inválido: ${caminho}`);
            continue;
        }

        if (comandos.has(comando.name)) {
            throw new Error(
                `Comando duplicado "${comando.name}": ` +
                `${origem.get(comando.name)} e ${caminho}.`
            );
        }

        comandos.set(comando.name, comando);
        origem.set(comando.name, caminho);

        const pasta = caminho.includes("/")
            ? caminho.slice(0, caminho.lastIndexOf("/"))
            : "(raiz)";

        porPasta.set(pasta, (porPasta.get(pasta) ?? 0) + 1);
    }

    // Os aliases só podem ser conferidos depois de carregar todos
    // os comandos, porque podem colidir com nomes de outras pastas.
    const aliases = indexarAliases(comandos, origem);

    aliasesPorComandos.set(comandos, aliases);

    console.log(
        "[COMANDOS] " +
        [...porPasta].map(([pasta, total]) => `${pasta}: ${total}`).join(" | ") +
        ` | aliases: ${aliases.size}`
    );

    ultimaCarga = { comandos, origem };

    return comandos;
}

// ==========================================
// DESCRIÇÕES EM OUTROS IDIOMAS NA LISTA DO DISCORD
// ==========================================

// Quem usa o Discord em inglês vê a lista de comandos em inglês, se o registro levar a descrição nesse idioma
// (description_localizations). É o idioma do aplicativo do Discord de cada pessoa, não o que ela escolheu em
// /config: um é a lista de comandos, o outro as respostas da Helena. Os textos vêm do dicionário de inglês
// (config/locales/en-US-catalog.mjs); o que não tem tradução fica de fora e o Discord mostra o português.

// os idiomas do Discord que recebem o dicionário de inglês
const IDIOMAS_INGLES = ["en-US", "en-GB"];

const emIngles = texto => EN_US_EXACT[String(texto ?? "")];

const paraIdiomas = texto => (texto ? Object.fromEntries(IDIOMAS_INGLES.map(idioma => [idioma, texto])) : undefined);

// { descriptionLocalizations, options } do comando, só com o que tem tradução
function localizarComando(comando, pasta) {
    const descricao = emIngles(comando.description);

    // o comando do dono (admin e dev) fica só em português: ninguém mais o vê
    if (!descricao || HIDDEN_FOLDERS.has(pasta)) {
        return {};
    }

    const traduzirEtiqueta = rotulo => emIngles(rotulo) ?? rotulo;

    const options = (comando.options ?? []).map(opcao => {
        const texto = emIngles(opcao.description);

        return {
            ...opcao,

            ...(texto ? { descriptionLocalizations: paraIdiomas(texto) } : {}),

            ...(Array.isArray(opcao.choices) ? {
                choices: opcao.choices.map(escolha => {
                    const nome = typeof escolha === "object" ? emIngles(escolha.name) : undefined;

                    return nome && nome !== escolha.name
                        ? { ...escolha, nameLocalizations: paraIdiomas(nome) }
                        : escolha;
                })
            } : {})
        };
    });

    return {
        descriptionLocalizations: paraIdiomas(
            slashDescription(comando.name, pasta, descricao, traduzirEtiqueta)
        ),

        ...(options.length ? { options } : {})
    };
}

// Registra os comandos de barra no Discord.
//
// Os comandos do dono (pastas admin e dev, HIDDEN_FOLDERS) não ficam na lista global: ela tem o teto de 100 e
// cada vaga ocupada por um comando que só o dono usa é uma vaga a menos para os jogadores. Eles vão só para o
// servidor de suporte ("supportGuildId", HELENA_SUPPORT_GUILD_ID), que tem a própria lista de 100. Nos outros
// servidores continuam disponíveis pelo prefixo h, que não gasta vaga.
//   - sem servidor de suporte configurado, eles ficam globais enquanto couberem no teto; se não couberem,
//     ficam só no prefixo h (e o log avisa);
//   - se o registro no servidor de suporte falhar (o bot não está lá, falta permissão), só avisa: o bot sobe.
export async function registrarComandos(appId, comandos, { supportGuildId } = {}) {
    const aliases = aliasesPorComandos.get(comandos) ?? new Map();

    // A pasta de cada comando (de onde sai a categoria da etiqueta "[💰 Economia]" da descrição).
    const origem = ultimaCarga?.comandos === comandos ? ultimaCarga.origem : new Map();

    const pastaDe = comando => String(origem.get(comando.name) ?? "").split("/")[0];

    const doDono = comando => HIDDEN_FOLDERS.has(pastaDe(comando));

    const paraDiscord = (nome, comando) => {
        const pasta = pastaDe(comando);

        const traduzida = localizarComando(comando, pasta);

        return toDiscordCommand(nome, {
            ...comando,

            description: slashDescription(
                comando.name,
                pasta,
                comando.description
            ),

            ...traduzida
        });
    };

    // Cada comando seguido dos seus aliases, que repetem a
    // descrição e as opções do comando original. toDiscordCommand confere as regras do
    // Discord (nome, descrição, opções) e diz exatamente o que está errado.
    const entradas = [
        ...[...comandos.values()].map(comando => ({ nome: comando.name, comando, alias: false })),
        ...[...aliases].map(([alias, comando]) => ({ nome: alias, comando, alias: true }))
    ];

    const daLista = entradas.filter(entrada => !doDono(entrada.comando));

    let doDonoEntradas = entradas.filter(entrada => doDono(entrada.comando));

    const servidorDeSuporte = /^\d{17,20}$/.test(String(supportGuildId ?? "")) ? String(supportGuildId) : null;

    let globais = daLista;

    if (!servidorDeSuporte && doDonoEntradas.length) {
        if (daLista.length + doDonoEntradas.length <= LIMITE_COMANDOS) {
            globais = [...daLista, ...doDonoEntradas];

        } else {
            console.warn(
                `[COMANDOS] Sem HELENA_SUPPORT_GUILD_ID, os ${doDonoEntradas.length} comandos do dono não cabem na lista ` +
                `global (teto de ${LIMITE_COMANDOS}): ficam só pelo prefixo h.`
            );
        }

        doDonoEntradas = [];
    }

    const payload = globais.map(({ nome, comando }) => paraDiscord(nome, comando));

    if (payload.length > LIMITE_COMANDOS) {
        const totalAliases = globais.filter(entrada => entrada.alias).length;

        throw new Error(
            `São ${payload.length} comandos de barra (${payload.length - totalAliases} ` +
            `comandos + ${totalAliases} aliases), acima do limite de ` +
            `${LIMITE_COMANDOS} do Discord. Remova aliases.`
        );
    }

    try {
        await discordApi().registerCommands(appId, payload);

    } catch (error) {
        throw new Error(`Erro ao registrar comandos: ${error.message}`);
    }

    const aliasesGlobais = globais.filter(entrada => entrada.alias).length;

    console.log(
        `${payload.length} comandos registrados! ` +
        `(${payload.length - aliasesGlobais} comandos + ${aliasesGlobais} aliases)`
    );

    if (servidorDeSuporte && doDonoEntradas.length) {
        const doServidor = doDonoEntradas.map(({ nome, comando }) => paraDiscord(nome, comando));

        try {
            await discordApi().registerGuildCommands(appId, servidorDeSuporte, doServidor);

            console.log(
                `[COMANDOS] ${doServidor.length} comandos do dono registrados só no servidor de suporte.`
            );

        } catch (error) {
            console.warn(
                "[COMANDOS] Não consegui registrar os comandos do dono no servidor de suporte " +
                `(eles seguem pelo prefixo h): ${error.message}`
            );
        }
    }
}