var mongoose = require('mongoose');

var cartSchema = mongoose.Schema({
    userId: {
        type: String,
        default: 'No Name'
    },
    productId: {
        type: String,
        default: 'No Type'
    },
    amount: {
        type: Number,
        default: ''
    }
});

module.exports = mongoose.model('cart', cartSchema, 'cart');