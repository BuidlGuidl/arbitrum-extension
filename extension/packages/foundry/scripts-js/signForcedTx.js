import fs from "fs";
import * as dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse } from "toml";
import { Wallet, providers, utils } from "ethers-arbitrum";
import { formatEther, parseEther } from "@ethersproject/units";
import input from "@inquirer/input";
import select from "@inquirer/select";
import { InboxTools, getArbitrumNetwork } from "@arbitrum/sdk";
import fetch from "node-fetch";
import { listKeystores } from "./listKeystores.js";
import { execSync } from "child_process";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

// Read foundry.toml for network configuration
const foundryTomlPath = join(__dirname, "..", "foundry.toml");
const tomlString = fs.readFileSync(foundryTomlPath, "utf-8");
const parsedToml = parse(tomlString);
const rpcEndpoints = parsedToml.rpc_endpoints;

// Replace placeholders in RPC endpoints
function replaceENVAlchemyKey(input) {
  const ALCHEMY_API_KEY =
    process.env.ALCHEMY_API_KEY || "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";
  return input.replace("${ALCHEMY_API_KEY}", ALCHEMY_API_KEY);
}

// Determine if we're on mainnet or testnet based on available networks
const isMainnet = await select({
  message: "Are you using testnet or mainnet?",
  choices: [
    { name: "testnet (Sepolia <> Arbitrum Sepolia)", value: false },
    { name: "mainnet (Ethereum <> Arbitrum)", value: true },
  ],
});
const l1Provider = isMainnet
  ? new providers.JsonRpcProvider(replaceENVAlchemyKey(rpcEndpoints.mainnet))
  : new providers.JsonRpcProvider(replaceENVAlchemyKey(rpcEndpoints.sepolia));

const l2Provider = isMainnet
  ? new providers.JsonRpcProvider(replaceENVAlchemyKey(rpcEndpoints.arbitrum))
  : new providers.JsonRpcProvider(
      replaceENVAlchemyKey(rpcEndpoints.arbitrumSepolia)
    );

