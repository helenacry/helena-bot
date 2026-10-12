
export default {
    name: "ping",
    description: "Verifica se o bot está funcionando",

    async execute(interaction) {
        return {
            type: "message",
            data: {
                body: "🏓 Pong! Estou funcionando."
            }
        };
    }
};