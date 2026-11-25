import type { PermissionKey } from "@/lib/permissions";

/**
 * The user guides (vejledninger). One source for the page and the PDF. Images
 * are screenshots in public/vejledninger, made with demo data by
 * `pnpm guides:screenshots` (e2e/guide-screenshots.spec.ts).
 */
export type GuideSection = {
  id: string;
  title: string;
  text: string[];
  steps?: string[];
  tip?: string;
  /** File name in public/vejledninger. */
  image?: string;
  imageAlt?: string;
};

export type Guide = {
  slug: string;
  title: string;
  lead: string;
  /** Shown to users with any of these rights (empty: everyone). */
  anyOf: PermissionKey[];
  sections: GuideSection[];
};

export const GUIDES: Guide[] = [
  {
    slug: "medarbejder",
    title: "Turnus for medarbejdere",
    lead: "Sådan ser du din vagtplan, stempler ind og ud, søger fri og skriver med dine kolleger og din leder.",
    anyOf: [],
    sections: [
      {
        id: "kom-i-gang",
        title: "Kom i gang",
        text: [
          "Du får en invitation på e-mail fra din arbejdsgiver. Klik på linket, og vælg en adgangskode. Derefter logger du ind med din e-mail og adgangskoden.",
          "Turnus virker i browseren på computer og telefon. På telefonen kan du også hente appen i App Store eller Google Play, eller føje Turnus til hjemmeskærmen fra browseren.",
        ],
        steps: [
          "Åbn linket i invitationen, og vælg en adgangskode.",
          "Log ind med din e-mail og adgangskoden.",
          "Gå til Min profil, og slå notifikationer til, så du får besked om nye vagter og beskeder.",
        ],
        tip: 'Tryk på "?" øverst for at slå hjælpetekster til. Så viser hver side en forklaring.',
      },
      {
        id: "oversigt",
        title: "Oversigten",
        text: [
          "Oversigten er det første, du ser. Her kan du stemple ind og ud og se dine næste vagter, opslagstavlen og kollegernes fødselsdage.",
          "På telefonen ligger menuen i bunden: Oversigt, Min vagtplan, Tid, Beskeder og Mere.",
        ],
        image: "medarbejder-oversigt.jpg",
        imageAlt: "Oversigten på en telefon med knappen Stempl ind",
      },
      {
        id: "stempling",
        title: "Stempl ind og ud",
        text: [
          "Stempl ind, når du møder, og ud, når du går. Det virker også uden netværk: stemplingen gemmes på telefonen og sendes, når der er forbindelse igen.",
          "Kommer eller går du mere end et par minutter før eller efter vagten, eller stempler du uden en vagt, spørger Turnus om årsagen. Vælg den, der passer. Årsagen kan betyde, at tiden bliver til afspadsering eller fravær, så vælg den rigtige.",
          "Har din arbejdsgiver valgt, at man kun kan stemple på arbejdspladsen, beder Turnus om din placering, når du stempler. Turnus tjekker kun, om du er tæt på arbejdspladsen, og gemmer ikke din position. Er du for langt væk, bliver stemplingen ikke registreret.",
        ],
        steps: [
          "Tryk Stempl ind på Oversigt eller Tid.",
          "Vælg en årsag, hvis Turnus spørger, og tryk Stempl ind igen.",
          "Tryk Stempl ud, når du går.",
        ],
        image: "medarbejder-stempling.jpg",
        imageAlt: "Turnus spørger om årsagen til at stemple ind uden en vagt",
      },
      {
        id: "tid",
        title: "Registrér og ret din tid",
        text: [
          "Under Tid ser du dine registreringer for de sidste 14 dage. En vagt uden registrering kan du markere som gennemført som planlagt med ét tryk.",
          "Afviger tiden fra vagten, skriver du en begrundelse eller vælger en årsag. Når din leder har godkendt tiden, kan du ikke længere ændre den. Kontakt din leder, hvis den skal rettes.",
        ],
        steps: [
          "Gå til Tid.",
          "Tryk Gennemført som planlagt ved en vagt, eller Registrér tid for at skrive tiderne selv.",
          "Tryk på en registrering for at rette den, så længe den ikke er godkendt.",
        ],
      },
      {
        id: "vagtplan",
        title: "Din vagtplan og ønsker om fri",
        text: [
          "Min vagtplan viser dine offentliggjorte vagter uge for uge og de samlede timer. Under Tilgængelighed og ønsker kan du skrive, hvornår du gerne vil have fri eller arbejde. Din leder ser ønskerne, når vagtplanen lægges.",
          "Vil du have vagterne i telefonens kalender, laver du et kalenderlink under Min profil.",
        ],
        steps: [
          "Gå til Min vagtplan, og skift uge med pilene.",
          "Vælg dato og type under Tilgængelighed og ønsker, og tryk Tilføj.",
        ],
        image: "medarbejder-vagtplan.jpg",
        imageAlt: "Min vagtplan med ønsker om fri",
      },
      {
        id: "bytte",
        title: "Byt en vagt eller meld afbud",
        text: [
          "Kan du ikke tage en vagt, kan du foreslå en kollega at overtage den. Turnus kontrollerer reglerne, før forslaget sendes, og din leder godkender byttet.",
          "Er du syg eller forhindret, melder du afbud på vagten. Afbuddet går direkte til din leder.",
        ],
        steps: [
          "Tryk på vagten under Min vagtplan.",
          "Vælg Byt vagt, vælg kollegaen, og tryk Send forslaget. Eller vælg Meld afbud, skriv hvorfor, og tryk Send afbud til lederen.",
        ],
      },
      {
        id: "fravaer",
        title: "Søg om ferie og fravær",
        text: [
          "Under Fravær og ferie ser du dine saldi og dine ansøgninger. Du får besked, når din leder har godkendt eller afvist en ansøgning.",
        ],
        steps: [
          "Gå til Fravær og ferie.",
          "Vælg type og datoer under Søg om fravær.",
          "Tryk Send ansøgning.",
        ],
        image: "medarbejder-fravaer.jpg",
        imageAlt: "Fravær og ferie med saldi og ansøgning",
      },
      {
        id: "koersel",
        title: "Kørsel og udlæg",
        text: [
          "Under Kørsel og udlæg registrerer du kørsel i egen bil og udlæg med kvittering. Din leder godkender dem, og de kommer med i lønnen.",
        ],
        steps: [
          "Gå til Kørsel og udlæg (under Mere på telefonen).",
          "Udfyld turen eller udlægget, og vedhæft et billede af kvitteringen.",
        ],
      },
      {
        id: "beskeder",
        title: "Beskeder",
        text: [
          "Under Beskeder skriver du med din leder og, hvis din arbejdsplads tillader det, med dine kolleger. Forslag om vagtbytte, afbud og påmindelser kommer også her.",
        ],
        steps: [
          "Gå til Beskeder, og tryk Ny besked.",
          "Vælg modtagere, skriv beskeden, og tryk Send besked.",
        ],
        image: "medarbejder-beskeder.jpg",
        imageAlt: "Beskeder på en telefon",
      },
      {
        id: "profil",
        title: "Min profil: notifikationer og kalender",
        text: [
          "Under Min profil slår du notifikationer til på din telefon eller computer og vælger, hvad du vil have besked om. Notifikationen siger kun, hvem der har skrevet, aldrig selve beskeden.",
          "Med et kalenderlink vises dine vagter i telefonens kalender. Linket er personligt. Har du delt det ved en fejl, laver du et nyt, så det gamle holder op med at virke.",
        ],
        steps: [
          "Tryk Slå notifikationer til på denne enhed, og tillad notifikationer.",
          "Tryk Lav kalenderlink og derefter Føj til kalender.",
        ],
        image: "medarbejder-profil.jpg",
        imageAlt: "Notifikationer og kalenderlink på Min profil",
      },
    ],
  },
  {
    slug: "leder",
    title: "Turnus for ledere",
    lead: "Sådan lægger du vagtplanen, offentliggør den og godkender tid, fravær og vagtbytte.",
    anyOf: ["schedule.manage", "time.approve", "time.manage", "absence.approve"],
    sections: [
      {
        id: "overblik",
        title: "Dit overblik",
        text: [
          "Oversigten viser, hvad der venter på dig: tid og udlæg til godkendelse, åbne stemplinger og kladder i vagtplanen.",
          "Du ser de afdelinger, du er ansvarlig for. Mangler en afdeling, skal en administrator gøre dig ansvarlig for den.",
          "På telefonen har bundmenuen Oversigt, Vagtplan, Godkend tid og Beskeder. Resten ligger under Mere.",
        ],
        image: "leder-oversigt.jpg",
        imageAlt: "Lederens oversigt på en telefon",
      },
      {
        id: "planlaeg",
        title: "Planlæg vagter",
        text: [
          "Vagtplanen viser ugen pr. afdeling med en række pr. medarbejder. Nye vagter er kladder, som kun du ser, indtil ugen offentliggøres.",
          "Du kan flytte en vagt ved at trække den og kopiere den ved at holde Alt nede. Vagtskabeloner og Kopiér forrige uge sparer tid. Medarbejdernes ønsker om fri vises i planen.",
        ],
        steps: [
          "Gå til Vagtplan, og vælg afdeling og uge.",
          "Tryk Ny vagt i medarbejderens celle, udfyld start og slut, og tryk Gem vagt.",
          "Brug Kopiér forrige uge hertil for at starte fra sidste uges plan.",
        ],
        tip: "Tryk Lav forslag for at få Turnus til at fordele vagtskabelonerne på ugen, så hver medarbejder kommer tæt på sin timenorm. Fravær og ønsker om fri respekteres, og reglerne kontrolleres. Vagterne bliver kladder, som du kan rette eller kassere.",
        image: "leder-vagtplan.jpg",
        imageAlt: "Vagtplanen for en uge med vagter pr. medarbejder",
      },
      {
        id: "offentliggoer",
        title: "Offentliggør ugen",
        text: [
          "Når du offentliggør, kontrollerer Turnus reglerne fra overenskomsten og loven: hviletid, fridøgn, regler for unge og jeres egne regler. Advarsler kan offentliggøres. Blokerende brud kræver en begrundelse og den rette rettighed.",
          "Medarbejderne får en notifikation, når deres vagter ændres.",
        ],
        steps: [
          "Tryk Offentliggør uge.",
          "Læs brudene, og skriv en begrundelse ved dem, der kræver det.",
          "Bekræft. Medarbejderne kan nu se vagterne.",
        ],
      },
      {
        id: "godkend-tid",
        title: "Godkend tid",
        text: [
          "Godkend tid viser registreringerne for en periode med de lønarter, tiden udløser. Filtrér på afdeling, status, overenskomst eller afvigelser. Afvigelser fra vagten vises med medarbejderens årsag eller begrundelse.",
          "Godkendt tid kan fortrydes, så længe lønperioden er åben. En rettelse af godkendt tid laves som en ny version, så det gamle bliver i historikken.",
          "Mangler en registrering, kan du registrere for medarbejderen: som planlagt, med andre tider eller uden en vagt.",
        ],
        steps: [
          "Gå til Godkend tid, og vælg perioden.",
          "Sæt flueben ved registreringerne, eller brug Vælg alle, der venter.",
          "Tryk Godkend valgte.",
        ],
        image: "leder-godkend-tid.jpg",
        imageAlt: "Godkend tid med filtre og registreringer",
      },
      {
        id: "godkend-fravaer",
        title: "Godkend fravær",
        text: [
          "Under Godkend fravær ser du ansøgningerne fra dine medarbejdere og deres saldi. Du kan også selv registrere fravær, fx sygdom.",
        ],
        steps: [
          "Gå til Godkend fravær.",
          "Tryk Godkend eller Afvis ved ansøgningen, og skriv evt. en note.",
        ],
        image: "leder-godkend-fravaer.jpg",
        imageAlt: "Godkend fravær med ansøgninger",
      },
      {
        id: "bytte-afbud",
        title: "Vagtbytte og afbud",
        text: [
          "Forslag om vagtbytte og afbud kommer under Beskeder. Når kollegaen har sagt ja til et bytte, godkender eller afviser du det. Ved et afbud kan du finde en afløser i vagtplanen.",
        ],
        steps: ["Åbn beskeden.", "Tryk Godkend byttet eller Afvis byttet."],
      },
      {
        id: "paamindelser",
        title: "Påmindelser og stedfortrædere",
        text: [
          "Under Godkend tid kan du sætte påmindelser op, fx om manglende registreringer eller tid, der venter på godkendelse. De sendes med det samme eller automatisk på udvalgte ugedage.",
          "Skal du på ferie, kan du udpege en stedfortræder, som godkender for dig i perioden.",
        ],
      },
      {
        id: "rapporter",
        title: "Rapporter",
        text: [
          "Under Rapporter finder du medarbejdere, registreret tid, fravær, planlagte vagter og normtid for en periode. Rapporterne kan hentes som CSV og åbnes i Excel.",
        ],
      },
    ],
  },
  {
    slug: "administrator",
    title: "Turnus for administratorer",
    lead: "Sådan sætter du Turnus op: afdelinger, medarbejdere, rettigheder, overenskomster, løn og indlæsning fra fil.",
    anyOf: ["settings.manage", "employees.manage", "users.manage", "payroll.manage"],
    sections: [
      {
        id: "afdelinger",
        title: "Afdelinger og ansvarlige",
        text: [
          'Opret afdelingerne under Afdelinger. Gør lederne ansvarlige for deres afdelinger: en leder med rettigheder for "afdelinger, man er ansvarlig for" ser kun de afdelinger.',
        ],
      },
      {
        id: "medarbejdere",
        title: "Medarbejdere og kontrakter",
        text: [
          "Under Medarbejdere opretter du medarbejdere med afdeling og fødselsdato. Fødselsdatoen bruges til reglerne for unge under 18.",
          "En kontrakt knytter medarbejderen til en overenskomst med timer pr. uge, lønform og lønperiode. Uden en kontrakt kan der ikke beregnes løn.",
        ],
        steps: [
          "Tryk Ny medarbejder, og udfyld stamdata og afdeling.",
          "Opret en kontrakt på medarbejderens side.",
          "Tryk Invitér til login, så medarbejderen får en e-mail.",
        ],
        image: "admin-medarbejder.jpg",
        imageAlt: "En medarbejders side med kontrakt og invitation",
      },
      {
        id: "rettigheder",
        title: "Rettighedsprofiler",
        text: [
          "Adgang styres af rettighedsprofiler, fx Leder eller Medarbejder. En profil har rettigheder med et omfang: hele organisationen eller de afdelinger, brugeren er ansvarlig for.",
          "Ejer-profilen er låst og har alle rettigheder.",
        ],
      },
      {
        id: "indlaes",
        title: "Indlæs fra fil",
        text: [
          "Mange afdelinger, medarbejdere, vagter eller saldi kan indlæses fra en CSV-fil, fx fra Excel eller et tidligere system. Medarbejdere genkendes på medarbejdernummeret.",
          "Du ser, hvad der sker med hver linje, før noget gemmes. Har en linje en fejl, gemmes intet.",
        ],
        steps: [
          "Gå til Indlæs fra fil, og vælg typen.",
          "Tryk Hent skabelon, og udfyld den.",
          "Vælg filen, tryk Kontrollér filen, og tryk Indlæs, når der ikke er fejl.",
        ],
        image: "admin-indlaes.jpg",
        imageAlt: "Forhåndsvisning af en fil, før den indlæses",
      },
      {
        id: "opsaetning",
        title: "Opsætning",
        text: [
          "Under Opsætning sætter du virksomhedens regler: varsling, vagttillæg, afvigelsesårsager, normprocent, helligdage og egne regler, der gælder oven i overenskomsterne.",
          "Under Medarbejdernes muligheder slår du medarbejderønsker og stempling kun på arbejdspladsen til og fra. Arbejdspladserne (position og radius) opretter du under Arbejdspladser. Ønsker kan også slås til og fra for den enkelte afdeling under Afdelinger, og en medarbejder, der må stemple overalt, sættes på medarbejderen.",
          "Afvigelsesårsager bestemmer, hvad der sker med lønnen, når nogen kommer eller går før eller efter vagten: kun statistik, udbetaling, afspadsering eller fravær.",
        ],
        image: "admin-opsaetning.jpg",
        imageAlt: "Opsætning med afvigelsesårsager",
      },
      {
        id: "overenskomster",
        title: "Overenskomster",
        text: [
          "Overenskomsterne indeholder reglerne for arbejdstid, tillæg, overarbejde og fravær. Systemskabeloner kan ikke rettes. Lav en kopi eller en lokalaftale, og indtast jeres satser.",
          "Testuger med håndregnede forventninger viser, at reglerne regner rigtigt. En version, der er brugt i en afsluttet lønperiode, er låst. Ændringer laves så som en ny version.",
        ],
      },
      {
        id: "loen",
        title: "Lønperioder og løn",
        text: [
          "Under Løn beregner du lønnen for en periode ud fra godkendt tid, fravær, kørsel og udlæg. Ved hver lønlinje viser Hvorfor?, hvilken regel der gav den.",
          "Når lønnen er afstemt, afslutter du perioden. Derefter kan den ikke beregnes igen. Eksportér fil laver filen til lønsystemet ud fra en eksportskabelon.",
        ],
        steps: [
          "Gå til Løn, og vælg perioden.",
          "Tryk Beregn alle, og kontrollér lønlinjerne.",
          "Tryk Eksportér fil og derefter Afslut periode.",
        ],
        image: "admin-loen.jpg",
        imageAlt: "Løn-siden med lønperioder",
      },
      {
        id: "integrationer",
        title: "Integrationer",
        text: [
          "Under Integrationer laver du API-nøgler og webhooks, så lønsystem, stempelure og HR-system kan tale med Turnus.",
        ],
      },
    ],
  },
];

/** The guides a user sees: everyone gets the employee guide, the others by right. */
export function guidesFor(permissions: Partial<Record<PermissionKey, unknown>>): Guide[] {
  return GUIDES.filter(
    (g) => g.anyOf.length === 0 || g.anyOf.some((k) => permissions[k] !== undefined),
  );
}

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
