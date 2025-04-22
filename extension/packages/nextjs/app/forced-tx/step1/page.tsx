"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEther } from "viem";
import { notification } from "~~/utils/scaffold-eth";

interface SignedTxData {
  signedTx: string;
  contractName: string;
  functionName: string;
  parameters: any[];
  contractAddress: string;
  value: string;
  transactionHash: string;
}

export default function ForcedTxStep1() {
  const router = useRouter();
  const [signedTxData, setSignedTxData] = useState<SignedTxData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkSignedTx = async () => {
    try {
      const response = await fetch("/api/sign-tx");
      if (!response.ok) {
        throw new Error("Failed to check signed transaction");
      }
      const data = await response.json();
      if (data.signedTxData) {
        setSignedTxData(data.signedTxData);
        notification.success("Signed transaction found!");
      }
    } catch (error) {
      console.error("Error checking signed transaction:", error);
      setError("Failed to check signed transaction");
    }
  };

  const handleProceedToStep2 = () => {
    if (signedTxData) {
      // Store transaction data in localStorage before navigating
      localStorage.setItem('forcedTx', JSON.stringify(signedTxData));
      router.push("/forced-tx/step2");
    } else {
      notification.error("No signed transaction data available");
    }
  };

  useEffect(() => {
    // Only start polling if we don't have signed transaction data yet
    if (!signedTxData) {
      // Check for signed transaction every 3 seconds
      const interval = setInterval(checkSignedTx, 3000);
      return () => clearInterval(interval);
    }
  }, [signedTxData]); // Add signedTxData as a dependency

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Step 1: Sign L2 Transaction</h1>
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Sign Forced Transaction</h2>
          <div className="flex flex-col gap-4">
            <div className="prose">
              <h3>Instructions:</h3>
              <ol>
                <li>Open a terminal in your project directory</li>
                <li>
                  Run the following command to sign a new transaction with your deployer wallet. It is important to note
                  that this transaction will not be broadcasted, only signed.
                  <pre className="bg-base-300 p-4 rounded-lg mt-2">
                    <code>yarn sign-tx</code>
                  </pre>
                </li>
                <li>
                  We will use this script to sign a transaction that uses the ArbAddressTableExample contract to send a
                  message. The real magic will happen in the next step when we take this signed L2 transaction and send
                  it through the Arbitrum Delayed Inbox contract on the L1 chain.
                </li>
                <li>Wait for the transaction to be signed and saved</li>
              </ol>
            </div>

            {error && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            {signedTxData ? (
              <div className="bg-base-300 p-4 rounded-lg">
                <h3 className="font-bold mb-2">Signed Transaction Details:</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium">Contract:</span> {signedTxData.contractName}
                  </div>
                  <div>
                    <span className="font-medium">Function:</span> {signedTxData.functionName}
                  </div>
                  <div>
                    <span className="font-medium">Parameters:</span>
                    <pre className="text-sm mt-1 bg-base-200 p-2 rounded">
                      {JSON.stringify(signedTxData.parameters, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="font-medium">ETH Amount:</span>{" "}
                    {signedTxData.value === "0" ? "0" : `${formatEther(BigInt(signedTxData.value))} ETH`}
                  </div>
                  <div>
                    <span className="font-medium">Contract Address:</span>{" "}
                    <code className="text-sm">{signedTxData.contractAddress}</code>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="font-medium">Transaction Signature:</div>
                  <code className="text-sm break-all">{signedTxData.signedTx}</code>
                </div>
                <div className="mt-4">
                  <button className="btn btn-primary" onClick={handleProceedToStep2}>
                    Proceed to Step 2
                  </button>
                </div>
              </div>
            ) : (
              <div className="alert alert-info">
                <span>Waiting for signed transaction...</span>
              </div>
            )}

            <div className="text-sm opacity-70">
              Note: Once you&apos;ve verified the transaction details, click the &quot;Proceed to Step 2&quot; button to
              continue.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
