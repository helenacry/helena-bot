// ==========================================
// INGLÊS: O QUE VEM DOS CATÁLOGOS
// ==========================================

// Itens, empregos, missões, conquistas, histórias de crime e as descrições dos comandos moram em config/
// (e nos arquivos de commands/). Aqui cada um tem a sua tradução, ligada ao catálogo POR ID (ou pelo texto,
// quando não há ID). O dicionário (en-US.mjs) lê estas tabelas e monta as entradas sozinho.
//
// Item, emprego, missão ou conquista NOVO sem tradução aqui: o teste tests/i18n-coverage.test.mjs falha e diz
// qual. Os nomes também ficam registrados em registerNames (template.mjs), para as frases com {nome}
// ("Você comprou **{n}× {item}**") trazerem o nome já traduzido.

import { ITEMS, ITEM_CATEGORIES, WEAPON_TYPES } from "../items.mjs";

import { JOBS } from "../jobs.mjs";

import { MISSIONS } from "../missions.mjs";

import { ACHIEVEMENTS, ACHIEVEMENT_RARITIES } from "../achievements.mjs";

import {
    CRIME_FAILURE_STORIES,
    CRIME_JACKPOT_STORY,
    CRIME_SUCCESS_STORIES
} from "../crime.mjs";

import { HELP_CONFIG } from "../help.mjs";

import { COMMAND_CATEGORIES } from "../command-categories.mjs";

import { registerNames } from "./template.mjs";

// ---------- itens: [nome, descrição, verbo de usar (quando tem)] ----------

export const ITEM_TEXT = Object.freeze({
    apple: ["Apple", "A fresh apple. Restores 10 energy.", "Eat"],
    coffee: ["Coffee", "A coffee to start the shift. Restores 25 energy.", "Drink"],
    energy_drink: ["Energy drink", "An energy drink. Restores 50 energy.", "Drink"],
    supply_pack: ["Supply pack", "Always comes with 3 apples, 2 coffees and 1 energy drink. Open it with /abrir."],
    mystery_box: ["Mystery box", "A box with unknown contents. No longer for sale and doesn't open yet."],
    fishing_rod: ["Fishing rod", "A tool for future fishing activities."],
    backpack: ["Backpack", "Gear for future expansions."],
    worker_medal: ["Worker medal", "A medal of recognition."],
    wooden_sword: ["Wooden sword", "A simple sword for beginners."],
    iron_sword: ["Iron sword", "A sturdy sword made of iron."],
    steel_sword: ["Steel sword", "A steel sword for seasoned adventurers."],
    pocket_knife: ["Pocket knife", "A compact pocket knife."],
    combat_knife: ["Combat knife", "A sturdy knife."],
    machete: ["Machete", "A large blade."],
    katana: ["Katana", "A curved-blade sword."],
    legendary_blade: ["Legendary blade", "A rare weapon of great power."],
    revolver: ["Revolver", "Basic short-range weaponry."],
    pistol: ["Pistol", "A general-purpose pistol."],
    smg: ["Submachine gun", "Compact automatic weaponry."],
    shotgun: ["Shotgun", "A high-impact weapon."],
    assault_rifle: ["Assault rifle", "Advanced weaponry."],
    sniper_rifle: ["Sniper rifle", "Rare long-range weaponry."]
});

// ---------- empregos ----------

export const JOB_NAMES = Object.freeze({
    entregador: "Delivery courier",
    atendente: "Shop assistant",
    faxineiro: "Cleaner",
    garcom: "Waiter",
    motorista: "Driver",
    cozinheiro: "Cook",
    seguranca: "Security guard",
    mecanico: "Mechanic",
    eletricista: "Electrician",
    tecnico: "Technician",
    programador: "Programmer",
    enfermeiro: "Nurse",
    contador: "Accountant",
    engenheiro: "Engineer",
    advogado: "Lawyer",
    medico: "Doctor",
    arquiteto: "Architect",
    supervisor: "Supervisor",
    gerente: "Manager",
    diretor: "Director",
    executivo: "Executive",
    presidente: "President",
    magnata: "Tycoon"
});

