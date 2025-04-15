"use client";

import { useRouter } from "next/navigation";
import type { NextPage } from "next";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useAccount } from "wagmi";

const ForcedTx: NextPage = () => {
  const router = useRouter();
  const { isConnected } = useAccount();

  return (
    <div className="relative container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Forced L1 to L2 Transaction</h1>
      <div
        className={`grid grid-cols-1 gap-8 ${
          !isConnected ? "filter blur-sm pointer-events-none" : ""
        }`}
      >
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">How it works</h2>
            <div className="space-y-4">
              <p>
                These steps will demonstrate how you can &quot;force&quot; a transaction from the L1 chain to the L2.
                This is one of the major properties that makes L2&apos;s safe. Even if the L2&apos;s sequencer is
                rejecting your transaction you can always force it from the L1 chain.
              </p>
              <p>The process involves two steps:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  <strong>Step 1:</strong> Use a script to sign an L2 transaction with your deployer wallet.
                </li>
                <li>
                  <strong>Step 2:</strong> Switch to the L1 chain and send the signed transaction through the Delayed
                  Inbox
                </li>
              </ol>
              <div className="alert alert-info">
                <span>
                  Note: The transaction will be processed on L2 either immediately when the sequencer picks it up or if
                  the sequencer is censoring your transaction you just need to wait 24 hours and then the transaction
                  can be manually forced.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Get Started</h2>
            <div className="flex flex-col gap-4">
              <p>Ready to try it out? Click the button below to start with step 1.</p>
              <button className="btn btn-primary" onClick={() => router.push("/forced-tx/step1")}>
                Start with Step 1
              </button>
            </div>
          </div>
        </div>
      </div>

      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg z-10">
          <div className="bg-base-100 p-6 rounded-lg shadow-xl flex flex-col items-center gap-4">
            <p className="text-xl font-bold text-center">Please connect your wallet to continue.</p>
            <RainbowKitCustomConnectButton />
          </div>
        </div>
      )}
    </div>
  );
};

export default ForcedTx;
