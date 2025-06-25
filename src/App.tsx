import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';

// Prize tiers
const prizeTiers = [
  100, 200, 300, 500, 1000, // Safety net 1 ($1,000)
  2000, 4000, 8000, 16000, 32000, // Safety net 2 ($32,000)
  64000, 125000, 250000, 500000, 1000000
];

// Fastest Finger First questions data (still hardcoded for consistent FFF mechanics)
const fffQuestionsData = [
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

// Safety net indices (0-indexed)
const safetyNetIndices = [4, 9]; // Corresponds to $1,000 and $32,000

// Firebase initialization variables
let firebaseAppInstance: any = null;
let dbInstance: any = null;
let authInstance: any = null;
let currentUserId: string | null = null;
let isFirebaseInitialized = false;

const initFirebase = async () => {
  if (isFirebaseInitialized) return;

  try {
    const firebaseConfig = typeof (window as any).__firebase_config !== 'undefined' ? JSON.parse((window as any).__firebase_config) : {};
    firebaseAppInstance = initializeApp(firebaseConfig);
    dbInstance = getFirestore(firebaseAppInstance);
    authInstance = getAuth(firebaseAppInstance);

    if (typeof (window as any).__initial_auth_token !== 'undefined') {
      await signInWithCustomToken(authInstance, (window as any).__initial_auth_token);
    } else {
      await signInAnonymously(authInstance);
    }

    onAuthStateChanged(authInstance, (user) => {
      if (user) {
        currentUserId = user.uid;
      } else {
        currentUserId = crypto.randomUUID();
      }
      isFirebaseInitialized = true;
      console.log("Firebase Auth Ready. User ID:", currentUserId);
    });

  } catch (e) {
    console.error("Error initializing Firebase:", e);
    // Display error message to user
  }
};

// Component for displaying messages to the user and for confirmation
const MessageBox = ({ message, onClose, onConfirm, showConfirmButtons }: { message: string, onClose: () => void, onConfirm?: () => void, showConfirmButtons?: boolean }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-purple-700 to-indigo-900 text-white p-8 rounded-xl shadow-2xl max-w-sm w-full text-center border-4 border-yellow-500">
        <p className="text-2xl font-bold mb-6">{message}</p>
        {showConfirmButtons ? (
          <div className="flex justify-around gap-4">
            <button
              onClick={onConfirm}
              className="bg-green-500 hover:bg-green-600 text-white font-extrabold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg flex-1"
            >
              Yes
            </button>
            <button
              onClick={onClose}
              className="bg-red-500 hover:bg-red-600 text-white font-extrabold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg flex-1"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className="bg-yellow-500 hover:bg-yellow-600 text-purple-900 font-extrabold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
};

// --- Single Player Game Screen Component ---
const SinglePlayerGameScreen = ({ setGameMode }: { setGameMode: (mode: string) => void }) => {
  const [playerName, setPlayerName] = useState('');
  const [playerAge, setPlayerAge] = useState('');
  const [isGameStarted, setIsGameStarted] = useState(false);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [fiftyFiftyUsed, setFiftyFiftyUsed] = useState(false);
  const [askAudienceUsed, setAskAudienceUsed] = useState(false);
  const [phoneFriendUsed, setPhoneFriendUsed] = useState(false);
  const [message, setMessage] = useState('');
  const [isGameOver, setIsGameOver] = useState(false);
  const [disabledOptions, setDisabledOptions] = useState<number[]>([]); // For 50/50 lifeline
  const [audienceVote, setAudienceVote] = useState<Record<string, number> | null>(null); // For Ask the Audience lifeline
  const [friendAnswer, setFriendAnswer] = useState<string | null>(null); // For Phone a Friend lifeline
  const [currentQuestion, setCurrentQuestion] = useState<any>(null); // AI-generated question
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [showWalkAwayConfirm, setShowWalkAwayConfirm] = useState(false); // New state for walk away confirmation

  const generateAndSetQuestion = useCallback(async (age: number, prizeLevel: number, questionIndex: number) => {
    setIsLoadingQuestion(true); // Set loading state

    const prompt = `Generate a "Who Wants to be a Millionaire?" style trivia question for a ${age}-year-old with a prize value of $${prizeLevel}. The question should have four distinct options (A, B, C, D) and specify which one is correct. Ensure the question is age-appropriate and has a clear correct answer. The question should not be too easy or too hard for the prize level. Provide the output in JSON format with 'question', 'options' (an array of strings), and 'correctAnswerIndex' (0-3).`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "question": { "type": "STRING" },
            "options": {
              "type": "ARRAY",
              "items": { "type": "STRING" },
              "minItems": 4,
              "maxItems": 4
            },
            "correctAnswerIndex": { "type": "NUMBER", "minimum": 0, "maximum": 3 }
          },
          "required": ["question", "options", "correctAnswerIndex"]
        }
      }
    };

    const apiKey = ""; // Canvas will provide this in runtime
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        let generatedQ: any = {};
        try {
          generatedQ = JSON.parse(jsonString);
          // Add questionIndex to the generated question for comparison
          generatedQ.questionIndex = questionIndex;
        } catch (parseError) {
          console.error("Failed to parse AI generated question:", parseError, "Raw text:", jsonString);
          setMessage("Failed to generate a valid question. Please try again.");
          generatedQ = {
            question: "Could not load question. What is the capital of Australia?",
            options: ["Sydney", "Melbourne", "Canberra", "Perth"],
            correctAnswerIndex: 2,
            questionIndex: questionIndex // Ensure it matches the current index
          };
        }
        setCurrentQuestion(generatedQ);
      } else {
        console.error("AI question generation failed:", result);
        setMessage("Failed to generate a question. Please try again.");
        setCurrentQuestion({
            question: "Failed to load question. What is the color of the sky on a clear day?",
            options: ["Red", "Green", "Blue", "Yellow"],
            correctAnswerIndex: 2,
            questionIndex: questionIndex
        }); // Fallback
      }
    } catch (apiError) {
      console.error("Error calling Gemini API:", apiError);
      setMessage("Error connecting to AI. Please check your internet or try again later.");
      setCurrentQuestion({
          question: "Connection error. What is 2 + 2?",
          options: ["3", "4", "5", "6"],
          correctAnswerIndex: 1,
          questionIndex: questionIndex
      }); // Fallback
    } finally {
      setIsLoadingQuestion(false);
    }
  }, []);

  useEffect(() => {
    if (isGameStarted && !isLoadingQuestion && (!currentQuestion || currentQuestion.questionIndex !== currentQuestionIndex)) {
      const currentPrize = prizeTiers[currentQuestionIndex] || 0;
      generateAndSetQuestion(parseInt(playerAge), currentPrize, currentQuestionIndex);
    }
  }, [isGameStarted, currentQuestionIndex, playerAge, isLoadingQuestion, currentQuestion, generateAndSetQuestion]);

  const handleStartGame = () => {
    if (!playerName.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    if (!playerAge || parseInt(playerAge) < 5 || parseInt(playerAge) > 100) {
      setMessage("Please enter a valid age (5-100).");
      return;
    }
    setIsGameStarted(true);
    setScore(0);
    setCurrentQuestionIndex(0);
    setFiftyFiftyUsed(false);
    setAskAudienceUsed(false);
    setPhoneFriendUsed(false);
    setDisabledOptions([]);
    setAudienceVote(null);
    setFriendAnswer(null);
    setIsGameOver(false);
    setCurrentQuestion(null); // Clear previous question to trigger new generation
  };

  const handleAnswerClick = (selectedIndex: number) => {
    if (isLoadingQuestion || !currentQuestion) return;

    if (selectedIndex === currentQuestion.correctAnswerIndex) {
      const newScore = prizeTiers[currentQuestionIndex];
      setScore(newScore);
      setMessage(`Correct! You've won $${newScore}!`);
      setTimeout(() => {
        setMessage('');
        if (currentQuestionIndex < prizeTiers.length - 1) {
          setCurrentQuestionIndex(currentQuestionIndex + 1);
          setDisabledOptions([]);
          setAudienceVote(null);
          setFriendAnswer(null);
          setCurrentQuestion(null); // Trigger new question generation
        } else {
          setIsGameOver(true);
          setMessage(`Congratulations! You've won the Grand Prize of $${newScore}!`);
        }
      }, 1500);
    } else {
      setIsGameOver(true);
      setMessage(`Incorrect! The correct answer was "${currentQuestion.options[currentQuestion.correctAnswerIndex]}". Game Over! You walk away with $${score}.`);
    }
  };

  const handleWalkAwayInitiate = () => {
    if (isLoadingQuestion || !currentQuestion) return;
    setShowWalkAwayConfirm(true); // Show confirmation modal
  };

  const handleWalkAwayConfirm = () => {
    setIsGameOver(true);
    setMessage(`You decided to walk away with your current winnings of $${score}.`);
    setShowWalkAwayConfirm(false); // Close confirmation modal
  };

  const handleFiftyFifty = () => {
    if (fiftyFiftyUsed || isLoadingQuestion || !currentQuestion) {
      setMessage(fiftyFiftyUsed ? "50/50 lifeline already used!" : "Question loading...");
      return;
    }
    setFiftyFiftyUsed(true);
    let incorrectOptions: number[] = [];
    currentQuestion.options.forEach((_: any, index: number) => {
      if (index !== currentQuestion.correctAnswerIndex) {
        incorrectOptions.push(index);
      }
    });
    const getRandomElements = (arr: number[], num: number) => {
      const shuffled = [...arr].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, num);
    };
    const optionsToRemove = getRandomElements(incorrectOptions, incorrectOptions.length - 1);
    setDisabledOptions(optionsToRemove);
    setMessage("Two incorrect answers have been removed!");
  };

  const handleAskAudience = () => {
    if (askAudienceUsed || isLoadingQuestion || !currentQuestion) {
      setMessage(askAudienceUsed ? "Ask the Audience lifeline already used!" : "Question loading...");
      return;
    }
    setAskAudienceUsed(true);

    const votes: Record<string, number> = {};
    const totalVotes = 100;
    const correctIndex = currentQuestion.correctAnswerIndex;
    const disabled = disabledOptions || [];
    const availableOptions = currentQuestion.options.filter((_: any, index: number) => !disabled.includes(index));

    let remainingVotes = totalVotes;
    const correctVote = Math.floor(Math.random() * (50 - 30 + 1)) + 30; // 30-50% for correct answer
    votes[currentQuestion.options[correctIndex]] = correctVote;
    remainingVotes -= correctVote;

    const otherOptions = availableOptions.filter(
      (option: any, index: number) => currentQuestion.options.indexOf(option) !== correctIndex
    );
    let distributedVotes = 0;
    otherOptions.forEach((option: any) => {
      const vote = Math.floor(Math.random() * (remainingVotes / otherOptions.length * 2));
      votes[option] = vote;
      distributedVotes += vote;
    });

    const adjustment = remainingVotes - distributedVotes;
    if (adjustment > 0 && otherOptions.length > 0) {
      votes[otherOptions[0]] = (votes[otherOptions[0]] || 0) + adjustment;
    } else if (adjustment < 0 && otherOptions.length > 0) {
        const sortedOptions = otherOptions.sort((a: any, b: any) => (votes[b] || 0) - (votes[a] || 0));
        votes[sortedOptions[0]] = (votes[sortedOptions[0]] || 0) + adjustment;
    }
    let currentSum = Object.values(votes).reduce((sum, val) => sum + val, 0);
    if (currentSum !== 100) {
        const diff = 100 - currentSum;
        const keys = Object.keys(votes);
        if (keys.length > 0) {
            votes[keys[0]] = (votes[keys[0]] || 0) + diff;
        }
    }
    for (const key in votes) {
        if (votes[key] < 0) votes[key] = 0;
    }


    setAudienceVote(votes);
    setMessage("The audience has voted!");
  };

  const handlePhoneFriend = () => {
    if (phoneFriendUsed || isLoadingQuestion || !currentQuestion) {
      setMessage(phoneFriendUsed ? "Phone a Friend lifeline already used!" : "Question loading...");
      return;
    }
    setPhoneFriendUsed(true);

    const correctIndex = currentQuestion.correctAnswerIndex;
    const disabled = disabledOptions || [];
    const availableOptions = currentQuestion.options.filter((_: any, index: number) => !disabled.includes(index));

    let friendConfidence = Math.random();
    let friendMsg = '';

    if (friendConfidence > 0.6) {
      friendMsg = `Your friend says: I'm pretty sure it's "${currentQuestion.options[correctIndex]}"`;
    } else {
      const incorrectAvailableOptions = availableOptions.filter(
        (option: any, index: number) => currentQuestion.options.indexOf(option) !== correctIndex
      );
      if (incorrectAvailableOptions.length > 0) {
        const suggestedIncorrect = incorrectAvailableOptions[Math.floor(Math.random() * incorrectAvailableOptions.length)];
        friendMsg = `Your friend says: I think it might be "${suggestedIncorrect}", but I'm not 100% sure.`;
      } else {
        friendMsg = `Your friend says: I'm not entirely sure, but based on the remaining options, it could be "${currentQuestion.options[correctIndex]}".`;
      }
    }
    setFriendAnswer(friendMsg);
    setMessage("You've called a friend!");
  };

  const handleRestartGame = () => {
    handleStartGame(); // Re-use start game logic to reset
  };

  if (!isGameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
          Who Wants to be a Millionaire?
        </h1>
        <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-lg w-full border-4 border-yellow-500">
          <h2 className="text-3xl font-bold mb-6 text-center">Single Player Mode</h2>
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
          <input
            type="number"
            placeholder="Your Age (5-100)"
            value={playerAge}
            onChange={(e) => setPlayerAge(e.target.value)}
            className="w-full p-3 mb-6 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            min="5"
            max="100"
          />
          <button
            onClick={handleStartGame}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mb-4"
          >
            Start Single Player Game
          </button>
          <button
            onClick={() => setGameMode('none')}
            className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            Back to Mode Selection
          </button>
        </div>
        <MessageBox message={message} onClose={() => setMessage('')} />
      </div>
    );
  }

  if (isGameOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
          Who Wants to be a Millionaire?
        </h1>
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center max-w-lg w-full border-4 border-yellow-500">
          <p className="text-3xl font-bold mb-4">Game Over!</p>
          <p className="text-xl mb-6">{playerName}, you finished with a score of: ${score}</p>
          <button
            onClick={handleRestartGame}
            className="bg-yellow-500 hover:bg-yellow-600 text-purple-900 font-extrabold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mb-4"
          >
            Play Again
          </button>
          <button
            onClick={() => setGameMode('none')}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            Back to Mode Selection
          </button>
        </div>
        <MessageBox message={message} onClose={() => setMessage('')} />
      </div>
    );
  }

  const currentPrize = prizeTiers[currentQuestionIndex] || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
      <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
        Who Wants to be a Millionaire?
      </h1>

      <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-3xl w-full border-4 border-yellow-500 flex flex-col items-center">
        <div className="flex justify-between w-full mb-6">
          <span className="text-xl font-semibold text-yellow-400">Prize: ${currentPrize}</span>
          <span className="text-xl font-semibold text-yellow-400">Your Score: ${score}</span>
        </div>

        <div className="mb-8 text-center bg-purple-900 p-6 rounded-lg border-2 border-yellow-400 shadow-inner">
          {isLoadingQuestion ? (
            <p className="text-2xl md:text-3xl font-bold animate-pulse">Generating question for {playerName} (Age {playerAge})...</p>
          ) : (currentQuestion ? (
            <p className="text-2xl md:text-3xl font-bold">{currentQuestion.question}</p>
          ) : (
            <p className="text-2xl md:text-3xl font-bold">Loading first question...</p>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-8">
          {currentQuestion && currentQuestion.options.map((option: string, index: number) => (
            <button
              key={index}
              onClick={() => handleAnswerClick(index)}
              disabled={isLoadingQuestion || disabledOptions.includes(index) || showWalkAwayConfirm}
              className={`
                ${isLoadingQuestion || disabledOptions.includes(index) || showWalkAwayConfirm
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'}
                text-white font-semibold py-3 px-4 rounded-lg transition duration-200 ease-in-out transform hover:scale-105 shadow-md text-left flex items-center
              `}
            >
              <span className="mr-3 font-bold text-yellow-300">{String.fromCharCode(65 + index)}.</span>
              {option}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-4 mb-8 w-full">
          <button
            onClick={handleFiftyFifty}
            disabled={fiftyFiftyUsed || isLoadingQuestion || showWalkAwayConfirm}
            className={`
              ${fiftyFiftyUsed || isLoadingQuestion || showWalkAwayConfirm ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}
              text-white font-bold py-3 px-6 rounded-full transition duration-200 ease-in-out transform hover:scale-105 shadow-lg
            `}
          >
            50:50
          </button>
          <button
            onClick={handleAskAudience}
            disabled={askAudienceUsed || isLoadingQuestion || showWalkAwayConfirm}
            className={`
              ${askAudienceUsed || isLoadingQuestion || showWalkAwayConfirm ? 'bg-gray-600 cursor-not-allowed' : 'bg-yellow-600 hover:bg-yellow-700'}
              text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
            `}
          >
            Ask the Audience
          </button>
          <button
            onClick={handlePhoneFriend}
            disabled={phoneFriendUsed || isLoadingQuestion || showWalkAwayConfirm}
            className={`
              ${phoneFriendUsed || isLoadingQuestion || showWalkAwayConfirm ? 'bg-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}
              text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
            `}
          >
            Phone a Friend
          </button>
        </div>

        {/* Walk Away Button - Separated */}
        <div className="w-full flex justify-center mt-4">
            <button
                onClick={handleWalkAwayInitiate}
                disabled={isLoadingQuestion || showWalkAwayConfirm}
                className={`
                    ${isLoadingQuestion || showWalkAwayConfirm ? 'bg-gray-600 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'}
                    text-white font-bold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
                `}
            >
                Walk Away
            </button>
        </div>


        {audienceVote && (
            <div className="bg-gray-700 p-5 rounded-lg w-full max-w-md mt-6 border border-yellow-500 shadow-inner text-center">
              <h3 className="text-xl font-bold mb-3 text-yellow-300">Audience Vote:</h3>
              {Object.entries(audienceVote).map(([option, percentage]) => (
                <div key={option} className="flex justify-between items-center mb-2">
                  <span className="text-lg">{option}:</span>
                  <div className="w-2/3 bg-gray-600 rounded-full h-4">
                    <div
                      className="bg-purple-400 h-4 rounded-full"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  {/* Fixed: Wrap sibling elements in a single parent div */}
                  <span className="ml-2 text-lg">{percentage}%</span>
                </div>
              ))}
            </div>
        )}

        {friendAnswer && (
          <div className="bg-gray-700 p-5 rounded-lg w-full max-w-md mt-6 border border-yellow-500 shadow-inner text-center">
            <h3 className="text-xl font-bold mb-3 text-yellow-300">Friend's Advice:</h3>
            <p className="text-lg italic">{friendAnswer}</p>
          </div>
        )}
      </div>
      <MessageBox message={message} onClose={() => setMessage('')} />
      {showWalkAwayConfirm && (
        <MessageBox
          message={`Are you sure you want to walk away with $${score}?`}
          onClose={() => setShowWalkAwayConfirm(false)}
          onConfirm={handleWalkAwayConfirm}
          showConfirmButtons={true}
        />
      )}
    </div>
  );
};

// --- Multiplayer Game Components (from previous iteration) ---
const LobbyScreen = ({ setRoomId, setPlayerName, setGameMode }: { setRoomId: (id: string | null) => void, setPlayerName: (name: string) => void, setGameMode: (mode: string) => void }) => {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [message, setMessage] = useState('');
  const [currentRoomPlayers, setCurrentRoomPlayers] = useState<Record<string, any>>({}); // Stores players in the current room
  const [currentRoomStatus, setCurrentRoomStatus] = useState('lobby'); // Stores game status for current room
  const [isHost, setIsHost] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  const roomUnsubscribeRef = useRef<(() => void) | null>(null);
  const currentRoomCodeRef = useRef(''); // To store roomCode from Firestore

  useEffect(() => {
    initFirebase(); // Ensure Firebase is initialized
  }, []);

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (!name.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    if (!age || parseInt(age) < 5 || parseInt(age) > 100) { // Simple age validation
      setMessage("Please enter a valid age (5-100).");
      return;
    }
    if (!isFirebaseInitialized) {
        setMessage("Firebase not ready. Please wait a moment and try again.");
        return;
    }

    const newRoomCode = generateRoomCode();
    const newRoomId = `room-${newRoomCode}`;
    const playerUserId = currentUserId; // Use the globally available user ID

    try {
        const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
        const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, newRoomId);
        await setDoc(roomRef, {
            gameCode: newRoomCode,
            status: 'lobby', // Initial status is lobby
            hostId: playerUserId,
            players: {
                [playerUserId as string]: {
                    name: name,
                    age: parseInt(age), // Store age
                    score: 0,
                    fiftyFiftyUsed: false,
                    askAudienceUsed: false,
                    phoneFriendUsed: false,
                    isActive: true // Player is active initially
                }
            },
            currentQuestionIndex: 0,
            currentTurnPlayerId: null, // Will be set when game starts
            currentQuestion: null, // AI-generated question for current turn
            isLoadingQuestion: false, // Loading state for AI question
            questionLifelineState: { // Stores results after a lifeline is completed
                disabledOptions: [],
                audienceVote: null,
                friendAnswer: null,
                usedByPlayerId: null
            },
            // New field for active lifeline requests
            activeLifelineRequest: null, // { type: 'audience'|'friend', initiatorId: '', targetPlayerId?: '', questionIndex: number, responses: { playerId: vote/suggestion } }
            playerOrder: [], // To track turn order
            eliminatedPlayers: [], // To track who is out
            contestantHistory: [], // New: Tracks who has completed a turn as contestant
            // Fastest Finger First specific fields
            fffQuestionIndex: 0,
            fffAnswers: {}, // playerId -> { order: [], time: timestamp }
            fffWinnerId: null,
            fffTieParticipants: [], // Array of player IDs if there's a tie
        });
        setRoomId(newRoomId);
        setPlayerName(name);
        setIsHost(true);
        currentRoomCodeRef.current = newRoomCode; // Store the generated room code
        setMessage(`Room created! Share code: ${newRoomCode}`);
        // Listen to updates for the newly created room
        roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCurrentRoomPlayers(data.players || {});
                setCurrentRoomStatus(data.status);
            } else {
                setMessage("Room no longer exists.");
                setRoomId(null); // Clear room ID to go back to lobby creation
                currentRoomCodeRef.current = ''; // Clear stored room code
            }
        });
    } catch (e) {
        console.error("Error creating room:", e);
        setMessage("Failed to create room. Please try again.");
    }
  };

  const handleJoinRoom = async () => {
    if (!name.trim() || !roomCode.trim()) {
      setMessage("Please enter your name and the game code.");
      return;
    }
    if (!age || parseInt(age) < 5 || parseInt(age) > 100) { // Simple age validation
      setMessage("Please enter a valid age (5-100).");
      return;
    }
    if (!isFirebaseInitialized) {
        setMessage("Firebase not ready. Please wait a moment and try again.");
        return;
    }

    const roomIdToJoin = `room-${roomCode.toUpperCase()}`;
    const playerUserId = currentUserId;

    try {
        setIsJoiningRoom(true);
        const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
        const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomIdToJoin);
        const docSnap = await getDoc(roomRef);

        if (docSnap.exists()) {
            const roomData = docSnap.data();
            if (roomData.status !== 'lobby') {
                setMessage("Cannot join: Game has already started or finished.");
                setIsJoiningRoom(false);
                return;
            }
            if (Object.keys(roomData.players).length >= 4) { // Max 4 players
                setMessage("Room is full. Maximum 4 players allowed.");
                setIsJoiningRoom(false);
                return;
            }

            // Check if player already exists in the room to avoid duplicate entry
            if (roomData.players && roomData.players[playerUserId as string]) {
                setMessage("You are already in this room.");
                setRoomId(roomIdToJoin);
                setPlayerName(name);
                setIsHost(roomData.hostId === playerUserId); // Re-check host status
                currentRoomCodeRef.current = roomData.gameCode; // Store the room code from Firestore
                // Listen to updates for the room
                roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setCurrentRoomPlayers(data.players || {});
                        setCurrentRoomStatus(data.status);
                        setIsHost(data.hostId === playerUserId);
                    } else {
                        setMessage("Room no longer exists.");
                        setRoomId(null);
                        currentRoomCodeRef.current = ''; // Clear stored room code
                    }
                });
                setIsJoiningRoom(false);
                return;
            }

            // Add player to the room's players map
            await updateDoc(roomRef, {
                [`players.${playerUserId as string}`]: {
                    name: name,
                    age: parseInt(age), // Store age
                    score: 0,
                    fiftyFiftyUsed: false,
                    askAudienceUsed: false,
                    phoneFriendUsed: false,
                    isActive: true
                }
            });

            setRoomId(roomIdToJoin);
            setPlayerName(name);
            setIsHost(roomData.hostId === playerUserId);
            currentRoomCodeRef.current = roomData.gameCode; // Store the room code from Firestore
            setMessage(`Joined room: ${roomCode.toUpperCase()}`);

            // Listen to updates for the joined room
            roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setCurrentRoomPlayers(data.players || {});
                    setCurrentRoomStatus(data.status);
                    setIsHost(data.hostId === playerUserId);
                } else {
                    setMessage("Room no longer exists.");
                    setRoomId(null); // Clear room ID to go back to lobby creation
                    currentRoomCodeRef.current = ''; // Clear stored room code
                }
            });
        } else {
            setMessage("Room not found. Please check the code.");
        }
    } catch (e) {
        console.error("Error joining room:", e);
        setMessage("Failed to join room. Please try again.");
    } finally {
        setIsJoiningRoom(false);
    }
  };

  const handleStartGame = async () => {
    if (!isHost) {
      setMessage("Only the host can start the game.");
      return;
    }
    const activePlayersArray = Object.keys(currentRoomPlayers).filter(
      (id) => currentRoomPlayers[id].isActive
    );
    if (activePlayersArray.length < 2) {
      setMessage("Need at least 2 players to start the game.");
      return;
    }

    try {
      const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
      const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, `room-${currentRoomCodeRef.current}`);
      await updateDoc(roomRef, {
        status: 'fastest-finger', // Transition to Fastest Finger First round
        fffQuestionIndex: 0,
        fffAnswers: {}, // Reset FFF answers for the new round
        fffWinnerId: null,
        fffTieParticipants: [],
        playerOrder: activePlayersArray, // Initial order for FFF
      });
    } catch (e) {
      console.error("Error starting game:", e);
      setMessage("Failed to start game. Please try again.");
    }
  };

  useEffect(() => {
    return () => {
      // Unsubscribe from Firestore listener when component unmounts
      if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
      }
    };
  }, []);

  // If already in a room and game has started, navigate to game screen
  if (currentRoomStatus === 'in-game' || currentRoomStatus === 'fastest-finger' || currentRoomStatus === 'final-scores') {
    return null; // The App component will handle rendering GameScreen or FastestFingerScreen
  }

  const numPlayers = Object.keys(currentRoomPlayers).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
      <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
        Who Wants to be a Millionaire?
      </h1>

      <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-lg w-full border-4 border-yellow-500">
        {roomUnsubscribeRef.current ? ( // If listening to a room
          <>
            <h2 className="text-3xl font-bold mb-4 text-center">Lobby: {currentRoomCodeRef.current}</h2>
            <p className="text-lg text-center mb-6">Players: {numPlayers} / 4</p>
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3">Joined Players:</h3>
              <ul className="list-disc list-inside space-y-2">
                {Object.entries(currentRoomPlayers).map(([id, player]) => (
                  <li key={id} className="flex justify-between items-center text-lg">
                    <span>{player.name} (Age: {player.age}) {id === currentUserId ? '(You)' : ''} {id === (currentRoomPlayers as any).hostId ? '(Host)' : ''}</span>
                    <span className={`text-sm ${player.isActive ? 'text-green-400' : 'text-red-400'}`}>
                      {player.isActive ? 'Active' : 'Eliminated'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {isHost && (numPlayers >= 2) && (
              <button
                onClick={handleStartGame}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
              >
                Start Game
              </button>
            )}
            {isHost && numPlayers < 2 && (
                <p className="text-center text-red-300 mt-4">Need at least 2 players to start.</p>
            )}
            <button
                onClick={() => setGameMode('none')}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mt-4"
            >
                Back to Mode Selection
            </button>
          </>
        ) : ( // If not in a room yet
          <>
            <h2 className="text-3xl font-bold mb-6 text-center">Create or Join Game</h2>
            <input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <input
              type="number"
              placeholder="Your Age (5-100)"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              min="5"
              max="100"
            />
            <button
              onClick={handleCreateRoom}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-purple-900 font-extrabold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mb-4"
            >
              Create New Room
            </button>
            <div className="flex items-center justify-center my-4">
              <span className="text-xl font-bold text-gray-400">OR</span>
            </div>
            <input
              type="text"
              placeholder="Enter Game Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full p-3 mb-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              maxLength={6} // Corrected: Passed as a number
            />
            <button
              onClick={handleJoinRoom}
              disabled={isJoiningRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
            >
              {isJoiningRoom ? 'Joining...' : 'Join Room'}
            </button>
            <button
                onClick={() => setGameMode('none')}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mt-4"
            >
                Back to Mode Selection
            </button>
          </>
        )}
      </div>
      <MessageBox message={message} onClose={() => setMessage('')} />
    </div>
  );
};

// Fastest Finger First Screen Component
const FastestFingerScreen = ({ roomId, userId, setRoomId }: { roomId: string, userId: string, setRoomId: (id: string | null) => void }) => {
    const [roomData, setRoomData] = useState<any>(null);
    const [message, setMessage] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const roomUnsubscribeRef = useRef<(() => void) | null>(null);
    const fffStartTimeRef = useRef<number | null>(null);

    const currentFffQuestion = roomData ? fffQuestionsData[roomData.fffQuestionIndex % fffQuestionsData.length] : null;
    const activeFffPlayers = roomData ? Object.keys(roomData.players).filter(
        (id) => roomData.players[id].isActive && (!roomData.fffTieParticipants || roomData.fffTieParticipants.length === 0 || roomData.fffTieParticipants.includes(id))
    ) : [];

    useEffect(() => {
        if (!roomId || !dbInstance) {
            console.error("FastestFingerScreen: roomId or dbInstance is missing.");
            return;
        }

        const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
        const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);

        roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setRoomData(data);

                // Reset submission state if a new FFF round starts or question changes
                if (data.fffQuestionIndex !== (roomData ? roomData.fffQuestionIndex : -1)) {
                    setSelectedOrder([]);
                    setHasSubmitted(false);
                    fffStartTimeRef.current = Date.now();
                }

                // Logic to check for FFF winner/tie/no-correct after all active players submit
                const submittedPlayersCount = Object.keys(data.fffAnswers || {}).length;
                if (data.status === 'fastest-finger' && submittedPlayersCount === activeFffPlayers.length && activeFffPlayers.length > 0) {
                    determineFffWinner(data, roomRef);
                }
            } else {
                setMessage("The game room no longer exists.");
                setRoomId(null);
            }
        }, (error) => {
            console.error("Error listening to room:", error);
            setMessage("Lost connection to the game room.");
            setRoomId(null);
        });

        return () => {
            if (roomUnsubscribeRef.current) {
                roomUnsubscribeRef.current();
            }
        };
    }, [roomId, setRoomId, activeFffPlayers.length]); // Depend on activeFffPlayers.length to re-evaluate winner logic

    const determineFffWinner = useCallback(async (currentRoomData: any, roomRef: any) => {
        const correctSubmissions: { playerId: string, time: number }[] = [];
        for (const playerId of activeFffPlayers) {
            const playerAnswer = currentRoomData.fffAnswers[playerId];
            if (playerAnswer) {
                const isCorrect = JSON.stringify(playerAnswer.order) === JSON.stringify(currentFffQuestion?.correctOrderIndices);
                if (isCorrect) {
                    correctSubmissions.push({ playerId, time: playerAnswer.time });
                }
            }
        }

        correctSubmissions.sort((a, b) => a.time - b.time); // Sort by fastest time

        if (correctSubmissions.length === 0) {
            // No one got it correct
            setMessage("No one got the correct order! Playing another Fastest Finger First round...");
            setTimeout(async () => {
                await updateDoc(roomRef, {
                    fffQuestionIndex: currentRoomData.fffQuestionIndex + 1,
                    fffAnswers: {}, // Clear submissions for new round
                    fffWinnerId: null,
                    fffTieParticipants: [],
                });
            }, 2000);
        } else if (correctSubmissions.length === 1 || correctSubmissions[0].time !== correctSubmissions[1]?.time) {
            // A single winner or clear fastest winner
            const winnerId = correctSubmissions[0].playerId;
            const winnerName = currentRoomData.players[winnerId]?.name || 'A player';
            setMessage(`${winnerName} wins the Fastest Finger First! They will start the game.`);

            const shuffledPlayerIds = roomData.playerOrder.sort(() => 0.5 - Math.random());
            const firstPlayerInMainGame = winnerId; // Winner starts the main game

            setTimeout(async () => {
                await updateDoc(roomRef, {
                    status: 'in-game', // Transition to main game
                    currentTurnPlayerId: firstPlayerInMainGame,
                    playerOrder: shuffledPlayerIds, // Still need a general player order for turns
                    fffWinnerId: winnerId,
                    fffAnswers: {}, // Clear FFF answers
                    fffTieParticipants: [],
                    // Reset question for main game
                    currentQuestionIndex: 0,
                    currentQuestion: null, // Reset AI generated question
                    isLoadingQuestion: false,
                    questionLifelineState: { disabledOptions: [], audienceVote: null, friendAnswer: null, usedByPlayerId: null },
                    activeLifelineRequest: null, // Clear any active lifeline requests
                    contestantHistory: [], // Reset contestant history for new game
                });
            }, 2000);
        } else {
            // Tie situation
            const tiedTimes = correctSubmissions.filter(s => s.time === correctSubmissions[0].time);
            const tiedPlayerIds = tiedTimes.map(s => s.playerId);
            const tiedNames = tiedPlayerIds.map(id => currentRoomData.players[id]?.name || 'Unknown Player').join(', ');
            setMessage(`It's a tie between ${tiedNames}! Playing another Fastest Finger First round for tied players.`);

            setTimeout(async () => {
                await updateDoc(roomRef, {
                    fffQuestionIndex: currentRoomData.fffQuestionIndex + 1,
                    fffAnswers: {}, // Clear submissions for new tie-breaker round
                    fffWinnerId: null,
                    fffTieParticipants: tiedPlayerIds, // Only these players participate in next FFF
                });
            }, 2000);
        }
    }, [activeFffPlayers, currentFffQuestion, roomData]);


    const handleItemClick = (itemIndex: number) => {
        if (hasSubmitted) return;
        if (selectedOrder.includes(itemIndex)) {
            // If already selected, remove it
            setSelectedOrder(selectedOrder.filter(idx => idx !== itemIndex));
        } else if (selectedOrder.length < (currentFffQuestion?.items.length || 0)) {
            // Add to selected order if not full
            setSelectedOrder([...selectedOrder, itemIndex]);
        }
    };

    const handleSubmitOrder = async () => {
        if (selectedOrder.length !== (currentFffQuestion?.items.length || 0)) {
            setMessage("Please order all four items before submitting.");
            return;
        }
        if (hasSubmitted) return;

        setHasSubmitted(true);
        const submissionTime = Date.now(); // Record client-side submission time
        setMessage("Order submitted! Waiting for other players...");

        try {
            const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
            const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
            await updateDoc(roomRef, {
                [`fffAnswers.${userId}`]: {
                    order: selectedOrder,
                    time: submissionTime
                }
            });
        } catch (e) {
            console.error("Error submitting FFF answer:", e);
            setMessage("Failed to submit answer. Please try again.");
            setHasSubmitted(false); // Allow re-submission on error
        }
    };

    if (!roomData || !currentFffQuestion) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex items-center justify-center">
                <p className="text-xl">Preparing Fastest Finger First round...</p>
            </div>
        );
    }

    const myFffAnswer = roomData.fffAnswers ? roomData.fffAnswers[userId] : null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
                Fastest Finger First!
            </h1>

            <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-3xl w-full border-4 border-yellow-500 flex flex-col items-center">
                <div className="mb-8 text-center bg-purple-900 p-6 rounded-lg border-2 border-yellow-400 shadow-inner">
                    <p className="text-2xl md:text-3xl font-bold">{currentFffQuestion.question}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-8">
                    {currentFffQuestion.items.map((item: string, index: number) => (
                        <button
                            key={index}
                            onClick={() => handleItemClick(index)}
                            disabled={hasSubmitted || (selectedOrder.includes(index) && selectedOrder.indexOf(index) >= (currentFffQuestion?.items.length || 0))}
                            className={`
                                ${selectedOrder.includes(index) ? 'bg-yellow-600 text-purple-900' : 'bg-blue-600 hover:bg-blue-700'}
                                ${hasSubmitted ? 'cursor-not-allowed opacity-70' : ''}
                                text-white font-semibold py-3 px-4 rounded-lg transition duration-200 ease-in-out transform hover:scale-105 shadow-md text-left flex items-center
                            `}
                        >
                            <span className="mr-3 font-bold">{String.fromCharCode(65 + index)}.</span>
                            {item}
                        </button>
                    ))}
                </div>

                <div className="w-full mb-6 p-4 bg-gray-700 rounded-lg shadow-inner">
                    <h3 className="text-xl font-bold mb-3 text-yellow-300">Your Current Order:</h3>
                    <div className="flex flex-wrap gap-2 text-lg">
                        {selectedOrder.length > 0 ? (
                            selectedOrder.map((idx, pos) => (
                                <span key={pos} className="bg-purple-600 px-3 py-1 rounded-full border border-purple-400">
                                    {pos + 1}. {currentFffQuestion.items[idx]}
                                </span>
                            ))
                        ) : (
                            <span className="text-gray-400">Select items to form your order...</span>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleSubmitOrder}
                    disabled={hasSubmitted || selectedOrder.length !== (currentFffQuestion?.items.length || 0)}
                    className={`
                        ${hasSubmitted || selectedOrder.length !== (currentFffQuestion?.items.length || 0) ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}
                        w-full text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
                    `}
                >
                    {hasSubmitted ? 'Submitted!' : 'Submit Order'}
                </button>

                <div className="w-full mt-6 p-4 bg-gray-700 rounded-lg shadow-inner">
                    <h3 className="text-xl font-bold mb-3 text-yellow-300">Player Submissions:</h3>
                    <ul className="list-disc list-inside space-y-2">
                        {activeFffPlayers.map((playerId: string) => (
                            <li key={playerId} className="flex justify-between items-center text-lg">
                                <span>{roomData.players[playerId]?.name || 'Unknown Player'} {playerId === userId ? '(You)' : ''}</span>
                                {roomData.fffAnswers && roomData.fffAnswers[playerId] ? (
                                    <span className="text-green-400">Submitted ({(((roomData.fffAnswers[playerId].time || 0) - (fffStartTimeRef.current || 0)) / 1000).toFixed(2)}s)</span>
                                ) : (
                                    <span className="text-gray-400">Waiting...</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <MessageBox message={message} onClose={() => setMessage('')} />
        </div>
    );
};

// Modal for AskAudience participation
const AskAudienceModal = ({ roomData, currentUserId, currentQuestion, onSubmitVote, onClose }: { roomData: any, currentUserId: string, currentQuestion: any, onSubmitVote: (index: number) => Promise<void>, onClose: () => void }) => {
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const hasVoted = roomData?.activeLifelineRequest?.responses?.[currentUserId] !== undefined;

    const handleVote = () => {
        if (selectedOption !== null) {
            onSubmitVote(selectedOption);
        } else {
            // Optional: Show a message if no option is selected
        }
    };

    if (!roomData.activeLifelineRequest || roomData.activeLifelineRequest.type !== 'audience' || roomData.activeLifelineRequest.initiatorId === currentUserId) {
        return null; // Don't show if not active, not audience type, or if it's the initiator
    }

    // Ensure the current user is an active player to participate
    const isPlayerActive = roomData.players[currentUserId]?.isActive;
    if (!isPlayerActive) {
        return null; // Inactive players don't vote
    }

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-purple-700 to-indigo-900 text-white p-8 rounded-xl shadow-2xl max-w-lg w-full text-center border-4 border-yellow-500">
                <h3 className="text-3xl font-bold mb-6 text-yellow-400">Ask the Audience!</h3>
                <p className="text-xl mb-4">{roomData.players[roomData.activeLifelineRequest.initiatorId]?.name} needs your help!</p>
                <p className="text-lg italic mb-6">Question: "{currentQuestion?.question}"</p>

                <div className="grid grid-cols-1 gap-4 mb-6">
                    {currentQuestion?.options.map((option: string, index: number) => (
                        <button
                            key={index}
                            onClick={() => setSelectedOption(index)}
                            disabled={hasVoted}
                            className={`
                                w-full py-3 px-4 rounded-lg text-left flex items-center transition duration-200 ease-in-out
                                ${selectedOption === index ? 'bg-yellow-500 text-purple-900 font-bold' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                                ${hasVoted ? 'opacity-70 cursor-not-allowed' : ''}
                            `}
                        >
                            <span className="mr-3 font-bold">{String.fromCharCode(65 + index)}.</span>
                            {option}
                        </button>
                    ))}
                </div>

                <button
                    onClick={handleVote}
                    disabled={selectedOption === null || hasVoted}
                    className="bg-green-600 hover:bg-green-700 text-white font-extrabold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg w-full"
                >
                    {hasVoted ? 'Voted!' : 'Submit Vote'}
                </button>
            </div>
        </div>
    );
};

// Modal for Phone a Friend selection
const PhoneFriendSelectModal = ({ roomData, currentUserId, onSelectFriend, onClose }: { roomData: any, currentUserId: string, onSelectFriend: (friendId: string) => Promise<void>, onClose: () => void }) => {
    // Filter out the current user and any eliminated players
    const callableFriends = Object.keys(roomData.players)
        .filter(id => id !== currentUserId && roomData.players[id].isActive);

    if (!callableFriends.length) {
        return (
            <MessageBox message="No other active players available to call!" onClose={onClose} />
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-purple-700 to-indigo-900 text-white p-8 rounded-xl shadow-2xl max-w-sm w-full text-center border-4 border-yellow-500">
                <h3 className="text-3xl font-bold mb-6 text-yellow-400">Phone a Friend!</h3>
                <p className="text-xl mb-4">Who would you like to call?</p>

                <div className="grid grid-cols-1 gap-3 mb-6">
                    {callableFriends.map((friendId: string) => (
                        <button
                            key={friendId}
                            onClick={() => onSelectFriend(friendId)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 ease-in-out transform hover:scale-105 shadow-md w-full"
                        >
                            {roomData.players[friendId]?.name} (Age: {roomData.players[friendId]?.age})
                        </button>
                    ))}
                </div>
                <button
                    onClick={onClose}
                    className="bg-gray-500 hover:bg-gray-600 text-white font-extrabold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg w-full"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

// Modal for Phone a Friend (the friend's side)
const PhoneFriendAnswerModal = ({ roomData, currentUserId, currentQuestion, onSubmitSuggestion, onClose }: { roomData: any, currentUserId: string, currentQuestion: any, onSubmitSuggestion: (index: number) => Promise<void>, onClose: () => void }) => {
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const hasSuggested = roomData?.activeLifelineRequest?.responses?.[currentUserId] !== undefined;

    const handleSuggestion = () => {
        if (selectedOption !== null) {
            onSubmitSuggestion(selectedOption);
        }
    };

    if (!roomData.activeLifelineRequest || roomData.activeLifelineRequest.type !== 'friend' || roomData.activeLifelineRequest.targetPlayerId !== currentUserId) {
        return null; // Only show if it's a PAF request and this user is the target
    }

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-purple-700 to-indigo-900 text-white p-8 rounded-xl shadow-2xl max-w-lg w-full text-center border-4 border-yellow-500">
                <h3 className="text-3xl font-bold mb-6 text-yellow-400">You're Phone a Friend!</h3>
                <p className="text-xl mb-4">{roomData.players[roomData.activeLifelineRequest.initiatorId]?.name} is calling for help!</p>
                <p className="text-lg italic mb-6">Question: "{currentQuestion?.question}"</p>

                <div className="grid grid-cols-1 gap-4 mb-6">
                    {currentQuestion?.options.map((option: string, index: number) => (
                        <button
                            key={index}
                            onClick={() => setSelectedOption(index)}
                            disabled={hasSuggested}
                            className={`
                                w-full py-3 px-4 rounded-lg text-left flex items-center transition duration-200 ease-in-out
                                ${selectedOption === index ? 'bg-yellow-500 text-purple-900 font-bold' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                                ${hasSuggested ? 'opacity-70 cursor-not-allowed' : ''}
                            `}
                        >
                            <span className="mr-3 font-bold">{String.fromCharCode(65 + index)}.</span>
                            {option}
                        </button>
                    ))}
                </div>

                <button
                    onClick={handleSuggestion}
                    disabled={selectedOption === null || hasSuggested}
                    className="bg-green-600 hover:bg-green-700 text-white font-extrabold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg w-full"
                >
                    {hasSuggested ? 'Suggested!' : 'Submit Suggestion'}
                </button>
            </div>
        </div>
    );
};


// Game Screen Component
const GameScreen = ({ roomId, playerName, userId, setRoomId }: { roomId: string, playerName: string, userId: string, setRoomId: (id: string | null) => void }) => {
  const [roomData, setRoomData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [showPhoneFriendSelect, setShowPhoneFriendSelect] = useState(false); // State for PAF select modal
  const [showWalkAwayConfirm, setShowWalkAwayConfirm] = useState(false); // New state for walk away confirmation
  const roomUnsubscribeRef = useRef<(() => void) | null>(null);

  const currentQuestion = roomData ? roomData.currentQuestion : null; // Use AI-generated question
  const isMyTurn = roomData && roomData.currentTurnPlayerId === userId;
  const isMyActive = roomData && roomData.players[userId] && roomData.players[userId].isActive;
  const myPlayerState = roomData && roomData.players[userId];
  const currentContestantAge = roomData?.currentTurnPlayerId ? roomData.players[roomData.currentTurnPlayerId]?.age : 0;
  const isHost = roomData?.hostId === userId; // Determine if current user is host

  // Function to get the next active player's ID for a new turn.
  // It finds the next player in the predefined order who is still active
  // and has NOT yet been a contestant (i.e., not in contestantHistory).
  const getNextContestantPlayerId = useCallback((currentOrder: string[], eliminatedPlayers: string[], contestantHistory: string[], currentTurnId: string) => {
    const activeAndNotPlayed = currentOrder.filter(id =>
        !eliminatedPlayers.includes(id) && !contestantHistory.includes(id)
    );

    if (activeAndNotPlayed.length === 0) {
        return null; // No more active players who haven't been a contestant
    }

    // Find the current contestant's index in the full order
    const lastContestantIndex = currentOrder.indexOf(currentTurnId);
    let startIndex = (lastContestantIndex + 1) % currentOrder.length;

    // Loop through the player order starting from the next position
    for (let i = 0; i < currentOrder.length; i++) {
        const playerToCheckId = currentOrder[(startIndex + i) % currentOrder.length];
        if (activeAndNotPlayed.includes(playerToCheckId)) {
            return playerToCheckId;
        }
    }
    return null; // Fallback, should not be reached if activeAndNotPlayed is not empty
  }, []);

  useEffect(() => {
    if (!roomId || !dbInstance) {
      console.error("GameScreen: roomId or dbInstance is missing.");
      return;
    }

    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);

    // Define generateAndSetQuestion internally within useEffect
    const generateAndSetQuestionInternal = async (age: number, prizeLevel: number, questionIndex: number) => {
        if (!dbInstance || !roomId) return; // Add check here just in case

        try {
            await updateDoc(roomRef, { isLoadingQuestion: true }); // Set loading state in Firestore

            const prompt = `Generate a "Who Wants to be a Millionaire?" style trivia question for a ${age}-year-old with a prize value of $${prizeLevel}. The question should have four distinct options (A, B, C, D) and specify which one is correct. Ensure the question is age-appropriate and has a clear correct answer. The question should not be too easy or too hard for the prize level. Provide the output in JSON format with 'question', 'options' (an array of strings), and 'correctAnswerIndex' (0-3).`;

            const payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "question": { "type": "STRING" },
                            "options": {
                                "type": "ARRAY",
                                "items": { "type": "STRING" },
                                "minItems": 4,
                                "maxItems": 4
                            },
                            "correctAnswerIndex": { "type": "NUMBER", "minimum": 0, "maximum": 3 }
                        },
                        "required": ["question", "options", "correctAnswerIndex"]
                    }
                }
            };

            const apiKey = ""; // Canvas will provide this in runtime
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const jsonString = result.candidates[0].content.parts[0].text;
                let generatedQ: any = {};
                try {
                    generatedQ = JSON.parse(jsonString);
                } catch (parseError) {
                    console.error("Failed to parse AI generated question:", parseError, "Raw text:", jsonString);
                    setMessage("Failed to generate a valid question. Please try again.");
                    generatedQ = {
                        question: "Could not load question. What is the capital of Australia?",
                        options: ["Sydney", "Melbourne", "Canberra", "Perth"],
                        correctAnswerIndex: 2
                    };
                }
                await updateDoc(roomRef, {
                    currentQuestion: generatedQ,
                    isLoadingQuestion: false,
                });
            } else {
                console.error("AI question generation failed:", result);
                setMessage("Failed to generate a question. Please try again.");
                await updateDoc(roomRef, { isLoadingQuestion: false });
            }
        } catch (apiError) {
            console.error("Error calling Gemini API:", apiError);
            setMessage("Error connecting to AI. Please check your internet or try again later.");
            await updateDoc(roomRef, { isLoadingQuestion: false });
        }
    };


    roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);

        // Host's responsibility to generate the question when needed
        if (isHost && data.status === 'in-game' && data.currentTurnPlayerId && !data.isLoadingQuestion) {
            // Check if currentQuestion is null or doesn't match currentQuestionIndex
            if (!data.currentQuestion || data.currentQuestion.questionIndex !== data.currentQuestionIndex) {
                 const currentPrize = prizeTiers[data.currentQuestionIndex] || 0;
                 const contestantAge = data.players[data.currentTurnPlayerId]?.age || 18; // Default to 18 if age not found
                 generateAndSetQuestionInternal(contestantAge, currentPrize, data.currentQuestionIndex); // Call the internal function
            }
        }

        // Host logic for processing Ask the Audience results
        if (isHost && data.activeLifelineRequest?.type === 'audience' && data.activeLifelineRequest.questionIndex === data.currentQuestionIndex) {
            const initiatorId = data.activeLifelineRequest.initiatorId;
            const playersToVote = Object.keys(data.players).filter(
                pId => data.players[pId].isActive && pId !== initiatorId && pId !== data.currentTurnPlayerId // Exclude initiator and current contestant from audience
            );
            const votesReceivedCount = Object.keys(data.activeLifelineRequest.responses || {}).length;

            if (playersToVote.length > 0 && votesReceivedCount === playersToVote.length) {
                // All expected votes received
                const collectedVotes = data.activeLifelineRequest.responses;
                const voteCounts: Record<number, number> = {}; // {optionIndex: count}

                Object.values(collectedVotes).forEach((vote: any) => {
                    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
                });

                const totalAudienceVotes = playersToVote.length;
                const audiencePercentages: Record<string, number> = {};
                for (let i = 0; i < (data.currentQuestion?.options.length || 4); i++) {
                    audiencePercentages[data.currentQuestion.options[i]] = Math.round(((voteCounts[i] || 0) / totalAudienceVotes) * 100);
                }

                // Ensure percentages sum to 100 (distribute remainder if any)
                let sum = Object.values(audiencePercentages).reduce((acc, val) => acc + val, 0);
                if (sum !== 100 && (data.currentQuestion?.options.length || 4) > 0) {
                    audiencePercentages[data.currentQuestion.options[0]] += (100 - sum);
                }

                updateDoc(roomRef, {
                    'questionLifelineState.audienceVote': audiencePercentages,
                    'questionLifelineState.usedByPlayerId': initiatorId,
                    activeLifelineRequest: null // Clear active request
                });
            }
        } else if (isHost && data.activeLifelineRequest?.type === 'friend' && data.activeLifelineRequest.questionIndex === data.currentQuestionIndex) {
            const initiatorId = data.activeLifelineRequest.initiatorId;
            const targetPlayerId = data.activeLifelineRequest.targetPlayerId;
            const friendSuggestion = data.activeLifelineRequest.responses?.[targetPlayerId];

            if (friendSuggestion !== undefined) {
                 // Friend has submitted their suggestion
                 updateDoc(roomRef, {
                    'questionLifelineState.friendAnswer': currentQuestion.options[friendSuggestion], // Store text
                    'questionLifelineState.usedByPlayerId': initiatorId,
                    activeLifelineRequest: null // Clear active request
                });
            }
        }

        // Check for game completion and transition to final-scores
        const allPlayers = Object.keys(data.players);
        const allContestantsDone = allPlayers.every(playerId => data.contestantHistory.includes(playerId) || !data.players[playerId].isActive);

        if (data.status === 'in-game' && allContestantsDone) { // Condition: all players have had a turn (or are eliminated)
             updateDoc(roomRef, { status: 'final-scores' });
        }

      } else {
        setMessage("The game room no longer exists.");
        setRoomId(null); // Go back to lobby
      }
    }, (error) => {
        console.error("Error listening to room:", error);
        setMessage("Lost connection to the game room.");
        setRoomId(null);
    });

    return () => {
      if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
      }
    };
  }, [roomId, setRoomId, isHost, currentQuestion, getNextContestantPlayerId]); // Removed generateAndSetQuestion from dependencies

  // Function to handle answer selection
  const handleAnswerClick = async (selectedIndex: number) => {
    if (!roomData || !isMyTurn || !isMyActive || roomData.isLoadingQuestion || !currentQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm) return;

    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    const correct = selectedIndex === currentQuestion.correctAnswerIndex;
    let newScore = myPlayerState.score;
    let playerIsActive = myPlayerState.isActive;
    let nextQuestionIndex = roomData.currentQuestionIndex; // Will be reset to 0 for next contestant
    let nextTurnPlayerId: string | null = roomData.currentTurnPlayerId;
    let updatedPlayers = { ...roomData.players };
    let newEliminatedPlayers = [...(roomData.eliminatedPlayers || [])];
    let newContestantHistory = [...(roomData.contestantHistory || [])];
    let newQuestionLifelineState = { // Reset lifelines for next turn/question
        disabledOptions: [],
        audienceVote: null,
        friendAnswer: null,
        usedByPlayerId: null
    };

    if (correct) {
      newScore = prizeTiers[roomData.currentQuestionIndex];
      setMessage(`Correct! You've won $${newScore}!`);
      updatedPlayers[userId].score = newScore;

      // If max prize is reached, mark current player as done and end game
      if (roomData.currentQuestionIndex === prizeTiers.length - 1) {
          if (!newContestantHistory.includes(userId)) { // Add to history only if not already present
              newContestantHistory.push(userId);
          }
          nextTurnPlayerId = null; // No more turns, game ends
      } else {
          // Continue to next question for the same contestant
          nextQuestionIndex = roomData.currentQuestionIndex + 1;
      }
      
    } else { // Incorrect answer
      setMessage(`Incorrect! The correct answer was "${currentQuestion.options[currentQuestion.correctAnswerIndex]}".`);
      playerIsActive = false; // Eliminate this player
      updatedPlayers[userId].isActive = false;
      newEliminatedPlayers.push(userId); // Add to eliminated list
      
      // Calculate score based on last safety net
      let walkedAwayPrize = 0;
      for (const index of safetyNetIndices) {
        if (roomData.currentQuestionIndex >= index) {
          walkedAwayPrize = prizeTiers[index];
        }
      }
      updatedPlayers[userId].score = walkedAwayPrize; // Update final score for eliminated player

      setMessage((prev) => prev + ` You are eliminated and walk away with $${walkedAwayPrize}.`);

      if (!newContestantHistory.includes(userId)) { // Add to history only if not already present
          newContestantHistory.push(userId);
      }
      nextQuestionIndex = 0; // Reset question index for next contestant
    }

    // Determine the next overall contestant for the main game
    // This part ensures the turn logic handles continuation vs new contestant correctly
    let nextContestantCandidateId = getNextContestantPlayerId(roomData.playerOrder, newEliminatedPlayers, newContestantHistory, roomData.currentTurnPlayerId);

    // If the next candidate is the same as the current player AND they answered correctly
    // AND they haven't reached the end of questions, they continue their turn.
    if (nextContestantCandidateId === roomData.currentTurnPlayerId && correct && roomData.currentQuestionIndex < prizeTiers.length -1) {
        // Current player continues, do not change nextTurnPlayerId
        // `nextQuestionIndex` has already been incremented above for this case
    } else {
        // A new contestant or game end
        nextTurnPlayerId = nextContestantCandidateId; // Assign the next determined contestant
        if (nextTurnPlayerId !== null) { // If there's a new contestant
            nextQuestionIndex = 0; // Reset question index for them
        }
    }


    // Update Firestore with the new game state
    await updateDoc(roomRef, {
      currentQuestionIndex: nextQuestionIndex,
      currentTurnPlayerId: nextTurnPlayerId,
      players: updatedPlayers,
      eliminatedPlayers: newEliminatedPlayers,
      contestantHistory: newContestantHistory, // Update history
      currentQuestion: null, // Clear current question to trigger generation for next turn
      questionLifelineState: newQuestionLifelineState,
      activeLifelineRequest: null, // Ensure any active lifeline request is cleared
      // Status update handled by useEffect listener, will transition to final-scores if all done
    });

    // Clear local message after some time
    setTimeout(() => setMessage(''), 2000);
  };

  // Function to handle walking away
  const handleWalkAwayInitiate = () => {
    if (!roomData || !isMyTurn || !isMyActive || roomData.isLoadingQuestion || !currentQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm) {
      setMessage("Not your turn, eliminated, or question loading/lifeline active.");
      return;
    }
    setShowWalkAwayConfirm(true); // Show confirmation modal
  };

  const handleWalkAwayConfirm = async () => {
    setShowWalkAwayConfirm(false); // Close confirmation modal

    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    let updatedPlayers = { ...roomData.players };
    let newContestantHistory = [...(roomData.contestantHistory || [])];
    let newEliminatedPlayers = [...(roomData.eliminatedPlayers || [])]; // Keep current eliminated players

    // Finalize score at current prize level for the walking player
    const walkedAwayPrize = prizeTiers[roomData.currentQuestionIndex] || 0;
    updatedPlayers[userId].score = walkedAwayPrize;
    
    // Mark as completed contestant turn
    if (!newContestantHistory.includes(userId)) {
        newContestantHistory.push(userId);
    }

    setMessage(`You decided to walk away with your current winnings of $${walkedAwayPrize}.`);

    // Find the next player who has NOT been a contestant yet
    const nextTurnPlayerId = getNextContestantPlayerId(roomData.playerOrder, newEliminatedPlayers, newContestantHistory, userId);
    const nextQuestionIndex = 0; // Always reset question index for new contestant

    await updateDoc(roomRef, {
        currentQuestionIndex: nextQuestionIndex,
        currentTurnPlayerId: nextTurnPlayerId,
        players: updatedPlayers,
        contestantHistory: newContestantHistory,
        currentQuestion: null, // Clear current question to trigger generation for next turn
        questionLifelineState: { // Reset lifelines
            disabledOptions: [],
            audienceVote: null,
            friendAnswer: null,
            usedByPlayerId: null
        },
        activeLifelineRequest: null, // Clear any active lifeline request
        // Status update handled by useEffect listener, will transition to final-scores if all done
    });
    setTimeout(() => setMessage(''), 2000);
  };


  const handleFiftyFifty = async () => {
    if (!roomData || !isMyTurn || !isMyActive || myPlayerState.fiftyFiftyUsed || roomData.isLoadingQuestion || !currentQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm) {
      setMessage(myPlayerState.fiftyFiftyUsed ? "50/50 lifeline already used!" : "Not your turn, eliminated, or question loading.");
      return;
    }

    let incorrectOptions: number[] = [];
    currentQuestion.options.forEach((_: any, index: number) => {
      if (index !== currentQuestion.correctAnswerIndex) {
        incorrectOptions.push(index);
      }
    });

    const getRandomElements = (arr: number[], num: number) => {
      const shuffled = [...arr].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, num);
    };

    const optionsToRemove = getRandomElements(incorrectOptions, incorrectOptions.length - 1); // Select one incorrect to keep, remove others

    // Update Firestore
    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    await updateDoc(roomRef, {
      [`players.${userId}.fiftyFiftyUsed`]: true,
      'questionLifelineState.disabledOptions': optionsToRemove,
      'questionLifelineState.usedByPlayerId': userId // Mark who used it
    });
    setMessage("Two incorrect answers have been removed!");
  };

  // Function to initiate Ask the Audience
  const handleAskAudience = async () => {
    if (!roomData || !isMyTurn || !isMyActive || myPlayerState.askAudienceUsed || roomData.isLoadingQuestion || !currentQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm) {
      setMessage(myPlayerState.askAudienceUsed ? "Ask the Audience lifeline already used!" : "Not your turn, eliminated, or question loading/lifeline active.");
      return;
    }

    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    await updateDoc(roomRef, {
        activeLifelineRequest: {
            type: 'audience',
            initiatorId: userId,
            questionIndex: roomData.currentQuestionIndex,
            responses: {} // To collect votes
        },
    });
    setMessage("Asking the audience...");
  };

  // Callback for when an audience member submits their vote
  const handleSubmitAudienceVote = async (selectedOptionIndex: number) => {
    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    // Add the vote to the activeLifelineRequest.responses map
    await updateDoc(roomRef, {
        [`activeLifelineRequest.responses.${userId}`]: selectedOptionIndex
    });
    setMessage("Your vote has been submitted.");
  };


  // Function to initiate Phone a Friend (show selection modal)
  const handlePhoneFriend = async () => {
    if (!roomData || !isMyTurn || !isMyActive || myPlayerState.phoneFriendUsed || roomData.isLoadingQuestion || !currentQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm) {
      setMessage(myPlayerState.phoneFriendUsed ? "Phone a Friend lifeline already used!" : "Not your turn, eliminated, or question loading/lifeline active.");
      return;
    }
    // Show the modal to select a friend
    setShowPhoneFriendSelect(true);
  };

  // Callback for when the contestant selects a friend for PAF
  const handleSelectFriendForPhone = async (friendId: string) => {
    setShowPhoneFriendSelect(false); // Close selection modal
    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    await updateDoc(roomRef, {
        activeLifelineRequest: {
            type: 'friend',
            initiatorId: userId,
            targetPlayerId: friendId,
            questionIndex: roomData.currentQuestionIndex,
            responses: {} // To collect the friend's suggestion
        },
    });
    setMessage(`Calling ${roomData.players[friendId]?.name}...`);
  };

  // Callback for when the "friend" submits their suggestion
  const handleSubmitFriendSuggestion = async (selectedOptionIndex: number) => {
    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    // Add the suggestion to the activeLifelineRequest.responses map
    await updateDoc(roomRef, {
        [`activeLifelineRequest.responses.${userId}`]: selectedOptionIndex
    });
    setMessage("Your suggestion has been sent.");
  };


  const handleRestartGame = async () => {
      if (!roomData || roomData.hostId !== userId) {
          setMessage("Only the host can restart the game.");
          return;
      }
      const initialPlayers: Record<string, any> = {};
      Object.keys(roomData.players).forEach(pId => {
        initialPlayers[pId] = { ...roomData.players[pId], score: 0, fiftyFiftyUsed: false, askAudienceUsed: false, phoneFriendUsed: false, isActive: true };
      });

      const activePlayersArray = Object.keys(initialPlayers).filter(
        (id) => initialPlayers[id].isActive
      );
      const shuffledPlayerIds = activePlayersArray.sort(() => 0.5 - Math.random());

      const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
      const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
      await updateDoc(roomRef, {
          status: 'fastest-finger', // Restart game by going back to FFF
          currentQuestionIndex: 0,
          players: initialPlayers,
          currentTurnPlayerId: null, // Set by FFF
          currentQuestion: null, // Reset AI question
          isLoadingQuestion: false,
          questionLifelineState: {
              disabledOptions: [],
              audienceVote: null,
              friendAnswer: null,
              usedByPlayerId: null
          },
          activeLifelineRequest: null, // Clear active lifeline requests
          playerOrder: shuffledPlayerIds, // For FFF participant order
          eliminatedPlayers: [],
          contestantHistory: [], // Reset history
          // Reset FFF state for restart
          fffQuestionIndex: 0,
          fffAnswers: {},
          fffWinnerId: null,
          fffTieParticipants: [],
      });
      setMessage("Game restarted!");
  };

  if (!roomData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex items-center justify-center">
        <p className="text-xl">Loading game...</p>
      </div>
    );
  }

  // Determine current prize
  const currentPrize = prizeTiers[roomData.currentQuestionIndex] || 0;

  if (roomData.status === 'final-scores') {
    const sortedPlayers = Object.values(roomData.players).sort((a: any, b: any) => b.score - a.score);
    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
                Final Scores!
            </h1>
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl text-center max-w-lg w-full border-4 border-yellow-500">
                <h3 className="text-2xl font-semibold mb-6">Rankings:</h3>
                <ul className="list-none space-y-3 mb-6">
                    {sortedPlayers.map((player: any, index: number) => (
                        <li key={player.name} className="text-xl flex justify-between items-center bg-gray-700 p-3 rounded-lg shadow-md">
                            <span className="font-bold text-yellow-300 mr-2">{index + 1}.</span>
                            <span>{player.name} (Age: {player.age}) {player.userId === userId ? '(You)' : ''}</span>
                            <span className="font-bold text-yellow-400">${player.score}</span>
                        </li>
                    ))}
                </ul>
                {roomData.hostId === userId && (
                    <button
                        onClick={handleRestartGame}
                        className="bg-yellow-500 hover:bg-yellow-600 text-purple-900 font-extrabold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
                    >
                        Play Again
                    </button>
                )}
            </div>
            <MessageBox message={message} onClose={() => setMessage('')} />
        </div>
    );
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
      <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
        Who Wants to be a Millionaire?
      </h1>

      <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-3xl w-full border-4 border-yellow-500 flex flex-col items-center">
        <div className="flex justify-between w-full mb-6">
          <span className="text-xl font-semibold text-yellow-400">Prize: ${currentPrize}</span>
          <span className="text-xl font-semibold text-yellow-400">Question: {roomData.currentQuestionIndex + 1} / {prizeTiers.length}</span>
        </div>

        <div className="mb-8 text-center bg-purple-900 p-6 rounded-lg border-2 border-yellow-400 shadow-inner">
          {roomData.isLoadingQuestion ? (
            <p className="text-2xl md:text-3xl font-bold animate-pulse">Generating question for {roomData.players[roomData.currentTurnPlayerId]?.name} (Age {currentContestantAge})...</p>
          ) : (currentQuestion ? (
            <p className="text-2xl md:text-3xl font-bold">{currentQuestion.question}</p>
          ) : (
            <p className="text-2xl md:text-3xl font-bold">Waiting for question to load...</p>
          ))}
        </div>

        {/* Player scores and turn indicator */}
        <div className="w-full mb-6 p-4 bg-gray-700 rounded-lg shadow-inner">
            <h3 className="text-xl font-bold mb-3 text-yellow-300">Players:</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(roomData.players).map(([id, player]: [string, any]) => (
                    <li key={id} className={`flex justify-between items-center text-lg p-2 rounded-md ${roomData.currentTurnPlayerId === id ? 'bg-blue-800 border-2 border-yellow-300 shadow-lg' : ''} ${!player.isActive ? 'line-through opacity-50' : ''}`}>
                        <span>
                            {player.name} (Age: {player.age}) {id === userId ? '(You)' : ''}
                            {roomData.currentTurnPlayerId === id && <span className="ml-2 text-yellow-300 font-semibold">(Turn)</span>}
                            {!player.isActive && <span className="ml-2 text-red-400 font-semibold">(Out)</span>}
                        </span>
                        <span className="font-bold text-yellow-400">${player.score}</span>
                    </li>
                ))}
                <li className="text-center text-lg italic text-gray-400 col-span-full mt-2">
                  Room ID: {roomData.gameCode} (Share this with friends!)
                </li>
            </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-8">
          {currentQuestion && currentQuestion.options.map((option: string, index: number) => (
            <button
              key={index}
              onClick={() => handleAnswerClick(index)}
              disabled={!isMyTurn || !isMyActive || roomData.isLoadingQuestion || roomData.questionLifelineState.disabledOptions.includes(index) || roomData.activeLifelineRequest || showWalkAwayConfirm}
              className={`
                ${!isMyTurn || !isMyActive || roomData.isLoadingQuestion || roomData.questionLifelineState.disabledOptions.includes(index) || roomData.activeLifelineRequest || showWalkAwayConfirm
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'}
                text-white font-semibold py-3 px-4 rounded-lg transition duration-200 ease-in-out transform hover:scale-105 shadow-md text-left flex items-center
              `}
            >
              <span className="mr-3 font-bold text-yellow-300">{String.fromCharCode(65 + index)}.</span>
              {option}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-4 mb-8 w-full">
          <button
            onClick={handleFiftyFifty}
            disabled={!isMyTurn || !isMyActive || myPlayerState.fiftyFiftyUsed || roomData.isLoadingQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm}
            className={`
              ${!isMyTurn || !isMyActive || myPlayerState.fiftyFiftyUsed || roomData.isLoadingQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}
              text-white font-bold py-3 px-6 rounded-full transition duration-200 ease-in-out transform hover:scale-105 shadow-lg
            `}
          >
            50:50
          </button>
          <button
            onClick={handleAskAudience}
            disabled={!isMyTurn || !isMyActive || myPlayerState.askAudienceUsed || roomData.isLoadingQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm}
            className={`
              ${!isMyTurn || !isMyActive || myPlayerState.askAudienceUsed || roomData.isLoadingQuestion || roomData.activeLifelineRequest ? 'bg-gray-600 cursor-not-allowed' : 'bg-yellow-600 hover:bg-yellow-700'}
              text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
            `}
          >
            Ask the Audience
          </button>
          <button
            onClick={handlePhoneFriend}
            disabled={!isMyTurn || !isMyActive || myPlayerState.phoneFriendUsed || roomData.isLoadingQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm}
            className={`
              ${!isMyTurn || !isMyActive || myPlayerState.phoneFriendUsed || roomData.isLoadingQuestion || roomData.activeLifelineRequest ? 'bg-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}
              text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
            `}
          >
            Phone a Friend
          </button>
        </div>

        {/* Walk Away Button - Separated */}
        <div className="w-full flex justify-center mt-4">
            <button
                onClick={handleWalkAwayInitiate}
                disabled={!isMyTurn || !isMyActive || roomData.isLoadingQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm}
                className={`
                    ${!isMyTurn || !isMyActive || roomData.isLoadingQuestion || roomData.activeLifelineRequest || showWalkAwayConfirm ? 'bg-gray-600 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700'}
                    text-white font-bold py-3 px-8 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
                `}
            >
                Walk Away
            </button>
        </div>


        {/* Display Audience Vote or Friend's Advice if used for this question */}
        {(roomData.questionLifelineState.audienceVote || roomData.questionLifelineState.friendAnswer) && (
            <div className="bg-gray-700 p-5 rounded-lg w-full max-w-md mt-6 border border-yellow-500 shadow-inner text-center">
                <h3 className="text-xl font-bold mb-3 text-yellow-300">Lifeline Used! ({roomData.players[roomData.questionLifelineState.usedByPlayerId]?.name})</h3>
                {Object.entries(roomData.questionLifelineState).length > 0 && roomData.questionLifelineState.audienceVote && (
                    <>
                        <h3 className="text-xl font-bold mb-3 text-yellow-300">Audience Vote:</h3>
                        {Object.entries(roomData.questionLifelineState.audienceVote).map(([option, percentage]) => (
                        <div key={option} className="flex justify-between items-center mb-2">
                            <span className="text-lg">{option}:</span>
                            <div className="w-2/3 bg-gray-600 rounded-full h-4">
                                <div
                                className="bg-purple-400 h-4 rounded-full"
                                style={{ width: `${percentage}%` }}
                                ></div>
                            </div>
                            {/* Fixed: Wrapped sibling elements in a single parent div */}
                            <span className="ml-2 text-lg">{percentage}%</span>
                        </div>
                        ))}
                    </>
                )}
                {Object.entries(roomData.questionLifelineState).length > 0 && roomData.questionLifelineState.friendAnswer && (
                    <>
                        <h3 className="text-xl font-bold mb-3 text-yellow-300">Friend's Advice:</h3>
                        <p className="text-lg italic">{roomData.questionLifelineState.friendAnswer}</p>
                    </>
                )}
            </div>
        )}
      </div>
      <MessageBox message={message} onClose={() => setMessage('')} />

      {/* Lifeline Modals */}
      {roomData?.activeLifelineRequest?.type === 'audience' && roomData.activeLifelineRequest.initiatorId !== userId && (
          <AskAudienceModal
              roomData={roomData}
              currentUserId={userId}
              currentQuestion={currentQuestion}
              onSubmitVote={handleSubmitAudienceVote}
              onClose={async () => {
                const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
                await updateDoc(doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId), { activeLifelineRequest: null });
              }}
          />
      )}

      {showPhoneFriendSelect && (
          <PhoneFriendSelectModal
              roomData={roomData}
              currentUserId={userId}
              onSelectFriend={handleSelectFriendForPhone}
              onClose={() => setShowPhoneFriendSelect(false)}
          />
      )}

      {roomData?.activeLifelineRequest?.type === 'friend' && roomData.activeLifelineRequest.targetPlayerId === userId && (
          <PhoneFriendAnswerModal
              roomData={roomData}
              currentUserId={userId}
              currentQuestion={currentQuestion}
              onSubmitSuggestion={handleSubmitFriendSuggestion}
              onClose={async () => {
                const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
                await updateDoc(doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId), { activeLifelineRequest: null });
              }}
          />
      )}

      {showWalkAwayConfirm && (
        <MessageBox
          message={`Are you sure you want to walk away with $${roomData.players[userId]?.score || 0}?`}
          onClose={() => setShowWalkAwayConfirm(false)}
          onConfirm={handleWalkAwayConfirm}
          showConfirmButtons={true}
        />
      )}
    </div>
  );
};

