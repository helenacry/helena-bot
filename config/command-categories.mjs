// ==========================================
// CATEGORIAS DOS COMANDOS
// ==========================================

// Como os comandos se agrupam na central de ajuda (/ajuda) e no site (lista de
// comandos e wiki). Um comando entra na categoria da sua pasta em commands/,
// salvo os que estão listados em CATEGORY_BY_COMMAND: o combate mora em crime/
// e os duelos em social/, então esses casos são dados por nome.
//
// Comandos novos não precisam de nada aqui: entram na categoria da pasta, e o
// que não tem categoria cai em "utilidades".

export const COMMAND_CATEGORIES = Object.freeze([
    Object.freeze({ id: "economia", label: "Economia", emoji: "💰" }),
    Object.freeze({ id: "crime", label: "Crime", emoji: "🕵️" }),
    Object.freeze({ id: "combate", label: "Combate", emoji: "⚔️" }),
    Object.freeze({ id: "progresso", label: "Progresso", emoji: "🏆" }),
    Object.freeze({ id: "social", label: "Social", emoji: "💍" }),
    Object.freeze({ id: "utilidades", label: "Utilidades", emoji: "⚙️" })
]);

// Pastas que não aparecem para os jogadores: são só do dono do bot.
export const HIDDEN_FOLDERS = Object.freeze(new Set(["admin", "dev"]));

// Comandos de teste interno.
export const HIDDEN_COMMANDS = Object.freeze(new Set(["testembed"]));

// A pasta não diz tudo (o combate mora em crime/ e os duelos em social/).
export const CATEGORY_BY_COMMAND = Object.freeze({
    crime: "crime", roubar: "crime", lavagem: "crime",
    lavageminfo: "crime", prisao: "crime", procurados: "crime",

    atacar: "combate", aceitarduelo: "combate", recusarduelo: "combate",
    historico: "combate", hospital: "combate", curar: "combate",
    colete: "combate", municao: "combate", reparar: "combate",
    recarregar: "combate", equipar: "combate", desequipar: "combate",
    statuscombate: "combate", protecaopvp: "combate", armas: "combate"
});

export const CATEGORY_BY_FOLDER = Object.freeze({
    economy: "economia",
    progress: "progresso",
    social: "social",
    utility: "utilidades",
    crime: "crime"
});

// A categoria de um comando, dado o nome e a pasta onde ele mora.
export function categoryOf(commandName, folder) {
    return (
        CATEGORY_BY_COMMAND[commandName] ??
        CATEGORY_BY_FOLDER[folder] ??
        "utilidades"
    );
}

// Comandos que não aparecem para os jogadores (ajuda, site e wiki).
export function isHiddenCommand(commandName, folder) {
    return HIDDEN_FOLDERS.has(folder) || HIDDEN_COMMANDS.has(commandName);
}
