
import {
    isOwner,
    maintenance,
    blocked
} from "./developer.mjs";

import {
    savePlayerName
} from "./player-names.mjs";

import {
    parseArguments,
    PrefixUsageError
} from "./prefix-parser.mjs";

import { resolverComando } from "../registrar.mjs";

import { prisonBlock } from "./prison.mjs";

import { startLiveUpdate } from "./live-embed.mjs";

import { LIVE_CONFIG } from "../config/live.mjs";

export const PREFIX = "h";

// Monta a dica de uso exibida quando os argumentos
// estão incorretos: hcomprar <item> [quantidade]

function usageHint(commandName, definitions = []) {
    const parts = definitions.map(definition =>
        definition.required
            ? `<${definition.name}>`
            : `[${definition.name}]`
    );

    return `Uso: \`${PREFIX}${commandName}${
        parts.length ? " " + parts.join(" ") : ""
    }\``;
}

// Quando a resposta pede atualização ao vivo (campo live),
// passa a editar a mensagem recém-enviada. Nunca lança erro:
// a resposta já foi entregue e a atualização é um extra.
function iniciarAoVivo(live, sent, message, edit) {
    if (!live || typeof edit !== "function") {
        return;
    }

    try {
        // A API devolve { message }; aceita também a mensagem direta.
        const sentMessage = sent?.message ?? sent;

        if (!sentMessage?.id) {
            return;
        }

        startLiveUpdate({
            key: live.key,
            render: live.render,
            maxMs: LIVE_CONFIG.channelMaxMs,
            edit: payload => edit(message, sentMessage.id, payload)
        });

    } catch (error) {
        console.warn("[PREFIX] Atualização ao vivo não iniciada:", error);
    }
}

export async function processarPrefixo({
    message,
    comandos,
    send,
    edit
}) {
    const body = String(message.body ?? "").trim();

    if (!body.toLowerCase().startsWith(PREFIX)) {
        return false;
    }

    const content = body.slice(PREFIX.length).trimStart();

    const parsed = content.match(/^(\S+)\s*([\s\S]*)$/);

    if (!parsed) {
        return false;
    }

    const nomeDigitado = parsed[1].toLowerCase();

    const argumentText = parsed[2];

    // Aceita o nome oficial ou um alias (hsaldo, hbal...).
    const comando = resolverComando(comandos, nomeDigitado);

    if (!comando) {
        return false;
    }

    // O alias serve só para achar o comando; daqui em diante
    // vale o nome oficial.
    const commandName = comando.name;

    const user = message.author ?? message.user;

    if (!user?.id || !message.guildId || !message.channelId) {
        console.warn(
            "[PREFIX] Mensagem sem usuário, servidor ou canal reconhecido."
        );

        return true;
    }

    // Impede que o bot execute suas próprias mensagens.
    if (user.bot === true) {
        return true;
    }

    const actorId = String(user.id);

    if (!isOwner(actorId)) {
        if (maintenance()) {
            await send(message, {
                body: "🛠️ Helena está em manutenção."
            });

            return true;
        }

        if (blocked(actorId)) {
            await send(message, {
                body: "🚫 Seu acesso à Helena foi bloqueado."
            });

            return true;
        }
    }

    savePlayerName(user);

    // Preso não trabalha, não compra nem movimenta dinheiro.
    const bloqueioPrisao = prisonBlock(
        comando.name,
        message.guildId,
        actorId
    );

    if (bloqueioPrisao) {
        const sent = await send(message, {
            body: bloqueioPrisao.data.body ?? "",
            embeds: bloqueioPrisao.data.embeds,
            ...(bloqueioPrisao.data.components
                ? { components: bloqueioPrisao.data.components }
                : {})
        });

        iniciarAoVivo(bloqueioPrisao.live, sent, message, edit);

        return true;
    }

    let options;

    try {
        options = parseArguments(
            argumentText,
            comando.options ?? []
        );
    } catch (error) {
        if (!(error instanceof PrefixUsageError)) {
            throw error;
        }

        await send(message, {
            body:
                `❌ ${error.message}\n` +
                usageHint(commandName, comando.options)
        });

        return true;
    }

    // Adaptador: entrega o mesmo formato do comando de
    // barra da VSync. data.options é um objeto indexado
    // pelo nome da opção, e opções do tipo user chegam
    // como ID (string).
    const interaction = {
        id: message.id,
        type: "command",
        guildId: message.guildId,
        channelId: message.channelId,
        user,
        data: {
            name: commandName,
            options
        }
    };

    try {
        const result = await comando.execute(interaction);

        if (result?.type !== "message" || !result.data) {
            throw new Error(
                "O comando não retornou uma resposta compatível."
            );
        }

        const data = result.data;

        const sent = await send(message, {
            body: data.body ?? "",
            ...(data.embeds ? { embeds: data.embeds } : {}),
            ...(data.components ? { components: data.components } : {}),
            ...(data.attachments ? { attachments: data.attachments } : {})
        });

        iniciarAoVivo(result.live, sent, message, edit);

        return true;

    } catch (error) {
        console.error(
            `[PREFIX] Erro em h${commandName}:`,
            error
        );

        await send(message, {
            body: "❌ Ocorreu um erro ao executar este comando."
        });

        return true;
    }
}