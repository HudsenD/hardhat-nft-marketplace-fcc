const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Tests", function () {
          let nftMarketplace, basicNft, deployer, player
          const PRICE = ethers.utils.parseEther("0.01")
          provider = ethers.provider
          const TOKEN_ID = 0

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              player = (await getNamedAccounts()).player
              await deployments.fixture(["all"])
              nftMarketplace = await ethers.getContract("NftMarketplace")
              basicNft = await ethers.getContract("BasicNft")
              await basicNft.mintNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID)
          })
          describe("listItem", function () {
              it("emits an event when item is listed", async function () {
                  expect(await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit("ItemListed")
              })
              it("populates price and seller properly in s_listings mapping", async function () {
                  const listTx = await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await listTx.wait(1)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  const seller = listing.seller
                  const price = listing.price
                  assert(seller == deployer)
                  assert(price.toString() == PRICE)
              })
              it("reverts when item is already listed", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith(
                      "AlreadyListed"
                  )
              })
              it("reverts when sell price isn't above 0", async function () {
                  await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, "0")).to.be.revertedWith(
                      "PriceMustBeAboveZero"
                  )
              })
              it("reverts if NFT isn't approved for marketplace contract", async function () {
                  await basicNft.mintNft()
                  await expect(nftMarketplace.listItem(basicNft.address, 1, PRICE)).to.be.revertedWith(
                      "NotApprovedForMarketplace"
                  )
              })
          })
          describe("buyItem", function () {
              it("doesn't let you buy unlisted items", async function () {
                  const nftMarketplacePlayer = await ethers.getContract("NftMarketplace", player)
                  await expect(
                      nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  ).to.be.revertedWith("NotListed")
              })
              it("doesn't let you underpay for a listed item", async function () {
                  const listTx = await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await listTx.wait(1)
                  await expect(nftMarketplace.buyItem(basicNft.address, TOKEN_ID)).to.be.revertedWith("PriceNotMet")
              })
              it("transfers nft to buyer and updates proceeds", async function () {
                  const listTx = await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await listTx.wait(1)
                  const nftMarketplacePlayer = await ethers.getContract("NftMarketplace", player)
                  const buyTx = await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  await buyTx.wait(1)
                  const newNftOwner = await basicNft.ownerOf(TOKEN_ID)
                  const sellerProceeds = await nftMarketplace.getProceeds(deployer)
                  assert.equal(newNftOwner, player)
                  assert.equal(sellerProceeds.toString(), PRICE)
              })
              it("emits an event when item is bought", async function () {
                  const listTx = await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await listTx.wait(1)
                  const nftMarketplacePlayer = await ethers.getContract("NftMarketplace", player)
                  expect(await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })).to.emit(
                      "ItemSold"
                  )
              })
          })
          describe("cancelItem", function () {
              it("reverts if no listing", async function () {
                  await expect(nftMarketplace.cancelItem(basicNft.address, TOKEN_ID)).to.be.revertedWith("NotListed")
              })
              it("reverts if not owner of listing", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await ethers.getContract("NftMarketplace", player)
                  await expect(nftMarketplacePlayer.cancelItem(basicNft.address, TOKEN_ID)).to.be.revertedWith(
                      "NotOwner"
                  )
              })
              it("deletes listing", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await nftMarketplace.cancelItem(basicNft.address, TOKEN_ID)
                  await expect(nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })).to.be.revertedWith(
                      "NotListed"
                  )
              })
          })
          describe("updateListing", function () {
              it("reverts if new price is zero", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(nftMarketplace.updateListing(basicNft.address, TOKEN_ID, "0")).to.be.revertedWith(
                      "CantBeZero"
                  )
              })
              it("updates listing with new price", async function () {
                  const newPrice = ethers.utils.parseEther("0.02")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  const { price } = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(price.toString() == newPrice)
              })
              it("emits event when a listing is updated", async function () {
                  const newPrice = ethers.utils.parseEther("0.02")
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)).to.emit("ItemListed")
              })
          })

          describe("withdrawProceeds", function () {
              it("reverts if no proceeds", async function () {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith("NoProceeds")
              })
              it("transfers msg.sender their proceeds and updates proceed balance to 0", async function () {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const nftMarketplacePlayer = await ethers.getContract("NftMarketplace", player)
                  const sellerBalanceBefore = await provider.getBalance(deployer)
                  await nftMarketplacePlayer.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  const proceedsBeforeWithdraw = await nftMarketplace.getProceeds(deployer)
                  const withdrawTx = await nftMarketplace.withdrawProceeds()
                  const withdrawTxReceipt = await withdrawTx.wait(1)
                  const { gasUsed, effectiveGasPrice } = withdrawTxReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const updatedProceeds = await nftMarketplace.getProceeds(deployer)
                  const sellerBalanceAfter = await provider.getBalance(deployer)

                  assert.equal(updatedProceeds.toString(), "0")
                  assert.equal(
                      sellerBalanceBefore.add(proceedsBeforeWithdraw).toString(),
                      sellerBalanceAfter.add(gasCost).toString()
                  )
              })
          })
      })
