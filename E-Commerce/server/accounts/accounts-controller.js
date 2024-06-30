const express = require('express');
const router = express.Router();
const account = require('../db/models/account');
const constantValue = require('../constant-value');
const license = require('../db/models/product-license');
const shipper = require('../db/models/shipper');
const Web3 = require('web3');
const sale = require('../db/models/sale');

const url = 'http://localhost:8545'
const provider = new Web3.providers.HttpProvider(url)
const web3 = new Web3(provider);
const contract = new web3.eth.Contract(constantValue.productsAbi, constantValue.productsContractAddress);

let purchaseInfos, acceptedProducts, refusedProducts, waitingProducts, sellInfos, sellInfoDetails, categories;
let sell, buy, revenue, spent;

router.get('/update/get-sell-info-details', async (req, res) => {
    await getAllSellInfoDetails(req.query.sellInfoId);
    res.send(sellInfoDetails);
});

/**
 * Go to Update Account page
 */
router.get('/update/:username', async (req, res) => {
    const user = await account.findById(req.user);
    if (user && (user.username === req.params.username || user.role === "Admin")) {
        account.findOne({username: req.params.username}, (err, account) => {
            if (err) {
                console.log(err);
                throw err
            }
            res.render('account-update', {
                title: 'Cập nhật tài khoản',
                account: account,
                user: user
            });
        })
    }
    else res.redirect('/');
});

/**
 * Update account
 */
router.post('/:username', async (req, res) => {
    const username = req.params.username;
    await account.findOneAndUpdate(
        { username: username },
        { $set: {
            firstName: req.body.accountFirstName,
            lastName: req.body.accountLastName,
            phoneNumber: req.body.accountPhoneNumber,
            address: req.body.accountAddress,
            email: req.body.accountEmail, 
            owner: req.body.accountOwner, 
            avatar: req.body.accountAvatar,
        } },
        { useFindAndModify: false }
    )
    if (req.body.accountNewPassword) {
        await account.findOneAndUpdate(
            { username: username },
            { $set: {
                password: req.body.accountNewPassword
            } },
            { useFindAndModify: false }
        )
    }
    res.redirect('/accounts/' + username)
});

router.post('/update/check-exist', async (req, res) => {
    if (req.body.email) {
        const email = await account.findOne({email: req.body.email})
        if (email && email.id != req.body.accountId) {
            res.send("Email đã tồn tại!");
            return;
        }
    }
    res.send("Ok");
});

router.post('/update/check-password', async (req, res) => {
    const accountPassword = (await account.findById(req.body.accountId)).password;
    if (req.body.password !== accountPassword) {
        res.send("Mật khẩu không đúng!");
        return;
    }
    res.send("Ok");
});

/**
 * Go to Account details page
 */
router.get('/:username', async (req, res) => {
    sell = 0; buy = 0; revenue = 0; spent = 0;
    const user = await account.findById(req.user);
    account.findOne({username: req.params.username}, async (err, account) => {
        await getAllProductsOfAccount(account.id);
        await getAllPurchaseInfos(account.id);
        await getAllSellInfos(account.id);
        await getAllCategories();
        sellInfos.sort();
        res.render('account-details', { 
            title: 'Tài khoản',
            account: account,
            sell: sell,
            buy: buy,
            revenue: revenue,
            spent: spent,
            acceptedProducts: acceptedProducts,
            waitingProducts: waitingProducts,
            refusedProducts: refusedProducts,
            purchaseInfos: purchaseInfos,
            sellInfos: sellInfos,
            categories: categories,
            user: user
        });
    })
});

async function getAllProductsOfAccount(userId) {
    acceptedProducts = [];
    refusedProducts = [];
    waitingProducts = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        if (product.userId == userId || product.isDeleted == true) {
            sell++;
            let productLicense = await license.findOne({productId: product.id})
            if (productLicense == undefined)
                waitingProducts.push(product);
            else if (productLicense.accepted)
                acceptedProducts.push(product);
            else 
                refusedProducts.push(product);
        }
    }
}

