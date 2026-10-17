import { createEmbed,embedResponse,HELENA_COLORS } from './embed.mjs';
import { isOwner,userId } from '../services/platform/developer.mjs';
export const devReply=(title,description,color=HELENA_COLORS.primary)=>embedResponse(createEmbed({title,description,color}));
export const deny=()=>devReply('🔒 Acesso restrito','Este comando é exclusivo do proprietário da Helena.',HELENA_COLORS.error);
export const guard=(i)=>isOwner(userId(i));
export const value=(v)=>String(v??'').slice(0,1000);
