# Linguagem Ubíqua: Cadastro de Clientes

> Parte do [conjunto de linguagem ubíqua](README.md). Os termos aqui valem para o contexto
> Customer Management, implementado nos módulos `customers` e `vehicles`.

## 1. Contexto

**Contexto delimitado:** Cadastro de Clientes (Customer Management)

**Descrição.** Cobre quem a oficina atende, o que ela registra sobre essa relação, e quais
veículos pertencem a quem. É o contexto que a recepção usa antes de qualquer OS existir.

**O que fica de fora.** A conta de login e a senha, que pertencem a Identidade e Acesso. Aqui o
cliente é a pessoa que a oficina atende, não a credencial com que ela entra no sistema.

**Responsáveis / envolvidos:**

- Consultor de serviços (recepção e balcão)
- Administrador (correção cadastral, desativação)
- Cliente (consulta e atualização do próprio cadastro)

## 2. Conceitos do domínio

| Termo               | Definição                                                                        | Exemplo                 | Observações                                                        |
| ------------------- | -------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| **Cliente**         | A pessoa ou empresa que a oficina atende, com os dados de contato do atendimento | Joana Pereira           | Uma conta de usuário vira cliente; nem toda conta é cliente        |
| **Documento**       | O CPF ou CNPJ que identifica o cliente no balcão                                 | `111.444.777-35`        | Validado por dígito verificador. Guardado só com os dígitos        |
| **Endereço**        | O endereço do cliente, tudo ou nada                                              | Av. Paulista, 1578, SP  | Ou vem completo, ou não vem. Só o complemento é opcional           |
| **Telefone**        | O contato do cliente, fixo ou celular                                            | `(11) 98765-4321`       | Guardado só com os dígitos, com DDD                                |
| **Veículo**         | O carro que o cliente traz, identificado pela placa                              | Corolla 2020, `RDX8B47` | Existe no sistema apenas como algo que um cliente traz             |
| **Placa**           | A identificação oficial do veículo                                               | `ABC1234` ou `ABC1D23`  | Aceita o formato antigo e o Mercosul, com ou sem separadores       |
| **Transferência**   | A mudança de dono de um veículo, de um cliente para outro                        | Joana vendeu o carro    | O veículo é o mesmo; o cadastro passa a apontar para outro cliente |
| **Cliente inativo** | Cliente desativado: não abre OS nova, mas o histórico permanece                  | -                       | Some da listagem, continua legível por identificador               |

### Cliente

**Definição.** A pessoa ou empresa que a oficina atende, com os dados que o atendimento precisa
guardar sobre essa relação.

**Características:**

- É sempre construído sobre uma conta de usuário, que traz nome, e-mail e documento
- Acrescenta o que é da oficina: endereço e telefone
- Uma conta de usuário tem no máximo um cadastro de cliente
- Ser desativado impede OS nova; as OS antigas continuam válidas e legíveis

**Relacionamentos:**

- Cliente é uma Conta de usuário com dados de oficina (contexto Identidade e Acesso)
- Cliente possui Veículos
- Cliente é referenciado por Ordens de serviço (contexto Ordem de Serviço)

**Exemplo:**

> "A Joana já é cliente? Procura pelo CPF."

### Veículo

**Definição.** O carro que um cliente traz à oficina, identificado pela placa.

**Características:**

- Pertence sempre a um cliente; não existe veículo sem dono no sistema
- A placa é única entre os veículos ativos
- Marca, modelo e ano podem ser corrigidos; a placa, não
- Pode ser transferido para outro cliente
- Ser removido é uma desativação: o registro permanece para as OS que o referenciam

**Relacionamentos:**

- Veículo pertence a um Cliente
- Veículo é referenciado por Ordens de serviço (contexto Ordem de Serviço)

**Exemplo:**

> "Cadastra o Corolla dela, placa RDX8B47, 2020."

## 3. Atores

| Ator              | Definição                   | Responsabilidade no domínio                          |
| ----------------- | --------------------------- | ---------------------------------------------------- |
| **Consultor**     | Quem atende no balcão       | Registra clientes e veículos, procura pelo documento |
| **Administrador** | Quem responde pela operação | Corrige cadastros, transfere veículos, desativa      |
| **Cliente**       | A pessoa atendida           | Consulta e atualiza o próprio endereço e telefone    |

## 4. Comandos

