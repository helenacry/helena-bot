import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {buyVest} from "../../services/armory.mjs";
export default {name:"colete",description:"Compra um colete com 10 pontos de defesa",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};buyVest(g,u);return ok("🛡️ Colete", "Colete equipado! Defesa: 10. Preço: 100 moedas.");}catch(e){return fail(e);}}};
