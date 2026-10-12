import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {reload} from "../../services/armory.mjs";
export default {name:"recarregar",description:"Verifica munição da arma equipada",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};return ok("🔫 Munição",`Sua arma está pronta. Estoque: ${reload(g,u)} munições. Cada duelo consome uma munição.`);}catch(e){return fail(e);}}};