| Comando               | Ator                      | Definição                                                     | Resultado esperado                           |
| --------------------- | ------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| **Registrar cliente** | Consultor / Administrador | Transformar uma conta em cliente, ou criar as duas de uma vez | Cliente ativo, ligado a uma conta de usuário |
| **Atualizar cliente** | Consultor / Cliente       | Corrigir endereço ou telefone                                 | Dados alterados                              |
| **Desativar cliente** | Administrador             | Encerrar a relação, mantendo o histórico                      | Cliente inativo; não abre OS nova            |
| **Registrar veículo** | Consultor                 | Cadastrar o carro de um cliente ativo                         | Veículo ativo, ligado ao cliente             |
| **Atualizar veículo** | Consultor / Administrador | Corrigir marca, modelo ou ano, ou transferir o dono           | Dados alterados                              |
| **Remover veículo**   | Consultor / Administrador | Tirar o veículo do cadastro do cliente                        | Veículo inativo; a placa volta a ficar livre |

### Registrar cliente

**Intenção.** O consultor precisa de um cadastro de oficina para quem chegou ao balcão.

**Ator.** Consultor ou administrador.

**Pré-condições:**

- Ou uma conta existente é informada, ou os dados para criar uma; nunca os dois juntos
- Quando a conta já existe, ela precisa carregar o papel de cliente
- A conta ainda não tem cadastro de cliente
- O endereço, se informado, está completo

**Resultado:**

- Cliente ativo, ligado à conta
- Quando a conta é criada aqui, uma senha temporária é devolvida uma única vez
- Evento: Cliente registrado

**Observação.** As duas metades acontecem na mesma transação: se o cadastro de cliente falhar, a
conta criada junto não fica órfã.

## 5. Eventos de domínio

| Evento                 | Definição                                     | Quando ocorre        |
| ---------------------- | --------------------------------------------- | -------------------- |
| **Cliente registrado** | Uma pessoa passou a ser atendida pela oficina | Ao registrar cliente |
| **Cliente atualizado** | Endereço ou telefone mudaram                  | Ao atualizar cliente |
| **Cliente desativado** | A relação foi encerrada                       | Ao desativar cliente |
| **Veículo registrado** | Um carro entrou no cadastro de um cliente     | Ao registrar veículo |
| **Veículo atualizado** | Dados do carro ou o dono mudaram              | Ao atualizar veículo |
| **Veículo removido**   | Um carro saiu do cadastro                     | Ao remover veículo   |

## 6. Políticas e regras de negócio

| Regra                               | Descrição                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Documento é validado de verdade     | CPF e CNPJ passam pelo cálculo do dígito verificador, não só pelo tamanho        |
| Uma conta, um cliente               | Uma conta de usuário tem no máximo um cadastro de cliente ativo                  |
| Conta precisa do papel de cliente   | Registrar sobre uma conta existente exige que ela já carregue o papel `CUSTOMER` |
| Endereço é tudo ou nada             | Ou todos os campos vêm, ou nenhum. Só o complemento é opcional                   |
| UF é verificada contra a lista real | O estado precisa ser uma das 27 siglas brasileiras, não duas letras quaisquer    |
| Placa é única entre os ativos       | Dois veículos ativos não compartilham placa; um removido libera a sua            |
| Placa não muda                      | Corrigir a placa significa remover o veículo e cadastrar outro                   |
| Veículo pede cliente ativo          | Não se cadastra veículo para um cliente desativado                               |
| Cliente inativo não abre OS         | A restrição vale para OS nova; as antigas seguem válidas                         |

### Documento é validado de verdade

**Quando:** um documento é informado, em qualquer operação.

**Então:** os separadores são descartados, o comprimento define se é CPF ou CNPJ, e os dígitos
verificadores são recalculados e conferidos. Documento com todos os dígitos iguais é recusado.

**Exemplo:**

> "`111.444.777-35` é aceito. `111.444.777-00` tem o mesmo formato e é recusado: o dígito não
> fecha."

### Endereço é tudo ou nada

**Quando:** um endereço é informado no cadastro ou na atualização.

**Então:** logradouro, número, bairro, cidade, UF e CEP são todos obrigatórios. Só o complemento
pode faltar. Nenhum endereço parcial é gravado.

**Exemplo:**

> "Ela só sabe a rua e o número agora. Então deixa sem endereço e completa depois; meio endereço
> não entra."

## 7. Situações

| Situação    | Definição                                                      | Entra por   | Sai por     |
| ----------- | -------------------------------------------------------------- | ----------- | ----------- |
| **Ativo**   | Cliente ou veículo em uso normal                               | Registro    | Desativação |
| **Inativo** | Desativado: some das listagens, o registro e o histórico ficam | Desativação | Terminal    |

```text
Registrado
    │
    │ desativar
    ▼
  Inativo   (terminal: não há reativação por API)
```

## 8. Agregados

### Agregado: Cliente

**Responsabilidade.** Guardar a relação da oficina com quem ela atende, e garantir que uma conta
não vire dois clientes.

**Raiz.** Cliente.

**Comportamentos:** registrar, atualizar endereço e telefone, desativar.

**Invariantes:**

- Uma conta de usuário tem no máximo um cliente ativo
- O endereço, quando existe, está completo e com UF válida
- O telefone, quando existe, tem DDD e comprimento de fixo ou de celular

