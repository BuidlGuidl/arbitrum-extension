"use client";

import { useState } from "react";
import WithdrawalClaimButton from "./WithdrawalClaimButton";
import { EthBridger, getArbitrumNetwork } from "@arbitrum/sdk";
import { BigNumber } from "ethers";
import { parseEther } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { useLocalStorage } from "~~/hooks/useLocalStorage";
import { clientToProvider, clientToSigner } from "~~/utils/arbitrum/ethersAdapters";
import { ARBITRUM_ONE, ARBITRUM_SEPOLIA, MAINNET, SEPOLIA, getL2ChainId, isChainL1 } from "~~/utils/arbitrum/utils";
import { notification } from "~~/utils/scaffold-eth";

interface WithdrawalRecord {
  txHash: string;
  amount: string;
  timestamp: number;
  chainId: number;
  withdrawerAddress: string;
}

const STORAGE_KEY = "scaffoldEth2.arbitrum_withdrawals";

export default function NativeWithdraw() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const [amount, setAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState<string>("");
  const [withdrawals, setWithdrawals] = useLocalStorage<WithdrawalRecord[]>(STORAGE_KEY, []);

  // Check if current chain is an L1
  const isL1Chain = isChainL1(chainId);

  const handleSwitchToL2 = async () => {
    const l2ChainId = getL2ChainId(chainId);
    if (l2ChainId && switchChain) {
      try {
        await switchChain({ chainId: l2ChainId });
      } catch (error) {
        console.error("Failed to switch network:", error);
        notification.error("Failed to switch network");
      }
    }
  };

  const handleWithdraw = async () => {
    if (!address || !publicClient || !walletClient || !amount) return;

    try {
      setIsWithdrawing(true);
      setWithdrawStatus("Initiating withdrawal...");

      // Convert viem/wagmi clients to ethers providers/signers
      const l2Signer = clientToSigner(walletClient);
      const l2Provider = clientToProvider(publicClient);

      // Get the Arbitrum network configuration
      const childChainNetwork = await getArbitrumNetwork(l2Provider);
      const ethBridger = new EthBridger(childChainNetwork);

      // Get initial balance
      setWithdrawStatus("Checking initial balance...");

      // Create withdrawal transaction
      const withdrawTx = await ethBridger.withdraw({
        amount: BigNumber.from(parseEther(amount).toString()),
        childSigner: l2Signer,
        destinationAddress: address,
        from: address,
      });

      setWithdrawStatus("Waiting for L2 confirmation...");
      const withdrawReceipt = await withdrawTx.wait();

      // Store withdrawal record
      const newWithdrawal: WithdrawalRecord = {
        txHash: withdrawReceipt.transactionHash,
        amount: amount,
        timestamp: Date.now(),
        chainId: chainId,
        withdrawerAddress: address,
      };
      setWithdrawals(prev => [...prev, newWithdrawal]);

      notification.success("Withdrawal initiated successfully");
      setWithdrawStatus(`Withdrawal initiated successfully. Transaction hash: ${withdrawReceipt.transactionHash}`);
      const withdrawEventsData = withdrawReceipt.getChildToParentEvents();
      console.log("Withdrawal data:", withdrawEventsData);
      setAmount("");
    } catch (error) {
      console.error("Withdrawal error:", error);
      notification.error("Withdrawal Failed");
      setWithdrawStatus("");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getNetworkName = (chainId: number) => {
    switch (chainId) {
      case ARBITRUM_ONE:
        return "Arbitrum One";
      case ARBITRUM_SEPOLIA:
        return "Arbitrum Sepolia";
      case MAINNET:
        return "Mainnet";
      case SEPOLIA:
        return "Sepolia";
      default:
        return "Unknown Network";
    }
  };

  if (isL1Chain) {
    return (
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Switch to L2 to Withdraw</h2>
          <div className="flex flex-col gap-4">
            <div className="alert alert-warning">
              <span>
                You are currently on an L1 network. To withdraw ETH, you need to be on the corresponding L2 network.
              </span>
            </div>
            <button className="btn btn-primary" onClick={handleSwitchToL2} disabled={!switchChain}>
              Switch to {chainId === MAINNET ? "Arbitrum One" : "Arbitrum Sepolia"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Withdraw ETH from Arbitrum</h2>
        <div className="flex flex-col gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Amount (ETH)</span>
            </label>
            <input
              type="number"
              placeholder="0.0"
              step="0.0001"
              min="0"
              className="input input-bordered"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={isWithdrawing}
            />
          </div>

          {withdrawStatus && (
            <div className="alert alert-info">
              <span>{withdrawStatus}</span>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleWithdraw}
            disabled={!address || isWithdrawing || !amount || parseFloat(amount) <= 0}
          >
            {isWithdrawing ? (
              <>
                <span className="loading loading-spinner"></span>
                Withdrawing...
              </>
            ) : (
              "Withdraw to L1"
            )}
          </button>

          <div className="text-sm opacity-70">
            Note: The withdrawal process takes approximately 1 week to complete on L1.
          </div>

          {/* Pending Withdrawals List */}
          {withdrawals.length > 0 && (
            <div className="mt-6">
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
                          href={`https://${withdrawal.chainId === ARBITRUM_ONE ? "arbiscan" : "sepolia.arbiscan"}.io/tx/${withdrawal.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-ghost"
                        >
                          View on Arbiscan
                        </a>
                        <WithdrawalClaimButton
                          timestamp={withdrawal.timestamp}
                          withdrawerAddress={withdrawal.withdrawerAddress}
                        />
                      </div>
                    </div>
                    <div className="text-xs opacity-50 mt-2 break-all">{withdrawal.txHash}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
