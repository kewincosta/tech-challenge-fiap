# Linguagem Ubíqua: Estoque

> Parte do [conjunto de linguagem ubíqua](README.md). Os termos aqui valem para o contexto
> Inventory, implementado no módulo `inventory`.

## 1. Contexto

**Contexto delimitado:** Estoque (Inventory)

**Descrição.** Cobre o que a oficina tem na prateleira, quanto resta de cada coisa, e o histórico
rastreável de toda unidade que entrou ou saiu. É o dono da contagem: nenhum outro contexto escreve
uma quantidade.

**O que fica de fora.** Compra de fornecedor, nota fiscal de entrada e custo médio. A reposição
registra que unidades chegaram, sem saber de onde nem por qual pedido.

**Responsáveis / envolvidos:**

- Administrador (cadastro do catálogo, reposição, ajuste)
- Mecânico (retirada e devolução, sempre por uma OS)
- Consultor de serviços (consulta de disponibilidade)

## 2. Conceitos do domínio

| Termo                  | Definição                                                                          | Exemplo                          | Observações                                                     |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| **Item de estoque**    | Uma peça ou insumo que a oficina mantém, com preço de tabela e contagem própria    | Filtro de óleo, SKU `FLT-OL-001` | O termo cobre os dois tipos; "peça" sozinho é mais estreito     |
| **Peça**               | Item que vai montado no veículo e é contado por unidade                            | Pastilha de freio                | Tipo `PART`                                                     |
| **Insumo**             | Item consumível usado no serviço, contado por unidade de medida                    | Óleo 5W30, estopa                | Tipo `SUPPLY`                                                   |
| **SKU**                | O código pelo qual a oficina identifica o item na prateleira                       | `PST-FR-001`                     | Único entre os itens ativos. Volta a ficar livre na desativação |
| **Quantidade em mãos** | Quanto existe fisicamente na prateleira agora                                      | 26 unidades                      | Nunca negativa. Só um movimento a altera                        |
| **Movimento**          | O registro de uma unidade que entrou ou saiu, e do porquê                          | Entrada de 30 filtros            | Somente-adição: nunca apagado, nunca reescrito                  |
| **Entrada**            | Movimento que sobe a contagem porque unidades chegaram                             | Recebimento da nota 4471         | Tipo `INBOUND`                                                  |
| **Consumo**            | Movimento que desce a contagem porque unidades foram para uma OS                   | 2 filtros para a OS A1B090       | Tipo `CONSUMPTION`. Nasce pendente                              |
| **Devolução**          | Movimento que sobe a contagem porque unidades voltaram de uma OS                   | 1 filtro devolvido               | Tipo `RETURN`. Aponta para o consumo que desfaz                 |
| **Ajuste**             | Movimento que desce a contagem por perda, avaria ou correção de inventário         | 4 unidades avariadas             | Tipo `ADJUSTMENT`. Justificativa obrigatória                    |
| **Consumo pendente**   | Consumo cuja OS ainda não terminou; a unidade saiu, mas o destino não está fechado | -                                | Situação `PENDING`                                              |
| **Consumo liquidado**  | Consumo de uma OS entregue: a unidade foi usada e o caso está encerrado            | -                                | Situação `SETTLED`                                              |
| **Consumo baixado**    | Consumo de uma OS cancelada: a unidade saiu e não volta                            | -                                | Situação `WRITTEN_OFF`                                          |
| **Falta**              | Situação em que a demanda das OS em execução passa do que há na prateleira         | Precisa de 8, tem 5              | Cálculo de leitura, não um estado guardado                      |
| **Item desativado**    | Item retirado do catálogo, cujo registro e histórico permanecem                    | -                                | Some da listagem, continua legível por identificador            |

### Item de estoque

**Definição.** Uma peça ou insumo que a oficina mantém, com um SKU, um preço de tabela e uma
contagem própria.

**Características:**

- Nasce com quantidade em mãos zero. Ter estoque exige uma entrada
- O preço de tabela pode ser alterado a qualquer momento e vale para os planejamentos seguintes
- A contagem nunca é escrita diretamente: só um movimento a altera
- A contagem nunca fica negativa; a tentativa é recusada, não truncada
- Ser desativado não zera nem esconde a contagem

**Relacionamentos:**

- Item de estoque possui Movimentos
- Item de estoque é referenciado por Peça planejada (contexto Ordem de Serviço)

**Exemplo:**

> "Cadastra o filtro no catálogo e dá entrada de trinta."

### Movimento

**Definição.** O registro de uma unidade que entrou ou saiu do estoque, com o motivo, o ator e o
momento.

