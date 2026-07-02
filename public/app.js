import {
  MENU_GROUPS,
  MOBILE_TABS,
  SECONDARY_MODULE_IDS,
  filterMenuGroupsByRole,
  getAllowedModulesForRole,
  getDefaultModuleForRole,
  getModuleLabel,
  mapModuleToMobileTab,
} from "./components/menu-config.js";
import { renderSidebar } from "./components/sidebar.js";
import { renderMobileTabs } from "./components/mobile-tabs.js";
import { renderWhatsAppSection } from "./components/whatsapp.js";
import {
  renderDashboardData,
  renderDashboardError,
  renderDashboardLoading,
} from "./modules/dashboard.js";
import {
  filterAgendaItems,
  normalizeAgendaItems,
  renderAgendaData,
  renderAgendaError,
  renderAgendaLoading,
} from "./modules/agenda.js";
import {
  buildClientSummary,
  normalizeCatalogForScheduling,
  renderAlternativeSlots,
  renderScheduleAssist,
  suggestRelatedServices,
  validateSlotLocally,
} from "./modules/agendamento.js";
import {
  normalizeAppointmentsPayload,
  renderAppointmentDetail,
  renderAppointmentsData,
  renderAppointmentsError,
  renderAppointmentsFeedback,
  renderAppointmentsLoading,
} from "./modules/agendamentos.js";
import {
  addItemToCart,
  computeCartTotals,
  createEmptyCart,
  removeCartItem,
  renderCart,
  renderSaleFeedback,
  updateCartItemQty,
} from "./modules/pdv.js";
import {
  buildWhatsAppLinkFromPhone,
  formatPhoneBR,
  isValidClientPhone,
  normalizePhoneDigits,
} from "./modules/phone.js";
import {
  renderFinancialData,
  renderFinancialEntryDrawer,
  renderFinancialError,
  renderFinancialLoading,
} from "./modules/financeiro.js";
import {
  renderStockProductDrawer,
  renderStockData,
  renderStockError,
  renderStockLoading,
} from "./modules/estoque.js";
import {
  renderClientDrawer,
  renderClientsData,
  renderClientsError,
  renderClientsLoading,
} from "./modules/clientes.js";
import {
  renderProfessionalDrawer,
  renderProfessionalsData,
  renderProfessionalsError,
  renderProfessionalsLoading,
} from "./modules/profissionais.js";
import {
  renderServiceDetail,
  renderServiceEditPanel,
  renderServicesData,
  renderServicesError,
  renderServicesLoading,
} from "./modules/servicos.js";
import {
  renderCommissionDrawer,
  renderCommissionsData,
  renderCommissionsError,
  renderCommissionsLoading,
} from "./modules/comissoes.js";
import {
  renderFidelizacaoData,
  renderFidelizacaoError,
  renderFidelizacaoLoading,
} from "./modules/fidelizacao.js";
import {
  renderAutomacoesData,
  renderAutomacoesError,
  renderAutomacoesLoading,
} from "./modules/automacoes.js";
import {
  renderSettingsData,
  renderSettingsError,
  renderSettingsLoading,
  renderSettingsSidebar,
} from "./modules/configuracoes.js";
import { animateSettingsScreen } from "./modules/motion-effects.js";
import {
  renderMetasData,
  renderMetasError,
  renderMetasLoading,
} from "./modules/metas.js";
import {
  renderAuditData,
  renderAuditError,
  renderAuditEventDrawer,
  renderAuditLoading,
} from "./modules/auditoria.js";
import {
  exportReportCsv,
  renderReportsData,
  renderReportsError,
  renderReportsLoading,
} from "./modules/relatorios.js";
import {
  escapeHtml,
  bindEntityDrawers,
  bindFilterBars,
  renderEmptyState,
  renderEntityDrawer,
  renderFilterBar,
  renderPageHeader,
  renderPrimaryAction,
  renderStatusChip,
  renderTechnicalTrace,
} from "./components/operational-ui.js";

const API = "";
let unitId = "unit-01";
const STORAGE_ACTIVE_MODULE = "sb.activeModule";
const STORAGE_AUTH_SESSION = "sb.authSession";

function renderOperationalChrome() {
  const dashboardHeaderMount = document.getElementById("dashboardHeaderMount");
  if (dashboardHeaderMount) {
    dashboardHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Dashboard",
      eyebrow: "Painel executivo",
      title: "Dashboard",
      subtitle: "Visao rapida para decisao imediata: receita, ocupacao, meta e prioridades com baixa friccao visual.",
      meta: `<span>Menos ruido</span><span>Mais clareza</span>`,
    });
  }

  const agendaHeaderMount = document.getElementById("agendaHeaderMount");
  if (agendaHeaderMount) {
    agendaHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Agenda",
      eyebrow: "Funil operacional",
      title: "Agenda",
      subtitle: "Agenda do dia, proximo atendimento e acoes principais sem expor dados tecnicos.",
    });
  }

  const agendaFilterMount = document.getElementById("agendaFilterMount");
  if (agendaFilterMount) {
    agendaFilterMount.innerHTML = renderFilterBar({
      id: "agendaOperationalFilters",
      essential: [
        `<input id="filterSearch" type="search" placeholder="Buscar cliente, servico ou profissional" class="ds-input min-w-[220px]" />`,
        `<select id="filterPeriod" class="ds-input">
          <option value="today">Hoje</option>
          <option value="week">Semana</option>
          <option value="month">Mes</option>
        </select>`,
        `<select id="filterProfessional" class="ds-input">
          <option value="">Todos profissionais</option>
        </select>`,
      ],
      advanced: [
        `<select id="filterStatus" class="ds-input">
          <option value="">Todos status</option>
          <option value="SCHEDULED">Agendado</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="IN_SERVICE">Em atendimento</option>
          <option value="COMPLETED">Concluido</option>
          <option value="CANCELLED">Cancelado</option>
          <option value="NO_SHOW">Nao compareceu</option>
        </select>`,
        `<select id="filterService" class="ds-input">
          <option value="">Todos servicos</option>
        </select>`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(agendaFilterMount);
  }

  const saleHeaderMount = document.getElementById("saleHeaderMount");
  if (saleHeaderMount) {
    saleHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / PDV",
      eyebrow: "Funil operacional",
      title: "PDV de produtos",
      subtitle: "Busque o produto, monte o carrinho, confira o total e cobre a venda sem expor rastros tecnicos.",
      secondaryActions: `
        <div class="pdv-module-tabs pdv-header-tabs" role="tablist" aria-label="Modulo PDV">
          <button type="button" class="pdv-tab-btn is-active" data-pdv-target="operacao">Venda</button>
          <button type="button" class="pdv-tab-btn" data-pdv-target="estoque">Estoque</button>
        </div>
      `,
    });
  }

  const saleCheckoutActionMount = document.getElementById("saleCheckoutActionMount");
  if (saleCheckoutActionMount) {
    saleCheckoutActionMount.innerHTML = renderPrimaryAction({
      label: "Cobrar venda",
      id: "saleCheckoutBtn",
      type: "submit",
      disabled: true,
    });
  }

  const saleHistoryFilterMount = document.getElementById("saleHistoryFilterMount");
  if (saleHistoryFilterMount) {
    saleHistoryFilterMount.innerHTML = `
      <div class="sale-history-filter-bar">
        <div class="shf-search-wrap">
          <svg class="shf-search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input id="saleHistorySearch" type="search" placeholder="Buscar cliente ou produto..." class="ds-input shf-search" autocomplete="off" />
        </div>
        <div class="shf-picker-wrap" id="shfPickerWrap">
          <input id="saleHistoryStart" type="hidden" />
          <input id="saleHistoryEnd" type="hidden" />
          <button type="button" id="saleHistoryDateTrigger" class="shf-trigger">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span id="saleHistoryDateLabel">Últimos 30 dias</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div id="shfPickerPopover" class="shf-popover hidden" role="dialog" aria-label="Selecionar período">
            <div class="shf-presets">
              <button type="button" class="shf-preset" data-shf-preset="today">Hoje</button>
              <button type="button" class="shf-preset" data-shf-preset="7d">Últimos 7 dias</button>
              <button type="button" class="shf-preset is-active" data-shf-preset="30d">Últimos 30 dias</button>
              <button type="button" class="shf-preset" data-shf-preset="month">Este mês</button>
              <button type="button" class="shf-preset" data-shf-preset="prev-month">Mês anterior</button>
            </div>
            <div class="shf-cals" id="shfCals"></div>
            <div class="shf-popover-foot">
              <span id="shfRangeLabel" class="shf-range-label"></span>
              <button type="button" id="shfApplyBtn" class="shf-apply-btn">Aplicar</button>
            </div>
          </div>
        </div>
      </div>
    `;
    initSaleHistoryDatePicker();

    // Re-query after DOM injection (these were null when queried at module level)
    const liveSearch = document.getElementById("saleHistorySearch");
    if (liveSearch) {
      liveSearch.addEventListener("input", () => {
        window.clearTimeout(saleHistoryDebounce);
        saleHistoryDebounce = window.setTimeout(() => {
          loadProductSalesHistory().catch(() => {
            if (saleRecentList) {
              saleRecentList.innerHTML = `<p class="panel-msg panel-msg-error">Nao foi possivel carregar historico de vendas.</p>`;
            }
          });
        }, 300);
      });
    }
  }

  const inventoryHeaderMount = document.getElementById("inventoryHeaderMount");
  if (inventoryHeaderMount) {
    inventoryHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Estoque",
      eyebrow: "Funil operacional",
      title: "Estoque",
      subtitle: "Produtos criticos primeiro, reposicao clara e rastreabilidade tecnica apenas no detalhe.",
      secondaryActions: `
        <div class="pdv-module-tabs pdv-header-tabs" role="tablist" aria-label="Modulo PDV">
          <button type="button" class="pdv-tab-btn" data-pdv-target="operacao">Venda</button>
          <button type="button" class="pdv-tab-btn is-active" data-pdv-target="estoque">Estoque</button>
        </div>
      `,
    });
  }

  const inventoryFilterMount = document.getElementById("inventoryFilterMount");
  if (inventoryFilterMount) {
    inventoryFilterMount.innerHTML = `
      <div class="inv-filter-strip">
        <div class="inv-filter-group">
          <div class="inv-filter-search-wrap">
            <svg class="inv-filter-search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="inventorySearch" type="search" placeholder="Buscar produto..." class="ds-input inv-filter-search" autocomplete="off" />
          </div>
          <select id="inventoryStatusFilter" class="ds-input inv-filter-select">
            <option value="ALL">Todos status</option>
            <option value="OUT_OF_STOCK">Sem estoque</option>
            <option value="LOW_STOCK">Estoque baixo</option>
          </select>
          <select id="inventoryCategoryFilter" class="ds-input inv-filter-select">
            <option value="">Todas categorias</option>
          </select>
        </div>
        <button type="button" id="inventoryAddBtn" class="ux-btn inventory-add-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Novo produto
        </button>
      </div>
    `;
  }

  const financialHeaderMount = document.getElementById("financialHeaderMount");
  if (financialHeaderMount) {
    financialHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Financeiro",
      eyebrow: "Financeiro conciliado",
      title: "Financeiro",
      subtitle: "Resultado, entradas, saidas e lancamentos em uma visao operacional limpa.",
    });
  }

  const financialFilterMount = document.getElementById("financialFilterMount");
  if (financialFilterMount) {
    financialFilterMount.innerHTML = `
      <div class="fn-filter-bar" id="financialOperationalFilters">
        <div class="fn-picker-wrap" id="fnPickerWrap">
          <input id="financialCustomStart" type="hidden" />
          <input id="financialCustomEnd" type="hidden" />
          <button type="button" id="financialDateTrigger" class="shf-trigger">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span id="financialDateLabel">Este mês</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div id="fnPickerPopover" class="shf-popover hidden" role="dialog" aria-label="Selecionar período">
            <div class="shf-presets">
              <button type="button" class="shf-preset" data-fn-preset="today">Hoje</button>
              <button type="button" class="shf-preset" data-fn-preset="7d">Últimos 7 dias</button>
              <button type="button" class="shf-preset" data-fn-preset="30d">Últimos 30 dias</button>
              <button type="button" class="shf-preset is-active" data-fn-preset="month">Este mês</button>
              <button type="button" class="shf-preset" data-fn-preset="prev-month">Mês anterior</button>
            </div>
            <div class="shf-cals" id="fnCals"></div>
            <div class="shf-popover-foot">
              <span id="fnRangeLabel" class="shf-range-label"></span>
              <button type="button" id="fnApplyBtn" class="shf-apply-btn">Aplicar</button>
            </div>
          </div>
        </div>
        <select id="financialTypeFilter" class="fn-filter-select" aria-label="Tipo de lancamento">
          <option value="">Entradas e saidas</option>
          <option value="INCOME">Entradas</option>
          <option value="EXPENSE">Saidas</option>
        </select>
        <div class="fn-filter-search-wrap">
          <svg class="fn-filter-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input id="financialSearch" type="search" placeholder="Buscar descricao, categoria ou observacao..." class="fn-filter-search" autocomplete="off" />
        </div>
      </div>
    `;
    initFinancialDatePicker();
  }

  const commissionsHeaderMount = document.getElementById("commissionsHeaderMount");
  if (commissionsHeaderMount) {
    commissionsHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Comissoes",
      eyebrow: "Funil operacional",
      title: "Comissoes",
      subtitle: "Fila de quem precisa receber, valores pendentes, pagamentos do periodo e rastreabilidade tecnica apenas no detalhe.",
    });
  }

  const commissionsFilterMount = document.getElementById("commissionsFilterMount");
  if (commissionsFilterMount) {
    commissionsFilterMount.innerHTML = `
      <div class="comm-filter-bar" id="commissionsOperationalFilters">
        <select id="commissionsPeriod" class="comm-filter-select" aria-label="Periodo">
          <option value="month">Este mes</option>
          <option value="week">Esta semana</option>
          <option value="today">Hoje</option>
        </select>
        <select id="commissionsProfessionalFilter" class="comm-filter-select" aria-label="Profissional">
          <option value="">Todos profissionais</option>
        </select>
        <select id="commissionsAppliesToFilter" class="comm-filter-select" aria-label="Origem">
          <option value="">Todas origens</option>
          <option value="SERVICE">Atendimento</option>
          <option value="PRODUCT">Produto</option>
        </select>
        <select id="commissionsStatusFilter" class="comm-filter-select" aria-label="Status">
          <option value="">Todos status</option>
          <option value="PENDING">Pendente</option>
          <option value="PAID">Paga</option>
          <option value="CANCELED">Cancelada</option>
        </select>
      </div>
    `;
  }

  const clientsHeaderMount = document.getElementById("clientsHeaderMount");
  if (clientsHeaderMount) {
    clientsHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Clientes",
      eyebrow: "Relacionamento operacional",
      title: "Clientes",
      subtitle: "Carteira com ativos, risco, VIPs e reativacao prioritaria. Historico completo e rastros tecnicos ficam no detalhe.",
    });
  }

  const clientsFilterMount = document.getElementById("clientsFilterMount");
  if (clientsFilterMount) {
    clientsFilterMount.innerHTML = `
      <div class="cl-filter-bar">
        <select id="clientsStatusFilter" class="cl-filter-select">
          <option value="">Todos status</option>
          <option value="ACTIVE">Ativo</option>
          <option value="AT_RISK">Em risco</option>
          <option value="INACTIVE">Inativo</option>
          <option value="VIP">VIP</option>
        </select>
        <select id="clientsSegmentFilter" class="cl-filter-select">
          <option value="">Todos segmentos</option>
          <option value="VALUE_HIGH">Maior valor</option>
          <option value="VALUE_MEDIUM">Valor médio</option>
          <option value="VALUE_LOW">Valor baixo</option>
        </select>
        <select id="clientsPeriod" class="cl-filter-select" style="flex-basis:120px;width:120px">
          <option value="month">Este mês</option>
          <option value="week">Esta semana</option>
          <option value="today">Hoje</option>
          <option value="quarter">90 dias</option>
        </select>
        <select id="clientsLimit" class="cl-filter-select" style="flex-basis:116px;width:116px">
          <option value="50">50 clientes</option>
          <option value="100">100 clientes</option>
          <option value="200">200 clientes</option>
        </select>
        <div class="cl-filter-search-wrap">
          <input id="clientsSearch" type="search" placeholder="Buscar cliente..." class="cl-filter-search" autocomplete="off" />
        </div>
      </div>
    `;
  }

  const professionalsHeaderMount = document.getElementById("professionalsHeaderMount");
  if (professionalsHeaderMount) {
    professionalsHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Profissionais",
      eyebrow: "Equipe operacional",
      title: "Equipe",
      subtitle: "Equipe ativa, atendimentos do periodo, producao e proximas acoes sem ruido visual.",
    });
  }

  const professionalsFilterMount = document.getElementById("professionalsFilterMount");
  if (professionalsFilterMount) {
    professionalsFilterMount.innerHTML = `
      <div class="team-filter-bar" id="professionalsOperationalFilters">
        <select id="professionalsFilter" class="team-filter-select" aria-label="Profissional">
          <option value="">Todos profissionais</option>
        </select>
        <select id="professionalsPeriod" class="team-filter-select" aria-label="Periodo">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>
        <button type="button" id="professionalsAddBtn" class="pr-add-btn" style="margin-left:auto">
          <span aria-hidden="true">+</span> Novo profissional
        </button>
      </div>
    `;
  }

  const servicesHeaderMount = document.getElementById("servicesHeaderMount");
  if (servicesHeaderMount) {
    servicesHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Servicos",
      eyebrow: "Catalogo operacional",
      title: "Serviços",
      subtitle: "Catalogo de servicos vendaveis com preco, duracao, margem e profissionais habilitados. Detalhe tecnico no drawer.",
    });
  }

  const servicesFilterMount = document.getElementById("servicesFilterMount");
  if (servicesFilterMount) {
    servicesFilterMount.innerHTML = `
      <div class="svc-filter-bar" id="servicesOperationalFilters">
        <input id="servicesSearch" type="search" placeholder="Buscar servico ou descricao" class="svc-filter-input" />
        <select id="servicesCategoryFilter" class="svc-filter-select" aria-label="Categoria">
          <option value="">Todas categorias</option>
        </select>
        <select id="servicesStatusFilter" class="svc-filter-select" aria-label="Status">
          <option value="ALL">Todos status</option>
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
        </select>
        <button type="button" id="servicesAddBtn" class="svc-add-btn" style="margin-left:auto">
          <span aria-hidden="true">+</span> Novo serviço
        </button>
      </div>
    `;
  }

  const auditHeaderMount = document.getElementById("auditHeaderMount");
  if (auditHeaderMount) {
    auditHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Auditoria",
      eyebrow: "Auditoria owner-only",
      title: "Auditoria",
      subtitle: "Linha do tempo legivel de acoes criticas, com rastreabilidade tecnica preservada apenas no detalhe.",
    });
  }

  const auditFilterMount = document.getElementById("auditFilterMount");
  if (auditFilterMount) {
    auditFilterMount.innerHTML = `
      <div class="aud-filter-bar">
        <div class="aud-picker-wrap" id="audPickerWrap">
          <input id="auditStartFilter" type="hidden" />
          <input id="auditEndFilter" type="hidden" />
          <button type="button" id="auditDateTrigger" class="shf-trigger aud-filter-trigger">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span id="auditDateLabel">Últimos 30 dias</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div id="audPickerPopover" class="shf-popover hidden" role="dialog" aria-label="Selecionar período">
            <div class="shf-presets">
              <button type="button" class="shf-preset" data-aud-preset="today">Hoje</button>
              <button type="button" class="shf-preset" data-aud-preset="7d">Últimos 7 dias</button>
              <button type="button" class="shf-preset is-active" data-aud-preset="30d">Últimos 30 dias</button>
              <button type="button" class="shf-preset" data-aud-preset="month">Este mês</button>
              <button type="button" class="shf-preset" data-aud-preset="prev-month">Mês anterior</button>
            </div>
            <div class="shf-cals" id="audCals"></div>
            <div class="shf-popover-foot">
              <span id="audRangeLabel" class="shf-range-label"></span>
              <button type="button" id="audApplyBtn" class="shf-apply-btn">Aplicar</button>
            </div>
          </div>
        </div>
        <select id="auditEntityFilter" class="aud-filter-input">
          <option value="">Todos os módulos</option>
          <option value="agenda">Agenda</option>
          <option value="pdv">PDV</option>
          <option value="financeiro">Financeiro</option>
          <option value="comissoes">Comissões</option>
          <option value="estoque">Estoque</option>
          <option value="configuracoes">Configurações</option>
          <option value="profissionais">Profissionais</option>
          <option value="servicos">Serviços</option>
          <option value="usuarios">Usuários</option>
        </select>
        <select id="auditActorFilter" class="aud-filter-input">
          <option value="">Todos os atores</option>
        </select>
        <select id="auditLimitFilter" class="aud-filter-input">
          <option value="50">50 eventos</option>
          <option value="100">100 eventos</option>
          <option value="200">200 eventos</option>
          <option value="500">500 eventos</option>
        </select>
        <input id="auditActionFilter" type="search" placeholder="Acao" class="aud-filter-input aud-filter-input-hidden" />
        <input id="auditRequestIdFilter" type="search" placeholder="requestId" class="aud-filter-input aud-filter-input-hidden" />
        <input id="auditIdempotencyFilter" type="search" placeholder="idempotencyKey" class="aud-filter-input aud-filter-input-hidden" />
        <input id="auditEntityIdFilter" type="search" placeholder="entityId" class="aud-filter-input aud-filter-input-hidden" />
        <input id="auditRouteFilter" type="search" placeholder="rota" class="aud-filter-input aud-filter-input-hidden" />
        <select id="auditMethodFilter" class="aud-filter-input aud-filter-input-hidden">
          <option value="">Todos metodos</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
    `;
    initAuditDatePicker();
  }

  const reportsHeaderMount = document.getElementById("reportsHeaderMount");
  if (reportsHeaderMount) {
    reportsHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Relatorios",
      eyebrow: "Hub gerencial",
      title: "Relatorios",
      subtitle: "Analise fechada por periodo para conferencia operacional, historico gerencial e exportacao simples sem misturar com a decisao rapida do Dashboard.",
      meta: `<span>Periodo fechado</span><span>Dados humanizados</span><span>Exportacao CSV</span>`,
    });
  }

  const reportsFilterMount = document.getElementById("reportsFilterMount");
  if (reportsFilterMount) {
    reportsFilterMount.innerHTML = renderFilterBar({
      id: "reportsOperationalFilters",
      essential: [
        `<select id="reportsPeriod" class="ds-input">
          <option value="today">Hoje</option>
          <option value="week">Semana</option>
          <option value="month" selected>Mes</option>
          <option value="custom">Periodo personalizado</option>
        </select>`,
        `<input id="reportsCustomStart" type="date" aria-label="Inicio do periodo" class="ds-input hidden" />`,
        `<input id="reportsCustomEnd" type="date" aria-label="Fim do periodo" class="ds-input hidden" />`,
      ],
      advanced: [
        `<span class="reports-filter-note">Relatorios usam os dados operacionais disponiveis no periodo selecionado.</span>`,
      ],
      advancedLabel: "Base do recorte",
    });
    bindFilterBars(reportsFilterMount);
  }

  const fidelizacaoHeaderMount = document.getElementById("fidelizacaoHeaderMount");
  if (fidelizacaoHeaderMount) {
    fidelizacaoHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Fidelizacao",
      eyebrow: "Retencao premium",
      title: "Fidelizacao",
      subtitle: "Pontos, pacotes, assinaturas, retencao e multiunidade com leitura comercial simples.",
    });
  }

  const fidelizacaoFilterMount = document.getElementById("fidelizacaoFilterMount");
  if (fidelizacaoFilterMount) {
    fidelizacaoFilterMount.innerHTML = renderFilterBar({
      id: "fidelizacaoOperationalFilters",
      essential: [
        `<select id="fidelizacaoPeriod" class="ds-input">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>`,
        `<select id="retentionRiskFilter" class="ds-input">
          <option value="">Risco (todos)</option>
          <option value="HIGH">Alto</option>
          <option value="MEDIUM">Medio</option>
          <option value="LOW">Baixo</option>
        </select>`,
      ],
    });
    bindFilterBars(fidelizacaoFilterMount);
  }

  const automacoesHeaderMount = document.getElementById("automacoesHeaderMount");
  if (automacoesHeaderMount) {
    automacoesHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Automacoes",
      eyebrow: "IA e integracoes",
      title: "Automacoes",
      subtitle: "Regras, execucoes, scoring e logs apresentados como operacao assistida, sem alterar fluxos existentes.",
    });
  }

  const automacoesFilterMount = document.getElementById("automacoesFilterMount");
  if (automacoesFilterMount) {
    automacoesFilterMount.innerHTML = renderFilterBar({
      id: "automacoesOperationalFilters",
      essential: [
        `<select id="automacoesPeriod" class="ds-input">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>`,
        `<select id="automacoesStatusFilter" class="ds-input">
          <option value="">Execucoes (todos)</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="FAILED">Falha</option>
          <option value="PENDING">Pendente</option>
        </select>`,
      ],
      advanced: [
        `<select id="automacoesRiskFilter" class="ds-input">
          <option value="">Risco (todos)</option>
          <option value="HIGH">Alto</option>
          <option value="MEDIUM">Medio</option>
          <option value="LOW">Baixo</option>
        </select>`,
        `<select id="automacoesProviderFilter" class="ds-input">
          <option value="">Provedor (todos)</option>
          <option value="whatsapp-cloud">whatsapp-cloud</option>
          <option value="billing-gateway">billing-gateway</option>
        </select>`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(automacoesFilterMount);
  }

  const metasHeaderMount = document.getElementById("metasHeaderMount");
  if (metasHeaderMount) {
    metasHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Metas",
      eyebrow: "Performance operacional",
      title: "Metas e Performance",
      subtitle: "Progresso mensal, ritmo e rankings com foco em acao comercial clara.",
      action: renderPrimaryAction({
        label: "Definir meta",
        id: "metasDefineGoalBtn",
        type: "button",
        attrs: { "data-metas-action": "open-goal-modal" },
      }),
    });
  }
}

const appShell = document.getElementById("appShell");
const appSidebar = document.getElementById("appSidebar");
const appContent = document.getElementById("appContent");
const appMobileTabs = document.getElementById("appMobileTabs");
const mobileSidebarBackdrop = document.getElementById("mobileSidebarBackdrop");

renderOperationalChrome();

const appointmentForm = document.getElementById("appointmentForm");
const saleForm = document.getElementById("saleForm");
const agendaList = document.getElementById("agendaList");
const agendaMetricsGrid = document.getElementById("agendaMetricsGrid");
const queueList = document.getElementById("queueList");
const lowStockList = document.getElementById("lowStockList");
const kpiGrid = document.getElementById("kpiGrid");
const saleFeedback = document.getElementById("saleFeedback");
const saleTotalValue = document.getElementById("saleTotalValue");
const saleTotalItems = document.getElementById("saleTotalItems");
const goalBlock = document.getElementById("goalBlock");
const topProfessionalsList = document.getElementById("topProfessionalsList");
const topsList = document.getElementById("topsList");
const alertsList = document.getElementById("alertsList");
const forecastList = document.getElementById("forecastList");
const smartAlertsList = document.getElementById("smartAlertsList");
const actionSuggestionsList = document.getElementById("actionSuggestionsList");
const dashboardLowStockList = document.getElementById("dashboardLowStockList");
const dashboardPlaybookPanel = document.getElementById("dashboardPlaybookPanel");
const dashboardTelemetryPanel = document.getElementById("dashboardTelemetryPanel");
const dashboardAutomationSignals = document.getElementById("dashboardAutomationSignals");
const clientInsights = document.getElementById("clientInsights");
const serviceSuggestions = document.getElementById("serviceSuggestions");
const appointmentFeedback = document.getElementById("appointmentFeedback");
const alternativeSlots = document.getElementById("alternativeSlots");
const placeholderSection = document.getElementById("placeholderSection");
const reportsRoot = document.getElementById("reportsRoot");
const reportsFeedback = document.getElementById("reportsFeedback");
const reportsPeriod = document.getElementById("reportsPeriod");
const reportsCustomStart = document.getElementById("reportsCustomStart");
const reportsCustomEnd = document.getElementById("reportsCustomEnd");
const financialSummary = document.getElementById("financialSummary");
const financialToolbarMount = document.getElementById("financialToolbarMount");
const financialCashflow = document.getElementById("financialCashflow");
const financialEntriesList = document.getElementById("financialEntriesList");
const financialCommissionsList = document.getElementById("financialCommissionsList");
const financialReports = document.getElementById("financialReports");
const financialDrawerHost = document.getElementById("financialDrawerHost");
const financialFeedback = document.getElementById("financialFeedback");
const financialPeriod = document.getElementById("financialPeriod");
const financialCustomStart = document.getElementById("financialCustomStart");
const financialCustomEnd = document.getElementById("financialCustomEnd");
const financialSearch = document.getElementById("financialSearch");
const financialTypeFilter = document.getElementById("financialTypeFilter");
const financialAddTransactionBtn = document.getElementById("financialAddTransactionBtn");
const financialTransactionModal = document.getElementById("financialTransactionModal");
const financialTransactionModalTitle = document.getElementById("financialTransactionModalTitle");
const financialTransactionModalClose = document.getElementById("financialTransactionModalClose");
const financialTransactionModalCancel = document.getElementById("financialTransactionModalCancel");
const financialTransactionForm = document.getElementById("financialTransactionForm");
const financialTransactionId = document.getElementById("financialTransactionId");
const financialTransactionType = document.getElementById("financialTransactionType");
const financialTransactionCategory = document.getElementById("financialTransactionCategory");
const financialTransactionDescription = document.getElementById("financialTransactionDescription");
const financialTransactionAmount = document.getElementById("financialTransactionAmount");
const financialTransactionDate = document.getElementById("financialTransactionDate");
const financialTransactionPaymentMethod = document.getElementById("financialTransactionPaymentMethod");
const financialTransactionCreditTerms = document.getElementById("financialTransactionCreditTerms");
const financialTransactionProfessional = document.getElementById("financialTransactionProfessional");
const financialTransactionCustomer = document.getElementById("financialTransactionCustomer");
const financialTransactionNotes = document.getElementById("financialTransactionNotes");
const inventorySummaryCards = document.getElementById("inventorySummaryCards");
const inventorySearch = document.getElementById("inventorySearch");
const inventoryCategoryFilter = document.getElementById("inventoryCategoryFilter");
const inventoryStatusFilter = document.getElementById("inventoryStatusFilter");
const inventoryFeedback = document.getElementById("inventoryFeedback");
const inventoryEmptyState = document.getElementById("inventoryEmptyState");
const inventoryEmptyAddBtn = document.getElementById("inventoryEmptyAddBtn");
const inventoryTableWrap = document.getElementById("inventoryTableWrap");
const inventoryTableBody = document.getElementById("inventoryTableBody");
const inventoryMobileList = document.getElementById("inventoryMobileList");
const inventoryDrawerHost = document.getElementById("inventoryDrawerHost");
const inventoryAddBtn = document.getElementById("inventoryAddBtn");
const inventoryProductModal = document.getElementById("inventoryProductModal");
const inventoryProductModalTitle = document.getElementById("inventoryProductModalTitle");
const inventoryProductModalClose = document.getElementById("inventoryProductModalClose");
const inventoryProductModalCancel = document.getElementById("inventoryProductModalCancel");
const inventoryProductForm = document.getElementById("inventoryProductForm");
const inventoryProductId = document.getElementById("inventoryProductId");
const inventoryProductName = document.getElementById("inventoryProductName");
const inventoryProductSalePrice = document.getElementById("inventoryProductSalePrice");
const inventoryProductQuantity = document.getElementById("inventoryProductQuantity");
const inventoryProductCostPrice = document.getElementById("inventoryProductCostPrice");
const inventoryProductMinimumStock = document.getElementById("inventoryProductMinimumStock");
const inventoryProductCategory = document.getElementById("inventoryProductCategory");
const inventoryProductImageUrl = document.getElementById("inventoryProductImageUrl");
const inventoryCategorySuggestions = document.getElementById("inventoryCategorySuggestions");
const inventoryProductNotes = document.getElementById("inventoryProductNotes");
const inventoryProductSubmitBtn = document.getElementById("inventoryProductSubmitBtn");
const inventoryStockModal = document.getElementById("inventoryStockModal");
const inventoryStockModalTitle = document.getElementById("inventoryStockModalTitle");
const inventoryStockModalSubtitle = document.getElementById("inventoryStockModalSubtitle");
const inventoryStockModalClose = document.getElementById("inventoryStockModalClose");
const inventoryStockModalCancel = document.getElementById("inventoryStockModalCancel");
const inventoryStockForm = document.getElementById("inventoryStockForm");
const inventoryStockProductId = document.getElementById("inventoryStockProductId");
const inventoryStockType = document.getElementById("inventoryStockType");
const inventoryStockQuantity = document.getElementById("inventoryStockQuantity");
const inventoryStockReason = document.getElementById("inventoryStockReason");
const inventoryStockSubmitBtn = document.getElementById("inventoryStockSubmitBtn");
const saleCartList = document.getElementById("saleCartList");
const saleCheckoutBtn = document.getElementById("saleCheckoutBtn");
const saleRecentList = document.getElementById("saleRecentList");
const saleHistorySearch = document.getElementById("saleHistorySearch");
const saleHistoryStart = document.getElementById("saleHistoryStart");
const saleHistoryEnd = document.getElementById("saleHistoryEnd");
const saleHistoryRefreshBtn = document.getElementById("saleHistoryRefreshBtn");
const saleDrawerHost = document.getElementById("saleDrawerHost");
const clientsSummary = document.getElementById("clientsSummary");
const clientsToolbarMount = document.getElementById("clientsToolbarMount");
const clientsReactivationQueue = document.getElementById("clientsReactivationQueue");
const clientsAutomationSignals = document.getElementById("clientsAutomationSignals");
const clientsTable = document.getElementById("clientsTable");
const clientsFeedback = document.getElementById("clientsFeedback");
const clientsFormFeedback = document.getElementById("clientsFormFeedback");
const professionalsSummary = document.getElementById("professionalsSummary");
const professionalsTable = document.getElementById("professionalsTable");
const professionalsDrawerHost = document.getElementById("professionalsDrawerHost");
const servicesSummaryGrid = document.getElementById("servicesSummaryGrid");
const servicesSearch = document.getElementById("servicesSearch");
const servicesCategoryFilter = document.getElementById("servicesCategoryFilter");
const servicesStatusFilter = document.getElementById("servicesStatusFilter");
const servicesMinPrice = document.getElementById("servicesMinPrice");
const servicesMaxPrice = document.getElementById("servicesMaxPrice");
const servicesFeedback = document.getElementById("servicesFeedback");
const servicesEmptyState = document.getElementById("servicesEmptyState");
const servicesEmptyAddBtn = document.getElementById("servicesEmptyAddBtn");
const servicesTableWrap = document.getElementById("servicesTableWrap");
const servicesTableBody = document.getElementById("servicesTableBody");
const servicesMobileList = document.getElementById("servicesMobileList");
const servicesDetailPanel = document.getElementById("servicesDetailPanel");
const servicesDetailContent = document.getElementById("servicesDetailContent");
const servicesDetailClose = document.getElementById("servicesDetailClose");
const servicesDrawerHost = document.getElementById("servicesDrawerHost");
const servicesAddBtn = document.getElementById("servicesAddBtn");
const servicesModal = document.getElementById("servicesModal");
const servicesModalTitle = document.getElementById("servicesModalTitle");
const servicesModalClose = document.getElementById("servicesModalClose");
const servicesModalCancel = document.getElementById("servicesModalCancel");
const servicesForm = document.getElementById("servicesForm");
const servicesId = document.getElementById("servicesId");
const servicesName = document.getElementById("servicesName");
const servicesPrice = document.getElementById("servicesPrice");
const servicesDurationMinutes = document.getElementById("servicesDurationMinutes");
const servicesCategory = document.getElementById("servicesCategory");
const servicesDescription = document.getElementById("servicesDescription");
const servicesDefaultCommissionRate = document.getElementById("servicesDefaultCommissionRate");
const servicesProfessionalIds = document.getElementById("servicesProfessionalIds");
const servicesIsActive = document.getElementById("servicesIsActive");
const servicesEstimatedCost = document.getElementById("servicesEstimatedCost");
const servicesNotes = document.getElementById("servicesNotes");
const servicesImageUrl = document.getElementById("servicesImageUrl");
const servicesSubmitBtn = document.getElementById("servicesSubmitBtn");
const professionalsModal = document.getElementById("professionalsModal");
const professionalsModalClose = document.getElementById("professionalsModalClose");
const professionalsModalCancel = document.getElementById("professionalsModalCancel");
const professionalsForm = document.getElementById("professionalsForm");
const professionalsFormId = document.getElementById("professionalsFormId");
const professionalsFormName = document.getElementById("professionalsFormName");
const professionalsFormPhone = document.getElementById("professionalsFormPhone");
const professionalsFormEmail = document.getElementById("professionalsFormEmail");
const professionalsFormFeedback = document.getElementById("professionalsFormFeedback");
const commissionsSummary = document.getElementById("commissionsSummary");
const commissionsTable = document.getElementById("commissionsTable");
const commissionsFeedback = document.getElementById("commissionsFeedback");
const fidelizacaoSummary = document.getElementById("fidelizacaoSummary");
const fidelizacaoPackages = document.getElementById("fidelizacaoPackages");
const fidelizacaoSubscriptions = document.getElementById("fidelizacaoSubscriptions");
const fidelizacaoRetention = document.getElementById("fidelizacaoRetention");
const fidelizacaoMultiunit = document.getElementById("fidelizacaoMultiunit");
const loyaltyAdjustForm = document.getElementById("loyaltyAdjustForm");
const loyaltyClientId = document.getElementById("loyaltyClientId");
const loyaltyDelta = document.getElementById("loyaltyDelta");
const loyaltySourceType = document.getElementById("loyaltySourceType");
const loyaltyFeedback = document.getElementById("loyaltyFeedback");
const premiumActionsForm = document.getElementById("premiumActionsForm");
const premiumClientId = document.getElementById("premiumClientId");
const packageId = document.getElementById("packageId");
const subscriptionPlanId = document.getElementById("subscriptionPlanId");
const premiumFeedback = document.getElementById("premiumFeedback");
const fidelizacaoPeriod = document.getElementById("fidelizacaoPeriod");
const retentionRiskFilter = document.getElementById("retentionRiskFilter");
const automacoesSummary = document.getElementById("automacoesSummary");
const automacoesExecutions = document.getElementById("automacoesExecutions");
const automacoesScoring = document.getElementById("automacoesScoring");
const automacoesWebhookLogs = document.getElementById("automacoesWebhookLogs");
const automacoesPeriod = document.getElementById("automacoesPeriod");
const automacoesStatusFilter = document.getElementById("automacoesStatusFilter");
const automacoesRiskFilter = document.getElementById("automacoesRiskFilter");
const automacoesProviderFilter = document.getElementById("automacoesProviderFilter");
const automacoesRulesFilter = document.getElementById("automacoesRulesFilter");
const automacoesFeedback = document.getElementById("automacoesFeedback");
const automacoesRulesList = document.getElementById("automacoesRulesList");
const settingsFeedback = document.getElementById("settingsFeedback");
const settingsRoot = document.getElementById("settingsRoot");
const metasSection = document.getElementById("metasSection");
const metasFeedback = document.getElementById("metasFeedback");
const metasSummaryCards = document.getElementById("metasSummaryCards");
const metasProgressBlock = document.getElementById("metasProgressBlock");
const metasProfessionalsRanking = document.getElementById("metasProfessionalsRanking");
const metasServicesRanking = document.getElementById("metasServicesRanking");
const metasInsights = document.getElementById("metasInsights");
const metasDefineGoalBtn = document.getElementById("metasDefineGoalBtn");
const metasGoalModal = document.getElementById("metasGoalModal");
const metasGoalModalTitle = document.getElementById("metasGoalModalTitle");
const metasGoalModalClose = document.getElementById("metasGoalModalClose");
const metasGoalModalCancel = document.getElementById("metasGoalModalCancel");
const metasGoalForm = document.getElementById("metasGoalForm");
const metasGoalId = document.getElementById("metasGoalId");
const metasGoalMonth = document.getElementById("metasGoalMonth");
const metasRevenueTarget = document.getElementById("metasRevenueTarget");
const metasAppointmentsTarget = document.getElementById("metasAppointmentsTarget");
const metasAverageTicketTarget = document.getElementById("metasAverageTicketTarget");
const metasNotes = document.getElementById("metasNotes");
const metasGoalFormFeedback = document.getElementById("metasGoalFormFeedback");
const metasGoalSubmitBtn = document.getElementById("metasGoalSubmitBtn");
const auditEntityFilter = document.getElementById("auditEntityFilter");
const auditActionFilter = document.getElementById("auditActionFilter");
const auditActorFilter = document.getElementById("auditActorFilter");
const auditStartFilter = document.getElementById("auditStartFilter");
const auditEndFilter = document.getElementById("auditEndFilter");
const auditLimitFilter = document.getElementById("auditLimitFilter");
const auditRequestIdFilter = document.getElementById("auditRequestIdFilter");
const auditIdempotencyFilter = document.getElementById("auditIdempotencyFilter");
const auditEntityIdFilter = document.getElementById("auditEntityIdFilter");
const auditRouteFilter = document.getElementById("auditRouteFilter");
const auditMethodFilter = document.getElementById("auditMethodFilter");
const auditFeedback = document.getElementById("auditFeedback");
const auditEventsList = document.getElementById("auditEventsList");
const auditDrawerHost = document.getElementById("auditDrawerHost");
const automationRuleForm = document.getElementById("automationRuleForm");
const automationRuleId = document.getElementById("automationRuleId");
const automationRuleName = document.getElementById("automationRuleName");
const automationRuleTriggerType = document.getElementById("automationRuleTriggerType");
const automationRuleChannel = document.getElementById("automationRuleChannel");
const automationRuleTarget = document.getElementById("automationRuleTarget");
const automationRuleMessageTemplate = document.getElementById("automationRuleMessageTemplate");
const automationRuleSubmitBtn = document.getElementById("automationRuleSubmitBtn");
const automationRuleCancelBtn = document.getElementById("automationRuleCancelBtn");
const toggleAgendaFiltersBtn = document.getElementById("toggleAgendaFiltersBtn");
const agendaFiltersPanel = document.getElementById("agendaFiltersPanel");
const mobileOperationActions = document.getElementById("mobileOperationActions");
const mobileFocusSaleBtn = document.getElementById("mobileFocusSaleBtn");
const agendaNewAppointmentBtn = document.getElementById("agendaNewAppointmentBtn");
const agendaSchedulePanel = document.getElementById("agendaSchedulePanel");
const appointmentsHeaderDate = document.getElementById("appointmentsHeaderDate");
const appointmentsPeriodSummary = document.getElementById("appointmentsPeriodSummary");
const appointmentsSummaryGrid = document.getElementById("appointmentsSummaryGrid");
const appointmentsFeedback = document.getElementById("appointmentsFeedback");
const appointmentsEmptyState = document.getElementById("appointmentsEmptyState");
const appointmentsEmptyNew = document.getElementById("appointmentsEmptyNew");
const appointmentsEmptyToday = document.getElementById("appointmentsEmptyToday");
const appointmentsEmptyClear = document.getElementById("appointmentsEmptyClear");
const appointmentsTableWrap = document.getElementById("appointmentsTableWrap");
const appointmentsTableBody = document.getElementById("appointmentsTableBody");
const appointmentsMobileList = document.getElementById("appointmentsMobileList");
const appointmentsDetailPanel =
  document.getElementById("appointmentDrawerHost") || document.getElementById("appointmentsDetailPanel");
const appointmentsDetailContent = document.getElementById("appointmentsDetailContent");
const appointmentsDetailClose = document.getElementById("appointmentsDetailClose");
const appointmentsFilterDate = document.getElementById("appointmentsFilterDate");
const appointmentsFilterPeriod = document.getElementById("appointmentsFilterPeriod");
const appointmentsFilterStatus = document.getElementById("appointmentsFilterStatus");
const appointmentsFilterProfessional = document.getElementById("appointmentsFilterProfessional");
const appointmentsFilterService = document.getElementById("appointmentsFilterService");
const appointmentsFilterClient = document.getElementById("appointmentsFilterClient");
const appointmentsFilterSearch = document.getElementById("appointmentsFilterSearch");
const agendaCardsMode = document.getElementById("agendaCardsMode");
const agendaCalendarMode = document.getElementById("agendaCalendarMode");
const agendaListMode = document.getElementById("agendaListMode");
const alFilterStatus = document.getElementById("alFilterStatus");
const alFilterProfessional = document.getElementById("alFilterProfessional");
const alFilterSearch = document.getElementById("alFilterSearch");
const agendaListContent = document.getElementById("agendaListContent");

const dashboardElements = {
  kpiGrid,
  goalBlock,
  topProfessionalsList,
  topsList,
  alertsList,
  lowStockList: dashboardLowStockList,
  forecastList,
  smartAlertsList,
  actionSuggestionsList,
  playbookPanel: dashboardPlaybookPanel,
  telemetryPanel: dashboardTelemetryPanel,
  automationSignals: dashboardAutomationSignals,
};

const reportsElements = {
  root: reportsRoot,
  feedback: reportsFeedback,
};

const sectionsByModule = {
  dashboard: document.getElementById("dashboardSection"),
  agenda: document.getElementById("agendaSection"),
  operacao: document.getElementById("operationSection"),
  financeiro: document.getElementById("financeiroSection"),
  estoque: document.getElementById("estoqueSection"),
  clientes: document.getElementById("clientsSection"),
  profissionais: document.getElementById("professionalsSection"),
  servicos: document.getElementById("servicesSection"),
  comissoes: document.getElementById("commissionsSection"),
  auditoria: document.getElementById("auditSection"),
  fidelizacao: document.getElementById("fidelizacaoSection"),
  automacoes: document.getElementById("automacoesSection"),
  metas: metasSection,
  configuracoes: document.getElementById("settingsSection"),
  relatorios: document.getElementById("reportsSection"),
  whatsapp: document.getElementById("whatsappSection"),
  "agendamento-link": document.getElementById("agendamento-linkSection"),
};

const allModuleIds = new Set([
  ...MENU_GROUPS.flatMap((group) => group.modules).map((module) => module.id),
  ...Object.keys(sectionsByModule),
]);

const clientId = document.getElementById("clientId");
const clientSearch = document.getElementById("clientSearch");
const clientSearchDropdown = document.getElementById("clientSearchDropdown");
const professionalId = document.getElementById("professionalId");
const serviceId = document.getElementById("serviceId");
const startsAt = document.getElementById("startsAt");
const filterProfessional = document.getElementById("filterProfessional");
const filterStatus = document.getElementById("filterStatus");
const filterService = document.getElementById("filterService");
const filterSearch = document.getElementById("filterSearch");
const filterPeriod = document.getElementById("filterPeriod");
const viewListBtn = document.getElementById("viewListBtn");
const viewGridBtn = document.getElementById("viewGridBtn");
const saleProductId = document.getElementById("saleProductId");
const saleQty = document.getElementById("saleQty");
const saleCategoryList = document.getElementById("saleCategoryList");
const saleProductRail = document.getElementById("saleProductRail");
const saleSelectedProductThumb = document.getElementById("saleSelectedProductThumb");
const saleSelectedProductName = document.getElementById("saleSelectedProductName");
const saleSelectedProductMeta = document.getElementById("saleSelectedProductMeta");
const saleClientId = document.getElementById("saleClientId");
const saleProfessionalId = document.getElementById("saleProfessionalId");
const saleAddItemBtn = document.getElementById("saleAddItemBtn");
const saleClearCartBtn = document.getElementById("saleClearCartBtn");
const pdvProductSearch = document.getElementById("pdvProductSearch");
const clientsSearch = document.getElementById("clientsSearch");
const clientsStatusFilter = document.getElementById("clientsStatusFilter");
const clientsSegmentFilter = document.getElementById("clientsSegmentFilter");
const clientsPeriod = document.getElementById("clientsPeriod");
const clientsLimit = document.getElementById("clientsLimit");
const clientsModal = document.getElementById("clientsModal");
const clientsModalClose = document.getElementById("clientsModalClose");
const clientsModalCancel = document.getElementById("clientsModalCancel");
const clientsForm = document.getElementById("clientsForm");
const clientsName = document.getElementById("clientsName");
const clientsPhone = document.getElementById("clientsPhone");
const clientsEmail = document.getElementById("clientsEmail");
const clientsBirthDate = document.getElementById("clientsBirthDate");
const clientsStatus = document.getElementById("clientsStatus");
const clientsTags = document.getElementById("clientsTags");
const clientsNotes = document.getElementById("clientsNotes");
const clientsSubmitBtn = document.getElementById("clientsSubmitBtn");
const clientsDrawerHost = document.getElementById("clientsDrawerHost");
const professionalsFilter = document.getElementById("professionalsFilter");
const professionalsPeriod = document.getElementById("professionalsPeriod");
const commissionsProfessionalFilter = document.getElementById("commissionsProfessionalFilter");
const commissionsAppliesToFilter = document.getElementById("commissionsAppliesToFilter");
const commissionsPeriod = document.getElementById("commissionsPeriod");
const commissionsStatusFilter = document.getElementById("commissionsStatusFilter");
const commissionsDrawerHost = document.getElementById("commissionsDrawerHost");

const scheduleAssistElements = {
  clientInsights,
  serviceSuggestions,
  appointmentFeedback,
  alternativeSlots,
};

const financialElements = {
  summary: financialSummary,
  toolbar: financialToolbarMount,
  cashflow: financialCashflow,
  list: financialEntriesList,
  commissions: financialCommissionsList,
  reports: financialReports,
  drawerHost: financialDrawerHost,
};

const stockElements = {
  summaryCards: inventorySummaryCards,
  categoryFilter: inventoryCategoryFilter,
  emptyState: inventoryEmptyState,
  tableWrap: inventoryTableWrap,
  tableBody: inventoryTableBody,
  mobileList: inventoryMobileList,
  drawerHost: inventoryDrawerHost,
};

const clientsElements = {
  summary: clientsSummary,
  toolbar: clientsToolbarMount,
  automationSignals: clientsAutomationSignals,
  reactivationQueue: clientsReactivationQueue,
  table: clientsTable,
  drawerHost: clientsDrawerHost,
};

const professionalsElements = {
  summary: professionalsSummary,
  table: professionalsTable,
  drawerHost: professionalsDrawerHost,
};

const servicesElements = {
  summary: servicesSummaryGrid,
  categoryFilter: servicesCategoryFilter,
  emptyState: servicesEmptyState,
  tableWrap: servicesTableWrap,
  tableBody: servicesTableBody,
  mobileList: servicesMobileList,
  detail: {
    panel: servicesDetailPanel,
    content: servicesDetailContent,
  },
  drawerHost: servicesDrawerHost,
};

const commissionsElements = {
  summary: commissionsSummary,
  table: commissionsTable,
  drawerHost: commissionsDrawerHost,
};

const fidelizacaoElements = {
  summary: fidelizacaoSummary,
  packages: fidelizacaoPackages,
  subscriptions: fidelizacaoSubscriptions,
  retention: fidelizacaoRetention,
  multiunit: fidelizacaoMultiunit,
};

const automacoesElements = {
  rules: automacoesRulesList,
  summary: automacoesSummary,
  executions: automacoesExecutions,
  scoring: automacoesScoring,
  logs: automacoesWebhookLogs,
};

const settingsElements = {
  root: settingsRoot,
};

const metasElements = {
  feedback: metasFeedback,
  cards: metasSummaryCards,
  progress: metasProgressBlock,
  professionals: metasProfessionalsRanking,
  services: metasServicesRanking,
  insights: metasInsights,
};

const auditElements = {
  feedback: auditFeedback,
  list: auditEventsList,
  drawerHost: auditDrawerHost,
};

const appointmentsElements = {
  summary: appointmentsSummaryGrid,
  periodSummary: appointmentsPeriodSummary,
  feedback: appointmentsFeedback,
  empty: appointmentsEmptyState,
  tableWrap: appointmentsTableWrap,
  tableBody: appointmentsTableBody,
  mobileList: appointmentsMobileList,
  detail: {
    panel: appointmentsDetailPanel,
    content: appointmentsDetailContent,
  },
};

const cartElements = {
  list: saleCartList,
  totalValue: saleTotalValue,
  totalItemsValue: saleTotalItems,
  checkoutButton: saleCheckoutBtn,
};

let currentAgenda = [];
let currentAppointments = [];
let currentView = "cards";
let selectedAppointmentId = "";
let wcWeekStart = null;
let wcItems = [];
let wcLoaded = false;
let alFocusedAppointmentId = "";
let currentWorkingHours = null;
let productsById = {};
let clientsById = {};
let servicesById = {};
let professionalsById = {};
let allServices = [];
let saleCart = createEmptyCart();
let saleSelectedCategory = "";
let recentSales = [];
let productSalesHistory = [];
let saleHistoryDebounce = null;
let currentAutomationRules = [];
let currentFinancialTransactions = [];
let currentCommissionsPayload = null;
let currentClientsPayload = null;
let currentProfessionalsPayload = null;
let currentServices = [];
let currentServiceDetail = null;
let currentSettingsPayload = null;
let settingsActiveSection = "business";
let settingsReturnModule = "financeiro";
let accountMenuOpen = false;
let currentMetasPayload = null;
let currentAuditPayload = null;
let currentReportsPayload = null;
let activeReportId = "financeiro";
let inventoryFilters = {
  search: "",
  category: "",
  status: "ALL",
};
let servicesFilters = {
  search: "",
  category: "",
  status: "ALL",
  minPrice: "",
  maxPrice: "",
};
let inventoryProductsById = {};
let currentStockPayload = null;
let servicesByIdMap = {};
let inventorySearchDebounce = null;
let checkoutModalState = {
  appointment: null,
  products: [],
  total: 0,
};
let appointmentRefundState = {
  appointment: null,
};
let productRefundState = {
  sale: null,
};
let schedulingCatalog = {
  clientsById: {},
  servicesById: {},
  professionalsById: {},
};

const actionLabel = {
  COMPLETE: "Concluir",
  RESCHEDULE: "Remarcar",
  CANCELLED: "Cancelar",
  NO_SHOW: "Falta",
  PAYMENT: "Registrar Pagamento",
  SELL: "Vender Produto",
};

const SLOT_BLOCKING_STATUSES = new Set(["SCHEDULED", "CONFIRMED", "IN_SERVICE", "BLOCKED"]);
const SETTINGS_DAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
];
const SETTINGS_HOURS_PRESETS = {
  barber_default: [
    { dayOfWeek: 0, opensAt: "09:00", closesAt: "12:00", breakStart: "", breakEnd: "", isClosed: false },
    { dayOfWeek: 1, opensAt: "14:00", closesAt: "20:00", breakStart: "", breakEnd: "", isClosed: false },
    { dayOfWeek: 2, opensAt: "14:00", closesAt: "18:00", breakStart: "", breakEnd: "", isClosed: false },
    { dayOfWeek: 3, opensAt: "11:30", closesAt: "20:00", breakStart: "", breakEnd: "", isClosed: false },
    { dayOfWeek: 4, opensAt: "11:30", closesAt: "19:30", breakStart: "", breakEnd: "", isClosed: false },
    { dayOfWeek: 5, opensAt: "13:30", closesAt: "21:00", breakStart: "", breakEnd: "", isClosed: false },
    { dayOfWeek: 6, opensAt: "07:00", closesAt: "20:00", breakStart: "", breakEnd: "", isClosed: false },
  ],
  commercial_day: [
    { dayOfWeek: 0, opensAt: "", closesAt: "", breakStart: "", breakEnd: "", isClosed: true },
    { dayOfWeek: 1, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
    { dayOfWeek: 2, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
    { dayOfWeek: 3, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
    { dayOfWeek: 4, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
    { dayOfWeek: 5, opensAt: "09:00", closesAt: "19:00", breakStart: "12:00", breakEnd: "13:00", isClosed: false },
    { dayOfWeek: 6, opensAt: "09:00", closesAt: "14:00", breakStart: "", breakEnd: "", isClosed: false },
  ],
  clear_all: Array.from({ length: 7 }, (_item, dayOfWeek) => ({
    dayOfWeek,
    opensAt: "",
    closesAt: "",
    breakStart: "",
    breakEnd: "",
    isClosed: true,
  })),
};

const agendaElements = {
  list: agendaList,
  metricsGrid: agendaMetricsGrid,
  queue: queueList,
};

function normalizeSessionRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "owner" || value === "recepcao" || value === "profissional") return value;
  return "owner";
}

function getSessionRole(session) {
  return normalizeSessionRole(session?.user?.role || session?.role);
}

function getStoredSessionRole() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_AUTH_SESSION) || "null");
    return getSessionRole(parsed);
  } catch (_error) {
    return "owner";
  }
}

const state = {
  role: getStoredSessionRole(),
  activeModule: restoreActiveModule(),
  viewport: getViewport(),
  mobileTab: "inicio",
  mobileMoreOpen: false,
  mobileSidebarOpen: false,
  agendaFiltersOpen: false,
  navBadges: {},
};
state.mobileTab = mapModuleToMobileTab(state.activeModule);
if (!isAllowedModule(state.activeModule)) {
  state.activeModule = firstAllowedModule();
  state.mobileTab = mapModuleToMobileTab(state.activeModule);
}

function canCheckoutAppointment() {
  return state.role === "owner" || state.role === "recepcao";
}

const STORAGE_THEME_MODE = "sb.themeMode";
const STORAGE_THEME_MODE_USER_SET = "sb.themeModeUserSet";
const systemThemeQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

if (localStorage.getItem(STORAGE_THEME_MODE) && localStorage.getItem(STORAGE_THEME_MODE_USER_SET) !== "true") {
  localStorage.removeItem(STORAGE_THEME_MODE);
}

function normalizeThemeMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  if (value === "dark" || value === "light" || value === "system") return value;
  return "system";
}

function resolveEffectiveTheme(themeMode) {
  const normalized = normalizeThemeMode(themeMode);
  if (normalized !== "system") return normalized;
  return systemThemeQuery?.matches ? "dark" : "light";
}

function applyThemeMode(themeMode, options = {}) {
  const persist = options.persist !== false;
  const normalized = normalizeThemeMode(themeMode);
  const effective = resolveEffectiveTheme(normalized);
  document.documentElement.setAttribute("data-theme-mode", normalized);
  document.documentElement.setAttribute("data-theme", effective);
  document.body.classList.toggle("theme-dark", effective === "dark");
  document.body.classList.toggle("theme-light", effective === "light");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", effective === "dark" ? "#0B0F14" : "#f2f1ed");
  }
  if (persist) {
    localStorage.setItem(STORAGE_THEME_MODE, normalized);
    if (options.userSet) {
      localStorage.setItem(STORAGE_THEME_MODE_USER_SET, "true");
    }
  }
}

function applyThemeFromSettingsPayload() {
  const localPreference = localStorage.getItem(STORAGE_THEME_MODE);
  applyThemeMode(localPreference || "system", { persist: Boolean(localPreference) });
}

if (systemThemeQuery) {
  const syncSystemTheme = () => {
    const selectedMode = normalizeThemeMode(localStorage.getItem(STORAGE_THEME_MODE));
    if (selectedMode !== "system") return;
    applyThemeMode(selectedMode, { persist: false });
  };
  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", syncSystemTheme);
  } else if (typeof systemThemeQuery.addListener === "function") {
    systemThemeQuery.addListener(syncSystemTheme);
  }
}

applyThemeMode(localStorage.getItem(STORAGE_THEME_MODE) || "system", { persist: false });

startsAt.value = asDateTimeLocalInputValue(new Date(Date.now() + 30 * 60000));
if (reportsCustomStart) reportsCustomStart.value = asDateInputValue(new Date());
if (reportsCustomEnd) reportsCustomEnd.value = asDateInputValue(new Date());
if (metasGoalMonth) metasGoalMonth.value = asMonthInputValue(new Date());
if (financialPeriod && financialCustomStart && financialCustomEnd) {
  const isCustomPeriod = financialPeriod.value === "custom";
  financialCustomStart.classList.toggle("hidden", !isCustomPeriod);
  financialCustomEnd.classList.toggle("hidden", !isCustomPeriod);
}
if (reportsPeriod && reportsCustomStart && reportsCustomEnd) {
  const isCustomPeriod = reportsPeriod.value === "custom";
  reportsCustomStart.classList.toggle("hidden", !isCustomPeriod);
  reportsCustomEnd.classList.toggle("hidden", !isCustomPeriod);
}

let authSession = restoreAuthSession();
unitId = getSessionUnitId(authSession);
state.role = getSessionRole(authSession);
if (!isAllowedModule(state.activeModule)) {
  state.activeModule = firstAllowedModule();
  state.mobileTab = mapModuleToMobileTab(state.activeModule);
}
if (inventorySearch) inventoryFilters.search = String(inventorySearch.value || "").trim();
if (inventoryCategoryFilter) inventoryFilters.category = inventoryCategoryFilter.value || "";
if (inventoryStatusFilter) inventoryFilters.status = inventoryStatusFilter.value || "ALL";

function restoreAuthSession() {
  const raw = localStorage.getItem(STORAGE_AUTH_SESSION);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function persistAuthSession(session) {
  authSession = session;
  unitId = getSessionUnitId(session);
  state.role = getSessionRole(session);
  if (!isAllowedModule(state.activeModule)) {
    state.activeModule = firstAllowedModule();
    state.mobileTab = mapModuleToMobileTab(state.activeModule);
  }
  localStorage.setItem(STORAGE_AUTH_SESSION, JSON.stringify(session));
  localStorage.setItem("authToken", session.accessToken);
}

function clearAuthSession() {
  authSession = null;
  unitId = "unit-01";
  localStorage.removeItem(STORAGE_AUTH_SESSION);
  localStorage.removeItem("authToken");
}

function getSessionUnitId(session) {
  return session?.user?.activeUnitId || session?.user?.unitIds?.[0] || "unit-01";
}

function redirectToLogin() {
  clearAuthSession();
  window.location.replace("/login");
}

function isAuthSessionValid(session = authSession) {
  if (!session?.accessToken || !session?.expiresAt) return false;
  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs > Date.now() + 30_000;
}

function buildCorrelationId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildOperationIdempotencyKey(action) {
  const suffix = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${action}-${suffix}`;
}

function buildAuthHeaders(baseHeaders) {
  const headers = new Headers(baseHeaders || {});
  if (authSession?.accessToken) {
    headers.set("Authorization", `Bearer ${authSession.accessToken}`);
  }
  headers.set("x-correlation-id", buildCorrelationId());
  return headers;
}

function getCurrentActorId() {
  return authSession?.user?.id || authSession?.user?.email || "system";
}

async function ensureAuthSession() {
  if (isAuthSessionValid()) return authSession;
  redirectToLogin();
  throw new Error("Sessao expirada. Faca login novamente.");
}

async function apiFetch(url, options = {}) {
  await ensureAuthSession();

  const execute = () =>
    window.fetch(url, {
      ...options,
      headers: buildAuthHeaders(options.headers),
    });

  let response = await execute();
  if (response.status === 401) {
    redirectToLogin();
  }
  return response;
}

function restoreActiveModule() {
  const stored = localStorage.getItem(STORAGE_ACTIVE_MODULE);
  if (stored === "agendamentos") return "agenda";
  if (stored === "dashboard") return "financeiro";
  if (stored && allModuleIds.has(stored)) return stored;
  return "financeiro";
}

function getViewport() {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1280) return "tablet";
  return "desktop";
}

function persistNavigationState() {
  localStorage.setItem(STORAGE_ACTIVE_MODULE, state.activeModule);
}

function getRoleMenuGroups() {
  return filterMenuGroupsByRole(MENU_GROUPS, state.role);
}

function getAllowedModules() {
  return getAllowedModulesForRole(state.role);
}

function isAllowedModule(moduleId) {
  if (moduleId === "dashboard") return isAllowedModule("financeiro");
  if (moduleId === "estoque" && getAllowedModules().includes("operacao")) return true;
  return getAllowedModules().includes(moduleId);
}

function firstAllowedModule() {
  const preferred = getDefaultModuleForRole(state.role);
  if (isAllowedModule(preferred)) return preferred;
  const allowed = getAllowedModules();
  if (allowed.length) return allowed[0];
  return "financeiro";
}

function getSecondaryModulesForRole() {
  return getRoleMenuGroups()
    .flatMap((group) => group.modules)
    .filter((module) => SECONDARY_MODULE_IDS.includes(module.id));
}

function getMobileTabsForRole() {
  const allowed = new Set(getAllowedModules());
  return MOBILE_TABS.filter((tab) => !tab.moduleId || allowed.has(tab.moduleId));
}

function renderShell() {
  const roleMenuGroups = getRoleMenuGroups();
  const secondaryModules = getSecondaryModulesForRole();
  const mobileTabs = getMobileTabsForRole();
  const isSettingsMode = state.activeModule === "configuracoes";

  appShell?.classList.toggle("settings-mode", isSettingsMode);
  appShell?.classList.toggle("mobile-sidebar-open", state.mobileSidebarOpen);
  syncMobileHeaderButtons();

  appSidebar.innerHTML = isSettingsMode
    ? renderSettingsSidebar({
        activeSection: settingsActiveSection,
        user: authSession?.user,
        accountMenuOpen,
      })
    : renderSidebar({
        groups: roleMenuGroups,
        activeModule: state.activeModule === "estoque" ? "operacao" : state.activeModule,
        badges: state.navBadges,
        user: authSession?.user,
        accountMenuOpen,
        canOpenSettings: isAllowedModule("configuracoes"),
      });

  appMobileTabs.innerHTML = renderMobileTabs({
    tabs: mobileTabs,
    activeTab: state.mobileTab,
    showMoreSheet: state.mobileMoreOpen,
    secondaryModules,
    activeModule: state.activeModule,
  });

  bindShellEvents();
  syncAgendaFilterPanel();
}

function setMobileSidebarOpen(open) {
  state.mobileSidebarOpen = Boolean(open) && state.viewport !== "desktop";
  appShell?.classList.toggle("mobile-sidebar-open", state.mobileSidebarOpen);
  syncMobileHeaderButtons();
}

function renderMobileHeaderButton() {
  return `
    <button class="mobile-sidebar-toggle" type="button" data-mobile-sidebar-toggle aria-label="Abrir menu" aria-controls="appSidebar" aria-expanded="false">
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
    </button>
  `;
}

function syncMobileHeaderButtons() {
  document.querySelectorAll(".op-page-header, .settings-page-head").forEach((header) => {
    if (!header.querySelector("[data-mobile-sidebar-toggle]")) {
      header.insertAdjacentHTML("afterbegin", renderMobileHeaderButton());
    }
  });
  document.querySelectorAll("[data-mobile-sidebar-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", state.mobileSidebarOpen ? "true" : "false");
    button.setAttribute("aria-label", state.mobileSidebarOpen ? "Fechar menu" : "Abrir menu");
  });
}

const mobileHeaderObserver = new MutationObserver(() => syncMobileHeaderButtons());
if (appContent) {
  mobileHeaderObserver.observe(appContent, { childList: true, subtree: true });
}

function bindShellEvents() {
  appSidebar.querySelectorAll("[data-settings-shell-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-settings-shell-action");
      if (action === "back") {
        setMobileSidebarOpen(false);
        const fallback = isAllowedModule(settingsReturnModule) ? settingsReturnModule : firstAllowedModule();
        navigate(fallback);
      }
    });
  });

  appSidebar.querySelectorAll('[data-settings-action="select-settings-section"]').forEach((button) => {
    button.addEventListener("click", () => {
      settingsActiveSection = button.getAttribute("data-settings-section") || "business";
      setMobileSidebarOpen(false);
      renderShell();
      renderSettingsData(settingsElements, currentSettingsPayload || {}, {
        professionals: Object.values(professionalsById),
        services: allServices,
      }, settingsActiveSection);
      animateSettingsScreen(settingsRoot);
      const hoursForm = settingsRoot?.querySelector("#settingsHoursForm");
      if (hoursForm instanceof HTMLFormElement) {
        refreshSettingsHoursPreview(hoursForm);
      }
      renderSaleFeedback("", "", settingsFeedback);
    });
  });

  appSidebar.querySelectorAll("[data-sidebar-module]").forEach((button) => {
    button.addEventListener("click", () => {
      accountMenuOpen = false;
      setMobileSidebarOpen(false);
      appSidebar.querySelectorAll("[data-sidebar-module]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      navigate(button.dataset.sidebarModule);
    });
  });

  appSidebar.querySelectorAll("[data-sidebar-toggle-group]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.sidebarToggleGroup;
      const groupEl = appSidebar.querySelector(`[data-sidebar-group="${groupId}"]`);
      if (groupEl) groupEl.classList.toggle("is-open");
    });
  });

  appSidebar.querySelectorAll("[data-account-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const action = button.getAttribute("data-account-action");
      if (action === "toggle") {
        accountMenuOpen = !accountMenuOpen;
        renderShell();
        return;
      }
      accountMenuOpen = false;
      if (action === "settings") {
        if (!isAllowedModule("configuracoes")) return;
        setMobileSidebarOpen(false);
        settingsActiveSection = settingsActiveSection || "business";
        if (state.activeModule !== "configuracoes") settingsReturnModule = state.activeModule;
        navigate("configuracoes");
        if (currentSettingsPayload) {
          renderSettingsData(settingsElements, currentSettingsPayload, {
            professionals: Object.values(professionalsById),
            services: allServices,
          }, settingsActiveSection);
          animateSettingsScreen(settingsRoot);
        }
        return;
      }
      if (action === "user") {
        if (!isAllowedModule("configuracoes")) return;
        setMobileSidebarOpen(false);
        settingsActiveSection = "usuario";
        if (state.activeModule !== "configuracoes") settingsReturnModule = state.activeModule;
        navigate("configuracoes");
        if (currentSettingsPayload) {
          renderSettingsData(settingsElements, currentSettingsPayload, {
            professionals: Object.values(professionalsById),
            services: allServices,
          }, settingsActiveSection);
          animateSettingsScreen(settingsRoot);
        }
        return;
      }
      if (action === "logout") {
        clearAuthSession();
        window.location.replace("/login");
      }
    });
  });

  if (toggleAgendaFiltersBtn) {
    toggleAgendaFiltersBtn.onclick = () => {
      state.agendaFiltersOpen = !state.agendaFiltersOpen;
      syncAgendaFilterPanel();
    };
  }

  appMobileTabs.querySelectorAll("[data-mobile-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const mobileTabs = getMobileTabsForRole();
      const tabId = button.dataset.mobileTab;
      if (tabId === "mais") {
        state.mobileTab = "mais";
        state.mobileMoreOpen = !state.mobileMoreOpen;
        renderShell();
        applySectionVisibility();
        return;
      }

      const tabMeta = mobileTabs.find((tab) => tab.id === tabId);
      state.mobileMoreOpen = false;
      if (tabMeta?.moduleId) navigate(tabMeta.moduleId);
    });
  });

  appMobileTabs.querySelectorAll("[data-mobile-module]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileMoreOpen = false;
      navigate(button.dataset.mobileModule);
    });
  });

  if (mobileSidebarBackdrop) mobileSidebarBackdrop.onclick = () => {
    setMobileSidebarOpen(false);
  };
}

document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("[data-mobile-sidebar-toggle]")) {
    setMobileSidebarOpen(!state.mobileSidebarOpen);
    return;
  }
  if (!accountMenuOpen) return;
  if (event.target instanceof Element && event.target.closest("#appSidebar .sb-account")) return;
  accountMenuOpen = false;
  renderShell();
});

function syncAgendaFilterPanel() {
  if (!agendaFiltersPanel || !toggleAgendaFiltersBtn) return;
  if (state.viewport !== "mobile") {
    agendaFiltersPanel.classList.remove("is-open");
    toggleAgendaFiltersBtn.textContent = "Filtros";
    return;
  }
  agendaFiltersPanel.classList.toggle("is-open", state.agendaFiltersOpen);
  toggleAgendaFiltersBtn.textContent = state.agendaFiltersOpen ? "Ocultar filtros" : "Mostrar filtros";
}

function syncMobileOperationActions() {
  if (!mobileOperationActions) return;
  mobileOperationActions.classList.add("hidden");
}

function navigate(moduleId, options = {}) {
  const normalizedModuleId =
    moduleId === "agendamentos" ? "agenda" : moduleId === "dashboard" ? "financeiro" : moduleId;
  if (!normalizedModuleId || !allModuleIds.has(normalizedModuleId) || !isAllowedModule(normalizedModuleId)) return;

  if (normalizedModuleId === "configuracoes" && state.activeModule !== "configuracoes") {
    settingsReturnModule = state.activeModule || firstAllowedModule();
  }
  state.activeModule = normalizedModuleId;
  state.mobileTab = mapModuleToMobileTab(normalizedModuleId);
  if (state.mobileTab !== "mais") state.mobileMoreOpen = false;
  if (normalizedModuleId !== "agenda") state.agendaFiltersOpen = false;

  persistNavigationState();
  renderShell();
  applySectionVisibility();

  if (options.scrollTop !== false) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function parseDashboardActionPayload(encoded) {
  if (!encoded) return {};
  try {
    return JSON.parse(decodeURIComponent(encoded));
  } catch (_error) {
    return {};
  }
}

const dashboardPlaybookContext = {
  suggestionId: "",
  actionType: "",
  estimatedImpact: 0,
};

function renderDashboardPlaybook(actionType, payload = {}) {
  if (!dashboardPlaybookPanel) return;
  const steps = Array.isArray(payload.playbookSteps) ? payload.playbookSteps : [];
  const clients = Array.isArray(payload.suggestedClients) ? payload.suggestedClients : [];
  const windows = Array.isArray(payload.idleWindows) ? payload.idleWindows : [];

  const details =
    actionType === "REACTIVATION_CAMPAIGN"
      ? clients
          .slice(0, 3)
          .map(
            (client) =>
              `<li class="ds-cell-secondary">${client.fullName || "Cliente"} (${Number(client.daysWithoutReturn || 0)} dias) - impacto ${Number(client.estimatedImpact || 0).toFixed(2)}</li>`,
          )
          .join("")
      : actionType === "FILL_IDLE_SLOTS"
        ? windows
            .slice(0, 3)
            .map(
              (windowItem) =>
                `<li class="ds-cell-secondary">${windowItem.professionalName || "Profissional"} | faixa ${windowItem.band || "-"} | ${windowItem.horizonHours || 0}h</li>`,
            )
            .join("")
        : "";

  const executeButton =
    actionType === "REACTIVATION_CAMPAIGN"
      ? `
        <button
          type="button"
          class="ux-btn ux-btn-success"
          data-playbook-execute-reactivation="1"
        >
          Executar campanha de reativacao agora
        </button>
      `
      : "";

  dashboardPlaybookPanel.innerHTML = `
    <div class="panel-msg panel-msg-success">
      <p class="ds-cell-primary">Playbook: ${actionType || "ACAO"}</p>
      <ol>${steps.map((step) => `<li class="ds-cell-secondary">${step}</li>`).join("") || "<li class='ds-cell-secondary'>Sem passos detalhados.</li>"}</ol>
      ${details ? `<ul>${details}</ul>` : ""}
      <div>${executeButton}</div>
    </div>
  `;
}

async function reportDashboardSuggestionTelemetry(input = {}) {
  const suggestionId = String(input.suggestionId || "").trim();
  const actionType = String(input.actionType || "").trim();
  const outcome = String(input.outcome || "").trim();
  if (!suggestionId || !actionType || !outcome) return;
  try {
    await callJson(`${API}/dashboard/suggestions/${encodeURIComponent(suggestionId)}/telemetry`, "POST", {
      unitId,
      actionType,
      outcome,
      estimatedImpact: Number(input.estimatedImpact || 0),
      realizedRevenue:
        typeof input.realizedRevenue === "number" ? Number(input.realizedRevenue) : undefined,
      sourceModule: input.sourceModule || "dashboard",
      playbookType: input.playbookType || undefined,
      note: input.note ? String(input.note) : undefined,
    });
  } catch (_error) {
    // Telemetria nao pode interromper o fluxo operacional.
  }
}

async function executeReactivationPlaybook(payload = {}) {
  try {
    await callJson(`${API}/automations/campaigns/execute`, "POST", {
      unitId,
      campaignType: "REATIVACAO_SMART_DASHBOARD",
      riskLevel: "HIGH",
      ruleId: undefined,
      sourceModule: "dashboard",
      sourceSuggestionId: dashboardPlaybookContext.suggestionId || undefined,
      playbookType: "REACTIVATION",
    });
    renderSaleFeedback(
      "success",
      "Campanha de reativacao disparada com sucesso a partir do dashboard.",
      automacoesFeedback,
    );
    renderDashboardPlaybook("REACTIVATION_CAMPAIGN", {
      ...payload,
      playbookSteps: [
        "Campanha enviada.",
        "Acompanhe execucoes no modulo de Automacoes.",
        "Revise conversao em 24h para ajustar proxima rodada.",
      ],
    });
    await reportDashboardSuggestionTelemetry({
      suggestionId: dashboardPlaybookContext.suggestionId || "action-reactivation-top3",
      actionType: dashboardPlaybookContext.actionType || "REACTIVATION_CAMPAIGN",
      outcome: "CONVERTED",
      estimatedImpact: Number(dashboardPlaybookContext.estimatedImpact || 0),
      realizedRevenue: Number(dashboardPlaybookContext.estimatedImpact || 0),
      sourceModule: "dashboard",
      playbookType: "REACTIVATION",
      note: "Campanha de reativacao disparada via playbook do dashboard.",
    });
    navigate("automacoes");
    await loadAll();
  } catch (error) {
    renderSaleFeedback(
      "error",
      error?.message || "Nao foi possivel disparar campanha de reativacao.",
      automacoesFeedback,
    );
  }
}

function buildDashboardAutomationSignals(automacoesPayload) {
  const rows = Array.isArray(automacoesPayload?.executions?.executions)
    ? automacoesPayload.executions.executions
    : [];
  const summary = automacoesPayload?.executions?.summary ?? {};
  const byCampaign = new Map();
  let lastExecutedAt = null;
  for (const row of rows) {
    const key = String(row.campaignType || "N/A");
    byCampaign.set(key, Number(byCampaign.get(key) || 0) + 1);
    if (row.startedAt) {
      const currentTs = new Date(row.startedAt).getTime();
      const lastTs = lastExecutedAt ? new Date(lastExecutedAt).getTime() : 0;
      if (Number.isFinite(currentTs) && currentTs > lastTs) {
        lastExecutedAt = row.startedAt;
      }
    }
  }
  const topPlaybooks = Array.from(byCampaign.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, total]) => ({ label, total }));

  return {
    queued: Number(summary.pending || 0),
    executed: Number(summary.success || 0),
    failed: Number(summary.failed || 0),
    lastExecutedAt,
    topPlaybooks,
  };
}

function buildRevenueMachineDashboardPayload(options = {}) {
  const dashboardPayload = options.dashboardPayload || {};
  return {
    ...dashboardPayload,
    automationSignals: options.dashboardAutomationSignals || {
      queued: 0,
      executed: 0,
      failed: 0,
      lastExecutedAt: null,
      topPlaybooks: [],
    },
    clientsOverview: options.clientsPayload || null,
    financialOverview: options.financialPayload?.management || null,
    stockOverview: options.stockPayload || null,
    automationsOverview: options.automacoesPayload || null,
    scoringOverview: options.automacoesPayload?.scoringOverview || null,
  };
}

function buildClientsAutomationSignals(clientsPayload, automacoesPayload) {
  const clients = Array.isArray(clientsPayload?.clients) ? clientsPayload.clients : [];
  const rows = Array.isArray(automacoesPayload?.executions?.executions)
    ? automacoesPayload.executions.executions
    : [];
  const clientById = new Map(clients.map((item) => [item.clientId, item]));
  const recentByClient = new Map();
  let reactivationPlaybookExecutions = 0;

  for (const row of rows) {
    const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
    const clientIdValue = row.clientId || payload.clientId || null;
    if (!clientIdValue) continue;
    const playbookType = String(payload.playbookType || "");
    const campaignType = String(row.campaignType || "");
    if (
      playbookType === "REACTIVATION" ||
      campaignType.toLowerCase().includes("reativacao")
    ) {
      reactivationPlaybookExecutions += 1;
    }
    const currentStartedAt = row.startedAt ? new Date(row.startedAt).getTime() : 0;
    const previous = recentByClient.get(clientIdValue);
    const previousStartedAt = previous?.lastAutomationAt
      ? new Date(previous.lastAutomationAt).getTime()
      : 0;
    if (!previous || currentStartedAt >= previousStartedAt) {
      const clientRow = clientById.get(clientIdValue);
      recentByClient.set(clientIdValue, {
        clientId: clientIdValue,
        fullName:
          clientRow?.fullName || row.clientName || payload.clientName || `Cliente ${clientIdValue}`,
        lastAutomationType: playbookType || campaignType || "-",
        lastAutomationAt: row.startedAt || null,
      });
    }
  }

  const recentClients = Array.from(recentByClient.values())
    .sort((a, b) => {
      const left = a.lastAutomationAt ? new Date(a.lastAutomationAt).getTime() : 0;
      const right = b.lastAutomationAt ? new Date(b.lastAutomationAt).getTime() : 0;
      return right - left;
    })
    .slice(0, 6);

  return {
    clientsWithRecentAutomation: recentByClient.size,
    reactivationPlaybookExecutions,
    recentClients,
  };
}

function resetAutomationRuleForm() {
  if (!automationRuleForm) return;
  if (
    !automationRuleId ||
    !automationRuleName ||
    !automationRuleTriggerType ||
    !automationRuleChannel ||
    !automationRuleTarget ||
    !automationRuleMessageTemplate
  ) {
    return;
  }
  automationRuleId.value = "";
  automationRuleName.value = "";
  automationRuleTriggerType.value = "INACTIVITY";
  automationRuleChannel.value = "WHATSAPP";
  automationRuleTarget.value = "SEGMENT";
  automationRuleMessageTemplate.value = "";
  if (automationRuleSubmitBtn) {
    automationRuleSubmitBtn.textContent = "Salvar regra";
  }
}

function fillAutomationRuleForm(rule) {
  if (
    !rule ||
    !automationRuleForm ||
    !automationRuleId ||
    !automationRuleName ||
    !automationRuleTriggerType ||
    !automationRuleChannel ||
    !automationRuleTarget ||
    !automationRuleMessageTemplate
  ) {
    return;
  }
  automationRuleId.value = rule.id || "";
  automationRuleName.value = rule.name || "";
  automationRuleTriggerType.value = rule.triggerType || "INACTIVITY";
  automationRuleChannel.value = rule.channel || "WHATSAPP";
  automationRuleTarget.value = rule.target || "SEGMENT";
  automationRuleMessageTemplate.value = rule.messageTemplate || "";
  if (automationRuleSubmitBtn) {
    automationRuleSubmitBtn.textContent = "Atualizar regra";
  }
  automationRuleName.focus();
}

async function handleDashboardSuggestionAction(button) {
  const suggestionId = button.dataset.suggestionId || "";
  const ctaModule = button.dataset.ctaModule || "";
  const actionType = button.dataset.actionType || "";
  const estimatedImpact = Number(button.dataset.estimatedImpact || 0);
  const payload = parseDashboardActionPayload(button.dataset.actionPayload || "");

  dashboardPlaybookContext.suggestionId = suggestionId;
  dashboardPlaybookContext.actionType = actionType;
  dashboardPlaybookContext.estimatedImpact = estimatedImpact;

  await reportDashboardSuggestionTelemetry({
    suggestionId: suggestionId || `manual-${actionType || "unknown"}`,
    actionType: actionType || "UPSELL_COMBO",
    outcome: "EXECUTED",
    estimatedImpact,
    sourceModule: "dashboard",
    playbookType:
      actionType === "REACTIVATION_CAMPAIGN"
        ? "REACTIVATION"
        : actionType === "FILL_IDLE_SLOTS"
          ? "IDLE_WINDOW_FILL"
          : "FORECAST_PROTECTION",
    note: "CTA da sugestao executado no dashboard.",
  });

  if (ctaModule && allModuleIds.has(ctaModule) && isAllowedModule(ctaModule)) {
    navigate(ctaModule);
  }

  if (actionType === "REACTIVATION_CAMPAIGN") {
    if (retentionRiskFilter) retentionRiskFilter.value = "HIGH";
    if (automacoesRiskFilter) automacoesRiskFilter.value = "HIGH";
  }
  if (actionType === "FILL_IDLE_SLOTS") {
    if (filterPeriod) filterPeriod.value = "week";
  }
  if (actionType === "UPSELL_COMBO") {
    if (clientsPeriod) clientsPeriod.value = "today";
  }

  if (payload && typeof payload === "object") {
    if (payload.moduleId && allModuleIds.has(payload.moduleId) && isAllowedModule(payload.moduleId)) {
      navigate(payload.moduleId, { scrollTop: false });
    }
  }

  renderDashboardPlaybook(actionType, payload);
  await loadAll();
}

async function handleDashboardSuggestionIgnore(button) {
  const suggestionId = button.dataset.suggestionId || "";
  const actionType = button.dataset.actionType || "";
  const estimatedImpact = Number(button.dataset.estimatedImpact || 0);
  await reportDashboardSuggestionTelemetry({
    suggestionId: suggestionId || `manual-${actionType || "unknown"}`,
    actionType: actionType || "UPSELL_COMBO",
    outcome: "IGNORED",
    estimatedImpact,
    sourceModule: "dashboard",
    playbookType:
      actionType === "REACTIVATION_CAMPAIGN"
        ? "REACTIVATION"
        : actionType === "FILL_IDLE_SLOTS"
          ? "IDLE_WINDOW_FILL"
          : "FORECAST_PROTECTION",
    note: "Sugestao ignorada manualmente no dashboard.",
  });
  await loadAll();
}

function updateNavigationBadges(snapshot = {}) {
  state.navBadges = {
    agenda: Number(snapshot.lateCount || 0),
    estoque: Number(snapshot.lowStockCount || 0),
    automacoes: Number(snapshot.failedAutomations || 0),
  };
}

function applySectionVisibility() {
  Object.values(sectionsByModule).forEach((section) => {
    section.classList.add("hidden");
  });
  placeholderSection.classList.add("hidden");
  if (agendaCardsMode) agendaCardsMode.classList.add("hidden");
  if (agendaCalendarMode) agendaCalendarMode.classList.add("hidden");
  if (agendaListMode) agendaListMode.classList.add("hidden");

  const implemented = sectionsByModule[state.activeModule];
  if (implemented) {
    implemented.classList.remove("hidden");
    if (state.activeModule === "agenda") {
      if (agendaCardsMode) agendaCardsMode.classList.remove("hidden");
      if (currentView === "list") {
        if (agendaListMode) agendaListMode.classList.remove("hidden");
      } else {
        if (agendaCalendarMode) agendaCalendarMode.classList.remove("hidden");
      }
    }
    if (state.activeModule === "whatsapp") {
      initWhatsAppSection();
    }
    if (state.activeModule === "agendamento-link") {
      initBookingLinkSection();
    }
    syncMobileOperationActions();
    return;
  }

  renderPlaceholderModule();
  placeholderSection.classList.remove("hidden");
  syncMobileOperationActions();
}

function renderPlaceholderModule() {
  const label = getModuleLabel(state.activeModule);
  placeholderSection.innerHTML = `
    <article class="placeholder-module ux-card">
      <h2 class="ux-section-label">${label}</h2>
      <p class="ds-text-muted">Modulo em preparacao. A navegacao ja esta pronta no App Shell premium.</p>
      <button type="button" class="ux-btn ux-btn-muted" data-go-dashboard>Voltar para Financeiro</button>
    </article>
  `;

  const goHomeBtn = placeholderSection.querySelector("[data-go-dashboard]");
  if (goHomeBtn) goHomeBtn.addEventListener("click", () => navigate("financeiro"));
}

function isoDayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function rangeFromPeriod(period) {
  if (period === "custom") {
    const startValue = financialCustomStart?.value;
    const endValue = financialCustomEnd?.value;
    if (startValue && endValue) {
      const start = new Date(`${startValue}T00:00:00`);
      const end = new Date(`${endValue}T23:59:59.999`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        return { start, end };
      }
    }
  }
  const now = new Date();
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (period === "week") {
    const start = new Date(now);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === "quarter") {
    const start = new Date(now);
    start.setDate(start.getDate() - 89);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function rangeFromReportsPeriod(period) {
  if (period === "custom") {
    const startValue = reportsCustomStart?.value;
    const endValue = reportsCustomEnd?.value;
    if (startValue && endValue) {
      const start = new Date(`${startValue}T00:00:00`);
      const end = new Date(`${endValue}T23:59:59.999`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        return { start, end };
      }
    }
  }
  return rangeFromPeriod(period || "month");
}

function reportsPeriodLabel(range = {}) {
  const start = range.start instanceof Date ? range.start : new Date(range.start);
  const end = range.end instanceof Date ? range.end : new Date(range.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Periodo selecionado";
  return `${start.toLocaleDateString("pt-BR")} ate ${end.toLocaleDateString("pt-BR")}`;
}

function previousRangeFromCurrent(range) {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const diffMs = Math.max(0, endMs - startMs);
  const compareEnd = new Date(startMs - 1);
  const compareStart = new Date(compareEnd.getTime() - diffMs);
  return { compareStart, compareEnd };
}

function asDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asDateTimeLocalInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function asMonthInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function rangeFromAppointmentFilters() {
  const period = (appointmentsFilterPeriod?.value || "today").toLowerCase();
  const selectedDate = appointmentsFilterDate?.value
    ? new Date(`${appointmentsFilterDate.value}T00:00:00`)
    : new Date();
  if (period === "today") {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: `Hoje (${start.toLocaleDateString("pt-BR")})`, period };
  }
  if (period === "tomorrow") {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: `Amanha (${start.toLocaleDateString("pt-BR")})`, period };
  }
  if (period === "week") {
    const start = new Date(selectedDate);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return {
      start,
      end,
      label: `Semana ${start.toLocaleDateString("pt-BR")} - ${end.toLocaleDateString("pt-BR")}`,
      period,
    };
  }
  const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    start,
    end,
    label: `Mes ${selectedDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
    period,
  };
}

let _clientsForSearch = [];
function initClientSearch(clients) {
  _clientsForSearch = clients || [];
  if (!clientSearch || !clientSearchDropdown) return;
  clientSearch.oninput = () => {
    const q = clientSearch.value.trim().toLowerCase();
    if (!q) { clientSearchDropdown.classList.add("hidden"); clientId.value = ""; return; }
    const matches = _clientsForSearch.filter(c =>
      c.fullName.toLowerCase().includes(q) || (c.phone || "").replace(/\D/g,"").includes(q.replace(/\D/g,""))
    ).slice(0, 8);
    if (!matches.length) { clientSearchDropdown.classList.add("hidden"); return; }
    clientSearchDropdown.innerHTML = matches.map(c =>
      `<li class="cs-opt" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.fullName)}">
        <span class="cs-name">${escapeHtml(c.fullName)}</span>
        ${c.phone ? `<span class="cs-phone">${escapeHtml(c.phone)}</span>` : ""}
      </li>`
    ).join("");
    clientSearchDropdown.querySelectorAll(".cs-opt").forEach(li => {
      li.addEventListener("click", () => {
        clientId.value = li.dataset.id;
        clientSearch.value = li.dataset.name;
        clientSearchDropdown.classList.add("hidden");
        clientId.dispatchEvent(new Event("change"));
      });
    });
    clientSearchDropdown.classList.remove("hidden");
  };
  document.addEventListener("click", e => {
    if (clientSearch && !clientSearch.contains(e.target) && !clientSearchDropdown.contains(e.target))
      clientSearchDropdown.classList.add("hidden");
  }, { once: false });
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function productCategory(product = {}) {
  return String(product.category || "Sem categoria").trim() || "Sem categoria";
}

function productImageUrl(product = {}) {
  const direct = String(product.imageUrl || product.imageURL || product.image || "").trim();
  if (direct) return direct;
  const notes = String(product.notes || "");
  const match = notes.match(/(?:Imagem|Image|imageUrl):\s*(https?:\/\/\\S+)/i);
  return match ? match[1].trim() : "";
}

function stripProductImageNote(notes = "") {
  return String(notes || "")
    .split(/\n/)
    .filter((line) => !/^\s*(?:Imagem|Image|imageUrl):/i.test(line))
    .join("\n")
    .trim();
}

function composeProductNotes(notes = "", imageUrl = "") {
  const cleanNotes = stripProductImageNote(notes);
  const cleanImage = String(imageUrl || "").trim();
  return [cleanNotes, cleanImage ? `Imagem: ${cleanImage}` : ""].filter(Boolean).join("\n");
}

function productInitials(product = {}) {
  return String(product.name || "Produto")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "P";
}

const CAMERA_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

function renderProductThumb(product = {}, className = "pdv-product-thumb") {
  const imageUrl = productImageUrl(product);
  if (imageUrl) {
    return `<div class="${className} has-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name || "Produto")}" loading="lazy" /></div>`;
  }
  const isMktThumb = className.includes("pdv-mkt-thumb");
  return `<div class="${className} pdv-thumb-placeholder">${isMktThumb ? CAMERA_ICON_SVG : escapeHtml(productInitials(product))}</div>`;
}

function isSlotBlockingStatus(status) {
  return SLOT_BLOCKING_STATUSES.has(String(status || "").trim());
}

function parseTimeToMinutes(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parts = text.split(":");
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function settingsHoursReadRow(form, dayOfWeek) {
  if (!(form instanceof HTMLFormElement)) return null;
  const checkbox = form.querySelector(`input[name="closed_${dayOfWeek}"]`);
  const opensAtInput = form.querySelector(`input[name="opensAt_${dayOfWeek}"]`);
  const closesAtInput = form.querySelector(`input[name="closesAt_${dayOfWeek}"]`);
  const breakStartInput = form.querySelector(`input[name="breakStart_${dayOfWeek}"]`);
  const breakEndInput = form.querySelector(`input[name="breakEnd_${dayOfWeek}"]`);
  if (
    !(checkbox instanceof HTMLInputElement) ||
    !(opensAtInput instanceof HTMLInputElement) ||
    !(closesAtInput instanceof HTMLInputElement) ||
    !(breakStartInput instanceof HTMLInputElement) ||
    !(breakEndInput instanceof HTMLInputElement)
  ) {
    return null;
  }
  return {
    dayOfWeek,
    isClosed: checkbox.checked,
    opensAt: String(opensAtInput.value || "").trim(),
    closesAt: String(closesAtInput.value || "").trim(),
    breakStart: String(breakStartInput.value || "").trim(),
    breakEnd: String(breakEndInput.value || "").trim(),
  };
}

function settingsHoursApplyClosedState(form, dayOfWeek, isClosed) {
  if (!(form instanceof HTMLFormElement)) return;
  ["opensAt_", "closesAt_", "breakStart_", "breakEnd_"].forEach((prefix) => {
    const input = form.querySelector(`input[name="${prefix}${dayOfWeek}"]`);
    if (!(input instanceof HTMLInputElement)) return;
    input.disabled = isClosed;
    if (isClosed) input.value = "";
  });
  const dayCard = form.querySelector(`input[name="closed_${dayOfWeek}"]`)?.closest(".cfg-day");
  dayCard?.classList.toggle("is-closed", isClosed);
}

function settingsHoursFormatRow(row) {
  if (!row || row.isClosed || !row.opensAt || !row.closesAt) return "Fechado";
  if (row.breakStart && row.breakEnd) {
    return `${row.opensAt} as ${row.closesAt}, pausa ${row.breakStart} as ${row.breakEnd}`;
  }
  return `${row.opensAt} as ${row.closesAt}`;
}

function refreshSettingsHoursPreview(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const previewList = form.querySelector(".cfg-hours-preview-list");
  if (!previewList) return;
  previewList.innerHTML = SETTINGS_DAY_LABELS.map((label, dayOfWeek) => {
    const row = settingsHoursReadRow(form, dayOfWeek);
    return `<p><strong>${label}:</strong> ${settingsHoursFormatRow(row)}</p>`;
  }).join("");
}

function applySettingsHoursPreset(form, presetId) {
  if (!(form instanceof HTMLFormElement)) return false;
  const presetRows = SETTINGS_HOURS_PRESETS[presetId];
  if (!Array.isArray(presetRows) || !presetRows.length) return false;
  presetRows.forEach((row) => {
    const dayOfWeek = Number(row.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return;
    const checkbox = form.querySelector(`input[name="closed_${dayOfWeek}"]`);
    const opensAtInput = form.querySelector(`input[name="opensAt_${dayOfWeek}"]`);
    const closesAtInput = form.querySelector(`input[name="closesAt_${dayOfWeek}"]`);
    const breakStartInput = form.querySelector(`input[name="breakStart_${dayOfWeek}"]`);
    const breakEndInput = form.querySelector(`input[name="breakEnd_${dayOfWeek}"]`);
    if (!(checkbox instanceof HTMLInputElement)) return;
    checkbox.checked = Boolean(row.isClosed);
    if (opensAtInput instanceof HTMLInputElement) opensAtInput.value = row.opensAt || "";
    if (closesAtInput instanceof HTMLInputElement) closesAtInput.value = row.closesAt || "";
    if (breakStartInput instanceof HTMLInputElement) breakStartInput.value = row.breakStart || "";
    if (breakEndInput instanceof HTMLInputElement) breakEndInput.value = row.breakEnd || "";
    settingsHoursApplyClosedState(form, dayOfWeek, checkbox.checked);
  });
  refreshSettingsHoursPreview(form);
  return true;
}

function copyDayHoursToNextDays(form, sourceDay) {
  if (!(form instanceof HTMLFormElement)) return false;
  const source = settingsHoursReadRow(form, sourceDay);
  if (!source || sourceDay >= 6) return false;
  let copied = 0;
  for (let day = sourceDay + 1; day <= 6; day += 1) {
    const checkbox = form.querySelector(`input[name="closed_${day}"]`);
    const opensAtInput = form.querySelector(`input[name="opensAt_${day}"]`);
    const closesAtInput = form.querySelector(`input[name="closesAt_${day}"]`);
    const breakStartInput = form.querySelector(`input[name="breakStart_${day}"]`);
    const breakEndInput = form.querySelector(`input[name="breakEnd_${day}"]`);
    if (!(checkbox instanceof HTMLInputElement)) continue;
    checkbox.checked = source.isClosed;
    if (opensAtInput instanceof HTMLInputElement) opensAtInput.value = source.opensAt;
    if (closesAtInput instanceof HTMLInputElement) closesAtInput.value = source.closesAt;
    if (breakStartInput instanceof HTMLInputElement) breakStartInput.value = source.breakStart;
    if (breakEndInput instanceof HTMLInputElement) breakEndInput.value = source.breakEnd;
    settingsHoursApplyClosedState(form, day, checkbox.checked);
    copied += 1;
  }
  refreshSettingsHoursPreview(form);
  return copied > 0;
}

function normalizeWorkingHours(payload) {
  const weeklyInput = Array.isArray(payload?.weekly) ? payload.weekly : [];
  if (!weeklyInput.length) return null;
  const byDay = new Map();
  for (const entry of weeklyInput) {
    const day = Number(entry?.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const start = String(entry?.start || "").trim();
    const end = String(entry?.end || "").trim();
    const isClosed = Boolean(entry?.isClosed) || !start || !end;
    byDay.set(day, {
      day,
      label: String(entry?.label || ""),
      start: isClosed ? "" : start,
      end: isClosed ? "" : end,
      isClosed,
    });
  }
  return {
    timezone: String(payload?.timezone || "America/Sao_Paulo"),
    weekly: Array.from({ length: 7 }, (_item, day) => {
      const item = byDay.get(day);
      if (item) return item;
      return {
        day,
        label: "",
        start: "",
        end: "",
        isClosed: true,
      };
    }),
  };
}

function updateWorkingHoursFromPayload(payload) {
  const normalized = normalizeWorkingHours(payload);
  if (!normalized) return;
  currentWorkingHours = normalized;
}

function getWorkingHoursForDay(dayOfWeek) {
  if (!currentWorkingHours || !Array.isArray(currentWorkingHours.weekly)) return null;
  const found = currentWorkingHours.weekly.find((item) => item.day === dayOfWeek);
  return found || null;
}

function getWeekCalendarBounds() {
  const fallback = { startHour: 8, endHour: 20 };
  if (!currentWorkingHours || !Array.isArray(currentWorkingHours.weekly)) return fallback;
  const windows = currentWorkingHours.weekly
    .filter((row) => row && !row.isClosed && row.start && row.end)
    .map((row) => {
      const from = parseTimeToMinutes(row.start);
      const to = parseTimeToMinutes(row.end);
      if (from == null || to == null || to <= from) return null;
      return { from, to };
    })
    .filter(Boolean);
  if (!windows.length) return fallback;
  const min = Math.min(...windows.map((item) => item.from));
  const max = Math.max(...windows.map((item) => item.to));
  const startHour = Math.max(0, Math.floor(min / 60));
  const endHour = Math.min(24, Math.ceil(max / 60));
  if (endHour - startHour < 4) return fallback;
  return { startHour, endHour };
}

function fillSelect(select, items, label, options = {}) {
  if (!select) return;
  const blank = options.blankLabel ? `<option value="">${escapeHtml(options.blankLabel)}</option>` : "";
  select.innerHTML =
    blank + items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(label(item))}</option>`).join("");
}

function fillMultiSelect(select, items, label) {
  if (!select) return;
  select.innerHTML = items
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(label(item))}</option>`)
    .join("");
}

function setScheduleFeedback(type, message) {
  renderScheduleAssist(
    {
      client: clientsById[clientId.value],
      clientSummary: buildClientSummary(clientsById[clientId.value], currentAgenda),
      selectedService: servicesById[serviceId.value],
      relatedServices: suggestRelatedServices(servicesById[serviceId.value], allServices),
      professionalsById,
      feedback: { type, message },
    },
    scheduleAssistElements,
  );
}

function refreshScheduleAssist(feedback = null) {
  const selectedClient = clientsById[clientId.value];
  const selectedService = servicesById[serviceId.value];
  const relatedServices = suggestRelatedServices(selectedService, allServices);
  const clientSummary = buildClientSummary(selectedClient, currentAgenda);

  renderScheduleAssist(
    {
      client: selectedClient,
      clientSummary,
      selectedService,
      relatedServices,
      professionalsById,
      feedback: feedback || undefined,
    },
    scheduleAssistElements,
  );
}

function renderSaleCart() {
  renderCart(saleCart, cartElements, {
    onIncrease: (productId) => {
      const item = saleCart.find((row) => row.productId === productId);
      if (!item) return;
      try {
        saleCart = updateCartItemQty(saleCart, productId, item.quantity + 1);
        renderSaleCart();
        renderSaleProductCatalog();
      } catch (error) {
        renderSaleFeedback("warning", error.message, saleFeedback);
      }
    },
    onDecrease: (productId) => {
      const item = saleCart.find((row) => row.productId === productId);
      if (!item) return;
      if (item.quantity <= 1) {
        saleCart = removeCartItem(saleCart, productId);
      } else {
        saleCart = updateCartItemQty(saleCart, productId, item.quantity - 1);
      }
      renderSaleCart();
      renderSaleProductCatalog();
    },
    onRemove: (productId) => {
      saleCart = removeCartItem(saleCart, productId);
      renderSaleCart();
      renderSaleProductCatalog();
    },
  });
}

function saleProductsList() {
  return Object.values(productsById || {})
    .filter((item) => item && item.id && item.active !== false)
    .sort((a, b) => productCategory(a).localeCompare(productCategory(b), "pt-BR") || String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
}

function setSaleSelectedProduct(productId) {
  if (!saleProductId) return;
  saleProductId.value = productId || "";
  const product = productsById[productId];
  if (saleSelectedProductName) {
    saleSelectedProductName.textContent = product ? product.name : "Nenhum produto selecionado";
  }
  if (saleSelectedProductMeta) {
    saleSelectedProductMeta.textContent = product
      ? `${money(product.salePrice)} · estoque ${Number(product.stockQty ?? product.quantity ?? 0)}`
      : "Escolha uma categoria e selecione um produto.";
  }
  if (saleSelectedProductThumb) {
    const imageUrl = product ? productImageUrl(product) : "";
    saleSelectedProductThumb.className = `pdv-product-thumb${imageUrl ? " has-image" : ""}`;
    saleSelectedProductThumb.innerHTML = product
      ? imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name || "Produto")}" loading="lazy" />`
        : escapeHtml(productInitials(product))
      : "+";
  }
  renderSaleProductCatalog();
}

function renderSaleProductCatalog() {
  if (!saleCategoryList || !saleProductRail) return;
  const allProducts = saleProductsList();
  const searchTerm = String(pdvProductSearch?.value || "").trim().toLowerCase();
  const categories = [...new Set(allProducts.map(productCategory))];
  if (saleSelectedCategory && saleSelectedCategory !== "__ALL__" && !categories.includes(saleSelectedCategory)) {
    saleSelectedCategory = "__ALL__";
  }
  if (!saleSelectedCategory) saleSelectedCategory = "__ALL__";

  const pills = categories.length
    ? [
        `
          <button type="button" class="pdv-category-pill ${saleSelectedCategory === "__ALL__" ? "is-active" : ""}" data-sale-category="__ALL__">
            <span>Todos</span>
            <small>${allProducts.length}</small>
          </button>
        `,
        ...categories.map((category) => {
          const count = allProducts.filter((p) => productCategory(p) === category).length;
          return `
            <button type="button" class="pdv-category-pill ${category === saleSelectedCategory ? "is-active" : ""}" data-sale-category="${escapeHtml(category)}">
              <span>${escapeHtml(category)}</span>
              <small>${count}</small>
            </button>
          `;
        }),
      ].join("")
    : `<p class="pdv-helper-text">Cadastre produtos no estoque para vender.</p>`;

  saleCategoryList.innerHTML = pills;

  let visibleProducts = searchTerm
    ? allProducts.filter((p) => String(p.name || "").toLowerCase().includes(searchTerm) || productCategory(p).toLowerCase().includes(searchTerm))
    : saleSelectedCategory === "__ALL__"
      ? allProducts
      : allProducts.filter((p) => productCategory(p) === saleSelectedCategory);

  saleProductRail.innerHTML = visibleProducts.length
    ? visibleProducts
        .map((product) => {
          const stockQty = Number(product.stockQty ?? product.quantity ?? 0);
          const outOfStock = stockQty <= 0;
          const cartItem = saleCart.find((i) => i.productId === product.id);
          const inCart = cartItem ? cartItem.quantity : 0;
          return `
            <article class="pdv-mkt-product-card${outOfStock ? " is-out-of-stock" : ""}${inCart ? " is-in-cart" : ""}" data-mkt-product="${escapeHtml(product.id)}">
              <div class="pdv-mkt-thumb-wrap">
                ${renderProductThumb(product, "pdv-mkt-thumb")}
                ${inCart ? `<span class="pdv-mkt-cart-qty-badge">${inCart}</span>` : ""}
              </div>
              <div class="pdv-mkt-card-body">
                <p class="pdv-mkt-card-name">${escapeHtml(product.name || "Produto")}</p>
                <p class="pdv-mkt-card-price">${money(product.salePrice)}</p>
                <p class="pdv-mkt-card-stock">${outOfStock ? "Sem estoque" : `${stockQty} disponíveis`}</p>
              </div>
              <button
                type="button"
                class="pdv-mkt-add-btn"
                data-pdv-add-product="${escapeHtml(product.id)}"
                ${outOfStock ? "disabled" : ""}
                aria-label="Adicionar ${escapeHtml(product.name || "produto")} ao carrinho"
              >
                <span class="pdv-mkt-add-icon">+</span>
                <span class="pdv-mkt-add-label">${outOfStock ? "Sem estoque" : "Adicionar"}</span>
              </button>
            </article>
          `;
        })
        .join("")
    : `<div class="pdv-mkt-empty">${searchTerm ? `Nenhum produto encontrado para "${escapeHtml(searchTerm)}".` : "Nenhum produto nesta categoria."}</div>`;

  saleCategoryList.querySelectorAll("[data-sale-category]").forEach((button) => {
    button.addEventListener("click", () => {
      saleSelectedCategory = button.getAttribute("data-sale-category") || "";
      if (pdvProductSearch) pdvProductSearch.value = "";
      renderSaleProductCatalog();
    });
  });

  saleProductRail.querySelectorAll("[data-pdv-add-product]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const productId = btn.getAttribute("data-pdv-add-product");
      const product = productsById[productId];
      try {
        saleCart = addItemToCart(saleCart, product, 1);
        renderSaleCart();
        renderSaleProductCatalog();
        btn.classList.add("pdv-mkt-add-pulse");
        setTimeout(() => btn.classList.remove("pdv-mkt-add-pulse"), 500);
        const saleFeedback = document.getElementById("saleFeedback");
        renderSaleFeedback("success", `${product.name} adicionado ao carrinho.`, saleFeedback);
      } catch (error) {
        const saleFeedback = document.getElementById("saleFeedback");
        renderSaleFeedback("error", error.message || "Nao foi possivel adicionar item.", saleFeedback);
      }
    });
  });
}

function renderRecentSales() {
  if (!saleRecentList) return;
  if (!productSalesHistory.length) {
    saleRecentList.innerHTML = renderEmptyState({
      title: "Nenhuma venda encontrada.",
      description: "Registre uma venda ou ajuste os filtros para ampliar o historico.",
    });
    return;
  }
  saleRecentList.innerHTML = `<div class="pdv-history-list">${productSalesHistory
    .map(
      (sale) => `
        <button type="button" class="pdv-history-row" data-product-sale-detail="${sale.id}">
          <div class="pdv-history-identity">
            <strong class="pdv-history-name">${escapeHtml(sale.clientLabel)}</strong>
            <span class="pdv-history-meta">${escapeHtml(sale.soldAtLabel)} · ${escapeHtml(sale.itemsSummary)}</span>
          </div>
          <div class="pdv-history-chips">
            ${renderStatusChip(sale.status || "NOT_REFUNDED")}
          </div>
          <div class="pdv-history-total">
            <strong>${escapeHtml(sale.amount)}</strong>
          </div>
        </button>
      `,
    )
    .join("")}</div>`;
}

function productSaleStatusMeta(status) {
  if (status === "REFUNDED") {
    return { label: "Devolvida" };
  }
  if (status === "PARTIALLY_REFUNDED") {
    return { label: "Parcialmente devolvida" };
  }
  return { label: "Sem devolucao" };
}

function renderSaleDrawer(sale) {
  if (!saleDrawerHost || !sale) return;
  const items = Array.isArray(sale.items) ? sale.items : [];
  const refundableItems = items.filter((item) => Number(item.refundableQuantity || 0) > 0);
  saleDrawerHost.className = "";
  saleDrawerHost.innerHTML = renderEntityDrawer({
    id: "productSaleEntityDrawer",
    open: true,
    title: "Detalhe da venda",
    subtitle: `${sale.soldAtLabel} | ${sale.clientLabel}`,
    status: sale.status || "NOT_REFUNDED",
    summary: `
      <dl class="op-summary-grid">
        <div><dt>Data</dt><dd>${escapeHtml(sale.soldAtLabel)}</dd></div>
        <div><dt>Cliente</dt><dd>${escapeHtml(sale.clientLabel)}</dd></div>
        <div><dt>Profissional</dt><dd>${escapeHtml(sale.professionalLabel)}</dd></div>
        <div><dt>Total</dt><dd>${escapeHtml(sale.amount)}</dd></div>
        <div><dt>Devolucao</dt><dd>${renderStatusChip(sale.status || "NOT_REFUNDED")}</dd></div>
        <div><dt>Itens</dt><dd>${escapeHtml(sale.label)}</dd></div>
      </dl>
    `,
    details: `
      <div class="op-detail-list">
        <p><strong>Itens da venda</strong></p>
        <div class="pdv-drawer-items">
          ${items
            .map(
              (item) => `
                <div class="pdv-drawer-item">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>Vendido: ${item.quantity}</span>
                  <span>Devolvido: ${item.refundedQuantity || 0}</span>
                  <span>Disponivel para devolucao: ${item.refundableQuantity || 0}</span>
                  <span>Subtotal: R$ ${Number(item.unitPrice * item.quantity || 0).toFixed(2)}</span>
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
    `,
    history: `
      <ol class="op-history-list">
        <li><strong>Venda registrada</strong><span>${escapeHtml(sale.soldAtLabel)}</span></li>
        ${
          sale.totalRefundedAmount > 0
          ? `<li><strong>Devolucao registrada</strong><span>Total devolvido: R$ ${Number(sale.totalRefundedAmount).toFixed(2)}</span></li>`
            : "<li><strong>Sem devolucao registrada</strong><span>Todos os itens seguem como venda ativa.</span></li>"
        }
      </ol>
    `,
    technicalTrace: renderTechnicalTrace({
      id: sale.id,
      saleId: sale.id,
      productSaleId: sale.id,
      refundId: sale.refundId,
      referenceType: "PRODUCT_SALE",
      referenceId: sale.id,
      idempotencyKey: sale.idempotencyKey,
      auditEntity: "product_sale",
      auditAction: sale.status || "NOT_REFUNDED",
    }),
    actions: `
      ${
        refundableItems.length
          ? `<button type="button" data-drawer-product-refund-sale="${escapeHtml(sale.id)}" class="ux-btn ux-btn-danger">Devolver produto</button>`
          : ""
      }
      <button type="button" data-drawer-close class="ux-btn ux-btn-muted">Fechar</button>
    `,
  });
  saleDrawerHost.querySelectorAll("[data-drawer-product-refund-sale]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = productSalesHistory.find((item) => item.id === button.dataset.drawerProductRefundSale);
      if (current) openProductRefundModal(current);
    });
  });
  bindEntityDrawers(saleDrawerHost);
  saleDrawerHost.classList.remove("hidden");
}

function normalizeProductSaleHistory(payload) {
  const sales = Array.isArray(payload?.sales) ? payload.sales : [];
  return sales.map((sale) => {
    const items = (Array.isArray(sale.items) ? sale.items : []).map((item) => ({
      productId: item.productId,
      name: item.productName || productsById[item.productId]?.name || item.productId,
      quantity: Number(item.quantity || 0),
      refundedQuantity: Number(item.refundedQuantity || 0),
      refundableQuantity: Number(item.refundableQuantity ?? Math.max(0, Number(item.quantity || 0) - Number(item.refundedQuantity || 0))),
      unitPrice: Number(item.unitPrice || 0),
      unitCost: Number(item.unitCost || 0),
    }));
    const statusMeta = productSaleStatusMeta(sale.status);
    const soldAt = new Date(sale.soldAt);
    const soldAtLabel = Number.isNaN(soldAt.getTime()) ? "-" : soldAt.toLocaleString("pt-BR");
    const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
    return {
      id: sale.id,
      label: `${totalItems} item(ns)`,
      amount: `R$ ${Number(sale.grossAmount || 0).toFixed(2)}`,
      clientLabel: sale.clientName || "Nao vinculado",
      professionalLabel: sale.professionalName || "Sem profissional",
      items,
      status: sale.status,
      statusLabel: statusMeta.label,
      canRefund: items.some((item) => item.refundableQuantity > 0),
      soldAtLabel,
      itemsSummary: items.length === 1 ? items[0].name : `${items.length} produtos vendidos`,
      totalRefundedAmount: Number(sale.totalRefundedAmount || 0),
      meta: `${soldAtLabel} | Cliente: ${sale.clientName || "Nao vinculado"} | Profissional: ${sale.professionalName || "Sem profissional"}`,
      createdAt: sale.createdAt,
    };
  });
}

function productSalesHistoryRange() {
  const end = saleHistoryEnd?.value ? new Date(`${saleHistoryEnd.value}T23:59:59.999`) : new Date();
  if (Number.isNaN(end.getTime())) return { start: null, end: null };
  const start = saleHistoryStart?.value ? new Date(`${saleHistoryStart.value}T00:00:00`) : new Date(end);
  if (!saleHistoryStart?.value) start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || end < start) return { start: null, end: null };
  return { start, end };
}

async function loadProductSalesHistory() {
  if (!saleRecentList) return [];
  const { start, end } = productSalesHistoryRange();
  const params = new URLSearchParams({ unitId, limit: "200" });
  if (start) params.set("start", start.toISOString());
  if (end) params.set("end", end.toISOString());
  const search = String(saleHistorySearch?.value || "").trim();
  if (search) params.set("search", search);
  const payload = await callJson(`${API}/sales/products?${params.toString()}`, "GET");
  productSalesHistory = normalizeProductSaleHistory(payload);
  renderRecentSales();
  return productSalesHistory;
}

function clearSaleCart() {
  saleCart = createEmptyCart();
  renderSaleCart();
}

async function loadAlternativeSlots() {
  const startDate = new Date(startsAt.value);
  if (Number.isNaN(startDate.getTime())) {
    renderAlternativeSlots([], null, alternativeSlots);
    return [];
  }
  if (!professionalId.value || !serviceId.value) {
    renderAlternativeSlots([], null, alternativeSlots);
    return [];
  }

  try {
    const payload = await callJson(`${API}/appointments/suggestions`, "POST", {
      unitId,
      professionalId: professionalId.value,
      serviceId: serviceId.value,
      startsAt: startDate.toISOString(),
      windowHours: 6,
    });
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    renderAlternativeSlots(suggestions, handleAlternativeSlotSelect, alternativeSlots);
    return suggestions;
  } catch (_error) {
    renderAlternativeSlots([], null, alternativeSlots);
    setScheduleFeedback("error", "Falha ao buscar horarios alternativos.");
    return [];
  }
}

function handleAlternativeSlotSelect(iso) {
  const selected = new Date(iso);
  if (Number.isNaN(selected.getTime())) return;
  startsAt.value = asDateTimeLocalInputValue(selected);
  renderAlternativeSlots([], null, alternativeSlots);
  setScheduleFeedback("success", "Horario alternativo aplicado. Confirme para agendar.");
}

async function validateScheduleSlot() {
  const validation = validateSlotLocally({
    startsAt: startsAt.value,
    professionalId: professionalId.value,
    serviceId: serviceId.value,
    servicesById: schedulingCatalog.servicesById,
    agendaItems: currentAgenda,
  });

  if (validation.ok) {
    setScheduleFeedback("success", "Horario livre no pre-check. Pode confirmar o agendamento.");
    renderAlternativeSlots([], null, alternativeSlots);
    return { ok: true };
  }

  if (
    validation.code === "INVALID_DATE" ||
    validation.code === "MISSING_SERVICE" ||
    validation.code === "MISSING_PROFESSIONAL"
  ) {
    setScheduleFeedback("warning", validation.message);
    renderAlternativeSlots([], null, alternativeSlots);
    return { ok: false, reason: validation.code };
  }

  setScheduleFeedback("warning", `${validation.message} Mostrando opcoes proximas.`);
  await loadAlternativeSlots();
  return { ok: false, reason: validation.code };
}

async function loadCatalog() {
  const response = await apiFetch(`${API}/catalog?unitId=${encodeURIComponent(unitId)}`);
  const data = await response.json();

  const normalized = normalizeCatalogForScheduling(data);
  productsById = Object.fromEntries(data.products.map((p) => [p.id, p]));
  clientsById = normalized.clientsById;
  servicesById = normalized.servicesById;
  professionalsById = normalized.professionalsById;
  allServices = normalized.services;
  schedulingCatalog = normalized;
  const activeServices = (Array.isArray(data.services) ? data.services : []).filter(
    (item) => item.active !== false,
  );

  initClientSearch(data.clients);
  fillSelect(professionalId, data.professionals, (item) => item.name);
  fillSelect(serviceId, activeServices, (item) => `${item.name} - R$ ${item.price}`);
  fillSelect(filterService, data.services, (item) => item.name, {
    blankLabel: "Todos servicos",
  });

  fillSelect(
    saleProductId,
    data.products,
    (item) => `${item.name} (estoque: ${item.stockQty}) - R$ ${item.salePrice}`,
  );
  const firstProduct = saleProductsList()[0];
  if (firstProduct) setSaleSelectedProduct(saleProductId.value || firstProduct.id);
  renderSaleProductCatalog();
  fillSelect(saleClientId, data.clients, (item) => item.fullName, {
    blankLabel: "Sem cliente",
  });
  fillSelect(financialTransactionCustomer, data.clients, (item) => item.fullName, {
    blankLabel: "Nao vincular",
  });
  fillSelect(saleProfessionalId, data.professionals, (item) => item.name, {
    blankLabel: "Sem profissional",
  });
  fillSelect(financialTransactionProfessional, data.professionals, (item) => item.name, {
    blankLabel: "Nao vincular",
  });
  fillSelect(filterProfessional, data.professionals, (item) => item.name, {
    blankLabel: "Todos profissionais",
  });
  fillSelect(appointmentsFilterProfessional, data.professionals, (item) => item.name, {
    blankLabel: "Todos os profissionais",
  });
  fillSelect(alFilterProfessional, data.professionals, (item) => item.name, {
    blankLabel: "Todos os profissionais",
  });
  fillSelect(appointmentsFilterService, data.services, (item) => item.name, {
    blankLabel: "Todos os servicos",
  });
  fillSelect(appointmentsFilterClient, data.clients, (item) => {
    const phoneLabel = item.phone ? ` (${item.phone})` : "";
    return `${item.fullName}${phoneLabel}`;
  }, {
    blankLabel: "Todos os clientes",
  });
  fillSelect(professionalsFilter, data.professionals, (item) => item.name, {
    blankLabel: "Todos profissionais",
  });
  fillSelect(commissionsProfessionalFilter, data.professionals, (item) => item.name, {
    blankLabel: "Todos profissionais",
  });
  fillSelect(loyaltyClientId, data.clients, (item) => item.fullName);
  fillSelect(premiumClientId, data.clients, (item) => item.fullName);
  fillMultiSelect(
    servicesProfessionalIds,
    data.professionals,
    (item) => `${item.name}${item.active === false ? " (inativo)" : ""}`,
  );

  const refreshedCart = [];
  for (const item of saleCart) {
    const latestProduct = productsById[item.productId];
    if (!latestProduct) continue;
    const nextQty = Math.min(item.quantity, Number(latestProduct.stockQty || 0));
    if (nextQty <= 0) continue;
    refreshedCart.push({
      ...item,
      quantity: nextQty,
      unitPrice: Number(latestProduct.salePrice || 0),
      stockQty: Number(latestProduct.stockQty || 0),
      name: latestProduct.name,
    });
  }
  saleCart = refreshedCart;
  renderSaleCart();
  refreshScheduleAssist();
  renderAlternativeSlots([], null, alternativeSlots);

  if (appointmentsFilterDate && !appointmentsFilterDate.value) {
    appointmentsFilterDate.value = asDateInputValue(new Date());
  }
  if (appointmentsHeaderDate) {
    appointmentsHeaderDate.textContent = new Date().toLocaleString("pt-BR", {
      dateStyle: "full",
      timeStyle: "short",
    });
  }
}

async function callJson(url, method, body) {
  const response = await apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await readResponsePayload(response);
  if (!response.ok) {
    const error = new Error(extractApiErrorMessage(response, data, "Erro de operacao"));
    error.status = response.status;
    throw error;
  }
  return data || {};
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function extractApiErrorMessage(response, payload, fallbackMessage) {
  const fromPayload =
    payload && typeof payload === "object" && typeof payload.error === "string"
      ? payload.error.trim()
      : "";
  if (response?.status === 403) return "Voce nao tem permissao para executar esta acao.";
  if (fromPayload) {
    const normalized = fromPayload.toLowerCase();
    if (normalized === "not found") return fallbackMessage;
    if (normalized.includes("idempotencykey reutilizada")) {
      return "Esta operacao ja foi processada. Atualize a tela para conferir o resultado.";
    }
    if (normalized.includes("appointment not in service") || normalized.includes("nao esta em andamento")) {
      return "Nao foi possivel finalizar porque o atendimento nao esta em andamento.";
    }
    if (normalized.includes("overlap") || normalized.includes("occupied") || normalized.includes("conflito")) {
      return "Este horario ja esta ocupado. Escolha outro horario.";
    }
    if (normalized.includes("quantidade devolvida maior")) {
      return "A quantidade informada e maior do que a quantidade disponivel para devolucao.";
    }
    if (normalized.includes("atendimento nao concluido") || normalized.includes("atendimento ja estornado")) {
      return "Erro ao estornar atendimento. Verifique se ele ja foi concluido ou ja estornado.";
    }
    return fromPayload;
  }
  return fallbackMessage;
}

function ensureCheckoutModal() {
  let modal = document.getElementById("appointmentCheckoutModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "appointmentCheckoutModal";
  modal.className = "ds-modal-backdrop hidden";
  modal.innerHTML = `
    <div class="ds-modal-panel checkout-modal" style="max-width:660px">
      <div class="checkout-modal-header ds-modal-head">
        <div>
          <p class="ux-label">Checkout do atendimento</p>
          <h3 class="ux-section-label">Finalizar atendimento</h3>
        </div>
        <button type="button" data-checkout-close class="ux-btn ux-btn-muted">Fechar</button>
      </div>
      <form id="appointmentCheckoutForm" class="ds-form-grid">
        <div class="ds-form-full checkout-total-panel">
          <span>Total do atendimento</span>
          <strong id="checkoutTotalDisplay">R$ 0,00</strong>
        </div>
        <div class="ds-form-full ds-cell-secondary" id="checkoutSummary"></div>
        <details class="ds-form-full checkout-products-panel">
          <summary>Produtos adicionais</summary>
          <div id="checkoutProductsList"></div>
          <button type="button" id="checkoutAddProduct" class="ux-btn ux-btn-muted">Adicionar produto</button>
        </details>
        <label class="ds-form-label">Metodo de pagamento
          <input id="checkoutPaymentMethod" type="text" value="PIX" class="ds-input" />
        </label>
        <label class="ds-form-label">Valor total
          <input id="checkoutTotal" type="text" readonly class="ds-input" />
        </label>
        <label class="ds-form-label ds-form-full">Observacoes
          <textarea id="checkoutNotes" rows="2" maxlength="500" class="ds-input"></textarea>
        </label>
        <div id="checkoutTechnicalTrace" class="ds-form-full"></div>
        <div id="checkoutFeedback" class="ds-form-full panel-msg-host"></div>
        <div class="ds-form-full catalog-row-actions">
          <button type="button" data-checkout-close class="ux-btn ux-btn-muted">Cancelar</button>
          ${renderPrimaryAction({ label: "Finalizar atendimento", id: "checkoutSubmitBtn", type: "submit" })}
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-checkout-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  });
  modal.querySelector("#checkoutAddProduct")?.addEventListener("click", () => {
    checkoutModalState.products.push({ productId: "", quantity: 1 });
    renderCheckoutProducts();
  });
  modal.querySelector("#appointmentCheckoutForm")?.addEventListener("submit", submitCheckoutModal);
  return modal;
}

function renderCheckoutProducts() {
  const modal = ensureCheckoutModal();
  const list = modal.querySelector("#checkoutProductsList");
  if (!list) return;
  const productOptions = Object.values(productsById)
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} (Estoque: ${escapeHtml(item.stockQty)})</option>`)
    .join("");
  if (!checkoutModalState.products.length) {
    list.innerHTML = `
      <div class="ux-empty-dashed">
        Nenhum produto adicional neste checkout.
      </div>
    `;
    return;
  }
  list.innerHTML = checkoutModalState.products
    .map(
      (row, index) => {
        const product = productsById[row.productId];
        const subtotal = Number(product?.salePrice || 0) * Number(row.quantity || 0);
        return `
      <div class="checkout-product-row">
        <select data-checkout-product="${index}" class="ds-input">
          <option value="">Selecione</option>
          ${productOptions}
        </select>
        <input data-checkout-qty="${index}" type="number" min="1" max="99" value="${row.quantity}" class="ds-input" />
        <button type="button" data-checkout-remove="${index}" class="ux-btn ux-btn-danger">X</button>
        <div class="checkout-product-subtotal ds-cell-secondary">Subtotal: ${subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
      </div>
    `;
      },
    )
    .join("");
  list.querySelectorAll("[data-checkout-product]").forEach((el) => {
    const index = Number(el.getAttribute("data-checkout-product"));
    el.value = checkoutModalState.products[index]?.productId || "";
    el.addEventListener("change", () => {
      checkoutModalState.products[index].productId = el.value;
      recomputeCheckoutTotal();
    });
  });
  list.querySelectorAll("[data-checkout-qty]").forEach((el) => {
    const index = Number(el.getAttribute("data-checkout-qty"));
    el.addEventListener("input", () => {
      checkoutModalState.products[index].quantity = Math.max(1, Number(el.value || 1));
      recomputeCheckoutTotal();
    });
  });
  list.querySelectorAll("[data-checkout-remove]").forEach((el) => {
    const index = Number(el.getAttribute("data-checkout-remove"));
    el.addEventListener("click", () => {
      checkoutModalState.products.splice(index, 1);
      renderCheckoutProducts();
      recomputeCheckoutTotal();
    });
  });
}

function recomputeCheckoutTotal() {
  const modal = ensureCheckoutModal();
  const servicePrice = Number(checkoutModalState.appointment?.servicePrice || 0);
  const productsTotal = checkoutModalState.products.reduce((acc, item) => {
    const product = productsById[item.productId];
    if (!product) return acc;
    return acc + Number(product.salePrice || 0) * Number(item.quantity || 0);
  }, 0);
  const total = servicePrice + productsTotal;
  checkoutModalState.total = Number(total.toFixed(2));
  const totalInput = modal.querySelector("#checkoutTotal");
  if (totalInput) totalInput.value = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const totalDisplay = modal.querySelector("#checkoutTotalDisplay");
  if (totalDisplay) totalDisplay.textContent = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function openCheckoutModal(appointment) {
  const modal = ensureCheckoutModal();
  checkoutModalState = { appointment, products: [], total: 0 };
  const summary = modal.querySelector("#checkoutSummary");
  if (summary) {
    summary.innerHTML = `
      <dl class="checkout-summary-grid">
        <div><dt>Cliente</dt><dd>${escapeHtml(appointment.client)}</dd></div>
        <div><dt>Servico</dt><dd>${escapeHtml(appointment.service)}</dd></div>
        <div><dt>Profissional</dt><dd>${escapeHtml(appointment.professional)}</dd></div>
        <div><dt>Valor do servico</dt><dd>${Number(appointment.servicePrice || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd></div>
      </dl>
    `;
  }
  const trace = modal.querySelector("#checkoutTechnicalTrace");
  if (trace) {
    trace.innerHTML = renderTechnicalTrace(
      {
        id: appointment.id,
        referenceType: "APPOINTMENT",
        referenceId: appointment.id,
        auditEntity: "Appointment",
        auditAction: "CHECKOUT",
      },
      { title: "Detalhe tecnico do checkout" },
    );
  }
  const feedback = modal.querySelector("#checkoutFeedback");
  if (feedback) feedback.innerHTML = "";
  const notes = modal.querySelector("#checkoutNotes");
  if (notes) notes.value = "";
  const payment = modal.querySelector("#checkoutPaymentMethod");
  if (payment) payment.value = "PIX";
  renderCheckoutProducts();
  recomputeCheckoutTotal();
  modal.classList.remove("hidden");
}

async function submitCheckoutModal(event) {
  event.preventDefault();
  const modal = ensureCheckoutModal();
  const submitBtn = modal.querySelector("#checkoutSubmitBtn");
  const feedback = modal.querySelector("#checkoutFeedback");
  const paymentMethod = String(modal.querySelector("#checkoutPaymentMethod")?.value || "").trim();
  const notes = modal.querySelector("#checkoutNotes")?.value || "";
  const appointment = checkoutModalState.appointment;
  if (!appointment?.id) return;
  const products = checkoutModalState.products.filter((item) => item.productId && item.quantity > 0);
  if (!paymentMethod) {
    if (feedback) {
      feedback.innerHTML =
        '<p class="panel-msg panel-msg-warning">Metodo de pagamento obrigatorio.</p>';
    }
    return;
  }
  for (const item of products) {
    const product = productsById[item.productId];
    const stockQty = Number(product?.stockQty || 0);
    if (!product || Number(item.quantity || 0) > stockQty) {
      if (feedback) {
        const name = product?.name || "produto";
        feedback.innerHTML = `<p class="panel-msg panel-msg-warning">Quantidade maior que o estoque para ${escapeHtml(name)}. Disponivel=${stockQty}.</p>`;
      }
      return;
    }
  }
  try {
    if (submitBtn) submitBtn.disabled = true;
    if (submitBtn) submitBtn.textContent = "Finalizando...";
    await callJson(`${API}/appointments/${appointment.id}/checkout`, "POST", {
      idempotencyKey: buildOperationIdempotencyKey("appointment-checkout"),
      changedBy: "owner",
      completedAt: new Date().toISOString(),
      paymentMethod,
      expectedTotal: Number(checkoutModalState.total || 0),
      notes: notes || undefined,
      products,
    });
    modal.classList.add("hidden");
    setScheduleFeedback("success", "Atendimento finalizado com sucesso.");
    renderAppointmentsFeedback(appointmentsElements, "success", "Atendimento finalizado com sucesso.");
    await loadAll();
  } catch (error) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-error">${escapeHtml(error.message || "Falha ao finalizar atendimento.")}</p>`;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitBtn) submitBtn.textContent = "Finalizar atendimento";
  }
}

function ensureAppointmentRefundModal() {
  let modal = document.getElementById("appointmentRefundModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "appointmentRefundModal";
  modal.className = "ds-modal-backdrop hidden";
  modal.innerHTML = `
    <div class="ds-modal-panel" style="max-width:560px">
      <div class="ds-modal-head">
        <h3 class="ux-section-label">Estornar atendimento</h3>
        <button type="button" data-appointment-refund-close class="ux-btn ux-btn-muted">Fechar</button>
      </div>
      <form id="appointmentRefundForm" class="ds-form-grid">
        <div id="appointmentRefundSummary" class="ds-form-full ux-kpi ds-cell-secondary"></div>
        <label class="ds-form-label ds-form-full">Motivo
          <textarea id="appointmentRefundReason" rows="3" maxlength="500" required class="ds-input"></textarea>
        </label>
        <label class="ds-form-label ds-form-full">Data do estorno
          <input id="appointmentRefundedAt" type="datetime-local" required class="ds-input" />
        </label>
        <div id="appointmentRefundFeedback" class="ds-form-full panel-msg-host"></div>
        <div class="ds-form-full catalog-row-actions">
          <button type="button" data-appointment-refund-close class="ux-btn ux-btn-muted">Cancelar</button>
          <button type="submit" id="appointmentRefundSubmitBtn" class="ux-btn ux-btn-danger">Confirmar estorno</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-appointment-refund-close]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    });
  });
  modal.querySelector("#appointmentRefundForm")?.addEventListener("submit", submitAppointmentRefund);
  return modal;
}

function openAppointmentRefundModal(appointment) {
  const modal = ensureAppointmentRefundModal();
  appointmentRefundState = { appointment };
  const summary = modal.querySelector("#appointmentRefundSummary");
  if (summary) {
    summary.innerHTML = `
      <div><strong>Cliente:</strong> ${escapeHtml(appointment.client)}</div>
      <div><strong>Servico:</strong> ${escapeHtml(appointment.service)}</div>
      <div><strong>Valor:</strong> ${Number(appointment.servicePrice || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
    `;
  }
  const reason = modal.querySelector("#appointmentRefundReason");
  if (reason) reason.value = "";
  const refundedAt = modal.querySelector("#appointmentRefundedAt");
  if (refundedAt) refundedAt.value = asDateTimeLocalInputValue(new Date());
  const feedback = modal.querySelector("#appointmentRefundFeedback");
  if (feedback) feedback.innerHTML = "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

async function submitAppointmentRefund(event) {
  event.preventDefault();
  const modal = ensureAppointmentRefundModal();
  const appointment = appointmentRefundState.appointment;
  if (!appointment?.id) return;
  const reason = String(modal.querySelector("#appointmentRefundReason")?.value || "").trim();
  const refundedAtValue = String(modal.querySelector("#appointmentRefundedAt")?.value || "").trim();
  const feedback = modal.querySelector("#appointmentRefundFeedback");
  const submitBtn = modal.querySelector("#appointmentRefundSubmitBtn");
  if (!reason) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-warning">Informe o motivo do estorno.</p>`;
    }
    return;
  }
  const refundedAt = new Date(refundedAtValue);
  if (Number.isNaN(refundedAt.getTime())) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-warning">Informe uma data valida para o estorno.</p>`;
    }
    return;
  }
  try {
    if (submitBtn) submitBtn.disabled = true;
    await callJson(`${API}/appointments/${appointment.id}/refund`, "POST", {
      idempotencyKey: buildOperationIdempotencyKey("appointment-refund"),
      unitId,
      changedBy: getCurrentActorId(),
      reason,
      refundedAt: refundedAt.toISOString(),
    });
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    renderAppointmentsFeedback(appointmentsElements, "success", "Estorno do atendimento registrado.");
    setScheduleFeedback("success", "Estorno do atendimento registrado.");
    await loadAll();
  } catch (error) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-error">${escapeHtml(error.message || "Falha ao registrar estorno.")}</p>`;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function ensureProductRefundModal() {
  let modal = document.getElementById("productRefundModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "productRefundModal";
  modal.className = "ds-modal-backdrop hidden";
  modal.innerHTML = `
    <div class="ds-modal-panel" style="max-width:660px">
      <div class="ds-modal-head">
        <h3 class="ux-section-label">Devolver produto</h3>
        <button type="button" data-product-refund-close class="ux-btn ux-btn-muted">Fechar</button>
      </div>
      <form id="productRefundForm" class="ds-form-grid">
        <div id="productRefundSummary" class="ds-form-full ux-kpi ds-cell-secondary"></div>
        <div id="productRefundItems" class="ds-form-full"></div>
        <label class="ds-form-label ds-form-full">Motivo
          <textarea id="productRefundReason" rows="3" maxlength="500" required class="ds-input"></textarea>
        </label>
        <label class="ds-form-label ds-form-full">Data da devolucao
          <input id="productRefundedAt" type="datetime-local" required class="ds-input" />
        </label>
        <div id="productRefundFeedback" class="ds-form-full panel-msg-host"></div>
        <div class="ds-form-full catalog-row-actions">
          <button type="button" data-product-refund-close class="ux-btn ux-btn-muted">Cancelar</button>
          <button type="submit" id="productRefundSubmitBtn" class="ux-btn ux-btn-danger">Confirmar devolucao</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-product-refund-close]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    });
  });
  modal.querySelector("#productRefundForm")?.addEventListener("submit", submitProductRefund);
  return modal;
}

function openProductRefundModal(sale) {
  const modal = ensureProductRefundModal();
  productRefundState = { sale };
  const summary = modal.querySelector("#productRefundSummary");
  if (summary) {
    summary.innerHTML = `
      <div><strong>Venda:</strong> ${escapeHtml(sale.soldAtLabel || "Venda selecionada")}</div>
      <div><strong>Total:</strong> ${escapeHtml(sale.amount)}</div>
      <div><strong>Cliente:</strong> ${escapeHtml(sale.clientLabel || "Nao vinculado")}</div>
    `;
  }
  const itemsRoot = modal.querySelector("#productRefundItems");
  if (itemsRoot) {
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    itemsRoot.innerHTML = saleItems
      .filter((item) => Number(item.refundableQuantity ?? item.quantity ?? 0) > 0)
      .map((item) => `
        <label class="ux-kpi" style="display:grid;grid-template-columns:1fr 120px;gap:8px;align-items:center">
          <span>
            <strong class="ds-cell-primary">${escapeHtml(item.name)}</strong>
            <span class="ds-cell-secondary">Vendido: ${item.quantity} | Devolvido: ${item.refundedQuantity || 0} | Disponivel: ${item.refundableQuantity ?? item.quantity} | Unitario: R$ ${Number(item.unitPrice || 0).toFixed(2)}</span>
            <span class="ds-cell-secondary">Quantidade para devolver</span>
          </span>
          <input data-product-refund-product="${escapeHtml(item.productId)}" type="number" min="0" max="${Number(item.refundableQuantity ?? item.quantity ?? 0)}" step="1" value="0" class="ds-input" />
        </label>
      `)
      .join("");
  }
  const reason = modal.querySelector("#productRefundReason");
  if (reason) reason.value = "";
  const refundedAt = modal.querySelector("#productRefundedAt");
  if (refundedAt) refundedAt.value = asDateTimeLocalInputValue(new Date());
  const feedback = modal.querySelector("#productRefundFeedback");
  if (feedback) feedback.innerHTML = "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

async function submitProductRefund(event) {
  event.preventDefault();
  const modal = ensureProductRefundModal();
  const sale = productRefundState.sale;
  if (!sale?.id) return;
  const reason = String(modal.querySelector("#productRefundReason")?.value || "").trim();
  const refundedAtValue = String(modal.querySelector("#productRefundedAt")?.value || "").trim();
  const feedback = modal.querySelector("#productRefundFeedback");
  const submitBtn = modal.querySelector("#productRefundSubmitBtn");
  if (!reason) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-warning">Informe o motivo da devolucao.</p>`;
    }
    return;
  }
  const rawItems = Array.from(modal.querySelectorAll("[data-product-refund-product]"))
    .map((input) => {
      const productId = input.getAttribute("data-product-refund-product");
      const quantity = Math.trunc(Number(input.value || 0));
      const original = (Array.isArray(sale.items) ? sale.items : []).find((item) => item.productId === productId);
      return { productId, quantity, max: Number(original?.refundableQuantity ?? original?.quantity ?? 0) };
    });
  const invalid = rawItems.find((item) => item.quantity < 0 || item.quantity > item.max);
  if (invalid) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-warning">Quantidade de devolucao invalida para um item.</p>`;
    }
    return;
  }
  const items = rawItems.filter((item) => item.productId && item.quantity > 0);
  if (!items.length) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-warning">Informe ao menos uma quantidade para devolver.</p>`;
    }
    return;
  }
  const refundedAt = new Date(refundedAtValue);
  if (Number.isNaN(refundedAt.getTime())) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-warning">Informe uma data valida para a devolucao.</p>`;
    }
    return;
  }
  try {
    if (submitBtn) submitBtn.disabled = true;
    await callJson(`${API}/sales/products/${sale.id}/refund`, "POST", {
      idempotencyKey: buildOperationIdempotencyKey("product-refund"),
      unitId,
      changedBy: getCurrentActorId(),
      reason,
      refundedAt: refundedAt.toISOString(),
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    renderSaleFeedback("success", "Produto devolvido com sucesso.", saleFeedback);
    await loadCatalog();
    await loadAll();
  } catch (error) {
    if (feedback) {
      feedback.innerHTML = `<p class="panel-msg panel-msg-error">${escapeHtml(error.message || "Falha ao registrar devolucao.")}</p>`;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function updateStatus(item, action) {
  if (action === "DETAIL") {
    selectedAppointmentId = item.id;
    renderAppointmentDetailPanel();
    return;
  }

  if (action === "REFUND") {
    if (item.status !== "COMPLETED") return;
    openAppointmentRefundModal(item);
    return;
  }

  if (action === "SELL") {
    navigate("operacao", { scrollTop: false });
    saleClientId.value = item.clientId || "";
    saleProfessionalId.value = item.professionalId || "";
    saleForm.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (action === "RESCHEDULE") {
    const newDate = new Date(startsAt.value);
    if (Number.isNaN(newDate.getTime())) {
      setScheduleFeedback(
        "warning",
        "Para remarcar, selecione um horario valido no formulario de Novo Agendamento.",
      );
      return;
    }
    await callJson(`${API}/appointments/${item.id}/reschedule`, "PATCH", {
      startsAt: newDate.toISOString(),
    });
    setScheduleFeedback("success", "Atendimento remarcado com sucesso.");
  } else if (action === "COMPLETE" || action === "PAYMENT") {
    openCheckoutModal(item);
    return;
  } else {
    const needsReason = action === "CANCELLED" || action === "NO_SHOW";
    const reason = needsReason ? "Atualizado no painel operacional" : undefined;
    const response = await callJson(`${API}/appointments/${item.id}/status`, "PATCH", {
      status: action,
      reason: reason || undefined,
      changedBy: "owner",
    });
    const synced = syncLocalAppointmentFromPayload(response?.appointment);
    if (!synced) updateAppointmentStatusLocal(item.id, action);
    renderAgendaView();
    renderAppointmentsView();
    if (selectedAppointmentId === item.id) renderAppointmentDetailPanel();
    setScheduleFeedback("success", `Status atualizado para ${actionLabel[action] || action}.`);
    loadAll().catch(() => {
      setScheduleFeedback(
        "warning",
        "Status salvo localmente. Nao foi possivel sincronizar todas as visoes agora.",
      );
    });
    return;
  }
  await loadAll();
}

function getAgendaFilterState() {
  return {
    professionalId: filterProfessional.value || "",
    status: filterStatus.value || "",
    serviceId: filterService.value || "",
    search: filterSearch.value || "",
  };
}

function renderAgendaView() {
  if (currentView === "list") {
    if (agendaCardsMode) agendaCardsMode.classList.remove("hidden");
    if (agendaCalendarMode) agendaCalendarMode.classList.add("hidden");
    if (agendaListMode && state.activeModule === "agenda") agendaListMode.classList.remove("hidden");
    const visibleItems = filterAgendaItems(currentAgenda, getAgendaFilterState());
    renderAgendaData(agendaElements, currentAgenda, visibleItems, "list", {
      canCheckout: canCheckoutAppointment(),
      onAction: updateStatus,
      onError: (error) => {
        setScheduleFeedback("error", error?.message || "Falha ao atualizar agendamento.");
      },
    });
    renderAgendaListMode();
    return;
  }

  if (agendaCardsMode) agendaCardsMode.classList.remove("hidden");
  if (agendaCalendarMode) agendaCalendarMode.classList.remove("hidden");
  if (agendaListMode) agendaListMode.classList.add("hidden");
  const visibleItems = filterAgendaItems(currentAgenda, getAgendaFilterState());
  renderAgendaData(agendaElements, currentAgenda, visibleItems, "list", {
    canCheckout: canCheckoutAppointment(),
    onAction: updateStatus,
    onError: (error) => {
      setScheduleFeedback("error", error?.message || "Falha ao atualizar agendamento.");
    },
  });
  if (!wcLoaded) {
    if (!wcWeekStart) wcWeekStart = getWeekMonday();
    loadWeekCalendar();
  } else {
    renderWeekCalendar();
  }
}

function getAgendaListSourceItems() {
  const base = wcLoaded && Array.isArray(wcItems) && wcItems.length
    ? wcItems
    : (Array.isArray(currentAgenda) ? currentAgenda : []);
  const normalizeDateValue = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const normalizeItem = (item) => {
    if (!item || typeof item !== "object") return null;
    const startsAt = normalizeDateValue(item.startsAt);
    const endsAt = normalizeDateValue(item.endsAt);
    if (!startsAt || !endsAt) return null;
    return {
      ...item,
      startsAt,
      endsAt,
      status: String(item.status || "SCHEDULED").trim(),
    };
  };
  const normalizedBase = base.map(normalizeItem).filter(Boolean);
  if (!Array.isArray(currentAppointments) || !currentAppointments.length) return normalizedBase;
  const byId = new Map(currentAppointments.map((item) => [item.id, item]));
  return normalizedBase.map((item) => {
    const detailed = byId.get(item.id);
    return normalizeItem(detailed ? { ...item, ...detailed } : item);
  }).filter(Boolean);
}

function getAgendaWorkingHoursSummaryHtml() {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const rows = Array.isArray(currentWorkingHours?.weekly) ? currentWorkingHours.weekly : [];
  const openRows = rows.filter((row) => row && !row.isClosed && row.start && row.end);
  if (!openRows.length) return "";
  const text = openRows
    .map((row) => `${labels[row.day] || row.day}: ${row.start} - ${row.end}`)
    .join(" · ");
  return `
    <section class="al-hours">
      <span class="al-hours-label">Horarios de atendimento</span>
      <p class="al-hours-text">${text}</p>
    </section>
  `;
}

function renderAgendaListMode() {
  if (!agendaListContent) return;

  const statusFilter = String(alFilterStatus?.value || "").trim();
  const professionalFilter = String(alFilterProfessional?.value || "").trim();
  const searchFilter = String(alFilterSearch?.value || "").trim().toLowerCase();
  const now = new Date();

  const source = getAgendaListSourceItems();
  const filtered = source
    .filter((item) => {
      const useOperationalOnly = !statusFilter || statusFilter === "__OPERATIONAL__";
      if (useOperationalOnly && !isSlotBlockingStatus(item.status)) return false;
      if (!useOperationalOnly && item.status !== statusFilter) return false;
      if (professionalFilter && item.professionalId !== professionalFilter) return false;
      if (searchFilter) {
        const blob = `${item.client || ""} ${item.clientPhone || ""} ${item.service || ""}`.toLowerCase();
        if (!blob.includes(searchFilter)) return false;
      }
      return true;
    })
    .sort((a, b) => a.startsAt - b.startsAt);

  if (!filtered.length) {
    agendaListContent.innerHTML = `
      <div class="al-empty">
        <p class="al-empty-title">Nenhum agendamento encontrado</p>
        <p class="al-empty-sub">Ajuste os filtros ou volte para a visao semanal.</p>
      </div>
    `;
    return;
  }

  const statusLabelMap = {
    SCHEDULED: "Agendado",
    CONFIRMED: "Confirmado",
    IN_SERVICE: "Em atendimento",
    COMPLETED: "Concluido",
    CANCELLED: "Cancelado",
    NO_SHOW: "Falta",
    BLOCKED: "Bloqueado",
  };
  const statusColorVar = {
    SCHEDULED: "#26251e",
    CONFIRMED: "#26251e",
    IN_SERVICE: "#c08532",
    COMPLETED: "#1f8a65",
    CANCELLED: "#cf2d56",
    NO_SHOW: "#cf2d56",
    BLOCKED: "rgba(38,37,30,0.55)",
  };

  const groups = new Map();
  for (const item of filtered) {
    const dayKey = item.startsAt.toISOString().slice(0, 10);
    if (!groups.has(dayKey)) groups.set(dayKey, []);
    groups.get(dayKey).push(item);
  }

  const dayHtml = [...groups.entries()].map(([dayKey, items]) => {
    const dayDate = new Date(`${dayKey}T00:00:00`);
    const dayLabel = dayDate.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    const cards = items.map((item) => {
      const startsAtText = item.startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const duration = item.serviceDurationMin || Math.max(15, Math.round((item.endsAt - item.startsAt) / 60000));
      const isLate = item.startsAt < now && (item.status === "SCHEDULED" || item.status === "CONFIRMED");
      const isFocused = alFocusedAppointmentId && item.id === alFocusedAppointmentId;
      const clientPhone =
        item.clientPhone ||
        clientsById?.[item.clientId]?.phone ||
        "Telefone nao informado";
      const dateTime = item.startsAt.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const serviceLabel = item.service || "Servico";
      const professionalLabel = item.professional || "Profissional";
      const priceLabel = money(item.servicePrice || item.price || 0);
      return `
        <article class="al-card ${isLate ? "is-late" : ""}" data-al-appt-id="${item.id}" data-al-open="${item.id}" style="--al-accent:${statusColorVar[item.status] || "#26251e"};${isFocused ? "box-shadow:0 0 0 1px rgba(38,37,30,0.2) inset;" : ""}">
          <div class="al-card-time">
            <strong>${startsAtText}</strong>
            <span class="al-dur">${duration} min</span>
          </div>
          <div class="al-card-info">
            <div class="al-card-top">
              <div class="al-card-client">${item.client || "Cliente sem nome"}</div>
              <div class="al-price">${priceLabel}</div>
            </div>
            <div class="al-card-sub">${serviceLabel} · ${professionalLabel}</div>
            <div class="al-card-sub al-card-muted">${clientPhone} · ${dateTime}</div>
          </div>
          <div class="al-card-right">
            <span class="al-chip">${statusLabelMap[item.status] || item.status}</span>
            <div class="al-card-actions">
              ${isSlotBlockingStatus(item.status) ? `<button class="al-btn al-btn-cancel" data-al-action="CANCELLED" data-al-id="${item.id}">Cancelar</button>` : ""}
            </div>
          </div>
        </article>
      `;
    }).join("");
    return `<section class="al-day-group"><h3 class="al-day-hdr">${dayLabel}</h3>${cards}</section>`;
  }).join("");

  agendaListContent.innerHTML = dayHtml;

  agendaListContent.querySelectorAll("[data-al-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const appointmentId = btn.getAttribute("data-al-id");
      const action = btn.getAttribute("data-al-action");
      if (!appointmentId || !action) return;
      try {
        await handleAppointmentsAction(appointmentId, action);
      } catch (error) {
        renderAppointmentsFeedback(
          appointmentsElements,
          "error",
          error?.message || "Nao foi possivel atualizar o agendamento.",
        );
      }
    });
  });
  agendaListContent.querySelectorAll("[data-al-open]").forEach((card) => {
    card.addEventListener("click", async (event) => {
      if (event.target.closest("[data-al-action]")) return;
      const appointmentId = card.getAttribute("data-al-open");
      if (!appointmentId) return;
      await openAgendaAppointmentDetail(appointmentId);
    });
  });

  if (alFocusedAppointmentId) {
    const focusedEl = agendaListContent.querySelector(`[data-al-appt-id="${alFocusedAppointmentId}"]`);
    if (focusedEl) focusedEl.scrollIntoView({ behavior: "smooth", block: "center" });
    alFocusedAppointmentId = "";
  }
}

async function ensureAppointmentLoaded(appointmentId) {
  if (!appointmentId) return null;
  const cached = currentAppointments.find((item) => item.id === appointmentId);
  if (cached) return cached;
  const response = await apiFetch(`${API}/appointments/${appointmentId}`);
  const data = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(response, data, "Falha ao carregar detalhe do agendamento"));
  }
  const normalized = normalizeAppointmentsPayload([data?.appointment || data]);
  const item = normalized[0] || null;
  if (item) {
    currentAppointments = [item, ...currentAppointments.filter((row) => row.id !== item.id)];
  }
  return item;
}

async function openAgendaAppointmentDetail(appointmentId) {
  try {
    const loaded = await ensureAppointmentLoaded(appointmentId);
    if (!loaded) return;
    selectedAppointmentId = loaded.id;
    renderAppointmentDetailPanel();
  } catch (error) {
    renderAppointmentsFeedback(
      appointmentsElements,
      "error",
      error?.message || "Nao foi possivel carregar os detalhes do agendamento.",
    );
  }
}

function updateAppointmentStatusLocal(appointmentId, nextStatus) {
  if (!appointmentId || !nextStatus) return;
  const apply = (item) => (item && item.id === appointmentId ? { ...item, status: nextStatus } : item);
  currentAppointments = (currentAppointments || []).map(apply);
  currentAgenda = (currentAgenda || []).map(apply);
  wcItems = (wcItems || []).map(apply);
}

function syncLocalAppointmentFromPayload(rawAppointment) {
  const normalizedAppointment = normalizeAppointmentsPayload([rawAppointment])[0];
  if (!normalizedAppointment) return null;
  const normalizedAgenda = normalizeAgendaItems([rawAppointment])[0] || normalizedAppointment;

  const upsertById = (list, value) => {
    const rows = Array.isArray(list) ? list : [];
    const index = rows.findIndex((item) => item && item.id === value.id);
    if (index === -1) return [...rows, value];
    const copy = rows.slice();
    copy[index] = { ...copy[index], ...value };
    return copy;
  };

  currentAppointments = upsertById(currentAppointments, normalizedAppointment);
  currentAgenda = upsertById(currentAgenda, normalizedAgenda);
  wcItems = upsertById(wcItems, normalizedAgenda);
  return normalizedAppointment;
}

function renderAppointmentDetailPanel() {
  const selected = currentAppointments.find((item) => item.id === selectedAppointmentId) || null;
  renderAppointmentDetail(appointmentsElements.detail, selected, currentAppointments, {
    canCheckout: canCheckoutAppointment(),
    onAction: handleAppointmentsAction,
  });
}

async function handleAppointmentsAction(appointmentId, action) {
  let item = currentAppointments.find((row) => row.id === appointmentId);
  if (!item) {
    item = await ensureAppointmentLoaded(appointmentId);
  }
  if (!item) return;

  if (action === "DETAIL") {
    selectedAppointmentId = item.id;
    renderAppointmentDetailPanel();
    return;
  }

  if (action === "WHATSAPP") {
    const parsed = buildWhatsAppLinkFromPhone(item.clientPhone);
    if (!parsed.ok) {
      renderAppointmentsFeedback(
        appointmentsElements,
        "warning",
        parsed.reason === "missing"
          ? "Cliente sem telefone cadastrado para abrir WhatsApp."
          : "Telefone do cliente invalido para WhatsApp.",
      );
      return;
    }
    window.open(parsed.url, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "REFUND") {
    if (item.status !== "COMPLETED") return;
    openAppointmentRefundModal(item);
    return;
  }

  if (action === "RESCHEDULE") {
    const nextSlot = new Date(item.startsAt.getTime() + 30 * 60 * 1000);
    await callJson(`${API}/appointments/${item.id}`, "PATCH", {
      startsAt: nextSlot.toISOString(),
      changedBy: "owner",
    });
    renderAppointmentsFeedback(
      appointmentsElements,
      "success",
      "Agendamento remarcado para o proximo horario disponivel (+30min).",
    );
    await loadAll();
    return;
  }

  if (action === "COMPLETE") {
    openCheckoutModal(item);
    return;
  }

  if (action === "CANCELLED" || action === "NO_SHOW") {
    const ok = window.confirm(
      action === "CANCELLED"
        ? "Confirma o cancelamento deste agendamento?"
        : "Confirma marcar este agendamento como falta?",
    );
    if (!ok) return;
  }

  const statusMap = {
    CANCELLED: "CANCELLED",
    NO_SHOW: "NO_SHOW",
  };
  const nextStatus = statusMap[action];
  if (!nextStatus) return;

  const response = await callJson(`${API}/appointments/${item.id}/status`, "PATCH", {
    status: nextStatus,
    reason:
      nextStatus === "CANCELLED" || nextStatus === "NO_SHOW"
        ? "Atualizado na central de agendamentos"
        : undefined,
    changedBy: "owner",
  });
  const synced = syncLocalAppointmentFromPayload(response?.appointment);
  if (!synced) updateAppointmentStatusLocal(item.id, nextStatus);
  renderAgendaView();
  renderAppointmentsView();
  if (selectedAppointmentId === item.id) renderAppointmentDetailPanel();
  renderAppointmentsFeedback(
    appointmentsElements,
    "success",
    `Status atualizado para ${actionLabel[action] || nextStatus}.`,
  );
  loadAll().catch(() => {
    renderAppointmentsFeedback(
      appointmentsElements,
      "warning",
      "Status salvo localmente. Nao foi possivel sincronizar tudo agora.",
    );
  });
}

function renderAppointmentsView() {
  const { label } = rangeFromAppointmentFilters();
  const activeFilters = [];
  if (appointmentsFilterStatus.value) {
    const labelText =
      appointmentsFilterStatus.options[appointmentsFilterStatus.selectedIndex]?.textContent ||
      appointmentsFilterStatus.value;
    activeFilters.push(`status ${labelText.toLowerCase()}`);
  }
  if (appointmentsFilterProfessional.value) {
    const labelText =
      appointmentsFilterProfessional.options[appointmentsFilterProfessional.selectedIndex]
        ?.textContent || "profissional selecionado";
    activeFilters.push(`profissional ${labelText}`);
  }
  if (appointmentsFilterService.value) {
    const labelText =
      appointmentsFilterService.options[appointmentsFilterService.selectedIndex]?.textContent ||
      "servico selecionado";
    activeFilters.push(`servico ${labelText}`);
  }
  if (appointmentsFilterClient.value) {
    const labelText =
      appointmentsFilterClient.options[appointmentsFilterClient.selectedIndex]?.textContent ||
      "cliente selecionado";
    activeFilters.push(`cliente ${labelText}`);
  }
  const search = String(appointmentsFilterSearch.value || "").trim();
  if (search) activeFilters.push(`busca "${search}"`);
  const filterSummary = activeFilters.length
    ? `Filtros ativos: ${activeFilters.join(" | ")}.`
    : "Filtrando todos os agendamentos.";

  renderAppointmentsData(appointmentsElements, currentAppointments, {
    now: new Date(),
    periodLabel: label,
    filterSummary,
    canCheckout: canCheckoutAppointment(),
    onAction: handleAppointmentsAction,
  });
  renderAppointmentDetailPanel();
}

async function loadAgendaByPeriod() {
  const period = filterPeriod.value || "today";
  if (period === "today") {
    const response = await apiFetch(
      `${API}/agenda/day?unitId=${unitId}&date=${encodeURIComponent(isoDayStart())}`,
    );
    const data = await readResponsePayload(response);
    if (!response.ok) {
      throw new Error(extractApiErrorMessage(response, data, "Falha ao carregar agenda"));
    }
    updateWorkingHoursFromPayload(data?.workingHours || data);
    return normalizeAgendaItems(data);
  }
  const range = rangeFromPeriod(period);
  const response = await apiFetch(
    `${API}/agenda/range?unitId=${unitId}&start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`,
  );
  const data = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(response, data, "Falha ao carregar agenda"));
  }
  updateWorkingHoursFromPayload(data?.workingHours || data);
  return normalizeAgendaItems(data);
}

async function loadAppointmentsFallbackFromAgenda(range) {
  const fallbackQuery = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  const response = await apiFetch(`${API}/agenda/range?${fallbackQuery.toString()}`);
  const data = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      extractApiErrorMessage(
        response,
        data,
        "Central de agendamentos indisponivel no servidor atual.",
      ),
    );
  }

  const agendaItems = normalizeAgendaItems(data);
  const statusFilter = String(appointmentsFilterStatus.value || "").trim();
  const professionalFilter = String(appointmentsFilterProfessional.value || "").trim();
  const serviceFilter = String(appointmentsFilterService.value || "").trim();
  const clientFilter = String(appointmentsFilterClient.value || "").trim();
  const searchFilter = String(appointmentsFilterSearch.value || "").trim().toLowerCase();

  return agendaItems
    .filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (professionalFilter && item.professionalId !== professionalFilter) return false;
      if (serviceFilter && item.serviceId !== serviceFilter) return false;
      if (clientFilter && item.clientId !== clientFilter) return false;
      if (!searchFilter) return true;
      const clientPhone = String(clientsById[item.clientId]?.phone || "").trim();
      const text = `${item.client} ${item.professional} ${item.service} ${clientPhone}`.toLowerCase();
      return text.includes(searchFilter);
    })
    .map((item) => ({
      ...item,
      clientPhone: String(clientsById[item.clientId]?.phone || ""),
      notes: "",
      origin: "AGENDA_RANGE",
      confirmation: item.status !== "SCHEDULED",
      createdAt: item.startsAt,
      updatedAt: item.startsAt,
      history: [],
    }));
}

async function loadAppointmentsByFilters() {
  const range = rangeFromAppointmentFilters();
  const query = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    limit: String(clientsLimit?.value || "50"),
  });

  if (appointmentsFilterStatus.value) query.set("status", appointmentsFilterStatus.value);
  if (appointmentsFilterProfessional.value) {
    query.set("professionalId", appointmentsFilterProfessional.value);
  }
  if (appointmentsFilterService.value) query.set("serviceId", appointmentsFilterService.value);
  if (appointmentsFilterClient.value) query.set("clientId", appointmentsFilterClient.value);
  const search = String(appointmentsFilterSearch.value || "").trim();
  if (search) query.set("search", search);

  const response = await apiFetch(`${API}/appointments?${query.toString()}`);
  const data = await readResponsePayload(response);
  if (!response.ok) {
    if (response.status === 404) {
      return await loadAppointmentsFallbackFromAgenda(range);
    }
    throw new Error(
      extractApiErrorMessage(response, data, "Falha ao carregar lista de agendamentos"),
    );
  }
  updateWorkingHoursFromPayload(data?.workingHours || data);
  return normalizeAppointmentsPayload(data.appointments);
}

async function loadDashboard() {
  const response = await apiFetch(
    `${API}/dashboard?unitId=${unitId}&date=${encodeURIComponent(isoDayStart())}`,
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Falha ao carregar dashboard");
  }
  return data;
}

async function loadFinancialEntries() {
  const startIn = document.getElementById("financialCustomStart");
  const endIn = document.getElementById("financialCustomEnd");
  const startVal = startIn?.value;
  const endVal = endIn?.value;
  const range = (startVal && endVal)
    ? { start: new Date(`${startVal}T00:00:00`), end: new Date(`${endVal}T23:59:59.999`) }
    : rangeFromPeriod("month");
  const previous = previousRangeFromCurrent(range);
  const transactionsQuery = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    limit: "300",
  });
  const searchValue = String(financialSearch?.value || "").trim();
  const typeValue = String(financialTypeFilter?.value || "").trim();
  if (searchValue) transactionsQuery.set("search", searchValue);
  if (typeValue) transactionsQuery.set("type", typeValue);

  const emptySummary = {
    period: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      compareStart: previous.compareStart.toISOString(),
      compareEnd: previous.compareEnd.toISOString(),
    },
    summary: {
      grossRevenue: 0,
      expenses: 0,
      estimatedProfit: 0,
      netBalance: 0,
      pendingCommissions: 0,
      ticketAverage: 0,
    },
    cashFlow: {
      incoming: 0,
      outgoing: 0,
      balance: 0,
    },
    comparison: {
      grossRevenueDelta: 0,
      expensesDelta: 0,
      estimatedProfitDelta: 0,
      netBalanceDelta: 0,
    },
  };
  const emptyTransactions = {
    transactions: [],
    summary: {
      income: 0,
      expense: 0,
      net: 0,
    },
  };
  const emptyCommissions = {
    entries: [],
    summary: {
      totalCommission: 0,
      pendingCommission: 0,
      paidCommission: 0,
      canceledCommission: 0,
    },
    byProfessional: [],
  };
  const emptyReports = {
    rankings: {
      revenueByProfessional: [],
      revenueByService: [],
      revenueByPaymentMethod: [],
      expenseByCategory: [],
    },
    margin: {
      estimatedProfit: 0,
      estimatedMarginPct: 0,
      grossRevenue: 0,
    },
  };
  const emptyManagement = {
    period: emptySummary.period,
    summary: {
      current: {
        grossRevenue: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        serviceCost: 0,
        productCost: 0,
        operationalExpenses: 0,
        totalCommissions: 0,
        operationalProfit: 0,
        operationalMarginPct: 0,
      },
      previous: {
        grossRevenue: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        serviceCost: 0,
        productCost: 0,
        operationalExpenses: 0,
        totalCommissions: 0,
        operationalProfit: 0,
        operationalMarginPct: 0,
      },
      delta: {
        grossRevenue: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        serviceCost: 0,
        productCost: 0,
        operationalExpenses: 0,
        totalCommissions: 0,
        operationalProfit: 0,
        operationalMarginPct: 0,
      },
    },
    breakdown: {
      totalCost: 0,
      costRatioPct: 0,
      profitRatioPct: 0,
    },
    professionals: [],
    highlights: {
      topProfitProfessional: null,
      topRevenueProfessional: null,
      lowestMarginProfessional: null,
    },
  };

  const [summaryResponse, transactionsResponse, commissionsResponse, reportsResponse, managementResponse] =
    await Promise.all([
      apiFetch(
        `${API}/financial/summary?unitId=${unitId}&start=${encodeURIComponent(
          range.start.toISOString(),
        )}&end=${encodeURIComponent(range.end.toISOString())}&compareStart=${encodeURIComponent(
          previous.compareStart.toISOString(),
        )}&compareEnd=${encodeURIComponent(previous.compareEnd.toISOString())}`,
      ),
      apiFetch(`${API}/financial/transactions?${transactionsQuery.toString()}`),
      apiFetch(
        `${API}/financial/commissions?unitId=${unitId}&start=${encodeURIComponent(
          range.start.toISOString(),
        )}&end=${encodeURIComponent(range.end.toISOString())}&limit=200`,
      ),
      apiFetch(
        `${API}/financial/reports?unitId=${unitId}&start=${encodeURIComponent(
          range.start.toISOString(),
        )}&end=${encodeURIComponent(range.end.toISOString())}`,
      ),
      apiFetch(
        `${API}/financial/management/overview?unitId=${unitId}&start=${encodeURIComponent(
          range.start.toISOString(),
        )}&end=${encodeURIComponent(range.end.toISOString())}&compareStart=${encodeURIComponent(
          previous.compareStart.toISOString(),
        )}&compareEnd=${encodeURIComponent(previous.compareEnd.toISOString())}`,
      ),
    ]);

  const endpointResults = await Promise.all([
    readResponsePayload(summaryResponse),
    readResponsePayload(transactionsResponse),
    readResponsePayload(commissionsResponse),
    readResponsePayload(reportsResponse),
    readResponsePayload(managementResponse),
  ]);

  const endpointErrors = [];
  const [summaryData, transactionsData, commissionsData, reportsData, managementData] = endpointResults;
  if (!summaryResponse.ok) {
    endpointErrors.push(
      extractApiErrorMessage(summaryResponse, summaryData, "Falha ao carregar resumo financeiro"),
    );
  }
  if (!transactionsResponse.ok) {
    endpointErrors.push(
      extractApiErrorMessage(
        transactionsResponse,
        transactionsData,
        "Falha ao carregar lancamentos financeiros",
      ),
    );
  }
  if (!commissionsResponse.ok) {
    endpointErrors.push(
      extractApiErrorMessage(
        commissionsResponse,
        commissionsData,
        "Falha ao carregar comissoes financeiras",
      ),
    );
  }
  if (!reportsResponse.ok) {
    endpointErrors.push(
      extractApiErrorMessage(reportsResponse, reportsData, "Falha ao carregar relatorios financeiros"),
    );
  }
  if (!managementResponse.ok) {
    endpointErrors.push(
      extractApiErrorMessage(
        managementResponse,
        managementData,
        "Falha ao carregar resumo gerencial",
      ),
    );
  }

  return {
    summary: summaryResponse.ok ? summaryData || emptySummary : emptySummary,
    transactions: transactionsResponse.ok ? transactionsData || emptyTransactions : emptyTransactions,
    commissions: commissionsResponse.ok ? commissionsData || emptyCommissions : emptyCommissions,
    reports: reportsResponse.ok ? reportsData || emptyReports : emptyReports,
    management: managementResponse.ok ? managementData || emptyManagement : emptyManagement,
    meta: {
      hasErrors: endpointErrors.length > 0,
      errors: endpointErrors,
    },
  };
}

async function loadStockOverview() {
  const query = new URLSearchParams({
    unitId,
    status: inventoryFilters.status || "ALL",
    limit: "40",
  });
  const search = String(inventoryFilters.search || "").trim();
  if (search) query.set("search", search);
  const category = String(inventoryFilters.category || "").trim();
  if (category) query.set("category", category);

  const response = await apiFetch(`${API}/inventory?${query.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Falha ao carregar modulo de estoque");
  }
  inventoryProductsById = Object.fromEntries(
    (Array.isArray(data.products) ? data.products : []).map((item) => [item.id, item]),
  );
  return data;
}

async function loadServicesModule() {
  const query = new URLSearchParams({
    unitId,
    status: servicesFilters.status || "ALL",
  });
  const search = String(servicesFilters.search || "").trim();
  if (search) query.set("search", search);
  const category = String(servicesFilters.category || "").trim();
  if (category) query.set("category", category);
  const minPrice = String(servicesFilters.minPrice || "").trim();
  if (minPrice) query.set("minPrice", minPrice);
  const maxPrice = String(servicesFilters.maxPrice || "").trim();
  if (maxPrice) query.set("maxPrice", maxPrice);

  const [listResponse, summaryResponse] = await Promise.all([
    apiFetch(`${API}/services?${query.toString()}`),
    apiFetch(`${API}/services/summary?unitId=${unitId}`),
  ]);
  const [listData, summaryData] = await Promise.all([
    readResponsePayload(listResponse),
    readResponsePayload(summaryResponse),
  ]);
  if (!listResponse.ok) {
    throw new Error(
      extractApiErrorMessage(listResponse, listData, "Falha ao carregar servicos"),
    );
  }
  if (!summaryResponse.ok) {
    throw new Error(
      extractApiErrorMessage(summaryResponse, summaryData, "Falha ao carregar resumo de servicos"),
    );
  }
  const services = Array.isArray(listData?.services) ? listData.services : [];
  currentServices = services;
  servicesByIdMap = Object.fromEntries(services.map((item) => [item.id, item]));
  return {
    services,
    categories: Array.isArray(listData?.categories) ? listData.categories : [],
    summary: summaryData || {},
  };
}

async function loadServiceDetail(serviceIdValue) {
  if (!serviceIdValue) return null;
  const response = await apiFetch(`${API}/services/${serviceIdValue}?unitId=${unitId}`);
  const data = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      extractApiErrorMessage(response, data, "Falha ao carregar detalhe do servico"),
    );
  }
  return data;
}

function renderServiceDetailPanel() {
  renderServiceDetail(servicesElements, currentServiceDetail);
}

function hideProfessionalsModal() {
  if (!professionalsModal) return;
  professionalsModal.classList.add("hidden");
  professionalsModal.classList.remove("flex");
  if (professionalsFormFeedback) professionalsFormFeedback.innerHTML = "";
}

function showProfessionalsModal(professional = null) {
  if (!professionalsModal) return;
  const editing = Boolean(professional?.professionalId);
  const modalTitle = document.getElementById("professionalsModalTitle");
  const submitBtn = document.getElementById("professionalsSubmitBtn");
  if (modalTitle) modalTitle.textContent = editing ? "Editar profissional" : "Novo profissional";
  if (submitBtn) submitBtn.textContent = editing ? "Salvar alteracoes" : "Salvar profissional";
  if (professionalsFormId) professionalsFormId.value = editing ? professional.professionalId : "";
  if (professionalsFormName) professionalsFormName.value = editing ? (professional.name || "") : "";
  if (professionalsFormPhone) professionalsFormPhone.value = editing ? (professional.phone || "") : "";
  if (professionalsFormEmail) professionalsFormEmail.value = editing ? (professional.email || "") : "";
  if (professionalsFormFeedback) professionalsFormFeedback.innerHTML = "";
  professionalsModal.classList.remove("hidden");
  professionalsModal.classList.add("flex");
  setTimeout(() => professionalsFormName?.focus(), 50);
}

function hideServicesModal() {
  if (!servicesModal) return;
  servicesModal.classList.add("hidden");
  servicesModal.classList.remove("flex");
}

function showServicesModal(service = null) {
  if (!servicesModal) return;
  const editing = Boolean(service?.id);
  servicesModalTitle.textContent = editing ? "Editar serviço" : "Adicionar serviço";
  servicesSubmitBtn.textContent = editing ? "Salvar alterações" : "Salvar serviço";
  servicesId.value = editing ? service.id : "";
  servicesName.value = editing ? service.name || "" : "";
  servicesPrice.value = editing ? Number(service.price || 0) : 0;
  servicesDurationMinutes.value = editing ? Number(service.durationMinutes || 0) : "";
  servicesCategory.value = editing ? service.category || "" : "";
  servicesDescription.value = editing ? service.description || "" : "";
  servicesDefaultCommissionRate.value = editing
    ? Number(service.defaultCommissionRate || 0)
    : "";
  servicesEstimatedCost.value = editing ? Number(service.estimatedCost || 0) : "";
  servicesIsActive.value = editing ? (service.isActive ? "true" : "false") : "true";
  servicesNotes.value = editing ? service.notes || "" : "";
  if (servicesImageUrl) servicesImageUrl.value = editing ? service.imageUrl || "" : "";

  const selectedIds = new Set(
    editing && Array.isArray(service.enabledProfessionalIds) ? service.enabledProfessionalIds : [],
  );
  Array.from(servicesProfessionalIds.options).forEach((option) => {
    option.selected = selectedIds.has(option.value);
  });

  servicesModal.classList.remove("hidden");
  servicesModal.classList.add("flex");
}

function servicePayloadFromForm() {
  const name = String(servicesName.value || "").trim();
  const price = Number(servicesPrice.value || 0);
  const durationMinutes = Number(servicesDurationMinutes.value || 0);

  if (!name) throw new Error("Nome do servico obrigatorio");
  if (!Number.isFinite(price) || price < 0) throw new Error("Preco deve ser maior ou igual a zero");
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duracao deve ser maior que zero");
  }
  const imageUrlVal = servicesImageUrl ? String(servicesImageUrl.value || "").trim() : undefined;
  return {
    unitId,
    name,
    price,
    durationMinutes,
    category: String(servicesCategory?.value || "").trim() || undefined,
    description: String(servicesDescription?.value || "").trim() || undefined,
    defaultCommissionRate: Number(servicesDefaultCommissionRate?.value || 0),
    estimatedCost: Number(servicesEstimatedCost?.value || 0),
    isActive: servicesIsActive?.value !== "false",
    notes: String(servicesNotes?.value || "").trim() || undefined,
    imageUrl: imageUrlVal || undefined,
    professionalIds: servicesProfessionalIds ? Array.from(servicesProfessionalIds.selectedOptions).map((o) => o.value) : [],
  };
}

function showServiceEditPanel(service) {
  if (!service) return;
  const allProfessionals = (currentServiceDetail?.professionals || []).map((p) => ({
    id: p.id,
    name: p.name,
  }));
  renderServiceEditPanel(servicesElements, service, allProfessionals, {
    onCancel() {
      renderServiceDetailPanel();
    },
    async onSubmit(formData) {
      try {
        await callJson(`${API}/services/${service.id}`, "PATCH", { unitId, ...formData });
        renderSaleFeedback("success", "Servico atualizado com sucesso.", servicesFeedback);
        await loadCatalog();
        await loadAll();
        const detail = await loadServiceDetail(service.id);
        currentServiceDetail = detail;
        renderServiceDetailPanel();
      } catch (err) {
        const fb = servicesDrawerHost?.querySelector("#svcEditFeedback");
        if (fb) fb.innerHTML = `<p class="svc-edit-error">${escapeHtml(err.message || "Erro ao salvar")}</p>`;
      }
    },
  });
}

async function handleServiceAction(serviceIdValue, action, options = {}) {
  if (action === "create-empty") {
    showServicesModal(null);
    return;
  }
  const service = servicesByIdMap[serviceIdValue];
  if (!serviceIdValue || !action) return;

  if (action === "detail") {
    const detail = await loadServiceDetail(serviceIdValue);
    currentServiceDetail = detail;
    renderServiceDetailPanel();
    return;
  }

  if (action === "edit") {
    showServiceEditPanel(service);
    return;
  }

  if (action === "duplicate") {
    if (!service) return;
    const duplicatedName = `${service.name} (copia)`;
    await callJson(`${API}/services`, "POST", {
      unitId,
      name: duplicatedName,
      price: Number(service.price || 0),
      durationMinutes: Number(service.durationMinutes || 0),
      category: service.category || undefined,
      description: service.description || undefined,
      defaultCommissionRate: Number(service.defaultCommissionRate || 0),
      professionalIds: Array.isArray(service.enabledProfessionalIds)
        ? service.enabledProfessionalIds
        : [],
      isActive: Boolean(service.isActive),
      estimatedCost: Number(service.estimatedCost || 0),
      notes: service.notes || undefined,
    });
    renderSaleFeedback("success", "Servico duplicado com sucesso.", servicesFeedback);
    await loadAll();
    return;
  }

  if (action === "toggle-status") {
    const nextActive =
      options.nextActive != null ? Boolean(options.nextActive) : !Boolean(service?.isActive);
    await callJson(`${API}/services/${serviceIdValue}/status`, "PATCH", {
      unitId,
      isActive: nextActive,
    });
    renderSaleFeedback(
      "success",
      nextActive ? "Servico ativado com sucesso." : "Servico inativado com sucesso.",
      servicesFeedback,
    );
    await loadAll();
  }
}

function showInventoryProductModal(product = null) {
  if (!inventoryProductModal) return;
  const editing = Boolean(product);
  inventoryProductModalTitle.textContent = editing ? "Editar produto" : "Adicionar produto";
  inventoryProductSubmitBtn.textContent = editing ? "Salvar alteracoes" : "Salvar produto";
  inventoryProductId.value = editing ? product.id : "";
  inventoryProductName.value = editing ? product.name || "" : "";
  inventoryProductSalePrice.value = editing ? Number(product.salePrice || 0) : 0;
  inventoryProductQuantity.value = editing ? Number(product.quantity || 0) : 0;
  inventoryProductCostPrice.value = editing ? Number(product.costPrice || 0) : "";
  inventoryProductMinimumStock.value = editing ? Number(product.minimumStock || 0) : "";
  inventoryProductCategory.value = editing ? product.category || "" : "";
  if (inventoryProductImageUrl) inventoryProductImageUrl.value = editing ? productImageUrl(product) : "";
  inventoryProductNotes.value = editing ? stripProductImageNote(product.notes || "") : "";
  if (inventoryCategorySuggestions) {
    const categories = [...new Set(saleProductsList().map(productCategory))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    inventoryCategorySuggestions.innerHTML = categories
      .map((category) => `<option value="${escapeHtml(category)}"></option>`)
      .join("");
  }
  inventoryProductModal.classList.remove("hidden");
  inventoryProductModal.classList.add("flex");
}

function hideInventoryProductModal() {
  if (!inventoryProductModal) return;
  inventoryProductModal.classList.add("hidden");
  inventoryProductModal.classList.remove("flex");
}

function showInventoryStockModal({ productId, productName, type }) {
  if (!inventoryStockModal) return;
  const isAdd = type === "IN";
  const isAdjustment = type === "ADJUSTMENT";
  if (inventoryStockModalTitle) inventoryStockModalTitle.textContent = isAdjustment
    ? "Ajustar saldo"
    : isAdd
      ? "Registrar entrada"
      : "Registrar saida";
  if (inventoryStockModalSubtitle) inventoryStockModalSubtitle.textContent = productName || "";
  inventoryStockSubmitBtn.textContent = isAdjustment
    ? "Confirmar saldo"
    : isAdd
      ? "Confirmar entrada"
      : "Confirmar saida";
  inventoryStockProductId.value = productId || "";
  inventoryStockType.value = type || "IN";
  inventoryStockQuantity.value = "";
  inventoryStockReason.value = isAdjustment
    ? "Ajuste manual de saldo"
    : isAdd
      ? "Reposicao manual"
      : "Baixa manual";
  inventoryStockModal.classList.remove("hidden");
  inventoryStockModal.classList.add("flex");
}

function hideInventoryStockModal() {
  if (!inventoryStockModal) return;
  inventoryStockModal.classList.add("hidden");
  inventoryStockModal.classList.remove("flex");
}

const CLIENT_TAG_OPTIONS = new Set(["NEW", "RECURRING", "VIP", "INACTIVE"]);
const CLIENT_STATUS_OPTIONS = new Set(["NEW", "ACTIVE", "VIP", "INACTIVE"]);

function parseClientTagsInput(value) {
  if (!String(value || "").trim()) return [];
  const tags = String(value)
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .filter((item) => CLIENT_TAG_OPTIONS.has(item));
  return Array.from(new Set(tags));
}

function mapClientStatusToTags(status) {
  if (status === "VIP") return ["VIP"];
  if (status === "INACTIVE") return ["INACTIVE"];
  if (status === "ACTIVE") return ["RECURRING"];
  return ["NEW"];
}

function showClientsModal() {
  if (!clientsModal || !clientsForm) return;
  clientsForm.reset();
  if (clientsStatus) clientsStatus.value = "NEW";
  if (clientsSubmitBtn) {
    clientsSubmitBtn.disabled = false;
    clientsSubmitBtn.textContent = "Salvar cliente";
  }
  clientsModal.classList.remove("hidden");
  clientsModal.classList.add("flex");
  clientsName?.focus();
}

function hideClientsModal() {
  if (!clientsModal) return;
  clientsModal.classList.add("hidden");
  clientsModal.classList.remove("flex");
}

function formatClientPhoneInput(value) {
  const digits = normalizePhoneDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

async function refreshInventoryAndCatalog(message, tone = "success") {
  await loadCatalog();
  await loadAll();
  if (message) {
    renderSaleFeedback(tone, message, inventoryFeedback);
  }
}

async function loadClientsOverview() {
  const period = clientsPeriod.value || "month";
  const range = rangeFromPeriod(period);
  const query = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  const search = String(clientsSearch.value || "").trim();
  if (search) query.set("search", search);
  const status = clientsStatusFilter.value || "";
  if (status) query.set("status", status);
  const segment = clientsSegmentFilter.value || "";
  if (segment) query.set("segment", segment);

  const response = await apiFetch(`${API}/clients/overview?${query.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Falha ao carregar clientes");
  }
  return data;
}

async function loadProfessionalsPerformance() {
  const period = professionalsPeriod.value || "month";
  const range = rangeFromPeriod(period);
  const query = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  if (professionalsFilter.value) {
    query.set("professionalId", professionalsFilter.value);
  }

  const response = await apiFetch(`${API}/professionals/performance?${query.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Falha ao carregar desempenho de profissionais");
  }
  return data;
}

async function loadCommissionsStatement() {
  const period = commissionsPeriod.value || "month";
  const range = rangeFromPeriod(period);
  const query = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    limit: "120",
  });
  if (commissionsProfessionalFilter.value) {
    query.set("professionalId", commissionsProfessionalFilter.value);
  }
  if (commissionsStatusFilter?.value) {
    query.set("status", commissionsStatusFilter.value);
  }

  const response = await apiFetch(`${API}/financial/commissions?${query.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Falha ao carregar comissoes");
  }
  const appliesTo = commissionsAppliesToFilter.value;
  if (!appliesTo) return data;
  const entries = Array.isArray(data.entries)
    ? data.entries.filter((entry) => entry.source === appliesTo || entry.appliesTo === appliesTo)
    : [];
  return {
    ...data,
    entries,
  };
}

function populateAuditActorFilter(events = []) {
  const select = document.getElementById("auditActorFilter");
  if (!select) return;
  const current = select.value;
  const actors = [...new Set(
    events.map((e) => e.actorEmail || e.actorId).filter(Boolean)
  )].sort();
  select.innerHTML = `<option value="">Todos os atores</option>` +
    actors.map((a) => `<option value="${escapeHtml(a)}"${a === current ? " selected" : ""}>${escapeHtml(a)}</option>`).join("");
}

async function loadAuditEvents() {
  const query = new URLSearchParams({
    unitId,
    limit: String(auditLimitFilter?.value || "50"),
  });
  const entity = String(auditEntityFilter?.value || "").trim();
  const action = String(auditActionFilter?.value || "").trim();
  const actorId = String(auditActorFilter?.value || "").trim();
  if (auditStartFilter?.value) {
    query.set("start", new Date(`${auditStartFilter.value}T00:00:00`).toISOString());
  }
  if (auditEndFilter?.value) {
    query.set("end", new Date(`${auditEndFilter.value}T23:59:59.999`).toISOString());
  }

  const response = await apiFetch(`${API}/audit/events?${query.toString()}`);
  const data = await readResponsePayload(response);
  if (!response.ok) {
    const fallback =
      response.status === 403
        ? "Auditoria e restrita ao perfil dono."
        : "Falha ao carregar auditoria.";
    throw new Error(extractApiErrorMessage(response, data, fallback));
  }
  const events = Array.isArray(data?.events) ? data.events : [];
  const humanizeAuditToken = (value) =>
    String(value || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim()
      .toLowerCase();
  const ENTITY_PT = {
    appointment: "agenda", Appointment: "agenda",
    product_sale: "pdv", product_sale_refund: "pdv",
    financial_entry: "financeiro", financial_transaction: "financeiro",
    commission: "comissoes",
    product: "estoque", inventory: "estoque", stock_movement: "estoque",
    settings: "configuracoes", business_settings: "configuracoes", business_hours: "configuracoes",
    service: "servicos", professional: "profissionais", user: "usuarios",
  };
  const advancedFilters = {
    entity: entity.toLowerCase(),
    action: action.toLowerCase(),
    actor: actorId.toLowerCase(),
    requestId: String(auditRequestIdFilter?.value || "").trim().toLowerCase(),
    idempotencyKey: String(auditIdempotencyFilter?.value || "").trim().toLowerCase(),
    entityId: String(auditEntityIdFilter?.value || "").trim().toLowerCase(),
    route: String(auditRouteFilter?.value || "").trim().toLowerCase(),
    method: String(auditMethodFilter?.value || "").trim().toUpperCase(),
  };
  const filterStart = auditStartFilter?.value
    ? new Date(`${auditStartFilter.value}T00:00:00`)
    : null;
  const filterEnd = auditEndFilter?.value
    ? new Date(`${auditEndFilter.value}T23:59:59.999`)
    : null;

  const filteredEvents = events.filter((event) => {
    if (filterStart || filterEnd) {
      const eventDate = event.createdAt ? new Date(event.createdAt) : null;
      if (eventDate) {
        if (filterStart && eventDate < filterStart) return false;
        if (filterEnd && eventDate > filterEnd) return false;
      }
    }
    if (
      advancedFilters.entity &&
      ![
        event.entity,
        humanizeAuditToken(event.entity),
        ENTITY_PT[event.entity] || "",
      ]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(advancedFilters.entity))
    ) {
      return false;
    }
    if (
      advancedFilters.action &&
      ![
        event.action,
        humanizeAuditToken(event.action),
      ]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(advancedFilters.action))
    ) {
      return false;
    }
    if (
      advancedFilters.actor &&
      ![event.actorId, event.actorEmail, event.actorRole]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(advancedFilters.actor))
    ) {
      return false;
    }
    if (advancedFilters.requestId && !String(event.requestId || "").toLowerCase().includes(advancedFilters.requestId)) return false;
    if (advancedFilters.idempotencyKey && !String(event.idempotencyKey || "").toLowerCase().includes(advancedFilters.idempotencyKey)) return false;
    if (advancedFilters.entityId && !String(event.entityId || "").toLowerCase().includes(advancedFilters.entityId)) return false;
    if (advancedFilters.route && !String(event.route || "").toLowerCase().includes(advancedFilters.route)) return false;
    if (advancedFilters.method && String(event.method || "").toUpperCase() !== advancedFilters.method) return false;
    return true;
  });
  return {
    ...(data || {}),
    events: filteredEvents,
    summary: {
      ...(data?.summary || {}),
      total: filteredEvents.length,
    },
  };
}

async function refreshAuditEvents() {
  try {
    renderAuditLoading(auditElements);
    const data = await loadAuditEvents();
    currentAuditPayload = data;
    renderAuditData(auditElements, data);
    populateAuditActorFilter(Array.isArray(data?.events) ? data.events : []);
  } catch (error) {
    renderAuditError(
      auditElements,
      error?.message || "Nao foi possivel carregar auditoria.",
    );
  }
}

async function readOptionalJson(response, label) {
  const data = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(`${label}: ${extractApiErrorMessage(response, data, "Nao foi possivel carregar dados do relatorio.")}`);
  }
  return data;
}

async function loadReportsBundle() {
  const period = reportsPeriod?.value || "month";
  const range = rangeFromReportsPeriod(period);
  const previous = previousRangeFromCurrent(range);
  const common = {
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  };
  const query = (extra = {}) => new URLSearchParams({ ...common, ...extra }).toString();

  const requests = {
    managementSummary: apiFetch(`${API}/reports/management/summary?${query()}`),
    managementFinancial: apiFetch(`${API}/reports/management/financial?${query({ limit: "400" })}`),
    managementAppointments: apiFetch(`${API}/reports/management/appointments?${query({ limit: "500" })}`),
    managementProductSales: apiFetch(`${API}/reports/management/product-sales?${query({ limit: "300" })}`),
    managementStock: apiFetch(`${API}/reports/management/stock?${query({ limit: "300" })}`),
    managementProfessionals: apiFetch(`${API}/reports/management/professionals?${query()}`),
    managementAudit: apiFetch(`${API}/reports/management/audit?${query({ limit: "120" })}`),
    financialCommissions: apiFetch(`${API}/financial/commissions?${query({ limit: "300" })}`),
    clients: apiFetch(`${API}/clients/overview?${query()}`),
  };

  const settled = await Promise.allSettled(
    Object.entries(requests).map(async ([key, request]) => [key, await readOptionalJson(await request, key)]),
  );
  const data = {};
  const errors = {};
  settled.forEach((result) => {
    if (result.status === "fulfilled") {
      const [key, value] = result.value;
      data[key] = value;
      return;
    }
    const message = result.reason?.message || "Dados indisponiveis.";
    const [key, ...rest] = message.split(":");
    errors[key || `endpoint-${Object.keys(errors).length + 1}`] = rest.join(":").trim() || message;
  });

  return {
    period: {
      type: period,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      label: reportsPeriodLabel(range),
    },
    data,
    errors,
    exportParams: common,
  };
}

async function loadFidelizacaoData() {
  const period = fidelizacaoPeriod.value || "month";
  const range = rangeFromPeriod(period);

  const loyaltyParams = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  const retentionParams = new URLSearchParams({
    unitId,
    limit: "60",
  });
  if (retentionRiskFilter.value) {
    retentionParams.set("riskLevel", retentionRiskFilter.value);
  }
  const multiParams = new URLSearchParams({
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });

  const [
    loyaltySummaryResponse,
    packagesResponse,
    plansResponse,
    subscriptionsResponse,
    retentionResponse,
    multiunitResponse,
  ] = await Promise.all([
    apiFetch(`${API}/loyalty/summary?${loyaltyParams.toString()}`),
    apiFetch(`${API}/packages?unitId=${unitId}`),
    apiFetch(`${API}/subscriptions/plans?unitId=${unitId}`),
    apiFetch(
      `${API}/subscriptions/overview?unitId=${unitId}&start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`,
    ),
    apiFetch(`${API}/retention/cases?${retentionParams.toString()}`),
    apiFetch(`${API}/multiunit/overview?${multiParams.toString()}`),
  ]);

  const [loyalty, packages, plans, subscriptions, retention, multiunit] = await Promise.all([
    loyaltySummaryResponse.json(),
    packagesResponse.json(),
    plansResponse.json(),
    subscriptionsResponse.json(),
    retentionResponse.json(),
    multiunitResponse.json(),
  ]);

  if (!loyaltySummaryResponse.ok) throw new Error(loyalty.error || "Falha ao carregar fidelidade");
  if (!packagesResponse.ok) throw new Error(packages.error || "Falha ao carregar pacotes");
  if (!plansResponse.ok) throw new Error(plans.error || "Falha ao carregar planos");
  if (!subscriptionsResponse.ok) {
    throw new Error(subscriptions.error || "Falha ao carregar assinaturas");
  }
  if (!retentionResponse.ok) throw new Error(retention.error || "Falha ao carregar retencao");
  if (!multiunitResponse.ok) throw new Error(multiunit.error || "Falha ao carregar multiunidade");

  const packageRows = Array.isArray(packages.packages) ? packages.packages : [];
  if (packageRows.length) {
    fillSelect(packageId, packageRows, (item) => `${item.name} - R$ ${Number(item.price).toFixed(2)}`);
  } else {
    packageId.innerHTML = "<option value=''>Sem pacotes</option>";
  }
  const planRows = Array.isArray(plans.plans) ? plans.plans : [];
  if (planRows.length) {
    fillSelect(
      subscriptionPlanId,
      planRows,
      (item) => `${item.name} - R$ ${Number(item.priceMonthly).toFixed(2)}/mes`,
    );
  } else {
    subscriptionPlanId.innerHTML = "<option value=''>Sem planos</option>";
  }

  return {
    loyalty,
    packages,
    plans,
    subscriptions,
    retention,
    multiunit,
  };
}

async function loadAutomacoesData() {
  const period = automacoesPeriod.value || "month";
  const range = rangeFromPeriod(period);
  const rulesParams = new URLSearchParams({ unitId });
  if (automacoesRulesFilter?.value === "true") {
    rulesParams.set("active", "true");
  } else if (automacoesRulesFilter?.value === "false") {
    rulesParams.set("active", "false");
  }
  const executionsParams = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  if (automacoesStatusFilter.value) {
    executionsParams.set("status", automacoesStatusFilter.value);
  }

  const scoringParams = new URLSearchParams({
    unitId,
    limit: "40",
  });
  if (automacoesRiskFilter.value) {
    scoringParams.set("riskLevel", automacoesRiskFilter.value);
  }

  const webhookParams = new URLSearchParams({
    unitId,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  if (automacoesProviderFilter.value) {
    webhookParams.set("provider", automacoesProviderFilter.value);
  }

  const [rulesResponse, executionsResponse, scoringResponse, scoringOverviewResponse, webhookLogsResponse] = await Promise.all([
    apiFetch(`${API}/automations/rules?${rulesParams.toString()}`),
    apiFetch(`${API}/automations/executions?${executionsParams.toString()}`),
    apiFetch(`${API}/retention/scoring/clients?${scoringParams.toString()}`),
    apiFetch(
      `${API}/retention/scoring/overview?unitId=${unitId}&start=${encodeURIComponent(
        range.start.toISOString(),
      )}&end=${encodeURIComponent(range.end.toISOString())}`,
    ),
    apiFetch(`${API}/integrations/webhooks/logs?${webhookParams.toString()}`),
  ]);

  const [rules, executions, scoring, scoringOverview, webhookLogs] = await Promise.all([
    rulesResponse.json(),
    executionsResponse.json(),
    scoringResponse.json(),
    scoringOverviewResponse.json(),
    webhookLogsResponse.json(),
  ]);

  if (!rulesResponse.ok) {
    throw new Error(rules.error || "Falha ao carregar regras de automacao");
  }
  if (!executionsResponse.ok) {
    throw new Error(executions.error || "Falha ao carregar execucoes de automacao");
  }
  if (!scoringResponse.ok) {
    throw new Error(scoring.error || "Falha ao carregar scoring de retencao");
  }
  if (!scoringOverviewResponse.ok) {
    throw new Error(scoringOverview.error || "Falha ao carregar overview de scoring");
  }
  if (!webhookLogsResponse.ok) {
    throw new Error(webhookLogs.error || "Falha ao carregar logs de integracao");
  }

  return {
    rules,
    executions,
    scoring,
    scoringOverview,
    webhookLogs,
  };
}

async function loadSettingsModule() {
  const response = await apiFetch(`${API}/settings?unitId=${unitId}`);
  const data = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      extractApiErrorMessage(response, data, "Falha ao carregar configuracoes da empresa"),
    );
  }
  return data || {};
}

function parseMetasGoalMonth(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function openMetasGoalModal(mode = "create") {
  if (!metasGoalModal || !metasGoalForm) return;
  const currentGoal = currentMetasPayload?.summary?.goal || null;
  const shouldEdit = mode === "edit" && currentGoal;

  metasGoalForm.reset();
  if (metasGoalMonth) metasGoalMonth.value = asMonthInputValue(new Date());
  if (metasGoalId) metasGoalId.value = "";
  if (metasGoalModalTitle) metasGoalModalTitle.textContent = "Definir meta mensal";
  if (metasGoalSubmitBtn) metasGoalSubmitBtn.textContent = "Salvar meta";
  renderSaleFeedback("", "", metasGoalFormFeedback);

  if (shouldEdit) {
    if (metasGoalId) metasGoalId.value = String(currentGoal.id || "");
    if (metasGoalMonth) {
      metasGoalMonth.value = `${currentGoal.year}-${String(currentGoal.month).padStart(2, "0")}`;
    }
    if (metasRevenueTarget) metasRevenueTarget.value = String(currentGoal.revenueTarget || "");
    if (metasAppointmentsTarget) {
      metasAppointmentsTarget.value = String(currentGoal.appointmentsTarget || "");
    }
    if (metasAverageTicketTarget) {
      metasAverageTicketTarget.value =
        currentGoal.averageTicketTarget == null ? "" : String(currentGoal.averageTicketTarget);
    }
    if (metasNotes) metasNotes.value = currentGoal.notes || "";
    if (metasGoalModalTitle) metasGoalModalTitle.textContent = "Editar meta mensal";
    if (metasGoalSubmitBtn) metasGoalSubmitBtn.textContent = "Salvar alteracoes";
  }

  metasGoalModal.classList.remove("hidden");
  metasGoalModal.classList.add("flex");
  metasGoalMonth?.focus();
}

function closeMetasGoalModal() {
  if (!metasGoalModal) return;
  metasGoalModal.classList.add("hidden");
  metasGoalModal.classList.remove("flex");
}

async function loadMetasModule() {
  const periodValue = metasGoalMonth?.value || asMonthInputValue(new Date());
  const parsed = parseMetasGoalMonth(periodValue) || {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  };

  const query = new URLSearchParams({
    unitId,
    month: String(parsed.month),
    year: String(parsed.year),
  });

  const [summaryResponse, professionalsResponse, servicesResponse] = await Promise.all([
    apiFetch(`${API}/performance/summary?${query.toString()}`),
    apiFetch(`${API}/performance/professionals?${query.toString()}`),
    apiFetch(`${API}/performance/services?${query.toString()}`),
  ]);
  const [summaryData, professionalsData, servicesData] = await Promise.all([
    readResponsePayload(summaryResponse),
    readResponsePayload(professionalsResponse),
    readResponsePayload(servicesResponse),
  ]);

  if (!summaryResponse.ok) {
    throw new Error(
      extractApiErrorMessage(summaryResponse, summaryData, "Falha ao carregar resumo da meta"),
    );
  }
  if (!professionalsResponse.ok) {
    throw new Error(
      extractApiErrorMessage(
        professionalsResponse,
        professionalsData,
        "Falha ao carregar performance por profissionais",
      ),
    );
  }
  if (!servicesResponse.ok) {
    throw new Error(
      extractApiErrorMessage(
        servicesResponse,
        servicesData,
        "Falha ao carregar performance por servicos",
      ),
    );
  }

  return {
    summary: summaryData || {},
    professionals: professionalsData || {},
    services: servicesData || {},
  };
}

const SKIPPED_MODULE_LOAD = "__skipped_module_load__";

function loadModuleIfAllowed(moduleId, loader) {
  if (isAllowedModule(moduleId)) return loader();
  return Promise.resolve({ type: SKIPPED_MODULE_LOAD, moduleId });
}

function isSkippedModuleLoad(result) {
  return result?.status === "fulfilled" && result.value?.type === SKIPPED_MODULE_LOAD;
}

async function loadAll() {
  renderDashboardLoading(dashboardElements);
  renderAgendaLoading(agendaElements);
  renderFinancialLoading(financialElements);
  renderStockLoading(stockElements);
  renderClientsLoading(clientsElements);
  renderProfessionalsLoading(professionalsElements);
  renderServicesLoading(servicesElements);
  renderCommissionsLoading(commissionsElements);
  renderFidelizacaoLoading(fidelizacaoElements);
  renderAutomacoesLoading(automacoesElements);
  renderAppointmentsLoading(appointmentsElements);
  renderSettingsLoading(settingsElements);
  renderMetasLoading(metasElements);
  renderAuditLoading(auditElements);
  renderReportsLoading(reportsElements);

  const [
    agendaResult,
    appointmentsResult,
    dashboardResult,
    financialResult,
    stockResult,
    clientsResult,
    professionalsResult,
    servicesResult,
    commissionsResult,
    fidelizacaoResult,
    automacoesResult,
    settingsResult,
    metasResult,
    auditResult,
    productSalesHistoryResult,
    reportsResult,
  ] = await Promise.allSettled([
    loadAgendaByPeriod(),
    loadAppointmentsByFilters(),
    loadDashboard(),
    loadModuleIfAllowed("financeiro", loadFinancialEntries),
    loadStockOverview(),
    loadClientsOverview(),
    loadProfessionalsPerformance(),
    loadServicesModule(),
    loadModuleIfAllowed("comissoes", loadCommissionsStatement),
    loadModuleIfAllowed("fidelizacao", loadFidelizacaoData),
    loadModuleIfAllowed("automacoes", loadAutomacoesData),
    loadModuleIfAllowed("configuracoes", loadSettingsModule),
    loadModuleIfAllowed("metas", loadMetasModule),
    loadModuleIfAllowed("auditoria", loadAuditEvents),
    loadModuleIfAllowed("operacao", loadProductSalesHistory),
    loadModuleIfAllowed("relatorios", loadReportsBundle),
  ]);
  const financialSkipped = isSkippedModuleLoad(financialResult);
  const commissionsSkipped = isSkippedModuleLoad(commissionsResult);
  const fidelizacaoSkipped = isSkippedModuleLoad(fidelizacaoResult);
  const automacoesSkipped = isSkippedModuleLoad(automacoesResult);
  const settingsSkipped = isSkippedModuleLoad(settingsResult);
  const metasSkipped = isSkippedModuleLoad(metasResult);
  const auditSkipped = isSkippedModuleLoad(auditResult);
  const productSalesHistorySkipped = isSkippedModuleLoad(productSalesHistoryResult);
  const reportsSkipped = isSkippedModuleLoad(reportsResult);

  if (agendaResult.status === "fulfilled") {
    currentAgenda = agendaResult.value;
    renderAgendaView();
    refreshScheduleAssist();
  } else {
    currentAgenda = [];
    renderAgendaError(agendaElements, () => {
      loadAll();
    });
    refreshScheduleAssist({
      type: "warning",
      message: "Agenda indisponivel no momento. O pre-check local pode ficar incompleto.",
    });
  }

  if (appointmentsResult.status === "fulfilled") {
    currentAppointments = appointmentsResult.value;
    if (!currentAppointments.some((item) => item.id === selectedAppointmentId)) {
      selectedAppointmentId = "";
    }
    renderAgendaView();
  } else {
    currentAppointments = [];
    selectedAppointmentId = "";
    renderAppointmentsError(
      appointmentsElements,
      appointmentsResult.reason?.message || "Falha ao carregar central de agendamentos.",
    );
    renderAgendaView();
  }

  const dashboardAutomationSignalsPayload =
    automacoesResult.status === "fulfilled" && !automacoesSkipped
      ? buildDashboardAutomationSignals(automacoesResult.value)
      : {
          queued: 0,
          executed: 0,
          failed: 0,
          lastExecutedAt: null,
          topPlaybooks: [],
        };
  const clientsAutomationSignalsPayload =
    automacoesResult.status === "fulfilled" && !automacoesSkipped && clientsResult.status === "fulfilled"
      ? buildClientsAutomationSignals(clientsResult.value, automacoesResult.value)
      : {
          clientsWithRecentAutomation: 0,
          reactivationPlaybookExecutions: 0,
          recentClients: [],
        };

  if (dashboardResult.status === "fulfilled") {
    renderDashboardData(
      dashboardElements,
      buildRevenueMachineDashboardPayload({
        dashboardPayload: dashboardResult.value,
        dashboardAutomationSignals: dashboardAutomationSignalsPayload,
        clientsPayload: clientsResult.status === "fulfilled" ? clientsResult.value : null,
        financialPayload: financialResult.status === "fulfilled" && !financialSkipped ? financialResult.value : null,
        stockPayload: stockResult.status === "fulfilled" ? stockResult.value : null,
        automacoesPayload: automacoesResult.status === "fulfilled" && !automacoesSkipped ? automacoesResult.value : null,
      }),
    );
  } else {
    renderDashboardError(dashboardElements, () => {
      loadAll();
    });
  }

  if (financialSkipped) {
    currentFinancialTransactions = [];
  } else if (financialResult.status === "fulfilled") {
    currentFinancialTransactions = Array.isArray(financialResult.value?.transactions?.transactions)
      ? financialResult.value.transactions.transactions
      : [];
    renderFinancialData(financialElements, financialResult.value);
    if (financialResult.value?.meta?.hasErrors) {
      renderSaleFeedback(
        "warning",
        "Nao foi possivel carregar os dados financeiros. Tente atualizar.",
        financialFeedback,
      );
    } else {
      renderSaleFeedback("", "", financialFeedback);
    }
  } else {
    currentFinancialTransactions = [];
    renderFinancialError(financialElements, "Nao foi possivel carregar o financeiro do periodo.");
    renderSaleFeedback(
      "warning",
      "Nao foi possivel carregar os dados financeiros. Tente atualizar.",
      financialFeedback,
    );
  }

  if (stockResult.status === "fulfilled") {
    currentStockPayload = stockResult.value;
    if (Array.isArray(stockResult.value?.products)) {
      stockResult.value.products.forEach((product) => {
        const existing = productsById[product.id] || {};
        productsById[product.id] = {
          ...existing,
          ...product,
          stockQty: product.quantity ?? existing.stockQty ?? 0,
        };
      });
      renderSaleProductCatalog();
      if (saleProductId?.value) setSaleSelectedProduct(saleProductId.value);
    }
    renderStockData(stockElements, stockResult.value);
  } else {
    currentStockPayload = null;
    renderStockError(stockElements, "Nao foi possivel carregar estoque operacional.");
  }

  if (productSalesHistorySkipped) {
    productSalesHistory = [];
  } else if (productSalesHistoryResult.status !== "fulfilled") {
    productSalesHistory = [];
    if (saleRecentList) {
      saleRecentList.innerHTML = `<p class="panel-msg panel-msg-error">Nao foi possivel carregar historico de vendas.</p>`;
    }
  }

  if (clientsResult.status === "fulfilled") {
    currentClientsPayload = clientsResult.value;
    renderClientsData(clientsElements, {
      ...clientsResult.value,
      automationSignals: clientsAutomationSignalsPayload,
    }, {
      hasActiveFilters:
        Boolean(String(clientsSearch.value || "").trim()) ||
        Boolean(clientsStatusFilter.value) ||
        Boolean(clientsSegmentFilter.value),
    });
  } else {
    currentClientsPayload = null;
    renderClientsError(clientsElements, "Nao foi possivel carregar carteira de clientes.");
  }

  if (professionalsResult.status === "fulfilled") {
    currentProfessionalsPayload = professionalsResult.value;
    renderProfessionalsData(professionalsElements, professionalsResult.value, {
      services: servicesResult.status === "fulfilled" ? servicesResult.value.services : allServices,
      appointments: currentAppointments.length ? currentAppointments : currentAgenda,
      commissions: commissionsResult.status === "fulfilled" && !commissionsSkipped ? commissionsResult.value.entries : [],
    });
  } else {
    currentProfessionalsPayload = null;
    renderProfessionalsError(
      professionalsElements,
      "Nao foi possivel carregar desempenho de profissionais.",
    );
  }

  if (servicesResult.status === "fulfilled") {
    renderServicesData(servicesElements, servicesResult.value);
    if (
      currentServiceDetail?.service?.id &&
      !servicesResult.value.services.some((item) => item.id === currentServiceDetail.service.id)
    ) {
      currentServiceDetail = null;
    }
    renderServiceDetailPanel();
  } else {
    currentServiceDetail = null;
    renderServiceDetailPanel();
    renderServicesError(servicesElements, "Nao foi possivel carregar o modulo de servicos.");
  }

  if (commissionsSkipped) {
    currentCommissionsPayload = null;
  } else if (commissionsResult.status === "fulfilled") {
    currentCommissionsPayload = commissionsResult.value;
    renderCommissionsData(commissionsElements, commissionsResult.value, {
      canPayCommissions: true,
    });
  } else {
    currentCommissionsPayload = null;
    renderCommissionsError(commissionsElements, "Nao foi possivel carregar extrato de comissoes.");
  }

  if (auditSkipped) {
    currentAuditPayload = null;
  } else if (auditResult.status === "fulfilled") {
    currentAuditPayload = auditResult.value;
    renderAuditData(auditElements, auditResult.value);
    populateAuditActorFilter(Array.isArray(auditResult.value?.events) ? auditResult.value.events : []);
  } else {
    currentAuditPayload = null;
    renderAuditError(
      auditElements,
      auditResult.reason?.message || "Nao foi possivel carregar auditoria.",
    );
  }

  if (reportsSkipped) {
    currentReportsPayload = null;
  } else if (reportsResult.status === "fulfilled") {
    currentReportsPayload = reportsResult.value;
    renderReportsData(reportsElements, reportsResult.value, {
      activeReportId,
    });
  } else {
    currentReportsPayload = null;
    renderReportsError(
      reportsElements,
      reportsResult.reason?.message || "Nao foi possivel carregar relatorios operacionais.",
    );
  }

  if (fidelizacaoSkipped) {
    // Modulo oculto para o perfil atual.
  } else if (fidelizacaoResult.status === "fulfilled") {
    renderFidelizacaoData(fidelizacaoElements, fidelizacaoResult.value);
  } else {
    renderFidelizacaoError(
      fidelizacaoElements,
      "Nao foi possivel carregar fidelizacao premium e multiunidade.",
    );
  }

  if (automacoesSkipped) {
    currentAutomationRules = [];
  } else if (automacoesResult.status === "fulfilled") {
    currentAutomationRules = Array.isArray(automacoesResult.value?.rules?.rules)
      ? automacoesResult.value.rules.rules
      : [];
    renderAutomacoesData(automacoesElements, automacoesResult.value);
  } else {
    currentAutomationRules = [];
    renderAutomacoesError(
      automacoesElements,
      "Nao foi possivel carregar execucao operacional das automacoes.",
    );
  }

  if (settingsSkipped) {
    currentSettingsPayload = null;
  } else if (settingsResult.status === "fulfilled") {
    currentSettingsPayload = settingsResult.value || {};
    renderSettingsData(settingsElements, currentSettingsPayload, {
      professionals: Object.values(professionalsById),
      services: allServices,
    }, settingsActiveSection);
    animateSettingsScreen(settingsRoot);
    applyThemeFromSettingsPayload(currentSettingsPayload);
  } else {
    currentSettingsPayload = null;
    applyThemeFromSettingsPayload(null);
    renderSettingsError(
      settingsElements,
      settingsResult.reason?.message || "Nao foi possivel carregar configuracoes.",
    );
  }

  if (metasSkipped) {
    currentMetasPayload = null;
  } else if (metasResult.status === "fulfilled") {
    currentMetasPayload = metasResult.value || null;
    renderMetasData(metasElements, currentMetasPayload || {});
  } else {
    currentMetasPayload = null;
    renderMetasError(
      metasElements,
      metasResult.reason?.message || "Nao foi possivel carregar metas e performance.",
    );
  }

  const lateCount = currentAgenda.filter((item) => {
    const operational = item.status === "SCHEDULED" || item.status === "CONFIRMED";
    return operational && item.startsAt.getTime() < Date.now();
  }).length;
  const lowStockCount =
    stockResult.status === "fulfilled" && Array.isArray(stockResult.value?.lowStock)
      ? stockResult.value.lowStock.length
      : 0;
  const failedAutomations =
    automacoesResult.status === "fulfilled"
      ? Number(automacoesResult.value?.executions?.summary?.failed || 0)
      : 0;
  updateNavigationBadges({ lateCount, lowStockCount, failedAutomations });
  renderShell();
}

function settingsBusinessBasePayload() {
  const business = currentSettingsPayload?.business || {};
  return {
    businessName: String(business.businessName || "").trim(),
    segment: String(business.segment || "barbearia"),
    phone: String(business.phone || "").trim(),
    email: String(business.email || "").trim(),
    address: String(business.address || "").trim(),
    city: String(business.city || "").trim(),
    state: String(business.state || "").trim(),
    document: String(business.document || "").trim(),
    displayName: String(business.displayName || "").trim(),
    primaryColor: String(business.primaryColor || "#0f172a").trim(),
    themeMode: String(business.themeMode || "system"),
    defaultAppointmentDuration: Number(business.defaultAppointmentDuration || 45),
    minimumAdvanceMinutes: Number(business.minimumAdvanceMinutes || 30),
    bufferBetweenAppointmentsMinutes: Number(business.bufferBetweenAppointmentsMinutes || 10),
    reminderLeadMinutes: Number(business.reminderLeadMinutes || 60),
    sendAppointmentReminders: Boolean(business.sendAppointmentReminders),
    inactiveCustomerDays: Number(business.inactiveCustomerDays || 60),
    atRiskCustomerDays: Number(business.atRiskCustomerDays || 30),
    allowWalkIns: Boolean(business.allowWalkIns),
    allowOutOfHoursAppointments: Boolean(business.allowOutOfHoursAppointments),
    allowOverbooking: Boolean(business.allowOverbooking),
    houseCommissionType: String(business.houseCommissionType || "PERCENTAGE"),
    houseCommissionValue: Number(business.houseCommissionValue || 40),
  };
}

async function saveSettingsBusiness(partialPayload) {
  const payload = {
    unitId,
    ...settingsBusinessBasePayload(),
    ...partialPayload,
  };
  await callJson(`${API}/settings/business`, "PATCH", payload);
}

async function refreshSettingsScreen(successMessage) {
  try {
    const payload = await loadSettingsModule();
    currentSettingsPayload = payload || {};
    renderSettingsData(settingsElements, currentSettingsPayload, {
      professionals: Object.values(professionalsById),
      services: allServices,
    }, settingsActiveSection);
    animateSettingsScreen(settingsRoot);
    applyThemeFromSettingsPayload(currentSettingsPayload);
    renderSaleFeedback("success", successMessage, settingsFeedback);
  } catch (error) {
    renderSettingsError(
      settingsElements,
      error?.message || "Falha ao atualizar configuracoes apos salvar.",
    );
    renderSaleFeedback(
      "error",
      error?.message || "Falha ao atualizar configuracoes apos salvar.",
      settingsFeedback,
    );
  }
}

if (settingsRoot) {
  settingsRoot.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.hasAttribute("data-phone-mask")) return;
    const pos = target.selectionStart ?? target.value.length;
    const raw = normalizePhoneDigits(target.value);
    const formatted = formatPhoneBR(raw);
    target.value = formatted;
    const newPos = pos + (formatted.length - target.value.length + (formatted.length - pos > 0 ? 1 : 0));
    try { target.setSelectionRange(newPos, newPos); } catch (_) {}
  });

  settingsRoot.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const form = target.closest("form");
    if (!(form instanceof HTMLFormElement)) return;
    if (target.name.startsWith("closed_")) {
      const dayOfWeek = Number(target.name.replace("closed_", ""));
      if (Number.isInteger(dayOfWeek)) {
        settingsHoursApplyClosedState(form, dayOfWeek, target.checked);
      }
    }
    if (
      target.name.startsWith("closed_") ||
      target.name.startsWith("opensAt_") ||
      target.name.startsWith("closesAt_") ||
      target.name.startsWith("breakStart_") ||
      target.name.startsWith("breakEnd_")
    ) {
      refreshSettingsHoursPreview(form);
    }
  });

  settingsRoot.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    try {
      if (form.id === "settingsBusinessForm") {
        const formData = new FormData(form);
        await saveSettingsBusiness({
          businessName: String(formData.get("businessName") || "").trim(),
          segment: String(formData.get("segment") || "barbearia"),
          phone: normalizePhoneDigits(formData.get("phone") || ""),
          email: String(formData.get("email") || "").trim(),
          address: String(formData.get("address") || "").trim(),
          city: String(formData.get("city") || "").trim(),
          state: String(formData.get("state") || "").trim(),
          document: String(formData.get("document") || "").trim(),
        });
        await refreshSettingsScreen("Dados da empresa salvos com sucesso.");
        return;
      }

      if (form.id === "settingsHoursForm") {
        const formData = new FormData(form);
        const hours = Array.from({ length: 7 }, (_item, dayOfWeek) => ({
          dayOfWeek,
          opensAt: String(formData.get(`opensAt_${dayOfWeek}`) || "").trim(),
          closesAt: String(formData.get(`closesAt_${dayOfWeek}`) || "").trim(),
          breakStart: String(formData.get(`breakStart_${dayOfWeek}`) || "").trim(),
          breakEnd: String(formData.get(`breakEnd_${dayOfWeek}`) || "").trim(),
          isClosed: formData.get(`closed_${dayOfWeek}`) != null,
        }));
        await callJson(`${API}/settings/business-hours`, "PATCH", {
          unitId,
          hours,
        });
        await refreshSettingsScreen("Horarios atualizados com sucesso.");
        return;
      }

      if (form.id === "settingsTeamForm") {
        const formData = new FormData(form);
        await callJson(`${API}/settings/team-members`, "POST", {
          unitId,
          name: String(formData.get("name") || "").trim(),
          role: String(formData.get("role") || "PROFESSIONAL"),
          accessProfile: String(formData.get("accessProfile") || "profissional"),
          isActive: true,
        });
        form.reset();
        await refreshSettingsScreen("Membro da equipe adicionado.");
        return;
      }

      if (form.id === "settingsHouseCommissionForm") {
        const formData = new FormData(form);
        await saveSettingsBusiness({
          houseCommissionType: String(formData.get("houseCommissionType") || "PERCENTAGE"),
          houseCommissionValue: Number(formData.get("houseCommissionValue") || 0),
        });
        await refreshSettingsScreen("Regra de comissao da casa atualizada.");
        return;
      }

      if (form.id === "settingsCommissionForm") {
        const formData = new FormData(form);
        await callJson(`${API}/settings/commission-rules`, "POST", {
          unitId,
          professionalId: String(formData.get("professionalId") || "").trim() || undefined,
          serviceId: String(formData.get("serviceId") || "").trim() || undefined,
          type: String(formData.get("type") || "PERCENTAGE"),
          value: Number(formData.get("value") || 0),
          isActive: true,
        });
        form.reset();
        await refreshSettingsScreen("Regra de comissao criada com sucesso.");
        return;
      }

      if (form.id === "settingsPaymentCreateForm") {
        const formData = new FormData(form);
        await callJson(`${API}/settings/payment-methods`, "POST", {
          unitId,
          name: String(formData.get("name") || "").trim(),
          isActive: true,
          isDefault: false,
        });
        form.reset();
        await refreshSettingsScreen("Metodo de pagamento adicionado.");
        return;
      }

      if (form.id === "settingsOperationsForm") {
        const formData = new FormData(form);
        await saveSettingsBusiness({
          defaultAppointmentDuration: Number(formData.get("defaultAppointmentDuration") || 45),
          minimumAdvanceMinutes: Number(formData.get("minimumAdvanceMinutes") || 0),
          bufferBetweenAppointmentsMinutes: Number(
            formData.get("bufferBetweenAppointmentsMinutes") || 0,
          ),
          reminderLeadMinutes: Number(formData.get("reminderLeadMinutes") || 0),
          atRiskCustomerDays: Number(formData.get("atRiskCustomerDays") || 30),
          inactiveCustomerDays: Number(formData.get("inactiveCustomerDays") || 60),
          allowWalkIns: formData.get("allowWalkIns") != null,
          allowOutOfHoursAppointments: formData.get("allowOutOfHoursAppointments") != null,
          sendAppointmentReminders: formData.get("sendAppointmentReminders") != null,
          allowOverbooking: formData.get("allowOverbooking") != null,
        });
        await refreshSettingsScreen("Preferencias operacionais atualizadas.");
        return;
      }

      if (form.id === "settingsUserForm") {
        const formData = new FormData(form);
        const selectedThemeMode = String(formData.get("themeMode") || "system");
        await saveSettingsBusiness({
          displayName: String(formData.get("displayName") || "").trim(),
          themeMode: selectedThemeMode,
        });
        applyThemeMode(selectedThemeMode, { userSet: true });
        await refreshSettingsScreen("Configuracoes do usuario salvas.");
      }
    } catch (error) {
      renderSaleFeedback(
        "error",
        error?.message || "Nao foi possivel salvar configuracoes.",
        settingsFeedback,
      );
    }
  });

  settingsRoot.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-theme-select]");
    if (!select) return;
    const theme = String(select.value || "system");
    applyThemeMode(theme, { userSet: true });
  });

  settingsRoot.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-settings-action]");
    if (!trigger) return;
    const action = trigger.getAttribute("data-settings-action");
    try {
      if (action === "apply-hours-preset") {
        const form = settingsRoot.querySelector("#settingsHoursForm");
        if (!(form instanceof HTMLFormElement)) return;
        const presetId = String(trigger.getAttribute("data-preset") || "").trim();
        const applied = applySettingsHoursPreset(form, presetId);
        if (applied) {
          renderSaleFeedback(
            "success",
            "Preset aplicado. Revise os dias e clique em Salvar horarios para publicar.",
            settingsFeedback,
          );
        }
        return;
      }

      if (action === "copy-day-hours") {
        const form = settingsRoot.querySelector("#settingsHoursForm");
        if (!(form instanceof HTMLFormElement)) return;
        const sourceDay = Number(trigger.getAttribute("data-source-day"));
        if (!Number.isInteger(sourceDay)) return;
        const copied = copyDayHoursToNextDays(form, sourceDay);
        if (copied) {
          renderSaleFeedback(
            "success",
            "Horario copiado para os proximos dias. Nao esqueça de salvar.",
            settingsFeedback,
          );
        }
        return;
      }

      if (action === "toggle-team-member") {
        const memberId = trigger.getAttribute("data-member-id");
        if (!memberId) return;
        const member = (currentSettingsPayload?.teamMembers || []).find((item) => item.id === memberId);
        if (!member) return;
        await callJson(`${API}/settings/team-members/${memberId}`, "PATCH", {
          unitId,
          isActive: trigger.getAttribute("data-next-active") === "true",
          name: member.name,
        });
        await refreshSettingsScreen("Status do membro atualizado.");
        return;
      }

      if (action === "set-payment-default") {
        const paymentId = trigger.getAttribute("data-payment-id");
        if (!paymentId) return;
        await callJson(`${API}/settings/payment-methods/${paymentId}`, "PATCH", {
          unitId,
          isDefault: true,
          isActive: true,
        });
        await refreshSettingsScreen("Metodo padrao atualizado.");
        return;
      }

      if (action === "toggle-payment-active") {
        const paymentId = trigger.getAttribute("data-payment-id");
        if (!paymentId) return;
        await callJson(`${API}/settings/payment-methods/${paymentId}`, "PATCH", {
          unitId,
          isActive: trigger.getAttribute("data-next-active") === "true",
        });
        await refreshSettingsScreen("Status do metodo atualizado.");
        return;
      }

      if (action === "toggle-commission-rule") {
        const ruleId = trigger.getAttribute("data-rule-id");
        if (!ruleId) return;
        await callJson(`${API}/settings/commission-rules/${ruleId}`, "PATCH", {
          unitId,
          isActive: trigger.getAttribute("data-next-active") === "true",
        });
        await refreshSettingsScreen("Status da regra de comissao atualizado.");
        return;
      }

      if (action === "select-settings-section" || action === "open-section") {
        settingsActiveSection = trigger.getAttribute("data-settings-section") || "business";
        renderShell();
        renderSettingsData(settingsElements, currentSettingsPayload || {}, {
          professionals: Object.values(professionalsById),
          services: allServices,
        }, settingsActiveSection);
        animateSettingsScreen(settingsRoot);
        const hoursForm = settingsRoot.querySelector("#settingsHoursForm");
        if (hoursForm instanceof HTMLFormElement) {
          refreshSettingsHoursPreview(hoursForm);
        }
        renderSaleFeedback("", "", settingsFeedback);
      }
    } catch (error) {
      renderSaleFeedback(
        "error",
        error?.message || "Nao foi possivel executar a acao de configuracoes.",
        settingsFeedback,
      );
    }
  });
}

appointmentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const precheck = await validateScheduleSlot();
    if (!precheck.ok) return;
    const selectedStartsAt = startsAt.value;
    const startsAtIso = new Date(selectedStartsAt).toISOString();
    const selectedService = schedulingCatalog.servicesById?.[serviceId.value];
    const serviceDurationMinutes = Number(selectedService?.durationMin ?? 0);
    console.info("[schedule][request]", {
      selectedDateTime: selectedStartsAt,
      startsAt: startsAtIso,
      serviceDurationMinutes,
      professionalId: professionalId.value,
    });

    const createdAppointment = await callJson(`${API}/appointments`, "POST", {
      unitId,
      clientId: clientId.value,
      professionalId: professionalId.value,
      serviceId: serviceId.value,
      startsAt: startsAtIso,
    });
    console.info("[schedule][response]", createdAppointment);
    setScheduleFeedback("success", "Agendamento criado com sucesso.");
    renderAlternativeSlots([], null, alternativeSlots);
    await loadAll();
  } catch (error) {
    console.warn("[schedule][error]", {
      selectedDateTime: startsAt?.value,
      professionalId: professionalId?.value,
      response: error?.payload ?? null,
      message: error?.message ?? "Erro ao agendar",
      status: error?.status ?? null,
    });
    if (error.status === 409) {
      setScheduleFeedback("error", `${error.message}. Escolha um horario alternativo abaixo.`);
      await loadAlternativeSlots();
      return;
    }
    setScheduleFeedback("error", error.message || "Nao foi possivel concluir o agendamento.");
  }
});

saleAddItemBtn.addEventListener("click", () => {
  const product = productsById[saleProductId.value];
  try {
    saleCart = addItemToCart(saleCart, product, Number(saleQty.value || 1));
    renderSaleCart();
    renderSaleFeedback("success", `${product.name} adicionado ao carrinho.`, saleFeedback);
    const saleTotal = document.getElementById("saleTotal");
    if (saleTotal) {
      saleTotal.classList.add("ring-2", "ring-emerald-300");
      setTimeout(() => saleTotal.classList.remove("ring-2", "ring-emerald-300"), 350);
    }
  } catch (error) {
    renderSaleFeedback("error", error.message || "Nao foi possivel adicionar item.", saleFeedback);
  }
});

saleProductId?.addEventListener("change", () => {
  setSaleSelectedProduct(saleProductId.value);
});

pdvProductSearch?.addEventListener("input", () => {
  renderSaleProductCatalog();
});

saleClearCartBtn.addEventListener("click", () => {
  clearSaleCart();
  renderSaleProductCatalog();
  renderSaleFeedback("success", "Carrinho limpo.", saleFeedback);
});

if (saleRecentList) {
  saleRecentList.addEventListener("click", (event) => {
    const detailTarget = event.target.closest("[data-product-sale-detail]");
    if (detailTarget) {
      const sale = productSalesHistory.find((item) => item.id === detailTarget.getAttribute("data-product-sale-detail"));
      if (sale) renderSaleDrawer(sale);
      return;
    }
    const refundTarget = event.target.closest("[data-product-refund-sale]");
    if (!refundTarget) return;
    const sale = productSalesHistory.find((item) => item.id === refundTarget.getAttribute("data-product-refund-sale"));
    if (!sale) return;
    openProductRefundModal(sale);
  });
}

// Listeners for saleHistorySearch / saleHistoryStart / saleHistoryEnd are
// attached after DOM injection in renderOperationalChrome (those elements
// are null here since they're created dynamically).

function positionPopoverAdaptive(trigger, popover) {
  if (!trigger || !popover) return;
  const rect = trigger.getBoundingClientRect();
  const popoverHeight = 420;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow >= popoverHeight || spaceBelow >= spaceAbove) {
    popover.style.top = "calc(100% + 6px)";
    popover.style.bottom = "auto";
  } else {
    popover.style.bottom = "calc(100% + 6px)";
    popover.style.top = "auto";
  }
}

/* ── Sale history date range picker ─────────────────────────
   Shopify-style: trigger button → popover with 2-month calendar
   + preset shortcuts. Updates hidden #saleHistoryStart /
   #saleHistoryEnd inputs and triggers loadProductSalesHistory.
   ─────────────────────────────────────────────────────────── */
function initSaleHistoryDatePicker() {
  const wrap     = document.getElementById("shfPickerWrap");
  const trigger  = document.getElementById("saleHistoryDateTrigger");
  const popover  = document.getElementById("shfPickerPopover");
  const calsEl   = document.getElementById("shfCals");
  const labelEl  = document.getElementById("saleHistoryDateLabel");
  const rangeLbl = document.getElementById("shfRangeLabel");
  const applyBtn = document.getElementById("shfApplyBtn");
  const startIn  = document.getElementById("saleHistoryStart");
  const endIn    = document.getElementById("saleHistoryEnd");
  if (!trigger || !popover || !calsEl) return;

  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  let pickerStart = null; // Date or null
  let pickerEnd   = null;
  let hoverDate   = null;
  let phase       = 0;    // 0 = idle, 1 = waiting for end
  let leftYear, leftMonth;

  function toYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function sameDayOrBefore(a, b) { return a <= b; }
  function sameDay(a, b) { return toYMD(a) === toYMD(b); }

  function applyPreset(key) {
    const now = new Date(); now.setHours(0,0,0,0);
    let s, e;
    if (key === "today") {
      s = new Date(now); e = new Date(now);
    } else if (key === "7d") {
      s = new Date(now); s.setDate(s.getDate() - 6); e = new Date(now);
    } else if (key === "30d") {
      s = new Date(now); s.setDate(s.getDate() - 29); e = new Date(now);
    } else if (key === "month") {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
      e = new Date(now);
    } else if (key === "prev-month") {
      const m = now.getMonth() - 1;
      const y = m < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const mm = (m + 12) % 12;
      s = new Date(y, mm, 1);
      e = new Date(y, mm + 1, 0);
    }
    pickerStart = s; pickerEnd = e; phase = 0;
    popover.querySelectorAll(".shf-preset").forEach(b => {
      b.classList.toggle("is-active", b.dataset.shfPreset === key);
    });
    updateRangeLabel();
    renderCals();
  }

  function updateRangeLabel() {
    if (!pickerStart) { rangeLbl && (rangeLbl.textContent = ""); return; }
    const fmt = d => d.toLocaleDateString("pt-BR", { day:"2-digit", month:"short" });
    rangeLbl && (rangeLbl.textContent = pickerEnd && !sameDay(pickerStart, pickerEnd)
      ? `${fmt(pickerStart)} → ${fmt(pickerEnd)}`
      : fmt(pickerStart));
  }

  function renderCal(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0,0,0,0);

    let html = `<div class="shf-cal">
      <div class="shf-cal-head">
        <button type="button" class="shf-cal-nav" data-shf-nav="-1">&#8249;</button>
        <span class="shf-cal-title">${MONTHS[month]} ${year}</span>
        <button type="button" class="shf-cal-nav" data-shf-nav="1">&#8250;</button>
      </div>
      <div class="shf-cal-grid">
        ${["D","S","T","Q","Q","S","S"].map(d=>`<span class="shf-cal-dow">${d}</span>`).join("")}`;

    for (let i = 0; i < firstDay; i++) html += `<span></span>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const ymd = toYMD(date);
      const isToday = sameDay(date, today);
      const isStart = pickerStart && sameDay(date, pickerStart);
      const isEnd   = pickerEnd   && sameDay(date, pickerEnd);
      const endRef  = phase === 1 && hoverDate ? hoverDate : pickerEnd;
      const inRange = pickerStart && endRef &&
        sameDayOrBefore(pickerStart, date) && sameDayOrBefore(date, endRef);
      const isFuture = date > today;

      let cls = "shf-cal-day";
      if (isFuture) cls += " is-future";
      if (isToday)  cls += " is-today";
      if (isStart)  cls += " is-start";
      if (isEnd && !sameDay(pickerStart, date)) cls += " is-end";
      if (inRange && !isStart && !isEnd) cls += " in-range";
      if (isStart && isEnd) cls += " is-single";

      html += `<button type="button" class="${cls}" data-shf-date="${ymd}"${isFuture?" disabled":""}>${d}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderCals() {
    const right = new Date(leftYear, leftMonth + 1, 1);
    calsEl.innerHTML = renderCal(leftYear, leftMonth) +
                       renderCal(right.getFullYear(), right.getMonth());

    calsEl.querySelectorAll("[data-shf-nav]").forEach((btn, i) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dir = Number(btn.dataset.shfNav);
        const calIdx = Math.floor(i / 2); // 0=left, 1=right
        if (calIdx === 0 || dir === -1) {
          leftMonth += dir;
          if (leftMonth < 0)  { leftMonth = 11; leftYear--; }
          if (leftMonth > 11) { leftMonth = 0;  leftYear++; }
        } else {
          leftMonth += dir;
          if (leftMonth < 0)  { leftMonth = 11; leftYear--; }
          if (leftMonth > 11) { leftMonth = 0;  leftYear++; }
        }
        renderCals();
      });
    });

    calsEl.querySelectorAll("[data-shf-date]").forEach(btn => {
      btn.addEventListener("mouseenter", () => {
        if (phase !== 1) return;
        hoverDate = new Date(btn.dataset.shfDate + "T00:00:00");
        renderCals();
      });
      btn.addEventListener("click", () => {
        const clicked = new Date(btn.dataset.shfDate + "T00:00:00");
        if (phase === 0) {
          pickerStart = clicked; pickerEnd = null; hoverDate = null; phase = 1;
          popover.querySelectorAll(".shf-preset").forEach(b => b.classList.remove("is-active"));
        } else {
          if (clicked < pickerStart) { pickerEnd = pickerStart; pickerStart = clicked; }
          else pickerEnd = clicked;
          hoverDate = null; phase = 0;
        }
        updateRangeLabel(); renderCals();
      });
    });

    calsEl.addEventListener("mouseleave", () => {
      if (phase !== 1) return;
      hoverDate = null; renderCals();
    });
  }

  function formatTriggerLabel() {
    if (!pickerStart) return "Últimos 30 dias";
    const today = new Date(); today.setHours(0,0,0,0);
    const s = pickerStart, e = pickerEnd || today;
    const diff = Math.round((e - s) / 864e5);
    if (sameDay(s, today) && sameDay(e, today)) return "Hoje";
    if (diff === 6 && sameDay(e, today)) return "Últimos 7 dias";
    if (diff === 29 && sameDay(e, today)) return "Últimos 30 dias";
    const opts = { day:"2-digit", month:"short" };
    const sStr = s.toLocaleDateString("pt-BR", opts);
    const eStr = e.toLocaleDateString("pt-BR", opts);
    return sameDay(s, e) ? sStr : `${sStr} – ${eStr}`;
  }

  function openPicker() {
    const now = new Date();
    leftYear  = now.getFullYear();
    leftMonth = now.getMonth() - 1;
    if (leftMonth < 0) { leftMonth = 11; leftYear--; }
    renderCals();
    positionPopoverAdaptive(trigger, popover);
    popover.classList.remove("hidden");
    trigger.classList.add("is-active");
  }

  function closePicker() {
    popover.classList.add("hidden");
    trigger.classList.remove("is-active");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.classList.contains("hidden") ? openPicker() : closePicker();
  });

  popover.querySelectorAll("[data-shf-preset]").forEach(btn => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.shfPreset));
  });

  applyBtn?.addEventListener("click", () => {
    if (!pickerStart) return;
    const e = pickerEnd || pickerStart;
    startIn.value = toYMD(pickerStart);
    endIn.value   = toYMD(e);
    labelEl.textContent = formatTriggerLabel();
    closePicker();
    window.clearTimeout(saleHistoryDebounce);
    saleHistoryDebounce = window.setTimeout(() => {
      loadProductSalesHistory().catch(() => {
        if (saleRecentList) {
          saleRecentList.innerHTML = `<p class="panel-msg panel-msg-error">Nao foi possivel carregar historico de vendas.</p>`;
        }
      });
    }, 100);
  });

  document.addEventListener("click", (e) => {
    if (!wrap?.contains(e.target)) closePicker();
  });

  // Init with last 30 days preset
  applyPreset("30d");
  const now = new Date(); now.setHours(0,0,0,0);
  const s30 = new Date(now); s30.setDate(s30.getDate() - 29);
  startIn.value = toYMD(s30);
  endIn.value   = toYMD(now);
  labelEl.textContent = "Últimos 30 dias";
}

/* ── Audit date range picker ─────────────────────────────────
   Same pattern as initSaleHistoryDatePicker, wired to
   auditStartFilter / auditEndFilter hidden inputs and
   refreshes the audit timeline on apply.
   ─────────────────────────────────────────────────────────── */
function initAuditDatePicker() {
  const wrap     = document.getElementById("audPickerWrap");
  const trigger  = document.getElementById("auditDateTrigger");
  const popover  = document.getElementById("audPickerPopover");
  const calsEl   = document.getElementById("audCals");
  const labelEl  = document.getElementById("auditDateLabel");
  const rangeLbl = document.getElementById("audRangeLabel");
  const applyBtn = document.getElementById("audApplyBtn");
  const startIn  = document.getElementById("auditStartFilter");
  const endIn    = document.getElementById("auditEndFilter");
  if (!trigger || !popover || !calsEl || !startIn || !endIn || !labelEl) return;

  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  let pickerStart = null;
  let pickerEnd = null;
  let hoverDate = null;
  let phase = 0;
  let leftYear, leftMonth;

  function toYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function fromYMD(value) {
    if (!value) return null;
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function startOfToday() {
    const date = new Date();
    date.setHours(0,0,0,0);
    return date;
  }
  function sameDay(a, b) { return toYMD(a) === toYMD(b); }
  function rangeBounds(start, end) {
    if (!start || !end) return { start, end };
    return start <= end ? { start, end } : { start: end, end: start };
  }

  function setPresetActive(key) {
    popover.querySelectorAll(".shf-preset").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.audPreset === key);
    });
  }

  function applyPreset(key) {
    const now = startOfToday();
    let s, e;
    if (key === "today") {
      s = new Date(now); e = new Date(now);
    } else if (key === "7d") {
      s = new Date(now); s.setDate(s.getDate() - 6); e = new Date(now);
    } else if (key === "30d") {
      s = new Date(now); s.setDate(s.getDate() - 29); e = new Date(now);
    } else if (key === "month") {
      s = new Date(now.getFullYear(), now.getMonth(), 1); e = new Date(now);
    } else if (key === "prev-month") {
      const m = now.getMonth() - 1;
      const y = m < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const mm = (m + 12) % 12;
      s = new Date(y, mm, 1); e = new Date(y, mm + 1, 0);
    }
    pickerStart = s; pickerEnd = e; phase = 0;
    hoverDate = null;
    setPresetActive(key);
    updateRangeLabel();
    if (Number.isInteger(leftYear) && Number.isInteger(leftMonth)) renderCals();
  }

  function updateRangeLabel() {
    if (!pickerStart) { rangeLbl && (rangeLbl.textContent = ""); return; }
    const fmt = d => d.toLocaleDateString("pt-BR", { day:"2-digit", month:"short" });
    rangeLbl && (rangeLbl.textContent = pickerEnd && !sameDay(pickerStart, pickerEnd)
      ? `${fmt(pickerStart)} → ${fmt(pickerEnd)}`
      : fmt(pickerStart));
  }

  function presetKeyForRange() {
    if (!pickerStart || !pickerEnd) return "";
    const today = startOfToday();
    const diff = Math.round((pickerEnd - pickerStart) / 864e5);
    if (sameDay(pickerStart, today) && sameDay(pickerEnd, today)) return "today";
    if (diff === 6 && sameDay(pickerEnd, today)) return "7d";
    if (diff === 29 && sameDay(pickerEnd, today)) return "30d";
    if (
      pickerStart.getDate() === 1 &&
      pickerStart.getMonth() === today.getMonth() &&
      pickerStart.getFullYear() === today.getFullYear() &&
      sameDay(pickerEnd, today)
    ) {
      return "month";
    }
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    if (sameDay(pickerStart, prevMonth) && sameDay(pickerEnd, prevMonthEnd)) return "prev-month";
    return "";
  }

  function renderCal(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = startOfToday();

    let html = `<div class="shf-cal">
      <div class="shf-cal-head">
        <button type="button" class="shf-cal-nav" data-aud-nav="-1">&#8249;</button>
        <span class="shf-cal-title">${MONTHS[month]} ${year}</span>
        <button type="button" class="shf-cal-nav" data-aud-nav="1">&#8250;</button>
      </div>
      <div class="shf-cal-grid">
        ${["D","S","T","Q","Q","S","S"].map(d=>`<span class="shf-cal-dow">${d}</span>`).join("")}`;

    for (let i = 0; i < firstDay; i++) html += `<span></span>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const ymd  = toYMD(date);
      const isToday = sameDay(date, today);
      const isStart = pickerStart && sameDay(date, pickerStart);
      const isEnd   = pickerEnd   && sameDay(date, pickerEnd);
      const endRef  = phase === 1 && hoverDate ? hoverDate : pickerEnd;
      const visibleRange = rangeBounds(pickerStart, endRef);
      const inRange = visibleRange.start && visibleRange.end &&
        visibleRange.start <= date && date <= visibleRange.end;
      const isFuture = date > today;
      let cls = "shf-cal-day";
      if (isFuture) cls += " is-future";
      if (isToday) cls += " is-today";
      if (isStart) cls += " is-start";
      if (isEnd && !sameDay(pickerStart, date)) cls += " is-end";
      if (inRange && !isStart && !isEnd) cls += " in-range";
      if (isStart && isEnd) cls += " is-single";
      html += `<button type="button" class="${cls}" data-aud-date="${ymd}"${isFuture ? " disabled" : ""}>${d}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderCals() {
    const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear;
    const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;
    calsEl.innerHTML = renderCal(leftYear, leftMonth) + renderCal(rightYear, rightMonth);
  }

  function formatTriggerLabel() {
    if (!pickerStart) return "Últimos 30 dias";
    const today = startOfToday();
    const s = pickerStart, e = pickerEnd || pickerStart || today;
    const diff = Math.round((e - s) / 864e5);
    if (sameDay(s, today) && sameDay(e, today)) return "Hoje";
    if (diff === 6  && sameDay(e, today)) return "Últimos 7 dias";
    if (diff === 29 && sameDay(e, today)) return "Últimos 30 dias";
    const opts = { day:"2-digit", month:"short" };
    const sStr = s.toLocaleDateString("pt-BR", opts);
    const eStr = e.toLocaleDateString("pt-BR", opts);
    return sameDay(s, e) ? sStr : `${sStr} – ${eStr}`;
  }

  function openPicker() {
    pickerStart = fromYMD(startIn.value);
    pickerEnd = fromYMD(endIn.value) || pickerStart;
    hoverDate = null;
    phase = 0;
    const anchor = pickerEnd || pickerStart || startOfToday();
    leftYear  = anchor.getFullYear();
    leftMonth = anchor.getMonth() - 1;
    if (leftMonth < 0) { leftMonth = 11; leftYear--; }
    setPresetActive(presetKeyForRange());
    updateRangeLabel();
    renderCals();
    positionPopoverAdaptive(trigger, popover);
    popover.classList.remove("hidden");
    trigger.classList.add("is-active");
  }

  function closePicker() {
    popover.classList.add("hidden");
    trigger.classList.remove("is-active");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.classList.contains("hidden") ? openPicker() : closePicker();
  });

  popover.addEventListener("click", (event) => {
    event.stopPropagation();
    const preset = event.target.closest("[data-aud-preset]");
    if (preset) {
      applyPreset(preset.dataset.audPreset);
    }
  });

  calsEl.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-aud-nav]");
    if (nav) {
      const dir = Number(nav.dataset.audNav);
      leftMonth += dir;
      if (leftMonth < 0)  { leftMonth = 11; leftYear--; }
      if (leftMonth > 11) { leftMonth = 0;  leftYear++; }
      renderCals();
      return;
    }

    const day = event.target.closest("[data-aud-date]");
    if (!day || day.disabled) return;
    const clicked = fromYMD(day.dataset.audDate);
    if (!clicked) return;
    if (phase === 0) {
      pickerStart = clicked;
      pickerEnd = null;
      hoverDate = null;
      phase = 1;
      setPresetActive("");
    } else {
      if (clicked < pickerStart) {
        pickerEnd = pickerStart;
        pickerStart = clicked;
      } else {
        pickerEnd = clicked;
      }
      hoverDate = null;
      phase = 0;
    }
    updateRangeLabel();
    renderCals();
  });

  calsEl.addEventListener("mouseover", (event) => {
    const day = event.target.closest("[data-aud-date]");
    if (phase !== 1 || !day || day.disabled) return;
    const nextHoverDate = fromYMD(day.dataset.audDate);
    if (!nextHoverDate || (hoverDate && sameDay(hoverDate, nextHoverDate))) return;
    hoverDate = nextHoverDate;
    renderCals();
  });

  calsEl.addEventListener("mouseleave", () => {
    if (phase !== 1 || !hoverDate) return;
    hoverDate = null;
    renderCals();
  });

  applyBtn?.addEventListener("click", () => {
    if (!pickerStart) return;
    const e = pickerEnd || pickerStart;
    startIn.value = toYMD(pickerStart);
    endIn.value   = toYMD(e);
    labelEl.textContent = formatTriggerLabel();
    closePicker();
    refreshAuditEvents();
  });

  document.addEventListener("click", (e) => {
    if (!wrap?.contains(e.target)) closePicker();
  });

  // Init with last 30 days
  applyPreset("30d");
  const now = startOfToday();
  const s30 = new Date(now); s30.setDate(s30.getDate() - 29);
  if (startIn) startIn.value = toYMD(s30);
  if (endIn)   endIn.value   = toYMD(now);
  labelEl.textContent = "Últimos 30 dias";
}

/* ── Financial date range picker ──────────────────────────────
   Shopify-style: trigger button → popover with 2-month calendar
   + preset shortcuts. Updates hidden #financialCustomStart /
   #financialCustomEnd inputs and triggers loadAll.
   ─────────────────────────────────────────────────────────── */
function initFinancialDatePicker() {
  const wrap     = document.getElementById("fnPickerWrap");
  const trigger  = document.getElementById("financialDateTrigger");
  const popover  = document.getElementById("fnPickerPopover");
  const calsEl   = document.getElementById("fnCals");
  const labelEl  = document.getElementById("financialDateLabel");
  const rangeLbl = document.getElementById("fnRangeLabel");
  const applyBtn = document.getElementById("fnApplyBtn");
  const startIn  = document.getElementById("financialCustomStart");
  const endIn    = document.getElementById("financialCustomEnd");
  if (!trigger || !popover || !calsEl || !startIn || !endIn || !labelEl) return;

  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  let pickerStart = null;
  let pickerEnd = null;
  let hoverDate = null;
  let phase = 0;
  let leftYear, leftMonth;

  function toYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function fromYMD(value) {
    if (!value) return null;
    const [year, month, day] = String(value).split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function startOfToday() {
    const date = new Date();
    date.setHours(0,0,0,0);
    return date;
  }
  function sameDay(a, b) { return toYMD(a) === toYMD(b); }
  function rangeBounds(start, end) {
    if (!start || !end) return { start, end };
    return start <= end ? { start, end } : { start: end, end: start };
  }

  function setPresetActive(key) {
    popover.querySelectorAll(".shf-preset").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.fnPreset === key);
    });
  }

  function applyPreset(key) {
    const now = startOfToday();
    let s, e;
    if (key === "today") {
      s = new Date(now); e = new Date(now);
    } else if (key === "7d") {
      s = new Date(now); s.setDate(s.getDate() - 6); e = new Date(now);
    } else if (key === "30d") {
      s = new Date(now); s.setDate(s.getDate() - 29); e = new Date(now);
    } else if (key === "month") {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
      e = new Date(now);
    } else if (key === "prev-month") {
      const m = now.getMonth() - 1;
      const y = m < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const mm = (m + 12) % 12;
      s = new Date(y, mm, 1);
      e = new Date(y, mm + 1, 0);
    }
    pickerStart = s; pickerEnd = e; phase = 0;
    setPresetActive(key);
    updateRangeLabel();
    renderCals();
  }

  function presetKeyForRange() {
    if (!pickerStart || !pickerEnd) return "";
    const today = startOfToday();
    const s = pickerStart, e = pickerEnd;
    const diff = Math.round((e - s) / 864e5);
    if (sameDay(s, today) && sameDay(e, today)) return "today";
    if (diff === 6 && sameDay(e, today)) return "7d";
    if (diff === 29 && sameDay(e, today)) return "30d";
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    if (sameDay(s, thisMonthStart) && sameDay(e, today)) return "month";
    const m = today.getMonth() - 1;
    const y = m < 0 ? today.getFullYear() - 1 : today.getFullYear();
    const mm = (m + 12) % 12;
    const prevMonthStart = new Date(y, mm, 1);
    const prevMonthEnd = new Date(y, mm + 1, 0);
    if (sameDay(s, prevMonthStart) && sameDay(e, prevMonthEnd)) return "prev-month";
    return "";
  }

  function updateRangeLabel() {
    if (!pickerStart) { rangeLbl && (rangeLbl.textContent = ""); return; }
    const fmt = d => d.toLocaleDateString("pt-BR", { day:"2-digit", month:"short" });
    rangeLbl && (rangeLbl.textContent = pickerEnd && !sameDay(pickerStart, pickerEnd)
      ? `${fmt(pickerStart)} → ${fmt(pickerEnd)}`
      : fmt(pickerStart));
  }

  function renderCal(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = startOfToday();

    let html = `<div class="shf-cal">
      <div class="shf-cal-head">
        <button type="button" class="shf-cal-nav" data-fn-nav="-1">&#8249;</button>
        <span class="shf-cal-title">${MONTHS[month]} ${year}</span>
        <button type="button" class="shf-cal-nav" data-fn-nav="1">&#8250;</button>
      </div>
      <div class="shf-cal-grid">
        ${["D","S","T","Q","Q","S","S"].map(d=>`<span class="shf-cal-dow">${d}</span>`).join("")}`;

    for (let i = 0; i < firstDay; i++) html += `<span></span>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const ymd = toYMD(date);
      const isToday = sameDay(date, today);
      const isStart = pickerStart && sameDay(date, pickerStart);
      const isEnd   = pickerEnd   && sameDay(date, pickerEnd);
      const endRef  = phase === 1 && hoverDate ? hoverDate : pickerEnd;
      const inRange = pickerStart && endRef &&
        (pickerStart <= date) && (date <= endRef);
      const isFuture = date > today;

      let cls = "shf-cal-day";
      if (isFuture) cls += " is-future";
      if (isToday)  cls += " is-today";
      if (isStart)  cls += " is-start";
      if (isEnd && !sameDay(pickerStart, date)) cls += " is-end";
      if (inRange && !isStart && !isEnd) cls += " in-range";
      if (isStart && isEnd) cls += " is-single";

      html += `<button type="button" class="${cls}" data-fn-date="${ymd}"${isFuture?" disabled":""}>${d}</button>`;
    }
    html += `</div></div>`;
    return html;
  }

  function renderCals() {
    const rightYear  = leftMonth === 11 ? leftYear + 1 : leftYear;
    const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;
    calsEl.innerHTML = renderCal(leftYear, leftMonth) + renderCal(rightYear, rightMonth);
  }

  function formatTriggerLabel() {
    if (!pickerStart) return "Este mês";
    const today = startOfToday();
    const s = pickerStart, e = pickerEnd || pickerStart || today;
    const diff = Math.round((e - s) / 864e5);
    if (sameDay(s, today) && sameDay(e, today)) return "Hoje";
    if (diff === 6  && sameDay(e, today)) return "Últimos 7 dias";
    if (diff === 29 && sameDay(e, today)) return "Últimos 30 dias";
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    if (sameDay(s, thisMonthStart) && sameDay(e, today)) return "Este mês";
    const m = today.getMonth() - 1;
    const y = m < 0 ? today.getFullYear() - 1 : today.getFullYear();
    const mm = (m + 12) % 12;
    const prevMonthStart = new Date(y, mm, 1);
    const prevMonthEnd = new Date(y, mm + 1, 0);
    if (sameDay(s, prevMonthStart) && sameDay(e, prevMonthEnd)) return "Mês anterior";
    const opts = { day:"2-digit", month:"short" };
    const sStr = s.toLocaleDateString("pt-BR", opts);
    const eStr = e.toLocaleDateString("pt-BR", opts);
    return sameDay(s, e) ? sStr : `${sStr} – ${eStr}`;
  }

  function openPicker() {
    pickerStart = fromYMD(startIn.value);
    pickerEnd = fromYMD(endIn.value) || pickerStart;
    hoverDate = null;
    phase = 0;
    const anchor = pickerEnd || pickerStart || startOfToday();
    leftYear  = anchor.getFullYear();
    leftMonth = anchor.getMonth() - 1;
    if (leftMonth < 0) { leftMonth = 11; leftYear--; }
    setPresetActive(presetKeyForRange());
    updateRangeLabel();
    renderCals();
    positionPopoverAdaptive(trigger, popover);
    popover.classList.remove("hidden");
    trigger.classList.add("is-active");
  }

  function closePicker() {
    popover.classList.add("hidden");
    trigger.classList.remove("is-active");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.classList.contains("hidden") ? openPicker() : closePicker();
  });

  popover.addEventListener("click", (event) => {
    event.stopPropagation();
    const preset = event.target.closest("[data-fn-preset]");
    if (preset) {
      applyPreset(preset.dataset.fnPreset);
    }
  });

  calsEl.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-fn-nav]");
    if (nav) {
      const dir = Number(nav.dataset.fnNav);
      leftMonth += dir;
      if (leftMonth < 0)  { leftMonth = 11; leftYear--; }
      if (leftMonth > 11) { leftMonth = 0;  leftYear++; }
      renderCals();
      return;
    }

    const day = event.target.closest("[data-fn-date]");
    if (!day || day.disabled) return;
    const clicked = fromYMD(day.dataset.fnDate);
    if (!clicked) return;
    if (phase === 0) {
      pickerStart = clicked;
      pickerEnd = null;
      hoverDate = null;
      phase = 1;
      setPresetActive("");
    } else {
      if (clicked < pickerStart) {
        pickerEnd = pickerStart;
        pickerStart = clicked;
      } else {
        pickerEnd = clicked;
      }
      hoverDate = null;
      phase = 0;
    }
    updateRangeLabel();
    renderCals();
  });

  calsEl.addEventListener("mouseover", (event) => {
    const day = event.target.closest("[data-fn-date]");
    if (phase !== 1 || !day || day.disabled) return;
    const nextHoverDate = fromYMD(day.dataset.fnDate);
    if (!nextHoverDate || (hoverDate && sameDay(hoverDate, nextHoverDate))) return;
    hoverDate = nextHoverDate;
    renderCals();
  });

  calsEl.addEventListener("mouseleave", () => {
    if (phase !== 1 || !hoverDate) return;
    hoverDate = null;
    renderCals();
  });

  applyBtn?.addEventListener("click", () => {
    if (!pickerStart) return;
    const e = pickerEnd || pickerStart;
    startIn.value = toYMD(pickerStart);
    endIn.value   = toYMD(e);
    labelEl.textContent = formatTriggerLabel();
    closePicker();
    loadAll();
  });

  document.addEventListener("click", (e) => {
    if (!wrap?.contains(e.target)) closePicker();
  });

  // Init with month preset (Mês atual)
  applyPreset("month");
  const now = startOfToday();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startIn.value = toYMD(startMonth);
  endIn.value   = toYMD(now);
  labelEl.textContent = "Este mês";
}

saleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!saleCart.length) {
      renderSaleFeedback("warning", "Adicione ao menos um produto no carrinho.", saleFeedback);
      return;
    }

    const idempotencyKey = buildOperationIdempotencyKey("product-sale");
    const result = await callJson(`${API}/sales/products`, "POST", {
      idempotencyKey,
      unitId,
      professionalId: saleProfessionalId.value || undefined,
      clientId: saleClientId.value || undefined,
      soldAt: new Date().toISOString(),
      items: saleCart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    const totals = computeCartTotals(saleCart);
    renderSaleFeedback(
      "success",
      `Venda registrada. Receita: R$ ${Number(result.revenue.amount).toFixed(2)} (${totals.totalItems} itens).`,
      saleFeedback,
    );
    productSalesHistory = [
      {
        id: result.sale.id,
        label: `${totals.totalItems} item(ns)`,
        amount: `R$ ${Number(result.revenue.amount).toFixed(2)}`,
        clientLabel: saleClientId.options[saleClientId.selectedIndex]?.textContent || "Nao vinculado",
        professionalLabel: saleProfessionalId.options[saleProfessionalId.selectedIndex]?.textContent || "Sem profissional",
        items: saleCart.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          refundedQuantity: 0,
          refundableQuantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        status: "NOT_REFUNDED",
        statusLabel: "Sem devolucao",
        canRefund: true,
        soldAtLabel: new Date().toLocaleString("pt-BR"),
        itemsSummary: saleCart.length === 1 ? saleCart[0].name : `${saleCart.length} produtos vendidos`,
        totalRefundedAmount: 0,
        idempotencyKey,
        meta: `${new Date().toLocaleString("pt-BR")} · Cliente: ${saleClientId.options[saleClientId.selectedIndex]?.textContent || "Nao vinculado"}`,
      },
      ...productSalesHistory,
    ].slice(0, 6);
    renderRecentSales();
    clearSaleCart();
    await loadCatalog();
    await loadProductSalesHistory();
    await loadAll();
  } catch (error) {
    renderSaleFeedback("error", error.message || "Nao foi possivel registrar venda.", saleFeedback);
  }
});

function syncFinancialCreditTerms() {
  if (!financialTransactionPaymentMethod || !financialTransactionCreditTerms) return;
  const isCredit = financialTransactionPaymentMethod.value === "Credito";
  const termsField = financialTransactionCreditTerms.closest(".fn-field");
  termsField?.classList.toggle("is-visible", isCredit);
  termsField?.setAttribute("aria-hidden", String(!isCredit));
  financialTransactionCreditTerms.required = isCredit;
  financialTransactionCreditTerms.disabled = !isCredit;
  if (!isCredit) {
    financialTransactionCreditTerms.value = "";
    financialTransactionCreditTerms.setCustomValidity("");
  }
}

function getFinancialPaymentMethodValue() {
  const method = String(financialTransactionPaymentMethod?.value || "").trim();
  if (method !== "Credito") return method || undefined;
  const terms = String(financialTransactionCreditTerms?.value || "").trim();
  return terms ? `Credito ${terms}` : undefined;
}

function showFinancialTransactionModal(transaction = null) {
  if (!financialTransactionModal) return;
  const isEditing = Boolean(transaction?.id);
  if (financialTransactionModalTitle) {
    financialTransactionModalTitle.textContent = isEditing
      ? "Editar lancamento"
      : "Adicionar lancamento";
  }
  if (financialTransactionId) financialTransactionId.value = transaction?.id || "";
  if (financialTransactionType) financialTransactionType.value = transaction?.type || "INCOME";
  if (financialTransactionCategory) {
    financialTransactionCategory.value = transaction?.category || "";
  }
  if (financialTransactionDescription) {
    financialTransactionDescription.value = transaction?.description || "";
  }
  if (financialTransactionAmount) {
    financialTransactionAmount.value =
      transaction?.amount != null ? String(Number(transaction.amount).toFixed(2)) : "";
  }
  if (financialTransactionDate) {
    const rawDate = transaction?.date ? new Date(transaction.date) : new Date();
    financialTransactionDate.value = asDateInputValue(rawDate);
  }
  if (financialTransactionPaymentMethod) {
    const savedMethod = String(transaction?.paymentMethod || "").trim();
    const previousCustom = financialTransactionPaymentMethod.querySelector("[data-custom-payment-method]");
    if (previousCustom) previousCustom.remove();
    const creditMatch = savedMethod.match(/^Credito(?:\s+(.+))?$/i);
    const normalizedCreditTerm = creditMatch?.[1]?.trim() || "";
    const methodValue = creditMatch ? "Credito" : savedMethod;
    const hasSavedMethod = Array.from(financialTransactionPaymentMethod.options).some(
      (option) => option.value === methodValue,
    );
    if (methodValue && !hasSavedMethod) {
      const customOption = new Option(savedMethod, savedMethod);
      customOption.dataset.customPaymentMethod = "true";
      financialTransactionPaymentMethod.append(customOption);
    }
    financialTransactionPaymentMethod.value = methodValue;
    if (financialTransactionCreditTerms) {
      financialTransactionCreditTerms.value = normalizedCreditTerm;
    }
    syncFinancialCreditTerms();
  }
  if (financialTransactionProfessional) {
    financialTransactionProfessional.value = transaction?.professionalId || "";
  }
  if (financialTransactionCustomer) {
    financialTransactionCustomer.value = transaction?.customerId || "";
  }
  if (financialTransactionNotes) {
    financialTransactionNotes.value = transaction?.notes || "";
  }
  financialTransactionModal.classList.remove("hidden");
  financialTransactionModal.classList.add("flex");
}

function hideFinancialTransactionModal() {
  if (!financialTransactionModal) return;
  financialTransactionModal.classList.add("hidden");
  financialTransactionModal.classList.remove("flex");
}

financialAddTransactionBtn?.addEventListener("click", () => {
  showFinancialTransactionModal(null);
});

financialToolbarMount?.addEventListener("click", (event) => {
  if (event.target.closest("#financialAddTransactionBtn")) {
    showFinancialTransactionModal(null);
  }
});

financialTransactionModalClose?.addEventListener("click", hideFinancialTransactionModal);
financialTransactionModalCancel?.addEventListener("click", hideFinancialTransactionModal);
financialTransactionPaymentMethod?.addEventListener("change", syncFinancialCreditTerms);
financialTransactionCreditTerms?.addEventListener("change", () => {
  financialTransactionCreditTerms.setCustomValidity("");
});

clientsModalClose?.addEventListener("click", () => {
  hideClientsModal();
});

clientsModalCancel?.addEventListener("click", () => {
  hideClientsModal();
});

clientsPhone?.addEventListener("input", () => {
  clientsPhone.value = formatClientPhoneInput(clientsPhone.value);
});

financialTransactionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = Number(financialTransactionAmount?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    renderSaleFeedback("warning", "Informe um valor válido.", financialFeedback);
    financialTransactionAmount?.focus();
    return;
  }
  if (financialTransactionPaymentMethod?.value === "Credito" && !financialTransactionCreditTerms?.value) {
    financialTransactionCreditTerms.setCustomValidity("Selecione se o credito foi a vista ou em parcelas.");
    financialTransactionCreditTerms.reportValidity();
    renderSaleFeedback("warning", "Informe se o credito foi a vista ou parcelado.", financialFeedback);
    financialTransactionCreditTerms?.focus();
    return;
  }
  const payload = {
    unitId,
    type: financialTransactionType.value || "INCOME",
    category: String(financialTransactionCategory.value || "").trim(),
    description: String(financialTransactionDescription.value || "").trim(),
    amount,
    date: new Date(`${financialTransactionDate.value}T12:00:00`).toISOString(),
    paymentMethod: getFinancialPaymentMethodValue(),
    professionalId: String(financialTransactionProfessional.value || "").trim() || undefined,
    customerId: String(financialTransactionCustomer.value || "").trim() || undefined,
    notes: String(financialTransactionNotes.value || "").trim() || undefined,
    changedBy: "owner",
  };
  const editingId = String(financialTransactionId?.value || "").trim();
  try {
    if (editingId) {
      await callJson(`${API}/financial/transactions/${editingId}`, "PATCH", payload);
      renderSaleFeedback("success", "Lançamento registrado com sucesso.", financialFeedback);
    } else {
      await callJson(`${API}/financial/transactions`, "POST", {
        ...payload,
        idempotencyKey: buildOperationIdempotencyKey("financial-transaction"),
      });
      renderSaleFeedback("success", "Lançamento registrado com sucesso.", financialFeedback);
    }
    hideFinancialTransactionModal();
    await loadAll();
  } catch (error) {
    const message = String(error?.message || "");
    renderSaleFeedback(
      "error",
      message.includes("409") || message.toLowerCase().includes("idempot")
        ? "Esta operação já foi processada. Atualize a tela para conferir o resultado."
        : "Não foi possível registrar o lançamento. Confira os dados e tente novamente.",
      financialFeedback,
    );
  }
});

clientsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = String(clientsName?.value || "").trim();
  const rawPhone = String(clientsPhone?.value || "").trim();
  const phone = normalizePhoneDigits(rawPhone);

  if (!name) {
    renderSaleFeedback("warning", "Informe o nome do cliente.", clientsFormFeedback);
    clientsName?.focus();
    return;
  }
  if (!phone) {
    renderSaleFeedback("warning", "Informe um telefone valido com DDD.", clientsFormFeedback);
    clientsPhone?.focus();
    return;
  }
  if (!isValidClientPhone(phone)) {
    renderSaleFeedback("warning", "Informe um telefone valido com DDD.", clientsFormFeedback);
    clientsPhone?.focus();
    return;
  }

  const selectedStatus = clientsStatus?.value || "NEW";
  const explicitTags = String(clientsTags?.value || "")
    .split(",")
    .map((tag) => tag.trim().toUpperCase())
    .filter((tag) => ["NEW", "RECURRING", "VIP", "INACTIVE"].includes(tag))
    .slice(0, 6);
  const payload = {
    unitId,
    name,
    phone,
    email: String(clientsEmail?.value || "").trim() || undefined,
    birthDate: clientsBirthDate?.value || undefined,
    notes: String(clientsNotes?.value || "").trim() || undefined,
    status: selectedStatus,
    tags: explicitTags.length ? explicitTags : mapClientStatusToTags(selectedStatus),
  };

  if (clientsSubmitBtn) {
    clientsSubmitBtn.disabled = true;
    clientsSubmitBtn.textContent = "Salvando...";
  }

  try {
    await callJson(`${API}/clients`, "POST", payload);
    hideClientsModal();
    await loadCatalog();
    await loadAll();
    renderSaleFeedback("success", "Cliente cadastrado com sucesso.", clientsFeedback);
  } catch (error) {
    const duplicate =
      error?.status === 409 ||
      String(error?.message || "")
        .toLowerCase()
        .includes("telefone");
    renderSaleFeedback(
      "error",
      duplicate
        ? "Ja existe cliente com este telefone."
        : "Nao foi possivel salvar o cliente. Confira os dados e tente novamente.",
      clientsFormFeedback,
    );
  } finally {
    if (clientsSubmitBtn) {
      clientsSubmitBtn.disabled = false;
      clientsSubmitBtn.textContent = "Salvar cliente";
    }
  }
});

inventoryAddBtn?.addEventListener("click", () => {
  showInventoryProductModal(null);
});

inventoryEmptyAddBtn?.addEventListener("click", () => {
  showInventoryProductModal(null);
});

inventoryEmptyState?.addEventListener("click", (event) => {
  if (event.target.closest("#inventoryEmptyAddBtn")) {
    showInventoryProductModal(null);
  }
});

inventoryProductModalClose?.addEventListener("click", () => {
  hideInventoryProductModal();
  reopenLastDrawer();
});

inventoryProductModalCancel?.addEventListener("click", () => {
  hideInventoryProductModal();
  reopenLastDrawer();
});

inventoryStockModalClose?.addEventListener("click", () => {
  hideInventoryStockModal();
  reopenLastDrawer();
});

inventoryStockModalCancel?.addEventListener("click", () => {
  hideInventoryStockModal();
  reopenLastDrawer();
});

document.addEventListener("click", (event) => {
  const addBtn = event.target.closest("#professionalsAddBtn");
  if (addBtn) showProfessionalsModal();
});

professionalsModalClose?.addEventListener("click", hideProfessionalsModal);
professionalsModalCancel?.addEventListener("click", hideProfessionalsModal);

professionalsModal?.addEventListener("click", (event) => {
  if (event.target === professionalsModal) hideProfessionalsModal();
});

professionalsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = String(professionalsFormName?.value || "").trim();
  if (!name) {
    renderSaleFeedback("error", "Nome do profissional e obrigatorio.", professionalsFormFeedback);
    return;
  }
  const editId = String(professionalsFormId?.value || "").trim();
  const phone = String(professionalsFormPhone?.value || "").trim() || undefined;
  const email = String(professionalsFormEmail?.value || "").trim() || undefined;
  try {
    if (editId) {
      await callJson(`${API}/professionals/${editId}`, "PATCH", { unitId, name, phone, email });
    } else {
      await callJson(`${API}/professionals`, "POST", { unitId, name, phone, email });
    }
    hideProfessionalsModal();
    await loadCatalog();
    await loadAll();
  } catch (error) {
    renderSaleFeedback(
      "error",
      error.message || "Nao foi possivel salvar o profissional.",
      professionalsFormFeedback,
    );
  }
});

servicesAddBtn?.addEventListener("click", () => {
  showServicesModal(null);
});

servicesEmptyAddBtn?.addEventListener("click", () => {
  showServicesModal(null);
});

servicesModalClose?.addEventListener("click", () => {
  hideServicesModal();
});

servicesModalCancel?.addEventListener("click", () => {
  hideServicesModal();
});

servicesDetailClose?.addEventListener("click", () => {
  currentServiceDetail = null;
  renderServiceDetailPanel();
});

inventorySearch?.addEventListener("input", () => {
  if (inventorySearchDebounce) clearTimeout(inventorySearchDebounce);
  inventorySearchDebounce = setTimeout(async () => {
    inventoryFilters.search = String(inventorySearch.value || "").trim();
    await loadAll();
  }, 250);
});

inventoryCategoryFilter?.addEventListener("change", async () => {
  inventoryFilters.category = inventoryCategoryFilter.value || "";
  await loadAll();
});

inventoryStatusFilter?.addEventListener("change", async () => {
  inventoryFilters.status = inventoryStatusFilter.value || "ALL";
  await loadAll();
});

inventoryProductForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    unitId,
    name: String(inventoryProductName.value || "").trim(),
    salePrice: Number(inventoryProductSalePrice.value || 0),
    quantity: Number(inventoryProductQuantity.value || 0),
    costPrice:
      inventoryProductCostPrice.value === "" ? undefined : Number(inventoryProductCostPrice.value),
    minimumStock:
      inventoryProductMinimumStock.value === ""
        ? undefined
        : Number(inventoryProductMinimumStock.value),
    category: String(inventoryProductCategory.value || "").trim() || undefined,
    notes: composeProductNotes(inventoryProductNotes.value, inventoryProductImageUrl?.value) || undefined,
  };

  try {
    const editingId = String(inventoryProductId.value || "").trim();
    if (editingId) {
      await callJson(`${API}/inventory/${editingId}`, "PATCH", payload);
      hideInventoryProductModal();
      lastDrawerProductId = null;
      await refreshInventoryAndCatalog("Produto atualizado com sucesso.");
      return;
    }
    await callJson(`${API}/inventory`, "POST", payload);
    hideInventoryProductModal();
    lastDrawerProductId = null;
    await refreshInventoryAndCatalog("Produto cadastrado com sucesso.");
  } catch (error) {
    renderSaleFeedback(
      "error",
      error.message || "Nao foi possivel salvar o produto.",
      inventoryFeedback,
    );
  }
});

inventoryStockForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const productId = String(inventoryStockProductId.value || "").trim();
  if (!productId) return;
  const quantity = Number(inventoryStockQuantity.value || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    renderSaleFeedback("error", "Quantidade invalida para ajuste.", inventoryFeedback);
    return;
  }
  try {
    await callJson(`${API}/inventory/${productId}/stock`, "PATCH", {
      unitId,
      type: inventoryStockType.value || "IN",
      quantity,
      reason: String(inventoryStockReason.value || "").trim() || undefined,
    });
    hideInventoryStockModal();
    lastDrawerProductId = null;
    await refreshInventoryAndCatalog("Estoque ajustado com sucesso.");
  } catch (error) {
    renderSaleFeedback(
      "error",
      error.message || "Nao foi possivel ajustar o estoque. Confira os dados e tente novamente.",
      inventoryFeedback,
    );
  }
});

servicesForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = servicePayloadFromForm();
    const editingId = String(servicesId.value || "").trim();
    if (editingId) {
      await callJson(`${API}/services/${editingId}`, "PATCH", payload);
      renderSaleFeedback("success", "Servico atualizado com sucesso.", servicesFeedback);
    } else {
      await callJson(`${API}/services`, "POST", payload);
      renderSaleFeedback("success", "Servico cadastrado com sucesso.", servicesFeedback);
    }
    hideServicesModal();
    await loadCatalog();
    await loadAll();
  } catch (error) {
    renderSaleFeedback(
      "error",
      error.message || "Nao foi possivel salvar o servico.",
      servicesFeedback,
    );
  }
});

let lastDrawerProductId = null;

function closeInventoryDrawer(productId = null) {
  const drawer = document.getElementById("inventoryProductDrawer");
  if (!drawer) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  if (productId) lastDrawerProductId = productId;
}

function reopenLastDrawer() {
  if (!lastDrawerProductId) return;
  renderStockProductDrawer(stockElements, currentStockPayload || {}, lastDrawerProductId);
}

function bindInventoryActionHandlers(container) {
  if (!container) return;
  container.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-inventory-action]");
    if (!target) return;
    const action = target.dataset.inventoryAction;
    const productId = target.dataset.productId;
    const productName = target.dataset.productName;
    if (!action || !productId) return;

    if (action === "detail") {
      renderStockProductDrawer(stockElements, currentStockPayload || {}, productId);
      return;
    }

    if (action === "edit") {
      const product = inventoryProductsById[productId];
      if (!product) {
        renderSaleFeedback("warning", "Produto nao encontrado para edicao.", inventoryFeedback);
        return;
      }
      closeInventoryDrawer(productId);
      showInventoryProductModal(product);
      return;
    }

    if (action === "add") {
      closeInventoryDrawer(productId);
      showInventoryStockModal({ productId, productName, type: "IN" });
      return;
    }

    if (action === "remove") {
      closeInventoryDrawer(productId);
      showInventoryStockModal({ productId, productName, type: "OUT" });
      return;
    }

    if (action === "delete") {
      closeInventoryDrawer(productId);
      const confirmed = window.confirm(
        `Deseja excluir o produto ${productName || "selecionado"} do estoque?`,
      );
      if (!confirmed) return;
      try {
        await callJson(`${API}/inventory/${productId}`, "DELETE", { unitId });
        await refreshInventoryAndCatalog("Produto excluido com sucesso.");
      } catch (error) {
        renderSaleFeedback(
          "error",
          error.message || "Nao foi possivel excluir o produto.",
          inventoryFeedback,
        );
      }
    }
  });
}

bindInventoryActionHandlers(inventoryTableBody);
bindInventoryActionHandlers(inventoryMobileList);
bindInventoryActionHandlers(inventoryDrawerHost);

function bindServicesActionHandlers(container) {
  if (!container) return;
  container.addEventListener("click", async (event) => {
    if (event.target.closest("[data-svc-prof-toggle], [data-svc-prof-list]")) return;
    const target = event.target.closest("[data-service-action]");
    if (!target) return;
    const action = target.dataset.serviceAction;
    const serviceIdValue = target.dataset.serviceId;
    if (!action || !serviceIdValue) return;
    try {
      await handleServiceAction(serviceIdValue, action, {
        nextActive:
          target.dataset.nextActive != null ? target.dataset.nextActive === "true" : undefined,
      });
    } catch (error) {
      renderSaleFeedback(
        "error",
        error.message || "Nao foi possivel executar a acao do servico.",
        servicesFeedback,
      );
    }
  });
}

bindServicesActionHandlers(servicesTableBody);
bindServicesActionHandlers(servicesMobileList);
bindServicesActionHandlers(servicesTableWrap);
bindServicesActionHandlers(servicesDrawerHost);

loyaltyAdjustForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const delta = Number(loyaltyDelta.value || 0);
    await callJson(`${API}/loyalty/adjust`, "POST", {
      unitId,
      clientId: loyaltyClientId.value,
      pointsDelta: delta,
      sourceType: loyaltySourceType.value || "ADJUSTMENT",
    });
    renderSaleFeedback("success", "Saldo de fidelidade atualizado.", loyaltyFeedback);
    loyaltyDelta.value = "";
    await loadAll();
  } catch (error) {
    renderSaleFeedback("error", error.message || "Falha no ajuste de fidelidade.", loyaltyFeedback);
  }
});

premiumActionsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const selectedClientId = premiumClientId.value;
    const selectedPackageId = packageId.value;
    const selectedPlanId = subscriptionPlanId.value;
    if (!selectedClientId) {
      renderSaleFeedback("warning", "Selecione um cliente para executar acoes premium.", premiumFeedback);
      return;
    }
    if (selectedPackageId) {
      await callJson(`${API}/packages/purchase`, "POST", {
        unitId,
        clientId: selectedClientId,
        packageId: selectedPackageId,
        purchasedAt: new Date().toISOString(),
      });
    }
    if (selectedPlanId) {
      await callJson(`${API}/subscriptions/activate`, "POST", {
        unitId,
        clientId: selectedClientId,
        planId: selectedPlanId,
        startedAt: new Date().toISOString(),
      });
    }

    renderSaleFeedback(
      "success",
      "Acoes premium executadas (pacote/assinatura).",
      premiumFeedback,
    );
    await loadAll();
  } catch (error) {
    renderSaleFeedback("error", error.message || "Falha ao executar acoes premium.", premiumFeedback);
  }
});

automacoesExecutions.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-reprocess-execution]");
  if (!target) return;
  const executionId = target.dataset.reprocessExecution;
  if (!executionId) return;

  try {
    target.disabled = true;
    await callJson(`${API}/automations/executions/${executionId}/reprocess`, "POST", {
      unitId,
    });
    renderSaleFeedback(
      "success",
      "Execucao enviada para reprocessamento.",
      automacoesFeedback,
    );
    await loadAll();
  } catch (error) {
    renderSaleFeedback(
      "error",
      error.message || "Falha ao reprocessar execucao.",
      automacoesFeedback,
    );
  } finally {
    target.disabled = false;
  }
});

if (automacoesRulesList) {
  automacoesRulesList.addEventListener("click", async (event) => {
    const editTarget = event.target.closest("[data-edit-rule]");
    if (editTarget) {
      const ruleId = editTarget.dataset.editRule;
      const rule = currentAutomationRules.find((item) => item.id === ruleId);
      if (rule) {
        fillAutomationRuleForm(rule);
        renderSaleFeedback("success", "Regra pronta para edicao.", automacoesFeedback);
      }
      return;
    }

    const toggleTarget = event.target.closest("[data-toggle-rule]");
    if (!toggleTarget) return;
    const ruleId = toggleTarget.dataset.toggleRule;
    const nextActive = toggleTarget.dataset.nextActive === "true";
    if (!ruleId) return;
    try {
      toggleTarget.disabled = true;
      const endpoint = nextActive
        ? `${API}/automations/rules/${ruleId}/activate`
        : `${API}/automations/rules/${ruleId}/deactivate`;
      await callJson(endpoint, "POST", { unitId });
      renderSaleFeedback(
        "success",
        nextActive ? "Regra ativada com sucesso." : "Regra desativada com sucesso.",
        automacoesFeedback,
      );
      await loadAll();
    } catch (error) {
      renderSaleFeedback(
        "error",
        error.message || "Falha ao atualizar status da regra.",
        automacoesFeedback,
      );
    } finally {
      toggleTarget.disabled = false;
    }
  });
}

if (automationRuleForm) {
  automationRuleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const editingRuleId = automationRuleId.value || "";
    const payload = {
      unitId,
      name: String(automationRuleName.value || "").trim(),
      triggerType: String(automationRuleTriggerType.value || "INACTIVITY"),
      channel: String(automationRuleChannel.value || "WHATSAPP"),
      target: String(automationRuleTarget.value || "SEGMENT"),
      messageTemplate: String(automationRuleMessageTemplate.value || "").trim(),
      createdBy: "owner",
    };
    try {
      if (editingRuleId) {
        await callJson(`${API}/automations/rules/${editingRuleId}`, "PATCH", payload);
        renderSaleFeedback("success", "Regra atualizada com sucesso.", automacoesFeedback);
      } else {
        await callJson(`${API}/automations/rules`, "POST", payload);
        renderSaleFeedback("success", "Regra criada com sucesso.", automacoesFeedback);
      }
      resetAutomationRuleForm();
      await loadAll();
    } catch (error) {
      renderSaleFeedback(
        "error",
        error.message || "Falha ao salvar regra de automacao.",
        automacoesFeedback,
      );
    }
  });
}

if (automationRuleCancelBtn) {
  automationRuleCancelBtn.addEventListener("click", () => {
    resetAutomationRuleForm();
    renderSaleFeedback("warning", "Edicao de regra cancelada.", automacoesFeedback);
  });
}

if (metasDefineGoalBtn) {
  metasDefineGoalBtn.addEventListener("click", () => {
    const hasGoal = Boolean(currentMetasPayload?.summary?.goal);
    openMetasGoalModal(hasGoal ? "edit" : "create");
  });
}

if (metasSection) {
  metasSection.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-metas-action]");
    if (!actionTarget) return;
    const action = actionTarget.getAttribute("data-metas-action");
    if (action === "open-goal-modal") {
      const hasGoal = Boolean(currentMetasPayload?.summary?.goal);
      openMetasGoalModal(hasGoal ? "edit" : "create");
    }
  });
}

if (metasGoalModalClose) {
  metasGoalModalClose.addEventListener("click", () => {
    closeMetasGoalModal();
  });
}

if (metasGoalModalCancel) {
  metasGoalModalCancel.addEventListener("click", () => {
    closeMetasGoalModal();
  });
}

if (metasGoalForm) {
  metasGoalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsedMonth = parseMetasGoalMonth(metasGoalMonth?.value || "");
    if (!parsedMonth) {
      renderSaleFeedback("warning", "Selecione um mes/ano valido para a meta.", metasGoalFormFeedback);
      return;
    }
    const revenueTarget = Number(metasRevenueTarget?.value || 0);
    if (!Number.isFinite(revenueTarget) || revenueTarget <= 0) {
      renderSaleFeedback(
        "warning",
        "A meta de faturamento deve ser maior que zero.",
        metasGoalFormFeedback,
      );
      return;
    }
    const appointmentsTarget = Number(metasAppointmentsTarget?.value || 0);
    if (!Number.isInteger(appointmentsTarget) || appointmentsTarget <= 0) {
      renderSaleFeedback(
        "warning",
        "A meta de atendimentos deve ser um numero inteiro maior que zero.",
        metasGoalFormFeedback,
      );
      return;
    }

    const averageTicketRaw = Number(metasAverageTicketTarget?.value || 0);
    const averageTicketTarget =
      Number.isFinite(averageTicketRaw) && averageTicketRaw > 0 ? averageTicketRaw : undefined;
    const notes = String(metasNotes?.value || "").trim();
    const goalId = String(metasGoalId?.value || "").trim();

    const payload = {
      unitId,
      month: parsedMonth.month,
      year: parsedMonth.year,
      revenueTarget,
      appointmentsTarget,
      averageTicketTarget,
      notes: notes || undefined,
    };

    try {
      if (metasGoalSubmitBtn) metasGoalSubmitBtn.disabled = true;
      if (goalId) {
        await callJson(`${API}/goals/${goalId}`, "PATCH", payload);
      } else {
        await callJson(`${API}/goals`, "POST", payload);
      }
      closeMetasGoalModal();
      await loadAll();
      renderSaleFeedback(
        "success",
        goalId ? "Meta atualizada com sucesso." : "Meta definida com sucesso.",
        metasFeedback,
      );
    } catch (error) {
      renderSaleFeedback(
        "error",
        error.message || "Nao foi possivel salvar a meta.",
        metasGoalFormFeedback,
      );
    } finally {
      if (metasGoalSubmitBtn) metasGoalSubmitBtn.disabled = false;
    }
  });
}

function debounce(fn, delay = 220) {
  let timeoutId;
  return (...args) => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

const debouncedLoadAll = debounce(() => {
  loadAll();
}, 260);

const debouncedRefreshAuditEvents = debounce(() => {
  refreshAuditEvents();
}, 180);

filterProfessional.addEventListener("change", renderAgendaView);
filterStatus.addEventListener("change", renderAgendaView);
filterService.addEventListener("change", renderAgendaView);
filterSearch.addEventListener("input", renderAgendaView);
filterPeriod.addEventListener("change", loadAll);
if (appointmentsFilterDate) appointmentsFilterDate.addEventListener("change", loadAll);
if (appointmentsFilterPeriod) appointmentsFilterPeriod.addEventListener("change", loadAll);
if (appointmentsFilterStatus) appointmentsFilterStatus.addEventListener("change", loadAll);
if (appointmentsFilterProfessional) appointmentsFilterProfessional.addEventListener("change", loadAll);
if (appointmentsFilterService) appointmentsFilterService.addEventListener("change", loadAll);
if (appointmentsFilterClient) appointmentsFilterClient.addEventListener("change", loadAll);
if (appointmentsFilterSearch) appointmentsFilterSearch.addEventListener("input", debouncedLoadAll);
if (alFilterStatus) alFilterStatus.addEventListener("change", renderAgendaListMode);
if (alFilterProfessional) alFilterProfessional.addEventListener("change", renderAgendaListMode);
if (alFilterSearch) alFilterSearch.addEventListener("input", renderAgendaListMode);
if (financialPeriod) financialPeriod.addEventListener("change", loadAll);
if (financialSearch) financialSearch.addEventListener("input", debouncedLoadAll);
if (financialTypeFilter) financialTypeFilter.addEventListener("change", loadAll);
if (financialCustomStart) financialCustomStart.addEventListener("change", loadAll);
if (financialCustomEnd) financialCustomEnd.addEventListener("change", loadAll);
if (reportsPeriod && reportsCustomStart && reportsCustomEnd) {
  reportsPeriod.addEventListener("change", () => {
    const isCustom = reportsPeriod.value === "custom";
    reportsCustomStart.classList.toggle("hidden", !isCustom);
    reportsCustomEnd.classList.toggle("hidden", !isCustom);
    loadAll();
  });
  reportsCustomStart.addEventListener("change", loadAll);
  reportsCustomEnd.addEventListener("change", loadAll);
}
if (servicesSearch) {
  servicesSearch.addEventListener("input", () => {
    servicesFilters.search = String(servicesSearch.value || "").trim();
    debouncedLoadAll();
  });
}
if (servicesCategoryFilter) {
  servicesCategoryFilter.addEventListener("change", () => {
    servicesFilters.category = servicesCategoryFilter.value || "";
    loadAll();
  });
}
if (servicesStatusFilter) {
  servicesStatusFilter.addEventListener("change", () => {
    servicesFilters.status = servicesStatusFilter.value || "ALL";
    loadAll();
  });
}
if (servicesMinPrice) {
  servicesMinPrice.addEventListener("input", () => {
    servicesFilters.minPrice = String(servicesMinPrice.value || "").trim();
    debouncedLoadAll();
  });
}
if (servicesMaxPrice) {
  servicesMaxPrice.addEventListener("input", () => {
    servicesFilters.maxPrice = String(servicesMaxPrice.value || "").trim();
    debouncedLoadAll();
  });
}

async function downloadBackendReportCsv(reportId) {
  const typeMap = {
    financeiro: "financial",
    atendimentos: "appointments",
    vendas: "product-sales",
    estoque: "stock",
    clientes: "clients",
    profissionais: "professionals",
    comissoes: "commissions",
    auditoria: "audit",
  };
  const type = typeMap[reportId];
  const params = currentReportsPayload?.exportParams;
  if (!type || !params) return false;
  const url = `${API}/reports/management/export.csv?${new URLSearchParams({
    ...params,
    type,
  }).toString()}`;
  const response = await apiFetch(url);
  if (!response.ok) return false;
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  anchor.href = objectUrl;
  anchor.download = filenameMatch?.[1] || `relatorio-${type}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}

if (reportsRoot) {
  reportsRoot.addEventListener("click", async (event) => {
    const openTarget = event.target.closest("[data-report-open]");
    if (openTarget) {
      activeReportId = openTarget.getAttribute("data-report-open") || "financeiro";
      renderReportsData(reportsElements, currentReportsPayload, { activeReportId });
      return;
    }

    const exportTarget = event.target.closest("[data-report-export]");
    if (exportTarget && currentReportsPayload) {
      const downloaded = await downloadBackendReportCsv(activeReportId);
      if (!downloaded) exportReportCsv(currentReportsPayload, activeReportId);
    }
  });
}
if (clientsTable) {
  clientsTable.addEventListener("click", (event) => {
    const detailTrigger = event.target.closest('[data-clients-action="detail"]');
    if (detailTrigger) {
      const currentClient = findCurrentClient(detailTrigger.getAttribute("data-client-id"));
      if (currentClient) {
        renderClientDrawer(clientsElements, currentClient, buildClientDrawerContext(currentClient));
      }
      return;
    }

    const trigger = event.target.closest('[data-clients-action="add-first"], [data-clients-action="add-new"]');
    if (trigger) {
      showClientsModal();
      return;
    }

    const invalidWhatsappTrigger = event.target.closest(
      '[data-clients-action="open-whatsapp-invalid"]',
    );
    if (!invalidWhatsappTrigger) return;
    renderSaleFeedback(
      "warning",
      "Telefone invalido para abrir WhatsApp. Revise o cadastro do cliente.",
      clientsFeedback,
    );
  });
}
clientsToolbarMount?.addEventListener("click", (event) => {
  const trigger = event.target.closest('[data-clients-action="add-new"]');
  if (trigger) showClientsModal();
});
if (clientsDrawerHost) {
  clientsDrawerHost.addEventListener("click", (event) => {
    const scheduleTarget = event.target.closest('[data-clients-action="schedule"]');
    const invalidWhatsappTrigger = event.target.closest('[data-clients-action="open-whatsapp-invalid"]');
    const financialTarget = event.target.closest('[data-clients-action="open-financial"]');
    if (scheduleTarget) {
      openClientScheduling(scheduleTarget.getAttribute("data-client-id"));
      return;
    }
    if (invalidWhatsappTrigger) {
      renderSaleFeedback(
        "warning",
        "Informe um telefone valido com DDD para abrir WhatsApp.",
        clientsFeedback,
      );
      return;
    }
    if (financialTarget) {
      navigate("financeiro");
    }
  });
}
if (professionalsTable) {
  professionalsTable.addEventListener("click", (event) => {
    const target = event.target.closest("[data-professional-action]");
    if (!target) return;
    handleProfessionalAction(target.getAttribute("data-professional-id"), target.getAttribute("data-professional-action"));
  });
}
if (professionalsDrawerHost) {
  professionalsDrawerHost.addEventListener("click", (event) => {
    const target = event.target.closest("[data-professional-action]");
    if (!target) return;
    handleProfessionalAction(target.getAttribute("data-professional-id"), target.getAttribute("data-professional-action"));
  });
}
clientsSearch.addEventListener("input", debouncedLoadAll);
clientsStatusFilter.addEventListener("change", loadAll);
clientsSegmentFilter.addEventListener("change", loadAll);
clientsPeriod.addEventListener("change", loadAll);
clientsLimit?.addEventListener("change", loadAll);
professionalsFilter.addEventListener("change", loadAll);
professionalsPeriod.addEventListener("change", loadAll);
commissionsProfessionalFilter.addEventListener("change", loadAll);
commissionsAppliesToFilter.addEventListener("change", loadAll);
commissionsPeriod.addEventListener("change", loadAll);
commissionsStatusFilter?.addEventListener("change", loadAll);
fidelizacaoPeriod.addEventListener("change", loadAll);
retentionRiskFilter.addEventListener("change", loadAll);
automacoesPeriod.addEventListener("change", loadAll);
automacoesStatusFilter.addEventListener("change", loadAll);
automacoesRiskFilter.addEventListener("change", loadAll);
automacoesProviderFilter.addEventListener("change", loadAll);
if (automacoesRulesFilter) {
  automacoesRulesFilter.addEventListener("change", loadAll);
}
if (auditEntityFilter) auditEntityFilter.addEventListener("change", refreshAuditEvents);
if (auditActionFilter) auditActionFilter.addEventListener("input", debouncedRefreshAuditEvents);
if (auditActorFilter) auditActorFilter.addEventListener("change", refreshAuditEvents);
if (auditStartFilter) auditStartFilter.addEventListener("change", refreshAuditEvents);
if (auditEndFilter) auditEndFilter.addEventListener("change", refreshAuditEvents);
if (auditLimitFilter) auditLimitFilter.addEventListener("change", refreshAuditEvents);
if (auditRequestIdFilter) auditRequestIdFilter.addEventListener("input", debouncedRefreshAuditEvents);
if (auditIdempotencyFilter) auditIdempotencyFilter.addEventListener("input", debouncedRefreshAuditEvents);
if (auditEntityIdFilter) auditEntityIdFilter.addEventListener("input", debouncedRefreshAuditEvents);
if (auditRouteFilter) auditRouteFilter.addEventListener("input", debouncedRefreshAuditEvents);
if (auditMethodFilter) auditMethodFilter.addEventListener("change", refreshAuditEvents);
if (auditEventsList) {
  auditEventsList.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-audit-action]");
    if (!actionTarget) return;
    const action = actionTarget.getAttribute("data-audit-action");
    if (action !== "detail") return;
    const id = actionTarget.getAttribute("data-audit-event-id");
    const auditEvent = currentAuditPayload?.events?.find((item) => item.id === id);
    if (!auditEvent) return;
    renderAuditEventDrawer(auditElements, auditEvent);
  });
}
if (financialPeriod && financialCustomStart && financialCustomEnd) {
  financialPeriod.addEventListener("change", () => {
    const isCustom = financialPeriod.value === "custom";
    financialCustomStart.classList.toggle("hidden", !isCustom);
    financialCustomEnd.classList.toggle("hidden", !isCustom);
  });
}

if (financialEntriesList) {
  financialEntriesList.addEventListener("click", async (event) => {
    const emptyAddTarget = event.target.closest("#financialEmptyAddBtn");
    if (emptyAddTarget) {
      showFinancialTransactionModal(null);
      return;
    }

    const actionTarget = event.target.closest("[data-financial-action]");
    if (!actionTarget) return;
    const action = actionTarget.getAttribute("data-financial-action");
    if (action === "detail") {
      const id = actionTarget.getAttribute("data-financial-transaction-id");
      if (!id) return;
      const row = currentFinancialTransactions.find((item) => item.id === id);
      if (!row) return;
      renderFinancialEntryDrawer(financialElements, row);
      return;
    }
    if (action === "edit") {
      const id = actionTarget.getAttribute("data-financial-transaction-id");
      if (!id) return;
      const row = currentFinancialTransactions.find((item) => item.id === id);
      if (!row) return;
      showFinancialTransactionModal(row);
      return;
    }
    if (action === "delete") {
      const id = actionTarget.getAttribute("data-financial-transaction-id");
      if (!id) return;
      const confirmed = window.confirm("Deseja excluir este lancamento manual?");
      if (!confirmed) return;
      try {
        await callJson(`${API}/financial/transactions/${id}`, "DELETE", {
          unitId,
          changedBy: "owner",
        });
        renderSaleFeedback("success", "Lancamento excluido.", financialFeedback);
        await loadAll();
      } catch (error) {
        renderSaleFeedback(
          "error",
          error.message || "Nao foi possivel excluir o lancamento.",
          financialFeedback,
        );
      }
    }
  });
}

if (financialDrawerHost) {
  financialDrawerHost.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-financial-action]");
    if (!actionTarget) return;
    const action = actionTarget.getAttribute("data-financial-action");
    const id = actionTarget.getAttribute("data-financial-transaction-id");
    if (!id) return;

    if (action === "edit") {
      const row = currentFinancialTransactions.find((item) => item.id === id);
      if (row) showFinancialTransactionModal(row);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm("Deseja excluir este lancamento manual?");
      if (!confirmed) return;
      try {
        await callJson(`${API}/financial/transactions/${id}`, "DELETE", {
          unitId,
          changedBy: "owner",
        });
        financialDrawerHost.classList.add("hidden");
        renderSaleFeedback("success", "Lancamento excluido.", financialFeedback);
        await loadAll();
      } catch (error) {
        renderSaleFeedback(
          "error",
          error.message || "Nao foi possivel excluir o lancamento.",
          financialFeedback,
        );
      }
    }
  });
}

if (financialCommissionsList) {
  financialCommissionsList.addEventListener("click", async (event) => {
    const payTarget = event.target.closest('[data-financial-action="pay-commission"]');
    if (!payTarget) return;
    const commissionId = payTarget.getAttribute("data-financial-commission-id");
    if (!commissionId) return;
    try {
      await callJson(`${API}/financial/commissions/${commissionId}/pay`, "PATCH", {
        idempotencyKey: buildOperationIdempotencyKey("commission-pay"),
        unitId,
        changedBy: "owner",
        paidAt: new Date().toISOString(),
      });
      renderSaleFeedback("success", "Comissao marcada como paga.", financialFeedback);
      await loadAll();
    } catch (error) {
      renderSaleFeedback(
        "error",
        error.message || "Nao foi possivel marcar comissao como paga.",
        financialFeedback,
      );
    }
  });
}

function findCurrentCommission(commissionId) {
  return Array.isArray(currentCommissionsPayload?.entries)
    ? currentCommissionsPayload.entries.find((entry) => (entry.id || entry.commissionId) === commissionId)
    : null;
}

function findCurrentClient(clientIdValue) {
  return Array.isArray(currentClientsPayload?.clients)
    ? currentClientsPayload.clients.find((client) => (client.clientId || client.id) === clientIdValue)
    : null;
}

function findCurrentProfessional(professionalIdValue) {
  return Array.isArray(currentProfessionalsPayload?.professionals)
    ? currentProfessionalsPayload.professionals.find((item) => item.professionalId === professionalIdValue)
    : null;
}

function handleProfessionalAction(professionalIdValue, action) {
  if (!professionalIdValue || !action) return;
  if (action === "detail") {
    const professional = findCurrentProfessional(professionalIdValue);
    if (!professional) return;
    renderProfessionalDrawer(professionalsElements, professional, {
      services: currentServices.length ? currentServices : allServices,
      appointments: currentAppointments.length ? currentAppointments : currentAgenda,
      commissions: Array.isArray(currentCommissionsPayload?.entries) ? currentCommissionsPayload.entries : [],
    });
    return;
  }
  if (action === "edit") {
    const professional = findCurrentProfessional(professionalIdValue);
    if (!professional) return;
    professionalsElements.drawerHost?.classList.add("hidden");
    showProfessionalsModal(professional);
    return;
  }
  if (action === "open-agenda") {
    navigate("agenda");
    if (professionalId) professionalId.value = professionalIdValue;
    if (filterProfessional) filterProfessional.value = professionalIdValue;
    renderAgendaView();
    return;
  }
  if (action === "open-commissions") {
    navigate("comissoes");
    if (commissionsProfessionalFilter) commissionsProfessionalFilter.value = professionalIdValue;
    loadAll();
  }
}

function buildClientDrawerContext(client) {
  const clientIdValue = client?.clientId || client?.id || "";
  const clientName = String(client?.fullName || "").toLowerCase();
  return {
    unitId,
    appointments: currentAgenda
      .filter((item) => item.clientId === clientIdValue)
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    productSales: productSalesHistory.filter((sale) => {
      if (sale.clientId && sale.clientId === clientIdValue) return true;
      return clientName && String(sale.clientLabel || "").toLowerCase() === clientName;
    }),
  };
}

function openClientScheduling(clientIdValue) {
  navigate("agenda");
  if (clientId && clientIdValue) {
    clientId.value = clientIdValue;
    refreshScheduleAssist();
  }
  openScheduleDrawer();
  startsAt?.focus();
}

async function payCurrentCommission(commissionId, button) {
  const commission = findCurrentCommission(commissionId);
  if (!commissionId || !commission) return;

  if (commission.status === "PAID") {
    renderSaleFeedback("info", "Esta comissao ja foi paga.", commissionsFeedback || financialFeedback);
    return;
  }
  const confirmed = window.confirm("Confirmar pagamento desta comissao?");
  if (!confirmed) return;
  try {
    if (button) button.disabled = true;
    const result = await callJson(`${API}/financial/commissions/${commissionId}/pay`, "PATCH", {
      idempotencyKey: buildOperationIdempotencyKey("commission-pay"),
      unitId,
      changedBy: "owner",
      paidAt: new Date().toISOString(),
    });
    renderSaleFeedback(
      "success",
      result.status === "PAID"
        ? "Comissao paga com sucesso."
        : "Esta operacao ja foi processada. Atualize a tela para conferir o resultado.",
      commissionsFeedback || financialFeedback,
    );
    commissionsDrawerHost?.classList.add("hidden");
    await loadAll();
  } catch (error) {
    const message = String(error.message || "");
    const humanMessage = message.toLowerCase().includes("idempot")
      ? "Esta operacao ja foi processada. Atualize a tela para conferir o resultado."
      : "Nao foi possivel pagar a comissao. Confira os dados e tente novamente.";
    renderSaleFeedback(
      "error",
      humanMessage,
      commissionsFeedback || financialFeedback,
    );
  } finally {
    if (button) button.disabled = false;
  }
}

if (commissionsTable) {
  commissionsTable.addEventListener("click", async (event) => {
    const detailTarget = event.target.closest('[data-commission-action="detail"]');
    const payTarget = event.target.closest('[data-commission-action="pay"]');
    const target = detailTarget || payTarget;
    if (!target) return;
    const commissionId = target.getAttribute("data-commission-id");
    const commission = findCurrentCommission(commissionId);
    if (!commissionId || !commission) return;

    if (detailTarget) {
      renderCommissionDrawer(commissionsElements, {
        ...commission,
        id: commission.id || commission.commissionId,
        occurredAt: commission.occurredAt || commission.createdAt,
      }, {
        canPayCommissions: true,
      });
      return;
    }

    await payCurrentCommission(commissionId, payTarget);
  });
}

if (commissionsDrawerHost) {
  commissionsDrawerHost.addEventListener("click", async (event) => {
    const payTarget = event.target.closest('[data-commission-action="pay"]');
    const financialTarget = event.target.closest('[data-commission-action="open-financial"]');
    const auditTarget = event.target.closest('[data-commission-action="open-audit"]');
    if (payTarget) {
      await payCurrentCommission(payTarget.getAttribute("data-commission-id"), payTarget);
      return;
    }
    if (financialTarget && !financialTarget.disabled) {
      navigate("financeiro");
      return;
    }
    if (auditTarget) {
      navigate("auditoria");
    }
  });
}
clientId?.addEventListener("change", () => {
  refreshScheduleAssist();
});
serviceId?.addEventListener("change", async () => {
  refreshScheduleAssist();
  await validateScheduleSlot();
});
professionalId?.addEventListener("change", async () => {
  await validateScheduleSlot();
});
startsAt?.addEventListener("change", async () => {
  await validateScheduleSlot();
});

if (appointmentsDetailClose) {
  appointmentsDetailClose.addEventListener("click", () => {
    selectedAppointmentId = "";
    renderAppointmentDetailPanel();
  });
}

if (appointmentsEmptyNew) {
  appointmentsEmptyNew.addEventListener("click", () => {
    navigate("agenda");
    openScheduleDrawer();
    clientSearch?.focus();
  });
}

if (appointmentsEmptyToday) {
  appointmentsEmptyToday.addEventListener("click", async () => {
    appointmentsFilterPeriod.value = "today";
    appointmentsFilterDate.value = asDateInputValue(new Date());
    await loadAll();
  });
}

if (appointmentsEmptyClear) {
  appointmentsEmptyClear.addEventListener("click", async () => {
    appointmentsFilterStatus.value = "";
    appointmentsFilterProfessional.value = "";
    appointmentsFilterService.value = "";
    appointmentsFilterClient.value = "";
    appointmentsFilterSearch.value = "";
    await loadAll();
  });
}

if (appointmentsEmptyState) {
  appointmentsEmptyState.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.id === "appointmentsEmptyNew") {
      navigate("agenda");
      openScheduleDrawer();
      clientSearch?.focus();
      return;
    }
    if (target.id === "appointmentsEmptyToday") {
      appointmentsFilterPeriod.value = "today";
      appointmentsFilterDate.value = asDateInputValue(new Date());
      await loadAll();
      return;
    }
    if (target.id === "appointmentsEmptyClear") {
      appointmentsFilterStatus.value = "";
      appointmentsFilterProfessional.value = "";
      appointmentsFilterService.value = "";
      appointmentsFilterClient.value = "";
      appointmentsFilterSearch.value = "";
      await loadAll();
    }
  });
}

viewListBtn.addEventListener("click", () => {
  currentView = "list";
  viewListBtn.classList.add("is-active");
  viewGridBtn.classList.remove("is-active");
  renderAgendaView();
});

viewGridBtn.addEventListener("click", () => {
  currentView = "cards";
  viewGridBtn.classList.add("is-active");
  viewListBtn.classList.remove("is-active");
  renderAgendaView();
});

if (mobileFocusSaleBtn) {
  mobileFocusSaleBtn.addEventListener("click", () => {
    saleForm.scrollIntoView({ behavior: "smooth", block: "start" });
    saleProductId.focus();
  });
}

if (agendaNewAppointmentBtn) {
  agendaNewAppointmentBtn.addEventListener("click", () => {
    openScheduleDrawer();
    clientSearch?.focus();
  });
}

if (actionSuggestionsList) {
  actionSuggestionsList.addEventListener("click", async (event) => {
    const ctaTarget = event.target.closest("[data-dashboard-cta]");
    if (ctaTarget) {
      await handleDashboardSuggestionAction(ctaTarget);
      return;
    }
    const ignoreTarget = event.target.closest("[data-dashboard-ignore]");
    if (ignoreTarget) {
      await handleDashboardSuggestionIgnore(ignoreTarget);
    }
  });
}

if (dashboardPlaybookPanel) {
  dashboardPlaybookPanel.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-playbook-execute-reactivation]");
    if (!target) return;
    const fallbackPayload = {
      playbookSteps: [
        "Segmentar clientes de alto risco.",
        "Disparar campanha de retorno via WhatsApp.",
        "Monitorar respostas e reengajar nao respondentes.",
      ],
    };
    await executeReactivationPlaybook(fallbackPayload);
  });
}

window.addEventListener("resize", () => {
  const previousViewport = state.viewport;
  state.viewport = getViewport();

  if (previousViewport !== state.viewport && state.viewport !== "mobile") {
    state.mobileMoreOpen = false;
    state.agendaFiltersOpen = false;
    state.mobileSidebarOpen = false;
  }

  renderShell();
  applySectionVisibility();
});

async function init() {
  renderShell();
  applySectionVisibility();
  renderSaleCart();
  renderRecentSales();
  try {
    await ensureAuthSession();
    await loadCatalog();
    resetAutomationRuleForm();
    await loadAll();
  } catch (error) {
    renderSaleFeedback(
      "error",
      error?.message || "Falha ao iniciar sessao autenticada da aplicacao.",
      appointmentFeedback,
    );
  }
}

document.addEventListener("click", (event) => {
  const pdvTab = event.target.closest("[data-pdv-target]");
  if (!pdvTab) return;
  navigate(pdvTab.getAttribute("data-pdv-target"));
});

// ============================================================
// SCHEDULE DRAWER
// ============================================================
function openScheduleDrawer() {
  const drawer = document.getElementById("scheduleDrawer");
  if (!drawer) return;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeScheduleDrawer() {
  const drawer = document.getElementById("scheduleDrawer");
  if (!drawer) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
}

document.getElementById("scheduleDrawerClose")?.addEventListener("click", closeScheduleDrawer);
document.getElementById("scheduleDrawerScrim")?.addEventListener("click", closeScheduleDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeScheduleDrawer(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMobileSidebarOpen(false);
});

// ============================================================
// WEEK CALENDAR
// ============================================================
function getWeekMonday(baseDate) {
  const d = new Date(baseDate || Date.now());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function updateWcWeekLabel() {
  const el = document.getElementById("wcWeekLabel");
  if (!el || !wcWeekStart) return;
  const end = new Date(wcWeekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  el.textContent = `${fmt(wcWeekStart)} – ${fmt(end)}`;
}

function animateWeekCalendarTransition(container, direction = 0) {
  if (!container || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  const targets = [
    container.querySelector(".wc-header-row"),
    container.querySelector(".wc-body-scroll"),
  ].filter(Boolean);
  const offset = direction === 0 ? 0 : direction * 18;
  targets.forEach((target, index) => {
    target.animate(
      [
        { opacity: 0, transform: `translateX(${offset}px) scale(0.995)` },
        { opacity: 1, transform: "translateX(0) scale(1)" },
      ],
      {
        duration: 360 + index * 45,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );
  });
}

async function loadWeekCalendar(options = {}) {
  const container = document.getElementById("weekCalContainer");
  if (!container) return;
  const direction = Number(options.direction || 0);
  const hasRenderedCalendar = Boolean(container.querySelector(".wc-header-row"));
  if (hasRenderedCalendar) {
    container.classList.add("wc-is-loading");
  } else {
    container.innerHTML = `<div class="wc-loading">
      <div class="wc-loading-bar" style="width:80%"></div>
      <div class="wc-loading-bar" style="width:60%;margin-top:8px"></div>
      <div class="wc-loading-bar" style="width:72%;margin-top:8px"></div>
    </div>`;
  }
  updateWcWeekLabel();
  try {
    const end = new Date(wcWeekStart);
    end.setDate(end.getDate() + 7);
    const response = await apiFetch(
      `${API}/agenda/range?unitId=${unitId}&start=${encodeURIComponent(wcWeekStart.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
    );
    const data = await readResponsePayload(response);
    if (!response.ok) throw new Error("Erro ao carregar agenda semanal");
    updateWorkingHoursFromPayload(data?.workingHours || data);
    wcItems = normalizeAgendaItems(data);
  } catch {
    wcItems = [];
  }
  wcLoaded = true;
  container.classList.remove("wc-is-loading");
  renderWeekCalendar({ direction });
}

function assignWcColumns(items) {
  const sorted = [...items].sort((a, b) => a.startsAt - b.startsAt);
  sorted.forEach((item) => { item._col = 0; });
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const usedCols = new Set(
      sorted.slice(0, i)
        .filter((o) => o.startsAt < item.endsAt && o.endsAt > item.startsAt)
        .map((o) => o._col)
    );
    let col = 0;
    while (usedCols.has(col)) col++;
    item._col = col;
  }
  for (const item of sorted) {
    const overlapping = sorted.filter(
      (o) => o !== item && o.startsAt < item.endsAt && o.endsAt > item.startsAt
    );
    item._totalCols = overlapping.length > 0
      ? Math.max(item._col, ...overlapping.map((o) => o._col)) + 1
      : 1;
  }
  return sorted;
}

function renderWeekCalendar(options = {}) {
  const container = document.getElementById("weekCalContainer");
  if (!container || !wcWeekStart) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { startHour: HOUR_START, endHour: HOUR_END } = getWeekCalendarBounds();
  const HOURS = HOUR_END - HOUR_START;
  const availableHeight = Math.max(420, Math.floor(window.innerHeight - container.getBoundingClientRect().top - 24));
  const minHourHeight = state.viewport === "mobile" ? 48 : 44;
  const maxHourHeight = state.viewport === "mobile" ? 58 : 62;
  const HOUR_H = Math.max(minHourHeight, Math.min(maxHourHeight, Math.floor(availableHeight / HOURS)));
  const TOTAL_H = HOURS * HOUR_H;
  const DAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wcWeekStart); d.setDate(d.getDate() + i); return d;
  });

  const headerHtml = days.map((d, i) => {
    const isToday = d.toDateString() === today.toDateString();
    return `<div class="wc-hdr-cell${isToday ? " is-today" : ""}">
      <span class="wc-hdr-dow">${DAY_SHORT[i]}</span>
      <span class="wc-hdr-num${isToday ? " is-today" : ""}">${d.getDate()}</span>
    </div>`;
  }).join("");

  const timeLabels = Array.from({ length: HOURS }, (_, i) =>
    `<div class="wc-time-slot" style="height:${HOUR_H}px">${String(HOUR_START + i).padStart(2, "0")}h</div>`
  ).join("");

  const _isDark = !document.body.classList.contains("theme-light");
  const COLORS = _isDark ? {
    SCHEDULED:  { b: "rgba(230,229,224,0.35)", bg: "rgba(230,229,224,0.08)" },
    CONFIRMED:  { b: "rgba(230,229,224,0.45)", bg: "rgba(230,229,224,0.11)" },
    IN_SERVICE: { b: "#c08532",                bg: "rgba(192,133,50,0.20)"  },
    COMPLETED:  { b: "#1f8a65",                bg: "rgba(31,138,101,0.18)" },
    CANCELLED:  { b: "#cf2d56",                bg: "rgba(207,45,86,0.14)"  },
    NO_SHOW:    { b: "#cf2d56",                bg: "rgba(207,45,86,0.14)"  },
  } : {
    SCHEDULED:  { b: "#26251e", bg: "#e6e5e0" },
    CONFIRMED:  { b: "#26251e", bg: "#e1e0db" },
    IN_SERVICE: { b: "#c08532", bg: "#eadfcd" },
    COMPLETED:  { b: "#1f8a65", bg: "#dce8df" },
    CANCELLED:  { b: "#cf2d56", bg: "#eadbe0" },
    NO_SHOW:    { b: "#cf2d56", bg: "#eadbe0" },
  };

  const dayCols = days.map((d) => {
    const isToday = d.toDateString() === today.toDateString();
    const dayItems = wcItems.filter((item) => {
      const id = new Date(item.startsAt); id.setHours(0, 0, 0, 0);
      return id.toDateString() === d.toDateString() && isSlotBlockingStatus(item.status);
    });
    const dayHours = getWorkingHoursForDay(d.getDay());
    const dayStartMins = parseTimeToMinutes(dayHours?.start);
    const dayEndMins = parseTimeToMinutes(dayHours?.end);
    // Only mark as closed when we have loaded working hours AND the day is explicitly closed.
    // If currentWorkingHours is null (not yet loaded), treat as open to avoid false "Fechado" masks.
    const dayClosed = currentWorkingHours !== null && Boolean(
      !dayHours
      || dayHours.isClosed
      || dayStartMins == null
      || dayEndMins == null
      || dayEndMins <= dayStartMins,
    );
    const laid = assignWcColumns(dayItems);

    const gridLines = Array.from({ length: HOURS }, (_, i) => `
      <div class="wc-hline" style="top:${i * HOUR_H}px"></div>
      <div class="wc-hline wc-hline-half" style="top:${i * HOUR_H + HOUR_H / 2}px"></div>
    `).join("");

    let nowLine = "";
    if (isToday) {
      const now = new Date();
      const mins = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
      if (mins >= 0 && mins <= HOURS * 60) {
        nowLine = `<div class="wc-now-line" style="top:${(mins / 60) * HOUR_H}px"></div>`;
      }
    }

    let openWindow = "";
    let dayClosedMask = "";
    if (dayClosed) {
      dayClosedMask = `<div class="wc-day-closed-mask"><span>Fechado</span></div>`;
    } else {
      const topMins = dayStartMins - HOUR_START * 60;
      const heightMins = dayEndMins - dayStartMins;
      const top = Math.max(0, (topMins / 60) * HOUR_H);
      const height = Math.max(0, Math.min((heightMins / 60) * HOUR_H, TOTAL_H - top));
      if (height > 0) {
        openWindow = `<div class="wc-open-window" style="top:${top}px;height:${height}px"></div>`;
      }
    }

    const appts = laid.map((item) => {
      const startMins = (item.startsAt.getHours() - HOUR_START) * 60 + item.startsAt.getMinutes();
      if (startMins < 0 || startMins > HOURS * 60) return "";
      const dur = item.serviceDurationMin || Math.round((item.endsAt - item.startsAt) / 60000) || 30;
      const top = (startMins / 60) * HOUR_H;
      const ht = Math.max((dur / 60) * HOUR_H, 44);
      const col = item._col || 0;
      const total = item._totalCols || 1;
      const lp = (col / total) * 100;
      const wp = (1 / total) * 100;
      const horizontalInset = total > 1 ? 3 : 6;
      const c = COLORS[item.status] || COLORS.SCHEDULED;
      const timeStr = item.startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const firstName = String(item.client || "Cliente").split(" ")[0];
      const priceLabel = Number(item.servicePrice || 0) > 0
        ? Number(item.servicePrice || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";
      return `<div class="wc-appt" data-wc-appt-id="${item.id}"
        style="top:${top}px;height:${ht}px;left:calc(${lp}% + ${horizontalInset}px);width:calc(${wp}% - ${horizontalInset * 2}px);background:${c.bg};border-left-color:${c.b};"
        title="${timeStr} — ${item.client} — ${item.service}${priceLabel ? ` — ${priceLabel}` : ""}">
        <span class="wc-appt-name">${timeStr} · ${firstName}</span>
        <span class="wc-appt-svc">${item.service}</span>
        ${priceLabel ? `<span class="wc-appt-time">${priceLabel}</span>` : ""}
      </div>`;
    }).join("");

    return `<div class="wc-day-col${isToday ? " is-today" : ""}" style="height:${TOTAL_H}px">
      ${gridLines}${openWindow}${dayClosedMask}${nowLine}${appts}
    </div>`;
  }).join("");

  container.innerHTML = `
    <div class="wc-header-row">
      <div class="wc-hdr-cell wc-hdr-time"></div>
      ${headerHtml}
    </div>
    <div class="wc-body-scroll">
      <div class="wc-body-inner">
        <div class="wc-times-col">${timeLabels}</div>
        ${dayCols}
      </div>
    </div>`;

  animateWeekCalendarTransition(container, Number(options.direction || 0));

  container.querySelectorAll("[data-wc-appt-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      const appointmentId = el.getAttribute("data-wc-appt-id") || "";
      if (!appointmentId) return;
      alFocusedAppointmentId = appointmentId;
      currentView = "list";
      viewGridBtn.classList.remove("is-active");
      viewListBtn.classList.add("is-active");
      renderAgendaView();
      await openAgendaAppointmentDetail(appointmentId);
    });
  });
}

function changeWeekCalendar(delta) {
  if (!wcWeekStart) wcWeekStart = getWeekMonday();
  const d = new Date(wcWeekStart); d.setDate(d.getDate() + delta * 7);
  wcWeekStart = d; wcLoaded = false;
  loadWeekCalendar({ direction: delta > 0 ? 1 : -1 });
}

document.getElementById("wcPrevWeekBtn")?.addEventListener("click", () => {
  changeWeekCalendar(-1);
});
document.getElementById("wcNextWeekBtn")?.addEventListener("click", () => {
  changeWeekCalendar(1);
});

let whatsappMounted = false;
function initWhatsAppSection() {
  if (whatsappMounted) return;
  whatsappMounted = true;
  const mount = document.getElementById("whatsappMount");
  if (mount) renderWhatsAppSection(mount, { getToken: () => localStorage.getItem("authToken") });
}

function initBookingLinkSection() {
  const base = window.location.origin;
  const link = `${base}/agendamento?unitId=${encodeURIComponent(unitId)}`;
  const linkText = document.getElementById("bookingLinkText");
  const copyBtn = document.getElementById("copyBookingLink");
  const openLink = document.getElementById("bookingLinkOpen");
  if (linkText) linkText.textContent = link;
  if (openLink) openLink.href = link;
  if (copyBtn && !copyBtn.dataset.wired) {
    copyBtn.dataset.wired = "1";
    const label = copyBtn.querySelector(".bkl-copy-label");
    const defaultLabel = label?.textContent ?? "Copiar link";

    async function copyToClipboard(text) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) { /* fallthrough */ }
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (_) { return false; }
    }

    copyBtn.addEventListener("click", async () => {
      const copied = await copyToClipboard(link);
      if (!copied) return;
      copyBtn.classList.add("is-copied");
      if (label) label.textContent = "Copiado";
      window.clearTimeout(copyBtn._copyTimer);
      copyBtn._copyTimer = window.setTimeout(() => {
        copyBtn.classList.remove("is-copied");
        if (label) label.textContent = defaultLabel;
      }, 1600);
    });
  }
}

init();
