import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>errorEmbed(e.message||String(e));
import {adminChange} from "../../services/admin.mjs";
export default {name:"adminreset",description:"Reseta carteira, banco, XP e combate",options:[{name:"usuario",description:"Jogador",type:"user",required:true},{name:"confirmacao",description:"Digite CONFIRMAR",type:"string",required:true}],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};if(o.confirmacao!=="CONFIRMAR")throw Error("Digite CONFIRMAR para executar.");adminChange(g,u,String(o.usuario),"reset",0);return ok("🛡️ Administração","Jogador resetado. Operação registrada.");}catch(e){return fail(e);}}};
