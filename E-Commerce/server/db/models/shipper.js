var mongoose = require('mongoose');

var shipperSchema = mongoose.Schema({
    purchaseId: {
        type: String,
        default: ''
    },
    userId: {
        type: String,
        default: ''
    }
});

module.exports = mongoose.model('shipper', shipperSchema, 'shipper');