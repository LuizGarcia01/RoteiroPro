# 🚚 RoteiroPro — Sistema SaaS de Roteirização Inteligente

Sistema completo de roteirização para Last Mile com:
- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** HTML/CSS/JS puro (SPA sem framework)
- **Mapa:** Leaflet + CartoDB Dark Tiles (gratuito)
- **Excel:** SheetJS via CDN
- **Charts:** Chart.js via CDN

---

## 📋 Pré-requisitos

- Node.js 18+ instalado ([nodejs.org](https://nodejs.org))
- npm (incluído com Node.js)
- Conexão com internet (para carregar Leaflet, Chart.js, SheetJS via CDN)

---

## 🚀 Instalação e execução

```bash
# 1. Entrar na pasta do projeto
cd roteiro-pro

# 2. Instalar dependências
npm install

# 3. Iniciar o servidor
npm start

# 4. Abrir no navegador
# Acesse: http://localhost:3000
```

Para desenvolvimento com hot-reload (Node.js 18+):
```bash
npm run dev
```

---

## 🏗️ Estrutura do projeto

```
roteiro-pro/
├── server.js          # API REST (Express + SQLite)
├── roteiro.db         # Banco de dados SQLite (gerado automaticamente)
├── package.json
├── public/
│   └── index.html     # SPA completo (HTML + CSS + JS embutidos)
└── README.md
```

---

## 🗄️ Banco de dados — Schema SQLite

```sql
organizations   # Multi-tenant: organizações/empresas
routes          # Rotas de entrega salvas
stops           # Paradas de cada rota (cascade delete)
uploads         # Log de arquivos Excel importados
```

### Tabela `routes`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INTEGER | PK autoincrement |
| name | TEXT | Nome da rota |
| mode | TEXT | fast / economic / balanced |
| total_distance_km | REAL | Distância total calculada |
| estimated_time_min | REAL | Tempo estimado em minutos |
| stop_count | INTEGER | Número de paradas |
| savings_pct | REAL | % economia vs. ordem original |
| start_lat / start_lon | REAL | Coordenadas do ponto de partida |
| status | TEXT | ativa / concluida / cancelada |
| notes | TEXT | Anotações livres |
| created_at | DATETIME | Data/hora de criação |

### Tabela `stops`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| route_id | INTEGER | FK → routes.id |
| sequence_order | INTEGER | Ordem na rota otimizada |
| label | TEXT | ID da parada (coluna Label) |
| barcode | TEXT | Código da encomenda |
| lat / lon | REAL | Coordenadas geográficas |
| dist_from_prev | REAL | Distância da parada anterior (km) |
| accumulated_km | REAL | Distância acumulada desde o início |

---

## 🌐 API REST — Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/stats` | KPIs do dashboard |
| GET | `/api/routes` | Listar todas as rotas |
| POST | `/api/routes` | Salvar nova rota + paradas |
| GET | `/api/routes/:id` | Detalhe da rota com paradas |
| PUT | `/api/routes/:id/status` | Atualizar status |
| PUT | `/api/routes/:id/notes` | Salvar anotações |
| DELETE | `/api/routes/:id` | Excluir rota (cascade) |
| POST | `/api/uploads` | Registrar upload de Excel |
| GET | `/api/uploads` | Histórico de uploads |

---

## 📊 Estrutura do Excel esperada

| Coluna | Obrigatório | Descrição |
|--------|-------------|-----------|
| Label | Não | ID da parada |
| Barcode | Não | Código da encomenda |
| Company | Não | Empresa destinatária |
| Address Claims | Não | Endereço completo |
| Lastmile Postal Code | Não | CEP |
| **Location - Lastmile (Planned)** | **SIM** | Latitude,Longitude (ex: `-23.55,-46.63`) |
| Order Status | Não | Status (Pendente / Entregue / Ausente) |

---

## 🧠 Motor de Roteirização

### Algoritmo: Nearest Neighbor Heuristic (NNH)
- Complexidade: **O(n²)** — adequado para até ~500 paradas
- Parte do depósito e escolhe sempre a próxima parada com menor score
- **Score** varia por modo:

```
fast:     score = tempo×0.6 + desvio×0.4
economic: score = distância (Haversine pura)
balanced: score = dist×0.4 + tempo×0.4 + desvio×0.2
```

### Fórmula de Haversine
Calcula distância entre dois pontos na superfície da Terra com precisão adequada para logística urbana (erro < 0.5% em distâncias curtas).

---

## 🔮 Roadmap de evolução

| Prioridade | Feature | Complexidade |
|-----------|---------|--------------|
| Alta | Otimização 2-opt pós-geração (+15% qualidade) | Média |
| Alta | VRP multi-veículo (k-means cluster + NNH/veículo) | Alta |
| Média | Integração OSRM (distâncias reais por vias) | Média |
| Média | Time windows por parada | Alta |
| Baixa | Export PDF / CSV da rota | Baixa |
| Baixa | Autenticação JWT multi-usuário real | Média |
| Baixa | Notificações por email ao completar parada | Baixa |
| Futura | Integração Google Maps Distance Matrix API | Média |

---

## 🐛 Solução de problemas

**Mapa não carrega:**
- Verifique sua conexão com internet (Leaflet/CDN)

**SQLite error on install:**
```bash
npm install --build-from-source
# ou
npm install better-sqlite3 --ignore-scripts && npx node-pre-gyp rebuild -C ./node_modules/better-sqlite3
```

**Porta 3000 em uso:**
```bash
PORT=4000 npm start
```

**Zerar o banco de dados:**
```bash
rm roteiro.db && npm start
```

---

## 📄 Licença
MIT — Uso livre para projetos comerciais e pessoais.