// ---------- missões: [nome, descrição] ----------

export const MISSION_TEXT = Object.freeze({
    work: ["Dedicated worker", "Work 2 times"],
    deposit: ["Financial organization", "Deposit money 2 times"],
    daily: ["Daily presence", "Claim your daily reward"]
});

// ---------- conquistas: [nome, descrição, título] ----------

export const ACHIEVEMENT_TEXT = Object.freeze({
    first_steps: ["First Steps", "Reach level 2.", "Beginner"],
    veteran: ["Veteran", "Reach level 10.", "Veteran"],
    elite: ["Helena Elite", "Reach level 25.", "Elite"],
    first_savings: ["First Savings", "Accumulate R$ 1,000 in net worth.", "Saver"],
    rich: ["Rich Life", "Accumulate R$ 10,000 in net worth.", "Rich"],
    // "Magnata" é também um emprego (JOB_NAMES): o mesmo nome nos dois, senão um sobrescreve o outro
    magnate: ["Tycoon", "Accumulate R$ 100,000 in net worth.", "Tycoon"],
    daily_3: ["Off to a Good Start", "Reach a 3-day daily streak.", "Persistent"],
    daily_7: ["A Week of Dedication", "Reach a 7-day daily streak.", "Dedicated"],
    daily_30: ["Absolute Discipline", "Reach a 30-day daily streak.", "Unstoppable"],
    duelist: ["Duelist", "Win 10 duels.", "Duelist"],
    champion: ["Arena Champion", "Win 50 duels.", "Champion"],
    gem_collector: ["Gem Collector", "Accumulate 100 gems.", "Collector"]
});

export const RARITY_NAMES = Object.freeze({
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary"
});

export const CATEGORY_NAMES = Object.freeze({
    consumable: "Consumables",
    tool: "Tools",
    equipment: "Equipment",
    weapon: "Weapons",
    box: "Boxes",
    collectible: "Collectibles"
});

export const WEAPON_TYPE_NAMES = Object.freeze({
    firearm: "Firearms",
    melee: "Melee weapons"
});

// ---------- histórias do crime (pelo texto) ----------

export const CRIME_STORY_TEXT = Object.freeze({
    "Você aplicou o golpe do falso sorteio num grupo de mensagens.": "You ran the fake giveaway scam in a chat group.",
    "Você revendeu ingressos falsificados na porta de um show.": "You resold counterfeit tickets at the door of a concert.",
    "Você sumiu com a gorjeta de um caixa distraído.": "You made off with a distracted cashier's tip.",
    "Você clonou um cartão de fidelidade e vendeu os pontos.": "You cloned a loyalty card and sold the points.",
    "Você montou uma rifa fantasma no bairro.": "You set up a phantom raffle in the neighborhood.",
    "Você levou a bolsa esquecida numa mesa de café.": "You took a bag left behind on a café table.",
    "Você vendeu um \"celular importado\" que era um tijolo embrulhado.": "You sold an \"imported phone\" that was a wrapped brick.",
    "Você fraudou o troco numa lanchonete lotada.": "You shortchanged people at a packed snack bar.",
    "Você abriu uma conta de fachada em nome de um laranja.": "You opened a front account in a straw man's name.",
    "Você revendeu cupons de desconto roubados.": "You resold stolen discount coupons.",
    "Você cobrou uma \"taxa de urgência\" por um contrato que nunca existiu.": "You charged an \"urgency fee\" for a contract that never existed.",
    "Você interceptou uma entrega e revendeu a mercadoria.": "You intercepted a delivery and resold the goods.",
    "Você achou um cofre aberto num escritório vazio. O melhor dia da sua carreira.": "You found an open safe in an empty office. The best day of your career.",
    "Uma câmera de segurança filmou tudo.": "A security camera filmed everything.",
    "Um vizinho curioso chamou a viatura.": "A curious neighbor called the patrol car.",
    "Você tropeçou na fuga e caiu nos braços da polícia.": "You tripped during the getaway and fell into the police's arms.",
    "Seu comparsa entregou você para aliviar a própria pena.": "Your accomplice turned you in to lighten their own sentence.",
    "A vítima era policial à paisana e reagiu.": "The victim was an undercover cop and fought back.",
    "O alarme disparou na hora errada e você foi cercado.": "The alarm went off at the wrong time and you were surrounded.",
    "O golpe foi descoberto e a vítima chamou a patrulha.": "The scam was discovered and the victim called the patrol.",
    "Você pulou um muro, mas a queda foi pior que a fuga.": "You jumped a wall, but the fall was worse than the escape."
});

