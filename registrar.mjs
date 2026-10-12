
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

    console.log(
        "[COMANDOS] " +
        [...porPasta].map(([pasta, total]) => `${pasta}: ${total}`).join(" | ")
    );

    return comandos;
}

export async function registrarComandos(appId, comandos) {
    const payload = [...comandos.values()].map(
        ({ name, description, options }) => ({
            name,
            description,
            ...(options ? { options } : {})
        })
    );

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

    console.log(`${payload.length} comandos registrados!`);
}