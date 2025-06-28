// Prize tiers for the main game
export const prizeTiers = [
  100, 200, 300, 500, 1000, // Safety net 1 ($1,000)
  2000, 4000, 8000, 16000, 32000, // Safety net 2 ($32,000)
  64000, 125000, 250000, 500000, 1000000
];

// Safety net indices (0-indexed)
export const safetyNetIndices = [4, 9]; // Corresponds to $1,000 and $32,000

// Fastest Finger First questions data
export const fffQuestionsData = [
  {
    question: "Order these events in the life of a butterfly chronologically:",
    items: ["Chrysalis", "Egg", "Caterpillar", "Butterfly"],
    correctOrderIndices: [1, 2, 0, 3] // Corresponds to indices of items array
  },
  {
    question: "Order these planets by their distance from the Sun, from closest to furthest:",
    items: ["Earth", "Mars", "Jupiter", "Venus"],
    correctOrderIndices: [3, 0, 1, 2] // Venus, Earth, Mars, Jupiter
  },
  {
    question: "Order these numbers from smallest to largest:",
    items: ["15", "7", "23", "10"],
    correctOrderIndices: [1, 3, 0, 2] // 7, 10, 15, 23
  },
  {
    question: "Order these US presidents chronologically by their first term:",
    items: ["Abraham Lincoln", "George Washington", "Thomas Jefferson", "John Adams"],
    correctOrderIndices: [1, 3, 2, 0] // Washington, Adams, Jefferson, Lincoln
  },
  {
    question: "Order these animals by average adult weight, from lightest to heaviest:",
    items: ["Mouse", "Cat", "Dog", "Elephant"],
    correctOrderIndices: [0, 1, 2, 3] // Mouse, Cat, Dog, Elephant
  },
  {
    question: "Order these historical periods chronologically:",
    items: ["Renaissance", "Middle Ages", "Ancient Egypt", "Industrial Revolution"],
    correctOrderIndices: [2, 1, 0, 3] // Ancient Egypt, Middle Ages, Renaissance, Industrial Revolution
  }
];
