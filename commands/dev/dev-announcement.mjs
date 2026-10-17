import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { option,userId,logDev } from '../../services/platform/developer.mjs';

export default {name:'devanuncio',description:'Gera anúncio oficial para o canal atual',options:[{name:'texto',description:'Texto do anúncio',type:'string',required:true}],async execute(i){if(!guard(i))return deny();try{const message=String(option(i,'texto')??'').trim();if(!message||message.length>1500)throw Error('Texto deve ter entre 1 e 1500 caracteres.');logDev(userId(i),'announcement',message);return devReply('📣 Anúncio oficial da Helena',message);}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
