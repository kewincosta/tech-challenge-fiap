# Security Assessment Tool

Ferramenta interna de análise de vulnerabilidades deste projeto. Executa quatro scanners
reconhecidos, consolida os resultados num modelo único e gera um relatório pronto para anexar a um
trabalho acadêmico.

## Objetivo

Produzir uma análise de segurança **reproduzível**: quem clonar este repositório em outra máquina
roda um comando e obtém o mesmo tipo de relatório, com as mesmas ferramentas e as mesmas versões.

A ferramenta responde a três perguntas que se complementam:

| Pergunta                                                 | Análise | Ferramenta                        |
| -------------------------------------------------------- | ------- | --------------------------------- |
| As bibliotecas que eu uso têm vulnerabilidade conhecida? | SCA     | npm audit, OWASP Dependency-Check |
| O código que eu escrevi tem padrão inseguro?             | SAST    | Semgrep                           |
| A aplicação em execução responde de forma insegura?      | DAST    | OWASP ZAP                         |

```text
npm run security:scan
        │
        ├── npm audit              (SCA, dependências declaradas)
        ├── Semgrep                (SAST, código-fonte)
        ├── OWASP Dependency-Check (SCA, componentes empacotados)
        └── OWASP ZAP              (DAST, aplicação em execução)
                │
                ▼
       Normalização e consolidação
                │
                ▼
       security/reports/security-report.html
```

## Ferramentas utilizadas

| Ferramenta                 | Papel                              | Como roda                              |
| -------------------------- | ---------------------------------- | -------------------------------------- |
| **npm audit**              | Advisories do registro npm         | Binário local, já vem com o npm        |
| **Semgrep**                | Regras de segurança sobre o código | Binário local, ou imagem Docker fixada |
| **OWASP Dependency-Check** | CVEs do NVD sobre os componentes   | Imagem Docker fixada                   |
| **OWASP ZAP**              | Varredura da API em execução       | Imagem Docker fixada                   |

As regras do Semgrep são o pacote `p/security-audit`, configurável.

## Pré-requisitos

| Requisito    | Obrigatório | Para quê                                               |
| ------------ | ----------- | ------------------------------------------------------ |
| Node.js ≥ 22 | Sim         | Executar a ferramenta                                  |
| npm          | Sim         | Executar o `npm audit`                                 |
| Docker       | Não         | Dependency-Check, ZAP e o Semgrep sem instalação local |
| Semgrep      | Não         | Alternativa ao Docker para o SAST                      |

Sem Docker e sem Semgrep, o `npm audit` ainda roda e o relatório declara os três scanners ausentes
na seção de limitações. **Um scanner que não rodou nunca é apresentado como ausência de
vulnerabilidade.**

Para o ZAP, a aplicação precisa estar no ar. A ferramenta sobe tudo sozinha com `--prepare`:

```bash
npm run security:scan -- --prepare
```

Isso executa `docker compose up -d`, aplica as migrations, roda o seed e garante a conta de scan
descrita abaixo. Com a stack já no ar, `npm run security:scan` basta.

## Instalação

Nada a instalar além do que o projeto já pede:

```bash
npm install
```

A ferramenta resolve o Semgrep sozinha, na ordem do menos intrusivo para o mais:

1. Binário `semgrep` já instalado na máquina.
2. Imagem Docker fixada (`semgrep/semgrep:1.97.0`), sem instalar nada no host.
3. Só com `--install` explícito, e só quando não há Docker: `pipx install semgrep==1.97.0`.

O passo 3 usa **pipx** e não `pip`, para não alterar os pacotes do interpretador do sistema. Se o
pipx não existir, a ferramenta imprime as instruções manuais em vez de tentar outra coisa.

```bash
npm run security:scan -- --install
```

### Chave da NVD (recomendado)

O Dependency-Check baixa a base do NVD na primeira execução. Sem chave de API, esse download é
lento e sujeito a limite de requisições, e pode estourar o timeout. Peça uma chave gratuita em
<https://nvd.nist.gov/developers/request-an-api-key> e exporte:

