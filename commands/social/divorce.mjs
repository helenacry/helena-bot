import { divorce } from "../../services/marriage.mjs";

import { createEmbed, embedResponse, errorEmbed, HELENA_COLORS } from "../../utils/embed.mjs";

export default { name: "divorciar", description: "Encerra seu casamento atual",

async execute(interaction) { const guildId = interaction.guildId; const userId = interaction.user?.id;

try { const result = divorce( guildId, userId );

return embedResponse( createEmbed({ title: "💔 Divórcio registrado",

description: "Seu casamento foi encerrado.\n\n" + "O estado civil de ambos os jogadores voltou para Solteiro(a).",

color: HELENA_COLORS.neutral,

fields: [ { name: "📄 Status", value: "Divórcio concluído.", inline: false } ] }),   );

} catch (error) { return errorEmbed(error.message); } } };