**Características:**

- Quatro tipos: entrada, consumo, devolução e ajuste
- Somente-adição: nenhum movimento é apagado, e nenhum é reescrito além da situação do consumo
- Consumo e devolução carregam a OS que os causou; entrada e ajuste não
- Devolução aponta explicitamente para o consumo que desfaz

**Relacionamentos:**

- Movimento pertence a um Item de estoque
- Consumo e Devolução referem-se a uma Ordem de serviço
- Devolução desfaz um Consumo

**Exemplo:**

> "Olha o histórico do filtro: entrada de trinta, consumo de dois pela OS A1B090, devolução de um."

## 3. Atores

| Ator              | Definição                                 | Responsabilidade no domínio                               |
| ----------------- | ----------------------------------------- | --------------------------------------------------------- |
| **Administrador** | Quem responde pelo catálogo e pela compra | Cadastra e atualiza itens, dá entrada, ajusta, desativa   |
| **Mecânico**      | Quem executa o trabalho                   | Retira e devolve peças, sempre por uma OS                 |
| **Consultor**     | Quem atende o cliente                     | Consulta disponibilidade e faltas                         |
| **Sistema**       | O que a aplicação faz por conta própria   | Liquida os consumos na entrega e os baixa no cancelamento |

## 4. Comandos

| Comando                | Ator                      | Definição                                               | Resultado esperado                                    |
| ---------------------- | ------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| **Cadastrar item**     | Administrador             | Colocar uma peça ou insumo no catálogo                  | Item ativo, com quantidade em mãos zero               |
| **Atualizar item**     | Administrador             | Corrigir nome, descrição ou preço de tabela             | Dados alterados; a contagem não muda                  |
| **Dar entrada**        | Administrador             | Registrar a chegada de unidades                         | Contagem sobe, movimento de entrada gravado           |
| **Ajustar para baixo** | Administrador             | Registrar perda, avaria ou correção de inventário       | Contagem desce, movimento de ajuste com justificativa |
| **Desativar item**     | Administrador             | Tirar o item do catálogo, mantendo registro e histórico | Item inativo; recusado se uma OS aberta o planeja     |
| **Consumir lote**      | Sistema (por uma OS)      | Baixar as peças que uma OS retirou                      | Contagem desce, consumo pendente por peça             |
| **Restaurar lote**     | Sistema (por uma OS)      | Repor as peças que uma OS devolveu                      | Contagem sobe, devolução apontando para o consumo     |
| **Liquidar consumos**  | Sistema (na entrega)      | Encerrar os consumos pendentes de uma OS entregue       | Consumos passam a liquidados; a contagem não muda     |
| **Baixar consumos**    | Sistema (no cancelamento) | Encerrar como perda os consumos de uma OS cancelada     | Consumos passam a baixados; a contagem não muda       |

### Desativar item

**Intenção.** O administrador quer tirar do catálogo um item que a oficina deixou de trabalhar.

**Ator.** Administrador.

**Pré-condições:**

- O item existe
- Nenhuma OS que planejou este item está em aberto, isto é, que não foi entregue nem cancelada

**Resultado:**

- O item passa a inativo e some da listagem do catálogo
- O registro, a contagem e todo o histórico de movimentos permanecem
- O SKU volta a ficar disponível para um item novo
- Evento: Item desativado

**Observação.** Desativar não é apagar e não move a contagem: as unidades continuam na prateleira.
A partir daí, o item não pode mais ser planejado numa OS.

### Ajustar para baixo

**Intenção.** A contagem do sistema não bate com a prateleira, ou unidades se perderam.

**Ator.** Administrador.

**Pré-condições:**

- Há justificativa
- A quantidade a ajustar não passa da quantidade em mãos

**Resultado:**

- A contagem desce
- Um movimento de ajuste é gravado com a justificativa
- Evento: Estoque ajustado

## 5. Eventos de domínio

| Evento               | Definição                                     | Quando ocorre         |
| -------------------- | --------------------------------------------- | --------------------- |
| **Item cadastrado**  | Uma peça ou insumo entrou no catálogo         | Ao cadastrar item     |
| **Item atualizado**  | Nome, descrição ou preço de tabela mudaram    | Ao atualizar item     |
| **Item desativado**  | Um item saiu do catálogo, mantendo registro   | Ao desativar item     |
| **Estoque reposto**  | Unidades chegaram e a contagem subiu          | Ao dar entrada        |
| **Estoque ajustado** | Unidades saíram por perda, avaria ou correção | Ao ajustar para baixo |

## 6. Políticas e regras de negócio

