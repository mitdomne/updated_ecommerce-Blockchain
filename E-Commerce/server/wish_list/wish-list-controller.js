var express = require('express');
var router = express.Router();

var account = require('../db/models/account');
var wishList = require('../db/models/wish-list');

const constantValue = require('../constant-value');
const Web3 = require('web3');

var web3;
var contract;
const url = 'http://localhost:8545'
const provider = new Web3.providers.HttpProvider(url)
web3 = new Web3(provider);
contract = new web3.eth.Contract(constantValue.productsAbi, constantValue.productsContractAddress);

/**
 * Wish list page
 */
router.get('/', async (req, res) => {
    if (!req.isAuthenticated()) res.redirect("/login")
    else {
        var user = (await account.findById(req.user));
        wishList.find({userId: req.user}).then(async userWishList => {
            for (let i = 0; i < userWishList.length; i++) {
                const element = userWishList[i];
                var product = await contract.methods.products(element.productId).call()
                element.imageHash = product.imageHash;
                element.productName = product.name;
                element.price = product.price;
            }         
            res.render("wish-list", {
                title: 'Danh sách mong muốn',
                user: user,
                userWishList: userWishList
            })
        });
    }
});


/**
 * Add to wish list
 */
router.post('/add-to-wish-list', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    var availWishList = await wishList.findOne({userId: req.user, productId: req.body.productId});
    if (!availWishList) {
        let newWishList = new wishList({
            userId: req.user,
            productId: req.body.productId,
        });
    
        newWishList.save()
            .then(doc => {
                res.send('doc')
            })
            .catch(err => {
                console.log('Error: ', err);
                throw err;
            })
    } else res.send("Ok");
});

/**
 * Remove element from wish list
 */
router.delete('/remove-from-wish-list', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    await wishList.findByIdAndDelete(req.body.wishListId);
    res.send('Ok');
});

module.exports = router;