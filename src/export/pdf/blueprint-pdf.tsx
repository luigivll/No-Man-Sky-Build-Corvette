import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PartDef } from "@/domain/types";
import type { ShoppingRow, StepRow } from "./payload";

/**
 * The printable build manual. Rendered server-side by `app/api/blueprint`
 * so the client bundle never has to ship a PDF engine.
 */

const styles = StyleSheet.create({
  page: { padding: 34, backgroundColor: "#0b0f16", color: "#e8f0fb", fontFamily: "Helvetica", fontSize: 9 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, borderBottom: 1, borderColor: "#2b3b55", paddingBottom: 8 },
  title: { fontSize: 20, color: "#4ee1ff", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#8ea0b8" },
  stamp: { fontSize: 7.5, color: "#5c6c85", textAlign: "right" },
  hero: { width: "100%", height: 236, marginBottom: 12, borderRadius: 6 },
  row: { flexDirection: "row", marginBottom: 4 },
  statBox: { flex: 1, marginRight: 6, padding: 7, backgroundColor: "#111826", borderRadius: 4, borderWidth: 1, borderColor: "#1c2739" },
  statLabel: { fontSize: 6.5, color: "#5c6c85", letterSpacing: 0.6, marginBottom: 2 },
  statValue: { fontSize: 12, color: "#e8f0fb" },
  h2: { fontSize: 11, color: "#ffb547", marginTop: 14, marginBottom: 6, letterSpacing: 0.4 },
  tableHead: { flexDirection: "row", backgroundColor: "#151d2b", padding: 5, borderRadius: 3 },
  tableRow: { flexDirection: "row", padding: 5, borderBottom: 0.5, borderColor: "#1c2739" },
  colQty: { width: 34 },
  colPart: { flex: 1 },
  colCat: { width: 96 },
  colClass: { width: 30 },
  colCost: { width: 58, textAlign: "right" },
  dim: { color: "#8ea0b8" },
  accent: { color: "#4ee1ff" },
  step: { flexDirection: "row", marginBottom: 5 },
  stepNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#0b8fb8", color: "#04060b", textAlign: "center", fontSize: 9, paddingTop: 6, marginRight: 8, fontWeight: 700 },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 9.5, color: "#e8f0fb", marginBottom: 1 },
  stepMeta: { fontSize: 7.5, color: "#5c6c85" },
  footer: { position: "absolute", bottom: 18, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#5c6c85" },
  swatches: { flexDirection: "row", marginTop: 4 },
  swatch: { width: 26, height: 12, borderRadius: 2, marginRight: 4 },
  note: { fontSize: 7.5, color: "#8ea0b8", lineHeight: 1.4, marginTop: 8 },
});

export interface BlueprintPdfProps {
  title: string;
  subtitle: string;
  render: string | null;
  stats: Array<{ label: string; value: string }>;
  palette: Array<{ label: string; color: string }>;
  shopping: ShoppingRow[];
  steps: StepRow[];
  totalCost: number;
  warnings: string[];
}

const PAGE_FOOTER = "NMS Corvette Shipyard";

export function BlueprintPdf({
  title,
  subtitle,
  render,
  stats,
  palette,
  shopping,
  steps,
  totalCost,
  warnings,
}: BlueprintPdfProps) {
  const partById = new Map<string, PartDef | null>();
  void partById;

  return (
    <Document title={`${title} — Corvette Blueprint`} author="NMS Corvette Shipyard">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Text style={styles.stamp}>
            CORVETTE WORKSHOP{"\n"}BUILD MANUAL
          </Text>
        </View>

        {render ? <Image style={styles.hero} src={render} /> : null}

        <View style={styles.row}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statBox}>
              <Text style={styles.statLabel}>{stat.label.toUpperCase()}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.h2}>PAINT SCHEME</Text>
        <View style={styles.swatches}>
          {palette.map((entry) => (
            <View key={entry.label} style={{ marginRight: 10 }}>
              <View style={[styles.swatch, { backgroundColor: entry.color }]} />
              <Text style={[styles.stepMeta, { marginTop: 2 }]}>{entry.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.h2}>SHOPPING LIST — {shopping.reduce((sum, row) => sum + row.count, 0)} MODULES</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.colQty, styles.dim]}>QTY</Text>
          <Text style={[styles.colPart, styles.dim]}>MODULE</Text>
          <Text style={[styles.colCat, styles.dim]}>CATEGORY</Text>
          <Text style={[styles.colClass, styles.dim]}>CLS</Text>
          <Text style={[styles.colCost, styles.dim]}>UNITS</Text>
        </View>
        {shopping.map((row) => (
          <View key={row.partId} style={styles.tableRow} wrap={false}>
            <Text style={styles.colQty}>{row.count}×</Text>
            <Text style={styles.colPart}>{row.name}</Text>
            <Text style={[styles.colCat, styles.dim]}>{row.category}</Text>
            <Text style={styles.colClass}>{row.partClass}</Text>
            <Text style={[styles.colCost, styles.dim]}>{row.cost > 0 ? row.cost.toLocaleString("en-GB") : "—"}</Text>
          </View>
        ))}
        <Text style={[styles.note, styles.accent]}>
          Total workshop cost if bought new: {totalCost.toLocaleString("en-GB")} Units. Most modules can also be
          salvaged from Salvageable Scrap or traded at the Corvette Workshop.
        </Text>

        {warnings.length > 0 ? (
          <Text style={styles.note}>
            {warnings.map((warning) => `• ${warning}`).join("\n")}
          </Text>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{PAGE_FOOTER}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>Assembly order — follow top to bottom</Text>
          </View>
          <Text style={styles.stamp}>STEP BY STEP</Text>
        </View>

        {steps.map((step, index) => (
          <View key={step.id} style={styles.step} wrap={false}>
            <View style={styles.stepNo}>
              <Text>{index + 1}</Text>
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepMeta}>{step.detail}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.note}>
          Snap rules: place the undercarriage first, then stack decks upward and modules outward. Every module in this
          manual is flush against its parent — the shipyard solves the snap points for you, so the in-game result
          matches the preview. Maximum 160 modules, and keep it to three storeys or handling suffers.
        </Text>

        <View style={styles.footer} fixed>
          <Text>{PAGE_FOOTER}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
