
import { fetchAccount } from "../platform/user-lookup.mjs";

// ==========================================
// DADOS QUE SÓ O PERFIL DA CONTA TEM
// ==========================================

// O membro de um servidor traz prismaActive e prismaPlan, mas o início da assinatura (prismaSince)
// pode vir vazio mesmo com a assinatura ativa. O perfil da conta (GET /users/:id) traz o mesmo dado em
// prisma.since. Aqui completa o usuário com ele, só quando falta: quem não assina Prisma não gasta
// chamada nenhuma, e se a API falhar o cartão segue com o que já tem (a data aparece como não
// informada).

// Milissegundos a partir de um número (já em ms) ou de uma data em texto; null se não for uma data.
function toMillis(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const at = typeof value === "number" ? value : Date.parse(String(value));

    return Number.isFinite(at) && at > 0 ? at : null;
}

export async function completeUser(user) {
    if (!user?.id || !user.prismaActive || toMillis(user.prismaSince) !== null) {
        return user;
    }

    try {
        const account = await fetchAccount(user.id);

        const prisma = account?.prisma;

        const since = toMillis(prisma?.since);

        if (since === null) {
            // Só a estrutura (nomes e tipos dos campos), nunca valores de uma pessoa: para saber, pelo
            // log, o que a API devolveu quando a data não veio.
            const kind = value => value === null ? "null" : Array.isArray(value) ? "lista" : typeof value;

            console.warn(
                "[USERINFO] Prisma ativo sem data. Membro: prismaPlan=" + String(user.prismaPlan) +
                ", prismaSince=" + kind(user.prismaSince) + ". Conta: " +
                (account && typeof account === "object"
                    ? Object.keys(account).join(",") + "; prisma=" +
                      (prisma && typeof prisma === "object"
                          ? Object.entries(prisma).map(([key, value]) => key + ":" + kind(value)).join(",")
                          : kind(prisma))
                    : "sem resposta")
            );
        }

        const plan = ["prisma", "prisma_plus"].includes(prisma?.plan) ? prisma.plan : null;

        return {
            ...user,
            ...(since !== null ? { prismaSince: since } : {}),
            ...(!user.prismaPlan && plan ? { prismaPlan: plan } : {})
        };

    } catch (error) {
        console.warn("[USERINFO] Não consegui buscar o perfil da conta:", error.message);

        return user;
    }
}
