# Contexte et consignes pour les agents IA — System Diagram

Ce fichier concerne tout le projet. Le maintenir à jour lorsque les demandes de l’utilisateur font évoluer les fonctionnalités ou les choix techniques. Les instructions explicites de l’utilisateur priment sur ce contexte. Répondre et écrire les textes de l’interface en français.

## Objectif utilisateur

Créer un logiciel de pré-schématique permettant de dessiner des synoptiques en vue système, avec une interaction proche de draw.io : blocs fonctionnels, interfaces typées, connexions, bibliothèque personnelle et annotations. L’utilisateur doit pouvoir organiser librement son architecture avant de réaliser un schéma électronique.

## Fonctionnalités demandées à préserver

### Composants et bibliothèque

- Créer et déplacer des blocs, modifier leur nom, leur description et leur catégorie.
- Catégories : MCU, Capteur, Actionneur, Alimentation, Communication, IHM, Autre.
- Définir les entrées, sorties et interfaces bidirectionnelles de chaque bloc.
- Types de port : Logique, Analogique, I2C, UART, SPI, PWM, 5V, 3.3V, 12V, GND, Custom.
- Custom : saisir le nom du type à la main et choisir la famille Signal ou Alimentation.
- Créer des composants dans une bibliothèque personnelle, y enregistrer un bloc configuré, importer et exporter la bibliothèque en JSON.
- Chaque instance possède ses propres identifiants de ports ; modifier une instance ne modifie pas les autres.
- Redimensionner un bloc avec sa poignée en bas à droite et ses champs largeur/hauteur dans l’inspecteur.
- Conserver les dimensions dans le projet et lors de l’enregistrement d’un composant en bibliothèque.

### Géométrie et connexions

- Les fils doivent être exclusivement horizontaux ou verticaux, jamais diagonaux ni courbes.
- Blocs et pins doivent rester sur la grille de 10 px, à toute échelle de zoom.
- Formes des pins : carré pour entrée, triangle pour sortie, losange pour bidirectionnel.
- Cliquer sur un pin pour commencer un fil, cliquer dans la vue pour poser les points de passage, terminer sur un pin compatible. Ajouter automatiquement les coudes nécessaires.
- Déplacer les angles avec leurs poignées ; double-cliquer sur un segment pour ajouter un point de passage.
- Tirer directement sur un segment pour le décaler perpendiculairement. Garder ses extrémités attachées aux pins.
- Le fil hérite du type de sa source. Les directions et types doivent être compatibles. Les noms des types Custom doivent correspondre.
- Une connexion peut avoir un libellé Custom manuel ; ce libellé ne doit pas changer la compatibilité ou les calculs électriques.
- Repositionner les pins sur les quatre côtés du bloc avec l’outil Pins ou les poignées d’extrémité d’un fil. Alt + glisser permet un placement intérieur, toujours sur la grille.
- Tous les fils d’un pin suivent ce pin. Le redimensionnement suit les pins manuels ancrés aux bords droit et inférieur et maintient les autres pins dans le bloc.
- Préserver une taille minimale lisible : largeur 140 px, hauteur selon le nombre de ports. L’espacement des pins automatiques s’adapte à la hauteur.
- Masquer séparément les pins d’alimentation et les pins de signaux avec leurs fils, sans supprimer leurs données.

### Consommation

- Déclarer le courant consommé propre de chaque bloc en mA, positif ou nul.
- Remonter les consommations par les liens d’alimentation orientés aux alimentations en amont, y compris via les blocs intermédiaires.
- Exclure les signaux et GND ; compter chaque charge distincte une seule fois par source, même si plusieurs chemins y conduisent.
- Distinguer la consommation propre de la source de la charge aval qu’elle fournit.
- Signaler les cycles et les charges ayant plusieurs sources. Sans répartition définie, attribuer la charge entière à chaque source et l’expliquer.
- Permettre de masquer individuellement la consommation de chaque bloc (ou sa charge aval pour une alimentation), avec un bouton dans son inspecteur. Ce réglage est indépendant pour chaque bloc, notamment ceux qui ne consomment rien.
- Le masquage conserve les valeurs, les calculs, l’édition dans l’inspecteur et la géométrie. L’état est sauvegardé dans `block.showCurrent` (booléen facultatif, visible par défaut) et exporté avec le projet et le composant en bibliothèque. Migrer l’ancien filtre global vers les réglages individuels sans perdre la préférence.
- Le calcul est une somme des valeurs déclarées : aucune conversion de tension, aucun rendement de régulateur, aucune simulation électrique. Présenter cette limite clairement.

### Dessins et texte

- Outil Rectangle : créer par glissement, déplacer, redimensionner, régler couleur, épaisseur, trait continu/tirets/pointillés et remplissage léger facultatif.
- Outil Texte : créer par clic, saisir librement avec retours à la ligne, déplacer et redimensionner sa zone.
- Régler police, taille, couleur, gras, italique, soulignement et alignement du texte.
- Dessins indépendants des composants et enregistrés dans `project.annotations`.
- Placer les dessins derrière les composants et les fils pour délimiter des groupes sans bloquer leur édition. Un rectangle se déplace par son bord.

### Projet et ergonomie

