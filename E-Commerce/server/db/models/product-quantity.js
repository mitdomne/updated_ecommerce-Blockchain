var mongoose = require('mongoose');

var quantitySchema = mongoose.Schema({
    productId: {
        type: String,
        default: ''
    },
    quantity: {
        type: Number,
        default: '0'
    },
    purchasedQuantity: {
        type: Number,
        default: '0'
    }
});

module.exports = mongoose.model('quantity', quantitySchema, 'quantity');