var mongoose = require('mongoose');

var wishListSchema = mongoose.Schema({
    userId: {
        type: String,
        default: 'No Name'
    },
    productId: {
        type: String,
        default: 'No Type'
    }
});

module.exports = mongoose.model('wishList', wishListSchema, 'wishList');