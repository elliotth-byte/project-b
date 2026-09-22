// A separate question bank from lib/games/triviaData.js, on purpose —
// Trivia Maze's gate questions shouldn't repeat what the Trivia mini-game
// already asks. Flat list, no category/difficulty structure needed since
// each gate only ever uses one question at a time (see
// MazeTriviaPlayer.jsx's buildShortcut/pickMazeTriviaQuestions usage).
export const MAZE_TRIVIA_QUESTIONS = [
  { q: "What is the freezing point of water in Celsius?", options: ["0", "32", "100", "-1"], answer: 0 },
  { q: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "What is the tallest mountain in the world?", options: ["K2", "Everest", "Denali", "Kilimanjaro"], answer: 1 },
  { q: "What gas do plants absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
  { q: "How many strings does a standard guitar have?", options: ["4", "5", "6", "7"], answer: 2 },
  { q: "What is the capital of Italy?", options: ["Milan", "Venice", "Rome", "Naples"], answer: 2 },
  { q: "What planet is closest to the sun?", options: ["Venus", "Mercury", "Earth", "Mars"], answer: 1 },
  { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
  { q: "What is the largest animal on Earth?", options: ["Elephant", "Blue Whale", "Giraffe", "Great White Shark"], answer: 1 },
  { q: "What color do you get by mixing blue and yellow?", options: ["Purple", "Orange", "Green", "Brown"], answer: 2 },
  { q: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], answer: 1 },
  { q: "What is the capital of Canada?", options: ["Toronto", "Vancouver", "Ottawa", "Montreal"], answer: 2 },
  { q: "What is the chemical formula for water?", options: ["CO2", "H2O", "O2", "NaCl"], answer: 1 },
  { q: "Which planet is known for its rings?", options: ["Mars", "Saturn", "Mercury", "Venus"], answer: 1 },
  { q: "How many days are in a leap year?", options: ["364", "365", "366", "367"], answer: 2 },
  { q: "What is the smallest prime number?", options: ["0", "1", "2", "3"], answer: 2 },
  { q: "What is the main language spoken in Brazil?", options: ["Spanish", "Portuguese", "French", "Italian"], answer: 1 },
  { q: "What do bees collect from flowers?", options: ["Water", "Nectar", "Leaves", "Seeds"], answer: 1 },
  { q: "How many players are on a basketball team on the court?", options: ["4", "5", "6", "7"], answer: 1 },
  { q: "What is the largest desert in the world (including cold deserts)?", options: ["Sahara", "Gobi", "Antarctic", "Arabian"], answer: 2 },
  { q: "What is the capital of Spain?", options: ["Barcelona", "Madrid", "Seville", "Valencia"], answer: 1 },
  { q: "How many hearts does an octopus have?", options: ["1", "2", "3", "4"], answer: 2 },
  { q: "What is the study of weather called?", options: ["Geology", "Meteorology", "Astrology", "Biology"], answer: 1 },
  { q: "What is the currency used in the United Kingdom?", options: ["Euro", "Dollar", "Pound", "Franc"], answer: 2 },
  { q: "How many colors are in a rainbow?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "What organ pumps blood through the body?", options: ["Lungs", "Heart", "Liver", "Kidney"], answer: 1 },
  { q: "What is the tallest animal in the world?", options: ["Elephant", "Giraffe", "Camel", "Horse"], answer: 1 },
  { q: "How many minutes are in a full day?", options: ["1200", "1440", "1600", "2000"], answer: 1 },
  { q: "What is the capital of Germany?", options: ["Munich", "Frankfurt", "Berlin", "Hamburg"], answer: 2 },
  { q: "Which sea creature has eight arms?", options: ["Squid", "Octopus", "Jellyfish", "Starfish"], answer: 1 },
  { q: "What is the largest country in the world by area?", options: ["China", "USA", "Canada", "Russia"], answer: 3 },
  { q: "How many teeth does an adult human typically have?", options: ["28", "30", "32", "34"], answer: 2 },
  { q: "What natural satellite orbits the Earth?", options: ["Mars", "The Moon", "The Sun", "Venus"], answer: 1 },
  { q: "What is the fastest bird in the world?", options: ["Eagle", "Peregrine Falcon", "Hawk", "Ostrich"], answer: 1 },
  { q: "How many legs does a spider have?", options: ["6", "8", "10", "12"], answer: 1 },
  { q: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
  { q: "What shape has three sides?", options: ["Square", "Circle", "Triangle", "Pentagon"], answer: 2 },
  { q: "What do caterpillars turn into?", options: ["Bees", "Butterflies", "Moths", "Both butterflies and moths"], answer: 3 },
  { q: "What is the boiling point of water in Celsius at sea level?", options: ["90", "95", "100", "110"], answer: 2 },
  { q: "How many oceans are there on Earth?", options: ["3", "4", "5", "6"], answer: 2 },
  { q: "What is the capital of France?", options: ["Lyon", "Marseille", "Paris", "Nice"], answer: 2 },
  { q: "What metal is a magnet naturally attracted to?", options: ["Gold", "Iron", "Copper", "Aluminum"], answer: 1 },
  { q: "How many quarts are in a gallon?", options: ["2", "4", "6", "8"], answer: 1 },
  { q: "What is the largest planet in our solar system?", options: ["Earth", "Saturn", "Jupiter", "Neptune"], answer: 2 },
  { q: "What do you call baby dogs?", options: ["Kittens", "Puppies", "Cubs", "Calves"], answer: 1 },
  { q: "What is the tallest building in the world (as of early 2020s)?", options: ["Empire State Building", "Burj Khalifa", "Shanghai Tower", "One World Trade"], answer: 1 },
  { q: "How many sides does a stop sign have?", options: ["6", "7", "8", "9"], answer: 2 },
  { q: "What is the primary language spoken in Mexico?", options: ["English", "Spanish", "Portuguese", "French"], answer: 1 },
  { q: "What is a group of lions called?", options: ["A pack", "A pride", "A herd", "A flock"], answer: 1 },
  { q: "How many wheels does a standard bicycle have?", options: ["1", "2", "3", "4"], answer: 1 },
  { q: "What is the capital of Russia?", options: ["St. Petersburg", "Moscow", "Kiev", "Minsk"], answer: 1 },
  { q: "What planet is known as the 'Morning Star'?", options: ["Mars", "Venus", "Mercury", "Jupiter"], answer: 1 },
  { q: "How many minutes are in two hours?", options: ["100", "110", "120", "130"], answer: 2 },
  { q: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { q: "What is the main gas humans breathe in to survive?", options: ["Carbon Dioxide", "Oxygen", "Nitrogen", "Hydrogen"], answer: 1 },
  { q: "How many players are on a soccer team on the field?", options: ["9", "10", "11", "12"], answer: 2 },
  { q: "What do you call a shape with five sides?", options: ["Hexagon", "Pentagon", "Octagon", "Square"], answer: 1 },
  { q: "What is the capital of China?", options: ["Shanghai", "Beijing", "Hong Kong", "Guangzhou"], answer: 1 },
  { q: "How many strings does a standard violin have?", options: ["3", "4", "5", "6"], answer: 1 },
  { q: "What is the closest star to Earth?", options: ["Alpha Centauri", "The Sun", "Proxima Centauri", "Sirius"], answer: 1 },
  { q: "What animal is known as the 'King of the Jungle'?", options: ["Tiger", "Lion", "Elephant", "Gorilla"], answer: 1 },
  { q: "How many continents border the Pacific Ocean?", options: ["3", "4", "5", "6"], answer: 2 },
  { q: "What is the capital of South Korea?", options: ["Busan", "Seoul", "Incheon", "Daegu"], answer: 1 },
  { q: "What do you call frozen rain?", options: ["Sleet", "Hail", "Snow", "Frost"], answer: 1 },
  { q: "How many sides does a cube have?", options: ["4", "6", "8", "12"], answer: 1 },
  { q: "What is the primary color you get by mixing red and white?", options: ["Orange", "Purple", "Pink", "Brown"], answer: 2 },
  { q: "What is the longest river in Africa?", options: ["Congo", "Niger", "Nile", "Zambezi"], answer: 2 },
  { q: "How many players are on an ice hockey team on the ice per side?", options: ["5", "6", "7", "8"], answer: 1 },
  { q: "What is the capital of Brazil?", options: ["Rio de Janeiro", "Sao Paulo", "Brasilia", "Salvador"], answer: 2 },
  { q: "What do you call an animal that eats both plants and meat?", options: ["Herbivore", "Carnivore", "Omnivore", "Insectivore"], answer: 2 },
  { q: "How many hours are in a week?", options: ["144", "150", "168", "172"], answer: 2 },
  { q: "What is the tallest type of tree in the world?", options: ["Oak", "Redwood", "Pine", "Maple"], answer: 1 },
  { q: "What gemstone is typically associated with the month of April?", options: ["Ruby", "Emerald", "Diamond", "Sapphire"], answer: 2 },
  { q: "How many chromosomes do humans typically have?", options: ["23", "46", "48", "50"], answer: 1 },
  { q: "What is the capital of Egypt?", options: ["Alexandria", "Cairo", "Giza", "Luxor"], answer: 1 },
  { q: "What do you call the study of stars and space?", options: ["Geology", "Astronomy", "Biology", "Meteorology"], answer: 1 },
  { q: "How many minutes does it take light from the sun to reach Earth roughly?", options: ["1", "4", "8", "15"], answer: 2 },
  { q: "What is the smallest planet in our solar system?", options: ["Mars", "Mercury", "Venus", "Pluto"], answer: 1 },
  { q: "What animal has black and white stripes?", options: ["Tiger", "Zebra", "Panda", "Skunk"], answer: 1 },
  { q: "How many players are on a volleyball team on the court?", options: ["4", "5", "6", "7"], answer: 2 },
  { q: "What is the capital of India?", options: ["Mumbai", "New Delhi", "Bangalore", "Kolkata"], answer: 1 },
  { q: "What natural phenomenon is measured using the Richter scale?", options: ["Hurricanes", "Earthquakes", "Tornadoes", "Floods"], answer: 1 },
  { q: "How many sides does an octagon have?", options: ["6", "7", "8", "9"], answer: 2 },
  { q: "What is the main star in our solar system called?", options: ["Polaris", "The Sun", "Sirius", "Alpha Centauri"], answer: 1 },
  { q: "What do you call a baby cat?", options: ["Puppy", "Kitten", "Cub", "Foal"], answer: 1 },
  { q: "How many years are in a century?", options: ["10", "100", "1000", "50"], answer: 1 },
  { q: "What is the capital of Argentina?", options: ["Rio de Janeiro", "Buenos Aires", "Santiago", "Lima"], answer: 1 },
  { q: "What instrument has 88 keys?", options: ["Guitar", "Piano", "Violin", "Flute"], answer: 1 },
  { q: "How many sides does a triangle have?", options: ["2", "3", "4", "5"], answer: 1 },
  { q: "What is the largest continent by area?", options: ["Africa", "Asia", "North America", "Europe"], answer: 1 },
  { q: "What do you call water in its solid state?", options: ["Steam", "Ice", "Vapor", "Liquid"], answer: 1 },
  { q: "How many minutes are in three hours?", options: ["150", "160", "170", "180"], answer: 3 },
  { q: "What is the capital of Greece?", options: ["Athens", "Sparta", "Thessaloniki", "Corinth"], answer: 0 },
  { q: "What sport is played at Wimbledon?", options: ["Golf", "Tennis", "Cricket", "Rugby"], answer: 1 },
  { q: "How many players make up a standard cricket team?", options: ["9", "10", "11", "12"], answer: 2 },
  { q: "What is the term for a young kangaroo?", options: ["Cub", "Joey", "Calf", "Pup"], answer: 1 },
];

// Deterministic pick — same seed (challenge.startedAt + player offset,
// matching every other seeded pick in this app) means the same player
// always gets the same gate questions on a retry, and different players
// in the same round get different ones as usual.
export function pickMazeTriviaQuestions(seed, count) {
  let s = seed || 1;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pool = [...MAZE_TRIVIA_QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const shuffleOptions = (q) => {
    const order = q.options.map((_, i) => i).sort(() => rand() - 0.5);
    return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  };
  return pool.slice(0, count).map(shuffleOptions);
}
