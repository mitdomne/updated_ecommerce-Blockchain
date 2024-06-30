const express = require('express');
const router = express.Router();
const constantValue = require('../constant-value');
const account = require('../db/models/account');
const comment = require('../db/models/comment');
const report = require('../db/models/report');
const license = require('../db/models/product-license');
const quantity = require('../db/models/product-quantity');
const rating = require('../db/models/rating');
const siteSettings = require('../db/models/site-settings');
const Web3 = require('web3');
const productQuantity = require('../db/models/product-quantity');

const url = 'http://localhost:8545'
const provider = new Web3.providers.HttpProvider(url)
const web3 = new Web3(provider);
const contract = new web3.eth.Contract(constantValue.productsAbi, constantValue.productsContractAddress);
let products, categories;

async function getAllProducts() {
    products = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        const productLicense = await license.findOne({productId: product.id})
        const productUserId = await account.findById(product.userId)
        if (productLicense == null || productLicense.accepted == false || product.isDeleted == true || productUserId.locked) continue;
        const category = await contract.methods.categories(product.categoryId).call();
        product.categoryName = category.name;
        products.push(product);
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

/**
 * Go to Add Product page
 */
router.get('/add', async (req, res) => {
    if (req.isAuthenticated()){
        await getAllCategories();
        const user = await account.findById(req.user);
        res.render('product-add', {
            title: 'Thêm sản phẩm',
            user: user,
            categories: categories,
        });
    }
    else {
        res.redirect('/');
    }
});

// Add quantity
router.post('/add-quantity', async (req, res) => {
    const productCount = await contract.methods.productCount().call();
    if (!(await quantity.findOne({productId: productCount}))) {
        const newQuantity = new quantity({
            productId: productCount,
            quantity: 0,
            purchasedQuantity: 0
        });
    
        newQuantity.save()
            .then(doc => {
                res.send('Ok')
            })
            .catch(err => {
                console.log('Error: ', err);
                throw err;
            })
    }
    else res.send('Ok')
});

/**
 * Go to Update Product page
 */
router.get('/update/:productId', async (req, res) => {
    const product = await contract.methods.products(req.params.productId).call();
    await getAllCategories();
    const user = await account.findById(req.user);
    if (!user || product.userId !== user.id && user.role !== 'Admin') 
        return res.redirect('/');
    const quantity = await productQuantity.findOne({productId: product.id});
    product.username = (await account.findById(product.userId)).username;
    res.render('product-update', { 
        title: 'Cập nhật sản phẩm',
        product: product,
        categories: categories,
        quantity: quantity,
        user: user
    });
});

/**
 * Go to Detail Product page
 */
router.get('/:productId', async (req, res) => {
    const product = await contract.methods.products(req.params.productId).call();
    if (product.id <= 0)
        return res.redirect('/');
    const productAccount = await account.findById(product.userId);
    product.fullName = `${productAccount.lastName} ${productAccount.firstName}`;
    product.username = productAccount.username;
    product.categoryName = (await contract.methods.categories(product.categoryId).call()).name;
    const productLicense = await license.findOne({productId: product.id});
    product.accepted = productLicense ? productLicense.accepted : false;
    product.quantity = await quantity.findOne({productId: product.id});
    product.locked = (await account.findById(product.userId)).locked;
    await rating.find({productId: product.id}, (err, res) => {
        let rate = 0;
        res.forEach(element => {
            rate += element.stars;
            if (element.userId === req.user) product.userRating = element.stars;
        })
        product.rating = Math.round(rate / res.length);
        product.ratingLength = res.length;
    });
    const comments = await comment.find({productId: req.params.productId});
    comments.forEach(element => {
        account.findById(element.userId, (err, acc) => {
            element.username = acc.username;
            element.fullName = acc.lastName + ' ' + acc.firstName;
        })
    });
    await getAllProducts();
    await getAllCategories();
    const user = await account.findById(req.user);
    const settings = await siteSettings.findOne({});
    if (product.isDeleted && user.id !== product.userId) 
        return res.redirect('/');
    products.slice(0, 5);
    res.render('product-details', { 
        title: 'Chi tiết sản phẩm',
        user: user,
        product: product,
        products: products,
        comments: comments,
        categories: categories,
        sellerAddress: productAccount.owner,
        siteSettings: settings
    });
});

/**
 * Add comment
 */
router.post('/add-comment/:productId', (req, res) => {
    const newComment = new comment({
        userId: req.user,
        productId: req.params.productId,
        content: req.body.commentContent,
        timestamp: new Date()
    });

    newComment.save()
        .then(doc => {
            res.redirect('back');
        })
        .catch(err => {
            console.log('Error: ', err);
            throw err;
        })
});

/**
 * Delete comment
 */
router.delete('/delete-comment/:commentId', (req, res) => {
    const commentId = req.params.commentId;
    comment.findByIdAndDelete(commentId, (err, doc) => {
        if (err) throw err;
        res.send(doc);
    })
});

/**
 * Report
 */
router.post('/report/:productId', async (req, res) => {
    const userReport = await report.findOne({userId: req.user, productId: req.params.productId, new: true});
    if (userReport)
        return res.send('done');

    const newReport = new report({
        userId: req.user,
        productId: req.params.productId,
        timestamp: new Date()
    });

    newReport.save().then(doc => res.send(doc)).catch(err => {
        console.log('Error: ', err);
        throw err;
    })
});

router.post('/rating', async (req, res) => {
    let newRating = await rating.findOne({userId: req.user, productId: req.body.productId});
    if (!newRating) 
        newRating = new rating({
            userId: req.user,
            productId: req.body.productId,
            stars: req.body.stars
        })
    else newRating.stars = req.body.stars;

    newRating.save().then(doc => res.send(doc)).catch(err => {
        console.log('Error: ', err);
        throw err;
    })
});

/**
 * Search category page: loading all product
 */
router.get('/search-category/:categoryId', async (req, res) => {
    await getAllProductsByCategory(req.params.categoryId);
    await getAllCategories();
    const user = (await account.findById(req.user));
    const category = await contract.methods.categories(req.params.categoryId).call();
    const categoryName = category.name;
    res.render('products-search', { 
        title: 'Tìm kiếm sản phẩm',
        searchText: `Hàng hóa loại '${categoryName}'`,
        products: products,
        categories: categories,
        user: user
    })
    
});

async function getAllProductsByCategory(categoryId) {
    products = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        const productLicense = await license.findOne({productId: product.id})
        const productUserId = await account.findById(product.userId)
        if (productLicense == null || productLicense.accepted == false || product.categoryId != categoryId || productUserId.locked) continue;
        await rating.find({productId: product.id}, (err, res) => {
            let rate = 0;
            res.forEach(element => {
                rate += element.stars;
            })
            product.rating = Math.round(rate / res.length);
        });
        
        products.push(product);
    }
}

