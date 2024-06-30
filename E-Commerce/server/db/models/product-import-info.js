var mongoose = require('mongoose');

var importInfoSchema = mongoose.Schema({
    importsId: {
        type: String,
        default: null
    },
    productId: {
        type: String,
        default: null
    },
    quantity: {
        type: Number,
        default: null
    }
});

module.exports = mongoose.model('importInfo', importInfoSchema, 'importInfo');