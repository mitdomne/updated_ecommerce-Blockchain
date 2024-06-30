const express = require('express');
const router = express.Router();

const account = require('../db/models/account');
const cart = require('../db/models/cart');
const sale = require('../db/models/sale');
const productQuantity = require('../db/models/product-quantity');

const constantValue = require('../constant-value');
const Web3 = require('web3');
const siteSettings = require('../db/models/site-settings');

const url = 'http://localhost:8545'
const provider = new Web3.providers.HttpProvider(url)
const web3 = new Web3(provider);
const contract = new web3.eth.Contract(constantValue.productsAbi, constantValue.productsContractAddress);

/**
 * Cart page
 */
router.get('/', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect("/login")

    const user = (await account.findById(req.user));
    cart.find({userId: req.user}).then(async shoppingCart => {
        for (let i = 0; i < shoppingCart.length; i++) {
            const element = shoppingCart[i];
            const product = await contract.methods.products(element.productId).call();
            element.imageHash = product.imageHash;
            element.productName = product.name;
            element.price = product.price;
            const quantity = await productQuantity.findOne({productId: element.productId});
            element.availQuantity = quantity.quantity  - quantity.purchasedQuantity;
        }         
        res.render("cart", {
            title: 'Giỏ hàng',
            user: user,
            shoppingCart: shoppingCart
        })
    });
});

// Check if 2 period of time are conflict
function isConflict(startDateA, endDateA, startDateB, endDateB) {
    return (startDateA <= startDateB && startDateB <= endDateA)
        || (startDateA <= endDateB && endDateB <= endDateA)
        || (startDateB <= startDateA && startDateA <= endDateB)
}

// Check if sale code exists
router.get('/check-sale-code', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    if (req.query.saleCode)
        sale.find({saleCode: req.query.saleCode}, (error, result) => {
            const currentDate = new Date();
            for (let i = 0; i < result.length; i++) {
                const element = result[i];
                if (element.usedQuantity < element.quantity && isConflict(currentDate, currentDate, element.startDate, element.endDate))
                    return res.send(element);   
            }
            res.status(404).send('Not Found');
        })
    else res.status(404).send('Not Found');
})

/**
 * Add to cart
 */
router.post('/add-to-cart', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    const availCart = await cart.findOne({userId: req.user, productId: req.body.productId});
    const quantity = await productQuantity.findOne({productId: req.body.productId});
    const availQuantity = quantity.quantity  - quantity.purchasedQuantity;
    if (availCart) {
        let newAmount = availCart.amount + parseInt(req.body.amount);
        newAmount = Math.min(newAmount, availQuantity);
        await cart.findOneAndUpdate({userId: req.user, productId: req.body.productId}, 
            { $set: { amount: newAmount} })
        res.send('Ok');
    }
    else {
        const newCart = new cart({
            userId: req.user,
            productId: req.body.productId,
            amount: Math.min(req.body.amount, availQuantity),
        });
    
        newCart.save()
            .then(doc => {
                res.send('doc')
            })
            .catch(err => {
                console.log('Error: ', err);
                throw err;
            })
    }
});

/**
 * Buy products from cart
 */
router.get('/buy', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    const userId = req.user;
    const productIds = [], amounts = [], sellerAddresses = [];
    const carts = await cart.find({userId: userId});
    const settings = await siteSettings.findOne({});
    let totalPrice = 0;

    for (let i = 0; i < carts.length; i++) {
        const element = carts[i];

        const quantity = await productQuantity.findOne({productId: element.productId});
        const availQuantity = quantity.quantity  - quantity.purchasedQuantity;
        if (availQuantity === 0) continue;

        productIds.push(element.productId);
        amounts.push(Math.min(element.amount, availQuantity));

        const product = await contract.methods.products(element.productId).call();
        sellerAddresses.push((await account.findById(product.userId)).owner);

        totalPrice += product.price * element.amount;
    }
    
    res.send({productIds: productIds, buyerId: userId, sellerAddresses: sellerAddresses, amounts: amounts, totalPrice: totalPrice, settings: settings});
});

/**
 * Update purchased quantity
 */
router.post('/update-purchase', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    const body = req.body;

    if (body.saleId) await sale.findByIdAndUpdate(body.saleId, {$inc: { usedQuantity: 1 }})

    const data = body.data;
    for (let i = 0; i < data.productIds.length; i++) {
        const id = data.productIds[i];
        await productQuantity.updateOne({productId: id}, {$inc: { purchasedQuantity: data.amounts[i]}});
    }
    res.send('Ok');
});

/**
 * Remove element from cart
 */
router.delete('/remove-from-cart', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    await cart.findByIdAndDelete(req.body.cartId);
    res.send('Ok');
});

/**
 * Remove all element from cart
 */
router.delete('/remove-all-from-cart', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    const userCart = await cart.find({userId: req.body.userId});
    for (let i = 0; i < userCart.length; i++) {
        const element = userCart[i];
        element.delete();
    }
    res.send('Ok');
});

/**
 * Update cart
 */
router.post('/update-cart', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    const cartUpdateData = req.body.cartUpdateData;
    for (let i = 0; i < cartUpdateData.length; i++) {
        const element = cartUpdateData[i];
        const quantity = await productQuantity.findOne({productId: element.productId});
        const availQuantity = quantity.quantity  - quantity.purchasedQuantity;
        await cart.findByIdAndUpdate(element.id, 
            { $set: { amount: Math.min(element.amount, availQuantity) } })
    }
    res.send('Ok');
});

module.exports = router;