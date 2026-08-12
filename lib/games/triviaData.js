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
