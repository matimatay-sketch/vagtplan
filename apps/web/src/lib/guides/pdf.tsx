import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Guide } from "./guides";
import { da } from "@/lib/i18n/da";

const ink = "#16212e";
const muted = "#4e5b67";
const primary = "#1d6a72";

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: ink,
    lineHeight: 1.45,
  },
  brand: {
    fontSize: 9,
    color: primary,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginBottom: 10 },
  lead: { fontSize: 12, color: muted, marginBottom: 18 },
  toc: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e5e1d8",
    paddingVertical: 10,
    marginBottom: 20,
  },
  tocItem: { fontSize: 10, marginBottom: 2 },
  section: { marginBottom: 18 },
  h2: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  p: { marginBottom: 6 },
  step: { flexDirection: "row", marginBottom: 3 },
  stepNo: { width: 16, fontFamily: "Helvetica-Bold", color: primary },
  stepText: { flex: 1 },
  tip: { marginTop: 6, padding: 8, backgroundColor: "#eef0fb", borderRadius: 4, fontSize: 10 },
  imageBox: { marginTop: 8, alignItems: "center" },
  image: {
    maxHeight: 300,
    objectFit: "contain",
    borderWidth: 1,
    borderColor: "#e5e1d8",
    borderRadius: 4,
  },
  caption: { fontSize: 8.5, color: muted, marginTop: 3 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.5,
    color: muted,
  },
});

function picture(file: string): Buffer | null {
  try {
    return readFileSync(join(process.cwd(), "public/vejledninger", file));
  } catch {
    return null; // A missing screenshot leaves out the picture, not the guide.
  }
}

function GuideDocument({ guide, date }: { guide: Guide; date: string }) {
  const t = da.guides;
  return (
    <Document title={guide.title} author="Turnus" language="da">
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>TURNUS · {t.pdfLabel.toUpperCase()}</Text>
        <Text style={s.title}>{guide.title}</Text>
        <Text style={s.lead}>{guide.lead}</Text>
        <View style={s.toc}>
          {guide.sections.map((sec, i) => (
            <Text key={sec.id} style={s.tocItem}>
              {i + 1}. {sec.title}
            </Text>
          ))}
        </View>
        {guide.sections.map((sec, i) => {
          const img = sec.image ? picture(sec.image) : null;
          return (
            <View key={sec.id} style={s.section}>
              <Text style={s.h2} minPresenceAhead={60}>
                {i + 1}. {sec.title}
              </Text>
              {sec.text.map((p, j) => (
                <Text key={j} style={s.p}>
                  {p}
                </Text>
              ))}
              {(sec.steps ?? []).map((step, j) => (
                <View key={j} style={s.step}>
                  <Text style={s.stepNo}>{j + 1}.</Text>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
              {sec.tip ? <Text style={s.tip}>{sec.tip}</Text> : null}
              {img ? (
                <View style={s.imageBox} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images have no alt; the caption carries it */}
                  <Image src={img} style={s.image} />
                  <Text style={s.caption}>{sec.imageAlt}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
        <View style={s.footer} fixed>
          <Text>
            {guide.title} · {date}
          </Text>
          <Text render={({ pageNumber, totalPages }) => t.pageOf(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}

/** The guide as a PDF (A4), with the same text and screenshots as the page. */
export function renderGuidePdf(guide: Guide, date: string): Promise<Buffer> {
  return renderToBuffer(<GuideDocument guide={guide} date={date} />);
}
