// Script de génération des fichiers de mission SPECTRA avec les 122 mots fournis
const fs = require('fs');
const path = require('path');

// === LISTE DES 122 MOTS (dédupliqués : EQUINOXE x2, ZENITH x3 -> un seul chacun) ===
const wordsData = [
  { id: "liberation",       answer: "LIBERATION",       cat: "Politique",     def: "Ce que cherche tout peuple opprimé." },
  { id: "architecture",     answer: "ARCHITECTURE",     cat: "Urbanisme",     def: "L'art de concevoir et construire des espaces." },
  { id: "territoire",       answer: "TERRITOIRE",       cat: "Géographie",    def: "Une zone délimitée appartenant à une autorité." },
  { id: "ambassade",        answer: "AMBASSADE",        cat: "Politique",     def: "Le bâtiment officiel représentant un pays à l'étranger." },
  { id: "ultimatum",        answer: "ULTIMATUM",        cat: "Politique",     def: "Une exigence finale. Après, c'est la guerre." },
  { id: "patrimoine",       answer: "PATRIMOINE",       cat: "Culture",       def: "L'héritage transmis de génération en génération." },
  { id: "equinoxe",         answer: "EQUINOXE",         cat: "Astronomie",    def: "Le jour où la nuit et le jour durent exactement la même durée." },
  { id: "enigme",           answer: "ENIGME",           cat: "Jeu",           def: "Une question dont la réponse est cachée." },
  { id: "souverain",        answer: "SOUVERAIN",        cat: "Politique",     def: "Celui qui détient le pouvoir suprême." },
  { id: "topographie",      answer: "TOPOGRAPHIE",      cat: "Géographie",    def: "L'étude et la représentation du relief d'un terrain." },
  { id: "diplomatie",       answer: "DIPLOMATIE",       cat: "Politique",     def: "L'art de négocier entre nations sans recourir à la force." },
  { id: "aqueduc",          answer: "AQUEDUC",          cat: "Hydraulique",   def: "Construction romaine permettant de transporter l'eau sur de longues distances." },
  { id: "navigation",       answer: "NAVIGATION",       cat: "Exploration",   def: "L'art de se déplacer sur l'eau ou dans les airs." },
  { id: "sanctuaire",       answer: "SANCTUAIRE",       cat: "Religion",      def: "Un lieu sacré ou protégé. Un refuge." },
  { id: "volcan",           answer: "VOLCAN",           cat: "Géologie",      def: "Une montagne qui crache du feu." },
  { id: "observatoire",     answer: "OBSERVATOIRE",     cat: "Astronomie",    def: "Un lieu équipé pour scruter le ciel." },
  { id: "trajectoire",      answer: "TRAJECTOIRE",      cat: "Physique",      def: "Le chemin suivi par un objet en mouvement." },
  { id: "renaissance",      answer: "RENAISSANCE",      cat: "Histoire",      def: "Période de renouveau culturel en Europe entre le XIVe et XVIIe siècle." },
  { id: "ecosysteme",       answer: "ECOSYSTEME",       cat: "Écologie",      def: "L'ensemble des êtres vivants et leur environnement en interaction." },
  { id: "cartographie",     answer: "CARTOGRAPHIE",     cat: "Géographie",    def: "L'art de dessiner des cartes." },
  { id: "expedition",       answer: "EXPEDITION",       cat: "Exploration",   def: "Un voyage organisé vers un lieu difficile d'accès." },
  { id: "longitude",        answer: "LONGITUDE",        cat: "Géographie",    def: "Coordonnée géographique est-ouest." },
  { id: "latitude",         answer: "LATITUDE",         cat: "Géographie",    def: "Coordonnée géographique nord-sud." },
  { id: "urbanisme",        answer: "URBANISME",        cat: "Urbanisme",     def: "La science de l'organisation des villes." },
  { id: "luminescence",     answer: "LUMINESCENCE",     cat: "Physique",      def: "L'émission de lumière par un corps sans chaleur." },
  { id: "eclipse",          answer: "ECLIPSE",          cat: "Astronomie",    def: "Quand un astre en cache un autre." },
  { id: "denomination",     answer: "DENOMINATION",     cat: "Linguistique",  def: "Le nom donné à quelque chose." },
  { id: "erosion",          answer: "EROSION",          cat: "Géologie",      def: "La dégradation progressive d'une surface par des agents naturels." },
  { id: "precipitation",    answer: "PRECIPITATION",    cat: "Météorologie",  def: "La pluie, la neige, la grêle. Ce qui tombe du ciel." },
  { id: "ultraviolet",      answer: "ULTRAVIOLET",      cat: "Physique",      def: "Rayonnement invisible à l'œil nu, au-delà du violet." },
  { id: "isotherme",        answer: "ISOTHERME",        cat: "Météorologie",  def: "Ligne reliant des points de même température sur une carte." },
  { id: "sociologie",       answer: "SOCIOLOGIE",       cat: "Sociologie",    def: "L'étude scientifique des sociétés humaines." },
  { id: "lithosphere",      answer: "LITHOSPHERE",      cat: "Géologie",      def: "La couche externe solide de la Terre." },
  { id: "enumerate",        answer: "ENUMERATE",        cat: "Langage",       def: "Lister un par un." },
  { id: "desertification",  answer: "DESERTIFICATION",  cat: "Écologie",      def: "Le processus par lequel une région fertile devient aride." },
  { id: "eolienne",         answer: "EOLIENNE",         cat: "Énergie",       def: "Une machine qui transforme le vent en énergie." },
  { id: "biodiversite",     answer: "BIODIVERSITE",     cat: "Écologie",      def: "La variété du vivant sur Terre." },
  { id: "urbanisation",     answer: "URBANISATION",     cat: "Urbanisme",     def: "Le phénomène par lequel les populations se concentrent en ville." },
  { id: "tectonique",       answer: "TECTONIQUE",       cat: "Géologie",      def: "La science des plaques qui composent la croûte terrestre." },
  { id: "geologie",         answer: "GEOLOGIE",         cat: "Sciences",      def: "L'étude de la composition et de l'histoire de la Terre." },
  { id: "astronomie",       answer: "ASTRONOMIE",       cat: "Astronomie",    def: "La science qui étudie les astres et l'univers." },
  { id: "ruissellement",    answer: "RUISSELLEMENT",    cat: "Hydrologie",    def: "L'écoulement de l'eau sur une surface." },
  { id: "densite",          answer: "DENSITE",          cat: "Physique",      def: "Le rapport entre une masse et le volume qu'elle occupe." },
  { id: "evaporation",      answer: "EVAPORATION",      cat: "Physique",      def: "Le passage d'un liquide à l'état gazeux." },
  { id: "zenith",           answer: "ZENITH",           cat: "Astronomie",    def: "Le point le plus haut du ciel, directement au-dessus de l'observateur." },
  { id: "lagon",            answer: "LAGON",            cat: "Géographie",    def: "Une étendue d'eau douce ou salée séparée de la mer par un récif." },
  { id: "escarpement",      answer: "ESCARPEMENT",      cat: "Géologie",      def: "Une falaise abrupte formée par l'érosion ou une faille." },
  { id: "stalactite",       answer: "STALACTITE",       cat: "Géologie",      def: "Elle descend du plafond des grottes. Se souvenir : tient." },
  { id: "yucatan",          answer: "YUCATAN",          cat: "Géographie",    def: "Péninsule mexicaine. Berceau de la civilisation maya." },
  { id: "equateur",         answer: "EQUATEUR",         cat: "Géographie",    def: "La ligne imaginaire qui divise la Terre en deux hémisphères." },
  { id: "univers",          answer: "UNIVERS",          cat: "Astronomie",    def: "Tout ce qui existe. L'espace, le temps, la matière." },
  { id: "xenophile",        answer: "XENOPHILE",        cat: "Culture",       def: "Celui qui aime ce qui vient d'ailleurs." },
  { id: "oceanographie",    answer: "OCEANOGRAPHIE",    cat: "Sciences",      def: "L'étude scientifique des océans." },
  { id: "uvala",            answer: "UVALA",            cat: "Géologie",      def: "Une dépression karstique formée par la fusion de plusieurs dolines." },
  { id: "vegetation",       answer: "VEGETATION",       cat: "Écologie",      def: "L'ensemble des plantes couvrant une région." },
  { id: "relief",           answer: "RELIEF",           cat: "Géographie",    def: "Les formes du terrain : montagnes, vallées, plaines." },
  { id: "terrasse",         answer: "TERRASSE",         cat: "Géographie",    def: "Un replat artificiel ou naturel aménagé sur une pente." },
  { id: "seisme",           answer: "SEISME",           cat: "Géologie",      def: "Un tremblement de terre." },
  { id: "gravitation",      answer: "GRAVITATION",      cat: "Physique",      def: "La force qui attire les corps entre eux." },
  { id: "artificiel",       answer: "ARTIFICIEL",       cat: "Technique",     def: "Ce qui est fabriqué par l'homme et non par la nature." },
  { id: "reforestation",    answer: "REFORESTATION",    cat: "Écologie",      def: "Le replantation d'arbres sur des terres déboisées." },
  { id: "delta",            answer: "DELTA",            cat: "Géographie",    def: "L'embouchure d'un fleuve qui se divise en plusieurs bras." },
  { id: "estuaire",         answer: "ESTUAIRE",         cat: "Géographie",    def: "La partie d'un fleuve soumise à l'influence des marées." },
  { id: "baobab",           answer: "BAOBAB",           cat: "Botanique",     def: "L'arbre qui stocke l'eau dans son tronc. Le géant des savanes." },
  { id: "mangrove",         answer: "MANGROVE",         cat: "Écologie",      def: "Forêt côtière tropicale aux racines plongeant dans l'eau salée." },
  { id: "savane",           answer: "SAVANE",           cat: "Géographie",    def: "Vaste étendue herbeuse des régions tropicales." },
  { id: "fleuve",           answer: "FLEUVE",           cat: "Géographie",    def: "Un cours d'eau qui se jette dans la mer." },
  { id: "maree",            answer: "MAREE",            cat: "Géographie",    def: "Le mouvement régulier de la mer sous l'effet de la Lune." },
  { id: "tornade",          answer: "TORNADE",          cat: "Météorologie",  def: "Un tourbillon de vent extrêmement puissant." },
  { id: "cyclone",          answer: "CYCLONE",          cat: "Météorologie",  def: "Une tempête tropicale tournoyante." },
  { id: "brousse",          answer: "BROUSSE",          cat: "Géographie",    def: "Zone végétale africaine entre forêt et savane." },
  { id: "plateau",          answer: "PLATEAU",          cat: "Géographie",    def: "Une étendue plane en altitude." },
  { id: "vallee",           answer: "VALLEE",           cat: "Géographie",    def: "Un creux entre deux reliefs parcouru par un cours d'eau." },
  { id: "montagne",         answer: "MONTAGNE",         cat: "Géographie",    def: "Une élévation naturelle du terrain." },
  { id: "glacier",          answer: "GLACIER",          cat: "Géographie",    def: "Une masse de glace qui se déplace lentement." },
  { id: "fjord",            answer: "FJORD",            cat: "Géographie",    def: "Une vallée glaciaire envahie par la mer. Typique de Norvège." },
  { id: "archipel",         answer: "ARCHIPEL",         cat: "Géographie",    def: "Un groupe d'îles." },
  { id: "peninsule",        answer: "PENINSULE",        cat: "Géographie",    def: "Une terre entourée d'eau sur trois côtés." },
  { id: "isthme",           answer: "ISTHME",           cat: "Géographie",    def: "Une bande de terre étroite reliant deux continents." },
  { id: "tropique",         answer: "TROPIQUE",         cat: "Géographie",    def: "Ligne imaginaire parallèle à l'équateur." },
  { id: "meridien",         answer: "MERIDIEN",         cat: "Géographie",    def: "Ligne imaginaire reliant les pôles." },
  { id: "parallele",        answer: "PARALLELE",        cat: "Géographie",    def: "Ligne imaginaire parallèle à l'équateur." },
  { id: "altitude",         answer: "ALTITUDE",         cat: "Géographie",    def: "La hauteur par rapport au niveau de la mer." },
  { id: "profondeur",       answer: "PROFONDEUR",       cat: "Géographie",    def: "La distance vers le bas. L'opposé de l'altitude." },
  { id: "superficie",       answer: "SUPERFICIE",       cat: "Géographie",    def: "L'étendue d'une surface mesurée en km²." },
  { id: "population",       answer: "POPULATION",       cat: "Sociologie",    def: "L'ensemble des habitants d'un territoire." },
  { id: "migration",        answer: "MIGRATION",        cat: "Sociologie",    def: "Le déplacement d'une population d'un lieu à un autre." },
  { id: "diaspora",         answer: "DIASPORA",         cat: "Sociologie",    def: "Une communauté dispersée loin de sa terre d'origine." },
  { id: "frontiere",        answer: "FRONTIERE",        cat: "Politique",     def: "La ligne qui sépare deux pays." },
  { id: "capitale",         answer: "CAPITALE",         cat: "Politique",     def: "La ville principale d'un État." },
  { id: "metropole",        answer: "METROPOLE",        cat: "Urbanisme",     def: "Une grande ville qui rayonne sur sa région." },
  { id: "banlieue",         answer: "BANLIEUE",         cat: "Urbanisme",     def: "La périphérie d'une grande ville." },
  { id: "quartier",         answer: "QUARTIER",         cat: "Urbanisme",     def: "Une subdivision d'une ville." },
  { id: "commerce",         answer: "COMMERCE",         cat: "Économie",      def: "L'échange de biens et de services contre de l'argent." },
  { id: "agriculture",      answer: "AGRICULTURE",      cat: "Économie",      def: "L'art de cultiver la terre pour nourrir les hommes." },
  { id: "elevage",          answer: "ELEVAGE",          cat: "Économie",      def: "L'art d'élever des animaux pour leur lait, viande ou travail." },
  { id: "peche",            answer: "PECHE",            cat: "Économie",      def: "L'activité qui consiste à capturer des poissons." },
  { id: "industrie",        answer: "INDUSTRIE",        cat: "Économie",      def: "L'ensemble des activités de transformation de matières premières." },
  { id: "energie",          answer: "ENERGIE",          cat: "Économie",      def: "La capacité à produire un travail ou de la chaleur." },
  { id: "petrole",          answer: "PETROLE",          cat: "Économie",      def: "L'or noir. Ressource fossile extraite du sous-sol." },
  { id: "charbon",          answer: "CHARBON",          cat: "Économie",      def: "Roche noire combustible. À l'origine de la révolution industrielle." },
  { id: "solaire",          answer: "SOLAIRE",          cat: "Énergie",       def: "Qui vient du soleil." },
  { id: "hydraulique",      answer: "HYDRAULIQUE",      cat: "Énergie",       def: "Qui utilise la force de l'eau." },
  { id: "nucleaire",        answer: "NUCLEAIRE",        cat: "Énergie",       def: "Qui utilise l'énergie du noyau de l'atome." },
  { id: "transport",        answer: "TRANSPORT",        cat: "Économie",      def: "Le déplacement de personnes ou de marchandises." },
  { id: "infrastructure",   answer: "INFRASTRUCTURE",   cat: "Économie",      def: "Les équipements de base d'un territoire : routes, ponts, réseaux." },
  { id: "telecommunication",answer: "TELECOMMUNICATION",cat: "Technologie",   def: "La transmission d'informations à distance." },
  { id: "satellite",        answer: "SATELLITE",        cat: "Technologie",   def: "Un objet placé en orbite autour de la Terre." },
  { id: "atmosphere",       answer: "ATMOSPHERE",       cat: "Météorologie",  def: "La couche gazeuse qui enveloppe la Terre." },
  { id: "ozone",            answer: "OZONE",            cat: "Environnement", def: "La couche qui protège la Terre des rayons ultraviolets." },
  { id: "rechauffement",    answer: "RECHAUFFEMENT",    cat: "Environnement", def: "L'augmentation progressive de la température moyenne de la Terre." },
  { id: "biodegradable",    answer: "BIODEGRADABLE",    cat: "Environnement", def: "Qui peut être décomposé par des organismes vivants." },
  { id: "compost",          answer: "COMPOST",          cat: "Environnement", def: "De la matière organique décomposée servant d'engrais naturel." },
  { id: "irrigation",       answer: "IRRIGATION",       cat: "Agriculture",   def: "L'apport artificiel d'eau aux cultures." },
  { id: "barrage",          answer: "BARRAGE",          cat: "Hydraulique",   def: "Une construction retenant l'eau d'un cours d'eau." },
  { id: "reservoir",        answer: "RESERVOIR",        cat: "Hydraulique",   def: "Un bassin artificiel stockant de l'eau." },
  { id: "nappe",            answer: "NAPPE",            cat: "Hydraulique",   def: "Une étendue d'eau souterraine." },
  { id: "aquifere",         answer: "AQUIFERE",         cat: "Hydraulique",   def: "Une formation géologique contenant de l'eau souterraine." },
  { id: "pluie",            answer: "PLUIE",            cat: "Météorologie",  def: "De l'eau qui tombe du ciel sous forme de gouttes." },
  { id: "brume",            answer: "BRUME",            cat: "Météorologie",  def: "Un léger brouillard. La visibilité est réduite." },
  { id: "givre",            answer: "GIVRE",            cat: "Météorologie",  def: "De la glace qui se forme sur les surfaces par temps froid." },
  { id: "grele",            answer: "GRELE",            cat: "Météorologie",  def: "De la glace qui tombe du ciel sous forme de petites boules." },
];