### Agregado: Veículo

**Responsabilidade.** Guardar o carro e a quem ele pertence.

**Raiz.** Veículo.

**Comportamentos:** registrar, atualizar dados, transferir dono, remover.

**Invariantes:**

- A placa é válida em um dos dois formatos brasileiros
- A placa é única entre os veículos ativos
- O ano está dentro de uma faixa plausível
- Todo veículo tem um dono

**Por que dois agregados.** Cliente e veículo mudam por razões diferentes e em momentos
diferentes: o endereço de alguém muda sem que o carro mude, e o carro é vendido sem que a pessoa
mude. Um agregado só forçaria carregar a lista inteira de veículos para corrigir um telefone.

## 9. Relações entre conceitos

```text
Conta de usuário   (contexto Identidade e Acesso)
    │
    └── é ──> Cliente
                │
                ├── possui ──> Veículo
                │                 │
                │                 └── é referenciado por ──> Ordem de serviço
                │
                └── é referenciado por ──> Ordem de serviço
```

| Origem           | Relação     | Destino          | Descrição                                                        |
| ---------------- | ----------- | ---------------- | ---------------------------------------------------------------- |
| Conta de usuário | é           | Cliente          | Um para no máximo um; a conta traz nome, e-mail e documento      |
| Cliente          | possui      | Veículo          | Um cliente tem zero ou mais veículos                             |
| Ordem de serviço | refere-se a | Cliente, Veículo | A OS guarda uma cópia congelada dos dados no momento da abertura |

## 10. Vocabulário de domínio × vocabulário técnico

| Domínio (negócio, pt-BR) | Técnico (código, en-US)                | Observação                                     |
| ------------------------ | -------------------------------------- | ---------------------------------------------- |
| Cliente                  | `Customer`, `/customers`               | -                                              |
| Documento (CPF/CNPJ)     | `PersonDocument`, `document`           | Guardado só com os dígitos                     |
| Endereço                 | `Address`, `address`                   | -                                              |
| UF                       | `state`                                | Duas letras, conferidas contra a lista das 27  |
| CEP                      | `zipCode`                              | Guardado só com os oito dígitos                |
| Telefone                 | `PhoneNumber`, `phoneNumber`           | Guardado só com os dígitos                     |
| Veículo                  | `Vehicle`, `/vehicles`                 | -                                              |
| Placa                    | `LicensePlate`, `plate`                | Normalizada em maiúsculas, sem separadores     |
| Transferir veículo       | `PATCH /vehicles/:id` com `customerId` | Não há rota própria; é a atualização do dono   |
| Desativar cliente        | `DeactivateCustomerCommand`, `DELETE`  | O verbo HTTP é `DELETE`; nada é apagado        |
| Remover veículo          | `RemoveVehicleCommand`, `DELETE`       | "Remover" no negócio, exclusão lógica no banco |
| Meu cadastro             | `GET /customers/me`                    | O cliente lendo o próprio registro             |

## 11. Termos rejeitados neste contexto

| Termo rejeitado        | Utilizar             | Motivo                                                      |
| ---------------------- | -------------------- | ----------------------------------------------------------- |
| Usuário (para cliente) | Cliente              | Usuário é a conta de login; cliente é quem a oficina atende |
| Proprietário           | Cliente              | Um só termo para quem traz o carro e quem paga a conta      |
| Carro                  | Veículo              | O cadastro aceita qualquer veículo, não só automóveis       |
| Excluir cliente        | Desativar cliente    | Nada é apagado; as OS antigas continuam apontando para ele  |
| Documento (arquivo)    | Documento (CPF/CNPJ) | Neste contexto, "documento" é sempre CPF ou CNPJ            |

## 12. Frases do domínio

> "Procura pelo CPF, ela já veio aqui ano passado."

> "É cliente novo. Cadastra a conta e o carro."

> "Vendeu o Golf para o irmão. Transfere o veículo."

> "Meio endereço não entra: ou completo, ou nenhum."

> "O cliente está inativo, não dá para abrir OS. O histórico continua lá."

## 13. Exemplo de fluxo

### Fluxo: primeiro atendimento

```text
AT: Cliente    | CMD: Criar conta          | EV: Conta registrada
AT: Consultor  | CMD: Registrar cliente    | EV: Cliente registrado    | POL: uma conta, um cliente
AT: Consultor  | CMD: Registrar veículo    | EV: Veículo registrado    | POL: placa única entre ativos
AT: Consultor  | CMD: Abrir OS             | EV: OS aberta             | POL: cliente inativo não abre OS
```

**Regras do fluxo:**

1. O cliente existe antes do veículo, e os dois antes da OS
2. A conta precisa carregar o papel de cliente para virar um cadastro
3. A OS copia os dados do cliente e do veículo, e não os consulta de novo depois
