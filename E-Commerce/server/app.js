const express = require('express');
const bodyParser = require('body-parser');

const session = require('express-session');
const passport = require('passport');
const localStrategy = require('passport-local').Strategy;

const database = require('./db/database');
const account = require('./db/models/account');

const indexRoutes = require('./index/index-controller');
const accountRoute = require('./accounts/accounts-controller');
const productRoute = require('./products/products-controller');
const dashboardRoute = require('./dashboard/dashboard-controller');
const cartRoute = require('./cart/cart-controller');
const wishListRoute = require('./wish_list/wish-list-controller');
const chatRoute = require('./chat/chat-controller');

const app = express();
const http = require('http').Server(app);

// Realtime chat
const io = require('socket.io')(http);
var chattingUsers = {};

// Create socket for realtime chat
io.sockets.on('connection', function (socket) {
    socket.on('new connect', function (id) {
        if (id in chattingUsers) return;
        socket.userId = id;
        chattingUsers[id] = socket;
    });

    socket.on('sent', function (data) {
        if (data.toUserId in chattingUsers) {
            account.findById(socket.userId, (err, res) => {
                chattingUsers[data.toUserId].emit('new message', {fromUser: res, content: data.content})
            })
        }
    })

    socket.on('disconnect', function(data){
		if (socket.userId in chattingUsers) {
            delete chattingUsers[socket.userId];
        }
	});
});

app.use(bodyParser.urlencoded({extended: true}));

app.set('view engine', 'ejs');
app.set('views', ['./index','./dashboard', './products', './accounts', './cart', './wish_list', './chat', './resource/partials']);

// Website authentication

app.use(session({
    secret: "mysecret",
    cookie: {
        maxAge: 1000*60*60
    },
    resave: true,
    saveUninitialized: true
}))

app.use(passport.initialize());
app.use(passport.session());

passport.use(new localStrategy(
    (username, password, done) => {
        account.findOne({username : username.toLowerCase(), password: password}, function(err, res){
            done(null, res)
        })
    })
)

passport.serializeUser((user, done) => {
    done(null, user.id)
})

passport.deserializeUser((user, done) => {
    done(null, user)
})

// Website routes
app.use('/', indexRoutes);
app.use('/accounts', accountRoute);
app.use('/products', productRoute);
app.use('/dashboard', dashboardRoute);
app.use('/cart', cartRoute);
app.use('/wish-list', wishListRoute);
app.use('/chat', chatRoute);

app.get('/logout', function(req, res){
    req.logout();
    res.redirect('back');
});

app.use(express.static(__dirname + '/'));

const port = 8080;
http.listen(port, () => console.log(`Starting at port ${port}...`))
