"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const DEPLOYED_ON_BLOCK = 12960000n;

export default function AddressTableExample() {
  const { address } = useAccount();
  const [message, setMessage] = useState("");
  const [addressToRegister, setAddressToRegister] = useState("");
  const [addressToGetIndex, setAddressToGetIndex] = useState("");
  const [addressIndex, setAddressIndex] = useState("");
  const [ethAmount, setEthAmount] = useState("");

  const { writeContractAsync: arbAddressTableWriteContract } = useScaffoldWriteContract({
    contractName: "ArbAddressTableExample",
  });

  // Get user balance
  const { data: userBalance } = useScaffoldReadContract({
    contractName: "ArbAddressTableExample",
    functionName: "userBalances",
    args: [address],
  });

  // Register address
  const handleRegisterAddress = async () => {
    try {
      await arbAddressTableWriteContract({
        functionName: "registerAddress",
        args: [addressToRegister],
      });
    } catch (e) {
      console.error("Error registering address:", e);
    }
  };

  // Get address index
  const { data: addressIndexData } = useScaffoldReadContract({
    contractName: "ArbAddressTableExample",
    functionName: "getIndexFromAddress",
    args: [addressToGetIndex],
  });

  // Send message
  const handleSendMessage = async () => {
    try {
      await arbAddressTableWriteContract({
        functionName: "sendMessageToAddress",
        args: [message, BigInt(addressIndex)],
        value: ethAmount ? parseEther(ethAmount) : undefined,
      });
    } catch (e) {
      console.error("Error sending message:", e);
    }
  };

  // Get sent messages
  const {
    data: sentMessages,
    isLoading: isLoadingSentMessages,
    error: errorReadingSentMessages,
  } = useScaffoldEventHistory({
    contractName: "ArbAddressTableExample",
    eventName: "MessageSent",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    filters: { sender: address },
    blockData: true,
    transactionData: true,
    receiptData: true,
  });

  // Get received messages
  const {
    data: receivedMessages,
    isLoading: isLoadingReceivedMessages,
    error: errorReadingReceivedMessages,
  } = useScaffoldEventHistory({
    contractName: "ArbAddressTableExample",
    eventName: "MessageSent",
    fromBlock: DEPLOYED_ON_BLOCK,
    watch: true,
    filters: { recipient: address },
    blockData: true,
    transactionData: true,
    receiptData: true,
  });

  // Withdraw
  const handleWithdraw = async () => {
    try {
      await arbAddressTableWriteContract({
        functionName: "withdraw",
      });
    } catch (e) {
      console.error("Error withdrawing:", e);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-2xl font-bold">ArbAddressTable Example</h2>

      {/* Balance and Withdraw Section */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="card-title">Your Balance</h3>
          <div className="flex items-center gap-4">
            <div className="text-xl">{userBalance ? formatEther(userBalance) : "0"} ETH</div>
            <button
              className="btn btn-primary"
              onClick={handleWithdraw}
              disabled={!address || !userBalance || userBalance === 0n}
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* Register Address Section */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="card-title">Register Address</h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter address to register"
              className="input input-bordered flex-1"
              value={addressToRegister}
              onChange={e => setAddressToRegister(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleRegisterAddress} disabled={!addressToRegister}>
              Register
            </button>
          </div>
        </div>
      </div>

      {/* Get Address Index Section */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="card-title">Get Address Index</h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter address to get index"
              className="input input-bordered flex-1"
              value={addressToGetIndex}
              onChange={e => setAddressToGetIndex(e.target.value)}
            />
            {addressIndexData !== undefined && (
              <div className="flex items-center">Index: {addressIndexData.toString()}</div>
            )}
          </div>
        </div>
      </div>

      {/* Send Message Section */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="card-title">Send Message</h3>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Enter message"
              className="input input-bordered"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <input
              type="text"
              placeholder="Enter address index"
              className="input input-bordered"
              value={addressIndex}
              onChange={e => setAddressIndex(e.target.value)}
            />
            <input
              type="text"
              placeholder="Enter ETH amount (optional)"
              className="input input-bordered"
              value={ethAmount}
              onChange={e => setEthAmount(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSendMessage} disabled={!message || !addressIndex}>
              Send Message
            </button>
          </div>
        </div>
      </div>

      {/* Message History Section */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h3 className="card-title">Message History</h3>

          {/* Sent Messages */}
          <div className="mb-4">
            <h4 className="text-lg font-semibold mb-2">Sent Messages</h4>
            {isLoadingSentMessages ? (
              <div>Loading sent messages...</div>
            ) : errorReadingSentMessages ? (
              <div className="text-error">Error loading sent messages</div>
            ) : sentMessages && sentMessages.length > 0 ? (
              <div className="space-y-2">
                {sentMessages.map((event, index) => (
                  <div key={index} className="bg-base-300 p-3 rounded-lg">
                    <div>To: {event.args.recipient}</div>
                    <div>Message: {event.args.message}</div>
                    <div>Value: {event.args.value?.toString() ?? "0"} ETH</div>
                    <div className="text-sm opacity-70">Block: {event.blockNumber.toString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div>No sent messages</div>
            )}
          </div>

          {/* Received Messages */}
          <div>
            <h4 className="text-lg font-semibold mb-2">Received Messages</h4>
            {isLoadingReceivedMessages ? (
              <div>Loading received messages...</div>
            ) : errorReadingReceivedMessages ? (
              <div className="text-error">Error loading received messages</div>
            ) : receivedMessages && receivedMessages.length > 0 ? (
              <div className="space-y-2">
                {receivedMessages.map((event, index) => (
                  <div key={index} className="bg-base-300 p-3 rounded-lg">
                    <div>From: {event.args.sender}</div>
                    <div>Message: {event.args.message}</div>
                    <div>Value: {event.args.value?.toString() ?? "0"} ETH</div>
                    <div className="text-sm opacity-70">Block: {event.blockNumber.toString()}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div>No received messages</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
