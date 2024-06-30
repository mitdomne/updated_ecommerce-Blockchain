const express = require('express');
const router = express.Router();

const passport = require('passport');

const account = require('../db/models/account');
const rating = require('../db/models/rating');

const constantValue = require('../constant-value');
const Web3 = require('web3');
const license = require('../db/models/product-license');
const quantity = require('../db/models/product-quantity');

/**
 * Nodemailer
 */
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({extended:false});
const nodemailer = require('nodemailer');
const wishList = require('../db/models/wish-list');
const chatNotify = require('../db/models/chat-notify');
const cart = require('../db/models/cart');
const chat = require('../db/models/chat');

const url = 'http://localhost:8545'
const provider = new Web3.providers.HttpProvider(url)
const web3 = new Web3(provider);
const contract = new web3.eth.Contract(constantValue.productsAbi, constantValue.productsContractAddress);
let products, categories, productsSellerPicks;

router.use(express.static(__dirname + '/../resource/'));

/**
 * Nodemailer
 */
const transporter  = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'laromabodymist@gmail.com',
        pass: 'zxcvbnmm@123'
    }
});

/**
 * Home page: loading all resource
 */
router.get('/', async (req, res) => {
    await getAllProducts();
    await getAllCategories();
    const user = await account.findById(req.user);
    res.render('index', {
        title: 'Trang chủ',
        user: user,
        products: products,
        categories: categories,
        productsSellerPicks
    });
});

async function getAllProducts() {
    products = [];
    productsSellerPicks = [];
    const now = new Date();
    const productCount = await contract.methods.productCount().call();
    for (let i = 1; i <= productCount; i++) {
        const product = await contract.methods.products(i).call();
        const productLicense = await license.findOne({productId: product.id})
        const productUserId = await account.findById(product.userId)
        const productQuantity = await quantity.find({productId: product.id})
        if (!productLicense || !productLicense.accepted 
            || product.isDeleted || productUserId.locked 
            || productQuantity.quantity >= productQuantity.purchasedQuantity) 
            continue;
        const category = await contract.methods.categories(product.categoryId).call();
        product.categoryName = category.name;
        await rating.find({productId: product.id}, (err, res) => {
            let rate = 0;
            res.forEach(element => {
                rate += element.stars;
            })
            product.rating = Math.round(rate / res.length);
        });
        if (now < product.sellerPicksEndTimestamp * 1000)
            productsSellerPicks.push(product);
        else 
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
 * Login page
 */
router.get('/login', async (req, res) => {
    if (!req.headers.referer) req.session.returnTo = '/';
    else
        switch (req.headers.referer.split('/')[3]) {
            case 'code-activated':
            case 'login':
            case 'code-forgot':
                req.session.returnTo = '/'
                break;
            default:
                req.session.returnTo = req.headers.referer;
        }
    if (req.isAuthenticated())
        res.redirect('/');
    else {
        res.render('login', {
            title: 'Đăng nhập',
            user: null
        });
    }
});

router.get('/login/check-exist', async (req, res) => {
    if (req.query.username) {
        const username = await account.findOne({username: req.query.username})
        if (username)
            return res.send('Tên tài khoản đã tồn tại!');
    }

    if (req.query.email) {
        const email = await account.findOne({email: req.query.email})
        if (email)
            return res.send('Email đã tồn tại!');
    }
    
    res.send('Ok');
});

/**
 * Sign up
 */
router.post('/signup', (req, res) => {
    
    let newAccount = new account({
        username: req.body.accountUsername.toLowerCase(),
        password: req.body.accountPassword,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber,
        address: req.body.address,
        avatar: req.body.accountAvatar,
        owner: req.body.accountOwner,
        email: req.body.accountEmail
    });

    newAccount.save()
        .then(doc => {
            let verificationCode = String(Math.floor(Math.random() * 10000));
            while (verificationCode.length < 6) verificationCode = '0' +  verificationCode;

            const mailOptions = {
                from: 'eshop.blockchain@gmail.com',
                to: doc.email,
                subject: 'Code activate B-Shop',
                text: `Xin chào ${doc.lastName} ${doc.firstName}, chào mừng bạn đến với B-Shop. Vui lòng kích hoạt tài khoản.\nMã kích hoạt của bạn là:\n${verificationCode}` + '\nhttp://localhost:8080/code-activated/' + doc.username,
            };
            transporter.sendMail(mailOptions, async function(error, info){
                if (error) {
                    console.log(error);
                } else {
                    await account.findByIdAndUpdate(
                        { _id: doc.id },
                        { $set: {
                            verification: verificationCode
                        } }
                    )
                    res.redirect('code-activated/' + doc.username);
                }
            });

        })
        .catch(err => {
            console.log('Error: ', err);
            throw err;
        })
});

/**
 * Contact us page
 */
router.get('/contact-us', async (req, res) => {
    const user = await account.findById(req.user);
    res.render('contact-us', {
        title: 'Liên hệ',
        user: user
    });
});

// Get email request
router.post('/code-forgot', urlencodedParser, (req, res) => {
    const email = req.body.email;
    let verificationCode = String(Math.floor(Math.random() * 10000));
    while (verificationCode.length < 6) verificationCode = '0'+  verificationCode;
    account.findOne({email: req.body.email}, (err, acc) => {
        const mailOptions = {
            from: 'eshop.blockchain@gmail.com',
            to: email,
            subject: 'Reset Password B-Shop',
            text: 'Xin chào ' + email + ', Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu B-Shop của bạn.\nMã đặt lại mật khẩu sau đây:\n' + verificationCode + '\nhttp://localhost:8080/code-forgot/' + acc.username,
        };
        transporter.sendMail(mailOptions, async function(error, info){
            if (error) {
            console.log(error);
            } else {
                await account.findByIdAndUpdate(
                    { _id: acc.id },
                    { $set: {
                            verification:verificationCode
                    } }
                )
                res.redirect('/code-forgot/' + acc.username);
            }
        });
    })    
})

router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', {
        title: 'Quên mật khẩu',
        user: null
    })
});