// Main App component for routing
export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [gameMode, setGameMode] = useState('none'); // 'none', 'singlePlayer', 'multiplayer'
  const [roomStatus, setRoomStatus] = useState('lobby'); // Only relevant for multiplayer

  useEffect(() => {
    // Firebase initialization only needs to happen once at the top level
    initFirebase().then(() => {
        const unsubscribe = onAuthStateChanged(authInstance, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                setUserId(crypto.randomUUID());
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    });
  }, []);

  // Effect to listen to room status changes (only for multiplayer mode)
  useEffect(() => {
    if (gameMode === 'multiplayer' && roomId && dbInstance) {
      const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
      const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
      const unsubscribe = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRoomStatus(data.status);
        } else {
          setRoomStatus('lobby'); // Room deleted or non-existent
          setRoomId(null);
          // If room disappears in multiplayer, reset gameMode to 'none'
          if (gameMode === 'multiplayer') setGameMode('none');
        }
      });
      return () => unsubscribe();
    } else if (gameMode === 'multiplayer' && !roomId) {
        setRoomStatus('lobby'); // Reset status if roomId is cleared in multiplayer
    }
  }, [roomId, gameMode]);


  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex items-center justify-center">
        <p className="text-xl">Initializing game data...</p>
      </div>
    );
  }

  // Render components based on gameMode
  if (gameMode === 'singlePlayer') {
    return <SinglePlayerGameScreen setGameMode={setGameMode} />;
  } else if (gameMode === 'multiplayer') {
    // Multiplayer mode rendering based on roomStatus
    if (roomId && roomStatus === 'fastest-finger') {
        return <FastestFingerScreen roomId={roomId} userId={userId as string} setRoomId={setRoomId} />;
    } else if (roomId && (roomStatus === 'in-game' || roomStatus === 'final-scores')) { // 'final-scores' is handled within GameScreen
        return <GameScreen roomId={roomId} playerName={playerName} userId={userId as string} setRoomId={setRoomId} />;
    } else {
        // Default multiplayer lobby
        return <LobbyScreen setRoomId={setRoomId} setPlayerName={setPlayerName} setGameMode={setGameMode} />;
    }
  } else {
    // Initial mode selection screen
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 via-indigo-900 to-black text-white flex flex-col items-center justify-center p-4 font-inter">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-8 text-yellow-500 drop-shadow-lg text-center">
          Who Wants to be a Millionaire?
        </h1>
        <div className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl max-w-sm w-full text-center border-4 border-yellow-500">
          <h2 className="text-3xl font-bold mb-6">Choose Game Mode</h2>
          <button
            onClick={() => setGameMode('singlePlayer')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg mb-4"
          >
            Single Player
          </button>
          <button
            onClick={() => setGameMode('multiplayer')}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          >
            Multiplayer
          </button>
        </div>
      </div>
    );
  }
}
