import { devReply,deny,guard } from '../../utils/developer-response.mjs';
import { option,userId,logDev } from '../../services/developer.mjs';
import { db,DATABASE_PATH } from '../../database/connection.mjs';
import { mkdirSync,copyFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
export default {name:'devbackup',description:'Cria backup local do SQLite',options:[],async execute(i){if(!guard(i))return deny();try{const dir=resolve(dirname(DATABASE_PATH),'backups');mkdirSync(dir,{recursive:true});const filename='helena-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db';const dest=resolve(dir,filename);db.exec('PRAGMA wal_checkpoint(FULL)');const escaped=dest.replaceAll("'","''");db.exec(`VACUUM INTO '${escaped}'`);logDev(userId(i),'backup',filename);return devReply('💾 Backup criado',`Arquivo local: ${dest}\nO arquivo fica no servidor do bot; não é enviado pelo chat.`);}catch(e){return devReply("❌ Falha",e.message,"#EF4444");}}};
