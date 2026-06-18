# 🚀 Copa do Mundo Azure — Guia do Evento TFTEC (FIFA 2026 Tickets — modernização VM → PaaS)

> ⚽ **Segundo tempo!** No guia anterior ([`GUIA-EVENTO-VMS.md`](GUIA-EVENTO-VMS.md)) você subiu a aplicação **FIFA 2026 Tickets** em **3 Máquinas Virtuais** — com IIS, iisnode, SQL Server e proxy reverso feitos com as suas mãos. Aqui você vai pegar **essa mesma aplicação** e **modernizá-la** para uma arquitetura **PaaS** no Azure: **Web Apps** no lugar do IIS e **Azure SQL Database** no lugar do SQL Server em VM.
>
> 🥅 **Para todos os níveis.** Cada passo é explicado, com o **caminho visual pelo Portal do Azure** sempre que possível. A meta não é só "fazer funcionar" — é **entender o que muda** quando você troca "infra que você opera" por "serviço gerenciado".

> 🚧 **Documento vivo.** Itens marcados com _⚠️ a confirmar_ serão fixados conforme o evento se aproxima. A arquitetura, as ferramentas e os passos já valem.

> 🧩 **Pré-requisito deste guia:** ter concluído o [`GUIA-EVENTO-VMS.md`](GUIA-EVENTO-VMS.md) — a aplicação **precisa estar rodando nas 3 VMs** (estado pós-Fase 8: `vm-fend` pública como jump host, `vm-bend` e `vm-data` privadas). É **dessa** topologia que vamos partir.

> 🎯 **A jornada é o produto.** A migração é feita **uma camada por vez** (backend → frontend → banco), no padrão **blue/green**: o ambiente novo nasce **ao lado** do antigo, você testa, e só então **vira a chave**. Em cada fase o app continua no ar — você nunca fica sem um ambiente funcional.

---

## 📋 Índice

