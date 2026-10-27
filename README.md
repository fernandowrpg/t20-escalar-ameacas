# Tormenta20 — Escalar Ameaças

Módulo para **Foundry VTT v13 e v14** e o sistema **[Tormenta20](https://gitlab.com/vizael/Tormenta20)** (testado com 1.5.015). Ele sobe ou desce o ND de uma ameaça (NPC) e ajusta toda a ficha com base nas regras de criação e modificação de ameaças de *Ameaças de Arton* (Tabela 2-3: Parâmetros de Criaturas e "Como Modificar Criaturas").

## Instalação

No Foundry: **Add-on Modules → Install Module** e cole a URL do manifesto:

```
https://github.com/fernandowrpg/t20-escalar-ameacas/releases/latest/download/module.json
```

## Como usar

- Abra a ficha de uma ameaça e clique em **Escalar Ameaça** no cabeçalho, **ou**
- clique com o botão direito na ameaça no diretório de Atores e escolha **Escalar Ameaça**.

A janela mostra o **ND atual** e o **ND de destino** (com patamar e papel), os parâmetros da tabela nos dois NDs e a **lista de tudo que vai mudar**. Depois você escolhe:

- **Aplicar nesta ficha**: altera a ficha atual.
- **Criar cópia**: cria um novo ator `Nome (ND X)` na mesma pasta e deixa o original intacto.

## O que é ajustado

| Item | Regra |
|---|---|
| **ND** | Atualizado. Pelo sistema, isso também muda ½ ND e o bônus de treino (ND 7 e 15) de todas as perícias. |
| **Defesa** | Mantém a diferença em relação à tabela do papel/ND (ex.: 1 acima do padrão continua 1 acima). |
| **Resistências** | Fort/Ref/Von ordenadas em forte/média/fraca; cada uma mantém sua diferença em relação à coluna correspondente. |
| **Pontos de Vida** | Proporcionais à tabela (PV da ficha × PV novo / PV antigo da tabela). |
| **PM** | Se houver, ±3 PM por ND. |
| **Ataque** | Luta/Pontaria mantêm a diferença em relação ao "Valor de Ataque". Todas as armas que usam a perícia acompanham. Bônus fixos por arma são preservados. |
| **Dano dos ataques** | Ajustado para o **dano médio da tabela** (ou proporcional, se preferir). O dano é distribuído entre os ataques conforme o peso atual de cada um (considerando quantidade, ex.: "duas garras"). O ataque secundário (ex.: à distância para um combatente corpo a corpo) usa a linha de 2 NDs abaixo, como manda a regra. Os dados crescem/encolhem e o bônus fixo é recalculado para bater a média exata, calculada como (mín + máx) / 2. |
| **CD de habilidades** | `system.attributes.cd` mantém a diferença da tabela. Todos os poderes do NPC usam essa CD. |
| **Dano de habilidades** | Rolagens de dano de poderes são escaladas na proporção do dano médio da tabela. Magias seguem as próprias regras e não são alteradas. |
| **Textos** | Descrições de poderes e a linha "Corpo a Corpo/À Distância": CDs, testes de manobra (`teste +22`), fórmulas de dano, rolagens inline (`[[/r 2d6+10]]`) e "CD X para extrair" (15 + ND) do tesouro. |
| **Patamar** | Se o patamar mudar, a janela avisa para adicionar ou remover habilidades (1–2 por patamar, 2–3 para especiais). |

Atributos, deslocamento e equipamento não mudam, como recomenda a regra.

## API

```js
const api = game.modules.get("t20-escalar-ameacas").api;
api.open(actor);                                   // abre a janela
await api.scaleActor(actor, "8", { copy: true });  // escala direto, criando uma cópia
const plan = api.planFor(actor, { targetND: "10", role: "solo", damageMode: "table" });
```

## Desenvolvimento

```
npm test
```

Cada commit na branch `main` roda os testes e publica automaticamente uma release (`v1.0.<n>`) com `module.json` e `module.zip`.

---
Projeto de fã, não oficial. Tormenta20 é marca da Jambô Editora. Este módulo contém apenas os parâmetros numéricos necessários para os cálculos. Para as regras completas, consulte os livros oficiais.
