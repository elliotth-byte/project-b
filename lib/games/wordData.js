// Unchanged from the original artifact — this logic doesn't touch storage
// at all, so it needed zero changes for the Supabase migration.

export const WORD_SETS = [
  { name: "The Castle", words: ["THRONE", "KNIGHT", "SHIELD", "CROWN", "FEAST", "TOWER", "MOTTO"] },
  { name: "Elements", words: ["FLAME", "FROST", "STORM", "OCEAN", "EARTH", "SMOKE", "SPARK"] },
  { name: "Creatures", words: ["TIGER", "EAGLE", "SHARK", "VIPER", "RAVEN", "WOLF", "FALCON"] },
  { name: "Cosmos", words: ["COMET", "LUNAR", "ORBIT", "SOLAR", "VENUS", "NOVA", "COSMOS"] },
  { name: "Gems & Stones", words: ["AMBER", "IVORY", "CORAL", "PEARL", "SLATE", "ONYX", "TOPAZ"] },
  { name: "Mythology", words: ["ATLAS", "HYDRA", "TITAN", "SIREN", "MEDUSA", "CHAOS", "ORACLE"] },
  { name: "Spycraft", words: ["CIPHER", "AGENT", "DECOY", "VAULT", "TRACE", "MOLE", "SIGNAL"] },
  { name: "Kitchen", words: ["BROTH", "SPICE", "ROAST", "CREAM", "OLIVE", "SAUCE", "GRAVY"] },
  { name: "Weather", words: ["BLAZE", "SLEET", "CLOUD", "GALES", "HUMID", "MISTY", "THAW"] },
  { name: "Music", words: ["PIANO", "DRUMS", "VOCAL", "CHORD", "TEMPO", "SOLO", "VERSE"] },
  { name: "Pirates", words: ["PIRATE", "CUTLASS", "GALLEON", "ANCHOR", "PLUNDER", "MUTINY", "COMPASS"] },
  { name: "Desert", words: ["CACTUS", "DUNES", "OASIS", "MIRAGE", "CAMEL", "CANYON", "DROUGHT"] },
  { name: "Rainforest", words: ["JUNGLE", "CANOPY", "TOUCAN", "VINE", "HUMID", "PARROT", "JAGUAR"] },
  { name: "Arctic", words: ["GLACIER", "IGLOO", "WALRUS", "TUNDRA", "AURORA", "BLIZZARD", "PENGUIN"] },
  { name: "Volcano", words: ["MAGMA", "LAVA", "ERUPT", "ASH", "CRATER", "FISSURE", "OBSIDIAN"] },
  { name: "Circus", words: ["JUGGLE", "TRAPEZE", "CLOWN", "RINGMASTER", "ACROBAT", "TENT", "STILTS"] },
  { name: "Carnival", words: ["FERRIS", "TICKET", "BALLOON", "TOFFEE", "GAMES", "PRIZE", "PARADE"] },
  { name: "Baking", words: ["FLOUR", "YEAST", "BATTER", "FROSTING", "KNEAD", "OVEN", "PASTRY"] },
  { name: "Coffee Shop", words: ["ESPRESSO", "LATTE", "BARISTA", "BEANS", "FOAM", "MOCHA", "BREW"] },
  { name: "Farm Life", words: ["TRACTOR", "BARN", "HARVEST", "PASTURE", "SILO", "PLOW", "LIVESTOCK"] },
  { name: "Beekeeping", words: ["HONEY", "HIVE", "NECTAR", "POLLEN", "SWARM", "QUEEN", "COMB"] },
  { name: "Gardening", words: ["PRUNE", "TROWEL", "COMPOST", "BLOOM", "SEEDLING", "MULCH", "TRELLIS"] },
  { name: "Astronomy", words: ["GALAXY", "METEOR", "NEBULA", "ECLIPSE", "TELESCOPE", "ASTEROID", "QUASAR"] },
  { name: "Chemistry", words: ["BEAKER", "SOLVENT", "ISOTOPE", "CATALYST", "ACID", "MOLECULE", "REAGENT"] },
  { name: "Geology", words: ["BEDROCK", "MINERAL", "TECTONIC", "FOSSIL", "QUARTZ", "STRATA", "BASALT"] },
  { name: "Ocean Life", words: ["CORAL", "PLANKTON", "OCTOPUS", "URCHIN", "STARFISH", "KELP", "ANEMONE"] },
  { name: "Deep Sea", words: ["ABYSS", "TRENCH", "SONAR", "PRESSURE", "BIOLUME", "SUBMARINE", "DEPTH"] },
  { name: "Rivers", words: ["CURRENT", "RAPIDS", "DELTA", "TRIBUTARY", "BANKS", "ESTUARY", "FLOODPLAIN"] },
  { name: "Mountains", words: ["SUMMIT", "RIDGE", "CLIFF", "ALTITUDE", "BOULDER", "AVALANCHE", "BASECAMP"] },
  { name: "Caves", words: ["STALACTITE", "CAVERN", "ECHO", "SPELUNK", "LIMESTONE", "TUNNEL", "DARKNESS"] },
  { name: "Knights & Chivalry", words: ["ARMOR", "LANCE", "JOUST", "SQUIRE", "HONOR", "BANNER", "CASTLE"] },
  { name: "Vikings", words: ["LONGSHIP", "RAIDER", "RUNE", "FJORD", "SHIELD", "SAGA", "HORN"] },
  { name: "Samurai", words: ["KATANA", "HONOR", "BUSHIDO", "DOJO", "ARMOR", "SHOGUN", "DUEL"] },
  { name: "Wild West", words: ["SALOON", "OUTLAW", "LASSO", "RANCH", "SHERIFF", "STAMPEDE", "CANYON"] },
  { name: "Space Race", words: ["ROCKET", "ORBIT", "LAUNCH", "CAPSULE", "GRAVITY", "MODULE", "THRUST"] },
  { name: "Robots", words: ["CIRCUIT", "ANDROID", "SENSOR", "GEARS", "CIRCUITRY", "ACTUATOR", "WIRING"] },
  { name: "Time Travel", words: ["PARADOX", "PORTAL", "FUTURE", "TIMELINE", "VORTEX", "PAST", "LOOP"] },
  { name: "Superheroes", words: ["CAPE", "POWERS", "VILLAIN", "RESCUE", "MASK", "JUSTICE", "SIDEKICK"] },
  { name: "Fairy Tales", words: ["CASTLE", "DRAGON", "SPELL", "WITCH", "PRINCE", "FOREST", "CURSE"] },
  { name: "Dinosaurs", words: ["FOSSIL", "REPTILE", "EXTINCT", "JURASSIC", "PREDATOR", "HERBIVORE", "AMBER"] },
  { name: "Egyptian", words: ["PYRAMID", "PHARAOH", "SPHINX", "PAPYRUS", "MUMMY", "TOMB", "OASIS"] },
  { name: "Greek Ruins", words: ["COLUMN", "TEMPLE", "MARBLE", "ORACLE", "AGORA", "ODYSSEY", "LYRE"] },
  { name: "Roman Empire", words: ["LEGION", "SENATE", "GLADIATOR", "AQUEDUCT", "EMPEROR", "FORUM", "CHARIOT"] },
  { name: "Medieval Market", words: ["MERCHANT", "GUILD", "COIN", "TRADE", "STALL", "BARTER", "WAGON"] },
  { name: "Renaissance", words: ["FRESCO", "SCULPTOR", "PATRON", "CANVAS", "PIGMENT", "STUDIO", "MASTERY"] },
  { name: "Industrial Age", words: ["FACTORY", "STEAM", "ENGINE", "ASSEMBLY", "FURNACE", "PISTON", "FOUNDRY"] },
  { name: "Wall Street", words: ["STOCKS", "MARKET", "BROKER", "LEDGER", "PROFIT", "BUBBLE", "TICKER"] },
  { name: "Startup Life", words: ["PITCH", "FUNDING", "LAUNCH", "GROWTH", "EQUITY", "HUSTLE", "DISRUPT"] },
  { name: "Hospital", words: ["SCALPEL", "MONITOR", "STRETCHER", "SUTURE", "TRIAGE", "VITALS", "WARD"] },
  { name: "Dentistry", words: ["MOLAR", "ENAMEL", "CAVITY", "FLOSS", "BRACES", "PLAQUE", "DRILL"] },
  { name: "Optics", words: ["LENS", "REFRACT", "PRISM", "MIRROR", "FOCUS", "SPECTRUM", "APERTURE"] },
  { name: "Photography", words: ["SHUTTER", "EXPOSURE", "APERTURE", "FILTER", "NEGATIVE", "FLASH", "ZOOM"] },
  { name: "Filmmaking", words: ["DIRECTOR", "SCRIPT", "EDIT", "CAMERA", "SCENE", "STUDIO", "TRAILER"] },
  { name: "Theater", words: ["CURTAIN", "REHEARSE", "STAGE", "SPOTLIGHT", "ENCORE", "PROP", "BALCONY"] },
  { name: "Ballet", words: ["POINTE", "BARRE", "PIROUETTE", "TUTU", "LEOTARD", "RECITAL", "GRACE"] },
  { name: "Jazz Age", words: ["SAXOPHONE", "SWING", "TRUMPET", "RHYTHM", "LOUNGE", "BEBOP", "GROOVE"] },
  { name: "Opera", words: ["ARIA", "LIBRETTO", "SOPRANO", "CHORUS", "MAESTRO", "BALCONY", "OVATION"] },
  { name: "Rock Concert", words: ["AMP", "ENCORE", "MOSHPIT", "BACKSTAGE", "SETLIST", "STROBE", "RIFF"] },
  { name: "Video Games", words: ["CONTROLLER", "PIXEL", "LEVEL", "RESPAWN", "QUEST", "ARCADE", "BOSSFIGHT"] },
  { name: "Board Games", words: ["DICE", "TOKEN", "STRATEGY", "SHUFFLE", "BANKER", "TURN", "ROLL"] },
  { name: "Card Games", words: ["SHUFFLE", "DEALER", "BLUFF", "TRUMP", "DISCARD", "WILDCARD", "STRAIGHT"] },
  { name: "Chess", words: ["BISHOP", "KNIGHT", "ROOK", "CHECKMATE", "GAMBIT", "ENDGAME", "STALEMATE"] },
  { name: "Poker Night", words: ["BLUFF", "ANTE", "FLUSH", "RAISE", "CHIPS", "DEALER", "JACKPOT"] },
  { name: "Casino", words: ["ROULETTE", "JACKPOT", "DEALER", "WAGER", "SLOTS", "CHIPS", "VEGAS"] },
  { name: "Marathon", words: ["STAMINA", "FINISH", "PACING", "SPRINT", "HYDRATE", "ENDURE", "MEDAL"] },
  { name: "Swimming", words: ["STROKE", "LAPS", "GOGGLES", "DIVE", "FREESTYLE", "BUOYANCY", "POOLSIDE"] },
  { name: "Surfing", words: ["WAVE", "BOARD", "BARREL", "PADDLE", "SWELL", "TIDE", "WIPEOUT"] },
  { name: "Skiing", words: ["SLOPE", "POWDER", "CHAIRLIFT", "MOGUL", "AVALANCHE", "GOGGLES", "ALPINE"] },
  { name: "Skateboarding", words: ["OLLIE", "GRIND", "DECK", "RAMP", "KICKFLIP", "WHEELS", "CONCRETE"] },
  { name: "Rock Climbing", words: ["BELAY", "CARABINER", "CRAG", "SUMMIT", "CHALK", "HARNESS", "ASCENT"] },
  { name: "Camping", words: ["TENT", "CAMPFIRE", "LANTERN", "SLEEPINGBAG", "TRAIL", "COMPASS", "MARSHMALLOW"] },
  { name: "Fishing", words: ["TACKLE", "REEL", "BAIT", "HOOK", "CURRENT", "ANGLER", "CATCH"] },
  { name: "Hunting", words: ["TRACKER", "BLIND", "ANTLER", "CAMOUFLAGE", "TRAIL", "QUIVER", "STALK"] },
  { name: "Archery", words: ["QUIVER", "TARGET", "FLETCHING", "BOWSTRING", "ARCHER", "RELEASE", "BULLSEYE"] },
  { name: "Fencing", words: ["FOIL", "PARRY", "LUNGE", "TOUCH", "MASK", "BLADE", "DUEL"] },
  { name: "Boxing", words: ["JAB", "UPPERCUT", "RINGSIDE", "GLOVES", "ROUND", "KNOCKOUT", "CORNER"] },
  { name: "Wrestling", words: ["TAKEDOWN", "GRAPPLE", "MAT", "PIN", "ARENA", "CHAMPION", "STANCE"] },
  { name: "Gymnastics", words: ["VAULT", "BALANCE", "TUMBLE", "ROUTINE", "FLEXIBLE", "LANDING", "RINGS"] },
  { name: "Rodeo", words: ["BRONCO", "LASSO", "SPUR", "SADDLE", "ARENA", "WRANGLER", "BARREL"] },
  { name: "Sailing", words: ["RIGGING", "STARBOARD", "MAINSAIL", "ANCHOR", "KEEL", "HARBOR", "TIDE"] },
  { name: "Aviation", words: ["COCKPIT", "RUNWAY", "ALTITUDE", "TURBINE", "RADAR", "HANGAR", "THROTTLE"] },
  { name: "Trains", words: ["LOCOMOTIVE", "CABOOSE", "PLATFORM", "TRACKS", "WHISTLE", "BOXCAR", "DEPOT"] },
  { name: "Road Trip", words: ["HIGHWAY", "DETOUR", "MOTEL", "SNACKS", "PLAYLIST", "MILEAGE", "RESTSTOP"] },
  { name: "Subway", words: ["TURNSTILE", "PLATFORM", "TUNNEL", "TRANSIT", "COMMUTE", "STATION", "SCHEDULE"] },
  { name: "Lighthouse", words: ["BEACON", "COASTLINE", "KEEPER", "FOGHORN", "SHOAL", "HARBOR", "SIGNAL"] },
  { name: "Shipwreck", words: ["WRECKAGE", "SALVAGE", "HULL", "CARGO", "SEABED", "ANCHOR", "DEBRIS"] },
  { name: "Treasure Hunt", words: ["MAP", "COMPASS", "BURIED", "CLUE", "CHEST", "RIDDLE", "LANDMARK"] },
  { name: "Detective", words: ["CLUE", "SUSPECT", "ALIBI", "MAGNIFIER", "WITNESS", "MOTIVE", "EVIDENCE"] },
  { name: "Heist", words: ["VAULT", "GETAWAY", "BLUEPRINT", "LOCKPICK", "DISGUISE", "SAFECRACKER", "LOOKOUT"] },
  { name: "Courtroom", words: ["VERDICT", "JURY", "TESTIMONY", "OBJECTION", "GAVEL", "WITNESS", "EVIDENCE"] },
  { name: "Newsroom", words: ["HEADLINE", "DEADLINE", "BYLINE", "EDITOR", "BULLETIN", "REPORTER", "ARCHIVE"] },
  { name: "Library", words: ["ARCHIVE", "CATALOG", "SHELF", "MANUSCRIPT", "BINDING", "QUIET", "FOLIO"] },
  { name: "Bookstore", words: ["NOVEL", "BINDING", "SHELF", "BESTSELLER", "PAPERBACK", "AUTHOR", "BOOKMARK"] },
  { name: "Poetry", words: ["STANZA", "RHYME", "METER", "VERSE", "SONNET", "METAPHOR", "CADENCE"] },
  { name: "Architecture", words: ["BLUEPRINT", "FACADE", "PILLAR", "ARCHWAY", "FOUNDATION", "SKYLINE", "TRUSS"] },
  { name: "Interior Design", words: ["PALETTE", "TEXTURE", "LAYOUT", "ACCENT", "FIXTURE", "DRAPERY", "MOODBOARD"] },
  { name: "Fashion", words: ["RUNWAY", "FABRIC", "STITCH", "DESIGNER", "SILHOUETTE", "TREND", "COUTURE"] },
  { name: "Perfumery", words: ["ESSENCE", "AROMA", "BLEND", "DISTILL", "FRAGRANT", "NOTES", "BOTTLE"] },
  { name: "Jewelry Making", words: ["GEMSTONE", "SOLDER", "CLASP", "SETTING", "POLISH", "FACET", "FILIGREE"] },
  { name: "Pottery", words: ["KILN", "GLAZE", "CLAY", "WHEEL", "CERAMIC", "SCULPT", "FIRING"] },
  { name: "Woodworking", words: ["LATHE", "CHISEL", "SAWDUST", "JOINERY", "VARNISH", "GRAIN", "WORKBENCH"] },
  { name: "Blacksmithing", words: ["FORGE", "ANVIL", "BELLOWS", "TEMPER", "HAMMER", "EMBER", "ALLOY"] },
  { name: "Origami", words: ["CREASE", "FOLD", "PAPER", "CRANE", "SYMMETRY", "DIAGONAL", "GEOMETRY"] },
  { name: "Calligraphy", words: ["INKWELL", "NIB", "STROKE", "PARCHMENT", "FLOURISH", "SCRIPT", "QUILL"] },
  { name: "Puzzle Solving", words: ["RIDDLE", "LOGIC", "PATTERN", "CIPHER", "SOLUTION", "CLUE", "SEQUENCE"] },
  { name: "Escape Room", words: ["LOCKBOX", "RIDDLE", "TIMER", "CLUE", "HIDDEN", "PUZZLE", "COUNTDOWN"] },
  { name: "Magic Show", words: ["ILLUSION", "VANISH", "SLEIGHT", "WAND", "TRICK", "AUDIENCE", "REVEAL"] },
  { name: "Haunted House", words: ["PHANTOM", "CREAK", "SHADOW", "COBWEB", "CANDLE", "WHISPER", "ATTIC"] },
  { name: "Zombie Apocalypse", words: ["OUTBREAK", "SURVIVOR", "BARRICADE", "INFECTED", "BUNKER", "SCAVENGE", "QUARANTINE"] },
  { name: "Alien Invasion", words: ["SPACESHIP", "INVADER", "SIGNAL", "ABDUCT", "RAYGUN", "MOTHERSHIP", "GALAXY"] },
  { name: "Wizardry", words: ["SPELLBOOK", "POTION", "WAND", "INCANTATION", "CAULDRON", "ENCHANT", "SORCERER"] },
  { name: "Dragons", words: ["SCALES", "TALON", "HOARD", "FLAME", "WINGSPAN", "LAIR", "LEGEND"] },
  { name: "Pirates of Legend", words: ["DOUBLOON", "MAROONED", "SCURVY", "PARROT", "GALLEON", "BOOTY", "MUTINEER"] },
  { name: "Safari", words: ["SAVANNA", "HERD", "BINOCULARS", "WATERHOLE", "GUIDE", "TRACKS", "LION"] },
  { name: "Coral Reef", words: ["ANEMONE", "LAGOON", "POLYP", "REEF", "TIDEPOOL", "SEAHORSE", "CLOWNFISH"] },
  { name: "Butterfly Garden", words: ["COCOON", "CHRYSALIS", "NECTAR", "METAMORPH", "WINGSPAN", "MEADOW", "POLLINATE"] },
];
import { COLOR_BLIND_SAFE_PALETTE } from "./colorBlindPalette";

