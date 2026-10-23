// Os casos da prévia (scripts/dev/preview-replies.mjs): um comando por caso, com o estado do
// jogo que ele pede.
//
//   cmd     o comando digitado (pelo prefixo h)
//   note    aparece ao lado do comando na página
//   who     quem digita (padrão: o "Educado"; ANA é a outra jogadora)
//   until   função que diz se a resposta serve: o caso é refeito até servir (para o que depende de sorteio)
//   setup   recebe { seed, give, set, get, db, ME, ANA, G, nowSec } e roda DEPOIS do seed padrão

const { equipWeapon } = await import("../../services/combat/equipment.mjs");
const { buyAmmo } = await import("../../services/combat/armory.mjs");
const { imprison } = await import("../../services/crime/prison.mjs");
const { startLaundering } = await import("../../services/crime/laundering.mjs");
const { challenge } = await import("../../services/combat/combat.mjs");
const { unlockAchievement } = await import("../../services/progress/achievements.mjs");
const { requestMarriage, acceptMarriage } = await import("../../services/social/marriage.mjs");

// Serve para o clássico (embeds) e para o V2 (componentes): olha o texto da mensagem inteira.
const has = text => sent => JSON.stringify(sent).includes(text);

const dailyAgo = hours => ({ set, ME, G, nowSec }) =>
    set("UPDATE players SET last_daily=? WHERE guild_id=? AND user_id=?", nowSec() - hours * 3600, G, ME.id);

const withGun = ({ give, ME, G }) => {
    give(ME, "revolver", 1);
    equipWeapon(G, ME.id, "revolver");
    buyAmmo(G, ME.id, 10);
};

const married = ({ ME, ANA, G }) => {
    requestMarriage(G, ME.id, ANA.id);
    acceptMarriage(G, ANA.id);
};

