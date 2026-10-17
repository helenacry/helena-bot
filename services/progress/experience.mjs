
const MAX_LEVEL = 100;

// XP total necessário para atingir determinado nível.
// Curva provisória, configurável.
export function xpForLevel(level) {
    if (!Number.isSafeInteger(level) || level < 1) {
        throw new Error("Nível inválido.");
    }

    return 100 * (level - 1) * level / 2;
}

export function calculateLevel(totalXp) {
    if (!Number.isSafeInteger(totalXp) || totalXp < 0) {
        throw new Error("XP inválido.");
    }

    let level = 1;

    while (
        level < MAX_LEVEL &&
        totalXp >= xpForLevel(level + 1)
    ) {
        level++;
    }

    return level;
}

export function getProgress(totalXp) {
    const level = calculateLevel(totalXp);

    const current = xpForLevel(level);

    const next = level < MAX_LEVEL
        ? xpForLevel(level + 1)
        : current;

    return {
        level,
        totalXp,
        currentXp: totalXp - current,
        requiredXp: next - current,
        maxLevel: level === MAX_LEVEL
    };
}