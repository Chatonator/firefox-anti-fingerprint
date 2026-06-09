# Bouclier Anti-Empreinte — Extension Firefox

Extension Firefox qui protège contre le **fingerprinting web** sur **tous les sites visités**, avec une protection **maximale activée par défaut**.

## Ce qu'elle fait

- **Canvas** : injecte un bruit subtil dans la lecture des pixels (`getImageData` / `toDataURL` / `toBlob`).
- **WebGL** : falsifie le `VENDOR` et le `RENDERER` (y compris les constantes
  UNMASKED) et ajoute un bruit subtil sur `readPixels`.
- **AudioContext** : ajoute un micro-bruit inaudible aux lectures audio.
- **Polices** : brouille `measureText` pour empêcher l'énumération des polices.
- **Navigateur & matériel** : falsifie `userAgent`, `appVersion`, `platform`, `oscpu`,
  `hardwareConcurrency`, `deviceMemory`, `language(s)`, `vendor`, `productSub`,
  `maxTouchPoints`, `doNotTrack`, vide `plugins`/`mimeTypes`, met `webdriver` à
  `false`, bloque `getBattery`, l'énumération des périphériques média
  (`enumerateDevices`) et la disposition clavier (`getLayoutMap`).
- **Écran** : normalise la résolution, la profondeur de couleur, la densité de
  pixels (`devicePixelRatio = 1`), la position et la taille externe de la fenêtre.
- **Fuseau horaire** : normalisé sur UTC (offset, rendu des dates `toString`/
  `toLocaleString`, et `Intl.DateTimeFormat`).
- **En-têtes HTTP** : réécrit `User-Agent` et `Accept-Language` pour rester cohérent avec le JavaScript.
- **WebRTC** : désactivé pour empêcher les fuites d'adresse IP.

Une **graine de session** garantit que l'User-Agent envoyé dans les requêtes correspond
exactement à celui exposé en JavaScript.

## Changement d'empreinte instantané

Le bouton **« Nouvelle identité »** régénère immédiatement un profil complet (User-Agent,
système, résolution d'écran, rendu WebGL, mémoire, cœurs…) — un peu comme reconnecter un
VPN pour se faire passer pour une autre machine. Le ou les onglets sont **rechargés
automatiquement** pour que la nouvelle empreinte s'applique aussitôt et reste cohérente
entre le JavaScript et les en-têtes HTTP. Vous pouvez recharger **uniquement l'onglet
actif** (rapide) ou **tous les onglets ouverts** (pour tout appliquer d'un coup).

## Installation (chargement temporaire)

1. Ouvrez Firefox et allez sur `about:debugging#/runtime/this-firefox`.
2. Cliquez sur **« Charger un module complémentaire temporaire… »**.
3. Sélectionnez le fichier `manifest.json` de ce dossier (ou décompressez d'abord le `.zip`).
4. L'icône du bouclier apparaît dans la barre d'outils. La protection est active immédiatement.

> Le chargement temporaire disparaît à la fermeture de Firefox. Pour une installation
> permanente, l'extension doit être signée par Mozilla (addons.mozilla.org) ou via
> `web-ext sign`. Sur Firefox Developer Edition / Nightly, vous pouvez aussi mettre
> `xpinstall.signatures.required` à `false` dans `about:config` et installer le `.xpi`.

## Réglages

Cliquez sur l'icône pour ouvrir le panneau : interrupteur global, activation/désactivation
par catégorie, détails de l'identité simulée (système, écran, WebGL) et bouton
« Nouvelle identité » avec choix de la portée du rechargement.

## Limite connue

Sur les rares sites avec une politique CSP `script-src` très stricte, l'injection en
contexte page peut être bloquée ; les protections réseau (en-têtes) et WebRTC restent
toutefois actives.
