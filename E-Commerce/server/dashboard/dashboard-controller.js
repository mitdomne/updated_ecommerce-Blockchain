const express = require('express');
const router = express.Router();
const constantValue = require('../constant-value');
const account = require('../db/models/account');
const sale = require('../db/models/sale');
const imports = require('../db/models/product-imports');
const importInfo = require('../db/models/product-import-info');
const report = require('../db/models/report');
const license = require('../db/models/product-license');
const Web3 = require('web3');
const productImports = require('../db/models/product-imports');
const productQuantity = require('../db/models/product-quantity');
const shipper = require('../db/models/shipper');
const siteSettings = require('../db/models/site-settings');

const url = 'http://localhost:8545'
const provider = new Web3.providers.HttpProvider(url)
const web3 = new Web3(provider);
const contract = new web3.eth.Contract(constantValue.productsAbi, constantValue.productsContractAddress);
let statistic, products, purchaseInfos, purchaseInfoDetails, productCategories, sales;
let user;

router.use(express.static(__dirname + '/resource'));

async function isAdmin(req) {
    user = await account.findById(req.user)
    if (req.isAuthenticated())
        return user.role === 'Admin';
    return false;
}

/**
 * Home page: loading all product
 */
router.get('/', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllStatistic();

        res.render('dashboard', {
            title: 'Thống kê',
            statistic: statistic,
            user: user
        })
    } else {
        res.redirect('/');
    }
});

async function getAllStatistic() {
    statistic = {};

    // Get product quantity statistic
    const quantity = await productQuantity.aggregate([{
            $group: {
                _id: null, 
                quantity: { $sum: '$quantity' }, 
                purchasedQuantity: { $sum: '$purchasedQuantity'}
            }
    }])
    statistic.productsQuantity = quantity.length ? quantity[0].quantity : 0;
    statistic.productsPurchasedQuantity = quantity.length ? quantity[0].purchasedQuantity : 0;

    // Get ether spent statistic
    await getAllProducts();
    let etherSpent = 0;
    for (let i = 0; i < products.length; i++) {
        const element = products[i];
        etherSpent += (await productQuantity.findOne({productId: element.id})).purchasedQuantity * element.price;   
    }
    statistic.etherSpent = etherSpent;
    
    // Get product license statistic
    statistic.licensesAccepted = await license.countDocuments({accepted: true});
    statistic.licensesRefused = await license.countDocuments({accepted: false});
    statistic.licensesNotDecided = products.length - statistic.licensesAccepted - statistic.licensesRefused;

    // Get reports statistic
    statistic.reports = await report.countDocuments({});
    statistic.reportsNew = await report.countDocuments({new: true});

    // Get accounts statistic
    statistic.accountsInactive = await account.countDocuments({activated: false});
    statistic.accountsActive = await account.countDocuments({activated: true, locked: false});
    statistic.accountsLocked = await account.countDocuments({activated: true, locked: true});

    // Get purchases statistic
    statistic.purchasesShipping = 0;
    statistic.purchasesDelivered = 0;
    const purchaseInfoCount = await contract.methods.purchaseInfoCount().call();
    for (let i = purchaseInfoCount; i > 0 ; i--) {
        const purchaseInfo = await contract.methods.purchaseInfos(i).call();
        if (purchaseInfo.status === 'Đang giao')
            statistic.purchasesShipping++;
        else 
            statistic.purchasesDelivered++;
    }
}

/**
 * Products page: loading all product
 */
router.get('/products', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllProducts();
        await getAllProductCategories();

        const accounts = await account.find({
            locked: false,
            $or: [
                {role: 'Admin'}, 
                {role: 'Seller'}
            ]
        });

        res.render('products', {
            title: 'Tất cả hàng hóa',
            products: products,
            productCategories: productCategories,
            accounts: accounts,
            user: user
        })
    } else {
        res.redirect('/');
    }
});

async function getAllProducts() {
    products = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        
        const quantity = await productQuantity.findOne({productId: product.id});
        product.quantity = quantity.quantity;
        product.purchasedQuantity = quantity.purchasedQuantity;
        product.username = (await account.findById(product.userId)).username;

        products.push(product);
    }
}

async function getAllPurchaseInfos() {
    purchaseInfos = [];
    const purchaseInfoCount = await contract.methods.purchaseInfoCount().call();
    for (let i = purchaseInfoCount; i > 0 ; i--) {
        const purchaseInfo = await contract.methods.purchaseInfos(i).call();
        purchaseInfos.push(purchaseInfo)
    }
}

