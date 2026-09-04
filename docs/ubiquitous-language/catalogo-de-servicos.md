# Linguagem Ubíqua: Catálogo de Serviços

> Parte do [conjunto de linguagem ubíqua](README.md). Os termos aqui valem para o contexto
> Workshop Catalog, implementado no módulo `services`.

## 1. Contexto

**Contexto delimitado:** Catálogo de Serviços (Workshop Catalog)

**Descrição.** Cobre o que a oficina vende como mão de obra: quais serviços existem, a que preço
de tabela e em quanto tempo estimado. É o menor contexto do sistema, e o mais estável.

**O que fica de fora.** O serviço executado numa OS, que é outro conceito e pertence a Ordem de
Serviço. Aqui está o item de tabela; lá está a linha de uma visita concreta. Também fica de fora
o tempo real de execução, que é medido pelas métricas da OS, não prometido aqui.

**Responsáveis / envolvidos:**

- Administrador (define o catálogo e os preços)
- Consultor de serviços (consulta ao montar a OS)
- Mecânico (consulta)

## 2. Conceitos do domínio

| Termo                   | Definição                                                               | Exemplo                  | Observações                                       |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| **Serviço de catálogo** | Um trabalho que a oficina vende, com preço de tabela e duração estimada | Troca de óleo, R$ 150,99 | É a tabela de preços, não o trabalho de uma OS    |
| **Preço de tabela**     | Quanto a oficina cobra por aquele serviço hoje                          | R$ 150,99                | Pode mudar; a mudança não afeta OS já orçadas     |
| **Duração estimada**    | Quanto tempo a oficina espera levar para executar o serviço             | 60 minutos               | É uma previsão de planejamento, nunca uma medição |
| **Serviço inativo**     | Serviço retirado do catálogo, cujo registro permanece                   | -                        | Some da listagem; não entra em OS nova            |

### Serviço de catálogo

**Definição.** Um trabalho que a oficina vende, com nome, preço de tabela e duração estimada.

**Características:**

- O nome é único entre os serviços ativos
- O preço é sempre em centavos inteiros de real
- A duração estimada é em minutos e serve ao planejamento, não à cobrança
- Alterar o preço afeta os próximos orçamentos, nunca os já gerados
- Ser desativado impede entrar em OS nova; as OS antigas continuam válidas

**Relacionamentos:**

- Serviço de catálogo é copiado por Serviço solicitado (contexto Ordem de Serviço)

**Exemplo:**

> "Coloca a troca de óleo na tabela por cento e cinquenta, uma hora de serviço."

## 3. Atores

| Ator              | Definição                         | Responsabilidade no domínio                     |
| ----------------- | --------------------------------- | ----------------------------------------------- |
| **Administrador** | Quem define o que a oficina vende | Cadastra, atualiza preço e duração, desativa    |
| **Consultor**     | Quem monta a OS                   | Consulta o catálogo para incluir serviços na OS |
| **Mecânico**      | Quem executa                      | Consulta o catálogo                             |

## 4. Comandos

| Comando               | Ator          | Definição                                      | Resultado esperado                          |
| --------------------- | ------------- | ---------------------------------------------- | ------------------------------------------- |
| **Cadastrar serviço** | Administrador | Colocar um trabalho na tabela                  | Serviço ativo, com preço e duração          |
| **Atualizar serviço** | Administrador | Corrigir nome, descrição, preço ou duração     | Dados alterados; OS já orçadas não mudam    |
| **Desativar serviço** | Administrador | Tirar o serviço da tabela, mantendo o registro | Serviço inativo; o nome volta a ficar livre |

### Atualizar serviço

**Intenção.** O administrador quer corrigir o preço ou a estimativa de um serviço.

**Ator.** Administrador.

**Pré-condições:**

- O serviço existe
- O nome novo, se houver, não colide com outro serviço ativo

**Resultado:**

- Os campos informados são alterados; os omitidos permanecem
- Evento: Serviço atualizado

**Observação.** A alteração não retroage. Um serviço já incluído numa OS carrega a cópia do preço
feita na inclusão, e essa cópia não muda nunca.

## 5. Eventos de domínio

| Evento                 | Definição                                 | Quando ocorre        |
| ---------------------- | ----------------------------------------- | -------------------- |
| **Serviço cadastrado** | Um trabalho entrou na tabela              | Ao cadastrar serviço |
| **Serviço atualizado** | Nome, descrição, preço ou duração mudaram | Ao atualizar serviço |
| **Serviço desativado** | Um trabalho saiu da tabela                | Ao desativar serviço |

## 6. Políticas e regras de negócio

| Regra                           | Descrição                                                              |
| ------------------------------- | ---------------------------------------------------------------------- |
| Nome único entre os ativos      | Dois serviços ativos não compartilham nome; um desativado libera o seu |
| Preço em centavos inteiros      | Nunca há centavo fracionado nem arredondamento                         |
| Duração é positiva              | A estimativa é de pelo menos um minuto                                 |
| A alteração não retroage        | Mudar o preço não altera nenhuma OS já orçada                          |
| Serviço inativo não entra em OS | Um serviço fora da tabela não é incluído em OS nova                    |