```bash
export NVD_API_KEY=sua-chave
npm run security:scan
```

A base fica em cache em `security/.cache/dependency-check`, que está no `.gitignore`. A segunda
execução é rápida.

## Execução

```bash
npm run security:scan
```

Saída:

```text
Security Assessment
────────────────────────────────────

[Security] Checking dependencies...

  ✓ Node.js (24.15.0)
  ✓ npm (11.12.1)
  ✓ Docker (Docker version 29.5.0, build 98f1464)
  ✗ Semgrep
      Semgrep was not found on PATH.

  Semgrep is not installed locally; it will run from a pinned container image.

  Pulling owasp/dependency-check:12.1.0 ... ✓
  Pulling ghcr.io/zaproxy/zaproxy:stable ... ✓
  Pulling semgrep/semgrep:1.97.0 ... ✓

[1/4] npm audit ..................... ✓
[2/4] Semgrep ....................... ✓
[3/4] Dependency-Check .............. ✓
[4/4] OWASP ZAP ..................... ✓ API scan, driven by the OpenAPI definition.

Generating report ............... ✓

Findings: 6 (critical 0, high 1, medium 2, low 0, informational 3)

Report:
  security/reports/security-report.html
  security/reports/security-report.md
```

Saída real deste projeto em 2026-09-04. O Semgrep aparece ausente e roda do container mesmo assim,
que é o caminho normal numa máquina sem ele instalado.

### Opções

| Opção                     | Efeito                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `--prepare`               | Sobe a stack, migra, roda o seed e prepara a conta de scan |
| `--install`               | Autoriza instalar o Semgrep com pipx quando não há Docker  |
| `--only=npmaudit,semgrep` | Roda apenas os scanners listados                           |

```bash
npm run security:scan -- --only=npmaudit,semgrep
npm run security:scan -- --install
```

Os nomes aceitos em `--only` são `npmaudit`, `semgrep`, `dependencycheck` e `zap`.

### Código de saída

O comando sai com 0 mesmo quando encontra vulnerabilidades. O código de saída informa se a
**análise rodou**, não se ela achou algo: um comando que quebra o build a cada advisory nova acaba
sendo desligado, e aí não protege mais nada. Se algum scanner falhar, isso é dito no terminal e
registrado na seção de limitações do relatório.

## Varredura autenticada

Sem token, toda rota atrás do guard JWT responde 401. A análise dinâmica então consegue afirmar
uma coisa só: que a API recusa chamadas anônimas. Nada sobre o comportamento das rotas.

A ferramenta resolve isso preparando uma conta dedicada antes de escanear:

1. Faz login na conta de scan. Se ela existe e já tem o papel configurado, reaproveita.
2. Caso contrário, entra com a conta de bootstrap (o `SUPER_ADMIN` que o seed cria).
3. Registra a conta de scan pela rota pública e concede o papel a ela.
4. Faz login e passa o token ao ZAP.

O token entra no ZAP pelo add-on `replacer`, que reescreve o cabeçalho `Authorization` de cada
requisição. É o mecanismo que a própria documentação do ZAP indica para bearer token em API scan.

A conta é criada só pela API, com as mesmas rotas que um operador usaria. Nada escreve direto no
banco. O CPF é calculado pelo mesmo algoritmo que o `PersonDocument` do domínio verifica, derivado
do e-mail, então re-executar reaproveita a conta em vez de criar outra.

> **Aviso.** A varredura autenticada envia requisições de escrita com um token administrativo.
> Rode contra um ambiente descartável. No `docker compose` local os dados voltam com
> `npm run seed`.

Nenhuma senha fica no arquivo de configuração versionado. Elas vêm do ambiente:

| Variável                 | Para quê                                               |
| ------------------------ | ------------------------------------------------------ |
| `SECURITY_SCAN_PASSWORD` | Senha da conta de scan. Default local `Str0ngPassword` |
| `ADMIN_PASSWORD`         | Senha do `SUPER_ADMIN`, usada para conceder o papel    |

