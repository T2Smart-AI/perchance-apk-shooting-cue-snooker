# apk-shooting-cue-snooker

Moteur de simulation de billard et de tir de précision.
*Billiard simulation engine and precision shooting tool.*

https://t2smart-ai.github.io/perchance-apk-shooting-cue-snooker/

## 🚀 Fonctionnalités

- **Gestion du jeu** : Contrôles de lecture (Pause), progression et réinitialisation.
- **Précision du tir** : Ajustements fins (Fine ◀/▶) et système de verrouillage (Lock).
- **Navigation** : Accès direct au magasin de queues (Cue Shop), aux missions et aux bonus.
- **Configuration** : Modes de difficulté (Basic/Advanced) et réglages de physique (Auto/High/Low).
- **Guide** : Section "How to play" intégrée.

## 🛠️ Démarrage Rapide

Lancer un serveur local pour tester l'application :

```bash
python3 -m http.server
```

## 🕹️ Utilisation

| Contrôle | Rôle |
| :--- | :--- |
| `❚❚` | Pause / Reprise |
| `?` | Aide / Instructions |
| `◀ Fine` / `Fine ▶` | Ajustement précis de la trajectoire |
| `◎ Lock` | Verrouillage de la visée |
| `PLAY` | Lancer une partie |
| `CUE SHOP` | Personnalisation de l'équipement |
| `MISSIONS` | Objectifs de jeu |
| `BONUS` | Récompenses et extras |
| `Basic / Advanced` | Sélection du niveau de difficulté |
| `Auto / High / Low` | Réglage de la physique des impacts |
| `Reset progress` | Réinitialisation complète des données |

## ⚙️ Fonctionnement

L'application est un site statique utilisant l'API **Canvas** pour le rendu graphique et la simulation physique. 

L'intelligence artificielle et la persistance des données sont gérées via :
- **Puter.js & Pollinations** : Intégration d'IA sans clé API (limites gratuites de 30s à 45s).
- **kv-plugin** : Gestion du stockage des données utilisateur.

## 📂 Structure du Projet

- `src/main.js` : Cœur de l'application.
- `src/physics.js` : Moteur de collision et trajectoires.
- `src/gfx.js` & `src/ui.js` : Rendu visuel et interface utilisateur.
- `src/table.js` & `src/levels.js` : Configuration des tables et niveaux.
- `src/audio.js` : Gestion du son et des musiques (`menu-lounge.mp3`, `play-loop.mp3`).
- `src/save.js` : Exportation et sauvegarde des données.

## 🛠️ Configuration & Déploiement

### Configuration
Le comportement du système peut être ajusté via le fichier `adapters.js` pour modifier les interactions entre le moteur et l'UI.

### Déploiement
Le projet est optimisé pour **GitHub Pages**.
1. Pousser le code sur un dépôt GitHub.
2. Activer GitHub Pages dans les paramètres du dépôt.

## 📄 Licence
Ce projet est sous licence **MIT**.
