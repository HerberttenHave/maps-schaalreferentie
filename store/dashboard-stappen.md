# Chrome Web Store: stappen in de Developer Dashboard

Dashboard: https://chrome.google.com/webstore/devconsole
Bestanden: nieuwste zip in `dist\` (nu `maps-schaalreferentie-1.1.6.zip`), screenshots in `store\screenshots\`, teksten in `store\listing.md`.

## 1. Item aanmaken

1. Klik rechtsboven op **New item** (Nieuw item).
2. Sleep de nieuwste zip uit `C:\Users\htenh\maps-schaalreferentie\dist\` in het vak, of klik Browse en kies het bestand. Klik **Upload**.
3. Het item opent met vier tabbladen links: Package, Store listing, Privacy, Distribution.

## 2. Store listing

- **Title**: komt uit de manifest (Maps schaalreferentie).
- **Summary**: Zie hoe groot iets is op Google Maps: Nederland, je provincie, gemeente, wijk of buurt op dezelfde schaal als de kaart.
- **Description**: de tekst onder "Uitgebreide omschrijving" in `store\listing.md` (van "Je kijkt op Google Maps..." tot en met de regel over Google LLC).
- **Category**: Productivity > Tools (of Workflow & Planning als Tools ontbreekt).
- **Language**: Nederlands.
- **Store icon**: `extension\icons\icon128.png` (vaak al overgenomen uit de zip).
- **Screenshots**: `store\screenshots\1-nederland-japan.png` en `store\screenshots\2-gemeente-manhattan.png` (1280 x 800).
- **Promo tile** en **video**: overslaan.
- **Official URL / Homepage**: https://github.com/HerberttenHave/maps-schaalreferentie
- **Support URL**: https://github.com/HerberttenHave/maps-schaalreferentie/issues
- Klik **Save draft** (rechtsboven).

## 3. Privacy

- **Single purpose**: Toont rechtsonder in Google Maps een bekende vorm (Nederland, provincie, gemeente, wijk, buurt) op de schaal van de kaart, zodat de gebruiker de grootte van wat hij bekijkt kan inschatten.
- **Permission justification, storage**: Bewaart instellingen (vensterformaat, positie, aan/uit) en de door de gebruiker opgeslagen referentiegebieden.
- **Host permission justification** (api.pdok.nl, service.pdok.nl): Zoekt het door de gebruiker ingevulde adres op bij PDOK (Nederlandse overheidsdienst voor geo-informatie) en haalt de omtrekken van gemeente, wijk en buurt op. Alleen op verzoek van de gebruiker.
- **Are you using remote code?**: No.
- **Data usage**: alleen **Location** aanvinken (het adres dat de gebruiker zelf invult). Daaronder de drie verklaringen aanvinken: niet verkopen, niet voor andere doelen, niet voor kredietwaardigheid of leningen.
- **Privacy policy URL**: https://github.com/HerberttenHave/maps-schaalreferentie/blob/main/store/privacy.md
- Klik **Save draft**.

## 4. Distribution

- **Payment**: Free.
- **Visibility**: **Unlisted** (alleen met de link te vinden). Later kun je dit op Public zetten.
- **Distribution regions**: All regions.
- Klik **Save draft**.

## 5. Indienen

- Rechtsboven **Submit for review**. Laat "Publish automatically after it has passed review" aan staan, dan gaat hij vanzelf live.
- Google's review duurt meestal één tot enkele dagen; je krijgt een e-mail. Daarna staat de link op het tabblad Store listing bovenaan (chromewebstore.google.com/detail/...). Die link is de knop "Toevoegen aan Chrome" voor iedereen.

## Daarna

- De link in `store\whatsapp.md`, de README en de twee concept-mails vervangen door de store-link.
- Nieuwe versie uitbrengen: versienummer in `extension\manifest.json` ophogen, `tools\package.ps1` draaien, op het tabblad Package de nieuwe zip uploaden, opnieuw indienen.

## Nieuwe versie na goedkeuring (1.1.0 is ingediend, 1.1.6 staat klaar)

1. Open het item in de dashboard, tabblad **Package**, klik **Upload new package** en kies de nieuwste zip uit `dist\`.
2. Tabblad **Store listing**: vervang de twee screenshots door de nieuwe uit `store\screenshots\` (transparante omtrek) en plak de bijgewerkte omschrijving uit `store\listing.md`.
3. **Submit for review**. Een update wordt meestal sneller beoordeeld dan een eerste versie.