// Add quantity
router.post('/add-quantity', async (req, res) => {
    const productCount = await contract.methods.productCount().call();
    if (!(await productQuantity.findOne({productId: productCount}))) {
        const newQuantity = new productQuantity({
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
 * Home page: loading all product
 */
router.get('/product-seller-picks', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllProducts();
        await getAllProductCategories();
        await getAllPurchaseInfos();
        report.find({new: true}).then(reports => {
            res.render('product-seller-picks', {
                title: 'Đẩy tin',
                products: products,
                productCategories: productCategories,
                user: user
            })
        })
    } else {
        res.redirect('/');
    }
});

/**
 * Go to product category page
 */
router.get('/product-category', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllProductCategories();
        res.render('product-category', { 
            title: 'Loại hàng hóa',
            productCategories: productCategories,
            user: user
        })
    } else {
        res.redirect('/');
    }
});

async function getAllProductCategories() {
    productCategories = [];
    const categoryCount = await contract.methods.categoryCount().call();
    for (let i = 1; i <= categoryCount; i++) {
        const category = await contract.methods.categories(i).call();
        productCategories.push(category);
    }
}

/**
 * Go to product license page
 */
router.get('/product-license', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllWaitingProducts();
        await getAllProductCategories();
        license.find({}).then(licenses => {
            res.render('product-license', { 
                title: 'Kiểm duyệt hàng hóa',
                products: products,
                productCategories: productCategories,
                licenses: licenses,
                user: user
            })
        })
    } else {
        res.redirect('/');
    }
});

async function getAllWaitingProducts() {
    products = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        if (await license.findOne({productId: product.id})) continue;
        const acc = await account.findById(product.userId);
        product.username = acc.username;
        product.fullName = acc.lastName + ' ' + acc.firstName;
        products.push(product);
    }
}

/**
 * Accept
 */
router.post('/product-license/accept/:productId', async (req, res) => {
    const newLicense = new license({
        productId: req.params.productId,
        accepted: true
    });

    newLicense.save()
        .then(doc => {
            res.send(doc)
        })
        .catch(err => {
            console.log('Error: ', err);
            throw err;
        })
});

/**
 * Refuse
 */
router.post('/product-license/refuse/:productId', async (req, res) => {
    const newLicense = new license({
        productId: req.params.productId,
        accepted: false
    });

    newLicense.save()
        .then(doc => {
            res.send(doc)
        })
        .catch(err => {
            console.log('Error: ', err);
            throw err;
        })
});

/**
 * Product reports page: loading all product
 */
router.get('/product-reports', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllReportedProducts();
        await getAllProductCategories();
        report.find({}).then(reports => {
            res.render('product-reports', { 
                title: 'Hàng hóa bị báo cáo',
                products: products,
                purchaseInfos: purchaseInfos,
                productCategories: productCategories,
                reports: reports,
                user: user
            })
        })
    } else {
        res.redirect('/');
    }
});

async function getAllReportedProducts() {
    products = [];
    const allProducts = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        product.reports = 0;
        allProducts.push(product);
    }
    await report.find({new: true}).then(reports => {
        for (let i = 0; i < reports.length; i++) {
            const element = reports[i];
            allProducts[element.productId - 1].reports++;
        }
    })
    for (let i = 0; i < allProducts.length; i++) {
        const element = allProducts[i];
        
        if (element.reports > 0) {
            const acc = await account.findById(element.userId);
            element.username = acc.username;
            element.fullName = acc.lastName + ' ' + acc.firstName;
            products.push(element)
        }
    }
    products.sort(function(a,b) {return a.reports - b.reports})
    products.reverse();
}

/**
 * Valid
 */
router.post('/product-reports/valid/:productId', async (req, res) => {
    await markReportAsRead(req.params.productId)
    res.send();
});

/**
 * Invalid
 */
router.post('/product-reports/invalid/:productId', async (req, res) => {
    productId = req.params.productId
    license.updateOne(
        {productId: productId}, 
        { $set: { 
            accepted: false
        } },
    ).then(doc => {
        console.log(doc)
    })
    await markReportAsRead(productId)
    res.send();
});

async function markReportAsRead(productId) {
    report.updateMany(
        {productId: productId}, 
        { $set: { 
            new: false
        } },
    ).then(doc => {
        console.log(doc)
    })
}

/**
 * Go to sales active page
 */
