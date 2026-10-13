import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {history} from "../../services/combat.mjs";
export default {name:"historico",description:"Mostra últimos duelos",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};const h=history(g,u);return ok("📜 Histórico PvP",h.length?h.map(x=>`🏆 ${x.winner_id} venceu ${x.loser_id} (${x.damage} dano)`).join("\n"):"Nenhum duelo registrado.");}catch(e){return fail(e);}}};
