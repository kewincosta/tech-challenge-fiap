# Linguagem Ubíqua: Identidade e Acesso

> Parte do [conjunto de linguagem ubíqua](README.md). Os termos aqui valem para o contexto
> Identity & Access, implementado nos módulos `users`, `authentication` e `authorization`.

## 1. Contexto

**Contexto delimitado:** Identidade e Acesso (Identity & Access)

**Descrição.** Cobre quem existe como pessoa no sistema, como essa pessoa prova ser quem diz, e o
que ela pode fazer. É o contexto de suporte de todos os outros: nenhum deles decide permissão por
conta própria.

**O que fica de fora.** Os dados de oficina do cliente (endereço, telefone), que pertencem a
Cadastro de Clientes. Aqui a pessoa é uma credencial e um conjunto de permissões, não alguém que
traz um carro.

**Responsáveis / envolvidos:**

- Administrador (contas de equipe, papéis)
- Super administrador (o dono do modelo de acesso)
- Toda pessoa que faz login

## 2. Conceitos do domínio

| Termo                  | Definição                                                                        | Exemplo                     | Observações                                              |
| ---------------------- | -------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| **Conta de usuário**   | O registro de uma pessoa que pode entrar no sistema                              | `joana@exemplo.com`         | Nome, e-mail, documento e senha. Nada de oficina         |
| **Sessão**             | Um login ativo: a permissão para usar o sistema, com hora de início e de fim     | Sessão da Joana no celular  | O que existe e dura; o login é o ato que a cria          |
| **Token de acesso**    | A credencial curta que acompanha cada requisição                                 | JWT de 15 minutos           | Não é consultado no banco. Vale até expirar              |
| **Token de renovação** | A credencial longa que troca um par de tokens por outro                          | UUID de 7 dias              | De uso único. Cada renovação invalida o anterior         |
| **Rotação**            | A troca do token de renovação a cada uso                                         | -                           | O anterior morre no instante em que o novo nasce         |
| **Reuso detectado**    | A apresentação de um token de renovação já usado, tratada como indício de roubo  | -                           | Derruba todas as sessões da conta                        |
| **Revogação**          | O encerramento de uma sessão antes do prazo                                      | Logout, troca de senha      | Consultada a cada requisição                             |
| **Permissão**          | Uma autorização atômica para fazer uma coisa                                     | `work-orders:manage`        | Nunca dada direto à pessoa; sempre por um papel          |
| **Papel**              | Um conjunto nomeado de permissões, atribuível a pessoas                          | `MECHANIC`                  | O negócio chama de perfil ou função                      |
| **Acesso efetivo**     | O conjunto de papéis e permissões que uma conta realmente tem agora              | 6 permissões via `MECHANIC` | Calculado e mantido em cache                             |
| **Senha temporária**   | A senha gerada pelo sistema ao criar uma conta de equipe                         | `aB3dE5fG7h9K`              | Mostrada uma única vez. Bloqueia a conta até ser trocada |
| **Senha pendente**     | A situação de uma conta que precisa trocar a senha antes de fazer qualquer coisa | -                           | Só a rota de troca de senha responde                     |

### Conta de usuário

**Definição.** O registro de uma pessoa que pode entrar no sistema, com o que é preciso para
identificá-la e autenticá-la.

**Características:**

- E-mail e documento são únicos entre as contas ativas
- A senha é guardada só como hash, nunca em texto
- Ser desativada derruba as sessões e some das listagens; o registro permanece
- Uma conta não é um cliente: ela pode virar um, se receber o papel de cliente

**Relacionamentos:**

- Conta de usuário possui Sessões
- Conta de usuário recebe Papéis
- Conta de usuário pode ser um Cliente (contexto Cadastro de Clientes)

### Papel

**Definição.** Um conjunto nomeado de permissões, atribuível a contas.

**Características:**

- Cinco papéis de sistema vêm com o schema e não podem ser apagados
- Permissão nunca é dada direto a uma pessoa; sempre por um papel
- Só o super administrador pode conceder o papel de administrador

**Os cinco papéis:**

| Papel             | Quem é                                         |
| ----------------- | ---------------------------------------------- |
| `SUPER_ADMIN`     | O dono do modelo de acesso, criado fora da API |
| `ADMIN`           | Administração da operação                      |
| `SERVICE_ADVISOR` | Consultor de serviços, o balcão                |
| `MECHANIC`        | Mecânico da oficina                            |
| `CUSTOMER`        | Cliente da oficina                             |

## 3. Atores