// Directions uniquement rectilignes (standard mots mêlés)
const paths = ['horizontal', 'vertical', 'diagonal', 'horizontalReverse', 'verticalReverse', 'diagonalReverse'];

// Positions dans le message secret (non-espaces et non-tirets)
// "RENDEZ-VOUS OPERATION FESTIN"
const secretMessage = "RENDEZ-VOUS OPERATION FESTIN";
const revealPositions = [];
for (let i = 0; i < secretMessage.length; i++) {
  if (secretMessage[i] !== ' ' && secretMessage[i] !== '-') {
    revealPositions.push(i);
  }
}

// Générer words array
const words = wordsData.map((w, i) => ({
  id: w.id,
  answer: w.answer,
  category: w.cat,
  path: paths[i % paths.length],
  reveal: i < revealPositions.length ? [revealPositions[i]] : [],
  dependsOn: []
}));

// Générer enigmas array (toutes initiales = visible dès le départ)
const enigmas = wordsData.map((w, i) => ({
  id: `e-${w.id}`,
  wordId: w.id,
  text: w.def,
  unlock: { initial: true }
}));

const wordsJson = JSON.stringify({ secretMessage, words }, null, 2);
const enigmasJson = JSON.stringify({ enigmas }, null, 2);

const missionDir = path.join(__dirname, '..', 'missions', 'operation-festin');
fs.writeFileSync(path.join(missionDir, 'words.json'), wordsJson, 'utf8');
fs.writeFileSync(path.join(missionDir, 'enigmas.json'), enigmasJson, 'utf8');

console.log(`✅ ${words.length} mots générés dans words.json`);
console.log(`✅ ${enigmas.length} enigmes générées dans enigmas.json`);
console.log(`✅ Message secret: "${secretMessage}"`);
console.log(`✅ Positions révélées: ${revealPositions.length} lettres distribuées sur les ${Math.min(words.length, revealPositions.length)} premiers mots`);