export const WORDS_PER_SET = 7;
// Always uses the colorblind-safe palette — unlike Match 3, there's no
// "vibrant default" tradeoff being made here, so this doesn't need to be
// gated behind the player's colorblind preference (see
// lib/gamePrefs.js): a safe palette costs nothing for anyone who doesn't
// need it.
export const WORD_COLORS = COLOR_BLIND_SAFE_PALETTE;
export const WORD_FONTS = [
  "'Courier New', Courier, monospace",
  "'Orbitron', 'Segoe UI', sans-serif",
  "'Brush Script MT', cursive",
  "'Trebuchet MS', sans-serif",
  "'Georgia', serif",
  "'Impact', 'Arial Narrow Bold', sans-serif",
  "'Consolas', 'Lucida Console', monospace",
];

export function playerHash(name, seed) {
  let h = seed || 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getPlayerWordSet(playerName, seed) {
  return WORD_SETS[playerHash(playerName, seed) % WORD_SETS.length];
}

export function initFloatingLetters(words, W, H) {
  const letters = [];
  words.forEach((word, wi) => {
    for (const char of word) {
      letters.push({
        char, wi,
        x: Math.random() * (W - 28) + 4,
        y: Math.random() * (H - 32) + 4,
        // Movement speed — deliberately gentle. This runs on
        // requestAnimationFrame with no throttling (see
        // WordScramblePlayer.jsx's animate loop: `l.x += l.vx` every
        // single frame, ~60 times/sec), so even a modest-looking vx/vy
        // value here translates to real, fast on-screen motion — players
        // found the original values (up to ~2px/frame) too fast to
        // actually read letters while tracking them.
        vx: (Math.random() - 0.5) * 0.5 + (Math.random() > 0.5 ? 0.12 : -0.12),
        vy: (Math.random() - 0.5) * 0.5 + (Math.random() > 0.5 ? 0.12 : -0.12),
        // Anti-screenshot: each letter fades in and out on its own cycle
        // (randomized period + phase, so they're never all faded — or all
        // visible — at the same instant). A single screenshot only ever
        // catches a partial view; solving still requires actually
        // watching the board for a few seconds. See the render loop in
        // WordScramblePlayer.jsx for how this opacity is applied. Slowed
        // down alongside the movement speed above, for the same reason —
        // a faster flicker was making it harder to actually read a
        // letter in the moment it's visible.
        fadePeriodMs: 3000 + Math.random() * 2000,
        fadePhase: Math.random() * Math.PI * 2,
      });
    }
  });
  return letters.sort(() => Math.random() - 0.5);
}

