# INVENTARIO-DADOS — Inventário de dados pessoais

Mantido pelo agente e actualizado em cada marco que introduza dados pessoais novos
(RF-PDP-10). Uma linha por campo com dados pessoais.

| Entidade | Campo | Finalidade | Quem acede | Retenção | Cifrado | Notas |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

> **Nota (M0):** o esquema do Anexo A já define entidades com campos de dados pessoais
> (AppUser, Candidate, etc.), mas em M0 nenhuma funcionalidade os recolhe ou trata —
> a migração cria apenas as tabelas. As linhas deste inventário são preenchidas nos
> marcos em que cada campo passa a ser efectivamente recolhido (M1: contas e papéis;
> M2: candidaturas e documentos).

## Regras aplicáveis

- R-01: nunca usar dados reais em desenvolvimento, testes, seeds ou prompts.
- R-09: nunca enviar à IA BI, NUIT, contactos, endereço ou fotografia.
- R-13: ficheiros carregados cifrados (AES-256-GCM) fora de pastas públicas.
- R-15: acessos a dados sensíveis geram registo de auditoria.
- M16 define os prazos de retenção e o expurgo.
