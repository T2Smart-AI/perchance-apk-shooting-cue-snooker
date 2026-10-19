# apk-shooting-cue-snooker

Simulateur de précision pour le billard snooker.
*Precision snooker shooting simulator featuring advanced physics and cue customization.*

[🕹️ Démo en direct](https://T2Smart-AI.github.io/perchance-apk-shooting-cue-snooker/)

## 🚀 Fonctionnalités

- **Gestion du Jeu** : Contrôles de lecture (Pause), aide (?) et réinitialisation de la progression.
- **Précision du Tir** : Système de réglage fin (Fine ◀/▶) et verrouillage de la cible (Lock).
- **Personnalisation** : Accès au magasin de queues (Cue Shop) et réglages techniques (⚙).
- **Progression** : Modes Mission et Bonus pour tester vos compétences.
- **Configuration Physique** : Paramétrage des modes (Basic, Advanced, Auto) et niveaux d'intensité (High, Low).

## 🛠️ Démarrage Rapide

Lancer un serveur local pour tester l'application :

```bash
python3 -m http.server
```

## 🎮 Guide d'Utilisation

| Contrôle | Rôle |
| :--- | :--- |
| `PLAY` | Lance la partie |
| `CUE SHOP` | Personnalisation de l'équipement |
| `MISSIONS` | Accès aux défis |
| `Fine ◀ / ▶` | Ajustement précis de la trajectoire |
| `Lock` | Fixe la position de visée |
| `Basic / Advanced / Auto` | Sélection du mode d'assistance physique |
| `Reset progress` | Efface les sauvegardes locales |

## ⚙️ Fonctionnement Technique

L'application est un site statique utilisant l'élément `<canvas>` pour le rendu graphique et une architecture modulaire en JavaScript.

- **Moteur Physique** : Géré par `src/physics.js`.
- **Intelligence Artificielle** : Intégration via **Puter.js** et **Pollinations**, soumise à des limites gratuites de 30s/45s.
- **Persistance** : Utilisation du `kv-plugin` pour la sauvegarde des données.

## 📂 Structure du Projet

- `src/core/` : Logique principale (`main.js`).
- `src/render/` : Gestion du rendu et de l'interface (`gfx.js`, `ui.js`).
- `src/audio/` : Gestion du son et musiques d'ambiance.
- `src/` : Modules de support (textures, tables, niveaux, RNG).
- `src/tools/` : Utilitaires de test et de régression.

## 🛠️ Configuration

Les adaptations de comportement et les paramètres système sont configurés dans le fichier `adapters.js`.

## 🚀 Déploiement

L'application est optimisée pour un déploiement via **GitHub Pages**.

## 📄 Licence

Distribué sous licence **MIT**.
