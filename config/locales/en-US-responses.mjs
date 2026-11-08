// ==========================================
// INGLÊS: AS RESPOSTAS DOS COMANDOS
// ==========================================

// O que cada comando escreve, na ordem em que os comandos aparecem. Os textos em português têm de ser
// EXATAMENTE os que o código manda (o rastreador scripts/dev/i18n-scan.mjs lista o que ainda falta).
// Os nomes de comandos (`/loja`, `/equipar`...) não mudam: são o que a pessoa digita.
//
//   RESPONSES_EXACT      o texto inteiro, sem partes que mudam
//   RESPONSES_PATTERNS   com partes que mudam, escritas com tpl() (veja template.mjs)

import { tpl } from "./template.mjs";

// ---------- ajudantes ----------

const plural = (n, one, many = `${one}s`) => (String(n) === "1" ? one : many);

const TIME = Object.freeze({
    segundo: ["second", "seconds"],
    minuto: ["minute", "minutes"],
    hora: ["hour", "hours"],
    dia: ["day", "days"],
    semana: ["week", "weeks"]
});

// como a ajuda escreve o tipo de cada opção
const OPTION_TYPES = Object.freeze({
    texto: "text",
    "número inteiro": "integer",
    número: "number",
    "jogador (nome, @menção ou ID)": "player (name, @mention or ID)",
    booleano: "true/false"
});

// "5 horas" -> "5 hours", "1 dia" -> "1 day"
const timeWords = (n, unit) => {
    const base = unit.replace(/s$/, "");

    const [one, many] = TIME[base] ?? [base, base];

    return `${n} ${String(n) === "1" ? one : many}`;
};

