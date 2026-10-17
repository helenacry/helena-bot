export function userinfoComponents(targetId) {
    return [
        {
            type: "row",
            components: [
                {
                    type: "select",
                    customId: `userinfo:details:${targetId}`,
                    placeholder: "Mais informações...",
                    minValues: 1,
                    maxValues: 1,
                    options: [
                        { label: "Avatar", value: "avatar", emoji: "🖼️" },
                        { label: "Evolução do impulso", value: "boost", emoji: "✨" },
                        { label: "Evolução do Nitro", value: "nitro", emoji: "💎" },
                        { label: "Cores do perfil", value: "colors", emoji: "🎨" },
                        { label: "Conexões", value: "connections", emoji: "🔗" },
                        { label: "Nomes anteriores", value: "names", emoji: "📝" },
                        { label: "Ícones antigos", value: "avatars", emoji: "👤" },
                        { label: "Banners antigos", value: "banners", emoji: "🌌" },
                        { label: "Últimas mensagens", value: "messages", emoji: "💬" },
                        { label: "Mensagens deletadas", value: "deleted", emoji: "🗑️" },
                        { label: "Última call", value: "voice", emoji: "🔊" },
                        { label: "Servidores", value: "servers", emoji: "🌐" },
                        { label: "Histórico de visualizações", value: "views", emoji: "👁️" }
                    ]
                }
            ]
        },
        {
            type: "row",
            components: [
                {
                    type: "button",
                    customId: `userinfo:back:${targetId}`,
                    label: "Voltar ao perfil",
                    style: "secondary",
                    emoji: "↩️"
                }
            ]
        }
    ];
}