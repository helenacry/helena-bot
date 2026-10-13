
import { readdir } from "node:fs/promises";

const API = "https://api.vsync.lat";
const TOKEN = process.env.VSYNC_BOT_TOKEN;

const headers = {
    Authorization: `Bot ${TOKEN}`,
    "Content-Type": "application/json"
};

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
// /carteira. Cada alias é registrado na VSync como um comando
// de barra próprio, com a mesma descrição e as mesmas opções.

const aliasesPorComandos = new WeakMap();

// Mesma regra de nome dos comandos de barra da VSync:
// 1 a 32 caracteres, minúsculas, números, "-" ou "_".
const ALIAS_VALIDO = /^[a-z0-9_-]{1,32}$/;

// Limite de comandos globais por aplicativo na VSync.
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

export async function registrarComandos(appId, comandos) {
    const aliases = aliasesPorComandos.get(comandos) ?? new Map();

    const montar = (name, { description, options }) => ({
        name,
        description,
        ...(options ? { options } : {})
    });

    // Cada comando seguido dos seus aliases, que repetem a
    // descrição e as opções do comando original.
    const payload = [
        ...[...comandos.values()].map(
            comando => montar(comando.name, comando)
        ),
        ...[...aliases].map(
            ([alias, comando]) => montar(alias, comando)
        )
    ];

    if (payload.length > LIMITE_COMANDOS) {
        throw new Error(
            `São ${payload.length} comandos de barra (${comandos.size} ` +
            `comandos + ${aliases.size} aliases), acima do limite de ` +
            `${LIMITE_COMANDOS} da VSync. Remova aliases.`
        );
    }

    const resposta = await fetch(
        `${API}/applications/${appId}/commands`,
        {
            method: "PUT",
            headers,
            body: JSON.stringify(payload)
        }
    );

    if (!resposta.ok) {
        throw new Error(
            `Erro ao registrar comandos: ${resposta.status} - ${await resposta.text()}`
        );
    }

    console.log(
        `${payload.length} comandos registrados! ` +
        `(${comandos.size} comandos + ${aliases.size} aliases)`
    );
}