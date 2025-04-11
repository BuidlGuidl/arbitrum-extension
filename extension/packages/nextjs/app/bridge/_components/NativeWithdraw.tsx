"use client";

import { Dispatch, SetStateAction, useState } from "react";
import { WithdrawalRecord } from "../page";
import { EthBridger, getArbitrumNetwork } from "@arbitrum/sdk";
import { BigNumber } from "ethers";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { clientToProvider, clientToSigner } from "~~/utils/arbitrum/ethersAdapters";
import { MAINNET, getL2ChainId, getNetworkName, isChainL1 } from "~~/utils/arbitrum/utils";
import { notification } from "~~/utils/scaffold-eth";

interface NativeWithdrawProps {
  setWithdrawals: Dispatch<SetStateAction<WithdrawalRecord[]>>;
}

export default function NativeWithdraw({ setWithdrawals }: NativeWithdrawProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: balanceData } = useBalance({ address });
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const [amount, setAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Check if current chain is an L1
  const isL1Chain = isChainL1(chainId);
  const l2ChainId = getL2ChainId(chainId);

  const handleSwitchToL2 = async () => {
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

    let loadingNotifId: string | undefined;
    try {
      setIsWithdrawing(true);
      loadingNotifId = notification.loading("Initiating withdrawal...");

      // Convert viem/wagmi clients to ethers providers/signers
      const l2Signer = clientToSigner(walletClient);
      const l2Provider = clientToProvider(publicClient);

      // Get the Arbitrum network configuration
      const childChainNetwork = await getArbitrumNetwork(l2Provider);
      const ethBridger = new EthBridger(childChainNetwork);

      // Create withdrawal transaction
      const withdrawTx = await ethBridger.withdraw({
        amount: BigNumber.from(parseEther(amount).toString()),
        childSigner: l2Signer,
        destinationAddress: address,
        from: address,
      });

      notification.remove(loadingNotifId);
      loadingNotifId = notification.loading("Waiting for L2 confirmation...");
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

      notification.remove(loadingNotifId);
      notification.success("Withdrawal initiated successfully");
      setAmount("");
      loadingNotifId = undefined;
    } catch (error) {
      console.error("Withdrawal error:", error);
      if (loadingNotifId) notification.remove(loadingNotifId);
      notification.error(`Withdrawal Failed: ${error instanceof Error ? error.message : error}`);
      loadingNotifId = undefined;
    } finally {
      setIsWithdrawing(false);
      if (loadingNotifId) {
        notification.remove(loadingNotifId);
      }
    }
  };

  if (isL1Chain) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Switch to L2 to Withdraw</h2>
          <div className="flex flex-col gap-4">
            <div className="alert alert-warning my-4">
              <span>
                You are currently on an L1 network. To withdraw ETH, you need to be on the corresponding L2 network.
              </span>
            </div>
            <button className="btn btn-primary" onClick={handleSwitchToL2} disabled={!switchChain}>
              Switch to {getNetworkName(l2ChainId)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Withdraw ETH from Arbitrum</h2>
        <div className="flex flex-col gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Amount (ETH)</span>
              {balanceData && (
                <span className="label-text-alt select-text">
                  {Number(formatEther(balanceData.value)).toFixed(4)} {balanceData.symbol}
                </span>
              )}
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
        </div>
      </div>
    </div>
  );
}
