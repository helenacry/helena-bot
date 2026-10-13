import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { isValidId } from '../../utils/ids.mjs';
import { option,userId,logDev } from '../../services/developer.mjs';
import { resetPlayer,guildId } from '../../services/developer.mjs';
export default {name:'devreset',description:'Reseta recursos locais de um jogador',options:[{name:'usuario',description:'ID do usuário',type:'string',required:true},{name:'confirmacao',description:'Digite RESET para confirmar',type:'string',required:true}],async execute(i){if(!guard(i))return deny();try{if(option(i,'confirmacao')!=='RESET')throw Error('Digite RESET para confirmar.');const target=String(option(i,'usuario')??'');if(!isValidId(target))throw Error('ID de usuário inválido.');resetPlayer(guildId(i),target,userId(i));return devReply('♻️ Reset concluído',`Economia, inventário e equipamento local de ${target} resetados. Gemas globais e casamento preservados.`);}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
