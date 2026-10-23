
import { FAMILY_RULES } from "../../config/family.mjs";

import { formatMoney } from "../../database/economy.mjs";

import { createEmbed, HELENA_COLORS } from "../../utils/embed.mjs";

import {
    answerCall,
    expireCall,
    familyOf,
    getBirth,
    getCall,
    registerChildren
} from "../social/family.mjs";

import { openModal, readFields, textField } from "./modals.mjs";

import { button, row, update, warn } from "./panel-kit.mjs";

// ==========================================
// GOZOFONE E FAMÍLIA: TELAS E CLIQUES
// ==========================================

// A ligação é uma mensagem clássica (ela é editada depois, quando o tempo acaba), com três
// botões: Atender e Recusar são do cônjuge, Cancelar é de quem ligou.
//
//   gf:aceitar:<ligação>    atende
//   gf:recusar:<ligação>    recusa (a espera de quem ligou volta)
//   gf:cancelar:<ligação>   quem ligou desliga (a espera fica)
//   gf:nome:<nascimento>    abre o formulário para registrar o nome do filho (o dos pais)

const nowSeconds = () => Math.floor(Date.now() / 1000);

const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short"
});

const date = seconds => day.format(new Date(seconds * 1000));

const mention = id => `<@${id}>`;

// ==========================================
// A LIGAÇÃO
// ==========================================

export function inviteView(call) {
    return {
        embed: createEmbed({
            section: "Família",
            title: "📞 Gozofone tocando",

            description:
                `${mention(call.callerId)} está ligando para ${mention(call.partnerId)}.\n` +
                `> Atenda em até **${FAMILY_RULES.callTtl} segundos**!`,

            color: HELENA_COLORS.love,
            mood: "amor",

            footer: "Só o cônjuge atende; quem ligou pode cancelar",

            timestamp: false
        }),

        components: [row(
            button(`gf:aceitar:${call.id}`, "Atender", "📞", "success"),
            button(`gf:recusar:${call.id}`, "Recusar", "❌", "danger"),
            button(`gf:cancelar:${call.id}`, "Cancelar", "✖️", "secondary")
        )]
    };
}

// O que aparece quando a ligação termina (cada desfecho do serviço).
export function resultView(call, outcome) {
    const caller = mention(call.callerId);
    const partner = mention(call.partnerId);

    const make = (title, description, color, components = [], mood = "amor") => ({
        embed: createEmbed({ section: "Família", title, description, color, mood, footer: "/familia mostra a família", timestamp: false }),
        components
    });

    switch (outcome.kind) {
        case "child":
            return make(
                "🍼 Chegou um bebê!",

                `${partner} atendeu e a ligação rendeu ${outcome.babies === 2 ? "**gêmeos**" : "**um bebê**"}!\n` +
                `> Em até **${Math.round(FAMILY_RULES.nameWindow / 60)} minutos**, ${caller} ou ${partner} ` +
                `toca em **Registrar filho** para escolher ${outcome.babies === 2 ? "os nomes" : "o nome"}. ` +
                "Sem o registro, o bebê não entra para a família.",

                HELENA_COLORS.love,

                [row(button(`gf:nome:${outcome.birthId}`, "Registrar filho", "👶", "primary"))],

                "festa"
            );

        case "money":
            return make(
                "📞 Ligação atendida",

                `${partner} atendeu a ligação de ${caller}.\n` +
                (outcome.amount > 0
                    ? `> 💰 ${partner} recebeu **${formatMoney(outcome.amount)}**.`
                    : `A carteira de ${partner} está cheia, então nada foi pago desta vez.`),

                HELENA_COLORS.love,

                [],

                outcome.amount > 0 ? "dinheiro" : "amor"
            );

        case "declined":
            return make(
                "📞 Ligação recusada",
                `${partner} recusou a ligação. A espera de ${caller} foi devolvida.`,
                HELENA_COLORS.wait,
                [],
                "triste"
            );

        case "cancelled":
            return make(
                "📞 Ligação cancelada",
                `${caller} desligou antes de atenderem. A espera continua valendo.`,
                HELENA_COLORS.wait,
                [],
                "dormindo"
            );

        default:
            return make(
                "📞 Ninguém atendeu",
                `${partner} não atendeu a tempo. A espera de ${caller} foi devolvida.`,
                HELENA_COLORS.warning,
                [],
                "alerta"
            );
    }
}

// O relógio da ligação: quando o tempo acaba sem resposta, a mensagem vira "ninguém atendeu"
// (e a espera volta). Se alguém já respondeu, o próprio clique atualizou a mensagem e não há
// mais nada a fazer. Usado pela edição ao vivo (services/platform/live-embed.mjs).
export function callLive(callId) {
    return {
        key: `gozofone:${callId}`,

        // confere a cada 2 s e para logo depois do prazo (não precisa de 10 s nem de 14 min)
        intervalMs: 2_000,
        maxMs: (FAMILY_RULES.callTtl + 6) * 1000,

        render: () => {
            const expired = expireCall(callId);

            if (expired) {
                const view = resultView(expired, { kind: "expired" });

                return { payload: { embeds: [view.embed], components: [] }, done: true };
            }

            const call = getCall(callId);

            if (!call || call.status !== "pending") {
                return null;
            }

            const view = inviteView(call);

            return { payload: { embeds: [view.embed], components: view.components }, done: false };
        }
    };
}