export const RESPONSES_EXACT = Object.freeze({
    // ---------- avisos e erros comuns ----------
    "❌ Não deu certo": "❌ That didn't work",
    "Carteira insuficiente.": "Not enough in your wallet.",
    "Saldo insuficiente.": "Insufficient balance.",
    "Informe uma quantia válida.": "Enter a valid amount.",
    "Informe uma quantidade entre 1 e 99.": "Enter an amount between 1 and 99.",
    "Informe uma quantia inteira e positiva.": "Enter a whole, positive amount.",
    "Você não possui saldo disponível.": "You have no available balance.",
    "Sua bio não pode ficar vazia.": "Your bio can't be empty.",
    "Essa arma não existe.": "That weapon doesn't exist.",
    "Você ainda não desbloqueou a conquista necessária.": "You haven't unlocked the required achievement yet.",
    "Bônus de gemas": "Gem bonus",
    "Recompensa diária": "Daily reward",
    "Energia atual": "Current energy",
    "Em alta": "Trending",
    "Selecione um item válido.": "Select a valid item.",
    "Você não possui dinheiro suficiente na carteira.": "You don't have enough money in your wallet.",
    "Não foi possível identificar a conta ou servidor.": "Couldn't identify the account or server.",
    "Não foi possível identificar o destinatário.": "Couldn't identify the recipient.",

    // ---------- casamento, divórcio e família ----------
    "Você não possui nenhum pedido de casamento pendente.": "You have no pending marriage proposals.",
    "Felicidades ao novo casal! ❤️": "Congratulations to the new couple! ❤️",
    "Uma nova história começa": "A new story begins",
    "Essa pessoa já possui um pedido de casamento pendente.": "That person already has a pending marriage proposal.",
    "O casamento só é registrado se a pessoa convidada aceitar.": "The marriage is only registered if the invited person accepts.",
    "Cada um segue o seu caminho": "Each goes their own way",
    "Você recusou o pedido de casamento. Seu estado civil continua como estava.": "You declined the marriage proposal. Your marital status stays as it was.",
    "Você não está casado(a).": "You are not married.",
    "Seu casamento foi encerrado. O estado civil de ambos voltou para Solteiro(a).": "Your marriage has ended. Both of your marital statuses went back to Single.",
    "Um novo capítulo começa": "A new chapter begins",
    "Você não está casado(a). Peça alguém em casamento com `/casar` para formar uma família.": "You are not married. Propose to someone with `/casar` to start a family.",
    "💞 Casal": "💞 Couple",
    "Ainda não têm filhos. Tentem o `/gozofone`!": "No children yet. Try the `/gozofone`!",
    "O Gozofone é para casais: peça alguém em casamento com `/casar`.": "The Gozofone is for couples: propose to someone with `/casar`.",
    "Atenda em até **10 segundos**!": "Answer within **10 seconds**!",
    "Atender": "Answer",
    "Recusar": "Decline",
    "Só o cônjuge atende; quem ligou pode cancelar": "Only the spouse can answer; the caller can cancel",

    // ---------- duelos e combate ----------
    "🤝 **Empate!**": "🤝 **Draw!**",
    "Aguarde o cooldown de 5 minutos.": "Wait for the 5-minute cooldown.",
    "Ninguém tem ficha criminal neste servidor. A ficha cresce a cada crime, roubo ou lavagem iniciada.": "Nobody has a criminal record in this server. The record grows with every crime, robbery or laundering started.",
    "Você não tem desafio pendente.": "You have no pending challenge.",
    "❌ Você não possui nenhum desafio pendente.": "❌ You have no pending challenge.",
    "Nenhum dinheiro será perdido.": "No money will be lost.",
    "Um dos jogadores já possui desafio pendente.": "One of the players already has a pending challenge.",
    "Um dos jogadores está protegido pelo hospital.": "One of the players is protected by the hospital.",
    "Você precisa selecionar um jogador.": "You need to select a player.",
    "Nenhum duelo registrado ainda. Desafie alguém com `/atacar`.": "No duels recorded yet. Challenge someone with `/atacar`.",
    "Os 5 últimos duelos (empates não entram)": "The last 5 duels (draws don't count)",
    "Você está desarmado. Compre uma na `/loja` (prateleira **Armas**) e equipe com `/equipar`.": "You're unarmed. Buy one at the `/loja` (**Weapons** shelf) and equip it with `/equipar`.",
    "Arma branca": "Melee weapon",
    "Arma de fogo": "Firearm",
    "não usa": "doesn't use",
    "Tipo": "Type",
    "Defesa": "Defense",
    "Pagou": "Paid",
    "Vitórias": "Wins",
    "Derrotas": "Losses",
    "Proteção": "Protection",
    "Sem proteção": "No protection",
    "Informe uma arma válida.": "Enter a valid weapon.",
    "Essa arma já está equipada.": "That weapon is already equipped.",
    "⚠️ Não foi possível equipar": "⚠️ Couldn't equip",
    "Você não possui essa arma no inventário.": "You don't have that weapon in your inventory.",
    "Você não possui nenhuma arma equipada.": "You don't have any weapon equipped.",
    "Equipe uma arma primeiro.": "Equip a weapon first.",
    "Equipe uma arma de fogo.": "Equip a firearm.",
    "⚠️ Sem arma de fogo": "⚠️ No firearm",
    "⚠️ Não foi possível reparar": "⚠️ Couldn't repair",
    "⚠️ Não foi possível comprar o colete": "⚠️ Couldn't buy the vest",
    "⚠️ Não foi possível comprar munição": "⚠️ Couldn't buy ammo",
    "⚠️ Não foi possível se curar": "⚠️ Couldn't heal",
    "Sua vida já está cheia.": "Your health is already full.",
    "Você está com a vida cheia. Nada a tratar.": "Your health is full. Nothing to treat.",
    "Use `/curar` para se tratar.": "Use `/curar` to get treated.",
    "Quantidade entre 1 e 100.": "Amount between 1 and 100.",
    "Nenhuma pena em curso. Consultas e movimentações estão liberadas.": "No sentence in progress. Lookups and transactions are open.",
    "Trabalho, compras, depósitos e outras movimentações ficam bloqueados até o fim da pena.": "Work, purchases, deposits and other transactions are blocked until the sentence ends.",
    "Ficha criminal": "Criminal record",
    "Atualizado automaticamente": "Updated automatically",
    "Nesse tempo ninguém pode te desafiar, e você também não pode desafiar.": "During that time nobody can challenge you, and you can't challenge anyone either.",
    "Você está **sem proteção**.": "You are **unprotected**.",

    // ---------- crime ----------
    "🕵️ Crime bem-sucedido": "🕵️ Crime successful",
    "⚠️ Recarga em andamento": "⚠️ Cooldown in progress",
    "⚠️ Você está preso": "⚠️ You are in prison",
    "A polícia ainda está de olho em você.": "The police are still watching you.",
    "Preso, você não trabalha, não compra e não mexe em dinheiro.": "In prison you can't work, buy or move money.",
    "`NÃO VALE NADA` até passar pela `/lavagem`.": "`WORTHLESS` until it goes through the `/lavagem`.",
    "Total sujo": "Dirty total",
    "Ferimento": "Injury",
    "Multa": "Fine",
    "Custo": "Cost",
    "Custo para curar": "Cost to heal",
    "Preço por ponto": "Price per point",
    "Proteção contra duelos": "Duel protection",
    "Sucessos": "Successes",
    "Total arrecadado (sujo)": "Total collected (dirty)",
    "Capturas": "Arrests",

    // ---------- lavagem ----------
    "⚠️ Lavagem em andamento": "⚠️ Laundering in progress",
    "⚠️ Sem dinheiro sujo": "⚠️ No dirty money",
    "⚠️ Valor inválido": "⚠️ Invalid amount",
    "Lavando": "Laundering",
    "Liberada neste servidor.": "Unlocked in this server.",
    "✅ Lavanderia privada liberada": "✅ Private laundromat unlocked",
    "⚠️ Confirmação incorreta": "⚠️ Incorrect confirmation",
    "Para liberar a lavanderia privada, digite **LIBERAR**. Nada foi cobrado.": "To unlock the private laundromat, type **LIBERAR**. Nothing was charged.",
    "⚠️ Faltou o valor": "⚠️ Missing the amount",
    "Informe quanto lavar, ou `tudo`.": "Enter how much to launder, or `tudo`.",
    "⚠️ Dinheiro sujo insuficiente": "⚠️ Not enough dirty money",
    "⚠️ Faltou a quantia": "⚠️ Missing the amount",
    "Informe quanto, ou `tudo`.": "Enter how much, or `tudo`.",
    "Pronto": "Done",
    "⚠️ Busca curta demais": "⚠️ Search too short",
    "Escreva pelo menos 2 letras.": "Type at least 2 letters.",
    "Diga o nome ou o ID do item.": "Say the item's name or ID.",
    "Duração": "Duration",
    "Lavanderia": "Laundromat",
    "Retorno": "Return",
    "Termina em": "Ends in",
    "Exemplo: `/lavagem valor:5000 tipo:publica`": "Example: `/lavagem valor:5000 tipo:publica`",
    "Seu dinheiro está sendo lavado. Quando terminar, o valor limpo cai direto na carteira e eu aviso neste canal.": "Your money is being laundered. When it finishes, the clean amount goes straight into your wallet and I'll let you know in this channel.",
    "Você já tem uma lavagem em curso.": "You already have a laundering in progress.",
    "Você não tem dinheiro sujo para lavar. Use `/crime` para conseguir.": "You don't have any dirty money to launder. Use `/crime` to get some.",
    "Lavar dinheiro exige energia.": "Laundering money takes energy.",
    "⚠️ Valor fora do limite": "⚠️ Amount out of range",
    "⚠️ Gemas insuficientes": "⚠️ Not enough gems",
    "🏭 Pública": "🏭 Public",
    "🔐 Privada": "🔐 Private",
    "Devolve": "Returns",
    "Velocidade": "Speed",
    "Vaga": "Slot",
    "livre": "free",
    "pronta": "ready",
    "nada": "nothing",
    "Próxima lavagem": "Next laundering",
    "Uma por vez no servidor.": "One at a time per server.",
    "Dinheiro sujo não serve para compras, depósitos ou transferências. Lave-o para recebê-lo limpo na carteira.": "Dirty money can't be used for purchases, deposits or transfers. Launder it to get it clean in your wallet.",
    "Você não tem dinheiro sendo lavado agora.": "You don't have any money being laundered right now.",
    "Lavar (pública)": "Launder (public)",
    "Lavar (privada)": "Launder (private)",
    "Liberar privada": "Unlock private",
    "Liberar lavanderia privada": "Unlock private laundromat",
    "Lavar na lavanderia pública": "Launder at the public laundromat",
    "Lavar na lavanderia privada": "Launder at the private laundromat",
    "Custa 10 gemas, uma única vez neste servidor": "Costs 10 gems, once only in this server",
    "O dinheiro sujo não entra no patrimônio. Lave com `/lavagem`.": "Dirty money doesn't count toward your net worth. Launder it with `/lavagem`.",

    // ---------- economia: banco ----------
    "🏦 Depositar": "🏦 Deposit",
    "Depositar no banco": "Deposit into the bank",
    "Sacar do banco": "Withdraw from the bank",
    "Transferir dinheiro": "Transfer money",
    "Nome, @menção ou ID": "Name, @mention or ID",
    "Patrimônio": "Net worth",
    "💰 Patrimônio total": "💰 Total net worth",
    "Depositado": "Deposited",
    "Sacado": "Withdrawn",
    "Enviado": "Sent",
    "Recebeu": "Received",
    "O dinheiro saiu do banco e já está na sua carteira.": "The money left the bank and is already in your wallet.",
    "A missão de depósito foi atualizada: `/missoes`.": "The deposit mission was updated: `/missoes`.",

    // ---------- energia ----------
    "Use `/energia` para acompanhar a regeneração.": "Use `/energia` to track regeneration.",
    "Você não tem energia para um crime agora.": "You don't have the energy for a crime right now.",
    "Hora de usar: /trabalhar ou /crime": "Time to put it to use: /trabalhar or /crime",
    "🧾 Antes de trabalhar, escolha um emprego no menu abaixo.": "🧾 Before working, pick a job from the menu below.",
    "⚡ Sua energia": "⚡ Your energy",
    "Dá para trabalhar": "Shifts you can work",
    "Regeneração": "Regeneration",
    "Trabalhar custa": "Working costs",
    "Próximo ponto": "Next point",
    "A energia volta sozinha com o tempo": "Energy comes back on its own over time",
    "Energia": "Energy",

    // ---------- bio ----------
    "Ela aparece no cartão do seu `/perfil`.": "It shows on your `/perfil` card.",
    "O cartão do /perfil mostra a bio": "The /perfil card shows your bio",
    "Use o botão para editar ou /bio <texto>": "Use the button to edit, or /bio <text>",
    "Você ainda não definiu uma bio.": "You haven't set a bio yet.",
    "Conte um pouco sobre você": "Tell us a bit about yourself",
    "Sua bio (até 160 caracteres)": "Your bio (up to 160 characters)",
    "Sua bio pode ter no máximo 160 caracteres (cada emoji conta como 1).": "Your bio can have at most 160 characters (each emoji counts as 1).",

    // ---------- loja, inventário, bolsa ----------
    "Abrir a loja": "Open the shop",
    "Os preços da loja ficam sempre no valor de tabela.": "Shop prices always stay at list value.",
    "📦 Limite do item atingido": "📦 Item limit reached",
    "Por nome": "By name",
    "Escolha uma prateleira.": "Pick a shelf.",
    "Ver tudo": "See all",
    "Comprar item": "Buy item",
    "Vender item": "Sell item",
    "venda não vende": "can't be sold",
    "comida e bebida repõem energia": "food and drinks restore energy",

    // ---------- conquistas, títulos e missões ----------
    "/titulos mostra os títulos que você já pode usar": "/titulos shows the titles you can already use",
    "Nenhuma conquista desbloqueada.": "No achievements unlocked.",
    "Desbloqueadas": "Unlocked",
    "Pendentes": "Pending",
    "🏷️ Título equipado: nenhum": "🏷️ Equipped title: none",
    "Esse título não existe.": "That title doesn't exist.",
    "Informe o identificador do título.": "Enter the title identifier.",
    "Use `/titulos` para consultar os disponíveis.": "Use `/titulos` to see the available ones.",
    "Nenhum título desbloqueado.": "No titles unlocked.",

    // ---------- recargas (/cooldowns) ----------
    "⏱️ Tempos de recarga": "⏱️ Cooldowns",
    "🦹 Ilegal": "🦹 Illegal",
    "Pronto para uso": "Ready to use",
    "Só para casais": "Couples only",
    "Toque em Atualizar para ver os tempos de agora.": "Tap Refresh to see the current times.",
    "Bônus": "Bonus",

    // ---------- descartar, inventário e loja ----------
    "Diga o nome ou o ID do item que quer descartar.": "Say the name or ID of the item you want to discard.",
    "⚠️ Faltou o item": "⚠️ Missing the item",
    "Descartar item": "Discard item",
    "📦 Nenhum item nesta seleção.": "📦 No items in this selection.",
    "Visite `/loja` para adquirir novos itens.": "Visit the `/loja` to get new items.",
    "Visite a `/loja` para adquirir novos itens.": "Visit the `/loja` to get new items.",
    "**Seus títulos disponíveis:**": "**Your available titles:**",
    "📦 Não há produtos à venda nesta prateleira.": "📦 There are no products for sale on this shelf.",
    "Não há produtos à venda nesta prateleira.": "There are no products for sale on this shelf.",
    "📦 Nenhum item disponível": "📦 No items available",
    "1 a 99, ou max para o máximo que dá": "1 to 99, or max for as many as you can",
    "Atualizado automaticamente. Use /prisao": "Updated automatically. Use /prisao",
    "Crime frustrado": "Crime foiled",
    "Este comando fica bloqueado enquanto você cumpre pena. Consultas continuam liberadas.": "This command is blocked while you serve your sentence. Lookups remain open.",
    "Munição agora": "Ammo now",
    "Ainda tem": "Still have",
    "Preço unitário": "Unit price",

    // ---------- bolsa ----------
    "Bolsa do servidor": "Server market",
    "Como funciona": "How it works",
    "Item em alta": "Trending item",
    "Preços de agora (▲ em alta)": "Prices right now (▲ trending)",
    "Índice": "Index",
    "Preços": "Prices",
    "Atualiza em": "Updates in",
    "O índice muda a cada 30 minutos e mexe nos preços da loja.": "The index changes every 30 minutes and affects shop prices.",
    "Baixo": "Low",
    "Médio": "Medium",
    "Alto": "High",

    // ---------- central de ajuda ----------
    "📂 Categoria": "📂 Category",
    "🔁 Atalhos": "🔁 Shortcuts",
    "🔎 Ver detalhes de um comando": "🔎 See a command's details",
    "📝 Como usar": "📝 How to use",
    "⚙️ Opções": "⚙️ Options",
    "🚔 Na cadeia": "🚔 In prison",
    "Fica bloqueado enquanto você cumpre pena.": "Blocked while you serve your sentence.",
    "Encontre o que precisa escolhendo uma categoria abaixo.": "Find what you need by picking a category below.",
    "Escolha um comando no menu para ver as opções e como usar.": "Pick a command from the menu to see its options and how to use it.",
    "Funcionam igual ao comando.": "They work just like the command.",
    "O menu de categorias volta ao início da ajuda": "The category menu returns to the start of the help",
    "Painel do jogador": "Player panel",
    "Ver": "View",
    "Ex.: daily, arma, dinheiro sujo, casamento": "E.g.: daily, weapon, dirty money, marriage",

    // ---------- usar item ----------
    "Equipa a arma": "Equips the weapon",
    "Equipar a arma": "Equip the weapon",
    "Cada toque usa 1 unidade. Comida com energia cheia não é gasta.": "Each tap uses 1 unit. Food at full energy isn't spent.",
    "Use `/usaritem` para ver o que dá.": "Use `/usaritem` to see what you can use.",
    "Você não tem nenhum item para usar. Compre comida e bebida na `/loja`.": "You don't have any items to use. Buy food and drinks at the `/loja`.",
    "comida com energia cheia não é gasta": "food at full energy isn't spent",
    "Escolha no menu para usar 1 unidade": "Pick from the menu to use 1 unit",

    // ---------- crime: o que sobra ----------
    "nada (carteira vazia)": "nothing (empty wallet)",
    "Golpe de mestre": "Masterstroke",
    "nenhuma": "none",

    // ---------- empregos ----------
    "Disponíveis para você": "Available to you",
    "Ainda bloqueados": "Still locked",
    "Escolha no menu para começar a trabalhar": "Pick from the menu to start working",
    "Faltam": "Missing",
    "Nível exigido": "Required level",
    "seu emprego": "your job",
    "Seu nível": "Your level",
    "Trabalhar rende experiência, e cada nível novo libera cargos melhores.": "Working earns experience, and each new level unlocks better jobs.",
    "Troque de cargo no menu ou com /empregos cargo:nome": "Switch jobs from the menu or with /empregos cargo:name",
    "Um novo capítulo na sua carreira": "A new chapter in your career",
    "📌 Você está sem emprego. Seu nível é **1**.": "📌 You have no job. Your level is **1**.",

    // ---------- missões ----------
    "em andamento": "in progress",
    "resgatada": "claimed",
    "pronta para resgatar": "ready to claim",
    "Resgatada": "Claimed",
    "🎁 Nenhuma recompensa pronta agora": "🎁 No rewards ready right now",
    "🎊 Você subiu de nível!": "🎊 You leveled up!",
    "Complete os objetivos do dia e resgate as recompensas. As missões reiniciam à **meia-noite UTC**.": "Complete the day's objectives and claim the rewards. Missions reset at **midnight UTC**.",
    "Conclua o objetivo antes de resgatar.": "Complete the objective before claiming.",
    "Cumpra os objetivos e resgate as recompensas.": "Meet the objectives and claim the rewards.",
    "Também dá para resgatar com /missoes resgatar": "You can also claim with /missoes resgatar",

    // ---------- ranking ----------
    "Você": "You",
    "XP total": "Total XP",
    "Ranking global": "Global ranking",
    "os botões trocam a classificação": "the buttons switch the ranking",
    "os botões trocam a classificação e o alcance": "the buttons switch the ranking and its scope",

    // ---------- títulos ----------
    "/equipartitulo escolhe um": "/equipartitulo picks one",
    "/equipartitulo escolhe o título que aparece no perfil": "/equipartitulo picks the title shown on your profile",
    "✨ Título atual: nenhum": "✨ Current title: none",
    "Cada conquista libera um título": "Each achievement unlocks a title",
    "Complete conquistas para receber títulos novos.": "Complete achievements to earn new titles.",
    "Use `/conquistas` para consultar seu progresso.": "Use `/conquistas` to check your progress.",
    "Use `/titulos` para consultar os que você já pode usar.": "Use `/titulos` to see the ones you can already use."
});