router.get('/sales-active', async (req, res) => {
    if (await isAdmin(req)) {
        await getSales(true);
        res.render('sales', { 
            title: 'Khuyến mãi khả dụng',
            sales: sales,
            user: user
        })
    } else {
        res.redirect('/');
    }
});

/**
 * Go to sales inactive page
 */
router.get('/sales-inactive', async (req, res) => {
    if (await isAdmin(req)) {
        await getSales(false);
        res.render('sales', { 
            title: 'Khuyến mãi hết hạn',
            sales: sales,
            user: user
        })
    } else {
        res.redirect('/');
    }
});

// Get sales
async function getSales(getConflict) {
    sales = [];
    await sale.find({}).then(saleInfos => {
        const currentDate = new Date();
        for (let i = 0; i < saleInfos.length; i++) {
            const element = saleInfos[i];
            const conflict = isConflict(currentDate, currentDate, element.startDate, element.endDate);
            if (getConflict === conflict)
                sales.push(element);            
        }
    })
}

// Check if 2 period of time are conflict
function isConflict(startDateA, endDateA, startDateB, endDateB) {
    return (startDateA <= startDateB && startDateB <= endDateA)
        || (startDateA <= endDateB && endDateB <= endDateA)
        || (startDateB <= startDateA && startDateA <= endDateB)
}

// Check if the code have already existed
router.get('/sales/check-code', (req, res) => {
    const code = req.query.code;
    const startDate = new Date(req.query.startDate);
    const endDate = new Date(req.query.endDate);
    sale.find({saleCode: code}).then(sales => {
        for (let i = 0; i < sales.length; i++) {
            const element = sales[i];
            if (req.query.id !== element.id && isConflict(element.startDate, element.endDate, startDate, endDate))
                return res.send('Đã có mã trùng với thời gian hiện tại!\nThay đổi mã hoặc thời gian hiệu lực!');
        }
        return res.send('Ok');
    })
})

// Add sale
router.post('/sales/add', (req, res) => {
    const saleName = req.body.saleName;
    const saleCode =  req.body.saleCode;
    const saleOff = req.body.saleOff;
    const saleQuantity = req.body.saleQuantity;
    const saleStartDate = new Date(req.body.saleStartDate);
    const saleEndDate = new Date(req.body.saleEndDate);

    const newSale = new sale({
        saleName: saleName,
        saleCode: saleCode,
        saleOff: saleOff,
        quantity: saleQuantity,
        startDate: saleStartDate,
        endDate: saleEndDate
    })

    newSale.save()
        .then(doc => {
            res.redirect('/dashboard/sales');
        })
        .catch(err => {
            console.log('Error: ', err);
            throw err;
        })
})

// Update sale
router.post('/sales/update', (req, res) => {
    const saleId = req.body.saleId;
    const saleName = req.body.saleName;
    const saleCode =  req.body.saleCode;
    const saleQuantity = req.body.saleQuantity;
    const saleStartDate = new Date(req.body.saleStartDate);
    const saleEndDate = new Date(req.body.saleEndDate);

    sale.findByIdAndUpdate(saleId, 
        {
            saleName: saleName,
            saleCode: saleCode,
            quantity: saleQuantity,
            startDate: saleStartDate,
            endDate: saleEndDate
        }, {
            useFindAndModify: false
        }
    ).then(doc => {
        res.redirect('back');
    })
    .catch(err => {
        console.log('Error: ', err);
        throw err;
    })
})

// Delete sale
router.delete('/sales', (req, res) => {
    const saleId = req.body.saleId;
    sale.findByIdAndDelete(saleId)
        .then(doc => {
            res.send(doc);
        })
        .catch(err => {
            console.log('Error: ', err);
            throw err;
        })
})

/**
 * Go to product imports page
 */
router.get('/product-imports', async (req, res) => {
    if (await isAdmin(req)) {
        imports.find({}).then(async productImports => {
            for (let i = 0; i < productImports.length; i++) {
                const creator = await account.findById(productImports[i].importedBy);
                productImports[i].creator = creator.lastName + ' ' + creator.firstName;
                productImports[i].username = creator.username;
            }
            res.render('product-imports', { 
                title: 'Nhập kho',
                productImports: productImports,
                user: user
            })
        })
    } else {
        res.redirect('/');
    }
});

// Add product imports
router.post('/product-imports/add', (req, res) => {
    const importedDate = req.body.importedDate;
    const newImports = new productImports({
        importedDate: importedDate ? importedDate : new Date(),
        importedBy: user.id,
        status: 'Draft'
    });

    newImports.save().then(doc => {
        res.send(doc);
    })
});

