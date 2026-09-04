# Linguagem Ubíqua: Ordem de Serviço

> Parte do [conjunto de linguagem ubíqua](README.md). Os termos aqui valem para o contexto
> Workshop Operations, implementado no módulo `work-orders`.

## 1. Contexto

**Contexto delimitado:** Ordem de Serviço (Workshop Operations)

**Descrição.** Cobre a vida de uma visita do veículo à oficina, da recepção à entrega ou ao
cancelamento: o que foi pedido, o que foi diagnosticado, quanto custa, quem aprovou, quais peças
saíram da prateleira, o que foi cobrado e quem fez cada passo. É o contexto central do sistema;
os outros quatro existem para servi-lo.

**O que fica de fora.** Quem é o cliente e de quem é o veículo (Cadastro de Clientes), o preço de
tabela de um serviço (Catálogo de Serviços), a contagem do estoque (Estoque) e quem pode fazer o
quê (Identidade e Acesso). A OS guarda uma cópia congelada do que precisa desses contextos e não
os consulta de novo depois.

**Responsáveis / envolvidos:**

- Consultor de serviços (recepção e balcão)
- Mecânico (oficina)
- Administrador (gestão)
- Cliente (aprovação e acompanhamento)

## 2. Conceitos do domínio

| Termo                   | Definição                                                                                        | Exemplo                             | Observações                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------- |
| **Ordem de serviço**    | O registro de uma visita do veículo à oficina, do que foi feito e do que foi cobrado             | A OS do Corolla da Joana            | Abreviada como **OS**. Um veículo tem no máximo uma OS aberta  |
| **Número da OS**        | O identificador que o cliente recebe e usa para acompanhar                                       | `A1B090-2026`                       | Sorteado, não sequencial: não revela o volume da oficina       |
| **Serviço solicitado**  | Um serviço do catálogo incluído nesta OS, com o preço copiado no momento da inclusão             | Troca de óleo, R$ 150,99            | O preço não muda depois, mesmo que o catálogo mude             |
| **Peça planejada**      | Uma peça ou insumo que o mecânico prevê usar, com a quantidade prevista                          | 2 filtros de óleo                   | Planejar não tira nada do estoque                              |
| **Rodada de orçamento** | Um conjunto de itens quotados de uma vez, com um total e uma decisão do cliente                  | Rodada 1, R$ 320,00, aprovada       | Numeradas em sequência. A rodada 1 nasce do diagnóstico        |
| **Item rascunho**       | Um serviço ou peça já incluído na OS mas ainda não anexado a nenhuma rodada                      | Peça acrescentada durante o serviço | Não conta em nenhum total até ser orçado                       |
| **Total orçado**        | A soma dos itens de uma rodada, o valor que o cliente aprova                                     | R$ 320,00                           | Serviço conta uma vez; peça conta preço × quantidade planejada |
| **Total cobrado**       | O que o cliente paga: serviços aprovados mais peças retiradas, ao preço orçado, menos o desconto | R$ 285,00                           | Congelado na finalização. Diverge do orçado quando sobra peça  |
| **Desconto**            | Um abatimento sobre o total cobrado, com justificativa obrigatória                               | R$ 10,00, "cortesia por atraso"     | Nunca pode passar do total cobrado                             |
| **Retirada**            | O ato de tirar do estoque a peça planejada, na hora em que ela vai ser usada                     | Retirar os 2 filtros                | É aqui que o estoque baixa, não no planejamento                |
| **Devolução**           | O retorno ao estoque de uma peça retirada e não usada                                            | Devolver 1 filtro                   | Nunca pode passar do que foi retirado                          |
| **Mecânico designado**  | O mecânico responsável pela execução desta OS                                                    | Marcos                              | Pode ser trocado enquanto a OS não é entregue nem cancelada    |
| **Trilha**              | O registro cronológico e imutável de tudo que aconteceu com a OS                                 | 12 entradas, da abertura à entrega  | Gravada na mesma transação que muda a OS                       |