| Ator                       | Definição                               | Responsabilidade no domínio                                           |
| -------------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| **Super administrador**    | O dono do modelo de acesso              | Único que concede o papel de administrador                            |
| **Administrador**          | Quem responde pela operação             | Cria contas de equipe, atribui e revoga papéis, desativa contas       |
| **Qualquer pessoa logada** | Quem tem uma conta                      | Entra, sai, troca a própria senha, lista e revoga as próprias sessões |
| **Sistema**                | O que a aplicação faz por conta própria | Rotaciona tokens, detecta reuso, derruba sessões, mantém o cache      |

## 4. Comandos

| Comando                         | Ator                 | Definição                                       | Resultado esperado                                    |
| ------------------------------- | -------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| **Criar conta**                 | Qualquer pessoa      | Registrar-se no sistema                         | Conta ativa com o papel de cliente                    |
| **Criar conta de equipe**       | Administrador        | Abrir acesso para alguém da oficina             | Conta com senha temporária, bloqueada até a troca     |
| **Entrar**                      | Qualquer conta       | Provar identidade e obter acesso                | Sessão criada, par de tokens emitido                  |
| **Renovar**                     | Qualquer conta       | Trocar o par de tokens antes de expirar         | Par novo; o token de renovação anterior morre         |
| **Sair**                        | Qualquer conta       | Encerrar o acesso                               | Todas as sessões da conta revogadas                   |
| **Revogar sessão**              | Dono / Administrador | Derrubar uma sessão específica                  | Sessão revogada; o token de acesso dela para de valer |
| **Trocar senha**                | Qualquer conta       | Definir uma senha nova                          | Senha trocada, todas as sessões revogadas             |
| **Atualizar conta**             | Dono / Administrador | Corrigir nome, e-mail ou documento              | Dados alterados                                       |
| **Desativar conta**             | Administrador        | Encerrar o acesso de alguém                     | Conta inativa, sessões derrubadas                     |
| **Criar papel**                 | Administrador        | Definir um conjunto de permissões               | Papel disponível para atribuição                      |
| **Definir permissões do papel** | Administrador        | Substituir o conjunto de permissões de um papel | Papel com o novo conjunto; o cache é invalidado       |
| **Atribuir papel**              | Administrador        | Dar a alguém o acesso de um papel               | Papel atribuído; o cache é invalidado                 |
| **Revogar papel**               | Administrador        | Tirar de alguém o acesso de um papel            | Papel revogado; o cache é invalidado                  |

### Trocar senha

**Intenção.** A pessoa quer definir uma senha nova, seja por escolha, seja porque a temporária
expirou o propósito.

**Ator.** O dono da conta.

**Pré-condições:**

- A senha atual confere
- A senha nova atende ao comprimento mínimo

**Resultado:**

- O hash é substituído
- A marca de senha pendente é removida, se havia
- **Todas** as sessões da conta são revogadas, inclusive a que fez a troca
- Evento: Todas as sessões revogadas

**Observação.** Derrubar também a sessão atual é deliberado: se a senha está sendo trocada porque
vazou, deixar uma sessão de pé preservaria justamente o acesso de quem não deveria ter.

## 5. Eventos de domínio

| Evento                             | Definição                                      | Quando ocorre                           |
| ---------------------------------- | ---------------------------------------------- | --------------------------------------- |
| **Conta registrada**               | Uma pessoa passou a existir no sistema         | Ao criar conta                          |
| **Sessão criada**                  | Alguém entrou                                  | Ao entrar                               |
| **Token de renovação rotacionado** | Um par de tokens foi trocado por outro         | Ao renovar                              |
| **Reuso de token detectado**       | Um token de renovação já usado foi apresentado | Ao renovar com um token morto           |
| **Sessão revogada**                | Uma sessão foi encerrada antes do prazo        | Ao sair, revogar ou trocar senha        |
| **Todas as sessões revogadas**     | Todo o acesso de uma conta foi encerrado       | Ao sair, trocar senha ou detectar reuso |
| **Papel atribuído**                | Uma conta ganhou o acesso de um papel          | Ao atribuir papel                       |
| **Papel revogado**                 | Uma conta perdeu o acesso de um papel          | Ao revogar papel                        |

### Reuso de token detectado

**Definição.** Um token de renovação que já foi trocado por outro voltou a ser apresentado.

**Quando ocorre.** Na renovação, quando o token entregue já consta como usado.

**Dados relevantes:**

- Conta envolvida
- Sessão a que o token pertencia
- Momento da detecção

