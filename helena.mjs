
import {
    createShardManager,
    resolveShardCount
} from "./services/discord/shards.mjs";

import {
    discordApi
} from "./services/discord/api.mjs";

import { intentsFromEnv } from "./services/discord/gateway.mjs";

import {
    greetMention,
    welcomeCreator
} from "./services/platform/creators.mjs";

import {
    forgetGuildChannels,
    rememberGuildChannels,
    welcomeChannelsOf
} from "./services/platform/guild-channels.mjs";

import {
    createTransport
} from "./services/discord/transport.mjs";

import { loadAppEmojis } from "./services/platform/app-emojis.mjs";

import { siteOnly } from "./services/platform/site-only.mjs";

import {
    normalizeInteraction,
    normalizeMessage
} from "./services/discord/normalize.mjs";

import {
    runMigrations
} from "./database/migrations.mjs";

import {
    runCombatMigrations
} from "./database/combat-migrations.mjs";

import {
    carregarComandos,
    registrarComandos,
    resolverComando
} from "./command-registry.mjs";

import {
    startStatusRotation,
    stopStatusRotation
} from "./services/platform/status.mjs";

import {
    getStatusMessages
} from "./services/platform/status-data.mjs";

import {
    runStreakMigrations
} from "./database/streak-migrations.mjs";

import {
    runFoodMigrations
} from "./database/food-migrations.mjs";

import {
    runSettingsMigrations
} from "./database/settings-migrations.mjs";

import {
    runDeveloperMigrations
} from "./database/developer-migrations.mjs";

import {
    isOwner,
    userId,
    maintenance,
    blocked
} from "./services/platform/developer.mjs";

import {
    processarPrefixo
} from "./services/platform/prefix.mjs";

import {
    commandGate,
    interactionGate,
    antiSpamText
} from "./services/platform/anti-spam.mjs";

import { firstTimeSeen } from "./services/platform/interaction-dedup.mjs";

import {
    startSupportStats,
    stopSupportStats
} from "./services/platform/support-stats.mjs";

import {
    runPlayerNamesMigrations,
    savePlayerName
} from "./services/platform/player-names.mjs";

import {
    runUserinfoHistoryMigrations
} from "./database/userinfo-history-migrations.mjs";

import {
    observe as observeUserinfoHistory
} from "./services/social/userinfo-history.mjs";

import {
    runAchievementMigrations
} from "./database/achievement-migrations.mjs";

import {
    runCrimeMigrations
} from "./database/crime-migrations.mjs";

import {
    runWebMigrations
} from "./database/web-migrations.mjs";

import {
    runMarketMigrations
} from "./database/market-migrations.mjs";

import {
    runFamilyMigrations
} from "./database/family-migrations.mjs";

import {
    importLegacyViews
} from "./services/social/userinfo-views.mjs";

import {
    addShardGuild,
    guildIds,
    removeShardGuild,
    replaceShardGuilds
} from "./services/platform/guild-registry.mjs";

import {
    forgetGatewayLatency,
    recordGatewayLatency,
    setApiProbe
} from "./services/platform/discord-health.mjs";

import { setShardSummary } from "./services/platform/shard-registry.mjs";

import {
    startWebApi,
    stopWebApi
} from "./services/web/web-api.mjs";

import {
    startLaunderingSweeper,
    stopLaunderingSweeper
} from "./services/crime/laundering.mjs";

import {
    prisonBlock
} from "./services/crime/prison.mjs";

import {
    startLiveUpdate,
    stopAllLiveUpdates
} from "./services/platform/live-embed.mjs";

import {
    handleEscapeClick,
    clearEscapeSessions
} from "./services/crime/prison-escape.mjs";

import {
    handlePanelClick,
    handleModalSubmit
} from "./services/panels/panels.mjs";

import {
    handleUserinfoComponent
} from "./services/panels/userinfo-panel.mjs";

import {
    LIVE_CONFIG
} from "./config/live.mjs";

import {
    cardFontAvailable
} from "./services/social/profile-card.mjs";

import {
    emojiDrawingWorks
} from "./services/social/card-emoji.mjs";

import {
    deliverCallback
} from "./services/platform/v2-delivery.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "./utils/embed.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const TOKEN = process.env.DISCORD_BOT_TOKEN;

// Só a API e o site, sem entrar no Discord (app de teste; veja services/platform/site-only.mjs).
const SITE_ONLY = siteOnly();