### Ordem de serviço

**Definição.** O registro de uma visita: qual veículo, de qual cliente, o que foi pedido, o que
foi diagnosticado, quanto custa, o que foi cobrado.

**Características:**

- Nasce em **Recebida**, sempre. Não há como criar uma OS já em outro estágio
- Carrega uma cópia congelada do nome do cliente e dos dados do veículo no momento da abertura
- Passa por estágios apenas como consequência de uma ação; nenhuma operação escreve um estágio
- Um veículo não pode ter duas OS abertas ao mesmo tempo

**Relacionamentos:**

- Ordem de serviço pertence a um Cliente
- Ordem de serviço refere-se a um Veículo
- Ordem de serviço possui Serviços solicitados e Peças planejadas
- Ordem de serviço possui Rodadas de orçamento
- Ordem de serviço gera Movimentos de estoque quando peças são retiradas

**Exemplo:**

> "Abre uma OS para o Corolla da Joana, ela vai deixar hoje."

### Rodada de orçamento

**Definição.** Um conjunto de itens quotados de uma vez, com um total e uma única decisão do
cliente sobre esse total.

**Características:**

- Numeradas em sequência a partir de 1
- A rodada 1 nasce da conclusão do diagnóstico e cobre tudo que foi levantado ali
- Uma rodada seguinte cobre apenas o trabalho extra descoberto durante a execução
- Cada rodada tem sua própria situação: pendente, aprovada ou rejeitada
- Uma rodada aprovada continua valendo quando uma rodada posterior é rejeitada

**Relacionamentos:**

- Rodada pertence a uma Ordem de serviço
- Rodada agrupa Serviços solicitados e Peças planejadas
- Rodada gera o evento Orçamento gerado e, na decisão, Orçamento aprovado ou Orçamento rejeitado

**Exemplo:**

> "Abriu o motor e achou mais coisa. Manda a rodada 2 para ela aprovar."

### Peça planejada

**Definição.** Uma peça ou insumo que o mecânico prevê usar nesta OS, com a quantidade prevista e
o preço copiado do estoque no momento do planejamento.

**Características:**

- Planejar **não** segura nem baixa unidade nenhuma do estoque
- Carrega duas quantidades: a **planejada** e a **retirada**, que começam diferentes
- Só entra no total cobrado a parte efetivamente retirada
- Item de catálogo desativado não pode ser planejado

**Exemplo:**

> "Planeja dois filtros na OS; a gente retira quando for montar."

## 3. Atores

| Ator                      | Definição                                                | Responsabilidade no domínio                                                                 |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Consultor de serviços** | Quem atende no balcão e faz a ponte com o cliente        | Abre a OS, inclui serviços solicitados, designa o mecânico, entrega o veículo, cancela a OS |
| **Mecânico**              | Quem executa o trabalho na oficina                       | Inicia e conclui o diagnóstico, planeja peças, retira e devolve peças, finaliza a OS        |
| **Cliente**               | O dono do veículo                                        | Aprova ou rejeita a rodada de orçamento, acompanha as próprias OS                           |
| **Administrador**         | Quem responde pela operação                              | Aplica desconto, cancela OS em execução, lê métricas e trilhas                              |
| **Sistema**               | O que a aplicação faz por conta própria, sem ator humano | Sorteia o número da OS, soma o orçamento, aplica a transição de estágio, grava a trilha     |

## 4. Comandos

