var mongoose = require('mongoose');

var commentSchema = mongoose.Schema({
    userId: {
        type: String,
        default: ''
    },
    productId: {
        type: String,
        default: ''
    },
    content: {
        type: String,
        default: ''
    },
    time: {
        type: Date,
        default: new Date()
    }
});

module.exports = mongoose.model('comment', commentSchema, 'comment');