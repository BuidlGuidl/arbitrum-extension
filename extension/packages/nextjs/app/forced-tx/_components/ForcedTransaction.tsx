"use client";

import { useState } from "react";
import { InboxTools, getArbitrumNetwork } from "@arbitrum/sdk";
import { BigNumber, providers } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";
import { clientToSigner } from "~~/utils/arbitrum/ethersAdapters";
import { getL1ChainId, getL2ChainId, getNetworkName, isChainL1 } from "~~/utils/arbitrum/utils";
import { notification } from "~~/utils/scaffold-eth";

interface ForcedTransactionProps {
  onTransactionSent?: (blockNumber: bigint) => void;
}

export default function ForcedTransaction({ onTransactionSent }: ForcedTransactionProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>("");

  // Get the contract instance
  const { data: contract } = useScaffoldContract({
    contractName: "ArbAddressTableExample",
    chainId: getL2ChainId(chainId) as any,
  });

  // Check if current chain is an L1
  const isL1Chain = isChainL1(chainId);
  const l1ChainId = getL1ChainId(chainId);

  const handleSwitchToL1 = async () => {
    if (switchChain) {
      try {
        await switchChain({ chainId: l1ChainId });
      } catch (error) {
        console.error("Failed to switch network:", error);
        notification.error("Failed to switch network");
      }
    }
  };

  const handleSendForcedTx = async () => {
    if (!address || !publicClient || !walletClient || !message || !contract) return;

    try {
      setIsProcessing(true);
      setStatus("Initiating forced transaction...");

      // Convert viem/wagmi clients to ethers providers/signers
      const l1Signer = clientToSigner(walletClient);
      // If mainnet, use Arbitrum One, otherwise use Arbitrum Sepolia
      const l2ChainId = getL2ChainId(chainId);
      // For L2, we'll use the RPC URL directly since we don't need signing capabilities
      const l2Provider = new providers.JsonRpcProvider(
        scaffoldConfig.targetNetworks.find(n => n.id === l2ChainId)?.rpcUrls.default.http[0],
      );

      // Get the Arbitrum network configuration
      const childChainNetwork = await getArbitrumNetwork(l2Provider);
      const inboxTools = new InboxTools(l1Signer, childChainNetwork);

      // Get current L2 block number
      const currentL2Block = await l2Provider.getBlockNumber();

      // Encode the function data
      const data = encodeFunctionData({
        abi: contract.abi,
        functionName: "sendMessage",
        args: [message],
      });

      // Create the transaction request for sending a message
      const transactionRequest = {
        data,
        to: contract.address,
        value: BigNumber.from(0),
      };

      // Sign the transaction for L2
      setStatus("Signing transaction for L2...");
      const signedTransaction = await inboxTools.signChildTx(transactionRequest, l1Signer);

      // Send the transaction through the Delayed Inbox
      setStatus("Sending transaction through Delayed Inbox...");
      const sendMessageTx = await inboxTools.sendChildSignedTx(signedTransaction);
      if (!sendMessageTx) {
        throw new Error("Failed to create send message transaction");
      }
      const receipt = await sendMessageTx.wait();

      // Notify parent component about the transaction
      if (onTransactionSent) {
        onTransactionSent(BigInt(currentL2Block));
      }

      notification.success("Forced transaction initiated successfully");
      setStatus(`Transaction initiated successfully. Hash: ${receipt.transactionHash}`);
      setMessage("");
    } catch (error) {
      console.error("Forced transaction error:", error);
      notification.error("Forced Transaction Failed");
      setStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isL1Chain) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Switch to L1 to Send Forced Transaction</h2>
          <div className="flex flex-col gap-4">
            <div className="alert alert-warning">
              <span>
                You are currently on an L2 network. To send a forced transaction, you need to be on the L1 network.
              </span>
            </div>
            <button className="btn btn-primary" onClick={handleSwitchToL1} disabled={!switchChain}>
              Switch to {getNetworkName(l1ChainId)}
            </button>
          </div>
        </div>
      </div>
    );
  }
  console.log(address, isProcessing, message, contract);
  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Send Forced Transaction to L2</h2>
        <div className="flex flex-col gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Message</span>
            </label>
            <input
              type="text"
              placeholder="Enter your message"
              className="input input-bordered"
              value={message}
              onChange={e => setMessage(e.target.value)}
              disabled={isProcessing}
            />
          </div>

          {status && (
            <div className="alert alert-info">
              <span>{status}</span>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSendForcedTx}
            disabled={!address || isProcessing || !message || !contract}
          >
            {isProcessing ? (
              <>
                <span className="loading loading-spinner"></span>
                Processing...
              </>
            ) : (
              "Send Forced Transaction"
            )}
          </button>

          <div className="text-sm opacity-70">
            Note: The transaction will be processed on L2 after a delay. This is a demonstration of forced transactions.
          </div>
        </div>
      </div>
    </div>
  );
}