| Comando                             | Ator                               | Definição                                             | Resultado esperado                                             |
| ----------------------------------- | ---------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| **Abrir OS**                        | Consultor                          | Registrar a chegada de um veículo para atendimento    | OS criada em Recebida, com número próprio                      |
| **Iniciar diagnóstico**             | Mecânico                           | Começar a avaliar o que o veículo precisa             | OS passa a Em diagnóstico                                      |
| **Incluir serviço solicitado**      | Consultor / Mecânico               | Acrescentar um serviço do catálogo à OS               | Item de serviço rascunho, com o preço congelado                |
| **Planejar peça**                   | Mecânico                           | Prever o uso de uma peça, sem tirá-la do estoque      | Item de peça rascunho, com quantidade planejada                |
| **Remover item**                    | Consultor / Mecânico               | Tirar da OS um serviço ou peça ainda não orçado       | Item removido; item já orçado é recusado                       |
| **Designar mecânico**               | Consultor                          | Definir quem responde pela execução                   | Mecânico designado registrado na OS                            |
| **Concluir diagnóstico**            | Mecânico                           | Fechar a avaliação e gerar o orçamento                | Rodada 1 gerada, OS passa a Aguardando aprovação               |
| **Aprovar orçamento**               | Cliente / Consultor                | Autorizar o trabalho pelo valor apresentado           | Rodada aprovada, OS passa a Em execução                        |
| **Rejeitar orçamento**              | Cliente / Consultor                | Recusar o valor apresentado                           | Rodada rejeitada, OS volta ao estágio anterior                 |
| **Retirar peças**                   | Mecânico                           | Tirar do estoque as peças aprovadas, na hora de usar  | Estoque baixado, movimento gravado, quantidade retirada somada |
| **Devolver peças**                  | Mecânico                           | Repor no estoque o que foi retirado e não usado       | Estoque reposto, movimento de devolução gravado                |
| **Submeter orçamento complementar** | Mecânico                           | Quotar o trabalho extra descoberto durante a execução | Nova rodada gerada, OS volta a Aguardando aprovação            |
| **Finalizar OS**                    | Mecânico designado / Administrador | Declarar o trabalho terminado                         | Total cobrado congelado, OS passa a Finalizada                 |
| **Aplicar desconto**                | Administrador                      | Abater um valor do total cobrado, com justificativa   | Total cobrado reduzido, justificativa registrada               |
| **Entregar veículo**                | Consultor                          | Devolver o carro ao cliente                           | OS passa a Entregue, consumos de estoque liquidados            |
| **Cancelar OS**                     | Consultor / Administrador          | Encerrar a OS sem entrega, com motivo                 | OS passa a Cancelada, peças já retiradas são baixadas          |

### Concluir diagnóstico

**Intenção.** O mecânico terminou de avaliar o veículo e quer apresentar o custo ao cliente.

**Ator.** Mecânico.

**Pré-condições:**

- A OS está Em diagnóstico
- Existe pelo menos um item na OS, seja serviço ou peça

**Resultado:**

- A rodada 1 é gerada, somando todos os itens rascunho
- O preço de cada item é congelado na rodada
- A OS passa a Aguardando aprovação
- Eventos: Diagnóstico concluído, Orçamento gerado, Orçamento enviado

**Observação.** O sistema soma; nenhuma parte do comando aceita um total. É a garantia de que o
orçamento é gerado automaticamente a partir dos serviços e das peças.

### Retirar peças

**Intenção.** O mecânico vai montar e precisa das peças em mãos.

**Ator.** Mecânico.

**Pré-condições:**

- A OS está Em execução
- Cada peça do lote pertence a uma rodada aprovada
- A quantidade pedida não passa do que falta retirar daquela peça
- Há saldo suficiente no estoque
- Nenhuma peça aparece duas vezes no mesmo lote

**Resultado:**

- O estoque baixa a quantidade de cada peça
- Um movimento de consumo pendente é gravado para cada peça
- A quantidade retirada da peça na OS é somada
- Evento: Peça retirada

**Observação.** O lote inteiro é validado antes de qualquer baixa. Se uma linha falhar, nenhuma
peça sai. As três escritas acontecem na mesma transação.

## 5. Eventos de domínio

