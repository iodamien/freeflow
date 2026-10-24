# FreeFlow sur Linux — portage expérimental

Ce fork ajoute une première cible Linux x86_64. La cible principale est une session **X11** sur Ubuntu 22.04 ou ultérieur. Les paquets Linux incluent le moteur autonome ; l’accélération GPU dépend des bibliothèques installées sur le système. Un essai sur un vrai poste reste nécessaire pour le micro, les raccourcis du bureau et le collage dans chaque application.

## Fonctions

| Fonction | X11 | Wayland |
| --- | --- | --- |
| Micro, transcription locale, vocabulaire, snippets, historique | À valider sur le poste | À valider sur le poste |
| Dictée mains libres par raccourci | Electron globalShortcut | Selon le portail GlobalShortcuts du bureau et le lanceur installé |
| Maintenir pour parler et raccourcis de modificateurs seuls | uiohook-napi | Désactivés |
| Collage automatique | xdotool ; Ctrl+Maj+V dans les terminaux courants | Désactivé ; collage manuel |
| Démarrage automatique | Entrée XDG autostart | Entrée XDG autostart |

Le collage automatique demande la commande xdotool et une fenêtre active qui accepte les événements X11. Si xdotool manque, si la fenêtre change pendant le délai ou si la session est Wayland, le texte reste dans le presse-papiers. Sous Wayland, le raccourci peut être indisponible même si la dictée depuis la fenêtre fonctionne. Le bouton de dictée et le menu de la zone de notification restent utilisables.

## Essayer depuis les sources

Prérequis : Node.js 22, Python 3.11 et une session graphique Linux. Exemple Ubuntu 22.04 ; les noms de paquets audio peuvent changer sur les versions suivantes (libasound2t64 remplace libasound2 sur Ubuntu 24.04).

```bash
sudo apt-get update
sudo apt-get install -y python3-venv xdotool libxtst6 libgtk-3-0 libnss3 libasound2 libgbm1 libxkbcommon0 libx11-xcb1
git clone --branch linux-support https://github.com/iodamien/freeflow.git freeflow-linux
cd freeflow-linux
python3 -m venv .venv
.venv/bin/python -m pip install -r stt/requirements-linux.txt
npm ci
npm run start:linux
```

L’application repère automatiquement `.venv/bin/python`. Pour un autre environnement Python, utilise `FREEFLOW_PYTHON=/chemin/vers/python npm run start:linux`. La commande de démarrage retire ELECTRON_RUN_AS_NODE, qui peut être défini par certains éditeurs.

Au premier lancement, le modèle est téléchargé depuis Hugging Face. Sur CPU, le modèle normal est small ; pour un premier essai plus léger : `FREEFLOW_DEVICE=cpu FREEFLOW_CPU_MODEL=tiny npm run start:linux`. Attends que le moteur soit prêt, choisis le micro dans Paramètres et essaie une dictée dans un éditeur de texte.

Pour vérifier le type de session : `echo "$XDG_SESSION_TYPE"`. Pour tester le mode complet, choisis une session Xorg/X11 à l’écran de connexion si ton bureau en propose une.

## Construire les paquets Linux

Les paquets doivent être construits sur Linux pour embarquer un moteur PyInstaller Linux.

```bash
. .venv/bin/activate
npm run build:stt:linux
npm run package:linux    # archive tar.gz
# ou
npm run release:linux    # AppImage et archive tar.gz
```

Les résultats sont dans `release/linux/`. L’archive contient le moteur autonome ; Python n’est pas requis sur le poste destinataire. Après extraction, lance `./freeflow`. L’AppImage doit être rendue exécutable avant son lancement ; elle peut demander la prise en charge FUSE 2 de ta distribution. xdotool reste une dépendance système pour le collage X11.

Le démarrage automatique utilise le chemin de l’AppImage quand l’application tourne depuis une AppImage. Déplacer ensuite le fichier demande de relancer FreeFlow pour actualiser cette entrée.

## Chemins et suppression

- Réglages, dictionnaire et historique : le dossier userData d’Electron, généralement `~/.config/FreeFlow` (ou sous XDG_CONFIG_HOME).
- Modèles : `$XDG_CACHE_HOME/FreeFlow/models`, sinon `~/.cache/FreeFlow/models`. Un cache personnalisé existant reste utilisé.
- Journaux : `logs/freeflow.log` dans le dossier de données, accessible depuis Paramètres.
- Démarrage automatique : `$XDG_CONFIG_HOME/autostart/com.alan.freeflow.desktop`, sinon `~/.config/autostart/com.alan.freeflow.desktop`. Décoche l’option dans Paramètres pour retirer cette entrée.

Pour supprimer une version portable, désactive son démarrage automatique puis supprime son archive extraite ou son AppImage. Les données et les modèles sont conservés ; supprime leurs dossiers séparément si tu souhaites les effacer.

## GPU NVIDIA

Le paquet Linux ne contient aucune DLL Windows et ne redistribue pas CUDA. Le moteur peut utiliser une installation Linux compatible de CUDA 12 et cuDNN 9 ; les bibliothèques doivent être visibles par le chargeur du système ou par LD_LIBRARY_PATH **avant** le lancement. Le repli CPU reste disponible. Ce chemin GPU reste à valider sur une machine NVIDIA. Voir les [prérequis GPU de faster-whisper](https://github.com/SYSTRAN/faster-whisper#gpu).

## Vérifications

```bash
npm test
python3 -m py_compile stt/build_stt.py stt/stt_server.py test/stt_smoke.py
```

Le [workflow Linux port](https://github.com/iodamien/freeflow/actions/workflows/linux.yml) exécute les tests de comportement, construit le moteur, télécharge un modèle tiny pour vérifier son API sur CPU, produit les paquets et lance l’application empaquetée sous Xvfb pour rendre les neuf vues de démonstration. Les paquets et captures sont joints aux exécutions réussies dans Artifacts. Ces contrôles ne remplacent pas un essai avec un vrai micro, une session Wayland et le GPU.

La [documentation Electron](https://www.electronjs.org/docs/latest/api/global-shortcut#usage-on-linux) décrit les conditions du portail Wayland. Ce portage ne prétend pas injecter du texte dans les applications Wayland natives.