**Por que importa.** Um token de renovação é de uso único. Se ele aparece duas vezes, ou o
atacante usou depois do dono, ou o dono usou depois do atacante. Nos dois casos há uma cópia
circulando, e a resposta é derrubar a sessão inteira em vez de tentar adivinhar qual das duas
chamadas era legítima.

## 6. Políticas e regras de negócio

| Regra                                          | Descrição                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| E-mail e documento são únicos                  | Entre as contas ativas; uma conta desativada libera os seus                 |
| Senha nunca é guardada em texto                | Só o hash Argon2id                                                          |
| Permissão vem sempre por papel                 | Nenhuma permissão é atribuída direto a uma conta                            |
| Só o super administrador concede administrador | Um administrador não pode ampliar o próprio acesso nem criar outro como ele |
| Papel de sistema não é apagável                | Os cinco papéis que vêm com o schema permanecem                             |
| Token de renovação é de uso único              | Cada renovação invalida o anterior                                          |
| Reuso derruba a sessão inteira                 | Não há tentativa de distinguir quem era o legítimo                          |
| Troca de senha derruba todas as sessões        | Inclusive a que fez a troca                                                 |
| Senha pendente bloqueia tudo                   | Uma conta nesse estado só alcança a rota de troca de senha                  |
| A guarda exige todas as permissões da rota     | Quando a regra é "um ou outro", ela vive no caso de uso, não na guarda      |

### Só o super administrador concede administrador

**Quando:** alguém tenta atribuir o papel de administrador a uma conta.

**Então:** a operação é recusada, a menos que quem atribui seja o super administrador. O papel de
super administrador não é atribuível por nenhuma rota.

**Exemplo:**

> "O administrador não consegue promover ninguém a administrador, nem a si mesmo. Isso é do super,
> que só existe pelo seed."

## 7. Situações

### Situações da conta

| Situação    | Definição                               | Entra por   | Sai por     |
| ----------- | --------------------------------------- | ----------- | ----------- |
| **Ativa**   | A conta pode entrar e usar o sistema    | Criação     | Desativação |
| **Inativa** | A conta não entra; o registro permanece | Desativação | Terminal    |

### Situações da sessão

| Situação     | Definição                             | Entra por                                           | Sai por                |
| ------------ | ------------------------------------- | --------------------------------------------------- | ---------------------- |
| **Ativa**    | O acesso vale                         | Entrada                                             | Revogação ou expiração |
| **Revogada** | O acesso foi encerrado antes do prazo | Sair, trocar senha, reuso, revogação administrativa | Terminal               |
| **Expirada** | O prazo absoluto acabou               | Passagem do tempo                                   | Terminal               |

```text
Entrar
   │
   ▼
 Ativa ──────────────────► Expirada  (terminal, pelo prazo absoluto)
   │
   │ sair, trocar senha, reuso detectado, revogação administrativa
   ▼
Revogada  (terminal)
```

**Motivos de revogação registrados:** saída (`LOGOUT`), saída de todas as sessões (`LOGOUT_ALL`),
reuso de token (`TOKEN_REUSE`) e revogação administrativa (`ADMIN_REVOCATION`).

## 8. Agregados

### Agregado: Conta de usuário

**Responsabilidade.** Guardar quem existe e o que autentica essa pessoa.

**Raiz.** Conta de usuário.

**Invariantes:** e-mail e documento válidos e únicos entre os ativos; senha guardada só como hash;
nome dentro do comprimento permitido.

### Agregado: Sessão

**Responsabilidade.** Guardar um acesso ativo e a cadeia de tokens de renovação que o sustenta.

**Raiz.** Sessão. **Entidade interna:** Token de renovação.

**Invariantes:** um token de renovação vale uma vez; a sessão respeita o prazo absoluto; toda
revogação registra o motivo.

### Agregado: Papel

**Responsabilidade.** Guardar um conjunto nomeado de permissões.

**Raiz.** Papel.

**Invariantes:** o nome é único; um papel de sistema não é apagável; toda permissão do conjunto
existe no catálogo.

**Por que a permissão não é um agregado.** O catálogo de permissões é uma lista fixa, criada por
migration junto com o schema. Ele é lido, nunca escrito por API.

## 9. Relações entre conceitos

```text
Conta de usuário
    │
    ├── possui ──> Sessão ──> possui ──> Token de renovação
    │
    ├── recebe ──> Papel ──> agrupa ──> Permissão
    │
    ├── resolve em ──> Acesso efetivo   (papéis + permissões, em cache)
    │
    └── pode ser ──> Cliente            (contexto Cadastro de Clientes)
```

