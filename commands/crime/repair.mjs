import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {repair} from "../../services/armory.mjs";
export default {name:"reparar",description:"Restaura a durabilidade da arma",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};repair(g,u);return ok("🔧 Reparação","Durabilidade restaurada para 100%. Preço: 50 moedas.");}catch(e){return fail(e);}}};
