
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isOwner } from "../../services/developer.mjs";
import { getPlayer } from "../../database/economy.mjs";
import { getJob } from "../../config/jobs.mjs";
import { xpForLevel } from "../../services/experience.mjs";
import { getMarriage } from "../../services/marriage.mjs";
import { getPlayerName } from "../../services/player-names.mjs";
import { WEAPON_TYPES } from "../../config/items.mjs";
import { getEquippedWeapon } from "../../services/equipment.mjs";

import {
    checkAchievements,
    getEquippedTitle
} from "../../services/achievements.mjs";

import { renderProfileCard } from "../../services/profile-card.mjs";

import {
    uploadVSyncAttachment
} from "../../services/vsync-attachments.mjs";

import { errorEmbed } from "../../utils/embed.mjs";

const MAX_LEVEL = 100;

const OWNER_ID = String(
    process.env.HELENA_OWNER_ID || ""
).trim();

export default {
    name: "perfil",
    aliases: ["profile"],

    description: "Consulte seu cartão de perfil na Helena",

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

            const player = await getPlayer(guildId, userId);

            if (!player) {
                return errorEmbed(
                    "Não foi possível localizar seu perfil."
                );
            }

            const job = getJob(player.job_id);

            const marriage = await getMarriage(
                guildId,
                userId
            );

            const owner = isOwner(userId);

            const username =
                interaction.user?.displayName ||
                interaction.user?.username ||
                "Jogador";


            await checkAchievements(guildId, userId);

            const equippedTitle = await getEquippedTitle(
                guildId,
                userId
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
                userId
            );

            const weaponType = weapon
                ? WEAPON_TYPES[weapon.weaponType] || "Desconhecido"
                : "";

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
                name: username,

                isOwner: owner,

                avatarUrl:
                    interaction.user?.avatarUrl || null,

                title,
                bio,

                bank: Number(player.bank || 0) / 100,
                wallet: Number(player.wallet || 0) / 100,
                gems: Number(player.gems || 0),

                job: job?.name || "Desempregado(a)",

                weapon: weapon
                    ? `${weapon.emoji || "🔫"} ${weapon.name}`
                    : "Nenhuma",

                weaponDetail: weapon
                    ? `Tipo: ${weaponType} • Dano: ${weapon.damage}`
                    : "",

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

            const outputDir = join(
                process.cwd(),
                "generated",
                "profiles"
            );

            await mkdir(outputDir, {
                recursive: true
            });

            const safeId = String(userId).replace(
                /[^a-zA-Z0-9_-]/g,
                "_"
            );

            const uniqueId = String(
                interaction.id ||
                `${Date.now()}-${process.hrtime.bigint()}`
            ).replace(
                /[^a-zA-Z0-9_-]/g,
                "_"
            );

            const filename =
                `helena-perfil-${safeId}-${uniqueId}.png`;

            const imagePath = join(
                outputDir,
                filename
            );

            await writeFile(imagePath, png);

            console.log(
                "[PERFIL] Cartão PNG gerado:",
                imagePath
            );

            const attachment = await uploadVSyncAttachment({
                guildId,
                channelId,
                filepath: imagePath,
                filename,
                contentType: "image/png"
            });

            if (!attachment?.reference) {
                throw new Error(
                    "O upload não retornou a referência do anexo."
                );
            }

            console.log(
                "[PERFIL] Anexo finalizado:",
                attachment.reference
            );


            return {
                type: "message",

                data: {
                    body: `<@${userId}>`,

                    attachments: [
                        attachment.reference
                    ]
                }
            };

        } catch (error) {
            console.error("[PERFIL]", error);

            return errorEmbed(
                "Não foi possível gerar ou enviar seu cartão de perfil."
            );
        }
    }
};