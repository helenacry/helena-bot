import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>errorEmbed(e.message||String(e));
import {adminChange} from "../../services/admin.mjs";
export default {name:"adminxp",description:"Adiciona XP",options:[{name:"usuario",description:"Jogador",type:"user",required:true},{name:"quantidade",description:"Quantidade",type:"integer",required:true}],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};adminChange(g,u,String(o.usuario),"xp",Number(o.quantidade));return ok("🛡️ Administração","Operação realizada e registrada.");}catch(e){return fail(e);}}};
