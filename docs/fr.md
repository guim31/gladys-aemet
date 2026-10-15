# AEMET

La météo officielle de l'**Espagne** dans Gladys, depuis **AEMET OpenData**, le service de données ouvertes de
l'Agence nationale de météorologie espagnole : la prévision de l'heure en cours, les extrêmes du jour, les
**avertissements Meteoalerta** (jaune, orange, rouge) et l'observation de la station météo la plus proche, pour
la péninsule, les Baléares, les Canaries, Ceuta et Melilla. Pensée pour les maisons de vacances et les
frontaliers.

Cette intégration n'est pas affiliée à l'AEMET. Elle a été développée sans compte AEMET sous la main, sur des
réponses réelles publiées de l'API : vos retours sont les bienvenus.

## Présentation

- **Un appareil par commune** (cinq au plus), en lecture seule.
- **Prévision de l'heure en cours** : température, ressenti, humidité, vent, rafales, direction du vent,
  probabilité de pluie, pluie prévue sur l'heure, ciel (traduit).
- **Aujourd'hui** : indice UV (maximum du jour), températures minimale et maximale.
- **Avertissements** : niveau en cours, niveau le plus haut à venir, et un texte qui les liste.
- **Station** : température, humidité, pression, pluie de la dernière heure et vent mesurés à la station AEMET
  la plus proche (40 km au plus).
- Un **widget** de tableau de bord et un **déclencheur de scène** « Nouvel avertissement AEMET ».

## Prérequis

