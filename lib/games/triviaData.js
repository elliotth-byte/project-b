// Generic trivia bank — pure data, no storage dependency. 20 questions so
// a 10-question round can pull a random subset (seeded per-round so every
// player in the same round gets the same 10 questions, in the same
// order, which keeps the "fastest to answer" tiebreak fair).
export const TRIVIA_BANK = [
  { q: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Mercury"], answer: 1 },
  { q: "How many continents are there on Earth?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { q: "Who painted the Mona Lisa?", options: ["Van Gogh", "Da Vinci", "Picasso", "Monet"], answer: 1 },
  { q: "What is the smallest prime number?", options: ["0", "1", "2", "3"], answer: 2 },
  { q: "Which element has the chemical symbol 'O'?", options: ["Gold", "Oxygen", "Osmium", "Silver"], answer: 1 },
  { q: "How many strings does a standard guitar have?", options: ["4", "5", "6", "7"], answer: 2 },
  { q: "What is the capital of Japan?", options: ["Seoul", "Beijing", "Tokyo", "Bangkok"], answer: 2 },
  { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
  { q: "What gas do plants primarily absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], answer: 2 },
  { q: "Who wrote 'Romeo and Juliet'?", options: ["Dickens", "Shakespeare", "Austen", "Hemingway"], answer: 1 },
  { q: "What is the freezing point of water in Celsius?", options: ["0°", "32°", "100°", "-10°"], answer: 0 },
  { q: "Which animal is known as the 'King of the Jungle'?", options: ["Tiger", "Elephant", "Lion", "Gorilla"], answer: 2 },
  { q: "How many players are on a standard soccer team on the field?", options: ["9", "10", "11", "12"], answer: 2 },
  { q: "What is the tallest mountain in the world?", options: ["K2", "Everest", "Denali", "Kilimanjaro"], answer: 1 },
  { q: "Which country gifted the Statue of Liberty to the US?", options: ["England", "France", "Spain", "Italy"], answer: 1 },
  { q: "What is the currency of Japan?", options: ["Won", "Yuan", "Yen", "Ringgit"], answer: 2 },
  { q: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], answer: 1 },
  { q: "What is the largest planet in our solar system?", options: ["Saturn", "Neptune", "Jupiter", "Uranus"], answer: 2 },
  { q: "Which language has the most native speakers worldwide?", options: ["English", "Spanish", "Mandarin", "Hindi"], answer: 2 },
];

// Deterministic shuffle + pick, seeded so everyone in the same round gets
// the same question set/order.
export function pickTriviaQuestions(seed, count) {
  let s = seed || 1;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pool = [...TRIVIA_BANK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((q) => {
    // Shuffle each question's own options too, tracking the new answer index.
    const order = q.options.map((_, i) => i).sort(() => rand() - 0.5);
    return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  });
}
