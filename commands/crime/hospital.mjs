import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {status,now} from "../../services/combat.mjs";
export default {name:"hospital",description:"Mostra estado de saúde",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};const s=status(g,u);return ok("🏥 Hospital",`HP: ${s.hp}/100\nCusto para cura: ${100-s.hp} moedas\nProteção restante: ${Math.max(0,s.protected_until-now())} segundos.`);}catch(e){return fail(e);}}};
