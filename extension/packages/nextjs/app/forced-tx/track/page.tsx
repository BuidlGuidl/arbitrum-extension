"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { InboxTools, getArbitrumNetwork } from "@arbitrum/sdk";
import { providers } from "ethers";
import { type Chain, Hash, type TransactionReceipt, createPublicClient, http } from "viem";
import { useChainId, useWalletClient } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { clientToSigner } from "~~/utils/arbitrum";
import { getL1ChainId, getL2ChainId, isChainL1 } from "~~/utils/arbitrum/utils";
import { notification } from "~~/utils/scaffold-eth";

enum TxStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  FAILED = "FAILED",
  NOT_FOUND = "NOT_FOUND",
  FORCE_COUNTDOWN = "FORCE_COUNTDOWN",
  READY_TO_FORCE = "READY_TO_FORCE",
}

export default function TrackTransaction() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: walletClient } = useWalletClient();
  const txHash = searchParams.get("txhash");
  const l1TxHash = searchParams.get("l1txhash");
  const currentChainId = useChainId();
  const [status, setStatus] = useState<TxStatus>(TxStatus.PENDING);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [forceCountdown, setForceCountdown] = useState(0);
  const [txReceipt, setTxReceipt] = useState<TransactionReceipt | null>(null);
  const [blockExplorerUrl, setBlockExplorerUrl] = useState<string | null>(null);
  const [l1BlockExplorerUrl, setL1BlockExplorerUrl] = useState<string | null>(null);
  const [isForcing, setIsForcing] = useState(false);
  const [l2ChainName, setL2ChainName] = useState<string | null>(null);
  const [l1ChainName, setL1ChainName] = useState<string | null>(null);
  const [l1TxBlockTimestamp, setL1TxBlockTimestamp] = useState<number | null>(null);
  const [l1TxLoadError, setL1TxLoadError] = useState<string | null>(null);
  let pollToastId: string | undefined;
  let forceToastId: string | undefined;

  // Get the appropriate L2 network based on the current chain ID
  const l2ChainId = useMemo(
    () => (!isChainL1(currentChainId) ? currentChainId : getL2ChainId(currentChainId)),
    [currentChainId],
  );

  const l2Network = useMemo(() => scaffoldConfig.targetNetworks.find(n => n.id === l2ChainId), [l2ChainId]);

  // Create L2 viem client, memoized based on l2Network
  const l2Client = useMemo(() => {
    if (!l2Network) return null;
    return createPublicClient({
      transport: http(l2Network.rpcUrls.default.http[0]),
      chain: l2Network as unknown as Chain,
    });
  }, [l2Network]);

  // Create L1 client for fetching L1 transaction details
  const l1Client = useMemo(() => {
    const l1ChainId = getL1ChainId(l2ChainId);
    const l1Network = scaffoldConfig.targetNetworks.find(n => n.id === l1ChainId);
    if (!l1Network) return null;
    return createPublicClient({
      transport: http(l1Network.rpcUrls.default.http[0]),
      chain: l1Network as unknown as Chain,
    });
  }, [l2ChainId]);

  useEffect(() => {
    if (!txHash) {
      notification.error("No transaction hash provided");
      router.push("/forced-tx/step1");
      return;
    }

    // Get the corresponding L1 network
    const l1ChainId = getL1ChainId(l2ChainId);
    const l1Network = scaffoldConfig.targetNetworks.find(n => n.id === l1ChainId);

    // Set chain names
    setL2ChainName(l2Network?.name ?? null);
    setL1ChainName(l1Network?.name ?? null);

    // Set block explorer URLs
    if (l2Network?.blockExplorers?.default) {
      setBlockExplorerUrl(`${l2Network.blockExplorers.default.url}/tx/${txHash}`);
    }

    if (l1TxHash && l1Network?.blockExplorers?.default) {
      setL1BlockExplorerUrl(`${l1Network.blockExplorers.default.url}/tx/${l1TxHash}`);
    }

    // Function to check transaction status
    const checkTxStatus = async () => {
      if (!l1TxBlockTimestamp) return false;
      const elapsedTime = Math.floor((Date.now() - l1TxBlockTimestamp * 1000) / 1000);
      try {
        if (!pollToastId) {
          pollToastId = notification.loading(`Checking L2 tx status on ${l2Network?.name}...`);
        }

        // Ensure client is available before proceeding
        if (!l2Client) {
          // No need for error here, client creation error is handled above by useMemo dependency
          // Just prevent polling if client isn't ready
          return false; // Indicate polling should not continue/stop if running
        }

        const receipt = await l2Client.getTransactionReceipt({
          hash: txHash as Hash,
        });

        if (receipt) {
          if (pollToastId) notification.remove(pollToastId);
          setTxReceipt(receipt);
          if (receipt.status === "success") {
            setStatus(TxStatus.CONFIRMED);
            pollToastId = notification.success("Transaction confirmed on L2!");
            return true; // Stop polling
          } else if (receipt.status === "reverted") {
            setStatus(TxStatus.FAILED);
            pollToastId = notification.error(`Transaction failed on ${l2ChainName || "L2"}`);
            return true; // Stop polling
          }
        }

        // If it's been more than 15 minutes (900 seconds) and we're still pending, start the force countdown
        if (elapsedTime > 900 && status === TxStatus.PENDING) {
          if (pollToastId) notification.remove(pollToastId);
          pollToastId = notification.warning("Transaction not found after 15 minutes. Starting force countdown.");
          setStatus(TxStatus.FORCE_COUNTDOWN);
          // countdown to 24hours after l1TxBlockTimestamp
          setForceCountdown(24 * 60 * 60 - elapsedTime);
          return true; // Stop this polling and let the countdown polling take over
        }

        return false; // Continue polling
      } catch (error) {
        // Don't clear loading here, let polling continue unless time limit hit
        console.log("Transaction not found, will try again:", error);
      }
      // Default is to return false unless the time limit is hit
      // If it's been more than 15 minutes (900 seconds), start force countdown
      console.log("elapsedTime", elapsedTime);
      if (elapsedTime > 900) {
        if (pollToastId) notification.remove(pollToastId);
        pollToastId = notification.warning(
          "Transaction was not processed after 15 minutes. Starting countdown until you can force the transaction from L1.",
        );
        setStatus(TxStatus.FORCE_COUNTDOWN);
        setForceCountdown(24 * 60 * 60 - elapsedTime); // 23:50 in seconds
        return true; // Stop this polling and let the countdown polling take over
      }

      return false; // Continue polling
    };

    // Initial check for normal transaction polling
    if (status === TxStatus.PENDING) {
      checkTxStatus();
      // Set up polling interval (every 5 seconds)
      const interval = setInterval(async () => {
        const shouldStop = await checkTxStatus();
        if (shouldStop) {
          if (pollToastId) notification.remove(pollToastId);
          clearInterval(interval);
        }
      }, 10000);

      // Cleanup function
      return () => {
        clearInterval(interval);
        if (pollToastId) notification.remove(pollToastId);
      };
    }

    // For the force countdown status, we need different logic
    if (status === TxStatus.FORCE_COUNTDOWN) {
      const countdownInterval = setInterval(() => {
        setForceCountdown(prevCountdown => {
          if (prevCountdown <= 1) {
            clearInterval(countdownInterval);
            setStatus(TxStatus.READY_TO_FORCE);
            pollToastId = notification.warning("Ready to force transaction!");
            return 0;
          }
          return prevCountdown - 1;
        });
      }, 1000);

      return () => {
        clearInterval(countdownInterval);
        if (pollToastId) notification.remove(pollToastId);
      };
    }

    // Cleanup function
    return () => {
      if (pollToastId) notification.remove(pollToastId);
    };
  }, [
    txHash,
    currentChainId,
    router,
    status,
    l1TxHash,
    l1TxBlockTimestamp,
    l2ChainName,
    l2Client,
    l2Network?.name,
    l2Network?.blockExplorers?.default,
  ]);

  // Add a separate useEffect to handle the elapsed time counter
  useEffect(() => {
    // Only run the timer if the transaction is in PENDING status
    if (l1TxBlockTimestamp && status === TxStatus.PENDING) {
      const timerInterval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - l1TxBlockTimestamp * 1000) / 1000));
      }, 1000);

      return () => clearInterval(timerInterval);
    }
  }, [status, l1TxBlockTimestamp]);

  // Add L1 transaction timestamp fetching
  useEffect(() => {
    const fetchL1TxTimestamp = async () => {
      if (!l1TxHash || !l1Client) return;
      
      try {
        // Get L1 transaction
        const l1Tx = await l1Client.getTransaction({ hash: l1TxHash as Hash });
        if (!l1Tx?.blockNumber) {
          setL1TxLoadError("L1 transaction not found or not yet mined");
          return;
        }
        
        // Get block timestamp
        const block = await l1Client.getBlock({ blockNumber: l1Tx.blockNumber });
        const timestamp = Number(block.timestamp);
        setL1TxBlockTimestamp(timestamp);
        setL1TxLoadError(null);
      } catch (error) {
        console.error("Error fetching L1 transaction timestamp:", error);
        setL1TxLoadError("Failed to load L1 transaction details. Please try again later.");
      }
    };

    fetchL1TxTimestamp();
  }, [l1TxHash, l1Client]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const formatCountdown = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleForceTransaction = async () => {
    if (!walletClient) return;
    setIsForcing(true);
    forceToastId = notification.loading("Submitting force transaction request...");
    try {
      // Retrieve the stored transaction from localStorage
      const storedTx = localStorage.getItem("forcedTx");
      if (!storedTx) {
        if (forceToastId) notification.remove(forceToastId);
        notification.error("No transaction data found to force");
        setIsForcing(false);
        return;
      }

      // Convert viem/wagmi clients to ethers providers/signers
      const l1Signer = clientToSigner(walletClient);
      // For L2, we'll use the RPC URL directly since we don't need signing capabilities
      const l2Provider = new providers.JsonRpcProvider(
        scaffoldConfig.targetNetworks.find(n => n.id === l2ChainId)?.rpcUrls.default.http[0],
      );

      // Get the Arbitrum network configuration
      const childChainNetwork = await getArbitrumNetwork(l2Provider);
      const inboxTools = new InboxTools(l1Signer, childChainNetwork);
      const forceInclusionTx = await inboxTools.forceInclude();
      // If the transaction is not returned, it means it was already included
      const receipt = await forceInclusionTx?.wait();
      notification.success("Transaction force request submitted");
      router.push(`/forced-tx/track?txhash=${txHash}&l1txhash=${receipt?.transactionHash}`);
    } catch (error) {
      console.error("Error forcing transaction:", error);
      if (forceToastId) notification.remove(forceToastId);
      notification.error("Failed to force transaction");
    } finally {
      // Ensure loading notification is removed
      if (forceToastId) notification.remove(forceToastId);
      setIsForcing(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Track Forced Transaction</h1>
      {!l1TxBlockTimestamp ? (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            {l1TxLoadError ? (
              <>
                <div className="text-error mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg font-semibold">{l1TxLoadError}</p>
                </div>
                <Link href="/forced-tx/step1" className="btn btn-primary">
                  Back to Step 1
                </Link>
              </>
            ) : (
              <>
                <div className="loading loading-spinner loading-lg"></div>
                <p className="mt-4">Loading transaction details...</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">
              Transaction Status:{" "}
              <span
                className={`
                    ${status === TxStatus.PENDING ? "text-warning" : ""}
                    ${status === TxStatus.CONFIRMED ? "text-success" : ""}
                    ${status === TxStatus.FAILED ? "text-error" : ""}
                    ${status === TxStatus.NOT_FOUND || status === TxStatus.FORCE_COUNTDOWN ? "text-error" : ""}
                    ${status === TxStatus.READY_TO_FORCE ? "text-warning" : ""}
                    font-bold
                  `}
              >
                {status === TxStatus.FORCE_COUNTDOWN
                  ? "NOT FOUND - FORCE COUNTDOWN"
                  : status === TxStatus.READY_TO_FORCE
                    ? "READY TO FORCE TRANSACTION"
                    : status}
              </span>{" "}
            </h2>

            <div className="flex flex-col gap-4">
              <div className="bg-base-300 p-4 rounded-lg">
                <h3 className="font-bold mb-2">Transaction Details:</h3>

                <div className="bg-base-100 p-3 rounded-lg mb-4">
                  <p className="flex items-center font-medium">
                    This transaction was submitted on {l1ChainName || "L1"} in Arbitrum&apos;s Delayed Inbox contract but
                    will be executed on {l2ChainName || "L2"} when it is either picked up by the sequencer or forced to be
                    included after waiting 24 hours.
                  </p>
                </div>

                <div className="space-y-2">
                  {l1TxHash && (
                    <div className="pt-2 border-t border-base-200">
                      <span className="font-medium">L1 Transaction Hash:</span>{" "}
                      {l1BlockExplorerUrl ? (
                        <a
                          href={l1BlockExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm break-all text-primary hover:underline"
                        >
                          {l1TxHash}
                        </a>
                      ) : (
                        <code className="text-sm break-all">{l1TxHash}</code>
                      )}
                    </div>
                  )}
                  {l1ChainName && (
                    <div>
                      <span className="font-medium">L1 Chain:</span> <span className=" font-medium">{l1ChainName}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-base-200">
                    <span className="font-medium">L2 Transaction Hash:</span>{" "}
                    {blockExplorerUrl ? (
                      <a
                        href={blockExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm break-all text-primary hover:underline"
                      >
                        {txHash}
                      </a>
                    ) : (
                      <code className="text-sm break-all">{txHash}</code>
                    )}
                  </div>
                  {l2ChainName && (
                    <div>
                      <span className="font-medium">L2 Chain:</span> <span className=" font-medium">{l2ChainName}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap flex-col gap-2 mt-4">
                    <div className="pt-2">
                      <span className="font-medium">Status:</span>{" "}
                      <span
                        className={`
                    ${status === TxStatus.PENDING ? "text-warning" : ""}
                    ${status === TxStatus.CONFIRMED ? "text-success" : ""}
                    ${status === TxStatus.FAILED ? "text-error" : ""}
                    ${status === TxStatus.NOT_FOUND || status === TxStatus.FORCE_COUNTDOWN ? "text-error" : ""}
                    ${status === TxStatus.READY_TO_FORCE ? "text-warning" : ""}
                    font-bold
                  `}
                      >
                        {status === TxStatus.FORCE_COUNTDOWN
                          ? "NOT FOUND - FORCE COUNTDOWN"
                          : status === TxStatus.READY_TO_FORCE
                            ? "READY TO FORCE TRANSACTION"
                            : status}
                      </span>
                    </div>
                    {status === TxStatus.PENDING && (
                      <div>
                        <span className="font-medium">Elapsed Time: </span> {formatTime(elapsedTime)}
                      </div>
                    )}
                    {status === TxStatus.FORCE_COUNTDOWN && (
                      <div>
                        <span className="font-medium">Remaining time: </span> {formatCountdown(forceCountdown)}
                      </div>
                    )}
                    {txReceipt && (
                      <div className="flex">
                        <span className="font-medium">Block Number: {txReceipt.blockNumber.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {status === TxStatus.FORCE_COUNTDOWN && (
                    <div className="alert alert-warning mt-4">
                      <span>
                        Transaction not found after 15 minutes. You will be able to force the transaction to{" "}
                        {l2ChainName || "L2"} after the countdown (24 hours).
                      </span>
                    </div>
                  )}

                  {status === TxStatus.READY_TO_FORCE && (
                    <div className="mt-4">
                      <div className="alert alert-warning mb-4">
                        <span>
                          You can now force this transaction on {l2ChainName || "the L2 network"}. This will attempt to
                          execute your transaction directly on the L2 chain. Note that this is only necessary if your
                          transaction has not been naturally included after the challenge period.
                        </span>
                      </div>
                      <button className="btn btn-warning" onClick={handleForceTransaction} disabled={isForcing}>
                        {isForcing ? (
                          <>
                            <span className="loading loading-spinner"></span>
                            Forcing Transaction...
                          </>
                        ) : (
                          "Force Transaction"
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-end mt-6">
                  <Link href="/forced-tx/step1" className="btn btn-primary">
                    Back to Step 1
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
