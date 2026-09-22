// Trivia bank, restructured around categories — each category has one
// question per difficulty (easy/medium/hard), so the player picks a
// difficulty AFTER seeing the category, not before seeing anything at
// all. Difficulty sets the points a correct answer is worth (see
// DIFFICULTY_POINTS) — a deliberate risk/reward choice each round,
// rather than a fixed points-per-correct-answer scheme.
export const DIFFICULTY_POINTS = { easy: 1, medium: 2, hard: 3 };

export const TRIVIA_CATEGORIES = [
  {
    category: "Geography",
    easy: { q: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
    medium: { q: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
    hard: { q: "Which country has the most time zones?", options: ["Russia", "USA", "France", "China"], answer: 2 },
  },
  {
    category: "Science",
    easy: { q: "Which element has the chemical symbol 'O'?", options: ["Gold", "Oxygen", "Osmium", "Silver"], answer: 1 },
    medium: { q: "What is the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi body"], answer: 2 },
    hard: { q: "What particle is exchanged to carry the electromagnetic force?", options: ["Gluon", "Photon", "Boson", "Neutrino"], answer: 1 },
  },
  {
    category: "History",
    easy: { q: "Who was the first President of the United States?", options: ["Adams", "Jefferson", "Washington", "Franklin"], answer: 2 },
    medium: { q: "In what year did the Berlin Wall fall?", options: ["1987", "1989", "1991", "1993"], answer: 1 },
    hard: { q: "Who was the Byzantine Emperor when Constantinople fell in 1453?", options: ["Justinian I", "Constantine XI", "Basil II", "Alexios I"], answer: 1 },
  },
  {
    category: "Arts & Literature",
    easy: { q: "Who painted the Mona Lisa?", options: ["Van Gogh", "Da Vinci", "Picasso", "Monet"], answer: 1 },
    medium: { q: "Who wrote '1984'?", options: ["Huxley", "Orwell", "Bradbury", "Vonnegut"], answer: 1 },
    hard: { q: "Which composer wrote the opera 'The Ring Cycle'?", options: ["Verdi", "Wagner", "Puccini", "Mozart"], answer: 1 },
  },
  {
    category: "Sports",
    easy: { q: "How many players are on a standard soccer team on the field?", options: ["9", "10", "11", "12"], answer: 2 },
    medium: { q: "In tennis, what score is called 'love'?", options: ["10", "5", "1", "0"], answer: 3 },
    hard: { q: "Which country has won the most FIFA World Cups?", options: ["Germany", "Argentina", "Brazil", "Italy"], answer: 2 },
  },
  {
    category: "Pop Culture",
    easy: { q: "What is the name of the wizarding school in Harry Potter?", options: ["Beauxbatons", "Durmstrang", "Hogwarts", "Ilvermorny"], answer: 2 },
    medium: { q: "Which band released the album 'Abbey Road'?", options: ["The Rolling Stones", "The Beatles", "Pink Floyd", "The Who"], answer: 1 },
    hard: { q: "Who directed the film 'Pulp Fiction'?", options: ["Scorsese", "Tarantino", "Fincher", "Nolan"], answer: 1 },
  },
  {
    category: "Food & Drink",
    easy: { q: "What is the main ingredient in guacamole?", options: ["Tomato", "Avocado", "Pepper", "Onion"], answer: 1 },
    medium: { q: "Which country is the origin of the croissant, as we know it today?", options: ["France", "Austria", "Italy", "Belgium"], answer: 1 },
    hard: { q: "What is the fermented tea beverage originating in Northeast China called?", options: ["Kombucha", "Kefir", "Kvass", "Amazake"], answer: 0 },
  },
  {
    category: "Space",
    easy: { q: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Mercury"], answer: 1 },
    medium: { q: "What is the name of the galaxy that contains our solar system?", options: ["Andromeda", "Triangulum", "Milky Way", "Whirlpool"], answer: 2 },
    hard: { q: "What is the name of the first spacecraft to land on a comet?", options: ["Voyager 1", "Rosetta/Philae", "New Horizons", "Cassini"], answer: 1 },
  },
  {
    category: "World Capitals",
    easy: { q: "What is the capital of Japan?", options: ["Seoul", "Beijing", "Tokyo", "Bangkok"], answer: 2 },
    medium: { q: "What is the capital of Egypt?", options: ["Cairo", "Alexandria", "Giza", "Luxor"], answer: 0 },
    hard: { q: "What is the capital of Kazakhstan?", options: ["Almaty", "Astana", "Bishkek", "Tashkent"], answer: 1 },
  },
  {
    category: "US Presidents",
    easy: { q: "Who was the 16th US President?", options: ["Lincoln", "Grant", "Jackson", "Monroe"], answer: 0 },
    medium: { q: "Who was President during the Louisiana Purchase?", options: ["Adams", "Jefferson", "Madison", "Monroe"], answer: 1 },
    hard: { q: "Who was the only US President to serve two non-consecutive terms?", options: ["Cleveland", "Taft", "Harrison", "Arthur"], answer: 0 },
  },
  {
    category: "Human Body",
    easy: { q: "What is the largest organ in the human body?", options: ["Liver", "Skin", "Lungs", "Heart"], answer: 1 },
    medium: { q: "How many chambers does the human heart have?", options: ["2", "3", "4", "5"], answer: 2 },
    hard: { q: "What is the smallest bone in the human body?", options: ["Stapes", "Femur", "Radius", "Patella"], answer: 0 },
  },
  {
    category: "Famous Paintings",
    easy: { q: "Who painted 'Starry Night'?", options: ["Monet", "Van Gogh", "Picasso", "Renoir"], answer: 1 },
    medium: { q: "Which artist painted 'Guernica'?", options: ["Dali", "Miro", "Picasso", "Gris"], answer: 2 },
    hard: { q: "Who painted 'The Persistence of Memory'?", options: ["Dali", "Magritte", "Ernst", "Klee"], answer: 0 },
  },
  {
    category: "Chemistry Basics",
    easy: { q: "What is the chemical symbol for gold?", options: ["Ag", "Au", "Gd", "Go"], answer: 1 },
    medium: { q: "What is the pH of pure water?", options: ["5", "7", "9", "10"], answer: 1 },
    hard: { q: "What is the most abundant gas in Earth's atmosphere?", options: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Argon"], answer: 2 },
  },
  {
    category: "Classic Literature",
    easy: { q: "Who wrote 'Pride and Prejudice'?", options: ["Bronte", "Austen", "Eliot", "Woolf"], answer: 1 },
    medium: { q: "Who wrote 'Moby-Dick'?", options: ["Melville", "Hawthorne", "Twain", "Poe"], answer: 0 },
    hard: { q: "Who wrote 'Crime and Punishment'?", options: ["Tolstoy", "Chekhov", "Dostoevsky", "Turgenev"], answer: 2 },
  },
  {
    category: "Olympics",
    easy: { q: "How often are the Summer Olympics held?", options: ["Every 2 years", "Every 4 years", "Every 5 years", "Every 3 years"], answer: 1 },
    medium: { q: "Which country has hosted the Summer Olympics the most times?", options: ["France", "UK", "USA", "Greece"], answer: 2 },
    hard: { q: "In what year were the first modern Olympics held?", options: ["1892", "1896", "1900", "1904"], answer: 1 },
  },
  {
    category: "Movies",
    easy: { q: "Which film won Best Picture at the 2020 Oscars?", options: ["1917", "Parasite", "Joker", "Ford v Ferrari"], answer: 1 },
    medium: { q: "Who directed 'Jaws'?", options: ["Lucas", "Spielberg", "Coppola", "Scorsese"], answer: 1 },
    hard: { q: "What was the first feature-length animated film?", options: ["Pinocchio", "Snow White", "Fantasia", "Bambi"], answer: 1 },
  },
  {
    category: "Television",
    easy: { q: "What city is 'Friends' set in?", options: ["Boston", "Chicago", "New York", "LA"], answer: 2 },
    medium: { q: "What is the fictional town in 'Twin Peaks'?", options: ["Twin Peaks", "Silent Hill", "Riverdale", "Hawkins"], answer: 0 },
    hard: { q: "Who created 'The Simpsons'?", options: ["Seth MacFarlane", "Matt Groening", "Trey Parker", "Mike Judge"], answer: 1 },
  },
  {
    category: "Countries & Flags",
    easy: { q: "Which country's flag features a maple leaf?", options: ["USA", "Canada", "Norway", "Ireland"], answer: 1 },
    medium: { q: "Which country's flag has a red circle on a white background?", options: ["China", "Japan", "Vietnam", "Korea"], answer: 1 },
    hard: { q: "Which country's flag is the only non-rectangular national flag?", options: ["Bhutan", "Nepal", "Tibet", "Nauru"], answer: 1 },
  },
  {
    category: "Mythology",
    easy: { q: "In Norse mythology, who is the god of thunder?", options: ["Odin", "Loki", "Thor", "Baldr"], answer: 2 },
    medium: { q: "In Egyptian mythology, who is the god of the underworld?", options: ["Ra", "Osiris", "Horus", "Anubis"], answer: 1 },
    hard: { q: "In Greek mythology, who carries the world on his shoulders?", options: ["Prometheus", "Atlas", "Cronus", "Zeus"], answer: 1 },
  },
  {
    category: "Music History",
    easy: { q: "Who is known as the 'King of Pop'?", options: ["Prince", "Michael Jackson", "Elvis", "James Brown"], answer: 1 },
    medium: { q: "What instrument did Louis Armstrong famously play?", options: ["Saxophone", "Trumpet", "Piano", "Clarinet"], answer: 1 },
    hard: { q: "Which composer went deaf later in life?", options: ["Mozart", "Bach", "Beethoven", "Chopin"], answer: 2 },
  },
  {
    category: "Inventions",
    easy: { q: "Who is credited with inventing the telephone?", options: ["Edison", "Bell", "Tesla", "Marconi"], answer: 1 },
    medium: { q: "What did Johannes Gutenberg invent?", options: ["Steam engine", "Printing press", "Telescope", "Compass"], answer: 1 },
    hard: { q: "Who invented the World Wide Web?", options: ["Steve Jobs", "Bill Gates", "Tim Berners-Lee", "Alan Turing"], answer: 2 },
  },
  {
    category: "Animals",
    easy: { q: "What is the fastest land animal?", options: ["Lion", "Cheetah", "Gazelle", "Horse"], answer: 1 },
    medium: { q: "What is the largest mammal on Earth?", options: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], answer: 1 },
    hard: { q: "What is the only mammal capable of true flight?", options: ["Flying Squirrel", "Bat", "Sugar Glider", "Colugo"], answer: 1 },
  },
  {
    category: "Plants & Botany",
    easy: { q: "What process do plants use to make food from sunlight?", options: ["Respiration", "Photosynthesis", "Germination", "Transpiration"], answer: 1 },
    medium: { q: "What is the tallest tree species in the world?", options: ["Redwood", "Sequoia", "Douglas Fir", "Eucalyptus"], answer: 0 },
    hard: { q: "What is the study of fungi called?", options: ["Botany", "Mycology", "Zoology", "Ecology"], answer: 1 },
  },
  {
    category: "US States",
    easy: { q: "Which US state is known as the 'Sunshine State'?", options: ["California", "Florida", "Arizona", "Texas"], answer: 1 },
    medium: { q: "Which US state has the largest population?", options: ["Texas", "New York", "California", "Florida"], answer: 2 },
    hard: { q: "Which US state was the last to join the union?", options: ["Alaska", "Hawaii", "Arizona", "New Mexico"], answer: 1 },
  },
  {
    category: "World Rivers",
    easy: { q: "What is the longest river in the world?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], answer: 1 },
    medium: { q: "Which river flows through Paris?", options: ["Rhine", "Seine", "Loire", "Thames"], answer: 1 },
    hard: { q: "Which river is the longest in South America?", options: ["Orinoco", "Parana", "Amazon", "Sao Francisco"], answer: 2 },
  },
  {
    category: "Space Exploration",
    easy: { q: "Who was the first human in space?", options: ["Neil Armstrong", "Yuri Gagarin", "John Glenn", "Buzz Aldrin"], answer: 1 },
    medium: { q: "What was the first artificial satellite launched into orbit?", options: ["Explorer 1", "Sputnik 1", "Vostok 1", "Voyager 1"], answer: 1 },
    hard: { q: "What is the name of NASA's Mars rover launched in 2020?", options: ["Curiosity", "Opportunity", "Perseverance", "Spirit"], answer: 2 },
  },
  {
    category: "Ancient Civilizations",
    easy: { q: "Which civilization built Machu Picchu?", options: ["Aztec", "Maya", "Inca", "Olmec"], answer: 2 },
    medium: { q: "The Code of Hammurabi originated in which ancient civilization?", options: ["Egypt", "Babylon", "Persia", "Sumer"], answer: 1 },
    hard: { q: "Which ancient wonder stood in the harbor of Rhodes?", options: ["Lighthouse of Alexandria", "Colossus of Rhodes", "Hanging Gardens", "Temple of Artemis"], answer: 1 },
  },
  {
    category: "World Wars",
    easy: { q: "In what year did World War II end?", options: ["1943", "1944", "1945", "1946"], answer: 2 },
    medium: { q: "What event triggered the start of World War I?", options: ["Sinking of the Lusitania", "Assassination of Archduke Franz Ferdinand", "Invasion of Poland", "Treaty of Versailles"], answer: 1 },
    hard: { q: "What was the codename for the D-Day invasion?", options: ["Operation Torch", "Operation Overlord", "Operation Market Garden", "Operation Neptune"], answer: 1 },
  },
  {
    category: "Nobel Prizes",
    easy: { q: "Who founded the Nobel Prize?", options: ["Alfred Nobel", "Marie Curie", "Albert Einstein", "Ivar Nobel"], answer: 0 },
    medium: { q: "Which scientist won the Nobel Prize in Physics twice... actually who won two DIFFERENT Nobel Prizes?", options: ["Einstein", "Marie Curie", "Bohr", "Fermi"], answer: 1 },
    hard: { q: "In what Swedish city is the Nobel Prize ceremony held (except the Peace Prize)?", options: ["Gothenburg", "Malmo", "Stockholm", "Uppsala"], answer: 2 },
  },
  {
    category: "Currencies",
    easy: { q: "What is the currency of Japan?", options: ["Won", "Yuan", "Yen", "Ringgit"], answer: 2 },
    medium: { q: "What is the currency of Switzerland?", options: ["Euro", "Swiss Franc", "Krone", "Guilder"], answer: 1 },
    hard: { q: "What was the currency of Germany before the Euro?", options: ["Deutsche Mark", "Reichsmark", "Thaler", "Gulden"], answer: 0 },
  },
  {
    category: "Languages",
    easy: { q: "What is the most spoken native language in the world?", options: ["English", "Spanish", "Mandarin Chinese", "Hindi"], answer: 2 },
    medium: { q: "Which language uses the Cyrillic alphabet?", options: ["Polish", "Russian", "Czech", "Hungarian"], answer: 1 },
    hard: { q: "What is the official language of Brazil?", options: ["Spanish", "Portuguese", "French", "Italian"], answer: 1 },
  },
  {
    category: "Board Game History",
    easy: { q: "In which country did the game of chess originate?", options: ["China", "India", "Persia", "Egypt"], answer: 1 },
    medium: { q: "What game uses a board of 64 alternating dark and light squares?", options: ["Checkers", "Chess", "Backgammon", "Go"], answer: 1 },
    hard: { q: "What is the ancient Chinese board game also known as 'Weiqi'?", options: ["Mahjong", "Go", "Xiangqi", "Shogi"], answer: 1 },
  },
  {
    category: "Famous Landmarks",
    easy: { q: "In which country is the Taj Mahal located?", options: ["Pakistan", "India", "Bangladesh", "Nepal"], answer: 1 },
    medium: { q: "The Christ the Redeemer statue overlooks which city?", options: ["Buenos Aires", "Rio de Janeiro", "Lima", "Bogota"], answer: 1 },
    hard: { q: "Which ancient site in Jordan is carved into rose-colored rock?", options: ["Palmyra", "Petra", "Baalbek", "Jerash"], answer: 1 },
  },
  {
    category: "Weather & Climate",
    easy: { q: "What instrument measures atmospheric pressure?", options: ["Thermometer", "Barometer", "Hygrometer", "Anemometer"], answer: 1 },
    medium: { q: "What is the term for a tropical cyclone in the Pacific?", options: ["Hurricane", "Typhoon", "Cyclone", "Monsoon"], answer: 1 },
    hard: { q: "What is the Coriolis effect caused by?", options: ["Ocean currents", "Earth's rotation", "Solar radiation", "Air pressure"], answer: 1 },
  },
  {
    category: "Cars & Engineering",
    easy: { q: "Which company manufactures the Model 3?", options: ["Ford", "Tesla", "GM", "Rivian"], answer: 1 },
    medium: { q: "What does 'RPM' stand for in an engine?", options: ["Rate Per Minute", "Revolutions Per Minute", "Rotations Per Mile", "Ratio Per Motor"], answer: 1 },
    hard: { q: "Who is credited with developing the assembly line for cars?", options: ["Karl Benz", "Henry Ford", "Ransom Olds", "Louis Chevrolet"], answer: 1 },
  },
  {
    category: "Famous Scientists",
    easy: { q: "Who developed the theory of general relativity?", options: ["Newton", "Einstein", "Bohr", "Hawking"], answer: 1 },
    medium: { q: "Who is known as the father of modern genetics?", options: ["Darwin", "Mendel", "Watson", "Pasteur"], answer: 1 },
    hard: { q: "Who discovered penicillin?", options: ["Pasteur", "Fleming", "Koch", "Lister"], answer: 1 },
  },
  {
    category: "World Religions",
    easy: { q: "What is the holy book of Islam called?", options: ["Torah", "Quran", "Bible", "Vedas"], answer: 1 },
    medium: { q: "In which country did Buddhism originate?", options: ["China", "India", "Nepal", "Thailand"], answer: 1 },
    hard: { q: "What is the Jewish New Year called?", options: ["Yom Kippur", "Passover", "Rosh Hashanah", "Hanukkah"], answer: 2 },
  },
  {
    category: "Sports Records",
    easy: { q: "Who holds the record for most Olympic gold medals?", options: ["Usain Bolt", "Michael Phelps", "Carl Lewis", "Mark Spitz"], answer: 1 },
    medium: { q: "Which country has won the most FIFA Men's World Cups?", options: ["Germany", "Argentina", "Brazil", "Italy"], answer: 2 },
    hard: { q: "Who holds the men's 100m sprint world record?", options: ["Tyson Gay", "Usain Bolt", "Justin Gatlin", "Yohan Blake"], answer: 1 },
  },
  {
    category: "Basketball",
    easy: { q: "How many players from each team are on the court at once?", options: ["4", "5", "6", "7"], answer: 1 },
    medium: { q: "Who is the NBA's all-time leading scorer as of 2023?", options: ["Kobe Bryant", "Kareem Abdul-Jabbar", "LeBron James", "Michael Jordan"], answer: 2 },
    hard: { q: "Which team drafted Michael Jordan?", options: ["Bulls", "Celtics", "Lakers", "Pistons"], answer: 0 },
  },
  {
    category: "Baseball",
    easy: { q: "How many innings are in a standard baseball game?", options: ["7", "8", "9", "10"], answer: 2 },
    medium: { q: "What is a baseball term for hitting a home run with the bases loaded?", options: ["Grand Slam", "Triple Play", "Perfect Game", "Walk-off"], answer: 0 },
    hard: { q: "Which player broke the single-season home run record in 2001?", options: ["Sammy Sosa", "Mark McGwire", "Barry Bonds", "Babe Ruth"], answer: 2 },
  },
  {
    category: "Football (American)",
    easy: { q: "How many points is a touchdown worth?", options: ["3", "6", "7", "8"], answer: 1 },
    medium: { q: "How many players are on the field per team in football?", options: ["9", "10", "11", "12"], answer: 2 },
    hard: { q: "Which team has won the most Super Bowls as of 2023?", options: ["Cowboys", "49ers", "Patriots", "Steelers"], answer: 2 },
  },
  {
    category: "Soccer/Football (World)",
    easy: { q: "How long is a standard soccer match?", options: ["80 minutes", "90 minutes", "100 minutes", "120 minutes"], answer: 1 },
    medium: { q: "Which player has won the most Ballon d'Or awards?", options: ["Ronaldo", "Messi", "Pele", "Maradona"], answer: 1 },
    hard: { q: "Which country won the first FIFA World Cup in 1930?", options: ["Brazil", "Argentina", "Uruguay", "Italy"], answer: 2 },
  },
  {
    category: "Tennis",
    easy: { q: "How many Grand Slam tournaments are there per year?", options: ["2", "3", "4", "5"], answer: 2 },
    medium: { q: "What is a score of zero called in tennis?", options: ["Nil", "Love", "Duck", "Blank"], answer: 1 },
    hard: { q: "Who holds the record for most men's Grand Slam singles titles as of 2023?", options: ["Federer", "Nadal", "Djokovic", "Sampras"], answer: 2 },
  },
  {
    category: "Golf",
    easy: { q: "What is a score of one under par on a hole called?", options: ["Bogey", "Birdie", "Eagle", "Albatross"], answer: 1 },
    medium: { q: "How many holes are played in a standard round of golf?", options: ["9", "16", "18", "20"], answer: 2 },
    hard: { q: "Which major golf tournament is played at Augusta National?", options: ["US Open", "The Open", "PGA Championship", "The Masters"], answer: 3 },
  },
  {
    category: "Cycling",
    easy: { q: "What is the most famous multi-stage cycling race in the world?", options: ["Giro d'Italia", "Vuelta a Espana", "Tour de France", "Paris-Roubaix"], answer: 2 },
    medium: { q: "What color jersey is worn by the overall leader of the Tour de France?", options: ["Green", "Polka Dot", "Yellow", "White"], answer: 2 },
    hard: { q: "How many stages does the Tour de France typically have?", options: ["15", "18", "21", "25"], answer: 2 },
  },
  {
    category: "World Geography",
    easy: { q: "What is the smallest country in the world by area?", options: ["Monaco", "San Marino", "Vatican City", "Liechtenstein"], answer: 2 },
    medium: { q: "Which desert is the largest in the world?", options: ["Sahara", "Gobi", "Antarctic", "Arabian"], answer: 2 },
    hard: { q: "Which two continents does Egypt's Sinai Peninsula bridge?", options: ["Europe/Asia", "Africa/Asia", "Africa/Europe", "Asia/Australia"], answer: 1 },
  },
  {
    category: "Volcanoes & Earthquakes",
    easy: { q: "What is the term for the point on Earth's surface directly above an earthquake's origin?", options: ["Epicenter", "Focus", "Fault", "Seismograph"], answer: 0 },
    medium: { q: "Which famous volcano destroyed Pompeii?", options: ["Etna", "Vesuvius", "Stromboli", "Krakatoa"], answer: 1 },
    hard: { q: "What scale is used to measure earthquake magnitude?", options: ["Fujita", "Beaufort", "Richter", "Kelvin"], answer: 2 },
  },
  {
    category: "Deserts",
    easy: { q: "Which is the largest hot desert in the world?", options: ["Gobi", "Kalahari", "Sahara", "Sonoran"], answer: 2 },
    medium: { q: "The Atacama Desert is located primarily in which country?", options: ["Peru", "Chile", "Argentina", "Bolivia"], answer: 1 },
    hard: { q: "Which desert covers much of Mongolia and northern China?", options: ["Sahara", "Thar", "Gobi", "Namib"], answer: 2 },
  },
  {
    category: "Islands",
    easy: { q: "What is the largest island in the world?", options: ["Australia", "Greenland", "Borneo", "Madagascar"], answer: 1 },
    medium: { q: "Which archipelago inspired Darwin's theory of evolution?", options: ["Canary Islands", "Galapagos Islands", "Maldives", "Seychelles"], answer: 1 },
    hard: { q: "Which island nation is located between Australia and Antarctica... actually south of Australia?", options: ["Fiji", "Tasmania", "New Zealand", "Vanuatu"], answer: 1 },
  },
  {
    category: "Explorers",
    easy: { q: "Who is credited with being the first European to reach the Americas via sea route in 1492?", options: ["Magellan", "Columbus", "Vespucci", "Cabot"], answer: 1 },
    medium: { q: "Who led the first expedition to circumnavigate the globe?", options: ["Drake", "Magellan", "Cook", "Cabot"], answer: 1 },
    hard: { q: "Who was the first person to reach the South Pole?", options: ["Scott", "Amundsen", "Shackleton", "Hillary"], answer: 1 },
  },
  {
    category: "Pirates & Maritime History",
    easy: { q: "What flag is traditionally associated with pirates?", options: ["Union Jack", "Jolly Roger", "Tricolor", "Black Cross"], answer: 1 },
    medium: { q: "What was the golden age of piracy roughly?", options: ["1500s", "1650s-1730s", "1800s", "1900s"], answer: 1 },
    hard: { q: "Which infamous pirate was known as Blackbeard?", options: ["Henry Morgan", "Edward Teach", "Bartholomew Roberts", "William Kidd"], answer: 1 },
  },
  {
    category: "Castles & Fortresses",
    easy: { q: "What defensive structure surrounds many medieval castles, filled with water?", options: ["Moat", "Rampart", "Bailey", "Portcullis"], answer: 0 },
    medium: { q: "What is the innermost, most heavily fortified tower of a castle called?", options: ["Bailey", "Keep", "Barbican", "Turret"], answer: 1 },
    hard: { q: "The Great Wall of China was primarily built to defend against whom?", options: ["Mongols and nomadic tribes", "Japanese invaders", "Russian forces", "Korean armies"], answer: 0 },
  },
  {
    category: "Coding & Computers",
    easy: { q: "What does 'CPU' stand for?", options: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Core Processing Unit"], answer: 0 },
    medium: { q: "Who is considered the first computer programmer?", options: ["Alan Turing", "Ada Lovelace", "Grace Hopper", "Charles Babbage"], answer: 1 },
    hard: { q: "What year was the first iPhone released?", options: ["2005", "2007", "2009", "2010"], answer: 1 },
  },
  {
    category: "Internet Culture",
    easy: { q: "What social media platform was originally called 'FaceMash'?", options: ["Twitter", "Facebook", "Instagram", "Myspace"], answer: 1 },
    medium: { q: "What does 'HTTP' stand for?", options: ["HyperText Transfer Protocol", "High Transfer Text Protocol", "HyperText Transmission Process", "Home Tool Transfer Protocol"], answer: 0 },
    hard: { q: "What was the first widely used web browser called?", options: ["Netscape", "Mosaic", "Internet Explorer", "Chrome"], answer: 1 },
  },
  {
    category: "Video Game History",
    easy: { q: "What was the first commercially successful video game?", options: ["Pac-Man", "Pong", "Space Invaders", "Tetris"], answer: 1 },
    medium: { q: "Which company created the Mario franchise?", options: ["Sega", "Sony", "Nintendo", "Atari"], answer: 2 },
    hard: { q: "What year was the original PlayStation released?", options: ["1993", "1994", "1996", "1998"], answer: 1 },
  },
  {
    category: "Fashion History",
    easy: { q: "Who is considered the founder of the 'little black dress'?", options: ["Coco Chanel", "Christian Dior", "Yves Saint Laurent", "Givenchy"], answer: 0 },
    medium: { q: "What decade is associated with bell-bottom pants becoming popular?", options: ["1950s", "1960s-70s", "1980s", "1990s"], answer: 1 },
    hard: { q: "Which designer is famously associated with the 'New Look' after WWII?", options: ["Chanel", "Dior", "Balenciaga", "Lanvin"], answer: 1 },
  },
  {
    category: "Culinary Arts",
    easy: { q: "What is the French culinary term for a stock-based sauce base?", options: ["Roux", "Mirepoix", "Fond", "Bisque"], answer: 2 },
    medium: { q: "What does 'al dente' mean when cooking pasta?", options: ["Very soft", "Firm to the bite", "Overcooked", "Undercooked"], answer: 1 },
    hard: { q: "What is the Maillard reaction responsible for?", options: ["Fermentation", "Browning and flavor in cooked food", "Souring of milk", "Rising of bread"], answer: 1 },
  },
  {
    category: "World Cuisines",
    easy: { q: "Sushi originated in which country?", options: ["China", "Japan", "Korea", "Thailand"], answer: 1 },
    medium: { q: "What is the main ingredient in traditional hummus?", options: ["Lentils", "Chickpeas", "Black beans", "Fava beans"], answer: 1 },
    hard: { q: "Kimchi is a traditional fermented dish from which country?", options: ["China", "Japan", "Korea", "Vietnam"], answer: 2 },
  },
  {
    category: "Wine & Beverages",
    easy: { q: "What grape is traditionally used to make Champagne (along with two others)?", options: ["Merlot", "Chardonnay", "Cabernet", "Syrah"], answer: 1 },
    medium: { q: "In which country did the tradition of tea ceremonies originate most prominently?", options: ["China", "India", "Japan", "England"], answer: 0 },
    hard: { q: "What is the process of converting sugar to alcohol called?", options: ["Distillation", "Fermentation", "Oxidation", "Pasteurization"], answer: 1 },
  },
  {
    category: "Coffee Culture",
    easy: { q: "In which country is coffee believed to have originated?", options: ["Brazil", "Ethiopia", "Colombia", "Yemen"], answer: 1 },
    medium: { q: "What does 'espresso' mean in Italian?", options: ["Fast", "Pressed out", "Strong", "Dark"], answer: 1 },
    hard: { q: "Which country is the world's largest producer of coffee?", options: ["Colombia", "Vietnam", "Brazil", "Ethiopia"], answer: 2 },
  },
  {
    category: "Chocolate",
    easy: { q: "Chocolate is made primarily from the beans of which plant?", options: ["Coffee plant", "Cacao tree", "Vanilla orchid", "Carob tree"], answer: 1 },
    medium: { q: "Which country consumes the most chocolate per capita?", options: ["USA", "Belgium", "Switzerland", "Germany"], answer: 2 },
    hard: { q: "What compound in chocolate is often cited for mood-boosting effects?", options: ["Caffeine", "Theobromine", "Serotonin", "Dopamine"], answer: 1 },
  },
  {
    category: "Cheese",
    easy: { q: "Which country produces Roquefort cheese?", options: ["Italy", "France", "Switzerland", "Netherlands"], answer: 1 },
    medium: { q: "What type of milk is traditionally used to make mozzarella di bufala?", options: ["Cow", "Goat", "Buffalo", "Sheep"], answer: 2 },
    hard: { q: "What is the process of aging cheese called?", options: ["Fermenting", "Affinage", "Curing", "Ripening"], answer: 1 },
  },
  {
    category: "Beer & Brewing",
    easy: { q: "What are the four main ingredients in traditional beer?", options: ["Water, grain, hops, yeast", "Water, sugar, fruit, yeast", "Grain, sugar, water, salt", "Hops, malt, fruit, salt"], answer: 0 },
    medium: { q: "Which country is credited with the Reinheitsgebot beer purity law?", options: ["Belgium", "Germany", "Czech Republic", "Ireland"], answer: 1 },
    hard: { q: "What gives IPA beer its bitter flavor?", options: ["Malt", "Hops", "Yeast", "Barley"], answer: 1 },
  },
  {
    category: "Deserts of the Mind: Psychology",
    easy: { q: "Who is considered the founder of psychoanalysis?", options: ["Carl Jung", "Sigmund Freud", "B.F. Skinner", "William James"], answer: 1 },
    medium: { q: "What is the term for learning through rewards and punishments?", options: ["Classical conditioning", "Operant conditioning", "Cognitive learning", "Observational learning"], answer: 1 },
    hard: { q: "What psychological phenomenon describes conforming to a group despite personal doubt?", options: ["Groupthink", "Cognitive dissonance", "Confirmation bias", "Social loafing"], answer: 0 },
  },
  {
    category: "Philosophy",
    easy: { q: "Who wrote 'The Republic'?", options: ["Aristotle", "Plato", "Socrates", "Confucius"], answer: 1 },
    medium: { q: "Which philosopher is famous for 'I think, therefore I am'?", options: ["Kant", "Descartes", "Locke", "Hume"], answer: 1 },
    hard: { q: "What ethical theory judges actions by their outcomes?", options: ["Deontology", "Virtue ethics", "Utilitarianism", "Existentialism"], answer: 2 },
  },
  {
    category: "Economics",
    easy: { q: "Who wrote 'The Wealth of Nations'?", options: ["Karl Marx", "Adam Smith", "John Keynes", "Milton Friedman"], answer: 1 },
    medium: { q: "What term describes a sustained increase in prices across an economy?", options: ["Recession", "Inflation", "Deflation", "Stagnation"], answer: 1 },
    hard: { q: "What economic theory advocates for government intervention to manage demand?", options: ["Monetarism", "Keynesian economics", "Supply-side economics", "Austrian economics"], answer: 1 },
  },
  {
    category: "Law & Government",
    easy: { q: "How many amendments are in the US Bill of Rights?", options: ["8", "10", "12", "14"], answer: 1 },
    medium: { q: "What is the term for a government led by a single ruler with absolute power?", options: ["Oligarchy", "Autocracy", "Democracy", "Theocracy"], answer: 1 },
    hard: { q: "What document begins with 'We the People'?", options: ["Declaration of Independence", "US Constitution", "Bill of Rights", "Magna Carta"], answer: 1 },
  },
  {
    category: "Space & Planets",
    easy: { q: "Which planet has the most moons as of recent counts?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], answer: 1 },
    medium: { q: "What is the largest planet in our solar system?", options: ["Saturn", "Neptune", "Jupiter", "Uranus"], answer: 2 },
    hard: { q: "What is the name of the boundary around a black hole from which nothing can escape?", options: ["Photon sphere", "Event horizon", "Singularity", "Accretion disk"], answer: 1 },
  },
  {
    category: "Astrophysics",
    easy: { q: "What is the name for a star that has collapsed into an extremely dense state?", options: ["Red Giant", "White Dwarf", "Neutron Star", "Pulsar"], answer: 2 },
    medium: { q: "What force is primarily responsible for holding galaxies together?", options: ["Electromagnetism", "Gravity", "Nuclear force", "Dark energy"], answer: 1 },
    hard: { q: "What theory describes the origin of the universe from a single point?", options: ["Steady State Theory", "Big Bang Theory", "String Theory", "Inflation Theory"], answer: 1 },
  },
  {
    category: "Marine Biology",
    easy: { q: "What is the largest fish species in the ocean?", options: ["Great White Shark", "Whale Shark", "Manta Ray", "Blue Marlin"], answer: 1 },
    medium: { q: "What do you call an animal that lives both on land and in water?", options: ["Aquatic", "Amphibious", "Terrestrial", "Pelagic"], answer: 1 },
    hard: { q: "What is bioluminescence?", options: ["A type of coral disease", "Light produced by living organisms", "A form of underwater camouflage", "A migration pattern"], answer: 1 },
  },
  {
    category: "Insects & Bugs",
    easy: { q: "How many legs does an insect have?", options: ["4", "6", "8", "10"], answer: 1 },
    medium: { q: "What is a group of bees called?", options: ["A colony or swarm", "A pack", "A herd", "A flock"], answer: 0 },
    hard: { q: "What is the only insect known to produce food eaten by humans?", options: ["Ants", "Bees", "Beetles", "Termites"], answer: 1 },
  },
  {
    category: "Birds",
    easy: { q: "What is the largest bird in the world by wingspan?", options: ["Bald Eagle", "Wandering Albatross", "Condor", "Ostrich"], answer: 1 },
    medium: { q: "Which bird is known for its ability to mimic human speech?", options: ["Crow", "Parrot", "Owl", "Sparrow"], answer: 1 },
    hard: { q: "What flightless bird is native to New Zealand?", options: ["Emu", "Kiwi", "Cassowary", "Penguin"], answer: 1 },
  },
  {
    category: "Trees & Forests",
    easy: { q: "What is the oldest known living tree species?", options: ["Oak", "Redwood", "Bristlecone Pine", "Sequoia"], answer: 2 },
    medium: { q: "What percentage of the Amazon rainforest is in Brazil roughly?", options: ["40%", "60%", "80%", "95%"], answer: 1 },
    hard: { q: "What is dendrochronology the study of?", options: ["Tree diseases", "Tree rings for dating", "Forest ecosystems", "Root systems"], answer: 1 },
  },
  {
    category: "Rocks & Minerals",
    easy: { q: "What is the hardest naturally occurring substance on Earth?", options: ["Quartz", "Diamond", "Titanium", "Granite"], answer: 1 },
    medium: { q: "What type of rock is formed from cooled volcanic lava?", options: ["Sedimentary", "Metamorphic", "Igneous", "Composite"], answer: 2 },
    hard: { q: "What mineral is the primary ingredient in drywall/plaster?", options: ["Quartz", "Gypsum", "Feldspar", "Calcite"], answer: 1 },
  },
  {
    category: "Weather Phenomena",
    easy: { q: "What causes lightning?", options: ["Wind friction", "Electrical discharge in clouds", "Sound waves", "Temperature drops"], answer: 1 },
    medium: { q: "What is the eye of a hurricane?", options: ["The strongest wind band", "The calm center", "The outer edge", "The point of landfall"], answer: 1 },
    hard: { q: "What is a derecho?", options: ["A type of tornado", "A widespread windstorm", "A snowstorm", "A heat wave"], answer: 1 },
  },
  {
    category: "Astronomy Instruments",
    easy: { q: "Who is credited with significantly improving the telescope for astronomy?", options: ["Copernicus", "Galileo", "Kepler", "Newton"], answer: 1 },
    medium: { q: "What space telescope was launched in 1990 to observe deep space?", options: ["James Webb", "Hubble", "Kepler", "Spitzer"], answer: 1 },
    hard: { q: "What is the term for measuring distances using parallax in astronomy?", options: ["Redshift", "Stellar parallax", "Doppler shift", "Luminosity"], answer: 1 },
  },
  {
    category: "World Trade & Business",
    easy: { q: "What does 'GDP' stand for?", options: ["Gross Domestic Product", "General Development Plan", "Global Distribution Point", "Gross Direct Profit"], answer: 0 },
    medium: { q: "Which organization regulates international trade rules?", options: ["IMF", "World Bank", "WTO", "UN"], answer: 2 },
    hard: { q: "What term describes when a company's stock is first sold to the public?", options: ["Merger", "IPO", "Dividend", "Buyback"], answer: 1 },
  },
  {
    category: "Historical Empires",
    easy: { q: "Which empire was ruled by Genghis Khan?", options: ["Ottoman Empire", "Mongol Empire", "Persian Empire", "Roman Empire"], answer: 1 },
    medium: { q: "At its height, which empire was the largest contiguous land empire in history?", options: ["British Empire", "Mongol Empire", "Russian Empire", "Roman Empire"], answer: 1 },
    hard: { q: "Which empire's fall in 1453 is often cited as ending the Middle Ages?", options: ["Roman Empire", "Byzantine Empire", "Ottoman Empire", "Holy Roman Empire"], answer: 1 },
  },
  {
    category: "Cold War History",
    easy: { q: "What wall symbolized the division of Cold War Europe until 1989?", options: ["Great Wall", "Berlin Wall", "Hadrian's Wall", "Atlantic Wall"], answer: 1 },
    medium: { q: "What crisis in 1962 brought the US and USSR to the brink of nuclear war?", options: ["Bay of Pigs", "Cuban Missile Crisis", "Berlin Blockade", "Korean War"], answer: 1 },
    hard: { q: "What was the name of the US policy to contain the spread of communism?", options: ["Marshall Plan", "Truman Doctrine/Containment", "Domino Theory", "Monroe Doctrine"], answer: 1 },
  },
  {
    category: "Revolutions",
    easy: { q: "What event started the French Revolution in 1789?", options: ["Execution of the King", "Storming of the Bastille", "Reign of Terror", "Rise of Napoleon"], answer: 1 },
    medium: { q: "Who led the Bolshevik Revolution in Russia?", options: ["Stalin", "Lenin", "Trotsky", "Tsar Nicholas II"], answer: 1 },
    hard: { q: "What document did the American colonies adopt in 1776?", options: ["The Constitution", "Declaration of Independence", "Bill of Rights", "Articles of Confederation"], answer: 1 },
  },
  {
    category: "Civil Rights Movement",
    easy: { q: "Who delivered the 'I Have a Dream' speech?", options: ["Malcolm X", "Martin Luther King Jr.", "Rosa Parks", "John Lewis"], answer: 1 },
    medium: { q: "What Supreme Court case ended school segregation in 1954?", options: ["Plessy v. Ferguson", "Brown v. Board of Education", "Roe v. Wade", "Marbury v. Madison"], answer: 1 },
    hard: { q: "In what city did Rosa Parks refuse to give up her bus seat?", options: ["Atlanta", "Montgomery", "Birmingham", "Memphis"], answer: 1 },
  },
  {
    category: "Space Age Pop Culture",
    easy: { q: "What 1969 event was watched by an estimated 600 million people?", options: ["Woodstock", "Moon Landing", "World Cup Final", "Olympics Opening"], answer: 1 },
    medium: { q: "What was the name of the first Apollo mission to land on the moon?", options: ["Apollo 8", "Apollo 11", "Apollo 13", "Apollo 17"], answer: 1 },
    hard: { q: "What was the name of the Soviet space station launched in 1986?", options: ["Salyut", "Mir", "Skylab", "Vostok"], answer: 1 },
  },
  {
    category: "Famous Speeches",
    easy: { q: "Who said 'The only thing we have to fear is fear itself'?", options: ["Winston Churchill", "Franklin D. Roosevelt", "Abraham Lincoln", "John F. Kennedy"], answer: 1 },
    medium: { q: "Who delivered the Gettysburg Address?", options: ["George Washington", "Abraham Lincoln", "Ulysses S. Grant", "Andrew Johnson"], answer: 1 },
    hard: { q: "Who said 'Ask not what your country can do for you'?", options: ["Lyndon Johnson", "John F. Kennedy", "Richard Nixon", "Dwight Eisenhower"], answer: 1 },
  },
  {
    category: "Nursery Rhymes & Fairy Tales",
    easy: { q: "In 'Cinderella', what does she leave behind at midnight?", options: ["Her crown", "A glass slipper", "A ring", "Her dress"], answer: 1 },
    medium: { q: "Who wrote many famous fairy tales including 'The Little Mermaid'?", options: ["Brothers Grimm", "Hans Christian Andersen", "Charles Perrault", "Aesop"], answer: 1 },
    hard: { q: "In 'Jack and the Beanstalk', what does Jack trade for the magic beans?", options: ["A sword", "A cow", "A horse", "Gold coins"], answer: 1 },
  },
  {
    category: "Broadway & Musicals",
    easy: { q: "Which musical is based on the life of Alexander Hamilton?", options: ["Wicked", "Hamilton", "Les Miserables", "Chicago"], answer: 1 },
    medium: { q: "What musical features the song 'Defying Gravity'?", options: ["Wicked", "The Wiz", "Rent", "Cats"], answer: 0 },
    hard: { q: "Which composer wrote 'The Phantom of the Opera'?", options: ["Stephen Sondheim", "Andrew Lloyd Webber", "Cole Porter", "Rodgers and Hammerstein"], answer: 1 },
  },
  {
    category: "Comic Books",
    easy: { q: "Which publisher created Spider-Man?", options: ["DC Comics", "Marvel Comics", "Image Comics", "Dark Horse"], answer: 1 },
    medium: { q: "What is Batman's secret identity?", options: ["Clark Kent", "Bruce Wayne", "Tony Stark", "Peter Parker"], answer: 1 },
    hard: { q: "Who created Superman?", options: ["Stan Lee", "Jerry Siegel and Joe Shuster", "Bob Kane", "Jack Kirby"], answer: 1 },
  },
  {
    category: "Anime & Manga",
    easy: { q: "Which studio produced 'Spirited Away'?", options: ["Toei Animation", "Studio Ghibli", "Sunrise", "Madhouse"], answer: 1 },
    medium: { q: "Who is the creator of 'Dragon Ball'?", options: ["Eiichiro Oda", "Akira Toriyama", "Masashi Kishimoto", "Naoko Takeuchi"], answer: 1 },
    hard: { q: "What is the highest-grossing anime film of all time (as of early 2020s)?", options: ["Spirited Away", "Your Name", "Demon Slayer: Mugen Train", "Princess Mononoke"], answer: 2 },
  },
  {
    category: "Broadway of Sports: Wrestling & Combat",
    easy: { q: "What martial art originated in Brazil, focused on ground fighting?", options: ["Judo", "Brazilian Jiu-Jitsu", "Karate", "Taekwondo"], answer: 1 },
    medium: { q: "What is the term for a wrestling move where you lift and slam an opponent?", options: ["Suplex", "Takedown", "Reversal", "Pin"], answer: 0 },
    hard: { q: "What organization is the largest promoter of mixed martial arts?", options: ["WWE", "UFC", "Bellator", "PFL"], answer: 1 },
  },
  {
    category: "Endangered Species",
    easy: { q: "Which big cat is critically endangered with fewer than 4,000 left in the wild?", options: ["Lion", "Tiger", "Cheetah", "Leopard"], answer: 1 },
    medium: { q: "What is the primary threat to polar bears?", options: ["Overhunting", "Habitat loss from melting ice", "Disease", "Ocean pollution"], answer: 1 },
    hard: { q: "Which ape species is critically endangered and native to Borneo/Sumatra?", options: ["Gorilla", "Orangutan", "Chimpanzee", "Bonobo"], answer: 1 },
  },
  {
    category: "Recycling & Environment",
    easy: { q: "What does the number inside a recycling triangle on plastic typically indicate?", options: ["Weight", "Resin type", "Price", "Manufacturer"], answer: 1 },
    medium: { q: "What is the primary gas responsible for the greenhouse effect increase?", options: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Hydrogen"], answer: 1 },
    hard: { q: "What term describes energy from sources that naturally replenish?", options: ["Fossil fuel", "Renewable energy", "Nuclear energy", "Non-renewable energy"], answer: 1 },
  },
];

// Deterministic shuffle + pick, seeded so everyone in the same round gets
// the same category set/order. Each category's three questions have
// their options shuffled independently (still deterministically), with
// the correct answer's index tracked through the shuffle.
export function pickTriviaCategories(seed, count) {
  let s = seed || 1;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pool = [...TRIVIA_CATEGORIES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const shuffleQ = (q) => {
    const order = q.options.map((_, i) => i).sort(() => rand() - 0.5);
    return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  };
  return pool.slice(0, count).map((c) => ({
    category: c.category,
    easy: shuffleQ(c.easy),
    medium: shuffleQ(c.medium),
    hard: shuffleQ(c.hard),
  }));
}
