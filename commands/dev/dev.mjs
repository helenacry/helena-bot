import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { option,userId,logDev } from '../../services/platform/developer.mjs';
import { ownerConfigured,maintenance } from '../../services/platform/developer.mjs';
export default {name:'dev',description:'Painel exclusivo do proprietário',options:[],async execute(i){if(!guard(i))return deny();try{return devReply('👑 Helena Developer','**Proprietário autenticado**\nManutenção: '+(maintenance()?'Ativa':'Inativa')+'\nOwner configurado: '+(ownerConfigured()?'Sim':'Não')+'\nUse /devstatus, /devstats, /devlogs e os comandos /dev*.');}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
