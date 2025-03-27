"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { MAINNET, SEPOLIA, isChainL1 } from "~~/utils/arbitrum/utils";
import { notification } from "~~/utils/scaffold-eth";

interface WithdrawalClaimButtonProps {
  timestamp: number;
  withdrawerAddress: string;
}

const WITHDRAWAL_WINDOW = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export default function WithdrawalClaimButton({ timestamp, withdrawerAddress }: WithdrawalClaimButtonProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [canClaim, setCanClaim] = useState(false);

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
    if (!canClaim || !address || address.toLowerCase() !== withdrawerAddress.toLowerCase()) return;

    try {
      // TODO: Implement claim logic here
      notification.success("Claim initiated");
    } catch (error) {
      console.error("Claim error:", error);
      notification.error("Claim failed");
    }
  };

  const handleSwitchToL1 = async () => {
    const l1ChainId = chainId === MAINNET ? MAINNET : SEPOLIA;
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
