# Linguagem Ubíqua

Documento de referência da linguagem compartilhada entre negócio, produto, desenvolvimento, QA e
demais envolvidos no domínio da oficina.

> **Regra:** os termos definidos aqui devem ser utilizados de forma consistente no modelo de
> domínio, código, APIs, eventos, comandos, documentação e comunicação do time.

## Por que este conjunto está em português

Esta é a única parte de `docs/` escrita em português, e por um motivo que é o próprio assunto do
documento: a linguagem ubíqua é a ponte entre quem fala do negócio e quem escreve o código. O
negócio de oficina, no Brasil, fala português. O código, pelas razões descritas na
[convenção de linguagem do README](../../README.md#convenção-de-linguagem), está em inglês.

A tradução entre os dois é justamente o que precisa ficar registrada, e é a seção
**Vocabulário de domínio × vocabulário técnico** de cada documento. Escrever isto em inglês
esconderia metade do problema.

## Um documento por contexto delimitado

| Contexto                                        | O que delimita                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Identidade e Acesso](identidade-e-acesso.md)   | Quem existe como pessoa, como prova quem é, e o que pode fazer                          |
| [Cadastro de Clientes](cadastro-de-clientes.md) | Quem a oficina atende e quais veículos pertencem a quem                                 |
| [Catálogo de Serviços](catalogo-de-servicos.md) | O que a oficina vende como mão de obra, a que preço e em quanto tempo                   |
| [Estoque](estoque.md)                           | O que a oficina tem na prateleira e o histórico rastreável de cada unidade que se moveu |
| [Ordem de Serviço](ordem-de-servico.md)         | A vida de uma OS, da recepção à entrega ou ao cancelamento                              |

Contextos e módulos de código não são um para um. Identidade e Acesso ocupa três módulos
(`users`, `authentication`, `authorization`) e Cadastro de Clientes ocupa dois (`customers`,
`vehicles`). O mapeamento completo está no
[projeto de alto nível](../architecture/high-level-design.md).

## Termos ambíguos entre contextos

Termos cujo significado muda conforme o contexto. Nenhum deles é proibido; o que é proibido é usar
um deles sem dizer de qual contexto se está falando.

| Termo        | Em um contexto                                                       | Em outro contexto                                                                |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Serviço**  | Catálogo: o serviço vendável, com preço de tabela e duração estimada | Ordem de Serviço: o serviço solicitado numa OS, com o preço já congelado         |
| **Item**     | Estoque: uma peça ou insumo do catálogo                              | Ordem de Serviço: uma linha da OS, que pode ser de serviço ou de peça            |
| **Status**   | Estoque: a situação de um movimento (pendente, liquidado, baixado)   | Ordem de Serviço: o estágio da OS (recebida, em execução, entregue)              |
| **Usuário**  | Identidade: a conta que faz login                                    | Cadastro: o cliente, que é uma conta com dados de oficina                        |
| **Preço**    | Catálogo e Estoque: o preço de tabela, que muda quando se quer       | Ordem de Serviço: o preço orçado, congelado na geração e imutável desde então    |
| **Cancelar** | Ordem de Serviço: encerrar a OS sem entrega                          | Estoque: dar baixa definitiva no que saiu e não voltou (o termo correto é baixa) |

## Termos rejeitados em todos os contextos

| Termo rejeitado            | Utilizar                     | Motivo                                                                                                               |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Orçamento (para o total)   | Total orçado / Total cobrado | "Orçamento" é a rodada inteira, não o número. Os dois totais são grandezas diferentes.                               |
| Deletar / Apagar / Excluir | Desativar / Remover          | Nada é apagado. Toda exclusão é lógica e o registro permanece para a auditoria.                                      |
| Fechar OS                  | Finalizar / Entregar         | "Fechar" confunde dois estados distintos: o trabalho terminou, e o carro saiu.                                       |
| Baixa de estoque           | Retirada / Ajuste / Baixa    | Três operações diferentes com efeitos diferentes; ver [Estoque](estoque.md).                                         |
| Reserva de peça            | Planejamento de peça         | Planejar não segura unidade nenhuma. A peça só sai do estoque na retirada.                                           |
| Pedido / Ordem de compra   | Ordem de serviço             | Este sistema não compra nada de fornecedor. A OS é de serviço, não de compra.                                        |
| Login (como substantivo)   | Sessão                       | O que existe e dura é a sessão; o login é o ato que a cria.                                                          |
| Grupo de usuários          | Papel                        | Grupos foram removidos do modelo de acesso ([ADR 0011](../adr/0011-groups-removed-from-the-authorization-model.md)). |

## Decisões de linguagem

### 2026-08-30: "Cliente" é um agregado, "mecânico" não é

**Contexto.** Os quatro atores do negócio são cliente, consultor, mecânico e administrador. A
dúvida era se cada um vira um conceito próprio no modelo.

**Decisão.** Só Cliente vira agregado. Consultor, mecânico e administrador são papéis sobre uma
conta de usuário.

