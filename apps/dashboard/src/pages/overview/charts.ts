import type { StatsMatrix } from "@sw-catalog/shared";
import type { ChartConfigType, FieldDataType, InfosType } from "graph-italia-components";

// Configurazioni dei grafici di graph-italia-components per il cruscotto.

/** Colori .italia: blu primario, arancio, verde, grigio e varianti, distinguibili tra loro. */
export const PALETTE = ["#0066CC", "#CC7A00", "#008758", "#5C6F82", "#4392E0", "#995C00", "#00264D", "#7FB2E5", "#E5A33D", "#17324D"];

export type ChartKind = "bar" | "line" | "pie";

export interface ChartOptions {
  /** Barre orizzontali: per etichette lunghe (licenze, amministrazioni, categorie) */
  horizontal?: boolean;
  stack?: boolean;
  area?: boolean;
  height?: number;
  colors?: string[];
  /** Data dei dati (ISO), mostrata nella scheda Info */
  updatedAt?: string;
}

const baseConfig: ChartConfigType = {
  colors: PALETTE,
  palette: [],
  direction: "vertical",
  h: 320,
  labeLine: false,
  legend: true,
  legendPosition: "top",
  tooltip: true,
  tooltipFormatter: "number",
  // Suffisso dopo il valore nel tooltip
  valueFormatter: "",
  totalLabel: "Totale",
  tooltipTrigger: "axis",
  responsive: true,
  zoom: "none",
  gridTop: "50",
  gridBottom: "40",
  gridLeft: "60",
  gridRight: "30",
  smooth: "0.2",
  showAllSymbol: false,
  background: "transparent",
};

export function chartData(id: string, kind: ChartKind, data: StatsMatrix, opts: ChartOptions = {}): FieldDataType {
  const series = (data[0]?.length ?? 1) - 1;
  // In orizzontale ECharts disegna la prima categoria in basso: si inverte per avere la più grande in alto.
  const ordered = opts.horizontal ? [data[0]!, ...data.slice(1).reverse()] : data;
  // Barre e linee di graph-italia vogliono una riga per serie (intestazione = categorie);
  // l'API dà una riga per categoria o periodo, che è anche il formato della tabella dati
  // (ChartWrapper con showDataTransposed la ri-traspone). La torta vuole una riga per fetta.
  const rows = kind === "pie" ? ordered : transpose(ordered);
  const config: ChartConfigType = {
    ...baseConfig,
    colors: opts.colors ?? PALETTE,
    h: opts.height ?? (opts.horizontal ? Math.max(260, 34 * (data.length - 1) + 80) : 320),
    direction: opts.horizontal ? "horizontal" : "vertical",
    // Con una sola serie la legenda ripete il titolo
    legend: kind === "pie" || series > 1,
    stack: opts.stack ?? false,
    showArea: opts.area ?? false,
    tooltipTrigger: kind === "pie" ? "item" : "axis",
    ...(opts.horizontal && { gridLeft: "28%", gridTop: series > 1 ? "50" : "20" }),
    ...(kind === "pie" && { showPieLabels: true, legendPosition: "bottom" }),
  };
  return { id, chart: kind, data: rows, config, dataSource: null, updatedAt: opts.updatedAt };
}

export const transpose = (m: StatsMatrix): StatsMatrix => (m[0] ?? []).map((_, col) => m.map((row) => row[col]!));

export function chartInfo(title: string, text: string): InfosType {
  return {
    title,
    text,
    labelTabChart: "Grafico",
    labelTabData: "Tabella dati",
    labelTabInfo: "Info",
    labelDownloadData: "Scarica",
    labelDownloadImage: "Scarica immagine",
    labelSource: "Fonte",
    labelUpdated: "Dati del",
    sourceTextInfo: "Database del catalogo",
  };
}

/** Matrice senza righe a zero? Serve per mostrare un messaggio invece di un grafico vuoto. */
export const isEmpty = (data: StatsMatrix) => data.slice(1).every((row) => row.slice(1).every((v) => !v));
