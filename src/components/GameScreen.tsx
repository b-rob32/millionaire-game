import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { dbInstance } from '../utils/firebase'; // Import dbInstance
import { prizeTiers, safetyNetIndices } from '../utils/constants'; // Import constants
import MessageBox from './MessageBox';
import { RoomData, GameQuestion } from '../types/game'; // Import types

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
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [message, setMessage] = useState('');
  const [showPhoneFriendSelect, setShowPhoneFriendSelect] = useState(false); // State for PAF select modal
  const [showWalkAwayConfirm, setShowWalkAwayConfirm] = useState(false); // New state for walk away confirmation
  const roomUnsubscribeRef = useRef<(() => void) | null>(null);

  const currentQuestion: GameQuestion | null = roomData ? roomData.currentQuestion : null; // Use AI-generated question
  const isMyTurn = roomData && roomData.currentTurnPlayerId === userId;
  const isMyActive = roomData && roomData.players[userId] && roomData.players[userId].isActive;
  // Fixed: Ensure myPlayerState is always an object with PlayerState properties
  const myPlayerState = roomData?.players[userId] || {
      name: '',
      age: 0,
      score: 0,
      fiftyFiftyUsed: false,
      askAudienceUsed: false,
      phoneFriendUsed: false,
      isActive: false
  };
  // Fixed: Safely access currentContestantAge
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
        const data = docSnap.data() as RoomData;
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
                if (data.currentQuestion?.options) { // Added null check for data.currentQuestion.options
                    for (let i = 0; i < data.currentQuestion.options.length; i++) {
                        audiencePercentages[data.currentQuestion.options[i]] = Math.round(((voteCounts[i] || 0) / totalAudienceVotes) * 100);
                    }
                }
                
                // Ensure percentages sum to 100 (distribute remainder if any)
                let sum = Object.values(audiencePercentages).reduce((acc, val) => acc + val, 0);
                if (sum !== 100 && data.currentQuestion?.options && data.currentQuestion.options.length > 0) { // Added null and length checks
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
            
            // Fixed: Check if targetPlayerId is defined and friendSuggestion is a number
            const friendSuggestion = targetPlayerId ? data.activeLifelineRequest.responses?.[targetPlayerId] : undefined;

            if (friendSuggestion !== undefined && typeof friendSuggestion === 'number' && currentQuestion?.options) { // Added null check for currentQuestion.options
                 // Friend has submitted their suggestion
                 updateDoc(roomRef, {
                    'questionLifelineState.friendAnswer': currentQuestion.options[friendSuggestion], // CurrentQuestion needs to be checked before indexing
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
    // Fixed: Provide a default empty string if roomData.currentTurnPlayerId is null
    let nextContestantCandidateId = getNextContestantPlayerId(roomData.playerOrder, newEliminatedPlayers, newContestantHistory, roomData.currentTurnPlayerId || '');

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
      // Status update handled by useEffect listener, will will transition to final-scores if all done
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
    // Fixed: Add null check for roomData before accessing its properties
    if (!roomData) {
        setMessage("Game data not available to walk away.");
        setShowWalkAwayConfirm(false);
        return;
    }

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

    // Fixed: Provide a default empty string if userId is null
    const nextTurnPlayerId = getNextContestantPlayerId(roomData.playerOrder, newEliminatedPlayers, newContestantHistory, userId || '');
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
    if (!roomData) { // Added null check for roomData
        setMessage("Game data not available to select friend.");
        setShowPhoneFriendSelect(false);
        return;
    }
    setShowPhoneFriendSelect(false); // Close selection modal
    const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';
    const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);
    await updateDoc(roomRef, {
        activeLifelineRequest: {
            type: 'friend',
            initiatorId: userId,
            targetPlayerId: friendId,
            questionIndex: roomData.currentQuestionIndex, // Fixed: Added null check for roomData
            responses: {} // To collect the friend's suggestion
        },
    });
    setMessage(`Calling ${roomData?.players[friendId]?.name}...`);
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
      // Fixed: Add null check for roomData before accessing its properties
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
            <p className="text-2xl md:text-3xl font-bold animate-pulse">Generating question for {roomData.players[roomData.currentTurnPlayerId as string]?.name || 'a player'} (Age {currentContestantAge})...</p>
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
                {roomData.questionLifelineState.audienceVote && (
                    // Corrected: Each item in the map returns a single parent div
                    Object.entries(roomData.questionLifelineState.audienceVote).map(([option, percentage]) => (
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
                    ))
                )}
                {roomData.questionLifelineState.friendAnswer && (
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

export default GameScreen;
