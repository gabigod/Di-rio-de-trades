# Diário de Trades

App Android (APK) para registrar e analisar trades em R, com visual preto AMOLED.

## O que o app faz

- **Painel:** resultado acumulado com curva, winrate, fator de lucro, expectativa, drawdown máximo, ganho/perda médios, sequência atual e calendário mensal colorido pelo resultado de cada dia.
- **Trades:** lista completa com busca por ativo, estratégia ou nota, filtro por ano e edição de qualquer trade (toque na linha). Link do print do TradingView abre direto.
- **Novo trade:** formulário rápido com atalhos dos ativos mais usados, WIN/LOSS/BE, direção, R, estratégia, categoria, link e notas.
- **Estatísticas:** curva de capital, drawdown, resultado por mês, win/loss, por dia da semana, distribuição dos R, últimos 30 resultados e tabelas por estratégia, categoria, ativo e direção — tudo filtrável por ano ou Todos.
- **Backup:** exportar (copiar ou compartilhar .json) e importar. Os dados ficam só no aparelho.

Na primeira abertura, o app já vem com o histórico importado da planilha (139 trades).

## Como gerar o APK

A cada push no branch `main`, o GitHub Actions compila e publica o APK em **Releases** (`DiarioDeTrades.apk`). Baixe no celular e instale. As versões novas instalam por cima, sem perder os dados.

## Desenvolvimento

```bash
npm install
npm run dev     # navegador
npm run sync    # monta e copia para o projeto Android
```
