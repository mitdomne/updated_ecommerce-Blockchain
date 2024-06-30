var mongoose = require('mongoose');

var chatNotifySchema = mongoose.Schema({
    fromUserId: {
        type: String,
        default: ''
    },
    toUserId: {
        type: String,
        default: ''
    },
    new: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model('chatNotify', chatNotifySchema, 'chatNotify');