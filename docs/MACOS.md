# FreeFlow sur macOS — portage expérimental

Ce fork ajoute une version macOS pour les Mac **Apple Silicon** (M1, M2, M3, M4…), à partir de macOS 12. Le DMG contient l’application, le moteur de transcription autonome et un petit outil natif pour le collage : Python n’est pas nécessaire sur le Mac.

[⬇ Télécharger FreeFlow-1.0.0-arm64.dmg](https://github.com/iodamien/freeflow/releases/download/v1.0.0-macos.1/FreeFlow-1.0.0-arm64.dmg)

## Fonctions

| Fonction | macOS |
| --- | --- |
| Micro, transcription locale, vocabulaire, snippets, historique | Oui |
| Dictée mains libres par raccourci | Oui, raccourci par défaut `Ctrl + Maj + Espace` |
| Maintenir pour parler, raccourcis de modificateurs seuls (ex. `Ctrl + Option`) | Oui, après l’autorisation **Accessibilité** |
| Collage automatique | Cmd+V simulé, après l’autorisation **Accessibilité** ; sinon le texte reste dans le presse-papiers |
| Démarrage à l’ouverture de session | Éléments de connexion de macOS |
| Icône | Barre des menus (en haut à droite) et Dock |

Le raccourci par défaut n’est pas `Ctrl + Alt + Espace` comme sous Windows : sur Mac, `Ctrl + Option + Espace` passe à la source de saisie suivante.

## Installer

1. Télécharge le DMG, ouvre-le et glisse **FreeFlow** dans **Applications**.
2. Lance FreeFlow depuis Applications. L’application n’est pas signée par un compte développeur Apple ni notarisée, macOS refuse donc le premier lancement (« Apple n’a pas pu vérifier… »). Clique sur **OK**, puis ouvre **Réglages Système → Confidentialité et sécurité**, descends jusqu’au message sur FreeFlow et clique sur **Ouvrir quand même**. Confirme avec ton mot de passe.
   Alternative dans le Terminal : `xattr -dr com.apple.quarantine /Applications/FreeFlow.app`
3. Autorise le **micro** quand macOS le demande.
4. Pour le collage automatique et le mode maintenu, autorise FreeFlow dans **Réglages Système → Confidentialité et sécurité → Accessibilité** (le bouton *Autoriser l’Accessibilité* dans Paramètres ouvre ce panneau). Sans cette autorisation, la dictée fonctionne quand même : le texte est copié et tu le colles avec `Cmd + V`.
5. Au premier lancement, le modèle `small` (environ 0,5 Go) est téléchargé depuis Hugging Face, une seule fois. Quand l’icône indique « prêt », appuie sur `Ctrl + Maj + Espace`, parle, appuie à nouveau.

## Performances

CTranslate2 (le moteur de faster-whisper) n’utilise pas le GPU des puces Apple : la transcription tourne sur le processeur avec le modèle `small` en `int8`. Sur un MacBook Pro M3 Pro, 10 secondes de voix sont transcrites en 2,5 secondes environ et le modèle se charge en 1 à 2 secondes. `large-v3-turbo` est plus précis mais prend environ 10 secondes pour 10 secondes de voix sur la même machine ; il reste disponible pour les essais avec `FREEFLOW_CPU_MODEL=large-v3-turbo` en développement.

Le vocabulaire du Dictionnaire est transmis au modèle : il aide beaucoup pour les noms propres (`n8n`, `Notion`…).

## Mises à jour et autorisations

La signature de l’application est « ad hoc » (sans certificat Apple). Après l’installation d’une nouvelle version, macOS peut considérer FreeFlow comme une autre application : si le collage s’arrête, retire FreeFlow de la liste Accessibilité (bouton −), puis ajoute-le à nouveau ou clique sur *Autoriser l’Accessibilité*.

## Chemins et suppression

- Réglages, dictionnaire, historique et journaux : `~/Library/Application Support/FreeFlow` (journal : `logs/freeflow.log`).
- Modèles : `~/Library/Application Support/FreeFlow/models`.

Pour désinstaller : quitte FreeFlow (icône de la barre des menus → Quitter), désactive *Lancer FreeFlow à l’ouverture de session* si tu l’avais coché, puis mets `/Applications/FreeFlow.app` à la corbeille. Supprime `~/Library/Application Support/FreeFlow` pour effacer aussi les modèles et l’historique, et retire FreeFlow des listes Micro et Accessibilité dans les Réglages Système.

## Construire depuis les sources

Prérequis : un Mac Apple Silicon, Node.js 22, Python 3.11 ou 3.12 et les outils en ligne de commande Xcode (`xcode-select --install`, pour `swiftc`).

```bash
git clone --branch macos-support https://github.com/iodamien/freeflow.git freeflow-macos
cd freeflow-macos
python3 -m venv .venv
.venv/bin/python -m pip install -r stt/requirements-macos.txt
npm ci
npm run build:native:mac            # native/PasteHelperMac (Cmd+V simulé)
npm run start:mac                   # développement : moteur lancé avec .venv/bin/python
```

Pour produire le DMG :

```bash
. .venv/bin/activate
npm run build:stt:mac               # moteur autonome : stt/dist/freeflow-stt (PyInstaller)
npm run release:mac                 # release/mac/FreeFlow-1.0.0-arm64.dmg
```

`npm run package:mac` produit seulement l’application (`release/mac/mac-arm64/FreeFlow.app`). En développement, les autorisations Micro et Accessibilité s’appliquent au terminal qui lance FreeFlow.

`stt/requirements-macos.txt` limite PyAV à une version inférieure à 16 : les versions suivantes ne prennent plus l’argument `metadata_errors` que faster-whisper 1.2 utilise pour décoder l’audio.

## Vérifications

```bash
npm test
python3 test/stt_smoke.py stt/dist/freeflow-stt/freeflow-stt
release/mac/mac-arm64/FreeFlow.app/Contents/MacOS/FreeFlow --user-data-dir=/tmp/ff-test --test-pipeline=chemin/vers/un.wav --exit
```

Le [workflow macOS port](https://github.com/iodamien/freeflow/actions/workflows/macos.yml) exécute les tests sur un runner Apple Silicon, construit le moteur et l’outil de collage, vérifie le moteur figé avec un modèle tiny, produit le DMG, contrôle sa signature et lance l’application empaquetée pour rendre les neuf vues de démonstration. Ces contrôles ne remplacent pas un essai avec un vrai micro et l’autorisation Accessibilité.

## Limites connues

- Mac Intel non pris en charge par ce DMG.
- Pas de notarisation Apple : le premier lancement demande *Ouvrir quand même*.
- Le collage simulé ne fonctionne pas dans les champs sécurisés (mots de passe) ; le texte reste dans le presse-papiers.