/**
 * Search price page: loading all product
 */
router.get('/search-price/:leftPrice-:rightPrice', async (req, res) => {
    await getAllProductsByPrice(req.params.leftPrice, req.params.rightPrice);
    await getAllCategories();
    const user = (await account.findById(req.user));
    res.render('products-search', { 
        title: 'Tìm kiếm sản phẩm',
        searchText: `Hàng hóa giá từ ${req.params.leftPrice} ETH - ${req.params.rightPrice} ETH`,
        products: products,
        categories: categories,
        user: user
    })
    
});

async function getAllProductsByPrice(leftPrice, rightPrice) {
    products = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        const productLicense = await license.findOne({productId: product.id})
        const price = parseInt(product.price)
        const productUserId = await account.findById(product.userId)
        if (productLicense == null || productLicense.accepted == false || leftPrice > price || price > rightPrice || productUserId.locked) continue;
        const category = await contract.methods.categories(product.categoryId).call();
        product.categoryName = category.name;
        await rating.find({productId: product.id}, (err, res) => {
            let rate = 0;
            res.forEach(element => {
                rate += element.stars;
            })
            product.rating = Math.round(rate / res.length);
        });

        products.push(product);
    }
}

/**
 * Search bar page: loading all product
 */
router.get('/search/:searchContent', async (req, res) => {
    let searchContent = req.params.searchContent;
    if (searchContent === ':all')
        searchContent = '';
    await getAllProductsBySearchContent(searchContent);
    await getAllCategories();
    const user = (await account.findById(req.user));
    res.render('products-search', { 
        title: 'Tìm kiếm sản phẩm',
        searchText: !searchContent ? 'Tất cả hàng hóa' : `Hàng hóa chứa từ khóa '${searchContent}'`,
        products: products,
        categories: categories,
        user: user
    })
});

async function getAllProductsBySearchContent(searchContent) {
    products = [];
    const searchContentExporession = new RegExp('.*' + searchContent + '.*', "i");
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        const productLicense = await license.findOne({productId: product.id})
        const productUser = await account.findById(product.userId);
        if (productLicense == null || productLicense.accepted == false || product.isDeleted == true || productUser.locked) continue;
        if (!product.name.match(searchContentExporession) && !productUser.lastName.match(searchContentExporession) && !productUser.firstName.match(searchContentExporession) && !productUser.username.match(searchContentExporession)) continue;
        const category = await contract.methods.categories(product.categoryId).call();
        product.categoryName = category.name;
        await rating.find({productId: product.id}, (err, res) => {
            let rate = 0;
            res.forEach(element => {
                rate += element.stars;
            })
            product.rating = Math.round(rate / res.length);
        });

        products.push(product);
    }
}

module.exports = router;