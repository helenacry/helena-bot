// Menu da wiki: seções e páginas, na ordem em que aparecem. Cada página é um
// arquivo wiki/<seção>/<página>.md (o título e a descrição vêm do cabeçalho do
// próprio arquivo). O endereço no site é /wiki/<seção>/<página>/.
//
// Depois de criar ou mudar páginas, rode:  npm run wiki:build

export const NAV = [
    {
        id: "start",
        title: "Comece por aqui",
        pages: ["first-steps", "earning-money", "jobs"]
    },
    {
        id: "economy",
        title: "Economia",
        pages: ["bank-and-transfers", "shop-and-inventory", "market", "gems", "rankings"]
    },
    {
        id: "character",
        title: "Personagem",
        pages: ["energy", "levels-and-xp", "achievements-and-titles", "profile", "marriage"]
    },
    {
        id: "combat",
        title: "Combate",
        pages: ["duels", "weapons", "health-and-gear"]
    },
    {
        id: "crime",
        title: "Crime e segurança",
        pages: ["getting-started", "robbery", "laundering", "wanted-and-prison", "prison-escape"]
    },
    {
        id: "help",
        title: "Ajuda e referência",
        pages: ["faq", "commands", "cooldowns"]
    }
];