| Evento                            | Definição                                           | Quando ocorre                                      |
| --------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| **OS aberta**                     | Uma visita foi registrada                           | Na abertura da OS                                  |
| **Diagnóstico iniciado**          | A avaliação do veículo começou                      | Ao iniciar o diagnóstico                           |
| **Serviço incluído na OS**        | Um serviço do catálogo entrou na OS                 | Ao incluir serviço solicitado                      |
| **Peça planejada para a OS**      | O uso de uma peça foi previsto                      | Ao planejar peça                                   |
| **Item removido da OS**           | Um serviço ou peça saiu da OS antes de ser orçado   | Ao remover item                                    |
| **Mecânico designado**            | A responsabilidade pela execução foi atribuída      | Ao designar mecânico                               |
| **Diagnóstico concluído**         | A avaliação terminou                                | Ao concluir o diagnóstico                          |
| **Orçamento gerado**              | Uma rodada foi somada e fechada                     | Ao concluir o diagnóstico ou submeter complementar |
| **Orçamento enviado**             | A rodada ficou disponível para a decisão do cliente | Junto com Orçamento gerado                         |
| **Orçamento aprovado**            | O cliente autorizou o trabalho pelo valor da rodada | Ao aprovar orçamento                               |
| **Orçamento rejeitado**           | O cliente recusou o valor da rodada                 | Ao rejeitar orçamento                              |
| **Orçamento complementar gerado** | Trabalho extra foi quotado numa rodada nova         | Ao submeter orçamento complementar                 |
| **Execução iniciada**             | O trabalho autorizado começou                       | Na primeira aprovação de orçamento                 |
| **Peça retirada**                 | Peças saíram do estoque para esta OS                | Ao retirar peças                                   |
| **Peça devolvida**                | Peças voltaram ao estoque                           | Ao devolver peças                                  |
| **Desconto aplicado**             | Um abatimento foi concedido sobre o total cobrado   | Ao aplicar desconto                                |
| **OS finalizada**                 | O trabalho terminou e o total cobrado foi congelado | Ao finalizar a OS                                  |
| **Veículo entregue**              | O carro voltou ao cliente                           | Ao entregar o veículo                              |
| **OS cancelada**                  | A OS foi encerrada sem entrega                      | Ao cancelar a OS                                   |

### Orçamento enviado

**Definição.** A rodada de orçamento ficou disponível para a decisão do cliente.

**Quando ocorre.** Sempre junto com Orçamento gerado, seja na conclusão do diagnóstico, seja na
submissão de um orçamento complementar.

**Dados relevantes:**

- Identificador da OS
- Ator que gerou a rodada
- Momento do envio

**Ressalva importante.** "Enviado" descreve que o orçamento passou a estar disponível ao cliente,
que o consulta pela API. Nenhum canal de saída parte daqui: não há e-mail, push nem webhook neste
sistema. Quando um canal for adicionado, ele consome este evento, que já é gravado.

## 6. Políticas e regras de negócio

| Regra                                   | Descrição                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Um veículo, uma OS aberta               | Um veículo não pode ter duas OS em andamento ao mesmo tempo                                 |
| Cliente inativo não abre OS             | Um cliente desativado não pode ter OS nova, embora as antigas sigam válidas                 |
| Diagnóstico não conclui vazio           | Concluir o diagnóstico exige pelo menos um item na OS                                       |
| O sistema soma, ninguém informa o total | Nenhum comando aceita um valor de orçamento; o total é somado dentro do agregado            |
| Preço orçado é congelado                | O preço de um item entra na rodada e não muda mais, ainda que o catálogo ou o estoque mudem |
| Item orçado não é removível             | Depois de anexado a uma rodada, o item permanece na OS                                      |
| Retirada não passa do planejado         | A soma das retiradas de uma peça nunca supera a quantidade planejada                        |
| Devolução não passa do retirado         | A soma das devoluções nunca supera o que foi retirado                                       |
| Só peça de rodada aprovada é retirável  | Uma peça rascunho ou de rodada rejeitada não sai do estoque                                 |
| Cobra-se o retirado, não o planejado    | Uma peça planejada e nunca retirada não entra no total cobrado                              |
| Desconto exige justificativa            | O desconto tem motivo obrigatório e nunca supera o total cobrado                            |
| Cancelamento em execução é elevado      | Cancelar uma OS que já retirou peças exige permissão própria                                |
| Entrega e cancelamento são terminais    | De Entregue ou Cancelada não se sai                                                         |
| A trilha é imutável                     | Nenhuma entrada da trilha é alterada ou apagada                                             |

