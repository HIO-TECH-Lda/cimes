# PERGUNTAS — Perguntas ao operador

Perguntas que bloqueiam uma decisão irreversível, afectam dados pessoais,
permissões, valores legais ou financeiros, ou contradizem a especificação (A.6).
Cada pergunta tem contexto, opções e recomendação. Estado: `aberta` ou `respondida`.

Os pressupostos `P-nn` vivem na Parte I da especificação e valem até o operador os
confirmar ou alterar; não são duplicados aqui.

| ID | Data | Pergunta | Opções | Recomendação | Estado | Resposta |
|---|---|---|---|---|---|---|
| Q-001 | 2026-11-05 | Existe Microsoft Entra ID na Cornelder (P-20)? | `entra` / `local` | `entra` | aberta | — |
| Q-002 | 2026-11-05 | Existe SQL Server 2019/2022 acessível para desenvolvimento? | instância existente / Docker local | instância existente com base vazia | aberta | — |
| Q-003 | 2026-11-05 | A versão do Node.js 26 LTS pode ser instalada na máquina de desenvolvimento? | sim / não (fixar 22 e registar ADR) | sim | respondida | 05/11/2026 — Operador optou por desenvolver localmente com Node v22.23.2 e correr o Node 26 LTS apenas no CI; `engines` fica `>=26 <27` (ADR-0001). Reavaliar antes de M9. |
| Q-004 | 2026-11-05 | Qual é o repositório GitHub remoto do projecto (P-33)? O `git remote` está vazio e o CI não pode correr sem ele. | criar repo no GitHub e indicar o URL / adiar o CI | criar repo privado e ligar o remoto no fim do M0 | aberta | — |
