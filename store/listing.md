# Chrome Web Store: teksten voor de vermelding

Invullen op https://chrome.google.com/webstore/devconsole (eenmalig 5 dollar registratie).
Upload: `dist/maps-schaalreferentie-1.1.0.zip`. Categorie: Productiviteit (of Tools). Taal: Nederlands.

## Naam (max 45 tekens)

Maps schaalreferentie

## Korte omschrijving (max 132 tekens)

Zie hoe groot iets is op Google Maps: Nederland, je provincie, gemeente, wijk of buurt op dezelfde schaal als de kaart.

## Uitgebreide omschrijving

Je kijkt op Google Maps naar een stad aan de andere kant van de wereld, een eiland, een haven, een natuurgebied. Hoe groot is dat eigenlijk? Het schaalbalkje rechtsonder helpt weinig: "2 km" zegt niet veel als je geen gevoel hebt voor 2 km.

Deze extensie tekent rechtsonder in Google Maps een vorm die je wél kent, op precies dezelfde schaal als de kaart die je op dat moment ziet.

Ver uitgezoomd zie je een klein Nederland. Zoom je in, dan groeit Nederland mee. Past het niet meer in het venster, dan schakelt de extensie over op je provincie, daarna je gemeente, je wijk, je buurt, een vierkante kilometer en ten slotte een voetbalveld. Zo heb je altijd een maat die je kent naast wat je bekijkt.

Wat je kunt instellen

- Vul je adres in: je gemeente, wijk en buurt worden opgehaald uit de CBS-kaarten (via PDOK) en krijgen een stipje op je adres. Alleen Nederlandse adressen.
- Bewaar elk gebied ter wereld als eigen referentie: zoom erop in tot het je scherm vult en sla het op. Werkt ook buiten Nederland.
- Zet referenties aan of uit, kies de grootte van het venster en sleep het naar waar je het wilt.
- Klik op het venster om zelf een kleinere referentie te kiezen.

Werkt in de kaart-, satelliet- en 3D-weergave van Google Maps (in 3D bij benadering).

Privacy

De extensie verzamelt niets en stuurt niets naar de maker. Het enige netwerkverkeer is de adresopzoeking bij PDOK (de Nederlandse overheidsdienst voor geo-informatie), en alleen als je zelf een adres invult. Je adres en de omtrekken van je gebieden blijven op je eigen computer. Instellingen zoals vensterformaat en eigen uitsnedes worden via je Chrome-profiel gesynchroniseerd, zoals bij elke extensie.

Bronnen: CBS Gebiedsindelingen 2024 en CBS Wijk- en buurtkaart 2024 via PDOK. Google Maps is een merk van Google LLC; deze extensie is daar niet aan verbonden.

## Privacyverklaring (verplicht veld "Privacy practices")

- Single purpose: toont een schaalreferentie op Google Maps.
- Permission justification "storage": bewaart instellingen en opgeslagen referentiegebieden.
- Host permission api.pdok.nl / service.pdok.nl: opzoeken van adres en gebiedsomtrekken wanneer de gebruiker een adres invult.
- Data usage: "Location" aanvinken (het door de gebruiker ingevulde adres), met de verklaring dat de data niet wordt verkocht, niet voor andere doelen wordt gebruikt en niet wordt doorgegeven behalve aan PDOK voor de opzoeking.
- Remote code: nee.
- Privacy policy URL: https://github.com/HerberttenHave/maps-schaalreferentie/blob/main/store/privacy.md

## Afbeeldingen

- Icoon 128 x 128: `extension/icons/icon128.png` (mag mooier; de store toont dit groot).
- Minstens één screenshot van 1280 x 800, PNG. Twee staan klaar in `store/screenshots/` (Nederland naast Japan, Binnenstad naast Manhattan), gemaakt met `tools/screenshot.js`. Nieuwe maken: `MSR_BROWSER="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" node tools/screenshot.js store/screenshots "Straat 1, Plaats"` (Google Chrome zelf laadt sinds versie 137 geen uitgepakte extensies meer vanaf de opdrachtregel, Edge wel). Handmatig kan ook: F12, Ctrl+Shift+M, 1280 x 800, "Capture screenshot".
- Optioneel: promotietegel 440 x 280.

## Zichtbaarheid

Kies "Niet vermeld" (unlisted) als je hem alleen met bekenden wilt delen: alleen wie de link heeft kan installeren, er is geen zoekvermelding. Later omzetten naar openbaar kan altijd.

## Engelse variant (optioneel, voor een tweede taal in de vermelding)

Name: Maps scale reference
Summary: See how big things are on Google Maps: your country, province, city or neighbourhood drawn at the map's current scale.
Description: Draws a shape you know (the Netherlands, your province, municipality, district, neighbourhood, a square kilometre, a football pitch) in the corner of Google Maps, at exactly the scale of the map you are looking at. Zoom out and the shape shrinks; zoom in and it grows until a smaller one takes over. Enter a Dutch address to get your own municipality, district and neighbourhood (looked up at PDOK, the Dutch national geo service), or save any area in the world as a custom reference. Nothing is collected or sent to the author.
