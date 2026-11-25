# Turnus som app i App Store og Google Play

Appen ligger i `apps/mobile` og er bygget med [Capacitor](https://capacitorjs.com). Den viser Turnus fra serveren, så alt, hvad medarbejdere og ledere kan i webappen, kan de også i appen, og en ny version af webappen når appen med det samme. Appen tilføjer:

- **push-notifikationer** via Firebase Cloud Messaging (FCM) på både iPhone og Android;
- tilbage-knappen på Android og en side, der vises uden netværk;
- splash-skærm og ikon.

Stempling uden netværk virker som i webappen (køen i telefonen).

Push i appen og push i browseren bruger samme kø og samme indstillinger på **Profil**. Medarbejderen vælger, hvad der skal give besked:

| Notifikation               | Hvornår                                      | Åbner           |
| -------------------------- | -------------------------------------------- | --------------- |
| Beskeder, vagtbytte, afbud | En ny besked i en samtale, man er med i      | Samtalen        |
| Ændringer i min vagtplan   | En offentliggørelse ændrer ens vagter        | Min vagtplan    |
| Svar på fravær og ferie    | Ferie eller fravær er godkendt eller afvist  | Fravær og ferie |
| Fravær, jeg skal godkende  | En medarbejder søger fravær (kun godkendere) | Godkend fravær  |

Notifikationer sendes gennem Apple og Google. Derfor indeholder de aldrig selve beskeden, kun hvem den er fra.

## Det skal du bruge

- En **Apple Developer**-konto (99 USD om året) og en **Mac med Xcode** til iPhone-appen.
- En **Google Play Console**-konto (25 USD én gang) og **Android Studio** til Android-appen.
- Et **Firebase**-projekt (gratis) til push.
- En **privatlivspolitik** på en offentlig adresse. Begge butikker kræver den (se `docs/jura-todo.md` nr. 42).
- Webappen kører på sin rigtige adresse med https, fx `https://app.turnus.dk`.

Nøgler og konfigurationsfiler deles aldrig i chat og lægges aldrig i git (`.gitignore` udelukker dem).

## 1. Firebase

1. Opret et projekt på [console.firebase.google.com](https://console.firebase.google.com). Slå Google Analytics fra.
2. Tilføj en **Android-app** med pakkenavnet `dk.turnus.app` (eller jeres eget, se trin 3). Hent `google-services.json`, og læg den i `apps/mobile/android/app/`.
3. Tilføj en **iOS-app** med samme bundle-id. Hent `GoogleService-Info.plist`, og læg den i `apps/mobile/ios/App/App/` (træk den ind i Xcode under App, så den kommer med i bygget).
4. **Apple-nøgle til push:** I Apple Developer under **Certificates, IDs & Profiles → Keys** laver du en nøgle med **Apple Push Notifications service (APNs)**. Upload `.p8`-filen i Firebase under **Project settings → Cloud Messaging → Apple app configuration**.
5. **Nøgle til serveren:** Under **Project settings → Service accounts** klikker du **Generate new private key**. Hele JSON-filens indhold sættes som `FCM_SERVICE_ACCOUNT` i Vercel. Filen gemmes ikke andre steder.

## 2. Byg appen

```bash
pnpm install
cd apps/mobile
TURNUS_APP_URL=https://app.turnus.dk TURNUS_APP_ID=dk.turnus.app pnpm sync
pnpm assets      # ikoner og splash-skærm fra assets/ (første gang og ved nyt logo)
```

`pnpm sync` skriver siden uden netværk med adressen og kopierer indstillingerne til de to native projekter. Kør den igen, når adressen, app-id'et eller plugins ændres.

### iPhone (på en Mac)

1. `pnpm ios` åbner projektet i Xcode.
2. Under **Signing & Capabilities** vælger du jeres team og tilføjer:
   - **Push Notifications**;
   - **Background Modes** med **Remote notifications** (står allerede i `Info.plist`).
3. Sæt **Version** og **Build**.
4. **Product → Archive**, og upload til App Store Connect.

### Android

1. `pnpm android` åbner projektet i Android Studio.
2. Sæt `versionCode` og `versionName` i `android/app/build.gradle`.
3. **Build → Generate Signed App Bundle** med jeres upload-nøgle. Gem nøglen sikkert, for den kan ikke erstattes uden Google.
4. Upload `.aab`-filen i Play Console.

## Test appen, før den kommer i butikkerne

`TURNUS_APP_URL` og `TURNUS_APP_ID` er ikke indstillinger i Vercel eller GitHub. De sættes i terminalen, når du bygger appen (se trin 2), og bestemmer, hvilken server appen åbner. Til en test kan du bruge Vercel-adressen for main eller for en forhåndsvisning, fx `TURNUS_APP_URL=https://vagtplan-xxx.vercel.app`.

- **Android på din egen telefon (gratis):** Slå udviklertilstand og USB-fejlfinding til på telefonen, tilslut den, og tryk ▶ (Run) i Android Studio. Uden telefon kan du vælge en emulator i Android Studio.
- **iPhone på din egen telefon:** Tilslut iPhonen, vælg den i Xcode, og tryk ▶. Med et gratis Apple-id virker appen i 7 dage og uden push. Push kræver Apple Developer-kontoen.
- **Testere uden kabel:** Upload bygget til **TestFlight** (App Store Connect) eller **Intern test** (Play Console), og inviter testerne via e-mail. Det kræver de betalte konti, men ikke at appen er godkendt til butikken.
- **Push:** virker først, når `google-services.json`/`GoogleService-Info.plist` ligger i projektet, og `FCM_SERVICE_ACCOUNT` er sat i Vercel for den server, appen åbner.

## 3. Butikkerne

Til begge butikker:

- **Navn:** Turnus. **Kategori:** Erhverv / Business.
- **Beskrivelse:** Vagtplan, stempling, fravær og beskeder for medarbejdere og ledere. Kun for virksomheder, der bruger Turnus. Man får adgang ved at blive inviteret af sin arbejdsgiver.
- **Skærmbilleder:** Oversigt, Min vagtplan, Tid (stempling), Beskeder og Profil fra en telefon.
- **Login til gennemgang:** Apple og Google skal kunne logge ind. Opret en demo-virksomhed på `/platform` med en medarbejder til formålet, og angiv login under **App Review Information** / **App access**.
- **Privatliv:**
  - Apple: **App Privacy**. Data: navn, e-mail, arbejdstider og beskeder (knyttet til brugeren, bruges til appens funktion, ikke til sporing).
  - Google: **Data safety** med samme oplysninger.
- **Konto-sletning:** Brugere oprettes af arbejdsgiveren, ikke i appen. Angiv, at sletning sker hos arbejdsgiveren (administratoren sletter medarbejderen i Turnus).

Apple afviser apps, der kun viser en hjemmeside (retningslinje 4.2). Turnus har native push, offline-stempling og offline-side. Nævn det i noten til gennemgangen.

## 4. Når appen er ude

- Ændringer i webappen kræver ingen ny app-version.
- En ny app-version er kun nødvendig ved nye plugins, nyt ikon, nyt app-id eller en ny Capacitor-version.
- Push virker først, når `FCM_SERVICE_ACCOUNT` er sat i Vercel. Test det på Profil: "Slå notifikationer til på denne enhed" og send en besked til dig selv fra en anden bruger.
