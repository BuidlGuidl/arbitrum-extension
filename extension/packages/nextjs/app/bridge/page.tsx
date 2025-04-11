"use client";

import PendingWithdrawalsList from "./_components/PendingWithdrawalsList";
import type { NextPage } from "next";
import { useLocalStorage } from "usehooks-ts";
import { useAccount } from "wagmi";
import NativeDeposit from "~~/app/bridge/_components/NativeDeposit";
import NativeWithdraw from "~~/app/bridge/_components/NativeWithdraw";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

export interface WithdrawalRecord {
  txHash: string;
  amount: string;
  timestamp: number;
  chainId: number;
  withdrawerAddress: string;
}

const STORAGE_KEY = "scaffoldEth2.arbitrum_withdrawals";

const Arb: NextPage = () => {
  const { isConnected } = useAccount();
  const [withdrawals, setWithdrawals] = useLocalStorage<WithdrawalRecord[]>(STORAGE_KEY, []);

  return (
    <div className="relative container mx-auto px-4 py-4">
      <h1 className="text-3xl font-bold mb-8">Arbitrum Bridge</h1>
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!isConnected ? "filter blur-sm pointer-events-none" : ""}`}
      >
        <div className="flex flex-col gap-4">
          <div className="w-full">
            <NativeDeposit />
          </div>
          <div className="w-full">
            <PendingWithdrawalsList withdrawals={withdrawals} setWithdrawals={setWithdrawals} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="w-full">
            <NativeWithdraw setWithdrawals={setWithdrawals} />
          </div>
        </div>
      </div>
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg z-10">
          <div className="bg-base-100 p-6 rounded-lg shadow-xl flex flex-col items-center gap-4">
            <p className="text-xl font-bold text-center">Please connect your wallet to use the bridge.</p>
            <RainbowKitCustomConnectButton />
          </div>
        </div>
      )}
    </div>
  );
};

export default Arb;