// Publish product imports
router.post('/product-imports/publish', async (req, res) => {
    const importsId = req.body.importsId;
    await importInfo.find({importsId: importsId}).then(async importInfos => {
        for (let i = 0; i < importInfos.length; i++) {
            const element = importInfos[i];
            const info = await productQuantity.findOne({productId: element.productId})
            await productQuantity.findByIdAndUpdate(info.id, {
                $set: {
                    quantity: element.quantity + info.quantity
                }
            }, {
                useFindAndModify: false
            })
        }
    })
    productImports.findByIdAndUpdate(importsId, { 
        $set: {
            status: 'Published'
        } 
    }, { 
        useFindAndModify: false 
    }).then(doc => { res.send('Ok')})
});

// Delete product imports
router.post('/product-imports/delete', (req, res) => {
    const importsId = req.body.importsId;
    importInfo.find({importsId: importsId}).then(async infos => {
        const imports = await productImports.findById(importsId);
        if (imports.status === 'Published') {
            for (let i = 0; i < infos.length; i++) {
                const element = infos[i];
                await productQuantity.findOneAndUpdate({ productId: element.productId }, {
                    $inc: {
                        quantity: element.quantity * -1
                    } 
                }, { 
                    useFindAndModify: false 
                })
            }
        }
        importInfo.deleteMany({importsId: importsId})
            .then(() => productImports.findByIdAndDelete(importsId)
            .then(doc => { res.send('Ok')}))
    })
});

/**
 * Go to product import info page
 */
router.get('/product-imports/:importsId', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllProducts();
        const importsId = req.params.importsId;
        importInfo.find({importsId: importsId}).then(async productImportInfo => {
            for (let i = 0; i < productImportInfo.length; i++) {
                const productName = (await contract.methods.products(productImportInfo[i].productId).call()).name;
                productImportInfo[i].productName = productName;                
            }
            res.render('product-import-info', { 
                title: 'Chi tiết nhập kho',
                productImportInfo: productImportInfo,
                user: user,
                products: products,
                importsId: importsId
            })
        })
    } else {
        res.redirect('/');
    }
});

// Add import info
router.post('/product-imports/:importsId/add', async (req, res) => {
    const importsId = req.params.importsId;
    const productId = req.body.productId;
    const quantity = req.body.quantity;
    let currentInfo = await importInfo.findOne({importsId: importsId, productId: productId});

    const imports = await productImports.findById(importsId);
    if (imports.status === 'Published') {
        await productQuantity.findOneAndUpdate({ productId: productId }, {
            $inc: {
                quantity: quantity
            } 
        }, { 
            useFindAndModify: false 
        })
    }

    if (currentInfo) {
        await importInfo.findByIdAndUpdate(
            { _id: currentInfo.id },
            { $set: {
                quantity: parseInt(currentInfo.quantity) + parseInt(quantity)
            } },
            { useFindAndModify: false })
    } else {
        currentInfo = new importInfo({
            importsId: importsId,
            productId: productId,
            quantity: quantity
        });
        await currentInfo.save();
    }
    res.send('Ok')
});

// Update import info
router.post('/product-imports/:importsId/update', async (req, res) => {
    const importsId = req.params.importsId;
    const quantity = req.body.quantity;
    const importInfoId = req.body.importInfoId;
    
    const imports = await productImports.findById(importsId);
    if (imports.status === 'Published') {
        const info = await importInfo.findById(importInfoId);
        const oldQuantity = info.quantity;
        await productQuantity.findOneAndUpdate({ productId: info.productId }, {
            $inc: {
                quantity: quantity - oldQuantity
            } 
        }, { 
            useFindAndModify: false 
        })
    }

    await importInfo.findByIdAndUpdate(
        { _id: importInfoId },
        { $set: {
            quantity: quantity
        } },
        { useFindAndModify: false }
    ).then(doc => res.send('Ok'));
});

// Delete import info
router.post('/product-imports/:importsId/delete', async (req, res) => {
    const importsId = req.params.importsId;
    const importInfoId = req.body.importInfoId;
    
    const imports = await productImports.findById(importsId);
    const quantity = (await importInfo.findById(importInfoId)).quantity;
    if (imports.status === 'Published') {
        const info = await importInfo.findById(importInfoId);
        await productQuantity.findOneAndUpdate({ productId: info.productId }, {
            $inc: {
                quantity: quantity * -1
            } 
        }, { 
            useFindAndModify: false 
        })
    }

    importInfo.findByIdAndDelete(importInfoId).then(doc => { res.send('Ok') })
});

