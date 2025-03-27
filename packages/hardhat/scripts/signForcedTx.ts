import * as dotenv from "dotenv";
dotenv.config();
import { Wallet, providers, utils } from "ethers-arbitrum";
import { formatEther, parseEther } from "@ethersproject/units";
import password from "@inquirer/password";
import input from "@inquirer/input";
import number from "@inquirer/number";
import { InboxTools, getArbitrumNetwork } from "@arbitrum/sdk";
import { ethers as hreEthers, config } from "hardhat";
import { HttpNetworkUserConfig } from "hardhat/types";
import { ArbAddressTableExample } from "../typechain-types";
import fetch from "node-fetch";

// If arbitrum mainnet is the default then we can deduce that the L1 is ETH mainnet otherwise it's ETH sepolia
const isMainnet = config.defaultNetwork === "arbitrum";
const networks = config.networks as { [key: string]: HttpNetworkUserConfig };
const l1Provider = isMainnet
  ? new providers.JsonRpcProvider(networks.mainnet.url)
  : new providers.JsonRpcProvider(networks.sepolia.url);

const l2Provider = isMainnet
  ? new providers.JsonRpcProvider(networks.arbitrum.url)
  : new providers.JsonRpcProvider(networks.arbitrumSepolia.url);

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

    const ArbAddressTableExampleContract =
      await hreEthers.getContract<ArbAddressTableExample>("ArbAddressTableExample");

    let recipientAddress: string | undefined;
    const validateRecipientIndex = async (index: number | undefined) => {
      if (typeof index !== "number") {
        return "Invalid recipient index. Please enter a number.";
      }
      try {
        // Check contract to see if address is valid
        const address = await ArbAddressTableExampleContract.getAddressFromIndex(BigInt(index));
        if (!address) {
          return "Invalid recipient index. You can add an address using the register method in the Address Table tab.";
        }
        recipientAddress = address;
        return true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        return "Invalid recipient index. You can add an address using the register method in the Address Table tab.";
      }
    };

    const getAnswer = (recipientIndex: string) => {
      return `${recipientIndex} => ${recipientAddress}`;
    };

    // Prompt for transaction details
    const message = await input({ message: "Enter the message to send:" });
    const recipientIndex = await number({
      message: "Enter the recipient address index:",
      validate: validateRecipientIndex,
      required: true,
      theme: {
        style: {
          answer: getAnswer,
        },
      },
    });
    const ethAmount = await input({ message: "Enter ETH amount (or press enter for 0):", default: "0" });

    // Convert ETH amount to wei if provided
    const value = ethAmount ? parseEther(ethAmount) : BigInt(0);

    const contractAddress = ArbAddressTableExampleContract.target as string;

    const data = ArbAddressTableExampleContract.interface.encodeFunctionData("sendMessageToAddress", [
      message,
      BigInt(recipientIndex as number),
    ]);

    // Create the transaction request
    const transactionRequest = {
      data,
      to: contractAddress,
      value,
    };

    console.log("\n📝 Transaction details:");
    console.log("Message:", message);
    console.log("Recipient Index:", recipientIndex);
    console.log("ETH Amount:", ethAmount || "0");
    console.log("Contract Address:", contractAddress);

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
      message,
      contractAddress,
      value: value.toString(),
      addressIndex: recipientIndex,
      recipientAddress,
      transactionHash, // Include the expected transaction hash
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
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
