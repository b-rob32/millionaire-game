import React from 'react';

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

export default MessageBox;