Só o `SUPER_ADMIN` pode conceder `ADMIN` (ADR 0012), então `authentication.bootstrapEmail` precisa
apontar para essa conta. Um `ADMIN` comum recebe 403 e a ferramenta diz isso na mensagem.

Para desligar e escanear anonimamente, coloque `authentication.enabled: false`. O relatório
registra a escolha na seção de limitações.

### O limitador de requisições e a cobertura

O `ThrottlerGuard` é o primeiro da cadeia e responde antes do JWT. Com o limite padrão de 100
requisições por minuto, uma varredura que envia milhares em menos de um minuto recebe 429 na maior
parte delas: uma execução medida respondeu **429 a 72% do tráfego do scan**.

O controle está funcionando, e ao mesmo tempo limita o que a análise dinâmica consegue alcançar.
Para obter cobertura real, eleve o limite no ambiente de scan antes de rodar:

```bash
RATE_LIMIT_MAX_REQUESTS=100000 RATE_LIMIT_AUTH_MAX_REQUESTS=10000 docker compose up -d
npm run security:scan
```

Devolva os valores originais depois. O relatório declara a alteração na seção de limitações quando
ela é feita, porque um scan com o limitador afrouxado não mede o mesmo sistema que roda em
produção.

## Relatório simplificado

O relatório completo responde "o que as ferramentas disseram". O simplificado responde "qual é o
estado e o que mudou", que é a pergunta de quem não vai rodar os scanners.

```bash
npm run security:snapshot before   # congela o resultado atual como linha de base
# aplique as correções
npm run security:scan              # mede de novo
npm run security:snapshot after
npm run security:summary           # escreve a comparação
```

Sai em `security/reports/security-summary.html` e `.md`, com contagens antes e depois por
severidade, o que foi resolvido, o que continua aberto e o que apareceu novo.

Os snapshots vêm do dump que o scan grava em `security/reports/raw/consolidation.json`, então o
resumo não tem como divergir do relatório técnico.

O que foi feito sobre cada achado fica em `security/config/resolutions.json`, escrito à mão. Um
achado sem entrada aparece como "em aberto" em vez de receber uma frase gerada: uma correção sem
explicação é pior do que uma pergunta em aberto.

## Documento de entrega

```bash
npm run security:deliverable
```

Gera `security/reports/tech-challenge-entrega.html` a partir dos dois snapshots, das resoluções e
de `security/config/deliverable.json`, que carrega grupo, participantes e links. Para o PDF, abra
no navegador e imprima, ou use o Chrome em modo headless:

```bash
google-chrome --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=security/reports/tech-challenge-entrega.pdf \
  security/reports/tech-challenge-entrega.html
```

## Supressões

`security/config/dependency-check-suppressions.xml` registra os achados analisados e considerados
falso positivo, cada um com a justificativa que o sustenta.

O caso que está lá hoje: o Dependency-Check casa componentes com entradas CPE por nome, e o pacote
npm `validator` (biblioteca de validação de strings) foi casado com o CPE do Nu Html Checker
(`validator.nu`), um serviço Java. O CVE-2025-15104 é um SSRF nesse serviço, que faz requisições
HTTP em nome de quem chama. O pacote npm não faz acesso de rede nenhum.

Uma supressão sem a justificativa escrita ao lado não entra neste arquivo.

## Configuração

`security/security.config.json`:

```json
{
  "application": {
    "baseUrl": "http://localhost:13000",
    "apiPrefix": "/api/v1"
  },
  "openapi": {
    "url": "http://localhost:13000/api/docs-json",
    "path": null
  },
  "scanners": {
    "npmAudit": true,
    "semgrep": true,
    "dependencyCheck": true,
    "zap": true
  },
  "semgrep": {
    "config": "p/security-audit",
    "dockerImage": "semgrep/semgrep:1.97.0",
    "timeoutMs": 600000
  },
  "dependencyCheck": {
    "dockerImage": "owasp/dependency-check:12.1.0",
    "timeoutMs": 2700000
  },
  "zap": {
    "dockerImage": "ghcr.io/zaproxy/zaproxy:stable",
    "mode": "auto",
    "timeoutMs": 900000
  },
  "report": {
    "title": "Security Vulnerability Assessment",
    "markdown": true
  }
}
```