| Regra                            | Descrição                                                           |
| -------------------------------- | ------------------------------------------------------------------- |
| Só movimento move a contagem     | Nenhuma operação escreve a quantidade em mãos diretamente           |
| A contagem nunca fica negativa   | A operação que a levaria abaixo de zero é recusada                  |
| SKU é único entre os ativos      | Dois itens ativos não compartilham SKU; um desativado libera o seu  |
| Ajuste exige justificativa       | Ao contrário da entrada, o ajuste tem motivo obrigatório            |
| O histórico é somente-adição     | Nenhum movimento é apagado; só a situação de um consumo evolui      |
| A baixa acontece na retirada     | O estoque desce quando a peça sai para a OS, não quando é planejada |
| Item planejado não é desativável | Enquanto uma OS aberta planeja o item, ele não sai do catálogo      |
| Item desativado não é planejável | Um item fora do catálogo não entra em OS nova                       |
| Lote é tudo ou nada              | Se uma linha do lote falha, nenhuma unidade se move                 |

### A baixa acontece na retirada

**Quando:** o mecânico retira uma peça planejada e aprovada.

**Então:** a contagem desce naquele momento e um consumo pendente é gravado.

**Exemplo:**

> "Planejou dois filtros ontem, mas eles continuaram na prateleira. Só saíram quando ele foi
> montar hoje de manhã."

**Por que assim.** Planejar não segura unidade. Se a contagem baixasse no planejamento, uma OS
aguardando aprovação por três dias tiraria peça do giro sem ter sido autorizada.

### Item planejado não é desativável

**Quando:** o administrador tenta desativar um item que alguma OS não entregue nem cancelada
planejou.

**Então:** a operação é recusada, e a recusa nomeia as OS que seguram o item.

**Exemplo:**

> "Não dá para tirar a pastilha do catálogo: a OS C7D410 ainda vai usar. Entrega ou cancela ela
> primeiro."

## 7. Situações do movimento

Só o consumo tem situação. Entrada, devolução e ajuste nascem e permanecem como fatos simples.

| Situação      | Definição                                                      | Entra por          | Sai por                       |
| ------------- | -------------------------------------------------------------- | ------------------ | ----------------------------- |
| **Pendente**  | A unidade saiu para uma OS que ainda não terminou              | Retirada de peça   | Entrega ou cancelamento da OS |
| **Liquidado** | A OS foi entregue: a unidade foi usada e o caso está encerrado | Entrega da OS      | Terminal                      |
| **Baixado**   | A OS foi cancelada: a unidade saiu e não volta                 | Cancelamento da OS | Terminal                      |

```text
Consumo gravado
       │
       ▼
   Pendente
    │     │
    │     │ OS entregue
    │     ▼
    │  Liquidado  (terminal)
    │
    │ OS cancelada, com saldo ainda em aberto
    ▼
  Baixado  (terminal)
```

Nem a liquidação nem a baixa mexem na quantidade em mãos: as unidades já saíram na retirada. O que
muda é o que o histórico diz sobre elas.

## 8. Agregado

### Agregado: Item de estoque

**Responsabilidade.** Ser a única fonte da contagem de uma peça ou insumo, e garantir que toda
alteração passe por um movimento registrado.

**Raiz.** Item de estoque.

**Entidade interna.** Movimento.

**Comportamentos:**

- Cadastrar, atualizar e desativar
- Repor, ajustar para baixo, consumir e restaurar unidades

**Invariantes:**

- A quantidade em mãos nunca é negativa
- Toda alteração de contagem tem um movimento correspondente
- Um ajuste tem justificativa
- SKU é único entre os itens ativos

**Detalhe de modelagem.** Ao ser carregado, o item não traz os movimentos anteriores: o histórico
completo é um modelo de leitura, não parte do agregado. O que o item carrega são os movimentos
criados nesta operação, que o repositório grava junto.

## 9. Relações entre conceitos

```text
Item de estoque
    │
    ├── possui ──> Movimento
    │                 │
    │                 ├── Entrada        (sobe a contagem)
    │                 ├── Consumo ───────> refere-se a ──> Ordem de serviço
    │                 ├── Devolução ─────> desfaz ──> Consumo
    │                 └── Ajuste         (desce a contagem)
    │
    └── é referenciado por ──> Peça planejada   (contexto Ordem de Serviço)
```

