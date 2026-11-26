# Bassment Hub

App (PWA) per il registro di [@andreadeblasiobass](https://instagram.com/andreadeblasiobass): calendario, repertorio, dischi, numeri, Check.

- **Frontend**: `index.html` (+ `sw.js`, `manifest.webmanifest`, `icons/`), pubblicato con GitHub Pages.
- **Dati**: il Google Sheet "Registro Definitivo Da Bassment Shaolin", letto e scritto tramite l'app web di Apps Script (`apps-script/Code.gs`, funzione `doPost`).
- L'indirizzo dell'app web **non sta in questo repository**: si incolla una volta nell'app ("Collegamento al foglio") e resta salvato solo sul dispositivo.
- L'app si apre subito con l'ultima copia salvata e aggiorna i dati in sottofondo; funziona anche offline (in sola lettura).

## Aggiornare
- Modifiche all'interfaccia: basta un commit su `main`. Il telefono le prende alla prossima apertura.
- Modifiche a `apps-script/Code.gs`: vanno incollate nell'editor di Apps Script e serve una **nuova versione** della distribuzione "API app".
