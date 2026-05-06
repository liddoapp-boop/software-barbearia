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
import { renderTopbar } from "./components/topbar.js";
import { renderMobileTabs } from "./components/mobile-tabs.js";
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
  renderSettingsSectionDrawer,
} from "./modules/configuracoes.js";
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
const unitId = "unit-01";
const STORAGE_ACTIVE_MODULE = "sb.activeModule";
const STORAGE_SIDEBAR_COLLAPSED = "sb.sidebarCollapsed";
const STORAGE_ACTIVE_ROLE = "sb.activeRole";
const STORAGE_AUTH_SESSION = "sb.authSession";
const FRONTEND_AUTH_CREDENTIALS = {
  owner: {
    email: "owner@barbearia.local",
    password: "owner123",
  },
  recepcao: {
    email: "recepcao@barbearia.local",
    password: "recepcao123",
  },
  profissional: {
    email: "profissional@barbearia.local",
    password: "profissional123",
  },
};

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
      action: renderPrimaryAction({
        label: "Novo agendamento",
        id: "agendaNewAppointmentBtn",
        type: "button",
      }),
    });
  }

  const agendaFilterMount = document.getElementById("agendaFilterMount");
  if (agendaFilterMount) {
    agendaFilterMount.innerHTML = renderFilterBar({
      id: "agendaOperationalFilters",
      essential: [
        `<input id="filterSearch" type="search" placeholder="Buscar cliente, servico ou profissional" class="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[220px]" />`,
        `<select id="filterPeriod" class="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="today">Hoje</option>
          <option value="week">Semana</option>
          <option value="month">Mes</option>
        </select>`,
        `<select id="filterProfessional" class="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">Todos profissionais</option>
        </select>`,
      ],
      advanced: [
        `<select id="filterStatus" class="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="">Todos status</option>
          <option value="SCHEDULED">Agendado</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="IN_SERVICE">Em atendimento</option>
          <option value="COMPLETED">Concluido</option>
          <option value="CANCELLED">Cancelado</option>
          <option value="NO_SHOW">Nao compareceu</option>
        </select>`,
        `<select id="filterService" class="rounded-lg border border-gray-200 px-3 py-2 text-sm">
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
    saleHistoryFilterMount.innerHTML = renderFilterBar({
      id: "saleHistoryFilters",
      essential: [
        `<input id="saleHistorySearch" type="search" placeholder="Buscar cliente ou produto" class="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[220px]" />`,
        `<button type="button" id="saleHistoryRefreshBtn" class="min-h-[40px] rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700">Atualizar</button>`,
      ],
      advanced: [
        `<input id="saleHistoryStart" type="date" class="rounded-lg border border-gray-200 px-3 py-2 text-sm" />`,
        `<input id="saleHistoryEnd" type="date" class="rounded-lg border border-gray-200 px-3 py-2 text-sm" />`,
      ],
      advancedLabel: "Periodo do historico",
    });
    bindFilterBars(saleHistoryFilterMount);
  }

  const inventoryHeaderMount = document.getElementById("inventoryHeaderMount");
  if (inventoryHeaderMount) {
    inventoryHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Estoque",
      eyebrow: "Funil operacional",
      title: "Estoque",
      subtitle: "Produtos criticos primeiro, reposicao clara e rastreabilidade tecnica apenas no detalhe.",
      action: renderPrimaryAction({
        label: "Novo produto",
        id: "inventoryAddBtn",
        type: "button",
      }),
    });
  }

  const inventoryFilterMount = document.getElementById("inventoryFilterMount");
  if (inventoryFilterMount) {
    inventoryFilterMount.innerHTML = renderFilterBar({
      id: "inventoryOperationalFilters",
      essential: [
        `<input id="inventorySearch" type="search" placeholder="Buscar produto" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[220px]" />`,
        `<select id="inventoryStatusFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="ALL">Todos status</option>
          <option value="OUT_OF_STOCK">Sem estoque</option>
          <option value="LOW_STOCK">Estoque baixo</option>
        </select>`,
      ],
      advanced: [
        `<select id="inventoryCategoryFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todas categorias</option>
        </select>`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(inventoryFilterMount);
  }

  const financialHeaderMount = document.getElementById("financialHeaderMount");
  if (financialHeaderMount) {
    financialHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Financeiro",
      eyebrow: "Financeiro conciliado",
      title: "Financeiro",
      subtitle: "Resultado do periodo, entradas, saidas, saldo e origens operacionais sem expor rastros tecnicos.",
      action: renderPrimaryAction({
        label: "Novo lancamento",
        id: "financialAddTransactionBtn",
        type: "button",
      }),
    });
  }

  const financialFilterMount = document.getElementById("financialFilterMount");
  if (financialFilterMount) {
    financialFilterMount.innerHTML = renderFilterBar({
      id: "financialOperationalFilters",
      essential: [
        `<select id="financialPeriod" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="today">Hoje</option>
          <option value="week">Semana</option>
          <option value="month" selected>Mes</option>
          <option value="custom">Personalizado</option>
        </select>`,
        `<select id="financialTypeFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Entradas e saidas</option>
          <option value="INCOME">Entradas</option>
          <option value="EXPENSE">Saidas</option>
        </select>`,
        `<input id="financialSearch" type="search" placeholder="Buscar descricao ou observacao" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[220px]" />`,
      ],
      advanced: [
        `<input id="financialCustomStart" type="date" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hidden" />`,
        `<input id="financialCustomEnd" type="date" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hidden" />`,
      ],
      advancedLabel: "Periodo personalizado",
    });
    bindFilterBars(financialFilterMount);
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
    commissionsFilterMount.innerHTML = renderFilterBar({
      id: "commissionsOperationalFilters",
      essential: [
        `<select id="commissionsPeriod" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>`,
        `<select id="commissionsProfessionalFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos profissionais</option>
        </select>`,
        `<select id="commissionsAppliesToFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todas origens</option>
          <option value="SERVICE">Atendimento finalizado</option>
          <option value="PRODUCT">Venda de produto</option>
        </select>`,
      ],
      advanced: [
        `<select id="commissionsStatusFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos status</option>
          <option value="PENDING">Pendente</option>
          <option value="PAID">Paga</option>
          <option value="CANCELED">Cancelada</option>
        </select>`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(commissionsFilterMount);
  }

  const clientsHeaderMount = document.getElementById("clientsHeaderMount");
  if (clientsHeaderMount) {
    clientsHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Clientes",
      eyebrow: "Relacionamento operacional",
      title: "Clientes",
      subtitle: "Carteira com ativos, risco, VIPs e reativacao prioritaria. Historico completo e rastros tecnicos ficam no detalhe.",
      action: renderPrimaryAction({
        label: "Novo cliente",
        id: "clientsAddBtn",
        type: "button",
      }),
    });
  }

  const clientsFilterMount = document.getElementById("clientsFilterMount");
  if (clientsFilterMount) {
    clientsFilterMount.innerHTML = renderFilterBar({
      id: "clientsOperationalFilters",
      essential: [
        `<input id="clientsSearch" type="search" placeholder="Buscar nome, telefone ou tag" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[220px]" />`,
        `<select id="clientsStatusFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos status</option>
          <option value="ACTIVE">Ativo</option>
          <option value="AT_RISK">Em risco</option>
          <option value="INACTIVE">Inativo</option>
          <option value="VIP">VIP</option>
        </select>`,
        `<select id="clientsPeriod" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>`,
      ],
      advanced: [
        `<select id="clientsSegmentFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos segmentos</option>
          <option value="VALUE_HIGH">Maior valor</option>
          <option value="VALUE_MEDIUM">Valor medio</option>
          <option value="VALUE_LOW">Valor baixo</option>
        </select>`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(clientsFilterMount);
  }

  const professionalsHeaderMount = document.getElementById("professionalsHeaderMount");
  if (professionalsHeaderMount) {
    professionalsHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Profissionais",
      eyebrow: "Catalogo operacional",
      title: "Profissionais",
      subtitle: "Equipe ativa, servicos que pode atender, producao e comissoes resumidas. Rastros tecnicos ficam no detalhe.",
    });
  }

  const professionalsFilterMount = document.getElementById("professionalsFilterMount");
  if (professionalsFilterMount) {
    professionalsFilterMount.innerHTML = renderFilterBar({
      id: "professionalsOperationalFilters",
      essential: [
        `<select id="professionalsFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos profissionais</option>
        </select>`,
        `<select id="professionalsPeriod" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>`,
      ],
      advanced: [
        `<span class="text-xs text-slate-500">Perfis e inativos dependem do cadastro de profissionais existente.</span>`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(professionalsFilterMount);
  }

  const servicesHeaderMount = document.getElementById("servicesHeaderMount");
  if (servicesHeaderMount) {
    servicesHeaderMount.innerHTML = renderPageHeader({
      breadcrumb: "Inicio / Servicos",
      eyebrow: "Catalogo operacional",
      title: "Servicos",
      subtitle: "Servicos vendaveis, preco, duracao, margem e profissionais habilitados primeiro. Detalhes tecnicos ficam recolhidos.",
      action: renderPrimaryAction({
        label: "Novo servico",
        id: "servicesAddBtn",
        type: "button",
      }),
    });
  }

  const servicesFilterMount = document.getElementById("servicesFilterMount");
  if (servicesFilterMount) {
    servicesFilterMount.innerHTML = renderFilterBar({
      id: "servicesOperationalFilters",
      essential: [
        `<input id="servicesSearch" type="search" placeholder="Buscar servico ou descricao" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[220px]" />`,
        `<select id="servicesCategoryFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todas categorias</option>
        </select>`,
        `<select id="servicesStatusFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="ALL">Todos status</option>
          <option value="ACTIVE">Servicos ativos</option>
          <option value="INACTIVE">Servicos inativos</option>
        </select>`,
      ],
      advanced: [
        `<input id="servicesMinPrice" type="number" min="0" step="0.01" placeholder="Preco minimo" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`,
        `<input id="servicesMaxPrice" type="number" min="0" step="0.01" placeholder="Preco maximo" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(servicesFilterMount);
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
    auditFilterMount.innerHTML = renderFilterBar({
      id: "auditOperationalFilters",
      essential: [
        `<input id="auditStartFilter" type="date" aria-label="Inicio" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`,
        `<input id="auditEndFilter" type="date" aria-label="Fim" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`,
        `<input id="auditEntityFilter" type="text" placeholder="Modulo ou entidade" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[180px]" />`,
        `<input id="auditActorFilter" type="search" placeholder="Ator" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[180px]" />`,
        `<input id="auditActionFilter" type="text" placeholder="Acao" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[180px]" />`,
      ],
      advanced: [
        `<input id="auditRequestIdFilter" type="search" placeholder="requestId" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[180px]" />`,
        `<input id="auditIdempotencyFilter" type="search" placeholder="idempotencyKey" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[180px]" />`,
        `<input id="auditEntityIdFilter" type="search" placeholder="entityId" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[180px]" />`,
        `<input id="auditRouteFilter" type="search" placeholder="rota" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm min-w-[180px]" />`,
        `<select id="auditMethodFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Todos metodos</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>`,
        `<select id="auditLimitFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="50">50 eventos</option>
          <option value="100">100 eventos</option>
          <option value="200">200 eventos</option>
          <option value="500">500 eventos</option>
        </select>`,
      ],
      advancedLabel: "Filtros avancados",
    });
    bindFilterBars(auditFilterMount);
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
        `<select id="reportsPeriod" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="today">Hoje</option>
          <option value="week">Semana</option>
          <option value="month" selected>Mes</option>
          <option value="custom">Periodo personalizado</option>
        </select>`,
        `<input id="reportsCustomStart" type="date" aria-label="Inicio do periodo" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hidden" />`,
        `<input id="reportsCustomEnd" type="date" aria-label="Fim do periodo" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hidden" />`,
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
        `<select id="fidelizacaoPeriod" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>`,
        `<select id="retentionRiskFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
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
        `<select id="automacoesPeriod" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="month">Mes</option>
          <option value="week">Semana</option>
          <option value="today">Hoje</option>
        </select>`,
        `<select id="automacoesStatusFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Execucoes (todos)</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="FAILED">Falha</option>
          <option value="PENDING">Pendente</option>
        </select>`,
      ],
      advanced: [
        `<select id="automacoesRiskFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Risco (todos)</option>
          <option value="HIGH">Alto</option>
          <option value="MEDIUM">Medio</option>
          <option value="LOW">Baixo</option>
        </select>`,
        `<select id="automacoesProviderFilter" class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
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
const appTopbar = document.getElementById("appTopbar");
const appMobileTabs = document.getElementById("appMobileTabs");

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
const inventoryProductNotes = document.getElementById("inventoryProductNotes");
const inventoryProductSubmitBtn = document.getElementById("inventoryProductSubmitBtn");
const inventoryStockModal = document.getElementById("inventoryStockModal");
const inventoryStockModalTitle = document.getElementById("inventoryStockModalTitle");
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
const clientsReactivationQueue = document.getElementById("clientsReactivationQueue");
const clientsAutomationSignals = document.getElementById("clientsAutomationSignals");
const clientsTable = document.getElementById("clientsTable");
const clientsFeedback = document.getElementById("clientsFeedback");
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
const servicesSubmitBtn = document.getElementById("servicesSubmitBtn");
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
const agendaListMode = document.getElementById("agendaListMode");

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
};

const allModuleIds = new Set(MENU_GROUPS.flatMap((group) => group.modules).map((module) => module.id));

const clientId = document.getElementById("clientId");
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
const saleClientId = document.getElementById("saleClientId");
const saleProfessionalId = document.getElementById("saleProfessionalId");
const saleAddItemBtn = document.getElementById("saleAddItemBtn");
const saleClearCartBtn = document.getElementById("saleClearCartBtn");
const clientsSearch = document.getElementById("clientsSearch");
const clientsStatusFilter = document.getElementById("clientsStatusFilter");
const clientsSegmentFilter = document.getElementById("clientsSegmentFilter");
const clientsPeriod = document.getElementById("clientsPeriod");
const clientsAddBtn = document.getElementById("clientsAddBtn");
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
let productsById = {};
let clientsById = {};
let servicesById = {};
let professionalsById = {};
let allServices = [];
let saleCart = createEmptyCart();
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
  CONFIRMED: "Confirmar",
  IN_SERVICE: "Iniciar",
  COMPLETE: "Concluir",
  RESCHEDULE: "Remarcar",
  CANCELLED: "Cancelar",
  NO_SHOW: "Falta",
  PAYMENT: "Registrar Pagamento",
  SELL: "Vender Produto",
};

const agendaElements = {
  list: agendaList,
  metricsGrid: agendaMetricsGrid,
  queue: queueList,
};

const state = {
  role: restoreRole(),
  activeModule: restoreActiveModule(),
  sidebarCollapsed: restoreSidebarCollapsed(),
  viewport: getViewport(),
  mobileTab: "inicio",
  mobileMoreOpen: false,
  agendaFiltersOpen: false,
  navBadges: {},
};
state.mobileTab = mapModuleToMobileTab(state.activeModule);
if (!isAllowedModule(state.activeModule)) {
  state.activeModule = firstAllowedModule();
  state.mobileTab = mapModuleToMobileTab(state.activeModule);
}

startsAt.value = asDateTimeLocalInputValue(new Date(Date.now() + 30 * 60000));
if (financialCustomStart) financialCustomStart.value = asDateInputValue(new Date());
if (financialCustomEnd) financialCustomEnd.value = asDateInputValue(new Date());
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
  localStorage.setItem(STORAGE_AUTH_SESSION, JSON.stringify(session));
}

function isAuthSessionValid(session = authSession) {
  if (!session?.accessToken || !session?.expiresAt) return false;
  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return false;
  if (session.user?.role && session.user.role !== state.role) return false;
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
  return authSession?.user?.id || authSession?.user?.email || state.role || "owner";
}

async function ensureAuthSession(forceRefresh = false) {
  if (!forceRefresh && isAuthSessionValid()) return authSession;
  const credentials = FRONTEND_AUTH_CREDENTIALS[state.role] || FRONTEND_AUTH_CREDENTIALS.owner;

  const response = await window.fetch(`${API}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-correlation-id": buildCorrelationId(),
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
      activeUnitId: unitId,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.accessToken) {
    throw new Error(data?.error || "Falha ao autenticar sessao da aplicacao.");
  }

  persistAuthSession({
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    user: data.user,
  });
  return authSession;
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
    await ensureAuthSession(true);
    response = await execute();
  }
  return response;
}

function restoreActiveModule() {
  const stored = localStorage.getItem(STORAGE_ACTIVE_MODULE);
  if (stored === "agendamentos") return "agenda";
  if (stored && allModuleIds.has(stored)) return stored;
  return "dashboard";
}

function restoreRole() {
  const queryRole = new URLSearchParams(window.location.search).get("role");
  if (queryRole && ["owner", "recepcao", "profissional"].includes(queryRole)) {
    return queryRole;
  }
  const stored = localStorage.getItem(STORAGE_ACTIVE_ROLE);
  if (stored && ["owner", "recepcao", "profissional"].includes(stored)) return stored;
  return "owner";
}

function restoreSidebarCollapsed() {
  return localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED) === "1";
}

function getViewport() {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1280) return "tablet";
  return "desktop";
}

function persistNavigationState() {
  localStorage.setItem(STORAGE_ACTIVE_MODULE, state.activeModule);
  localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, state.sidebarCollapsed ? "1" : "0");
  localStorage.setItem(STORAGE_ACTIVE_ROLE, state.role);
}

function getRoleMenuGroups() {
  return filterMenuGroupsByRole(MENU_GROUPS, state.role);
}

function getAllowedModules() {
  return getAllowedModulesForRole(state.role);
}

function isAllowedModule(moduleId) {
  return getAllowedModules().includes(moduleId);
}

function firstAllowedModule() {
  const preferred = getDefaultModuleForRole(state.role);
  if (isAllowedModule(preferred)) return preferred;
  const allowed = getAllowedModules();
  if (allowed.length) return allowed[0];
  return "dashboard";
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
  appShell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  const roleMenuGroups = getRoleMenuGroups();
  const secondaryModules = getSecondaryModulesForRole();
  const mobileTabs = getMobileTabsForRole();

  appSidebar.innerHTML = renderSidebar({
    groups: roleMenuGroups,
    activeModule: state.activeModule,
    collapsed: state.sidebarCollapsed,
    badges: state.navBadges,
    role: state.role,
  });

  appTopbar.innerHTML = renderTopbar({
    moduleLabel: getModuleLabel(state.activeModule),
  });

  appMobileTabs.innerHTML = renderMobileTabs({
    tabs: mobileTabs,
    activeTab: state.mobileTab,
    showMoreSheet: state.mobileMoreOpen,
    secondaryModules,
    activeModule: state.activeModule,
  });

  bindShellEvents();
  updateTopbarDate();
  syncAgendaFilterPanel();
}

function bindShellEvents() {
  appSidebar.querySelectorAll("[data-sidebar-module]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.sidebarModule));
  });

  const sidebarToggle = appSidebar.querySelector("[data-sidebar-toggle]");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      persistNavigationState();
      renderShell();
      applySectionVisibility();
    });
  }

  const roleSelect = document.getElementById("globalRoleSelect");
  if (roleSelect) {
    roleSelect.addEventListener("change", () => {
      const nextRole = roleSelect.value;
      if (!["owner", "recepcao", "profissional"].includes(nextRole)) return;
      state.role = nextRole;
      if (!isAllowedModule(state.activeModule)) {
        state.activeModule = firstAllowedModule();
      }
      state.mobileTab = mapModuleToMobileTab(state.activeModule);
      state.mobileMoreOpen = false;
      state.agendaFiltersOpen = false;
      authSession = null;
      localStorage.removeItem(STORAGE_AUTH_SESSION);
      persistNavigationState();
      renderShell();
      applySectionVisibility();
      loadAll();
    });
  }

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
}

function updateTopbarDate() {
  const todayLabel = document.getElementById("todayLabel");
  if (!todayLabel) return;

  todayLabel.textContent = new Date().toLocaleString("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

setInterval(updateTopbarDate, 30000);

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
  const shouldShow = state.viewport === "mobile" && state.activeModule === "operacao";
  mobileOperationActions.classList.toggle("hidden", !shouldShow);
}

function navigate(moduleId, options = {}) {
  const normalizedModuleId = moduleId === "agendamentos" ? "agenda" : moduleId;
  if (!normalizedModuleId || !allModuleIds.has(normalizedModuleId) || !isAllowedModule(normalizedModuleId)) return;

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
              `<li class="text-xs text-emerald-800">${client.fullName || "Cliente"} (${Number(client.daysWithoutReturn || 0)} dias) - impacto ${Number(client.estimatedImpact || 0).toFixed(2)}</li>`,
          )
          .join("")
      : actionType === "FILL_IDLE_SLOTS"
        ? windows
            .slice(0, 3)
            .map(
              (windowItem) =>
                `<li class="text-xs text-emerald-800">${windowItem.professionalName || "Profissional"} | faixa ${windowItem.band || "-"} | ${windowItem.horizonHours || 0}h</li>`,
            )
            .join("")
        : "";

  const executeButton =
    actionType === "REACTIVATION_CAMPAIGN"
      ? `
        <button
          type="button"
          class="rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-xs font-semibold"
          data-playbook-execute-reactivation="1"
        >
          Executar campanha de reativacao agora
        </button>
      `
      : "";

  dashboardPlaybookPanel.innerHTML = `
    <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-2">
      <p class="text-xs font-semibold text-emerald-900">Playbook: ${actionType || "ACAO"}</p>
      <ol class="space-y-1">
        ${steps.map((step) => `<li class="text-xs text-emerald-800">${step}</li>`).join("") || "<li class='text-xs text-emerald-800'>Sem passos detalhados.</li>"}
      </ol>
      ${details ? `<ul class="space-y-1">${details}</ul>` : ""}
      <div class="pt-1">${executeButton}</div>
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
  if (agendaListMode) agendaListMode.classList.add("hidden");

  const implemented = sectionsByModule[state.activeModule];
  if (implemented) {
    implemented.classList.remove("hidden");
    if (state.activeModule === "agenda") {
      if (currentView === "list") {
        if (agendaListMode) agendaListMode.classList.remove("hidden");
      } else if (agendaCardsMode) {
        agendaCardsMode.classList.remove("hidden");
      }
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
    <article class="placeholder-module">
      <h2 class="text-xl font-bold text-gray-800">${label}</h2>
      <p class="text-sm text-gray-600 mb-3">Modulo em preparacao. A navegacao ja esta pronta no App Shell premium.</p>
      <button type="button" class="rounded-lg bg-gray-900 text-white px-4 py-2 font-semibold" data-go-dashboard>
        Voltar para Dashboard
      </button>
    </article>
  `;

  const goHomeBtn = placeholderSection.querySelector("[data-go-dashboard]");
  if (goHomeBtn) goHomeBtn.addEventListener("click", () => navigate("dashboard"));
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

function fillSelect(select, items, label, options = {}) {
  if (!select) return;
  const blank = options.blankLabel ? `<option value="">${options.blankLabel}</option>` : "";
  select.innerHTML =
    blank + items.map((item) => `<option value="${item.id}">${label(item)}</option>`).join("");
}

function fillMultiSelect(select, items, label) {
  if (!select) return;
  select.innerHTML = items
    .map((item) => `<option value="${item.id}">${label(item)}</option>`)
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
    },
    onRemove: (productId) => {
      saleCart = removeCartItem(saleCart, productId);
      renderSaleCart();
    },
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
  saleRecentList.innerHTML = productSalesHistory
    .map(
      (sale) => `
      <article class="pdv-history-row rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <strong class="text-sm text-gray-800">${sale.soldAtLabel}</strong>
            <p class="text-xs text-gray-500 mt-1">${sale.clientLabel}</p>
          </div>
          <div class="text-right">
            <span class="block text-sm font-extrabold text-emerald-700">${sale.amount}</span>
            <span class="mt-1 inline-flex">${renderStatusChip(sale.status || "NOT_REFUNDED")}</span>
          </div>
        </div>
        <div class="mt-2 text-xs text-gray-600">
          ${sale.itemsSummary}
        </div>
        <div class="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" data-product-sale-detail="${sale.id}" class="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            Ver detalhes
          </button>
          ${
            sale.canRefund !== false
              ? `<button type="button" data-product-refund-sale="${sale.id}" class="min-h-[40px] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                  Devolver
                </button>`
              : ""
          }
        </div>
      </article>
    `,
    )
    .join("");
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
        <div><dt>Data</dt><dd>${sale.soldAtLabel}</dd></div>
        <div><dt>Cliente</dt><dd>${sale.clientLabel}</dd></div>
        <div><dt>Profissional</dt><dd>${sale.professionalLabel}</dd></div>
        <div><dt>Total</dt><dd>${sale.amount}</dd></div>
        <div><dt>Devolucao</dt><dd>${renderStatusChip(sale.status || "NOT_REFUNDED")}</dd></div>
        <div><dt>Itens</dt><dd>${sale.label}</dd></div>
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
                  <strong>${item.name}</strong>
                  <span>Vendido: ${item.quantity}</span>
                  <span>Devolvido: ${item.refundedQuantity || 0}</span>
                  <span>Disponivel para devolucao: ${item.refundableQuantity || 0}</span>
                  <span>Subtotal: R$ ${Number(item.unitPrice * item.quantity || 0).toFixed(2)}</span>
                </div>
              `,
            )
            .join("")}
        </div>
        <details class="pdv-impact-details">
          <summary>Ver impacto financeiro</summary>
          <p>Esta venda gerou entrada financeira.</p>
          ${sale.totalRefundedAmount > 0 ? `<p>Esta devolucao gerou reverso financeiro de R$ ${Number(sale.totalRefundedAmount).toFixed(2)}.</p>` : ""}
        </details>
        <details class="pdv-impact-details">
          <summary>Ver impacto no estoque</summary>
          <p>Esta venda baixou o estoque.</p>
          ${sale.totalRefundedAmount > 0 ? "<p>Esta devolucao retornou item ao estoque.</p>" : ""}
        </details>
      </div>
    `,
    history: `
      <ol class="op-history-list">
        <li><strong>Venda registrada</strong><span>${sale.soldAtLabel}</span></li>
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
          ? `<button type="button" data-drawer-product-refund-sale="${sale.id}" class="ux-btn ux-btn-danger">Devolver produto</button>`
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
  const response = await apiFetch(`${API}/catalog`);
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

  fillSelect(clientId, data.clients, (item) => {
    const phoneLabel = item.phone ? ` (${item.phone})` : "";
    return `${item.fullName}${phoneLabel}`;
  });
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
  modal.className = "fixed inset-0 z-50 hidden items-end sm:items-center justify-center bg-slate-900/50 p-3";
  modal.innerHTML = `
    <article class="checkout-modal w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div class="checkout-modal-header flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <p class="text-xs font-extrabold uppercase tracking-wide text-slate-500">Checkout do atendimento</p>
          <h3 class="text-base font-bold text-slate-900">Finalizar atendimento</h3>
        </div>
        <button type="button" data-checkout-close class="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Fechar</button>
      </div>
      <form id="appointmentCheckoutForm" class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
        <div class="sm:col-span-2 checkout-total-panel">
          <span>Total do atendimento</span>
          <strong id="checkoutTotalDisplay">R$ 0,00</strong>
        </div>
        <div class="sm:col-span-2 text-sm text-slate-700" id="checkoutSummary"></div>
        <details class="sm:col-span-2 checkout-products-panel">
          <summary>Produtos adicionais</summary>
          <div id="checkoutProductsList" class="space-y-2"></div>
          <button type="button" id="checkoutAddProduct" class="mt-2 min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Adicionar produto</button>
        </details>
        <label class="text-sm font-semibold text-slate-700">Metodo de pagamento
          <input id="checkoutPaymentMethod" type="text" value="PIX" class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700">Valor total
          <input id="checkoutTotal" type="text" readonly class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
        </label>
        <label class="text-sm font-semibold text-slate-700 sm:col-span-2">Observacoes
          <textarea id="checkoutNotes" rows="2" maxlength="500" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"></textarea>
        </label>
        <div id="checkoutTechnicalTrace" class="sm:col-span-2"></div>
        <div id="checkoutFeedback" class="sm:col-span-2"></div>
        <div class="sm:col-span-2 flex flex-wrap justify-end gap-2">
          <button type="button" data-checkout-close class="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
          ${renderPrimaryAction({ label: "Finalizar atendimento", id: "checkoutSubmitBtn", type: "submit" })}
        </div>
      </form>
    </article>
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
    .map((item) => `<option value="${item.id}">${item.name} (Estoque: ${item.stockQty})</option>`)
    .join("");
  if (!checkoutModalState.products.length) {
    list.innerHTML = `
      <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
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
      <div class="checkout-product-row grid grid-cols-12 gap-2">
        <select data-checkout-product="${index}" class="col-span-8 min-h-[40px] rounded-lg border border-slate-200 px-2 text-sm">
          <option value="">Selecione</option>
          ${productOptions}
        </select>
        <input data-checkout-qty="${index}" type="number" min="1" max="99" value="${row.quantity}" class="col-span-3 min-h-[40px] rounded-lg border border-slate-200 px-2 text-sm" />
        <button type="button" data-checkout-remove="${index}" class="col-span-1 min-h-[40px] rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs">X</button>
        <div class="col-span-12 text-right text-xs font-bold text-slate-600">Subtotal: ${subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
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
        <div><dt>Cliente</dt><dd>${appointment.client}</dd></div>
        <div><dt>Servico</dt><dd>${appointment.service}</dd></div>
        <div><dt>Profissional</dt><dd>${appointment.professional}</dd></div>
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
        '<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Metodo de pagamento obrigatorio.</p>';
    }
    return;
  }
  for (const item of products) {
    const product = productsById[item.productId];
    const stockQty = Number(product?.stockQty || 0);
    if (!product || Number(item.quantity || 0) > stockQty) {
      if (feedback) {
        const name = product?.name || "produto";
        feedback.innerHTML = `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Quantidade maior que o estoque para ${name}. Disponivel=${stockQty}.</p>`;
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
      feedback.innerHTML = `<p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${error.message || "Falha ao finalizar atendimento."}</p>`;
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
  modal.className = "fixed inset-0 z-50 hidden items-end sm:items-center justify-center bg-slate-900/50 p-3";
  modal.innerHTML = `
    <article class="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div class="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h3 class="text-base font-bold text-slate-900">Estornar atendimento</h3>
        <button type="button" data-appointment-refund-close class="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Fechar</button>
      </div>
      <form id="appointmentRefundForm" class="grid grid-cols-1 gap-3 p-4">
        <div id="appointmentRefundSummary" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"></div>
        <label class="text-sm font-semibold text-slate-700">Motivo
          <textarea id="appointmentRefundReason" rows="3" maxlength="500" required class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"></textarea>
        </label>
        <label class="text-sm font-semibold text-slate-700">Data do estorno
          <input id="appointmentRefundedAt" type="datetime-local" required class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <div id="appointmentRefundFeedback"></div>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" data-appointment-refund-close class="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
          <button type="submit" id="appointmentRefundSubmitBtn" class="min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold">Confirmar estorno</button>
        </div>
      </form>
    </article>
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
      <div><strong>Cliente:</strong> ${appointment.client}</div>
      <div><strong>Servico:</strong> ${appointment.service}</div>
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
      feedback.innerHTML = `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Informe o motivo do estorno.</p>`;
    }
    return;
  }
  const refundedAt = new Date(refundedAtValue);
  if (Number.isNaN(refundedAt.getTime())) {
    if (feedback) {
      feedback.innerHTML = `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Informe uma data valida para o estorno.</p>`;
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
      feedback.innerHTML = `<p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${error.message || "Falha ao registrar estorno."}</p>`;
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
  modal.className = "fixed inset-0 z-50 hidden items-end sm:items-center justify-center bg-slate-900/50 p-3";
  modal.innerHTML = `
    <article class="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div class="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h3 class="text-base font-bold text-slate-900">Devolver produto</h3>
        <button type="button" data-product-refund-close class="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Fechar</button>
      </div>
      <form id="productRefundForm" class="grid grid-cols-1 gap-3 p-4">
        <div id="productRefundSummary" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"></div>
        <div id="productRefundItems" class="space-y-2"></div>
        <label class="text-sm font-semibold text-slate-700">Motivo
          <textarea id="productRefundReason" rows="3" maxlength="500" required class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"></textarea>
        </label>
        <label class="text-sm font-semibold text-slate-700">Data da devolucao
          <input id="productRefundedAt" type="datetime-local" required class="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <div id="productRefundFeedback"></div>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" data-product-refund-close class="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
          <button type="submit" id="productRefundSubmitBtn" class="min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-semibold">Confirmar devolucao</button>
        </div>
      </form>
    </article>
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
      <div><strong>Venda:</strong> ${sale.soldAtLabel || "Venda selecionada"}</div>
      <div><strong>Total:</strong> ${sale.amount}</div>
      <div><strong>Cliente:</strong> ${sale.clientLabel || "Nao vinculado"}</div>
    `;
  }
  const itemsRoot = modal.querySelector("#productRefundItems");
  if (itemsRoot) {
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    itemsRoot.innerHTML = saleItems
      .filter((item) => Number(item.refundableQuantity ?? item.quantity ?? 0) > 0)
      .map((item) => `
        <label class="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_120px] sm:items-center">
          <span class="text-sm text-slate-700">
            <strong>${item.name}</strong>
            <span class="block text-xs text-slate-500">Vendido: ${item.quantity} | Devolvido: ${item.refundedQuantity || 0} | Disponivel: ${item.refundableQuantity ?? item.quantity} | Unitario: R$ ${Number(item.unitPrice || 0).toFixed(2)}</span>
            <span class="block text-xs font-semibold text-slate-600 mt-1">Quantidade para devolver</span>
          </span>
          <input data-product-refund-product="${item.productId}" type="number" min="0" max="${item.refundableQuantity ?? item.quantity}" step="1" value="0" class="min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
      feedback.innerHTML = `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Informe o motivo da devolucao.</p>`;
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
      feedback.innerHTML = `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Quantidade de devolucao invalida para um item.</p>`;
    }
    return;
  }
  const items = rawItems.filter((item) => item.productId && item.quantity > 0);
  if (!items.length) {
    if (feedback) {
      feedback.innerHTML = `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Informe ao menos uma quantidade para devolver.</p>`;
    }
    return;
  }
  const refundedAt = new Date(refundedAtValue);
  if (Number.isNaN(refundedAt.getTime())) {
    if (feedback) {
      feedback.innerHTML = `<p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">Informe uma data valida para a devolucao.</p>`;
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
      feedback.innerHTML = `<p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${error.message || "Falha ao registrar devolucao."}</p>`;
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
    await callJson(`${API}/appointments/${item.id}/status`, "PATCH", {
      status: action,
      reason: reason || undefined,
    });
    setScheduleFeedback("success", `Status atualizado para ${actionLabel[action] || action}.`);
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
    if (agendaCardsMode) agendaCardsMode.classList.add("hidden");
    if (agendaListMode) agendaListMode.classList.remove("hidden");
    renderAppointmentsView();
    return;
  }

  if (agendaCardsMode) agendaCardsMode.classList.remove("hidden");
  if (agendaListMode) agendaListMode.classList.add("hidden");
  const visibleItems = filterAgendaItems(currentAgenda, getAgendaFilterState());
  renderAgendaData(agendaElements, currentAgenda, visibleItems, "list", {
    onAction: updateStatus,
    onError: (error) => {
      setScheduleFeedback("error", error?.message || "Falha ao atualizar agendamento.");
    },
  });
}

function renderAppointmentDetailPanel() {
  const selected = currentAppointments.find((item) => item.id === selectedAppointmentId) || null;
  renderAppointmentDetail(appointmentsElements.detail, selected, currentAppointments, {
    onAction: handleAppointmentsAction,
  });
}

async function handleAppointmentsAction(appointmentId, action) {
  const item = currentAppointments.find((row) => row.id === appointmentId);
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
    CONFIRMED: "CONFIRMED",
    IN_SERVICE: "IN_SERVICE",
    CANCELLED: "CANCELLED",
    NO_SHOW: "NO_SHOW",
  };
  const nextStatus = statusMap[action];
  if (!nextStatus) return;

  await callJson(`${API}/appointments/${item.id}/status`, "PATCH", {
    status: nextStatus,
    reason:
      nextStatus === "CANCELLED" || nextStatus === "NO_SHOW"
        ? "Atualizado na central de agendamentos"
        : undefined,
    changedBy: "owner",
  });
  renderAppointmentsFeedback(
    appointmentsElements,
    "success",
    `Status atualizado para ${actionLabel[action] || nextStatus}.`,
  );
  await loadAll();
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
  const period = (financialPeriod && financialPeriod.value) || "month";
  const range = rangeFromPeriod(period);
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

function hideServicesModal() {
  if (!servicesModal) return;
  servicesModal.classList.add("hidden");
  servicesModal.classList.remove("flex");
}

function showServicesModal(service = null) {
  if (!servicesModal) return;
  const editing = Boolean(service?.id);
  servicesModalTitle.textContent = editing ? "Editar servico" : "Adicionar servico";
  servicesSubmitBtn.textContent = editing ? "Salvar alteracoes" : "Salvar servico";
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
  return {
    unitId,
    name,
    price,
    durationMinutes,
    isActive: true,
  };
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
    showServicesModal(service);
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
  inventoryProductNotes.value = editing ? product.notes || "" : "";
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
  inventoryStockModalTitle.textContent = isAdjustment
    ? `Ajustar saldo - ${productName || "Produto"}`
    : isAdd
      ? `Registrar entrada - ${productName || "Produto"}`
      : `Registrar saida - ${productName || "Produto"}`;
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
  const filteredEvents = events.filter((event) => {
    if (
      advancedFilters.entity &&
      ![
        event.entity,
        humanizeAuditToken(event.entity),
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
    loadFinancialEntries(),
    loadStockOverview(),
    loadClientsOverview(),
    loadProfessionalsPerformance(),
    loadServicesModule(),
    loadCommissionsStatement(),
    loadFidelizacaoData(),
    loadAutomacoesData(),
    loadSettingsModule(),
    loadMetasModule(),
    loadAuditEvents(),
    loadProductSalesHistory(),
    loadReportsBundle(),
  ]);

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
    automacoesResult.status === "fulfilled"
      ? buildDashboardAutomationSignals(automacoesResult.value)
      : {
          queued: 0,
          executed: 0,
          failed: 0,
          lastExecutedAt: null,
          topPlaybooks: [],
        };
  const clientsAutomationSignalsPayload =
    automacoesResult.status === "fulfilled" && clientsResult.status === "fulfilled"
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
        financialPayload: financialResult.status === "fulfilled" ? financialResult.value : null,
        stockPayload: stockResult.status === "fulfilled" ? stockResult.value : null,
        automacoesPayload: automacoesResult.status === "fulfilled" ? automacoesResult.value : null,
      }),
    );
  } else {
    renderDashboardError(dashboardElements, () => {
      loadAll();
    });
  }

  if (financialResult.status === "fulfilled") {
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
    renderStockData(stockElements, stockResult.value);
  } else {
    currentStockPayload = null;
    renderStockError(stockElements, "Nao foi possivel carregar estoque operacional.");
  }

  if (productSalesHistoryResult.status !== "fulfilled") {
    productSalesHistory = [];
    if (saleRecentList) {
      saleRecentList.innerHTML = `<p class="text-sm text-red-600">Nao foi possivel carregar historico de vendas.</p>`;
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
      commissions: commissionsResult.status === "fulfilled" ? commissionsResult.value.entries : [],
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

  if (commissionsResult.status === "fulfilled") {
    currentCommissionsPayload = commissionsResult.value;
    renderCommissionsData(commissionsElements, commissionsResult.value, {
      canPayCommissions: state.role === "owner",
    });
  } else {
    currentCommissionsPayload = null;
    renderCommissionsError(commissionsElements, "Nao foi possivel carregar extrato de comissoes.");
  }

  if (auditResult.status === "fulfilled") {
    currentAuditPayload = auditResult.value;
    renderAuditData(auditElements, auditResult.value);
  } else {
    currentAuditPayload = null;
    renderAuditError(
      auditElements,
      auditResult.reason?.message || "Nao foi possivel carregar auditoria.",
    );
  }

  if (reportsResult.status === "fulfilled") {
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

  if (fidelizacaoResult.status === "fulfilled") {
    renderFidelizacaoData(fidelizacaoElements, fidelizacaoResult.value);
  } else {
    renderFidelizacaoError(
      fidelizacaoElements,
      "Nao foi possivel carregar fidelizacao premium e multiunidade.",
    );
  }

  if (automacoesResult.status === "fulfilled") {
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

  if (settingsResult.status === "fulfilled") {
    currentSettingsPayload = settingsResult.value || {};
    renderSettingsData(settingsElements, currentSettingsPayload, {
      professionals: Object.values(professionalsById),
      services: allServices,
    });
  } else {
    currentSettingsPayload = null;
    renderSettingsError(
      settingsElements,
      settingsResult.reason?.message || "Nao foi possivel carregar configuracoes.",
    );
  }

  if (metasResult.status === "fulfilled") {
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
    themeMode: String(business.themeMode || "light"),
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
    });
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
          phone: String(formData.get("phone") || "").trim(),
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

      if (form.id === "settingsAppearanceForm") {
        const formData = new FormData(form);
        await saveSettingsBusiness({
          displayName: String(formData.get("displayName") || "").trim(),
          primaryColor: String(formData.get("primaryColor") || "#0f172a").trim(),
          themeMode: String(formData.get("themeMode") || "light"),
        });
        await refreshSettingsScreen("Aparencia salva com sucesso.");
      }
    } catch (error) {
      renderSaleFeedback(
        "error",
        error?.message || "Nao foi possivel salvar configuracoes.",
        settingsFeedback,
      );
    }
  });

  settingsRoot.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-settings-action]");
    if (!trigger) return;
    const action = trigger.getAttribute("data-settings-action");
    try {
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

      if (action === "open-section") {
        renderSettingsSectionDrawer(settingsElements, currentSettingsPayload || {}, {
          professionals: Object.values(professionalsById),
          services: allServices,
        }, trigger.getAttribute("data-settings-section") || "business");
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

saleClearCartBtn.addEventListener("click", () => {
  clearSaleCart();
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

[saleHistorySearch, saleHistoryStart, saleHistoryEnd].forEach((input) => {
  input?.addEventListener("input", () => {
    window.clearTimeout(saleHistoryDebounce);
    saleHistoryDebounce = window.setTimeout(() => {
      loadProductSalesHistory().catch(() => {
        if (saleRecentList) {
          saleRecentList.innerHTML = `<p class="text-sm text-red-600">Nao foi possivel carregar historico de vendas.</p>`;
        }
      });
    }, 300);
  });
});

saleHistoryRefreshBtn?.addEventListener("click", () => {
  loadProductSalesHistory().catch(() => {
    if (saleRecentList) {
      saleRecentList.innerHTML = `<p class="text-sm text-red-600">Nao foi possivel carregar historico de vendas.</p>`;
    }
  });
});

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
    financialTransactionPaymentMethod.value = transaction?.paymentMethod || "";
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

financialTransactionModalClose?.addEventListener("click", hideFinancialTransactionModal);
financialTransactionModalCancel?.addEventListener("click", hideFinancialTransactionModal);

clientsAddBtn?.addEventListener("click", () => {
  showClientsModal();
});

clientsModalClose?.addEventListener("click", () => {
  hideClientsModal();
});

clientsModalCancel?.addEventListener("click", () => {
  hideClientsModal();
});

financialTransactionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = Number(financialTransactionAmount?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    renderSaleFeedback("warning", "Informe um valor válido.", financialFeedback);
    financialTransactionAmount?.focus();
    return;
  }
  const payload = {
    unitId,
    type: financialTransactionType.value || "INCOME",
    category: String(financialTransactionCategory.value || "").trim(),
    description: String(financialTransactionDescription.value || "").trim(),
    amount,
    date: new Date(`${financialTransactionDate.value}T12:00:00`).toISOString(),
    paymentMethod: String(financialTransactionPaymentMethod.value || "").trim() || undefined,
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
    renderSaleFeedback("warning", "Informe o nome do cliente.", clientsFeedback);
    clientsName?.focus();
    return;
  }
  if (!phone) {
    renderSaleFeedback("warning", "Informe um telefone valido com DDD.", clientsFeedback);
    clientsPhone?.focus();
    return;
  }
  if (!isValidClientPhone(phone)) {
    renderSaleFeedback("warning", "Informe um telefone valido com DDD.", clientsFeedback);
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
      clientsFeedback,
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
});

inventoryProductModalCancel?.addEventListener("click", () => {
  hideInventoryProductModal();
});

inventoryStockModalClose?.addEventListener("click", () => {
  hideInventoryStockModal();
});

inventoryStockModalCancel?.addEventListener("click", () => {
  hideInventoryStockModal();
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
    notes: String(inventoryProductNotes.value || "").trim() || undefined,
  };

  try {
    const editingId = String(inventoryProductId.value || "").trim();
    if (editingId) {
      await callJson(`${API}/inventory/${editingId}`, "PATCH", payload);
      hideInventoryProductModal();
      await refreshInventoryAndCatalog("Produto atualizado com sucesso.");
      return;
    }
    await callJson(`${API}/inventory`, "POST", payload);
    hideInventoryProductModal();
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
      showInventoryProductModal(product);
      return;
    }

    if (action === "add") {
      showInventoryStockModal({ productId, productName, type: "IN" });
      return;
    }

    if (action === "remove") {
      showInventoryStockModal({ productId, productName, type: "OUT" });
      return;
    }

    if (action === "delete") {
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

    const trigger = event.target.closest('[data-clients-action="add-first"]');
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
if (auditEntityFilter) auditEntityFilter.addEventListener("input", debouncedLoadAll);
if (auditActionFilter) auditActionFilter.addEventListener("input", debouncedLoadAll);
if (auditActorFilter) auditActorFilter.addEventListener("input", debouncedLoadAll);
if (auditStartFilter) auditStartFilter.addEventListener("change", loadAll);
if (auditEndFilter) auditEndFilter.addEventListener("change", loadAll);
if (auditLimitFilter) auditLimitFilter.addEventListener("change", loadAll);
if (auditRequestIdFilter) auditRequestIdFilter.addEventListener("input", debouncedLoadAll);
if (auditIdempotencyFilter) auditIdempotencyFilter.addEventListener("input", debouncedLoadAll);
if (auditEntityIdFilter) auditEntityIdFilter.addEventListener("input", debouncedLoadAll);
if (auditRouteFilter) auditRouteFilter.addEventListener("input", debouncedLoadAll);
if (auditMethodFilter) auditMethodFilter.addEventListener("change", loadAll);
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
  agendaSchedulePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  startsAt?.focus();
}

async function payCurrentCommission(commissionId, button) {
  const commission = findCurrentCommission(commissionId);
  if (!commissionId || !commission) return;

  if (state.role !== "owner") {
    renderSaleFeedback(
      "error",
      "Voce nao tem permissao para pagar comissoes.",
      commissionsFeedback || financialFeedback,
    );
    return;
  }
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
        canPayCommissions: state.role === "owner",
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
    agendaSchedulePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    clientId?.focus();
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
      agendaSchedulePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      clientId?.focus();
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
  viewListBtn.className = "px-3 py-2 text-sm bg-gray-900 text-white";
  viewGridBtn.className = "px-3 py-2 text-sm bg-white text-gray-700";
  renderAgendaView();
});

viewGridBtn.addEventListener("click", () => {
  currentView = "cards";
  viewGridBtn.className = "px-3 py-2 text-sm bg-gray-900 text-white";
  viewListBtn.className = "px-3 py-2 text-sm bg-white text-gray-700";
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
    agendaSchedulePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    clientId?.focus();
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

init();