// ==========================================
// REGISTRAR O FILHO
// ==========================================

function nameForm(birth) {
    const fields = birth.babies === 2
        ? [
            textField({ id: "nome1", label: "Nome do primeiro bebê", minLength: FAMILY_RULES.nameMin, maxLength: FAMILY_RULES.nameMax }),
            textField({ id: "nome2", label: "Nome do segundo bebê", minLength: FAMILY_RULES.nameMin, maxLength: FAMILY_RULES.nameMax })
        ]
        : [
            textField({ id: "nome1", label: "Nome do bebê", minLength: FAMILY_RULES.nameMin, maxLength: FAMILY_RULES.nameMax })
        ];

    return openModal({
        customId: `gf:nome:${birth.id}`,
        title: "Registrar filho",
        fields
    });
}

// ==========================================
// CLIQUES
// ==========================================

export function handleFamilyClick(interaction) {
    const [, action, id] = String(interaction.data?.customId ?? "").split(":");

    const userId = interaction.user?.id;

    if (action === "nome") {
        const birth = getBirth(id);

        if (!birth || birth.guild_id !== interaction.guildId) {
            return warn("Registro do filho", "Esse bebê não está mais esperando nome.");
        }

        if (String(userId) !== birth.parent_a && String(userId) !== birth.parent_b) {
            return warn("Registro do filho", "Só os pais podem registrar o filho.");
        }

        return nameForm(birth);
    }

    if (!["aceitar", "recusar", "cancelar"].includes(action)) {
        return null;
    }

    try {
        const { call, outcome } = answerCall({ id, userId, action });

        return update(resultView(call, outcome));

    } catch (error) {
        return warn("Gozofone", error.message);
    }
}

// O envio do formulário com o nome do filho (um nome por bebê).
export function handleFamilyModal(interaction) {
    const [, , id] = String(interaction.data?.customId ?? "").split(":");

    const fields = readFields(interaction);

    const names = [fields.nome1, fields.nome2].filter(value => value !== undefined);

    try {
        const registered = registerChildren({
            guildId: interaction.guildId,
            userId: interaction.user?.id,
            birthId: id,
            names
        });

        return {
            type: "message",

            data: {
                embeds: [createEmbed({
                    section: "Família",
                    title: registered.length === 2 ? "👶 Gêmeos registrados" : "👶 Filho registrado",

                    description:
                        `${mention(interaction.user?.id)} registrou ` +
                        (registered.length === 2
                            ? `os gêmeos **${registered[0]}** e **${registered[1]}**.`
                            : `o bebê com o nome **${registered[0]}**.`) +
                        "\nVeja a família com `/familia`.",

                    color: HELENA_COLORS.love,
                    mood: "festa",

                    footer: "A família cresceu",

                    timestamp: false
                })]
            }
        };

    } catch (error) {
        return warn("Registro do filho", error.message);
    }
}

// ==========================================
// A TELA DA FAMÍLIA (/familia)
// ==========================================

export function buildFamily({ guildId, userId, now = nowSeconds() }) {
    const family = familyOf(guildId, userId, now);

    if (!family) {
        return {
            embed: createEmbed({
                section: "Família",
                title: "👨‍👩‍👧 Família",
                description: "Você não está casado(a). Peça alguém em casamento com `/casar` para formar uma família.",
                color: HELENA_COLORS.wait,
                mood: "dormindo",
                footer: "O Gozofone só existe para casais",
                timestamp: false
            }),

            components: []
        };
    }

    const [a, b] = [family.a, family.b];

    const fields = [
        {
            name: "💞 Casal",
            value: `${mention(a)} e ${mention(b)}\nCasados desde ${date(family.marriedAt)}`,
            inline: false
        },
        {
            name: `👶 Filhos (${family.children.length}/${FAMILY_RULES.maxChildren})`,

            value: family.children.length
                ? family.children.map(child => `**${child.name}** · nasceu em ${date(child.born_at)}`).join("\n")
                : "Ainda não têm filhos. Tentem o `/gozofone`!",

            inline: false
        }
    ];

    const components = [];

    if (family.birth) {
        fields.push({
            name: "🍼 Esperando nome",

            value:
                `${family.birth.babies === 2 ? "Os gêmeos esperam" : "Um bebê espera"} um nome ` +
                `(até ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" }).format(new Date(family.birth.expires_at * 1000))}).`,

            inline: false
        });

        components.push(row(button(`gf:nome:${family.birth.id}`, "Registrar filho", "👶", "primary")));
    }

    return {
        embed: createEmbed({
            section: "Família",
            title: "👨‍👩‍👧 Família",
            color: HELENA_COLORS.love,
            mood: "amor",
            fields,
            footer: "/gozofone liga para o cônjuge",
            timestamp: false
        }),

        components
    };
}
