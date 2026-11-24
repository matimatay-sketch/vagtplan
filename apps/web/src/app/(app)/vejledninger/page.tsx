import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, FileDown } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext } from "@/lib/auth";
import { guidesFor } from "@/lib/guides/guides";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Vejledninger" };

export default async function GuidesPage() {
  const ctx = await requireContext();
  const t = da.guides;
  return (
    <>
      <PageHeader title={t.title} help={t.help} />
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="guides">
        {guidesFor(ctx.permissions).map((g) => (
          <li key={g.slug} data-guide={g.slug}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{g.title}</CardTitle>
                <CardDescription>
                  {g.lead} {t.sections(g.sections.length)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/vejledninger/${g.slug}`}>
                    <BookOpen /> {t.read}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/vejledninger/${g.slug}/pdf`} download>
                    <FileDown /> {t.pdf}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