| Origem          | Relação     | Destino          | Descrição                                                     |
| --------------- | ----------- | ---------------- | ------------------------------------------------------------- |
| Item de estoque | possui      | Movimento        | Histórico somente-adição, em ordem cronológica                |
| Consumo         | refere-se a | Ordem de serviço | Guarda qual OS levou as unidades                              |
| Devolução       | desfaz      | Consumo          | Aponta para o consumo específico que está sendo revertido     |
| Peça planejada  | refere-se a | Item de estoque  | Copia SKU, nome e preço; a contagem continua sendo do Estoque |

## 10. Vocabulário de domínio × vocabulário técnico

| Domínio (negócio, pt-BR) | Técnico (código, en-US)                                             | Observação                                    |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------- |
| Item de estoque          | `InventoryItem`, `/inventory-items`                                 | -                                             |
| Peça                     | `InventoryItemKind.Part` (`PART`)                                   | -                                             |
| Insumo                   | `InventoryItemKind.Supply` (`SUPPLY`)                               | -                                             |
| SKU                      | `Sku`, `sku`                                                        | Termo em inglês já usado pelo negócio         |
| Quantidade em mãos       | `StockQuantity`, `quantityOnHand`                                   | -                                             |
| Movimento                | `StockMovement`, `GET /inventory-items/:id/movements`               | -                                             |
| Entrada                  | `StockMovementKind.Inbound` (`INBOUND`)                             | -                                             |
| Consumo                  | `StockMovementKind.Consumption`                                     | -                                             |
| Devolução                | `StockMovementKind.Return`                                          | -                                             |
| Ajuste                   | `StockMovementKind.Adjustment`                                      | -                                             |
| Pendente                 | `StockMovementStatus.Pending`                                       | -                                             |
| Liquidado                | `StockMovementStatus.Settled`                                       | -                                             |
| Baixado                  | `StockMovementStatus.WrittenOff`                                    | -                                             |
| Dar entrada              | `ReplenishStockCommand`, `POST /inventory-items/:id/replenishments` | O negócio diz "dar entrada" ou "repor"        |
| Ajustar para baixo       | `AdjustStockCommand`, `POST /inventory-items/:id/adjustments`       | -                                             |
| Falta                    | `StockShortage`, `GET /inventory-items/shortages`                   | Cálculo de leitura, sem coluna correspondente |
| Desativar item           | `DeactivateInventoryItemCommand`, `DELETE`                          | O verbo HTTP é `DELETE`; nada é apagado       |

## 11. Termos rejeitados neste contexto

| Termo rejeitado  | Utilizar                  | Motivo                                                                |
| ---------------- | ------------------------- | --------------------------------------------------------------------- |
| Reservar peça    | Planejar peça             | Planejar não segura unidade; a peça continua disponível para outra OS |
| Baixa (genérico) | Retirada, Ajuste ou Baixa | Três operações com efeitos distintos; "baixa" sozinho não diz qual    |
| Saldo            | Quantidade em mãos        | "Saldo" sugere um valor financeiro; aqui é contagem física            |
| Estornar         | Devolver                  | Estorno é vocabulário financeiro; aqui a unidade volta fisicamente    |
| Excluir item     | Desativar item            | Nada é apagado; o histórico precisa continuar legível                 |

## 12. Frases do domínio

> "Dá entrada de trinta filtros, chegou a nota."

> "Ajusta quatro para baixo, vieram avariados."

> "Esse item está em falta: as OS em execução pedem oito e a prateleira tem cinco."

> "A peça saiu do estoque quando ele foi montar, não quando planejou."

> "O consumo está pendente porque a OS ainda não foi entregue."

> "Cancelou a OS e a peça já tinha saído. Baixa como perda."

## 13. Exemplo de fluxo

### Fluxo: do recebimento à liquidação

```text
AT: Administrador | CMD: Cadastrar item     | EV: Item cadastrado    | POL: nasce com contagem zero
AT: Administrador | CMD: Dar entrada        | EV: Estoque reposto    | POL: só movimento move a contagem
AT: Mecânico      | CMD: Retirar peças (OS) | EV: Peça retirada      | POL: baixa acontece na retirada
                                            | Consumo pendente gravado
AT: Mecânico      | CMD: Devolver peças (OS)| EV: Peça devolvida     | POL: não passa do retirado
                                            | Devolução aponta para o consumo
AT: Consultor     | CMD: Entregar veículo   | EV: Veículo entregue
                    Sistema: liquidar consumos                       | POL: a contagem não muda
```

**Regras do fluxo:**

1. A contagem só se move nos passos de entrada, retirada, devolução e ajuste
2. Liquidação e baixa fecham o histórico sem tocar na contagem
3. Todo movimento registra quem o causou e quando
4. Nada do que foi gravado é apagado depois