1. [Sobre esta etapa](#-1-sobre-esta-etapa)
2. [Objetivos do evento](#-2-objetivos-do-evento)
3. [Ferramentas e serviços que vamos usar](#-3-ferramentas-e-serviços-que-vamos-usar)
4. [Arquitetura: antes e depois](#-4-arquitetura-antes-e-depois)
5. [A jornada do aluno](#-5-a-jornada-do-aluno)
   - [Fase 0 — Pré-requisitos](#fase-0--pré-requisitos)
   - [Fase 1 — Desenho do estado-alvo + taxonomia PaaS](#fase-1--desenho-do-estado-alvo--taxonomia-paas)
   - [Fase 2 — Assessment sem appliance (o "porquê")](#fase-2--assessment-sem-appliance-o-porquê)
   - [Fase 3 — Migrar o Backend (API) → Web App](#fase-3--migrar-o-backend-api--web-app)
   - [Fase 4 — Migrar o Frontend → Web App](#fase-4--migrar-o-frontend--web-app)
   - [Fase 5 — Migrar o Banco → Azure SQL Database](#fase-5--migrar-o-banco--azure-sql-database)
   - [Fase 6 — Cutover de domínio + HTTPS gerenciado](#fase-6--cutover-de-domínio--https-gerenciado)
   - [Fase 7 — Smoke test ponta a ponta (100% PaaS)](#fase-7--smoke-test-ponta-a-ponta-100-paas)
   - [Fase 8 — Decomissionar as VMs + comparação VM × PaaS](#fase-8--decomissionar-as-vms--comparação-vm--paas)
   - [Fase 9 — Troubleshooting](#fase-9--troubleshooting)
6. [Tabela de variáveis e segredos](#-6-tabela-de-variáveis-e-segredos)
7. [Evolução (o "próximo nível" do PaaS)](#️-7-evolução-o-próximo-nível-do-paas)

---

## 🚀 1. Sobre esta etapa

No guia das VMs você montou a aplicação **3 camadas clássica** operando **tudo na mão**: instalou IIS, Node, iisnode, SQL Server, configurou NSG, proxy reverso e jump host. Funcionou — e ensinou **operação de infraestrutura real**.

Agora vem a pergunta que todo time faz depois: **"e se eu não quisesse mais cuidar dessas VMs?"** É isso que esta etapa demonstra — a **modernização** para serviços gerenciados (PaaS):

- 🖥️➡️☁️ **IIS na VM → Azure Web App**: você para de instalar IIS, aplicar patch de Windows, abrir porta de firewall. O Azure mantém o host; você só publica o app.
- 🗄️➡️☁️ **SQL Server na VM → Azure SQL Database**: backups automáticos, alta disponibilidade nativa e patching gerenciado — sem você administrar o SGBD.
- 🧰 **Ferramentas assistidas**: em vez de refazer tudo, usamos ferramentas **oficiais de migração** que automatizam a maior parte do trabalho — você avalia, migra e valida.

> 💡 **Por que isso importa?** É a transição que mais aparece no mercado: empresas saindo de "lift-and-shift em VM" para PaaS, atrás de **menos custo operacional** e **mais escala/resiliência**. Saber **conduzir essa migração** — com avaliação, ferramenta certa e plano de cutover — é o diferencial desta etapa.

---

## 🎯 2. Objetivos do evento

Ao final, você terá feito **com as suas próprias mãos**:

| # | Você vai aprender a... |
|---|---|
| 1 | **Desenhar o estado-alvo PaaS** e uma taxonomia de nomes consistente com a fase VM |
| 2 | **Avaliar a migração sem appliance**: TCO/Pricing Calculator + os relatórios de *readiness* embutidos nas próprias ferramentas |
| 3 | Migrar um site IIS para **Azure Web App** usando o **App Service Migration Assistant** |
| 4 | Configurar **App Settings**, **VNet Integration** (temporária) e **CORS** num Web App |
| 5 | Resolver a pegadinha do **proxy reverso no App Service** (`applicationHost.xdt`) |
| 6 | Migrar um banco SQL Server para **Azure SQL Database** com a **Azure SQL Migration extension** (Azure Data Studio + DMS) |
| 7 | Executar um **cutover blue/green** com domínio próprio e **HTTPS gerenciado grátis** |
| 8 | **Comparar VM × PaaS** com números (custo, patch, escala, deploy) e desligar as VMs |

> 🧠 **Filosofia:** **Portal-first** + **ferramentas assistidas**. CLI/PowerShell só onde a ferramenta pede (ex.: registrar o Integration Runtime) ou para desligar tudo no final. Você sai sabendo **qual ferramenta usar para cada tipo de carga** e **por quê**.

> ⏱️ **O que esperar de tempo:** ~1h30 a 2h. A maior parte é a ferramenta trabalhando (empacotar/publicar o site, mover os dados) — seu trabalho é configurar e validar.

---

## ☁️ 3. Ferramentas e serviços que vamos usar

Dois grupos: **ferramentas de migração** (rodam na sua máquina/VMs, são gratuitas) e **recursos Azure de destino** (o ambiente PaaS novo).

### 🧰 Ferramentas de migração (gratuitas)

| Ferramenta | Para que serve | Onde roda | Custo |
|---|---|---|---|
| 🧮 **Azure Pricing / TCO Calculator** | Comparar custo VM × PaaS (o "porquê") | Navegador | Grátis |
| 📦 **App Service Migration Assistant** | Avalia um site IIS e o publica num Web App | Instalado na VM de origem (`vm-bend`, `vm-fend`) | Grátis |
| 🧪 **Azure Data Studio + Azure SQL Migration extension** | Avalia e migra o banco para Azure SQL (via Azure DMS) | Instalado na `vm-data` | Grátis (DMS offline é gratuito) |

> 🛰️ **E o Azure Migrate?** Ele é ótimo, mas o *discovery* completo exige instalar um **appliance** (uma VM/coletor) na rede — desproporcional para 2 VMs de workshop. As duas ferramentas acima são **standalone** e já trazem o *assessment* embutido, então **não usamos o appliance** aqui. Para o slide de "quanto eu economizo", a **Pricing/TCO Calculator** (sem appliance) é suficiente.

### 🎯 Recursos Azure de destino (o ambiente PaaS)

Tudo num **novo Resource Group** PaaS, em **Central India** (mesma região da app), seguindo a taxonomia da Fase 1:

| Serviço Azure | Nome (taxonomia) | Para que serve | Camada / Custo |
|---|---|---|---|
| 📕 **App Service Plan** | `asp-prd-tk-cin-001` | Host compartilhado dos 2 Web Apps (Windows, **B1**) | B1 ~$13/mês |
| 🌐 **Web App backend (API)** | `app-prd-tk-bend-cin-001` | Substitui a `vm-bend` (Node + iisnode gerenciados) | incluso no plano |
| 🌐 **Web App frontend** | `app-prd-tk-fend-cin-001` | Substitui a `vm-fend` (SPA + proxy reverso) | incluso no plano |
| 🗄️ **Azure SQL — servidor lógico** | `sql-prd-tk-cin-001` | "Endereço" do banco gerenciado (`*.database.windows.net`) | grátis (cobra o DB) |
| 🗄️ **Azure SQL Database** | `FIFA2026Tickets` | Substitui o SQL Server da `vm-data` (**Basic**) | Basic ~$5/mês |
| 🔁 **Azure Database Migration Service** | `dms-prd-tk-cin-001` | Motor gerenciado que move os dados (criado pela extension) | grátis (offline) |

> 💰 **Custo total real do PaaS:** ~**$18/mês** (B1 + SQL Basic) se ficar ligado 24/7 — e diferente da VM, **não há o que "desligar"**; você **apaga o Resource Group** ao final do evento e o custo zera. Prorateado para um dia de evento, são **centavos**. Bem dentro do crédito da conta trial.

> 🌍 **Nomes globais!** `app-...` (Web App) e `sql-...` (servidor lógico) viram **endereços públicos** (`.azurewebsites.net` / `.database.windows.net`), então o nome é **único no mundo**. Se o Portal disser *"already taken"*, acrescente suas iniciais: ex.: `app-prd-tk-bend-cin-rss-001`. **Anote o nome final** que você usou.

> 🔐 **Sobre segredos:** neste guia as credenciais do banco ficam em **App Settings** do Web App (melhor que o `.env` na VM, mas ainda em texto na config). _Evolução de produção:_ **Azure Key Vault + Managed Identity** — veja a §7.

---

## 🗺️ 4. Arquitetura: antes e depois

### Antes — o que você construiu no guia das VMs (estado pós-hardening)

```
                 Internet
                    │  80/443
                    ▼
        ┌───────────────────────┐   RDP (jump host)
        │  vm-fend  (pública)   │◀─────────────────┐
        │  IIS + ARR (proxy)    │                  │
        └───────────┬───────────┘                  │
              /api/* │ (porta 80, VNet)             │
                    ▼                               │
        ┌───────────────────────┐                  │
        │  vm-bend  (privada)   │                  │
        │  IIS + iisnode + Node │                  │
        └───────────┬───────────┘                  │
              1433   │  (peering global)            │
                    ▼                               │
        ┌───────────────────────┐                  │
        │  vm-data  (privada)   │──────────────────┘
        │  SQL Server 2022      │
        └───────────────────────┘
```

### Depois — o estado-alvo 100% PaaS

```
                 Internet
                    │  443 (HTTPS gerenciado)
                    ▼
   ┌───────────────────────────────────┐
   │  app-prd-tk-fend  (Web App)       │   SPA + proxy /api/* (ARR via applicationHost.xdt)
   └───────────────┬───────────────────┘
            /api/*  │  HTTPS
                    ▼
   ┌───────────────────────────────────┐
   │  app-prd-tk-bend  (Web App)       │   API Node (iisnode gerenciado)
   └───────────────┬───────────────────┘
            1433    │  TLS, endpoint público + firewall
                    ▼
   ┌───────────────────────────────────┐
   │  Azure SQL Database               │   FIFA2026Tickets @ sql-prd-tk-cin-001
   │  (gerenciado: backup/HA/patch)    │
   └───────────────────────────────────┘
```

> 🔁 **Fluxo igual, infra diferente.** A aplicação **não muda**: o front continua chamando `/api` na mesma origem e o backend continua falando SQL na 1433. O que sai de cena são as **3 VMs, o NSG, o peering e o jump host** — substituídos por serviços gerenciados.

**Princípios de design (e o que isso ensina):**

- 🟦🟩 **Blue/green, uma camada por vez.** Migramos **backend → frontend → banco**. Cada fase cria o recurso PaaS **ao lado** da VM, testa pelo endereço `*.azurewebsites.net`, e só depois reaponta. Você nunca derruba o ambiente antigo antes do novo provar que funciona.
- 🗃️ **Banco por último (e de propósito).** Migrar **compute** (back/front) é "republicar o mesmo código num host novo". Migrar **dados** é diferente — tem schema, volume e uma **janela de corte**. Deixamos por último para o ambiente antigo continuar sendo a fonte da verdade até o momento exato do cutover.
- 🔌 **VNet Integration é temporária.** Enquanto o banco ainda está na `vm-data` (privada), o **backend Web App** alcança o IP privado dela via **VNet Integration + peering**. Quando o banco vira Azure SQL (Fase 5), essa integração é **removida** — Azure SQL é alcançado pelo endpoint público com firewall. Você vê a integração **nascer e morrer** conforme a necessidade.
- 🔁 **Proxy reverso, agora gerenciado.** O mesmo `web.config` do front roda no Web App (é IIS por baixo), mas o "Enable proxy" do ARR — que na VM era um checkbox — no App Service vira um **`applicationHost.xdt`**. Mesma ideia, mecanismo PaaS.

---

## 🧭 5. A jornada do aluno

| Fase | Etapa | Tempo aprox. |
|---|---|---|
| **Fase 0** | Pré-requisitos (app nas VMs no ar + ferramentas instaladas) | 15 min |
| **Fase 1** | Desenho do estado-alvo PaaS + taxonomia | 10 min |
| **Fase 2** | Assessment sem appliance (TCO + readiness das ferramentas) | 15 min |
| **Fase 3** | Migrar **Backend** (API) → `app-prd-tk-bend` (App Service Migration Assistant) | 25 min |
| **Fase 4** | Migrar **Frontend** → `app-prd-tk-fend` (+ `applicationHost.xdt`) | 20 min |
| **Fase 5** | Migrar **Banco** → Azure SQL Database (SQL Migration extension, offline) | 30 min |
| **Fase 6** | Cutover de domínio + HTTPS gerenciado | 15 min |
| **Fase 7** | Smoke test ponta a ponta (100% PaaS) | 10 min |
| **Fase 8** | Decomissionar as VMs + comparação VM × PaaS | 10 min |
| **Fase 9** | Troubleshooting | livre |

> 🧠 **Total esperado:** ~1h30–2h de mão na massa. Reserve **2h30** na primeira execução.

---

### Fase 0 — Pré-requisitos

- [ ] **App rodando nas 3 VMs** (estado final do [`GUIA-EVENTO-VMS.md`](GUIA-EVENTO-VMS.md), pós-Fase 8). Confirme: `http(s)://<seu-domínio>` (ou `http://IP_FRONT`) abre e o login funciona.
- [ ] **As 3 VMs ligadas** (se você fez `deallocate`, suba de novo: `az vm start ...`). Você vai precisar delas como **origem** da migração.
- [ ] **Conta Azure ativa** — a mesma do guia anterior.
- [ ] **Bloco de notas** com o que você anotou na fase VM: `IP_DB` (privado da `vm-data`), `adminsql`/`Partiunuvem@2026`, `JWT_SECRET`, e o seu **domínio** (se fez a Fase 6 das VMs).
- [ ] **Ferramentas de migração** (baixe agora, instale nas fases indicadas):
  - **App Service Migration Assistant** — [appmigration.microsoft.com](https://appmigration.microsoft.com/) (instala na `vm-bend` na Fase 3 e na `vm-fend` na Fase 4).
  - **Azure Data Studio** — [aka.ms/azuredatastudio](https://aka.ms/azuredatastudio) (instala na `vm-data` na Fase 5; a extension **Azure SQL Migration** é adicionada dentro dele).

**Alerta de orçamento:** Portal → **Cost Management → Budgets → + Add** → **$20/mês**, alerta em 80% e 100% → seu e-mail. (O PaaS é barato, mas o hábito é bom.)

> 🌐 **Importante — mantenha a `vm-fend` ligada até a Fase 5.** Ela é o seu **jump host** para acessar a `vm-data` (privada). Você só desliga/apaga **todas** as VMs na Fase 8, depois que o banco migrar.

> ✅ **Pronto quando:** o app abre pelas VMs, as 3 VMs estão **Running**, e você tem os dois instaladores baixados.

---

### Fase 1 — Desenho do estado-alvo + taxonomia PaaS

> 🧠 **Mesma disciplina da fase VM: planta antes de tijolo.** Antes de criar recurso, fechamos **nomes** e **ordem de migração**. O instrutor apresenta o estado-alvo (o diagrama "depois" da §4) e debatemos as decisões.

#### 1.1 Taxonomia dos recursos PaaS

Mesmo padrão `<tipo>-<ambiente>-<carga>-<região>-<instância>` da fase VM. **Use estes nomes** (ajustando os globais com suas iniciais se necessário):

| Recurso | Nome | Região | Observação |
|---|---|---|---|
| Resource Group (PaaS) | `rg-prd-tik-paas-cin-001` | Central India | **separado** do `rg-prd-tik-cin-001` (VMs) — facilita apagar as VMs depois |
| App Service Plan | `asp-prd-tk-cin-001` | Central India | Windows, **B1** |
| Web App backend | `app-prd-tk-bend-cin-001` | Central India | **nome global** |
| Web App frontend | `app-prd-tk-fend-cin-001` | Central India | **nome global** |
| Azure SQL (servidor lógico) | `sql-prd-tk-cin-001` | Central India | **nome global** |
| Azure SQL Database | `FIFA2026Tickets` | — | mesmo nome do banco da VM |
| Database Migration Service | `dms-prd-tk-cin-001` | Central India | criado pela extension na Fase 5 |

#### 1.2 Ordem da migração (e por quê)

```
1. Backend (API)   vm-bend  ──▶ app-prd-tk-bend     (front ainda na VM aponta para o Web App novo)
2. Frontend        vm-fend  ──▶ app-prd-tk-fend     (back e front já em PaaS; banco ainda na VM)
3. Banco           vm-data  ──▶ Azure SQL Database  (tudo em PaaS; as 3 VMs podem cair)
```

- **Uma camada por vez** → se algo quebrar, você sabe exatamente onde.
- **Banco por último** → o dado fica autoritativo na VM até o corte final (menor risco).
- **Cada fase deixa o app funcional** → você pode parar em qualquer ponto.

> 💬 **Momento de debate:** alternativas válidas existem (migrar o banco primeiro elimina a VNet Integration temporária, por exemplo). Adotamos **back → front → db** por ser o padrão incremental mais usado em produção e por manter o dado na origem até o fim. Discuta o trade-off com o instrutor.

> ✅ **Pronto quando:** você tem a tabela de nomes fechada e entende **por que** migramos nesta ordem.

---

### Fase 2 — Assessment sem appliance (o "porquê")

> 🧠 **Antes de migrar, justifique.** Em projeto real, a migração começa com um **assessment**: quanto custa hoje, quanto custaria em PaaS, e o app é **compatível**? Fazemos isso **sem o appliance do Azure Migrate** — com a calculadora de custo e os relatórios que as próprias ferramentas já geram.

#### 2.1 TCO / Pricing Calculator (custo VM × PaaS)

1. Abra a **[Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)**.
2. **Cenário VM (hoje):** adicione **3× Virtual Machines** B2s (Windows) → veja o total (~$90/mês 24/7).
3. **Cenário PaaS (alvo):** adicione **1× App Service** (B1) + **1× Azure SQL Database** (Basic) → total (~$18/mês).
4. 📋 **Anote os dois números.** Essa diferença (e o fato de o PaaS **não exigir patch/operação**) é o seu **slide de motivação**.

> 💡 **Custo não é tudo.** Mesmo quando o preço é parecido, o PaaS remove **trabalho operacional** (patch de Windows, backup, hardening do IIS, alta disponibilidade). Isso é "custo total de propriedade" (TCO) — geralmente o argumento mais forte.

#### 2.2 Readiness do app (App Service Migration Assistant)

O *assessment* de compatibilidade do site vem **embutido** na ferramenta — você vai vê-lo no começo da Fase 3 (o assistant roda um **readiness check** antes de publicar). Não há passo separado aqui; é só saber que **a avaliação acontece dentro da ferramenta**.

#### 2.3 Readiness do banco (SQL Migration extension)

Idem para o banco: a extension tem uma etapa **Assess** que lista *blocking issues* e *warnings* da migração para Azure SQL Database. Você a executa no início da Fase 5.

> ✅ **Pronto quando:** você tem os dois números de custo anotados e entende que os relatórios de compatibilidade do app e do banco virão **dentro** das ferramentas (Fases 3 e 5).

---

### Fase 3 — Migrar o Backend (API) → Web App

> 🎯 **Objetivo:** substituir a `vm-bend` por `app-prd-tk-bend-cin-001`, mantendo front e banco onde estão. Ao final, o front (ainda na VM) passa a chamar o **Web App** novo.

#### 3.1 Criar o App Service Plan + o Web App backend (Portal)

1. Portal → busca **App Services** → **+ Create** → **Web App**.
2. **Resource group:** `rg-prd-tik-paas-cin-001` (crie agora, na própria tela) · **Name:** `app-prd-tk-bend-cin-001`
3. **Publish:** **Code** · **Runtime stack:** **Node 20 LTS** · **OS:** **Windows** ← (Windows mantém o **iisnode** e o `web.config` da sua API, igual à VM)
4. **Region:** **Central India** · **App Service Plan:** crie `asp-prd-tk-cin-001` · **Pricing plan:** **Basic B1**
5. **Review + create** → **Create**.

> 💡 **Por que Windows + Node?** A sua API roda em **iisnode** (IIS hospedando Node). O App Service **Windows** usa exatamente esse mecanismo por baixo — então o `web.config` da API e a estrutura `src/` funcionam **sem reescrever nada**. (No Linux a API rodaria em Node "puro", mais moderno, mas exigiria remover o `web.config`/iisnode — fica como evolução.)

#### 3.2 Habilitar HTTPS Only e TLS mínimo

No `app-prd-tk-bend-cin-001` → **Settings → Configuration** (ou **TLS/SSL settings**):
- **HTTPS Only:** **On**
- **Minimum TLS Version:** **1.2** · **FTP state:** **Disabled**

#### 3.3 VNet Integration — para o Web App alcançar a `vm-data` (ainda na VM)

O banco ainda está na `vm-data` (IP privado, outra região). Para o Web App falar com ele, ative **VNet Integration**.

1. Primeiro, crie uma **subnet dedicada** na VNet de app (o App Service exige uma subnet só dele): Portal → `vnet-prd-inf-cin-001` → **Subnets** → **+ Subnet** → **Name:** `snet-prd-inf-appsvc-cin-001` · **Range:** `10.20.3.0/24` · **Delegation:** **Microsoft.Web/serverFarms** → **Save**.
2. No `app-prd-tk-bend-cin-001` → **Settings → Networking** → **Outbound traffic → VNet integration** → **Add** → escolha `vnet-prd-inf-cin-001` / `snet-prd-inf-appsvc-cin-001`.
3. Ainda em Networking, garanta **Route All / Outbound internet traffic** habilitado para que o tráfego vá pela VNet (e alcance a outra região via **peering**).

> 💡 **Por que isso é necessário (por enquanto)?** Azure SQL terá endpoint público, mas o **SQL Server na VM não** — ele só responde no IP privado. A VNet Integration "pluga" o Web App na sua rede; o **peering global** (que você criou na fase VM) leva o pacote até a `vm-data` em Australia East. A NSG do banco já libera `1433` da faixa `10.20.0.0/16`, então **não precisa mexer no NSG**. Na **Fase 5** essa integração é removida.

#### 3.4 App Settings (as variáveis que estavam no `.env`)

No `app-prd-tk-bend-cin-001` → **Settings → Environment variables → App settings** → **+ Add** (uma por uma) → **Apply**:

| Nome | Valor |
|---|---|
| `DB_SERVER` | `<IP_DB>` (IP privado da `vm-data`, ex.: `10.30.1.4`) |
| `DB_PORT` | `1433` |
| `DB_USER` | `adminsql` |
| `DB_PASSWORD` | `Partiunuvem@2026` |
| `DB_NAME` | `FIFA2026Tickets` |
| `JWT_SECRET` | a mesma string longa que você usou na VM |
| `JWT_EXPIRES_IN` | `7d` |
| `FRONTEND_URL` | `*` (ajustamos para a URL do front na Fase 4) |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

> ⚠️ **Não existe `PORT=80` aqui.** No App Service **quem define a porta é a plataforma** — o iisnode injeta a porta certa e sua API já lê `process.env.PORT`. Por isso **não** adicione `PORT` nem `HOST` nas App Settings (deixe a plataforma mandar).

#### 3.5 Publicar a aplicação com o App Service Migration Assistant

1. **RDP na `vm-bend`** (via jump host `vm-fend`, como na fase VM) e instale lá o **App Service Migration Assistant** (baixado na Fase 0).
2. Abra o assistant → ele lista os **sites do IIS** → selecione **`FIFA2026-API`**.
3. **Readiness check** → revise o relatório (este é o *assessment* do app da Fase 2).
4. **Sign in** no Azure → em vez de criar um site novo, **selecione o Web App existente** `app-prd-tk-bend-cin-001` como destino → **Migrate**.
5. O assistant empacota o conteúdo de `C:\inetpub\wwwroot\fifa2026-api` (incluindo `web.config` e `node_modules`) e publica no Web App.

> 🧩 **O assistant é focado em ASP.NET — e a minha API é Node?** Ele lida muito bem com o **empacotamento do site IIS** (arquivos + bindings + `web.config`). Para a API Node, depois de publicar **confirme** que o runtime do Web App está em **Node** (Fase 3.1) e que o `web.config` chegou. _Plano B (se o fluxo do assistant não fechar para o seu caso):_ publique o mesmo conteúdo por **zip deploy** — na `vm-bend`, compacte a pasta e rode `az webapp deploy -g rg-prd-tik-paas-cin-001 -n app-prd-tk-bend-cin-001 --src-path fifa2026-api.zip --type zip`. O resultado é idêntico.

#### 3.6 Testar o backend novo (isolado, pelo endereço do Web App)

Do seu computador:

```powershell
$BEND = "https://app-prd-tk-bend-cin-001.azurewebsites.net"
Invoke-RestMethod "$BEND/api/health"          # OK
Invoke-RestMethod "$BEND/api/health/db"        # deve mostrar connected:true
(Invoke-RestMethod "$BEND/api/matches").matches.Count   # 104
```

> 💡 **O `/api/health/db` é seu melhor amigo aqui.** Se vier `ETIMEOUT/ESOCKET` → a VNet Integration/peering não está roteando até a `vm-data` (reveja 3.3). Se vier `ELOGIN` → confira `DB_USER`/`DB_PASSWORD` nas App Settings. **Mudou App Setting? O Web App reinicia sozinho** (diferente do iisnode na VM, que exigia `iisreset`).

#### 3.7 Reapontar o front (ainda na VM) para o Web App backend

A `vm-fend` ainda serve o site e faz proxy `/api/*` para a `vm-bend`. Troque o destino para o Web App:

1. **RDP na `vm-fend`** → edite o `web.config` do front:
   ```powershell
   cd C:\inetpub\wwwroot\fifa2026-web
   (Get-Content web.config) -replace 'http://<IP_BACK>','https://app-prd-tk-bend-cin-001.azurewebsites.net' | Set-Content web.config
   ```
   _(troque `<IP_BACK>` pelo IP privado que estava lá, ex.: `http://10.20.2.4`.)_
2. `iisreset` na `vm-fend`.

> ✅ **Pronto quando:** abrindo o app pela `vm-fend` (`http://IP_FRONT`), tudo funciona **mas o `/api` agora é servido pelo Web App**. Confirme: o `/api/health` responde mesmo com a **`vm-bend` desligada** — pode fazer `az vm deallocate -g rg-prd-tik-cin-001 -n vm-prd-tk-bend-cin-001` e testar de novo. 🎉 Uma VM a menos.

---

### Fase 4 — Migrar o Frontend → Web App

> 🎯 **Objetivo:** substituir a `vm-fend` por `app-prd-tk-fend-cin-001`. O front é estático + um `web.config` que faz **proxy reverso** de `/api/*` para o backend. A pegadinha desta fase é **habilitar o proxy no App Service**.

#### 4.1 Criar o Web App frontend (Portal)

1. Portal → **App Services** → **+ Create** → **Web App**.
2. **Resource group:** `rg-prd-tik-paas-cin-001` · **Name:** `app-prd-tk-fend-cin-001`
3. **Publish:** **Code** · **Runtime:** **Node 20 LTS** · **OS:** **Windows** · **Plan:** o mesmo `asp-prd-tk-cin-001` (o B1 hospeda os dois apps).
4. **Create** → depois ligue **HTTPS Only** + **TLS 1.2** (como em 3.2).

> 💡 **Mesmo plano, dois apps.** O App Service Plan é o "servidor"; cada Web App é um "site" nele. B1 acomoda os dois tranquilamente — você não paga a mais por isso.

#### 4.2 Publicar o conteúdo com o App Service Migration Assistant

1. **RDP na `vm-fend`** → instale o **App Service Migration Assistant**.
2. Selecione o site **`FIFA2026-Web`** → **readiness** → **Sign in** → destino = `app-prd-tk-fend-cin-001` → **Migrate**.
3. Ele publica `C:\inetpub\wwwroot\fifa2026-web` (HTML/JS/CSS + `web.config`).

> 🧩 **Plano B (zip deploy), se preferir:** compacte a pasta `fifa2026-web` e `az webapp deploy -g rg-prd-tik-paas-cin-001 -n app-prd-tk-fend-cin-001 --src-path fifa2026-web.zip --type zip`.

#### 4.3 Confirmar o destino do proxy no `web.config`

O `web.config` do front precisa apontar o `/api/*` para o **backend Web App** (não mais para o IP da VM). Se você já fez isso na Fase 3.7, o conteúdo publicado já vem certo. Confirme via **Kudu**: abra `https://app-prd-tk-fend-cin-001.scm.azurewebsites.net/DebugConsole` → navegue até `site/wwwroot/web.config` → a regra **Rewrite** deve mostrar `https://app-prd-tk-bend-cin-001.azurewebsites.net/...`.

#### 4.4 ⭐ Habilitar o proxy reverso (a pegadinha do App Service)

Na VM, você marcou **"Enable proxy"** no ARR (um checkbox). **No App Service não existe esse checkbox** — você habilita o proxy do ARR com um arquivo de transformação **`applicationHost.xdt`**.

1. No **Kudu** (`...scm.azurewebsites.net/DebugConsole`) navegue até a pasta **`site`** (ou seja, `D:\home\site\` — **um nível acima** de `wwwroot`).
2. Crie um arquivo **`applicationHost.xdt`** com este conteúdo:
   ```xml
   <?xml version="1.0"?>
   <configuration xmlns:xdt="http://schemas.microsoft.com/XML-Document-Transform">
     <system.webServer>
       <proxy xdt:Transform="InsertIfMissing" enabled="true"
              preserveHostHeader="false"
              reverseRewriteHostInResponseHeaders="false" />
     </system.webServer>
   </configuration>
   ```
3. **Reinicie** o Web App (Portal → `app-prd-tk-fend-cin-001` → **Restart**).

> ⚠️ **Sem o `applicationHost.xdt`, o `/api/*` retorna 404/502.** Esse é o **erro nº 1** desta fase — o equivalente PaaS de esquecer o "Enable proxy" no ARR da VM. O arquivo vai em **`site/`**, **não** em `site/wwwroot/`.

> 💡 **Por que um XDT e não editar o ApplicationHost.config?** No App Service você **não tem acesso** ao `ApplicationHost.config` do servidor (é gerenciado). O `applicationHost.xdt` é o jeito **suportado** de aplicar uma transformação nele só para o seu site, na inicialização.

#### 4.5 Ajustar o CORS / `FRONTEND_URL` do backend

Agora que o front tem URL definitiva, atualize o backend para liberá-la:

- `app-prd-tk-bend-cin-001` → **App settings** → `FRONTEND_URL` = `https://app-prd-tk-fend-cin-001.azurewebsites.net` → **Apply** (reinicia sozinho).

#### 4.6 Testar o front novo

Do seu computador, abra **`https://app-prd-tk-fend-cin-001.azurewebsites.net`**:
- [ ] A home carrega (jogos/estádios)
- [ ] Login `admin@fifa2026.com` / `admin123`
- [ ] Lista 104 jogos
- [ ] Compra de ingresso até o QR code

> ✅ **Pronto quando:** o app inteiro responde pela URL `*.azurewebsites.net` do front, com `/api` funcionando via proxy. Agora a `vm-fend` é descartável — mas **não a desligue ainda** (ela é jump host para a Fase 5). 🎉 Duas VMs (logicamente) a menos.

---

### Fase 5 — Migrar o Banco → Azure SQL Database

> 🎯 **Objetivo:** substituir o SQL Server da `vm-data` por um **Azure SQL Database**, usando a **Azure SQL Migration extension** do Azure Data Studio. Esta é a parte mais "de verdade" da migração — mover **dados**, não código.

> 🟦🟩 **Sobre "downtime mínimo":** para o destino **Azure SQL Database**, a extension faz migração **offline** (o modo *online*, com sincronização contínua, só existe para Managed Instance / SQL em VM). Como nosso banco é **pequeno** (104 jogos, ~3 MB) e o compute (front+API) **já está em PaaS e no ar**, o downtime real é só a **janela curta de carga** + o reapontar da connection string. É o padrão **blue/green**: o ambiente novo sobe ao lado, e o corte é rápido.

#### 5.1 Provisionar o Azure SQL Database (Portal)

1. Portal → busca **SQL databases** → **+ Create**.
2. **Resource group:** `rg-prd-tik-paas-cin-001` · **Database name:** `FIFA2026Tickets`
3. **Server:** **Create new** → **Server name:** `sql-prd-tk-cin-001` (global!) · **Location:** **Central India** · **Authentication:** **Use SQL authentication** · **Admin login:** `sqladmin` · **Password:** crie forte e 📋 **anote** (rótulo: *Azure SQL admin*).
4. **Compute + storage:** **Configure** → **Basic** (~$5/mês, suficiente para o workshop).
5. **Networking** (aba): **Connectivity method:** **Public endpoint** · **Allow Azure services... :** **Yes** · **Add current client IP:** **Yes** → **Review + create** → **Create**.

> 💡 **"Allow Azure services" liga o quê?** Cria uma regra de firewall (`0.0.0.0`) que deixa **outros serviços Azure** (como o seu Web App backend) conectarem ao banco pelo endpoint público. O **"current client IP"** libera o **seu** IP para a migração rodar.

#### 5.2 Instalar Azure Data Studio + a extension na `vm-data`

1. **RDP na `vm-data`** (via jump host `vm-fend`).
2. Instale o **Azure Data Studio** (baixado na Fase 0).
3. Em Azure Data Studio → **Extensions** (Ctrl+Shift+X) → busque **"Azure SQL Migration"** → **Install**.

> 💡 **Por que rodar na própria `vm-data`?** A `vm-data` é privada e tem o SQL como `localhost`. Rodando a ferramenta **nela**, a conexão de origem é local e o **Integration Runtime** (próximo passo) sai pela internet (443) direto para o Azure — sem expor a VM.

#### 5.3 Rodar o wizard de migração (Assess → schema → migrate)

1. Em Azure Data Studio, conecte ao SQL de origem: **Server:** `localhost` · **SQL Login:** `adminsql` / `Partiunuvem@2026`.
2. Clique com o direito no servidor → **Manage** → painel **Azure SQL Migration** → **Migrate to Azure SQL**.
3. **Selecione o banco** `FIFA2026Tickets`.
4. **Assess** → revise *issues/warnings* (o *assessment* do banco da Fase 2). Para Azure SQL Database, espere avisos leves; não deve haver bloqueio para este schema.
5. **Azure SQL target:** faça **Sign in**, escolha a subscription, o servidor `sql-prd-tk-cin-001` e o banco `FIFA2026Tickets`.
6. **Migration mode:** **Offline** (única opção para Azure SQL Database).
7. **Integration Runtime:** crie um **Database Migration Service** (`dms-prd-tk-cin-001`) e, quando pedido, **instale o self-hosted Integration Runtime na `vm-data`** (o wizard dá o link do instalador + as **2 chaves de autenticação**; cole uma chave para registrar). Ele conecta a origem local ao Azure.
8. **Start migration** → o serviço **cria o schema** no Azure SQL e depois **carrega os dados** (offline). Acompanhe o progresso no próprio painel.

> 🧩 **Plano B (mais simples, você já conhece):** se o Integration Runtime/DMS travar no tempo do evento, use o **`.bacpac`** — Portal → `sql-prd-tk-cin-001` → **Import database** → aponte o `FIFA2026Tickets.bacpac` (o mesmo da fase VM, no Blob). É offline também, mas dispensa IR/DMS. A extension é o caminho "assistido de verdade"; o bacpac é o atalho.

#### 5.4 Reapontar o backend para o Azure SQL + remover a VNet Integration

Com os dados no Azure SQL, atualize o backend e **corte a dependência da VM**:

1. `app-prd-tk-bend-cin-001` → **App settings** → atualize:
   - `DB_SERVER` = `sql-prd-tk-cin-001.database.windows.net`
   - `DB_USER` = `sqladmin` · `DB_PASSWORD` = *(a senha do Azure SQL admin)*
   - (`DB_NAME` e `DB_PORT` continuam `FIFA2026Tickets` / `1433`)
   - **Apply** (reinicia).
2. **Remova a VNet Integration** (não precisa mais — Azure SQL é público com firewall): `app-prd-tk-bend-cin-001` → **Networking** → **VNet integration** → **Disconnect**.

#### 5.5 Validar

```powershell
$BEND = "https://app-prd-tk-bend-cin-001.azurewebsites.net"
Invoke-RestMethod "$BEND/api/health/db"        # connected:true, agora apontando para .database.windows.net
(Invoke-RestMethod "$BEND/api/matches").matches.Count   # 104
```

> ✅ **Pronto quando:** `/api/health/db` conecta no `*.database.windows.net` e o app funciona **100% em PaaS**, com a `vm-data` **desligada**. As 3 VMs agora são história. 🎉🎉🎉

---

### Fase 6 — Cutover de domínio + HTTPS gerenciado

> 🎯 **Objetivo:** apontar o seu **domínio** (o mesmo da Fase 6 das VMs) para o **front Web App** e ganhar **HTTPS gerenciado de graça** — sem Posh-ACME, sem renovar TXT a cada 90 dias.

> 📝 **Sem domínio próprio?** Pule esta fase — o app já tem HTTPS válido em `https://app-prd-tk-fend-cin-001.azurewebsites.net` (certificado do Azure). A Fase 6 é o "acabamento" com domínio customizado.

#### 6.1 Apontar o DNS para o Web App

Na zona DNS do seu domínio (Azure DNS, da fase VM):
1. Crie um registro **CNAME** (ex.: `www`) → **valor:** `app-prd-tk-fend-cin-001.azurewebsites.net`.
2. Crie um registro **TXT** de verificação **`asuid.www`** → valor = o **Custom Domain Verification ID** do Web App (Portal → `app-prd-tk-fend-cin-001` → **Custom domains** → mostra o ID).

#### 6.2 Adicionar o domínio customizado + certificado gerenciado

1. `app-prd-tk-fend-cin-001` → **Custom domains** → **+ Add custom domain** → digite `www.<seu-domínio>` → **Validate** → **Add**.
2. Ainda em **Custom domains**, no domínio recém-adicionado → **Add binding** → **Create App Service Managed Certificate** (grátis) → **TLS/SSL** → **SNI SSL**.

> 💡 **HTTPS gerenciado vs Let's Encrypt na VM.** Na VM você emitiu e instalou o certificado **à mão** (Posh-ACME, desafios TXT, binding no IIS) e teria que **renovar a cada 90 dias**. No App Service, o **App Service Managed Certificate** é emitido e **renovado automaticamente** pela plataforma. Mesmo resultado (cadeado válido), zero manutenção.

#### 6.3 Atualizar o CORS para o domínio final

- `app-prd-tk-bend-cin-001` → **App settings** → `FRONTEND_URL` = `https://www.<seu-domínio>` → **Apply**.

> ✅ **Pronto quando:** `https://www.<seu-domínio>` abre o app com **cadeado válido** e o login funciona.

---

### Fase 7 — Smoke test ponta a ponta (100% PaaS)

Teste do **seu computador**, com a internet real, na URL final (domínio ou `*.azurewebsites.net`).

#### 7.1 No navegador

- [ ] A **home** carrega (104 jogos)
- [ ] **Login** `admin@fifa2026.com` / `admin123`
- [ ] **Cadastre** um usuário novo → **login**
- [ ] **Compre um ingresso** → recebe o ingresso premium com **QR code**
- [ ] **Página de validação** do ingresso → "válido"
- [ ] **Painel admin** (vendas/usuários) abre

#### 7.2 PowerShell — validação automatizada

```powershell
$APP = "https://www.<seu-domínio>"   # ou https://app-prd-tk-fend-cin-001.azurewebsites.net

Invoke-WebRequest $APP -UseBasicParsing | Select-Object StatusCode      # 200
Invoke-RestMethod "$APP/api/health"                                      # OK (via proxy do front)
$body = @{ email='admin@fifa2026.com'; password='admin123' } | ConvertTo-Json
$r = Invoke-RestMethod "$APP/api/auth/login" -Method POST -ContentType 'application/json' -Body $body
$h = @{ Authorization = "Bearer $($r.token)" }
(Invoke-RestMethod "$APP/api/matches" -Headers $h).matches.Count          # 104
```

> 🏁 **Conseguiu?** Você migrou uma aplicação 3 camadas de **3 VMs** para **PaaS puro** — Web Apps + Azure SQL — com ferramentas assistidas, blue/green e cutover. **Muito bem!** 🎉

---

### Fase 8 — Decomissionar as VMs + comparação VM × PaaS

> 🧹 **Agora sim: apaga as VMs.** Com tudo validado em PaaS, o ambiente VM não serve mais a nada — é só custo.

#### 8.1 Apagar o Resource Group das VMs

Pelo **Azure Cloud Shell**:
```bash
az group delete --name rg-prd-tik-cin-001 --yes --no-wait
```

Isso apaga, em bloco: 3 VMs + 3 discos + 3 NICs + 2 NSGs + **2 VNets (com o peering)** + IPs públicos — em ambas as regiões. **O `rg-prd-tik-paas-cin-001` (PaaS) permanece** rodando o app.

> ⚠️ **Confirme o PaaS no ar ANTES de apagar.** Refaça o smoke test da Fase 7. Só apague as VMs depois que o app responder 100% por PaaS — esse é o ponto de não-retorno do blue/green.

#### 8.2 (Fim do evento) Apagar também o PaaS

Quando não precisar mais de nada:
```bash
az group delete --name rg-prd-tik-paas-cin-001 --yes --no-wait
```
Apaga os 2 Web Apps + o plano + o Azure SQL + o DMS. **Custo zero a partir daqui.**

#### 8.3 A lição: VM × PaaS lado a lado

| Dimensão | Cenário VM (guia anterior) | Cenário PaaS (este guia) |
|---|---|---|
| 🖥️ **Compute** | 3 VMs B2s que você opera | App Service Plan B1 gerenciado |
| 🩹 **Patch de OS** | **Seu problema** (Windows Update) | Plataforma faz por você |
| 🌐 **TLS/HTTPS** | Emitir + renovar à mão (90 dias) | **Certificado gerenciado**, renovação automática |
| 🔁 **Proxy reverso** | ARR "Enable proxy" (checkbox) | `applicationHost.xdt` (1 arquivo) |
| 🗄️ **Banco** | SQL Server que você instala/opera | Azure SQL: backup/HA/patch nativos |
| 🚀 **Deploy** | RDP + copiar arquivos + `iisreset` | Publicar (assistant/zip); reinício automático |
| 📈 **Escala** | Redimensionar a VM (downtime) | **Scale up/out** com clique |
| 💰 **Custo (24/7)** | ~$90/mês | ~$18/mês |
| 🧅 **Segurança** | NSG + jump host + você fecha tudo | Endpoint gerenciado + firewall + (evolução: Private Endpoint) |

> 🧠 **A grande sacada:** PaaS não é "melhor" em tudo de forma absoluta — VM dá **controle total** (e responsabilidade total). PaaS troca controle por **menos trabalho operacional**. Saber **quando usar cada um** é o que esta dupla de guias ensina.

> ✅ **Pronto quando:** o RG das VMs foi apagado, o app continua no ar em PaaS, e você consegue **explicar** as diferenças da tabela acima.

---

### Fase 9 — Troubleshooting

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Front no Web App abre, mas `/api/*` dá **404/502** | Falta o `applicationHost.xdt` (proxy do ARR não habilitado) | Crie `site/applicationHost.xdt` (Fase 4.4) **em `site/`, não `wwwroot/`** + **Restart** |
| `/api/*` proxia, mas backend dá **500** | App Settings erradas, ou `web.config`/`node_modules` não vieram no deploy | Veja **Log stream** (Portal → backend → **Monitoring → Log stream**); confirme as App Settings (3.4); republique se faltou conteúdo |
| `/api/health/db` dá **ETIMEOUT/ESOCKET** (Fase 3) | VNet Integration/peering não roteia até a `vm-data` | Confirme a subnet delegada `Microsoft.Web/serverFarms` + **Route All** (3.3); peering das VNets `Connected`; NSG do banco libera `1433` de `10.20.0.0/16` |
| `/api/health/db` dá **ETIMEOUT** (Fase 5, já no Azure SQL) | Firewall do Azure SQL sem "Allow Azure services" | `sql-prd-tk-cin-001` → **Networking** → **Allow Azure services = Yes** |
| `/api/health/db` dá **ELOGIN** | `DB_USER`/`DB_PASSWORD` não batem com o destino | Antes da Fase 5: `adminsql`/`Partiunuvem@2026` (VM). Depois: `sqladmin`/senha do Azure SQL |
| App Service Migration Assistant **não acha o site** | Rodando fora da VM de origem, ou IIS parado | Instale e rode o assistant **dentro** da `vm-bend`/`vm-fend`; confirme o site no IIS Manager |
| Mudei App Setting e **nada mudou** | Cache de instância | App Settings reiniciam o app, mas force um **Restart** se preciso. (No App Service **não** existe `iisreset`.) |
| Migração do banco trava no **Integration Runtime** | IR não registrado/sem saída 443 | Reinstale o IR na `vm-data` com a chave do wizard; ou use o **Plano B do `.bacpac`** (5.3) |
| Domínio customizado **não valida** | Registro `asuid` TXT/CNAME não propagou | `Resolve-DnsName asuid.www.<domínio> -Type TXT -Server 8.8.8.8`; aguarde a propagação e revalide |

> 📚 **Diagnóstico de banco:** o endpoint `/api/health/db` continua sendo o melhor sinal — ele devolve o erro real (`code`) e a config em uso, igual na fase VM. A diferença é que aqui você lê os logs no **Log stream** do Portal, não em arquivo na VM.

---

## 📊 6. Tabela de variáveis e segredos

**Anotações que você carrega da fase VM + as novas do PaaS** (mantenha fora do Git):

| Onde | Nome | Origem / Exemplo |
|---|---|---|
| 🔢 | *IP_DB* | IP privado da `vm-data` (`10.30.1.x`) — usado nas App Settings do backend **até a Fase 5** |
| 🔐 | *SQL/VM adminsql* | `adminsql` / `Partiunuvem@2026` — origem do banco (VM) |
| 🔐 | *Azure SQL admin* | `sqladmin` / *(senha que você criou na Fase 5.1)* — destino do banco (PaaS) |
| 🔐 | *JWT_SECRET* | a mesma string longa da fase VM |
| 🌐 | *Backend Web App* | `https://app-prd-tk-bend-cin-001.azurewebsites.net` |
| 🌐 | *Frontend Web App* | `https://app-prd-tk-fend-cin-001.azurewebsites.net` |
| 🌐 | *Azure SQL FQDN* | `sql-prd-tk-cin-001.database.windows.net` |
| 🌐 | *Domínio final* | `https://www.<seu-domínio>` (Fase 6) |

**App Settings do `app-prd-tk-bend-cin-001`** (substituem o `.env` da VM):

`DB_SERVER` · `DB_PORT` · `DB_USER` · `DB_PASSWORD` · `DB_NAME` · `JWT_SECRET` · `JWT_EXPIRES_IN` · `FRONTEND_URL` · `WEBSITE_NODE_DEFAULT_VERSION`

> 🔒 **Regra de ouro (continua valendo):** segredo nunca vai para o código nem para o repositório. Aqui eles saíram do `.env` na VM e foram para as **App Settings** do Web App — melhor, mas ainda em texto na configuração. _Próximo nível (§7):_ **Key Vault + Managed Identity**, onde o app lê o segredo sem nunca tê-lo na config.

---

## 🛡️ 7. Evolução (o "próximo nível" do PaaS)

> 🧠 **Tópico de aprendizado — não é passo do workshop.** O que você montou **funciona e ensina a jornada**. Mas, como sempre, o arquiteto pergunta: *"o que falta para produção de verdade?"*

O ambiente PaaS já entrega backups, HA e patch gerenciados. Um time de produção ainda adicionaria:

1. **🔐 Azure Key Vault + Managed Identity** — tirar `DB_PASSWORD`/`JWT_SECRET` das App Settings. O Web App ganha uma **identidade gerenciada** e lê os segredos do Key Vault via *reference* — sem senha em lugar nenhum visível.
2. **🔒 Private Endpoints + VNet Integration (rede privada)** — em vez de endpoints públicos com firewall, a **API** e o **banco** passam a ter IP **privado** na sua VNet, e só o **frontend** continua público. Internet **nenhuma** fala com API ou banco. **Já existe guia dedicado:** [`GUIA-EVENTO-REDE-PRIVADA.md`](GUIA-EVENTO-REDE-PRIVADA.md) — Portal-first, passo a passo, **sem mudar uma linha de código**.
3. **📊 Application Insights** — telemetria de requisições, falhas e performance do app, sem instalar agente. Você "enxerga" o app em produção.
4. **🚦 Access Restrictions / Front Door + WAF** — restringir o backend para só aceitar tráfego do front (ou de um Front Door com WAF na borda, filtrando ataques antes de chegar no app).
5. **🤖 CI/CD com GitHub Actions (OIDC)** — em vez de publicar pelo assistant/zip à mão, um pipeline faz **build + deploy** a cada push, com autenticação sem segredo (OIDC). _(Os workflows já existem no repo — veja `.github/workflows/`.)_

> 🧠 **Lembre do escopo:** estes itens são o **endurecimento e a automação** do ambiente PaaS — assunto de uma próxima etapa. A jornada **VM → PaaS** em si você acabou de completar.

---

> 🏁 _Documento vivo — atualizado conforme o evento se aproxima (nomes globais finais, domínio, contagens). **Do gramado para a nuvem: bola rolando!**_ ⚽🏆☁️
