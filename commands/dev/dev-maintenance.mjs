import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { option,userId,logDev } from '../../services/platform/developer.mjs';
import { setSetting } from '../../services/platform/developer.mjs';
export default {name:'devmanutencao',description:'Ativa ou desativa a manutenção',options:[{name:'estado',description:'Ativar ou desativar',type:'string',required:true,choices:[{name:'Ativar',value:'on'},{name:'Desativar',value:'off'}]}],async execute(i){if(!guard(i))return deny();try{const v=option(i,'estado');if(!['on','off'].includes(v))throw Error('Estado inválido.');setSetting('maintenance',v==='on'?'1':'0');logDev(userId(i),'maintenance',v);return devReply('🛠️ Manutenção',v==='on'?'Ativada.':'Desativada.');}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
