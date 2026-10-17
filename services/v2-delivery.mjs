
import { toV2Data } from "../utils/components-v2.mjs";

import { isOwner } from "./developer.mjs";

// ==========================================
// ENTREGA COM COMPONENTES V2 (E VOLTA PARA O CLÁSSICO)
// ==========================================

// HELENA_V2 liga o layout V2 no lugar dos embeds:
//   off     (padrão) tudo como sempre
//   owner   só para as respostas do dono (para testar em produção sem mexer com os outros)
//   on      para todo mundo
//
// A doc da VSync não diz tudo sobre como o V2 convive com body, anexo, resposta privada
// e atualização de mensagem. Por isso o V2 nunca é a única chance: se a VSync recusar,
// a mesma resposta sai de novo, como embed, e o motivo vai para o log ("[V2] ...").

export function v2Mode(env = process.env) {
    const raw = String(env.HELENA_V2 ?? "").trim().toLowerCase();

    if (["on", "1", "true", "sim", "todos"].includes(raw)) return "on";

    if (["owner", "dono", "donos"].includes(raw)) return "owner";

    return "off";
}

export function v2Enabled(userId, env = process.env) {
    const mode = v2Mode(env);

    return mode === "on" || (mode === "owner" && isOwner(userId));
}

// A resposta em V2, ou null quando fica no clássico (V2 desligado, ou algo que o
// V2 não cobre: veja toV2Data).
export function v2Payload(data, userId, options) {
    return v2Enabled(userId) ? toV2Data(data, options) : null;
}

async function detailOf(response) {
    try {
        return (await response.text()).slice(0, 200);
    } catch {
        return "";
    }
}

// Resposta a uma interação (callback). payload = { type, data }; "post" envia e devolve
// a resposta HTTP. "skip" mantém o clássico (mensagens que o bot edita depois com
// embeds, como a contagem da prisão: misturar os dois formatos na mesma mensagem não
// é seguro). Interações que não respondem a tempo não aceitam uma segunda resposta, mas
// uma recusa (400) deixa a interação aberta, então o clássico ainda cabe.
export async function deliverCallback({ payload, userId, post, skip = false, log = console }) {
    const type = payload?.type;

    const v2 = !skip && (type === "message" || type === "update")
        ? v2Payload(payload.data, userId, { clear: type === "update" })
        : null;

    if (!v2) {
        return post(payload);
    }

    const response = await post({ ...payload, data: v2 });

    if (response.ok) {
        return response;
    }

    log.warn(`[V2] A VSync recusou o layout (HTTP ${response.status}: ${await detailOf(response)}); usei o clássico.`);

    return post(payload);
}

// Mensagem enviada ao canal (comandos pelo prefixo h). "send" lança erro se a VSync recusar.
export async function deliverMessage({ data, userId, send, skip = false, log = console }) {
    const v2 = skip ? null : v2Payload(data, userId);

    if (!v2) {
        return send(data);
    }

    try {
        return await send(v2);

    } catch (error) {
        log.warn(`[V2] A VSync recusou o layout (${String(error?.message ?? error).slice(0, 200)}); usei o clássico.`);

        return send(data);
    }
}
