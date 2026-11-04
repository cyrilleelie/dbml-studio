# DBML Studio

Éditeur et visualiseur de schémas [DBML](https://dbml.dbdiagram.io/docs/) qui tourne entièrement en local, dans un seul fichier HTML, sans serveur ni installation.

- **Deux types de fichier**, choisis à la création : schéma de **cinématique de données** (flux seuls) ou **modèle objets relations** (relations seules) — voir « Types de schéma »
- Édition avec coloration syntaxique, erreurs localisées à la ligne près
- Autocomplétion contextuelle : tables et colonnes dans les relations et les mappings, types, paramètres entre crochets, squelettes de blocs, paires automatiques
- Rechercher / remplacer dans l'éditeur (Ctrl/⌘ F), éditeur repliable pour libérer la place du diagramme
- Descriptions des champs et des tables (`note` DBML standard) affichées en infobulle au survol
- Diagramme interactif : déplacement, zoom, layout automatique, repli des tables, verrouillage de position, défilement automatique en glissant vers le bord
- Navigation au clavier / à la molette : molette = zoom ; **Maj + molette** = défilement horizontal ; **Alt + molette** = défilement vertical ; **flèches** = déplacer la vue (avec Maj, plus vite), quand le focus n'est pas dans l'éditeur ; le geste horizontal d'un pavé tactile défile aussi
- Cliquer une table, un champ, une valeur d'enum ou une région place le curseur sur la ligne source correspondante
- Panneau « Affichage » (bas à droite) classé par type : relations et groupes de relations (modèle) ou flux de données et colonnes (cinématique), régions, tables, énumérations (modèle), chacune individuellement ou par catégorie
- Sélection multiple par cadre de souris (Maj+glisser) ou Maj+clic, pour déplacer ou supprimer plusieurs éléments ensemble
- Suppression d'une sélection (touche Suppr) avec confirmation, en cascade dans le code : relations, flux et appartenances de région concernés sont retirés, les blocs devenus vides aussi
- Sélecteur de couleur au clic sur une table ou une région, avec palette des couleurs déjà utilisées
- Ajustement automatique : replier ou déplier une table ou une région redimensionne sa région et décale ce qui se trouve en dessous
- Régions (`TableGroup`) : déplacement groupé, repli, couleurs
- Cinématique de données via les blocs `Mapping` (extension), avec suivi du lignage colonne par colonne
- Enregistrement du fichier en cours (Ctrl/⌘ S), positions et replis conservés dans le fichier lui-même, et export du schéma en image (PNG, JPG, WebP, SVG)
- Export SQL PostgreSQL (copie ou téléchargement) et export en DBML standard

## Utiliser la version en ligne

Adresse : <https://cyrilleelie.github.io/dbml-studio/>

- Elle est mise à jour automatiquement à chaque push sur `main` (workflow `.github/workflows/pages.yml`). L'activation se fait une seule fois dans Settings > Pages > Source : GitHub Actions.
- Rien n'est envoyé à un serveur : tout reste dans le navigateur.
- Le code et la disposition sont sauvegardés dans le `localStorage` de ce site. La version en ligne et le fichier ouvert en local ont chacun leur propre sauvegarde : pour passer de l'un à l'autre, Enregistrer le fichier `.dbml` puis l'ouvrir dans l'autre.
- L'origine `cyrilleelie.github.io` est partagée par tous les sites Pages du compte : leurs `localStorage` sont accessibles entre eux.

## Utiliser

Ouvrir `index.html` (le fichier à la racine du dépôt) dans un navigateur récent (Chrome, Edge, Firefox, Safari 16.4+).
Le fichier est autonome : il fonctionne hors ligne et peut être distribué tel quel.
Seules les polices IBM Plex viennent de Google Fonts ; sans réseau, les polices système prennent le relais.

Le code et la disposition du diagramme sont sauvegardés dans le `localStorage` du navigateur.

## Développer

Prérequis : Node 18+ (aucune dépendance npm).

```
npm run build      # régénère index.html (à versionner)
npm run test:unit  # tests Node du parser et de l'autocomplétion
npm test           # tests Playwright (e2e)
```

Ne jamais éditer `index.html` à la main : il est généré par `build.mjs` à partir de `src/`. La CI vérifie qu'il est à jour.

| Fichier | Rôle |
|---|---|
| `src/autocomplete.js` | Moteur d'autocomplétion : analyse du contexte au curseur et suggestions. Sans dépendance au DOM, testé sous Node |
| `src/parser.js` | Tokenizer, parser DBML et validation. Sans dépendance, utilisable dans le navigateur et sous Node |
| `index.html` | Livrable généré par `build.mjs` (fichier autonome, versionné, servi par GitHub Pages) ; ne pas l'éditer |
| `src/index.html` | Gabarit : interface, CSS, rendu SVG, interactions, export SQL. Contient les marqueurs d'injection |
| `examples/*.dbml` | Exemples du menu « Exemples » (déclarés dans `build.mjs` et dans le menu de `src/index.html`) |
| `vendor/dagre.min.js` | dagre 0.8.5 (licence MIT, voir `vendor/dagre.LICENSE`), injecté pour le fonctionnement hors ligne |
| `build.mjs` | Injecte dagre, le parser et les exemples dans le gabarit HTML |

Pour ajouter un exemple : créer le fichier dans `examples/`, l'ajouter à `EXAMPLES` dans `build.mjs`, puis ajouter un bouton `<button class="mi" data-ex="cle">` dans le menu de `src/index.html`.

## Autocomplétion

La liste s'ouvre en tapant ; Ctrl/⌘ Espace la force. Flèches pour naviguer, Entrée ou Tab pour valider, Échap pour fermer. La recherche est approximative : `dimass` trouve `dwh.dim_assure`. Un panneau à côté de la liste affiche le détail de l'élément : type, contraintes, description.

| Où | Suggestions |
|---|---|
| Début de ligne, hors bloc | Squelettes `Table`, `Enum`, `Ref`, `Ref { }`, `TableGroup`, `Mapping`, `Project`, `Note` |
| Dans une table, début de ligne | `Note`, `indexes` |
| Après un nom de colonne | Enums du schéma, types déjà utilisés (les plus fréquents d'abord), types SQL courants |
| Entre crochets | Paramètres adaptés au contexte (colonne, table, relation, flux, région, index, valeur d'enum), sans ceux déjà saisis |
| `ref:`, `Ref:`, blocs `Ref { }` et `Mapping` | Opérateurs, puis tables (et alias), puis colonnes avec leur type ; `table.(a, b)` et `table.*` pris en charge |
| `delete:` / `update:` | `cascade`, `set null`, `restrict`, `no action`, `set default` |
| Dans un `TableGroup` | Tables, celles hors région en premier |

Les squelettes contiennent des champs à remplir : Tab passe au suivant, Maj+Tab revient au précédent. Les parenthèses, crochets, accolades et apostrophes se ferment automatiquement ; taper le caractère fermant passe par-dessus, et Retour arrière entre deux caractères appariés supprime les deux. Entrée entre `{` et `}` ouvre le bloc sur trois lignes.

Les suggestions s'appuient sur le dernier état valide du schéma : une table tout juste créée apparaît dès que le code est de nouveau valide.

### Suggestions qui vont plus loin que le texte tapé

Ces suggestions raisonnent sur le schéma dans son ensemble, pas seulement sur ce qui précède le curseur :

- **Développer un flux par nom de colonne.** Sur une ligne `table.* > table.*` d'un `Mapping`, Ctrl/⌘ Espace propose « Développer par colonnes identiques » : une ligne `source.col > cible.col` par colonne portant le même nom des deux côtés. Le nombre de correspondances trouvées s'affiche avant de valider.
- **Couverture des colonnes cibles.** Dans un `Mapping`, en tapant la colonne cible après `>`, les colonnes pas encore alimentées par ce mapping remontent en tête de liste et sont annotées « Pas encore alimentée dans ce mapping » ; celles déjà couvertes sont reléguées en fin de liste et annotées « Déjà alimentée ».
- **Clé étrangère déduite du nom.** En tapant une colonne comme `user_id` ou `id_contrat`, si son nom correspond à une seule table du schéma (au singulier ou au pluriel) dotée d'une clé primaire simple, `[ref: > users.id]` apparaît en tête des paramètres proposés entre crochets.
- **Valeurs d'un enum.** Après `default:` sur une colonne dont le type est un enum du schéma, les valeurs de cet enum sont proposées sous forme de littéraux (`'pending'`, `'paid'`…) au lieu du paramètre générique.
- **Tables sans région.** Dans un `TableGroup`, les tables qui n'appartiennent encore à aucune région apparaissent en premier ; celles déjà listées plus haut dans le bloc en cours de saisie ne sont pas reproposées.

## Types de schéma

Un fichier est soit un **schéma de cinématique de données**, soit un **modèle objets relations**. Les deux n'affichent pas les mêmes objets (le modèle contient « contrat » une fois ; la cinématique `src_contrat`, `stg_contrat`, `dwh_contrat`…), d'où deux fichiers distincts.

| | Cinématique de données | Modèle objets relations |
|---|---|---|
| Affiche | les **flux** (`Mapping`) entre colonnes | les **relations** (clés étrangères) |
| Tables | avec leurs colonnes (pas d'énumérations) | avec leurs colonnes, ou en vue **conceptuelle** (boîtes en pilule + cardinalités) |
| Disposition | en colonnes (`Lanes`), sources à gauche | organique : peu de croisements, domaine (`domain`) au centre |
| Paramètres propres | `Mapping`, `Lanes`, `lane:` | `domain: in / out` |

- **Création** : Fichier > « Nouveau schéma de cinématique » ou « Nouveau modèle objets relations » (un petit gabarit est fourni). Les exemples ont chacun leur type.
- **Mémorisation** : le type est enregistré dans le fichier, avec les positions (commentaire final généré, jamais affiché). À l'ouverture d'un fichier qui ne le précise pas, il est déduit (`Mapping` ou `Lanes` : cinématique ; `domain` ou relations : modèle) ; si c'est ambigu, une boîte de dialogue demande.
- **Changer de type** : clic sur l'étiquette du type en haut. Les positions sont recalculées, le texte du fichier n'est pas modifié.
- **Hors type** : la syntaxe de l'autre type est acceptée mais n'a pas d'effet (par exemple les `ref` dans une cinématique, qui servent de documentation) ; un avertissement orange apparaît en bas de l'éditeur pour un `Mapping` ou des `Lanes` dans un modèle, ou un `domain` dans une cinématique.

## Enregistrer et exporter

**Positions et replis dans le fichier.** À l'enregistrement, DBML Studio ajoute en fin de fichier un commentaire de bloc reconnaissable (`/* dbml-studio:layout … */`) contenant la position de chaque table et région, et ce qui est replié. Ce commentaire :
- n'apparaît jamais dans l'éditeur — il est retiré aussitôt à la lecture, injecté seulement au moment d'écrire sur le disque ;
- est un simple commentaire DBML : le fichier reste lisible et importable tel quel dans dbdiagram.io ou `@dbml/core`, qui l'ignoreront ;
- se régénère entièrement à chaque enregistrement (jamais fusionné à la main) ;
- est ignoré sans erreur s'il est absent (fichier plus ancien ou écrit à la main) ou corrompu : le diagramme repasse alors sur le layout automatique.

Le point orange à côté du nom du fichier reflète aussi les positions et replis non enregistrés, pas seulement le texte : déplacer une table suffit à le faire apparaître.

**Fichier ▾** : Ouvrir (Ctrl/⌘ O), Enregistrer (Ctrl/⌘ S), Enregistrer sous (Ctrl/⌘ ⇧ S), Rechercher/remplacer (Ctrl/⌘ F), Copier le DBML, Copier en DBML standard (sans les blocs `Mapping`, pour dbdiagram.io et `@dbml/core`).

- Dans Chrome et Edge, l'API File System Access écrit directement dans le fichier ouvert : Enregistrer met à jour le même fichier, sans nouvelle boîte de dialogue.
- Dans Firefox et Safari, qui n'ont pas cette API, Enregistrer télécharge une copie `.dbml`.
- Le nom du fichier s'affiche à côté du titre ; un point orange signale des modifications non enregistrées dans un fichier. Le texte reste de toute façon sauvegardé dans le navigateur.

**Exporter ▾ › Image du schéma** : PNG, JPG, WebP (résolution 1×, 2× ou 3×, plafonnée à 12 000 px de côté) ou SVG vectoriel ; thème clair ou sombre ; fond coloré ou transparent (sauf JPG). L'image contient tout le diagramme tel que le canvas l'affiche au zoom courant (tables et régions repliées, éléments masqués, bandes de colonnes, et en vue conceptuelle entités agrandies et cardinalités masquées comprises), sans la sélection, le survol ni les boutons d'interface.

Les images raster utilisent les polices du système : un navigateur ne charge pas les polices web à l'intérieur d'une image SVG convertie. Le SVG garde la déclaration IBM Plex, appliquée si la police est installée.

## Descriptions

Les descriptions utilisent la syntaxe `note` standard de DBML, donc restent compatibles avec dbdiagram.io :

```
Table dwh.dim_assure {
  Note: 'Dimension des assurés'
  nom_complet varchar(170) [note: 'Prénom et nom, nom en majuscules']
  statut varchar(10) [note: '''
    Texte sur plusieurs lignes,
    utile pour les règles de gestion.
  ''']
}
```

Un point à droite du nom signale un champ décrit. Le survol d'un champ affiche sa description, son type et ses contraintes ; le survol de l'en-tête affiche la description de la table et le nombre de champs décrits. Les descriptions sont exportées en `COMMENT ON` dans le SQL.

## Éditeur : recherche et repli

**Rechercher / remplacer** (Ctrl/⌘ F, ou menu Fichier) : navigation suivant/précédent (Entrée / Maj+Entrée), sensibilité à la casse (bouton « Aa »), remplacer un ou tous. Le focus reste dans la barre pendant la recherche — la correspondance courante est indiquée par un rectangle superposé au code plutôt que par la sélection native, justement pour ne pas voler le focus au clavier. Échap ferme la barre et laisse le curseur sur la dernière correspondance.

**Repli de l'éditeur** : le bouton « Masquer » en haut de l'éditeur le fait disparaître au profit du diagramme, ou le raccourci Ctrl/⌘ B (fonctionne depuis n'importe où, éditeur ou canvas) ; un onglet vertical sur le bord gauche le rouvre. L'état est mémorisé.

## Diagramme : navigation et manipulation

**Clic pour retrouver le code** : cliquer une table, un champ, une valeur d'enum ou une région place le curseur sur la ligne source correspondante dans l'éditeur (comme le double-clic, dès le premier clic).

**Verrouillage** : le bouton « Verrouiller » de la barre d'outils ouvre un panneau classé par type (Régions, Tables, Énumérations), chaque section avec sa case « Toutes », plus une case « Tout verrouiller » en tête pour l'ensemble. Un élément verrouillé (glyphe cadenas) ne peut plus être déplacé, mais reste cliquable pour la sélection et le focus éditeur. Cliquer-glisser sur un élément verrouillé fait défiler la vue (comme sur le fond du canvas) au lieu de ne rien faire. Verrouiller une région verrouille aussi ses membres, repliée ou non.

**Aide et survol** : le bouton « ? » en haut à gauche du canvas ouvre un rappel des gestes (il se ferme d'un clic ailleurs). Survoler une table (souris seulement) met ses relations en évidence et atténue le reste, en vue détaillée comme en vue conceptuelle. L'éditeur a un en-tête « Code DBML » avec le bouton « Masquer ».

**Défilement automatique** : glisser une table ou une région près du bord du canvas fait défiler la vue pour suivre le déplacement, sans à-coup au relâchement.

**Sélection multiple** : Maj+glisser sur le fond du canvas dessine un cadre — tout ce qu'il touche est sélectionné (contour bleu). Maj+clic ajoute ou retire un élément de la sélection un par un. Glisser ensuite l'un des éléments sélectionnés déplace tout le groupe ; les éléments verrouillés de la sélection restent en place pendant que les autres suivent. Un clic simple ailleurs, ou Échap, efface la sélection.

**Suppression** : la touche Suppr (ou retour arrière) sur une sélection — une table, un enum, une région repliée, ou plusieurs à la fois — ouvre une confirmation listant ce qui sera retiré, avec le nombre de relations, de lignes de flux et d'appartenances de région impactées. Les éléments verrouillés de la sélection ne sont jamais supprimés (avertissement dans la confirmation, ou message si tout était verrouillé). Supprimer une région repliée supprime aussi ses tables membres. Un `Ref`, `Mapping` ou `TableGroup` qui ne contient plus rien après coup est retiré entièrement. La suppression agit sur le texte source ; elle n'est pas proposée quand le focus clavier est dans l'éditeur ou un champ de saisie, pour ne pas interférer avec l'édition normale du texte.

**Affichage** : le bouton « Affichage » (bas à droite, à côté de « Verrouiller ») ouvre un panneau classé par type :
- **Clés étrangères** : la case globale, puis chaque groupe de relations nommé (`Ref nom { }`) avec sa couleur et son nombre
- **Flux de données** : une case « Toutes », puis une ligne par `Mapping` avec sa couleur et son nombre de correspondances (section absente s'il n'y a aucun `Mapping`)
- **Régions**, **Tables**, **Énumérations** : chaque élément individuellement, plus une case « Toutes » par catégorie

Une case « Tout cocher » en tête agit sur l'ensemble. Le panneau défile sur un petit écran. Décocher un élément le retire entièrement du diagramme, avec ses relations ; masquer une région masque aussi ses membres, repliée ou non. L'état est mémorisé. Ce panneau et celui du verrouillage se ferment mutuellement pour ne pas se superposer.

**Couleurs** : survoler l'en-tête d'une table ou le nom d'une région affiche une pastille cliquable, qui ouvre un sélecteur de couleur natif accompagné d'une palette des couleurs déjà utilisées dans le fichier et d'un bouton « Réinitialiser ». Le choix patche directement `headercolor:`/`color:` dans le texte source.

## Ajustement automatique de la disposition

Quand une table, un enum ou une région change de hauteur (repli / dépli), les blocs situés en dessous et qui le chevauchent horizontalement sont décalés du même écart, avec une courte animation :

1. à l'intérieur de la région concernée (les autres tables de la région) ;
2. puis entre blocs de premier niveau : régions entières, régions repliées et tables hors région, déplacés d'un seul tenant.

En remontant, un bloc ne vient jamais recouvrir un élément resté en place. Replier puis déplier restitue la disposition d'origine. Le code se trouve dans `src/index.html`, section « Ajustement automatique de la disposition » (`reflowNode`, `shiftBelow`, `topUnits`).

### Réorganiser (disposition automatique)

Le bouton « Réorganiser » recalcule toutes les positions, dans la vue détaillée comme dans la vue conceptuelle :

1. **Colonnes** : celles des `Lanes` si elles existent ; sinon des rangs déduits du sens des relations et des flux (les sources à gauche).
2. **Blocs sans chevauchement** : une région est un bloc rectangulaire (ses tables y sont empilées par colonne) ; une table hors région est un bloc seule. Deux blocs qui se recouvrent horizontalement ne se recouvrent jamais verticalement. Une région repliée se pose en haut à gauche de son bloc déplié, donc la disposition reste sans chevauchement qu'elle soit repliée ou dépliée.
3. **Hauteurs alignées et centrées** : chaque bloc est tiré vers la hauteur moyenne des éléments auxquels il est relié (les flux comptent double), puis les blocs sont replacés sans chevauchement. Ensuite, chaque pile de blocs qui se touchent est décalée d'un seul tenant vers la hauteur moyenne de ce à quoi elle est reliée, à mi-chemin de la pile voisine : un élément seul dans une colonne se retrouve donc au milieu d'une longue pile de la colonne suivante, et inversement. Un élément ou une région qui n'est relié à rien d'autre est centré verticalement, dans sa colonne, par rapport à la hauteur de l'ensemble du schéma (au plus près possible de ce milieu si la colonne y est déjà occupée).
4. **Régions repliées** : le calcul tient compte de l'état de chaque région. Une région repliée occupe la place de sa pastille, ce qui évite de grands vides ; au dépli, le reflow habituel écarte les blocs situés en dessous.
5. **Modèle objets relations : disposition organique** (vue conceptuelle comme vue avec colonnes). Au lieu de colonnes, les blocs sont placés par un calcul de forces (les liens tirent, les blocs se repoussent), puis améliorés par essais d'échanges et de déplacements qui ne sont conservés que s'ils réduisent le nombre de **croisements de liens**. Les objets du **domaine** (`domain: in`, ou sans paramètre) sont regroupés au centre et les objets **hors domaine** (`domain: out`) sont repoussés autour, près de leurs voisins. Une région reste un bloc rigide (ses tables ne sont pas réordonnées entre elles) ; la disposition en colonnes (points 1 à 4) est celle des schémas de cinématique, où les `Lanes` s'appliquent.

Les régions imbriquées sont traitées comme des blocs emboîtés (voir plus bas).

## Vue conceptuelle

Réservée aux **modèles objets relations** (le bouton est absent d'un schéma de cinématique), la « Vue conceptuelle » (barre du bas) ne montre que les tables, sous forme d'entités avec leur nom, reliées par leurs relations avec cardinalités. Les attributs et les énumérations sont masqués. Le bouton rebascule vers la vue détaillée, et le choix est mémorisé.

- **Cardinalités** : symboles en pied de corbeau / barres, plus un texte à chaque extrémité. `N` pour le côté « plusieurs » ; côté « un », `1` si la clé étrangère est obligatoire (`not null` ou clé primaire), `0..1` si elle est facultative. `<>` donne `N` des deux côtés. Une relation composite n'est dessinée qu'une fois ; plusieurs relations identiques entre les mêmes tables sont regroupées (la liste figure dans l'infobulle).
- **Disposition propre** : la vue conceptuelle a ses propres positions (calculées automatiquement au premier affichage, déplaçables ; « Réorganiser » les recalcule). Elles sont enregistrées dans le fichier avec celles de la vue détaillée, sans les modifier. Régions, verrouillage et masquage s'y appliquent comme d'habitude.
- **Domaine fonctionnel** : le paramètre de table `[domain: in]` ou `[domain: out]` (aussi `domaine: interne | externe`) distingue les objets du domaine modélisé de ceux qui sont à l'extérieur mais reliés. Dès qu'une table le déclare, la vue conceptuelle affiche les tables du domaine avec un contour bleu et un fond blanc (c'est aussi le cas des tables sans paramètre), et les tables hors domaine avec un fond orange sans contour. Sans aucun paramètre `domain`, l'affichage reste inchangé. Le paramètre est retiré du DBML standard à la copie ; l'export image reprend ces styles.
- **Au dézoom** : sous 100 %, entités, symboles et traits sont agrandis d'un facteur `(1/zoom)^0,5` (constante `CONCEPT_EXP` dans `src/index.html`) : ils rétrécissent moins vite que l'espacement, donc les noms restent lisibles bien plus longtemps. Sous 25 %, les chiffres de cardinalité sont masqués pour alléger. Très dézoomé, des entités voisines peuvent se toucher : c'est le prix de la lisibilité.
- **Export d'image** : identique au canvas au zoom courant ; au dézoom, les entités sont agrandies du même facteur et rien n'est rogné. En vue détaillée, le rendu ne dépend pas du zoom.

## Extension `Mapping`

DBML ne décrit pas les flux de données. DBML Studio ajoute un bloc `Mapping` :

```
Mapping alimentation_dwh [color: #7a4fb5, note: 'Chargement de l’entrepôt'] {
  stg.contrat.code_produit > dwh.dim_contrat.produit
  stg.personne.(prenom, nom) > dwh.dim_assure.nom_complet [transform: 'prenom || " " || upper(nom)']
  src.contrat.* > stg.contrat.*
}
```

- `source > cible` (ou `->`) : colonne vers colonne
- `t.(a, b) > u.c` : plusieurs colonnes vers une (1→N et N→N apparié acceptés aussi)
- `t.* > u.*` : flux au niveau table ; le lignage suit les colonnes de même nom
- Paramètres de flux : `transform`, `note`. Paramètres de bloc : `color`, `note`

Ces blocs ne sont pas reconnus par dbdiagram.io ni `@dbml/core`. Le menu Fichier ▾ « Copier en DBML standard » les retire.

## Colonnes verticales : `Lanes` (extension DBML Studio)

Des colonnes invisibles qui orientent le placement des tables, pratiques pour une cinématique de données (sources → staging → entrepôt → restitution). On les déclare dans un bloc `Lanes`, dans l'ordre voulu de gauche à droite, puis chaque table choisit la sienne avec `[lane: nom]` :

```
Lanes {
  sources     [color: #667a8b]
  staging     [width: 420, color: #3b6ea8]
  entrepot    [note: "Entrepôt de données"]
  restitution
}

Table stg.contrat [lane: staging] { … }
```

Paramètres d'une colonne (tous facultatifs) : `width` (120 à 2000 px ; par défaut la table la plus large + marges), `color` (teinte de la bande), `note` (infobulle).

- **Placement** : une table rattachée à une colonne reste centrée dans celle-ci. Au glisser, seule sa hauteur (Y) change, y compris dans un groupe ou une sélection multiple. « Réorganiser » place chaque table dans sa colonne (voir ci-dessous). Les tables sans `lane` restent libres au glisser ; à la réorganisation, elles rejoignent la colonne de leurs voisines reliées, ou une colonne implicite à droite si elles n'en ont pas.
- **Affichage** : les bandes sont invisibles par défaut. Affichage > Colonnes > « Afficher les colonnes » les fait apparaître avec leur titre en tête (le choix est mémorisé).
- **Autocomplétion** : snippet `Lanes`, paramètre `lane:` et noms des colonnes déclarées.
- **DBML standard** : « Copier en DBML standard » retire le bloc `Lanes` et les paramètres `lane:` (les autres paramètres de la table sont conservés). Un `lane:` qui ne correspond à aucune colonne déclarée est une erreur de syntaxe.

## Grouper et filtrer les relations

Un bloc `Ref` nommé, standard en DBML, regroupe visuellement des relations et se filtre dans le panneau Affichage — comme un `Mapping`, mais pour de simples clés étrangères :

```
Ref liens_commandes [color: #b5651d] {
  order_items.order_id > orders.id [delete: cascade]
  order_items.product_id > products.id [update: cascade]
}
```

- `[color: #hex, note: '…']` sur l'en-tête du bloc sont facultatifs ; sans couleur explicite, une couleur de la palette est attribuée automatiquement, comme pour les `Mapping`.
- Plusieurs blocs `Ref` portant le **même nom** fusionnent en un seul groupe dans le panneau Affichage (leurs couleurs/notes se complètent) : pratique pour regrouper des relations écrites à des endroits différents du fichier.
- Une relation autonome (`Ref: a.b > c.d`) ou dans un bloc `Ref { }` sans nom reste une clé étrangère ordinaire, non groupée.
- Ceci est du DBML standard, sans extension : ces blocs restent compatibles avec dbdiagram.io et `@dbml/core`, qui affichent les relations sans tenir compte du regroupement ni de la couleur.

## Régions imbriquées (extension DBML Studio)

Un `TableGroup` peut en contenir un autre :

```
TableGroup commandes [color: #b5651d] {
  orders
  order_items
  TableGroup retours [color: #999999] {
    returns
  }
}
```

- Une table n'appartient qu'à une seule région, à quelque niveau que ce soit : la même table dans deux régions, ou dans une région et une sous-région, est une erreur signalée à la bonne ligne. Un nom de région dupliqué aussi.
- **Affichage :** le cadre d'une région englobe ses propres tables et les cadres de ses sous-régions (dessinés par-dessus). Déplacer, verrouiller, masquer ou supprimer une région agit sur tout son contenu, sous-régions comprises ; replier une sous-région la réduit à une pastille dans le cadre parent, replier la région parente la réduit entièrement. Les décalages automatiques au repli / dépli remontent niveau par niveau, et **Réorganiser** place chaque sous-région comme un bloc rigide sans chevauchement. `Copier en DBML standard` aplatit chaque région imbriquée en une région à plat listant toutes ses tables, pour rester compatible avec dbdiagram.io et `@dbml/core`.

## Limites connues

- Édition à sens unique : texte → diagramme
- Ignorés à l'affichage : `Project`, `Note` autonomes, `TablePartial`, `Records` ; `indexes` n'est exploité que pour les clés primaires composites et `unique`
- Une région ne peut pas encore être redimensionnée à la souris (sa taille suit toujours le contenu)
- Les régions imbriquées s'affichent emboîtées et s'aplatissent à l'export vers du DBML standard
- Pas de retour à la ligne dans l'éditeur : une ligne très longue déborde avec un ascenseur horizontal plutôt que de se replier

## Icône et raccourci

Le dossier `assets/` contient l'icône (`icon.svg`, `icon.png`, `icon.ico`). Elle est aussi intégrée comme favicon : l'onglet du navigateur l'affiche.

- **Windows** : `assets/creer-raccourci-windows.ps1` crée un raccourci sur le Bureau avec l'icône. À la main : clic droit sur le fichier HTML > Créer un raccourci > Propriétés > Changer d'icône > `icon.ico`.
- **Linux** : `assets/creer-raccourci-linux.sh` crée un lanceur dans le menu des applications.
- **macOS** : créer un alias, puis Lire les informations, glisser `icon.png` sur la petite icône en haut à gauche.
- **Chrome / Edge** : ouvrir l'outil, menu > Enregistrer et partager > Créer un raccourci (ou Installer) : l'icône du favicon sera utilisée.

## Licence

MIT — voir `LICENSE`.