### A alteração não retroage

**Quando:** o preço de tabela de um serviço muda.

**Então:** o novo preço vale para as próximas inclusões em OS. Toda inclusão anterior manteve a
cópia do preço que valia naquele momento.

**Exemplo:**

> "Subiu a troca de óleo para R$ 180 hoje. A OS da Joana, orçada ontem, continua com R$ 150,99."

**Por que assim.** Um orçamento aprovado é um acordo. Se o preço de tabela pudesse mexer no valor
combinado, o cliente aprovaria um número e pagaria outro.

## 7. Situações

| Situação    | Definição                                           | Entra por   | Sai por     |
| ----------- | --------------------------------------------------- | ----------- | ----------- |
| **Ativo**   | Consta da tabela e pode entrar numa OS              | Cadastro    | Desativação |
| **Inativo** | Fora da tabela; o registro e o histórico permanecem | Desativação | Terminal    |

```text
Cadastrado
    │
    │ desativar
    ▼
  Inativo   (terminal: o nome fica livre para um serviço novo)
```

## 8. Agregado

### Agregado: Serviço de catálogo

**Responsabilidade.** Guardar o que a oficina vende e a que preço.

**Raiz.** Serviço de catálogo.

**Comportamentos:** cadastrar, atualizar, desativar.

**Invariantes:**

- O nome não é vazio e é único entre os ativos
- O preço é um valor não negativo em centavos inteiros
- A duração estimada é de pelo menos um minuto

**Nota sobre o tamanho.** É o agregado mais simples do sistema, e isso é adequado: um item de
tabela não tem ciclo de vida além de existir, mudar de preço e sair de linha. A complexidade do
domínio está no que acontece com ele dentro de uma OS, e essa complexidade pertence lá.

## 9. Relações entre conceitos

```text
Serviço de catálogo
    │
    └── é copiado por ──> Serviço solicitado   (contexto Ordem de Serviço)
                              │
                              └── pertence a ──> Ordem de serviço
```

| Origem             | Relação  | Destino             | Descrição                                                     |
| ------------------ | -------- | ------------------- | ------------------------------------------------------------- |
| Serviço solicitado | copia de | Serviço de catálogo | Copia nome e preço no momento da inclusão; a cópia nunca muda |
| Ordem de serviço   | consulta | Serviço de catálogo | Só para ler nome, preço e situação; nunca para escrever       |

## 10. Vocabulário de domínio × vocabulário técnico

| Domínio (negócio, pt-BR) | Técnico (código, en-US)                       | Observação                              |
| ------------------------ | --------------------------------------------- | --------------------------------------- |
| Serviço de catálogo      | `Service`, `/services`                        | -                                       |
| Preço de tabela          | `Money`, `priceCents`                         | Em centavos inteiros de real            |
| Duração estimada         | `ServiceDuration`, `estimatedDurationMinutes` | Em minutos                              |
| Nome do serviço          | `ServiceName`, `name`                         | Único entre os ativos                   |
| Desativar serviço        | `DeactivateServiceCommand`, `DELETE`          | O verbo HTTP é `DELETE`; nada é apagado |

## 11. Termos rejeitados neste contexto

| Termo rejeitado          | Utilizar                                  | Motivo                                                         |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------- |
| Produto                  | Serviço de catálogo                       | Produto sugere algo físico; o que está aqui é mão de obra      |
| Serviço (sem qualificar) | Serviço de catálogo ou Serviço solicitado | Dois conceitos em contextos distintos                          |
| Tempo de execução        | Duração estimada                          | O tempo real é medido pelas métricas da OS, não prometido aqui |
| Excluir serviço          | Desativar serviço                         | Nada é apagado; as OS antigas continuam apontando para ele     |

## 12. Frases do domínio

> "Coloca o alinhamento na tabela por cento e vinte."

> "Subiu o preço da troca de óleo. As OS já orçadas continuam no valor antigo."

> "Esse serviço a gente não faz mais. Desativa, mas não some com o histórico."

> "A duração é estimada, para eu montar a agenda. O tempo real quem mede é o relatório."

## 13. Exemplo de fluxo

### Fluxo: do cadastro ao uso numa OS

```text
AT: Administrador | CMD: Cadastrar serviço        | EV: Serviço cadastrado   | POL: nome único entre ativos
AT: Consultor     | CMD: Incluir serviço na OS    | EV: Serviço incluído na OS
                    (contexto Ordem de Serviço)   | O preço é copiado agora  | POL: a cópia não muda mais
AT: Administrador | CMD: Atualizar serviço        | EV: Serviço atualizado   | POL: a alteração não retroage
AT: Administrador | CMD: Desativar serviço        | EV: Serviço desativado   | POL: não entra em OS nova
```

**Regras do fluxo:**

1. O catálogo é lido pela OS, nunca escrito por ela
2. O preço vira uma cópia no instante da inclusão, e a cópia é o que vale dali em diante
3. Desativar não afeta nenhuma OS existente
