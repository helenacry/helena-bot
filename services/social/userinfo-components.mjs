
import { detailOptions } from "./userinfo-view.mjs";

// ==========================================
// MENUS DO /USERINFO
// ==========================================

// Dois menus embaixo do cartão, como no Zany (a VSync só tem menu de texto, sem seletor de
// pessoas, então o segundo lista quem já joga neste servidor):
//
//   userinfo:more:<dono>:<alvo>    "Mais informações."  (avatar, insígnias, datas, Pulse)
//   userinfo:other:<dono>          "Ver informações de outros membros no servidor."
//   userinfo:buscar:<dono>         formulário da opção "Procurar por @usuário..."
//
// "dono" é quem usou o comando: só ele mexe nos menus (services/panels/userinfo-panel.mjs).

export const SEARCH_VALUE = "buscar";

const MAX_MEMBERS = 24;

const clip = (text, max) => {
    const value = String(text ?? "");

    return value.length > max ? value.slice(0, max - 1) + "…" : value;
};

// members: [{ id, name, level }] (quem já joga neste servidor, vindo do banco).
export function userinfoComponents({ ownerId, user, members = [] }) {
    return [
        {
            type: "row",
            components: [{
                type: "select",
                customId: `userinfo:more:${ownerId}:${user.id}`,
                placeholder: "Mais informações.",
                minValues: 1,
                maxValues: 1,
                options: detailOptions(user)
            }]
        },

        {
            type: "row",
            components: [{
                type: "select",
                customId: `userinfo:other:${ownerId}`,
                placeholder: "Ver informações de outros membros no servidor.",
                minValues: 1,
                maxValues: 1,

                options: [
                    {
                        label: "Procurar por @usuário...",
                        value: SEARCH_VALUE,
                        description: "Digite o @usuário ou a menção de quem você quer ver",
                        emoji: "🔎"
                    },

                    ...members
                        .filter(member => String(member.id) !== String(user.id))
                        .slice(0, MAX_MEMBERS)
                        .map(member => ({
                            label: clip(member.name, 100),
                            value: String(member.id),
                            description: `Nível ${member.level}`
                        }))
                ]
            }]
        }
    ];
}
