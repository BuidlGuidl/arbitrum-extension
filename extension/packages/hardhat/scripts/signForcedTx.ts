import fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();
import { BigNumber, Wallet, providers, utils } from "ethers-arbitrum";
import { formatEther, parseEther } from "@ethersproject/units";
import password from "@inquirer/password";
import input from "@inquirer/input";
import select from "@inquirer/select";
import { InboxTools, getArbitrumNetwork } from "@arbitrum/sdk";
import { config } from "hardhat";
import { HttpNetworkUserConfig } from "hardhat/types";
import fetch from "node-fetch";

// Determine if we're on mainnet or testnet based on available networks
const isMainnet = await select({
  message: "Are you using testnet or mainnet?",
  choices: [
    { name: "testnet (Sepolia <> Arbitrum Sepolia)", value: false },
    { name: "mainnet (Ethereum <> Arbitrum)", value: true },
  ],
});
const networks = config.networks as { [key: string]: HttpNetworkUserConfig };
const l1Provider = isMainnet
  ? new providers.JsonRpcProvider(networks.mainnet.url)
  : new providers.JsonRpcProvider(networks.sepolia.url);

const l2Provider = isMainnet
  ? new providers.JsonRpcProvider(networks.arbitrum.url)
  : new providers.JsonRpcProvider(networks.arbitrumSepolia.url);

interface ContractData {
  address: string;
  abi: any[];
  inheritedFunctions: Record<string, string>;
}

interface DeployedContracts {
  [chainId: string]: {
    [contractName: string]: ContractData;
  };
}

async function main() {
  // Get the encrypted private key
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;

  if (!encryptedKey) {
    console.log("🚫️ You don't have a deployer account. Run `yarn generate` or `yarn account:import` first");
    return;
  }

  // Prompt for password
  const pass = await password({ message: "Enter password to decrypt private key:" });

  try {
    // Decrypt the wallet
    const wallet = await Wallet.fromEncryptedJson(encryptedKey, pass);
    console.log("✅ Wallet decrypted successfully");
    console.log("📝 Address:", wallet.address);
    // Show the L2 chain balance
    const balance = await l2Provider.getBalance(wallet.address);
    const network = await l2Provider.getNetwork();
    const networkName = network.name === "arbitrum" ? "Arbitrum" : "Arbitrum Sepolia";
    console.log(`${networkName} ETH Balance:`, formatEther(balance));

    const l2ChainId = Number(network.chainId);
    // Get the Arbitrum network configuration
    const childChainNetwork = getArbitrumNetwork(l2ChainId);
    const inboxTools = new InboxTools(l1Provider.getSigner(), childChainNetwork);

    // Get all deployed contracts
    const deployedContractsData = getContractDataFromDeployments() as DeployedContracts;
    const chainContracts = deployedContractsData[l2ChainId.toString()];

    if (!chainContracts) {
      console.log("🚫️ No contracts found for this network");
      return;
    }

    // Let user select which contract to interact with
    const contractChoices = Object.entries(chainContracts).map(([name, data]) => ({
      name,
      value: name,
      description: `Address: ${data.address}`,
    }));

    const selectedContractName = await select({
      message: "Select the contract to interact with:",
      choices: contractChoices,
    });

    const selectedContractData = chainContracts[selectedContractName];
    if (!selectedContractData) {
      console.log("🚫️ Contract not found");
      return;
    }

    // Create contract instance
    const selectedContract = {
      address: selectedContractData.address,
      interface: new utils.Interface(selectedContractData.abi),
    };

    // Get contract functions
    const functions = selectedContractData.abi.filter(
      (item: any) => item.type === "function" && !item.constant && item.stateMutability !== "view",
    );

    const functionChoices = functions.map((fn: any) => ({
      name: fn.name,
      value: fn.name,
      description: `Parameters: ${fn.inputs.map((i: any) => `${i.name}(${i.type})`).join(", ")}`,
    }));

    const selectedFunction = await select({
      message: "Select the function to call:",
      choices: functionChoices,
    });

    const functionAbi = functions.find((fn: any) => fn.name === selectedFunction);
    if (!functionAbi) {
      console.log("🚫️ Function not found");
      return;
    }

    // Get function parameters
    const params: any[] = [];
    for (const param of functionAbi.inputs) {
      const paramValue = await input({
        message: `Enter value for '${param.name}' (${param.type}):`,
        validate: (value: string) => {
          try {
            // Try to encode the parameter to check if it's valid
            utils.defaultAbiCoder.encode([param.type], [value]);
            return true;
          } catch {
            return `Invalid value for type ${param.type}`;
          }
        },
      });
      params.push(paramValue);
    }

    let value: bigint | BigNumber = BigInt(0);
    if (functionAbi.stateMutability === "payable") {
      const ethAmount = await input({ message: "Enter ETH amount (or press enter for 0):", default: "0" });
      value = ethAmount ? parseEther(ethAmount) : BigInt(0);
    }

    // Encode function data
    const data = selectedContract.interface.encodeFunctionData(selectedFunction, params);

    // Create the transaction request
    const transactionRequest = {
      data,
      to: selectedContractData.address,
      value,
    };

    console.log("\n📝 Transaction details:");
    console.log("Contract:", selectedContractName);
    console.log("Function:", selectedFunction);
    console.log("Parameters:", params);
    console.log("ETH Amount:", formatEther(value) || "0");
    console.log("Contract Address:", selectedContractData.address);

    const childChainWallet = new Wallet(wallet.privateKey, l2Provider);
    // Sign the transaction
    console.log("\n🔑 Signing transaction...");
    const signedTransaction = await inboxTools.signChildTx(transactionRequest, childChainWallet);

    // Parse the signed transaction to get its hash
    const parsedTx = utils.parseTransaction(signedTransaction);
    const transactionHash = parsedTx.hash;
    console.log("\n📝 Expected Transaction Hash:", transactionHash);

    // Prepare the transaction data
    const txData = {
      signedTx: signedTransaction,
      contractName: selectedContractName,
      functionName: selectedFunction,
      parameters: params,
      contractAddress: selectedContractData.address,
      value: value.toString(),
      transactionHash,
    };

    // Send the signed transaction to the API
    try {
      const response = await fetch("http://localhost:3000/api/sign-tx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(txData),
      });

      if (!response.ok) {
        throw new Error(`Failed to send signed transaction: ${response.statusText}`);
      }

      console.log("\n✅ Transaction signed and sent to API successfully!");
      console.log("Now return to the front end to proceed to step 2");
    } catch (error) {
      console.error("❌ Error sending signed transaction to API:", error);
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error && error.name == "ExitPromptError") {
      console.log("Exiting...");
      process.exit(0);
    } else {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  }
}

