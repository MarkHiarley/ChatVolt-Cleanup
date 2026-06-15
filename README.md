# ChatVolt Conversation Cleanup Agent 🗑️⚡

[![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google-apps-script&logoColor=white)](https://developers.google.com/apps-script)
[![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)

O **ChatVolt Conversation Cleanup Agent** é um painel autônomo desenvolvido para execução no ecossistema **Google Apps Script (GAS)**. Ele permite a administradores do ChatVolt consultar, filtrar, pré-visualizar e excluir em massa históricos de conversas da API REST do ChatVolt de maneira segura, eficiente e resiliente a bloqueios de rede.

---

## 📋 Índice

* [Funcionalidades](#-funcionalidades)
* [Tecnologias Utilizadas](#-tecnologias-utilizadas)
* [Como Executar o Projeto](#-como-executar-o-projeto)
  * [Método 1: Copiar e Colar (Mais Simples)](#método-1-copiar-e-colar-mais-simples)
  * [Método 2: Google Clasp CLI](#método-2-google-clasp-cli-avançado)
* [Design do Algoritmo e Resiliência](#-design-do-algoritmo-e-resiliência)
* [Filtros Suportados](#-filtros-suportados)
* [Segurança e Boas Práticas](#-segurança-e-boas-práticas)
* [Licença](#-licença)

---

## ✨ Funcionalidades

* 🔍 **Filtros Avançados Combinados**: Filtre conversas por canal (WhatsApp, Dashboard, etc.), status, datas de início/fim, ID do responsável, tags, IA ativa/inativa e pontuação de frustração do cliente.
* 👁️ **Pré-visualização Interativa (Modal de Confirmação)**: Antes de deletar qualquer conversa, o painel renderiza o primeiro lote permitindo marcar ou desmarcar manualmente quais conversas deseja manter/apagar.
* 🛡️ **Resiliência a Rate Limit (Erros 419/429)**: Possui monitoramento dinâmico que detecta quando o limite da API é atingido, pausando as chamadas automaticamente, exibindo um contador visual regressivo e retomando do ponto exato onde parou.
* 🔄 **Bypass de CORS Integrado**: Oferece a opção de rotear as requisições através de um proxy no servidor do Google Apps Script (`UrlFetchApp`), evitando bloqueios de CORS do navegador.
* 🔬 **Modo DRY_RUN (Simulação Segura)**: Permite testar as combinações de filtros sem apagar nada de verdade, exibindo no console e nos contadores exatamente o que seria deletado.
* 📊 **Console e Estatísticas em Tempo Real**: Veja o progresso da deleção, tempo decorrido, total processado, erros e rate limits, com opção de baixar ou copiar a lista de logs gerada.

---

## 💻 Tecnologias Utilizadas

1. **HTML5 & CSS3**: Interface responsiva e moderna com paleta de cores escura e design limpo.
2. **JavaScript (ES6+)**: Mecanismo reativo de controle de fluxo de paginação assíncrona.
3. **Google Apps Script (GAS)**: Runtime servido diretamente na nuvem da Google com bypass de proxy.

---

## 🚀 Como Executar o Projeto

Você pode rodar este projeto de duas formas no Google Apps Script.

### Método 1: Copiar e Colar (Mais Simples)

1. Acesse o [Google Apps Script](https://script.google.com).
2. Crie um novo projeto.
3. No arquivo `Código.gs` padrão, copie e cole o conteúdo de [main.js](file:///home/hiarley/%C3%81rea%20de%20trabalho/ConversationsDeleter/main.js).
4. Crie um novo arquivo do tipo **HTML** no editor do Google Apps Script com o nome exato `Index`.
5. Apague o conteúdo padrão dele e cole o conteúdo de [Index.html](file:///home/hiarley/%C3%81rea%20de%20trabalho/ConversationsDeleter/Index.html).
6. Clique no menu superior **Implantar** > **Nova implantação**.
7. Selecione o tipo de implantação como **Aplicativo da Web** e defina:
   * **Executar como**: Você (seu e-mail).
   * **Quem tem acesso**: Somente você (ou sua organização).
8. Clique em **Implantar** e abra o link gerado para usar o painel no navegador!

### Método 2: Google Clasp CLI (Avançado)

Se você trabalha com desenvolvimento local usando terminal:

1. Instale o clasp globalmente:
   ```bash
   npm install -g @google/clasp
   ```
2. Faça login na sua conta Google:
   ```bash
   clasp login
   ```
3. Crie ou configure seu arquivo `.clasp.json` (já ignorado pelo `.gitignore`) com o ID do seu script Apps Script:
   ```json
   {
     "scriptId": "SEU_SCRIPT_ID_AQUI",
     "rootDir": "./"
   }
   ```
4. Suba as alterações para a nuvem:
   ```bash
   clasp push
   ```

---

## ⚙️ Filtros Suportados

Ao configurar as chamadas no painel, os seguintes parâmetros são suportados e enviados diretamente para o endpoint `GET /conversation` da API do ChatVolt:

| Parâmetro | Descrição |
|---|---|
| `agentId` | ID do agente responsável pelas conversas (obrigatório). |
| `channel` | Filtro por canal (WhatsApp, Dashboard, etc.). |
| `status` | Estado da conversa (`RESOLVED`, `UNRESOLVED`, etc.). |
| `startDate / endDate` | Intervalo temporal de criação da conversa. |
| `priority` | Nível de prioridade (`LOW`, `MEDIUM`, `HIGH`). |
| `assigneeId` | Filtro por responsável designado ou `"unassigned"`. |
| `unread` | Filtra apenas conversas com mensagens não lidas ou lidas. |
| `tag` | Nome da tag associada à conversa. |
| `ai` | Filtra se a IA estava ativada ou desativada. |
| `frustrationMin / Max` | Score decimal da frustração do cliente (0 a 1). |

---

## 🛡️ Design do Algoritmo e Resiliência

O fluxo de deleção inteligente segue a lógica abaixo para garantir estabilidade:

```
[Iniciar Execução] 
       │
       ▼
[Buscar lote inicial de 100 conversas]
       │
       ▼
[Exibir Modal de Prévia ao Usuário] ──(Cancelar)──> [Parar]
       │
   (Confirmar)
       │
       ▼
[Iterar sobre cada conversa do lote]
       │
       ├─► [Modo DRY_RUN ativado?] ──(Sim)──> [Registrar Logs Simulação]
       │
       └─► [Realizar chamada DELETE]
               │
               ├─► [Status 200/204] ──> OK, próximo registro.
               │
               ├─► [Status 404] ──> Logar aviso e continuar.
               │
               ├─► [Status 419/429] ──> [Ativar Tela de Bloqueio]
               │                              │
               │                              ▼
               │                        [Esperar 60s]
               │                              │
               │                              ▼
               │                         [Tentar Novamente]
               │
               └─► [Outros erros] ──> Tentar novamente em 30s (máx 3x)
```

---

## 🔒 Segurança e Boas Práticas

* **Persistência Local Segura**: Suas credenciais (Bearer Token e ID do Agente) são guardadas apenas no `localStorage` do seu navegador para fins de comodidade, nunca saindo de seu ambiente.
* **Segurança de Repositório**: Certifique-se de que o arquivo `.clasp.json` e eventuais arquivos `.env` locais permaneçam dentro do `.gitignore` para evitar vazamento acidental de tokens e IDs de projeto.
* **Uso Controlado do Delay**: Utilize um delay maior (ex: `300ms` a `500ms`) entre as chamadas de deleção para reduzir a frequência com que o Rate Limit da API do ChatVolt é atingido.

---

## 📄 Licença

Este projeto é de código aberto e está sob a licença [MIT](https://choosealicense.com/licenses/mit/). Sinta-se livre para usar, modificar e distribuir.
