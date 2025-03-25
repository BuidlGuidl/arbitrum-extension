"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type Chain, type TransactionReceipt, createPublicClient, http } from "viem";
import { useChainId } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
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

interface StoredTxData {
  signedTx: string;
  message: string;
  contractAddress: string;
  value: string;
  addressIndex: string;
  transactionHash: string;
  l1TxHash?: string; // L1 transaction hash
}

export default function TrackTransaction() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const txHash = searchParams.get("txhash");
  const l1TxHashFromQuery = searchParams.get("l1txhash");
  const chainId = useChainId();
  const [status, setStatus] = useState<TxStatus>(TxStatus.PENDING);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const [forceCountdown, setForceCountdown] = useState(0); // 23:50 in seconds = 23*60*60 + 50*60 = 85800
  const [txReceipt, setTxReceipt] = useState<TransactionReceipt | null>(null);
  const [blockExplorerUrl, setBlockExplorerUrl] = useState<string | null>(null);
  const [l1BlockExplorerUrl, setL1BlockExplorerUrl] = useState<string | null>(null);
  const [isForcing, setIsForcing] = useState(false);
  const [l2ChainName, setL2ChainName] = useState<string | null>(null);
  const [l1ChainName, setL1ChainName] = useState<string | null>(null);
  const [l1TxHash, setL1TxHash] = useState<string | null>(l1TxHashFromQuery);

  useEffect(() => {
    if (!txHash) {
      notification.error("No transaction hash provided");
      router.push("/forced-tx/step1");
      return;
    }

    // Try to get L1 transaction hash from localStorage if not provided in query
    if (!l1TxHash) {
      try {
        const storedTx = localStorage.getItem("forcedTx");
        if (storedTx) {
          const parsedTx = JSON.parse(storedTx) as StoredTxData;
          if (parsedTx.l1TxHash) {
            setL1TxHash(parsedTx.l1TxHash);
          }
        }
      } catch (error) {
        console.error("Error retrieving L1 transaction hash from localStorage:", error);
      }
    }

    // Get the appropriate L2 network
    const l2ChainId = !isChainL1(chainId) ? chainId : getL2ChainId(chainId);
    const l2Network = scaffoldConfig.targetNetworks.find(n => n.id === l2ChainId);
    if (!l2Network) {
      notification.error("Could not determine L2 network");
      return;
    }

    // Get the corresponding L1 network
    const l1ChainId = getL1ChainId(l2ChainId);
    const l1Network = scaffoldConfig.targetNetworks.find(n => n.id === l1ChainId);

    // Set chain names
    setL2ChainName(l2Network.name);
    if (l1Network) {
      setL1ChainName(l1Network.name);
    }

    // Set block explorer URLs
    if (l2Network.blockExplorers?.default) {
      setBlockExplorerUrl(`${l2Network.blockExplorers.default.url}/tx/${txHash}`);
    }

    if (l1Network?.blockExplorers?.default && l1TxHash) {
      setL1BlockExplorerUrl(`${l1Network.blockExplorers.default.url}/tx/${l1TxHash}`);
    }

    // Create L2 viem client
    const l2Client = createPublicClient({
      transport: http(l2Network.rpcUrls.default.http[0]),
      chain: l2Network as unknown as Chain,
    });

    // Function to check transaction status
    const checkTxStatus = async () => {
      try {
        const receipt = await l2Client.getTransactionReceipt({
          hash: txHash as `0x${string}`,
        });

        if (receipt) {
          setTxReceipt(receipt);
          if (receipt.status === "success") {
            setStatus(TxStatus.CONFIRMED);
            notification.success("Transaction confirmed on L2!");
            // Remove transaction data from localStorage as it's no longer needed
            localStorage.removeItem("forcedTx");
            return true; // Stop polling
          } else if (receipt.status === "reverted") {
            setStatus(TxStatus.FAILED);
            notification.error("Transaction failed on L2");
            return true; // Stop polling
          }
        }

        // If it's been more than 10 minutes (600 seconds) and we're still pending, start the force countdown
        if (elapsedTime > 600 && status === TxStatus.PENDING) {
          setStatus(TxStatus.FORCE_COUNTDOWN);
          setForceCountdown(23 * 60 * 60 + 50 * 60); // 23:50 in seconds
          return true; // Stop this polling and let the countdown polling take over
        }

        return false; // Continue polling
      } catch (error) {
        console.error("Error checking transaction status:", error);

        // If it's been more than 10 minutes (600 seconds), start force countdown
        if (elapsedTime > 600) {
          setStatus(TxStatus.FORCE_COUNTDOWN);
          setForceCountdown(23 * 60 * 60 + 50 * 60); // 23:50 in seconds
          return true; // Stop this polling and let the countdown polling take over
        }

        return false; // Continue polling
      }
    };

    // Initial check for normal transaction polling
    if (status === TxStatus.PENDING) {
      checkTxStatus();

      // Set up polling interval (every 5 seconds)
      const interval = setInterval(async () => {
        const shouldStop = await checkTxStatus();
        if (shouldStop) {
          clearInterval(interval);
        }
      }, 5000);

      return () => clearInterval(interval);
    }

    // For the force countdown status, we need different logic
    if (status === TxStatus.FORCE_COUNTDOWN) {
      // Set up countdown interval (every second)
      const countdownInterval = setInterval(() => {
        setForceCountdown(prevCountdown => {
          if (prevCountdown <= 1) {
            clearInterval(countdownInterval);
            setStatus(TxStatus.READY_TO_FORCE);
            return 0;
          }
          return prevCountdown - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [txHash, chainId, router, status, l1TxHash, l1TxHashFromQuery, elapsedTime, startTime]);

  // Add a separate useEffect to handle the elapsed time counter
  useEffect(() => {
    // Only run the timer if the transaction is in PENDING status
    if (status === TxStatus.PENDING) {
      const timerInterval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      return () => clearInterval(timerInterval);
    }
  }, [status, startTime]);

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
    setIsForcing(true);
    try {
      // Retrieve the stored transaction from localStorage
      const storedTx = localStorage.getItem("forcedTx");
      if (!storedTx) {
        notification.error("No transaction data found to force");
        setIsForcing(false);
        return;
      }

      // Here you would implement the logic to force the transaction
      // This might involve direct communication with the L2 node or a specialized service

      notification.success("Transaction force request submitted");
      // After a successful force request, redirect back to checking status
      setStatus(TxStatus.PENDING);
      setElapsedTime(0);
    } catch (error) {
      console.error("Error forcing transaction:", error);
      notification.error("Failed to force transaction");
    } finally {
      setIsForcing(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Track Forced Transaction</h1>
      <div className="card bg-base-200 shadow-xl">
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
                <p className="flex items-center font-medium text-info">
                  This transaction was submitted on {l1ChainName || "L1"} in Arbitrum&apos;s Delayed Inbox contract but
                  will be executed on {l2ChainName || "L2"}
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
                    <span className="font-medium">L1 Chain:</span>{" "}
                    <span className="text-info font-medium">{l1ChainName}</span>
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
                    <span className="font-medium">L2 Chain:</span>{" "}
                    <span className="text-info font-medium">{l2ChainName}</span>
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
                      <span className="font-medium">Force available in: </span> {formatCountdown(forceCountdown)}
                    </div>
                  )}
                  {txReceipt && (
                    <div className="flex">
                      <span className="font-medium">Block Number:</span> {txReceipt.blockNumber.toLocaleString()}
                    </div>
                  )}
                </div>

                {status === TxStatus.PENDING && (
                  <div className="mt-4">
                    <p className="text-sm opacity-70">
                      Waiting for the transaction to be confirmed on {l2ChainName || "L2"}. This may take some time as
                      it needs to be processed through the Arbitrum Delayed Inbox on L1.
                    </p>
                    <div className="mt-2">
                      <span className="loading loading-spinner loading-md"></span>
                    </div>
                  </div>
                )}

                {status === TxStatus.FORCE_COUNTDOWN && (
                  <div className="alert alert-warning mt-4">
                    <span>
                      Transaction not found after 10 minutes. You will be able to force the transaction to{" "}
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

                {status === TxStatus.CONFIRMED && (
                  <div className="alert alert-success mt-4">
                    <span>Transaction has been confirmed on {l2ChainName || "L2"}!</span>
                  </div>
                )}

                {status === TxStatus.FAILED && (
                  <div className="alert alert-error mt-4">
                    <span>Transaction failed on {l2ChainName || "L2"}. Please check the transaction details.</span>
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
    </div>
  );
}
