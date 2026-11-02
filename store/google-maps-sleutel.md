# Google Maps in de webversie: sleutel aanmaken

De webversie (https://herberttenhave.github.io/maps-schaalreferentie/) toont standaard OpenStreetMap. Met een Google Maps API-sleutel in `web/config.js` krijgen bezoekers onder **?** een keuze "OpenStreetMap / Google Maps" (kaart of satelliet). Zonder sleutel wordt niets van Google geladen en is de keuze onzichtbaar.

## 1. Sleutel aanmaken in Google Cloud Console (10 minuten)

1. Ga naar https://console.cloud.google.com/ en log in met je Google-account.
2. **Project**: klik bovenin op de projectkiezer, kies **Nieuw project**, noem het bijvoorbeeld `maps-schaalreferentie` en maak het aan. Selecteer het project.
3. **Facturering**: ga naar **Facturering** (Billing) en koppel een factureringsaccount (creditcard). Zonder factureringsaccount werkt geen enkele Google Maps-sleutel, ook niet binnen het gratis gebruik. Je kunt onder Facturering een **budgetwaarschuwing** instellen, bijvoorbeeld 5 euro per maand, zodat je een e-mail krijgt als het gebruik ooit boven het gratis deel komt.
4. **API inschakelen**: ga naar **API's en services > Bibliotheek**, zoek **Maps JavaScript API** en klik **Inschakelen**. Alleen deze API is nodig; de kaart laadt zoeken (Nominatim) en adressen (PDOK) elders.
5. **Sleutel maken**: ga naar **API's en services > Referenties** (Credentials), klik **Referenties maken > API-sleutel**. Kopieer de sleutel (begint met `AIza`).
6. **Sleutel beperken** (belangrijk, de sleutel staat openbaar in GitHub):
   - Klik op de nieuwe sleutel om hem te bewerken.
   - **Toepassingsbeperkingen**: kies **Websites** (HTTP-verwijzers) en voeg toe: `herberttenhave.github.io/*`. Wil je lokaal testen, voeg dan ook `localhost:*/*` en `127.0.0.1:*/*` toe.
   - **API-beperkingen**: kies **Sleutel beperken** en vink alleen **Maps JavaScript API** aan.
   - Opslaan. Het duurt tot 5 minuten voor de beperkingen gelden.

Met deze twee beperkingen kan iemand die de sleutel uit GitHub kopieert er niets mee op een andere site of in een andere Google-dienst.

## 2. Wat het kost

Google Maps Platform rekent per "kaartlading" (elke keer dat de pagina de kaart opbouwt). Sinds maart 2025 geldt per API een gratis maandelijks gebruik in plaats van het oude tegoed van 200 dollar: voor de Maps JavaScript API (Dynamic Maps) zijn dat **10.000 kaartladingen per maand gratis**, daarboven ongeveer 7 dollar per 1.000 ladingen. Het oude tegoed kwam neer op ongeveer 28.000 ladingen per maand; dat getal kom je nog vaak tegen maar geldt niet meer. Controleer de actuele cijfers op https://mapsplatform.google.com/pricing/ voordat je de sleutel deelt.

Voor een link in WhatsApp-groepen blijf je ruim binnen het gratis deel: 10.000 ladingen zijn ongeveer 330 kaartopeningen per dag. Alleen bezoekers die zelf Google Maps kiezen tellen mee; OpenStreetMap-bezoekers kosten niets. Het budgetalarm uit stap 3 vangt uitschieters op.

## 3. Sleutel in de webversie zetten

1. Open `web/config.js` en vul de sleutel in:

   ```js
   window.MSR_CONFIG = { googleMapsKey: 'AIza...' };
   ```

2. Commit en push naar `main`. GitHub Pages bouwt binnen een paar minuten opnieuw.
3. Open de webversie, tik op **?** en kies **Google Maps**. De keuze wordt per telefoon onthouden (localStorage); OpenStreetMap blijft de standaard voor nieuwe bezoekers.

Werkt de sleutel niet (verkeerde beperking, facturering niet gekoppeld), dan meldt de kaart "Google Maps kon niet laden" en valt hij terug op OpenStreetMap. Kijk dan in Cloud Console onder **API's en services > Maps JavaScript API > Statistieken** naar de foutmeldingen.

## 4. Sleutel intrekken

Verwijder de sleutel in Cloud Console onder **Referenties**, of maak `googleMapsKey` weer leeg en push. Vanaf dat moment laadt de webversie niets meer van Google.