main().catch(console.error);

const DEPLOYMENTS_DIR = "./deployments";
const ARTIFACTS_DIR = "./artifacts";

function getDirectories(path: string) {
  return fs
    .readdirSync(path, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

function getContractNames(path: string) {
  return fs
    .readdirSync(path, { withFileTypes: true })
    .filter(dirent => dirent.isFile() && dirent.name.endsWith(".json"))
    .map(dirent => dirent.name.split(".")[0]);
}

function getActualSourcesForContract(sources: Record<string, any>, contractName: string) {
  for (const sourcePath of Object.keys(sources)) {
    const sourceName = sourcePath.split("/").pop()?.split(".sol")[0];
    if (sourceName === contractName) {
      const contractContent = sources[sourcePath].content as string;
      const regex = /contract\s+(\w+)\s+is\s+([^{}]+)\{/;
      const match = contractContent.match(regex);

      if (match) {
        const inheritancePart = match[2];
        // Split the inherited contracts by commas to get the list of inherited contracts
        const inheritedContracts = inheritancePart.split(",").map(contract => `${contract.trim()}.sol`);

        return inheritedContracts;
      }
      return [];
    }
  }
  return [];
}

function getInheritedFunctions(sources: Record<string, any>, contractName: string) {
  const actualSources = getActualSourcesForContract(sources, contractName);
  const inheritedFunctions = {} as Record<string, any>;

  for (const sourceContractName of actualSources) {
    const sourcePath = Object.keys(sources).find(key => key.includes(`/${sourceContractName}`));
    if (sourcePath) {
      const sourceName = sourcePath?.split("/").pop()?.split(".sol")[0];
      const { abi } = JSON.parse(fs.readFileSync(`${ARTIFACTS_DIR}/${sourcePath}/${sourceName}.json`).toString());
      for (const functionAbi of abi) {
        if (functionAbi.type === "function") {
          inheritedFunctions[functionAbi.name] = sourcePath;
        }
      }
    }
  }

  return inheritedFunctions;
}

function getContractDataFromDeployments() {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    throw Error("At least one other deployment script should exist to generate an actual contract.");
  }
  const output = {} as Record<string, any>;
  for (const chainName of getDirectories(DEPLOYMENTS_DIR)) {
    const chainId = fs.readFileSync(`${DEPLOYMENTS_DIR}/${chainName}/.chainId`).toString();
    const contracts = {} as Record<string, any>;
    for (const contractName of getContractNames(`${DEPLOYMENTS_DIR}/${chainName}`)) {
      const { abi, address, metadata } = JSON.parse(
        fs.readFileSync(`${DEPLOYMENTS_DIR}/${chainName}/${contractName}.json`).toString(),
      );
      const inheritedFunctions = metadata ? getInheritedFunctions(JSON.parse(metadata).sources, contractName) : {};
      contracts[contractName] = { address, abi, inheritedFunctions };
    }
    output[chainId] = contracts;
  }
  return output;
}
