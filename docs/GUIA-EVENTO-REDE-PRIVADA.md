# 🔒 Copa do Mundo Azure — Guia do Evento TFTEC (FIFA 2026 Tickets — rede privada: Private Endpoints + VNet Integration)

> ⚽ **Prorrogação!** Nos guias anteriores você subiu a aplicação em **3 VMs** ([`GUIA-EVENTO-VMS.md`](GUIA-EVENTO-VMS.md)) e depois a **modernizou para PaaS** ([`GUIA-EVENTO-MODERNIZACAO.md`](GUIA-EVENTO-MODERNIZACAO.md)). Ao final daquela jornada, tudo roda em **Web Apps + Azure SQL Database** — porém com **endpoints públicos** (protegidos por firewall, mas expostos à internet). Aqui você dá o passo final de produção: **fechar a porta da frente** de tudo que não precisa ser público.
>
> 🥅 **A meta:** só o **frontend** continua público. A **API** e o **banco** passam a viver **dentro da sua VNet**, alcançáveis apenas por **IP privado** — invisíveis para a internet. E o melhor: **sem tocar em uma linha de código da aplicação.**

> 🚧 **Documento vivo.** Itens marcados com _⚠️ a confirmar_ serão fixados conforme o evento se aproxima. A arquitetura e os passos já valem.

> 🧩 **Pré-requisito deste guia:** ter concluído o [`GUIA-EVENTO-MODERNIZACAO.md`](GUIA-EVENTO-MODERNIZACAO.md) — a aplicação **precisa estar 100% em PaaS** (front + API em Web Apps no plano `asp-prd-tk-cin-001`, banco em `sql-prd-tk-cin-001`). É **desse** estado que partimos.

> 💡 **Por que isso é uma etapa separada?** Modernizar (VM → PaaS) e **privatizar a rede** são dois problemas distintos. O primeiro troca *onde* a app roda; o segundo troca *quem consegue alcançá-la*. Mantê-los separados deixa cada lição limpa.

---

## 📋 Índice

