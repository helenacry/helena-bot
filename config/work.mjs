
// ==========================================
// TRABALHO (/trabalhar)
// ==========================================

// Um turno por hora paga o salário do emprego (config/jobs.mjs), dá XP e
// custa energia (ENERGY_CONFIG.workCost, em services/energy.mjs).

export const WORK_CONFIG = Object.freeze({
    // Espera entre dois turnos, em segundos.
    cooldown: 60 * 60,

    // XP por turno.
    xp: 25,

    maxWallet: 100_000_000_000_000
});