async function main() {
  try {
    // Step 1: List accounts and let user select one
    console.log("📋 Listing available accounts...");
    const selectedKeystore = await listKeystores(
      "Select a keystore to use for signing (enter the number, e.g., 1): "
    );

    if (!selectedKeystore) {
      console.error("❌ No keystore selected");
      process.exit(1);
    }

    // Step 2: Get the private key from the selected keystore
    console.log(`\n🔍 Getting private key for keystore: ${selectedKeystore}`);
    const decryptCommand = `cast wallet decrypt-keystore ${selectedKeystore}`;

    let privateKey;
    try {
      privateKey = execSync(decryptCommand).toString().trim();
      privateKey = privateKey.split(": ")[1];
      console.log("✅ Private key retrieved successfully");
    } catch (error) {
      console.error(`❌ Error decrypting keystore: ${error.message}`);
      process.exit(1);
    }

    // Step 3: Create wallet from private key
    const wallet = new Wallet(privateKey);
    console.log("📝 Address:", wallet.address);

    // Show the L2 chain balance
    const balance = await l2Provider.getBalance(wallet.address);
    const network = await l2Provider.getNetwork();
    const networkName =
      network.name === "arbitrum" ? "Arbitrum" : "Arbitrum Sepolia";
    console.log(`${networkName} ETH Balance:`, formatEther(balance));

    const l2ChainId = Number(network.chainId);

    // Get the Arbitrum network configuration
    const childChainNetwork = getArbitrumNetwork(l2ChainId);
    const inboxTools = new InboxTools(
      l1Provider.getSigner(),
      childChainNetwork
    );

    // Get all deployed contracts from Foundry deployments
    const deployedContractsData = getContractDataFromDeployments();
    const chainContracts = deployedContractsData[l2ChainId.toString()];

    if (!chainContracts) {
      console.log("🚫️ No contracts found for this network");
      return;
    }

    // Let user select which contract to interact with
    const contractChoices = Object.entries(chainContracts).map(
      ([name, data]) => ({
        name,
        value: name,
        description: `Address: ${data.address}`,
      })
    );

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

    // Get contract functions (only write functions)
    const functions = selectedContractData.abi.filter(
      (item) =>
        item.type === "function" &&
        !item.constant &&
        item.stateMutability !== "view"
    );

    if (functions.length === 0) {
      console.log("🚫️ No write functions found in this contract");
      return;
    }

    const functionChoices = functions.map((fn) => ({
      name: fn.name,
      value: fn.name,
      description: `Parameters: ${fn.inputs
        .map((i) => `${i.name}(${i.type})`)
        .join(", ")}`,
    }));

    const selectedFunction = await select({
      message: "Select the function to call:",
      choices: functionChoices,
    });

    const functionAbi = functions.find((fn) => fn.name === selectedFunction);
    if (!functionAbi) {
      console.log("🚫️ Function not found");
      return;
    }

    // Get function parameters
    const params = [];
    for (const param of functionAbi.inputs) {
      const paramValue = await input({
        message: `Enter value for '${param.name}' (${param.type}):`,
        validate: (value) => {
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

    let value = BigInt(0);
    if (functionAbi.stateMutability === "payable") {
      const ethAmount = await input({
        message: "Enter ETH amount (or press enter for 0):",
        default: "0",
      });
      value = ethAmount ? parseEther(ethAmount) : BigInt(0);
    }

    // Encode function data
    const data = selectedContract.interface.encodeFunctionData(
      selectedFunction,
      params
    );

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
    const signedTransaction = await inboxTools.signChildTx(
      transactionRequest,
      childChainWallet
    );

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
        throw new Error(
          `Failed to send signed transaction: ${response.statusText}`
        );
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

// Foundry-specific deployment data reading using broadcast directory
function getContractDataFromDeployments() {
  const BROADCAST_DIR = "./broadcast";
  const OUT_DIR = "./out";

  if (!fs.existsSync(BROADCAST_DIR)) {
    throw Error(
      "No broadcast directory found. Deploy contracts first to generate deployment data."
    );
  }

  function getDirectories(path) {
    if (!fs.existsSync(path)) {
      return [];
    }
    return fs.readdirSync(path).filter((file) => {
      return fs.statSync(join(path, file)).isDirectory();
    });
  }

  function getFiles(path) {
    return fs.readdirSync(path).filter((file) => {
      return fs.statSync(join(path, file)).isFile();
    });
  }

  function parseTransactionRun(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const broadcastData = JSON.parse(content);
      return broadcastData.transactions || [];
    } catch (error) {
      console.warn(`Warning: Could not parse ${filePath}:`, error.message);
      return [];
    }
  }

  function getDeploymentHistory(broadcastPath) {
    const files = getFiles(broadcastPath);
    const deploymentHistory = new Map();

    // Sort files to process them in chronological order
    const runFiles = files
      .filter(
        (file) =>
          file.startsWith("run-") &&
          file.endsWith(".json") &&
          !file.includes("run-latest")
      )
      .sort((a, b) => {
        // Extract run numbers and compare them
        const runA = parseInt(a.match(/run-(\d+)/)?.[1] || "0");
        const runB = parseInt(b.match(/run-(\d+)/)?.[1] || "0");
        return runA - runB;
      });

    for (const file of runFiles) {
      const transactions = parseTransactionRun(join(broadcastPath, file));

      for (const tx of transactions) {
        if (tx.transactionType === "CREATE") {
          // Store or update contract deployment info
          deploymentHistory.set(tx.contractAddress, {
            contractName: tx.contractName,
            address: tx.contractAddress,
            deploymentFile: file,
            transaction: tx,
          });
        }
      }
    }

    return Array.from(deploymentHistory.values());
  }

  function getArtifactOfContract(contractName) {
    const current_path_to_artifacts = join(OUT_DIR, `${contractName}.sol`);

    if (!fs.existsSync(current_path_to_artifacts)) return null;

    const artifactJson = JSON.parse(
      fs.readFileSync(`${current_path_to_artifacts}/${contractName}.json`)
    );

    return artifactJson;
  }

  function processAllDeployments(broadcastPath) {
    const scriptFolders = getDirectories(broadcastPath);
    const allDeployments = new Map();

    scriptFolders.forEach((scriptFolder) => {
      const scriptPath = join(broadcastPath, scriptFolder);
      const chainFolders = getDirectories(scriptPath);

      chainFolders.forEach((chainId) => {
        const chainPath = join(scriptPath, chainId);
        const deploymentHistory = getDeploymentHistory(chainPath);

        deploymentHistory.forEach((deployment) => {
          const timestamp = parseInt(
            deployment.deploymentFile.match(/run-(\d+)/)?.[1] || "0"
          );
          const key = `${chainId}-${deployment.contractName}`;

          // Only update if this deployment is newer
          if (
            !allDeployments.has(key) ||
            timestamp > allDeployments.get(key).timestamp
          ) {
            allDeployments.set(key, {
              ...deployment,
              timestamp,
              chainId,
              deploymentScript: scriptFolder,
            });
          }
        });
      });
    });

    const allContracts = {};

    allDeployments.forEach((deployment) => {
      const { chainId, contractName } = deployment;
      const artifact = getArtifactOfContract(contractName);

      if (artifact) {
        if (!allContracts[chainId]) {
          allContracts[chainId] = {};
        }

        allContracts[chainId][contractName] = {
          address: deployment.address,
          abi: artifact.abi,
          inheritedFunctions: {}, // Simplified for this use case
          deploymentFile: deployment.deploymentFile,
          deploymentScript: deployment.deploymentScript,
        };
      }
    });

    return allContracts;
  }

  // Process all deployments from all script folders
  const allGeneratedContracts = processAllDeployments(BROADCAST_DIR);

  return allGeneratedContracts;
}

// Run the function if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { main as interactWithContracts };
