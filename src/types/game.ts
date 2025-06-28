// src/types/game.ts

// Interface for a player's state in the game
export interface PlayerState {
  name: string;
  age: number;
  score: number;
  fiftyFiftyUsed: boolean;
  askAudienceUsed: boolean;
  phoneFriendUsed: boolean;
  isActive: boolean; // True if player is still in the game, false if eliminated/walked away
}

// Interface for a question in the main game (AI generated)
export interface GameQuestion {
  question: string;
  options: string[]; // Array of four options
  correctAnswerIndex: number; // 0-3
  questionIndex?: number; // To track which prize tier this question corresponds to
}

// Interface for Fastest Finger First questions
export interface FFFQuestion {
  question: string;
  items: string[]; // Items to be ordered
  correctOrderIndices: number[]; // Correct order of indices from the items array
}

// Interface for a lifeline request (Ask the Audience or Phone a Friend)
export interface ActiveLifelineRequest {
  type: 'audience' | 'friend';
  initiatorId: string; // The ID of the player who used the lifeline
  targetPlayerId?: string; // For 'friend' type, the ID of the friend called
  questionIndex: number; // The question index when the lifeline was used
  responses: Record<string, number | string>; // PlayerID -> vote (number index) or suggestion (string)
}

// Interface for the overall room data stored in Firestore
export interface RoomData {
  gameCode: string;
  status: 'lobby' | 'fastest-finger' | 'in-game' | 'final-scores' | 'game-over';
  hostId: string;
  players: Record<string, PlayerState>; // Map of player IDs to their state
  currentQuestionIndex: number; // Index of the current main game question
  currentTurnPlayerId: string | null; // ID of the player whose turn it is
  currentQuestion: GameQuestion | null; // The AI-generated question being played
  isLoadingQuestion: boolean; // Flag for when AI question is being generated
  questionLifelineState: { // Last lifeline results for display
    disabledOptions: number[]; // For 50/50
    audienceVote: Record<string, number> | null; // For Ask the Audience results
    friendAnswer: string | null; // For Phone a Friend result
    usedByPlayerId: string | null; // Who used the lifeline that generated this state
  };
  activeLifelineRequest: ActiveLifelineRequest | null; // Details of an ongoing interactive lifeline
  playerOrder: string[]; // The determined order of players for turns
  eliminatedPlayers: string[]; // IDs of players who are out of the main game
  contestantHistory: string[]; // IDs of players who have already been a contestant (answered or walked away)
  // Fastest Finger First specific fields
  fffQuestionIndex: number; // Index of current FFF question
  fffAnswers: Record<string, { order: number[], time: number }>; // PlayerId -> FFF answer and time
  fffWinnerId: string | null; // ID of the FFF winner
  fffTieParticipants: string[]; // IDs of players in a FFF tie-breaker
}
