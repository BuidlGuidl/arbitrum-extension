// Chain IDs for Arbitrum networks
export const ARBITRUM_ONE = 42161;
export const ARBITRUM_SEPOLIA = 421614;
export const MAINNET = 1;
export const SEPOLIA = 11155111;

export const isChainL1 = (chainId: number) => {
  return chainId === MAINNET || chainId === SEPOLIA;
};

export const getL1ChainId = (chainId: number) => {
  return chainId === ARBITRUM_ONE ? MAINNET : SEPOLIA;
};

export const getL2ChainId = (chainId: number) => {
  return chainId === MAINNET ? ARBITRUM_ONE : ARBITRUM_SEPOLIA;
};
