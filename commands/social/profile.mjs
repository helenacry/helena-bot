
import { db } from "../../database/connection.mjs";
import { isOwner } from "../../services/platform/developer.mjs";
import { getPlayer } from "../../database/economy.mjs";
import { getJob } from "../../config/jobs.mjs";
import { xpForLevel } from "../../services/progress/experience.mjs";
import { getMarriage } from "../../services/social/marriage.mjs";
import { getPlayerName } from "../../services/platform/player-names.mjs";
import { getEquippedWeapon } from "../../services/combat/equipment.mjs";
import { getPlayerRank } from "../../services/economy/player-rank.mjs";

import {
    resolveUser,
    lookupProblem,
    shownName
} from "../../services/platform/user-lookup.mjs";

import {
    checkAchievements,
    getEquippedTitle
} from "../../services/progress/achievements.mjs";

import { renderProfileCard } from "../../services/social/profile-card.mjs";

import {
    uploadVSyncAttachment
} from "../../services/platform/vsync-attachments.mjs";

import {
    errorEmbed,
    warningEmbed
} from "../../utils/embed.mjs";

const MAX_LEVEL = 100;

// Dados de outra pessoa, só para leitura: olhar o perfil de
// alguém não cria registro nem altera nada. Quem nunca jogou
// aparece com os valores iniciais.
function readPlayer(guildId, userId) {
    const row = db.prepare(`
        SELECT *
        FROM players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    const global = db.prepare(`
        SELECT gems
        FROM global_users
        WHERE user_id = ?
    `).get(userId);

    return {
        wallet: 0,
        bank: 0,
        xp: 0,
        level: 1,
        bio: "",
        ...row,
        gems: global?.gems ?? 0
    };
}

export default {
    name: "perfil",
    aliases: ["profile"],

    description: "Consulte o cartão de perfil na Helena",

    options: [
        {
            name: "usuario",
            description:
                "@usuário ou @menção de quem você quer ver (vazio = você)",
            type: "string",
            required: false
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const channelId = interaction.channelId;
        const userId = interaction.user?.id;

        if (!guildId || !channelId || !userId) {
            return errorEmbed(
                "O perfil só pode ser enviado em um canal de servidor."
            );
        }

        try {

            // ==================================
            // DE QUEM É O PERFIL?
            // ==================================

            // Sem argumento, é o seu. Com nome, menção ou ID,
            // procura a pessoa no servidor.
            let target = {
                id: userId,
                self: true,

                name:
                    interaction.user?.displayName ||
                    interaction.user?.username ||
                    "Jogador",

                avatarUrl: interaction.user?.avatarUrl || null
            };

            const query = String(
                interaction.data?.options?.usuario ?? ""
            ).trim();

            if (query) {
                // Só pelo @usuário (que é único) ou por menção: apelidos
                // e nomes de exibição das plataformas não entram na busca.
                const found = await resolveUser(
                    guildId,
                    query,
                    { by: "username" }
                );

                const problem = lookupProblem(
                    found,
                    query,
                    { by: "username" }
                );

                if (problem) {
                    return warningEmbed(
                        problem.title,
                        problem.message
                    );
                }

                if (found.user.bot) {
                    return warningEmbed(
                        "Sem perfil",
                        "Bots não têm perfil na Helena."
                    );
                }

                // Se a busca achou você mesmo, segue como o seu perfil.
                if (found.user.id !== userId) {
                    target = {
                        id: found.user.id,
                        self: false,
                        name: shownName(found.user),
                        avatarUrl: found.user.avatarUrl
                    };
                }
            }

            const player = target.self
                ? await getPlayer(guildId, target.id)
                : readPlayer(guildId, target.id);

            if (!player) {
                return errorEmbed(
                    "Não foi possível localizar o perfil."
                );
            }

            const job = getJob(player.job_id);

            const marriage = await getMarriage(
                guildId,
                target.id
            );

            const owner = isOwner(target.id);

            // Atualizar conquistas pode conceder recompensas:
            // só no seu próprio perfil.
            if (target.self) {
                await checkAchievements(guildId, target.id);
            }

            const equippedTitle = await getEquippedTitle(
                guildId,
                target.id
            );

            const title = equippedTitle?.formatted || "";

            const bio =
                String(player.bio || "").trim() ||
                "Nenhuma bio definida.";

            const spouseName = marriage
                ? await getPlayerName(marriage.spouse_id)
                : null;

            const weapon = await getEquippedWeapon(
                guildId,
                target.id
            );

            const level = Math.max(
                1,
                Number(player.level) || 1
            );

            const xp = Math.max(
                0,
                Number(player.xp) || 0
            );

            const currentLevelXp = xpForLevel(level);

            const nextLevelXp = level >= MAX_LEVEL
                ? currentLevelXp
                : xpForLevel(level + 1);

            const xpProgress = Math.max(
                0,
                xp - currentLevelXp
            );

            const xpRequired = Math.max(
                0,
                nextLevelXp - currentLevelXp
            );

            const png = await renderProfileCard({
                name: target.name,

                isOwner: owner,

                avatarUrl: target.avatarUrl,

                title,
                bio,

                bank: Number(player.bank || 0) / 100,
                wallet: Number(player.wallet || 0) / 100,
                gems: Number(player.gems || 0),

                job: job?.name || "Desempregado(a)",

                weapon: weapon
                    ? `${weapon.emoji || "🔫"} ${weapon.name}`
                    : "Nenhuma",

                weaponDamage: weapon
                    ? Number(weapon.damage || 10)
                    : undefined,

                // Posição no ranking de patrimônio, igual à do /ranking.
                rank: getPlayerRank(guildId, target.id),

                level,
                maxLevel: MAX_LEVEL,

                xpProgress,
                xpRequired,
                totalXp: xp,

                married: Boolean(marriage),

                spouseName:
                    spouseName ||
                    (marriage ? "Desconhecido" : null)
            });

            if (!Buffer.isBuffer(png) || png.length === 0) {
                throw new Error(
                    "O gerador não retornou um PNG válido."
                );
            }

            // O cartão vai direto da memória para a VSync:
            // nada é gravado em disco.
            const safeId = String(target.id).replace(
                /[^a-zA-Z0-9_-]/g,
                "_"
            );

            const attachment = await uploadVSyncAttachment({
                guildId,
                channelId,
                bytes: png,
                filename: `helena-perfil-${safeId}.png`,
                contentType: "image/png"
            });

            if (!attachment?.reference) {
                throw new Error(
                    "O upload não retornou a referência do anexo."
                );
            }

            console.log(
                "[PERFIL] Cartão enviado:",
                attachment.reference
            );

            return {
                type: "message",

                data: {
                    // A mensagem menciona o dono do perfil: você, no
                    // seu, ou a pessoa pesquisada, no de outra.
                    body: target.self
                        ? `<@${userId}>`
                        : `Perfil de <@${target.id}>`,

                    attachments: [
                        attachment.reference
                    ]
                }
            };

        } catch (error) {
            console.error("[PERFIL]", error);

            return errorEmbed(
                "Não foi possível gerar ou enviar o cartão de perfil."
            );
        }
    }
};
