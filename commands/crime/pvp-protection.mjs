import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {status,now} from "../../services/combat.mjs";
export default {name:"protecaopvp",description:"Mostra sua proteção PvP",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};const s=status(g,u);return ok("🛡️ Proteção PvP",`Restam ${Math.max(0,s.protected_until-now())} segundos de proteção.`);}catch(e){return fail(e);}}};
