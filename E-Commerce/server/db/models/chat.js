var mongoose = require('mongoose');

var chatSchema = mongoose.Schema({
    fromUserId: {
        type: String,
        default: ''
    },
    toUserId: {
        type: String,
        default: ''
    },
    content: {
        type: String,
        default: ''
    },
    sentDate: {
        type: Date,
        default: new Date()
    },
});

module.exports = mongoose.model('chat', chatSchema, 'chat');