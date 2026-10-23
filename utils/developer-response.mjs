import { createEmbed, embedResponse, HELENA_COLORS } from './embed.mjs';
import { isOwner, userId } from '../services/platform/developer.mjs';

// As respostas dos comandos do dono (/dev*). Os comandos mandam "#EF4444" para falha: vale o vermelho do tema.
const FAILURE = new Set([HELENA_COLORS.error, '#EF4444']);

export const devReply = (title, description, color = HELENA_COLORS.primary) => {
    const failed = FAILURE.has(color);

    return embedResponse(createEmbed({
        section: 'Dono',
        title,
        description,
        color: failed ? HELENA_COLORS.error : color,
        mood: failed ? 'triste' : 'feliz'
    }));
};

export const deny = () => devReply('🔒 Acesso restrito', 'Este comando é exclusivo do proprietário da Helena.', HELENA_COLORS.error);
export const guard = (i) => isOwner(userId(i));
export const value = (v) => String(v ?? '').slice(0, 1000);
