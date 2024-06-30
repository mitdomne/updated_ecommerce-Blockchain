var mongoose = require('mongoose');

var accountSchema = mongoose.Schema({
    username: {
        type: String,
        default: '*No Username',
        unique: true
    },
    password: {
        type: String,
        default: '*No Password'
    },
    firstName: {
        type: String,
        default: '*No First Name'
    },
    lastName: {
        type: String,
        default: ''
    },
    phoneNumber: {
        type: String,
        default: ''
    },
    address: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        default: '*No Email'
    },
    owner: {
        type: String,
        default: ''
    },
    avatar: {
        type: String,
        default: ''
    },
    role: {
        type: String,
        default: 'Member' // Admin || Seller || Member
    },
    activated: {
        type: Boolean,
        default: false
    },
    locked: {
        type: Boolean,
        default: false
    },
    verification: {
        type: String,
        default: ''
    }
});

module.exports = mongoose.model('account', accountSchema, 'account');