if (SITE_ONLY) {
    if (!process.env.HELENA_WEB_PORT) {
        throw new Error(
            "HELENA_WEB_ONLY=on precisa de HELENA_WEB_PORT: sem a API não há o que subir."
        );
    }

    console.warn(
        "[SISTEMA] Modo só-site (HELENA_WEB_ONLY=on): a Helena NÃO entra no Discord e não responde a ninguém."
    );

} else if (!TOKEN) {
    throw new Error(
        "DISCORD_BOT_TOKEN não configurado."
    );
}

const api = discordApi();

// Responde, edita e envia traduzindo o formato da Helena para o do Discord
// (services/discord/). Criado depois da autenticação, quando o ID do aplicativo é conhecido.
let transport = null;

// ==========================================
// RESPONDER INTERAÇÃO SLASH
// ==========================================

async function responderInteracao(
    interaction,
    resultado
) {
    // "live" é só para o bot: não pode ir no corpo enviado à API.
    const { live, ...payload } = resultado ?? {};

    // As telas da fuga da prisão e as ligações do Gozofone são editadas depois com embeds
    // (editarRespostaOriginal, edição ao vivo), como a contagem ao vivo: ficam no clássico,
    // sem misturar os dois formatos.
    const customId = String(interaction.data?.customId ?? "");

    const manterClassico =
        Boolean(live) ||
        customId.startsWith("fuga:") ||
        customId.startsWith("gf:");

    const callback = await deliverCallback({
        payload,
        userId: interaction.user?.id,
        skip: manterClassico,
        post: transport.callbackFor(interaction)
    });

    if (!callback.ok) {
        console.error(
            "[CALLBACK]",
            callback.status,
            await callback.text()
        );
    }

    // Resposta com contagem ao vivo (ex.: tempo da prisão):
    // continua editando a mesma mensagem enquanto o token da
    // interação valer.
    if (callback.ok && live) {
        startLiveUpdate({
            key: live.key,
            render: live.render,
            maxMs: Math.min(live.maxMs ?? Infinity, LIVE_CONFIG.interactionMaxMs),
            ...(live.intervalMs ? { intervalMs: live.intervalMs } : {}),
            edit: data => editarRespostaOriginal(interaction, data)
        });
    }

    return callback.ok;
}

// ==========================================
// EDITAR MENSAGENS (ATUALIZAÇÃO AO VIVO)
// ==========================================

// Se o Discord recusar a edição, o transporte lança LiveEditError com o
// status e o tempo de espera pedido (429), para o mecanismo de
// atualização decidir se tenta de novo ou desiste.

// Mensagem de canal enviada pelo prefixo h.
function editarMensagemCanal(message, messageId, data) {
    return transport.editMessage(message, messageId, data);
}

// Resposta original de um comando de barra. A rota usa o
// token da interação, sem o cabeçalho de autorização do bot
// (e vale por 15 minutos).
function editarRespostaOriginal(interaction, data) {
    return transport.editOriginal(interaction, data);
}

// Os avisos do próprio bot (manutenção, bloqueio, componente que não existe mais, falha) saem
// como um embed pequeno, no desenho das outras respostas (docs/bot-design.md). O texto vem com
// o emoji na frente ("🛠️ Helena está em manutenção."): o emoji escolhe o título, a cor e o humor.
const AVISOS = {
    "🛠️": { title: "Em manutenção", color: HELENA_COLORS.warning, mood: "dormindo" },
    "🚫": { title: "Acesso bloqueado", color: HELENA_COLORS.error, mood: "triste" },
    "⏳": { title: "Devagar", color: HELENA_COLORS.wait, mood: "dormindo" },
    "❌": { title: "Algo deu errado", color: HELENA_COLORS.error, mood: "triste" }
};

function mensagemErro(
    texto = "❌ Ocorreu um erro ao executar esta ação.",
    { privado = true } = {}
) {
    const match = /^(🛠️|🚫|⏳|❌)\s+([\s\S]*)$/u.exec(texto);

    const emoji = match?.[1] ?? "❌";
    const aviso = AVISOS[emoji];

    return {
        type: "message",

        data: {
            embeds: [createEmbed({
                section: "Aviso",
                title: `${emoji} ${aviso.title}`,
                description: match?.[2] ?? texto,
                color: aviso.color,
                mood: aviso.mood
            })],

            ...(privado ? { ephemeral: true } : {})
        }
    };
}

// ==========================================
// ENVIAR MENSAGEM NORMAL AO CANAL
// ==========================================

// Utilizado pelo /perfil e pelos comandos
// executados através do prefixo h.

