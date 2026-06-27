# SPECTRA - Mots mêlés ARG

Application web collaborative pour une mission SPECTRA autour d'une grille de mots mêlés 500 x 500, avec validation serveur, liens privés par cellule, rendu Canvas/WebGL, anti-triche et dashboard Directrice.

## Installation locale

1. Installer Node.js 22+.
2. Copier `.env.example` vers `.env`.
3. Remplacer `JWT_SECRET` par une valeur forte.
4. Laisser `ADMIN_PASSWORD_HASH` pour tester avec le mot de passe `spectra-directrice`, ou générer un hash bcrypt.
5. Lancer `npm install`.
6. Lancer `npm run generate:grid` pour vérifier la génération autonome.
7. Lancer `npm run dev`.
8. Ouvrir `http://localhost:5173/play/8NFKQX`.
9. Entrer un pseudo de `missions/operation-festin/cells.json`.
10. Dashboard Directrice : `http://localhost:5173/directrice`, mot de passe `spectra-directrice`.

## Déploiement Railway ou Render

1. Créer un nouveau service depuis ce dépôt Git.
2. Définir `NODE_ENV=production`.
3. Définir `JWT_SECRET` avec une valeur aléatoire forte.
4. Définir `ADMIN_PASSWORD_HASH` avec un hash bcrypt fort.
5. Définir `CLIENT_ORIGIN` sur l'URL publique du frontend si séparé.
6. Utiliser la commande de build `npm install && npm run build`.
7. Utiliser la commande de démarrage `npm start`.
8. Monter un volume persistant pour `data/` si SQLite est utilisé.
9. Pour PostgreSQL futur, remplacer l'adaptateur `server/src/storage`.

## Configuration sans code

Chaque mission est un dossier dans `missions/`. La mission active est contrôlée par `MISSION_ID`.

- `cells.json` : cellules, membres, liens privés et décalages alphabétiques.
- `words.json` : mots, catégories, dépendances, chemins et révélations.
- `enigmas.json` : énigmes, réponses et règles de déblocage.
- `transmissions.json` : transmissions automatiques et manuelles.
- `theme.json` : palette et préférences visuelles.
- `config.json` : taille de grille, seuils anti-triche, graine de génération.

## Sécurité

- La grille complète, les réponses, les chemins et les dépendances restent côté serveur.
- Le client reçoit uniquement les tuiles visibles de la grille.
- Les sessions sont stockées en cookie `httpOnly`, `sameSite=strict`.
- Les API exigent un JWT valide et vérifient l'appartenance à la cellule.
- Les tentatives suspectes génèrent des alertes visibles en temps réel.

## Limites de cette version

Cette base est conçue pour être jouable et extensible. Elle utilise SQLite en développement, un rendu Canvas 2D avec couche WebGL disponible, et un placement déterministe des mots. Pour une production très hostile, ajouter un WAF, TLS strict, 2FA admin réel et rotation serveur des refresh tokens.
