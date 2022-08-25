const { ethers, network } = require("hardhat")
const { moveBlocks } = require("../utils/move-blocks")

const PRICE = ethers.utils.parseEther("0.01")

async function mintAndList() {
    const nftMarketplace = await ethers.getContract("NftMarketplace")
    const basicNft = await ethers.getContract("BasicNft")
    console.log("Minting...")
    const mintTx = await basicNft.mintNft()
    const mintTxReciept = await mintTx.wait(1)
    const tokenId = mintTxReciept.events[0].args.tokenId
    console.log("Approving Nft...")
    const approveTx = await basicNft.approve(nftMarketplace.address, tokenId)
    await approveTx.wait(1)
    console.log("Listing Nft...")
    const listTx = await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
    await listTx.wait(1)
    console.log("Listed!")

    if (network.config.chainId == "31337") {
        await moveBlocks(2, (sleepAmount = 1000))
    }
}

mintAndList()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
