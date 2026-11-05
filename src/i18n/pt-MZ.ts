/**
 * Dicionário único da interface (A.2): todos os textos visíveis em português de
 * Moçambique, na norma ortográfica em uso corrente no país. Uma mudança de norma
 * tem de ser barata: nenhum texto visível fica fora deste ficheiro.
 */
export const pt = {
  app: {
    name: "CIMES",
    longName: "CIMES — Gestão de Estágios da Cornelder",
    organisation: "Cornelder de Moçambique, S.A.",
  },
  nav: {
    publico: "Vagas",
    entrar: "Entrar",
    registar: "Registar",
    candidato: "Portal do candidato",
    estagiario: "Portal do estagiário",
    app: "Back-office",
    verificacao: "Verificar documento",
  },
  home: {
    titulo: "Programa de Estágios",
    descricao:
      "Consulta as vagas abertas, candidata-te e acompanha o teu estágio na Cornelder de Moçambique.",
    semVagas: "Não há vagas publicadas neste momento.",
    verVagas: "Ver vagas abertas",
  },
  errors: {
    notFoundTitle: "Página não encontrada",
    notFoundDescription: "A página que procuras não existe ou não tens acesso a ela.",
    serverErrorTitle: "Ocorreu um erro",
    serverErrorDescription: "Ocorreu um erro. Tenta novamente ou contacta o ICT.",
    codigo: "Código",
    voltarInicio: "Voltar ao início",
  },
  health: {
    vivo: "Vivo",
    pronto: "Pronto",
    degradado: "Degradado",
  },
  placeholder: {
    emConstrucao: "Em construção — disponível num marco posterior.",
    acessoPendente: "Acesso pendente — contacte o RH.",
  },
} as const;