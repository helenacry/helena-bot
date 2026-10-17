import { createEmbed, embedResponse, errorEmbed, HELENA_COLORS } from "../../utils/embed.mjs";
const ok = (title, description) => embedResponse(createEmbed({ title, description, color: HELENA_COLORS.primary }));
const fail = e => errorEmbed(e.message || String(e));
import { adminChange } from "../../services/platform/admin.mjs";
export default { name: "adminitem", description: "Adiciona item ao inventário", options: [{ name: "usuario", description: "Jogador", type: "user", required: true }, { name: "quantidade", description: "Quantidade", type: "integer", required: true }, { name: "item", description: "ID do item", type: "string", required: true }], async execute(i) { try { const g = i.guildId, u = i.user.id, o = i.data.options || {}; adminChange(g, u, String(o.usuario), "item", Number(o.quantidade), String(o.item)); return ok("🛡️ Administração", "Item entregue e operação registrada."); } catch (e) { return fail(e); } } };
