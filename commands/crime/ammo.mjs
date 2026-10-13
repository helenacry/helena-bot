import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {buyAmmo} from "../../services/armory.mjs";
export default {name:"municao",description:"Compra munição por 1 moeda cada",options:[{name:"quantidade",description:"Quantidade",type:"integer",required:true}],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};const cost=buyAmmo(g,u,o.quantidade);return ok("🔫 Munição",`Comprou ${o.quantidade} munições por ${(cost/100).toFixed(2)} moedas.`);}catch(e){return fail(e);}}};
