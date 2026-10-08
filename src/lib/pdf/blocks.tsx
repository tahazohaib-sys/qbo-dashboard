// Reusable layout primitives for the Financial Analysis PDF — the report-level
// equivalent of the dashboard's Panel/ChartCard/KpiCard components, rebuilt for
// a printed page instead of the browser.

import React from "react";
import { View, Text, Link, StyleSheet } from "@react-pdf/renderer";
import { COLORS, FONT } from "./theme";

export const styles = StyleSheet.create({
  page: {
    fontFamily: FONT.regular,
    fontSize: 9.5,
    color: COLORS.body,
    backgroundColor: COLORS.page,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.faint,
    borderTopWidth: 0.75,
    borderTopColor: COLORS.border,
    paddingTop: 6,
  },
  header: {
    position: "absolute",
    top: 22,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.faint,
  },
});

export function ReportChrome({
  companyName,
  pageLabel,
}: {
  companyName: string;
  pageLabel: string;
}) {
  return (
    <React.Fragment>
      <View style={styles.header} fixed>
        <Text>{companyName} · Financial Analysis</Text>
        <Text>{pageLabel}</Text>
      </View>
      <View style={styles.footer} fixed>
        <Text>Confidential — prepared for internal use only</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </React.Fragment>
  );
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  subtitle,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View id={id} style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 8, letterSpacing: 1.4, color: COLORS.brand, fontFamily: FONT.bold, textTransform: "uppercase" }}>
        {eyebrow}
      </Text>
      <Text style={{ fontSize: 17, fontFamily: FONT.bold, color: COLORS.ink, marginTop: 3 }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: 9, color: COLORS.muted, marginTop: 3 }}>{subtitle}</Text> : null}
      <View style={{ height: 2, backgroundColor: COLORS.brand, width: 34, marginTop: 8, borderRadius: 1 }} />
    </View>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: COLORS.ink, marginTop: 16, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 9.5, color: COLORS.body, lineHeight: 1.5 }}>{children}</Text>;
}

/* --------------------------------- KPI tiles --------------------------------- */

export type KpiTileProps = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  caption?: string;
  linkTo?: string;
};

export function KpiTile({ label, value, tone = "neutral", caption, linkTo }: KpiTileProps) {
  const valueColor = tone === "positive" ? COLORS.positive : tone === "negative" ? COLORS.negative : COLORS.ink;
  const body = (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 0,
        backgroundColor: COLORS.panel,
        borderWidth: 0.75,
        borderColor: COLORS.border,
        borderRadius: 5,
        paddingVertical: 9,
        paddingHorizontal: 10,
      }}
      wrap={false}
    >
      <Text style={{ fontSize: 7.5, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
      <Text style={{ fontSize: 13.5, fontFamily: FONT.bold, color: valueColor, marginTop: 4 }}>{value}</Text>
      {caption ? <Text style={{ fontSize: 7.5, color: COLORS.faint, marginTop: 3 }}>{caption}</Text> : null}
      {linkTo ? (
        <Link src={linkTo} style={{ fontSize: 7.5, color: COLORS.brand, marginTop: 4, textDecoration: "none" }}>
          View details →
        </Link>
      ) : null}
    </View>
  );
  return body;
}

export function KpiGrid({ tiles }: { tiles: KpiTileProps[] }) {
  return <View style={{ flexDirection: "row", gap: 8 }}>{tiles.map((t) => <KpiTile key={t.label} {...t} />)}</View>;
}

/* ----------------------------------- Table ----------------------------------- */

export type TableColumn = {
  key: string;
  header: string;
  width?: number; // flex-grow weight; omit for auto
  align?: "left" | "right" | "center";
};

export function DataTable({
  columns,
  rows,
  totalRow,
  dense,
}: {
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
  totalRow?: Record<string, string>;
  dense?: boolean;
}) {
  const pad = dense ? 4.5 : 6;
  return (
    <View style={{ borderWidth: 0.75, borderColor: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", backgroundColor: COLORS.ink }} wrap={false}>
        {columns.map((c) => (
          <Text
            key={c.key}
            style={{
              flexGrow: c.width ?? 1,
              flexBasis: 0,
              fontSize: 7.5,
              fontFamily: FONT.bold,
              color: "#ffffff",
              paddingVertical: pad,
              paddingHorizontal: 7,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              textAlign: c.align ?? "left",
            }}
          >
            {c.header}
          </Text>
        ))}
      </View>

      {rows.map((row, i) => (
        <View
          key={i}
          wrap={false}
          style={{
            flexDirection: "row",
            backgroundColor: i % 2 === 1 ? COLORS.panel : COLORS.page,
            borderTopWidth: 0.5,
            borderTopColor: COLORS.border,
          }}
        >
          {columns.map((c) => (
            <Text
              key={c.key}
              style={{
                flexGrow: c.width ?? 1,
                flexBasis: 0,
                fontSize: 8.5,
                color: COLORS.body,
                paddingVertical: pad,
                paddingHorizontal: 7,
                textAlign: c.align ?? "left",
              }}
            >
              {row[c.key] ?? ""}
            </Text>
          ))}
        </View>
      ))}

      {totalRow ? (
        <View
          wrap={false}
          style={{
            flexDirection: "row",
            backgroundColor: COLORS.brandSoft,
            borderTopWidth: 1,
            borderTopColor: COLORS.brand,
          }}
        >
          {columns.map((c) => (
            <Text
              key={c.key}
              style={{
                flexGrow: c.width ?? 1,
                flexBasis: 0,
                fontSize: 8.5,
                fontFamily: FONT.bold,
                color: COLORS.ink,
                paddingVertical: pad,
                paddingHorizontal: 7,
                textAlign: c.align ?? "left",
              }}
            >
              {totalRow[c.key] ?? ""}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------- Bullet list --------------------------------- */

export function BulletList({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "positive" | "negative" | "caution" }) {
  if (!items.length) return null;
  const dotColor =
    tone === "positive" ? COLORS.positive : tone === "negative" ? COLORS.negative : tone === "caution" ? COLORS.caution : COLORS.brand;
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", marginTop: 5 }} wrap={false}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor, marginTop: 4, marginRight: 7 }} />
          <Text style={{ fontSize: 9, color: COLORS.body, lineHeight: 1.45, flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function Callout({ title, children, tone = "neutral" }: { title: string; children: React.ReactNode; tone?: "neutral" | "positive" | "negative" | "caution" }) {
  const accent = tone === "positive" ? COLORS.positive : tone === "negative" ? COLORS.negative : tone === "caution" ? COLORS.caution : COLORS.brand;
  return (
    <View
      style={{
        borderLeftWidth: 2.5,
        borderLeftColor: accent,
        backgroundColor: COLORS.panel,
        borderRadius: 3,
        paddingVertical: 9,
        paddingHorizontal: 12,
        marginTop: 10,
      }}
    >
      <Text style={{ fontSize: 8.5, fontFamily: FONT.bold, color: COLORS.ink, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 0.75, backgroundColor: COLORS.border, marginVertical: 16 }} />;
}
