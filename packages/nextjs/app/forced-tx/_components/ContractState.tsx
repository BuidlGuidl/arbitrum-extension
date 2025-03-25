"use client";

import { useAccount, useChainId } from "wagmi";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { getL2ChainId } from "~~/utils/arbitrum/utils";

interface Message {
  sender: string;
  message: string;
  blockNumber: bigint;
}

interface ContractStateProps {
  startBlock: bigint;
}

export default function ContractState({ startBlock }: ContractStateProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const l2ChainId = getL2ChainId(chainId);

  // Read contract state
  const { data: balance } = useScaffoldReadContract({
    contractName: "ArbAddressTableExample",
    functionName: "getBalance",
    args: [address],
    chainId: l2ChainId as 421614, // TODO: fix this type issue
  });

  // Get message history
  const { data: sentMessages } = useScaffoldEventHistory({
    contractName: "ArbAddressTableExample",
    eventName: "MessageSent",
    fromBlock: startBlock,
    watch: true,
    blockData: true,
    chainId: l2ChainId as 421614, // TODO: fix this type issue
  });

  // Convert event data to messages
  const messages: Message[] =
    sentMessages?.map(event => ({
      sender: event.args.sender as string,
      message: event.args.message as string,
      blockNumber: event.blockNumber,
    })) || [];

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Contract State</h2>
        <div className="flex flex-col gap-4">
          {address && (
            <div className="stats shadow">
              <div className="stat">
                <div className="stat-title">Your Balance</div>
                <div className="stat-value">{balance ? balance.toString() : "0"} ETH</div>
              </div>
            </div>
          )}

          <div className="divider">Message History</div>

          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className="bg-base-300 p-4 rounded-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{msg.message}</div>
                    <div className="text-sm opacity-70">
                      From: {msg.sender.slice(0, 6)}...{msg.sender.slice(-4)}
                    </div>
                    <div className="text-sm opacity-70">Block: {msg.blockNumber.toString()}</div>
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && <div className="text-center text-sm opacity-70">No messages yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