### O sistema soma, ninguém informa o total

**Quando:** o diagnóstico é concluído ou um orçamento complementar é submetido.

**Então:** o total da rodada é calculado dentro da OS, somando o preço de cada serviço uma vez e o
preço de cada peça multiplicado pela quantidade planejada.

**Exemplo:**

> "Troca de óleo a R$ 150,99 mais dois filtros a R$ 45,00 dá R$ 240,99. Ninguém digitou esse
> número; ele é a soma dos itens."

### Cobra-se o retirado, não o planejado

**Quando:** a OS é finalizada.

**Então:** o total cobrado soma os serviços das rodadas aprovadas e, para cada peça, o preço
orçado multiplicado pela quantidade efetivamente retirada.

**Exemplo:**

> "Planejou dois filtros, usou um só e devolveu o outro. O orçamento dizia R$ 240,99; a nota sai
> com R$ 195,99."

## 7. Estágios da OS

| Estágio                  | Definição                                           | Entra por                                   | Sai por                                    |
| ------------------------ | --------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| **Recebida**             | O veículo chegou e a visita foi registrada          | Abrir OS                                    | Iniciar diagnóstico, Cancelar              |
| **Em diagnóstico**       | O mecânico está avaliando o que o veículo precisa   | Iniciar diagnóstico, Rejeitar a rodada 1    | Concluir diagnóstico, Cancelar             |
| **Aguardando aprovação** | O orçamento está com o cliente, esperando a decisão | Concluir diagnóstico, Submeter complementar | Aprovar, Rejeitar, Cancelar                |
| **Em execução**          | O trabalho autorizado está sendo feito              | Aprovar orçamento                           | Finalizar, Submeter complementar, Cancelar |
| **Finalizada**           | O trabalho terminou e o valor está fechado          | Finalizar OS                                | Entregar                                   |
| **Entregue**             | O carro voltou ao cliente. Estágio terminal         | Entregar veículo                            | -                                          |
| **Cancelada**            | A OS foi encerrada sem entrega. Estágio terminal    | Cancelar OS                                 | -                                          |

### Fluxo de estágios

```text
Recebida
   │
   │ iniciar diagnóstico
   ▼
Em diagnóstico ◄─────────────┐
   │                         │
   │ concluir diagnóstico    │ cliente rejeita a rodada 1
   ▼                         │
Aguardando aprovação ────────┘
   │        ▲
   │        │ submeter orçamento complementar
   │        │ (e o cliente rejeita a rodada seguinte:
   │        │  volta para Em execução, não para cá)
   │        │
   │ cliente aprova
   ▼        │
Em execução ┘
   │
   │ finalizar
   ▼
Finalizada
   │
   │ entregar
   ▼
Entregue  (terminal)

De Recebida, Em diagnóstico, Aguardando aprovação ou Em execução:
   │
   │ cancelar (em execução exige permissão elevada)
   ▼
Cancelada  (terminal)
```

**Detalhe que costuma confundir.** A rejeição não leva sempre ao mesmo lugar. Rejeitar a rodada 1
devolve a OS para Em diagnóstico, porque nada foi autorizado ainda. Rejeitar uma rodada posterior
devolve para Em execução, porque a rodada anterior continua aprovada e o trabalho dela segue
valendo.

## 8. Agregado

### Agregado: Ordem de serviço

**Responsabilidade.** Guardar tudo que uma visita produz e garantir que nenhuma transição, soma ou
retirada aconteça fora das regras.

**Raiz.** Ordem de serviço.

**Entidades internas.** Serviço solicitado, Peça planejada, Rodada de orçamento. Nenhuma existe
fora da OS que a criou, e nenhuma é endereçável por conta própria.