| Campo                 | Significado                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `application.baseUrl` | Alvo do ZAP. Só `http` e `https` são aceitos                                              |
| `openapi.url`         | Especificação OpenAPI. `null` desliga o API scan                                          |
| `scanners.*`          | Liga e desliga cada scanner                                                               |
| `semgrep.config`      | Pacote de regras do Semgrep                                                               |
| `*.dockerImage`       | Imagem usada, sempre fixada por tag                                                       |
| `zap.mode`            | `auto` usa o API scan se a OpenAPI responder, senão o baseline. `baseline` e `api` forçam |
| `*.timeoutMs`         | Tempo máximo de cada scanner                                                              |
| `report.markdown`     | Gera também o `.md` ao lado do HTML                                                       |

A configuração é validada na subida. Um campo inválido produz uma mensagem que nomeia o campo, em
vez de um erro obscuro no meio do scan.

## Estrutura dos relatórios

```text
security/
├── README.md                  este arquivo
├── security.config.json       configuração
├── scripts/
│   ├── security-scan.ts       orquestrador e ponto de entrada
│   ├── config.ts              leitura e validação da configuração
│   ├── environment.ts         checagem e resolução de dependências
│   ├── exec.ts                execução de processos externos
│   ├── finding.ts             o modelo normalizado
│   ├── owasp.ts               catálogo e mapeamento OWASP Top 10
│   ├── consolidate.ts         deduplicação, contagens e resumo
│   ├── report.ts              geração do HTML e do Markdown
│   └── scanners/              um parser por ferramenta
└── reports/                   gerado, fora do versionamento
    ├── security-report.html   o artefato principal
    ├── security-report.md     o mesmo conteúdo em Markdown
    └── raw/                   saída original de cada ferramenta
```

`reports/` inteiro está no `.gitignore`, exceto o `.gitkeep`. As saídas originais ficam em
`reports/raw/` para quem quiser conferir uma conclusão do relatório contra o que a ferramenta
disse.

O HTML tem o CSS embutido e não busca nada na rede: abre igual numa máquina sem internet. Para o
PDF, abra no navegador e imprima; há regras de `@media print` para isso.

O relatório tem dez seções: sumário executivo, escopo, metodologia, ferramentas, resumo dos
resultados, vulnerabilidades, mapeamento OWASP Top 10, recomendações, limitações e conclusão.

## Interpretação dos resultados

### Severidades

| Nível             | Leitura                                                           |
| ----------------- | ----------------------------------------------------------------- |
| **Critical**      | Explorável com impacto grave. Corrigir antes de expor a aplicação |
| **High**          | Impacto relevante. Priorizar                                      |
| **Medium**        | Depende de contexto ou de pré-condições                           |
| **Low**           | Impacto limitado                                                  |
| **Informational** | Observação, não necessariamente um problema                       |

`moderate` do npm vira `medium`. Quando a ferramenta não dá uma palavra de severidade utilizável
mas dá um CVSS, a severidade vem das faixas que a própria especificação do CVSS define. Uma
severidade desconhecida vira `informational`, nunca algo mais alto: inventar severidade é inventar
achado.

### Classificação

A ferramenta não decide o que é falso positivo. Isso exige leitura humana do código, e afirmar
sem essa leitura seria descartar um achado real com a mesma facilidade com que se confirma um
falso.

| Classificação     | Significado                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| **Confirmed**     | A ferramenta estabelece o fato: um CVE em versão instalada, por exemplo |
| **Potential**     | Candidato até alguém ler o contexto. Todo match do Semgrep começa aqui  |
| **Informational** | Observado e relatado, sem afirmação de risco                            |

