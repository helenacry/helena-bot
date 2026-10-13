import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {status} from "../../services/combat.mjs";
export default {name:"statuscombate",description:"Mostra vida e estatísticas de combate",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};const s=status(g,u);return ok("❤️ Estado de combate",`HP: ${s.hp}/100\nVitórias: ${s.wins} | Derrotas: ${s.losses}\nMunição: ${s.ammo} | Defesa: ${s.vest} | Durabilidade: ${s.durability}%`);}catch(e){return fail(e);}}};
