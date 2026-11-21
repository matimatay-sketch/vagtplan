# Udrulning i skyen (testmiljø)

Turnus kører som to dele:

- **Supabase** (EU, Frankfurt): database, login, filer (kvitteringer) og adgangskontrol.
- **Vercel** (region `fra1`, Frankfurt): webappen.

Databaseændringer lægges op automatisk af GitHub-workflowet `Deploy database` (`.github/workflows/deploy-db.yml`), når der merges til `main`.

Del aldrig nøgler eller adgangskoder i chat eller i koden. De indtastes kun i Supabase, Vercel og GitHub.

## 1. Supabase: forbindelsen til databasen

1. Åbn projektet i Supabase og klik **Connect** øverst.
2. Vælg fanen **Connection string** og typen **Session pooler**.
   - Ikke "Direct connection", som kun virker med IPv6.
3. Kopiér strengen, og erstat `[YOUR-PASSWORD]` med databasens adgangskode.
4. I GitHub åbner du repoet og går til **Settings → Secrets and variables → Actions → New repository secret**:
   - Navn: `SUPABASE_DB_URL`
   - Værdi: strengen fra trin 3
5. Under **Actions → Deploy database** klikker du **Run workflow**.
6. Når kørslen er grøn, er tabeller, regler og overenskomstskabeloner lagt op.

## 2. Supabase: login

Under **Authentication**:

1. **Sign In / Providers**: slå **Allow new users to sign up** fra.
   - Der er ingen selvbetjening. Brugere inviteres.
2. **URL Configuration**:
   - **Site URL**: webappens adresse fra Vercel, fx `https://turnus-test.vercel.app`. Sættes efter trin 4.
   - **Redirect URLs**: tilføj `https://turnus-test.vercel.app/**`.
3. **Emails → Templates**: indsæt de danske skabeloner fra `supabase/templates/` med disse emner:

   | Skabelon        | Emne                         | Fil                 |
   | --------------- | ---------------------------- | ------------------- |
   | Invite user     | `Du er inviteret til Turnus` | `invite.html`       |
   | Magic link      | `Dit login-link`             | `magic_link.html`   |
   | Confirm sign up | `Bekræft din e-mail`         | `confirmation.html` |

   Skabelonerne bruger linket `/auth/callback?token_hash=…`, som appen forventer.

## 3. Supabase: nøgler til webappen

Under **Project Settings → API Keys** finder du:

- **Project URL** (`https://<ref>.supabase.co`). Den står også under **Project Settings → Data API**.
- **Publishable key** (`sb_publishable_…`). Den må gerne ligge i browseren.
- **Secret key** (`sb_secret_…`). Kun til serveren, og den må aldrig deles.

## 4. Vercel: webappen

1. Vælg **Add New → Project**, og importér GitHub-repoet `vagtplan`.
2. **Root Directory**: `apps/web`. Framework bliver fundet automatisk (Next.js).
3. **Environment Variables**:

   | Navn                                   | Værdi                                                  |
   | -------------------------------------- | ------------------------------------------------------ |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Project URL                                            |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key                                        |
   | `SUPABASE_SECRET_KEY`                  | Secret key                                             |
   | `NEXT_PUBLIC_SITE_URL`                 | Webappens adresse, fx `https://turnus-test.vercel.app` |
   | `ANTHROPIC_API_KEY` (valgfri)          | Kun hvis AI-assistenten skal bruges                    |

| `CRON_SECRET` (valgfri) | En lang tilfældig tekst. Beskytter genforsøg af webhooks og e-mails |
| `SMTP_URL` (valgfri) | Mailudbyderens SMTP, fx `smtps://bruger:kode@smtp.udbyder.eu:465`. Bruges til e-mails om nye beskeder |
| `EMAIL_FROM` (valgfri) | Afsender, fx `Turnus <no-reply@ditdomæne.dk>` |

4. Klik **Deploy**.
5. Når adressen kendes, sætter du `NEXT_PUBLIC_SITE_URL` og Supabase' **Site URL** og **Redirect URLs** til den. Til sidst vælger du **Redeploy** i Vercel.

## 5. Den første platformsadministrator

Platformsadministratoren opretter kunder på `/platform`. Det er den eneste bruger, der oprettes manuelt.

1. I Supabase går du til **Authentication → Users → Add user → Create new user**.
   - Indtast din e-mail og en stærk adgangskode.
   - Sæt flueben i **Auto Confirm User**.
2. I **SQL Editor** kører du dette, med din e-mail indsat:

   ```sql
   insert into public.platform_admin (user_id)
   select id from auth.users where email = 'din@email.dk';
   ```

3. Log ind på webappen. Du sendes til `/platform`, hvor du opretter en testkunde og inviterer dens administrator.

## E-mail

Supabase' indbyggede e-mail sender kun til projektets egne medlemmer og har en lav grænse pr. time. Det er nok til at teste med din egen e-mail.

Før rigtige brugere inviteres, skal der sættes en rigtig mailudbyder op under **Authentication → Emails → SMTP Settings**. Vælg en udbyder med EU-datacenter.

## Drift

- **Nye databaseændringer**: merges til `main`, hvorefter `Deploy database` kører af sig selv.
- **Gratis planer**:
  - Supabase pauser et gratis projekt efter en uge uden aktivitet. Det startes igen i dashboardet.
  - Vercels gratis plan (Hobby) må ikke bruges kommercielt. Til rigtige kunder kræves Pro.
- **Webhooks**: sendes med det samme efter handlingen. Genforsøg sendes af Vercel Cron (`/api/cron/webhooks`). På gratis-planen kører det kun én gang i døgnet, og på Pro kan det sættes hyppigere i `apps/web/vercel.json`.
- **E-mails om beskeder**: sendes kun, når `SMTP_URL` er sat, og afdelingen har slået e-mail til under Afdelinger. Brug samme EU-udbyder som til Supabase' SMTP. Uden `SMTP_URL` venter e-mailene i køen, og beskederne ses kun i appen. Genforsøg sendes af samme cron som webhooks.
- **AI-assistenten**: kræver `ANTHROPIC_API_KEY` og en databehandleraftale (se `docs/jura-todo.md` nr. 32).
