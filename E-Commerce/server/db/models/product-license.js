var mongoose = require('mongoose');

var licenseSchema = mongoose.Schema({
    productId: {
        type: String,
        default: ''
    },
    accepted: {
        type: Boolean,
        default: false 
    }
});

module.exports = mongoose.model('license', licenseSchema, 'license');