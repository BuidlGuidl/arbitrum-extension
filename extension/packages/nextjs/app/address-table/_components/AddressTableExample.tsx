"use client";

import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import deployedContractsData from "~~/contracts/deployedContracts";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getL2ChainId, getNetworkName, isChainL1 } from "~~/utils/arbitrum/utils";

const DEPLOYED_ON_BLOCK = 173810000n;

type DeployedContractsType = {
  [chainId: number]: {
    ArbAddressTableExample?: { address: string; abi: any };
  };
};

// Cast the imported data to our defined type
const deployedContracts = deployedContractsData as DeployedContractsType;

export default function AddressTableExample() {
  const { address, chainId, isConnected } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { switchChain } = useSwitchChain();
  const [message, setMessage] = useState("");
  const [addressToRegister, setAddressToRegister] = useState("");
  const [registeredFeedback, setRegisteredFeedback] = useState("");
  const [addressToGetIndex, setAddressToGetIndex] = useState("");
  const [addressIndex, setAddressIndex] = useState("");
  const [ethAmount, setEthAmount] = useState("");

  // Check deployment status
  const isContractDeployed = !!deployedContracts[targetNetwork.id]?.ArbAddressTableExample;

  // Determine wallet connected to correct network
  const isTargetNetworkL2 = !!targetNetwork && !isChainL1(targetNetwork.id);
  const l2ChainId = getL2ChainId(targetNetwork.id);
  const isOnCorrectNetwork = isConnected && isTargetNetworkL2 && chainId === targetNetwork.id;
  const isReady = isOnCorrectNetwork && isContractDeployed;

  const { writeContractAsync: arbAddressTableWriteContract } = useScaffoldWriteContract({
    contractName: "ArbAddressTableExample",
  });

  const { data: userBalance } = useScaffoldReadContract({
    contractName: "ArbAddressTableExample",
    functionName: "userBalances",
    args: [address],
  });

  const { data: addressIndexData } = useScaffoldReadContract({
    contractName: "ArbAddressTableExample",
    functionName: "getIndexFromAddress",
    args: [addressToGetIndex],
    query: {
      enabled: !!addressToGetIndex, 
    }
  });

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
  });

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
  });


  const handleRegisterAddress = async () => {
    if (!isReady || !arbAddressTableWriteContract) return;
    try {
      await arbAddressTableWriteContract({
        functionName: "registerAddress",
        args: [addressToRegister],
      });
      setAddressToRegister("");
      setRegisteredFeedback(`Address registered successfully!`);
    } catch (e) {
      console.error("Error registering address:", e);
      setRegisteredFeedback("Error registering address."); // Provide feedback
    }
  };

  const handleSendMessage = async () => {
    if (!isReady || !arbAddressTableWriteContract) return;
    try {
      await arbAddressTableWriteContract({
        functionName: "sendMessageToAddress",
        args: [message, BigInt(addressIndex)],
        value: ethAmount ? parseEther(ethAmount) : undefined,
      });
      setMessage("");
      setAddressIndex("");
      setEthAmount("");
    } catch (e) {
      console.error("Error sending message:", e);
    }
  };

  const handleWithdraw = async () => {
    if (!isReady || !arbAddressTableWriteContract) return;
    try {
      await arbAddressTableWriteContract({
        functionName: "withdraw",
      });
    } catch (e) {
      console.error("Error withdrawing:", e);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-2xl font-bold">ArbAddressTableExample Contract</h2>

        {/* Apply blur if not ready */}
        <div
          className={`${
            !isReady ? "filter blur-sm pointer-events-none" : "" 
          }`}
        >
          {/* Grid container for two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Column 1 */}
            <div className="flex flex-col gap-4">
              {/* Register Address Section */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">Register Address</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter address to register"
                      className="input input-bordered flex-1"
                      value={addressToRegister}
                      onChange={e => setAddressToRegister(e.target.value)}
                      onFocus={() => setRegisteredFeedback("")} // Use onFocus for clearing
                      disabled={!isReady}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={handleRegisterAddress}
                      disabled={!isReady || !addressToRegister}
                    >
                      Register
                    </button>
                  </div>
                  {/* Display feedback message */}
                  {registeredFeedback && <div className="mt-2 text-sm">{registeredFeedback}</div>}
                </div>
              </div>

              {/* Get Address Index Section */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">Get Address Index</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter address to get index"
                      className="input input-bordered flex-1"
                      value={addressToGetIndex}
                      onChange={e => setAddressToGetIndex(e.target.value)}
                      disabled={!isReady}
                    />
                  </div>
                  {/* Use optional chaining for safety */}
                  {addressIndexData !== undefined && (
                    <div className="mt-2 text-sm">Index: {addressIndexData.toString()}</div>
                  )}
                </div>
              </div>

              {/* Message History Section (Moved Here) */}
              <div className="card bg-base-100 shadow-xl">
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
                        {sentMessages.map((event: any, index: number) => (
                          <div key={index} className="bg-base-100 p-3 rounded-lg text-sm">
                            <div>To: {event?.args?.recipient}</div>
                            <div>Message: {event?.args?.message}</div>
                            <div>Value: {event?.args?.value ? formatEther(event?.args?.value) : "0"} ETH</div>
                            <div className="opacity-70">Block: {event?.blockNumber?.toString()}</div>
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
                        {receivedMessages.map((event: any, index: number) => (
                          <div key={index} className="bg-base-100 p-3 rounded-lg text-sm">
                            <div>From: {event?.args?.sender}</div>
                            <div>Message: {event?.args?.message}</div>
                            <div>Value: {event?.args?.value ? formatEther(event?.args?.value) : "0"} ETH</div>
                            <div className="opacity-70">Block: {event?.blockNumber?.toString()}</div>
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

            {/* Column 2 */}
            <div className="flex flex-col gap-4">
              {/* Send Message Section */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">Send Message</h3>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Enter message"
                      className="input input-bordered"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      disabled={!isReady}
                    />
                    <input
                      type="text"
                      placeholder="Enter address index"
                      className="input input-bordered"
                      value={addressIndex}
                      onChange={e => setAddressIndex(e.target.value)}
                      disabled={!isReady}
                    />
                    <input
                      type="text"
                      placeholder="Enter ETH amount (optional)"
                      className="input input-bordered"
                      value={ethAmount}
                      onChange={e => setEthAmount(e.target.value)}
                      disabled={!isReady}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={handleSendMessage}
                      disabled={!isReady || !message || !addressIndex}
                    >
                      Send Message
                    </button>
                  </div>
                </div>
              </div>

              {/* Balance and Withdraw Section (Moved Here) */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">Your Balance</h3>
                  <div className="flex items-center gap-4">
                    <div className="text-xl">{userBalance ? formatEther(userBalance) : "0"} ETH</div>
                    <button
                      className="btn btn-primary"
                      onClick={handleWithdraw}
                      disabled={!isReady || !userBalance || userBalance === 0n}
                    >
                      Withdraw
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conditional overlay based on readiness state */}
      {!isReady && (
        <div className="fixed top-0 inset-x-0 bottom-0 flex items-center justify-center rounded-lg">
          <div className="bg-base-100 p-6 rounded-lg shadow-xl flex flex-col items-center gap-4">
            {!isConnected ? (
              <>
                <p className="text-xl font-bold text-center">Please connect your wallet.</p>
                <RainbowKitCustomConnectButton />
              </>
            ) : !isOnCorrectNetwork ? (
              <>
                <p className="text-xl font-bold text-center">
                  {/* Simplified message: always prompt to switch to target */}
                  Switch to {getNetworkName(l2ChainId)}
                </p>
                {/* Show switch button if target network and switch function exist */}
                {targetNetwork && switchChain && (
                  <button
                    className="btn btn-primary"
                    onClick={() => switchChain({ chainId: l2ChainId })}
                  >
                    Switch Network
                  </button>
                )}
              </>
            ) : (
              // Must be !isContractDeployed case
              <p className="text-xl text-center px-4">
                Deploy the <b>ArbAddressTableExample</b> contract with <b className="bg-base-100 p-1 rounded">yarn deploy</b> to use this tab
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
