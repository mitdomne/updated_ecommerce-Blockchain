var mongoose = require('mongoose');

var settingsSchema = mongoose.Schema({
    commission: {
        type: Number,
        default: 10
    },
    sellerPicks: {
        type: Number,
        default: 0.002
    },
    siteAddress: {
        type: String,
        default: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1'
    }
});

module.exports = mongoose.model('settings', settingsSchema, 'settings');