| Origem           | Relação | Destino            | Descrição                                                    |
| ---------------- | ------- | ------------------ | ------------------------------------------------------------ |
| Conta de usuário | possui  | Sessão             | Zero ou mais sessões ativas ao mesmo tempo                   |
| Sessão           | possui  | Token de renovação | Uma cadeia; cada renovação mata o anterior e cria o seguinte |
| Conta de usuário | recebe  | Papel              | Zero ou mais papéis                                          |
| Papel            | agrupa  | Permissão          | O único caminho entre uma pessoa e uma permissão             |

## 10. Vocabulário de domínio × vocabulário técnico

| Domínio (negócio, pt-BR) | Técnico (código, en-US)            | Observação                                       |
| ------------------------ | ---------------------------------- | ------------------------------------------------ |
| Conta de usuário         | `User`, `/users`                   | -                                                |
| Sessão                   | `Session`, `/auth/sessions`        | Criar sessão é o login; apagar é o logout        |
| Token de acesso          | `accessToken`                      | JWT                                              |
| Token de renovação       | `RefreshToken`, `refreshToken`     | -                                                |
| Entrar / login           | `POST /auth/sessions`              | O negócio diz entrar; a rota cria uma sessão     |
| Sair / logout            | `DELETE /auth/sessions`            | Derruba todas as sessões, não só a atual         |
| Renovar                  | `POST /auth/tokens`                | Responde 201, porque cria um par novo            |
| Papel / perfil / função  | `Role`, `/roles`                   | Um só termo no código: papel                     |
| Permissão                | `Permission`, `/permissions`       | No formato `recurso:acao`                        |
| Acesso efetivo           | `EffectiveAccess`, `GET /users/me` | Papéis mais permissões, já resolvidos            |
| Senha temporária         | `temporaryPassword`                | Devolvida uma única vez, nunca registrada em log |
| Senha pendente           | `mustChangePassword`               | -                                                |
| Desativar conta          | `DeactivateUserCommand`, `DELETE`  | O verbo HTTP é `DELETE`; nada é apagado          |

## 11. Termos rejeitados neste contexto

| Termo rejeitado        | Utilizar                        | Motivo                                                                                                    |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Grupo de usuários      | Papel                           | Grupos foram removidos do modelo ([ADR 0011](../adr/0011-groups-removed-from-the-authorization-model.md)) |
| Login (substantivo)    | Sessão                          | O que dura é a sessão; o login é o ato                                                                    |
| Perfil                 | Papel                           | "Perfil" também significa dados cadastrais; papel não é ambíguo                                           |
| Token (sem qualificar) | Token de acesso ou de renovação | São duas coisas com prazos e usos diferentes                                                              |
| Bloquear usuário       | Desativar conta                 | Não há bloqueio temporário; a desativação é o que existe                                                  |
| Permissão do usuário   | Acesso efetivo                  | Permissão nunca é do usuário direto; vem sempre por um papel                                              |

## 12. Frases do domínio

> "Cria a conta dele como mecânico. Ele troca a senha no primeiro acesso."

> "Ela trocou a senha, então caiu de todos os aparelhos. É para ser assim."

> "Esse token de renovação já foi usado. Derruba a sessão inteira."

> "Só o super consegue promover alguém a administrador."

> "Ele tem seis permissões, todas vindas do papel de mecânico."

## 13. Exemplo de fluxo

### Fluxo: abrir acesso para alguém da equipe

```text
AT: Administrador | CMD: Criar conta de equipe  | EV: Conta registrada     | POL: senha temporária, uma vez só
AT: Administrador | CMD: Atribuir papel         | EV: Papel atribuído      | POL: só o super concede administrador
                                                | Cache de acesso invalidado
AT: Pessoa        | CMD: Entrar                 | EV: Sessão criada        | POL: senha pendente bloqueia tudo
AT: Pessoa        | CMD: Trocar senha           | EV: Todas as sessões revogadas
AT: Pessoa        | CMD: Entrar                 | EV: Sessão criada        | Agora com acesso pleno
```

**Regras do fluxo:**

1. A senha temporária aparece uma única vez, na resposta da criação, e nunca em log
2. Enquanto a senha está pendente, a única rota que responde é a de troca
3. A troca derruba tudo, inclusive a sessão que a fez, e exige entrar de novo
4. Toda mudança de papel invalida o cache de acesso na hora
