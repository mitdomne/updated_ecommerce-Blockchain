var mongoose = require('mongoose');

var ratingSchema = mongoose.Schema({
    userId: {
        type: String,
        default: ''
    },
    productId: {
        type: String,
        default: ''
    },
    stars: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('rating', ratingSchema, 'rating');