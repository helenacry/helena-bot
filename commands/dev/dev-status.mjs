import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { option,userId,logDev } from '../../services/developer.mjs';

export default {name:'devstatus',description:'Saúde do processo Helena',options:[],async execute(i){if(!guard(i))return deny();try{const m=process.memoryUsage();return devReply('🖥️ Estado da Helena',`Uptime: **${Math.floor(process.uptime())}s**\nNode: **${process.version}**\nRAM RSS: **${(m.rss/1048576).toFixed(1)} MiB**\nHeap: **${(m.heapUsed/1048576).toFixed(1)} MiB**`);}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