**Comportamentos:**

- Abrir, iniciar e concluir o diagnóstico
- Incluir e remover serviços solicitados e peças planejadas
- Gerar rodadas de orçamento e receber a decisão do cliente
- Registrar retiradas e devoluções de peça
- Finalizar, aplicar desconto, entregar, cancelar
- Designar o mecânico responsável

**Invariantes:**

- O estágio só muda pelas transições que o fluxo permite
- O total de uma rodada é sempre a soma dos itens que ela agrupa
- A quantidade retirada de uma peça nunca supera a planejada
- A quantidade devolvida nunca supera a retirada
- O desconto nunca supera o total cobrado
- Item já anexado a uma rodada não é removível
- Um veículo não tem duas OS abertas

**O que fica fora do agregado.** A contagem do estoque, que pertence ao Item de estoque. Retirar
peça é uma operação que atravessa os dois agregados na mesma transação: a OS registra a retirada,
o Estoque baixa a contagem, e se um lado falhar os dois falham.

## 9. Relações entre conceitos

```text
Ordem de serviço
    │
    ├── pertence a ──> Cliente          (contexto Cadastro de Clientes)
    ├── refere-se a ──> Veículo         (contexto Cadastro de Clientes)
    ├── designa ──> Mecânico            (papel, contexto Identidade e Acesso)
    │
    ├── possui ──> Serviço solicitado ──> copia de ──> Serviço de catálogo
    ├── possui ──> Peça planejada ──────> refere-se a ──> Item de estoque
    ├── possui ──> Rodada de orçamento ─> agrupa ──> Serviço solicitado e Peça planejada
    ├── possui ──> Trilha
    │
    └── gera ──> Movimento de estoque   (contexto Estoque, na retirada e na devolução)
```

| Origem              | Relação     | Destino              | Descrição                                                                     |
| ------------------- | ----------- | -------------------- | ----------------------------------------------------------------------------- |
| Ordem de serviço    | pertence a  | Cliente              | Guarda o identificador e uma cópia do nome no momento da abertura             |
| Ordem de serviço    | refere-se a | Veículo              | Guarda uma cópia de placa, marca, modelo e ano                                |
| Serviço solicitado  | copia de    | Serviço de catálogo  | Copia nome e preço; a cópia não muda quando o catálogo muda                   |
| Peça planejada      | refere-se a | Item de estoque      | Copia SKU, nome e preço; a contagem continua sendo do Estoque                 |
| Rodada de orçamento | agrupa      | Itens da OS          | Um item pertence a no máximo uma rodada                                       |
| Ordem de serviço    | gera        | Movimento de estoque | Um movimento de consumo por peça retirada, um de devolução por peça devolvida |

## 10. Vocabulário de domínio × vocabulário técnico