async function getAllSellInfos(userId) {
    sellInfos = [];
    const purchaseInfoCount = await contract.methods.purchaseInfoCount().call();
    for (let i = purchaseInfoCount; i > 0; i--) {
        const sellInfo = await contract.methods.purchaseInfos(i).call();
        sellInfo.totalPrice = 0;
        const purchaseShipper = await shipper.findOne({purchaseId: sellInfo.id})
        if (purchaseShipper && purchaseShipper.userId === userId) {
            sellInfo.buyerUsername = (await account.findById(sellInfo.buyerId)).username;
            const detailsCount = (await contract.methods.purchaseInfos(sellInfo.id).call()).detailsCount;
            for (let i = 1; i <= detailsCount; i++) {
                const amount = await contract.methods.getPurchaseInfoAmount(sellInfo.id, i).call();
                const unitPrice = await contract.methods.getPurchaseInfoUnitPrice(sellInfo.id, i).call();
                sellInfo.totalPrice += amount * unitPrice;
            }

            if (sellInfo.saleId)
                await sale.findById(sellInfo.saleId, (err, res) => {
                    sellInfo.totalPrice *= (100 - res.saleOff) / 100;
                })
            
            sellInfo.buyer = (await account.findById(sellInfo.buyerId))
            sellInfos.push(sellInfo)
        }
    }
}

async function getAllSellInfoDetails(sellInfoId) {
    sellInfoDetails = [];
    const purchaseInfos = await contract.methods.purchaseInfos(sellInfoId).call();
    sellInfoDetails.push(purchaseInfos.saleId ? await sale.findById(purchaseInfos.saleId) : {});
    const detailsCount = purchaseInfos.detailsCount;
    for (let i = 1; i <= detailsCount; i++) {
        const detail = {};
        const productId = await contract.methods.getPurchaseInfoProductId(sellInfoId, i).call();
        const amount = await contract.methods.getPurchaseInfoAmount(sellInfoId, i).call();
        const unitPrice = await contract.methods.getPurchaseInfoUnitPrice(sellInfoId, i).call();
        detail.productId = productId;
        detail.productName = (await contract.methods.products(productId).call()).name;
        detail.amount = amount;
        detail.unitPrice = unitPrice;
        sellInfoDetails.push(detail);
    }
}

async function getAllCategories() {
    categories = [];
    const categoryCount = await contract.methods.categoryCount().call();
    for (let i = 1; i <= categoryCount; i++) {
        const category = await contract.methods.categories(i).call();
        categories.push(category);
    }
}

async function getAllPurchaseInfos(userId) {
    purchaseInfos = [];
    const purchaseInfoCount = await contract.methods.purchaseInfoCount().call();
    for (let i = purchaseInfoCount; i > 0; i--) {
        const purchaseInfo = await contract.methods.purchaseInfos(i).call();
        purchaseInfo.totalPrice = 0;
        const detailsCount = (await contract.methods.purchaseInfos(purchaseInfo.id).call()).detailsCount;
        for (let i = 1; i <= detailsCount; i++) {
            if (purchaseInfo.buyerId === userId) {
                const amount = parseInt(await contract.methods.getPurchaseInfoAmount(purchaseInfo.id, i).call());
                buy += amount;
                const unitPrice = await contract.methods.getPurchaseInfoUnitPrice(purchaseInfo.id, i).call();
                purchaseInfo.totalPrice += amount * unitPrice;
            }
            
            const productId = await contract.methods.getPurchaseInfoProductId(purchaseInfo.id, i).call();
            if ((await contract.methods.products(productId).call()).userId === userId)
                revenue += parseFloat(purchaseInfo.totalPrice);
        }
        if (purchaseInfo.buyerId === userId) {
            spent += parseFloat(purchaseInfo.totalPrice);

            if (purchaseInfo.saleId)
                await sale.findById(purchaseInfo.saleId, (err, res) => {
                    purchaseInfo.totalPrice *= (100 - res.saleOff) / 100;
                })

            purchaseInfos.push(purchaseInfo); 
        }
    }
}

module.exports = router;