export const RESPONSES_PATTERNS = Object.freeze([
    // ---------- tempo ----------
    [/^(\d+) (segundos?|minutos?|horas?|dias?|semanas?)$/, m => timeWords(m[1], m[2])],

    [/^em (\d+ (?:segundos?|minutos?|horas?|dias?))$/, (m, translate) => `in ${translate(m[1])}`],

    [/^atualizado (<t:\d+(?::[a-zA-Z])?>)$/, m => `updated ${m[1]}`],

    // ---------- casamento ----------
    tpl("Casados desde **{d}**. O estado civil já aparece no `/perfil`.", "Married since **{d}**. Your marital status now shows on your `/perfil`."),

    tpl("Casados desde {d}", "Married since {d}"),

    tpl("Responda com `/aceitarcasamento` ou `/recusarcasamento` em até **{n} horas**.", "Reply with `/aceitarcasamento` or `/recusarcasamento` within **{n} hours**."),

    tpl("👶 Filhos ({n}/{n2})", "👶 Children ({n}/{n2})"),

    tpl("{u} está ligando para {u2}.", "{u} is calling {u2}."),

    // ---------- duelos ----------
    tpl("🏆 **Vencedor:** {u} (+{n} XP)", "🏆 **Winner:** {u} (+{n} XP)"),

    tpl("🗡️ causou {n} de dano", "🗡️ dealt {n} damage"),

    tpl("{u} tem {n} minutos para usar `/aceitarduelo` ou `/recusarduelo`.", "{u} has {n} minutes to use `/aceitarduelo` or `/recusarduelo`."),

    tpl("✅ Você recusou o desafio de {u}.", "✅ You declined {u}'s challenge."),

    tpl("🏆 **{n}** vitórias · 💀 **{n2}** derrotas", "🏆 **{n}** wins · 💀 **{n2}** losses"),

    tpl("🏆 Você venceu {u} • seu golpe: {n} • há {t}", "🏆 You beat {u} • your hit: {n} • {t} ago"),

    tpl("💀 Você perdeu para {u} • golpe dele: {n} • há {t}", "💀 You lost to {u} • their hit: {n} • {t} ago"),

    // ---------- armas, colete e hospital ----------
    tpl("⚔️ Dano: {n} • Arma branca", "⚔️ Damage: {n} • Melee weapon"),

    tpl("⚔️ Dano: {n}", "⚔️ Damage: {n}"),

    tpl("{n} pontos", "{n} points"),

    tpl("Cada golpe que você recebe num duelo causa **{n}** pontos a menos de dano (nunca menos de 1).", "Each hit you take in a duel deals **{n}** fewer damage points (never less than 1)."),

    tpl("O colete segura até {n} pontos por golpe", "The vest absorbs up to {n} points per hit"),

    tpl("Ela vem ao se curar no hospital: o `/curar` dá **{n} minutos** de proteção.", "It comes from healing at the hospital: `/curar` gives **{n} minutes** of protection."),

    tpl("Você está protegido por **{t}**.", ({ t }, translate) => `You are protected for **${translate(t)}**.`),

    tpl("🔫 **{w}** está na sua mão.", "🔫 **{w}** is in your hand."),

    tpl("🔫 **{w}** está pronta.", "🔫 **{w}** is ready."),

    tpl("🔫 **{w}** voltou ao novo.", "🔫 **{w}** is good as new."),

    tpl("Ela já aparece no seu `/perfil`.", "It already shows on your `/perfil`."),

    tpl("O colete segura até {n} pontos por golpe", "The vest absorbs up to {n} points per hit"),

    tpl("Você comprou **{n}** munição.", "You bought **{n}** ammo."),

    tpl("Você comprou **{n}** munições.", "You bought **{n}** ammo."),

    tpl("Cada duelo e cada roubo bem-sucedido gasta **{n}** munição. Para ter mais, use `/municao`.", "Each duel and each successful robbery uses **{n}** ammo. To get more, use `/municao`."),

    // ---------- crime e prisão ----------
    tpl("⏰ **Próximo crime em:** {t}", "⏰ **Next crime in:** {t}"),

    tpl("Você ainda cumpre pena por **{t}**.", "You are still serving time for **{t}**."),

    tpl("Não é possível iniciar uma lavagem na cadeia. Faltam **{t}**.", "You can't start a laundering while in prison. **{t}** left."),

    tpl("{n} pessoa com ficha criminal.", "{n} person with a criminal record."),

    tpl("{n} pessoas com ficha criminal.", "{n} people with a criminal record."),

    tpl("**{n}.** {name} — {n2} registro", "**{n}.** {name} — {n2} record"),

    tpl("**{n}.** {name} — {n2} registros", "**{n}.** {name} — {n2} records"),

    tpl("**{n}.** {name} — {n2} registro ⛓️ preso", "**{n}.** {name} — {n2} record ⛓️ in prison"),

    tpl("**{n}.** {name} — {n2} registros ⛓️ preso", "**{n}.** {name} — {n2} records ⛓️ in prison"),

    tpl("Página {n} de {n2} · {n3} por página", "Page {n} of {n2} · {n3} per page"),

    tpl("Diga quem você quer roubar: `/roubar alvo:<nome>` ou mencione a pessoa.", "Say who you want to rob: `/roubar alvo:<name>` or mention the person."),

    tpl("Não encontrei ninguém com **{q}** neste servidor.", "I couldn't find anyone matching **{q}** in this server."),

    tpl("Tente o nome de exibição ou o @usuário, ou mencione a pessoa.", "Try the display name or the @username, or mention the person."),

    // ---------- lavagem ----------
    tpl("💸 {u} sua lavagem terminou! **+{m}** já estão na sua carteira.", "💸 {u}, your laundering is done! **+{m}** is already in your wallet."),

    tpl("Cada lavagem aceita de **{m}** a **{m2}** em dinheiro sujo.", "Each laundering accepts from **{m}** to **{m2}** in dirty money."),

    tpl("🔒 Exige {n} gemas, uma única vez: `/lavagem valor:desbloquear`", "🔒 Requires {n} gems, once only: `/lavagem valor:desbloquear`"),

    tpl("Liberar a lavanderia privada custa **{n} gemas** (uma única vez neste servidor).", "Unlocking the private laundromat costs **{n} gems** (once only in this server)."),

    tpl("Use `/lavagem valor:<reais> tipo:<publica|privada>`: de {a} a {b} por lavagem, {n} de energia.", "Use `/lavagem valor:<reais> tipo:<publica|privada>`: from {a} to {b} per laundering, {n} energy."),

    tpl("De {m} a {m2}", "From {m} to {m2}"),

    tpl("Você tem **{m}** em dinheiro sujo.", "You have **{m}** in dirty money."),

    tpl("Você pagou **{n} gemas** e agora pode usar a lavanderia privada neste servidor.", "You paid **{n} gems** and can now use the private laundromat in this server."),

    // ---------- gemas e números com unidade ----------
    tpl("+{n} gemas", "+{n} gems"),

    tpl("{n} gemas", "{n} gems"),

    tpl("+1 a cada {t}", ({ t }, translate) => `+1 every ${translate(t)}`),

    tpl("{n} vezes", "{n} times"),

    tpl("{n} de energia", "{n} energy"),

    tpl("{n}% a {n2}%", "{n}% to {n2}%"),

    // ---------- loja, inventário e bolsa ----------
    [/^(\d+) (?:item|itens)$/, m => `${m[1]} ${plural(m[1], "item")}`],

    [/^\*\*(\d+) (?:item|itens) diferentes?\*\*$/, m => `**${m[1]} different ${plural(m[1], "item")}**`],

    [/^(\d+) unidades?$/, m => `${m[1]} ${plural(m[1], "unit")}`],

    [/^(\d+) (?:item|itens) nesta prateleira\. Toque no número do item para comprar: os verdes cabem na sua carteira\.$/, m =>
        `${m[1]} ${plural(m[1], "item")} on this shelf. Tap the item number to buy: green ones fit your wallet.`],

    [/^(\d+) (?:item|itens) à venda$/, m => `${m[1]} ${plural(m[1], "item")} for sale`],

    tpl("página {n}/{n2}", "page {n}/{n2}"),

    tpl("Página {n}/{n2}", "Page {n}/{n2}"),

    tpl("✅ Você pode comprar até **{n}**", "✅ You can buy up to **{n}**"),

    tpl("você tem {n}/{n2}", "you have {n}/{n2}"),

    tpl("💵 venda {m}", "💵 sell for {m}"),

    tpl("venda {m}", "sell for {m}"),

    // o item em alta na bolsa: o preço leva o 🔥 e, na lista, a alta
    tpl("💵 venda {m} 🔥", "💵 sell for {m} 🔥"),

    tpl("venda {m} 🔥", "sell for {m} 🔥"),

    tpl("venda {m} 🔥 em alta (+{n}%)", "sell for {m} 🔥 trending (+{n}%)"),

    tpl("compra {m}", "buy for {m}"),

    tpl("🔒 Faltam **{m}**", "🔒 Missing **{m}**"),

    tpl("🔥 **Em alta:** +{n}% nesta venda", "🔥 **Trending:** +{n}% on this sale"),

    // ---------- bolsa (os preços variáveis) ----------
    tpl("{e} **{item}** paga **+{n}%** na venda.", "{e} **{item}** pays **+{n}%** on sale."),

    tpl("{n} de {n2} ({l})", "{n} of {n2} ({l:t})"),

    tpl("{n}% da tabela", "{n}% of list"),

    tpl("Agora: {m} (tabela {m2}).", "Now: {m} (list {m2})."),

    tpl("Atualiza a cada {n} minutos", "Updates every {n} minutes"),

    tpl("{e} Índice **{n}** ({l}) • preços em **{n2}%** da tabela", "{e} Index **{n}** ({l:t}) • prices at **{n2}%** of list"),

    tpl("Índice baixo deixa a loja mais barata, índice alto paga melhor na venda. O preço vai de {a}% a {b}% da tabela, e o item em alta soma o bônus só na venda. Cada servidor tem o seu mercado.",
        "A low index makes the shop cheaper, a high index pays better on sales. Prices range from {a}% to {b}% of list, and the trending item adds its bonus on sales only. Each server has its own market."),

    tpl("A partir de {m}", "From {m}"),

    tpl("a partir de {m}", "from {m}"),

    tpl("a partir de **{m}**", "from **{m}**"),

    tpl("Ex.: {a} ou {b}", "E.g.: {a} or {b}"),

    tpl("{e} **{item}** já está no seu inventário.", "{e} **{item}** is already in your inventory."),

    tpl("{e} **{item}** foi vendido.", "{e} **{item}** was sold."),

    tpl("Você pode armazenar no máximo {n} unidade(s) de {item}. Atualmente possui {n2}.", "You can store at most {n} unit(s) of {item}. You currently have {n2}."),

    tpl("Você possui apenas {n} unidade(s) de {item}.", "You only have {n} unit(s) of {item}."),

    // ---------- conquistas e títulos ----------
    tpl("🎉 **Novas conquistas desbloqueadas: {n}**", "🎉 **New achievements unlocked: {n}**"),

    tpl("Título: {t}", "Title: {t}"),

    [/^([▰▱]+) (\d+) (dias|vitórias|gemas) \/ (\d+) \3$/, m =>
        `${m[1]} ${m[2]} ${({ dias: "days", vitórias: "wins", gemas: "gems" })[m[3]]} / ${m[4]} ${({ dias: "days", vitórias: "wins", gemas: "gems" })[m[3]]}`],

    tpl("✅ Desbloqueadas ({n})", "✅ Unlocked ({n})"),

    tpl("🔒 Pendentes ({n})", "🔒 Pending ({n})"),

    // ---------- descartar ----------
    tpl("Você vai destruir **{n}× {item}**. Isso **não tem reembolso** e **não dá para desfazer**.", "You're about to destroy **{n}× {item}**. This has **no refund** and **can't be undone**."),

    tpl("Restam **{n}**.", "**{n}** left."),

    tpl("Você descartou **{n}× {item}**.", "You discarded **{n}× {item}**."),

    tpl("Você não possui {e} **{item}** para vender.", "You don't have {e} **{item}** to sell."),

    tpl("Você tem **{n}** de {item}.", "You have **{n}** of {item}."),

    tpl("Você não tem nenhum item chamado **{q}**. Use `/inventario` para ver o que tem.", "You don't have any item called **{q}**. Use `/inventario` to see what you have."),

    // ---------- crime ----------
    tpl("-{n} HP (restam {n2})", "-{n} HP ({n2} left)"),

    tpl("🎉 **Subiu para o nível {n}!**", "🎉 **Reached level {n}!**"),

    // ---------- empregos e níveis ----------
    tpl("**{j}** ainda está fora do seu alcance.", "**{j}** is still out of your reach."),

    tpl("📌 Você é **{j}**, nível **{n}**, e cada expediente rende **{m}**.", "📌 You are a **{j}**, level **{n}**, and each shift pays **{m}**."),

    tpl("📌 Você está sem emprego. Seu nível é **{n}**.", "📌 You have no job. Your level is **{n}**."),

    tpl("Você agora é **{j}**. O salário novo vale a partir do próximo `/trabalhar`.", "You are now a **{j}**. The new salary applies from your next `/trabalhar`."),

    tpl("Você agora é **{j}**. Use `/trabalhar` para o primeiro expediente.", "You are now a **{j}**. Use `/trabalhar` for your first shift."),

    [/^(\d+) (?:nível|níveis)$/, m => `${m[1]} ${plural(m[1], "level")}`],

    tpl("nível **{n}**", "level **{n}**"),

    tpl("nível {n}", "level {n}"),

    tpl("Nível {n}", "Level {n}"),

    tpl("{m} por expediente", "{m} per shift"),

    tpl("Dia de trabalho como **{j}** feito e pago.", "Day of work as **{j}** done and paid."),

    tpl("O próximo expediente abre em **{t}**.", "The next shift opens in **{t}**."),

    [/^em (\d[\dhms ]*)$/, m => `in ${m[1]}`],

    // ---------- inventário, loja e missões ----------
    tpl("**{n}** no total", "**{n}** in total"),

    tpl("{e} **{item}** ×{n}", "{e} **{item}** ×{n}"),

    tpl("Comprar: {item}", "Buy: {item}"),

    tpl("Quantidade ({m} cada)", "Quantity ({m} each)"),

    tpl("Resgatar: {mission}", "Claim: {mission:t}"),

    tpl("Você já recebeu a recompensa da missão **{mission}** neste período.", "You already received the reward for the **{mission:t}** mission in this period."),

    tpl("🎉 **{mission}** resgatada: **{a}** e **{b}**", "🎉 **{mission:t}** claimed: **{a}** and **{b}**"),

    tpl("🎁 **{n} recompensas prontas** para resgatar.", "🎁 **{n} rewards ready** to claim."),

    tpl("🎁 **{n} recompensa pronta** para resgatar.", "🎁 **{n} reward ready** to claim."),

    tpl("🎁 **{n}** recompensas prontas para resgatar", "🎁 **{n}** rewards ready to claim"),

    tpl("🎁 **{n}** recompensa pronta para resgatar", "🎁 **{n}** reward ready to claim"),

    // ---------- ranking ----------
    [/^(\S+) (\*\*)?(\d+) jogadores? classificados?( em todos os servidores)?(\*\*)?$/u, m =>
        `${m[1]} ${m[2] ?? ""}${m[3]} ${plural(m[3], "player")} ranked${m[4] ? " across all servers" : ""}${m[5] ?? ""}`],

    tpl("Sua posição global: #{n}", "Your global position: #{n}"),

    tpl("Sua posição: #{n}", "Your position: #{n}"),

    tpl("🏦 Extrato de {name}", "🏦 Statement for {name}"),

    tpl("✨ Título atual: {t}", "✨ Current title: {t}"),

    [/^(\d+) desbloqueados?$/, m => `${m[1]} unlocked`],

    // ---------- central de ajuda (/ajuda) ----------
    tpl("**Com prefixo:** {c}", "**With prefix:** {c}"),

    tpl("**De barra:** {c}", "**Slash command:** {c}"),

    tpl("Atalhos: {c}", "Shortcuts: {c}"),

    tpl("Valores: {v}", "Values: {v}"),

    // "`item` (obrigatória, texto): Item que deseja comprar": o tipo e a descrição também traduzem
    [/^`(\w+)` \((obrigatória|opcional), (.+?)\): ([\s\S]+)$/, (m, translate) =>
        `\`${m[1]}\` (${m[2] === "opcional" ? "optional" : "required"}, ${OPTION_TYPES[m[3]] ?? m[3]}): ${translate(m[4])}`],

    [/^(\d+) comandos?$/, m => `${m[1]} ${plural(m[1], "command")}`],

    tpl("💬 Dúvidas? Use `/ajuda comando:daily` ou entre no [servidor oficial]({url}).", "💬 Questions? Use `/ajuda comando:daily` or join the [official server]({url})."),

    tpl("📖 Resumo de cada sistema do jogo: [wiki]({url}).", "📖 A summary of each game system: [wiki]({url})."),

    tpl("Prefixo neste servidor: {c}", "Prefix in this server: {c}"),

    tpl("Toque em **Ver** para as opções e como usar.", "Tap **View** for the options and how to use it."),

    // ---------- usar item ----------
    tpl("⚡ **Energia** {bar} **{n}/{n2}**", "⚡ **Energy** {bar} **{n}/{n2}**"),

    tpl("✅ **{item}** usado: **+{n} de energia** ({n2}/{n3}). {n4} se perderam. Restam {n5}.", "✅ **{item}** used: **+{n} energy** ({n2}/{n3}). {n4} were wasted. {n5} left."),

    tpl("✅ **{item}** usado: **+{n} de energia** ({n2}/{n3}). Restam {n4}.", "✅ **{item}** used: **+{n} energy** ({n2}/{n3}). {n4} left."),

    tpl("Beber (+{n} de energia)", "Drink (+{n} energy)"),

    tpl("Comer (+{n} de energia)", "Eat (+{n} energy)"),

    tpl("Beber {item} (×{n})", "Drink {item} (×{n})"),

    tpl("Comer {item} (×{n})", "Eat {item} (×{n})"),

    tpl("Equipar {item}", "Equip {item}"),

    tpl("Escolha no menu para usar {n} unidade", "Pick from the menu to use {n} unit"),

    tpl("Você não tem nenhum item usável chamado **{q}**.", "You don't have any usable item called **{q}**."),

    tpl("✅ Você equipou {e} **{item}**.", "✅ You equipped {e} **{item}**."),

    tpl("Sua energia já está cheia ({n}/{n2}). O item não foi gasto.", "Your energy is already full ({n}/{n2}). The item wasn't spent."),

    tpl("Você pagou {u}.", "You paid {u}."),

    // ---------- recargas (/cooldowns): {emoji} **{conta}:** {valor}. O último, porque casa com muita coisa ----------
    tpl("{e} **{l}:** {v}", "{e} **{l:t}:** {v:t}")
]);
