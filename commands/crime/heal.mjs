import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {heal} from "../../services/hospital.mjs";
export default {name:"curar",description:"Recupera HP no hospital",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};const c=heal(g,u);return ok("🏥 Tratamento concluído",`HP restaurado para 100. Custo: ${(c/100).toFixed(2)} moedas. Proteção PvP por 10 minutos.`);}catch(e){return fail(e);}}};