// ---------- categorias e central de ajuda (pelo id) ----------

export const CATEGORY_LABELS = Object.freeze({
    economia: "Economy",
    crime: "Crime",
    combate: "Combat",
    progresso: "Progress",
    social: "Social",
    utilidades: "Utilities"
});

export const HELP_BLURBS = Object.freeze({
    economia: "Money, bank, shop, inventory, work, missions and the server market.",
    crime: "Crime, robbery, money laundering and prison.",
    combate: "Duels, weapons, health and gear.",
    progresso: "Achievements and titles.",
    social: "Profile, marriage and user information.",
    utilidades: "The help center and the check that the bot is up."
});

// ---------- descrições dos comandos e das opções (pelo texto) ----------

// Aparecem na central de ajuda (/ajuda) e na lista de comandos do Discord. O teste de cobertura confere que
// todo comando e toda opção tem a sua tradução aqui.
export const COMMAND_TEXT = Object.freeze({
    "Compra munição (R$ 1 cada)": "Buy ammo (R$ 1 each)",
    "Quantas munições comprar (1 a 100)": "How much ammo to buy (1 to 100)",
    "Mostra sua vida, vitórias, derrotas e equipamento": "Shows your health, wins, losses and gear",
    "Cometa um crime em busca de dinheiro sujo": "Commit a crime in search of dirty money",
    "Equipa uma arma do seu inventário": "Equip a weapon from your inventory",
    "ID da arma que deseja equipar": "ID of the weapon you want to equip",
    "Cure sua vida no hospital (R$ 1 por ponto)": "Heal at the hospital (R$ 1 per point)",
    "Mostra os seus últimos duelos": "Shows your latest duels",
    "Mostra sua vida e quanto custa se curar": "Shows your health and what healing costs",
    "Veja o tempo da lavagem de dinheiro em andamento": "Check the time left on your ongoing money laundering",
    "Lave seu dinheiro sujo e receba-o limpo": "Launder your dirty money and get it back clean",
    "Valor em reais, 'tudo'/'all' ou 'desbloquear' (opcional)": "Amount in reais, 'all'/'tudo' or 'desbloquear' (optional)",
    "Lavanderia pública ou privada": "Public or private laundromat",
    "Pública": "Public",
    "Privada": "Private",
    "Consulte sua pena e sua ficha criminal": "Check your sentence and your criminal record",
    "Mostra quanto falta da sua proteção contra duelos": "Shows how much of your duel protection is left",
    "Mostra a munição da arma de fogo equipada": "Shows the ammo of your equipped firearm",
    "Conserta a arma equipada (R$ 50)": "Repair your equipped weapon (R$ 50)",
    "Roube dinheiro da carteira de outro jogador": "Steal money from another player's wallet",
    "Nome, @menção ou ID de quem você quer roubar": "Name, @mention or ID of who you want to rob",
    "Guarda a arma equipada de volta no inventário": "Put your equipped weapon back in the inventory",
    "Compra um colete (10 pontos de defesa)": "Buy a vest (10 defense points)",
    "Veja quem tem ficha criminal no servidor": "See who has a criminal record in the server",
    "Número da página (opcional)": "Page number (optional)",
    "Consulta sua situação financeira": "Check your financial situation",
    "Compre itens utilizando sua carteira": "Buy items using your wallet",
    "Item que deseja comprar": "Item you want to buy",
    "Quantidade de unidades (1 a 99)": "Number of units (1 to 99)",
    "Colete seu bônus de gemas (vale em todos os servidores)": "Claim your gem bonus (works in every server)",
    "Consulte o tempo restante das suas atividades": "Check the time left on your activities",
    "Veja o seu bônus diário (a coleta é no site da Helena)": "See your daily bonus (claimed on Helena's website)",
    "Guarda seu dinheiro no banco da Helena": "Keep your money in Helena's bank",
    "Quantidade, 'tudo' ou 'all'": "Amount, 'all' or 'tudo'",
    "Descarte itens do inventário (sem reembolso)": "Discard inventory items (no refund)",
    "Nome ou ID do item": "Item name or ID",
    "Número, 'metade' ou 'tudo' (padrão: 1)": "A number, 'metade' (half) or 'tudo' (all) (default: 1)",
    "Consulte sua energia e regeneração": "Check your energy and regeneration",
    "Consulta seu saldo global de gemas": "Check your global gem balance",
    "Abra seu inventário: veja, organize e descarte itens": "Open your inventory: view, organize and discard items",
    "Abrir já numa prateleira (categoria)": "Open directly on a shelf (category)",
    "Consulte os empregos e avance na carreira": "Browse jobs and move up in your career",
    "ID do emprego que deseja assumir": "ID of the job you want to take",
    "Veja o índice do mercado, o item em alta e os preços de agora": "See the market index, the trending item and today's prices",
    "Consulte e resgate suas missões diárias": "Check and claim your daily missions",
    "Missão que deseja resgatar": "Mission you want to claim",
    "Consulte os melhores jogadores do servidor ou de todos os servidores": "See the top players of the server or of all servers",
    "Escolha a classificação": "Choose the ranking",
    "Neste servidor ou em todos (global)": "This server or all of them (global)",
    "Neste servidor": "This server",
    "Global (todos os servidores)": "Global (all servers)",
    "XP total (global)": "Total XP (global)",
    "Venda itens do seu inventário": "Sell items from your inventory",
    "Abra pacotes de suprimentos e receba o conteúdo": "Open supply packs and get what's inside",
    "Número de pacotes, ou 'max' para abrir todos (até 25)": "Number of packs, or 'max' to open them all (up to 25)",
    "Item que deseja vender": "Item you want to sell",
    "Abra a loja: compre e venda itens": "Open the shop: buy and sell items",
    "Abrir já numa categoria": "Open directly on a category",
    "Transfere dinheiro para outro jogador": "Send money to another player",
    "Jogador que receberá o dinheiro": "Player who will receive the money",
    "Quantidade que deseja transferir": "Amount you want to send",
    "Use itens: coma, beba ou equipe uma arma": "Use items: eat, drink or equip a weapon",
    "Nome ou ID do item (vazio abre o painel)": "Item name or ID (leave empty to open the panel)",
    "Número ou 'max' (usa até a energia encher)": "A number or 'max' (uses until your energy is full)",
    "Mostra a arma equipada, o dano e o desgaste": "Shows your equipped weapon, its damage and wear",
    "Retira dinheiro do banco da Helena": "Withdraw money from Helena's bank",
    "Trabalhe para ganhar dinheiro e experiência": "Work to earn money and experience",
    "Consulte suas conquistas, títulos e progresso": "Check your achievements, titles and progress",
    "Jogador que deseja consultar": "Player you want to look up",
    "Equipe um título que você desbloqueou": "Equip a title you unlocked",
    "Identificador do título. Consulte /titulos": "Title identifier. See /titulos",
    "Consulte seus títulos desbloqueados": "Check your unlocked titles",
    "Remova seu título equipado sem perder a conquista": "Remove your equipped title without losing the achievement",
    "Aceita o desafio de duelo que você recebeu": "Accept the duel challenge you received",
    "Aceita um pedido de casamento recebido": "Accept a marriage proposal you received",
    "Desafia outro jogador para um duelo": "Challenge another player to a duel",
    "Jogador": "Player",
    "Personalize a descrição do seu perfil": "Customize your profile description",
    "Sua biografia (até 160 caracteres). Vazio abre o editor": "Your biography (up to 160 characters). Leave empty to open the editor",
    "Recusa o desafio de duelo que você recebeu": "Decline the duel challenge you received",
    "Recusa um pedido de casamento recebido": "Decline a marriage proposal you received",
    "Encerra seu casamento atual": "End your current marriage",
    "Veja o seu casal e os seus filhos": "See your couple and your children",
    "Ligue para o seu cônjuge: pode render um filho ou um dinheiro": "Call your spouse: it may bring a child or some money",
    "Envia um pedido de casamento": "Send a marriage proposal",
    "Pessoa que você deseja pedir em casamento": "Person you want to propose to",
    "Consulte o cartão de perfil na Helena": "Check a profile card on Helena",
    "@usuário ou @menção de quem você quer ver (vazio = você)": "@user or @mention of who you want to see (empty = you)",
    "Veja as informações e insígnias de um usuário do Discord": "See a Discord user's information and badges",
    "@usuário ou menção (vazio = você). Ou ocultar, mostrar, apagar: o seu histórico": "@user or mention (empty = you). Or ocultar, mostrar, apagar: your history",
    "Mostra o painel de configurações: o idioma da Helena para você": "Opens the settings panel: Helena's language for you",
    "Consulte os comandos e sistemas da Helena": "Browse Helena's commands and systems",
    "Abrir já numa categoria de comandos": "Open directly on a command category",
    "Ver os detalhes de um comando (ex.: daily)": "See a command's details (e.g. daily)",
    "Mostra se o bot está no ar e se a lentidão é da Helena ou do Discord": "Shows whether the bot is up and whether any slowness is Helena's or Discord's"
});

