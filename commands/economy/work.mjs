
import { db } from "../../database/connection.mjs";

import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    calculateLevel
} from "../../services/progress/experience.mjs";

import {
    recordMissionEvent
} from "../../services/economy/missions.mjs";

import {
    getJob
} from "../../config/jobs.mjs";

import {
    WORK_CONFIG
} from "../../config/work.mjs";

import {
    consumeEnergy,
    ENERGY_CONFIG
} from "../../services/economy/energy.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

import { formatDuration } from "../../utils/time.mjs";

const CONFIG = WORK_CONFIG;

export default {
    name: "trabalhar",
    aliases: ["work"],
    description: "Trabalhe para ganhar dinheiro e experiência",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        const now = Math.floor(Date.now() / 1000);

        try {
            // Garante que o jogador exista.
            getPlayer(guildId, userId);

            db.exec("BEGIN IMMEDIATE");

            try {
                const player = db.prepare(`
                    SELECT
                        wallet,
                        xp,
                        level,
                        last_work,
                        job_id
                    FROM players
                    WHERE guild_id = ?
                      AND user_id = ?
                `).get(guildId, userId);

                if (!player) {
                    throw new Error("Jogador não encontrado.");
                }

                // ==================================
                // EMPREGO E SALÁRIO
                // ==================================

                const job = getJob(player.job_id);

                if (!job) {
                    throw new Error(
                        "Seu emprego atual não foi encontrado."
                    );
                }

                const reward = job.salary;

                if (
                    !Number.isSafeInteger(reward) ||
                    reward <= 0
                ) {
                    throw new Error(
                        "O salário deste emprego é inválido."
                    );
                }

                // ==================================
                // COOLDOWN
                // ==================================

                const remaining = Math.max(
                    0,
                    CONFIG.cooldown - (now - player.last_work)
                );

                if (remaining > 0) {
                    db.exec("ROLLBACK");

                    return embedResponse(
                        ledgerEmbed({
                            section: "Trabalho",
                            title: "⏳ Você já trabalhou",
                            say: "O próximo expediente abre em **" + formatDuration(remaining) + "**.",
                            rows: [
                                ["Emprego", job.name],
                                ["Salário", formatMoney(reward)]
                            ],
                            color: HELENA_COLORS.wait,
                            mood: "dormindo",
                            footer: "Enquanto isso: /daily, /missoes ou /crime"
                        })
                    );
                }

                // ==================================
                // LIMITE DA CARTEIRA
                // ==================================

                if (
                    player.wallet >
                    CONFIG.maxWallet - reward
                ) {
                    throw new Error(
                        "Sua carteira atingiu o limite permitido."
                    );
                }

                // ==================================
                // EXPERIÊNCIA
                // ==================================

                const newXp = player.xp + CONFIG.xp;

                if (!Number.isSafeInteger(newXp)) {
                    throw new Error(
                        "Limite de experiência atingido."
                    );
                }

                const newLevel = calculateLevel(newXp);

                // ==================================
                // ENERGIA
                // ==================================

                const energyResult = consumeEnergy(
                    guildId,
                    userId,
                    ENERGY_CONFIG.workCost,
                    now
                );

                if (!energyResult.success) {
                    db.exec("ROLLBACK");

                    return embedResponse(
                        ledgerEmbed({
                            section: "Trabalho",
                            title: "🪫 Sem energia para trabalhar",
                            say: "Você precisa descansar um pouco antes do próximo expediente.",
                            rows: [
                                ["Custo", ENERGY_CONFIG.workCost + " de energia"],
                                ["Você tem", energyResult.energy + "/" + energyResult.max],
                                ["Faltam", String(energyResult.missing)]
                            ],
                            color: HELENA_COLORS.warning,
                            mood: "dormindo",
                            footer: "/energia mostra quando ela volta"
                        })
                    );
                }

                // ==================================
                // ATUALIZAR JOGADOR
                // ==================================

                const update = db.prepare(`
                    UPDATE players
                    SET
                        wallet = wallet + ?,
                        xp = ?,
                        level = ?,
                        last_work = ?
                    WHERE guild_id = ?
                      AND user_id = ?
                      AND wallet <= ?
                      AND last_work <= ?
                `).run(
                    reward,
                    newXp,
                    newLevel,
                    now,
                    guildId,
                    userId,
                    CONFIG.maxWallet - reward,
                    now - CONFIG.cooldown
                );

                if (update.changes !== 1) {
                    throw new Error(
                        "Não foi possível registrar seu trabalho."
                    );
                }

                // ==================================
                // HISTÓRICO FINANCEIRO
                // ==================================

                db.prepare(`
                    INSERT INTO transactions (
                        guild_id,
                        user_id,
                        target_id,
                        type,
                        amount
                    )
                    VALUES (?, ?, NULL, 'work', ?)
                `).run(
                    guildId,
                    userId,
                    reward
                );

                // ==================================
                // MISSÕES
                // ==================================

                recordMissionEvent(
                    guildId,
                    userId,
                    "work"
                );

                // ==================================
                // CONFIRMAR TRANSAÇÃO
                // ==================================

                db.exec("COMMIT");

                const updated = getPlayer(guildId, userId);

                const leveledUp =
                    updated.level > player.level;

                // ==================================
                // EMBED FINAL
                // ==================================

                return embedResponse(
                    ledgerEmbed({
                        section: "Trabalho",
                        title: "💼 Expediente concluído",

                        say:
                            "Dia de trabalho como **" + job.name + "** feito e pago." +
                            (
                                leveledUp
                                    ? "\n> 🎉 **Subiu para o nível " + updated.level + "!**"
                                    : ""
                            ),

                        rows: [
                            ["Pagamento", signed(reward, formatMoney(reward))],
                            ["Experiência", signed(CONFIG.xp, CONFIG.xp + " XP")],
                            ["Energia", signed(-ENERGY_CONFIG.workCost, ENERGY_CONFIG.workCost + " (" + energyResult.energy + "/" + energyResult.max + ")")],
                            null,
                            ["Carteira", formatMoney(updated.wallet)],
                            ["Nível", updated.level + " · " + updated.xp.toLocaleString("pt-BR") + " XP"]
                        ],

                        color: HELENA_COLORS.success,
                        mood: leveledUp ? "festa" : "feliz",

                        footer: "Próximo expediente em 1 hora"
                    })
                );

            } catch (error) {
                if (db.isTransaction) {
                    db.exec("ROLLBACK");
                }

                throw error;
            }

        } catch (error) {
            console.error("[TRABALHAR]", error);

            return errorEmbed(
                "Não foi possível concluir seu trabalho: " +
                error.message
            );
        }
    }
};