/**
 * Go to product refuses page
 */
router.get('/product-refused', async (req, res) => {
    if (await isAdmin(req)) {
        await getAllRefusedProducts();
        await getAllProductCategories();
        res.render('product-refused', { 
            title: 'Hàng hóa bị từ chối',
            products: products,
            productCategories: productCategories,
            user: user
        })
    } else {
        res.redirect('/');
    }
});

async function getAllRefusedProducts() {
    products = [];
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        const lic = await license.findOne({productId: product.id});
        if (lic && !lic.accepted) {
            const acc = await account.findById(product.userId);
            product.username = acc.username;
            product.fullName = acc.lastName + ' ' + acc.firstName;
            products.push(product);
        }
    }
}

/**
 * Accept refused product
 */
router.post('/product-refused/accept/:productId', (req, res) => {
    license.updateOne(
        {productId: req.params.productId}, 
        { $set: { 
            accepted: true
        } },
    ).then(doc => {
        res.send(doc)
    })
});

/**
 * Purchase Info page: loading all purchase info has shipping status
 */
router.get('/purchase-info-shipping', async (req, res) => {
    if (await isAdmin(req)) {
        await getPurchaseInfos(true);
        account.find({$or: [
            {role: 'Admin'}, 
            {role: 'Seller'}
        ]}).then(accounts => {
            res.render('purchase-info-shipping', {
                title: 'Đơn hàng đang giao',
                purchaseInfos: purchaseInfos,
                user: user,
                accounts: accounts
            })
        })
    } else {
        res.redirect('/');
    }
});

async function getPurchaseInfos(shipping) {
    purchaseInfos = [];
    const purchaseInfoCount = await contract.methods.purchaseInfoCount().call();
    for (let i = purchaseInfoCount; i > 0 ; i--) {
        const purchaseInfo = await contract.methods.purchaseInfos(i).call();
        if (shipping != (purchaseInfo.status === 'Đang giao')) continue;
        // Calculate total price
        purchaseInfo.totalPrice = 0;
        const detailsCount = (await contract.methods.purchaseInfos(purchaseInfo.id).call()).detailsCount;
        for (let i = 1; i <= detailsCount; i++) {
            const amount = await contract.methods.getPurchaseInfoAmount(purchaseInfo.id, i).call();
            const unitPrice = await contract.methods.getPurchaseInfoUnitPrice(purchaseInfo.id, i).call();
            purchaseInfo.totalPrice += amount * unitPrice;
        }
        
        purchaseInfo.shipper = await shipper.findOne({purchaseId: purchaseInfo.id});
        purchaseInfo.buyer = await account.findById(purchaseInfo.buyerId);
        if (purchaseInfo.shipper) {
            const purchaseShipper = await account.findById(purchaseInfo.shipper.userId);
            purchaseInfo.shipper.userFullName = purchaseShipper.lastName + ' ' + purchaseShipper.firstName;
            purchaseInfo.shipper.username = purchaseShipper.username;
        }
        
        if (purchaseInfo.saleId)
        await sale.findById(purchaseInfo.saleId, (err, res) => {
            purchaseInfo.totalPrice *= (100 - res.saleOff) / 100;
        })

        purchaseInfos.push(purchaseInfo);
    }
}

router.post('/purchase-info-shipping/save-shipper', async (req, res) => {
    const purchaseId = req.body.purchaseId;
    const shipperId = req.body.shipperId;
    const current = await shipper.findOne({purchaseId: purchaseId});
    if (current) {
        await shipper.findByIdAndUpdate(current.id, 
            { $set: {
                userId: shipperId
            } },
            { useFindAndModify: false }
        )
    } else {
        const newShip = new shipper({
            purchaseId: purchaseId,
            userId: shipperId
        })
        await newShip.save();
    }
    res.send('Ok');
})

/**
 * Purchase Info page: loading all purchase info has delivered status
 */
router.get('/purchase-info-delivered', async (req, res) => {
    if (await isAdmin(req)) {
        await getPurchaseInfos(false);
        res.render('purchase-info-delivered', {
            title: 'Đơn hàng đã giao',
            purchaseInfos: purchaseInfos,
            user: user
        })
    } else {
        res.redirect('/');
    }
});

