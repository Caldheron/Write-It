# Write-it

Application Progressive Web App (PWA) pour écrire **au moins 100 mots par jour**.

## Fonctionnalités

- Zone d'écriture simple avec compteur de mots en temps réel (devient vert à 100 mots)
- Objectif journalier de 100 mots (maximum soft de 2000 mots)
- Archivage automatique à minuit
- Historique des jours précédents (consultation + édition)
- Streak (jours consécutifs)
- Notification de rappel à 18h00
- 100 % local (aucune donnée envoyée sur un serveur)
- Fonctionne hors-ligne
- Installable sur l'écran d'accueil

## Structure

```
write-it/
├── index.html
├── css/style.css
├── js/app.js
├── manifest.json
├── sw.js
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

## Utilisation locale

Ouvre simplement `index.html` dans un navigateur, ou mieux :

```bash
npx serve .
```

## Licence

Libre d'utilisation.
