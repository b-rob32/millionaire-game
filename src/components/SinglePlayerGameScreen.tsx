import React, { useState, useEffect, useCallback } from 'react';
import MessageBox from './MessageBox';
import { prizeTiers, safetyNetIndices } from '../utils/constants'; // Import constants

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
  }, [isGameStarted, currentQuestionIndex, playerAge, isLoadingQuestion, currentQuestion, generateAndSetQuestion, prizeTiers]); // Added prizeTiers to dependencies

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
              text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
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

export default SinglePlayerGameScreen;