// ------------------------------------------------------------------
// O QUE O DICIONÁRIO LÊ
// ------------------------------------------------------------------

function build() {
    const exact = {};
    const names = {};

    const put = (target, from, to) => {
        if (from && to && from !== to) {
            target[from] = to;
        }
    };

    // os nomes valem mesmo quando são iguais nos dois idiomas ("Katana"): a linha só de nomes não é pendência
    const putName = (from, to) => {
        if (from && to) {
            names[from] = to;
        }
    };

    for (const item of ITEMS) {
        const [name, description, verb] = ITEM_TEXT[item.id] ?? [];

        putName(item.name, name);
        put(exact, item.name, name);
        put(exact, item.description, description);
        put(exact, item.use?.verb, verb);
    }

    for (const job of JOBS) {
        putName(job.name, JOB_NAMES[job.id]);
        put(exact, job.name, JOB_NAMES[job.id]);
    }

    for (const mission of MISSIONS) {
        const [name, description] = MISSION_TEXT[mission.id] ?? [];

        put(exact, mission.name, name);
        put(exact, mission.description, description);
    }

    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
        const [name, description, title] = ACHIEVEMENT_TEXT[id] ?? [];

        putName(achievement.name, name);
        putName(achievement.title, title);
        put(exact, achievement.name, name);
        put(exact, achievement.description, description);
        put(exact, achievement.title, title);
    }

    for (const [id, rarity] of Object.entries(ACHIEVEMENT_RARITIES)) {
        put(exact, rarity.name, RARITY_NAMES[id]);
    }

    for (const [id, name] of Object.entries(ITEM_CATEGORIES)) {
        put(exact, name, CATEGORY_NAMES[id]);
        putName(name, CATEGORY_NAMES[id]);
    }

    for (const [id, name] of Object.entries(WEAPON_TYPES)) {
        put(exact, name, WEAPON_TYPE_NAMES[id]);
    }

    for (const story of [...CRIME_SUCCESS_STORIES, CRIME_JACKPOT_STORY, ...CRIME_FAILURE_STORIES]) {
        put(exact, story.text, CRIME_STORY_TEXT[story.text]);
    }

    for (const category of COMMAND_CATEGORIES) {
        put(exact, category.label, CATEGORY_LABELS[category.id]);
        put(exact, `${category.emoji} ${category.label}`, `${category.emoji} ${CATEGORY_LABELS[category.id]}`);
    }

    for (const [id, blurb] of Object.entries(HELP_CONFIG.blurbs)) {
        put(exact, blurb, HELP_BLURBS[id]);
    }

    Object.assign(exact, COMMAND_TEXT);

    registerNames(names);

    return exact;
}

export const CATALOG_EXACT = Object.freeze(build());
