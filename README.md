# Bassment Hub

App (PWA) per il registro di [@andreadeblasiobass](https://instagram.com/andreadeblasiobass): calendario, repertorio, dischi, numeri, Check.

- **Frontend**: `index.html` (+ `sw.js`, `manifest.webmanifest`, `icons/`), pubblicato con GitHub Pages.
- **Dati**: il Google Sheet "Registro Definitivo Da Bassment Shaolin", letto e scritto tramite l'app web di Apps Script (`apps-script/Code.gs`, funzione `doPost`).
- L'indirizzo dell'app web **non sta in questo repository**: si incolla una volta nell'app ("Collegamento al foglio") e resta salvato solo sul dispositivo.
- L'app si apre subito con l'ultima copia salvata e aggiorna i dati in sottofondo; funziona anche offline (in sola lettura).

## Aggiornare
- Modifiche all'interfaccia: basta un commit su `main`. Il telefono le prende alla prossima apertura.
- Modifiche al motore (`apps-script/`): vanno incollate nell'editor di Apps Script e serve una **nuova versione** della distribuzione "API app (PWA)". Nell'editor, `Code.gs` corrisponde a "Codice.gs"; `Push.gs` + `Notify.gs` stanno insieme nel file "Senza titolo.gs".

## Notifiche
- Web Push firmato in Apps Script (`Push.gs`, curva P-256 in JS puro: le chiavi nascono e restano nelle Proprietà dello script).
- `Notify.gs` controlla il foglio ogni ora (attivatore creato da `attivaNotifiche`): riepilogo del mattino alle 8 nel fuso del telefono, numeri della settimana la domenica alle 20, e la scheda **Promemoria** per avvisi liberi.
- Ogni notifica finisce anche nella scheda **Notifiche** del foglio.
