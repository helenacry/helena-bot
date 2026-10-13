import { createEmbed,embedResponse,errorEmbed,HELENA_COLORS } from "../../utils/embed.mjs";
const ok=(title,description)=>embedResponse(createEmbed({title,description,color:HELENA_COLORS.primary}));
const fail=e=>embedResponse(errorEmbed(e.message||String(e)));
import {getEquippedWeapon} from "../../services/equipment.mjs";import {status} from "../../services/combat.mjs";
export default {name:"armas",description:"Mostra arma equipada e seus atributos",options:[],async execute(i){try{const g=i.guildId,u=i.user.id,o=i.data.options||{};const w=getEquippedWeapon(g,u),s=status(g,u);return ok("🔫 Armamentos",w?`${w.emoji} ${w.name} | Dano: ${w.damage} | Tipo: ${w.weaponType}\nDurabilidade: ${s.durability}% | Munição: ${s.ammo}`:"Nenhuma arma equipada.");}catch(e){return fail(e);}}};
