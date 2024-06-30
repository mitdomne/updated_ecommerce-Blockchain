var mongoose = require('mongoose');

var saleSchema = mongoose.Schema({
    saleName: {
        type: String,
        default: '',
    },
    saleCode: {
        type: String,
        default: ''
    },
    saleOff: {
        type: Number,
        default: 0
    },
    quantity: {
        type: Number,
        default: 0
    },
    usedQuantity: {
        type: Number,
        default: 0
    },
    startDate: {
        type: Date,
        default: new Date()
    },
    endDate: {
        type: Date,
        default: new Date()
    }
});

module.exports = mongoose.model('sale', saleSchema, 'sale');