1. [Sobre esta etapa](#-1-sobre-esta-etapa)
2. [O conceito-chave: inbound × outbound](#-2-o-conceito-chave-inbound--outbound)
3. [Arquitetura: antes e depois](#-3-arquitetura-antes-e-depois)
4. [Recursos e taxonomia](#-4-recursos-e-taxonomia)
5. [A jornada do aluno](#-5-a-jornada-do-aluno)
   - [Fase 0 — Pré-requisitos](#fase-0--pré-requisitos)
   - [Fase 1 — Desenho do estado-alvo de rede](#fase-1--desenho-do-estado-alvo-de-rede)
   - [Fase 2 — Preparar a rede (subnets)](#fase-2--preparar-a-rede-subnets)
   - [Fase 3 — Separar a API em seu próprio App Service Plan](#fase-3--separar-a-api-em-seu-próprio-app-service-plan)
   - [Fase 4 — Private Endpoint do Azure SQL](#fase-4--private-endpoint-do-azure-sql)
   - [Fase 5 — VNet Integration da API → SQL privado](#fase-5--vnet-integration-da-api--sql-privado)
   - [Fase 6 — Private Endpoint da API + desligar o público](#fase-6--private-endpoint-da-api--desligar-o-público)
   - [Fase 7 — VNet Integration do Front → API privada](#fase-7--vnet-integration-do-front--api-privada)
   - [Fase 8 — Smoke test + considerações operacionais](#fase-8--smoke-test--considerações-operacionais)
   - [Fase 9 — Troubleshooting + custo/teardown](#fase-9--troubleshooting--custoteardown)
6. [Tabela de variáveis e recursos](#-6-tabela-de-variáveis-e-recursos)
7. [Comparação: público × privado](#️-7-comparação-público--privado)

---

## 🔒 1. Sobre esta etapa

No fim da modernização, o tráfego era assim: `Internet → front (público) → API (pública) → SQL (público + firewall)`. Funciona — mas **três superfícies** estão na internet. Em produção real, a regra é **expor o mínimo**: só o que **precisa** receber tráfego do mundo (o frontend).

Esta etapa aplica dois recursos do **Azure Private Link / Networking** para privatizar o resto:

- 🔌 **Private Endpoint** — dá ao recurso (API, SQL) um **IP privado** dentro da sua VNet e **desliga o acesso público** dele.
- 🌐 **VNet Integration** — pluga um Web App na VNet para ele **alcançar** esses IPs privados (tráfego de **saída**).

O resultado é **defesa em profundidade de verdade**: a API e o banco simplesmente **não respondem pela internet** — nem com firewall, eles não têm rota pública.

> 🧠 **A grande sacada (já vista na conversa de arquitetura):** isso é **transparente para a aplicação**. O app continua pedindo os mesmos nomes (`app-...-bend.azurewebsites.net`, `sql-...database.windows.net`); o que muda é **para onde esses nomes resolvem** (IP privado, via Private DNS). Você privatiza um app **sem reabrir o código**.

---

## 🧭 2. O conceito-chave: inbound × outbound

Quase todo erro nesta etapa vem de confundir os dois. Grave isto:

| Recurso | Direção | Para que serve | Efeito colateral |
|---|---|---|---|
| 🔌 **Private Endpoint** | **Inbound** (entrada) | Dá um IP privado para **receber** conexões | **Desliga o acesso público** do recurso |
| 🌐 **VNet Integration** | **Outbound** (saída) | Permite o Web App **alcançar** a VNet | Não muda como o app é acessado |

**Em cada salto privado você precisa dos DOIS, em pontas opostas:**

```
   Front  ──[VNet Integration: saída]──▶  [Private Endpoint da API: entrada]  ──▶  API
   API    ──[VNet Integration: saída]──▶  [Private Endpoint do SQL: entrada]  ──▶  SQL
```

> 💡 **Analogia:** o **Private Endpoint** é a *porta privada* do prédio (só abre pra dentro). A **VNet Integration** é o *crachá* que deixa o app **entrar no condomínio** (a VNet) para chegar até essa porta. Sem crachá, ele bate na porta pública (que você trancou) e leva timeout.

E a peça que faz os nomes resolverem certo:

- 🧭 **Private DNS Zone** — `privatelink.azurewebsites.net` (para a API) e `privatelink.database.windows.net` (para o SQL). Ligadas à VNet, elas fazem o **FQDN público** resolver para o **IP privado**. **Sem isso, nada funciona** — é o erro nº 1.

---

## 🗺️ 3. Arquitetura: antes e depois

### Antes — fim da modernização (tudo PaaS, endpoints públicos)

```
                 Internet
                    │
        ┌───────────┼───────────────┬───────────────────┐
        ▼           ▼               ▼                    (3 superfícies públicas)
   app-...-fend  app-...-bend   Azure SQL
   (público)     (público)      (público + firewall)
```

### Depois — só o front é público

```
                 Internet
                    │ 443  (ÚNICA porta pública)
                    ▼
   ┌──────────────────────────────┐
   │  app-...-fend  (Frontend)    │  Plano A · público
   │  + VNet Integration ─────────┼──┐ saída p/ a VNet
   └──────────────────────────────┘  │
                                      ▼  Private DNS → IP privado
   ┌──────────────────────────────┐  │
   │  PE da API (IP privado)      │◀─┘
   │   └─ app-...-bend (API)      │  Plano B · público DESLIGADO
   │  + VNet Integration ─────────┼──┐ saída p/ a VNet
   └──────────────────────────────┘  │
                                      ▼  Private DNS → IP privado
   ┌──────────────────────────────┐  │
   │  PE do SQL (IP privado)      │◀─┘
   │   └─ Azure SQL Database      │  público DESLIGADO
   └──────────────────────────────┘
```

> 🧅 **Defesa em profundidade real.** Mesmo que alguém descubra os nomes `app-...-bend.azurewebsites.net` ou `sql-...database.windows.net`, eles **não resolvem para nada acessível** fora da sua VNet. A internet conversa **só** com o frontend.

**Princípios de design (e o que isso ensina):**

- 🔁 **Zero mudança de código.** Os FQDNs continuam idênticos; só a **resolução DNS** muda (público → privado). O certificado `*.azurewebsites.net` segue válido (mesmo nome).
- 🟦🟩 **Privatizar sem downtime.** A ordem das fases é pensada para que **o app nunca caia no meio**: criamos o caminho privado e validamos **antes** de desligar o público.
- 🏗️ **Dois planos de App Service.** O front e a API saem do plano único e passam a **planos separados** — exigência técnica (PE entre apps do mesmo plano não roteia bem) e boa prática (escalam independente).

---

## ☁️ 4. Recursos e taxonomia

Tudo na **VNet de app que você já tem** (`vnet-prd-inf-cin-001`, `10.20.0.0/16`, Central India) e no RG PaaS (`rg-prd-tik-paas-cin-001`). Seguimos a taxonomia dos guias anteriores.

| Recurso | Nome | Faixa / Observação | Custo |
|---|---|---|---|
| 🧩 Subnet de Private Endpoints | `snet-prd-inf-pe-cin-001` | `10.20.5.0/24` · *PE network policies* desabilitadas | Grátis |
| 🧩 Subnet de integração — Front | `snet-prd-inf-appf-cin-001` | `10.20.4.0/24` · delegada `Microsoft.Web/serverFarms` | Grátis |
| 🧩 Subnet de integração — API | `snet-prd-inf-appsvc-cin-001` | `10.20.3.0/24` · **reusa** a criada na modernização (já delegada) | Grátis |
| 📕 App Service Plan — API | `asp-prd-tk-bend-cin-001` | Windows **B1** · plano novo só da API | ~$13/mês |
| 🔌 Private Endpoint — API | `pe-prd-tk-bend-cin-001` | IP privado da API (em `snet-pe`) | ~$7,30/mês + dados |
| 🔌 Private Endpoint — SQL | `pe-prd-tk-sql-cin-001` | IP privado do SQL (em `snet-pe`) | ~$7,30/mês + dados |
| 🧭 Private DNS Zone — Web App | `privatelink.azurewebsites.net` | ligada à VNet (Portal cria/associa) | ~centavos |
| 🧭 Private DNS Zone — SQL | `privatelink.database.windows.net` | ligada à VNet (Portal cria/associa) | ~centavos |

> 💰 **Custo do incremento:** ~**$28/mês** sobre o PaaS público (+1 plano B1, +2 Private Endpoints, +DNS). Para um evento, **provisiona, demonstra e derruba** (Fase 9) — fica em centavos. Configure o alerta de orçamento se ainda não tiver.

> 🌐 **Faixas livres?** As subnets de app existentes são `10.20.1.0/24` (fend), `10.20.2.0/24` (bend) e `10.20.3.0/24` (appsvc, da modernização). Por isso usamos `.4` e `.5` para as novas. Se o seu desenho diferiu, ajuste as faixas — só **não pode haver sobreposição**.

---

## 🧭 5. A jornada do aluno

| Fase | Etapa | Tempo aprox. |
|---|---|---|
| **Fase 0** | Pré-requisitos (app 100% PaaS no ar) | 5 min |
| **Fase 1** | Desenho do estado-alvo de rede | 10 min |
| **Fase 2** | Preparar a rede (3 subnets) | 10 min |
| **Fase 3** | Separar a API em seu próprio App Service Plan | 10 min |
| **Fase 4** | Private Endpoint do **Azure SQL** + Private DNS | 15 min |
| **Fase 5** | VNet Integration da **API** → alcançar o SQL privado | 10 min |
| **Fase 6** | Private Endpoint da **API** + desligar o público | 15 min |
| **Fase 7** | VNet Integration do **Front** → alcançar a API privada | 10 min |
| **Fase 8** | Smoke test + considerações operacionais (deploy/gestão) | 15 min |
| **Fase 9** | Troubleshooting + custo/teardown | livre |

> 🧠 **Ordem importa.** Sempre **construímos e validamos o caminho privado** antes de **desligar o público**. Nunca trancamos uma porta sem ter aberto a outra — é o que garante zero downtime.

> ⏱️ **Total esperado:** ~1h30. Reserve **2h** na primeira vez.

---

### Fase 0 — Pré-requisitos

- [ ] **App 100% PaaS no ar** (estado final do [`GUIA-EVENTO-MODERNIZACAO.md`](GUIA-EVENTO-MODERNIZACAO.md)): `https://app-prd-tk-fend-cin-001.azurewebsites.net` (ou seu domínio) abre, login funciona, 104 jogos.
- [ ] **VNet de app existente** (`vnet-prd-inf-cin-001`, `10.20.0.0/16`). _(As VMs já podem ter sido apagadas — esta etapa não depende delas.)_
- [ ] **Acesso ao Portal** com a subscription da app.
- [ ] **Bloco de notas** com: nomes finais dos Web Apps e do SQL Server lógico (`sql-prd-tk-cin-001`), credenciais do Azure SQL admin (`sqladmin`).
- [ ] **Alerta de orçamento** ajustado (esta etapa adiciona ~$28/mês enquanto estiver no ar).

> ✅ **Pronto quando:** o app abre e responde **antes** de mexermos na rede — você precisa desse baseline para comparar a cada fase.

---

### Fase 1 — Desenho do estado-alvo de rede

> 🧠 **Planta antes de tijolo (de novo).** O instrutor apresenta o diagrama "depois" (§3) e revisamos o conceito **inbound × outbound** (§2). Sem esse modelo mental, os passos viram receita cega.

#### 1.1 O que vamos criar (e por quê)

1. **3 subnets** na VNet existente: uma para os **Private Endpoints** e uma de **integração por plano** (front e API).
2. **1 plano de App Service novo** para a API (separar do front).
3. **2 Private Endpoints** (SQL e API) com suas **Private DNS Zones**.
4. **2 VNet Integrations** (front e API), cada uma com **Route All** ligado.

#### 1.2 A regra de ouro da ordem

```
abrir caminho privado  →  VALIDAR  →  só então desligar o público
```

Aplicada duas vezes: primeiro no **SQL** (Fases 4-5, depois desliga na 6-adjacente), depois na **API** (Fases 6-7).

> ✅ **Pronto quando:** você sabe explicar, para cada salto, **onde vai o Private Endpoint** (entrada) e **onde vai a VNet Integration** (saída).

---

### Fase 2 — Preparar a rede (subnets)

Portal → `vnet-prd-inf-cin-001` → **Subnets** → **+ Subnet** (uma de cada):

1. **`snet-prd-inf-pe-cin-001`** · Range `10.20.5.0/24` · **Network policies for private endpoints:** **Disabled** (deixe os PEs funcionarem) · sem delegação.
2. **`snet-prd-inf-appf-cin-001`** · Range `10.20.4.0/24` · **Delegation:** **Microsoft.Web/serverFarms** (integração do front).
3. **API** → **reuse** a `snet-prd-inf-appsvc-cin-001` (`10.20.3.0/24`) criada na modernização. Se você a apagou, recrie-a igual (delegada a `Microsoft.Web/serverFarms`).

> 💡 **Por que uma subnet de integração por plano?** Uma subnet de VNet Integration é **dedicada a um App Service Plan**. Como o front e a API vão ficar em **planos diferentes** (Fase 3), cada um precisa da **sua** subnet. Os Private Endpoints, ao contrário, **compartilham** uma subnet só.

> ✅ **Pronto quando:** as 3 subnets aparecem na VNet, as duas de integração com **delegação** `Microsoft.Web/serverFarms` e a de PE com **network policies desabilitadas**.

---

### Fase 3 — Separar a API em seu próprio App Service Plan

Hoje front e API dividem o `asp-prd-tk-cin-001`. Vamos mover a **API** para um plano próprio.

1. Portal → **App Service plans** → **+ Create** → **Name:** `asp-prd-tk-bend-cin-001` · **OS:** **Windows** · **Region:** **Central India** · **Pricing:** **B1** → **Create**.
2. Abra o Web App **`app-prd-tk-bend-cin-001`** → **Settings → App Service plan** (ou **Change App Service plan**) → selecione `asp-prd-tk-bend-cin-001` → **OK**.
3. Aguarde a troca (alguns segundos; o app reinicia, sem perder configuração).

> ⚠️ **Por que isso é obrigatório aqui?** Existe uma limitação documentada: um app **não alcança bem o Private Endpoint de outro app no mesmo App Service Plan** ([Microsoft Learn — VNet integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration)). Como o front (Plano A) vai chamar a API via PE, a API **precisa** estar em outro plano (Plano B). Bônus: passam a **escalar independente**.

> 📋 **Anote:** front continua em `asp-prd-tk-cin-001`; API agora em `asp-prd-tk-bend-cin-001`.

> ✅ **Pronto quando:** os dois Web Apps estão em **planos diferentes** e o app continua respondendo normalmente (refaça o smoke rápido).

---

### Fase 4 — Private Endpoint do Azure SQL

> 🎯 **Construímos o caminho privado do banco — sem ainda desligar o público.** O app segue funcionando pelo endpoint público enquanto preparamos o privado.

1. Portal → seu servidor **`sql-prd-tk-cin-001`** → **Security → Networking** → aba **Private access** → **+ Create a private endpoint**.
2. **Name:** `pe-prd-tk-sql-cin-001` · **Resource type:** `Microsoft.Sql/servers` · **Target sub-resource:** **sqlServer**.
3. **Virtual network:** `vnet-prd-inf-cin-001` · **Subnet:** `snet-prd-inf-pe-cin-001`.
4. **Private DNS integration:** **Yes** → **Private DNS Zone:** `privatelink.database.windows.net` (o Portal cria e **liga à VNet** automaticamente).
5. **Review + create** → **Create**.

> 💡 **O que o Portal fez por você?** Criou o IP privado do SQL na `snet-pe`, criou a zona `privatelink.database.windows.net` e **ligou** essa zona à `vnet-prd-inf-cin-001`. A partir de agora, **de dentro da VNet**, o nome `sql-prd-tk-cin-001.database.windows.net` resolve para o **IP privado**.

> ⏸️ **Ainda NÃO desligue o público do SQL.** Primeiro a API precisa de VNet Integration (Fase 5) para alcançar o IP privado. Desligar agora cortaria o app (a API ainda fala com o SQL pelo público).

> ✅ **Pronto quando:** o Private Endpoint aparece como **Approved/Succeeded** e a zona `privatelink.database.windows.net` está **linkada** à VNet.

---

### Fase 5 — VNet Integration da API → SQL privado

> 🎯 **Damos o "crachá" para a API entrar na VNet e alcançar o SQL privado.** Depois, aí sim, trancamos o público do banco.

1. Portal → **`app-prd-tk-bend-cin-001`** → **Settings → Networking** → **Outbound traffic → VNet integration** → **Add**.
2. **Virtual network:** `vnet-prd-inf-cin-001` · **Subnet:** `snet-prd-inf-appsvc-cin-001` (`10.20.3.0/24`) → **Connect**.
3. Em **Networking**, garanta **Outbound internet traffic / Route All** **habilitado** (App Setting `WEBSITE_VNET_ROUTE_ALL=1`) — para o tráfego de saída ir pela VNet e usar o **Private DNS**.

**Valide que a API agora fala com o SQL pelo IP privado:**

```powershell
$BEND = "https://app-prd-tk-bend-cin-001.azurewebsites.net"
Invoke-RestMethod "$BEND/api/health/db"     # connected:true (agora via IP privado)
```

4. **Agora sim, desligue o público do SQL:** `sql-prd-tk-cin-001` → **Networking** → aba **Public access** → **Public network access:** **Disable** → **Save**.
5. **Revalide** o `/api/health/db` → deve continuar **connected** (a API usa o caminho privado). 🎉 Banco privatizado.

> 💡 **Por que funcionou sem mexer no `DB_SERVER`?** A App Setting continua `sql-prd-tk-cin-001.database.windows.net`. Com a VNet Integration + Route All + a zona DNS linkada, esse **mesmo nome** agora resolve para o IP privado. Zero mudança de config de conexão.

> ✅ **Pronto quando:** `/api/health/db` conecta **com o público do SQL desligado**. O banco só responde pela VNet.

---

### Fase 6 — Private Endpoint da API + desligar o público

> 🎯 **Construímos o caminho privado da API.** O front ainda a alcança pelo público — então criamos o PE primeiro e validamos antes de desligar.

1. Portal → **`app-prd-tk-bend-cin-001`** → **Settings → Networking** → **Inbound traffic → Private endpoints** → **+ Add → Private endpoint**.
2. **Name:** `pe-prd-tk-bend-cin-001` · **Virtual network:** `vnet-prd-inf-cin-001` · **Subnet:** `snet-prd-inf-pe-cin-001`.
3. **Private DNS integration:** **Yes** → zona `privatelink.azurewebsites.net` (Portal cria e **liga à VNet**).
4. **Create**.

> 💡 De dentro da VNet, `app-prd-tk-bend-cin-001.azurewebsites.net` agora resolve para o **IP privado**. O público **ainda está ligado** — então o front (que ainda não entrou na VNet) continua alcançando normalmente. Caminho privado pronto, nada quebrou.

> ⏸️ **NÃO desligue o público da API ainda.** O front só vai conseguir alcançá-la de forma privada depois da Fase 7. Desligar agora cortaria o `/api/*`. (Faremos isso no fim da Fase 7.)

> ✅ **Pronto quando:** o Private Endpoint da API está **Approved/Succeeded** e a zona `privatelink.azurewebsites.net` está **linkada** à VNet.

---

### Fase 7 — VNet Integration do Front → API privada

> 🎯 **Último salto:** o "crachá" do front, para ele alcançar a API pelo IP privado. Depois, trancamos o público da API e a jornada termina.

1. Portal → **`app-prd-tk-fend-cin-001`** → **Settings → Networking** → **Outbound traffic → VNet integration** → **Add**.
2. **Virtual network:** `vnet-prd-inf-cin-001` · **Subnet:** `snet-prd-inf-appf-cin-001` (`10.20.4.0/24`) → **Connect**.
3. Garanta **Route All** habilitado (`WEBSITE_VNET_ROUTE_ALL=1`).

**Valide ponta a ponta (do seu computador, internet real):**

```powershell
$APP = "https://app-prd-tk-fend-cin-001.azurewebsites.net"   # ou seu domínio
Invoke-RestMethod "$APP/api/health"     # OK — front proxiou para a API via IP privado
```

> 💡 **O `web.config` do front não mudou** — ele segue apontando para `https://app-prd-tk-bend-cin-001.azurewebsites.net`. Com a VNet Integration + a zona `privatelink.azurewebsites.net` linkada, esse nome agora resolve para o **IP privado da API**. O proxy reverso passou a falar com a API **por dentro da rede**.

4. **Agora sim, desligue o público da API:** `app-prd-tk-bend-cin-001` → **Networking** → **Inbound traffic → Public network access:** **Disabled** → **Save**.
5. **Revalide** `$APP/api/health` (deve continuar OK) **e** confirme que a API **não** responde direto:
   ```powershell
   try {
     Invoke-WebRequest "https://app-prd-tk-bend-cin-001.azurewebsites.net/api/health" -TimeoutSec 8 -UseBasicParsing
     Write-Error "FALHOU: API ainda responde pela internet!"
   } catch {
     Write-Host "OK: API privada — internet bloqueada (403/timeout esperado)" -ForegroundColor Green
   }
   ```

> ✅ **Pronto quando:** o app funciona ponta a ponta pelo **front público**, mas a **API e o SQL não respondem pela internet**. Só o frontend tem porta para o mundo. 🎉🔒

---

### Fase 8 — Smoke test + considerações operacionais

#### 8.1 Smoke test (do seu computador)

- [ ] `https://<front>` → home com 104 jogos
- [ ] Login `admin@fifa2026.com` / `admin123`
- [ ] Comprar ingresso → QR code
- [ ] `GET /api/health` (via front) responde OK
- [ ] `GET` direto na URL da API → **403/timeout** (privada ✅)
- [ ] Tentar conectar no SQL pela internet (SSMS do seu PC) → **falha** (privado ✅)

#### 8.2 Mudou o jeito de operar (e isso é esperado)

Ao privatizar, duas tarefas que eram "pela internet" agora exigem estar **dentro da VNet**:

| Tarefa | Antes (público) | Agora (privado) |
|---|---|---|
| 🚀 **Deploy da API** | zip deploy / assistant de qualquer lugar | O **SCM/Kudu** da API também fica privado. Opções: (a) deploy a partir de um **runner/VM dentro da VNet**; (b) manter o **SCM público** à parte (Networking → SCM site → permitir público) enquanto o app fica privado; (c) reabrir o público temporariamente para publicar e desligar depois |
| 🗄️ **Gerir/importar o SQL** | SSMS/portal do seu IP | Conectar de uma **VM na VNet** (ou Bastion), ou reabrir **Public network access** do SQL **temporariamente** + regra de firewall do seu IP, e desligar ao terminar |

> 🔐 **Esse "atrito" é o ponto.** Em produção, gestão de recursos privados passa por **jump host / Bastion / pipeline na VNet** — exatamente o padrão jump host que você viu na fase VM, agora no mundo PaaS. Segurança troca conveniência por superfície menor.

> ✅ **Pronto quando:** o smoke passa, a API/SQL provam estar privados, e você entende **como** fará deploy e gestão daqui pra frente.

---

### Fase 9 — Troubleshooting + custo/teardown

#### 9.1 Tabela de troubleshooting

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `/api/*` dá **502/timeout** após desligar o público da API | Front sem **Route All**, ou zona `privatelink.azurewebsites.net` **não linkada** à VNet | Confirme VNet Integration do front + `WEBSITE_VNET_ROUTE_ALL=1`; confirme a zona linkada a `vnet-prd-inf-cin-001` |
| `/api/health/db` dá **ETIMEOUT** após desligar o público do SQL | API sem VNet Integration/Route All, ou zona `privatelink.database.windows.net` não linkada | Reveja Fase 5 (integração + Route All); confirme a zona DNS linkada |
| API **não alcança** o PE (mesmo com tudo certo) | Front e API ainda no **mesmo plano** | Confirme a Fase 3 — API deve estar em `asp-prd-tk-bend-cin-001` (plano separado) |
| Private Endpoint criado mas o nome resolve **IP público** | Zona DNS não ligada à VNet, ou consulta feita **de fora** da VNet | Private DNS só resolve **de dentro** da VNet/apps integrados; teste pelo `/api/health` do app, não do seu PC |
| Deploy da API **falha** depois do lockdown | SCM/Kudu ficou privado | Use runner na VNet, ou libere o **SCM** público à parte, ou reabra temporário (Fase 8.2) |
| PE não cria na subnet | **Network policies for private endpoints** habilitadas na `snet-pe` | `snet-prd-inf-pe-cin-001` → desabilite network policies de PE |

> 📚 **Diagnóstico:** `/api/health/db` continua sendo o melhor sinal — chamado **via o front** (que está na VNet), ele prova o caminho privado inteiro. Os logs ficam no **Log stream** de cada Web App.

#### 9.2 💰 Custo e teardown

Enquanto ligado, o incremento é ~**$28/mês** (plano B1 extra + 2 PEs + DNS). Para desfazer **só esta etapa** (voltando ao PaaS público) ou **apagar tudo**:

- **Reverter ao público:** religue **Public network access** em SQL e API, remova os Private Endpoints e as VNet Integrations. O app volta a funcionar pelo público (sem mudar código).
- **Apagar tudo (fim do evento):** como tudo está no `rg-prd-tik-paas-cin-001`:
  ```bash
  az group delete --name rg-prd-tik-paas-cin-001 --yes --no-wait
  ```
  Remove Web Apps, planos, SQL, Private Endpoints, DNS zones e subnets associadas. **Custo zero a partir daqui.**

> ✅ **Pronto quando:** você sabe reverter a etapa e apagar o ambiente — e o app provou rodar com **só o front público**.

---

## 📊 6. Tabela de variáveis e recursos

> 💡 **Repare:** **nenhuma variável de aplicação muda** nesta etapa. O que você adiciona é tudo **rede/DNS**. Por isso a tabela aqui é de **recursos**, não de segredos.

| Recurso | Nome | Papel |
|---|---|---|
| Subnet PE | `snet-prd-inf-pe-cin-001` (`10.20.5.0/24`) | IPs privados de API e SQL |
| Subnet integração front | `snet-prd-inf-appf-cin-001` (`10.20.4.0/24`) | Saída do front p/ a VNet |
| Subnet integração API | `snet-prd-inf-appsvc-cin-001` (`10.20.3.0/24`) | Saída da API p/ a VNet |
| Plano da API | `asp-prd-tk-bend-cin-001` (B1) | Separa a API do front |
| PE da API | `pe-prd-tk-bend-cin-001` | Entrada privada da API |
| PE do SQL | `pe-prd-tk-sql-cin-001` | Entrada privada do SQL |
| DNS zone Web App | `privatelink.azurewebsites.net` | FQDN da API → IP privado |
| DNS zone SQL | `privatelink.database.windows.net` | FQDN do SQL → IP privado |

**App Settings que ganham `=1` (não são código):** `WEBSITE_VNET_ROUTE_ALL` no front e na API.

> 🔒 **Regra de ouro (continua):** a connection string do app (`DB_SERVER`, etc.) **não muda** — o mesmo nome passa a resolver privado. Você privatizou a rede **sem reabrir a aplicação**.

---

## 🛡️ 7. Comparação: público × privado

| Dimensão | PaaS público (modernização) | PaaS privado (esta etapa) |
|---|---|---|
| 🌐 **Superfície pública** | front + API + SQL (3) | **só o front** (1) |
| 🛡️ **API/SQL na internet** | sim, com firewall | **não respondem** fora da VNet |
| 🔁 **Mudança de código** | — | **nenhuma** (só rede/DNS) |
| 🚀 **Deploy** | de qualquer lugar | via VNet / SCM controlado |
| 🗄️ **Gestão do SQL** | do seu IP | via VNet / Bastion / reabrir temporário |
| 💰 **Custo** | ~$18/mês | ~$46/mês (+$28) |
| 🧅 **Postura de segurança** | boa (firewall) | **produção** (sem rota pública) |

> 🧠 **A lição final.** Modernizar não para no "tirou da VM". O **próximo nível** é a **postura de rede**: expor o mínimo, alcançar o resto por dentro. E o mais elegante — quando a arquitetura usa **nomes (FQDN)** em vez de IPs, dá para fazer essa virada de público para privado **sem tocar na aplicação**. Foi exatamente o que você fez aqui.

> 🧭 **Próximos níveis (fora do escopo):** Azure Bastion para gestão, **Key Vault + Managed Identity** para segredos, **Front Door + WAF** na borda do front, e **CI/CD com runner na VNet**. Cada um é uma próxima "prorrogação".

---

> 🏁 _Documento vivo — atualizado conforme o evento se aproxima (nomes finais, faixas, custos). **Defesa fechada, ataque livre: bola rolando!**_ ⚽🏆🔒
