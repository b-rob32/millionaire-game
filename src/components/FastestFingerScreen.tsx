import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { dbInstance } from '../utils/firebase';
import { fffQuestionsData } from '../utils/constants';
import MessageBox from './MessageBox';
import { RoomData, FFFQuestion } from '../types/game'; // Import types

const FastestFingerScreen = ({ roomId, userId, setRoomId }: { roomId: string, userId: string, setRoomId: (id: string | null) => void }) => {
    const [roomData, setRoomData] = useState<RoomData | null>(null);
    const [message, setMessage] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const roomUnsubscribeRef = useRef<(() => void) | null>(null);
    const fffStartTimeRef = useRef<number | null>(null);

    const currentFffQuestion: FFFQuestion | null = roomData ? fffQuestionsData[roomData.fffQuestionIndex % fffQuestionsData.length] : null;
    const activeFffPlayers = React.useMemo(() => roomData ? Object.keys(roomData.players).filter( // Wrapped in useMemo
        (id) => roomData.players[id].isActive && (!roomData.fffTieParticipants || roomData.fffTieParticipants.length === 0 || roomData.fffTieParticipants.includes(id))
    ) : [], [roomData]); // Added roomData to dependencies of useMemo

    useEffect(() => {
        if (!roomId || !dbInstance) {
            console.error("FastestFingerScreen: roomId or dbInstance is missing.");
            return;
        }

        const appId = process.env.REACT_APP_ID || (typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id');
        const roomRef = doc(dbInstance, `artifacts/${appId}/public/data/rooms`, roomId);

        // Define determineFffWinner internally within useEffect
        const determineFffWinner = async (currentRoomData: RoomData, roomRef: any) => {
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
            } else if (correctSubmissions.length === 1 || (correctSubmissions.length > 1 && correctSubmissions[0].time !== correctSubmissions[1].time)) {
                // A single winner or clear fastest winner
                const winnerId = correctSubmissions[0].playerId;
                const winnerName = currentRoomData.players[winnerId]?.name || 'A player';
                setMessage(`${winnerName} wins the Fastest Finger First! They will start the game.`);

                const shuffledPlayerIds = currentRoomData.playerOrder.sort(() => 0.5 - Math.random());
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
        };


        roomUnsubscribeRef.current = onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as RoomData;
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
    }, [roomId, setRoomId, activeFffPlayers, roomData, currentFffQuestion]); // Added all necessary dependencies

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
            if (!dbInstance) { // Add null check for dbInstance
                setMessage("Firebase is not initialized. Cannot submit answer.");
                return;
            }
            const appId = process.env.REACT_APP_ID || (typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id');
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

    // `myFffAnswer` is not used in the UI, can be removed or kept if planned for future use.
    // const myFffAnswer = roomData.fffAnswers ? roomData.fffAnswers[userId] : null;

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

export default FastestFingerScreen;
