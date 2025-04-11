"use client";

import { useEffect, useState } from "react";
import { WithdrawalRecord } from "../page";
import { ChildToParentMessageStatus, ChildTransactionReceipt } from "@arbitrum/sdk";
import { providers } from "ethers";
import { useAccount, useChainId, useSwitchChain, useWalletClient } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { clientToSigner } from "~~/utils/arbitrum/ethersAdapters";
import { getL1ChainId, getL2ChainId, isChainL1 } from "~~/utils/arbitrum/utils";
import { notification } from "~~/utils/scaffold-eth";

interface WithdrawalClaimButtonProps {
  withdrawRecord: WithdrawalRecord;
  removeClaimedWithdrawal: (txHash: string) => void;
}

const WITHDRAWAL_WINDOW = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export default function WithdrawalClaimButton({ withdrawRecord, removeClaimedWithdrawal }: WithdrawalClaimButtonProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [canClaim, setCanClaim] = useState(false);

  const { timestamp, withdrawerAddress } = withdrawRecord;

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const withdrawalTime = timestamp;
      const timeElapsed = now - withdrawalTime;
      const timeRemaining = WITHDRAWAL_WINDOW - timeElapsed;

      if (timeRemaining <= 0) {
        setTimeLeft("Ready to claim");
        setCanClaim(true);
        return;
      }

      const days = Math.floor(timeRemaining / (24 * 60 * 60 * 1000));
      const hours = Math.floor((timeRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);

      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [timestamp]);

  const handleClaim = async () => {
    if (!walletClient || !canClaim || !address || address.toLowerCase() !== withdrawerAddress.toLowerCase()) return;

    let notificationId: string | undefined;
    try {
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
      const txReceipt = await l2Provider.getTransactionReceipt(withdrawRecord.txHash);

      const transactionReceipt = new ChildTransactionReceipt(txReceipt);
      const messages = await transactionReceipt.getChildToParentMessages(l1Signer);
      const childToParentMessage = messages[0];
      if ((await childToParentMessage.status(l2Provider)) == ChildToParentMessageStatus.EXECUTED) {
        throw new Error(`Message already executed! Nothing else to do here`);
      }
      // This just makes sure the message is ready to be executed. It should be right away since the button isn't clickable until it's ready
      const retryInterval = 1000 * 60;
      await childToParentMessage.waitUntilReadyToExecute(l2Provider, retryInterval);
      notificationId = notification.loading("Claiming...");
      const executeTransaction = await childToParentMessage.execute(l2Provider);
      await executeTransaction.wait();
      notification.remove(notificationId);
      notification.success("Withdrawal has been claimed!");
      removeClaimedWithdrawal(withdrawRecord.txHash);
    } catch (error) {
      console.error("Claim error:", error);
      notification.error("Claim failed");
    } finally {
      if (notificationId) {
        notification.remove(notificationId);
      }
    }
  };

  const handleSwitchToL1 = async () => {
    const l1ChainId = getL1ChainId(chainId);
    if (switchChain) {
      try {
        await switchChain({ chainId: l1ChainId });
      } catch (error) {
        console.error("Failed to switch network:", error);
        notification.error("Failed to switch network");
      }
    }
  };

  if (!canClaim) {
    return (
      <button className="btn btn-sm btn-ghost" disabled>
        Claim in {timeLeft}
      </button>
    );
  }

  if (address?.toLowerCase() !== withdrawerAddress.toLowerCase()) {
    return (
      <button className="btn btn-sm btn-ghost" disabled>
        Not your withdrawal
      </button>
    );
  }

  if (isChainL1(chainId)) {
    return (
      <button className="btn btn-sm btn-primary" onClick={handleClaim}>
        Claim
      </button>
    );
  }

  return (
    <button className="btn btn-sm btn-primary" onClick={handleSwitchToL1}>
      Switch to L1 to Claim
    </button>
  );
}
