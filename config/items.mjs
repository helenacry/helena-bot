
export const ITEM_CATEGORIES = Object.freeze({
    consumable: "Consumíveis",
    tool: "Ferramentas",
    equipment: "Equipamentos",
    weapon: "Armas",
    box: "Caixas",
    collectible: "Colecionáveis"
});

// Emoji de cada categoria (loja, inventário).
export const ITEM_CATEGORY_EMOJIS = Object.freeze({
    consumable: "🍽️",
    tool: "🧰",
    equipment: "🎒",
    weapon: "⚔️",
    box: "🎁",
    collectible: "💎"
});

export const WEAPON_TYPES = Object.freeze({
    firearm: "Armas de fogo",
    melee: "Armas brancas"
});

export const ITEMS = Object.freeze([
    {
        id: "apple",
        name: "Maçã",
        emoji: "🍎",
        category: "consumable",
        description: "Uma maçã fresquinha. Repõe 10 de energia.",
        use: { verb: "Comer", energy: 10 },
        maxStack: 99,
        buyPrice: 300,
        sellable: true,
        sellPrice: 150
    },
    {
        id: "coffee",
        name: "Café",
        emoji: "☕",
        category: "consumable",
        description: "Um café para começar o expediente. Repõe 25 de energia.",
        use: { verb: "Beber", energy: 25 },
        maxStack: 99,
        buyPrice: 700,
        sellable: true,
        sellPrice: 350
    },
    {
        id: "energy_drink",
        name: "Energético",
        emoji: "⚡",
        category: "consumable",
        description: "Uma bebida energética. Repõe 50 de energia.",
        use: { verb: "Beber", energy: 50 },
        maxStack: 50,
        buyPrice: 1500,
        sellable: true,
        sellPrice: 750
    },
    {
        id: "mystery_box",
        name: "Caixa misteriosa",
        emoji: "🎁",
        category: "box",
        description: "Uma caixa com conteúdo desconhecido.",
        maxStack: 25,
        buyPrice: 10000,
        sellable: false,
        sellPrice: 0
    },
    {
        id: "fishing_rod",
        name: "Vara de pesca",
        emoji: "🎣",
        category: "tool",
        description: "Ferramenta para futuras atividades de pesca.",
        maxStack: 1,
        buyPrice: 5000,
        sellable: true,
        sellPrice: 2500
    },
    {
        id: "backpack",
        name: "Mochila",
        emoji: "🎒",
        category: "equipment",
        description: "Equipamento para futuras expansões.",
        maxStack: 1,
        buyPrice: 8000,
        sellable: true,
        sellPrice: 4000
    },
    {
        id: "worker_medal",
        name: "Medalha de trabalhador",
        emoji: "🏅",
        category: "collectible",
        description: "Uma medalha de reconhecimento.",
        maxStack: 10,
        buyPrice: null,
        sellable: false,
        sellPrice: 0
    },

{
    id: "wooden_sword",
    name: "Espada de madeira",
    emoji: "🗡️",
    category: "weapon",
    description: "Uma espada simples para iniciantes.",
    maxStack: 1,
    buyPrice: 5000,
    sellable: false,
    sellPrice: 0
},
{
    id: "iron_sword",
    name: "Espada de ferro",
    emoji: "⚔️",
    category: "weapon",
    description: "Uma espada resistente feita de ferro.",
    maxStack: 1,
    buyPrice: 25000,
    sellable: false,
    sellPrice: 0
},
{
    id: "steel_sword",
    name: "Espada de aço",
    emoji: "⚔️",
    category: "weapon",
    description: "Uma espada de aço para aventureiros experientes.",
    maxStack: 1,
    buyPrice: 75000,
    sellable: false,
    sellPrice: 0
},


    // ==========================================
    // ARMAS BRANCAS
    // ==========================================

    {
        id: "pocket_knife",
        name: "Canivete",
        emoji: "🔪",
        category: "weapon",
        weaponType: "melee",
        description: "Um canivete compacto.",
        damage: 8,
        maxStack: 1,
        buyPrice: 3500,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "combat_knife",
        name: "Faca de combate",
        emoji: "🔪",
        category: "weapon",
        weaponType: "melee",
        description: "Uma faca resistente.",
        damage: 15,
        maxStack: 1,
        buyPrice: 8500,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "machete",
        name: "Facão",
        emoji: "🗡️",
        category: "weapon",
        weaponType: "melee",
        description: "Uma lâmina de grande porte.",
        damage: 22,
        maxStack: 1,
        buyPrice: 18000,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "katana",
        name: "Katana",
        emoji: "⚔️",
        category: "weapon",
        weaponType: "melee",
        description: "Uma espada de lâmina curva.",
        damage: 35,
        maxStack: 1,
        buyPrice: 65000,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "legendary_blade",
        name: "Lâmina lendária",
        emoji: "🌌",
        category: "weapon",
        weaponType: "melee",
        description: "Uma arma rara de grande poder.",
        damage: 55,
        maxStack: 1,
        buyPrice: 250000,
        sellable: false,
        sellPrice: 0
    },

    // ==========================================
    // ARMAS DE FOGO
    // ==========================================

    {
        id: "revolver",
        name: "Revólver",
        emoji: "🔫",
        category: "weapon",
        weaponType: "firearm",
        description: "Armamento básico de curta distância.",
        damage: 20,
        maxStack: 1,
        buyPrice: 30000,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "pistol",
        name: "Pistola",
        emoji: "🔫",
        category: "weapon",
        weaponType: "firearm",
        description: "Uma pistola de uso geral.",
        damage: 28,
        maxStack: 1,
        buyPrice: 55000,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "smg",
        name: "Submetralhadora",
        emoji: "🔫",
        category: "weapon",
        weaponType: "firearm",
        description: "Armamento automático compacto.",
        damage: 38,
        maxStack: 1,
        buyPrice: 120000,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "shotgun",
        name: "Escopeta",
        emoji: "🔫",
        category: "weapon",
        weaponType: "firearm",
        description: "Arma de alto impacto.",
        damage: 48,
        maxStack: 1,
        buyPrice: 160000,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "assault_rifle",
        name: "Fuzil de assalto",
        emoji: "🔫",
        category: "weapon",
        weaponType: "firearm",
        description: "Armamento avançado.",
        damage: 58,
        maxStack: 1,
        buyPrice: 350000,
        sellable: false,
        sellPrice: 0
    },

    {
        id: "sniper_rifle",
        name: "Rifle de precisão",
        emoji: "🎯",
        category: "weapon",
        weaponType: "firearm",
        description: "Armamento raro de longo alcance.",
        damage: 80,
        maxStack: 1,
        buyPrice: 750000,
        sellable: false,
        sellPrice: 0
    },
    
]);

export function getItem(itemId) {
    return ITEMS.find(item => item.id === itemId) ?? null;
}

export function getCategoryName(category) {
    return ITEM_CATEGORIES[category] ?? "Outros";
}

export function getCategoryEmoji(category) {
    return ITEM_CATEGORY_EMOJIS[category] ?? "📦";
}

// O que o item faz quando usado em /usaritem:
//   { kind: "energy", verb, energy }  repõe energia e gasta 1 unidade
//   { kind: "equip", verb }           equipa a arma (não gasta)
//   null                              não é usável
export function getItemUse(item) {
    if (!item) {
        return null;
    }

    if (item.use) {
        return { kind: "energy", ...item.use };
    }

    if (item.category === "weapon") {
        return { kind: "equip", verb: "Equipar" };
    }

    return null;
}