| Domínio (negócio, pt-BR) | Técnico (código, en-US)                                         | Observação                                                    |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------- |
| Ordem de serviço, OS     | `WorkOrder`, `/work-orders`                                     | -                                                             |
| Número da OS             | `WorkOrderNumber`, `number`                                     | Formato `AAAAAA-YYYY`                                         |
| Estágio                  | `WorkOrderStatus`, `status`                                     | O negócio diz estágio ou situação; o código diz status        |
| Recebida                 | `RECEIVED`                                                      | -                                                             |
| Em diagnóstico           | `IN_DIAGNOSIS`                                                  | -                                                             |
| Aguardando aprovação     | `AWAITING_APPROVAL`                                             | -                                                             |
| Em execução              | `IN_EXECUTION`                                                  | -                                                             |
| Finalizada               | `COMPLETED`                                                     | -                                                             |
| Entregue                 | `DELIVERED`                                                     | -                                                             |
| Cancelada                | `CANCELED`                                                      | -                                                             |
| Serviço solicitado       | `WorkOrderServiceItem`, `serviceItems`                          | -                                                             |
| Peça planejada           | `WorkOrderPartItem`, `partItems`                                | -                                                             |
| Quantidade planejada     | `plannedQuantity`                                               | -                                                             |
| Quantidade retirada      | `withdrawnQuantity`                                             | -                                                             |
| Rodada de orçamento      | `Budget`, `round`                                               | `Budget` é a rodada, não o total                              |
| Rodada pendente          | `BudgetStatus.Pending`                                          | -                                                             |
| Total orçado             | `Budget.totalCents`                                             | Em centavos inteiros                                          |
| Total cobrado            | `chargedTotalCents`                                             | Em centavos inteiros. Nulo antes da finalização               |
| Desconto                 | `discountCents`, `discountNote`                                 | -                                                             |
| Item rascunho            | `isDraft`, `budgetRound === null`                               | Não há coluna "rascunho": é o item sem rodada                 |
| Mecânico designado       | `assignedMechanicUserId`                                        | Aponta para a conta de usuário, não para um agregado Mecânico |
| Trilha                   | `work_order_events`, `GET /work-orders/:number/trail`           | -                                                             |
| Retirar peças            | `WithdrawPartsCommand`, `POST /work-orders/:number/withdrawals` | -                                                             |
| Devolver peças           | `ReturnPartsCommand`, `POST /work-orders/:number/returns`       | -                                                             |
| Finalizar                | `CompleteWorkOrderCommand`                                      | Não confundir com entregar                                    |
| Entregar                 | `DeliverVehicleCommand`                                         | -                                                             |

## 11. Frases do domínio

> "Abre uma OS para o Corolla da Joana."

> "A OS está aguardando aprovação, já mandei o orçamento para ela."

> "Rejeitou a rodada 1, então volta para diagnóstico e a gente refaz."

> "Achou mais coisa no motor. Submete um complementar."

> "Planejou dois filtros, retirou um. Cobra um."

> "O total orçado era R$ 320, o cobrado saiu R$ 285 porque sobrou peça."

> "Não dá para cancelar essa: já está em execução e saiu peça. Chama o administrador."

> "Finalizou ontem, mas o cliente só vem buscar amanhã. Ainda não está entregue."

## 12. Exemplo de fluxo

### Fluxo: da recepção à entrega

```text
AT: Consultor  | CMD: Abrir OS                  | EV: OS aberta                      | POL: um veículo, uma OS aberta
AT: Mecânico   | CMD: Iniciar diagnóstico       | EV: Diagnóstico iniciado
AT: Consultor  | CMD: Incluir serviço solicitado| EV: Serviço incluído na OS
AT: Mecânico   | CMD: Planejar peça             | EV: Peça planejada para a OS       | POL: planejar não move estoque
AT: Mecânico   | CMD: Concluir diagnóstico      | EV: Diagnóstico concluído,
                                                       Orçamento gerado,
                                                       Orçamento enviado            | POL: o sistema soma o total
AT: Cliente    | CMD: Aprovar orçamento         | EV: Orçamento aprovado,
                                                       Execução iniciada
AT: Mecânico   | CMD: Retirar peças             | EV: Peça retirada                  | POL: só peça de rodada aprovada
AT: Mecânico   | CMD: Devolver peças            | EV: Peça devolvida                 | POL: não passa do retirado
AT: Mecânico   | CMD: Finalizar OS              | EV: OS finalizada                  | POL: cobra-se o retirado
AT: Admin      | CMD: Aplicar desconto          | EV: Desconto aplicado              | POL: justificativa obrigatória
AT: Consultor  | CMD: Entregar veículo          | EV: Veículo entregue               | POL: liquida os consumos
```

**Regras do fluxo:**

1. Nenhum estágio é escrito diretamente; cada um é consequência do comando anterior
2. O orçamento só existe depois que há pelo menos um item na OS
3. A peça só sai do estoque entre a aprovação e a finalização, nunca antes
4. O valor que o cliente aprova e o valor que ele paga são grandezas distintas
5. Cada passo acima grava uma entrada na trilha, na mesma transação que muda a OS
