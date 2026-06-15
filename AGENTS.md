# AGENTS.md — ChatVolt Conversation Cleanup Agent

> Documento de referência para agentes de IA e desenvolvedores que trabalharão neste projeto.
> Contém o **SDD (Software Design Document)** e os cenários **BDD (Behavior-Driven Development)** completos.

---

## 📋 Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura e Stack](#2-arquitetura-e-stack)
3. [Configuração e Variáveis de Ambiente](#3-configuração-e-variáveis-de-ambiente)
4. [Endpoints da API](#4-endpoints-da-api)
5. [Filtros Disponíveis](#5-filtros-disponíveis)
6. [Design do Algoritmo Principal](#6-design-do-algoritmo-principal)
7. [Tratamento de Erros e Resiliência](#7-tratamento-de-erros-e-resiliência)
8. [Interface e UX](#8-interface-e-ux)
9. [Especificações BDD](#9-especificações-bdd)
10. [Script Base de Referência](#10-script-base-de-referência)

---

## 1. Visão Geral

**Nome do Projeto:** ChatVolt Conversation Cleanup Agent
**Tipo:** Script/Bot autônomo de limpeza de dados
**Objetivo:** Consultar, filtrar e excluir em massa conversas da plataforma ChatVolt via API REST, com suporte a múltiplos filtros combinados, paginação automática e resiliência a bloqueios de rate limit.

### Problema que resolve

Scripts simples de deleção em massa falham por três razões principais:
1. A API retorna no máximo 100 conversas por requisição — necessário paginar.
2. Muitas requisições DELETE seguidas provocam erro 419/429 (rate limit).
3. O usuário não sabe se deve esperar ou se o processo travou.

Este agente resolve os três problemas de forma transparente e segura.

---

## 2. Arquitetura e Stack

```
┌─────────────────────────────────────────────┐
│              CLEANUP AGENT                  │
│                                             │
│  ┌─────────────┐      ┌──────────────────┐  │
│  │   Filter UI │─────▶│  Filter Builder  │  │
│  └─────────────┘      └────────┬─────────┘  │
│                                │             │
│                         ┌──────▼──────┐      │
│                         │  GET /conv  │      │
│                         │ (paginado)  │      │
│                         └──────┬──────┘      │
│                                │             │
│                    ┌───────────▼──────────┐  │
│                    │  DELETE Loop c/Retry  │  │
│                    │  + Rate Limit Guard   │  │
│                    └───────────┬──────────┘  │
│                                │             │
│                    ┌───────────▼──────────┐  │
│                    │    Progress Logger   │  │
│                    │  (não feche a aba!)  │  │
│                    └──────────────────────┘  │
└─────────────────────────────────────────────┘
                         │
                         ▼
            https://api.chatvolt.ai
```

**Stack recomendada:**
- Runtime: Node.js 18+ ou execução direta no browser (fetch nativo)
- Linguagem: JavaScript / TypeScript
- Sem dependências externas obrigatórias (usa apenas `fetch`)

---

## 3. Configuração e Variáveis de Ambiente

O agente deve ler as seguintes variáveis antes de executar qualquer operação:

| Variável       | Tipo     | Obrigatória | Descrição                                      |
|----------------|----------|-------------|------------------------------------------------|
| `TOKEN`        | `string` | ✅ Sim      | Bearer token de autenticação da API ChatVolt   |
| `AGENT_ID`     | `string` | ✅ Sim      | ID do agente cujas conversas serão gerenciadas |
| `DRY_RUN`      | `boolean`| ❌ Não      | Se `true`, simula sem apagar (padrão: `false`) |
| `DELAY_MS`     | `number` | ❌ Não      | Delay entre DELETEs em ms (padrão: `300`)      |
| `RETRY_WAIT_S` | `number` | ❌ Não      | Segundos de espera após 429/419 (padrão: `60`) |

**Fonte de configuração (em ordem de prioridade):**
1. Arquivo `.env` na raiz do projeto
2. Arquivo `config.json` com os filtros e credenciais
3. Argumentos de linha de comando (`--token`, `--agentId`, etc.)

---

## 4. Endpoints da API

**Base URL:** `https://api.chatvolt.ai`

| Operação          | Método   | Endpoint                    | Descrição                          |
|-------------------|----------|-----------------------------|------------------------------------|
| Listar conversas  | `GET`    | `/conversation`             | Busca filtrada com paginação       |
| Apagar conversa   | `DELETE` | `/conversation/{id}`        | Remove uma conversa pelo ID        |

**Autenticação:** Todas as requisições devem conter o header:
```
Authorization: Bearer <TOKEN>
```

---

## 5. Filtros Disponíveis

O endpoint `GET /conversation` suporta os seguintes parâmetros de query. O agente deve permitir combinar qualquer subconjunto deles:

| Parâmetro        | Tipo       | Valores/Formato                                    | Descrição                                          |
|------------------|------------|----------------------------------------------------|----------------------------------------------------|
| `agentId`        | `string`   | ID do agente ou `"null"` (sem agente)              | Filtra por agente responsável                      |
| `channel`        | `string`   | `whatsapp`, `dashboard`, etc.                      | Filtra por canal de origem                         |
| `status`         | `enum`     | `RESOLVED`, `UNRESOLVED`, `HUMAN_REQUESTED`        | Filtra por estado da conversa                      |
| `createdAt`      | `string`   | `YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss` / ISO 8601   | Data/hora de início do intervalo (inclusivo)       |
| `endDate`        | `string`   | `YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss` / ISO 8601   | Data/hora de fim do intervalo (inclusivo)          |
| `priority`       | `enum`     | `LOW`, `MEDIUM`, `HIGH`                            | Filtra por prioridade                              |
| `assigneeId`     | `string`   | ID de membro ou `"unassigned"`                     | Filtra por responsável designado                   |
| `unread`         | `boolean`  | `true` / `false`                                   | Filtra apenas conversas com mensagens não lidas    |
| `tag`            | `string`   | Nome da tag                                        | Filtra por tag associada                           |
| `ai`             | `enum`     | `enabled`, `disabled`                              | Filtra pelo estado da IA na conversa               |
| `frustrationMin` | `number`   | `0` a `1`                                          | Score mínimo de frustração                         |
| `frustrationMax` | `number`   | `0` a `1`                                          | Score máximo de frustração                         |
| `limit`          | `integer`  | `1` a `100` (padrão: `25`)                         | Quantidade de resultados por página                |
| `cursor`         | `string`   | JSON URL-safe: `{"lastCreatedAt":"...","lastId":"..."}` | Token de paginação para o próximo lote        |

---

## 6. Design do Algoritmo Principal

### Fluxo de execução

```
INÍCIO
  │
  ├─▶ [1] Validar TOKEN e AGENT_ID
  │
  ├─▶ [2] Construir objeto de filtros a partir da configuração
  │
  ├─▶ [3] LOOP DE PAGINAÇÃO ─────────────────────────────────┐
  │         │                                                  │
  │         ├─▶ GET /conversation?{filtros}&limit=100         │
  │         │                                                  │
  │         ├─▶ Se retornou 0 conversas → FIM DO LOOP        │
  │         │                                                  │
  │         ├─▶ LOOP DE DELEÇÃO para cada conversa           │
  │         │     │                                            │
  │         │     ├─▶ DELETE /conversation/{id}               │
  │         │     │     ├─▶ 200/204: ✅ Apagado, log          │
  │         │     │     ├─▶ 429/419: ⏳ Aguarda + Retry       │
  │         │     │     └─▶ Outro erro: ⚠️ Log e continua    │
  │         │     │                                            │
  │         │     └─▶ Aguardar DELAY_MS antes do próximo     │
  │         │                                                  │
  │         └─▶ Extrair cursor da resposta e repetir ─────────┘
  │              (se não houver cursor → saiu do loop)
  │
  └─▶ [4] Exibir resumo final: total apagadas, erros, tempo
```

### Lógica de paginação

```javascript
let cursor = null;
let totalDeletadas = 0;

do {
  const params = { ...filtros, limit: 100, ...(cursor && { cursor }) };
  const conversas = await buscarConversas(params);

  if (conversas.length === 0) break;

  for (const c of conversas) {
    await deletarConversaComRetry(c.id);
    totalDeletadas++;
    await sleep(DELAY_MS);
  }

  // O cursor vem no header ou no body — verificar resposta da API
  cursor = conversas._nextCursor ?? null;

} while (cursor !== null);
```

---

## 7. Tratamento de Erros e Resiliência

### 7.1 Estratégia de Retry (Backoff Linear)

Quando a API retornar **HTTP 419 ou 429**, o script NÃO deve falhar nem encerrar. O comportamento esperado é:

1. Capturar o código de status no bloco `catch` / verificação do response
2. Emitir aviso visual imediato na interface (log + alert se browser)
3. Aguardar `RETRY_WAIT_S` segundos (padrão: 60s)
4. Tentar a mesma requisição novamente de forma recursiva
5. Retomar o loop a partir do ponto exato de parada

### 7.2 Aviso ao Usuário durante Rate Limit

Mensagem obrigatória a ser exibida quando o rate limit for atingido:

```
⚠️  ATENÇÃO — POR FAVOR, NÃO FECHE ESTA PÁGINA!

Atingimos o limite de requisições da API (Erro 419/429).
O processo foi pausado automaticamente e retomará em 60 segundos.

Progresso atual: {totalDeletadas} conversas apagadas.
Aguardando... {countdown}s
```

### 7.3 Tabela de Erros Tratados

| Código HTTP | Significado               | Ação do Agente                                      |
|-------------|---------------------------|-----------------------------------------------------|
| `200/204`   | Sucesso                   | Contabiliza e avança                                |
| `401`       | Token inválido/expirado   | Para tudo e exibe erro crítico                      |
| `404`       | Conversa não encontrada   | Loga como aviso e continua                          |
| `419`       | Rate limit (ChatVolt)     | Pausa + aviso + retry após `RETRY_WAIT_S`           |
| `429`       | Rate limit (padrão HTTP)  | Pausa + aviso + retry após `Retry-After` ou 60s     |
| `500/503`   | Erro no servidor          | Retry com backoff de 30s, máximo 3 tentativas       |
| Rede        | Sem conexão               | Pausa e aguarda reconexão (intervalo de 10s)        |

---

## 8. Interface e UX

### 8.1 Log de Progresso (obrigatório no terminal ou console)

```
[12:34:01] 🔍 Buscando conversas com filtros: channel=whatsapp, status=RESOLVED
[12:34:02] 📋 Lote 1: 100 conversas encontradas
[12:34:02] 🗑️  Apagando: conv_abc123...  ✅ OK
[12:34:02] 🗑️  Apagando: conv_def456...  ✅ OK
...
[12:35:10] ⏳ Limite atingido (Erro 429). Pausando 60s. Não feche a página!
[12:36:10] ▶️  Retomando...
[12:36:11] 📋 Lote 2: 87 conversas encontradas
...
[12:37:45] ✅ CONCLUÍDO. Total apagadas: 187 | Erros: 0 | Tempo: 3m44s
```

### 8.2 Modo DRY_RUN (simulação segura)

Quando `DRY_RUN=true`:
- Toda a lógica de GET e paginação roda normalmente
- As chamadas DELETE são **substituídas por logs** com prefixo `[DRY-RUN]`
- O resumo final mostra "X conversas SERIAM apagadas"
- Ideal para testar os filtros antes de executar a deleção real

---

## 9. Especificações BDD

### Feature: Exclusão em massa inteligente de conversas

```gherkin
Feature: Gerenciamento e exclusão em massa de conversas ChatVolt
  Como um administrador do sistema
  Quero poder filtrar conversas por múltiplos critérios
  Para apagar apenas históricos específicos sem afetar conversas ativas ou recentes
```

---

#### Cenário 1: Apagar todas as conversas de um agente

```gherkin
Scenario: Limpeza completa de conversas de um agente
  Given que TOKEN e AGENT_ID estão configurados corretamente
  And nenhum filtro adicional foi aplicado
  When a função limparTodas() for executada
  Then o sistema deve buscar todas as conversas do agente
  And deve iterar sobre cada conversa apagando pelo ID
  And deve exibir log de progresso para cada deleção
  And deve exibir o total de conversas apagadas ao final
```

---

#### Cenário 2: Apagar conversas antigas de um canal específico

```gherkin
Scenario: Limpeza filtrada por canal e data
  Given que o filtro channel="whatsapp" está configurado
  And o filtro endDate="2023-12-31" está configurado
  When a função limparTodas() for executada
  Then o sistema deve buscar apenas conversas do canal WhatsApp
  And apenas conversas criadas até 31/12/2023 devem ser retornadas
  And deve apagar cada conversa da lista filtrada
  And conversas de outros canais não devem ser afetadas
```

---

#### Cenário 3: Paginação automática para grandes volumes

```gherkin
Scenario: Paginação automática ao encontrar mais de 100 conversas
  Given que o filtro retorna 250 conversas elegíveis para exclusão
  When a primeira requisição GET retornar exatamente 100 conversas e um cursor
  Then o agente deve apagar as 100 conversas do primeiro lote
  And deve usar o cursor recebido para buscar o próximo lote
  And deve repetir o processo até que não haja mais cursor retornado
  And o total final deve contabilizar as 250 conversas apagadas
```

---

#### Cenário 4: Pausa e recuperação após rate limit (Erro 419/429)

```gherkin
Scenario: Resiliência automática ao atingir o limite de requisições
  Given que o agente está apagando um lote de 500 conversas
  And RETRY_WAIT_S está configurado como 60
  When a API retornar HTTP 419 ou 429 na 150ª exclusão
  Then o sistema deve capturar o erro imediatamente
  And deve exibir aviso na interface instruindo o usuário a NÃO fechar a página
  And deve mostrar uma contagem regressiva de 60 segundos
  And após o tempo esgotar, deve retomar a exclusão a partir da 151ª conversa
  And deve continuar até apagar todas as 500 conversas
  And o total final deve contabilizar todas as 500 conversas
```

---

#### Cenário 5: Modo DRY_RUN sem deleção real

```gherkin
Scenario: Simulação segura antes de executar a limpeza real
  Given que DRY_RUN=true está configurado
  And filtros channel="dashboard" e status="RESOLVED" estão definidos
  When a função limparTodas() for executada
  Then o sistema deve buscar e paginar as conversas normalmente
  And deve logar "[DRY-RUN] Apagaria: {id}" para cada conversa encontrada
  And nenhuma requisição DELETE deve ser feita
  And o resumo final deve indicar "X conversas SERIAM apagadas"
```

---

#### Cenário 6: Filtro combinado multi-parâmetro

```gherkin
Scenario: Filtro usando múltiplos parâmetros simultâneos
  Given que os seguintes filtros estão configurados:
    | Filtro        | Valor                  |
    | agentId       | "agent_abc123"         |
    | channel       | "whatsapp"             |
    | status        | "RESOLVED"             |
    | createdAt     | "2024-01-01 00:00:00"  |
    | endDate       | "2024-06-30 23:59:59"  |
    | priority      | "LOW"                  |
  When a função limparTodas() for executada
  Then a URL da requisição GET deve conter todos os parâmetros configurados
  And apenas conversas que satisfaçam TODOS os filtros devem ser retornadas
  And apenas essas conversas devem ser apagadas
```

---

#### Cenário 7: Token inválido ou expirado

```gherkin
Scenario: Interrupção por falha de autenticação
  Given que o TOKEN configurado está expirado ou é inválido
  When qualquer requisição à API for feita
  Then a API deve retornar HTTP 401
  And o agente deve interromper imediatamente toda a execução
  And deve exibir mensagem de erro crítico: "Token inválido. Verifique suas credenciais."
  And nenhuma deleção deve ter sido realizada
```

---

#### Cenário 8: Conversa já deletada (404 na deleção)

```gherkin
Scenario: Conversa não encontrada durante a deleção
  Given que o agente obteve uma lista de conversas para apagar
  And uma das conversas foi apagada manualmente por outro processo
  When o agente tentar apagar essa conversa e receber HTTP 404
  Then deve registrar um aviso: "Conversa {id} não encontrada, pulando..."
  And deve continuar para a próxima conversa da lista
  And o erro 404 não deve interromper o fluxo de deleção
```

---

## 10. Script Base de Referência

```javascript
// ============================================================
// ChatVolt Conversation Cleanup Agent — Script Base
// ============================================================

const TOKEN        = process.env.TOKEN        || "";
const AGENT_ID     = process.env.AGENT_ID     || "";
const BASE         = "https://api.chatvolt.ai/conversation";
const DRY_RUN      = process.env.DRY_RUN      === "true";
const DELAY_MS     = parseInt(process.env.DELAY_MS     || "300");
const RETRY_WAIT_S = parseInt(process.env.RETRY_WAIT_S || "60");

// Filtros opcionais — preencha conforme necessário
const FILTROS = {
  agentId:   AGENT_ID,
  // channel: "whatsapp",
  // status:  "RESOLVED",
  // createdAt: "2024-01-01",
  // endDate:   "2024-12-31",
};

// -------- UTILITÁRIOS --------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// -------- LISTAR CONVERSAS (com paginação) --------

async function buscarConversas(params) {
  const query = new URLSearchParams({ ...params, limit: 100 }).toString();
  const url = `${BASE}?${query}`;
  log(`🔍 GET ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (res.status === 401) {
    throw new Error("❌ Token inválido ou expirado. Verifique suas credenciais.");
  }

  const data = await res.json();
  return data;
}

// -------- DELETAR UMA CONVERSA (com retry) --------

async function deletarConversaComRetry(id, tentativa = 1) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Apagaria: ${id}`);
    return;
  }

  try {
    const res = await fetch(`${BASE}/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (res.status === 419 || res.status === 429) {
      const waitMs = RETRY_WAIT_S * 1000;
      console.warn(`\n⚠️  ATENÇÃO — POR FAVOR, NÃO FECHE ESTA PÁGINA!`);
      console.warn(`   Limite de requisições atingido (Erro ${res.status}).`);
      console.warn(`   Pausando ${RETRY_WAIT_S}s e retomando automaticamente...\n`);
      await sleep(waitMs);
      log(`▶️  Retomando exclusão após pausa...`);
      return deletarConversaComRetry(id, tentativa + 1);
    }

    if (res.status === 404) {
      log(`⚠️  Conversa ${id} não encontrada (404), pulando...`);
      return;
    }

    if (res.status === 401) {
      throw new Error("❌ Token inválido. Interrompendo.");
    }

    if (!res.ok && tentativa <= 3) {
      log(`⚠️  Erro ${res.status} ao apagar ${id}. Tentativa ${tentativa}/3...`);
      await sleep(30000);
      return deletarConversaComRetry(id, tentativa + 1);
    }

    log(`✅ Apagado: ${id}`);

  } catch (err) {
    if (err.message.includes("Token inválido")) throw err;
    log(`❌ Erro inesperado em ${id}: ${err.message}`);
  }
}

// -------- FLUXO PRINCIPAL --------

async function limparTodas() {
  if (!TOKEN)    throw new Error("TOKEN não configurado.");
  if (!AGENT_ID) throw new Error("AGENT_ID não configurado.");

  log(`🚀 Iniciando Cleanup Agent`);
  log(`   Modo: ${DRY_RUN ? "DRY-RUN (simulação)" : "REAL (irá apagar)"}`);
  log(`   Filtros: ${JSON.stringify(FILTROS)}`);

  let cursor = null;
  let totalDeletadas = 0;
  let lote = 1;
  const inicio = Date.now();

  do {
    const params = { ...FILTROS, limit: 100, ...(cursor && { cursor }) };
    const conversas = await buscarConversas(params);

    if (!conversas || conversas.length === 0) {
      log(`📭 Lote ${lote}: Nenhuma conversa encontrada. Finalizando.`);
      break;
    }

    log(`📋 Lote ${lote}: ${conversas.length} conversas encontradas`);

    for (const c of conversas) {
      await deletarConversaComRetry(c.id);
      totalDeletadas++;
      await sleep(DELAY_MS);
    }

    // Atualizar cursor para próxima página
    // Ajuste conforme retorno real da API (header ou body)
    cursor = conversas._nextCursor ?? null;
    lote++;

  } while (cursor !== null);

  const tempoTotal = ((Date.now() - inicio) / 1000).toFixed(1);
  log(`\n✅ CONCLUÍDO!`);
  log(`   ${DRY_RUN ? "Conversas que SERIAM apagadas" : "Total apagadas"}: ${totalDeletadas}`);
  log(`   Tempo total: ${tempoTotal}s`);
}

limparTodas().catch((err) => {
  console.error("\n💥 ERRO CRÍTICO:", err.message);
  process.exit(1);
});
```

---

*Documento gerado para uso com agentes de IA e equipes de desenvolvimento.*
*Mantenha este arquivo atualizado ao adicionar novos filtros ou endpoints.*