**Alternativas consideradas.** Um agregado por ator; um agregado genérico "Colaborador".

**Motivo.** Cliente carrega dado de oficina próprio (endereço, telefone) e um invariante próprio:
uma identidade por cliente. Os outros três não têm estado, comportamento nem invariante além do
acesso que possuem. Registrado na [ADR 0010](../adr/0010-no-aggregate-for-the-staff-profiles.md).

**Consequência na linguagem.** Uma OS aponta para um `customerId` e para um
`assignedMechanicUserId`. A assimetria nos nomes é intencional e reflete o que é modelado como
agregado e o que não é.

### 2026-08-31: "Rodada de orçamento", não "orçamento revisado"

**Contexto.** Quando o mecânico descobre trabalho extra durante a execução, o valor combinado
muda. O negócio dizia "refazer o orçamento".

**Decisão.** O termo é **rodada** (`round`), numerada em sequência. A rodada 1 nasce do
diagnóstico; cada trabalho extra abre a rodada seguinte.

**Alternativas consideradas.** "Orçamento revisado", "aditivo", "versão do orçamento".

**Motivo.** "Revisar" sugere substituir, e é o oposto do que acontece: a rodada aprovada continua
valendo e a nova cobre apenas o que foi acrescentado. Cada rodada guarda a própria decisão e o
próprio total. Registrado na [ADR 0018](../adr/0018-numbered-budget-rounds.md).

### 2026-09-01: "Total orçado" e "total cobrado" são termos distintos

**Contexto.** O negócio usava "valor da OS" para as duas coisas, e elas divergem sempre que uma
peça planejada não é usada.

**Decisão.** Dois termos, nunca intercambiáveis. **Total orçado** é o que o cliente aprovou.
**Total cobrado** é o que ele paga: serviços aprovados mais as peças efetivamente retiradas, ao
preço orçado, menos o desconto.

**Motivo.** Uma peça planejada e nunca retirada entra no total orçado e não entra no total
cobrado. Sem dois nomes, essa diferença vira discussão no balcão. Registrado na
[ADR 0020](../adr/0020-budget-total-and-charged-total-kept-apart.md).

### 2026-09-04: "Desativar", nunca "excluir"

**Contexto.** As rotas de remoção usam o verbo HTTP `DELETE`, o que levava o time a dizer "excluir
cliente".

**Decisão.** O termo de negócio é **desativar**. `DELETE` permanece como verbo HTTP porque é a
semântica REST correta para a intenção, mas nenhuma linha é apagada.

**Motivo.** O registro permanece por auditoria e pelo histórico das OS que o referenciam. O que
muda é o status, e os índices únicos parciais liberam o e-mail, a placa ou o SKU para reuso.

## Evolução da linguagem

| Data       | Alteração                                                     | Motivo                                                       | Impacto                                             |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| 2026-08-30 | "Grupo" removido do vocabulário de acesso                     | Roles já dão o agrupamento necessário para uma oficina única | Quatro tabelas e um agregado removidos              |
| 2026-08-31 | "Rodada de orçamento" substitui "orçamento revisado"          | Rodadas se somam, revisões substituem                        | `budgets` passou a ter a coluna `round`             |
| 2026-09-01 | "Total cobrado" separado de "total orçado"                    | As duas grandezas divergem por construção                    | Duas colunas distintas na OS                        |
| 2026-09-04 | "Item desativado" passa a ser um estado alcançável no Estoque | O catálogo precisava do mesmo ciclo que serviços já tinham   | Nova rota, novo evento, nova regra ao planejar peça |

## Checklist de consistência

Antes de considerar um novo termo parte da linguagem ubíqua:

- [ ] O termo é utilizado pelo negócio?
- [ ] O significado está claramente definido?
- [ ] Existe outro termo utilizado como sinônimo?
- [ ] O termo possui significado diferente em outro contexto delimitado?
- [ ] O termo está refletido no modelo de domínio?
- [ ] O termo está refletido no código?
- [ ] Comandos utilizam o termo correto?
- [ ] Eventos utilizam o termo correto?
- [ ] As políticas utilizam o termo correto?
- [ ] APIs e contratos utilizam o termo correto quando aplicável?
- [ ] Termos antigos ou ambíguos foram registrados como rejeitados?

## Regra geral

> **Se o negócio chama de X, o modelo deve chamar de X.**

A linguagem deve ser consistente ao longo de toda a cadeia:

```text
Negócio
   ↓
Event storming
   ↓
Modelo de domínio
   ↓
Comandos
   ↓
Eventos
   ↓
Políticas
   ↓
Código
   ↓
API
   ↓
Documentação
```

Qualquer divergência deve ser intencional e documentada. Neste projeto há uma divergência
sistemática e deliberada: o negócio fala português e o código fala inglês. A tabela de vocabulário
de cada contexto é o registro dessa tradução, e nenhuma outra é permitida.