async function enviarMensagemCanal(
    interaction,
    data
) {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId || !channelId) {
        throw new Error(
            "Servidor ou canal não identificado."
        );
    }

    return transport.send(interaction, data);
}

// ==========================================
// EXECUÇÃO ESPECIAL DO /PERFIL
// ==========================================

// Confirma a interação antes da geração
// da imagem com Sharp.
//
// Depois publica o cartão no canal.

async function executarPerfil(
    interaction,
    comando
) {
    const confirmado = await responderInteracao(
        interaction,
        {
            type: "message",

            data: {
                body:
                    "🎨 Gerando seu cartão de perfil...",

                ephemeral: true
            }
        }
    );

    if (!confirmado) {
        console.error(
            "[PERFIL] Não foi possível confirmar a interação."
        );

        return;
    }

    try {
        const resultado =
            await comando.execute(interaction);

        if (!resultado) {
            console.error(
                "[PERFIL] O comando não retornou uma resposta."
            );

            return;
        }

        if (
            resultado.type !== "message" ||
            !resultado.data
        ) {
            throw new Error(
                "Formato de resposta inválido no /perfil."
            );
        }

        const data = resultado.data;

        if (data.ephemeral) {
            console.error(
                "[PERFIL] O comando retornou um erro:",
                data.body
            );

            return;
        }

        await enviarMensagemCanal(
            interaction,
            {
                body: data.body ?? "",

                ...(data.files
                    ? {
                        files: data.files
                    }
                    : {}),

                ...(data.embeds
                    ? {
                        embeds: data.embeds
                    }
                    : {})
            }
        );

        console.log(
            "[PERFIL] Cartão publicado no canal."
        );

    } catch (erro) {
        console.error(
            "[PERFIL] Falha na execução ou publicação:",
            erro
        );
    }
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================

// O Discord diz quem é o aplicativo deste token. Se o token estiver errado, o erro
// aparece já aqui, com o motivo, em vez de o bot subir mudo.
let application = null;

if (!SITE_ONLY) {
    try {
        application = await api.application();

    } catch (erro) {
        throw new Error(
            `Erro de autenticação: ${erro.message}`
        );
    }
}

const appId = application?.id ?? null;

if (!SITE_ONLY) {
    transport = createTransport(api, appId);

    // O /ping mede a API do Discord com uma chamada leve (a mesma que confirma quem é o bot).
    setApiProbe(() => api.me());

    // Os emojis da Helena (os desenhos de assets/emojis enviados ao aplicativo). Sem eles, ficam os comuns.
    await loadAppEmojis(api, appId);
}

// ==========================================
// MIGRAÇÕES
// ==========================================

runMigrations();
runCombatMigrations();
runDeveloperMigrations();
runStreakMigrations();
runPlayerNamesMigrations();
runAchievementMigrations();
runCrimeMigrations();
runWebMigrations();
runMarketMigrations();
runFamilyMigrations();
runUserinfoHistoryMigrations();
runFoodMigrations();
runSettingsMigrations();

// Traz o contador antigo do /userinfo (JSON) para o banco, uma vez.
// O arquivo vira views.json.imported; sem ele, não faz nada.
{
    const legado = importLegacyViews();

    if (legado.imported !== undefined) {
        console.log(
            `[USERINFO] Contador antigo importado para o banco: ${legado.imported} pessoas.`
        );
    }
}

// ==========================================
// CARREGAR E REGISTRAR COMANDOS
// ==========================================

const comandos = await carregarComandos();

if (!SITE_ONLY) {
    await registrarComandos(
        appId,
        comandos
    );
}

console.log(
    `[COMANDOS] ${comandos.size} comandos carregados.`
);

console.log(
    "[PREFIXO] Sistema de comandos h preparado."
);

// O cartão do /perfil é desenhado em Poppins: avisa logo na subida se a fonte
// não foi achada (o cartão sairia com a fonte reserva, sem ninguém notar).
cardFontAvailable()
    .then(found => console.log(
        found
            ? "[CARTÃO] Fonte Poppins carregada."
            : "[CARTÃO] ⚠️ Fonte Poppins não encontrada: o cartão do /perfil vai usar a fonte reserva."
    ))
    .catch(error => console.warn(
        "[CARTÃO] Não consegui conferir a fonte:",
        error?.message ?? error
    ));

// Os emojis de nome, bio e cônjuge são desenhados como imagem (Twemoji): confere que esta máquina
// desenha mesmo. Se não desenhar, o cartão volta a tirar os emojis do texto.
emojiDrawingWorks()
    .then(works => console.log(
        works
            ? "[CARTÃO] Emojis coloridos prontos (Twemoji)."
            : "[CARTÃO] ⚠️ Emojis coloridos indisponíveis: o cartão do /perfil vai tirar os emojis do texto."
    ))
    .catch(error => console.warn(
        "[CARTÃO] Não consegui conferir os emojis:",
        error?.message ?? error
    ));

// Credita as lavagens concluídas e avisa o canal onde
// foram iniciadas.
if (!SITE_ONLY) {
    startLaunderingSweeper(
        ({ guildId, channelId, userId, body }) =>
            enviarMensagemCanal(
                // o aviso é da pessoa que lavou: sai no idioma que ela escolheu
                { guildId, channelId, user: { id: userId } },
                { body }
            )
    );
}

// API do painel do site (daily e gemas pelo navegador). Só liga se
// HELENA_WEB_PORT estiver definida; sem ela, o bot funciona como sempre.
// Uma falha aqui nunca derruba o bot.
startWebApi().catch(erro => {
    console.error("[WEB] Não foi possível iniciar a API do site:", erro);
});

// ==========================================
// COMPONENTES INTERATIVOS
// ==========================================

async function executarComponente(interaction) {
    const customId = String(
        interaction.data?.customId || ""
    );

    // Fuga da prisão: botão "Tentar fuga" e as saídas do minigame.
    // As telas seguintes saem editando a resposta original.
    if (customId.startsWith("fuga:")) {
        return handleEscapeClick(interaction, {
            edit: data => editarRespostaOriginal(interaction, data)
        });
    }

    // Painéis (banco, lavagem, bio, loja): o botão abre um modal.
    const painel = handlePanelClick(interaction);

    if (painel) {
        return painel;
    }

    // Os menus do /userinfo (mais informações e outros membros): buscam a pessoa na API,
    // então a resposta é assíncrona.
    if (customId.startsWith("userinfo:")) {
        return handleUserinfoComponent(interaction, comandos);
    }

    console.warn(
        "[COMPONENTE DESCONHECIDO]",
        customId
    );

    return mensagemErro(
        "❌ Este componente não está disponível."
    );
}

// ==========================================
// ENVIO DE MODAIS (FORMULÁRIOS)
// ==========================================

// O formulário aberto por um botão de painel chega aqui como
// modal_submit; roda o comando correspondente com os valores
// digitados.
async function executarModal(interaction) {
    const resposta = await handleModalSubmit(
        interaction,
        comandos
    );

    if (resposta) {
        return resposta;
    }

    console.warn(
        "[MODAL DESCONHECIDO]",
        interaction.data?.customId
    );

    return mensagemErro(
        "❌ Este formulário não está disponível."
    );
}

// ==========================================
// ESTADO DO GATEWAY
// ==========================================

// O gerente das conexões com o Discord: uma por fragmento (shard), uma só enquanto o Discord não
// exigir mais (services/discord/shards.mjs).
let shardManager = null;

let shuttingDown = false;

// O ID do próprio bot (o READY informa): é a menção dele que reconhecemos no texto. Antes do READY, o
// ID do aplicativo, que para um bot é o mesmo.
let botUserId = appId;

// A rotação de status e os contadores de suporte rodam enquanto algum fragmento estiver conectado.
let rotacaoAtiva = false;

// ==========================================
// ESTADO DOS SERVIDORES
// ==========================================

// O conjunto vive em services/platform/guild-registry.mjs, compartilhado com a API do site. Cada
// fragmento recebe os servidores dele: o registro guarda quais são de quem, para o READY de um
// fragmento refazer só os dele sem apagar os dos outros.

// fragmentos que já receberam o READY ao menos uma vez
const readyShards = new Set();

let guildCountComplete = false;

// ==========================================
// SNAPSHOT DE SERVIDORES
// ==========================================

// No READY o Discord manda a lista dos servidores do bot (cada um como { id, unavailable }) e
// completa cada um com um GUILD_CREATE logo depois. Os IDs já vêm todos no READY.
function processarReadyGuilds(data, shardId = 0) {
    const guilds = Array.isArray(data?.guilds) ? data.guilds : [];

    // um READY novo refaz só os servidores deste fragmento
    const own = replaceShardGuilds(
        shardId,
        guilds
            .filter(guild => guild?.id !== undefined && guild?.id !== null)
            .map(guild => guild.id)
    );

    readyShards.add(shardId);

    // a contagem só é completa quando todos os fragmentos já mandaram o seu
    guildCountComplete = readyShards.size >= (shardManager?.total ?? 1);

    console.log(
        `[GUILDS] ${own} servidores recebidos no READY` +
        (shardManager && shardManager.total > 1 ? ` do fragmento ${shardId}/${shardManager.total}` : "") +
        `: ${guildIds.size} no total.`
    );
}

// ==========================================
// EVENTOS DE SERVIDORES
// ==========================================

function processarEventoGuild(nome, dados, shardId = 0) {
    const guildId = dados?.id !== undefined && dados?.id !== null
        ? String(dados.id)
        : null;

    if (!guildId) {
        console.warn(
            `[GUILDS] ${nome} sem ID reconhecido.`
        );

        return;
    }

    if (nome === "GUILD_CREATE") {
        addShardGuild(shardId, guildId);

        // onde falar neste servidor (as boas-vindas aos criadores)
        rememberGuildChannels(dados);
    }

    // unavailable: true é uma queda do Discord naquele servidor, e o bot continua nele.
    if (nome === "GUILD_DELETE" && !dados.unavailable) {
        removeShardGuild(shardId, guildId);

        forgetGuildChannels(guildId);
    }

    console.log(
        `[GUILDS] ${nome}: ${guildIds.size} servidores conhecidos.`
    );
}

// ==========================================
// OBTER STATUS COM DADOS REAIS
// ==========================================

function obterMensagensStatus() {
    return getStatusMessages({
        guildCount: guildIds.size,

        guildCountComplete,

        shards: shardManager
            ? { ready: shardManager.readyCount(), total: shardManager.total }
            : null
    });
}

// ==========================================
// SISTEMA DE PRESENÇA
// ==========================================

async function atualizarPresenca(message) {
    if (
        typeof message !== "string" ||
        !message.trim() ||
        Array.from(message).length > 64
    ) {
        throw new Error(
            "A atividade precisa conter entre 1 e 64 caracteres."
        );
    }

    if (!shardManager?.isConnected()) {
        throw new Error(
            "Gateway não está conectado."
        );
    }

    // a atividade vai para todos os fragmentos conectados
    await shardManager.setPresence(message);
}

// ==========================================
// COMANDOS COM PREFIXO H
// ==========================================

// Exemplos:
// hajuda
// hperfil
// hdaily
// hajuda economia

async function tratarMensagem(dados) {
    const message = normalizeMessage(dados);

    // O Discord entrega ao bot todas as mensagens que ele pode ver, inclusive as dele,
    // as de outros bots e as de webhooks: nenhuma delas é comando. Conversa privada
    // também não (o jogo é de cada servidor).
    if (
        !message ||
        !message.guildId ||
        message.author?.bot ||
        message.webhookId
    ) {
        return;
    }

    let eraComando = false;

    try {
        eraComando = await processarPrefixo({
            message,

            comandos,

            send: enviarMensagemCanal,

            edit: editarMensagemCanal,

            // a mesma mensagem não roda duas vezes
            firstTime: firstTimeSeen
        });

    } catch (erro) {
        console.error(
            "[ERRO PREFIXO]",
            erro
        );
    }

    // Quem me criou me mencionou (e não era um comando): uma resposta fofa, só para os criadores.
    if (!eraComando) {
        await greetMention({
            message,

            botId: botUserId,

            send: enviarMensagemCanal
        });
    }
}

// ==========================================
// OS CRIADORES ENTRAM EM UM SERVIDOR
// ==========================================

// GUILD_MEMBER_ADD só chega com HELENA_MEMBERS_INTENT=on (a Server Members Intent ligada no portal).
// Só os criadores recebem boas-vindas; quem entra e não é criador não gera nada.
async function tratarEntradaDeMembro(dados) {
    try {
        const canal = await welcomeCreator({
            event: dados,

            channelsOf: welcomeChannelsOf,

            send: (alvo, mensagem) => transport.send(alvo, mensagem)
        });

        if (canal) {
            console.log(
                `[CRIADORES] Boas-vindas no servidor ${dados.guild_id} (canal ${canal}).`
            );
        }

    } catch (erro) {
        console.error(
            "[CRIADORES]",
            erro
        );
    }
}

// ==========================================
// INTERAÇÕES (COMANDOS DE BARRA, BOTÕES, MENUS E FORMULÁRIOS)
// ==========================================

async function tratarInteracao(interaction) {
    // ping e autocompletar não são tratados
    if (!interaction) {
        return;
    }

    // ==================================
    // A MESMA INTERAÇÃO NÃO RODA DUAS VEZES
    // ==================================

    // Depois de uma reconexão do gateway o Discord pode entregar de novo uma interação já tratada.
    if (!firstTimeSeen(interaction.id)) {
        return;
    }

    // ==================================
    // IDENTIFICAR USUÁRIO
    // ==================================

    const actorId = userId(interaction);

    // ==================================
    // PROTEÇÃO DO DESENVOLVEDOR
    // ==================================

    if (
        !isOwner(actorId) &&
        (
            maintenance() ||
            blocked(actorId)
        )
    ) {
        const reason = maintenance()
            ? "🛠️ Helena está em manutenção."
            : "🚫 Seu acesso à Helena foi bloqueado.";

        await responderInteracao(
            interaction,
            mensagemErro(reason)
        );

        return;
    }

    // ==================================
    // REGISTRAR QUEM USA
    // ==================================

    // Só depois da proteção acima: quem está bloqueado (ou quando o bot está em manutenção) não tem o
    // nome nem o histórico de ícones gravados.
    if (interaction.user?.id) {
        savePlayerName(
            interaction.user
        );

        // o histórico de nomes e ícones de quem usa a Helena (services/social/userinfo-history.mjs)
        observeUserinfoHistory(
            interaction.user
        );
    }

    // ==================================
    // LOG DA INTERAÇÃO
    // ==================================

    console.log(
        `[INTERAÇÃO] ${interaction.type}` +
        ` ${interaction.type === "command"
            ? "/" + interaction.data?.name
            : interaction.data?.customId ?? ""}` +
        ` usuário=${actorId} servidor=${interaction.guildId ?? "-"}`
    );

    // ==================================
    // COMPONENTES INTERATIVOS
    // ==================================

    if (
        interaction.type === "component"
    ) {
        // Clique rápido demais (ou uma enxurrada): ignora em silêncio, sem mexer na mensagem. A fuga da
        // prisão e o Gozofone são cronometrados e ficam de fora.
        const cronometrado = /^(fuga|gf):/.test(
            String(interaction.data?.customId ?? "")
        );

        if (
            !cronometrado &&
            !interactionGate.check(actorId).allowed
        ) {
            await responderInteracao(
                interaction,
                { type: "defer_update" }
            );

            return;
        }

        let resultado;

        try {
            resultado =
                await executarComponente(
                    interaction
                );

        } catch (erro) {
            console.error(
                "[ERRO COMPONENTE]",
                erro
            );

            resultado = mensagemErro(
                "❌ Não foi possível processar esta interação."
            );
        }

        await responderInteracao(
            interaction,
            resultado
        );

        return;
    }

    // ==================================
    // FORMULÁRIOS (MODAIS)
    // ==================================

    if (
        interaction.type === "modal_submit"
    ) {
        // Um formulário roda o comando de verdade (transferir, depositar, buscar): vale o mesmo
        // intervalo curto dos botões, mas aqui a pessoa precisa de uma resposta.
        const espera = interactionGate.check(actorId);

        if (!espera.allowed) {
            await responderInteracao(
                interaction,
                mensagemErro(
                    antiSpamText(espera.remainingMs)
                )
            );

            return;
        }

        let resultado;

        try {
            resultado =
                await executarModal(
                    interaction
                );

        } catch (erro) {
            console.error(
                "[ERRO MODAL]",
                erro
            );

            resultado = mensagemErro(
                "❌ Não foi possível processar este formulário."
            );
        }

        await responderInteracao(
            interaction,
            resultado
        );

        return;
    }

    // ==================================
    // FILTRAR COMANDOS
    // ==================================

    if (
        interaction.type !== "command"
    ) {
        return;
    }

    // ==================================
    // LOCALIZAR COMANDO
    // ==================================

    const commandName =
        interaction.data?.name;

    // Aceita o nome oficial ou um alias (/ajuda, /help...).
    const comando =
        resolverComando(comandos, commandName);

    if (!comando) {
        console.warn(
            `Comando desconhecido: ${commandName}`
        );

        await responderInteracao(
            interaction,

            mensagemErro(
                "❌ Este comando não está disponível."
            )
        );

        return;
    }

    // ==================================
    // INTERVALO ENTRE COMANDOS
    // ==================================

    // Mesmo intervalo do prefixo h (um só por pessoa). Vem antes
    // da prisão e do /perfil, que gera imagem e é o mais pesado.
    // A interação precisa de resposta: avisa só para a pessoa.
    const espera = commandGate.check(actorId);

    if (!espera.allowed) {
        await responderInteracao(
            interaction,
            mensagemErro(
                antiSpamText(espera.remainingMs)
            )
        );

        return;
    }

    // ==================================
    // PRISÃO
    // ==================================

    // Preso não trabalha, não compra nem movimenta
    // dinheiro. Vale também para os aliases.
    const bloqueioPrisao = prisonBlock(
        comando.name,
        interaction.guildId,
        actorId
    );

    if (bloqueioPrisao) {
        await responderInteracao(
            interaction,
            bloqueioPrisao
        );

        return;
    }

    // ==================================
    // TRATAMENTO ESPECIAL DO /PERFIL
    // ==================================

    // Compara pelo nome oficial: /profile também gera o cartão.
    if (comando.name === "perfil") {
        await executarPerfil(
            interaction,
            comando
        );

        return;
    }

    // ==================================
    // EXECUTAR DEMAIS COMANDOS
    // ==================================

    let resultado;

    try {
        resultado =
            await comando.execute(
                interaction
            );

    } catch (erro) {
        console.error(
            `Erro no comando /${comando.name}:`,
            erro
        );

        resultado = mensagemErro(
            "❌ Ocorreu um erro ao executar o comando.",
            { privado: false }
        );
    }

    // ==================================
    // VALIDAR RESPOSTA
    // ==================================

    if (!resultado) {
        console.error(
            `[COMANDO SEM RESPOSTA] /${comando.name}`
        );

        resultado = mensagemErro(
            "❌ O comando não retornou uma resposta válida."
        );
    }

    // ==================================
    // RESPONDER À INTERAÇÃO
    // ==================================

    console.log(
        `[RESPOSTA] /${comando.name} -> ${resultado.type}` +
        (resultado.data?.ephemeral ? " (privada)" : "")
    );

    await responderInteracao(
        interaction,
        resultado
    );
}

// ==========================================
// EVENTOS DO GATEWAY
// ==========================================

async function tratarEvento(nome, dados, shardId = 0) {
    if (nome === "GUILD_CREATE" || nome === "GUILD_DELETE") {
        processarEventoGuild(nome, dados, shardId);

        return;
    }

    if (nome === "MESSAGE_CREATE") {
        await tratarMensagem(dados);

        return;
    }

    if (nome === "GUILD_MEMBER_ADD") {
        await tratarEntradaDeMembro(dados);

        return;
    }

    if (nome === "INTERACTION_CREATE") {
        await tratarInteracao(
            normalizeInteraction(dados)
        );
    }
}

// ==========================================
// CONECTAR AO GATEWAY
// ==========================================

// O Discord manda um GUILD_CREATE por servidor e um READY por fragmento. Uma conexão só aguenta
// 2500 servidores: o número de fragmentos vem de GET /gateway/bot (ou de HELENA_SHARDS), e cada um
// é um gateway com o seu [id, total] (services/discord/shards.mjs).
function conectarGateway() {
    ligarGateway().catch(erro => {
        console.error("[GATEWAY] Falha ao conectar:", erro);
    });
}

async function ligarGateway() {
    let info = null;

    try {
        info = await api.gateway();

    } catch (erro) {
        console.warn(
            `[FRAGMENTOS] Não consegui perguntar ao Discord quantos fragmentos usar (${erro.message}). Sigo com um só.`
        );
    }

    const decisao = resolveShardCount({ recommended: info?.shards });

    if (decisao.invalid) {
        console.warn(
            `[FRAGMENTOS] HELENA_SHARDS="${decisao.invalid}" não é um número de 1 a 1024: uso o que o Discord recomenda.`
        );
    }

    if (decisao.belowRecommended) {
        console.warn(
            `[FRAGMENTOS] HELENA_SHARDS=${decisao.count} é menos que os ${info?.shards} que o Discord recomenda: ` +
            "uma conexão com mais de 2500 servidores é fechada pelo Discord."
        );
    }

    const limite = info?.session_start_limit;

    console.log(
        `[FRAGMENTOS] ${decisao.count} fragmento(s)` +
        (decisao.source === "env" ? " (HELENA_SHARDS)" : " (recomendado pelo Discord)") +
        (limite ? `; identificações restantes hoje: ${limite.remaining}/${limite.total}.` : ".")
    );

    if (limite && Number.isInteger(limite.remaining) && limite.remaining < decisao.count) {
        console.warn(
            `[FRAGMENTOS] Só restam ${limite.remaining} identificações hoje e eu preciso de ${decisao.count}. ` +
            "Espere o limite do Discord reiniciar."
        );
    }

    setShardSummary({ total: decisao.count, ready: 0 });

    // o resumo e a rotação seguem o que está conectado de verdade
    const sincronizar = () => {
        const prontos = shardManager?.readyCount() ?? 0;

        setShardSummary({ total: decisao.count, ready: prontos });

        if (prontos > 0 && !rotacaoAtiva) {
            rotacaoAtiva = true;

            // Rotação de presença.
            startStatusRotation(
                atualizarPresenca,
                obterMensagensStatus
            );

            // Contadores do servidor de suporte.
            startSupportStats();

            console.log(
                "[STATUS] Rotação com dados reais iniciada."
            );
        }

        // Sem nenhum fragmento conectado, a rotação e os contadores ficam parados (e recomeçam no
        // READY ou no RESUMED do primeiro que voltar).
        if (prontos === 0 && rotacaoAtiva) {
            rotacaoAtiva = false;

            stopStatusRotation();
            stopSupportStats();
        }
    };

    shardManager = createShardManager({
        token: TOKEN,
        total: decisao.count,
        maxConcurrency: info?.session_start_limit?.max_concurrency ?? 1,
        url: typeof info?.url === "string" && info.url.startsWith("wss://") ? info.url : undefined,

        // as intenções: as de sempre, mais a Server Members só com HELENA_MEMBERS_INTENT=on
        intents: intentsFromEnv(process.env),

        onShardReady: (id, dados) => {
            if (dados.user?.id) {
                botUserId = String(dados.user.id);
            }

            if (readyShards.size === 0) {
                console.log(
                    `Online como ${
                        dados.user?.global_name ||
                        dados.user?.username ||
                        "Helena"
                    }`
                );

                console.log(
                    `Comandos carregados: ${comandos.size}`
                );
            }

            processarReadyGuilds(dados, id);

            sincronizar();

            console.log(
                "[PREFIXO] Aguardando comandos iniciados com h."
            );
        },

        onDispatch: tratarEvento,

        // Tempo de ida e volta de cada batimento: é a "conexão" que o /ping mostra.
        onLatency: (id, ms) => recordGatewayLatency(ms, id),

        // A sessão voltou sem READY (o caso normal depois de uma queda curta): a rotação e os
        // contadores, parados quando o último fragmento caiu, recomeçam. A lista de servidores
        // nunca foi apagada.
        onShardResumed: () => sincronizar(),

        // A lista de servidores NÃO é apagada: numa sessão retomada o Discord não manda os
        // servidores de novo, e a API do site (o daily por servidor) depende dela. O READY de uma
        // sessão nova refaz só os do fragmento.
        onShardClose: id => {
            // a medida de antes da queda não vale mais
            forgetGatewayLatency(id);

            sincronizar();
        },

        // Token errado, intenção não liberada ou fragmento inválido: reconectar não adianta. O bot
        // continua de pé (a API do site segue no ar) e o motivo já está no log.
        onShardFatal: (id, { message }) => {
            console.error(
                `[GATEWAY] O fragmento ${id} fica desconectado até isto ser corrigido e o app reiniciado: ${message}`
            );
        }
    });

    // as ondas esperam entre si: não segura o resto do bot
    shardManager.start().catch(erro => {
        console.error("[FRAGMENTOS] Falha ao ligar os fragmentos:", erro);
    });
}

// ==========================================
// ENCERRAMENTO CONTROLADO
// ==========================================

function encerrar(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `[SISTEMA] Recebido ${signal}. Encerrando Helena...`
    );

    stopStatusRotation();

    // Finaliza os contadores de suporte.
    stopSupportStats();

    // Para a conclusão automática das lavagens.
    stopLaunderingSweeper();

    // Fecha a API do painel do site, se estiver ligada.
    stopWebApi().catch(() => {});

    // Para as contagens ao vivo (tempo da prisão).
    stopAllLiveUpdates();

    // Encerra as tentativas de fuga em andamento.
    clearEscapeSessions();

    shardManager?.close();

    shardManager = null;

    process.exitCode = 0;
}

process.once(
    "SIGINT",
    () => encerrar("SIGINT")
);

process.once(
    "SIGTERM",
    () => encerrar("SIGTERM")
);

// ==========================================
// INICIAR HELENA
// ==========================================

if (!SITE_ONLY) {
    conectarGateway();
}