router.get('/code-forgot/:username', (req, res) => {
    account.findOne({username: req.params.username}).then(acc => {
        if (!acc.verification) return res.redirect('/');
        res.render('code-forgot', {
            title: 'Quên mật khẩu',
            user: null,
            acc: acc
        });
    })
})

router.post('/code-forgot/:username', (req, res) => {
    const verification = req.body.verification;
    
    account.findOne({username: req.params.username}, (err, acc) => {
        if (verification === acc.verification) {
            res.render('reset-password', {
                title: 'Quên mật khẩu',
                user: null,
                acc: acc
            });
        }
        else {
            res.render('code-forgot',{
                title: 'Quên mật khẩu',
                user: null,
                acc: acc
            });
        }
    })
})

router.post('/reset-password/:username', (req, res) => {
    account.updateOne(
        { username: req.params.username },
        { $set: {
            password: req.body.resetpw,
            verification: ''
        } },
        { useFindAndModify: false })
        .then(doc => {
            res.redirect('/login')
        })
})

router.get('/code-activated/:username', (req, res) => {
    account.findOne({username: req.params.username}).then(acc => {
        if (acc.activated) return res.redirect('/');
        res.render('code-activated', {
            title: 'Kích hoạt tài khoản',
            user: null,
            acc: acc,
        });
    })
})

router.post('/code-activated/:username', (req, res) => {
    const verification = req.body.verification;
    account.findOne({username: req.params.username}, async function (err, acc) {
        if (verification === acc.verification) {
            acc.activated = true;
            acc.verification = '';
            acc.save().then(doc => {
                res.redirect('/login')
            })
        }
        else {
            res.render('code-activated',{
                title: 'Kích hoạt tài khoản',
                user: null,
                acc: acc
            });
        }
    })
})

router.post('/code-activated/resend-email/:username', (req, res) => {
    let verificationCode = String(Math.floor(Math.random() * 10000));
    while (verificationCode.length < 6) verificationCode ='0'+  verificationCode;
    account.findOne({username: req.params.username}, (err, acc) => {
        const email = acc.email;
        const mailOptions = {
            from: 'eshop.blockchain@gmail.com',
            to: email,
            subject: 'Code activate B-Shop',
            text: 'Xin chào ' + email + ', Chào mừng bạn đến với B-Shop. Vui lòng kích hoạt tài khoản.\nMã kích hoạt của bạn là:\n' + verificationCode + '\n http://localhost:8080/code-activated/' + acc.username,
        };
        transporter.sendMail(mailOptions, async function(error, info){
            if (error) {
            console.log(error);
            } else {
                await account.findByIdAndUpdate(
                    { _id: acc.id },
                    { $set: {
                        verification:verificationCode
                    } }
                )
                res.redirect('back');
            }
        });
    })
})

router.get('/get-header-count', async (req, res) => {
    let data = {};
    data.wishListCount = await wishList.countDocuments({userId: req.user});
    data.chatCount = await chatNotify.countDocuments({toUserId: req.user, new: true});
    data.cartCount = 0;
    await cart.find({userId: req.user}, (error, result) => {
        for (let i = 0; i < result.length; i++) {
            const element = result[i];
            data.cartCount += element.amount
        }
    });
    res.send(data);
})

// Authenticate user using passport.js
router.post('/login', function(req, res) {
    passport.authenticate('local', function(err, user, info) { // đăng nhập (ko phân biệt activated hay chưa)
        if (!user) { return res.send('Sai tên tài khoản hoặc mật khẩu !!!'); }  // check có đăng nhập đúng ko
        if (user.locked) {  // check đã locked chưa
            return res.send('Tài khoản của bạn đã bị khóa !!');
         }
        if (!user.activated) {  // check đã activated chưa, nếu chưa làm...
            return res.send('code-activated/' + user.username);
         }
        req.logIn(user, function(err) {
            if (err) { return next(err); }
            return res.send(req.session.returnTo);
        });
      })(req, res);
})

module.exports = router;