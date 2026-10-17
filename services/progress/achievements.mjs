
import { db } from "../../database/connection.mjs";

import {
    getAchievement,
    getAllAchievements,
    formatAchievementTitle
} from "../../config/achievements.mjs";

// ==========================================
// CONSULTAR CONQUISTAS
// ==========================================

export function getUnlockedAchievements(guildId, userId) {
    return db.prepare(`
        SELECT achievement_id, unlocked_at
        FROM player_achievements
        WHERE guild_id = ?
          AND user_id = ?
        ORDER BY unlocked_at DESC
    `).all(
        String(guildId),
        String(userId)
    );
}

export function hasAchievement(guildId, userId, achievementId) {
    return Boolean(
        db.prepare(`
            SELECT 1
            FROM player_achievements
            WHERE guild_id = ?
              AND user_id = ?
              AND achievement_id = ?
        `).get(
            String(guildId),
            String(userId),
            String(achievementId)
        )
    );
}

// ==========================================
// DESBLOQUEAR CONQUISTA
// ==========================================

export function unlockAchievement(
    guildId,
    userId,
    achievementId
) {
    const achievement = getAchievement(achievementId);

    if (!achievement) {
        throw new Error(
            "Conquista desconhecida: " + achievementId
        );
    }

    const result = db.prepare(`
        INSERT OR IGNORE INTO player_achievements (
            guild_id,
            user_id,
            achievement_id
        )
        VALUES (?, ?, ?)
    `).run(
        String(guildId),
        String(userId),
        achievementId
    );

    return result.changes === 1;
}

// ==========================================
// CONSULTAR PROGRESSO
// ==========================================

export function getAchievementProgress(
    guildId,
    userId,
    achievement
) {
    if (!achievement?.requirement) {
        return 0;
    }

    const type = achievement.requirement.type;

    switch (type) {
        // ==================================
        // NÍVEL
        // ==================================

        case "level": {
            const row = db.prepare(`
                SELECT level
                FROM players
                WHERE guild_id = ?
                  AND user_id = ?
            `).get(
                String(guildId),
                String(userId)
            );

            return Number(row?.level || 0);
        }

        // ==================================
        // PATRIMÔNIO
        // ==================================

        case "wealth": {
            const row = db.prepare(`
                SELECT wallet + bank AS wealth
                FROM players
                WHERE guild_id = ?
                  AND user_id = ?
            `).get(
                String(guildId),
                String(userId)
            );

            return Number(row?.wealth || 0);
        }

        // ==================================
        // DAILY STREAK
        // ==================================

        case "streak": {
            const row = db.prepare(`
                SELECT best_streak
                FROM daily_streaks
                WHERE guild_id = ?
                  AND user_id = ?
            `).get(
                String(guildId),
                String(userId)
            );

            // Utiliza o recorde para não retirar
            // conquistas após perder uma sequência.
            return Number(row?.best_streak || 0);
        }

        // ==================================
        // GEMAS
        // ==================================

        case "gems": {
            const row = db.prepare(`
                SELECT gems
                FROM global_users
                WHERE user_id = ?
            `).get(String(userId));

            return Number(row?.gems || 0);
        }

        // ==================================
        // VITÓRIAS EM DUELOS
        // ==================================

        case "duel_wins": {
            const row = db.prepare(`
                SELECT wins
                FROM combat_players
                WHERE guild_id = ?
                  AND user_id = ?
            `).get(
                String(guildId),
                String(userId)
            );

            return Number(row?.wins || 0);
        }

        default:
            return 0;
    }
}

// ==========================================
// VERIFICAR CONQUISTAS AUTOMATICAMENTE
// ==========================================

export function checkAchievements(guildId, userId) {
    const unlocked = [];

    for (const achievement of getAllAchievements()) {
        if (
            hasAchievement(
                guildId,
                userId,
                achievement.id
            )
        ) {
            continue;
        }

        const progress = getAchievementProgress(
            guildId,
            userId,
            achievement
        );

        if (progress < achievement.requirement.target) {
            continue;
        }

        const created = unlockAchievement(
            guildId,
            userId,
            achievement.id
        );

        if (created) {
            unlocked.push(achievement);
        }
    }

    return unlocked;
}

// ==========================================
// TÍTULO EQUIPADO
// ==========================================

export function getEquippedTitle(guildId, userId) {
    const row = db.prepare(`
        SELECT equipped_title
        FROM player_titles
        WHERE guild_id = ?
          AND user_id = ?
    `).get(
        String(guildId),
        String(userId)
    );

    if (!row?.equipped_title) {
        return null;
    }

    const achievement = getAchievement(
        row.equipped_title
    );

    if (!achievement) {
        return null;
    }

    return {
        achievementId: achievement.id,
        name: achievement.title,
        emoji: achievement.titleEmoji,
        formatted: formatAchievementTitle(achievement)
    };
}

// ==========================================
// EQUIPAR TÍTULO
// ==========================================

export function equipTitle(
    guildId,
    userId,
    achievementId
) {
    const achievement = getAchievement(achievementId);

    if (!achievement) {
        return {
            success: false,
            reason: "Esse título não existe."
        };
    }

    if (
        !hasAchievement(
            guildId,
            userId,
            achievementId
        )
    ) {
        return {
            success: false,
            reason:
                "Você ainda não desbloqueou a conquista necessária."
        };
    }

    db.prepare(`
        INSERT INTO player_titles (
            guild_id,
            user_id,
            equipped_title,
            updated_at
        )
        VALUES (?, ?, ?, unixepoch())

        ON CONFLICT(guild_id, user_id)
        DO UPDATE SET
            equipped_title = excluded.equipped_title,
            updated_at = unixepoch()
    `).run(
        String(guildId),
        String(userId),
        achievementId
    );

    return {
        success: true,
        achievement,
        title: formatAchievementTitle(achievement)
    };
}

// ==========================================
// DESEQUIPAR TÍTULO
// ==========================================

export function unequipTitle(guildId, userId) {
    const result = db.prepare(`
        UPDATE player_titles
        SET
            equipped_title = NULL,
            updated_at = unixepoch()
        WHERE guild_id = ?
          AND user_id = ?
          AND equipped_title IS NOT NULL
    `).run(
        String(guildId),
        String(userId)
    );

    return result.changes === 1;
}

// ==========================================
// LISTAR TÍTULOS DISPONÍVEIS
// ==========================================

export function getAvailableTitles(guildId, userId) {
    const unlocked = getUnlockedAchievements(
        guildId,
        userId
    );

    return unlocked
        .map(row =>
            getAchievement(row.achievement_id)
        )
        .filter(Boolean)
        .map(achievement => ({
            id: achievement.id,
            name: achievement.title,
            emoji: achievement.titleEmoji,
            formatted:
                formatAchievementTitle(achievement),
            rarity: achievement.rarity
        }));
}