import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { option,userId,logDev } from '../../services/developer.mjs';
import { getLogs } from '../../services/developer.mjs';
export default {name:'devlogs',description:'Últimas ações do proprietário',options:[],async execute(i){if(!guard(i))return deny();try{const rows=getLogs();return devReply('📜 Auditoria',rows.length?rows.map(r=>`#${r.id} • ${r.action} • ${r.actor_id}\n${r.details}`).join('\n\n').slice(0,3500):'Nenhum registro.');}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
