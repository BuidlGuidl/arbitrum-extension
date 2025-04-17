"use client";

import type { WithdrawalRecord } from "../page";
import WithdrawalClaimButton from "./WithdrawalClaimButton";
import { getNetworkName, MAINNET } from "~~/utils/arbitrum/utils";

interface PendingWithdrawalsListProps {
  withdrawals: WithdrawalRecord[];
  setWithdrawals: (withdrawals: WithdrawalRecord[]) => void;
}

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString();
};

export default function PendingWithdrawalsList({ withdrawals, setWithdrawals }: PendingWithdrawalsListProps) {
  if (withdrawals.length === 0) {
    return null;
  }

  const removeClaimedWithdrawal = (txHash: string) => {
    setWithdrawals(withdrawals.filter(w => w.txHash !== txHash));
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h3 className="text-lg font-semibold mb-2">Pending Withdrawals</h3>
        <div className="space-y-2">
          {withdrawals.map((withdrawal, index) => (
            <div key={index} className="bg-base-300 p-3 rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{withdrawal.amount} ETH</div>
                  <div className="text-sm opacity-70">From: {getNetworkName(withdrawal.chainId)}</div>
                  <div className="text-sm opacity-70">Initiated: {formatDate(withdrawal.timestamp)}</div>
                  <div className="text-sm opacity-70">
                    Withdrawer: {withdrawal.withdrawerAddress.slice(0, 6)}...
                    {withdrawal.withdrawerAddress.slice(-4)}
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <a
                    href={`https://${withdrawal.chainId === MAINNET ? "arbiscan" : "sepolia.arbiscan"}.io/tx/${withdrawal.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-ghost"
                  >
                    View on Arbiscan
                  </a>
                  <WithdrawalClaimButton
                    key={withdrawal.txHash}
                    withdrawRecord={withdrawal}
                    removeClaimedWithdrawal={removeClaimedWithdrawal}
                  />
                </div>
              </div>
              <div className="text-xs opacity-50 mt-2 break-all">{withdrawal.txHash}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