Um achado que duas ferramentas reportam independentemente sobe para **Confirmed** e lista as duas.

### Mapeamento OWASP

Um achado só entra numa categoria do Top 10 quando a ferramenta forneceu base para isso:

- **CWE** que consta da lista publicada pela OWASP para aquela categoria;
- **identificador OWASP 2021** publicado pela própria regra, como o Semgrep faz;
- **advisory de dependência**, que é A06 por definição.

Sem base, o achado aparece como **Not determined**. A lista de 2017 é ignorada de propósito: é
outra taxonomia, e tratar `A3:2017` como `A03:2021` classificaria errado.

### Deduplicação

npm audit e Dependency-Check enxergam a mesma árvore de dependências e reportam os mesmos CVEs. A
consolidação agrupa por CVE mais nome do pacote, mantém a severidade mais alta das duas, une CVEs
e CWEs, e mostra uma linha só citando as duas ferramentas.

## Limitações

Limitações estruturais, que valem em toda execução:

- **O DAST roda sem autenticação.** Toda rota atrás do guard JWT responde 401 e não é exercitada.
  A ferramenta não implementa autenticação de sessão no ZAP de propósito: seria a parte mais
  frágil e mais complexa da implementação. O relatório declara isso.
- **O SAST é baseado em regras.** Reporta o que as regras descrevem, e é silencioso sobre o que
  nenhuma regra cobre.
- **A análise de dependência depende das bases de advisories** no momento da execução.
- **Não há teste de intrusão nem revisão manual.** O relatório distingue o que uma ferramenta
  estabeleceu do que ela apenas sinalizou.

O relatório gerado lista apenas as limitações **que de fato ocorreram naquela execução**, mais
essas estruturais.

## Troubleshooting

**`Docker is required for OWASP ZAP`**
O daemon não respondeu. `docker info` para conferir. No Linux, veja se seu usuário está no grupo
`docker`.

**`The application did not answer at http://localhost:13000`**
Suba a aplicação com `docker compose up -d`. O ZAP é pulado, não falha o scan.

**Dependency-Check estoura o timeout**
É o download do NVD na primeira execução. Defina `NVD_API_KEY` e rode de novo; o cache em
`security/.cache/` torna as execuções seguintes rápidas.

**ZAP não alcança `localhost`**
No Linux, o container usa `--network host` quando o alvo é local. No Docker Desktop (macOS,
Windows) o host networking não funciona igual: troque `application.baseUrl` para
`http://host.docker.internal:13000`.

**Semgrep indisponível e sem Docker**
Instale manualmente e rode de novo:

```bash
pipx install semgrep==1.97.0
```

**O relatório saiu com poucos achados de DAST**
Esperado. Uma API que devolve JSON oferece poucos links para o crawler seguir, e sem credenciais
o ZAP não passa do 401. Use `zap.mode: "api"` com a OpenAPI para alcançar as rotas documentadas.

## Segurança da própria ferramenta

- **Read-only sobre o projeto.** Nunca roda `npm audit fix`, não atualiza dependências e não toca
  no `package-lock.json`.
- **Sem shell.** Todo processo externo é iniciado com `spawn` e um array de argumentos, sem
  `shell: true`. Valores vindos da configuração nunca são concatenados numa string de comando.
- **Sem `eval`** e sem segredo embutido. A chave da NVD vem de variável de ambiente.
- **Configuração validada**, inclusive o protocolo das URLs, que precisa ser `http` ou `https`.
- **Imagens fixadas por tag**, para que a execução de amanhã seja a mesma de hoje.
- **Escape na geração do relatório**: título de achado vindo de scanner é escapado antes de entrar
  no HTML.

## Testes

A lógica própria da ferramenta é testada com o Vitest do projeto:

```bash
npm run test:unit
```

Cobrem parsing das quatro ferramentas, normalização de severidade e CWE, mapeamento OWASP,
deduplicação, consolidação, geração do resumo, tratamento de scanner que falhou e escape do
relatório. As ferramentas externas em si não são testadas: elas têm os próprios testes.