export const CASES = [
    {
        group: "Economia",
        cases: [
            { cmd: "hsaldo" },
            { cmd: "hsaldo", note: "com dinheiro sujo", setup: ({ seed }) => seed({ dirty: 38_000 }) },
            { cmd: "htrabalhar" },
            { cmd: "htrabalhar", note: "em recarga", setup: ({ set, ME, G, nowSec }) => set("UPDATE players SET last_work=? WHERE guild_id=? AND user_id=?", nowSec() - 600, G, ME.id) },
            { cmd: "htrabalhar", note: "sem energia", setup: ({ seed }) => seed({ energy: 4 }) },
            { cmd: "htrabalhar", note: "sobe de nível", setup: ({ seed }) => seed({ level: 5, xp: 1000 - 10 }) },
            { cmd: "hdaily", note: "primeiro resgate" },
            { cmd: "hdaily", note: "em recarga", setup: dailyAgo(1) },
            { cmd: "hgemas" },
            { cmd: "hcoletargemas" },
            { cmd: "hcoletargemas", note: "em recarga", setup: ({ set, ME, nowSec }) => set("UPDATE global_users SET last_gem_claim=? WHERE user_id=?", nowSec() - 600, ME.id) },
            { cmd: "hdepositar 500" },
            { cmd: "hsacar 300" },
            { cmd: "htransferir <@222222222222222222> 150" },
            { cmd: "henergia" },
            { cmd: "hempregos" },
            { cmd: "hempregos cargo:diretor", note: "bloqueado" },
            { cmd: "hempregos cargo:eletricista", note: "troca de emprego" }
        ]
    },
    {
        group: "Loja e itens",
        cases: [
            { cmd: "hloja" },
            { cmd: "hloja categoria:consumable", note: "prateleira" },
            { cmd: "hcomprar apple 2" },
            { cmd: "hvender apple 1", setup: ({ give, ME }) => give(ME, "apple", 3) },
            { cmd: "hinventario", setup: ({ give, ME }) => { give(ME, "apple", 3); give(ME, "coffee", 2); give(ME, "revolver", 1); } },
            { cmd: "hdescartar apple 2", setup: ({ give, ME }) => give(ME, "apple", 3) },
            { cmd: "husaritem", setup: ({ give, ME, seed }) => { seed({ energy: 20 }); give(ME, "apple", 3); give(ME, "coffee", 2); } },
            { cmd: "husaritem apple 1", setup: ({ give, ME, seed }) => { seed({ energy: 20 }); give(ME, "apple", 3); } },
            { cmd: "harmas", note: "sem arma" },
            { cmd: "harmas", note: "com arma", setup: withGun },
            { cmd: "hbolsa" }
        ]
    },
    {
        group: "Progresso diário",
        cases: [
            { cmd: "hmissoes" },
            { cmd: "hranking" },
            { cmd: "hranking tipo:level", note: "por nível" },
            { cmd: "hcooldowns" },
            { cmd: "hajuda" },
            { cmd: "hajuda categoria:economia", note: "categoria" },
            { cmd: "hajuda comando:daily", note: "detalhe" }
        ]
    },
    {
        group: "Crime",
        cases: [
            { cmd: "hcrime", note: "deu certo", until: has("Crime bem-sucedido") },
            { cmd: "hcrime", note: "golpe de mestre", until: has("Golpe de mestre") },
            { cmd: "hcrime", note: "pego", until: has("foi pego") },
            { cmd: "hroubar Ana", note: "deu certo", until: has("Roubo bem-sucedido"), setup: withGun },
            { cmd: "hroubar Ana", note: "deu errado", until: has("deu errado"), setup: withGun },
            { cmd: "hlavagem", note: "situação", setup: ({ seed }) => seed({ dirty: 800_000 }) },
            { cmd: "hlavagem 5000 publica", note: "inicia", setup: ({ seed }) => seed({ dirty: 800_000 }) },
            { cmd: "hlavageminfo", note: "nenhuma" },
            { cmd: "hlavageminfo", note: "em andamento", setup: ({ seed, G, ME }) => { seed({ dirty: 800_000 }); startLaundering(G, ME.id, { amount: 200_000, kind: "public", channelId: "c1" }); } },
            { cmd: "hprisao", note: "livre" },
            { cmd: "hprisao", note: "preso", setup: ({ G, ME }) => imprison(G, ME.id, 900, "Roubo malsucedido") },
            { cmd: "hcrime", note: "preso tenta crime", setup: ({ G, ME }) => imprison(G, ME.id, 900, "Roubo malsucedido") },
            { cmd: "hprocurados", note: "ninguém" },
            { cmd: "hprocurados", note: "com ficha", setup: ({ set, G, ME, ANA }) => { for (const [u, n] of [[ME, 7], [ANA, 3]]) { set("INSERT OR IGNORE INTO crime_players (guild_id, user_id) VALUES (?, ?)", G, u.id); set("UPDATE crime_players SET crimes=?, successes=?, failures=?, dirty_earned=?, criminal_record=? WHERE guild_id=? AND user_id=?", n, n - 2, 2, n * 9000, n, G, u.id); } } }
        ]
    },
    {
        group: "Combate",
        cases: [
            { cmd: "hstatuscombate", setup: withGun },
            { cmd: "hhospital", note: "ferido", setup: ({ set, G, ME }) => { set("INSERT OR IGNORE INTO combat_players (guild_id, user_id) VALUES (?, ?)", G, ME.id); set("UPDATE combat_players SET hp=40 WHERE guild_id=? AND user_id=?", G, ME.id); } },
            { cmd: "hcurar", setup: ({ set, G, ME }) => { set("INSERT OR IGNORE INTO combat_players (guild_id, user_id) VALUES (?, ?)", G, ME.id); set("UPDATE combat_players SET hp=40 WHERE guild_id=? AND user_id=?", G, ME.id); } },
            { cmd: "hhistorico" },
            { cmd: "hprotecaopvp" },
            { cmd: "hmunicao 5", setup: withGun },
            { cmd: "hequipar revolver", setup: ({ give, ME }) => give(ME, "revolver", 1) },
            { cmd: "hrecarregar", setup: withGun },
            { cmd: "hreparar", setup: withGun },
            { cmd: "hcolete" },
            { cmd: "hdesequipar", setup: withGun },
            { cmd: "hatacar <@222222222222222222>", setup: withGun },
            { cmd: "haceitarduelo", who: "ANA", setup: ({ G, ME, ANA, give }) => { withGun({ give, ME, G }); challenge(G, ME.id, ANA.id); } },
            { cmd: "hrecusarduelo", who: "ANA", setup: ({ G, ME, ANA, give }) => { withGun({ give, ME, G }); challenge(G, ME.id, ANA.id); } }
        ]
    },
    {
        group: "Conquistas",
        cases: [
            { cmd: "hconquistas", setup: ({ G, ME }) => { unlockAchievement(G, ME.id, "first_steps"); } },
            { cmd: "htitulos", note: "nenhum" },
            { cmd: "htitulos", setup: ({ G, ME }) => { unlockAchievement(G, ME.id, "first_steps"); } },
            { cmd: "hequipartitulo first_steps", setup: ({ G, ME }) => { unlockAchievement(G, ME.id, "first_steps"); } },
            { cmd: "hdesequipartitulo", note: "sem título" }
        ]
    },
    {
        group: "Social",
        cases: [
            { cmd: "hbio" },
            { cmd: "hbio Programo de dia e roubo de noite. 😎" },
            { cmd: "hcasar <@222222222222222222>" },
            { cmd: "haceitarcasamento", who: "ANA", setup: ({ G, ME, ANA }) => requestMarriage(G, ME.id, ANA.id) },
            { cmd: "hrecusarcasamento", who: "ANA", setup: ({ G, ME, ANA }) => requestMarriage(G, ME.id, ANA.id) },
            { cmd: "hdivorciar", setup: married },
            { cmd: "hfamilia", note: "solteiro" },
            { cmd: "hfamilia", note: "casado", setup: married },
            { cmd: "hgozofone", setup: married }
        ]
    },
    {
        group: "Utilidades",
        cases: [
            { cmd: "hping" },
            { cmd: "htestembed" },
            { cmd: "hnaoexiste", note: "(sem resposta)" },
            { cmd: "hdepositar", note: "falta a quantia" },
            { cmd: "hdepositar abc", note: "valor inválido" }
        ]
    }
];
