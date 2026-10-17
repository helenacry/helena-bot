import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { option,userId,logDev } from '../../services/platform/developer.mjs';
import { stats } from '../../services/platform/developer.mjs';
export default {name:'devstats',description:'Estatísticas da economia',options:[],async execute(i){if(!guard(i))return deny();try{const s=stats();return devReply('📊 Estatísticas',`Registros de jogadores: **${s.players}**\nUsuários globais: **${s.users}**\nServidores com jogadores: **${s.guilds}**\nTransações: **${s.transactions}**\nCarteiras: **${s.wallet} centavos**\nBancos: **${s.bank} centavos**`);}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
