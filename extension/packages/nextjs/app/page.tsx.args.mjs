export const description = `
          <div className="flex flex-col max-w-3xl mt-4 bg-base-300 gap-2 p-4 justify-center items-center rounded-lg">
            <div className="flex flex-col gap-2 bg-base-100 pb-4 px-4 rounded-lg">
              <h2 className="text-2xl text-center mt-8">Welcome to the <b>Arbitrum Starter Kit</b> SE-2 Extension.</h2>
              <p className="text-md text-center mt-0">
                This extension is designed to help you get up and running
                with some cool features Arbitrum has to offer. Showcasing the address table precompile, bridging, and
                submitting transactions to the <b>Arbitrum Delayed Inbox</b> on L1.
              </p>
            </div>
            <h3 className="text-xl mt-4 mb-0 font-bold">Getting Started</h3>
            <div className="text-lg text-left divide-base-200 divide-y-4">
              <p>
                <b>Don't have any ArbEth?</b> Start by using the{" "}
                <Link href="/bridge" passHref className="link">
                  Bridge
                </Link>{" "}
                tab to move some ETH over from  L1.
              </p>
              <p className="pt-4">
                 Once you have ArbEth, <b>fund your deployer wallet</b> and use <b>yarn deploy</b> to deploy the{" "}
                <b>ArbAddressTableExample</b> contract. Then explore the{" "}
                <Link href="/address-table" passHref className="link">
                  Address Table
                </Link>{" "}
                tab to interact with the <b>address table precompile</b>, which allows you to save gas by
                using address indexes.
              </p>
              <p className="pt-4">
                After exploring the address table, use the{" "}
                <Link href="/forced-tx" passHref className="link">
                  Forced Tx
                </Link>{" "}
                tab to <b>submit transactions</b> directly
                to the <b>Arbitrum Delayed Inbox</b> on L1, ensuring <b>censorship resistance</b>.
              </p>
            </div>
          </div>
`;

export const externalExtensionName = "Arbitrum Starter Kit";
