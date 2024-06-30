const express = require('express');
const router = express.Router();

const chat = require('../db/models/chat');
const chatNotify = require('../db/models/chat-notify');
const account = require('../db/models/account');

router.use(express.static(__dirname + '/../resource/'));

/**
 * Chat page
 */
router.get('/', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    account.findById(req.user, (err, acc) => {
        chat.find({$or:[{fromUserId: acc.id}, {toUserId: acc.id}]}, async (err, userChat) => {
            let userChatTo = null;
            let contactList = [];
            if (userChat.length) {
                userChat.sort((a, b) => {
                    const dA = new Date(a.sentDate);
                    const dB = new Date(b.sentDate);
                    if (dA < dB) return -1;
                    if (dA > dB) return 1;
                    return 0;
                })
                contactList = await getUniqueContactList(req.user, userChat);
            }
            res.render('chat', {
                user: acc,
                chat: userChat,
                userChatTo: userChatTo,
                contactList: contactList
            });
        })
    })
})

async function getUniqueContactList(userId, userChat) {
  const flags = [], result = [], l = userChat.length;
  for (let i = l - 1; i >= 0; i--) {
    const curChat = userChat[i];
    let curChatUserId = curChat.fromUserId === userId ? curChat.toUserId : curChat.fromUserId;

    if (flags[curChatUserId]) continue;
    flags[curChatUserId] = true;

    let curChatUser = await account.findById(curChatUserId);
    curChat.avatar = curChatUser.avatar;
    curChat.fullName = `${curChatUser.lastName} ${curChatUser.firstName}`;
    const notify = await chatNotify.findOne({fromUserId: curChatUserId, toUserId: userId});
    if (notify) curChat.new = notify.new;
    result.push(curChat);
  }
  return result;
}

// Send message to other user
router.post('/', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    let newChat = new chat({
        fromUserId: req.user,
        toUserId: req.body.toUserId,
        content: req.body.content,
        sentDate: new Date()
    })

    newChat.save().then(async doc => {
        // Send notify to user who receives the message
        let notify = await chatNotify.findOne({fromUserId: req.user, toUserId: req.body.toUserId});
        if (!notify)
            notify = new chatNotify({
                fromUserId: req.user,
                toUserId: req.body.toUserId,
                new: true
            });
        else notify.new = true;
        await notify.save();

        // Mark notify to current user false
        notify = await chatNotify.findOne({fromUserId: req.body.toUserId, toUserId: req.user})
        if (!notify)
            notify = new chatNotify({
                fromUserId: req.user,
                toUserId: req.body.toUserId,
                new: false
            });
        else notify.new = false;
        await notify.save();
        
        res.send("Ok");
    })
})
// Get search content
router.get('/search-name-or-username', (req, res) => {
    // Expression tells database to search document that contains searchContent in it
    const searchContentExporession = new RegExp('.*' + req.query.searchContent + '.*', "i");
    account.find({
        $or: [
            {firstName: searchContentExporession}, 
            {lastName: searchContentExporession},
            {username: searchContentExporession}
        ]
    }, (err, accountList) => {
        res.send(accountList);
    })
})

// Get avatar
router.get('/get-avatar', (req, res) => {
    account.findById(req.query.userId, (err, acc) => {
        res.send(acc.avatar);
    })
})

// Get chat boxes and mark as read
router.get('/get-chat-boxes', (req, res) => {
    const curUserId = req.user;
    const toUserId = req.query.toUserId;
    chat.find({
        $or: [
            {fromUserId: curUserId, toUserId: toUserId}, 
            {fromUserId: toUserId, toUserId: curUserId}
        ]
    }, (err, userChat) => {
        let result = [];
        for (let i = 0; i < userChat.length; i++) {
            let element = userChat[i]._doc;
            element.fromUserId === curUserId ? element.type = 'sent' : element.type = 'replies';   
            result.push(element);
        }
        chatNotify.updateOne({fromUserId: req.query.toUserId, toUserId: req.user}, {new: false}).then(doc => {
            res.send(result);
        });
    })
})

module.exports = router;