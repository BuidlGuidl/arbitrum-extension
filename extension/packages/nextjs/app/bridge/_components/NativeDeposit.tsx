"use client";

import { useState } from "react";
import { EthBridger, getArbitrumNetwork } from "@arbitrum/sdk";
import { BigNumber, providers } from "ethers";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { clientToSigner } from "~~/utils/arbitrum/ethersAdapters";
import { ARBITRUM_ONE, getL1ChainId, getL2ChainId, getNetworkName, isChainL1 } from "~~/utils/arbitrum/utils";
import { notification } from "~~/utils/scaffold-eth";

export default function NativeDeposit() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: balanceData } = useBalance({ address });
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const [amount, setAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);

  // Check if current chain is an L2
  const isL2Chain = !isChainL1(chainId);
  const l1ChainId = getL1ChainId(chainId);

  const handleSwitchToL1 = async () => {
    if (l1ChainId && switchChain) {
      try {
        await switchChain({ chainId: l1ChainId });
      } catch (error) {
        console.error("Failed to switch network:", error);
        notification.error("Failed to switch network");
      }
    }
  };

  const handleDeposit = async () => {
    if (!address || !publicClient || !walletClient || !amount) return;
    let loadingNotifId: string | undefined;
    try {
      setIsDepositing(true);
      loadingNotifId = notification.loading("Initiating deposit...");

      // Convert viem/wagmi clients to ethers providers/signers
      const l1Signer = clientToSigner(walletClient);

      // If mainnet, use Arbitrum One, otherwise use Arbitrum Sepolia
      const l2ChainId = getL2ChainId(chainId);
      // For L2, we'll use the RPC URL directly since we don't need signing capabilities
      const l2Provider = new providers.JsonRpcProvider(
        scaffoldConfig.targetNetworks.find(n => n.id === l2ChainId)?.rpcUrls.default.http[0],
      );

      if (!l2Provider) {
        throw new Error("L2 network configuration not found");
      }

      // Get the Arbitrum network configuration
      const childChainNetwork = await getArbitrumNetwork(l2Provider);
      const ethBridger = new EthBridger(childChainNetwork);

      // Create deposit transaction
      const depositTx = await ethBridger.deposit({
        amount: BigNumber.from(parseEther(amount).toString()),
        parentSigner: l1Signer,
      });
      notification.remove(loadingNotifId);
      loadingNotifId = notification.loading("Waiting for L1 confirmation...");
      const depositReceipt = await depositTx.wait();
      notification.remove(loadingNotifId);
      loadingNotifId = notification.loading("Waiting for L2 confirmation (this may take ~15 minutes)...");
      const l2Result = await depositReceipt.waitForChildTransactionReceipt(l2Provider);

      if (l2Result.complete) {
        notification.remove(loadingNotifId);
        notification.success("Deposit Complete");
        setAmount("");
        loadingNotifId = undefined;
      } else {
        throw new Error("Deposit failed on L2");
      }
    } catch (error) {
      console.error("Deposit error:", error);
      notification.error(`Deposit Failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setIsDepositing(false);
      if (loadingNotifId) {
        notification.remove(loadingNotifId);
      }
    }
  };

  if (isL2Chain) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Switch to L1 to Deposit</h2>
          <div className="flex flex-col gap-4">
            <div className="alert alert-warning my-4">
              <span>
                You are currently on an L2 network. To deposit ETH, you need to be on the corresponding L1 network.
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

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Deposit ETH to Arbitrum</h2>
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
              disabled={isDepositing}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleDeposit}
            disabled={!address || isDepositing || !amount || parseFloat(amount) <= 0}
          >
            {isDepositing ? (
              <>
                <span className="loading loading-spinner"></span>
                Depositing...
              </>
            ) : (
              "Deposit to L2"
            )}
          </button>

          <div className="text-sm opacity-70">
            Note: The deposit process takes approximately 15 minutes to complete on L2.
          </div>
        </div>
      </div>
    </div>
  );
}