- Gladys **5.2.0** ou plus récent (l'action « Trouver la commune la plus proche » choisit une maison Gladys).
- Une **clé d'API AEMET OpenData**, gratuite.
- Un accès Internet depuis Gladys : l'intégration ne parle qu'à `opendata.aemet.es`.

## Configuration

### Clé d'API

Ouvrez [la demande de clé AEMET OpenData](https://opendata.aemet.es/centrodedescargas/altaUsuario), saisissez
votre adresse e-mail et résolvez le captcha. L'AEMET envoie un lien de confirmation, puis la clé elle-même par
e-mail peu après : un long texte qui commence par `eyJ`. Collez-la dans le champ **Clé d'API**.

### Communes

Le champ **Communes** prend les **codes INE** à cinq chiffres des communes, séparés par des virgules (`28079`
pour Madrid, `07040` pour Palma). Le code figure dans l'adresse de la page de la commune sur aemet.es
(`…/madrid-id28079`) : cette adresse peut être collée telle quelle. Cinq communes au plus.

Pour éviter la recherche, l'action **Trouver la commune la plus proche** prend une maison Gladys (sa position
se règle dans les paramètres de Gladys) et ajoute la commune espagnole la plus proche au champ. Rechargez la
page pour la voir, puis ajoutez l'appareil depuis l'onglet **Découverte**.

L'action **Tester la connexion** vérifie la clé et nomme chaque commune et sa station.

### Langue

Le champ **Langue** règle la langue des noms de fonctionnalités (figés à l'ajout de l'appareil : supprimez et
ajoutez de nouveau l'appareil pour les renommer), de l'état du ciel, des avertissements et des textes de scène.
Français par défaut. Le widget suit la langue de chaque utilisateur.

## L'appareil de la commune

Chaque commune donne un appareil **AEMET <commune>**, avec ces fonctionnalités.

### Prévisions

| Fonctionnalité                                                    | Unité      |
| ----------------------------------------------------------------- | ---------- |
| Température (prévision), ressenti                                 | °C         |
| Humidité (prévision)                                              | %          |
| Vent, rafales (prévision)                                         | km/h       |
| Direction du vent (d'où il vient, 0 = nord ; rien par vent calme) | °          |
| Probabilité de pluie (la tranche de 6 heures de l'heure en cours) | %          |
| Pluie de l'heure (prévision)                                      | mm         |
| Ciel (texte, par ex. « Couvert avec neige »)                      |            |
| Indice UV (max du jour), minimale du jour, maximale du jour       | indice, °C |

La prévision est celle que l'AEMET publie pour la commune, heure par heure : les valeurs changent chaque heure,
même entre deux relevés.

### Avertissements

| Fonctionnalité                     | Valeurs                                                               |
| ---------------------------------- | --------------------------------------------------------------------- |
| Niveau d'avertissement actuel      | 0 aucun, 1 jaune, 2 orange, 3 rouge : les avertissements en cours     |
| Avertissement le plus haut à venir | même échelle, avertissements en cours et annoncés                     |
| Avertissements                     | texte, par ex. « Rouge: Neige; Orange: Grand froid (dès lun. 00:00) » |

Une commune reçoit les avertissements de sa zone Meteoalerta (la `zona_comarcal` que l'AEMET donne à la
commune).

### Observation de la station

Température, humidité, pression (au niveau de la mer quand la station la calcule), pluie de la dernière heure et
vent moyen de la station la plus proche, à moins de 40 km. Un relevé de plus de trois heures n'est pas publié.

## Rafraîchissement et quota

L'AEMET limite les requêtes de chaque clé, et chaque relevé coûte deux requêtes (l'AEMET répond par l'adresse
des données, téléchargées ensuite). L'intégration lit, pour chaque commune ajoutée à Gladys :

- les prévisions toutes les **30 minutes** ;
- la station toutes les **30 minutes** (un relevé par heure à l'AEMET) ;
- les avertissements toutes les **10 minutes**, une fois par région pour toutes ses communes.

Soit environ 24 requêtes par heure et par commune. Après un échec, la tentative suivante attend 5 minutes, 15
après un refus de quota. Seules les valeurs qui changent sont envoyées à Gladys, et chaque valeur au moins
toutes les 6 heures. L'intégration se rafraîchit d'elle-même : elle ne dépend pas de l'interrogation par Gladys.

## Widget du tableau de bord

**Prévisions AEMET** : choisissez la commune dans les réglages. Il montre en direct la température, la
probabilité de pluie, le vent et l'UV, les cinq prochains jours (ciel, min / max, probabilité de pluie) et les
avertissements, dans la langue de l'utilisateur. Pas de bouton.

## Déclencheur de scène : nouvel avertissement AEMET

Se déclenche une fois par avertissement, dès que l'AEMET le publie, même plusieurs jours avant, et de nouveau
quand l'AEMET en relève le niveau. Les avertissements déjà en cours au démarrage de l'intégration, ou à l'ajout
d'une commune, ne sont pas annoncés.

Filtres (tous facultatifs) : **commune**, **niveau** (jaune, orange, rouge), **phénomène** (pluie, neige, vent,
orages, fortes chaleurs, grand froid, phénomènes côtiers, brouillard, poussières, avalanches, rissaga, dégel,
autre).

Informations transmises à la scène : commune, niveau (`yellow`, `orange`, `red`), résumé (niveau, phénomène et
période dans la langue configurée), titre AEMET (en espagnol), début et fin (ISO), déjà en cours.

## Exemples de scènes

- **Me prévenir d'un avertissement orange ou rouge à la maison de vacances** : déclencheur « Nouvel
  avertissement AEMET », commune = la maison, niveau = orange, rouge ; action « Envoyer un message » avec le
  résumé.
- **Fermer les volets avant une tempête** : déclencheur « Nouvel avertissement AEMET », phénomène = vent,
  niveau = orange, rouge ; puis fermer les volets.
- **Alerte gel** : déclencheur sur la fonctionnalité « Minimale du jour » sous 0 °C, envoyer un message le soir.

## Dépannage

- **« AEMET a refusé la clé d'API »** : vérifiez la clé (une seule ligne, sans espace) ; demandez-en une
  nouvelle si besoin.
- **« AEMET limite les requêtes de cette clé »** : la clé est partagée avec un autre outil, ou il y a trop de
  communes : les relevés reprennent d'eux-mêmes.
- **Aucun appareil dans Découverte** : lancez **Tester la connexion** ; un code erroné y est nommé.
- **Pas de valeurs de station** : aucune station AEMET à moins de 40 km, ou ses relevés sont en retard.
- **Journaux** : l'intégration n'écrit que les erreurs et son cycle de vie ; réglez `LOG_LEVEL=debug` pour voir
  chaque relevé. La clé n'est jamais écrite.

## Limites

- Espagne seulement (la couverture de l'AEMET).
- Les avertissements côtiers concernent des zones littorales, distinctes de la zone terrestre d'une commune :
  ils peuvent ne pas atteindre une commune du bord de mer.
- La station la plus proche est choisie automatiquement et peut mal représenter une commune de montagne.
- Les noms des fonctionnalités sont figés à l'ajout de l'appareil.
- Développée sans compte AEMET : les fichiers d'avertissement ont été construits d'après le format CAP que
  l'AEMET documente. Vos retours sont les bienvenus.
