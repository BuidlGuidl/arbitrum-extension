export const description = `
<div className="flex flex-col max-w-3xl mt-4 bg-base-300 gap-2 p-4 justify-center items-center rounded-lg">
<p className="text-center text-lg mt-8">
    Welcome to the Official SE-2 Arbitrum Extension. This extension is designed to help you get up and running
    with some cool features that Arbitrum offers. Showcasing the address table precompile, bridging, and
    submitting transactions to the Arbitrum Delayed Inbox on L1
</p>

<p className="text-center text-lg">
    Don't have any ArbEth? Start by using the 'Bridge' tab above to bridge some ETH from Sepolia.
</p>

<p className="text-center text-lg">
    Once you have some ArbEth, you can fund your deployer wallet and deploy the ArbAddressTableExample contract
    with 'yarn deploy'. Then you can play with the address table precompile by navigating to the 'Address
    Table' tab above. Go check out the contract so you can see how it works by Arbitrum providing a special
    "precompile" that allows you to cheaply use indexes that reference addresses instead of the actual address
    - saving you on gas consumed.
</p>
<p className="text-center text-lg">
    After having fun with the address table, you can use the 'Forced Tx' tab above to submit transactions to
    the Arbitrum Delayed Inbox on L1 - effectively enabling you to post transactions to Arbitrum even if their
    sequencer would like to censor you. This is one of the key components that makes a layer 2 more than just
    a sidechain.
</p>
</div>
`;

export const externalExtensionName = "Arbitrum";
