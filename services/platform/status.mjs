
import {
    STATUS_CONFIG
} from "../../config/status.mjs";

let timer = null;

let generation = 0;

// ==========================================
// PARAR ROTAÇÃO
// ==========================================

export function stopStatusRotation() {
    generation++;

    if (timer !== null) {
        clearInterval(timer);

        timer = null;
    }
}

// ==========================================
// INICIAR ROTAÇÃO
// ==========================================

// updatePresence(message):
// Envia a atividade para o Discord.
//
// getMessages():
// Retorna a lista atualizada de atividades.

export function startStatusRotation(
    updatePresence,
    getMessages
) {
    if (typeof updatePresence !== "function") {
        throw new TypeError(
            "updatePresence precisa ser uma função."
        );
    }

    if (typeof getMessages !== "function") {
        throw new TypeError(
            "getMessages precisa ser uma função."
        );
    }

    stopStatusRotation();

    const activeGeneration = generation;

    let currentIndex = 0;

    let updating = false;

    // ======================================
    // EXECUTAR ATUALIZAÇÃO
    // ======================================

    async function rotate() {
        if (
            activeGeneration !== generation ||
            updating
        ) {
            return;
        }

        updating = true;

        try {
            // Consulta os dados novamente a cada
            // atualização.

            const messages = await getMessages();

            if (activeGeneration !== generation) {
                return;
            }

            if (
                !Array.isArray(messages) ||
                messages.length === 0
            ) {
                throw new Error(
                    "Nenhuma mensagem de status disponível."
                );
            }

            const index =
                currentIndex % messages.length;

            const message = messages[index];

            if (
                typeof message !== "string" ||
                !message.trim()
            ) {
                throw new Error(
                    "Mensagem de status inválida."
                );
            }

            await updatePresence(message);

            if (activeGeneration !== generation) {
                return;
            }

            console.log(
                `[STATUS] Atualizado: ${message}`
            );

            currentIndex =
                (index + 1) % messages.length;

        } catch (error) {
            if (activeGeneration === generation) {
                console.error(
                    "[STATUS] Falha ao atualizar:",
                    error
                );
            }

        } finally {
            updating = false;
        }
    }

    // Primeira atividade imediatamente.

    void rotate();

    // Próximas atividades a cada 60 segundos.

    timer = setInterval(
        () => void rotate(),
        STATUS_CONFIG.interval
    );
}