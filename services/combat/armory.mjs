import { db } from "../../database/connection.mjs";
import { ensure,tx,status } from "./combat.mjs";
import { getEquippedWeapon } from "./equipment.mjs";
import { getPlayer } from "../../database/economy.mjs";
// Preços do arsenal, em centavos (a wiki lê estes valores).
export const ARMORY_RULES = Object.freeze({
    ammoPrice: 100,
    maxAmmoPerPurchase: 100,
    vestPrice: 10000,
    vestDefense: 10,
    repairPrice: 5000,
    maxDurability: 100
});

export function buyAmmo(g,u,q){q=Number(q);if(!Number.isSafeInteger(q)||q<1||q>ARMORY_RULES.maxAmmoPerPurchase)throw Error("Quantidade entre 1 e 100.");return tx(()=>{ensure(g,u);getPlayer(g,u);const cost=q*ARMORY_RULES.ammoPrice;const r=db.prepare("UPDATE players SET wallet=wallet-? WHERE guild_id=? AND user_id=? AND wallet>=?").run(cost,g,u,cost);if(!r.changes)throw Error("Carteira insuficiente.");db.prepare("UPDATE combat_gear SET ammo=ammo+? WHERE guild_id=? AND user_id=?").run(q,g,u);return cost;});}
export function buyVest(g,u){return tx(()=>{ensure(g,u);getPlayer(g,u);const cost=ARMORY_RULES.vestPrice;const r=db.prepare("UPDATE players SET wallet=wallet-? WHERE guild_id=? AND user_id=? AND wallet>=?").run(cost,g,u,cost);if(!r.changes)throw Error("Carteira insuficiente.");db.prepare("UPDATE combat_gear SET vest=? WHERE guild_id=? AND user_id=?").run(ARMORY_RULES.vestDefense,g,u);return cost;});}
export function repair(g,u){return tx(()=>{ensure(g,u);getPlayer(g,u);if(!getEquippedWeapon(g,u))throw Error("Equipe uma arma primeiro.");const cost=ARMORY_RULES.repairPrice;const r=db.prepare("UPDATE players SET wallet=wallet-? WHERE guild_id=? AND user_id=? AND wallet>=?").run(cost,g,u,cost);if(!r.changes)throw Error("Carteira insuficiente.");db.prepare("UPDATE combat_gear SET durability=? WHERE guild_id=? AND user_id=?").run(ARMORY_RULES.maxDurability,g,u);return cost;});}
export function reload(g,u){const weapon=getEquippedWeapon(g,u);if(!weapon||weapon.weaponType!=="firearm")throw Error("Equipe uma arma de fogo.");const s=status(g,u);return s.ammo;}
