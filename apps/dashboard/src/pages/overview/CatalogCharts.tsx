import type { StatsDto, StatsInterval, StatsMatrix } from "@sw-catalog/shared";
import { ChartWrapper, ColorSchemeProvider, KpiItem, type KpiItemType } from "graph-italia-components";
import "graph-italia-components/dist/style.css";
import { Link } from "react-router";
import { type ChartKind, type ChartOptions, chartData, chartInfo, isEmpty } from "./charts.ts";

// Totali (KPI), andamenti e composizione del catalogo con graph-italia-components.
// Modulo caricato a parte dal cruscotto (React.lazy): contiene ECharts.

const SPRITES = "/graph-italia-sprites.svg";
const num = new Intl.NumberFormat("it-IT");
const pct = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

export default function CatalogCharts(props: {
  stats: StatsDto;
  interval: StatsInterval;
  onInterval: (i: StatsInterval) => void;
  loading: boolean;
}) {
  return (
    <ColorSchemeProvider scheme="light">
      <div className="space-y-12">
        <Totals totals={props.stats.totals} />
        <Trends {...props} />
        <Composition stats={props.stats} />
      </div>
    </ColorSchemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Totali
// ---------------------------------------------------------------------------

function flow(current: number, previous: number): Partial<KpiItemType> {
  const diff = current - previous;
  if (diff === 0) return { footer_text: "Come nei 30 giorni precedenti" };
  return {
    show_flow: true,
    flow_direction: diff > 0 ? "+" : "-",
    flow_value: num.format(Math.abs(diff)),
    flow_detail: "sui 30 giorni precedenti",
  };
}

function Totals({ totals: t }: { totals: StatsDto["totals"] }) {
  const pending = t.pendingRequests.onboarding + t.pendingRequests.thirdParty;
  const kpis: KpiItemType[] = [
    { title: "Software nel catalogo", value: num.format(t.software.active), footer_text: `${num.format(t.software.total)} in totale, compresi i disattivati` },
    {
      title: "Amministrazioni",
      value: num.format(t.publishers.active),
      footer_text: `${num.format(t.publishersInIpa)} con codice IPA trovato in IndicePA`,
    },
    {
      title: "Copertura delle PA",
      value: `${pct.format(t.paInIpa ? (t.publishersInIpa / t.paInIpa) * 100 : 0)}%`,
      footer_text: `${num.format(t.publishersInIpa)} su ${num.format(t.paInIpa)} pubbliche amministrazioni in IndicePA`,
    },
    { title: "Nuovi software (30 giorni)", value: num.format(t.newSoftware.current), ...flow(t.newSoftware.current, t.newSoftware.previous) },
    {
      title: "Nuove amministrazioni (30 giorni)",
      value: num.format(t.newPublishers.current),
      ...flow(t.newPublishers.current, t.newPublishers.previous),
    },
    {
      title: "Richieste in attesa",
      value: num.format(pending),
      footer_text: `${num.format(t.pendingRequests.onboarding)} di onboarding, ${num.format(t.pendingRequests.thirdParty)} di terze parti`,
      ...(pending > 0 && { background_color: "accent" }),
    },
  ];
  return (
    <section aria-labelledby="totals-title" className="space-y-4">
      <h2 id="totals-title" className="text-2xl font-semibold">
        Totali
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <KpiItem key={k.title} data={k} titleAs="h3" poweredByLabel="" />
        ))}
      </div>
      <p className="text-sm text-base-content/70">
        Code hosting censiti: {num.format(t.codeHostings.groups)} organizzazioni e {num.format(t.codeHostings.repositories)} singoli
        repository. Software aggiornati negli ultimi 30 giorni: {num.format(t.updatedSoftware30d)}.{" "}
        <Link to="/dashboard/richieste" className="ita-link">
          Vai alle richieste
        </Link>
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Grafici
// ---------------------------------------------------------------------------

function Chart(props: {
  id: string;
  kind: ChartKind;
  title: string;
  text: string;
  data: StatsMatrix;
  options?: ChartOptions;
  updatedAt: string;
  empty?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-box border border-base-300 bg-base-100 p-4 ${props.className ?? ""}`}>
      {isEmpty(props.data) ? (
        <>
          <h3 className="!text-xl !m-0 font-semibold">{props.title}</h3>
          <p className="py-8 text-base-content/70">{props.empty ?? "Nessun dato."}</p>
        </>
      ) : (
        <ChartWrapper
          id={props.id}
          data={chartData(props.id, props.kind, props.data, { ...props.options, updatedAt: props.updatedAt })}
          info={chartInfo(props.title, props.text)}
          spritePath={SPRITES}
          showDataTransposed={props.kind !== "pie"}
          enableDownloadData
          enableDownloadImage
        />
      )}
    </div>
  );
}

const INTERVALS: { id: StatsInterval; label: string }[] = [
  { id: "week", label: "Settimane" },
  { id: "month", label: "Mesi" },
  { id: "year", label: "Anni" },
];
const INTERVAL_TEXT: Record<StatsInterval, string> = {
  week: "nelle ultime 26 settimane",
  month: "negli ultimi 24 mesi",
  year: "per anno, dal primo software",
};

function Trends({
  stats,
  interval,
  onInterval,
  loading,
}: {
  stats: StatsDto;
  interval: StatsInterval;
  onInterval: (i: StatsInterval) => void;
  loading: boolean;
}) {
  const t = stats.trends;
  const when = INTERVAL_TEXT[t.interval];
  return (
    <section aria-labelledby="trends-title" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="trends-title" className="text-2xl font-semibold">
          Andamento
        </h2>
        <div role="group" aria-label="Periodo dei grafici" className="ms-auto flex gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i.id}
              type="button"
              aria-pressed={interval === i.id}
              className={`ita-btn ita-btn-xs ${interval === i.id ? "ita-btn-primary" : "ita-btn-outline ita-btn-primary"}`}
              onClick={() => onInterval(i.id)}
            >
              {i.label}
            </button>
          ))}
        </div>
        {loading && <span className="ita-spinner ita-spinner-sm" role="status" aria-label="Aggiornamento dei grafici" />}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart
          id={`cumulative-${t.interval}`}
          kind="line"
          title="Crescita del catalogo"
          text={`Software e amministrazioni presenti alla fine di ogni periodo, ${when}. Conta le righe esistenti oggi per data di creazione: i software eliminati non compaiono.`}
          data={t.cumulative}
          options={{ area: true }}
          updatedAt={stats.generatedAt}
          className="lg:col-span-2"
        />
        <Chart
          id={`created-${t.interval}`}
          kind="bar"
          title="Nuovi software e amministrazioni"
          text={`Software e amministrazioni aggiunti al catalogo ${when}.`}
          data={t.created}
          updatedAt={stats.generatedAt}
        />
        <Chart
          id={`requests-${t.interval}`}
          kind="bar"
          title="Richieste ricevute"
          text={`Richieste di onboarding delle PA e di inserimento di software di terze parti ${when}.`}
          data={t.requests}
          options={{ stack: true }}
          updatedAt={stats.generatedAt}
          empty={`Nessuna richiesta ${when}.`}
        />
      </div>
    </section>
  );
}

function Composition({ stats }: { stats: StatsDto }) {
  const c = stats.composition;
  const at = stats.generatedAt;
  const from = "Dai publiccode.yml dei software attivi.";
  return (
    <section aria-labelledby="composition-title" className="space-y-4">
      <h2 id="composition-title" className="text-2xl font-semibold">
        Composizione del catalogo
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart id="development-status" kind="pie" title="Stato di sviluppo" text={`${from} Campo developmentStatus.`} data={c.developmentStatus} updatedAt={at} />
        <Chart id="maintenance" kind="pie" title="Manutenzione" text={`${from} Campo maintenance.type.`} data={c.maintenance} updatedAt={at} />
        <Chart
          id="top-publishers"
          kind="bar"
          title="Amministrazioni con più software"
          text="Le dieci amministrazioni con più software attivi nel catalogo."
          data={c.topPublishers}
          options={{ horizontal: true }}
          updatedAt={at}
          className="lg:col-span-2"
        />
        <Chart id="software-type" kind="bar" title="Tipo di software" text={`${from} Campo softwareType.`} data={c.softwareType} options={{ horizontal: true }} updatedAt={at} />
        <Chart id="license" kind="bar" title="Licenze" text={`${from} Campo legal.license (espressione SPDX così come scritta).`} data={c.license} options={{ horizontal: true }} updatedAt={at} />
        <Chart
          id="platforms"
          kind="bar"
          title="Piattaforme"
          text={`${from} Campo platforms: un software può averne più di una.`}
          data={c.platforms}
          options={{ horizontal: true }}
          updatedAt={at}
        />
        <Chart
          id="publiccode-version"
          kind="bar"
          title="Versione dello standard"
          text={`${from} Campo publiccodeYmlVersion; 0.2 e 0.2.0 contano come la stessa versione.`}
          data={c.publiccodeVersion}
          updatedAt={at}
        />
        <Chart
          id="categories"
          kind="bar"
          title="Categorie più usate"
          text={`${from} Campo categories, le dodici più frequenti: un software può averne più di una.`}
          data={c.categories}
          options={{ horizontal: true }}
          updatedAt={at}
        />
        <Chart
          id="scope"
          kind="bar"
          title="Ambiti più frequenti"
          text={`${from} Campo intendedAudience.scope, i dodici più frequenti.`}
          data={c.scope}
          options={{ horizontal: true }}
          updatedAt={at}
        />
      </div>
    </section>
  );
}

