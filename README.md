# Arbitrum Extension
This extension can be used with 
```bash
    npx create-eth@1.0.0-beta.5 -e BuidlGuidl/arbitrum-extension:main
```

It showcases three **Arbitrum** specific abilities:
- L1 <> L2 Bridging
- The Address Table Precompile
- Forcing a transaction from L1 onto L2

## Setup

This extension is meant to be used on testnet/mainnet networks. It will not be able to demonstrate Arbitrum's precompiles if you are running it on a local Hardhat or Anvil(Foundry) node. It defaults to using Sepolia and Arbitrum Sepolia as an L1<>L2 pair. To use mainnet you can adjust the contract deployment framework to deploy to Arbitrum (`packages/hardhat/hardhat.config` change `defaultNetwork` to `arbitrum` or for Foundry change `foundry.toml` > `default_network` to match the RPC for Arbitrum). If you hit any hangups, read more in the [Official Scaffold-ETH Documentation](https://docs.scaffoldeth.io/deploying/deploy-smart-contracts).

> [!NOTE]
> If you are using the Foundry version then you must go to the `foundry.toml` file and set `default_network` to the existing rpc string used for Arbitrum / Arbitrum Sepolia depending on if you are targeting mainnet or testnet. By default it is set to use a local node **which will not work**.

### Deploy Contract

Now in order to deploy you will need to either import a wallet that has funds on the L2 network with `yarn account:import` *or* create a new  wallet with `yarn generate` and then fund that wallet (You can view wallet details with `yarn account`).

Once you have a deployer wallet setup with funds on the L2 network (Arbitrum or Arbitrum Sepolia depending on how you set things up) then you are ready to deploy to the chain with the `yarn deploy` command.

### Start Front End

If you adjusted the deployment from it's default (Sepolia and Arbitrum Sepolia) in the last step then you will need to update the front end by adjusting `targetNetworks` in `packages/nextjs/scaffold.config.ts` to be `[chains.mainnet, chains.arbitrum]`.

Now you can start the front end by running `yarn start`. Then open your browser and navigate to http://localhost:3000. If you want more context you can read more in the [Official Scaffold-ETH Documentation](https://docs.scaffoldeth.io/quick-start/environment#3-launch-your-nextjs-application).

Now you are ready to use this extension! You can use the provided pages listed in the sections below to try out the features or you can view your deployed contract in the 'Debug Contracts' page.

## Using the Arbitrum Bridge

Go to the 'Bridge' tab and follow the instructions to bridge some ETH from L1 to L2 or use the other bridge component to move funds from L2 to L1.

## Using the Arbitrum Address Table

Once you have some Arbitrum ETH, you can fund your deployer wallet and deploy the ArbAddressTableExample contract
with 'yarn deploy'. Then you can play with the address table precompile by navigating to the 'Address
Table' tab above. Go check out the contract so you can see how it works by Arbitrum providing a special
"precompile" that allows you to cheaply use indexes that reference addresses instead of the actual address - saving you on gas consumed.

## Using Forced Transactions

Go to the 'Forced Tx' tab above. Follow the steps to submit transactions to the Arbitrum Delayed Inbox on L1 - effectively enabling you to post transactions to Arbitrum even if their sequencer would want to censor you. This is one of the key components that makes a layer 2 more than just a sidechain.
Typically, the Arbitrum sequencer will not try to censor you and your transaction will post on the L2 within a few minutes of being submitted. If the sequencer does try to censor you, then after 24 hours, you can force the transaction to be included in the L2.
