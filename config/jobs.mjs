
export const JOBS = [
    ["entregador", "Entregador", 1, 150],
    ["atendente", "Atendente", 2, 180],
    ["faxineiro", "Faxineiro", 3, 220],
    ["garcom", "Garçom", 4, 270],
    ["motorista", "Motorista", 5, 320],
    ["cozinheiro", "Cozinheiro", 7, 400],
    ["seguranca", "Segurança", 9, 480],
    ["mecanico", "Mecânico", 11, 580],
    ["eletricista", "Eletricista", 13, 700],
    ["tecnico", "Técnico", 15, 850],
    ["programador", "Programador", 18, 1000],
    ["enfermeiro", "Enfermeiro", 21, 1200],
    ["contador", "Contador", 24, 1450],
    ["engenheiro", "Engenheiro", 27, 1750],
    ["advogado", "Advogado", 30, 2100],
    ["medico", "Médico", 34, 2500],
    ["arquiteto", "Arquiteto", 38, 3000],
    ["supervisor", "Supervisor", 42, 3600],
    ["gerente", "Gerente", 47, 4300],
    ["diretor", "Diretor", 53, 5200],
    ["executivo", "Executivo", 60, 6300],
    ["presidente", "Presidente", 70, 7800],
    ["magnata", "Magnata", 85, 10000]
].map(([id, name, level, salary]) => ({
    id,
    name,
    level,
    salary: salary * 100 // Armazenamento em centavos
}));

// O emprego de um id, ou null: quem acabou de chegar não tem emprego (job_id vazio) e escolhe o
// primeiro no /trabalhar ou no /empregos.
export function getJob(id) {
    return JOBS.find(job => job.id === id) ?? null;
}

export function getAvailableJobs(level) {
    return JOBS.filter(job => level >= job.level);
}