- Sauvegarde locale automatique, ouverture/export JSON, compatibilité des anciens projets.
- Conserver projets, bibliothèques, positions, tracés, consommations, dimensions, annotations et réglages de visibilité.
- Annulation/rétablissement des modifications ; supprimer un bloc ou un port supprime aussi ses connexions.
- Zoom à la molette, déplacement par espace + glisser ou l’outil Déplacer, cadrage de l’ensemble.
- Raccourcis : V sélection, W connexion, H déplacer, P pins, R rectangle, T texte, Suppr supprimer, Ctrl+Z/Ctrl+Y historique, Échap annuler. Retour arrière retire le dernier point pendant un tracé.
- Ne pas déclencher les raccourcis pendant l’édition d’un champ ou d’une boîte de dialogue.

## Architecture actuelle et lancement

Choix d’implémentation actuels, pouvant évoluer si l’utilisateur le demande : HTML/CSS/JavaScript natifs, sans framework, compilation ni dépendance JavaScript externe.

- `index.html` : structure et contrôles. Charger `drawings.js` avant `app.js`.
- `app.js` : modèle, bibliothèque, validation, historique, sauvegarde, géométrie, connexions, budgets de courant et interactions sur les blocs.
- `drawings.js` : validation, rendu et interactions des rectangles/textes.
- `style.css` et `features.css` : apparence de l’atelier, interface claire en français.
- `server.js` : serveur HTTP local, fichiers publics explicitement autorisés, écoute sur `127.0.0.1:4173`.
- `core.test.js` : tests du modèle avec `node:test` et une frontière DOM simulée.
- `README.md` : guide utilisateur et limites du prototype.

Lancer `node server.js`, puis ouvrir `http://127.0.0.1:4173/`. L’ouverture directe de `index.html` est aussi possible. Les polices Google sont facultatives, avec remplacement par les polices système hors ligne.

Le stockage utilise la clé `systemdiagram-v1` et contient `{ project, library }`. Formats d’export : `systemdiagram-project` et `systemdiagram-library`, version 1. Les champs ajoutés sont facultatifs pour les anciens fichiers ; normaliser la géométrie lors de l’ouverture.

## Consignes d’implémentation et de vérification

- Préserver les données existantes ; ne pas remplacer le projet de l’utilisateur par une démonstration lors des tests.
- Tester l’interface dans une session/origine distincte (par exemple `localhost` pour les tests et `127.0.0.1` pour le projet utilisateur) afin d’isoler le stockage local.
- Initialiser les constantes de validation avant de restaurer le stockage. Une erreur d’ordre d’initialisation ne doit pas faire perdre la restauration d’un projet.
- Conserver l’orthogonalité et l’alignement des endpoints après déplacement, redimensionnement, import, annulation et rechargement. Les pins dessinés doivent correspondre exactement aux extrémités des fils.
- Garder les objets DOM et les métadonnées temporaires de routage hors des JSON sauvegardés.
- Valider les imports : références des ports, identifiants uniques, coordonnées finies, tailles/courants admissibles, couleurs et styles autorisés. Échapper les textes de l’utilisateur au rendu HTML/SVG.
- Grouper une opération de glissement ou une session d’édition dans l’historique. Ne pas reconstruire le champ actif à chaque frappe.
- Les filtres d’affichage ne doivent pas modifier le modèle électrique ou déplacer les blocs/pins/fils.
- Pour une modification du modèle ou de la géométrie, exécuter `node --test core.test.js` et compléter les tests lorsqu’ils vérifient un comportement utile.
- Vérifier la syntaxe des fichiers JavaScript modifiés avec `node --check`. Pour les interactions, vérifier aussi dans le navigateur, notamment après rechargement.
- L’application n’a pas de rechargement automatique : recharger le navigateur après modification. Si la liste des fichiers du serveur change, redémarrer le serveur.
- Mettre à jour `README.md` et ce contexte quand le fonctionnement change.
- Ne pas ajouter de simulation électronique, routage PCB, compte distant ou publication sans demande de l’utilisateur.

## Limites connues à ne pas présenter comme des fonctions réalisées

Pas de simulation électrique, de vérification des limites de courant ou de calcul de rendement. Les interfaces peuvent représenter des groupes fonctionnels (ex. SDA/SCL pour I2C), pas nécessairement des broches physiques. Le routage orthogonal ne garantit pas l’évitement de tous les obstacles. Le stockage est propre au navigateur et à l’origine ; l’export JSON permet de conserver ou transférer le travail.

## Sélection multiple et thème
- Sélection par rectangle depuis une zone vide avec l’outil Sélection ; sélectionner les objets touchés, y compris fils visibles et annotations. Glisser un objet sélectionné déplace le groupe sur la grille ; supprimer le groupe nettoie les connexions aux blocs supprimés. Une opération correspond à une annulation. Les fils gardent leurs pins et leur orthogonalité.
- Mode sombre/clair via le bouton supérieur, préférence locale `systemdiagram-theme`, indépendante des données du projet. Préserver la lisibilité des pins et des fils.
- Les pins de sortie triangulaires doivent présenter un contour de leur couleur de type et un centre adapté au thème, comme les entrées et les pins bidirectionnels ; préserver leur centre sur la grille et leur orientation gauche/droite.

- Édition de bibliothèque par le crayon de chaque carte : modifier la définition dans l’inspecteur avec sauvegarde et historique, sans modifier les instances existantes.
- Export graphique SVG vectoriel autonome et PNG (dimension maximale 4096 px), thème courant et filtres respectés, dessins inclus, sans poignées de sélection. Conserver les exports JSON.
- Déploiement Workers GitHub : `node build.js` copie uniquement les cinq fichiers publics dans `dist`, puis `npx wrangler deploy` utilise `wrangler.jsonc`. Ne jamais publier toute la racine comme assets ; les captures, contexte et fichiers de développement ne font pas partie du site.