async function getPurchaseInfoDetails(purchaseInfoId) {
    purchaseInfoDetails = [];
    const purchaseInfo = await contract.methods.purchaseInfos(purchaseInfoId).call();
    for (let i = 1; i <= purchaseInfo.DetailsCount ; i++) {
        const purchaseInfoDetail = {};
        const productId = await contract.methods.getPurchaseInfoProductId(purchaseInfoId, i).call();
        const product = await contract.methods.products(productId).call();

        purchaseInfoDetail.productId = productId;
        purchaseInfoDetail.productName = product.name;
        purchaseInfoDetail.amount = await contract.methods.getPurchaseInfoAmount(purchaseInfoId, i).call();
        purchaseInfoDetail.unitPrice = await contract.methods.getPurchaseInfoUnitPrice(purchaseInfoId, i).call();
        purchaseInfoDetail.buyerId = purchaseInfo.buyerId;
        purchaseInfoDetail.buyerName = (await account.findById(purchaseInfo.buyerId)).username
        purchaseInfoDetail.sellerId = product.userId;
        purchaseInfoDetail.sellerName = (await account.findById(product.userId)).username

        purchaseInfoDetails.push(purchaseInfoDetail);
    }
}

/**
 * Accounts page: loading all accounts
 */
router.get('/accounts', async (req, res) => {
   if (await isAdmin(req)) {
        account.find({locked:false}).then(accounts => {
            res.render('accounts', { 
                title: 'Tất cả tài khoản',
                accounts: accounts,
                user: user
            })
        }).catch(err => {
            console.log('Error: ', err);
            throw err;
        })
    } else {
        res.redirect('/')
    }
});

/**
 * Update account
 */

router.post('/accounts/:accountId', (req, res) => {
    accountId = req.params.accountId;
    account.findByIdAndUpdate(
        { _id: accountId },
        { $set: { 
            firstName: req.body.accountFirstName,
            lastName: req.body.accountLastName,
            phoneNumber: req.body.accountPhoneNumber,
            address: req.body.accountAddress,
            email: req.body.accountEmail, 
            owner: req.body.accountOwner, 
            role: req.body.accountRole,
            activated: req.body.accountActivated === 'on',
        } },
        { useFindAndModify: false })
        .then(doc => {
            res.redirect('/dashboard/accounts')
        })
});

router.post('/check-exist', async (req, res) => {
    if (req.body.email) {
        const email = await account.findOne({email: req.body.email})
        if (email && email.id != req.body.accountId) {
            res.send('Email đã tồn tại!');
            return;
        }
    }
    res.send('Ok');
});

/**
 * Accounts locked page: loading  accounts locked
 */
router.get('/accounts-locked', async (req, res) => {
    if (await isAdmin(req)) {
         account.find({locked:true}).then(accounts => {
            res.render('accounts-locked', { 
                title: 'Tài khoản bị khóa',
                accounts: accounts,
                user: user
            })
        }).catch(err => {
            console.log('Error: ', err);
            throw err;
        })
     } else {
        res.redirect('/')
     }
 });

/**
 * lock account
 */
router.post('/accounts/lock/:accountId', async (req, res) => {
    accountId = req.params.accountId
    account.findByIdAndUpdate(
        { _id: accountId },
        { $set: {
            locked: true
        } },
        { useFindAndModify: false })
        .then(doc => {
            res.redirect('/dashboard/accounts')
        })
});
 /**
 * unlock account
 */
router.post('/accounts-locked/unlock/:accountId', async (req, res) => {
    accountId = req.params.accountId
    account.findByIdAndUpdate(
        { _id: accountId },
        { $set: {
            locked: false
        } },
        { useFindAndModify: false })
        .then(doc => {
            res.redirect('/dashboard/accounts-locked')
        })
});

/**
 * Accounts locked page: loading  accounts locked
 */
router.get('/site-settings', async (req, res) => {
    if (await isAdmin(req)) {
        siteSettings.findOne({}, async (err, settings) => {
            if (!settings) {
                settings = new siteSettings();
                await settings.save();
            }
            res.render('site-settings', {
                title: 'Thông số hệ thống',
                settings: settings,
                user: user 
            })
        })
     } else {
        res.redirect('/')
     }
});

router.post('/site-settings', async (req, res) => {
    if (await isAdmin(req)) {
        siteSettings.updateOne({}, {
            commission: req.body.commission,
            sellerPicks: req.body.sellerPicks,
            siteAddress: req.body.siteAddress
        }, (err, raw) => res.redirect('back'));
     } else {
        res.redirect('/')
     }
});

module.exports = router;