
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

import { resolverComando } from "../../command-registry.mjs";

import { prisonBlock } from "../crime/prison.mjs";

import { commandGate, antiSpamText } from "./anti-spam.mjs";

import { startLiveUpdate } from "./live-embed.mjs";

import { deliverMessage } from "./v2-delivery.mjs";

import { LIVE_CONFIG } from "../../config/live.mjs";

import { createEmbed, HELENA_COLORS } from "../../utils/embed.mjs";

export const PREFIX = "h";

// Os avisos do próprio prefixo (manutenção, bloqueio, uso errado e falha) saem como embed, no
// mesmo desenho das outras respostas. O aviso de intervalo entre comandos (anti-spam) continua
// uma linha de texto: é curto de propósito, para o aviso não virar spam no canal.
const notice = ({ title, description, color, mood }) => ({
    embeds: [createEmbed({ section: "Aviso", title, description, color, mood })]
});

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
            maxMs: Math.min(live.maxMs ?? Infinity, LIVE_CONFIG.channelMaxMs),
            ...(live.intervalMs ? { intervalMs: live.intervalMs } : {}),
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
    edit,
    gate = commandGate
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
            await send(message, notice({
                title: "🛠️ Helena está em manutenção",
                description: "Estou sendo ajustada e volto já, já.",
                color: HELENA_COLORS.warning,
                mood: "dormindo"
            }));

            return true;
        }

        if (blocked(actorId)) {
            await send(message, notice({
                title: "🚫 Acesso bloqueado",
                description: "Seu acesso à Helena foi bloqueado.",
                color: HELENA_COLORS.error,
                mood: "triste"
            }));

            return true;
        }
    }

    // Intervalo entre comandos. Vem antes de qualquer trabalho (nome no
    // banco, comando) para o spam sair barato, e só conta comando de verdade:
    // conversa que começa com "h" nunca chega aqui.
    const espera = gate.check(actorId);

    if (!espera.allowed) {
        // Só o primeiro aviso da janela vira mensagem; as outras tentativas
        // são ignoradas, senão o próprio aviso seria spam no canal.
        if (espera.firstWarning) {
            await send(message, { body: antiSpamText(espera.remainingMs) });
        }

        return true;
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

        await send(message, notice({
            title: "⚠️ Confira o comando",
            description: `${error.message}\n${usageHint(commandName, comando.options)}`,
            color: HELENA_COLORS.warning,
            mood: "alerta"
        }));

        return true;
    }

    // Adaptador: entrega o mesmo formato do comando de
    // barra do Discord. data.options é um objeto indexado
    // pelo nome da opção, e opções do tipo user chegam
    // como ID (string).
    const interaction = {
        id: message.id,
        type: "command",
        guildId: message.guildId,
        channelId: message.channelId,
        user,

        // o membro (apelido, cargos, entrada no servidor), como o comando de barra entrega
        member: message.member ?? null,

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

        // Com HELENA_V2 ligado o embed sai como layout V2; se o Discord recusar, sai o
        // clássico. A resposta com atualização ao vivo (live) fica sempre no clássico,
        // porque as edições seguintes são feitas com embed.
        const sent = await deliverMessage({
            data: {
                body: data.body ?? "",
                ...(data.embeds ? { embeds: data.embeds } : {}),
                ...(data.components ? { components: data.components } : {}),
                ...(data.files ? { files: data.files } : {}),
                ...(data.layout ? { layout: data.layout } : {})
            },
            userId: actorId,
            skip: Boolean(result.live),
            send: payload => send(message, payload)
        });

        iniciarAoVivo(result.live, sent, message, edit);

        return true;

    } catch (error) {
        console.error(
            `[PREFIX] Erro em h${commandName}:`,
            error
        );

        await send(message, notice({
            title: "❌ Algo deu errado",
            description: "Ocorreu um erro ao executar este comando. Tente de novo em instantes.",
            color: HELENA_COLORS.error,
            mood: "triste"
        }));

        return true;
    }
}