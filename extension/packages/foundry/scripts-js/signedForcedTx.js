import fs from "fs";
import * as dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse } from "toml";
import { BigNumber, Wallet, providers, utils } from "ethers-arbitrum";
import { formatEther, parseEther } from "@ethersproject/units";
import password from "@inquirer/password";
import input from "@inquirer/input";
import select from "@inquirer/select";
import { InboxTools, getArbitrumNetwork } from "@arbitrum/sdk";
import fetch from "node-fetch";

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
  const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";
  return input.replace("${ALCHEMY_API_KEY}", ALCHEMY_API_KEY);
}

// Stop the script if the default network is localhost
const defaultNetwork = rpcEndpoints.default_network;
if (defaultNetwork === "http://127.0.0.1:8545") {
  console.log(
    "🚫️ You must switch the default network to Arbitrum Sepolia or Arbitrum One in packages/foundry/foundry.toml. Try again once you have made the change.",
  );
  process.exit(1);
}

// Determine if we're on mainnet or testnet based on available networks
const isMainnet = rpcEndpoints.arbitrum && rpcEndpoints.mainnet;
const l1Provider = isMainnet
  ? new providers.JsonRpcProvider(replaceENVAlchemyKey(rpcEndpoints.mainnet))
  : new providers.JsonRpcProvider(replaceENVAlchemyKey(rpcEndpoints.sepolia));

const l2Provider = isMainnet
  ? new providers.JsonRpcProvider(replaceENVAlchemyKey(rpcEndpoints.arbitrum))
  : new providers.JsonRpcProvider(replaceENVAlchemyKey(rpcEndpoints.arbitrumSepolia));

async function main() {
  // Get the encrypted private key
  const encryptedKey = process.env.DEPLOYER_PRIVATE_KEY_ENCRYPTED;

  if (!encryptedKey) {
    console.log("🚫️ You don't have a deployer account. Run `yarn account:generate` or `yarn account:import` first");
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

    // Get all deployed contracts from Foundry deployments
    const deployedContractsData = getContractDataFromDeployments();
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

    // Get contract functions (only write functions)
    const functions = selectedContractData.abi.filter(
      (item) => item.type === "function" && !item.constant && item.stateMutability !== "view",
    );

    if (functions.length === 0) {
      console.log("🚫️ No write functions found in this contract");
      return;
    }

    const functionChoices = functions.map((fn) => ({
      name: fn.name,
      value: fn.name,
      description: `Parameters: ${fn.inputs.map((i) => `${i.name}(${i.type})`).join(", ")}`,
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

// Foundry-specific deployment data reading
function getContractDataFromDeployments() {
  const DEPLOYMENTS_DIR = "./deployments";
  const OUT_DIR = "./out";
  
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    throw Error("At least one other deployment script should exist to generate an actual contract.");
  }
  
  const output = {};
  
  // Read deployment files
  const deploymentFiles = fs.readdirSync(DEPLOYMENTS_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));
  
  for (const chainId of deploymentFiles) {
    const deploymentPath = `${DEPLOYMENTS_DIR}/${chainId}.json`;
    const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    
    const contracts = {};
    
    // Process each deployed contract
    for (const [contractName, address] of Object.entries(deploymentData)) {
      if (contractName === 'networkName') continue;
      
      // Try to find the contract artifact in the out directory
      const artifactPath = `${OUT_DIR}/${contractName}.sol/${contractName}.json`;
      
      if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        contracts[contractName] = {
          address,
          abi: artifact.abi,
          inheritedFunctions: {} // Foundry doesn't track inherited functions the same way
        };
      }
    }
    
    output[chainId] = contracts;
  }
  
  return output;
}

// Run the function if this script is called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { main as interactWithContracts }; 