var mongoose = require('mongoose');

var reportSchema = mongoose.Schema({
    userId: {
        type: String,
        default: ''
    },
    productId: {
        type: String,
        default: ''
    },
    time: {
        type: Date,
        default: new Date()
    },
    new: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model('report', reportSchema, 'report');