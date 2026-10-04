# System Diagram

Atelier de synoptiques système, en français. Prototype web sans compilation ni dépendance JavaScript.

## Lancer

Ouvrir `index.html` dans un navigateur, ou lancer `node server.js` puis ouvrir http://localhost:4173.

## Utilisation

- Cliquer sur un composant de la bibliothèque pour le placer ; glisser un bloc pour le déplacer.
- Sélectionner un bloc pour modifier son nom, sa fonction, sa description et ses ports.
- Cliquer sur un port puis sur un autre pour les connecter. Le fil hérite du type de son origine. Les types doivent correspondre et les directions doivent être compatibles. Les interfaces bidirectionnelles sont prises en charge.
- Entre les deux ports, chaque clic gauche place un point de passage. Les fils sont exclusivement horizontaux ou verticaux : des coudes sont ajoutés automatiquement lorsque nécessaire. Sélectionner un fil affiche des poignées carrées pour déplacer ses angles. On peut aussi tirer directement sur un segment pour le décaler perpendiculairement ; les extrémités restent attachées aux pins. Double-cliquer sur un segment ajoute un point de passage. Retour arrière retire le dernier point pendant le tracé ; Échap annule le tracé. Le bouton Routage automatique réinitialise le parcours manuel.
- Les blocs et les pins se calent sur la grille de 10 px, y compris après ouverture d’un ancien projet. Un pin d’entrée est carré, un pin de sortie est triangulaire, et un pin bidirectionnel est un losange.
- Sélectionner un bloc et tirer la poignée en bas à droite pour changer sa taille, ou saisir sa largeur et sa hauteur dans l’inspecteur. La largeur minimale est de 140 px ; la hauteur minimale réserve la place pour les ports. Les pins automatiques se redistribuent, les pins manuels sur les bords droit et inférieur suivent ces bords, et les connexions restent attachées. Les dimensions sont conservées dans les projets et les composants enregistrés en bibliothèque.
- Ports : Logique, Analogique, I2C, UART, SPI, PWM, 5V, 3.3V, 12V, GND, Custom. Un port Custom possède un nom de type saisi à la main (ex. CAN) et une famille Signal ou Alimentation. Deux ports Custom doivent porter le même nom de type. Une connexion peut aussi recevoir un libellé Custom dans son inspecteur ; ce libellé ne change pas la compatibilité des ports ni la nature électrique du lien.
- Les boutons Pins alimentation / Pins signaux cachent les pins de la famille correspondante et leurs fils, sans supprimer les connexions ni changer les calculs. Leur état est enregistré avec le projet.
- Chaque bloc possède dans son inspecteur un bouton pour afficher ou masquer sa consommation (ou sa charge aval pour une alimentation), indépendamment des autres blocs. Les valeurs restent modifiables dans l’inspecteur, les calculs restent actifs, et les blocs, pins et fils gardent leur position. Ce réglage est enregistré et exporté avec le projet.
- L’outil Positionner les pins (P) permet de glisser un pin sur les quatre côtés du bloc. Maintenir Alt pendant le glissement permet de placer le pin librement à l’intérieur du bloc. Sur un fil sélectionné, les poignées rondes déplacent aussi les pins des extrémités ; tous les fils attachés au même pin suivent sa nouvelle position. L’inspecteur permet de rétablir la position automatique d’un pin.
- Catégories : MCU, Capteur, Actionneur, Alimentation, Communication, IHM, Autre. Un écran OLED illustre la catégorie IHM.
- Déclarer le courant consommé propre d’un bloc en mA dans l’inspecteur. Les blocs Alimentation affichent la somme des consommations des blocs aval reliés par des liens d’alimentation orientés, y compris à travers des blocs intermédiaires. Les signaux et GND sont exclus. Chaque bloc aval est compté une seule fois par source, même s’il est joignable par plusieurs chemins. L’inspecteur de l’alimentation détaille les charges et signale les cycles ou les blocs alimentés par plusieurs sources. Dans ce dernier cas, la charge entière est attribuée à chaque source : aucune répartition n’est supposée. La consommation propre de la source est indiquée séparément de la charge qu’elle fournit.
- Créer un composant, le placer, définir ses ports, puis l’enregistrer dans la bibliothèque. Les modifications d’une instance ne modifient pas les autres instances.
- Exporter/importer une bibliothèque et sauvegarder/ouvrir un projet au format JSON.
- Sauvegarde automatique dans le stockage du navigateur. Exporter le projet pour le transférer ou le conserver indépendamment du navigateur.
- Molette : zoom ; espace + glisser ou outil Déplacer : déplacement de la vue ; bouton Cadrer : vue d’ensemble.
- Rectangle (R) : glisser dans la vue pour dessiner un rectangle. Dans l’inspecteur, choisir la couleur, l’épaisseur et le type de trait (continu, tirets, pointillés), ainsi qu’un remplissage léger facultatif.
- Texte (T) : cliquer dans la vue, puis saisir le texte dans l’inspecteur. Les retours à la ligne sont conservés. Régler la police (sans serif, serif, monospace), la taille, la couleur, le gras, l’italique, le soulignement et l’alignement dans la zone de texte.
- Avec l’outil Sélection, glisser un texte ou le bord d’un rectangle pour le déplacer. La poignée en bas à droite redimensionne le dessin. Les rectangles sont placés derrière les composants et les connexions, pour délimiter des groupes fonctionnels sans gêner l’édition des blocs. Les dessins sont sauvegardés et exportés dans le projet JSON ; suppression et modification peuvent être annulées.
- V / W / H / P / R / T : outils ; Suppr : suppression ; Ctrl+Z / Ctrl+Y : historique ; Échap : annuler une création ou désélectionner.

La modification du type ou de la direction d’un port retire les connexions devenues incompatibles. La suppression d’un port ou bloc retire ses connexions. Ces actions peuvent être annulées.

## Périmètre

Ce prototype représente des interfaces fonctionnelles, pas des broches physiques : un port I2C peut représenter le groupe SDA/SCL. Le budget de courant additionne les valeurs déclarées sans conversion entre tensions, prise en compte de rendement, limite de courant ou simulation électrique. Les connexions suivent des segments horizontaux et verticaux, sans évitement automatique de tous les obstacles. La bibliothèque initiale est illustrative ; les ports doivent être adaptés aux modules réellement utilisés. Les anciens projets sans positions, angles, dessins ni consommations restent compatibles et utilisent une consommation de 0 mA par défaut.

## Vérification

`node --test core.test.js` vérifie les règles de connexion, les types personnalisés, la géométrie, l’historique, les budgets de courant, les cycles, les chemins multiples et le format JSON.

Les polices Google sont facultatives ; des polices système sont utilisées hors ligne.
